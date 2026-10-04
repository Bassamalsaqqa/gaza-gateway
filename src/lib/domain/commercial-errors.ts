import { CommercialCatalogError, catalogErrorKey } from "../commercial/types.ts";
import { BookingCreationError } from "./booking.ts";
import { BookingInputError } from "./booking-validation.ts";
import { SeatValidationError } from "./seat-validation.ts";

/** Only explicit domain validation carries field identity. Storage/general errors carry none. */
export function commercialFieldErrors(error: unknown): Record<string, string> {
  if (error instanceof CommercialCatalogError) return error.fields;
  if (error instanceof BookingInputError) return error.fields;
  if (error instanceof SeatValidationError)
    return Object.fromEntries(error.seatKeys.map((key) => [key, commercialErrorKey(error)]));
  return {};
}

/** Presentation mapping only: expected legacy command errors never leak English in AR. */
export function commercialErrorKey(error: unknown): string {
  if (error instanceof CommercialCatalogError) return catalogErrorKey(error);
  if (error instanceof BookingInputError) return Object.values(error.fields)[0] ?? "a6.err.retry";
  if (error instanceof BookingCreationError) {
    const reason = error.reason;
    if (reason === "invalid_seats") return "a6.err.seats";
    if (reason === "invalid_contact") return "a6.err.contact";
    if (reason === "invalid_extras") return "a6.err.extras";
    if (reason === "invalid_infant" || reason === "invalid_passengers") return "a6.err.passengers";
    if (reason === "insufficient_seats" || reason === "sold_out") return "a6.err.capacity";
    return "a6.err.flight";
  }
  if (!(error instanceof Error)) return "a6.err.retry";
  if (error.name === "StorageCommitError") return "a6.err.storage";
  const text = error.message.toLowerCase();
  if (text.includes("not found")) return "a6.err.missing";
  if (text.includes("cancelled")) return "a6.err.cancelled";
  if (
    text.includes("already checked") ||
    text.includes("already_checked") ||
    text.includes("immutable") ||
    text.includes("checked-in")
  )
    return "a6.err.immutable";
  if (text.includes("seat")) return "a6.err.seats";
  if (text.includes("too early") || text.includes("too_early") || text.includes("not_open"))
    return "a6.err.early";
  if (text.includes("closed") || text.includes("window")) return "a6.err.closed";
  if (text.includes("flight")) return "a6.err.flight";
  if (text.includes("document") || text.includes("passenger") || text.includes("infant"))
    return "a6.err.passengers";
  if (text.includes("email") || text.includes("contact")) return "a6.err.contact";
  return "a6.err.retry";
}
