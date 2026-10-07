/**
 * Gaza Gateway — Canonical Activity Storage Coordinator (Phase 6C)
 *
 * Implements transaction coordination and persistent lifecycle for `gza.activity.v1`.
 *
 * Guarantees:
 * - Single authority key: `gza.activity.v1`
 * - Missing store starts with empty events list (NO synthetic historical fixtures)
 * - Anti-resurrection: valid empty store remains empty; corrupt store fails closed
 * - 500 newest events retention policy (deterministic FIFO ring buffer)
 * - Prospective validation before committing
 * - Web Lock serialization with re-read inside lock
 * - Rollback on persistence failure
 * - Cross-tab storage change adoption
 * - In-memory isolation for tests and Studio preview
 */

import { parseActivityEnvelope } from "./schema.ts";
import type { ActivityEnvelopeV1, ActivityEvent } from "./types.ts";

export const ACTIVITY_STORAGE_KEY = "gza.activity.v1";
export const ACTIVITY_LOCK_NAME = "gza:lock:activity";
export const MAX_ACTIVITY_RETENTION = 500;

export class ActivityStorageError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ActivityStorageError";
    this.code = code;
  }
}

export interface ActivityStorageCoordinatorOptions {
  storage?: Storage | null | undefined;
  inMemoryOnly?: boolean | undefined;
  initialData?: ActivityEnvelopeV1 | undefined;
  locks?: LockManager | undefined;
}

export class ActivityStorageCoordinator {
  private readonly storage: Storage | null;
  private readonly inMemoryOnly: boolean;
  private readonly locks?: LockManager | undefined;
  private memoryState: ActivityEnvelopeV1;
  private readonly listeners: Set<() => void> = new Set();
  private cleanup?: (() => void) | undefined;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(options?: ActivityStorageCoordinatorOptions) {
    this.inMemoryOnly = options?.inMemoryOnly ?? false;
    let resolvedStorage: Storage | null = null;
    if (!this.inMemoryOnly) {
      if (options?.storage !== undefined) {
        resolvedStorage = options.storage;
      } else if (typeof window !== "undefined") {
        try {
          resolvedStorage = window.localStorage;
        } catch {
          resolvedStorage = null;
        }
      }
    }
    this.storage = resolvedStorage;

    this.locks =
      options?.locks ??
      (typeof navigator !== "undefined" && "locks" in navigator ? navigator.locks : undefined);

    if (options?.initialData) {
      const validated = parseActivityEnvelope(options.initialData);
      if (!validated) {
        throw new ActivityStorageError(
          "invalid_schema",
          "Initial activity envelope failed schema validation.",
        );
      }
      this.memoryState = structuredClone(validated);
    } else {
      this.memoryState = {
        schemaVersion: 1,
        revision: 0,
        events: [],
      };
    }

    if (!this.inMemoryOnly && typeof window !== "undefined") {
      const listener = (e: StorageEvent) => {
        if (
          (e.key === ACTIVITY_STORAGE_KEY || e.key === null) &&
          (!e.storageArea || e.storageArea === this.storage)
        ) {
          this.notify();
        }
      };
      window.addEventListener("storage", listener);
      this.cleanup = () => window.removeEventListener("storage", listener);
    }
  }

  public destroy(): void {
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = undefined;
    }
    this.listeners.clear();
  }

  /**
   * Reads fresh canonical activity envelope from storage or in-memory state.
   * Throws ActivityStorageError("storage_unavailable") if persistent storage is missing.
   * Throws ActivityStorageError("corrupt_store") if stored data is corrupted or invalid.
   */
  public read(): ActivityEnvelopeV1 {
    if (this.inMemoryOnly) {
      return structuredClone(this.memoryState);
    }

    if (!this.storage) {
      throw new ActivityStorageError("storage_unavailable", "Activity storage is unavailable.");
    }

    try {
      const raw = this.storage.getItem(ACTIVITY_STORAGE_KEY);
      if (raw === null) {
        // Missing key: clean empty state, DO NOT write to storage on read
        return structuredClone({
          schemaVersion: 1,
          revision: 0,
          events: [],
        });
      }

      const parsedJson = JSON.parse(raw);
      const envelope = parseActivityEnvelope(parsedJson);
      if (!envelope) {
        throw new ActivityStorageError(
          "corrupt_store",
          "Stored activity data failed schema validation.",
        );
      }
      return structuredClone(envelope);
    } catch (err) {
      if (err instanceof ActivityStorageError) throw err;
      throw new ActivityStorageError(
        "corrupt_store",
        `Failed to parse stored activity data: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  public getEnvelope(): ActivityEnvelopeV1 {
    return this.read();
  }

  public getEvents(): ActivityEvent[] {
    return this.read().events;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error("Activity listener threw error:", err);
      }
    }
  }

  public isInMemory(): boolean {
    return this.inMemoryOnly;
  }

  public async mutate<T>(
    operation: (state: ActivityEnvelopeV1) => { result: T; changed: boolean },
  ): Promise<T> {
    if (!this.inMemoryOnly && !this.storage) {
      throw new ActivityStorageError("storage_unavailable", "Activity storage is unavailable.");
    }

    const commit = (): T => {
      // Re-read storage inside lock to get latest canonical state
      const current = this.read();
      const draft = structuredClone(current);
      const { result, changed } = operation(draft);

      if (!changed) {
        return structuredClone(result);
      }

      // Sort deterministically: timestamp descending by chronological instant, ID descending
      draft.events.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        if (timeB !== timeA) return timeB - timeA;
        return b.id.localeCompare(a.id);
      });

      // Enforce 500 newest events retention
      if (draft.events.length > MAX_ACTIVITY_RETENTION) {
        draft.events = draft.events.slice(0, MAX_ACTIVITY_RETENTION);
      }

      draft.revision = current.revision + 1;
      if (!Number.isSafeInteger(draft.revision)) {
        throw new ActivityStorageError("invalid_schema", "Revision must be a safe integer.");
      }

      // Validate envelope schema prospectively
      const validated = parseActivityEnvelope(draft);
      if (!validated) {
        throw new ActivityStorageError(
          "invalid_schema",
          "Prospective activity envelope validation failed.",
        );
      }

      const serialized = JSON.stringify(validated);

      // Persist to storage before adopting into memory
      if (!this.inMemoryOnly && this.storage) {
        try {
          this.storage.setItem(ACTIVITY_STORAGE_KEY, serialized);
        } catch (err) {
          throw new ActivityStorageError(
            "storage_write_failed",
            `Failed to write activity envelope to storage: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Adopt validated state
      this.memoryState = structuredClone(validated);
      this.notify();
      return structuredClone(result);
    };

    const run = async (): Promise<T> => {
      if (this.inMemoryOnly) return commit();
      if (!this.locks) {
        if (typeof window === "undefined") return commit();
        throw new ActivityStorageError(
          "storage_unavailable",
          "Activity write coordination lock unavailable.",
        );
      }

      let entered = false;
      try {
        return await this.locks.request(
          ACTIVITY_LOCK_NAME,
          { signal: AbortSignal.timeout(5000) },
          () => {
            entered = true;
            return commit();
          },
        );
      } catch (cause) {
        if (entered) throw cause;
        if (cause instanceof ActivityStorageError) throw cause;
        throw new ActivityStorageError(
          "storage_unavailable",
          `Activity write lock failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
    };

    const next = this.chain.then(run, run);
    this.chain = next.then(
      () => {},
      () => {},
    );
    return next;
  }
}
