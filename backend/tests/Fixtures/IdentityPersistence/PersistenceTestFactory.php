<?php

declare(strict_types=1);

namespace Tests\Fixtures\IdentityPersistence;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Disposable synthetic test record generator for Identity Persistence test suites.
 * Exclusively used in disposable test database environments.
 */
class PersistenceTestFactory
{
    public static function createUser(array $overrides = []): string
    {
        $id = $overrides['id'] ?? (string) Str::uuid();
        DB::statement('
            INSERT INTO users (id, email, password_hash, status, email_verified_at, credential_epoch, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ', [
            $id,
            $overrides['email'] ?? ('user_' . Str::random(8) . '@example.com'),
            $overrides['password_hash'] ?? '$argon2id$v=19$m=65536,t=4,p=1$fakehash',
            $overrides['status'] ?? 'active',
            $overrides['email_verified_at'] ?? now()->toIso8601String(),
            $overrides['credential_epoch'] ?? 1,
            $overrides['created_at'] ?? now()->toIso8601String(),
            $overrides['updated_at'] ?? now()->toIso8601String(),
        ]);

        return $id;
    }

    public static function createStaffUser(array $overrides = []): string
    {
        $id = $overrides['id'] ?? (string) Str::uuid();
        DB::statement('
            INSERT INTO staff_users (id, username, email, full_name_en, full_name_ar, password_hash, role, status, email_verified_at, credential_epoch, mfa_version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ', [
            $id,
            $overrides['username'] ?? ('staff_' . Str::random(8)),
            $overrides['email'] ?? ('staff_' . Str::random(8) . '@example.com'),
            $overrides['full_name_en'] ?? 'Staff Member',
            $overrides['full_name_ar'] ?? 'موظف',
            $overrides['password_hash'] ?? null,
            $overrides['role'] ?? 'editor',
            $overrides['status'] ?? 'invited',
            $overrides['email_verified_at'] ?? null,
            $overrides['credential_epoch'] ?? 1,
            $overrides['mfa_version'] ?? null,
            $overrides['created_at'] ?? now()->toIso8601String(),
            $overrides['updated_at'] ?? now()->toIso8601String(),
        ]);

        return $id;
    }

    public static function createPassengerSession(array $overrides = []): string
    {
        $id = $overrides['id'] ?? (string) Str::uuid();
        DB::statement('
            INSERT INTO passenger_sessions (
                id, lookup_digest, user_id, auth_level, credential_epoch,
                encrypted_payload, issued_at, absolute_expires_at, idle_expires_at, last_seen_at, revoked_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ', [
            $id,
            $overrides['lookup_digest'] ?? hash('sha256', Str::random(32)),
            $userId = $overrides['user_id'] ?? null,
            $overrides['auth_level'] ?? ($userId !== null ? 'full' : 'anonymous'),
            $overrides['credential_epoch'] ?? ($userId !== null ? 1 : null),
            $overrides['encrypted_payload'] ?? 'encrypted_session_payload',
            $overrides['issued_at'] ?? now()->toIso8601String(),
            $overrides['absolute_expires_at'] ?? now()->addHours(24)->toIso8601String(),
            $overrides['idle_expires_at'] ?? now()->addHours(2)->toIso8601String(),
            $overrides['last_seen_at'] ?? now()->toIso8601String(),
            $overrides['revoked_at'] ?? null,
        ]);

        return $id;
    }

