import type { Flight } from "./data.ts";
import type { CurrentServiceSnapshot, DatedServiceResolver, ServiceClock } from "./dated-services/resolver.ts";
import { matchesFlightDirection } from "./dated-services/resolver.ts";
import { legacyArrivalsOn, legacyDeparturesOn, legacyFlightById, legacySearchFlights } from "./dated-services/legacy.ts";

/** Appearance Studio fixture catalog only. Registry injection requires isolated memory storage. */
export class IsolatedStudioFlightResolver implements DatedServiceResolver {
  async readSnapshot(): Promise<CurrentServiceSnapshot> { return { schedules: [], networks: [] }; }
  project(_snapshot: CurrentServiceSnapshot, date: string, options?: ServiceClock): Flight[] {
    return [...legacyDeparturesOn(date, options?.now), ...legacyArrivalsOn(date, options?.now)]
      .sort((a, b) => a.departTime.localeCompare(b.departTime) || a.id.localeCompare(b.id));
  }
  async listCurrentFlights(date: string, direction?: "dep" | "arr", options?: ServiceClock): Promise<Flight[]> {
    return this.project(await this.readSnapshot(), date, options).filter(f => matchesFlightDirection(f, direction));
  }
  async searchCurrentFlights(origin: string, destination: string, date: string, options?: ServiceClock): Promise<Flight[]> {
    return legacySearchFlights(origin, destination, date, options?.now);
  }
  async resolveCurrentFlightById(id: string): Promise<Flight | null> { return legacyFlightById(id); }
  subscribe(): () => void { return () => {}; }
}
