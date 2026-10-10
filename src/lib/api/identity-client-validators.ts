import { validateContractSchema } from "./identity-schema-validation.ts";
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
  UpdatePassengerProfileRequest,
  CreateTravelerRequest,
  PatchTravelerRequest,
  PassengerPasswordChangeRequest,
  StaffLoginRequest,
  StaffMfaChallengeRequest,
  StaffMfaVerifyRequest,
  CreateStaffUserRequest,
  PatchStaffUserRequest,
  StaffMfaEnrollmentConfirmRequest,
  StaffStepUpRequest,
  StaffMfaSetupConfirmRequest,
  StaffPasswordForgotRequest,
  StaffPasswordResetRequest,
  StaffPasswordChangeRequest,
  StaffInvitationAcceptRequest,
  PassengerRegisterReceiptData,
  PassengerAuthData,
  StaffPendingAuthData,
  StaffProfile,
  PassengerProfileDto,
  PassengerProfileReceiptDto,
  TravelerDto,
  PassengerSessionDto,
  StaffDto,
  StaffUserDirectoryDto,
  StaffSessionDto,
  StaffAuthData,
  StaffMfaEnrollmentConfirmData,
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
 * Validates and encodes a path UUID parameter.
 */
export function validatePathUuid(id: unknown, paramName = "id"): string {
  if (typeof id !== "string" || !isValidUuid(id)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: `Invalid path parameter '${paramName}': expected RFC 4122 UUID.`,
    });
  }
  return encodeURIComponent(id);
}

/**
 * Validates and encodes a general path ID parameter.
 * Preserves exact original characters (untrimmed whitespace, Unicode, literal percent, plus).
 * Disallows empty strings, whitespace-only, dot-segments, path separators, and ill-formed Unicode.
 * Does not leak PII in diagnostics.
 */
export function validatePathId(id: unknown, paramName = "id"): string {
  if (typeof id !== "string") {
    throw new IdentityApiError({
      kind: "protocol",
      message: `Invalid path parameter '${paramName}': expected non-empty string.`,
    });
  }
  if (id.length === 0 || id.trim().length === 0) {
    throw new IdentityApiError({
      kind: "protocol",
      message: `Invalid path parameter '${paramName}': parameter cannot be empty.`,
    });
  }
  if (id === "." || id === "..") {
    throw new IdentityApiError({
      kind: "protocol",
      message: `Invalid path parameter '${paramName}': dot segments are not permitted.`,
    });
  }
  if (/[/\\\0]/.test(id)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: `Invalid path parameter '${paramName}': path separators and null characters are not permitted.`,
    });
  }
  if (!isWellFormedUnicode(id)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: `Invalid path parameter '${paramName}': ill-formed Unicode string.`,
    });
  }
  try {
    return encodeURIComponent(id);
  } catch {
    throw new IdentityApiError({
      kind: "protocol",
      message: `Invalid path parameter '${paramName}': ill-formed Unicode string.`,
    });
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

export function validateUpdatePassengerProfileRequest(body: unknown): UpdatePassengerProfileRequest {
  if (!isPlainObject(body)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid update profile request payload: body must be an object.",
    });
  }

  const allowedKeys = new Set(["firstName", "lastName", "phone", "seatPreference", "mealPreference", "newsletter"]);
  for (const k of Object.keys(body)) {
    if (!allowedKeys.has(k)) {
      throw new IdentityApiError({
        kind: "protocol",
        message: "Invalid update profile request payload: unexpected extra properties.",
      });
    }
  }

  const result: UpdatePassengerProfileRequest = {};
  if ("firstName" in body && body["firstName"] !== undefined) {
    if (typeof body["firstName"] !== "string") {
      throw new IdentityApiError({ kind: "protocol", message: "firstName must be a string." });
    }
    result.firstName = body["firstName"];
  }
  if ("lastName" in body && body["lastName"] !== undefined) {
    if (typeof body["lastName"] !== "string") {
      throw new IdentityApiError({ kind: "protocol", message: "lastName must be a string." });
    }
    result.lastName = body["lastName"];
  }
  if ("phone" in body && body["phone"] !== undefined) {
    if (typeof body["phone"] !== "string") {
      throw new IdentityApiError({ kind: "protocol", message: "phone must be a string." });
    }
    result.phone = body["phone"];
  }
  if ("seatPreference" in body && body["seatPreference"] !== undefined) {
    const sp = body["seatPreference"];
    if (sp !== "none" && sp !== "window" && sp !== "aisle") {
      throw new IdentityApiError({ kind: "protocol", message: "seatPreference must be none, window, or aisle." });
    }
    result.seatPreference = sp;
  }
  if ("mealPreference" in body && body["mealPreference"] !== undefined) {
    if (typeof body["mealPreference"] !== "string") {
      throw new IdentityApiError({ kind: "protocol", message: "mealPreference must be a string." });
    }
    result.mealPreference = body["mealPreference"];
  }
  if ("newsletter" in body && body["newsletter"] !== undefined) {
    if (typeof body["newsletter"] !== "boolean") {
      throw new IdentityApiError({ kind: "protocol", message: "newsletter must be a boolean." });
    }
    result.newsletter = body["newsletter"];
  }

  return result;
}

