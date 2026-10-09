import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import * as I from "../../scripts/lib/backend-identity-contracts.mjs";
import { IDENTITY_POLICY as D } from "../../scripts/lib/backend-identity-policy.mjs";

const read = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const spec = read("docs/backend/openapi.v1.json");
const policy = read("docs/backend/operation-policies.v1.json");
const manifest = read("docs/backend/identity-lifecycle.v1.json");
const fixture = read("tests/fixtures/backend-contracts/identity-expectations.json");
const now = 1800000000;
const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const passenger = {
  id: "p1",
  realm: "passenger",
  status: "active",
  email: "p@example.test",
  emailVerifiedAt: "2026-01-01T00:00:00Z",
  credentialEpoch: 1,
  passwordHash: "server-hash",
};
const mfa = {
  staffId: "s1",
  version: 1,
  confirmedAt: "2026-01-01T00:00:00Z",
  revokedAt: null,
  lastConsumedCounter: 0,
};
const staff = { ...passenger, id: "s1", realm: "staff", role: "admin", mfaVersion: 1, mfa };
const session = (realm = "passenger") => ({
  id: "session1",
  realm,
  principalId: realm === "staff" ? "s1" : "p1",
  authLevel: "full",
  credentialEpoch: 1,
  mfaVersion: 1,
  mfaVerifiedAt: now,
  issuedAt: now - 10,
  absoluteExpiresAt: now + 1000,
  idleExpiresAt: now + 1000,
  revokedAt: null,
});
const proof = (purpose = "passenger_password_reset", realm = "passenger") => ({
  id: "proof1",
  purpose,
  realm,
  subjectId: realm === "staff" ? "s1" : "p1",
  epoch: 1,
  sessionId: "session1",
  state: "issued",
  attempts: 0,
  revokedAt: null,
  consumedAt: null,
  issuedAt: now - 1,
  expiresAt: now + 100,
  emailSnapshot: "p@example.test",
  tokenDigest: hash("secret-token"),
});
describe("Closed identity policy and operation authority", () => {
  it("accepts the approved complete graph", () =>
    assert.deepEqual(I.validateIdentityLifecycleManifest(manifest, fixture, spec, policy), {
      valid: true,
      errors: [],
    }));
  for (const field of [
    "cookies",
    "transitions",
    "proofs",
    "rates",
    "sentinel",
    "authority",
    "roles",
    "sessions",
    "mfa",
  ])
    it("rejects coordinated " + field + " tampering", () => {
      const m = structuredClone(manifest),
        f = structuredClone(fixture);
      m.design[field] = {};
      f.design[field] = {};
      assert.equal(I.validateIdentityLifecycleManifest(m, f, spec, policy).valid, false);
    });
  it("rejects arbitrary nested fields, version and persistence placeholders", () => {
    for (const modify of [
      (m: typeof manifest) => (m.design.mfa.extra = true),
      (m: typeof manifest) => (m.version = "2"),
      (m: typeof manifest) => (m.relations[0].name = "placeholder"),
    ]) {
      const m = structuredClone(manifest);
      modify(m);
      assert.equal(I.validateIdentityLifecycleManifest(m, fixture, spec, policy).valid, false);
    }
  });
  it("pins protocol for every route, including cookie/public and shared/header branches", () => {
    const s = structuredClone(spec);
    s.paths["/bookings/{ref}/contact"].patch["x-protocol"].branches[0].csrf = "not_applicable";
    assert.equal(I.validateOperationAuthority(s, policy).valid, false);
  });
  it("pins sensitive step-up even with coordinated policy edits", () => {
    const s = structuredClone(spec),
      p = structuredClone(policy);
    s.paths["/staff/users"].post["x-requires-recent-step-up"] = false;
    p.operations.find(
      (x: { operationId: string }) => x.operationId === s.paths["/staff/users"].post.operationId,
    ).requiresRecentStepUp = false;
    assert.equal(I.validateOperationAuthority(s, p).valid, false);
  });
  it("rejects password floor and missing schemes", () => {
    const s = structuredClone(spec);
    s.components.schemas.RegisterRequest.properties.password.minLength = 1;
    assert.equal(I.validateOperationAuthority(s, policy).valid, false);
    const q = structuredClone(spec);
    delete q.components.securitySchemes.StaffPreAuthCookieAuth;
    assert.equal(I.validateOperationAuthority(q, policy).valid, false);
  });
});
describe("Maintained identity state and replay protection", () => {
  it("requires full active verified current-epoch session context", () => {
    assert.equal(I.isSessionValid(session(), passenger, now, "passenger"), true);
    assert.equal(I.isSessionValid({}, {}, now, "passenger"), false);
    for (const p of [
      { ...passenger, status: "suspended" },
      { ...passenger, emailVerifiedAt: null },
      { ...passenger, credentialEpoch: 2 },
    ])
      assert.equal(I.isSessionValid(session(), p, now, "passenger"), false);
    assert.equal(
      I.isSessionValid({ ...session(), idleExpiresAt: now }, passenger, now, "passenger"),
      false,
    );
    assert.equal(I.isSessionValid(session("staff"), staff, now, "staff"), true);
    assert.equal(I.isSessionValid(session("staff"), { ...staff, mfa: null }, now, "staff"), false);
  });
  it("consumes actual reset proof, rejects reuse and revokes old epoch without unsuspension", () => {
    const p = { ...passenger, status: "suspended" },
      cmd = {
        token: "secret-token",
        newPassword: "a sufficiently long password",
        serverPasswordHash: "newhash",
      };
    const ctx = { now, purpose: "passenger_password_reset", realm: "passenger" };
    const r = I.consumeIdentityToken(p, proof(), cmd, ctx);
    assert.equal(r.ok, true);
    assert.equal(r.account.status, "suspended");
    assert.equal(r.autoLogin, false);
    assert.equal(I.consumeIdentityToken(r.account, r.proof, cmd, ctx).ok, false);
    assert.equal(I.isSessionValid(session(), r.account, now, "passenger"), false);
  });
  it("rejects wrong token, subject, email snapshot, realm and missing persisted context", () => {
    for (const p of [
      {},
      { ...proof(), subjectId: "foreign" },
      { ...proof(), emailSnapshot: "foreign@example.test" },
      { ...proof(), realm: "staff" },
    ])
      assert.equal(
        I.consumeIdentityToken(
          passenger,
          p,
          {
            token: "secret-token",
            newPassword: "long enough password",
            serverPasswordHash: "hash",
          },
          { now, purpose: "passenger_password_reset", realm: "passenger" },
        ).ok,
        false,
      );
  });
  it("verifies email once and does not reactivate suspended accounts", () => {
    const p = { ...passenger, status: "unverified", emailVerifiedAt: null },
      ctx = { now, purpose: "passenger_email_verification", realm: "passenger" };
    const r = I.consumeIdentityToken(p, proof(ctx.purpose), { token: "secret-token" }, ctx);
    assert.equal(r.account.status, "active");
    assert.equal(
      I.consumeIdentityToken(r.account, r.proof, { token: "secret-token" }, ctx).ok,
      false,
    );
    assert.equal(
      I.consumeIdentityToken(
        { ...p, status: "suspended" },
        proof(ctx.purpose),
        { token: "secret-token" },
        ctx,
      ).account.status,
      "suspended",
    );
  });
  it("accepts invitation only for its persisted staff target and enters enrollment without full login", () => {
    const p = { ...staff, status: "invited" },
      ctx = { now, purpose: "staff_invitation", realm: "staff" };
    const r = I.consumeIdentityToken(
      p,
      proof(ctx.purpose, "staff"),
      { token: "secret-token", newPassword: "staff password long", serverPasswordHash: "hash" },
      ctx,
    );
    assert.equal(r.ok, true);
    assert.equal(r.account.status, "pending_enrollment");
    assert.equal(r.autoLogin, false);
    assert.equal(
      I.consumeIdentityToken(staff, proof(ctx.purpose, "staff"), { token: "secret-token" }, ctx).ok,
      false,
    );
  });
  it("enforces exact Argon floors and Unicode password bounds", () => {
    assert.equal(I.verifyPasswordProfile({ memoryKiB: 65536, timeCost: 4, parallelism: 1 }), true);
    assert.equal(
      I.verifyPasswordProfile({ memoryKiB: Infinity, timeCost: 4, parallelism: 1 }),
      false,
    );
    assert.equal(I.validNewPassword("a".repeat(14), "passenger"), false);
    assert.equal(I.validNewPassword("😀".repeat(15), "passenger"), true);
  });
  it("consumes TOTP counter and recovery code state, rejecting replay or foreign credential versions", () => {
    const ctx = {
      now,
      staffId: "s1",
      version: 1,
      matchedCounter: Math.floor(now / 30),
      syntheticVerified: true,
    };
    const r = I.verifyTotpCode(mfa, "123456", ctx);
    assert.equal(r.valid, true);
    assert.equal(I.verifyTotpCode(r.credential, "123456", ctx).valid, false);
    assert.equal(I.verifyTotpCode(mfa, "123456", { ...ctx, version: 2 }).valid, false);
    const codes = [
      {
        staffId: "s1",
        version: 1,
        digest: hash("recovery-secret"),
        consumedAt: null,
        revokedAt: null,
      },
    ];
    const c = I.verifyRecoveryCode(codes, "recovery-secret", ctx);
    assert.equal(c.valid, true);
    assert.equal(I.verifyRecoveryCode(c.codes, "recovery-secret", ctx).valid, false);
  });
  it("isolates pending routes by purpose and rotates session after confirmed MFA", () => {
    const anonymous = {
      id: "anon1",
      realm: "staff",
      authLevel: "anonymous",
      absoluteExpiresAt: now + 100,
      revokedAt: null,
    };
    const pending = { ...proof("login_mfa", "staff"), sessionId: "anon1" };
    const ctx = {
      now,
      method: "post",
      path: "/staff/mfa/verify",
      operationId: "postStaffMfaVerify",
      principal: staff,
      anonymousSession: anonymous,
      pending,
    };
    assert.equal(I.evaluateStaffGuard(ctx, ctx.operationId).allowed, true);
    assert.equal(
      I.evaluateStaffGuard({ ...ctx, path: "/staff/me" }, ctx.operationId).allowed,
      false,
    );
    assert.equal(
      I.evaluateStaffGuard(
        { ...ctx, pending: { ...pending, purpose: "enroll_mfa" } },
        ctx.operationId,
      ).allowed,
      false,
    );
    const r = I.completePendingMfa(staff, anonymous, pending, mfa, {
      now,
      purpose: "login_mfa",
      code: "123456",
      matchedCounter: Math.floor(now / 30),
      syntheticVerified: true,
      serverSessionId: "newsession",
    });
    assert.equal(r.ok, true);
    assert.equal(r.csrfRotated, true);
    assert.equal(r.oldSession.revokedAt, now);
    assert.equal(
      I.completePendingMfa(staff, anonymous, r.pending, mfa, { now, purpose: "login_mfa" }).ok,
      false,
    );
  });
  it("requires fresh step-up and preserves old MFA until replacement confirmation then revokes all sessions", () => {
    const p = { ...proof("replace_mfa", "staff"), priorVersion: 1, candidateVersion: 2 };
    const candidate = { ...mfa, version: 2, confirmedAt: null },
      ctx = {
        now,
        purpose: "replace_mfa",
        code: "123456",
        matchedCounter: Math.floor(now / 30),
        syntheticVerified: true,
      };
    assert.equal(
      I.confirmMfaReplacement(
        staff,
        { ...session("staff"), mfaVerifiedAt: now - 301 },
        p,
        candidate,
        ctx,
      ).ok,
      false,
    );
    const r = I.confirmMfaReplacement(staff, session("staff"), p, candidate, ctx, [
      session("staff"),
    ]);
    assert.equal(r.ok, true);
    assert.equal(r.principal.mfaVersion, 2);
    assert.equal(r.priorCredential.revokedAt, now);
    assert.equal(r.sessions[0].revokedAt, now);
    assert.equal(
      I.confirmMfaReplacement(r.principal, session("staff"), r.proof, candidate, ctx).ok,
      false,
    );
  });
  it("evaluates last administrator after each serialized proposal", () => {
    const a = staff,
      b = { ...staff, id: "s2", mfa: { ...mfa, staffId: "s2" } };
    const r = I.evaluateLastAdminGuard(
      [a, b],
      { id: "s1", patch: { status: "suspended" } },
      D.sentinel.lockOrder,
    );
    assert.equal(r.allowed, true);
    assert.equal(
      I.evaluateLastAdminGuard(
        r.directory,
        { id: "s2", patch: { role: "viewer" } },
        D.sentinel.lockOrder,
      ).allowed,
      false,
    );
    assert.equal(
      I.evaluateLastAdminGuard([a], { id: "s1", patch: { mfa: null } }, D.sentinel.lockOrder)
        .allowed,
      false,
    );
  });
  it("charges persisted rate buckets and reports honest provider acceptance with encrypted payload scrub", () => {
    let buckets = {};
    for (let i = 0; i < 5; i++) {
      const r = I.consumeRateBudget(buckets, { subject_digest: "p", ip: "1" }, "login", now);
      assert.equal(r.allowed, true);
      buckets = r.buckets;
    }
    assert.equal(
      I.consumeRateBudget(buckets, { subject_digest: "p", ip: "1" }, "login", now).allowed,
      false,
    );
    const o = { proofId: "proof1", state: "queued", attempts: 0, encryptedPayload: "ciphertext" },
      p = proof();
    const r = I.dispatchProof(o, p, { now, providerAccepted: true, providerMessageId: "message1" });
    assert.equal(r.ok, true);
    assert.equal(r.delivered, false);
    assert.equal(r.outbox.encryptedPayload, null);
    assert.equal(I.dispatchProof(r.outbox, p, { now }).duplicate, true);
  });
});
describe("Browser protocol and booking proof boundaries", () => {
  const ctx = {
    now,
    environment: "production",
    allowedOrigins: D.origin.production,
    method: "put",
    path: "/auth/passenger/profile",
    verifiedRealm: "passenger",
    authorityVerified: true,
    csrfRealm: "passenger",
    sessionCsrfToken: "real-csrf",
  };
  const req = {
    method: "PUT",
    origin: D.origin.production[0],
    headers: { "X-CSRF-TOKEN": "real-csrf" },
  };
  it("requires actual realm CSRF and explicit production origins even for Sec-Fetch-Site same-origin", () => {
    assert.equal(I.evaluateProtocolMiddleware(req, ctx).allowed, true);
    assert.equal(I.evaluateProtocolMiddleware({ ...req, headers: {} }, ctx).allowed, false);
    assert.equal(
      I.evaluateProtocolMiddleware(req, { ...ctx, sessionCsrfToken: undefined }).allowed,
      false,
    );
    assert.equal(
      I.evaluateProtocolMiddleware({ ...req, origin: "http://localhost:3000" }, ctx).allowed,
      false,
    );
    assert.equal(
      I.evaluateProtocolMiddleware(req, { ...ctx, invalidAuthenticatedCookie: true }).allowed,
      false,
    );
  });
  it("binds booking OTP to live booking, epoch, purpose, session and persisted attempts; decoys never grant", () => {
    const c = {
      ...proof("manage_booking"),
      subjectId: "b1",
      bookingId: "b1",
      bookingRef: "GZA-TEST",
      dispatchStatus: "accepted",
    };
    const g = {
      now,
      purpose: "manage_booking",
      realm: "passenger",
      bookingId: "b1",
      bookingRef: "GZA-TEST",
      epoch: 1,
      sessionId: "session1",
      syntheticPepper: "test-only-pepper",
    };
    c["codeDigest"] = crypto
      .createHmac("sha256", g.syntheticPepper)
      .update([c.id, c.bookingId, c.purpose, c.epoch, "123456"].join("|"))
      .digest("hex");
    const r = I.simulateGuestChallengeVerification(c, { code: "123456" }, g);
    assert.equal(r.valid, true);
    assert.equal(
      I.simulateGuestChallengeVerification(r.challenge, { code: "123456" }, g).valid,
      false,
    );
    assert.equal(
      I.simulateGuestChallengeVerification({ ...c, bookingId: null }, { code: "123456" }, g).valid,
      false,
    );
    assert.equal(
      I.simulateGuestChallengeVerification(c, { code: "123456" }, { ...g, epoch: 2 }).valid,
      false,
    );
    let current = c;
    for (let i = 0; i < 5; i++) {
      const n = I.simulateGuestChallengeVerification(current, { code: "000000" }, g);
      assert.equal(n.valid, false);
      current = n.challenge;
    }
    assert.equal(current.state, "exhausted");
    assert.equal(I.simulateGuestChallengeVerification(current, { code: "123456" }, g).valid, false);
  });
  it("consumes ownership proof, revokes other grants and rejects foreign ownership", () => {
    const b = { id: "b1", ref: "GZA-TEST", ownerId: null, securityEpoch: 1 },
      p = { ...proof("booking_claim_proof"), bookingId: "b1" };
    const ctx = { now, session: session(), token: "secret-token" };
    const r = I.simulateBookingClaim(b, passenger, p, ctx, [
      { bookingId: "b1", state: "issued", revokedAt: null },
    ]);
    assert.equal(r.success, true);
    assert.equal(r.booking.securityEpoch, 2);
    assert.equal(r.proofs[0].revokedAt, now);
    assert.equal(I.simulateBookingClaim(r.booking, passenger, r.proof, ctx).success, false);
    assert.equal(
      I.simulateBookingClaim({ ...b, ownerId: "foreign" }, passenger, p, ctx).success,
      false,
    );
  });
  it("restricts receipt and guest grants to exact operation scopes and current booking epoch", () => {
    const b = { id: "b1", ref: "GZA-TEST", securityEpoch: 1 },
      g = {
        purpose: "booking_receipt_grant",
        bookingId: "b1",
        epoch: 1,
        scopeVersion: 1,
        tokenDigest: hash("grant-secret"),
        allowedActions: ["getBookingReceipt"],
        issuedAt: now,
        expiresAt: now + 100,
        revokedAt: null,
      };
    const c = {
      now,
      token: "grant-secret",
      purpose: g.purpose,
      ref: b.ref,
      operationId: "getBookingReceipt",
    };
    assert.equal(I.evaluateBookingGrant(g, b, c), true);
    assert.equal(I.evaluateBookingGrant(g, b, { ...c, operationId: "getBookingByRef" }), false);
    assert.equal(I.evaluateBookingGrant(g, { ...b, securityEpoch: 2 }, c), false);
    assert.equal(
      I.evaluateBookingGrant({ ...g, allowedActions: ["getPassengerProfile"] }, b, {
        ...c,
        operationId: "getPassengerProfile",
      }),
      false,
    );
  });
});
