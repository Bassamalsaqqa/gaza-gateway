/**
 * Gaza Gateway / Palestinian Airlines
 * Phase 13B Identity API — Safe Closed Validators
 */

import type {
  SuccessMeta,
  CsrfTokenResponse,
  RegisterRequest,
  LoginRequest,
  PasswordForgotRequest,
  PasswordResetRequest,
  EmailVerifyRequest,
  PassengerEmailResendRequest,
  StaffLoginRequest,
  PassengerRegisterReceiptData,
  PassengerAuthData,
  StaffPendingAuthData,
  StaffProfile,
  ErrorResponse,
} from "./identity-types.ts";
import { IdentityApiError } from "./identity-client-errors.ts";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RFC3339_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|([+-])(\d{2}):(\d{2}))$/i;
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isValidUuid(val: unknown): val is string {
  return typeof val === "string" && UUID_REGEX.test(val);
}

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

  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const daysInMonths = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const maxDays = daysInMonths[month - 1]!;
  if (day < 1 || day > maxDays) return false;

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

/**
 * Counts Unicode code points in a string (handling surrogate pairs / multi-byte characters).
 */
export function countUnicodeCodePoints(str: string): number {
  return [...str].length;
}

/**
 * Checks whether a string contains well-formed Unicode (rejecting lone surrogates).
 */
export function isWellFormedUnicode(str: string): boolean {
  if (typeof (str as unknown as { isWellFormed?: () => boolean }).isWellFormed === "function") {
    return (str as unknown as { isWellFormed: () => boolean }).isWellFormed();
  }
  try {
    encodeURIComponent(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates request options as a closed shape.
 * Fails closed on any unexpected properties or malformed fields.
 */
export function validateRequestOptions(
  options?: unknown
): { requestId?: string; signal?: AbortSignal; timeoutMs?: number } | undefined {
  if (options === undefined) return undefined;
  if (!isPlainObject(options)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid request options: options must be an object.",
    });
  }

  const allowedKeys = new Set(["requestId", "signal", "timeoutMs"]);
  for (const k of Object.keys(options)) {
    if (!allowedKeys.has(k)) {
      throw new IdentityApiError({
        kind: "protocol",
        message: "Invalid request options: unexpected extra property.",
      });
    }
  }

  let requestId: string | undefined = undefined;
  if ("requestId" in options && options["requestId"] !== undefined) {
    if (typeof options["requestId"] !== "string" || !isValidUuid(options["requestId"])) {
      throw new IdentityApiError({
        kind: "protocol",
        message: "Invalid request options: requestId must be a valid RFC 4122 UUID string.",
      });
    }
    requestId = options["requestId"];
  }

  let signal: AbortSignal | undefined = undefined;
  if ("signal" in options && options["signal"] !== undefined) {
    const rawSignal = options["signal"];
    const isValidSignal =
      rawSignal instanceof AbortSignal ||
      (typeof rawSignal === "object" &&
        rawSignal !== null &&
        typeof (rawSignal as { aborted?: unknown }).aborted === "boolean" &&
        typeof (rawSignal as { addEventListener?: unknown }).addEventListener === "function" &&
        typeof (rawSignal as { removeEventListener?: unknown }).removeEventListener === "function");
    if (!isValidSignal) {
      throw new IdentityApiError({
        kind: "protocol",
        message: "Invalid request options: signal must be an AbortSignal instance.",
      });
    }
    signal = rawSignal as AbortSignal;
  }

  let timeoutMs: number | undefined = undefined;
  if ("timeoutMs" in options && options["timeoutMs"] !== undefined) {
    if (
      typeof options["timeoutMs"] !== "number" ||
      !Number.isInteger(options["timeoutMs"]) ||
      options["timeoutMs"] < 1 ||
      options["timeoutMs"] > 60000
    ) {
      throw new IdentityApiError({
        kind: "protocol",
        message: "Invalid request options: timeoutMs must be an integer between 1 and 60000.",
      });
    }
    timeoutMs = options["timeoutMs"];
  }

  return {
    ...(requestId !== undefined ? { requestId } : {}),
    ...(signal !== undefined ? { signal } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  };
}

/**
 * Generates an RFC 4122 v4 UUID using cryptographically secure RNG.
 * Fails closed without Math.random fallback if crypto is unavailable.
 */
export function generateCryptographicUuid(): string {
  if (typeof globalThis.crypto !== "undefined") {
    if (typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
    if (typeof globalThis.crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
      bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10xx
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    }
  }
  throw new IdentityApiError({
    kind: "configuration",
    message: "Cryptographically secure random number generator is unavailable.",
  });
}

const MAX_RETRY_AFTER_SECONDS = 86400 * 7;
const HTTP_DATE_REGEX =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/;

const HTTP_DATE_MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

export function parseRetryAfter(headerValue: string | null | undefined): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();

  if (trimmed.startsWith("-") || trimmed.startsWith("+")) return undefined;

  if (/^\d+$/.test(trimmed)) {
    const seconds = parseInt(trimmed, 10);
    if (!Number.isFinite(seconds) || seconds < 0) return undefined;
    return Math.min(seconds, MAX_RETRY_AFTER_SECONDS);
  }

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

export function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

// ==========================================
// Request DTO Validators (Closed Shapes)
// ==========================================

export function validateRegisterRequest(body: unknown): RegisterRequest {
  if (!isPlainObject(body)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid register request payload: body must be an object.",
    });
  }

  const allowedKeys = new Set(["email", "password", "title", "firstName", "lastName", "phone"]);
  for (const k of Object.keys(body)) {
    if (!allowedKeys.has(k)) {
      throw new IdentityApiError({
        kind: "protocol",
        message: "Invalid register request payload: unexpected extra properties.",
      });
    }
  }

  const email = body["email"];
  if (typeof email !== "string" || !EMAIL_REGEX.test(email)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid register request payload: invalid email format.",
    });
  }

  const password = body["password"];
  if (typeof password !== "string") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid register request payload: password must be a string.",
    });
  }
  if (!isWellFormedUnicode(password)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid register request payload: password contains ill-formed Unicode (lone surrogates).",
    });
  }
  const passwordLen = countUnicodeCodePoints(password);
  if (passwordLen < 15 || passwordLen > 128) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid register request payload: password length must be between 15 and 128 Unicode code points.",
    });
  }

  const firstName = body["firstName"];
  if (typeof firstName !== "string" || firstName.length < 1) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid register request payload: firstName must be a non-empty string.",
    });
  }

  const lastName = body["lastName"];
  if (typeof lastName !== "string" || lastName.length < 1) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid register request payload: lastName must be a non-empty string.",
    });
  }

  let title: RegisterRequest["title"] = undefined;
  if ("title" in body) {
    const rawTitle = body["title"];
    if (rawTitle !== "Mr" && rawTitle !== "Mrs" && rawTitle !== "Ms" && rawTitle !== "Dr") {
      throw new IdentityApiError({
        kind: "protocol",
        message: "Invalid register request payload: invalid title enum value.",
      });
    }
    title = rawTitle;
  }

  let phone: string | undefined = undefined;
  if ("phone" in body) {
    if (typeof body["phone"] !== "string") {
      throw new IdentityApiError({
        kind: "protocol",
        message: "Invalid register request payload: phone must be a string.",
      });
    }
    phone = body["phone"];
  }

  return {
    email,
    password, // Password bytes unchanged
    firstName,
    lastName,
    ...(title !== undefined ? { title } : {}),
    ...(phone !== undefined ? { phone } : {}),
  };
}

