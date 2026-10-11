/**
 * Gaza Gateway — Schedule & Offering Identity Codec
 *
 * Implements deterministic URL-safe base64 encoding and identity codecs:
 * - Schedule route key: `sch1-<canonical base64url exact UTF8 ID>`
 * - Dated Offering ID: `svc1-<canonical base64url exact ID>-YYYY-MM-DD`
 *
 * Invariants:
 * - Preserves exact IDs (no trim, no case transformation, no truncation)
 * - Validates 1..160 JavaScript UTF-16 code units
 * - Rejects NUL bytes and lone surrogates / invalid UTF-8
 * - Strict canonical base64url re-encode verification
 * - Strict ISO calendar date validation
 */

export function assertValidScheduleId(id: string): void {
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Schedule ID cannot be empty.");
  }
  if (id.includes("\0")) {
    throw new Error("Schedule ID cannot contain NUL byte.");
  }
  const isWellFormed = !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(id);
  if (!isWellFormed) {
    throw new Error("Schedule ID must be valid UTF-8.");
  }
  if (id.length < 1 || id.length > 160) {
    throw new Error(`Schedule ID must be 1..160 UTF-16 code units (got ${id.length}).`);
  }
}

export function toBase64Url(str: string): string {
  assertValidScheduleId(str);
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64 =
    typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(base64url: string): string | null {
  if (!base64url || base64url.length > 640 || typeof base64url !== "string" || !/^[A-Za-z0-9_-]+$/.test(base64url)) {
    return null;
  }
  const remainder = base64url.length % 4;
  const padded = remainder === 0 ? base64url : base64url + "=".repeat(4 - remainder);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");

  try {
    let binary: string;
    if (typeof atob === "function") {
      binary = atob(base64);
    } else {
      binary = Buffer.from(base64, "base64").toString("binary");
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);

    // Strict canonical check: re-encoding must match the original base64url exactly
    if (toBase64Url(decoded) !== base64url) {
      return null;
    }
    assertValidScheduleId(decoded);
    return decoded;
  } catch {
    return null;
  }
}

export function encodeScheduleKey(id: string): string {
  return `sch1-${toBase64Url(id)}`;
}

export function decodeScheduleKey(key: string): string | null {
  if (!key || typeof key !== "string" || !key.startsWith("sch1-")) {
    return null;
  }
  return fromBase64Url(key.slice(5));
}

export function isValidISODate(date: string): boolean {
  if (typeof date !== "string" || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) {
    return false;
  }
  if (date.startsWith("0000-")) return false;
  const dt = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(dt.getTime()) && dt.toISOString().slice(0, 10) === date;
}

export function getUTCCalendarWeekday(date: string): number {
  if (!isValidISODate(date)) {
    throw new Error(`Invalid ISO calendar date: ${date}`);
  }
  const dt = new Date(`${date}T00:00:00Z`);
  return dt.getUTCDay(); // 0 (Sun) .. 6 (Sat)
}

export function encodeDatedOfferingId(scheduleId: string, date: string): string {
  if (!isValidISODate(date)) {
    throw new Error(`Invalid ISO calendar date: ${date}`);
  }
  return `svc1-${toBase64Url(scheduleId)}-${date}`;
}

export function decodeDatedOfferingId(id: string): { scheduleId: string; date: string } | null {
  if (!id || typeof id !== "string" || !id.startsWith("svc1-")) {
    return null;
  }
  if (id.length < 5 + 1 + 10) {
    return null;
  }
  const date = id.slice(-10);
  const sep = id.charAt(id.length - 11);
  if (sep !== "-" || !isValidISODate(date)) {
    return null;
  }
  const encodedScheduleId = id.slice(5, -11);
  const scheduleId = fromBase64Url(encodedScheduleId);
  if (!scheduleId) {
    return null;
  }
  return { scheduleId, date };
}
