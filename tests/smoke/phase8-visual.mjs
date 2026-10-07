import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const evidence = path.join(root, "scratch/phase8-visual-checks");
await fs.mkdir(evidence, { recursive: true });
let server;
const base = process.env.PHASE8_TEST_URL ?? "http://127.0.0.1:4189";
if (!process.env.PHASE8_TEST_URL) {
  server = await createServer({ root, server: { host: "127.0.0.1", port: 4189, strictPort: true }, logLevel: "error" });
  await server.listen();
}
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
const errors = [];
const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Gaza" }).format(new Date());
const scheduleId = "sch-visual-AMM";
const flightId = `svc1-${Buffer.from(scheduleId).toString("base64url")}-${date}`;
const schedules = [
  { id: scheduleId, number: "PS701", direction: "out", destination: "AMM", days: [0, 1, 2, 3, 4, 5, 6], departTime: "23:55", arriveTime: "00:45", aircraft: "Airbus A320neo", aircraftId: "a320neo", from: date, until: date, active: true, exceptions: [] },
  { id: "sch-visual-cancelled", number: "PS702", direction: "out", destination: "AMM", days: [0, 1, 2, 3, 4, 5, 6], departTime: "23:50", arriveTime: "00:40", aircraft: "Airbus A320neo", aircraftId: "a320neo", from: date, until: date, active: true, exceptions: [{ id: "cancel-visual", date, kind: "cancelled", detail: "Visual fixture", effect: { cancelled: true } }] },
];

async function overflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Page must not overflow horizontally");
}

async function settleImage(image) {
  await image.scrollIntoViewIfNeeded();
  await image.evaluate((element) => element.decode());
  assert.ok(await image.evaluate((element) => element.naturalWidth > 0 && element.width > 0));
}

try {
  for (const lang of ["en", "ar"]) {
    const prefix = lang === "ar" ? "/ar" : "";
    const context = await browser.newContext({ viewport: { width: lang === "en" ? 320 : 390, height: 844 }, reducedMotion: "reduce" });
    await context.addInitScript(({ schedules }) => localStorage.setItem("gza.schedule.v1", JSON.stringify({ schemaVersion: 1, revision: 0, schedules })), { schedules });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));

    // Current canonical services, including cancellation, must remain readable on narrow boards.
    await page.goto(`${base}${prefix}/flights`, { waitUntil: "networkidle" });
    const expand = page.locator(`button[id="flight-btn-m-${flightId}"]`);
    await expand.waitFor();
    assert.equal(await page.locator("html").getAttribute("dir"), lang === "ar" ? "rtl" : "ltr");
    assert.ok(await expand.evaluate((element) => element.getBoundingClientRect().height >= 44));
    const mobileBoard = expand.locator("xpath=../../..");
    assert.ok(await mobileBoard.getByText(lang === "ar" ? "ملغاة" : "Cancelled", { exact: true }).isVisible());
    await expand.focus();
    await page.keyboard.press("Enter");
    assert.equal(await expand.getAttribute("aria-expanded"), "true");
    const details = page.locator(`div[id="flight-details-m-${flightId}"]`);
    assert.ok(await details.isVisible());
    assert.equal(await details.getAttribute("aria-labelledby"), await expand.getAttribute("id"));
    assert.ok(await details.getByRole("link").first().evaluate((element) => element.getBoundingClientRect().height >= 44));
    assert.ok(await details.evaluate((region) => {
      const bounds = region.getBoundingClientRect();
      return [...region.querySelectorAll("a")].every((link) => {
        const rect = link.getBoundingClientRect();
        return rect.left >= bounds.left && rect.right <= bounds.right && link.scrollWidth <= link.clientWidth + 1;
      });
    }), "Mobile actions must fit their card without clipped labels");
    assert.equal(await details.locator("span[dir=ltr]").first().evaluate((element) => getComputedStyle(element).direction), "ltr");
    await overflow(page);
    await page.screenshot({ path: path.join(evidence, `flights-${lang}-mobile.png`), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    const desktopExpand = page.locator(`button[id="flight-btn-d-${flightId}"]`);
    assert.ok(await desktopExpand.isVisible());
    assert.ok(await page.getByRole("table").isVisible());
    assert.equal(await expand.isVisible(), false);
    await overflow(page);
    results.push(`${lang}: mobile cancellation/status, keyboard details, technical direction, desktop table`);

    // The material panel uses the approved documentary image, never a random stock placeholder.
    await page.setViewportSize({ width: 390, height: 844 });
    const remotePlaceholders = [];
    page.on("request", (request) => { if (/picsum\.photos/.test(request.url())) remotePlaceholders.push(request.url()); });
    await page.goto(`${base}${prefix}/about`, { waitUntil: "networkidle" });
    const archiveImage = page.locator("main figure img");
    await settleImage(archiveImage);
    assert.equal(remotePlaceholders.length, 0);
    assert.ok((await archiveImage.getAttribute("srcset"))?.includes("640"));
    assert.ok(Number(await archiveImage.getAttribute("width")) > 0);
    assert.ok((await page.locator("main figcaption").textContent()).trim().length > 0);
    await overflow(page);
    await page.goto(`${base}${prefix}/gallery`, { waitUntil: "networkidle" });
    for (const filter of await page.locator("main select").all()) {
      assert.ok(await filter.evaluate((element) => element.getBoundingClientRect().height >= 44));
      assert.notEqual(await filter.evaluate((element) => getComputedStyle(element).appearance), "none");
    }
    await overflow(page);
    results.push(`${lang}: approved About media, responsive dimensions, native mobile filters`);

    // The global floating control must not obscure the mobile booking total; other contexts retain it.
    await page.goto(`${base}${prefix}/book?step=flights`, { waitUntil: "networkidle" });
    const back = page.locator("button[title]").filter({ has: page.locator("svg circle") });
    assert.equal(await back.evaluate((element) => getComputedStyle(element).display), "none");
    assert.ok(await page.getByTestId("mobile-booking-breakdown-trigger").isVisible());
    await overflow(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.equal(await back.evaluate((element) => getComputedStyle(element).display), "flex");
    await page.goto(`${base}${prefix}/signin`, { waitUntil: "networkidle" });
    const authImage = page.locator("[data-auth-media=signin] img");
    await settleImage(authImage);
    assert.equal(await authImage.getAttribute("sizes"), "(min-width: 1024px) 381px, 100vw");
    assert.ok(await authImage.evaluate((element) => element.getBoundingClientRect().width <= 382));
    await page.goto(`${base}${prefix}/gallery`, { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => [...document.querySelectorAll("button[title]")].some((element) => element.querySelector("circle") && element.getAttribute("aria-hidden") === "false"));
    await back.click();
    await page.waitForFunction(() => window.scrollY === 0);
    await overflow(page);
    results.push(`${lang}: booking overlay clearance, desktop control, auth image sizing, reduced-motion scroll`);
    await context.close();
  }
  assert.deepEqual(errors, [], "No uncaught runtime errors");
  console.log(`PASS ${results.length}/${results.length} focused Phase 8 groups`);
  console.log(results.join("\n"));
  await fs.writeFile(path.join(evidence, "results.json"), JSON.stringify({ results, errors }, null, 2));
} finally {
  await browser.close();
  await server?.close();
}
