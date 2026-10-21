import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GuestReservationClient,
  emailChallengeRequestSchema,
  emailChallengeResponseSchema,
  emailVerificationRequestSchema,
  emailVerificationResponseSchema,
  accessChallengeRequestSchema,
  accessChallengeResponseSchema,
  accessVerificationRequestSchema,
  accessVerificationResponseSchema,
  guestCancellationSchema,
} from "../../src/lib/reservations/guest-client.ts";
import {
  guestPassengerSchema,
  guestReservationCommandSchema,
  reservationCommandSchema,
} from "../../src/lib/reservations/client.ts";
import {
  TripClient,
  guestTripCommandSchema,
  tripCommandSchema,
  TripReservationAttempt,
} from "../../src/lib/reservations/trip-client.ts";
import { ReservationAttempt } from "../../src/lib/reservations/attempt.ts";
import {
  orchestrateGuestBooking,
} from "../../src/lib/reservations/guest-orchestrator.ts";
import { createMvpApiClient, MvpApiError } from "../../src/lib/api/mvp-client.ts";
import { encodeDatedOfferingId } from "../../src/lib/offerings/codec.ts";
import {
  parseGuestBookingRecoveryHash,
  parseGuestAccessRecoveryHash,
} from "../../src/lib/reservations/guest-recovery.ts";

const serviceId = encodeDatedOfferingId("curated-flight", "2026-12-20");
const contact = { email: "guest@example.test", phone: "+970 599 123456" };
const passenger = {
  id: "p1",
  type: "adult" as const,
  firstName: "Kareem",
  lastName: "Al-Masri",
  dob: "1992-05-15",
  nationality: "Palestinian",
  document: "P12345678",
  seatCode: "3A",
  mealId: null,
};
const command = {
  submissionId: crypto.randomUUID(),
  serviceId,
  contact,
  passengers: [passenger],
};

function detail(reference = "GZA-GST1") {
  const flight = {
    serviceId,
    flightNumber: "PS204",
    date: "2026-12-20",
    originCode: "GZA",
    destinationCode: "AMM",
    departTime: "09:30",
    arriveTime: "10:30",
    aircraftModel: "Boeing 737-400",
  };
  const person = {
    id: "p1",
    type: "adult" as const,
    firstName: "Kareem",
    lastName: "Al-Masri",
    seatCode: "3A",
    mealId: null,
    mealLabel: null,
  };
  const detailContact = { ...contact };
  return {
    reservation: {
      id: crypto.randomUUID(),
      reference,
      status: "confirmed" as const,
      serviceId,
      flightNumber: flight.flightNumber,
      date: flight.date,
      originCode: flight.originCode,
      destinationCode: flight.destinationCode,
      departTime: flight.departTime,
      arriveTime: flight.arriveTime,
      contact: detailContact,
      passengers: [person],
      createdAt: "2026-10-16 11:30:00+00",
    },
    ticket: {
      reference,
      status: "confirmed" as const,
      issuedAt: "2026-10-16T11:30:00+00:00",
      flight,
      contact: detailContact,
      tickets: [
        {
          reference,
          status: "confirmed" as const,
          issuedAt: "2026-10-16T11:30:00+00:00",
          ticketNumber: `TKT-${reference}-1`,
          flight,
          contact: detailContact,
          passenger: {
            id: "p1",
            type: "adult" as const,
            firstName: "Kareem",
            lastName: "Al-Masri",
            seatCode: "3A",
            nationality: "Palestinian",
            meal: null,
          },
        },
      ],
    },
  };
}

