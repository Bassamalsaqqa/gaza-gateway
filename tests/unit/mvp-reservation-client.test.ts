import assert from "node:assert/strict";
import { test } from "node:test";
import { ReservationAttempt } from "../../src/lib/reservations/attempt.ts";
import { ReservationClient, reservationCommandSchema, reservationDetailSchema, adminReservationDetailSchema, occupancySchema } from "../../src/lib/reservations/client.ts";
import { createMvpApiClient, MvpApiError } from "../../src/lib/api/mvp-client.ts";
import { encodeDatedOfferingId } from "../../src/lib/offerings/codec.ts";

const serviceId = encodeDatedOfferingId("curated-flight", "2026-12-20");
const contact = { email: "amina@example.test", phone: "" };
const passenger = { id: "p1", type: "adult" as const, firstName: "Amina", lastName: "", dob: "1990-01-01", nationality: "Palestinian", document: "test-document", seatCode: "1A", mealId: null };
const input = { serviceId, contact, passengers: [passenger] };
const command = () => ({ ...structuredClone(input), submissionId: crypto.randomUUID() });
function detail() {
  const reference = "GZA-TEST";
  const flight = { serviceId, flightNumber: "PS100", date: "2026-12-20", originCode: "GZA", destinationCode: "AMM", departTime: "08:00", arriveTime: "09:00", aircraftModel: "Boeing 737-800" };
  const person = { id: "p1", type: "adult", firstName: "Amina", lastName: "", seatCode: "1A", mealId: null, mealLabel: null };
  return { reservation: { id: "5695dacf-993d-4e63-ac19-99671f2e4bcd", reference, status: "confirmed", serviceId, flightNumber: flight.flightNumber, date: flight.date,
    originCode: flight.originCode, destinationCode: flight.destinationCode, departTime: flight.departTime, arriveTime: flight.arriveTime, contact, passengers: [person], createdAt: "2026-10-11 19:05:40+00" },
  ticket: { reference, status: "confirmed", issuedAt: "2026-10-11T19:05:40+00:00", flight, contact,
    tickets: [{ reference, status: "confirmed", issuedAt: "2026-10-11T19:05:40+00:00", ticketNumber: "TKT-GZA-TEST-1", flight, contact,
      passenger: { id: "p1", type: "adult", firstName: "Amina", lastName: "", seatCode: "1A", nationality: "Palestinian", meal: null } }] } };
}

test("uncertain confirmations retain immutable submission and owner, definitive conflict unlocks", () => {
  const attempt = new ReservationAttempt(); const first = attempt.prepare(contact.email, input);
  first.passengers[0]!.seatCode = "2B";
  for (const status of [undefined, 500, 503]) {
    attempt.rejected(status);
    const retry = attempt.prepare(contact.email, { ...input, passengers: [{ ...passenger, seatCode: "3C" }] });
    assert.equal(retry.submissionId, first.submissionId); assert.equal(retry.passengers[0]?.seatCode, "1A");
    assert.throws(() => attempt.prepare("other@example.test", input));
  }
  attempt.rejected(409); assert.equal(attempt.locked, false);
  assert.notEqual(attempt.prepare(contact.email, input).submissionId, first.submissionId);
});

test("commands reject price injection, duplicate seats, invalid ages and impossible dates", () => {
  assert.equal(reservationCommandSchema.safeParse(command()).success, true);
  const c = command();
  for (const invalid of [{ ...c, price: 0 }, { ...c, passengers: [passenger, { ...passenger, id: "p2" }] },
    { ...c, passengers: [{ ...passenger, dob: "2026-02-30" }] }, { ...c, passengers: [{ ...passenger, dob: "2020-01-01" }] }])
    assert.equal(reservationCommandSchema.safeParse(invalid).success, false);
});

test("command normalization matches server trimming and rejects invalid phone or excessive age", () => {
  const c = command(); c.contact.phone = " +970 599 123456 "; c.passengers[0]!.firstName = " Amina ";
  const parsed = reservationCommandSchema.parse(c);
  assert.equal(parsed.contact.phone, "+970 599 123456"); assert.equal(parsed.passengers[0]?.firstName, "Amina");
  c.contact.phone = "not-a-phone"; assert.equal(reservationCommandSchema.safeParse(c).success, false);
  c.contact.phone = ""; c.passengers[0]!.dob = "1800-01-01"; assert.equal(reservationCommandSchema.safeParse(c).success, false);
});

