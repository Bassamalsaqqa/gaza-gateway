/**
 * Gaza Gateway — Booking Draft Selection Reconciliation
 *
 * Reconciles stored flight snapshots against authoritative effective flight instances.
 * Implements prefix-matching seat key deletion, operational display refreshing,
 * surviving leg preservation, and typed failure reason attribution.
 */

import type { Flight } from "../data.ts";
import { getSeatRequiredPaxCount } from "../booking-rules.ts";
import { getFlightBookability } from "../booking-rules.ts";
import type {
  Draft,
  DraftReconciliationResult,
  LegReconciliationResult,
  LegReconciliationStatus,
} from "./types.ts";

function haveFlightDisplayFieldsChanged(stored: Flight, effective: Flight): boolean {
  return (
    stored.status !== effective.status ||
    stored.gate !== effective.gate ||
    stored.terminal !== effective.terminal ||
    stored.aircraft !== effective.aircraft ||
    stored.departTime !== effective.departTime ||
    stored.arriveTime !== effective.arriveTime ||
    stored.seatsLeft !== effective.seatsLeft ||
    stored.revisedDepart !== effective.revisedDepart ||
    stored.note !== effective.note
  );
}

/**
 * Evaluates a single stored flight leg against an effective flight instance.
 */
function reconcileLeg(
  leg: "out" | "in",
  storedFlight: Flight | null,
  effectiveFlight: Flight | null | undefined,
  expectedOrigin: string,
  expectedDest: string,
  expectedDate: string,
  seatPaxCount: number,
  options?: { now?: Date | string | number },
): LegReconciliationResult {
  if (!storedFlight) {
    return {
      leg,
      status: "unchanged",
      originalFlight: null,
      effectiveFlight: null,
      seatsCleared: [],
    };
  }

  // 1. Missing flight in operational schedule
  if (!effectiveFlight) {
    return {
      leg,
      status: "missing",
      originalFlight: storedFlight,
      effectiveFlight: null,
      reason: "flight_missing",
      seatsCleared: [],
    };
  }

  // 2. Route mismatch
  if (
    (expectedOrigin && effectiveFlight.originCode.toUpperCase() !== expectedOrigin.toUpperCase()) ||
    (expectedDest && effectiveFlight.destinationCode.toUpperCase() !== expectedDest.toUpperCase())
  ) {
    return {
      leg,
      status: "route_mismatch",
      originalFlight: storedFlight,
      effectiveFlight,
      reason: "route_mismatch",
      seatsCleared: [],
    };
  }

  // 3. Date mismatch
  if (expectedDate && effectiveFlight.date !== expectedDate) {
    return {
      leg,
      status: "date_mismatch",
      originalFlight: storedFlight,
      effectiveFlight,
      reason: "date_mismatch",
      seatsCleared: [],
    };
  }

  // 4. Operational bookability (cancelled, departed, landed, boarding, past, sold_out, insufficient_seats)
  const bookability = getFlightBookability(effectiveFlight, {
    paxCount: seatPaxCount,
    now: options?.now,
  });

  if (!bookability.bookable) {
    return {
      leg,
      status: "unbookable",
      originalFlight: storedFlight,
      effectiveFlight,
      reason: bookability.reason ?? "cancelled",
      seatsCleared: [],
    };
  }

  // 5. Valid flight: check if operational display fields need refreshing
  if (haveFlightDisplayFieldsChanged(storedFlight, effectiveFlight)) {
    return {
      leg,
      status: "refreshed",
      originalFlight: storedFlight,
      effectiveFlight,
      seatsCleared: [],
    };
  }

  return {
    leg,
    status: "unchanged",
    originalFlight: storedFlight,
    effectiveFlight,
    seatsCleared: [],
  };
}

/**
 * Reconciles the complete booking draft against provided effective flight instances.
 *
 * If a leg is invalidated (unbookable, missing, or criteria mismatch):
 * - Clears ONLY that leg (`outbound = null` or `inbound = null`).
 * - Clears ONLY prefix-matching seat keys (`out-*` or `in-*`) via real key iteration.
 * - Preserves surviving leg, passenger form data, contact info, extras, and fare tier.
 *
 * If a leg is valid but has updated operational display info (gate, delay status, aircraft):
 * - Refreshes the stored snapshot to the latest effective flight data.
 */
