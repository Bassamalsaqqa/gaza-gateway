/**
 * Gaza Gateway / Palestinian Airlines
 * Phase 13A System API — Safe Typed Error Model
 */

export type SystemApiErrorKind =
  | "configuration" // Invalid client configuration, unapproved origin, or production opt-in violation
  | "network"       // Low-level network failure (DNS, connection refused, offline)
  | "timeout"       // Request deadline exceeded (covering both request dispatch and body read)
  | "abort"         // Caller-directed cancellation via AbortSignal
  | "protocol"      // Rejected redirects, invalid Content-Type, malformed JSON, envelope/correlation mismatch
  | "http_error";   // Safe canonical non-2xx HTTP responses (e.g. 503 Service Unavailable, 429 Too Many Requests)

export interface SystemApiErrorOptions {
  kind: SystemApiErrorKind;
  message: string;
  status?: number | undefined;
  code?: string | undefined;
  requestId?: string | undefined;
  retryAfter?: number | undefined;
}

const MAX_ERROR_MESSAGE_LENGTH = 300;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_CODE_REGEX = /^[a-z0-9_-]{1,64}$/i;

export class SystemApiError extends Error {
  readonly kind: SystemApiErrorKind;
  readonly status?: number | undefined;
  readonly code?: string | undefined;
  readonly requestId?: string | undefined;
  readonly retryAfter?: number | undefined;

  constructor(options: SystemApiErrorOptions) {
    // Strictly bounded and sanitized message length to avoid leaking unbounded payloads or tokens
    const sanitizedMessage = (options.message || "Unknown System API error")
      .trim()
      .slice(0, MAX_ERROR_MESSAGE_LENGTH);
    super(sanitizedMessage);
    this.name = "SystemApiError";
    this.kind = options.kind;
    if (options.status !== undefined && typeof options.status === "number" && Number.isInteger(options.status)) {
      this.status = options.status;
    }
    if (options.code !== undefined && typeof options.code === "string" && SAFE_CODE_REGEX.test(options.code)) {
      this.code = options.code;
    }
    if (options.requestId !== undefined && typeof options.requestId === "string" && UUID_REGEX.test(options.requestId)) {
      this.requestId = options.requestId;
    }
    if (
      options.retryAfter !== undefined &&
      typeof options.retryAfter === "number" &&
      Number.isFinite(options.retryAfter) &&
      options.retryAfter >= 0
    ) {
      this.retryAfter = options.retryAfter;
    }

    Object.setPrototypeOf(this, SystemApiError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      kind: this.kind,
      message: this.message,
      ...(this.status !== undefined ? { status: this.status } : {}),
      ...(this.code !== undefined ? { code: this.code } : {}),
      ...(this.requestId !== undefined ? { requestId: this.requestId } : {}),
      ...(this.retryAfter !== undefined ? { retryAfter: this.retryAfter } : {}),
    };
  }
}

export function isSystemApiError(value: unknown): value is SystemApiError {
  return value instanceof SystemApiError;
}
