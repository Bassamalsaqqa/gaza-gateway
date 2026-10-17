import { z } from "zod";
import type { MvpApiClient } from "../api/mvp-client.ts";
import { MvpApiError } from "../api/mvp-client.ts";
import { getMvpUiClient } from "../api/mvp-ui-runtime.ts";
import { generateCryptographicUuid } from "../api/identity-client-validators.ts";
import { decodeDatedOfferingId, isValidISODate } from "../offerings/codec.ts";
import {
  reservationDetailSchema,
  type ReservationDetail,
} from "./client.ts";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}(?![\s\S])/);
const service = z.string().refine(value => decodeDatedOfferingId(value) !== null, {
  message: "Invalid dated service identifier.",
});
const date = z.string().refine(isValidISODate, { message: "Invalid ISO calendar date." });
const seat = z.string().regex(/^(?:[1-9]|[1-5][0-9]|60)[A-Z](?![\s\S])/, {
  message: "Invalid seat coordinate.",
});
const commandContact = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().regex(/^(?:\+?[0-9 ()-]{5,32})?$/, {
    message: "Invalid phone number format.",
  }),
}).strict();
const guestCommandContact = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().regex(/^(?:\+?[0-9 ()-]{5,32})?$/, {
    message: "Invalid phone number format.",
  }).optional().default(""),
}).strict();

export const tripPassengerSchema = z.object({
  id,
  type: z.enum(["adult", "child"]),
  firstName: z.string().trim().max(120),
  lastName: z.string().trim().max(120),
  dob: date,
  nationality: z.string().trim().min(1).max(120),
  document: z.string().trim().min(1).max(120),
  seatCode: seat,
  mealId: id.nullable().optional(),
}).strict();

export const tripLegSchema = z.object({
  serviceId: service,
  passengers: z.array(tripPassengerSchema).min(1).max(9),
}).strict().superRefine((leg, ctx) => {
  const flightDate = decodeDatedOfferingId(leg.serviceId)?.date;
  const invalidAge = flightDate && leg.passengers.some(p => {
    const age = Number(flightDate.slice(0, 4)) - Number(p.dob.slice(0, 4)) - (flightDate.slice(5) < p.dob.slice(5) ? 1 : 0);
    return age > 120 || (p.type === "adult" ? age < 12 : age < 2 || age > 11);
  });

  if (!leg.passengers.some(p => p.type === "adult")) {
    ctx.addIssue({ code: "custom", message: "At least one adult passenger is required per leg." });
  }
  if (leg.passengers.some(p => !p.firstName.trim() && !p.lastName.trim())) {
    ctx.addIssue({ code: "custom", message: "Passenger must have at least first or last name." });
  }
  if (invalidAge) {
    ctx.addIssue({ code: "custom", message: "Passenger age does not match category on flight date." });
  }
  if (new Set(leg.passengers.map(p => p.id)).size !== leg.passengers.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate passenger IDs on leg." });
  }
  if (new Set(leg.passengers.map(p => p.seatCode)).size !== leg.passengers.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate seat assignments on leg." });
  }
});

export const tripCommandSchema = z.object({
  submissionId: z.string().uuid(),
  contact: commandContact,
  legs: z.tuple([tripLegSchema, tripLegSchema]),
}).strict().superRefine((trip, ctx) => {
  const [outbound, inbound] = trip.legs;

  // 1. Must be different services
  if (outbound.serviceId === inbound.serviceId) {
    ctx.addIssue({ code: "custom", message: "Outbound and return legs must specify different services." });
  }

  // 2. Passenger count must be identical across both legs
  if (outbound.passengers.length !== inbound.passengers.length) {
    ctx.addIssue({ code: "custom", message: "Passenger count must be identical across both legs." });
    return;
  }

  // 3. Passenger identities must be strictly consistent between legs
  for (let i = 0; i < outbound.passengers.length; i++) {
    const pOut = outbound.passengers[i]!;
    const pIn = inbound.passengers[i]!;

    if (
      pOut.id !== pIn.id ||
      pOut.type !== pIn.type ||
      pOut.firstName.trim() !== pIn.firstName.trim() ||
      pOut.lastName.trim() !== pIn.lastName.trim() ||
      pOut.dob !== pIn.dob ||
      pOut.nationality.trim() !== pIn.nationality.trim() ||
      pOut.document.trim() !== pIn.document.trim()
    ) {
      ctx.addIssue({
        code: "custom",
        message: `Passenger identity at position ${i + 1} does not match between outbound and return legs.`,
      });
    }
  }
});

export const tripResponseSchema = z.object({
  reservations: z.tuple([reservationDetailSchema, reservationDetailSchema]),
}).strict();

