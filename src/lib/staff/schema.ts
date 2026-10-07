/**
 * Gaza Gateway — Canonical Staff Zod Validation Schemas
 *
 * Enforces strict validation for staff records and the envelope storage schema.
 */

import { z } from "zod";

export const bilingualTextSchema = z.object({
  en: z.string().trim().min(1, "English text is required").max(100, "English text exceeds maximum 100 characters"),
  ar: z.string().trim().min(1, "Arabic text is required").max(100, "Arabic text exceeds maximum 100 characters"),
});

export const staffRoleSchema = z.enum(["admin", "editor", "viewer"], {
  errorMap: () => ({ message: "Role must be admin, editor, or viewer" }),
});

export const staffStatusSchema = z.enum(["active", "disabled"], {
  errorMap: () => ({ message: "Status must be active or disabled" }),
});

const isoTimestampSchema = z.string().refine(
  (val) => {
    const time = Date.parse(val);
    return !Number.isNaN(time) && Number.isFinite(time) && val.includes("T");
  },
  { message: "Must be a valid ISO timestamp" },
);

export const staffMemberSchema = z.object({
  id: z.string().trim().min(1, "ID is required").max(64),
  name: bilingualTextSchema,
  email: z
    .string()
    .trim()
    .min(3, "Email is required")
    .max(100, "Email exceeds maximum 100 characters")
    .email("Invalid email address")
    .transform((val) => val.toLowerCase()),
  role: staffRoleSchema,
  status: staffStatusSchema,
  title: bilingualTextSchema,
  createdAt: isoTimestampSchema,
  lastActiveAt: isoTimestampSchema.nullable(),
});

export const staffStorageSchema = z
  .object({
    schemaVersion: z.literal(1, {
      errorMap: () => ({ message: "Unsupported schemaVersion" }),
    }),
    revision: z
      .number()
      .int()
      .nonnegative()
      .refine(Number.isSafeInteger, { message: "Revision must be a safe integer" }),
    staff: z.array(staffMemberSchema),
  })
  .refine(
    (data) => {
      const ids = new Set<string>();
      const emails = new Set<string>();
      for (const s of data.staff) {
        if (ids.has(s.id)) return false;
        ids.add(s.id);
        const normEmail = s.email.trim().toLowerCase();
        if (emails.has(normEmail)) return false;
        emails.add(normEmail);
      }
      return true;
    },
    {
      message: "Staff directory contains duplicate staff IDs or email addresses",
      path: ["staff"],
    },
  );

export const createStaffInputSchema = z.object({
  name: bilingualTextSchema,
  email: z
    .string()
    .trim()
    .min(3, "Email is required")
    .max(100, "Email exceeds maximum 100 characters")
    .email("Invalid email address")
    .transform((val) => val.toLowerCase()),
  role: staffRoleSchema,
  title: bilingualTextSchema.optional(),
  status: staffStatusSchema.optional().default("active"),
});

export const updateStaffProfileSchema = z.object({
  name: bilingualTextSchema.optional(),
  title: bilingualTextSchema.optional(),
});
