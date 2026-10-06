import { seedSchedules } from "../../src/lib/schedules/seed.ts";
import { seedNetworkEnvelope } from "../../src/lib/network/seed.ts";
import { legacyDestinationPresentationByCode } from "../../src/lib/destination-reference.ts";
import { materializeSchedulesOnDate } from "../../src/lib/dated-services/materializer.ts";

/** New-sale fixtures project the real opening Schedule authority. Historical fixtures stay legacy. */
export function currentFlightsOn(date: string, now?: Date | string | number) {
  return materializeSchedulesOnDate({
    schedules: seedSchedules(), networks: seedNetworkEnvelope().destinations, date, now,
    routePrices: (code) => legacyDestinationPresentationByCode(code)?.priceFrom ?? NaN,
  });
}
export function currentDeparturesOn(date: string, now?: Date | string | number) {
  return currentFlightsOn(date, now).filter((f) => f.originCode === "GZA");
}
export function currentArrivalsOn(date: string, now?: Date | string | number) {
  return currentFlightsOn(date, now).filter((f) => f.destinationCode === "GZA");
}
