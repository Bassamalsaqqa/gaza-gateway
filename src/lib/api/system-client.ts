/**
 * Gaza Gateway / Palestinian Airlines
 * Phase 13A System API — Isolated Readonly System Client
 *
 * Implements GET /api/v1/health, /health/ready, /version only.
 * Credentials omitted, redirects rejected, request UUID correlation enforced,
 * bounded fetch timeout (including body read), and exact OpenAPI envelope guards.
 */

import type {
  HealthStatusResponse,
  ReadinessStatusResponse,
  VersionResponse,
  ErrorResponse,
  SuccessMeta,
  HealthStatusData,
  ReadinessStatusData,
  VersionData,
} from "./system-types.ts";
import { SystemApiError } from "./system-client-errors.ts";
import {
  type SystemApiClientConfig,
  type ResolvedSystemApiClientConfig,
  resolveSystemApiClientConfig,
  validateTimeoutMs,
} from "./system-client-config.ts";

export interface SystemApiRequestOptions {
  requestId?: string | undefined;
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
}

export interface SystemApiClient {
  readonly isEnabled: boolean;
  readonly mode: "mock" | "live";
  readonly baseUrl: string | null;

  getHealth(options?: SystemApiRequestOptions): Promise<HealthStatusResponse>;
  getReady(options?: SystemApiRequestOptions): Promise<ReadinessStatusResponse>;
  getHealthReady(options?: SystemApiRequestOptions): Promise<ReadinessStatusResponse>;
  getVersion(options?: SystemApiRequestOptions): Promise<VersionResponse>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RFC3339_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|([+-])(\d{2}):(\d{2}))$/i;

export function isValidUuid(val: unknown): val is string {
  return typeof val === "string" && UUID_REGEX.test(val);
}

/**
 * Validates that a string is a strict RFC 3339 / ISO 8601 date-time string
 * matching real calendar days and strict timezone offset bounds (00..23 hours, 00..59 mins).
 */
export function isValidIsoDateTime(val: unknown): val is string {
  if (typeof val !== "string") return false;
  const match = val.match(RFC3339_REGEX);
  if (!match) return false;

  const year = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10);
  const day = parseInt(match[3]!, 10);
  const hour = parseInt(match[4]!, 10);
  const minute = parseInt(match[5]!, 10);
  const second = parseInt(match[6]!, 10);

  if (month < 1 || month > 12) return false;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return false;

  // Strict Gregorian calendar day validation
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const daysInMonths = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const maxDays = daysInMonths[month - 1]!;
  if (day < 1 || day > maxDays) return false;

  // Strict timezone offset bounds validation (e.g. +99:99 must be rejected)
  const tzSign = match[8];
  if (tzSign) {
    const tzHour = parseInt(match[9]!, 10);
    const tzMinute = parseInt(match[10]!, 10);
    if (tzHour < 0 || tzHour > 23 || tzMinute < 0 || tzMinute > 59) {
      return false;
    }
  }

  return true;
}

export function generateUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const MAX_RETRY_AFTER_SECONDS = 86400 * 7; // Max 7 days in seconds

const HTTP_DATE_REGEX =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/;

const HTTP_DATE_MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/**
 * Parses a Retry-After header value into bounded finite seconds.
 * Accepts decimal integer seconds or strict HTTP-Date (IMF-fixdate) format.
 * Arbitrary locale dates or invalid dates are safely ignored (returning undefined).
 */
