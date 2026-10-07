import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AdminSessionCoordinator, LocalStaffRepository, StaffStorageCoordinator } from "../../src/lib/staff/index.ts";
import { ActivityStorageCoordinator, LocalActivityRepository, executeAuditedAdminCommand } from "../../src/lib/activity/index.ts";
import type { ActivityEvent } from "../../src/lib/activity/types.ts";
import { customerActivityEvents } from "../../src/lib/customer-directory/activity.ts";
import { createRepositories } from "../../src/lib/repositories/registry.ts";
import { MOCK_PASSPHRASE } from "../../src/lib/admin.ts";

function storageFixture(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}
function barrier() {
  let release!: () => void;
  let enter!: () => void;
  return { wait: new Promise<void>((r) => { release = r; }), entered: new Promise<void>((r) => { enter = r; }), release: () => release(), enter: () => enter() };
}
function fixture() {
  const storage = storageFixture();
  const staff = new LocalStaffRepository(new StaffStorageCoordinator({ storage }));
  const activity = new LocalActivityRepository(new ActivityStorageCoordinator({ storage }));
  const session = new AdminSessionCoordinator({ storage, staffRepo: staff, activityRepo: activity });
  return { storage, staff, activity, session };
}
const actor = { id: "adm-1", name: { en: "Rana", ar: "رنا" }, email: "rana.habib@gza.ps", role: "admin" as const };

describe("Correction 05 persisted session revocation", () => {
  it("active stored identity resumes and compatible fields survive", async () => {
    const { storage, session } = fixture();
    const raw = JSON.stringify({ staffId: "adm-1", compatible: { keep: true } });
    storage.setItem("gza.admin.v1", raw);
    await session.resolveCurrentSession();
    assert.equal(session.staff?.id, "adm-1");
    assert.equal(storage.getItem("gza.admin.v1"), raw);
    session.destroy();
  });
  for (const id of ["adm-2", "missing-staff"]) {
    it(`${id}: revoked pointer is cleared and re-enable cannot restore it on reload`, async () => {
      const { storage, staff, activity, session } = fixture();
      if (id === "adm-2") await staff.setStatus(id, "disabled");
      storage.setItem("gza.admin.v1", JSON.stringify({ staffId: id, compatible: { keep: true } }));
      await session.resolveCurrentSession();
      assert.equal(session.staff, null);
      assert.equal(session.ready, true);
      assert.deepEqual(JSON.parse(storage.getItem("gza.admin.v1")!), { staffId: null, compatible: { keep: true } });
      if (id === "adm-2") await staff.setStatus(id, "active");
      const reload = new AdminSessionCoordinator({ storage, staffRepo: staff, activityRepo: activity });
      await reload.resolveCurrentSession();
      assert.equal(reload.staff, null);
      session.destroy(); reload.destroy();
    });
  }
  it("Studio does not clear a missing production pointer; normal runtime clears only identity", async () => {
    const { storage, staff, activity, session } = fixture();
    const raw = JSON.stringify({ staffId: "missing-staff", compatible: { keep: true } });
    storage.setItem("gza.admin.v1", raw);
    const preview = new AdminSessionCoordinator({ storage, staffRepo: staff, activityRepo: activity, isStudioPreview: true });
    await preview.resolveCurrentSession();
    assert.equal(storage.getItem("gza.admin.v1"), raw);
    assert.equal(preview.staff, null);
    await session.resolveCurrentSession();
    assert.deepEqual(JSON.parse(storage.getItem("gza.admin.v1")!), { staffId: null, compatible: { keep: true } });
    preview.destroy(); session.destroy();
  });
  it("stale async resolution cannot clear a newer successful session", async () => {
    const { storage, staff, session } = fixture();
    const held = barrier();
    const get = staff.getById.bind(staff);
    staff.getById = async (id) => { if (id === "missing-staff") { held.enter(); await held.wait; return null; } return get(id); };
    storage.setItem("gza.admin.v1", JSON.stringify({ staffId: "missing-staff", compatible: true }));
    const old = session.resolveCurrentSession();
    await held.entered;
    assert.equal((await session.signIn("yousef.nasser@gza.ps", MOCK_PASSPHRASE)).ok, true);
    const raw = storage.getItem("gza.admin.v1");
    held.release(); await old;
    assert.equal(session.staff?.id, "adm-2");
    assert.equal(storage.getItem("gza.admin.v1"), raw);
    session.destroy();
  });
  it("pending revoked lookup preserves a newer cross-tab pointer and fresh compatible fields", async () => {
    const { storage, staff, session } = fixture();
    const held = barrier();
    staff.getById = async () => { held.enter(); await held.wait; return null; };
    storage.setItem("gza.admin.v1", JSON.stringify({ staffId: "missing" }));
    const pending = session.resolveCurrentSession(); await held.entered;
    const raw = JSON.stringify({ staffId: "adm-2", newCompatible: "retain" });
    storage.setItem("gza.admin.v1", raw);
    held.release(); await pending;
    assert.equal(storage.getItem("gza.admin.v1"), raw);
    session.destroy();
  });
});

