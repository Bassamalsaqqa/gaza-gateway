import { z } from "zod";
import { seedCommercialCatalog } from "../commercial/seed.ts";
import { validateServiceSelections } from "../commercial/pricing.ts";
import { CommercialCatalogError, type CommercialCatalog } from "../commercial/types.ts";
import { cabins, todayISO } from "../data.ts";
import { emptyPaxExtras, type Extras, type Passenger, type Contact } from "../booking-draft.ts";
import { BookingCreationError, type BookingCreateInput } from "./booking.ts";
import { normalizeEmailIdentity } from "../passenger/domain.ts";

export function isISOCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export class BookingInputError extends BookingCreationError {
  public readonly fields: Record<string, string>;
  constructor(
    reason: ConstructorParameters<typeof BookingCreationError>[0],
    fields: Record<string, string>,
  ) {
    super(reason, "Invalid booking input.");
    this.fields = fields;
  }
}

const passengerSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["adult", "child", "infant"]),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  dob: z
    .string()
    .refine(isISOCalendarDate)
    .refine((v) => v <= todayISO()),
  nationality: z.string().trim().min(1).max(120),
  document: z.string().trim().max(80),
  withAdult: z.number().int().nonnegative().optional(),
});
const contactSchema = z.object({
  email: z.string().trim().email().max(254).transform(normalizeEmailIdentity),
  phone: z.string().trim().max(50),
});

export function validateBookingContact(input: unknown): Contact {
  const result = contactSchema.safeParse(input);
  if (!result.success)
    throw new BookingInputError(
      "invalid_contact",
      Object.fromEntries(result.error.issues.map((i) => [String(i.path[0]), "a6.err.contact"])),
    );
  return result.data;
}

export function validateBookingParty(input: unknown): Passenger[] {
  const result = z.array(passengerSchema).min(1).max(20).safeParse(input);
  if (!result.success) {
    const fields: Record<string, string> = {};
    const suffix: Record<string, string> = {
      firstName: "fn",
      lastName: "ln",
      dob: "dob",
      nationality: "nat",
      document: "doc",
      type: "type",
      withAdult: "adult",
    };
    for (const issue of result.error.issues)
      fields[`pax-${issue.path[0]}-${suffix[String(issue.path[1])] ?? "fn"}`] =
        issue.path[1] === "dob" ? "a6.err.dob" : "a6.err.passengers";
    throw new BookingInputError("invalid_passengers", fields);
  }
  const passengers = result.data;
  const adults = passengers.filter((p) => p.type === "adult").length;
  if (!adults)
    throw new BookingInputError("invalid_passengers", { "pax-0-type": "a6.err.passengers" });
  const infants = passengers.filter((p) => p.type === "infant");
  const linked = new Set<number>();
  if (infants.length > adults)
    throw new BookingInputError("invalid_infant", { "pax-0-type": "a6.err.infant" });
  passengers.forEach((p, i) => {
    if (p.type !== "infant") return;
    if (
      p.withAdult === undefined ||
      passengers[p.withAdult]?.type !== "adult" ||
      linked.has(p.withAdult)
    )
      throw new BookingInputError("invalid_infant", { [`pax-${i}-adult`]: "a6.err.infant" });
    linked.add(p.withAdult);
  });
  return passengers;
}

/** Missing trailing Extras entries mean no added services; surplus entries are rejected. */
export function validateBookingExtras(input: unknown, passengerCount: number, catalog: CommercialCatalog = seedCommercialCatalog(), previous?: Extras): Extras {
  const schema = z
    .object({
      pax: z.array(
        z
          .object({
            extraBags: z.number().int().min(0).max(5),
            meal: z.string().min(1).max(100),
            assistance: z
              .array(z.string().min(1).max(100))
              .refine((ids) => new Set(ids).size === ids.length),
          })
          .strict(),
      ),
    })
    .strict();
  const result = schema.safeParse(input);
  if (!result.success || result.data.pax.length > passengerCount)
    throw new BookingInputError("invalid_extras", { extras: "a6.err.extras" });
  const normalized = {
    pax: Array.from(
      { length: passengerCount },
      (_, index) => result.data.pax[index] ?? emptyPaxExtras(catalog.defaultMealId),
    ),
  };
  validateServiceSelections(normalized, catalog, previous);
  return normalized;
}

export function validateCreationComposition(
  data: BookingCreateInput,
  passengers: Passenger[],
): void {
  const criteria = data.criteria;
  if (
    !criteria ||
    !["oneway", "round"].includes(criteria.tripType) ||
    !cabins.some((cabin) => cabin.id === criteria.cabin) ||
    !isISOCalendarDate(criteria.departDate) ||
    (criteria.tripType === "round"
      ? !isISOCalendarDate(criteria.returnDate) ||
        criteria.returnDate < criteria.departDate ||
        !data.inbound
      : Boolean(data.inbound) || Boolean(criteria.returnDate)) ||
    !/^[A-Z]{3}$/.test(criteria.origin) ||
    !/^[A-Z]{3}$/.test(criteria.destination) ||
    criteria.origin === criteria.destination
  )
    throw new BookingInputError("invalid_passengers", { criteria: "a6.err.criteria" });
  for (const [key, type] of [
    ["adults", "adult"],
    ["children", "child"],
    ["infants", "infant"],
  ] as const) {
    if (
      !Number.isInteger(criteria[key]) ||
      criteria[key] !== passengers.filter((p) => p.type === type).length
    )
      throw new BookingInputError("invalid_passengers", { criteria: "a6.err.criteria" });
  }
  if (!["essential", "classic", "flex"].includes(data.fareId))
    throw new CommercialCatalogError("fare_unavailable", { fare: "commercial.error.fare_unavailable" });
  if (data.channel !== undefined && data.channel !== "web" && data.channel !== "desk")
    throw new BookingInputError("invalid_passengers", { channel: "a6.err.criteria" });
}
