<?php

declare(strict_types=1);

namespace App\Identity\Staff;

use Carbon\CarbonImmutable;
use Illuminate\Database\ConnectionInterface;

/** Bounded expiration/secret erasure; never revokes a confirmed MFA credential. */
final class StaffTransientCleanup
{
    public function __construct(private readonly ConnectionInterface $db) {}

    public function expire(int $limit): int
    {
        if ($limit < 1 || $limit > 100 || $this->db->transactionLevel() !== 0) {
            throw new \InvalidArgumentException('Staff cleanup requires a bounded batch and owned transaction.');
        }
        return $this->db->transaction(function () use ($limit) {
            $this->db->statement("SET LOCAL lock_timeout = '2000ms'");
            $this->db->statement("SET LOCAL statement_timeout = '3000ms'");
            if (!$this->db->table('staff_directory_control')->where('id', 1)->lockForUpdate()->first()) {
                throw new \LogicException('Staff directory sentinel is unavailable.');
            }
            $now = CarbonImmutable::parse($this->db->selectOne('SELECT clock_timestamp() AS now')->now);
            $pending = $this->db->table('staff_pending_auth')->where(function ($q) use ($now) {
                $q->where(fn ($q) => $q->where('state', 'issued')->where('expires_at', '<=', $now))
                    ->orWhere(fn ($q) => $q->where('state', '<>', 'issued')->whereNotNull('encrypted_staged_secret'));
            })->orderBy('id')->limit($limit)->get();
            $remaining = $limit - $pending->count();
            $replacements = $remaining === 0 ? collect() : $this->db->table('staff_mfa_replacements as r')
                ->join('staff_mfa_credentials as c', fn ($q) => $q->on('c.staff_id', '=', 'r.staff_id')->on('c.version', '=', 'r.candidate_version'))
                ->whereNull('c.confirmed_at')->where('c.encrypted_secret', '<>', '')
                ->where(fn ($q) => $q->where('r.state', '<>', 'issued')->orWhere('r.expires_at', '<=', $now))
                ->select('r.*')->orderBy('r.id')->limit($remaining)->get();
            $ids = $pending->pluck('staff_id')->merge($replacements->pluck('staff_id'))->unique()->all();
            if ($ids === []) { return 0; }
            $this->db->table('staff_users')->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get();
            $sessions = $pending->pluck('bound_session_id')->merge($replacements->pluck('session_id'))->unique()->all();
            $this->db->table('staff_sessions')->whereIn('id', $sessions)->orderBy('id')->lockForUpdate()->get();
            $this->db->table('staff_mfa_credentials')->whereIn('staff_id', $ids)->orderBy('staff_id')->orderBy('version')->lockForUpdate()->get();
            $lockedPending = $this->db->table('staff_pending_auth')->whereIn('id', $pending->pluck('id'))->orderBy('id')->lockForUpdate()->get();
            $lockedReplacements = $this->db->table('staff_mfa_replacements')->whereIn('id', $replacements->pluck('id'))->orderBy('id')->lockForUpdate()->get();
            $now = CarbonImmutable::parse($this->db->selectOne('SELECT clock_timestamp() AS now')->now); $count = 0;
            foreach ($lockedPending as $row) {
                if ($row->state === 'issued' && $now->lessThan(CarbonImmutable::parse($row->expires_at))) { continue; }
                $this->db->table('staff_pending_auth')->where('id', $row->id)->update([
                    'state' => $row->state === 'issued' ? 'expired' : $row->state, 'encrypted_staged_secret' => null]);
                $count++;
            }
            foreach ($lockedReplacements as $row) {
                if ($row->state === 'issued' && $now->lessThan(CarbonImmutable::parse($row->expires_at))) { continue; }
                $credential = $this->db->table('staff_mfa_credentials')->where('staff_id', $row->staff_id)->where('version', $row->candidate_version)->first();
                if (!$credential || $credential->confirmed_at !== null) { continue; }
                $this->db->table('staff_mfa_replacements')->where('id', $row->id)->update(['state' => $row->state === 'issued' ? 'expired' : $row->state]);
                $this->db->table('staff_mfa_credentials')->where('staff_id', $row->staff_id)->where('version', $row->candidate_version)
                    ->whereNull('confirmed_at')->update(['encrypted_secret' => '', 'revoked_at' => $now]);
                $count++;
            }
            return $count;
        });
    }
}
