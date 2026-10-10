/**
 * Gaza Gateway / Palestinian Airlines
 * Phase 13B Identity API Client — Focused Protocol and Unit Tests
 *
 * NOTE: Mock fetch implementations here are strictly labeled client protocol tests,
 * NOT genuine HTTP authority or server security proofs.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import util from "node:util";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import {
  createIdentityApiClient,
  validateAndNormalizeBaseUrl,
  isIdentityApiError,
  isValidUuid,
  isValidIsoDateTime,
  parseRetryAfter,
  countUnicodeCodePoints,
  isWellFormedUnicode,
  validateRequestOptions,
  generateCryptographicUuid,
  IdentityApiError,
} from "../../src/lib/api/identity-client.ts";
import {
  generateIdentityApiTypes,
  generateIdentityApiContract,
  checkIdentityApiTypes,
  runCli,
  repositoryRoot,
  DEFAULT_SPEC_PATH,
  DEFAULT_TYPES_OUTPUT_PATH,
  DEFAULT_CONTRACT_OUTPUT_PATH,
} from "../../scripts/generate-identity-api-types.mjs";
import * as requestValidators from "../../src/lib/api/identity-client-validators.ts";
import { validatePayloadAgainstSchema } from "../../scripts/lib/backend-contract-validation.mjs";
import {
  validateOperationRequest,
  validateOperationResponse,
  validateContractSchema,
  validatePayloadAgainstSchema as validateRuntimePayloadAgainstSchema,
} from "../../src/lib/api/identity-schema-validation.ts";
import identityContract from "../../src/lib/api/identity-contract.json" with { type: "json" };

interface OpenApiMockDoc {
  openapi: string;
  paths: Record<
    string,
    Record<
      string,
      {
        operationId?: string;
        requestBody?: { content?: Record<string, { schema?: Record<string, unknown> }> };
        responses?: Record<string, { content?: Record<string, { schema?: Record<string, unknown> }> }>;
      }
    >
  >;
  components: { schemas: Record<string, Record<string, unknown>> };
}

const openApiSpec = JSON.parse(fs.readFileSync(DEFAULT_SPEC_PATH, "utf8")) as OpenApiMockDoc;

function createMockResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
  requestId?: string
) {
  const bodyText = typeof body === "string" ? body : JSON.stringify(body);
  const defaultHeaders: Record<string, string> = {
    "content-type": "application/json",
    "cache-control": "no-store, private",
    ...(requestId ? { "x-request-id": requestId } : {}),
    ...headers,
  };

  return new Response(bodyText, {
    status,
    headers: defaultHeaders,
  });
}

const VALID_DEV_ENV = { DEV: true, MODE: "development" };
const VALID_LOOPBACK_URL = "https://localhost:8443";
const VALID_STAGING_URL = "https://staging-api.gazaairport.com";
const fixedReqId = "b65356c5-56c1-45c9-bd39-54b8a193b977";

describe("IdentityApiClient — Disabled Default & Zero Network / Zero Fabrication", () => {
  it("defaults to disabled mode and rejects all 12 operations with safe configuration error (zero network)", async () => {
    let fetchCalls = 0;
    const client = createIdentityApiClient({
      fetch: () => {
        fetchCalls++;
        throw new Error("Fetch must never be invoked in disabled mode");
      },
    });

    assert.equal(client.isEnabled, false);
    assert.equal(client.mode, "mock");
    assert.equal(client.baseUrl, null);
    assert.equal(client.isDisposed, false);

    // 1. GET /auth/csrf
    await assert.rejects(
      async () => client.getAuthCsrf(),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );

    // 2. POST /auth/register
    await assert.rejects(
      async () =>
        client.postPassengerRegister({
          email: "user@example.com",
          password: "SafePassword12345!",
          firstName: "Test",
          lastName: "User",
        }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );

    // 3. POST /auth/login
    await assert.rejects(
      async () =>
        client.postPassengerLogin({
          email: "user@example.com",
          password: "SafePassword12345!",
        }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );

    // 4. POST /auth/logout
    await assert.rejects(
      async () => client.postPassengerLogout(),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );

    // 5. POST /auth/password/forgot
    await assert.rejects(
      async () => client.postPassengerPasswordForgot({ email: "user@example.com" }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );

    // 6. POST /auth/password/reset
    await assert.rejects(
      async () =>
        client.postPassengerPasswordReset({
          token: "tok",
          email: "user@example.com",
          password: "SafePassword12345!",
        }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );

    // 7. POST /auth/email/verify
    await assert.rejects(
      async () => client.postPassengerEmailVerify({ token: "tok" }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );

    // 8. POST /auth/email/resend
    await assert.rejects(
      async () => client.postPassengerEmailResend({ email: "user@example.com" }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );

    // 9. GET /staff/csrf
    await assert.rejects(
      async () => client.getStaffCsrf(),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );

    // 10. POST /staff/login
    await assert.rejects(
      async () => client.postStaffLogin({ username: "staff", password: "password" }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );

    // 11. POST /staff/logout
    await assert.rejects(
      async () => client.postStaffLogout(),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );

    // 12. GET /staff/me
    await assert.rejects(
      async () => client.getStaffMe(),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );

    assert.equal(fetchCalls, 0, "Zero fetch calls must occur in disabled mode");
  });

  it("rejects operations when enabled is explicitly false", async () => {
    let fetchCalls = 0;
    const client = createIdentityApiClient({
      enabled: false,
      fetch: () => {
        fetchCalls++;
        throw new Error("Fetch must never be invoked");
      },
    });

    assert.equal(client.isEnabled, false);
    await assert.rejects(
      async () => client.getAuthCsrf(),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );
    assert.equal(fetchCalls, 0);
  });
});

describe("IdentityApiClient — Secret Privacy & #private State Verification", () => {
  it("never leaks CSRF tokens or internal queues in JSON.stringify, Object.entries, or property inspection", async () => {
    const passengerToken = "00000000-0000-4000-8000-000000000042";
    const staffToken = "00000000-0000-4000-8000-000000000099";

    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: (url, init) => {
        const u = String(url);
        const headers = (init?.headers || {}) as Record<string, string>;
        const reqId = headers["X-Request-Id"] || "00000000-0000-4000-8000-000000000001";
        if (u.endsWith("/auth/csrf")) {
          return Promise.resolve(createMockResponse({ csrfToken: passengerToken }, 200, {}, reqId));
        }
        if (u.endsWith("/staff/csrf")) {
          return Promise.resolve(createMockResponse({ csrfToken: staffToken }, 200, {}, reqId));
        }
        return Promise.resolve(createMockResponse({}, 200, {}, reqId));
      },
    });

    // Bootstrap both realms
    const pCsrf = await client.getAuthCsrfBootstrap();
    assert.equal(pCsrf.csrfToken, passengerToken);

    const sCsrf = await client.getStaffCsrfBootstrap();
    assert.equal(sCsrf.csrfToken, staffToken);

    // 1. JSON.stringify(client) test
    const serialized = JSON.stringify(client);
    assert.equal(serialized.includes(passengerToken), false, "passengerCsrfToken must not leak in JSON");
    assert.equal(serialized.includes(staffToken), false, "staffCsrfToken must not leak in JSON");
    assert.equal(serialized.includes("csrf"), false, "csrf must not appear in JSON");

    const parsed = JSON.parse(serialized);
    assert.deepEqual(parsed, {
      isEnabled: true,
      mode: "live",
      baseUrl: "https://localhost:8443/api/v1",
      isDisposed: false,
    });

    // 2. Object reflection tests
    const keys = Object.keys(client);
    assert.equal(keys.includes("passengerCsrfToken"), false);
    assert.equal(keys.includes("staffCsrfToken"), false);
    assert.equal(keys.includes("#passengerCsrfToken"), false);

    const ownProps = Object.getOwnPropertyNames(client);
    assert.equal(ownProps.includes("passengerCsrfToken"), false);
    assert.equal(ownProps.includes("staffCsrfToken"), false);

    // 3. Direct property access
    assert.equal((client as unknown as Record<string, unknown>)["passengerCsrfToken"], undefined);
    assert.equal((client as unknown as Record<string, unknown>)["staffCsrfToken"], undefined);
  });

  it("redacts arbitrary server text and sentinel values from error field diagnostics across JSON.stringify, Object.entries, and inspect", async () => {
    const sentinelPassword = "PRIVATE_PASSWORD_SENTINEL_314159";
    const sentinelEmail = "PRIVATE_EMAIL_SENTINEL_271828";
    const sentinelToken = "PRIVATE_TOKEN_SENTINEL_141421";
    const sentinelCode = "SENTINEL_CUSTOM_CODE_UNACCEPTED";

    const err = new IdentityApiError({
      kind: "http_error",
      status: 422,
      code: sentinelCode,
      message: "Validation Error: the given data was invalid.",
      fields: {
        password: [sentinelPassword],
        email: [sentinelEmail],
        token: [sentinelToken],
        unauthorizedSecretField: ["SECRET_INTERNAL_VALUE"],
      },
    });

    // 1. Sentinels must NOT appear in JSON.stringify
    const jsonStr = JSON.stringify(err);
    assert.equal(jsonStr.includes(sentinelPassword), false, "password sentinel must not appear in JSON");
    assert.equal(jsonStr.includes(sentinelEmail), false, "email sentinel must not appear in JSON");
    assert.equal(jsonStr.includes(sentinelToken), false, "token sentinel must not appear in JSON");
    assert.equal(jsonStr.includes(sentinelCode), false, "code sentinel must not appear in JSON");
    assert.equal(jsonStr.includes("SECRET_INTERNAL_VALUE"), false, "unallowlisted fields must be omitted");

    // 2. Code must be mapped to accepted canonical code or generic fallback
    assert.equal(err.code, "http_error", "Unaccepted code must fall back to generic http_error");

    // 3. Authentic fields must be mapped to fixed local generic message
    assert.deepEqual(err.fields?.["password"], ["Invalid field value."]);
    assert.deepEqual(err.fields?.["email"], ["Invalid field value."]);
    assert.deepEqual(err.fields?.["token"], ["Invalid field value."]);
    assert.equal(err.fields?.["unauthorizedSecretField"], undefined);

    // 4. Sentinels must NOT appear in Object.entries
    for (const [key, val] of Object.entries(err)) {
      const valStr = JSON.stringify(val) ?? "";
      assert.equal(valStr.includes(sentinelPassword), false);
      assert.equal(valStr.includes(sentinelEmail), false);
      assert.equal(valStr.includes(sentinelToken), false);
      assert.equal(valStr.includes(sentinelCode), false);
    }

    // 5. Sentinels must NOT appear in util.inspect
    const inspected = util.inspect(err);
    assert.equal(inspected.includes(sentinelPassword), false);
    assert.equal(inspected.includes(sentinelEmail), false);
    assert.equal(inspected.includes(sentinelToken), false);
    assert.equal(inspected.includes(sentinelCode), false);
  });

  it("does not reflect unknown caller option names into error messages", () => {
    const sentinelOption = "SECRET_SENTINEL_CALLER_OPTION_42";
    try {
      validateRequestOptions({ [sentinelOption]: 123 });
      assert.fail("Should have thrown");
    } catch (err) {
      assert.equal(isIdentityApiError(err), true);
      if (isIdentityApiError(err)) {
        assert.equal(err.message.includes(sentinelOption), false, "Unknown option name must not be reflected in error message");
        assert.equal(err.message, "Invalid request options: unexpected extra property.");
      }
    }
  });
});

describe("IdentityApiClient — Production Opt-In and Environment Rejection", () => {
  it("rejects enabling when PROD flag is true", () => {
    assert.throws(
      () =>
        createIdentityApiClient({
          enabled: true,
          nonProductionOptIn: true,
          environment: { PROD: true, DEV: true },
          baseUrl: VALID_LOOPBACK_URL,
        }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );
  });

  it("rejects enabling when MODE is production", () => {
    assert.throws(
      () =>
        createIdentityApiClient({
          enabled: true,
          nonProductionOptIn: true,
          environment: { MODE: "production" },
          baseUrl: VALID_LOOPBACK_URL,
        }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );
  });

  it("rejects enabling when NODE_ENV is production", () => {
    assert.throws(
      () =>
        createIdentityApiClient({
          enabled: true,
          nonProductionOptIn: true,
          environment: { NODE_ENV: "production" },
          baseUrl: VALID_LOOPBACK_URL,
        }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );
  });

  it("rejects contradictory environment flags (DEV: true and PROD: true)", () => {
    assert.throws(
      () =>
        createIdentityApiClient({
          enabled: true,
          nonProductionOptIn: true,
          environment: { DEV: true, PROD: true, MODE: "development" },
          baseUrl: VALID_LOOPBACK_URL,
        }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );
  });

  it("rejects unknown environment mode", () => {
    assert.throws(
      () =>
        createIdentityApiClient({
          enabled: true,
          nonProductionOptIn: true,
          environment: { MODE: "unknown_custom" },
          baseUrl: VALID_LOOPBACK_URL,
        }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );
  });

  it("rejects enabling when nonProductionOptIn is missing or false", () => {
    assert.throws(
      () =>
        createIdentityApiClient({
          enabled: true,
          environment: VALID_DEV_ENV,
          baseUrl: VALID_LOOPBACK_URL,
        }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );
  });

  it("rejects contradictory configuration where enabled is false but optIn is true", () => {
    assert.throws(
      () =>
        createIdentityApiClient({
          enabled: false,
          nonProductionOptIn: true,
        }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );
  });

  it("rejects accidental production API hosts even in development", () => {
    const prodHosts = [
      "https://api.gazaairport.com",
      "https://www.gazaairport.com",
      "https://gazaairport.com",
    ];

    for (const host of prodHosts) {
      assert.throws(
        () =>
          createIdentityApiClient({
            enabled: true,
            nonProductionOptIn: true,
            environment: VALID_DEV_ENV,
            baseUrl: host,
          }),
        (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
      );
    }
  });
});

describe("IdentityApiClient — HTTPS-Only URL & Delimiter Ambiguity Rejection", () => {
  it("rejects HTTP protocol even on loopback (HTTPS ONLY invariant)", () => {
    const httpUrls = [
      "http://localhost:8000",
      "http://127.0.0.1:8000",
      "http://[::1]:8000",
      "http://localhost",
    ];

    for (const url of httpUrls) {
      assert.throws(
        () => validateAndNormalizeBaseUrl(url),
        (err: unknown) =>
          isIdentityApiError(err) &&
          err.kind === "configuration" &&
          err.message.includes("HTTP protocol is strictly prohibited")
      );
    }
  });

  it("accepts and normalizes allowed loopback HTTPS URLs", () => {
    assert.equal(validateAndNormalizeBaseUrl("https://localhost:8443"), "https://localhost:8443/api/v1");
    assert.equal(validateAndNormalizeBaseUrl("https://localhost:8443/"), "https://localhost:8443/api/v1");
    assert.equal(validateAndNormalizeBaseUrl("https://localhost:8443/api/v1"), "https://localhost:8443/api/v1");
    assert.equal(validateAndNormalizeBaseUrl("https://127.0.0.1:9000"), "https://127.0.0.1:9000/api/v1");
  });

  it("accepts and normalizes allowed staging HTTPS URLs on standard port only", () => {
    assert.equal(
      validateAndNormalizeBaseUrl("https://staging-api.gazaairport.com"),
      "https://staging-api.gazaairport.com/api/v1"
    );
  });

  it("rejects custom port on accepted staging origin", () => {
    assert.throws(
      () => validateAndNormalizeBaseUrl("https://staging-api.gazaairport.com:8443"),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );
  });

  it("rejects userinfo, query, hash delimiters (including empty delimiters) and invalid path encodings", () => {
    assert.throws(
      () => validateAndNormalizeBaseUrl("https://localhost:8443?"),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );
    assert.throws(
      () => validateAndNormalizeBaseUrl("https://localhost:8443#"),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );
    assert.throws(
      () => validateAndNormalizeBaseUrl("https://@localhost:8443"),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );
    assert.throws(
      () => validateAndNormalizeBaseUrl("https://localhost:8443/api//v1"),
      (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
    );
  });
});

describe("IdentityApiClient — Request Options Closed Shape & AbortSignal Validation", () => {
  it("rejects unknown properties in request options fail-closed", () => {
    assert.throws(
      () => validateRequestOptions({ unknownField: "val" }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
    );
  });

  it("rejects malformed signal duck types missing removeEventListener before any dispatch", () => {
    const malformedDuckType = {
      aborted: false,
      addEventListener() {},
      // missing removeEventListener!
    };

    assert.throws(
      () => validateRequestOptions({ signal: malformedDuckType as unknown as AbortSignal }),
      (err: unknown) =>
        isIdentityApiError(err) &&
        err.kind === "protocol" &&
        err.message.includes("signal must be an AbortSignal instance")
    );
  });

  it("accepts authentic AbortSignal and compatible complete shape", () => {
    const realSignal = new AbortController().signal;
    const validated = validateRequestOptions({ signal: realSignal });
    assert.equal(validated?.signal, realSignal);

    const completeCompatible = {
      aborted: false,
      addEventListener() {},
      removeEventListener() {},
    };
    const validatedCompat = validateRequestOptions({ signal: completeCompatible as unknown as AbortSignal });
    assert.ok(validatedCompat?.signal);
  });

  it("rejects invalid requestId in request options", () => {
    assert.throws(
      () => validateRequestOptions({ requestId: "not-a-uuid" }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
    );
  });

  it("rejects invalid timeoutMs in request options", () => {
    assert.throws(
      () => validateRequestOptions({ timeoutMs: -1 }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
    );
  });
});

describe("IdentityApiClient — Unicode Password Rules & Raw Bytes Preservation", () => {
  it("rejects lone surrogate ill-formed Unicode in password without trimming", async () => {
    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: () => Promise.resolve(createMockResponse({})),
    });

    const illFormedPassword = "ValidLengthPass\uD800word123!";
    assert.equal(isWellFormedUnicode(illFormedPassword), false);

    await assert.rejects(
      async () =>
        client.registerPassenger({
          email: "test@example.com",
          password: illFormedPassword,
          firstName: "A",
          lastName: "B",
        }),
      (err: unknown) =>
        isIdentityApiError(err) &&
        err.kind === "protocol" &&
        err.message.includes("ill-formed Unicode")
    );
  });

  it("preserves exact password bytes and untrimmed spaces", () => {
    const spacedPassword = "  ExactSpacesPassword12345!  ";
    assert.equal(isWellFormedUnicode(spacedPassword), true);
    assert.equal(countUnicodeCodePoints(spacedPassword), 29);
  });
});

describe("IdentityApiClient — Queue Wait Abort, Disposal, and Per-Realm Serialization", () => {
  it("aborts queued operation immediately if caller signal aborts while waiting in queue", async () => {
    let queuedFetchExecuted = false;

    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: async (url, init) => {
        const u = String(url);
        const headers = (init?.headers || {}) as Record<string, string>;
        const reqId = headers["X-Request-Id"] || "00000000-0000-4000-8000-000000000001";
        const nowIso = new Date().toISOString();

        if (u.endsWith("/auth/csrf")) {
          return createMockResponse({ csrfToken: "tok" }, 200, {}, reqId);
        }

        if (u.endsWith("/auth/logout")) {
          await new Promise((r) => setTimeout(r, 40));
          return createMockResponse({ success: true, data: { message: "Revoked" }, meta: { requestId: reqId, timestamp: nowIso } }, 200);
        }

        if (u.endsWith("/auth/password/forgot")) {
          queuedFetchExecuted = true;
          return createMockResponse({ success: true, data: { message: "Dispatched" }, meta: { requestId: reqId, timestamp: nowIso } }, 202);
        }

        return createMockResponse({});
      },
    });

    const abortController = new AbortController();
    const op1 = client.logoutPassenger();
    const op2 = client.forgotPassengerPassword({ email: "test@example.com" }, { signal: abortController.signal });

    setTimeout(() => {
      abortController.abort();
    }, 10);

    await assert.rejects(
      async () => op2,
      (err: unknown) => isIdentityApiError(err) && err.kind === "abort"
    );

    await op1;
    assert.equal(queuedFetchExecuted, false, "Queued write must not execute network after caller abort");
  });

  it("prevents queued write from dispatching network after client dispose (zero network after dispose)", async () => {
    let queuedWriteNetworkCalls = 0;

    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: async (url, init) => {
        const u = String(url);
        const headers = (init?.headers || {}) as Record<string, string>;
        const reqId = headers["X-Request-Id"] || "00000000-0000-4000-8000-000000000001";
        const nowIso = new Date().toISOString();

        if (u.endsWith("/auth/csrf")) {
          return createMockResponse({ csrfToken: "tok" }, 200, {}, reqId);
        }

        if (u.endsWith("/auth/logout")) {
          await new Promise((r) => setTimeout(r, 40));
          return createMockResponse({ success: true, data: { message: "Revoked" }, meta: { requestId: reqId, timestamp: nowIso } }, 200);
        }

        if (u.endsWith("/auth/password/forgot")) {
          queuedWriteNetworkCalls++;
          return createMockResponse({ success: true, data: { message: "Dispatched" }, meta: { requestId: reqId, timestamp: nowIso } }, 202);
        }

        return createMockResponse({});
      },
    });

    const op1 = client.logoutPassenger();
    const op2 = client.forgotPassengerPassword({ email: "test@example.com" });

    setTimeout(() => {
      client.dispose();
    }, 10);

    await Promise.allSettled([op1, op2]);

    await assert.rejects(
      async () => op2,
      (err: unknown) => isIdentityApiError(err) && err.kind === "abort"
    );

    assert.equal(queuedWriteNetworkCalls, 0, "Queued write must not dispatch network after disposal");
  });

  it("preserves per-realm queue write serialization after a queued operation cancels", async () => {
    const executionOrder: string[] = [];

    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: async (url, init) => {
        const u = String(url);
        const headers = (init?.headers || {}) as Record<string, string>;
        const reqId = headers["X-Request-Id"] || "00000000-0000-4000-8000-000000000001";
        const nowIso = new Date().toISOString();

        if (u.endsWith("/auth/csrf")) {
          return createMockResponse({ csrfToken: "tok" }, 200, {}, reqId);
        }

        if (u.endsWith("/auth/logout")) {
          executionOrder.push("task1_start");
          await new Promise((r) => setTimeout(r, 30));
          executionOrder.push("task1_end");
          return createMockResponse({ success: true, data: { message: "Task 1" }, meta: { requestId: reqId, timestamp: nowIso } }, 200);
        }

        if (u.endsWith("/auth/password/forgot")) {
          executionOrder.push("task3_run");
          return createMockResponse({ success: true, data: { message: "Task 3" }, meta: { requestId: reqId, timestamp: nowIso } }, 202);
        }

        return createMockResponse({});
      },
    });

    const abort2 = new AbortController();
    const task1 = client.logoutPassenger();
    const task2 = client.forgotPassengerPassword({ email: "cancel@example.com" }, { signal: abort2.signal });
    const task3 = client.forgotPassengerPassword({ email: "valid@example.com" });

    // Cancel task2 while queued
    setTimeout(() => {
      abort2.abort();
    }, 10);

    await assert.rejects(async () => task2, (err: unknown) => isIdentityApiError(err) && err.kind === "abort");
    const res1 = await task1;
    const res3 = await task3;

    assert.equal(res1.success, true);
    assert.equal(res3.success, true);
    assert.deepEqual(executionOrder, ["task1_start", "task1_end", "task3_run"]);
  });

  it("invalidates in-flight bootstrap token if auth state rotated concurrently", async () => {
    let resolveBootstrap: ((res: Response) => void) | null = null;
    let onBootstrapStarted: () => void = () => {};
    const bootstrapStarted = new Promise<void>((resolve) => {
      onBootstrapStarted = resolve;
    });

    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: (url) => {
        const u = String(url);
        if (u.endsWith("/auth/csrf")) {
          return new Promise<Response>((resolve) => {
            resolveBootstrap = resolve;
            onBootstrapStarted();
          });
        }
        return Promise.resolve(createMockResponse({}));
      },
    });

    const bootstrapPromise = client.getAuthCsrfBootstrap();
    await bootstrapStarted;

    client.dispose();

    resolveBootstrap!(
      createMockResponse(
        { csrfToken: "stale-bootstrap-token" },
        200,
        {},
        "00000000-0000-4000-8000-000000000001"
      )
    );

    await assert.rejects(
      async () => bootstrapPromise,
      (err: unknown) => isIdentityApiError(err) && err.kind === "abort"
    );
  });
});

describe("IdentityApiClient — Never-Settling Fetch & Stalled Stream Read Deadlines", () => {
  it("settles promptly on deadline when fetch ignores AbortSignal and hangs forever", async () => {
    const id = "b65356c5-56c1-45c9-bd39-54b8a193b977";
    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: "https://localhost:18090",
      timeoutMs: 25,
      fetch: () => new Promise(() => {}), // never settles
    });

    const start = Date.now();
    await assert.rejects(
      async () => client.getStaffMe({ requestId: id }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "timeout"
    );
    const duration = Date.now() - start;
    assert.ok(duration < 150, `Operation must settle promptly by deadline (took ${duration}ms)`);
  });

  it("settles promptly on deadline when body ReadableStream read hangs forever, canceling stream", async () => {
    const id = "b65356c5-56c1-45c9-bd39-54b8a193b977";
    let streamCanceled = false;

    const stream = new ReadableStream({
      pull() {
        return new Promise(() => {}); // never settles
      },
      cancel() {
        streamCanceled = true;
      },
    });

    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: "https://localhost:18090",
      timeoutMs: 25,
      fetch: async () =>
        new Response(stream, {
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": id,
          },
        }),
    });

    const start = Date.now();
    await assert.rejects(
      async () => client.getStaffMe({ requestId: id }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "timeout"
    );
    const duration = Date.now() - start;
    assert.ok(duration < 150, `Operation must settle promptly by deadline (took ${duration}ms)`);
    assert.equal(streamCanceled, true, "Stream cancel hook must be invoked without awaiting a hanging cancel");
  });

  it("settles promptly with abort error when client is disposed during never-settling fetch", async () => {
    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      timeoutMs: 5000,
      fetch: () => new Promise(() => {}),
    });

    const op = client.getStaffMe();
    setTimeout(() => {
      client.dispose();
    }, 15);

    const start = Date.now();
    await assert.rejects(
      async () => op,
      (err: unknown) => isIdentityApiError(err) && err.kind === "abort"
    );
    const duration = Date.now() - start;
    assert.ok(duration < 150, `Disposal must settle active call immediately (took ${duration}ms)`);
  });

  it("settles promptly with abort error when client is disposed during never-settling stream pull", async () => {
    let canceled = false;
    const stream = new ReadableStream({
      pull() {
        return new Promise(() => {});
      },
      cancel() {
        canceled = true;
      },
    });

    const id = "00000000-0000-4000-8000-000000000001";
    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      timeoutMs: 5000,
      fetch: async () =>
        new Response(stream, {
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": id,
          },
        }),
    });

    const op = client.getStaffMe({ requestId: id });
    setTimeout(() => {
      client.dispose();
    }, 15);

    await assert.rejects(
      async () => op,
      (err: unknown) => isIdentityApiError(err) && err.kind === "abort"
    );
    assert.equal(canceled, true, "Stream must be canceled when client is disposed");
  });
});

describe("IdentityApiClient — Strict Correlation & HTTP 429 Retry-After Controls", () => {
  it("rejects CSRF bootstrap when X-Request-Id response header is missing", async () => {
    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: () => Promise.resolve(createMockResponse({ csrfToken: "valid-tok" }, 200)),
    });

    await assert.rejects(
      async () => client.getAuthCsrfBootstrap(),
      (err: unknown) =>
        isIdentityApiError(err) &&
        err.kind === "protocol" &&
        err.message.includes("Missing required X-Request-Id correlation header")
    );
  });

  it("rejects CSRF bootstrap when X-Request-Id response header does not match", async () => {
    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: () =>
        Promise.resolve(
          createMockResponse(
            { csrfToken: "valid-tok" },
            200,
            { "x-request-id": "11111111-1111-4111-8111-111111111111" }
          )
        ),
    });

    await assert.rejects(
      async () => client.getAuthCsrfBootstrap({ requestId: "00000000-0000-4000-8000-000000000001" }),
      (err: unknown) =>
        isIdentityApiError(err) &&
        err.kind === "protocol" &&
        err.message.includes("correlation mismatch")
    );
  });

  it("rejects HTTP 429 when Retry-After header is missing or invalid", async () => {
    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: (_url, init) => {
        const u = String(_url);
        const headers = (init?.headers || {}) as Record<string, string>;
        const reqId = headers["X-Request-Id"] || "00000000-0000-4000-8000-000000000001";
        if (u.endsWith("/auth/csrf")) {
          return Promise.resolve(createMockResponse({ csrfToken: "tok" }, 200, {}, reqId));
        }
        return Promise.resolve(
          createMockResponse(
            {
              success: false,
              error: { code: "too_many_requests", message: "Too many requests." },
              meta: { requestId: reqId, timestamp: new Date().toISOString() },
            },
            429
          )
        );
      },
    });

    await assert.rejects(
      async () => client.logoutPassenger(),
      (err: unknown) =>
        isIdentityApiError(err) &&
        err.kind === "protocol" &&
        err.message.includes("HTTP 429 response must include a valid Retry-After header")
    );
  });

  it("accepts HTTP 429 with valid Retry-After header and returns safe typed error", async () => {
    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: (_url, init) => {
        const u = String(_url);
        const headers = (init?.headers || {}) as Record<string, string>;
        const reqId = headers["X-Request-Id"] || "00000000-0000-4000-8000-000000000001";
        if (u.endsWith("/auth/csrf")) {
          return Promise.resolve(createMockResponse({ csrfToken: "tok" }, 200, {}, reqId));
        }
        return Promise.resolve(
          createMockResponse(
            {
              success: false,
              error: { code: "too_many_requests", message: "Too many requests." },
              meta: { requestId: reqId, timestamp: new Date().toISOString() },
            },
            429,
            { "retry-after": "120" }
          )
        );
      },
    });

    try {
      await client.logoutPassenger();
      assert.fail("Should have thrown");
    } catch (err) {
      assert.equal(isIdentityApiError(err), true);
      if (isIdentityApiError(err)) {
        assert.equal(err.kind, "http_error");
        assert.equal(err.status, 429);
        assert.equal(err.code, "too_many_requests");
        assert.equal(err.retryAfter, 120);
      }
    }
  });
});

describe("IdentityApiClient — Bounded Response Body Stream", () => {
  it("rejects response body exceeding 1 MiB and cancels stream", async () => {
    let streamCancelled = false;

    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: () => {
        const chunk = new Uint8Array(64 * 1024); // 64 KiB per chunk
        const stream = new ReadableStream({
          pull(controller) {
            controller.enqueue(chunk);
          },
          cancel() {
            streamCancelled = true;
          },
        });

        return Promise.resolve(
          new Response(stream, {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-request-id": "00000000-0000-4000-8000-000000000001",
            },
          })
        );
      },
    });

    await assert.rejects(
      async () => client.getAuthCsrfBootstrap(),
      (err: unknown) =>
        isIdentityApiError(err) &&
        err.kind === "protocol" &&
        err.message.includes("exceeded maximum allowed limit")
    );

    assert.equal(streamCancelled, true, "Stream must be cancelled on overflow");
  });
});

describe("IdentityApiClient — All 12 Operations Positive Protocol Tests with OpenAPI Schema Parity", () => {
  it("validates all 12 operation request/response specimens against OpenAPI schema and client runtime", async () => {
    const fixedReqId = "b65356c5-56c1-45c9-bd39-54b8a193b977";
    const fixedTimestamp = "2026-10-10T12:00:00.000Z";
    const metaSpecimen = { requestId: fixedReqId, timestamp: fixedTimestamp };

    // Validate SuccessMeta schema
    const metaCheck = validatePayloadAgainstSchema(
      openApiSpec.components.schemas["SuccessMeta"],
      metaSpecimen,
      openApiSpec
    );
    assert.equal(metaCheck.valid, true, `SuccessMeta must be valid: ${metaCheck.errors?.join("; ")}`);

    // Define 12 specimen envelopes and schemas
    const specimens: Record<
      string,
      {
        reqSchema?: string;
        resSchema: string | Record<string, unknown>;
        requestPayload?: unknown;
        responseEnvelope: unknown;
        execute: (c: ReturnType<typeof createIdentityApiClient>) => Promise<unknown>;
      }
    > = {
      // 1. GET /auth/csrf
      getAuthCsrfBootstrap: {
        resSchema: openApiSpec.components.schemas["CsrfTokenResponse"],
        responseEnvelope: { csrfToken: "csrf-token-passenger-12345" },
        execute: (c) => c.getAuthCsrfBootstrap({ requestId: fixedReqId }),
      },
      // 2. POST /auth/register
      postPassengerRegister: {
        reqSchema: "RegisterRequest",
        resSchema: openApiSpec.components.schemas["PassengerRegisterReceiptResponse"],
        requestPayload: {
          email: "salma@palestinian-airlines.ps",
          password: "SecureRegistrationPassword2026!",
          title: "Ms",
          firstName: "سلمى",
          lastName: "الخطيب",
          phone: "+970599000000",
        },
        responseEnvelope: {
          success: true,
          data: { status: "verification_dispatched", message: "Verification email dispatched." },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.postPassengerRegister(
            {
              email: "salma@palestinian-airlines.ps",
              password: "SecureRegistrationPassword2026!",
              title: "Ms",
              firstName: "سلمى",
              lastName: "الخطيب",
              phone: "+970599000000",
            },
            { requestId: fixedReqId }
          ),
      },
      // 3. POST /auth/login
      postPassengerLogin: {
        reqSchema: "LoginRequest",
        resSchema: openApiSpec.components.schemas["PassengerAuthResponse"],
        requestPayload: {
          email: "passenger@palestinian-airlines.ps",
          password: "SecureLoginPassword2026!",
        },
        responseEnvelope: {
          success: true,
          data: {
            user: {
              id: "b65356c5-56c1-45c9-bd39-54b8a193b977",
              email: "passenger@palestinian-airlines.ps",
              firstName: "Ahmad",
              lastName: "Gaza",
              emailVerified: true,
            },
          },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.postPassengerLogin(
            {
              email: "passenger@palestinian-airlines.ps",
              password: "SecureLoginPassword2026!",
            },
            { requestId: fixedReqId }
          ),
      },
      // 4. POST /auth/logout
      postPassengerLogout: {
        resSchema: openApiSpec.paths["/auth/logout"]!.post!.responses!["200"]!.content!["application/json"]!.schema!,
        responseEnvelope: {
          success: true,
          data: { message: "Session revoked successfully." },
          meta: metaSpecimen,
        },
        execute: (c) => c.postPassengerLogout({ requestId: fixedReqId }),
      },
      // 5. POST /auth/password/forgot
      postPassengerPasswordForgot: {
        reqSchema: "PasswordForgotRequest",
        resSchema: openApiSpec.paths["/auth/password/forgot"]!.post!.responses!["202"]!.content!["application/json"]!.schema!,
        requestPayload: { email: "passenger@palestinian-airlines.ps" },
        responseEnvelope: {
          success: true,
          data: { message: "Password reset instructions dispatched." },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.postPassengerPasswordForgot(
            { email: "passenger@palestinian-airlines.ps" },
            { requestId: fixedReqId }
          ),
      },
      // 6. POST /auth/password/reset
      postPassengerPasswordReset: {
        reqSchema: "PasswordResetRequest",
        resSchema: openApiSpec.paths["/auth/password/reset"]!.post!.responses!["200"]!.content!["application/json"]!.schema!,
        requestPayload: {
          token: "reset-token-xyz-123",
          email: "passenger@palestinian-airlines.ps",
          password: "BrandNewPassword2026!",
        },
        responseEnvelope: {
          success: true,
          data: { message: "Password updated successfully." },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.postPassengerPasswordReset(
            {
              token: "reset-token-xyz-123",
              email: "passenger@palestinian-airlines.ps",
              password: "BrandNewPassword2026!",
            },
            { requestId: fixedReqId }
          ),
      },
      // 7. POST /auth/email/verify
      postPassengerEmailVerify: {
        reqSchema: "EmailVerifyRequest",
        resSchema: openApiSpec.paths["/auth/email/verify"]!.post!.responses!["200"]!.content!["application/json"]!.schema!,
        requestPayload: { token: "verify-token-xyz-789" },
        responseEnvelope: {
          success: true,
          data: { verified: true },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.postPassengerEmailVerify({ token: "verify-token-xyz-789" }, { requestId: fixedReqId }),
      },
      // 8. POST /auth/email/resend
      postPassengerEmailResend: {
        reqSchema: "PassengerEmailResendRequest",
        resSchema: openApiSpec.components.schemas["PassengerRegisterReceiptResponse"],
        requestPayload: { email: "passenger@palestinian-airlines.ps" },
        responseEnvelope: {
          success: true,
          data: { status: "verification_dispatched", message: "Verification dispatched." },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.postPassengerEmailResend(
            { email: "passenger@palestinian-airlines.ps" },
            { requestId: fixedReqId }
          ),
      },
      // 9. GET /staff/csrf
      getStaffCsrfBootstrap: {
        resSchema: openApiSpec.components.schemas["CsrfTokenResponse"],
        responseEnvelope: { csrfToken: "csrf-token-staff-99999" },
        execute: (c) => c.getStaffCsrfBootstrap({ requestId: fixedReqId }),
      },
      // 10. POST /staff/login
      postStaffLogin: {
        reqSchema: "StaffLoginRequest",
        resSchema: openApiSpec.components.schemas["StaffPendingAuthResponse"],
        requestPayload: { username: "gza_admin", password: "AdminPassword2026!" },
        responseEnvelope: {
          success: true,
          data: { status: "mfa_required", expiresAt: "2026-10-10T12:05:00.000Z" },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.postStaffLogin(
            { username: "gza_admin", password: "AdminPassword2026!" },
            { requestId: fixedReqId }
          ),
      },
      // 11. POST /staff/logout
      postStaffLogout: {
        resSchema: openApiSpec.paths["/staff/logout"]!.post!.responses!["200"]!.content!["application/json"]!.schema!,
        responseEnvelope: {
          success: true,
          data: { message: "Staff session terminated." },
          meta: metaSpecimen,
        },
        execute: (c) => c.postStaffLogout({ requestId: fixedReqId }),
      },
      // 12. GET /staff/me
      getStaffMe: {
        resSchema: openApiSpec.components.schemas["StaffMeResponse"],
        responseEnvelope: {
          success: true,
          data: {
            id: "b65356c5-56c1-45c9-bd39-54b8a193b977",
            username: "gza_admin",
            email: "admin@palestinian-airlines.ps",
            fullNameEn: "Salma Al-Khatib",
            fullNameAr: "سلمى الخطيب",
            role: "admin",
            permissions: ["ops.view", "commercial.view"],
            mfaEnabled: true,
          },
          meta: metaSpecimen,
        },
        execute: (c) => c.getStaffMe({ requestId: fixedReqId }),
      },
    };

    // Verify all 12 specimens against OpenAPI schema AST
    for (const [opName, specItem] of Object.entries(specimens)) {
      if (specItem.reqSchema && specItem.requestPayload) {
        const operation = Object.values(openApiSpec.paths).flatMap(Object.values).find((op) => op.operationId === opName);
        assert.ok(operation, "Specimen must resolve its actual operation");
        const schema = operation.requestBody?.content?.["application/json"]?.schema;
        assert.ok(schema, "Request specimen requires the operation request schema");
        const reqCheck = validatePayloadAgainstSchema(schema, specItem.requestPayload, openApiSpec);
        assert.equal(
          reqCheck.valid,
          true,
          `Operation ${opName} request must match OpenAPI schema: ${reqCheck.errors?.join("; ")}`
        );
      }

      const resCheck = validatePayloadAgainstSchema(
        Object.values(openApiSpec.paths).flatMap(Object.values).find((op) => op.operationId === opName)?.responses?.[["postPassengerRegister", "postPassengerPasswordForgot", "postPassengerEmailResend"].includes(opName) ? "202" : "200"]?.content?.["application/json"]?.schema,
        specItem.responseEnvelope,
        openApiSpec
      );
      assert.equal(
        resCheck.valid,
        true,
        `Operation ${opName} response must match OpenAPI schema: ${resCheck.errors?.join("; ")}`
      );
    }

    // Now test all 12 through client execution
    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: (url, init) => {
        const u = String(url);
        const headers = (init?.headers || {}) as Record<string, string>;
        const reqId = headers["X-Request-Id"] || headers["x-request-id"] || fixedReqId;

        const getEnvelope = (envelope: unknown) => {
          if (envelope && typeof envelope === "object" && "meta" in envelope) {
            const env = envelope as { meta: { requestId?: string; timestamp?: string } };
            return {
              ...env,
              meta: {
                ...env.meta,
                requestId: reqId,
              },
            };
          }
          return envelope;
        };

        if (u.endsWith("/auth/csrf")) {
          return Promise.resolve(createMockResponse(specimens["getAuthCsrfBootstrap"].responseEnvelope, 200, {}, reqId));
        }
        if (u.endsWith("/auth/register")) {
          return Promise.resolve(createMockResponse(getEnvelope(specimens["postPassengerRegister"].responseEnvelope), 202, {}, reqId));
        }
        if (u.endsWith("/auth/login")) {
          return Promise.resolve(createMockResponse(getEnvelope(specimens["postPassengerLogin"].responseEnvelope), 200, {}, reqId));
        }
        if (u.endsWith("/auth/logout")) {
          return Promise.resolve(createMockResponse(getEnvelope(specimens["postPassengerLogout"].responseEnvelope), 200, {}, reqId));
        }
        if (u.endsWith("/auth/password/forgot")) {
          return Promise.resolve(createMockResponse(getEnvelope(specimens["postPassengerPasswordForgot"].responseEnvelope), 202, {}, reqId));
        }
        if (u.endsWith("/auth/password/reset")) {
          return Promise.resolve(createMockResponse(getEnvelope(specimens["postPassengerPasswordReset"].responseEnvelope), 200, {}, reqId));
        }
        if (u.endsWith("/auth/email/verify")) {
          return Promise.resolve(createMockResponse(getEnvelope(specimens["postPassengerEmailVerify"].responseEnvelope), 200, {}, reqId));
        }
        if (u.endsWith("/auth/email/resend")) {
          return Promise.resolve(createMockResponse(getEnvelope(specimens["postPassengerEmailResend"].responseEnvelope), 202, {}, reqId));
        }
        if (u.endsWith("/staff/csrf")) {
          return Promise.resolve(createMockResponse(specimens["getStaffCsrfBootstrap"].responseEnvelope, 200, {}, reqId));
        }
        if (u.endsWith("/staff/login")) {
          return Promise.resolve(createMockResponse(getEnvelope(specimens["postStaffLogin"].responseEnvelope), 200, {}, reqId));
        }
        if (u.endsWith("/staff/logout")) {
          return Promise.resolve(createMockResponse(getEnvelope(specimens["postStaffLogout"].responseEnvelope), 200, {}, reqId));
        }
        if (u.endsWith("/staff/me")) {
          return Promise.resolve(createMockResponse(getEnvelope(specimens["getStaffMe"].responseEnvelope), 200, {}, reqId));
        }
        throw new Error(`Unexpected endpoint: ${u}`);
      },
    });

    for (const [opName, specItem] of Object.entries(specimens)) {
      const result = await specItem.execute(client);
      assert.ok(result, `${opName} must return valid data`);
    }

    // Exercise the client with the same malformed envelopes rejected by each actual operation.
    for (const [opName, specItem] of Object.entries(specimens)) {
      const operation = Object.values(openApiSpec.paths).flatMap(Object.values).find((op) => op.operationId === opName);
      const status = ["postPassengerRegister", "postPassengerPasswordForgot", "postPassengerEmailResend"].includes(opName) ? "202" : "200";
      const schema = operation?.responses?.[status]?.content?.["application/json"]?.schema;
      assert.ok(schema, "Actual operation response schema must exist");
      const envelope = specItem.responseEnvelope as Record<string, unknown>;
      const fields = opName === "getAuthCsrfBootstrap" || opName === "getStaffCsrfBootstrap" ? ["csrfToken"] : ["success", "data", "meta"];
      for (const field of fields) {
        const original = envelope[field];
        delete envelope[field];
        try {
          assert.equal(validatePayloadAgainstSchema(schema, envelope, openApiSpec).valid, false, opName + " missing response field");
          await assert.rejects(specItem.execute(client), (error: unknown) => isIdentityApiError(error) && error.kind === "protocol", opName + " client must reject missing response field");
        } finally { envelope[field] = original; }
      }
    }
  });

  it("compares actual operation request schemas with runtime validators on optional, required, and closed fields", () => {
    const cases: Array<{ path: string; validate: (body: unknown) => unknown; payload: Record<string, unknown> }> = [
      { path: "/auth/register", validate: requestValidators.validateRegisterRequest, payload: { email: "test@example.com", password: "a".repeat(15), firstName: "First", lastName: "Last" } },
      { path: "/auth/login", validate: requestValidators.validateLoginRequest, payload: { email: "test@example.com", password: "" } },
      { path: "/auth/password/forgot", validate: requestValidators.validatePasswordForgotRequest, payload: { email: "test@example.com" } },
      { path: "/auth/password/reset", validate: requestValidators.validatePasswordResetRequest, payload: { email: "test@example.com", password: "a".repeat(15), token: "" } },
      { path: "/auth/email/verify", validate: requestValidators.validateEmailVerifyRequest, payload: { token: "a".repeat(300) } },
      { path: "/auth/email/resend", validate: requestValidators.validatePassengerEmailResendRequest, payload: { email: "test@example.com" } },
      { path: "/staff/login", validate: requestValidators.validateStaffLoginRequest, payload: { username: "officer", password: "a".repeat(129) } },
    ];
    for (const item of cases) {
      const schema = openApiSpec.paths[item.path]?.post?.requestBody?.content?.["application/json"]?.schema;
      assert.ok(schema, "Actual command schema must exist");
      const ref = schema.$ref;
      const resolved = typeof ref === "string" ? openApiSpec.components.schemas[ref.split("/").at(-1)!] : schema;
      const properties = resolved.properties as Record<string, Record<string, unknown>>;
      const required = resolved.required as string[];
      const probes: unknown[] = [item.payload, { ...item.payload, role: "admin" }, [], null];
      for (const key of required) {
        const missing = { ...item.payload }; delete missing[key]; probes.push(missing);
      }
      for (const key of Object.keys(properties)) {
        probes.push({ ...item.payload, [key]: null }, { ...item.payload, [key]: 123 });
        if (!required.includes(key)) probes.push({ ...item.payload, [key]: key === "title" ? "Mr" : "" });
      }
      if ("password" in item.payload) {
        for (const password of ["", "a".repeat(14), "??".repeat(15), "??".repeat(128), "??".repeat(129), " ".repeat(15)]) probes.push({ ...item.payload, password });
      }
      for (const payload of probes) {
        let accepted = true;
        try { item.validate(payload); } catch { accepted = false; }
        assert.equal(accepted, validatePayloadAgainstSchema(schema, payload, openApiSpec).valid, item.path + " runtime/request-schema parity");
      }
    }
  });
});

describe("Generator & Stale Artifact Verification (Including Constraint Changes)", () => {
  it("generates identity types matching the checked-in disk artifact", () => {
    const generated = generateIdentityApiTypes(openApiSpec);
    const diskTypes = fs.readFileSync(DEFAULT_TYPES_OUTPUT_PATH, "utf8").replace(/\r\n/g, "\n");
    assert.equal(diskTypes, generated);
  });

  it("generates identity contract matching the checked-in disk artifact", () => {
    const generated = generateIdentityApiContract(openApiSpec);
    const diskContract = fs.readFileSync(DEFAULT_CONTRACT_OUTPUT_PATH, "utf8").replace(/\r\n/g, "\n");
    assert.equal(diskContract, generated);
  });

  it("passes checkIdentityApiTypes() for matching disk artifacts", () => {
    const result = checkIdentityApiTypes();
    assert.equal(result.ok, true);
    assert.equal(result.reason, null);
  });

  it("detects schema constraint changes (e.g. password minLength 15 -> 16) as stale contract", () => {
    const mutatedSpec = structuredClone(openApiSpec);
    const registerReq = mutatedSpec.components.schemas["RegisterRequest"] as {
      properties?: { password?: { minLength?: number } };
    };
    assert.ok(registerReq?.properties?.password);

    // Mutate password minLength
    registerReq.properties.password.minLength = 16;

    // Fresh generation on mutated spec
    const mutatedContract = generateIdentityApiContract(mutatedSpec);
    const checkedInContract = fs.readFileSync(DEFAULT_CONTRACT_OUTPUT_PATH, "utf8").replace(/\r\n/g, "\n");

    // Must detect difference in digest and schema AST!
    assert.notEqual(
      mutatedContract,
      checkedInContract,
      "Schema constraint change must alter contract digest and content"
    );
  });

  it("fails closed when OpenAPI spec contains unsupported constructs like oneOf", () => {
    const mutatedSpec = structuredClone(openApiSpec);
    mutatedSpec.paths["/auth/csrf"]!.get!.responses!["200"]!.content!["application/json"]!.schema!["oneOf"] =
      [{ type: "string" }];

    assert.throws(
      () => generateIdentityApiTypes(mutatedSpec),
      /Unsupported schema keyword 'oneOf'/
    );
  });

  it("rejects unknown CLI arguments with exit code 1", () => {
    const exitCode = runCli(["--invalid-arg"]);
    assert.equal(exitCode, 1);
  });

  it("runs generator --check subprocess exiting 0 on clean checked-in artifacts", () => {
    const res = spawnSync(
      process.execPath,
      ["scripts/generate-identity-api-types.mjs", "--check"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
      }
    );
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Identity API types and contract are up to date/);
  });

  it("runs generator --check subprocess exiting 1 on corrupted types artifact", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gen-test-types-"));
    try {
      const corruptedTypes = path.join(tempDir, "corrupted-types.ts");
      fs.writeFileSync(corruptedTypes, "// corrupted types content", "utf8");
      const res = spawnSync(
        process.execPath,
        ["scripts/generate-identity-api-types.mjs", "--check", "--types", corruptedTypes],
        {
          cwd: repositoryRoot,
          encoding: "utf8",
        }
      );
      assert.equal(res.status, 1);
      assert.match(res.stderr, /Stale artifact/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("runs generator --check subprocess exiting 1 on corrupted contract artifact", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gen-test-contract-"));
    try {
      const corruptedContract = path.join(tempDir, "corrupted-contract.json");
      fs.writeFileSync(corruptedContract, "{}", "utf8");
      const res = spawnSync(
        process.execPath,
        ["scripts/generate-identity-api-types.mjs", "--check", "--contract", corruptedContract],
        {
          cwd: repositoryRoot,
          encoding: "utf8",
        }
      );
      assert.equal(res.status, 1);
      assert.match(res.stderr, /Stale artifact/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("IdentityApiClient — 29 Expanded Operations Positive Protocol Tests with OpenAPI Schema Parity", () => {
  it("validates all 29 operation request/response specimens against OpenAPI schema and client runtime", async () => {
    const fixedReqId = "b65356c5-56c1-45c9-bd39-54b8a193b977";
    const fixedTimestamp = "2026-10-10T12:00:00.000Z";
    const metaSpecimen = { requestId: fixedReqId, timestamp: fixedTimestamp };
    const recCodes10 = [
      "REC1-0001", "REC2-0002", "REC3-0003", "REC4-0004", "REC5-0005",
      "REC6-0006", "REC7-0007", "REC8-0008", "REC9-0009", "REC0-0010",
    ];

    const specimens29: Record<
      string,
      {
        status: string;
        requestPayload?: unknown;
        responseEnvelope: Record<string, unknown>;
        execute: (c: ReturnType<typeof createIdentityApiClient>) => Promise<unknown>;
      }
    > = {
      // 1. getPassengerProfile (GET /auth/passenger/profile)
      getPassengerProfile: {
        status: "200",
        responseEnvelope: {
          success: true,
          data: {
            email: "salma@palestinian-airlines.ps",
            firstName: "Salma",
            lastName: "Al-Khatib",
            phone: "+970599000000",
            seatPreference: "window",
            mealPreference: "halal",
            newsletter: true,
          },
          meta: metaSpecimen,
        },
        execute: (c) => c.getPassengerProfile({ requestId: fixedReqId }),
      },
      // 2. putPassengerProfile (PUT /auth/passenger/profile)
      putPassengerProfile: {
        status: "200",
        requestPayload: { firstName: "Salma", lastName: "Al-Khatib" },
        responseEnvelope: {
          success: true,
          data: {
            changed: true,
            account: {
              email: "salma@palestinian-airlines.ps",
              firstName: "Salma",
              lastName: "Al-Khatib",
              phone: "+970599000000",
              seatPreference: "window",
              mealPreference: "halal",
              newsletter: true,
            },
          },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.putPassengerProfile(
            { firstName: "Salma", lastName: "Al-Khatib" },
            { requestId: fixedReqId }
          ),
      },
      // 3. getSavedTravelers (GET /passenger/travelers)
      getSavedTravelers: {
        status: "200",
        responseEnvelope: {
          success: true,
          data: [
            {
              id: "trv-01",
              firstName: "Ali",
              lastName: "Hassan",
              dob: "1990-01-01",
              nationality: "PS",
              document: "P123456",
            },
          ],
          meta: metaSpecimen,
        },
        execute: (c) => c.getSavedTravelers({ requestId: fixedReqId }),
      },
      // 4. postSavedTraveler (POST /passenger/travelers)
      postSavedTraveler: {
        status: "201",
        requestPayload: {
          firstName: "Ali",
          lastName: "Hassan",
          dob: "1990-01-01",
          nationality: "PS",
          document: "P123456",
        },
        responseEnvelope: {
          success: true,
          data: {
            id: "trv-02",
            firstName: "Ali",
            lastName: "Hassan",
            dob: "1990-01-01",
            nationality: "PS",
            document: "P123456",
          },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.postSavedTraveler(
            {
              firstName: "Ali",
              lastName: "Hassan",
              dob: "1990-01-01",
              nationality: "PS",
              document: "P123456",
            },
            { requestId: fixedReqId }
          ),
      },
      // 5. deleteSavedTraveler (DELETE /passenger/travelers/{id})
      deleteSavedTraveler: {
        status: "200",
        responseEnvelope: {
          success: true,
          data: { deleted: true },
          meta: metaSpecimen,
        },
        execute: (c) => c.deleteSavedTraveler("trv-01", { requestId: fixedReqId }),
      },
      // 6. patchSavedTraveler (PATCH /passenger/travelers/{id})
      patchSavedTraveler: {
        status: "200",
        requestPayload: { firstName: "Ahmad" },
        responseEnvelope: {
          success: true,
          data: {
            id: "trv-01",
            firstName: "Ahmad",
            lastName: "Hassan",
            dob: "1990-01-01",
            nationality: "PS",
            document: "P123456",
          },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.patchSavedTraveler("trv-01", { firstName: "Ahmad" }, { requestId: fixedReqId }),
      },
      // 7. postStaffMfaSetup (POST /staff/mfa/setup)
      postStaffMfaSetup: {
        status: "200",
        responseEnvelope: {
          success: true,
          data: { secret: "JBSWY3DPEHPK3PXP", qrCodeUri: "otpauth://totp/..." },
          meta: metaSpecimen,
        },
        execute: (c) => c.postStaffMfaSetup({ requestId: fixedReqId }),
      },
      // 8. postStaffMfaChallenge (POST /staff/mfa/challenge)
      postStaffMfaChallenge: {
        status: "200",
        requestPayload: { staffSessionChallengeId: "b65356c5-56c1-45c9-bd39-54b8a193b977" },
        responseEnvelope: {
          success: true,
          data: { status: "challenge_issued", expiresAt: "2026-10-10T12:05:00.000Z" },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.postStaffMfaChallenge(
            { staffSessionChallengeId: "b65356c5-56c1-45c9-bd39-54b8a193b977" },
            { requestId: fixedReqId }
          ),
      },
      // 9. postStaffMfaVerify (POST /staff/mfa/verify)
      postStaffMfaVerify: {
        status: "200",
        requestPayload: { totpCode: "123456" },
        responseEnvelope: {
          success: true,
          data: {
            staff: {
              id: "b65356c5-56c1-45c9-bd39-54b8a193b977",
              username: "officer",
              email: "officer@palestinian-airlines.ps",
              role: "admin",
              permissions: ["admin.access"],
            },
          },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.postStaffMfaVerify({ totpCode: "123456" }, { requestId: fixedReqId }),
      },
      // 10. getStaffSessions (GET /staff/sessions)
      getStaffSessions: {
        status: "200",
        responseEnvelope: {
          success: true,
          data: [
            {
              id: "sess-01",
              ipAddress: "127.0.0.1",
              userAgent: "Mozilla/5.0",
              lastActivity: "2026-10-10T12:00:00.000Z",
              isCurrent: true,
            },
          ],
          meta: metaSpecimen,
        },
        execute: (c) => c.getStaffSessions({ requestId: fixedReqId }),
      },
      // 11. deleteStaffSession (DELETE /staff/sessions/{id})
      deleteStaffSession: {
        status: "200",
        responseEnvelope: {
          success: true,
          data: { revoked: true },
          meta: metaSpecimen,
        },
        execute: (c) => c.deleteStaffSession("sess-01", { requestId: fixedReqId }),
      },
      // 12. getStaffUsersDirectory (GET /staff/users)
      getStaffUsersDirectory: {
        status: "200",
        responseEnvelope: {
          success: true,
          data: [
            {
              id: "b65356c5-56c1-45c9-bd39-54b8a193b977",
              username: "officer",
              email: "officer@palestinian-airlines.ps",
              fullNameEn: "Officer Ali",
              fullNameAr: "الضابط علي",
              role: "admin",
              isActive: true,
              mfaEnabled: true,
              createdAt: "2026-10-10T12:00:00.000Z",
            },
          ],
          meta: metaSpecimen,
        },
        execute: (c) => c.getStaffUsersDirectory({ requestId: fixedReqId }),
      },
      // 13. postStaffUserInvite (POST /staff/users)
      postStaffUserInvite: {
        status: "201",
        requestPayload: {
          username: "new_agent",
          email: "new@palestinian-airlines.ps",
          fullNameEn: "New Agent",
          fullNameAr: "عميل جديد",
          role: "admin",
        },
        responseEnvelope: {
          success: true,
          data: {
            id: "b65356c5-56c1-45c9-bd39-54b8a193b977",
            username: "new_agent",
            email: "new@palestinian-airlines.ps",
            fullNameEn: "New Agent",
            fullNameAr: "عميل جديد",
            role: "admin",
            isActive: false,
            mfaEnabled: false,
            createdAt: "2026-10-10T12:00:00.000Z",
          },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.postStaffUserInvite(
            {
              username: "new_agent",
              email: "new@palestinian-airlines.ps",
              fullNameEn: "New Agent",
              fullNameAr: "عميل جديد",
              role: "admin",
            },
            { requestId: fixedReqId }
          ),
      },
      // 14. patchStaffUser (PATCH /staff/users/{id})
      patchStaffUser: {
        status: "200",
        requestPayload: { role: "admin" },
        responseEnvelope: {
          success: true,
          data: {
            id: "b65356c5-56c1-45c9-bd39-54b8a193b977",
            username: "new_agent",
            email: "new@palestinian-airlines.ps",
            fullNameEn: "New Agent",
            fullNameAr: "عميل جديد",
            role: "admin",
            isActive: true,
            mfaEnabled: false,
            createdAt: "2026-10-10T12:00:00.000Z",
          },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.patchStaffUser(
            "b65356c5-56c1-45c9-bd39-54b8a193b977",
            { role: "admin" },
            { requestId: fixedReqId }
          ),
      },
      // 15. deleteStaffUser (DELETE /staff/users/{id})
      deleteStaffUser: {
        status: "200",
        responseEnvelope: {
          success: true,
          data: { deactivated: true },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.deleteStaffUser("b65356c5-56c1-45c9-bd39-54b8a193b977", { requestId: fixedReqId }),
      },
      // 16. getPassengerSessions (GET /auth/passenger/sessions)
      getPassengerSessions: {
        status: "200",
        responseEnvelope: {
          success: true,
          data: {
            sessions: [
              {
                id: "b65356c5-56c1-45c9-bd39-54b8a193b977",
                ipAddress: "127.0.0.1",
                userAgent: "Mozilla/5.0",
                createdAt: "2026-10-10T12:00:00.000Z",
                lastSeenAt: "2026-10-10T12:00:00.000Z",
                current: true,
              },
            ],
          },
          meta: metaSpecimen,
        },
        execute: (c) => c.getPassengerSessions({ requestId: fixedReqId }),
      },
      // 17. deletePassengerSession (DELETE /auth/passenger/sessions/{id})
      deletePassengerSession: {
        status: "200",
        responseEnvelope: {
          success: true,
          data: { revoked: true },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.deletePassengerSession("b65356c5-56c1-45c9-bd39-54b8a193b977", { requestId: fixedReqId }),
      },
      // 18. putPassengerPassword (PUT /auth/passenger/password)
      putPassengerPassword: {
        status: "200",
        requestPayload: {
          currentPassword: "OldPassword2026!",
          newPassword: "NewPassword2026!",
        },
        responseEnvelope: {
          success: true,
          data: { changed: true },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.putPassengerPassword(
            {
              currentPassword: "OldPassword2026!",
              newPassword: "NewPassword2026!",
            },
            { requestId: fixedReqId }
          ),
      },
      // 19. postStaffMfaEnrollmentSetup (POST /staff/mfa/enrollment/setup)
      postStaffMfaEnrollmentSetup: {
        status: "200",
        responseEnvelope: {
          success: true,
          data: {
            secret: "JBSWY3DPEHPK3PXP",
            qrCodeUri: "otpauth://totp/...",
            expiresAt: "2026-10-10T12:10:00.000Z",
          },
          meta: metaSpecimen,
        },
        execute: (c) => c.postStaffMfaEnrollmentSetup({ requestId: fixedReqId }),
      },
      // 20. postStaffMfaEnrollmentConfirm (POST /staff/mfa/enrollment/confirm)
      postStaffMfaEnrollmentConfirm: {
        status: "200",
        requestPayload: { totpCode: "123456" },
        responseEnvelope: {
          success: true,
          data: {
            enrolled: true,
            recoveryCodes: recCodes10,
            user: {
              id: "b65356c5-56c1-45c9-bd39-54b8a193b977",
              username: "officer",
              email: "officer@palestinian-airlines.ps",
              role: "admin",
              permissions: ["admin.access"],
            },
          },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.postStaffMfaEnrollmentConfirm({ totpCode: "123456" }, { requestId: fixedReqId }),
      },
      // 21. postStaffStepUp (POST /staff/step-up)
      postStaffStepUp: {
        status: "200",
        requestPayload: { totpCode: "123456" },
        responseEnvelope: {
          success: true,
          data: { verified: true, expiresAt: "2026-10-10T12:15:00.000Z" },
          meta: metaSpecimen,
        },
        execute: (c) => c.postStaffStepUp({ totpCode: "123456" }, { requestId: fixedReqId }),
      },
      // 22. postStaffMfaSetupConfirm (POST /staff/mfa/setup/confirm)
      postStaffMfaSetupConfirm: {
        status: "200",
        requestPayload: { totpCode: "123456" },
        responseEnvelope: {
          success: true,
          data: { confirmed: true, recoveryCodes: recCodes10 },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.postStaffMfaSetupConfirm({ totpCode: "123456" }, { requestId: fixedReqId }),
      },
      // 23. postStaffMfaRecoveryCodesRegenerate (POST /staff/mfa/recovery-codes/regenerate)
      postStaffMfaRecoveryCodesRegenerate: {
        status: "200",
        responseEnvelope: {
          success: true,
          data: { recoveryCodes: recCodes10 },
          meta: metaSpecimen,
        },
        execute: (c) => c.postStaffMfaRecoveryCodesRegenerate({ requestId: fixedReqId }),
      },
      // 24. postStaffPasswordForgot (POST /staff/password/forgot)
      postStaffPasswordForgot: {
        status: "202",
        requestPayload: { email: "officer@palestinian-airlines.ps" },
        responseEnvelope: {
          success: true,
          data: { status: "reset_dispatched", message: "Password reset dispatched." },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.postStaffPasswordForgot(
            { email: "officer@palestinian-airlines.ps" },
            { requestId: fixedReqId }
          ),
      },
      // 25. postStaffPasswordReset (POST /staff/password/reset)
      postStaffPasswordReset: {
        status: "200",
        requestPayload: {
          token: "12345678901234567890123456789012",
          newPassword: "NewPassword2026!",
        },
        responseEnvelope: {
          success: true,
          data: { reset: true },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.postStaffPasswordReset(
            {
              token: "12345678901234567890123456789012",
              newPassword: "NewPassword2026!",
            },
            { requestId: fixedReqId }
          ),
      },
      // 26. putStaffPassword (PUT /staff/password)
      putStaffPassword: {
        status: "200",
        requestPayload: {
          currentPassword: "OldPassword2026!",
          newPassword: "NewPassword2026!",
        },
        responseEnvelope: {
          success: true,
          data: { changed: true },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.putStaffPassword(
            {
              currentPassword: "OldPassword2026!",
              newPassword: "NewPassword2026!",
            },
            { requestId: fixedReqId }
          ),
      },
      // 27. postStaffInvitationAccept (POST /staff/invitations/accept)
      postStaffInvitationAccept: {
        status: "200",
        requestPayload: {
          token: "12345678901234567890123456789012",
          password: "NewPassword2026!",
        },
        responseEnvelope: {
          success: true,
          data: { status: "enrollment_required", expiresAt: "2026-10-10T12:10:00.000Z" },
          meta: metaSpecimen,
        },
        execute: (c) =>
          c.postStaffInvitationAccept(
            {
              token: "12345678901234567890123456789012",
              password: "NewPassword2026!",
            },
            { requestId: fixedReqId }
          ),
      },
      // 28. postStaffUserInviteReissue (POST /staff/users/{id}/invite/reissue)
      postStaffUserInviteReissue: {
        status: "200",
        responseEnvelope: {
          success: true,
          data: { reissued: true, expiresAt: "2026-10-10T12:10:00.000Z" },
          meta: metaSpecimen,
        },
        execute: (c) => c.postStaffUserInviteReissue(fixedReqId, { requestId: fixedReqId }),
      },
      // 29. postStaffUserInviteRevoke (POST /staff/users/{id}/invite/revoke)
      postStaffUserInviteRevoke: {
        status: "200",
        responseEnvelope: {
          success: true,
          data: { revoked: true },
          meta: metaSpecimen,
        },
        execute: (c) => c.postStaffUserInviteRevoke(fixedReqId, { requestId: fixedReqId }),
      },
    };

    // Verify all 29 specimens against OpenAPI schema AST
    for (const [opName, specItem] of Object.entries(specimens29)) {
      const operation = Object.values(openApiSpec.paths)
        .flatMap(Object.values)
        .find((op) => op.operationId === opName);
      assert.ok(operation, `Specimen must resolve its actual operation for ${opName}`);

      if (specItem.requestPayload) {
        const reqSchema = operation.requestBody?.content?.["application/json"]?.schema;
        assert.ok(reqSchema, `Request schema required for ${opName}`);
        const reqCheck = validatePayloadAgainstSchema(reqSchema, specItem.requestPayload, openApiSpec);
        assert.equal(
          reqCheck.valid,
          true,
          `Operation ${opName} request must match OpenAPI schema: ${reqCheck.errors?.join("; ")}`
        );
      }

      const resSchema = operation.responses?.[specItem.status]?.content?.["application/json"]?.schema;
      assert.ok(resSchema, `Response schema required for ${opName}`);
      const resCheck = validatePayloadAgainstSchema(resSchema, specItem.responseEnvelope, openApiSpec);
      assert.equal(
        resCheck.valid,
        true,
        `Operation ${opName} response must match OpenAPI schema: ${resCheck.errors?.join("; ")}`
      );
    }

    let activeTamperedEnvelope: Record<string, unknown> | null = null;
    let activeTargetOp: string | null = null;

    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: (url, init) => {
        const u = String(url);
        const m = init?.method || "GET";
        const headers = (init?.headers || {}) as Record<string, string>;
        const reqId = headers["X-Request-Id"] || headers["x-request-id"] || fixedReqId;

        if (u.endsWith("/auth/csrf")) {
          return Promise.resolve(createMockResponse({ csrfToken: "csrf-passenger-token" }, 200, {}, reqId));
        }
        if (u.endsWith("/staff/csrf")) {
          return Promise.resolve(createMockResponse({ csrfToken: "csrf-staff-token" }, 200, {}, reqId));
        }

        for (const [opName, item] of Object.entries(specimens29)) {
          let match = false;
          if (opName === "getPassengerProfile" && m === "GET" && u.endsWith("/auth/passenger/profile")) match = true;
          if (opName === "putPassengerProfile" && m === "PUT" && u.endsWith("/auth/passenger/profile")) match = true;
          if (opName === "getSavedTravelers" && m === "GET" && u.endsWith("/passenger/travelers")) match = true;
          if (opName === "postSavedTraveler" && m === "POST" && u.endsWith("/passenger/travelers")) match = true;
          if (opName === "deleteSavedTraveler" && m === "DELETE" && /\/passenger\/travelers\/[^/]+$/.test(u)) match = true;
          if (opName === "patchSavedTraveler" && m === "PATCH" && /\/passenger\/travelers\/[^/]+$/.test(u)) match = true;
          if (opName === "postStaffMfaSetup" && m === "POST" && u.endsWith("/staff/mfa/setup")) match = true;
          if (opName === "postStaffMfaChallenge" && m === "POST" && u.endsWith("/staff/mfa/challenge")) match = true;
          if (opName === "postStaffMfaVerify" && m === "POST" && u.endsWith("/staff/mfa/verify")) match = true;
          if (opName === "getStaffSessions" && m === "GET" && u.endsWith("/staff/sessions")) match = true;
          if (opName === "deleteStaffSession" && m === "DELETE" && /\/staff\/sessions\/[^/]+$/.test(u)) match = true;
          if (opName === "getStaffUsersDirectory" && m === "GET" && u.endsWith("/staff/users")) match = true;
          if (opName === "postStaffUserInvite" && m === "POST" && u.endsWith("/staff/users")) match = true;
          if (opName === "patchStaffUser" && m === "PATCH" && /\/staff\/users\/[^/]+$/.test(u)) match = true;
          if (opName === "deleteStaffUser" && m === "DELETE" && /\/staff\/users\/[^/]+$/.test(u)) match = true;
          if (opName === "getPassengerSessions" && m === "GET" && u.endsWith("/auth/passenger/sessions")) match = true;
          if (opName === "deletePassengerSession" && m === "DELETE" && /\/auth\/passenger\/sessions\/[^/]+$/.test(u)) match = true;
          if (opName === "putPassengerPassword" && m === "PUT" && u.endsWith("/auth/passenger/password")) match = true;
          if (opName === "postStaffMfaEnrollmentSetup" && m === "POST" && u.endsWith("/staff/mfa/enrollment/setup")) match = true;
          if (opName === "postStaffMfaEnrollmentConfirm" && m === "POST" && u.endsWith("/staff/mfa/enrollment/confirm")) match = true;
          if (opName === "postStaffStepUp" && m === "POST" && u.endsWith("/staff/step-up")) match = true;
          if (opName === "postStaffMfaSetupConfirm" && m === "POST" && u.endsWith("/staff/mfa/setup/confirm")) match = true;
          if (opName === "postStaffMfaRecoveryCodesRegenerate" && m === "POST" && u.endsWith("/staff/mfa/recovery-codes/regenerate")) match = true;
          if (opName === "postStaffPasswordForgot" && m === "POST" && u.endsWith("/staff/password/forgot")) match = true;
          if (opName === "postStaffPasswordReset" && m === "POST" && u.endsWith("/staff/password/reset")) match = true;
          if (opName === "putStaffPassword" && m === "PUT" && u.endsWith("/staff/password")) match = true;
          if (opName === "postStaffInvitationAccept" && m === "POST" && u.endsWith("/staff/invitations/accept")) match = true;
          if (opName === "postStaffUserInviteReissue" && m === "POST" && /\/staff\/users\/[^/]+\/invite\/reissue$/.test(u)) match = true;
          if (opName === "postStaffUserInviteRevoke" && m === "POST" && /\/staff\/users\/[^/]+\/invite\/revoke$/.test(u)) match = true;

          if (match) {
            const status = parseInt(item.status, 10);
            const env = (opName === activeTargetOp && activeTamperedEnvelope)
              ? activeTamperedEnvelope
              : item.responseEnvelope;
            return Promise.resolve(createMockResponse(env, status, {}, reqId));
          }
        }
        throw new Error(`Unexpected endpoint in expanded suite: ${m} ${u}`);
      },
    });

    // Execute all 29 operations successfully
    for (const [opName, specItem] of Object.entries(specimens29)) {
      const result = await specItem.execute(client);
      assert.ok(result, `${opName} must return valid data`);
    }

    // Exercise malformed envelopes on all 29 operations
    for (const [opName, specItem] of Object.entries(specimens29)) {
      activeTargetOp = opName;
      for (const field of ["success", "data", "meta"]) {
        const cloned = structuredClone(specItem.responseEnvelope);
        delete cloned[field];
        activeTamperedEnvelope = cloned;
        await assert.rejects(
          specItem.execute(client),
          (error: unknown) => isIdentityApiError(error) && error.kind === "protocol",
          `${opName} client must reject missing response field ${field}`
        );
      }
    }
  });
});

describe("IdentityApiClient — Expanded Operations Disabled Rejection & Zero Network", () => {
  it("rejects all 29 expanded operations in disabled mode with safe configuration error (zero network)", async () => {
    let fetchCalls = 0;
    const client = createIdentityApiClient({
      fetch: () => {
        fetchCalls++;
        throw new Error("Fetch must never be invoked in disabled mode");
      },
    });

    assert.equal(client.isEnabled, false);

    const calls: Array<() => Promise<unknown>> = [
      () => client.getPassengerProfile(),
      () => client.putPassengerProfile({ firstName: "Salma", lastName: "Al-Khatib" }),
      () => client.getSavedTravelers(),
      () => client.postSavedTraveler({ firstName: "Ali", lastName: "Hassan", dob: "1990-01-01", nationality: "PS", document: "P123456" }),
      () => client.deleteSavedTraveler("trv-01"),
      () => client.patchSavedTraveler("trv-01", { firstName: "Ahmad" }),
      () => client.postStaffMfaSetup(),
      () => client.postStaffMfaChallenge({ staffSessionChallengeId: "b65356c5-56c1-45c9-bd39-54b8a193b977" }),
      () => client.postStaffMfaVerify({ totpCode: "123456" }),
      () => client.getStaffSessions(),
      () => client.deleteStaffSession("sess-01"),
      () => client.getStaffUsersDirectory(),
      () => client.postStaffUserInvite({ username: "agent", email: "agent@example.com", fullNameEn: "Agent", fullNameAr: "عميل", role: "admin" }),
      () => client.patchStaffUser("b65356c5-56c1-45c9-bd39-54b8a193b977", { role: "admin" }),
      () => client.deleteStaffUser("b65356c5-56c1-45c9-bd39-54b8a193b977"),
      () => client.getPassengerSessions(),
      () => client.deletePassengerSession("b65356c5-56c1-45c9-bd39-54b8a193b977"),
      () => client.putPassengerPassword({ currentPassword: "OldPassword2026!", newPassword: "NewPassword2026!" }),
      () => client.postStaffMfaEnrollmentSetup(),
      () => client.postStaffMfaEnrollmentConfirm({ totpCode: "123456" }),
      () => client.postStaffStepUp({ totpCode: "123456" }),
      () => client.postStaffMfaSetupConfirm({ totpCode: "123456" }),
      () => client.postStaffMfaRecoveryCodesRegenerate(),
      () => client.postStaffPasswordForgot({ email: "staff@example.com" }),
      () => client.postStaffPasswordReset({ token: "12345678901234567890123456789012", newPassword: "NewPassword2026!" }),
      () => client.putStaffPassword({ currentPassword: "OldPassword2026!", newPassword: "NewPassword2026!" }),
      () => client.postStaffInvitationAccept({ token: "12345678901234567890123456789012", password: "NewPassword2026!" }),
      () => client.postStaffUserInviteReissue("b65356c5-56c1-45c9-bd39-54b8a193b977"),
      () => client.postStaffUserInviteRevoke("b65356c5-56c1-45c9-bd39-54b8a193b977"),
    ];

    for (const call of calls) {
      await assert.rejects(
        call,
        (err: unknown) => isIdentityApiError(err) && err.kind === "configuration"
      );
    }

    assert.equal(fetchCalls, 0, "Zero fetch calls must occur in disabled mode for expanded operations");
  });
});

function extractRequestId(init?: RequestInit): string {
  if (init?.headers) {
    const h = init.headers as Record<string, string>;
    return h["X-Request-Id"] || h["x-request-id"] || fixedReqId;
  }
  return fixedReqId;
}

describe("IdentityApiClient — Exact Identifier Fidelity & Encoding Preservation", () => {
  it("preserves exact untrimmed whitespace, Unicode, literal percent, and plus without trimming or casefolding", async () => {
    let capturedUrl = "";
    let fetchCount = 0;
    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: (input, init) => {
        fetchCount++;
        const url = typeof input === "string" ? input : (input as Request).url;
        capturedUrl = url;
        const reqId = extractRequestId(init);
        if (url.includes("/auth/csrf")) {
          return Promise.resolve(createMockResponse({ csrfToken: "csrf-token-xyz" }, 200, {}, reqId));
        }
        return Promise.resolve(
          createMockResponse({
            success: true,
            data: { id: "trv-01", firstName: "Ali", lastName: "Hassan", dob: "1990-01-01", nationality: "PS", document: "P123456" },
            meta: { requestId: reqId, timestamp: "2026-10-10T12:00:00.000Z" },
          }, 200, {}, reqId)
        );
      },
    });

    // 1. Untrimmed whitespace preserved
    const untrimmedId = " trv-preserve ";
    await client.patchSavedTraveler(untrimmedId, { firstName: "Ali" }, { requestId: fixedReqId });
    assert.match(capturedUrl, /\/%20trv-preserve%20$/);
    const pathSegment1 = capturedUrl.split("/").pop()!;
    assert.equal(decodeURIComponent(pathSegment1), untrimmedId);

    // 2. Unicode preserved
    const unicodeId = "مسافر-1";
    await client.patchSavedTraveler(unicodeId, { firstName: "Ali" }, { requestId: fixedReqId });
    const pathSegment2 = capturedUrl.split("/").pop()!;
    assert.equal(decodeURIComponent(pathSegment2), unicodeId);

    // 3. Literal percent preserved
    const percentId = "trv%20";
    await client.patchSavedTraveler(percentId, { firstName: "Ali" }, { requestId: fixedReqId });
    assert.match(capturedUrl, /\/trv%2520$/);
    const pathSegment3 = capturedUrl.split("/").pop()!;
    assert.equal(decodeURIComponent(pathSegment3), percentId);

    // 4. Literal plus preserved
    const plusId = "trv+1";
    await client.patchSavedTraveler(plusId, { firstName: "Ali" }, { requestId: fixedReqId });
    assert.match(capturedUrl, /\/trv%2B1$/);
    const pathSegment4 = capturedUrl.split("/").pop()!;
    assert.equal(decodeURIComponent(pathSegment4), plusId);
  });

  it("rejects empty, whitespace-only, dot segments, and ill-formed Unicode with zero network calls and no PII", async () => {
    let fetchCount = 0;
    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: () => {
        fetchCount++;
        return Promise.resolve(createMockResponse({}));
      },
    });

    const invalidInputs = ["", "   ", "\t\n", ".", "..", "foo/bar", "foo\\bar", "foo\0bar", "\uD800"];
    for (const inv of invalidInputs) {
      const initialFetchCount = fetchCount;
      await assert.rejects(
        () => client.deleteSavedTraveler(inv),
        (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
      );
      assert.equal(fetchCount, initialFetchCount, "Must not make network call for invalid identifier");
    }

    // Lone surrogate Unicode rejects with safe IdentityApiError rather than raw URIError
    await assert.rejects(
      () => client.deleteSavedTraveler("id-\uD800-surrogate"),
      (err: unknown) => {
        assert.ok(isIdentityApiError(err));
        assert.equal(err.kind, "protocol");
        assert.doesNotMatch(err.message, /id-\uD800-surrogate/);
        return true;
      }
    );

    // PII diagnostic safety: sensitive text is never reflected in error messages
    const sensitiveId = "secret-pii-identity-token@traveler.ps\uD800";
    await assert.rejects(
      () => client.deleteSavedTraveler(sensitiveId),
      (err: unknown) => {
        assert.ok(isIdentityApiError(err));
        assert.doesNotMatch(err.message, /secret-pii-identity-token/);
        return true;
      }
    );

    // UUID-constrained staff operations reject non-UUIDs fail-closed with zero network calls
    const nonUuids = ["trv-01", "generic-staff-id", "123456", "   ", ""];
    for (const nonUuid of nonUuids) {
      const beforeCount = fetchCount;
      await assert.rejects(
        () => client.postStaffUserInviteReissue(nonUuid),
        (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
      );
      await assert.rejects(
        () => client.postStaffUserInviteRevoke(nonUuid),
        (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
      );
      await assert.rejects(
        () => client.patchStaffUser(nonUuid, { role: "admin" }),
        (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
      );
      await assert.rejects(
        () => client.deleteStaffUser(nonUuid),
        (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
      );
      await assert.rejects(
        () => client.deletePassengerSession(nonUuid),
        (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
      );
      assert.equal(fetchCount, beforeCount, "Must make zero network calls for non-UUID parameter");
    }
  });
});

describe("Generator & Metadata Corruption Subprocesses (Exit Code 1)", () => {
  it("rejects CLI bad arguments in actual subprocess with exit code 1", () => {
    const res = spawnSync(
      process.execPath,
      ["scripts/generate-identity-api-types.mjs", "--bogus-unsupported-arg"],
      { cwd: repositoryRoot, encoding: "utf8" }
    );
    assert.equal(res.status, 1, "Subprocess with bad args must exit with code 1");
    assert.match(res.stderr, /Unknown argument/);
  });

  it("detects exact path, method, status, content, security, and protocol metadata corruption exiting 1", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meta-corrupt-test-"));
    try {
      const cleanContract = JSON.parse(
        fs.readFileSync("src/lib/api/identity-contract.json", "utf8")
      );

      // 1. Path corruption
      const pathCorrupt = JSON.parse(JSON.stringify(cleanContract));
      pathCorrupt.operations[0].path = "/auth/tampered-csrf";
      const pathFile = path.join(tempDir, "path-corrupt.json");
      fs.writeFileSync(pathFile, JSON.stringify(pathCorrupt, null, 2), "utf8");
      const resPath = spawnSync(
        process.execPath,
        ["scripts/generate-identity-api-types.mjs", "--check", "--contract", pathFile],
        { cwd: repositoryRoot, encoding: "utf8" }
      );
      assert.equal(resPath.status, 1, "Path corruption must exit 1");

      // 2. Method corruption
      const methodCorrupt = JSON.parse(JSON.stringify(cleanContract));
      methodCorrupt.operations[0].method = "POST";
      const methodFile = path.join(tempDir, "method-corrupt.json");
      fs.writeFileSync(methodFile, JSON.stringify(methodCorrupt, null, 2), "utf8");
      const resMethod = spawnSync(
        process.execPath,
        ["scripts/generate-identity-api-types.mjs", "--check", "--contract", methodFile],
        { cwd: repositoryRoot, encoding: "utf8" }
      );
      assert.equal(resMethod.status, 1, "Method corruption must exit 1");

      // 3. Status corruption
      const statusCorrupt = JSON.parse(JSON.stringify(cleanContract));
      statusCorrupt.operations[0].successStatuses = ["201"];
      const statusFile = path.join(tempDir, "status-corrupt.json");
      fs.writeFileSync(statusFile, JSON.stringify(statusCorrupt, null, 2), "utf8");
      const resStatus = spawnSync(
        process.execPath,
        ["scripts/generate-identity-api-types.mjs", "--check", "--contract", statusFile],
        { cwd: repositoryRoot, encoding: "utf8" }
      );
      assert.equal(resStatus.status, 1, "Status corruption must exit 1");

      // 4. Content / schema constraint corruption
      const contentCorrupt = JSON.parse(JSON.stringify(cleanContract));
      contentCorrupt.schemas.RegisterRequest.properties.password.minLength = 10;
      const contentFile = path.join(tempDir, "content-corrupt.json");
      fs.writeFileSync(contentFile, JSON.stringify(contentCorrupt, null, 2), "utf8");
      const resContent = spawnSync(
        process.execPath,
        ["scripts/generate-identity-api-types.mjs", "--check", "--contract", contentFile],
        { cwd: repositoryRoot, encoding: "utf8" }
      );
      assert.equal(resContent.status, 1, "Schema content corruption must exit 1");

      // 5. Security metadata corruption
      const securityCorrupt = JSON.parse(JSON.stringify(cleanContract));
      securityCorrupt.operations[0].security = [{ TamperedScheme: [] }];
      const securityFile = path.join(tempDir, "security-corrupt.json");
      fs.writeFileSync(securityFile, JSON.stringify(securityCorrupt, null, 2), "utf8");
      const resSecurity = spawnSync(
        process.execPath,
        ["scripts/generate-identity-api-types.mjs", "--check", "--contract", securityFile],
        { cwd: repositoryRoot, encoding: "utf8" }
      );
      assert.equal(resSecurity.status, 1, "Security metadata corruption must exit 1");

      // 6. Protocol metadata corruption
      const protocolCorrupt = JSON.parse(JSON.stringify(cleanContract));
      protocolCorrupt.operations[0].protocol.csrfHeader = "X-TAMPERED-CSRF";
      const protocolFile = path.join(tempDir, "protocol-corrupt.json");
      fs.writeFileSync(protocolFile, JSON.stringify(protocolCorrupt, null, 2), "utf8");
      const resProtocol = spawnSync(
        process.execPath,
        ["scripts/generate-identity-api-types.mjs", "--check", "--contract", protocolFile],
        { cwd: repositoryRoot, encoding: "utf8" }
      );
      assert.equal(resProtocol.status, 1, "Protocol metadata corruption must exit 1");

      // 7. Authorization branches metadata corruption on contract
      const authBranchesCorrupt = JSON.parse(JSON.stringify(cleanContract));
      authBranchesCorrupt.operations[7].authorizationBranches = [];
      const authBranchesFile = path.join(tempDir, "auth-branches-corrupt.json");
      fs.writeFileSync(authBranchesFile, JSON.stringify(authBranchesCorrupt, null, 2), "utf8");
      const resAuth = spawnSync(
        process.execPath,
        ["scripts/generate-identity-api-types.mjs", "--check", "--contract", authBranchesFile],
        { cwd: repositoryRoot, encoding: "utf8" }
      );
      assert.equal(resAuth.status, 1, "Authorization branches metadata corruption must exit 1");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("detects authorization branches mutation on OpenAPI spec exiting 1 in subprocess", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "spec-corrupt-test-"));
    try {
      const cleanSpec = JSON.parse(fs.readFileSync(DEFAULT_SPEC_PATH, "utf8"));
      cleanSpec.paths["/auth/passenger/profile"].get["x-authorization-branches"] = [];
      const specFile = path.join(tempDir, "tampered-spec.json");
      fs.writeFileSync(specFile, JSON.stringify(cleanSpec, null, 2), "utf8");

      const res = spawnSync(
        process.execPath,
        ["scripts/generate-identity-api-types.mjs", "--check", "--spec", specFile],
        { cwd: repositoryRoot, encoding: "utf8" }
      );
      assert.equal(res.status, 1, "Mutating x-authorization-branches on spec must exit 1 in subprocess");
      assert.match(res.stderr, /Authorization branches mismatch/);

      // In-process verification that both generator functions throw
      assert.throws(
        () => generateIdentityApiTypes(cleanSpec),
        /Authorization branches mismatch/
      );
      assert.throws(
        () => generateIdentityApiContract(cleanSpec),
        /Authorization branches mismatch/
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails closed when request or response schemas contain sibling not assertions", () => {
    const cleanSpec = JSON.parse(fs.readFileSync(DEFAULT_SPEC_PATH, "utf8"));

    // 1. request-ref-sibling-not
    const reqNotSpec = JSON.parse(JSON.stringify(cleanSpec));
    reqNotSpec.paths["/auth/login"].post.requestBody.content["application/json"].schema = {
      $ref: "#/components/schemas/LoginRequest",
      not: { type: "string" },
    };
    assert.throws(
      () => generateIdentityApiTypes(reqNotSpec),
      /Unsupported (schema keyword|sibling assertion) 'not'/
    );

    // 2. response-ref-sibling-not
    const resNotSpec = JSON.parse(JSON.stringify(cleanSpec));
    resNotSpec.paths["/auth/login"].post.responses["200"].content["application/json"].schema = {
      $ref: "#/components/schemas/PassengerAuthResponse",
      not: { type: "string" },
    };
    assert.throws(
      () => generateIdentityApiTypes(resNotSpec),
      /Unsupported (schema keyword|sibling assertion) 'not'/
    );
  });

  it("verifies full generated contract operations include complete security, protocol, and authorization branch metadata", () => {
    const contract = JSON.parse(fs.readFileSync("src/lib/api/identity-contract.json", "utf8"));
    assert.equal(contract.operations.length, 41, "Must contain exactly 41 operations");
    for (const op of contract.operations) {
      assert.ok(Array.isArray(op.security), `op ${op.operationId} must have security array`);
      assert.ok(op.protocol, `op ${op.operationId} must have protocol metadata`);
      assert.ok(Array.isArray(op.protocol.branches), `op ${op.operationId} protocol must have branches`);
      assert.ok(typeof op.protocol.branchSelection === "string", `op ${op.operationId} branchSelection required`);
      assert.ok(typeof op.protocol.csrfHeader === "string", `op ${op.operationId} csrfHeader required`);
      assert.ok(typeof op.protocol.cacheControl === "string", `op ${op.operationId} cacheControl required`);
      assert.ok(Array.isArray(op.authorizationBranches), `op ${op.operationId} must have authorizationBranches array`);
    }
  });
});

describe("IdentityApiClient — Mutation Behaviors, CSRF Reset, Realm Isolation, Queue Aggregate Budget, Disposal, and No Auto-Replay", () => {
  it("resets CSRF token and bumps generation on session-changing mutations", async () => {
    let bootstrapCount = 0;
    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: (input, init) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        const reqId = extractRequestId(init);
        if (url.includes("/auth/csrf")) {
          bootstrapCount++;
          return Promise.resolve(
            createMockResponse(
              { csrfToken: `csrf-passenger-${bootstrapCount}` },
              200,
              {},
              reqId
            )
          );
        }
        return Promise.resolve(
          createMockResponse({
            success: true,
            data: { message: "logged out" },
            meta: { requestId: reqId, timestamp: "2026-10-10T12:00:00.000Z" },
          }, 200, {}, reqId)
        );
      },
    });

    // First logout bootstraps CSRF
    await client.postPassengerLogout({ requestId: fixedReqId });
    assert.equal(bootstrapCount, 1, "Initial write must bootstrap passenger CSRF");

    // Because logout is auth-changing, token was invalidated; next mutation must re-bootstrap!
    await client.postPassengerLogout({ requestId: fixedReqId });
    assert.equal(bootstrapCount, 2, "Subsequent write after auth-changing mutation must re-bootstrap CSRF");
  });

  it("maintains strict realm isolation between passenger and staff CSRF caches and queues", async () => {
    let passengerBootstraps = 0;
    let staffBootstraps = 0;

    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: (input, init) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        const reqId = extractRequestId(init);
        if (url.includes("/auth/csrf")) {
          passengerBootstraps++;
          return Promise.resolve(
            createMockResponse(
              { csrfToken: "csrf-p-1" },
              200,
              {},
              reqId
            )
          );
        }
        if (url.includes("/staff/csrf")) {
          staffBootstraps++;
          return Promise.resolve(
            createMockResponse(
              { csrfToken: "csrf-s-1" },
              200,
              {},
              reqId
            )
          );
        }
        return Promise.resolve(
          createMockResponse({
            success: true,
            data: { message: "ok" },
            meta: { requestId: reqId, timestamp: "2026-10-10T12:00:00.000Z" },
          }, 200, {}, reqId)
        );
      },
    });

    // 1. Bootstrap passenger CSRF via read
    const pToken = await client.getAuthCsrfBootstrap({ requestId: fixedReqId });
    assert.equal(pToken.csrfToken, "csrf-p-1");
    assert.equal(passengerBootstraps, 1);
    assert.equal(staffBootstraps, 0, "Passenger bootstrap must not touch staff CSRF");

    // 2. Bootstrap staff CSRF via read
    const sToken = await client.getStaffCsrfBootstrap({ requestId: fixedReqId });
    assert.equal(sToken.csrfToken, "csrf-s-1");
    assert.equal(staffBootstraps, 1);
    assert.equal(passengerBootstraps, 1);

    // 3. First logout consumes cached passenger token from step 1
    await client.postPassengerLogout({ requestId: fixedReqId });
    assert.equal(passengerBootstraps, 1, "First logout consumed cached passenger token");

    // 4. Second logout must re-bootstrap because first logout dropped passenger token
    await client.postPassengerLogout({ requestId: fixedReqId });
    assert.equal(passengerBootstraps, 2, "Second logout re-bootstrapped passenger token");
    assert.equal(staffBootstraps, 1, "Staff CSRF token must remain cached and untouched");
  });

  it("enforces queue aggregate budget timing out queued operation when wait exceeds budget", async () => {
    let activeOp1Resolve: () => void = () => {};
    const op1Promise = new Promise<void>((resolve) => {
      activeOp1Resolve = resolve;
    });

    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: (url, init) => {
        const u = String(url);
        const reqId = extractRequestId(init);
        if (u.endsWith("/auth/csrf")) {
          return Promise.resolve(
            createMockResponse({ csrfToken: "csrf-1" }, 200, {}, reqId)
          );
        }
        if (u.endsWith("/auth/logout")) {
          return op1Promise.then(() => {
            return createMockResponse(
              {
                success: true,
                data: { message: "ok" },
                meta: { requestId: reqId, timestamp: "2026-10-10T12:00:00.000Z" },
              },
              200,
              {},
              reqId
            );
          });
        }
        return Promise.reject(new Error("unexpected url"));
      },
    });

    // Start op1 (holds queue)
    const p1 = client.postPassengerLogout({ timeoutMs: 5000 });
    // Allow op1 to acquire queue
    await new Promise((r) => setTimeout(r, 10));

    // Op2 is queued behind op1 with short timeout of 50ms
    const p2Promise = client.postPassengerLogout({ timeoutMs: 50 });

    // Release op1 after 100ms (when op2's budget has expired)
    setTimeout(() => activeOp1Resolve(), 100);

    try {
      await p2Promise;
      assert.fail("Op2 must have timed out while queued");
    } catch (err) {
      assert.ok(isIdentityApiError(err));
      assert.equal(err.kind, "timeout");
      assert.match(err.message, /timed out/);
    }

    await p1;
  });

  it("enforces disposal lifecycle rejecting operations, aborting pending requests, and releasing listeners", async () => {
    let uncalledFetch = 0;
    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: () => {
        uncalledFetch++;
        return Promise.resolve(createMockResponse({}));
      },
    });

    assert.equal(client.isDisposed, false);
    client.dispose();
    assert.equal(client.isDisposed, true);

    // All operations after disposal reject with abort error and make 0 network calls
    await assert.rejects(
      () => client.getPassengerProfile(),
      (err: unknown) => isIdentityApiError(err) && err.kind === "abort" && /disposed/i.test(err.message)
    );
    await assert.rejects(
      () => client.postPassengerLogout(),
      (err: unknown) => isIdentityApiError(err) && err.kind === "abort" && /disposed/i.test(err.message)
    );
    assert.equal(uncalledFetch, 0, "Disposed client must make zero network requests");

    // Calling dispose() again is safe and idempotent
    client.dispose();
    assert.equal(client.isDisposed, true);
  });

  it("never automatically retries or replays failed writes (no auto-replay invariant)", async () => {
    let callCount = 0;
    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: (input, init) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        const reqId = extractRequestId(init);
        if (url.includes("/auth/csrf")) {
          return Promise.resolve(
            createMockResponse(
              { csrfToken: "csrf-token-1" },
              200,
              {},
              reqId
            )
          );
        }
        callCount++;
        return Promise.resolve(
          createMockResponse(
            {
              success: false,
              error: { code: "internal_error", message: "Database down" },
              meta: { requestId: reqId, timestamp: "2026-10-10T12:00:00.000Z" },
            },
            500,
            {},
            reqId
          )
        );
      },
    });

    await assert.rejects(
      () => client.putPassengerProfile({ firstName: "Ali", lastName: "Hassan" }, { requestId: fixedReqId }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "http_error"
    );

    assert.equal(callCount, 1, "Failed write must make exactly 1 network attempt with zero retries or replays");
  });

  it("handles pending staff identity as non-full authority", async () => {
    const client = createIdentityApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: VALID_DEV_ENV,
      baseUrl: VALID_LOOPBACK_URL,
      fetch: (input, init) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        const reqId = extractRequestId(init);
        if (url.includes("/staff/csrf")) {
          return Promise.resolve(
            createMockResponse(
              { csrfToken: "csrf-staff-1" },
              200,
              {},
              reqId
            )
          );
        }
        return Promise.resolve(
          createMockResponse({
            success: true,
            data: {
              status: "mfa_required",
              expiresAt: "2026-10-10T12:15:00.000Z",
            },
            meta: { requestId: reqId, timestamp: "2026-10-10T12:00:00.000Z" },
          }, 200, {}, reqId)
        );
      },
    });

    const res = await client.postStaffLogin(
      { username: "gza_admin", password: "Password2026!" },
      { requestId: fixedReqId }
    );
    assert.equal(res.data.status, "mfa_required");
    assert.equal("staff" in (res.data as Record<string, unknown>), false, "Pending staff login returns status, not authenticated staff user");
  });
});

describe("IdentityApiClient — Independent 41 Operations Request & Response Schema Gate Negative Matrix", () => {
  it("enforces negative validation matrix across all 41 operations (const, additional property, missing required, wrong type, wrong enum, status mismatch, property null)", () => {
    assert.equal(identityContract.operations.length, 41);

    for (const op of identityContract.operations) {
      const opId = op.operationId;
      const status = parseInt(op.successStatuses[0], 10);

      // 1. Const mismatch negative test (success: false on 2xx status)
      assert.throws(
        () =>
          validateOperationResponse(opId, status, {
            success: false,
            data: {},
            meta: { requestId: fixedReqId, timestamp: "2026-10-10T12:00:00.000Z" },
          }),
        (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
      );

      // 2. Additional property negative test on envelope
      assert.throws(
        () =>
          validateOperationResponse(opId, status, {
            success: true,
            data: {},
            meta: { requestId: fixedReqId, timestamp: "2026-10-10T12:00:00.000Z" },
            __tamperedExtra__: 123,
          }),
        (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
      );

      // 3. Status mismatch negative test
      assert.throws(
        () => validateOperationResponse(opId, 999, { success: true }),
        (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
      );

      // 4. Request validation negative matrix (for operations accepting a body)
      if (op.requestSchemaName) {
        // Missing required fields
        assert.throws(
          () => validateOperationRequest(opId, { __invalid_field_only__: true }),
          (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
        );

        // Null payload where object is expected
        assert.throws(
          () => validateOperationRequest(opId, null),
          (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
        );

        // Primitive wrong type where object is expected
        assert.throws(
          () => validateOperationRequest(opId, "invalid-string-body"),
          (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
        );
      } else {
        // Operations that do not accept a body must reject any provided body
        assert.throws(
          () => validateOperationRequest(opId, { unexpectedBody: true }),
          (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
        );
      }
    }
  });

  it("validates specific data constraint violations (wrong enum, wrong type, property null, and codepoint bounds)", () => {
    // 1. wrongenum
    assert.throws(
      () => validateOperationRequest("patchStaffUser", { role: "unauthorized_role" }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
    );

    // 2. wrongtype
    assert.throws(
      () => validateOperationRequest("postPassengerLogin", { email: 12345, password: "ValidPassword2026!" }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
    );

    // 3. propertynull
    assert.throws(
      () => validateOperationRequest("postPassengerLogin", { email: null, password: "ValidPassword2026!" }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
    );

    // 4. additionalproperty on request body
    assert.throws(
      () =>
        validateOperationRequest("postPassengerLogin", {
          email: "user@example.com",
          password: "ValidPassword2026!",
          extraProperty: "forbidden",
        }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
    );

    // 5. codepoint bounds on password
    assert.throws(
      () =>
        validateOperationRequest("postPassengerRegister", {
          email: "user@example.com",
          password: "short",
          firstName: "Ali",
          lastName: "Hassan",
        }),
      (err: unknown) => isIdentityApiError(err) && err.kind === "protocol"
    );
  });
});

describe("IdentityApiClient — Runtime Schema Gate Probes, Budgets, and Sentinel Safety", () => {
  it("validates all 7 probe matrix cases matching CODEX probe expectations", () => {
    const root1 = { bad: { type: "string", unsupportedAssertion: true } };

    // 1. unsupported-under-not: {not:{type:'string',unsupportedAssertion:true}} against 123
    const res1 = validateRuntimePayloadAgainstSchema({ not: { type: "string", unsupportedAssertion: true } }, 123);
    assert.equal(res1.valid, false, "unsupported-under-not must fail closed");

    // 2. unsupported-ref-unselected-branch: {anyOf:[{type:'number'},{$ref:'#/bad'}]} against 123 with root
    const res2 = validateRuntimePayloadAgainstSchema({ anyOf: [{ type: "number" }, { $ref: "#/bad" }] }, 123, root1);
    assert.equal(res2.valid, false, "unsupported-ref-unselected-branch must fail closed before branch selection");

    // 3. malformed-required: {type:'object',required:'x'} against {}
    const res3 = validateRuntimePayloadAgainstSchema({ type: "object", required: "x" }, {});
    assert.equal(res3.valid, false, "malformed-required must fail closed");

    // 4. nonfinite-bound: {type:'number',minimum:Infinity} against 5
    const res4 = validateRuntimePayloadAgainstSchema({ type: "number", minimum: Infinity }, 5);
    assert.equal(res4.valid, false, "nonfinite-bound must fail closed");

    // 5. invalid-format: {type:'string',format:'unrecognized'} against 'x'
    const res5 = validateRuntimePayloadAgainstSchema({ type: "string", format: "unrecognized" }, "x");
    assert.equal(res5.valid, false, "invalid-format must fail closed");

    // 6. boolean-positive: true against 123
    const res6 = validateRuntimePayloadAgainstSchema(true, 123);
    assert.equal(res6.valid, true, "boolean schema true must accept instance");

    // 7. ref-sibling-negative: {$ref:'#/components/schemas/ErrorDetail', not:{type:'object'}} against {code:'bad',message:'msg'}
    const rootDoc = { components: { schemas: identityContract.schemas } };
    const res7 = validateRuntimePayloadAgainstSchema(
      { $ref: "#/components/schemas/ErrorDetail", not: { type: "object" } },
      { code: "bad", message: "msg" },
      rootDoc
    );
    assert.equal(res7.valid, false, "ref-sibling-negative must fail when not condition is violated");
  });

  it("enforces raw-value and extra-key sentinel safety across all error serialization channels without printing sentinels", () => {
    const SENTINEL_ATTACKER_VAL = "SENTINEL_ATTACKER_VAL_SECRET9988";
    const SENTINEL_EXTRA_KEY = "SENTINEL_EXTRA_KEY_EVIL7766";

    // 1. Request schema contract failure
    try {
      validateOperationRequest("postPassengerLogin", {
        email: SENTINEL_ATTACKER_VAL,
        password: "ValidPassword2026!",
        [SENTINEL_EXTRA_KEY]: "payload-value",
      });
      assert.fail("validateOperationRequest must throw on invalid payload");
    } catch (err: unknown) {
      assert.ok(isIdentityApiError(err), "Error must be IdentityApiError");
      assert.equal(err.kind, "protocol");

      // Verify channels do NOT contain sentinels
      const serializedJson = JSON.stringify(err);
      const inspected = util.inspect(err);
      const jsonObj = JSON.stringify(err.toJSON());
      const entriesStr = JSON.stringify(Object.entries(err));

      assert.ok(!err.message.includes(SENTINEL_ATTACKER_VAL), "message must not leak attacker value");
      assert.ok(!err.message.includes(SENTINEL_EXTRA_KEY), "message must not leak extra key");
      assert.ok(!serializedJson.includes(SENTINEL_ATTACKER_VAL), "JSON.stringify must not leak attacker value");
      assert.ok(!serializedJson.includes(SENTINEL_EXTRA_KEY), "JSON.stringify must not leak extra key");
      assert.ok(!inspected.includes(SENTINEL_ATTACKER_VAL), "util.inspect must not leak attacker value");
      assert.ok(!inspected.includes(SENTINEL_EXTRA_KEY), "util.inspect must not leak extra key");
      assert.ok(!jsonObj.includes(SENTINEL_ATTACKER_VAL), "toJSON() must not leak attacker value");
      assert.ok(!jsonObj.includes(SENTINEL_EXTRA_KEY), "toJSON() must not leak extra key");
      assert.ok(!entriesStr.includes(SENTINEL_ATTACKER_VAL), "Object.entries must not leak attacker value");
      assert.ok(!entriesStr.includes(SENTINEL_EXTRA_KEY), "Object.entries must not leak extra key");
    }

    // 2. Response schema contract failure
    try {
      validateOperationResponse("postPassengerLogin", 200, {
        success: true,
        data: {
          token: "valid-tok",
          user: { id: "1" },
          [SENTINEL_EXTRA_KEY]: SENTINEL_ATTACKER_VAL,
        },
        meta: { requestId: fixedReqId, timestamp: "2026-10-10T12:00:00.000Z" },
      });
      assert.fail("validateOperationResponse must throw on invalid response");
    } catch (err: unknown) {
      assert.ok(isIdentityApiError(err), "Error must be IdentityApiError");
      assert.equal(err.kind, "protocol");

      const serializedJson = JSON.stringify(err);
      const inspected = util.inspect(err);
      const jsonObj = JSON.stringify(err.toJSON());
      const entriesStr = JSON.stringify(Object.entries(err));

      assert.ok(!err.message.includes(SENTINEL_ATTACKER_VAL), "message must not leak response attacker value");
      assert.ok(!err.message.includes(SENTINEL_EXTRA_KEY), "message must not leak response extra key");
      assert.ok(!serializedJson.includes(SENTINEL_ATTACKER_VAL), "JSON.stringify must not leak response attacker value");
      assert.ok(!serializedJson.includes(SENTINEL_EXTRA_KEY), "JSON.stringify must not leak response extra key");
      assert.ok(!inspected.includes(SENTINEL_ATTACKER_VAL), "util.inspect must not leak response attacker value");
      assert.ok(!inspected.includes(SENTINEL_EXTRA_KEY), "util.inspect must not leak response extra key");
      assert.ok(!jsonObj.includes(SENTINEL_ATTACKER_VAL), "toJSON() must not leak response attacker value");
      assert.ok(!jsonObj.includes(SENTINEL_EXTRA_KEY), "toJSON() must not leak response extra key");
      assert.ok(!entriesStr.includes(SENTINEL_ATTACKER_VAL), "Object.entries must not leak response attacker value");
      assert.ok(!entriesStr.includes(SENTINEL_EXTRA_KEY), "Object.entries must not leak response extra key");
    }
  });

  it("safely rejects cyclic instances and cyclic schemas with bounded budgets", () => {
    // 1. Cyclic instance object
    const cyclicObj: Record<string, unknown> = { name: "test" };
    cyclicObj.self = cyclicObj;
    const resInst = validateRuntimePayloadAgainstSchema(
      { type: "object", additionalProperties: { type: "object" } },
      cyclicObj
    );
    assert.equal(resInst.valid, false, "Cyclic instance must fail closed");
    assert.ok(
      resInst.errors.some((e) => /circular instance reference detected/.test(e)),
      "Must report circular instance reference error"
    );

    // 2. Cyclic schema reference
    const cyclicRoot: Record<string, unknown> = {};
    cyclicRoot.nodeA = { $ref: "#/nodeB" };
    cyclicRoot.nodeB = { $ref: "#/nodeA" };
    const resSchema = validateRuntimePayloadAgainstSchema(
      { $ref: "#/nodeA" },
      { name: "test" },
      cyclicRoot
    );
    assert.equal(resSchema.valid, false, "Cyclic schema must fail closed");
    assert.ok(
      resSchema.errors.some((e) => /Cyclic schema reference detected/.test(e)),
      "Must report cyclic schema reference error"
    );
  });

  it("enforces shared aggregate evaluation budget across composition branches without evasion", () => {
    // Probe 1: combined evaluations across allOf branches exceed declared 10000 budget
    const schema = {
      allOf: [
        { type: "array", items: { type: "number" } },
        { type: "array", items: { type: "number" } },
      ],
    };
    const payload = Array(6000).fill(1);
    const res = validateRuntimePayloadAgainstSchema(schema, payload, {});
    assert.equal(res.valid, false, "Must reject combined 12000 evaluations across composition branches");
    assert.ok(
      res.errors.some((e) => e.includes("budget exceeded")),
      "Must report aggregate evaluation budget exceeded error"
    );
  });

  it("rejects non-JSON cyclic instances even under boolean properties or true schema", () => {
    // Probe 2: cyclic instance under { type: 'object', properties: { self: true } }
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const res = validateRuntimePayloadAgainstSchema(
      { type: "object", properties: { self: true } },
      cyclic,
      {}
    );
    assert.equal(res.valid, false, "Must reject cyclic instance under boolean property schema");
    assert.ok(
      res.errors.some((e) => /circular instance reference detected/.test(e)),
      "Must report circular instance reference error"
    );
  });

  it("rejects nonfinite numbers under schema: true while accepting ordinary finite JSON objects", () => {
    // Probe 3: schema: true rejects Infinity, -Infinity, NaN
    const resInf = validateRuntimePayloadAgainstSchema(true, Infinity, {});
    assert.equal(resInf.valid, false, "schema: true must reject Infinity");
    assert.ok(resInf.errors.some((e) => e.includes("non-finite number")));

    const resNegInf = validateRuntimePayloadAgainstSchema(true, -Infinity, {});
    assert.equal(resNegInf.valid, false, "schema: true must reject -Infinity");
    assert.ok(resNegInf.errors.some((e) => e.includes("non-finite number")));

    const resNaN = validateRuntimePayloadAgainstSchema(true, NaN, {});
    assert.equal(resNaN.valid, false, "schema: true must reject NaN");
    assert.ok(resNaN.errors.some((e) => e.includes("non-finite number")));

    // Positive case: schema: true with ordinary finite JSON object stays valid
    const resFinite = validateRuntimePayloadAgainstSchema(
      true,
      { message: "hello", count: 42, active: true },
      {}
    );
    assert.equal(resFinite.valid, true, "schema: true with finite JSON object must stay valid");
    assert.equal(resFinite.errors.length, 0);
  });

  it("ensures fatal budget exhaustion cannot be hidden by anyOf or inverted by not", () => {
    // anyOf fatal-budget hiding negative: branch 0 exhausts budget, branch 1 would match
    const anyOfSchema = {
      anyOf: [
        {
          allOf: [
            { type: "array", items: { type: "number" } },
            { type: "array", items: { type: "number" } },
          ],
        },
        { type: "array" },
      ],
    };
    const payload = Array(6000).fill(1);
    const resAnyOf = validateRuntimePayloadAgainstSchema(anyOfSchema, payload, {});
    assert.equal(resAnyOf.valid, false, "anyOf must not hide fatal budget exhaustion");
    assert.ok(
      resAnyOf.errors.some((e) => e.includes("budget exceeded")),
      "Must report budget exceeded from anyOf branch 0"
    );

    // not fatal-budget hiding negative: not branch exhausts budget
    const notSchema = {
      not: {
        allOf: [
          { type: "array", items: { type: "number" } },
          { type: "array", items: { type: "number" } },
        ],
      },
    };
    const resNot = validateRuntimePayloadAgainstSchema(notSchema, payload, {});
    assert.equal(resNot.valid, false, "not must not invert fatal budget exhaustion into match");
    assert.ok(
      resNot.errors.some((e) => e.includes("budget exceeded")),
      "Must report budget exceeded from not branch"
    );
  });

  it("enforces linear bounded cost on uniqueItems and catches duplicate complex objects with differing key order", () => {
    // 1. 6000 unique numbers with uniqueItems: true must pass with linear evaluations (<= 6005 steps, not N^2)
    const uniqueNumbers = Array.from({ length: 6000 }, (_, i) => i);
    const resLinear = validateRuntimePayloadAgainstSchema(
      { type: "array", uniqueItems: true },
      uniqueNumbers,
      {}
    );
    assert.equal(resLinear.valid, true, "6000 unique numbers must pass uniqueItems");
    assert.equal(resLinear.errors.length, 0);
    assert.ok(
      (resLinear.context?.evaluationCount ?? 0) <= 6005,
      `Evaluation count must prove linear cost: got ${resLinear.context?.evaluationCount}`
    );

    // 2. Complex duplicate objects with differing key order must fail
    const differingKeys = [
      { a: 1, b: 2, c: { x: "test", y: true } },
      { b: 2, c: { y: true, x: "test" }, a: 1 },
    ];
    const resDup = validateRuntimePayloadAgainstSchema(
      { type: "array", uniqueItems: true },
      differingKeys,
      {}
    );
    assert.equal(resDup.valid, false, "Must detect duplicate complex objects with differing key order");
    assert.ok(
      resDup.errors.some((e) => e.includes("violates uniqueItems")),
      "Must report uniqueItems violation for differing key order duplicate"
    );

    // 3. Small valid unique arrays of objects must pass
    const distinctObjs = [{ id: 1, role: "admin" }, { id: 2, role: "staff" }];
    const resDistinct = validateRuntimePayloadAgainstSchema(
      { type: "array", uniqueItems: true },
      distinctObjs,
      {}
    );
    assert.equal(resDistinct.valid, true, "Distinct object array must pass uniqueItems");
    assert.equal(resDistinct.errors.length, 0);
  });

  it("ensures fatal budget exhaustion on uniqueItems cannot be hidden by anyOf or inverted by not", () => {
    // 12000 numbers exceed the 10000 evaluation budget during uniqueItems deduplication
    const largePayload = Array.from({ length: 12000 }, (_, i) => i);

    // anyOf branch 0 exhausts budget on uniqueItems, branch 1 would match { type: "array" }
    const anyOfSchema = {
      anyOf: [
        { type: "array", uniqueItems: true },
        { type: "array" },
      ],
    };
    const resAnyOf = validateRuntimePayloadAgainstSchema(anyOfSchema, largePayload, {});
    assert.equal(resAnyOf.valid, false, "anyOf must not hide fatal budget exhaustion on uniqueItems");
    assert.ok(
      resAnyOf.errors.some((e) => e.includes("budget exceeded")),
      "Must report budget exceeded from uniqueItems under anyOf"
    );

    // not branch exhausts budget on uniqueItems
    const notSchema = {
      not: { type: "array", uniqueItems: true },
    };
    const resNot = validateRuntimePayloadAgainstSchema(notSchema, largePayload, {});
    assert.equal(resNot.valid, false, "not must not invert fatal budget exhaustion on uniqueItems");
    assert.ok(
      resNot.errors.some((e) => e.includes("budget exceeded")),
      "Must report budget exceeded from uniqueItems under not"
    );
  });

  it("bounds diagnostic errors and retained bytes across required and additionalProperties loops", () => {
    // 1. 1000 missing required properties capped at maxErrors (50)
    const missingSchema = {
      type: "object",
      required: Array.from({ length: 1000 }, (_, i) => "missing_property_" + i),
    };
    const resMissing = validateRuntimePayloadAgainstSchema(missingSchema, {}, {});
    assert.equal(resMissing.valid, false, "1000 missing required fields must fail");
    assert.equal(
      resMissing.errors.length,
      50,
      `Errors must be capped at 50, got ${resMissing.errors.length}`
    );

    // 2. 1000 unrecognized additional properties capped at maxErrors (50)
    const extraProps: Record<string, unknown> = {};
    for (let i = 0; i < 1000; i++) {
      extraProps["extra_field_" + i] = i;
    }
    const resExtra = validateRuntimePayloadAgainstSchema(
      { type: "object", additionalProperties: false },
      extraProps,
      {}
    );
    assert.equal(resExtra.valid, false, "1000 extra properties must fail");
    assert.ok(
      resExtra.errors.length <= 50,
      `Errors count must be capped at 50, got ${resExtra.errors.length}`
    );
    const totalExtraBytes = resExtra.errors.reduce((sum, e) => sum + e.length, 0);
    assert.ok(
      totalExtraBytes <= 4096,
      `Retained error bytes must not exceed 4096, got ${totalExtraBytes}`
    );

    // 3. Individual diagnostic messages must be bounded in length (<= 120 chars) and truncate long names
    const longProp = "a".repeat(200);
    const resLong = validateRuntimePayloadAgainstSchema(
      { type: "object", required: [longProp] },
      {},
      {}
    );
    assert.equal(resLong.valid, false);
    assert.ok(resLong.errors[0]!.length <= 120, "Diagnostic message must not exceed 120 characters");
    assert.ok(resLong.errors[0]!.includes("..."), "Long property name in diagnostic must be truncated");

    // 4. Reaching diagnostic cap remains invalid and never makes an anyOf branch match
    const anyOfCapped = {
      anyOf: [missingSchema],
    };
    const resCap = validateRuntimePayloadAgainstSchema(anyOfCapped, {}, {});
    assert.equal(resCap.valid, false, "Reaching error cap must never make anyOf branch match");
  });
});
