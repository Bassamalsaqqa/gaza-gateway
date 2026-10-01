/**
 * Gaza Gateway — Booking Draft Storage Coordinator (`gza.booking.draft.v1`)
 *
 * Implements authoritative local persistence for the booking wizard draft:
 * - Versioned schema (`schemaVersion: 1`).
 * - Five distinct storage authority states (missing, active, cleared tombstone, malformed, unavailable).
 * - One-way migration from legacy `gza.store.v1["draft"]` ONLY when canonical key is absent (`getItem === null`).
 * - Strictly anti-resurrection: tombstone and malformed-present never resurrect legacy data.
 * - Entire legacy `gza.store.v1` envelope preserved unchanged (zero legacy write/delete).
 * - Serialized mutation boundary: promises queue sequentially, evaluating against latest committed state.
 * - Transactional rollback and `StorageCommitError` on persistence failure.
 * - Multi-tab synchronization via storage events without echo writes.
 * - Ephemeral in-memory mode for Studio preview / unavailable storage.
 */

import { isStudioPreviewActive } from "../studio-preview.ts";
import { addDaysISO, todayISO } from "../data.ts";
import { createFreshDraft } from "./factories.ts";
import { sanitizeDraftStructure } from "./sanitization.ts";
import {
  BOOKING_DRAFT_SCHEMA_VERSION,
  BOOKING_DRAFT_STORAGE_KEY,
  LEGACY_STORE_STORAGE_KEY,
  type BookingDraftEnvelopeV1,
  type BookingDraftState,
  type BookingDraftStorageState,
  type Draft,
} from "./types.ts";

export {
  BOOKING_DRAFT_SCHEMA_VERSION,
  BOOKING_DRAFT_STORAGE_KEY,
  LEGACY_STORE_STORAGE_KEY,
};

export class StorageCommitError extends Error {
  public override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "StorageCommitError";
    this.cause = cause;
  }
}

export function saveBookingDraftToStorage(
  storage: Storage,
  draft: Draft | null,
  status: "active" | "cleared" = "active",
  revision = 1,
  submissionId = generateSubmissionId(),
): void {
  const nowIso = new Date().toISOString();
  const envelope: BookingDraftEnvelopeV1 =
    status === "cleared"
      ? {
          schemaVersion: BOOKING_DRAFT_SCHEMA_VERSION,
          status: "cleared",
          draft: null,
          updatedAt: nowIso,
          clearedAt: nowIso,
          revision,
          submissionId,
        }
      : {
          schemaVersion: BOOKING_DRAFT_SCHEMA_VERSION,
          status: "active",
          draft: draft ?? createFreshDraft(),
          updatedAt: nowIso,
          revision,
          submissionId,
        };
  try {
    storage.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify(envelope));
  } catch (err) {
    throw new StorageCommitError("Failed to commit booking draft to storage", err);
  }
}

export function loadBookingDraftFromStorage(
  storage: Storage,
  today = todayISO(),
): {
  draft: Draft | null;
  status: BookingDraftStorageState;
  envelope: BookingDraftEnvelopeV1 | null;
} {
  let raw: string | null = null;
  try {
    raw = storage.getItem(BOOKING_DRAFT_STORAGE_KEY);
  } catch {
    return { draft: null, status: "unavailable", envelope: null };
  }
  if (raw === null) {
    return { draft: null, status: "missing", envelope: null };
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.schemaVersion === BOOKING_DRAFT_SCHEMA_VERSION
    ) {
      if (parsed.status === "cleared") {
        return { draft: null, status: "cleared", envelope: parsed };
      }
      if (parsed.status === "active" && parsed.draft) {
        return {
          draft: sanitizeDraftStructure(parsed.draft, today),
          status: "active",
          envelope: parsed,
        };
      }
    }
    return { draft: null, status: "malformed", envelope: null };
  } catch {
    return { draft: null, status: "malformed", envelope: null };
  }
}

