/**
 * Gaza Gateway — Canonical Admin Session Coordinator Unit Tests (Phase 6C)
 *
 * Tests the session coordinator against real staff and activity repositories:
 * 1. Monotonic epoch protection: delayed sign-in while concurrent sign-out occurs
 *    does not commit session to storage or resurrect authority on reload.
 * 2. Successful sign-in: sets in-memory authority, writes storage, logs audit.
 * 3. Authority revocation: staff demotion/disablement/deletion immediately revokes session.
 * 4. Directory corruption: fail-closed, revokes session, directoryUnavailable flag set.
 * 5. Studio isolation: operates in memory, zero localStorage mutations.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AdminSessionCoordinator,
  ADMIN_STORAGE_KEY,
  LocalStaffRepository,
  StaffStorageCoordinator,
} from "../../src/lib/staff/index.ts";
import {
  LocalActivityRepository,
  ActivityStorageCoordinator,
} from "../../src/lib/activity/index.ts";
import { MOCK_PASSPHRASE } from "../../src/lib/admin.ts";

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

describe("Admin Session Coordinator — Monotonic Epoch & Anti-Resurrection", () => {
  it("delayed sign-in interrupted by sign-out: no storage persistence, no audit event, no resurrected authority on reload", async () => {
    const storage = createMockStorage();
    const staffCoord = new StaffStorageCoordinator({ storage });
    const staffRepo = new LocalStaffRepository(staffCoord);
    const activityCoord = new ActivityStorageCoordinator({ storage });
    const activityRepo = new LocalActivityRepository(activityCoord);

    // Initial directory has Tariq as active admin
    const tariq = await staffRepo.create({
      name: { en: "Tariq Mansour", ar: "طارق منصور" },
      email: "tariq.mansour@gza.ps",
      role: "admin",
      status: "active",
    });

    // Intercept touchLastActive to delay it
    let releaseTouchPromise!: () => void;
    let touchEnteredResolve!: () => void;
    const touchEntered = new Promise<void>((resolve) => {
      touchEnteredResolve = resolve;
    });
    const touchBarrier = new Promise<void>((resolve) => {
      releaseTouchPromise = resolve;
    });

    const originalTouch = staffRepo.touchLastActive.bind(staffRepo);
    staffRepo.touchLastActive = async (id: string, timestamp?: string) => {
      touchEnteredResolve();
      await touchBarrier;
      return originalTouch(id, timestamp);
    };

    const sessionCoord = new AdminSessionCoordinator({
      storage,
      staffRepo,
      activityRepo,
    });

    // Start sign-in in background (will pause at touchLastActive)
    let auditWarningEmitted = false;
    const signInPromise = sessionCoord.signIn("tariq.mansour@gza.ps", MOCK_PASSPHRASE, () => {
      auditWarningEmitted = true;
    });

    // Await proof that touch barrier was reached before applying concurrent change
    await touchEntered;

    // While sign-in is pending, user signs out
    sessionCoord.signOut();
    assert.equal(sessionCoord.staff, null);

    // Now release touchLastActive
    releaseTouchPromise();
    const result = await signInPromise;

    // Sign-in must be rejected
    assert.equal(result.ok, false);
    assert.equal(sessionCoord.staff, null, "In-memory session must remain null");

    // Storage must NOT contain Tariq's staff ID
    const rawStored = storage.getItem(ADMIN_STORAGE_KEY);
    if (rawStored) {
      const parsed = JSON.parse(rawStored);
      assert.notEqual(parsed.staffId, tariq.id, "Stale staffId must not be stored");
    }

    // Zero session audit events logged
    const activities = await activityRepo.list();
    const sessionEvents = activities.filter((a) => a.module === "session");
    assert.equal(sessionEvents.length, 0, "No audit event should be recorded for obsolete sign-in");
    assert.equal(auditWarningEmitted, false);

    // Simulate page reload: new coordinator reading from storage
    const reloadedCoord = new AdminSessionCoordinator({
      storage,
      staffRepo,
      activityRepo,
    });
    await reloadedCoord.resolveCurrentSession();

    assert.equal(reloadedCoord.staff, null, "Authority must NOT be resurrected on page reload");
  });

  it("successful sign-in establishes session, writes storage, and records audit event", async () => {
    const storage = createMockStorage();
    const staffCoord = new StaffStorageCoordinator({ storage });
    const staffRepo = new LocalStaffRepository(staffCoord);
    const activityCoord = new ActivityStorageCoordinator({ storage });
    const activityRepo = new LocalActivityRepository(activityCoord);

    const rana = await staffRepo.create({
      name: { en: "Fatima Said", ar: "فاطمة سعيد" },
      email: "fatima.said@gza.ps",
      role: "admin",
      status: "active",
    });

    const sessionCoord = new AdminSessionCoordinator({
      storage,
      staffRepo,
      activityRepo,
    });

    const result = await sessionCoord.signIn("fatima.said@gza.ps", MOCK_PASSPHRASE);
    assert.equal(result.ok, true);
    assert.equal(sessionCoord.staff?.id, rana.id);
    assert.equal(sessionCoord.actor?.email, "fatima.said@gza.ps");

    // Stored session has staffId
    const stored = JSON.parse(storage.getItem(ADMIN_STORAGE_KEY)!);
    assert.equal(stored.staffId, rana.id);

    // Audit event recorded
    const activities = await activityRepo.list();
    const signinEvent = activities.find((a) => a.module === "session" && a.action === "signin");
    assert.ok(signinEvent);
    assert.equal(signinEvent.targetId, rana.id);
  });

  it("revokes session immediately when staff member is disabled or demoted in background", async () => {
    const storage = createMockStorage();
    const staffCoord = new StaffStorageCoordinator({ storage });
    const staffRepo = new LocalStaffRepository(staffCoord);
    const activityCoord = new ActivityStorageCoordinator({ storage });
    const activityRepo = new LocalActivityRepository(activityCoord);

    // Create another admin to satisfy last-admin invariant
    await staffRepo.create({
      name: { en: "Admin Backup", ar: "مسؤول بديل" },
      email: "backup@gza.ps",
      role: "admin",
      status: "active",
    });

    const user = await staffRepo.create({
      name: { en: "Sami Editor", ar: "سامي محرر" },
      email: "sami@gza.ps",
      role: "editor",
      status: "active",
    });

    const sessionCoord = new AdminSessionCoordinator({
      storage,
      staffRepo,
      activityRepo,
    });

    await sessionCoord.signIn("sami@gza.ps", MOCK_PASSPHRASE);
    assert.equal(sessionCoord.staff?.id, user.id);

    // Change role in staff repo: session updates
    await staffRepo.updateRole(user.id, "viewer");
    // Give async subscriber microtask a tick to execute
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(sessionCoord.staff?.role, "viewer");

    // Disable staff member in staff repo: session revoked immediately
    await staffRepo.setStatus(user.id, "disabled");
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(sessionCoord.staff, null, "Disabled member must have session revoked");

    // Storage must be cleared
    const stored = JSON.parse(storage.getItem(ADMIN_STORAGE_KEY)!);
    assert.equal(stored.staffId, null);
  });

  it("revokes session immediately on directory corruption (fail-closed)", async () => {
    const storage = createMockStorage();
    const staffCoord = new StaffStorageCoordinator({ storage });
    const staffRepo = new LocalStaffRepository(staffCoord);
    const activityCoord = new ActivityStorageCoordinator({ storage });
    const activityRepo = new LocalActivityRepository(activityCoord);

    const user = await staffRepo.create({
      name: { en: "Test Admin", ar: "مسؤول تجريبي" },
      email: "test.admin@gza.ps",
      role: "admin",
      status: "active",
    });

    const sessionCoord = new AdminSessionCoordinator({
      storage,
      staffRepo,
      activityRepo,
    });

    await sessionCoord.signIn("test.admin@gza.ps", MOCK_PASSPHRASE);
    assert.equal(sessionCoord.staff?.id, user.id);

    // Corrupt the staff storage key directly
    storage.setItem("gza.staff.v1", "corrupt { invalid json");

    // Trigger repo notification via coordinator
    staffCoord.notify();
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(sessionCoord.staff, null, "Corrupt directory must revoke session");
    assert.equal(sessionCoord.directoryUnavailable, true, "Directory must report unavailable");
  });

  it("operates in memory in Studio preview mode without touching storage", async () => {
    const storage = createMockStorage();
    const staffCoord = new StaffStorageCoordinator({ storage });
    const staffRepo = new LocalStaffRepository(staffCoord);
    const activityCoord = new ActivityStorageCoordinator({ storage });
    const activityRepo = new LocalActivityRepository(activityCoord);

    await staffRepo.create({
      name: { en: "Studio Admin", ar: "مسؤول الاستوديو" },
      email: "studio@gza.ps",
      role: "admin",
      status: "active",
    });

    const sessionCoord = new AdminSessionCoordinator({
      storage,
      staffRepo,
      activityRepo,
      isStudioPreview: true,
    });

    const result = await sessionCoord.signIn("studio@gza.ps", MOCK_PASSPHRASE);
    assert.equal(result.ok, true);
    assert.equal(sessionCoord.staff?.email, "studio@gza.ps");

    // LocalStorage must have zero writes
    assert.equal(storage.getItem(ADMIN_STORAGE_KEY), null, "Studio preview must not write to storage");
  });

  it("held audit append wait: member disabled by backup admin during append fails sign-in, clears storage, leaves authority revoked", async () => {
    const storage = createMockStorage();
    const staffCoord = new StaffStorageCoordinator({ storage });
    const staffRepo = new LocalStaffRepository(staffCoord);
    const activityCoord = new ActivityStorageCoordinator({ storage });
    const activityRepo = new LocalActivityRepository(activityCoord);

    await staffRepo.create({
      name: { en: "Admin Backup", ar: "مسؤول بديل" },
      email: "backup@gza.ps",
      role: "admin",
      status: "active",
    });

    const rana = (await staffRepo.getByEmail("rana.habib@gza.ps"))!;

    let releaseAppend!: () => void;
    let appendEnteredResolve!: () => void;
    const appendEntered = new Promise<void>((r) => (appendEnteredResolve = r));
    const appendBarrier = new Promise<void>((r) => (releaseAppend = r));

    const originalAppend = activityRepo.append.bind(activityRepo);
    activityRepo.append = async (input) => {
      appendEnteredResolve();
      await appendBarrier;
      return originalAppend(input);
    };

    const sessionCoord = new AdminSessionCoordinator({
      storage,
      staffRepo,
      activityRepo,
    });

    const signInPromise = sessionCoord.signIn("rana.habib@gza.ps", MOCK_PASSPHRASE);

    // Wait until sign-in has entered activityRepo.append
    await appendEntered;

    // Concurrently disable Rana via staffRepo with backup admin present
    await staffRepo.setStatus(rana.id, "disabled");

    // Release append
    releaseAppend();
    const result = await signInPromise;

    // Sign-in must be rejected
    assert.equal(result.ok, false);
    assert.equal(sessionCoord.staff, null, "Disabled member authority must not be resurrected");

    // Storage must NOT hold rana.id
    const rawStored = storage.getItem(ADMIN_STORAGE_KEY);
    if (rawStored) {
      const parsed = JSON.parse(rawStored);
      assert.notEqual(parsed.staffId, rana.id);
    }
  });

  it("held audit append wait: member demoted during append updates session to canonical new role", async () => {
    const storage = createMockStorage();
    const staffCoord = new StaffStorageCoordinator({ storage });
    const staffRepo = new LocalStaffRepository(staffCoord);
    const activityCoord = new ActivityStorageCoordinator({ storage });
    const activityRepo = new LocalActivityRepository(activityCoord);

    await staffRepo.create({
      name: { en: "Admin Backup", ar: "مسؤول بديل" },
      email: "backup@gza.ps",
      role: "admin",
      status: "active",
    });

    const tariq = await staffRepo.create({
      name: { en: "Tariq Mansour", ar: "طارق منصور" },
      email: "tariq.mansour@gza.ps",
      role: "admin",
      status: "active",
    });

    let releaseAppend!: () => void;
    let appendEnteredResolve!: () => void;
    const appendEntered = new Promise<void>((r) => (appendEnteredResolve = r));
    const appendBarrier = new Promise<void>((r) => (releaseAppend = r));

    const originalAppend = activityRepo.append.bind(activityRepo);
    activityRepo.append = async (input) => {
      appendEnteredResolve();
      await appendBarrier;
      return originalAppend(input);
    };

    const sessionCoord = new AdminSessionCoordinator({
      storage,
      staffRepo,
      activityRepo,
    });

    const signInPromise = sessionCoord.signIn("tariq.mansour@gza.ps", MOCK_PASSPHRASE);

    await appendEntered;

    // Concurrently demote Tariq to editor
    await staffRepo.updateRole(tariq.id, "editor");

    releaseAppend();
    const result = await signInPromise;

    assert.equal(result.ok, true);
    assert.equal(
      sessionCoord.staff?.role,
      "editor",
      "Session must reflect demoted role, not stale admin snapshot",
    );
  });

  it("held audit append wait: directory corruption revokes session and marks directory unavailable", async () => {
    const storage = createMockStorage();
    const staffCoord = new StaffStorageCoordinator({ storage });
    const staffRepo = new LocalStaffRepository(staffCoord);
    const activityCoord = new ActivityStorageCoordinator({ storage });
    const activityRepo = new LocalActivityRepository(activityCoord);

    await staffRepo.create({
      name: { en: "Tariq Mansour", ar: "طارق منصور" },
      email: "tariq.mansour@gza.ps",
      role: "admin",
      status: "active",
    });

    let releaseAppend!: () => void;
    let appendEnteredResolve!: () => void;
    const appendEntered = new Promise<void>((r) => (appendEnteredResolve = r));
    const appendBarrier = new Promise<void>((r) => (releaseAppend = r));

    const originalAppend = activityRepo.append.bind(activityRepo);
    activityRepo.append = async (input) => {
      appendEnteredResolve();
      await appendBarrier;
      return originalAppend(input);
    };

    const sessionCoord = new AdminSessionCoordinator({
      storage,
      staffRepo,
      activityRepo,
    });

    const signInPromise = sessionCoord.signIn("tariq.mansour@gza.ps", MOCK_PASSPHRASE);
    await appendEntered;

    // Corrupt directory while audit append is waiting
    storage.setItem("gza.staff.v1", "{invalid json");
    staffCoord.notify();

    releaseAppend();
    const result = await signInPromise;

    assert.equal(result.ok, false);
    assert.equal(sessionCoord.staff, null);
    assert.equal(sessionCoord.directoryUnavailable, true);
  });

  it("fails truthfully when storage is null outside Studio preview", async () => {
    const staffCoord = new StaffStorageCoordinator();
    const staffRepo = new LocalStaffRepository(staffCoord);
    const activityCoord = new ActivityStorageCoordinator();
    const activityRepo = new LocalActivityRepository(activityCoord);

    await staffRepo.create({
      name: { en: "Test Admin", ar: "مسؤول" },
      email: "test@gza.ps",
      role: "admin",
      status: "active",
    });

    const sessionCoord = new AdminSessionCoordinator({
      storage: null,
      staffRepo,
      activityRepo,
      isStudioPreview: false,
    });

    const result = await sessionCoord.signIn("test@gza.ps", MOCK_PASSPHRASE);
    assert.equal(result.ok, false);
    assert.equal(result.error, "storage_unavailable");
    assert.equal(sessionCoord.staff, null, "Must adopt no authority when storage unavailable");
  });
});
