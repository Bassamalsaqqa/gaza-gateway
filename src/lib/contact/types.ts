/**
 * Gaza Gateway — Contact Domain Types & Contracts
 *
 * Defines canonical data types, filters, and repository interfaces
 * for public contact enquiries and admin staff inbox workflows.
 */

export type ContactTopic =
  | "booking"
  | "baggage"
  | "accessibility"
  | "archive"
  | "media"
  | "other";

export type ContactStatus = "new" | "open" | "resolved" | "spam";

export type ContactLanguage = "en" | "ar";

export interface InternalNote {
  id: string;
  body: string;
  createdAt: string; // ISO 8601
  staffId: string;
  staffName?: string | undefined;
}

export interface ContactMessage {
  id: string;
  submissionId: string;
  senderName: string;
  email: string;
  topic: ContactTopic;
  message: string;
  language: ContactLanguage;
  bookingRef?: string | undefined;
  status: ContactStatus;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  source: "public-contact" | "seed";
  assignedStaffId?: string | undefined;
  replyDraft?: string | undefined;
  internalNotes: InternalNote[];
}

export interface ContactEnvelope {
  schemaVersion: 1;
  revision: number;
  messages: ContactMessage[];
}

export interface ContactFilterOptions {
  status?: ContactStatus | "all" | undefined;
  topic?: ContactTopic | "all" | undefined;
  language?: ContactLanguage | "all" | undefined;
  search?: string | undefined;
}

export interface ContactCreateInput {
  submissionId: string;
  senderName: string;
  email: string;
  topic: ContactTopic;
  message: string;
  language: ContactLanguage;
  bookingRef?: string | undefined;
}

export interface ContactRepository {
  /** Retrieves messages matching the provided filters, sorted newest first. */
  list(filters?: ContactFilterOptions): Promise<ContactMessage[]>;

  /** Retrieves a single contact message by its identifier. */
  getById(id: string): Promise<ContactMessage | null>;

  /** Creates and persists a new public contact enquiry. Idempotent on submissionId replay. */
  create(input: ContactCreateInput): Promise<ContactMessage>;

  /** Updates message workflow status (new, open, resolved, spam). */
  setStatus(id: string, status: ContactStatus): Promise<ContactMessage>;

  /** Appends a non-empty internal note with staff attribution. */
  addInternalNote(
    id: string,
    note: { body: string; staffId: string; staffName?: string | undefined },
  ): Promise<ContactMessage>;

  /** Assigns or unassigns (pass null) a staff member to the message. */
  setAssignee(id: string, staffId: string | null): Promise<ContactMessage>;

  /** Saves or clears a local reply draft. */
  saveReplyDraft(id: string, replyDraft: string): Promise<ContactMessage>;

  /** Counts messages with status === "new". */
  countNew(): Promise<number>;

  /** Subscribes to changes in contact message state. */
  subscribe(listener: () => void): () => void;
}