export function validateLoginRequest(body: unknown): LoginRequest {
  if (!isPlainObject(body)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid login request payload: body must be an object.",
    });
  }

  const keys = Object.keys(body);
  if (keys.length !== 2 || !keys.includes("email") || !keys.includes("password")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid login request payload: expected exact email and password fields.",
    });
  }

  const email = body["email"];
  if (typeof email !== "string" || !EMAIL_REGEX.test(email)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid login request payload: invalid email format.",
    });
  }

  const password = body["password"];
  if (typeof password !== "string") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid login request payload: password must be a string.",
    });
  }
  if (!isWellFormedUnicode(password)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid login request payload: password contains ill-formed Unicode (lone surrogates).",
    });
  }

  return {
    email,
    password, // Password bytes unchanged
  };
}

export function validatePasswordForgotRequest(body: unknown): PasswordForgotRequest {
  if (!isPlainObject(body)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid password forgot request payload: body must be an object.",
    });
  }

  const keys = Object.keys(body);
  if (keys.length !== 1 || !keys.includes("email")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid password forgot request payload: expected only email field.",
    });
  }

  const email = body["email"];
  if (typeof email !== "string" || !EMAIL_REGEX.test(email)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid password forgot request payload: invalid email format.",
    });
  }

  return { email };
}

export function validatePasswordResetRequest(body: unknown): PasswordResetRequest {
  if (!isPlainObject(body)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid password reset request payload: body must be an object.",
    });
  }

  const keys = Object.keys(body);
  if (keys.length !== 3 || !keys.includes("token") || !keys.includes("email") || !keys.includes("password")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid password reset request payload: expected exact token, email, and password fields.",
    });
  }

  const token = body["token"];
  if (typeof token !== "string") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid password reset request payload: token must be a string.",
    });
  }

  const email = body["email"];
  if (typeof email !== "string" || !EMAIL_REGEX.test(email)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid password reset request payload: invalid email format.",
    });
  }

  const password = body["password"];
  if (typeof password !== "string") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid password reset request payload: password must be a string.",
    });
  }
  if (!isWellFormedUnicode(password)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid password reset request payload: password contains ill-formed Unicode (lone surrogates).",
    });
  }
  const passwordLen = countUnicodeCodePoints(password);
  if (passwordLen < 15 || passwordLen > 128) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid password reset request payload: password length must be between 15 and 128 Unicode code points.",
    });
  }

  return {
    token,
    email,
    password, // Password bytes unchanged
  };
}

