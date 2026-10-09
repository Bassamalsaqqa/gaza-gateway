import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as I from "../../scripts/lib/backend-integrity-contracts.mjs";
import * as P from "../../scripts/lib/backend-publication-contracts.mjs";
import { PUBLICATION_CONTRACT as C } from "../../scripts/lib/backend-publication-policy.mjs";
const read = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const base = () => ({
  services: { a: { capacity: 1, seats: ["1A"] }, b: { capacity: 1, seats: ["1A"] } },
  quotes: [
    {
      id: "q1",
      sessionId: "anon1",
      paxCount: 2,
      seatCount: 1,
      serviceIds: ["b", "a"],
      totalMinor: 3500,
      currency: "USD",
      expiresAt: 1300,
    },
  ],
  holds: [],
  bookings: [],
  claims: [],
  intents: [],
  events: [],
  refunds: [],
  outbox: [],
  conflicts: [],
});
const ctx = { now: 1000, sessionId: "anon1", lockedServiceIds: ["a", "b"], serverHoldId: "h1" };
const reserve = (state = base()) =>
  I.reserveHold(
    state,
    {
      quoteId: "q1",
      serviceIds: ["a", "b"],
      seats: [
        { serviceId: "a", code: "1A" },
        { serviceId: "b", code: "1A" },
      ],
    },
    ctx,
  );