export function parseRetryAfter(headerValue: string | null | undefined): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();

  // Explicitly reject negative numbers or explicit sign prefixes
  if (trimmed.startsWith("-") || trimmed.startsWith("+")) return undefined;

  // Bounded decimal integer seconds
  if (/^\d+$/.test(trimmed)) {
    const seconds = parseInt(trimmed, 10);
    if (!Number.isFinite(seconds) || seconds < 0) return undefined;
    return Math.min(seconds, MAX_RETRY_AFTER_SECONDS);
  }

  // Strict HTTP-Date format: "Sun, 06 Nov 1994 08:49:37 GMT"
  const match = trimmed.match(HTTP_DATE_REGEX);
  if (match) {
    const day = parseInt(match[1]!, 10);
    const monthStr = match[2]!;
    const year = parseInt(match[3]!, 10);
    const hour = parseInt(match[4]!, 10);
    const minute = parseInt(match[5]!, 10);
    const second = parseInt(match[6]!, 10);

    const month = HTTP_DATE_MONTHS[monthStr];
    if (month === undefined) return undefined;

    if (hour > 23 || minute > 59 || second > 59) return undefined;

    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const daysInMonths = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const maxDays = daysInMonths[month]!;
    if (day < 1 || day > maxDays) return undefined;

    const targetUtcMs = Date.UTC(year, month, day, hour, minute, second);
    const diffSec = Math.ceil((targetUtcMs - Date.now()) / 1000);
    if (!Number.isFinite(diffSec) || diffSec < 0) return 0;
    return Math.min(diffSec, MAX_RETRY_AFTER_SECONDS);
  }

  return undefined;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

function validateSuccessMeta(meta: unknown, expectedRequestId: string): SuccessMeta {
  if (!isPlainObject(meta)) {
    throw new SystemApiError({
      kind: "protocol",
      message: "Malformed response: meta must be an object.",
    });
  }

  const metaKeys = Object.keys(meta);
  if (metaKeys.length !== 2 || !metaKeys.includes("requestId") || !metaKeys.includes("timestamp")) {
    throw new SystemApiError({
      kind: "protocol",
      message: "Malformed response: meta contains invalid properties.",
    });
  }

  const reqId = meta["requestId"];
  if (!isValidUuid(reqId)) {
    throw new SystemApiError({
      kind: "protocol",
      message: "Malformed response: meta.requestId must be a valid UUID string.",
    });
  }

  if (reqId.toLowerCase() !== expectedRequestId.toLowerCase()) {
    throw new SystemApiError({
      kind: "protocol",
      message: "Request ID correlation mismatch in response metadata.",
      requestId: expectedRequestId,
    });
  }

  const ts = meta["timestamp"];
  if (!isValidIsoDateTime(ts)) {
    throw new SystemApiError({
      kind: "protocol",
      message: "Malformed response: meta.timestamp must be a valid ISO 8601 date-time string.",
      requestId: expectedRequestId,
    });
  }

  return {
    requestId: reqId,
    timestamp: ts,
  };
}

function validateHealthData(data: unknown): HealthStatusData {
  if (!isPlainObject(data)) {
    throw new SystemApiError({
      kind: "protocol",
      message: "Malformed response: data must be an object.",
    });
  }

  const dataKeys = Object.keys(data);
  if (dataKeys.length !== 2 || !dataKeys.includes("status") || !dataKeys.includes("timestamp")) {
    throw new SystemApiError({
      kind: "protocol",
      message: "Malformed health response data: unexpected properties.",
    });
  }

  const status = data["status"];
  if (typeof status !== "string" || !status.trim()) {
    throw new SystemApiError({
      kind: "protocol",
      message: "Malformed health response data: status must be a non-empty string.",
    });
  }

  const ts = data["timestamp"];
  if (!isValidIsoDateTime(ts)) {
    throw new SystemApiError({
      kind: "protocol",
      message: "Malformed health response data: timestamp must be a valid ISO 8601 date-time string.",
    });
  }

  return {
    status,
    timestamp: ts,
  };
}