export function validateCreateTravelerRequest(body: unknown): CreateTravelerRequest {
  if (!isPlainObject(body)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid traveler payload: body must be an object.",
    });
  }

  const allowedKeys = new Set(["firstName", "lastName", "dob", "nationality", "document"]);
  for (const k of Object.keys(body)) {
    if (!allowedKeys.has(k)) {
      throw new IdentityApiError({
        kind: "protocol",
        message: "Invalid traveler payload: unexpected extra properties.",
      });
    }
  }

  const result: CreateTravelerRequest = {};
  for (const field of ["firstName", "lastName", "dob", "nationality", "document"] as const) {
    if (field in body && body[field] !== undefined) {
      if (typeof body[field] !== "string") {
        throw new IdentityApiError({ kind: "protocol", message: `${field} must be a string.` });
      }
      result[field] = body[field];
    }
  }

  return result;
}

export function validatePatchTravelerRequest(body: unknown): PatchTravelerRequest {
  return validateCreateTravelerRequest(body);
}

export function validatePassengerPasswordChangeRequest(body: unknown): PassengerPasswordChangeRequest {
  if (!isPlainObject(body)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid password change payload: body must be an object.",
    });
  }

  const keys = Object.keys(body);
  if (keys.length !== 2 || !keys.includes("currentPassword") || !keys.includes("newPassword")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid password change payload: expected exact currentPassword and newPassword fields.",
    });
  }

  const currentPassword = body["currentPassword"];
  if (typeof currentPassword !== "string" || !currentPassword) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid password change payload: currentPassword must be a non-empty string.",
    });
  }
  if (!isWellFormedUnicode(currentPassword)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid password change payload: currentPassword contains ill-formed Unicode.",
    });
  }

  const newPassword = body["newPassword"];
  if (typeof newPassword !== "string") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid password change payload: newPassword must be a string.",
    });
  }
  if (!isWellFormedUnicode(newPassword)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid password change payload: newPassword contains ill-formed Unicode.",
    });
  }
  const newLen = countUnicodeCodePoints(newPassword);
  if (newLen < 15 || newLen > 128) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid password change payload: newPassword length must be between 15 and 128 code points.",
    });
  }

  return { currentPassword, newPassword };
}

export function validateStaffMfaChallengeRequest(body: unknown): StaffMfaChallengeRequest {
  if (!isPlainObject(body)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid MFA challenge payload: body must be an object.",
    });
  }

  const keys = Object.keys(body);
  if (keys.length !== 1 || !keys.includes("staffSessionChallengeId")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid MFA challenge payload: expected exact staffSessionChallengeId field.",
    });
  }

  const cid = body["staffSessionChallengeId"];
  if (typeof cid !== "string" || !isValidUuid(cid)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid MFA challenge payload: staffSessionChallengeId must be a valid UUID.",
    });
  }

  return { staffSessionChallengeId: cid };
}

export function validateStaffMfaVerifyRequest(body: unknown): StaffMfaVerifyRequest {
  if (!isPlainObject(body)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid MFA verify payload: body must be an object.",
    });
  }

  const keys = Object.keys(body);
  const hasTotp = keys.includes("totpCode");
  const hasRec = keys.includes("recoveryCode");
  if ((hasTotp && hasRec) || (!hasTotp && !hasRec) || keys.length !== 1) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid MFA verify payload: exactly one of totpCode or recoveryCode must be provided.",
    });
  }

  if (hasTotp) {
    const code = body["totpCode"];
    if (typeof code !== "string" || !/^[0-9]{6}$/.test(code)) {
      throw new IdentityApiError({
        kind: "protocol",
        message: "Invalid MFA verify payload: totpCode must be a 6-digit numeric string.",
      });
    }
    return { totpCode: code };
  } else {
    const rec = body["recoveryCode"];
    if (typeof rec !== "string" || rec.length < 8 || rec.length > 32) {
      throw new IdentityApiError({
        kind: "protocol",
        message: "Invalid MFA verify payload: recoveryCode length must be between 8 and 32 characters.",
      });
    }
    return { recoveryCode: rec };
  }
}

