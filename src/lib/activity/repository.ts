/**
 * Gaza Gateway — Canonical Activity Repository Implementation (Phase 6C)
 *
 * Provides the single source of truth for administrative action audits.
 */

import { validateCreateActivityInput } from "./schema.ts";
import { ActivityStorageCoordinator } from "./storage.ts";
import type {
  ActivityEvent,
  ActivityFilter,
  ActivityRepository,
  CreateActivityInput,
} from "./types.ts";

export interface ActivityRepositoryDependencies {
  coordinator: ActivityStorageCoordinator;
  now?: () => string;
  generateId?: () => string;
}

export class LocalActivityRepository implements ActivityRepository {
  private readonly coordinator: ActivityStorageCoordinator;
  private readonly now: () => string;
  private readonly generateId: () => string;

  constructor(depsOrCoordinator: ActivityStorageCoordinator | ActivityRepositoryDependencies) {
    if (depsOrCoordinator instanceof ActivityStorageCoordinator) {
      this.coordinator = depsOrCoordinator;
      this.now = () => new Date().toISOString();
      this.generateId = () => {
        const timePart = Date.now().toString(36);
        const randPart = Math.random().toString(36).slice(2, 8);
        return `act-${timePart}-${randPart}`;
      };
    } else {
      this.coordinator = depsOrCoordinator.coordinator;
      this.now = depsOrCoordinator.now ?? (() => new Date().toISOString());
      this.generateId =
        depsOrCoordinator.generateId ??
        (() => {
          const timePart = Date.now().toString(36);
          const randPart = Math.random().toString(36).slice(2, 8);
          return `act-${timePart}-${randPart}`;
        });
    }
  }

  public async list(filter?: ActivityFilter): Promise<ActivityEvent[]> {
    const all = this.coordinator.getEvents();

    if (!filter) {
      return all;
    }

    return all.filter((e) => {
      if (filter.actorId && filter.actorId !== "all" && e.actor.id !== filter.actorId) {
        return false;
      }
      if (filter.module && filter.module !== "all" && e.module !== filter.module) {
        return false;
      }
      if (filter.action && filter.action !== "all" && e.action !== filter.action) {
        return false;
      }
      if (filter.date && !e.timestamp.startsWith(filter.date)) {
        return false;
      }
      if (filter.targetId && e.targetId.toLowerCase() !== filter.targetId.toLowerCase()) {
        return false;
      }
      return true;
    });
  }

  public async getById(id: string): Promise<ActivityEvent | null> {
    const all = this.coordinator.getEvents();
    const found = all.find((e) => e.id === id);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  public async append(input: CreateActivityInput): Promise<ActivityEvent> {
    const validated = validateCreateActivityInput(input);
    const id = this.generateId();
    const timestamp = validated.timestamp ?? this.now();

    const event: ActivityEvent = {
      id,
      timestamp,
      actor: validated.actor,
      module: validated.module,
      action: validated.action,
      targetType: validated.targetType,
      targetId: validated.targetId,
      descriptionKey: validated.descriptionKey,
      before: validated.before ?? null,
      after: validated.after ?? null,
      metadata: validated.metadata,
    };

    return this.coordinator.mutate((state) => {
      // Prepend to list (newest first)
      const updatedEvents = [event, ...state.events];

      // Sort deterministically: primary = timestamp descending, secondary = id descending
      updatedEvents.sort((a, b) => {
        const timeDiff = b.timestamp.localeCompare(a.timestamp);
        if (timeDiff !== 0) return timeDiff;
        return b.id.localeCompare(a.id);
      });

      state.events = updatedEvents;
      return { result: event, changed: true };
    });
  }

  public async clear(): Promise<void> {
    return this.coordinator.mutate((state) => {
      if (state.events.length === 0) {
        return { result: undefined, changed: false };
      }
      state.events = [];
      return { result: undefined, changed: true };
    });
  }

  public subscribe(listener: () => void): () => void {
    return this.coordinator.subscribe(listener);
  }
}
