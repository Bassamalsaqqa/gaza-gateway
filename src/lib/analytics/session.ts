/**
 * First-party ephemeral session & deduplication coordinator.
 *
 * Invariants:
 * 1. Session-only (sessionStorage or memory only, never persistent cross-session cookies).
 * 2. 30-minute inactivity idle window: resets session and sequence counter on expiry.
 * 3. Safe identifiers matching backend constraint: /^[a-zA-Z0-9_\-]{16,64}$/.
 * 4. Monotonic sequence counter per session for replay handling and deduplication.
 * 5. Storage allocation exceptions fail open smoothly to in-memory session.
 */

export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const SESSION_STORAGE_KEY = "gza.analytics.session.v1";

interface StoredSession {
  visitorId: string;
  sessionId: string;
  lastActiveMs: number;
  sequence: number;
}

let memorySession: StoredSession | null = null;

function generateRandomToken(prefix: string, length = 32): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let token = prefix + "_";
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length; i++) {
      token += chars[bytes[i]! % chars.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      token += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return token.slice(0, 64);
}

function readSession(now: number): StoredSession {
  let session: StoredSession | null = memorySession;

  if (typeof window !== "undefined") {
    try {
      const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredSession>;
        if (
          typeof parsed.visitorId === "string" &&
          typeof parsed.sessionId === "string" &&
          typeof parsed.lastActiveMs === "number" &&
          typeof parsed.sequence === "number"
        ) {
          session = parsed as StoredSession;
        }
      }
    } catch {
      // Storage access or quota failure: fail open to memorySession
    }
  }

  // If no session exists or idle timeout exceeded, initialize new session
  if (!session || now - session.lastActiveMs > SESSION_IDLE_TIMEOUT_MS) {
    const visitorId = session?.visitorId ?? generateRandomToken("v", 24);
    session = {
      visitorId,
      sessionId: generateRandomToken("s", 24),
      lastActiveMs: now,
      sequence: 1,
    };
  } else {
    session.lastActiveMs = now;
  }

  writeSession(session);
  return session;
}

function writeSession(session: StoredSession): void {
  memorySession = session;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Storage allocation exception fail open: memorySession preserves session state
    }
  }
}

/**
 * Allocate next event payload identifiers with monotonic sequence and fresh activity timestamp.
 */
export function allocateEventIdentity(now = Date.now()): {
  visitorId: string;
  sessionId: string;
  eventId: string;
  sequence: number;
} {
  const session = readSession(now);
  const sequence = session.sequence;
  const eventId = generateRandomToken(`e${sequence}`, 24);

  // Advance sequence
  session.sequence += 1;
  session.lastActiveMs = now;
  writeSession(session);

  return {
    visitorId: session.visitorId,
    sessionId: session.sessionId,
    eventId,
    sequence,
  };
}

/**
 * Clear the current session (e.g. on user opt-out or session end).
 */
export function clearSession(): void {
  memorySession = null;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Storage access failure: fail open
    }
  }
}

/**
 * Inspect memory session for unit test assertions.
 */
export function getMemorySession(): StoredSession | null {
  return memorySession;
}
