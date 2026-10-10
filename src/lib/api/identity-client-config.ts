/**
 * Gaza Gateway / Palestinian Airlines
 * Phase 13B Identity API — Configuration, Environment, and Base URL Normalization
 */

import { IdentityApiError } from "./identity-client-errors.ts";

export interface IdentityApiEnvironment {
  NODE_ENV?: string | undefined;
  MODE?: string | undefined;
  PROD?: boolean | undefined;
  DEV?: boolean | undefined;
}

export interface IdentityApiClientConfig {
  /**
   * Whether live HTTPS calls are enabled.
   * Defaults to false (mock mode with zero network calls).
   */
  enabled?: boolean | undefined;

  /**
   * Explicit opt-in flag for non-production environments.
   * Must be explicitly true if enabled is true.
   */
  nonProductionOptIn?: boolean | undefined;

  /**
   * Base URL for the identity API.
   * Required when live mode is enabled. Must be HTTPS on approved loopback or staging host.
   */
  baseUrl?: string | undefined;

  /**
   * Overall request timeout in milliseconds, covering queue wait, bootstrap, dispatch, and body reading.
   * Defaults to 10000ms.
   */
  timeoutMs?: number | undefined;

  /**
   * Typed environment values (e.g. from Vite import.meta.env or Node process.env).
   * Pure helpers do not access global process/import.meta directly.
   */
  environment?: IdentityApiEnvironment | undefined;

  /**
   * Injectable fetch implementation (e.g. for Node test runners or mocked transports).
   */
  fetch?: typeof fetch | undefined;
}

export interface ResolvedIdentityApiClientConfig {
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
export function isProductionEnvironment(env?: IdentityApiEnvironment): boolean {
  if (!env) return false;
  if (env.PROD === true) return true;
  if (typeof env.MODE === "string" && env.MODE.trim().toLowerCase() === "production") return true;
  if (typeof env.NODE_ENV === "string" && env.NODE_ENV.trim().toLowerCase() === "production") return true;
  return false;
}

/**
 * Returns true only if the provided environment is a verified, known non-production environment.
 * Enforces strict ambiguity gate: any unknown or contradictory flag fails closed.
 */
export function isKnownNonProductionEnvironment(env?: IdentityApiEnvironment): boolean {
  if (!env) return false;

  // Any production flag fails closed
  if (isProductionEnvironment(env)) return false;

  // Type checks
  if (env.PROD !== undefined && typeof env.PROD !== "boolean") return false;
  if (env.DEV !== undefined && typeof env.DEV !== "boolean") return false;

  // Contradiction checks
  if (env.DEV === true && env.PROD === true) return false;
  if (env.DEV === false) return false; // Explicit DEV: false in non-prod opt-in is contradictory

  // Validate MODE if provided
  let hasValidMode = false;
  if (env.MODE !== undefined) {
    if (typeof env.MODE !== "string" || !env.MODE.trim()) return false;
    const modeLower = env.MODE.trim().toLowerCase();
    if (!KNOWN_NON_PRODUCTION_MODES.has(modeLower)) return false;
    hasValidMode = true;
  }

  // Validate NODE_ENV if provided
  let hasValidNodeEnv = false;
  if (env.NODE_ENV !== undefined) {
    if (typeof env.NODE_ENV !== "string" || !env.NODE_ENV.trim()) return false;
    const nodeEnvLower = env.NODE_ENV.trim().toLowerCase();
    if (!KNOWN_NON_PRODUCTION_MODES.has(nodeEnvLower)) return false;
    hasValidNodeEnv = true;
  }

  const hasDev = env.DEV === true;

  // Must have at least one valid positive non-production indicator
  return hasDev || hasValidMode || hasValidNodeEnv;
}

export const MIN_TIMEOUT_MS = 1;
export const MAX_TIMEOUT_MS = 60000;
export const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Validates that timeoutMs is a finite positive integer within [1, 60000].
 */
export function validateTimeoutMs(timeoutMs: unknown): number {
  if (
    typeof timeoutMs !== "number" ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < MIN_TIMEOUT_MS ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new IdentityApiError({
      kind: "configuration",
      message: "Invalid timeout: expected integer between 1 and 60000 milliseconds.",
    });
  }
  return timeoutMs;
}

/**
 * Validates and normalizes the base URL for the Identity API client.
 *
 * Requirements:
 * - HTTPS ONLY: loopback (localhost / 127.0.0.1 / IPv6) or staging-api.gazaairport.com.
 * - HTTP is strictly rejected everywhere (including loopback).
 * - Reject userinfo, query, hash (including empty delimiters @, ?, #), ambiguous paths, and unapproved origins.
 * - Reject accidental production API base (api.gazaairport.com, etc.).
 * - Normalize base path to preserve exact /api/v1 without duplicate or lost slashes.
 */
export function validateAndNormalizeBaseUrl(rawUrl: string): string {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new IdentityApiError({
      kind: "configuration",
      message: "Base URL must be a non-empty string.",
    });
  }

  const trimmed = rawUrl.trim();

  // Deliberate raw ambiguity checks (including empty delimiters)
  if (trimmed.includes("@")) {
    throw new IdentityApiError({
      kind: "configuration",
      message: "Base URL must not contain user credentials (userinfo delimiter '@' is prohibited).",
    });
  }

