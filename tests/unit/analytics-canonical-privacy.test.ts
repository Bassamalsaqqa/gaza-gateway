import { isDomainAvailableInServerMode } from "../../src/lib/admin.ts";
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { canonicalizePublicPath } from "../../src/lib/analytics/canonical-routes.ts";
import {
  getConsentStatus,
  setConsentStatus,
  hasAnalyticsConsent,
  isDntOrGpcActive,
  resetMemoryConsent,
  isPreviewOrDiagnosticMode,
  CONSENT_STORAGE_KEY,
} from "../../src/lib/analytics/privacy.ts";
import {
  allocateEventIdentity,
  clearSession,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_STORAGE_KEY,
} from "../../src/lib/analytics/session.ts";
import { TelemetryClient } from "../../src/lib/analytics/telemetry-client.ts";

describe("Analytics Canonical Routes & Privacy Redaction Invariants", () => {
  it("normalizes root and static public routes preserving locale en/ar dimension", () => {
    assert.equal(canonicalizePublicPath("/"), "/");
    assert.equal(canonicalizePublicPath("/ar"), "/ar");
    assert.equal(canonicalizePublicPath("/ar/"), "/ar");
    assert.equal(canonicalizePublicPath("/about"), "/about");
    assert.equal(canonicalizePublicPath("/ar/about"), "/ar/about");
    assert.equal(canonicalizePublicPath("/airport"), "/airport");
    assert.equal(canonicalizePublicPath("/ar/airport"), "/ar/airport");
    assert.equal(canonicalizePublicPath("/airport/past"), "/airport/past");
    assert.equal(canonicalizePublicPath("/ar/airport/past"), "/ar/airport/past");
    assert.equal(canonicalizePublicPath("/airport/present"), "/airport/present");
    assert.equal(canonicalizePublicPath("/airport/future"), "/airport/future");
    assert.equal(canonicalizePublicPath("/flights"), "/flights");
    assert.equal(canonicalizePublicPath("/ar/flights"), "/ar/flights");
    assert.equal(canonicalizePublicPath("/destinations"), "/destinations");
    assert.equal(canonicalizePublicPath("/book"), "/book");
    assert.equal(canonicalizePublicPath("/ar/book"), "/ar/book");
    assert.equal(canonicalizePublicPath("/check-in"), "/check-in");
    assert.equal(canonicalizePublicPath("/gallery"), "/gallery");
    assert.equal(canonicalizePublicPath("/ar/gallery"), "/ar/gallery");
    assert.equal(canonicalizePublicPath("/contact"), "/contact");
    assert.equal(canonicalizePublicPath("/ar/contact"), "/ar/contact");
    assert.equal(canonicalizePublicPath("/terms"), "/terms");
    assert.equal(canonicalizePublicPath("/privacy"), "/privacy");
    assert.equal(canonicalizePublicPath("/travel"), "/travel");
  });

  it("strips query parameters, search filters, and hash fragments completely", () => {
    assert.equal(canonicalizePublicPath("/flights?from=GZA&to=AMM&date=2026-10-25"), "/flights");
    assert.equal(canonicalizePublicPath("/ar/flights?trip=round&cabin=economy"), "/ar/flights");
    assert.equal(canonicalizePublicPath("/book?step=fare&scenario=booking.capacity-proof"), "/book");
    assert.equal(canonicalizePublicPath("/about#vision"), "/about");
    assert.equal(canonicalizePublicPath("/airport/past?studioPreview=1#restoration"), "/airport/past");
    assert.equal(canonicalizePublicPath("/gallery?filter=photo&phase=operational"), "/gallery");
    assert.equal(canonicalizePublicPath("/ar/gallery?filter=photo#item-1"), "/ar/gallery");
  });

  it("collapses dynamic routes to safe canonical templates with locale dimension", () => {
    assert.equal(canonicalizePublicPath("/flight/PS-204"), "/flight/:flightId");
    assert.equal(canonicalizePublicPath("/ar/flight/GZA-AMM-01"), "/ar/flight/:flightId");
    assert.equal(canonicalizePublicPath("/destinations/AMM"), "/destinations/:code");
    assert.equal(canonicalizePublicPath("/destinations/CAI"), "/destinations/:code");
    assert.equal(canonicalizePublicPath("/ar/destinations/IST"), "/ar/destinations/:code");
    assert.equal(canonicalizePublicPath("/archive/gza-construction-1998"), "/archive/:id");
    assert.equal(canonicalizePublicPath("/ar/archive/gza-opening-ceremony"), "/ar/archive/:id");
  });

  it("strictly drops administrative paths (fail closed)", () => {
    assert.equal(canonicalizePublicPath("/admin"), null);
    assert.equal(canonicalizePublicPath("/admin/"), null);
    assert.equal(canonicalizePublicPath("/ar/admin"), null);
    assert.equal(canonicalizePublicPath("/ar/admin/"), null);
    assert.equal(canonicalizePublicPath("/admin/analytics"), null);
    assert.equal(canonicalizePublicPath("/ar/admin/analytics"), null);
    assert.equal(canonicalizePublicPath("/admin/bookings"), null);
    assert.equal(canonicalizePublicPath("/admin/flights"), null);
    assert.equal(canonicalizePublicPath("/admin/customers"), null);
    assert.equal(canonicalizePublicPath("/admin/settings"), null);
    assert.equal(canonicalizePublicPath("/admin/staff"), null);
    assert.equal(canonicalizePublicPath("/admin/website"), null);
    assert.equal(canonicalizePublicPath("/admin_.signin"), null);
    assert.equal(canonicalizePublicPath("/ar/admin_.signin"), null);
    assert.equal(canonicalizePublicPath("/admin_/signin"), null);
    assert.equal(canonicalizePublicPath("/admin/signin"), null);
  });

  it("strictly drops private passenger account and sensitive booking management paths with PNRs", () => {
    assert.equal(canonicalizePublicPath("/account"), null);
    assert.equal(canonicalizePublicPath("/ar/account"), null);
    assert.equal(canonicalizePublicPath("/account/trips"), null);
    assert.equal(canonicalizePublicPath("/account/profile"), null);
    assert.equal(canonicalizePublicPath("/account/security"), null);
    assert.equal(canonicalizePublicPath("/manage"), null);
    assert.equal(canonicalizePublicPath("/ar/manage"), null);
    assert.equal(canonicalizePublicPath("/manage/GZA-7K8P"), null);
    assert.equal(canonicalizePublicPath("/manage/GZA-7K8P/check-in"), null);
    assert.equal(canonicalizePublicPath("/manage/GZA-7K8P/seats"), null);
    assert.equal(canonicalizePublicPath("/manage/GZA-7K8P/extras"), null);
    assert.equal(canonicalizePublicPath("/manage/GZA-7K8P/contact"), null);
    assert.equal(canonicalizePublicPath("/booking-confirmation/GZA-7K8P"), null);
    assert.equal(canonicalizePublicPath("/boarding-pass/GZA-7K8P/leg-1/pax-1"), null);
  });

  it("strictly drops authentication, diagnostic, and access-control routes", () => {
    assert.equal(canonicalizePublicPath("/signin"), null);
    assert.equal(canonicalizePublicPath("/register"), null);
    assert.equal(canonicalizePublicPath("/forgot-password"), null);
    assert.equal(canonicalizePublicPath("/reset-password"), null);
    assert.equal(canonicalizePublicPath("/verify-email"), null);
    assert.equal(canonicalizePublicPath("/access-denied"), null);
    assert.equal(canonicalizePublicPath("/api/v1/anything"), null);
    assert.equal(canonicalizePublicPath("/_debugbar"), null);
    assert.equal(canonicalizePublicPath("/telescope"), null);
  });

  it("fails closed on malformed, unwhitelisted, or injection paths", () => {
    assert.equal(canonicalizePublicPath(""), null);
    assert.equal(canonicalizePublicPath("   "), null);
    assert.equal(canonicalizePublicPath("javascript:alert(1)"), null);
    assert.equal(canonicalizePublicPath("/unknown-page-that-does-not-exist"), null);
  });
});

