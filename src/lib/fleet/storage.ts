/**
 * Gaza Gateway — Fleet Storage Coordinator
 *
 * Implements authoritative local persistence for the dedicated `gza.fleet.v1` key:
 * - Versioned envelope schema (`schemaVersion: 1`, `revision: number`)
 * - Web Lock coordination with timeout and same-instance serialization
 * - Re-read inside lock before write
 * - Strict failure closed on corrupt stored state (never silent seed overwrite)
 * - Atomic validation of full prospective aggregate before commit
 * - Rollback on persistence failure (no in-memory mutation or listener notification)
 * - Real no-op detection (no revision bump or storage write when no changes)
 * - Returns detached deep-clones to prevent caller mutation of internal state
 * - Cross-tab synchronization via storage events
 * - In-memory isolation for Studio preview mode
 */

import { StorageCommitError } from "../repositories/storage.ts";
import { isStudioPreviewActive } from "../studio-preview.ts";
import { fleetStorageSchema } from "./schema.ts";
import { seedFleetEnvelope } from "./seed.ts";
import { FleetError, type FleetEnvelopeV1, type FleetStorageV1 } from "./types.ts";

export const FLEET_STORAGE_KEY = "gza.fleet.v1";

export interface FleetCoordinatorOptions {
  inMemoryOnly?: boolean | undefined;
  storage?: Storage | null | undefined;
  initialData?: FleetEnvelopeV1 | undefined;
  locks?: Pick<LockManager, "request"> | undefined;
}

export class FleetStorageCoordinator {
  private readonly storage: Storage | null;
  private readonly memory: boolean;
  private readonly locks: Pick<LockManager, "request"> | undefined;
  private state: FleetStorageV1;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  private cleanup: (() => void) | undefined;

  constructor(options: FleetCoordinatorOptions = {}) {
    this.memory =
      options.inMemoryOnly === true ||
      isStudioPreviewActive() ||
      (typeof window === "undefined" && options.storage === undefined);

    try {
      this.storage = this.memory
        ? null
        : options.storage !== undefined
          ? options.storage
          : typeof window !== "undefined"
            ? window.localStorage
            : null;
    } catch {
      this.storage = null;
    }

    this.locks =
      options.locks ??
      (typeof navigator !== "undefined" && "locks" in navigator ? navigator.locks : undefined);

    this.state = fleetStorageSchema.parse(options.initialData ?? seedFleetEnvelope());

    if (!this.memory && typeof window !== "undefined") {
      const listener = (e: StorageEvent) => {
        if (
          (e.key === FLEET_STORAGE_KEY || e.key === null) &&
          (!e.storageArea || e.storageArea === this.storage)
        ) {
          this.notify();
        }
      };
      window.addEventListener("storage", listener);
      this.cleanup = () => window.removeEventListener("storage", listener);
    }
  }

  /**
   * Reads current fleet envelope from storage or in-memory state.
   * If key is absent, returns deterministic seed envelope without writing to storage.
   * If stored data is present but corrupt/unsupported, throws FleetError("fleet_unavailable").
   */
  read(): FleetStorageV1 {
    if (this.memory) {
      return structuredClone(this.state);
    }

    if (!this.storage) {
      throw new FleetError("fleet_unavailable");
    }

    try {
      const raw = this.storage.getItem(FLEET_STORAGE_KEY);
      if (raw === null) {
        return structuredClone(seedFleetEnvelope());
      }
      const parsed = JSON.parse(raw);
      const result = fleetStorageSchema.safeParse(parsed);
      if (!result.success) {
        throw new FleetError("fleet_unavailable");
      }
      return structuredClone(result.data);
    } catch (err) {
      if (err instanceof FleetError) throw err;
      throw new FleetError("fleet_unavailable");
    }
  }

  /**
   * Mutates the fleet aggregate with serialization and Web Lock protection.
   * Throws FleetError on validation error or corruption.
   * Throws StorageCommitError on persistence error.
   */
  async mutate<T>(edit: (candidate: FleetStorageV1) => T): Promise<T> {
    const commit = () => {
      const current = this.read();
      const candidate = structuredClone(current);
      const result = edit(candidate);

      const validated = fleetStorageSchema.safeParse(candidate);
      if (!validated.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of validated.error.issues) {
          const path = issue.path.join(".");
          fieldErrors[path] = issue.message;
        }
        throw new FleetError("invalid_fleet", fieldErrors);
      }

      // Real no-op check: if aircraft and layouts are structurally unchanged, skip write and revision bump
      if (
        JSON.stringify(candidate.aircraft) === JSON.stringify(current.aircraft) &&
        JSON.stringify(candidate.layouts) === JSON.stringify(current.layouts)
      ) {
        return structuredClone(result);
      }

      candidate.aircraft = validated.data.aircraft;
      candidate.layouts = validated.data.layouts;
      candidate.revision = current.revision + 1;

      if (!Number.isSafeInteger(candidate.revision)) {
        throw new FleetError("invalid_fleet");
      }

      if (!this.memory) {
        if (!this.storage) {
          throw new StorageCommitError("Fleet storage is unavailable.");
        }
        try {
          this.storage.setItem(FLEET_STORAGE_KEY, JSON.stringify(candidate));
        } catch (cause) {
          throw new StorageCommitError("Could not save fleet data to storage.", cause);
        }
      }

      this.state = structuredClone(candidate);
      this.notify();
      return structuredClone(result);
    };

    const run = async () => {
      if (this.memory) return commit();
      if (!this.locks) {
        if (typeof window === "undefined") return commit();
        throw new StorageCommitError("Fleet write coordination locks unavailable.");
      }

      let entered = false;
      try {
        return await this.locks.request(
          FLEET_STORAGE_KEY,
          { signal: AbortSignal.timeout(5000) },
          () => {
            entered = true;
            return commit();
          },
        );
      } catch (cause) {
        if (entered) throw cause;
        throw new StorageCommitError("Fleet transaction lock could not be acquired.", cause);
      }
    };

    const queued = this.queue.then(run, run);
    this.queue = queued.catch(() => {});
    return queued;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* A committed write remains successful */
      }
    }
  }

  destroy() {
    this.cleanup?.();
    this.listeners.clear();
  }
}