  if (trimmed.includes("?")) {
    throw new IdentityApiError({
      kind: "configuration",
      message: "Base URL must not contain query parameters (query delimiter '?' is prohibited).",
    });
  }

  if (trimmed.includes("#")) {
    throw new IdentityApiError({
      kind: "configuration",
      message: "Base URL must not contain a hash/fragment identifier (hash delimiter '#' is prohibited).",
    });
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new IdentityApiError({
      kind: "configuration",
      message: "Invalid base URL: malformed URL format.",
    });
  }

  // Reject userinfo
  if (parsed.username || parsed.password) {
    throw new IdentityApiError({
      kind: "configuration",
      message: "Base URL must not contain user credentials (userinfo is prohibited).",
    });
  }

  // Reject query string
  if (parsed.search) {
    throw new IdentityApiError({
      kind: "configuration",
      message: "Base URL must not contain query parameters.",
    });
  }

  // Reject hash / fragment
  if (parsed.hash) {
    throw new IdentityApiError({
      kind: "configuration",
      message: "Base URL must not contain a hash/fragment identifier.",
    });
  }

  const protocol = parsed.protocol.toLowerCase();
  const hostname = parsed.hostname.toLowerCase();

  // Check accidental production API hosts
  if (ACCIDENTAL_PRODUCTION_HOSTS.has(hostname)) {
    throw new IdentityApiError({
      kind: "configuration",
      message: "Production API base URL is disallowed.",
    });
  }

  // Enforce HTTPS ONLY — HTTP is strictly forbidden for identity transport
  if (protocol === "http:") {
    throw new IdentityApiError({
      kind: "configuration",
      message: "HTTP protocol is strictly prohibited; identity transport requires HTTPS only.",
    });
  }

  if (protocol !== "https:") {
    throw new IdentityApiError({
      kind: "configuration",
      message: "Unsupported protocol; identity transport requires HTTPS only.",
    });
  }

  // Check approved hostnames
  const isLoopback = ALLOWED_LOOPBACK_HOSTNAMES.has(hostname);
  const isStaging = hostname === ACCEPTED_STAGING_API_HOST;

  if (!isLoopback && !isStaging) {
    throw new IdentityApiError({
      kind: "configuration",
      message: "HTTPS protocol is permitted only on approved loopback hosts or accepted staging API host.",
    });
  }

  // Reject arbitrary or custom ports on staging HTTPS origin
  if (isStaging && parsed.port && parsed.port !== "443") {
    throw new IdentityApiError({
      kind: "configuration",
      message: "Accepted HTTPS staging origin must not specify a custom port.",
    });
  }

  // Path validation & normalization
  const pathname = parsed.pathname;

  // Disallow duplicate slashes or URL encoded slashes/spaces in path
  if (pathname.includes("//") || /%2f/i.test(pathname) || /%20/.test(pathname)) {
    throw new IdentityApiError({
      kind: "configuration",
      message: "Ambiguous base URL path format; path contains invalid delimiters or encodings.",
    });
  }

  const isRoot = pathname === "" || pathname === "/";
  const isApiV1 = pathname === "/api/v1" || pathname === "/api/v1/";

  if (!isRoot && !isApiV1) {
    throw new IdentityApiError({
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
export function resolveIdentityApiClientConfig(
  config?: IdentityApiClientConfig
): ResolvedIdentityApiClientConfig {
  const isExplicitEnabled = config?.enabled === true;

  // Validate timeoutMs if supplied, regardless of enabled state
  const timeoutMs =
    config?.timeoutMs !== undefined ? validateTimeoutMs(config.timeoutMs) : DEFAULT_TIMEOUT_MS;

  if (!isExplicitEnabled) {
    // If enabled is false or undefined, verify no contradictory opt-in was provided
    if (config?.nonProductionOptIn === true) {
      throw new IdentityApiError({
        kind: "configuration",
        message:
          "Contradictory configuration: nonProductionOptIn is true but enabled is not set to true.",
      });
    }

    // Default mode: disabled mock with zero network calls
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
    throw new IdentityApiError({
      kind: "configuration",
      message: "Enabling live Identity API client requires explicit nonProductionOptIn: true.",
    });
  }

  // Live mode requires explicit, verified non-production environment
  if (!config.environment) {
    throw new IdentityApiError({
      kind: "configuration",
      message:
        "Enabling live Identity API client requires explicit non-production environment configuration.",
    });
  }

  if (isProductionEnvironment(config.environment)) {
    throw new IdentityApiError({
      kind: "configuration",
      message: "Identity API client cannot be enabled in production environment (disallowed).",
    });
  }

  if (!isKnownNonProductionEnvironment(config.environment)) {
    throw new IdentityApiError({
      kind: "configuration",
      message:
        "Contradictory or unknown environment configuration; live client can only be enabled in verified non-production environments.",
    });
  }

  if (!config.baseUrl) {
    throw new IdentityApiError({
      kind: "configuration",
      message: "baseUrl is required when Identity API client is enabled.",
    });
  }

  const normalizedBaseUrl = validateAndNormalizeBaseUrl(config.baseUrl);

  const fetchFn = config.fetch ?? globalThis.fetch;
  if (typeof fetchFn !== "function") {
    throw new IdentityApiError({
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