describe("Privacy Signals, DNT, and Explicit Opt-In Invariants", () => {
  beforeEach(() => {
    resetMemoryConsent();
    clearSession();
  });

  it("treats unspecified consent as denied by default", () => {
    assert.equal(hasAnalyticsConsent(), false);
  });

  it("allows telemetry only after explicit granted opt-in", () => {
    setConsentStatus("granted");
    assert.equal(hasAnalyticsConsent(), true);

    setConsentStatus("denied");
    assert.equal(hasAnalyticsConsent(), false);
  });

  it("handles storage allocation exceptions fail-open using memory state", () => {
    // In Node or restricted browser environment without window.localStorage,
    // setConsentStatus should gracefully fall back to memory without throwing
    setConsentStatus("granted");
    assert.equal(getConsentStatus(), "granted");
    assert.equal(hasAnalyticsConsent(), true);
  });
});

describe("Session Deduplication & Monotonic Sequence Invariants", () => {
  beforeEach(() => {
    clearSession();
  });

  it("advances sequence counter monotonically per event", () => {
    const t0 = 1729680000000;
    const ev1 = allocateEventIdentity(t0);
    const ev2 = allocateEventIdentity(t0 + 1000);
    const ev3 = allocateEventIdentity(t0 + 2000);

    assert.equal(ev1.sequence, 1);
    assert.equal(ev2.sequence, 2);
    assert.equal(ev3.sequence, 3);

    // Same visitor and session IDs within active window
    assert.equal(ev1.visitorId, ev2.visitorId);
    assert.equal(ev2.visitorId, ev3.visitorId);
    assert.equal(ev1.sessionId, ev2.sessionId);
    assert.equal(ev2.sessionId, ev3.sessionId);

    // Event IDs are unique
    assert.notEqual(ev1.eventId, ev2.eventId);
    assert.notEqual(ev2.eventId, ev3.eventId);
  });

  it("resets session ID and sequence after 30-minute idle threshold", () => {
    const t0 = 1729680000000;
    const ev1 = allocateEventIdentity(t0);
    assert.equal(ev1.sequence, 1);

    // Jump past 30 minutes idle timeout
    const ev2 = allocateEventIdentity(t0 + SESSION_IDLE_TIMEOUT_MS + 1000);
    assert.equal(ev2.sequence, 1);
    assert.equal(ev2.visitorId, ev1.visitorId); // Preserves anonymous visitor ID
    assert.notEqual(ev2.sessionId, ev1.sessionId); // Fresh session ID
  });
});

