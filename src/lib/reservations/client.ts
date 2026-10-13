import { z } from "zod";
import type { MvpApiClient } from "../api/mvp-client.ts";
import { MvpApiError } from "../api/mvp-client.ts";
import { decodeDatedOfferingId, isValidISODate } from "../offerings/codec.ts";
import { offeringLayoutSchema, offeringTimingFields } from "../offerings/schema.ts";
import { seatExists } from "../fleet/layout.ts";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}(?![\s\S])/);
const ref = z.string().regex(/^[A-Za-z0-9_-]{6,16}(?![\s\S])/);
const service = z.string().refine(value => decodeDatedOfferingId(value) !== null);
const date = z.string().refine(isValidISODate);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?![\s\S])/);
const seat = z.string().regex(/^(?:[1-9]|[1-5][0-9]|60)[A-Z](?![\s\S])/);
const status = z.enum(["confirmed", "cancelled"]);
const label = z.object({ en: z.string(), ar: z.string() }).strict();
const meal = z.object({ id, label }).strict().nullable();
const contact = z.object({ email: z.string().email().max(254), phone: z.string().max(32) }).strict();
const commandContact = z.object({ email: z.string().trim().email().max(254), phone: z.string().trim().regex(/^(?:\+?[0-9 ()-]{5,32})?$/) }).strict();
const flight = z.object({ serviceId: service, flightNumber: z.string().min(1), date, direction: z.enum(["out", "in"]).optional(),
  originCode: z.string().regex(/^[A-Z]{3}$/), destinationCode: z.string().regex(/^[A-Z]{3}$/), departTime: time, arriveTime: time,
  durationMinutes: z.number().int().positive().optional(), aircraftModel: z.string().min(1), ...offeringTimingFields }).strict();
const passengerTicket = z.object({ ticketNumber: z.string().min(1), reference: ref, status, issuedAt: z.string().datetime({ offset: true }),
  passenger: z.object({ id, type: z.enum(["adult", "child"]), firstName: z.string(), lastName: z.string(), nationality: z.string(), seatCode: seat, meal }).strict(), flight, contact }).strict();
const ticket = z.object({ reference: ref, status, issuedAt: z.string().datetime({ offset: true }), flight,
  tickets: z.array(passengerTicket).min(1).max(9), contact }).strict();
export const reservationDetailSchema = z.object({ reservation: z.object({ id: z.string().uuid(), reference: ref, status, serviceId: service,
  flightNumber: z.string(), date, originCode: z.string(), destinationCode: z.string(), departTime: time, arriveTime: time, contact,
  passengers: z.array(z.object({ id, type: z.enum(["adult", "child"]), firstName: z.string(), lastName: z.string(), seatCode: seat,
    mealId: id.nullable(), mealLabel: label.nullable() }).strict()).min(1).max(9), createdAt: z.string().min(1) }).strict(), ticket }).strict().superRefine((data, ctx) => {
    const r = data.reservation, t = data.ticket;
    const matchingFlight = (f: z.infer<typeof flight>) => f.serviceId === r.serviceId && f.flightNumber === r.flightNumber
      && f.date === r.date && f.originCode === r.originCode && f.destinationCode === r.destinationCode
      && f.departTime === r.departTime && f.arriveTime === r.arriveTime;
    const matchingContact = (c: z.infer<typeof contact>) => c.email === r.contact.email && c.phone === r.contact.phone;
    if (!matchingFlight(t.flight) || !matchingContact(t.contact) || t.tickets.some(item => !matchingFlight(item.flight) || !matchingContact(item.contact))
      || r.reference !== t.reference || r.status !== t.status || r.serviceId !== t.flight.serviceId || t.tickets.length !== r.passengers.length
      || t.tickets.some(item => item.reference !== r.reference || item.status !== r.status || item.flight.serviceId !== r.serviceId
        || !r.passengers.some(p => p.id === item.passenger.id && p.seatCode === item.passenger.seatCode && p.type === item.passenger.type && p.firstName === item.passenger.firstName && p.lastName === item.passenger.lastName))
      || new Set(t.tickets.map(item => item.passenger.id)).size !== t.tickets.length
      || new Set(r.passengers.map(p => p.id)).size !== r.passengers.length || new Set(r.passengers.map(p => p.seatCode)).size !== r.passengers.length)
      ctx.addIssue({ code: "custom", message: "Reservation/ticket snapshot mismatch." });
  });
const audit = z.object({ id: z.number().int().positive(), actorType: z.enum(["passenger", "staff"]), actorId: z.string().uuid(),
  action: z.enum(["created", "cancelled"]), details: z.union([
    z.object({ submissionId: z.string().uuid() }).strict(), z.object({ actor: z.literal("owner") }).strict(),
    z.object({ role: z.enum(["admin", "editor", "viewer"]) }).strict(),
  ]), createdAt: z.string().min(1) }).strict();
export const adminReservationDetailSchema = z.object({
  reservation: reservationDetailSchema.innerType().shape.reservation.extend({ ownerUserId: z.string().uuid(), audits: z.array(audit) }), ticket,
}).strict().superRefine((data, ctx) => {
  const { ownerUserId: _owner, audits: _audits, ...reservation } = data.reservation;
  const checked = reservationDetailSchema.safeParse({ reservation, ticket: data.ticket });
  if (!checked.success) for (const issue of checked.error.issues) ctx.addIssue(issue);
});
const summaryFields = { id: z.string().uuid(), reference: ref, status, serviceId: service, flightNumber: z.string(), date,
  originCode: z.string(), destinationCode: z.string(), passengerCount: z.number().int().min(1).max(9), createdAt: z.string().min(1) };
