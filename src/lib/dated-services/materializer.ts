/**
 * Gaza Gateway — Pure Dated-Service Materializer
 *
 * Deterministic projection of recurring Schedules onto concrete calendar dates.
 *
 * Purity Invariants:
 * - Pure input/output: zero React, Query, repository/provider, localStorage, or Admin imports.
 * - No implicit Network seeds or fallback; requires explicit authoritative Network input.
 * - Calendar weekday calculation is deterministic and host-independent (UTC calendar arithmetic).
 * - Exact Schedule identity: `svc1-<base64url>-<date>`.
 * - Route duration is strictly Network.blockMinutes (not wall-clock subtraction).
 * - Cancellation preserves the dated Flight record with status "Cancelled" and stable identity.
 * - Multi-output ordering is fully deterministic; no duplicates for one Schedule on the same date.
 */

import type { Flight } from "../data.ts";
import { aircraftNameToSeedId } from "../fleet/layout.ts";
import type {
  ScheduleExceptionCancelled,
  ScheduleExceptionTime,
  ScheduleExceptionAircraft,
  ScheduleExceptionExtra,
} from "../schedules/types.ts";
import {
  DatedServiceMaterializationError,
  type MaterializeScheduleOptions,
  type MaterializeSchedulesOptions,
} from "./types.ts";
import { datedServiceId, getUTCCalendarWeekday, isValidISODate } from "./identity.ts";
import {
  simulateServiceBasePrice,
  simulateServiceGate,
  simulateServiceSeatsLeft,
  simulateServiceStatus,
  simulateServiceTerminal,
} from "./simulation.ts";

/**
 * Materializes a single Schedule on a target calendar date.
 * Returns null if the service does not operate on that date (inactive, out of range, non-operating day with no extra).
 * Throws DatedServiceMaterializationError if required inputs are invalid or mismatched.
 */
