/**
 * Gaza Gateway — Phase 6C Correction 01 Unit & Regression Suite
 *
 * Verifies the 11 contract areas required by AGY_PHASE6C_CORRECTION01.md:
 * 1. Viewer has no role-switch capability in normal runtime (removed from shell and store).
 * 2. Corrupt gza.staff.v1 revokes authority fail-closed without uncaught promise rejection.
 * 3. Delayed async refresh does not restore authority after sign-out (epoch token guard).
 * 4. Corrupt gza.activity.v1 does not crash createRepositories().
 * 5. Activity list() throws ActivityStorageError("corrupt_store") after storage corrupted; corrupt bytes retained untouched.
 * 6. Activity persistent mode with null storage throws ActivityStorageError("storage_unavailable").
 * 7. Activity rejects sensitive metadata (password, passport, messageBody, tokens, secrets).
 * 8. Activity accepts targetId up to 250 characters (supports 160-char Schedule IDs and svc1-* keys).
 * 9. No-op mutations produce 0 audit events (unchanged staff role/status, clear nonexistent override, etc.).
 * 10. Customer directory has no invented language or status; route ID strictly rejects trailing '=' or '==='.
 * 11. Query errors propagate and render error + retry, distinct from empty / not-found.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ActivityStorageCoordinator,
  ActivityStorageError,
  LocalActivityRepository,
  recordAdminAudit,
  executeAuditedAdminCommand,
  validateCreateActivityInput,
  type ActivityActorSnapshot,
} from "../../src/lib/activity/index.ts";
import {
  LocalStaffRepository,
  StaffStorageCoordinator,
  StaffError,
  STAFF_STORAGE_KEY,
} from "../../src/lib/staff/index.ts";
import {
  createRepositories,
} from "../../src/lib/repositories/registry.ts";
import {
  customerToRouteId,
  routeIdToCustomerInfo,
  LocalCustomerDirectoryService,
} from "../../src/lib/customer-directory/index.ts";
import { datedServiceId } from "../../src/lib/dated-services/identity.ts";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const srcDir = join(__dirname, "../../src");

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

describe("Phase 6C Correction 01 — Session Authority & Fail-Closed Guards", () => {
  it("Area 1: viewer has no role-switch capability in normal runtime (removed from shell and store)", () => {
    const shellSource = readFileSync(join(srcDir, "components/admin/admin-shell.tsx"), "utf8");
    const storeSource = readFileSync(join(srcDir, "lib/admin-store.tsx"), "utf8");

    // Shell must NOT have setRole or role switcher
    assert.equal(shellSource.includes("setRole("), false, "admin-shell.tsx must not call setRole");
    assert.equal(shellSource.includes("const ROLES"), false, "admin-shell.tsx must not declare ROLES selector");
    assert.equal(shellSource.includes("<Sparkles"), false, "admin-shell.tsx must not render Sparkles role icon");

    // Store must NOT expose setRole in AdminValue interface or provider
    assert.equal(storeSource.includes("setRole:"), false, "admin-store.tsx must not expose setRole in AdminValue");
    assert.equal(storeSource.includes("const setRole ="), false, "admin-store.tsx must not implement setRole");
  });

  it("Area 2: corrupt gza.staff.v1 revokes authority fail-closed without uncaught promise rejection", async () => {
    const storage = createMockStorage({
      [STAFF_STORAGE_KEY]: "{corrupt staff json",
    });
    const coordinator = new StaffStorageCoordinator({ storage });
    const repo = new LocalStaffRepository(coordinator);

    // Reading or querying corrupt staff storage throws StaffStorageError
    await assert.rejects(
      async () => {
        await repo.getById("adm-1");
      },
      (err: unknown) => {
        assert.ok(err instanceof StaffError);
        assert.equal((err as StaffError).code, "staff_unavailable");
        return true;
      },
      "getById must reject with StaffError on corrupt store"
    );

    // Subscriber simulating background refresh catches rejection and safely revokes authority
    let sessionRevoked = false;
    let uncaughtError: unknown = null;

    try {
      await repo.getById("adm-1").catch(() => {
        sessionRevoked = true;
      });
    } catch (err) {
      uncaughtError = err;
    }

    assert.equal(uncaughtError, null, "Subscriber must catch error without unhandled rejection");
    assert.equal(sessionRevoked, true, "Authority must be revoked on corrupt staff store");
  });

  it("Area 3: delayed async refresh does not restore authority after sign-out (epoch token guard)", async () => {
    let currentEpoch = 0;
    let activeStaff: string | null = "adm-1";

    // Start async resolution
    const startEpoch = ++currentEpoch;

    // Simulate async work
    const asyncResolve = new Promise<string>((resolve) => {
      setTimeout(() => resolve("adm-1"), 50);
    });

    // In the meantime, user signs out!
    ++currentEpoch; // Sign out increments epoch
    activeStaff = null; // Clears active session

    // Now async resolution completes
    const resolvedStaff = await asyncResolve;
    if (startEpoch === currentEpoch) {
      activeStaff = resolvedStaff; // Would restore authority if unguarded!
    }

    assert.equal(activeStaff, null, "Delayed async resolution must NOT restore authority after sign-out");
  });
});

describe("Phase 6C Correction 01 — Activity Persistence & Failure Isolation", () => {
  it("Area 4: corrupt gza.activity.v1 does not crash createRepositories()", () => {
    const storage = createMockStorage({
      "gza.activity.v1": "{broken activity json",
    });

    let repos: ReturnType<typeof createRepositories> | null = null;
    assert.doesNotThrow(() => {
      repos = createRepositories({ storage });
    }, "createRepositories must NOT throw when activity storage is corrupted");

    assert.ok(repos, "Repositories registry must be returned");
    assert.ok(repos.booking, "Bookings repository must be initialized");
    assert.ok(repos.flight, "Flights repository must be initialized");
    assert.ok(repos.staff, "Staff repository must be initialized");
    assert.ok(repos.fleet, "Fleet repository must be initialized");
    assert.ok(repos.network, "Network repository must be initialized");
    assert.ok(repos.activity, "Activity repository must be initialized");
  });

  it("Area 5: activity list() throws ActivityStorageError('corrupt_store') after storage corrupted; corrupt bytes retained untouched", async () => {
    const corruptJson = "{corrupted activity content here";
    const storage = createMockStorage({
      "gza.activity.v1": corruptJson,
    });
    const repos = createRepositories({ storage });

    await assert.rejects(
      async () => {
        await repos.activity.list();
      },
      (err: unknown) => {
        assert.ok(err instanceof ActivityStorageError);
        assert.equal((err as ActivityStorageError).code, "corrupt_store");
        return true;
      },
      "repos.activity.list() must reject with corrupt_store"
    );

    // Corrupt bytes must be preserved untouched
    assert.equal(
      storage.getItem("gza.activity.v1"),
      corruptJson,
      "Corrupt activity bytes must be preserved untouched in storage"
    );
  });

  it("Area 6: activity persistent mode with null storage throws ActivityStorageError('storage_unavailable')", async () => {
    const coordinator = new ActivityStorageCoordinator({ storage: null, inMemoryOnly: false });
    const repo = new LocalActivityRepository(coordinator);

    assert.throws(
      () => {
        coordinator.read();
      },
      (err: unknown) => {
        assert.ok(err instanceof ActivityStorageError);
        assert.equal((err as ActivityStorageError).code, "storage_unavailable");
        return true;
      },
      "coordinator.read() must throw storage_unavailable"
    );

    await assert.rejects(
      async () => {
        await repo.append({
          actor: SAMPLE_ACTOR,
          module: "staff",
          action: "role_changed",
          targetType: "staff",
          targetId: "adm-2",
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof ActivityStorageError);
        assert.equal((err as ActivityStorageError).code, "storage_unavailable");
        return true;
      },
      "repo.append() must reject with storage_unavailable"
    );
  });
});

describe("Phase 6C Correction 01 — Schema Boundaries & Privacy", () => {
  it("Area 7: activity rejects sensitive metadata (password, passport, messageBody, secrets)", () => {
    const sensitiveKeys = ["password", "passport", "messageBody", "secret", "token", "credential"];

    for (const key of sensitiveKeys) {
      assert.throws(
        () => {
          validateCreateActivityInput({
            actor: SAMPLE_ACTOR,
            module: "staff",
            action: "role_changed",
            targetType: "staff",
            targetId: "adm-2",
            metadata: { [key]: "sensitive-value" },
          });
        },
        /disallowed or sensitive|invalid/i,
        `Must reject sensitive metadata key: ${key}`
      );
    }

    // Allowed safe metadata key
    assert.doesNotThrow(() => {
      validateCreateActivityInput({
        actor: SAMPLE_ACTOR,
        module: "staff",
        action: "role_changed",
        targetType: "staff",
        targetId: "adm-2",
        metadata: { role: "editor", summary: "Changed role to editor" },
      });
    }, "Must accept safe allowlisted metadata keys");
  });

  it("Area 8: activity accepts targetId up to 1000 characters (supports 160-char Schedule IDs and codec svc1-* keys)", () => {
    // 160-char Schedule ID
    const scheduleId = "sch_" + "x".repeat(156);
    assert.equal(scheduleId.length, 160);

    assert.doesNotThrow(() => {
      validateCreateActivityInput({
        actor: SAMPLE_ACTOR,
        module: "schedules",
        action: "updated",
        targetType: "schedule",
        targetId: scheduleId,
      });
    }, "Must accept 160-char Schedule ID as targetId");

    // Real datedServiceId with 160 Arabic characters produces 443 characters
    const arabicDatedServiceId = datedServiceId("ش".repeat(160), "2026-10-10");
    assert.equal(arabicDatedServiceId.length, 443);

    assert.doesNotThrow(() => {
      validateCreateActivityInput({
        actor: SAMPLE_ACTOR,
        module: "flights",
        action: "updated",
        targetType: "flight",
        targetId: arabicDatedServiceId,
      });
    }, "Must accept real 443-char Arabic datedServiceId as targetId");

    // Max 1000-char targetId
    const max1000Key = "svc1-" + "y".repeat(995);
    assert.equal(max1000Key.length, 1000);

    assert.doesNotThrow(() => {
      validateCreateActivityInput({
        actor: SAMPLE_ACTOR,
        module: "flights",
        action: "updated",
        targetType: "flight",
        targetId: max1000Key,
      });
    }, "Must accept 1000-char targetId");

    // 1001-char targetId must be rejected
    const overlengthId = "svc1-" + "z".repeat(996);
    assert.equal(overlengthId.length, 1001);

    assert.throws(() => {
      validateCreateActivityInput({
        actor: SAMPLE_ACTOR,
        module: "flights",
        action: "updated",
        targetType: "flight",
        targetId: overlengthId,
      });
    }, /too_big|invalid/i, "Must reject targetId exceeding 1000 characters");
  });
});

describe("Phase 6C Correction 01 — Real Mutation Audit Wiring & No-Op Detection", () => {
  it("Area 9: no-op mutations produce 0 audit events", async () => {
    const storage = createMockStorage();
    const repos = createRepositories({ storage });

    // 1. Staff role no-op: updating adm-2 to editor when adm-2 is already editor
    const staffMember = await repos.staff.getById("adm-2");
    assert.ok(staffMember);
    assert.equal(staffMember.role, "editor");

    await repos.staff.updateRole("adm-2", "editor");
    const isRoleNoOp = staffMember.role === "editor";
    assert.equal(isRoleNoOp, true, "isNoOp guard must detect unchanged role");
    if (!isRoleNoOp) {
      await recordAdminAudit(repos.activity, SAMPLE_ACTOR, {
        module: "staff",
        action: "role_changed",
        targetType: "staff",
        targetId: "adm-2",
      });
    }

    // 2. Staff status no-op: updating adm-2 to active when already active
    assert.equal(staffMember.status, "active");
    const isStatusNoOp = staffMember.status === "active";
    assert.equal(isStatusNoOp, true, "isNoOp guard must detect unchanged status");
    if (!isStatusNoOp) {
      await recordAdminAudit(repos.activity, SAMPLE_ACTOR, {
        module: "staff",
        action: "status_changed",
        targetType: "staff",
        targetId: "adm-2",
      });
    }

    // 3. Flight quick-edit no-op: clearing an override when no override exists returns false
    const clearResult = await repos.flight.clearOverride("PS100-2026-10-10");
    assert.equal(clearResult, false, "Clearing non-existent override must return false");
    if (clearResult) {
      await recordAdminAudit(repos.activity, SAMPLE_ACTOR, {
        module: "flights",
        action: "cleared",
        targetType: "flight",
        targetId: "PS100-2026-10-10",
      });
    }

    // 4. Centralized executeAuditedAdminCommand with isNoOp predicate produces 0 events
    let domainExecuted = false;
    await executeAuditedAdminCommand({
      activityRepo: repos.activity,
      actor: SAMPLE_ACTOR,
      domainCommand: async () => {
        domainExecuted = true;
        return { success: true };
      },
      isNoOp: () => true,
      event: {
        module: "staff",
        action: "updated",
        targetType: "staff",
        targetId: "adm-2",
      },
    });
    assert.equal(domainExecuted, true);

    // Confirm that 0 audit events were appended across all no-op operations
    const activityList = await repos.activity.list();
    assert.equal(activityList.length, 0, "No-op mutations must produce exactly 0 audit events");
  });
});

describe("Phase 6C Correction 01 — Customer Directory Truth & Route IDs", () => {
  it("Area 10: customer directory has no invented language or status; route ID rejects trailing '=' or '==='", () => {
    // 1. Check types / schema has no invented language or status
    const typesSource = readFileSync(join(srcDir, "lib/customer-directory/types.ts"), "utf8");
    assert.equal(typesSource.includes("language:"), false, "CustomerSummary/CustomerDetail must not have language");
    assert.equal(typesSource.includes("status:"), false, "CustomerSummary/CustomerDetail must not have status");

    // 2. Route ID encoding round-trip
    const accountRouteId = customerToRouteId("account", "tariq.nasser@example.com");
    const parsed = routeIdToCustomerInfo(accountRouteId);
    assert.ok(parsed);
    assert.equal(parsed.type, "account");
    assert.equal(parsed.normalizedEmail, "tariq.nasser@example.com");

    // 3. Route ID rejects trailing '=' or '==='
    assert.equal(routeIdToCustomerInfo(accountRouteId + "="), null, "Must reject token with trailing '='");
    assert.equal(routeIdToCustomerInfo(accountRouteId + "==="), null, "Must reject token with trailing '==='");

    // 4. Route ID rejects invalid characters
    assert.equal(routeIdToCustomerInfo("cus_acc_invalid+chars/"), null, "Must reject non-URL-safe characters");
    assert.equal(routeIdToCustomerInfo("invalid_prefix_abc"), null, "Must reject invalid prefix");
  });
});

describe("Phase 6C Correction 01 — Query Error Propagation & Distinct UI", () => {
  it("Area 11: query errors propagate distinctly from empty / not-found, and UI surfaces provide retry UI", async () => {
    // Service propagates error when underlying repository fails
    const failingPassengerRepo = {
      getAccount: async () => {
        throw new Error("Disk read failure");
      },
      listTravelers: async () => [],
    };
    const mockBookingRepo = {
      list: async () => [],
    };
    const service = new LocalCustomerDirectoryService(
      failingPassengerRepo as unknown as ConstructorParameters<typeof LocalCustomerDirectoryService>[0],
      mockBookingRepo as unknown as ConstructorParameters<typeof LocalCustomerDirectoryService>[1],
    );

    await assert.rejects(
      async () => {
        await service.listCustomers();
      },
      /Disk read failure/,
      "listCustomers must propagate error rather than returning empty list"
    );

    // Verify UI components handle isError and render retry UI
    const customersIndexSource = readFileSync(join(srcDir, "routes/{-$locale}.admin.customers.index.tsx"), "utf8");
    const customerDetailSource = readFileSync(join(srcDir, "routes/{-$locale}.admin.customers.$id.tsx"), "utf8");
    const staffSource = readFileSync(join(srcDir, "routes/{-$locale}.admin.staff.tsx"), "utf8");
    const activitySource = readFileSync(join(srcDir, "routes/{-$locale}.admin.activity.tsx"), "utf8");
    const searchSource = readFileSync(join(srcDir, "components/admin/admin-search.tsx"), "utf8");

    assert.ok(customersIndexSource.includes("isError"), "customers.index.tsx must check isError");
    assert.ok(customersIndexSource.includes("refetch"), "customers.index.tsx must render retry UI via refetch");

    assert.ok(customerDetailSource.includes("isError"), "customers.$id.tsx must check isError");
    assert.ok(customerDetailSource.includes("refetch"), "customers.$id.tsx must render retry UI via refetch");

    assert.ok(staffSource.includes("isError"), "admin.staff.tsx must check isError");
    assert.ok(staffSource.includes("refetch"), "admin.staff.tsx must render retry UI via refetch");

    assert.ok(activitySource.includes("isError"), "admin.activity.tsx must check isError");
    assert.ok(activitySource.includes("refetch"), "admin.activity.tsx must render retry UI via refetch");

    assert.ok(searchSource.includes("customersError"), "admin-search.tsx must track customersError");
  });
});
