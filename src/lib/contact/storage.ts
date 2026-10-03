/**
 * Gaza Gateway — Contact Storage Coordinator (`gza.contact.v1`)
 *
 * Implements authoritative local persistence for public contact enquiries and admin inbox:
 * - Versioned envelope schema (`schemaVersion: 1`, `revision: number`).
 * - Authoritative persistence key: `gza.contact.v1`.
 * - Empty storage authority: a valid empty messages array `messages: []` is authoritative
 *   and NEVER resurrects demo seeds.
 * - Missing storage key exposes deterministic 5 demo seeds in memory; first successful mutation commits.
 * - Safe failover for malformed storage: reads do NOT destroy or overwrite corrupt storage.
 * - Serialized atomic mutations with rollback and `StorageCommitError` on persistence failure.
 * - Cross-tab synchronization via `storage` events without echo loops.
 * - Complete isolation in Appearance Studio preview / in-memory mode.
 */

import { getCanonicalSeeds } from "./seed.ts";
import { sanitizeContactEnvelope } from "./schema.ts";
import type { ContactEnvelope, ContactMessage } from "./types.ts";
import { isStudioPreviewActive } from "../studio-preview.ts";

export const CONTACT_STORAGE_KEY = "gza.contact.v1";
export const CONTACT_SCHEMA_VERSION = 1;

export class StorageCommitError extends Error {
  public override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "StorageCommitError";
    this.cause = cause;
  }
}