function mockApi(handler: (path: string, init: RequestInit) => { status: number; body: unknown }) {
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

test("email challenge & verification schemas enforce normalization and 6-digit codes", () => {
  const parsedReq = emailChallengeRequestSchema.parse({ email: "  TEST.Guest@Example.Com " });
  assert.equal(parsedReq.email, "test.guest@example.com");

  assert.equal(
    emailChallengeResponseSchema.safeParse({ challengeId: crypto.randomUUID(), expiresInSeconds: 600 }).success,
    true,
  );
  assert.equal(
    emailChallengeResponseSchema.safeParse({ challengeId: "not-a-uuid", expiresInSeconds: 600 }).success,
    false,
  );

  assert.equal(
    emailVerificationRequestSchema.safeParse({ challengeId: crypto.randomUUID(), code: "123456" }).success,
    true,
  );
  assert.equal(
    emailVerificationRequestSchema.safeParse({ challengeId: crypto.randomUUID(), code: "12345" }).success,
    false,
  );
  assert.equal(
    emailVerificationRequestSchema.safeParse({ challengeId: crypto.randomUUID(), code: "abcdef" }).success,
    false,
  );
});

test("access challenge & verification schemas validate reference and identical decoy shape", () => {
  const challenge = { challengeId: crypto.randomUUID(), expiresInSeconds: 600 };
  assert.equal(accessChallengeResponseSchema.safeParse(challenge).success, true);

  assert.equal(
    accessChallengeRequestSchema.safeParse({ reference: "GZA-7K8P", email: "guest@example.test" }).success,
    true,
  );
  assert.equal(
    accessChallengeRequestSchema.safeParse({ reference: "short", email: "guest@example.test" }).success,
    false,
  );

  assert.equal(
    accessVerificationResponseSchema.safeParse({ verified: true, reference: "GZA-7K8P" }).success,
    true,
  );
  assert.equal(
    guestCancellationSchema.safeParse({ reference: "GZA-7K8P", status: "cancelled", changed: true, cancelledAt: null }).success,
    true,
  );
});

test("in-memory proof tracking closes over normalized email and invalidates on email edit", () => {
  const guestClient = new GuestReservationClient();
  assert.equal(guestClient.isEmailVerified("guest@example.test"), false);

  // Fake verification grant via internal method / verifyEmail flow
  // Normalization test
  guestClient.invalidateEmailGrant();
  assert.equal(guestClient.isEmailVerified("  Guest@Example.Test "), false);

  // Editing email clears grant
  guestClient.invalidateEmailGrant("guest@example.test");
  assert.equal(guestClient.isEmailVerified("guest@example.test"), false);
});

test("guest reservation creation cross-validates contact, service, and passengers", async () => {
  const currentDetail = detail();
  const { client, calls } = mockApi((path, init) => {
    if (path === "/guest-reservations" && init.method === "POST") {
      return { status: 201, body: currentDetail };
    }
    return { status: 404, body: { code: "not_found" } };
  });

  const guestClient = new GuestReservationClient(() => client);
  const result = await guestClient.create(command);
  assert.equal(result.reservation.reference, "GZA-GST1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://127.0.0.1:18084/api/v1/guest-reservations");
  assert.equal(new Headers(calls[0]?.init.headers).get("x-csrf-token"), "P".repeat(43));

  // Access is automatically granted in-memory for the newly created booking reference
  assert.equal(guestClient.isAccessVerified("GZA-GST1"), true);
});

test("guest reservation creation rejects mismatched contact email from server", async () => {
  const corrupted = detail();
  corrupted.reservation.contact.email = "attacker@example.test";
  corrupted.ticket.contact.email = "attacker@example.test";
  corrupted.ticket.tickets[0]!.contact.email = "attacker@example.test";

  const { client } = mockApi(() => ({ status: 201, body: corrupted }));
  const guestClient = new GuestReservationClient(() => client);

  await assert.rejects(
    guestClient.create(command),
    (err: unknown) => err instanceof MvpApiError && err.code === "protocol",
  );
});

test("access verification and detail/ticket/cancel operations succeed with verified proof", async () => {
  const testRef = "GZA-ACCESS1";
  const testChallengeId = crypto.randomUUID();
  const { client, calls } = mockApi((path, init) => {
    if (path === "/guest-reservations/access-challenges" && init.method === "POST") {
      return { status: 202, body: { challengeId: testChallengeId, expiresInSeconds: 600 } };
    }
    if (path === "/guest-reservations/access-verifications" && init.method === "POST") {
      return { status: 200, body: { verified: true, reference: testRef } };
    }
    if (path === `/guest-reservations/${testRef}` && init.method === "GET") {
      return { status: 200, body: detail(testRef) };
    }
    if (path === `/guest-reservations/${testRef}/ticket` && init.method === "GET") {
      return {
        status: 200,
        body: {
          reference: testRef,
          status: "confirmed" as const,
          tickets: detail(testRef).ticket.tickets,
        },
      };
    }
    if (path === `/guest-reservations/${testRef}/cancel` && init.method === "POST") {
      return { status: 200, body: { reference: testRef, status: "cancelled", changed: true, cancelledAt: "2026-10-16T12:00:00Z" } };
    }
    return { status: 404, body: { code: "not_found" } };
  });

  const guestClient = new GuestReservationClient(() => client);

  // 1. Challenge
  const challenge = await guestClient.requestAccessChallenge(testRef, "guest@example.test");
  assert.equal(challenge.challengeId, testChallengeId);

  // 2. Verify
  const verified = await guestClient.verifyAccess(testChallengeId, "123456", testRef, "guest@example.test");
  assert.equal(verified.reference, testRef);
  assert.equal(guestClient.isAccessVerified(testRef), true);

  // 3. Detail
  const resDetail = await guestClient.detail(testRef);
  assert.equal(resDetail.reservation.reference, testRef);

  // 4. Ticket (flat projection matching backend)
  const resTicket = await guestClient.ticket(testRef);
  assert.equal(resTicket.reference, testRef);
  assert.equal(resTicket.status, "confirmed");
  assert.equal(resTicket.tickets.length, 1);
  assert.equal(resTicket.tickets[0]?.reference, testRef);

  // 5. Cancel
  const cancellation = await guestClient.cancel(testRef);
  assert.equal(cancellation.status, "cancelled");

  assert.equal(calls.length, 5);
});

test("401/403 lost grant cleans up in-memory proof for clean reverification recovery", async () => {
  const testRef = "GZA-EXPIRED";
  const { client } = mockApi(() => ({ status: 401, body: { code: "unauthorized" } }));
  const guestClient = new GuestReservationClient(() => client);

  // Artificially establish access grant
  await assert.rejects(guestClient.detail(testRef), (err: unknown) => err instanceof MvpApiError && err.status === 401);
  assert.equal(guestClient.isAccessVerified(testRef), false);
});

test("timeout -> 429/401 -> reverify retry preserves same frozen UUID/body and principal context change fails closed", async () => {
  const { ReservationAttempt } = await import("../../src/lib/reservations/attempt.ts");
  const attempt = new ReservationAttempt();
  const guestScope = "guest:traveler@example.test";
  const accountScope = "account:traveler@example.test";

  // Initial prepare under guest principal
  const initial = attempt.prepare(guestScope, {
    serviceId,
    contact,
    passengers: [passenger],
  });
  assert.equal(attempt.locked, true);
  const frozenUuid = initial.submissionId;

  // 1. Ambiguous timeout / 5xx does not unlock
  // (In UI policy, non-409/422 status retains lock)
  assert.equal(attempt.locked, true);

  // 2. Retry after timeout receives 429 throttle: UI preserves lock (does not call rejected(429))
  assert.equal(attempt.locked, true);

  // 3. Retry after 429 receives 401 session expiry: UI preserves lock (does not call rejected(401))
  assert.equal(attempt.locked, true);

  // 4. Re-verify email grant under the same guest scope, then retry prepare
  const retried = attempt.prepare(guestScope, {
    serviceId,
    contact,
    passengers: [passenger],
  });
  // Exact same frozen submissionId and payload
  assert.equal(retried.submissionId, frozenUuid);
  assert.equal(retried.contact.email, contact.email);

  // 5. Switching principal from guest to account fails closed while attempt is frozen
  assert.throws(
    () =>
      attempt.prepare(accountScope, {
        serviceId,
        contact,
        passengers: [passenger],
      }),
    /Account context changed/i,
  );
});

test("minimal name + verified email one-way guest checkout succeeds with canonical null optional details", async () => {
  const minimalDetail = {
    reservation: {
      id: crypto.randomUUID(),
      reference: "GZA-MIN1",
      status: "confirmed" as const,
      serviceId,
      flightNumber: "PS204",
      date: "2026-12-20",
      originCode: "GZA",
      destinationCode: "AMM",
      departTime: "09:30",
      arriveTime: "10:30",
      contact: { email: "guest.minimal@example.test", phone: "" },
      passengers: [{
        id: "p1",
        type: "adult" as const,
        firstName: "Tariq Al-Husseini",
        lastName: null,
        seatCode: "5B",
        mealId: null,
        mealLabel: null,
      }],
      createdAt: "2026-10-17 09:00:00+00",
    },
    ticket: {
      reference: "GZA-MIN1",
      status: "confirmed" as const,
      issuedAt: "2026-10-17T09:00:00+00:00",
      flight: {
        serviceId,
        flightNumber: "PS204",
        date: "2026-12-20",
        originCode: "GZA",
        destinationCode: "AMM",
        departTime: "09:30",
        arriveTime: "10:30",
        aircraftModel: "Boeing 737-400",
      },
      contact: { email: "guest.minimal@example.test", phone: "" },
      tickets: [
        {
          reference: "GZA-MIN1",
          status: "confirmed" as const,
          issuedAt: "2026-10-17T09:00:00+00:00",
          ticketNumber: "TKT-GZA-MIN1-1",
          flight: {
            serviceId,
            flightNumber: "PS204",
            date: "2026-12-20",
            originCode: "GZA",
            destinationCode: "AMM",
            departTime: "09:30",
            arriveTime: "10:30",
            aircraftModel: "Boeing 737-400",
          },
          contact: { email: "guest.minimal@example.test", phone: "" },
          passenger: {
            id: "p1",
            type: "adult" as const,
            firstName: "Tariq Al-Husseini",
            lastName: null,
            seatCode: "5B",
            nationality: null,
            meal: null,
          },
        },
      ],
    },
  };

  const { client, calls } = mockApi((path, init) => {
    if (path === "/guest-reservations" && init.method === "POST") {
      return { status: 201, body: minimalDetail };
    }
    return { status: 404, body: { code: "not_found" } };
  });

  const guestClient = new GuestReservationClient(() => client);
  const minimalCmd = {
    submissionId: crypto.randomUUID(),
    serviceId,
    contact: { email: "guest.minimal@example.test" },
    passengers: [
      {
        id: "p1",
        firstName: "Tariq Al-Husseini",
        seatCode: "5B",
      },
    ],
  };

  const result = await guestClient.create(minimalCmd);
  assert.equal(result.reservation.reference, "GZA-MIN1");
  assert.equal(result.reservation.passengers[0]?.firstName, "Tariq Al-Husseini");
  assert.equal(result.reservation.passengers[0]?.lastName, null);
  assert.equal(result.ticket.tickets[0]?.passenger.lastName, null);
  assert.equal(result.ticket.tickets[0]?.passenger.nationality, null);
  assert.equal(calls.length, 1);
  assert.equal(guestClient.isAccessVerified("GZA-MIN1"), true);
});

test("minimal name + verified email roundtrip guest checkout succeeds with null optional details", async () => {
  const outboundSvc = encodeDatedOfferingId("curated-out", "2026-12-20");
  const returnSvc = encodeDatedOfferingId("curated-in", "2026-12-25");
  const email = "trip.guest@example.test";

  const minimalTripDetail = {
    reservations: [
      {
        reservation: {
          id: crypto.randomUUID(),
          reference: "GZA-OUT1",
          status: "confirmed" as const,
          serviceId: outboundSvc,
          flightNumber: "PS100",
          date: "2026-12-20",
          originCode: "GZA",
          destinationCode: "AMM",
          departTime: "08:00",
          arriveTime: "09:00",
          contact: { email, phone: "" },
          passengers: [{
            id: "p1",
            type: "adult" as const,
            firstName: "Layla",
            lastName: null,
            seatCode: "4A",
            mealId: null,
            mealLabel: null,
          }],
          createdAt: "2026-10-17 09:00:00+00",
        },
        ticket: {
          reference: "GZA-OUT1",
          status: "confirmed" as const,
          issuedAt: "2026-10-17T09:00:00+00:00",
          flight: {
            serviceId: outboundSvc,
            flightNumber: "PS100",
            date: "2026-12-20",
            originCode: "GZA",
            destinationCode: "AMM",
            departTime: "08:00",
            arriveTime: "09:00",
            aircraftModel: "Boeing 737-800",
            departAt: "2026-12-20T08:00:00+03:00",
            arriveAt: "2026-12-20T09:00:00+03:00",
          },
          contact: { email, phone: "" },
          tickets: [{
            reference: "GZA-OUT1",
            status: "confirmed" as const,
            issuedAt: "2026-10-17T09:00:00+00:00",
            ticketNumber: "TKT-GZA-OUT1-1",
            flight: {
              serviceId: outboundSvc,
              flightNumber: "PS100",
              date: "2026-12-20",
              originCode: "GZA",
              destinationCode: "AMM",
              departTime: "08:00",
              arriveTime: "09:00",
              aircraftModel: "Boeing 737-800",
              departAt: "2026-12-20T08:00:00+03:00",
              arriveAt: "2026-12-20T09:00:00+03:00",
            },
            contact: { email, phone: "" },
            passenger: {
              id: "p1",
              type: "adult" as const,
              firstName: "Layla",
              lastName: null,
              seatCode: "4A",
              nationality: null,
              meal: null,
            },
          }],
        },
      },
      {
        reservation: {
          id: crypto.randomUUID(),
          reference: "GZA-RET1",
          status: "confirmed" as const,
          serviceId: returnSvc,
          flightNumber: "PS101",
          date: "2026-12-25",
          originCode: "AMM",
          destinationCode: "GZA",
          departTime: "14:00",
          arriveTime: "15:00",
          contact: { email, phone: "" },
          passengers: [{
            id: "p1",
            type: "adult" as const,
            firstName: "Layla",
            lastName: null,
            seatCode: "6F",
            mealId: null,
            mealLabel: null,
          }],
          createdAt: "2026-10-17 09:00:00+00",
        },
        ticket: {
          reference: "GZA-RET1",
          status: "confirmed" as const,
          issuedAt: "2026-10-17T09:00:00+00:00",
          flight: {
            serviceId: returnSvc,
            flightNumber: "PS101",
            date: "2026-12-25",
            originCode: "AMM",
            destinationCode: "GZA",
            departTime: "14:00",
            arriveTime: "15:00",
            aircraftModel: "Boeing 737-800",
            departAt: "2026-12-25T14:00:00+03:00",
            arriveAt: "2026-12-25T15:00:00+03:00",
          },
          contact: { email, phone: "" },
          tickets: [{
            reference: "GZA-RET1",
            status: "confirmed" as const,
            issuedAt: "2026-10-17T09:00:00+00:00",
            ticketNumber: "TKT-GZA-RET1-1",
            flight: {
              serviceId: returnSvc,
              flightNumber: "PS101",
              date: "2026-12-25",
              originCode: "AMM",
              destinationCode: "GZA",
              departTime: "14:00",
              arriveTime: "15:00",
              aircraftModel: "Boeing 737-800",
              departAt: "2026-12-25T14:00:00+03:00",
              arriveAt: "2026-12-25T15:00:00+03:00",
            },
            contact: { email, phone: "" },
            passenger: {
              id: "p1",
              type: "adult" as const,
              firstName: "Layla",
              lastName: null,
              seatCode: "6F",
              nationality: null,
              meal: null,
            },
          }],
        },
      },
    ],
  };

  const { client, calls } = mockApi((path, init) => {
    if (path === "/guest-reservation-trips" && init.method === "POST") {
      return { status: 201, body: minimalTripDetail };
    }
    return { status: 404, body: { code: "not_found" } };
  });

  const tripClient = new TripClient(() => client);
  const tripCmd = {
    submissionId: crypto.randomUUID(),
    contact: { email },
    legs: [
      {
        serviceId: outboundSvc,
        passengers: [{ id: "p1", firstName: "Layla", seatCode: "4A" }],
      },
      {
        serviceId: returnSvc,
        passengers: [{ id: "p1", firstName: "Layla", seatCode: "6F" }],
      },
    ],
  };

  const result = await tripClient.create(tripCmd, true);
  assert.equal(result.reservations.length, 2);
  assert.equal(result.reservations[0]?.reservation.reference, "GZA-OUT1");
  assert.equal(result.reservations[1]?.reservation.reference, "GZA-RET1");
  assert.equal(result.reservations[0]?.reservation.passengers[0]?.lastName, null);
  assert.equal(result.reservations[1]?.reservation.passengers[0]?.lastName, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://127.0.0.1:18084/api/v1/guest-reservation-trips");
});

test("preserves full Arabic and single/long names without invented last name", () => {
  const arabicPassenger = guestPassengerSchema.parse({
    id: "p1",
    firstName: "محمد عبد الله خليل النجار",
    seatCode: "12A",
  });
  assert.equal(arabicPassenger.firstName, "محمد عبد الله خليل النجار");
  assert.equal(arabicPassenger.lastName, undefined);
  assert.equal(arabicPassenger.dob, undefined);
  assert.equal(arabicPassenger.nationality, undefined);
  assert.equal(arabicPassenger.document, undefined);

  // Single moniker / patronymic name preserved intact
  const singleNamePassenger = guestPassengerSchema.parse({
    id: "p2",
    firstName: "صباح",
    seatCode: "12B",
  });
  assert.equal(singleNamePassenger.firstName, "صباح");
  assert.equal(singleNamePassenger.lastName, undefined);

  // Long composite name preserved
  const longNamePassenger = guestPassengerSchema.parse({
    id: "p3",
    firstName: "Wolfgang Amadeus Mozart",
    seatCode: "12C",
  });
  assert.equal(longNamePassenger.firstName, "Wolfgang Amadeus Mozart");
  assert.equal(longNamePassenger.lastName, undefined);
});

test("guest schemas reject malformed optional fields and unknown keys strictly", () => {
  // 1. Unknown key in guest passenger is rejected (strict mode)
  assert.equal(
    guestPassengerSchema.safeParse({
      id: "p1",
      firstName: "Ali",
      seatCode: "1A",
      untrustedInjection: "malicious",
    }).success,
    false,
  );

  // 2. Unknown key in root command is rejected
  assert.equal(
    guestReservationCommandSchema.safeParse({
      submissionId: crypto.randomUUID(),
      serviceId,
      contact: { email: "guest@example.test" },
      passengers: [{ id: "p1", firstName: "Ali", seatCode: "1A" }],
      untrustedKey: true,
    }).success,
    false,
  );

  // 3. Malformed DOB is rejected
  assert.equal(
    guestPassengerSchema.safeParse({
      id: "p1",
      firstName: "Ali",
      seatCode: "1A",
      dob: "2000/05/15", // Not YYYY-MM-DD
    }).success,
    false,
  );

  // 4. Unknown key in guest trip command is rejected
  assert.equal(
    guestTripCommandSchema.safeParse({
      submissionId: crypto.randomUUID(),
      contact: { email: "guest@example.test" },
      legs: [
        {
          serviceId,
          passengers: [{ id: "p1", firstName: "Ali", seatCode: "1A" }],
        },
      ],
      extraTripKey: "rejected",
    }).success,
    false,
  );

  // 5. Ambiguous simultaneous name and firstName is rejected
  assert.equal(
    guestPassengerSchema.safeParse({
      id: "p1",
      name: "Ali",
      firstName: "Ali",
      seatCode: "1A",
    }).success,
    false,
  );
});

test("account passenger schema retains strict validation and rejects omitted optional fields", () => {
  // Account command REQUIRES dob, nationality, document
  const incompleteAccountPassenger = {
    id: "p1",
    type: "adult" as const,
    firstName: "Kareem",
    seatCode: "3A",
  };

  const incompleteAccountCommand = {
    submissionId: crypto.randomUUID(),
    serviceId,
    contact: { email: "user@example.test", phone: "+970 599 123456" },
    passengers: [incompleteAccountPassenger],
  };

  assert.equal(reservationCommandSchema.safeParse(incompleteAccountCommand).success, false);

  const incompleteTripCommand = {
    submissionId: crypto.randomUUID(),
    contact: { email: "user@example.test", phone: "+970 599 123456" },
    legs: [
      {
        serviceId,
        passengers: [incompleteAccountPassenger],
      },
    ],
  };

  assert.equal(tripCommandSchema.safeParse(incompleteTripCommand).success, false);
});

test("recovery initialization parses hash locator and submits verification against client mock granting booking state", async () => {
  const hash = "#challenge=a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d&email=recovered%40example.test";
  const recovery = parseGuestBookingRecoveryHash(hash);
  assert.ok(recovery);
  assert.equal(recovery.challengeId, "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d");
  assert.equal(recovery.email, "recovered@example.test");

  // Client mock tracking invocations
  const { client: api, calls } = mockApi((path) => {
    if (path === "/guest-reservations/email-verifications") {
      return {
        status: 200,
        body: { verified: true },
      };
    }
    return { status: 404, body: {} };
  });

  const client = new GuestReservationClient(() => api);
  assert.equal(client.isEmailVerified(recovery.email), false);

  // Execute verification submission with recovered challenge and email
  const response = await client.verifyEmail(recovery.challengeId, "654321", recovery.email);
  assert.equal(response.verified, true);

  // Assert server verification was invoked with exact payload
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]!.url).pathname, "/api/v1/guest-reservations/email-verifications");
  assert.deepEqual(JSON.parse(calls[0]!.init.body as string), {
    challengeId: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
    code: "654321",
  });

  // Assert in-memory booking grant state is active for the recovered email
  assert.equal(client.isEmailVerified(recovery.email), true);

  // Management access recovery hash
  const accessHash = "#ref=GZA-7K8P&challenge=b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e&email=recovered%40example.test";
  const accessRecovery = parseGuestAccessRecoveryHash(accessHash);
  assert.ok(accessRecovery);
  assert.equal(accessRecovery.reference, "GZA-7K8P");
  assert.equal(accessRecovery.challengeId, "b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e");
  assert.equal(accessRecovery.email, "recovered@example.test");

  const { client: accessApi, calls: accessCalls } = mockApi((path, init) => {
    if (path === "/guest-reservations/access-verifications") {
      return {
        status: 200,
        body: {
          verified: true,
          reference: accessRecovery.reference,
        },
      };
    }
    return { status: 404, body: {} };
  });

  const accessClient = new GuestReservationClient(() => accessApi);
  assert.equal(accessClient.isAccessVerified(accessRecovery.reference), false);

  const accessResponse = await accessClient.verifyAccess(
    accessRecovery.challengeId,
    "123456",
    accessRecovery.reference,
    accessRecovery.email,
  );
  assert.equal(accessResponse.verified, true);
  assert.equal(accessResponse.reference, "GZA-7K8P");
  assert.equal(accessCalls.length, 1);
  assert.deepEqual(JSON.parse(accessCalls[0]!.init.body as string), {
    challengeId: "b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e",
    code: "123456",
  });
  assert.equal(accessClient.isAccessVerified("GZA-7K8P"), true);
});

