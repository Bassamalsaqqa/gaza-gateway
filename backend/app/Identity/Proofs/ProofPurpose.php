<?php

declare(strict_types=1);

namespace App\Identity\Proofs;

/**
 * Closed enumeration of the four explicit proof purposes and their database bindings.
 */
enum ProofPurpose: string
{
    case PassengerEmailVerification = 'passenger_email_verification';
    case PassengerPasswordReset = 'passenger_password_reset';
    case StaffInvitation = 'staff_invitation';
    case StaffPasswordReset = 'staff_password_reset';

    public function realm(): string
    {
        return match ($this) {
            self::PassengerEmailVerification, self::PassengerPasswordReset => 'passenger',
            self::StaffInvitation, self::StaffPasswordReset => 'staff',
        };
    }

    public function table(): string
    {
        return match ($this) {
            self::PassengerEmailVerification => 'user_email_verifications',
            self::PassengerPasswordReset => 'user_password_resets',
            self::StaffInvitation => 'staff_invitations',
            self::StaffPasswordReset => 'staff_password_resets',
        };
    }

    public function principalColumn(): string
    {
        return match ($this) {
            self::PassengerEmailVerification, self::PassengerPasswordReset => 'user_id',
            self::StaffInvitation, self::StaffPasswordReset => 'staff_id',
        };
    }

    public function principalTable(): string
    {
        return match ($this) {
            self::PassengerEmailVerification, self::PassengerPasswordReset => 'users',
            self::StaffInvitation, self::StaffPasswordReset => 'staff_users',
        };
    }

    public function defaultTtlSeconds(): int
    {
        return match ($this) {
            self::PassengerEmailVerification, self::StaffInvitation => 86400, // 24 hours
            self::PassengerPasswordReset, self::StaffPasswordReset => 1800,  // 30 minutes
        };
    }

    public function outboxFkColumn(): string
    {
        return match ($this) {
            self::PassengerEmailVerification => 'user_verification_id',
            self::PassengerPasswordReset => 'user_reset_id',
            self::StaffInvitation => 'staff_invitation_id',
            self::StaffPasswordReset => 'staff_reset_id',
        };
    }
}
