/**
 * Guest Booking and Management Recovery Helpers
 *
 * Parses URL fragments (#challenge=...&email=...) delivered via recovery emails
 * into typed parameters without exposing locator credentials in server query logs.
 */

export interface GuestBookingRecoveryParams {
  challengeId: string;
  email: string;
}

export interface GuestAccessRecoveryParams {
  challengeId: string;
  reference: string;
  email: string;
}

export function parseGuestBookingRecoveryHash(hash: string): GuestBookingRecoveryParams | null {
  const clean = hash.replace(/^#/, "");
  if (!clean) return null;
  const params = new URLSearchParams(clean);
  const challenge = params.get("challenge");
  const email = params.get("email");
  if (challenge && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(challenge)) {
    return {
      challengeId: challenge,
      email: email && email.includes("@") ? email.trim().toLowerCase() : "",
    };
  }
  return null;
}

export function parseGuestAccessRecoveryHash(hash: string): GuestAccessRecoveryParams | null {
  const clean = hash.replace(/^#/, "");
  if (!clean) return null;
  const params = new URLSearchParams(clean);
  const challenge = params.get("challenge");
  const ref = params.get("ref");
  const email = params.get("email");
  if (challenge && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(challenge)) {
    return {
      challengeId: challenge,
      reference: ref && /^[A-Za-z0-9_-]{6,16}$/.test(ref) ? ref.toUpperCase() : "",
      email: email && email.includes("@") ? email.trim().toLowerCase() : "",
    };
  }
  return null;
}