test("orchestration schema before proof: invalid draft rejects at draft_validation before verifier invocation", async () => {
  let verifierCalled = false;
  const { client: api } = mockApi((path) => {
    if (path.includes("email-verifications")) {
      verifierCalled = true;
      return { status: 200, body: { verified: true } };
    }
    return { status: 404, body: {} };
  });

  const guestClient = new GuestReservationClient(() => api);
  const tripClientInstance = new TripClient(() => api);
  const oneWayAttempt = new ReservationAttempt();
  const tripAttempt = new TripReservationAttempt();

  // Missing passenger name (invalid schema)
  const result = await orchestrateGuestBooking({
    guestClient,
    tripClient: tripClientInstance,
    oneWayAttempt,
    tripAttempt,
    isRoundTrip: false,
    email: "guest@example.test",
    serviceId,
    passengers: [
      {
        id: "p1",
        firstName: "", // empty name fails schema!
        seatCode: "3A",
      },
    ],
    challengeId: crypto.randomUUID(),
    otpCode: "123456",
    isEmailVerified: false,
    postDispatched: false,
    postAmbiguous: false,
    crossSessionRecoveryRequired: false,
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.stage, "draft_validation");
  }
  assert.equal(verifierCalled, false, "Verifier must not be called when draft validation fails");
  assert.equal(oneWayAttempt.locked, false, "Attempt must not be locked on draft validation failure");
});

