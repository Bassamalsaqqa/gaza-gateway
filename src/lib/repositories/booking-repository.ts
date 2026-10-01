/**
 * Gaza Gateway — Canonical Booking Repository Implementation
 *
 * Provides the single source of truth and single writer for the Booking aggregate.
 * Enforces bookability invariants, stable passenger IDs, duplicate-PNR conflict resolution,
 * Studio/capacity fixture isolation, and reactive subscriber notifications.
 */

import type { Booking, BookingCreateInput, BookingPassenger, Leg, SearchCriteria } from "../domain/booking.ts";
import { makePassengerId, BookingCreationError } from "../domain/booking.ts";
import { isSyntheticFlightId, getEffectiveFlight, type Flight } from "../domain/flight.ts";
import { isFlightBookable, getFlightBookability } from "../booking-rules.ts";
import { flightById } from "../data.ts";
import { makePnr } from "../format.ts";
import type { BookingRepository, CheckInCommandInput, ClaimResult } from "./types.ts";
import type { Extras } from "../booking-draft/types.ts";
import { getCheckInEligibility } from "../domain/check-in.ts";
import { bookingTotal } from "../domain/pricing.ts";
import {
  validateUpdateSeatsAssignments,
  validateCheckInSeats,
} from "../domain/seat-validation.ts";
import { normalizeEmailIdentity } from "../passenger/domain.ts";
import {
  RepoStorageCoordinator,
  type RepoStorageV1,
} from "./storage.ts";

export class LocalBookingRepository implements BookingRepository {
  private coordinator: RepoStorageCoordinator;
  private listeners: Set<() => void> = new Set();
  private unsubscribeCoordinator: (() => void) | null = null;

  constructor(
    coordinatorOrInitial?: RepoStorageCoordinator | RepoStorageV1,
    options?: { storage?: Storage | null },
  ) {
    if (coordinatorOrInitial instanceof RepoStorageCoordinator) {
      this.coordinator = coordinatorOrInitial;
    } else {
      this.coordinator = new RepoStorageCoordinator({
        initialData: coordinatorOrInitial,
        storage: options?.storage,
      });
    }

    this.unsubscribeCoordinator = this.coordinator.subscribe(() => {
      this.notifyListeners();
    });
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error("BookingRepository listener error:", err);
      }
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public destroy(): void {
    if (this.unsubscribeCoordinator) {
      this.unsubscribeCoordinator();
      this.unsubscribeCoordinator = null;
    }
    this.listeners.clear();
  }

  public async list(): Promise<Booking[]> {
    return [...this.coordinator.getState().bookings];
  }

  public async getByRef(ref: string): Promise<Booking | null> {
    if (!ref || typeof ref !== "string") return null;
    const clean = ref.trim().toUpperCase();
    const found = this.coordinator.getState().bookings.find((b) => b.ref.toUpperCase() === clean);
    return found ? { ...found } : null;
  }