export function validateCreateStaffUserRequest(body: unknown): CreateStaffUserRequest {
  if (!isPlainObject(body)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid create staff user payload: body must be an object.",
    });
  }

  const keys = Object.keys(body);
  if (
    keys.length !== 5 ||
    !keys.includes("username") ||
    !keys.includes("email") ||
    !keys.includes("fullNameEn") ||
    !keys.includes("fullNameAr") ||
    !keys.includes("role")
  ) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid create staff user payload: missing required fields or extra properties.",
    });
  }

  const username = body["username"];
  if (typeof username !== "string" || username.length < 3) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid create staff user payload: username must be at least 3 characters.",
    });
  }

  const email = body["email"];
  if (typeof email !== "string" || !EMAIL_REGEX.test(email)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid create staff user payload: email must be a valid email format.",
    });
  }

  const fullNameEn = body["fullNameEn"];
  if (typeof fullNameEn !== "string" || fullNameEn.length < 1) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid create staff user payload: fullNameEn must be a non-empty string.",
    });
  }

  const fullNameAr = body["fullNameAr"];
  if (typeof fullNameAr !== "string" || fullNameAr.length < 1) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid create staff user payload: fullNameAr must be a non-empty string.",
    });
  }

  const role = body["role"];
  if (role !== "admin" && role !== "editor" && role !== "viewer") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid create staff user payload: role must be admin, editor, or viewer.",
    });
  }

  return { username, email, fullNameEn, fullNameAr, role };
}

export function validatePatchStaffUserRequest(body: unknown): PatchStaffUserRequest {
  if (!isPlainObject(body)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid patch staff user payload: body must be an object.",
    });
  }

  const allowedKeys = new Set(["fullNameEn", "fullNameAr", "role", "isActive"]);
  for (const k of Object.keys(body)) {
    if (!allowedKeys.has(k)) {
      throw new IdentityApiError({
        kind: "protocol",
        message: "Invalid patch staff user payload: unexpected extra properties.",
      });
    }
  }

  const result: PatchStaffUserRequest = {};
  if ("fullNameEn" in body && body["fullNameEn"] !== undefined) {
    if (typeof body["fullNameEn"] !== "string") {
      throw new IdentityApiError({ kind: "protocol", message: "fullNameEn must be a string." });
    }
    result.fullNameEn = body["fullNameEn"];
  }
  if ("fullNameAr" in body && body["fullNameAr"] !== undefined) {
    if (typeof body["fullNameAr"] !== "string") {
      throw new IdentityApiError({ kind: "protocol", message: "fullNameAr must be a string." });
    }
    result.fullNameAr = body["fullNameAr"];
  }
  if ("role" in body && body["role"] !== undefined) {
    const r = body["role"];
    if (r !== "admin" && r !== "editor" && r !== "viewer") {
      throw new IdentityApiError({ kind: "protocol", message: "role must be admin, editor, or viewer." });
    }
    result.role = r;
  }
  if ("isActive" in body && body["isActive"] !== undefined) {
    if (typeof body["isActive"] !== "boolean") {
      throw new IdentityApiError({ kind: "protocol", message: "isActive must be a boolean." });
    }
    result.isActive = body["isActive"];
  }

  return result;
}

export function validateStaffMfaEnrollmentConfirmRequest(body: unknown): StaffMfaEnrollmentConfirmRequest {
  if (!isPlainObject(body)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid MFA enrollment confirm payload: body must be an object.",
    });
  }

  const keys = Object.keys(body);
  if (keys.length !== 1 || !keys.includes("totpCode")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid MFA enrollment confirm payload: expected exact totpCode field.",
    });
  }

  const code = body["totpCode"];
  if (typeof code !== "string" || !/^[0-9]{6}$/.test(code)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid MFA enrollment confirm payload: totpCode must be a 6-digit numeric string.",
    });
  }

  return { totpCode: code };
}

export function validateStaffStepUpRequest(body: unknown): StaffStepUpRequest {
  return validateStaffMfaVerifyRequest(body);
}

export function validateStaffMfaSetupConfirmRequest(body: unknown): StaffMfaSetupConfirmRequest {
  return validateStaffMfaEnrollmentConfirmRequest(body);
}

export function validateStaffPasswordForgotRequest(body: unknown): StaffPasswordForgotRequest {
  return validatePasswordForgotRequest(body);
}

