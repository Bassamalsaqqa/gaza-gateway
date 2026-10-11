<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityBooking;

use App\Identity\Booking\BookingAccessCoordinator;
use App\Identity\Dispatch\OutboxPayload;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Sessions\{PassengerSessionStore, SessionReceipt};
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\Fixtures\IdentityPersistence\PersistenceTestFactory;
use Tests\TestCase;

final class BookingAccessTest extends TestCase
{
    private array $sessions = [];
    private array $bookings = [];
    private string $ip;
    private static ?string $hash = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ip = '2001:db8:' . bin2hex(random_bytes(2)) . ':' . bin2hex(random_bytes(2)) . '::13';
        config(['cors.allowed_origins' => ['https://127.0.0.1:5173'],
            'identity-guest.pepper_base64' => base64_encode(random_bytes(32)), 'identity-guest.pepper_version' => 1]);
    }

    protected function tearDown(): void
    {
        $this->assertDisposableDatabaseTarget();
        foreach ($this->bookings as $id) {
            $challenges = DB::table('booking_guest_challenges')->where('booking_id', $id)->pluck('id');
            DB::table('security_dispatch_outbox')->whereIn('booking_challenge_id', $challenges)
                ->update(['status' => 'scrubbed', 'encrypted_payload' => null, 'scrubbed_at' => DB::raw('clock_timestamp()')]);
            foreach (['booking_guest_grants', 'booking_receipt_grants'] as $table) {
                DB::table($table)->where('booking_id', $id)->whereNull('revoked_at')->update(['revoked_at' => DB::raw('clock_timestamp()')]);
            }
            DB::table('booking_claim_proofs')->where('booking_id', $id)->where('state', 'issued')
                ->update(['state' => 'revoked', 'revoked_at' => DB::raw('clock_timestamp()')]);
        }
        DB::table('booking_guest_challenges')->whereIn('session_id', $this->sessions)->where('state', 'issued')
            ->update(['state' => 'revoked', 'revoked_at' => DB::raw('clock_timestamp()')]);
        DB::table('passenger_sessions')->whereIn('id', $this->sessions)->whereNull('revoked_at')
            ->update(['revoked_at' => DB::raw('clock_timestamp()')]);
        parent::tearDown();
    }

    private function guestSession(?string $userId = null): SessionReceipt
    {
        $store = $this->app->make(PassengerSessionStore::class);
        $receipt = $userId === null ? $store->issueAnonymous() : $store->issueFull($userId, 1);
        $this->sessions[] = $receipt->sessionId; return $receipt;
    }

    private function user(): string
    {
        self::$hash ??= $this->app->make(Argon2idPasswordHasher::class)->hash('Synthetic-passenger-secret-2026', 'passenger');
        return PersistenceTestFactory::createUser(['password_hash' => self::$hash]);
    }

    private function booking(?string $owner = null): object
    {
        // Existing shared canonical fare is read-only; create only when absent in the guarded test DB.
        if (!DB::table('fare_products')->where('id', 'essential')->exists()) {
            PersistenceTestFactory::createFareProduct(['id' => 'essential']);
        }
        $id = PersistenceTestFactory::createBooking(['fare_id' => 'essential', 'owner_user_id' => $owner]);
        PersistenceTestFactory::createBookingPassenger(['booking_id' => $id]);
        $this->bookings[] = $id;
        return DB::table('bookings')->where('id', $id)->first();
    }

    private function request(string $path, SessionReceipt $session, array $input, array $overrides = []): TestResponse
    {
        $this->flushHeaders();
        return $this->call('POST', 'https://127.0.0.1:18090/api/v1' . $path, [], [], [], array_merge([
            'HTTPS' => 'on', 'SERVER_PORT' => 443, 'HTTP_HOST' => '127.0.0.1:18090', 'HTTP_ORIGIN' => 'https://127.0.0.1:5173',
            'HTTP_COOKIE' => 'gza_session=' . $session->getRawToken(), 'HTTP_X_CSRF_TOKEN' => $session->getCsrfToken(),
            'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json', 'REMOTE_ADDR' => $this->ip,
        ], $overrides), json_encode($input, JSON_THROW_ON_ERROR));
    }

    /** Synthetic persisted provider-acceptance fixture, NOT real mail delivery evidence. */
    private function acceptedCode(string $challengeId): string
    {
        $row = DB::table('security_dispatch_outbox')->where('booking_challenge_id', $challengeId)->first();
        $payload = OutboxPayload::fromJson($this->app->make(Encrypter::class)->decrypt($row->encrypted_payload));
        $bookingId = DB::table('booking_guest_challenges')->where('id', $challengeId)->value('booking_id');
        $this->assertSame(DB::table('bookings')->where('id', $bookingId)->value('contact_email'), $payload->getRecipient());
        DB::table('security_dispatch_outbox')->where('id', $row->id)->update(['status' => 'accepted',
            'provider_message_id' => 'synthetic-acceptance-' . Str::uuid(), 'accepted_at' => DB::raw('clock_timestamp()')]);
        DB::table('booking_guest_challenges')->where('id', $challengeId)->update(['dispatch_status' => 'accepted']);
        return $payload->getTokenOrCode();
    }

    public function test_guest_delivery_binding_hashed_grant_and_replay(): void
    {
        $booking = $this->booking(); $session = $this->guestSession();
        $created = $this->request('/bookings/' . $booking->pnr . '/challenge', $session, ['surname' => 'Al-Ghefari'])->assertStatus(202);
        $id = $created->json('data.challengeId'); $code = $this->acceptedCode($id);
        $verify = ['challengeId' => $id, 'code' => $code];
        $result = $this->request('/bookings/' . $booking->pnr . '/verify-challenge', $session, $verify)->assertOk();
        $token = $result->json('data.bookingToken');
        $this->assertSame(43, strlen($token));
        $grant = DB::table('booking_guest_grants')->where('token_digest', hash('sha256', $token))->first();
        $this->assertSame($booking->id, $grant->booking_id);
        $this->assertSame(900, strtotime($grant->expires_at) - strtotime($grant->issued_at));
        $this->assertSame(BookingAccessCoordinator::GUEST_ACTIONS, $result->json('data.allowedActions'));
        $this->request('/bookings/' . $booking->pnr . '/verify-challenge', $session, $verify)->assertStatus(401);
        $this->assertSame(1, DB::table('booking_guest_grants')->where('booking_id', $booking->id)->count());
    }

    public function test_decoys_and_undelivered_correct_codes_cannot_authorize(): void
    {
        $booking = $this->booking(); $session = $this->guestSession();
        $decoy = $this->request('/bookings/' . $booking->pnr . '/challenge', $session, ['surname' => 'Mismatch'])->assertStatus(202);
        $id = $decoy->json('data.challengeId');
        $this->assertNull(DB::table('booking_guest_challenges')->where('id', $id)->value('booking_id'));
        $this->assertFalse(DB::table('security_dispatch_outbox')->where('booking_challenge_id', $id)->exists());
        for ($i = 0; $i < 5; $i++) {
            $this->request('/bookings/' . $booking->pnr . '/verify-challenge', $session, ['challengeId' => $id, 'code' => '000000'])->assertStatus(401);
        }
        $this->assertSame('exhausted', DB::table('booking_guest_challenges')->where('id', $id)->value('state'));
        $real = $this->request('/bookings/' . $booking->pnr . '/challenge', $session, ['surname' => 'Al-Ghefari'])->assertStatus(202);
        $row = DB::table('security_dispatch_outbox')->where('booking_challenge_id', $real->json('data.challengeId'))->first();
        $payload = OutboxPayload::fromJson($this->app->make(Encrypter::class)->decrypt($row->encrypted_payload));
        $this->request('/bookings/' . $booking->pnr . '/verify-challenge', $session,
            ['challengeId' => $real->json('data.challengeId'), 'code' => $payload->getTokenOrCode()])->assertStatus(401);
        $this->assertSame(0, DB::table('booking_guest_grants')->where('booking_id', $booking->id)->count());
    }

    public function test_guest_csrf_session_reference_and_epoch_boundaries(): void
    {
        $booking = $this->booking(); $session = $this->guestSession(); $other = $this->guestSession();
        $path = '/bookings/' . $booking->pnr . '/challenge';
        $this->request($path, $session, ['surname' => 'Al-Ghefari'], ['HTTP_X_CSRF_TOKEN' => 'bad'])->assertStatus(403);
        $this->request($path, $session, ['surname' => 'Al-Ghefari'], ['HTTP_ORIGIN' => 'https://foreign.invalid'])->assertStatus(403);
        $this->request($path, $session, ['surname' => 'Al-Ghefari', 'email' => 'foreign@example.invalid'])->assertStatus(422);
        $created = $this->request($path, $session, ['surname' => 'Al-Ghefari'])->assertStatus(202);
        $id = $created->json('data.challengeId'); $code = $this->acceptedCode($id);
        $this->request('/bookings/' . $booking->pnr . '/verify-challenge', $other, ['challengeId' => $id, 'code' => $code])->assertStatus(401);
        $this->request('/bookings/NOBOOK01/verify-challenge', $session, ['challengeId' => $id, 'code' => $code])->assertStatus(401);
        DB::table('bookings')->where('id', $booking->id)->update(['security_epoch' => 2]);
        $this->request('/bookings/' . $booking->pnr . '/verify-challenge', $session, ['challengeId' => $id, 'code' => $code])->assertStatus(401);
        $this->assertSame(0, DB::table('booking_guest_grants')->where('booking_id', $booking->id)->count());
    }

    public function test_claim_is_session_bound_single_use_and_revokes_guest_authority(): void
    {
        $booking = $this->booking(); $user = $this->user(); $session = $this->guestSession($user);
        $guest = $this->guestSession();
        $g = $this->request('/bookings/' . $booking->pnr . '/challenge', $guest, ['surname' => 'Al-Ghefari'])->assertStatus(202);
        $gc = $this->acceptedCode($g->json('data.challengeId'));
        $this->request('/bookings/' . $booking->pnr . '/verify-challenge', $guest,
            ['challengeId' => $g->json('data.challengeId'), 'code' => $gc])->assertOk();
        $created = $this->request('/account/bookings/claim/challenge', $session, ['ref' => $booking->pnr, 'surname' => 'Al-Ghefari'])->assertStatus(202);
        $code = $this->acceptedCode($created->json('data.challengeId'));
        $verified = $this->request('/account/bookings/claim/verify', $session,
            ['challengeId' => $created->json('data.challengeId'), 'code' => $code])->assertOk();
        $input = ['ref' => $booking->pnr, 'claimProof' => $verified->json('data.claimProof')];
        $this->request('/account/bookings/claim', $this->guestSession($user), $input)->assertStatus(401);
        $this->request('/account/bookings/claim', $session, $input)->assertOk()->assertJsonPath('data.pnr', $booking->pnr);
        $this->assertSame($user, DB::table('bookings')->where('id', $booking->id)->value('owner_user_id'));
        $this->assertSame(2, DB::table('bookings')->where('id', $booking->id)->value('security_epoch'));
        $this->assertSame(0, DB::table('booking_guest_grants')->where('booking_id', $booking->id)->whereNull('revoked_at')->count());
        $this->request('/account/bookings/claim', $session, $input)->assertStatus(401);
    }

    public function test_foreign_ownership_conflict_preserves_owner_and_proof(): void
    {
        $owner = $this->user(); $booking = $this->booking($owner); $session = $this->guestSession($this->user());
        $created = $this->request('/account/bookings/claim/challenge', $session, ['ref' => $booking->pnr, 'surname' => 'Al-Ghefari'])->assertStatus(202);
        $code = $this->acceptedCode($created->json('data.challengeId'));
        $verified = $this->request('/account/bookings/claim/verify', $session,
            ['challengeId' => $created->json('data.challengeId'), 'code' => $code])->assertOk();
        $token = $verified->json('data.claimProof');
        $this->request('/account/bookings/claim', $session, ['ref' => $booking->pnr, 'claimProof' => $token])->assertStatus(409);
        $this->assertSame($owner, DB::table('bookings')->where('id', $booking->id)->value('owner_user_id'));
        $this->assertSame('issued', DB::table('booking_claim_proofs')->where('token_digest', hash('sha256', $token))->value('state'));
    }

    public function test_durable_challenge_budget(): void
    {
        $session = $this->guestSession(); $path = '/bookings/NOMATCH1/challenge';
        for ($i = 0; $i < 5; $i++) { $this->request($path, $session, ['surname' => 'Synthetic'])->assertStatus(202); }
        $this->request($path, $session, ['surname' => 'Synthetic'])->assertStatus(429)->assertHeader('Retry-After');
        $this->assertSame(5, DB::table('booking_guest_challenges')->where('session_id', $session->sessionId)->count());
    }

    public function test_real_wrong_surname_and_unknown_reference_share_bounded_response_floor(): void
    {
        $samples = ['real' => [], 'surname_decoy' => [], 'unknown_decoy' => []];
        foreach (range(0, 3) as $round) {
            $order = $round % 2 === 0 ? array_keys($samples) : array_reverse(array_keys($samples));
            foreach ($order as $kind) {
                $booking = $this->booking(); $session = $this->guestSession();
                $ref = $kind === 'unknown_decoy' ? 'UNKNOWN1' : $booking->pnr;
                $surname = $kind === 'surname_decoy' ? 'Mismatch' : 'Al-Ghefari';
                $start = hrtime(true);
                $response = $this->request('/bookings/' . $ref . '/challenge', $session, ['surname' => $surname])->assertStatus(202);
                $elapsed = (hrtime(true) - $start) / 1_000_000;
                $samples[$kind][] = round($elapsed, 2);
                $this->assertGreaterThanOrEqual(250, $elapsed);
                $this->assertLessThan(3000, $elapsed, 'Local timing fixture exceeded the documented bounded ordinary path.');
                $response->assertJsonPath('data.message', 'If the booking details match, verification instructions have been queued for dispatch.');
                $id = $response->json('data.challengeId');
                $row = DB::table('booking_guest_challenges')->where('id', $id)->first();
                $this->assertSame($kind === 'real' ? $booking->id : null, $row->booking_id);
                $this->assertSame($kind === 'real' ? 1 : 0,
                    DB::table('security_dispatch_outbox')->where('booking_challenge_id', $id)->count());
            }
        }
        // Only aggregate synthetic timings, never challenge IDs, PNRs, emails or OTPs.
        fwrite(STDOUT, 'Booking challenge timing milliseconds: ' . json_encode($samples, JSON_THROW_ON_ERROR) . PHP_EOL);
    }

    public function test_missing_pepper_fails_closed_before_any_proof_write(): void
    {
        config(['identity-guest.pepper_base64' => null]);
        $session = $this->guestSession();
        $this->request('/bookings/OTHER001/challenge', $session, ['surname' => 'Synthetic'])->assertStatus(503);
        $this->assertSame(0, DB::table('booking_guest_challenges')->where('session_id', $session->sessionId)->count());
    }

    public function test_two_php_processes_cannot_replay_guest_otp_or_ownership_proof(): void
    {
        $booking = $this->booking(); $guest = $this->guestSession();
        $created = $this->request('/bookings/' . $booking->pnr . '/challenge', $guest, ['surname' => 'Al-Ghefari'])->assertStatus(202);
        $id = $created->json('data.challengeId'); $code = $this->acceptedCode($id);
        $input = $this->raceInput('postVerifyGuestChallenge', ['challengeId' => $id, 'code' => $code], $booking->pnr, $guest);
        $this->assertSame(['ACCEPTED', 'DENIED'], \Tests\Fixtures\IdentityBooking\BookingAccessRace::run([$input, $input]));
        $this->assertSame(1, DB::table('booking_guest_grants')->where('booking_id', $booking->id)->count());
        $user = $this->user(); $full = $this->guestSession($user);
        $created = $this->request('/account/bookings/claim/challenge', $full, ['ref' => $booking->pnr, 'surname' => 'Al-Ghefari'])->assertStatus(202);
        $code = $this->acceptedCode($created->json('data.challengeId'));
        $verified = $this->request('/account/bookings/claim/verify', $full,
            ['challengeId' => $created->json('data.challengeId'), 'code' => $code])->assertOk();
        $input = $this->raceInput('postClaimBookingToAccount', ['ref' => $booking->pnr, 'claimProof' => $verified->json('data.claimProof')], null, $full);
        $this->assertSame(['ACCEPTED', 'DENIED'], \Tests\Fixtures\IdentityBooking\BookingAccessRace::run([$input, $input]));
        $this->assertSame($user, DB::table('bookings')->where('id', $booking->id)->value('owner_user_id'));
        $this->assertSame(2, DB::table('bookings')->where('id', $booking->id)->value('security_epoch'));
    }

    private function raceInput(string $operation, array $input, ?string $ref, SessionReceipt $session): array
    {
        return ['operation' => $operation, 'input' => $input, 'ref' => $ref, 'cookie' => $session->getRawToken(),
            'csrf' => $session->getCsrfToken(), 'requestId' => (string) Str::uuid(),
            'pepper' => config('identity-guest.pepper_base64'), 'ip' => $this->ip];
    }

    public function test_audit_failure_rolls_back_challenge_and_outbox_without_refunding_rate_budget(): void
    {
        $booking = $this->booking(); $session = $this->guestSession();
        $audit = $this->createMock(\App\Identity\Audit\AuditWriter::class);
        $audit->expects($this->once())->method('record')->willThrowException(new \RuntimeException('Synthetic audit failure'));
        $this->app->instance(\App\Identity\Audit\AuditWriter::class, $audit);
        $this->request('/bookings/' . $booking->pnr . '/challenge', $session, ['surname' => 'Al-Ghefari'])->assertStatus(500);
        $this->assertSame(0, DB::table('booking_guest_challenges')->where('session_id', $session->sessionId)->count());
        $this->assertSame(0, DB::table('security_dispatch_outbox')->whereIn('booking_challenge_id',
            DB::table('booking_guest_challenges')->where('booking_id', $booking->id)->select('id'))->count());
        $context = $this->app->make(PassengerSessionStore::class)->read($session->getRawToken());
        $charged = $this->app->make(\App\Identity\RateLimiting\DurableRateLimiter::class)->charge('booking', 'challenge',
            ['reference' => $booking->pnr, 'session_id' => $context->sessionId, 'ip' => $this->ip], 4);
        $this->assertTrue($charged->allowed);
        $denied = $this->app->make(\App\Identity\RateLimiting\DurableRateLimiter::class)->charge('booking', 'challenge',
            ['reference' => $booking->pnr, 'session_id' => $context->sessionId, 'ip' => $this->ip]);
        $this->assertFalse($denied->allowed);
    }

    public function test_receipt_transaction_hook_scope_bola_ttl_and_epoch_revocation(): void
    {
        $booking = $this->booking(); $foreign = $this->booking();
        $authority = $this->app->make(\App\Identity\Booking\BookingGrantAuthority::class);
        try { $authority->issueReceiptInsideTransaction($booking->id); $this->fail('Unowned receipt issuance accepted.'); }
        catch (\LogicException) { $this->assertSame(0, DB::table('booking_receipt_grants')->where('booking_id', $booking->id)->count()); }
        $receipt = DB::transaction(fn () => $authority->issueReceiptInsideTransaction($booking->id));
        $token = $receipt['receiptToken']; $hash = hash('sha256', $token);
        $row = DB::table('booking_receipt_grants')->where('token_digest', $hash)->first();
        $this->assertSame(600, strtotime($row->expires_at) - strtotime($row->issued_at));
        $this->assertSame($booking->id, $authority->withReceipt($booking->pnr, $token, fn ($b) => $b->id));
        foreach ([fn () => $authority->withGuest($booking->pnr, $token, 'getBookingByRef', fn () => true),
            fn () => $authority->withReceipt($foreign->pnr, $token, fn () => true)] as $invalid) {
            try { $invalid(); $this->fail('Foreign realm/reference grant accepted.'); }
            catch (\App\Identity\Booking\BookingAccessException) { $this->assertTrue(true); }
        }
        DB::table('booking_receipt_grants')->where('id', $row->id)->update(['expires_at' => DB::raw("issued_at + INTERVAL '601 seconds'")]);
        try { $authority->withReceipt($booking->pnr, $token, fn () => true); $this->fail('Overlong receipt grant accepted.'); }
        catch (\App\Identity\Booking\BookingAccessException) { $this->assertTrue(true); }
        DB::table('booking_receipt_grants')->where('id', $row->id)->update(['expires_at' => DB::raw("issued_at + INTERVAL '600 seconds'")]);
        DB::table('bookings')->where('id', $booking->id)->update(['security_epoch' => 2]);
        try { $authority->withReceipt($booking->pnr, $token, fn () => true); $this->fail('Old epoch accepted.'); }
        catch (\App\Identity\Booking\BookingAccessException) { $this->assertTrue(true); }
    }

    public function test_expired_challenge_is_denied_and_bounded_cleanup_erases_real_and_decoy_authority(): void
    {
        $booking = $this->booking(); $session = $this->guestSession();
        $real = $this->request('/bookings/' . $booking->pnr . '/challenge', $session, ['surname' => 'Al-Ghefari'])->assertStatus(202);
        $id = $real->json('data.challengeId'); $code = $this->acceptedCode($id);
        $decoy = $this->request('/bookings/NOMATCH2/challenge', $session, ['surname' => 'Mismatch'])->assertStatus(202);
        $ids = [$id, $decoy->json('data.challengeId')];
        DB::table('booking_guest_challenges')->whereIn('id', $ids)->update([
            'issued_at' => DB::raw("clock_timestamp() - INTERVAL '2 minutes'"), 'expires_at' => DB::raw("clock_timestamp() - INTERVAL '1 second'")]);
        $this->request('/bookings/' . $booking->pnr . '/verify-challenge', $session, ['challengeId' => $id, 'code' => $code])->assertStatus(401);
        $cleanup = new \App\Identity\Booking\BookingTransientCleanup(DB::connection());
        // Global bounded maintenance may first consume older owned test residues. Every call is bounded, never resets counters.
        for ($i = 0; $i < 20 && DB::table('booking_guest_challenges')->whereIn('id', $ids)->where('state', 'issued')->exists(); $i++) {
            $this->assertLessThanOrEqual(100, $cleanup->expire(100));
        }
        $this->assertSame(2, DB::table('booking_guest_challenges')->whereIn('id', $ids)->where('state', 'expired')->count());
        $this->assertNull(DB::table('security_dispatch_outbox')->where('booking_challenge_id', $id)->value('encrypted_payload'));
        $this->assertSame(0, DB::table('booking_guest_grants')->where('booking_id', $booking->id)->count());
    }
}
