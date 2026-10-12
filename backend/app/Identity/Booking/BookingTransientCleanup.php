<?php

declare(strict_types=1);

namespace App\Identity\Booking;

use Illuminate\Database\ConnectionInterface;

/** Bounded durable expiry for real challenges, decoys, ownership proofs and grant metadata. */
final class BookingTransientCleanup
{
    public function __construct(private readonly ConnectionInterface $db) {}

    public function expire(int $limit = 50): int
    {
        if ($limit < 1 || $limit > 100 || $this->db->transactionLevel() !== 0) {
            throw new \LogicException('Booking cleanup requires a bounded owned transaction.');
        }
        $count = 0;
        foreach (['booking_guest_challenges', 'booking_claim_proofs', 'booking_guest_grants', 'booking_receipt_grants'] as $table) {
            if ($count >= $limit) { break; }
            $proof = in_array($table, ['booking_guest_challenges', 'booking_claim_proofs'], true);
            $query = $this->db->table($table)->where('expires_at', '<=', \App\Support\DatabaseClock::raw());
            $proof ? $query->where('state', 'issued') : $query->whereNull('revoked_at');
            $candidates = $query->orderBy('id')->limit($limit - $count)->get();
            foreach ($candidates as $candidate) {
                $count += $this->db->transaction(function () use ($table, $candidate, $proof) {
                    \App\Support\DatabaseFailure::applyTimeouts($this->db, 5000, 3000);
                    if (isset($candidate->user_id)) { $this->db->table('users')->where('id', $candidate->user_id)->lockForUpdate()->first(); }
                    if ($candidate->booking_id !== null) { $this->db->table('bookings')->where('id', $candidate->booking_id)->lockForUpdate()->first(); }
                    if (isset($candidate->session_id)) { $this->db->table('passenger_sessions')->where('id', $candidate->session_id)->lockForUpdate()->first(); }
                    $row = $this->db->table($table)->where('id', $candidate->id)->lockForUpdate()->first();
                    $outbox = $table === 'booking_guest_challenges' ? $this->db->table('security_dispatch_outbox')
                        ->where('booking_challenge_id', $candidate->id)->lockForUpdate()->first() : null;
                    $query = $this->db->table($table)->where('id', $candidate->id)->where('expires_at', '<=', \App\Support\DatabaseClock::raw());
                    $proof ? $query->where('state', 'issued') : $query->whereNull('revoked_at');
                    if (!$row || !$query->exists()) { return 0; }
                    $query->update($proof ? ['state' => 'expired'] : ['revoked_at' => \App\Support\DatabaseClock::raw()]);
                    if ($outbox !== null) {
                        $this->db->table('security_dispatch_outbox')->where('id', $outbox->id)->update(['status' => 'expired',
                            'encrypted_payload' => null, 'scrubbed_at' => \App\Support\DatabaseClock::raw()]);
                    }
                    if ($table === 'booking_guest_challenges') {
                        $this->db->table($table)->where('id', $candidate->id)->update(['dispatch_status' => 'scrubbed']);
                    }
                    return 1;
                });
            }
        }
        return $count;
    }
}
