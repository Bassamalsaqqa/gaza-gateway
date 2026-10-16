<?php

declare(strict_types=1);

namespace App\Mvp\Reservations;

use App\Identity\Sessions\PassengerSessionContext;
use App\Mvp\Reservations\Exceptions\ReservationAuthorityUnavailableException;
use App\Mvp\Reservations\Exceptions\ReservationConflictException;
use App\Mvp\Reservations\Exceptions\ReservationValidationException;
use App\Support\DatabaseFailure;
use Closure;
use DateTimeImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Throwable;

/**
 * Coordinates atomic two-leg round-trip reservations.
 * Acts as a bounded atomic facade over canonical ReservationCoordinator.
 */
final class ReservationTripCoordinator
{
    public function __construct(
        private readonly ReservationCoordinator $coordinator,
    ) {}

    /**
     * Executes atomic round-trip reservation for an authenticated passenger.
     *
     * @param array{
     *     submissionId: string,
     *     contact: array{email: string, phone: string},
     *     legs: array<int, array>
     * } $tripCommand Normalized output from ReservationTripCommand::parse
     * @param PassengerSessionContext $session Active passenger session
     * @param Closure|null $authorize Fresh authorization recheck closure from middleware
     * @return array{isNew: bool, reservations: array<int, array{reservation: array, ticket: array}>}
     */
    public function createTrip(
        array $tripCommand,
        PassengerSessionContext $session,
        ?Closure $authorize = null
    ): array {
        if ($session->getUserId() === null) {
            throw new ReservationValidationException('Authenticated passenger user ID required.');
        }

        return $this->executeTrip($tripCommand, $session, $authorize, isGuest: false);
    }

    /**
     * Executes atomic round-trip reservation for a guest passenger session.
     *
     * @param array{
     *     submissionId: string,
     *     contact: array{email: string, phone: string},
     *     legs: array<int, array>
     * } $tripCommand Normalized output from ReservationTripCommand::parse
     * @param PassengerSessionContext $session Active guest passenger session
     * @param Closure|null $authorize Fresh authorization recheck closure from middleware
     * @return array{isNew: bool, reservations: array<int, array{reservation: array, ticket: array}>}
     */
    public function createGuestTrip(
        array $tripCommand,
        PassengerSessionContext $session,
        ?Closure $authorize = null
    ): array {
        return $this->executeTrip($tripCommand, $session, $authorize, isGuest: true);
    }

    private function executeTrip(
        array $tripCommand,
        PassengerSessionContext $session,
        ?Closure $authorize,
        bool $isGuest
    ): array {
        $legs = $tripCommand['legs'] ?? null;
        if (!is_array($legs) || count($legs) !== 2) {
            throw new ReservationValidationException('Trip requires exactly two legs.');
        }

        try {
            return DB::transaction(function () use ($legs, $session, $authorize, $isGuest): array {
                // Leg 0 execution
                $res0 = $this->invokeLeg($legs[0], $session, $authorize, $isGuest);

                // Leg 1 execution (if this fails for any reason, DB::transaction rolls back all of Leg 0)
                $res1 = $this->invokeLeg($legs[1], $session, $authorize, $isGuest);

                // Authoritative chronology and route validation from canonical frozen ticket flight snapshots
                $this->assertAuthoritativeTripGeometry($res0, $res1);

                $isNew = ($res0['isNew'] ?? false) || ($res1['isNew'] ?? false);

                return [
                    'isNew' => $isNew,
                    'reservations' => [
                        [
                            'reservation' => $res0['reservation'],
                            'ticket' => $res0['ticket'],
                        ],
                        [
                            'reservation' => $res1['reservation'],
                            'ticket' => $res1['ticket'],
                        ],
                    ],
                ];
            });
        } catch (QueryException $e) {
            if (DatabaseFailure::isDuplicate($e)) {
                throw new ReservationConflictException('Reservation trip conflict.');
            }
            throw $e;
        }
    }

    private const RFC3339_OFFSET_REGEX = '/\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\z/';

    private function invokeLeg(
        array $legCommand,
        PassengerSessionContext $session,
        ?Closure $authorize,
        bool $isGuest
    ): array {
        if ($isGuest) {
            return $this->coordinator->createGuestReservation($legCommand, $session, $authorize);
        }

        return $this->coordinator->createReservation($legCommand, $session, $authorize);
    }

    /**
     * Validates that legs form a true round-trip with opposite airports and return departure after outbound arrival.
     * Evaluated using canonical frozen ticket flight snapshots inside the atomic transaction.
     */
    private function assertAuthoritativeTripGeometry(array $res0, array $res1): void
    {
        $flight0 = $res0['ticket']['flight'] ?? null;
        $flight1 = $res1['ticket']['flight'] ?? null;

        if (!is_array($flight0) || !is_array($flight1)) {
            throw new ReservationValidationException('Missing or invalid flight snapshot in leg response.');
        }

        $origin0 = $flight0['originCode'] ?? null;
        $dest0 = $flight0['destinationCode'] ?? null;
        $origin1 = $flight1['originCode'] ?? null;
        $dest1 = $flight1['destinationCode'] ?? null;

        if (!is_string($origin0) || !is_string($dest0) || !is_string($origin1) || !is_string($dest1)
            || $origin0 === '' || $dest0 === '' || $origin1 === '' || $dest1 === ''
            || $origin0 !== $dest1 || $dest0 !== $origin1
            || $origin0 === $dest0
        ) {
            throw new ReservationValidationException('Trip legs must have opposite origin and destination airports.');
        }

        $arriveAt0 = $flight0['arriveAt'] ?? null;
        $departAt1 = $flight1['departAt'] ?? null;

        if (!is_string($arriveAt0) || !is_string($departAt1)
            || preg_match(self::RFC3339_OFFSET_REGEX, $arriveAt0) !== 1
            || preg_match(self::RFC3339_OFFSET_REGEX, $departAt1) !== 1
        ) {
            throw new ReservationValidationException('Missing or invalid flight departure/arrival instants.');
        }

        try {
            $instArrive0 = new DateTimeImmutable($arriveAt0);
            $instDepart1 = new DateTimeImmutable($departAt1);
        } catch (Throwable) {
            throw new ReservationValidationException('Missing or invalid flight departure/arrival instants.');
        }

        if ($instDepart1 <= $instArrive0) {
            throw new ReservationValidationException('Return departure instant must be strictly after outbound arrival instant.');
        }
    }
}