describe("Telemetry Client Network, Foreground/Background, and Preview Guard Invariants", () => {
  let mockWindow: {
    location: { origin: string; search: string };
    addEventListener: (type: string, listener: (ev?: unknown) => void) => void;
    removeEventListener: (type: string, listener: (ev?: unknown) => void) => void;
    dispatchEvent: (event: { type: string }) => boolean;
  };
  let mockDocument: {
    visibilityState: "visible" | "hidden";
    addEventListener: (type: string, listener: (ev?: unknown) => void) => void;
    removeEventListener: (type: string, listener: (ev?: unknown) => void) => void;
    dispatchEvent: (event: { type: string }) => boolean;
  };
  let networkCalls: { url: string; payload: Record<string, unknown> }[];
  let activeClients: TelemetryClient[] = [];

  function createTestClient(): TelemetryClient {
    const client = new TelemetryClient();
    activeClients.push(client);
    return client;
  }

  beforeEach(() => {
    resetMemoryConsent();
    clearSession();
    networkCalls = [];
    activeClients = [];
    delete (globalThis.window as unknown as { __GZA_STUDIO_ISOLATED__?: boolean })?.__GZA_STUDIO_ISOLATED__;

    const windowListeners: Record<string, Set<(ev?: unknown) => void>> = {};
    const docListeners: Record<string, Set<(ev?: unknown) => void>> = {};

    mockWindow = {
      location: {
        origin: "https://gaza-gateway.test",
        search: "",
      },
      addEventListener: (type, listener) => {
        if (!windowListeners[type]) windowListeners[type] = new Set();
        windowListeners[type].add(listener);
      },
      removeEventListener: (type, listener) => {
        windowListeners[type]?.delete(listener);
      },
      dispatchEvent: (event) => {
        const list = windowListeners[event.type];
        if (list) {
          for (const l of list) l(event);
        }
        return true;
      },
    };

    mockDocument = {
      visibilityState: "visible",
      addEventListener: (type, listener) => {
        if (!docListeners[type]) docListeners[type] = new Set();
        docListeners[type].add(listener);
      },
      removeEventListener: (type, listener) => {
        docListeners[type]?.delete(listener);
      },
      dispatchEvent: (event) => {
        const list = docListeners[event.type];
        if (list) {
          for (const l of list) l(event);
        }
        return true;
      },
    };

    // @ts-expect-error test mock
    globalThis.window = mockWindow;
    // @ts-expect-error test mock
    globalThis.document = mockDocument;

    // @ts-expect-error test mock
    globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
      networkCalls.push({
        url: String(url),
        payload: JSON.parse(String(init?.body)),
      });
      return new Response("{}", { status: 204 });
    };
  });

  afterEach(() => {
    for (const client of activeClients) {
      client.dispose();
    }
    activeClients = [];
    delete (globalThis.window as unknown as { __GZA_STUDIO_ISOLATED__?: boolean })?.__GZA_STUDIO_ISOLATED__;
  });

  it("strictly suppresses all network calls before explicit opt-in", () => {
    const client = createTestClient();
    client.start();

    // Navigating without consent should emit 0 network calls
    client.onRouteChange("/flights");
    client.trackInteraction("search", "/flights");
    client.tickEngagement();
    client.flushEngagement();

    assert.equal(networkCalls.length, 0);
  });

  it("emits page_view and interaction events upon explicit consent", () => {
    const client = createTestClient();
    setConsentStatus("granted");
    client.start();

    // 1. Route navigation emits page_view
    client.onRouteChange("/flights");
    assert.equal(networkCalls.length, 1);
    assert.equal(networkCalls[0].payload.eventType, "page_view");
    assert.equal(networkCalls[0].payload.path, "/flights");
    assert.ok(typeof networkCalls[0].payload.visitorId === "string");
    assert.ok(typeof networkCalls[0].payload.eventId === "string");

    // 2. Track search interaction
    client.trackInteraction("search", "/flights");
    assert.equal(networkCalls.length, 2);
    assert.equal(networkCalls[1].payload.eventType, "search");
    assert.equal(networkCalls[1].payload.path, "/flights");
  });

  it("strictly drops telemetry when staff session is active", () => {
    const client = createTestClient();
    setConsentStatus("granted");
    client.start();

    // Activate staff session
    client.setStaffActive(true);
    networkCalls.length = 0;

    client.onRouteChange("/airport");
    client.trackInteraction("booking_start", "/book");
    client.tickEngagement();
    client.flushEngagement();

    // Strictly 0 calls emitted for staff
    assert.equal(networkCalls.length, 0);

    // When staff logs out, telemetry can resume
    client.setStaffActive(false);
    client.onRouteChange("/airport");
    assert.equal(networkCalls.length, 1);
    assert.equal(networkCalls[0].payload.eventType, "page_view");
  });

  it("strictly excludes Studio and diagnostic preview query modes", () => {
    assert.equal(isPreviewOrDiagnosticMode(""), false);
    assert.equal(isPreviewOrDiagnosticMode("?step=fare"), false);
    assert.equal(isPreviewOrDiagnosticMode("?diagnostic=1"), true);
    assert.equal(isPreviewOrDiagnosticMode("?scenario=booking.capacity-proof"), true);
    assert.equal(isPreviewOrDiagnosticMode("?skinPreview=1"), true);
    assert.equal(isPreviewOrDiagnosticMode("?studioPreview=1"), true);

    const client = createTestClient();
    setConsentStatus("granted");

    // Simulate studio preview mode
    mockWindow.location.search = "?studioPreview=1";
    networkCalls.length = 0;

    client.onRouteChange("/airport/past");
    client.trackInteraction("archive_explore", "/airport/past");
    client.tickEngagement();
    client.flushEngagement();

    // All events are strictly suppressed in preview modes
    assert.equal(networkCalls.length, 0);
  });

  it("accumulates engagement in foreground but pauses in background tabs", () => {
    const client = createTestClient();
    setConsentStatus("granted");
    client.start();

    // 1. Navigate to route in foreground
    mockDocument.visibilityState = "visible";
    client.onRouteChange("/airport/past");
    networkCalls.length = 0;

    // Simulate foreground activity
    mockWindow.dispatchEvent({ type: "mousemove" });
    client.tickEngagement();
    client.tickEngagement();
    client.flushEngagement();

    assert.equal(networkCalls.length, 1);
    assert.equal(networkCalls[0].payload.eventType, "engagement");
    assert.equal(networkCalls[0].payload.engagementSeconds, 2);

    // 2. Tab is hidden (background)
    mockDocument.visibilityState = "hidden";
    mockDocument.dispatchEvent({ type: "visibilitychange" });
    networkCalls.length = 0;

    // Ticks in background MUST NOT accumulate seconds
    client.tickEngagement();
    client.tickEngagement();
    client.tickEngagement();
    client.flushEngagement();

    // Engagement was 0, so no network call is dispatched
    assert.equal(networkCalls.length, 0);
  });

  it("idempotently handles start and stop, discarding pending data on revocation", () => {
    const client = createTestClient();
    setConsentStatus("granted");
    client.start();
    client.start(); // Idempotent second start

    client.onRouteChange("/flights");
    networkCalls.length = 0;

    // Revoke consent
    setConsentStatus("denied");

    client.onRouteChange("/airport");
    client.trackInteraction("search", "/flights");
    client.flushEngagement();

    // Strictly 0 calls after revocation
    assert.equal(networkCalls.length, 0);

    // Idempotent stop
    client.stop();
    client.stop();
  });
});


it("admits only the newly wired analytics screen in server mode", () => {
  assert.equal(isDomainAvailableInServerMode("/admin/analytics"), true);
  assert.equal(isDomainAvailableInServerMode("/admin/analytics/"), true);
  assert.equal(isDomainAvailableInServerMode("/admin/analytics/unknown"), false);
});
