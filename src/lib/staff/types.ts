/**
 * Gaza Gateway — Canonical Staff Types & Repository Contract (`gza.staff.v1`)
 *
 * Defines the canonical aggregates, envelope schema, input types, and
 * asynchronous repository contract for administrative staff identities.
 * Authority: `gza.staff.v1`.
 */

import type { AdminRole } from "../admin.ts";

export type StaffStatus = "active" | "disabled";

export interface StaffMember {
  id: string;
  name: { en: string; ar: string };
  email: string;
  role: AdminRole;
  status: StaffStatus;
  title: { en: string; ar: string };
  createdAt: string;
  lastActiveAt: string | null;
}

export interface StaffEnvelopeV1 {
  schemaVersion: 1;
  revision: number;
  staff: StaffMember[];
}

export type StaffStorageV1 = StaffEnvelopeV1;

export interface CreateStaffInput {
  name: { en: string; ar: string };
  email: string;
  role: AdminRole;
  title?: { en: string; ar: string } | undefined;
  status?: StaffStatus | undefined;
}

export interface UpdateStaffProfileInput {
  name?: { en: string; ar: string } | undefined;
  title?: { en: string; ar: string } | undefined;
}

export type StaffErrorCode =
  | "staff_unavailable"
  | "invalid_staff"
  | "not_found"
  | "email_taken"
  | "last_admin_protected"
  | "commit_failed";

export class StaffError extends Error {
  public readonly code: StaffErrorCode;
  public readonly fieldErrors?: Record<string, string> | undefined;

  constructor(code: StaffErrorCode, fieldErrors?: Record<string, string>) {
    super(`Staff operation failed: ${code}`);
    this.name = "StaffError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export interface StaffMutationReceipt {
  member: StaffMember;
  changed: boolean;
  beforeRole?: AdminRole;
  beforeStatus?: StaffStatus;
}

export interface StaffRepository {
  /** Lists all staff members in the directory (both active and disabled). */
  list(): Promise<StaffMember[]>;

  /** Retrieves a staff member by ID (case-sensitive). */
  getById(id: string): Promise<StaffMember | null>;

  /** Retrieves an active or disabled staff member by email (case-insensitive, trimmed). */
  getByEmail(email: string): Promise<StaffMember | null>;

  /** Creates a new staff member with a stable generated ID. Rejects duplicate emails. */
  create(input: CreateStaffInput): Promise<StaffMember>;

  /**
   * Updates a staff member's administrative role.
   * Rejects if attempting to demote the last active administrator.
   */
  updateRole(id: string, role: AdminRole): Promise<StaffMember>;

  /** Updates role and returns a transaction receipt indicating whether state changed. */
  updateRoleWithReceipt(id: string, role: AdminRole): Promise<StaffMutationReceipt>;

  /**
   * Sets staff status to "active" or "disabled".
   * Rejects if attempting to disable the last active administrator.
   */
  setStatus(id: string, status: StaffStatus): Promise<StaffMember>;

  /** Sets status and returns a transaction receipt indicating whether state changed. */
  setStatusWithReceipt(id: string, status: StaffStatus): Promise<StaffMutationReceipt>;

  /** Updates staff member's display name or title. */
  updateProfile(id: string, input: UpdateStaffProfileInput): Promise<StaffMember>;

  /** Updates profile and returns a transaction receipt indicating whether state changed. */
  updateProfileWithReceipt(id: string, input: UpdateStaffProfileInput): Promise<StaffMutationReceipt>;

  /** Records last activity timestamp (ISO string, defaults to current time). */
  touchLastActive(id: string, timestamp?: string): Promise<StaffMember>;

  /** Subscribes to changes in the staff repository. */
  subscribe(listener: () => void): () => void;
}