    public static function createFareProduct(array $overrides = []): string
    {
        $id = $overrides['id'] ?? ('fare_' . Str::random(8));
        DB::statement('
            INSERT INTO fare_products (
                id, name_en, name_ar, multiplier, checked_bags, seat_selection_en, seat_selection_ar,
                changes_en, changes_ar, refund_en, refund_ar, flexibility_en, flexibility_ar,
                allowed_cabins, order_index, is_active, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ', [
            $id,
            $overrides['name_en'] ?? 'Essential',
            $overrides['name_ar'] ?? 'الأساسية',
            $overrides['multiplier'] ?? 1.00,
            $overrides['checked_bags'] ?? 1,
            $overrides['seat_selection_en'] ?? 'Standard seat selection',
            $overrides['seat_selection_ar'] ?? 'اختيار المقعد القياسي',
            $overrides['changes_en'] ?? 'Changes permitted with fee',
            $overrides['changes_ar'] ?? 'التعديل متاح برسم',
            $overrides['refund_en'] ?? 'Non-refundable',
            $overrides['refund_ar'] ?? 'غير مسترد',
            $overrides['flexibility_en'] ?? 'Basic flexibility',
            $overrides['flexibility_ar'] ?? 'مرونة أساسية',
            $overrides['allowed_cabins'] ?? '{economy,premium,business}',
            $overrides['order_index'] ?? 1,
            $overrides['is_active'] ?? true,
            $overrides['created_at'] ?? now()->toIso8601String(),
        ]);

        return $id;
    }

    public static function createQuote(array $overrides = []): string
    {
        $id = $overrides['id'] ?? (string) Str::uuid();
        $sessionId = $overrides['checkout_session_id'] ?? self::createPassengerSession();
        $fareId = $overrides['fare_id'] ?? self::createFareProduct();

        DB::statement('
            INSERT INTO quotes (
                id, checkout_session_id, fare_id, cabin, pax_count, infant_count, seat_count,
                service_ids, base_minor, total_minor, currency, pricing_snapshot, issued_at, expires_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ', [
            $id,
            $sessionId,
            $fareId,
            $overrides['cabin'] ?? 'economy',
            $overrides['pax_count'] ?? 1,
            $overrides['infant_count'] ?? 0,
            $overrides['seat_count'] ?? 1,
            $overrides['service_ids'] ?? '{srv_gza_amm_001}',
            $overrides['base_minor'] ?? 25000,
            $overrides['total_minor'] ?? 25000,
            $overrides['currency'] ?? 'USD',
            $overrides['pricing_snapshot'] ?? json_encode(['base' => 25000, 'taxes' => 0]),
            $overrides['issued_at'] ?? now()->toIso8601String(),
            $overrides['expires_at'] ?? now()->addMinutes(5)->toIso8601String(),
        ]);

        return $id;
    }

    public static function createCapacityHold(array $overrides = []): string
    {
        $id = $overrides['id'] ?? (string) Str::uuid();
        $sessionId = $overrides['checkout_session_id'] ?? self::createPassengerSession();
        $quoteId = $overrides['quote_id'] ?? self::createQuote(['checkout_session_id' => $sessionId]);

        DB::statement('
            INSERT INTO capacity_holds (
                id, quote_id, checkout_session_id, cabin, seat_count, state, issued_at, expires_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ', [
            $id,
            $quoteId,
            $sessionId,
            $overrides['cabin'] ?? 'economy',
            $overrides['seat_count'] ?? 1,
            $overrides['state'] ?? 'active',
            $overrides['issued_at'] ?? now()->toIso8601String(),
            $overrides['expires_at'] ?? now()->addMinutes(10)->toIso8601String(),
        ]);

        return $id;
    }

