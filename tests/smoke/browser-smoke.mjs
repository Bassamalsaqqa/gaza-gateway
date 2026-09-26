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
      localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
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
