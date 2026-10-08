import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { cutoverContext } from "./phase6b2c2b-cutover.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.join(root, "scratch/phase9-public");
await fs.mkdir(outDir, { recursive: true });

const testPort = 4190;
const testUrl = process.env.PHASE9_TEST_URL ?? `http://127.0.0.1:${testPort}`;
let server;

if (!process.env.PHASE9_TEST_URL) {
  server = await createServer({
    root,
    server: { host: "127.0.0.1", port: testPort, strictPort: true },
    logLevel: "error",
  });
  await server.listen();
}

const browser = await chromium.launch({ channel: "msedge", headless: true });

const testResults = [];
const runtimeErrors = [];
const consoleErrors = [];

async function assertNoHorizontalOverflow(page, label) {
  const overflows = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth + 1;
  });
  assert.ok(!overflows, `${label}: horizontal document overflow detected at 320px`);
}

async function assertAriaReferences(page, label) {
  const broken = await page.evaluate(() => {
    return [...document.querySelectorAll("[aria-controls],[aria-labelledby],[aria-describedby]")]
      .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden")
      .flatMap((el) =>
        ["aria-controls", "aria-labelledby", "aria-describedby"]
          .flatMap((attr) => {
            if (attr === "aria-controls" && el.getAttribute("aria-expanded") === "false") return [];
            return el.getAttribute(attr)?.split(/\s+/) ?? [];
          })
          .filter((id) => id && !document.getElementById(id))
          .map((id) => `${el.tagName}#${el.id} ${id}`),
      );
  });
  assert.deepEqual(broken, [], `${label}: broken ARIA ID reference relationships`);
}

