import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TripClient,
  TripReservationAttempt,
  tripCommandSchema,
  tripResponseSchema,
  validateTripChronology,
  type TripCommand,
  type TripPassenger,
} from "../../src/lib/reservations/trip-client.ts";
import { createMvpApiClient, MvpApiError } from "../../src/lib/api/mvp-client.ts";
import { encodeDatedOfferingId } from "../../src/lib/offerings/codec.ts";

const outboundServiceId = encodeDatedOfferingId("outbound-schedule", "2026-12-20");
const returnServiceId = encodeDatedOfferingId("return-schedule", "2026-12-27");
const contact = { email: "traveler@example.test", phone: "+970 599 765432" };

const pOut: TripPassenger = {
  id: "p1",
  type: "adult",
  firstName: "Farah",
  lastName: "Husseini",
  dob: "1994-08-22",
  nationality: "Palestinian",
  document: "P98765432",
  seatCode: "12A",
  mealId: "meal-standard",
};

const pIn: TripPassenger = {
  ...pOut,
  seatCode: "14C", // Different seat on return leg is allowed
  mealId: "meal-vegetarian", // Different meal on return leg is allowed
};

function validTripInput(): Omit<TripCommand, "submissionId"> {
  return {
    contact: { ...contact },
    legs: [
      { serviceId: outboundServiceId, passengers: [{ ...pOut }] },
      { serviceId: returnServiceId, passengers: [{ ...pIn }] },
    ],
  };
}

function mockDetail(
  serviceId: string,
  flightNumber: string,
  originCode: string,
  destinationCode: string,
  date: string,
  seatCode: string,
  departAt = `${date}T08:00:00+03:00`,
  arriveAt = `${date}T09:30:00+03:00`,
) {
  const flight = {
    serviceId,
    flightNumber,
    date,
    originCode,
    destinationCode,
    departTime: "08:00",
    arriveTime: "09:30",
    aircraftModel: "Boeing 737-800",
    departAt,
    arriveAt,
  };
  const reference = `GZA-TRIP-${originCode}`;
  return {
    reservation: {
      id: crypto.randomUUID(),
      reference,
      status: "confirmed" as const,
      serviceId,
      flightNumber,
      date,
      originCode,
      destinationCode,
      departTime: "08:00",
      arriveTime: "09:30",
      contact: { ...contact },
      passengers: [{
        id: "p1",
        type: "adult" as const,
        firstName: "Farah",
        lastName: "Husseini",
        seatCode,
        mealId: "meal-standard",
        mealLabel: null,
      }],
      createdAt: "2026-10-16 11:30:00+00",
    },
    ticket: {
      reference,
      status: "confirmed" as const,
      issuedAt: "2026-10-16T11:30:00+00:00",
      flight,
      contact: { ...contact },
      tickets: [{
        reference,
        status: "confirmed" as const,
        issuedAt: "2026-10-16T11:30:00+00:00",
        ticketNumber: `TKT-${reference}-1`,
        flight,
        contact: { ...contact },
        passenger: {
          id: "p1",
          type: "adult" as const,
          firstName: "Farah",
          lastName: "Husseini",
          seatCode,
          nationality: "Palestinian",
          meal: null,
        },
      }],
    },
  };
}

