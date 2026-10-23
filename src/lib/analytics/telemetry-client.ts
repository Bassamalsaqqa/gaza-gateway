import { hasAnalyticsConsent, subscribeConsent, isPreviewOrDiagnosticMode } from "./privacy.ts";
import { canonicalizePublicPath } from "./canonical-routes.ts";
import { allocateEventIdentity } from "./session.ts";
import type { AnalyticsEventType } from "./types.ts";

const INGESTION_ENDPOINT = "/api/v1/analytics/events";
const MAX_FLUSH_INTERVAL_MS = 30_000; // 30 seconds
const ACTIVITY_IDLE_TIMEOUT_MS = 5_000; // 5 seconds of inactivity pauses engagement accumulation
const MAX_ENGAGEMENT_DELTA = 60; // Backend max delta per event

interface PendingEngagement {
  path: string;
  seconds: number;
}

function extractReferrerHost(): string | undefined {
  if (typeof window === "undefined" || !document.referrer) return undefined;
  try {
    const url = new URL(document.referrer);
    // Exclude same-origin referrers to focus on external acquisition channels
    if (url.origin === window.location.origin) {
      return undefined;
    }
    const host = url.hostname.toLowerCase().trim();
    if (host.length > 0 && host.length <= 253 && /^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)*$/.test(host)) {
      return host;
    }
  } catch {
    // Malformed referrer URL
  }
  return undefined;
}

export class TelemetryClient {
  private isRunning = false;
  private shouldBeRunning = false;
  private isStaff = false;
  private activePath: string | null = null;
  private lastViewedPath: string | null = null;
  private pendingEngagement: PendingEngagement | null = null;
  private lastActivityMs = 0;
  private engagementTickTimer: ReturnType<typeof setInterval> | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isWindowFocused = true;
  private cleanupListeners: (() => void)[] = [];
  private consentUnsubscribe: (() => void) | null = null;

  public constructor() {
    if (typeof window !== "undefined") {
      this.consentUnsubscribe = subscribeConsent((status) => {
        if (status === "granted") {
          if (this.shouldBeRunning && !this.isRunning && !this.isStaff) {
            this.start();
            if (this.activePath) {
              this.emitEvent("page_view", this.activePath);
              this.lastViewedPath = this.activePath;
            }
          }
        } else {
          // If consent revoked, stop immediately and discard pending data
          const resumeWhenConsented = this.shouldBeRunning;
          this.stop();
          this.shouldBeRunning = resumeWhenConsented;
          this.pendingEngagement = null;
          this.lastViewedPath = null;
        }
      });
    }
  }

  /**
   * Set staff session status. Staff sessions are NEVER tracked.
   */
  public setStaffActive(active: boolean): void {
    this.isStaff = active;
    if (active) {
      this.lastViewedPath = null;
      this.stop();
      this.pendingEngagement = null;
    } else if (this.shouldBeRunning && hasAnalyticsConsent() && !this.isRunning) {
      this.start();
    }
  }

  /**
   * Idempotently start telemetry monitoring.
   * Invariant: Strictly NO timers or listeners are started before explicit opt-in consent or for staff.
   */
  public start(): void {
    if (typeof window === "undefined") return;
    this.shouldBeRunning = true;

    // Idempotent guard
    if (this.isRunning) return;

    // Reject start before explicit opt-in, if staff, or in preview/diagnostic query modes
    if (!hasAnalyticsConsent() || this.isStaff || isPreviewOrDiagnosticMode()) {
      return;
    }

    this.isRunning = true;
    if (this.activePath && !this.pendingEngagement) {
      this.pendingEngagement = { path: this.activePath, seconds: 0 };
    }
    this.lastActivityMs = Date.now();
    this.isWindowFocused = document.visibilityState === "visible";

    // 1. Listen for user interactions to determine active foreground engagement
    const onUserActivity = () => {
      this.lastActivityMs = Date.now();
    };

    const activityEvents = ["mousemove", "keydown", "scroll", "touchstart", "pointerdown", "click"];
    for (const evt of activityEvents) {
      window.addEventListener(evt, onUserActivity, { passive: true });
      this.cleanupListeners.push(() => window.removeEventListener(evt, onUserActivity));
    }

    // 2. Visibility change handling: background tabs MUST NOT accumulate active time
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        this.isWindowFocused = false;
        // Flush pending engagement when tab is hidden
        this.flushEngagement();
      } else {
        this.isWindowFocused = true;
        this.lastActivityMs = Date.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    this.cleanupListeners.push(() => document.removeEventListener("visibilitychange", onVisibilityChange));

    // 3. Pagehide / beforeunload flush
    const onPageHide = () => {
      this.flushEngagement(true);
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);
    this.cleanupListeners.push(() => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
    });

    // 4. Tick timer: accumulate seconds every 1s when active in foreground
    this.engagementTickTimer = setInterval(() => {
      this.tickEngagement();
    }, 1_000);

