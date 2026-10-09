// Architectural policy specified independently of the OpenAPI under test.
// Development contract tooling only; no runtime authentication is implemented.
export const IDENTITY_POLICY = {
  version: "1.0.0",
  cookies: {
    passenger: {
      name: "gza_session",
      path: "/api/v1",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
      hostOnly: true,
    },
    staff: {
      name: "gza_staff_session",
      path: "/api/v1",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
      hostOnly: true,
    },
    pending: {
      name: "gza_staff_pending",
      path: "/api/v1",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
      hostOnly: true,
      maxAge: 300,
    },
  },
  sessions: {
    passenger: { absolute: 604800, idle: 86400 },
    staff: { absolute: 28800, idle: 3600 },
    anonymous: { absolute: 1800, idle: 1800 },
    pending: { absolute: 300, attempts: 5 },
    stepUp: 300,
  },
  passwords: {
    passenger: { min: 15, max: 128 },
    staff: { min: 12, max: 128 },
    algorithm: "Argon2id",
    memoryKiB: 65536,
    timeCost: 4,
    parallelism: 1,
    trim: false,
  },
  mfa: {
    algorithm: "HMAC-SHA1",
    digits: 6,
    period: 30,
    skew: 1,
    recoveryCount: 10,
    recoveryEntropyBits: 128,
    encryptedSecret: true,
    oneUseCounter: true,
  },
  proofs: {
    passenger_email_verification: {
      realm: "passenger",
      ttl: 86400,
      entropyBytes: 32,
      singleUse: true,
      digest: "sha256",
    },
    passenger_password_reset: {
      realm: "passenger",
      ttl: 1800,
      entropyBytes: 32,
      singleUse: true,
      digest: "sha256",
    },
    staff_invitation: {
      realm: "staff",
      ttl: 86400,
      entropyBytes: 32,
      singleUse: true,
      digest: "sha256",
    },
    staff_password_reset: {
      realm: "staff",
      ttl: 1800,
      entropyBytes: 32,
      singleUse: true,
      digest: "sha256",
    },
    manage_booking: {
      realm: "passenger",
      ttl: 600,
      digits: 6,
      attempts: 5,
      singleUse: true,
      digest: "hmac_sha256_with_separate_pepper",
    },
    claim_booking: {
      realm: "passenger",
      ttl: 600,
      digits: 6,
      attempts: 5,
      singleUse: true,
      digest: "hmac_sha256_with_separate_pepper",
    },
    booking_guest_grant: {
      realm: "booking",
      ttl: 900,
      entropyBytes: 32,
      singleUse: false,
      digest: "sha256",
    },
    booking_claim_proof: {
      realm: "passenger",
      ttl: 300,
      entropyBytes: 32,
      singleUse: true,
      digest: "sha256",
    },
    booking_receipt_grant: {
      realm: "booking",
      ttl: 600,
      entropyBytes: 32,
      singleUse: false,
      digest: "sha256",
    },
    login_mfa: { realm: "staff", ttl: 300, attempts: 5, singleUse: true, digest: "sha256" },
    enroll_mfa: { realm: "staff", ttl: 300, attempts: 5, singleUse: true, digest: "sha256" },
    replace_mfa: { realm: "staff", ttl: 300, attempts: 5, singleUse: true, digest: "sha256" },
  },
  rates: {
    login: [
      { key: ["subject_digest", "ip"], limit: 5, seconds: 60 },
      { key: ["ip"], limit: 30, seconds: 300 },
    ],
    dispatch: [
      { key: ["subject_digest", "ip"], limit: 3, seconds: 900 },
      { key: ["ip"], limit: 20, seconds: 3600 },
    ],
    challenge: [
      { key: ["reference_digest", "session_id", "ip"], limit: 5, seconds: 900 },
      { key: ["ip"], limit: 30, seconds: 3600 },
    ],
    proof: [{ key: ["subject_digest", "ip"], limit: 10, seconds: 600 }],
    stepUp: [{ key: ["staff_id", "session_id", "ip"], limit: 5, seconds: 600 }],
  },
  roles: ["admin", "editor", "viewer"],
  permissions: {
    admin: [
      "ops.view",
      "ops.edit",
      "content.view",
      "content.edit",
      "commercial.view",
      "commercial.edit",
      "engagement.view",
      "engagement.edit",
      "admin.manage",
      "dashboard.view",
    ],
    editor: ["dashboard.view", "content.view", "content.edit"],
    viewer: ["dashboard.view", "ops.view", "content.view", "commercial.view", "engagement.view"],
  },
  authority: {
    passenger: [
      "principal_id",
      "realm_passenger",
      "active",
      "verified_email",
      "exact_epoch",
      "absolute_expiry",
      "idle_expiry",
      "not_revoked",
    ],
    staff: [
      "principal_id",
      "realm_staff",
      "active",
      "verified_email",
      "confirmed_current_mfa",
      "exact_epoch",
      "absolute_expiry",
      "idle_expiry",
      "not_revoked",
      "server_permission",
    ],
    pending: [
      "staff_id",
      "bound_anonymous_staff_session",
      "exact_epoch",
      "exact_endpoint_purpose",
      "absolute_expiry",
      "remaining_attempts",
      "not_consumed",
      "not_revoked",
    ],
    booking: [
      "booking_id",
      "exact_reference",
      "exact_security_epoch",
      "exact_operation_scope",
      "absolute_expiry",
      "not_revoked",
    ],
  },
  origin: {
    production: ["https://www.gazaairport.com", "https://gazaairport.com"],
    wildcard: false,
    reflected: false,
    requireExplicitEnvironment: true,
  },
  sentinel: {
    table: "staff_directory_control",
    id: 1,
    lockOrder: ["sentinel", "staff_id_ascending", "proof_session_id_ascending"],
    postChangeMinimum: 1,
    writers: [
      "role",
      "status",
      "delete",
      "email_verification",
      "password_availability",
      "initial_mfa_confirmation",
      "mfa_replacement",
      "offline_recovery",
    ],
  },
  transitions: {
    passenger: {
      unverified: { verify: "active", reset: "unverified" },
      active: { reset: "active", suspend: "suspended" },
      suspended: { verify: "suspended", reset: "suspended" },
    },
    proof: {
      issued: { consume: "consumed", revoke: "revoked", expire: "expired", exhaust: "exhausted" },
      consumed: {},
      revoked: {},
      expired: {},
      exhausted: {},
    },
    staff: {
      invited: { accept: "pending_enrollment" },
      pending_enrollment: { confirm_mfa: "active", deactivate: "deactivated" },
      active: { suspend: "suspended", deactivate: "deactivated", replace_mfa: "active" },
      suspended: {},
      deactivated: {},
    },
    dispatch: {
      queued: { provider_accept: "accepted", provider_fail: "failed", expire: "expired" },
      accepted: { scrub: "scrubbed" },
      failed: { retry_before_deadline: "queued", expire: "expired" },
      expired: {},
      scrubbed: {},
    },
  },
};
const routes = {};
function add(guard, lines, permission = null) {
  for (const line of lines.trim().split("\n")) {
    const [method, path] = line.trim().split(" ");
    routes[method + " " + path] = { guard, permission };
  }
}
add(
  "public",
  "get /health\nget /health/ready\nget /version\nget /auth/csrf\npost /auth/register\npost /auth/login\npost /auth/password/forgot\npost /auth/password/reset\npost /auth/email/verify\npost /auth/email/resend\nget /staff/csrf\npost /staff/login\npost /staff/password/forgot\npost /staff/password/reset\npost /staff/invitations/accept\nget /network/airports\nget /fleet/aircraft\nget /fleet/seat-layouts/{id}\nget /schedules\nget /commercial/fares\nget /commercial/catalog\nget /dated-services/search\nget /dated-services/monthly\nget /dated-services/daily-board\nget /dated-services/{id}\npost /quotes\npost /holds\npost /bookings\npost /bookings/{ref}/challenge\npost /bookings/{ref}/verify-challenge\nget /archive/records\nget /archive/sources\npost /contact\npost /payments/intents",
);
add(
  "passenger",
  "post /auth/logout\nget /auth/passenger/profile\nput /auth/passenger/profile\nget /auth/passenger/travelers\npost /auth/passenger/travelers\npatch /auth/passenger/travelers/{id}\ndelete /auth/passenger/travelers/{id}\nget /auth/passenger/sessions\ndelete /auth/passenger/sessions/{id}\nput /auth/passenger/password\npost /account/bookings/claim\npost /account/bookings/claim/challenge\npost /account/bookings/claim/verify\nget /account/bookings\npost /migration/passenger/preview\npost /migration/passenger/commit\nget /migration/passenger/status",
);
add(
  "staff",
  "post /staff/logout\nget /staff/me\nget /staff/sessions\ndelete /staff/sessions/{id}\npost /staff/mfa/setup\npost /staff/mfa/setup/confirm\npost /staff/mfa/recovery-codes/regenerate\npost /staff/step-up\nput /staff/password",
);
add(
  "mixed_booking",
  "get /bookings/{ref}\npatch /bookings/{ref}/contact\nput /bookings/{ref}/seats\nput /bookings/{ref}/extras\npost /bookings/{ref}/cancel\npost /bookings/{ref}/check-in\npost /bookings/{ref}/check-in/undo\nget /bookings/{ref}/boarding-passes",
);
add(
  "staff",
  "post /admin/network/airports\npatch /admin/network/airports/{code}\npost /admin/fleet/aircraft\npatch /admin/fleet/aircraft/{id}\nput /admin/fleet/seat-layouts/{id}\npost /admin/schedules\npatch /admin/schedules/{id}\ndelete /admin/schedules/{id}\npost /ops/flights/overrides\ndelete /ops/flights/overrides/{serviceId}",
  "ops.edit",
);
add(
  "staff",
  "patch /admin/commercial/fares/{id}\npatch /admin/commercial/cabins/{id}\npatch /admin/commercial/baggage\npost /admin/commercial/meals\npatch /admin/commercial/meals/{id}\nput /admin/commercial/meals/order\nput /admin/commercial/meals/default\npost /admin/commercial/assistance\npatch /admin/commercial/assistance/{id}\nput /admin/commercial/assistance/order\npost /admin/payments/{id}/refund",
  "commercial.edit",
);
add(
  "staff",
  "get /admin/commercial/catalog\nget /admin/bookings\nget /admin/customers/{id}\nget /admin/payments/reconciliation",
  "commercial.view",
);
add(
  "staff",
  "put /cms/documents/{slug}\npost /cms/documents/{slug}/unpublish\npost /cms/documents/{slug}/discard\npost /cms/publish\npost /admin/archive/records\nput /admin/archive/records/{id}\npost /admin/archive/sources\nput /admin/archive/sources/{id}\npost /media/upload",
  "content.edit",
);
add(
  "staff",
  "get /cms/documents\nget /cms/documents/{slug}\nget /cms/documents/{slug}/preview\nget /cms/publications",
  "content.view",
);
add(
  "staff",
  "patch /admin/contact/inbox/{id}/assign\npost /admin/contact/inbox/{id}/notes\npatch /admin/contact/inbox/{id}/status\nput /admin/contact/inbox/{id}/reply-draft",
  "engagement.edit",
);
add("staff", "get /admin/contact/inbox\nget /admin/contact/inbox/{id}", "engagement.view");
add(
  "staff",
  "get /staff/users\npost /staff/users\npatch /staff/users/{id}\ndelete /staff/users/{id}\npost /staff/users/{id}/invite/reissue\npost /staff/users/{id}/invite/revoke\nget /admin/settings/contact\nput /admin/settings/contact/draft\npost /admin/settings/contact/discard\nget /admin/settings/appearance\nput /admin/settings/appearance/draft\npost /admin/settings/appearance/discard\npost /admin/migration/preview\npost /admin/migration/commit",
  "admin.manage",
);
add("webhook", "post /payments/webhook");
add("receipt", "get /bookings/{ref}/receipt");
add("pending_login", "post /staff/mfa/challenge\npost /staff/mfa/verify");
add("pending_enrollment", "post /staff/mfa/enrollment/setup\npost /staff/mfa/enrollment/confirm");
add("public", "get /publication-snapshots/{releaseId}");
add("staff", "get /cms/publications/{releaseId}/snapshot", "content.view");
add(
  "staff",
  "post /cms/publications/{releaseId}/build-receipts\npost /cms/publications/{releaseId}/deployment-receipts\npost /cms/publications/{releaseId}/activate\npost /cms/publications/{releaseId}/rollback",
  "admin.manage",
);
export const OPERATION_AUTHORITY = Object.freeze(routes);
export const STEP_UP_ROUTES = new Set([
  "post /staff/mfa/setup",
  "post /staff/mfa/setup/confirm",
  "post /staff/mfa/recovery-codes/regenerate",
  "post /staff/users",
  "patch /staff/users/{id}",
  "delete /staff/users/{id}",
  "post /staff/users/{id}/invite/reissue",
  "post /staff/users/{id}/invite/revoke",
  "put /staff/password",
  "post /admin/migration/commit",
  "post /cms/publications/{releaseId}/build-receipts",
  "post /cms/publications/{releaseId}/deployment-receipts",
  "post /cms/publications/{releaseId}/activate",
  "post /cms/publications/{releaseId}/rollback",
]);
export function operationProtocol(method, path) {
  const rule = routes[method + " " + path];
  if (!rule) return null;
  const unsafe = !["get", "head", "options"].includes(method);
  const branches =
    rule.guard === "mixed_booking"
      ? ["passenger", "staff", "guest"]
      : rule.guard === "public"
        ? [path.startsWith("/staff/") ? "anonymous_staff" : "anonymous_passenger"]
        : rule.guard === "pending_login" || rule.guard === "pending_enrollment"
          ? ["pending_staff"]
          : [rule.guard];
  return {
    branches: branches.map((realm) => ({
      realm,
      origin:
        realm === "webhook"
          ? "not_applicable"
          : unsafe || ["guest", "receipt"].includes(realm)
            ? "configured_frontend"
            : "read",
      csrf:
        realm === "webhook" || realm === "guest" || realm === "receipt" || !unsafe
          ? "not_applicable"
          : realm === "pending_staff"
            ? "anonymous_staff"
            : realm,
    })),
    branchSelection: "trusted_credentials_no_fallback_on_invalid_cookie",
    csrfHeader: "X-CSRF-TOKEN",
    cacheControl: "no-store",
    stepUpSeconds: STEP_UP_ROUTES.has(method + " " + path) ? 300 : null,
  };
}
