import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  datedServiceId,
  parseDatedServiceId,
  isDatedServiceId,
  isValidISODate,
  getUTCCalendarWeekday,
} from "../../src/lib/dated-services/identity.ts";
import {
  materializeScheduleOnDate as projectOne,
  materializeSchedulesOnDate as projectMany,
} from "../../src/lib/dated-services/materializer.ts";
import { DatedServiceMaterializationError } from "../../src/lib/dated-services/types.ts";
import {
  legacyDeparturesOn,
  legacyArrivalsOn,
  legacyFlightById,
  legacySearchFlights,
} from "../../src/lib/dated-services/legacy.ts";
import { departuresOn, arrivalsOn, flightById, searchFlights } from "../../src/lib/data.ts";
import type { Schedule } from "../../src/lib/schedules/types.ts";
import type { NetworkDestination } from "../../src/lib/network/types.ts";

function createMockSchedule(overrides?: Partial<Schedule>): Schedule {
  return {
    id: "sch-AMM-out",
    number: "PS 204",
    direction: "out",
    destination: "AMM",
    days: [2], // Tuesday
    departTime: "10:00",
    arriveTime: "11:00",
    aircraft: "Boeing 737-800",
    aircraftId: "b737800",
    from: "2026-01-01",
    until: "2026-12-31",
    active: true,
    exceptions: [],
    ...overrides,
  };
}

function createMockNetwork(overrides?: Partial<NetworkDestination>): NetworkDestination {
  return {
    code: "AMM",
    city: { en: "Amman", ar: "عمّان" },
    country: { en: "Jordan", ar: "الأردن" },
    airportName: { en: "Queen Alia International Airport", ar: "\u0645\u0637\u0627\u0631" },
    timezone: "Asia/Amman",
    blockMinutes: 60,
    active: true,
    ...overrides,
  };
}

function materializeScheduleOnDate(
  input: Omit<Parameters<typeof projectOne>[0], "basePrice"> & { basePrice?: number },
) {
  return projectOne({ basePrice: 140, now: "2026-10-05T09:00:00Z", ...input });
}
function materializeSchedulesOnDate(input: Parameters<typeof projectMany>[0]) {
  return projectMany({ defaultBasePrice: 140, now: "2026-10-05T09:00:00Z", ...input });
}

