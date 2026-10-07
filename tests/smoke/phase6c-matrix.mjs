import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { preview } from "vite";

import { SEED_STAFF_MEMBERS } from "../../src/lib/staff/seed.ts";
import { seedNetworkEnvelope } from "../../src/lib/network/seed.ts";
import { seedFleetEnvelope } from "../../src/lib/fleet/seed.ts";
import { seedCommercialCatalog } from "../../src/lib/commercial/seed.ts";
import { customerToRouteId } from "../../src/lib/customer-directory/id.ts";

const outputDir = path.resolve(process.env.PHASE6C_MATRIX_DIR ?? "scratch/phase6c-final-matrix");
fs.mkdirSync(outputDir, { recursive: true });

const SURFACES = [
  "signin",
  "staff-directory",
  "role-status-modal",
  "customer-list",
  "account-detail",
  "guest-detail",
  "claim",
  "global-search",
  "activity-list",
  "activity-filter",
  "activity-detail",
  "cross-tab-session",
].filter((surface) => !process.env.PHASE6C_MATRIX_SURFACE || surface === process.env.PHASE6C_MATRIX_SURFACE);

const LOCALES = ["en", "ar"];
const VIEWPORTS = [
  { width: 390, height: 844, name: "390" },
  { width: 768, height: 1024, name: "768" },
  { width: 1440, height: 900, name: "1440" },
];

const accountEmail = "salma.k@example.com";
const guestEmail = "guest.traveler@example.com";
const accountRouteId = customerToRouteId("account", accountEmail);
const guestRouteId = customerToRouteId("guest", guestEmail);

function getInitialStorage() {
  const staffEnvelope = {
    schemaVersion: 1,
    revision: 1,
    staff: SEED_STAFF_MEMBERS.map((s) => ({ ...s, ...(s.id === "adm-2" ? { role: "admin" } : {}) })),
  };

  const passengerEnvelope = {
    schemaVersion: 1,
    account: {
      email: accountEmail,
      firstName: "Salma",
      lastName: "Khalil",
      seatPreference: "none",
      mealPreference: "standard",
      newsletter: false,
      phone: "+970599123456",
      createdAt: "2026-02-01T10:00:00.000Z",
    },
    travelers: [],
  };

  const repoEnvelope = {
    schemaVersion: 1,
    bookings: [
      {
        ref: "GZA-7K8P",
        createdAt: "2026-02-15T10:00:00.000Z",
        channel: "web",
        ownerEmail: accountEmail,
        status: "confirmed",
        criteria: {
          tripType: "one",
          origin: "GZA",
          destination: "AMM",
          departDate: "2026-10-15",
          adults: 1,
          children: 0,
          infants: 0,
          cabin: "economy",
        },
        outbound: {
          id: "svc1-GZA-AMM-20261015-1000",
          number: "PS 204",
          originCode: "GZA",
          destinationCode: "AMM",
          date: "2026-10-15",
          departTime: "10:00",
          arriveTime: "11:15",
          aircraft: "Airbus A320neo",
          aircraftId: "a320neo",
          status: "Scheduled",
        },
        fareId: "classic",
        passengers: [
          {
            id: "pax-1",
            type: "adult",
            firstName: "Salma",
            lastName: "Khalil",
            dob: "1990-05-15",
            nationality: "PS",
            document: "P1234567",
          },
        ],
        seats: { "out-0": "4A" },
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: accountEmail, phone: "+970599123456" },
        checkedIn: { out: [], in: [] },
        total: 180,
      },
      {
        ref: "GZA-9M4L",
        createdAt: "2026-03-01T14:30:00.000Z",
        channel: "desk",
        ownerEmail: null,
        status: "confirmed",
        criteria: {
          tripType: "one",
          origin: "GZA",
          destination: "CAI",
          departDate: "2026-10-16",
          adults: 1,
          children: 0,
          infants: 0,
          cabin: "economy",
        },
        outbound: {
          id: "svc1-GZA-CAI-20261016-1400",
          number: "PS 206",
          originCode: "GZA",
          destinationCode: "CAI",
          date: "2026-10-16",
          departTime: "14:00",
          arriveTime: "15:20",
          aircraft: "Airbus A320neo",
          aircraftId: "a320neo",
          status: "Scheduled",
        },
        fareId: "classic",
        passengers: [
          {
            id: "pax-2",
            type: "adult",
            firstName: "Guest",
            lastName: "Traveler",
            dob: "1985-08-20",
            nationality: "EG",
            document: "A9876543",
          },
        ],
        seats: { "out-0": "6B" },
        extras: { pax: [{ extraBags: 1, meal: "halal", assistance: [] }] },
        contact: { email: guestEmail, phone: "+970599987654" },
        checkedIn: { out: [], in: [] },
        total: 210,
      },
    ],
    flightOverrides: {},
  };

  const activityEnvelope = {
    schemaVersion: 1,
    revision: 3,
    events: [
      {
        id: "act-1",
        timestamp: "2026-10-06T14:15:00.000Z",
        actor: {
          id: "adm-1",
          name: { en: "Rana Habib", ar: "رنا حبيب" },
          email: "rana.habib@gza.ps",
          role: "admin",
        },
        module: "staff",
        action: "created",
        targetType: "staff",
        targetId: "adm-5",
        after: "Tariq Mansour",
        summary: {
          en: "Created staff profile Tariq Mansour (editor)",
          ar: "أنشأ ملف الموظف طارق منصور (محرِّر)",
        },
        metadata: { email: "tariq.mansour@gza.ps", role: "editor" },
      },
      {
        id: "act-2",
        timestamp: "2026-10-06T12:30:00.000Z",
        actor: {
          id: "adm-1",
          name: { en: "Rana Habib", ar: "رنا حبيب" },
          email: "rana.habib@gza.ps",
          role: "admin",
        },
        module: "bookings",
        action: "checked_in",
        targetType: "booking",
        targetId: "GZA-7K8P",
        after: "out-0",
        summary: {
          en: "Completed desk check-in for booking GZA-7K8P",
          ar: "أتم تسجيل الوصول المكتبي للحجز GZA-7K8P"
        },
        metadata: { ref: "GZA-7K8P", seat: "4A" },
      },
      {
        id: "act-3",
        timestamp: "2026-10-06T10:00:00.000Z",
        actor: {
          id: "adm-2",
          name: { en: "Yousef Nasser", ar: "يوسف ناصر" },
          email: "yousef.nasser@gza.ps",
          role: "editor",
        },
        module: "schedules",
        action: "updated",
        targetType: "schedule",
        targetId: "sch-gza-amm-01",
        before: "10:00",
        after: "10:15",
        summary: {
          en: "Updated departure time for schedule PS 204",
          ar: "حدّث وقت الإقلاع للجدول PS 204",
        },
        metadata: { flightNumber: "PS 204" },
      },
    ],
  };

  return {
    "gza.admin.v1": JSON.stringify({ staffId: "adm-1", overrides: {} }),
    "gza.staff.v1": JSON.stringify(staffEnvelope),
    "gza.passenger.v1": JSON.stringify(passengerEnvelope),
    "gza.repo.v1": JSON.stringify(repoEnvelope),
    "gza.activity.v1": JSON.stringify(activityEnvelope),
    "gza.network.v1": JSON.stringify(seedNetworkEnvelope()),
    "gza.fleet.v1": JSON.stringify(seedFleetEnvelope()),
    "gza.commercial.v1": JSON.stringify({
      schemaVersion: 1,
      revision: 0,
      catalog: seedCommercialCatalog(),
    }),
  };
}

