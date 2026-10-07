import type { ActivityEvent } from "../activity/types.ts";
import type { CustomerSummary } from "./types.ts";

/** Bounded canonical audit history, never inferred passenger activity. */
export function customerActivityEvents(
  events: readonly ActivityEvent[],
  customer: Pick<CustomerSummary, "id" | "type" | "email" | "refs">,
): ActivityEvent[] {
  const refs = new Set(customer.refs);
  const bookingTargets = new Set(["booking", "booking_contact", "booking_seats", "booking_extras", "check_in", "guest_contact"]);
  return events.filter((event) =>
    (bookingTargets.has(event.targetType) && refs.has(event.targetId)) ||
    (customer.type === "account" && ["customer", "account"].includes(event.targetType) &&
      (event.targetId === customer.id || event.targetId === customer.email))
  ).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || b.id.localeCompare(a.id));
}
