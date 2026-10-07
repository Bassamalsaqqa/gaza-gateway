import { validateAircraftAssignment } from "../fleet/assignment.ts";
import { aircraftNameToSeedId } from "../fleet/layout.ts";
import type {
  Schedule,
  ScheduleCreateInput,
  ScheduleException,
  ScheduleMutationReceipt,
  ScheduleRepository,
  ScheduleUpdateInput,
} from "./types.ts";
import { parseSchedule, ScheduleValidationError } from "./schema.ts";
import { ScheduleStorageCoordinator } from "./storage.ts";
import type { FleetRepository } from "../fleet/types.ts";
import { FleetError } from "../fleet/types.ts";
import { LocalFleetRepository } from "../fleet/repository.ts";
import { LocalNetworkRepository } from "../network/repository.ts";
import type { NetworkRepository } from "../network/types.ts";

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

/** Recurring planning authority projected by the shared dated-service resolver. */
export class LocalScheduleRepository implements ScheduleRepository {
  private readonly coordinator: ScheduleStorageCoordinator;
  private readonly fleet: FleetRepository;
  private readonly network: NetworkRepository;

  constructor(
    coordinator: ScheduleStorageCoordinator,
    fleet?: FleetRepository,
    network?: NetworkRepository,
  ) {
    this.coordinator = coordinator;
    this.fleet = fleet ?? new LocalFleetRepository();
    this.network = network ?? new LocalNetworkRepository();
  }

  subscribe(listener: () => void): () => void {
    return this.coordinator.subscribe(listener);
  }

  async list(): Promise<Schedule[]> {
    return this.coordinator.read().schedules;
  }
  async listForDiscovery(): Promise<Schedule[]> {
    return this.coordinator.readForDiscovery().schedules;
  }

  async getById(id: string): Promise<Schedule | null> {
    return this.coordinator.read().schedules.find((entry) => entry.id === id) ?? null;
  }

  async createWithReceipt(input: ScheduleCreateInput): Promise<ScheduleMutationReceipt> {
    // 1. Structural normalization
    const normalized = parseSchedule(input);

    // 2. Canonical committed preflight exact return/conflict BEFORE Network/Fleet
    const committed = await this.getById(normalized.id);
    if (committed) {
      if (JSON.stringify(committed) === JSON.stringify(normalized)) return { schedule: committed, changed: false };
      throw new ScheduleIdentityConflictError();
    }

    // 3. Network route validation
    if (!(await this.network.getByCode(normalized.destination))) {
      throw new ScheduleValidationError([
        { code: "custom", path: ["destination"], message: "Unknown network destination." },
      ]);
    }

    // 4. Base aircraft assignment validation
    const assignment = await validateAircraftAssignment(this.fleet, normalized);

    // 5. Exception aircraft assignment validation
    await validateExceptionAircraftAssignments(this.fleet, normalized.exceptions);

    const parsed = parseSchedule({ ...normalized, ...assignment });

    // 6. Mutate under lock with transaction reread identity guard
    let changed = false;
    const schedule = await this.coordinator.mutate((candidate) => {
      const existing = candidate.schedules.find((entry) => entry.id === parsed.id);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(parsed)) {
          changed = false;
          return existing;
        }
        throw new ScheduleIdentityConflictError();
      }
      candidate.schedules.push(parsed);
      changed = true;
      return parsed;
    });

    return { schedule, changed };
  }

  async create(input: ScheduleCreateInput): Promise<Schedule> {
    const receipt = await this.createWithReceipt(input);
    return receipt.schedule;
  }

  async updateWithReceipt(id: string, patch: ScheduleUpdateInput): Promise<ScheduleMutationReceipt> {
    patch = structuredClone(patch);
    const existing = await this.getById(id);
    if (!existing) throw new ScheduleNotFoundError();
    assertRouteIdentity(existing, patch);
    // Validate a detached prospective command before any mutable external read.
    const prospective = parseSchedule({ ...existing, ...patch });
    const fields = Object.keys(patch) as (keyof ScheduleUpdateInput)[];
    patch = Object.fromEntries(fields.map((field) => [field, prospective[field]]));
    // Replacing exceptions is one optimistic command: preserve the entire
    // canonical collection this edit was based on, including annotations.
    const exceptionBaseline =
      patch.exceptions !== undefined ? JSON.stringify(existing.exceptions) : undefined;

    const currentId = existing.aircraftId ?? aircraftNameToSeedId(existing.aircraft);
    const assignmentChanged =
      (patch.aircraftId !== undefined && patch.aircraftId !== currentId) ||
      (patch.aircraft !== undefined && patch.aircraft !== existing.aircraft);

    const nextPatch = { ...patch };
    if (assignmentChanged) {
      Object.assign(
        nextPatch,
        await validateAircraftAssignment(this.fleet, {
          ...patch,
          ...(patch.aircraftId ? {} : { aircraftId: currentId }),
        }),
      );
    } else {
      delete nextPatch.aircraftId;
      delete nextPatch.aircraft;
    }

    if (patch.exceptions !== undefined) {
      const exceptionsCopy = structuredClone(patch.exceptions);
      await validateExceptionAircraftAssignments(this.fleet, exceptionsCopy, existing.exceptions);
      nextPatch.exceptions = exceptionsCopy;
    }

    let changed = false;
    const schedule = await this.coordinator.mutate((candidate) => {
      const index = candidate.schedules.findIndex((entry) => entry.id === id);
      if (index < 0) throw new ScheduleNotFoundError();
      const current = candidate.schedules[index]!;
      assertRouteIdentity(current, patch);

      // Reread under the storage lock before replacing any operator's effects.
      if (
        exceptionBaseline !== undefined &&
        JSON.stringify(current.exceptions) !== exceptionBaseline
      ) {
        throw new ScheduleIdentityConflictError();
      }

      const retainedId = current.aircraftId ?? aircraftNameToSeedId(current.aircraft);
      const retainedAssignment = !assignmentChanged && retainedId ? { aircraftId: retainedId } : {};
      const updated = parseSchedule({ ...current, ...nextPatch, ...retainedAssignment, id });

      if (JSON.stringify(current) === JSON.stringify(updated)) {
        changed = false;
        return current;
      }

      candidate.schedules[index] = updated;
      changed = true;
      return updated;
    });

    return { schedule, changed };
  }

  async update(id: string, patch: ScheduleUpdateInput): Promise<Schedule> {
    const receipt = await this.updateWithReceipt(id, patch);
    return receipt.schedule;
  }
}

