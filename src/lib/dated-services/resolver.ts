import type { Flight } from "../data.ts";
import type { Schedule, ScheduleRepository } from "../schedules/types.ts";
import type { NetworkDestination, NetworkRepository } from "../network/types.ts";
import { LocalScheduleRepository } from "../schedules/repository.ts";
import { ScheduleStorageCoordinator } from "../schedules/storage.ts";
import { LocalNetworkRepository } from "../network/repository.ts";
import { NetworkStorageCoordinator } from "../network/storage.ts";
import { routeBasePriceByCode } from "../destination-reference.ts";
import { parseDatedServiceId } from "./identity.ts";
import { materializeSchedulesOnDate } from "./materializer.ts";

export class CurrentFlightAuthorityError extends Error {
  public override readonly cause?: unknown;
  constructor(cause?: unknown) {
    super("Current Flight authority is unavailable.");
    this.name = "CurrentFlightAuthorityError";
    this.cause = cause;
  }
}
export interface CurrentServiceSnapshot {
  schedules: Schedule[];
  networks: NetworkDestination[];
}
export interface ServiceClock { now?: Date | string | number }
/** Read model only. Snapshots are sampled across independent stores, not cross-store ACID. */
export interface DatedServiceResolver {
  readSnapshot(): Promise<CurrentServiceSnapshot>;
  project(snapshot: CurrentServiceSnapshot, date: string, options?: ServiceClock): Flight[];
  listCurrentFlights(date: string, direction?: "dep" | "arr", options?: ServiceClock): Promise<Flight[]>;
  searchCurrentFlights(origin: string, destination: string, date: string, options?: ServiceClock): Promise<Flight[]>;
  resolveCurrentFlightById(id: string, options?: ServiceClock): Promise<Flight | null>;
  subscribe(listener: () => void): () => void;
}

export class LocalDatedServiceResolver implements DatedServiceResolver {
  private readonly schedules: ScheduleRepository;
  private readonly network: NetworkRepository;
  constructor(schedules: ScheduleRepository, network: NetworkRepository) {
    this.schedules = schedules; this.network = network;
  }
  async readSnapshot(): Promise<CurrentServiceSnapshot> {
    try {
      const [schedules, networks] = await Promise.all([this.schedules.listForDiscovery(), this.network.list()]);
      return { schedules, networks };
    } catch (cause) { throw new CurrentFlightAuthorityError(cause); }
  }
  project(snapshot: CurrentServiceSnapshot, date: string, options?: ServiceClock): Flight[] {
    try {
      return materializeSchedulesOnDate({ ...snapshot, date, now: options?.now,
        routePrices: (code) => routeBasePriceByCode(code) ?? NaN });
    } catch (cause) { throw new CurrentFlightAuthorityError(cause); }
  }
  async listCurrentFlights(date: string, direction?: "dep" | "arr", options?: ServiceClock): Promise<Flight[]> {
    const flights = this.project(await this.readSnapshot(), date, options);
    return flights.filter(f => matchesFlightDirection(f, direction));
  }
  async searchCurrentFlights(origin: string, destination: string, date: string, options?: ServiceClock): Promise<Flight[]> {
    return (await this.listCurrentFlights(date, undefined, options)).filter(f =>
      f.originCode === origin.trim().toUpperCase() && f.destinationCode === destination.trim().toUpperCase());
  }
  async resolveCurrentFlightById(id: string, options?: ServiceClock): Promise<Flight | null> {
    const parsed = parseDatedServiceId(id);
    if (!parsed) return null;
    const snapshot = await this.readSnapshot();
    snapshot.schedules = snapshot.schedules.filter(s => s.id === parsed.scheduleId);
    return this.project(snapshot, parsed.date, options).find(f => f.id === id) ?? null;
  }
  subscribe(listener: () => void): () => void {
    const schedule = this.schedules.subscribe(listener), network = this.network.subscribe(listener);
    return () => { schedule(); network(); };
  }
}
export function matchesFlightDirection(f: Flight, direction?: "dep" | "arr"): boolean {
  return direction === "dep" ? f.originCode === "GZA" : direction === "arr" ? f.destinationCode === "GZA" : true;
}
/** Standalone/test construction. The application registry always injects its shared resolver. */
export function createStandaloneServiceResolver(storage?: Storage | null): DatedServiceResolver {
  const inMemoryOnly = typeof window === "undefined" && storage === undefined;
  const network = new LocalNetworkRepository(new NetworkStorageCoordinator({ storage, inMemoryOnly }));
  const schedules = new LocalScheduleRepository(new ScheduleStorageCoordinator({ storage, inMemoryOnly }), undefined, network);
  return new LocalDatedServiceResolver(schedules, network);
}