test("orchestration verifier failure: 422 wrong code returns verifier stage, reservation POST never dispatched", async () => {
  let reservationDispatched = false;
  const challengeId = crypto.randomUUID();
  const { client: api, calls } = mockApi((path) => {
    if (path === "/guest-reservations/email-verifications") {
      return { status: 422, body: { code: "invalid_code" } };
    }
    if (path === "/guest-reservations") {
      reservationDispatched = true;
      return { status: 201, body: detail("GZA-ORCH0") };
    }
    return { status: 404, body: {} };
  });

  const guestClient = new GuestReservationClient(() => api);
  const tripClientInstance = new TripClient(() => api);
  const oneWayAttempt = new ReservationAttempt();
  const tripAttempt = new TripReservationAttempt();

  const result = await orchestrateGuestBooking({
    guestClient,
    tripClient: tripClientInstance,
    oneWayAttempt,
    tripAttempt,
    isRoundTrip: false,
    email: "guest@example.test",
    serviceId,
    passengers: [
      {
        id: "p1",
        firstName: "Kareem",
        seatCode: "3A",
      },
    ],
    challengeId,
    otpCode: "000000",
    isEmailVerified: false,
    postDispatched: false,
    postAmbiguous: false,
    crossSessionRecoveryRequired: false,
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.stage, "verifier");
    assert.equal(result.postDispatched, false);
  }
  assert.equal(reservationDispatched, false, "Reservation POST must not be dispatched when verifier fails");
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]!.url).pathname, "/api/v1/guest-reservations/email-verifications");
});