const pagination = z.object({ page: z.number().int().positive(), limit: z.number().int().min(1).max(50), total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() }).strict();
const listSchema = z.object({ items: z.array(z.object(summaryFields).strict()), pagination }).strict();
const adminListSchema = z.object({ items: z.array(z.object({ ...summaryFields, ownerUserId: z.string().uuid(), contactEmail: z.string().email() }).strict()), pagination }).strict();
export const occupancySchema = z.object({ serviceId: service, layout: offeringLayoutSchema, occupiedSeats: z.array(seat) }).strict().superRefine((data, ctx) => {
  if (new Set(data.occupiedSeats).size !== data.occupiedSeats.length || data.occupiedSeats.some(code => !seatExists(data.layout, code)))
    ctx.addIssue({ code: "custom", message: "Invalid occupancy projection." });
});
export const reservationCommandSchema = z.object({ submissionId: z.string().uuid(), serviceId: service, contact: commandContact,
  passengers: z.array(z.object({ id, type: z.enum(["adult", "child"]), firstName: z.string().trim().max(120), lastName: z.string().trim().max(120), dob: date,
    nationality: z.string().trim().min(1).max(120), document: z.string().trim().min(1).max(120), seatCode: seat, mealId: id.nullable().optional() }).strict()).min(1).max(9),
}).strict().superRefine((command, ctx) => {
  const flightDate = decodeDatedOfferingId(command.serviceId)?.date;
  const invalidAge = flightDate && command.passengers.some(p => {
    const age = Number(flightDate.slice(0, 4)) - Number(p.dob.slice(0, 4)) - (flightDate.slice(5) < p.dob.slice(5) ? 1 : 0);
    return age > 120 || (p.type === "adult" ? age < 12 : age < 2 || age > 11);
  });
  if (!command.passengers.some(p => p.type === "adult") || command.passengers.some(p => !p.firstName.trim() && !p.lastName.trim())
    || invalidAge
    || new Set(command.passengers.map(p => p.id)).size !== command.passengers.length || new Set(command.passengers.map(p => p.seatCode)).size !== command.passengers.length)
    ctx.addIssue({ code: "custom", message: "Invalid passenger or seat assignments." });
});
export type ReservationCommand = z.infer<typeof reservationCommandSchema>;
export type ReservationDetail = z.infer<typeof reservationDetailSchema>;
export type Occupancy = z.infer<typeof occupancySchema>;
const cancellation = z.object({ reference: ref, status: z.literal("cancelled"), changed: z.boolean(), cancelledAt: z.string().nullable() }).strict();

/** No booking data or credentials are persisted in browser storage. */
export class ReservationClient {
  constructor(privateClient: () => MvpApiClient) { this.client = privateClient; }
  private readonly client: () => MvpApiClient;
  async occupancy(serviceId: string) {
    service.parse(serviceId);
    const data = await this.client().request({ method: "GET", path: `/offerings/${serviceId}/seats`, realm: "public", schema: occupancySchema });
    if (data.serviceId !== serviceId) throw new MvpApiError("protocol"); return data;
  }
  async create(command: ReservationCommand) {
    const body = reservationCommandSchema.parse(command);
    const data = await this.client().request({ method: "POST", path: "/reservations", realm: "passenger", body, statuses: [200, 201], schema: reservationDetailSchema });
    if (data.reservation.contact.email !== body.contact.email || data.reservation.contact.phone !== body.contact.phone
      || data.reservation.serviceId !== body.serviceId || data.reservation.passengers.length !== body.passengers.length
      || data.reservation.passengers.some(p => !body.passengers.some(item => item.id === p.id && item.seatCode === p.seatCode && item.type === p.type && item.firstName.trim() === p.firstName && item.lastName.trim() === p.lastName)))
      throw new MvpApiError("protocol");
    return data;
  }
  async detail(reference: string, staff = false) {
    ref.parse(reference);
    const data = await this.client().request({ method: "GET", path: `${staff ? "/admin" : ""}/reservations/${reference}`, realm: staff ? "staff" : "passenger", schema: staff ? adminReservationDetailSchema : reservationDetailSchema });
    if (data.reservation.reference !== reference) throw new MvpApiError("protocol"); return data;
  }
  list(page = 1) { this.page(page); return this.client().request({ method: "GET", path: `/reservations?page=${page}`, realm: "passenger", schema: listSchema }); }
  listAdmin(page = 1, search = "") {
    this.page(page); if (search.length > 100) throw new MvpApiError("invalid_request");
    return this.client().request({ method: "GET", path: `/admin/reservations?page=${page}&search=${encodeURIComponent(search).replace(/[!'()*]/g, value => "%" + value.charCodeAt(0).toString(16).toUpperCase())}`, realm: "staff", schema: adminListSchema });
  }
  async cancel(reference: string, staff = false) {
    ref.parse(reference);
    const data = await this.client().request({ method: "POST", path: `${staff ? "/admin" : ""}/reservations/${reference}/cancel`, realm: staff ? "staff" : "passenger", body: {}, schema: cancellation });
    if (data.reference !== reference) throw new MvpApiError("protocol"); return data;
  }
  private page(page: number) { if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) throw new MvpApiError("invalid_request"); }
}
