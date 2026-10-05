import type { CommercialCatalogRepository } from "../commercial/types.ts";
import { LocalCommercialCatalogRepository } from "../commercial/repository.ts";
import { pricingSnapshot, resolveBookingPricing } from "../commercial/pricing.ts";
import type { FleetRepository, Aircraft, SeatZone, CabinId } from "../fleet/types.ts";
import { LocalFleetRepository } from "../fleet/repository.ts";
import { FleetStorageCoordinator } from "../fleet/storage.ts";
import type { FleetSnapshot } from "../fleet/types.ts";
import { layoutCapacity, layoutSupportsCabin, parseSeatCode } from "../fleet/layout.ts";
/**
 * Gaza Gateway — Canonical Booking Repository Implementation
 *
 * Provides the single source of truth and single writer for the Booking aggregate.
 * Enforces bookability invariants, stable passenger IDs, duplicate-PNR conflict resolution,
 * Studio/capacity fixture isolation, and reactive subscriber notifications.
 */

import type { Booking, BookingCreateInput, BookingPassenger, Leg, SearchCriteria, BookingSeatLayoutsV1, LegSeatLayoutSnapshot } from "../domain/booking.ts";
import { makePassengerId, BookingCreationError, FROZEN_LEGACY_SEAT_LAYOUT, resolveBookingLegLayout } from "../domain/booking.ts";
import { isSyntheticFlightId, getEffectiveFlight, type Flight } from "../domain/flight.ts";
import { isFlightBookable, getFlightBookability } from "../booking-rules.ts";
import { flightById } from "../data.ts";
import { makePnr } from "../format.ts";
import type { BookingRepository, CheckInCommandInput, UndoCheckInCommandInput, ClaimResult } from "./types.ts";
import type { Extras } from "../booking-draft/types.ts";
import { getCheckInEligibility } from "../domain/check-in.ts";
import { bookingTotal } from "../domain/pricing.ts";
import {
  validateUpdateSeatsAssignments,
  validateCheckInSeats,
  isValidSeatSyntax,
} from "../domain/seat-validation.ts";
import { validateBookingParty, validateBookingContact, validateBookingExtras, validateCreationComposition } from "../domain/booking-validation.ts";
import { normalizeEmailIdentity } from "../passenger/domain.ts";
import {
  RepoStorageCoordinator,
  type RepoStorageV1,
} from "./storage.ts";

/**
 * Pure helper to derive canonical occupied seats on a flight from confirmed bookings.
 * Physical flight identity, not booking leg role, defines seat occupancy.
 * Excludes cancelled bookings and optionally excludes a current booking reference.
 */
export function getCanonicalOccupiedSeats(
  bookings: Booking[],
  flightId: string,
  excludeRef?: string,
): Set<string> {
  const occupied = new Set<string>();
  const cleanExclude = excludeRef?.trim().toUpperCase();

  for (const b of bookings) {
    if (b.status !== "confirmed") continue;
    if (cleanExclude && b.ref.toUpperCase() === cleanExclude) continue;

    // A physical flight can be either outbound or inbound on another PNR;
    // all seats booked on that physical flight are occupied.
    if (b.outbound.id === flightId) {
      for (const [key, seat] of Object.entries(b.seats)) {
        if (key.startsWith("out-") && seat) {
          const parsed = parseSeatCode(seat);
          if (parsed) {
            occupied.add(`${parsed.row}${parsed.letter}`);
          }
        }
      }
    }

    if (b.inbound && b.inbound.id === flightId) {
      for (const [key, seat] of Object.entries(b.seats)) {
        if (key.startsWith("in-") && seat) {
          const parsed = parseSeatCode(seat);
          if (parsed) {
            occupied.add(`${parsed.row}${parsed.letter}`);
          }
        }
      }
    }
  }

  return occupied;
}

export class LocalBookingRepository implements BookingRepository {
  private readonly commercial: CommercialCatalogRepository;
  private readonly fleet: FleetRepository;
  private coordinator: RepoStorageCoordinator;
  private listeners: Set<() => void> = new Set();
  private unsubscribeCoordinator: (() => void) | null = null;

