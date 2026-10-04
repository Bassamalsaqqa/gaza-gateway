import type {
  Schedule,
  ScheduleCreateInput,
  ScheduleRepository,
  ScheduleUpdateInput,
} from "./types.ts";
import { parseSchedule } from "./schema.ts";
import { ScheduleStorageCoordinator } from "./storage.ts";
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
  constructor(coordinator: ScheduleStorageCoordinator) {
    this.coordinator = coordinator;
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
    const parsed = parseSchedule(input);
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
    return this.coordinator.mutate((candidate) => {
      const index = candidate.schedules.findIndex((entry) => entry.id === id);
      if (index < 0) throw new ScheduleNotFoundError();
      const updated = parseSchedule({ ...candidate.schedules[index], ...patch, id });
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