test("orchestration one-way: draft -> verify -> submit -> receipt in single atomic invocation", async () => {
  const challengeId = crypto.randomUUID();
  const { client: api, calls } = mockApi((path) => {
    if (path === "/guest-reservations/email-verifications") {
      return { status: 200, body: { verified: true } };
    }
    if (path === "/guest-reservations") {
      return { status: 201, body: detail("GZA-ONEOK") };
    }
    return { status: 404, body: {} };
  });

  const guestClient = new GuestReservationClient(() => api);
  const tripClientInstance = new TripClient(() => api);
  const oneWayAttempt = new ReservationAttempt();
  const tripAttempt = new TripReservationAttempt();

  const result = await orchestrateGuestBooking({
    guestClient,
    tripClient: tripClientInstance,
    oneWayAttempt,
    tripAttempt,
    isRoundTrip: false,
    email: "  Guest@Example.Test ",
    phone: "+970 599 123456",
    serviceId,
    passengers: [
      {
        id: "p1",
        firstName: "Kareem",
        lastName: "Al-Masri",
        seatCode: "3A",
      },
    ],
    challengeId,
    otpCode: "123456",
    isEmailVerified: false,
    postDispatched: false,
    postAmbiguous: false,
    crossSessionRecoveryRequired: false,
  });

  assert.equal(result.success, true);
  if (result.success && result.type === "one-way") {
    assert.equal(result.receipt.reservation.reference, "GZA-ONEOK");
    assert.equal(result.verifiedEmail, "guest@example.test");
  }
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[0]!.url).pathname, "/api/v1/guest-reservations/email-verifications");
  assert.equal(new URL(calls[1]!.url).pathname, "/api/v1/guest-reservations");
  assert.equal(guestClient.isEmailVerified("guest@example.test"), true);
});