function assertRouteIdentity(current: Schedule, patch: ScheduleUpdateInput): void {
  for (const field of ["id", "destination", "direction"] as const) {
    if (field in patch && (patch as Record<string, unknown>)[field] !== current[field]) {
      throw new ScheduleValidationError([
        {
          code: "custom",
          path: [field],
          message: "Schedule route identity is immutable. Create a new schedule.",
        },
      ]);
    }
  }
}

async function validateExceptionAircraftAssignments(
  fleet: FleetRepository,
  exceptions: ScheduleException[],
  existingExceptions?: ScheduleException[],
): Promise<void> {
  for (let idx = 0; idx < exceptions.length; idx++) {
    const exc = exceptions[idx]!;
    let targetAircraftId: string | undefined;
    let targetAircraft: string | undefined;

    if (exc.kind === "aircraft" && exc.effect) {
      targetAircraftId = exc.effect.aircraftId;
      targetAircraft = exc.effect.aircraft;
    } else if (
      exc.kind === "extra" &&
      exc.effect &&
      (exc.effect.aircraftId || exc.effect.aircraft)
    ) {
      targetAircraftId = exc.effect.aircraftId;
      targetAircraft = exc.effect.aircraft;
    }

    if (!targetAircraftId && !targetAircraft) continue;

    // Check if unchanged from existing exceptions
    if (existingExceptions) {
      const prev = existingExceptions.find((e) => e.id === exc.id);
      if (prev) {
        let prevId: string | undefined;
        let prevName: string | undefined;
        if (prev.kind === "aircraft" && prev.effect) {
          prevId = prev.effect.aircraftId;
          prevName = prev.effect.aircraft;
        } else if (prev.kind === "extra" && prev.effect) {
          prevId = prev.effect.aircraftId;
          prevName = prev.effect.aircraft;
        }
        if (prevId === targetAircraftId && prevName === targetAircraft) {
          // Unchanged stored equipment survives later Fleet deactivation/corruption
          continue;
        }
      }
    }

    // New or changed exception equipment: validate against Fleet
    try {
      const assignment = await validateAircraftAssignment(fleet, {
        aircraftId: targetAircraftId,
        aircraft: targetAircraft,
      });
      if (exc.kind === "aircraft" && exc.effect) {
        exc.effect.aircraftId = assignment.aircraftId!;
        exc.effect.aircraft = assignment.aircraft!;
      } else if (exc.kind === "extra" && exc.effect) {
        exc.effect.aircraftId = assignment.aircraftId;
        exc.effect.aircraft = assignment.aircraft;
      }
    } catch (err) {
      if (
        err instanceof FleetError &&
        ["aircraft_not_found", "inactive_aircraft", "invalid_layout", "invalid_fleet"].includes(
          err.reason,
        )
      ) {
        throw new ScheduleValidationError("Select a valid active Fleet assignment.", [
          "exceptions",
          idx,
          "effect",
          "aircraftId",
        ]);
      }
      if (err instanceof ScheduleValidationError) {
        throw new ScheduleValidationError(
          err.issues.map((issue) => ({
            ...issue,
            path: ["exceptions", idx, "effect", "aircraftId"],
          })),
        );
      }
      throw err;
    }
  }
}
