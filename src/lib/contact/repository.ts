/**
 * Gaza Gateway — Contact Repository Implementation
 *
 * Implements ContactRepository contract backed by ContactStorageCoordinator:
 * - Deterministic sorting and multi-field search/filtering
 * - SubmissionId idempotency with replay detection
 * - State machine for status transitions
 * - Internal notes with staff attribution
 * - Assignee and local reply draft persistence
 * - Dependency injection for testing (clock, idGenerator, coordinator)
 */

import { contactCreateInputSchema, internalNoteInputSchema, CONTACT_STATUSES } from "./schema.ts";
import { ContactStorageCoordinator } from "./storage.ts";
import type {
  ContactCreateInput,
  ContactFilterOptions,
  ContactMessage,
  ContactMutationReceipt,
  ContactRepository,
  ContactStatus,
  InternalNote,
} from "./types.ts";

export interface ContactRepositoryOptions {
  coordinator?: ContactStorageCoordinator | undefined;
  now?: (() => string) | undefined;
  idGenerator?: (() => string) | undefined;
}

export class LocalContactRepository implements ContactRepository {
  private readonly coordinator: ContactStorageCoordinator;
  private readonly now: () => string;
  private readonly idGenerator: () => string;

  constructor(options?: ContactRepositoryOptions) {
    this.coordinator = options?.coordinator ?? new ContactStorageCoordinator();
    this.now = options?.now ?? (() => new Date().toISOString());
    this.idGenerator =
      options?.idGenerator ??
      (() =>
        typeof crypto !== "undefined" && crypto.randomUUID
          ? `cmsg-${crypto.randomUUID()}`
          : `cmsg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  }

  public async list(filters?: ContactFilterOptions): Promise<ContactMessage[]> {
    const all = this.coordinator.getMessages();

    // Deterministic sort: newest createdAt first, tie-breaker id descending
    all.sort((a, b) => {
      const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id.localeCompare(a.id);
    });

    if (!filters) {
      return all;
    }

    const { status, topic, language, search } = filters;
    const query = search?.trim().toLowerCase();

    return all.filter((m) => {
      if (status && status !== "all" && m.status !== status) {
        return false;
      }
      if (topic && topic !== "all" && m.topic !== topic) {
        return false;
      }
      if (language && language !== "all" && m.language !== language) {
        return false;
      }
      if (query) {
        const haystacks = [
          m.senderName.toLowerCase(),
          m.email.toLowerCase(),
          (m.bookingRef ?? "").toLowerCase(),
          m.message.toLowerCase(),
        ];
        if (!haystacks.some((h) => h.includes(query))) {
          return false;
        }
      }
      return true;
    });
  }

  public async getById(id: string): Promise<ContactMessage | null> {
    const all = this.coordinator.getMessages();
    const found = all.find((m) => m.id === id);
    return found ? structuredClone(found) : null;
  }

  public async create(input: ContactCreateInput): Promise<ContactMessage> {
    const validated = contactCreateInputSchema.parse(input);

    return this.coordinator.mutate((candidate) => {
      const existing = candidate.messages.find((m) => m.submissionId === validated.submissionId);

      if (existing) {
        // Replay verification: verify payload equivalence
        const matches =
          existing.senderName === validated.senderName &&
          existing.email === validated.email &&
          existing.topic === validated.topic &&
          existing.message === validated.message &&
          existing.language === validated.language &&
          (existing.bookingRef ?? undefined) === (validated.bookingRef ?? undefined);

        if (matches) {
          return structuredClone(existing);
        }
        throw new Error(
          `Conflicting submissionId '${validated.submissionId}': message exists with different content.`,
        );
      }

      const timestamp = this.now();
      const newMessage: ContactMessage = {
        id: this.idGenerator(),
        submissionId: validated.submissionId,
        senderName: validated.senderName,
        email: validated.email,
        topic: validated.topic,
        message: validated.message,
        language: validated.language,
        ...(validated.bookingRef ? { bookingRef: validated.bookingRef } : {}),
        status: "new",
        createdAt: timestamp,
        updatedAt: timestamp,
        source: "public-contact",
        internalNotes: [],
      };

      candidate.messages.unshift(newMessage);
      return newMessage;
    });
  }

  public async setStatusWithReceipt(
    id: string,
    status: ContactStatus,
  ): Promise<ContactMutationReceipt> {
    if (!CONTACT_STATUSES.includes(status)) {
      throw new Error(`Invalid contact status '${status}'.`);
    }

    let updated: ContactMessage | null = null;
    let changed = false;
    let beforeStatus: ContactStatus | undefined;

    await this.coordinator.mutate((candidate) => {
      const msg = candidate.messages.find((m) => m.id === id);
      if (!msg) {
        throw new Error(`Contact message with ID '${id}' not found.`);
      }
      beforeStatus = msg.status;
      if (msg.status === status) {
        updated = structuredClone(msg);
        changed = false;
        return;
      }
      msg.status = status;
      msg.updatedAt = this.now();
      updated = structuredClone(msg);
      changed = true;
    });

    if (!updated) {
      throw new Error(`Failed to update status for contact message '${id}'.`);
    }
    return { message: updated, changed, beforeStatus };
  }

  public async setStatus(id: string, status: ContactStatus): Promise<ContactMessage> {
    const receipt = await this.setStatusWithReceipt(id, status);
    return receipt.message;
  }

  public async addInternalNote(
    id: string,
    note: { body: string; staffId: string; staffName?: string | undefined },
  ): Promise<ContactMessage> {
    const validated = internalNoteInputSchema.parse(note);

    let updated: ContactMessage | null = null;
    await this.coordinator.mutate((candidate) => {
      const msg = candidate.messages.find((m) => m.id === id);
      if (!msg) {
        throw new Error(`Contact message with ID '${id}' not found.`);
      }

      const noteId = `note-${this.idGenerator()}`;

      const newNote: InternalNote = {
        id: noteId,
        body: validated.body,
        createdAt: this.now(),
        staffId: validated.staffId,
        staffName: validated.staffName,
      };

      if (!msg.internalNotes) {
        msg.internalNotes = [];
      }
      msg.internalNotes.push(newNote);
      msg.updatedAt = this.now();
      updated = structuredClone(msg);
    });

    if (!updated) {
      throw new Error(`Failed to add note to contact message '${id}'.`);
    }
    return updated;
  }

  public async setAssigneeWithReceipt(
    id: string,
    staffId: string | null,
  ): Promise<ContactMutationReceipt> {
    const targetStaffId = staffId?.trim() ? staffId.trim() : undefined;
    let updated: ContactMessage | null = null;
    let changed = false;
    let beforeAssignee: string | null | undefined;

    await this.coordinator.mutate((candidate) => {
      const msg = candidate.messages.find((m) => m.id === id);
      if (!msg) {
        throw new Error(`Contact message with ID '${id}' not found.`);
      }
      beforeAssignee = msg.assignedStaffId ?? null;
      if ((msg.assignedStaffId ?? undefined) === targetStaffId) {
        updated = structuredClone(msg);
        changed = false;
        return;
      }
      msg.assignedStaffId = targetStaffId;
      msg.updatedAt = this.now();
      updated = structuredClone(msg);
      changed = true;
    });

    if (!updated) {
      throw new Error(`Failed to set assignee for contact message '${id}'.`);
    }
    return { message: updated, changed, beforeAssignee };
  }

  public async setAssignee(id: string, staffId: string | null): Promise<ContactMessage> {
    const receipt = await this.setAssigneeWithReceipt(id, staffId);
    return receipt.message;
  }

  public async saveReplyDraft(id: string, replyDraft: string): Promise<ContactMessage> {
    let updated: ContactMessage | null = null;
    await this.coordinator.mutate((candidate) => {
      const msg = candidate.messages.find((m) => m.id === id);
      if (!msg) {
        throw new Error(`Contact message with ID '${id}' not found.`);
      }
      msg.replyDraft = replyDraft.trim() ? replyDraft : undefined;
      msg.updatedAt = this.now();
      updated = structuredClone(msg);
    });

    if (!updated) {
      throw new Error(`Failed to save reply draft for contact message '${id}'.`);
    }
    return updated;
  }

  public async countNew(): Promise<number> {
    const all = this.coordinator.getMessages();
    return all.filter((m) => m.status === "new").length;
  }

  public subscribe(listener: () => void): () => void {
    return this.coordinator.subscribe(listener);
  }
}

export class InMemoryContactRepository extends LocalContactRepository {
  constructor(initialData?: import("./types.ts").ContactEnvelope) {
    super({
      coordinator: new ContactStorageCoordinator({
        inMemoryOnly: true,
        initialData,
      }),
    });
  }
}