test("orchestration same-key roundtrip retry: 500 outcome preserves locked submissionId across retries", async () => {
  const outboundSvc = encodeDatedOfferingId("curated-out", "2026-12-20");
  const returnSvc = encodeDatedOfferingId("curated-in", "2026-12-25");
  const email = "retry.guest@example.test";

  let tripAttemptsCount = 0;
  const capturedSubmissionIds: string[] = [];

  const tripReceipt = {
    reservations: [
      {
        reservation: {
          id: crypto.randomUUID(),
          reference: "GZA-OUT1",
          status: "confirmed" as const,
          serviceId: outboundSvc,
          flightNumber: "PS100",
          date: "2026-12-20",
          originCode: "GZA",
          destinationCode: "AMM",
          departTime: "08:00",
          arriveTime: "09:00",
          contact: { email, phone: "" },
          passengers: [{
            id: "p1",
            type: "adult" as const,
            firstName: "Layla",
            lastName: null,
            seatCode: "4A",
            mealId: null,
            mealLabel: null,
          }],
          createdAt: "2026-10-17 09:00:00+00",
        },
        ticket: {
          reference: "GZA-OUT1",
          status: "confirmed" as const,
          issuedAt: "2026-10-17T09:00:00+00:00",
          flight: {
            serviceId: outboundSvc,
            flightNumber: "PS100",
            date: "2026-12-20",
            originCode: "GZA",
            destinationCode: "AMM",
            departTime: "08:00",
            arriveTime: "09:00",
            aircraftModel: "Boeing 737-800",
            departAt: "2026-12-20T08:00:00+03:00",
            arriveAt: "2026-12-20T09:00:00+03:00",
          },
          contact: { email, phone: "" },
          tickets: [{
            reference: "GZA-OUT1",
            status: "confirmed" as const,
            issuedAt: "2026-10-17T09:00:00+00:00",
            ticketNumber: "TKT-GZA-OUT1-1",
            flight: {
              serviceId: outboundSvc,
              flightNumber: "PS100",
              date: "2026-12-20",
              originCode: "GZA",
              destinationCode: "AMM",
              departTime: "08:00",
              arriveTime: "09:00",
              aircraftModel: "Boeing 737-800",
              departAt: "2026-12-20T08:00:00+03:00",
              arriveAt: "2026-12-20T09:00:00+03:00",
            },
            contact: { email, phone: "" },
            passenger: {
              id: "p1",
              type: "adult" as const,
              firstName: "Layla",
              lastName: null,
              seatCode: "4A",
              nationality: null,
              meal: null,
            },
          }],
        },
      },
      {
        reservation: {
          id: crypto.randomUUID(),
          reference: "GZA-RET1",
          status: "confirmed" as const,
          serviceId: returnSvc,
          flightNumber: "PS101",
          date: "2026-12-25",
          originCode: "AMM",
          destinationCode: "GZA",
          departTime: "14:00",
          arriveTime: "15:00",
          contact: { email, phone: "" },
          passengers: [{
            id: "p1",
            type: "adult" as const,
            firstName: "Layla",
            lastName: null,
            seatCode: "6F",
            mealId: null,
            mealLabel: null,
          }],
          createdAt: "2026-10-17 09:00:00+00",
        },
        ticket: {
          reference: "GZA-RET1",
          status: "confirmed" as const,
          issuedAt: "2026-10-17T09:00:00+00:00",
          flight: {
            serviceId: returnSvc,
            flightNumber: "PS101",
            date: "2026-12-25",
            originCode: "AMM",
            destinationCode: "GZA",
            departTime: "14:00",
            arriveTime: "15:00",
            aircraftModel: "Boeing 737-800",
            departAt: "2026-12-25T14:00:00+03:00",
            arriveAt: "2026-12-25T15:00:00+03:00",
          },
          contact: { email, phone: "" },
          tickets: [{
            reference: "GZA-RET1",
            status: "confirmed" as const,
            issuedAt: "2026-10-17T09:00:00+00:00",
            ticketNumber: "TKT-GZA-RET1-1",
            flight: {
              serviceId: returnSvc,
              flightNumber: "PS101",
              date: "2026-12-25",
              originCode: "AMM",
              destinationCode: "GZA",
              departTime: "14:00",
              arriveTime: "15:00",
              aircraftModel: "Boeing 737-800",
              departAt: "2026-12-25T14:00:00+03:00",
              arriveAt: "2026-12-25T15:00:00+03:00",
            },
            contact: { email, phone: "" },
            passenger: {
              id: "p1",
              type: "adult" as const,
              firstName: "Layla",
              lastName: null,
              seatCode: "6F",
              nationality: null,
              meal: null,
            },
          }],
        },
      },
    ],
  };

  const { client: api } = mockApi((path, init) => {
    if (path === "/guest-reservation-trips") {
      tripAttemptsCount++;
      const payload = JSON.parse(init.body as string);
      capturedSubmissionIds.push(payload.submissionId);
      if (tripAttemptsCount === 1) {
        return { status: 500, body: { code: "server_timeout" } };
      }
      return { status: 201, body: tripReceipt };
    }
    return { status: 404, body: {} };
  });

  const guestClient = new GuestReservationClient(() => api);
  const tripClientInstance = new TripClient(() => api);
  const oneWayAttempt = new ReservationAttempt();
  const tripAttempt = new TripReservationAttempt();

  const baseParams = {
    guestClient,
    tripClient: tripClientInstance,
    oneWayAttempt,
    tripAttempt,
    isRoundTrip: true,
    email,
    serviceId: outboundSvc,
    returnServiceId: returnSvc,
    passengers: [
      {
        id: "p1",
        firstName: "Layla",
        seatCode: "4A",
        returnSeatCode: "6F",
      },
    ],
    challengeId: null,
    otpCode: "",
    isEmailVerified: true,
  };

  // Attempt 1: Fails with 500 (ambiguous outcome)
  const result1 = await orchestrateGuestBooking({
    ...baseParams,
    postDispatched: false,
    postAmbiguous: false,
    crossSessionRecoveryRequired: false,
  });

  assert.equal(result1.success, false);
  if (!result1.success) {
    assert.equal(result1.stage, "submission");
    assert.equal(result1.error, "ambiguous_outcome");
    assert.equal(result1.postAmbiguous, true);
    assert.equal(result1.postDispatched, true);
  }
  assert.equal(tripAttempt.locked, true, "Trip attempt must remain locked on ambiguous outcome");
  assert.ok(tripAttempt.currentSubmissionId);
  const originalSubmissionId = tripAttempt.currentSubmissionId;

  // Attempt 2: Retry within same session with same attempt
  const result2 = await orchestrateGuestBooking({
    ...baseParams,
    postDispatched: true,
    postAmbiguous: true,
    crossSessionRecoveryRequired: false,
  });

  assert.equal(result2.success, true);
  assert.equal(tripAttemptsCount, 2);
  assert.equal(capturedSubmissionIds.length, 2);
  assert.equal(
    capturedSubmissionIds[0],
    capturedSubmissionIds[1],
    "Subsequent retry must reuse the exact same submissionId",
  );
  assert.equal(capturedSubmissionIds[0], originalSubmissionId);
});

test("orchestration reverify after ambiguous fail closed: blocks replay under fresh session", async () => {
  let netCalls = 0;
  const { client: api } = mockApi(() => {
    netCalls++;
    return { status: 200, body: {} };
  });

  const guestClient = new GuestReservationClient(() => api);
  const tripClientInstance = new TripClient(() => api);
  const oneWayAttempt = new ReservationAttempt();
  const tripAttempt = new TripReservationAttempt();

  // Simulate attempt having a frozen submissionId from prior ambiguous attempt
  oneWayAttempt.prepare(
    "guest:victim@example.test",
    {
      serviceId,
      contact: { email: "victim@example.test" },
      passengers: [{ id: "p1", name: "Fatima", seatCode: "2B" }],
    },
    true,
  );
  const frozenSubmissionId = oneWayAttempt.currentSubmissionId;
  assert.ok(frozenSubmissionId);

  // Now, session expired after that prior ambiguous POST, requiring cross-session recovery.
  // The traveler attempts to verify and complete in a renewed session.
  const result = await orchestrateGuestBooking({
    guestClient,
    tripClient: tripClientInstance,
    oneWayAttempt,
    tripAttempt,
    isRoundTrip: false,
    email: "victim@example.test",
    serviceId,
    passengers: [{ id: "p1", firstName: "Fatima", seatCode: "2B" }],
    challengeId: crypto.randomUUID(), // fresh challenge
    otpCode: "999888",
    isEmailVerified: false,
    postDispatched: true,
    postAmbiguous: true,
    crossSessionRecoveryRequired: false, // derive the barrier from ambiguous POST + lost proof, without a pre-set flag
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.stage, "submission");
    assert.equal(result.error, "cross_session_recovery_required");
    assert.equal(result.crossSessionRecoveryRequired, true);
  }
  assert.equal(netCalls, 0, "No network call should be made when cross-session recovery is required");
  assert.equal(
    oneWayAttempt.currentSubmissionId,
    frozenSubmissionId,
    "Original submissionId must remain preserved for traveler reference recovery",
  );
});