export function validateStaffPasswordResetRequest(body: unknown): StaffPasswordResetRequest {
  if (!isPlainObject(body)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff password reset payload: body must be an object.",
    });
  }

  const keys = Object.keys(body);
  if (keys.length !== 2 || !keys.includes("token") || !keys.includes("newPassword")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff password reset payload: expected exact token and newPassword fields.",
    });
  }

  const token = body["token"];
  if (typeof token !== "string" || token.length < 32 || token.length > 64) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff password reset payload: token length must be between 32 and 64 characters.",
    });
  }

  const newPassword = body["newPassword"];
  if (typeof newPassword !== "string") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff password reset payload: newPassword must be a string.",
    });
  }
  if (!isWellFormedUnicode(newPassword)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff password reset payload: newPassword contains ill-formed Unicode.",
    });
  }
  const newLen = countUnicodeCodePoints(newPassword);
  if (newLen < 12 || newLen > 128) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff password reset payload: newPassword length must be between 12 and 128 code points.",
    });
  }

  return { token, newPassword };
}

export function validateStaffPasswordChangeRequest(body: unknown): StaffPasswordChangeRequest {
  if (!isPlainObject(body)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff password change payload: body must be an object.",
    });
  }

  const keys = Object.keys(body);
  if (keys.length !== 2 || !keys.includes("currentPassword") || !keys.includes("newPassword")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff password change payload: expected exact currentPassword and newPassword fields.",
    });
  }

  const currentPassword = body["currentPassword"];
  if (typeof currentPassword !== "string" || !currentPassword) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff password change payload: currentPassword must be a non-empty string.",
    });
  }
  if (!isWellFormedUnicode(currentPassword)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff password change payload: currentPassword contains ill-formed Unicode.",
    });
  }

  const newPassword = body["newPassword"];
  if (typeof newPassword !== "string") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff password change payload: newPassword must be a string.",
    });
  }
  if (!isWellFormedUnicode(newPassword)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff password change payload: newPassword contains ill-formed Unicode.",
    });
  }
  const newLen = countUnicodeCodePoints(newPassword);
  if (newLen < 12 || newLen > 128) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff password change payload: newPassword length must be between 12 and 128 code points.",
    });
  }

  return { currentPassword, newPassword };
}

export function validateStaffInvitationAcceptRequest(body: unknown): StaffInvitationAcceptRequest {
  if (!isPlainObject(body)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff invitation accept payload: body must be an object.",
    });
  }

  const keys = Object.keys(body);
  if (keys.length !== 2 || !keys.includes("token") || !keys.includes("password")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff invitation accept payload: expected exact token and password fields.",
    });
  }

  const token = body["token"];
  if (typeof token !== "string" || token.length < 32 || token.length > 64) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff invitation accept payload: token length must be between 32 and 64 characters.",
    });
  }

  const password = body["password"];
  if (typeof password !== "string") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff invitation accept payload: password must be a string.",
    });
  }
  if (!isWellFormedUnicode(password)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff invitation accept payload: password contains ill-formed Unicode.",
    });
  }
  const pLen = countUnicodeCodePoints(password);
  if (pLen < 12 || pLen > 128) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Invalid staff invitation accept payload: password length must be between 12 and 128 code points.",
    });
  }

  return { token, password };
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

export function validatePassengerProfileData(data: unknown): PassengerProfileDto {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed profile response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (
    keys.length !== 7 ||
    !keys.includes("email") ||
    !keys.includes("firstName") ||
    !keys.includes("lastName") ||
    !keys.includes("phone") ||
    !keys.includes("seatPreference") ||
    !keys.includes("mealPreference") ||
    !keys.includes("newsletter")
  ) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed profile response: unexpected properties.",
    });
  }

  if (typeof data["email"] !== "string" || !EMAIL_REGEX.test(data["email"])) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed profile response: email must be a valid email string.",
    });
  }

  if (
    typeof data["firstName"] !== "string" ||
    typeof data["lastName"] !== "string" ||
    typeof data["phone"] !== "string" ||
    typeof data["mealPreference"] !== "string"
  ) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed profile response: string fields must be strings.",
    });
  }

  const sp = data["seatPreference"];
  if (sp !== "none" && sp !== "window" && sp !== "aisle") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed profile response: seatPreference must be none, window, or aisle.",
    });
  }

  if (typeof data["newsletter"] !== "boolean") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed profile response: newsletter must be a boolean.",
    });
  }

  return {
    email: data["email"],
    firstName: data["firstName"],
    lastName: data["lastName"],
    phone: data["phone"],
    seatPreference: sp,
    mealPreference: data["mealPreference"],
    newsletter: data["newsletter"],
  };
}

export function validatePassengerProfileReceiptData(data: unknown): PassengerProfileReceiptDto {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed profile receipt: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 2 || !keys.includes("changed") || !keys.includes("account")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed profile receipt: expected changed and account.",
    });
  }

  if (typeof data["changed"] !== "boolean") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed profile receipt: changed must be a boolean.",
    });
  }

  const account = validatePassengerProfileData(data["account"]);
  return { changed: data["changed"], account };
}

