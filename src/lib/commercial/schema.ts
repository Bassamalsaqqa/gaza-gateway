import { z } from "zod";
import {
  CommercialCatalogError,
  type CommercialCatalog,
  type BookingPricingSnapshotV1,
} from "./types.ts";
const text = z.string().trim().min(1).max(500);
const label = z.object({ en: text, ar: text }).strict();
const id = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const cabin = z.enum(["economy", "premium", "business"]);
const fareId = z.enum(["essential", "classic", "flex"]);
const multiplier = z.number().finite().min(1).max(8);
const unique = <T>(items: T[]) => new Set(items).size === items.length;
export const fareProductSchema = z
  .object({
    id: fareId,
    name: label,
    multiplier,
    checkedBags: z.number().int().min(0).max(5),
    seatSelection: label,
    changes: label,
    refund: label,
    flexibility: label,
    highlight: z.boolean().default(false),
    active: z.boolean(),
    allowedCabins: z.array(cabin).min(1).refine(unique),
    order: z.number().int().min(0).max(1000),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.id === "essential" && f.multiplier !== 1)
      ctx.addIssue({ code: "custom", path: ["multiplier"], message: "Fixed anchor" });
  });
export const cabinPricingSchema = z
  .object({ id: cabin, multiplier })
  .strict()
  .superRefine((c, ctx) => {
    if (c.id === "economy" && c.multiplier !== 1)
      ctx.addIssue({ code: "custom", path: ["multiplier"], message: "Fixed anchor" });
  });
export const baggageSchema = z
  .object({
    cabinKg: z.number().int().min(1).max(20),
    cabinDims: text,
    checkedKg: z.number().int().min(1).max(40),
    extraBagPrice: z.number().finite().min(0).max(1000),
    note: label,
  })
  .strict();
export const catalogOptionSchema = z
  .object({ id, label, active: z.boolean(), order: z.number().int().min(0).max(1000) })
  .strict();
export const commercialCatalogSchema = z
  .object({
    fares: z.array(fareProductSchema).length(3),
    cabins: z.array(cabinPricingSchema).length(3),
    baggage: baggageSchema,
    meals: z.array(catalogOptionSchema).min(1).max(100),
    defaultMealId: id,
    assistance: z.array(catalogOptionSchema).max(100),
  })
  .strict()
  .superRefine((c, ctx) => {
    for (const key of ["fares", "cabins", "meals", "assistance"] as const)
      if (!unique(c[key].map((v) => v.id)))
        ctx.addIssue({ code: "custom", path: [key], message: "Duplicate identity" });
    for (const id of ["economy", "premium", "business"] as const)
      if (
        !c.cabins.some((v) => v.id === id) ||
        !c.fares.some((f) => f.active && f.allowedCabins.includes(id))
      )
        ctx.addIssue({ code: "custom", path: ["fares"], message: "Cabin needs an active fare" });
    if (!c.meals.some((m) => m.id === c.defaultMealId && m.active))
      ctx.addIssue({ code: "custom", path: ["defaultMealId"], message: "Default must be active" });
  });
export function parseCommercialCatalog(input: unknown): CommercialCatalog {
  const result = commercialCatalogSchema.safeParse(input);
  if (!result.success)
    throw new CommercialCatalogError(
      "invalid_catalog",
      Object.fromEntries(
        result.error.issues.map((i) => [i.path.join("."), "commercial.error.invalid_catalog"]),
      ),
    );
  return result.data;
}
export const commercialStorageSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    catalog: commercialCatalogSchema,
  })
  .strict();
export const bookingPricingSnapshotSchema = z
  .object({
    version: z.literal(1),
    catalogRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    basis: z.enum(["legacy", "catalog"]),
    fareId,
    fareMultiplier: multiplier,
    cabinId: cabin,
    cabinMultiplier: multiplier,
    checkedBags: z.number().int().min(0).max(5),
    checkedBagKg: z.number().int().min(1).max(40),
    cabinBagKg: z.number().int().min(1).max(20),
    cabinBagDims: text,
    extraBagPrice: z.number().finite().min(0).max(1000),
    taxRate: z.literal(0.14),
    seatPricing: z
      .object({
        policy: z.literal("legacy-row-v1"),
        standardSeatPrice: z.literal(0),
        extraLegroomPrice: z.literal(18),
        extraLegroomRows: z.array(z.number().int().min(1).max(100)).refine(unique),
      })
      .strict(),
  })
  .strict();
export function parsePricingSnapshot(input: unknown): BookingPricingSnapshotV1 | null {
  const result = bookingPricingSnapshotSchema.safeParse(input);
  return result.success ? result.data : null;
}
