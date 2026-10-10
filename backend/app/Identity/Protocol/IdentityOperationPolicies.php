<?php

declare(strict_types=1);

namespace App\Identity\Protocol;

/**
 * Closed, server-owned identity operation policies deterministically generated
 * from docs/backend/operation-policies.v1.json.
 *
 * Total operations: 41
 * Source SHA-256 Digest: 73fb8ab0b908a9100876ec65b6c3d17874e4600efffc83a76e2262c3e6700939
 */
final class IdentityOperationPolicies
{
    public const SOURCE_DIGEST = '73fb8ab0b908a9100876ec65b6c3d17874e4600efffc83a76e2262c3e6700939';

    /**
     * Map of "METHOD:PATH" => OperationPolicy metadata.
     *
     * @var array<string, array<string, mixed>>
     */
    public const OPERATIONS = [
        'GET:/auth/csrf' => [
            'operationId' => 'getAuthCsrfBootstrap',
            'method' => 'GET',
            'path' => '/auth/csrf',
            'intent' => 'protocol',
            'realm' => 'passenger',
            'branch' => 'cookie',
            'requiresOrigin' => false,
            'requiresCsrf' => false,
            'csrfHeader' => null,
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [],
            'branchConditions' => [],
        ],
        'POST:/auth/email/resend' => [
            'operationId' => 'postPassengerEmailResend',
            'method' => 'POST',
            'path' => '/auth/email/resend',
            'intent' => 'protocol',
            'realm' => 'anonymous',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [],
            'branchConditions' => [],
        ],
        'POST:/auth/email/verify' => [
            'operationId' => 'postPassengerEmailVerify',
            'method' => 'POST',
            'path' => '/auth/email/verify',
            'intent' => 'protocol',
            'realm' => 'anonymous',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [],
            'branchConditions' => [],
        ],
        'POST:/auth/login' => [
            'operationId' => 'postPassengerLogin',
            'method' => 'POST',
            'path' => '/auth/login',
            'intent' => 'protocol',
            'realm' => 'anonymous',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [],
            'branchConditions' => [],
        ],
        'POST:/auth/logout' => [
            'operationId' => 'postPassengerLogout',
            'method' => 'POST',
            'path' => '/auth/logout',
            'intent' => 'protected',
            'realm' => 'passenger',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [
                [
                    'PassengerCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'PassengerCookieAuth',
                    'condition' => 'authenticated_passenger_self',
                ],
            ],
        ],
        'PUT:/auth/passenger/password' => [
            'operationId' => 'putPassengerPassword',
            'method' => 'PUT',
            'path' => '/auth/passenger/password',
            'intent' => 'protected',
            'realm' => 'passenger',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [
                [
                    'PassengerCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'PassengerCookieAuth',
                    'condition' => 'authenticated_passenger_self',
                ],
            ],
        ],
        'GET:/auth/passenger/profile' => [
            'operationId' => 'getPassengerProfile',
            'method' => 'GET',
            'path' => '/auth/passenger/profile',
            'intent' => 'protected',
            'realm' => 'passenger',
            'branch' => 'cookie',
            'requiresOrigin' => false,
            'requiresCsrf' => false,
            'csrfHeader' => null,
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [
                [
                    'PassengerCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'PassengerCookieAuth',
                    'condition' => 'authenticated_passenger_self',
                ],
            ],
        ],
        'PUT:/auth/passenger/profile' => [
            'operationId' => 'putPassengerProfile',
            'method' => 'PUT',
            'path' => '/auth/passenger/profile',
            'intent' => 'protected',
            'realm' => 'passenger',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [
                [
                    'PassengerCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'PassengerCookieAuth',
                    'condition' => 'authenticated_passenger_self',
                ],
            ],
        ],
        'GET:/auth/passenger/sessions' => [
            'operationId' => 'getPassengerSessions',
            'method' => 'GET',
            'path' => '/auth/passenger/sessions',
            'intent' => 'protected',
            'realm' => 'passenger',
            'branch' => 'cookie',
            'requiresOrigin' => false,
            'requiresCsrf' => false,
            'csrfHeader' => null,
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [
                [
                    'PassengerCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'PassengerCookieAuth',
                    'condition' => 'authenticated_passenger_self',
                ],
            ],
        ],
        'DELETE:/auth/passenger/sessions/{id}' => [
            'operationId' => 'deletePassengerSession',
            'method' => 'DELETE',
            'path' => '/auth/passenger/sessions/{id}',
            'intent' => 'protected',
            'realm' => 'passenger',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [
                [
                    'PassengerCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'PassengerCookieAuth',
                    'condition' => 'authenticated_passenger_self',
                ],
            ],
        ],
        'GET:/auth/passenger/travelers' => [
            'operationId' => 'getSavedTravelers',
            'method' => 'GET',
            'path' => '/auth/passenger/travelers',
            'intent' => 'protected',
            'realm' => 'passenger',
            'branch' => 'cookie',
            'requiresOrigin' => false,
            'requiresCsrf' => false,
            'csrfHeader' => null,
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [
                [
                    'PassengerCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'PassengerCookieAuth',
                    'condition' => 'authenticated_passenger_self',
                ],
            ],
        ],
        'POST:/auth/passenger/travelers' => [
            'operationId' => 'postSavedTraveler',
            'method' => 'POST',
            'path' => '/auth/passenger/travelers',
            'intent' => 'protected',
            'realm' => 'passenger',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [
                [
                    'PassengerCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'PassengerCookieAuth',
                    'condition' => 'authenticated_passenger_self',
                ],
            ],
        ],
        'DELETE:/auth/passenger/travelers/{id}' => [
            'operationId' => 'deleteSavedTraveler',
            'method' => 'DELETE',
            'path' => '/auth/passenger/travelers/{id}',
            'intent' => 'protected',
            'realm' => 'passenger',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [
                [
                    'PassengerCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'PassengerCookieAuth',
                    'condition' => 'authenticated_passenger_self',
                ],
            ],
        ],
        'PATCH:/auth/passenger/travelers/{id}' => [
            'operationId' => 'patchSavedTraveler',
            'method' => 'PATCH',
            'path' => '/auth/passenger/travelers/{id}',
            'intent' => 'protected',
            'realm' => 'passenger',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [
                [
                    'PassengerCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'PassengerCookieAuth',
                    'condition' => 'authenticated_passenger_self',
                ],
            ],
        ],
        'POST:/auth/password/forgot' => [
            'operationId' => 'postPassengerPasswordForgot',
            'method' => 'POST',
            'path' => '/auth/password/forgot',
            'intent' => 'protocol',
            'realm' => 'anonymous',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [],
            'branchConditions' => [],
        ],
        'POST:/auth/password/reset' => [
            'operationId' => 'postPassengerPasswordReset',
            'method' => 'POST',
            'path' => '/auth/password/reset',
            'intent' => 'protocol',
            'realm' => 'anonymous',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [],
            'branchConditions' => [],
        ],
        'POST:/auth/register' => [
            'operationId' => 'postPassengerRegister',
            'method' => 'POST',
            'path' => '/auth/register',
            'intent' => 'protocol',
            'realm' => 'anonymous',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [],
            'branchConditions' => [],
        ],
        'GET:/staff/csrf' => [
            'operationId' => 'getStaffCsrfBootstrap',
            'method' => 'GET',
            'path' => '/staff/csrf',
            'intent' => 'protocol',
            'realm' => 'staff',
            'branch' => 'cookie',
            'requiresOrigin' => false,
            'requiresCsrf' => false,
            'csrfHeader' => null,
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [],
            'branchConditions' => [],
        ],
        'POST:/staff/invitations/accept' => [
            'operationId' => 'postStaffInvitationAccept',
            'method' => 'POST',
            'path' => '/staff/invitations/accept',
            'intent' => 'protocol',
            'realm' => 'anonymous',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [],
            'branchConditions' => [],
        ],
        'POST:/staff/login' => [
            'operationId' => 'postStaffLogin',
            'method' => 'POST',
            'path' => '/staff/login',
            'intent' => 'protocol',
            'realm' => 'anonymous',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [],
            'branchConditions' => [],
        ],
        'POST:/staff/logout' => [
            'operationId' => 'postStaffLogout',
            'method' => 'POST',
            'path' => '/staff/logout',
            'intent' => 'protected',
            'realm' => 'staff',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [
                [
                    'StaffCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'StaffCookieAuth',
                    'condition' => 'authenticated_staff_self',
                    'requiredPermission' => null,
                    'requiresActive' => true,
                ],
            ],
        ],
        'GET:/staff/me' => [
            'operationId' => 'getStaffMe',
            'method' => 'GET',
            'path' => '/staff/me',
            'intent' => 'protected',
            'realm' => 'staff',
            'branch' => 'cookie',
            'requiresOrigin' => false,
            'requiresCsrf' => false,
            'csrfHeader' => null,
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [
                [
                    'StaffCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'StaffCookieAuth',
                    'condition' => 'authenticated_staff_self',
                    'requiredPermission' => null,
                    'requiresActive' => true,
                ],
            ],
        ],
        'POST:/staff/mfa/challenge' => [
            'operationId' => 'postStaffMfaChallenge',
            'method' => 'POST',
            'path' => '/staff/mfa/challenge',
            'intent' => 'protected',
            'realm' => 'staff_pending',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [
                [
                    'StaffPreAuthCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'StaffPreAuthCookieAuth',
                    'condition' => 'pending_staff_mfa',
                    'purpose' => 'login_mfa',
                    'allowedEndpoint' => 'postStaffMfaChallenge',
                    'requiresBoundSession' => true,
                    'requiresUnexpired' => true,
                    'requiresRevocationValid' => true,
                ],
            ],
        ],
        'POST:/staff/mfa/enrollment/confirm' => [
            'operationId' => 'postStaffMfaEnrollmentConfirm',
            'method' => 'POST',
            'path' => '/staff/mfa/enrollment/confirm',
            'intent' => 'protected',
            'realm' => 'staff_pending',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [
                [
                    'StaffPreAuthCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'StaffPreAuthCookieAuth',
                    'condition' => 'pending_staff_mfa',
                    'purpose' => 'enroll_mfa',
                    'allowedEndpoint' => 'postStaffMfaEnrollmentConfirm',
                    'requiresBoundSession' => true,
                    'requiresUnexpired' => true,
                    'requiresRevocationValid' => true,
                ],
            ],
        ],
        'POST:/staff/mfa/enrollment/setup' => [
            'operationId' => 'postStaffMfaEnrollmentSetup',
            'method' => 'POST',
            'path' => '/staff/mfa/enrollment/setup',
            'intent' => 'protected',
            'realm' => 'staff_pending',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [
                [
                    'StaffPreAuthCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'StaffPreAuthCookieAuth',
                    'condition' => 'pending_staff_mfa',
                    'purpose' => 'enroll_mfa',
                    'allowedEndpoint' => 'postStaffMfaEnrollmentSetup',
                    'requiresBoundSession' => true,
                    'requiresUnexpired' => true,
                    'requiresRevocationValid' => true,
                ],
            ],
        ],
        'POST:/staff/mfa/recovery-codes/regenerate' => [
            'operationId' => 'postStaffMfaRecoveryCodesRegenerate',
            'method' => 'POST',
            'path' => '/staff/mfa/recovery-codes/regenerate',
            'intent' => 'protected',
            'realm' => 'staff',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => true,
            'allowedSecurity' => [
                [
                    'StaffCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'StaffCookieAuth',
                    'condition' => 'authenticated_staff_self',
                    'requiredPermission' => null,
                    'requiresActive' => true,
                ],
            ],
        ],
        'POST:/staff/mfa/setup' => [
            'operationId' => 'postStaffMfaSetup',
            'method' => 'POST',
            'path' => '/staff/mfa/setup',
            'intent' => 'protected',
            'realm' => 'staff',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => true,
            'allowedSecurity' => [
                [
                    'StaffCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'StaffCookieAuth',
                    'condition' => 'authenticated_staff_self',
                    'requiredPermission' => null,
                    'requiresActive' => true,
                ],
            ],
        ],
        'POST:/staff/mfa/setup/confirm' => [
            'operationId' => 'postStaffMfaSetupConfirm',
            'method' => 'POST',
            'path' => '/staff/mfa/setup/confirm',
            'intent' => 'protected',
            'realm' => 'staff',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => true,
            'allowedSecurity' => [
                [
                    'StaffCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'StaffCookieAuth',
                    'condition' => 'authenticated_staff_self',
                    'requiredPermission' => null,
                    'requiresActive' => true,
                ],
            ],
        ],
        'POST:/staff/mfa/verify' => [
            'operationId' => 'postStaffMfaVerify',
            'method' => 'POST',
            'path' => '/staff/mfa/verify',
            'intent' => 'protected',
            'realm' => 'staff_pending',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [
                [
                    'StaffPreAuthCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'StaffPreAuthCookieAuth',
                    'condition' => 'pending_staff_mfa',
                    'purpose' => 'login_mfa',
                    'allowedEndpoint' => 'postStaffMfaVerify',
                    'requiresBoundSession' => true,
                    'requiresUnexpired' => true,
                    'requiresRevocationValid' => true,
                ],
            ],
        ],
        'PUT:/staff/password' => [
            'operationId' => 'putStaffPassword',
            'method' => 'PUT',
            'path' => '/staff/password',
            'intent' => 'protected',
            'realm' => 'staff',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => true,
            'allowedSecurity' => [
                [
                    'StaffCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'StaffCookieAuth',
                    'condition' => 'authenticated_staff_self',
                    'requiredPermission' => null,
                    'requiresActive' => true,
                ],
            ],
        ],
        'POST:/staff/password/forgot' => [
            'operationId' => 'postStaffPasswordForgot',
            'method' => 'POST',
            'path' => '/staff/password/forgot',
            'intent' => 'protocol',
            'realm' => 'anonymous',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [],
            'branchConditions' => [],
        ],
        'POST:/staff/password/reset' => [
            'operationId' => 'postStaffPasswordReset',
            'method' => 'POST',
            'path' => '/staff/password/reset',
            'intent' => 'protocol',
            'realm' => 'anonymous',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [],
            'branchConditions' => [],
        ],
        'GET:/staff/sessions' => [
            'operationId' => 'getStaffSessions',
            'method' => 'GET',
            'path' => '/staff/sessions',
            'intent' => 'protected',
            'realm' => 'staff',
            'branch' => 'cookie',
            'requiresOrigin' => false,
            'requiresCsrf' => false,
            'csrfHeader' => null,
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [
                [
                    'StaffCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'StaffCookieAuth',
                    'condition' => 'authenticated_staff_self',
                    'requiredPermission' => null,
                    'requiresActive' => true,
                ],
            ],
        ],
        'DELETE:/staff/sessions/{id}' => [
            'operationId' => 'deleteStaffSession',
            'method' => 'DELETE',
            'path' => '/staff/sessions/{id}',
            'intent' => 'protected',
            'realm' => 'staff',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [
                [
                    'StaffCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'StaffCookieAuth',
                    'condition' => 'authenticated_staff_self',
                    'requiredPermission' => null,
                    'requiresActive' => true,
                ],
            ],
        ],
        'POST:/staff/step-up' => [
            'operationId' => 'postStaffStepUp',
            'method' => 'POST',
            'path' => '/staff/step-up',
            'intent' => 'protected',
            'realm' => 'staff',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => null,
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [
                [
                    'StaffCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'StaffCookieAuth',
                    'condition' => 'authenticated_staff_self',
                    'requiredPermission' => null,
                    'requiresActive' => true,
                ],
            ],
        ],
        'GET:/staff/users' => [
            'operationId' => 'getStaffUsersDirectory',
            'method' => 'GET',
            'path' => '/staff/users',
            'intent' => 'protected',
            'realm' => 'staff',
            'branch' => 'cookie',
            'requiresOrigin' => false,
            'requiresCsrf' => false,
            'csrfHeader' => null,
            'cacheControl' => 'no-store',
            'requiredPermission' => 'admin.manage',
            'requiresRecentStepUp' => false,
            'allowedSecurity' => [
                [
                    'StaffCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'StaffCookieAuth',
                    'condition' => 'authenticated_staff',
                    'requiredPermission' => 'admin.manage',
                    'requiresActive' => true,
                ],
            ],
        ],
        'POST:/staff/users' => [
            'operationId' => 'postStaffUserInvite',
            'method' => 'POST',
            'path' => '/staff/users',
            'intent' => 'protected',
            'realm' => 'staff',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => 'admin.manage',
            'requiresRecentStepUp' => true,
            'allowedSecurity' => [
                [
                    'StaffCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'StaffCookieAuth',
                    'condition' => 'authenticated_staff',
                    'requiredPermission' => 'admin.manage',
                    'requiresActive' => true,
                ],
            ],
        ],
        'DELETE:/staff/users/{id}' => [
            'operationId' => 'deleteStaffUser',
            'method' => 'DELETE',
            'path' => '/staff/users/{id}',
            'intent' => 'protected',
            'realm' => 'staff',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => 'admin.manage',
            'requiresRecentStepUp' => true,
            'allowedSecurity' => [
                [
                    'StaffCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'StaffCookieAuth',
                    'condition' => 'authenticated_staff',
                    'requiredPermission' => 'admin.manage',
                    'requiresActive' => true,
                ],
            ],
        ],
        'PATCH:/staff/users/{id}' => [
            'operationId' => 'patchStaffUser',
            'method' => 'PATCH',
            'path' => '/staff/users/{id}',
            'intent' => 'protected',
            'realm' => 'staff',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => 'admin.manage',
            'requiresRecentStepUp' => true,
            'allowedSecurity' => [
                [
                    'StaffCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'StaffCookieAuth',
                    'condition' => 'authenticated_staff',
                    'requiredPermission' => 'admin.manage',
                    'requiresActive' => true,
                ],
            ],
        ],
        'POST:/staff/users/{id}/invite/reissue' => [
            'operationId' => 'postStaffUserInviteReissue',
            'method' => 'POST',
            'path' => '/staff/users/{id}/invite/reissue',
            'intent' => 'protected',
            'realm' => 'staff',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => 'admin.manage',
            'requiresRecentStepUp' => true,
            'allowedSecurity' => [
                [
                    'StaffCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'StaffCookieAuth',
                    'condition' => 'authenticated_staff',
                    'requiredPermission' => 'admin.manage',
                    'requiresActive' => true,
                ],
            ],
        ],
        'POST:/staff/users/{id}/invite/revoke' => [
            'operationId' => 'postStaffUserInviteRevoke',
            'method' => 'POST',
            'path' => '/staff/users/{id}/invite/revoke',
            'intent' => 'protected',
            'realm' => 'staff',
            'branch' => 'cookie',
            'requiresOrigin' => true,
            'requiresCsrf' => true,
            'csrfHeader' => 'X-CSRF-TOKEN',
            'cacheControl' => 'no-store',
            'requiredPermission' => 'admin.manage',
            'requiresRecentStepUp' => true,
            'allowedSecurity' => [
                [
                    'StaffCookieAuth' => [],
                ],
            ],
            'branchConditions' => [
                [
                    'scheme' => 'StaffCookieAuth',
                    'condition' => 'authenticated_staff',
                    'requiredPermission' => 'admin.manage',
                    'requiresActive' => true,
                ],
            ],
        ],
    ];

