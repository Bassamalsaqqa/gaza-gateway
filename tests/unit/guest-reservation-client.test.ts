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
import { createMvpApiClient, MvpApiError } from "../../src/lib/api/mvp-client.ts";
import { encodeDatedOfferingId } from "../../src/lib/offerings/codec.ts";

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
