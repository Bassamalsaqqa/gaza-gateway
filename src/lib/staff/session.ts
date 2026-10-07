/**
 * Gaza Gateway — Admin Session Coordinator (Phase 6C)
 *
 * Coordinates administrative session state, multi-tab synchronization,
 * canonical staff directory bindings, and persistent authentication authority.
 *
 * Guarantees:
 * - Generation/Epoch serialization: obsolete pending sign-in operations cannot
 *   commit session side-effects or resurrect authority on reload after sign-out.
 * - Storage check before/after side-effects: invalidation while awaiting staff work
 *   clears storage immediately so stale staffId is never left in localStorage.
 * - Immediate revocation: role demotions, status disablement, or directory corruption
 *   immediately revoke active session privileges (fail-closed).
 * - Multi-tab storage synchronization via `gza.admin.v1`.
 * - In-memory isolation for Studio preview mode.
 */

import { MOCK_PASSPHRASE } from "../admin.ts";
import { recordAdminAudit, type ActivityActorSnapshot, type ActivityRepository } from "../activity/index.ts";
import type { StaffMember, StaffRepository } from "./types.ts";

export const ADMIN_STORAGE_KEY = "gza.admin.v1";

export type AdminSignInResult = { ok: boolean; error?: "unknown" | "pass" | "storage_unavailable" | "directory_unavailable" };

export interface AdminSessionCoordinatorOptions {
  storage?: Storage | null | undefined;
  staffRepo: StaffRepository;
  activityRepo: ActivityRepository;
  isStudioPreview?: boolean | undefined;
}

export interface AdminSessionState {
  ready: boolean;
  staff: StaffMember | null;
  directoryUnavailable: boolean;
  actor: ActivityActorSnapshot | null;
}

export class AdminSessionCoordinator {
  private readonly storage: Storage | null;
  private readonly staffRepo: StaffRepository;
  private activityRepo: ActivityRepository;
  private readonly isStudioPreview: boolean;

  private epoch = 0;
  private refreshSequence = 0;
  private pendingSignInEpoch: number | null = null;
  private _ready = false;
  private _staff: StaffMember | null = null;
  private _directoryUnavailable = false;
  private legacyAdminData: Record<string, unknown> = {};
  private pendingSignInStaffId: string | null = null;

  private readonly listeners = new Set<() => void>();
  private staffUnsub?: (() => void) | undefined;
  private windowStorageListener?: ((e: StorageEvent) => void) | undefined;

  constructor(options: AdminSessionCoordinatorOptions) {
    this.isStudioPreview = options.isStudioPreview ?? false;
    this.staffRepo = options.staffRepo;
    this.activityRepo = options.activityRepo;

    if (this.isStudioPreview) {
      this.storage = null;
    } else if (options.storage !== undefined) {
      this.storage = options.storage;
    } else if (typeof window !== "undefined") {
      try {
        this.storage = window.localStorage;
      } catch {
        this.storage = null;
      }
    } else {
      this.storage = null;
    }

    // Subscribe to staff directory mutations
    this.staffUnsub = this.staffRepo.subscribe(() => {
      const targetId = this.pendingSignInStaffId ?? this._staff?.id;
      if (!targetId) return;
      const currentEpoch = this.epoch;
      const refreshSequence = ++this.refreshSequence;

      void this.staffRepo
        .getById(targetId)
        .then((updated) => {
          if (this.epoch !== currentEpoch || this.refreshSequence !== refreshSequence) return;
          if (!updated || updated.status !== "active") {
            // Revoke immediately if disabled or removed
            this.epoch++;
            const wasLoggedIn = Boolean(this._staff);
            this._staff = null;
            this.clearStoredSession();
            if (wasLoggedIn) {
              this.notify();
            }
          } else if (this._staff && this._staff.id === updated.id) {
            // Update in-memory details if role or profile modified
            this._staff = updated;
            this.notify();
          }
        })
        .catch(() => {
          if (this.epoch !== currentEpoch || this.refreshSequence !== refreshSequence) return;
          this.epoch++;
          this._directoryUnavailable = true;
          this._staff = null;
          this.clearStoredSession();
          this.notify();
        });
    });

    // Multi-tab storage event synchronization
    if (typeof window !== "undefined" && !this.isStudioPreview) {
      this.windowStorageListener = (e: StorageEvent) => {
        if (
          (e.key === ADMIN_STORAGE_KEY || e.key === null) &&
          (!e.storageArea || e.storageArea === this.storage)
        ) {
          void this.resolveCurrentSession();
        }
      };
      window.addEventListener("storage", this.windowStorageListener);
    }
  }

