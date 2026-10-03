import type { Flight } from "../../src/lib/data.ts";
import type { BookingCreateInput } from "../../src/lib/domain/booking.ts";
/** Upgrade old test writers to the complete creation contract; legacy read fixtures stay untouched. */
export function canonicalCreateFixture(value: Record<string, unknown>): BookingCreateInput {
  const passengers = (value["passengers"] as Record<string, unknown>[]).map(
    (p: Record<string, unknown>) => {
      const parts = String(p["name"] ?? "").split(" ");
      return {
        ...p,
        firstName: p["firstName"] ?? parts[0],
        lastName: p["lastName"] ?? (parts.slice(1).join(" ") || "Example"),
        dob: p["dob"] ?? "1980-01-01",
        nationality: p["nationality"] ?? "PS",
        document: p["document"] ?? "",
      };
    },
  );
  const old = (value["criteria"] ?? {}) as Record<string, unknown>;
  return {
    ...value,
    passengers,
    criteria: {
      ...old,
      tripType:
        old["tripType"] === "round-trip" || old["tripType"] === "round" ? "round" : "oneway",
      origin: old["origin"] ?? old["originCode"] ?? (value["outbound"] as Flight).originCode,
      destination:
        old["destination"] ??
        old["destinationCode"] ??
        (value["outbound"] as Flight).destinationCode,
      departDate: old["departDate"] ?? (value["outbound"] as Flight).date,
      returnDate: old["returnDate"] ?? (value["inbound"] as Flight | undefined)?.date ?? "",
      adults:
        old["adults"] ?? passengers.filter((p: { type: unknown }) => p.type === "adult").length,
      children:
        old["children"] ?? passengers.filter((p: { type: unknown }) => p.type === "child").length,
      infants:
        old["infants"] ?? passengers.filter((p: { type: unknown }) => p.type === "infant").length,
      cabin: old["cabin"] ?? value["cabin"] ?? "economy",
    },
    fareId: value["fareId"] ?? value["fareFamily"] ?? "essential",
    seats: value["seats"] ?? {},
    extras: value["extras"] ?? { pax: [] },
  } as BookingCreateInput;
}
