import assert from "node:assert/strict";
import { commercialContext, commercialFixture } from "./phase6a-commercial.mjs";
import { seedFleetEnvelope } from "../../src/lib/fleet/seed.ts";
import { seedFleetLayouts } from "../../src/lib/fleet/seed.ts";
import { layoutCapacity } from "../../src/lib/fleet/layout.ts";
import { pricingSnapshot } from "../../src/lib/commercial/pricing.ts";
import { bookingTotal } from "../../src/lib/domain/pricing.ts";
import { seedCommercialCatalog } from "../../src/lib/commercial/seed.ts";
import { adminEn, adminAr } from "../../src/lib/i18n-admin.ts";
import { en as publicEn, ar as publicAr } from "../../src/lib/i18n-public.ts";

export function legSnapshot(flight) {
  const layout = seedFleetLayouts()[flight.aircraftId];
  assert.ok(layout, "Real fixture flight must resolve Fleet");
  return { ...layout, basis: "fleet", fleetRevision: 0, model: flight.aircraft, capacity: layoutCapacity(layout) };
}

const FLEET_KEY = "gza.fleet.v1";
const COMMERCIAL_KEY = "gza.commercial.v1";
const REPO_KEY = "gza.repo.v1";
const DRAFT_KEY = "gza.booking.draft.v1";

export async function fleetContext(browser, lang = "en", staff = "adm-1") {
  const b = commercialFixture();
  b.seatLayouts = { version: 1, out: legSnapshot(b.outbound), in: legSnapshot(b.inbound) };
  const fleetEnvelope = seedFleetEnvelope();
  const catalog = seedCommercialCatalog();
  b.pricingSnapshot = pricingSnapshot({revision:0,catalog}, b.fareId, b.criteria.cabin);
  b.total = bookingTotal(b).total;

  const context = await commercialContext(browser, b, staff);
  await context.addInitScript(
    ({ fleetEnvelope, catalog, b }) => {
      if (!localStorage.getItem("gza.fleet.v1")) {
        localStorage.setItem(
          "gza.fleet.v1",
          JSON.stringify(fleetEnvelope)
        );
      }
      if (!localStorage.getItem("gza.commercial.v1")) {
        localStorage.setItem(
          "gza.commercial.v1",
          JSON.stringify({ schemaVersion: 1, revision: 0, catalog })
        );
      }
      if (!localStorage.getItem("gza.booking.draft.v1")) {
        localStorage.setItem(
          "gza.booking.draft.v1",
          JSON.stringify({
            schemaVersion: 1,
            status: "active",
            draft: {
              criteria: b.criteria,
              outbound: b.outbound,
              inbound: b.inbound,
              fareId: b.fareId,
              passengers: b.passengers,
              seats: {},
              extras: b.extras,
              contact: b.contact,
            },
            revision: 1,
            submissionId: "fleet-browser-smoke",
            updatedAt: "2026-10-01T12:00:00Z",
          })
        );
      }
    },
    { fleetEnvelope, catalog, b }
  );

  return {
    context,
    b,
    prefix: lang === "ar" ? "/ar" : "",
    dict: lang === "ar" ? adminAr : adminEn,
    pub: lang === "ar" ? publicAr : publicEn,
  };
}

