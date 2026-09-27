/**
 * Gaza Gateway — Canonical Booking Repository Implementation
 *
 * Provides the single source of truth and single writer for the Booking aggregate.
 * Enforces bookability invariants, stable passenger IDs, duplicate-PNR conflict resolution,
 * Studio/capacity fixture isolation, and reactive subscriber notifications.
 */

import type { Booking, BookingCreateInput, BookingPassenger, Leg } from "../domain/booking.ts";
import { makePassengerId } from "../domain/booking.ts";
import { isSyntheticFlightId } from "../domain/flight.ts";
import { isFlightBookable } from "../booking-rules.ts";
import { makePnr } from "../format.ts";
import type { BookingRepository } from "./types.ts";
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
    // 1. Studio & synthetic flight fixture isolation
    if (
      isSyntheticFlightId(data.outbound?.id) ||
      (data.inbound && isSyntheticFlightId(data.inbound.id))
    ) {
      throw new Error("Cannot create booking: synthetic test fixture flight cannot be booked.");
    }

    // 2. Strict bookability guard
    const seatPaxCount =
      data.passengers.filter((p) => p.type !== "infant").length || 1;
    if (!isFlightBookable(data.outbound, { paxCount: seatPaxCount })) {
      throw new Error("Cannot create booking: outbound flight is not bookable.");
    }
    if (data.inbound && !isFlightBookable(data.inbound, { paxCount: seatPaxCount })) {
      throw new Error("Cannot create booking: inbound flight is not bookable.");
    }

    // 3. Atomically mutate and ensure unique PNR
    return this.coordinator.mutate((state) => {
      const existingRefs = new Set(state.bookings.map((b) => b.ref.toUpperCase()));
      let pnr = (data.ref ? data.ref.trim().toUpperCase() : makePnr());

      // If candidate PNR already exists, generate fresh unique PNR
      while (existingRefs.has(pnr)) {
        pnr = makePnr();
      }

      // 4. Assign deterministic, stable passenger IDs: `pax-${ref}-${index}`
      const passengers: BookingPassenger[] = data.passengers.map((p, idx) => ({
        id: "id" in p && p.id && !p.id.startsWith("pax-TEMP") ? p.id : makePassengerId(pnr, idx),
        type: p.type ?? "adult",
        firstName: p.firstName ?? "",
        lastName: p.lastName ?? "",
        dob: p.dob ?? "",
        nationality: p.nationality ?? "Palestinian",
        document: p.document ?? "",
        withAdult: p.withAdult,
      }));

      const created: Booking = {
        ref: pnr,
        createdAt: data.createdAt ?? new Date().toISOString(),
        criteria: data.criteria,
        outbound: data.outbound,
        inbound: data.inbound ?? null,
        fareId: data.fareId,
        passengers,
        seats: { ...data.seats },
        extras: { ...data.extras },
        contact: { ...data.contact },
        total: data.total,
        status: data.status ?? "confirmed",
        checkedIn: data.checkedIn ?? { out: [], in: [] },
        ownerEmail: data.ownerEmail ?? null,
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

  public async claim(ref: string, accountEmail: string): Promise<Booking | null> {
    if (!ref || typeof ref !== "string" || !accountEmail) return null;
    const clean = ref.trim().toUpperCase();

    return this.coordinator.mutate((state) => {
      const index = state.bookings.findIndex((b) => b.ref.toUpperCase() === clean);
      if (index === -1) return null;

      const existing = state.bookings[index];
      if (!existing) return null;

      if (existing.ownerEmail) {
        // Already owned
        return { ...existing };
      }

      const updated: Booking = {
        ...existing,
        account: true,
        ownerEmail: accountEmail.trim(),
      };

      state.bookings[index] = updated;
      return { ...updated };
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