export function validateTravelerData(data: unknown): TravelerDto {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed traveler response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (
    keys.length !== 6 ||
    !keys.includes("id") ||
    !keys.includes("firstName") ||
    !keys.includes("lastName") ||
    !keys.includes("dob") ||
    !keys.includes("nationality") ||
    !keys.includes("document")
  ) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed traveler response: unexpected properties.",
    });
  }

  for (const f of ["id", "firstName", "lastName", "dob", "nationality", "document"] as const) {
    if (typeof data[f] !== "string") {
      throw new IdentityApiError({
        kind: "protocol",
        message: `Malformed traveler response: ${f} must be a string.`,
      });
    }
  }

  return {
    id: data["id"] as string,
    firstName: data["firstName"] as string,
    lastName: data["lastName"] as string,
    dob: data["dob"] as string,
    nationality: data["nationality"] as string,
    document: data["document"] as string,
  };
}

export function validateSavedTravelersData(data: unknown): TravelerDto[] {
  if (!Array.isArray(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed travelers response: data must be an array.",
    });
  }
  return data.map(validateTravelerData);
}

export function validateDeleteTravelerData(data: unknown): { deleted: boolean } {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed delete traveler response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 1 || !keys.includes("deleted") || typeof data["deleted"] !== "boolean") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed delete traveler response: expected deleted boolean.",
    });
  }

  return { deleted: data["deleted"] };
}

export function validatePassengerSessionData(data: unknown): PassengerSessionDto {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed session response: session must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (
    keys.length !== 6 ||
    !keys.includes("id") ||
    !keys.includes("ipAddress") ||
    !keys.includes("userAgent") ||
    !keys.includes("createdAt") ||
    !keys.includes("lastSeenAt") ||
    !keys.includes("current")
  ) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed session response: unexpected session properties.",
    });
  }

  if (typeof data["id"] !== "string" || !isValidUuid(data["id"])) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed session response: id must be a valid UUID.",
    });
  }

  if (typeof data["ipAddress"] !== "string" || typeof data["userAgent"] !== "string") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed session response: ipAddress and userAgent must be strings.",
    });
  }

  if (typeof data["createdAt"] !== "string" || !isValidIsoDateTime(data["createdAt"])) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed session response: createdAt must be an ISO date-time string.",
    });
  }

  if (typeof data["lastSeenAt"] !== "string" || !isValidIsoDateTime(data["lastSeenAt"])) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed session response: lastSeenAt must be an ISO date-time string.",
    });
  }

  if (typeof data["current"] !== "boolean") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed session response: current must be a boolean.",
    });
  }

  return {
    id: data["id"],
    ipAddress: data["ipAddress"],
    userAgent: data["userAgent"],
    createdAt: data["createdAt"],
    lastSeenAt: data["lastSeenAt"],
    current: data["current"],
  };
}

export function validatePassengerSessionsData(data: unknown): { sessions: PassengerSessionDto[] } {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed sessions response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 1 || !keys.includes("sessions") || !Array.isArray(data["sessions"])) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed sessions response: expected sessions array.",
    });
  }

  return { sessions: data["sessions"].map(validatePassengerSessionData) };
}

export function validatePassengerSessionRevokeData(data: unknown): { revoked: true } {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed session revoke response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 1 || !keys.includes("revoked") || data["revoked"] !== true) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed session revoke response: expected revoked: true.",
    });
  }

  return { revoked: true };
}

export function validateBooleanChangedData(data: unknown): { changed: true } {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 1 || !keys.includes("changed") || data["changed"] !== true) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed response: expected changed: true.",
    });
  }

  return { changed: true };
}

export function validateStaffMfaSetupData(data: unknown): { secret: string; qrCodeUri: string } {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed MFA setup response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 2 || !keys.includes("secret") || !keys.includes("qrCodeUri")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed MFA setup response: expected secret and qrCodeUri.",
    });
  }

  if (typeof data["secret"] !== "string" || typeof data["qrCodeUri"] !== "string") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed MFA setup response: fields must be strings.",
    });
  }

  return { secret: data["secret"], qrCodeUri: data["qrCodeUri"] };
}

export function validateStaffMfaChallengeData(data: unknown): { status: string; expiresAt: string } {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed MFA challenge response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 2 || !keys.includes("status") || !keys.includes("expiresAt")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed MFA challenge response: expected status and expiresAt.",
    });
  }

  if (typeof data["status"] !== "string" || typeof data["expiresAt"] !== "string") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed MFA challenge response: fields must be strings.",
    });
  }

  return { status: data["status"], expiresAt: data["expiresAt"] };
}

