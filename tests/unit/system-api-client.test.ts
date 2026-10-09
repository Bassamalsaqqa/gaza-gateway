/**
 * Gaza Gateway / Palestinian Airlines
 * Phase 13A System API Client — Focused Unit Tests
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  createSystemApiClient,
  validateAndNormalizeBaseUrl,
  isSystemApiError,
  isValidUuid,
  isValidIsoDateTime,
  parseRetryAfter,
  SystemApiError,
} from "../../src/lib/api/index.ts";
import {
  generateSystemApiTypes,
  checkSystemApiTypes,
  runCli,
  repositoryRoot,
  DEFAULT_SPEC_PATH,
} from "../../scripts/generate-system-api-types.mjs";

interface OpenApiMockDoc {
  paths: Record<string, { get?: { responses?: Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }> } }>;
  components: { schemas: Record<string, Record<string, unknown>> };
}

const openApiSpec = JSON.parse(fs.readFileSync(DEFAULT_SPEC_PATH, "utf8")) as OpenApiMockDoc;

function createMockResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const bodyText = typeof body === "string" ? body : JSON.stringify(body);
  const defaultHeaders: Record<string, string> = {
    "content-type": "application/json",
    "cache-control": "no-store, private",
    ...headers,
  };

  return new Response(bodyText, {
    status,
    headers: defaultHeaders,
  });
}

describe("SystemApiClient — Defaults and Zero Network Calls", () => {
  it("defaults to mock mode with zero fetch calls when unconfigured", async () => {
    let fetchCalls = 0;
    const client = createSystemApiClient({
      fetch: () => {
        fetchCalls++;
        throw new Error("Fetch must never be invoked in default mock mode");
      },
    });

    assert.equal(client.isEnabled, false);
    assert.equal(client.mode, "mock");
    assert.equal(client.baseUrl, null);

    const health = await client.getHealth();
    assert.equal(health.success, true);
    assert.equal(health.data.status, "ok");
    assert.equal(isValidUuid(health.meta.requestId), true);
    assert.equal(isValidIsoDateTime(health.meta.timestamp), true);

    const ready = await client.getReady();
    assert.equal(ready.success, true);
    assert.equal(ready.data.database, "connected");
    assert.equal(ready.data.migrations, "up_to_date");
    assert.equal(ready.data.queue, "healthy");

    const version = await client.getVersion();
    assert.equal(version.success, true);
    assert.equal(version.data.version, "1.0.0-mock");
    assert.equal(version.data.commit, "mock-commit");
    assert.equal(version.data.schemaVersion, 1);

    assert.equal(fetchCalls, 0, "Default mode must make zero fetch calls");
  });

  it("defaults to mock mode with zero fetch calls when enabled is explicitly false", async () => {
    let fetchCalls = 0;
    const client = createSystemApiClient({
      enabled: false,
      fetch: () => {
        fetchCalls++;
        throw new Error("Fetch must never be invoked");
      },
    });

    assert.equal(client.isEnabled, false);
    assert.equal(client.mode, "mock");
    const health = await client.getHealth();
    assert.equal(health.success, true);
    assert.equal(fetchCalls, 0);
  });
});

describe("SystemApiClient — Production Opt-In and Environment Rejection", () => {
  it("rejects enabling when PROD flag is true", () => {
    assert.throws(
      () =>
        createSystemApiClient({
          enabled: true,
          nonProductionOptIn: true,
          environment: { PROD: true, DEV: true },
          baseUrl: "http://localhost:8000",
        }),
      (err: unknown) => isSystemApiError(err) && err.kind === "configuration"
    );
  });

  it("rejects enabling when MODE is production", () => {
    assert.throws(
      () =>
        createSystemApiClient({
          enabled: true,
          nonProductionOptIn: true,
          environment: { MODE: "production" },
          baseUrl: "http://localhost:8000",
        }),
      (err: unknown) => isSystemApiError(err) && err.kind === "configuration"
    );
  });

  it("rejects enabling when NODE_ENV is production", () => {
    assert.throws(
      () =>
        createSystemApiClient({
          enabled: true,
          nonProductionOptIn: true,
          environment: { NODE_ENV: "production" },
          baseUrl: "http://localhost:8000",
        }),
      (err: unknown) => isSystemApiError(err) && err.kind === "configuration"
    );
  });

  it("rejects enabling when nonProductionOptIn is missing or false", () => {
    assert.throws(
      () =>
        createSystemApiClient({
          enabled: true,
          environment: { DEV: true },
          baseUrl: "http://localhost:8000",
        }),
      (err: unknown) => isSystemApiError(err) && err.kind === "configuration"
    );

    assert.throws(
      () =>
        createSystemApiClient({
          enabled: true,
          nonProductionOptIn: false,
          environment: { DEV: true },
          baseUrl: "http://localhost:8000",
        }),
      (err: unknown) => isSystemApiError(err) && err.kind === "configuration"
    );
  });

  it("rejects contradictory configuration where enabled is false but optIn is true", () => {
    assert.throws(
      () =>
        createSystemApiClient({
          enabled: false,
          nonProductionOptIn: true,
          environment: { DEV: true },
          baseUrl: "http://localhost:8000",
        }),
      (err: unknown) => isSystemApiError(err) && err.kind === "configuration"
    );
  });

  it("rejects enabling when environment is missing, empty, or unknown", () => {
    assert.throws(
      () =>
        createSystemApiClient({
          enabled: true,
          nonProductionOptIn: true,
          baseUrl: "http://localhost:8000",
        }),
      (err: unknown) => isSystemApiError(err) && err.kind === "configuration"
    );

    assert.throws(
      () =>
        createSystemApiClient({
          enabled: true,
          nonProductionOptIn: true,
          environment: {},
          baseUrl: "http://localhost:8000",
        }),
      (err: unknown) => isSystemApiError(err) && err.kind === "configuration"
    );

    assert.throws(
      () =>
        createSystemApiClient({
          enabled: true,
          nonProductionOptIn: true,
          environment: { MODE: "custom-unrecognized" },
          baseUrl: "http://localhost:8000",
        }),
      (err: unknown) => isSystemApiError(err) && err.kind === "configuration"
    );
  });

  it("rejects accidental production API hosts even in development", () => {
    const forbiddenUrls = [
      "https://api.gazaairport.com",
      "https://api.gazaairport.com/api/v1",
      "https://www.gazaairport.com",
      "https://gazaairport.com",
    ];

    for (const url of forbiddenUrls) {
      assert.throws(
        () =>
          createSystemApiClient({
            enabled: true,
            nonProductionOptIn: true,
            environment: { DEV: true },
            baseUrl: url,
          }),
        (err: unknown) => isSystemApiError(err) && err.kind === "configuration",
        `Expected rejection of production URL: ${url}`
      );
    }
  });
});

describe("SystemApiClient — Allowed and Disallowed URL Cases", () => {
  it("accepts and normalizes allowed loopback HTTP URLs", () => {
    const loopbacks = [
      ["http://localhost:8000", "http://localhost:8000/api/v1"],
      ["http://localhost:8000/", "http://localhost:8000/api/v1"],
      ["http://localhost:8000/api/v1", "http://localhost:8000/api/v1"],
      ["http://localhost:8000/api/v1/", "http://localhost:8000/api/v1"],
      ["http://127.0.0.1:18084", "http://127.0.0.1:18084/api/v1"],
      ["http://127.0.0.1:18084/", "http://127.0.0.1:18084/api/v1"],
      ["http://127.0.0.1:18084/api/v1", "http://127.0.0.1:18084/api/v1"],
      ["http://[::1]:8000", "http://[::1]:8000/api/v1"],
      ["http://[::1]:8000/api/v1", "http://[::1]:8000/api/v1"],
    ];

    for (const [input, expected] of loopbacks) {
      assert.equal(validateAndNormalizeBaseUrl(input), expected);
    }
  });

  it("accepts and normalizes allowed staging HTTPS URLs on standard port only", () => {
    const stagingCases = [
      ["https://staging-api.gazaairport.com", "https://staging-api.gazaairport.com/api/v1"],
      ["https://staging-api.gazaairport.com/", "https://staging-api.gazaairport.com/api/v1"],
      ["https://staging-api.gazaairport.com/api/v1", "https://staging-api.gazaairport.com/api/v1"],
      ["https://staging-api.gazaairport.com/api/v1/", "https://staging-api.gazaairport.com/api/v1"],
      ["https://staging-api.gazaairport.com:443/api/v1", "https://staging-api.gazaairport.com/api/v1"],
    ];

    for (const [input, expected] of stagingCases) {
      assert.equal(validateAndNormalizeBaseUrl(input), expected);
    }
  });

  it("rejects custom or arbitrary port on accepted staging origin", () => {
    const badStagingPorts = [
      "https://staging-api.gazaairport.com:8443",
      "https://staging-api.gazaairport.com:8000",
      "https://staging-api.gazaairport.com:18084",
    ];

    for (const url of badStagingPorts) {
      assert.throws(
        () => validateAndNormalizeBaseUrl(url),
        (err: unknown) => isSystemApiError(err) && err.kind === "configuration"
      );
    }
  });

  it("rejects HTTP on non-loopback hosts", () => {
    const nonLoopbacks = [
      "http://staging-api.gazaairport.com",
      "http://192.168.1.50:8000",
      "http://10.0.0.1:8000",
      "http://evil.com:8000",
    ];

    for (const url of nonLoopbacks) {
      assert.throws(
        () => validateAndNormalizeBaseUrl(url),
        (err: unknown) => isSystemApiError(err) && err.kind === "configuration"
      );
    }
  });

  it("rejects unapproved origins and unsupported protocols", () => {
    const badUrls = [
      "https://example.com/api/v1",
      "https://random-api.gazaairport.com/api/v1",
      "ftp://localhost:8000",
      "ws://localhost:8000",
      "http://user:pass@localhost:8000",
      "http://localhost:8000?token=secret",
      "http://localhost:8000#section",
      "http://localhost:8000/other/path",
      "http://localhost:8000/api/v2",
      "",
      "not a url",
    ];

    for (const url of badUrls) {
      assert.throws(
        () => validateAndNormalizeBaseUrl(url),
        (err: unknown) => isSystemApiError(err) && err.kind === "configuration",
        `Expected rejection for: ${url}`
      );
    }
  });
});

describe("SystemApiClient — Exact Routes, Headers, and Transport Invariants", () => {
  it("sends exact headers, credentials: omit, and redirect: error on health call", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;

    const mockFetch: typeof fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      const reqId = (init?.headers as Record<string, string>)["X-Request-Id"]!;
      return createMockResponse(
        {
          success: true,
          data: { status: "ok", timestamp: "2026-10-09T18:00:00Z" },
          meta: { requestId: reqId, timestamp: "2026-10-09T18:00:00Z" },
        },
        200,
        { "x-request-id": reqId }
      );
    };

    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: mockFetch,
    });

    const res = await client.getHealth();
    assert.equal(res.success, true);
    assert.equal(capturedUrl, "http://127.0.0.1:18084/api/v1/health");

    const headers = capturedInit?.headers as Record<string, string>;
    assert.equal(headers["Accept"], "application/json");
    assert.equal(headers["Cache-Control"], "no-store");
    assert.equal(isValidUuid(headers["X-Request-Id"]), true);
    assert.equal(capturedInit?.credentials, "omit");
    assert.equal(capturedInit?.redirect, "error");
    assert.equal(capturedInit?.method, "GET");

    // Ensure no auth headers sent
    assert.equal(headers["Authorization"], undefined);
    assert.equal(headers["Cookie"], undefined);
  });

  it("targets exact routes for readiness and version", async () => {
    const pathsCalled: string[] = [];
    const mockFetch: typeof fetch = async (url, init) => {
      pathsCalled.push(new URL(String(url)).pathname);
      const reqId = (init?.headers as Record<string, string>)["X-Request-Id"]!;
      if (String(url).endsWith("/health/ready")) {
        return createMockResponse(
          {
            success: true,
            data: { database: "connected", migrations: "up_to_date", queue: "healthy" },
            meta: { requestId: reqId, timestamp: "2026-10-09T18:00:00Z" },
          },
          200,
          { "x-request-id": reqId }
        );
      }
      return createMockResponse(
        {
          success: true,
          data: { version: "1.0.0", commit: "e1b4e3c6", schemaVersion: 1 },
          meta: { requestId: reqId, timestamp: "2026-10-09T18:00:00Z" },
        },
        200,
        { "x-request-id": reqId }
      );
    };

    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: mockFetch,
    });

    await client.getReady();
    await client.getVersion();

    assert.deepEqual(pathsCalled, ["/api/v1/health/ready", "/api/v1/version"]);
  });
});

describe("SystemApiClient — Actual Contract Success Specimens", () => {
  it("validates HealthStatusResponse specimen matching accepted OpenAPI", async () => {
    const reqId = "5a038c40-915c-4d0c-93db-34d1a6990808";
    const specimen = {
      success: true,
      data: { status: "ok", timestamp: "2026-10-09T18:00:03Z" },
      meta: { requestId: reqId, timestamp: "2026-10-09T18:00:03Z" },
    };

    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async () => createMockResponse(specimen, 200, { "x-request-id": reqId }),
    });

    const res = await client.getHealth({ requestId: reqId });
    assert.deepEqual(res, specimen);
  });

  it("validates ReadinessStatusResponse specimen matching accepted OpenAPI", async () => {
    const reqId = "9177a785-ba25-4461-99f0-7eab5edaf12b";
    const specimen = {
      success: true,
      data: { database: "connected", migrations: "up_to_date", queue: "healthy" },
      meta: { requestId: reqId, timestamp: "2026-10-09T18:00:09Z" },
    };

    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async () => createMockResponse(specimen, 200, { "x-request-id": reqId }),
    });

    const res = await client.getReady({ requestId: reqId });
    assert.deepEqual(res, specimen);
  });

  it("validates VersionResponse specimen matching accepted OpenAPI", async () => {
    const reqId = "5547f680-a8b3-4860-9f0d-1d33a5669d2b";
    const specimen = {
      success: true,
      data: { version: "1.0.0-foundation", commit: "unreleased-local", schemaVersion: 1 },
      meta: { requestId: reqId, timestamp: "2026-10-09T18:00:10Z" },
    };

    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async () => createMockResponse(specimen, 200, { "x-request-id": reqId }),
    });

    const res = await client.getVersion({ requestId: reqId });
    assert.deepEqual(res, specimen);
  });
});

describe("SystemApiClient — Canonical 503 and 429 Error Responses", () => {
  it("preserves safe typed code, status, requestId, and Retry-After for 503 Service Unavailable with fixed status-based message", async () => {
    const reqId = "c2005db3-982e-40ec-8bb1-ec23fa5a4fa3";
    const errorBody = {
      success: false,
      error: { code: "database_unavailable", message: "SECRET_BACKEND_MESSAGE_DO_NOT_LEAK" },
      meta: { requestId: reqId, timestamp: "2026-10-09T18:00:00Z" },
    };

    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async () => createMockResponse(errorBody, 503, { "retry-after": "30", "x-request-id": reqId }),
    });

    await assert.rejects(
      () => client.getReady({ requestId: reqId }),
      (err: unknown) => {
        assert.equal(isSystemApiError(err), true);
        if (!isSystemApiError(err)) return false;
        assert.equal(err.kind, "http_error");
        assert.equal(err.status, 503);
        assert.equal(err.code, "database_unavailable");
        assert.equal(err.message, "Service Unavailable: the system API is temporarily unavailable.");
        assert.equal(err.message.includes("SECRET_BACKEND_MESSAGE_DO_NOT_LEAK"), false);
        assert.equal(err.requestId, reqId);
        assert.equal(err.retryAfter, 30);
        return true;
      }
    );
  });

  it("preserves safe typed code, status, and Retry-After for 429 Too Many Requests with fixed status-based message", async () => {
    const reqId = "87c4a170-eb3b-48ad-8d1e-bf11b08c6fa1";
    const errorBody = {
      success: false,
      error: { code: "rate_limit_exceeded", message: "SECRET_RATE_LIMIT_INTERNAL_DETAIL" },
      meta: { requestId: reqId, timestamp: "2026-10-09T18:00:00Z" },
    };

    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async () => createMockResponse(errorBody, 429, { "retry-after": "60", "x-request-id": reqId }),
    });

    await assert.rejects(
      () => client.getVersion({ requestId: reqId }),
      (err: unknown) => {
        assert.equal(isSystemApiError(err), true);
        if (!isSystemApiError(err)) return false;
        assert.equal(err.kind, "http_error");
        assert.equal(err.status, 429);
        assert.equal(err.code, "rate_limit_exceeded");
        assert.equal(err.message, "Too Many Requests: rate limit exceeded.");
        assert.equal(err.message.includes("SECRET_RATE_LIMIT_INTERNAL_DETAIL"), false);
        assert.equal(err.retryAfter, 60);
        return true;
      }
    );
  });

  it("handles canonical 400 and 404 responses with fixed status-based messages", async () => {
    const reqId = "9900aabb-1234-4567-89ab-cdef01234567";
    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async (_url) => {
        return createMockResponse({
          success: false,
          error: { code: "bad_request", message: "Arbitrary server message" },
          meta: { requestId: reqId, timestamp: "2026-10-09T18:00:00Z" },
        }, 400, { "x-request-id": reqId });
      },
    });

    await assert.rejects(
      () => client.getHealth({ requestId: reqId }),
      (err: unknown) => {
        assert.equal(isSystemApiError(err), true);
        if (!isSystemApiError(err)) return false;
        assert.equal(err.kind, "http_error");
        assert.equal(err.status, 400);
        assert.equal(err.message, "Bad Request: the request was rejected by the system API.");
        return true;
      }
    );
  });

  it("rejects canonical error with invalid code grammar as protocol error", async () => {
    const reqId = "9900aabb-1234-4567-89ab-cdef01234567";
    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async () => {
        return createMockResponse({
          success: false,
          error: { code: "invalid code with spaces and symbols!@#", message: "fail" },
          meta: { requestId: reqId, timestamp: "2026-10-09T18:00:00Z" },
        }, 503, { "x-request-id": reqId });
      },
    });

    await assert.rejects(
      () => client.getHealth({ requestId: reqId }),
      (err: unknown) => {
        assert.equal(isSystemApiError(err), true);
        if (!isSystemApiError(err)) return false;
        assert.equal(err.kind, "protocol");
        assert.equal(err.message.includes("invalid error code format"), true);
        return true;
      }
    );
  });

  it("bounds huge Retry-After digit strings to finite maximum and ignores negative values", () => {
    assert.equal(parseRetryAfter("9999999999999"), 86400 * 7);
    assert.equal(parseRetryAfter("-10"), undefined);
    assert.equal(parseRetryAfter("+10"), undefined);
    assert.equal(parseRetryAfter("invalid"), undefined);
    assert.equal(parseRetryAfter("120"), 120);
  });

  it("parses valid HTTP-Date IMF-fixdate format and ignores arbitrary locale or invalid dates", () => {
    // Valid future IMF-fixdate format: "Sun, 06 Nov 2030 08:49:37 GMT"
    const validHttpDate = "Sun, 06 Nov 2030 08:49:37 GMT";
    const parsed = parseRetryAfter(validHttpDate);
    assert.equal(typeof parsed, "number");
    assert.equal(parsed! > 0, true);

    // Invalid calendar day in HTTP-date (32 Oct) -> ignored
    assert.equal(parseRetryAfter("Wed, 32 Oct 2026 07:28:00 GMT"), undefined);

    // Arbitrary locale dates or non-IMF strings -> ignored
    assert.equal(parseRetryAfter("2026-10-21T07:28:00Z"), undefined);
    assert.equal(parseRetryAfter("tomorrow"), undefined);
  });
});

describe("SystemApiClient — Strict Calendar RFC3339 Date Validation", () => {
  it("rejects non-existent calendar dates like Feb 30 normalized by JS", () => {
    // Feb 30 does not exist
    assert.equal(isValidIsoDateTime("2026-02-30T12:00:00Z"), false);
    // 2026 is not a leap year, so Feb 29 does not exist
    assert.equal(isValidIsoDateTime("2026-02-29T12:00:00Z"), false);
    // 2024 is a leap year, so Feb 29 exists
    assert.equal(isValidIsoDateTime("2024-02-29T12:00:00Z"), true);
    // Valid standard date
    assert.equal(isValidIsoDateTime("2026-10-09T18:00:03Z"), true);
  });

  it("validates timezone offset bounds and rejects invalid offsets like +99:99", () => {
    // Hour out of bounds (> 23)
    assert.equal(isValidIsoDateTime("2026-10-09T18:00:00+99:99"), false);
    assert.equal(isValidIsoDateTime("2026-10-09T18:00:00+24:00"), false);
    assert.equal(isValidIsoDateTime("2026-10-09T18:00:00-25:00"), false);

    // Minute out of bounds (> 59)
    assert.equal(isValidIsoDateTime("2026-10-09T18:00:00+03:99"), false);
    assert.equal(isValidIsoDateTime("2026-10-09T18:00:00+00:60"), false);

    // Valid timezone offsets
    assert.equal(isValidIsoDateTime("2026-10-09T18:00:00+03:00"), true);
    assert.equal(isValidIsoDateTime("2026-10-09T18:00:00-05:00"), true);
    assert.equal(isValidIsoDateTime("2026-10-09T18:00:00+05:30"), true);
    assert.equal(isValidIsoDateTime("2026-10-09T18:00:00Z"), true);
  });
});

describe("SystemApiClient — Runtime Guards: Media, Envelopes, and Request ID Correlation", () => {
  it("rejects non-JSON Content-Type without exposing raw body", async () => {
    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async () =>
        new Response("<html><body>502 Bad Gateway with secret token abc-xyz</body></html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
    });

    await assert.rejects(
      () => client.getHealth(),
      (err: unknown) => {
        assert.equal(isSystemApiError(err), true);
        if (!isSystemApiError(err)) return false;
        assert.equal(err.kind, "protocol");
        assert.equal(err.message.includes("secret token"), false);
        assert.equal(err.message.includes("expected application/json"), true);
        return true;
      }
    );
  });

  it("classifies non-canonical non-2xx error JSON as protocol error, not canonical http_error", async () => {
    // Malformed error JSON missing required 'error' field
    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async () =>
        createMockResponse({
          success: false,
          unrecognizedKey: "not matching ErrorResponse",
        }, 500),
    });

    await assert.rejects(
      () => client.getHealth(),
      (err: unknown) => {
        assert.equal(isSystemApiError(err), true);
        if (!isSystemApiError(err)) return false;
        assert.equal(err.kind, "protocol");
        assert.equal(err.status, 500);
        return true;
      }
    );
  });

  it("rejects non-JSON application/jsonp media type", async () => {
    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async () =>
        new Response("callback({})", {
          status: 200,
          headers: { "content-type": "application/jsonp" },
        }),
    });

    await assert.rejects(
      () => client.getHealth(),
      (err: unknown) => isSystemApiError(err) && err.kind === "protocol"
    );
  });

  it("rejects malformed non-JSON syntax", async () => {
    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async () =>
        new Response("{ broken json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    await assert.rejects(
      () => client.getHealth(),
      (err: unknown) => isSystemApiError(err) && err.kind === "protocol"
    );
  });

  it("rejects success: false on 2xx response", async () => {
    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async () =>
        createMockResponse({
          success: false,
          error: { code: "some_error", message: "fail" },
          meta: { requestId: "5a038c40-915c-4d0c-93db-34d1a6990808", timestamp: "2026-10-09T18:00:03Z" },
        }, 200),
    });

    await assert.rejects(
      () => client.getHealth({ requestId: "5a038c40-915c-4d0c-93db-34d1a6990808" }),
      (err: unknown) => isSystemApiError(err) && err.kind === "protocol"
    );
  });

  it("rejects mismatched requestId correlation in meta or response header", async () => {
    // Mismatched in body meta
    const clientBodyMismatch = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async () =>
        createMockResponse({
          success: true,
          data: { status: "ok", timestamp: "2026-10-09T18:00:03Z" },
          meta: { requestId: "11111111-1111-4111-8111-111111111111", timestamp: "2026-10-09T18:00:03Z" },
        }),
    });

    await assert.rejects(
      () => clientBodyMismatch.getHealth({ requestId: "22222222-2222-4222-8222-222222222222" }),
      (err: unknown) => isSystemApiError(err) && err.kind === "protocol"
    );

    // Mismatched in header X-Request-Id
    const clientHeaderMismatch = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async () =>
        createMockResponse(
          {
            success: true,
            data: { status: "ok", timestamp: "2026-10-09T18:00:03Z" },
            meta: { requestId: "22222222-2222-4222-8222-222222222222", timestamp: "2026-10-09T18:00:03Z" },
          },
          200,
          { "x-request-id": "33333333-3333-4333-8333-333333333333" }
        ),
    });

    await assert.rejects(
      () => clientHeaderMismatch.getHealth({ requestId: "22222222-2222-4222-8222-222222222222" }),
      (err: unknown) => isSystemApiError(err) && err.kind === "protocol"
    );
  });

  it("rejects malformed meta UUID or timestamp", async () => {
    const badMetas = [
      { requestId: "not-a-uuid", timestamp: "2026-10-09T18:00:03Z" },
      { requestId: "5a038c40-915c-4d0c-93db-34d1a6990808", timestamp: "not-a-timestamp" },
    ];

    for (const meta of badMetas) {
      const client = createSystemApiClient({
        enabled: true,
        nonProductionOptIn: true,
        environment: { DEV: true },
        baseUrl: "http://127.0.0.1:18084",
        fetch: async () =>
          createMockResponse({
            success: true,
            data: { status: "ok", timestamp: "2026-10-09T18:00:03Z" },
            meta,
          }),
      });

      await assert.rejects(
        () => client.getHealth({ requestId: "5a038c40-915c-4d0c-93db-34d1a6990808" }),
        (err: unknown) => isSystemApiError(err) && err.kind === "protocol"
      );
    }
  });

  it("rejects missing required data fields and unexpected extra envelope properties", async () => {
    // Missing required field 'queue' in readiness
    const clientMissing = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async () =>
        createMockResponse({
          success: true,
          data: { database: "connected", migrations: "up_to_date" },
          meta: { requestId: "5a038c40-915c-4d0c-93db-34d1a6990808", timestamp: "2026-10-09T18:00:03Z" },
        }),
    });

    await assert.rejects(
      () => clientMissing.getReady({ requestId: "5a038c40-915c-4d0c-93db-34d1a6990808" }),
      (err: unknown) => isSystemApiError(err) && err.kind === "protocol"
    );

    // Extra forbidden top-level property
    const clientExtra = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async () =>
        createMockResponse({
          success: true,
          data: { status: "ok", timestamp: "2026-10-09T18:00:03Z" },
          meta: { requestId: "5a038c40-915c-4d0c-93db-34d1a6990808", timestamp: "2026-10-09T18:00:03Z" },
          unexpected: "field",
        }),
    });

    await assert.rejects(
      () => clientExtra.getHealth({ requestId: "5a038c40-915c-4d0c-93db-34d1a6990808" }),
      (err: unknown) => isSystemApiError(err) && err.kind === "protocol"
    );
  });
});

describe("SystemApiClient — Timeout Deadlines and Request Overrides (C1)", () => {
  it("times out when response body streaming hangs past timeoutMs", async () => {
    const hangingFetch: typeof fetch = async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"success": true'));
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      timeoutMs: 50,
      fetch: hangingFetch,
    });

    await assert.rejects(
      () => client.getHealth(),
      (err: unknown) => {
        assert.equal(isSystemApiError(err), true);
        if (!isSystemApiError(err)) return false;
        assert.equal(err.kind, "timeout");
        assert.equal(err.message, "System API request timed out (including body reading).");
        return true;
      }
    );
  });

  it("positive control: normal body read completes promptly within timeout bounds", async () => {
    const reqId = "7a44f507-6c2e-4b72-8812-70ceb253b23c";
    const normalFetch: typeof fetch = async () => {
      return createMockResponse(
        {
          success: true,
          data: { status: "ok", timestamp: "2026-10-09T18:00:00Z" },
          meta: { requestId: reqId, timestamp: "2026-10-09T18:00:00Z" },
        },
        200,
        { "x-request-id": reqId }
      );
    };

    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      timeoutMs: 1000,
      fetch: normalFetch,
    });

    const res = await client.getHealth({ requestId: reqId });
    assert.equal(res.success, true);
    assert.equal(res.data.status, "ok");
  });

  it("rejects invalid per-request timeout overrides without dispatching any HTTP calls", async () => {
    let fetchCalls = 0;
    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      timeoutMs: 10000,
      fetch: async () => {
        fetchCalls++;
        throw new Error("Fetch must not be called when request timeout is invalid");
      },
    });

    const invalidTimeouts: unknown[] = [
      0,
      -1,
      -500,
      60001,
      100000,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      1.5,
      "5000",
      null,
      {},
    ];

    for (const badTimeout of invalidTimeouts) {
      await assert.rejects(
        () => client.getHealth({ timeoutMs: badTimeout as number }),
        (err: unknown) => {
          assert.equal(isSystemApiError(err), true);
          if (!isSystemApiError(err)) return false;
          assert.equal(err.kind, "configuration");
          assert.equal(err.message, "Invalid timeout: expected integer between 1 and 60000 milliseconds.");
          return true;
        },
        `Expected rejection for timeoutMs override: ${badTimeout}`
      );
    }

    assert.equal(fetchCalls, 0, "Must dispatch zero HTTP calls for all invalid timeout overrides");
  });

  it("bounds hanging fetch with valid shorter deadline even when transport ignores AbortSignal", async () => {
    // Mock transport that ignores init.signal and never settles
    const uncooperativeHangingFetch: typeof fetch = async () => {
      return new Promise(() => {
        // Intentionally hanging promise that never resolves or listens to signal
      });
    };

    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      timeoutMs: 10000, // Factory deadline 10s
      fetch: uncooperativeHangingFetch,
    });

    const t0 = Date.now();
    await assert.rejects(
      // Shorter request deadline 30ms overriding 10000ms
      () => client.getHealth({ timeoutMs: 30 }),
      (err: unknown) => {
        assert.equal(isSystemApiError(err), true);
        if (!isSystemApiError(err)) return false;
        assert.equal(err.kind, "timeout");
        assert.equal(err.message, "System API request timed out (including body reading).");
        return true;
      }
    );
    const duration = Date.now() - t0;
    assert.equal(duration < 2000, true, "Must abort well before factory 10000ms deadline");
  });

  it("bounds hanging body read with valid shorter deadline even when stream ignores AbortSignal", async () => {
    const uncooperativeStreamFetch: typeof fetch = async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"success": true, '));
          // Never closes, ignores cancellation
        },
        cancel() {
          // Ignores cancel
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      timeoutMs: 10000,
      fetch: uncooperativeStreamFetch,
    });

    const t0 = Date.now();
    await assert.rejects(
      () => client.getHealth({ timeoutMs: 35 }),
      (err: unknown) => {
        assert.equal(isSystemApiError(err), true);
        if (!isSystemApiError(err)) return false;
        assert.equal(err.kind, "timeout");
        return true;
      }
    );
    const duration = Date.now() - t0;
    assert.equal(duration < 2000, true);
  });
});

describe("SystemApiClient — Zero Sentinel / Token Leakage Across All Vectors (C2)", () => {
  it("network error and serialized representation never leak sensitive sentinels or tokens", async () => {
    const secretSentinel = "SECRET_TOKEN_DO_NOT_LEAK_998877";
    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async () => {
        throw new Error(`Connection failed with internal credential ${secretSentinel}`);
      },
    });

    await assert.rejects(
      () => client.getHealth(),
      (err: unknown) => {
        assert.equal(isSystemApiError(err), true);
        if (!isSystemApiError(err)) return false;
        assert.equal(err.kind, "network");
        assert.equal(err.message.includes(secretSentinel), false);
        const serialized = JSON.stringify(err.toJSON());
        assert.equal(serialized.includes(secretSentinel), false);
        assert.equal(err.stack?.includes(secretSentinel), false);
        return true;
      }
    );
  });

  it("sentinels in malformed top-level, meta, or data keys are never echoed in error messages, stack, or toJSON", async () => {
    const sentinel = "SECRET_SENTINEL_IN_KEY_NAME_445566";
    const reqId = "7a44f507-6c2e-4b72-8812-70ceb253b23c";

    const malformedPayloads = [
      // Top-level extra key
      { success: true, data: { status: "ok", timestamp: "2026-10-09T18:00:00Z" }, meta: { requestId: reqId, timestamp: "2026-10-09T18:00:00Z" }, [sentinel]: "val" },
      // Meta extra key
      { success: true, data: { status: "ok", timestamp: "2026-10-09T18:00:00Z" }, meta: { requestId: reqId, timestamp: "2026-10-09T18:00:00Z", [sentinel]: "val" } },
      // Health data extra key
      { success: true, data: { status: "ok", timestamp: "2026-10-09T18:00:00Z", [sentinel]: "val" }, meta: { requestId: reqId, timestamp: "2026-10-09T18:00:00Z" } },
    ];

    for (const payload of malformedPayloads) {
      const client = createSystemApiClient({
        enabled: true,
        nonProductionOptIn: true,
        environment: { DEV: true },
        baseUrl: "http://127.0.0.1:18084",
        fetch: async () => createMockResponse(payload, 200, { "x-request-id": reqId }),
      });

      await assert.rejects(
        () => client.getHealth({ requestId: reqId }),
        (err: unknown) => {
          assert.equal(isSystemApiError(err), true);
          if (!isSystemApiError(err)) return false;
          assert.equal(err.kind, "protocol");
          assert.equal(err.message.includes(sentinel), false, "Error message must not contain secret key sentinel");
          assert.equal(err.stack?.includes(sentinel), false, "Stack must not contain secret key sentinel");
          assert.equal(JSON.stringify(err.toJSON()).includes(sentinel), false, "toJSON must not contain sentinel");
          for (const val of Object.values(err)) {
            assert.equal(String(val).includes(sentinel), false, "Error properties must not contain sentinel");
          }
          return true;
        }
      );
    }
  });

  it("sentinels in invalid X-Request-Id header or caller requestId are never echoed in error", async () => {
    const headerSentinel = "SECRET_SENTINEL_HEADER_VAL_7788";
    const callerSentinel = "SECRET_SENTINEL_CALLER_ID_9900";
    const validReqId = "7a44f507-6c2e-4b72-8812-70ceb253b23c";

    // 1. Invalid X-Request-Id header sent by proxy
    const clientHeader = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async () =>
        createMockResponse(
          {
            success: true,
            data: { status: "ok", timestamp: "2026-10-09T18:00:00Z" },
            meta: { requestId: validReqId, timestamp: "2026-10-09T18:00:00Z" },
          },
          200,
          { "x-request-id": headerSentinel }
        ),
    });

    await assert.rejects(
      () => clientHeader.getHealth({ requestId: validReqId }),
      (err: unknown) => {
        assert.equal(isSystemApiError(err), true);
        if (!isSystemApiError(err)) return false;
        assert.equal(err.kind, "protocol");
        assert.equal(err.message.includes(headerSentinel), false);
        assert.equal(JSON.stringify(err.toJSON()).includes(headerSentinel), false);
        return true;
      }
    );

    // 2. Caller malformed requestId
    const clientCaller = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async () => createMockResponse({}, 200),
    });

    await assert.rejects(
      () => clientCaller.getHealth({ requestId: callerSentinel }),
      (err: unknown) => {
        assert.equal(isSystemApiError(err), true);
        if (!isSystemApiError(err)) return false;
        assert.equal(err.kind, "protocol");
        assert.equal(err.message.includes(callerSentinel), false);
        assert.equal(err.requestId, undefined, "Untrusted malformed requestId must not be retained on error");
        assert.equal(JSON.stringify(err.toJSON()).includes(callerSentinel), false);
        return true;
      }
    );
  });

  it("sentinels in invalid URL hostname, pathname, or userinfo are never echoed in error", () => {
    const urlSentinel = "SECRET_SENTINEL_URL_PART_5566";

    const badUrls = [
      `http://${urlSentinel}/api/v1`,
      `http://127.0.0.1:18084/${urlSentinel}`,
      `http://${urlSentinel}:pass@127.0.0.1:18084/api/v1`,
      `https://staging-api.gazaairport.com:8443/${urlSentinel}`,
    ];

    for (const badUrl of badUrls) {
      assert.throws(
        () => validateAndNormalizeBaseUrl(badUrl),
        (err: unknown) => {
          assert.equal(isSystemApiError(err), true);
          if (!isSystemApiError(err)) return false;
          assert.equal(err.kind, "configuration");
          assert.equal(err.message.includes(urlSentinel), false, "URL error message must not echo URL sentinel");
          assert.equal(JSON.stringify(err.toJSON()).includes(urlSentinel), false);
          return true;
        }
      );
    }
  });

  it("sentinels in canonical error server messages are never exposed in http_error", async () => {
    const serverMessageSentinel = "SECRET_CANONICAL_SERVER_MESSAGE_112233";
    const reqId = "7a44f507-6c2e-4b72-8812-70ceb253b23c";

    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async () =>
        createMockResponse(
          {
            success: false,
            error: { code: "service_unavailable", message: serverMessageSentinel },
            meta: { requestId: reqId, timestamp: "2026-10-09T18:00:00Z" },
          },
          503,
          { "x-request-id": reqId }
        ),
    });

    await assert.rejects(
      () => client.getHealth({ requestId: reqId }),
      (err: unknown) => {
        assert.equal(isSystemApiError(err), true);
        if (!isSystemApiError(err)) return false;
        assert.equal(err.kind, "http_error");
        assert.equal(err.status, 503);
        assert.equal(err.code, "service_unavailable");
        // Must use fixed local status-based message, NEVER echoing server message
        assert.equal(err.message, "Service Unavailable: the system API is temporarily unavailable.");
        assert.equal(err.message.includes(serverMessageSentinel), false);
        assert.equal(JSON.stringify(err.toJSON()).includes(serverMessageSentinel), false);
        assert.equal(err.stack?.includes(serverMessageSentinel), false);
        for (const val of Object.values(err)) {
          assert.equal(String(val).includes(serverMessageSentinel), false);
        }
        return true;
      }
    );
  });
});

describe("SystemApiClient — Caller Cancellation via AbortSignal", () => {
  it("rejects with abort kind when caller aborts prior to call", async () => {
    const controller = new AbortController();
    controller.abort();

    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: async () => {
        throw new Error("Should not be called");
      },
    });

    await assert.rejects(
      () => client.getHealth({ signal: controller.signal }),
      (err: unknown) => isSystemApiError(err) && err.kind === "abort"
    );
  });

  it("rejects with abort kind when caller aborts in-flight call", async () => {
    const controller = new AbortController();
    const slowFetch: typeof fetch = async (_url, init) => {
      return new Promise((_, reject) => {
        if (init?.signal) {
          init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
        }
      });
    };

    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      timeoutMs: 1000,
      fetch: slowFetch,
    });

    const promise = client.getHealth({ signal: controller.signal });
    setTimeout(() => controller.abort(), 20);

    await assert.rejects(
      () => promise,
      (err: unknown) => isSystemApiError(err) && err.kind === "abort"
    );
  });
});

describe("SystemApiClient — Rejected Redirects", () => {
  it("rejects 301/302 redirects with protocol error kind", async () => {
    const redirectFetch: typeof fetch = async () => {
      return new Response("", {
        status: 302,
        headers: { location: "http://evil.com/phish" },
      });
    };

    const client = createSystemApiClient({
      enabled: true,
      nonProductionOptIn: true,
      environment: { DEV: true },
      baseUrl: "http://127.0.0.1:18084",
      fetch: redirectFetch,
    });

    await assert.rejects(
      () => client.getHealth(),
      (err: unknown) => {
        assert.equal(isSystemApiError(err), true);
        if (!isSystemApiError(err)) return false;
        assert.equal(err.kind, "protocol");
        assert.equal(err.message.includes("Redirects are rejected"), true);
        return true;
      }
    );
  });
});

describe("Generator & Stale Artifact Verification (C3)", () => {
  it("generates system types matching the checked-in disk artifact", () => {
    const result = checkSystemApiTypes();
    assert.equal(result.ok, true, `Artifact check failed: ${result.reason}`);
  });

  it("dynamically changes generated types when AST schema property types change", () => {
    const mutatedSpec = structuredClone(openApiSpec);
    // Mutate HealthStatusResponse.data.status type string -> integer
    const healthSchema = mutatedSpec.components.schemas["HealthStatusResponse"] as {
      properties: { data: { properties: { status: { type: string } } } };
    };
    healthSchema.properties.data.properties.status.type = "integer";

    const generated = generateSystemApiTypes(mutatedSpec);
    assert.equal(generated.includes("status: number;"), true, "Must dynamically generate number for mutated integer property");
    assert.equal(generated.includes("status: string;"), false, "Must not generate string for mutated integer property");
  });

  it("dynamically changes generated types when required field is added to SuccessMeta in AST", () => {
    const mutatedSpec = structuredClone(openApiSpec);
    const metaSchema = mutatedSpec.components.schemas["SuccessMeta"] as {
      properties: Record<string, { type: string }>;
      required: string[];
    };
    metaSchema.properties["epoch"] = { type: "integer" };
    metaSchema.required.push("epoch");

    const generated = generateSystemApiTypes(mutatedSpec);
    assert.equal(generated.includes("epoch: number;"), true, "Must dynamically generate new property epoch: number");
  });

  it("dynamically changes generated types when referenced primitive schema in SuccessMeta changes", () => {
    const mutatedSpec = structuredClone(openApiSpec);
    const metaSchema = mutatedSpec.components.schemas["SuccessMeta"] as {
      properties: Record<string, { type: string }>;
    };
    metaSchema.properties["requestId"]!.type = "integer";

    const generated = generateSystemApiTypes(mutatedSpec);
    assert.equal(generated.includes("requestId: number;"), true);
  });

  it("provides isolated negative proof when disk artifact is stale or modified", () => {
    const tempFile = path.join(repositoryRoot, "src/lib/api/system-types.test-temp.ts");
    try {
      fs.writeFileSync(tempFile, "// Stale content that does not match OpenAPI", "utf8");
      const check = checkSystemApiTypes(tempFile, DEFAULT_SPEC_PATH);
      assert.equal(check.ok, false);
      assert.equal(check.reason?.includes("does not match"), true);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  it("fails closed when operation schema contains unsupported sibling assertion { $ref, not: true }", () => {
    const mutatedSpec = structuredClone(openApiSpec);
    mutatedSpec.paths["/health"]!.get!.responses!["200"]!.content!["application/json"]!.schema = {
      $ref: "#/components/schemas/HealthStatusResponse",
      not: true,
    } as unknown as { $ref: string };

    assert.throws(
      () => generateSystemApiTypes(mutatedSpec),
      /Unsupported schema keyword 'not'|Unsupported sibling assertion 'not'/
    );
  });

  it("fails closed when operation schema has sibling assertion { $ref, type: 'object' }", () => {
    const mutatedSpec = structuredClone(openApiSpec);
    mutatedSpec.paths["/health"]!.get!.responses!["200"]!.content!["application/json"]!.schema = {
      $ref: "#/components/schemas/HealthStatusResponse",
      type: "object",
    } as unknown as { $ref: string };

    assert.throws(
      () => generateSystemApiTypes(mutatedSpec),
      /Unsupported sibling assertion 'type'/
    );
  });

  it("fails closed when OpenAPI spec contains unsupported constructs like oneOf", () => {
    const mutatedSpec = structuredClone(openApiSpec);
    mutatedSpec.components.schemas["HealthStatusResponse"]!["oneOf"] = [{ type: "string" }];

    assert.throws(
      () => generateSystemApiTypes(mutatedSpec),
      /Unsupported schema keyword 'oneOf'/
    );
  });

  it("fails closed when a referenced schema contains unsupported constructs", () => {
    const mutatedSpec = structuredClone(openApiSpec);
    mutatedSpec.components.schemas["SuccessMeta"]!["oneOf"] = [{ type: "string" }];

    assert.throws(
      () => generateSystemApiTypes(mutatedSpec),
      /Unsupported schema keyword 'oneOf'/
    );
  });

  it("fails closed when OpenAPI spec has an unresolvable or dangling reference", () => {
    const mutatedSpec = structuredClone(openApiSpec);
    mutatedSpec.paths["/health"]!.get!.responses!["200"]!.content!["application/json"]!.schema!.$ref =
      "#/components/schemas/NonExistentSchema";

    assert.throws(
      () => generateSystemApiTypes(mutatedSpec),
      /Dangling schema reference|Unresolved schema reference/
    );
  });

  it("fails closed when schema references form a circular cycle", () => {
    const mutatedSpec = structuredClone(openApiSpec);
    // Introduce cycle: HealthStatusResponse -> Foo -> Bar -> Foo
    mutatedSpec.components.schemas["Foo"] = {
      type: "object",
      properties: {
        bar: { $ref: "#/components/schemas/Bar" },
      },
    };
    mutatedSpec.components.schemas["Bar"] = {
      type: "object",
      properties: {
        foo: { $ref: "#/components/schemas/Foo" },
      },
    };
    mutatedSpec.components.schemas["HealthStatusResponse"]!.properties = {
      foo: { $ref: "#/components/schemas/Foo" },
    };

    assert.throws(
      () => generateSystemApiTypes(mutatedSpec),
      /Circular schema reference detected/
    );
  });

  it("rejects unknown CLI arguments with exit code 1 without touching output file", () => {
    const unknownArgExit = runCli(["--chekc"]);
    assert.equal(unknownArgExit, 1, "Must exit with code 1 for unknown arguments");

    const fooArgExit = runCli(["--foo"]);
    assert.equal(fooArgExit, 1, "Must exit with code 1 for unknown arguments");

    // Standard --check succeeds
    const checkArgExit = runCli(["--check"]);
    assert.equal(checkArgExit, 0, "Must exit with code 0 for valid --check argument");
  });
});