describe("Dated-Service Identity Codec", () => {
  test("determinism: same scheduleId and date produces identical service ID", () => {
    const id1 = datedServiceId("sch-AMM-out", "2026-10-06");
    const id2 = datedServiceId("sch-AMM-out", "2026-10-06");
    assert.equal(id1, id2);
    assert.match(id1, /^svc1-[A-Za-z0-9_-]+-2026-10-06$/);
  });

  test("different schedules or dates produce different IDs", () => {
    const id1 = datedServiceId("sch-AMM-out", "2026-10-06");
    const id2 = datedServiceId("sch-AMM-in", "2026-10-06");
    const id3 = datedServiceId("sch-AMM-out", "2026-10-07");
    assert.notEqual(id1, id2);
    assert.notEqual(id1, id3);
  });

  test("reversibility: exact round-trip for various schedule ID formats", () => {
    const testCases = [
      "sch-AMM-out",
      "sch-CAI-in",
      "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "sch_CAI.123-out+v1",
      "sch AMM out with spaces",
      "sch-قدس-01",
      "sch-" + "x".repeat(156), // 160-char maximum length
    ];

    for (const scheduleId of testCases) {
      const date = "2026-10-06";
      const svcId = datedServiceId(scheduleId, date);
      assert.ok(isDatedServiceId(svcId), `Expected valid ID for ${scheduleId}`);

      const parsed = parseDatedServiceId(svcId);
      assert.ok(parsed !== null, `Failed to parse ${svcId}`);
      assert.equal(parsed.scheduleId, scheduleId, `Mismatch for ${scheduleId}`);
      assert.equal(parsed.date, date);
    }
  });

  test("URL safety: datedServiceId contains only URL-safe base64url characters", () => {
    const dangerousScheduleId = "sch?#%& =+/\\ قدس [1]";
    const svcId = datedServiceId(dangerousScheduleId, "2026-10-06");
    // Only alphanumeric, hyphens, and underscores are allowed
    assert.match(svcId, /^svc1-[A-Za-z0-9_-]+-2026-10-06$/);
    assert.ok(!svcId.includes("="));
    assert.ok(!svcId.includes("+"));
    assert.ok(!svcId.includes("/"));
    assert.ok(!svcId.includes("%"));
  });

  test("date validation: rejects non-existent and non-Gregorian dates", () => {
    // Non-leap year Feb 29
    assert.equal(isValidISODate("2026-02-29"), false);
    assert.throws(() => datedServiceId("sch-1", "2026-02-29"));

    // Century non-leap year Feb 29
    assert.equal(isValidISODate("1900-02-29"), false);

    // 400-year leap year Feb 29
    assert.equal(isValidISODate("2000-02-29"), true);
    assert.equal(isValidISODate("2024-02-29"), true);

    // Out-of-range days and months
    assert.equal(isValidISODate("2026-02-30"), false);
    assert.equal(isValidISODate("2026-04-31"), false);
    assert.equal(isValidISODate("2026-13-01"), false);
    assert.equal(isValidISODate("2026-00-10"), false);
    assert.equal(isValidISODate("not-a-date"), false);
  });

  test("parseDatedServiceId rejects malformed, invalid, or corrupted IDs", () => {
    assert.equal(parseDatedServiceId(null as unknown as string), null);
    assert.equal(parseDatedServiceId(undefined as unknown as string), null);
    assert.equal(parseDatedServiceId(""), null);
    assert.equal(parseDatedServiceId("PS-204"), null);
    assert.equal(parseDatedServiceId("svc2-c2NoLUFNTS1vdXQ-2026-10-06"), null); // wrong version
    assert.equal(parseDatedServiceId("svc1--2026-10-06"), null); // empty schedule payload
    assert.equal(parseDatedServiceId("svc1-c2NoLUFNTS1vdXQ-2026-02-29"), null); // invalid date
    assert.equal(parseDatedServiceId("svc1-invalid!@#-2026-10-06"), null); // invalid base64url
    assert.equal(parseDatedServiceId("svc1-c2NoLUFNTS1vdXQ"), null); // missing date part
  });

  test("mutable schedule fields do not alter the datedServiceId", () => {
    const s1 = createMockSchedule({ number: "PS 204", departTime: "10:00", aircraft: "B737" });
    const s2 = createMockSchedule({ number: "PS 999", departTime: "15:00", aircraft: "A320neo" });
    assert.equal(datedServiceId(s1.id, "2026-10-06"), datedServiceId(s2.id, "2026-10-06"));
  });

  test("UTC calendar weekday is host-timezone independent", () => {
    // 2026-10-04 is Sunday (0)
    assert.equal(getUTCCalendarWeekday("2026-10-04"), 0);
    // 2026-10-05 is Monday (1)
    assert.equal(getUTCCalendarWeekday("2026-10-05"), 1);
    // 2026-10-06 is Tuesday (2)
    assert.equal(getUTCCalendarWeekday("2026-10-06"), 2);
    // 2026-10-10 is Saturday (6)
    assert.equal(getUTCCalendarWeekday("2026-10-10"), 6);
  });
});

