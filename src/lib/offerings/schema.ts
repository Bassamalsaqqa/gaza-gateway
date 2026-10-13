import { z } from "zod";
import { aircraftIdSchema, aircraftLayoutSchema } from "../fleet/schema.ts";
import { NETWORK_CODES } from "../network/types.ts";
import { assertValidScheduleId, decodeDatedOfferingId, isValidISODate } from "./codec.ts";

const exactId = z.string().refine(value => { try { assertValidScheduleId(value); return true; } catch { return false; } });
const date = z.string().refine(isValidISODate);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$(?![\s\S])/);
const model = z.string().min(1).max(120);
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const offeringTimingFields = {
  originTimezone: z.string().min(1).max(80).optional(), destinationTimezone: z.string().min(1).max(80).optional(),
  departAt: z.string().datetime({offset:true}).optional(), arriveAt: z.string().datetime({offset:true}).optional(), arrivalDate: date.optional(),
};
const exceptionBase = { id: exactId, date, detail: z.string().max(500) };
const equipment = { aircraftId: aircraftIdSchema, aircraft: model };
const extra = z.object({ departTime: time.optional(), arriveTime: time.optional(), aircraftId: aircraftIdSchema.optional(), aircraft: model.optional() }).strict()
  .refine(value => Boolean(value.aircraftId) === Boolean(value.aircraft));
const exception = z.discriminatedUnion("kind", [
  z.object({ ...exceptionBase, kind: z.literal("cancelled"), effect: z.object({ cancelled: z.literal(true) }).strict().optional() }).strict(),
  z.object({ ...exceptionBase, kind: z.literal("time"), effect: z.object({ departTime: time, arriveTime: time }).strict().optional() }).strict(),
  z.object({ ...exceptionBase, kind: z.literal("aircraft"), effect: z.object(equipment).strict().optional() }).strict(),
  z.object({ ...exceptionBase, kind: z.literal("extra"), effect: extra.optional() }).strict(),
]);
export const scheduleWireSchema = z.object({
  id: exactId, number: z.string().regex(/^[A-Z]{2}\s?\d{1,4}$(?![\s\S])/), direction: z.enum(["out", "in"]), destination: z.enum(NETWORK_CODES),
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(values => new Set(values).size === values.length),
  departTime: time, arriveTime: time, aircraft: model, aircraftId: aircraftIdSchema.optional(), from: date, until: date, active: z.boolean(),
  exceptions: z.array(exception).max(100).refine(values => new Set(values.map(item => item.id)).size === values.length),
}).strict().refine(value => value.from <= value.until);
export const schedulesWireSchema = z.array(scheduleWireSchema).refine(values => new Set(values.map(item => item.id)).size === values.length);
export const scheduleReceiptSchema = z.object({ schedule: scheduleWireSchema, changed: z.boolean(), revision }).strict();
// Close the physical layout before the established geometry validator is applied.
export const offeringLayoutSchema = z.object({ aircraftId: aircraftIdSchema, rows: z.number(), letters: z.array(z.string()), aisleAfter: z.number(),
  zones: z.array(z.object({ id: z.enum(["business", "premium", "economy"]), firstRow: z.number(), lastRow: z.number() }).strict()),
  extraLegroomRows: z.array(z.number()), unavailable: z.array(z.string()),
}).strict().pipe(aircraftLayoutSchema);
export const offeringWireSchema = z.object({
  id: z.string(), scheduleId: exactId, date, number: z.string().min(1).max(12), direction: z.enum(["out", "in"]),
  originCode: z.enum(["GZA", ...NETWORK_CODES]), destinationCode: z.enum(["GZA", ...NETWORK_CODES]),
  departTime: time, arriveTime: time, durationMinutes: z.number().int().min(20).max(1440),
  aircraftId: aircraftIdSchema, aircraft: model, layout: offeringLayoutSchema,
  revisions: z.object({ fleet: revision, network: revision, schedules: revision }).strict(),
  classification: z.literal("commemorative"), priceMinor: z.literal(0),
  ...offeringTimingFields,
}).strict().refine(value => {
  const parsed = decodeDatedOfferingId(value.id);
  return parsed?.scheduleId === value.scheduleId && parsed.date === value.date && value.layout.aircraftId === value.aircraftId
    && (value.direction === "out" ? value.originCode === "GZA" && value.destinationCode !== "GZA" : value.destinationCode === "GZA" && value.originCode !== "GZA")
    && (value.departAt === undefined && value.arriveAt === undefined && value.arrivalDate === undefined && value.originTimezone === undefined && value.destinationTimezone === undefined
      || Boolean(value.departAt && value.arriveAt && value.arrivalDate && value.originTimezone && value.destinationTimezone)
        && Date.parse(value.arriveAt!) - Date.parse(value.departAt!) === value.durationMinutes * 60000
        && value.departAt!.slice(0,10) === value.date && value.departAt!.slice(11,16) === value.departTime
        && value.arriveAt!.slice(0,10) === value.arrivalDate && value.arriveAt!.slice(11,16) === value.arriveTime);
});
export const offeringsWireSchema = z.array(offeringWireSchema).refine(values => new Set(values.map(item => item.id)).size === values.length);
export type DatedOffering = z.infer<typeof offeringWireSchema>;
