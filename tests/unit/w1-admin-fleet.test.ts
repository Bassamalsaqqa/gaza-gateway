import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createReferenceApiClient,
  ReferenceApiError,
  type ReferenceApiClient,
} from "../../src/lib/api/reference-client.ts";
import { HttpFleetRepository } from "../../src/lib/fleet/http-repository.ts";
import { FleetError, type Aircraft, type AircraftLayout } from "../../src/lib/fleet/types.ts";
import { isDomainAvailableInServerMode } from "../../src/lib/admin.ts";
import { createRepositories } from "../../src/lib/repositories/registry.ts";

const sampleAircraft: Aircraft = {
  id: "air-738-01",
  model: "Boeing 737-800",
  registration: "SU-GZA",
  active: true,
};

const sampleLayout: AircraftLayout = {
  aircraftId: "air-738-01",
  rows: 30,
  letters: ["A", "B", "C", "D", "E", "F"],
  aisleAfter: 3,
  zones: [{ id: "economy", firstRow: 1, lastRow: 30 }],
  extraLegroomRows: [1, 14, 15],
  unavailable: [],
};

function createMockFetch(
  handler: (url: string, init: RequestInit) => { status: number; body: unknown; headers?: Record<string, string> }
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const { status, body, headers = {} } = handler(url, init ?? {});
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": (init?.headers as Record<string, string>)["X-Request-Id"],
        ...headers,
      },
    });
  }) as typeof fetch;
}

