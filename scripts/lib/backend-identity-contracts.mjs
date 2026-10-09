// Pure Phase 12 contract and state models; production PHP/crypto/DB implementations are deferred.
import { isDeepStrictEqual } from "node:util";
import crypto from "node:crypto";
import {
  IDENTITY_POLICY as D,
  OPERATION_AUTHORITY,
  STEP_UP_ROUTES,
  operationProtocol,
} from "./backend-identity-policy.mjs";
import { EXPECTED_SECURITY_SCHEMES } from "./backend-contract-validation.mjs";
import { IDENTITY_RELATIONS } from "./backend-identity-relations.mjs";
const object = (x) => Boolean(x && typeof x === "object" && !Array.isArray(x));
const seconds = (x) =>
  typeof x === "number" && Number.isFinite(x)
    ? x
    : typeof x === "string"
      ? Date.parse(x) / 1000
      : NaN;
const nonempty = (x) => typeof x === "string" && x.length > 0;
const integer = (x) => Number.isSafeInteger(x) && x >= 1;
const digest = (x) => crypto.createHash("sha256").update(x).digest("hex");
function exact(actual, expected, label, errors) {
  if (!isDeepStrictEqual(actual, expected))
    errors.push(label + " differs from the approved architectural contract");
}
function alternatives(guard) {
  const scheme = {
    passenger: "PassengerCookieAuth",
    staff: "StaffCookieAuth",
    pending_login: "StaffPreAuthCookieAuth",
    pending_enrollment: "StaffPreAuthCookieAuth",
    receipt: "BookingReceiptGrantAuth",
    webhook: "WebhookSignatureAuth",
  };
  return guard === "public"
    ? []
    : guard === "mixed_booking"
      ? [{ PassengerCookieAuth: [] }, { StaffCookieAuth: [] }, { BookingGuestGrantAuth: [] }]
      : [{ [scheme[guard]]: [] }];
}
const normalized = (x) =>
  Array.isArray(x) ? x.map((y) => JSON.stringify(y, Object.keys(y).sort())).sort() : null;