function validateReadinessData(data: unknown): ReadinessStatusData {
  if (!isPlainObject(data)) {
    throw new SystemApiError({
      kind: "protocol",
      message: "Malformed response: data must be an object.",
    });
  }

  const dataKeys = Object.keys(data);
  if (
    dataKeys.length !== 3 ||
    !dataKeys.includes("database") ||
    !dataKeys.includes("migrations") ||
    !dataKeys.includes("queue")
  ) {
    throw new SystemApiError({
      kind: "protocol",
      message: "Malformed readiness response data: unexpected properties.",
    });
  }

  const db = data["database"];
  const migrations = data["migrations"];
  const queue = data["queue"];

  if (typeof db !== "string" || typeof migrations !== "string" || typeof queue !== "string") {
    throw new SystemApiError({
      kind: "protocol",
      message: "Malformed readiness response data: database, migrations, and queue must be strings.",
    });
  }

  return {
    database: db,
    migrations,
    queue,
  };
}

function validateVersionData(data: unknown): VersionData {
  if (!isPlainObject(data)) {
    throw new SystemApiError({
      kind: "protocol",
      message: "Malformed response: data must be an object.",
    });
  }

  const dataKeys = Object.keys(data);
  if (
    dataKeys.length !== 3 ||
    !dataKeys.includes("version") ||
    !dataKeys.includes("commit") ||
    !dataKeys.includes("schemaVersion")
  ) {
    throw new SystemApiError({
      kind: "protocol",
      message: "Malformed version response data: unexpected properties.",
    });
  }

  const version = data["version"];
  const commit = data["commit"];
  const schemaVersion = data["schemaVersion"];

  if (typeof version !== "string" || typeof commit !== "string" || !Number.isInteger(schemaVersion)) {
    throw new SystemApiError({
      kind: "protocol",
      message: "Malformed version response data: version and commit must be strings, schemaVersion must be an integer.",
    });
  }

  return {
    version,
    commit,
    schemaVersion: schemaVersion as number,
  };
}

/**
 * Validates whether a response matches the strict canonical ErrorResponse schema.
 * Rejects extra properties, invalid structures, or malformed data.
 */
function tryParseCanonicalError(parsed: unknown): ErrorResponse | null {
  if (!isPlainObject(parsed)) return null;

  // Strict additionalProperties: false check on top level
  const topKeys = Object.keys(parsed);
  if (topKeys.length !== 3 || !topKeys.includes("success") || !topKeys.includes("error") || !topKeys.includes("meta")) {
    return null;
  }

  if (parsed["success"] !== false) return null;

  const errorObj = parsed["error"];
  if (!isPlainObject(errorObj)) return null;

  const errorKeys = Object.keys(errorObj);
  const hasFields = errorKeys.includes("fields");
  const expectedCount = hasFields ? 3 : 2;
  if (errorKeys.length !== expectedCount || !errorKeys.includes("code") || !errorKeys.includes("message")) {
    return null;
  }

  if (typeof errorObj["code"] !== "string" || !errorObj["code"].trim()) return null;
  if (typeof errorObj["message"] !== "string") return null;

  let fields: Record<string, string[]> | undefined = undefined;
  if (hasFields) {
    if (!isPlainObject(errorObj["fields"])) return null;
    fields = {};
    for (const [k, v] of Object.entries(errorObj["fields"])) {
      if (!Array.isArray(v) || !v.every((item) => typeof item === "string")) return null;
      fields[k] = v;
    }
  }

  const metaObj = parsed["meta"];
  if (!isPlainObject(metaObj)) return null;

  const metaKeys = Object.keys(metaObj);
  if (metaKeys.length !== 2 || !metaKeys.includes("requestId") || !metaKeys.includes("timestamp")) {
    return null;
  }

  if (typeof metaObj["requestId"] !== "string" || !isValidUuid(metaObj["requestId"])) return null;
  if (typeof metaObj["timestamp"] !== "string" || !isValidIsoDateTime(metaObj["timestamp"])) return null;

  return {
    success: false,
    error: {
      code: errorObj["code"],
      message: errorObj["message"],
      ...(fields ? { fields } : {}),
    },
    meta: {
      requestId: metaObj["requestId"],
      timestamp: metaObj["timestamp"],
    },
  };
}

