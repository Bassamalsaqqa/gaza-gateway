/**
 * Gaza Gateway — Canonical Staff Repository Unit Tests
 *
 * Exhaustive unit tests for Phase 6C Staff Domain:
 * 1. Storage authority, empty authority & anti-resurrection guarantees
 * 2. Deterministic seeds & valid profiles
 * 3. Input validation, unique normalized emails, and sequential IDs
 * 4. Invariant: Last active administrator protection against demotion or disablement
 * 5. Role transitions, status changes, profile edits, and touchLastActive
 * 6. Real no-op detection (no revision bump or unnecessary writes)
 * 7. Storage failure, rollback, StorageCommitError, and zero false notifications
 * 8. Central repository registry, query keys, and Studio preview isolation
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STAFF_STORAGE_KEY,
  StaffStorageCoordinator,
  LocalStaffRepository,
  StaffError,
  seedStaffEnvelope,
  staffKeys,
  type CreateStaffInput,
  type StaffEnvelopeV1,
} from "../../src/lib/staff/index.ts";
import { StorageCommitError } from "../../src/lib/repositories/storage.ts";
import {
  createRepositories,
  getIsolatedStudioRepositories,
  resetIsolatedStudioRepositories,
} from "../../src/lib/repositories/registry.ts";

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

describe("Staff Domain — Storage Authority & Anti-Resurrection", () => {
  it("returns deterministic seed envelope when storage key is absent, without writing to storage", async () => {
    const storage = createMockStorage();
    const coordinator = new StaffStorageCoordinator({ storage });
    const repo = new LocalStaffRepository(coordinator);

    const list = await repo.list();
    assert.strictEqual(list.length, 4);
    assert.strictEqual(list[0]?.id, "adm-1");
    assert.strictEqual(list[0]?.name.en, "Rana Habib");
    assert.strictEqual(list[0]?.role, "admin");
    assert.strictEqual(list[0]?.status, "active");
    assert.strictEqual(list[3]?.id, "adm-4");
    assert.strictEqual(list[3]?.status, "disabled");

    // Key must NOT be written on read
    assert.strictEqual(storage.getItem(STAFF_STORAGE_KEY), null);
  });

  it("respects empty staff directory without seed resurrection (anti-resurrection guarantee)", async () => {
    const emptyEnvelope: StaffEnvelopeV1 = {
      schemaVersion: 1,
      revision: 10,
      staff: [],
    };
    const storage = createMockStorage({
      [STAFF_STORAGE_KEY]: JSON.stringify(emptyEnvelope),
    });
    const coordinator = new StaffStorageCoordinator({ storage });
    const repo = new LocalStaffRepository(coordinator);

    const list = await repo.list();
    assert.strictEqual(list.length, 0);
  });

  it("fails closed on corrupt or invalid stored JSON", async () => {
    const storage = createMockStorage({
      [STAFF_STORAGE_KEY]: "{ not-valid-json",
    });
    const coordinator = new StaffStorageCoordinator({ storage });
    const repo = new LocalStaffRepository(coordinator);

    await assert.rejects(
      async () => repo.list(),
      (err: unknown) => err instanceof StaffError && err.code === "staff_unavailable",
    );
  });

  it("fails closed on unsupported schemaVersion", async () => {
    const badEnvelope = {
      schemaVersion: 99,
      revision: 1,
      staff: [],
    };
    const storage = createMockStorage({
      [STAFF_STORAGE_KEY]: JSON.stringify(badEnvelope),
    });
    const coordinator = new StaffStorageCoordinator({ storage });
    const repo = new LocalStaffRepository(coordinator);

    await assert.rejects(
      async () => repo.list(),
      (err: unknown) => err instanceof StaffError && err.code === "staff_unavailable",
    );
  });
});

describe("Staff Repository — Creation & Validation", () => {
  it("creates a new staff member with next sequential ID and normalized email", async () => {
    const storage = createMockStorage();
    const coordinator = new StaffStorageCoordinator({ storage });
    const repo = new LocalStaffRepository(coordinator);

    const input: CreateStaffInput = {
      name: { en: "Tariq Mansour", ar: "طارق منصور" },
      email: "  Tariq.Mansour@gza.ps  ",
      role: "editor",
    };

    const created = await repo.create(input);
    assert.strictEqual(created.id, "adm-5");
    assert.strictEqual(created.email, "tariq.mansour@gza.ps");
    assert.strictEqual(created.role, "editor");
    assert.strictEqual(created.status, "active");
    assert.strictEqual(created.title.en, "Content editor");
    assert.ok(created.createdAt);
    assert.strictEqual(created.lastActiveAt, null);

    // Persisted to storage with revision bump
    const raw = storage.getItem(STAFF_STORAGE_KEY);
    assert.ok(raw);
    const parsed = JSON.parse(raw);
    assert.strictEqual(parsed.revision, 2);
    assert.strictEqual(parsed.staff.length, 5);
  });

  it("rejects duplicate email case-insensitively", async () => {
    const storage = createMockStorage();
    const coordinator = new StaffStorageCoordinator({ storage });
    const repo = new LocalStaffRepository(coordinator);

    const input: CreateStaffInput = {
      name: { en: "Duplicate Rana", ar: "رنا ثانية" },
      email: "RANA.HABIB@GZA.PS",
      role: "admin",
    };

    await assert.rejects(
      async () => repo.create(input),
      (err: unknown) => err instanceof StaffError && err.code === "email_taken",
    );
  });

  it("rejects invalid input schema (invalid email, missing Arabic)", async () => {
    const storage = createMockStorage();
    const coordinator = new StaffStorageCoordinator({ storage });
    const repo = new LocalStaffRepository(coordinator);

    await assert.rejects(
      async () =>
        repo.create({
          name: { en: "Invalid Email", ar: "بريد خاطئ" },
          email: "not-an-email",
          role: "editor",
        }),
      (err: unknown) => err instanceof StaffError && err.code === "invalid_staff",
    );

    await assert.rejects(
      async () =>
        repo.create({
          name: { en: "No Arabic", ar: "  " },
          email: "valid@gza.ps",
          role: "viewer",
        }),
      (err: unknown) => err instanceof StaffError && err.code === "invalid_staff",
    );
  });
});

describe("Staff Invariant — Last Active Administrator Protection", () => {
  it("rejects demoting the only active administrator", async () => {
    const storage = createMockStorage();
    const coordinator = new StaffStorageCoordinator({ storage });
    const repo = new LocalStaffRepository(coordinator);

    // adm-1 is the only active admin in the seed data
    await assert.rejects(
      async () => repo.updateRole("adm-1", "editor"),
      (err: unknown) => err instanceof StaffError && err.code === "last_admin_protected",
    );
  });

  it("rejects disabling the only active administrator", async () => {
    const storage = createMockStorage();
    const coordinator = new StaffStorageCoordinator({ storage });
    const repo = new LocalStaffRepository(coordinator);

    await assert.rejects(
      async () => repo.setStatus("adm-1", "disabled"),
      (err: unknown) => err instanceof StaffError && err.code === "last_admin_protected",
    );
  });

  it("permits demoting or disabling an administrator if another active administrator exists", async () => {
    const storage = createMockStorage();
    const coordinator = new StaffStorageCoordinator({ storage });
    const repo = new LocalStaffRepository(coordinator);

    // Add second admin
    await repo.create({
      name: { en: "Second Admin", ar: "مسؤول ثان" },
      email: "second.admin@gza.ps",
      role: "admin",
    });

    // Now adm-1 can be changed to editor
    const demoted = await repo.updateRole("adm-1", "editor");
    assert.strictEqual(demoted.role, "editor");

    // But now second.admin is the last active admin; demoting second.admin must fail!
    const second = await repo.getByEmail("second.admin@gza.ps");
    assert.ok(second);
    await assert.rejects(
      async () => repo.updateRole(second.id, "viewer"),
      (err: unknown) => err instanceof StaffError && err.code === "last_admin_protected",
    );
  });
});

describe("Staff Mutations & No-Op Detection", () => {
  it("updates role and status for non-admin staff", async () => {
    const storage = createMockStorage();
    const coordinator = new StaffStorageCoordinator({ storage });
    const repo = new LocalStaffRepository(coordinator);

    const updated = await repo.updateRole("adm-2", "viewer");
    assert.strictEqual(updated.role, "viewer");

    const disabled = await repo.setStatus("adm-2", "disabled");
    assert.strictEqual(disabled.status, "disabled");

    const reenabled = await repo.setStatus("adm-4", "active");
    assert.strictEqual(reenabled.status, "active");
  });

  it("suppresses no-op mutations without bumping revision or writing storage", async () => {
    const storage = createMockStorage();
    const coordinator = new StaffStorageCoordinator({ storage });
    const repo = new LocalStaffRepository(coordinator);

    // Make an initial real mutation to write to storage
    await repo.setStatus("adm-4", "active");
    const raw1 = storage.getItem(STAFF_STORAGE_KEY)!;
    const rev1 = JSON.parse(raw1).revision;

    // Mutate with same status (already active)
    const noOp = await repo.setStatus("adm-4", "active");
    assert.strictEqual(noOp.status, "active");

    const raw2 = storage.getItem(STAFF_STORAGE_KEY)!;
    const rev2 = JSON.parse(raw2).revision;
    assert.strictEqual(rev1, rev2, "Revision must not increment on a no-op");
  });

  it("returns mutation receipts indicating whether actual change committed", async () => {
    const storage = createMockStorage();
    const coordinator = new StaffStorageCoordinator({ storage });
    const repo = new LocalStaffRepository(coordinator);

    // Initial role change: viewer -> editor
    const r1 = await repo.updateRoleWithReceipt("adm-3", "editor");
    assert.strictEqual(r1.changed, true);
    assert.strictEqual(r1.member.role, "editor");

    // No-op role change: editor -> editor
    const r2 = await repo.updateRoleWithReceipt("adm-3", "editor");
    assert.strictEqual(r2.changed, false);
    assert.strictEqual(r2.member.role, "editor");

    // Status change: disabled -> active
    const s1 = await repo.setStatusWithReceipt("adm-4", "active");
    assert.strictEqual(s1.changed, true);
    assert.strictEqual(s1.member.status, "active");

    // No-op status change: active -> active
    const s2 = await repo.setStatusWithReceipt("adm-4", "active");
    assert.strictEqual(s2.changed, false);
    assert.strictEqual(s2.member.status, "active");

    // Profile change
    const p1 = await repo.updateProfileWithReceipt("adm-2", {
      name: { en: "Yousef Updated", ar: "يوسف محدث" },
    });
    assert.strictEqual(p1.changed, true);

    // No-op profile change
    const p2 = await repo.updateProfileWithReceipt("adm-2", {
      name: { en: "Yousef Updated", ar: "يوسف محدث" },
    });
    assert.strictEqual(p2.changed, false);
  });

  it("updates display profile and records last active timestamp", async () => {
    const storage = createMockStorage();
    const coordinator = new StaffStorageCoordinator({ storage });
    const repo = new LocalStaffRepository(coordinator);

    const updated = await repo.updateProfile("adm-2", {
      name: { en: "Yousef N. Al-Nasser", ar: "يوسف ناصر" },
      title: { en: "Senior Content Editor", ar: "محرِّر أول" },
    });
    assert.strictEqual(updated.name.en, "Yousef N. Al-Nasser");
    assert.strictEqual(updated.title.en, "Senior Content Editor");

    const touched = await repo.touchLastActive("adm-2", "2026-10-06T12:00:00.000Z");
    assert.strictEqual(touched.lastActiveAt, "2026-10-06T12:00:00.000Z");
  });
});

describe("Staff Persistence Rollback & Isolation", () => {
  it("rolls back memory state and does not notify listeners when storage write fails", async () => {
    const storage = createMockStorage();
    const coordinator = new StaffStorageCoordinator({ storage });
    const repo = new LocalStaffRepository(coordinator);

    let notified = false;
    repo.subscribe(() => {
      notified = true;
    });

    // Make storage setItem throw
    storage.setItem = () => {
      throw new Error("Quota exceeded");
    };

    await assert.rejects(
      async () =>
        repo.create({
          name: { en: "Failing Member", ar: "عضو فاشل" },
          email: "failing@gza.ps",
          role: "editor",
        }),
      (err: unknown) => err instanceof StorageCommitError,
    );

    assert.strictEqual(notified, false, "Listeners must not be notified on commit error");

    // Fix storage and verify list does not have the failed member
    storage.setItem = createMockStorage().setItem;
    const list = await repo.list();
    assert.strictEqual(list.some((s) => s.email === "failing@gza.ps"), false);
  });

  it("supports in-memory isolation for Studio preview mode", async () => {
    resetIsolatedStudioRepositories();
    const studioRepos = getIsolatedStudioRepositories();
    assert.ok(studioRepos.staff);

    const list = await studioRepos.staff.list();
    assert.strictEqual(list.length, 4);

    const created = await studioRepos.staff.create({
      name: { en: "Studio Member", ar: "عضو استوديو" },
      email: "studio@gza.ps",
      role: "viewer",
    });
    assert.strictEqual(created.email, "studio@gza.ps");

    // Default registry should not have studio member
    const defaultRepos = createRepositories({ inMemoryOnly: true });
    const defaultList = await defaultRepos.staff.list();
    assert.strictEqual(defaultList.some((s) => s.email === "studio@gza.ps"), false);
  });
});
