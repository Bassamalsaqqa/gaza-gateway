<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Sessions\StaffSessionStore;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class SessionStoreLifecycleTest extends TestCase
{
    private PassengerSessionStore $passengerStore;
    private StaffSessionStore $staffStore;

    protected function setUp(): void
    {
        parent::setUp();
        $encrypter = $this->app->make(Encrypter::class);
        $this->passengerStore = new PassengerSessionStore(DB::connection(), $encrypter);
        $this->staffStore = new StaffSessionStore(DB::connection(), $encrypter);
    }

    public function test_passenger_anonymous_session_issue_read_and_revoke(): void
    {
        $receipt = $this->passengerStore->issueAnonymous(['ip' => '127.0.0.1']);

        $this->assertSame('passenger', $receipt->realm);
        $this->assertSame('anonymous', $receipt->authLevel);
        $this->assertNull($receipt->principalId);
        $this->assertNotEmpty($receipt->getRawToken());
        $this->assertNotEmpty($receipt->getCsrfToken());

        // Read session
        $context = $this->passengerStore->read($receipt->getRawToken());
        $this->assertNotNull($context);
        $this->assertSame($receipt->sessionId, $context->sessionId);
        $this->assertTrue($context->isAnonymous());
        $this->assertSame($receipt->getCsrfToken(), $context->csrfToken);
        $this->assertSame('127.0.0.1', $context->payload['ip']);

        // Revoke session
        $this->assertTrue($this->passengerStore->revoke($receipt->getRawToken()));

        // Subsequent read returns null
        $this->assertNull($this->passengerStore->read($receipt->getRawToken()));
    }

    public function test_passenger_full_session_requires_active_verified_user_and_stale_epoch_fails(): void
    {
        $userId = (string) Str::uuid();
        $email = 'full_passenger_' . bin2hex(random_bytes(4)) . '@example.com';
        DB::table('users')->insert([
            'id' => $userId,
            'email' => $email,
            'password_hash' => 'argon2id-hash-mock',
            'status' => 'active',
            'email_verified_at' => CarbonImmutable::now()->toIso8601String(),
            'credential_epoch' => 1,
            'created_at' => CarbonImmutable::now()->toIso8601String(),
            'updated_at' => CarbonImmutable::now()->toIso8601String(),
        ]);

        $receipt = $this->passengerStore->issueFull($userId, 1, ['lang' => 'ar']);
        $this->assertSame('full', $receipt->authLevel);
        $this->assertSame($userId, $receipt->principalId);

        // Read succeeds
        $context = $this->passengerStore->read($receipt->getRawToken());
        $this->assertNotNull($context);
        $this->assertTrue($context->isFull());
        $this->assertSame($userId, $context->userId);
        $this->assertSame(1, $context->credentialEpoch);
        $this->assertSame($email, $context->userEmail);
        $this->assertSame('active', $context->userStatus);
        $this->assertSame('ar', $context->payload['lang']);

        // Invalidate via epoch bump in database
        DB::table('users')->where('id', $userId)->update(['credential_epoch' => 2]);

        // Subsequent read must reject stale epoch
        $this->assertNull($this->passengerStore->read($receipt->getRawToken()));
    }

    public function test_passenger_session_atomic_rotation(): void
    {
        $userId = (string) Str::uuid();
        $email = 'rotate_passenger_' . bin2hex(random_bytes(4)) . '@example.com';
        DB::table('users')->insert([
            'id' => $userId,
            'email' => $email,
            'password_hash' => 'hash',
            'status' => 'active',
            'email_verified_at' => CarbonImmutable::now()->toIso8601String(),
            'credential_epoch' => 1,
            'created_at' => CarbonImmutable::now()->toIso8601String(),
            'updated_at' => CarbonImmutable::now()->toIso8601String(),
        ]);

        $initialReceipt = $this->passengerStore->issueFull($userId, 1, ['pref' => 'vegetarian']);
        $rotatedReceipt = $this->passengerStore->rotate($initialReceipt->getRawToken());

        $this->assertNotSame($initialReceipt->sessionId, $rotatedReceipt->sessionId);
        $this->assertNotSame($initialReceipt->getRawToken(), $rotatedReceipt->getRawToken());
        $this->assertNotSame($initialReceipt->getCsrfToken(), $rotatedReceipt->getCsrfToken());

        // Old token cannot be read
        $this->assertNull($this->passengerStore->read($initialReceipt->getRawToken()));

        // New token reads correctly with preserved payload
        $context = $this->passengerStore->read($rotatedReceipt->getRawToken());
        $this->assertNotNull($context);
        $this->assertSame($rotatedReceipt->sessionId, $context->sessionId);
        $this->assertSame('vegetarian', $context->payload['pref']);
    }

    public function test_staff_session_lifecycle_with_mfa_verification(): void
    {
        $staffId = (string) Str::uuid();
        $username = 'staff_lead_' . bin2hex(random_bytes(4));
        $email = 'staff_lead_' . bin2hex(random_bytes(4)) . '@gazaairport.ps';
        $now = CarbonImmutable::now();

        // 1. Insert staff user initially with status invited
        DB::table('staff_users')->insert([
            'id' => $staffId,
            'username' => $username,
            'email' => $email,
            'full_name_en' => 'Staff Operations',
            'full_name_ar' => 'عمليات الموظفين',
            'password_hash' => '$argon2id$v=19$m=65536,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo',
            'role' => 'editor',
            'status' => 'invited',
            'email_verified_at' => $now->toIso8601String(),
            'credential_epoch' => 1,
            'mfa_version' => null,
            'created_at' => $now->toIso8601String(),
            'updated_at' => $now->toIso8601String(),
        ]);

        // 2. Insert confirmed MFA credential
        DB::table('staff_mfa_credentials')->insert([
            'staff_id' => $staffId,
            'version' => 1,
            'encrypted_secret' => 'encrypted-totp-secret',
            'confirmed_at' => $now->toIso8601String(),
            'revoked_at' => null,
        ]);

        // 3. Update staff user to active and reference confirmed MFA version 1
        DB::table('staff_users')->where('id', $staffId)->update([
            'status' => 'active',
            'mfa_version' => 1,
        ]);

        // Issue full staff session
        $receipt = $this->staffStore->issueFull(
            staffId: $staffId,
            credentialEpoch: 1,
            mfaVersion: 1,
            mfaVerifiedAt: $now,
            attributes: ['station' => 'GZA-TERMINAL-1'],
        );

        $this->assertSame('staff', $receipt->realm);
        $this->assertSame('full', $receipt->authLevel);
        $this->assertSame($staffId, $receipt->principalId);

        // Read staff session
        $context = $this->staffStore->read($receipt->getRawToken());
        $this->assertNotNull($context);
        $this->assertSame('editor', $context->role);
        $this->assertSame($username, $context->username);
        $this->assertSame(1, $context->mfaVersion);
        $this->assertNotNull($context->mfaVerifiedAt);
        $this->assertSame('GZA-TERMINAL-1', $context->payload['station']);

        // Revoking the MFA credential invalidates active session reads
        DB::table('staff_mfa_credentials')
            ->where('staff_id', $staffId)
            ->where('version', 1)
            ->update(['revoked_at' => $now->toIso8601String()]);

        $this->assertNull($this->staffStore->read($receipt->getRawToken()));
    }

    public function test_staff_session_atomic_rotation_retains_absolute_expiry_and_mfa_timestamp(): void
    {
        $staffId = (string) Str::uuid();
        $username = 'staff_rotate_' . bin2hex(random_bytes(4));
        $email = 'staff_rotate_' . bin2hex(random_bytes(4)) . '@gazaairport.ps';
        $now = CarbonImmutable::now();
        $mfaTime = $now->subSeconds(60);

        DB::table('staff_users')->insert([
            'id' => $staffId,
            'username' => $username,
            'email' => $email,
            'full_name_en' => 'Staff Rotate',
            'full_name_ar' => 'تدوير الموظفين',
            'password_hash' => '$argon2id$v=19$m=65536,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo',
            'role' => 'admin',
            'status' => 'invited',
            'email_verified_at' => $now->toIso8601String(),
            'credential_epoch' => 1,
            'mfa_version' => null,
            'created_at' => $now->toIso8601String(),
            'updated_at' => $now->toIso8601String(),
        ]);

        DB::table('staff_mfa_credentials')->insert([
            'staff_id' => $staffId,
            'version' => 1,
            'encrypted_secret' => 'enc-secret',
            'confirmed_at' => $now->toIso8601String(),
            'revoked_at' => null,
        ]);

        DB::table('staff_users')->where('id', $staffId)->update([
            'status' => 'active',
            'mfa_version' => 1,
        ]);

        $initialReceipt = $this->staffStore->issueFull(
            staffId: $staffId,
            credentialEpoch: 1,
            mfaVersion: 1,
            mfaVerifiedAt: $mfaTime,
            attributes: ['duty' => 'supervisor'],
        );

        $rotatedReceipt = $this->staffStore->rotate($initialReceipt->getRawToken());

        $this->assertSame($initialReceipt->absoluteExpiresAt->toIso8601String(), $rotatedReceipt->absoluteExpiresAt->toIso8601String(), 'Rotated session MUST retain exact absolute expiry');

        // Rotation keeps original absolute deadline
        $this->assertSame(
            $initialReceipt->absoluteExpiresAt->getTimestamp(),
            $rotatedReceipt->absoluteExpiresAt->getTimestamp()
        );

        // Read rotated context and verify MFA timestamp was NOT renewed
        $rotatedContext = $this->staffStore->read($rotatedReceipt->getRawToken());
        $this->assertNotNull($rotatedContext);
        $this->assertSame(
            $mfaTime->getTimestamp(),
            $rotatedContext->mfaVerifiedAt->getTimestamp()
        );
        $this->assertSame('supervisor', $rotatedContext->payload['duty']);

        // Old token cannot be read
        $this->assertNull($this->staffStore->read($initialReceipt->getRawToken()));
    }

    public function test_staff_session_issue_full_rejects_unusable_password_hash_and_expired_mfa_timestamp(): void
    {
        $staffId = (string) Str::uuid();
        $username = 'staff_unusable_' . bin2hex(random_bytes(4));
        $email = 'staff_unusable_' . bin2hex(random_bytes(4)) . '@gazaairport.ps';
        $now = CarbonImmutable::now();

        // 1. Staff user with fake short password hash must be rejected by issueFull
        DB::table('staff_users')->insert([
            'id' => $staffId,
            'username' => $username,
            'email' => $email,
            'full_name_en' => 'Staff Unusable',
            'full_name_ar' => 'موظف غير صالح',
            'password_hash' => '$argon2id$v=19$m=65536,t=4,p=1$c29tZXNhbHQ$c29tZWhhc2g',
            'role' => 'admin',
            'status' => 'invited',
            'email_verified_at' => $now->toIso8601String(),
            'credential_epoch' => 1,
            'mfa_version' => null,
            'created_at' => $now->toIso8601String(),
            'updated_at' => $now->toIso8601String(),
        ]);

        DB::table('staff_mfa_credentials')->insert([
            'staff_id' => $staffId,
            'version' => 1,
            'encrypted_secret' => 'enc-secret',
            'confirmed_at' => $now->toIso8601String(),
            'revoked_at' => null,
        ]);

        DB::table('staff_users')->where('id', $staffId)->update([
            'status' => 'active',
            'mfa_version' => 1,
        ]);

        try {
            $this->staffStore->issueFull(
                staffId: $staffId,
                credentialEpoch: 1,
                mfaVersion: 1,
                mfaVerifiedAt: $now,
            );
            $this->fail('Fake short password hash must be rejected by issueFull');
        } catch (\App\Identity\Exceptions\SessionValidationException $e) {
            $this->assertSame('password_unusable', $e->errorCode);
        }

        // Update to valid hash
        $validHash = '$argon2id$v=19$m=65536,t=4,p=1$ZkU3UFIzZFA5c2NqakFhYg$vRbZFZoY615ToAxys/JQouFpRn6NyBflf5BM60kxdJo';
        DB::table('staff_users')->where('id', $staffId)->update(['password_hash' => $validHash]);

        // 2. Expired MFA timestamp (age >= 300s in the past, including exact boundary) must be rejected
        foreach ([$now->subSeconds(300), $now->subSeconds(301)] as $expiredMfa) {
            try {
                $this->staffStore->issueFull(
                    staffId: $staffId,
                    credentialEpoch: 1,
                    mfaVersion: 1,
                    mfaVerifiedAt: $expiredMfa,
                );
                $this->fail('Expired MFA proof must be rejected by issueFull');
            } catch (\App\Identity\Exceptions\SessionValidationException $e) {
                $this->assertSame('mfa_expired_timestamp', $e->errorCode);
            }
        }

        // 3. Future MFA timestamp must be rejected
        $futureMfa = $now->addSeconds(10);
        try {
            $this->staffStore->issueFull(
                staffId: $staffId,
                credentialEpoch: 1,
                mfaVersion: 1,
                mfaVerifiedAt: $futureMfa,
            );
            $this->fail('Future MFA timestamp must be rejected by issueFull');
        } catch (\App\Identity\Exceptions\SessionValidationException $e) {
            $this->assertSame('mfa_future_timestamp', $e->errorCode);
        }

        // 4. Fresh valid MFA proof within 300s succeeds
        $validReceipt = $this->staffStore->issueFull(
            staffId: $staffId,
            credentialEpoch: 1,
            mfaVersion: 1,
            mfaVerifiedAt: $now->subSeconds(60),
        );
        $this->assertSame('staff', $validReceipt->realm);
        $this->assertSame('full', $validReceipt->authLevel);
    }
}