export function validateStaffAuthData(data: unknown): StaffAuthData {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff auth response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 1 || !keys.includes("staff")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff auth response: expected staff property.",
    });
  }

  const staff = data["staff"];
  if (!isPlainObject(staff)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff auth response: staff must be an object.",
    });
  }

  const staffKeys = Object.keys(staff);
  const hasMfa = staffKeys.includes("mfaRequired");
  const expectedCount = hasMfa ? 6 : 5;
  if (
    staffKeys.length !== expectedCount ||
    !staffKeys.includes("id") ||
    !staffKeys.includes("username") ||
    !staffKeys.includes("email") ||
    !staffKeys.includes("role") ||
    !staffKeys.includes("permissions")
  ) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff auth response: unexpected staff properties.",
    });
  }

  if (typeof staff["id"] !== "string" || !isValidUuid(staff["id"])) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff auth response: id must be a valid UUID.",
    });
  }

  if (
    typeof staff["username"] !== "string" ||
    typeof staff["email"] !== "string" ||
    !EMAIL_REGEX.test(staff["email"])
  ) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff auth response: invalid username or email.",
    });
  }

  const role = staff["role"];
  if (role !== "admin" && role !== "editor" && role !== "viewer") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff auth response: invalid role.",
    });
  }

  const perms = staff["permissions"];
  if (!Array.isArray(perms) || !perms.every((p) => typeof p === "string")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff auth response: permissions must be an array of strings.",
    });
  }

  let mfaRequired: boolean | undefined = undefined;
  if (hasMfa) {
    if (typeof staff["mfaRequired"] !== "boolean") {
      throw new IdentityApiError({
        kind: "protocol",
        message: "Malformed staff auth response: mfaRequired must be a boolean.",
      });
    }
    mfaRequired = staff["mfaRequired"];
  }

  return {
    staff: {
      id: staff["id"],
      username: staff["username"],
      email: staff["email"],
      role,
      permissions: [...perms],
      ...(mfaRequired !== undefined ? { mfaRequired } : {}),
    },
  };
}

export function validateStaffSessionData(data: unknown): StaffSessionDto {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff session response: item must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (
    keys.length !== 5 ||
    !keys.includes("id") ||
    !keys.includes("ipAddress") ||
    !keys.includes("userAgent") ||
    !keys.includes("lastActivity") ||
    !keys.includes("isCurrent")
  ) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff session response: unexpected item properties.",
    });
  }

  if (
    typeof data["id"] !== "string" ||
    typeof data["ipAddress"] !== "string" ||
    typeof data["userAgent"] !== "string"
  ) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff session response: fields must be strings.",
    });
  }

  if (typeof data["lastActivity"] !== "string" || !isValidIsoDateTime(data["lastActivity"])) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff session response: lastActivity must be an ISO date-time string.",
    });
  }

  if (typeof data["isCurrent"] !== "boolean") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff session response: isCurrent must be a boolean.",
    });
  }

  return {
    id: data["id"],
    ipAddress: data["ipAddress"],
    userAgent: data["userAgent"],
    lastActivity: data["lastActivity"],
    isCurrent: data["isCurrent"],
  };
}

export function validateStaffSessionsData(data: unknown): StaffSessionDto[] {
  if (!Array.isArray(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff sessions response: data must be an array.",
    });
  }
  return data.map(validateStaffSessionData);
}

export function validateStaffUserDirectoryData(data: unknown): StaffUserDirectoryDto {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff directory response: item must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (
    keys.length !== 9 ||
    !keys.includes("id") ||
    !keys.includes("username") ||
    !keys.includes("email") ||
    !keys.includes("fullNameEn") ||
    !keys.includes("fullNameAr") ||
    !keys.includes("role") ||
    !keys.includes("isActive") ||
    !keys.includes("mfaEnabled") ||
    !keys.includes("createdAt")
  ) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff directory response: unexpected item properties.",
    });
  }

  if (typeof data["id"] !== "string" || !isValidUuid(data["id"])) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff directory response: id must be a valid UUID.",
    });
  }

  if (
    typeof data["username"] !== "string" ||
    typeof data["fullNameEn"] !== "string" ||
    typeof data["fullNameAr"] !== "string"
  ) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff directory response: names must be strings.",
    });
  }

  if (typeof data["email"] !== "string" || !EMAIL_REGEX.test(data["email"])) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff directory response: email must be valid.",
    });
  }

  const role = data["role"];
  if (role !== "admin" && role !== "editor" && role !== "viewer") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff directory response: invalid role.",
    });
  }

  if (typeof data["isActive"] !== "boolean" || typeof data["mfaEnabled"] !== "boolean") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff directory response: booleans required.",
    });
  }

  if (typeof data["createdAt"] !== "string" || !isValidIsoDateTime(data["createdAt"])) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff directory response: createdAt must be an ISO date-time string.",
    });
  }

  return {
    id: data["id"],
    username: data["username"],
    email: data["email"],
    fullNameEn: data["fullNameEn"],
    fullNameAr: data["fullNameAr"],
    role,
    isActive: data["isActive"],
    mfaEnabled: data["mfaEnabled"],
    createdAt: data["createdAt"],
  };
}