export function getStorage(customStorage?: Storage | null): Storage | null {
  if (customStorage !== undefined) return customStorage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export interface ContactCoordinatorOptions {
  inMemoryOnly?: boolean | undefined;
  initialData?: ContactEnvelope | undefined;
  storage?: Storage | null | undefined;
}

export class ContactStorageCoordinator {
  private state: ContactEnvelope;
  private readonly storage: Storage | null;
  private readonly inMemoryOnly: boolean;
  private readonly listeners = new Set<() => void>();
  private cleanupStorageListener: (() => void) | null = null;
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(options?: ContactCoordinatorOptions) {
    const isStudio = isStudioPreviewActive();
    this.inMemoryOnly = Boolean(options?.inMemoryOnly || isStudio);
    this.storage = this.inMemoryOnly ? null : getStorage(options?.storage);

    if (options?.initialData) {
      const sanitized = sanitizeContactEnvelope(options.initialData);
      this.state = sanitized ?? {
        schemaVersion: CONTACT_SCHEMA_VERSION,
        revision: 0,
        messages: getCanonicalSeeds(),
      };
    } else {
      this.state = this.loadInitialState();
    }

    this.setupStorageListener();
  }

  /**
   * Initializes state on startup:
   * - If `gza.contact.v1` is absent (`getItem === null`), loads seeds in memory (uncommitted).
   * - If `gza.contact.v1` is present, it is authoritative (even if empty `messages: []`).
   * - If malformed, falls back safely to in-memory state WITHOUT overwriting storage on disk.
   */
  private loadInitialState(): ContactEnvelope {
    if (!this.storage || this.inMemoryOnly) {
      return {
        schemaVersion: CONTACT_SCHEMA_VERSION,
        revision: 0,
        messages: getCanonicalSeeds(),
      };
    }

    try {
      const raw = this.storage.getItem(CONTACT_STORAGE_KEY);

      if (raw === null) {
        // Missing key: expose deterministic seeds in memory without writing to storage.
        return {
          schemaVersion: CONTACT_SCHEMA_VERSION,
          revision: 0,
          messages: getCanonicalSeeds(),
        };
      }

      // Key is present on disk. Parse and validate.
      try {
        const parsed = JSON.parse(raw);
        const validated = sanitizeContactEnvelope(parsed);
        if (validated) {
          // Authoritative valid envelope (including empty messages: [])
          return validated;
        }
        // Malformed structure or unsupported version: fail safe in memory without overwriting disk
        return {
          schemaVersion: CONTACT_SCHEMA_VERSION,
          revision: 0,
          messages: [],
        };
      } catch {
        // Corrupt JSON: fail safe without overwriting disk
        return {
          schemaVersion: CONTACT_SCHEMA_VERSION,
          revision: 0,
          messages: [],
        };
      }
    } catch {
      return {
        schemaVersion: CONTACT_SCHEMA_VERSION,
        revision: 0,
        messages: [],
      };
    }
  }

  private setupStorageListener(): void {
    if (this.inMemoryOnly || typeof window === "undefined") return;

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key !== CONTACT_STORAGE_KEY) return;
      if (!this.storage) return;

      try {
        const raw = this.storage.getItem(CONTACT_STORAGE_KEY);
        if (raw === null) {
          // Storage cleared from another tab: reset to seeds
          this.state = {
            schemaVersion: CONTACT_SCHEMA_VERSION,
            revision: 0,
            messages: getCanonicalSeeds(),
          };
          this.notifySubscribers();
          return;
        }

        const parsed = JSON.parse(raw);
        const validated = sanitizeContactEnvelope(parsed);
        this.state = validated ?? { schemaVersion: 1, revision: 0, messages: [] };
        this.notifySubscribers();
      } catch {
        // Keep the last readable snapshot; mutations independently revalidate storage.
      }
    };

    window.addEventListener("storage", handleStorageEvent);
    this.cleanupStorageListener = () => {
      window.removeEventListener("storage", handleStorageEvent);
    };
  }

  public getState(): ContactEnvelope {
    return structuredClone(this.state);
  }

  public getMessages(): ContactMessage[] {
    return structuredClone(this.state.messages);
  }

  /**
   * Serialized transactional mutation helper:
   * 1. Queues behind any in-flight mutation to prevent race conditions.
   * 2. Acquires the origin-wide Web Lock and reads current canonical storage.
   * 3. Executes the mutator on candidate.
   * 4. Increments revision and validates envelope.
   * 5. Attempts to persist candidate to storage.
   * 6. If storage save fails, rejects with StorageCommitError, leaves memory/storage unchanged,
   *    and emits no notification.
   * 7. If storage save succeeds, adopts candidate into memory,
   *    and notifies subscribers.
   */
  public async mutate<T>(mutator: (candidate: ContactEnvelope) => T): Promise<T> {
    const commit = (): T => {
      let current = this.state;
      if (!this.inMemoryOnly) {
        if (!this.storage) throw new StorageCommitError("Contact storage is unavailable.");
        let raw: string | null;
        try {
          raw = this.storage.getItem(CONTACT_STORAGE_KEY);
        } catch (cause) {
          throw new StorageCommitError("Cannot read contact storage safely.", cause);
        }
        if (raw === null) {
          current = { schemaVersion: 1, revision: 0, messages: getCanonicalSeeds() };
        } else {
          let parsed: ContactEnvelope | null = null;
          try {
            parsed = sanitizeContactEnvelope(JSON.parse(raw));
          } catch {
            /* invalid JSON */
          }
          if (!parsed)
            throw new StorageCommitError(
              "Contact storage is invalid; repair or remove the stored envelope before retrying.",
            );
          current = parsed;
        }
      }
      const candidate: ContactEnvelope = structuredClone(current);

      const result = mutator(candidate);

      // Identical replay is a read: no persistence, revision increment or notification.
      if (JSON.stringify(candidate) === JSON.stringify(current)) {
        this.state = structuredClone(current);
        return structuredClone(result);
      }
      candidate.revision = current.revision + 1;

      const validated = sanitizeContactEnvelope(candidate);
      if (!validated) {
        throw new Error("Invalid contact envelope produced during mutation.");
      }

      if (!this.inMemoryOnly) {
        if (!this.storage) {
          throw new StorageCommitError(
            "Cannot save contact state: storage is unavailable or disabled.",
          );
        }

        const serialized = JSON.stringify(validated);
        try {
          this.storage.setItem(CONTACT_STORAGE_KEY, serialized);
        } catch (err) {
          throw new StorageCommitError(
            `Failed to commit contact message to storage: ${err instanceof Error ? err.message : String(err)}`,
            err,
          );
        }
      }

      // Success: adopt into memory and notify subscribers
      this.state = validated;
      this.notifySubscribers();
      return structuredClone(result);
    };

    const runMutation = async (): Promise<T> => {
      if (this.inMemoryOnly || typeof window === "undefined") return commit();
      // Web Locks serialize all same-origin tabs. No unsafe last-writer-wins fallback.
      if (!navigator.locks)
        throw new StorageCommitError("Contact writes require browser coordination support.");
      try {
        return await navigator.locks.request(
          CONTACT_STORAGE_KEY,
          { signal: AbortSignal.timeout(5000) },
          commit,
        );
      } catch (cause) {
        if (cause instanceof StorageCommitError) throw cause;
        throw new StorageCommitError("Contact transaction could not be completed.", cause);
      }
    };

    // Chain onto the serial queue
    const execution = this.mutationQueue.then(runMutation, runMutation);
    this.mutationQueue = execution.catch(() => {});
    return execution;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public notifySubscribers(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error("ContactStorageCoordinator subscriber error:", err);
      }
    }
  }

  public dispose(): void {
    if (this.cleanupStorageListener) {
      this.cleanupStorageListener();
      this.cleanupStorageListener = null;
    }
    this.listeners.clear();
  }
}
