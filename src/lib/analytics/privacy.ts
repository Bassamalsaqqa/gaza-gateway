import { clearSession } from "./session.ts";
import { isPreviewOrDiagnosticMode } from "./preview-guard.ts";

export type ConsentStatus = "granted" | "denied" | "unspecified";

export const CONSENT_STORAGE_KEY = "gza.analytics.consent.v1";

type ConsentListener = (status: ConsentStatus) => void;
const listeners = new Set<ConsentListener>();
let memoryConsent: ConsentStatus | null = null;

/**
 * Detect browser-level Global Privacy Control (GPC) or Do Not Track (DNT).
 */
export function isDntOrGpcActive(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  // Global Privacy Control (navigator.globalPrivacyControl)
  const nav = navigator as unknown as { globalPrivacyControl?: boolean; doNotTrack?: string };
  if (nav.globalPrivacyControl === true) {
    return true;
  }

  // Do Not Track (navigator.doNotTrack or window.doNotTrack)
  const dnt = nav.doNotTrack || (window as unknown as { doNotTrack?: string }).doNotTrack;
  return dnt === "1" || dnt === "yes";
}

/**
 * Get the current explicit user consent status.
 * If DNT or GPC is active, consent is treated as denied.
 * Storage allocation exceptions fail open to memory fallback or unspecified.
 */
export function getConsentStatus(): ConsentStatus {
  // Browser privacy preference takes precedence
  if (isDntOrGpcActive()) {
    return "denied";
  }

  if (memoryConsent) {
    return memoryConsent;
  }

  if (typeof window === "undefined") {
    return "denied";
  }

  try {
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (stored === "granted" || stored === "denied") {
      return stored;
    }
  } catch {
    // Storage access or quota failure: fail open
    return "unspecified";
  }

  return "unspecified";
}

/**
 * Set the explicit user consent status.
 * Fails open if localStorage throws QuotaExceededError or SecurityError.
 */
export function setConsentStatus(status: "granted" | "denied"): void {
  memoryConsent = status;
  if (typeof window === "undefined") {
    for (const listener of listeners) {
      try {
        listener(status);
      } catch {
        // Ignore listener error
      }
    }
    return;
  }

  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, status);
  } catch {
    // Storage allocation failure / quota exceeded: fail open with memoryConsent
  }

  // If user denied, clear session storage identifiers
  if (status === "denied") {
    clearSession();
    try {
      window.sessionStorage.removeItem("gza.analytics.session.v1");
    } catch {
      // Storage access failure: fail open
    }
  }

  for (const listener of listeners) {
    try {
      listener(status);
    } catch {
      // Ignore listener error
    }
  }
}

/**
 * Reset memory consent for unit testing.
 */
export function resetMemoryConsent(): void {
  memoryConsent = null;
}

/**
 * Whether analytics telemetry is permitted to record and transmit data.
 * Must have explicit opt-in, DNT/GPC must NOT be active, and session must NOT be in preview/diagnostic mode.
 */
export function hasAnalyticsConsent(): boolean {
  if (isDntOrGpcActive() || isPreviewOrDiagnosticMode()) {
    return false;
  }
  return getConsentStatus() === "granted";
}

export { isPreviewOrDiagnosticMode };

/**
 * Subscribe to consent changes.
 */
export function subscribeConsent(listener: ConsentListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