    /**
     * Templated operations with path parameters.
     *
     * @var array<string, array{pattern: string, paramNames: list<string>, key: string}>
     */
    public const TEMPLATES = [
        'DELETE:/auth/passenger/sessions/{id}' => [
            'key' => 'DELETE:/auth/passenger/sessions/{id}',
            'method' => 'DELETE',
            'pattern' => '#^/auth/passenger/sessions/(?P<id>[^/]+)$#',
            'paramNames' => ['id'],
        ],
        'DELETE:/auth/passenger/travelers/{id}' => [
            'key' => 'DELETE:/auth/passenger/travelers/{id}',
            'method' => 'DELETE',
            'pattern' => '#^/auth/passenger/travelers/(?P<id>[^/]+)$#',
            'paramNames' => ['id'],
        ],
        'PATCH:/auth/passenger/travelers/{id}' => [
            'key' => 'PATCH:/auth/passenger/travelers/{id}',
            'method' => 'PATCH',
            'pattern' => '#^/auth/passenger/travelers/(?P<id>[^/]+)$#',
            'paramNames' => ['id'],
        ],
        'DELETE:/staff/sessions/{id}' => [
            'key' => 'DELETE:/staff/sessions/{id}',
            'method' => 'DELETE',
            'pattern' => '#^/staff/sessions/(?P<id>[^/]+)$#',
            'paramNames' => ['id'],
        ],
        'DELETE:/staff/users/{id}' => [
            'key' => 'DELETE:/staff/users/{id}',
            'method' => 'DELETE',
            'pattern' => '#^/staff/users/(?P<id>[^/]+)$#',
            'paramNames' => ['id'],
        ],
        'PATCH:/staff/users/{id}' => [
            'key' => 'PATCH:/staff/users/{id}',
            'method' => 'PATCH',
            'pattern' => '#^/staff/users/(?P<id>[^/]+)$#',
            'paramNames' => ['id'],
        ],
        'POST:/staff/users/{id}/invite/reissue' => [
            'key' => 'POST:/staff/users/{id}/invite/reissue',
            'method' => 'POST',
            'pattern' => '#^/staff/users/(?P<id>[^/]+)/invite/reissue$#',
            'paramNames' => ['id'],
        ],
        'POST:/staff/users/{id}/invite/revoke' => [
            'key' => 'POST:/staff/users/{id}/invite/revoke',
            'method' => 'POST',
            'pattern' => '#^/staff/users/(?P<id>[^/]+)/invite/revoke$#',
            'paramNames' => ['id'],
        ],
    ];