async function run() {
  console.log("Starting preview server for Phase 6C matrix capture...");
  const server = await preview({ preview: { port: 4192, strictPort: false } });
  const baseUrl = "http://localhost:" + server.httpServer.address().port;
  console.log(`Preview server running at ${baseUrl}`);

  let browser;
  try {
    browser = await chromium.launch({
      channel: process.platform === "win32" ? "msedge" : undefined,
      headless: true,
    });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const results = [];
  const initialStorage = getInitialStorage();

  try {
    for (const locale of LOCALES) {
      const prefix = locale === "ar" ? "/ar" : "";

      for (const vp of VIEWPORTS) {
        for (const surface of SURFACES) {
          const cellId = `${locale}_${vp.name}_${surface}`;
          const screenshotPath = path.join(outputDir, `${cellId}.png`);

          const context = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
          });

          // Inject initial localStorage once per context
          if (surface !== "signin") {
            await context.addInitScript((storage) => {
              if (window.__storageSeeded || localStorage.getItem("__storage_seeded")) return;
              window.__storageSeeded = true;
              localStorage.setItem("__storage_seeded", "1");
              for (const [k, v] of Object.entries(storage)) {
                localStorage.setItem(k, v);
              }
            }, initialStorage);
          } else {
            // For signin, provide staff directory in storage so signin can lookup accounts, but clear gza.admin.v1
            await context.addInitScript((storage) => {
              if (window.__storageSeeded || localStorage.getItem("__storage_seeded")) return;
              window.__storageSeeded = true;
              localStorage.setItem("__storage_seeded", "1");
              for (const [k, v] of Object.entries(storage)) {
                if (k !== "gza.admin.v1") {
                  localStorage.setItem(k, v);
                }
              }
              localStorage.removeItem("gza.admin.v1");
            }, initialStorage);
          }

          const page = await context.newPage();
          const pageErrors = [];
          page.on("pageerror", (err) => pageErrors.push(err.message || String(err)));

          let status = "PASS";
          let note = "";

          try {
            switch (surface) {
              case "signin": {
                await page.goto(`${baseUrl}${prefix}/admin/signin`, { waitUntil: "domcontentloaded" });
                await page.locator("form, input").first().waitFor({ timeout: 10000 });
                await page.waitForTimeout(400);
                break;
              }

              case "staff-directory": {
                await page.goto(`${baseUrl}${prefix}/admin/staff`, { waitUntil: "domcontentloaded" });
                await page.locator("main").waitFor({ timeout: 10000 });
                await page.waitForTimeout(600);
                break;
              }

              case "role-status-modal": {
                await page.goto(`${baseUrl}${prefix}/admin/staff`, { waitUntil: "domcontentloaded" });
                await page.locator("main").waitFor({ timeout: 10000 });
                await page.waitForTimeout(600);
                // Click visible "Change role" button
                const changeRoleBtn = page.locator("main").getByRole("button", { name: /Change role|تغيير الدور|تعديل الدور/i }).filter({ visible: true }).first();
                await changeRoleBtn.waitFor({ timeout: 5000 });
                await changeRoleBtn.click();
                await page.locator("#st-role-edit, [role='dialog']").first().waitFor({ timeout: 5000 });
                await page.waitForTimeout(400); // animation
                break;
              }

              case "customer-list": {
                await page.goto(`${baseUrl}${prefix}/admin/customers`, { waitUntil: "domcontentloaded" });
                await page.locator("main").waitFor({ timeout: 10000 });
                await page.locator("main table tbody tr, main ul li, main a[href*=cus_]").filter({ visible: true }).first().waitFor({ timeout: 5000 });
                await page.waitForTimeout(400);
                break;
              }

              case "account-detail": {
                await page.goto(`${baseUrl}${prefix}/admin/customers/${accountRouteId}`, { waitUntil: "domcontentloaded" });
                await page.locator("main").waitFor({ timeout: 10000 });
                await page.getByText("Salma Khalil").first().waitFor({ timeout: 5000 });
                await page.waitForTimeout(400);
                break;
              }

              case "guest-detail": {
                await page.goto(`${baseUrl}${prefix}/admin/customers/${guestRouteId}`, { waitUntil: "domcontentloaded" });
                await page.locator("main").waitFor({ timeout: 10000 });
                await page.getByText("Guest Traveler").first().waitFor({ timeout: 5000 });
                await page.waitForTimeout(400);
                break;
              }

              case "claim": {
                // Open account detail where the Attach booking / claim action exists
                await page.goto(`${baseUrl}${prefix}/admin/customers/${accountRouteId}`, { waitUntil: "domcontentloaded" });
                await page.locator("main").waitFor({ timeout: 10000 });
                await page.waitForTimeout(600);
                const attachBtn = page.getByRole("button", { name: /Attach booking|إضافة حجز|إرفاق حجز/i }).first();
                await attachBtn.waitFor({ timeout: 5000 });
                await attachBtn.click();
                await page.locator("form input, #attach-pnr, [role='dialog'] input").first().waitFor({ timeout: 5000 });
                await page.waitForTimeout(400);
                break;
              }

              case "global-search": {
                await page.goto(`${baseUrl}${prefix}/admin/staff`, { waitUntil: "domcontentloaded" });
                await page.locator("main").waitFor({ timeout: 10000 });
                await page.waitForTimeout(600);
                const searchTrigger = page.locator("header button").filter({ has: page.locator("svg.lucide-search") }).first();
                if (await searchTrigger.count() > 0) {
                  await searchTrigger.click();
                } else {
                  await page.locator("header").getByRole("button", { name: /Search|بحث/i }).first().click();
                }
                const searchInput = page.locator("input[role='combobox']").first();
                await searchInput.waitFor({ timeout: 5000 });
                await searchInput.fill("Salma");
                await page.waitForTimeout(500);
                break;
              }

              case "activity-list": {
                await page.goto(`${baseUrl}${prefix}/admin/activity`, { waitUntil: "domcontentloaded" });
                await page.locator("main").waitFor({ timeout: 10000 });
                await page.locator("main table tbody tr, main ul li, main a[href*=cus_]").filter({ visible: true }).first().waitFor({ timeout: 5000 });
                await page.waitForTimeout(400);
                break;
              }

              case "activity-filter": {
                await page.goto(`${baseUrl}${prefix}/admin/activity`, { waitUntil: "domcontentloaded" });
                await page.locator("main").waitFor({ timeout: 10000 });
                await page.locator("main table tbody tr, main ul li, main a[href*=cus_]").filter({ visible: true }).first().waitFor({ timeout: 5000 });
                const moduleSelect = page.locator("main select").nth(1);
                await moduleSelect.waitFor({ timeout: 5000 });
                await moduleSelect.selectOption("staff");
                await page.waitForTimeout(500);
                break;
              }

              case "activity-detail": {
                await page.goto(`${baseUrl}${prefix}/admin/activity`, { waitUntil: "domcontentloaded" });
                await page.locator("main").waitFor({ timeout: 10000 });
                await page.waitForTimeout(600);
                const firstRowBtn = page.locator("main table tbody tr button, main ul li button").filter({ visible: true }).first();
                await firstRowBtn.waitFor({ timeout: 5000 });
                await firstRowBtn.click();
                await page.locator("[role='dialog'], aside, dl").filter({ visible: true }).first().waitFor({ timeout: 5000 });
                await page.waitForTimeout(400);
                break;
              }

              case "cross-tab-session": {
                // 1. Tab 1 loads /admin/staff with active session
                await page.goto(`${baseUrl}${prefix}/admin/staff`, { waitUntil: "domcontentloaded" });
                await page.getByText("Rana Habib", { exact: true }).or(page.getByText("رنا حبيب", { exact: true })).filter({ visible: true }).first().waitFor({ timeout: 10000 });
                await page.waitForTimeout(400);

                // 2. Open Tab 2 to perform canonical disable of current staff & revoke session
                const page2 = await context.newPage();
                await page2.goto(`${baseUrl}${prefix}/admin/staff`, { waitUntil: "domcontentloaded" });
                await page2.evaluate(() => {
                  const raw = localStorage.getItem("gza.staff.v1");
                  if (raw) {
                    const data = JSON.parse(raw);
                    for (const m of data.staff) {
                      if (m.id === "adm-1" || m.email === "rana.habib@gza.ps") {
                        m.status = "disabled";
                      }
                    }
                    data.revision = (data.revision || 0) + 1;
                    localStorage.setItem("gza.staff.v1", JSON.stringify(data));
                  }
                });
                await page2.close();

                // 3. Tab 1 remains active without reload or manual event injection.
                // Assert live revocation via storage event propagation.
                const unauthOrDenied = page.locator("h1").filter({
                  hasText: /Sign in to continue|سجّل الدخول للمتابعة|Access restricted|الوصول مقيد/i,
                });
                await unauthOrDenied.waitFor({ timeout: 8000 });
                await page.waitForTimeout(400);
                break;
              }

              default:
                break;
            }

            // Assert no horizontal overflow
            const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
            assert.equal(hasHorizontalOverflow, false, `Horizontal overflow detected in ${cellId}`);

            // Assert technical direction
            const actualDir = await page.evaluate(() => document.documentElement.getAttribute("dir") || "ltr");
            const expectedDir = locale === "ar" ? "rtl" : "ltr";
            assert.equal(actualDir, expectedDir, `Direction mismatch in ${cellId}: expected ${expectedDir}, got ${actualDir}`);

            // Assert no uncaught page errors
            assert.equal(pageErrors.length, 0, `Page errors encountered in ${cellId}: ${pageErrors.join("; ")}`);

            await page.screenshot({ path: screenshotPath, fullPage: false });
          } catch (err) {
            status = "FAIL";
            note = err.message || String(err);
            console.error(`Cell ${cellId} failed:`, err.message);
          } finally {
            await context.close();
          }

          results.push({
            cellId,
            locale,
            viewport: vp.name,
            surface,
            status,
            screenshot: `${cellId}.png`,
            note,
          });

          process.stdout.write(status === "PASS" ? "." : "F");
        }
      }
    }

    console.log("\n\nMatrix capture finished!");
    const passed = results.filter((r) => r.status === "PASS").length;
    console.log(`Results: ${passed}/${results.length} cells captured successfully.`);

    if (passed !== results.length) process.exitCode = 1;

    fs.writeFileSync(
      path.join(outputDir, "matrix-results.json"),
      JSON.stringify(results, null, 2),
      "utf8"
    );

    // Generate markdown table
    let md = "# Phase 6C Changed-Admin Visual Matrix (72 Cells)\n\n";
    md += "| # | Cell ID | Locale | Viewport | Surface | Status | Screenshot |\n";
    md += "|---|---|---|---|---|---|---|\n";
    results.forEach((r, idx) => {
      md += `| ${idx + 1} | \`${r.cellId}\` | ${r.locale.toUpperCase()} | ${r.viewport}px | ${r.surface} | **${r.status}** | [\`${r.screenshot}\`](./${r.screenshot}) |\n`;
    });

    fs.writeFileSync(path.join(outputDir, "matrix-report.md"), md, "utf8");
    console.log("Wrote matrix-results.json and matrix-report.md");
  } finally {
    await browser.close();
    await server.httpServer.close();
  }
}

run().catch((err) => {
  console.error("Fatal error running matrix capture:", err);
  process.exit(1);
});