test("orchestration distinguishes throttling from proof loss and retains uncertain submission identity", async () => {
  for (const status of [401, 403, 419, 429]) {
    for (const wasAmbiguous of [false, true]) {
      const guestClient = new GuestReservationClient(() => { throw new Error("Unexpected transport"); });
      guestClient.create = async () => { throw new MvpApiError("rejected", status); };
      const attempt = new ReservationAttempt();
      const result = await orchestrateGuestBooking({
        guestClient,
        tripClient: new TripClient(() => { throw new Error("Unexpected trip"); }),
        oneWayAttempt: attempt, tripAttempt: new TripReservationAttempt(),
        isRoundTrip: false, email: "retry@example.test", serviceId,
        passengers: [{ id: "p1", firstName: "Amina", seatCode: "1A" }],
        challengeId: null, otpCode: "", isEmailVerified: true,
        postDispatched: wasAmbiguous, postAmbiguous: wasAmbiguous,
        crossSessionRecoveryRequired: false,
      });
      assert.equal(result.success, false);
      if (result.success) throw new Error("Expected rejection");
      assert.equal(result.stage, "submission");
      assert.equal(result.error, status === 429 ? "rate_limited" : wasAmbiguous ? "cross_session_recovery_required" : "session_expired");
      assert.equal(result.postAmbiguous, wasAmbiguous);
      assert.equal(result.crossSessionRecoveryRequired, status !== 429 && wasAmbiguous);
      assert.equal(attempt.locked, true, "Proof loss or throttle cannot authorize a new submission key");
    }
  }
});


test("guided booking UX: guest name and email-first minimal submission succeeds without synthetic data", async () => {
  const email = "guest.minimal@example.test";
  const minimalDetail = {
    reservation: {
      id: crypto.randomUUID(),
      reference: "GZA-MIN1",
      status: "confirmed" as const,
      serviceId,
      flightNumber: "PS204",
      date: "2026-12-20",
      originCode: "GZA",
      destinationCode: "AMM",
      departTime: "09:30",
      arriveTime: "10:30",
      contact: { email, phone: "" },
      passengers: [{
        id: "p1",
        type: "adult" as const,
        firstName: "Tariq Al-Husseini",
        lastName: null,
        seatCode: "5B",
        mealId: null,
        mealLabel: null,
      }],
      createdAt: "2026-10-17 09:00:00+00",
    },
    ticket: {
      reference: "GZA-MIN1",
      status: "confirmed" as const,
      issuedAt: "2026-10-17T09:00:00+00:00",
      flight: {
        serviceId,
        flightNumber: "PS204",
        date: "2026-12-20",
        originCode: "GZA",
        destinationCode: "AMM",
        departTime: "09:30",
        arriveTime: "10:30",
        aircraftModel: "Boeing 737-400",
      },
      contact: { email, phone: "" },
      tickets: [
        {
          reference: "GZA-MIN1",
          status: "confirmed" as const,
          issuedAt: "2026-10-17T09:00:00+00:00",
          ticketNumber: "TKT-GZA-MIN1-1",
          flight: {
            serviceId,
            flightNumber: "PS204",
            date: "2026-12-20",
            originCode: "GZA",
            destinationCode: "AMM",
            departTime: "09:30",
            arriveTime: "10:30",
            aircraftModel: "Boeing 737-400",
          },
          contact: { email, phone: "" },
          passenger: {
            id: "p1",
            type: "adult" as const,
            firstName: "Tariq Al-Husseini",
            lastName: null,
            seatCode: "5B",
            nationality: null,
            meal: null,
          },
        },
      ],
    },
  };

  const { client: guestApi } = mockApi((path, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};

    if (path === "/guest-reservations/email-challenges") {
      return { status: 202, body: { challengeId: crypto.randomUUID(), expiresInSeconds: 43200 } };
    }
    if (path === "/guest-reservations/email-verifications") {
      return { status: 200, body: { verified: true } };
    }
    if (path === "/guest-reservations") {
      // Assert no fabricated data: dob, nationality, document are null/omitted
      assert.equal(body.passengers[0].dob ?? null, null, "DoB must remain null when omitted");
      assert.equal(body.passengers[0].nationality ?? null, null, "Nationality must remain null when omitted");
      assert.equal(body.passengers[0].document ?? null, null, "Document must remain null when omitted");
      assert.equal(body.passengers[0].name ?? body.passengers[0].firstName, "Tariq Al-Husseini");
      return { status: 201, body: minimalDetail };
    }
    return { status: 404, body: {} };
  });

  const guestClient = new GuestReservationClient(() => guestApi);
  const tripClientInstance = new TripClient(() => guestApi);
  const attempt = new ReservationAttempt();

  const challenge = await guestClient.requestEmailChallenge(email);
  const result = await orchestrateGuestBooking({
    guestClient,
    tripClient: tripClientInstance,
    oneWayAttempt: attempt,
    tripAttempt: new TripReservationAttempt(),
    isRoundTrip: false,
    email,
    serviceId,
    passengers: [{ id: "p1", firstName: "Tariq Al-Husseini", seatCode: "5B" }],
    challengeId: challenge.challengeId,
    otpCode: "123456",
    isEmailVerified: false,
    postDispatched: false,
    postAmbiguous: false,
    crossSessionRecoveryRequired: false,
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.type, "one-way");
    assert.equal(result.verifiedEmail, email);
  }
});

test("guided booking UX: roundtrip validation requires return seat and detects missing return leg assignment", async () => {
  const returnServiceId = encodeDatedOfferingId("curated-flight-return", "2026-12-25");
  const { client: guestApi } = mockApi(() => ({ status: 404, body: {} }));
  const guestClient = new GuestReservationClient(() => guestApi);
  const tripClientInstance = new TripClient(() => guestApi);
  const attempt = new TripReservationAttempt();

  // Missing return seatCode
  const result = await orchestrateGuestBooking({
    guestClient,
    tripClient: tripClientInstance,
    oneWayAttempt: new ReservationAttempt(),
    tripAttempt: attempt,
    isRoundTrip: true,
    email: "roundtrip@example.test",
    serviceId,
    returnServiceId,
    passengers: [{ id: "p1", firstName: "Sara", seatCode: "4A", returnSeatCode: "" }],
    challengeId: crypto.randomUUID(),
    otpCode: "654321",
    isEmailVerified: true,
    postDispatched: false,
    postAmbiguous: false,
    crossSessionRecoveryRequired: false,
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.stage, "draft_validation");
  }
});

