import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { identityUiClientConfig, isIdentityUiRequested } from "../../src/lib/api/identity-ui-config.ts";
import { identityCopy } from "../../src/lib/api/identity-ui-copy.ts";
import { createIdentityApiClient, IdentityApiError } from "../../src/lib/api/identity-client.ts";
import { HttpPassengerRepository } from "../../src/lib/passenger/http-repository.ts";
import type { IdentityApiClient } from "../../src/lib/api/identity-client.ts";
import { generateIdentityApiContract } from "../../scripts/generate-identity-api-types.mjs";
import spec from "../../docs/backend/openapi.v1.json" with { type: "json" };

const config = { VITE_IDENTITY_UI_MODE: "backend", VITE_IDENTITY_NONPRODUCTION_OPT_IN: "true",
  VITE_IDENTITY_API_BASE_URL: "https://127.0.0.1:18090/api/v1", MODE: "development", DEV: true, PROD: false };
const account = { email: "synthetic@example.test", firstName: "One", lastName: "", phone: "", seatPreference: "none" as const, mealPreference: "retired", newsletter: false };
const meta = { requestId: "9e458991-6eca-4cf3-9b9d-8f6015d48d0b", timestamp: "2026-10-11T12:00:00Z" };

describe("Explicit server identity boundary", () => {
  it("keeps default/mock disabled and invalid explicit modes blocked", () => {
    assert.equal(isIdentityUiRequested({}), false);
    assert.deepEqual(identityUiClientConfig({ VITE_IDENTITY_UI_MODE: "mock" }), { enabled: false });
    assert.equal(isIdentityUiRequested({ VITE_IDENTITY_UI_MODE: "misspelled" }), true);
    assert.throws(() => identityUiClientConfig({ ...config, VITE_IDENTITY_UI_MODE: "misspelled" }), IdentityApiError);
    assert.equal(identityUiClientConfig(config).enabled, true);
  });
  it("rejects production, missing opt-in, unknown environment, HTTP and production hosts", () => {
    for (const delta of [{ PROD: true }, { MODE: "production" }, { VITE_IDENTITY_NONPRODUCTION_OPT_IN: "false" },
      { MODE: "unknown", DEV: false }, { VITE_IDENTITY_API_BASE_URL: "http://127.0.0.1:18090" },
      { VITE_IDENTITY_API_BASE_URL: "https://api.gazaairport.com/api/v1" }]) {
      assert.throws(() => identityUiClientConfig({ ...config, ...delta }), IdentityApiError);
    }
  });
  it("selects EN/AR separately without blending labels", () => {
    assert.equal(identityCopy("en", "Sign in", "تسجيل الدخول"), "Sign in");
    assert.equal(identityCopy("ar", "Sign in", "تسجيل الدخول"), "تسجيل الدخول");
  });
  it("never uses local sign-in or local ownership commands in the HTTP adapter", async () => {
    let calls = 0;
    const repo = new HttpPassengerRepository(() => { calls++; throw new Error("Must not dispatch"); });
    await assert.rejects(repo.signIn(), IdentityApiError);
    await assert.rejects(repo.withAccountIdentity(), IdentityApiError);
    await assert.rejects(repo.updateAccount({}, { expectedEmail: account.email }), IdentityApiError);
    assert.equal(calls, 0);
  });
  it("propagates service/configuration failure and treats only 401 as signed out", async () => {
    const unauthorized = new HttpPassengerRepository(() => ({ getPassengerProfile: async () => { throw new IdentityApiError({ kind: "http_error", status: 401, message: "Denied" }); } }) as Pick<IdentityApiClient, "getPassengerProfile" | "postPassengerLogout" | "getSavedTravelers" | "putPassengerProfile" | "postSavedTraveler" | "patchSavedTraveler" | "deleteSavedTraveler">);
    assert.equal(await unauthorized.getAccount(), null);
    const unavailable = new HttpPassengerRepository(() => { throw new IdentityApiError({ kind: "configuration", message: "Disabled" }); });
    await assert.rejects(unavailable.getAccount(), IdentityApiError);
  });
  it("preserves server no-op receipts, opaque traveler IDs and deletion truth", async () => {
    const traveler = { id: "trv-opaque-stable", firstName: "Only", lastName: "", dob: "", nationality: "Palestinian", document: "synthetic" };
    let notifications = 0;
    const fake = { getPassengerProfile: async () => ({ success: true as const, data: account, meta }),
      putPassengerProfile: async () => ({ success: true as const, data: { changed: false, account }, meta }),
      getSavedTravelers: async () => ({ success: true as const, data: [traveler], meta }),
      deleteSavedTraveler: async (id: string) => { assert.equal(id, traveler.id); return { success: true as const, data: { deleted: false }, meta }; } };
    const repo = new HttpPassengerRepository(() => fake as unknown as ReturnType<ConstructorParameters<typeof HttpPassengerRepository>[0]>);
    repo.subscribe(() => { notifications++; });
    assert.deepEqual(await repo.getAccount(), account);
    assert.deepEqual(await repo.listTravelers(), [traveler]);
    assert.deepEqual(await repo.updateAccountWithReceipt({ phone: "" }), { account, changed: false });
    assert.equal(await repo.removeTraveler(traveler.id), false);
    assert.equal(notifications, 2);
  });
});

