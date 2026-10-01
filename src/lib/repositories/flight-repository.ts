/**
 * Gaza Gateway — Canonical Flight Repository Implementation
 *
 * Provides the single source of truth and single writer for the Flight aggregate:
 * - Reads deterministic scheduled flights from `src/lib/data.ts`.
 * - Composes base flights with mutable operational overrides using pure `getEffectiveFlight()`.
 * - Persists overrides to `gza.repo.v1`.
 * - Isolates synthetic Studio scenarios and capacity proof flights.
 * - Reactive listener notifications for cache synchronization across public & admin.
 */

import { arrivalsOn, departuresOn, flightById, type Flight } from "../data.ts";
import {
  getEffectiveFlight,
  isSyntheticFlightId,
  sanitizeFlightOverride,
  type FlightOverride,
} from "../domain/flight.ts";
import type { FlightRepository, MonthlyServiceMap } from "./types.ts";
import { isFlightBookable } from "../booking-rules.ts";
import {
  RepoStorageCoordinator,
  type RepoStorageV1,
} from "./storage.ts";

export class LocalFlightRepository implements FlightRepository {
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
        console.error("FlightRepository listener error:", err);
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

  public async getFlights(date: string, direction?: "dep" | "arr"): Promise<Flight[]> {
    let pool: Flight[];
    if (direction === "dep") {
      pool = departuresOn(date);
    } else if (direction === "arr") {
      pool = arrivalsOn(date);
    } else {
      pool = [...departuresOn(date), ...arrivalsOn(date)];
    }

    const overrides = this.coordinator.getState().flightOverrides;
    return pool.map((flight) => {
      const override = overrides[flight.id];
      return getEffectiveFlight(flight, override);
    });
  }

  public async searchFlights(origin: string, destination: string, date: string): Promise<Flight[]> {
    if (!origin || !destination || !date) return [];
    const cleanOrigin = origin.trim().toUpperCase();
    const cleanDest = destination.trim().toUpperCase();

    // Inbound discovery: if origin is GZA, direction is Gaza departure; if destination is GZA, direction is arrival
    const direction = cleanOrigin === "GZA" ? "dep" : cleanDest === "GZA" ? "arr" : undefined;
    const flights = await this.getFlights(date, direction);

    return flights.filter(
      (f) =>
        f.originCode.toUpperCase() === cleanOrigin &&
        f.destinationCode.toUpperCase() === cleanDest &&
        f.date === date,
    );
  }

  public async getMonthlyServiceMap(
    year: number,
    month: number,
    origin: string,
    destination: string,
    options?: { paxCount?: number; now?: Date | string | number },
  ): Promise<MonthlyServiceMap> {
    if (!origin || !destination || !year || !month) return {};
    const cleanOrigin = origin.trim().toUpperCase();
    const cleanDest = destination.trim().toUpperCase();

    const daysInMonth = new Date(year, month, 0).getDate();
    const result: MonthlyServiceMap = {};
    const overrides = this.coordinator.getState().flightOverrides;

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dayStr = String(day).padStart(2, "0");
      const monthStr = String(month).padStart(2, "0");
      const date = `${year}-${monthStr}-${dayStr}`;

      const pool =
        cleanOrigin === "GZA"
          ? departuresOn(date)
          : cleanDest === "GZA"
            ? arrivalsOn(date)
            : [...departuresOn(date), ...arrivalsOn(date)];

      const effectiveFlights = pool
        .filter(
          (f) =>
            f.originCode.toUpperCase() === cleanOrigin &&
            f.destinationCode.toUpperCase() === cleanDest &&
            f.date === date,
        )
        .map((f) => getEffectiveFlight(f, overrides[f.id]));

      // Only bookable flights qualify as sellable service and lowest fare calculation
      const bookableFlights = effectiveFlights.filter((f) => isFlightBookable(f, options));

      if (bookableFlights.length > 0) {
        const lowestFare = Math.min(...bookableFlights.map((f) => f.basePrice));
        result[date] = {
          date,
          hasService: true,
          lowestFare,
          flightCount: bookableFlights.length,
        };
      } else {
        result[date] = {
          date,
          hasService: false,
          lowestFare: null,
          flightCount: 0,
        };
      }
    }

    return result;
  }

  public async getFlightById(id: string): Promise<Flight | null> {
    if (!id || typeof id !== "string") return null;
    const base = flightById(id);
    if (!base) return null;

    const override = this.coordinator.getState().flightOverrides[base.id];
    return getEffectiveFlight(base, override);
  }

  public async getOverrides(): Promise<Record<string, FlightOverride>> {
    return { ...this.coordinator.getState().flightOverrides };
  }

  public async getOverride(flightId: string): Promise<FlightOverride | null> {
    if (!flightId || typeof flightId !== "string") return null;
    return this.coordinator.getState().flightOverrides[flightId] ?? null;
  }

  public async setOverride(flightId: string, patch: FlightOverride): Promise<void> {
    if (!flightId || typeof flightId !== "string") return;

    // Block synthetic flights from persisting overrides
    if (isSyntheticFlightId(flightId)) {
      return;
    }

    const cleanPatch = sanitizeFlightOverride(patch);
    if (!cleanPatch) return;

    this.coordinator.mutate((state) => {
      const current = state.flightOverrides[flightId] ?? {};
      state.flightOverrides[flightId] = {
        ...current,
        ...cleanPatch,
      };
    });
  }

  public async clearOverride(flightId: string): Promise<void> {
    if (!flightId || typeof flightId !== "string") return;

    this.coordinator.mutate((state) => {
      if (state.flightOverrides[flightId]) {
        delete state.flightOverrides[flightId];
      }
    });
  }
}
