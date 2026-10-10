import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const repositoryRoot = path.resolve(__dirname, "..");
export const DEFAULT_SPEC_PATH = path.join(repositoryRoot, "docs/backend/openapi.v1.json");
export const DEFAULT_TYPES_OUTPUT_PATH = path.join(repositoryRoot, "src/lib/api/identity-types.ts");
export const DEFAULT_CONTRACT_OUTPUT_PATH = path.join(repositoryRoot, "src/lib/api/identity-contract.json");

const SUPPORTED_SCHEMA_KEYS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "const",
  "format",
  "example",
  "items",
  "enum",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
  "$ref",
  "description",
]);


export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

export const ACCEPTED_IDENTITY_OPERATIONS = Object.freeze([
  {
    "operationId": "getAuthCsrfBootstrap",
    "method": "GET",
    "path": "/auth/csrf",
    "successStatuses": [
      "200"
    ],
    "security": [],
    "protocol": {
      "branches": [
        {
          "realm": "anonymous_passenger",
          "origin": "read",
          "csrf": "not_applicable"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "anonymous_passenger",
    "requiresCsrf": false,
    "isAuthChanging": false,
    "requestSchemaName": null,
    "responseSchemaName": "CsrfTokenResponse",
    "authorizationBranches": []
  },
  {
    "operationId": "postPassengerRegister",
    "method": "POST",
    "path": "/auth/register",
    "successStatuses": [
      "202"
    ],
    "security": [],
    "protocol": {
      "branches": [
        {
          "realm": "anonymous_passenger",
          "origin": "configured_frontend",
          "csrf": "anonymous_passenger"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 202,
    "realm": "anonymous_passenger",
    "requiresCsrf": true,
    "isAuthChanging": false,
    "requestSchemaName": "RegisterRequest",
    "responseSchemaName": "PassengerRegisterReceiptResponse",
    "authorizationBranches": []
  },
  {
    "operationId": "postPassengerLogin",
    "method": "POST",
    "path": "/auth/login",
    "successStatuses": [
      "200"
    ],
    "security": [],
    "protocol": {
      "branches": [
        {
          "realm": "anonymous_passenger",
          "origin": "configured_frontend",
          "csrf": "anonymous_passenger"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "anonymous_passenger",
    "requiresCsrf": true,
    "isAuthChanging": true,
    "requestSchemaName": "LoginRequest",
    "responseSchemaName": "PassengerAuthResponse",
    "authorizationBranches": []
  },
  {
    "operationId": "postPassengerLogout",
    "method": "POST",
    "path": "/auth/logout",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "PassengerCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "passenger",
          "origin": "configured_frontend",
          "csrf": "passenger"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "passenger",
    "requiresCsrf": true,
    "isAuthChanging": true,
    "requestSchemaName": null,
    "responseSchemaName": "PassengerLogoutResponse",
    "authorizationBranches": [
      {
        "scheme": "PassengerCookieAuth",
        "condition": "authenticated_passenger_self"
      }
    ]
  },
  {
    "operationId": "postPassengerPasswordForgot",
    "method": "POST",
    "path": "/auth/password/forgot",
    "successStatuses": [
      "202"
    ],
    "security": [],
    "protocol": {
      "branches": [
        {
          "realm": "anonymous_passenger",
          "origin": "configured_frontend",
          "csrf": "anonymous_passenger"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 202,
    "realm": "anonymous_passenger",
    "requiresCsrf": true,
    "isAuthChanging": false,
    "requestSchemaName": "PasswordForgotRequest",
    "responseSchemaName": "PasswordForgotResponse",
    "authorizationBranches": []
  },
  {
    "operationId": "postPassengerPasswordReset",
    "method": "POST",
    "path": "/auth/password/reset",
    "successStatuses": [
      "200"
    ],
    "security": [],
    "protocol": {
      "branches": [
        {
          "realm": "anonymous_passenger",
          "origin": "configured_frontend",
          "csrf": "anonymous_passenger"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "anonymous_passenger",
    "requiresCsrf": true,
    "isAuthChanging": true,
    "requestSchemaName": "PasswordResetRequest",
    "responseSchemaName": "PasswordResetResponse",
    "authorizationBranches": []
  },
  {
    "operationId": "postPassengerEmailVerify",
    "method": "POST",
    "path": "/auth/email/verify",
    "successStatuses": [
      "200"
    ],
    "security": [],
    "protocol": {
      "branches": [
        {
          "realm": "anonymous_passenger",
          "origin": "configured_frontend",
          "csrf": "anonymous_passenger"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "anonymous_passenger",
    "requiresCsrf": true,
    "isAuthChanging": false,
    "requestSchemaName": "EmailVerifyRequest",
    "responseSchemaName": "EmailVerifyResponse",
    "authorizationBranches": []
  },
  {
    "operationId": "getPassengerProfile",
    "method": "GET",
    "path": "/auth/passenger/profile",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "PassengerCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "passenger",
          "origin": "read",
          "csrf": "not_applicable"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "passenger",
    "requiresCsrf": false,
    "isAuthChanging": false,
    "requestSchemaName": null,
    "responseSchemaName": "PassengerProfileResponse",
    "authorizationBranches": [
      {
        "scheme": "PassengerCookieAuth",
        "condition": "authenticated_passenger_self"
      }
    ]
  },
  {
    "operationId": "putPassengerProfile",
    "method": "PUT",
    "path": "/auth/passenger/profile",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "PassengerCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "passenger",
          "origin": "configured_frontend",
          "csrf": "passenger"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "passenger",
    "requiresCsrf": true,
    "isAuthChanging": false,
    "requestSchemaName": "UpdatePassengerProfileRequest",
    "responseSchemaName": "PassengerProfileReceiptResponse",
    "authorizationBranches": [
      {
        "scheme": "PassengerCookieAuth",
        "condition": "authenticated_passenger_self"
      }
    ]
  },
  {
    "operationId": "getSavedTravelers",
    "method": "GET",
    "path": "/auth/passenger/travelers",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "PassengerCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "passenger",
          "origin": "read",
          "csrf": "not_applicable"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "passenger",
    "requiresCsrf": false,
    "isAuthChanging": false,
    "requestSchemaName": null,
    "responseSchemaName": "SavedTravelersResponse",
    "authorizationBranches": [
      {
        "scheme": "PassengerCookieAuth",
        "condition": "authenticated_passenger_self"
      }
    ]
  },
  {
    "operationId": "postSavedTraveler",
    "method": "POST",
    "path": "/auth/passenger/travelers",
    "successStatuses": [
      "201"
    ],
    "security": [
      {
        "PassengerCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "passenger",
          "origin": "configured_frontend",
          "csrf": "passenger"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 201,
    "realm": "passenger",
    "requiresCsrf": true,
    "isAuthChanging": false,
    "requestSchemaName": "CreateTravelerRequest",
    "responseSchemaName": "SavedTravelerResponse",
    "authorizationBranches": [
      {
        "scheme": "PassengerCookieAuth",
        "condition": "authenticated_passenger_self"
      }
    ]
  },
  {
    "operationId": "deleteSavedTraveler",
    "method": "DELETE",
    "path": "/auth/passenger/travelers/{id}",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "PassengerCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "passenger",
          "origin": "configured_frontend",
          "csrf": "passenger"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "passenger",
    "requiresCsrf": true,
    "isAuthChanging": false,
    "requestSchemaName": null,
    "responseSchemaName": "DeleteTravelerResponse",
    "authorizationBranches": [
      {
        "scheme": "PassengerCookieAuth",
        "condition": "authenticated_passenger_self"
      }
    ]
  },
  {
    "operationId": "patchSavedTraveler",
    "method": "PATCH",
    "path": "/auth/passenger/travelers/{id}",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "PassengerCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "passenger",
          "origin": "configured_frontend",
          "csrf": "passenger"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "passenger",
    "requiresCsrf": true,
    "isAuthChanging": false,
    "requestSchemaName": "PatchTravelerRequest",
    "responseSchemaName": "SavedTravelerResponse",
    "authorizationBranches": [
      {
        "scheme": "PassengerCookieAuth",
        "condition": "authenticated_passenger_self"
      }
    ]
  },
  {
    "operationId": "getStaffCsrfBootstrap",
    "method": "GET",
    "path": "/staff/csrf",
    "successStatuses": [
      "200"
    ],
    "security": [],
    "protocol": {
      "branches": [
        {
          "realm": "anonymous_staff",
          "origin": "read",
          "csrf": "not_applicable"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "anonymous_staff",
    "requiresCsrf": false,
    "isAuthChanging": false,
    "requestSchemaName": null,
    "responseSchemaName": "CsrfTokenResponse",
    "authorizationBranches": []
  },
  {
    "operationId": "postStaffLogin",
    "method": "POST",
    "path": "/staff/login",
    "successStatuses": [
      "200"
    ],
    "security": [],
    "protocol": {
      "branches": [
        {
          "realm": "anonymous_staff",
          "origin": "configured_frontend",
          "csrf": "anonymous_staff"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "anonymous_staff",
    "requiresCsrf": true,
    "isAuthChanging": true,
    "requestSchemaName": "StaffLoginRequest",
    "responseSchemaName": "StaffPendingAuthResponse",
    "authorizationBranches": []
  },
  {
    "operationId": "postStaffLogout",
    "method": "POST",
    "path": "/staff/logout",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "StaffCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "staff",
          "origin": "configured_frontend",
          "csrf": "staff"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "staff",
    "requiresCsrf": true,
    "isAuthChanging": true,
    "requestSchemaName": null,
    "responseSchemaName": "StaffLogoutResponse",
    "authorizationBranches": [
      {
        "scheme": "StaffCookieAuth",
        "condition": "authenticated_staff_self",
        "requiredPermission": null,
        "requiresActive": true
      }
    ]
  },
  {
    "operationId": "getStaffMe",
    "method": "GET",
    "path": "/staff/me",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "StaffCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "staff",
          "origin": "read",
          "csrf": "not_applicable"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "staff",
    "requiresCsrf": false,
    "isAuthChanging": false,
    "requestSchemaName": null,
    "responseSchemaName": "StaffMeResponse",
    "authorizationBranches": [
      {
        "scheme": "StaffCookieAuth",
        "condition": "authenticated_staff_self",
        "requiredPermission": null,
        "requiresActive": true
      }
    ]
  },
  {
    "operationId": "postStaffMfaSetup",
    "method": "POST",
    "path": "/staff/mfa/setup",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "StaffCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "staff",
          "origin": "configured_frontend",
          "csrf": "staff"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": 300
    },
    "expectedStatus": 200,
    "realm": "staff",
    "requiresCsrf": true,
    "isAuthChanging": false,
    "requestSchemaName": null,
    "responseSchemaName": "StaffMfaSetupResponse",
    "authorizationBranches": [
      {
        "scheme": "StaffCookieAuth",
        "condition": "authenticated_staff_self",
        "requiredPermission": null,
        "requiresActive": true
      }
    ]
  },
  {
    "operationId": "postStaffMfaChallenge",
    "method": "POST",
    "path": "/staff/mfa/challenge",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "StaffPreAuthCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "pending_staff",
          "origin": "configured_frontend",
          "csrf": "anonymous_staff"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "pending_staff",
    "requiresCsrf": true,
    "isAuthChanging": false,
    "requestSchemaName": "StaffMfaChallengeRequest",
    "responseSchemaName": "StaffMfaChallengeResponse",
    "authorizationBranches": [
      {
        "scheme": "StaffPreAuthCookieAuth",
        "condition": "pending_staff_mfa",
        "purpose": "login_mfa",
        "allowedEndpoint": "postStaffMfaChallenge",
        "requiresBoundSession": true,
        "requiresUnexpired": true,
        "requiresRevocationValid": true
      }
    ]
  },
  {
    "operationId": "postStaffMfaVerify",
    "method": "POST",
    "path": "/staff/mfa/verify",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "StaffPreAuthCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "pending_staff",
          "origin": "configured_frontend",
          "csrf": "anonymous_staff"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "pending_staff",
    "requiresCsrf": true,
    "isAuthChanging": true,
    "requestSchemaName": "StaffMfaVerifyRequest",
    "responseSchemaName": "StaffAuthResponse",
    "authorizationBranches": [
      {
        "scheme": "StaffPreAuthCookieAuth",
        "condition": "pending_staff_mfa",
        "purpose": "login_mfa",
        "allowedEndpoint": "postStaffMfaVerify",
        "requiresBoundSession": true,
        "requiresUnexpired": true,
        "requiresRevocationValid": true
      }
    ]
  },
  {
    "operationId": "getStaffSessions",
    "method": "GET",
    "path": "/staff/sessions",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "StaffCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "staff",
          "origin": "read",
          "csrf": "not_applicable"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "staff",
    "requiresCsrf": false,
    "isAuthChanging": false,
    "requestSchemaName": null,
    "responseSchemaName": "StaffSessionsListResponse",
    "authorizationBranches": [
      {
        "scheme": "StaffCookieAuth",
        "condition": "authenticated_staff_self",
        "requiredPermission": null,
        "requiresActive": true
      }
    ]
  },
  {
    "operationId": "deleteStaffSession",
    "method": "DELETE",
    "path": "/staff/sessions/{id}",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "StaffCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "staff",
          "origin": "configured_frontend",
          "csrf": "staff"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "staff",
    "requiresCsrf": true,
    "isAuthChanging": true,
    "requestSchemaName": null,
    "responseSchemaName": "DeleteStaffSessionResponse",
    "authorizationBranches": [
      {
        "scheme": "StaffCookieAuth",
        "condition": "authenticated_staff_self",
        "requiredPermission": null,
        "requiresActive": true
      }
    ]
  },
  {
    "operationId": "getStaffUsersDirectory",
    "method": "GET",
    "path": "/staff/users",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "StaffCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "staff",
          "origin": "read",
          "csrf": "not_applicable"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "staff",
    "requiresCsrf": false,
    "isAuthChanging": false,
    "requestSchemaName": null,
    "responseSchemaName": "StaffUsersListResponse",
    "authorizationBranches": [
      {
        "scheme": "StaffCookieAuth",
        "condition": "authenticated_staff",
        "requiredPermission": "admin.manage",
        "requiresActive": true
      }
    ]
  },
  {
    "operationId": "postStaffUserInvite",
    "method": "POST",
    "path": "/staff/users",
    "successStatuses": [
      "201"
    ],
    "security": [
      {
        "StaffCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "staff",
          "origin": "configured_frontend",
          "csrf": "staff"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": 300
    },
    "expectedStatus": 201,
    "realm": "staff",
    "requiresCsrf": true,
    "isAuthChanging": false,
    "requestSchemaName": "CreateStaffUserRequest",
    "responseSchemaName": "StaffUserResponse",
    "authorizationBranches": [
      {
        "scheme": "StaffCookieAuth",
        "condition": "authenticated_staff",
        "requiredPermission": "admin.manage",
        "requiresActive": true
      }
    ]
  },
  {
    "operationId": "patchStaffUser",
    "method": "PATCH",
    "path": "/staff/users/{id}",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "StaffCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "staff",
          "origin": "configured_frontend",
          "csrf": "staff"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": 300
    },
    "expectedStatus": 200,
    "realm": "staff",
    "requiresCsrf": true,
    "isAuthChanging": false,
    "requestSchemaName": "PatchStaffUserRequest",
    "responseSchemaName": "StaffUserResponse",
    "authorizationBranches": [
      {
        "scheme": "StaffCookieAuth",
        "condition": "authenticated_staff",
        "requiredPermission": "admin.manage",
        "requiresActive": true
      }
    ]
  },
  {
    "operationId": "deleteStaffUser",
    "method": "DELETE",
    "path": "/staff/users/{id}",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "StaffCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "staff",
          "origin": "configured_frontend",
          "csrf": "staff"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": 300
    },
    "expectedStatus": 200,
    "realm": "staff",
    "requiresCsrf": true,
    "isAuthChanging": false,
    "requestSchemaName": null,
    "responseSchemaName": "DeleteStaffUserResponse",
    "authorizationBranches": [
      {
        "scheme": "StaffCookieAuth",
        "condition": "authenticated_staff",
        "requiredPermission": "admin.manage",
        "requiresActive": true
      }
    ]
  },
  {
    "operationId": "postPassengerEmailResend",
    "method": "POST",
    "path": "/auth/email/resend",
    "successStatuses": [
      "202"
    ],
    "security": [],
    "protocol": {
      "branches": [
        {
          "realm": "anonymous_passenger",
          "origin": "configured_frontend",
          "csrf": "anonymous_passenger"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 202,
    "realm": "anonymous_passenger",
    "requiresCsrf": true,
    "isAuthChanging": false,
    "requestSchemaName": "PassengerEmailResendRequest",
    "responseSchemaName": "PassengerRegisterReceiptResponse",
    "authorizationBranches": []
  },
  {
    "operationId": "getPassengerSessions",
    "method": "GET",
    "path": "/auth/passenger/sessions",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "PassengerCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "passenger",
          "origin": "read",
          "csrf": "not_applicable"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "passenger",
    "requiresCsrf": false,
    "isAuthChanging": false,
    "requestSchemaName": null,
    "responseSchemaName": "PassengerSessionListResponse",
    "authorizationBranches": [
      {
        "scheme": "PassengerCookieAuth",
        "condition": "authenticated_passenger_self"
      }
    ]
  },
  {
    "operationId": "deletePassengerSession",
    "method": "DELETE",
    "path": "/auth/passenger/sessions/{id}",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "PassengerCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "passenger",
          "origin": "configured_frontend",
          "csrf": "passenger"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "passenger",
    "requiresCsrf": true,
    "isAuthChanging": true,
    "requestSchemaName": null,
    "responseSchemaName": "PassengerSessionRevokeResponse",
    "authorizationBranches": [
      {
        "scheme": "PassengerCookieAuth",
        "condition": "authenticated_passenger_self"
      }
    ]
  },
  {
    "operationId": "putPassengerPassword",
    "method": "PUT",
    "path": "/auth/passenger/password",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "PassengerCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "passenger",
          "origin": "configured_frontend",
          "csrf": "passenger"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "passenger",
    "requiresCsrf": true,
    "isAuthChanging": true,
    "requestSchemaName": "PassengerPasswordChangeRequest",
    "responseSchemaName": "PassengerPasswordChangeResponse",
    "authorizationBranches": [
      {
        "scheme": "PassengerCookieAuth",
        "condition": "authenticated_passenger_self"
      }
    ]
  },
  {
    "operationId": "postStaffMfaEnrollmentSetup",
    "method": "POST",
    "path": "/staff/mfa/enrollment/setup",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "StaffPreAuthCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "pending_staff",
          "origin": "configured_frontend",
          "csrf": "anonymous_staff"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "pending_staff",
    "requiresCsrf": true,
    "isAuthChanging": false,
    "requestSchemaName": null,
    "responseSchemaName": "StaffMfaEnrollmentSetupResponse",
    "authorizationBranches": [
      {
        "scheme": "StaffPreAuthCookieAuth",
        "condition": "pending_staff_mfa",
        "purpose": "enroll_mfa",
        "allowedEndpoint": "postStaffMfaEnrollmentSetup",
        "requiresBoundSession": true,
        "requiresUnexpired": true,
        "requiresRevocationValid": true
      }
    ]
  },
  {
    "operationId": "postStaffMfaEnrollmentConfirm",
    "method": "POST",
    "path": "/staff/mfa/enrollment/confirm",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "StaffPreAuthCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "pending_staff",
          "origin": "configured_frontend",
          "csrf": "anonymous_staff"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "pending_staff",
    "requiresCsrf": true,
    "isAuthChanging": true,
    "requestSchemaName": "StaffMfaEnrollmentConfirmRequest",
    "responseSchemaName": "StaffMfaEnrollmentConfirmResponse",
    "authorizationBranches": [
      {
        "scheme": "StaffPreAuthCookieAuth",
        "condition": "pending_staff_mfa",
        "purpose": "enroll_mfa",
        "allowedEndpoint": "postStaffMfaEnrollmentConfirm",
        "requiresBoundSession": true,
        "requiresUnexpired": true,
        "requiresRevocationValid": true
      }
    ]
  },
  {
    "operationId": "postStaffStepUp",
    "method": "POST",
    "path": "/staff/step-up",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "StaffCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "staff",
          "origin": "configured_frontend",
          "csrf": "staff"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "staff",
    "requiresCsrf": true,
    "isAuthChanging": false,
    "requestSchemaName": "StaffStepUpRequest",
    "responseSchemaName": "StaffStepUpResponse",
    "authorizationBranches": [
      {
        "scheme": "StaffCookieAuth",
        "condition": "authenticated_staff_self",
        "requiredPermission": null,
        "requiresActive": true
      }
    ]
  },
  {
    "operationId": "postStaffMfaSetupConfirm",
    "method": "POST",
    "path": "/staff/mfa/setup/confirm",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "StaffCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "staff",
          "origin": "configured_frontend",
          "csrf": "staff"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": 300
    },
    "expectedStatus": 200,
    "realm": "staff",
    "requiresCsrf": true,
    "isAuthChanging": true,
    "requestSchemaName": "StaffMfaSetupConfirmRequest",
    "responseSchemaName": "StaffMfaSetupConfirmResponse",
    "authorizationBranches": [
      {
        "scheme": "StaffCookieAuth",
        "condition": "authenticated_staff_self",
        "requiredPermission": null,
        "requiresActive": true
      }
    ]
  },
  {
    "operationId": "postStaffMfaRecoveryCodesRegenerate",
    "method": "POST",
    "path": "/staff/mfa/recovery-codes/regenerate",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "StaffCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "staff",
          "origin": "configured_frontend",
          "csrf": "staff"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": 300
    },
    "expectedStatus": 200,
    "realm": "staff",
    "requiresCsrf": true,
    "isAuthChanging": true,
    "requestSchemaName": null,
    "responseSchemaName": "StaffRecoveryCodesRegenerateResponse",
    "authorizationBranches": [
      {
        "scheme": "StaffCookieAuth",
        "condition": "authenticated_staff_self",
        "requiredPermission": null,
        "requiresActive": true
      }
    ]
  },
  {
    "operationId": "postStaffPasswordForgot",
    "method": "POST",
    "path": "/staff/password/forgot",
    "successStatuses": [
      "202"
    ],
    "security": [],
    "protocol": {
      "branches": [
        {
          "realm": "anonymous_staff",
          "origin": "configured_frontend",
          "csrf": "anonymous_staff"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 202,
    "realm": "anonymous_staff",
    "requiresCsrf": true,
    "isAuthChanging": false,
    "requestSchemaName": "StaffPasswordForgotRequest",
    "responseSchemaName": "StaffPasswordForgotReceiptResponse",
    "authorizationBranches": []
  },
  {
    "operationId": "postStaffPasswordReset",
    "method": "POST",
    "path": "/staff/password/reset",
    "successStatuses": [
      "200"
    ],
    "security": [],
    "protocol": {
      "branches": [
        {
          "realm": "anonymous_staff",
          "origin": "configured_frontend",
          "csrf": "anonymous_staff"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "anonymous_staff",
    "requiresCsrf": true,
    "isAuthChanging": true,
    "requestSchemaName": "StaffPasswordResetRequest",
    "responseSchemaName": "StaffPasswordResetResponse",
    "authorizationBranches": []
  },
  {
    "operationId": "putStaffPassword",
    "method": "PUT",
    "path": "/staff/password",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "StaffCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "staff",
          "origin": "configured_frontend",
          "csrf": "staff"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": 300
    },
    "expectedStatus": 200,
    "realm": "staff",
    "requiresCsrf": true,
    "isAuthChanging": true,
    "requestSchemaName": "StaffPasswordChangeRequest",
    "responseSchemaName": "StaffPasswordChangeResponse",
    "authorizationBranches": [
      {
        "scheme": "StaffCookieAuth",
        "condition": "authenticated_staff_self",
        "requiredPermission": null,
        "requiresActive": true
      }
    ]
  },
  {
    "operationId": "postStaffInvitationAccept",
    "method": "POST",
    "path": "/staff/invitations/accept",
    "successStatuses": [
      "200"
    ],
    "security": [],
    "protocol": {
      "branches": [
        {
          "realm": "anonymous_staff",
          "origin": "configured_frontend",
          "csrf": "anonymous_staff"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": null
    },
    "expectedStatus": 200,
    "realm": "anonymous_staff",
    "requiresCsrf": true,
    "isAuthChanging": true,
    "requestSchemaName": "StaffInvitationAcceptRequest",
    "responseSchemaName": "StaffInvitationAcceptResponse",
    "authorizationBranches": []
  },
  {
    "operationId": "postStaffUserInviteReissue",
    "method": "POST",
    "path": "/staff/users/{id}/invite/reissue",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "StaffCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "staff",
          "origin": "configured_frontend",
          "csrf": "staff"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": 300
    },
    "expectedStatus": 200,
    "realm": "staff",
    "requiresCsrf": true,
    "isAuthChanging": false,
    "requestSchemaName": null,
    "responseSchemaName": "StaffInviteReissueResponse",
    "authorizationBranches": [
      {
        "scheme": "StaffCookieAuth",
        "condition": "authenticated_staff",
        "requiredPermission": "admin.manage",
        "requiresActive": true
      }
    ]
  },
  {
    "operationId": "postStaffUserInviteRevoke",
    "method": "POST",
    "path": "/staff/users/{id}/invite/revoke",
    "successStatuses": [
      "200"
    ],
    "security": [
      {
        "StaffCookieAuth": []
      }
    ],
    "protocol": {
      "branches": [
        {
          "realm": "staff",
          "origin": "configured_frontend",
          "csrf": "staff"
        }
      ],
      "branchSelection": "trusted_credentials_no_fallback_on_invalid_cookie",
      "csrfHeader": "X-CSRF-TOKEN",
      "cacheControl": "no-store",
      "stepUpSeconds": 300
    },
    "expectedStatus": 200,
    "realm": "staff",
    "requiresCsrf": true,
    "isAuthChanging": false,
    "requestSchemaName": null,
    "responseSchemaName": "StaffInviteRevokeResponse",
    "authorizationBranches": [
      {
        "scheme": "StaffCookieAuth",
        "condition": "authenticated_staff",
        "requiredPermission": "admin.manage",
        "requiresActive": true
      }
    ]
  }
]);

/**
 * Validates that a JSON schema object contains only known, supported constructs.
 * Fails closed on any unexpected construct (e.g. oneOf, anyOf, allOf, not).
 */
export function validateSupportedSchema(schema, pathTrace = "root") {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error(`Unsupported schema node at ${pathTrace}: expected non-null object`);
  }

  for (const key of Object.keys(schema)) {
    if (key === "oneOf") {
      const isSupportedOneOf =
        schema.type === "object" &&
        Array.isArray(schema.oneOf) &&
        schema.oneOf.length > 0 &&
        schema.oneOf.every(
          (branch) =>
            branch &&
            typeof branch === "object" &&
            !Array.isArray(branch) &&
            Array.isArray(branch.required) &&
            branch.required.every((r) => typeof r === "string") &&
            Object.keys(branch).length === 1
        );
      if (!isSupportedOneOf) {
        throw new Error(`Unsupported schema keyword 'oneOf' at ${pathTrace}. Generator fails closed.`);
      }
      continue;
    }
    if (!SUPPORTED_SCHEMA_KEYS.has(key)) {
      throw new Error(`Unsupported schema keyword '${key}' at ${pathTrace}. Generator fails closed.`);
    }
  }

  if (schema.$ref !== undefined) {
    for (const key of Object.keys(schema)) {
      if (key !== "$ref" && key !== "description") {
        throw new Error(
          `Unsupported sibling assertion '${key}' alongside $ref at ${pathTrace}. Generator fails closed.`
        );
      }
    }
    if (typeof schema.$ref !== "string" || !schema.$ref.startsWith("#/components/schemas/")) {
      throw new Error(`Unsupported $ref '${schema.$ref}' at ${pathTrace}. Expected '#/components/schemas/...'`);
    }
    return;
  }

  if (schema.type === "object") {
    if (schema.properties) {
      if (typeof schema.properties !== "object" || Array.isArray(schema.properties)) {
        throw new Error(`Malformed properties at ${pathTrace}`);
      }
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        validateSupportedSchema(propSchema, `${pathTrace}.properties.${propName}`);
      }
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      validateSupportedSchema(schema.additionalProperties, `${pathTrace}.additionalProperties`);
    }
  } else if (schema.type === "array") {
    if (!schema.items || typeof schema.items !== "object") {
      throw new Error(`Missing or malformed items in array schema at ${pathTrace}`);
    }
    validateSupportedSchema(schema.items, `${pathTrace}.items`);
  } else if (
    schema.type === "string" ||
    schema.type === "integer" ||
    schema.type === "number" ||
    schema.type === "boolean"
  ) {
    // Valid scalar schema
  } else {
    throw new Error(`Unsupported schema type '${schema.type}' at ${pathTrace}`);
  }
}

/**
 * Resolves a schema reference or inline schema.
 */
export function resolveSchema(spec, schemaOrRef) {
  if (!schemaOrRef) {
    throw new Error("Missing schema to resolve");
  }
  if (schemaOrRef.$ref) {
    const ref = schemaOrRef.$ref;
    const prefix = "#/components/schemas/";
    if (!ref.startsWith(prefix)) {
      throw new Error(`Unsupported $ref format: ${ref}`);
    }
    const name = ref.slice(prefix.length);
    const target = spec.components?.schemas?.[name];
    if (!target) {
      throw new Error(`Unresolved schema reference: ${ref}`);
    }
    return { name, schema: target };
  }
  return { name: null, schema: schemaOrRef };
}

/**
 * Traverses all reachable schema nodes from root operations and component schemas.
 * Detects circular references, dangling references, malformed targets, and unsupported constructs.
 */
export function preflightReachableReferences(spec, rootSchemas) {
  const referencedComponentNames = new Set();

  function traverse(schemaNode, pathTrace, activeStack = []) {
    if (!schemaNode || typeof schemaNode !== "object" || Array.isArray(schemaNode)) {
      throw new Error(`Malformed schema node at ${pathTrace}: expected non-null object`);
    }

    validateSupportedSchema(schemaNode, pathTrace);

    if (schemaNode.$ref !== undefined) {
      const ref = schemaNode.$ref;
      const prefix = "#/components/schemas/";
      if (!ref.startsWith(prefix)) {
        throw new Error(`Unsupported $ref format '${ref}' at ${pathTrace}`);
      }
      const componentName = ref.slice(prefix.length);
      const target = spec.components?.schemas?.[componentName];
      if (!target) {
        throw new Error(`Dangling schema reference '${ref}' at ${pathTrace}`);
      }

      if (activeStack.includes(componentName)) {
        throw new Error(
          `Circular schema reference detected: ${[...activeStack, componentName].join(" -> ")} at ${pathTrace}`
        );
      }

      referencedComponentNames.add(componentName);
      traverse(target, `components.schemas['${componentName}']`, [...activeStack, componentName]);
      return;
    }

    if (schemaNode.type === "object" && schemaNode.properties) {
      for (const [propName, propSchema] of Object.entries(schemaNode.properties)) {
        traverse(propSchema, `${pathTrace}.properties.${propName}`, activeStack);
      }
    }

    if (schemaNode.type === "object" && schemaNode.additionalProperties && typeof schemaNode.additionalProperties === "object") {
      traverse(schemaNode.additionalProperties, `${pathTrace}.additionalProperties`, activeStack);
    }

    if (schemaNode.type === "array" && schemaNode.items) {
      traverse(schemaNode.items, `${pathTrace}.items`, activeStack);
    }
  }

  for (const { schema, path: tracePath } of rootSchemas) {
    traverse(schema, tracePath, []);
  }

  return referencedComponentNames;
}

/**
 * Maps a schema type definition to its TypeScript type string based on AST.
 */
function resolveTypeScriptType(propSchema, spec, pathTrace) {
  if (propSchema.const !== undefined) {
    return JSON.stringify(propSchema.const);
  }

  if (propSchema.enum && Array.isArray(propSchema.enum)) {
    return propSchema.enum.map((v) => JSON.stringify(v)).join(" | ");
  }

  if (propSchema.$ref) {
    const { name } = resolveSchema(spec, propSchema);
    return name;
  }

  if (propSchema.type === "string") {
    return "string";
  }

  if (propSchema.type === "integer" || propSchema.type === "number") {
    return "number";
  }

  if (propSchema.type === "boolean") {
    return "boolean";
  }

  if (propSchema.type === "array") {
    const itemType = resolveTypeScriptType(propSchema.items, spec, `${pathTrace}.items`);
    return `${itemType}[]`;
  }

  if (propSchema.type === "object") {
    if (propSchema.additionalProperties && typeof propSchema.additionalProperties === "object") {
      const valType = resolveTypeScriptType(
        propSchema.additionalProperties,
        spec,
        `${pathTrace}.additionalProperties`
      );
      return `Record<string, ${valType}>`;
    }
    throw new Error(`Unsupported inline nested object at ${pathTrace}`);
  }

  throw new Error(`Unknown schema type at ${pathTrace}`);
}

/**
 * Generates an interface definition by inspecting actual schema properties and required fields.
 */
function generateInterfaceFromSchema(interfaceName, schema, spec, propertyTypeOverrides = {}) {
  validateSupportedSchema(schema, interfaceName);

  const required = new Set(schema.required || []);
  const lines = [`export interface ${interfaceName} {`];

  for (const [propName, propSchema] of Object.entries(schema.properties || {})) {
    const isRequired = required.has(propName);
    const opt = isRequired ? "" : "?";
    const typeStr =
      propertyTypeOverrides[propName] ??
      resolveTypeScriptType(propSchema, spec, `${interfaceName}.${propName}`);
    lines.push(`  ${propName}${opt}: ${typeStr};`);
  }

  lines.push(`}`);
  return lines.join("\n");
}

/**
 * Generates narrow TypeScript types for all 41 accepted Identity API operations.
 */
export function generateIdentityApiTypes(spec) {
  if (!spec || typeof spec !== "object") {
    throw new Error("Invalid OpenAPI specification object");
  }

  // 1. Verify existence of all 41 accepted operations in OpenAPI spec
  const rootSchemas = [];
  for (const op of ACCEPTED_IDENTITY_OPERATIONS) {
    const methodLower = op.method.toLowerCase();
    const pathItem = spec.paths?.[op.path];
    if (!pathItem) {
      throw new Error(`Missing path '${op.path}' in OpenAPI spec`);
    }
    const opItem = pathItem[methodLower];
    if (!opItem) {
      throw new Error(`Missing operation '${op.method} ${op.path}' in OpenAPI spec`);
    }
    if (opItem.operationId !== op.operationId) {
      throw new Error(
        `Operation ID mismatch for '${op.method} ${op.path}': expected '${op.operationId}', got '${opItem.operationId}'`
      );
    }

    // Verify exact x-authorization-branches
    const actualBranches = opItem["x-authorization-branches"] ?? [];
    if (!deepEqual(actualBranches, op.authorizationBranches)) {
      throw new Error(
        `Authorization branches mismatch for operation '${op.operationId}': expected ${JSON.stringify(op.authorizationBranches)}, got ${JSON.stringify(actualBranches)}`
      );
    }

    // Verify exact security
    const actualSecurity = opItem.security ?? [];
    if (!deepEqual(actualSecurity, op.security)) {
      throw new Error(
        `Security mismatch for operation '${op.operationId}': expected ${JSON.stringify(op.security)}, got ${JSON.stringify(actualSecurity)}`
      );
    }

    // Verify path parameters
    const pathParamMatches = op.path.match(/\{([a-zA-Z0-9_-]+)\}/g) || [];
    for (const match of pathParamMatches) {
      const pName = match.slice(1, -1);
      const paramDef = (opItem.parameters || []).find((p) => p && p.name === pName && p.in === "path");
      if (!paramDef || paramDef.required !== true) {
        throw new Error(
          `Missing or unrequired path parameter '${pName}' on operation '${op.operationId}'`
        );
      }
    }

    if (op.requestSchemaName) {
      const reqSchema = opItem.requestBody?.content?.["application/json"]?.schema;
      if (!reqSchema) {
        throw new Error(`Missing requestBody schema for '${op.method} ${op.path}'`);
      }
      rootSchemas.push({
        schema: reqSchema,
        path: `paths['${op.path}'].${methodLower}.requestBody.content['application/json'].schema`,
      });
    }

    const resStatus = String(op.expectedStatus);
    const resSchema = opItem.responses?.[resStatus]?.content?.["application/json"]?.schema;
    if (!resSchema) {
      throw new Error(`Missing response ${resStatus} schema for '${op.method} ${op.path}'`);
    }
    rootSchemas.push({
      schema: resSchema,
      path: `paths['${op.path}'].${methodLower}.responses['${resStatus}'].content['application/json'].schema`,
    });
  }

  const errorSchema = spec.components?.schemas?.["ErrorResponse"];
  const errorDetailSchema = spec.components?.schemas?.["ErrorDetail"];
  const successMetaSchema = spec.components?.schemas?.["SuccessMeta"];
  const csrfTokenSchema = spec.components?.schemas?.["CsrfTokenResponse"];

  if (!errorSchema) throw new Error("Missing ErrorResponse schema in components.schemas");
  if (!errorDetailSchema) throw new Error("Missing ErrorDetail schema in components.schemas");
  if (!successMetaSchema) throw new Error("Missing SuccessMeta schema in components.schemas");
  if (!csrfTokenSchema) throw new Error("Missing CsrfTokenResponse schema in components.schemas");

  rootSchemas.push(
    { schema: errorSchema, path: "components.schemas['ErrorResponse']" },
    { schema: errorDetailSchema, path: "components.schemas['ErrorDetail']" },
    { schema: successMetaSchema, path: "components.schemas['SuccessMeta']" },
    { schema: csrfTokenSchema, path: "components.schemas['CsrfTokenResponse']" }
  );

  // 2. Preflight all reachable references
  preflightReachableReferences(spec, rootSchemas);

  // 3. Resolve & validate schema structures
  const successMetaCode = generateInterfaceFromSchema("SuccessMeta", successMetaSchema, spec);
  const csrfTokenCode = generateInterfaceFromSchema("CsrfTokenResponse", csrfTokenSchema, spec);

  // --- Request DTOs ---
  const registerReqCode = generateInterfaceFromSchema("RegisterRequest", spec.components.schemas["RegisterRequest"], spec);
  const loginReqCode = generateInterfaceFromSchema("LoginRequest", spec.components.schemas["LoginRequest"], spec);
  const forgotReqCode = generateInterfaceFromSchema("PasswordForgotRequest", spec.components.schemas["PasswordForgotRequest"], spec);
  const resetReqCode = generateInterfaceFromSchema("PasswordResetRequest", spec.components.schemas["PasswordResetRequest"], spec);
  const emailVerifyReqCode = generateInterfaceFromSchema("EmailVerifyRequest", spec.components.schemas["EmailVerifyRequest"], spec);
  const emailResendReqCode = generateInterfaceFromSchema("PassengerEmailResendRequest", spec.components.schemas["PassengerEmailResendRequest"], spec);
  const updatePassengerProfileReqCode = generateInterfaceFromSchema("UpdatePassengerProfileRequest", spec.components.schemas["UpdatePassengerProfileRequest"], spec);
  const createTravelerReqCode = generateInterfaceFromSchema("CreateTravelerRequest", spec.components.schemas["CreateTravelerRequest"], spec);
  const patchTravelerReqCode = generateInterfaceFromSchema("PatchTravelerRequest", spec.components.schemas["PatchTravelerRequest"], spec);
  const passengerPasswordChangeReqCode = generateInterfaceFromSchema("PassengerPasswordChangeRequest", spec.components.schemas["PassengerPasswordChangeRequest"], spec);
  const staffLoginReqCode = generateInterfaceFromSchema("StaffLoginRequest", spec.components.schemas["StaffLoginRequest"], spec);
  const staffMfaChallengeReqCode = generateInterfaceFromSchema("StaffMfaChallengeRequest", spec.components.schemas["StaffMfaChallengeRequest"], spec);
  const staffMfaVerifyReqCode = generateInterfaceFromSchema("StaffMfaVerifyRequest", spec.components.schemas["StaffMfaVerifyRequest"], spec);
  const createStaffUserReqCode = generateInterfaceFromSchema("CreateStaffUserRequest", spec.components.schemas["CreateStaffUserRequest"], spec);
  const patchStaffUserReqCode = generateInterfaceFromSchema("PatchStaffUserRequest", spec.components.schemas["PatchStaffUserRequest"], spec);
  const staffMfaEnrollmentConfirmReqCode = generateInterfaceFromSchema("StaffMfaEnrollmentConfirmRequest", spec.components.schemas["StaffMfaEnrollmentConfirmRequest"], spec);
  const staffStepUpReqCode = generateInterfaceFromSchema("StaffStepUpRequest", spec.components.schemas["StaffStepUpRequest"], spec);
  const staffMfaSetupConfirmReqCode = generateInterfaceFromSchema("StaffMfaSetupConfirmRequest", spec.components.schemas["StaffMfaSetupConfirmRequest"], spec);
  const staffPasswordForgotReqCode = generateInterfaceFromSchema("StaffPasswordForgotRequest", spec.components.schemas["StaffPasswordForgotRequest"], spec);
  const staffPasswordResetReqCode = generateInterfaceFromSchema("StaffPasswordResetRequest", spec.components.schemas["StaffPasswordResetRequest"], spec);
  const staffPasswordChangeReqCode = generateInterfaceFromSchema("StaffPasswordChangeRequest", spec.components.schemas["StaffPasswordChangeRequest"], spec);
  const staffInvitationAcceptReqCode = generateInterfaceFromSchema("StaffInvitationAcceptRequest", spec.components.schemas["StaffInvitationAcceptRequest"], spec);

  // --- Response Data DTOs ---
  const passengerReceiptSchema = spec.components.schemas["PassengerRegisterReceiptResponse"];
  const passengerReceiptDataCode = generateInterfaceFromSchema("PassengerRegisterReceiptData", passengerReceiptSchema.properties.data, spec);
  const passengerReceiptResponseCode = generateInterfaceFromSchema("PassengerRegisterReceiptResponse", passengerReceiptSchema, spec, { data: "PassengerRegisterReceiptData" });

  const passengerAuthSchema = spec.components.schemas["PassengerAuthResponse"];
  const passengerProfileCode = generateInterfaceFromSchema("PassengerProfile", passengerAuthSchema.properties.data.properties.user, spec);
  const passengerAuthDataCode = generateInterfaceFromSchema("PassengerAuthData", passengerAuthSchema.properties.data, spec, { user: "PassengerProfile" });
  const passengerAuthResponseCode = generateInterfaceFromSchema("PassengerAuthResponse", passengerAuthSchema, spec, { data: "PassengerAuthData" });

  const passengerProfileDtoCode = generateInterfaceFromSchema("PassengerProfileDto", spec.components.schemas["PassengerProfileDto"], spec);
  const passengerProfileResponseCode = generateInterfaceFromSchema("PassengerProfileResponse", spec.components.schemas["PassengerProfileResponse"], spec);

  const passengerProfileReceiptDtoCode = generateInterfaceFromSchema("PassengerProfileReceiptDto", spec.components.schemas["PassengerProfileReceiptDto"], spec);
  const passengerProfileReceiptResponseCode = generateInterfaceFromSchema("PassengerProfileReceiptResponse", spec.components.schemas["PassengerProfileReceiptResponse"], spec);

  const travelerDtoCode = generateInterfaceFromSchema("TravelerDto", spec.components.schemas["TravelerDto"], spec);
  const savedTravelersResponseCode = generateInterfaceFromSchema("SavedTravelersResponse", spec.components.schemas["SavedTravelersResponse"], spec);
  const savedTravelerResponseCode = generateInterfaceFromSchema("SavedTravelerResponse", spec.components.schemas["SavedTravelerResponse"], spec);
  const deleteTravelerResponseCode = generateInterfaceFromSchema("DeleteTravelerResponse", spec.components.schemas["DeleteTravelerResponse"], spec, { data: "{ deleted: boolean }" });

  const passengerSessionDtoCode = generateInterfaceFromSchema("PassengerSessionDto", spec.components.schemas["PassengerSessionDto"], spec);
  const passengerSessionListResponseCode = generateInterfaceFromSchema("PassengerSessionListResponse", spec.components.schemas["PassengerSessionListResponse"], spec, { data: "{ sessions: PassengerSessionDto[] }" });
  const passengerSessionRevokeResponseCode = generateInterfaceFromSchema("PassengerSessionRevokeResponse", spec.components.schemas["PassengerSessionRevokeResponse"], spec, { data: "{ revoked: true }" });
  const passengerPasswordChangeResponseCode = generateInterfaceFromSchema("PassengerPasswordChangeResponse", spec.components.schemas["PassengerPasswordChangeResponse"], spec, { data: "{ changed: true }" });

  // Inline passenger responses
  const passengerLogoutResponse = spec.paths["/auth/logout"].post.responses["200"].content["application/json"].schema;
  const passengerLogoutResponseCode = generateInterfaceFromSchema("PassengerLogoutResponse", passengerLogoutResponse, spec, { data: "{ message: string }" });

  const passwordForgotResponse = spec.paths["/auth/password/forgot"].post.responses["202"].content["application/json"].schema;
  const passwordForgotResponseCode = generateInterfaceFromSchema("PasswordForgotResponse", passwordForgotResponse, spec, { data: "{ message: string }" });

  const passwordResetResponse = spec.paths["/auth/password/reset"].post.responses["200"].content["application/json"].schema;
  const passwordResetResponseCode = generateInterfaceFromSchema("PasswordResetResponse", passwordResetResponse, spec, { data: "{ message: string }" });

  const emailVerifyResponse = spec.paths["/auth/email/verify"].post.responses["200"].content["application/json"].schema;
  const emailVerifyResponseCode = generateInterfaceFromSchema("EmailVerifyResponse", emailVerifyResponse, spec, { data: "{ verified: boolean }" });

  // Staff responses
  const staffPendingAuthSchema = spec.components.schemas["StaffPendingAuthResponse"];
  const staffPendingAuthDataCode = generateInterfaceFromSchema("StaffPendingAuthData", staffPendingAuthSchema.properties.data, spec);
  const staffPendingAuthResponseCode = generateInterfaceFromSchema("StaffPendingAuthResponse", staffPendingAuthSchema, spec, { data: "StaffPendingAuthData" });

  const staffLogoutResponse = spec.paths["/staff/logout"].post.responses["200"].content["application/json"].schema;
  const staffLogoutResponseCode = generateInterfaceFromSchema("StaffLogoutResponse", staffLogoutResponse, spec, { data: "{ message: string }" });

  const staffMeSchema = spec.components.schemas["StaffMeResponse"];
  const staffProfileCode = generateInterfaceFromSchema("StaffProfile", staffMeSchema.properties.data, spec);
  const staffMeResponseCode = generateInterfaceFromSchema("StaffMeResponse", staffMeSchema, spec, { data: "StaffProfile" });

  const staffMfaSetupResponseCode = generateInterfaceFromSchema("StaffMfaSetupResponse", spec.components.schemas["StaffMfaSetupResponse"], spec, { data: "{ secret: string; qrCodeUri: string }" });

  const staffMfaChallengeResponseSchema = spec.paths["/staff/mfa/challenge"].post.responses["200"].content["application/json"].schema;
  const staffMfaChallengeResponseCode = generateInterfaceFromSchema("StaffMfaChallengeResponse", staffMfaChallengeResponseSchema, spec, { data: "{ status: string; expiresAt: string }" });

  const staffAuthSchema = spec.components.schemas["StaffAuthResponse"];
  const staffAuthUserCode = generateInterfaceFromSchema("StaffAuthUser", staffAuthSchema.properties.data.properties.staff, spec);
  const staffAuthDataCode = generateInterfaceFromSchema("StaffAuthData", staffAuthSchema.properties.data, spec, { staff: "StaffAuthUser" });
  const staffAuthResponseCode = generateInterfaceFromSchema("StaffAuthResponse", staffAuthSchema, spec, { data: "StaffAuthData" });

  const staffSessionDtoCode = generateInterfaceFromSchema("StaffSessionDto", spec.components.schemas["StaffSessionsListResponse"].properties.data.items, spec);
  const staffSessionsListResponseCode = generateInterfaceFromSchema("StaffSessionsListResponse", spec.components.schemas["StaffSessionsListResponse"], spec, { data: "StaffSessionDto[]" });

  const deleteStaffSessionSchema = spec.paths["/staff/sessions/{id}"].delete.responses["200"].content["application/json"].schema;
  const deleteStaffSessionResponseCode = generateInterfaceFromSchema("DeleteStaffSessionResponse", deleteStaffSessionSchema, spec, { data: "{ revoked: boolean }" });

  const staffUserDirectoryDtoCode = generateInterfaceFromSchema("StaffUserDirectoryDto", spec.components.schemas["StaffUserDirectoryDto"], spec);
  const staffUsersListResponseCode = generateInterfaceFromSchema("StaffUsersListResponse", spec.components.schemas["StaffUsersListResponse"], spec);
  const staffUserResponseCode = generateInterfaceFromSchema("StaffUserResponse", spec.components.schemas["StaffUserResponse"], spec);

  const deleteStaffUserSchema = spec.paths["/staff/users/{id}"].delete.responses["200"].content["application/json"].schema;
  const deleteStaffUserResponseCode = generateInterfaceFromSchema("DeleteStaffUserResponse", deleteStaffUserSchema, spec, { data: "{ deactivated: boolean }" });

  const staffDtoCode = generateInterfaceFromSchema("StaffDto", spec.components.schemas["StaffDto"], spec);

  const staffMfaEnrollmentSetupResponseCode = generateInterfaceFromSchema("StaffMfaEnrollmentSetupResponse", spec.components.schemas["StaffMfaEnrollmentSetupResponse"], spec, { data: "{ secret: string; qrCodeUri: string; expiresAt: string }" });

  const staffMfaEnrollmentConfirmDataCode = generateInterfaceFromSchema("StaffMfaEnrollmentConfirmData", spec.components.schemas["StaffMfaEnrollmentConfirmResponse"].properties.data, spec, {
    enrolled: "true",
    recoveryCodes: "string[]",
    user: "StaffDto",
  });
  const staffMfaEnrollmentConfirmResponseCode = generateInterfaceFromSchema("StaffMfaEnrollmentConfirmResponse", spec.components.schemas["StaffMfaEnrollmentConfirmResponse"], spec, { data: "StaffMfaEnrollmentConfirmData" });

  const staffStepUpResponseCode = generateInterfaceFromSchema("StaffStepUpResponse", spec.components.schemas["StaffStepUpResponse"], spec, { data: "{ verified: true; expiresAt: string }" });

  const staffMfaSetupConfirmResponseCode = generateInterfaceFromSchema("StaffMfaSetupConfirmResponse", spec.components.schemas["StaffMfaSetupConfirmResponse"], spec, { data: "{ confirmed: true; recoveryCodes: string[] }" });

  const staffRecoveryCodesRegenerateResponseCode = generateInterfaceFromSchema("StaffRecoveryCodesRegenerateResponse", spec.components.schemas["StaffRecoveryCodesRegenerateResponse"], spec, { data: "{ recoveryCodes: string[] }" });

  const staffPasswordForgotReceiptResponseCode = generateInterfaceFromSchema("StaffPasswordForgotReceiptResponse", spec.components.schemas["StaffPasswordForgotReceiptResponse"], spec, { data: "{ status: \"reset_dispatched\"; message: string }" });

  const staffPasswordResetResponseCode = generateInterfaceFromSchema("StaffPasswordResetResponse", spec.components.schemas["StaffPasswordResetResponse"], spec, { data: "{ reset: true }" });

  const staffPasswordChangeResponseCode = generateInterfaceFromSchema("StaffPasswordChangeResponse", spec.components.schemas["StaffPasswordChangeResponse"], spec, { data: "{ changed: true }" });

  const staffInvitationAcceptResponseCode = generateInterfaceFromSchema("StaffInvitationAcceptResponse", spec.components.schemas["StaffInvitationAcceptResponse"], spec, { data: "{ status: \"enrollment_required\"; expiresAt: string }" });

  const staffInviteReissueResponseCode = generateInterfaceFromSchema("StaffInviteReissueResponse", spec.components.schemas["StaffInviteReissueResponse"], spec, { data: "{ reissued: true; expiresAt: string }" });

  const staffInviteRevokeResponseCode = generateInterfaceFromSchema("StaffInviteRevokeResponse", spec.components.schemas["StaffInviteRevokeResponse"], spec, { data: "{ revoked: true }" });

  // Error schema
  const errorDetailCode = generateInterfaceFromSchema("ErrorDetail", errorDetailSchema, spec);
  const errorMetaCode = generateInterfaceFromSchema("ErrorMeta", errorSchema.properties.meta, spec);
  const errorResponseCode = generateInterfaceFromSchema("ErrorResponse", errorSchema, spec, {
    error: "ErrorDetail",
    meta: "ErrorMeta",
  });

  const sections = [
    "/**",
    " * Gaza Gateway / Palestinian Airlines",
    " * Phase 13B Identity API — Narrow Generated Types",
    " *",
    " * Auto-generated from docs/backend/openapi.v1.json by scripts/generate-identity-api-types.mjs.",
    " * DO NOT HAND-EDIT THIS FILE DIRECTLY. Run `node scripts/generate-identity-api-types.mjs` to regenerate.",
    " */",
    "",
    successMetaCode,
    "",
    csrfTokenCode,
    "",
    "// --- Request DTOs ---",
    registerReqCode,
    "",
    loginReqCode,
    "",
    forgotReqCode,
    "",
    resetReqCode,
    "",
    emailVerifyReqCode,
    "",
    emailResendReqCode,
    "",
    updatePassengerProfileReqCode,
    "",
    createTravelerReqCode,
    "",
    patchTravelerReqCode,
    "",
    passengerPasswordChangeReqCode,
    "",
    staffLoginReqCode,
    "",
    staffMfaChallengeReqCode,
    "",
    staffMfaVerifyReqCode,
    "",
    createStaffUserReqCode,
    "",
    patchStaffUserReqCode,
    "",
    staffMfaEnrollmentConfirmReqCode,
    "",
    staffStepUpReqCode,
    "",
    staffMfaSetupConfirmReqCode,
    "",
    staffPasswordForgotReqCode,
    "",
    staffPasswordResetReqCode,
    "",
    staffPasswordChangeReqCode,
    "",
    staffInvitationAcceptReqCode,
    "",
    "// --- Response Data & Envelopes ---",
    passengerReceiptDataCode,
    "",
    passengerReceiptResponseCode,
    "",
    passengerProfileCode,
    "",
    passengerAuthDataCode,
    "",
    passengerAuthResponseCode,
    "",
    passengerLogoutResponseCode,
    "",
    passwordForgotResponseCode,
    "",
    passwordResetResponseCode,
    "",
    emailVerifyResponseCode,
    "",
    "export type PassengerEmailResendResponse = PassengerRegisterReceiptResponse;",
    "",
    passengerProfileDtoCode,
    "",
    passengerProfileResponseCode,
    "",
    passengerProfileReceiptDtoCode,
    "",
    passengerProfileReceiptResponseCode,
    "",
    travelerDtoCode,
    "",
    savedTravelerResponseCode,
    "",
    savedTravelersResponseCode,
    "",
    deleteTravelerResponseCode,
    "",
    passengerSessionDtoCode,
    "",
    passengerSessionListResponseCode,
    "",
    passengerSessionRevokeResponseCode,
    "",
    passengerPasswordChangeResponseCode,
    "",
    staffPendingAuthDataCode,
    "",
    staffPendingAuthResponseCode,
    "",
    staffLogoutResponseCode,
    "",
    staffProfileCode,
    "",
    staffMeResponseCode,
    "",
    staffMfaSetupResponseCode,
    "",
    staffMfaChallengeResponseCode,
    "",
    staffAuthUserCode,
    "",
    staffAuthDataCode,
    "",
    staffAuthResponseCode,
    "",
    staffSessionDtoCode,
    "",
    staffSessionsListResponseCode,
    "",
    deleteStaffSessionResponseCode,
    "",
    staffUserDirectoryDtoCode,
    "",
    staffUsersListResponseCode,
    "",
    staffUserResponseCode,
    "",
    deleteStaffUserResponseCode,
    "",
    staffDtoCode,
    "",
    staffMfaEnrollmentSetupResponseCode,
    "",
    staffMfaEnrollmentConfirmDataCode,
    "",
    staffMfaEnrollmentConfirmResponseCode,
    "",
    staffStepUpResponseCode,
    "",
    staffMfaSetupConfirmResponseCode,
    "",
    staffRecoveryCodesRegenerateResponseCode,
    "",
    staffPasswordForgotReceiptResponseCode,
    "",
    staffPasswordResetResponseCode,
    "",
    staffPasswordChangeResponseCode,
    "",
    staffInvitationAcceptResponseCode,
    "",
    staffInviteReissueResponseCode,
    "",
    staffInviteRevokeResponseCode,
    "",
    "// --- Error Structures ---",
    errorDetailCode,
    "",
    errorMetaCode,
    "",
    errorResponseCode,
    "",
    "export type IdentityResponse =",
    "  | CsrfTokenResponse",
    "  | PassengerRegisterReceiptResponse",
    "  | PassengerAuthResponse",
    "  | PassengerLogoutResponse",
    "  | PasswordForgotResponse",
    "  | PasswordResetResponse",
    "  | EmailVerifyResponse",
    "  | PassengerProfileResponse",
    "  | PassengerProfileReceiptResponse",
    "  | SavedTravelerResponse",
    "  | SavedTravelersResponse",
    "  | DeleteTravelerResponse",
    "  | PassengerSessionListResponse",
    "  | PassengerSessionRevokeResponse",
    "  | PassengerPasswordChangeResponse",
    "  | StaffPendingAuthResponse",
    "  | StaffLogoutResponse",
    "  | StaffMeResponse",
    "  | StaffMfaSetupResponse",
    "  | StaffMfaChallengeResponse",
    "  | StaffAuthResponse",
    "  | StaffSessionsListResponse",
    "  | DeleteStaffSessionResponse",
    "  | StaffUsersListResponse",
    "  | StaffUserResponse",
    "  | DeleteStaffUserResponse",
    "  | StaffMfaEnrollmentSetupResponse",
    "  | StaffMfaEnrollmentConfirmResponse",
    "  | StaffStepUpResponse",
    "  | StaffMfaSetupConfirmResponse",
    "  | StaffRecoveryCodesRegenerateResponse",
    "  | StaffPasswordForgotReceiptResponse",
    "  | StaffPasswordResetResponse",
    "  | StaffPasswordChangeResponse",
    "  | StaffInvitationAcceptResponse",
    "  | StaffInviteReissueResponse",
    "  | StaffInviteRevokeResponse;",
    "",
  ];

  return sections.join("\n");
}

/**
 * Generates the narrow contract JSON artifact for all 41 identity operations.
 */
export function generateIdentityApiContract(spec) {
  if (!spec || typeof spec !== "object") {
    throw new Error("Invalid OpenAPI specification object");
  }

  // Pre-validate that all operations and schemas are reachable
  generateIdentityApiTypes(spec);

  const reachableSchemas = {
    RegisterRequest: spec.components?.schemas?.["RegisterRequest"],
    LoginRequest: spec.components?.schemas?.["LoginRequest"],
    PasswordForgotRequest: spec.components?.schemas?.["PasswordForgotRequest"],
    PasswordResetRequest: spec.components?.schemas?.["PasswordResetRequest"],
    EmailVerifyRequest: spec.components?.schemas?.["EmailVerifyRequest"],
    PassengerEmailResendRequest: spec.components?.schemas?.["PassengerEmailResendRequest"],
    UpdatePassengerProfileRequest: spec.components?.schemas?.["UpdatePassengerProfileRequest"],
    CreateTravelerRequest: spec.components?.schemas?.["CreateTravelerRequest"],
    PatchTravelerRequest: spec.components?.schemas?.["PatchTravelerRequest"],
    PassengerPasswordChangeRequest: spec.components?.schemas?.["PassengerPasswordChangeRequest"],
    StaffLoginRequest: spec.components?.schemas?.["StaffLoginRequest"],
    StaffMfaChallengeRequest: spec.components?.schemas?.["StaffMfaChallengeRequest"],
    StaffMfaVerifyRequest: spec.components?.schemas?.["StaffMfaVerifyRequest"],
    CreateStaffUserRequest: spec.components?.schemas?.["CreateStaffUserRequest"],
    PatchStaffUserRequest: spec.components?.schemas?.["PatchStaffUserRequest"],
    StaffMfaEnrollmentConfirmRequest: spec.components?.schemas?.["StaffMfaEnrollmentConfirmRequest"],
    StaffStepUpRequest: spec.components?.schemas?.["StaffStepUpRequest"],
    StaffMfaSetupConfirmRequest: spec.components?.schemas?.["StaffMfaSetupConfirmRequest"],
    StaffPasswordForgotRequest: spec.components?.schemas?.["StaffPasswordForgotRequest"],
    StaffPasswordResetRequest: spec.components?.schemas?.["StaffPasswordResetRequest"],
    StaffPasswordChangeRequest: spec.components?.schemas?.["StaffPasswordChangeRequest"],
    StaffInvitationAcceptRequest: spec.components?.schemas?.["StaffInvitationAcceptRequest"],
    PassengerRegisterReceiptResponse: spec.components?.schemas?.["PassengerRegisterReceiptResponse"],
    PassengerAuthResponse: spec.components?.schemas?.["PassengerAuthResponse"],
    PassengerProfileDto: spec.components?.schemas?.["PassengerProfileDto"],
    PassengerProfileReceiptDto: spec.components?.schemas?.["PassengerProfileReceiptDto"],
    PassengerProfileReceiptResponse: spec.components?.schemas?.["PassengerProfileReceiptResponse"],
    PassengerProfileResponse: spec.components?.schemas?.["PassengerProfileResponse"],
    TravelerDto: spec.components?.schemas?.["TravelerDto"],
    SavedTravelerResponse: spec.components?.schemas?.["SavedTravelerResponse"],
    SavedTravelersResponse: spec.components?.schemas?.["SavedTravelersResponse"],
    DeleteTravelerResponse: spec.components?.schemas?.["DeleteTravelerResponse"],
    PassengerSessionDto: spec.components?.schemas?.["PassengerSessionDto"],
    PassengerSessionListResponse: spec.components?.schemas?.["PassengerSessionListResponse"],
    PassengerSessionRevokeResponse: spec.components?.schemas?.["PassengerSessionRevokeResponse"],
    PassengerPasswordChangeResponse: spec.components?.schemas?.["PassengerPasswordChangeResponse"],
    StaffPendingAuthResponse: spec.components?.schemas?.["StaffPendingAuthResponse"],
    StaffMeResponse: spec.components?.schemas?.["StaffMeResponse"],
    StaffMfaSetupResponse: spec.components?.schemas?.["StaffMfaSetupResponse"],
    StaffAuthResponse: spec.components?.schemas?.["StaffAuthResponse"],
    StaffSessionDto: spec.components?.schemas?.["StaffSessionsListResponse"]?.properties?.data?.items,
    StaffSessionsListResponse: spec.components?.schemas?.["StaffSessionsListResponse"],
    StaffUserDirectoryDto: spec.components?.schemas?.["StaffUserDirectoryDto"],
    StaffUsersListResponse: spec.components?.schemas?.["StaffUsersListResponse"],
    StaffUserResponse: spec.components?.schemas?.["StaffUserResponse"],
    StaffDto: spec.components?.schemas?.["StaffDto"],
    StaffMfaEnrollmentSetupResponse: spec.components?.schemas?.["StaffMfaEnrollmentSetupResponse"],
    StaffMfaEnrollmentConfirmResponse: spec.components?.schemas?.["StaffMfaEnrollmentConfirmResponse"],
    StaffStepUpResponse: spec.components?.schemas?.["StaffStepUpResponse"],
    StaffMfaSetupConfirmResponse: spec.components?.schemas?.["StaffMfaSetupConfirmResponse"],
    StaffRecoveryCodesRegenerateResponse: spec.components?.schemas?.["StaffRecoveryCodesRegenerateResponse"],
    StaffPasswordForgotReceiptResponse: spec.components?.schemas?.["StaffPasswordForgotReceiptResponse"],
    StaffPasswordResetResponse: spec.components?.schemas?.["StaffPasswordResetResponse"],
    StaffPasswordChangeResponse: spec.components?.schemas?.["StaffPasswordChangeResponse"],
    StaffInvitationAcceptResponse: spec.components?.schemas?.["StaffInvitationAcceptResponse"],
    StaffInviteReissueResponse: spec.components?.schemas?.["StaffInviteReissueResponse"],
    StaffInviteRevokeResponse: spec.components?.schemas?.["StaffInviteRevokeResponse"],
    ErrorResponse: spec.components?.schemas?.["ErrorResponse"],
    ErrorDetail: spec.components?.schemas?.["ErrorDetail"],
    SuccessMeta: spec.components?.schemas?.["SuccessMeta"],
    CsrfTokenResponse: spec.components?.schemas?.["CsrfTokenResponse"],
    PassengerLogoutResponse: spec.paths?.["/auth/logout"]?.post?.responses?.["200"]?.content?.["application/json"]?.schema,
    PasswordForgotResponse: spec.paths?.["/auth/password/forgot"]?.post?.responses?.["202"]?.content?.["application/json"]?.schema,
    PasswordResetResponse: spec.paths?.["/auth/password/reset"]?.post?.responses?.["200"]?.content?.["application/json"]?.schema,
    EmailVerifyResponse: spec.paths?.["/auth/email/verify"]?.post?.responses?.["200"]?.content?.["application/json"]?.schema,
    StaffLogoutResponse: spec.paths?.["/staff/logout"]?.post?.responses?.["200"]?.content?.["application/json"]?.schema,
    StaffMfaChallengeResponse: spec.paths?.["/staff/mfa/challenge"]?.post?.responses?.["200"]?.content?.["application/json"]?.schema,
    DeleteStaffSessionResponse: spec.paths?.["/staff/sessions/{id}"]?.delete?.responses?.["200"]?.content?.["application/json"]?.schema,
    DeleteStaffUserResponse: spec.paths?.["/staff/users/{id}"]?.delete?.responses?.["200"]?.content?.["application/json"]?.schema,
  };

  function canonicalStringify(obj) {
    if (obj === null || typeof obj !== "object") {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return "[" + obj.map(canonicalStringify).join(",") + "]";
    }
    const keys = Object.keys(obj).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalStringify(obj[k])).join(",") + "}";
  }

  const contractOperations = ACCEPTED_IDENTITY_OPERATIONS.map((op) => {
    const methodLower = op.method.toLowerCase();
    const specOp = spec.paths?.[op.path]?.[methodLower];
    return {
      ...op,
      authorizationBranches: specOp?.["x-authorization-branches"] ?? op.authorizationBranches,
    };
  });

  const schemaDigest = crypto.createHash("sha256").update(canonicalStringify({ operations: contractOperations, schemas: reachableSchemas })).digest("hex");

  return (
    JSON.stringify(
      {
        $schema: "identity-api-contract-v1",
        version: "1.0.0",
        description: "Narrow contract extraction for 41 accepted Phase 13B identity transport operations",
        digest: schemaDigest,
        operations: contractOperations,
        schemas: reachableSchemas,
      },
      null,
      2
    ) + "\n"
  );
}

/**
 * Checks whether existing disk artifacts match freshly generated types and contract.
 */
export function checkIdentityApiTypes(
  typesPath = DEFAULT_TYPES_OUTPUT_PATH,
  contractPath = DEFAULT_CONTRACT_OUTPUT_PATH,
  specPath = DEFAULT_SPEC_PATH
) {
  if (!fs.existsSync(specPath)) {
    throw new Error(`OpenAPI spec not found at: ${specPath}`);
  }
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const expectedTypesContent = generateIdentityApiTypes(spec);
  const expectedContractContent = generateIdentityApiContract(spec);

  if (!fs.existsSync(typesPath)) {
    return { ok: false, reason: `Types file does not exist: ${typesPath}` };
  }
  if (!fs.existsSync(contractPath)) {
    return { ok: false, reason: `Contract file does not exist: ${contractPath}` };
  }

  const actualTypesContent = fs.readFileSync(typesPath, "utf8").replace(/\r\n/g, "\n");
  if (actualTypesContent !== expectedTypesContent) {
    return { ok: false, reason: "Types file content does not match freshly generated types" };
  }

  const actualContractContent = fs.readFileSync(contractPath, "utf8").replace(/\r\n/g, "\n");
  if (actualContractContent !== expectedContractContent) {
    return { ok: false, reason: "Contract file content does not match freshly generated contract" };
  }

  return { ok: true, reason: null };
}

/**
 * CLI Entrypoint
 */
export function runCli(argv = process.argv.slice(2)) {
  let isCheck = false;
  let specPath = DEFAULT_SPEC_PATH;
  let typesPath = DEFAULT_TYPES_OUTPUT_PATH;
  let contractPath = DEFAULT_CONTRACT_OUTPUT_PATH;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check") {
      isCheck = true;
    } else if (arg === "--spec" && i + 1 < argv.length) {
      specPath = path.resolve(process.cwd(), argv[++i]);
    } else if (arg === "--types" && i + 1 < argv.length) {
      typesPath = path.resolve(process.cwd(), argv[++i]);
    } else if (arg === "--contract" && i + 1 < argv.length) {
      contractPath = path.resolve(process.cwd(), argv[++i]);
    } else {
      console.error(`Unknown argument '${arg}'. Supported argument: '--check'.`);
      return 1;
    }
  }

  if (isCheck) {
    const result = checkIdentityApiTypes(typesPath, contractPath, specPath);
    if (!result.ok) {
      console.error(`✗ Stale artifact: ${result.reason}`);
      console.error("  Run 'node scripts/generate-identity-api-types.mjs' to regenerate.");
      return 1;
    }
    console.log(`✓ Identity API types and contract are up to date.`);
    return 0;
  }

  if (!fs.existsSync(specPath)) {
    console.error(`✗ Spec not found: ${specPath}`);
    return 1;
  }
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const typesContent = generateIdentityApiTypes(spec);
  const contractContent = generateIdentityApiContract(spec);

  fs.mkdirSync(path.dirname(typesPath), { recursive: true });
  fs.writeFileSync(typesPath, typesContent, "utf8");
  fs.writeFileSync(contractPath, contractContent, "utf8");

  console.log(`✓ Generated ${path.relative(repositoryRoot, typesPath)} and ${path.relative(repositoryRoot, contractPath)} successfully.`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runCli();
}