export function validateStaffUsersDirectoryData(data: unknown): StaffUserDirectoryDto[] {
  if (!Array.isArray(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff users response: data must be an array.",
    });
  }
  return data.map(validateStaffUserDirectoryData);
}

export function validateStaffUserData(data: unknown): StaffUserDirectoryDto {
  return validateStaffUserDirectoryData(data);
}

export function validateDeleteStaffSessionData(data: unknown): { revoked: boolean } {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed delete staff session response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 1 || !keys.includes("revoked") || typeof data["revoked"] !== "boolean") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed delete staff session response: expected revoked boolean.",
    });
  }

  return { revoked: data["revoked"] };
}

export function validateDeleteStaffUserData(data: unknown): { deactivated: boolean } {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed delete staff user response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 1 || !keys.includes("deactivated") || typeof data["deactivated"] !== "boolean") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed delete staff user response: expected deactivated boolean.",
    });
  }

  return { deactivated: data["deactivated"] };
}

export function validateStaffMfaEnrollmentSetupData(
  data: unknown
): { secret: string; qrCodeUri: string; expiresAt: string } {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed MFA enrollment setup response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 3 || !keys.includes("secret") || !keys.includes("qrCodeUri") || !keys.includes("expiresAt")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed MFA enrollment setup response: expected secret, qrCodeUri, and expiresAt.",
    });
  }

  if (typeof data["secret"] !== "string" || typeof data["qrCodeUri"] !== "string") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed MFA enrollment setup response: secret and qrCodeUri must be strings.",
    });
  }

  if (typeof data["expiresAt"] !== "string" || !isValidIsoDateTime(data["expiresAt"])) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed MFA enrollment setup response: expiresAt must be an ISO date-time string.",
    });
  }

  return { secret: data["secret"], qrCodeUri: data["qrCodeUri"], expiresAt: data["expiresAt"] };
}

export function validateStaffDto(data: unknown): StaffDto {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff dto: expected an object.",
    });
  }

  const keys = Object.keys(data);
  if (
    keys.length !== 5 ||
    !keys.includes("id") ||
    !keys.includes("username") ||
    !keys.includes("email") ||
    !keys.includes("role") ||
    !keys.includes("permissions")
  ) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff dto: unexpected properties.",
    });
  }

  if (typeof data["id"] !== "string" || !isValidUuid(data["id"])) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff dto: id must be a valid UUID.",
    });
  }

  if (
    typeof data["username"] !== "string" ||
    typeof data["email"] !== "string" ||
    !EMAIL_REGEX.test(data["email"])
  ) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff dto: invalid username or email.",
    });
  }

  const role = data["role"];
  if (role !== "admin" && role !== "editor" && role !== "viewer") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff dto: invalid role.",
    });
  }

  const perms = data["permissions"];
  if (!Array.isArray(perms) || !perms.every((p) => typeof p === "string")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed staff dto: permissions must be string array.",
    });
  }

  return {
    id: data["id"],
    username: data["username"],
    email: data["email"],
    role,
    permissions: [...perms],
  };
}

export function validateStaffMfaEnrollmentConfirmData(
  data: unknown
): StaffMfaEnrollmentConfirmData {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed MFA confirm response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 3 || !keys.includes("enrolled") || !keys.includes("recoveryCodes") || !keys.includes("user")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed MFA confirm response: expected enrolled, recoveryCodes, and user.",
    });
  }

  if (data["enrolled"] !== true) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed MFA confirm response: enrolled must be true.",
    });
  }

  const recs = data["recoveryCodes"];
  if (
    !Array.isArray(recs) ||
    recs.length !== 10 ||
    !recs.every((c) => typeof c === "string" && c.length >= 8 && c.length <= 32)
  ) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed MFA confirm response: recoveryCodes must be an array of 10 codes (8-32 chars).",
    });
  }

  const user = validateStaffDto(data["user"]);
  return { enrolled: true, recoveryCodes: [...recs], user };
}