const attached = () => {
  const r = reserve();
  assert.equal(r.ok, true);
  const b = I.attachBooking(
    r.state,
    {
      holdId: "h1",
      quoteId: "q1",
      passengers: [
        { id: "adult", type: "adult" },
        { id: "infant", type: "infant", linkedAdultPassengerId: "adult", seatCode: null },
      ],
    },
    { ...ctx, serverBookingId: "b1" },
  );
  assert.equal(b.ok, true);
  b.state.intents.push({
    id: "i1",
    provider: "sandbox",
    providerAccount: "merchant1",
    providerRef: "pay1",
    bookingId: "b1",
    amountMinor: 3500,
    currency: "USD",
    status: "processing",
  });
  return b.state;
};
const event = {
  id: "ev1",
  provider: "sandbox",
  providerAccount: "merchant1",
  providerRef: "pay1",
  amountMinor: 3500,
  currency: "USD",
  type: "succeeded",
};
const paymentCtx = {
  now: 1100,
  signatureVerified: true,
  providerAccount: "merchant1",
  lockedServiceIds: ["a", "b"],
};
describe("Inventory/payment foundation contract", () => {
  it("pins every writer, scope, FK and state machine in a closed manifest", () => {
    const m = read("docs/backend/inventory-payment.v1.json");
    assert.equal(I.validateIntegrityManifest(m).valid, true);
    for (const mutate of [
      (x: typeof m) => x.lockOrder.reverse(),
      (x: typeof m) =>
        (x.constraints.find((r: { table: string }) => r.table === "service_seat_claims").primary = [
          "hold_id",
          "seat_code",
        ]),
      (x: typeof m) => (x.payment.lateSuccess = "confirm"),
    ]) {
      const x = structuredClone(m);
      mutate(x);
      assert.equal(I.validateIntegrityManifest(x).valid, false);
    }
  });
  it("locks both legs in bytewise exact-ID order; opposite client order cannot deadlock by design", () => {
    assert.deepEqual(I.inventoryLockOrder(["b", "a", "a"]), ["a", "b"]);
    assert.equal(reserve().ok, true);
    assert.equal(
      I.reserveHold(
        base(),
        { quoteId: "q1", serviceIds: ["a", "b"] },
        { ...ctx, lockedServiceIds: ["b", "a"] },
      ).ok,
      false,
    );
  });
  it("reserves all legs or none and denies the second transaction the same seat/capacity", () => {
    const first = reserve();
    assert.equal(first.ok, true);
    const second = I.reserveHold(
      first.state,
      { quoteId: "q1", serviceIds: ["b", "a"] },
      { ...ctx, serverHoldId: "h2" },
    );
    assert.equal(second.ok, false);
    const s = base();
    s.services.b.capacity = 0;
    assert.equal(reserve(s).ok, false);
    assert.equal(s.holds.length, 0);
  });
  it("binds quote and hold to checkout session, excluding lap infant capacity and one conversion per hold", () => {
    assert.equal(
      I.reserveHold(
        base(),
        { quoteId: "q1", serviceIds: ["a", "b"] },
        { ...ctx, sessionId: "foreign" },
      ).ok,
      false,
    );
    const s = attached();
    assert.equal(s.bookings[0].seatCount, 1);
    assert.equal(s.holds[0].state, "attached");
    assert.equal(
      I.attachBooking(
        s,
        { holdId: "h1", quoteId: "q1", passengers: [] },
        { ...ctx, serverBookingId: "b2" },
      ).ok,
      false,
    );
  });
  it("expiration acquires the same service locks and releases only held claims", () => {
    const s = attached();
    assert.equal(I.expireHolds(s, { now: 1700, lockedServiceIds: ["b", "a"] }).ok, false);
    const x = I.expireHolds(s, { now: 1700, lockedServiceIds: ["a", "b"] });
    assert.equal(x.ok, true);
    assert.equal(x.state.claims.length, 0);
    assert.equal(x.state.holds[0].state, "expired");
  });
  it("rejects equipment shrink with a separately persisted conflict while preserving equipment and claims", () => {
    const s = attached(),
      r = I.changeEquipment(
        s,
        "a",
        { capacity: 0, seats: [] },
        { now: 1100, lockedServiceIds: ["a"] },
      );
    assert.equal(r.ok, false);
    assert.equal(r.status, 409);
    assert.equal(r.state.services.a.capacity, 1);
    assert.equal(r.state.claims.length, 2);
    assert.equal(r.state.conflicts.length, 1);
  });
  it("requires signature and exact provider account/reference amount/currency before effects", () => {
    const s = attached();
    assert.equal(
      I.applyPaymentEvent(s, event, { ...paymentCtx, signatureVerified: false }).ok,
      false,
    );
    for (const patch of [
      { amountMinor: 3501 },
      { currency: "EUR" },
      { providerAccount: "foreign" },
      { providerRef: "foreign" },
    ])
      assert.equal(I.applyPaymentEvent(s, { ...event, ...patch }, paymentCtx).ok, false);
    assert.equal(s.events.length, 0);
  });
  it("confirms a live attached hold exactly once, never regresses paid state on an older failure", () => {
    const r = I.applyPaymentEvent(attached(), event, paymentCtx);
    assert.equal(r.ok, true);
    assert.equal(r.state.bookings[0].status, "confirmed");
    assert.equal(r.state.claims[0].state, "booked");
    assert.equal(I.applyPaymentEvent(r.state, event, paymentCtx).duplicate, true);
    const later = I.applyPaymentEvent(r.state, { ...event, id: "ev2", type: "failed" }, paymentCtx);
    assert.equal(later.state.intents[0].status, "succeeded");
  });
  it("late payment never reacquires capacity; refund failure stays pending and verified settlement cancels", () => {
    const r = I.applyPaymentEvent(attached(), event, { ...paymentCtx, now: 1700 });
    assert.equal(r.state.bookings[0].status, "compensation_pending");
    assert.equal(r.state.claims.length, 0);
    assert.equal(r.state.refunds.length, 1);
    assert.equal(r.state.outbox.length, 1);
    const duplicate = I.applyPaymentEvent(
      r.state,
      { ...event, id: "ev2" },
      { ...paymentCtx, now: 1800 },
    );
    assert.equal(duplicate.state.refunds.length, 1);
    const f = I.settleCompensation(
      r.state,
      "i1",
      {
        provider: "sandbox",
        providerAccount: "merchant1",
        providerRef: "pay1",
        amountMinor: 3500,
        currency: "USD",
        status: "failed",
      },
      paymentCtx,
    );
    assert.equal(f.state.bookings[0].status, "compensation_pending");
    assert.equal(
      I.settleCompensation(
        r.state,
        "i1",
        {
          provider: "sandbox",
          providerAccount: "foreign",
          providerRef: "pay1",
          amountMinor: 3500,
          currency: "USD",
          status: "succeeded",
        },
        paymentCtx,
      ).ok,
      false,
    );
    const paid = I.settleCompensation(
      f.state,
      "i1",
      {
        provider: "sandbox",
        providerAccount: "merchant1",
        providerRef: "pay1",
        amountMinor: 3500,
        currency: "USD",
        status: "succeeded",
      },
      paymentCtx,
    );
    assert.equal(paid.state.bookings[0].status, "cancelled");
    assert.equal(
      I.settleCompensation(
        paid.state,
        "i1",
        {
          provider: "sandbox",
          providerAccount: "merchant1",
          providerRef: "pay1",
          amountMinor: 3500,
          currency: "USD",
          status: "succeeded",
        },
        paymentCtx,
      ).duplicate,
      true,
    );
  });
  it("idempotency is actor/realm/operation/key scoped and conflicts on body mutation or stale outcomes", () => {
    const c = {
      realm: "passenger",
      actorId: "p1",
      operationId: "book",
      key: "key1",
      bodyHash: "hash1",
    };
    const r = I.idempotentOutcome([], c, { bookingId: "b1" }, 1000);
    assert.equal(r.ok, true);
    assert.equal(I.idempotentOutcome(r.rows, c, {}, 1100).replay, true);
    assert.equal(I.idempotentOutcome(r.rows, { ...c, bodyHash: "tamper" }, {}, 1100).status, 409);
    assert.equal(I.idempotentOutcome(r.rows, { ...c, actorId: "p2" }, {}, 1100).replay, false);
    assert.equal(I.idempotentOutcome(r.rows, c, {}, 100000).ok, false);
  });
});
describe("Immutable publication and owner activation boundaries", () => {
  const input = () => ({
    documents: Object.fromEntries(C.seal.documents.map((k) => [k, { id: k, title: "sealed" }])),
    revisions: Object.fromEntries(
      [...C.seal.documents, "contact", "appearance", "archive"].map((k) => [k, 1]),
    ),
    settings: { contact: {}, appearance: {} },
    archive: { records: [], sources: [] },
    assets: [],
  });
  const sealCtx = {
    environment: "staging",
    releaseId: "rel1",
    sourceSha: "a".repeat(40),
    expectedRevisions: Object.fromEntries(
      [...C.seal.documents, "contact", "appearance", "archive"].map((k) => [k, 1]),
    ),
    provenanceVerified: true,
  };
  const release = () => P.sealPublication(input(), sealCtx).release;
  const build = () =>
    P.buildReceipt(release(), [{ path: "release.json", sha256: "b".repeat(64), byteLength: 100 }], {
      environment: "staging",
      sourceSha: sealCtx.sourceSha,
      snapshotHash: release().snapshotHash,
      receiptId: "build1",
    }).receipt;
  const activationCtx = {
    permission: "admin.manage",
    recentStepUpSeconds: 10,
    liveProbeVerified: true,
    probedArtifactHash: build().artifactHash,
    expectedRevision: 0,
    action: "activate",
  };
  const control = { environment: "staging", activeReleaseId: null, revision: 0 };
  const deployment = {
    id: "deployment1",
    buildId: "build1",
    environment: "staging",
    origin: C.isolation.staging.frontend,
    artifactHash: build().artifactHash,
    ownerApproved: true,
  };
  it("pins snapshot, network isolation, receipts and rollback constraints", () => {
    const m = read("docs/backend/publication-lifecycle.v1.json");
    assert.equal(P.validatePublicationManifest(m).valid, true);
    m.isolation.staging.workspace = "same production workspace";
    assert.equal(P.validatePublicationManifest(m).valid, false);
  });
  it("seals all eight documents and rejects stale revisions or unknown provenance", () => {
    assert.equal(P.sealPublication(input(), sealCtx).ok, true);
    assert.equal(
      P.sealPublication(input(), { ...sealCtx, expectedRevisions: { home: 2 } }).ok,
      false,
    );
    assert.equal(P.sealPublication(input(), { ...sealCtx, provenanceVerified: false }).ok, false);
  });
  it("reads immutable pins despite later edits, rejecting missing/unknown/environment-mismatched pins", () => {
    const source = input(),
      sealed = P.sealPublication(source, sealCtx);
    source.documents.home.title = "changed";
    const r = P.readPublication([sealed.release], "rel1", "staging");
    assert.equal(r.snapshot.documents.home.title, "sealed");
    assert.equal(P.readPublication([sealed.release], null, "staging").status, 400);
    assert.equal(P.readPublication([sealed.release], "rel1", "production").status, 404);
    sealed.release.payload.documents.home.title = "tampered";
    assert.equal(P.readPublication([sealed.release], "rel1", "staging").ok, false);
  });
  it("rejects artifact traversal, executable PHP, duplicate paths, and mismatched snapshot", () => {
    const c = {
      environment: "staging",
      sourceSha: sealCtx.sourceSha,
      snapshotHash: release().snapshotHash,
      receiptId: "build1",
    };
    for (const path of ["../private.env", "/absolute", "bad.php", "a\\b", "a//b"])
      assert.equal(
        P.buildReceipt(release(), [{ path, sha256: "b".repeat(64), byteLength: 1 }], c).ok,
        false,
      );
    assert.equal(
      P.buildReceipt(release(), build().files, { ...c, snapshotHash: "f".repeat(64) }).ok,
      false,
    );
  });
  it("requires owner deployment plus fixed-origin verified probe, matching checksums, step-up and CAS activation", () => {
    assert.equal(
      P.activatePublication(control, release(), build(), deployment, activationCtx).ok,
      true,
    );
    for (const c of [
      { liveProbeVerified: false },
      { probedArtifactHash: "f".repeat(64) },
      { recentStepUpSeconds: 301 },
      { expectedRevision: 1 },
      { permission: "content.edit" },
    ])
      assert.equal(
        P.activatePublication(control, release(), build(), deployment, { ...activationCtx, ...c })
          .ok,
        false,
      );
    assert.equal(
      P.activatePublication(
        control,
        release(),
        build(),
        { ...deployment, ownerApproved: false },
        activationCtx,
      ).ok,
      false,
    );
    assert.equal(
      P.activatePublication(
        control,
        release(),
        build(),
        { ...deployment, origin: "https://evil.test" },
        activationCtx,
      ).ok,
      false,
    );
  });
  it("rollback is an append-only activation to a retained verified release with a new pointer revision", () => {
    const first = P.activatePublication(control, release(), build(), deployment, activationCtx);
    const r = P.activatePublication(first.control, release(), build(), deployment, {
      ...activationCtx,
      expectedRevision: 1,
      action: "rollback",
    });
    assert.equal(r.ok, true);
    assert.equal(r.control.revision, 2);
    assert.equal(r.event.action, "rollback");
    assert.equal(
      P.activatePublication(first.control, release(), build(), deployment, activationCtx).ok,
      false,
    );
  });
});