export function validateEmailVerifyRequest(body: unknown): EmailVerifyRequest {
  if (!isPlainObject(body)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid email verify request payload: body must be an object.",
    });
  }

  const keys = Object.keys(body);
  if (keys.length !== 1 || !keys.includes("token")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid email verify request payload: expected only token field.",
    });
  }

  const token = body["token"];
  if (typeof token !== "string") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid email verify request payload: token must be a string.",
    });
  }

  return { token };
}

export function validatePassengerEmailResendRequest(body: unknown): PassengerEmailResendRequest {
  if (!isPlainObject(body)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid email resend request payload: body must be an object.",
    });
  }

  const keys = Object.keys(body);
  if (keys.length !== 1 || !keys.includes("email")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid email resend request payload: expected only email field.",
    });
  }

  const email = body["email"];
  if (typeof email !== "string" || !EMAIL_REGEX.test(email)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid email resend request payload: invalid email format.",
    });
  }

  return { email };
}

export function validateStaffLoginRequest(body: unknown): StaffLoginRequest {
  if (!isPlainObject(body)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff login request payload: body must be an object.",
    });
  }

  const keys = Object.keys(body);
  if (keys.length !== 2 || !keys.includes("username") || !keys.includes("password")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff login request payload: expected exact username and password fields.",
    });
  }

  const username = body["username"];
  if (typeof username !== "string" || username.length < 1) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff login request payload: username must be a non-empty string.",
    });
  }

  const password = body["password"];
  if (typeof password !== "string" || password.length < 1) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff login request payload: password must be a non-empty string.",
    });
  }
  if (!isWellFormedUnicode(password)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff login request payload: password contains ill-formed Unicode (lone surrogates).",
    });
  }

  return {
    username,
    password, // Password bytes unchanged
  };
}

// ==========================================
// Response Validators (Reachable Schemas)
// ==========================================

export function validateSuccessMeta(meta: unknown, expectedRequestId: string): SuccessMeta {
  if (!isPlainObject(meta)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed response: meta must be an object.",
    });
  }

  const metaKeys = Object.keys(meta);
  if (metaKeys.length !== 2 || !metaKeys.includes("requestId") || !metaKeys.includes("timestamp")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed response: meta contains invalid properties.",
    });
  }

  const reqId = meta["requestId"];
  if (!isValidUuid(reqId)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed response: meta.requestId must be a valid UUID string.",
    });
  }

  if (reqId.toLowerCase() !== expectedRequestId.toLowerCase()) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Request ID correlation mismatch in response metadata.",
      requestId: expectedRequestId,
    });
  }

  const ts = meta["timestamp"];
  if (!isValidIsoDateTime(ts)) {
    throw new IdentityApiError({
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

export function validateCsrfTokenResponse(data: unknown): CsrfTokenResponse {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed CSRF bootstrap response: expected JSON object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 1 || !keys.includes("csrfToken")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed CSRF bootstrap response: expected only csrfToken property.",
    });
  }

  const token = data["csrfToken"];
  if (typeof token !== "string" || !token.trim()) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed CSRF bootstrap response: csrfToken must be a non-empty string.",
    });
  }

  return { csrfToken: token };
}

export function validatePassengerRegisterReceiptData(data: unknown): PassengerRegisterReceiptData {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed register receipt response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 2 || !keys.includes("status") || !keys.includes("message")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed register receipt response: unexpected data properties.",
    });
  }

  if (data["status"] !== "verification_dispatched") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed register receipt response: invalid status enum value.",
    });
  }

  if (typeof data["message"] !== "string") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed register receipt response: message must be a string.",
    });
  }

  return {
    status: "verification_dispatched",
    message: data["message"],
  };
}