export function migrateBookingDraftFromLegacyStore(
  storage: Storage,
  today = todayISO(),
): Draft | null {
  try {
    const rawLegacy = storage.getItem(LEGACY_STORE_STORAGE_KEY);
    if (!rawLegacy) return null;
    const parsed = JSON.parse(rawLegacy);
    if (parsed && typeof parsed === "object" && parsed.draft) {
      return sanitizeDraftStructure(parsed.draft, today);
    }
  } catch {
    return null;
  }
  return null;
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

export function generateSubmissionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `sub-${crypto.randomUUID()}`;
  }
  return `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface BookingDraftCoordinatorOptions {
  inMemoryOnly?: boolean | undefined;
  initialDraft?: Draft | undefined;
  storage?: Storage | null | undefined;
  today?: string | undefined;
}

export class BookingDraftStorageCoordinator {
  private state: BookingDraftState;
  private readonly storage: Storage | null;
  private readonly inMemoryOnly: boolean;
  private isEphemeral = false;
  private readonly listeners = new Set<() => void>();
  private cleanupStorageListener: (() => void) | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(options?: BookingDraftCoordinatorOptions) {
    const isStudio = isStudioPreviewActive();
    this.inMemoryOnly = Boolean(options?.inMemoryOnly || isStudio);
    this.storage = this.inMemoryOnly ? null : getStorage(options?.storage);

    this.state = this.loadInitialState(options?.initialDraft, options?.today);
    this.setupStorageListener();
  }

  /**
   * Initializes state by inspecting the 5 storage states.
   */
  private loadInitialState(providedDraft?: Draft, today = todayISO()): BookingDraftState {
    const defaultDepart = addDaysISO(today, 1);
    const freshDraft = providedDraft ?? createFreshDraft(defaultDepart);
    const initialSubmissionId = generateSubmissionId();

    if (this.inMemoryOnly) {
      this.isEphemeral = true;
      return {
        ready: true,
        isPersistent: false,
        storageState: "unavailable",
        draft: freshDraft,
        revision: 1,
        updatedAt: new Date().toISOString(),
        submissionId: initialSubmissionId,
      };
    }

    if (!this.storage) {
      // Storage access threw or is not supported in current environment
      this.isEphemeral = true;
      return {
        ready: true,
        isPersistent: false,
        storageState: "unavailable",
        draft: freshDraft,
        revision: 1,
        updatedAt: new Date().toISOString(),
        submissionId: initialSubmissionId,
      };
    }

    let rawCanonical: string | null = null;
    try {
      rawCanonical = this.storage.getItem(BOOKING_DRAFT_STORAGE_KEY);
    } catch {
      // SecurityError or storage blocked -> enter EPHEMERAL mode without reading legacy
      this.isEphemeral = true;
      return {
        ready: true,
        isPersistent: false,
        storageState: "unavailable",
        draft: freshDraft,
        revision: 1,
        updatedAt: new Date().toISOString(),
        submissionId: initialSubmissionId,
      };
    }

    // STATE 1: Missing (`rawCanonical === null`). The ONLY state allowing legacy migration.
    if (rawCanonical === null) {
      let migratedDraft: Draft | null = null;
      try {
        const rawLegacy = this.storage.getItem(LEGACY_STORE_STORAGE_KEY);
        if (rawLegacy) {
          const parsedLegacy = JSON.parse(rawLegacy);
          if (parsedLegacy && typeof parsedLegacy === "object" && parsedLegacy["draft"]) {
            migratedDraft = sanitizeDraftStructure(parsedLegacy["draft"], today);
          }
        }
      } catch {
        /* Ignore corrupt legacy store */
      }

      const activeDraft = migratedDraft ?? freshDraft;
      const initialEnvelope: BookingDraftEnvelopeV1 = {
        schemaVersion: BOOKING_DRAFT_SCHEMA_VERSION,
        status: "active",
        draft: activeDraft,
        updatedAt: new Date().toISOString(),
        revision: 1,
        submissionId: initialSubmissionId,
      };

      // Attempt to persist the initial or migrated draft
      try {
        this.storage.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify(initialEnvelope));
        return {
          ready: true,
          isPersistent: true,
          storageState: "missing",
          draft: activeDraft,
          revision: 1,
          updatedAt: initialEnvelope.updatedAt,
          submissionId: initialSubmissionId,
        };
      } catch {
        // Storage full or read-only -> enter EPHEMERAL mode while retaining runtime draft
        this.isEphemeral = true;
        return {
          ready: true,
          isPersistent: false,
          storageState: "unavailable",
          draft: activeDraft,
          revision: 1,
          updatedAt: initialEnvelope.updatedAt,
          submissionId: initialSubmissionId,
        };
      }
    }

    // STATES 2, 3, 4: Canonical key is present. It is STRICTLY authoritative.
    try {
      const parsed = JSON.parse(rawCanonical);
      if (
        parsed &&
        typeof parsed === "object" &&
        parsed["schemaVersion"] === BOOKING_DRAFT_SCHEMA_VERSION
      ) {
        const subId =
          typeof parsed["submissionId"] === "string" && parsed["submissionId"]
            ? parsed["submissionId"]
            : initialSubmissionId;
        const rev = typeof parsed["revision"] === "number" ? parsed["revision"] : 1;
        const updatedAt =
          typeof parsed["updatedAt"] === "string" ? parsed["updatedAt"] : new Date().toISOString();

        // STATE 3: Cleared tombstone
        if (parsed["status"] === "cleared") {
          return {
            ready: true,
            isPersistent: true,
            storageState: "cleared",
            draft: freshDraft, // In-memory default for UI, storage remains tombstoned
            revision: rev,
            updatedAt,
            submissionId: subId,
          };
        }

        // STATE 2: Valid active
        if (parsed["status"] === "active" && parsed["draft"]) {
          const sanitized = sanitizeDraftStructure(parsed["draft"], today);
          return {
            ready: true,
            isPersistent: true,
            storageState: "active",
            draft: sanitized,
            revision: rev,
            updatedAt,
            submissionId: subId,
          };
        }
      }

      // STATE 4: Malformed-present (schema mismatch or missing status)
      return this.handleMalformedPresent(freshDraft, initialSubmissionId);
    } catch {
      // STATE 4: Malformed-present (corrupt JSON)
      return this.handleMalformedPresent(freshDraft, initialSubmissionId);
    }
  }

  /**
   * Recovers from malformed-present state without resurrecting legacy data.
   */
  private handleMalformedPresent(freshDraft: Draft, submissionId: string): BookingDraftState {
    const recoveredEnvelope: BookingDraftEnvelopeV1 = {
      schemaVersion: BOOKING_DRAFT_SCHEMA_VERSION,
      status: "active",
      draft: freshDraft,
      updatedAt: new Date().toISOString(),
      revision: 1,
      submissionId,
    };

    if (this.storage && !this.inMemoryOnly) {
      try {
        this.storage.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify(recoveredEnvelope));
        return {
          ready: true,
          isPersistent: true,
          storageState: "malformed",
          draft: freshDraft,
          revision: 1,
          updatedAt: recoveredEnvelope.updatedAt,
          submissionId,
        };
      } catch {
        /* storage unwritable */
      }
    }

    this.isEphemeral = true;
    return {
      ready: true,
      isPersistent: false,
      storageState: "unavailable",
      draft: freshDraft,
      revision: 1,
      updatedAt: recoveredEnvelope.updatedAt,
      submissionId,
    };
  }

  /**
   * Processes a storage event (from window listener or cross-tab synchronization test harness).
   */
  public handleStorageEvent(event: { key?: string | null; newValue?: string | null }): void {
    if (this.inMemoryOnly || this.isEphemeral || event.key !== BOOKING_DRAFT_STORAGE_KEY) return;
    if (!this.storage) return;

    try {
      const raw =
        typeof event.newValue === "string"
          ? event.newValue
          : this.storage.getItem(BOOKING_DRAFT_STORAGE_KEY);
      if (!raw) {
        // External removal: tombstone or clean default
        this.state = {
          ...this.state,
          draft: createFreshDraft(),
          storageState: "cleared",
          revision: this.state.revision + 1,
          updatedAt: new Date().toISOString(),
        };
        this.notifySubscribers();
        return;
      }

      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        parsed["schemaVersion"] === BOOKING_DRAFT_SCHEMA_VERSION
      ) {
        const rev = typeof parsed["revision"] === "number" ? parsed["revision"] : this.state.revision + 1;
        const subId =
          typeof parsed["submissionId"] === "string" ? parsed["submissionId"] : this.state.submissionId;
        const updatedAt =
          typeof parsed["updatedAt"] === "string" ? parsed["updatedAt"] : new Date().toISOString();

        if (parsed["status"] === "cleared") {
          this.state = {
            ...this.state,
            draft: createFreshDraft(),
            storageState: "cleared",
            revision: rev,
            updatedAt,
            submissionId: subId,
          };
          this.notifySubscribers();
          return;
        }

        if (parsed["status"] === "active" && parsed["draft"]) {
          const nextDraft = sanitizeDraftStructure(parsed["draft"]);
          this.state = {
            ...this.state,
            draft: nextDraft,
            storageState: "active",
            revision: rev,
            updatedAt,
            submissionId: subId,
          };
          this.notifySubscribers();
        }
      }
    } catch {
      /* Ignore malformed updates from foreign tabs */
    }
  }

  /**
   * Sets up multi-tab synchronization via the window `storage` event.
   */
  private setupStorageListener(): void {
    if (this.inMemoryOnly || this.isEphemeral || typeof window === "undefined" || !this.storage) return;

    const listener = (event: StorageEvent) => {
      this.handleStorageEvent(event);
    };

    window.addEventListener("storage", listener);
    this.cleanupStorageListener = () => {
      window.removeEventListener("storage", listener);
    };
  }

  public getState(): BookingDraftState {
    return {
      ...this.state,
      draft: structuredClone(this.state.draft),
    };
  }

  public getDraft(): Draft {
    return structuredClone(this.state.draft);
  }

  public getSubmissionId(): string {
    return this.state.submissionId;
  }

  public isReady(): boolean {
    return this.state.ready;
  }

  public isPersistent(): boolean {
    return this.state.isPersistent;
  }

  /**
   * Serialized mutation helper:
   * Chains all mutations onto a single promise queue, ensuring:
   * 1. Mutation B queued before A finishes evaluates against A's committed result.
   * 2. Transactional failure rolls back and throws `StorageCommitError`.
   * 3. Successful mutations commit atomically to in-memory state and notify subscribers.
   */
  public async mutate<T>(
    mutator: (
      currentDraft: Draft,
      currentState: BookingDraftState,
    ) => { draft: Draft; status?: "active" | "cleared"; refreshSubmissionId?: boolean },
  ): Promise<Draft> {
    return new Promise<Draft>((resolve, reject) => {
      this.writeQueue = this.writeQueue
        .then(async () => {
          try {
            // 1. Take snapshot of current state
            const currentDraftCopy = structuredClone(this.state.draft);
            const currentStateCopy = { ...this.state };

            // 2. Execute mutator
            const mutationResult = mutator(currentDraftCopy, currentStateCopy);
            const nextStatus = mutationResult.status ?? "active";
            const sanitizedNextDraft = sanitizeDraftStructure(mutationResult.draft);
            const nextRevision = this.state.revision + 1;
            const nowIso = new Date().toISOString();
            const nextSubmissionId = mutationResult.refreshSubmissionId
              ? generateSubmissionId()
              : this.state.submissionId;

            // 3. Prepare envelope
            const envelope: BookingDraftEnvelopeV1 =
              nextStatus === "cleared"
                ? {
                    schemaVersion: BOOKING_DRAFT_SCHEMA_VERSION,
                    status: "cleared",
                    draft: null,
                    updatedAt: nowIso,
                    clearedAt: nowIso,
                    revision: nextRevision,
                    submissionId: nextSubmissionId,
                  }
                : {
                    schemaVersion: BOOKING_DRAFT_SCHEMA_VERSION,
                    status: "active",
                    draft: sanitizedNextDraft,
                    updatedAt: nowIso,
                    revision: nextRevision,
                    submissionId: nextSubmissionId,
                  };

            // 4. Persist to storage if applicable (only when persistent and not in ephemeral mode)
            if (!this.inMemoryOnly && !this.isEphemeral) {
              if (!this.storage) {
                throw new StorageCommitError(
                  "Cannot persist booking draft: local storage is unavailable.",
                );
              }
              try {
                this.storage.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify(envelope));
              } catch (err) {
                throw new StorageCommitError(
                  `Failed to commit booking draft to local storage: ${err instanceof Error ? err.message : String(err)}`,
                  err,
                );
              }
            }

            // 5. Commit into memory and notify subscribers
            this.state = {
              ...this.state,
              draft: nextStatus === "cleared" ? createFreshDraft() : sanitizedNextDraft,
              storageState: this.isEphemeral ? "unavailable" : (nextStatus === "cleared" ? "cleared" : "active"),
              revision: nextRevision,
              updatedAt: nowIso,
              isPersistent: !this.inMemoryOnly && !this.isEphemeral,
              submissionId: nextSubmissionId,
            };

            this.notifySubscribers();
            resolve(this.state.draft);
          } catch (err) {
            reject(err);
          }
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  /**
   * Refreshes the submission identifier (e.g. when criteria change or after booking creation).
   */
  public refreshSubmissionId(): string {
    const nextSubId = generateSubmissionId();
    this.state = {
      ...this.state,
      submissionId: nextSubId,
    };
    return nextSubId;
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
        console.error("BookingDraftStorageCoordinator subscriber error:", err);
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