describe("C01 Reference API Client & Validation", () => {
  it("fetches atomic fleet snapshot with canonical meta and Zod validation", async () => {
    let capturedReqId = "";
    const client = createReferenceApiClient({
      enabled: true, nonProductionOptIn: true, environment: { MODE: "test", DEV: true, PROD: false },
      baseUrl: "https://127.0.0.1:18090/api/v1",
      fetch: createMockFetch((url, init) => {
        assert.ok(url.endsWith("/fleet/snapshot"));
        assert.equal(init.method, "GET");
        capturedReqId = (init.headers as Record<string, string>)["X-Request-Id"];
        return {
          status: 200,
          body: {
            success: true,
            data: {
              revision: 10,
              aircraft: [sampleAircraft],
              layouts: {
                "air-738-01": sampleLayout,
              },
            },
            meta: { requestId: capturedReqId, timestamp: new Date().toISOString() },
          },
        };
      }),
    });

    const res = await client.getFleetSnapshot();
    assert.equal(res.success, true);
    assert.equal(res.data.revision, 10);
    assert.equal(res.data.aircraft.length, 1);
    assert.deepEqual(res.data.aircraft[0], sampleAircraft);
    assert.deepEqual(res.data.layouts["air-738-01"], sampleLayout);
  });

  it("handles authoritative aircraft mutation and receipt", async () => {
    let capturedCsrf = "";
    let capturedMethod = "";
    const client = createReferenceApiClient({
      enabled: true, nonProductionOptIn: true, environment: { MODE: "test", DEV: true, PROD: false },
      baseUrl: "https://127.0.0.1:18090/api/v1",
      csrfTokenProvider: async () => "mock-staff-csrf-token-1234",
      fetch: createMockFetch((url, init) => {
        capturedMethod = init.method ?? "GET";
        const headers = init.headers as Record<string, string>;
        capturedCsrf = headers["X-CSRF-TOKEN"];
        const reqId = headers["X-Request-Id"];

        if (url.endsWith("/receipt")) {
          assert.ok(url.includes("/admin/fleet/aircraft/air-738-01/receipt"));
          return {
            status: 200,
            body: {
              success: true,
              data: {
                aircraft: { ...sampleAircraft, active: false },
                changed: true,
                revision: 11,
              },
              meta: { requestId: reqId, timestamp: new Date().toISOString() },
            },
          };
        }

        return {
          status: 200,
          body: {
            success: true,
            data: { ...sampleAircraft, active: false },
            meta: { requestId: reqId, timestamp: new Date().toISOString() },
          },
        };
      }),
    });

    const receiptRes = await client.patchAdminAircraftReceipt("air-738-01", { active: false });
    assert.equal(capturedMethod, "PATCH");
    assert.equal(capturedCsrf, "mock-staff-csrf-token-1234");
    assert.equal(receiptRes.data.changed, true);
    assert.equal(receiptRes.data.revision, 11);
    assert.equal(receiptRes.data.aircraft.active, false);
  });

  it("handles authoritative seat layout mutation receipt", async () => {
    const client = createReferenceApiClient({
      enabled: true, nonProductionOptIn: true, environment: { MODE: "test", DEV: true, PROD: false },
      baseUrl: "https://127.0.0.1:18090/api/v1",
      csrfTokenProvider: async () => "csrf-token-abc",
      fetch: createMockFetch((url, init) => {
        assert.equal(init.method, "PUT");
        assert.ok(url.endsWith("/admin/fleet/seat-layouts/air-738-01/receipt"));
        const reqId = (init.headers as Record<string, string>)["X-Request-Id"];
        return {
          status: 200,
          body: {
            success: true,
            data: {
              layout: sampleLayout,
              changed: true,
              revision: 12,
            },
            meta: { requestId: reqId, timestamp: new Date().toISOString() },
          },
        };
      }),
    });

    const res = await client.putAdminSeatLayoutReceipt("air-738-01", {
      rows: sampleLayout.rows,
      letters: sampleLayout.letters,
      aisleAfter: sampleLayout.aisleAfter,
      zones: sampleLayout.zones,
      extraLegroomRows: sampleLayout.extraLegroomRows,
      unavailable: sampleLayout.unavailable,
    });
    assert.equal(res.data.changed, true);
    assert.equal(res.data.revision, 12);
    assert.deepEqual(res.data.layout, sampleLayout);
  });

  it("rejects unsafe route IDs prior to any network dispatch", async () => {
    let networkCalls = 0;
    const client = createReferenceApiClient({
      enabled: true, nonProductionOptIn: true, environment: { MODE: "test", DEV: true, PROD: false },
      baseUrl: "https://127.0.0.1:18090/api/v1",
      fetch: createMockFetch(() => {
        networkCalls++;
        return { status: 200, body: {} };
      }),
    });

    const unsafeIds = ["../../etc/passwd", "air 01", "air/slash", "", " ", "air$special", "air-01\n"];
    for (const badId of unsafeIds) {
      await assert.rejects(
        async () => await client.getSeatLayoutById(badId),
        (err: unknown) => {
          assert.ok(err instanceof ReferenceApiError);
          assert.equal((err as ReferenceApiError).kind, "protocol");
          return true;
        }
      );
    }
    assert.equal(networkCalls, 0);
  });

  it("detects request correlation ID mismatch and throws protocol error", async () => {
    const client = createReferenceApiClient({
      enabled: true, nonProductionOptIn: true, environment: { MODE: "test", DEV: true, PROD: false },
      baseUrl: "https://127.0.0.1:18090/api/v1",
      fetch: createMockFetch(() => ({
        status: 200,
        body: {
          success: true,
          data: [sampleAircraft],
          meta: { requestId: "tampered-request-id", timestamp: new Date().toISOString() },
        },
      })),
    });

    await assert.rejects(
      async () => await client.getFleetAircraft(),
      (err: unknown) => {
        assert.ok(err instanceof ReferenceApiError);
        assert.equal((err as ReferenceApiError).kind, "protocol");
        return true;
      }
    );
  });

  it("throws abort error when signal is already aborted prior to dispatch", async () => {
    const controller = new AbortController();
    controller.abort();

    let networkCalls = 0;
    const client = createReferenceApiClient({
      enabled: true, nonProductionOptIn: true, environment: { MODE: "test", DEV: true, PROD: false },
      baseUrl: "https://127.0.0.1:18090/api/v1",
      fetch: createMockFetch(() => {
        networkCalls++;
        return { status: 200, body: {} };
      }),
    });

    await assert.rejects(
      async () => await client.getFleetSnapshot({ signal: controller.signal }),
      (err: unknown) => {
        assert.ok(err instanceof ReferenceApiError);
        assert.equal((err as ReferenceApiError).kind, "abort");
        return true;
      }
    );
    assert.equal(networkCalls, 0);
  });

  it("fails closed without network calls when client is disabled", async () => {
    let networkCalls = 0;
    const client = createReferenceApiClient({
      enabled: false,
      fetch: createMockFetch(() => {
        networkCalls++;
        return { status: 200, body: {} };
      }),
    });

    await assert.rejects(
      async () => await client.getFleetSnapshot(),
      (err: unknown) => {
        assert.ok(err instanceof ReferenceApiError);
        assert.equal((err as ReferenceApiError).kind, "configuration");
        return true;
      }
    );
    assert.equal(networkCalls, 0);
  });
});