async function fetchWithBoundedTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
  fetchFn: typeof fetch
): Promise<{ response: Response; bodyText: string }> {
  if (callerSignal?.aborted) {
    throw new SystemApiError({
      kind: "abort",
      message: "Request aborted by caller prior to execution.",
    });
  }

  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`System API request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  const onCallerAbort = () => {
    callerAborted = true;
    controller.abort(callerSignal?.reason ?? new Error("Aborted by caller"));
  };

  if (callerSignal) {
    callerSignal.addEventListener("abort", onCallerAbort, { once: true });
  }

  let activeResponse: Response | null = null;

  const abortPromise = new Promise<never>((_, reject) => {
    if (controller.signal.aborted) {
      reject(controller.signal.reason);
      return;
    }
    controller.signal.addEventListener(
      "abort",
      () => {
        if (
          activeResponse?.body &&
          !activeResponse.body.locked &&
          typeof activeResponse.body.cancel === "function"
        ) {
          try {
            activeResponse.body.cancel(controller.signal.reason).catch(() => {});
          } catch {
            // Ignore stream cancel error
          }
        }
        reject(controller.signal.reason);
      },
      { once: true }
    );
  });

  try {
    const response = await Promise.race([
      fetchFn(url, {
        ...init,
        signal: controller.signal,
      }),
      abortPromise,
    ]);

    activeResponse = response;

    // Read full body under the exact same active timeout window
    const bodyTextPromise = response.text();
    // Catch floating background rejection if race loses
    bodyTextPromise.catch(() => {});

    const bodyText = await Promise.race([
      bodyTextPromise,
      abortPromise,
    ]);

    return { response, bodyText };
  } catch (err: unknown) {
    if (callerAborted || callerSignal?.aborted) {
      throw new SystemApiError({
        kind: "abort",
        message: "System API request aborted by caller.",
      });
    }

    if (timedOut || controller.signal.aborted) {
      throw new SystemApiError({
        kind: "timeout",
        message: "System API request timed out (including body reading).",
      });
    }

    const rawMessage = err instanceof Error ? err.message : String(err);
    if (/redirect/i.test(rawMessage)) {
      throw new SystemApiError({
        kind: "protocol",
        message: "Redirects are rejected for System API client.",
      });
    }

    // Never leak internal stack traces or connection parameters in network error message
    throw new SystemApiError({
      kind: "network",
      message: "Network connection failed or host unreachable.",
    });
  } finally {
    clearTimeout(timer);
    if (callerSignal) {
      callerSignal.removeEventListener("abort", onCallerAbort);
    }
  }
}

class SystemApiClientImpl implements SystemApiClient {
  readonly isEnabled: boolean;
  readonly mode: "mock" | "live";
  readonly baseUrl: string | null;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: ResolvedSystemApiClientConfig) {
    this.isEnabled = config.enabled;
    this.mode = config.mode;
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs;
    this.fetchFn = config.fetch;
  }

  async getHealth(options?: SystemApiRequestOptions): Promise<HealthStatusResponse> {
    if (this.mode === "mock") {
      return this.mockHealth(options);
    }
    return this.executeLiveRequest<HealthStatusResponse>(
      "/health",
      validateHealthData,
      options
    );
  }

  async getReady(options?: SystemApiRequestOptions): Promise<ReadinessStatusResponse> {
    if (this.mode === "mock") {
      return this.mockReady(options);
    }
    return this.executeLiveRequest<ReadinessStatusResponse>(
      "/health/ready",
      validateReadinessData,
      options
    );
  }

  async getHealthReady(options?: SystemApiRequestOptions): Promise<ReadinessStatusResponse> {
    return this.getReady(options);
  }

  async getVersion(options?: SystemApiRequestOptions): Promise<VersionResponse> {
    if (this.mode === "mock") {
      return this.mockVersion(options);
    }
    return this.executeLiveRequest<VersionResponse>(
      "/version",
      validateVersionData,
      options
    );
  }

  private mockHealth(options?: SystemApiRequestOptions): HealthStatusResponse {
    if (options?.signal?.aborted) {
      throw new SystemApiError({ kind: "abort", message: "Request aborted by caller." });
    }
    const reqId = this.resolveRequestId(options?.requestId);
    const nowIso = new Date().toISOString();
    return {
      success: true,
      data: {
        status: "ok",
        timestamp: nowIso,
      },
      meta: {
        requestId: reqId,
        timestamp: nowIso,
      },
    };
  }

  private mockReady(options?: SystemApiRequestOptions): ReadinessStatusResponse {
    if (options?.signal?.aborted) {
      throw new SystemApiError({ kind: "abort", message: "Request aborted by caller." });
    }
    const reqId = this.resolveRequestId(options?.requestId);
    const nowIso = new Date().toISOString();
    return {
      success: true,
      data: {
        database: "connected",
        migrations: "up_to_date",
        queue: "healthy",
      },
      meta: {
        requestId: reqId,
        timestamp: nowIso,
      },
    };
  }

  private mockVersion(options?: SystemApiRequestOptions): VersionResponse {
    if (options?.signal?.aborted) {
      throw new SystemApiError({ kind: "abort", message: "Request aborted by caller." });
    }
    const reqId = this.resolveRequestId(options?.requestId);
    const nowIso = new Date().toISOString();
    return {
      success: true,
      data: {
        version: "1.0.0-mock",
        commit: "mock-commit",
        schemaVersion: 1,
      },
      meta: {
        requestId: reqId,
        timestamp: nowIso,
      },
    };
  }

  private resolveRequestId(providedId?: string): string {
    if (providedId !== undefined) {
      if (!isValidUuid(providedId)) {
        throw new SystemApiError({
          kind: "protocol",
          message: "Invalid caller requestId format: expected RFC 4122 UUID string.",
        });
      }
      return providedId;
    }
    return generateUuid();
  }

  private async executeLiveRequest<T extends { success: true; data: unknown; meta: SuccessMeta }>(
    endpointPath: string,
    validateData: (data: unknown) => T["data"],
    options?: SystemApiRequestOptions
  ): Promise<T> {
    // Validate per-request timeout override before any fetch dispatch
    const timeout = options?.timeoutMs !== undefined
      ? validateTimeoutMs(options.timeoutMs)
      : this.timeoutMs;

    const requestId = this.resolveRequestId(options?.requestId);
    const url = `${this.baseUrl}${endpointPath}`;

    const headers: Record<string, string> = {
      Accept: "application/json",
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    };

    const init: RequestInit = {
      method: "GET",
      headers,
      credentials: "omit",
      redirect: "error",
    };

    const { response, bodyText } = await fetchWithBoundedTimeout(
      url,
      init,
      timeout,
      options?.signal,
      this.fetchFn
    );

    // Reject redirects explicitly if transport did not already fail closed
    if ((response.status >= 300 && response.status < 400) || (response as { type?: string }).type === "opaqueredirect") {
      throw new SystemApiError({
        kind: "protocol",
        status: response.status,
        message: "Redirects are rejected for System API client.",
        requestId,
      });
    }

    // Exact media type verification
    const contentType = response.headers.get("content-type") ?? "";
    const mediaType = contentType.split(";")[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") {
      throw new SystemApiError({
        kind: "protocol",
        status: response.status,
        message: "Invalid Content-Type: expected application/json.",
        requestId,
      });
    }

    // JSON parsing with safe error handling
    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      throw new SystemApiError({
        kind: "protocol",
        status: response.status,
        message: "Failed to parse response body as JSON.",
        requestId,
      });
    }

    const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
    const responseHeaderRequestId = response.headers.get("x-request-id");

    // Handle non-2xx status responses
    if (response.status < 200 || response.status >= 300) {
      const canonicalError = tryParseCanonicalError(parsed);
      if (!canonicalError) {
        // Non-canonical error bodies must be classified as protocol error, not canonical HTTP error
        throw new SystemApiError({
          kind: "protocol",
          status: response.status,
          message: `Non-canonical error response on HTTP status ${response.status}.`,
          requestId,
          retryAfter,
        });
      }

      // Validate machine-code grammar on canonical error code
      const SAFE_CODE_REGEX = /^[a-z0-9_-]{1,64}$/i;
      if (!SAFE_CODE_REGEX.test(canonicalError.error.code)) {
        throw new SystemApiError({
          kind: "protocol",
          status: response.status,
          message: "Non-canonical error response: invalid error code format.",
          requestId,
          retryAfter,
        });
      }

      // Correlate requestId in canonical error meta
      if (canonicalError.meta.requestId.toLowerCase() !== requestId.toLowerCase()) {
        throw new SystemApiError({
          kind: "protocol",
          status: response.status,
          message: "Request ID correlation mismatch on error response metadata.",
          requestId,
        });
      }

      // If X-Request-Id header is present on error, it must also be valid and correlate
      if (responseHeaderRequestId) {
        if (!isValidUuid(responseHeaderRequestId) || responseHeaderRequestId.toLowerCase() !== requestId.toLowerCase()) {
          throw new SystemApiError({
            kind: "protocol",
            status: response.status,
            message: "Response header X-Request-Id correlation mismatch on error response.",
            requestId,
          });
        }
      }

      const getCanonicalErrorMessage = (status: number): string => {
        switch (status) {
          case 400: return "Bad Request: the request was rejected by the system API.";
          case 404: return "Not Found: the requested system API resource does not exist.";
          case 429: return "Too Many Requests: rate limit exceeded.";
          case 503: return "Service Unavailable: the system API is temporarily unavailable.";
          default:
            if (status >= 400 && status < 500) {
              return `System API client error (HTTP ${status}).`;
            }
            return `System API server error (HTTP ${status}).`;
        }
      };

      throw new SystemApiError({
        kind: "http_error",
        status: response.status,
        code: canonicalError.error.code,
        message: getCanonicalErrorMessage(response.status),
        requestId,
        retryAfter,
      });
    }

    // Handle 2xx success response
    if (responseHeaderRequestId) {
      if (!isValidUuid(responseHeaderRequestId) || responseHeaderRequestId.toLowerCase() !== requestId.toLowerCase()) {
        throw new SystemApiError({
          kind: "protocol",
          status: response.status,
          message: "Response header X-Request-Id correlation mismatch on success response.",
          requestId,
        });
      }
    }

    if (!isPlainObject(parsed)) {
      throw new SystemApiError({
        kind: "protocol",
        status: response.status,
        message: "Malformed response: expected top-level JSON object.",
        requestId,
      });
    }

    // Reject success false on 2xx
    if (parsed["success"] === false) {
      throw new SystemApiError({
        kind: "protocol",
        status: response.status,
        message: "Invalid response: success: false returned on 2xx status.",
        requestId,
      });
    }

    if (parsed["success"] !== true) {
      throw new SystemApiError({
        kind: "protocol",
        status: response.status,
        message: "Malformed response: success must be boolean true.",
        requestId,
      });
    }

    // Enforce additionalProperties: false on top-level envelope
    const topKeys = Object.keys(parsed);
    if (topKeys.length !== 3 || !topKeys.includes("success") || !topKeys.includes("data") || !topKeys.includes("meta")) {
      throw new SystemApiError({
        kind: "protocol",
        status: response.status,
        message: "Malformed response envelope: unexpected top-level properties.",
        requestId,
      });
    }

    const validatedMeta = validateSuccessMeta(parsed["meta"], requestId);
    const validatedData = validateData(parsed["data"]);

    return {
      success: true,
      data: validatedData,
      meta: validatedMeta,
    } as T;
  }
}

/**
 * Creates an isolated, typed, readonly System API client instance.
 * Defaults to disabled/mock mode with zero network calls.
 */
export function createSystemApiClient(config?: SystemApiClientConfig): SystemApiClient {
  const resolvedConfig = resolveSystemApiClientConfig(config);
  return new SystemApiClientImpl(resolvedConfig);
}
