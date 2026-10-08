import { runPhase6CCorrection05Checks } from "./phase6c-correction-05.mjs";
import { runPhase6CConvergenceChecks } from "./phase6c-convergence.mjs";
import { runPhase6CStaffActivityChecks } from "./phase6c-staff-activity.mjs";
import { runCutoverCorrection01Checks } from "./phase6b2c2b-correction-01.mjs";
import { runDatedServiceCutoverChecks } from "./phase6b2c2b-cutover.mjs";
import { currentDeparturesOn, currentArrivalsOn } from "../helpers/current-service-fixture.ts";
import { runDatedServiceFoundationChecks } from "./phase6b2c2a-foundation.mjs";
import { runPhase6B2BCorrectionChecks } from "./phase6b2b-correction-01.mjs";
import { runPhase6B2C1Checks } from "./phase6b2c1-network.mjs";
import { runPhase6B2BChecks } from "./phase6b2b-fleet.mjs";
import { runPhase6B2ACorrection01Checks } from "./phase6b2a-correction-01.mjs";
import { runPhase6B2AChecks } from "./phase6b2a-commercial.mjs";
import { runPhase6B1Correction01Checks } from "./phase6b1-correction-01.mjs";
import {runCommercialChecks,counterTestFlight,availableSeat} from "./phase6a-commercial.mjs";
import { runPhase6B1Checks } from "./phase6b1-operations.mjs";
import { runCommercialCorrection02Checks } from "./phase6a-correction-02.mjs";
import {bookingTotal} from "../../src/lib/domain/pricing.ts";
/**
 * Gaza Gateway — Browser Smoke Verification Script
 *
 * Verifies core user journeys, booking invariants, and administrative preview capabilities:
 * - Public English Homepage (`/`)
 * - Public Arabic Homepage (`/ar`)
 * - Booking Wizard with Material Capacity Proof (`/book`)
 * - Arabic Booking Wizard (`/ar/book`)
 * - Admin Appearance Studio with Material Interaction Proof (`/admin/settings?tab=appearance`)
 * - Arabic Appearance Studio Shell (`/ar/admin/settings?tab=appearance`)
 * - Flight Detail Bookability & Unbookable States (`/flight/*`)
 * - Arabic Flight Detail & Technical LTR Formatting (`/ar/flight/*`)
 *
 * Prerequisite:
 *   Standard installed browser (Microsoft Edge or Google Chrome) on the host machine.
 *   Dependencies declared in package.json (playwright-core).
 *
 * Usage:
 *   npm run test:smoke:public -- --url=http://localhost:8080
 */

import fs from "node:fs";
import path from "node:path";
import { launchSmokeBrowser } from "../helpers/browser-harness.mjs";
import { createSmokeSelection } from "../helpers/smoke-selection.mjs";
import { runPhase7ContentPreviewChecks } from "./phase7-content-preview.mjs";
import { runArchiveDraftChecks } from "./phase7b-task2-drafts.mjs";
import { preview } from "vite";

async function startServer(port = 4173) {
  console.log(`Starting Vite preview server on port ${port}...`);
  try {
    const previewServer = await preview({
      preview: { port, strictPort: false },
    });
    const address = previewServer.httpServer.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    return {
      url: `http://localhost:${actualPort}`,
      stop: async () => {
        await previewServer.close();
      },
    };
  } catch (err) {
    throw new Error(`Failed to start Vite preview server: ${err.message}`);
  }
}

// A visible SSR input may precede React hydration. Wait for its controlled handler
// before synthetic typing; this does not replace the journey's URL/domain assertions.
async function waitForInteractiveInput(page, selector) {
  await page.waitForFunction(selector => {
    const input = document.querySelector(selector);
    return input && Object.keys(input).some(key =>
      key.startsWith("__reactProps") && typeof input[key]?.onChange === "function");
  }, selector, { timeout: 8000 });
}

async function waitForNetworkRoute(page) {
  try {
    await page.locator('#search-to [data-slot="airport-code"]').waitFor();
  } catch (error) {
    console.error("Network route fixture diagnostics:", await page.evaluate(() => ({
      pathname: location.pathname,
      origin: document.querySelector("#search-from")?.textContent,
      destination: document.querySelector("#search-to")?.textContent,
      alerts: [...document.querySelectorAll('form [role="alert"]')].map(n => n.textContent),
      networkKeyPresent: localStorage.getItem("gza.network.v1") !== null,
    })));
    throw error;
  }
}

// Failure-only journey diagnostics; no form payload or storage contents are logged.
async function waitForJourneyURL(page, predicate, options) {
  try {
    await page.waitForURL(predicate, options);
  } catch (error) {
    console.error("Journey navigation diagnostics:", await page.evaluate(() => ({
      pathname: location.pathname,
      readyState: document.readyState,
      fields: [...document.querySelectorAll("input")].map(input => ({
        id: input.id,
        filled: input.value.length > 0,
        handlerAttached: Object.keys(input).some(key => key.startsWith("__reactProps") && typeof input[key]?.onChange === "function"),
      })),
      alertCount: document.querySelectorAll('[role="alert"]').length,
      lookupNotFound: !!document.querySelector("main")?.textContent?.includes("We couldn't find"),
    })));
    throw error;
  }
}

async function runBrowserSmoke() {
  const distClient = path.resolve("dist/client");
  const indexPath = path.join(distClient, "index.html");
  let entryAsset = "unknown";
  let indexMtime = "unknown";
  let indexSize = 0;
  if (fs.existsSync(indexPath)) {
    const indexStat = fs.statSync(indexPath);
    indexMtime = indexStat.mtime.toISOString();
    indexSize = indexStat.size;
    const indexContent = fs.readFileSync(indexPath, "utf8");
    const entryMatch = indexContent.match(/src="(\/assets\/[^"]+\.js)"/);
    if (entryMatch) entryAsset = entryMatch[1];
  }

  const customUrlArg = process.argv.find((a) => a.startsWith("--url="));
  let customUrl = customUrlArg ? customUrlArg.split("=")[1] : null;

  let server = null;
  let baseUrl = customUrl;

  if (!baseUrl) {
    server = await startServer(4173);
    baseUrl = server.url;
  }

  console.log(`\n========================================`);
  console.log(`Gaza Gateway — Browser Smoke Suite`);
  console.log(`Build Root: ${distClient}`);
  console.log(`Index Mtime: ${indexMtime} (${indexSize} bytes)`);
  console.log(`Entry Asset Fingerprint: ${entryAsset}`);
  console.log(`Target URL: ${baseUrl}`);
  console.log(`========================================\n`);

  let browser, harnessErrors;
  try {
    ({ browser, errors: harnessErrors } = await launchSmokeBrowser(baseUrl));
  } catch (error) {
    await server?.stop();
    throw error;
  }

  const context = await browser.newContext();
  await context.addInitScript(() => {
    try {
      if (!localStorage.getItem("gza.admin.v1")) {
        localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
      }
    } catch {
      // ignore
    }
  });
  const page = await context.newPage();

  const results = [];

  const filterArg = process.argv.find((a) => a.startsWith("--filter="));
  const filter = filterArg ? filterArg.split("=")[1] : process.env.SMOKE_FILTER;
  const selection = createSmokeSelection({ group: process.env.SMOKE_GROUP ?? "all", filter });

  async function checkStep(name, fn) {
    if (!selection.accepts(name)) return;
    const t0 = performance.now();
    try {
      await fn();
      const duration = Math.round(performance.now() - t0);
      console.log(`  ✔ ${name} (${duration}ms)`);
      results.push({ name, pass: true, duration });
    } catch (err) {
      const duration = Math.round(performance.now() - t0);
      console.error(`  ✖ ${name} (${duration}ms):`, err.message);
      results.push({ name, pass: false, duration, error: err.message });
    }
  }

  try {
    // 1. English Homepage
    await checkStep("1. Public English Homepage (/)", async () => {
      await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
      const lang = await page.evaluate(() => document.documentElement.lang);
      const dir = await page.evaluate(() => document.documentElement.dir);
      if (lang !== "en") throw new Error(`Expected lang="en", got "${lang}"`);
      if (dir !== "ltr") throw new Error(`Expected dir="ltr", got "${dir}"`);
    });

    // 2. Arabic Homepage
    await checkStep("2. Public Arabic Homepage (/ar)", async () => {
      await page.goto(`${baseUrl}/ar`, { waitUntil: "domcontentloaded" });
      const lang = await page.evaluate(() => document.documentElement.lang);
      const dir = await page.evaluate(() => document.documentElement.dir);
      if (lang !== "ar") throw new Error(`Expected lang="ar", got "${lang}"`);
      if (dir !== "rtl") throw new Error(`Expected dir="rtl", got "${dir}"`);
    });

    // 3. Booking Wizard with Material Flight & Infant Capacity Proof
    await checkStep("3. Booking Wizard & Capacity Proof (/book)", async () => {
      // Load booking results with deterministic capacity-proof scenario:
      // Scenario initial party: 1 adult + 1 infant (only 1 seat required)
      await page.goto(`${baseUrl}/book?studioPreview=1&scenario=booking.capacity-proof&step=results`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-surface-target="booking.flight-option"]', { timeout: 10000 });

      const isStudioIsolated = await page.evaluate(() => Boolean(window.__GZA_STUDIO_ISOLATED__));
      if (!isStudioIsolated) {
        throw new Error("Expected window.__GZA_STUDIO_ISOLATED__ to be true for studio preview URL");
      }
      const fakeCardsCount = await page.locator('[id^="flight-option-CAP-PROOF"]').count();
      if (fakeCardsCount !== 4) {
        throw new Error(`Expected 4 CAP-PROOF cards in Studio preview, got ${fakeCardsCount}`);
      }

      const opt1Seat = page.locator('#flight-option-CAP-PROOF-1SEAT');
      const optCancelled = page.locator('#flight-option-CAP-PROOF-CANCELLED');
      const optBoarding = page.locator('#flight-option-CAP-PROOF-BOARDING');

      await opt1Seat.waitFor({ state: "visible", timeout: 5000 });
      await optCancelled.waitFor({ state: "visible", timeout: 5000 });
      await optBoarding.waitFor({ state: "visible", timeout: 5000 });

      // Invariant 1: 1 adult + 1 infant requires 1 seat -> 1-seat flight is ENABLED and selectable
      const is1SeatDisabled = await opt1Seat.isDisabled();
      if (is1SeatDisabled) {
        throw new Error("Expected CAP-PROOF-1SEAT to be enabled for 1 adult + 1 infant party");
      }
      await opt1Seat.click();
      await page.waitForFunction(
        () => document.getElementById("flight-option-CAP-PROOF-1SEAT")?.getAttribute("data-state") === "checked",
        null,
        { timeout: 5000 },
      );

      // Invariant 2: Cancelled and Boarding options are disabled in DOM
      const isCancelledDisabled = await optCancelled.isDisabled();
      if (!isCancelledDisabled) {
        throw new Error("Expected Cancelled flight option to be disabled");
      }
      const isBoardingDisabled = await optBoarding.isDisabled();
      if (!isBoardingDisabled) {
        throw new Error("Expected Boarding flight option to be disabled");
      }

      // Invariant 3: Changing party to 1 adult + 1 child requires 2 seats -> 1-seat flight becomes DISABLED
      const changeSearchBtn = page.locator('button:has-text("Change search"), button:has-text("تعديل البحث")').first();
      await changeSearchBtn.click();
      await page.waitForSelector('#search-travellers', { timeout: 5000 });

      // Open Travellers popover
      await page.locator('#search-travellers').click();
      await page.waitForSelector('div[role="group"][aria-labelledby*="infants-label"]', { timeout: 5000 });

      // Decrement infants
      await page.locator('div[role="group"][aria-labelledby*="infants-label"] button').first().click();

      // Increment children
      await page.locator('div[role="group"][aria-labelledby*="children-label"] button').last().click();

      // Close popover
      await page.locator('button:has-text("Done"), button:has-text("تم")').first().click();

      // Submit search form
      await page.locator('button[type="submit"]:has-text("Search"), button[type="submit"]:has-text("بحث")').first().click();

      // Wait for results to reload
      await page.waitForSelector('#flight-option-CAP-PROOF-1SEAT', { timeout: 5000 });
      const opt1SeatAfterChild = page.locator('#flight-option-CAP-PROOF-1SEAT');

      // 1-seat option MUST now be disabled because 2 seats are required!
      const is1SeatDisabledAfterChild = await opt1SeatAfterChild.isDisabled();
      if (!is1SeatDisabledAfterChild) {
        throw new Error("Expected CAP-PROOF-1SEAT to become disabled when passenger party is 1 adult + 1 child");
      }

      // Reload capacity proof scenario to test Browse mode continuation through to Review
      await page.goto(`${baseUrl}/book?studioPreview=1&scenario=booking.capacity-proof&step=results`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('#flight-option-CAP-PROOF-AVAILABLE', { timeout: 5000 });

      // Invariant 4: Browse mode continuation through Review with CAP-PROOF-AVAILABLE
      const optAvailable = page.locator('#flight-option-CAP-PROOF-AVAILABLE');
      await optAvailable.click();

      // Click Continue to Fare
      const continueToFare = page.locator('button:has-text("Continue"), button:has-text("متابعة")').first();
      await continueToFare.click();
      await page.waitForSelector('[data-surface-target="booking.fare-option"]', { timeout: 5000 });

      // Click Continue to Passengers
      const continueToPax = page.locator('button:has-text("Continue"), button:has-text("متابعة")').first();
      await continueToPax.click();
      await page.waitForSelector('#contact-email', { timeout: 5000 });

      // Click Continue to Seats (passenger and contact details are prefilled by scenario)
      const continueToSeats = page.locator('button:has-text("Continue"), button:has-text("متابعة")').first();
      await continueToSeats.click();
      await page.waitForSelector('[data-surface-target="booking.seat-console"]', { timeout: 5000 });

      // Click Continue to Extras
      const continueToExtras = page.locator('button:has-text("Continue"), button:has-text("متابعة")').first();
      await continueToExtras.click();
      await page.waitForSelector('[data-surface-target="booking.extras"]', { timeout: 5000 });

      // Click Continue to Review
      const continueToReview = page.locator('button:has-text("Continue"), button:has-text("متابعة")').first();
      await continueToReview.click();
      await page.waitForSelector('[data-surface-target="booking.review-dossier"]', { timeout: 5000 });

      // Invariant 5: Review step renders localized fixture notice and disabled simulation button
      const fixtureNotice = page.locator('text=Appearance Studio Proof Fixture');
      await fixtureNotice.waitFor({ state: "visible", timeout: 5000 });

      const confirmBtn = page.locator('button:has-text("Simulation Only")');
      await confirmBtn.waitFor({ state: "visible", timeout: 5000 });
      const isConfirmDisabled = await confirmBtn.isDisabled();
      if (!isConfirmDisabled) {
        throw new Error("Expected Confirm button to be disabled for test fixture flight");
      }

      // Force click to prove confirm() does not throw or crash into error boundary
      await confirmBtn.click({ force: true });
      const errorCount =
        (await page.locator('[role="alert"]:has-text("Error")').count()) +
        (await page.locator('text=Application error').count());
      if (errorCount > 0) {
        throw new Error("Uncaught error boundary triggered on test fixture confirm");
      }

      // Record screenshot evidence
      await page.screenshot({ path: "scratch/booking-capacity-proof.png" });

      // Verify no storage pollution of production store
      const storePollution = await page.evaluate(() => {
        const raw = localStorage.getItem("gza.store.v1");
        return Boolean(raw && raw.includes("CAP-PROOF"));
      });
      if (storePollution) {
        throw new Error("Scenario fixture leaked into persistent localStorage key 'gza.store.v1'");
      }

      // Invariant 6: Verify regular Studio booking scenarios retain their requested steps
      const studioSteps = ["fare", "passengers", "seats", "extras", "review"];
      for (const st of studioSteps) {
        await page.goto(`${baseUrl}/book?step=${st}&studioPreview=1`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(100);
        const currentUrl = page.url();
        if (!currentUrl.includes(`step=${st}`)) {
          throw new Error(`Expected Studio preview URL to retain step=${st}, but was clamped to: ${currentUrl}`);
        }
      }
    });

    // 3b. Ordinary English URL Fixture Isolation Regression
    await checkStep("3b. Ordinary URL Fixture Isolation Proof (/book?scenario=...)", async () => {
      // Clear localStorage and visit /book with scenario param BUT WITHOUT studioPreview=1
      await page.goto(`${baseUrl}/book?scenario=booking.capacity-proof&step=results`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-surface-target="booking.flight-option"]', { timeout: 10000 });

      // Invariant 1: window.__GZA_STUDIO_ISOLATED__ MUST be false
      const isIsolated = await page.evaluate(() => Boolean(window.__GZA_STUDIO_ISOLATED__));
      if (isIsolated) {
        throw new Error("window.__GZA_STUDIO_ISOLATED__ leaked to true on an ordinary booking URL");
      }

      // Invariant 2: ZERO CAP-PROOF fixture options rendered
      const fakeCount = await page.locator('[id^="flight-option-CAP-PROOF"]').count();
      if (fakeCount > 0) {
        throw new Error(`Leaked ${fakeCount} CAP-PROOF fixture cards to ordinary booking URL`);
      }

      // Invariant 3: Ordinary schedule flights rendered
      const normalCount = await page.locator('[id^="flight-option-"]').count();
      if (normalCount === 0) {
        throw new Error("Expected ordinary flight options to render on results step");
      }

      // Invariant 4: Clicking an enabled normal option does not write any fixture ID to gza.store.v1
      const firstEnabled = page.locator('[id^="flight-option-"]:not([disabled])').first();
      if (await firstEnabled.count()) {
        await firstEnabled.click();
      }

      const storePollution = await page.evaluate(() => {
        const raw = localStorage.getItem("gza.store.v1");
        return Boolean(raw && raw.includes("CAP-PROOF"));
      });
      if (storePollution) {
        throw new Error("CAP-PROOF leaked into persistent storage from ordinary booking URL");
      }
    });

    // 3c. Ordinary Arabic URL Fixture Isolation Regression
    await checkStep("3c. Arabic Ordinary URL Fixture Isolation Proof (/ar/book?scenario=...)", async () => {
      // Visit /ar/book with scenario param BUT WITHOUT studioPreview=1
      await page.goto(`${baseUrl}/ar/book?scenario=booking.capacity-proof&step=results`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-surface-target="booking.flight-option"]', { timeout: 10000 });

      // Invariant 1: window.__GZA_STUDIO_ISOLATED__ MUST be false
      const isIsolated = await page.evaluate(() => Boolean(window.__GZA_STUDIO_ISOLATED__));
      if (isIsolated) {
        throw new Error("window.__GZA_STUDIO_ISOLATED__ leaked to true on Arabic ordinary booking URL");
      }

      // Invariant 2: ZERO CAP-PROOF fixture options rendered
      const fakeCount = await page.locator('[id^="flight-option-CAP-PROOF"]').count();
      if (fakeCount > 0) {
        throw new Error(`Leaked ${fakeCount} CAP-PROOF fixture cards to Arabic ordinary booking URL`);
      }

      // Invariant 3: Normal storage is not contaminated
      const storePollution = await page.evaluate(() => {
        const raw = localStorage.getItem("gza.store.v1");
        return Boolean(raw && raw.includes("CAP-PROOF"));
      });
      if (storePollution) {
        throw new Error("CAP-PROOF leaked into persistent storage from Arabic ordinary booking URL");
      }
    });

    // 4. Arabic Booking Wizard
    await checkStep("4. Arabic Booking Wizard (/ar/book)", async () => {
      await page.goto(`${baseUrl}/ar/book`, { waitUntil: "domcontentloaded" });
      const lang = await page.evaluate(() => document.documentElement.lang);
      const dir = await page.evaluate(() => document.documentElement.dir);
      if (lang !== "ar") throw new Error(`Expected lang="ar", got "${lang}"`);
      if (dir !== "rtl") throw new Error(`Expected dir="rtl", got "${dir}"`);

      // Verify Arabic regular Studio booking scenarios retain their requested steps
      const arStudioSteps = ["fare", "passengers", "seats", "extras", "review"];
      for (const st of arStudioSteps) {
        await page.goto(`${baseUrl}/ar/book?step=${st}&studioPreview=1`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(100);
        const currentUrl = page.url();
        if (!currentUrl.includes(`step=${st}`)) {
          throw new Error(`Expected Arabic Studio preview URL to retain step=${st}, but was clamped to: ${currentUrl}`);
        }
      }
    });

    // 5. Admin Appearance Studio with Material Interaction Proof
    await checkStep("5. Admin Appearance Studio & Controls Interaction", async () => {
      await page.goto(`${baseUrl}/admin/settings?tab=appearance`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-testid="studio-toolbar"]', { timeout: 10000 });
      await page.waitForSelector("iframe", { timeout: 10000 });

      // Check labeled groups are rendered
      const toolbar = page.locator('[data-testid="studio-toolbar"]');
      const toolbarText = (await toolbar.textContent()) ?? "";
      if (!toolbarText.includes("Viewport") || !toolbarText.includes("Mode") || !toolbarText.includes("Preview")) {
        throw new Error(`Appearance Studio toolbar missing labeled control groups (Viewport, Mode, Preview)`);
      }

      // Material Proof 1: Mode radiogroup [Inspect | Browse] click and selection
      const inspectRadio = page.locator('[data-testid="toggle-inspect-mode"] button[value="inspect"]');
      const browseRadio = page.locator('[data-testid="toggle-inspect-mode"] button[value="browse"]');
      await inspectRadio.waitFor({ state: "visible", timeout: 5000 });
      await browseRadio.waitFor({ state: "visible", timeout: 5000 });

      // Click Browse and verify selection state
      await browseRadio.click();
      const browseChecked = await browseRadio.getAttribute("aria-checked");
      if (browseChecked !== "true") throw new Error("Browse mode button did not set aria-checked='true'");

      // Click Inspect and verify selection state
      await inspectRadio.click();
      const inspectChecked = await inspectRadio.getAttribute("aria-checked");
      if (inspectChecked !== "true") throw new Error("Inspect mode button did not set aria-checked='true'");

      // Material Proof 1b: Radix roving tabindex and Arrow key navigation in English (LTR)
      await inspectRadio.focus();
      // ArrowRight moves to next item (browse)
      await page.keyboard.press("ArrowRight", { delay: 50 });
      if ((await browseRadio.getAttribute("aria-checked")) !== "true") {
        throw new Error("ArrowRight in LTR did not select browse radio");
      }
      if ((await browseRadio.getAttribute("tabindex")) !== "0") {
        throw new Error("Roving tabindex did not update to 0 for selected browse radio");
      }
      // ArrowLeft moves back to inspect
      await page.waitForTimeout(100);
      await page.keyboard.press("ArrowLeft", { delay: 50 });
      await page.waitForFunction(
        () => document.querySelector('[data-testid="toggle-inspect-mode"] button[value="inspect"]')?.getAttribute("aria-checked") === "true",
        null,
        { timeout: 5000 }
      );

      // Material Proof 2: Preview radiogroup [Draft | Baseline]
      const draftRadio = page.locator('[data-testid="toggle-baseline-mode"] button[value="draft"]');
      const baselineRadio = page.locator('[data-testid="toggle-baseline-mode"] button[value="baseline"]');
      await draftRadio.waitFor({ state: "visible", timeout: 5000 });
      await baselineRadio.waitFor({ state: "visible", timeout: 5000 });

      // Click Baseline and verify selection state
      await baselineRadio.click();
      const baselineChecked = await baselineRadio.getAttribute("aria-checked");
      if (baselineChecked !== "true") throw new Error("Baseline button did not set aria-checked='true'");

      // Click Draft and verify return to draft
      await draftRadio.click();
      const draftChecked = await draftRadio.getAttribute("aria-checked");
      if (draftChecked !== "true") throw new Error("Draft button did not set aria-checked='true'");

      // Material Proof 3: Secondary Design QA / Specimens affordance
      const specimensBtn = page.locator('button:has-text("Design QA")');
      if (await specimensBtn.isVisible()) {
        await specimensBtn.click();
        const backBtn = page.locator('button:has-text("Back to Studio")');
        await backBtn.waitFor({ state: "visible", timeout: 5000 });
        await backBtn.click();
        await page.waitForSelector("iframe", { timeout: 5000 });
      }
    });

    // 6. Arabic Appearance Studio Shell with RTL Arrow Key Navigation Proof
    await checkStep("6. Arabic Appearance Studio & RTL Arrow Navigation (/ar/admin/settings?tab=appearance)", async () => {
      await page.goto(`${baseUrl}/ar/admin/settings?tab=appearance`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-testid="studio-toolbar"]', { timeout: 10000 });
      await page.waitForSelector("iframe", { timeout: 10000 });
      const lang = await page.evaluate(() => document.documentElement.lang);
      if (lang !== "ar") throw new Error(`Expected lang="ar", got "${lang}"`);

      // Verify RTL-aware arrow keys: in RTL, ArrowLeft moves forward (to Browse), ArrowRight moves backward
      const arInspectRadio = page.locator('[data-testid="toggle-inspect-mode"] button[value="inspect"]');
      const arBrowseRadio = page.locator('[data-testid="toggle-inspect-mode"] button[value="browse"]');
      await arInspectRadio.waitFor({ state: "visible", timeout: 5000 });

      await arInspectRadio.focus();
      // ArrowLeft in RTL moves forward to browse
      await page.keyboard.press("ArrowLeft", { delay: 50 });
      if ((await arBrowseRadio.getAttribute("aria-checked")) !== "true") {
        throw new Error("ArrowLeft in RTL did not select browse radio");
      }
      if ((await arBrowseRadio.getAttribute("tabindex")) !== "0") {
        throw new Error("Roving tabindex did not update to 0 for RTL selected browse radio");
      }

      // ArrowRight in RTL moves backward to inspect
      await page.keyboard.press("ArrowRight", { delay: 50 });
      if ((await arInspectRadio.getAttribute("aria-checked")) !== "true") {
        throw new Error("ArrowRight in RTL did not move back to inspect radio");
      }
    });

    // 7. Flight Detail Bookability, Unavailable States & Navigation
    await checkStep("7. Flight Detail Bookability & Unbookable States (/flight/*)", async () => {
      // Deterministic future and past flight IDs (daily AMM service rotation 0)
      function getFutureFlightId(daysAhead = 3) {
        for (let i = daysAhead; i < daysAhead + 7; i++) {
          const iso = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
          const f = currentDeparturesOn(iso).find(f => f.destinationCode === "AMM");
          if (f) return f.id;
        }
        throw new Error("No opening AMM schedule date in fixture range");
      }
      function getPastFlightId(daysAgo = 7) {
        const iso = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
        return currentDeparturesOn(iso)[0].id;
      }

      const futureId = getFutureFlightId(3);
      const pastId = getPastFlightId(7);

      // 7a. Future bookable flight discovery & booking entry
      await page.goto(`${baseUrl}/flight/${futureId}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("h1", { timeout: 10000 });

      // Invariant 1: Bookable flight must render primary "Book this flight" CTA
      const bookBtn = page.locator('button:has-text("Book this flight")');
      await bookBtn.waitFor({ state: "visible", timeout: 5000 });

      // Invariant 2: Destination guide link must be present with accurate label (NOT "Book this route")
      const guideLink = page.locator('a[href*="/destinations/"]:has-text("Destination guide")');
      await guideLink.waitFor({ state: "visible", timeout: 5000 });

      // Invariant 3: Focus & Keyboard navigation test on booking CTA
      await bookBtn.focus();
      const isFocused = await page.evaluate(() => document.activeElement?.textContent?.includes("Book this flight"));
      if (!isFocused) throw new Error("Booking CTA did not receive keyboard focus");

      // Invariant 4: Clicking "Book this flight" transitions to /book with flight preloaded
      await bookBtn.click();
      await page.waitForURL((url) => url.pathname.includes("/book"), { timeout: 5000 });
      await page.waitForSelector('[data-surface-target="booking.flight-option"], [id^="flight-option-"]', { timeout: 10000 });

      // Assert user-visible / React state: the preloaded flight option exists and is checked
      const selectedOption = page.locator(`#flight-option-${futureId}`);
      await selectedOption.waitFor({ state: "visible", timeout: 5000 });
      const optionState = await selectedOption.getAttribute("data-state");
      const optionAriaChecked = await selectedOption.getAttribute("aria-checked");
      if (optionState !== "checked" || optionAriaChecked !== "true") {
        throw new Error(`Expected preloaded flight option #${futureId} to be selected (data-state="checked", aria-checked="true"), got state="${optionState}", aria-checked="${optionAriaChecked}"`);
      }

      // Assert persistent draft store in localStorage: outbound matches clicked flight ID
      const storedOutboundId = await page.evaluate(() => {
        try {
          const rawCanonical = localStorage.getItem("gza.booking.draft.v1");
          if (rawCanonical) {
            const parsed = JSON.parse(rawCanonical);
            if (parsed?.draft?.outbound?.id) return parsed.draft.outbound.id;
          }
          const raw = localStorage.getItem("gza.store.v1");
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          return parsed?.draft?.outbound?.id ?? null;
        } catch {
          return null;
        }
      });
      if (storedOutboundId !== futureId) {
        throw new Error(`Expected persistent draft outbound flight ID to be "${futureId}", got "${storedOutboundId}"`);
      }

      // 7b. Unbookable flight (past flight)
      await page.goto(`${baseUrl}/flight/${pastId}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("h1", { timeout: 10000 });

      // Invariant 5: Unbookable flight must NOT render active "Book this flight" CTA
      const unbookableBtnCount = await page.locator('button:has-text("Book this flight")').count();
      if (unbookableBtnCount > 0) {
        throw new Error("Unbookable/past flight unexpectedly rendered active 'Book this flight' button");
      }

      // Invariant 6: Localized unavailable explanation is present
      const unavailableBadge = page.locator('header span:has-text("Flight landed"), header span:has-text("Departure in the past"), header span:has-text("Flight cancelled"), header span:has-text("Flight departed")').first();
      await unavailableBadge.waitFor({ state: "visible", timeout: 5000 });

      // Invariant 7: Alternative link to /flights is rendered as primary CTA
      const flightsLink = page.locator('header a[href="/flights"]:has-text("Departures & arrivals")');
      await flightsLink.waitFor({ state: "visible", timeout: 5000 });

      // 7c. Missing / Unknown flight ID fallback
      await page.goto(`${baseUrl}/flight/PS999-NOT-FOUND-out`, { waitUntil: "domcontentloaded" });
      const notFoundHeading = page.locator('h3:has-text("Flight not found"), h2:has-text("Flight not found")');
      await notFoundHeading.waitFor({ state: "visible", timeout: 5000 });
      const returnToBoard = page.locator('a[href="/flights"]:has-text("Departures & arrivals")');
      await returnToBoard.waitFor({ state: "visible", timeout: 5000 });
    });

    // 8. Arabic Flight Detail & LTR Technical Formatting
    await checkStep("8. Arabic Flight Detail & Technical LTR Formatting (/ar/flight/*)", async () => {
      function getFutureFlightId(daysAhead = 3) {
        for (let i = daysAhead; i < daysAhead + 7; i++) {
          const iso = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
          const f = currentDeparturesOn(iso).find(f => f.destinationCode === "AMM");
          if (f) return f.id;
        }
        throw new Error("No opening AMM schedule date in fixture range");
      }
      function getPastFlightId(daysAgo = 7) {
        const iso = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
        return currentDeparturesOn(iso)[0].id;
      }

      const futureId = getFutureFlightId(3);
      const pastId = getPastFlightId(7);

      // 8a. Future Arabic flight detail
      await page.goto(`${baseUrl}/ar/flight/${futureId}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("h1", { timeout: 10000 });

      // Invariant 1: Document attributes
      const lang = await page.evaluate(() => document.documentElement.lang);
      const dir = await page.evaluate(() => document.documentElement.dir);
      if (lang !== "ar") throw new Error(`Expected lang="ar", got "${lang}"`);
      if (dir !== "rtl") throw new Error(`Expected dir="rtl", got "${dir}"`);

      // Invariant 2: Localized actions
      const arBookBtn = page.locator('button:has-text("احجز هذه الرحلة")');
      await arBookBtn.waitFor({ state: "visible", timeout: 5000 });
      const arGuideLink = page.locator('a[href*="/destinations/"]:has-text("دليل المحطة")');
      await arGuideLink.waitFor({ state: "visible", timeout: 5000 });

      // Invariant 3: Technical identifiers remain LTR
      const flightNumberEl = page.locator("header span.code-id").first();
      const fnDir = await flightNumberEl.getAttribute("dir");
      if (fnDir !== "ltr") {
        throw new Error(`Expected flight number to have dir="ltr", got "${fnDir}"`);
      }

      // Invariant 4: Clicking Arabic "احجز هذه الرحلة" transitions to /ar/book with preloaded flight
      await arBookBtn.click();
      await page.waitForURL((url) => url.pathname.includes("/ar/book"), { timeout: 5000 });
      await page.waitForSelector('[data-surface-target="booking.flight-option"], [id^="flight-option-"]', { timeout: 10000 });

      const arSelectedOption = page.locator(`#flight-option-${futureId}`);
      await arSelectedOption.waitFor({ state: "visible", timeout: 5000 });
      const arOptionState = await arSelectedOption.getAttribute("data-state");
      const arOptionAriaChecked = await arSelectedOption.getAttribute("aria-checked");
      if (arOptionState !== "checked" || arOptionAriaChecked !== "true") {
        throw new Error(`Expected Arabic preloaded flight option #${futureId} to be selected, got state="${arOptionState}", aria-checked="${arOptionAriaChecked}"`);
      }

      const arStoredOutboundId = await page.evaluate(() => {
        try {
          const rawCanonical = localStorage.getItem("gza.booking.draft.v1");
          if (rawCanonical) {
            const parsed = JSON.parse(rawCanonical);
            if (parsed?.draft?.outbound?.id) return parsed.draft.outbound.id;
          }
          const raw = localStorage.getItem("gza.store.v1");
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          return parsed?.draft?.outbound?.id ?? null;
        } catch {
          return null;
        }
      });
      if (arStoredOutboundId !== futureId) {
        throw new Error(`Expected Arabic persistent draft outbound flight ID to be "${futureId}", got "${arStoredOutboundId}"`);
      }

      // 8b. Arabic unbookable flight
      await page.goto(`${baseUrl}/ar/flight/${pastId}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("h1", { timeout: 10000 });

      // Must not render active book button
      const arUnbookableCount = await page.locator('button:has-text("احجز هذه الرحلة")').count();
      if (arUnbookableCount > 0) {
        throw new Error("Arabic unbookable flight unexpectedly rendered active 'احجز هذه الرحلة' button");
      }

      // Localized unbookable reason badge in Arabic (e.g. هبطت الرحلة, الرحلة ملغاة, etc.)
      const arUnavailableBadge = page.locator('header span:has-text("هبطت الرحلة"), header span:has-text("موعد الإقلاع قد مضى"), header span:has-text("الرحلة ملغاة"), header span:has-text("غادرت الرحلة")').first();
      await arUnavailableBadge.waitFor({ state: "visible", timeout: 5000 });

      // Alternative link to Arabic flight board
      const arFlightsLink = page.locator('header a[href="/ar/flights"]:has-text("المغادرة والوصول")');
      await arFlightsLink.waitFor({ state: "visible", timeout: 5000 });
    });

    // 9. Real Cross-Public/Admin Booking Journey Proof
    await checkStep("9. Real cross-public/admin booking journey proof", async () => {
      function getFutureFlightId(daysAhead = 3) {
        for (let i = daysAhead; i < daysAhead + 7; i++) {
          const iso = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
          const f = currentDeparturesOn(iso).find(f => f.destinationCode === "AMM");
          if (f) return f.id;
        }
        throw new Error("No opening AMM schedule date in fixture range");
      }

      const futureId = getFutureFlightId(4);
      let createdPnr = null;

      try {
        // 9a. Navigate to public flight detail and begin booking journey
        await page.goto(`${baseUrl}/flight/${futureId}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("h1", { timeout: 10000 });

        const bookBtn = page.locator('button:has-text("Book this flight")').first();
        await bookBtn.waitFor({ state: "visible", timeout: 5000 });
        await bookBtn.click();

        // 9b. Navigate through booking steps
        await page.waitForURL((url) => url.pathname.includes("/book"), { timeout: 10000 });

        // Step results -> fare
        const toFareBtn = page.locator('button:has-text("Continue"), button:has-text("متابعة")').first();
        await toFareBtn.waitFor({ state: "visible", timeout: 8000 });
        await toFareBtn.click();

        // Step fare -> passengers
        const toPaxBtn = page.locator('button:has-text("Continue"), button:has-text("متابعة")').first();
        await toPaxBtn.waitFor({ state: "visible", timeout: 8000 });
        await toPaxBtn.click();

        // Step passengers: enter required traveller details
        await page.waitForSelector("#fn-0", { timeout: 8000 });
        await page.fill("#fn-0", "Zaid");
        await page.fill("#ln-0", "Al-Khalidi");
        await page.locator("#dob-0").click();
        await page.waitForSelector(".rdp-day button:not([disabled]), button.rdp-day_button:not([disabled])", { timeout: 5000 });
        await page.locator(".rdp-day button:not([disabled]), button.rdp-day_button:not([disabled])").first().click();
        await page.waitForFunction(() => {
          const el = document.getElementById("dob-0");
          return el && (el.value || (el.textContent && !el.textContent.includes("Select")));
        }, null, { timeout: 5000 });
        await page.fill("#contact-email", "smoke9@example.com");
        await page.fill("#contact-phone", "+970599000000");

        const toSeatsBtn = page.locator('button:has-text("Continue"), button:has-text("متابعة")').first();
        await toSeatsBtn.click();
        await page.waitForSelector('[data-surface-target="booking.seat-console"]', { timeout: 8000 });

        // Step seats -> extras
        const toExtrasBtn = page.locator('button:has-text("Continue"), button:has-text("متابعة")').first();
        await toExtrasBtn.waitFor({ state: "visible", timeout: 8000 });
        await toExtrasBtn.click();
        await page.waitForSelector('[data-surface-target="booking.extras"]', { timeout: 8000 });

        // Step extras -> review
        const toReviewBtn = page.locator('button:has-text("Continue"), button:has-text("متابعة")').first();
        await toReviewBtn.waitFor({ state: "visible", timeout: 8000 });
        await toReviewBtn.click();
        await page.waitForSelector('[data-surface-target="booking.review-dossier"]', { timeout: 8000 });

        // Step review: confirm booking (authoritative repository mutation)
        await page.waitForSelector('button:has-text("Confirm booking"), button:has-text("Confirm")', { timeout: 8000 });
        const confirmBtn = page.locator('button:has-text("Confirm booking"), button:has-text("Confirm")').first();
        await confirmBtn.click();

        // 9c. Verify public confirmation view displays authoritative PNR
        await page.waitForURL((url) => url.pathname.includes("/booking-confirmation/"), { timeout: 15000 });
        const confUrl = new URL(page.url());
        createdPnr = confUrl.pathname.split("/").filter(Boolean).pop();
        if (!createdPnr || createdPnr.length < 5) {
          throw new Error(`Failed to extract valid PNR from confirmation URL: ${confUrl.pathname}`);
        }

        await page.locator(`.code-id:has-text("${createdPnr}")`).first().waitFor({ state: "visible", timeout: 15000 });
        const confText = await page.textContent("body");
        if (!confText.includes(createdPnr)) {
          throw new Error(`Public confirmation page does not display PNR ${createdPnr}`);
        }
        if (!confText.includes("Zaid") || !confText.includes("Al-Khalidi")) {
          throw new Error(`Public confirmation page does not display passenger name Zaid Al-Khalidi`);
        }

        // 9d. Navigate to /admin (Dashboard) and verify recent booking appears
        await page.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector('[data-testid="operations-summary"], table', { timeout: 10000 });
        const adminDashText = await page.textContent("body");
        if (!adminDashText.includes(createdPnr)) {
          throw new Error(`Admin Dashboard recent bookings list does not contain created PNR ${createdPnr}`);
        }

        // 9e. Navigate to /admin/bookings and verify row appears in table
        await page.goto(`${baseUrl}/admin/bookings`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("table", { timeout: 10000 });

        const searchInput = page.locator('#filter-search, input[placeholder*="Search"]');
        if (await searchInput.count() > 0) {
          await searchInput.first().fill(createdPnr);
        }

        const bookingRow = page.locator(`tr:has-text("${createdPnr}")`);
        await bookingRow.waitFor({ state: "visible", timeout: 5000 });
        const rowText = await bookingRow.textContent();
        if (!rowText.includes("Zaid") || !rowText.includes("Al-Khalidi")) {
          throw new Error(`Admin booking table row for ${createdPnr} missing passenger name`);
        }

        // 9f. Navigate to /admin/bookings/:ref and verify detail view loads with no empty state
        await page.goto(`${baseUrl}/admin/bookings/${createdPnr}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("header", { timeout: 10000 });

        const emptyCount = await page.locator(':has-text("Booking not found"), :has-text("لم يتم العثور على الحجز")').count();
        if (emptyCount > 0) {
          throw new Error(`Admin booking detail for ${createdPnr} incorrectly rendered "Booking not found"`);
        }

        const detailText = await page.textContent("body");
        if (!detailText.includes(createdPnr) || !detailText.includes("Zaid") || !detailText.includes("Al-Khalidi")) {
          throw new Error(`Admin booking detail for ${createdPnr} missing PNR or passenger identity`);
        }
      } finally {
        // Clean up created booking from canonical storage to keep baseline clean
        if (createdPnr) {
          await page.evaluate((ref) => {
            try {
              const raw = localStorage.getItem("gza.repo.v1");
              if (raw) {
                const state = JSON.parse(raw);
                state.bookings = state.bookings.filter((b) => b.ref !== ref);
                localStorage.setItem("gza.repo.v1", JSON.stringify(state));
              }
            } catch {
              // ignore
            }
          }, createdPnr);
        }
      }
    });

    // 10. Operational Flight Override Reflection Proof via Admin UI
    await checkStep("10. Operational flight override reflection proof via Admin UI", async () => {
      function getFutureFlight(daysAhead = 3) {
        for (let i = daysAhead; i < daysAhead + 7; i++) {
          const iso = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
          const f = currentDeparturesOn(iso).find(f => f.destinationCode === "AMM");
          if (f) return f;
        }
        throw new Error("No opening AMM schedule date in fixture range");
      }

      const targetFlight = getFutureFlight(5);
      const targetFlightId = targetFlight.id;
      let flightId = targetFlightId;
      const overrideGate = "B7";

      try {
        // 10a. Navigate to Admin Flights board and use existing Quick Edit UI
        await page.goto(`${baseUrl}/admin/flights`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("table", { timeout: 10000 });

        // Set date filter to target flight's date
        const flightDate = targetFlight.date;
        const dateInput = page.locator('input[type="date"]').first();
        if (await dateInput.count() > 0) {
          await dateInput.fill(flightDate);
          await page.waitForTimeout(500);
        }

        // Locate flight row and open Quick Edit
        const row = page.locator("tr").filter({has: page.locator(`a[href$="/${targetFlightId}"]`)}).first();
        await row.waitFor({ state: "visible", timeout: 8000 });
        const detailHref = await row.locator('a[href*="/admin/flights/"]').getAttribute("href");
        const selectedId = detailHref?.split("/").pop();
        if (!selectedId) throw new Error("Could not resolve the selected Admin flight row ID");
        flightId = selectedId;

        const quickEditBtn = row.locator('button:has-text("Quick edit")');
        await quickEditBtn.click();

        // In quick edit sheet, set status to Delayed and gate to B7
        await page.waitForSelector("#fq-status", { timeout: 5000 });
        await page.selectOption("#fq-status", "Delayed");
        await page.fill("#fq-gate", overrideGate);

        const saveBtn = page.getByRole("button", { name: "Save changes", exact: true });
        await saveBtn.waitFor({ state: "visible" });
        await saveBtn.scrollIntoViewIfNeeded();
        await saveBtn.click();
        await page.waitForFunction(
          ({ id, gate }) => {
            const raw = localStorage.getItem("gza.repo.v1");
            if (!raw) return false;
            const override = JSON.parse(raw).flightOverrides?.[id];
            return override?.status === "Delayed" && override?.gate === gate;
          },
          { id: flightId, gate: overrideGate },
          { timeout: 10000 },
        );

        // 10b. Navigate to public flight detail and verify operational override is reflected
        await page.goto(`${baseUrl}/flight/${flightId}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(
          (gate) => document.body?.innerText.includes("Delayed") && document.body?.innerText.includes(gate),
          overrideGate,
          { timeout: 10000 },
        );

        const publicDetailText = await page.textContent("body");
        if (!publicDetailText.includes("Delayed")) {
          throw new Error(`Expected public flight detail to reflect overridden status "Delayed"`);
        }
        if (!publicDetailText.includes(overrideGate)) {
          throw new Error(`Expected public flight detail to reflect overridden gate "${overrideGate}"`);
        }

        // 10c. Navigate to admin flight detail (/admin/flights/:flightId)
        await page.goto(`${baseUrl}/admin/flights/${flightId}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(
          () => document.body?.innerText.includes("Delayed"),
          null,
          { timeout: 10000 },
        );
        const adminDetailText = await page.textContent("body");
        if (!adminDetailText.includes("Delayed")) {
          throw new Error(`Expected admin flight detail to reflect overridden status "Delayed"`);
        }
      } finally {
        // Clean up override in storage
        await page.evaluate((id) => {
          try {
            const raw = localStorage.getItem("gza.repo.v1");
            if (raw) {
              const state = JSON.parse(raw);
              delete state.flightOverrides[id];
              localStorage.setItem("gza.repo.v1", JSON.stringify(state));
            }
          } catch {
            // ignore
          }
        }, flightId);
      }
    });

    // 11. Studio Repository Isolation Sentinel Proof (gza.repo.v1, gza.store.v1, gza.admin.v1)
    await checkStep("11. Studio repository isolation sentinel proof for all three keys", async () => {
      const sentinelRepo = {
        schemaVersion: 1,
        bookings: [{
          ref: "SENTINEL-STUDIO-PROOF",
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "confirmed",
          total: 195,
          outbound: {
            id: "PS100-2026-10-15-out",
            number: "PS 100",
            originCode: "GZA",
            destinationCode: "CAI",
            date: "2026-10-15",
            departTime: "08:00",
            arriveTime: "09:15",
            durationMinutes: 75,
            aircraft: "Boeing 737-700",
            status: "Scheduled",
            gate: "A1",
            terminal: "1",
            basePrice: 180,
            seatsLeft: 42,
          },
          inbound: null,
          fareId: "classic",
          passengers: [{ id: "pax-SENTINEL-0", type: "adult", firstName: "Sentinel", lastName: "Auditor" }],
          seats: {},
          extras: { pax: [] },
          contact: { email: "sentinel@test.com", phone: "+12345" },
          checkedIn: { out: [], in: [] },
          ownerEmail: null,
        }],
        flightOverrides: {
          "PS100-2026-10-15-out": {
            flightId: "PS100-2026-10-15-out",
            gate: "SENTINEL-GATE-PROOF",
            status: "Scheduled",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      };

      const sentinelStore = {
        account: {
          email: "sentinel-store@example.com",
          firstName: "Store",
          lastName: "Sentinel",
          phone: "+111222333",
          seatPreference: "window",
          mealPreference: "standard",
          newsletter: false,
        },
        travelers: [
          { id: "t-sentinel-1", firstName: "StoreTraveler", lastName: "Sentinel", dob: "1990-01-01", nationality: "PS", document: "DOC1" },
        ],
        legacyStoreToken: "STORE_SENTINEL_TOKEN_ABC",
      };

      const sentinelAdmin = {
        staffId: "st-ops-01",
        overrides: {
          "LEGACY-SENTINEL-FLIGHT": {
            flightId: "LEGACY-SENTINEL-FLIGHT",
            gate: "LEGACY-GATE-SENTINEL",
            status: "Delayed",
          },
        },
        legacyAdminToken: "ADMIN_SENTINEL_TOKEN_XYZ",
      };

      const expectedRepoRaw = JSON.stringify(sentinelRepo);
      const expectedStoreRaw = JSON.stringify(sentinelStore);
      const expectedAdminRaw = JSON.stringify(sentinelAdmin);

      // 11a. Inject sentinels into localStorage from an isolated origin before the Studio action
      await page.goto(`${baseUrl}/?studioPreview=1`, { waitUntil: "domcontentloaded" });
      await page.evaluate(({ repo, store, admin }) => {
        localStorage.setItem("gza.repo.v1", repo);
        localStorage.setItem("gza.store.v1", store);
        localStorage.setItem("gza.admin.v1", admin);
      }, { repo: expectedRepoRaw, store: expectedStoreRaw, admin: expectedAdminRaw });

      try {
        // 11b. Load regular Studio review scenario with non-CAP-PROOF flights
        await page.goto(`${baseUrl}/book?step=review&studioPreview=1`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("h1#review-title, [data-surface-family='dossier']", { timeout: 10000 });

        // Confirm button is visible
        const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("تأكيد")');
        await confirmBtn.first().waitFor({ state: "visible", timeout: 5000 });

        // 11c. Click confirm button inside the isolated Studio preview
        await confirmBtn.first().click();

        // 11d. Reload while in Studio preview to verify isolated frame lifecycle
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1000);

        // 11e. VERIFY in Studio: ALL THREE keys remain 100% BYTE-IDENTICAL.
        // A missing production session pointer is intentionally not resolved or cleared here.
        const actualRepoRaw = await page.evaluate(() => localStorage.getItem("gza.repo.v1"));
        const actualStoreRaw = await page.evaluate(() => localStorage.getItem("gza.store.v1"));
        const actualAdminRaw = await page.evaluate(() => localStorage.getItem("gza.admin.v1"));

        if (actualRepoRaw !== expectedRepoRaw) {
          throw new Error(
            `Studio action mutated persistent gza.repo.v1!\nExpected: ${expectedRepoRaw}\nActual:   ${actualRepoRaw}`
          );
        }

        if (actualStoreRaw !== expectedStoreRaw) {
          throw new Error(
            `Studio action mutated persistent gza.store.v1!\nExpected: ${expectedStoreRaw}\nActual:   ${actualStoreRaw}`
          );
        }

        if (actualAdminRaw !== expectedAdminRaw) {
          throw new Error(
            `Studio action mutated persistent gza.admin.v1!\nExpected: ${expectedAdminRaw}\nActual:   ${actualAdminRaw}`
          );
        }

        // 11f. Outside Studio, normal canonical session resolution revokes this
        // nonexistent identity (Correction 05) without touching compatible fields.
        await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => JSON.parse(localStorage.getItem("gza.admin.v1") || "{}").staffId === null);
        const revokedAdminRaw = await page.evaluate(() => localStorage.getItem("gza.admin.v1"));
        if (revokedAdminRaw !== JSON.stringify({ ...sentinelAdmin, staffId: null })) {
          throw new Error("Normal missing-session revocation changed compatible sentinel fields");
        }
        if (await page.evaluate(() => localStorage.getItem("gza.repo.v1")) !== expectedRepoRaw ||
            await page.evaluate(() => localStorage.getItem("gza.store.v1")) !== expectedStoreRaw) {
          throw new Error("Leaving Studio modified unrelated persistent domain sentinels");
        }
      } finally {
        // Clean up sentinels from localStorage
        await page.evaluate(() => {
          localStorage.removeItem("gza.repo.v1");
          localStorage.removeItem("gza.store.v1");
          localStorage.removeItem("gza.admin.v1");
        });
      }
    });

    // 12. Public mutation failure path: storage.setItem blocked → edit must NOT advance
    await checkStep("12. Public mutation failure: blocked storage preserves original booking", async () => {
      // 12a. Navigate to manage page with seed booking GZA4TQ
      await page.goto(`${baseUrl}/manage/GZA4TQ`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);

      // 12b. Capture original contact email from the page
      const originalEmail = await page.evaluate(() => {
        const repoRaw = localStorage.getItem("gza.repo.v1");
        if (!repoRaw) return null;
        const repo = JSON.parse(repoRaw);
        const booking = repo.bookings.find((b) => b.ref === "GZA4TQ");
        return booking?.contact?.email ?? null;
      });

      if (!originalEmail) {
        throw new Error("Could not find seed booking GZA4TQ in repository storage");
      }

      // 12c. Navigate to contact edit page
      await page.goto(`${baseUrl}/manage/GZA4TQ/contact`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);

      // 12d. Block storage.setItem to simulate storage failure
      await page.evaluate(() => {
        const origSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function () {
          throw new Error("QuotaExceededError: blocked by smoke test");
        };
        // Store original for later restore
        window.__origSetItem = origSetItem;
      });

      // 12e. Clear email field and type a new email
      const emailInput = await page.locator('input[type="email"]').first();
      await emailInput.fill("smoke-failure-test@example.com");

      // 12f. Submit the form
      const saveBtn = await page.getByRole("button", { name: /save/i }).first();
      await saveBtn.click();
      await page.waitForTimeout(1000);

      // 12g. Verify error message appears (role="alert") - should NOT advance to saved state
      const errorAlert = await page.locator('[role="alert"]');
      const alertCount = await errorAlert.count();

      // 12h. Restore storage.setItem
      await page.evaluate(() => {
        if (window.__origSetItem) {
          Storage.prototype.setItem = window.__origSetItem;
          delete window.__origSetItem;
        }
      });

      if (alertCount === 0) {
        throw new Error("Expected error alert when storage.setItem is blocked, but none found");
      }

      // 12i. Verify original booking data is preserved in repository
      const preservedEmail = await page.evaluate(() => {
        const repoRaw = localStorage.getItem("gza.repo.v1");
        if (!repoRaw) return null;
        const repo = JSON.parse(repoRaw);
        const booking = repo.bookings.find((b) => b.ref === "GZA4TQ");
        return booking?.contact?.email ?? null;
      });

      if (preservedEmail !== originalEmail) {
        throw new Error(
          `Booking contact email was corrupted after failed save! Expected "${originalEmail}", got "${preservedEmail}"`
        );
      }
    });

    await checkStep("13. Empty canonical bookings never resurrect static admin records", async () => {
      const authorityContext = await browser.newContext();
      await authorityContext.addInitScript(() => {
        localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
        localStorage.setItem("gza.repo.v1", JSON.stringify({ schemaVersion: 1, bookings: [], flightOverrides: {} }));
      });
      const authorityPage = await authorityContext.newPage();
      try {
        await authorityPage.goto(`${baseUrl}/admin/bookings`, { waitUntil: "domcontentloaded" });
        await authorityPage.getByText("No bookings match these filters").waitFor({ state: "visible" });
        if (await authorityPage.getByText("GZA4TQ", { exact: true }).count()) {
          throw new Error("Static booking reappeared in an empty canonical list");
        }

        await authorityPage.goto(`${baseUrl}/admin/bookings/GZA4TQ`, { waitUntil: "domcontentloaded" });
        await authorityPage.getByText("This record is not in the prototype data.").waitFor({ state: "visible" });
        if (await authorityPage.getByText("Nadia Sabbagh", { exact: true }).count()) {
          throw new Error("Static booking was resurrected for a canonical missing PNR");
        }

        await authorityPage.goto(`${baseUrl}/booking-confirmation/GZA4TQ`, { waitUntil: "domcontentloaded" });
        await authorityPage.getByText("We couldn't find that booking reference").waitFor({ state: "visible" });

        await authorityPage.goto(`${baseUrl}/admin/bookings`, { waitUntil: "domcontentloaded" });
        await authorityPage.getByText("No bookings match these filters").waitFor({ state: "visible" });
        await authorityPage.getByRole("button", { name: "Search the workspace" }).click();
        await authorityPage.getByRole("combobox", { name: "Search the workspace" }).fill("GZA4TQ");
        await authorityPage.getByText("Nothing matches “GZA4TQ”.").waitFor({ state: "visible" });
        if (await authorityPage.getByText("Nadia Sabbagh", { exact: true }).count()) {
          throw new Error("Admin Search resurrected a static booking");
        }
      } finally {
        await authorityContext.close();
      }
    });

    await checkStep("14. Travel CMS draft persists, previews bilingually, and leaves published routes unchanged", async () => {
      const cmsContext = await browser.newContext();
      await cmsContext.addInitScript(() => {
        localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
      });
      const cmsPage = await cmsContext.newPage();
      const enDraft = "Phase 4B English draft proof";
      const arDraft = "مسودة عربية للاختبار";
      try {
        await cmsPage.goto(`${baseUrl}/admin/website`, { waitUntil: "domcontentloaded" });
        await cmsPage.getByRole("tab", { name: "Travel information" }).click();
        await cmsPage.locator("#tr-intro-title-en").waitFor({ state: "visible" });
        const publishedTitle = await cmsPage.locator("#tr-intro-title-en").inputValue();
        await cmsPage.locator("#tr-intro-title-en").fill(enDraft);
        await cmsPage.getByRole("button", { name: "Save draft" }).click();
        await cmsPage.waitForFunction(() => {
          const raw = localStorage.getItem("gza.content.draft.v1");
          return raw && JSON.parse(raw).drafts.travel.intro.title.en === "Phase 4B English draft proof";
        });
        await cmsPage.reload({ waitUntil: "domcontentloaded" });
        await cmsPage.getByRole("tab", { name: "Travel information" }).click();
        await cmsPage.locator("#tr-intro-title-en").waitFor({ state: "visible" });
        if (await cmsPage.locator("#tr-intro-title-en").inputValue() !== enDraft) throw new Error("Saved English draft did not survive reload");

        await cmsPage.goto(`${baseUrl}/travel?contentPreview=1`, { waitUntil: "domcontentloaded" });
        await cmsPage.getByRole("heading", { name: enDraft, exact: true }).waitFor({ state: "visible" });
        await cmsPage.locator('[role="status"]').filter({ hasText: "Not published" }).first().waitFor({ state: "visible" });
        await cmsPage.goto(`${baseUrl}/travel`, { waitUntil: "domcontentloaded" });
        await cmsPage.getByText(publishedTitle, { exact: true }).first().waitFor({ state: "visible" });
        if (await cmsPage.getByText(enDraft, { exact: true }).count()) throw new Error("Normal Travel route applied local draft");

        await cmsPage.goto(`${baseUrl}/admin/website`, { waitUntil: "domcontentloaded" });
        await cmsPage.getByRole("tab", { name: "Travel information" }).click();
        await cmsPage.getByRole("button", { name: "Arabic", exact: true }).click();
        await cmsPage.locator("#tr-intro-title-ar").fill(arDraft);
        await cmsPage.getByRole("button", { name: "Save draft" }).click();
        await cmsPage.waitForFunction(() => {
          const draft = JSON.parse(localStorage.getItem("gza.content.draft.v1") || "{}").drafts?.travel;
          return draft?.intro?.title.ar === "مسودة عربية للاختبار";
        });
        const saved = await cmsPage.evaluate(() => JSON.parse(localStorage.getItem("gza.content.draft.v1")).drafts.travel);
        if (saved.intro.title.en !== enDraft) throw new Error("Arabic edit erased English draft");
        await cmsPage.goto(`${baseUrl}/ar/travel?contentPreview=1`, { waitUntil: "domcontentloaded" });
        await cmsPage.getByRole("heading", { name: arDraft, exact: true }).waitFor({ state: "visible" });
        await cmsPage.goto(`${baseUrl}/ar/travel`, { waitUntil: "domcontentloaded" });
        if (await cmsPage.getByText(arDraft, { exact: true }).count()) throw new Error("Normal Arabic route applied local draft");

        await cmsPage.goto(`${baseUrl}/admin/website`, { waitUntil: "domcontentloaded" });
        await cmsPage.getByRole("tab", { name: "Travel information" }).click();
        await cmsPage.getByRole("button", { name: "Discard draft" }).click();
        await cmsPage.getByRole("alertdialog").getByRole("button", { name: "Discard draft", exact: true }).click();
        await cmsPage.waitForFunction(() => !JSON.parse(localStorage.getItem("gza.content.draft.v1") || "{}").drafts?.travel);
        await cmsPage.goto(`${baseUrl}/travel?contentPreview=1`, { waitUntil: "domcontentloaded" });
        await cmsPage.getByText(publishedTitle, { exact: true }).first().waitFor({ state: "visible" });
      } finally {
        await cmsContext.close();
      }
    });

    await checkStep("15. Published Home, Travel, Past and Admin read panels survive corrupt draft storage on desktop and mobile", async () => {
      const contentContext = await browser.newContext();
      await contentContext.addInitScript(() => {
        localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
        localStorage.setItem("gza.content.draft.v1", "{malformed");
      });
      const contentPage = await contentContext.newPage();
      const hydrationErrors = [];
      const consoleErrors = [];
      contentPage.on("console", (message) => {
        if (message.type() === "error") {
          // The isolated smoke environment may deny the site's external Google Fonts request.
          const deniedExternalFont = message.text().includes("ERR_NETWORK_ACCESS_DENIED") &&
            message.location().url.startsWith("https://fonts.googleapis.com/");
          if (!deniedExternalFont) consoleErrors.push(`${message.text()} ${message.location().url}`);
          if (/hydration|did not match|server rendered html/i.test(message.text())) hydrationErrors.push(message.text());
        }
      });
      try {
        for (const width of [1280, 390]) {
          await contentPage.setViewportSize({ width, height: 850 });
          for (const path of ["/", "/ar", "/travel", "/ar/travel", "/airport/past", "/ar/airport/past",
            "/admin/website", "/ar/admin/website", "/admin/airport", "/ar/admin/airport"]) {
            await contentPage.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
            const expectedLang = path.startsWith("/ar") ? "ar" : "en";
            if (await contentPage.locator("html").getAttribute("lang") !== expectedLang) throw new Error(`Wrong locale at ${path}`);
            await contentPage.waitForFunction(() => document.body?.innerText.length > 80, null, { timeout: 10000 })
              .catch(() => { throw new Error(`Empty content at ${path}`); });
          }
        }
        await contentPage.goto(`${baseUrl}/travel?contentPreview=1`, { waitUntil: "domcontentloaded" });
        await contentPage.getByRole("heading", { name: "Preparing to travel" }).waitFor({ state: "visible" });
        if (hydrationErrors.length) throw new Error(`Hydration warning: ${hydrationErrors[0]}`);
        if (consoleErrors.length) throw new Error(`Console error: ${consoleErrors[0]}`);
      } finally {
        await contentContext.close();
      }
    });

    await checkStep("16. Travel CMS storage failure never reports a successful draft save", async () => {
      const failContext = await browser.newContext();
      await failContext.addInitScript(() => {
        localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
      });
      const failPage = await failContext.newPage();
      try {
        await failPage.goto(`${baseUrl}/admin/website`, { waitUntil: "domcontentloaded" });
        await failPage.getByRole("tab", { name: "Travel information" }).click();
        await failPage.locator("#tr-intro-title-en").fill("Storage failure draft");
        await failPage.evaluate(() => {
          window.__contentOriginalSetItem = Storage.prototype.setItem;
          Storage.prototype.setItem = function () { throw new Error("Storage blocked"); };
        });
        await failPage.getByRole("button", { name: "Save draft" }).click();
        await failPage.getByRole("alert").filter({ hasText: "The draft could not be saved in this browser. Your edits have been kept." }).waitFor({ state: "visible" });
        const raw = await failPage.evaluate(() => localStorage.getItem("gza.content.draft.v1"));
        if (raw !== null) throw new Error("Failed save wrote a draft");
      } finally {
        await failPage.evaluate(() => {
          if (window.__contentOriginalSetItem) Storage.prototype.setItem = window.__contentOriginalSetItem;
        }).catch(() => {});
        await failContext.close();
      }
    });

    await checkStep("17. Content viewer cannot mutate a Travel draft", async () => {
      const viewerContext = await browser.newContext();
      await viewerContext.addInitScript(() => {
        localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-3", overrides: {} }));
      });
      const viewerPage = await viewerContext.newPage();
      try {
        await viewerPage.goto(`${baseUrl}/admin/website`, { waitUntil: "domcontentloaded" });
        await viewerPage.getByRole("tab", { name: "Travel information" }).click();
        await viewerPage.locator("#tr-intro-title-en").waitFor({ state: "visible" });
        if (!await viewerPage.locator("#tr-intro-title-en").evaluate((input) => input.readOnly)) {
          throw new Error("Viewer received an editable Travel field");
        }
        if (!await viewerPage.getByRole("button", { name: "Save draft" }).isDisabled()) {
          throw new Error("Viewer received an enabled Save Draft action");
        }
        if (await viewerPage.evaluate(() => localStorage.getItem("gza.content.draft.v1"))) {
          throw new Error("Viewer created a draft");
        }
      } finally {
        await viewerContext.close();
      }
    });

    await checkStep("18. Decorative card assets load at correct placements", async () => {
      // Helper: scroll element into view then wait for naturalWidth > 0
      async function waitForImgLoad(selector, label, timeout = 10000) {
        await page.waitForSelector(selector, { timeout });
        // Scroll into viewport so lazy loading triggers
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) el.scrollIntoView({ behavior: "instant", block: "center" });
        }, selector);
        // Poll until naturalWidth > 0 (image decoded)
        await page.waitForFunction(
          (sel) => {
            const img = document.querySelector(sel);
            return img && img.complete && img.naturalWidth > 0;
          },
          selector,
          { timeout }
        );
        const nw = await page.evaluate((sel) => {
          const img = document.querySelector(sel);
          return img ? img.naturalWidth : -1;
        }, selector);
        if (nw <= 0) throw new Error(`${label} did not load (naturalWidth=${nw})`);
        return nw;
      }

      // ── Home page: already-booked and before-travel cards ─────────────────
      await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

      await waitForImgLoad(
        '[data-decorative-asset="already-booked-card"] img[aria-hidden="true"]',
        "Already-booked decorative image"
      );
      await waitForImgLoad(
        '[data-decorative-asset="before-travel-card"] img[aria-hidden="true"]',
        "Before-travel decorative image"
      );

      for (const asset of ["already-booked-card", "before-travel-card"]) {
        const src = await page.locator(`[data-decorative-asset="${asset}"] img`).getAttribute("src");
        if (!src?.endsWith(".webp")) throw new Error(`${asset} is not a WebP URL: ${src}`);
      }

      // ── Destinations page: 7 cards with WebPs, IST top photo + lower decorated body ──────
      await page.goto(`${baseUrl}/destinations`, { waitUntil: "networkidle" });

      // Verify all 7 destination cards have top city photo WebPs (no Picsum)
      const photoCards = await page.locator('img[data-destination-photo]').all();
      if (photoCards.length !== 7) {
        throw new Error(`Expected 7 destination photo cards on /destinations, got ${photoCards.length}`);
      }

      for (const cardImg of photoCards) {
        const src = await cardImg.getAttribute("src");
        const srcSet = await cardImg.getAttribute("srcSet");
        if (src?.includes("picsum.photos") || srcSet?.includes("picsum.photos")) {
          throw new Error(`Destination card image uses deprecated Picsum source: ${src}`);
        }
        if (!src?.includes(".webp") && !srcSet?.includes(".webp")) {
          throw new Error(`Destination card image is not WebP: ${src}`);
        }
      }

      // Check all 7 destination cards load their top city photograph (complete && naturalWidth > 0)
      const destinationCodes = ["AMM", "CAI", "IST", "DOH", "DXB", "JED", "RUH"];
      for (const code of destinationCodes) {
        await waitForImgLoad(`img[data-destination-photo="${code}"]`, `${code} top photograph`);
      }

      // Check all 7 destination cards have the shared lower card body decorative asset loaded as WebP
      const bodyArtCards = await page.locator('[data-decorative-asset="destination-card-body"]').all();
      if (bodyArtCards.length !== 7) {
        throw new Error(`Expected 7 destination card body decorative images on /destinations, got ${bodyArtCards.length}`);
      }

      for (let i = 0; i < bodyArtCards.length; i++) {
        const bodyImg = bodyArtCards[i];
        const src = await bodyImg.getAttribute("src");
        if (!src?.includes(".webp")) {
          throw new Error(`Destination card body art [${i}] is not a WebP URL: ${src}`);
        }
      }

      // Verify all 7 body decorative images load completely (naturalWidth > 0)
      for (let i = 0; i < 7; i++) {
        await page.evaluate((idx) => {
          const imgs = document.querySelectorAll('[data-decorative-asset="destination-card-body"]');
          if (imgs[idx]) imgs[idx].scrollIntoView({ behavior: "instant", block: "center" });
        }, i);
        await page.waitForFunction(
          (idx) => {
            const imgs = document.querySelectorAll('[data-decorative-asset="destination-card-body"]');
            const img = imgs[idx];
            return img && img.complete && img.naturalWidth > 0;
          },
          i,
          { timeout: 15000 }
        );
      }

      // Verify no decorative body art appears in the top image stage of any card
      const artInTopStage = await page.evaluate(() => {
        const allCards = Array.from(document.querySelectorAll('a[data-surface-target="home.destination-card"]'));
        return allCards.some((card) => {
          const photoImg = card.querySelector('img[data-destination-photo]');
          const topStage = photoImg?.parentElement;
          return topStage?.querySelector('[data-decorative-asset="destination-card-body"]') !== null;
        });
      });
      if (artInTopStage) {
        throw new Error("Decorative body art unexpectedly found in top image stage of destination card");
      }

      // GZA9MK is a deterministic seed with outbound passenger 0 checked in.
      await page.goto(`${baseUrl}/boarding-pass/GZA9MK/out/0`, { waitUntil: "domcontentloaded" });
      await waitForImgLoad(
        '[data-decorative-asset="boarding-pass-ticket-band"] img[aria-hidden="true"]',
        "Boarding-pass band decorative image"
      );
      const ticketSrc = await page.locator('[data-decorative-asset="boarding-pass-ticket-band"] img').getAttribute("src");
      if (!ticketSrc?.includes(".webp")) throw new Error(`Ticket art is not a WebP URL: ${ticketSrc}`);
    });

    await checkStep("19. Destination detail route proof: renders hero photograph, facts, schedule, and bilingual content without route occlusion (/destinations/IST, /destinations/DXB, /ar/destinations/IST)", async () => {
      // 19a. English Istanbul Detail (/destinations/IST)
      await page.goto(`${baseUrl}/destinations/IST`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("h1", { timeout: 10000 });
      const istH1 = await page.locator("h1").innerText();
      if (!istH1.includes("Istanbul")) {
        throw new Error(`Expected Istanbul H1, got: "${istH1}"`);
      }
      const istHero = page.locator('img[data-destination-hero-photo="IST"]');
      await istHero.waitFor({ state: "visible", timeout: 8000 });
      const istHeroSrc = await istHero.getAttribute("src");
      if (!istHeroSrc?.includes(".webp")) {
        throw new Error(`Istanbul detail hero is not a WebP: ${istHeroSrc}`);
      }
      const pageText = await page.textContent("body");
      if (!pageText.includes("GZA") || !pageText.includes("IST")) {
        throw new Error("Istanbul detail page missing route codes");
      }
      if (!pageText.includes("Good to know") && !pageText.includes("Flight schedule") && !pageText.includes("Schedule")) {
        throw new Error("Istanbul detail page missing schedule or Good to know section");
      }

      // 19b. English Dubai Detail (/destinations/DXB)
      await page.goto(`${baseUrl}/destinations/DXB`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("h1", { timeout: 10000 });
      const dxbH1 = await page.locator("h1").innerText();
      if (!dxbH1.includes("Dubai")) {
        throw new Error(`Expected Dubai H1, got: "${dxbH1}"`);
      }
      const dxbHero = page.locator('img[data-destination-hero-photo="DXB"]');
      await dxbHero.waitFor({ state: "visible", timeout: 8000 });
      const dxbHeroSrc = await dxbHero.getAttribute("src");
      if (!dxbHeroSrc?.includes(".webp")) {
        throw new Error(`Dubai detail hero is not a WebP: ${dxbHeroSrc}`);
      }

      // 19c. Arabic Istanbul Detail (/ar/destinations/IST)
      await page.goto(`${baseUrl}/ar/destinations/IST`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("h1", { timeout: 10000 });
      const arH1 = await page.locator("h1").innerText();
      if (!arH1.includes("إسطنبول")) {
        throw new Error(`Expected Arabic Istanbul H1 "إسطنبول", got: "${arH1}"`);
      }
      const arHero = page.locator('img[data-destination-hero-photo="IST"]');
      await arHero.waitFor({ state: "visible", timeout: 8000 });
      const arHtml = await page.locator("html").getAttribute("lang");
      if (arHtml !== "ar") {
        throw new Error(`Expected html lang="ar", got: "${arHtml}"`);
      }
    });

    await checkStep("20. Admin Destination media draft workflow: edit approved photo, save draft, verify draft preview vs normal published isolation, and discard", async () => {
      const adminMediaContext = await browser.newContext();
      await adminMediaContext.addInitScript(() => {
        localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
      });
      const adminPage = await adminMediaContext.newPage();

      try {
        // 20a. Navigate to /admin/destinations/IST and change photo to city-dubai
        await adminPage.goto(`${baseUrl}/admin/destinations/IST`, { waitUntil: "domcontentloaded" });
        await adminPage.getByRole("tab", { name: "Editorial narrative & guide", exact: true }).click();
        await adminPage.waitForSelector("#dst-pres-IST-photo", { timeout: 10000 });

        // Select city-dubai
        await adminPage.selectOption("#dst-pres-IST-photo", "city-dubai");

        // Save image draft
        const saveDraftBtn = adminPage.getByRole("region", { name: "Visual presentation & photo", exact: true }).getByRole("button", { name: "Save draft", exact: true });
        await saveDraftBtn.waitFor({ state: "visible", timeout: 5000 });
        await saveDraftBtn.click();

        // Verify draft active message appears
        await adminPage.getByText("Local draft saved", { exact: true }).waitFor({ state: "visible", timeout: 8000 });

        // Verify localStorage contains destinations.presentation draft with photoId === "city-dubai" for IST
        const storedDraft = await adminPage.evaluate(() => {
          const raw = localStorage.getItem("gza.content.draft.v1");
          return raw ? JSON.parse(raw) : null;
        });
        const istAssignment = storedDraft?.drafts?.["destinations.presentation"]?.assignments?.find((a) => a.code === "IST");
        if (istAssignment?.photoId !== "city-dubai") {
          throw new Error(`Expected stored draft assignment photoId to be city-dubai, got ${istAssignment?.photoId}`);
        }

        // 20b. Reload /admin/destinations/IST and verify draft persists
        await adminPage.reload({ waitUntil: "domcontentloaded" });
        await adminPage.getByRole("tab", { name: "Editorial narrative & guide", exact: true }).click();
        await adminPage.waitForSelector("#dst-pres-IST-photo", { timeout: 10000 });
        const selectedVal = await adminPage.locator("#dst-pres-IST-photo").inputValue();
        if (selectedVal !== "city-dubai") {
          throw new Error(`Draft did not survive reload in admin photo picker: ${selectedVal}`);
        }

        // 20c. Preview draft: /destinations/IST?contentPreview=1 displays Dubai photo and Not published notice
        await adminPage.goto(`${baseUrl}/destinations/IST?contentPreview=1`, { waitUntil: "domcontentloaded" });
        await adminPage.waitForSelector('[role="status"]', { timeout: 10000 });
        const previewHero = adminPage.locator('img[data-destination-hero-photo="IST"]');
        await previewHero.waitFor({ state: "visible", timeout: 8000 });
        // Static SSR initially shows published media. Assert the actual runtime preview adoption.
        await adminPage.waitForFunction(() => document.querySelector('img[data-destination-hero-photo="IST"]')?.getAttribute("src")?.includes("dubai"));
        const previewHeroSrc = await previewHero.getAttribute("src");
        if (!previewHeroSrc?.includes("dubai")) {
          throw new Error(`Preview route did not overlay Dubai photo draft: ${previewHeroSrc}`);
        }

        // 20d. Normal published URL /destinations/IST remains completely isolated (uses Istanbul photo)
        await adminPage.goto(`${baseUrl}/destinations/IST`, { waitUntil: "domcontentloaded" });
        await adminPage.waitForSelector("h1", { timeout: 10000 });
        const publishedHero = adminPage.locator('img[data-destination-hero-photo="IST"]');
        await publishedHero.waitFor({ state: "visible", timeout: 8000 });
        const publishedHeroSrc = await publishedHero.getAttribute("src");
        if (!publishedHeroSrc?.includes("istanbul")) {
          throw new Error(`Normal published URL was modified by local draft: ${publishedHeroSrc}`);
        }
        if (await adminPage.locator('[role="status"]').count() > 0) {
          throw new Error("Normal published URL displayed preview notice");
        }

        // 20e. Return to Admin and Discard draft
        await adminPage.goto(`${baseUrl}/admin/destinations/IST`, { waitUntil: "domcontentloaded" });
        await adminPage.getByRole("tab", { name: "Editorial narrative & guide", exact: true }).click();
        await adminPage.waitForSelector("#dst-pres-IST-photo", { timeout: 10000 });
        const discardBtn = adminPage.getByRole("region", { name: "Visual presentation & photo", exact: true }).getByRole("button", { name: "Discard draft", exact: true });
        await discardBtn.waitFor({ state: "visible", timeout: 5000 });
        await discardBtn.click();
        await adminPage.getByRole("alertdialog").getByRole("button", { name: "Discard draft", exact: true }).click();

        // Wait until draft is removed from localStorage
        await adminPage.waitForFunction(() => {
          const raw = localStorage.getItem("gza.content.draft.v1");
          if (!raw) return true;
          const parsed = JSON.parse(raw);
          return !parsed.drafts?.["destinations.presentation"];
        });

        // 20f. Verify preview route now falls back to published Istanbul photo
        await adminPage.goto(`${baseUrl}/destinations/IST?contentPreview=1`, { waitUntil: "domcontentloaded" });
        await adminPage.waitForSelector("h1", { timeout: 10000 });
        const postDiscardHero = adminPage.locator('img[data-destination-hero-photo="IST"]');
        const postDiscardSrc = await postDiscardHero.getAttribute("src");
        if (!postDiscardSrc?.includes("istanbul")) {
          throw new Error(`After discard, preview route did not revert to published photo: ${postDiscardSrc}`);
        }
      } finally {
        await adminMediaContext.close();
      }
    });


    await checkStep("21. Admin Settings Contact Draft workflow: Save draft, verify preview, discard saved draft", async () => {
      const adminSettingsContext = await browser.newContext();
      await adminSettingsContext.addInitScript(() => {
        try {
          if (!localStorage.getItem("gza.admin.v1")) {
            localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
          }
          // Pre-seed an appearance draft in canonical store only on initial load (not on reload)
          if (!localStorage.getItem("gza.settings.draft.v1")) {
            localStorage.setItem(
              "gza.settings.draft.v1",
              JSON.stringify({
                schemaVersion: 1,
                site: {
                  appearance: {
                    publicCanvas: { pattern: "rails", intensity: "present", scale: "standard" },
                    sandSection: { pattern: "topography", intensity: "subtle", scale: "small" },
                    adminCanvas: { pattern: "pie-factory", intensity: "present", scale: "standard" },
                  },
                },
              }),
            );
          }
        } catch { }
      });
      try {
        const page = await adminSettingsContext.newPage();
        await page.goto(baseUrl + "/admin/settings?tab=contact", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("#c-phone", { timeout: 10000 });

        // Change phone to trigger dirty state
        await page.fill("#c-phone", "+970 8 999 9999");
        const saveDraftBtn = page.getByRole("button", { name: /Save [Dd]raft/ });
        await saveDraftBtn.waitFor({ state: "visible", timeout: 5000 });
        await saveDraftBtn.click();

        // Wait for draft saved toast
        await page.getByText("Draft saved locally").first().waitFor({ state: "visible", timeout: 8000 });

        // Verify storage: contact is saved AND pre-seeded appearance draft survives!
        const storedEnvelope = await page.evaluate(() => {
          try {
            return JSON.parse(localStorage.getItem("gza.settings.draft.v1") || "null");
          } catch {
            return null;
          }
        });
        if (storedEnvelope?.site?.contact?.phone !== "+970 8 999 9999") {
          throw new Error("Contact draft phone was not persisted in canonical store");
        }
        if (storedEnvelope?.site?.appearance?.publicCanvas?.pattern !== "rails") {
          throw new Error("Appearance draft was stomped by Contact save!");
        }

        // Reload and verify draft persists in form
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(
          () => document.querySelector("#c-phone")?.value === "+970 8 999 9999",
          null,
          { timeout: 10000 }
        );
        const val = await page.inputValue("#c-phone");
        if (val !== "+970 8 999 9999") throw new Error("Contact draft phone not preserved after reload");

        // Preview explicitly (overlay on public contact)
        await page.goto(baseUrl + "/contact?settingsPreview=1", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("h1", { timeout: 10000 });
        const phoneLocator = page.locator(".code-id").first();
        await page.waitForFunction(
          () => document.querySelector(".code-id")?.textContent === "+970 8 999 9999",
          null,
          { timeout: 8000 },
        );
        const previewPhone = await phoneLocator.textContent();
        if (previewPhone !== "+970 8 999 9999") throw new Error("Contact preview did not overlay draft phone: " + previewPhone);

        // Preview banner must be present
        const previewBanner = page.getByText("Stored in this browser • Not published").first();
        await previewBanner.waitFor({ state: "visible", timeout: 5000 });

        // Normal published URL immunity
        await page.goto(baseUrl + "/contact", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("h1", { timeout: 10000 });
        const pubPhoneLocator = page.locator(".code-id").first();
        const pubPhone = await pubPhoneLocator.textContent();
        if (pubPhone === "+970 8 999 9999") throw new Error("Contact normal URL was mutated by draft");
        const normalBannerCount = await page.getByText("Stored in this browser • Not published").count();
        if (normalBannerCount > 0) throw new Error("Normal published URL displayed preview notice banner");

        // Admin Discard Saved Draft via UI (Reset to Default button)
        await page.goto(baseUrl + "/admin/settings?tab=contact", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("#c-phone", { timeout: 10000 });
        const resetToDefaultBtn = page.getByRole("button", { name: /Discard Saved Draft|Reset to Default|حذف المسودة المحفوظة|استعادة الافتراضي/ });
        await resetToDefaultBtn.waitFor({ state: "visible", timeout: 5000 });
        await resetToDefaultBtn.click();

        // Wait for discard confirmation toast
        await page.getByText(/Draft discarded|تم حذف المسودة/).waitFor({ state: "visible", timeout: 8000 });

        // Verify storage: contact is removed, but appearance STILL survives!
        const postDiscardEnvelope = await page.evaluate(() => {
          try {
            return JSON.parse(localStorage.getItem("gza.settings.draft.v1") || "null");
          } catch {
            return null;
          }
        });
        if (postDiscardEnvelope?.site?.contact) {
          throw new Error("Contact draft was not discarded from canonical store");
        }
        if (postDiscardEnvelope?.site?.appearance?.publicCanvas?.pattern !== "rails") {
          throw new Error("Appearance draft did not survive Contact discard!");
        }

        // Verify public preview now reverts to published default phone without banner
        await page.goto(baseUrl + "/contact?settingsPreview=1", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("h1", { timeout: 10000 });
        const postDiscardPhone = await page.locator(".code-id").first().textContent();
        if (postDiscardPhone === "+970 8 999 9999") throw new Error("Contact preview still shows discarded draft phone");
        const postDiscardBannerCount = await page.getByText("Stored in this browser • Not published").count();
        if (postDiscardBannerCount > 0) throw new Error("Preview banner still visible after discard");
      } finally {
        await adminSettingsContext.close();
      }
    });

    await checkStep("22. Admin Settings Appearance Studio workflow: working edit, storage failure rejection, save, and discard", async () => {
      // 22a. Storage failure rejection test
      const failContext = await browser.newContext();
      await failContext.addInitScript(() => {
        try {
          localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
          const origSet = Storage.prototype.setItem;
          Storage.prototype.setItem = function(k, v) {
            if (k === "gza.settings.draft.v1") throw new Error("QuotaExceededError: Storage quota exceeded");
            return origSet.call(this, k, v);
          };
        } catch { }
      });
      try {
        const failPage = await failContext.newPage();
        await failPage.goto(baseUrl + "/admin/settings?tab=appearance", { waitUntil: "domcontentloaded" });
        await failPage.waitForSelector("iframe", { timeout: 10000 });

        // Initial status is Published baseline
        await failPage.getByText(/Published baseline|المعتمد المنشور/).waitFor({ state: "visible", timeout: 5000 });

        // Select a different pattern to trigger dirty state
        const patternOption = failPage.locator('[role="radio"][value="rails"], [role="radio"][value="signal"]').first();
        await patternOption.waitFor({ state: "visible", timeout: 5000 });
        await patternOption.click();

        // Status must change to Unsaved
        await failPage.getByText(/Unsaved changes|تغييرات غير محفوظة/).waitFor({ state: "visible", timeout: 5000 });

        // Click Save Draft with failing storage
        const saveDraftBtn = failPage.getByRole("button", { name: /Save [Dd]raft|حفظ مسوّدة|حفظ المسودة/i });
        await saveDraftBtn.waitFor({ state: "visible", timeout: 5000 });
        await saveDraftBtn.click();

        // Must display visible role="alert" error
        const alertEl = failPage.locator('[role="alert"]');
        await alertEl.waitFor({ state: "visible", timeout: 5000 });
        const alertText = await alertEl.textContent();
        if (!alertText?.includes("Quota") && !alertText?.includes("Failed to save")) {
          throw new Error(`Expected storage quota error in alert, got: ${alertText}`);
        }

        // Status must REMAIN Unsaved (never falsely claim Saved!)
        const unsavedStatus = failPage.getByText(/Unsaved changes|تغييرات غير محفوظة/);
        await unsavedStatus.waitFor({ state: "visible", timeout: 3000 });
      } finally {
        await failContext.close();
      }

      // 22b. Successful save, public immunity, preview inspection, and discard
      const successContext = await browser.newContext();
      await successContext.addInitScript(() => {
        try {
          localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
        } catch { }
      });
      try {
        const page = await successContext.newPage();
        await page.goto(baseUrl + "/admin/settings?tab=appearance", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("iframe", { timeout: 10000 });

        // Initial status
        await page.getByText(/Published baseline|المعتمد المنشور/).waitFor({ state: "visible", timeout: 5000 });

        // Select a different pattern (e.g. rails)
        const patternOption = page.locator('[role="radio"][value="rails"]').first();
        await patternOption.waitFor({ state: "visible", timeout: 5000 });
        await patternOption.click();

        // Status is Unsaved
        await page.getByText(/Unsaved changes|تغييرات غير محفوظة/).waitFor({ state: "visible", timeout: 5000 });

        // Click Save Draft
        const saveBtn = page.getByRole("button", { name: /Save [Dd]raft|حفظ مسوّدة|حفظ المسودة/i });
        await saveBtn.click();

        // Wait for saved toast and status transition to Saved
        await page.getByText(/Draft saved locally|تم حفظ المسودة محلياً/).first().waitFor({ state: "visible", timeout: 8000 });
        await page.getByText(/Draft saved locally|تم حفظ المسودة محلياً/).first().waitFor({ state: "visible", timeout: 5000 });

        // Reload page to verify saved draft persists
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector("iframe", { timeout: 10000 });
        await page.getByText(/Draft saved locally|تم حفظ المسودة محلياً/).first().waitFor({ state: "visible", timeout: 5000 });

        // Normal Home immunity: open homepage without ?skinPreview=1
        await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("h1", { timeout: 10000 });
        const homeStyle = await page.evaluate(() => {
          return document.documentElement.style.getPropertyValue("--skin-public-image");
        });
        if (homeStyle) {
          throw new Error("Normal homepage was unexpectedly styled with preview CSS variables: " + homeStyle);
        }

        // Return to Appearance Studio and Discard Saved Draft (Reset to Default)
        await page.goto(baseUrl + "/admin/settings?tab=appearance", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("iframe", { timeout: 10000 });
        const resetBtn = page.getByRole("button", { name: /Discard Saved Draft|Reset to Default|حذف المسودة المحفوظة|استعادة الافتراضي/ });
        await resetBtn.waitFor({ state: "visible", timeout: 5000 });
        await resetBtn.click();

        // Status reverts to Published baseline
        await page.getByText(/Published baseline|المعتمد المنشور/).waitFor({ state: "visible", timeout: 5000 });

        // Verify storage: appearance draft is removed
        const envelope = await page.evaluate(() => {
          try {
            return JSON.parse(localStorage.getItem("gza.settings.draft.v1") || "null");
          } catch {
            return null;
          }
        });
        if (envelope?.site?.appearance) {
          throw new Error("Appearance draft was not discarded from canonical store");
        }
      } finally {
        await successContext.close();
      }
    });

    await checkStep("23. Phase 4C Correction 2 Proof: Legacy Appearance discard resurrection immunity and cross-tab preview event contract", async () => {
      const legacyRaw = JSON.stringify({
        publicCanvas: { pattern: "rails", intensity: "present", scale: "standard" },
        sandSection: { pattern: "pie-factory", intensity: "present", scale: "standard" },
        adminCanvas: { pattern: "pie-factory", intensity: "present", scale: "standard" },
      });

      const testContext = await browser.newContext();
      await testContext.addInitScript((rawSkin) => {
        try {
          localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
          localStorage.setItem("gza.skin.preview.v1", rawSkin);
        } catch { }
      }, legacyRaw);

      try {
        // --- Part 1: Migration, UI Discard, Reload, and Public Preview Immunity ---
        const adminPage = await testContext.newPage();
        await adminPage.goto(baseUrl + "/admin/settings?tab=appearance", { waitUntil: "domcontentloaded" });
        await adminPage.waitForSelector("iframe", { timeout: 10000 });

        // Studio migrates legacy skin on load: status shows Saved draft
        await adminPage.getByText(/Draft saved locally|تم حفظ المسودة محلياً/).first().waitFor({ state: "visible", timeout: 8000 });

        // Verify storage: canonical store holds migrated skin, legacy key remains byte-for-byte untouched
        const storageState = await adminPage.evaluate(() => ({
          canonical: localStorage.getItem("gza.settings.draft.v1"),
          legacy: localStorage.getItem("gza.skin.preview.v1"),
        }));
        if (!storageState.canonical?.includes("rails")) {
          throw new Error("Legacy skin was not migrated into canonical settings envelope");
        }
        if (storageState.legacy !== legacyRaw) {
          throw new Error("Legacy storage key was mutated during migration!");
        }

        // Discard via UI: Click "Reset to Default"
        const resetBtn = adminPage.getByRole("button", { name: /Discard Saved Draft|Reset to Default|حذف المسودة المحفوظة|استعادة الافتراضي/ });
        await resetBtn.waitFor({ state: "visible", timeout: 5000 });
        await resetBtn.click();

        // Status reverts to Published baseline
        await adminPage.getByText(/Published baseline|المعتمد المنشور/).waitFor({ state: "visible", timeout: 5000 });

        // Reload Studio: verify published baseline remains (legacy draft does NOT resurrect!)
        await adminPage.reload({ waitUntil: "domcontentloaded" });
        await adminPage.waitForSelector("iframe", { timeout: 10000 });
        await adminPage.getByText(/Published baseline|المعتمد المنشور/).waitFor({ state: "visible", timeout: 5000 });

        // Verify canonical store has appearance removed/tombstoned and legacy key is still untouched
        const postDiscardStorage = await adminPage.evaluate(() => ({
          canonical: localStorage.getItem("gza.settings.draft.v1"),
          legacy: localStorage.getItem("gza.skin.preview.v1"),
        }));
        if (postDiscardStorage.legacy !== legacyRaw) {
          throw new Error("Legacy storage key was mutated during discard!");
        }
        const parsedCanonical = JSON.parse(postDiscardStorage.canonical || "{}");
        if (parsedCanonical?.site?.appearance) {
          throw new Error("Appearance draft resurrected in canonical store after UI discard!");
        }

        // Explicit skin preview tab: verify published baseline remains without reapplying legacy skin.
        //
        // Install a narrow Playwright route interceptor for Google Fonts CDN requests BEFORE
        // opening previewPage. In network-isolated environments the OS rejects these external
        // requests with net::ERR_NETWORK_ACCESS_DENIED. Chromium does NOT include the failing URL
        // in the console error text (Correction 3's hostname filter could therefore never match).
        //
        // We intercept at the Playwright routing layer and satisfy these requests with an empty
        // 204 response. route.fulfill({status:204}) silently completes the request from the browser's
        // perspective — no network error, no console error — while recording the actual URL as evidence.
        // route.abort() was tried in Correction 4's first attempt but produces its own
        // ERR_BLOCKED_BY_CLIENT console error. route.fulfill() generates nothing.
        //
        // ALL same-origin requests, pageerror events, and any non-font console errors remain fatal.
        const blockedFontUrls = [];
        const GOOGLE_FONT_ROUTE = /^https?:\/\/fonts\.(googleapis|gstatic)\.com\//;
        await testContext.route(GOOGLE_FONT_ROUTE, (route) => {
          blockedFontUrls.push(route.request().url());
          route.fulfill({ status: 204, body: "" });
        });

        const previewPage = await testContext.newPage();
        // Collect all real errors. Font requests fulfilled with 204 do not generate console errors.
        // pageerror remains fully unfiltered. Any non-font console error is a real application failure.
        const previewErrors = [];
        previewPage.on("pageerror", (err) => previewErrors.push(err.message));
        previewPage.on("console", (msg) => {
          if (msg.type() !== "error") return;
          previewErrors.push(msg.text());
        });

        await previewPage.goto(baseUrl + "/?skinPreview=1", { waitUntil: "domcontentloaded" });
        await previewPage.waitForSelector("h1", { timeout: 10000 });


        const previewSkinStyle = await previewPage.evaluate(() => {
          return document.documentElement.style.getPropertyValue("--skin-public-image");
        });
        if (previewSkinStyle) {
          throw new Error("Explicit preview unexpectedly reapplied discarded legacy skin: " + previewSkinStyle);
        }

        // --- Part 2: Cross-Tab Preview Event Contract & Immunity ---
        // Tab 2 (adminPage): Save Appearance draft
        const railsRadio = adminPage.locator('[role="radio"][value="rails"]').first();
        await railsRadio.click();
        const saveDraftBtn = adminPage.getByRole("button", { name: /Save [Dd]raft|حفظ مسوّدة|حفظ المسودة/i });
        await saveDraftBtn.click();
        await adminPage.getByText(/Draft saved locally|تم حفظ المسودة محلياً/).first().waitFor({ state: "visible", timeout: 8000 });

        // Tab 1 (previewPage): Verify preview updates with custom skin overrides without reload or error
        await previewPage.waitForFunction(
          () => Boolean(document.documentElement.style.getPropertyValue("--skin-public-image")),
          null,
          { timeout: 8000 }
        );
        if (previewErrors.length > 0) {
          throw new Error("Preview page threw error on Appearance update: " + previewErrors.join("; "));
        }

        // Tab 2 (adminPage): Navigate to Contact tab and save Contact draft
        await adminPage.goto(baseUrl + "/admin/settings?tab=contact", { waitUntil: "domcontentloaded" });
        await adminPage.waitForSelector("#c-phone", { timeout: 10000 });
        await adminPage.fill("#c-phone", "+970 8 777 6666");
        const saveContactBtn = adminPage.getByRole("button", { name: /Save [Dd]raft|حفظ مسوّدة|حفظ المسودة/i });
        await saveContactBtn.click();
        await adminPage.getByText(/Draft saved locally|تم حفظ المسودة محلياً/).first().waitFor({ state: "visible", timeout: 8000 });

        // Tab 1 (previewPage): Verify Contact save does NOT break or clear Appearance preview!
        await previewPage.waitForTimeout(500);
        if (previewErrors.length > 0) {
          throw new Error("Preview page threw error on Contact update: " + previewErrors.join("; "));
        }
        const skinAfterContactSave = await previewPage.evaluate(() => {
          return document.documentElement.style.getPropertyValue("--skin-public-image");
        });
        if (!skinAfterContactSave) {
          throw new Error("Contact draft save corrupted or erased active Appearance skin preview!");
        }

        // Tab 2 (adminPage): Discard Appearance draft
        await adminPage.goto(baseUrl + "/admin/settings?tab=appearance", { waitUntil: "domcontentloaded" });
        await adminPage.waitForSelector("iframe", { timeout: 10000 });
        const discardAppBtn = adminPage.getByRole("button", { name: /Discard Saved Draft|Reset to Default|حذف المسودة المحفوظة|استعادة الافتراضي/ });
        await discardAppBtn.waitFor({ state: "visible", timeout: 5000 });
        await discardAppBtn.click();
        await adminPage.getByText(/Published baseline|المعتمد المنشور/).waitFor({ state: "visible", timeout: 5000 });

        // Tab 1 (previewPage): Verify preview reverts cleanly to published baseline (overrides cleared)
        await previewPage.waitForFunction(
          () => !document.documentElement.style.getPropertyValue("--skin-public-image"),
          null,
          { timeout: 8000 }
        );
        if (previewErrors.length > 0) {
          throw new Error("Preview page threw error on Appearance discard: " + previewErrors.join("; "));
        }
      } finally {
        await testContext.close();
      }
    });

    await checkStep("24. Phase 4C.0.1 Proof: Tab-aware Admin Settings headers, invalid Contact draft fallback, and cross-tab clean/dirty state adoption", async () => {
      const testContext = await browser.newContext();
      await testContext.addInitScript(() => {
        try {
          localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
        } catch { }
      });

      try {
        const page1 = await testContext.newPage();

        // --- Part 1: Tab-aware header meta in English and Arabic ---
        // English: Contact tab shows draft notice
        await page1.goto(baseUrl + "/admin/settings?tab=contact", { waitUntil: "domcontentloaded" });
        await page1.waitForSelector("#c-phone", { timeout: 10000 });
        const enContactMeta = await page1.textContent("header p, [data-slot='page-header'] p, .space-y-4 header");
        if (!enContactMeta?.includes("Local, unpublished draft") && !enContactMeta?.includes("stored in this browser")) {
          throw new Error("Contact tab header did not display draft meta: " + enContactMeta);
        }

        // English: Airport tab shows read-only policy notice
        await page1.goto(baseUrl + "/admin/settings?tab=airport", { waitUntil: "domcontentloaded" });
        await page1.waitForSelector("#se-airport", { timeout: 10000 });
        const enAirportMeta = await page1.textContent("header p, [data-slot='page-header'] p, .space-y-4 header");
        if (!enAirportMeta?.includes("Read-only system") && !enAirportMeta?.includes("operational policy")) {
          throw new Error("Airport tab header did not display read-only meta: " + enAirportMeta);
        }

        // Arabic: Contact tab shows Arabic draft notice
        await page1.goto(baseUrl + "/ar/admin/settings?tab=contact", { waitUntil: "domcontentloaded" });
        await page1.waitForSelector("#c-phone", { timeout: 10000 });
        const arContactMeta = await page1.textContent("header p, [data-slot='page-header'] p, .space-y-4 header");
        if (!arContactMeta?.includes("مسودة محلية") && !arContactMeta?.includes("تُحفظ التغييرات")) {
          throw new Error("Arabic Contact tab header did not display Arabic draft meta: " + arContactMeta);
        }

        // Arabic: Airport tab shows Arabic read-only notice
        await page1.goto(baseUrl + "/ar/admin/settings?tab=airport", { waitUntil: "domcontentloaded" });
        await page1.waitForSelector("#se-airport", { timeout: 10000 });
        const arAirportMeta = await page1.textContent("header p, [data-slot='page-header'] p, .space-y-4 header");
        if (!arAirportMeta?.includes("مرجع للقراءة فقط") && !arAirportMeta?.includes("لإعدادات النظام")) {
          throw new Error("Arabic Airport tab header did not display Arabic read-only meta: " + arAirportMeta);
        }

        // --- Part 2: Invalid persisted Contact draft rejection & published fallback on preview ---
        // Inject an invalid contact draft (invalid phone '123')
        await page1.evaluate(() => {
          localStorage.setItem("gza.settings.draft.v1", JSON.stringify({
            schemaVersion: 1,
            updatedAt: new Date().toISOString(),
            site: {
              contact: {
                phone: "123",
                email: "bad-email",
                addressEn: "Terminal 1",
                addressAr: "مبنى الركاب",
                socialInstagram: "",
                socialX: "",
                socialFacebook: "",
                socialYouTube: "",
              }
            }
          }));
        });

        // Visit public /contact?settingsPreview=1
        const publicPage = await testContext.newPage();
        await publicPage.goto(baseUrl + "/contact?settingsPreview=1", { waitUntil: "domcontentloaded" });
        await publicPage.waitForSelector(".code-id", { timeout: 10000 });
        // The phone must be the compiled published default, NOT '123'
        const phoneText = await publicPage.locator(".code-id").first().textContent();
        if (phoneText !== "+970 8 000 0000") {
          throw new Error("Invalid contact draft leaked into preview; expected +970 8 000 0000 but got: " + phoneText);
        }
        // There must be no preview draft banner because invalid contact is omitted entirely
        const bannerCount = await publicPage.getByText(/Stored in this browser|مسودة غير منشورة/).count();
        if (bannerCount > 0) {
          throw new Error("Preview banner was shown for an invalid contact draft that should have been rejected");
        }
        await publicPage.close();

        // --- Part 3: Cross-tab clean adoption vs dirty work preservation ---
        // Clear draft storage
        // --- Part 3: Appearance Studio Cross-tab Truth & Iframe Sync ---
        await page1.evaluate(() => localStorage.removeItem("gza.settings.draft.v1"));

        // Tab 1 (Clean Appearance Studio)
        const cleanStudio = await testContext.newPage();
        await cleanStudio.goto(baseUrl + "/admin/settings?tab=appearance", { waitUntil: "domcontentloaded" });
        await cleanStudio.waitForSelector("iframe", { timeout: 10000 });

        // Tab 2 (Dirty Appearance Studio)
        const dirtyStudio = await testContext.newPage();
        await dirtyStudio.goto(baseUrl + "/admin/settings?tab=appearance", { waitUntil: "domcontentloaded" });
        await dirtyStudio.waitForSelector("iframe", { timeout: 10000 });

        // In dirtyStudio: select Floor Tile pattern
        const floorTileRadio = dirtyStudio.locator('[role="radio"][value="floor-tile"]').first();
        await floorTileRadio.waitFor({ state: "visible", timeout: 5000 });
        await floorTileRadio.click();
        await dirtyStudio.getByText(/Unsaved|تعديلات غير محفوظة/).first().waitFor({ state: "visible", timeout: 5000 });

        // Assert dirtyStudio working control is floor-tile and iframe has floor-tile
        const dirtyRadioChecked = await floorTileRadio.getAttribute("data-state");
        if (dirtyRadioChecked !== "checked") {
          throw new Error("Floor Tile radio was not checked in dirty studio");
        }
        await dirtyStudio.waitForFunction(() => {
          const iframe = document.querySelector("iframe");
          const style = iframe?.contentDocument?.documentElement?.style;
          const bgSize = style?.getPropertyValue("--skin-public-size");
          const bg = style?.getPropertyValue("--skin-public-image");
          return bgSize === "30px 30px" || Boolean(bg && bg.includes("30%2030"));
        }, null, { timeout: 8000 });

        // SUB-TEST A: Contact-only external save occurs while dirtyStudio is dirty!
        // dirtyStudio must NOT show external change notice banner because Appearance was not changed!
        const contactOnlyEnvelope = {
          schemaVersion: 1,
          updatedAt: new Date().toISOString(),
          site: {
            contact: {
              phone: "+970 8 777 5555",
              email: "support@gza-airport.ps",
              addressEn: "Gaza International Airport, Gaza",
              addressAr: "مطار غزة الدولي، غزة",
              socialInstagram: "",
              socialX: "",
              socialFacebook: "",
              socialYouTube: "",
            }
          }
        };
        await page1.evaluate((env) => {
          localStorage.setItem("gza.settings.draft.v1", JSON.stringify(env));
          window.dispatchEvent(new StorageEvent("storage", {
            key: "gza.settings.draft.v1",
            newValue: JSON.stringify(env),
          }));
        }, contactOnlyEnvelope);

        // Verify dirtyStudio STILL has NO external notice banner!
        await dirtyStudio.waitForTimeout(400);
        const noticeOnContactSave = await dirtyStudio.getByText(/updated in another tab|تم تحديث المسودة المحفوظة في علامة تبويب أخرى/).count();
        if (noticeOnContactSave > 0) {
          throw new Error("Dirty Appearance Studio falsely showed external change notice when only Contact settings changed!");
        }

        // SUB-TEST B: External save of Appearance occurs (rails pattern)
        const appearanceEnvelope = {
          schemaVersion: 1,
          updatedAt: new Date().toISOString(),
          site: {
            ...contactOnlyEnvelope.site,
            appearance: {
              publicCanvas: { pattern: "rails", intensity: "present", scale: "standard" },
              sandSection: { pattern: "pie-factory", intensity: "present", scale: "standard" },
              adminCanvas: { pattern: "pie-factory", intensity: "present", scale: "standard" },
            }
          }
        };
        await page1.evaluate((env) => {
          localStorage.setItem("gza.settings.draft.v1", JSON.stringify(env));
          window.dispatchEvent(new StorageEvent("storage", {
            key: "gza.settings.draft.v1",
            newValue: JSON.stringify(env),
          }));
        }, appearanceEnvelope);

        // 1. Verify cleanStudio automatically adopted 'rails':
        // Assert working control (radio 'rails') is checked
        await cleanStudio.getByText(/Saved|مسودة محفوظة/).first().waitFor({ state: "visible", timeout: 6000 });
        await cleanStudio.waitForFunction(() => {
          const radio = document.querySelector('[role="radio"][value="rails"]');
          return radio?.getAttribute("data-state") === "checked";
        }, null, { timeout: 8000 });
        // Assert iframe in cleanStudio receives 'rails'
        await cleanStudio.waitForFunction(() => {
          const iframe = document.querySelector("iframe");
          const style = iframe?.contentDocument?.documentElement?.style;
          const bgSize = style?.getPropertyValue("--skin-public-size");
          const bg = style?.getPropertyValue("--skin-public-image");
          return bgSize === "20px 10px" || Boolean(bg && bg.includes("20%2010"));
        }, null, { timeout: 8000 });
        // Assert no false external notice on cleanStudio
        const cleanNoticeCount = await cleanStudio.getByText(/updated in another tab|تم تحديث المسودة المحفوظة في علامة تبويب أخرى/).count();
        if (cleanNoticeCount > 0) {
          throw new Error("Clean studio unexpectedly showed dirty external notice banner");
        }

        // 2. Verify dirtyStudio retained its local 'floor-tile' working control and iframe:
        await dirtyStudio.getByText(/updated in another tab|تم تحديث المسودة المحفوظة في علامة تبويب أخرى/).first().waitFor({ state: "visible", timeout: 6000 });
        await dirtyStudio.getByText(/Unsaved|تعديلات غير محفوظة/).first().waitFor({ state: "visible", timeout: 5000 });
        const dirtyFloorTileState = await floorTileRadio.getAttribute("data-state");
        if (dirtyFloorTileState !== "checked") {
          throw new Error("Dirty studio working control was overwritten; expected floor-tile to remain checked");
        }
        const dirtyIframeHasFloorTile = await dirtyStudio.evaluate(() => {
          const iframe = document.querySelector("iframe");
          const style = iframe?.contentDocument?.documentElement?.style;
          const bgSize = style?.getPropertyValue("--skin-public-size");
          const bg = style?.getPropertyValue("--skin-public-image");
          return bgSize === "30px 30px" || Boolean(bg && bg.includes("30%2030"));
        });
        if (!dirtyIframeHasFloorTile) {
          throw new Error("Dirty studio iframe was overwritten by external save; expected floor-tile to be preserved");
        }

        // SUB-TEST C: External Appearance Discard occurs
        // Discard Appearance from storage (omit site.appearance, keeping site.contact)
        const discardAppEnvelope = {
          schemaVersion: 1,
          updatedAt: new Date().toISOString(),
          site: {
            contact: contactOnlyEnvelope.site.contact,
          }
        };
        await page1.evaluate((env) => {
          localStorage.setItem("gza.settings.draft.v1", JSON.stringify(env));
          window.dispatchEvent(new StorageEvent("storage", {
            key: "gza.settings.draft.v1",
            newValue: JSON.stringify(env),
          }));
        }, discardAppEnvelope);

        // 4. Verify cleanStudio reverted to published default (pie-factory control checked and default iframe)
        await cleanStudio.waitForFunction(() => {
          const radio = document.querySelector('[role="radio"][value="pie-factory"]');
          return radio?.getAttribute("data-state") === "checked";
        }, null, { timeout: 8000 });
        await cleanStudio.waitForFunction(() => {
          const iframe = document.querySelector("iframe");
          const style = iframe?.contentDocument?.documentElement?.style;
          const bgSize = style?.getPropertyValue("--skin-public-size");
          const bg = style?.getPropertyValue("--skin-public-image");
          return !bg || bgSize !== "20px 10px";
        }, null, { timeout: 8000 });

        // 5. Verify dirtyStudio survives that discard (still retains floor-tile and shows notice)
        const dirtySurvivesDiscard = await floorTileRadio.getAttribute("data-state");
        if (dirtySurvivesDiscard !== "checked") {
          throw new Error("Dirty studio working control was overwritten on external discard; expected floor-tile to remain checked");
        }
        await dirtyStudio.getByText(/updated in another tab|تم تحديث المسودة المحفوظة في علامة تبويب أخرى/).first().waitFor({ state: "visible", timeout: 6000 });

        // Discard unsaved in dirtyStudio -> now reverts to new baseline and clears notice
        const discardUnsavedBtn = dirtyStudio.getByRole("button", { name: /Discard Unsaved|تجاهل التعديلات/i });
        await discardUnsavedBtn.waitFor({ state: "visible", timeout: 5000 });
        await discardUnsavedBtn.click();
        await dirtyStudio.getByText(/Published baseline|المعتمد المنشور/).first().waitFor({ state: "visible", timeout: 5000 });

        await cleanStudio.close();
        await dirtyStudio.close();

        // --- Part 4: Bounded Contact Editor Cross-tab Proof ---
        const cleanContact = await testContext.newPage();
        await cleanContact.goto(baseUrl + "/admin/settings?tab=contact", { waitUntil: "domcontentloaded" });
        await cleanContact.waitForSelector("#c-phone", { timeout: 10000 });

        const dirtyContact = await testContext.newPage();
        await dirtyContact.goto(baseUrl + "/admin/settings?tab=contact", { waitUntil: "domcontentloaded" });
        await dirtyContact.waitForSelector("#c-phone", { timeout: 10000 });

        // Make dirtyContact dirty by entering local phone
        await dirtyContact.fill("#c-phone", "+970 8 444 8888");
        await dirtyContact.getByText(/Unsaved|تعديلات غير محفوظة/).first().waitFor({ state: "visible", timeout: 5000 });

        // A: Appearance-only external save occurs while dirtyContact is dirty
        const appOnlyEnv = {
          schemaVersion: 1,
          updatedAt: new Date().toISOString(),
          site: {
            contact: contactOnlyEnvelope.site.contact,
            appearance: {
              publicCanvas: { pattern: "topography", intensity: "present", scale: "standard" },
              sandSection: { pattern: "pie-factory", intensity: "present", scale: "standard" },
              adminCanvas: { pattern: "pie-factory", intensity: "present", scale: "standard" },
            }
          }
        };
        await page1.evaluate((env) => {
          localStorage.setItem("gza.settings.draft.v1", JSON.stringify(env));
          window.dispatchEvent(new StorageEvent("storage", {
            key: "gza.settings.draft.v1",
            newValue: JSON.stringify(env),
          }));
        }, appOnlyEnv);

        // Verify dirtyContact does NOT show external change notice banner on Appearance save!
        await dirtyContact.waitForTimeout(400);
        const contactNoticeOnAppSave = await dirtyContact.getByText(/updated in another tab|تم تحديث المسودة المحفوظة في علامة تبويب أخرى/).count();
        if (contactNoticeOnAppSave > 0) {
          throw new Error("Dirty Contact editor falsely showed external change notice when only Appearance changed!");
        }
        const dirtyPhonePreservedOnAppSave = await dirtyContact.inputValue("#c-phone");
        if (dirtyPhonePreservedOnAppSave !== "+970 8 444 8888") {
          throw new Error("Dirty Contact editor phone was lost on Appearance save: " + dirtyPhonePreservedOnAppSave);
        }

        // B: External Contact save occurs with new phone '+970 8 222 3333'
        const externalContactEnv = {
          schemaVersion: 1,
          updatedAt: new Date().toISOString(),
          site: {
            ...appOnlyEnv.site,
            contact: {
              phone: "+970 8 222 3333",
              email: "ops@gza-airport.ps",
              addressEn: "Gaza International Airport, Gaza",
              addressAr: "مطار غزة الدولي، غزة",
              socialInstagram: "",
              socialX: "",
              socialFacebook: "",
              socialYouTube: "",
            }
          }
        };
        await page1.evaluate((env) => {
          localStorage.setItem("gza.settings.draft.v1", JSON.stringify(env));
          window.dispatchEvent(new StorageEvent("storage", {
            key: "gza.settings.draft.v1",
            newValue: JSON.stringify(env),
          }));
        }, externalContactEnv);

        // Clean Contact editor adopts external phone '+970 8 222 3333'
        await cleanContact.waitForFunction(() => {
          const input = document.querySelector("#c-phone");
          return input?.value === "+970 8 222 3333";
        }, null, { timeout: 8000 });

        // Dirty Contact editor retains its local '+970 8 444 8888' and now displays external notice banner
        const dirtyPhonePreserved = await dirtyContact.inputValue("#c-phone");
        if (dirtyPhonePreserved !== "+970 8 444 8888") {
          throw new Error("Dirty Contact editor phone was overwritten: " + dirtyPhonePreserved);
        }
        await dirtyContact.getByText(/updated in another tab|تم تحديث المسودة المحفوظة في علامة تبويب أخرى/).first().waitFor({ state: "visible", timeout: 6000 });

        await cleanContact.close();
        await dirtyContact.close();
      } finally {
        await testContext.close();
      }
    });

    await checkStep("Check 27: Designer decorative assets verification, WebP loading, and functional immunity", async () => {
      // Helper to assert an img element exists, is visible, and has naturalWidth > 0 with webp source
      async function assertWebpImage(p, selector, expectedName) {
        const locator = p.locator(selector).first();
        await locator.waitFor({ state: "attached", timeout: 8000 });
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await p.waitForFunction(
          (sel) => {
            const img = document.querySelector(sel);
            return img && img.complete && img.naturalWidth > 0;
          },
          selector,
          { timeout: 10000 }
        );
        const imgInfo = await locator.evaluate((img) => ({
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          currentSrc: img.currentSrc || img.src,
          alt: img.getAttribute("alt"),
          ariaHidden: img.getAttribute("aria-hidden"),
        }));
        if (imgInfo.naturalWidth <= 0 || imgInfo.naturalHeight <= 0) {
          throw new Error(`Asset ${expectedName} (${selector}) failed to load: natural dimensions are ${imgInfo.naturalWidth}x${imgInfo.naturalHeight}`);
        }
        if (!imgInfo.currentSrc.includes(".webp") || imgInfo.currentSrc.startsWith("data:")) {
          throw new Error(`Asset ${expectedName} (${selector}) is not served as external WebP: ${imgInfo.currentSrc}`);
        }
        if (imgInfo.alt !== "") {
          throw new Error(`Asset ${expectedName} (${selector}) must have alt="": got "${imgInfo.alt}"`);
        }
        if (imgInfo.ariaHidden !== "true") {
          throw new Error(`Asset ${expectedName} (${selector}) must have aria-hidden="true": got "${imgInfo.ariaHidden}"`);
        }
      }

      // 1. Airport Overview (/airport and /ar/airport)
      await page.goto(baseUrl + "/airport", { waitUntil: "domcontentloaded" });
      await assertWebpImage(page, 'img[data-decorative-asset="airport-past-body"]', "airport-past-body");
      await assertWebpImage(page, 'img[data-decorative-asset="airport-present-body"]', "airport-present-body");
      await assertWebpImage(page, 'img[data-decorative-asset="airport-future-body"]', "airport-future-body");
      await assertWebpImage(page, 'img[data-decorative-asset="airport-sources-metadata"]', "airport-sources-metadata");

      // Verify Arabic Airport Overview
      await page.goto(baseUrl + "/ar/airport", { waitUntil: "domcontentloaded" });
      await assertWebpImage(page, 'img[data-decorative-asset="airport-past-body"]', "ar-airport-past-body");
      await assertWebpImage(page, 'img[data-decorative-asset="airport-present-body"]', "ar-airport-present-body");
      await assertWebpImage(page, 'img[data-decorative-asset="airport-future-body"]', "ar-airport-future-body");
      await assertWebpImage(page, 'img[data-decorative-asset="airport-sources-metadata"]', "ar-airport-sources-metadata");

      // 2. Gallery (/gallery and /ar/gallery)
      await page.goto(baseUrl + "/gallery", { waitUntil: "domcontentloaded" });
      await assertWebpImage(page, 'img[data-decorative-asset="gallery-filter-toolbar"]', "gallery-filter-toolbar");
      await assertWebpImage(page, 'img[data-decorative-asset="gallery-item-body"]', "gallery-item-body");

      // Verify gallery filter interaction & reset (or dynamic singleton toolbar verification)
      const initialCountText = await page.locator(".code-id").first().textContent();
      const categoryFilter = page.locator("#filter-category");
      if ((await categoryFilter.count()) > 0) {
        await page.selectOption("#filter-category", "document");
        const filteredCountText = await page.locator(".code-id").first().textContent();
        if (initialCountText === filteredCountText) {
          throw new Error("Gallery category filter did not change displayed item count");
        }
        await page.getByRole("button", { name: /Clear filters|إزالة التصفية|Reset|إعادة الضبط/i }).first().click();
        const resetCountText = await page.locator(".code-id").first().textContent();
        if (resetCountText !== initialCountText) {
          throw new Error("Gallery reset button did not restore item count");
        }
      } else {
        if (!initialCountText.includes("1")) {
          throw new Error("Gallery item count expected 1 under singleton scope");
        }
      }

      // Verify gallery lightbox open and close via Escape
      const firstCard = page.locator("li button[aria-haspopup='dialog']").first();
      await firstCard.click();
      await page.waitForSelector("[role='dialog']", { timeout: 5000 });
      await page.keyboard.press("Escape");
      await page.locator("[role='dialog']").waitFor({ state: "hidden", timeout: 5000 });

      // Verify Arabic Gallery
      await page.goto(baseUrl + "/ar/gallery", { waitUntil: "domcontentloaded" });
      await assertWebpImage(page, 'img[data-decorative-asset="gallery-filter-toolbar"]', "ar-gallery-filter-toolbar");
      await assertWebpImage(page, 'img[data-decorative-asset="gallery-item-body"]', "ar-gallery-item-body");

      // 3. Flights (/flights and /ar/flights)
      await page.goto(baseUrl + "/flights", { waitUntil: "domcontentloaded" });
      await assertWebpImage(page, 'img[data-decorative-asset="flights-search-toolbar"]', "flights-search-toolbar");

      // Verify flights operational toolbar controls:
      // a) Date button changes active date
      const dateButtons = page.locator('div[data-decorative-asset="flights-search-toolbar"] button[aria-pressed]');
      const initialPressed = await dateButtons.first().getAttribute("aria-pressed");
      if (initialPressed !== "true") {
        throw new Error(`Flights today button should initially have aria-pressed="true", got "${initialPressed}"`);
      }
      await dateButtons.nth(1).click();
      await page.waitForTimeout(200);
      const secondPressed = await dateButtons.nth(1).getAttribute("aria-pressed");
      const firstPressedAfter = await dateButtons.first().getAttribute("aria-pressed");
      if (secondPressed !== "true" || firstPressedAfter !== "false") {
        throw new Error(`Flights date button click did not toggle active date: second=${secondPressed}, first=${firstPressedAfter}`);
      }
      // Restore today
      await dateButtons.first().click();
      await page.waitForTimeout(200);

      // b) Query search filter — assert intermediate filtered state
      const allRowsBeforeQuery = await page.locator("tbody tr").count();
      await page.fill("#board-search", "Amman");
      await page.waitForTimeout(300);
      const filteredRowsByQuery = await page.locator("tbody tr").count();
      if (filteredRowsByQuery >= allRowsBeforeQuery) {
        throw new Error(
          `Query filter "Amman" should reduce visible rows but got ${filteredRowsByQuery} vs original ${allRowsBeforeQuery}`,
        );
      }
      await page.fill("#board-search", "");
      await page.waitForTimeout(200);
      const restoredRowsByQuery = await page.locator("tbody tr").count();
      if (restoredRowsByQuery !== allRowsBeforeQuery) {
        throw new Error(
          `Clearing query filter should restore all rows: expected ${allRowsBeforeQuery}, got ${restoredRowsByQuery}`,
        );
      }

      // c) Status filter changes visible results — assert intermediate filtered state
      const allRowsCount = await page.locator("tbody tr").count();
      await page.selectOption("#board-status", "Cancelled");
      await page.waitForTimeout(300);
      const filteredRowsByStatus = await page.locator("tbody tr").count();
      // Assert the filter was applied: only Cancelled rows should be visible
      const cancelledCellCount = await page.locator("tbody tr").filter({ hasText: /Cancelled|ملغاة/i }).count();
      if (filteredRowsByStatus !== cancelledCellCount) {
        throw new Error(
          `Status filter "Cancelled" should show only Cancelled rows: got ${filteredRowsByStatus} rows but ${cancelledCellCount} have Cancelled text`,
        );
      }
      // Restore status filter and assert restoration
      await page.selectOption("#board-status", "all");
      await page.waitForTimeout(300);
      const restoredRowsCount = await page.locator("tbody tr").count();
      if (restoredRowsCount !== allRowsCount) {
        throw new Error(`Flights status filter did not restore all rows: expected ${allRowsCount}, got ${restoredRowsCount}`);
      }

      // Verify Arabic Flights
      await page.goto(baseUrl + "/ar/flights", { waitUntil: "domcontentloaded" });
      await assertWebpImage(page, 'img[data-decorative-asset="flights-search-toolbar"]', "ar-flights-search-toolbar");

      // 4. Home Flight Search (/ and /ar)
      // Pin clock to a Thursday so default departDate is Friday (when DOH has no scheduled flights)
      await page.clock.setFixedTime(new Date("2026-10-01T12:00:00Z"));
      try {
        await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
        await page.evaluate(() => localStorage.clear());
        await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
        await assertWebpImage(page, 'img[data-decorative-asset="home-flight-search-ticket"]', "home-flight-search-ticket");

        // Verify ticket image is visibly strong (opacity >= 0.85 and not covered by opaque overlay)
        const ticketOpacity = await page.evaluate(() => {
          const img = document.querySelector('img[data-decorative-asset="home-flight-search-ticket"]');
          return img ? parseFloat(window.getComputedStyle(img).opacity) : 0;
        });
        if (ticketOpacity < 0.85) {
          throw new Error(`Home flight search ticket image opacity should be >= 0.85, got ${ticketOpacity}`);
        }

        // Verify the three Home heritage images load as external WebP with naturalWidth > 0, empty alt, aria-hidden="true"
        await assertWebpImage(page, 'img[data-decorative-asset="home-airport-past-body"]', "home-airport-past-body");
        await assertWebpImage(page, 'img[data-decorative-asset="home-airport-present-body"]', "home-airport-present-body");
        await assertWebpImage(page, 'img[data-decorative-asset="home-airport-future-body"]', "home-airport-future-body");

        // Verify Future upper concept disclosure remains
        const futureConceptBadge = page.locator('span:has-text("Illustrative future concept"), span:has-text("تصوّر مستقبلي توضيحي")').first();
        if ((await futureConceptBadge.count()) === 0) {
          throw new Error("Future upper concept disclosure missing on Home heritage card");
        }

        // a) Deliberately invalid search stays on Home, displays role="alert" banner, readable over ticket art
        await page.click("#search-to");
        await page.waitForTimeout(300);
        await page.click('[data-value="DOH"]');
        await page.waitForTimeout(500);
        const searchSubmitBtn = page.locator('form[aria-label] button[type="submit"]').first();
        await searchSubmitBtn.click();
        await page.waitForTimeout(400);

        if (!page.url().endsWith("/")) {
          throw new Error(`Invalid search should stay on Home (/), but navigated to: ${page.url()}`);
        }
        const alertBanner = page.locator('form[aria-label] div[role="alert"]').first();
        if ((await alertBanner.count()) === 0) {
          throw new Error(`Invalid Home search did not show role="alert" banner`);
        }
        const alertText = (await alertBanner.textContent()) || "";
        if (!alertText.includes("DOH") || !alertText.toLowerCase().includes("no scheduled")) {
          throw new Error(`Unexpected alert text for DOH invalid search: "${alertText}"`);
        }

        // b) Valid Home search follows expected navigation flow to /book
        await page.click("#search-to");
        await page.waitForTimeout(300);
        await page.click('[data-value="AMM"]');
        await page.waitForTimeout(500);
        await searchSubmitBtn.click();
        await page.waitForURL((url) => url.pathname.includes("/book"), { timeout: 8000 });
        if (!page.url().includes("/book")) {
          throw new Error(`Valid search failed to navigate to /book, URL is: ${page.url()}`);
        }

        // Verify Arabic Home search: invalid search stays on /ar and shows Arabic role="alert"
        await page.goto(baseUrl + "/ar", { waitUntil: "domcontentloaded" });
        await assertWebpImage(page, 'img[data-decorative-asset="home-flight-search-ticket"]', "ar-home-flight-search-ticket");

        const ticketOpacityAr = await page.evaluate(() => {
          const img = document.querySelector('img[data-decorative-asset="home-flight-search-ticket"]');
          return img ? parseFloat(window.getComputedStyle(img).opacity) : 0;
        });
        if (ticketOpacityAr < 0.85) {
          throw new Error(`Arabic Home flight search ticket image opacity should be >= 0.85, got ${ticketOpacityAr}`);
        }

        await assertWebpImage(page, 'img[data-decorative-asset="home-airport-past-body"]', "ar-home-airport-past-body");
        await assertWebpImage(page, 'img[data-decorative-asset="home-airport-present-body"]', "ar-home-airport-present-body");
        await assertWebpImage(page, 'img[data-decorative-asset="home-airport-future-body"]', "ar-home-airport-future-body");

        const futureConceptBadgeAr = page.locator('span:has-text("تصوّر مستقبلي توضيحي"), span:has-text("Illustrative future concept")').first();
        if ((await futureConceptBadgeAr.count()) === 0) {
          throw new Error("Future upper concept disclosure missing on Arabic Home heritage card");
        }
        await page.click("#search-to");
        await page.waitForTimeout(300);
        await page.click('[data-value="DOH"]');
        await page.waitForTimeout(500);
        const searchSubmitBtnAr = page.locator('form[aria-label] button[type="submit"]').first();
        await searchSubmitBtnAr.click();
        await page.waitForTimeout(400);
        if (!page.url().endsWith("/ar")) {
          throw new Error(`Invalid Arabic search should stay on /ar, but navigated to: ${page.url()}`);
        }
        const alertBannerAr = page.locator('form[aria-label] div[role="alert"]').first();
        if ((await alertBannerAr.count()) === 0) {
          throw new Error(`Invalid Arabic Home search did not show role="alert" banner`);
        }
      } finally {
        await page.clock.setSystemTime(Date.now());
      }

      // 5. Immunity Proofs: Unskinned forms remain unskinned
      // Check /book
      await page.goto(baseUrl + "/book", { waitUntil: "domcontentloaded" });
      const bookTicketCount = await page.locator('[data-decorative-asset="home-flight-search-ticket"]').count();
      if (bookTicketCount !== 0) {
        throw new Error(`/book must NOT receive the ticket-map treatment: found ${bookTicketCount}`);
      }

      // Check /destinations/IST
      await page.goto(baseUrl + "/destinations/IST", { waitUntil: "domcontentloaded" });
      const istTicketCount = await page.locator('[data-decorative-asset="home-flight-search-ticket"]').count();
      if (istTicketCount !== 0) {
        throw new Error(`/destinations/IST must NOT receive the ticket-map treatment: found ${istTicketCount}`);
      }

      // Verify asset isolation: Home does not leak unrelated Gallery, Flights, or Airport Sources art
      await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
      const leakedGalleryFilter = await page.locator('[data-decorative-asset="gallery-filter-toolbar"]').count();
      const leakedGalleryItem = await page.locator('[data-decorative-asset="gallery-item-body"]').count();
      const leakedFlightsToolbar = await page.locator('[data-decorative-asset="flights-search-toolbar"]').count();
      const leakedAirportSources = await page.locator('[data-decorative-asset="airport-sources-metadata"]').count();
      const leakedAirportBody = await page.locator('[data-decorative-asset="airport-past-body"]').count();
      if (
        leakedGalleryFilter !== 0 ||
        leakedGalleryItem !== 0 ||
        leakedFlightsToolbar !== 0 ||
        leakedAirportSources !== 0 ||
        leakedAirportBody !== 0
      ) {
        throw new Error(
          `Unrelated decorative assets leaked to home: galleryFilter=${leakedGalleryFilter}, galleryItem=${leakedGalleryItem}, flightsToolbar=${leakedFlightsToolbar}, airportSources=${leakedAirportSources}, airportPastBody=${leakedAirportBody}`,
        );
      }
    });


    await checkStep("Check 28: Redesigned console shared-family context markers and control structure", async () => {
      const routeContext = await browser.newContext();
      const page = await routeContext.newPage();
      try {

      // 1. Home has context="home" marker and inner console marker
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
      await waitForNetworkRoute(page);

      const homeConsole = page.locator('[data-flight-search-console="home"]').first();
      if ((await homeConsole.count()) === 0) {
        throw new Error("Home form must have data-flight-search-console=\"home\"");
      }

      const homeInner = page.locator('[data-flight-search-console="home-inner"]').first();
      if ((await homeInner.count()) === 0) {
        throw new Error("Home form must have data-flight-search-console=\"home-inner\" on inner console");
      }

      // 2. /book has context="standard" marker (not home)
      await page.goto(baseUrl + "/book", { waitUntil: "domcontentloaded" });
      await waitForNetworkRoute(page);
      const bookConsole = page.locator('[data-flight-search-console="standard"]').first();
      if ((await bookConsole.count()) === 0) {
        throw new Error("/book form must have data-flight-search-console=\"standard\"");
      }
      const bookHomeMarker = await page.locator('[data-decorative-asset="home-flight-search-ticket"]').count();
      if (bookHomeMarker !== 0) {
        throw new Error(`/book must NOT have home-specific ticket marker, found ${bookHomeMarker}`);
      }

      // 3. /destinations/IST has context="standard" marker
      await page.goto(baseUrl + "/destinations/IST", { waitUntil: "domcontentloaded" });
      await waitForNetworkRoute(page);
      const destConsole = page.locator('[data-flight-search-console="standard"]').first();
      if ((await destConsole.count()) === 0) {
        throw new Error("/destinations/IST form must have data-flight-search-console=\"standard\"");
      }
      const destHomeMarker = await page.locator('[data-decorative-asset="home-flight-search-ticket"]').count();
      if (destHomeMarker !== 0) {
        throw new Error(`/destinations/IST must NOT have home-specific ticket marker, found ${destHomeMarker}`);
      }

      // 4. Verify zones exist on Home form: route, dates, travellers, cabin, search-action
      await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
      await waitForNetworkRoute(page);
      const routeZone = await page.locator('[data-zone="route"]').count();
      const datesZone = await page.locator('[data-zone="dates"]').count();
      const travellersZone = await page.locator('[data-zone="travellers"]').count();
      const cabinZone = await page.locator('[data-zone="cabin"]').count();
      const searchZone = await page.locator('[data-zone="search-action"]').count();
      if (routeZone === 0 || datesZone === 0 || travellersZone === 0 || cabinZone === 0 || searchZone === 0) {
        throw new Error(`Console zones missing: route=${routeZone}, dates=${datesZone}, travellers=${travellersZone}, cabin=${cabinZone}, search=${searchZone}`);
      }

      // 5. Verify separate #search-travellers and #search-cabin triggers exist (split controls)
      const travTrigger = await page.locator('#search-travellers').count();
      const cabinTrigger = await page.locator('#search-cabin').count();
      if (travTrigger === 0) throw new Error("Missing #search-travellers trigger in redesigned console");
      if (cabinTrigger === 0) throw new Error("Missing #search-cabin trigger in redesigned console");

      // 6. Verify #search-from, #search-to, route-swap-button are present
      const fromField = await page.locator('#search-from').count();
      const toField = await page.locator('#search-to').count();
      const swapBtn = await page.locator('[data-slot="route-swap-button"]').count();
      if (fromField === 0) throw new Error("Missing #search-from in redesigned console");
      if (toField === 0) throw new Error("Missing #search-to in redesigned console");
      if (swapBtn === 0) throw new Error("Missing [data-slot=\"route-swap-button\"] in redesigned console");

      // 7. Verify trip-type buttons with aria-pressed
      const tripTypeButtons = page.locator('[aria-pressed]');
      const tripTypeCount = await tripTypeButtons.count();
      if (tripTypeCount < 2) {
        throw new Error(`Expected at least 2 trip-type aria-pressed buttons, found ${tripTypeCount}`);
      }

      // 8. No horizontal overflow at desktop
      const bodyOverflow = await page.evaluate(() => {
        return document.body.scrollWidth > document.body.clientWidth;
      });
      if (bodyOverflow) {
        throw new Error("Horizontal overflow detected at 1440px desktop width");
      }

      // 9. Destination prefill: /destinations/IST should have GZA → IST prefilled after hydration,
      // even when a prior booking draft stored in localStorage selected another destination (AMM).
      await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
      await waitForNetworkRoute(page);
      await page.evaluate(() => {
        const priorStore = {
          draft: {
            criteria: {
              origin: "GZA",
              destination: "AMM",
              departDate: "2026-10-15",
              returnDate: "2026-10-22",
              tripType: "round",
              adults: 1,
              children: 0,
              infants: 0,
              cabin: "economy",
            },
          },
          bookings: [],
        };
        localStorage.setItem("gza.booking.draft.v1", JSON.stringify({schemaVersion:1,status:"active",revision:1,updatedAt:new Date().toISOString(),source:"direct",draft:{...priorStore.draft,entry:"search",outbound:null,inbound:null,fareId:"classic",passengers:[],seats:{},extras:{pax:[]},contact:{email:"",phone:""}}}));
      });

      // 9a. Test /destinations/IST (English)
      await page.goto(baseUrl + "/destinations/IST", { waitUntil: "domcontentloaded" });
      await waitForNetworkRoute(page);
      await page.waitForSelector("#search-from", { timeout: 10000 });
      await page.waitForSelector("#search-to", { timeout: 10000 });
      await page.waitForTimeout(150);

      const istFromData = await page.evaluate(() => {
        const btn = document.getElementById("search-from");
        const code = btn?.querySelector('[data-slot="airport-code"]')?.textContent?.trim() || "";
        const city = btn?.querySelector('[data-slot="airport-city"]')?.textContent?.trim() || "";
        return { text: btn?.textContent || "", aria: btn?.getAttribute("aria-label") || "", code, city };
      });
      const istToData = await page.evaluate(() => {
        const btn = document.getElementById("search-to");
        const code = btn?.querySelector('[data-slot="airport-code"]')?.textContent?.trim() || "";
        const city = btn?.querySelector('[data-slot="airport-city"]')?.textContent?.trim() || "";
        return { text: btn?.textContent || "", aria: btn?.getAttribute("aria-label") || "", code, city };
      });

      if (istFromData.code !== "GZA" && !istFromData.text.includes("GZA")) {
        throw new Error(`Expected GZA prefilled as origin on /destinations/IST, got code="${istFromData.code}", text="${istFromData.text}"`);
      }
      if (istToData.code !== "IST" && !istToData.text.includes("IST")) {
        throw new Error(`Expected IST prefilled as destination on /destinations/IST (authoritative over stored AMM draft), got code="${istToData.code}", text="${istToData.text}"`);
      }

      // 9b. Test /ar/destinations/IST (Arabic)
      await page.goto(baseUrl + "/ar/destinations/IST", { waitUntil: "domcontentloaded" });
      await waitForNetworkRoute(page);
      await page.waitForSelector("#search-from", { timeout: 10000 });
      await page.waitForSelector("#search-to", { timeout: 10000 });
      await page.waitForTimeout(150);

      const arIstFromData = await page.evaluate(() => {
        const btn = document.getElementById("search-from");
        const code = btn?.querySelector('[data-slot="airport-code"]')?.textContent?.trim() || "";
        return { text: btn?.textContent || "", code };
      });
      const arIstToData = await page.evaluate(() => {
        const btn = document.getElementById("search-to");
        const code = btn?.querySelector('[data-slot="airport-code"]')?.textContent?.trim() || "";
        return { text: btn?.textContent || "", code };
      });

      if (arIstFromData.code !== "GZA" && !arIstFromData.text.includes("GZA")) {
        throw new Error(`Expected GZA prefilled as origin on /ar/destinations/IST, got: "${arIstFromData.code}"`);
      }
      if (arIstToData.code !== "IST" && !arIstToData.text.includes("IST")) {
        throw new Error(`Expected IST prefilled as destination on /ar/destinations/IST, got: "${arIstToData.code}"`);
      }

      // 9c. Verify Home route preserves normal draft behavior
      await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
      await waitForNetworkRoute(page);
      await page.waitForSelector("#search-to", { timeout: 10000 });
      const homeToData = await page.evaluate(() => {
        const btn = document.getElementById("search-to");
        return btn?.querySelector('[data-slot="airport-code"]')?.textContent?.trim() || "";
      });
      if (homeToData !== "AMM") {
        throw new Error(`Expected Home to preserve stored draft destination (AMM), got "${homeToData}"`);
      }

      // 10. Verify no horizontal overflow at 390px mobile & Swap target size >= 44x44
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
      await waitForNetworkRoute(page);
      const mobileOverflow = await page.evaluate(() => {
        return document.body.scrollWidth > document.body.clientWidth;
      });
      if (mobileOverflow) {
        throw new Error("Horizontal overflow detected at 390px mobile width on Home");
      }

      // Swap button touch target bounding box assertion at mobile width
      const swapTargetMobile = await page.evaluate(() => {
        const btn = document.querySelector('[data-slot="route-swap-button"]');
        if (!btn) return null;
        const rect = btn.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      if (!swapTargetMobile) {
        throw new Error("Swap button [data-slot=\"route-swap-button\"] not found on mobile");
      }
      if (swapTargetMobile.width < 44 || swapTargetMobile.height < 44) {
        throw new Error(`Mobile Swap button touch target must be at least 44x44px, got ${swapTargetMobile.width}x${swapTargetMobile.height}px`);
      }

      // The mobile layout runs through 767px. Check both trip-type buttons and
      // Swap across the full range, including the 640px Tailwind breakpoint.
      for (const localePath of ["/", "/ar"]) {
        for (const width of [320, 390, 640, 767]) {
          await page.setViewportSize({ width, height: 844 });
          await page.goto(baseUrl + localePath, { waitUntil: "domcontentloaded" });
      await waitForNetworkRoute(page);
          await page.waitForSelector('[data-flight-search-console] [data-slot="route-swap-button"]');
          const targets = await page.evaluate(() => {
            const form = document.querySelector('form[data-flight-search-console]');
            const swap = form?.querySelector('[data-slot="route-swap-button"]');
            const tripTypes = Array.from(form?.querySelectorAll('[data-slot="trip-type-button"]') ?? []);
            const size = (element) => {
              const rect = element.getBoundingClientRect();
              return { width: rect.width, height: rect.height };
            };
            return {
              swap: swap ? size(swap) : null,
              tripTypes: tripTypes.map(size),
              overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            };
          });
          if (!targets.swap || targets.tripTypes.length !== 2 || targets.overflow) {
            throw new Error(`Mobile controls missing or overflowing at ${localePath} ${width}px: ${JSON.stringify(targets)}`);
          }
          for (const [name, target] of [["Swap", targets.swap], ...targets.tripTypes.map((target, index) => [`Trip type ${index + 1}`, target])]) {
            if (target.width < 44 || target.height < 44) {
              throw new Error(`${name} touch target below 44x44px at ${localePath} ${width}px: ${JSON.stringify(target)}`);
            }
          }
        }
      }

      // 10b. Verify Swap button interactive behavior at 767px
      await page.setViewportSize({ width: 767, height: 844 });
      await page.goto(baseUrl + "/", { waitUntil: "load" });
      await waitForNetworkRoute(page);
      await page.waitForSelector("#search-from", { timeout: 10000 });
      const beforeSwap = await page.evaluate(() => {
        const from = document.getElementById("search-from")?.querySelector('[data-slot="airport-code"]')?.textContent?.trim();
        const to = document.getElementById("search-to")?.querySelector('[data-slot="airport-code"]')?.textContent?.trim();
        return { from, to };
      });
      await page.locator('[data-slot="route-swap-button"]').click();
      await page.waitForFunction(({ from, to }) => {
        const origin = document.querySelector('#search-from [data-slot="airport-code"]')?.textContent?.trim();
        const destination = document.querySelector('#search-to [data-slot="airport-code"]')?.textContent?.trim();
        return origin === to && destination === from;
      }, beforeSwap);
      const afterSwap = await page.evaluate(() => {
        const from = document.getElementById("search-from")?.querySelector('[data-slot="airport-code"]')?.textContent?.trim();
        const to = document.getElementById("search-to")?.querySelector('[data-slot="airport-code"]')?.textContent?.trim();
        return { from, to };
      });
      if (afterSwap.from !== beforeSwap.to || afterSwap.to !== beforeSwap.from) {
        throw new Error("Swap button failed to swap origin and destination: before=" + JSON.stringify(beforeSwap) + ", after=" + JSON.stringify(afterSwap));
      }
      // Click again to swap back
      await page.locator('[data-slot="route-swap-button"]').click();
      await page.waitForFunction(({ from, to }) => {
        const origin = document.querySelector('#search-from [data-slot="airport-code"]')?.textContent?.trim();
        const destination = document.querySelector('#search-to [data-slot="airport-code"]')?.textContent?.trim();
        return origin === from && destination === to;
      }, beforeSwap);
      const afterSwapBack = await page.evaluate(() => {
        const from = document.getElementById("search-from")?.querySelector('[data-slot="airport-code"]')?.textContent?.trim();
        const to = document.getElementById("search-to")?.querySelector('[data-slot="airport-code"]')?.textContent?.trim();
        return { from, to };
      });
      if (afterSwapBack.from !== beforeSwap.from || afterSwapBack.to !== beforeSwap.to) {
        throw new Error("Swap button failed to restore original route on second click");
      }

      // 10c. Verify desktop trip-type buttons are compact (not overinflated, height <= 38px)
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(baseUrl + "/", { waitUntil: "load" });
      await waitForNetworkRoute(page);
      const desktopTripHeight = await page.evaluate(() => {
        const btn = document.querySelector('[data-slot="trip-type-button"]');
        return btn ? btn.getBoundingClientRect().height : 0;
      });
      if (desktopTripHeight <= 0 || desktopTripHeight > 38) {
        throw new Error("Desktop trip-type button height outside compact range: " + desktopTripHeight + "px");
      }

      // 11. Viewport 320px: zero clipping of IATA codes and city names in EN and AR
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
      await waitForNetworkRoute(page);
      const smallMobileOverflow = await page.evaluate(() => {
        return document.body.scrollWidth > document.body.clientWidth;
      });
      if (smallMobileOverflow) {
        throw new Error("Horizontal overflow detected at 320px width on Home");
      }

      // Check rendered visibility and bounding box of IATA code and city inside trigger at 320px
      const routeBoundingBoxes320 = await page.evaluate(() => {
        function checkEndpoint(id) {
          const trigger = document.getElementById(id);
          if (!trigger) return { error: `Trigger #${id} not found` };
          const triggerRect = trigger.getBoundingClientRect();
          const codeEl = trigger.querySelector('[data-slot="airport-code"]');
          const cityEl = trigger.querySelector('[data-slot="airport-city"]');
          if (!codeEl || !cityEl) return { error: `Slots missing in #${id}` };
          const codeRect = codeEl.getBoundingClientRect();
          const cityRect = cityEl.getBoundingClientRect();

          // Code and city must have positive dimensions and be inside trigger horizontal bounds
          const codeFits = codeRect.width > 0 && codeRect.left >= (triggerRect.left - 1) && codeRect.right <= (triggerRect.right + 1);
          const cityFits = cityRect.width > 0 && cityRect.left >= (triggerRect.left - 1) && cityRect.right <= (triggerRect.right + 1);

          return {
            triggerWidth: triggerRect.width,
            codeWidth: codeRect.width,
            cityWidth: cityRect.width,
            codeFits,
            cityFits,
          };
        }
        return {
          from: checkEndpoint("search-from"),
          to: checkEndpoint("search-to"),
        };
      });

      if (!routeBoundingBoxes320.from.codeFits || !routeBoundingBoxes320.from.cityFits) {
        throw new Error(`Route Origin clipped at 320px: ${JSON.stringify(routeBoundingBoxes320.from)}`);
      }
      if (!routeBoundingBoxes320.to.codeFits || !routeBoundingBoxes320.to.cityFits) {
        throw new Error(`Route Destination clipped at 320px: ${JSON.stringify(routeBoundingBoxes320.to)}`);
      }

      // Reset viewport
      await page.setViewportSize({ width: 1440, height: 900 });
      } finally { await routeContext.close(); }
    });

    await checkStep("Check 31: Compact fares and popovers with RTL interaction geometry", async () => {
      for (const [path, rtl] of [["/", false], ["/ar", true]]) {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(baseUrl + path, { waitUntil: "load" });
        await page.locator("#search-depart").waitFor({ state: "visible" });
        const returnInput = page.locator("#search-return");
        if (!(await returnInput.isVisible())) {
          const roundTripBtn = page.locator('button[data-slot="trip-type-button"]:has-text("Round trip"), button[data-slot="trip-type-button"]:has-text("ذهاب وعودة")').first();
          if ((await roundTripBtn.count()) > 0) {
            await roundTripBtn.click();
            await page.waitForTimeout(200);
          }
        }
        await page.locator("#search-return").waitFor({ state: "visible" });
        const positions = await page.evaluate(() => {
          const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
          return {
            from: rect("#search-from")?.x,
            to: rect("#search-to")?.x,
            depart: rect("#search-depart")?.x,
            ret: rect("#search-return")?.x,
            codeDir: document.querySelector('#search-from [data-slot="airport-code"]')?.getAttribute("dir"),
          };
        });
        if (rtl ? !(positions.from > positions.to && positions.depart > positions.ret) : !(positions.from < positions.to && positions.depart < positions.ret)) {
          throw new Error(`Route/date visual order wrong for ${path}: ${JSON.stringify(positions)}`);
        }
        if (positions.codeDir !== "ltr") throw new Error(`IATA code lost LTR isolation on ${path}`);

        await page.locator("#search-depart").click();
        const calendarPopup = page.locator('[data-align][data-state="open"]:visible').last();
        await calendarPopup.waitFor();
        const calendarWidth = (await calendarPopup.boundingBox())?.width ?? 0;
        if (calendarWidth <= 0 || calendarWidth > 850) throw new Error(`Calendar too wide on ${path}: ${calendarWidth}`);
        const monthPositions = await calendarPopup.locator('.calendar-month').evaluateAll((months) => months.map((month) => month.getBoundingClientRect().x));
        if (monthPositions.length !== 2 || (rtl ? !(monthPositions[0] > monthPositions[1]) : !(monthPositions[0] < monthPositions[1]))) {
          throw new Error(`Calendar month order wrong on ${path}: ${JSON.stringify(monthPositions)}`);
        }
        if (await calendarPopup.getAttribute("data-align") !== (rtl ? "end" : "start")) throw new Error(`Calendar alignment wrong on ${path}`);
        if ((await calendarPopup.locator('[data-slot="calendar-currency-legend"] bdi[dir="ltr"]').innerText()) !== "USD") throw new Error("Missing single USD legend");
        const fareCells = calendarPopup.locator('button[data-fare]');
        if (await fareCells.count() < 1) throw new Error("Calendar has no fare cells");
        const fareText = await fareCells.first().innerText();
        if (/USD|US\$|\$/.test(fareText)) throw new Error(`Currency repeated in day cell: ${fareText}`);
        if (!/\d/.test(fareText)) throw new Error(`Fare amount missing in day cell: ${fareText}`);
        const disabledText = await calendarPopup.locator('button[data-day][disabled]').first().innerText();
        if (/[-—$]|USD|US\$/.test(disabledText)) throw new Error(`Disabled day has second-line fare/dash: ${disabledText}`);
        const isoRange = calendarPopup.locator('span[dir="ltr"]').filter({ hasText: /\d{4}-\d{2}-\d{2}/ });
        if (await isoRange.count() < 1) throw new Error("ISO date summary is not LTR isolated");
        await page.keyboard.press("Escape");

        await page.locator("#search-travellers").click();
        const travellersPopup = page.locator('[data-radix-popper-content-wrapper] [role="dialog"]:visible').last();
        const travellersWidth = (await travellersPopup.boundingBox())?.width ?? 0;
        if (travellersWidth <= 0 || travellersWidth > 280) throw new Error(`Travellers panel too wide: ${travellersWidth}`);
        await page.keyboard.press("Escape");

        await page.locator("#search-cabin").click();
        const cabinGroup = page.locator('[role="radiogroup"]:visible').last();
        if (await cabinGroup.getAttribute("dir") !== (rtl ? "rtl" : "ltr")) throw new Error(`Cabin radio direction wrong on ${path}`);
        const cabinWidth = (await cabinGroup.boundingBox())?.width ?? 0;
        if (cabinWidth <= 0 || cabinWidth > 210) throw new Error(`Cabin panel too wide: ${cabinWidth}`);
        await page.keyboard.press("Escape");
        await cabinGroup.waitFor({ state: "hidden" });

        await page.locator("#search-to").click();
        const airportPopup = page.locator('[data-align][data-state="open"]:visible').last();
        if (await airportPopup.getAttribute("data-align") !== (rtl ? "end" : "start")) throw new Error(`Airport alignment wrong on ${path}`);
        const airportWidth = (await airportPopup.boundingBox())?.width ?? 0;
        if (airportWidth <= 0 || airportWidth > 350) throw new Error(`Airport panel too wide: ${airportWidth}`);
        await page.keyboard.press("Escape");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
        if (overflow) throw new Error(`Popup caused document overflow on ${path}`);

        const routeWidthRound = (await page.locator('[data-zone="route"]').boundingBox())?.width ?? 0;
        await page.locator('[data-trip-type="oneway"]').click();
        const routeWidthOneWay = (await page.locator('[data-zone="route"]').boundingBox())?.width ?? 0;
        if (routeWidthOneWay <= routeWidthRound) throw new Error(`One-way route did not reclaim width on ${path}`);
        await page.locator('[data-trip-type="round"]').click();
      }

      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto(baseUrl + "/", { waitUntil: "load" });
      await page.locator("#search-depart").click();
      if (await page.locator('[data-slot="calendar"] .calendar-month').count() !== 1) throw new Error("Tablet calendar must show one month");
      await page.keyboard.press("Escape");

      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(baseUrl + "/ar", { waitUntil: "load" });
        await page.locator("#search-depart").click();
        const bounds = await page.locator('[role="dialog"]:visible').evaluate((dialog) => {
          const calendar = dialog.querySelector('[data-slot="calendar"]');
          const firstDay = dialog.querySelector('button[data-day]');
          const d = dialog.getBoundingClientRect();
          const c = calendar?.getBoundingClientRect();
          const day = firstDay?.getBoundingClientRect();
          return { dialogLeft: d.left, dialogRight: d.right, calendarLeft: c?.left, calendarRight: c?.right, dayWidth: day?.width, dayHeight: day?.height, viewport: innerWidth };
        });
        if (bounds.dialogLeft < -2 || bounds.dialogRight > width + 2 || (bounds.calendarLeft ?? -1) < -2 || (bounds.calendarRight ?? width + 1) > width + 2) {
          throw new Error(`Arabic mobile calendar clipped at ${width}px: ${JSON.stringify(bounds)}`);
        }
        if ((bounds.dayWidth ?? 0) < 43.5 || (bounds.dayHeight ?? 0) < 43.5) {
          throw new Error(`Arabic mobile calendar day target below 44px at ${width}px: ${JSON.stringify(bounds)}`);
        }
        await page.keyboard.press("Escape");
      }
    });

    await checkStep("Check 29: Console one-way/round-trip toggle, traveller stepper, cabin selection, and /book search flow", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
      // Static HTML can be visible before the client handlers are established.
      await page.waitForLoadState("load");
      await page.waitForTimeout(350);

      // 1. Round-trip is default
      const roundTripBtn = page.locator('[aria-pressed]').first();
      const isRoundTripSelected = await roundTripBtn.getAttribute("aria-pressed");
      if (isRoundTripSelected !== "true") {
        throw new Error(`Expected first trip-type button to be selected (round trip), got aria-pressed="${isRoundTripSelected}"`);
      }

      // 2. Click "One way" — return date field should be removed from layout (no dead field or gap)
      const oneWayBtn = page.locator('[aria-pressed]').nth(1);
      await oneWayBtn.click();
      await page.waitForTimeout(200);
      const oneWaySelected = await oneWayBtn.getAttribute("aria-pressed");
      if (oneWaySelected !== "true") {
        throw new Error(`Expected One way button to be selected after click, got "${oneWaySelected}"`);
      }
      const returnCountAfterOneWay = await page.locator('#search-return').count();
      if (returnCountAfterOneWay !== 0) {
        throw new Error(`Return date field should be removed from layout in one-way mode (no dead field or gap), found ${returnCountAfterOneWay}`);
      }

      // 3. Switch back to round-trip — return date should restore
      await roundTripBtn.click();
      await page.waitForTimeout(200);
      const roundTripRestored = await roundTripBtn.getAttribute("aria-pressed");
      if (roundTripRestored !== "true") {
        throw new Error(`Round trip button should be selected after clicking it back, got "${roundTripRestored}"`);
      }
      const returnCountAfterRestore = await page.locator('#search-return').count();
      if (returnCountAfterRestore === 0) {
        throw new Error("Return date field should be restored when switching back to round-trip");
      }

      // 4. Open Travellers picker, verify steppers
      await page.locator('#search-travellers').click();
      await page.waitForSelector('div[role="group"][aria-labelledby*="adults-label"]', { timeout: 5000 });

      // Verify adults label
      const adultsGroup = page.locator('div[role="group"][aria-labelledby*="adults-label"]');
      if ((await adultsGroup.count()) === 0) {
        throw new Error("Adults stepper group not visible in travellers picker");
      }

      // Increment children
      await page.locator('div[role="group"][aria-labelledby*="children-label"] button').last().click();
      await page.waitForTimeout(150);

      // Verify children count updated
      const childrenCount = await page.locator('div[role="group"][aria-labelledby*="children-label"] span[aria-live]').textContent();
      if (childrenCount?.trim() !== "1") {
        throw new Error(`Expected children count to be 1 after increment, got "${childrenCount}"`);
      }

      // Close travellers by clicking Done
      await page.locator('button:has-text("Done"), button:has-text("تم")').first().click();
      await page.waitForTimeout(200);

      // Verify #search-travellers now shows 2 in label (1 adult + 1 child = 2)
      const travTriggerLabel = await page.locator('#search-travellers').getAttribute("aria-label");
      if (!travTriggerLabel?.includes("2")) {
        throw new Error(`Expected travellers trigger to show 2 passengers, got: "${travTriggerLabel}"`);
      }

      // 5. Open Cabin picker, verify cabin options
      await page.locator('#search-cabin').click();
      await page.waitForSelector('[role="radio"]', { timeout: 5000 });
      const cabinOptions = await page.locator('[role="radio"]').count();
      if (cabinOptions < 3) {
        throw new Error(`Expected at least 3 cabin radio options, found ${cabinOptions}`);
      }

      // Select Business
      const businessOption = page.locator('[role="radio"][value="business"]');
      await businessOption.click();
      await page.waitForTimeout(200);

      // Cabin trigger label should update to Business
      const cabinTriggerLabel = await page.locator('#search-cabin').getAttribute("aria-label");
      if (!cabinTriggerLabel?.toLowerCase().includes("business")) {
        throw new Error(`Expected cabin trigger to show Business after selection, got: "${cabinTriggerLabel}"`);
      }

      // 6. Verify /book has its own working search form at 1440
      await page.goto(baseUrl + "/book?step=search", { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-flight-search-console="standard"]', { timeout: 10000 });
      await page.waitForSelector('#search-cabin', { timeout: 10000 });
      const bookSearchForm = page.locator('[data-flight-search-console="standard"]');
      if ((await bookSearchForm.count()) === 0) {
        throw new Error("/book must render the standard console");
      }
      const bookFromField = await page.locator('#search-from').count();
      const bookToField = await page.locator('#search-to').count();
      const bookTravellers = await page.locator('#search-travellers').count();
      const bookCabin = await page.locator('#search-cabin').count();
      if (bookFromField === 0 || bookToField === 0 || bookTravellers === 0 || bookCabin === 0) {
        throw new Error(`/book console missing fields: from=${bookFromField}, to=${bookToField}, travellers=${bookTravellers}, cabin=${bookCabin}`);
      }

      // 7. No overflow at 1024 (tablet)
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
      const tabletOverflow = await page.evaluate(() => {
        return document.body.scrollWidth > document.body.clientWidth;
      });
      if (tabletOverflow) {
        throw new Error("Horizontal overflow at 1024px tablet width on Home");
      }

      // 8. No overflow at 768px
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
      const tabletSmallOverflow = await page.evaluate(() => {
        return document.body.scrollWidth > document.body.clientWidth;
      });
      if (tabletSmallOverflow) {
        throw new Error("Horizontal overflow at 768px width on Home");
      }

      // 9. No overflow at 360px
      await page.setViewportSize({ width: 360, height: 740 });
      await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
      const smallOverflow = await page.evaluate(() => {
        return document.body.scrollWidth > document.body.clientWidth;
      });
      if (smallOverflow) {
        throw new Error("Horizontal overflow at 360px width on Home");
      }

      // Reset viewport
      await page.setViewportSize({ width: 1440, height: 900 });
    });

    await checkStep("Check 30: Arabic console RTL symmetry, no mirroring of ticket art, technical LTR isolation", async () => {
      const routeContext = await browser.newContext();
      const page = await routeContext.newPage();
      try {

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(baseUrl + "/ar", { waitUntil: "domcontentloaded" });
      await waitForNetworkRoute(page);

      // 1. Arabic home form has context="home"
      const arHomeConsole = page.locator('[data-flight-search-console="home"]').first();
      if ((await arHomeConsole.count()) === 0) {
        throw new Error("Arabic Home form must have data-flight-search-console=\"home\"");
      }

      // 2. Trip type buttons visible and accessible
      const arTripTypeButtons = page.locator('[aria-pressed]');
      if ((await arTripTypeButtons.count()) < 2) {
        throw new Error("Arabic home must have at least 2 trip-type aria-pressed buttons");
      }

      // 3. Route fields (#search-from, #search-to) exist
      const arFrom = await page.locator('#search-from').count();
      const arTo = await page.locator('#search-to').count();
      if (arFrom === 0 || arTo === 0) {
        throw new Error(`Arabic console missing route fields: from=${arFrom}, to=${arTo}`);
      }

      // 4. Ticket art is NOT mirrored in RTL (image has no transform scaleX applied)
      const ticketMirrored = await page.evaluate(() => {
        const img = document.querySelector('img[data-decorative-asset="home-flight-search-ticket"]');
        if (!img) return false;
        const style = window.getComputedStyle(img);
        const transform = style.transform;
        return transform.includes("matrix(-1") || transform.includes("scaleX(-1)");
      });
      if (ticketMirrored) {
        throw new Error("Ticket world-map artwork must NOT be mirrored in Arabic RTL mode");
      }

      // 5. Arabic /ar/book has standard context
      await page.goto(baseUrl + "/ar/book", { waitUntil: "domcontentloaded" });
      await waitForNetworkRoute(page);
      const arBookConsole = await page.locator('[data-flight-search-console="standard"]').count();
      if (arBookConsole === 0) {
        throw new Error("/ar/book must have data-flight-search-console=\"standard\"");
      }

      // 6. Arabic /ar/destinations/IST has standard context
      await page.goto(baseUrl + "/ar/destinations/IST", { waitUntil: "domcontentloaded" });
      await waitForNetworkRoute(page);
      const arDestConsole = await page.locator('[data-flight-search-console="standard"]').count();
      if (arDestConsole === 0) {
        throw new Error("/ar/destinations/IST must have data-flight-search-console=\"standard\"");
      }

      // 7. No horizontal overflow in Arabic at 390px
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(baseUrl + "/ar", { waitUntil: "domcontentloaded" });
      await waitForNetworkRoute(page);
      const arMobileOverflow = await page.evaluate(() => {
        return document.body.scrollWidth > document.body.clientWidth;
      });
      if (arMobileOverflow) {
        throw new Error("Horizontal overflow on Arabic Home at 390px");
      }

      // 8. No horizontal overflow in Arabic at 320px
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto(baseUrl + "/ar", { waitUntil: "domcontentloaded" });
      await waitForNetworkRoute(page);
      const arSmallOverflow = await page.evaluate(() => {
        return document.body.scrollWidth > document.body.clientWidth;
      });
      if (arSmallOverflow) {
        throw new Error("Horizontal overflow on Arabic Home at 320px");
      }

      // 9. Arabic 320px bounding box check: assert codes and cities fit without horizontal clipping
      const arBoundingBoxes320 = await page.evaluate(() => {
        function checkEndpoint(id) {
          const trigger = document.getElementById(id);
          if (!trigger) return { error: `Trigger #${id} not found` };
          const triggerRect = trigger.getBoundingClientRect();
          const codeEl = trigger.querySelector('[data-slot="airport-code"]');
          const cityEl = trigger.querySelector('[data-slot="airport-city"]');
          if (!codeEl || !cityEl) return { error: `Slots missing in #${id}` };
          const codeRect = codeEl.getBoundingClientRect();
          const cityRect = cityEl.getBoundingClientRect();

          const codeFits = codeRect.width > 0 && codeRect.left >= (triggerRect.left - 1) && codeRect.right <= (triggerRect.right + 1);
          const cityFits = cityRect.width > 0 && cityRect.left >= (triggerRect.left - 1) && cityRect.right <= (triggerRect.right + 1);

          return {
            triggerWidth: triggerRect.width,
            codeWidth: codeRect.width,
            cityWidth: cityRect.width,
            codeFits,
            cityFits,
          };
        }
        return {
          from: checkEndpoint("search-from"),
          to: checkEndpoint("search-to"),
        };
      });

      if (!arBoundingBoxes320.from.codeFits || !arBoundingBoxes320.from.cityFits) {
        throw new Error(`Arabic Route Origin clipped at 320px: ${JSON.stringify(arBoundingBoxes320.from)}`);
      }
      if (!arBoundingBoxes320.to.codeFits || !arBoundingBoxes320.to.cityFits) {
        throw new Error(`Arabic Route Destination clipped at 320px: ${JSON.stringify(arBoundingBoxes320.to)}`);
      }

      // Reset viewport
      await page.setViewportSize({ width: 1440, height: 900 });
      } finally { await routeContext.close(); }
    });

    await checkStep("Check 32: Home utility rail integration (4 cards, WebP loading, LTR mirroring, empty alt, links)", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });

      // 1. Locate rail
      const rail = page.locator('[data-home-utility-rail="true"]').first();
      if ((await rail.count()) === 0) {
        throw new Error("Home page missing [data-home-utility-rail='true']");
      }

      // 2. Assert 4 cards
      const cards = ["flight-status", "check-in", "travel-guidelines", "airport-heritage"];
      for (const cardKey of cards) {
        const cardLocator = page.locator(`[data-utility-card="${cardKey}"]`);
        if ((await cardLocator.count()) === 0) {
          throw new Error(`Missing utility card: ${cardKey}`);
        }
        // Verify image inside card
        const imgLocator = cardLocator.locator("img").first();
        if ((await imgLocator.count()) === 0) {
          throw new Error(`Missing image in utility card: ${cardKey}`);
        }
        const imgMeta = await imgLocator.evaluate((img) => ({
          alt: img.getAttribute("alt"),
          ariaHidden: img.getAttribute("aria-hidden"),
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          hasLtrMirrorClass: img.classList.contains("ltr:scale-x-[-1]"),
        }));
        if (imgMeta.alt !== "") {
          throw new Error(`Utility card ${cardKey} image must have alt="" (got "${imgMeta.alt}")`);
        }
        if (imgMeta.ariaHidden !== "true") {
          throw new Error(`Utility card ${cardKey} image must have aria-hidden="true"`);
        }
        if (imgMeta.naturalWidth <= 0 || imgMeta.naturalHeight <= 0) {
          throw new Error(`Utility card ${cardKey} image failed to load (naturalWidth=${imgMeta.naturalWidth})`);
        }
        if (!imgMeta.hasLtrMirrorClass) {
          throw new Error(`Utility card ${cardKey} image must have ltr:scale-x-[-1] class`);
        }
      }

      // 3. Arabic check: images loaded, natural orientation (no scale-x-[-1] mirroring in RTL)
      await page.goto(baseUrl + "/ar", { waitUntil: "domcontentloaded" });
      const arRail = page.locator('[data-home-utility-rail="true"]').first();
      if ((await arRail.count()) === 0) {
        throw new Error("Arabic Home page missing [data-home-utility-rail='true']");
      }
      for (const cardKey of cards) {
        const cardLocator = page.locator(`[data-utility-card="${cardKey}"]`);
        if ((await cardLocator.count()) === 0) {
          throw new Error(`Missing Arabic utility card: ${cardKey}`);
        }
        const imgLoaded = await cardLocator.locator("img").first().evaluate((img) => {
          const style = window.getComputedStyle(img);
          const isMirrored = style.transform.includes("matrix(-1") || style.transform.includes("scaleX(-1)");
          return {
            naturalWidth: img.naturalWidth,
            isMirrored,
          };
        });
        if (imgLoaded.naturalWidth <= 0) {
          throw new Error(`Arabic utility card ${cardKey} image failed to load`);
        }
        if (imgLoaded.isMirrored) {
          throw new Error(`Arabic utility card ${cardKey} image must NOT be mirrored in RTL`);
        }
      }

      // 4. Responsive checks: 768px (2x2) and 320px (stacked) zero horizontal overflow
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
      let overflow = await page.evaluate(() => document.body.scrollWidth > document.body.clientWidth);
      if (overflow) throw new Error("Horizontal overflow at 768px with utility rail");

      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
      overflow = await page.evaluate(() => document.body.scrollWidth > document.body.clientWidth);
      if (overflow) throw new Error("Horizontal overflow at 320px with utility rail");

      await page.setViewportSize({ width: 1440, height: 900 });
    });

    await checkStep("Check 33: Eight public photo heroes on target routes in EN and AR — editorial archive context, absent illustrative badge, mobile auth disclosure, images loaded, non-mirrored", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });

      // Archive heroes show data-archive-context; service/illustrative heroes show NO badge or archive context
      const heroRoutes = [
        {
          path: "/airport",
          arPath: "/ar/airport",
          key: "airport",
          expectArchiveContext: true,
          enText: "Archive",
          arText: "الأرشيف",
        },
        {
          path: "/airport/present",
          arPath: "/ar/airport/present",
          key: "present",
          expectArchiveContext: true,
          enText: "June 2008",
          arText: "2008",
        },
        {
          path: "/gallery",
          arPath: "/ar/gallery",
          key: "gallery",
          expectArchiveContext: true,
          enText: "Archive",
          arText: "الأرشيف",
          extraCheck: async (p, isAr) => {
            const link = p.locator(isAr ? 'a[href="/ar/airport/future"]' : 'a[href="/airport/future"]');
            if ((await link.count()) === 0) {
              throw new Error("Gallery hero must preserve future-link helper");
            }
          },
        },
        {
          path: "/destinations",
          arPath: "/ar/destinations",
          key: "destinations",
          expectArchiveContext: false,
          extraCheck: async (p) => {
            const input = p.locator("#dest-search");
            if ((await input.count()) === 0) {
              throw new Error("Destinations hero must preserve filter search input");
            }
          },
        },
        {
          path: "/travel",
          arPath: "/ar/travel",
          key: "travel",
          expectArchiveContext: false,
          extraCheck: async (p) => {
            const tabs = p.locator('[role="tablist"]');
            if ((await tabs.count()) === 0) {
              throw new Error("Travel page must preserve section tabs below hero");
            }
          },
        },
        {
          path: "/manage",
          arPath: "/ar/manage",
          key: "manage",
          expectArchiveContext: false,
          extraCheck: async (p) => {
            const pnr = p.locator("#pnr");
            const idInput = p.locator("#identifier");
            if ((await pnr.count()) === 0 || (await idInput.count()) === 0) {
              throw new Error("Manage page must preserve lookup inputs below hero");
            }
          },
        },
        {
          path: "/check-in",
          arPath: "/ar/check-in",
          key: "check-in",
          expectArchiveContext: false,
          extraCheck: async (p) => {
            const pnr = p.locator("#ci-pnr");
            const idInput = p.locator("#ci-identifier");
            if ((await pnr.count()) === 0 || (await idInput.count()) === 0) {
              throw new Error("Check-in page must preserve lookup inputs below hero");
            }
          },
        },
        {
          path: "/flights",
          arPath: "/ar/flights",
          key: "flights",
          expectArchiveContext: false,
          extraCheck: async (p) => {
            // Switcher board and toolbar must be present below hero
            const switcher = p.locator('[role="group"][aria-label]').first();
            const toolbar = p.locator('[data-testid="flights-search-toolbar"]');
            if ((await switcher.count()) === 0) {
              throw new Error("Flights page must preserve Departures/Arrivals switcher below hero");
            }
            if ((await toolbar.count()) === 0) {
              throw new Error("Flights page must preserve search toolbar below hero");
            }
          },
        },
      ];

      for (const route of heroRoutes) {
        // English
        await page.goto(baseUrl + route.path, { waitUntil: "domcontentloaded" });
        const hero = page.locator(`[data-public-hero="${route.key}"]`);
        if ((await hero.count()) === 0) {
          throw new Error(`Missing [data-public-hero="${route.key}"] on ${route.path}`);
        }

        if (route.expectArchiveContext) {
          // Archive heroes MUST have editorial eyebrow context (data-archive-context)
          const eyebrow = hero.locator('[data-archive-context]');
          if ((await eyebrow.count()) === 0) {
            throw new Error(`Missing [data-archive-context] on ${route.path}`);
          }
          const eyebrowText = await eyebrow.innerText();
          if (!eyebrowText.toLowerCase().includes(route.enText.toLowerCase())) {
            throw new Error(`Archive eyebrow on ${route.path} expected to contain "${route.enText}", got "${eyebrowText}"`);
          }
          // Strictly NO truth badge pill
          const anyBadge = hero.locator('[data-truth-badge]');
          if ((await anyBadge.count()) > 0) {
            throw new Error(`Archive hero on ${route.path} must NOT render a [data-truth-badge] pill`);
          }
        } else {
          // Service/illustrative heroes MUST NOT show any passenger-visible badge or archive context
          const anyBadge = hero.locator('[data-truth-badge]');
          if ((await anyBadge.count()) > 0) {
            throw new Error(`Service hero on ${route.path} must NOT render a passenger-visible truth badge`);
          }
          const archiveContext = hero.locator('[data-archive-context]');
          if ((await archiveContext.count()) > 0) {
            throw new Error(`Service hero on ${route.path} must NOT render [data-archive-context]`);
          }
        }

        // Image loaded & NOT mirrored
        const heroImg = await hero.locator("img").first().evaluate((img) => {
          const style = window.getComputedStyle(img);
          const isMirrored = style.transform.includes("matrix(-1") || style.transform.includes("scaleX(-1)");
          return {
            naturalWidth: img.naturalWidth,
            isMirrored,
          };
        });
        if (heroImg.naturalWidth <= 0) {
          throw new Error(`Hero image failed to load on ${route.path}`);
        }
        if (heroImg.isMirrored) {
          throw new Error(`Photographic hero image on ${route.path} must NEVER be mirrored`);
        }
        if (route.extraCheck) {
          await route.extraCheck(page, false);
        }

        // Arabic
        await page.goto(baseUrl + route.arPath, { waitUntil: "domcontentloaded" });
        const arHero = page.locator(`[data-public-hero="${route.key}"]`);
        if ((await arHero.count()) === 0) {
          throw new Error(`Missing [data-public-hero="${route.key}"] on ${route.arPath}`);
        }

        if (route.expectArchiveContext) {
          const arEyebrow = arHero.locator('[data-archive-context]');
          if ((await arEyebrow.count()) === 0) {
            throw new Error(`Missing [data-archive-context] on ${route.arPath}`);
          }
          const arEyebrowText = await arEyebrow.innerText();
          if (!arEyebrowText.includes(route.arText)) {
            throw new Error(`Archive eyebrow on ${route.arPath} expected to contain "${route.arText}", got "${arEyebrowText}"`);
          }
          const arAnyBadge = arHero.locator('[data-truth-badge]');
          if ((await arAnyBadge.count()) > 0) {
            throw new Error(`Archive hero on ${route.arPath} must NOT render a [data-truth-badge] pill`);
          }
        } else {
          const arAnyBadge = arHero.locator('[data-truth-badge]');
          if ((await arAnyBadge.count()) > 0) {
            throw new Error(`Service hero on ${route.arPath} must NOT render a passenger-visible truth badge`);
          }
          const arArchiveContext = arHero.locator('[data-archive-context]');
          if ((await arArchiveContext.count()) > 0) {
            throw new Error(`Service hero on ${route.arPath} must NOT render [data-archive-context]`);
          }
        }

        const arHeroImg = await arHero.locator("img").first().evaluate((img) => {
          const style = window.getComputedStyle(img);
          const isMirrored = style.transform.includes("matrix(-1") || style.transform.includes("scaleX(-1)");
          return {
            naturalWidth: img.naturalWidth,
            isMirrored,
          };
        });
        if (arHeroImg.naturalWidth <= 0) {
          throw new Error(`Hero image failed to load on ${route.arPath}`);
        }
        if (arHeroImg.isMirrored) {
          throw new Error(`Photographic hero image on ${route.arPath} must NEVER be mirrored`);
        }
        if (route.extraCheck) {
          await route.extraCheck(page, true);
        }
      }

      // Sign-in photo panel: photo loads, NOT mirrored, NO passenger-visible badge, NO disclosure on photo
      // English desktop (1440px)
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(baseUrl + "/signin", { waitUntil: "domcontentloaded" });
      const signinMedia = page.locator('[data-auth-media="signin"]');
      if ((await signinMedia.count()) === 0) {
        throw new Error("Missing [data-auth-media='signin'] on /signin");
      }
      // Confirm no truth badge pill and no disclosure text on the photo panel
      const signinBadge = signinMedia.locator('[data-truth-badge]');
      if ((await signinBadge.count()) > 0) {
        throw new Error("Sign-in photo panel must NOT render a passenger-visible truth badge");
      }
      const signinPhotoDisclosure = signinMedia.locator('[data-auth-disclosure]');
      if ((await signinPhotoDisclosure.count()) > 0) {
        throw new Error("Sign-in photo panel must NOT contain the simulation disclosure note");
      }

      // Verify disclosure is in the form panel, visible at desktop (1440px), and nonduplicated
      const signinFormDisclosure = page.locator('[data-auth-disclosure="signin"]');
      if ((await signinFormDisclosure.count()) !== 1) {
        throw new Error("Expected exactly one [data-auth-disclosure='signin'] in the sign-in form panel");
      }
      if (!(await signinFormDisclosure.isVisible())) {
        throw new Error("[data-auth-disclosure='signin'] must be visible on desktop");
      }
      const disclosureEnText = await signinFormDisclosure.innerText();
      if (!disclosureEnText.includes("device only")) {
        throw new Error(`Sign-in disclosure expected to mention device only, got: "${disclosureEnText}"`);
      }

      const signinImg = await signinMedia.locator("img").first().evaluate((img) => {
        const style = window.getComputedStyle(img);
        const isMirrored = style.transform.includes("matrix(-1") || style.transform.includes("scaleX(-1)");
        return {
          naturalWidth: img.naturalWidth,
          isMirrored,
        };
      });
      if (signinImg.naturalWidth <= 0) {
        throw new Error("Sign-in photo failed to load");
      }
      if (signinImg.isMirrored) {
        throw new Error("Sign-in photo must NEVER be mirrored");
      }

      // Mobile visibility check at 390px
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(baseUrl + "/signin", { waitUntil: "domcontentloaded" });
      const mobileDisclosure = page.locator('[data-auth-disclosure="signin"]');
      if ((await mobileDisclosure.count()) !== 1) {
        throw new Error("Expected exactly one [data-auth-disclosure='signin'] at 390px");
      }
      if (!(await mobileDisclosure.isVisible())) {
        throw new Error("[data-auth-disclosure='signin'] must be visible on mobile (390px)");
      }

      // Mobile visibility check at 320px
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto(baseUrl + "/signin", { waitUntil: "domcontentloaded" });
      const smallDisclosure = page.locator('[data-auth-disclosure="signin"]');
      if (!(await smallDisclosure.isVisible())) {
        throw new Error("[data-auth-disclosure='signin'] must be visible on small mobile (320px)");
      }

      // Arabic signin desktop
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(baseUrl + "/ar/signin", { waitUntil: "domcontentloaded" });
      const arSigninMedia = page.locator('[data-auth-media="signin"]');
      if ((await arSigninMedia.count()) === 0) {
        throw new Error("Missing [data-auth-media='signin'] on /ar/signin");
      }
      const arSigninPhotoDisclosure = arSigninMedia.locator('[data-auth-disclosure]');
      if ((await arSigninPhotoDisclosure.count()) > 0) {
        throw new Error("Arabic sign-in photo panel must NOT contain the simulation disclosure note");
      }
      const arSigninFormDisclosure = page.locator('[data-auth-disclosure="signin"]');
      if ((await arSigninFormDisclosure.count()) !== 1) {
        throw new Error("Expected exactly one [data-auth-disclosure='signin'] on Arabic sign-in");
      }
      if (!(await arSigninFormDisclosure.isVisible())) {
        throw new Error("[data-auth-disclosure='signin'] must be visible on Arabic desktop");
      }
      const arDisclosureText = await arSigninFormDisclosure.innerText();
      if (!arDisclosureText.includes("الجهاز فقط")) {
        throw new Error(`Arabic sign-in disclosure expected to mention الجهاز فقط, got: "${arDisclosureText}"`);
      }

      // Arabic mobile visibility check at 390px
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(baseUrl + "/ar/signin", { waitUntil: "domcontentloaded" });
      const arMobileDisclosure = page.locator('[data-auth-disclosure="signin"]');
      if (!(await arMobileDisclosure.isVisible())) {
        throw new Error("Arabic [data-auth-disclosure='signin'] must be visible on mobile (390px)");
      }

      // Reset viewport to 1440x900
      await page.setViewportSize({ width: 1440, height: 900 });

      // Verify other auth page fallback (e.g. /register does not have data-auth-media="signin")
      await page.goto(baseUrl + "/register", { waitUntil: "domcontentloaded" });
      const registerMedia = await page.locator('[data-auth-media="signin"]').count();
      if (registerMedia > 0) {
        throw new Error("/register must retain default decorative brand panel (no data-auth-media='signin')");
      }
    });

    await checkStep("Check 34: Booking results step (/book?step=results) audit at 1440px and 320px in EN and AR", async () => {
      // 1. English desktop: seed both booking criteria and custom appearance draft
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
      await page.evaluate(() => {
        const depart = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
        const ret = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10);
        const draft = {
          entry: "results",
          criteria: {
            tripType: "round",
            origin: "GZA",
            destination: "AMM",
            departDate: depart,
            returnDate: ret,
            adults: 1,
            children: 0,
            infants: 0,
            cabin: "economy",
          },
          outbound: null,
          inbound: null,
          fareId: "classic",
          passengers: [{ type: "adult", firstName: "", lastName: "", dob: "", nationality: "PS", document: "" }],
          seats: {},
          extras: { pax: [{ baggage: "none", meal: "standard", assistance: "none", lounge: false }] },
          contact: { email: "", phone: "" },
        };
        const envelope = {
          schemaVersion: 1,
          status: "active",
          revision: 1,
          updatedAt: new Date().toISOString(),
          source: "direct",
          draft,
          submissionId: "smoke-sub-check-34",
        };
        localStorage.setItem("gza.booking.draft.v1", JSON.stringify(envelope));
        localStorage.setItem("gza.store.v1", JSON.stringify({ draft, account: null, travelers: [] }));

        // Seed appearance draft with custom recipe for booking.flight-option and booking.trip-summary
        const appearanceDraft = {
          schemaVersion: 1,
          site: {
            appearance: {
              publicCanvas: { pattern: "pie-factory", intensity: "present", scale: "standard" },
              sandSection: { pattern: "pie-factory", intensity: "present", scale: "standard" },
              adminCanvas: { pattern: "pie-factory", intensity: "present", scale: "standard" },
              surfaceGrammar: {
                enabled: true,
                families: {
                  operational: {
                    family: "operational",
                    frame: "plain",
                    tone: "paper",
                    accent: "none",
                    radius: "soft",
                    elevation: "flat",
                    pattern: "none",
                    patternPlacement: "none",
                  },
                  fare: {
                    family: "fare",
                    frame: "indexed",
                    tone: "paper",
                    accent: "brand",
                    radius: "compact",
                    elevation: "soft",
                    pattern: "none",
                    patternPlacement: "none",
                  },
                  dossier: {
                    family: "dossier",
                    frame: "plain",
                    tone: "paper",
                    accent: "none",
                    radius: "soft",
                    elevation: "flat",
                    pattern: "none",
                    patternPlacement: "none",
                  },
                  "form-sheet": {
                    family: "form-sheet",
                    frame: "plain",
                    tone: "paper",
                    accent: "none",
                    radius: "soft",
                    elevation: "flat",
                    pattern: "none",
                    patternPlacement: "none",
                  },
                  guide: {
                    family: "guide",
                    frame: "plain",
                    tone: "paper",
                    accent: "none",
                    radius: "soft",
                    elevation: "flat",
                    pattern: "none",
                    patternPlacement: "none",
                  },
                  editorial: {
                    family: "editorial",
                    frame: "chapter",
                    tone: "paper",
                    accent: "none",
                    radius: "editorial",
                    elevation: "soft",
                    pattern: "none",
                    patternPlacement: "none",
                  },
                },
                targetOverrides: {
                  "booking.flight-option": {
                    tone: "olive-soft",
                    frame: "rail",
                    accent: "clay",
                    radius: "compact",
                  },
                  "booking.trip-summary": {
                    tone: "limestone",
                    frame: "ticket",
                    accent: "brand",
                    elevation: "soft",
                  },
                },
              },
            },
          },
        };
        localStorage.setItem("gza.settings.draft.v1", JSON.stringify(appearanceDraft));
      });

      // 2. Normal Results immunity: verify normal URL (/book?step=results) ignores saved preview skin
      await page.goto(baseUrl + "/book?step=results", { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-surface-target="booking.flight-option"]', { timeout: 10000 });

      const baselineFlightOption = page.locator('[data-surface-target="booking.flight-option"]').first();
      const baselineOptionTone = await baselineFlightOption.getAttribute("data-surface-tone");
      if (baselineOptionTone === "olive-soft") {
        throw new Error("Normal Results leaked preview draft tone onto booking.flight-option");
      }

      const baselineTripSummary = page.locator('[data-surface-target="booking.trip-summary"]');
      if ((await baselineTripSummary.count()) === 0) {
        throw new Error("/book?step=results missing [data-surface-target='booking.trip-summary']");
      }
      const baselineSummaryTone = await baselineTripSummary.getAttribute("data-surface-tone");
      if (baselineSummaryTone === "limestone") {
        throw new Error("Normal Results leaked preview draft tone onto booking.trip-summary");
      }

      // Assert operational surfaces strictly contain no media (no img, no video)
      const mediaCountInOperational = await page.locator(
        '[data-surface-target="booking.flight-option"] img, [data-surface-target="booking.flight-option"] video, [data-surface-target="booking.trip-summary"] img, [data-surface-target="booking.trip-summary"] video'
      ).count();
      if (mediaCountInOperational !== 0) {
        throw new Error(`Operational booking surfaces must contain 0 media elements, found ${mediaCountInOperational}`);
      }

      // Verify Change Search button is present in baseline
      const changeSearchBtn = page.getByRole("button", { name: /Change search|تغيير البحث/i });
      if (!(await changeSearchBtn.isVisible())) {
        throw new Error("Change Search button is not visible on /book?step=results");
      }

      // 3. Explicit skin preview response: open /book?step=results&skinPreview=1
      await page.goto(baseUrl + "/book?step=results&skinPreview=1", { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-surface-target="booking.flight-option"]', { timeout: 10000 });

      const previewFlightOption = page.locator('[data-surface-target="booking.flight-option"]').first();
      const previewOptionTone = await previewFlightOption.getAttribute("data-surface-tone");
      const previewOptionFrame = await previewFlightOption.getAttribute("data-surface-frame");
      if (previewOptionTone !== "olive-soft" || previewOptionFrame !== "rail") {
        throw new Error(
          `Explicit preview failed to apply target override to booking.flight-option (tone: ${previewOptionTone}, frame: ${previewOptionFrame})`
        );
      }

      const previewTripSummary = page.locator('[data-surface-target="booking.trip-summary"]');
      const previewSummaryTone = await previewTripSummary.getAttribute("data-surface-tone");
      const previewSummaryFrame = await previewTripSummary.getAttribute("data-surface-frame");
      if (previewSummaryTone !== "limestone" || previewSummaryFrame !== "ticket") {
        throw new Error(
          `Explicit preview failed to apply target override to booking.trip-summary (tone: ${previewSummaryTone}, frame: ${previewSummaryFrame})`
        );
      }

      // Assert operational surfaces still reject media under explicit preview
      const previewMediaCount = await page.locator(
        '[data-surface-target="booking.flight-option"] img, [data-surface-target="booking.flight-option"] video, [data-surface-target="booking.trip-summary"] img, [data-surface-target="booking.trip-summary"] video'
      ).count();
      if (previewMediaCount !== 0) {
        throw new Error(`Operational surfaces under preview must contain 0 media, found ${previewMediaCount}`);
      }

      // 4. Test round-trip flight selection: outbound and inbound
      const firstOutbound = page.locator('[data-surface-target="booking.flight-option"]:not([disabled])').first();
      await firstOutbound.click();
      await page.waitForFunction(
        (el) => el.getAttribute("data-state") === "checked",
        await firstOutbound.elementHandle(),
        { timeout: 5000 }
      );
      const isOutboundChecked = await firstOutbound.getAttribute("data-state");
      if (isOutboundChecked !== "checked") {
        throw new Error("Outbound flight option did not become checked after click");
      }

      // Verify inbound section and return options are visible
      const inboundHeading = page.locator("#inbound-flights-heading");
      await inboundHeading.waitFor({ state: "visible", timeout: 5000 });

      const inboundOptions = page.locator('#inbound-flights-heading ~ div [data-surface-target="booking.flight-option"]:not([disabled])');
      if ((await inboundOptions.count()) === 0) {
        throw new Error("No return flight options found for round trip");
      }
      const firstInbound = inboundOptions.first();
      await firstInbound.click();
      await page.waitForFunction(
        (el) => el.getAttribute("data-state") === "checked",
        await firstInbound.elementHandle(),
        { timeout: 5000 }
      );
      const isInboundChecked = await firstInbound.getAttribute("data-state");
      if (isInboundChecked !== "checked") {
        throw new Error("Inbound flight option did not become checked after click");
      }

      // 5. Test Change Search button interaction
      await page.getByRole("button", { name: /Change search|تغيير البحث/i }).click();
      await page.waitForURL(/step=search/, { timeout: 5000 });

      // 6. 320px English: assert no horizontal overflow
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto(baseUrl + "/book?step=results", { waitUntil: "domcontentloaded" });
      let overflow = await page.evaluate(() => document.body.scrollWidth > document.body.clientWidth);
      if (overflow) {
        throw new Error("Horizontal overflow on English /book?step=results at 320px");
      }

      // 7. 320px Arabic: assert no horizontal overflow
      await page.goto(baseUrl + "/ar/book?step=results", { waitUntil: "domcontentloaded" });
      overflow = await page.evaluate(() => document.body.scrollWidth > document.body.clientWidth);
      if (overflow) {
        throw new Error("Horizontal overflow on Arabic /ar/book?step=results at 320px");
      }

      // 8. Assert technical codes remain LTR in Arabic
      const ltrCodes = await page.evaluate(() => {
        const codes = Array.from(document.querySelectorAll('[data-surface-target="booking.flight-option"] .code-id, [data-surface-target="booking.flight-option"] code'));
        return codes.every((el) => {
          const dir = el.getAttribute("dir") || window.getComputedStyle(el).direction;
          return dir === "ltr";
        });
      });
      if (!ltrCodes) {
        throw new Error("All technical codes in Arabic flight option must render LTR");
      }

      // Clean up storage
      await page.evaluate(() => {
        localStorage.removeItem("gza.settings.draft.v1");
        localStorage.removeItem("gza.store.v1");
      });

      // Reset viewport
      await page.setViewportSize({ width: 1440, height: 900 });
    });

    await checkStep("Phase 5A Passenger Aggregate, Account Truth & Invariants Smoke", async () => {
      // 1. Setup clean slate with legacy data
      await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem(
          "gza.store.v1",
          JSON.stringify({
            account: {
              email: "smoke@gza.ps",
              firstName: "LegacySmoke",
              lastName: "Pilot",
              phone: "+970 8 000 0000",
              seatPreference: "window",
              mealPreference: "halal",
              newsletter: true,
            },
            travelers: [
              {
                id: "trv-smoke-1",
                firstName: "ChildSmoke",
                lastName: "Pilot",
                dob: "2018-03-03",
                nationality: "Palestinian",
                document: "P12345",
              },
            ],
            draft: { entry: "results" },
          })
        );
      });

      // 2. Navigate to /account -> verify migration happened
      await page.goto(baseUrl + "/account", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("h1", { timeout: 8000 });
      const welcomeText = await page.locator("h1").innerText();
      if (!welcomeText.includes("LegacySmoke")) {
        throw new Error(`Expected account header to include 'LegacySmoke', got '${welcomeText}'`);
      }

      // Verify canonical passenger storage was created
      const passengerRaw = await page.evaluate(() => localStorage.getItem("gza.passenger.v1"));
      if (!passengerRaw) {
        throw new Error("gza.passenger.v1 was not created upon boot/migration");
      }
      const parsedPassenger = JSON.parse(passengerRaw);
      if (parsedPassenger.account?.email !== "smoke@gza.ps" || parsedPassenger.travelers?.length !== 1) {
        throw new Error("Migrated passenger state mismatch in gza.passenger.v1");
      }

      // 3. Test profile edit & verify no dual writing to legacy store
      await page.goto(baseUrl + "/account/profile", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#p-first", { timeout: 8000 });
      // Verify email input is read-only
      const isEmailReadOnly = await page.locator("#p-email").getAttribute("readonly");
      if (isEmailReadOnly === null) {
        throw new Error("Profile email input must be read-only");
      }

      // Edit first name and save
      await page.fill("#p-first", "UpdatedSmoke");
      await page.click('button[type="submit"]');
      await page.waitForSelector('p[role="status"]', { timeout: 5000 });

      // Verify gza.passenger.v1 has updated name
      const updatedPassenger = await page.evaluate(() => JSON.parse(localStorage.getItem("gza.passenger.v1") || "{}"));
      if (updatedPassenger.account?.firstName !== "UpdatedSmoke") {
        throw new Error(`Expected gza.passenger.v1 firstName to be 'UpdatedSmoke', got '${updatedPassenger.account?.firstName}'`);
      }

      // Invariant: gza.store.v1 must NOT be updated with new canonical passenger changes (no dual writing)
      const legacyStore = await page.evaluate(() => JSON.parse(localStorage.getItem("gza.store.v1") || "{}"));
      if (legacyStore.account?.firstName !== "LegacySmoke") {
        throw new Error(`gza.store.v1 was dual-written! Expected 'LegacySmoke', got '${legacyStore.account?.firstName}'`);
      }

      // 4. Forced Storage.prototype.setItem failure ONLY for gza.passenger.v1
      // Test A: Profile save failure under blocked storage
      await page.evaluate(() => {
        window.__origSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, val) {
          if (key === "gza.passenger.v1") {
            throw new DOMException("Simulated quota exceeded", "QuotaExceededError");
          }
          return window.__origSetItem.apply(this, arguments);
        };
      });

      await page.fill("#p-first", "BlockedSmokeName");
      await page.click('button[type="submit"]');
      await page.waitForSelector('p[role="alert"]', { timeout: 5000 });
      const profileAlertText = await page.locator('p[role="alert"]').innerText();
      if (!profileAlertText.includes("could not be saved") && !profileAlertText.includes("تعذّر حفظ التغييرات")) {
        throw new Error(`Expected accessible save failure alert, got '${profileAlertText}'`);
      }
      const hasFalseStatus = await page.locator('p[role="status"]').count();
      if (hasFalseStatus > 0) {
        throw new Error("False positive role='status' displayed on profile storage failure");
      }
      // Assert persisted state in gza.passenger.v1 is unchanged
      const blockedProfileState = await page.evaluate(() => JSON.parse(localStorage.getItem("gza.passenger.v1") || "{}"));
      if (blockedProfileState.account?.firstName !== "UpdatedSmoke") {
        throw new Error(`Persisted state mutated despite storage failure! Got '${blockedProfileState.account?.firstName}'`);
      }

      // Restore clean context from profile test
      await page.evaluate(() => {
        if (window.__origSetItem) {
          Storage.prototype.setItem = window.__origSetItem;
          delete window.__origSetItem;
        }
      });

      // Test B: Traveler mutation failure under blocked storage
      await page.goto(baseUrl + "/account/travelers", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#tv-first", { timeout: 8000 });

      // Block storage for gza.passenger.v1 in the travelers page context
      await page.evaluate(() => {
        window.__origSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, val) {
          if (key === "gza.passenger.v1") {
            throw new DOMException("Simulated quota exceeded", "QuotaExceededError");
          }
          return window.__origSetItem.apply(this, arguments);
        };
      });

      await page.fill("#tv-first", "BlockedTraveler");
      await page.fill("#tv-last", "Smoke");
      await page.fill("#tv-nat", "Palestinian");
      await page.fill("#tv-doc", "FAIL-DOC");
      await page.click('button[type="submit"]');
      await page.waitForSelector('p[role="alert"]', { timeout: 5000 });
      const travelerAlertText = await page.locator('p[role="alert"]').innerText();
      if (!travelerAlertText.includes("could not be saved") && !travelerAlertText.includes("تعذّر حفظ التغييرات")) {
        throw new Error(`Expected accessible traveler save failure alert, got '${travelerAlertText}'`);
      }
      const hasBlockedTravelerInList = await page.locator("text=BlockedTraveler Smoke").count();
      if (hasBlockedTravelerInList > 0) {
        throw new Error("False visual success: BlockedTraveler Smoke appeared in UI despite storage failure");
      }
      const blockedTravelerState = await page.evaluate(() => JSON.parse(localStorage.getItem("gza.passenger.v1") || "{}"));
      if (blockedTravelerState.travelers?.length !== 1) {
        throw new Error(`Persisted travelers count mutated despite storage failure! Length: ${blockedTravelerState.travelers?.length}`);
      }

      // Restore clean context
      await page.evaluate(() => {
        if (window.__origSetItem) {
          Storage.prototype.setItem = window.__origSetItem;
          delete window.__origSetItem;
        }
      });

      // 5. Test traveler CRUD & reload persistence with clean context
      await page.fill("#tv-first", "Salma");
      await page.fill("#tv-last", "Smoke");
      await page.fill("#tv-nat", "Palestinian");
      await page.fill("#tv-doc", "PS-998877");
      await page.click('button[type="submit"]');
      await page.waitForSelector("text=Salma Smoke", { timeout: 5000 });

      // Reload and assert persistence
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("text=Salma Smoke", { timeout: 5000 });

      // 6. Booking Claim Status Invariants & Trip Access Control
      // Seed repo with eligible, contact-mismatch, and owned-by-another bookings
      await page.evaluate(() => {
        const repo = JSON.parse(localStorage.getItem("gza.repo.v1") || '{"schemaVersion":1,"bookings":[],"flights":{}}');
        const makeBooking = (ref, ownerEmail, contactEmail) => ({
          ref,
          status: "confirmed",
          ownerEmail,
          criteria: { tripType: "one-way", originCode: "GZA", destinationCode: "AMM", departDate: "2026-10-10", adults: 1, children: 0, infants: 0, cabin: "economy" },
          outbound: { id: `PS-${ref}`, number: `PS ${ref}`, originCode: "GZA", destinationCode: "AMM", date: "2026-10-10", departTime: "08:00", arriveTime: "09:00", aircraft: "B737", terminal: "1", basePrice: 100, status: "scheduled" },
          inbound: null,
          fareId: "classic",
          passengers: [{ id: `p-${ref}`, firstName: "Passenger", lastName: "Smoke", type: "adult" }],
          seats: {},
          extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
          contact: { email: contactEmail, phone: "+970 8 000 0000" },
          total: 114,
          createdAt: new Date().toISOString(),
          checkedIn: { out: [], in: [] },
        });

        repo.bookings = [
          makeBooking("CLAIM-ELIGIBLE-1", null, "smoke@gza.ps"),
          makeBooking("CLAIM-MISMATCH-1", null, "otherpax@gza.ps"),
          makeBooking("CLAIM-OTHER-1", "stranger@gza.ps", "smoke@gza.ps"),
          makeBooking("OTHER99", "otherperson@gza.ps", "otherperson@gza.ps"),
          makeBooking("UNOWNED88", null, "guest@gza.ps"),
        ];
        localStorage.setItem("gza.repo.v1", JSON.stringify(repo));
      });

      // 6a. Booking confirmation: Eligible claim succeeds, unlocks account trip, preserves contact email
      await page.goto(baseUrl + "/booking-confirmation/CLAIM-ELIGIBLE-1", { waitUntil: "domcontentloaded" });
      const linkAccountBtn = page.locator('button:has-text("Save this booking"), button:has-text("حفظ هذا الحجز"), button:has-text("Link"), button:has-text("ربط")').first();
      await linkAccountBtn.waitFor({ state: "visible", timeout: 5000 });
      await linkAccountBtn.click();
      await page.waitForSelector('p[role="status"]', { timeout: 5000 });
      const claimSuccessText = await page.locator('p[role="status"]').innerText();
      if (!claimSuccessText.includes("CLAIM-ELIGIBLE-1")) {
        throw new Error(`Expected claim success status for CLAIM-ELIGIBLE-1, got '${claimSuccessText}'`);
      }
      // Assert account trips link is visible
      const tripsLink = page.locator('a:has-text("Trips"), a:has-text("الرحلات")');
      if ((await tripsLink.count()) === 0) {
        throw new Error("Expected Trips link to be displayed after successful claim");
      }
      // Assert storage state: ownerEmail set, contact email preserved
      const repoAfterEligible = await page.evaluate(() => JSON.parse(localStorage.getItem("gza.repo.v1") || "{}"));
      const claimedBkg = repoAfterEligible.bookings?.find((b) => b.ref === "CLAIM-ELIGIBLE-1");
      if (claimedBkg?.ownerEmail !== "smoke@gza.ps" || claimedBkg?.contact?.email !== "smoke@gza.ps") {
        throw new Error(`Claimed booking storage invariant violated! owner: '${claimedBkg?.ownerEmail}', contact: '${claimedBkg?.contact?.email}'`);
      }
      // Account trip is now unlocked!
      await page.goto(baseUrl + "/account/trips/CLAIM-ELIGIBLE-1", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("text=CLAIM-ELIGIBLE-1", { timeout: 5000 });

      // 6b. Booking confirmation: Mismatched contact shows distinct error, preserves ownerEmail null, never offers account trip
      await page.goto(baseUrl + "/booking-confirmation/CLAIM-MISMATCH-1", { waitUntil: "domcontentloaded" });
      const linkMismatchBtn = page.locator('button:has-text("Save this booking"), button:has-text("حفظ هذا الحجز"), button:has-text("Link"), button:has-text("ربط")').first();
      await linkMismatchBtn.waitFor({ state: "visible", timeout: 5000 });
      await linkMismatchBtn.click();
      await page.waitForSelector('p[role="alert"]', { timeout: 5000 });
      const mismatchAlertText = await page.locator('p[role="alert"]').innerText();
      if (!mismatchAlertText.includes("does not match this account") && !mismatchAlertText.includes("لا يتطابق")) {
        throw new Error(`Expected contact mismatch error, got '${mismatchAlertText}'`);
      }
      // Assert ownerEmail remains null in storage
      const repoAfterMismatch = await page.evaluate(() => JSON.parse(localStorage.getItem("gza.repo.v1") || "{}"));
      const mismatchBkg = repoAfterMismatch.bookings?.find((b) => b.ref === "CLAIM-MISMATCH-1");
      if (mismatchBkg?.ownerEmail !== null) {
        throw new Error(`Expected ownerEmail null for mismatched booking, got '${mismatchBkg?.ownerEmail}'`);
      }
      // Assert no account trips CTA offered
      const accountTripCtaAfterMismatch = await page.locator('a[href*="/account/trips"]').count();
      if (accountTripCtaAfterMismatch > 0) {
        throw new Error("Offered account trips CTA after mismatched claim!");
      }
      // Guest manage link is still available
      const guestManageLink = page.locator('a[href*="/manage/CLAIM-MISMATCH-1"]');
      if ((await guestManageLink.count()) === 0) {
        throw new Error("Guest manage booking link missing on mismatched claim");
      }

      // 6c. Booking confirmation: Owned by another shows distinct error, preserves owner state, never offers account trip
      await page.goto(baseUrl + "/booking-confirmation/CLAIM-OTHER-1", { waitUntil: "domcontentloaded" });
      const linkOtherBtn = page.locator('button:has-text("Save this booking"), button:has-text("حفظ هذا الحجز"), button:has-text("Link"), button:has-text("ربط")').first();
      await linkOtherBtn.waitFor({ state: "visible", timeout: 5000 });
      await linkOtherBtn.click();
      await page.waitForSelector('p[role="alert"]', { timeout: 5000 });
      const otherAlertText = await page.locator('p[role="alert"]').innerText();
      if (!otherAlertText.includes("already linked to another") && !otherAlertText.includes("مرتبط بحساب مسافر آخر")) {
        throw new Error(`Expected owned-by-another error, got '${otherAlertText}'`);
      }
      const repoAfterOther = await page.evaluate(() => JSON.parse(localStorage.getItem("gza.repo.v1") || "{}"));
      const otherBkg = repoAfterOther.bookings?.find((b) => b.ref === "CLAIM-OTHER-1");
      if (otherBkg?.ownerEmail !== "stranger@gza.ps") {
        throw new Error(`Expected ownerEmail stranger@gza.ps preserved, got '${otherBkg?.ownerEmail}'`);
      }
      const accountTripCtaAfterOther = await page.locator('a[href*="/account/trips"]').count();
      if (accountTripCtaAfterOther > 0) {
        throw new Error("Offered account trips CTA after owned-by-another claim!");
      }

      // 6d. Verify-email route: Truthful setup-required state when unauthenticated
      await page.evaluate(() => {
        localStorage.setItem("gza.passenger.v1", JSON.stringify({ schemaVersion: 1, account: null, travelers: [] }));
        localStorage.removeItem("gza.store.v1");
      });
      await page.goto(baseUrl + "/verify-email?ref=CLAIM-ELIGIBLE-1", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("h1", { timeout: 5000 });
      const setupRequiredTitle = await page.locator("h1").innerText();
      if (!setupRequiredTitle.includes("Account setup required") && !setupRequiredTitle.includes("إعداد الحساب مطلوب")) {
        throw new Error(`Expected truthful setup-required title, got '${setupRequiredTitle}'`);
      }
      // Assert links to register and signin are offered
      const regLink = page.locator('a[href*="/register"]');
      const signinLink = page.locator('a[href*="/signin"]');
      if ((await regLink.count()) === 0 || (await signinLink.count()) === 0) {
        throw new Error("Missing register or signin link on unauthenticated /verify-email");
      }
      // Assert no "setup complete" badge
      const setupCompleteBadge = await page.locator("text=Setup complete, text=اكتمل الإعداد").count();
      if (setupCompleteBadge > 0) {
        throw new Error("False positive 'Setup complete' badge on unauthenticated /verify-email");
      }

      // 6e. Verify-email route: Authenticated claim interactions
      // Sign in again as smoke@gza.ps
      await page.evaluate(() => {
        localStorage.setItem("gza.passenger.v1", JSON.stringify({
          schemaVersion: 1,
          account: {
            email: "smoke@gza.ps",
            firstName: "UpdatedSmoke",
            lastName: "Pilot",
            phone: "+970 8 000 0000",
            seatPreference: "window",
            mealPreference: "halal",
            newsletter: true,
          },
          travelers: [
            { id: "trv-smoke-1", firstName: "ChildSmoke", lastName: "Pilot", dob: "2018-03-03", nationality: "Palestinian", document: "P12345" },
            { id: "trv-smoke-2", firstName: "Salma", lastName: "Smoke", dob: "", nationality: "Palestinian", document: "PS-998877" }
          ]
        }));
      });

      // Mismatch claim on /verify-email shows retry and no account-trip CTA
      await page.goto(baseUrl + "/verify-email?ref=CLAIM-MISMATCH-1", { waitUntil: "domcontentloaded" });
      const verifyClaimBtn = page.locator('button:has-text("Link"), button:has-text("ربط")').first();
      await verifyClaimBtn.waitFor({ state: "visible", timeout: 5000 });
      await verifyClaimBtn.click();
      await page.waitForSelector('p[role="alert"]', { timeout: 5000 });
      const verifyRetryBtn = page.locator('button:has-text("Try linking again"), button:has-text("Retry"), button:has-text("إعادة محاولة"), button:has-text("إعادة")');
      if ((await verifyRetryBtn.count()) === 0) {
        throw new Error("Expected Retry button on failed claim in /verify-email");
      }
      const verifyAccountTripCta = await page.locator('a[href*="/account/trips/CLAIM-MISMATCH-1"]').count();
      if (verifyAccountTripCta > 0) {
        throw new Error("Offered account trip CTA on mismatched /verify-email");
      }

      // Already owned booking on /verify-email offers /account/trips/$ref CTA via derived canonical query
      await page.goto(baseUrl + "/verify-email?ref=CLAIM-ELIGIBLE-1", { waitUntil: "domcontentloaded" });
      await page.waitForSelector('p[role="status"]', { timeout: 8000 });
      const alreadyOwnedText = await page.locator('p[role="status"]').innerText();
      if (!alreadyOwnedText.includes("already linked") && !alreadyOwnedText.includes("مرتبط بالفعل")) {
        throw new Error(`Expected already linked status on /verify-email, got '${alreadyOwnedText}'`);
      }
      const viewTripInAccountCta = page.locator('a[href*="/account/trips/CLAIM-ELIGIBLE-1"]');
      if ((await viewTripInAccountCta.count()) === 0) {
        throw new Error("Missing /account/trips/$ref CTA on already claimed /verify-email");
      }

      // 6f. Correction 0.2 Finding 2 Proof: In-app SPA transitions across booking references clear claim state without reload
      // (1) /verify-email: SPA navigate from claimed CLAIM-ELIGIBLE-1 to unowned CLAIM-MISMATCH-1
      await page.evaluate(() => {
        window.__noReloadSentinel = "alive";
      });
      await page.evaluate(() => {
        window.history.pushState({}, "", "/verify-email?ref=CLAIM-MISMATCH-1");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      const sentinelVal = await page.evaluate(() => window.__noReloadSentinel);
      if (sentinelVal !== "alive") {
        throw new Error("Full page reload occurred during SPA transition on /verify-email!");
      }
      await page.waitForFunction(
        () => document.querySelector(".code-id")?.textContent?.includes("CLAIM-MISMATCH-1"),
        null,
        { timeout: 8000 }
      );
      // Assert CLAIM-MISMATCH-1 does not leak CLAIM-ELIGIBLE-1's claim success or account-trip CTA
      const leakedTripCta = await page.locator('a[href*="/account/trips"]').count();
      if (leakedTripCta > 0) {
        throw new Error("Account trip CTA leaked to CLAIM-MISMATCH-1 on /verify-email during SPA transition!");
      }
      const leakedSuccessStatus = await page.locator('p[role="status"]').count();
      if (leakedSuccessStatus > 0) {
        throw new Error("Claim success status leaked to CLAIM-MISMATCH-1 on /verify-email during SPA transition!");
      }
      // Assert guest manage action is available
      const guestManageOnB = page.locator('a[href*="/manage/CLAIM-MISMATCH-1"]');
      if ((await guestManageOnB.count()) === 0) {
        throw new Error("Missing guest manage booking link on CLAIM-MISMATCH-1 after SPA transition");
      }
      // Click claim on B and verify independent status-specific contact mismatch rejection
      const claimBtnB = page.locator('button:has-text("Link"), button:has-text("ربط")').first();
      await claimBtnB.waitFor({ state: "visible", timeout: 5000 });
      await claimBtnB.click();
      await page.waitForSelector('p[role="alert"]', { timeout: 5000 });
      const alertOnB = await page.locator('p[role="alert"]').innerText();
      if (!alertOnB.includes("does not match") && !alertOnB.includes("لا يتطابق")) {
        throw new Error(`Expected contact mismatch error on B, got '${alertOnB}'`);
      }
      const tripCtaAfterRejection = await page.locator('a[href*="/account/trips"]').count();
      if (tripCtaAfterRejection > 0) {
        throw new Error("Account trip CTA appeared after contact-mismatch rejection on /verify-email!");
      }

      // (2) /booking-confirmation: SPA navigate from claimed CLAIM-ELIGIBLE-1 to unowned CLAIM-MISMATCH-1
      await page.goto(baseUrl + "/booking-confirmation/CLAIM-ELIGIBLE-1", { waitUntil: "domcontentloaded" });
      const eligibleTripCta = page.locator('a[href*="/account/trips"]');
      await eligibleTripCta.waitFor({ state: "visible", timeout: 8000 });
      await page.evaluate(() => {
        window.__noReloadSentinelConf = "alive";
      });
      await page.evaluate(() => {
        window.history.pushState({}, "", "/booking-confirmation/CLAIM-MISMATCH-1");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      const sentinelValConf = await page.evaluate(() => window.__noReloadSentinelConf);
      if (sentinelValConf !== "alive") {
        throw new Error("Full page reload occurred during SPA transition on /booking-confirmation!");
      }
      await page.waitForFunction(
        () => document.querySelector(".code-id")?.textContent?.includes("CLAIM-MISMATCH-1"),
        null,
        { timeout: 8000 }
      );
      // Assert CLAIM-MISMATCH-1 does not leak CLAIM-ELIGIBLE-1's account trips CTA
      const leakedConfTripCta = await page.locator('a[href*="/account/trips"]').count();
      if (leakedConfTripCta > 0) {
        throw new Error("Account trips CTA leaked to CLAIM-MISMATCH-1 on /booking-confirmation during SPA transition!");
      }
      // Assert guest manage action is available
      const guestManageConfB = page.locator('a[href*="/manage/CLAIM-MISMATCH-1"]');
      if ((await guestManageConfB.count()) === 0) {
        throw new Error("Missing guest manage booking link on /booking-confirmation/CLAIM-MISMATCH-1");
      }
      // Click link account button on B and verify contact mismatch rejection
      const linkAccountBtnB = page.locator('button:has-text("Save this booking"), button:has-text("احفظ هذا الحجز"), button:has-text("Link"), button:has-text("ربط")').first();
      await linkAccountBtnB.waitFor({ state: "visible", timeout: 5000 });
      await linkAccountBtnB.click();
      await page.waitForSelector('p[role="alert"]', { timeout: 5000 });
      const confAlertOnB = await page.locator('p[role="alert"]').innerText();
      if (!confAlertOnB.includes("does not match") && !confAlertOnB.includes("لا يتطابق")) {
        throw new Error(`Expected contact mismatch error on confirmation B, got '${confAlertOnB}'`);
      }
      const confTripCtaAfterRejection = await page.locator('a[href*="/account/trips"]').count();
      if (confTripCtaAfterRejection > 0) {
        throw new Error("Account trips CTA appeared after contact-mismatch rejection on /booking-confirmation!");
      }

      // 7. Password Sentinel Absence Across All LocalStorage Keys and Values
      // Test registration with sentinel password
      await page.goto(baseUrl + "/register", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#r-first", { timeout: 8000 });
      await waitForInteractiveInput(page, "#r-first");
      const regSecret = "SentinelRegisterSecret999!#";
      await page.fill("#r-first", "SentinelFirst");
      await page.fill("#r-last", "SentinelLast");
      await page.fill("#r-email", "sentinel@gza.ps");
      await page.fill("#r-password", regSecret);
      await page.click('button[type="submit"]');
      await waitForJourneyURL(page, /\/verify-email/, { waitUntil: "domcontentloaded", timeout: 8000 });

      // Assert regSecret is absent from ALL localStorage keys and values
      let allStorage = await page.evaluate(() => {
        const out = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          out[k] = localStorage.getItem(k);
        }
        return out;
      });
      for (const [key, val] of Object.entries(allStorage)) {
        if (typeof val === "string" && val.includes(regSecret)) {
          throw new Error(`CRITICAL AUTH DEFECT: Registration password leaked into localStorage key '${key}'!`);
        }
      }

      // Test forgot-password guidance route creates NO secrets
      await page.goto(baseUrl + "/forgot-password", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("h1", { timeout: 8000 });
      // Test reset-password guidance route creates NO secrets
      await page.goto(baseUrl + "/reset-password", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("h1", { timeout: 8000 });
      // Test account security route creates NO secrets
      await page.goto(baseUrl + "/account/security", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("h1, h2", { timeout: 8000 });

      // Verify no password or secret leaks in localStorage
      allStorage = await page.evaluate(() => {
        const out = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          out[k] = localStorage.getItem(k);
        }
        return out;
      });
      for (const [key, val] of Object.entries(allStorage)) {
        if (typeof val === "string" && (val.includes(regSecret) || val.includes("passwordHash"))) {
          throw new Error(`Unexpected secret detected in localStorage key '${key}'`);
        }
      }
      const passengerState = await page.evaluate(() => JSON.parse(localStorage.getItem("gza.passenger.v1") || "{}"));
      if (passengerState.account && ("password" in passengerState.account || "passwordHash" in passengerState.account)) {
        throw new Error("Password field detected in canonical passenger account!");
      }

      // Sign in test secret verification (preserved proof)
      await page.goto(baseUrl + "/signin", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#email", { timeout: 8000 });
      await waitForInteractiveInput(page, "#email");
      const signinSecret = "SuperSecretPassword123!@#";
      await page.fill("#email", "pilot.truth@gza.ps");
      await page.fill("#password", signinSecret);
      await page.click('button[type="submit"]');
      await waitForJourneyURL(page, /\/account/, { waitUntil: "domcontentloaded", timeout: 5000 });

      allStorage = await page.evaluate(() => {
        const out = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          out[k] = localStorage.getItem(k);
        }
        return out;
      });
      for (const [key, val] of Object.entries(allStorage)) {
        if (typeof val === "string" && val.includes(signinSecret)) {
          throw new Error(`CRITICAL AUTH DEFECT: Sign-in password leaked into localStorage key '${key}'!`);
        }
      }

      // 8. Multi-Tab Real-Time Reactive Synchronization (Two Pages, One Context)
      // Seed account using existing active page
      await page.evaluate(() => {
        localStorage.setItem("gza.passenger.v1", JSON.stringify({
          schemaVersion: 1,
          account: {
            email: "tabs@gza.ps",
            firstName: "TabAlpha",
            lastName: "Pilot",
            phone: "+970 8 000 0000",
            seatPreference: "none",
            mealPreference: "standard",
            newsletter: false,
          },
          travelers: []
        }));
      });

      const tabA = await context.newPage();
      const tabB = await context.newPage();

      // Tab A opens Profile, Tab B opens Account Overview
      await tabA.goto(baseUrl + "/account/profile", { waitUntil: "domcontentloaded" });
      await tabB.goto(baseUrl + "/account", { waitUntil: "domcontentloaded" });
      await tabA.waitForSelector("#p-first", { timeout: 8000 });
      await tabB.waitForSelector("h1", { timeout: 8000 });

      // Tab A updates name to TabBeta
      await tabA.fill("#p-first", "TabBeta");
      await tabA.click('button[type="submit"]');
      await tabA.waitForSelector('p[role="status"]', { timeout: 5000 });

      // Tab B updates WITHOUT page reload via storage event and query invalidation!
      await tabB.waitForSelector("text=TabBeta", { timeout: 8000 });

      // Tab A adds traveler, Tab B observes without reload
      await tabA.goto(baseUrl + "/account/travelers", { waitUntil: "domcontentloaded" });
      await tabB.goto(baseUrl + "/account/travelers", { waitUntil: "domcontentloaded" });
      await tabA.waitForSelector("#tv-first", { timeout: 8000 });
      await tabB.waitForSelector("h1, h2", { timeout: 8000 });

      await tabA.fill("#tv-first", "Farah");
      await tabA.fill("#tv-last", "SyncTab");
      await tabA.fill("#tv-nat", "Palestinian");
      await tabA.fill("#tv-doc", "DOC-SYNC-88");
      await tabA.click('button[type="submit"]');
      await tabA.waitForSelector("text=Farah SyncTab", { timeout: 5000 });

      // Tab B updates without reload!
      await tabB.waitForSelector("text=Farah SyncTab", { timeout: 8000 });

      // Tab A signs out, Tab B transitions to sign-in required without reload
      await tabA.goto(baseUrl + "/account/security", { waitUntil: "domcontentloaded" });
      const tabASignout = tabA.locator('button:has-text("Sign out"), button:has-text("خروج")').first();
      await tabASignout.waitFor({ state: "visible", timeout: 8000 });
      await tabASignout.click();

      // Tab B receives storage event and transitions to sign-in required empty state
      await tabB.locator(':has-text("Sign-in required"), :has-text("تسجيل الدخول مطلوب"), a:has-text("Sign in")').first().waitFor({ state: "visible", timeout: 8000 });

      await tabA.close();
      await tabB.close();

      // 9. Sign-Out Storage Error Resilience (Retain Account, Show Role="Alert", No False Navigation)
      await page.evaluate(() => {
        localStorage.setItem("gza.passenger.v1", JSON.stringify({
          schemaVersion: 1,
          account: {
            email: "errorout@gza.ps",
            firstName: "ErrorOutPilot",
            lastName: "Tester",
            phone: "+970 8 000 0000",
            seatPreference: "none",
            mealPreference: "standard",
            newsletter: false,
          },
          travelers: []
        }));
      });

      await page.goto(baseUrl + "/account", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("h1", { timeout: 8000 });
      const beforeErrTitle = await page.locator("h1").innerText();
      if (!beforeErrTitle.includes("ErrorOutPilot")) {
        throw new Error(`Expected ErrorOutPilot account header, got '${beforeErrTitle}'`);
      }

      // Inject storage failure on gza.passenger.v1
      await page.evaluate(() => {
        window.__origSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, val) {
          if (key === "gza.passenger.v1") {
            throw new DOMException("Simulated quota exceeded", "QuotaExceededError");
          }
          return window.__origSetItem.apply(this, arguments);
        };
      });

      // Click sign out
      const signoutWithErrBtn = page.locator('button:has-text("Sign out"), button:has-text("خروج")').first();
      await signoutWithErrBtn.click();
      await page.waitForSelector('p[role="alert"]', { timeout: 5000 });
      const signoutAlertText = await page.locator('p[role="alert"]').innerText();
      if (!signoutAlertText.includes("could not be saved") && !signoutAlertText.includes("تعذّر حفظ التغييرات")) {
        throw new Error(`Expected sign-out error alert, got '${signoutAlertText}'`);
      }

      // Assert account is retained and welcome header remains
      const afterErrTitle = await page.locator("h1").innerText();
      if (!afterErrTitle.includes("ErrorOutPilot")) {
        throw new Error("Account was cleared despite sign-out storage error!");
      }

      // Assert user was NOT navigated to sign in
      if (page.url().includes("/signin")) {
        throw new Error("Navigated to /signin despite sign-out storage failure!");
      }

      // Restore clean context
      await page.evaluate(() => {
        if (window.__origSetItem) {
          Storage.prototype.setItem = window.__origSetItem;
          delete window.__origSetItem;
        }
      });

      // 10. Navigating to /account/trips/OTHER99 as errorout@gza.ps must reject
      await page.goto(baseUrl + "/account/trips/OTHER99", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("text=find that booking", { timeout: 5000 });

      // Navigating to /account/trips/UNOWNED88 must also reject (unowned guest booking)
      await page.goto(baseUrl + "/account/trips/UNOWNED88", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("text=find that booking", { timeout: 5000 });

      // 11. Responsive, RTL, and LTR Technical Formatting at 1440px, 390px, and 320px
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 750 });
        for (const path of [
          "/verify-email?ref=CLAIM-ELIGIBLE-1",
          "/ar/verify-email?ref=CLAIM-ELIGIBLE-1",
          "/signin",
          "/ar/signin",
          "/account/security",
          "/ar/account/security",
        ]) {
          await page.goto(baseUrl + path, { waitUntil: "domcontentloaded" });
          const overflow = await page.evaluate(() => document.body.scrollWidth > document.body.clientWidth);
          if (overflow) {
            throw new Error(`Horizontal overflow on ${path} at ${width}px`);
          }
        }
      }

      // Verify technical identifiers remain LTR in Arabic verify-email
      await page.goto(baseUrl + "/ar/verify-email?ref=CLAIM-ELIGIBLE-1", { waitUntil: "domcontentloaded" });
      const isRefLtr = await page.evaluate(() => {
        const el = document.querySelector(".code-id");
        if (!el) return false;
        return el.getAttribute("dir") === "ltr" || window.getComputedStyle(el).direction === "ltr";
      });
      if (!isRefLtr) {
        throw new Error("Booking reference technical identifier was not rendered LTR in Arabic /ar/verify-email");
      }

      // Reset viewport and cleanup
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate(() => {
        localStorage.clear();
      });
    });

    await checkStep("Check 36: HC-0 / HC-1 Present Documentary Dossier, Hero & Nine Designer Artwork Skins Smoke", async () => {
      for (const locale of ["", "/ar"]) {
        const isAr = locale === "/ar";
        const routePath = `${locale}/airport/present`;

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(baseUrl + routePath, { waitUntil: "domcontentloaded" });

        // 1. Hero verification
        const hero = page.locator('[data-public-hero="present"]');
        if ((await hero.count()) === 0) {
          throw new Error(`Missing [data-public-hero="present"] on ${routePath}`);
        }

        const heroImg = hero.locator("img").first();
        const heroLoaded = await heroImg.evaluate((img) => img.complete && img.naturalWidth > 0);
        if (!heroLoaded) {
          throw new Error(`Hero image failed to load on ${routePath}`);
        }

        const heroSrc = await heroImg.getAttribute("src");
        if (!heroSrc || !heroSrc.includes("airport-present-ruins-2008") || !heroSrc.includes(".webp")) {
          throw new Error(`Hero image src does not use airport-present-ruins-2008 WebP on ${routePath}: ${heroSrc}`);
        }

        // Hero strictly never mirrored
        const heroMirrored = await heroImg.evaluate((img) => {
          const style = window.getComputedStyle(img);
          return style.transform.includes("matrix(-1") || img.classList.contains("scale-x-[-1]");
        });
        if (heroMirrored) {
          throw new Error(`Hero image was mirrored on ${routePath}`);
        }

        // Hero archive context eyebrow
        const eyebrow = hero.locator("[data-archive-context]");
        if ((await eyebrow.count()) === 0) {
          throw new Error(`Missing [data-archive-context] eyebrow on ${routePath}`);
        }
        const eyebrowText = await eyebrow.innerText();
        if (isAr) {
          if (!eyebrowText.includes("2008") || !eyebrowText.includes("يونيو/حزيران")) {
            throw new Error(`Arabic eyebrow expected 'موقع المطار · موثق في يونيو/حزيران 2008', got '${eyebrowText}'`);
          }
        } else {
          const lower = eyebrowText.toLowerCase();
          if (!lower.includes("june 2008") || !lower.includes("airport site")) {
            throw new Error(`English eyebrow expected 'Airport site · documented June 2008', got '${eyebrowText}'`);
          }
        }

        // No "today" label in hero or title claiming photo depicts current condition
        if (!isAr && eyebrowText.toLowerCase().includes("today")) {
          throw new Error(`Hero eyebrow must not claim 2008 photo is today`);
        }

        // 2. Comprehensive Full-Card Background Artwork Verification for All Nine Cards
        const allNinePresentCards = [
          { sel: '[data-fact-card="fact-location"]', key: "fact-location", name: "Fact Location" },
          { sel: '[data-fact-card="fact-aero-codes"]', key: "fact-aero-codes", name: "Fact Aero Codes" },
          { sel: '[data-fact-card="fact-operating-period"]', key: "fact-operating-period", name: "Fact Operating Period" },
          { sel: '[data-fact-card="fact-facility-status"]', key: "fact-facility-status", name: "Fact Facility Status" },
          { sel: '[data-dossier-panel="dossier-boundaries"]', key: "dossier-boundaries", name: "Dossier Boundaries" },
          { sel: '[data-dossier-panel="dossier-runway"]', key: "dossier-runway", name: "Dossier Runway" },
          { sel: '[data-dossier-panel="dossier-verification"]', key: "dossier-verification", name: "Dossier Verification" },
          { sel: '[data-spatial-aside]', key: "spatial-geometry", name: "Spatial Aside" },
          { sel: '[data-transition-panel]', key: "global-network", name: "Global Horizons Transition Panel" },
        ];

        for (const c of allNinePresentCards) {
          const cardEl = page.locator(c.sel);
          if ((await cardEl.count()) === 0) {
            throw new Error(`Missing ${c.name} (${c.sel}) on ${routePath}`);
          }
          await cardEl.scrollIntoViewIfNeeded();

          // Contract 1: expected artwork mapped to correct card, loaded external WebP, decorative alt/ARIA
          const bgImg = cardEl.locator('[data-present-art-background]').first();
          if ((await bgImg.count()) === 0) {
            throw new Error(`Missing [data-present-art-background] in ${c.name} on ${routePath}`);
          }
          const bgSrc = await bgImg.getAttribute("src");
          if (!bgSrc || !bgSrc.includes(c.key) || !bgSrc.includes(".webp")) {
            throw new Error(`${c.name} did not load expected WebP containing '${c.key}': ${bgSrc}`);
          }
          const altAttr = await bgImg.getAttribute("alt");
          const ariaHidden = await bgImg.getAttribute("aria-hidden");
          if (altAttr !== "" || ariaHidden !== "true") {
            throw new Error(`${c.name} background image must have alt="" and aria-hidden="true"`);
          }
          const isLoaded = await bgImg.evaluate((img) => img.complete && img.naturalWidth > 0);
          if (!isLoaded) {
            throw new Error(`${c.name} background image failed to load on ${routePath}`);
          }

          // Contracts 2, 3, 4, 5, 6: Geometry, layer ordering, text bounds, no residual banner, no mirroring
          const geom = await cardEl.evaluate((card) => {
            const cardR = card.getBoundingClientRect();
            const img = card.querySelector('[data-present-art-background]');
            const layer = card.querySelector('[data-present-legibility-layer]');
            const content = card.querySelector('[data-present-card-content]');

            if (!img || !layer || !content) {
              return { error: "Missing required card DOM layers (background, legibility-layer, or content)" };
            }

            const imgR = img.getBoundingClientRect();
            const imgStyle = window.getComputedStyle(img);
            const layerStyle = window.getComputedStyle(layer);

            // Bounding span checks (within 4px subpixel/border tolerance)
            const widthDiff = Math.abs(imgR.width - cardR.width);
            const heightDiff = Math.abs(imgR.height - cardR.height);
            const isSpanning = widthDiff <= 4 && heightDiff <= 4;

            // Positioning checks
            const isAbsolute = imgStyle.position === "absolute" && layerStyle.position === "absolute";

            // Layer ordering: img precedes layer, layer precedes content
            const imgOrder = img.compareDocumentPosition(layer);
            const layerOrder = layer.compareDocumentPosition(content);
            const correctOrder = Boolean(
              (imgOrder & Node.DOCUMENT_POSITION_FOLLOWING) && (layerOrder & Node.DOCUMENT_POSITION_FOLLOWING)
            );

            // Content bounds inside card
            const contentR = content.getBoundingClientRect();
            const contentInside =
              contentR.top >= cardR.top - 3 &&
              contentR.bottom <= cardR.bottom + 3 &&
              contentR.left >= cardR.left - 3 &&
              contentR.right <= cardR.right + 3;

            // No residual separate banner / body container layout
            const hasResidualBanner =
              card.querySelector(
                '.aspect-799\\/253, .aspect-1890\\/276, .aspect-1350\\/440, .aspect-1678\\/913'
              ) !== null;

            // Mirroring check
            const isMirrored =
              imgStyle.transform.includes("matrix(-1") ||
              imgStyle.transform.includes("-1,") ||
              img.classList.contains("scale-x-[-1]");

            return {
              isSpanning,
              widthDiff,
              heightDiff,
              isAbsolute,
              correctOrder,
              contentInside,
              hasResidualBanner,
              isMirrored,
            };
          });

          if (geom.error) {
            throw new Error(`${c.name} on ${routePath}: ${geom.error}`);
          }
          if (!geom.isAbsolute) {
            throw new Error(`${c.name} background and legibility layer must have position: absolute`);
          }
          if (!geom.isSpanning) {
            throw new Error(
              `${c.name} background artwork does not span card bounds (widthDiff: ${geom.widthDiff}px, heightDiff: ${geom.heightDiff}px)`
            );
          }
          if (!geom.correctOrder) {
            throw new Error(`${c.name} layer ordering invalid: expected background -> legibility layer -> card content`);
          }
          if (!geom.contentInside) {
            throw new Error(`${c.name} foreground content bounds spill outside the card bounds`);
          }
          if (geom.hasResidualBanner) {
            throw new Error(`${c.name} contains residual separate image banner class`);
          }
          if (geom.isMirrored) {
            throw new Error(`${c.name} artwork image was mirrored in RTL`);
          }
        }

        // Ensure old seeded map is NOT present anywhere on the page
        const allImgs = await page.locator("img").evaluateAll((imgs) => imgs.map((i) => i.src));
        if (allImgs.some((src) => src.includes("map-outline-neutral"))) {
          throw new Error(`map-outline-neutral must be removed from ${routePath}`);
        }

        // 6. Check discoverable attribution links & localized credit
        const commonsLink = page.locator('a[href*="commons.wikimedia.org/wiki/File:Gaza_AirPort"]');
        if ((await commonsLink.count()) === 0) {
          throw new Error(`Missing Commons attribution link on ${routePath}`);
        }
        const licenseLink = page.locator('a[href*="creativecommons.org/licenses/by-sa/2.0"]');
        if ((await licenseLink.count()) === 0) {
          throw new Error(`Missing CC BY-SA 2.0 license link on ${routePath}`);
        }
        const attributionEl = page.locator("div.border-t p").first();
        const attributionText = await attributionEl.innerText();
        if (!attributionText.includes("Gisha Access")) {
          throw new Error(`Attribution text must credit 'Gisha Access' on ${routePath}`);
        }
        if (attributionText.includes("Mohammed Yousif Azaiza")) {
          throw new Error(`Attribution text must NOT invent photographer name on ${routePath}`);
        }

        // 7. Check localized fact card details and explicit LTR technical isolation
        const factDetails = await page.locator("[data-fact-card] div > p.text-xs").allInnerTexts();
        if (isAr) {
          if (!factDetails.some((d) => d.includes("المدرج") || d.includes("مصر") || d.includes("الرحلات"))) {
            throw new Error(`Arabic fact card details must be rendered in Arabic on ${routePath}`);
          }
        } else {
          if (!factDetails.some((d) => d.includes("Runway") || d.includes("Adjacent") || d.includes("Commercial"))) {
            throw new Error(`English fact card details must be rendered in English on ${routePath}`);
          }
        }

        // Verify explicit LTR isolation for codes and runway 01/19 in fact-aero-codes card
        const aeroCard = page.locator('[data-fact-card="fact-aero-codes"]');
        const aeroLtr = aeroCard.locator('[dir="ltr"]');
        if ((await aeroLtr.count()) < 2) {
          throw new Error(`fact-aero-codes card must have at least 2 LTR spans (codes and runway) on ${routePath}`);
        }
        const aeroTexts = (await aeroLtr.allInnerTexts()).map((t) => t.trim());
        if (!aeroTexts.some((t) => t.includes("IATA: GZA · ICAO: LVGZ"))) {
          throw new Error(`Missing LTR aero codes on ${routePath}`);
        }
        if (!aeroTexts.some((t) => t.includes("01/19"))) {
          throw new Error(`Missing LTR runway 01/19 on ${routePath}`);
        }

        // 8. Ensure NO raw intake Arabic PNG names leak into page image sources
        if (allImgs.some((src) => /[\u0600-\u06FF]/.test(src) || src.includes(".png") && src.includes("images_assets"))) {
          throw new Error(`Raw Arabic PNG or uncompressed intake image leaked into ${routePath}`);
        }

        // 9. Verify technical codes remain LTR
        const ltrCodes = await page.locator(".code-id").evaluateAll((els) =>
          els.map((el) => el.getAttribute("dir") === "ltr" || window.getComputedStyle(el).direction === "ltr")
        );
        if (ltrCodes.some((isLtr) => !isLtr)) {
          throw new Error(`Technical codes must be rendered LTR on ${routePath}`);
        }

        // 10. Responsive overflow checks & mobile fact card visibility
        for (const w of [1440, 1024, 768, 390, 320]) {
          await page.setViewportSize({ width: w, height: 800 });
          const overflow = await page.evaluate(() => document.body.scrollWidth > document.body.clientWidth);
          if (overflow) {
            throw new Error(`Horizontal scroll overflow on ${routePath} at ${w}px`);
          }

          if (w <= 390) {
            const runwayVisible = await aeroCard.locator('[dir="ltr"]').filter({ hasText: "01/19" }).first().isVisible();
            if (!runwayVisible) {
              throw new Error(`Runway 01/19 not visible on ${routePath} at ${w}px`);
            }
            const codesVisible = await aeroCard.locator('[dir="ltr"]').filter({ hasText: "IATA: GZA · ICAO: LVGZ" }).first().isVisible();
            if (!codesVisible) {
              throw new Error(`Aero codes not visible on ${routePath} at ${w}px`);
            }
          }
        }
      }

      await page.setViewportSize({ width: 1440, height: 900 });
    });

    await checkStep("Check 37: EN/AR Airport Overview, Past, and Future Live Localization & Raw Key Leak Regression", async () => {
      for (const locale of ["", "/ar"]) {
        const isAr = locale === "/ar";

        // 1. Airport Overview (/airport, /ar/airport)
        const overviewPath = `${locale}/airport`;
        await page.goto(baseUrl + overviewPath, { waitUntil: "domcontentloaded" });
        const overviewText = await page.locator("body").innerText();

        // Must not contain raw key identifiers
        if (overviewText.includes("airport.sourcesBody")) {
          throw new Error(`Raw key 'airport.sourcesBody' rendered on ${overviewPath}`);
        }
        if (overviewText.includes("airport.futureSummary")) {
          throw new Error(`Raw key 'airport.futureSummary' rendered on ${overviewPath}`);
        }
        const overviewLeaks = overviewText.match(/\bairport\.[a-zA-Z0-9_.-]+/g);
        if (overviewLeaks) {
          throw new Error(`Raw translation key(s) leaked on ${overviewPath}: ${overviewLeaks.join(", ")}`);
        }

        // Intended text must resolve
        if (isAr) {
          if (!overviewText.includes("ترتبط المحطات التاريخية بمصادرها")) {
            throw new Error(`Expected Arabic sourcesBody text missing on ${overviewPath}`);
          }
          if (!overviewText.includes("مقترحات معمارية، وفلسفة خدمة المسافرين")) {
            throw new Error(`Expected Arabic futureSummary text missing on ${overviewPath}`);
          }
        } else {
          if (!overviewText.includes("Historical milestones link to their sources")) {
            throw new Error(`Expected English sourcesBody text missing on ${overviewPath}`);
          }
          if (!overviewText.includes("Architectural proposals, passenger service philosophy")) {
            throw new Error(`Expected English futureSummary text missing on ${overviewPath}`);
          }
        }

        // 2. Airport Past (/airport/past, /ar/airport/past)
        const pastPath = `${locale}/airport/past`;
        await page.goto(baseUrl + pastPath, { waitUntil: "domcontentloaded" });
        const pastText = await page.locator("body").innerText();

        if (pastText.includes("airport.awaitingReferences")) {
          throw new Error(`Raw key 'airport.awaitingReferences' rendered on ${pastPath}`);
        }
        if (pastText.includes("airport.sourcesNoticeMixed")) {
          throw new Error(`Raw key 'airport.sourcesNoticeMixed' rendered on ${pastPath}`);
        }
        if (pastText.includes("airport.methodologyBody")) {
          throw new Error(`Raw key 'airport.methodologyBody' rendered on ${pastPath}`);
        }
        const pastLeaks = pastText.match(/\bairport\.[a-zA-Z0-9_.-]+/g);
        if (pastLeaks) {
          throw new Error(`Raw translation key(s) leaked on ${pastPath}: ${pastLeaks.join(", ")}`);
        }

        if (isAr) {
          if (
            !pastText.includes("بانتظار المراجع الأرشيفية الأولية والسجلات الموثقة") &&
            !pastText.includes("يرتبط التسلسل التاريخي المنشور بمصادره")
          ) {
            throw new Error(`Expected Arabic methodology notice text missing on ${pastPath}`);
          }
          if (!pastText.includes("ترتبط المحطات التاريخية بمصادرها، ويبيّن كل عنصر أرشيفي حالة أدلته وحقوقه")) {
            throw new Error(`Expected Arabic methodologyBody text missing on ${pastPath}`);
          }
        } else {
          if (
            !pastText.includes("Awaiting primary archival references and verified records") &&
            !pastText.includes("The published chronology links to its historical sources")
          ) {
            throw new Error(`Expected English methodology notice text missing on ${pastPath}`);
          }
          if (!pastText.includes("Historical milestones link to supporting sources; each archive item records its evidence and rights status")) {
            throw new Error(`Expected English methodologyBody text missing on ${pastPath}`);
          }
        }

        // 3. Airport Future (/airport/future, /ar/airport/future)
        const futurePath = `${locale}/airport/future`;
        await page.goto(baseUrl + futurePath, { waitUntil: "domcontentloaded" });
        const futureText = await page.locator("body").innerText();

        if (futureText.includes("airport.futureSubtitle")) {
          throw new Error(`Raw key 'airport.futureSubtitle' rendered on ${futurePath}`);
        }
        const futureLeaks = futureText.match(/\bairport\.[a-zA-Z0-9_.-]+/g);
        if (futureLeaks) {
          throw new Error(`Raw translation key(s) leaked on ${futurePath}: ${futureLeaks.join(", ")}`);
        }

        if (isAr) {
          if (!futureText.includes("مقترحات معمارية، ومبادئ المخطط العام، وتصميم تجربة المسافرين")) {
            throw new Error(`Expected Arabic futureSubtitle text missing on ${futurePath}`);
          }
        } else {
          if (!futureText.includes("Architectural proposals, masterplanning principles, and passenger experience design")) {
            throw new Error(`Expected English futureSubtitle text missing on ${futurePath}`);
          }
        }
      }

      await page.setViewportSize({ width: 1440, height: 900 });
    });

    await checkStep("Check 38: Phase 5B — Booking Draft Canonical Storage, Round-Trip Discovery & Selection Persistence", async () => {
      const testContext = await browser.newContext();
      try {
        const testPage = await testContext.newPage();
        await testPage.setViewportSize({ width: 1440, height: 900 });

        // 1. Fresh context has NO gza.booking.draft.v1 or gza.store.v1.
        // Navigate to /book?step=search
        await testPage.goto(`${baseUrl}/book?step=search`, { waitUntil: "domcontentloaded" });
        // Wait for client React hydration and initial draft establishment
        await testPage.waitForFunction(() => localStorage.getItem("gza.booking.draft.v1") !== null, { timeout: 10000 });

        // 2. Submit round-trip search
        await testPage.waitForSelector('button[type="submit"]:has-text("Search"), button[type="submit"]:has-text("بحث")', { timeout: 8000 });
        await testPage.locator('button[type="submit"]:has-text("Search"), button[type="submit"]:has-text("بحث")').first().click();

        // 3. Results step loads with effective flight options
        await testPage.waitForSelector('[data-surface-target="booking.flight-option"]', { timeout: 10000 });
        const flightOptions = testPage.locator('[data-surface-target="booking.flight-option"]');
        const count = await flightOptions.count();
        if (count === 0) {
          throw new Error("Expected at least 1 flight option on results step");
        }

        // 4. Select outbound flight option (first enabled one)
        const enabledOutbound = testPage.locator('[data-surface-target="booking.flight-option"]:not([disabled])').first();
        await enabledOutbound.click();

        // 5. In round-trip mode, select inbound flight option if present
        const inboundHeading = testPage.locator('#inbound-flights-heading');
        if (await inboundHeading.isVisible()) {
          const enabledInbound = testPage.locator('div[role="radiogroup"][aria-labelledby="inbound-flights-heading"] [data-surface-target="booking.flight-option"]:not([disabled])');
          if ((await enabledInbound.count()) > 0) {
            await enabledInbound.first().click();
          }
        }

        // 6. Verify canonical persistence in gza.booking.draft.v1 and absence of draft in gza.store.v1
        const storageAudit = await testPage.evaluate(() => {
          const draftRaw = localStorage.getItem("gza.booking.draft.v1");
          const storeRaw = localStorage.getItem("gza.store.v1");
          const parsedDraft = draftRaw ? JSON.parse(draftRaw) : null;
          const parsedStore = storeRaw ? JSON.parse(storeRaw) : null;
          return {
            hasCanonicalDraft: Boolean(parsedDraft),
            schemaVersion: parsedDraft?.schemaVersion,
            status: parsedDraft?.status,
            source: parsedDraft?.source,
            hasOutbound: Boolean(parsedDraft?.draft?.outbound?.id),
            submissionId: parsedDraft?.submissionId ?? parsedDraft?.draft?.submissionId,
            legacyStoreHasDraft: Boolean(parsedStore?.draft),
          };
        });

        if (!storageAudit.hasCanonicalDraft) {
          throw new Error("Expected gza.booking.draft.v1 to be populated in localStorage");
        }
        if (storageAudit.schemaVersion !== 1 || storageAudit.status !== "active") {
          throw new Error(`Expected schemaVersion 1 and active status, got ${JSON.stringify(storageAudit)}`);
        }
        if (!storageAudit.hasOutbound) {
          throw new Error("Expected outbound flight to be stored in canonical draft");
        }
        if (!storageAudit.submissionId || typeof storageAudit.submissionId !== "string") {
          throw new Error("Expected stable submissionId in canonical draft");
        }
        if (storageAudit.legacyStoreHasDraft) {
          throw new Error("Forbidden: gza.store.v1 must NOT act as active draft writer");
        }

        // 7. Progress to Fare
        const continueToFare = testPage.locator('button:has-text("Continue"), button:has-text("متابعة")').first();
        await continueToFare.click();
        await testPage.waitForSelector('[data-surface-target="booking.fare-option"]', { timeout: 8000 });

        // 8. Progress to Passengers
        const continueToPax = testPage.locator('button:has-text("Continue"), button:has-text("متابعة")').first();
        await continueToPax.click();
        await testPage.waitForSelector('#fn-0', { timeout: 8000 });

        // Fill required passenger details
        await testPage.fill('#fn-0', "Tariq");
        await testPage.fill('#ln-0', "Mansour");
        const dobField = testPage.locator('#dob-0');
        const tagName = await dobField.evaluate((el) => el.tagName.toLowerCase());
        if (tagName === "input") {
          await dobField.fill("1988-06-15");
        } else {
          await dobField.click();
          await testPage.waitForSelector(".rdp-day button:not([disabled]), button.rdp-day_button:not([disabled])", { timeout: 5000 });
          await testPage.locator(".rdp-day button:not([disabled]), button.rdp-day_button:not([disabled])").first().click();
          await testPage.waitForFunction(() => {
            const el = document.getElementById("dob-0");
            return el && (el.value || (el.textContent && !el.textContent.includes("Select")));
          }, null, { timeout: 5000 });
        }
        await testPage.fill('#contact-email', "tariq.mansour@example.ps");
        await testPage.fill('#contact-phone', "+970599000000");

        // 9. Progress to Seats
        const continueToSeats = testPage.locator('button:has-text("Continue"), button:has-text("متابعة")').first();
        await continueToSeats.click();
        await testPage.waitForSelector('[data-surface-target="booking.seat-console"]', { timeout: 8000 });

        // Skip seats to Extras
        const skipSeats = testPage.locator('button:has-text("Skip seat selection"), button:has-text("تخطي اختيار المقاعد")').first();
        if (await skipSeats.isVisible()) {
          await skipSeats.click();
        } else {
          const nextFromSeats = testPage.locator('button:has-text("Continue"), button:has-text("متابعة")').first();
          await nextFromSeats.click();
        }

        // 10. Progress to Review
        await testPage.waitForSelector('[data-surface-target="booking.extras"]', { timeout: 8000 });
        const continueToReview = testPage.locator('button:has-text("Continue"), button:has-text("متابعة")').first();
        await continueToReview.click();
        await testPage.waitForSelector('[data-surface-target="booking.review-dossier"]', { timeout: 8000 });

        // 11. Review responsive bounds check (1440, 768, 390, 320)
        for (const w of [1440, 768, 390, 320]) {
          await testPage.setViewportSize({ width: w, height: 800 });
          const overflow = await testPage.evaluate(() => document.body.scrollWidth > document.body.clientWidth);
          if (overflow) {
            throw new Error(`Horizontal scroll overflow on /book review step at ${w}px`);
          }
        }
      } finally {
        await testContext.close();
      }
    });

    await checkStep("Check 39: Phase 5B — Operational Cancellation Invalidation, Prefix Seat Eviction & Results Rollback", async () => {
      const testContext = await browser.newContext();
      try {
        const testPage = await testContext.newPage();
        await testPage.setViewportSize({ width: 1440, height: 900 });

        // 1. Seed a valid round-trip draft on step review with outbound, inbound, and seats
        const outboundFlight = currentDeparturesOn("2026-10-15").find(f => f.destinationCode === "AMM");
        const inboundFlight = currentArrivalsOn("2026-10-22").find(f => f.originCode === "AMM");
        if (!outboundFlight || !inboundFlight) throw new Error("Current round-trip Schedule fixture missing");
        const outboundFlightId = outboundFlight.id;
        const inboundFlightId = inboundFlight.id;

        const envelope = {
          schemaVersion: 1,
          status: "active",
          revision: 3,
          updatedAt: new Date().toISOString(),
          source: "direct",
          draft: {
            criteria: {
              tripType: "round",
              origin: "GZA",
              destination: "AMM",
              departDate: "2026-10-15",
              returnDate: "2026-10-22",
              adults: 1,
              children: 0,
              infants: 0,
              cabin: "economy",
            },
            outbound: outboundFlight,
            inbound: inboundFlight,
            fareId: "classic",
            passengers: [
              {
                type: "adult",
                firstName: "Laila",
                lastName: "Kahlout",
                dob: "1992-04-10",
                nationality: "PS",
                document: "P123456",
              },
            ],
            seats: {
              "out-0": "12A",
              "in-0": "14B",
            },
            extras: {
              baggage: 0,
              meal: "standard",
              lounge: false,
              priorityBoarding: false,
              carbonOffset: false,
            },
            contact: {
              email: "laila.kahlout@example.ps",
              phone: "+970599123456",
            },
            entry: "results",
            submissionId: "smoke-sub-inv-39",
          },
        };

        const repo = {
          schemaVersion: 1,
          bookings: [],
          flightOverrides: {
            [outboundFlightId]: {
              flightId: outboundFlightId,
              status: "Cancelled",
              note: "Operational weather cancellation test",
            },
          },
        };

        await testContext.addInitScript(({ env, rep }) => {
          try {
            localStorage.setItem("gza.booking.draft.v1", JSON.stringify(env));
            localStorage.setItem("gza.repo.v1", JSON.stringify(rep));
          } catch { }
        }, { env: envelope, rep: repo });

        // 2. Load /book?step=review
        await testPage.goto(`${baseUrl}/book?step=review`, { waitUntil: "domcontentloaded" });

        // 3. Wait for reconciliation to kick in: outbound is invalidated, URL/step is clamped back to results
        await testPage.waitForSelector('[role="alert"]', { timeout: 15000 });
        const alertNotice = testPage.locator('[role="alert"]').first();
        const alertText = await alertNotice.innerText();
        if (!alertText.toLowerCase().includes("cancelled") && !alertText.toLowerCase().includes("unavailable") && !alertText.includes("ملغاة")) {
          throw new Error(`Expected cancellation alert notice, got "${alertText}"`);
        }

        // 4. Verify in localStorage that prefix seat eviction was applied (out-0 deleted, in-0 preserved)
        const postReconciliation = await testPage.evaluate(() => {
          const raw = localStorage.getItem("gza.booking.draft.v1");
          const parsed = raw ? JSON.parse(raw) : null;
          return {
            outbound: parsed?.draft?.outbound,
            inboundId: parsed?.draft?.inbound?.id,
            hasOutSeat: Boolean(parsed?.draft?.seats?.["out-0"]),
            inSeat: parsed?.draft?.seats?.["in-0"],
            paxFirstName: parsed?.draft?.passengers?.[0]?.firstName,
          };
        });

        if (postReconciliation.outbound !== null) {
          throw new Error("Expected outbound flight to be cleared from draft upon operational cancellation");
        }
        if (postReconciliation.hasOutSeat) {
          throw new Error("Expected out-0 seat to be evicted via prefix deletion");
        }
        if (postReconciliation.inSeat !== "14B") {
          throw new Error(`Expected surviving in-0 seat '14B' to be preserved, got ${postReconciliation.inSeat}`);
        }
        if (!postReconciliation.inboundId) {
          throw new Error("Expected surviving inbound flight to remain intact");
        }
        if (postReconciliation.paxFirstName !== "Laila") {
          throw new Error("Expected passenger information to be preserved across leg invalidation");
        }
      } finally {
        await testContext.close();
      }
    });

    await checkStep("Check 40: Phase 5B — Legacy Store Migration, Cleared Tombstone Anti-Resurrection & Multi-Tab Isolation", async () => {
      const testContext = await browser.newContext();
      try {
        const testPage = await testContext.newPage();
        await testPage.setViewportSize({ width: 1440, height: 900 });

        // 1. Ensure gza.booking.draft.v1 is ABSENT and seed legacy gza.store.v1
        const legacyPayload = {
          draft: {
            criteria: {
              tripType: "round",
              origin: "GZA",
              destination: "AMM",
              departDate: "2026-10-15",
              returnDate: "2026-10-22",
              adults: 1,
              children: 0,
              infants: 0,
              cabin: "economy",
            },
            outbound: null,
            inbound: null,
            fareId: "essential",
            passengers: [],
            seats: {},
            extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
            contact: { email: "legacy-migrated@example.ps", phone: "+970599999999" },
            entry: "search",
            submissionId: "legacy-sub-40",
          },
          bookings: [],
          account: null,
        };
        const rawLegacy = JSON.stringify(legacyPayload);

        await testPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
        await testPage.evaluate((raw) => {
          try {
            localStorage.removeItem("gza.booking.draft.v1");
            localStorage.setItem("gza.store.v1", raw);
          } catch { }
        }, rawLegacy);

        // 2. Load /book?step=search to trigger migration
        await testPage.goto(`${baseUrl}/book?step=search`, { waitUntil: "domcontentloaded" });
        await testPage.waitForFunction(
          () => localStorage.getItem("gza.booking.draft.v1") !== null,
          { timeout: 10000 },
        );

        // Verify migration occurred into gza.booking.draft.v1 and legacy store is unmodified
        const migrationAudit = await testPage.evaluate((rawExpected) => {
          const canonicalRaw = localStorage.getItem("gza.booking.draft.v1");
          const canonical = canonicalRaw ? JSON.parse(canonicalRaw) : null;
          const currentLegacy = localStorage.getItem("gza.store.v1");
          return {
            status: canonical?.status,
            contactEmail: canonical?.draft?.contact?.email,
            legacyUnchanged: currentLegacy === rawExpected,
          };
        }, rawLegacy);

        if (migrationAudit.status !== "active") {
          throw new Error(`Expected active legacy-migrated draft, got ${JSON.stringify(migrationAudit)}`);
        }
        if (migrationAudit.contactEmail !== "legacy-migrated@example.ps") {
          throw new Error(`Expected migrated contact email, got ${migrationAudit.contactEmail}`);
        }
        if (!migrationAudit.legacyUnchanged) {
          throw new Error("Forbidden: legacy gza.store.v1 was modified during migration");
        }

        // 3. Tombstone anti-resurrection: set status = cleared in gza.booking.draft.v1
        await testPage.evaluate(() => {
          const clearedEnvelope = {
            schemaVersion: 1,
            status: "cleared",
            revision: 5,
            updatedAt: new Date().toISOString(),
            source: "direct",
            draft: null,
            clearedAt: new Date().toISOString(),
            clearedReason: "completed",
          };
          localStorage.setItem("gza.booking.draft.v1", JSON.stringify(clearedEnvelope));
        });

        // Reload page and verify legacy draft is NOT resurrected
        await testPage.reload({ waitUntil: "domcontentloaded" });
        await testPage.waitForFunction(
          () => localStorage.getItem("gza.booking.draft.v1") !== null,
          { timeout: 10000 },
        );
        const tombstoneAudit = await testPage.evaluate(() => {
          const canonicalRaw = localStorage.getItem("gza.booking.draft.v1");
          const canonical = canonicalRaw ? JSON.parse(canonicalRaw) : null;
          return {
            status: canonical?.status,
            contactEmail: canonical?.draft?.contact?.email,
          };
        });

        if (tombstoneAudit.contactEmail === "legacy-migrated@example.ps") {
          throw new Error("Tombstone violation: legacy draft resurrected over cleared canonical tombstone");
        }

        // 4. Studio Capacity Proof Isolation
        await testPage.evaluate(() => {
          const prodDraft = {
            schemaVersion: 1,
            status: "active",
            revision: 10,
            updatedAt: new Date().toISOString(),
            source: "direct",
            draft: {
              criteria: { tripType: "one-way", origin: "GZA", destination: "AMM", departDate: "2026-10-15", returnDate: "", adults: 1, children: 0, infants: 0, cabin: "economy" },
              outbound: null,
              inbound: null,
              fareId: "essential",
              passengers: [],
              seats: {},
              extras: { baggage: 0, meal: "standard", lounge: false, priorityBoarding: false, carbonOffset: false },
              contact: { email: "real-prod-user@example.ps", phone: "+970599001122" },
              entry: "search",
              submissionId: "prod-sub-isolation",
            },
          };
          localStorage.setItem("gza.booking.draft.v1", JSON.stringify(prodDraft));
        });

        // Load studio preview scenario
        await testPage.goto(`${baseUrl}/book?studioPreview=1&scenario=booking.capacity-proof&step=results`, { waitUntil: "domcontentloaded" });
        await testPage.waitForSelector('[id^="flight-option-CAP-PROOF"]', { timeout: 8000 });

        // Verify canonical storage was not tainted by CAP-PROOF
        const studioAudit = await testPage.evaluate(() => {
          const raw = localStorage.getItem("gza.booking.draft.v1");
          const parsed = raw ? JSON.parse(raw) : null;
          return {
            contactEmail: parsed?.draft?.contact?.email,
            outboundId: parsed?.draft?.outbound?.id,
          };
        });

        if (studioAudit.contactEmail !== "real-prod-user@example.ps") {
          throw new Error("Studio scenario corrupted production draft email");
        }
        if (studioAudit.outboundId?.startsWith("CAP-PROOF")) {
          throw new Error("Studio scenario leaked synthetic CAP-PROOF flight into canonical storage");
        }
      } finally {
        await testContext.close();
      }
    });

    await checkStep("Check 41: Phase 5B — No Sellable Service Search & Calendar Convergence Regression (Operational Cancellation, Submit Disabled, Clean Context Restoration)", async () => {
      const testContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const testPage = await testContext.newPage();

        // 1. Prepare operational overrides cancelling all flights for GZA -> AMM on 2026-10-15
        const cancelledFlightIds = currentDeparturesOn("2026-10-15").filter(f => f.destinationCode === "AMM").map(f => f.id);
        if (!cancelledFlightIds.length) throw new Error("Opening current AMM service fixture missing");

        const initialDraftEnvelope = {
          schemaVersion: 1,
          status: "active",
          revision: 1,
          updatedAt: new Date().toISOString(),
          source: "direct",
          draft: {
            criteria: {
              tripType: "oneway",
              origin: "GZA",
              destination: "AMM",
              departDate: "2026-10-15",
              returnDate: "",
              adults: 1,
              children: 0,
              infants: 0,
              cabin: "economy",
            },
            outbound: null,
            inbound: null,
            fareId: "classic",
            passengers: [],
            seats: {},
            extras: { baggage: 0, meal: "standard", lounge: false, priorityBoarding: false, carbonOffset: false },
            contact: { email: "", phone: "" },
            entry: "search",
            submissionId: "smoke-sub-no-service-41",
          },
        };

        const initialRepo = {
          schemaVersion: 1,
          bookings: [],
          flightOverrides: Object.fromEntries(
            cancelledFlightIds.map((id) => [
              id,
              { flightId: id, status: "Cancelled", note: "Smoke test full cancellation" },
            ]),
          ),
        };

        await testContext.addInitScript(({ env, rep }) => {
          try {
            localStorage.setItem("gza.booking.draft.v1", JSON.stringify(env));
            localStorage.setItem("gza.repo.v1", JSON.stringify(rep));
          } catch { }
        }, { env: initialDraftEnvelope, rep: initialRepo });

        // 2. Navigate to search step on /book?step=search
        await testPage.goto(`${baseUrl}/book?step=search`, { waitUntil: "domcontentloaded" });
        await testPage.waitForSelector('[data-flight-search-console]', { timeout: 10000 });

        // 3. Verify date trigger indicates aria-invalid
        const departTrigger = testPage.locator('#search-depart');
        await testPage.waitForFunction(() => {
          const el = document.querySelector('#search-depart');
          return el && el.getAttribute("aria-invalid") === "true";
        }, { timeout: 10000 });
        const isInvalid = await departTrigger.getAttribute("aria-invalid");
        if (isInvalid !== "true") {
          throw new Error(`Expected departTrigger to have aria-invalid="true", got "${isInvalid}"`);
        }

        // 4. Click submit button: must trigger validation, show role="alert" banner, and NOT navigate
        const submitBtn = testPage.locator('button[type="submit"]').first();
        await submitBtn.click();
        await testPage.waitForTimeout(400);

        const alertBanner = testPage.locator('form[aria-label] div[role="alert"]').first();
        if ((await alertBanner.count()) === 0) {
          throw new Error("Expected validation role='alert' banner when submitting date with no sellable service");
        }
        const alertText = (await alertBanner.textContent()) || "";
        if (!alertText.includes("AMM") && !alertText.toLowerCase().includes("no scheduled")) {
          throw new Error(`Unexpected alert banner text: "${alertText}"`);
        }

        const currentUrl = testPage.url();
        if (currentUrl.includes("step=results")) {
          throw new Error(`Submit button navigated to results despite no sellable service: ${currentUrl}`);
        }

        // 5. Clean context restoration: pick a date with sellable service (2026-10-16)
        await departTrigger.click();
        await testPage.waitForSelector('[data-day="2026-10-16"]', { timeout: 5000 });
        const dayBtn = testPage.locator('[data-day="2026-10-16"]').first();
        await dayBtn.click();
        await testPage.waitForTimeout(300);

        // Date trigger aria-invalid should be cleared
        await testPage.waitForFunction(() => {
          const el = document.querySelector('#search-depart');
          return el && el.getAttribute("aria-invalid") !== "true";
        }, { timeout: 5000 });

        // Submit now advances to results
        await submitBtn.click();
        await testPage.waitForURL((url) => url.searchParams.get("step") === "results", { timeout: 8000 });
        if (!testPage.url().includes("step=results")) {
          throw new Error(`Expected successful navigation to results after picking valid date: ${testPage.url()}`);
        }

        // 6. Verify Arabic route (/ar/book?step=search) also enforces no-service validation and displays role="alert"
        await testPage.goto(`${baseUrl}/ar/book?step=search`, { waitUntil: "domcontentloaded" });
        await testPage.waitForSelector('[data-flight-search-console]', { timeout: 10000 });
        // Set date to cancelled 2026-10-15
        await testPage.evaluate(() => {
          const raw = localStorage.getItem("gza.booking.draft.v1");
          if (raw) {
            const parsed = JSON.parse(raw);
            parsed.draft.criteria.departDate = "2026-10-15";
            localStorage.setItem("gza.booking.draft.v1", JSON.stringify(parsed));
          }
        });
        await testPage.reload({ waitUntil: "domcontentloaded" });
        await testPage.waitForSelector('[data-flight-search-console]', { timeout: 10000 });

        const arDepartTrigger = testPage.locator('#search-depart');
        await testPage.waitForFunction(() => {
          const el = document.querySelector('#search-depart');
          return el && el.getAttribute("aria-invalid") === "true";
        }, { timeout: 10000 });

        const arSubmitBtn = testPage.locator('button[type="submit"]').first();
        await arSubmitBtn.click();
        await testPage.waitForTimeout(400);

        const arAlertBanner = testPage.locator('form[aria-label] div[role="alert"]').first();
        if ((await arAlertBanner.count()) === 0) {
          throw new Error("Arabic search form did not display role='alert' error banner for no sellable service");
        }
        if (testPage.url().includes("step=results")) {
          throw new Error("Arabic search navigated to results despite no sellable service");
        }
      } finally {
        await testContext.close();
      }
    });

    await checkStep("Check 42: Phase 5C — Manage Trip, Online Check-in & Boarding Pass Convergence (English end-to-end journey)", async () => {
      const testContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const testPage = await testContext.newPage();

        const bookingRef = "GZA-5C42";
        const flightOut = {
          id: "PS100-2026-10-10-out",
          number: "PS100",
          originCode: "GZA",
          destinationCode: "AMM",
          date: "2026-10-10",
          departTime: "07:15",
          arriveTime: "08:10",
          durationMinutes: 55,
          aircraft: "Airbus A321neo",
          status: "Scheduled",
          gate: "A1",
          terminal: "1",
          basePrice: 177,
          seatsLeft: 19,
        };

        const initialRepo = {
          schemaVersion: 1,
          bookings: [
            {
              ref: bookingRef,
              createdAt: "2026-10-01T10:00:00Z",
              status: "confirmed",
              ownerEmail: "khalil@example.ps",
              total: 350,
              contact: { email: "khalil@example.ps", phone: "+970 8 282 0000" },
              criteria: {
                tripType: "oneway",
                origin: "GZA",
                destination: "AMM",
                departDate: "2026-10-10",
                returnDate: "",
                adults: 2,
                children: 0,
                infants: 1,
                cabin: "economy",
              },
              outbound: flightOut,
              inbound: null,
              fareId: "classic",
              passengers: [
                { id: `pax-${bookingRef}-0`, firstName: "Ahmad", lastName: "Khalil", type: "adult", dob: "1985-05-15", nationality: "PS", document: "" },
                { id: `pax-${bookingRef}-1`, firstName: "Fatima", lastName: "Khalil", type: "adult", dob: "1988-08-20", nationality: "PS", document: "" },
                { id: `pax-${bookingRef}-2`, firstName: "Nour", lastName: "Khalil", type: "infant", dob: "2025-11-01", nationality: "PS", document: "", withAdult: 0 },
              ],
              seats: { "out-0": "11A", "out-1": "11B" },
              extras: { pax: [] },
              checkedIn: { out: [], in: [] },
            },
          ],
          flightOverrides: {},
        };

        // Controlled clock: 2026-10-10 04:00 (departure is 07:15, so 3h15m before departure, within 24h to 60m window)
        const clockMs = Date.parse("2026-10-10T04:00:00+03:00");

        await testContext.addInitScript(({ initialRepo, clockMs }) => {
          try {
            if (!sessionStorage.getItem("gza.smoke.check42_init")) {
              sessionStorage.setItem("gza.smoke.check42_init", "1");
              localStorage.setItem("gza.repo.v1", JSON.stringify(initialRepo));
            }
            const RealDate = Date;
            class MockDate extends RealDate {
              constructor(...args) {
                if (args.length === 0) {
                  super(clockMs);
                } else {
                  super(...args);
                }
              }
              static now() {
                return clockMs;
              }
            }
            window.Date = MockDate;
          } catch {
            // ignore
          }
        }, { initialRepo, clockMs });

        // 1. Navigate to /manage and retrieve booking
        await testPage.goto(`${baseUrl}/manage`, { waitUntil: "domcontentloaded" });
        await testPage.waitForSelector('#pnr', { timeout: 10000 });
        await waitForInteractiveInput(testPage, '#pnr');
        await testPage.fill('#pnr', bookingRef);
        await testPage.fill('#identifier', 'khalil');
        await testPage.click('button[type="submit"]');

        await waitForJourneyURL(testPage, (url) => url.pathname.includes(`/manage/${bookingRef}`), { waitUntil: "domcontentloaded", timeout: 8000 });
        if (!testPage.url().includes(`/manage/${bookingRef}`)) {
          throw new Error(`Expected navigation to /manage/${bookingRef}, got ${testPage.url()}`);
        }

        // 2. Booking detail inspection
        await testPage.waitForSelector('text=GZA-5C42', { timeout: 5000 });
        const scheduledTimeEl = testPage.locator('text=07:15').first();
        if ((await scheduledTimeEl.count()) === 0) {
          throw new Error("Scheduled departure time 07:15 not found on booking detail");
        }

        // 3. Navigate to check-in
        const checkinLink = testPage.locator(`a[href*="/manage/${bookingRef}/check-in"]`).first();
        if ((await checkinLink.count()) === 0) {
          throw new Error("Check-in link not found on booking detail");
        }
        await checkinLink.click();
        await waitForJourneyURL(testPage, (url) => url.pathname.includes("check-in"), { waitUntil: "domcontentloaded", timeout: 8000 });

        // Step: Choose Leg (if leg selection step is active)
        const legBtn = testPage.locator('button:has-text("Outbound"), button:has-text("PS100")').first();
        await legBtn.waitFor({ state: "visible", timeout: 10000 });
        await legBtn.click();

        // Step: Choose Pax (select only passenger 0 to test partial check-in)
        await testPage.waitForSelector('#ci-pax-0', { timeout: 5000 });
        const pax1Checkbox = testPage.locator('#ci-pax-1');
        if ((await pax1Checkbox.count()) > 0 && (await pax1Checkbox.isChecked())) {
          await testPage.locator('label[for="ci-pax-1"]').click();
        }
        const pax0Checkbox = testPage.locator('#ci-pax-0');
        if (!(await pax0Checkbox.isChecked())) {
          await testPage.locator('label[for="ci-pax-0"]').click();
        }
        // Verify infant is not presented as an independent selectable passenger
        const infantCheckbox = testPage.locator('#ci-pax-2');
        if ((await infantCheckbox.count()) > 0) {
          throw new Error("Infant should not be selectable as a standalone check-in passenger");
        }

        // Click Continue to Document step
        const continueBtn1 = testPage.locator('button:has-text("Continue"), button:has-text("Next")').first();
        await continueBtn1.click();

        // Step: Document entry
        await testPage.waitForSelector('#doc-0', { timeout: 5000 });
        await testPage.fill('#doc-0', 'PASS-AHMAD-123');

        const continueBtn2 = testPage.locator('button:has-text("Continue"), button:has-text("Next")').first();
        await continueBtn2.click();

        // Step: Seat selection (accept pre-assigned and continue to review)
        await testPage.waitForSelector('button:has-text("Continue")', { timeout: 5000 });
        const continueBtn3 = testPage.locator('button:has-text("Continue")').first();
        await continueBtn3.click();

        // Step: Review and Complete Check-in
        await testPage.waitForSelector('button:has-text("Complete check-in")', { timeout: 5000 });
        const completeBtn = testPage.locator('button:has-text("Complete check-in")').first();
        await completeBtn.click();

        // Verify done step
        await testPage.waitForSelector('text=Check-in complete', { timeout: 8000 });

        // Verify canonical persistence in localStorage
        const storedRepo = await testPage.evaluate(() => {
          const raw = localStorage.getItem("gza.repo.v1");
          return raw ? JSON.parse(raw) : null;
        });
        const storedBooking = storedRepo?.bookings?.find((b) => b.ref === "GZA-5C42");
        if (!storedBooking) {
          throw new Error("Booking GZA-5C42 not found in canonical storage after check-in");
        }
        if (!storedBooking.checkedIn?.out?.includes(0)) {
          throw new Error("Passenger 0 not recorded in checkedIn.out in canonical storage");
        }
        if (storedBooking.passengers?.[0]?.document !== "PASS-AHMAD-123") {
          throw new Error(`Passenger 0 document not updated in canonical storage: ${storedBooking.passengers?.[0]?.document}`);
        }

        // 4. View Boarding Pass
        await testPage.goto(`${baseUrl}/boarding-pass/${bookingRef}/out/0`, { waitUntil: "domcontentloaded" });
        await testPage.waitForSelector('text=Khalil', { timeout: 10000 });

        // Verify boarding pass fields
        const bpText = await testPage.textContent('body');
        if (!bpText.includes("07:15")) {
          throw new Error("Boarding pass does not show scheduled departure 07:15");
        }
        if (!bpText.includes("06:30")) {
          throw new Error("Boarding pass does not show Boarding opens time 06:30 (scheduled - 45m)");
        }
        if (!bpText.includes("11A") && !bpText.includes("14A")) {
          throw new Error("Boarding pass does not display assigned seat");
        }

        // 5. Test Operational Flight Override Reactivity
        await testPage.evaluate(({ bRef, flightId }) => {
          const raw = localStorage.getItem("gza.repo.v1");
          if (raw) {
            const data = JSON.parse(raw);
            data.flightOverrides[flightId] = {
              flightId,
              gate: "B9",
              terminal: "T2",
              revisedDepart: "08:30",
            };
            localStorage.setItem("gza.repo.v1", JSON.stringify(data));
          }
        }, { bRef: bookingRef, flightId: "PS100-2026-10-10-out" });

        await testPage.reload({ waitUntil: "domcontentloaded" });
        await testPage.waitForSelector('text=B9', { timeout: 10000 });

        const updatedBpText = await testPage.textContent('body');
        if (!updatedBpText.includes("B9")) {
          throw new Error("Boarding pass failed to reflect revised gate B9");
        }
        if (!updatedBpText.includes("08:30")) {
          throw new Error("Boarding pass failed to reflect revised departure 08:30");
        }
        if (!updatedBpText.includes("07:15")) {
          throw new Error("Boarding pass lost scheduled departure 07:15 after operational revision");
        }
        if (!updatedBpText.includes("06:30")) {
          throw new Error("Boarding pass recalculated boarding opens time from revised departure instead of scheduled");
        }

        // 6. Test Operational Cancellation Treatment
        await testPage.evaluate(({ flightId }) => {
          const raw = localStorage.getItem("gza.repo.v1");
          if (raw) {
            const data = JSON.parse(raw);
            data.flightOverrides[flightId] = {
              flightId,
              status: "Cancelled",
            };
            localStorage.setItem("gza.repo.v1", JSON.stringify(data));
          }
        }, { flightId: "PS100-2026-10-10-out" });

        await testPage.reload({ waitUntil: "domcontentloaded" });
        await testPage.waitForSelector('[role="alert"]:has-text("Cancelled")', { timeout: 10000 });
      } finally {
        await testContext.close();
      }
    });

    await checkStep("Check 43: Phase 5C — Arabic Manage, RTL & Technical LTR Formatting, Checked-in Seat Protection", async () => {
      const testContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const testPage = await testContext.newPage();

        const bookingRef = "GZA-5C43";
        const flightOut = {
          id: "PS100-2026-10-10-out",
          number: "PS100",
          originCode: "GZA",
          destinationCode: "AMM",
          date: "2026-10-10",
          departTime: "07:15",
          arriveTime: "08:10",
          durationMinutes: 55,
          aircraft: "Airbus A321neo",
          status: "Scheduled",
          gate: "A1",
          terminal: "1",
          basePrice: 177,
          seatsLeft: 19,
        };

        const initialRepo = {
          schemaVersion: 1,
          bookings: [
            {
              ref: bookingRef,
              createdAt: "2026-10-01T10:00:00Z",
              status: "confirmed",
              ownerEmail: "salem@example.ps",
              total: 250,
              contact: { email: "salem@example.ps", phone: "+970 8 282 1111" },
              criteria: {
                tripType: "oneway",
                origin: "GZA",
                destination: "AMM",
                departDate: "2026-10-10",
                returnDate: "",
                adults: 1,
                children: 0,
                infants: 0,
                cabin: "economy",
              },
              outbound: flightOut,
              inbound: null,
              fareId: "classic",
              passengers: [
                { id: `pax-${bookingRef}-0`, firstName: "Salem", lastName: "Baraka", type: "adult", dob: "1990-03-12", nationality: "PS", document: "DOC-SALEM-1" },
              ],
              seats: { "out-0": "14A" },
              extras: { pax: [] },
              checkedIn: { out: [0], in: [] }, // Passenger 0 is ALREADY checked in with seat 14A
            },
          ],
          flightOverrides: {},
        };

        const clockMs = Date.parse("2026-10-10T04:00:00+03:00");

        await testContext.addInitScript(({ initialRepo, clockMs }) => {
          try {
            if (!localStorage.getItem("gza.repo.v1")) {
              localStorage.setItem("gza.repo.v1", JSON.stringify(initialRepo));
            }
            const RealDate = Date;
            class MockDate extends RealDate {
              constructor(...args) {
                if (args.length === 0) {
                  super(clockMs);
                } else {
                  super(...args);
                }
              }
              static now() {
                return clockMs;
              }
            }
            window.Date = MockDate;
          } catch {
            // ignore
          }
        }, { initialRepo, clockMs });

        // 1. Navigate to Arabic Manage: /ar/manage
        await testPage.goto(`${baseUrl}/ar/manage`, { waitUntil: "domcontentloaded" });
        await testPage.waitForSelector('#pnr', { timeout: 10000 });
        await testPage.waitForLoadState("load");
        await testPage.waitForTimeout(350);

        // Verify document direction is RTL
        const isRtl = await testPage.evaluate(() => document.documentElement.dir === "rtl");
        if (!isRtl) {
          throw new Error("Arabic manage route /ar/manage does not have dir='rtl'");
        }

        // Fill Arabic lookup form
        await testPage.fill('#pnr', bookingRef);
        await testPage.fill('#identifier', 'salem@example.ps');
        await testPage.click('button[type="submit"]');

        await testPage.waitForURL((url) => url.pathname.includes(`/ar/manage/${bookingRef}`), { timeout: 8000 });

        // 2. Technical LTR identifiers check
        const pnrEl = testPage.locator(`text=${bookingRef}`).first();
        await pnrEl.waitFor({ state: "visible", timeout: 10000 });

        // 3. Checked-in seat protection in seat selection view
        await testPage.goto(`${baseUrl}/ar/manage/${bookingRef}/seats`, { waitUntil: "domcontentloaded" });
        await testPage.waitForTimeout(500);

        // The seat page must show seat protection warning or notice that checked-in seats cannot be altered
        const pageText = await testPage.textContent('body');
        if (!pageText.includes("14A")) {
          throw new Error("Current assigned seat 14A not displayed on Arabic seat management view");
        }

        // 4. Check-in route eligibility guard
        await testPage.goto(`${baseUrl}/ar/manage/${bookingRef}/check-in`, { waitUntil: "domcontentloaded" });
        await testPage.waitForTimeout(500);

        // Since passenger 0 is already checked in, verify that check-in does not offer an active submit button
        const submitCi = testPage.locator('button:has-text("إتمام"), button:has-text("تسجيل الوصول")').first();
        if ((await submitCi.count()) > 0 && !(await submitCi.isDisabled())) {
          throw new Error("Check-in allowed active submission for an already checked-in passenger");
        }
      } finally {
        await testContext.close();
      }
    });

    await checkStep("Check 44: Phase 5C — Operational Flight Presentation: override verification and durable stored-snapshot compatibility", async () => {
      const testContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const testPage = await testContext.newPage();

        const bookingRef = "GZA-5C44";
        const flightOut = {
          id: "PS100-2026-10-10-out",
          number: "PS100",
          originCode: "GZA",
          destinationCode: "AMM",
          date: "2026-10-10",
          departTime: "07:15",
          arriveTime: "08:10",
          durationMinutes: 55,
          aircraft: "Airbus A321neo",
          status: "Scheduled",
          gate: "A1",
          terminal: "1",
          basePrice: 177,
          seatsLeft: 19,
        };

        const initialRepo = {
          schemaVersion: 1,
          bookings: [
            {
              ref: bookingRef,
              createdAt: "2026-10-01T10:00:00Z",
              status: "confirmed",
              ownerEmail: "presentation@example.ps",
              total: 200,
              contact: { email: "presentation@example.ps", phone: "+970 8 282 2222" },
              criteria: {
                tripType: "oneway",
                origin: "GZA",
                destination: "AMM",
                departDate: "2026-10-10",
                returnDate: "",
                adults: 1,
                children: 0,
                infants: 0,
                cabin: "economy",
              },
              outbound: flightOut,
              inbound: null,
              fareId: "classic",
              passengers: [
                { id: `pax-${bookingRef}-0`, firstName: "Kareem", lastName: "Nasser", type: "adult", dob: "1992-04-10", nationality: "PS", document: "DOC-KAREEM-1" },
              ],
              seats: { "out-0": "11A" },
              extras: { pax: [] },
              checkedIn: { out: [0], in: [] },
            },
          ],
          flightOverrides: {
            // Stage 1: Active operational override with gate B9, terminal T2, revised departure 08:30
            "PS100-2026-10-10-out": {
              flightId: "PS100-2026-10-10-out",
              gate: "B9",
              terminal: "T2",
              revisedDepart: "08:30",
              status: "Delayed",
            },
          },
        };

        const clockMs = Date.parse("2026-10-10T04:00:00+03:00");

        await testContext.addInitScript(({ initialRepo, clockMs }) => {
          try {
            if (!localStorage.getItem("gza.repo.v1")) {
              localStorage.setItem("gza.repo.v1", JSON.stringify(initialRepo));
            }
            const RealDate = Date;
            class MockDate extends RealDate {
              constructor(...args) {
                if (args.length === 0) super(clockMs);
                else super(...args);
              }
              static now() { return clockMs; }
            }
            window.Date = MockDate;
          } catch {
            // ignore
          }
        }, { initialRepo, clockMs });

        // 1. Verify successful operational override presentation on Manage Detail
        await testPage.goto(`${baseUrl}/manage/${bookingRef}`, { waitUntil: "domcontentloaded" });
        await testPage.waitForSelector('text=B9', { timeout: 10000 });

        const detailText = await testPage.textContent('body');
        if (!detailText.includes("B9")) {
          throw new Error("Operational gate B9 not displayed on Manage Detail");
        }
        if (!detailText.includes("T2")) {
          throw new Error("Operational terminal T2 not displayed on Manage Detail");
        }
        if (!detailText.includes("08:30")) {
          throw new Error("Operational revised departure 08:30 not displayed on Manage Detail");
        }
        if (!detailText.includes("07:15")) {
          throw new Error("Scheduled departure 07:15 lost on Manage Detail");
        }

        // 2. Verify successful operational override presentation on Boarding Pass
        await testPage.goto(`${baseUrl}/boarding-pass/${bookingRef}/out/0`, { waitUntil: "domcontentloaded" });
        await testPage.waitForSelector('text=B9', { timeout: 10000 });

        const bpText = await testPage.textContent('body');
        if (!bpText.includes("B9")) {
          throw new Error("Operational gate B9 not displayed on Boarding Pass");
        }
        if (!bpText.includes("08:30")) {
          throw new Error("Operational revised departure 08:30 not displayed on Boarding Pass");
        }
        if (!bpText.includes("07:15")) {
          throw new Error("Scheduled departure 07:15 lost on Boarding Pass");
        }

        // 3. A historical identity absent from current planning remains resolvable from its canonical Booking snapshot.
        await testPage.evaluate(({ bRef }) => {
          const raw = localStorage.getItem("gza.repo.v1");
          if (raw) {
            const data = JSON.parse(raw);
            const b = data.bookings.find((item) => item.ref === bRef);
            if (b) {
              b.outbound.id = "PS999-2026-10-10-out";
              b.outbound.number = "PS999";
              b.outbound.gate = "A1"; // Booked snapshot has gate A1
              b.outbound.terminal = "1";
            }
            delete data.flightOverrides["PS100-2026-10-10-out"];
            localStorage.setItem("gza.repo.v1", JSON.stringify(data));
          }
        }, { bRef: bookingRef });

        for (const path of [`/boarding-pass/${bookingRef}/out/0`, `/manage/${bookingRef}`, `/ar/manage/${bookingRef}`]) {
          await testPage.goto(baseUrl + path, { waitUntil: "domcontentloaded" });
          await testPage.getByText("PS999", { exact: true }).first().waitFor();
          await testPage.getByText("A1", { exact: true }).first().waitFor();
          const text = await testPage.textContent("body");
          if (!text.includes("07:15")) throw new Error("Stored planned departure must remain intelligible");
          if (text.includes("Operational flight status unavailable")) throw new Error("Successful Booking snapshot resolution must not report an unavailable Flight");
        }
      } finally {
        await testContext.close();
      }
    });

    await checkStep("Check 45: Phase 5C — Partial Check-in Boundary Isolation: deselected passenger seat change discarded and unselected state preserved", async () => {
      const testContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const testPage = await testContext.newPage();

        const bookingRef = "GZA-5C45";
        const flightOut = {
          id: "PS100-2026-10-10-out",
          number: "PS100",
          originCode: "GZA",
          destinationCode: "AMM",
          date: "2026-10-10",
          departTime: "07:15",
          arriveTime: "08:10",
          durationMinutes: 55,
          aircraft: "Airbus A321neo",
          status: "Scheduled",
          gate: "A1",
          terminal: "1",
          basePrice: 177,
          seatsLeft: 19,
        };

        const initialRepo = {
          schemaVersion: 1,
          bookings: [
            {
              ref: bookingRef,
              createdAt: "2026-10-01T10:00:00Z",
              status: "confirmed",
              ownerEmail: "isolation@example.ps",
              total: 350,
              contact: { email: "isolation@example.ps", phone: "+970 8 282 3333" },
              criteria: {
                tripType: "oneway",
                origin: "GZA",
                destination: "AMM",
                departDate: "2026-10-10",
                returnDate: "",
                adults: 2,
                children: 0,
                infants: 0,
                cabin: "economy",
              },
              outbound: flightOut,
              inbound: null,
              fareId: "classic",
              passengers: [
                { id: `pax-${bookingRef}-0`, firstName: "Tariq", lastName: "Hamdan", type: "adult", dob: "1987-04-12", nationality: "PS", document: "DOC-TARIQ-OLD" },
                { id: `pax-${bookingRef}-1`, firstName: "Laila", lastName: "Hamdan", type: "adult", dob: "1990-09-22", nationality: "PS", document: "DOC-LAILA-ORIG" },
              ],
              seats: { "out-0": "11A", "out-1": "11B" },
              extras: { pax: [] },
              checkedIn: { out: [], in: [] },
            },
          ],
          flightOverrides: {},
        };

        const clockMs = Date.parse("2026-10-10T04:00:00+03:00");

        await testContext.addInitScript(({ initialRepo, clockMs }) => {
          try {
            if (!localStorage.getItem("gza.repo.v1")) {
              localStorage.setItem("gza.repo.v1", JSON.stringify(initialRepo));
            }
            const RealDate = Date;
            class MockDate extends RealDate {
              constructor(...args) {
                if (args.length === 0) super(clockMs);
                else super(...args);
              }
              static now() { return clockMs; }
            }
            window.Date = MockDate;
          } catch { }
        }, { initialRepo, clockMs });

        // 1. Navigate to /manage and retrieve booking
        await testPage.goto(`${baseUrl}/manage`, { waitUntil: "domcontentloaded" });
        await testPage.waitForSelector('#pnr', { timeout: 10000 });
        await waitForInteractiveInput(testPage, '#pnr');
        await testPage.fill('#pnr', bookingRef);
        await testPage.fill('#identifier', 'hamdan');
        await testPage.click('button[type="submit"]');

        await waitForJourneyURL(testPage, (url) => url.pathname.includes(`/manage/${bookingRef}`), { waitUntil: "domcontentloaded", timeout: 8000 });

        // 2. Navigate to check-in
        const checkinLink = testPage.locator(`a[href*="/manage/${bookingRef}/check-in"]`).first();
        await checkinLink.click();
        await waitForJourneyURL(testPage, (url) => url.pathname.includes("check-in"), { waitUntil: "domcontentloaded", timeout: 8000 });

        // Step: Choose Leg (if leg selection step is active)
        const legBtn = testPage.locator('button:has-text("Outbound"), button:has-text("PS100")').first();
        if ((await legBtn.count()) > 0) {
          await legBtn.click();
          await testPage.waitForTimeout(300);
        }

        // Step: Choose Pax — select BOTH passengers 0 and 1
        await testPage.waitForSelector('#ci-pax-0', { timeout: 5000 });
        const pax0Checkbox = testPage.locator('#ci-pax-0');
        if (!(await pax0Checkbox.isChecked())) {
          await testPage.locator('label[for="ci-pax-0"]').click();
        }
        const pax1Checkbox = testPage.locator('#ci-pax-1');
        if (!(await pax1Checkbox.isChecked())) {
          await testPage.locator('label[for="ci-pax-1"]').click();
        }

        // Proceed to Details
        const continueBtn1 = testPage.locator('button:has-text("Continue"), button:has-text("Next")').first();
        await continueBtn1.click();

        // Step: Details — fill documents for both
        await testPage.waitForSelector('#doc-0', { timeout: 5000 });
        await testPage.fill('#doc-0', 'DOC-TARIQ-NEW');
        await testPage.waitForSelector('#doc-1', { timeout: 5000 });
        await testPage.fill('#doc-1', 'DOC-LAILA-CHANGED');

        // Proceed to Seats
        const continueBtn2 = testPage.locator('button:has-text("Continue"), button:has-text("Next")').first();
        await continueBtn2.click();

        // Step: Seats — switch to Passenger 1 and change their seat
        await testPage.waitForSelector('button:has-text("Laila")', { timeout: 5000 });
        await testPage.locator('button:has-text("Laila")').click();
        await testPage.waitForTimeout(200);

        // Click seat 15B for passenger 1
        const seat15b = testPage.locator('button[aria-label*="15B"]').first();
        await seat15b.waitFor({ state: "visible", timeout: 5000 });
        await seat15b.click();
        await testPage.waitForTimeout(200);

        // Verify the passenger button for Laila now reflects 15B
        const lailaBtn = testPage.locator('button:has-text("Laila")').first();
        const lailaBtnText = await lailaBtn.innerText();
        if (!lailaBtnText.includes("15B")) {
          throw new Error(`Expected passenger 1 seat to update to 15B in UI, got: "${lailaBtnText}"`);
        }

        // Navigate BACK from Seats to Details
        const backBtn1 = testPage.locator('button:has-text("Back"), button:has-text("السابق")').first();
        await backBtn1.click();
        await testPage.waitForSelector('#doc-0', { timeout: 5000 });

        // Navigate BACK from Details to Pax
        const backBtn2 = testPage.locator('button:has-text("Back"), button:has-text("السابق")').first();
        await backBtn2.click();
        await testPage.waitForSelector('#ci-pax-1', { timeout: 5000 });

        // DESELECT Passenger 1 (uncheck)
        if (await pax1Checkbox.isChecked()) {
          await testPage.locator('label[for="ci-pax-1"]').click();
        }
        if (await pax1Checkbox.isChecked()) {
          throw new Error("Failed to uncheck passenger 1");
        }
        if (!(await pax0Checkbox.isChecked())) {
          throw new Error("Passenger 0 should remain checked");
        }

        // Proceed forward: Pax -> Details
        await testPage.locator('button:has-text("Continue"), button:has-text("Next")').first().click();

        // Step: Details (only passenger 0 is active)
        await testPage.waitForSelector('#doc-0', { timeout: 5000 });
        if ((await testPage.locator('#doc-1').count()) > 0) {
          throw new Error("Deselected passenger 1 doc input should not appear in details step");
        }

        // Proceed forward: Details -> Seats
        await testPage.locator('button:has-text("Continue"), button:has-text("Next")').first().click();

        // Step: Seats -> Review
        await testPage.waitForSelector('button:has-text("Continue")', { timeout: 5000 });
        await testPage.locator('button:has-text("Continue")').first().click();

        // Step: Review -> Complete check-in
        await testPage.waitForSelector('button:has-text("Complete check-in")', { timeout: 5000 });
        await testPage.locator('button:has-text("Complete check-in")').first().click();

        // Verify done step
        await testPage.waitForSelector('text=Check-in complete', { timeout: 8000 });

        // Inspect canonical stored booking in localStorage
        const storedRepo = await testPage.evaluate(() => {
          const raw = localStorage.getItem("gza.repo.v1");
          return raw ? JSON.parse(raw) : null;
        });
        const storedBooking = storedRepo?.bookings?.find((b) => b.ref === "GZA-5C45");
        if (!storedBooking) {
          throw new Error("Booking GZA-5C45 not found in canonical storage");
        }

        // 1. checkedIn is exactly [0]
        if (JSON.stringify(storedBooking.checkedIn?.out) !== JSON.stringify([0])) {
          throw new Error(`Expected checkedIn.out to be [0], got: ${JSON.stringify(storedBooking.checkedIn?.out)}`);
        }

        // 2. Passenger 0 changes committed (new document, seat)
        if (storedBooking.passengers?.[0]?.document !== "DOC-TARIQ-NEW") {
          throw new Error(`Expected passenger 0 document 'DOC-TARIQ-NEW', got: ${storedBooking.passengers?.[0]?.document}`);
        }
        if (storedBooking.seats?.["out-0"] !== "11A") {
          throw new Error(`Expected passenger 0 seat '11A', got: ${storedBooking.seats?.["out-0"]}`);
        }

        // 3. Passenger 1 seat and document UNCHANGED
        if (storedBooking.passengers?.[1]?.document !== "DOC-LAILA-ORIG") {
          throw new Error(`Passenger 1 document was mutated! Expected 'DOC-LAILA-ORIG', got: ${storedBooking.passengers?.[1]?.document}`);
        }
        if (storedBooking.seats?.["out-1"] !== "11B") {
          throw new Error(`Passenger 1 seat was mutated! Expected '11B', got: ${storedBooking.seats?.["out-1"]}`);
        }
      } finally {
        await testContext.close();
      }
    });

    await checkStep("Check 46: HC-3 - EN Gallery: 42 documentary records, rights notice, dynamic filters, video modal, Escape dismissal, focus return, and whole-card links", async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      try {
        await page.goto(baseUrl + "/gallery", { waitUntil: "domcontentloaded" });

        // 1. Verify absence of seeded historical images or placeholder images
        const images = await page.locator("img").evaluateAll((imgs) => imgs.map((i) => i.src));
        for (const src of images) {
          if (src.includes("picsum.photos") || src.includes("placeholder")) {
            throw new Error(`Found seeded placeholder image in Gallery: ${src}`);
          }
        }

        // 2. Verify total catalog items: 38 photos/documents + 4 videos = 42 items
        const countBadge = page.locator(".code-id").first();
        await countBadge.waitFor({ state: "visible", timeout: 5000 });
        const countText = await countBadge.textContent();
        if (!countText.includes("42")) {
          throw new Error(`Expected 42 catalog items in Gallery, got: ${countText}`);
        }

        // 3. Verify concise public rights notice banner
        await page.locator("#main").getByText("Rights in historical photographs and footage remain with their respective owners", { exact: false }).waitFor({ state: "visible", timeout: 5000 });

        // 4. Verify contradictory gallery.noticeBody essay is completely absent
        const contradictoryEssay = page.locator("text=All historical documentary media published on this platform have undergone");
        if ((await contradictoryEssay.count()) > 0) {
          throw new Error("Contradictory gallery.noticeBody essay was still found rendered in EN Gallery");
        }

        // 5. Verify dynamic filter selects rendered (Medium, Era, Subject)
        const filterCategory = page.locator("#filter-category");
        const filterEra = page.locator("#filter-era");
        const filterSubject = page.locator("#filter-subject");
        await filterCategory.waitFor({ state: "visible", timeout: 5000 });
        await filterEra.waitFor({ state: "visible", timeout: 5000 });
        await filterSubject.waitFor({ state: "visible", timeout: 5000 });

        // 6. Test licensed Gisha photograph details, scroll lock, keyboard navigation, Escape dismissal, and focus-return
        const gishaCard = page.locator("li button[aria-haspopup='dialog']", {
          hasText: "Gaza International Airport Passenger Terminal Ruins",
        }).first();
        await gishaCard.scrollIntoViewIfNeeded();
        await gishaCard.click();
        const photoDialog = page.locator("[role='dialog']");
        await photoDialog.waitFor({ state: "visible", timeout: 5000 });

        // Verify documentary metadata details in Lightbox
        await photoDialog.locator("text=Gisha Access").first().waitFor({ state: "visible", timeout: 5000 });
        await photoDialog.locator("text=CC BY-SA 2.0 Generic").waitFor({ state: "visible", timeout: 5000 });
        await photoDialog.locator("text=2008-06-13").or(photoDialog.locator("text=June 13, 2008")).first().waitFor({ state: "visible", timeout: 5000 });
        await photoDialog.locator("text=src-gisha-2008").or(photoDialog.locator("text=Gisha Access")).first().waitFor({ state: "visible", timeout: 5000 });

        // Verify body scroll-lock
        const isBodyLocked = await page.evaluate(() => document.body.style.overflow === "hidden");
        if (!isBodyLocked) {
          throw new Error("Expected body overflow to be locked when dialog is open");
        }

        // Verify focus trapping inside dialog
        await page.keyboard.press("Tab");
        const focusedInside = await photoDialog.evaluate((dialog) => dialog.contains(document.activeElement));
        if (!focusedInside) {
          throw new Error("Focus escaped dialog during Tab navigation");
        }

        // Test LTR keyboard navigation: assert actual next/previous item identity change
        const initialTitle = await photoDialog.locator("h2").textContent();
        const initialPos = await photoDialog.locator("span.code-id").first().textContent();

        // ArrowRight advances to next item in LTR
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(200);
        const nextTitle = await photoDialog.locator("h2").textContent();
        const nextPos = await photoDialog.locator("span.code-id").first().textContent();
        if (nextTitle === initialTitle && nextPos === initialPos) {
          throw new Error(`ArrowRight in LTR did not advance item: was "${initialTitle}", still "${nextTitle}"`);
        }

        // ArrowLeft returns to initial item in LTR
        await page.keyboard.press("ArrowLeft");
        await page.waitForTimeout(200);
        const returnedTitle = await photoDialog.locator("h2").textContent();
        if (returnedTitle !== initialTitle) {
          throw new Error(`ArrowLeft in LTR did not return to initial item: expected "${initialTitle}", got "${returnedTitle}"`);
        }

        // Verify durable Escape dismissal, focus-return to trigger, and restored scroll state
        await page.keyboard.press("Escape");
        await photoDialog.waitFor({ state: "hidden", timeout: 5000 });
        let gishaFocused = false;
        for (let attempt = 0; attempt < 40 && !gishaFocused; attempt++) {
          gishaFocused = await gishaCard.evaluate((el) => el === document.activeElement);
          if (!gishaFocused) await page.waitForTimeout(50);
        }
        if (!gishaFocused) {
          throw new Error("Focus did not return to Gisha card trigger button after Escape dismissal");
        }

        // Verify body scroll-lock restored
        const isBodyRestored = await page.evaluate(() => document.body.style.overflow !== "hidden");
        if (!isBodyRestored) {
          throw new Error("Expected body overflow to be restored after dialog dismissal");
        }

        // 7. Test filter by Medium: "video" (External archival video)
        await filterCategory.selectOption("video");
        const filteredCards = page.locator("li button[aria-haspopup='dialog']");
        const videoCardCount = await filteredCards.count();
        if (videoCardCount !== 4) {
          throw new Error(`Expected 4 video cards after filtering by video medium, got: ${videoCardCount}`);
        }

        // 8. Open Video Lightbox modal and verify ArchiveVideoPlayer
        const firstVideoCard = filteredCards.first();
        await firstVideoCard.click();
        const videoDialog = page.locator("[role='dialog']");
        await videoDialog.waitFor({ state: "visible", timeout: 5000 });
        await videoDialog.getByText("Verified external reference", { exact: true }).waitFor({ state: "visible" });

        // Verify iframe created with youtube-nocookie.com/embed/ and NO autoplay
        const iframe = videoDialog.locator('iframe[src*="youtube-nocookie.com/embed/"]');
        await iframe.waitFor({ state: "visible", timeout: 5000 });
        const iframeSrc = await iframe.getAttribute("src");
        if (!iframeSrc || !iframeSrc.includes("youtube-nocookie.com/embed/")) {
          throw new Error(`Expected youtube-nocookie embed URL, got: ${iframeSrc}`);
        }
        if (iframeSrc.includes("autoplay=1")) {
          throw new Error(`ArchiveVideoPlayer iframe must not autoplay: ${iframeSrc}`);
        }

        // Verify iframe title attribute for accessibility
        const iframeTitle = await iframe.getAttribute("title");
        if (!iframeTitle || iframeTitle.trim().length === 0) {
          throw new Error("ArchiveVideoPlayer iframe missing accessible title");
        }

        // Verify durable Escape dismissal and focus-return for video dialog
        // Supported parent-dialog control flow: when focus is within parent dialog controls (e.g. close button),
        // Escape dismisses the dialog and returns focus to the originating card trigger.
        // (Note: when a user clicks/interacts inside a cross-origin YouTube iframe document, the browser prevents
        // key events from bubbling out of the isolated frame; accessible parent dialog controls remain navigable
        // via Tab or direct interaction, and dismissing returns focus to the trigger).
        const closeBtn = videoDialog.locator('button[aria-label*="Close"], button[aria-label*="إغلاق"]').first();
        await closeBtn.focus();
        await page.keyboard.press("Escape");
        await videoDialog.waitFor({ state: "hidden", timeout: 5000 });
        let videoFocused = false;
        // Exit animation and Radix focus restoration need not finish on the same frame.
        for (let attempt=0; attempt<40 && !videoFocused; attempt++) {
          videoFocused = await firstVideoCard.evaluate((el) => el === document.activeElement);
          if (!videoFocused) await page.waitForTimeout(50);
        }
        if (!videoFocused) {
          throw new Error("Focus did not return to video card trigger after Escape dismissal");
        }

        // Reset filter
        await filterCategory.selectOption("all");

        // 9. Verify absence of held records in Gallery list
        const heldCount = await page.locator(".code-id:has-text('past-001'), .code-id:has-text('past-002'), .code-id:has-text('past-013'), .code-id:has-text('past-052')").count();
        if (heldCount > 0) {
          throw new Error("Held or duplicate record IDs leaked into Gallery items");
        }

        // 10. Verify whole-card safe external links for sources
        const sourceLinks = page.locator("section a[href^='http']");
        const sourceCount = await sourceLinks.count();
        if (sourceCount < 4) {
          throw new Error(`Expected at least 4 source link cards, got: ${sourceCount}`);
        }
        const firstSource = sourceLinks.first();
        const target = await firstSource.getAttribute("target");
        const rel = await firstSource.getAttribute("rel");
        if (target !== "_blank" || !rel?.includes("noopener")) {
          throw new Error(`Source card link missing safe target/rel: target=${target}, rel=${rel}`);
        }
      } finally {
        await page.close();
      }
    });

    await checkStep("Check 47: HC-3 - AR Gallery: RTL directionality, Arabic metadata, rights notice, Escape dismissal, and LTR identifiers", async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      try {
        await page.goto(baseUrl + "/ar/gallery", { waitUntil: "domcontentloaded" });

        // 1. Verify RTL dir
        const htmlDir = await page.locator("html").getAttribute("dir");
        if (htmlDir !== "rtl") {
          throw new Error(`Expected dir="rtl" on /ar/gallery, got: ${htmlDir}`);
        }

        // 2. Verify Arabic title and 42 items count
        await page.waitForSelector("text=الأرشيف", { timeout: 5000 });
        const countBadge = page.locator(".code-id").first();
        await countBadge.waitFor({ state: "visible", timeout: 5000 });
        const countText = await countBadge.textContent();
        if (!countText.includes("42")) {
          throw new Error(`Expected 42 catalog items in Arabic Gallery, got: ${countText}`);
        }

        // 3. Verify Arabic concise public rights notice banner
        await page.locator("#main").getByText("تبقى حقوق الصور والتسجيلات التاريخية لأصحابها، وتُذكر الاعتمادات حيثما كانت معروفة", { exact: false }).waitFor({ state: "visible", timeout: 5000 });

        // 4. Verify contradictory Arabic gallery.noticeBody essay is absent
        const contradictoryArEssay = page.locator("text=خضعت جميع الوسائط الوثائقية التاريخية المنشورة");
        if ((await contradictoryArEssay.count()) > 0) {
          throw new Error("Contradictory Arabic gallery.noticeBody essay was still found rendered in AR Gallery");
        }

        // 5. Verify Arabic filter selects rendered
        await page.locator("#filter-category").waitFor({ state: "visible", timeout: 5000 });
        await page.locator("#filter-era").waitFor({ state: "visible", timeout: 5000 });
        await page.locator("#filter-subject").waitFor({ state: "visible", timeout: 5000 });

        // 6. Open Lightbox in Arabic, verify RTL semantics, Escape dismissal, and focus-return
        const cardTrigger = page.locator("li button[aria-haspopup='dialog']").first();
        await cardTrigger.click();
        const dialog = page.locator("[role='dialog']");
        await dialog.waitFor({ state: "visible", timeout: 5000 });

        // Verify Arabic labels inside modal: no hardcoded English "Date"
        await dialog.locator("text=الوسيط").first().waitFor({ state: "visible", timeout: 5000 });
        await dialog.locator("text=الحقبة التاريخية").first().waitFor({ state: "visible", timeout: 5000 });
        const englishDateLabelCount = await dialog.locator("dt:has-text('Date')").count();
        if (englishDateLabelCount > 0) {
          throw new Error("Found hardcoded English 'Date' label inside Arabic Lightbox modal");
        }

        // Verify body scroll-lock in Arabic
        const isArBodyLocked = await page.evaluate(() => document.body.style.overflow === "hidden");
        if (!isArBodyLocked) {
          throw new Error("Expected body overflow to be locked when Arabic dialog is open");
        }

        // Verify focus trapping inside Arabic dialog
        await page.keyboard.press("Tab");
        const focusedInsideAr = await dialog.evaluate((d) => d.contains(document.activeElement));
        if (!focusedInsideAr) {
          throw new Error("Focus escaped Arabic dialog during Tab navigation");
        }

        // Test RTL keyboard navigation: ArrowLeft advances in RTL, ArrowRight returns
        const initialArTitle = await dialog.locator("h2").textContent();
        const initialArPos = await dialog.locator("span.code-id").first().textContent();

        // ArrowLeft advances to next item in RTL
        await page.keyboard.press("ArrowLeft");
        await page.waitForTimeout(200);
        const nextArTitle = await dialog.locator("h2").textContent();
        const nextArPos = await dialog.locator("span.code-id").first().textContent();
        if (nextArTitle === initialArTitle && nextArPos === initialArPos) {
          throw new Error(`ArrowLeft in RTL did not advance item: was "${initialArTitle}", still "${nextArTitle}"`);
        }

        // ArrowRight returns to initial item in RTL
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(200);
        const returnedArTitle = await dialog.locator("h2").textContent();
        if (returnedArTitle !== initialArTitle) {
          throw new Error(`ArrowRight in RTL did not return to initial item: expected "${initialArTitle}", got "${returnedArTitle}"`);
        }

        // Close via Escape key and verify focus returns to trigger
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden", timeout: 5000 });
        await page.waitForFunction(node => document.activeElement === node, await cardTrigger.elementHandle(), { timeout: 5000 });
        const arFocused = await cardTrigger.evaluate((el) => el === document.activeElement);
        if (!arFocused) {
          throw new Error("Focus did not return to Arabic card trigger after Escape dismissal");
        }

        // Verify body scroll-lock restored
        const isArBodyRestored = await page.evaluate(() => document.body.style.overflow !== "hidden");
        if (!isArBodyRestored) {
          throw new Error("Expected body overflow to be restored after Arabic dialog dismissal");
        }

        // 7. Verify close button also works cleanly
        await cardTrigger.click();
        await dialog.waitFor({ state: "visible", timeout: 5000 });
        const closeBtn = dialog.locator('button[aria-label*="Close"], button[aria-label*="إغلاق"]').first();
        await closeBtn.click();
        await dialog.waitFor({ state: "hidden", timeout: 5000 });

        // 8. Arabic video modal test: filter by video, open, Escape dismissal, and focus-return
        await page.locator("#filter-category").selectOption("video");
        const arVideoCards = page.locator("li button[aria-haspopup='dialog']");
        const arVideoCount = await arVideoCards.count();
        if (arVideoCount !== 4) {
          throw new Error(`Expected 4 video cards in Arabic Gallery, got: ${arVideoCount}`);
        }
        const firstArVideoCard = arVideoCards.first();
        await firstArVideoCard.click();
        const arVideoDialog = page.locator("[role='dialog']");
        await arVideoDialog.waitFor({ state: "visible", timeout: 5000 });
        await arVideoDialog.getByText("مرجع خارجي موثّق", { exact: true }).waitFor({ state: "visible" });

        // Verify Arabic video dialog close control receives focus and Escape dismisses with focus return
        const arVideoCloseBtn = arVideoDialog.locator('button[aria-label*="Close"], button[aria-label*="إغلاق"]').first();
        await arVideoCloseBtn.focus();
        await page.keyboard.press("Escape");
        await arVideoDialog.waitFor({ state: "hidden", timeout: 5000 });
        await page.waitForFunction(node => document.activeElement === node, await firstArVideoCard.elementHandle(), {timeout:5000});
        const arVideoFocused = await firstArVideoCard.evaluate((el) => el === document.activeElement);
        if (!arVideoFocused) {
          throw new Error("Focus did not return to Arabic video card trigger after Escape dismissal");
        }

        // Reset filter
        await page.locator("#filter-category").selectOption("all");

        // 9. External sources in Arabic: verify Arabic notes and video watch label
        await page.locator("text=شاهد في المصدر الأصلي").first().waitFor({ state: "visible", timeout: 5000 });
      } finally {
        await page.close();
      }
    });

    await checkStep("Check 48: HC-3 - Airport Past: documentary strips, watch archive video section, and safe source cards", async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      try {
        // EN /airport/past
        await page.goto(baseUrl + "/airport/past", { waitUntil: "domcontentloaded" });

        // 1. Hero is documentary hero (airport-archive-hero-2000)
        const heroSection = page.locator('section[data-public-hero="past"]');
        await heroSection.waitFor({ state: "visible", timeout: 5000 });
        const heroImg = heroSection.locator("img").first();
        const heroSrc = await heroImg.getAttribute("src");
        if (heroSrc && heroSrc.includes("airport-archive-hall")) {
          throw new Error(`Past hero is using seeded airport-archive-hall: ${heroSrc}`);
        }

        // 2. Timeline chapters contain legitimate 7 documentary strip photos across chapters
        const timelinePhotos = page.locator("ol figure img");
        const photoCount = await timelinePhotos.count();
        if (photoCount !== 7) {
          throw new Error(`Expected exactly 7 legitimate documentary strip photos across timeline, got: ${photoCount}`);
        }

        // Verify exact chapter photo distribution derived from canonical relatedTimelineEventIds:
        // Planning (1994-1997): 0 photos
        const planningPhotos = await page.locator('li[data-timeline-id="planning"] figure').count();
        if (planningPhotos !== 0) {
          throw new Error(`Expected 0 photos under Planning chapter, got: ${planningPhotos}`);
        }

        // Opening (1998): 0 photos
        const openingPhotos = await page.locator('li[data-timeline-id="opening"] figure').count();
        if (openingPhotos !== 0) {
          throw new Error(`Expected 0 photos under Opening chapter, got: ${openingPhotos}`);
        }

        // Operations (1998-2001): 5 photos (past-007, past-045, past-050, past-051, past-054)
        const operationsPhotos = page.locator('li[data-timeline-id="operations"] figure');
        const operationsCount = await operationsPhotos.count();
        if (operationsCount !== 5) {
          throw new Error(`Expected 5 photos under Operations chapter, got: ${operationsCount}`);
        }
        const opTexts = await operationsPhotos.evaluateAll((figs) => figs.map((f) => f.textContent || ""));
        const opHasCounters = opTexts.some((t) => t.includes("Passenger processing counters") || t.includes("counters"));
        const opHasSecurity = opTexts.some((t) => t.includes("Passenger security screening") || t.includes("screening"));
        if (!opHasCounters || !opHasSecurity) {
          throw new Error("Operations chapter missing expected counters or security screening photos");
        }

        // Closure (2000-2002): exactly 1 photo (past-026 ruined colonnade), strictly excluding past-045 and past-051
        const closurePhotos = page.locator('li[data-timeline-id="closure"] figure');
        const closureCount = await closurePhotos.count();
        if (closureCount !== 1) {
          throw new Error(`Expected exactly 1 photo under Closure chapter, got: ${closureCount}`);
        }
        const closureText = await closurePhotos.first().textContent() || "";
        if (!closureText.includes("Ruined airport colonnade") && !closureText.includes("colonnade")) {
          throw new Error(`Closure chapter has unexpected photo: "${closureText}"`);
        }
        if (closureText.includes("Passenger processing") || closureText.includes("security screening")) {
          throw new Error(`Closure chapter illegally contains counters or security equipment: "${closureText}"`);
        }

        // Memory (2002-present): 1 photo (rec-present-ruins-2008 / Gisha ruins)
        const memoryPhotos = page.locator('li[data-timeline-id="memory"] figure');
        const memoryCount = await memoryPhotos.count();
        if (memoryCount !== 1) {
          throw new Error(`Expected 1 photo under Memory chapter, got: ${memoryCount}`);
        }
        const memoryText = await memoryPhotos.first().textContent() || "";
        if (!memoryText.includes("Passenger Terminal Ruins") && !memoryText.includes("Gisha")) {
          throw new Error(`Memory chapter missing Gisha ruins photo: "${memoryText}"`);
        }

        // Absence of held/duplicate records across timeline
        const heldInTimeline = await page.locator("ol figure").evaluateAll((figs) =>
          figs.some((f) => {
            const t = f.textContent || "";
            return t.includes("past-001") || t.includes("past-002") || t.includes("past-013") || t.includes("past-052");
          })
        );
        if (heldInTimeline) {
          throw new Error("Held or duplicate records leaked into Past timeline");
        }

        // 3. Watch the archive / شاهد الأرشيف section exists with 4 verified videos
        await page.locator("text=Watch the archive").waitFor({ state: "visible", timeout: 5000 });
        const videoCards = page.locator("section[aria-labelledby='watch-archive-heading'] [data-testid='video-facade'], section[aria-labelledby='watch-archive-heading'] iframe");
        const videoCardCount = await videoCards.count();
        if (videoCardCount < 4) {
          throw new Error(`Expected 4 verified video cards in Watch the archive section, got: ${videoCardCount}`);
        }

        // 4. Sources panel uses safe whole-card links with no nested interactive tags
        const sourceCards = page.locator(".border-clay\\/20 a[href^='http']");
        const sourceCardCount = await sourceCards.count();
        if (sourceCardCount < 4) {
          throw new Error(`Expected at least 4 source cards in Sources panel, got: ${sourceCardCount}`);
        }
        for (let i = 0; i < sourceCardCount; i++) {
          const card = sourceCards.nth(i);
          const nestedLinks = await card.locator("a, button").count();
          if (nestedLinks > 0) {
            throw new Error(`Source card at index ${i} contains illegal nested interactive elements`);
          }
        }

        // AR /ar/airport/past
        await page.goto(baseUrl + "/ar/airport/past", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("text=شاهد الأرشيف", { timeout: 5000 });
        const arTimelinePhotos = page.locator("ol figure img");
        const arPhotoCount = await arTimelinePhotos.count();
        if (arPhotoCount !== 7) {
          throw new Error(`Expected exactly 7 documentary strip photos in Arabic timeline, got: ${arPhotoCount}`);
        }

        // Verify Arabic chapter distribution: 0 planning, 0 opening, 5 operations, 1 closure, 1 memory
        const arPlanningCount = await page.locator('li[data-timeline-id="planning"] figure').count();
        const arOpeningCount = await page.locator('li[data-timeline-id="opening"] figure').count();
        const arOperationsCount = await page.locator('li[data-timeline-id="operations"] figure').count();
        const arClosureCount = await page.locator('li[data-timeline-id="closure"] figure').count();
        const arMemoryCount = await page.locator('li[data-timeline-id="memory"] figure').count();

        if (arPlanningCount !== 0 || arOpeningCount !== 0) {
          throw new Error(`Arabic timeline has unexpected photos in planning (${arPlanningCount}) or opening (${arOpeningCount})`);
        }
        if (arOperationsCount !== 5) {
          throw new Error(`Expected 5 photos under Arabic Operations chapter, got: ${arOperationsCount}`);
        }
        if (arClosureCount !== 1) {
          throw new Error(`Expected 1 photo under Arabic Closure chapter, got: ${arClosureCount}`);
        }
        if (arMemoryCount !== 1) {
          throw new Error(`Expected 1 photo under Arabic Memory chapter, got: ${arMemoryCount}`);
        }
      } finally {
        await page.close();
      }
    });

    await checkStep("Check 49: HC-3 - Home & Airport Overview: real historical media, no redundant CTA, and 6 featured preview cards", async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      try {
        // EN Home /
        await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });

        // 1. Verify absence of seeded Picsum / placeholder images
        const homeImgs = await page.locator("img").evaluateAll((imgs) => imgs.map((i) => i.src));
        for (const src of homeImgs) {
          if (src.includes("picsum.photos")) {
            throw new Error(`Found picsum photo on Home: ${src}`);
          }
        }

        // 2. Verify "Read this chapter" is NOT present on chapter cards
        const readChapterCount = await page.locator("text=Read this chapter").count();
        if (readChapterCount > 0) {
          throw new Error(`Found redundant 'Read this chapter' text on Home: count=${readChapterCount}`);
        }

        // 3. Verify Home archive preview section renders exactly 6 featured records
        const previewCards = page.locator("section[data-testid='home-archive-preview'] ul li");
        const previewCount = await previewCards.count();
        if (previewCount !== 6) {
          throw new Error(`Expected exactly 6 featured preview cards on Home, got: ${previewCount}`);
        }

        // EN Airport Overview /airport
        await page.goto(baseUrl + "/airport", { waitUntil: "domcontentloaded" });
        const airportReadChapterCount = await page.locator("text=Read this chapter").count();
        if (airportReadChapterCount > 0) {
          throw new Error(`Found redundant 'Read this chapter' text on /airport: count=${airportReadChapterCount}`);
        }

        // AR Home /ar
        await page.goto(baseUrl + "/ar", { waitUntil: "domcontentloaded" });
        const arReadChapterCount = await page.locator("text=اقرأ هذا الفصل").count();
        if (arReadChapterCount > 0) {
          throw new Error(`Found redundant 'اقرأ هذا الفصل' text on /ar: count=${arReadChapterCount}`);
        }
      } finally {
        await page.close();
      }
    });

    await checkStep("Check 50: HC-3 - Airport Future: textured text halves, no repeated design intent, tightened copy, and textured captions", async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      try {
        await page.goto(baseUrl + "/airport/future", { waitUntil: "domcontentloaded" });

        // 1. Verify designIntentText is NOT present anywhere on the page
        const designIntentTextCount = await page.locator("text=Civic warmth, Mediterranean climate adaptation").count();
        if (designIntentTextCount > 0) {
          throw new Error(`Found repeated design intent text on /airport/future: count=${designIntentTextCount}`);
        }

        // 2. Verify tightened copy rendered
        await page.locator("text=Terminal concepts feature Mediterranean limestone").waitFor({ state: "visible", timeout: 5000 });
        await page.locator("text=Guest experience prioritizes ease and dignity").waitFor({ state: "visible", timeout: 5000 });
        await page.locator("text=A structured airside strategy: 3,080 m runway reconstruction").waitFor({ state: "visible", timeout: 5000 });

        // 3. Verify night study sequence caption styling
        const nightCaptions = page.locator("figcaption");
        const nightCaptionCount = await nightCaptions.count();
        if (nightCaptionCount < 6) {
          throw new Error(`Expected at least 6 night study captions, got: ${nightCaptionCount}`);
        }

        // AR /ar/airport/future
        await page.goto(baseUrl + "/ar/airport/future", { waitUntil: "domcontentloaded" });
        const arDesignIntentCount = await page.locator("text=دفء مدني، وتكيف مع المناخ المتوسطي").count();
        if (arDesignIntentCount > 0) {
          throw new Error(`Found repeated Arabic design intent text on /ar/airport/future: count=${arDesignIntentCount}`);
        }
      } finally {
        await page.close();
      }
    });

    await checkStep("Check 51: HC-3 - Media Invariants: external video embeds never become local media files", async () => {
      // 1. Verify no video files exist in the media catalog or public directory
      const fs = await import("fs");
      const path = await import("path");
      const documentaryDir = path.resolve("src/assets/media/documentary/past");
      if (fs.existsSync(documentaryDir)) {
        const files = fs.readdirSync(documentaryDir);
        for (const file of files) {
          if (file.endsWith(".mp4") || file.endsWith(".webm") || file.endsWith(".mkv")) {
            throw new Error(`Forbidden video file found in media directory: ${file}`);
          }
        }
      }

      // 2. Verify all verified video references use HTTPS and YouTube domain
      const { pathToFileURL } = await import("url");
      const catalogModule = await import(pathToFileURL(path.resolve("src/lib/archive/catalog.ts")).href);
      const videos = catalogModule.getVerifiedVideoReferences();
      if (!videos || videos.length !== 4) {
        throw new Error(`Expected 4 verified video references, got: ${videos?.length}`);
      }
      for (const v of videos) {
        if (!v.url.startsWith("https://www.youtube.com/watch?v=")) {
          throw new Error(`Invalid external video URL: ${v.url}`);
        }
        if (!v.youtubeId || v.youtubeId.length !== 11) {
          throw new Error(`Invalid YouTube ID format: ${v.youtubeId}`);
        }
      }
    });

    await checkStep("Check 52: HC-3 - Bilingual public archive notices distinguish display from rights clearance", async () => {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      try {
        for (const locale of ["", "/ar"]) {
          for (const route of ["/gallery", "/airport", "/airport/past", "/about", "/privacy", "/terms"]) {
            await page.goto(baseUrl + locale + route, { waitUntil: "domcontentloaded" });
            const rightsText = locale
              ? "تبقى حقوق الصور والتسجيلات التاريخية لأصحابها"
              : "Rights in historical photographs and footage remain with their respective owners";
            await page.getByText(rightsText, { exact: false }).first().waitFor({ state: "attached", timeout: 5000 });
            const text = await page.locator("body").innerText();
            if (/Cleared documentary photography|Unverified intake imagery remains held|unverified intake imagery remains held in staging|intake materials remain staged and held|صوراً مؤقتة إلى حين توفير مصادر موثّقة/.test(text)) {
              throw new Error(`Obsolete universal clearance/hold claim on ${locale}${route}`);
            }
            const futureDisclosure = locale
              ? "صور المستقبل توضيحية وليست أدلة تاريخية"
              : "Future imagery is illustrative, not historical evidence";
            if (!text.includes(futureDisclosure)) {
              throw new Error(`Missing Future illustrative disclosure on ${locale}${route}`);
            }
            if (["/airport", "/about", "/privacy", "/terms"].includes(route)) {
              const unknownRights = locale ? "لم تُثبت حقوق إعادة استخدامها" : "reuse rights remain unconfirmed";
              if (!text.includes(unknownRights)) {
                throw new Error(`Missing unknown reuse-rights disclosure on ${locale}${route}`);
              }
            }
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
            if (overflow) throw new Error(`Archive copy causes mobile overflow on ${locale}${route}`);
          }
        }
      } finally {
        await page.close();
      }
    });

    await checkStep("Check 53: Phase 5D — English public contact submission, storage verification, truthful prototype success, and same-browser admin inbox workflow", async () => {
      const context = await browser.newContext();
      try {
        await context.addInitScript(() => {
          localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
        });
        const page = await context.newPage({ viewport: { width: 1440, height: 900 } });

        // 1. Visit /contact
        await page.goto(baseUrl + "/contact", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("#c-name", { timeout: 10000 });

        // 2. Fill form
        await waitForInteractiveInput(page, "#c-name");
        await page.fill("#c-name", "Aya Mansour");
        await page.fill("#c-email", "aya.mansour@example.ps");
        await page.selectOption("#c-subject", "booking");
        await page.fill("#c-booking-ref", "gza7k8");
        await page.fill("#c-message", "Inquiring about special assistance options for my upcoming journey from Gaza International Airport.");

        // 3. Submit
        await page.click('button[type="submit"]');

        // 4. Verify truthful success
        await page.getByText("Enquiry saved").waitFor({ state: "visible", timeout: 8000 });
        await page.getByText("Your enquiry has been saved in this browser for workflow testing. This prototype does not transmit messages to an airport support team yet.").waitFor({ state: "visible", timeout: 5000 });

        // Verify URL has no PII
        const currentUrl = page.url();
        if (currentUrl.includes("aya.mansour") || currentUrl.includes("Aya")) {
          throw new Error("URL contains PII query parameters: " + currentUrl);
        }

        // 5. Inspect localStorage
        const contactStorageRaw = await page.evaluate(() => localStorage.getItem("gza.contact.v1"));
        if (!contactStorageRaw) {
          throw new Error("Expected gza.contact.v1 to be populated in localStorage");
        }
        const contactEnvelope = JSON.parse(contactStorageRaw);
        const submitted = contactEnvelope.messages.find((m) => m.senderName === "Aya Mansour");
        if (!submitted) {
          throw new Error("Submitted message not found in gza.contact.v1 envelope");
        }
        if (submitted.bookingRef !== "GZA7K8") {
          throw new Error(`Expected uppercase bookingRef GZA7K8, got ${submitted.bookingRef}`);
        }
        if (submitted.status !== "new") {
          throw new Error(`Expected status 'new', got ${submitted.status}`);
        }

        // 6. Navigate to Admin Inbox
        await page.goto(baseUrl + "/admin/inbox", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("button:has-text('Aya Mansour')", { timeout: 10000 });

        // Verify nav badge indicates new messages count
        const badge = page.locator("a[href*='/admin/inbox'] span:has-text('2')"); // 1 seed (m1) + 1 new = 2
        await badge.first().waitFor({ state: "visible", timeout: 5000 });

        // Select the new message
        await page.click("button:has-text('Aya Mansour')");
        await page.getByText("GZA7K8").first().waitFor({ state: "visible", timeout: 5000 });

        // 7. Workflow Actions: Mark Open
        await page.getByRole("button", { name: "Mark open" }).click();
        await page.locator("span.rounded-md:has-text('Open')").first().waitFor({ state: "visible", timeout: 5000 });

        // Badge decrements to 1 (only m1 left as new)
        const updatedBadge = page.locator("a[href*='/admin/inbox'] span:has-text('1')");
        await updatedBadge.first().waitFor({ state: "visible", timeout: 5000 });

        // 8. Add Internal Note
        await page.fill('textarea[placeholder*="internal staff note"]', "Contacted passenger via phone.");
        await page.getByRole("button", { name: "Add internal note" }).click();
        await page.getByText("Contacted passenger via phone.").waitFor({ state: "visible", timeout: 5000 });

        // 9. Assign staff
        await page.getByRole("button", { name: "Assign to me" }).click();
        await page.getByText("Assigned to:").first().waitFor({ state: "visible", timeout: 5000 });
        await page.getByRole("button", { name: "Unassign" }).waitFor({ state: "visible", timeout: 5000 });

        // 10. Reply Draft
        await waitForInteractiveInput(page, "#in-reply-draft");
        await page.fill("#in-reply-draft", "Dear Aya, ramp assistance has been noted for your flight.");
        await page.getByRole("button", { name: "Save reply draft" }).click();
        await page.waitForFunction(id => JSON.parse(localStorage.getItem("gza.contact.v1") || "{}").messages?.find(message => message.id === id)?.replyDraft === "Dear Aya, ramp assistance has been noted for your flight.", submitted.id);

        // 11. Reload and verify persistence
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector("button:has-text('Aya Mansour')", { timeout: 10000 });
        await page.click("button:has-text('Aya Mansour')");

        await page.getByText("Contacted passenger via phone.").waitFor({ state: "visible", timeout: 5000 });
        await page.waitForFunction(() => document.getElementById("in-reply-draft")?.value === "Dear Aya, ramp assistance has been noted for your flight.");
        const draftValue = await page.inputValue("#in-reply-draft");
        if (!draftValue.includes("ramp assistance has been noted")) {
          throw new Error(`Expected persisted reply draft, got: "${draftValue}"`);
        }

        // Clear reply draft
        await page.getByRole("button", { name: "Clear draft" }).click();
        await page.waitForFunction(() => document.getElementById("in-reply-draft")?.value === "");

        // 12. Verify public /contact does NOT expose internal notes
        await page.goto(baseUrl + "/contact", { waitUntil: "domcontentloaded" });
        const publicBody = await page.innerText("body");
        if (publicBody.includes("Contacted passenger via phone") || publicBody.includes("ramp assistance has been noted")) {
          throw new Error("Internal note or draft reply leaked to public contact page!");
        }
      } finally {
        await context.close();
      }
    });

    await checkStep("Check 54: Phase 5D — Arabic public contact submission, RTL directionality, raw Arabic storage without translation, and bilingual Admin rendering", async () => {
      const context = await browser.newContext();
      try {
        await context.addInitScript(() => {
          localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
        });
        const page = await context.newPage({ viewport: { width: 1440, height: 900 } });

        // 1. Visit /ar/contact
        await page.goto(baseUrl + "/ar/contact", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("#c-name", { timeout: 10000 });

        // Check Arabic labels
        await page.getByText("الاسم").first().waitFor({ state: "visible", timeout: 5000 });
        await page.getByText("البريد الإلكتروني").first().waitFor({ state: "visible", timeout: 5000 });

        // Fill Arabic enquiry
        await page.fill("#c-name", "طارق النجار");
        await page.fill("#c-email", "tariq.najjar@example.ps");
        await page.selectOption("#c-subject", "accessibility");
        await page.fill("#c-booking-ref", "GZA9B2");
        await page.fill("#c-message", "أود الاستفسار عن كراسي الحركة المتاحة لكبار السن داخل صالة المغادرة.");

        // Submit
        await page.click('button[type="submit"]');

        // Verify Arabic truthful success
        await page.getByText("تم حفظ الاستفسار").waitFor({ state: "visible", timeout: 8000 });
        await page.getByText("تم حفظ استفسارك في هذا المتصفح لاختبار سير العمل.").waitFor({ state: "visible", timeout: 5000 });

        // 2. Check localStorage: message is raw Arabic, NO fake English translation
        const rawStorage = await page.evaluate(() => localStorage.getItem("gza.contact.v1"));
        const envelope = JSON.parse(rawStorage || "{}");
        const arMsg = envelope.messages.find((m) => m.senderName === "طارق النجار");
        if (!arMsg) {
          throw new Error("Arabic message not found in localStorage");
        }
        if (arMsg.language !== "ar") {
          throw new Error(`Expected language 'ar', got: ${arMsg.language}`);
        }
        if (!arMsg.message.includes("كراسي الحركة المتاحة")) {
          throw new Error(`Expected raw Arabic body, got: ${arMsg.message}`);
        }

        // 3. Open English Admin Inbox /admin/inbox and verify Arabic message rendering
        await page.goto(baseUrl + "/admin/inbox", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("button:has-text('طارق النجار')", { timeout: 10000 });
        await page.click("button:has-text('طارق النجار')");

        // Verify message body has dir="rtl"
        const messageDir = await page.evaluate(() => {
          const bodyEl = document.querySelector(".bg-sand");
          return bodyEl ? bodyEl.getAttribute("dir") : null;
        });
        if (messageDir !== "rtl") {
          throw new Error(`Expected message body in English Admin to have dir="rtl", got: "${messageDir}"`);
        }

        // Verify identifiers remain LTR
        const emailEl = page.locator("text=tariq.najjar@example.ps");
        await emailEl.first().waitFor({ state: "visible", timeout: 5000 });

        // 4. Open Arabic Admin Inbox /ar/admin/inbox
        await page.goto(baseUrl + "/ar/admin/inbox", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("button:has-text('طارق النجار')", { timeout: 10000 });
        await page.getByText("صندوق الرسائل").first().waitFor({ state: "visible", timeout: 5000 });
      } finally {
        await context.close();
      }
    });

    await checkStep("Check 55: Phase 5D — Settings Preview isolation and raw Contact storage immunity in both locales", async () => {
      const context = await browser.newContext();
      try {
        const page = await context.newPage({ viewport: { width: 1440, height: 900 } });

        // Seed a known contact storage
        await page.goto(baseUrl + "/contact", { waitUntil: "domcontentloaded" });
        const baselineStorage = await page.evaluate(() => {
          const initial = {
            schemaVersion: 1,
            revision: 3,
            messages: [
              {
                id: "imm-1",
                submissionId: "imm-sub-1",
                senderName: "Static Test",
                email: "test@example.com",
                topic: "other",
                message: "This storage must remain untouched during preview.",
                language: "en",
                status: "open",
                createdAt: "2026-09-20T10:00:00.000Z",
                updatedAt: "2026-09-20T10:00:00.000Z",
                source: "public-contact",
                internalNotes: [],
              },
            ],
          };
          localStorage.setItem("gza.contact.v1", JSON.stringify(initial));
          return localStorage.getItem("gza.contact.v1");
        });

        // 1. Visit /contact?settingsPreview=1
        await page.goto(baseUrl + "/contact?settingsPreview=1", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("#c-name", { timeout: 10000 });
        await page.waitForLoadState("load");
        await page.waitForTimeout(350);

        // Fill and submit preview contact form
        await page.fill("#c-name", "Preview Submitter");
        await page.fill("#c-email", "preview@example.com");
        await page.selectOption("#c-subject", "media");
        await page.fill("#c-message", "Testing contact submission during settings preview mode.");
        await page.click('button[type="submit"]');

        // Visual success displayed
        await page.getByText("Enquiry preview", { exact: true }).waitFor({ state: "visible", timeout: 8000 });

        // Verify localStorage gza.contact.v1 is byte-for-byte identical!
        const afterEnStorage = await page.evaluate(() => localStorage.getItem("gza.contact.v1"));
        if (afterEnStorage !== baselineStorage) {
          throw new Error("gza.contact.v1 was mutated during English ?settingsPreview=1 submission!");
        }

        // 2. Visit /ar/contact?settingsPreview=1
        await page.goto(baseUrl + "/ar/contact?settingsPreview=1", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("#c-name", { timeout: 10000 });
        await page.waitForLoadState("load");
        await page.waitForTimeout(350);

        await page.fill("#c-name", "مجرّب المعاينة");
        await page.fill("#c-email", "preview-ar@example.com");
        await page.selectOption("#c-subject", "media");
        await page.fill("#c-message", "تجربة إرسال النموذج في وضع معاينة الإعدادات.");
        await page.click('button[type="submit"]');

        await page.getByText("معاينة الاستفسار", { exact: true }).waitFor({ state: "visible", timeout: 8000 });

        const afterArStorage = await page.evaluate(() => localStorage.getItem("gza.contact.v1"));
        if (afterArStorage !== baselineStorage) {
          throw new Error("gza.contact.v1 was mutated during Arabic ?settingsPreview=1 submission!");
        }
      } finally {
        await context.close();
      }
    });

    await checkStep("Check 56: Phase 5D — Domain validation errors, persistence failure retry, and submission idempotency", async () => {
      const context = await browser.newContext();
      try {
        const page = await context.newPage({ viewport: { width: 1440, height: 900 } });
        await page.goto(baseUrl + "/contact", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("#c-name", { timeout: 10000 });

        // 1. Submit empty form -> check field validation errors
        await page.click('button[type="submit"]');
        const alertElements = page.locator('[role="alert"]');
        const count = await alertElements.count();
        if (count < 2) {
          throw new Error(`Expected validation alerts for required fields, got: ${count}`);
        }

        // Fill form fields
        await page.fill("#c-name", "Hala Shawa");
        await page.fill("#c-email", "hala@example.ps");
        await page.selectOption("#c-subject", "baggage");
        await page.fill("#c-message", "My baggage arrived damaged on flight PS204.");

        // 2. Simulate storage quota failure
        await page.evaluate(() => {
          window.__origSetItem = Storage.prototype.setItem;
          Storage.prototype.setItem = () => {
            throw new Error("QuotaExceededError: Local storage is full");
          };
        });

        // Submit with failing storage
        await page.click('button[type="submit"]');
        await page.locator('[role="alert"]').first().waitFor({ state: "visible", timeout: 5000 });

        // Verify fields are preserved after failed save!
        const retainedName = await page.inputValue("#c-name");
        const retainedMessage = await page.inputValue("#c-message");
        if (retainedName !== "Hala Shawa" || !retainedMessage.includes("baggage arrived damaged")) {
          throw new Error("Form input fields were cleared on storage save failure!");
        }

        // 3. Restore storage and retry
        await page.evaluate(() => {
          if (window.__origSetItem) {
            Storage.prototype.setItem = window.__origSetItem;
          }
        });

        await page.click('button[type="submit"]');
        await page.getByText("Enquiry saved").waitFor({ state: "visible", timeout: 8000 });
      } finally {
        await context.close();
      }
    });

    await checkStep("Check 57: Phase 5D — View-only permissions, genuine empty inbox handling, and reactive dashboard attention convergence", async () => {
      const context = await browser.newContext();
      try {
        // 1. View-only staff (Layla Odeh, role: viewer)
        await context.addInitScript(() => {
          localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-3", overrides: {} }));
        });
        const page = await context.newPage({ viewport: { width: 1440, height: 900 } });

        await page.goto(baseUrl + "/admin/inbox", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("button:has-text('Nadia Sabbagh')", { timeout: 10000 });
        await page.click("button:has-text('Nadia Sabbagh')");

        // Action buttons must have disabled or restricted permission state for viewer
        const markOpenBtn = page.getByRole("button", { name: "Mark open" });
        const isDisabled = await markOpenBtn.getAttribute("disabled");
        const ariaDisabled = await markOpenBtn.getAttribute("aria-disabled");
        if (isDisabled === null && ariaDisabled !== "true") {
          throw new Error("Viewer role was allowed to click Mark open button!");
        }

        // 2. Authoritative Empty Inbox: Empty array must NOT resurrect demo seeds!
        await page.evaluate(() => {
          localStorage.setItem(
            "gza.contact.v1",
            JSON.stringify({
              schemaVersion: 1,
              revision: 5,
              messages: [],
            }),
          );
        });

        await page.reload({ waitUntil: "domcontentloaded" });
        await page.getByText("No messages match these filters.").waitFor({ state: "visible", timeout: 8000 });

        // Verify inbox badge is 0 / absent
        const inboxBadgeCount = await page.locator("a[href*='/admin/inbox'] span.tabular-nums").count();
        if (inboxBadgeCount > 0) {
          throw new Error(`Expected zero/no inbox badge on empty storage, got count=${inboxBadgeCount}`);
        }

        // 3. Check Dashboard: att-inbox attention item is absent when new count is 0
        await page.goto(baseUrl + "/admin", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("h1", { timeout: 10000 });
        const attnInboxCount = await page.locator("text=Unresolved customer enquiries").count();
        if (attnInboxCount > 0) {
          throw new Error("Dashboard attention item appeared when contact newCount is zero!");
        }

        // 4. Same-context / cross-tab reactive convergence: Add a new message to storage and dispatch storage event
        await page.evaluate(() => {
          const envelope = {
            schemaVersion: 1,
            revision: 6,
            messages: [
              {
                id: "cmsg-cross-1",
                submissionId: "cross-sub-1",
                senderName: "Cross Tab User",
                email: "crosstab@example.ps",
                topic: "booking",
                message: "New message arrived from another tab.",
                language: "en",
                status: "new",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                source: "public-contact",
                internalNotes: [],
              },
            ],
          };
          localStorage.setItem("gza.contact.v1", JSON.stringify(envelope));
          window.dispatchEvent(
            new StorageEvent("storage", {
              key: "gza.contact.v1",
              newValue: JSON.stringify(envelope),
            }),
          );
        });

        // Inbox badge immediately reacts and appears with '1'
        const reactiveBadge = page.locator("a[href*='/admin/inbox'] span:has-text('1')");
        await reactiveBadge.first().waitFor({ state: "visible", timeout: 8000 });
      } finally {
        await context.close();
      }
    });

    await checkStep("Check 58: Phase 5D correction — real cross-tab transactions and Admin failure recovery", async () => {
      const context = await browser.newContext();
      try {
        await context.addInitScript(() => localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} })));
        const a = await context.newPage(), b = await context.newPage(), inbox = await context.newPage();
        await Promise.all([a.goto(baseUrl + "/contact"), b.goto(baseUrl + "/contact"), inbox.goto(baseUrl + "/admin/inbox")]);
        for (const [page, name] of [[a, "Cross Tab A"], [b, "Cross Tab B"]]) {
          await page.fill("#c-name", name); await page.fill("#c-email", "audit@example.test");
          await page.fill("#c-message", "A synthetic contact enquiry for cross-tab testing.");
        }
        await Promise.all([a.evaluate(() => { const f = document.querySelector("form"); f.requestSubmit(); f.requestSubmit(); }), b.evaluate(() => document.querySelector("form").requestSubmit())]);
        await Promise.all([a.getByText("Enquiry saved", { exact: true }).waitFor(), b.getByText("Enquiry saved", { exact: true }).waitFor()]);
        const publicCount = await a.evaluate(() => JSON.parse(localStorage.getItem("gza.contact.v1")).messages.filter(m => m.source === "public-contact").length);
        if (publicCount !== 2) throw new Error(`Cross-tab enquiries lost/duplicated: ${publicCount}`);
        await inbox.locator("button:has-text('Cross Tab A')").waitFor();
        await inbox.locator("a[href*='/admin/inbox'] span:has-text('3')").first().waitFor();
        await inbox.locator("button:has-text('Cross Tab A')").click();
        await b.goto(baseUrl + "/admin/inbox"); await b.locator("button:has-text('Cross Tab A')").click();
        await b.fill('textarea[placeholder*="internal staff note"]', "A note from the second tab.");
        await Promise.all([inbox.getByRole("button", { name: "Mark open", exact: true }).click(), b.getByRole("button", { name: "Add internal note", exact: true }).click()]);
        await inbox.getByText("A note from the second tab.", { exact: true }).waitFor();
        const message = await inbox.evaluate(() => JSON.parse(localStorage.getItem("gza.contact.v1")).messages.find(m => m.senderName === "Cross Tab A"));
        if (message.status !== "open" || message.internalNotes.length !== 1) throw new Error("Cross-tab status/note overwritten");
        await inbox.locator("a[href*='/admin/inbox'] span:has-text('2')").first().waitFor();

        const unhandled = []; inbox.on("pageerror", e => unhandled.push(e.message));
        await inbox.fill("#in-reply-draft", "A persisted reply before failure.");
        await inbox.getByRole("button", { name: "Save reply draft", exact: true }).click();
        await inbox.waitForFunction(() => JSON.parse(localStorage.getItem("gza.contact.v1")).messages.find(m => m.senderName === "Cross Tab A").replyDraft === "A persisted reply before failure.");
        await inbox.fill("#in-reply-draft", "Keep this unsaved reply through failed commands.");
        await inbox.fill('textarea[placeholder*="internal staff note"]', "Keep this unsaved note.");
        const before = await inbox.evaluate(() => localStorage.getItem("gza.contact.v1"));
        await inbox.evaluate(() => {
          window.__contactSetItem = Storage.prototype.setItem;
          Storage.prototype.setItem = function (key, value) { if (key === "gza.contact.v1") throw new DOMException("Synthetic quota failure", "QuotaExceededError"); return window.__contactSetItem.call(this, key, value); };
        });
        for (const name of ["Resolve", "Add internal note", "Assign to me", "Save reply draft", "Clear draft"]) {
          await inbox.getByRole("button", { name, exact: true }).click();
          await inbox.getByRole("alert").filter({ hasText: "Unable to save this change" }).waitFor();
          if (await inbox.inputValue("#in-reply-draft") !== "Keep this unsaved reply through failed commands.") throw new Error("Failed command discarded reply buffer");
          if (await inbox.inputValue('textarea[placeholder*="internal staff note"]') !== "Keep this unsaved note.") throw new Error("Failed command discarded note buffer");
          if (await inbox.evaluate(() => localStorage.getItem("gza.contact.v1")) !== before) throw new Error("Failed command mutated storage");
        }
        if (unhandled.length) throw new Error(`Unhandled command errors: ${unhandled.join(",")}`);
        await inbox.evaluate(() => { Storage.prototype.setItem = window.__contactSetItem; delete window.__contactSetItem; });
        await inbox.getByRole("button", { name: "Add internal note", exact: true }).evaluate(button => { button.click(); button.click(); });
        await inbox.getByText("Keep this unsaved note.", { exact: true }).waitFor();
        const notes = await inbox.evaluate(() => JSON.parse(localStorage.getItem("gza.contact.v1")).messages.find(m => m.senderName === "Cross Tab A").internalNotes);
        if (notes.filter(n => n.body === "Keep this unsaved note.").length !== 1) throw new Error("Rapid note retry duplicated note");
      } finally { await context.close(); }
    });

    await checkStep("Check 59: Phase 5D correction — Arabic errors, focus, LTR inputs and no-draft preview truth", async () => {
      const context = await browser.newContext();
      try {
        const page = await context.newPage(); await page.goto(baseUrl + "/ar/contact");
        await page.click('button[type="submit"]');
        await page.waitForFunction(() => document.querySelector('#c-name').getAttribute('aria-invalid') === 'true');
        const details = await page.evaluate(() => ({ alerts: [...document.querySelectorAll('[role="alert"]')].map(n => n.textContent), focused: document.activeElement.id, dirs: ['#c-email','#c-booking-ref'].map(s => getComputedStyle(document.querySelector(s)).direction) }));
        if (details.alerts.some(t => /Name|Email|Message/.test(t)) || details.focused !== 'c-name' || details.dirs.some(d => d !== 'ltr')) throw new Error(`Arabic error/focus/direction regression: ${JSON.stringify(details)}`);
        await page.fill('#c-name','مجرب النموذج'); await page.fill('#c-email','audit@example.test'); await page.fill('#c-message','رسالة تجريبية لاختبار حفظ البيانات محلياً.');
        await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Synthetic English storage failure'); }; });
        await page.click('button[type="submit"]'); await page.getByRole('alert').filter({hasText:'تعذر حفظ استفسارك'}).waitFor();
        for (const [route, title, notice] of [['/contact?settingsPreview=1','Enquiry preview','Settings preview:'],['/ar/contact?settingsPreview=1','معاينة الاستفسار','معاينة الإعدادات:']]) {
          await page.goto(baseUrl + route); await page.getByText(notice,{exact:false}).first().waitFor();
          await page.fill('#c-name','Preview Person');await page.fill('#c-email','preview@example.test');await page.fill('#c-message','Preview only; no contact enquiry should be saved.');
          await page.click('button[type="submit"]'); await page.getByRole('heading',{name:title,exact:true}).waitFor();
          if (await page.evaluate(() => localStorage.getItem('gza.contact.v1')) !== null) throw new Error('No-draft preview persisted a message');
          if (!(await page.getByRole('heading',{name:title,exact:true}).evaluate(h => h === document.activeElement))) throw new Error('Success heading did not receive focus');
          const normalPath = route.split('?')[0];
          await page.locator(`a[href="${normalPath}"]`).last().click();
          await page.waitForURL(baseUrl + normalPath);
          if (await page.getByRole('heading', { name: normalPath.startsWith('/ar') ? 'تم حفظ الاستفسار' : 'Enquiry saved', exact: true }).count()) throw new Error('Leaving preview falsely relabeled the result as persisted');
        }
      } finally { await context.close(); }
    });

    await checkStep("Check 60: Phase 6A — Admin Check-in Desk: real repository queries, status precedence, check-in completion, boarding pass navigation, and undo check-in", async () => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const clockMs = Date.parse("2026-10-10T04:00:00+03:00");
      const checkInRepo = {
        schemaVersion: 1,
        bookings: [
          {
            ref: "GZA-CK60",
            createdAt: "2026-10-01T10:00:00Z",
            status: "confirmed",
            channel: "web",
            ownerEmail: "khalil@example.ps",
            total: 350,
            contact: { email: "khalil@example.ps", phone: "+970 8 282 0000" },
            criteria: {
              tripType: "oneway",
              origin: "GZA",
              destination: "AMM",
              departDate: "2026-10-10",
              returnDate: "",
              adults: 2,
              children: 0,
              infants: 0,
              cabin: "economy",
            },
            outbound: {
              id: "PS100-2026-10-10-out",
              number: "PS100",
              originCode: "GZA",
              destinationCode: "AMM",
              date: "2026-10-10",
              departTime: "07:15",
              arriveTime: "08:10",
              durationMinutes: 55,
              aircraft: "Airbus A320neo",
              status: "Scheduled",
              gate: "A1",
              terminal: "1",
              basePrice: 129,
              seatsLeft: 18,
            },
            inbound: null,
            fareId: "classic",
            passengers: [
              { id: "pax-GZA-CK60-0", firstName: "Ahmad", lastName: "Khalil", type: "adult", dob: "1985-05-15", nationality: "PS", document: "PAL-SMOKE-99" },
              { id: "pax-GZA-CK60-1", firstName: "Fatima", lastName: "Khalil", type: "adult", dob: "1988-08-20", nationality: "PS", document: "" },
            ],
            seats: { "out-0": "12A", "out-1": "12B" },
            extras: { pax: [{ extraBags: 1, meal: "standard", assistance: [] }] },
            checkedIn: { out: [], in: [] },
          },
        ],
        flightOverrides: {},
      };

      await context.addInitScript(({ checkInRepo, clockMs }) => {
        try {
          localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
          localStorage.setItem("gza.repo.v1", JSON.stringify(checkInRepo));
          const RealDate = Date;
          class MockDate extends RealDate {
            constructor(...args) {
              if (args.length === 0) super(clockMs);
              else super(...args);
            }
            static now() {
              return clockMs;
            }
          }
          window.Date = MockDate;
        } catch { }
      }, { checkInRepo, clockMs });

      try {
        const page = await context.newPage();

        // 1. Visit /admin/check-in
        await page.goto(baseUrl + "/admin/check-in", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("table", { timeout: 10000 });

        // Verify page header
        const title = await page.textContent("h1, h2, [data-slot='page-header']");
        if (!title?.toLowerCase().includes("check-in")) {
          throw new Error("Admin Check-in page did not load correctly: " + title);
        }

        // Verify that table rows are rendered
        const rowCount = await page.locator("tbody tr").count();
        if (rowCount === 0) {
          throw new Error("Check-in desk has no passenger rows");
        }

        // Find a row with Check in button (ready state for Ahmad Khalil)
        const checkInButton = page.locator("tbody tr button").filter({ hasText: /Check in|تسجيل الوصول/i }).first();
        if (await checkInButton.count() === 0) {
          throw new Error("Expected Check in button on ready row");
        }
        await checkInButton.click();

        // Verify row transitions to "Checked in"
        const doneBadge = page.locator("tbody tr").filter({ hasText: /Checked in|تم تسجيل الوصول/i }).first();
        await doneBadge.waitFor({ state: "visible", timeout: 8000 });

        // Verify Boarding Pass button is visible on the checked-in row
        const bpButton = doneBadge.locator("a, button").filter({ hasText: /Boarding Pass|بطاقة الصعود/i });
        if (await bpButton.count() === 0) {
          throw new Error("Boarding pass action missing on checked-in row");
        }

        // Verify Undo Check-in button is present
        const undoButton = doneBadge.locator("button").filter({ hasText: /Undo|تراجع/i });
        if (await undoButton.count() === 0) {
          throw new Error("Undo check-in button missing on checked-in row");
        }

        // Test Undo Check-in
        await undoButton.click();
        await page.waitForTimeout(600);

        // Verify passenger is no longer in checked in state
        const remainingCheckedIn = await page.locator("tbody tr").filter({ hasText: /Checked in|تم تسجيل الوصول/i }).count();
        if (remainingCheckedIn !== 0) {
          throw new Error("Undo check-in failed to revert passenger status");
        }

        // Verify Arabic view /ar/admin/check-in
        await page.goto(baseUrl + "/ar/admin/check-in", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("table", { timeout: 10000 });
        const arTitle = await page.textContent("h1, h2, [data-slot='page-header']");
        if (!arTitle?.includes("تسجيل الوصول")) {
          throw new Error("Arabic check-in desk title mismatch: " + arTitle);
        }
      } finally {
        await context.close();
      }
    });

    await checkStep("Check 61: Phase 6A — Counter Booking: 5-step wizard, canonical pricing, channel 'desk', Admin Detail and Public Manage cross-surface convergence", async () => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await context.addInitScript(() => {
        try {
          localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
        } catch { }
      });
      try {
        const page = await context.newPage();

        // 1. Visit /admin/bookings/new
        await page.goto(baseUrl + "/admin/bookings/new", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("input, select", { timeout: 10000 });

        const counterFlight=counterTestFlight();
        await page.fill("#nb-date",counterFlight.date);
        await page.selectOption("#nb-dest",counterFlight.destinationCode);
        // Step 1: Flight & Route
        await page.waitForSelector("input[name='nb-flight-choice']", { timeout: 10000 });
        const firstFlightRadio = page.locator("input[name='nb-flight-choice']").first();
        await firstFlightRadio.check();

        // Step 1 -> Step 2 (Fare)
        const nextToStep2 = page.getByRole("button", { name: /Next: Fare Selection|التالي: اختيار الأجرة/i });
        await nextToStep2.click();

        // Step 2: Select Fare (Classic)
        await page.waitForSelector("input[name='nb-fare-choice']", { timeout: 8000 });
        const classicFareRadio = page.locator("input[name='nb-fare-choice'][value='classic'], input[name='nb-fare-choice']").nth(1);
        await classicFareRadio.check();

        // Step 2 -> Step 3 (Passengers & Contact)
        const nextToStep3 = page.getByRole("button", { name: /Next: Passenger Details|التالي: بيانات المسافرين/i });
        await nextToStep3.click();

        // Step 3: Enter passenger details and contact
        await page.waitForSelector("#pax-0-fn", { timeout: 8000 });
        await page.fill("#pax-0-fn", "Hassan");
        await page.fill("#pax-0-ln", "Al-Quds");
        await page.fill("#pax-0-dob", "1988-07-20");
        await page.fill("#pax-0-doc", "PAL-887766");
        await page.fill("#nb-contact-email", "hassan.quds@example.com");
        await page.fill("#nb-contact-phone", "+970599112233");

        // Step 3 -> Step 4 (Seats & Extras)
        const nextToStep4 = page.getByRole("button", { name: /Next: Seats & Extras|التالي: المقاعد والإضافات/i });
        await nextToStep4.click();

        // Step 4: Seat & Extras
        await page.waitForSelector("#pax-0-seat", { timeout: 8000 });
        await page.fill("#pax-0-seat", availableSeat(counterFlight));
        await page.fill("#pax-0-bags", "1");

        // Step 4 -> Step 5 (Review)
        const nextToStep5 = page.getByRole("button", { name: /Next: Review$|التالي: المراجعة$/i });
        await nextToStep5.click();

        // Step 5: Review summary
        const issueBtn = page.getByRole("button", { name: /Create desk booking|إنشاء حجز بالمكتب/i });
        await issueBtn.waitFor({ state: "visible", timeout: 8000 });
        await issueBtn.click();

        // Verify success view appears with generated PNR
        const successTitle = page.locator("text=/Booking created|تم إنشاء الحجز/i").first();
        await successTitle.waitFor({ state: "visible", timeout: 10000 });
        const successText = await page.textContent("body");
        if (!successText?.toLowerCase().includes("booking created") && !successText?.includes("تم إنشاء الحجز")) {
          throw new Error("Counter booking success screen not displayed");
        }

        // Extract PNR directly from success display
        const createdPnr = (await page.locator("main .text-3xl").first().textContent())?.trim();
        if (!createdPnr) {
          throw new Error("Could not extract generated PNR from counter booking: " + successText.slice(0, 300));
        }

        // Verify channel 'desk' in canonical local storage
        const repoState = await page.evaluate(() => JSON.parse(localStorage.getItem("gza.repo.v1") || "{}"));
        const storedBooking = repoState.bookings?.find(b => b.ref === createdPnr);
        if (!storedBooking) {
          throw new Error(`Booking ${createdPnr} was not persisted to gza.repo.v1`);
        }
        if (storedBooking.channel !== "desk") {
          throw new Error(`Booking channel expected 'desk', got: ${storedBooking.channel}`);
        }
        if (storedBooking.ownerEmail !== null) {
          throw new Error(`Desk booking ownerEmail expected null, got: ${storedBooking.ownerEmail}`);
        }
        if (storedBooking.total !== bookingTotal(storedBooking).total) throw new Error("Stored booking total differs from canonical pricing");

        // 2. Cross-surface convergence: View in Admin Detail
        await page.goto(baseUrl + `/admin/bookings/${createdPnr}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("h1, h2, [data-slot='page-header']", { timeout: 10000 });
        const detailText = await page.textContent("body");
        if (!detailText?.includes(createdPnr) || !detailText?.includes("Hassan Al-Quds")) {
          throw new Error(`Admin booking detail does not show created booking ${createdPnr}`);
        }

        // 3. Sequential two-tab proof: Public Manage Convergence
        const publicTab = await context.newPage();
        await publicTab.goto(baseUrl + `/manage/${createdPnr}`, { waitUntil: "domcontentloaded" });
        await publicTab.waitForSelector(`text=${createdPnr}`, { timeout: 10000 });
        const publicText = await publicTab.textContent("body");
        if (!publicText?.includes(createdPnr)) {
          throw new Error(`Public manage view failed to load desk booking ${createdPnr}`);
        }
        await publicTab.close();

        // 4. Permission guard check: staff with commercial.view only cannot edit
        const currentRepoState = await page.evaluate(() => localStorage.getItem("gza.repo.v1"));
        const viewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await viewerContext.addInitScript((repo) => {
          try {
            localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-3", overrides: {} }));
            if (repo) localStorage.setItem("gza.repo.v1", repo);
          } catch { }
        }, currentRepoState);
        const viewerPage = await viewerContext.newPage();
        await viewerPage.goto(baseUrl + `/admin/bookings/${createdPnr}`, { waitUntil: "domcontentloaded" });
        await viewerPage.waitForSelector(`text=${createdPnr}`, { timeout: 10000 });
        const editContactBtn = viewerPage.locator("button").filter({ hasText: /Edit Contact|تعديل بيانات الاتصال/i });
        if (await editContactBtn.count() !== 1 || await editContactBtn.isEnabled()) {
          throw new Error("Viewer staff with no commercial.edit permission was able to click edit contact button");
        }
        await viewerContext.close();
      } finally {
        await context.close();
      }
    });

    await runCommercialChecks({checkStep,browser,baseUrl});
    await runCommercialCorrection02Checks({checkStep,browser,baseUrl});
    await runPhase6B1Checks({checkStep,browser,baseUrl});
    await runPhase6B1Correction01Checks({ checkStep, browser, baseUrl });
    await runPhase6B2AChecks({ checkStep, browser, baseUrl });
    await runPhase6B2ACorrection01Checks({ checkStep, browser, baseUrl });
    await runPhase6B2BChecks({ checkStep, browser, baseUrl });
    await runPhase6B2BCorrectionChecks({ checkStep, browser, baseUrl });
    await runPhase6B2C1Checks({ checkStep, browser, baseUrl });
    await runDatedServiceFoundationChecks({ checkStep, browser, baseUrl });
    await runDatedServiceCutoverChecks({ checkStep, browser, baseUrl });
    await runCutoverCorrection01Checks({ checkStep, browser, baseUrl });
    await runPhase6CStaffActivityChecks({ checkStep, browser, baseUrl });
    await runPhase6CConvergenceChecks({ checkStep, browser, baseUrl });
    await runPhase6CCorrection05Checks({ checkStep, browser, baseUrl });
    await runPhase7ContentPreviewChecks({ checkStep, browser, baseUrl });
    await checkStep("Archive draft administration", () => runArchiveDraftChecks({ browser, baseUrl }));

  } finally {
    await browser.close();
    if (server) {
      await server.stop();
    }
  }

  const failures = results.filter((r) => !r.pass);
  selection.verify();
  if (harnessErrors.length) {
    throw new Error(`Browser runtime/network failures:\n${[...new Set(harnessErrors)].join("\n")}`);
  }
  console.log(`\n========================================`);
  console.log(`Smoke Results: ${results.length - failures.length}/${results.length} passed`);
  console.log(`========================================\n`);

  if (failures.length > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runBrowserSmoke().catch((err) => {
  console.error("Browser smoke suite failed fatal:", err);
  process.exit(1);
});
