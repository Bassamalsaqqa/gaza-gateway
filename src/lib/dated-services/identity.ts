/**
 * Gaza Gateway — Dated-Service Identity Codec
 *
 * Provides deterministic, versioned, URL-safe, reversible identity:
 * `svc1-<base64url UTF-8 exact Schedule ID>-YYYY-MM-DD`
 *
 * Characteristics:
 * - Deterministic & 100% reversible: parseDatedServiceId(datedServiceId(s, d)) === { scheduleId: s, date: d }
 * - Canonical & non-lossy: preserves exact Schedule ID (Unicode, whitespace, punctuation, up to 160 chars)
 * - Calibrated date validation: checks genuine ISO calendar dates (rejects February 30, leap-year checks, etc.)
 * - Zero dependency on mutable flight fields (number, departTime, aircraft, gate, price)
 * - Identical behavior across Node unit test runtime and modern browser runtimes
 */

import type { DatedServiceIdPayload } from "./types.ts";

const PREFIX = "svc1-";
const ISO_DATE_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const BASE64URL_REGEX = /^[A-Za-z0-9_-]+$/;

/**
 * Validates that dateStr is an exact, valid Gregorian ISO calendar date (YYYY-MM-DD).
 */
export function isValidISODate(dateStr: string): boolean {
  if (!ISO_DATE_REGEX.test(dateStr)) return false;
  const parts = dateStr.split("-").map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  const dt = new Date(`${dateStr}T00:00:00Z`);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Computes calendar weekday (0 = Sunday ... 6 = Saturday) strictly via UTC calendar arithmetic.
 * Independent of the host environment's locale, timezone, or DST shifts.
 */
export function getUTCCalendarWeekday(dateStr: string): number {
  const dt = new Date(`${dateStr}T00:00:00Z`);
  return dt.getUTCDay();
}

/**
 * Reversible URL-safe base64 encoding of exact UTF-8 strings.
 */
export function toBase64Url(str: string): string {
  if (
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      new TextEncoder().encode(str),
    ) !== str
  ) {
    throw new Error("Schedule identity contains invalid Unicode.");
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "utf8").toString("base64url");
  }
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]!);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Reversible URL-safe base64 decoding with strict UTF-8 validation (fatal on replacement characters).
 * Returns null if string is non-canonical or malformed.
 */
export function fromBase64Url(base64url: string): string | null {
  if (!BASE64URL_REGEX.test(base64url)) return null;
  try {
    if (typeof Buffer !== "undefined") {
      const buf = Buffer.from(base64url, "base64url");
      const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
      const text = decoder.decode(buf);
      if (Buffer.from(text, "utf8").toString("base64url") !== base64url) return null;
      return text;
    }
    let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    const text = decoder.decode(bytes);
    if (toBase64Url(text) !== base64url) return null;
    return text;
  } catch {
    return null;
  }
}

/**
 * Generates a stable, canonical dated service identifier.
 * Format: `svc1-<base64url>-<YYYY-MM-DD>`
 */
export function datedServiceId(scheduleId: string, date: string): string {
  if (typeof scheduleId !== "string" || scheduleId.length < 1 || scheduleId.length > 160) {
    throw new Error(`Schedule ID must be a 1-160 character string: ${scheduleId}`);
  }
  if (!isValidISODate(date)) {
    throw new Error(`Invalid ISO calendar date: ${date}`);
  }
  return `${PREFIX}${toBase64Url(scheduleId)}-${date}`;
}

/**
 * Parses a dated service identifier into its exact { scheduleId, date } constituent facts.
 * Returns null if malformed, non-canonical, or invalid date.
 */
export function parseDatedServiceId(id: string): DatedServiceIdPayload | null {
  if (typeof id !== "string") return null;
  if (!id.startsWith(PREFIX)) return null;

  if (id.length < PREFIX.length + 1 + 10) return null;
  const date = id.slice(-10);
  const separator = id[id.length - 11];
  if (separator !== "-") return null;
  if (!isValidISODate(date)) return null;

  const encodedScheduleId = id.slice(PREFIX.length, -11);
  if (!encodedScheduleId) return null;

  const scheduleId = fromBase64Url(encodedScheduleId);
  if (!scheduleId || scheduleId.length < 1 || scheduleId.length > 160) return null;

  return { scheduleId, date };
}

/**
 * Predicate checking whether an ID matches the dated service identifier codec.
 */
export function isDatedServiceId(id: string): boolean {
  return parseDatedServiceId(id) !== null;
}
