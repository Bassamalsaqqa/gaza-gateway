import { z } from "zod";
import type { Schedule } from "./types.ts";

const id = z.string().trim().min(1).max(160);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const exception = z
  .object({
    id,
    date: isoDate,
    kind: z.enum(["cancelled", "time", "aircraft", "extra"]),
    detail: z.string().trim().max(500),
  })
  .strict();
export const scheduleSchema = z
  .object({
    id,
    number: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}\s?\d{1,4}$/),
    direction: z.enum(["out", "in"]),
    destination: z.string().regex(/^[A-Z]{3}$/),
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((days) => new Set(days).size === days.length)
      .transform((days) => [...days].sort((a, b) => a - b)),
    departTime: time,
    arriveTime: time,
    aircraft: z.string().trim().min(1).max(120),
    aircraftId: z.string().trim().min(1).max(64).optional(),
    from: isoDate,
    until: isoDate,
    active: z.boolean(),
    exceptions: z
      .array(exception)
      .max(100)
      .refine((items) => new Set(items.map((item) => item.id)).size === items.length),
  })
  .strict()
  .refine((schedule) => schedule.from <= schedule.until, { path: ["until"] });
export class ScheduleValidationError extends Error {
  public readonly issues: z.ZodIssue[];
  constructor(issuesOrMessage: z.ZodIssue[] | string) {
    if (typeof issuesOrMessage === "string") {
      super(issuesOrMessage);
      this.issues = [
        {
          code: z.ZodIssueCode.custom,
          message: issuesOrMessage,
          path: ["aircraftId"],
        },
      ];
    } else {
      super("Invalid schedule planning configuration.");
      this.issues = issuesOrMessage;
    }
    this.name = "ScheduleValidationError";
  }
}
export function parseSchedule(input: unknown): Schedule {
  const result = scheduleSchema.safeParse(input);
  if (!result.success) throw new ScheduleValidationError(result.error.issues);
  return result.data;
}
export function validateSchedule(input: unknown): void {
  parseSchedule(input);
}
export function validateScheduleInput(input: unknown): void {
  parseSchedule(input);
}
/** Called once when opening a new draft, never during rendering or retry. */
export function newScheduleId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "sch-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
}