  public async create(data: BookingCreateInput): Promise<Booking> {
    const seatPaxCount =
      (data.passengers ?? []).filter((p) => p.type !== "infant").length || 1;

    // Atomically mutate coordinator: validates inside transaction against CURRENT shared coordinator flightOverrides
    return this.coordinator.mutate((state) => {
      // 1. Idempotency guard: if submissionId was previously committed, return existing booking
      if (data.submissionId) {
        const existing = state.bookings.find((b) => b.submissionId === data.submissionId);
        if (existing) {
          return { ...existing };
        }
      }

      // 2. Studio & synthetic flight fixture isolation
      if (
        isSyntheticFlightId(data.outbound?.id) ||
        (data.inbound && isSyntheticFlightId(data.inbound.id))
      ) {
        throw new BookingCreationError(
          "synthetic_fixture",
          "Cannot create booking: synthetic test fixture flight cannot be booked.",
          isSyntheticFlightId(data.outbound?.id) ? "out" : "in",
        );
      }

      // 3. Re-resolve outbound flight from deterministic base schedule + current transaction overrides
      if (!data.outbound?.id) {
        throw new BookingCreationError("flight_missing", "Cannot create booking: outbound flight missing.", "out");
      }
      const baseOutbound = flightById(data.outbound.id);
      if (!baseOutbound) {
        throw new BookingCreationError("flight_missing", "Cannot create booking: outbound flight missing from canonical schedule.", "out");
      }
      const effectiveOutbound = getEffectiveFlight(baseOutbound, state.flightOverrides[baseOutbound.id]);

      // Route and date criteria validation (if criteria provided)
      const looseCriteria = data.criteria as Record<string, unknown> | undefined;
      const looseData = data as unknown as Record<string, unknown>;
      const criteriaOrigin =
        (typeof looseCriteria?.["origin"] === "string" ? looseCriteria["origin"] : null) ??
        (typeof looseCriteria?.["originCode"] === "string" ? looseCriteria["originCode"] : null);
      const criteriaDest =
        (typeof looseCriteria?.["destination"] === "string" ? looseCriteria["destination"] : null) ??
        (typeof looseCriteria?.["destinationCode"] === "string" ? looseCriteria["destinationCode"] : null);

      if (criteriaOrigin && effectiveOutbound.originCode.toUpperCase() !== criteriaOrigin.toUpperCase()) {
        throw new BookingCreationError("route_mismatch", "Cannot create booking: outbound flight route mismatch.", "out");
      }
      if (criteriaDest && effectiveOutbound.destinationCode.toUpperCase() !== criteriaDest.toUpperCase()) {
        throw new BookingCreationError("route_mismatch", "Cannot create booking: outbound flight route mismatch.", "out");
      }
      if (data.criteria?.departDate && effectiveOutbound.date !== data.criteria.departDate) {
        throw new BookingCreationError("date_mismatch", "Cannot create booking: outbound flight date mismatch.", "out");
      }

      // Operational bookability evaluation (clock, status, seatsLeft)
      const outBookability = getFlightBookability(effectiveOutbound, { paxCount: seatPaxCount });
      if (!outBookability.bookable) {
        throw new BookingCreationError(
          outBookability.reason ?? "unavailable",
          `Cannot create booking: outbound flight is not bookable (${outBookability.reason ?? "unavailable"}).`,
          "out",
        );
      }

      // 4. Re-resolve inbound flight (if round trip or inbound provided)
      let effectiveInbound: Flight | null = null;
      const isRoundTrip =
        data.criteria?.tripType === "round" ||
        looseCriteria?.["tripType"] === "round-trip" ||
        Boolean(data.inbound);

      if (isRoundTrip) {
        if (!data.inbound?.id) {
          throw new BookingCreationError("flight_missing", "Cannot create booking: inbound flight missing for round trip.", "in");
        }
        const baseInbound = flightById(data.inbound.id);
        if (!baseInbound) {
          throw new BookingCreationError("flight_missing", "Cannot create booking: inbound flight missing for round trip from canonical schedule.", "in");
        }
        effectiveInbound = getEffectiveFlight(baseInbound, state.flightOverrides[baseInbound.id]);

        if (criteriaDest && effectiveInbound.originCode.toUpperCase() !== criteriaDest.toUpperCase()) {
          throw new BookingCreationError("route_mismatch", "Cannot create booking: inbound flight route mismatch.", "in");
        }
        if (criteriaOrigin && effectiveInbound.destinationCode.toUpperCase() !== criteriaOrigin.toUpperCase()) {
          throw new BookingCreationError("route_mismatch", "Cannot create booking: inbound flight route mismatch.", "in");
        }
        if (data.criteria?.returnDate && effectiveInbound.date !== data.criteria.returnDate) {
          throw new BookingCreationError("date_mismatch", "Cannot create booking: inbound flight date mismatch.", "in");
        }

        const inBookability = getFlightBookability(effectiveInbound, { paxCount: seatPaxCount });
        if (!inBookability.bookable) {
          throw new BookingCreationError(
            inBookability.reason ?? "unavailable",
            `Cannot create booking: inbound flight is not bookable (${inBookability.reason ?? "unavailable"}).`,
            "in",
          );
        }
      }

      // 5. Ensure unique PNR
      const existingRefs = new Set(state.bookings.map((b) => b.ref.toUpperCase()));
      let pnr = (data.ref ? data.ref.trim().toUpperCase() : makePnr());
      while (existingRefs.has(pnr)) {
        pnr = makePnr();
      }

      // 6. Assign deterministic, stable passenger IDs: `pax-${ref}-${index}`
      const passengers: BookingPassenger[] = (data.passengers || []).map((p, idx) => {
        let firstName = p.firstName ?? "";
        let lastName = p.lastName ?? "";
        const looseP = p as unknown as Record<string, unknown>;
        if (!firstName && !lastName && typeof looseP["name"] === "string") {
          const parts = looseP["name"].trim().split(/\s+/);
          firstName = parts[0] ?? "";
          lastName = parts.slice(1).join(" ");
        }
        return {
          id: "id" in p && p.id && !p.id.startsWith("pax-TEMP") ? p.id : makePassengerId(pnr, idx),
          type: p.type ?? "adult",
          firstName,
          lastName,
          dob: p.dob ?? "",
          nationality: p.nationality ?? "Palestinian",
          document: p.document ?? "",
          withAdult: p.withAdult,
        };
      });

      const criteria: SearchCriteria = {
        tripType:
          data.criteria?.tripType === "round" ||
          looseCriteria?.["tripType"] === "round-trip" ||
          Boolean(effectiveInbound)
            ? "round"
            : "oneway",
        origin: criteriaOrigin ?? effectiveOutbound.originCode,
        destination: criteriaDest ?? effectiveOutbound.destinationCode,
        departDate: data.criteria?.departDate ?? effectiveOutbound.date,
        returnDate: typeof looseCriteria?.["returnDate"] === "string" ? (looseCriteria["returnDate"] as string) : (effectiveInbound?.date ?? ""),
        cabin:
          (typeof looseCriteria?.["cabin"] === "string" ? (looseCriteria["cabin"] as "economy" | "business" | "first") : null) ??
          (typeof looseData["cabin"] === "string" ? (looseData["cabin"] as "economy" | "business" | "first") : null) ??
          "economy",
        adults:
          (typeof looseCriteria?.["adults"] === "number" ? (looseCriteria["adults"] as number) : null) ??
          (passengers.filter((p) => p.type === "adult").length || 1),
        children:
          (typeof looseCriteria?.["children"] === "number" ? (looseCriteria["children"] as number) : null) ??
          (passengers.filter((p) => p.type === "child").length || 0),
        infants:
          (typeof looseCriteria?.["infants"] === "number" ? (looseCriteria["infants"] as number) : null) ??
          (passengers.filter((p) => p.type === "infant").length || 0),
      };

      const fareId = ((data.fareId ?? looseData["fareFamily"] ?? "essential") as unknown) as "essential" | "classic" | "flex";

      // Store the accepted effective snapshot
      const created: Booking = {
        ref: pnr,
        createdAt: data.createdAt ?? new Date().toISOString(),
        criteria,
        outbound: effectiveOutbound,
        inbound: effectiveInbound,
        fareId,
        passengers,
        seats: { ...(data.seats ?? {}) },
        extras: data.extras ? { ...data.extras } : { pax: [] },
        contact: { ...data.contact },
        total: data.total,
        status: data.status ?? "confirmed",
        checkedIn: data.checkedIn ?? { out: [], in: [] },
        ownerEmail: data.ownerEmail ? normalizeEmailIdentity(data.ownerEmail) : null,
        submissionId: data.submissionId,
      };

      state.bookings = [created, ...state.bookings];
      return { ...created };
    });
  }

