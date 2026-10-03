/**
 * Gaza Gateway — Contact Validation & Schemas
 *
 * Provides runtime validation using Zod for:
 * - Public contact submission inputs
 * - Internal notes & workflow commands
 * - Persistent storage envelope and message sanitization
 */

import { z } from "zod";
import type {
  ContactCreateInput,
  ContactEnvelope,
  ContactLanguage,
  ContactMessage,
  ContactStatus,
  ContactTopic,
  InternalNote,
} from "./types.ts";

export const CONTACT_TOPICS: readonly ContactTopic[] = [
  "booking",
  "baggage",
  "accessibility",
  "archive",
  "media",
  "other",
] as const;

export const CONTACT_STATUSES: readonly ContactStatus[] = [
  "new",
  "open",
  "resolved",
  "spam",
] as const;

export const CONTACT_LANGUAGES: readonly ContactLanguage[] = ["en", "ar"] as const;

export const contactCreateInputSchema = z.object({
  submissionId: z.string().trim().min(1, "Submission ID is required").max(200),
  senderName: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(120, "Name must be 120 characters or less"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .max(254, "Email must be 254 characters or less")
    .email("Please enter a valid email address"),
  topic: z.enum(CONTACT_TOPICS as [ContactTopic, ...ContactTopic[]]),
  message: z
    .string()
    .trim()
    .min(10, "Message must be at least 10 characters")
    .max(5000, "Message must be 5000 characters or less"),
  language: z.enum(CONTACT_LANGUAGES as [ContactLanguage, ...ContactLanguage[]]),
  bookingRef: z
    .string()
    .trim()
    .transform((val) => val.toUpperCase())
    .refine((val) => val === "" || /^[A-Z0-9]{4,12}$/.test(val), {
      message: "Booking reference must be 4–12 alphanumeric characters (e.g. GZA4TQ)",
    })
    .transform((val) => (val === "" ? undefined : val))
    .optional(),
});

export const internalNoteInputSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Internal note cannot be empty")
    .max(2000, "Internal note must be 2000 characters or less"),
  staffId: z.string().trim().min(1, "Staff ID is required"),
  staffName: z.string().trim().optional(),
});

export const internalNoteSchema = z.object({
  id: z.string().trim().min(1).max(200),
  body: z
    .string()
    .min(1)
    .max(2000)
    .refine((s) => s.trim().length > 0),
  createdAt: z.string().datetime({ offset: true }),
  staffId: z.string().trim().min(1).max(200),
  staffName: z.string().max(200).optional(),
});

export const contactMessageSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    submissionId: z.string().trim().min(1).max(200),
    senderName: z
      .string()
      .min(2)
      .max(120)
      .refine((s) => s.trim().length >= 2),
    email: z.string().max(254).email(),
    topic: z.enum(CONTACT_TOPICS as [ContactTopic, ...ContactTopic[]]),
    message: z
      .string()
      .min(10)
      .max(5000)
      .refine((s) => s.trim().length >= 10),
    language: z.enum(CONTACT_LANGUAGES as [ContactLanguage, ...ContactLanguage[]]),
    bookingRef: z
      .string()
      .regex(/^[A-Z0-9]{4,12}$/)
      .optional(),
    status: z.enum(CONTACT_STATUSES as [ContactStatus, ...ContactStatus[]]),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    source: z.enum(["public-contact", "seed"]),
    assignedStaffId: z.string().optional(),
    replyDraft: z.string().optional(),
    internalNotes: z.array(internalNoteSchema).default([]),
  })
  .superRefine((message, ctx) => {
    if (new Set(message.internalNotes.map((n) => n.id)).size !== message.internalNotes.length) {
      ctx.addIssue({ code: "custom", path: ["internalNotes"], message: "Duplicate note identity" });
    }
  });

export const contactEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative().default(0),
    messages: z.array(contactMessageSchema),
  })
  .superRefine((envelope, ctx) => {
    for (const key of ["id", "submissionId"] as const) {
      if (new Set(envelope.messages.map((m) => m[key])).size !== envelope.messages.length) {
        ctx.addIssue({ code: "custom", path: ["messages"], message: `Duplicate ${key}` });
      }
    }
  });

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: Record<string, string>;
}

export function validateContactCreateInput(input: unknown): ValidationResult<ContactCreateInput> {
  const result = contactCreateInputSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] ? String(issue.path[0]) : "_form";
    if (!errors[key]) {
      errors[key] = issue.message;
    }
  }
  return { success: false, errors };
}

export function sanitizeContactEnvelope(raw: unknown): ContactEnvelope | null {
  const result = contactEnvelopeSchema.safeParse(raw);
  if (result.success) {
    return result.data as ContactEnvelope;
  }
  return null;
}