describe("Foundation operations preserve authentic source fixtures", () => {
  it("validates the sealed eight-document payload and public archive projection using actual API schemas", async () => {
    const spec = read("docs/backend/openapi.v1.json");
    const { getPublishedContent } = await import("../../src/content/repository.ts");
    const { ARCHIVE_CATALOG } = await import("../../src/lib/archive/catalog.ts");
    const { validatePayloadAgainstSchema } =
      await import("../../scripts/lib/backend-contract-validation.mjs");
    const docs = {};
    for (const key of C.seal.documents) docs[key] = await getPublishedContent(key);
    assert.equal(
      validatePayloadAgainstSchema(spec.components.schemas.ContentMapDto, docs, spec).valid,
      true,
    );
    for (const source of ARCHIVE_CATALOG) {
      const row = structuredClone(source);
      delete row.originalFilename;
      delete row.intakeReference;
      delete row.curatorPublicationStatus;
      delete row.factCheckNotes;
      const result = validatePayloadAgainstSchema(
        spec.components.schemas.PublicArchiveRecordDto,
        row,
        spec,
      );
      assert.equal(result.valid, true, JSON.stringify(result.errors));
    }
  });
  it("rejects missing checkout binding, missing release pin and schema-family substitution", () => {
    const spec = read("docs/backend/openapi.v1.json");
    assert.equal(I.validateIntegrityApi(spec).valid, true);
    assert.equal(P.validatePublicationApi(spec).valid, true);
    const a = structuredClone(spec);
    delete a.paths["/payments/intents"].post["x-checkout-binding"];
    assert.equal(I.validateIntegrityApi(a).valid, false);
    const b = structuredClone(spec);
    b.paths["/archive/records"].get.parameters = [];
    assert.equal(P.validatePublicationApi(b).valid, false);
    const c = structuredClone(spec);
    c.paths["/cms/publications/{releaseId}/activate"].post.requestBody.content[
      "application/json"
    ].schema = { $ref: "#/components/schemas/CreateBookingRequest" };
    assert.equal(P.validatePublicationApi(c).valid, false);
  });
});

describe("Payment multiple-capture and mutated-replay boundaries", () => {
  it("refunds excess capture while preserving the first confirmed booking and conflicts on changed event ID payload", () => {
    const state = attached(),
      first = I.applyPaymentEvent(state, event, paymentCtx);
    first.state.intents.push({
      ...first.state.intents[0],
      id: "i2",
      providerRef: "pay2",
      status: "processing",
    });
    const x = I.applyPaymentEvent(
      first.state,
      { ...event, id: "ev2", providerRef: "pay2" },
      paymentCtx,
    );
    assert.equal(x.state.bookings[0].status, "confirmed");
    assert.equal(x.state.refunds[0].reason, "excess_payment");
    assert.equal(
      I.applyPaymentEvent(first.state, { ...event, amountMinor: 1 }, paymentCtx).status,
      409,
    );
  });
});
