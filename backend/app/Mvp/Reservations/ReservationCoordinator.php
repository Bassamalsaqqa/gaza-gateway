<?php

declare(strict_types=1);

namespace App\Mvp\Reservations;

use App\Identity\Sessions\PassengerSessionContext;
use App\Identity\Sessions\StaffSessionContext;
use App\Mvp\Reservations\Exceptions\ReservationConflictException;
use App\Mvp\Reservations\Exceptions\ReservationNotFoundException;
use App\Mvp\Reservations\Exceptions\ReservationReferenceChangedException;
use App\Mvp\Reservations\Exceptions\ReservationSessionExpiredException;
use App\Mvp\Reservations\Exceptions\ReservationValidationException;
use App\Support\DatabaseClock;
use App\Support\DatabaseFailure;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Database\QueryException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class ReservationCoordinator
{
    public function __construct(
        private readonly ReservationOfferingAuthority $authority,
    ) {}

    public function getOfferingSeats(string $serviceId): array
    {
        if (strlen($serviceId) > 1024 || preg_match('/\Asvc1-([A-Za-z0-9_-]+)-(\d{4}-\d{2}-\d{2})\z/', $serviceId) !== 1) {
            throw new ReservationNotFoundException('Invalid service ID format.');
        }

        $offering = $this->authority->resolve($serviceId);

        $serviceRow = DB::table('mvp_services')->where('id', $serviceId)->first();
        if ($serviceRow) {
            $layout = json_decode((string) $serviceRow->layout_snapshot, true, 512, JSON_THROW_ON_ERROR);
            $occupied = DB::table('mvp_reservation_seat_claims')
                ->where('service_id', $serviceId)
                ->pluck('seat_code')
                ->all();
        } else {
            $layout = $offering['layout'];
            $occupied = [];
        }

        return [
            'serviceId' => $serviceId,
            'layout' => $layout,
            'occupiedSeats' => $occupied,
        ];
    }

    public function createReservation(array $command, PassengerSessionContext $session, ?Closure $authorize = null): array
    {
        $userId = $session->getUserId();
        if ($userId === null) {
            throw new ReservationValidationException('Authenticated passenger user ID required.');
        }

        $submissionId = $command['submissionId'];
        $serviceId = $command['serviceId'];
        if (strlen($serviceId) > 1024 || preg_match('/\Asvc1-([A-Za-z0-9_-]+)-(\d{4}-\d{2}-\d{2})\z/', $serviceId) !== 1) {
            throw new ReservationValidationException('Invalid service ID format.');
        }

        $fingerprint = hash('sha256', json_encode($command, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        try {
            return DB::transaction(function () use ($command, $session, $userId, $submissionId, $serviceId, $fingerprint, $authorize): array {
            // 1. Lock principal row then session row in accepted order
            $user = DB::table('users')->where('id', $userId)->lockForUpdate()->first();
            if (!$user || $user->status !== 'active' || $user->email_verified_at === null) {
                throw new ReservationSessionExpiredException('User is not active or verified.');
            }

            $sessionRow = DB::table('passenger_sessions')->where('id', $session->sessionId)->lockForUpdate()->first();
            if (!$sessionRow || $sessionRow->revoked_at !== null) {
                throw new ReservationSessionExpiredException('Session revoked.');
            }

            if ((int) $user->credential_epoch !== (int) $sessionRow->credential_epoch) {
                throw new ReservationSessionExpiredException('Credential epoch mismatch.');
            }

            // Already-locked principal/session authority precedes idempotent lookup.
            if (!$authorize || $authorize()->sessionId !== $session->sessionId) throw new HttpException(401);
            // 6. Check replay: owner-bound submission UUID + canonical normalized command fingerprint
            $existingSub = DB::table('mvp_reservation_submissions')
                ->where('owner_user_id', $userId)
                ->where('submission_id', $submissionId)
                ->lockForUpdate()
                ->first();

            if ($existingSub) {
                if ($existingSub->command_fingerprint === $fingerprint) {
                    return $this->formatReservationResponse($existingSub->reservation_id, false);
                }
                throw new ReservationConflictException('Submission ID already used with different command payload.');
            }

            if (ReservationCommand::service($serviceId)['date'] < gmdate('Y-m-d')) {
                throw new ReservationValidationException('Offering date cannot be in the past.');
            }
            // 2. Lock domain controls in strict canonical order: fleet -> network -> schedule
            DB::table('reference_revision_control')->where('domain', 'fleet')->lockForUpdate()->first();
            DB::table('network_revision_control')->where('domain', 'network')->lockForUpdate()->first();
            DB::table('schedule_revision_control')->where('domain', 'schedules')->lockForUpdate()->first();

            // 3. Service row: lock or race-safe materialization
            $serviceRow = DB::table('mvp_services')->where('id', $serviceId)->lockForUpdate()->first();
            if ($serviceRow === null) {
                $offering = $this->authority->resolve($serviceId);
                $todayUtc = gmdate('Y-m-d');
                if ($offering['date'] < $todayUtc) {
                    throw new ReservationValidationException('Offering date cannot be in the past.');
                }

                $aircraftModel = $offering['aircraft'];

                DB::table('mvp_services')->insertOrIgnore([
                    'id' => $serviceId,
                    'schedule_id' => $offering['scheduleId'],
                    'service_date' => $offering['date'],
                    'flight_number' => $offering['number'],
                    'direction' => $offering['direction'],
                    'origin_code' => $offering['originCode'],
                    'destination_code' => $offering['destinationCode'],
                    'depart_time' => $offering['departTime'],
                    'arrive_time' => $offering['arriveTime'],
                    'duration_minutes' => $offering['durationMinutes'],
                    'aircraft_id' => $offering['aircraftId'],
                    'aircraft_snapshot' => json_encode(['model' => $aircraftModel,
                        'timing' => array_intersect_key($offering, array_flip(['originTimezone','destinationTimezone','departAt','arriveAt','arrivalDate']))], JSON_THROW_ON_ERROR),
                    'layout_snapshot' => json_encode($offering['layout'], JSON_THROW_ON_ERROR),
                    'reference_revisions' => json_encode($offering['revisions'], JSON_THROW_ON_ERROR),
                    'classification' => $offering['classification'],
                    'price_minor' => 0,
                    'created_at' => DatabaseClock::now(),
                    'updated_at' => DatabaseClock::now(),
                ]);

                $serviceRow = DB::table('mvp_services')->where('id', $serviceId)->lockForUpdate()->first();
                if (!$serviceRow) {
                    throw new ReservationValidationException('Failed to materialize service row.');
                }
            } else {
                // Revalidate actual offering within locked transaction
                $offering = $this->authority->resolve($serviceId);
                $todayUtc = gmdate('Y-m-d');
                if ($offering['date'] < $todayUtc) {
                    throw new ReservationValidationException('Offering date cannot be in the past.');
                }

                $frozenLayout = json_decode((string) $serviceRow->layout_snapshot, true, 512, JSON_THROW_ON_ERROR);
                $frozenAircraft = json_decode((string) $serviceRow->aircraft_snapshot, true, 512, JSON_THROW_ON_ERROR);
                $currentTiming = array_intersect_key($offering, array_flip(['originTimezone', 'destinationTimezone', 'departAt', 'arriveAt', 'arrivalDate']));
                if ((string) $serviceRow->aircraft_id !== (string) $offering['aircraftId'] || $frozenLayout != $offering['layout']
                    || $serviceRow->flight_number !== $offering['number']
                    || $serviceRow->depart_time !== $offering['departTime']
                    || $serviceRow->arrive_time !== $offering['arriveTime']
                    || (int) $serviceRow->duration_minutes !== $offering['durationMinutes']
                    || $frozenAircraft['model'] !== $offering['aircraft']
                    || (isset($frozenAircraft['timing']) && $frozenAircraft['timing'] != $currentTiming)) {
                    throw new ReservationReferenceChangedException('Offering layout or aircraft has changed since service was materialized.');
                }
            }

            // 4. Lock meal control after service lock
            DB::table('meal_revision_control')->where('domain', 'meals')->lockForUpdate()->first();

            // 5. Fresh time & session authority recheck AFTER blocking on locks
            $now = DatabaseClock::now();

            $freshSession = DB::table('passenger_sessions')->where('id', $session->sessionId)->first();
            if (!$freshSession || $freshSession->revoked_at !== null) {
                throw new ReservationSessionExpiredException('Session revoked.');
            }
            if ($now->greaterThanOrEqualTo(CarbonImmutable::parse($freshSession->absolute_expires_at))
                || $now->greaterThanOrEqualTo(CarbonImmutable::parse($freshSession->idle_expires_at))) {
                throw new ReservationSessionExpiredException('Session expired while waiting for lock.');
            }

            $freshUser = DB::table('users')->where('id', $userId)->first();
            if (!$freshUser || $freshUser->status !== 'active' || (int) $freshUser->credential_epoch !== (int) $freshSession->credential_epoch) {
                throw new ReservationSessionExpiredException('User or credential epoch invalid.');
            }

            if (!$authorize || $authorize()->sessionId !== $session->sessionId) throw new HttpException(401);
            // 7. Physical seats validation in authoritative frozen layout
            $layout = json_decode((string) $serviceRow->layout_snapshot, true, 512, JSON_THROW_ON_ERROR);
            $validLetters = $layout['letters'];
            $maxRows = (int) $layout['rows'];
            $unavailableSeats = array_flip($layout['unavailable'] ?? []);

            foreach ($command['passengers'] as $p) {
                $seat = $p['seatCode'];
                if (preg_match('/\A(\d+)([A-Z])\z/', $seat, $m) !== 1) {
                    throw new ReservationValidationException("Seat {$seat} is malformed.");
                }
                $row = (int) $m[1];
                $letter = $m[2];
                if ($row < 1 || $row > $maxRows || !in_array($letter, $validLetters, true) || isset($unavailableSeats[$seat])) {
                    throw new ReservationValidationException("Seat {$seat} is not a valid or available physical seat.");
                }
            }

            // 8. Seat claim check
            $requestedSeats = array_column($command['passengers'], 'seatCode');
            $existingClaims = DB::table('mvp_reservation_seat_claims')
                ->where('service_id', $serviceId)
                ->whereIn('seat_code', $requestedSeats)
                ->lockForUpdate()
                ->pluck('seat_code')
                ->all();

            if (!empty($existingClaims)) {
                throw new ReservationConflictException('One or more requested seats are already occupied.');
            }

            // 9. Meal validation: reject retired/inactive meals, snapshot active meal bilingual label
            $mealSnapshots = [];
            foreach ($command['passengers'] as $p) {
                if ($p['mealId'] !== null) {
                    $mealRow = DB::table('meal_options')->where('id', $p['mealId'])->where('active', true)->first();
                    if (!$mealRow) {
                        throw new ReservationValidationException("Meal {$p['mealId']} is not active or does not exist.");
                    }
                    $mealSnapshots[$p['id']] = [
                        'id' => (string) $mealRow->id,
                        'label' => [
                            'en' => (string) $mealRow->label_en,
                            'ar' => (string) $mealRow->label_ar,
                        ],
                    ];
                } else {
                    $mealSnapshots[$p['id']] = null;
                }
            }

            // 10. Generate unique reference and ID
            $ref = $this->generateUniqueReference();
            $reservationId = (string) Str::uuid();

            $ticketSnapshot = $this->buildTicketSnapshot($reservationId, $ref, $serviceRow, $command, $mealSnapshots, $now);
            $flightSnapshot = $this->buildFlightSnapshot($serviceRow);

            // 11. Atomic database writes
            DB::table('mvp_reservations')->insert([
                'id' => $reservationId,
                'reference' => $ref,
                'owner_user_id' => $userId,
                'service_id' => $serviceId,
                'status' => 'confirmed',
                'contact_email' => $command['contact']['email'],
                'contact_phone' => $command['contact']['phone'],
                'passenger_count' => count($command['passengers']),
                'flight_snapshot' => json_encode($flightSnapshot, JSON_THROW_ON_ERROR),
                'ticket_snapshot' => json_encode($ticketSnapshot, JSON_THROW_ON_ERROR),
                'created_at' => $now->toIso8601String(),
                'updated_at' => $now->toIso8601String(),
                'cancelled_at' => null,
            ]);

            foreach ($command['passengers'] as $p) {
                $pUuid = (string) Str::uuid();
                $mealSnap = $mealSnapshots[$p['id']] ?? null;

                DB::table('mvp_reservation_passengers')->insert([
                    'id' => $pUuid,
                    'reservation_id' => $reservationId,
                    'passenger_client_id' => $p['id'],
                    'type' => $p['type'],
                    'first_name' => $p['firstName'],
                    'last_name' => $p['lastName'],
                    'dob' => $p['dob'],
                    'nationality' => $p['nationality'],
                    'document' => $p['document'],
                    'seat_code' => $p['seatCode'],
                    'meal_id' => $p['mealId'],
                    'meal_snapshot' => $mealSnap !== null ? json_encode($mealSnap, JSON_THROW_ON_ERROR) : null,
                    'created_at' => $now->toIso8601String(),
                ]);

                DB::table('mvp_reservation_seat_claims')->insert([
                    'service_id' => $serviceId,
                    'seat_code' => $p['seatCode'],
                    'reservation_id' => $reservationId,
                    'passenger_id' => $pUuid,
                    'claimed_at' => $now->toIso8601String(),
                ]);

                DB::table('mvp_reservation_seat_claim_history')->insert([
                    'service_id' => $serviceId,
                    'seat_code' => $p['seatCode'],
                    'reservation_id' => $reservationId,
                    'passenger_id' => $pUuid,
                    'action' => 'claimed',
                    'created_at' => $now->toIso8601String(),
                ]);
            }

            DB::table('mvp_reservation_submissions')->insert([
                'owner_user_id' => $userId,
                'submission_id' => $submissionId,
                'command_fingerprint' => $fingerprint,
                'reservation_id' => $reservationId,
                'created_at' => $now->toIso8601String(),
            ]);

            // Exactly ONE logical mail intent row
            DB::table('mvp_reservation_mail_intents')->insert([
                'id' => (string) Str::uuid(),
                'reservation_id' => $reservationId,
                'recipient_email' => $command['contact']['email'],
                'status' => 'pending',
                'payload' => json_encode($ticketSnapshot, JSON_THROW_ON_ERROR),
                'created_at' => $now->toIso8601String(),
                'updated_at' => $now->toIso8601String(),
            ]);

            DB::table('mvp_reservation_audits')->insert([
                'reservation_id' => $reservationId,
                'actor_type' => 'passenger',
                'actor_id' => (string) $userId,
                'action' => 'created',
                'details' => json_encode(['submissionId' => $submissionId], JSON_THROW_ON_ERROR),
                'created_at' => $now->toIso8601String(),
            ]);

            return $this->formatReservationResponse($reservationId, true);
        });
        } catch (QueryException $e) {
            if (DatabaseFailure::isDuplicate($e)) {
                throw new ReservationConflictException('Reservation conflict.');
            }
            throw $e;
        }
    }

    public function getReservations(PassengerSessionContext $session, int $page = 1, int $limit = 20): array
    {
        $userId = $session->getUserId();
        $limit = max(1, min(50, $limit));
        $page = max(1, $page);
        $offset = ($page - 1) * $limit;

        $query = DB::table('mvp_reservations')->where('owner_user_id', $userId);
        $total = $query->count();
        $totalPages = (int) ceil($total / $limit);

        $rows = $query->orderBy('created_at', 'desc')
            ->offset($offset)
            ->limit($limit)
            ->get();

        $items = [];
        foreach ($rows as $row) {
            $flight = json_decode((string) $row->flight_snapshot, true, 512, JSON_THROW_ON_ERROR);
            $items[] = [
                'id' => (string) $row->id,
                'reference' => (string) $row->reference,
                'status' => (string) $row->status,
                'serviceId' => (string) $row->service_id,
                'flightNumber' => (string) ($flight['flightNumber'] ?? ''),
                'date' => (string) ($flight['date'] ?? ''),
                'originCode' => (string) ($flight['originCode'] ?? ''),
                'destinationCode' => (string) ($flight['destinationCode'] ?? ''),
                'passengerCount' => (int) $row->passenger_count,
                'createdAt' => (string) $row->created_at,
            ];
        }

        return [
            'items' => $items,
            'pagination' => [
                'page' => $page,
                'limit' => $limit,
                'total' => $total,
                'totalPages' => $totalPages,
            ],
        ];
    }

    public function getReservationByRef(string $ref, PassengerSessionContext $session): array
    {
        $userId = $session->getUserId();
        $row = DB::table('mvp_reservations')->where('reference', $ref)->first();
        if (!$row || $row->owner_user_id !== $userId) {
            throw new ReservationNotFoundException();
        }

        return $this->formatReservationResponse($row->id, false);
    }

    public function cancelReservation(string $ref, PassengerSessionContext $session, ?Closure $authorize = null): array
    {
        $userId = $session->getUserId();
        if ($userId === null) {
            throw new ReservationValidationException('Authenticated passenger user ID required.');
        }

        return DB::transaction(function () use ($ref, $session, $userId, $authorize): array {
            $row = DB::table('mvp_reservations')->where('reference', $ref)->first();
            if (!$row || $row->owner_user_id !== $userId) {
                throw new ReservationNotFoundException();
            }

            // 1. Lock principal and session
            $user = DB::table('users')->where('id', $userId)->lockForUpdate()->first();
            if (!$user || $user->status !== 'active') {
                throw new ReservationSessionExpiredException('User is not active.');
            }

            $sessionRow = DB::table('passenger_sessions')->where('id', $session->sessionId)->lockForUpdate()->first();
            if (!$sessionRow || $sessionRow->revoked_at !== null) {
                throw new ReservationSessionExpiredException('Session revoked.');
            }

            if ((int) $user->credential_epoch !== (int) $sessionRow->credential_epoch) {
                throw new ReservationSessionExpiredException('Credential epoch mismatch.');
            }

            // 2. Lock domain revision controls in canonical order: fleet -> network -> schedule
            DB::table('reference_revision_control')->where('domain', 'fleet')->lockForUpdate()->first();
            DB::table('network_revision_control')->where('domain', 'network')->lockForUpdate()->first();
            DB::table('schedule_revision_control')->where('domain', 'schedules')->lockForUpdate()->first();

            // 3. Service and reservation lock
            DB::table('mvp_services')->where('id', $row->service_id)->lockForUpdate()->first();
            $lockedRes = DB::table('mvp_reservations')->where('id', $row->id)->lockForUpdate()->first();

            // 4. Fresh time & session check AFTER locks
            $now = DatabaseClock::now();

            $freshSession = DB::table('passenger_sessions')->where('id', $session->sessionId)->first();
            if (!$freshSession || $freshSession->revoked_at !== null) {
                throw new ReservationSessionExpiredException('Session revoked.');
            }
            if ($now->greaterThanOrEqualTo(CarbonImmutable::parse($freshSession->absolute_expires_at))
                || $now->greaterThanOrEqualTo(CarbonImmutable::parse($freshSession->idle_expires_at))) {
                throw new ReservationSessionExpiredException('Session expired while waiting for lock.');
            }

            if (!$authorize || $authorize()->sessionId !== $session->sessionId) throw new HttpException(401);
            if ($lockedRes->status === 'cancelled') {
                return [
                    'reference' => $ref,
                    'status' => 'cancelled',
                    'changed' => false,
                    'cancelledAt' => $lockedRes->cancelled_at,
                ];
            }

            $claims = DB::table('mvp_reservation_seat_claims')->where('reservation_id', $lockedRes->id)->get();
            foreach ($claims as $claim) {
                DB::table('mvp_reservation_seat_claim_history')->insert([
                    'service_id' => $claim->service_id,
                    'seat_code' => $claim->seat_code,
                    'reservation_id' => $claim->reservation_id,
                    'passenger_id' => $claim->passenger_id,
                    'action' => 'released',
                    'created_at' => $now->toIso8601String(),
                ]);
            }
            DB::table('mvp_reservation_seat_claims')->where('reservation_id', $lockedRes->id)->delete();

            DB::table('mvp_reservations')->where('id', $lockedRes->id)->update([
                'status' => 'cancelled',
                'cancelled_at' => $now->toIso8601String(),
                'updated_at' => $now->toIso8601String(),
            ]);

            DB::table('mvp_reservation_audits')->insert([
                'reservation_id' => $lockedRes->id,
                'actor_type' => 'passenger',
                'actor_id' => (string) $userId,
                'action' => 'cancelled',
                'details' => json_encode(['actor' => 'owner'], JSON_THROW_ON_ERROR),
                'created_at' => $now->toIso8601String(),
            ]);

            return [
                'reference' => $ref,
                'status' => 'cancelled',
                'changed' => true,
                'cancelledAt' => $now->toIso8601String(),
            ];
        });
    }

    public function getReservationTicket(string $ref, PassengerSessionContext $session): array
    {
        $userId = $session->getUserId();
        $row = DB::table('mvp_reservations')->where('reference', $ref)->first();
        if (!$row || $row->owner_user_id !== $userId) {
            throw new ReservationNotFoundException();
        }

        $ticket = json_decode((string) $row->ticket_snapshot, true, 512, JSON_THROW_ON_ERROR);
        $ticket['status'] = (string) $row->status;
        foreach ($ticket['tickets'] as &$t) {
            $t['status'] = (string) $row->status;
        }
        unset($t);

        return [
            'reference' => (string) $row->reference,
            'status' => (string) $row->status,
            'tickets' => $ticket['tickets'],
        ];
    }

    public function getAdminReservations(int $page = 1, int $limit = 20, ?string $search = null): array
    {
        $limit = max(1, min(50, $limit));
        $page = max(1, $page);
        $offset = ($page - 1) * $limit;

        $query = DB::table('mvp_reservations');
        if ($search !== null && trim($search) !== '') {
            $s = trim($search);
            $query->where(function ($q) use ($s) {
                $q->whereRaw('LOWER(reference) LIKE LOWER(?)', ["%{$s}%"])
                    ->orWhereRaw('LOWER(contact_email) LIKE LOWER(?)', ["%{$s}%"])
                    ->orWhereRaw('LOWER(service_id) LIKE LOWER(?)', ["%{$s}%"]);
            });
        }

        $total = $query->count();
        $totalPages = (int) ceil($total / $limit);

        $rows = $query->orderBy('created_at', 'desc')
            ->offset($offset)
            ->limit($limit)
            ->get();

        $items = [];
        foreach ($rows as $row) {
            $flight = json_decode((string) $row->flight_snapshot, true, 512, JSON_THROW_ON_ERROR);
            $items[] = [
                'id' => (string) $row->id,
                'reference' => (string) $row->reference,
                'ownerUserId' => (string) $row->owner_user_id,
                'status' => (string) $row->status,
                'serviceId' => (string) $row->service_id,
                'flightNumber' => (string) ($flight['flightNumber'] ?? ''),
                'date' => (string) ($flight['date'] ?? ''),
                'originCode' => (string) ($flight['originCode'] ?? ''),
                'destinationCode' => (string) ($flight['destinationCode'] ?? ''),
                'passengerCount' => (int) $row->passenger_count,
                'contactEmail' => (string) $row->contact_email,
                'createdAt' => (string) $row->created_at,
            ];
        }

        return [
            'items' => $items,
            'pagination' => [
                'page' => $page,
                'limit' => $limit,
                'total' => $total,
                'totalPages' => $totalPages,
            ],
        ];
    }

    public function getAdminReservationByRef(string $ref): array
    {
        $row = DB::table('mvp_reservations')->where('reference', $ref)->first();
        if (!$row) {
            throw new ReservationNotFoundException();
        }

        $formatted = $this->formatReservationResponse($row->id, false);
        $audits = DB::table('mvp_reservation_audits')
            ->where('reservation_id', $row->id)
            ->orderBy('created_at')
            ->get();

        $auditList = [];
        foreach ($audits as $a) {
            $auditList[] = [
                'id' => (int) $a->id,
                'actorType' => (string) $a->actor_type,
                'actorId' => (string) $a->actor_id,
                'action' => (string) $a->action,
                'details' => json_decode((string) $a->details, true, 512, JSON_THROW_ON_ERROR),
                'createdAt' => (string) $a->created_at,
            ];
        }

        $formatted['reservation']['ownerUserId'] = (string) $row->owner_user_id;
        $formatted['reservation']['audits'] = $auditList;

        return $formatted;
    }

    public function cancelAdminReservation(string $ref, StaffSessionContext $session, ?Closure $authorize = null): array
    {
        $staffId = $session->getStaffId();
        if ($staffId === null) {
            throw new ReservationValidationException('Staff session required.');
        }

        return DB::transaction(function () use ($ref, $session, $staffId, $authorize): array {
            $row = DB::table('mvp_reservations')->where('reference', $ref)->first();
            if (!$row) {
                throw new ReservationNotFoundException();
            }

            // 1. Lock staff user and session
            $staff = DB::table('staff_users')->where('id', $staffId)->lockForUpdate()->first();
            if (!$staff || $staff->status !== 'active') {
                throw new ReservationSessionExpiredException('Staff user not active.');
            }

            $staffSession = DB::table('staff_sessions')->where('id', $session->sessionId)->lockForUpdate()->first();
            if (!$staffSession || $staffSession->revoked_at !== null) {
                throw new ReservationSessionExpiredException('Staff session revoked.');
            }

            // 2. Lock domain revision controls in canonical order: fleet -> network -> schedule
            DB::table('reference_revision_control')->where('domain', 'fleet')->lockForUpdate()->first();
            DB::table('network_revision_control')->where('domain', 'network')->lockForUpdate()->first();
            DB::table('schedule_revision_control')->where('domain', 'schedules')->lockForUpdate()->first();

            // 3. Service and reservation lock
            DB::table('mvp_services')->where('id', $row->service_id)->lockForUpdate()->first();
            $lockedRes = DB::table('mvp_reservations')->where('id', $row->id)->lockForUpdate()->first();

            // 4. Fresh time & staff session check AFTER locks
            $now = DatabaseClock::now();

            $freshSession = DB::table('staff_sessions')->where('id', $session->sessionId)->first();
            if (!$freshSession || $freshSession->revoked_at !== null) {
                throw new ReservationSessionExpiredException('Staff session revoked.');
            }
            if ($now->greaterThanOrEqualTo(CarbonImmutable::parse($freshSession->absolute_expires_at))
                || $now->greaterThanOrEqualTo(CarbonImmutable::parse($freshSession->idle_expires_at))) {
                throw new ReservationSessionExpiredException('Staff session expired while waiting for lock.');
            }

            if (!$authorize || $authorize()->sessionId !== $session->sessionId) throw new HttpException(401);
            if ($lockedRes->status === 'cancelled') {
                return [
                    'reference' => $ref,
                    'status' => 'cancelled',
                    'changed' => false,
                    'cancelledAt' => $lockedRes->cancelled_at,
                ];
            }

            $claims = DB::table('mvp_reservation_seat_claims')->where('reservation_id', $lockedRes->id)->get();
            foreach ($claims as $claim) {
                DB::table('mvp_reservation_seat_claim_history')->insert([
                    'service_id' => $claim->service_id,
                    'seat_code' => $claim->seat_code,
                    'reservation_id' => $claim->reservation_id,
                    'passenger_id' => $claim->passenger_id,
                    'action' => 'released',
                    'created_at' => $now->toIso8601String(),
                ]);
            }
            DB::table('mvp_reservation_seat_claims')->where('reservation_id', $lockedRes->id)->delete();

            DB::table('mvp_reservations')->where('id', $lockedRes->id)->update([
                'status' => 'cancelled',
                'cancelled_at' => $now->toIso8601String(),
                'updated_at' => $now->toIso8601String(),
            ]);

            DB::table('mvp_reservation_audits')->insert([
                'reservation_id' => $lockedRes->id,
                'actor_type' => 'staff',
                'actor_id' => (string) $staffId,
                'action' => 'cancelled',
                'details' => json_encode(['role' => $session->role], JSON_THROW_ON_ERROR),
                'created_at' => $now->toIso8601String(),
            ]);

            return [
                'reference' => $ref,
                'status' => 'cancelled',
                'changed' => true,
                'cancelledAt' => $now->toIso8601String(),
            ];
        });
    }

    private function generateUniqueReference(): string
    {
        $alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        for ($i = 0; $i < 20; $i++) {
            $code = '';
            for ($c = 0; $c < 4; $c++) {
                $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }
            $ref = 'GZA-' . $code;
            if (!DB::table('mvp_reservations')->where('reference', $ref)->exists()) {
                return $ref;
            }
        }
        return 'GZA-' . strtoupper(bin2hex(random_bytes(3)));
    }

    private function buildFlightSnapshot(object $serviceRow): array
    {
        $aircraft = json_decode((string) $serviceRow->aircraft_snapshot, true, 512, JSON_THROW_ON_ERROR);
        $model = $aircraft['model'];
        return array_merge([
            'serviceId' => (string) $serviceRow->id,
            'flightNumber' => (string) $serviceRow->flight_number,
            'date' => (string) $serviceRow->service_date,
            'direction' => (string) $serviceRow->direction,
            'originCode' => (string) $serviceRow->origin_code,
            'destinationCode' => (string) $serviceRow->destination_code,
            'departTime' => (string) $serviceRow->depart_time,
            'arriveTime' => (string) $serviceRow->arrive_time,
            'durationMinutes' => (int) $serviceRow->duration_minutes,
            'aircraftModel' => $model,
        ], $aircraft['timing'] ?? []);
    }

    private function buildTicketSnapshot(
        string $reservationId,
        string $reference,
        object $serviceRow,
        array $command,
        array $mealSnapshots,
        CarbonImmutable $issuedAt
    ): array {
        $aircraft = json_decode((string) $serviceRow->aircraft_snapshot, true, 512, JSON_THROW_ON_ERROR);
        $model = $aircraft['model'];
        $flight = array_merge([
            'serviceId' => (string) $serviceRow->id,
            'flightNumber' => (string) $serviceRow->flight_number,
            'date' => (string) $serviceRow->service_date,
            'originCode' => (string) $serviceRow->origin_code,
            'destinationCode' => (string) $serviceRow->destination_code,
            'departTime' => (string) $serviceRow->depart_time,
            'arriveTime' => (string) $serviceRow->arrive_time,
            'aircraftModel' => $model,
        ], $aircraft['timing'] ?? []);

        $tickets = [];
        $idx = 1;
        foreach ($command['passengers'] as $p) {
            $meal = $mealSnapshots[$p['id']] ?? null;
            $tickets[] = [
                'ticketNumber' => sprintf('TKT-%s-%d', $reference, $idx++),
                'reference' => $reference,
                'status' => 'confirmed',
                'issuedAt' => $issuedAt->toIso8601String(),
                'passenger' => [
                    'id' => $p['id'],
                    'type' => $p['type'],
                    'firstName' => $p['firstName'],
                    'lastName' => $p['lastName'],
                    'nationality' => $p['nationality'],
                    'seatCode' => $p['seatCode'],
                    'meal' => $meal,
                ],
                'flight' => $flight,
                'contact' => $command['contact'],
            ];
        }

        return [
            'reference' => $reference,
            'status' => 'confirmed',
            'issuedAt' => $issuedAt->toIso8601String(),
            'flight' => $flight,
            'tickets' => $tickets,
            'contact' => $command['contact'],
        ];
    }

    private function formatReservationResponse(string $reservationId, bool $isNew = false): array
    {
        $res = DB::table('mvp_reservations')->where('id', $reservationId)->first();
        if (!$res) {
            throw new ReservationNotFoundException();
        }

        $passengers = DB::table('mvp_reservation_passengers')->where('reservation_id', $reservationId)->orderBy('created_at')->get();
        $flight = json_decode((string) $res->flight_snapshot, true, 512, JSON_THROW_ON_ERROR);
        $ticket = json_decode((string) $res->ticket_snapshot, true, 512, JSON_THROW_ON_ERROR);
        $ticket['status'] = (string) $res->status;
        foreach ($ticket['tickets'] as &$t) {
            $t['status'] = (string) $res->status;
        }
        unset($t);

        $passengerList = [];
        foreach ($passengers as $p) {
            $meal = $p->meal_snapshot ? json_decode((string) $p->meal_snapshot, true, 512, JSON_THROW_ON_ERROR) : null;
            $passengerList[] = [
                'id' => (string) $p->passenger_client_id,
                'type' => (string) $p->type,
                'firstName' => (string) $p->first_name,
                'lastName' => (string) $p->last_name,
                'seatCode' => (string) $p->seat_code,
                'mealId' => $p->meal_id ? (string) $p->meal_id : null,
                'mealLabel' => $meal['label'] ?? null,
            ];
        }

        return [
            'isNew' => $isNew,
            'reservation' => [
                'id' => (string) $res->id,
                'reference' => (string) $res->reference,
                'status' => (string) $res->status,
                'serviceId' => (string) $res->service_id,
                'flightNumber' => (string) ($flight['flightNumber'] ?? ''),
                'date' => (string) ($flight['date'] ?? ''),
                'originCode' => (string) ($flight['originCode'] ?? ''),
                'destinationCode' => (string) ($flight['destinationCode'] ?? ''),
                'departTime' => (string) ($flight['departTime'] ?? ''),
                'arriveTime' => (string) ($flight['arriveTime'] ?? ''),
                'contact' => [
                    'email' => (string) $res->contact_email,
                    'phone' => (string) $res->contact_phone,
                ],
                'passengers' => $passengerList,
                'createdAt' => (string) $res->created_at,
            ],
            'ticket' => $ticket,
        ];
    }
}
