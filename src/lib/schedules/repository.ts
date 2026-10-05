import { validateAircraftAssignment } from "../fleet/assignment.ts";
import { aircraftNameToSeedId } from "../fleet/layout.ts";
import type {
  Schedule,
  ScheduleCreateInput,
  ScheduleRepository,
  ScheduleUpdateInput,
} from "./types.ts";
import { parseSchedule, ScheduleValidationError } from "./schema.ts";
import { ScheduleStorageCoordinator } from "./storage.ts";
import type { FleetRepository } from "../fleet/types.ts";
import { LocalFleetRepository } from "../fleet/repository.ts";
export { ScheduleValidationError } from "./schema.ts";
export { ScheduleStorageWriteError } from "./storage.ts";
export class ScheduleNotFoundError extends Error {
  constructor() {
    super("Schedule not found.");
    this.name = "ScheduleNotFoundError";
  }
}
export class ScheduleIdentityConflictError extends Error {
  constructor() {
    super("Schedule identity already exists with different data.");
    this.name = "ScheduleIdentityConflictError";
  }
}
/** Planning only: dated FlightRepository has no dependency on this repository. */
export class LocalScheduleRepository implements ScheduleRepository {
  private readonly coordinator: ScheduleStorageCoordinator;
  private readonly fleet: FleetRepository;
  constructor(coordinator: ScheduleStorageCoordinator, fleet?: FleetRepository) {
    this.coordinator = coordinator;
    this.fleet = fleet ?? new LocalFleetRepository();
  }
  subscribe(listener: () => void): () => void {
    return this.coordinator.subscribe(listener);
  }
  async list(): Promise<Schedule[]> {
    return this.coordinator.read().schedules;
  }
  async getById(id: string): Promise<Schedule | null> {
    return this.coordinator.read().schedules.find((entry) => entry.id === id) ?? null;
  }
  async create(input: ScheduleCreateInput): Promise<Schedule> {
    // Replay committed identity before consulting mutable Fleet authority.
    const normalized = parseSchedule(input);
    const committed = await this.getById(normalized.id);
    if (committed) {
      if (JSON.stringify(committed) === JSON.stringify(normalized)) return committed;
      throw new ScheduleIdentityConflictError();
    }
    const assignment = await validateAircraftAssignment(this.fleet, normalized);
    const parsed = parseSchedule({ ...normalized, ...assignment });
    return this.coordinator.mutate((candidate) => {
      const existing = candidate.schedules.find((entry) => entry.id === parsed.id);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(parsed)) return existing;
        throw new ScheduleIdentityConflictError();
      }
      candidate.schedules.push(parsed);
      return parsed;
    });
  }
  async update(id: string, patch: ScheduleUpdateInput): Promise<Schedule> {
    const existing = await this.getById(id);
    if (!existing) throw new ScheduleNotFoundError();
    const currentId = existing.aircraftId ?? aircraftNameToSeedId(existing.aircraft);
    const assignmentChanged =
      (patch.aircraftId !== undefined && patch.aircraftId !== currentId) ||
      (patch.aircraft !== undefined && patch.aircraft !== existing.aircraft);
    const nextPatch = { ...patch };
    if (assignmentChanged) {
      Object.assign(nextPatch, await validateAircraftAssignment(this.fleet, {
        ...patch,
        ...(patch.aircraftId ? {} : { aircraftId: currentId }),
      }));
    } else {
      delete nextPatch.aircraftId;
      delete nextPatch.aircraft;
    }
    return this.coordinator.mutate((candidate) => {
      const index = candidate.schedules.findIndex((entry) => entry.id === id);
      if (index < 0) throw new ScheduleNotFoundError();
      const current = candidate.schedules[index]!;
      const retainedId = current.aircraftId ?? aircraftNameToSeedId(current.aircraft);
      // Resolve unchanged equipment from the state reread inside the lock, not
      // the preflight snapshot. Known legacy names seal identity on a real rewrite.
      const retainedAssignment = !assignmentChanged && retainedId ? { aircraftId: retainedId } : {};
      const updated = parseSchedule({ ...current, ...nextPatch, ...retainedAssignment, id });
      candidate.schedules[index] = updated;
      return updated;
    });
  }
  async remove(id: string): Promise<void> {
    await this.coordinator.mutate((candidate) => {
      candidate.schedules = candidate.schedules.filter((entry) => entry.id !== id);
    });
  }
}