  public async cancel(ref: string): Promise<Booking> {
    if (!ref || typeof ref !== "string") {
      throw new Error("Cannot cancel booking: reference is required.");
    }
    const clean = ref.trim().toUpperCase();

    return this.coordinator.mutate((state) => {
      const index = state.bookings.findIndex((b) => b.ref.toUpperCase() === clean);
      if (index === -1) {
        throw new Error(`Booking ${clean} not found.`);
      }

      const existing = state.bookings[index];
      if (!existing) {
        throw new Error(`Booking ${clean} not found.`);
      }

      // Idempotent cancellation
      if (existing.status === "cancelled") {
        return { ...existing };
      }

      const updated: Booking = {
        ...existing,
        status: "cancelled",
      };

      state.bookings[index] = updated;
      return { ...updated };
    });
  }

  public async updateContact(
    ref: string,
    contact: { email: string; phone?: string },
  ): Promise<Booking> {
    if (!ref || typeof ref !== "string") {
      throw new Error("Cannot update contact: reference is required.");
    }
    const clean = ref.trim().toUpperCase();
    const cleanEmail = (contact?.email ?? "").trim();
    if (!/.+@.+\..+/.test(cleanEmail)) {
      throw new Error("Cannot update contact: invalid email address.");
    }
    const cleanPhone = (contact?.phone ?? "").trim();

    return this.coordinator.mutate((state) => {
      const index = state.bookings.findIndex((b) => b.ref.toUpperCase() === clean);
      if (index === -1) {
        throw new Error(`Booking ${clean} not found.`);
      }

      const existing = state.bookings[index];
      if (!existing) {
        throw new Error(`Booking ${clean} not found.`);
      }

      if (existing.status === "cancelled") {
        throw new Error(`Cannot update contact: booking ${clean} is cancelled.`);
      }

      const updated: Booking = {
        ...existing,
        contact: {
          email: cleanEmail,
          phone: cleanPhone,
        },
      };

      state.bookings[index] = updated;
      return { ...updated };
    });
  }

