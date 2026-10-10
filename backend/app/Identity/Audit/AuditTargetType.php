<?php

declare(strict_types=1);

namespace App\Identity\Audit;

enum AuditTargetType: string
{
    case User = 'user';
    case StaffUser = 'staff_user';
    case PassengerSession = 'passenger_session';
    case StaffSession = 'staff_session';
    case Booking = 'booking';
    case BookingChallenge = 'booking_challenge';
    case BookingClaimProof = 'booking_claim_proof';
    case SavedTraveler = 'saved_traveler';
    case SecurityDispatch = 'security_dispatch';
    case System = 'system';
}
