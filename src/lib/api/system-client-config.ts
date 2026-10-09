/**
 * Gaza Gateway / Palestinian Airlines
 * Phase 13A System API — Configuration, Environment, and Base URL Normalization
 */

import { SystemApiError } from "./system-client-errors.ts";

export interface SystemApiEnvironment {
  NODE_ENV?: string | undefined;
  MODE?: string | undefined;
  PROD?: boolean | undefined;
  DEV?: boolean | undefined;
}

export interface SystemApiClientConfig {
  /**
   * Whether live HTTP calls are enabled.
   * Defaults to false (mock mode with zero network calls).
   */
  enabled?: boolean | undefined;

  /**
   * Explicit opt-in flag for non-production environments.
   * Must be explicitly true if enabled is true.
   */
  nonProductionOptIn?: boolean | undefined;

  /**
   * Base URL for the system API.
   * Required when live mode is enabled.
   */
  baseUrl?: string | undefined;

  /**
   * Overall request timeout in milliseconds, covering dispatch and body reading.
   * Defaults to 10000ms.
   */
  timeoutMs?: number | undefined;

  /**
   * Typed environment values (e.g. from Vite import.meta.env or Node process.env).
   * Pure helpers do not access global process/import.meta directly.
   */
  environment?: SystemApiEnvironment | undefined;

  /**
   * Injectable fetch implementation (e.g. for Node test runners or mocked transports).
   */
  fetch?: typeof fetch | undefined;
}

export interface ResolvedSystemApiClientConfig {
  enabled: boolean;
  mode: "mock" | "live";
  baseUrl: string | null;
  timeoutMs: number;
  fetch: typeof fetch;
}

const ACCEPTED_STAGING_API_HOST = "staging-api.gazaairport.com";

const ACCIDENTAL_PRODUCTION_HOSTS = new Set([
  "api.gazaairport.com",
  "www.gazaairport.com",
  "gazaairport.com",
]);

const ALLOWED_LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

const KNOWN_NON_PRODUCTION_MODES = new Set(["development", "test", "staging"]);

/**
 * Returns true if the provided environment represents a production build/environment.
 */
export function isProductionEnvironment(env?: SystemApiEnvironment): boolean {
  if (!env) return false;
  if (env.PROD === true) return true;
  if (typeof env.MODE === "string" && env.MODE.trim().toLowerCase() === "production") return true;
  if (typeof env.NODE_ENV === "string" && env.NODE_ENV.trim().toLowerCase() === "production") return true;
  return false;
}

/**
 * Returns true only if the provided environment is a verified, known non-production environment.
 */
export function isKnownNonProductionEnvironment(env?: SystemApiEnvironment): boolean {
  if (!env) return false;
  if (isProductionEnvironment(env)) return false;

  const hasDev = env.DEV === true;
  const hasValidMode = typeof env.MODE === "string" && KNOWN_NON_PRODUCTION_MODES.has(env.MODE.trim().toLowerCase());
  const hasValidNodeEnv = typeof env.NODE_ENV === "string" && KNOWN_NON_PRODUCTION_MODES.has(env.NODE_ENV.trim().toLowerCase());

  return hasDev || hasValidMode || hasValidNodeEnv;
}

export const MIN_TIMEOUT_MS = 1;
export const MAX_TIMEOUT_MS = 60000;
export const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Validates that timeoutMs is a finite positive integer within [1, 60000].
 * Uses a fixed diagnostic message without echoing caller input.
 */
export function validateTimeoutMs(timeoutMs: unknown): number {
  if (
    typeof timeoutMs !== "number" ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < MIN_TIMEOUT_MS ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new SystemApiError({
      kind: "configuration",
      message: "Invalid timeout: expected integer between 1 and 60000 milliseconds.",
    });
  }
  return timeoutMs;
}

/**
 * Validates and normalizes the base URL for the System API client.
 *
 * Requirements:
 * - Allow http on exact localhost / 127.0.0.1 / IPv6 loopback only.
 * - Allow https on accepted staging API host only (staging-api.gazaairport.com) with standard port.
 * - Reject userinfo, query, hash, ambiguous paths, and unapproved origins.
 * - Reject accidental production API base (api.gazaairport.com, etc.).
 * - Normalize base path to preserve exact /api/v1 without duplicate or lost slashes.
 */
