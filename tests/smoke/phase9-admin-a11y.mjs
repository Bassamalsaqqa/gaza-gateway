import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { cutoverContext } from "./phase6b2c2b-cutover.mjs";

// Real panels and mandatory interactions, using private canonical fixtures rather than fallback URLs.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(root, "scratch/phase9-admin");
await fs.mkdir(out, { recursive: true });
const base = process.env.PHASE9_TEST_URL ?? "http://127.0.0.1:4192";
let server;
if (!process.env.PHASE9_TEST_URL) {
  server = await createServer({ root, server: { host: "127.0.0.1", port: 4192, strictPort: true }, logLevel: "error" });
  await server.listen();
}
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [], errors = [], consoleErrors = [];
async function overflow(page, label) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: document overflow`);
}
async function focusInside(page, dialog) {
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    assert.ok(await dialog.evaluate(element => element.contains(document.activeElement)), "Modal contains keyboard focus");
  }
  await page.keyboard.press("Shift+Tab");
  assert.ok(await dialog.evaluate(element => element.contains(document.activeElement)));
}
async function panels(page, label) {
  const tabs = page.getByRole("tab");
  assert.ok(await tabs.count(), `${label}: tabs exist`);
  for (const tab of await tabs.all()) {
    const id = await tab.getAttribute("aria-controls");
    assert.ok(id);
    const panel = page.locator(`[id="${id}"]`);
    assert.equal(await panel.count(), 1, `${label}: each tab references one real panel`);
    assert.equal(await panel.getAttribute("role"), "tabpanel");
    assert.equal(await panel.getAttribute("aria-labelledby"), await tab.getAttribute("id"));
    const active = await tab.getAttribute("aria-selected") === "true";
    assert.equal(await panel.isVisible(), active);
    assert.equal(Boolean((await panel.textContent()).trim()), active, "Only active panel owns the real body");
  }
  assert.equal(await page.locator('[role="tab"][aria-selected="true"]').count(), 1);
}
try {
  for (const lang of ["en", "ar"]) {
    const { context, prefix, current, dict } = await cutoverContext(browser, lang, true);
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(`${lang}: ${error.message}`));
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(`${lang}: ${message.text()}`); });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${base}${prefix}/admin/customers`, { waitUntil: "networkidle" });
    const customerPath = await page.locator('main a[href*="/admin/customers/"]').first().getAttribute("href");
    assert.ok(customerPath, "Canonical guest customer detail link exists");
    const routes = ["/admin/website", "/admin/airport", "/admin/products", "/admin/settings", "/admin/analytics",
      "/admin/destinations/AMM", `/admin/flights/${current.outbound.id}`, `/admin/bookings/${current.ref}`];
    for (const route of [...routes.map(route => prefix + route), customerPath]) {
      await page.goto(base + route, { waitUntil: "networkidle" });
      await page.getByRole("tab").first().waitFor();
      await panels(page, `${lang} ${route}`);
      results.push({ lang, route, passed: true });
    }

    await page.goto(`${base}${prefix}/admin/products`, { waitUntil: "networkidle" });
    const tabs = page.getByRole("tab");
    await tabs.first().focus();
    await page.keyboard.press(lang === "ar" ? "ArrowLeft" : "ArrowRight");
    await page.waitForFunction(() => document.querySelectorAll('[role="tab"]')[1]?.getAttribute("aria-selected") === "true");
    await panels(page, `${lang} switched products`);
    await page.keyboard.press("Tab");
    const activePanel = page.getByRole("tabpanel");
    assert.ok(await activePanel.evaluate(element => element === document.activeElement), "Tab enters the named panel");
    assert.ok(await activePanel.evaluate(element => parseFloat(getComputedStyle(element).outlineWidth) >= 2), "Focused panel has a visible ring");

    await page.goto(`${base}${prefix}/admin/website?tab=travel`, { waitUntil: "networkidle" });
    if (lang === "ar") await page.getByRole("button", { name: "العربية", exact: true }).click();
    const point = page.locator(`#tr-pt-prepare-1-${lang}`);
    await point.waitFor();
    const label = page.locator(`label[for="tr-pt-prepare-1-${lang}"]`);
    assert.match(await label.textContent(), lang === "ar" ? /عنصر القائمة 1 \(AR\)/ : /Checklist item 1 \(EN\)/);
    assert.equal(await point.evaluate(element => element.labels.length), 1);

    await page.goto(`${base}${prefix}/admin/schedules`, { waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: dict["adm.sch.searchLabel"], exact: true }).waitFor();
    await page.getByRole("combobox", { name: dict["adm.sch.destination"], exact: true }).waitFor();
    const create = page.getByRole("button", { name: dict["adm.sch.new"], exact: true });
    await create.focus();
    await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog");
    await sheet.waitFor();
    await focusInside(page, sheet);
    await page.keyboard.press("Escape");
    await sheet.waitFor({ state: "hidden" });
    assert.ok(await create.evaluate(element => document.activeElement === element));

    const search = page.getByRole("button", { name: dict["adm.search.title"], exact: true });
    await search.focus();
    await page.keyboard.press("Enter");
    const searchDialog = page.getByRole("dialog");
    await searchDialog.getByRole("combobox").fill(current.ref);
    await searchDialog.getByText(current.ref, { exact: false }).first().waitFor();
    await focusInside(page, searchDialog);
    await page.keyboard.press("Escape");
    await searchDialog.waitFor({ state: "hidden" });
    assert.ok(await search.evaluate(element => document.activeElement === element));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}${prefix}/admin`, { waitUntil: "networkidle" });
    const menu = page.getByRole("button", { name: dict["adm.shell.openNav"], exact: true });
    await menu.focus();
    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog");
    await drawer.waitFor();
    await focusInside(page, drawer);
    await overflow(page, `${lang} admin drawer`);
    await page.screenshot({ path: path.join(out, `drawer-${lang}-390.png`) });
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });
    assert.ok(await menu.evaluate(element => document.activeElement === element));
    results.push({ lang, route: "Tabs/labels/sheet/search/drawer keyboard", passed: true });

    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["/admin/flights", "/admin/schedules"]) {
        await page.goto(`${base}${prefix}${route}`, { waitUntil: "networkidle" });
        await page.getByRole("button", { name: dict[route === "/admin/flights" ? "adm.flight.quickEdit" : "adm.common.edit"], exact: true }).filter({ visible: true }).first().waitFor();
        await overflow(page, `${lang} ${route} ${width}`);
        assert.equal(await page.locator("html").getAttribute("dir"), lang === "ar" ? "rtl" : "ltr");
        assert.ok(!(await page.locator("main").innerText()).includes("adm.common.actions"), "Actions header is translated");
        results.push({ lang, route, width, passed: true });
      }
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  await fs.writeFile(path.join(out, "results.json"), JSON.stringify({ results, errors, consoleErrors }, null, 2));
  console.log(`PASS ${results.length} focused admin cases`);
} finally {
  await browser.close();
  await server?.close();
}