    public static function createBooking(array $overrides = []): string
    {
        $id = $overrides['id'] ?? (string) Str::uuid();
        $sessionId = $overrides['checkout_session_id'] ?? self::createPassengerSession();
        $fareId = $overrides['fare_id'] ?? self::createFareProduct();
        $quoteId = $overrides['quote_id'] ?? self::createQuote(['checkout_session_id' => $sessionId, 'fare_id' => $fareId]);
        $holdId = $overrides['hold_id'] ?? self::createCapacityHold([
            'quote_id' => $quoteId,
            'checkout_session_id' => $sessionId,
        ]);

        DB::statement('
            INSERT INTO bookings (
                id, pnr, hold_id, quote_id, checkout_session_id, owner_user_id, security_epoch,
                channel, status, contact_name, contact_email, contact_phone, fare_id, cabin,
                pricing_snapshot_json, seat_layouts_snapshot_json, total_minor, currency, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ', [
            $id,
            $overrides['pnr'] ?? ('GZA-' . strtoupper(Str::random(4))),
            $holdId,
            $quoteId,
            $sessionId,
            $overrides['owner_user_id'] ?? null,
            $overrides['security_epoch'] ?? 1,
            $overrides['channel'] ?? 'web',
            $overrides['status'] ?? 'pending_payment',
            $overrides['contact_name'] ?? 'Tariq Palestine',
            $overrides['contact_email'] ?? 'tariq@example.com',
            $overrides['contact_phone'] ?? '+970599123456',
            $fareId,
            $overrides['cabin'] ?? 'economy',
            $overrides['pricing_snapshot_json'] ?? json_encode(['total' => 25000]),
            $overrides['seat_layouts_snapshot_json'] ?? json_encode(['layout' => 'standard']),
            $overrides['total_minor'] ?? 25000,
            $overrides['currency'] ?? 'USD',
            $overrides['created_at'] ?? now()->toIso8601String(),
            $overrides['updated_at'] ?? now()->toIso8601String(),
        ]);

        return $id;
    }

    public static function createBookingPassenger(array $overrides = []): string
    {
        $id = $overrides['id'] ?? (string) Str::uuid();
        $bookingId = $overrides['booking_id'] ?? self::createBooking();

        DB::statement('
            INSERT INTO booking_passengers (
                id, booking_id, request_local_id, passenger_index, type, first_name, last_name,
                title, dob, nationality, encrypted_document_metadata, linked_adult_passenger_id,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ', [
            $id,
            $bookingId,
            $overrides['request_local_id'] ?? ('pax_' . Str::random(6)),
            $overrides['passenger_index'] ?? 0,
            $overrides['type'] ?? 'adult',
            $overrides['first_name'] ?? 'Ahmad',
            $overrides['last_name'] ?? 'Al-Ghefari',
            $overrides['title'] ?? 'Mr',
            $overrides['dob'] ?? '1990-05-15',
            $overrides['nationality'] ?? 'Palestinian',
            $overrides['encrypted_document_metadata'] ?? 'enc_doc_meta',
            $overrides['linked_adult_passenger_id'] ?? null,
            $overrides['created_at'] ?? now()->toIso8601String(),
            $overrides['updated_at'] ?? now()->toIso8601String(),
        ]);

        return $id;
    }

    public static function createUserEmailVerification(array $overrides = []): string
    {
        $id = $overrides['id'] ?? (string) Str::uuid();
        $userId = $overrides['user_id'] ?? self::createUser();

        DB::statement('
            INSERT INTO user_email_verifications (
                id, token_digest, state, issued_at, expires_at, consumed_at, revoked_at,
                user_id, purpose, credential_epoch, email_snapshot
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ', [
            $id,
            $overrides['token_digest'] ?? hash('sha256', Str::random(32)),
            $overrides['state'] ?? 'issued',
            $overrides['issued_at'] ?? now()->toIso8601String(),
            $overrides['expires_at'] ?? now()->addHours(24)->toIso8601String(),
            $overrides['consumed_at'] ?? null,
            $overrides['revoked_at'] ?? null,
            $userId,
            'passenger_email_verification',
            $overrides['credential_epoch'] ?? 1,
            $overrides['email_snapshot'] ?? 'user@example.com',
        ]);

        return $id;
    }