export function validateAndNormalizeBaseUrl(rawUrl: string): string {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new SystemApiError({
      kind: "configuration",
      message: "Base URL must be a non-empty string.",
    });
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    // Never embed raw unparsed URL which could leak sensitive parameters or tokens
    throw new SystemApiError({
      kind: "configuration",
      message: "Invalid base URL: malformed URL format.",
    });
  }

  // Reject userinfo
  if (parsed.username || parsed.password) {
    throw new SystemApiError({
      kind: "configuration",
      message: "Base URL must not contain user credentials (userinfo is prohibited).",
    });
  }

  // Reject query string
  if (parsed.search) {
    throw new SystemApiError({
      kind: "configuration",
      message: "Base URL must not contain query parameters.",
    });
  }

  // Reject hash / fragment
  if (parsed.hash) {
    throw new SystemApiError({
      kind: "configuration",
      message: "Base URL must not contain a hash/fragment identifier.",
    });
  }

  const protocol = parsed.protocol.toLowerCase();
  const hostname = parsed.hostname.toLowerCase();

  // Check accidental production API hosts
  if (ACCIDENTAL_PRODUCTION_HOSTS.has(hostname)) {
    throw new SystemApiError({
      kind: "configuration",
      message: "Production API base URL is disallowed.",
    });
  }

  if (protocol === "http:") {
    if (!ALLOWED_LOOPBACK_HOSTNAMES.has(hostname)) {
      throw new SystemApiError({
        kind: "configuration",
        message: "HTTP protocol is permitted only on approved loopback hosts.",
      });
    }
  } else if (protocol === "https:") {
    if (hostname !== ACCEPTED_STAGING_API_HOST) {
      throw new SystemApiError({
        kind: "configuration",
        message: "HTTPS protocol is permitted only on accepted staging API host.",
      });
    }
    // Reject arbitrary or custom ports on staging HTTPS origin
    if (parsed.port && parsed.port !== "443") {
      throw new SystemApiError({
        kind: "configuration",
        message: "Accepted HTTPS staging origin must not specify a custom port.",
      });
    }
  } else {
    throw new SystemApiError({
      kind: "configuration",
      message: "Unsupported protocol; only http (loopback) and https (staging) are permitted.",
    });
  }

  // Path validation & normalization
  const pathname = parsed.pathname;
  const isRoot = pathname === "" || pathname === "/";
  const isApiV1 = pathname === "/api/v1" || pathname === "/api/v1/";

  if (!isRoot && !isApiV1) {
    throw new SystemApiError({
      kind: "configuration",
      message: "Ambiguous base URL path; only root or '/api/v1' paths are permitted.",
    });
  }

  // Preserve exact /api/v1 normalization without duplicate/trailing slashes
  return `${parsed.protocol}//${parsed.host}/api/v1`;
}

/**
 * Validates caller configuration and returns resolved client settings.
 * Fails closed on invalid or ambiguous configuration.
 */
export function resolveSystemApiClientConfig(
  config?: SystemApiClientConfig
): ResolvedSystemApiClientConfig {
  const isExplicitEnabled = config?.enabled === true;

  // Validate timeoutMs if supplied, regardless of enabled state
  const timeoutMs = config?.timeoutMs !== undefined
    ? validateTimeoutMs(config.timeoutMs)
    : DEFAULT_TIMEOUT_MS;

  if (!isExplicitEnabled) {
    // If enabled is false or undefined, verify no contradictory opt-in was provided
    if (config?.nonProductionOptIn === true) {
      throw new SystemApiError({
        kind: "configuration",
        message: "Contradictory configuration: nonProductionOptIn is true but enabled is not set to true.",
      });
    }

    // Default mode: mock with zero network calls
    return {
      enabled: false,
      mode: "mock",
      baseUrl: null,
      timeoutMs,
      fetch: config?.fetch ?? globalThis.fetch,
    };
  }

  // Live mode requires explicit nonProductionOptIn: true
  if (config.nonProductionOptIn !== true) {
    throw new SystemApiError({
      kind: "configuration",
      message: "Enabling live System API client requires explicit nonProductionOptIn: true.",
    });
  }

  // Live mode requires explicit, verified non-production environment
  if (!config.environment) {
    throw new SystemApiError({
      kind: "configuration",
      message: "Enabling live System API client requires explicit non-production environment configuration.",
    });
  }

  if (isProductionEnvironment(config.environment)) {
    throw new SystemApiError({
      kind: "configuration",
      message: "System API client cannot be enabled in production environment (disallowed).",
    });
  }

  if (!isKnownNonProductionEnvironment(config.environment)) {
    throw new SystemApiError({
      kind: "configuration",
      message: "Contradictory or unknown environment configuration; live client can only be enabled in verified non-production environments.",
    });
  }

  if (!config.baseUrl) {
    throw new SystemApiError({
      kind: "configuration",
      message: "baseUrl is required when System API client is enabled.",
    });
  }

  const normalizedBaseUrl = validateAndNormalizeBaseUrl(config.baseUrl);

  const fetchFn = config.fetch ?? globalThis.fetch;
  if (typeof fetchFn !== "function") {
    throw new SystemApiError({
      kind: "configuration",
      message: "Configured fetch must be a callable function.",
    });
  }

  return {
    enabled: true,
    mode: "live",
    baseUrl: normalizedBaseUrl,
    timeoutMs,
    fetch: fetchFn,
  };
}