export const guestTripPassengerSchema = z.object({
  id,
  type: z.enum(["adult", "child"]).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().max(120).nullable().optional(),
  dob: date.nullable().optional(),
  nationality: z.string().trim().min(1).max(120).nullable().optional(),
  document: z.string().trim().min(1).max(120).nullable().optional(),
  seatCode: seat,
  mealId: id.nullable().optional(),
}).strict().superRefine((p, ctx) => {
  if (p.name !== undefined && p.firstName !== undefined) {
    ctx.addIssue({ code: "custom", message: "Ambiguous simultaneous name and firstName fields." });
  }
  if (!p.name?.trim() && !p.firstName?.trim()) {
    ctx.addIssue({ code: "custom", message: "Passenger name is required." });
  }
});

export const guestTripLegSchema = z.object({
  serviceId: service,
  passengers: z.array(guestTripPassengerSchema).min(1).max(9),
}).strict().superRefine((leg, ctx) => {
  const flightDate = decodeDatedOfferingId(leg.serviceId)?.date;
  const invalidAge = flightDate && leg.passengers.some(p => {
    if (!p.dob) return false;
    const pType = p.type ?? "adult";
    const age = Number(flightDate.slice(0, 4)) - Number(p.dob.slice(0, 4)) - (flightDate.slice(5) < p.dob.slice(5) ? 1 : 0);
    return age > 120 || (pType === "adult" ? age < 12 : age < 2 || age > 11);
  });

  if (!leg.passengers.some(p => (p.type ?? "adult") === "adult")) {
    ctx.addIssue({ code: "custom", message: "At least one adult passenger is required per leg." });
  }
  if (invalidAge) {
    ctx.addIssue({ code: "custom", message: "Passenger age does not match category on flight date." });
  }
  if (new Set(leg.passengers.map(p => p.id)).size !== leg.passengers.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate passenger IDs on leg." });
  }
  if (new Set(leg.passengers.map(p => p.seatCode)).size !== leg.passengers.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate seat assignments on leg." });
  }
});

export const guestTripCommandSchema = z.object({
  submissionId: z.string().uuid(),
  contact: guestCommandContact,
  legs: z.tuple([guestTripLegSchema, guestTripLegSchema]),
}).strict().superRefine((trip, ctx) => {
  const [outbound, inbound] = trip.legs;

  if (outbound.serviceId === inbound.serviceId) {
    ctx.addIssue({ code: "custom", message: "Outbound and return legs must specify different services." });
  }

  if (outbound.passengers.length !== inbound.passengers.length) {
    ctx.addIssue({ code: "custom", message: "Passenger count must be identical across both legs." });
    return;
  }

  for (let i = 0; i < outbound.passengers.length; i++) {
    const pOut = outbound.passengers[i]!;
    const pIn = inbound.passengers[i]!;

    const nameOut = (pOut.name ?? pOut.firstName ?? "").trim();
    const nameIn = (pIn.name ?? pIn.firstName ?? "").trim();

    if (
      pOut.id !== pIn.id ||
      (pOut.type ?? "adult") !== (pIn.type ?? "adult") ||
      nameOut !== nameIn ||
      (pOut.lastName?.trim() || null) !== (pIn.lastName?.trim() || null) ||
      (pOut.dob || null) !== (pIn.dob || null) ||
      (pOut.nationality?.trim() || null) !== (pIn.nationality?.trim() || null) ||
      (pOut.document?.trim() || null) !== (pIn.document?.trim() || null)
    ) {
      ctx.addIssue({
        code: "custom",
        message: `Passenger identity at position ${i + 1} does not match between outbound and return legs.`,
      });
    }
  }
});

export type TripPassenger = z.infer<typeof tripPassengerSchema>;
export type TripLeg = z.infer<typeof tripLegSchema>;
export type TripCommand = z.infer<typeof tripCommandSchema>;
export type GuestTripCommand = z.infer<typeof guestTripCommandSchema>;
export type TripResponse = z.infer<typeof tripResponseSchema>;

/**
 * Validates instant-level return chronology across airport timezones:
 * return.departAt must be strictly greater than outbound.arriveAt.
 */
export function validateTripChronology(outboundArriveAt: string, returnDepartAt: string): boolean {
  const outTime = Date.parse(outboundArriveAt);
  const inTime = Date.parse(returnDepartAt);
  if (Number.isNaN(outTime) || Number.isNaN(inTime)) {
    return false;
  }
  return inTime > outTime;
}

/**
 * TripReservationAttempt
 *
 * Ensures ambiguous network / 5xx failures lock edits and retain the exact
 * normalized command and submissionId for safe retry.
 * Edits are unlocked only upon a definitive 4xx response.
 * Changing account email or guest verification context while locked is prohibited.
 */
