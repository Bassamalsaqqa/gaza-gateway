import { isDeepStrictEqual } from "node:util";
import { INTEGRITY_CONTRACT as C } from "./backend-integrity-policy.mjs";
export function validateIntegrityManifest(value) {
  return {
    valid: isDeepStrictEqual(value, C),
    errors: isDeepStrictEqual(value, C)
      ? []
      : ["Inventory/payment contract differs from approved constraints"],
  };
}
const ordered = (ids) =>
  [...new Set(ids)].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
export function inventoryLockOrder(ids) {
  return ordered(ids);
}
const live = (h, now) => ["active", "attached"].includes(h.state) && h.expiresAt > now;
function commitments(state, id, now) {
  return (
    state.holds
      .filter((h) => live(h, now) && h.serviceIds.includes(id))
      .reduce((n, h) => n + h.seatCount, 0) +
    state.bookings
      .filter((b) => b.status === "confirmed" && b.serviceIds.includes(id))
      .reduce((n, b) => n + b.seatCount, 0)
  );
}
export function reserveHold(state, command, ctx) {
  if (!Number.isFinite(ctx.now) || !ctx.sessionId || !ctx.serverHoldId) return { ok: false };
  const next = structuredClone(state),
    q = next.quotes.find((q) => q.id === command.quoteId);
  if (
    !q ||
    q.currency !== "USD" ||
    !Number.isSafeInteger(q.totalMinor) ||
    q.totalMinor < 0 ||
    q.sessionId !== ctx.sessionId ||
    q.expiresAt <= ctx.now ||
    !Number.isSafeInteger(q.seatCount) ||
    q.seatCount < 1 ||
    !isDeepStrictEqual(ordered(q.serviceIds), ordered(command.serviceIds)) ||
    !isDeepStrictEqual(ctx.lockedServiceIds, ordered(q.serviceIds)) ||
    next.holds.some((h) => h.id === ctx.serverHoldId)
  )
    return { ok: false };
  if (
    q.serviceIds.some(
      (id) =>
        !next.services[id] ||
        commitments(next, id, ctx.now) + q.seatCount > next.services[id].capacity,
    )
  )
    return { ok: false, status: 409 };
  const seats = command.seats ?? [];
  if (
    seats.some(
      (s) =>
        !q.serviceIds.includes(s.serviceId) ||
        !next.services[s.serviceId].seats.includes(s.code) ||
        next.claims.some((c) => c.serviceId === s.serviceId && c.code === s.code),
    ) ||
    new Set(seats.map((s) => s.serviceId + "|" + s.code)).size !== seats.length ||
    q.serviceIds.some((id) => seats.filter((s) => s.serviceId === id).length > q.seatCount)
  )
    return { ok: false, status: 409 };
  const hold = {
    id: ctx.serverHoldId,
    quoteId: q.id,
    sessionId: ctx.sessionId,
    serviceIds: q.serviceIds,
    seatCount: q.seatCount,
    state: "active",
    expiresAt: ctx.now + 600,
  };
  next.holds.push(hold);
  next.claims.push(
    ...seats.map((s) => ({ ...s, holdId: hold.id, bookingId: null, state: "held" })),
  );
  return { ok: true, state: next, hold };
}
export function attachBooking(state, command, ctx) {
  if (!Number.isFinite(ctx.now) || !ctx.sessionId || !ctx.serverBookingId) return { ok: false };
  const next = structuredClone(state),
    h = next.holds.find((h) => h.id === command.holdId),
    q = next.quotes.find((q) => q.id === command.quoteId);
  if (
    !h ||
    !q ||
    h.quoteId !== q.id ||
    h.sessionId !== ctx.sessionId ||
    h.state !== "active" ||
    h.expiresAt <= ctx.now ||
    next.bookings.some((b) => b.holdId === h.id) ||
    !isDeepStrictEqual(ctx.lockedServiceIds, ordered(h.serviceIds))
  )
    return { ok: false, status: 409 };
  const passengers = command.passengers ?? [],
    adults = new Set(passengers.filter((p) => p.type === "adult").map((p) => p.id));
  const infants = passengers.filter((p) => p.type === "infant"),
    seated = passengers.length - infants.length;
  if (
    seated !== h.seatCount ||
    passengers.length !== q.paxCount ||
    new Set(passengers.map((p) => p.id)).size !== passengers.length ||
    infants.some((p) => !adults.has(p.linkedAdultPassengerId) || p.seatCode != null) ||
    new Set(infants.map((p) => p.linkedAdultPassengerId)).size !== infants.length
  )
    return { ok: false, status: 422 };
  h.state = "attached";
  const booking = {
    id: ctx.serverBookingId,
    holdId: h.id,
    quoteId: q.id,
    checkoutSessionId: ctx.sessionId,
    serviceIds: h.serviceIds,
    seatCount: h.seatCount,
    status: "pending_payment",
    amountMinor: q.totalMinor,
    currency: q.currency,
  };
  booking.allocations = next.claims
    .filter((c) => c.holdId === h.id)
    .map((c, index, claims) => ({
      serviceId: c.serviceId,
      code: c.code,
      legId: booking.id + ":" + c.serviceId,
      passengerId: passengers.filter((p) => p.type !== "infant")[
        claims.slice(0, index).filter((x) => x.serviceId === c.serviceId).length
      ].id,
    }));
  next.bookings.push(booking);
  return { ok: true, state: next, booking };
}
export function expireHolds(state, ctx) {
  const next = structuredClone(state),
    expired = next.holds.filter(
      (h) => ["active", "attached"].includes(h.state) && h.expiresAt <= ctx.now,
    );
  if (!isDeepStrictEqual(ctx.lockedServiceIds, ordered(expired.flatMap((h) => h.serviceIds))))
    return { ok: false };
  for (const h of expired) {
    h.state = "expired";
    next.claims = next.claims.filter((c) => c.holdId !== h.id || c.state === "booked");
  }
  return { ok: true, state: next };
}
export function changeEquipment(state, id, layout, ctx) {
  if (
    !isDeepStrictEqual(ctx.lockedServiceIds, ordered([id])) ||
    !state.services[id] ||
    !Number.isSafeInteger(layout.capacity) ||
    layout.capacity < 0
  )
    return { ok: false };
  const next = structuredClone(state),
    required = commitments(next, id, ctx.now);
  if (
    required > layout.capacity ||
    next.claims.some((c) => c.serviceId === id && !layout.seats.includes(c.code))
  ) {
    next.conflicts.push({
      serviceId: id,
      code: "blocked_shrink_conflict",
      requestedCapacity: layout.capacity,
    });
    return { ok: false, status: 409, state: next };
  }
  next.services[id] = { capacity: layout.capacity, seats: layout.seats };
  return { ok: true, state: next };
}
export function applyPaymentEvent(state, event, ctx) {
  if (
    ctx.signatureVerified !== true ||
    ctx.providerAccount !== event.providerAccount ||
    !Number.isFinite(ctx.now)
  )
    return { ok: false };
  const next = structuredClone(state),
    previous = next.events.find((e) => e.provider === event.provider && e.id === event.id);
  if (previous)
    return isDeepStrictEqual(previous, event)
      ? { ok: true, duplicate: true, state: next }
      : { ok: false, status: 409, reconciliationRequired: true };
  const intent = next.intents.find(
    (i) =>
      i.provider === event.provider &&
      i.providerAccount === event.providerAccount &&
      i.providerRef === event.providerRef,
  );
  if (!intent || intent.amountMinor !== event.amountMinor || intent.currency !== event.currency)
    return { ok: false, reconciliationRequired: true };
  const b = next.bookings.find((b) => b.id === intent.bookingId),
    h = next.holds.find((h) => h.id === b?.holdId);
  if (!b || !h || !isDeepStrictEqual(ctx.lockedServiceIds, ordered(b.serviceIds)))
    return { ok: false };
  next.events.push(event);
  if (event.type === "succeeded") {
    if (intent.status === "succeeded") return { ok: true, duplicateEffect: true, state: next };
    intent.status = "succeeded";
    if (b.status === "pending_payment" && live(h, ctx.now) && h.state === "attached") {
      b.status = "confirmed";
      h.state = "converted";
      for (const c of next.claims.filter((c) => c.holdId === h.id)) {
        c.state = "booked";
        c.bookingId = b.id;
        const allocation = b.allocations.find(
          (a) => a.serviceId === c.serviceId && a.code === c.code,
        );
        c.legId = allocation.legId;
        c.passengerId = allocation.passengerId;
      }
    } else if (b.status === "confirmed") {
      if (!next.refunds.some((r) => r.intentId === intent.id && r.reason === "excess_payment")) {
        next.refunds.push({
          intentId: intent.id,
          reason: "excess_payment",
          amountMinor: intent.amountMinor,
          status: "requested",
        });
        next.outbox.push({ key: "refund:" + intent.id, state: "queued" });
      }
    } else if (b.status !== "confirmed") {
      b.status = "compensation_pending";
      h.state = "expired";
      next.claims = next.claims.filter((c) => c.holdId !== h.id);
      if (!next.refunds.some((r) => r.intentId === intent.id && r.reason === "late_payment")) {
        next.refunds.push({
          intentId: intent.id,
          reason: "late_payment",
          amountMinor: intent.amountMinor,
          status: "requested",
        });
        next.outbox.push({ key: "refund:" + intent.id, state: "queued" });
      }
    }
  } else if (event.type === "failed" && intent.status !== "succeeded") intent.status = "failed";
  return { ok: true, state: next };
}
export function settleCompensation(state, intentId, event, ctx) {
  const next = structuredClone(state),
    intent = next.intents.find((i) => i.id === intentId),
    r = next.refunds.find((r) => r.intentId === intentId);
  if (
    !intent ||
    !r ||
    ctx.signatureVerified !== true ||
    !Number.isFinite(ctx.now) ||
    ctx.providerAccount !== intent.providerAccount ||
    event.provider !== intent.provider ||
    event.providerAccount !== intent.providerAccount ||
    event.providerRef !== intent.providerRef ||
    event.amountMinor !== r.amountMinor ||
    event.currency !== intent.currency ||
    !["succeeded", "failed", "processing"].includes(event.status)
  )
    return { ok: false };
  const b = next.bookings.find((b) => b.id === intent.bookingId);
  if (!b || !isDeepStrictEqual(ctx.lockedServiceIds, ordered(b.serviceIds))) return { ok: false };
  if (r.status === "succeeded") return { ok: true, duplicate: true, state: next };
  r.status = event.status;
  if (r.status === "succeeded" && b.status === "compensation_pending") b.status = "cancelled";
  return { ok: true, state: next };
}
export function idempotentOutcome(rows, command, result, now) {
  if (
    !command.actorId ||
    !command.realm ||
    !command.operationId ||
    !command.key ||
    !command.bodyHash ||
    !Number.isFinite(now)
  )
    return { ok: false };
  const match = (r) => ["actorId", "realm", "operationId", "key"].every((k) => r[k] === command[k]),
    old = rows.find(match);
  if (old) {
    if (old.bodyHash !== command.bodyHash) return { ok: false, status: 409 };
    if (old.expiresAt <= now) return { ok: false, status: 409 };
    return { ok: true, replay: true, result: old.result, rows };
  }
  return {
    ok: true,
    replay: false,
    result,
    rows: [...rows, { ...command, result, expiresAt: now + 86400 }],
  };
}

