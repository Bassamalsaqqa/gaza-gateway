<?php

declare(strict_types=1);

namespace App\Identity\Dispatch;

/**
 * Closed enumeration of the five supported security dispatch targets.
 */
enum DispatchPurpose: string
{
    case PassengerEmailVerification = 'passenger_email_verification';
    case PassengerPasswordReset = 'passenger_password_reset';
    case StaffInvitation = 'staff_invitation';
    case StaffPasswordReset = 'staff_password_reset';
    case BookingGuestChallenge = 'booking_guest_challenge';

    public function fkColumn(): string
    {
        return match ($this) {
            self::PassengerEmailVerification => 'user_verification_id',
            self::PassengerPasswordReset => 'user_reset_id',
            self::StaffInvitation => 'staff_invitation_id',
            self::StaffPasswordReset => 'staff_reset_id',
            self::BookingGuestChallenge => 'booking_challenge_id',
        };
    }

    public function defaultSubject(): string
    {
        return match ($this) {
            self::PassengerEmailVerification => 'Palestine Airways Limited: Verify your email address',
            self::PassengerPasswordReset => 'Palestine Airways Limited: Reset your account password',
            self::StaffInvitation => 'Gaza Gateway: Admin invitation',
            self::StaffPasswordReset => 'Gaza Gateway: Admin password recovery',
            self::BookingGuestChallenge => 'Palestine Airways Limited: Booking verification code',
        };
    }
}