export function validateOperationAuthority(spec, registry) {
  const errors = [];
  if (!object(spec?.paths) || !Array.isArray(registry?.operations))
    return { valid: false, errors: ["Missing operation graph or policy registry"] };
  const schemes = spec.components?.securitySchemes;
  exact(
    Object.keys(schemes ?? {}).sort(),
    Object.keys(EXPECTED_SECURITY_SCHEMES).sort(),
    "Security scheme names",
    errors,
  );
  for (const [name, d] of Object.entries(EXPECTED_SECURITY_SCHEMES))
    exact(
      { type: schemes?.[name]?.type, in: schemes?.[name]?.in, name: schemes?.[name]?.name },
      d,
      "Security scheme " + name,
      errors,
    );
  for (const name of ["RegisterRequest", "PasswordResetRequest"])
    exact(
      spec.components?.schemas?.[name]?.properties?.password,
      { type: "string", minLength: 15, maxLength: 128 },
      name + " password floor",
      errors,
    );
  for (const [name, field, min] of [
    ["PassengerPasswordChangeRequest", "newPassword", 15],
    ["StaffPasswordChangeRequest", "newPassword", 12],
    ["StaffPasswordResetRequest", "newPassword", 12],
    ["StaffInvitationAcceptRequest", "password", 12],
  ])
    exact(
      spec.components?.schemas?.[name]?.properties?.[field],
      { type: "string", minLength: min, maxLength: 128 },
      name + " password floor",
      errors,
    );
  const found = new Set(),
    policies = new Map(
      registry.operations
        .filter((p) => object(p) && typeof p.method === "string")
        .map((p) => [p.method.toLowerCase() + " " + p.path, p]),
    );
  for (const [path, item] of Object.entries(spec.paths))
    for (const method of ["get", "post", "put", "patch", "delete", "head", "options"]) {
      const op = item?.[method];
      if (!op) continue;
      const key = method + " " + path,
        rule = OPERATION_AUTHORITY[key];
      found.add(key);
      if (!rule) {
        errors.push("Unapproved operation " + key);
        continue;
      }
      const pol = policies.get(key);
      if (!pol) {
        errors.push("Missing policy " + key);
        continue;
      }
      exact(
        normalized(op.security),
        normalized(alternatives(rule.guard)),
        key + " security",
        errors,
      );
      exact(
        normalized(pol.allowedSecurity),
        normalized(alternatives(rule.guard)),
        key + " policy authority",
        errors,
      );
      const expectedPermission =
        rule.guard === "mixed_booking"
          ? method === "get"
            ? "commercial.view"
            : "commercial.edit"
          : rule.permission;
      exact(pol.requiredPermission, expectedPermission, key + " permission", errors);
      exact(op["x-protocol"], operationProtocol(method, path), key + " protocol", errors);
      exact(op["x-authority-policy"], rule.guard, key + " realm policy", errors);
      if (
        STEP_UP_ROUTES.has(key) &&
        (!pol.requiresRecentStepUp || op["x-requires-recent-step-up"] !== true)
      )
        errors.push(key + " requires recent session-bound MFA");
      const purpose =
        rule.guard === "pending_login"
          ? "login_mfa"
          : rule.guard === "pending_enrollment"
            ? "enroll_mfa"
            : null;
      if (purpose)
        for (const bs of [pol.branchConditions, op["x-authorization-branches"]]) {
          if (
            !Array.isArray(bs) ||
            bs.length !== 1 ||
            bs[0].purpose !== purpose ||
            bs[0].requiresBoundSession !== true
          )
            errors.push(key + " pending purpose/binding mismatch");
        }
    }
  for (const key of Object.keys(OPERATION_AUTHORITY))
    if (!found.has(key)) errors.push("Missing required operation " + key);
  return { valid: errors.length === 0, errors };
}
export function validateIdentityLifecycleManifest(manifest, expectations, spec, registry) {
  const errors = [];
  if (!object(manifest) || !object(expectations))
    return { valid: false, errors: ["Manifest/expectations must be objects"] };
  const keys = ["version", "design", "relations", "operationBindings", "implementationBoundary"];
  if (Object.keys(manifest).sort().join() !== keys.sort().join())
    errors.push("Manifest root must have the closed five-field shape");
  if (Object.keys(expectations).sort().join() !== ["version", "design"].sort().join())
    errors.push("Independent expectation fixture shape is invalid");
  exact(expectations, { version: D.version, design: D }, "Independent policy fixture", errors);
  exact(manifest.version, D.version, "Manifest version", errors);
  exact(manifest.design, D, "Manifest security design", errors);
  exact(manifest.relations, IDENTITY_RELATIONS, "Identity persistence constraints", errors);
  exact(manifest.operationBindings, OPERATION_AUTHORITY, "Exact operation bindings", errors);
  exact(
    manifest.implementationBoundary,
    "Phase 12 contracts and deterministic models only; Phase 13 requires real HTTP, crypto, delivery and concurrent PostgreSQL verification.",
    "Runtime boundary",
    errors,
  );
  errors.push(...validateOperationAuthority(spec, registry).errors);
  return { valid: errors.length === 0, errors };
}
export function verifyPasswordProfile(profile) {
  return (
    object(profile) &&
    ["memoryKiB", "timeCost", "parallelism"].every((k) => Number.isSafeInteger(profile[k])) &&
    profile.memoryKiB >= 65536 &&
    profile.timeCost >= 4 &&
    profile.parallelism >= 1
  );
}
export function validNewPassword(value, realm) {
  const p = D.passwords[realm];
  return (
    p &&
    typeof value === "string" &&
    Array.from(value).length >= p.min &&
    Array.from(value).length <= p.max
  );
}
export function isSessionValid(session, principal, now, realm) {
  const t = seconds(now);
  if (
    !object(session) ||
    !object(principal) ||
    !Number.isFinite(t) ||
    !["passenger", "staff"].includes(realm)
  )
    return false;
  if (
    session.realm !== realm ||
    session.authLevel !== "full" ||
    session.principalId !== principal.id ||
    !nonempty(principal.id)
  )
    return false;
  if (!nonempty(principal.passwordHash)) return false;
  if (
    principal.status !== "active" ||
    !Number.isFinite(seconds(principal.emailVerifiedAt)) ||
    seconds(principal.emailVerifiedAt) > t ||
    session.revokedAt !== null
  )
    return false;
  if (!integer(session.credentialEpoch) || session.credentialEpoch !== principal.credentialEpoch)
    return false;
  const issued = seconds(session.issuedAt),
    absolute = seconds(session.absoluteExpiresAt),
    idle = seconds(session.idleExpiresAt);
  if (
    ![issued, absolute, idle].every(Number.isFinite) ||
    issued > t ||
    absolute <= t ||
    idle <= t ||
    idle > absolute ||
    absolute - issued > D.sessions[realm].absolute ||
    idle - t > D.sessions[realm].idle
  )
    return false;
  if (realm === "staff") {
    const m = principal.mfa;
    if (
      !object(m) ||
      m.staffId !== principal.id ||
      !integer(m.version) ||
      m.version !== session.mfaVersion ||
      m.version !== principal.mfaVersion ||
      !Number.isFinite(seconds(m.confirmedAt)) ||
      m.revokedAt !== null
    )
      return false;
  }
  return true;
}
export function canManageSession(principal, session, realm) {
  return Boolean(
    nonempty(principal?.id) && session?.realm === realm && session.principalId === principal.id,
  );
}
function live(proof, ctx) {
  const t = seconds(ctx?.now),
    rule = D.proofs[ctx?.purpose];
  if (
    !object(proof) ||
    !rule ||
    ctx.realm !== rule.realm ||
    proof.state !== "issued" ||
    proof.revokedAt !== null ||
    proof.consumedAt !== null
  )
    return false;
  const issued = seconds(proof.issuedAt),
    expiry = seconds(proof.expiresAt);
  if (
    ![t, issued, expiry].every(Number.isFinite) ||
    issued > t ||
    expiry <= t ||
    expiry - issued > rule.ttl
  )
    return false;
  for (const field of ["purpose", "realm", "subjectId", "epoch"]) {
    if (ctx[field] === undefined || proof[field] !== ctx[field]) return false;
  }
  if (!nonempty(proof.subjectId) || !integer(proof.epoch)) return false;
  if (
    [
      "manage_booking",
      "claim_booking",
      "booking_claim_proof",
      "login_mfa",
      "enroll_mfa",
      "replace_mfa",
    ].includes(ctx.purpose) &&
    (!nonempty(ctx.sessionId) || proof.sessionId !== ctx.sessionId)
  )
    return false;
  if (
    rule.attempts &&
    (!Number.isSafeInteger(proof.attempts) || proof.attempts < 0 || proof.attempts >= rule.attempts)
  )
    return false;
  return true;
}
const consumed = (proof, now) => ({ ...proof, state: "consumed", consumedAt: now });
export function consumeIdentityToken(account, proof, command, ctx) {
  if (!object(account) || !object(command) || !object(ctx) || account.realm !== ctx.realm)
    return { ok: false };
  if (
    !live(proof, { ...ctx, subjectId: account.id, epoch: account.credentialEpoch }) ||
    proof.emailSnapshot !== account.email ||
    !nonempty(command.token) ||
    proof.tokenDigest !== digest(command.token)
  )
    return { ok: false };
  const isReset = ctx.purpose.endsWith("password_reset");
  if (isReset && !validNewPassword(command.newPassword, ctx.realm)) return { ok: false };
  if (ctx.purpose === "staff_invitation" && account.status !== "invited") return { ok: false };
  const next = structuredClone(account);
  if (isReset) {
    next.passwordHash = command.serverPasswordHash;
    next.credentialEpoch++;
    if (!nonempty(next.passwordHash)) return { ok: false };
  } else if (ctx.purpose === "passenger_email_verification") {
    next.emailVerifiedAt = ctx.now;
    if (next.status === "unverified") next.status = "active";
  } else if (ctx.purpose === "staff_invitation") {
    if (!validNewPassword(command.newPassword, "staff") || !nonempty(command.serverPasswordHash))
      return { ok: false };
    next.passwordHash = command.serverPasswordHash;
    next.emailVerifiedAt = ctx.now;
    next.status = "pending_enrollment";
  } else return { ok: false };
  return {
    ok: true,
    account: next,
    proof: consumed(proof, ctx.now),
    autoLogin: false,
    revokeEpoch: isReset ? next.credentialEpoch : null,
  };
}
export function revokeSessions(sessions, principalId, now) {
  return sessions.map((s) => (s.principalId === principalId ? { ...s, revokedAt: now } : s));
}
export function verifyTotpCode(credential, submittedCode, ctx) {
  const t = seconds(ctx?.now);
  if (
    !object(credential) ||
    !ctx ||
    !Number.isFinite(t) ||
    credential.revokedAt !== null ||
    credential.version !== ctx.version ||
    credential.staffId !== ctx.staffId ||
    !Number.isFinite(seconds(credential.confirmedAt))
  )
    return { valid: false };
  const step = Math.floor(t / 30),
    counter = ctx.matchedCounter;
  if (
    !Number.isSafeInteger(credential.lastConsumedCounter) ||
    credential.lastConsumedCounter < 0 ||
    !integer(credential.version) ||
    seconds(credential.confirmedAt) > t ||
    !/^[0-9]{6}$/.test(submittedCode) ||
    !Number.isSafeInteger(counter) ||
    Math.abs(counter - step) > 1 ||
    counter <= credential.lastConsumedCounter ||
    ctx.syntheticVerified !== true
  )
    return { valid: false };
  return { valid: true, credential: { ...credential, lastConsumedCounter: counter } };
}
export function verifyRecoveryCode(codes, submittedCode, ctx) {
  if (
    !Array.isArray(codes) ||
    !nonempty(submittedCode) ||
    !nonempty(ctx?.staffId) ||
    !integer(ctx.version) ||
    !Number.isFinite(seconds(ctx.now))
  )
    return { valid: false };
  const idx = codes.findIndex(
    (c) =>
      c.staffId === ctx.staffId &&
      c.version === ctx.version &&
      c.digest === digest(submittedCode) &&
      c.consumedAt === null &&
      c.revokedAt === null,
  );
  if (idx < 0) return { valid: false };
  const next = structuredClone(codes);
  next[idx].consumedAt = ctx.now;
  return { valid: true, codes: next };
}
export function evaluateStaffGuard(context, endpoint, permission = null) {
  if (!object(context)) return { allowed: false };

  // Actual operation is supplied by trusted context; an arbitrary endpoint label is insufficient.
  const key = context.method + " " + context.path,
    rule = OPERATION_AUTHORITY[key];
  if (!rule || context.operationId !== endpoint) return { allowed: false };
  if (context.pending) {
    const purpose =
      rule.guard === "pending_login"
        ? "login_mfa"
        : rule.guard === "pending_enrollment"
          ? "enroll_mfa"
          : null;
    const a = context.anonymousSession;
    if (
      !object(context.principal) ||
      context.principal.status !== (purpose === "enroll_mfa" ? "pending_enrollment" : "active") ||
      !Number.isFinite(seconds(context.principal.emailVerifiedAt)) ||
      !Number.isFinite(seconds(context.now)) ||
      !Number.isFinite(seconds(a?.absoluteExpiresAt)) ||
      !purpose ||
      a?.realm !== "staff" ||
      a.authLevel !== "anonymous" ||
      a.revokedAt !== null ||
      seconds(a.absoluteExpiresAt) <= seconds(context.now)
    )
      return { allowed: false };
    return {
      allowed: live(context.pending, {
        now: context.now,
        purpose,
        realm: "staff",
        subjectId: context.principal.id,
        epoch: context.principal.credentialEpoch,
        sessionId: a.id,
      }),
      authLevel: "pending",
    };
  }
  if (!["staff", "mixed_booking"].includes(rule.guard)) return { allowed: false };
  if (!isSessionValid(context.session, context.principal, context.now, "staff"))
    return { allowed: false };
  const required =
    rule.guard === "mixed_booking"
      ? context.method === "get"
        ? "commercial.view"
        : "commercial.edit"
      : rule.permission;
  if (permission && permission !== required) return { allowed: false };
  if (required && !D.permissions[context.principal.role]?.includes(required))
    return { allowed: false };
  const t = seconds(context.now),
    verified = seconds(context.session.mfaVerifiedAt);
  if (STEP_UP_ROUTES.has(key) && (!Number.isFinite(verified) || verified > t || t - verified > 300))
    return { allowed: false };
  return { allowed: true, authLevel: "full" };
}
export function completePendingMfa(principal, anonymousSession, pending, credential, ctx) {
  if (
    !object(principal) ||
    !object(anonymousSession) ||
    !object(credential) ||
    !object(ctx) ||
    !["enroll_mfa", "login_mfa"].includes(ctx.purpose) ||
    !Number.isFinite(seconds(anonymousSession.absoluteExpiresAt))
  )
    return { ok: false };
  if (
    !live(pending, {
      ...ctx,
      realm: "staff",
      subjectId: principal?.id,
      epoch: principal?.credentialEpoch,
      sessionId: anonymousSession?.id,
    }) ||
    anonymousSession.realm !== "staff" ||
    anonymousSession.authLevel !== "anonymous" ||
    anonymousSession.revokedAt !== null ||
    seconds(anonymousSession.absoluteExpiresAt) <= seconds(ctx.now)
  )
    return { ok: false };
  const enrollment = ctx.purpose === "enroll_mfa";
  if (
    principal.status !== (enrollment ? "pending_enrollment" : "active") ||
    !nonempty(principal.emailVerifiedAt) ||
    ctx.syntheticVerified !== true ||
    credential.staffId !== principal.id ||
    credential.revokedAt !== null
  )
    return { ok: false };
  if (!enrollment && !Number.isFinite(seconds(credential.confirmedAt))) return { ok: false };
  const c = { ...credential, confirmedAt: enrollment ? ctx.now : credential.confirmedAt };
  const totp = verifyTotpCode(c, ctx.code, { ...ctx, staffId: principal.id, version: c.version });
  if (!totp.valid) return { ok: false };
  const next = { ...principal, status: "active", mfaVersion: c.version, mfa: totp.credential };
  const t = seconds(ctx.now),
    id = ctx.serverSessionId;
  if (!nonempty(id) || id === anonymousSession.id) return { ok: false };
  const session = {
    id,
    principalId: next.id,
    realm: "staff",
    authLevel: "full",
    credentialEpoch: next.credentialEpoch,
    mfaVersion: c.version,
    mfaVerifiedAt: ctx.now,
    issuedAt: ctx.now,
    absoluteExpiresAt: t + 28800,
    idleExpiresAt: t + 3600,
    revokedAt: null,
  };
  return {
    ok: true,
    principal: next,
    pending: consumed(pending, ctx.now),
    credential: totp.credential,
    session,
    oldSession: { ...anonymousSession, revokedAt: ctx.now },
    csrfRotated: true,
  };
}
export function evaluateProtocolMiddleware(request, ctx) {
  if (
    !object(request) ||
    !object(ctx) ||
    !nonempty(ctx.environment) ||
    !Array.isArray(ctx.allowedOrigins)
  )
    return { allowed: false };
  const protocol = operationProtocol(ctx.method, ctx.path),
    unsafe = !["get", "head", "options"].includes(ctx.method);
  if (!protocol || request.method?.toLowerCase() !== ctx.method) return { allowed: false };
  const branch = protocol.branches.find((b) => b.realm === ctx.verifiedRealm);
  if (!branch || ctx.authorityVerified !== true) return { allowed: false };
  if (ctx.invalidAuthenticatedCookie === true || ctx.conflictingPrincipals === true)
    return { allowed: false };
  if (
    ctx.environment === "production" &&
    !isDeepStrictEqual(ctx.allowedOrigins, D.origin.production)
  )
    return { allowed: false };
  if (branch.origin === "configured_frontend" && !ctx.allowedOrigins.includes(request.origin))
    return { allowed: false, status: 403 };
  if (unsafe && branch.csrf !== "not_applicable") {
    const h = request.headers?.["X-CSRF-TOKEN"] ?? request.headers?.["x-csrf-token"];
    if (
      !nonempty(ctx.sessionCsrfToken) ||
      !nonempty(h) ||
      h !== ctx.sessionCsrfToken ||
      ctx.csrfRealm !== branch.csrf
    )
      return { allowed: false, status: 419 };
  }
  return { allowed: true };
}
export function simulateGuestChallengeVerification(challenge, submission, ctx) {
  if (
    !object(ctx) ||
    !object(submission) ||
    !nonempty(ctx.syntheticPepper) ||
    !nonempty(challenge?.bookingId) ||
    !["manage_booking", "claim_booking"].includes(ctx.purpose) ||
    challenge.dispatchStatus !== "accepted"
  )
    return { valid: false };
  if (
    !live(challenge, { ...ctx, realm: "passenger", subjectId: ctx.bookingId }) ||
    challenge.bookingId !== ctx.bookingId ||
    challenge.bookingRef !== ctx.bookingRef
  )
    return { valid: false };
  if (
    ctx.purpose === "claim_booking" &&
    (!nonempty(ctx.passengerId) || challenge.passengerId !== ctx.passengerId)
  )
    return { valid: false };
  const expected = crypto
    .createHmac("sha256", ctx.syntheticPepper)
    .update(
      [challenge.id, challenge.bookingId, challenge.purpose, challenge.epoch, submission.code].join(
        "|",
      ),
    )
    .digest("hex");
  if (!/^[0-9]{6}$/.test(submission?.code ?? "") || expected !== challenge.codeDigest) {
    const next = { ...challenge, attempts: challenge.attempts + 1 };
    if (next.attempts >= 5) next.state = "exhausted";
    return { valid: false, challenge: next };
  }
  return {
    valid: true,
    challenge: consumed(challenge, ctx.now),
    grantPurpose: ctx.purpose === "claim_booking" ? "booking_claim_proof" : "booking_guest_grant",
  };
}
export function revokeBookingProofs(booking, proofs, now) {
  return {
    booking: { ...booking, securityEpoch: booking.securityEpoch + 1 },
    proofs: proofs.map((p) =>
      p.bookingId === booking.id
        ? { ...p, revokedAt: now, state: p.state === "issued" ? "revoked" : p.state }
        : p,
    ),
  };
}
export function simulateBookingClaim(booking, passenger, proof, ctx, otherProofs = []) {
  if (!object(booking) || !object(passenger) || !object(ctx)) return { success: false };
  if (
    !isSessionValid(ctx?.session, passenger, ctx?.now, "passenger") ||
    !live(proof, {
      ...ctx,
      purpose: "booking_claim_proof",
      realm: "passenger",
      subjectId: passenger.id,
      epoch: booking.securityEpoch,
      sessionId: ctx.session.id,
    }) ||
    proof.bookingId !== booking.id ||
    !nonempty(ctx.token) ||
    proof.tokenDigest !== digest(ctx.token)
  )
    return { success: false };
  if (booking.ownerId !== null && booking.ownerId !== passenger.id)
    return { success: false, status: 409 };
  const changed = booking.ownerId !== passenger.id;
  const result = changed
    ? revokeBookingProofs({ ...booking, ownerId: passenger.id }, otherProofs, ctx.now)
    : { booking, proofs: otherProofs };
  return { success: true, changed, ...result, proof: consumed(proof, ctx.now) };
}
export function evaluateBookingGrant(grant, booking, ctx) {
  const rule = D.proofs[ctx?.purpose];
  if (
    !object(grant) ||
    !object(booking) ||
    !object(ctx) ||
    !nonempty(ctx.token) ||
    grant.tokenDigest !== digest(ctx.token) ||
    grant.scopeVersion !== 1 ||
    !integer(booking.securityEpoch) ||
    !nonempty(booking.ref)
  )
    return false;
  const permitted =
    ctx.purpose === "booking_receipt_grant"
      ? ["getBookingReceipt"]
      : [
          "getBookingByRef",
          "patchBookingContact",
          "putBookingSeats",
          "putBookingExtras",
          "postCancelBooking",
          "postCompleteCheckIn",
          "postUndoCheckIn",
          "getBoardingPasses",
        ];
  if (
    !Array.isArray(grant.allowedActions) ||
    !grant.allowedActions.length ||
    !grant.allowedActions.every((a) => permitted.includes(a))
  )
    return false;
  if (
    !rule ||
    rule.singleUse !== false ||
    grant?.purpose !== ctx.purpose ||
    grant.bookingId !== booking?.id ||
    ctx.ref !== booking.ref ||
    grant.epoch !== booking.securityEpoch ||
    grant.revokedAt !== null
  )
    return false;
  const t = seconds(ctx.now),
    issue = seconds(grant.issuedAt),
    expiry = seconds(grant.expiresAt);
  if (
    ![t, issue, expiry].every(Number.isFinite) ||
    issue > t ||
    expiry <= t ||
    expiry - issue > rule.ttl ||
    !grant.allowedActions?.includes(ctx.operationId)
  )
    return false;
  if (ctx.purpose === "booking_receipt_grant" && ctx.operationId !== "getBookingReceipt")
    return false;
  return true;
}
export function evaluateLastAdminGuard(directory, proposal, lockOrder) {
  if (
    !Array.isArray(directory) ||
    !object(proposal) ||
    !object(proposal.patch) ||
    !directory.some((p) => p.id === proposal.id) ||
    !isDeepStrictEqual(lockOrder, D.sentinel.lockOrder)
  )
    return { allowed: false };
  const next = directory.map((p) => (p.id === proposal.id ? { ...p, ...proposal.patch } : p));
  const eligible = (p) =>
    p.role === "admin" &&
    p.status === "active" &&
    nonempty(p.emailVerifiedAt) &&
    nonempty(p.passwordHash) &&
    p.mfa?.staffId === p.id &&
    integer(p.mfa?.version) &&
    p.mfaVersion === p.mfa.version &&
    nonempty(p.mfa.confirmedAt) &&
    p.mfa.revokedAt === null;
  if (next.filter(eligible).length < 1) return { allowed: false, status: 409 };
  return { allowed: true, directory: next };
}
export function consumeRateBudget(buckets, identity, kind, now) {
  const t = seconds(now),
    rules = D.rates[kind];
  if (!Number.isFinite(t) || !rules || !object(identity) || !object(buckets))
    return { allowed: false };
  const next = structuredClone(buckets);
  for (let index = 0; index < rules.length; index++) {
    const r = rules[index];
    if (!r.key.every((k) => nonempty(identity[k]))) return { allowed: false };
    const start = Math.floor(t / r.seconds) * r.seconds,
      key = [kind, index, ...r.key.map((k) => digest(identity[k])), start].join(":");
    const b = next[key] ?? { count: 0, start, end: start + r.seconds };
    if (b.count >= r.limit) return { allowed: false, buckets, retryAfter: Math.ceil(b.end - t) };
    next[key] = { ...b, count: b.count + 1 };
  }
  return { allowed: true, buckets: next };
}

