<?php

declare(strict_types=1);

namespace Tests\Fixtures\IdentityLifecycle;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Disposable synthetic record generator for Identity Lifecycle test suites.
 * Exclusively used in disposable test database environments.
 *
 * Enforces strict environment pre-flight guards:
 * - APP_ENV === 'testing'
 * - default connection === 'pgsql_test'
 * - configured database === 'gaza_gateway_test'
 * - live connection database === 'gaza_gateway_test'
 */
class LifecycleTestFactory
{
    public static function assertTestingEnvironment(): void
    {
        $processEnv = getenv('APP_ENV');
        if ($processEnv !== 'testing') {
            throw new \RuntimeException("LifecycleTestFactory requires process APP_ENV=testing, got: " . ($processEnv ?: 'empty'));
        }

        if (app()->environment() !== 'testing') {
            throw new \RuntimeException('LifecycleTestFactory may only be used in testing environment.');
        }

        $configuredConn = config('database.default');
        if ($configuredConn !== 'pgsql_test') {
            throw new \RuntimeException("LifecycleTestFactory requires default connection pgsql_test, got: {$configuredConn}");
        }

        $configuredDb = config('database.connections.pgsql_test.database');
        if ($configuredDb !== 'gaza_gateway_test') {
            throw new \RuntimeException("LifecycleTestFactory requires configured database gaza_gateway_test, got: {$configuredDb}");
        }

        $liveDb = (string) DB::selectOne('SELECT current_database() AS db')->db;
        if ($liveDb !== 'gaza_gateway_test') {
            throw new \RuntimeException("LifecycleTestFactory requires live connection to gaza_gateway_test, got: {$liveDb}");
        }
    }

    public static function createUser(array $overrides = []): string
    {
        self::assertTestingEnvironment();

        $id = $overrides['id'] ?? (string) Str::uuid();
        $now = CarbonImmutable::now('UTC');

        DB::statement('
            INSERT INTO users (id, email, password_hash, status, email_verified_at, credential_epoch, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ', [
            $id,
            $overrides['email'] ?? ('user_' . Str::random(8) . '@example.com'),
            $overrides['password_hash'] ?? '$argon2id$v=19$m=65536,t=4,p=1$fakehash',
            $overrides['status'] ?? 'active',
            $overrides['email_verified_at'] ?? $now->toIso8601String(),
            $overrides['credential_epoch'] ?? 1,
            $overrides['created_at'] ?? $now->toIso8601String(),
            $overrides['updated_at'] ?? $now->toIso8601String(),
        ]);

        return $id;
    }