export class TripReservationAttempt {
  private command: TripCommand | GuestTripCommand | null = null;
  private owner: string | null = null;

  get locked(): boolean {
    return this.command !== null;
  }

  get currentSubmissionId(): string | null {
    return this.command?.submissionId ?? null;
  }

  prepare(
    owner: string,
    input: Omit<TripCommand, "submissionId"> | Omit<GuestTripCommand, "submissionId">,
    isGuest = false,
  ): TripCommand | GuestTripCommand {
    const normalizedOwner = owner.trim().toLowerCase();
    if (this.command) {
      if (normalizedOwner !== this.owner) {
        throw new Error("Account or guest verification context changed while attempt locked.");
      }
      return structuredClone(this.command);
    }
    const schema = isGuest ? guestTripCommandSchema : tripCommandSchema;
    const command = schema.parse({
      ...input,
      submissionId: generateCryptographicUuid(),
    });
    this.owner = normalizedOwner;
    this.command = structuredClone(command);
    return command;
  }

  /**
   * Only definitive 409 conflict or 422 unprocessable HTTP rejection unlocks editing.
   * 401/403 (expired session/grant) and 429 (rate-limited) do NOT prove the previous submission failed
   * and must retain lock for safe same-command reverify and retry.
   */
  rejected(status: number | undefined): void {
    if (status === 409 || status === 422) {
      this.command = null;
      this.owner = null;
    }
  }

  /** Explicitly reset the attempt (e.g. user leaves booking flow). */
  reset(): void {
    this.command = null;
    this.owner = null;
  }
}

/**
 * TripClient
 *
 * Executes atomic two-leg round-trip reservations:
 * - POST /reservation-trips (authenticated account)
 * - POST /guest-reservation-trips (guest)
 *
 * Invariants:
 * - Atomic: both legs succeed or neither.
 * - Exactly two legs in requested order (outbound, return).
 * - Returned reservations are cross-validated against command legs and contact.
 */
export class TripClient {
  constructor(privateClient: () => MvpApiClient = getMvpUiClient) {
    this.client = privateClient;
  }

  private readonly client: () => MvpApiClient;

  async create(command: TripCommand | GuestTripCommand, isGuest = false): Promise<TripResponse> {
    const body = isGuest ? guestTripCommandSchema.parse(command) : tripCommandSchema.parse(command);
    const path = isGuest ? "/guest-reservation-trips" : "/reservation-trips";

    const data = await this.client().request({
      method: "POST",
      path,
      realm: "passenger",
      body,
      statuses: [200, 201],
      schema: tripResponseSchema,
    });

    const [outRes, inRes] = data.reservations;
    const [outLeg, inLeg] = body.legs;
    const normalizedEmail = body.contact.email.trim().toLowerCase();

    for (const [res, leg] of [[outRes, outLeg], [inRes, inLeg]] as const) {
      if (
        res.reservation.contact.email.toLowerCase() !== normalizedEmail ||
        res.reservation.contact.phone !== body.contact.phone ||
        res.reservation.serviceId !== leg.serviceId ||
        res.reservation.passengers.length !== leg.passengers.length ||
        res.reservation.passengers.some(
          p =>
            !leg.passengers.some(
              item => {
                const nameMatches =
                  ("name" in item && item.name?.trim() === p.firstName) ||
                  ("firstName" in item && item.firstName?.trim() === p.firstName);
                const lastMatches =
                  ("lastName" in item ? (item.lastName?.trim() || null) : null) === (p.lastName || null);
                const typeMatches = ("type" in item && item.type ? item.type : "adult") === p.type;
                return (
                  item.id === p.id &&
                  item.seatCode === p.seatCode &&
                  typeMatches &&
                  nameMatches &&
                  lastMatches
                );
              },
            ),
        )
      ) {
        throw new MvpApiError("protocol");
      }
    }

    // Verify opposite airports and different services across legs
    if (
      outRes.reservation.serviceId === inRes.reservation.serviceId ||
      outRes.reservation.originCode !== inRes.reservation.destinationCode ||
      outRes.reservation.destinationCode !== inRes.reservation.originCode ||
      outRes.ticket.flight.originCode !== inRes.ticket.flight.destinationCode ||
      outRes.ticket.flight.destinationCode !== inRes.ticket.flight.originCode
    ) {
      throw new MvpApiError("protocol");
    }

    // Verify flight timing chronology: return departure must be strictly after outbound arrival
    const outArrive = outRes.ticket.flight.arriveAt;
    const inDepart = inRes.ticket.flight.departAt;
    if (!outArrive || !inDepart || !validateTripChronology(outArrive, inDepart)) {
      throw new MvpApiError("protocol");
    }

    return data;
  }
}

export const tripClient = new TripClient();
