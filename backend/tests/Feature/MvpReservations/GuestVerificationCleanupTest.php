<?php

declare(strict_types=1);

namespace Tests\Feature\MvpReservations;

use App\Identity\Sessions\AnonymousSessionCleanup;
use App\Identity\Sessions\PassengerSessionStore;
use App\Mvp\Reservations\GuestAccessCoordinator;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class GuestVerificationCleanupTest extends TestCase
{
    public function test_explicit_issuer_revocation_prevents_fresh_session_redemption(): void
    {
        if (getenv('MVP_RESERVATIONS_GATE_OWNED') !== '1') {
            throw new \RuntimeException('Requires owned disposable reservation gate.');
        }
        DB::beginTransaction();
        try {
            $store = app(PassengerSessionStore::class);
            $issuer = $store->read($store->issueAnonymous()->getRawToken());
            $recipient = $store->read($store->issueAnonymous()->getRawToken());
            $coordinator = app(GuestAccessCoordinator::class);
            $proof = $coordinator->createEmailChallenge('revoked-issuer@example.test', $issuer);
            $encrypted = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $proof['challengeId'])->value('encrypted_payload');
            $payload = json_decode(app('encrypter')->decrypt($encrypted), true, 512, JSON_THROW_ON_ERROR);
            DB::table('passenger_sessions')->where('id', $issuer->sessionId)->update(['revoked_at' => DB::raw('UTC_TIMESTAMP(6)')]);
            try {
                $coordinator->verifyEmailChallenge($proof['challengeId'], $payload['code'], $recipient);
                $this->fail('Revoked issuer proof must be rejected.');
            } catch (\App\Mvp\Reservations\Exceptions\ReservationValidationException) {
                $this->assertFalse($coordinator->isEmailVerified($recipient->sessionId, 'revoked-issuer@example.test'));
                $this->assertSame('issued', DB::table('mvp_guest_email_challenges')->where('id', $proof['challengeId'])->value('state'));
            }
        } finally {
            DB::rollBack();
        }
    }

    public function test_cleanup_preserves_a_fresh_sessions_grant_until_it_expires(): void
    {
        if (getenv('MVP_RESERVATIONS_GATE_OWNED') !== '1') {
            throw new \RuntimeException('Requires owned disposable reservation gate.');
        }
        DB::beginTransaction();
        try {
            $store = app(PassengerSessionStore::class);
            $issuer = $store->read($store->issueAnonymous()->getRawToken());
            $recipient = $store->read($store->issueAnonymous()->getRawToken());
            $this->assertNotNull($issuer);
            $this->assertNotNull($recipient);
            $coordinator = app(GuestAccessCoordinator::class);
            $email = 'cleanup-grant@example.test';
            $proof = $coordinator->createEmailChallenge($email, $issuer);
            $encrypted = DB::table('mvp_guest_mail_outbox')->where('challenge_id', $proof['challengeId'])->value('encrypted_payload');
            $payload = json_decode(app('encrypter')->decrypt($encrypted), true, 512, JSON_THROW_ON_ERROR);
            DB::table('passenger_sessions')->where('id', $issuer->sessionId)->update([
                'issued_at' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 2 HOUR)'),
                'absolute_expires_at' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 HOUR)'),
                'idle_expires_at' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 HOUR)'),
            ]);
            $this->assertTrue($coordinator->verifyEmailChallenge($proof['challengeId'], $payload['code'], $recipient)['verified']);
            $cleanup = app(AnonymousSessionCleanup::class);
            $cleanup->cleanRealmBatch('passenger');
            $this->assertTrue($coordinator->isEmailVerified($recipient->sessionId, $email));
            $this->assertTrue(DB::table('passenger_sessions')->where('id', $issuer->sessionId)->exists());
            DB::table('mvp_guest_email_grants')->where('challenge_id', $proof['challengeId'])->update([
                'expires_at' => DB::raw('DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 SECOND)'),
            ]);
            $cleanup->cleanRealmBatch('passenger');
            $this->assertFalse(DB::table('passenger_sessions')->where('id', $issuer->sessionId)->exists());
            $this->assertFalse($coordinator->isEmailVerified($recipient->sessionId, $email));
        } finally {
            DB::rollBack();
        }
    }
}
