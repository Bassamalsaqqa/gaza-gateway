import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { departuresOn, arrivalsOn } from "../../src/lib/data.ts";

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
  aircraftId?: string;
  status: string;
  gate: string;
  terminal: string;
  basePrice: number;
  seatsLeft: number;
}

interface BaselineDateEntry {
  date: string;
  departures: BaselineFlight[];
  arrivals: BaselineFlight[];
}

interface BaselineFixture {
  baseline: string;
  now: string;
  dates: BaselineDateEntry[];
}

describe("Legacy Flight Baseline Freeze & Repository Invariants", () => {
  const fixturePath = resolve(process.cwd(), "tests/fixtures/legacy-flight-baseline.json");

  test("baseline fixture exists and has valid provenance", () => {
    assert.ok(existsSync(fixturePath), `Fixture missing at ${fixturePath}`);
    const raw = readFileSync(fixturePath, "utf-8");
    const fixture: BaselineFixture = JSON.parse(raw);
    assert.equal(fixture.baseline, "f5506a2ae467b2eb5b8182d7d5b009f258115eb4");
    assert.equal(fixture.now, "2026-10-05T09:00:00.000Z");
    assert.equal(fixture.dates.length, 3);
  });

  test("compatibility wrappers retain explicit frozen-generator delegation after C2B", () => {
    const source = readFileSync("src/lib/dated-services/legacy.ts", "utf8");
    assert.match(source, /return departuresOn\(date, now\)/);
    assert.match(source, /return arrivalsOn\(date, now\)/);
    assert.match(source, /return flightById\(id\)/);
  });

  test("raw legacy departuresOn and arrivalsOn match all 48 flights across 3 dates field-by-field", () => {
    const raw = readFileSync(fixturePath, "utf-8");
    const fixture: BaselineFixture = JSON.parse(raw);

    for (const dateEntry of fixture.dates) {
      const { date, departures, arrivals } = dateEntry;

      const actualDeps = departuresOn(date, fixture.now);
      assert.equal(actualDeps.length, departures.length, `Departure count mismatch on ${date}`);

      for (let i = 0; i < actualDeps.length; i++) {
        const actual = actualDeps[i]!;
        const expected = departures[i]!;
        assert.equal(actual.id, expected.id, `ID mismatch on ${date} dep ${i}`);
        assert.equal(actual.number, expected.number, `Number mismatch on ${date} dep ${i}`);
        assert.equal(actual.originCode, expected.originCode, `Origin mismatch on ${date} dep ${i}`);
        assert.equal(actual.destinationCode, expected.destinationCode, `Destination mismatch on ${date} dep ${i}`);
        assert.equal(actual.date, expected.date, `Date mismatch on ${date} dep ${i}`);
        assert.equal(actual.departTime, expected.departTime, `DepartTime mismatch on ${date} dep ${i}`);
        assert.equal(actual.arriveTime, expected.arriveTime, `ArriveTime mismatch on ${date} dep ${i}`);
        assert.equal(actual.durationMinutes, expected.durationMinutes, `Duration mismatch on ${date} dep ${i}`);
        assert.equal(actual.aircraft, expected.aircraft, `Aircraft mismatch on ${date} dep ${i}`);
        assert.equal(actual.aircraftId, expected.aircraftId, `AircraftId mismatch on ${date} dep ${i}`);
        assert.equal(actual.status, expected.status, `Status mismatch on ${date} dep ${i}`);
        assert.equal(actual.gate, expected.gate, `Gate mismatch on ${date} dep ${i}`);
        assert.equal(actual.terminal, expected.terminal, `Terminal mismatch on ${date} dep ${i}`);
        assert.equal(actual.basePrice, expected.basePrice, `BasePrice mismatch on ${date} dep ${i}`);
        assert.equal(actual.seatsLeft, expected.seatsLeft, `SeatsLeft mismatch on ${date} dep ${i}`);
      }

      const actualArrs = arrivalsOn(date, fixture.now);
      assert.equal(actualArrs.length, arrivals.length, `Arrival count mismatch on ${date}`);

      for (let i = 0; i < actualArrs.length; i++) {
        const actual = actualArrs[i]!;
        const expected = arrivals[i]!;
        assert.equal(actual.id, expected.id, `ID mismatch on ${date} arr ${i}`);
        assert.equal(actual.number, expected.number, `Number mismatch on ${date} arr ${i}`);
        assert.equal(actual.originCode, expected.originCode, `Origin mismatch on ${date} arr ${i}`);
        assert.equal(actual.destinationCode, expected.destinationCode, `Destination mismatch on ${date} arr ${i}`);
        assert.equal(actual.date, expected.date, `Date mismatch on ${date} arr ${i}`);
        assert.equal(actual.departTime, expected.departTime, `DepartTime mismatch on ${date} arr ${i}`);
        assert.equal(actual.arriveTime, expected.arriveTime, `ArriveTime mismatch on ${date} arr ${i}`);
        assert.equal(actual.durationMinutes, expected.durationMinutes, `Duration mismatch on ${date} arr ${i}`);
        assert.equal(actual.aircraft, expected.aircraft, `Aircraft mismatch on ${date} arr ${i}`);
        assert.equal(actual.aircraftId, expected.aircraftId, `AircraftId mismatch on ${date} arr ${i}`);
        assert.equal(actual.status, expected.status, `Status mismatch on ${date} arr ${i}`);
        assert.equal(actual.gate, expected.gate, `Gate mismatch on ${date} arr ${i}`);
        assert.equal(actual.terminal, expected.terminal, `Terminal mismatch on ${date} arr ${i}`);
        assert.equal(actual.basePrice, expected.basePrice, `BasePrice mismatch on ${date} arr ${i}`);
        assert.equal(actual.seatsLeft, expected.seatsLeft, `SeatsLeft mismatch on ${date} arr ${i}`);
      }
    }
  });
});