try {
  for (const lang of ["en", "ar"]) {
    const { context, prefix, current, dict } = await cutoverContext(browser, lang, true);
    const page = await context.newPage();

    page.on("pageerror", (err) => runtimeErrors.push(`${lang}: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(`${lang}: ${msg.text()}`);
      }
    });

    await page.emulateMedia({ reducedMotion: "reduce" });

    // 1. Zero horizontal overflow at 320px across key public routes
    const sample320Routes = [
      "",
      "/flights",
      "/gallery",
      "/manage",
      "/check-in",
      "/signin",
      "/register",
    ];

    await page.setViewportSize({ width: 320, height: 800 });
    for (const r of sample320Routes) {
      await page.goto(`${testUrl}${prefix}${r || "/"}`, { waitUntil: "networkidle" });
      await page.locator("main").waitFor();
      assert.equal(await page.locator("html").getAttribute("dir"), lang === "ar" ? "rtl" : "ltr");
      assert.equal(await page.locator("html").getAttribute("lang"), lang);
      await assertNoHorizontalOverflow(page, `${lang} ${r || "/"}`);
      await assertAriaReferences(page, `${lang} ${r || "/"}`);
    }

    // 2. Mobile drawer opening, Escape key close, and focus return
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${testUrl}${prefix}/`, { waitUntil: "networkidle" });
    const menuTrigger = page.locator('[data-slot="mobile-menu-trigger"]');
    await menuTrigger.waitFor();
    await menuTrigger.click();

    const drawer = page.locator('[data-slot="mobile-drawer"]');
    await drawer.waitFor();
    assert.ok(await drawer.isVisible(), `${lang}: mobile navigation drawer opens`);

    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });
    assert.ok(
      await page.evaluate(() => document.activeElement?.getAttribute("data-slot") === "mobile-menu-trigger"),
      `${lang}: Escape closes mobile drawer and returns focus to menu trigger`,
    );

    // The open airport search has a real generated label, keyboard selection and focus return.
    const destination = page.locator("#search-to");
    await destination.focus();
    await page.keyboard.press("ArrowDown");
    const airportSearch = page.getByRole("combobox", { name: dict["search.searchAirport"], exact: true });
    await airportSearch.waitFor();
    await airportSearch.fill("AMM");
    await page.getByRole("option").filter({ hasText: "AMM" }).waitFor();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await airportSearch.waitFor({ state: "hidden" });
    assert.ok(await destination.evaluate(element => document.activeElement === element));
    assert.ok((await destination.getAttribute("aria-label")).includes("AMM"));

    const travellers = page.locator('[data-zone="travellers"] button[aria-haspopup="dialog"]');
    await travellers.focus();
    await page.keyboard.press("Enter");
    const travellerDialog = page.getByRole("dialog");
    await travellerDialog.waitFor();
    await assertAriaReferences(page, `${lang} travellers`);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      assert.ok(await travellerDialog.evaluate(element => element.contains(document.activeElement)));
    }
    await page.keyboard.press("Escape");
    await travellerDialog.waitFor({ state: "hidden" });
    assert.ok(await travellers.evaluate(element => document.activeElement === element));

    // 3. Manage lookup form validation, ARIA association, and dir=ltr
    await page.goto(`${testUrl}${prefix}/manage`, { waitUntil: "networkidle" });
    const pnrInput = page.locator("#pnr");
    assert.equal(
      await pnrInput.evaluate((el) => getComputedStyle(el).direction),
      "ltr",
      `${lang}: manage PNR input has dir=ltr`,
    );

    await page.locator('button[type="submit"]').click();
    const identInput = page.locator('#identifier[aria-invalid="true"]');
    await identInput.waitFor();
    const identErrorId = await identInput.getAttribute("aria-describedby");
    assert.equal(identErrorId, "identifier-error", `${lang}: manage identifier input describes its error`);
    assert.ok(await page.locator(`#${identErrorId}`).isVisible(), `${lang}: error message is visible`);
    assert.ok(
      await identInput.evaluate((el) => document.activeElement === el),
      `${lang}: invalid manage identifier receives focus`,
    );

    // 4. Check-in form validation, ARIA association, and dir=ltr
    await page.goto(`${testUrl}${prefix}/check-in`, { waitUntil: "networkidle" });
    const ciPnrInput = page.locator("#ci-pnr");
    assert.equal(
      await ciPnrInput.evaluate((el) => getComputedStyle(el).direction),
      "ltr",
      `${lang}: check-in PNR input has dir=ltr`,
    );

    await page.locator('button[type="submit"]').click();
    const ciIdentInput = page.locator('#ci-identifier[aria-invalid="true"]');
    await ciIdentInput.waitFor();
    const ciErrorId = await ciIdentInput.getAttribute("aria-describedby");
    assert.equal(ciErrorId, "ci-identifier-error", `${lang}: check-in identifier input describes its error`);
    assert.ok(await page.locator(`#${ciErrorId}`).isVisible(), `${lang}: error message is visible`);
    assert.ok(
      await ciIdentInput.evaluate((el) => document.activeElement === el),
      `${lang}: invalid check-in identifier receives focus`,
    );

    // 5. Manage Contact edit: technical LTR fields, validation, error association, focus
    await page.goto(`${testUrl}${prefix}/manage/${current.ref}/contact`, { waitUntil: "networkidle" });
    for (const fieldId of ["c-email", "c-phone"]) {
      assert.equal(
        await page.locator(`#${fieldId}`).evaluate((el) => getComputedStyle(el).direction),
        "ltr",
        `${lang}: ${fieldId} has LTR direction`,
      );
    }

    await page.locator("#c-email").fill("invalid-email-address");
    await page.getByRole("button", { name: dict["common.save"], exact: true }).click();
    const contactEmailInvalid = page.locator('#c-email[aria-invalid="true"]');
    await contactEmailInvalid.waitFor();
    const contactErrorId = await contactEmailInvalid.getAttribute("aria-describedby");
    assert.equal(contactErrorId, "c-email-error", `${lang}: contact email describes c-email-error`);
    assert.ok(await page.locator(`#${contactErrorId}`).isVisible(), `${lang}: contact error message is visible`);
    assert.ok(
      await contactEmailInvalid.evaluate((el) => document.activeElement === el),
      `${lang}: invalid contact email receives focus`,
    );

    // Storage failures remain form-level alerts, not false invalid-email/password errors.
    await page.locator("#c-email").fill("updated@example.com");
    const originalStore = await page.evaluate(() => localStorage.getItem("gza.repo.v1"));
    await page.evaluate(() => {
      const nativeSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "gza.repo.v1") throw new DOMException("Test quota failure", "QuotaExceededError");
        return nativeSet.call(this, key, value);
      };
    });
    await page.getByRole("button", { name: dict["common.save"], exact: true }).click();
    await page.getByRole("alert").filter({ hasText: dict["error.saveFailed"] }).waitFor();
    assert.equal(await page.locator("#c-email").getAttribute("aria-invalid"), null);
    assert.equal(await page.locator("#c-email-error").count(), 0);
    assert.equal(await page.locator("#c-email").inputValue(), "updated@example.com");
    assert.equal(await page.evaluate(() => localStorage.getItem("gza.repo.v1")), originalStore);

    for (const route of ["signin", "register"]) {
      await page.goto(`${testUrl}${prefix}/${route}`, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        const nativeSet = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === "gza.passenger.v1") throw new DOMException("Test quota failure", "QuotaExceededError");
          return nativeSet.call(this, key, value);
        };
      });
      if (route === "register") {
        await page.locator("#r-first").fill("Test");
        await page.locator("#r-last").fill("Passenger");
      }
      await page.locator('input[type="email"]').fill("passenger@example.com");
      await page.locator('input[type="password"]').fill("prototype-only");
      await page.locator('button[type="submit"]').click();
      await page.getByRole("alert").filter({ hasText: dict["error.saveFailed"] }).waitFor();
      assert.equal(await page.locator('input[aria-invalid="true"]').count(), 0);
      const alertId = await page.getByRole("alert").getAttribute("id");
      assert.ok(alertId);
      assert.equal(await page.locator("main form").getAttribute("aria-describedby"), alertId);
    }

    // 6. Gallery: preserve return to the original invoking thumbnail after navigation.
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(`${testUrl}${prefix}/gallery`, { waitUntil: "networkidle" });
    const galleryButtons = page.locator("ul.grid button[aria-haspopup='dialog']");
    await galleryButtons.first().waitFor();
    const count = await galleryButtons.count();
    assert.ok(count >= 2, `${lang}: at least two gallery items available`);

    // Click first item to open lightbox
    await galleryButtons.first().click();
    const dialogContent = page.locator('[role="dialog"]');
    await dialogContent.waitFor();
    assert.ok(await dialogContent.isVisible(), `${lang}: lightbox dialog opened`);
    const openingTitle = await dialogContent.locator("h2").textContent();

    // Advance to next item via keyboard
    if (lang === "ar") {
      await page.keyboard.press("ArrowLeft");
    } else {
      await page.keyboard.press("ArrowRight");
    }
    await page.waitForFunction(title => document.querySelector('[role="dialog"] h2')?.textContent !== title, openingTitle);

    // Press Escape to close dialog
    await page.keyboard.press("Escape");
    await dialogContent.waitFor({ state: "hidden" });

    assert.ok(await galleryButtons.first().evaluate((el) => document.activeElement === el), `${lang}: lightbox returns focus to the invoking thumbnail`);

    // 7. Aircraft seat map: physical geometry dir=ltr, Arrow navigation follows LTR in both languages
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(`${testUrl}${prefix}/manage/${current.ref}/seats`, { waitUntil: "networkidle" });
    const seatGrid = page.getByRole("grid");
    await seatGrid.waitFor();
    const seatRows = seatGrid.getByRole("row");
    assert.equal(Number(await seatGrid.getAttribute("aria-rowcount")), await seatRows.count());
    for (const [i, row] of (await seatRows.all()).entries()) assert.equal(Number(await row.getAttribute("aria-rowindex")), i + 1);
    assert.equal(
      await seatGrid.evaluate((el) => getComputedStyle(el).direction),
      "ltr",
      `${lang}: aircraft seat grid is strictly LTR`,
    );

    const initialSeatBtn = seatGrid.locator('button[tabindex="0"]');
    await initialSeatBtn.focus();
    await page.keyboard.press("Home");
    const portPos = await page.evaluate(() => ({
      x: document.activeElement.getBoundingClientRect().x,
    }));
    await page.keyboard.press("ArrowRight");
    const starboardPos = await page.evaluate(() => ({
      x: document.activeElement.getBoundingClientRect().x,
    }));
    assert.ok(
      starboardPos.x > portPos.x,
      `${lang}: ArrowRight moves starboard (increasing X) in physical aircraft geometry`,
    );
    await assertNoHorizontalOverflow(page, `${lang} seat map 320px`);

    // 8. Boarding pass: LTR technical identifiers & print media styles
    await page.goto(`${testUrl}${prefix}/boarding-pass/${current.ref}/out/0`, { waitUntil: "networkidle" });
    const passArticle = page.locator("main article");
    await passArticle.waitFor();
    assert.equal(
      await passArticle.getByText(current.ref, { exact: true }).evaluate((el) => getComputedStyle(el).direction),
      "ltr",
      `${lang}: boarding pass PNR is rendered LTR`,
    );

    await page.emulateMedia({ media: "print" });
    assert.ok(await passArticle.isVisible(), `${lang}: boarding pass visible in print media`);
    assert.equal(await page.locator("header:visible").count(), 0, `${lang}: header hidden in print`);
    assert.equal(await page.locator("footer:visible").count(), 0, `${lang}: footer hidden in print`);

    // Take verified screenshot
    await page.screenshot({
      path: path.join(outDir, `verified-bp-${lang}-print.png`),
      fullPage: true,
    });
    await page.emulateMedia({ media: "screen" });

    testResults.push({ lang, status: "passed" });
    await context.close();
  }

  assert.deepEqual(runtimeErrors, [], "No uncaught runtime errors during test run");
  assert.deepEqual(consoleErrors, [], "No console errors logged during test run");

  console.log(`PASS: Phase 9 public a11y, RTL and responsive verification passed across all languages.`);
  await fs.writeFile(
    path.join(outDir, "phase9-public-results.json"),
    JSON.stringify({ testResults, timestamp: new Date().toISOString() }, null, 2),
  );
} finally {
  await browser.close();
  if (server) {
    await server.close();
  }
}
