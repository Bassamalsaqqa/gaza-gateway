import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { cutoverContext } from "./phase6b2c2b-cutover.mjs";

// Compact final certification: representative routes/widths plus PNR keyboard and print flows.
// This complements the two interaction-focused Phase 9 suites; it is not an all-state WCAG audit.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(root, "scratch/phase9-certification");
await fs.mkdir(out, { recursive: true });
const base = process.env.PHASE9_TEST_URL ?? "http://127.0.0.1:4193";
let server;
if (!process.env.PHASE9_TEST_URL) {
  server = await createServer({ root, server: { host: "127.0.0.1", port: 4193, strictPort: true }, logLevel: "error" });
  await server.listen();
}
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
const errors = [];
const consoleErrors = [];
const routes = [
  ["", 1920], ["/flights", 320], ["/book?step=flights", 390],
  ["/travel", 768], ["/gallery", 1024], ["/contact", 320], ["/signin", 390],
  ["/airport/past", 1440], ["/airport/present", 768], ["/airport/future", 1024],
  ["/admin", 1440], ["/admin/website?tab=travel", 320],
  ["/admin/airport?tab=archive", 390], ["/admin/schedules", 320],
  ["/admin/products?tab=seatmaps", 768], ["/admin/settings?tab=contact", 1024],
  ["/admin/check-in", 320], ["/admin/bookings/new", 390],
];
async function geometry(page, label) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: page overflow`);
}
async function references(page, label) {
  const broken = await page.evaluate(() => [...document.querySelectorAll("[aria-controls],[aria-labelledby],[aria-describedby]")]
    .filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden")
    // Closed popup content may legitimately be unmounted; tabs and open controls must resolve.
    .flatMap(element => ["aria-controls", "aria-labelledby", "aria-describedby"].flatMap(attr => (attr === "aria-controls" && element.getAttribute("aria-expanded") === "false" ? [] : element.getAttribute(attr)?.split(/\s+/) ?? [])
      .filter(id => id && !document.getElementById(id)).map(id => `${element.tagName}#${element.id} ${attr}=${id}`))));
  assert.deepEqual(broken, [], `${label}: broken ARIA relationships`);
}
try {
  for (const lang of ["en", "ar"]) {
    const { context, prefix, current, dict } = await cutoverContext(browser, lang, true);
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(`${lang}: ${error.message}`));
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(`${lang}: ${message.text()}`); });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const [route, width] of routes) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}${prefix}${route || "/"}`, { waitUntil: "networkidle" });
      await page.locator("main h1").waitFor();
      assert.equal(await page.locator("html").getAttribute("dir"), lang === "ar" ? "rtl" : "ltr");
      assert.equal(await page.locator("html").getAttribute("lang"), lang);
      assert.ok(!/not found|page not found/i.test(await page.locator("main h1").first().innerText()));
      await geometry(page, `${lang} ${route}`);
      await references(page, `${lang} ${route}`);
      results.push({ lang, route: route || "/", width, passed: true });
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}${prefix}/book?step=flights`, { waitUntil: "networkidle" });
    const breakdown = page.getByTestId("mobile-booking-breakdown-trigger");
    await breakdown.focus();
    await page.keyboard.press("Enter");
    const priceSheet = page.getByRole("dialog");
    await priceSheet.waitFor();
    await priceSheet.getByRole("button", { name: dict["common.close"], exact: true }).waitFor();
    await geometry(page, `${lang} mobile price sheet`);
    await page.screenshot({ path: path.join(out, `price-sheet-${lang}-390.png`) });
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      assert.ok(await priceSheet.evaluate(element => element.contains(document.activeElement)), "Price sheet traps keyboard focus");
    }
    await page.keyboard.press("Escape");
    await priceSheet.waitFor({ state: "hidden" });
    assert.ok(await breakdown.evaluate(element => document.activeElement === element), "Price sheet returns focus to its trigger");
    await page.goto(`${base}${prefix}/`, { waitUntil: "networkidle" });
    const calendarTrigger = page.locator("#search-depart");
    await calendarTrigger.focus();
    await page.keyboard.press("Enter");
    const calendar = page.getByRole("dialog");
    await calendar.waitFor();
    await page.keyboard.press("ArrowRight");
    assert.ok(await calendar.evaluate(element => element.contains(document.activeElement)), "Date keyboard navigation stays within calendar");
    await page.keyboard.press("Escape");
    await calendar.waitFor({ state: "hidden" });
    assert.ok(await calendarTrigger.evaluate(element => document.activeElement === element), "Calendar returns focus to its trigger");
    results.push({ lang, route: "Mobile price sheet and calendar keyboard", width: 390, passed: true });

    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(`${base}${prefix}/manage/${current.ref}/seats`, { waitUntil: "networkidle" });
    const grid = page.getByRole("grid");
    await grid.waitFor();
    assert.equal(await grid.evaluate(element => getComputedStyle(element).direction), "ltr", "Aircraft geometry never mirrors");
    const initial = grid.locator('button[tabindex="0"]');
    await initial.focus();
    await page.keyboard.press("Home");
    const portSeat = await page.evaluate(() => ({ label: document.activeElement.getAttribute("aria-label"), x: document.activeElement.getBoundingClientRect().x }));
    await page.keyboard.press("ArrowRight");
    const starboardSeat = await page.evaluate(() => ({ label: document.activeElement.getAttribute("aria-label"), x: document.activeElement.getBoundingClientRect().x }));
    assert.ok(portSeat.label && starboardSeat.label && portSeat.label !== starboardSeat.label);
    assert.ok(starboardSeat.x > portSeat.x, "Right arrow follows physical LTR seat geometry in both languages");
    await page.keyboard.press("Tab");
    assert.equal(await grid.evaluate(element => element.contains(document.activeElement)), false, "Seat grid has one tab stop and permits exit");
    await geometry(page, `${lang} seat map`);
    await page.screenshot({ path: path.join(out, `seats-${lang}-320.png`), fullPage: true });

    await page.goto(`${base}${prefix}/manage/${current.ref}/contact`, { waitUntil: "networkidle" });
    for (const id of ["c-email", "c-phone"]) assert.equal(await page.locator(`#${id}`).evaluate(element => getComputedStyle(element).direction), "ltr");
    await page.locator("#c-email").fill("invalid-email");
    await page.getByRole("button", { name: dict["common.save"], exact: true }).click();
    const invalid = page.locator('#c-email[aria-invalid="true"]');
    await invalid.waitFor();
    const errorId = await invalid.getAttribute("aria-describedby");
    assert.ok(errorId, "Invalid email describes its error");
    assert.ok(await page.locator(`[id="${errorId}"]`).isVisible());
    assert.equal(await invalid.inputValue(), "invalid-email", "Validation retains the draft");
    assert.ok(await invalid.evaluate(element => document.activeElement === element), "First invalid field receives focus");
    await references(page, `${lang} invalid contact`);

    await page.goto(`${base}${prefix}/boarding-pass/${current.ref}/out/0`, { waitUntil: "networkidle" });
    const card = page.locator("main article");
    await card.getByText(current.ref, { exact: true }).waitFor();
    assert.ok(await card.getByText(current.outbound.number, { exact: true }).evaluate(element => getComputedStyle(element).direction === "ltr"));
    await page.evaluate(() => { window.__phase9Printed = false; window.print = () => { window.__phase9Printed = true; }; });
    await page.getByRole("button", { name: dict["bp.print"], exact: true }).click();
    assert.ok(await page.evaluate(() => window.__phase9Printed));
    await page.emulateMedia({ media: "print" });
    assert.ok(await card.isVisible());
    assert.equal(await page.locator("header:visible").count(), 0);
    assert.equal(await page.locator("footer:visible").count(), 0);
    await geometry(page, `${lang} boarding pass print`);
    await page.screenshot({ path: path.join(out, `pass-${lang}-print.png`), fullPage: true });
    await page.emulateMedia({ media: "screen" });
    await page.goto(`${base}${prefix}/manage/${current.ref}`, { waitUntil: "networkidle" });
    await page.goto(`${base}${prefix}/manage/${current.ref}/contact`, { waitUntil: "networkidle" });
    await page.goBack({ waitUntil: "networkidle" });
    assert.ok(new URL(page.url()).pathname.endsWith(`/manage/${current.ref}`));
    await page.goForward({ waitUntil: "networkidle" });
    await page.locator("#c-email").waitFor();
    assert.equal(await page.locator("#c-email").inputValue(), current.contact.email, "Invalid unsaved edit never persisted");
    results.push({ lang, route: "PNR seat keyboard/contact errors/print/back-forward", width: 320, passed: true });
    await context.close();
  }
  assert.deepEqual(errors, [], "No uncaught runtime errors");
  assert.deepEqual(consoleErrors, [], "No console errors or hydration warnings");
  console.log(`PASS ${results.length} compact certification cases`);
  await fs.writeFile(path.join(out, "results.json"), JSON.stringify({ results, errors, consoleErrors }, null, 2));
} finally {
  await browser.close();
  await server?.close();
}
