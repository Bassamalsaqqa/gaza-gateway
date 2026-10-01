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
import type { BookingRepository, ClaimResult } from "./types.ts";
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
      const baseOutbound = flightById(data.outbound.id) ?? data.outbound;
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
        const baseInbound = flightById(data.inbound.id) ?? data.inbound;
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