  public setActivityRepository(repo: ActivityRepository): void {
    this.activityRepo = repo;
  }

  public destroy(): void {
    if (this.staffUnsub) {
      this.staffUnsub();
      this.staffUnsub = undefined;
    }
    if (typeof window !== "undefined" && this.windowStorageListener) {
      window.removeEventListener("storage", this.windowStorageListener);
      this.windowStorageListener = undefined;
    }
    this.listeners.clear();
  }

  public get ready(): boolean {
    return this._ready;
  }

  public get staff(): StaffMember | null {
    return this._staff;
  }

  public get directoryUnavailable(): boolean {
    return this._directoryUnavailable;
  }

  public get actor(): ActivityActorSnapshot | null {
    if (!this._staff || this._staff.status !== "active") return null;
    return {
      id: this._staff.id,
      name: this._staff.name,
      email: this._staff.email,
      role: this._staff.role,
    };
  }

  public getState(): AdminSessionState {
    return {
      ready: this.ready,
      staff: this.staff,
      directoryUnavailable: this.directoryUnavailable,
      actor: this.actor,
    };
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
        console.error("Session listener error:", err);
      }
    }
  }

  public async resolveCurrentSession(): Promise<void> {
    if (this.isStudioPreview) {
      this._ready = true;
      this.notify();
      return;
    }

    const currentEpoch = ++this.epoch;
    ++this.refreshSequence;
    this._directoryUnavailable = false;

    try {
      if (this.storage) {
        const raw = this.storage.getItem(ADMIN_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            this.legacyAdminData = parsed;
            const staffId = typeof parsed.staffId === "string" ? parsed.staffId : null;
            if (staffId) {
              try {
                const found = await this.staffRepo.getById(staffId);
                if (this.epoch !== currentEpoch) return;

                if (found && found.status === "active") {
                  this._staff = found;
                  this._directoryUnavailable = false;
                  this._ready = true;
                  this.notify();
                  return;
                }
                // The epoch check above owns this resolution. Re-enabling the
                // identity later must require a fresh sign-in.
                this.clearStoredSession(staffId);
              } catch {
                if (this.epoch !== currentEpoch) return;
                this._staff = null;
                this._directoryUnavailable = true;
                this._ready = true;
                this.notify();
                return;
              }
            }
          }
        }
      }
    } catch {
      /* ignore malformed local storage */
    }

    if (this.epoch !== currentEpoch) return;
    this._staff = null;
    this._ready = true;
    this.notify();
  }

  public async signIn(
    email: string,
    passphrase: string,
    onAuditWarning?: () => void,
  ): Promise<AdminSignInResult> {
    const currentEpoch = ++this.epoch;

    if (!this.isStudioPreview && !this.storage) {
      return { ok: false, error: "storage_unavailable" };
    }

    const normalized = email.trim().toLowerCase();

    let found: StaffMember | null = null;
    try {
      found = await this.staffRepo.getByEmail(normalized);
    } catch {
      return { ok: false, error: "directory_unavailable" };
    }

    if (this.epoch !== currentEpoch) return { ok: false, error: "unknown" };
    if (!found || found.status !== "active") {
      return { ok: false, error: "unknown" };
    }

    if (passphrase.trim() !== MOCK_PASSPHRASE) {
      return { ok: false, error: "pass" };
    }

    this.pendingSignInStaffId = found.id;
    this.pendingSignInEpoch = currentEpoch;
    try {
      // Required canonical staff update before session adoption
      let touched: StaffMember;
      try {
        const res = await this.staffRepo.touchLastActive(found.id);
        if (!res || res.status !== "active") {
          return { ok: false, error: "unknown" };
        }
        touched = res;
      } catch {
        return { ok: false, error: "directory_unavailable" };
      }

      // Canonical re-check & epoch check BEFORE session write
      if (this.epoch !== currentEpoch) {
        return { ok: false, error: "unknown" };
      }

      let fresh: StaffMember | null = null;
      try {
        fresh = await this.staffRepo.getById(touched.id);
      } catch {
        return { ok: false, error: "directory_unavailable" };
      }
      if (this.epoch !== currentEpoch || !fresh || fresh.status !== "active") {
        return { ok: false, error: "unknown" };
      }

      // Persist session identity before establishing in-memory authority
      try {
        if (this.storage && !this.isStudioPreview) {
          const payload = {
            ...this.legacyAdminData,
            staffId: fresh.id,
          };
          this.storage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(payload));
        }
      } catch {
        return { ok: false, error: "storage_unavailable" };
      }

      // Epoch check immediately AFTER storage persistence
      if (this.epoch !== currentEpoch) {
        this.clearStoredSession();
        return { ok: false, error: "unknown" };
      }

      // Establish in-memory session authority BEFORE audit append
      this._staff = fresh;
      this._directoryUnavailable = false;
      this._ready = true;
      this.notify();

      // Record successful sign-in audit event (separate-store non-ACID)
      const actorSnapshot: ActivityActorSnapshot = {
        id: fresh.id,
        name: fresh.name,
        email: fresh.email,
        role: fresh.role,
      };

      try {
        await recordAdminAudit(
          this.activityRepo,
          actorSnapshot,
          {
            module: "session",
            action: "signin",
            targetType: "session",
            targetId: fresh.id,
            metadata: {
              email: fresh.email,
              role: fresh.role,
            },
          },
          onAuditWarning,
        );
      } catch {
        onAuditWarning?.();
      }

      // Obsolete work must not clear a newer session or its pending identity.
      if (this.epoch !== currentEpoch) return { ok: false, error: "unknown" };

      // Revocation of this command remains authoritative after the audit await.
      if (
        !this._staff ||
        this._staff.id !== fresh.id ||
        this._staff.status !== "active"
      ) {
        this.clearStoredSession();
        return { ok: false, error: "unknown" };
      }

      // Final canonical verification to guard against unnotified directory changes
      let finalCheck: StaffMember | null = null;
      try {
        finalCheck = await this.staffRepo.getById(fresh.id);
      } catch {
        if (this.epoch !== currentEpoch) return { ok: false, error: "unknown" };
        this._staff = null;
        this._directoryUnavailable = true;
        this.clearStoredSession();
        this.notify();
        return { ok: false, error: "directory_unavailable" };
      }

      if (this.epoch !== currentEpoch) return { ok: false, error: "unknown" };
      if (!finalCheck || finalCheck.status !== "active") {
        this._staff = null;
        this.clearStoredSession();
        this.notify();
        return { ok: false, error: "unknown" };
      }

      const detailsChanged = JSON.stringify(this._staff) !== JSON.stringify(finalCheck);
      this._staff = finalCheck;
      if (detailsChanged) this.notify();
      return { ok: true };
    } finally {
      if (this.pendingSignInEpoch === currentEpoch) {
        this.pendingSignInStaffId = null;
        this.pendingSignInEpoch = null;
      }
    }
  }

  public signOut(): void {
    this.epoch++;
    this.refreshSequence++;
    this.pendingSignInEpoch = null;
    this._staff = null;
    this.pendingSignInStaffId = null;
    this.clearStoredSession();
    this.notify();
  }

  private clearStoredSession(expectedStaffId?: string): void {
    if (!this.storage || this.isStudioPreview) return;
    try {
      const raw = this.storage.getItem(ADMIN_STORAGE_KEY);
      let parsed: unknown = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { /* clear malformed session identity */ }
      const current = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : this.legacyAdminData;
      // A newer cross-tab identity may already be persisted before its event arrives.
      if (expectedStaffId !== undefined && current["staffId"] !== expectedStaffId) return;
      const payload = {
        ...current,
        staffId: null,
      };
      this.storage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }
}
