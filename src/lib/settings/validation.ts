import type { ContactSettings, SettingsValidationResult } from "./types.ts";
import { PUBLISHED_CONTACT_SETTINGS } from "./defaults.ts";

export class SettingsValidationError extends Error {
  public readonly errors: string[];
  constructor(message: string, errors: string[] = []) {
    super(message);
    this.name = "SettingsValidationError";
    this.errors = errors;
  }
}

const PHONE_REGEX = /^\+?[0-9\s\-()]{7,25}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateAndSanitizeHttpsUrl(field: string, val: unknown, errors: string[]): string {
  if (val === undefined || val === null) return "";
  if (typeof val !== "string") {
    errors.push(`${field}: URL must be a string.`);
    return "";
  }
  const trimmed = val.trim();
  if (trimmed.length === 0) return "";

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      errors.push(`${field}: Only secure HTTPS URLs are permitted.`);
      return "";
    }
    if (!parsed.hostname || !parsed.hostname.includes(".")) {
      errors.push(`${field}: Hostname is invalid.`);
      return "";
    }
    return parsed.toString();
  } catch {
    errors.push(`${field}: Invalid URL format.`);
    return "";
  }
}

export function validateContactSettings(raw: unknown): SettingsValidationResult<ContactSettings> {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return {
      valid: false,
      errors: ["Invalid contact payload: expected an object."],
      sanitized: { ...PUBLISHED_CONTACT_SETTINGS },
    };
  }

  const obj = raw as Record<string, unknown>;

  // Phone
  const rawPhone = typeof obj["phone"] === "string" ? obj["phone"].trim() : "";
  let phone = rawPhone;
  if (!rawPhone || !PHONE_REGEX.test(rawPhone)) {
    errors.push("phone: A valid phone number of at least 7 digits is required.");
    phone = rawPhone || PUBLISHED_CONTACT_SETTINGS.phone;
  }

  // Email
  const rawEmail = typeof obj["email"] === "string" ? obj["email"].trim() : "";
  let email = rawEmail;
  if (!rawEmail || !EMAIL_REGEX.test(rawEmail)) {
    errors.push("email: A valid email address (e.g. name@domain.com) is required.");
    email = rawEmail || PUBLISHED_CONTACT_SETTINGS.email;
  }

  // Address EN
  const rawAddressEn = typeof obj["addressEn"] === "string" ? obj["addressEn"].trim() : "";
  let addressEn = rawAddressEn;
  if (!rawAddressEn || rawAddressEn.length < 3) {
    errors.push("addressEn: English address must be at least 3 characters.");
    addressEn = rawAddressEn || PUBLISHED_CONTACT_SETTINGS.addressEn;
  }

  // Address AR
  const rawAddressAr = typeof obj["addressAr"] === "string" ? obj["addressAr"].trim() : "";
  let addressAr = rawAddressAr;
  if (!rawAddressAr || rawAddressAr.length < 3) {
    errors.push("addressAr: Arabic address must be at least 3 characters.");
    addressAr = rawAddressAr || PUBLISHED_CONTACT_SETTINGS.addressAr;
  }

  // Social URLs (must be valid HTTPS or empty)
  const socialInstagram = validateAndSanitizeHttpsUrl("socialInstagram", obj["socialInstagram"], errors);
  const socialX = validateAndSanitizeHttpsUrl("socialX", obj["socialX"], errors);
  const socialFacebook = validateAndSanitizeHttpsUrl("socialFacebook", obj["socialFacebook"], errors);
  const socialYouTube = validateAndSanitizeHttpsUrl("socialYouTube", obj["socialYouTube"], errors);

  const sanitized: ContactSettings = {
    phone,
    email,
    addressEn,
    addressAr,
    socialInstagram,
    socialX,
    socialFacebook,
    socialYouTube,
  };

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

export function sanitizeContactSettings(raw: unknown): ContactSettings {
  const result = validateContactSettings(raw);
  return result.sanitized;
}