    // 5. Periodic flush timer: bounded at max 30s intervals
    this.flushTimer = setInterval(() => {
      this.flushEngagement();
    }, MAX_FLUSH_INTERVAL_MS);
  }

  /**
   * Idempotently stop telemetry and clean up timers and listeners.
   */
  public stop(): void {
    if (!this.isRunning) {
      this.shouldBeRunning = false;
      return;
    }

    this.shouldBeRunning = false;
    this.isRunning = false;

    if (this.engagementTickTimer) {
      clearInterval(this.engagementTickTimer);
      this.engagementTickTimer = null;
    }
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    for (const cleanup of this.cleanupListeners) {
      cleanup();
    }
    this.cleanupListeners = [];

    // Flush any pending engagement if consented
    if (hasAnalyticsConsent() && !this.isStaff) {
      this.flushEngagement(true);
    }
    this.pendingEngagement = null;
  }

  /**
   * Completely dispose of the client and unsubscribe all listeners.
   */
  public dispose(): void {
    this.stop();
    if (this.consentUnsubscribe) {
      this.consentUnsubscribe();
      this.consentUnsubscribe = null;
    }
  }

  /**
   * Handle route navigation.
   */
  public onRouteChange(rawPath: string): void {
    const canonical = canonicalizePublicPath(rawPath);
    // Hydration/remount callbacks for the same location are not a second visit.
    // Preserve its pending engagement interval as well as its page-view count.
    if (canonical && canonical === this.activePath && canonical === this.lastViewedPath) return;

    // 1. Flush engagement for previous path before transitioning
    if (hasAnalyticsConsent() && !this.isStaff && !isPreviewOrDiagnosticMode()) {
      this.flushEngagement();
    }

    // 2. Canonicalize path
    this.activePath = canonical;

    if (!canonical || this.isStaff || isPreviewOrDiagnosticMode()) {
      this.pendingEngagement = null;
      return;
    }

    this.pendingEngagement = {
      path: canonical,
      seconds: 0,
    };
    this.lastActivityMs = Date.now();

    // 3. Emit page_view event if consent is active
    if (hasAnalyticsConsent()) {
      this.emitEvent("page_view", canonical);
      this.lastViewedPath = canonical;
    }
  }

  /**
   * Record a discrete interaction event (search, booking_start, archive_explore).
   */
  public trackInteraction(eventType: "search" | "booking_start" | "archive_explore", rawPath?: string, searchRoute?: string): void {
    if (this.isStaff || !hasAnalyticsConsent() || isPreviewOrDiagnosticMode()) return;

    const targetPath = rawPath ? canonicalizePublicPath(rawPath) : this.activePath;
    if (!targetPath) return;

    this.emitEvent(eventType, targetPath, 0, false, searchRoute);
  }

  /**
   * Periodic tick for accumulating foreground engagement.
   */
  public tickEngagement(): void {
    // Background tabs, preview/diagnostic modes, and idle users strictly do not accumulate engagement
    if (
      !this.isWindowFocused ||
      (typeof document !== "undefined" && document.visibilityState !== "visible") ||
      isPreviewOrDiagnosticMode()
    ) {
      return;
    }

    if (!this.pendingEngagement || !this.activePath) {
      return;
    }

    const now = Date.now();
    if (now - this.lastActivityMs <= ACTIVITY_IDLE_TIMEOUT_MS) {
      this.pendingEngagement.seconds += 1;

      // If pending engagement reaches max delta (60s), flush early
      if (this.pendingEngagement.seconds >= MAX_ENGAGEMENT_DELTA) {
        this.flushEngagement();
      }
    }
  }

  /**
   * Flush pending engagement seconds.
   */
  public flushEngagement(isClosing = false): void {
    if (!this.pendingEngagement || this.pendingEngagement.seconds <= 0) {
      return;
    }

    if (!hasAnalyticsConsent() || this.isStaff || isPreviewOrDiagnosticMode()) {
      this.pendingEngagement = null;
      return;
    }

    const seconds = Math.min(MAX_ENGAGEMENT_DELTA, this.pendingEngagement.seconds);
    const path = this.pendingEngagement.path;

    // Reset pending counter
    this.pendingEngagement.seconds = 0;

    this.emitEvent("engagement", path, seconds, isClosing);
  }

  private emitEvent(
    eventType: AnalyticsEventType,
    path: string,
    engagementSeconds = 0,
    isClosing = false,
    searchRoute?: string,
  ): void {
    if (!hasAnalyticsConsent() || this.isStaff || isPreviewOrDiagnosticMode()) {
      return;
    }

    const { visitorId, eventId } = allocateEventIdentity();
    const referrer = eventType === "page_view" ? extractReferrerHost() : undefined;

    const payload: Record<string, unknown> = {
      eventType,
      visitorId,
      eventId,
      path,
      ...(engagementSeconds > 0 ? { engagementSeconds } : {}),
      ...(referrer ? { referrer } : {}),
      ...(searchRoute && /^[A-Z]{3}-[A-Z]{3}$/.test(searchRoute) ? { searchRoute } : {}),
    };

    this.sendPayload(payload, isClosing);
  }

  private sendPayload(payload: Record<string, unknown>, isClosing: boolean): void {
    if (typeof window === "undefined") return;

    try {
      const body = JSON.stringify(payload);

      // On page close / unload, prefer sendBeacon or fetch keepalive
      if (isClosing && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const blob = new Blob([body], { type: "application/json" });
        const sent = navigator.sendBeacon(INGESTION_ENDPOINT, blob);
        if (sent) return;
      }

      // Standard fetch with keepalive: true (fail open)
      // Uses credentials: "same-origin" so server sees staff session cookie and ignores (never read cookies in JS)
      fetch(INGESTION_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body,
        keepalive: true,
        credentials: "same-origin",
      }).catch(() => {
        // Fail open: network drops, ad-blockers, or server offline never disrupt UI
      });
    } catch {
      // Fail open
    }
  }
}

export const telemetryClient = new TelemetryClient();
