/**
 * Gaza Gateway — Booking Draft Types & Repository Contract
 *
 * Canonical frontend contracts for:
 * 1. BookingDraftEnvelopeV1: Schema version 1 persistence envelope on `gza.booking.draft.v1`.
 * 2. BookingDraftRepository: Aggregate root interface for wizard draft operations.
 * 3. BookingDraftState: Complete reactive state with storage readiness & persistence flags.
 * 4. DraftReconciliationResult: Typed result of effective flight reconciliation.
 */

import type { Flight } from "../data.ts";
import type {
  Contact,
  Draft,
  Extras,
  Passenger,
  PassengerType,
  PaxExtras,
  SearchCriteria,
} from "../booking-draft.ts";
import type { FlightUnbookableReason } from "../booking-rules.ts";

export type {
  Contact,
  Draft,
  Extras,
  Passenger,
  PassengerType,
  PaxExtras,
  SearchCriteria,
};

/** Storage key for the canonical booking draft envelope */
export const BOOKING_DRAFT_STORAGE_KEY = "gza.booking.draft.v1";

/** Legacy store key for one-time migration and rollback */
export const LEGACY_STORE_STORAGE_KEY = "gza.store.v1";

export const BOOKING_DRAFT_SCHEMA_VERSION = 1;

/**
 * Versioned persistence envelope for `gza.booking.draft.v1`.
 * Supports active draft or cleared tombstone to strictly prevent legacy resurrection.
 */
export type BookingDraftEnvelopeV1 =
  | {
      schemaVersion: 1;
      status: "active";
      draft: Draft;
      updatedAt: string;
      revision: number;
      submissionId: string;
    }
  | {
      schemaVersion: 1;
      status: "cleared";
      draft: null;
      updatedAt: string;
      clearedAt: string;
      revision: number;
      submissionId: string;
    };

/** Five distinct storage authority states */
export type BookingDraftStorageState =
  | "missing"      // getItem === null -> only state that permits one-time legacy migration
  | "active"       // Valid active canonical envelope
  | "cleared"      // Authoritative tombstone -> never resurrect legacy
  | "malformed"    // Present but corrupt -> sanitize/repair fresh; never resurrect legacy
  | "unavailable"; // Storage read threw -> memory mode; never claim persistence

export interface BookingDraftState {
  ready: boolean;
  isPersistent: boolean;
  storageState: BookingDraftStorageState;
  draft: Draft;
  revision: number;
  updatedAt: string;
  submissionId: string;
}

export type LegReconciliationStatus =
  | "unchanged"
  | "refreshed"
  | "missing"
  | "route_mismatch"
  | "date_mismatch"
  | "unbookable"
  | "unsupported_cabin";

export interface LegReconciliationResult {
  leg: "out" | "in";
  status: LegReconciliationStatus;
  originalFlight: Flight | null;
  effectiveFlight: Flight | null;
  reason?: FlightUnbookableReason | "flight_missing" | "route_mismatch" | "date_mismatch" | "cabin_unavailable" | undefined;
  seatsCleared: string[];
}

export interface DraftReconciliationResult {
  reconciledDraft: Draft;
  changed: boolean;
  outbound: LegReconciliationResult;
  inbound?: LegReconciliationResult | undefined;
  invalidatedLegs: ("out" | "in")[];
}

export interface BookingDraftRepository {
  /** Gets the current in-memory cached draft snapshot (synchronous) */
  getDraft(): Draft;

  /** Gets the complete draft state including storage metadata */
  getState(): BookingDraftState;

  /** Updates the draft with a state mutator or partial object evaluated against latest committed state */
  updateDraft(updater: Partial<Draft> | ((prev: Draft) => Draft)): Promise<Draft>;

  /** Resets draft from fresh search criteria */
  resetDraft(
    criteria: SearchCriteria,
    options?: { meal?: string; email?: string; phone?: string },
  ): Promise<Draft>;

  /** Atomically clears the draft and writes an authoritative tombstone */
  clearDraft(): Promise<void>;

  /** Returns or generates a stable submission identifier for the active draft */
  getSubmissionId(): string;

  /** Generates a fresh submission ID (e.g. when criteria change or after booking failure) */
  refreshSubmissionId(): string;

  /** Reconciles draft selections against fresh effective flight instances */
  reconcile(
    effectiveOutbound: Flight | null | undefined,
    effectiveInbound: Flight | null | undefined,
    options?: {
      now?: Date | string | number | undefined;
      cabin?: string | undefined;
      outboundLayout?: import("../fleet/types.ts").AircraftLayout | null | undefined;
      inboundLayout?: import("../fleet/types.ts").AircraftLayout | null | undefined;
      layouts?: {
        out?: import("../fleet/types.ts").AircraftLayout | null | undefined;
        in?: import("../fleet/types.ts").AircraftLayout | null | undefined;
      } | undefined;
    },
  ): Promise<DraftReconciliationResult>;

  /** Subscribes to draft state changes (local and cross-tab) */
  subscribe(listener: () => void): () => void;

  /** Whether the repository is initialized and ready */
  isReady(): boolean;

  /** Whether persistence to localStorage is currently functional */
  isPersistent(): boolean;

  /** Destroys coordinator subscriptions and listeners */
  destroy(): void;
}