  constructor(
    coordinatorOrInitial?: RepoStorageCoordinator | RepoStorageV1,
    options?: {
      storage?: Storage | null;
      commercial?: CommercialCatalogRepository;
      fleet?: FleetRepository;
    },
  ) {
    this.commercial = options?.commercial ?? new LocalCommercialCatalogRepository();
    this.fleet =
      options?.fleet ??
      new LocalFleetRepository(
        new FleetStorageCoordinator({
          ...(options?.storage !== undefined ? { storage: options.storage } : {}),
        }),
      );
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

  public async getOccupiedSeats(
    flightId: string,
    options?: { excludeRef?: string },
  ): Promise<string[]> {
    const bookings = this.coordinator.getState().bookings;
    const occupied = getCanonicalOccupiedSeats(bookings, flightId, options?.excludeRef);
    return Array.from(occupied);
  }

  public async create(data: BookingCreateInput): Promise<Booking> {
    // A committed submission is replayed independently of today's commercial catalog.
    // Read through the coordinator's fresh canonical snapshot without writing/notifying.
    if (data.submissionId?.trim()) {
      const committed = this.coordinator.conditionalMutate((state) => ({
        commit: false,
        result: state.bookings.find((b) => b.submissionId === data.submissionId),
      }));
      if (committed) return structuredClone(committed);
    }
    // Catalog and Fleet are sampled at command time; booking snapshot and price commit atomically together.
    const catalog = await this.commercial.get();
    let fleetState: FleetSnapshot;
    try {
      fleetState = await this.fleet.get();
    } catch {
      throw new BookingCreationError(
        "fleet_unavailable",
        "Fleet layout unavailable. Please try again.",
      );
    }
    const seatPaxCount =
      (Array.isArray(data.passengers) ? data.passengers : []).filter((p) => p?.type !== "infant").length || 1;

    // Atomically mutate coordinator: validates inside transaction against CURRENT shared coordinator flightOverrides
    return this.coordinator.conditionalMutateAsync<Booking>((state) => {
      // 1. Idempotency guard: if submissionId was previously committed, return existing booking
      if (data.submissionId?.trim()) {
        const existing = state.bookings.find((b) => b.submissionId === data.submissionId);
        if (existing) {
          return { commit: false, result: structuredClone(existing) };
        }
      }

      const normalizedPassengers = validateBookingParty(data.passengers);
      validateCreationComposition(data, normalizedPassengers);
      const normalizedContact = validateBookingContact(data.contact);
      const normalizedExtras = validateBookingExtras(data.extras, normalizedPassengers.length, catalog.catalog);

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
      const passengers: BookingPassenger[] = normalizedPassengers.map((p, idx) => {
        let firstName = p.firstName ?? "";
        let lastName = p.lastName ?? "";
        const looseP = p as unknown as Record<string, unknown>;
        if (!firstName && !lastName && typeof looseP["name"] === "string") {
          const parts = looseP["name"].trim().split(/\s+/);
          firstName = parts[0] ?? "";
          lastName = parts.slice(1).join(" ");
        }
        return {
          id: "id" in p && typeof p.id === "string" && !p.id.startsWith("pax-TEMP") ? p.id : makePassengerId(pnr, idx),
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
          (typeof looseCriteria?.["cabin"] === "string" ? (looseCriteria["cabin"] as "economy" | "business" | "premium") : null) ??
          (typeof looseData["cabin"] === "string" ? (looseData["cabin"] as "economy" | "business" | "premium") : null) ??
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

      // 7. Resolve authoritative per-leg layout snapshots from sampled Fleet state
      const outAircraftId = effectiveOutbound.aircraftId;
      const outAircraft = outAircraftId ? fleetState.aircraft.find((a: Aircraft) => a.id === outAircraftId) : undefined;
      const outLayout = outAircraftId ? fleetState.layouts[outAircraftId] : undefined;

      if (outAircraftId && !outLayout) {
        throw new BookingCreationError(
          "fleet_unavailable",
          `Seat layout for aircraft ${outAircraftId} is unavailable.`,
          "out",
        );
      }

      const outSnapshot: LegSeatLayoutSnapshot = outLayout
        ? {
            basis: "fleet",
            fleetRevision: fleetState.revision,
            aircraftId: outAircraft?.id ?? outAircraftId,
            model: outAircraft?.model ?? effectiveOutbound.aircraft,
            registration: outAircraft?.registration,
            rows: outLayout.rows,
            letters: [...outLayout.letters],
            aisleAfter: outLayout.aisleAfter,
            zones: outLayout.zones.map((z: SeatZone) => ({ ...z })),
            extraLegroomRows: [...outLayout.extraLegroomRows],
            unavailable: [...outLayout.unavailable],
            capacity: layoutCapacity(outLayout),
          }
        : {
            ...FROZEN_LEGACY_SEAT_LAYOUT,
            aircraftId: effectiveOutbound.aircraftId,
            model: effectiveOutbound.aircraft,
          };

      let inSnapshot: LegSeatLayoutSnapshot | undefined = undefined;
      if (effectiveInbound) {
        const inAircraftId = effectiveInbound.aircraftId;
        const inAircraft = inAircraftId ? fleetState.aircraft.find((a: Aircraft) => a.id === inAircraftId) : undefined;
        const inLayout = inAircraftId ? fleetState.layouts[inAircraftId] : undefined;

        if (inAircraftId && !inLayout) {
          throw new BookingCreationError(
            "fleet_unavailable",
            `Seat layout for aircraft ${inAircraftId} is unavailable.`,
            "in",
          );
        }

        inSnapshot = inLayout
          ? {
              basis: "fleet",
              fleetRevision: fleetState.revision,
              aircraftId: inAircraft?.id ?? inAircraftId,
              model: inAircraft?.model ?? effectiveInbound.aircraft,
              registration: inAircraft?.registration,
              rows: inLayout.rows,
              letters: [...inLayout.letters],
              aisleAfter: inLayout.aisleAfter,
              zones: inLayout.zones.map((z: SeatZone) => ({ ...z })),
              extraLegroomRows: [...inLayout.extraLegroomRows],
              unavailable: [...inLayout.unavailable],
              capacity: layoutCapacity(inLayout),
            }
          : {
              ...FROZEN_LEGACY_SEAT_LAYOUT,
              aircraftId: effectiveInbound.aircraftId,
              model: effectiveInbound.aircraft,
            };
      }

      // Invariant: New cabin selection requires effective layout has cabin on BOTH legs
      const reqCabin = (criteria.cabin?.toLowerCase() || "economy") as CabinId;
      if (!layoutSupportsCabin(outSnapshot, reqCabin)) {
        throw new BookingCreationError(
          "cabin_unavailable",
          `Cabin ${criteria.cabin} is not available on outbound flight ${effectiveOutbound.number}.`,
          "out",
        );
      }
      if (inSnapshot && !layoutSupportsCabin(inSnapshot, reqCabin)) {
        throw new BookingCreationError(
          "cabin_unavailable",
          `Cabin ${criteria.cabin} is not available on inbound flight ${effectiveInbound!.number}.`,
          "in",
        );
      }

      const seatLayouts: BookingSeatLayoutsV1 = {
        version: 1,
        out: outSnapshot,
        ...(inSnapshot ? { in: inSnapshot } : {}),
      };

      // 8. Derive transactional cross-PNR occupied seats on effective flights
      const occupiedOut = getCanonicalOccupiedSeats(state.bookings, effectiveOutbound.id);
      const occupiedIn = effectiveInbound
        ? getCanonicalOccupiedSeats(state.bookings, effectiveInbound.id)
        : new Set<string>();

      const created: Booking = {
        ref: pnr,
        createdAt: data.createdAt ?? new Date().toISOString(),
        criteria,
        outbound: effectiveOutbound,
        inbound: effectiveInbound,
        fareId,
        passengers,
        seats: {},
        extras: normalizedExtras,
        contact: normalizedContact,
        total: 0,
        seatLayouts,
        status: data.status ?? "confirmed",
        checkedIn: data.checkedIn ?? { out: [], in: [] },
        channel: data.channel === "desk" ? "desk" : "web",
        ownerEmail: data.channel === "desk" ? null : (data.ownerEmail ? normalizeEmailIdentity(data.ownerEmail) : null),
        submissionId: data.submissionId,
      };

      // A new booking has no seat ownership privileges, even if a caller supplies checkedIn.
      try {
        if (!data.seats || typeof data.seats !== "object" || Array.isArray(data.seats)) throw new Error("Invalid seat map.");
        created.seats = validateUpdateSeatsAssignments(
          { ...created, status: "confirmed", checkedIn: { out: [], in: [] }, seatLayouts },
          data.seats,
          { outbound: effectiveOutbound, inbound: effectiveInbound },
          undefined,
          {
            layoutOut: outSnapshot,
            layoutIn: inSnapshot,
            occupiedSeatsOut: occupiedOut,
            occupiedSeatsIn: occupiedIn,
          },
        );
      } catch (error) {
        throw new BookingCreationError("invalid_seats", error instanceof Error ? error.message : "Invalid seats.");
      }
      created.pricingSnapshot = pricingSnapshot(catalog, data.fareId, data.criteria.cabin);
      created.total = bookingTotal(created, created.pricingSnapshot).total;

      state.bookings = [created, ...state.bookings];
      return { commit: true, result: { ...created } };
    });
  }

  public async cancel(ref: string): Promise<Booking> {
    if (!ref || typeof ref !== "string") {
      throw new Error("Cannot cancel booking: reference is required.");
    }
    const clean = ref.trim().toUpperCase();

    return this.coordinator.mutateAsync((state) => {
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
        pricingSnapshot: resolveBookingPricing(existing),
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

    return this.coordinator.mutateAsync((state) => {
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
        pricingSnapshot: resolveBookingPricing(existing),
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

    return this.coordinator.conditionalMutateAsync((state) => {
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

      // Resolve effective flights within current transaction overrides without snapshot fallbacks
      const baseOutbound = flightById(existing.outbound.id);
      const effectiveOutbound = baseOutbound
        ? getEffectiveFlight(baseOutbound, state.flightOverrides[baseOutbound.id])
        : null;

      let effectiveInbound: Flight | null = null;
      if (existing.inbound) {
        const baseInbound = flightById(existing.inbound.id);
        effectiveInbound = baseInbound
          ? getEffectiveFlight(baseInbound, state.flightOverrides[baseInbound.id])
          : null;
      }

      // Resolve sealed layout snapshot: preserve stored snapshot or seal frozen legacy fallback
      const sealedLayouts: BookingSeatLayoutsV1 = existing.seatLayouts ?? {
        version: 1,
        out: FROZEN_LEGACY_SEAT_LAYOUT,
        in: existing.inbound ? FROZEN_LEGACY_SEAT_LAYOUT : undefined,
      };

      // Derive transactional cross-PNR occupied seats excluding current booking
      const occupiedOut = getCanonicalOccupiedSeats(state.bookings, existing.outbound.id, existing.ref);
      const occupiedIn = existing.inbound
        ? getCanonicalOccupiedSeats(state.bookings, existing.inbound.id, existing.ref)
        : new Set<string>();

      // Pure domain validation for seat syntax, cabin zone, availability, immutability, duplicates, leg preservation
      const nextSeats = validateUpdateSeatsAssignments(
        { ...existing, seatLayouts: sealedLayouts },
        seats,
        {
          outbound: effectiveOutbound,
          inbound: effectiveInbound,
        },
        undefined,
        {
          layoutOut: sealedLayouts.out,
          layoutIn: sealedLayouts.in,
          occupiedSeatsOut: occupiedOut,
          occupiedSeatsIn: occupiedIn,
        },
      );

      // Genuine no-op: if prospective seats are identical to existing seats, return existing booking unchanged
      const isNoOp =
        Object.keys(existing.seats).length === Object.keys(nextSeats).length &&
        Object.entries(existing.seats).every(([k, v]) => nextSeats[k] === v);

      if (isNoOp) {
        return { commit: false, result: { ...existing } };
      }

      // Invariant: Canonical pricing recalculation using latest booking facts and leg-aware extra legroom
      const nextTotal = bookingTotal({
        outbound: existing.outbound,
        inbound: existing.inbound,
        fareId: existing.fareId,
        criteria: existing.criteria,
        seats: nextSeats,
        extras: existing.extras,
        seatLayouts: sealedLayouts,
      }, resolveBookingPricing(existing)).total;

      const updated: Booking = {
        ...existing,
        pricingSnapshot: resolveBookingPricing(existing),
        seatLayouts: sealedLayouts,
        seats: nextSeats,
        total: nextTotal,
      };

      state.bookings[index] = updated;
      return { commit: true, result: { ...updated } };
    });
  }

  public async updateExtras(
    ref: string,
    extras: Extras,
  ): Promise<Booking> {
    if (!ref || typeof ref !== "string") {
      throw new Error("Cannot update extras: reference is required.");
    }
    const catalog = await this.commercial.get();
    const clean = ref.trim().toUpperCase();

    return this.coordinator.conditionalMutateAsync((state) => {
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

      extras = validateBookingExtras(extras, existing.passengers.length, catalog.catalog, existing.extras);
      if (JSON.stringify(extras) === JSON.stringify(existing.extras)) return { commit: false, result: { ...existing } };
      // Invariant: Canonical pricing recalculation using latest booking facts
      const nextTotal = bookingTotal({
        outbound: existing.outbound,
        inbound: existing.inbound,
        fareId: existing.fareId,
        criteria: existing.criteria,
        seats: existing.seats,
        extras,
        seatLayouts: existing.seatLayouts,
      }, resolveBookingPricing(existing)).total;

      const updated: Booking = {
        ...existing,
        pricingSnapshot: resolveBookingPricing(existing),
        extras: { ...extras },
        total: nextTotal,
      };

      state.bookings[index] = updated;
      return { commit: true, result: { ...updated } };
    });
  }

  public async completeCheckIn(input: CheckInCommandInput): Promise<Booking> {
    if (!input.ref || typeof input.ref !== "string") {
      throw new Error("Cannot complete check-in: reference is required.");
    }
    const clean = input.ref.trim().toUpperCase();

    return this.coordinator.conditionalMutateAsync((state) => {
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

      // Step 1: Validate passenger index list and seat keys BEFORE replay handling or doc/seat processing
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

      if (input.seats) {
        for (const [key, seat] of Object.entries(input.seats)) {
          if (!/^(0|[1-9]\d*)$/.test(key)) {
            throw new Error(`Invalid passenger index key '${key}' in check-in seats.`);
          }
          const paxIdx = Number.parseInt(key, 10);
          if (paxIdx < 0 || paxIdx >= existing.passengers.length) {
            throw new Error(`Invalid passenger index ${paxIdx} on booking ${clean}: index out of range.`);
          }
          if (!input.selectedPaxIndexes.includes(paxIdx)) {
            throw new Error(`Cannot assign seat for unselected passenger index ${paxIdx} during check-in.`);
          }
          const pax = existing.passengers[paxIdx];
          if (pax?.type === "infant") {
            throw new Error(`Cannot assign seat to infant passenger at index ${paxIdx}. Infants travel on an adult's lap.`);
          }
          if (!isValidSeatSyntax(seat)) {
            throw new Error(
              `Invalid seat syntax '${seat}' for passenger ${paxIdx} on leg ${input.leg}. Must be row (1-60) followed by letter (A-Z).`,
            );
          }
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
          return { commit: false, result: { ...existing } };
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

      // Step 5: Pure domain seat allocation and validation with layout and cross-PNR occupancy
      const sealedLayouts: BookingSeatLayoutsV1 = existing.seatLayouts ?? {
        version: 1,
        out: FROZEN_LEGACY_SEAT_LAYOUT,
        in: existing.inbound ? FROZEN_LEGACY_SEAT_LAYOUT : undefined,
      };

      const occupied = getCanonicalOccupiedSeats(state.bookings, bookedFlight.id, existing.ref);
      const legLayout = input.leg === "in" ? sealedLayouts.in : sealedLayouts.out;

      const nextSeats = validateCheckInSeats(
        { ...existing, seatLayouts: sealedLayouts },
        input.leg,
        input.selectedPaxIndexes,
        input.seats,
        effectiveFlight,
        { layout: legLayout, occupiedSeats: occupied },
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

      // Recalculate total if seat charges changed (leg-aware extra legroom)
      const nextTotal = bookingTotal({
        outbound: existing.outbound,
        inbound: existing.inbound,
        fareId: existing.fareId,
        criteria: existing.criteria,
        seats: nextSeats,
        extras: existing.extras,
        seatLayouts: sealedLayouts,
      }, resolveBookingPricing(existing)).total;

      const updated: Booking = {
        ...existing,
        pricingSnapshot: resolveBookingPricing(existing),
        seatLayouts: sealedLayouts,
        passengers: nextPassengers,
        seats: nextSeats,
        checkedIn: nextCheckedIn,
        total: nextTotal,
      };

      state.bookings[index] = updated;
      return { commit: true, result: { ...updated } };
    });
  }

  public async undoCheckIn(input: UndoCheckInCommandInput): Promise<Booking> {
    if (!input || !input.ref || typeof input.ref !== "string") {
      throw new Error("Cannot undo check-in: reference is required.");
    }
    if (input.leg !== "out" && input.leg !== "in") {
      throw new Error("Cannot undo check-in: leg must be 'out' or 'in'.");
    }
    if (!Array.isArray(input.selectedPaxIndexes) || input.selectedPaxIndexes.length === 0) {
      throw new Error("Cannot undo check-in: selectedPaxIndexes array must not be empty.");
    }

    const seenIndexes = new Set<number>();
    for (const idx of input.selectedPaxIndexes) {
      if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0) {
        throw new Error(`Invalid passenger index: ${idx}. Must be a non-negative integer.`);
      }
      if (seenIndexes.has(idx)) {
        throw new Error(`Duplicate passenger index in undo check-in: ${idx}.`);
      }
      seenIndexes.add(idx);
    }

    const clean = input.ref.trim().toUpperCase();

    return this.coordinator.conditionalMutateAsync((state) => {
      const index = state.bookings.findIndex((b) => b.ref.toUpperCase() === clean);
      if (index === -1) {
        throw new Error(`Booking ${clean} not found.`);
      }

      const existing = state.bookings[index];
      if (!existing) {
        throw new Error(`Booking ${clean} not found.`);
      }
      if (existing.status === "cancelled") {
        throw new Error("Cannot undo check-in for a cancelled booking.");
      }
      if (input.leg === "in" && !existing.inbound) {
        throw new Error("Cannot undo check-in: inbound leg does not exist on this booking.");
      }

      for (const idx of input.selectedPaxIndexes) {
        if (idx >= existing.passengers.length) {
          throw new Error(`Passenger index ${idx} is out of range.`);
        }
        if (existing.passengers[idx]?.type === "infant") {
          throw new Error(`Passenger at index ${idx} is an infant. Infants cannot be independently undone.`);
        }
      }

      const currentChecked = existing.checkedIn?.[input.leg] ?? [];
      const toRemove = input.selectedPaxIndexes.filter((i) => currentChecked.includes(i));

      // Already not checked in -> genuine no-op, commit: false (no write, no notification)
      if (toRemove.length === 0) {
        return { commit: false, result: { ...existing } };
      }

      const nextChecked = currentChecked.filter((i) => !toRemove.includes(i));
      const updated: Booking = {
        ...existing,
        pricingSnapshot: resolveBookingPricing(existing),
        checkedIn: {
          ...existing.checkedIn,
          [input.leg]: nextChecked,
        },
      };

      state.bookings[index] = updated;
      return { commit: true, result: { ...updated } };
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
    return this.coordinator.conditionalMutateAsync<ClaimResult>((state) => {
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
        pricingSnapshot: resolveBookingPricing(candidate),
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

    return this.coordinator.mutateAsync((state) => {
      const beforeCount = state.bookings.length;
      state.bookings = state.bookings.filter((b) => b.ref.toUpperCase() !== clean);
      return state.bookings.length !== beforeCount;
    });
  }
}