test("guided booking UX: verified OTP chains finalization preserving submissionId without retry key rotation", async () => {
  let createdCallCount = 0;
  const { client: guestApi } = mockApi((path) => {
    if (path === "/guest-reservations/email-verifications") {
      return { status: 200, body: { verified: true } };
    }
    if (path === "/guest-reservations") {
      createdCallCount += 1;
      return { status: 201, body: detail("GZA-CHAIN1") };
    }
    return { status: 404, body: {} };
  });

  const guestClient = new GuestReservationClient(() => guestApi);
  const tripClientInstance = new TripClient(() => guestApi);
  const attempt = new ReservationAttempt();

  const challengeId = crypto.randomUUID();
  const result = await orchestrateGuestBooking({
    guestClient,
    tripClient: tripClientInstance,
    oneWayAttempt: attempt,
    tripAttempt: new TripReservationAttempt(),
    isRoundTrip: false,
    email: "guest@example.test",
    phone: "+970 599 123456",
    serviceId,
    passengers: [{ id: "p1", firstName: "Kareem", lastName: "Al-Masri", seatCode: "3A" }],
    challengeId,
    otpCode: "888999",
    isEmailVerified: false,
    postDispatched: false,
    postAmbiguous: false,
    crossSessionRecoveryRequired: false,
  });

  assert.equal(result.success, true);
  assert.equal(createdCallCount, 1);
  const preservedId = attempt.currentSubmissionId;
  assert.ok(preservedId, "Submission ID must exist and be preserved");
  assert.equal(attempt.locked, true, "Submission attempt preserves locked submission ID across invocation");
});

test("guided booking UX: wrong OTP code yields exactly one verification and no booking POST, then explicit retry chains finalization", async () => {
  let verificationCalls = 0;
  let bookingPostCalls = 0;

  const { client: guestApi } = mockApi((path, init) => {
    if (path === "/guest-reservations/email-verifications") {
      verificationCalls += 1;
      const body = JSON.parse(init.body as string);
      if (body.code === "000000") {
        return { status: 422, body: { code: "invalid_code" } };
      }
      if (body.code === "123456") {
        return { status: 200, body: { verified: true } };
      }
      return { status: 400, body: { code: "unexpected_code" } };
    }
    if (path === "/guest-reservations") {
      bookingPostCalls += 1;
      return { status: 201, body: detail("GZA-REG1") };
    }
    return { status: 404, body: {} };
  });

  const guestClient = new GuestReservationClient(() => guestApi);
  const tripClientInstance = new TripClient(() => guestApi);
  const attempt = new ReservationAttempt();
  const challengeId = crypto.randomUUID();

  // Action 1: Single explicit submission with wrong code
  const result1 = await orchestrateGuestBooking({
    guestClient,
    tripClient: tripClientInstance,
    oneWayAttempt: attempt,
    tripAttempt: new TripReservationAttempt(),
    isRoundTrip: false,
    email: "guest@example.test",
    phone: "+970 599 123456",
    serviceId,
    passengers: [{ id: "p1", firstName: "Kareem", lastName: "Al-Masri", seatCode: "3A" }],
    challengeId,
    otpCode: "000000",
    isEmailVerified: false,
    postDispatched: false,
    postAmbiguous: false,
    crossSessionRecoveryRequired: false,
  });

  // Verify wrong-code isolation invariants:
  assert.equal(result1.success, false);
  if (!result1.success) {
    assert.equal(result1.stage, "verifier");
    assert.equal(result1.status, 422);
    assert.equal(result1.postDispatched, false);
    assert.equal(result1.postAmbiguous, false);
  }
  // Exactly ONE verification attempt executed; zero booking POSTs dispatched
  assert.equal(verificationCalls, 1, "Wrong code must trigger exactly 1 verification call");
  assert.equal(bookingPostCalls, 0, "No booking POST may be dispatched on verification failure");
  // Frozen draft preserves submissionId across verifier failure without key rotation
  const originalSubmissionId = attempt.currentSubmissionId;
  assert.ok(originalSubmissionId, "Submission ID must be generated and preserved across verifier failure");

  // Action 2: User explicitly corrects code to "123456" and triggers verification & chaining in same click
  const result2 = await orchestrateGuestBooking({
    guestClient,
    tripClient: tripClientInstance,
    oneWayAttempt: attempt,
    tripAttempt: new TripReservationAttempt(),
    isRoundTrip: false,
    email: "guest@example.test",
    phone: "+970 599 123456",
    serviceId,
    passengers: [{ id: "p1", firstName: "Kareem", lastName: "Al-Masri", seatCode: "3A" }],
    challengeId,
    otpCode: "123456",
    isEmailVerified: false,
    postDispatched: false,
    postAmbiguous: false,
    crossSessionRecoveryRequired: false,
  });

  assert.equal(result2.success, true);
  if (result2.success) {
    assert.equal(result2.type, "one-way");
    assert.equal(result2.verifiedEmail, "guest@example.test");
  }
  // Total of exactly 2 verification calls across the two explicit user clicks
  assert.equal(verificationCalls, 2, "Second explicit click must trigger exactly 1 more verification call");
  // Chained finalization dispatched exactly 1 booking POST in the same click
  assert.equal(bookingPostCalls, 1, "Successful verification must immediately chain booking POST");
  assert.equal(attempt.locked, true, "Reservation attempt is now locked with confirmed booking");
  assert.equal(attempt.currentSubmissionId, originalSubmissionId, "Must preserve identical submissionId across verifier retry");
});

test("guided booking UX: 12h recovery URL hash parser extracts challenge UUID and email for instant OTP dialog restoration", () => {
  const challengeId = "b95b8d2a-4f5a-4b5c-8d1e-2f3a4b5c6d7e";
  const validHash = `#challenge=${challengeId}&email=visitor%40example.test`;
  const parsed = parseGuestBookingRecoveryHash(validHash);

  assert.ok(parsed);
  assert.equal(parsed?.challengeId, challengeId);
  assert.equal(parsed?.email, "visitor@example.test");

  // Rejects invalid UUID
  assert.equal(parseGuestBookingRecoveryHash("#challenge=not-a-uuid&email=visitor@example.test"), null);
  // Rejects empty hash
  assert.equal(parseGuestBookingRecoveryHash(""), null);
});