export function confirmMfaReplacement(principal, session, proof, candidate, ctx, sessions = []) {
  if (
    !isSessionValid(session, principal, ctx?.now, "staff") ||
    !object(candidate) ||
    !object(ctx) ||
    ctx.purpose !== "replace_mfa"
  )
    return { ok: false };
  const t = seconds(ctx.now),
    step = seconds(session.mfaVerifiedAt);
  if (
    !Number.isFinite(step) ||
    step > t ||
    t - step > 300 ||
    proof?.priorVersion !== principal.mfaVersion ||
    candidate.version !== proof?.candidateVersion ||
    candidate.version <= principal.mfaVersion ||
    candidate.staffId !== principal.id ||
    candidate.confirmedAt !== null ||
    candidate.revokedAt !== null
  )
    return { ok: false };
  if (
    !live(proof, {
      ...ctx,
      realm: "staff",
      subjectId: principal.id,
      epoch: principal.credentialEpoch,
      sessionId: session.id,
    })
  )
    return { ok: false };
  const c = verifyTotpCode({ ...candidate, confirmedAt: ctx.now }, ctx.code, {
    ...ctx,
    staffId: principal.id,
    version: candidate.version,
  });
  if (!c.valid) return { ok: false };
  const next = {
    ...principal,
    credentialEpoch: principal.credentialEpoch + 1,
    mfaVersion: candidate.version,
    mfa: c.credential,
  };
  return {
    ok: true,
    principal: next,
    proof: consumed(proof, ctx.now),
    priorCredential: { ...principal.mfa, revokedAt: ctx.now },
    sessions: revokeSessions(sessions, principal.id, ctx.now),
    requireFreshLogin: true,
  };
}
export function dispatchProof(outbox, proof, ctx) {
  if (
    !object(outbox) ||
    !object(proof) ||
    !object(ctx) ||
    outbox.proofId !== proof.id ||
    proof.state !== "issued" ||
    seconds(proof.expiresAt) <= seconds(ctx.now) ||
    !Number.isFinite(seconds(ctx.now))
  )
    return { ok: false };
  if (outbox.state === "accepted") return { ok: true, outbox, duplicate: true, delivered: false };
  if (!["queued", "failed"].includes(outbox.state) || !nonempty(outbox.encryptedPayload))
    return { ok: false };
  if (ctx.providerAccepted !== true)
    return { ok: false, outbox: { ...outbox, state: "failed", attempts: outbox.attempts + 1 } };
  if (!nonempty(ctx.providerMessageId)) return { ok: false };
  return {
    ok: true,
    outbox: {
      ...outbox,
      state: "accepted",
      providerMessageId: ctx.providerMessageId,
      acceptedAt: ctx.now,
      encryptedPayload: null,
      scrubbedAt: ctx.now,
    },
    delivered: false,
  };
}