describe("Guest proof transport extension (synthetic fetch, not server authority evidence)", () => {
  it("pins all five routes to accepted schemas and rejects altered authorization", () => {
    const contract = JSON.parse(generateIdentityApiContract(spec));
    assert.equal(contract.operations.length, 46);
    const mutated = structuredClone(spec);
    mutated.paths["/account/bookings/claim"].post.security = [];
    assert.throws(() => generateIdentityApiContract(mutated), /Security mismatch/);
  });
  it("validates guest/claim receipts and shares the passenger CSRF transport", async () => {
    const captures: { url: string; init?: RequestInit }[] = [];
    const challengeId = "0097f0ce-1e23-4999-a92a-7e891926d0a2";
    const api = createIdentityApiClient({ ...identityUiClientConfig(config), fetch: async (url, init) => {
      captures.push({ url: String(url), init });
      const headers = new Headers(init?.headers); const requestId = headers.get("X-Request-Id")!;
      const currentMeta = { ...meta, requestId };
      if (String(url).endsWith("/auth/csrf")) return new Response(JSON.stringify({ csrfToken: "c".repeat(64) }), { headers: { "Content-Type": "application/json", "X-Request-Id": requestId } });
      assert.equal(headers.get("X-CSRF-TOKEN"), "c".repeat(64)); assert.equal(init?.credentials, "include"); assert.equal(init?.redirect, "error");
      const challenge = String(url).endsWith("/challenge");
      const data = challenge ? { challengeId, expiresAt: "2026-10-11T12:10:00Z", message: "Queued only if eligible" }
        : String(url).endsWith("/verify-challenge") ? { bookingToken: "b".repeat(43), pnr: "ABC123", expiresAt: "2026-10-11T12:15:00Z", allowedActions: ["getBookingByRef"] }
        : { claimProof: "p".repeat(43), expiresAt: "2026-10-11T12:05:00Z" };
      return new Response(JSON.stringify({ success: true, data, meta: currentMeta }), { status: challenge ? 202 : 200, headers: { "Content-Type": "application/json", "X-Request-Id": requestId } });
    } });
    await api.postCreateGuestChallenge("ABC123", { surname: "Synthetic" });
    await api.postVerifyGuestChallenge("ABC123", { challengeId, code: "123456" });
    await api.postCreateClaimChallenge({ ref: "ABC123", surname: "Synthetic" });
    await api.postVerifyClaimChallenge({ challengeId, code: "123456" });
    assert.equal(captures.length, 5); api.dispose();
  });
  it("blocks malformed refs, invalid payloads and disabled mode before any fetch", async () => {
    let calls = 0; const fetcher: typeof fetch = async () => { calls++; throw new Error("No network"); };
    const api = createIdentityApiClient({ ...identityUiClientConfig(config), fetch: fetcher });
    await assert.rejects(api.postCreateGuestChallenge("../escape", { surname: "Name" }), IdentityApiError);
    await assert.rejects(api.postCreateClaimChallenge({ ref: "ABC123", surname: "Name", price: 0 } as unknown as Parameters<IdentityApiClient["postCreateClaimChallenge"]>[0]), IdentityApiError);
    const disabled = createIdentityApiClient({ enabled: false, fetch: fetcher });
    await assert.rejects(disabled.postClaimBookingToAccount({ ref: "ABC123", claimProof: "p".repeat(43) }), IdentityApiError);
    assert.equal(calls, 0); api.dispose(); disabled.dispose();
  });
});
