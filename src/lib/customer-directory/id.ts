/**
 * Gaza Gateway — Customer Route ID Encoding & Disambiguation (Phase 6C)
 *
 * Provides deterministic, URL-safe route identifiers for customers without
 * embedding raw email addresses (containing '@' or '.') directly into route URLs.
 *
 * NOTE: This is a reversible URL-safe encoding designed to allow routing to non-persistent
 * customer records without creating a separate database. It is NOT cryptographic
 * anonymization or encryption.
 */

import { normalizeEmailIdentity } from "../passenger/domain.ts";
import type { CustomerType } from "./types.ts";

/**
 * Encodes a UTF-8 string to a URL-safe base64 string (no '+', '/', or trailing '=').
 * Works identically across Node.js and modern browser environments.
 */
export function toBase64Url(input: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "utf-8").toString("base64url");
  }
  // Browser fallback using encodeURIComponent -> btoa -> URL-safe character replacement
  const utf8Bytes = encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16)),
  );
  return btoa(utf8Bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decodes a URL-safe base64 string back to its original UTF-8 string.
 * Returns null if the input is malformed or invalid base64.
 */
export function fromBase64Url(encoded: string): string | null {
  try {
    if (!encoded || typeof encoded !== "string") return null;
    // Strict URL-safe base64 characters only (no padding, no standard '+' or '/')
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
    if (typeof Buffer !== "undefined") {
      return Buffer.from(encoded, "base64url").toString("utf-8");
    }
    // Browser fallback
    let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Generates a stable, collision-free route ID for a customer.
 *
 * Format:
 * - `cus_acc_<base64url>` for registered passenger accounts
 * - `cus_gst_<base64url>` for guest bookings grouped by contact email
 */
export function customerToRouteId(type: CustomerType, email: string): string {
  const normalized = normalizeEmailIdentity(email);
  if (!normalized) {
    throw new Error("Cannot generate customer route ID: email is empty.");
  }
  const prefix = type === "account" ? "cus_acc_" : "cus_gst_";
  return `${prefix}${toBase64Url(normalized)}`;
}

export interface CustomerRouteInfo {
  type: CustomerType;
  normalizedEmail: string;
}

/**
 * Parses a customer route ID back into its customer type and normalized email.
 * Returns null if the route ID does not match the canonical customer route ID structure.
 */
export function routeIdToCustomerInfo(routeId: string): CustomerRouteInfo | null {
  if (!routeId || typeof routeId !== "string") return null;

  let type: CustomerType;
  let token: string;

  if (routeId.startsWith("cus_acc_")) {
    type = "account";
    token = routeId.slice("cus_acc_".length);
  } else if (routeId.startsWith("cus_gst_")) {
    type = "guest";
    token = routeId.slice("cus_gst_".length);
  } else {
    return null;
  }

  if (!token || !/^[A-Za-z0-9_-]+$/.test(token)) return null;

  const email = fromBase64Url(token);
  if (!email || !email.includes("@")) {
    return null;
  }

  const normalized = normalizeEmailIdentity(email);
  if (!normalized) return null;

  // Strict round-trip canonical match: rejects non-canonical tokens, trailing '=' / '===', or malformed cases
  if (toBase64Url(normalized) !== token) {
    return null;
  }

  return {
    type,
    normalizedEmail: normalized,
  };
}

/**
 * Validates a collection of derived customer summaries to guarantee zero route ID collisions.
 * Throws a descriptive error if any collision occurs.
 */
export function assertNoRouteIdCollisions(
  customers: { id: string; email: string; type: CustomerType }[],
): void {
  const seen = new Map<string, { email: string; type: CustomerType }>();
  for (const c of customers) {
    const existing = seen.get(c.id);
    if (existing) {
      if (existing.email !== c.email || existing.type !== c.type) {
        throw new Error(
          `Customer route ID collision detected: ID '${c.id}' is shared between [${existing.type}:${existing.email}] and [${c.type}:${c.email}].`,
        );
      }
    }
    seen.set(c.id, { email: c.email, type: c.type });
  }
}