    /**
     * Find policy by method and path (with or without /api/v1 prefix).
     * Supports exact literal paths and anchored templated paths with parameter extraction.
     * Rejects query pollution, double slashes, and extra slash aliases.
     *
     * @return array<string, mixed>|null Policy with extracted "params" or null.
     */
    public static function find(string $method, string $path): ?array
    {
        $normalizedPath = self::normalizePath($path);
        if ($normalizedPath === null) {
            return null;
        }

        $upperMethod = strtoupper(trim($method));
        $exactKey = $upperMethod . ':' . $normalizedPath;

        // 1. Exact literal match
        if (isset(self::OPERATIONS[$exactKey])) {
            $policy = self::OPERATIONS[$exactKey];
            $policy['params'] = [];
            return $policy;
        }

        // 2. Anchored templated match for the same method
        foreach (self::TEMPLATES as $tmpl) {
            if ($tmpl['method'] !== $upperMethod) {
                continue;
            }

            if (preg_match($tmpl['pattern'], $normalizedPath, $matches)) {
                $policy = self::OPERATIONS[$tmpl['key']];
                $params = [];
                foreach ($tmpl['paramNames'] as $name) {
                    if (isset($matches[$name]) && $matches[$name] !== '') {
                        $params[$name] = $matches[$name];
                    }
                }
                $policy['params'] = $params;
                return $policy;
            }
        }

        return null;
    }