test("ticket snapshots reject mismatched contact, flight, passenger and duplicate ticket identities", () => {
  assert.equal(reservationDetailSchema.safeParse(detail()).success, true);
  for (const mutate of [
    (d: ReturnType<typeof detail>) => { d.ticket.contact = { ...contact, email: "other@example.test" }; },
    (d: ReturnType<typeof detail>) => { d.ticket.flight = { ...d.ticket.flight, originCode: "DOH" }; },
    (d: ReturnType<typeof detail>) => { d.ticket.tickets[0]!.passenger.firstName = "Someone else"; },
    (d: ReturnType<typeof detail>) => { d.reservation.passengers.push({ ...d.reservation.passengers[0]!, id: "p2", seatCode: "1B" }); d.ticket.tickets.push(structuredClone(d.ticket.tickets[0]!)); },
  ]) { const d = detail(); mutate(d); assert.equal(reservationDetailSchema.safeParse(d).success, false); }
});

test("occupancy rejects unknown geometry fields and non-existent seats", () => {
  const layout = { aircraftId: "ac-b738-1", rows: 2, letters: ["A", "B", "C", "D", "E", "F"], aisleAfter: 3,
    zones: [{ id: "economy", firstRow: 1, lastRow: 2 }], extraLegroomRows: [], unavailable: [] };
  assert.equal(occupancySchema.safeParse({ serviceId, layout, occupiedSeats: ["1A"] }).success, true);
  assert.equal(occupancySchema.safeParse({ serviceId, layout: { ...layout, capacity: 99 }, occupiedSeats: [] }).success, false);
  assert.equal(occupancySchema.safeParse({ serviceId, layout, occupiedSeats: ["3A"] }).success, false);
});

test("staff detail admits only its closed owner/audit extension; passenger rejects it", () => {
  const d = detail();
  const staff = { ...d, reservation: { ...d.reservation, ownerUserId: crypto.randomUUID(),
    audits: [{ id: 1, actorType: "passenger", actorId: crypto.randomUUID(), action: "created", details: { submissionId: crypto.randomUUID() }, createdAt: "2026-10-11 19:05:40+00" }] } };
  assert.equal(adminReservationDetailSchema.safeParse(staff).success, true);
  assert.equal(reservationDetailSchema.safeParse(staff).success, false);
  staff.reservation.audits[0]!.action = "invented";
  assert.equal(adminReservationDetailSchema.safeParse(staff).success, false);
});

test("real transport uses passenger CSRF, accepts new/replayed receipts and rejects foreign snapshots", async () => {
  for (const status of [200, 201]) {
    const calls: RequestInit[] = []; let returned = detail();
    const api = createMvpApiClient({ enabled: true, nonProductionOptIn: true, environment: { MODE: "test" }, baseUrl: "https://127.0.0.1:18084",
      fetch: async (_url, init) => { calls.push(init!); const requestId = new Headers(init?.headers).get("x-request-id")!;
        return new Response(JSON.stringify({ success: true, data: returned, meta: { requestId, timestamp: "2026-10-11T00:00:00Z" } }),
          { status, headers: { "content-type": "application/json", "x-request-id": requestId } }); } },
    () => ({ getAuthCsrfBootstrap: async () => ({ csrfToken: "P".repeat(43) }), getStaffCsrfBootstrap: async () => { throw new Error("Wrong realm"); } }));
    const client = new ReservationClient(() => api);
    assert.equal((await client.create(command())).reservation.reference, "GZA-TEST");
    assert.equal(new Headers(calls[0]?.headers).get("x-csrf-token"), "P".repeat(43));
    returned = detail(); returned.reservation.contact = { ...contact, email: "foreign@example.test" }; returned.ticket.contact = returned.reservation.contact;
    returned.ticket.tickets[0]!.contact = returned.reservation.contact;
    await assert.rejects(client.create(command()), (e: unknown) => e instanceof MvpApiError && e.code === "protocol");
    await assert.rejects(client.detail("../unsafe"));
    assert.equal(calls.length, 2);
  }
});

test("staff projection accepts genuine guest ownership and bounded guest audit metadata", () => {
  const d = detail();
  const guest = { ...d, reservation: { ...d.reservation, ownerUserId: null,
    audits: [{ id: 1, actorType: "passenger", actorId: crypto.randomUUID(), action: "created",
      details: { submissionId: crypto.randomUUID(), guest: true }, createdAt: "2026-10-16T00:00:00Z" }] } };
  assert.equal(adminReservationDetailSchema.safeParse(guest).success, true);
  assert.equal(reservationDetailSchema.safeParse(guest).success, false);
  assert.equal(adminReservationDetailSchema.safeParse({ ...guest, reservation: { ...guest.reservation, ownerUserId: "" } }).success, false);
  const cancel = { ...guest, reservation: { ...guest.reservation, audits: [{ ...guest.reservation.audits[0], action: "cancelled", details: { actor: "guest" } }] } };
  assert.equal(adminReservationDetailSchema.safeParse(cancel).success, true);
  cancel.reservation.audits[0]!.details = { actor: "unknown" };
  assert.equal(adminReservationDetailSchema.safeParse(cancel).success, false);
});
