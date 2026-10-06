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

export function getUTCCalendarWeekday(dateStr: string): number {
  const dt = new Date(`${dateStr}T00:00:00Z`);
  return dt.getUTCDay();
}

const cancelledEffect = z.object({ cancelled: z.literal(true) }).strict();
const timeEffect = z.object({ departTime: time, arriveTime: time }).strict();
const aircraftEffect = z
  .object({
    aircraftId: z.string().trim().min(1).max(64),
    aircraft: z.string().trim().min(1).max(120),
  })
  .strict();
const extraEffect = z
  .object({
    departTime: time.optional(),
    arriveTime: time.optional(),
    aircraftId: z.string().trim().min(1).max(64).optional(),
    aircraft: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (Boolean(e.aircraftId) !== Boolean(e.aircraft))
      ctx.addIssue({
        code: "custom",
        path: [e.aircraftId ? "aircraft" : "aircraftId"],
        message: "Equipment identity and model must be supplied together.",
      });
  });

export const exceptionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      id,
      date: isoDate,
      kind: z.literal("cancelled"),
      detail: z.string().trim().max(500),
      effect: cancelledEffect.optional(),
    })
    .strict(),
  z
    .object({
      id,
      date: isoDate,
      kind: z.literal("time"),
      detail: z.string().trim().max(500),
      effect: timeEffect.optional(),
    })
    .strict(),
  z
    .object({
      id,
      date: isoDate,
      kind: z.literal("aircraft"),
      detail: z.string().trim().max(500),
      effect: aircraftEffect.optional(),
    })
    .strict(),
  z
    .object({
      id,
      date: isoDate,
      kind: z.literal("extra"),
      detail: z.string().trim().max(500),
      effect: extraEffect.optional(),
    })
    .strict(),
]);

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
      .array(exceptionSchema)
      .max(100)
      .refine((items) => new Set(items.map((item) => item.id)).size === items.length, {
        message: "Exception IDs must be unique",
      }),
  })
  .strict()
  .superRefine((schedule, ctx) => {
    if (schedule.from > schedule.until) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Start date must be on or before end date.",
        path: ["until"],
      });
    }

    const operationalByDate = new Map<string, typeof schedule.exceptions>();

    schedule.exceptions.forEach((exc, idx) => {
      if (!exc.effect) return;
      // Date range check: exception date must fall within [from, until]
      if (exc.date < schedule.from || exc.date > schedule.until) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Exception date must fall within the schedule active date range.",
          path: ["exceptions", idx, "date"],
        });
      }

      // Operational effect operating day rules
      if (exc.effect) {
        const weekday = getUTCCalendarWeekday(exc.date);
        const isRecurringDay = schedule.days.includes(weekday);

        if (exc.kind === "extra") {
          if (isRecurringDay) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Extra flight exceptions can only be scheduled on non-operating weekdays.",
              path: ["exceptions", idx, "date"],
            });
          }
        } else {
          if (!isRecurringDay) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Operational ${exc.kind} adjustments can only be applied on scheduled operating days.`,
              path: ["exceptions", idx, "date"],
            });
          }
        }

        const existingOnDate = operationalByDate.get(exc.date) ?? [];
        existingOnDate.push(exc);
        operationalByDate.set(exc.date, existingOnDate);
      }
    });

    // Check coexistence per date
    for (const [date, ops] of operationalByDate.entries()) {
      if (ops.length <= 1) continue;

      const hasCancelled = ops.some((e) => e.kind === "cancelled");
      const hasExtra = ops.some((e) => e.kind === "extra");

      if (hasCancelled || hasExtra) {
        ops.forEach((e) => {
          const idx = schedule.exceptions.indexOf(e);
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Operational ${hasCancelled ? "cancellation" : "extra"} cannot coexist with other operational effects on date ${date}.`,
            path: ["exceptions", idx, "kind"],
          });
        });
        continue;
      }

      const timeCount = ops.filter((e) => e.kind === "time").length;
      const aircraftCount = ops.filter((e) => e.kind === "aircraft").length;

      if (timeCount > 1 || aircraftCount > 1 || ops.length > 2) {
        ops.forEach((e) => {
          const idx = schedule.exceptions.indexOf(e);
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `At most one time adjustment and one aircraft adjustment may coexist on date ${date}.`,
            path: ["exceptions", idx, "kind"],
          });
        });
      }
    }
  });

export class ScheduleValidationError extends Error {
  public readonly issues: z.ZodIssue[];

  constructor(issuesOrMessage: z.ZodIssue[] | string, path?: (string | number)[]) {
    if (typeof issuesOrMessage === "string") {
      super(issuesOrMessage);
      this.issues = [
        {
          code: z.ZodIssueCode.custom,
          message: issuesOrMessage,
          path: path ?? ["aircraftId"],
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