    public static function createUserPasswordReset(array $overrides = []): string
    {
        $id = $overrides['id'] ?? (string) Str::uuid();
        $userId = $overrides['user_id'] ?? self::createUser();

        DB::statement('
            INSERT INTO user_password_resets (
                id, token_digest, state, issued_at, expires_at, consumed_at, revoked_at,
                user_id, purpose, credential_epoch, email_snapshot
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ', [
            $id,
            $overrides['token_digest'] ?? hash('sha256', Str::random(32)),
            $overrides['state'] ?? 'issued',
            $overrides['issued_at'] ?? now()->toIso8601String(),
            $overrides['expires_at'] ?? now()->addHours(2)->toIso8601String(),
            $overrides['consumed_at'] ?? null,
            $overrides['revoked_at'] ?? null,
            $userId,
            'passenger_password_reset',
            $overrides['credential_epoch'] ?? 1,
            $overrides['email_snapshot'] ?? 'user@example.com',
        ]);

        return $id;
    }

    public static function createStaffInvitation(array $overrides = []): string
    {
        $id = $overrides['id'] ?? (string) Str::uuid();
        $staffId = $overrides['staff_id'] ?? self::createStaffUser();

        DB::statement('
            INSERT INTO staff_invitations (
                id, token_digest, state, issued_at, expires_at, consumed_at, revoked_at,
                staff_id, purpose, credential_epoch, email_snapshot
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ', [
            $id,
            $overrides['token_digest'] ?? hash('sha256', Str::random(32)),
            $overrides['state'] ?? 'issued',
            $overrides['issued_at'] ?? now()->toIso8601String(),
            $overrides['expires_at'] ?? now()->addHours(48)->toIso8601String(),
            $overrides['consumed_at'] ?? null,
            $overrides['revoked_at'] ?? null,
            $staffId,
            'staff_invitation',
            $overrides['credential_epoch'] ?? 1,
            $overrides['email_snapshot'] ?? 'staff@example.com',
        ]);

        return $id;
    }

    public static function createStaffPasswordReset(array $overrides = []): string
    {
        $id = $overrides['id'] ?? (string) Str::uuid();
        $staffId = $overrides['staff_id'] ?? self::createStaffUser();

        DB::statement('
            INSERT INTO staff_password_resets (
                id, token_digest, state, issued_at, expires_at, consumed_at, revoked_at,
                staff_id, purpose, credential_epoch, email_snapshot
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ', [
            $id,
            $overrides['token_digest'] ?? hash('sha256', Str::random(32)),
            $overrides['state'] ?? 'issued',
            $overrides['issued_at'] ?? now()->toIso8601String(),
            $overrides['expires_at'] ?? now()->addHours(2)->toIso8601String(),
            $overrides['consumed_at'] ?? null,
            $overrides['revoked_at'] ?? null,
            $staffId,
            'staff_password_reset',
            $overrides['credential_epoch'] ?? 1,
            $overrides['email_snapshot'] ?? 'staff@example.com',
        ]);

        return $id;
    }

    public static function createBookingGuestChallenge(array $overrides = []): string
    {
        $id = $overrides['id'] ?? (string) Str::uuid();
        $sessionId = $overrides['session_id'] ?? self::createPassengerSession();

        DB::statement('
            INSERT INTO booking_guest_challenges (
                id, booking_id, session_id, user_id, purpose, security_epoch,
                code_digest, pepper_version, state, failed_attempts, dispatch_status,
                issued_at, expires_at, consumed_at, revoked_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ', [
            $id,
            $overrides['booking_id'] ?? null,
            $sessionId,
            $overrides['user_id'] ?? null,
            $overrides['purpose'] ?? 'manage_booking',
            $overrides['security_epoch'] ?? (!empty($overrides['booking_id']) ? 1 : null),
            $overrides['code_digest'] ?? hash('sha256', Str::random(32)),
            $overrides['pepper_version'] ?? 1,
            $overrides['state'] ?? 'issued',
            $overrides['failed_attempts'] ?? 0,
            $overrides['dispatch_status'] ?? 'queued',
            $overrides['issued_at'] ?? now()->toIso8601String(),
            $overrides['expires_at'] ?? now()->addMinutes(15)->toIso8601String(),
            $overrides['consumed_at'] ?? null,
            $overrides['revoked_at'] ?? null,
        ]);

        return $id;
    }
}
