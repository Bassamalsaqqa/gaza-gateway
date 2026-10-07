/**
 * Gaza Gateway — Central Admin Audit Orchestration Unit Tests (Phase 6C)
 *
 * Exhaustively verifies real domain repositories under administrative audit orchestration:
 * 1. General Invariants:
 *    - Domain commits FIRST, audit appends SECOND.
 *    - Domain errors produce ZERO audit events.
 *    - Domain no-ops produce ZERO audit events.
 *    - Separate-store non-ACID truth: audit write failures preserve domain commit and emit warning.
 *    - Public passenger actions (null/undefined actor) produce ZERO staff audit events.
 * 2. Staff Directory Mutations:
 *    - Role change commits and audits; identical role replay suppresses duplicate audit.
 *    - Status toggle commits and audits; identical status replay suppresses duplicate audit.
 *    - Multi-tab race: two independent StaffRepository instances applying the same intended
 *      role change concurrently — only the writer that actually commits a state change receives
 *      an audit event; the second writer receives changed:false and its audit event is suppressed.
 * 3. Booking Mutations:
 *    - Contact update: change emits audit; replay returns changed:false and suppresses audit.
 *    - Seat update: change emits audit; replay returns changed:false and suppresses audit.
 *    - Cancellation: cancel emits audit; replay returns changed:false and suppresses audit.
 * 4. Check-In & Undo Check-In:
 *    - Check-in commits and audits; replay for already-checked-in pax suppresses duplicate audit.
 *    - Undo check-in commits and audits; replay for already-undone pax suppresses duplicate audit.
 * 5. Customer Directory & Claim:
 *    - Passenger account update with expectedEmail emits audit; replay suppresses duplicate audit.
 *    - Booking claim emits audit on "claimed"; replay ("already-owned-by-user") suppresses audit.
 * 6. Operational Flights, Network & Schedules:
 *    - Flight override quick edit: save emits audit; identical replay suppresses duplicate audit.
 *    - Flight clear override: clear emits audit; clearing already-cleared flight suppresses duplicate audit.
 *    - Network destination: update emits audit; identical replay suppresses duplicate audit.
 *    - Schedule: update emits audit; identical replay suppresses duplicate audit.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  executeAuditedAdminCommand,
  recordAdminAudit,
  type ActivityActorSnapshot,
  type ActivityRepository,
} from "../../src/lib/activity/index.ts";
import { createRepositories } from "../../src/lib/repositories/registry.ts";
import {
  LocalStaffRepository,
  StaffStorageCoordinator,
} from "../../src/lib/staff/index.ts";

function createMockStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
}

const SAMPLE_ACTOR: ActivityActorSnapshot = {
  id: "adm-1",
  name: { en: "Rana Habib", ar: "رنا حبيب" },
  email: "rana.habib@gza.ps",
  role: "admin",
};

describe("Admin Audit Orchestration — General Invariants", () => {
  it("executes domain command first and appends audit event upon success", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    let domainCalled = false;
    const result = await executeAuditedAdminCommand({
      domainCommand: async () => {
        domainCalled = true;
        return { success: true, bookingRef: "GZA-TEST" };
      },
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "bookings",
        action: "created",
        targetType: "booking",
        targetId: "GZA-TEST",
        metadata: { ref: "GZA-TEST" },
      },
    });

    assert.equal(domainCalled, true);
    assert.deepEqual(result, { success: true, bookingRef: "GZA-TEST" });

    const events = await repos.activity.list();
    assert.equal(events.length, 1);
    assert.equal(events[0].actor.id, "adm-1");
    assert.equal(events[0].module, "bookings");
    assert.equal(events[0].action, "created");
  });

  it("produces NO audit event if domain command throws an error", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    await assert.rejects(
      async () => {
        await executeAuditedAdminCommand({
          domainCommand: async () => {
            throw new Error("Domain validation failed");
          },
          activityRepo: repos.activity,
          actor: SAMPLE_ACTOR,
          event: {
            module: "bookings",
            action: "created",
            targetType: "booking",
            targetId: "FAIL-123",
          },
        });
      },
      { message: "Domain validation failed" },
    );

    const events = await repos.activity.list();
    assert.equal(events.length, 0);
  });

  it("suppresses audit event when isNoOp returns true", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    let domainExecuted = false;
    const result = await executeAuditedAdminCommand({
      domainCommand: async () => {
        domainExecuted = true;
        return { changed: false };
      },
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      isNoOp: (res) => !res.changed,
      event: {
        module: "flights",
        action: "updated",
        targetType: "flight_override",
        targetId: "PS-101",
      },
    });

    assert.equal(domainExecuted, true);
    assert.deepEqual(result, { changed: false });

    const events = await repos.activity.list();
    assert.equal(events.length, 0);
  });

  it("preserves domain commit and emits warning when audit append fails", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    const failingRepo: ActivityRepository = {
      ...repos.activity,
      append: async () => {
        throw new Error("Simulated storage write error (QuotaExceeded)");
      },
    };

    let domainCommitted = false;
    let warningReported: string | null = null;

    const result = await executeAuditedAdminCommand({
      domainCommand: async () => {
        domainCommitted = true;
        return { committedData: "verified" };
      },
      activityRepo: failingRepo,
      actor: SAMPLE_ACTOR,
      event: {
        module: "staff",
        action: "created",
        targetType: "staff",
        targetId: "adm-99",
      },
      onAuditWarning: (msg) => {
        warningReported = msg;
      },
    });

    assert.equal(domainCommitted, true, "Domain must remain committed");
    assert.deepEqual(result, { committedData: "verified" });
    assert.equal(warningReported, "audit_append_failed");
  });

  it("does not append audit event if actor is null or undefined (public action)", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    const result = await executeAuditedAdminCommand({
      domainCommand: async () => "public-passenger-result",
      activityRepo: repos.activity,
      actor: null,
      event: {
        module: "bookings",
        action: "created",
        targetType: "booking",
        targetId: "PUB-1",
      },
    });

    assert.equal(result, "public-passenger-result");
    const events = await repos.activity.list();
    assert.equal(events.length, 0);
  });
});

describe("Admin Audit Orchestration — Staff Directory Mutations", () => {
  it("role change commits and records audit; identical role replay suppresses duplicate audit", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    // Seed another admin so demoting adm-1 does not violate last_admin_protected
    await repos.staff.create({
      name: { en: "Admin Second", ar: "مشرف ثان" },
      email: "admin2@gza.ps",
      role: "admin",
      status: "active",
    });

    const memberBefore = await repos.staff.getById("adm-1");
    assert.ok(memberBefore);
    assert.equal(memberBefore.role, "admin");

    // 1. Change role of adm-1 to "editor"
    const receipt1 = await executeAuditedAdminCommand({
      domainCommand: () => repos.staff.updateRoleWithReceipt("adm-1", "editor"),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "staff",
        action: "role_changed",
        targetType: "staff",
        targetId: "adm-1",
        before: "admin",
        after: "editor",
        metadata: {
          role: "editor",
          email: memberBefore.email,
        },
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt1.changed, true);
    assert.equal(receipt1.member.role, "editor");

    let events = await repos.activity.list();
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "role_changed");
    assert.equal(events[0].before, "admin");
    assert.equal(events[0].after, "editor");

    // 2. Replay identical role update to "editor"
    const receipt2 = await executeAuditedAdminCommand({
      domainCommand: () => repos.staff.updateRoleWithReceipt("adm-1", "editor"),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "staff",
        action: "role_changed",
        targetType: "staff",
        targetId: "adm-1",
        before: "editor",
        after: "editor",
        metadata: {
          role: "editor",
          email: memberBefore.email,
        },
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt2.changed, false);
    events = await repos.activity.list();
    assert.equal(events.length, 1, "Duplicate audit event must be suppressed");
  });

  it("status update commits and records audit; identical status replay suppresses duplicate audit", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    const memberBefore = await repos.staff.getById("adm-2");
    assert.ok(memberBefore);
    assert.equal(memberBefore.status, "active");

    // 1. Set status of adm-2 to "disabled"
    const receipt1 = await executeAuditedAdminCommand({
      domainCommand: () => repos.staff.setStatusWithReceipt("adm-2", "disabled"),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "staff",
        action: "status_changed",
        targetType: "staff",
        targetId: "adm-2",
        before: "active",
        after: "disabled",
        metadata: {
          status: "disabled",
          email: memberBefore.email,
        },
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt1.changed, true);
    assert.equal(receipt1.member.status, "disabled");

    let events = await repos.activity.list();
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "status_changed");
    assert.equal(events[0].after, "disabled");

    // 2. Setting status explicitly to "disabled" again is a no-op
    const receipt2 = await executeAuditedAdminCommand({
      domainCommand: () => repos.staff.setStatusWithReceipt("adm-2", "disabled"),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "staff",
        action: "status_changed",
        targetType: "staff",
        targetId: "adm-2",
        before: "disabled",
        after: "disabled",
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt2.changed, false);
    events = await repos.activity.list();
    assert.equal(events.length, 1, "No-op status update must not append duplicate audit");
  });

  it("handles multi-tab race: two independent StaffRepository instances updating the same role — only the committed writer receives an audit event", async () => {
    const sharedStorage = createMockStorage();

    // Tab 1 repos
    const repos1 = createRepositories({ storage: sharedStorage });

    // Seed another admin so demoting adm-1 does not violate last_admin_protected
    await repos1.staff.create({
      name: { en: "Admin Second", ar: "مشرف ثان" },
      email: "admin2@gza.ps",
      role: "admin",
      status: "active",
    });

    // Tab 2 sharing the same underlying storage
    const staffCoord2 = new StaffStorageCoordinator({ storage: sharedStorage });
    const staffRepo2 = new LocalStaffRepository(staffCoord2);

    // Initial staff adm-1 is "admin". Both tabs attempt to set role on "adm-1" to "viewer".
    const actor1: ActivityActorSnapshot = { ...SAMPLE_ACTOR, id: "adm-tab1" };
    const actor2: ActivityActorSnapshot = { ...SAMPLE_ACTOR, id: "adm-tab2" };

    // Tab 1 executes first and commits
    const receipt1 = await executeAuditedAdminCommand({
      domainCommand: () => repos1.staff.updateRoleWithReceipt("adm-1", "viewer"),
      activityRepo: repos1.activity,
      actor: actor1,
      event: {
        module: "staff",
        action: "role_changed",
        targetType: "staff",
        targetId: "adm-1",
        after: "viewer",
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt1.changed, true);

    // Tab 2 executes second on the shared storage
    const receipt2 = await executeAuditedAdminCommand({
      domainCommand: () => staffRepo2.updateRoleWithReceipt("adm-1", "viewer"),
      activityRepo: repos1.activity,
      actor: actor2,
      event: {
        module: "staff",
        action: "role_changed",
        targetType: "staff",
        targetId: "adm-1",
        after: "viewer",
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt2.changed, false);

    // Verify activity store has EXACTLY 1 event, created by Tab 1
    const events = await repos1.activity.list();
    assert.equal(events.length, 1);
    assert.equal(events[0].actor.id, "adm-tab1");
  });
});

describe("Admin Audit Orchestration — Booking Mutations", () => {
  it("booking contact update: commits change and audits; replay suppresses duplicate audit", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    const initialBooking = await repos.booking.getByRef("GZA4TQ");
    assert.ok(initialBooking);

    // 1. Update contact to new phone
    const receipt1 = await executeAuditedAdminCommand({
      domainCommand: () =>
        repos.booking.updateContactWithReceipt("GZA4TQ", {
          email: "nadia.sabbagh@example.com",
          phone: "+970 59 999 8877",
        }),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "bookings",
        action: "updated",
        targetType: "booking",
        targetId: "GZA4TQ",
        metadata: {
          bookingRef: "GZA4TQ",
          phone: "+970 59 999 8877",
        },
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt1.changed, true);
    assert.equal(receipt1.booking.contact.phone, "+970 59 999 8877");

    let events = await repos.activity.list();
    assert.equal(events.length, 1);
    assert.equal(events[0].metadata?.phone, "+970 59 999 8877");

    // 2. Replay identical contact update
    const receipt2 = await executeAuditedAdminCommand({
      domainCommand: () =>
        repos.booking.updateContactWithReceipt("GZA4TQ", {
          email: "nadia.sabbagh@example.com",
          phone: "+970 59 999 8877",
        }),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "bookings",
        action: "updated",
        targetType: "booking",
        targetId: "GZA4TQ",
        metadata: {
          bookingRef: "GZA4TQ",
          phone: "+970 59 999 8877",
        },
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt2.changed, false);
    events = await repos.activity.list();
    assert.equal(events.length, 1, "Duplicate contact audit must be suppressed");
  });

  it("booking seats update: commits change and audits; replay suppresses duplicate audit", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    const initialBooking = await repos.booking.getByRef("GZA4TQ");
    assert.ok(initialBooking);

    // 1. Update seats
    const newSeats = { "out-0": "14A", "out-1": "14B" };
    const receipt1 = await executeAuditedAdminCommand({
      domainCommand: () => repos.booking.updateSeatsWithReceipt("GZA4TQ", newSeats),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "bookings",
        action: "updated",
        targetType: "booking",
        targetId: "GZA4TQ",
        metadata: {
          bookingRef: "GZA4TQ",
          seats: "14A, 14B",
        },
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt1.changed, true);
    let events = await repos.activity.list();
    assert.equal(events.length, 1);

    // 2. Replay same seats
    const receipt2 = await executeAuditedAdminCommand({
      domainCommand: () => repos.booking.updateSeatsWithReceipt("GZA4TQ", newSeats),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "bookings",
        action: "updated",
        targetType: "booking",
        targetId: "GZA4TQ",
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt2.changed, false);
    events = await repos.activity.list();
    assert.equal(events.length, 1, "Duplicate seat audit must be suppressed");
  });

  it("booking cancel: first cancel audits; second cancel returns changed:false and suppresses audit", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    // 1. Cancel booking GZA4TQ
    const receipt1 = await executeAuditedAdminCommand({
      domainCommand: () => repos.booking.cancelWithReceipt("GZA4TQ"),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "bookings",
        action: "cancelled",
        targetType: "booking",
        targetId: "GZA4TQ",
        before: "confirmed",
        after: "cancelled",
        metadata: { bookingRef: "GZA4TQ" },
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt1.changed, true);
    assert.equal(receipt1.booking.status, "cancelled");

    let events = await repos.activity.list();
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "cancelled");

    // 2. Replay cancel on already-cancelled booking
    const receipt2 = await executeAuditedAdminCommand({
      domainCommand: () => repos.booking.cancelWithReceipt("GZA4TQ"),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "bookings",
        action: "cancelled",
        targetType: "booking",
        targetId: "GZA4TQ",
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt2.changed, false);
    events = await repos.activity.list();
    assert.equal(events.length, 1, "Replay cancellation must be suppressed");
  });
});

describe("Admin Audit Orchestration — Check-In & Undo Check-In", () => {
  it("check-in commits and audits; replay for already-checked-in pax suppresses duplicate audit", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    // Outbound departs 2026-09-19 07:15 station time (04:15 UTC). Noon on Sept 18 is within 24h window.
    const checkInTime = "2026-09-18T12:00:00.000Z";

    // 1. Check in passenger 0 on outbound leg
    const receipt1 = await executeAuditedAdminCommand({
      domainCommand: () =>
        repos.booking.completeCheckInWithReceipt({
          ref: "GZA4TQ",
          leg: "out",
          selectedPaxIndexes: [0],
          documents: { 0: "P GZA4TQ84213" },
          now: checkInTime,
        }),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "bookings",
        action: "checked_in",
        targetType: "booking",
        targetId: "GZA4TQ",
        metadata: {
          bookingRef: "GZA4TQ",
          leg: "out",
          paxIndex: 0,
        },
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt1.changed, true);
    let events = await repos.activity.list();
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "checked_in");

    // 2. Replay identical check-in for passenger 0
    const receipt2 = await executeAuditedAdminCommand({
      domainCommand: () =>
        repos.booking.completeCheckInWithReceipt({
          ref: "GZA4TQ",
          leg: "out",
          selectedPaxIndexes: [0],
          documents: { 0: "P GZA4TQ84213" },
          now: checkInTime,
        }),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "bookings",
        action: "checked_in",
        targetType: "booking",
        targetId: "GZA4TQ",
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt2.changed, false);
    events = await repos.activity.list();
    assert.equal(events.length, 1, "Duplicate check-in audit must be suppressed");
  });

  it("undo check-in commits and audits; replay for already-undone pax suppresses duplicate audit", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    const checkInTime = "2026-09-18T12:00:00.000Z";

    // First check in passenger 0
    await repos.booking.completeCheckInWithReceipt({
      ref: "GZA4TQ",
      leg: "out",
      selectedPaxIndexes: [0],
      documents: { 0: "P GZA4TQ84213" },
      now: checkInTime,
    });

    // 1. Undo check-in for passenger 0
    const receipt1 = await executeAuditedAdminCommand({
      domainCommand: () =>
        repos.booking.undoCheckInWithReceipt({
          ref: "GZA4TQ",
          leg: "out",
          selectedPaxIndexes: [0],
        }),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "bookings",
        action: "undo_check_in",
        targetType: "booking",
        targetId: "GZA4TQ",
        metadata: {
          bookingRef: "GZA4TQ",
          leg: "out",
          paxIndex: 0,
        },
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt1.changed, true);
    let events = await repos.activity.list();
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "undo_check_in");

    // 2. Replay undo check-in for passenger 0 (already not checked in)
    const receipt2 = await executeAuditedAdminCommand({
      domainCommand: () =>
        repos.booking.undoCheckInWithReceipt({
          ref: "GZA4TQ",
          leg: "out",
          selectedPaxIndexes: [0],
        }),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "bookings",
        action: "undo_check_in",
        targetType: "booking",
        targetId: "GZA4TQ",
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt2.changed, false);
    events = await repos.activity.list();
    assert.equal(events.length, 1, "Duplicate undo check-in audit must be suppressed");
  });
});

describe("Admin Audit Orchestration — Customer Account & Claim", () => {
  it("customer account update with expectedEmail emits audit; identical replay suppresses duplicate audit", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    // Sign in passenger
    await repos.passenger.signIn("nadia.sabbagh@example.com", "Nadia", "Sabbagh");

    // 1. Update phone
    const receipt1 = await executeAuditedAdminCommand({
      domainCommand: () =>
        repos.passenger.updateAccountWithReceipt(
          { phone: "+970 59 111 2233" },
          { expectedEmail: "nadia.sabbagh@example.com" },
        ),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "commercial",
        action: "updated",
        targetType: "customer",
        targetId: "nadia.sabbagh@example.com",
        metadata: {
          email: "nadia.sabbagh@example.com",
          phone: "+970 59 111 2233",
        },
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt1.changed, true);
    let events = await repos.activity.list();
    assert.equal(events.length, 1);
    assert.equal(events[0].metadata?.phone, "+970 59 111 2233");

    // 2. Replay same phone
    const receipt2 = await executeAuditedAdminCommand({
      domainCommand: () =>
        repos.passenger.updateAccountWithReceipt(
          { phone: "+970 59 111 2233" },
          { expectedEmail: "nadia.sabbagh@example.com" },
        ),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "commercial",
        action: "updated",
        targetType: "customer",
        targetId: "nadia.sabbagh@example.com",
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt2.changed, false);
    events = await repos.activity.list();
    assert.equal(events.length, 1, "Duplicate account contact update must be suppressed");
  });

  it("booking claim emits audit on 'claimed'; replay emits zero audit events", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    // Guest booking without owner: let's update GZA9MK to have no ownerEmail
    await repos.booking.updateContact("GZA9MK", { email: "guest@example.com" });
    // Clear ownerEmail in storage
    const stored = JSON.parse(storage.getItem("gza.repo.v1")!);
    const idx = stored.bookings.findIndex((b: { ref: string }) => b.ref === "GZA9MK");
    delete stored.bookings[idx].ownerEmail;
    storage.setItem("gza.repo.v1", JSON.stringify(stored));

    // 1. Claim booking
    const result1 = await executeAuditedAdminCommand({
      domainCommand: () => repos.booking.claim("GZA9MK", "guest@example.com"),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "commercial",
        action: "updated",
        targetType: "booking",
        targetId: "GZA9MK",
        before: "guest",
        after: "guest@example.com",
        metadata: {
          bookingRef: "GZA9MK",
          accountEmail: "guest@example.com",
        },
      },
      isNoOp: (r) => r.status !== "claimed",
    });

    assert.equal(result1.status, "claimed");
    let events = await repos.activity.list();
    assert.equal(events.length, 1);
    assert.equal(events[0].metadata?.bookingRef, "GZA9MK");

    // 2. Replay claim for same booking -> returns "already-owned-by-user"
    const result2 = await executeAuditedAdminCommand({
      domainCommand: () => repos.booking.claim("GZA9MK", "guest@example.com"),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "commercial",
        action: "updated",
        targetType: "booking",
        targetId: "GZA9MK",
      },
      isNoOp: (r) => r.status !== "claimed",
    });

    assert.equal(result2.status, "already-owned-by-user");
    events = await repos.activity.list();
    assert.equal(events.length, 1, "Replay claim must not create duplicate audit event");
  });
});

describe("Admin Audit Orchestration — Operational Flight Overrides, Network & Schedules", () => {
  it("flight override quick edit: save audits; identical replay suppresses duplicate audit", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    // Outbound flight from initial seed booking GZA4TQ
    const flightId = "PS100-2026-09-19-out";
    const flightBefore = await repos.flight.getFlightById(flightId);
    assert.ok(flightBefore);

    // 1. Set override
    const changed1 = await executeAuditedAdminCommand({
      domainCommand: () =>
        repos.flight.setOverride(flightId, {
          gate: "B3",
          status: "Delayed",
        }),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "flights",
        action: "updated",
        targetType: "flight_override",
        targetId: flightId,
        metadata: {
          gate: "B3",
          status: "Delayed",
        },
      },
      isNoOp: (changed) => !changed,
    });

    assert.equal(changed1, true);
    let events = await repos.activity.list();
    assert.equal(events.length, 1);
    assert.equal(events[0].metadata?.gate, "B3");

    // 2. Replay exact same override
    const changed2 = await executeAuditedAdminCommand({
      domainCommand: () =>
        repos.flight.setOverride(flightId, {
          gate: "B3",
          status: "Delayed",
        }),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "flights",
        action: "updated",
        targetType: "flight_override",
        targetId: flightId,
      },
      isNoOp: (changed) => !changed,
    });

    assert.equal(changed2, false);
    events = await repos.activity.list();
    assert.equal(events.length, 1, "Duplicate flight override audit must be suppressed");
  });

  it("flight clear override: clear audits; clearing already-cleared flight suppresses duplicate audit", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    const flightId = "PS100-2026-09-19-out";

    // Set an override first
    await repos.flight.setOverride(flightId, { gate: "C1" });

    // 1. Clear override
    const cleared1 = await executeAuditedAdminCommand({
      domainCommand: () => repos.flight.clearOverride(flightId),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "flights",
        action: "cleared",
        targetType: "flight_override",
        targetId: flightId,
      },
      isNoOp: (cleared) => !cleared,
    });

    assert.equal(cleared1, true);
    let events = await repos.activity.list();
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "cleared");

    // 2. Clear already-cleared override
    const cleared2 = await executeAuditedAdminCommand({
      domainCommand: () => repos.flight.clearOverride(flightId),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "flights",
        action: "cleared",
        targetType: "flight_override",
        targetId: flightId,
      },
      isNoOp: (cleared) => !cleared,
    });

    assert.equal(cleared2, false);
    events = await repos.activity.list();
    assert.equal(events.length, 1, "Clearing non-existent override must be suppressed");
  });

  it("network destination: update audits; identical replay suppresses duplicate audit", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    // 1. Update destination AMM
    const receipt1 = await executeAuditedAdminCommand({
      domainCommand: () => repos.network.updateWithReceipt("AMM", { blockMinutes: 65 }),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "network",
        action: "updated",
        targetType: "destination",
        targetId: "AMM",
        metadata: { code: "AMM" },
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt1.changed, true);
    let events = await repos.activity.list();
    assert.equal(events.length, 1);

    // 2. Replay exact same blockMinutes
    const receipt2 = await executeAuditedAdminCommand({
      domainCommand: () => repos.network.updateWithReceipt("AMM", { blockMinutes: 65 }),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "network",
        action: "updated",
        targetType: "destination",
        targetId: "AMM",
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt2.changed, false);
    events = await repos.activity.list();
    assert.equal(events.length, 1, "Identical network update must be suppressed");
  });

  it("schedule: update audits; identical replay suppresses duplicate audit", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    const schedulesList = await repos.schedule.list();
    assert.ok(schedulesList.length > 0);
    const targetSchedule = schedulesList[0];

    // 1. Update schedule active flag
    const nextActive = !targetSchedule.active;
    const receipt1 = await executeAuditedAdminCommand({
      domainCommand: () =>
        repos.schedule.updateWithReceipt(targetSchedule.id, { active: nextActive }),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "schedules",
        action: "updated",
        targetType: "schedule",
        targetId: targetSchedule.id,
        metadata: {
          number: targetSchedule.number,
          active: nextActive,
        },
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt1.changed, true);
    let events = await repos.activity.list();
    assert.equal(events.length, 1);

    // 2. Replay identical schedule active flag
    const receipt2 = await executeAuditedAdminCommand({
      domainCommand: () =>
        repos.schedule.updateWithReceipt(targetSchedule.id, { active: nextActive }),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "schedules",
        action: "updated",
        targetType: "schedule",
        targetId: targetSchedule.id,
      },
      isNoOp: (r) => !r.changed,
    });

    assert.equal(receipt2.changed, false);
    events = await repos.activity.list();
    assert.equal(events.length, 1, "Identical schedule update must be suppressed");
  });
});

describe("Admin Audit Orchestration — recordAdminAudit helper", () => {
  it("records direct audit event and returns true on success", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    const ok = await recordAdminAudit(repos.activity, SAMPLE_ACTOR, {
      module: "session",
      action: "signin",
      targetType: "session",
      targetId: "adm-1",
      metadata: { role: "admin" },
    });

    assert.equal(ok, true);
    const events = await repos.activity.list();
    assert.equal(events.length, 1);
    assert.equal(events[0].module, "session");
    assert.equal(events[0].action, "signin");
  });

  it("returns false and emits warning without throwing if append fails", async () => {
    const failingRepo: ActivityRepository = {
      list: async () => [],
      getById: async () => null,
      clear: async () => {},
      subscribe: () => () => {},
      append: async () => {
        throw new Error("Disk error");
      },
    };

    let warningCalled = false;
    const ok = await recordAdminAudit(
      failingRepo,
      SAMPLE_ACTOR,
      {
        module: "session",
        action: "signin",
        targetType: "session",
        targetId: "adm-1",
      },
      () => {
        warningCalled = true;
      },
    );

    assert.equal(ok, false);
    assert.equal(warningCalled, true);
  });

  it("returns false without attempting append if actor is null", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    const ok = await recordAdminAudit(repos.activity, null, {
      module: "session",
      action: "signin",
      targetType: "session",
      targetId: "guest",
    });

    assert.equal(ok, false);
    const events = await repos.activity.list();
    assert.equal(events.length, 0);
  });
});

describe("Admin Audit Orchestration — Commercial Catalog, Detached State & Locked Receipt Truth", () => {
  it("detached actor and static event: mutating actor or static event while domainCommand awaits does not alter audited event", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    const mutableActor: ActivityActorSnapshot = {
      id: "adm-1",
      name: { en: "Rana Habib", ar: "رنا حبيب" },
      email: "rana.habib@gza.ps",
      role: "admin",
    };

    const mutableEvent = {
      module: "commercial" as const,
      action: "updated" as const,
      targetType: "catalog",
      targetId: "cat-1",
      metadata: { field: "initial" } as Record<string, string>,
    };

    await executeAuditedAdminCommand({
      domainCommand: async () => {
        // Concurrently mutate external references during await
        mutableActor.role = "viewer";
        mutableActor.name = { en: "Hacked", ar: "مخترق" };
        mutableEvent.metadata.field = "mutated";
        return { ok: true };
      },
      activityRepo: repos.activity,
      actor: mutableActor,
      event: mutableEvent,
    });

    const events = await repos.activity.list();
    assert.equal(events.length, 1);
    assert.equal(
      events[0]?.actor.role,
      "admin",
      "Audited actor role must remain detached snapshot",
    );
    assert.equal(events[0]?.actor.name.en, "Rana Habib");
    assert.equal(
      events[0]?.metadata?.["field"],
      "initial",
      "Audited metadata must remain detached snapshot",
    );
  });

  it("commercial catalog: activate/retire no-op generates zero audit events", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    // Initial meal is active
    const snapshot = await repos.commercial.get();
    const meal = snapshot.catalog.meals[0]!;
    assert.equal(meal.active, true);

    // Call updateMealWithReceipt with same active status (no-op)
    await executeAuditedAdminCommand({
      domainCommand: () => repos.commercial.updateMealWithReceipt(meal.id, { active: true }),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "commercial",
        action: "status_changed",
        targetType: "meal",
        targetId: meal.id,
      },
      isNoOp: (receipt) => !receipt.changed,
    });

    const events = await repos.activity.list();
    assert.equal(events.length, 0, "No-op meal status change must emit zero audit events");
  });

  it("commercial catalog: setDefaultMeal no-op generates zero audit events", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    const snapshot = await repos.commercial.get();
    const defaultId = snapshot.catalog.defaultMealId;

    // Setting same defaultMealId is a no-op
    await executeAuditedAdminCommand({
      domainCommand: () => repos.commercial.setDefaultMealWithReceipt(defaultId),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "commercial",
        action: "updated",
        targetType: "default_meal",
        targetId: defaultId,
      },
      isNoOp: (receipt) => !receipt.changed,
    });

    const events = await repos.activity.list();
    assert.equal(events.length, 0, "Setting identical default meal must emit zero audit events");
  });

  it("commercial catalog: reorderMeals no-op generates zero audit events", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    const snapshot = await repos.commercial.get();
    const currentIds = snapshot.catalog.meals.map((m) => m.id);

    // Reordering with identical order is a no-op
    await executeAuditedAdminCommand({
      domainCommand: () => repos.commercial.reorderMealsWithReceipt(currentIds),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: {
        module: "commercial",
        action: "updated",
        targetType: "meal_order",
        targetId: "meals",
      },
      isNoOp: (receipt) => !receipt.changed,
    });

    const events = await repos.activity.list();
    assert.equal(events.length, 0, "Identical meal reorder must emit zero audit events");
  });

  it("staff role change: derives truthful before:admin from locked receipt when UI row was stale", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    // Create staff member starting as editor
    const user = await repos.staff.create({
      name: { en: "Test Member", ar: "عضو تجريبي" },
      email: "test.member@gza.ps",
      role: "editor",
      status: "active",
    });

    // In background, another admin upgrades user to admin
    await repos.staff.updateRole(user.id, "admin");

    // Stale UI row thinks user is still "editor", and attempts to set role to "viewer"
    const staleUIRowRole = "editor";
    await executeAuditedAdminCommand({
      domainCommand: () => repos.staff.updateRoleWithReceipt(user.id, "viewer"),
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      event: (receipt) => ({
        module: "staff",
        action: "role_changed",
        targetType: "staff",
        targetId: receipt.member.id,
        before: receipt.beforeRole ?? staleUIRowRole,
        after: receipt.member.role,
      }),
      isNoOp: (receipt) => !receipt.changed,
    });

    const events = await repos.activity.list();
    assert.equal(events.length, 1);
    assert.equal(
      events[0]?.before,
      "admin",
      "Truthful before role must come from locked command receipt ('admin'), not stale UI row ('editor')",
    );
    assert.equal(events[0]?.after, "viewer");
  });
});
