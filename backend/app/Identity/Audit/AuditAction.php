<?php

declare(strict_types=1);

namespace App\Identity\Audit;

/**
 * Closed collection of the 47 authorized actions in audit_events.
 */
final class AuditAction
{
    public const array ALL = [
        // Passenger actions (23)
        'postPassengerRegister',
        'postPassengerLogin',
        'postPassengerLogout',
        'postPassengerPasswordForgot',
        'postPassengerPasswordReset',
        'postPassengerEmailVerify',
        'postPassengerEmailResend',
        'getPassengerProfile',
        'putPassengerProfile',
        'getSavedTravelers',
        'postSavedTraveler',
        'patchSavedTraveler',
        'deleteSavedTraveler',
        'getPassengerSessions',
        'deletePassengerSession',
        'putPassengerPassword',
        'postCreateGuestChallenge',
        'postVerifyGuestChallenge',
        'postCreateClaimChallenge',
        'postVerifyClaimChallenge',
        'postClaimBookingToAccount',
        'getAccountBookingsList',
        'getBookingReceipt',

        // Staff actions (15)
        'postStaffLogin',
        'postStaffLogout',
        'postStaffPasswordForgot',
        'postStaffPasswordReset',
        'putStaffPassword',
        'postStaffInvitationAccept',
        'postStaffMfaSetup',
        'postStaffMfaSetupConfirm',
        'postStaffMfaChallenge',
        'postStaffMfaVerify',
        'postStaffMfaEnrollmentSetup',
        'postStaffMfaEnrollmentConfirm',
        'postStaffMfaRecoveryCodesRegenerate',
        'postStaffStepUp',
        'getStaffSessions',
        'deleteStaffSession',
        'getStaffUsersDirectory',
        'postStaffUserInvite',
        'patchStaffUser',
        'deleteStaffUser',
        'postStaffUserInviteReissue',
        'postStaffUserInviteRevoke',

        // Security & system lifecycle actions (9)
        'auth.login_denied_unknown_subject',
        'auth.rate_limit_exceeded',
        'auth.session_revoked',
        'auth.session_expired',
        'auth.proof_exhausted',
        'auth.proof_revoked',
        'auth.security_dispatch_queued',
        'auth.security_dispatch_expired',
        'auth.security_dispatch_scrubbed',
    ];

    public static function isValid(string $action): bool
    {
        return in_array($action, self::ALL, true);
    }
}
