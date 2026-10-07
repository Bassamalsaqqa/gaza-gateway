import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AdminSessionCoordinator, LocalStaffRepository, StaffStorageCoordinator } from "../../src/lib/staff/index.ts";
import { ActivityStorageCoordinator, LocalActivityRepository, executeAuditedAdminCommand } from "../../src/lib/activity/index.ts";
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
function sessionFixture() {
  const storage = storageFixture();
  const staff = new LocalStaffRepository(new StaffStorageCoordinator({ storage }));
  const activity = new LocalActivityRepository(new ActivityStorageCoordinator({ storage }));
  const session = new AdminSessionCoordinator({ storage, staffRepo: staff, activityRepo: activity });
  return { storage, staff, activity, session };
}

describe("Phase 6C Correction 04 session command ownership", () => {
  it("obsolete audit completion leaves the newer session intact in memory and on reload", async () => {
    const { storage, staff, activity, session } = sessionFixture();
    const held = barrier();
    const append = activity.append.bind(activity);
    activity.append = async (input) => {
      if (input.actor.id === "adm-1") { held.enter(); await held.wait; }
      return append(input);
    };
    const obsolete = session.signIn("rana.habib@gza.ps", MOCK_PASSPHRASE);
    await held.entered;
    session.signOut();
    assert.equal((await session.signIn("yousef.nasser@gza.ps", MOCK_PASSPHRASE)).ok, true);
    const committed = storage.getItem("gza.admin.v1");
    held.release();
    assert.equal((await obsolete).ok, false);
    assert.equal(storage.getItem("gza.admin.v1"), committed);
    assert.equal(session.staff?.id, "adm-2");
    const reload = new AdminSessionCoordinator({ storage, staffRepo: staff, activityRepo: activity });
    await reload.resolveCurrentSession();
    assert.equal(reload.staff?.id, "adm-2");
    session.destroy(); reload.destroy();
  });

  it("obsolete work cannot erase the newer pending sign-in identity", async () => {
    const { storage, staff, activity, session } = sessionFixture();
    const oldAudit = barrier(), newTouch = barrier();
    const append = activity.append.bind(activity), touch = staff.touchLastActive.bind(staff);
    activity.append = async (input) => { if (input.actor.id === "adm-1") { oldAudit.enter(); await oldAudit.wait; } return append(input); };
    staff.touchLastActive = async (id, timestamp) => { if (id === "adm-2") { newTouch.enter(); await newTouch.wait; } return touch(id, timestamp); };
    const old = session.signIn("rana.habib@gza.ps", MOCK_PASSPHRASE);
    await oldAudit.entered; session.signOut();
    const next = session.signIn("yousef.nasser@gza.ps", MOCK_PASSPHRASE);
    await newTouch.entered; oldAudit.release();
    assert.equal((await old).ok, false);
    await staff.setStatus("adm-2", "disabled");
    newTouch.release();
    assert.equal((await next).ok, false);
    assert.equal(session.staff, null);
    assert.equal(JSON.parse(storage.getItem("gza.admin.v1")!).staffId, null);
    session.destroy();
  });

  it("late failed canonical verification cannot revoke a newer session", async () => {
    const { storage, staff, activity, session } = sessionFixture();
    const finalRead = barrier();
    const original = staff.getById.bind(staff);
    let completedAudit = false;
    const append = activity.append.bind(activity);
    activity.append = async (input) => { const result = await append(input); if (input.actor.id === "adm-1") completedAudit = true; return result; };
    staff.getById = async (id) => { if (id === "adm-1" && completedAudit) { finalRead.enter(); await finalRead.wait; throw new Error("obsolete read failed"); } return original(id); };
    const old = session.signIn("rana.habib@gza.ps", MOCK_PASSPHRASE);
    await finalRead.entered; session.signOut();
    assert.equal((await session.signIn("yousef.nasser@gza.ps", MOCK_PASSPHRASE)).ok, true);
    const committed = storage.getItem("gza.admin.v1"); finalRead.release();
    assert.equal((await old).ok, false);
    assert.equal(session.staff?.id, "adm-2");
    assert.equal(storage.getItem("gza.admin.v1"), committed);
    session.destroy();
  });

  it("a delayed role refresh cannot replace a more recent canonical role", async () => {
    const { staff, session } = sessionFixture();
    await session.signIn("yousef.nasser@gza.ps", MOCK_PASSPHRASE);
    const held = barrier();
    const original = staff.getById.bind(staff);
    let holdNext = true;
    staff.getById = async (id) => { const result = await original(id); if (holdNext) { holdNext = false; held.enter(); await held.wait; } return result; };
    await staff.updateRole("adm-2", "admin"); await held.entered;
    await staff.updateRole("adm-2", "viewer");
    await new Promise<void>((r) => setImmediate(r));
    assert.equal(session.staff?.role, "viewer");
    held.release(); await new Promise<void>((r) => setImmediate(r));
    assert.equal(session.staff?.role, "viewer");
    session.destroy();
  });
});

describe("Phase 6C Correction 04 catalog order receipts", () => {
  for (const kind of ["meals", "assistance"] as const) {
    it(`${kind}: change, replay and restore have exact revisions, notifications and audit counts`, async () => {
      const repos = createRepositories({ inMemoryOnly: true });
      const initial = (await repos.commercial.get()).catalog[kind].map((o) => o.id);
      const reordered = [...initial].reverse();
      const actor = await repos.staff.getById("adm-1"); assert.ok(actor);
      let notifications = 0;
      const unsub = repos.commercial.subscribe(() => notifications++);
      const command = (ids: string[]) => executeAuditedAdminCommand({
        domainCommand: () => kind === "meals" ? repos.commercial.reorderMealsWithReceipt(ids) : repos.commercial.reorderAssistanceWithReceipt(ids),
        actor, activityRepo: repos.activity,
        event: { module: "commercial", action: "updated", targetType: "catalog_order", targetId: kind },
        isNoOp: (receipt) => !receipt.changed,
      });
      const first = await command(reordered), replay = await command(reordered), restore = await command(initial);
      assert.deepEqual([first.changed, replay.changed, restore.changed], [true, false, true]);
      assert.deepEqual([first.result.revision, replay.result.revision, restore.result.revision], [1, 1, 2]);
      assert.equal(notifications, 2);
      assert.equal((await repos.activity.list()).length, 2);
      unsub();
    });
    it(`${kind}: two canonical writers of identical order record only the actual change`, async () => {
      const storage = storageFixture();
      const a = createRepositories({ storage }), b = createRepositories({ storage });
      const ids = (await a.commercial.get()).catalog[kind].map((o) => o.id).reverse();
      const actor = await a.staff.getById("adm-1"); assert.ok(actor);
      const command = (repos: typeof a) => executeAuditedAdminCommand({
        domainCommand: () => kind === "meals" ? repos.commercial.reorderMealsWithReceipt(ids) : repos.commercial.reorderAssistanceWithReceipt(ids),
        actor, activityRepo: repos.activity,
        event: { module: "commercial", action: "updated", targetType: "catalog_order", targetId: kind },
        isNoOp: (receipt) => !receipt.changed,
      });
      const receipts = await Promise.all([command(a), command(b)]);
      assert.deepEqual(receipts.map((r) => r.changed), [true, false]);
      assert.equal((await a.activity.list()).length, 1);
      assert.equal((await b.commercial.get()).revision, 1);
    });
  }
});