function mockTripApi(handler: (path: string, init: RequestInit) => { status: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = createMvpApiClient(
    {
      enabled: true,
      nonProductionOptIn: true,
      environment: { MODE: "test" },
      baseUrl: "https://127.0.0.1:18084",
      fetch: async (url, init) => {
        calls.push({ url, init: init! });
        const requestId = new Headers(init?.headers).get("x-request-id")!;
        const pathname = new URL(url).pathname.replace(/^\/api\/v1/, "");
        const { status, body } = handler(pathname, init!);
        return new Response(
          JSON.stringify({
            success: status < 400,
            data: status < 400 ? body : undefined,
            error: status >= 400 ? { code: (body as { code?: string }).code ?? "error", message: "fail" } : undefined,
            meta: { requestId, timestamp: "2026-10-16T11:30:00Z" },
          }),
          { status, headers: { "content-type": "application/json", "x-request-id": requestId } },
        );
      },
    },
    () => ({
      getAuthCsrfBootstrap: async () => ({ csrfToken: "P".repeat(43) }),
      getStaffCsrfBootstrap: async () => {
        throw new Error("Wrong realm");
      },
    }),
  );
  return { client, calls };
}

test("TripReservationAttempt retains frozen command and UUID across uncertain network rejections", () => {
  const attempt = new TripReservationAttempt();
  const input = validTripInput();
  const first = attempt.prepare("traveler@example.test", input);

  assert.equal(attempt.locked, true);
  assert.equal(first.submissionId, attempt.currentSubmissionId);

  // Ambiguous failures (network timeout / 500 / 503 / 401 / 403 / 429) keep command locked with same submissionId
  for (const status of [undefined, 500, 502, 503, 401, 403, 429]) {
    attempt.rejected(status);
    assert.equal(attempt.locked, true);

    const retry = attempt.prepare("traveler@example.test", {
      ...input,
      legs: [
        { serviceId: outboundServiceId, passengers: [{ ...pOut, seatCode: "99Z" }] },
        input.legs[1],
      ],
    });
    // Retains original frozen normalized body and submissionId
    assert.equal(retry.submissionId, first.submissionId);
    assert.equal(retry.legs[0].passengers[0]!.seatCode, "12A");

    // Switching owner context while locked is prohibited
    assert.throws(
      () => attempt.prepare("other@example.test", input),
      /context changed/i,
    );
  }

  // Definitive 409 conflict or 422 unlocks editing
  attempt.rejected(409);
  assert.equal(attempt.locked, false);

  const nextAttempt = attempt.prepare("traveler@example.test", input);
  assert.notEqual(nextAttempt.submissionId, first.submissionId);
});

test("tripCommandSchema validates exactly two legs, differing services, and passenger consistency", () => {
  const input = validTripInput();
  const validCommand: TripCommand = { ...input, submissionId: crypto.randomUUID() };
  assert.equal(tripCommandSchema.safeParse(validCommand).success, true);

  // Rejects identical serviceId for outbound and return
  const sameService: TripCommand = {
    ...validCommand,
    legs: [
      { serviceId: outboundServiceId, passengers: [{ ...pOut }] },
      { serviceId: outboundServiceId, passengers: [{ ...pIn }] },
    ],
  };
  assert.equal(tripCommandSchema.safeParse(sameService).success, false);

  // Accepts valid cross-timezone legs where dated IDs have origin-local dates
  const crossTimezoneDates: TripCommand = {
    ...validCommand,
    legs: [
      { serviceId: encodeDatedOfferingId("sch-1", "2026-12-25"), passengers: [{ ...pOut }] },
      { serviceId: encodeDatedOfferingId("sch-2", "2026-12-24"), passengers: [{ ...pIn }] },
    ],
  };
  assert.equal(tripCommandSchema.safeParse(crossTimezoneDates).success, true);
});

test("tripCommandSchema enforces identical passenger identities between legs with flexible per-leg seats", () => {
  const input = validTripInput();
  const validCommand: TripCommand = { ...input, submissionId: crypto.randomUUID() };

  // Mismatched name between legs is rejected
  const mismatchedName: TripCommand = {
    ...validCommand,
    legs: [
      validCommand.legs[0],
      {
        ...validCommand.legs[1],
        passengers: [{ ...pIn, firstName: "Different" }],
      },
    ],
  };
  assert.equal(tripCommandSchema.safeParse(mismatchedName).success, false);

  // Mismatched DOB between legs is rejected
  const mismatchedDob: TripCommand = {
    ...validCommand,
    legs: [
      validCommand.legs[0],
      {
        ...validCommand.legs[1],
        passengers: [{ ...pIn, dob: "1980-01-01" }],
      },
    ],
  };
  assert.equal(tripCommandSchema.safeParse(mismatchedDob).success, false);

  // Duplicate seats on same leg rejected
  const duplicateSeat: TripCommand = {
    ...validCommand,
    legs: [
      {
        serviceId: outboundServiceId,
        passengers: [{ ...pOut }, { ...pOut, id: "p2", firstName: "Layla", seatCode: "12A" }],
      },
      {
        serviceId: returnServiceId,
        passengers: [{ ...pIn }, { ...pIn, id: "p2", firstName: "Layla", seatCode: "14C" }],
      },
    ],
  };
  assert.equal(tripCommandSchema.safeParse(duplicateSeat).success, false);
});

test("validateTripChronology checks instant-level UTC chronology across airport timezones", () => {
  // Return departs after outbound arrives: valid
  assert.equal(
    validateTripChronology("2026-10-19T10:30:00+03:00", "2026-10-19T14:00:00+03:00"),
    true,
  );
  // Return departs before outbound arrives: invalid
  assert.equal(
    validateTripChronology("2026-10-19T10:30:00+03:00", "2026-10-19T09:00:00+03:00"),
    false,
  );
  // Return departs exactly when outbound arrives: invalid (must be strictly greater)
  assert.equal(
    validateTripChronology("2026-10-19T10:30:00+03:00", "2026-10-19T10:30:00+03:00"),
    false,
  );
  // Cross-timezone instant comparison: Outbound arrives at 10:00 UTC (13:00 +03:00). Return departs at 11:00 UTC (12:00 +01:00) => valid
  assert.equal(
    validateTripChronology("2026-10-19T13:00:00+03:00", "2026-10-19T12:00:00+01:00"),
    true,
  );
  // Earlier calendar date in negative timezone offset zone but later UTC instant: valid
  // Outbound arrives 2026-10-20T01:30:00+03:00 (which is 2026-10-19T22:30:00Z)
  // Return departs 2026-10-19T18:00:00-05:00 (which is 2026-10-19T23:00:00Z) -> strictly after!
  assert.equal(
    validateTripChronology("2026-10-20T01:30:00+03:00", "2026-10-19T18:00:00-05:00"),
    true,
  );
});

test("TripClient routes to /reservation-trips for accounts and /guest-reservation-trips for guests", async () => {
  const outDetail = mockDetail(outboundServiceId, "PS204", "GZA", "AMM", "2026-12-20", "12A");
  const inDetail = mockDetail(returnServiceId, "PS205", "AMM", "GZA", "2026-12-27", "14C");

  const { client, calls } = mockTripApi((path, init) => {
    if ((path === "/reservation-trips" || path === "/guest-reservation-trips") && init.method === "POST") {
      return { status: 201, body: { reservations: [outDetail, inDetail] } };
    }
    return { status: 404, body: { code: "not_found" } };
  });

  const trip = new TripClient(() => client);
  const command: TripCommand = { ...validTripInput(), submissionId: crypto.randomUUID() };

  // 1. Account create
  const accountRes = await trip.create(command, false);
  assert.equal(accountRes.reservations.length, 2);
  assert.equal(calls[0]?.url, "https://127.0.0.1:18084/api/v1/reservation-trips");

  // 2. Guest create
  const guestRes = await trip.create(command, true);
  assert.equal(guestRes.reservations.length, 2);
  assert.equal(calls[1]?.url, "https://127.0.0.1:18084/api/v1/guest-reservation-trips");
});

test("TripClient rejects server response if returned reservations do not match command legs", async () => {
  const outDetail = mockDetail(outboundServiceId, "PS204", "GZA", "AMM", "2026-12-20", "12A");
  const corruptedInDetail = mockDetail(returnServiceId, "PS205", "AMM", "GZA", "2026-12-27", "99Z"); // Wrong seat returned

  const { client } = mockTripApi(() => ({
    status: 201,
    body: { reservations: [outDetail, corruptedInDetail] },
  }));

  const trip = new TripClient(() => client);
  const command: TripCommand = { ...validTripInput(), submissionId: crypto.randomUUID() };

  await assert.rejects(
    trip.create(command, false),
    (err: unknown) => err instanceof MvpApiError && err.code === "protocol",
  );
});

test("TripClient rejects server response with non-opposite airports or inverted timing", async () => {
  const command: TripCommand = { ...validTripInput(), submissionId: crypto.randomUUID() };

  // 1. Non-opposite airports: return leg flies AMM -> CAI instead of AMM -> GZA
  const outDetail = mockDetail(outboundServiceId, "PS204", "GZA", "AMM", "2026-12-20", "12A");
  const wrongRouteIn = mockDetail(returnServiceId, "PS205", "AMM", "CAI", "2026-12-27", "14C");

  const { client: routeClient } = mockTripApi(() => ({
    status: 201,
    body: { reservations: [outDetail, wrongRouteIn] },
  }));
  const tripRoute = new TripClient(() => routeClient);

  await assert.rejects(
    tripRoute.create(command, false),
    (err: unknown) => err instanceof MvpApiError && err.code === "protocol",
  );

  // 2. Inverted chronology: return departs before outbound arrives
  const invertedIn = mockDetail(
    returnServiceId,
    "PS205",
    "AMM",
    "GZA",
    "2026-12-20",
    "14C",
    "2026-12-20T07:00:00+03:00", // departs earlier than outbound arrives at 09:30
    "2026-12-20T08:30:00+03:00",
  );

  const { client: timingClient } = mockTripApi(() => ({
    status: 201,
    body: { reservations: [outDetail, invertedIn] },
  }));
  const tripTiming = new TripClient(() => timingClient);

  await assert.rejects(
    tripTiming.create(command, false),
    (err: unknown) => err instanceof MvpApiError && err.code === "protocol",
  );
});