  public async updateSeats(
    ref: string,
    seats: Record<string, string>,
  ): Promise<Booking> {
    if (!ref || typeof ref !== "string") {
      throw new Error("Cannot update seats: reference is required.");
    }
    const clean = ref.trim().toUpperCase();

    return this.coordinator.mutate((state) => {
      const index = state.bookings.findIndex((b) => b.ref.toUpperCase() === clean);
      if (index === -1) {
        throw new Error(`Booking ${clean} not found.`);
      }

      const existing = state.bookings[index];
      if (!existing) {
        throw new Error(`Booking ${clean} not found.`);
      }

      if (existing.status === "cancelled") {
        throw new Error(`Cannot update seats: booking ${clean} is cancelled.`);
      }

      // Resolve effective flights within current transaction overrides
      const baseOutbound = flightById(existing.outbound.id);
      const effectiveOutbound = baseOutbound
        ? getEffectiveFlight(baseOutbound, state.flightOverrides[baseOutbound.id]) ?? existing.outbound
        : existing.outbound;

      let effectiveInbound: Flight | null = null;
      if (existing.inbound) {
        const baseInbound = flightById(existing.inbound.id);
        effectiveInbound = baseInbound
          ? getEffectiveFlight(baseInbound, state.flightOverrides[baseInbound.id]) ?? existing.inbound
          : existing.inbound;
      }

      // Pure domain validation for seat syntax, cabin zone, availability, immutability, duplicates, leg preservation
      const nextSeats = validateUpdateSeatsAssignments(existing, seats, {
        outbound: effectiveOutbound,
        inbound: effectiveInbound,
      });

      // Invariant: Canonical pricing recalculation using latest booking facts
      const nextTotal = bookingTotal({
        outbound: existing.outbound,
        inbound: existing.inbound,
        fareId: existing.fareId,
        criteria: existing.criteria,
        seats: nextSeats,
        extras: existing.extras,
      }).total;

      const updated: Booking = {
        ...existing,
        seats: nextSeats,
        total: nextTotal,
      };

      state.bookings[index] = updated;
      return { ...updated };
    });
  }

  public async updateExtras(
    ref: string,
    extras: Extras,
  ): Promise<Booking> {
    if (!ref || typeof ref !== "string") {
      throw new Error("Cannot update extras: reference is required.");
    }
    const clean = ref.trim().toUpperCase();

    return this.coordinator.mutate((state) => {
      const index = state.bookings.findIndex((b) => b.ref.toUpperCase() === clean);
      if (index === -1) {
        throw new Error(`Booking ${clean} not found.`);
      }

      const existing = state.bookings[index];
      if (!existing) {
        throw new Error(`Booking ${clean} not found.`);
      }

      if (existing.status === "cancelled") {
        throw new Error(`Cannot update extras: booking ${clean} is cancelled.`);
      }

      // Invariant: Canonical pricing recalculation using latest booking facts
      const nextTotal = bookingTotal({
        outbound: existing.outbound,
        inbound: existing.inbound,
        fareId: existing.fareId,
        criteria: existing.criteria,
        seats: existing.seats,
        extras,
      }).total;

      const updated: Booking = {
        ...existing,
        extras: { ...extras },
        total: nextTotal,
      };

      state.bookings[index] = updated;
      return { ...updated };
    });
  }

