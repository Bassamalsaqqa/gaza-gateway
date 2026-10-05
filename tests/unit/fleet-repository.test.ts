import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  LocalFleetRepository,
  FleetStorageCoordinator,
  FLEET_STORAGE_KEY,
  FleetError,
  seedFleetAircraft,
  seedFleetLayouts,
  seedFleetEnvelope,
  layoutCapacity,
  layoutCabins,
  layoutSupportsCabin,
  layoutZone,
  layoutSeatCodes,
  seatExists,
  seatStructurallyAvailable,
  seatIsExtraLegroom,
  seatPhysicalCategory,
  seatPosition,
  parseSeatCode,
  fleetStorageSchema,
  aircraftLayoutSchema,
  aircraftSchema,
  defaultNewAircraftLayout,
} from "../../src/lib/fleet/index.ts";
import { StorageCommitError } from "../../src/lib/repositories/storage.ts";

function fleetStorageRig(raw?: string) {
  const map = new Map<string, string>();
  if (raw !== undefined) map.set(FLEET_STORAGE_KEY, raw);
  let fail = false;
  let writes = 0;
  const storage: Storage = {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      if (fail) throw new Error("quota");
      writes++;
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
  const coordinator = new FleetStorageCoordinator({ storage });
  const repo = new LocalFleetRepository(coordinator);
  let events = 0;
  repo.subscribe(() => events++);
  return {
    storage,
    repo,
    coordinator,
    map,
    counts: () => ({ writes, events }),
    fail: () => {
      fail = true;
    },
  };
}

describe("Fleet Domain & Pure Helpers", () => {
  const seedLayouts = seedFleetLayouts();
  const a320 = seedLayouts["a320neo"]!;
  const a321 = seedLayouts["a321neo"]!;
  const b737 = seedLayouts["b737800"]!;

  describe("Seed Invariants", () => {
    test("preserves exact A320neo layout, cabins, legroom and capacity of 168", () => {
      assert.equal(a320.rows, 28);
      assert.deepEqual(a320.letters, ["A", "B", "C", "D", "E", "F"]);
      assert.equal(a320.aisleAfter, 3);
      assert.deepEqual(a320.unavailable, []);
      assert.equal(layoutCapacity(a320), 168);
      assert.deepEqual(layoutCabins(a320), ["business", "premium", "economy"]);
      assert.equal(layoutSupportsCabin(a320, "business"), true);
      assert.equal(layoutSupportsCabin(a320, "premium"), true);
      assert.equal(layoutSupportsCabin(a320, "economy"), true);
      assert.deepEqual(a320.extraLegroomRows, [5, 11, 12]);
    });

    test("preserves exact A321neo layout with unavailable 33B/33E and capacity of 196", () => {
      assert.equal(a321.rows, 33);
      assert.deepEqual(a321.unavailable, ["33B", "33E"]);
      assert.equal(layoutCapacity(a321), 196); // 33 * 6 - 2 = 196
      assert.deepEqual(layoutCabins(a321), ["business", "premium", "economy"]);
      assert.equal(seatExists(a321, "33B"), true);
      assert.equal(seatStructurallyAvailable(a321, "33B"), false);
      assert.equal(seatStructurallyAvailable(a321, "33E"), false);
      assert.equal(seatStructurallyAvailable(a321, "33A"), true);
    });

    test("preserves exact B737-800 layout with NO Premium cabin, capacity 162, and inactive status", () => {
      assert.equal(b737.rows, 27);
      assert.deepEqual(b737.unavailable, []);
      assert.equal(layoutCapacity(b737), 162); // 27 * 6 = 162
      assert.deepEqual(layoutCabins(b737), ["business", "economy"]);
      assert.equal(layoutSupportsCabin(b737, "business"), true);
      assert.equal(layoutSupportsCabin(b737, "premium"), false);
      assert.equal(layoutSupportsCabin(b737, "economy"), true);
      assert.deepEqual(b737.extraLegroomRows, [1, 11, 12]);

      const seedPlanes = seedFleetAircraft();
      const b737Plane = seedPlanes.find((p) => p.id === "b737800");
      assert.equal(b737Plane?.active, false); // MUST BE FALSE per requirements
    });
  });

  describe("parseSeatCode", () => {
    test("parses valid seat codes correctly", () => {
      assert.deepEqual(parseSeatCode("1A"), { row: 1, letter: "A" });
      assert.deepEqual(parseSeatCode("12F"), { row: 12, letter: "F" });
      assert.deepEqual(parseSeatCode("33B"), { row: 33, letter: "B" });
    });

    test("rejects invalid seat code strings", () => {
      assert.equal(parseSeatCode(""), null);
      assert.equal(parseSeatCode("0A"), null);
      assert.equal(parseSeatCode("A1"), null);
      assert.equal(parseSeatCode("12"), null);
      assert.equal(parseSeatCode("ABC"), null);
      assert.equal(parseSeatCode("-5B"), null);
      assert.equal(parseSeatCode(" 33B "), null);
      assert.equal(parseSeatCode("12f"), null);
      assert.equal(parseSeatCode("61A"), null);
    });
  });

  describe("Pure layout helpers", () => {
    test("generates correct layoutSeatCodes count", () => {
      const codes = layoutSeatCodes(a320);
      assert.equal(codes.length, 168);
      assert.equal(codes[0], "1A");
      assert.equal(codes[codes.length - 1], "28F");
    });

    test("resolves cabin zone and row cabin correctly", () => {
      assert.equal(layoutZone(a320, 1)?.id, "business");
      assert.equal(layoutZone(a320, 4)?.id, "business");
      assert.equal(layoutZone(a320, 5)?.id, "premium");
      assert.equal(layoutZone(a320, 10)?.id, "premium");
      assert.equal(layoutZone(a320, 11)?.id, "economy");
      assert.equal(layoutZone(a320, 28)?.id, "economy");
      assert.equal(layoutZone(a320, 29), undefined);
    });

    test("checks seatExists and seatIsExtraLegroom correctly", () => {
      assert.equal(seatExists(a320, "1A"), true);
      assert.equal(seatExists(a320, "28F"), true);
      assert.equal(seatExists(a320, "29A"), false);
      assert.equal(seatExists(a320, "1G"), false);

      assert.equal(seatIsExtraLegroom(a320, "5A"), true);
      assert.equal(seatIsExtraLegroom(a320, "11C"), true);
      assert.equal(seatIsExtraLegroom(a320, "12D"), true);
      assert.equal(seatIsExtraLegroom(a320, "1A"), false);
      assert.equal(seatIsExtraLegroom(a320, "13A"), false);

      assert.equal(seatPhysicalCategory(a320, "5A"), "extraLegroom");
      assert.equal(seatPhysicalCategory(a320, "1A"), "standard");
      assert.equal(seatPhysicalCategory(a320, "99Z"), null);
    });

    test("resolves seatPosition window / aisle / middle correctly", () => {
      assert.equal(seatPosition(a320, "A"), "window");
      assert.equal(seatPosition(a320, "B"), "middle");
      assert.equal(seatPosition(a320, "C"), "aisle");
      assert.equal(seatPosition(a320, "D"), "aisle");
      assert.equal(seatPosition(a320, "E"), "middle");
      assert.equal(seatPosition(a320, "F"), "window");
    });
  });
});

describe("Fleet Zod Schema Validation", () => {
  test("normalizes valid cabin zones into ascending physical row order", () => {
    const seed = seedFleetEnvelope();
    const layout = seed.layouts.a320neo!;
    const parsed = aircraftLayoutSchema.parse({ ...layout, zones: [...layout.zones].reverse() });
    assert.deepEqual(parsed.zones, layout.zones);
  });
  test("accepts valid seed envelope", () => {
    const seed = seedFleetEnvelope();
    const result = fleetStorageSchema.safeParse(seed);
    assert.equal(result.success, true);
  });

  describe("Aircraft schema", () => {
    test("validates registration pattern", () => {
      assert.equal(aircraftSchema.safeParse({ id: "plane1", model: "Boeing 737", registration: "PS-GZA", active: true }).success, true);
      assert.equal(aircraftSchema.safeParse({ id: "plane1", model: "Boeing 737", registration: "invalid_reg", active: true }).success, false);
    });

    test("rejects blank or oversized model", () => {
      assert.equal(aircraftSchema.safeParse({ id: "plane1", model: "", registration: "PS-GZA", active: true }).success, false);
      assert.equal(aircraftSchema.safeParse({ id: "plane1", model: "x".repeat(121), registration: "PS-GZA", active: true }).success, false);
    });
  });

  describe("Layout schema rejections", () => {
    const validLayout = seedFleetLayouts()["a320neo"]!;

    test("rejects rows < 1 or rows > 60", () => {
      assert.equal(aircraftLayoutSchema.safeParse({ ...validLayout, rows: 0 }).success, false);
      assert.equal(aircraftLayoutSchema.safeParse({ ...validLayout, rows: 61 }).success, false);
    });

    test("rejects aisleAfter >= letters.length or < 1", () => {
      assert.equal(aircraftLayoutSchema.safeParse({ ...validLayout, aisleAfter: 0 }).success, false);
      assert.equal(aircraftLayoutSchema.safeParse({ ...validLayout, aisleAfter: 6 }).success, false);
      assert.equal(aircraftLayoutSchema.safeParse({ ...validLayout, aisleAfter: 7 }).success, false);
    });

    test("rejects duplicate letters or non-A-Z letters", () => {
      assert.equal(aircraftLayoutSchema.safeParse({ ...validLayout, letters: ["A", "B", "A"] }).success, false);
      assert.equal(aircraftLayoutSchema.safeParse({ ...validLayout, letters: ["1", "B"] }).success, false);
    });

    test("rejects duplicate cabin zones", () => {
      assert.equal(aircraftLayoutSchema.safeParse({
        ...validLayout,
        zones: [
          { id: "business", firstRow: 1, lastRow: 4 },
          { id: "business", firstRow: 5, lastRow: 28 },
        ],
      }).success, false);
    });

    test("rejects cabin zone gap or overlap", () => {
      // Gap: zone 1 ends at 4, zone 2 starts at 6 (missing 5)
      assert.equal(aircraftLayoutSchema.safeParse({
        ...validLayout,
        zones: [
          { id: "business", firstRow: 1, lastRow: 4 },
          { id: "economy", firstRow: 6, lastRow: 28 },
        ],
      }).success, false);

      // Overlap: zone 1 ends at 5, zone 2 starts at 5
      assert.equal(aircraftLayoutSchema.safeParse({
        ...validLayout,
        zones: [
          { id: "business", firstRow: 1, lastRow: 5 },
          { id: "economy", firstRow: 5, lastRow: 28 },
        ],
      }).success, false);
    });

    test("rejects cabin zones not starting at 1 or not ending at rows", () => {
      // Starts at 2
      assert.equal(aircraftLayoutSchema.safeParse({
        ...validLayout,
        zones: [{ id: "economy", firstRow: 2, lastRow: 28 }],
      }).success, false);

      // Ends at 27 when rows = 28
      assert.equal(aircraftLayoutSchema.safeParse({
        ...validLayout,
        zones: [{ id: "economy", firstRow: 1, lastRow: 27 }],
      }).success, false);
    });

    test("rejects extra legroom rows outside 1..rows or duplicate", () => {
      assert.equal(aircraftLayoutSchema.safeParse({ ...validLayout, extraLegroomRows: [0] }).success, false);
      assert.equal(aircraftLayoutSchema.safeParse({ ...validLayout, extraLegroomRows: [29] }).success, false);
      assert.equal(aircraftLayoutSchema.safeParse({ ...validLayout, extraLegroomRows: [5, 5] }).success, false);
    });

    test("rejects unavailable seats that do not exist or are malformed", () => {
      assert.equal(aircraftLayoutSchema.safeParse({ ...validLayout, unavailable: ["INVALID"] }).success, false);
      assert.equal(aircraftLayoutSchema.safeParse({ ...validLayout, unavailable: ["29A"] }).success, false);
      assert.equal(aircraftLayoutSchema.safeParse({ ...validLayout, unavailable: ["1G"] }).success, false);
      assert.equal(aircraftLayoutSchema.safeParse({ ...validLayout, unavailable: ["1A", "1A"] }).success, false);
    });
  });

  describe("Aggregate uniqueness & layout matching", () => {
    test("rejects duplicate aircraft IDs in envelope", () => {
      const seed = seedFleetEnvelope();
      seed.aircraft.push({ ...seed.aircraft[0]!, registration: "PS-NEW" });
      assert.equal(fleetStorageSchema.safeParse(seed).success, false);
    });

    test("rejects duplicate registration case-insensitively", () => {
      const seed = seedFleetEnvelope();
      seed.aircraft[1]!.registration = "ps-gza"; // same as aircraft[0]
      assert.equal(fleetStorageSchema.safeParse(seed).success, false);
    });

    test("rejects missing layout for an aircraft", () => {
      const seed = seedFleetEnvelope();
      delete seed.layouts["a320neo"];
      assert.equal(fleetStorageSchema.safeParse(seed).success, false);
    });

    test("rejects orphaned layout without aircraft", () => {
      const seed = seedFleetEnvelope();
      seed.layouts["orphaned"] = defaultNewAircraftLayout("orphaned");
      assert.equal(fleetStorageSchema.safeParse(seed).success, false);
    });
  });
});

describe("LocalFleetRepository & FleetStorageCoordinator", () => {
  test("returns deterministic seed envelope when storage is empty without writing to storage", async () => {
    const rig = fleetStorageRig();
    const snapshot = await rig.repo.get();
    assert.equal(snapshot.revision, 0);
    assert.equal(snapshot.aircraft.length, 3);
    assert.equal(Object.keys(snapshot.layouts).length, 3);
    assert.equal(rig.map.get(FLEET_STORAGE_KEY), undefined);
  });

  test("fails closed on corrupt stored data (never overwrites with seeds)", async () => {
    const rig = fleetStorageRig("{ corrupt JSON !!!");
    await assert.rejects(rig.repo.get(), (err: unknown) => err instanceof FleetError && err.reason === "fleet_unavailable");
    assert.equal(rig.map.get(FLEET_STORAGE_KEY), "{ corrupt JSON !!!");
  });

  test("fails closed on invalid schema data in storage", async () => {
    const rig = fleetStorageRig(
      JSON.stringify({
        schemaVersion: 1,
        revision: 0,
        aircraft: [],
        layouts: { extra: {} },
      }),
    );
    await assert.rejects(rig.repo.get(), (err: unknown) => err instanceof FleetError && err.reason === "fleet_unavailable");
  });

  test("creates a new aircraft with atomic layout and default inactive status", async () => {
    const rig = fleetStorageRig();
    const created = await rig.repo.createAircraft({
      aircraft: {
        id: "a330-300",
        model: "Airbus A330-300",
        registration: "PS-GZD",
      },
    });

    assert.equal(created.aircraft.id, "a330-300");
    assert.equal(created.aircraft.registration, "PS-GZD");
    assert.equal(created.aircraft.active, false); // default inactive
    assert.equal(created.layout.aircraftId, "a330-300");
    assert.equal(created.layout.rows, 28);
    assert.equal(created.layout.zones[0]?.id, "economy");

    const updated = await rig.repo.get();
    assert.equal(updated.revision, 1);
    assert.equal(updated.aircraft.some((a) => a.id === "a330-300"), true);
    assert.ok(updated.layouts["a330-300"]);
    assert.ok(rig.map.get(FLEET_STORAGE_KEY));
  });

  test("rejects creating aircraft with duplicate registration", async () => {
    const rig = fleetStorageRig();
    await assert.rejects(
      rig.repo.createAircraft({
        aircraft: {
          id: "another-plane",
          model: "Another A320",
          registration: "ps-gza", // duplicate of seed a320neo (case-insensitive)
        },
      }),
      (err: unknown) => err instanceof FleetError && err.reason === "duplicate_registration",
    );
  });

  test("rejects modifying immutable aircraft ID on update", async () => {
    const rig = fleetStorageRig();
    // @ts-expect-error testing runtime immutable check
    await assert.rejects(rig.repo.updateAircraft("a320neo", { id: "new-id" }), (err: unknown) => err instanceof FleetError && err.reason === "immutable_field");
  });

  test("updates aircraft model and active status", async () => {
    const rig = fleetStorageRig();
    const updatedPlane = await rig.repo.updateAircraft("b737800", { active: true });
    assert.equal(updatedPlane.active, true);

    const snapshot = await rig.repo.get();
    assert.equal(snapshot.revision, 1);
    assert.equal(snapshot.aircraft.find((a) => a.id === "b737800")?.active, true);
  });

  test("updates layout with validation", async () => {
    const rig = fleetStorageRig();
    const currentLayout = (await rig.repo.getLayoutByAircraftId("a320neo"))!;
    const updatedLayout = await rig.repo.updateLayout("a320neo", {
      ...currentLayout,
      extraLegroomRows: [1, 5, 11, 12],
    });

    assert.deepEqual(updatedLayout.extraLegroomRows, [1, 5, 11, 12]);
    const snapshot = await rig.repo.get();
    assert.deepEqual(snapshot.layouts["a320neo"]?.extraLegroomRows, [1, 5, 11, 12]);
  });

  test("skips write and revision bump when update is a real no-op", async () => {
    const rig = fleetStorageRig();
    await rig.repo.updateAircraft("a320neo", { model: "Airbus A320neo" }); // identical to seed
    const snapshot = await rig.repo.get();
    assert.equal(snapshot.revision, 0);
    assert.equal(rig.map.get(FLEET_STORAGE_KEY), undefined);
  });

  test("returns detached deep clones so caller mutation does not corrupt repository", async () => {
    const rig = fleetStorageRig();
    const snapshot = await rig.repo.get();
    const plane = snapshot.aircraft.find((a) => a.id === "a320neo")!;
    plane.model = "HACKED_MODEL";
    snapshot.layouts["a320neo"]!.rows = 999;

    const freshSnapshot = await rig.repo.get();
    assert.equal(freshSnapshot.aircraft.find((a) => a.id === "a320neo")?.model, "Airbus A320neo");
    assert.equal(freshSnapshot.layouts["a320neo"]?.rows, 28);
  });

  test("rolls back and does not notify listeners if storage write fails", async () => {
    const rig = fleetStorageRig();
    rig.fail();

    await assert.rejects(
      rig.repo.updateAircraft("a320neo", { model: "Airbus A320neo Modified" }),
      (err: unknown) => err instanceof StorageCommitError,
    );

    assert.equal(rig.counts().events, 0);
    const freshSnapshot = await rig.repo.get();
    assert.equal(freshSnapshot.aircraft.find((a) => a.id === "a320neo")?.model, "Airbus A320neo");
  });

  test("operates in-memory only when inMemoryOnly is specified", async () => {
    const coordinator = new FleetStorageCoordinator({ inMemoryOnly: true });
    const repo = new LocalFleetRepository(coordinator);

    await repo.updateAircraft("a320neo", { model: "In-Memory Modified" });
    const snapshot = await repo.get();
    assert.equal(snapshot.revision, 1);
    assert.equal(snapshot.aircraft.find((a) => a.id === "a320neo")?.model, "In-Memory Modified");
  });
});
