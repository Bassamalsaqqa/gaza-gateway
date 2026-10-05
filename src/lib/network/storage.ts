/**
 * Gaza Gateway — Network Storage Coordinator
 *
 * Implements authoritative local persistence for the dedicated `gza.network.v1` key:
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
import { networkStorageSchema } from "./schema.ts";
import { seedNetworkEnvelope } from "./seed.ts";
import { NetworkError, type NetworkEnvelopeV1 } from "./types.ts";

export const NETWORK_STORAGE_KEY = "gza.network.v1";

export interface NetworkCoordinatorOptions {
  inMemoryOnly?: boolean | undefined;
  storage?: Storage | null | undefined;
  initialData?: NetworkEnvelopeV1 | undefined;
  locks?: Pick<LockManager, "request"> | undefined;
}

export class NetworkStorageCoordinator {
  private readonly storage: Storage | null;
  private readonly memory: boolean;
  private readonly locks: Pick<LockManager, "request"> | undefined;
  private state: NetworkEnvelopeV1;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  private cleanup: (() => void) | undefined;

  constructor(options: NetworkCoordinatorOptions = {}) {
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

    this.state = networkStorageSchema.parse(options.initialData ?? seedNetworkEnvelope());

    if (!this.memory && typeof window !== "undefined") {
      const listener = (e: StorageEvent) => {
        if (
          (e.key === NETWORK_STORAGE_KEY || e.key === null) &&
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
   * Reads current network envelope from storage or in-memory state.
   * If key is absent, returns deterministic seed envelope without writing to storage.
   * If stored data is present but corrupt/unsupported, throws NetworkError("network_unavailable").
   */
  read(): NetworkEnvelopeV1 {
    if (this.memory) {
      return structuredClone(this.state);
    }

    if (!this.storage) {
      throw new NetworkError("network_unavailable");
    }

    try {
      const raw = this.storage.getItem(NETWORK_STORAGE_KEY);
      if (raw === null) {
        return structuredClone(seedNetworkEnvelope());
      }
      const parsed = JSON.parse(raw);
      const result = networkStorageSchema.safeParse(parsed);
      if (!result.success) {
        throw new NetworkError("network_unavailable");
      }
      return structuredClone(result.data);
    } catch (err) {
      if (err instanceof NetworkError) throw err;
      throw new NetworkError("network_unavailable");
    }
  }

  /**
   * Mutates the network aggregate with serialization and Web Lock protection.
   * Throws NetworkError on validation error or corruption.
   * Throws StorageCommitError on persistence error.
   */
  async mutate<T>(edit: (candidate: NetworkEnvelopeV1) => T): Promise<T> {
    const commit = () => {
      const current = this.read();
      const candidate = structuredClone(current);
      const result = edit(candidate);

      const validated = networkStorageSchema.safeParse(candidate);
      if (!validated.success) {
        throw new NetworkError("invalid_network", validated.error.issues);
      }

      // Real no-op check: if destinations are structurally unchanged, skip write and revision bump
      if (
        JSON.stringify(validated.data.destinations) === JSON.stringify(current.destinations)
      ) {
        return structuredClone(result);
      }

      candidate.destinations = validated.data.destinations;
      candidate.revision = current.revision + 1;

      if (!Number.isSafeInteger(candidate.revision)) {
        throw new NetworkError("invalid_network");
      }

      if (!this.memory) {
        if (!this.storage) {
          throw new StorageCommitError("Network storage is unavailable.");
        }
        try {
          this.storage.setItem(NETWORK_STORAGE_KEY, JSON.stringify(candidate));
        } catch (cause) {
          throw new StorageCommitError("Could not save network data to storage.", cause);
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
        throw new StorageCommitError("Network write coordination locks unavailable.");
      }

      let entered = false;
      try {
        return await this.locks.request(
          NETWORK_STORAGE_KEY,
          { signal: AbortSignal.timeout(5000) },
          () => {
            entered = true;
            return commit();
          },
        );
      } catch (cause) {
        if (entered) throw cause;
        throw new StorageCommitError("Network transaction lock could not be acquired.", cause);
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