export function materializeScheduleOnDate(options: MaterializeScheduleOptions): Flight | null {
  const { schedule, network, date, basePrice, now } = options;

  if (!Number.isFinite(basePrice) || basePrice < 0) {
    throw new DatedServiceMaterializationError(
      "invalid_price",
      "An explicit nonnegative route merchandising price is required.",
    );
  }

  if (!isValidISODate(date)) {
    throw new DatedServiceMaterializationError(
      "invalid_date",
      `Invalid ISO calendar date: ${date}`,
    );
  }

  if (
    !schedule ||
    typeof schedule.id !== "string" ||
    !schedule.destination ||
    !schedule.direction
  ) {
    throw new DatedServiceMaterializationError(
      "invalid_schedule",
      "Invalid schedule input provided to materializer.",
    );
  }

  if (!network) {
    throw new DatedServiceMaterializationError(
      "network_missing",
      `Missing required network route reference for destination '${schedule.destination}'.`,
    );
  }

  if (network.code !== schedule.destination) {
    throw new DatedServiceMaterializationError(
      "network_mismatch",
      `Network route code '${network.code}' does not match schedule destination '${schedule.destination}'.`,
    );
  }

  // Active status check: inactive Schedule or inactive Network suppresses projection
  if (!schedule.active || !network.active) {
    return null;
  }

  // Date range check: must fall within [from, until] inclusive
  if (date < schedule.from || date > schedule.until) {
    return null;
  }

  // Inspect exceptions for this date
  const dateExceptions = schedule.exceptions ?? [];

  // Operational effects (prose-only annotations without .effect have no operational power)
  const cancelledEx = dateExceptions.find(
    (e): e is ScheduleExceptionCancelled =>
      e.date === date && e.kind === "cancelled" && Boolean(e.effect),
  );
  const timeEx = dateExceptions.find(
    (e): e is ScheduleExceptionTime => e.date === date && e.kind === "time" && Boolean(e.effect),
  );
  const aircraftEx = dateExceptions.find(
    (e): e is ScheduleExceptionAircraft =>
      e.date === date && e.kind === "aircraft" && Boolean(e.effect),
  );
  const extraEx = dateExceptions.find(
    (e): e is ScheduleExceptionExtra => e.date === date && e.kind === "extra" && Boolean(e.effect),
  );

  // Operating day check
  const weekday = getUTCCalendarWeekday(date);
  const isRecurringWeekday = schedule.days.includes(weekday);

  // Normal existence: recurring weekday OR explicit operational extra flight
  if (!isRecurringWeekday && !extraEx) {
    return null;
  }

  // Generate canonical dated service ID
  const id = datedServiceId(schedule.id, date);

  // Determine effective times
  const effectiveDepartTime =
    timeEx?.effect?.departTime ?? extraEx?.effect?.departTime ?? schedule.departTime;
  const effectiveArriveTime =
    timeEx?.effect?.arriveTime ?? extraEx?.effect?.arriveTime ?? schedule.arriveTime;

  // Determine effective aircraft
  const effectiveAircraft =
    aircraftEx?.effect?.aircraft ?? extraEx?.effect?.aircraft ?? schedule.aircraft;
  const effectiveAircraftId =
    aircraftEx?.effect?.aircraftId ??
    extraEx?.effect?.aircraftId ??
    schedule.aircraftId ??
    aircraftNameToSeedId(schedule.aircraft);

  // Route endpoints
  const isOutbound = schedule.direction === "out";
  const originCode = isOutbound ? "GZA" : schedule.destination;
  const destinationCode = isOutbound ? schedule.destination : "GZA";

  // Operational status (explicit cancellation preserves flight record with status "Cancelled")
  const isCancelled = Boolean(cancelledEx?.effect?.cancelled);
  const status = simulateServiceStatus(id, date, isCancelled, now);

  // Simulated operational facts
  const gate = simulateServiceGate(id);
  const terminal = simulateServiceTerminal(id);
  const computedBasePrice = simulateServiceBasePrice(id, basePrice);
  const seatsLeft = simulateServiceSeatsLeft(id);

  return {
    id,
    scheduleId: schedule.id,
    number: schedule.number,
    originCode,
    destinationCode,
    date,
    departTime: effectiveDepartTime,
    arriveTime: effectiveArriveTime,
    durationMinutes: network.blockMinutes,
    aircraft: effectiveAircraft,
    aircraftId: effectiveAircraftId,
    status,
    gate,
    terminal,
    basePrice: computedBasePrice,
    seatsLeft,
  };
}

/**
 * Projects a collection of Schedules onto a target calendar date.
 * Deterministic ordering by departTime, flight number, and service ID.
 */
export function materializeSchedulesOnDate(options: MaterializeSchedulesOptions): Flight[] {
  const { schedules, networks, date, routePrices, defaultBasePrice, now } = options;

  const networkMap =
    networks instanceof Map ? networks : new Map(networks.map((n) => [n.code.toUpperCase(), n]));

  const seenIds = new Set<string>();
  const results: Flight[] = [];

  for (const schedule of schedules) {
    if (seenIds.has(schedule.id))
      throw new DatedServiceMaterializationError(
        "duplicate_schedule",
        "Duplicate Schedule identity.",
      );
    seenIds.add(schedule.id);
    const network = networkMap.get(schedule.destination.toUpperCase());

    let basePrice = defaultBasePrice;
    if (typeof routePrices === "function") {
      basePrice = routePrices(schedule.destination);
    } else if (routePrices && schedule.destination in routePrices) {
      basePrice = routePrices[schedule.destination] ?? defaultBasePrice;
    }

    const flight = materializeScheduleOnDate({
      schedule,
      network,
      date,
      basePrice: basePrice ?? NaN,
      now,
    });

    if (flight) {
      results.push(flight);
    }
  }

  return results.sort(
    (a, b) =>
      a.departTime.localeCompare(b.departTime) ||
      a.number.localeCompare(b.number) ||
      a.id.localeCompare(b.id),
  );
}