  public async completeCheckIn(input: CheckInCommandInput): Promise<Booking> {
    if (!input.ref || typeof input.ref !== "string") {
      throw new Error("Cannot complete check-in: reference is required.");
    }
    const clean = input.ref.trim().toUpperCase();

    return this.coordinator.mutate((state) => {
      const index = state.bookings.findIndex((b) => b.ref.toUpperCase() === clean);
      if (index === -1) {
        throw new Error(`Booking ${clean} not found.`);
      }

      const existing = state.bookings[index];
      if (!existing) {
        throw new Error(`Booking ${clean} not found.`);
      }

      if (existing.status === "cancelled") {
        throw new Error(`Cannot check in: booking ${clean} is cancelled.`);
      }

      const bookedFlight = input.leg === "in" ? existing.inbound : existing.outbound;
      if (!bookedFlight) {
        throw new Error(`Cannot check in: leg ${input.leg} does not exist on booking ${clean}.`);
      }

      // Re-resolve canonical effective flight with current transaction overrides
      const baseFlight = flightById(bookedFlight.id);
      const effectiveFlight = baseFlight
        ? getEffectiveFlight(baseFlight, state.flightOverrides[baseFlight.id])
        : null;

      if (!effectiveFlight) {
        throw new Error(`Cannot check in: flight ${bookedFlight.id} is unavailable.`);
      }

      // Step 1: Validate passenger index list BEFORE replay handling or doc/seat processing (Finding 3)
      if (!input.selectedPaxIndexes || !Array.isArray(input.selectedPaxIndexes) || input.selectedPaxIndexes.length === 0) {
        throw new Error("Cannot check in: at least one passenger must be selected.");
      }

      const seenIndexes = new Set<number>();
      for (const paxIdx of input.selectedPaxIndexes) {
        if (typeof paxIdx !== "number" || !Number.isInteger(paxIdx)) {
          throw new Error(`Invalid passenger index ${paxIdx} on booking ${clean}: index must be an integer.`);
        }
        if (paxIdx < 0 || paxIdx >= existing.passengers.length) {
          throw new Error(`Invalid passenger index ${paxIdx} on booking ${clean}: index out of range.`);
        }
        if (seenIndexes.has(paxIdx)) {
          throw new Error(`Cannot check in: duplicate passenger index ${paxIdx} in request.`);
        }
        seenIndexes.add(paxIdx);

        const pax = existing.passengers[paxIdx];
        if (!pax) {
          throw new Error(`Passenger ${paxIdx} does not exist.`);
        }
        if (pax.type === "infant") {
          throw new Error(`Cannot check in infant passenger at index ${paxIdx} directly.`);
        }
      }

      // Step 2: Idempotent replay vs already checked in
      const currentChecked = existing.checkedIn?.[input.leg] ?? [];
      const allAlreadyCheckedIn = input.selectedPaxIndexes.every((i) => currentChecked.includes(i));
      const anyAlreadyCheckedIn = input.selectedPaxIndexes.some((i) => currentChecked.includes(i));

      if (allAlreadyCheckedIn) {
        // Verify whether this is an identical request replay
        let isIdentical = true;
        for (const paxIdx of input.selectedPaxIndexes) {
          const reqDoc = input.documents?.[paxIdx];
          if (reqDoc !== undefined && reqDoc.trim() !== (existing.passengers[paxIdx]?.document ?? "").trim()) {
            isIdentical = false;
            break;
          }
          const reqSeat = input.seats?.[paxIdx];
          const curSeat = existing.seats[`${input.leg}-${paxIdx}`];
          if (reqSeat !== undefined && reqSeat !== curSeat) {
            isIdentical = false;
            break;
          }
        }
        if (isIdentical) {
          // Idempotent return without state modification
          return { ...existing };
        }
        throw new Error(`Passenger is already checked in for leg ${input.leg}.`);
      }

      if (anyAlreadyCheckedIn) {
        const already = input.selectedPaxIndexes.find((i) => currentChecked.includes(i));
        throw new Error(`Passenger ${already} is already checked in for leg ${input.leg}.`);
      }

      // Step 3: Authoritative check-in eligibility evaluation
      const eligibility = getCheckInEligibility(existing, input.leg, effectiveFlight, {
        now: input.now,
      });

      if (!eligibility.eligible) {
        throw new Error(`Check-in is not permitted: ${eligibility.reason ?? "ineligible"}.`);
      }

      // Step 4: Validate travel documents for newly checking-in passengers
      for (const paxIdx of input.selectedPaxIndexes) {
        const pax = existing.passengers[paxIdx]!;
        const doc = (input.documents?.[paxIdx] ?? pax.document ?? "").trim();
        if (!doc) {
          throw new Error(`Missing travel document for passenger ${paxIdx}.`);
        }
      }

      // Step 5: Pure domain seat allocation and validation (Finding 1)
      const nextSeats = validateCheckInSeats(
        existing,
        input.leg,
        input.selectedPaxIndexes,
        input.seats,
        effectiveFlight,
      );

      // Prepare updated passenger documents
      const nextPassengers = existing.passengers.map((p, i) => {
        if (input.selectedPaxIndexes.includes(i)) {
          const doc = (input.documents?.[i] ?? p.document ?? "").trim();
          return { ...p, document: doc };
        }
        return p;
      });

      // Prepare updated check-in list
      const mergedCheckedIn = Array.from(
        new Set([...currentChecked, ...input.selectedPaxIndexes]),
      ).sort((a, b) => a - b);

      const nextCheckedIn = {
        ...existing.checkedIn,
        [input.leg]: mergedCheckedIn,
      };

      // Recalculate total if seat charges changed
      const nextTotal = bookingTotal({
        outbound: existing.outbound,
        inbound: existing.inbound,
        fareId: existing.fareId,
        criteria: existing.criteria,
        seats: nextSeats,
        extras: existing.extras,
      }).total;

      const updated: Booking = {
        ...existing,
        passengers: nextPassengers,
        seats: nextSeats,
        checkedIn: nextCheckedIn,
        total: nextTotal,
      };

      state.bookings[index] = updated;
      return { ...updated };
    });
  }

