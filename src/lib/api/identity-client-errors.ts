/**
 * Gaza Gateway / Palestinian Airlines
 * Phase 13B Identity API — Safe Typed Error Model
 */

export type IdentityApiErrorKind =
  | "configuration" // Invalid client configuration, unapproved origin/protocol, or production opt-in violation
  | "network"       // Low-level network failure (DNS, connection refused, offline)
  | "timeout"       // Request deadline exceeded (covering dispatch and body read)
  | "abort"         // Caller-directed cancellation via AbortSignal or client disposal
  | "protocol"      // Rejected redirects, invalid Content-Type, malformed JSON, envelope/schema mismatch, unexpected status
  | "http_error";   // Safe canonical non-2xx HTTP responses (e.g. 401 Unauthorized, 419 CSRF mismatch, 422 Validation Error)

export interface IdentityApiErrorOptions {
  kind: IdentityApiErrorKind;
  message: string;
  status?: number | undefined;
  code?: string | undefined;
  requestId?: string | undefined;
  retryAfter?: number | undefined;
  fields?: Record<string, string[]> | undefined;
}

const MAX_ERROR_MESSAGE_LENGTH = 300;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_CODE_REGEX = /^[a-z0-9_-]{1,64}$/i;

export const CANONICAL_ERROR_CODES = new Set([
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "method_not_allowed",
  "csrf_mismatch",
  "csrf_token_mismatch",
  "validation_error",
  "too_many_requests",
  "internal_error",
  "service_unavailable",
  "http_error",
]);

export class IdentityApiError extends Error {
  readonly kind: IdentityApiErrorKind;
  readonly status?: number | undefined;
  readonly code?: string | undefined;
  readonly requestId?: string | undefined;
  readonly retryAfter?: number | undefined;
  readonly fields?: Record<string, string[]> | undefined;

  constructor(options: IdentityApiErrorOptions) {
    // Strictly bounded and sanitized message length to avoid leaking unbounded payloads or tokens
    const sanitizedMessage = (options.message || "Unknown Identity API error")
      .trim()
      .slice(0, MAX_ERROR_MESSAGE_LENGTH);
    super(sanitizedMessage);
    this.name = "IdentityApiError";
    this.kind = options.kind;

    if (
      options.status !== undefined &&
      typeof options.status === "number" &&
      Number.isInteger(options.status)
    ) {
      this.status = options.status;
    }

    if (options.code !== undefined && typeof options.code === "string") {
      const normalizedCode = options.code.trim().toLowerCase();
      this.code = CANONICAL_ERROR_CODES.has(normalizedCode) ? normalizedCode : "http_error";
    }

    if (
      options.requestId !== undefined &&
      typeof options.requestId === "string" &&
      UUID_REGEX.test(options.requestId)
    ) {
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

    if (options.fields && typeof options.fields === "object" && !Array.isArray(options.fields)) {
      const sanitizedFields: Record<string, string[]> = {};
      const ALLOWED_ERROR_FIELDS = new Set([
        "email",
        "password",
        "title",
        "firstName",
        "lastName",
        "phone",
        "token",
        "username",
      ]);

      for (const [k, v] of Object.entries(options.fields)) {
        if (ALLOWED_ERROR_FIELDS.has(k) && Array.isArray(v) && v.length > 0) {
          // Discard arbitrary server strings; keep authentic field identifier mapped to fixed generic message
          sanitizedFields[k] = ["Invalid field value."];
        }
      }
      if (Object.keys(sanitizedFields).length > 0) {
        this.fields = sanitizedFields;
      }
    }

    Object.setPrototypeOf(this, IdentityApiError.prototype);
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
      ...(this.fields !== undefined ? { fields: this.fields } : {}),
    };
  }
}

export function isIdentityApiError(value: unknown): value is IdentityApiError {
  return value instanceof IdentityApiError;
}
