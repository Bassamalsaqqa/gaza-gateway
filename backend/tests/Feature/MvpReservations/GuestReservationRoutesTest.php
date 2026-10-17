<?php

declare(strict_types=1);

namespace Tests\Feature\MvpReservations;

use App\Identity\Mfa\TotpSecret;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Sessions\PassengerSessionContext;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Sessions\StaffSessionStore;
use App\Mvp\Reservations\Exceptions\ReservationNotFoundException;
use App\Mvp\Reservations\GuestAccessCoordinator;
use App\Mvp\Reservations\ReservationCoordinator;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

final class GuestReservationRoutesTest extends TestCase
{
    private static ?string $passengerHash = null;
    private static ?string $staffHash = null;

    protected function setUp(): void
    {
        if (getenv('MVP_RESERVATIONS_GATE_OWNED') !== '1') {
            throw new \RuntimeException('Reservation tests require the disposable reservation gate.');
        }
        parent::setUp();
        config([
            'reservations.enabled' => true,
            'reservations.authority' => 'resolver',
            'mvp-mail.enabled' => true,
            'mvp-mail.identity_smtp_enabled' => true,
            'mvp-mail.allowed_hosts' => ['mailpit', '127.0.0.1', 'localhost'],
        ]);

        DB::beginTransaction();

        foreach (['GZA', 'AMM'] as $code) {
            DB::table('airports')->updateOrInsert(['code' => $code], [
                'airport_name_en' => 'Synthetic '.$code,
                'airport_name_ar' => 'Synthetic '.$code,
                'city_en' => 'Synthetic '.$code,
                'city_ar' => 'Synthetic '.$code,
                'country_en' => 'Synthetic country',
                'country_ar' => 'Synthetic country',
                'timezone' => 'Asia/Gaza',
                'block_minutes' => 60,
                'active' => true,
            ]);
        }
        if (!DB::table('aircraft')->where('id', 'ac-b738-1')->exists()) {
            DB::table('aircraft')->insert([
                'id' => 'ac-b738-1',
                'model' => 'Boeing 737-800',
                'registration_normalized' => 'T-MVPG',
                'active' => true,
                'rows' => 28,
                'letters_json' => json_encode(['A', 'B', 'C', 'D', 'E', 'F'], JSON_THROW_ON_ERROR),
                'aisle_after' => 3,
                'zones_json' => json_encode([['id' => 'economy', 'firstRow' => 1, 'lastRow' => 28]], JSON_THROW_ON_ERROR),
                'extra_legroom_rows_json' => json_encode([], JSON_THROW_ON_ERROR),
                'unavailable_json' => json_encode([], JSON_THROW_ON_ERROR),
            ]);
        } else {
            DB::table('aircraft')->where('id', 'ac-b738-1')->update([
                'rows' => 28,
                'zones_json' => json_encode([['id' => 'economy', 'firstRow' => 1, 'lastRow' => 28]], JSON_THROW_ON_ERROR),
            ]);
        }
        DB::table('schedules')->updateOrInsert(['id' => 'curated-flight'], [
            'number' => 'PS100',
            'direction' => 'out',
            'destination' => 'AMM',
            'days_json' => '[0,1,2,3,4,5,6]',
            'depart_time' => '08:00',
            'arrive_time' => '09:00',
            'aircraft' => 'Boeing 737-800',
            'aircraft_id' => 'ac-b738-1',
            'from_date' => '2026-01-01',
            'until_date' => '2027-12-31',
            'active' => true,
            'exceptions_json' => '[]',
        ]);
        if (!DB::table('meal_options')->where('id', 'meal-standard')->exists()) {
            DB::table('meal_options')->insert([
                'id' => 'meal-standard',
                'label_en' => 'Standard Meal',
                'label_ar' => 'وجبة قياسية',
                'active' => true,
                'order_num' => 0,
            ]);
        }
    }

    protected function tearDown(): void
    {
        if (DB::transactionLevel() > 0) {
            DB::rollBack();
        }
        parent::tearDown();
    }

    private function guestSession(): array
    {
        $receipt = app(PassengerSessionStore::class)->issueAnonymous();
        return [
            'id' => $receipt->sessionId,
            'cookie' => $receipt->getRawToken(),
            'csrf' => $receipt->getCsrfToken(),
        ];
    }

    private function passengerSession(): array
    {
        $id = (string) Str::uuid();
        self::$passengerHash ??= app(Argon2idPasswordHasher::class)->hash('Synthetic-passenger-pass-2026', 'passenger');
        DB::table('users')->insert([
            'id' => $id,
            'email' => 'passenger-'.$id.'@example.invalid',
            'password_hash' => self::$passengerHash,
            'status' => 'active',
            'credential_epoch' => 1,
            'email_verified_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);
        DB::table('passenger_profiles')->insert([
            'user_id' => $id,
            'first_name' => 'Synthetic',
            'last_name' => 'Passenger',
            'phone' => '+970599000000',
            'seat_preference' => 'window',
            'meal_preference' => 'standard',
            'newsletter' => true,
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);
        $receipt = app(PassengerSessionStore::class)->issueFull($id, 1);
        return [
            'owner' => $id,
            'id' => $receipt->sessionId,
            'cookie' => $receipt->getRawToken(),
            'csrf' => $receipt->getCsrfToken(),
        ];
    }

    private function staffSession(string $role = 'admin'): array
    {
        $id = (string) Str::uuid();
        self::$staffHash ??= app(Argon2idPasswordHasher::class)->hash('Synthetic-staff-password-2026', 'staff');
        DB::table('staff_users')->insert([
            'id' => $id,
            'username' => 'staff-'.$id,
            'email' => $id.'@example.invalid',
            'full_name_en' => 'Synthetic Staff',
            'full_name_ar' => 'Synthetic Staff',
            'password_hash' => self::$staffHash,
            'role' => $role,
            'status' => 'invited',
            'credential_epoch' => 1,
            'email_verified_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);
        DB::table('staff_mfa_credentials')->insert([
            'staff_id' => $id,
            'version' => 1,
            'encrypted_secret' => app(Encrypter::class)->encrypt(TotpSecret::generate()->revealBase32Secret()),
            'confirmed_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);
        DB::table('staff_users')->where('id', $id)->update(['status' => 'active', 'mfa_version' => 1]);
        $receipt = app(StaffSessionStore::class)->issueFull($id, 1, 1, new \DateTimeImmutable('-1 second'));
        return [
            'owner' => $id,
            'id' => $receipt->sessionId,
            'cookie' => $receipt->getRawToken(),
            'csrf' => $receipt->getCsrfToken(),
        ];
    }

    private function http(
        string $method,
        string $path,
        array $session = [],
        mixed $body = null,
        array $headers = [],
        ?string $raw = null,
        string $cookieName = 'gza_session'
    ): TestResponse {
        $this->flushHeaders();
        $cookieHeader = '';
        if (isset($session['cookie'])) {
            $cookieHeader = $cookieName.'='.$session['cookie'];
        }

        $server = [
            'HTTPS' => 'on',
            'SERVER_PORT' => 443,
            'HTTP_HOST' => '127.0.0.1:18090',
            'HTTP_ORIGIN' => 'https://127.0.0.1:5173',
            'HTTP_ACCEPT' => 'application/json',
            'CONTENT_TYPE' => 'application/json',
            'HTTP_COOKIE' => $cookieHeader,
            'HTTP_X_CSRF_TOKEN' => $session['csrf'] ?? '',
            'REMOTE_ADDR' => '2001:db8:'.bin2hex(random_bytes(2)).'::9',
        ];

        if (isset($headers['HTTPS']) && $headers['HTTPS'] === 'off' && !isset($headers['SERVER_PORT'])) {
            $server['SERVER_PORT'] = 80;
        }

        return $this->call(
            $method,
            (($headers['HTTPS'] ?? 'on') === 'off' ? 'http://' : 'https://').($headers['HTTP_HOST'] ?? '127.0.0.1:18090').'/api/v1'.$path,
            [],
            [],
            [],
            array_replace($server, $headers),
            $raw ?? ($body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR))
        );
    }

    private function sampleServiceId(string $date = '2026-12-20'): string
    {
        return 'svc1-'.rtrim(strtr(base64_encode('curated-flight'), '+/', '-_'), '=').'-'.$date;
    }

    private function sampleCommand(
        string $serviceId,
        string $email = 'guest@example.test',
        string $seat = '1A',
        ?string $meal = null,
        ?string $submissionId = null,
        string $phone = '+970 599 654321'
    ): array {
        return [
            'submissionId' => $submissionId ?? (string) Str::uuid(),
            'serviceId' => $serviceId,
            'passengers' => [
                [
                    'id' => 'p-1',
                    'type' => 'adult',
                    'firstName' => 'Tariq',
                    'lastName' => 'Al-Husseini',
                    'dob' => '1995-05-15',
                    'nationality' => 'Palestinian',
                    'document' => 'DOC-987654',
                    'seatCode' => $seat,
                    'mealId' => $meal,
                ],
            ],
            'contact' => [
                'email' => $email,
                'phone' => $phone,
            ],
        ];
    }

    public function test_csrf_https_origin_and_session_security_enforcement(): void
    {
        $session = $this->guestSession();

        // 1. Non-HTTPS rejected
        $resHttp = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => 'tariq@example.test'], ['HTTPS' => 'off']);
        $this->assertTrue(in_array($resHttp->status(), [400, 403], true));

        // 2. Disallowed origin rejected
        $resOrigin = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => 'tariq@example.test'], ['HTTP_ORIGIN' => 'https://evil-site.com']);
        $resOrigin->assertStatus(403);

        // 3. Missing session rejected
        $resNoSession = $this->http('POST', '/guest-reservations/email-challenges', [], ['email' => 'tariq@example.test']);
        $resNoSession->assertStatus(401);

        // 4. Missing CSRF token rejected
        $badCsrfSession = $session;
        $badCsrfSession['csrf'] = '';
        $resNoCsrf = $this->http('POST', '/guest-reservations/email-challenges', $badCsrfSession, ['email' => 'tariq@example.test']);
        $this->assertTrue(in_array($resNoCsrf->status(), [403, 419], true));

        // 5. Valid session, origin, https and csrf succeeds
        $resOk = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => 'tariq@example.test']);
        $resOk->assertStatus(202);
        $this->assertArrayHasKey('challengeId', $resOk->json('data'));
        $this->assertSame(43200, $resOk->json('data.expiresInSeconds'));
    }