export function validatePassengerAuthData(data: unknown): PassengerAuthData {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed passenger auth response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 1 || !keys.includes("user")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed passenger auth response: expected user property in data.",
    });
  }

  const user = data["user"];
  if (!isPlainObject(user)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed passenger auth response: data.user must be an object.",
    });
  }

  const userKeys = Object.keys(user);
  if (
    userKeys.length !== 5 ||
    !userKeys.includes("id") ||
    !userKeys.includes("email") ||
    !userKeys.includes("firstName") ||
    !userKeys.includes("lastName") ||
    !userKeys.includes("emailVerified")
  ) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed passenger auth response: data.user contains unexpected properties.",
    });
  }

  if (!isValidUuid(user["id"])) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed passenger auth response: user.id must be a valid UUID.",
    });
  }

  if (typeof user["email"] !== "string" || !EMAIL_REGEX.test(user["email"])) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed passenger auth response: user.email must be a valid email string.",
    });
  }

  if (typeof user["firstName"] !== "string" || typeof user["lastName"] !== "string") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed passenger auth response: user names must be strings.",
    });
  }

  if (typeof user["emailVerified"] !== "boolean") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed passenger auth response: user.emailVerified must be a boolean.",
    });
  }

  return {
    user: {
      id: user["id"],
      email: user["email"],
      firstName: user["firstName"],
      lastName: user["lastName"],
      emailVerified: user["emailVerified"],
    },
  };
}

export function validateMessageData(data: unknown): { message: string } {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 1 || !keys.includes("message")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed response: expected only message property in data.",
    });
  }

  if (typeof data["message"] !== "string") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed response: message must be a string.",
    });
  }

  return { message: data["message"] };
}

export function validateEmailVerifyData(data: unknown): { verified: boolean } {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed email verify response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 1 || !keys.includes("verified")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed email verify response: expected only verified property in data.",
    });
  }

  if (typeof data["verified"] !== "boolean") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed email verify response: verified must be a boolean.",
    });
  }

  return { verified: data["verified"] };
}

export function validateStaffPendingAuthData(data: unknown): StaffPendingAuthData {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff auth response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 2 || !keys.includes("status") || !keys.includes("expiresAt")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff auth response: expected exact status and expiresAt properties.",
    });
  }

  const status = data["status"];
  if (status !== "mfa_required" && status !== "enrollment_required") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff auth response: status must be mfa_required or enrollment_required.",
    });
  }

  const expiresAt = data["expiresAt"];
  if (!isValidIsoDateTime(expiresAt)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff auth response: expiresAt must be a valid ISO 8601 date-time string.",
    });
  }

  return {
    status,
    expiresAt,
  };
}

export function validateStaffMeData(data: unknown): StaffProfile {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff profile response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (
    keys.length !== 8 ||
    !keys.includes("id") ||
    !keys.includes("username") ||
    !keys.includes("email") ||
    !keys.includes("fullNameEn") ||
    !keys.includes("fullNameAr") ||
    !keys.includes("role") ||
    !keys.includes("permissions") ||
    !keys.includes("mfaEnabled")
  ) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff profile response: unexpected data properties.",
    });
  }

  if (!isValidUuid(data["id"])) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff profile response: id must be a valid UUID.",
    });
  }

  if (typeof data["username"] !== "string" || typeof data["fullNameEn"] !== "string" || typeof data["fullNameAr"] !== "string") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff profile response: name fields must be strings.",
    });
  }

  if (typeof data["email"] !== "string" || !EMAIL_REGEX.test(data["email"])) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff profile response: email must be a valid email string.",
    });
  }

  const role = data["role"];
  if (role !== "admin" && role !== "editor" && role !== "viewer") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff profile response: role must be admin, editor, or viewer.",
    });
  }

  const perms = data["permissions"];
  if (!Array.isArray(perms) || !perms.every((p) => typeof p === "string")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff profile response: permissions must be an array of strings.",
    });
  }

  if (typeof data["mfaEnabled"] !== "boolean") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff profile response: mfaEnabled must be a boolean.",
    });
  }

  return {
    id: data["id"],
    username: data["username"],
    email: data["email"],
    fullNameEn: data["fullNameEn"],
    fullNameAr: data["fullNameAr"],
    role,
    permissions: [...perms],
    mfaEnabled: data["mfaEnabled"],
  };
}

export function tryParseCanonicalError(parsed: unknown): ErrorResponse | null {
  if (!isPlainObject(parsed)) return null;

  const topKeys = Object.keys(parsed);
  if (
    topKeys.length !== 3 ||
    !topKeys.includes("success") ||
    !topKeys.includes("error") ||
    !topKeys.includes("meta")
  ) {
    return null;
  }

  if (parsed["success"] !== false) return null;

  const errorObj = parsed["error"];
  if (!isPlainObject(errorObj)) return null;

  const errorKeys = Object.keys(errorObj);
  const hasFields = errorKeys.includes("fields");
  const expectedCount = hasFields ? 3 : 2;
  if (
    errorKeys.length !== expectedCount ||
    !errorKeys.includes("code") ||
    !errorKeys.includes("message")
  ) {
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