describe("HttpFleetRepository Domain Authority & Receipts", () => {
  it("initializes cache from authoritative snapshot and serves queries", async () => {
    const fakeClient = {
      getFleetSnapshot: async () => ({
        success: true as const,
        data: {
          revision: 5,
          aircraft: [sampleAircraft],
          layouts: { "air-738-01": sampleLayout },
        },
        meta: { requestId: "req-1", timestamp: "2026-10-11T12:00:00Z" },
      }),
    };

    const repo = new HttpFleetRepository(() => fakeClient as unknown as ReferenceApiClient);

    const snapshot = await repo.get();
    assert.equal(snapshot.aircraft.length, 1);
    assert.equal(snapshot.aircraft[0].id, "air-738-01");

    const single = await repo.getAircraftById("air-738-01");
    assert.ok(single);
    assert.equal(single.model, "Boeing 737-800");

    const layout = await repo.getLayoutByAircraftId("air-738-01");
    assert.ok(layout);
    assert.equal(layout.aircraftId, "air-738-01");
  });

  it("fails closed on missing layout in complete snapshot", async () => {
    const fakeClient = {
      getFleetSnapshot: async () => ({
        success: true as const,
        data: {
          revision: 1,
          aircraft: [sampleAircraft],
          layouts: {}, // Missing layout for air-738-01
        },
        meta: { requestId: "req-1", timestamp: "2026-10-11T12:00:00Z" },
      }),
      getSeatLayoutById: async () => {
        throw new ReferenceApiError({ kind: "http_error", status: 404, message: "Seat layout not found" });
      },
    };

    const repo = new HttpFleetRepository(() => fakeClient as unknown as ReferenceApiClient);

    await assert.rejects(
      async () => await repo.get(),
      (err: unknown) => {
        assert.ok(err instanceof FleetError);
        assert.equal((err as FleetError).reason, "layout_not_found");
        return true;
      }
    );
  });

  it("updates aircraft and returns receipt", async () => {
    let notifications = 0;
    const fakeClient = {
      getFleetSnapshot: async () => ({
        success: true as const,
        data: { revision: 1, aircraft: [sampleAircraft], layouts: { "air-738-01": sampleLayout } },
        meta: { requestId: "req-1", timestamp: "2026-10-11T12:00:00Z" },
      }),
      patchAdminAircraftReceipt: async () => ({
        success: true as const,
        data: {
          aircraft: { ...sampleAircraft, active: false },
          changed: true,
          revision: 2,
        },
        meta: { requestId: "req-2", timestamp: "2026-10-11T12:00:00Z" },
      }),
    };

    const repo = new HttpFleetRepository(() => fakeClient as unknown as ReferenceApiClient);
    repo.subscribe(() => { notifications++; });

    const receipt = await repo.updateAircraftWithReceipt("air-738-01", { active: false });
    assert.equal(receipt.changed, true);
    assert.equal(receipt.aircraft.active, false);
    assert.equal(notifications, 1);
  });

  it("never falls back to localStorage on server mutation failure", async () => {
    const fakeClient = {
      getFleetSnapshot: async () => ({
        success: true as const,
        data: { revision: 1, aircraft: [sampleAircraft], layouts: { "air-738-01": sampleLayout } },
        meta: { requestId: "req-1", timestamp: "2026-10-11T12:00:00Z" },
      }),
      patchAdminAircraftReceipt: async () => {
        throw new ReferenceApiError({ kind: "http_error", status: 500, message: "Internal server error" });
      },
      patchAdminAircraft: async () => {
        throw new ReferenceApiError({ kind: "http_error", status: 500, message: "Internal server error" });
      },
    };

    const repo = new HttpFleetRepository(() => fakeClient as unknown as ReferenceApiClient);

    await assert.rejects(
      async () => await repo.updateAircraft("air-738-01", { active: false }),
      (err: unknown) => {
        assert.ok(err instanceof FleetError);
        assert.equal((err as FleetError).reason, "fleet_unavailable");
        return true;
      }
    );
  });
});