    public function test_email_challenge_issuance_and_outbox_queueing(): void
    {
        $session = $this->guestSession();
        $email = 'verify-' . Str::random(8) . '@example.test';

        // Invalid email format returns 422
        $resInvalid = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => 'not-an-email']);
        $resInvalid->assertStatus(422);

        // Valid email returns 202
        $res = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => $email]);
        $res->assertStatus(202);
        $challengeId = $res->json('data.challengeId');
        $this->assertNotEmpty($challengeId);

        // Inspect database
        $challenge = DB::table('mvp_guest_email_challenges')->where('id', $challengeId)->first();
        $this->assertNotNull($challenge);
        $this->assertSame($session['id'], $challenge->session_id);
        $this->assertSame(strtolower($email), $challenge->email);
        $this->assertSame('issued', $challenge->state);
        $this->assertSame(0, (int) $challenge->failed_attempts);

        // Inspect queued mail outbox
        $outbox = DB::table('mvp_guest_mail_outbox')
            ->where('challenge_type', 'email_verification')
            ->where('challenge_id', $challengeId)
            ->first();
        $this->assertNotNull($outbox);
        $this->assertSame('queued', $outbox->status);
        $this->assertSame(strtolower($email), $outbox->recipient_email);

        // Decrypt payload and verify 6-digit code
        $payload = json_decode(app('encrypter')->decrypt($outbox->encrypted_payload), true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame('email_verification', $payload['type']);
        $this->assertMatchesRegularExpression('/\A[0-9]{6}\z/', $payload['code']);
    }

    public function test_guest_reservation_rejected_if_email_not_verified(): void
    {
        $session = $this->guestSession();
        $serviceId = $this->sampleServiceId();
        $unverifiedEmail = 'unverified-' . Str::random(8) . '@example.test';

        $cmd = $this->sampleCommand($serviceId, $unverifiedEmail, '2A');
        $res = $this->http('POST', '/guest-reservations', $session, $cmd);
        // Missing or unverified email proof deliberately returns 403 (not 422) to preserve ambiguous confirmation retry UUID
        $res->assertStatus(403);
    }

    public function test_code_failure_counter_persists_10_then_correct_still_rejected(): void
    {
        $session = $this->guestSession();
        $email = 'verify-' . Str::random(8) . '@example.test';

        // --- A. Email Verification Challenge Lockout ---
        $resChal = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => $email]);
        $challengeId = $resChal->json('data.challengeId');

        $outbox = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $challengeId)->first();
        $this->assertNotNull($outbox);
        $payload = json_decode(app('encrypter')->decrypt($outbox->encrypted_payload), true, 512, JSON_THROW_ON_ERROR);
        $actualCode = $payload['code'];
        $wrongCode = $actualCode === '123456' ? '654321' : '123456';

        // 9 wrong attempts increment counter and stay 'issued' (HTTP 422)
        for ($i = 1; $i <= 9; $i++) {
            if ($i === 5) {
                RateLimiter::clear(md5('guest_reservations_verifyguest_ver_session:guest:' . $session['id']));
                RateLimiter::clear(md5('guest_reservations_verifyguest_ver_ip:127.0.0.1'));
            }
            $res = $this->http('POST', '/guest-reservations/email-verifications', $session, [
                'challengeId' => $challengeId,
                'code' => $wrongCode,
            ]);
            $res->assertStatus(422);
            $failedCount = DB::table('mvp_guest_email_challenges')->where('id', $challengeId)->value('failed_attempts');
            $this->assertSame($i, (int) $failedCount);
            $state = DB::table('mvp_guest_email_challenges')->where('id', $challengeId)->value('state');
            $this->assertSame('issued', $state);
        }

        // 10th wrong attempt transitions state to 'exhausted'
        $res10 = $this->http('POST', '/guest-reservations/email-verifications', $session, [
            'challengeId' => $challengeId,
            'code' => $wrongCode,
        ]);
        $res10->assertStatus(422);
        $state10 = DB::table('mvp_guest_email_challenges')->where('id', $challengeId)->value('state');
        $this->assertSame('exhausted', $state10);
        $failed10 = DB::table('mvp_guest_email_challenges')->where('id', $challengeId)->value('failed_attempts');
        $this->assertSame(10, (int) $failed10);

        // Even with correct code, exhausted challenge fails closed (422) with persisted failed_attempts = 10
        $resCorrect = $this->http('POST', '/guest-reservations/email-verifications', $session, [
            'challengeId' => $challengeId,
            'code' => $actualCode,
        ]);
        $resCorrect->assertStatus(422);
        $stateAfter = DB::table('mvp_guest_email_challenges')->where('id', $challengeId)->value('state');
        $this->assertSame('exhausted', $stateAfter);
        $this->assertSame(10, (int) DB::table('mvp_guest_email_challenges')->where('id', $challengeId)->value('failed_attempts'));

        // --- B. Access Challenge Lockout ---
        $resValidChal = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => $email]);
        $vChalId = $resValidChal->json('data.challengeId');
        $vOutbox = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $vChalId)->first();
        $vCode = json_decode(app('encrypter')->decrypt($vOutbox->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];
        $this->http('POST', '/guest-reservations/email-verifications', $session, ['challengeId' => $vChalId, 'code' => $vCode])->assertOk();

        $serviceId = $this->sampleServiceId();
        $resCreate = $this->http('POST', '/guest-reservations', $session, $this->sampleCommand($serviceId, $email, '11A'));
        $resCreate->assertStatus(201);
        $ref = $resCreate->json('data.reservation.reference');

        // New session requests access challenge
        $sessionGuest2 = $this->guestSession();
        $resAccessChal = $this->http('POST', '/guest-reservations/access-challenges', $sessionGuest2, [
            'reference' => $ref,
            'email' => $email,
        ]);
        $resAccessChal->assertStatus(202);
        $accessChalId = $resAccessChal->json('data.challengeId');

        $accessOutbox = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $accessChalId)->first();
        $this->assertNotNull($accessOutbox);
        $accessPayload = json_decode(app('encrypter')->decrypt($accessOutbox->encrypted_payload), true, 512, JSON_THROW_ON_ERROR);
        $actualAccessCode = $accessPayload['code'];
        $wrongAccessCode = $actualAccessCode === '123456' ? '654321' : '123456';

        // 9 wrong access code attempts
        for ($i = 1; $i <= 9; $i++) {
            if ($i === 5) {
                RateLimiter::clear(md5('guest_reservations_verifyguest_ver_session:guest:' . $sessionGuest2['id']));
                RateLimiter::clear(md5('guest_reservations_verifyguest_ver_ip:127.0.0.1'));
            }
            $r = $this->http('POST', '/guest-reservations/access-verifications', $sessionGuest2, [
                'challengeId' => $accessChalId,
                'code' => $wrongAccessCode,
            ]);
            $r->assertStatus(422);
            $count = DB::table('mvp_guest_access_challenges')->where('id', $accessChalId)->value('failed_attempts');
            $this->assertSame($i, (int) $count);
            $this->assertSame('issued', DB::table('mvp_guest_access_challenges')->where('id', $accessChalId)->value('state'));
        }

        // 10th wrong attempt exhausts challenge
        $r10 = $this->http('POST', '/guest-reservations/access-verifications', $sessionGuest2, [
            'challengeId' => $accessChalId,
            'code' => $wrongAccessCode,
        ]);
        $r10->assertStatus(422);
        $this->assertSame('exhausted', DB::table('mvp_guest_access_challenges')->where('id', $accessChalId)->value('state'));
        $this->assertSame(10, (int) DB::table('mvp_guest_access_challenges')->where('id', $accessChalId)->value('failed_attempts'));

        // Correct code still rejected on exhausted access challenge
        $rCorrect = $this->http('POST', '/guest-reservations/access-verifications', $sessionGuest2, [
            'challengeId' => $accessChalId,
            'code' => $actualAccessCode,
        ]);
        $rCorrect->assertStatus(422);
    }

    public function test_one_time_consumed_and_session_binding(): void
    {
        $session = $this->guestSession();
        $email = 'verify-' . Str::random(8) . '@example.test';

        $resChal = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => $email]);
        $challengeId = $resChal->json('data.challengeId');

        $outbox = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $challengeId)->first();
        $this->assertNotNull($outbox);
        $payload = json_decode(app('encrypter')->decrypt($outbox->encrypted_payload), true, 512, JSON_THROW_ON_ERROR);
        $actualCode = $payload['code'];

        // 1. Valid code consumes challenge and issues grant
        $resVerify = $this->http('POST', '/guest-reservations/email-verifications', $session, [
            'challengeId' => $challengeId,
            'code' => $actualCode,
        ]);
        $resVerify->assertStatus(200);
        $this->assertTrue($resVerify->json('data.verified'));

        // Challenge marked consumed with consumed_at
        $challenge = DB::table('mvp_guest_email_challenges')->where('id', $challengeId)->first();
        $this->assertSame('consumed', $challenge->state);
        $this->assertNotNull($challenge->consumed_at);

        // Grant created bound to session
        $grant = DB::table('mvp_guest_email_grants')
            ->where('session_id', $session['id'])
            ->where('email', strtolower($email))
            ->first();
        $this->assertNotNull($grant);

        // 2. Consuming again fails closed (422)
        $resReVerify = $this->http('POST', '/guest-reservations/email-verifications', $session, [
            'challengeId' => $challengeId,
            'code' => $actualCode,
        ]);
        $resReVerify->assertStatus(422);

        // 3. Different session cannot use the verified challenge
        $otherSession = $this->guestSession();
        $resOtherVerify = $this->http('POST', '/guest-reservations/email-verifications', $otherSession, [
            'challengeId' => $challengeId,
            'code' => $actualCode,
        ]);
        $resOtherVerify->assertStatus(422);

        // 4. Different session cannot use session's email grant to create reservation (returns 403 forbidden)
        $serviceId = $this->sampleServiceId();
        $resOtherBooking = $this->http('POST', '/guest-reservations', $otherSession, $this->sampleCommand($serviceId, $email, '13A'));
        $resOtherBooking->assertStatus(403);
    }

    public function test_expired_grants_reject_booking_and_cancellation(): void
    {
        $session = $this->guestSession();
        $serviceId = $this->sampleServiceId();
        $email = 'expired-' . Str::random(8) . '@example.test';

        // 1. Verify email to establish grant
        $resChal = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => $email]);
        $chalId = $resChal->json('data.challengeId');
        $outbox = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $chalId)->first();
        $code = json_decode(app('encrypter')->decrypt($outbox->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];
        $this->http('POST', '/guest-reservations/email-verifications', $session, ['challengeId' => $chalId, 'code' => $code])->assertOk();

        // Expire the email grant manually in DB
        DB::table('mvp_guest_email_grants')
            ->where('session_id', $session['id'])
            ->where('email', strtolower($email))
            ->update(['expires_at' => CarbonImmutable::now()->subMinutes(10)->toIso8601String()]);

        // Attempt to create reservation with expired email grant -> 403 forbidden!
        $resExpBooking = $this->http('POST', '/guest-reservations', $session, $this->sampleCommand($serviceId, $email, '14A'));
        $resExpBooking->assertStatus(403);

        // 2. Fresh grant creates reservation successfully
        DB::table('mvp_guest_email_grants')
            ->where('session_id', $session['id'])
            ->where('email', strtolower($email))
            ->update(['expires_at' => CarbonImmutable::now()->addMinutes(30)->toIso8601String()]);

        $resBooking = $this->http('POST', '/guest-reservations', $session, $this->sampleCommand($serviceId, $email, '14A'));
        $resBooking->assertStatus(201);
        $ref = $resBooking->json('data.reservation.reference');

        // Expire the guest access grant manually in DB
        DB::table('mvp_guest_access_grants')
            ->where('session_id', $session['id'])
            ->where('reference', $ref)
            ->update(['expires_at' => CarbonImmutable::now()->subMinutes(10)->toIso8601String()]);

        // Attempt to cancel with expired access grant -> 404 rejected!
        $resExpCancel = $this->http('POST', '/guest-reservations/' . $ref . '/cancel', $session);
        $resExpCancel->assertStatus(404);

        // Reservation remains confirmed, seat claims intact
        $dbRes = DB::table('mvp_reservations')->where('reference', $ref)->first();
        $this->assertSame('confirmed', $dbRes->status);
        $claim = DB::table('mvp_reservation_seat_claims')->where('service_id', $serviceId)->where('seat_code', '14A')->first();
        $this->assertNotNull($claim);
    }

    public function test_optional_phone_stays_optional(): void
    {
        $session = $this->guestSession();
        $serviceId = $this->sampleServiceId();
        $email1 = 'opt-phone-1-' . Str::random(6) . '@example.test';

        // Verify email 1
        $r1 = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => $email1]);
        $c1 = json_decode(app('encrypter')->decrypt(DB::table('mvp_guest_mail_outbox')->where('challenge_id', $r1->json('data.challengeId'))->first()->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];
        $this->http('POST', '/guest-reservations/email-verifications', $session, ['challengeId' => $r1->json('data.challengeId'), 'code' => $c1])->assertOk();

        // 1. Create with empty string phone -> succeeds (201)
        $cmdEmptyPhone = $this->sampleCommand($serviceId, $email1, '15A', null, null, '');
        $res1 = $this->http('POST', '/guest-reservations', $session, $cmdEmptyPhone);
        $res1->assertStatus(201);
        $this->assertSame('', $res1->json('data.reservation.contact.phone'));
        $ref1 = $res1->json('data.reservation.reference');
        $dbRes1 = DB::table('mvp_reservations')->where('reference', $ref1)->first();
        $this->assertSame('', $dbRes1->contact_phone);

        // 2. Create with valid international phone -> succeeds (201)
        $email2 = 'opt-phone-2-' . Str::random(6) . '@example.test';
        $r2 = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => $email2]);
        $c2 = json_decode(app('encrypter')->decrypt(DB::table('mvp_guest_mail_outbox')->where('challenge_id', $r2->json('data.challengeId'))->first()->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];
        $this->http('POST', '/guest-reservations/email-verifications', $session, ['challengeId' => $r2->json('data.challengeId'), 'code' => $c2])->assertOk();

        $cmdValidPhone = $this->sampleCommand($serviceId, $email2, '15B', null, null, '+970 599 765432');
        $res2 = $this->http('POST', '/guest-reservations', $session, $cmdValidPhone);
        $res2->assertStatus(201);
        $this->assertSame('+970 599 765432', $res2->json('data.reservation.contact.phone'));

        // 3. Create with invalid phone format -> 422 rejected
        $email3 = 'opt-phone-3-' . Str::random(6) . '@example.test';
        $r3 = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => $email3]);
        $c3 = json_decode(app('encrypter')->decrypt(DB::table('mvp_guest_mail_outbox')->where('challenge_id', $r3->json('data.challengeId'))->first()->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];
        $this->http('POST', '/guest-reservations/email-verifications', $session, ['challengeId' => $r3->json('data.challengeId'), 'code' => $c3])->assertOk();

        $cmdBadPhone = $this->sampleCommand($serviceId, $email3, '15C', null, null, 'invalid-phone-format');
        $res3 = $this->http('POST', '/guest-reservations', $session, $cmdBadPhone);
        $res3->assertStatus(422);
    }

    public function test_valid_response_conforms_canonical_fields(): void
    {
        $session = $this->guestSession();
        $serviceId = $this->sampleServiceId();
        $email = 'canonical-' . Str::random(8) . '@example.test';

        $r = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => $email]);
        $c = json_decode(app('encrypter')->decrypt(DB::table('mvp_guest_mail_outbox')->where('challenge_id', $r->json('data.challengeId'))->first()->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];
        $this->http('POST', '/guest-reservations/email-verifications', $session, ['challengeId' => $r->json('data.challengeId'), 'code' => $c])->assertOk();

        $cmd = $this->sampleCommand($serviceId, $email, '16A', 'meal-standard');
        $res = $this->http('POST', '/guest-reservations', $session, $cmd);
        $res->assertStatus(201);

        $data = $res->json('data');
        $this->assertIsArray($data);
        $this->assertArrayHasKey('reservation', $data);
        $this->assertArrayHasKey('ticket', $data);

        $resObj = $data['reservation'];
        $this->assertMatchesRegularExpression('/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/', $resObj['id']);
        $this->assertMatchesRegularExpression('/\AGZA-[2-9A-HJ-KM-NP-Z]{4,6}\z/', $resObj['reference']);
        $this->assertSame('confirmed', $resObj['status']);
        $this->assertSame($serviceId, $resObj['serviceId']);
        $this->assertSame('PS100', $resObj['flightNumber']);
        $this->assertSame('2026-12-20', $resObj['date']);
        $this->assertSame('GZA', $resObj['originCode']);
        $this->assertSame('AMM', $resObj['destinationCode']);
        $this->assertSame('08:00', $resObj['departTime']);
        $this->assertSame('09:00', $resObj['arriveTime']);
        $this->assertSame(strtolower($email), strtolower($resObj['contact']['email']));
        $this->assertSame('+970 599 654321', $resObj['contact']['phone']);
        $this->assertNotEmpty($resObj['createdAt']);

        // Public reservation projection intentionally omits ownerUserId
        $this->assertArrayNotHasKey('ownerUserId', $resObj);

        // Passengers array verification
        $this->assertCount(1, $resObj['passengers']);
        $p = $resObj['passengers'][0];
        $this->assertSame('p-1', $p['id']);
        $this->assertSame('adult', $p['type']);
        $this->assertSame('Tariq', $p['firstName']);
        $this->assertSame('Al-Husseini', $p['lastName']);
        $this->assertSame('16A', $p['seatCode']);
        $this->assertSame('meal-standard', $p['mealId']);

        // Ticket verification
        $ticket = $data['ticket'];
        $this->assertSame($resObj['reference'], $ticket['reference']);
        $this->assertCount(1, $ticket['tickets']);
        $this->assertSame('16A', $ticket['tickets'][0]['passenger']['seatCode']);
    }

    public function test_null_guest_ownership_and_account_isolation(): void
    {
        $sessionGuest = $this->guestSession();
        $passengerUser = $this->passengerSession();
        $serviceId = $this->sampleServiceId();
        $guestEmail = 'guest-iso@example.test';
        $accountEmail = 'account-iso@example.test';

        // 1. Guest creates reservation
        $r = $this->http('POST', '/guest-reservations/email-challenges', $sessionGuest, ['email' => $guestEmail]);
        $c = json_decode(app('encrypter')->decrypt(DB::table('mvp_guest_mail_outbox')->where('challenge_id', $r->json('data.challengeId'))->first()->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];
        $this->http('POST', '/guest-reservations/email-verifications', $sessionGuest, ['challengeId' => $r->json('data.challengeId'), 'code' => $c])->assertOk();

        $resGuest = $this->http('POST', '/guest-reservations', $sessionGuest, $this->sampleCommand($serviceId, $guestEmail, '17A'));
        $resGuest->assertStatus(201);
        $guestRef = $resGuest->json('data.reservation.reference');

        // Verify database: owner_user_id is strictly NULL
        $dbGuestRes = DB::table('mvp_reservations')->where('reference', $guestRef)->first();
        $this->assertNull($dbGuestRes->owner_user_id);

        // Authenticated user cannot view guest reservation via /reservations/{ref}
        $resAuthAttempt = $this->http('GET', '/reservations/' . $guestRef, $passengerUser);
        $resAuthAttempt->assertStatus(404);

        // Authenticated user listing does not include guest reservation
        $resAuthList = $this->http('GET', '/reservations', $passengerUser);
        $resAuthList->assertStatus(200);
        $refs = array_column($resAuthList->json('data.items') ?? [], 'reference');
        $this->assertNotContains($guestRef, $refs);

        // Admin wire projection correctly exposes ownerUserId: null for guest
        $adminStaff = $this->staffSession();
        $resAdminShow = $this->http('GET', '/admin/reservations/' . $guestRef, $adminStaff, null, [], null, 'gza_staff_session');
        $resAdminShow->assertStatus(200);
        $this->assertNull($resAdminShow->json('data.reservation.ownerUserId'));

        // 2. Authenticated passenger creates reservation
        $resAuth = $this->http('POST', '/reservations', $passengerUser, $this->sampleCommand($serviceId, $accountEmail, '17B'));
        $resAuth->assertStatus(201);
        $authRef = $resAuth->json('data.reservation.reference');

        // Verify database: owner_user_id is passengerUser['owner']
        $dbAuthRes = DB::table('mvp_reservations')->where('reference', $authRef)->first();
        $this->assertSame($passengerUser['owner'], $dbAuthRes->owner_user_id);

        // Guest cannot view account reservation without access challenge
        $this->http('GET', '/guest-reservations/' . $authRef, $sessionGuest)->assertStatus(404);

        // Guest requests access challenge using ref + email
        $resChal = $this->http('POST', '/guest-reservations/access-challenges', $sessionGuest, [
            'reference' => $authRef,
            'email' => $accountEmail,
        ]);
        $resChal->assertStatus(202);
        $chalId = $resChal->json('data.challengeId');
        $code = json_decode(app('encrypter')->decrypt(DB::table('mvp_guest_mail_outbox')->where('challenge_id', $chalId)->first()->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];

        $this->http('POST', '/guest-reservations/access-verifications', $sessionGuest, [
            'challengeId' => $chalId,
            'code' => $code,
        ])->assertOk();

        // Guest can now view account reservation
        $this->http('GET', '/guest-reservations/' . $authRef, $sessionGuest)->assertStatus(200);

        // CRITICAL: Account ownership in mvp_reservations remains intact!
        $dbAuthResAfter = DB::table('mvp_reservations')->where('reference', $authRef)->first();
        $this->assertSame($passengerUser['owner'], $dbAuthResAfter->owner_user_id);
    }

    public function test_guest_reservation_idempotent_replay_and_mismatched_payload(): void
    {
        $session = $this->guestSession();
        $serviceId = $this->sampleServiceId();
        $email = 'guest-' . Str::random(8) . '@example.test';

        // Verify email
        $resChal = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => $email]);
        $outbox = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $resChal->json('data.challengeId'))->first();
        $code = json_decode(app('encrypter')->decrypt($outbox->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];
        $this->http('POST', '/guest-reservations/email-verifications', $session, ['challengeId' => $resChal->json('data.challengeId'), 'code' => $code])->assertOk();

        $submissionId = (string) Str::uuid();
        $cmd = $this->sampleCommand($serviceId, $email, '18A', null, $submissionId);

        // First submission creates reservation (201)
        $res1 = $this->http('POST', '/guest-reservations', $session, $cmd);
        $res1->assertStatus(201);
        $ref1 = $res1->json('data.reservation.reference');

        // Replay exact same payload returns 200 with identical reference
        $res2 = $this->http('POST', '/guest-reservations', $session, $cmd);
        $res2->assertStatus(200);
        $this->assertSame($ref1, $res2->json('data.reservation.reference'));

        // Replay same submissionId with changed payload returns 409 conflict
        $cmdChanged = $cmd;
        $cmdChanged['passengers'][0]['seatCode'] = '18B';
        $resConflict = $this->http('POST', '/guest-reservations', $session, $cmdChanged);
        $resConflict->assertStatus(409);
    }

    public function test_guest_seat_collision_with_other_guest_and_authenticated_reservation(): void
    {
        $sessionA = $this->guestSession();
        $sessionB = $this->guestSession();
        $passengerUser = $this->passengerSession();
        $serviceId = $this->sampleServiceId();

        // 1. Session A books 19A as guest
        $emailA = 'guest-a@example.test';
        $resChalA = $this->http('POST', '/guest-reservations/email-challenges', $sessionA, ['email' => $emailA]);
        $codeA = json_decode(app('encrypter')->decrypt(DB::table('mvp_guest_mail_outbox')->where('challenge_id', $resChalA->json('data.challengeId'))->first()->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];
        $this->http('POST', '/guest-reservations/email-verifications', $sessionA, ['challengeId' => $resChalA->json('data.challengeId'), 'code' => $codeA])->assertOk();
        $this->http('POST', '/guest-reservations', $sessionA, $this->sampleCommand($serviceId, $emailA, '19A'))->assertStatus(201);

        // 2. Session B attempts to book 19A as guest -> 409 conflict
        $emailB = 'guest-b@example.test';
        $resChalB = $this->http('POST', '/guest-reservations/email-challenges', $sessionB, ['email' => $emailB]);
        $codeB = json_decode(app('encrypter')->decrypt(DB::table('mvp_guest_mail_outbox')->where('challenge_id', $resChalB->json('data.challengeId'))->first()->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];
        $this->http('POST', '/guest-reservations/email-verifications', $sessionB, ['challengeId' => $resChalB->json('data.challengeId'), 'code' => $codeB])->assertOk();
        $resCollGuest = $this->http('POST', '/guest-reservations', $sessionB, $this->sampleCommand($serviceId, $emailB, '19A'));
        $resCollGuest->assertStatus(409);

        // 3. Authenticated passenger books 19B
        $this->http('POST', '/reservations', $passengerUser, $this->sampleCommand($serviceId, 'passenger@example.invalid', '19B'))->assertStatus(201);

        // 4. Session B attempts to book 19B as guest -> 409 conflict
        $resCollAuth = $this->http('POST', '/guest-reservations', $sessionB, $this->sampleCommand($serviceId, $emailB, '19B'));
        $resCollAuth->assertStatus(409);
    }

    public function test_access_challenge_decoy_uniformity_anti_enumeration(): void
    {
        $session = $this->guestSession();
        $serviceId = $this->sampleServiceId();
        $email = 'target@example.test';

        // Create genuine guest reservation
        $resChal = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => $email]);
        $code = json_decode(app('encrypter')->decrypt(DB::table('mvp_guest_mail_outbox')->where('challenge_id', $resChal->json('data.challengeId'))->first()->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];
        $this->http('POST', '/guest-reservations/email-verifications', $session, ['challengeId' => $resChal->json('data.challengeId'), 'code' => $code])->assertOk();
        $created = $this->http('POST', '/guest-reservations', $session, $this->sampleCommand($serviceId, $email, '20A'))->json('data');
        $realRef = $created['reservation']['reference'];

        $newSession = $this->guestSession();

        // Genuine access challenge
        $resGenuine = $this->http('POST', '/guest-reservations/access-challenges', $newSession, [
            'reference' => $realRef,
            'email' => $email,
        ]);
        $resGenuine->assertStatus(202);
        $this->assertArrayHasKey('challengeId', $resGenuine->json('data'));
        $this->assertSame(43200, $resGenuine->json('data.expiresInSeconds'));
        $genuineChallengeId = $resGenuine->json('data.challengeId');

        // Genuine outbox mail exists
        $this->assertTrue(DB::table('mvp_guest_mail_outbox')->where('challenge_id', $genuineChallengeId)->exists());

        // Decoy 1: Non-existent reference
        $resDecoy1 = $this->http('POST', '/guest-reservations/access-challenges', $newSession, [
            'reference' => 'GZA-9999',
            'email' => $email,
        ]);
        $resDecoy1->assertStatus(202);
        $this->assertArrayHasKey('challengeId', $resDecoy1->json('data'));
        $this->assertSame(43200, $resDecoy1->json('data.expiresInSeconds'));
        $decoy1Id = $resDecoy1->json('data.challengeId');

        // Decoy 1 does NOT queue an outbox email
        $this->assertFalse(DB::table('mvp_guest_mail_outbox')->where('challenge_id', $decoy1Id)->exists());

        // Decoy 2: Real reference, but wrong email
        $resDecoy2 = $this->http('POST', '/guest-reservations/access-challenges', $newSession, [
            'reference' => $realRef,
            'email' => 'wrong@example.test',
        ]);
        $resDecoy2->assertStatus(202);
        $this->assertArrayHasKey('challengeId', $resDecoy2->json('data'));
        $this->assertSame(43200, $resDecoy2->json('data.expiresInSeconds'));
        $decoy2Id = $resDecoy2->json('data.challengeId');
        $this->assertFalse(DB::table('mvp_guest_mail_outbox')->where('challenge_id', $decoy2Id)->exists());

        // Verifying decoys always fails closed (422) regardless of code
        $this->http('POST', '/guest-reservations/access-verifications', $newSession, ['challengeId' => $decoy1Id, 'code' => '123456'])->assertStatus(422);
        $this->http('POST', '/guest-reservations/access-verifications', $newSession, ['challengeId' => $decoy2Id, 'code' => '123456'])->assertStatus(422);
    }

    public function test_access_challenge_code_verification_grants_access(): void
    {
        $sessionA = $this->guestSession();
        $sessionB = $this->guestSession();
        $serviceId = $this->sampleServiceId();
        $email = 'shared@example.test';

        // Session A creates reservation
        $resChal = $this->http('POST', '/guest-reservations/email-challenges', $sessionA, ['email' => $email]);
        $code = json_decode(app('encrypter')->decrypt(DB::table('mvp_guest_mail_outbox')->where('challenge_id', $resChal->json('data.challengeId'))->first()->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];
        $this->http('POST', '/guest-reservations/email-verifications', $sessionA, ['challengeId' => $resChal->json('data.challengeId'), 'code' => $code])->assertOk();
        $created = $this->http('POST', '/guest-reservations', $sessionA, $this->sampleCommand($serviceId, $email, '21A'))->json('data');
        $ref = $created['reservation']['reference'];

        // Session B cannot access initially
        $this->http('GET', '/guest-reservations/' . $ref, $sessionB)->assertStatus(404);

        // Session B initiates access challenge
        $resChalB = $this->http('POST', '/guest-reservations/access-challenges', $sessionB, [
            'reference' => $ref,
            'email' => $email,
        ]);
        $resChalB->assertStatus(202);
        $challengeId = $resChalB->json('data.challengeId');

        $outbox = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $challengeId)->first();
        $payload = json_decode(app('encrypter')->decrypt($outbox->encrypted_payload), true, 512, JSON_THROW_ON_ERROR);
        $accessCode = $payload['code'];
        $this->assertSame($ref, $payload['reference']);

        // Wrong code fails
        $this->http('POST', '/guest-reservations/access-verifications', $sessionB, [
            'challengeId' => $challengeId,
            'code' => '000000',
        ])->assertStatus(422);

        // Correct code succeeds
        $resVerify = $this->http('POST', '/guest-reservations/access-verifications', $sessionB, [
            'challengeId' => $challengeId,
            'code' => $accessCode,
        ]);
        $resVerify->assertStatus(200);
        $this->assertTrue($resVerify->json('data.verified'));
        $this->assertSame($ref, $resVerify->json('data.reference'));

        // Now Session B can access the reservation
        $resShow = $this->http('GET', '/guest-reservations/' . $ref, $sessionB);
        $resShow->assertStatus(200);
        $this->assertSame($ref, $resShow->json('data.reservation.reference'));
    }

    public function test_scoped_guest_actions_show_ticket_cancel(): void
    {
        $session = $this->guestSession();
        $serviceId = $this->sampleServiceId();
        $email = 'guest-ops@example.test';

        // Setup reservation
        $resChal = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => $email]);
        $code = json_decode(app('encrypter')->decrypt(DB::table('mvp_guest_mail_outbox')->where('challenge_id', $resChal->json('data.challengeId'))->first()->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];
        $this->http('POST', '/guest-reservations/email-verifications', $session, ['challengeId' => $resChal->json('data.challengeId'), 'code' => $code])->assertOk();
        $created = $this->http('POST', '/guest-reservations', $session, $this->sampleCommand($serviceId, $email, '22A'))->json('data');
        $ref = $created['reservation']['reference'];

        // 1. GET show
        $resShow = $this->http('GET', '/guest-reservations/' . $ref, $session);
        $resShow->assertStatus(200);
        $this->assertSame($ref, $resShow->json('data.reservation.reference'));
        $this->assertSame('no-store, private', $resShow->headers->get('Cache-Control'));
        $this->assertSame('strict-origin-when-cross-origin', $resShow->headers->get('Referrer-Policy'));

        // 2. GET ticket
        $resTicket = $this->http('GET', '/guest-reservations/' . $ref . '/ticket', $session);
        $resTicket->assertStatus(200);
        $this->assertArrayHasKey('tickets', $resTicket->json('data'));
        $this->assertCount(1, $resTicket->json('data.tickets'));
        $this->assertSame($ref, $resTicket->json('data.reference'));

        // 3. POST cancel
        $resCancel = $this->http('POST', '/guest-reservations/' . $ref . '/cancel', $session);
        $resCancel->assertStatus(200);
        $this->assertSame('cancelled', $resCancel->json('data.status'));
        $this->assertTrue($resCancel->json('data.changed'));
        $this->assertNotNull($resCancel->json('data.cancelledAt'));

        // Verify seats released in DB
        $claimCount = DB::table('mvp_reservation_seat_claims')->where('service_id', $serviceId)->where('seat_code', '22A')->count();
        $this->assertSame(0, $claimCount);

        // Re-cancelling returns changed = false
        $resReCancel = $this->http('POST', '/guest-reservations/' . $ref . '/cancel', $session);
        $resReCancel->assertStatus(200);
        $this->assertFalse($resReCancel->json('data.changed'));
    }

    public function test_cross_session_isolation_and_unauthorized_access(): void
    {
        $sessionA = $this->guestSession();
        $sessionB = $this->guestSession();
        $serviceId = $this->sampleServiceId();
        $email = 'isolated@example.test';

        // Session A creates reservation
        $resChal = $this->http('POST', '/guest-reservations/email-challenges', $sessionA, ['email' => $email]);
        $code = json_decode(app('encrypter')->decrypt(DB::table('mvp_guest_mail_outbox')->where('challenge_id', $resChal->json('data.challengeId'))->first()->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];
        $this->http('POST', '/guest-reservations/email-verifications', $sessionA, ['challengeId' => $resChal->json('data.challengeId'), 'code' => $code])->assertOk();
        $created = $this->http('POST', '/guest-reservations', $sessionA, $this->sampleCommand($serviceId, $email, '23A'))->json('data');
        $ref = $created['reservation']['reference'];

        // Session B cannot show, ticket, or cancel
        $this->http('GET', '/guest-reservations/' . $ref, $sessionB)->assertStatus(404);
        $this->http('GET', '/guest-reservations/' . $ref . '/ticket', $sessionB)->assertStatus(404);
        $this->http('POST', '/guest-reservations/' . $ref . '/cancel', $sessionB)->assertStatus(404);
    }

    public function test_cancellation_reauthorizes_after_locks_and_requires_fresh_grant(): void
    {
        $session = $this->guestSession();
        $serviceId = $this->sampleServiceId();
        $email = 'reauth-' . Str::random(8) . '@example.test';

        // 1. Create reservation
        $resChal = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => $email]);
        $code = json_decode(app('encrypter')->decrypt(DB::table('mvp_guest_mail_outbox')->where('challenge_id', $resChal->json('data.challengeId'))->first()->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];
        $this->http('POST', '/guest-reservations/email-verifications', $session, ['challengeId' => $resChal->json('data.challengeId'), 'code' => $code])->assertOk();
        $created = $this->http('POST', '/guest-reservations', $session, $this->sampleCommand($serviceId, $email, '24A'))->json('data');
        $ref = $created['reservation']['reference'];

        $coordinator = app(GuestAccessCoordinator::class);
        $sessionContext = app(PassengerSessionStore::class)->read($session['cookie']);
        $this->assertNotNull($sessionContext);

        // 2. Simulated reauthorization failure in authorize closure throws 401
        $badAuthorize = function (): PassengerSessionContext {
            throw new HttpException(401);
        };
        try {
            $coordinator->cancelReservation($ref, $sessionContext, $badAuthorize);
            $this->fail('Expected HttpException 401');
        } catch (HttpException $e) {
            $this->assertSame(401, $e->getStatusCode());
        }

        // Reservation remains confirmed
        $this->assertSame('confirmed', DB::table('mvp_reservations')->where('reference', $ref)->value('status'));

        // 3. Invalidate proof at the post-lock authorization boundary. This proves
        // the fresh grant check follows authorization; it is not a contention test.
        $grantBackup = DB::table('mvp_guest_access_grants')->where('reference', $ref)->first();

        $expireDuringAuthorization = function () use ($sessionContext, $ref): PassengerSessionContext {
            DB::table('mvp_guest_access_grants')->where('reference', $ref)
                ->update(['expires_at' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 SECOND)')]);
            return $sessionContext;
        };

        $validAuthorize = function () use ($sessionContext): PassengerSessionContext {
            return $sessionContext;
        };

        try {
            $coordinator->cancelReservation($ref, $sessionContext, $expireDuringAuthorization);
            $this->fail('Expected ReservationNotFoundException');
        } catch (ReservationNotFoundException) {
            // Expected fail-closed behavior
        }
        $this->assertSame('confirmed', DB::table('mvp_reservations')->where('reference', $ref)->value('status'));
        $this->assertTrue(DB::table('mvp_reservation_seat_claims')->where('reservation_id', $created['reservation']['id'])->exists());

        // 4. The failed cancellation rolls back proof expiry; restore explicitly.
        DB::table('mvp_guest_access_grants')->where('id', $grantBackup->id)
            ->update(['expires_at' => $grantBackup->expires_at]);
        $result = $coordinator->cancelReservation($ref, $sessionContext, $validAuthorize);
        $this->assertSame('cancelled', $result['status']);
        $this->assertTrue($result['changed']);
        $this->assertSame('cancelled', DB::table('mvp_reservations')->where('reference', $ref)->value('status'));
    }

    public function test_guest_minimal_name_and_email_stores_null_optionals_and_idempotent_replay(): void
    {
        $session = $this->guestSession();
        $serviceId = $this->sampleServiceId();
        $email = 'minimal-guest-' . Str::random(8) . '@example.test';

        // 1. Verify guest email
        $resChal = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => $email]);
        $outbox = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $resChal->json('data.challengeId'))->first();
        $code = json_decode(app('encrypter')->decrypt($outbox->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];
        $this->http('POST', '/guest-reservations/email-verifications', $session, ['challengeId' => $resChal->json('data.challengeId'), 'code' => $code])->assertOk();

        // 2. Submit minimal command (single guest name, verified email, seatCode, no phone, no lastName/dob/nationality/document)
        $subId = (string) Str::uuid();
        $cmd = [
            'submissionId' => $subId,
            'serviceId' => $serviceId,
            'passengers' => [
                [
                    'id' => 'p-1',
                    'name' => 'Tariq Al-Husseini',
                    'seatCode' => '22A',
                ],
            ],
            'contact' => [
                'email' => $email,
            ],
        ];

        $res = $this->http('POST', '/guest-reservations', $session, $cmd);
        $res->assertStatus(201);
        $ref = $res->json('data.reservation.reference');
        $resId = $res->json('data.reservation.id');

        // 3. Inspect database: passenger optional columns are canonically NULL
        $dbPassenger = DB::table('mvp_reservation_passengers')->where('reservation_id', $resId)->first();
        $this->assertNotNull($dbPassenger);
        $this->assertSame('Tariq Al-Husseini', $dbPassenger->first_name);
        $this->assertNull($dbPassenger->last_name);
        $this->assertNull($dbPassenger->dob);
        $this->assertNull($dbPassenger->nationality);
        $this->assertNull($dbPassenger->document);
        $this->assertSame('adult', $dbPassenger->type);
        $this->assertSame('22A', $dbPassenger->seat_code);

        // 4. Response projection reflects null lastName and omitted phone
        $this->assertSame('Tariq Al-Husseini', $res->json('data.reservation.passengers.0.firstName'));
        $this->assertNull($res->json('data.reservation.passengers.0.lastName'));
        $this->assertNull($res->json('data.ticket.tickets.0.passenger.lastName'));
        $this->assertNull($res->json('data.ticket.tickets.0.passenger.nationality'));

        // 5. Replay exact same minimal payload returns 200 with identical reference
        $resReplay = $this->http('POST', '/guest-reservations', $session, $cmd);
        $resReplay->assertStatus(200);
        $this->assertSame($ref, $resReplay->json('data.reservation.reference'));
        $this->assertNull($resReplay->json('data.reservation.passengers.0.lastName'));

        // 6. Malformed optional DOB rejected with 422
        $email2 = 'bad-dob-' . Str::random(8) . '@example.test';
        $r2 = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => $email2]);
        $c2 = json_decode(app('encrypter')->decrypt(DB::table('mvp_guest_mail_outbox')->where('challenge_id', $r2->json('data.challengeId'))->first()->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];
        $this->http('POST', '/guest-reservations/email-verifications', $session, ['challengeId' => $r2->json('data.challengeId'), 'code' => $c2])->assertOk();

        $cmdBadDob = [
            'submissionId' => (string) Str::uuid(),
            'serviceId' => $serviceId,
            'passengers' => [
                [
                    'id' => 'p-1',
                    'name' => 'Tariq Al-Husseini',
                    'seatCode' => '22B',
                    'dob' => '2000-02-30',
                ],
            ],
            'contact' => [
                'email' => $email2,
            ],
        ];
        $this->http('POST', '/guest-reservations', $session, $cmdBadDob)->assertStatus(422);

        // 7. Unknown key in guest command rejected with 422
        $cmdBadKey = [
            'submissionId' => (string) Str::uuid(),
            'serviceId' => $serviceId,
            'passengers' => [
                [
                    'id' => 'p-1',
                    'name' => 'Tariq Al-Husseini',
                    'seatCode' => '22C',
                    'untrusted' => 1,
                ],
            ],
            'contact' => [
                'email' => $email2,
            ],
        ];
        $this->http('POST', '/guest-reservations', $session, $cmdBadKey)->assertStatus(422);
    }

    public function test_fresh_session_can_redeem_unconsumed_challenge_and_grant_is_bound_to_new_session(): void
    {
        $session1 = $this->guestSession();
        $email = 'fresh-sess-' . Str::random(8) . '@example.test';

        // Session 1 requests email challenge
        $resChal = $this->http('POST', '/guest-reservations/email-challenges', $session1, ['email' => $email]);
        $resChal->assertStatus(202);
        $challengeId = $resChal->json('data.challengeId');

        $outbox = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $challengeId)->first();
        $this->assertNotNull($outbox);
        $payload = json_decode(app('encrypter')->decrypt($outbox->encrypted_payload), true, 512, JSON_THROW_ON_ERROR);
        $actualCode = $payload['code'];

        // Session 1 expires / is abandoned
        DB::table('passenger_sessions')->where('id', $session1['id'])->update([
            'issued_at' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 2 HOUR)'),
            'idle_expires_at' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 HOUR)'),
            'absolute_expires_at' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 HOUR)'),
        ]);

        // User arrives with Session 2 (completely fresh live anonymous session)
        $session2 = $this->guestSession();
        $resVerify = $this->http('POST', '/guest-reservations/email-verifications', $session2, [
            'challengeId' => $challengeId,
            'code' => $actualCode,
        ]);
        $resVerify->assertStatus(200);
        $this->assertTrue($resVerify->json('data.verified'));

        // Challenge is marked consumed
        $challengeRow = DB::table('mvp_guest_email_challenges')->where('id', $challengeId)->first();
        $this->assertSame('consumed', $challengeRow->state);

        // Grant is bound strictly to Session 2 (the new fresh session)
        $grant2 = DB::table('mvp_guest_email_grants')
            ->where('session_id', $session2['id'])
            ->where('email', strtolower($email))
            ->first();
        $this->assertNotNull($grant2);

        // Session 2 can immediately complete booking
        $serviceId = $this->sampleServiceId();
        $resBooking = $this->http('POST', '/guest-reservations', $session2, $this->sampleCommand($serviceId, $email, '14A'));
        $resBooking->assertStatus(201);

        // Session 1 (even if resurrected) or another Session 3 has no grant
        $session3 = $this->guestSession();
        $resBooking3 = $this->http('POST', '/guest-reservations', $session3, $this->sampleCommand($serviceId, $email, '14B'));
        $resBooking3->assertStatus(403);
    }

    public function test_fresh_session_access_challenge_redemption_and_management(): void
    {
        $session1 = $this->guestSession();
        $email = 'access-fresh-' . Str::random(8) . '@example.test';

        // Book reservation as guest
        $vChal = $this->http('POST', '/guest-reservations/email-challenges', $session1, ['email' => $email]);
        $vId = $vChal->json('data.challengeId');
        $outbox1 = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $vId)->first();
        $vCode = json_decode(app('encrypter')->decrypt($outbox1->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];
        $this->http('POST', '/guest-reservations/email-verifications', $session1, ['challengeId' => $vId, 'code' => $vCode])->assertOk();

        $serviceId = $this->sampleServiceId();
        $resCreate = $this->http('POST', '/guest-reservations', $session1, $this->sampleCommand($serviceId, $email, '15A'));
        $resCreate->assertStatus(201);
        $ref = $resCreate->json('data.reservation.reference');

        // Session 2 requests access challenge for reference
        $session2 = $this->guestSession();
        $resChal = $this->http('POST', '/guest-reservations/access-challenges', $session2, [
            'reference' => $ref,
            'email' => $email,
        ]);
        $resChal->assertStatus(202);
        $accessChalId = $resChal->json('data.challengeId');

        $outbox2 = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $accessChalId)->first();
        $this->assertNotNull($outbox2);
        $actualAccessCode = json_decode(app('encrypter')->decrypt($outbox2->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];

        // Session 3 (fresh session on phone or new browser tab) redeems access challenge
        $session3 = $this->guestSession();
        $resVerify = $this->http('POST', '/guest-reservations/access-verifications', $session3, [
            'challengeId' => $accessChalId,
            'code' => $actualAccessCode,
        ]);
        $resVerify->assertStatus(200);
        $this->assertTrue($resVerify->json('data.verified'));
        $this->assertSame($ref, $resVerify->json('data.reference'));

        // Session 3 can view detail, ticket, and cancel
        $this->http('GET', "/guest-reservations/{$ref}", $session3)->assertOk();
        $this->http('GET', "/guest-reservations/{$ref}/ticket", $session3)->assertOk();

        // But Session 4 cannot access without grant
        $session4 = $this->guestSession();
        $this->http('GET', "/guest-reservations/{$ref}", $session4)->assertStatus(404);
    }

    public function test_single_use_atomic_consume_and_replay_rejection(): void
    {
        $session = $this->guestSession();
        $email = 'double-verify-' . Str::random(8) . '@example.test';

        $resChal = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => $email]);
        $challengeId = $resChal->json('data.challengeId');

        $outbox = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $challengeId)->first();
        $payload = json_decode(app('encrypter')->decrypt($outbox->encrypted_payload), true, 512, JSON_THROW_ON_ERROR);
        $code = $payload['code'];

        // First verification succeeds
        $res1 = $this->http('POST', '/guest-reservations/email-verifications', $session, [
            'challengeId' => $challengeId,
            'code' => $code,
        ]);
        $res1->assertStatus(200);

        // Immediate second verification fails closed with 422 (single-use consumed)
        $res2 = $this->http('POST', '/guest-reservations/email-verifications', $session, [
            'challengeId' => $challengeId,
            'code' => $code,
        ]);
        $res2->assertStatus(422);
    }

    public function test_wrong_code_attempts_persist_across_sessions_and_exhaust_at_10(): void
    {
        $session1 = $this->guestSession();
        $email = 'persist-wrong-' . Str::random(8) . '@example.test';

        $resChal = $this->http('POST', '/guest-reservations/email-challenges', $session1, ['email' => $email]);
        $challengeId = $resChal->json('data.challengeId');

        $outbox = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $challengeId)->first();
        $code = json_decode(app('encrypter')->decrypt($outbox->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];
        $wrongCode = $code === '123456' ? '654321' : '123456';

        // Session 2 makes 5 wrong attempts
        $session2 = $this->guestSession();
        for ($i = 1; $i <= 5; $i++) {
            $this->http('POST', '/guest-reservations/email-verifications', $session2, [
                'challengeId' => $challengeId,
                'code' => $wrongCode,
            ])->assertStatus(422);
        }
        $this->assertSame(5, (int) DB::table('mvp_guest_email_challenges')->where('id', $challengeId)->value('failed_attempts'));

        // Session 3 makes 5 wrong attempts (reaching 10 total)
        $session3 = $this->guestSession();
        for ($i = 6; $i <= 10; $i++) {
            $this->http('POST', '/guest-reservations/email-verifications', $session3, [
                'challengeId' => $challengeId,
                'code' => $wrongCode,
            ])->assertStatus(422);
        }
        $this->assertSame(10, (int) DB::table('mvp_guest_email_challenges')->where('id', $challengeId)->value('failed_attempts'));
        $this->assertSame('exhausted', DB::table('mvp_guest_email_challenges')->where('id', $challengeId)->value('state'));

        // Session 4 tries correct code, but challenge is exhausted
        $session4 = $this->guestSession();
        $this->http('POST', '/guest-reservations/email-verifications', $session4, [
            'challengeId' => $challengeId,
            'code' => $code,
        ])->assertStatus(422);
    }

    public function test_expired_challenge_verification_is_rejected_and_marked_expired(): void
    {
        $session = $this->guestSession();
        $email = 'expired-chal-' . Str::random(8) . '@example.test';

        // 1. Email verification challenge expired
        $resChal = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => $email]);
        $chalId = $resChal->json('data.challengeId');
        $outbox = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $chalId)->first();
        $code = json_decode(app('encrypter')->decrypt($outbox->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];

        // Force challenge to be expired (expires_at in past)
        DB::table('mvp_guest_email_challenges')
            ->where('id', $chalId)
            ->update(['expires_at' => CarbonImmutable::now()->subMinutes(5)->toIso8601String()]);

        // Attempt verification on expired challenge -> 422
        $resVerify = $this->http('POST', '/guest-reservations/email-verifications', $session, [
            'challengeId' => $chalId,
            'code' => $code,
        ]);
        $resVerify->assertStatus(422);

        // State is marked expired in DB
        $dbChal = DB::table('mvp_guest_email_challenges')->where('id', $chalId)->first();
        $this->assertSame('expired', $dbChal->state);

        // 2. Access challenge expired
        // First create a reservation with a valid grant
        $resValidChal = $this->http('POST', '/guest-reservations/email-challenges', $session, ['email' => $email]);
        $vChalId = $resValidChal->json('data.challengeId');
        $vOutbox = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $vChalId)->first();
        $vCode = json_decode(app('encrypter')->decrypt($vOutbox->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];
        $this->http('POST', '/guest-reservations/email-verifications', $session, ['challengeId' => $vChalId, 'code' => $vCode])->assertOk();

        $serviceId = $this->sampleServiceId();
        $resCreate = $this->http('POST', '/guest-reservations', $session, $this->sampleCommand($serviceId, $email, '16A'));
        $resCreate->assertStatus(201);
        $ref = $resCreate->json('data.reservation.reference');

        // Request access challenge
        $session2 = $this->guestSession();
        $resAccessChal = $this->http('POST', '/guest-reservations/access-challenges', $session2, [
            'reference' => $ref,
            'email' => $email,
        ]);
        $accessChalId = $resAccessChal->json('data.challengeId');
        $accessOutbox = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $accessChalId)->first();
        $accessCode = json_decode(app('encrypter')->decrypt($accessOutbox->encrypted_payload), true, 512, JSON_THROW_ON_ERROR)['code'];

        // Force access challenge to be expired
        DB::table('mvp_guest_access_challenges')
            ->where('id', $accessChalId)
            ->update(['expires_at' => CarbonImmutable::now()->subMinutes(5)->toIso8601String()]);

        // Attempt verification on expired access challenge -> 422
        $resAccessVerify = $this->http('POST', '/guest-reservations/access-verifications', $session2, [
            'challengeId' => $accessChalId,
            'code' => $accessCode,
        ]);
        $resAccessVerify->assertStatus(422);

        // State is marked expired in DB
        $dbAccessChal = DB::table('mvp_guest_access_challenges')->where('id', $accessChalId)->first();
        $this->assertSame('expired', $dbAccessChal->state);
    }
}