    /**
     * Find policy by operation ID.
     */
    public static function findByOperationId(string $operationId): ?array
    {
        foreach (self::OPERATIONS as $policy) {
            if ($policy['operationId'] === $operationId) {
                $res = $policy;
                $res['params'] = [];
                return $res;
            }
        }
        return null;
    }

    /**
     * Normalize path: extract strictly path component without query influence,
     * strip /api/v1 prefix, ensure leading slash, reject invalid extra slash aliases.
     */
    public static function normalizePath(string $path): ?string
    {
        // Disallow null bytes
        if (str_contains($path, chr(0))) {
            return null;
        }

        // Extract path component strictly; ignore query string
        $clean = parse_url($path, PHP_URL_PATH);
        if ($clean === null || $clean === false || $clean === '') {
            return null;
        }

        // Reject dot-segments and directory traversal
        if (str_contains($clean, '/../') || str_contains($clean, '/./') || str_ends_with($clean, '/..') || str_ends_with($clean, '/.')) {
            return null;
        }

        // Strip /api/v1 or api/v1 prefix once
        if (str_starts_with($clean, '/api/v1/')) {
            $clean = substr($clean, 7);
        } elseif ($clean === '/api/v1') {
            $clean = '/';
        } elseif (str_starts_with($clean, 'api/v1/')) {
            $clean = '/' . substr($clean, 7);
        } elseif ($clean === 'api/v1') {
            $clean = '/';
        }

        // Ensure leading slash
        if (!str_starts_with($clean, '/')) {
            $clean = '/' . $clean;
        }

        // Reject duplicate consecutive slashes (e.g. /staff//users)
        if (str_contains($clean, '//')) {
            return null;
        }

        // Canonicalize identity namespace prefix without decoding subsequent path parameters
        $segments = explode('/', ltrim($clean, '/'));
        if (!empty($segments)) {
            $decodedNs = rawurldecode($segments[0]);
            if ($decodedNs === 'auth' || $decodedNs === 'staff') {
                $segments[0] = $decodedNs;
                $clean = '/' . implode('/', $segments);
            }
        }

        return $clean;
    }
}
