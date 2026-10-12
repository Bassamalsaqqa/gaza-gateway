import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { identityUiClientConfig, isIdentityUiRequested } from "../../src/lib/api/identity-ui-config.ts";
import { resolveIdentityApiClientConfig, validateAndNormalizeBaseUrl, type IdentityApiClientConfig } from "../../src/lib/api/identity-client-config.ts";
import { IdentityApiError, createIdentityApiClient } from "../../src/lib/api/identity-client.ts";
import { createMvpApiClient, MvpApiError } from "../../src/lib/api/mvp-client.ts";
import { z } from "zod";

describe("Shared Hosting Runtime Client Activation & Origin Validation", () => {
  it("defaults to mock mode with zero network requests", async () => {
    // Default environment without VITE_IDENTITY_UI_MODE
    assert.equal(isIdentityUiRequested({}), false);
    const defaultConfig = identityUiClientConfig({});
    assert.equal(defaultConfig.enabled, false);

    // Mock mode explicitly
    assert.equal(isIdentityUiRequested({ VITE_IDENTITY_UI_MODE: "mock" }), false);
    const mockConfig = identityUiClientConfig({ VITE_IDENTITY_UI_MODE: "mock" });
    assert.equal(mockConfig.enabled, false);

    // Zero-network proof: fetch must never be called when disabled
    let networkCalls = 0;
    const fetchStub: typeof fetch = async () => {
      networkCalls++;
      throw new Error("Zero-network violated: fetch was called");
    };

    const identityClient = createIdentityApiClient({ enabled: false, fetch: fetchStub });
    await assert.rejects(
      async () => {
        await identityClient.getAuthCsrfBootstrap();
      },
      IdentityApiError
    );
    assert.equal(networkCalls, 0);

    const mvpClient = createMvpApiClient(
      { enabled: false, fetch: fetchStub },
      () => identityClient
    );
    await assert.rejects(
      async () => {
        await mvpClient.request({
          method: "GET",
          path: "/test",
          realm: "public",
          schema: z.object({}),
        });
      },
      MvpApiError
    );
    assert.equal(networkCalls, 0);
  });

  it("requires explicit productionOptIn for production environment; nonProductionOptIn NEVER authorizes production", () => {
    const prodEnvBase = {
      VITE_IDENTITY_UI_MODE: "backend",
      VITE_IDENTITY_API_BASE_URL: "https://www.gazaairport.com/api/v1",
      MODE: "production",
      DEV: false,
      PROD: true,
      NODE_ENV: "production",
    };

    // nonProductionOptIn alone MUST fail in production
    assert.throws(
      () =>
        identityUiClientConfig({
          ...prodEnvBase,
          VITE_IDENTITY_NONPRODUCTION_OPT_IN: "true",
          VITE_IDENTITY_PRODUCTION_OPT_IN: "false",
        }),
      (err: unknown) => err instanceof IdentityApiError && err.kind === "configuration"
    );

    // Missing productionOptIn completely MUST fail in production
    assert.throws(
      () =>
        identityUiClientConfig({
          ...prodEnvBase,
          VITE_IDENTITY_NONPRODUCTION_OPT_IN: "false",
        }),
      (err: unknown) => err instanceof IdentityApiError && err.kind === "configuration"
    );

    // Explicit productionOptIn authorizes production
    const approvedConfig = identityUiClientConfig({
      ...prodEnvBase,
      VITE_IDENTITY_NONPRODUCTION_OPT_IN: "false",
      VITE_IDENTITY_PRODUCTION_OPT_IN: "true",
    });
    assert.equal(approvedConfig.enabled, true);
    assert.equal(approvedConfig.productionOptIn, true);
    assert.equal(approvedConfig.nonProductionOptIn, false);
    assert.equal(approvedConfig.baseUrl, "https://www.gazaairport.com/api/v1");
  });

  it("approves canonical production hosts: www.gazaairport.com and gazaairport.com (same-origin, no new DNS)", () => {
    const validProdEnv = {
      VITE_IDENTITY_UI_MODE: "backend",
      VITE_IDENTITY_PRODUCTION_OPT_IN: "true",
      MODE: "production",
      DEV: false,
      PROD: true,
      NODE_ENV: "production",
    };

    // Approved primary www host
    const wwwConfig = identityUiClientConfig({
      ...validProdEnv,
      VITE_IDENTITY_API_BASE_URL: "https://www.gazaairport.com/api/v1",
    });
    assert.equal(wwwConfig.baseUrl, "https://www.gazaairport.com/api/v1");

    // Approved apex host
    const apexConfig = identityUiClientConfig({
      ...validProdEnv,
      VITE_IDENTITY_API_BASE_URL: "https://gazaairport.com/api/v1",
    });
    assert.equal(apexConfig.baseUrl, "https://gazaairport.com/api/v1");

    // Root paths correctly normalize to /api/v1
    assert.equal(
      validateAndNormalizeBaseUrl("https://www.gazaairport.com", true),
      "https://www.gazaairport.com/api/v1"
    );
    assert.equal(
      validateAndNormalizeBaseUrl("https://gazaairport.com/", true),
      "https://gazaairport.com/api/v1"
    );
  });

  it("rejects unauthorized subdomain api.gazaairport.com (same-origin production, no new subdomain DNS)", () => {
    const prodEnv = {
      VITE_IDENTITY_UI_MODE: "backend",
      VITE_IDENTITY_PRODUCTION_OPT_IN: "true",
      VITE_IDENTITY_API_BASE_URL: "https://api.gazaairport.com/api/v1",
      MODE: "production",
      DEV: false,
      PROD: true,
      NODE_ENV: "production",
    };

    assert.throws(
      () => identityUiClientConfig(prodEnv),
      (err: unknown) => err instanceof IdentityApiError && err.kind === "configuration"
    );
  });

  it("rejects insecure transport, userinfo, query, fragment, custom ports, and bad paths on production hosts", () => {
    const validProdEnv = {
      VITE_IDENTITY_UI_MODE: "backend",
      VITE_IDENTITY_PRODUCTION_OPT_IN: "true",
      MODE: "production",
      DEV: false,
      PROD: true,
      NODE_ENV: "production",
    };

    const maliciousUrls = [
      "http://www.gazaairport.com/api/v1", // Plain HTTP rejected
      "https://user:pass@www.gazaairport.com/api/v1", // Userinfo rejected
      "https://www.gazaairport.com/api/v1?token=leak", // Query param rejected
      "https://www.gazaairport.com/api/v1#section", // Fragment rejected
      "https://www.gazaairport.com:8443/api/v1", // Non-standard port rejected
      "https://www.gazaairport.com/api/v2", // Incorrect path rejected
      "https://www.gazaairport.com/admin", // Incorrect path rejected
      "https://www.gazaairport.com/api", // Incomplete path rejected
      "https://www.gazaairport.com//api/v1", // Double slash rejected
      "https://evil-gazaairport.com/api/v1", // External domain rejected
      "https://www.gazaairport.com.attacker.com/api/v1", // Subdomain spoof rejected
    ];

    for (const url of maliciousUrls) {
      assert.throws(
        () =>
          identityUiClientConfig({
            ...validProdEnv,
            VITE_IDENTITY_API_BASE_URL: url,
          }),
        (err: unknown) => err instanceof IdentityApiError && err.kind === "configuration",
        `Expected error for URL: ${url}`
      );
    }
  });

  it("rejects ambiguous environment flags (contradictory DEV and PROD)", () => {
    const ambiguousEnvs = [
      { DEV: true, PROD: true, MODE: "production" },
      { DEV: false, PROD: false, MODE: "production" },
      { DEV: true, PROD: false, MODE: "production" },
      { DEV: false, PROD: true, MODE: "development" },
      { DEV: false, PROD: true, MODE: "staging" },
    ];

    for (const env of ambiguousEnvs) {
      assert.throws(
        () =>
          resolveIdentityApiClientConfig({
            enabled: true,
            productionOptIn: true,
            baseUrl: "https://www.gazaairport.com/api/v1",
            environment: env,
          }),
        IdentityApiError,
        `Expected ambiguous environment rejection for ${JSON.stringify(env)}`
      );
    }
  });

  it("supports staging environment on staging.gazaairport.com with nonProductionOptIn", () => {
    const stagingConfig = identityUiClientConfig({
      VITE_IDENTITY_UI_MODE: "backend",
      VITE_IDENTITY_NONPRODUCTION_OPT_IN: "true",
      VITE_IDENTITY_API_BASE_URL: "https://staging.gazaairport.com/api/v1",
      MODE: "staging",
      DEV: true,
      PROD: false,
    });

    assert.equal(stagingConfig.enabled, true);
    assert.equal(stagingConfig.nonProductionOptIn, true);
    assert.equal(stagingConfig.baseUrl, "https://staging.gazaairport.com/api/v1");

    // Rejects production URL in staging mode
    assert.throws(
      () =>
        identityUiClientConfig({
          VITE_IDENTITY_UI_MODE: "backend",
          VITE_IDENTITY_NONPRODUCTION_OPT_IN: "true",
          VITE_IDENTITY_API_BASE_URL: "https://www.gazaairport.com/api/v1",
          MODE: "staging",
          DEV: true,
          PROD: false,
        }),
      IdentityApiError
    );
  });

  it("rejects unauthorized staging host staging-api.gazaairport.com (unproven legacy DNS)", () => {
    assert.throws(
      () =>
        identityUiClientConfig({
          VITE_IDENTITY_UI_MODE: "backend",
          VITE_IDENTITY_NONPRODUCTION_OPT_IN: "true",
          VITE_IDENTITY_API_BASE_URL: "https://staging-api.gazaairport.com/api/v1",
          MODE: "staging",
          DEV: true,
          PROD: false,
        }),
      (err: unknown) => err instanceof IdentityApiError && err.kind === "configuration"
    );
  });

  it("rejects garbage, non-strict-boolean, or invalid opt-in flag values", () => {
    const garbageValues = ["yes", "1", "TRUE", "true ", "banana", "null", "undefined"];

    for (const val of garbageValues) {
      // Production must fail with garbage production opt-in
      assert.throws(
        () =>
          identityUiClientConfig({
            VITE_IDENTITY_UI_MODE: "backend",
            VITE_IDENTITY_PRODUCTION_OPT_IN: val,
            VITE_IDENTITY_API_BASE_URL: "https://www.gazaairport.com/api/v1",
            MODE: "production",
            DEV: false,
            PROD: true,
            NODE_ENV: "production",
          }),
        (err: unknown) => err instanceof IdentityApiError && err.kind === "configuration",
        `Expected rejection for VITE_IDENTITY_PRODUCTION_OPT_IN=${val}`
      );

      // Staging must fail with garbage non-production opt-in
      assert.throws(
        () =>
          identityUiClientConfig({
            VITE_IDENTITY_UI_MODE: "backend",
            VITE_IDENTITY_NONPRODUCTION_OPT_IN: val,
            VITE_IDENTITY_API_BASE_URL: "https://staging.gazaairport.com/api/v1",
            MODE: "staging",
            DEV: true,
            PROD: false,
          }),
        (err: unknown) => err instanceof IdentityApiError && err.kind === "configuration",
        `Expected rejection for VITE_IDENTITY_NONPRODUCTION_OPT_IN=${val}`
      );
    }
  });

  it("ensures live errors NEVER fall back to browser mock", async () => {
    // When backend mode is configured, errors from the backend must bubble up as IdentityApiError / MvpApiError
    // and NEVER silently fallback to mock data or mock state.
    const failureFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Database down",
          },
          meta: {
            requestId: "550e8400-e29b-41d4-a716-446655440000",
            timestamp: "2026-10-12T12:00:00Z",
          },
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": "550e8400-e29b-41d4-a716-446655440000",
          },
        }
      );
    };

    const mvpClient = createMvpApiClient(
      {
        enabled: true,
        productionOptIn: true,
        baseUrl: "https://www.gazaairport.com/api/v1",
        environment: { MODE: "production", DEV: false, PROD: true, NODE_ENV: "production" },
        fetch: failureFetch,
      },
      () => ({
        getStaffCsrfBootstrap: async () => ({ csrfToken: "a".repeat(64), expiresAt: "2026-10-12T13:00:00Z" }),
        getAuthCsrfBootstrap: async () => ({ csrfToken: "b".repeat(64), expiresAt: "2026-10-12T13:00:00Z" }),
      })
    );

    await assert.rejects(
      async () => {
        await mvpClient.request({
          method: "GET",
          path: "/destinations",
          realm: "public",
          schema: z.array(z.unknown()),
          requestId: "550e8400-e29b-41d4-a716-446655440000",
        });
      },
      (err: unknown) => {
        assert(err instanceof MvpApiError);
        assert.equal(err.status, 500);
        return true;
      }
    );
  });
});