describe("Pure Dated-Service Materializer Contract", () => {
  const schedule = createMockSchedule();
  const network = createMockNetwork();

  test("normal recurring operation: active schedule + active network on recurring day produces flight", () => {
    // 2026-10-06 is Tuesday (day 2)
    const flight = materializeScheduleOnDate({
      schedule,
      network,
      date: "2026-10-06",
      basePrice: 140,
    });

    assert.ok(flight !== null);
    assert.equal(flight.scheduleId, schedule.id);
    assert.equal(flight.id, datedServiceId(schedule.id, "2026-10-06"));
    assert.equal(flight.number, "PS 204");
    assert.equal(flight.originCode, "GZA");
    assert.equal(flight.destinationCode, "AMM");
    assert.equal(flight.date, "2026-10-06");
    assert.equal(flight.departTime, "10:00");
    assert.equal(flight.arriveTime, "11:00");
    assert.equal(flight.durationMinutes, 60); // from network.blockMinutes
    assert.equal(flight.aircraft, "Boeing 737-800");
    assert.equal(flight.aircraftId, "b737800");
    assert.ok(flight.seatsLeft > 0);
    assert.ok(flight.basePrice > 0);
    assert.equal(flight.status, "Scheduled");
    assert.ok(Number.isFinite(flight.basePrice));
  });

  test("route direction: in schedule sets origin to destination and destination to GZA", () => {
    const inSchedule = createMockSchedule({
      id: "sch-AMM-in",
      direction: "in",
      number: "PS 205",
      days: [2],
    });
    const flight = materializeScheduleOnDate({
      schedule: inSchedule,
      network,
      date: "2026-10-06",
    });

    assert.ok(flight !== null);
    assert.equal(flight.originCode, "AMM");
    assert.equal(flight.destinationCode, "GZA");
  });

  test("inactive schedule returns null; reactivation preserves stable ID", () => {
    const inactiveSchedule = createMockSchedule({ active: false });
    const flight = materializeScheduleOnDate({
      schedule: inactiveSchedule,
      network,
      date: "2026-10-06",
    });
    assert.equal(flight, null);

    // Reactivation
    const reactivatedSchedule = createMockSchedule({ active: true });
    const reactivatedFlight = materializeScheduleOnDate({
      schedule: reactivatedSchedule,
      network,
      date: "2026-10-06",
    });
    assert.ok(reactivatedFlight !== null);
    assert.equal(reactivatedFlight.id, datedServiceId(schedule.id, "2026-10-06"));
  });

  test("inactive network destination returns null", () => {
    const inactiveNetwork = createMockNetwork({ active: false });
    const flight = materializeScheduleOnDate({
      schedule,
      network: inactiveNetwork,
      date: "2026-10-06",
    });
    assert.equal(flight, null);
  });

  test("missing network throws typed domain failure network_missing", () => {
    assert.throws(
      () =>
        materializeScheduleOnDate({
          schedule,
          network: null as unknown as NetworkDestination,
          date: "2026-10-06",
        }),
      (err: unknown) =>
        err instanceof DatedServiceMaterializationError && err.code === "network_missing",
    );
  });

  test("mismatched network destination throws typed domain failure network_mismatch", () => {
    const wrongNetwork = createMockNetwork({ code: "CAI" });
    assert.throws(
      () =>
        materializeScheduleOnDate({
          schedule,
          network: wrongNetwork,
          date: "2026-10-06",
        }),
      (err: unknown) =>
        err instanceof DatedServiceMaterializationError && err.code === "network_mismatch",
    );
  });

  test("invalid ISO date throws typed domain failure invalid_date", () => {
    assert.throws(
      () =>
        materializeScheduleOnDate({
          schedule,
          network,
          date: "2026-02-29", // not a leap year
        }),
      (err: unknown) =>
        err instanceof DatedServiceMaterializationError && err.code === "invalid_date",
    );
  });

  test("date range boundaries: inclusive from/until, null outside", () => {
    const boundedSchedule = createMockSchedule({
      from: "2026-06-01",
      until: "2026-08-31",
      days: [2], // Tuesday
    });

    // Before 'from' (2026-05-26 is Tuesday)
    assert.equal(
      materializeScheduleOnDate({ schedule: boundedSchedule, network, date: "2026-05-26" }),
      null,
    );

    // Inside range (2026-06-02 is Tuesday)
    assert.ok(
      materializeScheduleOnDate({ schedule: boundedSchedule, network, date: "2026-06-02" }) !==
        null,
    );

    // After 'until' (2026-09-01 is Tuesday)
    assert.equal(
      materializeScheduleOnDate({ schedule: boundedSchedule, network, date: "2026-09-01" }),
      null,
    );
  });

  test("non-operating weekday returns null when no extra exception exists", () => {
    // 2026-10-05 is Monday (day 1); schedule operates on day 2 (Tuesday)
    const flight = materializeScheduleOnDate({
      schedule,
      network,
      date: "2026-10-05",
    });
    assert.equal(flight, null);
  });

  test("structured exception: cancelled preserves flight with status Cancelled and same ID", () => {
    const cancelledSchedule = createMockSchedule({
      exceptions: [
        {
          id: "exc-1",
          date: "2026-10-06",
          kind: "cancelled",
          detail: "Runway maintenance",
          effect: { cancelled: true },
        },
      ],
    });

    const flight = materializeScheduleOnDate({
      schedule: cancelledSchedule,
      network,
      date: "2026-10-06",
    });

    assert.ok(flight !== null);
    assert.equal(flight.id, datedServiceId(cancelledSchedule.id, "2026-10-06"));
    assert.equal(flight.status, "Cancelled");
    assert.equal(flight.number, "PS 204");
    assert.equal(flight.originCode, "GZA");
    assert.equal(flight.destinationCode, "AMM");
  });

  test("structured exception: time effect updates departTime and arriveTime", () => {
    const timeSchedule = createMockSchedule({
      exceptions: [
        {
          id: "exc-2",
          date: "2026-10-06",
          kind: "time",
          detail: "Slot delay",
          effect: { departTime: "14:30", arriveTime: "15:30" },
        },
      ],
    });

    const flight = materializeScheduleOnDate({
      schedule: timeSchedule,
      network,
      date: "2026-10-06",
    });

    assert.ok(flight !== null);
    assert.equal(flight.departTime, "14:30");
    assert.equal(flight.arriveTime, "15:30");
    assert.equal(flight.id, datedServiceId(timeSchedule.id, "2026-10-06"));
  });

  test("structured exception: aircraft effect updates aircraftId and aircraft model", () => {
    const aircraftSchedule = createMockSchedule({
      exceptions: [
        {
          id: "exc-3",
          date: "2026-10-06",
          kind: "aircraft",
          detail: "Equipment swap",
          effect: { aircraftId: "a320neo", aircraft: "Airbus A320neo" },
        },
      ],
    });

    const flight = materializeScheduleOnDate({
      schedule: aircraftSchedule,
      network,
      date: "2026-10-06",
    });

    assert.ok(flight !== null);
    assert.equal(flight.aircraftId, "a320neo");
    assert.equal(flight.aircraft, "Airbus A320neo");
  });

  test("structured exception: extra creates one normal service on non-recurring weekday", () => {
    // 2026-10-07 is Wednesday (day 3), not in schedule.days ([2])
    const extraSchedule = createMockSchedule({
      exceptions: [
        {
          id: "exc-4",
          date: "2026-10-07",
          kind: "extra",
          detail: "Holiday relief flight",
          effect: { departTime: "18:00", arriveTime: "19:00" },
        },
      ],
    });

    const flight = materializeScheduleOnDate({
      schedule: extraSchedule,
      network,
      date: "2026-10-07",
    });

    assert.ok(flight !== null);
    assert.equal(flight.id, datedServiceId(extraSchedule.id, "2026-10-07"));
    assert.equal(flight.date, "2026-10-07");
    assert.equal(flight.departTime, "18:00");
    assert.equal(flight.arriveTime, "19:00");
  });

  test("planning annotation (no effect) has zero operational effect and detail is never parsed", () => {
    const annotatedSchedule = createMockSchedule({
      exceptions: [
        {
          id: "exc-anno",
          date: "2026-10-06",
          kind: "cancelled", // legacy annotation without effect
          detail: "Operator cancelled this in notes",
          // effect is intentionally undefined
        },
      ],
    });

    const flight = materializeScheduleOnDate({
      schedule: annotatedSchedule,
      network,
      date: "2026-10-06",
    });

    assert.ok(flight !== null);
    // Not cancelled because effect is absent!
    assert.notEqual(flight.status, "Cancelled");
    assert.equal(flight.departTime, "10:00");
    assert.equal(flight.aircraft, "Boeing 737-800");
  });

  test("deterministic simulation: gate, terminal, seatsLeft, basePrice stable from serviceId", () => {
    const flight1 = materializeScheduleOnDate({ schedule, network, date: "2026-10-06" });
    const flight2 = materializeScheduleOnDate({ schedule, network, date: "2026-10-06" });
    assert.ok(flight1 && flight2);
    assert.equal(flight1.gate, flight2.gate);
    assert.equal(flight1.terminal, flight2.terminal);
    assert.equal(flight1.seatsLeft, flight2.seatsLeft);
    assert.equal(flight1.basePrice, flight2.basePrice);

    // Number or equipment changes do NOT perturb gate, terminal, seatsLeft
    const alteredSchedule = createMockSchedule({
      number: "PS 888",
      aircraft: "Airbus A320neo",
    });
    const flightAltered = materializeScheduleOnDate({
      schedule: alteredSchedule,
      network,
      date: "2026-10-06",
    });
    assert.ok(flightAltered);
    assert.equal(flightAltered.gate, flight1.gate);
    assert.equal(flightAltered.terminal, flight1.terminal);
    assert.equal(flightAltered.seatsLeft, flight1.seatsLeft);
  });

  test("multi-schedule projection returns deterministically sorted flights without duplicates", () => {
    const s1 = createMockSchedule({ id: "sch-1", number: "PS 204", departTime: "14:00" });
    const s2 = createMockSchedule({ id: "sch-2", number: "PS 102", departTime: "08:00" });
    const networks = new Map([["AMM", network]]);

    const flights = materializeSchedulesOnDate({
      schedules: [s1, s2],
      networks,
      date: "2026-10-06",
    });

    assert.equal(flights.length, 2);
    // Sorted by departTime: PS 102 (08:00) before PS 204 (14:00)
    assert.equal(flights[0]!.number, "PS 102");
    assert.equal(flights[1]!.number, "PS 204");
  });
});

