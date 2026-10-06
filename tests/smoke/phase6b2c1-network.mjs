import assert from "node:assert/strict";
import { fleetContext } from "./phase6b2b-fleet.mjs";
import { interactive } from "./phase6b2b-correction-01.mjs";
import { seedNetworkEnvelope } from "../../src/lib/network/seed.ts";
import { networkEn, networkAr } from "../../src/lib/i18n-network.ts";

export async function networkContext(browser, lang = "en", staff = "adm-1") {
  const fixture = await fleetContext(browser, lang, staff);
  await fixture.context.addInitScript(seed => {
    if (!localStorage.getItem("gza.network.v1")) localStorage.setItem("gza.network.v1", JSON.stringify(seed));
  }, seedNetworkEnvelope());
  return { ...fixture, network: lang === "ar" ? networkAr : networkEn };
}

async function basics(page, baseUrl, prefix) {
  await page.goto(baseUrl + prefix + "/admin/destinations/AMM");
  await interactive(page, "#de-city-en");
}
const bytes = page => page.evaluate(() => localStorage.getItem("gza.network.v1"));
const save = (page, dict) => page.getByRole("button", { name: dict["adm.edit.save"], exact: true }).click();

export async function runPhase6B2C1Checks({ checkStep, browser, baseUrl }) {
  for (const [i, lang] of ["en", "ar"].entries()) {
    await checkStep(`Check ${105 + i}: Phase 6B2C1 ${lang} mounted Network cross-tab persistence, dirty conflict, inactive lifecycle and booked compatibility survives Network deactivation`, async () => {
      const { context, prefix, dict, network, b: booking } = await networkContext(browser, lang);
      try {
        const a = await context.newPage(), b = await context.newPage(), list = await context.newPage();
        await basics(a, baseUrl, prefix); await basics(b, baseUrl, prefix);
        await list.goto(baseUrl + prefix + "/admin/destinations");
        const otherStores = await a.evaluate(() => Object.fromEntries(["gza.repo.v1", "gza.commercial.v1", "gza.fleet.v1"].map(k => [k, localStorage.getItem(k)])));
        await a.fill("#de-city-en", "Amman Network Audit");
        await a.fill("#de-city-ar", "عمّان مرجع الشبكة");
        await a.fill("#de-blockMinutes", "91");
        await a.locator("#de-active").click();
        await save(a, dict);
        await b.waitForFunction(() => document.querySelector("#de-city-en")?.value === "Amman Network Audit");
        await list.getByText(lang === "ar" ? "عمّان مرجع الشبكة" : "Amman Network Audit", { exact: true }).first().waitFor();
        await b.reload(); await interactive(b, "#de-city-en");
        assert.equal(await b.locator("#de-blockMinutes").inputValue(), "91");
        assert.equal(await b.locator("#de-active").getAttribute("aria-checked"), "false");
        await b.fill("#de-city-en", "Retained dirty city");
        await a.fill("#de-city-en", "Remote canonical city"); await save(a, dict);
        await b.getByRole("alert").filter({ hasText: network["network.remoteChanged"] }).waitFor();
        assert.equal(await b.locator("#de-city-en").inputValue(), "Retained dirty city");
        assert.equal(await b.getByRole("button", { name: dict["adm.edit.save"], exact: true }).isDisabled(), true);
        await b.getByRole("button", { name: network["network.reload"], exact: true }).click();
        assert.equal(await b.locator("#de-city-en").inputValue(), "Remote canonical city");
        assert.deepEqual(await a.evaluate(() => Object.fromEntries(["gza.repo.v1", "gza.commercial.v1", "gza.fleet.v1"].map(k => [k, localStorage.getItem(k)]))), otherStores);
        // Enter by client navigation under the check-in fixture clock to avoid prerender clock mismatch.
        await list.goto(baseUrl + prefix + `/manage/${booking.ref}`);
        await list.locator(`a[href="${prefix}/flights"]`).first().click();
        await list.waitForURL("**/flights");
        await list.locator("main tbody tr").first().waitFor();
        assert.equal(JSON.parse(await bytes(a)).destinations.find(d => d.code === "AMM").active, false);
      } finally { await context.close(); }
    });
    await checkStep(`Check ${107 + i}: Phase 6B2C1 ${lang} associated validation focus, quota rollback, preserved edits and retry`, async () => {
      const { context, prefix, dict, network } = await networkContext(browser, lang);
      try {
        const page = await context.newPage(); await basics(page, baseUrl, prefix);
        const errors = []; page.on("pageerror", e => errors.push(e.message));
        const before = await bytes(page);
        for (const [id, bad, good, key] of [
          ["de-timezone", "Bad/Timezone", "Asia/Amman", "network.invalid.timezone"],
          ["de-city-ar", " ", "عمّان", "network.invalid.label"],
          ["de-blockMinutes", "19", "90", "network.invalid.blockMinutes"],
        ]) {
          await page.fill("#" + id, bad); await save(page, dict);
          await page.locator("#" + id + '[aria-invalid="true"]').waitFor();
          await page.waitForFunction(id => document.activeElement?.id === id, id);
          assert.equal(await page.locator(":focus").getAttribute("id"), id);
          const described = await page.locator("#" + id).getAttribute("aria-describedby");
          assert.equal(await page.locator("#" + described).innerText(), network[key]);
          assert.equal(await bytes(page), before);
          await page.fill("#" + id, good);
        }
        await page.fill("#de-city-en", "Retry retained city");
        await page.evaluate(() => {
          const original = Storage.prototype.setItem; window.__networkFail = true;
          Storage.prototype.setItem = function(k, v) { if (window.__networkFail && k === "gza.network.v1") throw new DOMException("quota", "QuotaExceededError"); return original.call(this, k, v); };
        });
        await save(page, dict);
        await page.getByRole("alert").filter({ hasText: network["network.saveError"] }).waitFor();
        assert.equal(await bytes(page), before);
        assert.equal(await page.locator('[data-testid="network-basics"] [aria-invalid="true"]').count(), 0);
        assert.equal(await page.locator("#de-city-en").inputValue(), "Retry retained city");
        assert.equal(await page.getByText(dict["adm.dest.saved"].replace("{code}", "AMM"), { exact: true }).count(), 0);
        await page.evaluate(() => window.__networkFail = false); await save(page, dict);
        await page.waitForFunction(() => JSON.parse(localStorage.getItem("gza.network.v1")).destinations.find(d => d.code === "AMM").city.en === "Retry retained city");
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
    await checkStep(`Check ${109 + i}: Phase 6B2C1 ${lang} corrupt Network isolates Schedule history/edit, Fleet, Commercial and existing PNR`, async () => {
      const { context, prefix, dict, network, b } = await networkContext(browser, lang);
      try {
        const page = await context.newPage(), writer = await context.newPage();
        const errors = []; page.on("pageerror", e => errors.push(e.message));
        await basics(page, baseUrl, prefix); await basics(writer, baseUrl, prefix);
        await writer.evaluate(() => localStorage.setItem("gza.network.v1", "{network-corrupt"));
        await page.getByRole("alert").filter({ hasText: network["network.unavailable"] }).waitFor();
        await page.getByRole("tab", { name: dict["adm.dest.tab.public"], exact: true }).click();
        await page.locator("#de-photo").waitFor(); assert.equal(await page.locator("#de-desc").getAttribute("readonly"), "");
        await page.goto(baseUrl + prefix + "/admin/schedules?destination=AMM");
        await page.getByRole("alert").filter({ hasText: network["network.unavailable"] }).waitFor();
        assert.equal(await page.getByRole("button", { name: dict["adm.sch.new"], exact: true }).isDisabled(), true);
        await page.getByRole("button", { name: dict["adm.common.edit"], exact: true }).filter({ visible: true }).first().click();
        await interactive(page, "#sc-number");
        assert.equal(await page.locator("#sc-dest").isDisabled(), true); assert.equal(await page.locator("#sc-dir").isDisabled(), true);
        await page.fill("#sc-number", "PS 991"); await page.getByRole("dialog").getByRole("button", { name: dict["adm.edit.save"], exact: true }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem("gza.schedule.v1")).schedules.some(s => s.number === "PS 991")));
        await page.goto(baseUrl + prefix + "/admin/products?tab=aircraft"); await page.locator('[data-testid="fleet-aircraft"]').waitFor();
        await page.getByRole("tab", { name: dict["adm.prod.tab.fares"], exact: true }).click();
        await page.locator("main").getByRole("button", { name: dict["adm.common.edit"], exact: true }).first().waitFor();
        await page.goto(baseUrl + prefix + `/manage/${b.ref}/seats`); await page.getByRole("grid").waitFor();
        assert.equal(await bytes(page), "{network-corrupt"); assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
    await checkStep(`Check ${111 + i}: Phase 6B2C1 ${lang} destination schedule context, inactive planning, locked route and read-only content/SEO/viewer`, async () => {
      const { context, prefix, dict, network } = await networkContext(browser, lang);
      try {
        const page = await context.newPage(); await basics(page, baseUrl, prefix);
        await page.locator("#de-active").click(); await save(page, dict);
        await page.waitForFunction(() => !JSON.parse(localStorage.getItem("gza.network.v1")).destinations.find(d => d.code === "AMM").active);
        for (const tab of ["public", "seo"]) {
          await page.getByRole("tab", { name: dict[`adm.dest.tab.${tab}`], exact: true }).click();
          assert.equal(await page.getByRole("button", { name: dict["adm.edit.save"], exact: true }).count(), 0);
          assert.equal(await page.locator(tab === "public" ? "#de-desc" : "#de-seot").isEditable(), false);
        }
        await page.getByRole("tab", { name: dict["adm.dest.tab.route"], exact: true }).click();
        await page.locator(`a[href*="/admin/schedules?"]`).click(); await page.waitForURL("**/admin/schedules?destination=AMM");
        await page.getByRole("button", { name: dict["adm.sch.new"], exact: true }).click(); await interactive(page, "#sc-number");
        assert.equal(await page.locator("#sc-dest").inputValue(), "AMM");
        await page.fill("#sc-number", "PS 992"); await page.getByRole("dialog").getByRole("button", { name: dict["adm.edit.save"], exact: true }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        await page.getByRole("button", { name: dict["adm.common.edit"], exact: true }).filter({ visible: true }).last().click();
        await page.locator("#sc-dest").waitFor();
        assert.equal(await page.locator("#sc-dest").isDisabled(), true); assert.equal(await page.locator("#sc-dir").isDisabled(), true);
        await page.getByText(network["network.routeLocked"], { exact: true }).waitFor();
      } finally { await context.close(); }
      const viewer = await networkContext(browser, lang, "adm-3");
      try {
        const page = await viewer.context.newPage(); await basics(page, baseUrl, prefix);
        const before = await bytes(page);
        assert.equal(await page.locator("#de-city-en").isDisabled(), true);
        assert.equal(await page.getByRole("button", { name: dict["adm.edit.save"], exact: true }).isDisabled(), true);
        await page.locator("#de-city-en").press("Tab"); await page.keyboard.press("Enter");
        assert.equal(await bytes(page), before);
      } finally { await viewer.context.close(); }
    });
  }
}
