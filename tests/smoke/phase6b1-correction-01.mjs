import assert from "node:assert/strict";
import fs from "node:fs";
import { commercialContext } from "./phase6a-commercial.mjs";
import { operationsFixture } from "./phase6b1-operations.mjs";
import { adminEn, adminAr } from "../../src/lib/i18n-admin.ts";

async function providers(page, action) {
  await page.waitForFunction(() => {
    const node = document.querySelector("main");
    let fiber = node?.[Object.keys(node).find(k => k.startsWith("__reactFiber$"))];
    for (; fiber; fiber = fiber.return) if (fiber.memoizedProps?.value?.flight?.getFlights) return true;
    return false;
  });
  await page.evaluate(async ({ domain, mode }) => {
    const node = document.querySelector("main");
    let fiber = node?.[Object.keys(node).find(k => k.startsWith("__reactFiber$"))], repo, client;
    for (; fiber; fiber = fiber.return) {
      const value = fiber.memoizedProps?.value;
      if (value?.flight?.getFlights) repo = value;
      if (value?.getQueryCache) client = value;
    }
    if (!repo || !client) throw Error("Canonical providers not found");
    const method = domain === "flight" ? "getFlights" : "list", key = domain === "flight" ? ["flights"] : ["bookings"];
    window.__correctionOriginal ??= {};
    window.__correctionOriginal[domain] ??= repo[domain][method];
    for (const q of client.getQueryCache().findAll({ queryKey: key })) q.setOptions({ ...q.options, retry: false });
    if (mode === "failure") {
      repo[domain][method] = async () => { throw Error("Injected read failure"); };
      await client.invalidateQueries({ queryKey: key });
    } else if (mode === "empty") {
      repo[domain][method] = async () => [];
      await client.invalidateQueries({ queryKey: key });
    } else if (mode === "loading") {
      repo[domain][method] = () => new Promise(() => {});
      void client.resetQueries({ queryKey: key });
    }
  }, action);
}
async function blockStorage(page) {
  await page.evaluate(() => {
    const old = Storage.prototype.setItem;
    window.__correctionBlock = true;
    Storage.prototype.setItem = function (key, value) {
      if (window.__correctionBlock && key === "gza.repo.v1") throw new DOMException("Test quota", "QuotaExceededError");
      return old.call(this, key, value);
    };
  });
}
async function unblockStorage(page) { await page.evaluate(() => { window.__correctionBlock = false; }); }
async function save(page, dict) { await page.getByRole("dialog").getByRole("button", { name: dict["adm.edit.save"], exact: true }).click(); }
async function capture(page, name) {
  fs.mkdirSync("scratch/correction01-screenshots", { recursive: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, name);
  await page.screenshot({ path: "scratch/correction01-screenshots/" + name + ".png", fullPage: true });
}
export async function runPhase6B1Correction01Checks({ checkStep, browser, baseUrl }) {
  await checkStep("Check 76: Phase 6B1 Correction 01 Dashboard read failures/loading never become healthy zero metrics (EN/AR)", async () => {
    for (const [locale, dict] of [["en", adminEn], ["ar", adminAr]]) for (const domain of ["flight", "booking"]) {
      const booking = operationsFixture(), context = await commercialContext(browser, booking);
      try {
        const page = await context.newPage();
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(baseUrl + (locale === "ar" ? "/ar" : "") + "/admin");
        await page.getByTestId("dashboard-value-pax").getByText("1", { exact: true }).waitFor();
        await page.locator("main tbody tr").filter({ hasText: booking.outbound.number }).waitFor();
        await providers(page, { domain, mode: "failure" });
        const state = page.getByTestId(domain === "flight" ? "dashboard-ops-state" : "dashboard-commercial-state");
        await state.locator('xpath=self::*[@data-state="error"]').waitFor();
        assert.equal(await state.getAttribute("role"), "alert");
        assert.equal(await state.innerText(), dict[domain === "flight" ? "adm.dash.opsError" : "adm.dash.commercialError"]);
        for (const key of domain === "flight" ? ["dep", "arr"] : ["bks", "pax"]) {
          assert.equal(await page.getByTestId("dashboard-value-" + key).innerText(), dict["adm.dash.unavailable"]);
        }
        if (domain === "flight") {
          assert.equal(await page.locator("main tbody tr").filter({ hasText: booking.outbound.number }).count(), 0);
          assert.equal(await page.getByTestId("dashboard-value-bks").innerText(), "0");
        } else {
          await page.locator("main tbody tr").filter({ hasText: booking.outbound.number }).waitFor();
          assert.equal(await page.getByText(dict["adm.recent.empty"], { exact: true }).count(), 0);
          assert.equal(await page.getByText("0/168", { exact: true }).count(), 0);
        }
        await page.getByText(dict["adm.dash.content"], { exact: true }).waitFor();
        assert.equal(await page.getByText(dict["adm.attn.none"], { exact: true }).count(), 0);
        for (const width of [1440, 768, 390]) {
          await page.setViewportSize({ width, height: 900 });
          await capture(page, "dashboard-" + locale + "-" + domain + "-error-" + width);
        }
        await providers(page, { domain, mode: "empty" });
        await state.waitFor({ state: "hidden" });
        for (const key of domain === "flight" ? ["dep", "arr"] : ["bks", "pax"]) assert.equal(await page.getByTestId("dashboard-value-" + key).innerText(), "0");
        await providers(page, { domain, mode: "loading" });
        await state.locator('xpath=self::*[@data-state="loading"]').waitFor();
        for (const key of domain === "flight" ? ["dep", "arr"] : ["bks", "pax"]) assert.equal(await page.getByTestId("dashboard-value-" + key).innerText(), dict["adm.dash.loading"]);
      } finally { await context.close(); }
    }
  });
  await checkStep("Check 77: Phase 6B1 Correction 01 Dashboard gate/time validation blocks mutations and preserves storage retries (EN/AR)", async () => {
    for (const [locale, dict] of [["en", adminEn], ["ar", adminAr]]) {
      const booking = operationsFixture(), context = await commercialContext(browser, booking);
      try {
        const page = await context.newPage();
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(baseUrl + (locale === "ar" ? "/ar" : "") + "/admin");
        const row = page.locator("main tbody tr").filter({ hasText: booking.outbound.number });
        await row.getByRole("button", { name: dict["adm.flight.quickEdit"], exact: true }).click();
        await page.evaluate(() => {
          const node = document.querySelector("main");
          let fiber = node?.[Object.keys(node).find(k => k.startsWith("__reactFiber$"))];
          for (; fiber; fiber = fiber.return) {
            const repo = fiber.memoizedProps?.value;
            if (repo?.flight?.setOverride) {
              const old = repo.flight.setOverride.bind(repo.flight);
              window.__correctionWrites = 0;
              repo.flight.setOverride = async (...args) => { window.__correctionWrites++; return old(...args); };
              return;
            }
          }
          throw Error("Repository missing");
        });
        const before = await page.evaluate(() => localStorage.getItem("gza.repo.v1"));
        await page.locator("#qe-gate").fill("A!");
        await page.locator("#qe-note").fill("Retry edits retained");
        await save(page, dict);
        await page.getByRole("dialog").getByRole("alert").waitFor();
        assert.equal(await page.locator("#qe-gate").getAttribute("aria-invalid"), "true");
        assert.equal(await page.locator("#qe-gate").getAttribute("aria-describedby"), "qe-error");
        assert.equal(await page.locator("#qe-revised").getAttribute("aria-invalid"), null);
        assert.equal(await page.evaluate(() => document.activeElement.id), "qe-gate");
        assert.equal(await page.locator("#qe-error").innerText(), dict["adm.flight.gateError"]);
        assert.equal(await page.evaluate(() => window.__correctionWrites), 0);
        await capture(page, "dashboard-gate-" + locale + "-1440");
        await page.locator("#qe-gate").fill("Q4");
        await page.locator("#qe-revised").evaluate(el => { el.type = "text"; });
        await page.locator("#qe-revised").fill("25:99");
        await save(page, dict);
        assert.equal(await page.locator("#qe-revised").getAttribute("aria-invalid"), "true");
        assert.equal(await page.locator("#qe-revised").getAttribute("aria-describedby"), "qe-error");
        assert.equal(await page.locator("#qe-gate").getAttribute("aria-invalid"), null);
        assert.equal(await page.evaluate(() => document.activeElement.id), "qe-revised");
        assert.equal(await page.locator("#qe-error").innerText(), dict["adm.flight.revisedError"]);
        assert.equal(await page.evaluate(() => window.__correctionWrites), 0);
        assert.equal(await page.evaluate(() => localStorage.getItem("gza.repo.v1")), before);
        await page.locator("#qe-revised").fill("13:22");
        await blockStorage(page);
        await save(page, dict);
        await page.getByRole("dialog").getByRole("alert").waitFor();
        assert.equal(await page.getByRole("dialog").locator('[aria-invalid="true"]').count(), 0);
        assert.equal(await page.locator("#qe-error").innerText(), dict["adm.ops.saveError"]);
        assert.equal(await page.locator("#qe-gate").inputValue(), "Q4");
        assert.equal(await page.locator("#qe-revised").inputValue(), "13:22");
        assert.equal(await page.locator("#qe-note").inputValue(), "Retry edits retained");
        assert.equal(await page.evaluate(() => localStorage.getItem("gza.repo.v1")), before);
        await page.setViewportSize({ width: 390, height: 900 });
        await capture(page, "dashboard-storage-" + locale + "-390");
        await unblockStorage(page);
        await save(page, dict);
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        const override = await page.evaluate(id => JSON.parse(localStorage.getItem("gza.repo.v1")).flightOverrides[id], booking.outbound.id);
        assert.equal(override.gate, "Q4"); assert.equal(override.revisedDepart, "13:22");
        assert.equal(await page.evaluate(() => window.__correctionWrites), 2);
      } finally { await context.close(); }
    }
  });
  await checkStep("Check 78: Phase 6B1 Correction 01 mobile gate errors are visibly associated and storage failure is general (EN/AR)", async () => {
    for (const [locale, dict] of [["en", adminEn], ["ar", adminAr]]) {
      const booking = operationsFixture(), context = await commercialContext(browser, booking);
      try {
        const page = await context.newPage();
        await page.setViewportSize({ width: 390, height: 900 });
        await page.goto(baseUrl + (locale === "ar" ? "/ar" : "") + "/admin/flights?date=" + booking.outbound.date);
        const label = dict["adm.flight.inlineGate"].replace("{flight}", booking.outbound.number);
        await page.getByRole("button", { name: label, exact: true }).click();
        const input = page.getByRole("textbox", { name: label, exact: true });
        await input.fill("A!");
        const before = await page.evaluate(() => localStorage.getItem("gza.repo.v1"));
        await page.getByRole("button", { name: dict["adm.flight.inlineSave"], exact: true }).click();
        await page.getByRole("alert").filter({ hasText: dict["adm.flight.gateError"] }).waitFor();
        assert.equal(await input.getAttribute("aria-invalid"), "true");
        const errorId = await input.getAttribute("aria-describedby");
        assert.equal(errorId, "gate-error-mobile-" + booking.outbound.id);
        const error = page.locator('[id="' + errorId + '"]');
        assert.equal(await error.count(), 1); assert.equal(await error.isVisible(), true);
        assert.equal(await error.innerText(), dict["adm.flight.gateError"]);
        assert.equal(await input.getAttribute("dir"), "ltr");
        assert.equal(await page.evaluate(() => localStorage.getItem("gza.repo.v1")), before);
        await capture(page, "mobile-gate-" + locale + "-390");
        await input.fill("R5");
        await blockStorage(page);
        await page.getByRole("button", { name: dict["adm.flight.inlineSave"], exact: true }).click();
        await page.getByRole("alert").filter({ hasText: dict["adm.ops.saveError"] }).waitFor();
        assert.equal(await input.getAttribute("aria-invalid"), null);
        assert.equal(await input.getAttribute("aria-describedby"), null);
        assert.equal(await input.inputValue(), "R5");
        assert.equal(await page.evaluate(() => localStorage.getItem("gza.repo.v1")), before);
        await unblockStorage(page);
        await page.getByRole("button", { name: dict["adm.flight.inlineSave"], exact: true }).click();
        await input.waitFor({ state: "hidden" });
      } finally { await context.close(); }
    }
  });
}