describe("Legacy Compatibility Exports Contract", () => {
  test("legacyDeparturesOn and legacyArrivalsOn match raw generator exactly", () => {
    const date = "2026-10-06";
    const now = "2026-10-05T09:00:00.000Z";

    const legacyDeps = legacyDeparturesOn(date, now);
    const rawDeps = departuresOn(date, now);
    assert.deepEqual(legacyDeps, rawDeps);

    const legacyArrs = legacyArrivalsOn(date, now);
    const rawArrs = arrivalsOn(date, now);
    assert.deepEqual(legacyArrs, rawArrs);
  });

  test("legacyFlightById matches raw flightById exactly", () => {
    const raw = departuresOn("2026-10-06")[0]!;
    const legacy = legacyFlightById(raw.id);
    const direct = flightById(raw.id);
    assert.deepEqual(legacy, direct);
  });

  test("legacySearchFlights matches raw searchFlights exactly", () => {
    const legacyResults = legacySearchFlights("GZA", "AMM", "2026-10-06");
    const directResults = searchFlights("GZA", "AMM", "2026-10-06");
    assert.deepEqual(legacyResults, directResults);
  });
});

describe("Phase 6B2C2A Architectural & Source Invariants", () => {
  test("C2B FlightRepository composes shared resolver instead of directly importing pure materializer", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/repositories/flight-repository.ts"),
      "utf-8",
    );
    assert.match(source, /dated-services\/resolver/);
    assert.doesNotMatch(source, /materializeScheduleOnDate/);
  });

  test("C2B BookingRepository composes shared resolver instead of directly importing pure materializer", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/repositories/booking-repository.ts"),
      "utf-8",
    );
    assert.match(source, /dated-services\/resolver/);
    assert.doesNotMatch(source, /materializeScheduleOnDate/);
  });

  test("No generated flight instance store key in codebase", () => {
    const filesToAudit = [
      "src/lib/data.ts",
      "src/lib/repositories/flight-repository.ts",
      "src/lib/schedules/storage.ts",
      "src/lib/schedules/repository.ts",
    ];
    for (const file of filesToAudit) {
      const source = readFileSync(resolve(process.cwd(), file), "utf-8");
      assert.doesNotMatch(source, /gza\.flight-instance\.v1/);
    }
  });

  test("ScheduleRepository does not export or define remove method", () => {
    const typesSource = readFileSync(resolve(process.cwd(), "src/lib/schedules/types.ts"), "utf-8");
    assert.doesNotMatch(typesSource, /\bremove\s*\(/);

    const repoSource = readFileSync(
      resolve(process.cwd(), "src/lib/schedules/repository.ts"),
      "utf-8",
    );
    assert.doesNotMatch(repoSource, /\bremove\s*\(/);

    const indexSource = readFileSync(resolve(process.cwd(), "src/lib/schedules/index.ts"), "utf-8");
    assert.doesNotMatch(indexSource, /\buseDeleteScheduleMutation\b/);
    assert.doesNotMatch(indexSource, /\bdeleteSchedule\b/);
  });

  test("Admin schedules route does not have delete mutation or confirmDelete dialog", () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), "src/routes/{-$locale}.admin.schedules.tsx"),
      "utf-8",
    );
    assert.doesNotMatch(routeSource, /useDeleteScheduleMutation/);
    assert.doesNotMatch(routeSource, /confirmDelete/);
  });
});