    public static function createStaffUser(array $overrides = []): string
    {
        self::assertTestingEnvironment();

        $id = $overrides['id'] ?? (string) Str::uuid();
        $now = CarbonImmutable::now('UTC');
        $status = $overrides['status'] ?? 'invited';

        DB::statement('
            INSERT INTO staff_users (id, username, email, full_name_en, full_name_ar, password_hash, role, status, email_verified_at, credential_epoch, mfa_version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ', [
            $id,
            $overrides['username'] ?? ('staff_' . Str::random(8)),
            $overrides['email'] ?? ('staff_' . Str::random(8) . '@example.com'),
            $overrides['full_name_en'] ?? 'Staff Member',
            $overrides['full_name_ar'] ?? 'موظف',
            $overrides['password_hash'] ?? ($status === 'active' ? '$argon2id$v=19$m=65536,t=4,p=1$fakehash' : null),
            $overrides['role'] ?? 'editor',
            'invited',
            $overrides['email_verified_at'] ?? ($status === 'active' ? $now->toIso8601String() : null),
            $overrides['credential_epoch'] ?? 1,
            null,
            $overrides['created_at'] ?? $now->toIso8601String(),
            $overrides['updated_at'] ?? $now->toIso8601String(),
        ]);

        if ($status === 'active') {
            DB::statement('
                INSERT INTO staff_mfa_credentials (staff_id, version, encrypted_secret, confirmed_at, revoked_at)
                VALUES (?, 1, ?, ?, NULL)
            ', [
                $id,
                'fake_encrypted_totp_secret',
                $now->toIso8601String(),
            ]);

            DB::statement('
                UPDATE staff_users SET status = ?, mfa_version = 1 WHERE id = ?
            ', [
                $status,
                $id,
            ]);
        }

        return $id;
    }

    public static function createPassengerSession(array $overrides = []): string
    {
        self::assertTestingEnvironment();

        $id = $overrides['id'] ?? (string) Str::uuid();
        $now = CarbonImmutable::now('UTC');

        DB::statement('
            INSERT INTO passenger_sessions (id, lookup_digest, user_id, auth_level, credential_epoch, encrypted_payload, issued_at, absolute_expires_at, idle_expires_at, last_seen_at, revoked_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ', [
            $id,
            $overrides['lookup_digest'] ?? hash('sha256', Str::random(43)),
            $overrides['user_id'] ?? null,
            $overrides['auth_level'] ?? 'anonymous',
            $overrides['credential_epoch'] ?? null,
            $overrides['encrypted_payload'] ?? 'fake_encrypted_payload',
            $overrides['issued_at'] ?? $now->toIso8601String(),
            $overrides['absolute_expires_at'] ?? $now->addHours(24)->toIso8601String(),
            $overrides['idle_expires_at'] ?? $now->addHours(2)->toIso8601String(),
            $overrides['last_seen_at'] ?? $now->toIso8601String(),
            $overrides['revoked_at'] ?? null,
        ]);

        return $id;
    }

    public static function createFareProduct(array $overrides = []): string
    {
        self::assertTestingEnvironment();

        $id = $overrides['id'] ?? ('fare_' . Str::random(8));

        DB::statement("
            INSERT INTO fare_products (id, name_en, name_ar, multiplier, checked_bags, seat_selection_en, seat_selection_ar, changes_en, changes_ar, refund_en, refund_ar, flexibility_en, flexibility_ar, allowed_cabins, order_index, is_active, created_at)
            VALUES (?, 'Economy Standard', 'اقتصادي قياسي', 1.00, 1, 'Standard seat', 'مقعد قياسي', 'Fee applies', 'تطبق رسوم', 'Non-refundable', 'غير قابل للاسترداد', 'Standard', 'قياسي', ARRAY['economy']::text[], 0, true, clock_timestamp())
            ON CONFLICT (id) DO NOTHING
        ", [$id]);

        return $id;
    }

    public static function createQuote(array $overrides = []): array
    {
        self::assertTestingEnvironment();

        $id = $overrides['id'] ?? (string) Str::uuid();
        $sessionId = $overrides['checkout_session_id'] ?? self::createPassengerSession();
        $fareId = $overrides['fare_id'] ?? self::createFareProduct();

        DB::statement("
            INSERT INTO quotes (id, checkout_session_id, fare_id, cabin, pax_count, infant_count, seat_count, service_ids, base_minor, total_minor, currency, pricing_snapshot, issued_at, expires_at)
            VALUES (?, ?, ?, 'economy', 1, 0, 1, '{srv_gza_amm_001}', 10000, 10000, 'USD', '{\"base\":10000}'::jsonb, clock_timestamp(), clock_timestamp() + interval '5 minutes')
        ", [$id, $sessionId, $fareId]);

        return ['id' => $id, 'checkout_session_id' => $sessionId];
    }

    public static function createCapacityHold(array $overrides = []): array
    {
        self::assertTestingEnvironment();

        $id = $overrides['id'] ?? (string) Str::uuid();
        $quote = self::createQuote($overrides);
        $quoteId = $quote['id'];
        $sessionId = $quote['checkout_session_id'];

        DB::statement("
            INSERT INTO capacity_holds (id, quote_id, checkout_session_id, cabin, seat_count, state, issued_at, expires_at)
            VALUES (?, ?, ?, 'economy', 1, 'active', clock_timestamp(), clock_timestamp() + interval '10 minutes')
        ", [$id, $quoteId, $sessionId]);

        return ['id' => $id, 'quote_id' => $quoteId, 'checkout_session_id' => $sessionId];
    }

    public static function createBooking(array $overrides = []): string
    {
        self::assertTestingEnvironment();

        $id = $overrides['id'] ?? (string) Str::uuid();
        $hold = self::createCapacityHold($overrides);
        $holdId = $hold['id'];
        $quoteId = $hold['quote_id'];
        $sessionId = $hold['checkout_session_id'];
        $fareId = self::createFareProduct();
        $pnr = $overrides['pnr'] ?? ('P' . strtoupper(Str::random(7)));
        $contactEmail = $overrides['contact_email'] ?? ('contact_' . Str::random(8) . '@example.com');

        DB::statement("
            INSERT INTO bookings (id, pnr, hold_id, quote_id, checkout_session_id, owner_user_id, security_epoch, channel, status, contact_name, contact_email, contact_phone, fare_id, cabin, pricing_snapshot_json, seat_layouts_snapshot_json, total_minor, currency, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, NULL, 1, 'web', 'confirmed', 'Ahmad Passenger', ?, '+970599000000', ?, 'economy', '{\"base\":10000}'::jsonb, '{\"seats\":[]}'::jsonb, 10000, 'USD', clock_timestamp(), clock_timestamp())
        ", [$id, $pnr, $holdId, $quoteId, $sessionId, $contactEmail, $fareId]);

        return $id;
    }

    public static function createBookingGuestChallenge(array $overrides = []): string
    {
        self::assertTestingEnvironment();

        $id = $overrides['id'] ?? (string) Str::uuid();
        $bookingId = $overrides['booking_id'] ?? self::createBooking();
        $sessionId = $overrides['session_id'] ?? self::createPassengerSession();
        $purpose = $overrides['purpose'] ?? 'manage_booking';
        $epoch = $overrides['security_epoch'] ?? 1;
        $pepperVersion = $overrides['pepper_version'] ?? 1;

        if (isset($overrides['code_digest'])) {
            $codeDigest = $overrides['code_digest'];
        } elseif (isset($overrides['pepper_ring']) && $overrides['pepper_ring'] instanceof \App\Identity\Proofs\GuestOtpPepperRing) {
            $code = $overrides['code'] ?? '123456';
            $codeDigest = \App\Identity\Proofs\GuestOtpHelper::computeDigest(
                challengeId: $id,
                purpose: $purpose,
                bookingId: $bookingId,
                sessionId: $sessionId,
                securityEpoch: $epoch,
                code: $code,
                pepperVersion: $pepperVersion,
                pepperRing: $overrides['pepper_ring'],
            );
        } else {
            $codeDigest = hash('sha256', 'dummy_code_digest');
        }

        $now = CarbonImmutable::now('UTC');

        DB::statement("
            INSERT INTO booking_guest_challenges (id, booking_id, session_id, user_id, purpose, security_epoch, code_digest, pepper_version, state, failed_attempts, dispatch_status, issued_at, expires_at, consumed_at, revoked_at)
            VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'issued', 0, 'queued', ?, ?, NULL, NULL)
        ", [
            $id,
            $bookingId,
            $sessionId,
            $purpose,
            $epoch,
            $codeDigest,
            $pepperVersion,
            $overrides['issued_at'] ?? $now->toIso8601String(),
            $overrides['expires_at'] ?? $now->addMinutes(10)->toIso8601String(),
        ]);

        return $id;
    }
}
