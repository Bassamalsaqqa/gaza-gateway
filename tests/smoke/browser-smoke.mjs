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
 *   node tests/smoke/browser-smoke.mjs [--url http://localhost:8080]
 */

import { chromium } from "playwright-core";
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

async function runBrowserSmoke() {
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
  console.log(`Target URL: ${baseUrl}`);
  console.log(`========================================\n`);

  // Launch browser using system msedge, chrome, or default chromium
  let browser;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  } catch {
    try {
      browser = await chromium.launch({ channel: "chrome", headless: true });
    } catch {
      browser = await chromium.launch({ headless: true });
    }
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

  async function checkStep(name, fn) {
    const t0 = Date.now();
    try {
      await fn();
      const duration = Date.now() - t0;
      console.log(`  ✔ ${name} (${duration}ms)`);
      results.push({ name, pass: true, duration });
    } catch (err) {
      const duration = Date.now() - t0;
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
      const is1SeatChecked = await opt1Seat.getAttribute("data-state");
      if (is1SeatChecked !== "checked") {
        throw new Error("Clicking 1-seat option did not select it");
      }

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
      await page.keyboard.press("ArrowLeft", { delay: 50 });
      if ((await inspectRadio.getAttribute("aria-checked")) !== "true") {
        throw new Error("ArrowLeft in LTR did not select inspect radio");
      }

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
        const d = new Date(Date.now() + daysAhead * 86400000);
        const iso = d.toISOString().slice(0, 10);
        const weekday = new Date(`${iso}T12:00:00`).getDay();
        const num = weekday % 2 === 0 ? "PS100" : "PS101";
        return `${num}-${iso}-out`;
      }
      function getPastFlightId(daysAgo = 7) {
        const d = new Date(Date.now() - daysAgo * 86400000);
        const iso = d.toISOString().slice(0, 10);
        const weekday = new Date(`${iso}T12:00:00`).getDay();
        const num = weekday % 2 === 0 ? "PS100" : "PS101";
        return `${num}-${iso}-out`;
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
        const d = new Date(Date.now() + daysAhead * 86400000);
        const iso = d.toISOString().slice(0, 10);
        const weekday = new Date(`${iso}T12:00:00`).getDay();
        const num = weekday % 2 === 0 ? "PS100" : "PS101";
        return `${num}-${iso}-out`;
      }
      function getPastFlightId(daysAgo = 7) {
        const d = new Date(Date.now() - daysAgo * 86400000);
        const iso = d.toISOString().slice(0, 10);
        const weekday = new Date(`${iso}T12:00:00`).getDay();
        const num = weekday % 2 === 0 ? "PS100" : "PS101";
        return `${num}-${iso}-out`;
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
      function getFutureFlightId(daysAhead = 4) {
        const d = new Date(Date.now() + daysAhead * 86400000);
        const iso = d.toISOString().slice(0, 10);
        const weekday = new Date(`${iso}T12:00:00`).getDay();
        const num = weekday % 2 === 0 ? "PS100" : "PS101";
        return `${num}-${iso}-out`;
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
        await page.waitForSelector(".rdp-day:not([disabled])", { timeout: 5000 });
        await page.locator(".rdp-day:not([disabled])").first().click();
        await page.fill("#contact-email", "smoke9@example.com");
        await page.fill("#contact-phone", "+970599000000");

        const toSeatsBtn = page.locator('button:has-text("Continue"), button:has-text("متابعة")').first();
        await toSeatsBtn.click();

        // Step seats -> extras
        const toExtrasBtn = page.locator('button:has-text("Continue"), button:has-text("متابعة")').first();
        await toExtrasBtn.waitFor({ state: "visible", timeout: 8000 });
        await toExtrasBtn.click();

        // Step extras -> review
        const toReviewBtn = page.locator('button:has-text("Continue"), button:has-text("متابعة")').first();
        await toReviewBtn.waitFor({ state: "visible", timeout: 8000 });
        await toReviewBtn.click();

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

        await page.waitForSelector(".code-id", { timeout: 10000 });
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
      function getFutureFlightId(daysAhead = 5) {
        const d = new Date(Date.now() + daysAhead * 86400000);
        const iso = d.toISOString().slice(0, 10);
        const weekday = new Date(`${iso}T12:00:00`).getDay();
        const num = weekday % 2 === 0 ? "PS100" : "PS101";
        return `${num}-${iso}-out`;
      }

      const targetFlightId = getFutureFlightId(5);
      let flightId = targetFlightId;
      const overrideGate = "B7";

      try {
        // 10a. Navigate to Admin Flights board and use existing Quick Edit UI
        await page.goto(`${baseUrl}/admin/flights`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("table", { timeout: 10000 });

        // Set date filter to target flight's date
        const flightDate = targetFlightId.split("-").slice(1, 4).join("-");
        const dateInput = page.locator('input[type="date"]').first();
        if (await dateInput.count() > 0) {
          await dateInput.fill(flightDate);
          await page.waitForTimeout(500);
        }

        // Locate flight row and open Quick Edit
        const flightPrefix = targetFlightId.slice(0, 5); // "PS100" or "PS101"
        const row = page.locator(`tr:has-text("${flightPrefix}")`).first();
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

      // 11a. Inject sentinels into localStorage before loading Studio preview
      await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
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

        // 11e. Exit Studio preview by navigating back to public root
        await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(500);

        // 11f. VERIFY: ALL THREE keys must remain 100% BYTE-IDENTICAL to their sentinels
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
        await cmsPage.locator("#tr-title").waitFor({ state: "visible" });
        const publishedTitle = await cmsPage.locator("#tr-title").inputValue();
        await cmsPage.locator("#tr-title").fill(enDraft);
        await cmsPage.getByRole("button", { name: "Save draft" }).click();
        await cmsPage.waitForFunction(() => {
          const raw = localStorage.getItem("gza.content.draft.v1");
          return raw && JSON.parse(raw).drafts.travel.sections[0].title.en === "Phase 4B English draft proof";
        });
        await cmsPage.reload({ waitUntil: "domcontentloaded" });
        await cmsPage.getByRole("tab", { name: "Travel information" }).click();
        await cmsPage.locator("#tr-title").waitFor({ state: "visible" });
        if (await cmsPage.locator("#tr-title").inputValue() !== enDraft) throw new Error("Saved English draft did not survive reload");

        await cmsPage.goto(`${baseUrl}/travel?contentPreview=1`, { waitUntil: "domcontentloaded" });
        await cmsPage.getByRole("heading", { name: enDraft, exact: true }).waitFor({ state: "visible" });
        await cmsPage.locator('[role="status"]').filter({ hasText: "Not published" }).first().waitFor({ state: "visible" });
        await cmsPage.goto(`${baseUrl}/travel`, { waitUntil: "domcontentloaded" });
        await cmsPage.getByText(publishedTitle, { exact: true }).first().waitFor({ state: "visible" });
        if (await cmsPage.getByText(enDraft, { exact: true }).count()) throw new Error("Normal Travel route applied local draft");

        await cmsPage.goto(`${baseUrl}/admin/website`, { waitUntil: "domcontentloaded" });
        await cmsPage.getByRole("tab", { name: "Travel information" }).click();
        await cmsPage.getByRole("button", { name: "Arabic", exact: true }).click();
        await cmsPage.locator("#tr-title").fill(arDraft);
        await cmsPage.getByRole("button", { name: "Save draft" }).click();
        await cmsPage.waitForFunction(() => {
          const draft = JSON.parse(localStorage.getItem("gza.content.draft.v1") || "{}").drafts?.travel;
          return draft?.sections[0]?.title.ar === "مسودة عربية للاختبار";
        });
        const saved = await cmsPage.evaluate(() => JSON.parse(localStorage.getItem("gza.content.draft.v1")).drafts.travel);
        if (saved.sections[0].title.en !== enDraft) throw new Error("Arabic edit erased English draft");
        await cmsPage.goto(`${baseUrl}/ar/travel?contentPreview=1`, { waitUntil: "domcontentloaded" });
        await cmsPage.getByRole("heading", { name: arDraft, exact: true }).waitFor({ state: "visible" });
        await cmsPage.goto(`${baseUrl}/ar/travel`, { waitUntil: "domcontentloaded" });
        if (await cmsPage.getByText(arDraft, { exact: true }).count()) throw new Error("Normal Arabic route applied local draft");

        await cmsPage.goto(`${baseUrl}/admin/website`, { waitUntil: "domcontentloaded" });
        await cmsPage.getByRole("tab", { name: "Travel information" }).click();
        await cmsPage.getByRole("button", { name: "Discard draft" }).click();
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
        await failPage.locator("#tr-title").fill("Storage failure draft");
        await failPage.evaluate(() => {
          window.__contentOriginalSetItem = Storage.prototype.setItem;
          Storage.prototype.setItem = function () { throw new Error("Storage blocked"); };
        });
        await failPage.getByRole("button", { name: "Save draft" }).click();
        await failPage.getByRole("alert").filter({ hasText: "Could not save the draft" }).waitFor({ state: "visible" });
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
        await viewerPage.locator("#tr-title").waitFor({ state: "visible" });
        if (!await viewerPage.locator("#tr-title").evaluate((input) => input.readOnly)) {
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
        await adminPage.locator('button:has-text("Public page")').click();
        await adminPage.waitForSelector("#de-photo", { timeout: 10000 });

        // Select city-dubai
        await adminPage.selectOption("#de-photo", "city-dubai");

        // Save image draft
        const saveDraftBtn = adminPage.getByRole("button", { name: "Save image draft" });
        await saveDraftBtn.waitFor({ state: "visible", timeout: 5000 });
        await saveDraftBtn.click();

        // Verify draft active message appears
        await adminPage.getByText("Draft active (stored in this browser, not published)").waitFor({ state: "visible", timeout: 8000 });

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
        await adminPage.locator('button:has-text("Public page")').click();
        await adminPage.waitForSelector("#de-photo", { timeout: 10000 });
        const selectedVal = await adminPage.locator("#de-photo").inputValue();
        if (selectedVal !== "city-dubai") {
          throw new Error(`Draft did not survive reload in admin photo picker: ${selectedVal}`);
        }

        // 20c. Preview draft: /destinations/IST?contentPreview=1 displays Dubai photo and Not published notice
        await adminPage.goto(`${baseUrl}/destinations/IST?contentPreview=1`, { waitUntil: "domcontentloaded" });
        await adminPage.waitForSelector('[role="status"]', { timeout: 10000 });
        const previewHero = adminPage.locator('img[data-destination-hero-photo="IST"]');
        await previewHero.waitFor({ state: "visible", timeout: 8000 });
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
        await adminPage.locator('button:has-text("Public page")').click();
        await adminPage.waitForSelector("#de-photo", { timeout: 10000 });
        const discardBtn = adminPage.getByRole("button", { name: "Discard draft" });
        await discardBtn.waitFor({ state: "visible", timeout: 5000 });
        await discardBtn.click();

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

  } finally {
    await browser.close();
    if (server) {
      await server.stop();
    }
  }

  const failures = results.filter((r) => !r.pass);
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
