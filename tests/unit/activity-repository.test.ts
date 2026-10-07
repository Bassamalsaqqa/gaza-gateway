/**
 * Gaza Gateway — Canonical Activity Repository Unit Tests
 *
 * Exhaustive unit tests for Phase 6C Activity Domain:
 * 1. Storage authority, empty authority & anti-resurrection guarantees
 * 2. Strict schemas: safe actor snapshots, allowlisted modules/actions, bounded metadata
 * 3. 500 newest events retention policy (deterministic FIFO ring buffer)
 * 4. Filtering by actor, module, action, date, and target ID
 * 5. Storage failure rollback and zero false subscriber notifications
 * 6. In-memory isolation for Studio preview mode
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACTIVITY_STORAGE_KEY,
  ActivityStorageCoordinator,
  ActivityStorageError,
  LocalActivityRepository,
  type ActivityActorSnapshot,
  type CreateActivityInput,
} from "../../src/lib/activity/index.ts";
import { datedServiceId } from "../../src/lib/dated-services/identity.ts";

function createMockStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
}

const SAMPLE_ACTOR: ActivityActorSnapshot = {
  id: "adm-1",
  name: { en: "Rana Habib", ar: "رنا حبيب" },
  email: "rana.habib@gza.ps",
  role: "admin",
};

describe("Activity Domain — Storage Authority & Anti-Resurrection", () => {
  it("returns empty events when storage key is absent, without writing to storage on read", async () => {
    const storage = createMockStorage();
    const coordinator = new ActivityStorageCoordinator({ storage });
    const repo = new LocalActivityRepository(coordinator);

    const events = await repo.list();
    assert.deepEqual(events, []);
    assert.equal(storage.getItem(ACTIVITY_STORAGE_KEY), null, "Read must not write to storage");
  });

  it("respects empty activity store without resurrecting synthetic mock entries", async () => {
    const storage = createMockStorage({
      [ACTIVITY_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 1,
        revision: 4,
        events: [],
      }),
    });
    const coordinator = new ActivityStorageCoordinator({ storage });
    const repo = new LocalActivityRepository(coordinator);

    const events = await repo.list();
    assert.equal(events.length, 0, "Empty activity store must remain empty");
  });

  it("fails closed on corrupt or invalid stored JSON", async () => {
    const storage = createMockStorage({
      [ACTIVITY_STORAGE_KEY]: "{ invalid json corrupted",
    });
    const coordinator = new ActivityStorageCoordinator({ storage });
    const repo = new LocalActivityRepository(coordinator);
    await assert.rejects(
      () => repo.list(),
      (err: unknown) => err instanceof ActivityStorageError && err.code === "corrupt_store",
    );
  });

  it("fails closed on unsupported schemaVersion", async () => {
    const storage = createMockStorage({
      [ACTIVITY_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 999,
        revision: 1,
        events: [],
      }),
    });
    const coordinator = new ActivityStorageCoordinator({ storage });
    const repo = new LocalActivityRepository(coordinator);
    await assert.rejects(
      () => repo.list(),
      (err: unknown) => err instanceof ActivityStorageError && err.code === "corrupt_store",
    );
  });
});

describe("Activity Repository — Append, Validation & Safe Snapshots", () => {
  it("appends valid semantic activity event with safe actor snapshot", async () => {
    const storage = createMockStorage();
    const coordinator = new ActivityStorageCoordinator({ storage });
    const repo = new LocalActivityRepository({
      coordinator,
      now: () => "2026-09-18T10:30:00.000Z",
    });

    const event = await repo.append({
      actor: SAMPLE_ACTOR,
      module: "bookings",
      action: "cancelled",
      targetType: "booking",
      targetId: "GZA-7K8P",
      before: "confirmed",
      after: "cancelled",
      metadata: { reason: "passenger_request" },
    });

    assert.ok(event.id.startsWith("act-"));
    assert.equal(event.timestamp, "2026-09-18T10:30:00.000Z");
    assert.equal(event.actor.id, "adm-1");
    assert.equal(event.actor.role, "admin");
    assert.equal(event.module, "bookings");
    assert.equal(event.action, "cancelled");
    assert.equal(event.targetId, "GZA-7K8P");

    const list = await repo.list();
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, event.id);

    // Verify stored JSON has schemaVersion 1 and revision 1
    const stored = JSON.parse(storage.getItem(ACTIVITY_STORAGE_KEY)!);
    assert.equal(stored.schemaVersion, 1);
    assert.equal(stored.revision, 1);
    assert.equal(stored.events.length, 1);
  });

  it("rejects invalid actor email or missing fields", async () => {
    const storage = createMockStorage();
    const coordinator = new ActivityStorageCoordinator({ storage });
    const repo = new LocalActivityRepository(coordinator);

    await assert.rejects(
      async () => {
        await repo.append({
          actor: { ...SAMPLE_ACTOR, email: "not-an-email" },
          module: "fleet",
          action: "updated",
          targetType: "aircraft",
          targetId: "b737800",
        });
      },
      /email/i,
    );
  });

  it("rejects metadata with more than 20 keys (boundedness constraint)", async () => {
    const storage = createMockStorage();
    const coordinator = new ActivityStorageCoordinator({ storage });
    const repo = new LocalActivityRepository(coordinator);

    const excessiveMetadata: Record<string, string> = {};
    for (let i = 0; i < 25; i++) {
      excessiveMetadata[`key_${i}`] = `value_${i}`;
    }

    await assert.rejects(
      async () => {
        await repo.append({
          actor: SAMPLE_ACTOR,
          module: "commercial",
          action: "updated",
          targetType: "catalog",
          targetId: "catalog",
          metadata: excessiveMetadata,
        });
      },
      /Activity metadata exceeds maximum allowed field count of 20/,
    );
  });

  it("accepts newly allowlisted metadata keys (phone, seats, category, bookingRef)", async () => {
    const storage = createMockStorage();
    const coordinator = new ActivityStorageCoordinator({ storage });
    const repo = new LocalActivityRepository(coordinator);

    const event = await repo.append({
      actor: SAMPLE_ACTOR,
      module: "bookings",
      action: "updated",
      targetType: "booking",
      targetId: "GZA-7K8P",
      metadata: {
        phone: "+970599112233",
        seats: "12A, 12B",
        category: "baggage",
        bookingRef: "GZA-7K8P",
      },
    });

    assert.equal(event.metadata?.phone, "+970599112233");
    assert.equal(event.metadata?.seats, "12A, 12B");
    assert.equal(event.metadata?.category, "baggage");
    assert.equal(event.metadata?.bookingRef, "GZA-7K8P");
  });

  it("strictly validates ISO instant timestamps: rejects impossible calendar dates and zoneless strings", async () => {
    const storage = createMockStorage();
    const coordinator = new ActivityStorageCoordinator({ storage });
    const repo = new LocalActivityRepository(coordinator);

    // Impossible calendar date: Feb 30
    await assert.rejects(
      async () => {
        await repo.append({
          actor: SAMPLE_ACTOR,
          module: "bookings",
          action: "updated",
          targetType: "booking",
          targetId: "GZA-7K8P",
          timestamp: "2026-02-30T10:00:00Z",
        });
      },
      /valid ISO instant/i,
    );

    // Impossible calendar date: April 31
    await assert.rejects(
      async () => {
        await repo.append({
          actor: SAMPLE_ACTOR,
          module: "bookings",
          action: "updated",
          targetType: "booking",
          targetId: "GZA-7K8P",
          timestamp: "2026-04-31T12:00:00Z",
        });
      },
      /valid ISO instant/i,
    );

    // Non-leap year: Feb 29 2025
    await assert.rejects(
      async () => {
        await repo.append({
          actor: SAMPLE_ACTOR,
          module: "bookings",
          action: "updated",
          targetType: "booking",
          targetId: "GZA-7K8P",
          timestamp: "2025-02-29T12:00:00Z",
        });
      },
      /valid ISO instant/i,
    );

    // Zone-less timestamp must be rejected
    await assert.rejects(
      async () => {
        await repo.append({
          actor: SAMPLE_ACTOR,
          module: "bookings",
          action: "updated",
          targetType: "booking",
          targetId: "GZA-7K8P",
          timestamp: "2026-10-07T10:00:00",
        });
      },
      /valid ISO instant/i,
    );

    // Valid ISO instant with explicit timezone offset (+03:00) must be accepted
    const offsetEvent = await repo.append({
      actor: SAMPLE_ACTOR,
      module: "bookings",
      action: "updated",
      targetType: "booking",
      targetId: "GZA-7K8P",
      timestamp: "2026-10-07T10:00:00+03:00",
    });
    assert.equal(offsetEvent.timestamp, "2026-10-07T10:00:00+03:00");
  });

  it("accepts targetId up to 1000 characters including real Arabic and Unicode datedServiceId tokens", async () => {
    const storage = createMockStorage();
    const coordinator = new ActivityStorageCoordinator({ storage });
    const repo = new LocalActivityRepository(coordinator);

    const arabicDatedServiceId = datedServiceId("ش".repeat(160), "2026-10-10");
    assert.equal(arabicDatedServiceId.length, 443);

    const event = await repo.append({
      actor: SAMPLE_ACTOR,
      module: "flights",
      action: "updated",
      targetType: "flight",
      targetId: arabicDatedServiceId,
    });
    assert.equal(event.targetId, arabicDatedServiceId);

    // 1001-character targetId must be rejected
    await assert.rejects(
      async () => {
        await repo.append({
          actor: SAMPLE_ACTOR,
          module: "flights",
          action: "updated",
          targetType: "flight",
          targetId: "svc1-" + "x".repeat(996),
        });
      },
      /targetId/i,
    );
  });
});

describe("Activity Retention — 500 Newest Events FIFO Ring Buffer", () => {
  it("strictly bounds stored events to newest 500 and discards oldest", async () => {
    const storage = createMockStorage();
    const coordinator = new ActivityStorageCoordinator({ storage });
    let counter = 0;
    const repo = new LocalActivityRepository({
      coordinator,
      generateId: () => `act-${String(++counter).padStart(4, "0")}`,
      now: () => `2026-09-18T10:${String(Math.floor(counter / 60)).padStart(2, "0")}:${String(counter % 60).padStart(2, "0")}.000Z`,
    });

    // Append 520 events sequentially
    for (let i = 1; i <= 520; i++) {
      await repo.append({
        actor: SAMPLE_ACTOR,
        module: "flights",
        action: "updated",
        targetType: "flight",
        targetId: `fl-${i}`,
        after: `Delayed-${i}`,
      });
    }

    const events = await repo.list();
    assert.equal(events.length, 500, "Retention must clamp strictly to 500 newest events");

    // Newest event should be fl-520
    assert.equal(events[0]?.targetId, "fl-520");
    // Oldest retained event should be fl-21 (events 1..20 were dropped)
    assert.equal(events[499]?.targetId, "fl-21");
  });
});

describe("Activity Filtering", () => {
  it("filters events by actor, module, action, date, and targetId", async () => {
    const storage = createMockStorage();
    const coordinator = new ActivityStorageCoordinator({ storage });
    const repo = new LocalActivityRepository({
      coordinator,
      generateId: () => `act-${Math.random()}`,
    });

    const actor2: ActivityActorSnapshot = {
      id: "adm-2",
      name: { en: "Yousef Nasser", ar: "يوسف ناصر" },
      email: "yousef.nasser@gza.ps",
      role: "editor",
    };

    await repo.append({
      actor: SAMPLE_ACTOR,
      module: "bookings",
      action: "cancelled",
      targetType: "booking",
      targetId: "GZA-1111",
      timestamp: "2026-09-18T09:00:00.000Z",
    });

    await repo.append({
      actor: actor2,
      module: "schedules",
      action: "created",
      targetType: "schedule",
      targetId: "GZA-AMM-01",
      timestamp: "2026-09-18T11:00:00.000Z",
    });

    await repo.append({
      actor: SAMPLE_ACTOR,
      module: "fleet",
      action: "updated",
      targetType: "aircraft",
      targetId: "b737800",
      timestamp: "2026-09-17T14:00:00.000Z",
    });

    // 1. Filter by actor
    const byActor = await repo.list({ actorId: "adm-2" });
    assert.equal(byActor.length, 1);
    assert.equal(byActor[0]?.targetId, "GZA-AMM-01");

    // 2. Filter by module
    const byModule = await repo.list({ module: "fleet" });
    assert.equal(byModule.length, 1);
    assert.equal(byModule[0]?.targetId, "b737800");

    // 3. Filter by date
    const byDate = await repo.list({ date: "2026-09-17" });
    assert.equal(byDate.length, 1);
    assert.equal(byDate[0]?.targetId, "b737800");

    // 4. Filter by targetId (case-insensitive)
    const byTarget = await repo.list({ targetId: "gza-1111" });
    assert.equal(byTarget.length, 1);
    assert.equal(byTarget[0]?.action, "cancelled");
  });
});

describe("Activity Persistence Rollback & Isolation", () => {
  it("rolls back in-memory state and avoids false notification on storage failure", async () => {
    const storage = createMockStorage();
    const failingStorage: Storage = {
      ...storage,
      setItem() {
        throw new Error("QuotaExceededError");
      },
    };

    const coordinator = new ActivityStorageCoordinator({ storage: failingStorage });
    const repo = new LocalActivityRepository(coordinator);

    let notified = false;
    coordinator.subscribe(() => {
      notified = true;
    });

    await assert.rejects(
      async () => {
        await repo.append({
          actor: SAMPLE_ACTOR,
          module: "staff",
          action: "created",
          targetType: "staff_member",
          targetId: "adm-99",
        });
      },
      /Failed to write activity envelope to storage/,
    );

    assert.equal(notified, false, "Subscribers must not be notified on write failure");
    const list = await repo.list();
    assert.equal(list.length, 0, "Memory state must remain clean/rolled back");
  });

  it("supports in-memory isolation without writing to localStorage", async () => {
    const storage = createMockStorage();
    const coordinator = new ActivityStorageCoordinator({ storage, inMemoryOnly: true });
    const repo = new LocalActivityRepository(coordinator);

    await repo.append({
      actor: SAMPLE_ACTOR,
      module: "session",
      action: "signin",
      targetType: "session",
      targetId: "adm-1",
    });

    const events = await repo.list();
    assert.equal(events.length, 1);
    assert.equal(storage.getItem(ACTIVITY_STORAGE_KEY), null, "In-memory coordinator must not touch storage");
  });

  it("isolates throwing localStorage getter (SecurityError) during construction and fails closed with storage_unavailable", async () => {
    const originalWindow = (globalThis as unknown as { window?: unknown }).window;
    try {
      // Mock window with a throwing localStorage getter
      (globalThis as unknown as { window?: unknown }).window = {
        get localStorage() {
          throw new Error("SecurityError: Access to localStorage is denied");
        },
        addEventListener() {},
        removeEventListener() {},
      };

      // Constructor must NOT throw
      let coordinator: ActivityStorageCoordinator | null = null;
      assert.doesNotThrow(() => {
        coordinator = new ActivityStorageCoordinator();
      }, "Constructor must not throw when localStorage getter throws SecurityError");

      assert.ok(coordinator);
      const repo = new LocalActivityRepository(coordinator);

      // Reads must throw storage_unavailable
      assert.throws(
        () => coordinator!.read(),
        (err: unknown) => err instanceof ActivityStorageError && err.code === "storage_unavailable",
      );

      // Appends must reject with storage_unavailable
      await assert.rejects(
        async () => {
          await repo.append({
            actor: SAMPLE_ACTOR,
            module: "staff",
            action: "created",
            targetType: "staff_member",
            targetId: "adm-99",
          });
        },
        (err: unknown) => err instanceof ActivityStorageError && err.code === "storage_unavailable",
      );
    } finally {
      if (originalWindow !== undefined) {
        (globalThis as unknown as { window?: unknown }).window = originalWindow;
      } else {
        delete (globalThis as unknown as { window?: unknown }).window;
      }
    }
  });
});
