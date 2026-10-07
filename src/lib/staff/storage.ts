/**
 * Gaza Gateway — Canonical Staff Storage Coordinator (`gza.staff.v1`)
 *
 * Implements authoritative local persistence for the dedicated `gza.staff.v1` key:
 * - Versioned envelope schema (`schemaVersion: 1`, `revision: number`)
 * - Web Lock coordination with timeout and same-instance serialization
 * - Re-read inside lock before write
 * - Strict failure closed on corrupt stored state (never silent seed overwrite)
 * - Anti-resurrection guarantee: present empty state is authoritative (no seed repair)
 * - Atomic validation of full prospective aggregate before commit
 * - Invariant: Last active administrator cannot be demoted or disabled
 * - Invariant: Email must be unique across all staff
 * - Rollback on persistence failure (no in-memory mutation or listener notification)
 * - Real no-op detection (no revision bump or storage write when no changes)
 * - Returns detached deep-clones to prevent caller mutation of internal state
 * - Cross-tab synchronization via storage events
 * - In-memory isolation for Studio preview mode
 */

import { StorageCommitError } from "../repositories/storage.ts";
import { isStudioPreviewActive } from "../studio-preview.ts";
import { staffStorageSchema } from "./schema.ts";
import { seedStaffEnvelope } from "./seed.ts";
import { StaffError, type StaffEnvelopeV1, type StaffStorageV1 } from "./types.ts";

export const STAFF_STORAGE_KEY = "gza.staff.v1";

export interface StaffCoordinatorOptions {
  inMemoryOnly?: boolean | undefined;
  storage?: Storage | null | undefined;
  initialData?: StaffEnvelopeV1 | undefined;
  locks?: Pick<LockManager, "request"> | undefined;
}

export class StaffStorageCoordinator {
  private readonly storage: Storage | null;
  private readonly memory: boolean;
  private readonly locks: Pick<LockManager, "request"> | undefined;
  private state: StaffStorageV1;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  private cleanup: (() => void) | undefined;

  constructor(options: StaffCoordinatorOptions = {}) {
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

    this.state = staffStorageSchema.parse(options.initialData ?? seedStaffEnvelope());

    if (!this.memory && typeof window !== "undefined") {
      const listener = (e: StorageEvent) => {
        if (
          (e.key === STAFF_STORAGE_KEY || e.key === null) &&
          (!e.storageArea || e.storageArea === this.storage)
        ) {
          this.notify();
        }
      };
      window.addEventListener("storage", listener);
      this.cleanup = () => window.removeEventListener("storage", listener);
    }
  }

  isInMemory(): boolean {
    return this.memory;
  }

  destroy(): void {
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = undefined;
    }
    this.listeners.clear();
  }

  /**
   * Reads current staff envelope from storage or in-memory state.
   * If key is absent, returns deterministic seed envelope without writing to storage.
   * If key is present but empty (`staff: []`), returns empty state (anti-resurrection).
   * If stored data is present but corrupt/unsupported, throws StaffError("staff_unavailable").
   */
  read(): StaffStorageV1 {
    if (this.memory) {
      return structuredClone(this.state);
    }

    if (!this.storage) {
      throw new StaffError("staff_unavailable");
    }

    try {
      const raw = this.storage.getItem(STAFF_STORAGE_KEY);
      if (raw === null) {
        return structuredClone(seedStaffEnvelope());
      }
      const parsed = JSON.parse(raw);
      const result = staffStorageSchema.safeParse(parsed);
      if (!result.success) {
        throw new StaffError("staff_unavailable");
      }
      return structuredClone(result.data);
    } catch (err) {
      if (err instanceof StaffError) throw err;
      throw new StaffError("staff_unavailable");
    }
  }

  /**
   * Mutates the staff aggregate with serialization and Web Lock protection.
   * Throws StaffError on validation error, rule violations, or corruption.
   * Throws StorageCommitError on persistence error.
   */
  async mutate<T>(edit: (candidate: StaffStorageV1) => T): Promise<T> {
    const commit = () => {
      const current = this.read();
      const candidate = structuredClone(current);
      const result = edit(candidate);

      // Check email uniqueness before schema parsing
      const seenEmails = new Set<string>();
      for (const s of candidate.staff) {
        const normalized = s.email.trim().toLowerCase();
        if (seenEmails.has(normalized)) {
          throw new StaffError("email_taken", {
            email: "Email address is already in use by another staff member.",
          });
        }
        seenEmails.add(normalized);
      }

      // Check last active admin invariant
      const activeAdmins = candidate.staff.filter(
        (s) => s.role === "admin" && s.status === "active",
      );
      if (activeAdmins.length === 0) {
        throw new StaffError("last_admin_protected", {
          _form: "Cannot demote or disable the last active administrator.",
        });
      }

      const validated = staffStorageSchema.safeParse(candidate);
      if (!validated.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of validated.error.issues) {
          const path = issue.path.join(".");
          fieldErrors[path] = issue.message;
        }
        throw new StaffError("invalid_staff", fieldErrors);
      }

      // Real no-op check: if staff array is structurally unchanged, skip write and revision bump
      if (JSON.stringify(candidate.staff) === JSON.stringify(current.staff)) {
        return structuredClone(result);
      }

      candidate.staff = validated.data.staff;
      candidate.revision = current.revision + 1;

      if (!Number.isSafeInteger(candidate.revision)) {
        throw new StaffError("invalid_staff");
      }

      if (!this.memory) {
        if (!this.storage) {
          throw new StorageCommitError("Staff storage is unavailable.");
        }
        try {
          this.storage.setItem(STAFF_STORAGE_KEY, JSON.stringify(candidate));
        } catch (cause) {
          throw new StorageCommitError("Could not save staff data to storage.", cause);
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
        throw new StorageCommitError("Staff write coordination locks unavailable.");
      }

      let entered = false;
      try {
        return await this.locks.request(
          STAFF_STORAGE_KEY,
          { signal: AbortSignal.timeout(5000) },
          () => {
            entered = true;
            return commit();
          },
        );
      } catch (cause) {
        if (entered) throw cause;
        if (cause instanceof StaffError || cause instanceof StorageCommitError) {
          throw cause;
        }
        throw new StorageCommitError("Staff write coordination lock timed out or failed.", cause);
      }
    };

    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* listener errors should not break notification */
      }
    }
  }
}