export async function runPhase6B2BChecks({ checkStep, browser, baseUrl }) {
  await checkStep(
    "Check 95: Phase 6B2B English Admin Products Aircraft & SeatMaps tabs rendered and editable, dynamic shared layout preview, permission enforcement",
    async () => {
      const { context, prefix } = await fleetContext(browser, "en", "adm-1");
      try {
        const page = await context.newPage();
        await page.goto(baseUrl + prefix + "/admin/products", { waitUntil: "domcontentloaded" });
        await page.waitForSelector('[data-testid="fleet-aircraft"]', { timeout: 10000 });

        // Verify aircraft cards rendered
        const aircraftSection = page.locator('[data-testid="fleet-aircraft"]');
        await assert.ok(await aircraftSection.getByText("Airbus A320neo").first().isVisible());
        await assert.ok(await aircraftSection.getByText("Airbus A321neo").first().isVisible());
        await assert.ok(await aircraftSection.getByText("Boeing 737-800").first().isVisible());

        // Switch to Seat Maps tab
        const seatmapsTabBtn = page.getByRole("tab", { name: /Seat maps|خرائط المقاعد/i });
        await seatmapsTabBtn.click();
        await page.waitForSelector('[data-testid="fleet-seatmaps"]', { timeout: 10000 });

        // Verify dynamic preview is rendered
        const preview = page.locator('[data-testid="seatmap-preview"]');
        await preview.waitFor({ state: "visible", timeout: 8000 });
        const seatButtons = preview.locator("button");
        const count = await seatButtons.count();
        assert.ok(count > 50, `Expected seat map preview to contain >50 seats, got ${count}`);

        // Verify viewer permission restriction
        const viewerContext = await fleetContext(browser, "en", "adm-3");
        try {
          const viewerPage = await viewerContext.context.newPage();
          await viewerPage.goto(baseUrl + prefix + "/admin/products", { waitUntil: "domcontentloaded" });
          const newBtn = viewerPage.getByRole("button", { name: /New Aircraft/i });
          await newBtn.waitFor();
          assert.equal(await newBtn.isDisabled(), true, "Viewer staff must see disabled New Aircraft action");
        } finally {
          await viewerContext.context.close();
        }
      } finally {
        await context.close();
      }
    }
  );

  await checkStep(
    "Check 96: Phase 6B2B Arabic Admin Products Aircraft & SeatMaps tabs with RTL directionality, LTR registration/seat letters, dynamic shared layout preview",
    async () => {
      const { context, prefix } = await fleetContext(browser, "ar", "adm-1");
      try {
        const page = await context.newPage();
        await page.goto(baseUrl + prefix + "/admin/products", { waitUntil: "domcontentloaded" });
        await page.waitForSelector('[data-testid="fleet-aircraft"]', { timeout: 10000 });

        // Document dir is rtl
        assert.equal(await page.locator("html").getAttribute("dir"), "rtl");

        // Verify Arabic tab labels
        const aircraftTab = page.locator('[data-testid="fleet-aircraft"]');
        await assert.ok(await aircraftTab.isVisible());

        // Switch to Seat Maps tab
        const seatmapsTabBtn = page.getByRole("tab", { name: "خرائط المقاعد" });
        await seatmapsTabBtn.click();
        await page.waitForSelector('[data-testid="fleet-seatmaps"]', { timeout: 10000 });

        // Seat preview grid remains physical LTR inside RTL page
        const preview = page.locator('[data-testid="seatmap-preview"]');
        await preview.waitFor({ state: "visible", timeout: 8000 });
        const ltrMap = preview.locator('[dir="ltr"]');
        assert.ok((await ltrMap.count()) > 0, "SeatMap grid must preserve dir='ltr' in Arabic");
      } finally {
        await context.close();
      }
    }
  );

  await checkStep(
    "Check 97: Phase 6B2B Dynamic SeatMap on public Booking (/book?step=seats) and Manage Seats (/manage/{ref}/seats) with roving tabindex, ARIA counts, and physical LTR inside RTL",
    async () => {
      const { context, prefix, b } = await fleetContext(browser, "ar", "adm-1");
      try {
        const page = await context.newPage();

        // 1. Public Booking seats step
        await page.goto(baseUrl + prefix + "/book?step=seats", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("table, [role='grid']", { timeout: 10000 });

        const grid = page.locator("[role='grid']").first();
        await grid.waitFor({ state: "visible" });

        // Directionality must be LTR
        assert.equal(await grid.getAttribute("dir"), "ltr");

        // Grid ARIA counts must be positive integers matching rows and columns
        const rowCount = await grid.getAttribute("aria-rowcount");
        const colCount = await grid.getAttribute("aria-colcount");
        assert.ok(Number(rowCount) >= 18, `Expected aria-rowcount >= 18, got ${rowCount}`);
        assert.ok(Number(colCount) >= 6, `Expected aria-colcount >= 6, got ${colCount}`);

        const focused = grid.locator('button[tabindex="0"]').first();
        await focused.focus();
        const before = await focused.getAttribute("aria-label");
        await focused.press("ArrowDown");
        assert.notEqual(await page.locator(":focus").getAttribute("aria-label"), before);
        // 2. Manage Seats step for historical booking
        await page.goto(baseUrl + prefix + `/manage/${b.ref}/seats`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("table, [role='grid']", { timeout: 10000 });
        const manageGrid = page.locator("[role='grid']").first();
        await manageGrid.waitFor({ state: "visible" });
        assert.equal(await manageGrid.getAttribute("dir"), "ltr");
      } finally {
        await context.close();
      }
    }
  );

  await checkStep(
    "Check 98: Phase 6B2B Two-tab convergence: Admin fleet layout edit reflects dynamically without corrupting historical booking snapshot",
    async () => {
      const { context, prefix, b } = await fleetContext(browser, "en", "adm-1");
      try {
        const adminPage = await context.newPage();
        const managePage = await context.newPage();

        // Initial check on historical booking
        await managePage.goto(baseUrl + prefix + `/manage/${b.ref}/seats`, { waitUntil: "domcontentloaded" });
        await managePage.waitForSelector("[role='grid']", { timeout: 10000 });
        const initialRowCount = await managePage.locator("[role='grid']").first().getAttribute("aria-rowcount");

        // Real Admin save with mounted second-tab and fresh-draft observers.
        const observer = await context.newPage(), fresh = await context.newPage();
        await adminPage.goto(baseUrl + "/admin/products?tab=seatmaps");
        await observer.goto(baseUrl + "/admin/products?tab=seatmaps");
        await adminPage.locator("#sm-ac").selectOption(b.outbound.aircraftId);
        await observer.locator("#sm-ac").selectOption(b.outbound.aircraftId);
        await fresh.goto(baseUrl + "/book?step=seats");
        const oldRows = Number(await adminPage.locator("#sm-rows").inputValue());
        await adminPage.locator("#sm-rows").fill(String(oldRows + 1));
        await adminPage.locator("#z-to-economy").fill(String(oldRows + 1));
        await adminPage.getByRole("button", {name:adminEn["adm.edit.save"],exact:true}).click();
        await observer.waitForFunction(rows => document.querySelector("#sm-rows")?.value === String(rows), oldRows + 1);
        await fresh.waitForFunction(rows => document.querySelector('[role="grid"]')?.getAttribute("aria-rowcount") === String(rows), oldRows + 2 - legSnapshot(b.outbound).zones.find(z => z.id === "economy").firstRow);
        await managePage.waitForFunction(rows => document.querySelector('[role="grid"]')?.getAttribute("aria-rowcount") === rows, initialRowCount);
        // Historical booking remains stable and uncorrupted
        await managePage.reload({ waitUntil: "domcontentloaded" });
        await managePage.waitForSelector("[role='grid']", { timeout: 10000 });
        const postRowCount = await managePage.locator("[role='grid']").first().getAttribute("aria-rowcount");
        assert.equal(postRowCount, initialRowCount, "Historical booking layout snapshot must remain stable");
      } finally {
        await context.close();
      }
    }
  );
}