export function validateStaffStepUpData(data: unknown): { verified: true; expiresAt: string } {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed step-up response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 2 || !keys.includes("verified") || !keys.includes("expiresAt")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed step-up response: expected verified and expiresAt.",
    });
  }

  if (data["verified"] !== true) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed step-up response: verified must be true.",
    });
  }

  if (typeof data["expiresAt"] !== "string" || !isValidIsoDateTime(data["expiresAt"])) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed step-up response: expiresAt must be an ISO date-time string.",
    });
  }

  return { verified: true, expiresAt: data["expiresAt"] };
}

export function validateStaffMfaSetupConfirmData(
  data: unknown
): { confirmed: true; recoveryCodes: string[] } {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed MFA setup confirm response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 2 || !keys.includes("confirmed") || !keys.includes("recoveryCodes")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed MFA setup confirm response: expected confirmed and recoveryCodes.",
    });
  }

  if (data["confirmed"] !== true) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed MFA setup confirm response: confirmed must be true.",
    });
  }

  const recs = data["recoveryCodes"];
  if (
    !Array.isArray(recs) ||
    recs.length !== 10 ||
    !recs.every((c) => typeof c === "string" && c.length >= 8 && c.length <= 32)
  ) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed MFA setup confirm response: recoveryCodes must be an array of 10 codes (8-32 chars).",
    });
  }

  return { confirmed: true, recoveryCodes: [...recs] };
}

export function validateStaffRecoveryCodesData(data: unknown): { recoveryCodes: string[] } {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed recovery codes response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 1 || !keys.includes("recoveryCodes")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed recovery codes response: expected only recoveryCodes.",
    });
  }

  const recs = data["recoveryCodes"];
  if (
    !Array.isArray(recs) ||
    recs.length !== 10 ||
    !recs.every((c) => typeof c === "string" && c.length >= 8 && c.length <= 32)
  ) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed recovery codes response: recoveryCodes must be an array of 10 codes (8-32 chars).",
    });
  }

  return { recoveryCodes: [...recs] };
}

export function validateStaffPasswordForgotReceiptData(
  data: unknown
): { status: "reset_dispatched"; message: string } {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed password forgot receipt response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 2 || !keys.includes("status") || !keys.includes("message")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed password forgot receipt response: expected status and message.",
    });
  }

  if (data["status"] !== "reset_dispatched") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed password forgot receipt response: status must be reset_dispatched.",
    });
  }

  if (typeof data["message"] !== "string") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed password forgot receipt response: message must be a string.",
    });
  }

  return { status: "reset_dispatched", message: data["message"] };
}

export function validateStaffPasswordResetData(data: unknown): { reset: true } {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed password reset response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 1 || !keys.includes("reset") || data["reset"] !== true) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed password reset response: expected reset: true.",
    });
  }

  return { reset: true };
}

export function validateStaffInvitationAcceptData(
  data: unknown
): { status: "enrollment_required"; expiresAt: string } {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed invitation accept response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 2 || !keys.includes("status") || !keys.includes("expiresAt")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed invitation accept response: expected status and expiresAt.",
    });
  }

  if (data["status"] !== "enrollment_required") {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed invitation accept response: status must be enrollment_required.",
    });
  }

  if (typeof data["expiresAt"] !== "string" || !isValidIsoDateTime(data["expiresAt"])) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed invitation accept response: expiresAt must be an ISO date-time string.",
    });
  }

  return { status: "enrollment_required", expiresAt: data["expiresAt"] };
}

export function validateStaffInviteReissueData(
  data: unknown
): { reissued: true; expiresAt: string } {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed invite reissue response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 2 || !keys.includes("reissued") || !keys.includes("expiresAt")) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed invite reissue response: expected reissued and expiresAt.",
    });
  }

  if (data["reissued"] !== true) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed invite reissue response: reissued must be true.",
    });
  }

  if (typeof data["expiresAt"] !== "string" || !isValidIsoDateTime(data["expiresAt"])) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed invite reissue response: expiresAt must be an ISO date-time string.",
    });
  }

  return { reissued: true, expiresAt: data["expiresAt"] };
}

export function validateStaffInviteRevokeData(data: unknown): { revoked: true } {
  if (!isPlainObject(data)) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed invite revoke response: data must be an object.",
    });
  }

  const keys = Object.keys(data);
  if (keys.length !== 1 || !keys.includes("revoked") || data["revoked"] !== true) {
    throw new IdentityApiError({
      kind: "protocol",
      message: "Malformed invite revoke response: expected revoked: true.",
    });
  }

  return { revoked: true };
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
