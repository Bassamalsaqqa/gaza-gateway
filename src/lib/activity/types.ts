/**
 * Gaza Gateway — Canonical Local Activity Types (Phase 6C)
 *
 * Defines the contract for the local administrative activity log.
 * Storage authority: `gza.activity.v1`.
 *
 * Guaranteed invariants:
 * - Empty by default (missing store starts with empty events array).
 * - Ring-buffer retention of newest 500 events.
 * - Safe actor snapshots: immutable staff identity at time of action.
 * - Strictly bounded metadata: NO PII, secrets, documents, or raw messages.
 * - Pure semantic events: localized at render time, not pre-baked prose.
 */

export type ActivityModule =
  | "bookings"
  | "flights"
  | "schedules"
  | "network"
  | "fleet"
  | "commercial"
  | "inbox"
  | "staff"
  | "session";

export type ActivityAction =
  | "created"
  | "updated"
  | "cancelled"
  | "checked_in"
  | "undo_check_in"
  | "assigned"
  | "status_changed"
  | "role_changed"
  | "signin"
  | "cleared";

export interface ActivityActorSnapshot {
  id: string;
  name: { en: string; ar: string };
  email: string;
  role: "admin" | "editor" | "viewer";
}

export interface ActivityEvent {
  id: string;
  timestamp: string; // ISO 8601
  actor: ActivityActorSnapshot;
  module: ActivityModule;
  action: ActivityAction;
  targetType: string;
  targetId: string;
  descriptionKey?: string | undefined;
  before?: string | null | undefined;
  after?: string | null | undefined;
  metadata?: Record<string, string | number | boolean> | undefined;
}

export interface ActivityEnvelopeV1 {
  schemaVersion: 1;
  revision: number;
  events: ActivityEvent[];
}

export interface CreateActivityInput {
  actor: ActivityActorSnapshot;
  module: ActivityModule;
  action: ActivityAction;
  targetType: string;
  targetId: string;
  descriptionKey?: string | undefined;
  before?: string | null | undefined;
  after?: string | null | undefined;
  metadata?: Record<string, string | number | boolean> | undefined;
  timestamp?: string | undefined;
}

export interface ActivityFilter {
  actorId?: string | undefined;
  module?: ActivityModule | "all" | undefined;
  action?: ActivityAction | "all" | undefined;
  date?: string | undefined; // YYYY-MM-DD
  targetId?: string | undefined;
}

export interface ActivityRepository {
  list(filter?: ActivityFilter): Promise<ActivityEvent[]>;
  getById(id: string): Promise<ActivityEvent | null>;
  append(input: CreateActivityInput): Promise<ActivityEvent>;
  clear(): Promise<void>;
  subscribe(listener: () => void): () => void;
}