  public async update(ref: string, patch: Partial<Booking>): Promise<Booking | null> {
    if (!ref || typeof ref !== "string") return null;
    const clean = ref.trim().toUpperCase();

    return this.coordinator.mutate((state) => {
      const index = state.bookings.findIndex((b) => b.ref.toUpperCase() === clean);
      if (index === -1) return null;

      const existing = state.bookings[index];
      if (!existing) return null;

      const updated: Booking = {
        ...existing,
        ...patch,
        ref: existing.ref, // PNR is immutable
      };

      state.bookings[index] = updated;
      return { ...updated };
    });
  }

  public async checkIn(ref: string, leg: Leg, paxIndexes: number[]): Promise<Booking | null> {
    if (!ref || typeof ref !== "string") return null;
    const clean = ref.trim().toUpperCase();

    return this.coordinator.mutate((state) => {
      const index = state.bookings.findIndex((b) => b.ref.toUpperCase() === clean);
      if (index === -1) return null;

      const existing = state.bookings[index];
      if (!existing || existing.status !== "confirmed") return null;

      const currentChecked = existing.checkedIn?.[leg] ?? [];
      const merged = Array.from(new Set([...currentChecked, ...paxIndexes])).sort((a, b) => a - b);

      const updated: Booking = {
        ...existing,
        checkedIn: {
          ...existing.checkedIn,
          [leg]: merged,
        },
      };

      state.bookings[index] = updated;
      return { ...updated };
    });
  }

  public async claim(ref: string, accountEmail: string): Promise<ClaimResult> {
    if (!ref || typeof ref !== "string" || !accountEmail) {
      return { status: "not-found" };
    }
    const clean = ref.trim().toUpperCase();
    const normalizedClaimEmail = normalizeEmailIdentity(accountEmail);
    if (!normalizedClaimEmail) {
      return { status: "not-found" };
    }

    // Evaluate against the freshest transactional snapshot: all no-op outcomes commit=false (0 writes, 0 notifications)
    return this.coordinator.conditionalMutate<ClaimResult>((state) => {
      const index = state.bookings.findIndex((b) => b.ref.toUpperCase() === clean);
      if (index === -1) {
        return { commit: false, result: { status: "not-found" } };
      }

      const candidate = state.bookings[index];
      if (!candidate) {
        return { commit: false, result: { status: "not-found" } };
      }

      if (candidate.ownerEmail) {
        const normalizedOwner = normalizeEmailIdentity(candidate.ownerEmail);
        if (normalizedOwner === normalizedClaimEmail) {
          return { commit: false, result: { status: "already-owned-by-user", booking: { ...candidate } } };
        }
        return { commit: false, result: { status: "owned-by-another" } };
      }

      const candidateContact = normalizeEmailIdentity(candidate.contact?.email);
      if (candidateContact !== normalizedClaimEmail) {
        return { commit: false, result: { status: "contact-mismatch" } };
      }

      const updated: Booking = {
        ...candidate,
        account: true,
        ownerEmail: normalizedClaimEmail,
      };

      state.bookings[index] = updated;
      return { commit: true, result: { status: "claimed", booking: { ...updated } } };
    });
  }

  public async delete(ref: string): Promise<boolean> {
    if (!ref || typeof ref !== "string") return false;
    const clean = ref.trim().toUpperCase();

    return this.coordinator.mutate((state) => {
      const beforeCount = state.bookings.length;
      state.bookings = state.bookings.filter((b) => b.ref.toUpperCase() !== clean);
      return state.bookings.length !== beforeCount;
    });
  }
}
