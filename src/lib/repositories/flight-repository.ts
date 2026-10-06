import type { Flight } from "../data.ts";
import { validateAircraftAssignment } from "../fleet/assignment.ts";
import { getEffectiveFlight, isSyntheticFlightId, sanitizeFlightOverride, type FlightOverride } from "../domain/flight.ts";
import type { FlightRepository, MonthlyServiceMap } from "./types.ts";
import type { FleetRepository } from "../fleet/types.ts";
import { LocalFleetRepository } from "../fleet/repository.ts";
import { FleetStorageCoordinator } from "../fleet/storage.ts";
import { isFlightBookable } from "../booking-rules.ts";
import { RepoStorageCoordinator, type RepoStorageV1 } from "./storage.ts";
import { createStandaloneServiceResolver, matchesFlightDirection, type DatedServiceResolver } from "../dated-services/resolver.ts";
import { isDatedServiceId } from "../dated-services/identity.ts";
import { isLegacyFlightId, legacyFlightById } from "../dated-services/legacy.ts";
import { bookingFlightSnapshots } from "../dated-services/compatibility.ts";

/** Current-sale discovery and broader operational compatibility are separate contracts. */
export class LocalFlightRepository implements FlightRepository {
  private readonly coordinator: RepoStorageCoordinator;
  private readonly fleet: FleetRepository;
  private readonly resolver: DatedServiceResolver;
  private readonly listeners = new Set<() => void>();
  private readonly cleanup: (() => void)[];
  constructor(coordinatorOrInitial?: RepoStorageCoordinator | RepoStorageV1,
    options?: { storage?: Storage | null; fleet?: FleetRepository; resolver?: DatedServiceResolver }) {
    this.coordinator = coordinatorOrInitial instanceof RepoStorageCoordinator ? coordinatorOrInitial :
      new RepoStorageCoordinator({ initialData: coordinatorOrInitial, storage: options?.storage });
    this.fleet = options?.fleet ?? new LocalFleetRepository(new FleetStorageCoordinator({ storage: options?.storage }));
    this.resolver = options?.resolver ?? createStandaloneServiceResolver(options?.storage);
    const notify = () => { for (const listener of this.listeners) { try { listener(); } catch { /* committed changes remain successful */ } } };
    this.cleanup = [this.coordinator.subscribe(notify), this.resolver.subscribe(notify)];
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  destroy(): void { for (const unsubscribe of this.cleanup.splice(0)) unsubscribe(); this.listeners.clear(); }
  private readState(): RepoStorageV1 {
    return this.coordinator.conditionalMutate(state => ({ commit: false, result: state }));
  }
  async getFlights(date: string, direction?: "dep" | "arr"): Promise<Flight[]> {
    const current = await this.resolver.listCurrentFlights(date, direction);
    const state = this.readState();
    const flights = new Map(current.map(f => [f.id, f]));
    for (const f of bookingFlightSnapshots(state.bookings)) {
      if (f.date === date && matchesFlightDirection(f, direction) && !flights.has(f.id)) flights.set(f.id, f);
    }
    for (const id of Object.keys(state.flightOverrides)) {
      if (!isLegacyFlightId(id) || flights.has(id)) continue;
      const f = legacyFlightById(id);
      if (f && f.date === date && matchesFlightDirection(f, direction)) flights.set(id, f);
    }
    return [...flights.values()].map(f => getEffectiveFlight(f, state.flightOverrides[f.id]))
      .sort((a, b) => a.departTime.localeCompare(b.departTime) || a.number.localeCompare(b.number) || a.id.localeCompare(b.id));
  }
  async searchFlights(origin: string, destination: string, date: string): Promise<Flight[]> {
    if (!origin || !destination || !date) return [];
    const current = await this.resolver.searchCurrentFlights(origin, destination, date);
    const state = this.readState();
    return current.map(f => getEffectiveFlight(f, state.flightOverrides[f.id]));
  }
  async getCurrentFlightById(id: string): Promise<Flight | null> {
    const base = await this.resolver.resolveCurrentFlightById(id);
    if (!base) return null;
    return getEffectiveFlight(base, this.readState().flightOverrides[id]);
  }
  async getFlightById(id: string): Promise<Flight | null> {
    if (!id || typeof id !== "string") return null;
    let base: Flight | null = null, authorityError: unknown;
    if (isDatedServiceId(id)) {
      try { base = await this.resolver.resolveCurrentFlightById(id); } catch (error) { authorityError = error; }
    }
    const state = this.readState();
    base ??= bookingFlightSnapshots(state.bookings).find(f => f.id === id) ?? null;
    if (!base && isLegacyFlightId(id)) base = legacyFlightById(id);
    if (!base && authorityError) throw authorityError;
    return base ? getEffectiveFlight(base, state.flightOverrides[id]) : null;
  }
  async getMonthlyServiceMap(year: number, month: number, origin: string, destination: string,
    options?: { paxCount?: number; now?: Date | string | number }): Promise<MonthlyServiceMap> {
    if (!origin || !destination || !year || !month) return {};
    const snapshot = await this.resolver.readSnapshot(), state = this.readState();
    const result: MonthlyServiceMap = {};
    for (let day = 1; day <= new Date(year, month, 0).getDate(); day++) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const flights = this.resolver.project(snapshot, date, options)
        .filter(f => f.originCode === origin.trim().toUpperCase() && f.destinationCode === destination.trim().toUpperCase())
        .map(f => getEffectiveFlight(f, state.flightOverrides[f.id])).filter(f => isFlightBookable(f, options));
      result[date] = { date, hasService: flights.length > 0, lowestFare: flights.length ? Math.min(...flights.map(f => f.basePrice)) : null, flightCount: flights.length };
    }
    return result;
  }
  async getOverrides(): Promise<Record<string, FlightOverride>> { return structuredClone(this.readState().flightOverrides); }
  async getOverride(id: string): Promise<FlightOverride | null> { return structuredClone(this.readState().flightOverrides[id] ?? null); }

  public async setOverride(flightId: string, patch: FlightOverride): Promise<void> {
    if (!flightId || typeof flightId !== "string") return;

    // Block synthetic flights from persisting overrides
    if (isSyntheticFlightId(flightId)) {
      return;
    }

    const cleanPatch = sanitizeFlightOverride(patch);
    if (!cleanPatch) return;

    const current = await this.getFlightById(flightId);
    if (!current) throw new Error("Flight is not available for operational editing.");
    const hasEquipment = cleanPatch.aircraftId !== undefined || cleanPatch.aircraft !== undefined;
    const unchanged = current &&
      (cleanPatch.aircraftId === undefined || cleanPatch.aircraftId === current.aircraftId) &&
      (cleanPatch.aircraft === undefined || cleanPatch.aircraft === current.aircraft);
    if (hasEquipment && !unchanged) {
      Object.assign(cleanPatch, await validateAircraftAssignment(this.fleet, cleanPatch));
    } else if (unchanged) {
      // This command is operational-only; do not restore stale equipment if another
      // writer assigns a different aircraft before the booking-store lock is acquired.
      delete cleanPatch.aircraftId;
      delete cleanPatch.aircraft;
    }

    await this.coordinator.mutateAsync((state) => {
      const current = state.flightOverrides[flightId] ?? {};
      state.flightOverrides[flightId] = {
        ...current,
        ...cleanPatch,
      };
    });
  }

  public async clearOverride(flightId: string): Promise<void> {
    if (!flightId || typeof flightId !== "string") return;

    await this.coordinator.mutateAsync((state) => {
      if (state.flightOverrides[flightId]) {
        delete state.flightOverrides[flightId];
      }
    });
  }
}
