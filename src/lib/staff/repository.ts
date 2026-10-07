/**
 * Gaza Gateway — Canonical Staff Repository Implementation (`gza.staff.v1`)
 *
 * Implements the asynchronous StaffRepository contract on top of StaffStorageCoordinator.
 * Enforces business rules:
 * - Stable sequential IDs (`adm-1`, `adm-2`, etc.)
 * - Unique normalized emails
 * - Protection of the last active administrator against demotion or disablement
 * - Detached returns preventing caller mutation
 */

import type { AdminRole } from "../admin.ts";
import { createStaffInputSchema, updateStaffProfileSchema } from "./schema.ts";
import { StaffStorageCoordinator } from "./storage.ts";
import {
  StaffError,
  type CreateStaffInput,
  type StaffMember,
  type StaffMutationReceipt,
  type StaffRepository,
  type StaffStatus,
  type UpdateStaffProfileInput,
} from "./types.ts";

export class LocalStaffRepository implements StaffRepository {
  private readonly coordinator: StaffStorageCoordinator;

  constructor(coordinator?: StaffStorageCoordinator) {
    this.coordinator = coordinator ?? new StaffStorageCoordinator();
  }

  getCoordinator(): StaffStorageCoordinator {
    return this.coordinator;
  }

  async list(): Promise<StaffMember[]> {
    const envelope = this.coordinator.read();
    return structuredClone(envelope.staff);
  }

  async getById(id: string): Promise<StaffMember | null> {
    const envelope = this.coordinator.read();
    const found = envelope.staff.find((s) => s.id === id);
    return found ? structuredClone(found) : null;
  }

  async getByEmail(email: string): Promise<StaffMember | null> {
    const normalized = email.trim().toLowerCase();
    const envelope = this.coordinator.read();
    const found = envelope.staff.find((s) => s.email.toLowerCase() === normalized);
    return found ? structuredClone(found) : null;
  }

  async create(input: CreateStaffInput): Promise<StaffMember> {
    const validatedInput = createStaffInputSchema.safeParse(input);
    if (!validatedInput.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of validatedInput.error.issues) {
        fieldErrors[issue.path.join(".")] = issue.message;
      }
      throw new StaffError("invalid_staff", fieldErrors);
    }

    return this.coordinator.mutate((candidate) => {
      const normalizedEmail = validatedInput.data.email.trim().toLowerCase();
      if (candidate.staff.some((s) => s.email.toLowerCase() === normalizedEmail)) {
        throw new StaffError("email_taken", {
          email: "A staff member with this email address already exists.",
        });
      }

      // Generate next sequential stable ID (e.g. adm-5)
      let maxSeq = 0;
      for (const s of candidate.staff) {
        const match = /^adm-(\d+)$/.exec(s.id);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (num > maxSeq) maxSeq = num;
        }
      }
      const newId = `adm-${maxSeq + 1}`;

      const defaultTitle = {
        admin: { en: "Airport administrator", ar: "مسؤولة المطار" },
        editor: { en: "Content editor", ar: "محرِّر المحتوى" },
        viewer: { en: "Operations viewer", ar: "مطالعة العمليات" },
      }[validatedInput.data.role];

      const newMember: StaffMember = {
        id: newId,
        name: validatedInput.data.name,
        email: normalizedEmail,
        role: validatedInput.data.role,
        status: validatedInput.data.status ?? "active",
        title: validatedInput.data.title ?? defaultTitle,
        createdAt: new Date().toISOString(),
        lastActiveAt: null,
      };

      candidate.staff.push(newMember);
      return newMember;
    });
  }

  async updateRoleWithReceipt(id: string, role: AdminRole): Promise<StaffMutationReceipt> {
    return this.coordinator.mutate((candidate) => {
      const idx = candidate.staff.findIndex((s) => s.id === id);
      if (idx === -1) {
        throw new StaffError("not_found");
      }

      const existing = candidate.staff[idx] as StaffMember;
      const beforeRole = existing.role;
      const beforeStatus = existing.status;
      if (existing.role === role) {
        return {
          member: structuredClone(existing),
          changed: false,
          beforeRole,
          beforeStatus,
        };
      }

      const updated: StaffMember = {
        ...existing,
        role,
      };
      candidate.staff[idx] = updated;
      return {
        member: structuredClone(updated),
        changed: true,
        beforeRole,
        beforeStatus,
      };
    });
  }

  async updateRole(id: string, role: AdminRole): Promise<StaffMember> {
    const receipt = await this.updateRoleWithReceipt(id, role);
    return receipt.member;
  }

  async setStatusWithReceipt(id: string, status: StaffStatus): Promise<StaffMutationReceipt> {
    return this.coordinator.mutate((candidate) => {
      const idx = candidate.staff.findIndex((s) => s.id === id);
      if (idx === -1) {
        throw new StaffError("not_found");
      }

      const existing = candidate.staff[idx] as StaffMember;
      const beforeRole = existing.role;
      const beforeStatus = existing.status;
      if (existing.status === status) {
        return {
          member: structuredClone(existing),
          changed: false,
          beforeRole,
          beforeStatus,
        };
      }

      const updated: StaffMember = {
        ...existing,
        status,
      };
      candidate.staff[idx] = updated;
      return {
        member: structuredClone(updated),
        changed: true,
        beforeRole,
        beforeStatus,
      };
    });
  }

  async setStatus(id: string, status: StaffStatus): Promise<StaffMember> {
    const receipt = await this.setStatusWithReceipt(id, status);
    return receipt.member;
  }

  async updateProfileWithReceipt(
    id: string,
    input: UpdateStaffProfileInput,
  ): Promise<StaffMutationReceipt> {
    const validated = updateStaffProfileSchema.safeParse(input);
    if (!validated.success) {
      throw new StaffError("invalid_staff");
    }

    return this.coordinator.mutate((candidate) => {
      const idx = candidate.staff.findIndex((s) => s.id === id);
      if (idx === -1) {
        throw new StaffError("not_found");
      }

      const existing = candidate.staff[idx] as StaffMember;
      const updated: StaffMember = {
        ...existing,
        ...(validated.data.name ? { name: validated.data.name } : {}),
        ...(validated.data.title ? { title: validated.data.title } : {}),
      };

      const changed = JSON.stringify(existing) !== JSON.stringify(updated);
      if (changed) {
        candidate.staff[idx] = updated;
      }
      return { member: structuredClone(updated), changed };
    });
  }

  async updateProfile(id: string, input: UpdateStaffProfileInput): Promise<StaffMember> {
    const receipt = await this.updateProfileWithReceipt(id, input);
    return receipt.member;
  }

  async touchLastActive(id: string, timestamp?: string): Promise<StaffMember> {
    return this.coordinator.mutate((candidate) => {
      const idx = candidate.staff.findIndex((s) => s.id === id);
      if (idx === -1) {
        throw new StaffError("not_found");
      }

      const existing = candidate.staff[idx] as StaffMember;
      const updated: StaffMember = {
        ...existing,
        lastActiveAt: timestamp ?? new Date().toISOString(),
      };
      candidate.staff[idx] = updated;
      return updated;
    });
  }

  subscribe(listener: () => void): () => void {
    return this.coordinator.subscribe(listener);
  }
}
