/**
 * Gaza Gateway — Canonical Activity Validation & Schemas (Phase 6C)
 *
 * Enforces strict schemas and boundaries on activity events:
 * - Safe bounded actor snapshot
 * - Allowlisted modules and actions
 * - Bounded metadata: reject unbounded objects, arrays, nested documents, or secrets
 * - Rejection of malformed/corrupted envelope shapes
 */

import { z } from "zod";
import type { ActivityEnvelopeV1 } from "./types.ts";

export const activityActorSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.object({
    en: z.string().min(1).max(100),
    ar: z.string().min(1).max(100),
  }),
  email: z.string().email().max(100),
  role: z.enum(["admin", "editor", "viewer"]),
});

export const activityModuleSchema = z.enum([
  "bookings",
  "flights",
  "schedules",
  "network",
  "fleet",
  "commercial",
  "inbox",
  "staff",
  "session",
]);

export const activityActionSchema = z.enum([
  "created",
  "updated",
  "cancelled",
  "checked_in",
  "undo_check_in",
  "assigned",
  "status_changed",
  "role_changed",
  "signin",
  "cleared",
]);

const SENSITIVE_METADATA_REGEX =
  /password|passphrase|secret|token|passport|document|documentnumber|messagebody|credential|nationalid|creditcard|cvv/i;

export const ALLOWED_METADATA_KEYS = new Set([
  "ref",
  "seat",
  "seats",
  "email",
  "role",
  "status",
  "name",
  "flightNumber",
  "flightId",
  "passengers",
  "paxCount",
  "total",
  "leg",
  "paxIndex",
  "ticketId",
  "assigneeId",
  "model",
  "registration",
  "active",
  "aircraftId",
  "rows",
  "capacity",
  "number",
  "destination",
  "direction",
  "gate",
  "terminal",
  "routeId",
  "scheduleId",
  "action",
  "field",
  "value",
  "contactEmail",
  "contactPhone",
  "phone",
  "attachedRef",
  "accountEmail",
  "bookingRef",
  "category",
  "summary",
  "reason",
  "origin",
  "target",
  "code",
  "id",
  "key",
  "count",
]);

// Bounded primitive metadata values only (no nested objects or sensitive structures)
export const activityMetadataValueSchema = z.union([
  z.string().max(1000),
  z.number().refine(Number.isFinite, { message: "Number must be finite" }),
  z.boolean(),
]);

export const activityMetadataSchema = z
  .record(
    z
      .string()
      .max(50)
      .refine(
        (key) => !SENSITIVE_METADATA_REGEX.test(key) && ALLOWED_METADATA_KEYS.has(key),
        { message: "Metadata key is disallowed or sensitive" },
      ),
    activityMetadataValueSchema,
  )
  .refine((obj) => Object.keys(obj).length <= 20, {
    message: "Activity metadata exceeds maximum allowed field count of 20",
  })
  .optional();

const ISO_INSTANT_REGEX =
  /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)$/i;

export function isValidIsoInstant(val: string): boolean {
  if (typeof val !== "string") return false;
  const match = ISO_INSTANT_REGEX.exec(val);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return false;
  }
  const time = Date.parse(val);
  return !Number.isNaN(time) && Number.isFinite(time);
}

export const isoTimestampSchema = z.string().refine(
  (val) => isValidIsoInstant(val),
  { message: "Must be a valid ISO instant with explicit timezone and valid calendar date" },
);

export const activityEventSchema = z.object({
  id: z.string().min(1).max(50),
  timestamp: isoTimestampSchema,
  actor: activityActorSchema,
  module: activityModuleSchema,
  action: activityActionSchema,
  targetType: z.string().min(1).max(50),
  targetId: z.string().min(1).max(1000),
  descriptionKey: z.string().max(100).optional(),
  before: z.string().max(500).nullable().optional(),
  after: z.string().max(500).nullable().optional(),
  metadata: activityMetadataSchema,
});

export const activityEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z
      .number()
      .int()
      .nonnegative()
      .refine(Number.isSafeInteger, { message: "Revision must be a safe integer" }),
    events: z.array(activityEventSchema),
  })
  .refine(
    (data) => {
      const ids = new Set<string>();
      for (const e of data.events) {
        if (ids.has(e.id)) return false;
        ids.add(e.id);
      }
      return true;
    },
    {
      message: "Activity events contain duplicate IDs",
      path: ["events"],
    },
  );

export function parseActivityEnvelope(raw: unknown): ActivityEnvelopeV1 | null {
  const result = activityEnvelopeSchema.safeParse(raw);
  if (!result.success) {
    return null;
  }
  return result.data as ActivityEnvelopeV1;
}

export function validateCreateActivityInput(raw: unknown) {
  const createSchema = z.object({
    actor: activityActorSchema,
    module: activityModuleSchema,
    action: activityActionSchema,
    targetType: z.string().min(1).max(50),
    targetId: z.string().min(1).max(1000),
    descriptionKey: z.string().max(100).optional(),
    before: z.string().max(500).nullable().optional(),
    after: z.string().max(500).nullable().optional(),
    metadata: activityMetadataSchema,
    timestamp: isoTimestampSchema.optional(),
  });
  return createSchema.parse(raw);
}
