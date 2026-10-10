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
  DEFAULT_SPEC_PATH,
  DEFAULT_TYPES_OUTPUT_PATH,
  DEFAULT_CONTRACT_OUTPUT_PATH,
} from "../../scripts/generate-identity-api-types.mjs";
import * as requestValidators from "../../src/lib/api/identity-client-validators.ts";
import { validatePayloadAgainstSchema } from "../../scripts/lib/backend-contract-validation.mjs";

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
});
