import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { departuresOn, arrivalsOn, aircraftNameToId, aircraftIdToName } from "../../src/lib/data.ts";
import { getEffectiveFlight, sanitizeFlightOverride } from "../../src/lib/domain/flight.ts";

interface BaselineFlight {
  id: string;
  number: string;
  originCode: string;
  destinationCode: string;
  date: string;
  departTime: string;
  arriveTime: string;
  durationMinutes: number;
  aircraft: string;
  gate: string;
  terminal: string;
  basePrice: number;
  seatsLeft: number;
}

interface BaselineFixture {
  [date: string]: {
    departures: BaselineFlight[];
    arrivals: BaselineFlight[];
  };
}

describe("Flight Identity & Compatibility Regression", () => {
  test("preserves byte-for-byte fidelity with pre-phase baseline flight fixtures", () => {
    const fixturePath = resolve(process.cwd(), "tests/fixtures/baseline-flight-identity-fixtures.json");
    if (!existsSync(fixturePath)) {
      assert.fail(`Fixture missing: ${fixturePath}`);
    }
    const raw = readFileSync(fixturePath, "utf-8");
    const fixtures: BaselineFixture = JSON.parse(raw);

    for (const [date, data] of Object.entries(fixtures)) {
      // Verify departures
      const actualDeps = departuresOn(date);
      assert.equal(actualDeps.length, data.departures.length, `Departure count mismatch on ${date}`);

      for (let i = 0; i < actualDeps.length; i++) {
        const actual = actualDeps[i]!;
        const expected = data.departures[i]!;

        assert.equal(actual.id, expected.id, `ID mismatch on ${date} flight ${i}`);
        assert.equal(actual.number, expected.number, `Number mismatch on ${date} flight ${i}`);
        assert.equal(actual.originCode, expected.originCode, `Origin mismatch on ${date} flight ${i}`);
        assert.equal(actual.destinationCode, expected.destinationCode, `Destination mismatch on ${date} flight ${i}`);
        assert.equal(actual.date, expected.date, `Date mismatch on ${date} flight ${i}`);
        assert.equal(actual.departTime, expected.departTime, `DepartTime mismatch on ${date} flight ${i}`);
        assert.equal(actual.arriveTime, expected.arriveTime, `ArriveTime mismatch on ${date} flight ${i}`);
        assert.equal(actual.durationMinutes, expected.durationMinutes, `Duration mismatch on ${date} flight ${i}`);
        assert.equal(actual.aircraft, expected.aircraft, `Aircraft model mismatch on ${date} flight ${i}`);
        assert.equal(actual.gate, expected.gate, `Gate mismatch on ${date} flight ${i}`);
        assert.equal(actual.terminal, expected.terminal, `Terminal mismatch on ${date} flight ${i}`);
        assert.equal(actual.basePrice, expected.basePrice, `BasePrice mismatch on ${date} flight ${i}`);
        assert.equal(actual.seatsLeft, expected.seatsLeft, `SeatsLeft mismatch on ${date} flight ${i}`);

        // Also assert that aircraftId was deterministically assigned and matches aircraft
        assert.ok(actual.aircraftId, `Missing aircraftId on ${date} flight ${actual.id}`);
        assert.equal(actual.aircraftId, aircraftNameToId(actual.aircraft));
      }

      // Verify arrivals
      const actualArrs = arrivalsOn(date);
      assert.equal(actualArrs.length, data.arrivals.length, `Arrival count mismatch on ${date}`);

      for (let i = 0; i < actualArrs.length; i++) {
        const actual = actualArrs[i]!;
        const expected = data.arrivals[i]!;

        assert.equal(actual.id, expected.id);
        assert.equal(actual.number, expected.number);
        assert.equal(actual.originCode, expected.originCode);
        assert.equal(actual.destinationCode, expected.destinationCode);
        assert.equal(actual.date, expected.date);
        assert.equal(actual.departTime, expected.departTime);
        assert.equal(actual.arriveTime, expected.arriveTime);
        assert.equal(actual.durationMinutes, expected.durationMinutes);
        assert.equal(actual.aircraft, expected.aircraft);
        assert.equal(actual.gate, expected.gate);
        assert.equal(actual.terminal, expected.terminal);
        assert.equal(actual.basePrice, expected.basePrice);
        assert.equal(actual.seatsLeft, expected.seatsLeft);

        assert.ok(actual.aircraftId);
        assert.equal(actual.aircraftId, aircraftNameToId(actual.aircraft));
      }
    }
  });

  describe("Legacy Aircraft Name / ID Mapping", () => {
    test("maps known seeded names and IDs bidirectionally", () => {
      assert.equal(aircraftNameToId("Airbus A320neo"), "a320neo");
      assert.equal(aircraftNameToId("Airbus A321neo"), "a321neo");
      assert.equal(aircraftNameToId("Boeing 737-800"), "b737800");
      assert.equal(aircraftNameToId("Unknown Concorde"), undefined);

      assert.equal(aircraftIdToName("a320neo"), "Airbus A320neo");
      assert.equal(aircraftIdToName("a321neo"), "Airbus A321neo");
      assert.equal(aircraftIdToName("b737800"), "Boeing 737-800");
      assert.equal(aircraftIdToName("unknown-id"), undefined);
    });
  });

  describe("FlightOverride & Effective Flight", () => {
    const baseFlight = departuresOn("2026-10-04")[0]!;

    test("applies new aircraftId override and resolves display name", () => {
      const override = sanitizeFlightOverride({
        aircraftId: "b737800",
      });
      assert.ok(override);
      const effective = getEffectiveFlight(baseFlight, override);
      assert.equal(effective.aircraftId, "b737800");
      assert.equal(effective.aircraft, "Boeing 737-800");
    });

    test("preserves legacy string override and derives aircraftId when known", () => {
      const override = sanitizeFlightOverride({
        aircraft: "Boeing 737-800",
      });
      assert.ok(override);
      const effective = getEffectiveFlight(baseFlight, override);
      assert.equal(effective.aircraft, "Boeing 737-800");
      assert.equal(effective.aircraftId, "b737800");
    });

    test("preserves unknown legacy aircraft string without inventing an ID", () => {
      const override = sanitizeFlightOverride({
        aircraft: "Douglas DC-3 Historic",
      });
      assert.ok(override);
      const effective = getEffectiveFlight(baseFlight, override);
      assert.equal(effective.aircraft, "Douglas DC-3 Historic");
      // Clears base aircraftId; does NOT retain unrelated base ID
      assert.equal(effective.aircraftId, undefined);
    });

    test("operational edits (gate, status, revised, note) succeed independently of aircraft", () => {
      const override = sanitizeFlightOverride({
        gate: "B12",
        status: "Delayed",
        revisedDepart: "09:45",
        note: "Late inbound equipment",
      });
      assert.ok(override);
      const effective = getEffectiveFlight(baseFlight, override);
      assert.equal(effective.gate, "B12");
      assert.equal(effective.status, "Delayed");
      assert.equal(effective.revisedDepart, "09:45");
      assert.equal(effective.note, "Late inbound equipment");
      assert.equal(effective.aircraft, baseFlight.aircraft);
      assert.equal(effective.aircraftId, baseFlight.aircraftId);
    });
  });
});