describe("Correction 05 sign-in failure taxonomy", () => {
  it("unknown, disabled and wrong passphrase remain identity failures", async () => {
    const { staff, session } = fixture();
    assert.equal((await session.signIn("unknown@example.com", MOCK_PASSPHRASE)).error, "unknown");
    await staff.setStatus("adm-2", "disabled");
    assert.equal((await session.signIn("yousef.nasser@gza.ps", MOCK_PASSPHRASE)).error, "unknown");
    assert.equal((await session.signIn("rana.habib@gza.ps", "wrong")).error, "pass");
    session.destroy();
  });
  for (const mode of ["corrupt", "read-denied", "write-denied"]) {
    it(`${mode} canonical Staff authority is unavailable, never an unknown email`, async () => {
      const { storage, activity, session } = fixture();
      if (mode === "corrupt") storage.setItem("gza.staff.v1", "{broken");
      if (mode === "read-denied") { const get = storage.getItem; storage.getItem = (key) => { if (key === "gza.staff.v1") throw new Error("denied"); return get(key); }; }
      if (mode === "write-denied") { const set = storage.setItem; storage.setItem = (key, value) => { if (key === "gza.staff.v1") throw new Error("quota"); set(key, value); }; }
      const raw = storage.getItem("gza.admin.v1");
      assert.equal((await session.signIn("rana.habib@gza.ps", MOCK_PASSPHRASE)).error, "directory_unavailable");
      assert.equal(session.staff, null);
      assert.equal(storage.getItem("gza.admin.v1"), raw);
      assert.equal((await activity.list()).length, 0);
      if (mode === "corrupt") assert.equal(storage.getItem("gza.staff.v1"), "{broken");
      session.destroy();
    });
  }
  it("required session persistence failure reports storage unavailable", async () => {
    const { storage, session } = fixture();
    const set = storage.setItem;
    storage.setItem = (key, value) => { if (key === "gza.admin.v1") throw new Error("quota"); set(key, value); };
    assert.equal((await session.signIn("rana.habib@gza.ps", MOCK_PASSPHRASE)).error, "storage_unavailable");
    assert.equal(session.staff, null);
    session.destroy();
  });
});

describe("Correction 05 canonical contact receipt and customer history", () => {
  it("two writers receive the actual committed pre-contact, detached from history, and no-op audits are suppressed", async () => {
    const storage = storageFixture();
    const a = createRepositories({ storage }), b = createRepositories({ storage });
    const ref = "GZA4TQ";
    const old = (await a.booking.getByRef(ref))!;
    assert.ok(old);
    await b.booking.updateContact(ref, { email: "other-writer@example.com", phone: "+970599111111" });
    const historical = (await b.booking.getByRef(ref))!;
    const command = () => executeAuditedAdminCommand({
      domainCommand: () => a.booking.updateContactWithReceipt(ref, { email: "guest-new@example.com", phone: " +970599222222 " }),
      activityRepo: a.activity,
      actor,
      event: (receipt) => ({ module: "commercial", action: "updated", targetType: "guest_contact", targetId: ref,
        before: `${receipt.beforeContact.email} / ${receipt.beforeContact.phone ?? ""}`,
        after: `${receipt.booking.contact.email} / ${receipt.booking.contact.phone ?? ""}` }),
      isNoOp: (r) => !r.changed,
    });
    const receipt = await command();
    assert.deepEqual(receipt.beforeContact, { email: "other-writer@example.com", phone: "+970599111111" });
    assert.equal(receipt.booking.contact.email, "guest-new@example.com");
    const events = await a.activity.list();
    assert.equal(events.length, 1);
    assert.equal(events[0]?.before, "other-writer@example.com / +970599111111");
    assert.equal(events[0]?.after, "guest-new@example.com / +970599222222");
    receipt.beforeContact.email = "caller-change@example.com";
    receipt.booking.contact.email = "caller-change@example.com";
    assert.equal((await createRepositories({ storage }).booking.getByRef(ref))?.contact.email, "guest-new@example.com");
    const noOp = await command();
    assert.equal(noOp.changed, false);
    assert.deepEqual(noOp.beforeContact, noOp.booking.contact);
    assert.equal((await a.activity.list()).length, 1);
    assert.deepEqual((await a.booking.getByRef(ref))?.seatLayouts, old.seatLayouts);
    assert.deepEqual((await a.booking.getByRef(ref))?.pricingSnapshot, historical.pricingSnapshot);
  });
  it("account direct and canonical PNR events appear in chronological order; unrelated events and actor email do not", () => {
    const account = { id: "cus_acc_token", type: "account" as const, email: "owner@example.com", refs: ["PNR-A"] };
    const event = (id: string, targetType: string, targetId: string, timestamp: string): ActivityEvent => ({ id, actor, module: "commercial", action: "updated", targetType, targetId, timestamp });
    const events = [
      event("old", "customer", account.email, "2026-10-01T10:00:00Z"),
      event("new", "booking_contact", "PNR-A", "2026-10-02T10:00:00Z"),
      event("unrelated", "booking", "PNR-B", "2026-10-03T10:00:00Z"),
      event("route", "account", account.id, "2026-10-02T11:00:00+02:00"),
      event("staff", "staff", account.email, "2026-10-04T10:00:00Z"),
    ];
    assert.deepEqual(customerActivityEvents(events, account).map((e) => e.id), ["new", "route", "old"]);
    assert.deepEqual(customerActivityEvents(events, { ...account, type: "guest" }).map((e) => e.id), ["new"]);
    assert.deepEqual(customerActivityEvents(events, { ...account, type: "guest", refs: [] }), []);
    assert.equal(events[0]?.id, "old", "projection does not reorder the input");
  });
});