export function validateIntegrityApi(spec) {
  const errors = [];
  for (const p of ["/quotes", "/holds", "/bookings", "/payments/intents"]) {
    const op = spec.paths?.[p]?.post;
    if (
      !op ||
      !isDeepStrictEqual(op["x-checkout-binding"], {
        requiresLivePassengerSession: true,
        resourceSessionMustMatch: true,
        clientIdentityNeverAuthoritative: true,
      })
    )
      errors.push(p + " missing checkout session binding");
  }
  const S = spec.components?.schemas;
  for (const name of [
    "CreateQuoteRequest",
    "CreateHoldRequest",
    "CreateBookingRequest",
    "CreatePaymentIntentRequest",
  ])
    if (S?.[name]?.additionalProperties !== false)
      errors.push(name + " must reject invented authority/price");
  if (
    !isDeepStrictEqual(S?.HoldResponse?.properties?.data?.properties?.status?.enum, C.holds.states)
  )
    errors.push("Hold state mismatch");
  if (
    !isDeepStrictEqual(
      S?.PaymentIntentResponse?.properties?.data?.properties?.status?.enum,
      C.payment.statuses,
    )
  )
    errors.push("Intent state mismatch");
  if (S?.BookingDetailResponse?.properties?.data?.properties?.receiptToken)
    errors.push("Ordinary booking read leaks receipt grant");
  if (
    spec.paths?.["/bookings"]?.post?.responses?.["201"]?.content?.["application/json"]?.schema
      ?.$ref !== "#/components/schemas/CreateBookingResponse"
  )
    errors.push("Creation must issue separate scoped receipt grant");
  return { valid: !errors.length, errors };
}