export type ReconcileDraftInputOptions = {
  outboundEffective?: Flight | null | undefined;
  inboundEffective?: Flight | null | undefined;
  now?: Date | string | number | undefined;
};

export function reconcileDraft(
  draft: Draft,
  effectiveOutboundOrOptions?: Flight | null | ReconcileDraftInputOptions,
  effectiveInbound?: Flight | null,
  options?: { now?: Date | string | number },
): DraftReconciliationResult {
  let realEffectiveOut: Flight | null | undefined;
  let realEffectiveIn: Flight | null | undefined;
  let realOptions = options;

  if (
    effectiveOutboundOrOptions &&
    typeof effectiveOutboundOrOptions === "object" &&
    !("id" in effectiveOutboundOrOptions)
  ) {
    const opts = effectiveOutboundOrOptions as ReconcileDraftInputOptions;
    realEffectiveOut = opts.outboundEffective;
    realEffectiveIn = opts.inboundEffective;
    realOptions = opts.now !== undefined ? { now: opts.now } : options;
  } else {
    realEffectiveOut = effectiveOutboundOrOptions as Flight | null | undefined;
    realEffectiveIn = effectiveInbound;
  }

  const seatPaxCount = getSeatRequiredPaxCount(draft.passengers);

  const outResult = reconcileLeg(
    "out",
    draft.outbound,
    realEffectiveOut,
    draft.criteria.origin,
    draft.criteria.destination,
    draft.criteria.departDate,
    seatPaxCount,
    realOptions,
  );

  const inResult =
    draft.criteria.tripType === "round"
      ? reconcileLeg(
          "in",
          draft.inbound,
          realEffectiveIn,
          draft.criteria.destination,
          draft.criteria.origin,
          draft.criteria.returnDate,
          seatPaxCount,
          realOptions,
        )
      : undefined;

  let changed = false;
  const nextSeats = { ...draft.seats };
  let nextOutbound = draft.outbound;
  let nextInbound = draft.inbound;
  const invalidatedLegs: ("out" | "in")[] = [];

  // Outbound reconciliation resolution
  if (outResult.status === "unbookable" || outResult.status === "missing" || outResult.status === "route_mismatch" || outResult.status === "date_mismatch") {
    invalidatedLegs.push("out");
    nextOutbound = null;
    changed = true;
    // Iterate keys and delete "out-*"
    const cleared: string[] = [];
    for (const key of Object.keys(nextSeats)) {
      if (key.startsWith("out-")) {
        delete nextSeats[key];
        cleared.push(key);
      }
    }
    outResult.seatsCleared = cleared;
  } else if (outResult.status === "refreshed" && outResult.effectiveFlight) {
    nextOutbound = outResult.effectiveFlight;
    changed = true;
  }

  // Inbound reconciliation resolution
  if (inResult) {
    if (inResult.status === "unbookable" || inResult.status === "missing" || inResult.status === "route_mismatch" || inResult.status === "date_mismatch") {
      invalidatedLegs.push("in");
      nextInbound = null;
      changed = true;
      // Iterate keys and delete "in-*"
      const cleared: string[] = [];
      for (const key of Object.keys(nextSeats)) {
        if (key.startsWith("in-")) {
          delete nextSeats[key];
          cleared.push(key);
        }
      }
      inResult.seatsCleared = cleared;
    } else if (inResult.status === "refreshed" && inResult.effectiveFlight) {
      nextInbound = inResult.effectiveFlight;
      changed = true;
    }
  }

  const reconciledDraft: Draft = changed
    ? {
        ...draft,
        outbound: nextOutbound,
        inbound: nextInbound,
        seats: nextSeats,
      }
    : draft;

  return {
    reconciledDraft,
    changed,
    outbound: outResult,
    inbound: inResult,
    invalidatedLegs,
  };
}