describe("Server Mode Protection & Mock Write-Blocking", () => {
  it("blocks mock booking authority in server mode", async () => {
    const repos = createRepositories({
      blockMockBookingWrites: true,
    });

    await assert.rejects(repos.booking.list(), /Booking mutations are disabled/);
    await assert.rejects(repos.booking.getOccupiedSeats("svc-test"), /Booking mutations are disabled/);

    // Mutations are rejected
    await assert.rejects(
      async () => await repos.booking.cancel("GZA-TEST"),
      /Booking mutations are disabled in server preview mode/
    );

    await assert.rejects(
      async () => await repos.booking.updateSeats("GZA-TEST", { "0": "1A" }),
      /Booking mutations are disabled in server preview mode/
    );

    await assert.rejects(
      async () => await repos.booking.updateContact("GZA-TEST", { email: "test@example.com" }),
      /Booking mutations are disabled in server preview mode/
    );
  });

  it("authorizes only real fleet and identity domains in server mode", () => {
    assert.equal(isDomainAvailableInServerMode("/admin"), true);
    assert.equal(isDomainAvailableInServerMode("/admin/products"), true);
    assert.equal(isDomainAvailableInServerMode("/admin/settings"), true);

    // Unwired domains are rejected
    assert.equal(isDomainAvailableInServerMode("/admin/flights"), false);
    assert.equal(isDomainAvailableInServerMode("/admin/bookings"), false);
    assert.equal(isDomainAvailableInServerMode("/admin/schedules"), false);
    assert.equal(isDomainAvailableInServerMode("/admin/destinations"), false);
    assert.equal(isDomainAvailableInServerMode("/admin/content"), false);
    assert.equal(isDomainAvailableInServerMode(null), false);
  });
});

describe("Reviewed fleet adapter failures", () => {
  it("requires explicit nonproduction configuration rather than inventing it", () => {
    assert.throws(() => createReferenceApiClient({ enabled: true, baseUrl: "https://127.0.0.1:18090/api/v1" }));
    assert.throws(() => createReferenceApiClient({ enabled: true, nonProductionOptIn: true,
      environment: { MODE: "production", PROD: true }, baseUrl: "https://127.0.0.1:18090/api/v1" }));
  });
  it("rejects missing/orphan/duplicate layouts, unknown fields and unsafe revisions", async () => {
    const good = { revision: 1, aircraft: [sampleAircraft], layouts: { [sampleAircraft.id]: sampleLayout } };
    for (const data of [
      { ...good, layouts: {} }, { ...good, aircraft: [sampleAircraft, sampleAircraft] },
      { ...good, layouts: { ...good.layouts, orphan: { ...sampleLayout, aircraftId: "orphan" } } },
      { ...good, revision: Number.MAX_SAFE_INTEGER + 1 }, { ...good, injected: true },
      { ...good, aircraft: [{ ...sampleAircraft, priceMinor: 1 }] },
      { ...good, layouts: { [sampleAircraft.id]: { ...sampleLayout, zones: [{ ...sampleLayout.zones[0], script: "bad" }] } } },
    ]) {
      const client = createReferenceApiClient({ enabled: true, nonProductionOptIn: true,
        environment: { MODE: "test" }, baseUrl: "https://127.0.0.1:18090/api/v1",
        fetch: createMockFetch((_, init) => ({ status: 200, body: { success: true, data,
          meta: { requestId: (init.headers as Record<string,string>)["X-Request-Id"], timestamp: new Date().toISOString() } } })),
      });
      await assert.rejects(client.getFleetSnapshot(), ReferenceApiError);
    }
  });
  it("rejects a mutation response for a different immutable aircraft", async () => {
    const client = createReferenceApiClient({ enabled: true, nonProductionOptIn: true,
      environment: { MODE: "test" }, baseUrl: "https://127.0.0.1:18090/api/v1", csrfTokenProvider: () => "csrf",
      fetch: createMockFetch((_, init) => ({ status: 200, body: { success: true,
        data: { aircraft: { ...sampleAircraft, id: "foreign" }, changed: true, revision: 2 },
        meta: { requestId: (init.headers as Record<string,string>)["X-Request-Id"], timestamp: new Date().toISOString() } } })),
    });
    await assert.rejects(client.patchAdminAircraftReceipt(sampleAircraft.id, { active: false }), ReferenceApiError);
  });
  it("never assembles a snapshot or guesses changed when receipt extensions are absent", async () => {
    let fallback = 0;
    const missing = async () => { throw new ReferenceApiError({ kind: "http_error", status: 404, message: "Unavailable route" }); };
    const client = { getFleetSnapshot: missing, patchAdminAircraftReceipt: missing, putAdminSeatLayoutReceipt: missing,
      getFleetAircraft: async () => { fallback++; }, patchAdminAircraft: async () => { fallback++; },
      putAdminSeatLayout: async () => { fallback++; } } as unknown as ReferenceApiClient;
    const repo = new HttpFleetRepository(client);
    await assert.rejects(repo.get());
    await assert.rejects(repo.updateAircraftWithReceipt(sampleAircraft.id, { active: false }));
    const { aircraftId: _id, ...layout } = sampleLayout;
    await assert.rejects(repo.updateLayoutWithReceipt(sampleAircraft.id, layout));
    assert.equal(fallback, 0);
  });
});
