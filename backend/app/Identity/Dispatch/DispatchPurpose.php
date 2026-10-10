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
            self::PassengerEmailVerification => 'Palestinian Airlines: Verify your email address',
            self::PassengerPasswordReset => 'Palestinian Airlines: Reset your account password',
            self::StaffInvitation => 'Palestinian Airlines: Staff portal invitation',
            self::StaffPasswordReset => 'Palestinian Airlines: Reset your staff account password',
            self::BookingGuestChallenge => 'Palestinian Airlines: Booking verification code',
        };
    }
}
