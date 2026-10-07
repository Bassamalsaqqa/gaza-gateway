/**
 * Gaza Gateway — Phase 6C Source Guards & Studio Isolation Unit Tests
 *
 * Enforces:
 * 1. Complete retirement and elimination of runtime authority for legacy fixtures:
 *    `staffAccounts`, `staffRows`, `mockCustomers`, `mockCustomerById`, and `activityEntries`.
 * 2. Mandatory consumer binding of Admin Staff, Customer Directory, Activity, Signin,
 *    and Inbox surfaces to canonical repositories and query hooks.
 * 3. Studio preview repository isolation: in-memory state never leaks to or mutates persistent
 *    localStorage keys (`gza.staff.v1`, `gza.activity.v1`, `gza.passenger.v1`, `gza.repo.v1`, `gza.admin.v1`).
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  getIsolatedStudioRepositories,
  resetIsolatedStudioRepositories,
} from "../../src/lib/repositories/registry.ts";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const srcDir = join(__dirname, "../../src");

function getAllSourceFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...getAllSourceFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

describe("Phase 6C Source Guards & Fixture Authority Retirement", () => {
  const allSourceFiles = getAllSourceFiles(srcDir);

  it("no runtime files import or reference retired staffAccounts or staffByRole", () => {
    const offenders: string[] = [];
    for (const file of allSourceFiles) {
      if (file.endsWith("admin.ts")) continue; // defining file with retirement comment
      const content = readFileSync(file, "utf8");
      if (/\bstaffAccounts\b/.test(content) || /\bstaffByRole\b/.test(content)) {
        offenders.push(file);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `Found forbidden references to staffAccounts/staffByRole in: ${offenders.join(", ")}`
    );
  });

  it("no runtime files import or reference retired staffRows", () => {
    const offenders: string[] = [];
    for (const file of allSourceFiles) {
      if (file.endsWith("admin-mock.ts")) continue; // defining file with retirement comment
      const content = readFileSync(file, "utf8");
      if (/\bstaffRows\b/.test(content)) {
        offenders.push(file);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `Found forbidden references to staffRows in: ${offenders.join(", ")}`
    );
  });

  it("no runtime files import or reference retired mockCustomers or mockCustomerById", () => {
    const offenders: string[] = [];
    for (const file of allSourceFiles) {
      if (file.endsWith("admin-mock.ts")) continue; // defining file with retirement comment
      const content = readFileSync(file, "utf8");
      if (/\bmockCustomers\b/.test(content) || /\bmockCustomerById\b/.test(content)) {
        offenders.push(file);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `Found forbidden references to mockCustomers/mockCustomerById in: ${offenders.join(", ")}`
    );
  });

  it("no runtime files import or reference retired activityEntries", () => {
    const offenders: string[] = [];
    for (const file of allSourceFiles) {
      if (file.endsWith("admin-mock.ts")) continue; // defining file with retirement comment
      const content = readFileSync(file, "utf8");
      if (/\bactivityEntries\b/.test(content)) {
        offenders.push(file);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `Found forbidden references to activityEntries in: ${offenders.join(", ")}`
    );
  });

  it("admin staff surfaces bind to canonical useStaffQuery and staff repository", () => {
    const staffRoute = join(srcDir, "routes", "{-$locale}.admin.staff.tsx");
    const signinRoute = join(srcDir, "routes", "{-$locale}.admin_.signin.tsx");
    const inboxRoute = join(srcDir, "routes", "{-$locale}.admin.inbox.tsx");

    const staffContent = readFileSync(staffRoute, "utf8");
    assert.ok(staffContent.includes("useStaffQuery"), "admin.staff.tsx must use useStaffQuery");
    assert.ok(staffContent.includes("useRepositories"), "admin.staff.tsx must use useRepositories");

    const signinContent = readFileSync(signinRoute, "utf8");
    assert.ok(signinContent.includes("useStaffQuery"), "admin_.signin.tsx must use useStaffQuery");

    const inboxContent = readFileSync(inboxRoute, "utf8");
    assert.ok(inboxContent.includes("useStaffQuery"), "admin.inbox.tsx must use useStaffQuery for assignees");
  });

  it("admin customer surfaces bind to canonical customer directory queries", () => {
    const indexRoute = join(srcDir, "routes", "{-$locale}.admin.customers.index.tsx");
    const detailRoute = join(srcDir, "routes", "{-$locale}.admin.customers.$id.tsx");
    const searchComp = join(srcDir, "components", "admin", "admin-search.tsx");

    const indexContent = readFileSync(indexRoute, "utf8");
    assert.ok(indexContent.includes("useCustomersQuery"), "admin.customers.index.tsx must use useCustomersQuery");

    const detailContent = readFileSync(detailRoute, "utf8");
    assert.ok(detailContent.includes("useCustomerDetailQuery"), "admin.customers.$id.tsx must use useCustomerDetailQuery");

    const searchContent = readFileSync(searchComp, "utf8");
    assert.ok(searchContent.includes("useCustomersQuery"), "admin-search.tsx must use useCustomersQuery");
  });

  it("admin activity route binds to canonical useActivityQuery", () => {
    const activityRoute = join(srcDir, "routes", "{-$locale}.admin.activity.tsx");
    const content = readFileSync(activityRoute, "utf8");
    assert.ok(content.includes("useActivityQuery"), "admin.activity.tsx must use useActivityQuery");
  });
});

describe("Phase 6C Studio Isolation", () => {
  beforeEach(() => {
    resetIsolatedStudioRepositories();
  });

  it("getIsolatedStudioRepositories supplies isolated repositories for staff, customerDirectory, and activity", () => {
    const repos = getIsolatedStudioRepositories();
    assert.ok(repos.staff, "Studio repos must include staff repository");
    assert.ok(repos.customerDirectory, "Studio repos must include customerDirectory projection");
    assert.ok(repos.activity, "Studio repos must include activity repository");
  });

  it("Studio repositories operate entirely in memory without writing to window.localStorage", async () => {
    const mockStorage: Record<string, string> = {};
    const fakeLocalStorage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        for (const k of Object.keys(mockStorage)) delete mockStorage[k];
      },
    };

    // Attach fake localStorage to global window if running in Node test
    const prevWindow = (globalThis as unknown as { window?: unknown }).window;
    (globalThis as unknown as { window: { localStorage: typeof fakeLocalStorage } }).window = {
      localStorage: fakeLocalStorage,
    };

    try {
      const repos = getIsolatedStudioRepositories();

      // Read seeded staff in Studio
      const staffList = await repos.staff.list();
      assert.ok(staffList.length > 0, "Studio staff repo should load seed data");

      // Mutate staff in Studio
      await repos.staff.create({
        name: { en: "Studio Tester", ar: "مختبر الاستوديو" },
        email: "studio.tester@gza.ps",
        role: "viewer",
      });

      const updatedStaff = await repos.staff.list();
      assert.equal(updatedStaff.some((s) => s.email === "studio.tester@gza.ps"), true);

      // Mutate activity in Studio
      await repos.activity.append({
        actor: {
          id: "adm-1",
          name: { en: "Studio User", ar: "مستخدم الاستوديو" },
          email: "studio@gza.ps",
          role: "admin",
        },
        module: "staff",
        action: "created",
        targetType: "staff_member",
        targetId: "adm-99",
        summary: { en: "Studio preview event", ar: "حدث معاينة الاستوديو" },
      });

      const events = await repos.activity.list();
      assert.equal(events.some((e) => e.targetId === "adm-99"), true);

      // Verify ZERO persistent writes were performed to localStorage
      assert.equal(
        mockStorage["gza.staff.v1"],
        undefined,
        "Studio staff mutations must NOT write to gza.staff.v1"
      );
      assert.equal(
        mockStorage["gza.activity.v1"],
        undefined,
        "Studio activity mutations must NOT write to gza.activity.v1"
      );
      assert.equal(
        mockStorage["gza.repo.v1"],
        undefined,
        "Studio operations must NOT write to gza.repo.v1"
      );
    } finally {
      (globalThis as unknown as { window?: unknown }).window = prevWindow;
    }
  });
});
