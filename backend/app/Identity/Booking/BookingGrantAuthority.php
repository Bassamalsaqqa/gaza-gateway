<?php

declare(strict_types=1);

namespace App\Identity\Booking;

use App\Identity\Tokens\OpaqueToken;
use Carbon\CarbonImmutable;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Str;

/** Transactional identity hooks; never creates inventory, itineraries or checkout authority. */
final class BookingGrantAuthority
{
    public function __construct(private readonly ConnectionInterface $db) {}

    /** Called by a future trusted checkout transaction, never by a public mint endpoint. */
    public function issueReceiptInsideTransaction(string $bookingId): array
    {
        if ($this->db->transactionLevel() < 1) { throw new \LogicException('Receipt issuance requires a booking transaction.'); }
        $booking = $this->db->table('bookings')->where('id', $bookingId)->lockForUpdate()->first();
        if (!$booking) { throw new BookingAccessException(); }
        $now = $this->now(); $expires = $now->addSeconds(600);
        $token = OpaqueToken::generate('booking', 'booking_receipt_grant');
        $this->db->table('booking_receipt_grants')->insert(['id' => (string) Str::uuid(), 'token_digest' => $token->getDigest(),
            'booking_id' => $booking->id, 'security_epoch' => $booking->security_epoch, 'allowed_actions' => '["getBookingReceipt"]',
            'scope_version' => 1, 'issued_at' => $now, 'expires_at' => $expires]);
        return ['receiptToken' => $token->getSecretToken(), 'expiresAt' => $expires->toIso8601String()];
    }

    /** Callback runs while authority and booking are locked, preventing check/use epoch races. */
    public function withGuest(string $ref, #[\SensitiveParameter] string $token, string $operation, \Closure $mutation): mixed
    {
        if (!in_array($operation, BookingAccessCoordinator::GUEST_ACTIONS, true)) { throw new BookingAccessException(403, 'forbidden'); }
        return $this->withGrant('booking_guest_grants', 900, $ref, $token, $operation, $mutation);
    }

    public function withReceipt(string $ref, #[\SensitiveParameter] string $token, \Closure $projection): mixed
    {
        return $this->withGrant('booking_receipt_grants', 600, $ref, $token, 'getBookingReceipt', $projection);
    }

    private function withGrant(string $table, int $ttl, string $ref, #[\SensitiveParameter] string $token, string $operation, \Closure $work): mixed
    {
        if ($this->db->transactionLevel() !== 0) { throw new \LogicException('Grant use requires its own booking transaction.'); }
        if (!preg_match('/^[A-Z0-9-]{6,8}\z/', $ref)) { throw new BookingAccessException(); }
        try { OpaqueToken::validateCanonicalBearer($token); } catch (\Throwable) { throw new BookingAccessException(); }
        return $this->db->transaction(function () use ($table, $ttl, $ref, $token, $operation, $work) {
            $this->db->statement("SET LOCAL lock_timeout = '3000ms'");
            $this->db->statement("SET LOCAL statement_timeout = '5000ms'");
            $booking = $this->db->table('bookings')->where('pnr', $ref)->lockForUpdate()->first();
            $grant = $this->db->table($table)->where('token_digest', OpaqueToken::digestOf($token))->lockForUpdate()->first();
            $now = $this->now();
            if (!$booking || !$grant || $grant->booking_id !== $booking->id || $grant->revoked_at !== null
                || (int) $grant->security_epoch !== (int) $booking->security_epoch || (int) $grant->scope_version !== 1) {
                throw new BookingAccessException();
            }
            $issued = CarbonImmutable::parse($grant->issued_at); $expires = CarbonImmutable::parse($grant->expires_at);
            try { $actions = json_decode($grant->allowed_actions, true, 4, JSON_THROW_ON_ERROR); }
            catch (\Throwable) { throw new BookingAccessException(); }
            $allowed = $table === 'booking_receipt_grants' ? ['getBookingReceipt'] : BookingAccessCoordinator::GUEST_ACTIONS;
            if ($now->lessThan($issued) || $now->greaterThanOrEqualTo($expires) || $expires->greaterThan($issued->addSeconds($ttl))
                || !is_array($actions) || !array_is_list($actions) || $actions === [] || count(array_unique($actions)) !== count($actions)
                || array_diff($actions, $allowed) !== [] || !in_array($operation, $actions, true)) { throw new BookingAccessException(); }
            return $work($booking);
        });
    }

    private function now(): CarbonImmutable { return CarbonImmutable::parse($this->db->selectOne('SELECT clock_timestamp() AS now')->now); }
}
