import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { networkContext } from "../tests/smoke/phase6b2c1-network.mjs";
import { interactive } from "../tests/smoke/phase6b2b-correction-01.mjs";

const output = path.resolve("scratch/phase6b2c1-screenshots");
fs.mkdirSync(output, { recursive: true });
const surfaces = ["destination-list", "destination-basics", "destination-route", "destination-public", "destination-seo", "schedule-create", "schedule-edit", "network-validation", "network-failure"];
const server = await preview({ preview: { port: 4180, strictPort: false } });
const baseUrl = "http://localhost:" + server.httpServer.address().port;
const browser = await chromium.launch({ channel: process.platform === "win32" ? "msedge" : undefined, headless: true });
const rows = [];
try {
  for (const lang of ["en", "ar"]) for (const width of [390, 768, 1440]) for (const surface of surfaces) {
    const { context, prefix, dict } = await networkContext(browser, lang);
    context.setDefaultTimeout(15000);
    const page = await context.newPage(); await page.setViewportSize({ width, height: width === 390 ? 844 : width === 768 ? 1024 : 900 });
    try {
      await page.goto(baseUrl + prefix + "/admin/destinations/AMM"); await interactive(page, "#de-city-en");
      await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem("gza.network.v1"));
        const d = s.destinations.find(d => d.code === "AMM");
        d.airportName.ar = "مطار الملكة علياء الدولي – عمّان، المملكة الأردنية الهاشمية";
        d.active = false; localStorage.setItem("gza.network.v1", JSON.stringify(s));
      });
      await page.reload(); await interactive(page, "#de-city-en");
      if (surface === "destination-list") { await page.goto(baseUrl + prefix + "/admin/destinations"); await page.getByText(dict["adm.common.inactive"], { exact: true }).filter({ visible: true }).first().waitFor(); }
      else if (["destination-route", "destination-public", "destination-seo"].includes(surface)) {
        await page.getByRole("tab", { name: dict[`adm.dest.tab.${surface.split("-")[1]}`], exact: true }).click();
        if (surface === "destination-public") await page.locator("#de-photo").waitFor();
      } else if (surface.startsWith("schedule-")) {
        await page.goto(baseUrl + prefix + "/admin/schedules?destination=AMM");
        await page.getByRole("button", { name: dict[surface === "schedule-create" ? "adm.sch.new" : "adm.common.edit"], exact: true }).filter({ visible: true }).first().click();
        await interactive(page, "#sc-number");
        assert.equal(await page.locator("#sc-dest").isDisabled(), surface === "schedule-edit");
      } else if (surface === "network-validation") {
        await page.fill("#de-timezone", "Bad/Timezone"); await page.getByRole("button", { name: dict["adm.edit.save"], exact: true }).click();
        await page.locator('#de-timezone[aria-invalid="true"]').waitFor();
        assert.equal(await page.locator(":focus").getAttribute("id"), "de-timezone");
      } else if (surface === "network-failure") {
        await page.evaluate(() => localStorage.setItem("gza.network.v1", "{network-corrupt")); await page.reload(); await page.getByRole("alert").waitFor();
      }
      await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].every(d => { const r = d.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }));
      assert.equal(await page.locator("html").getAttribute("dir"), lang === "ar" ? "rtl" : "ltr");
      const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, technical: [...document.querySelectorAll("#de-code,#de-timezone,#de-blockMinutes,#sc-number,#sc-dep,#sc-arr")].map(n => ({ id: n.id, dir: n.dir })) }));
      assert.ok(geometry.scrollWidth <= width + 1 && geometry.bodyWidth <= width + 1, `${surface} overflow ${geometry.scrollWidth}/${width}`);
      assert.ok(geometry.technical.every(n => n.dir === "ltr"), "Technical fields remain LTR");
      const file = `${surface}-${lang}-${width}.png`; await page.screenshot({ path: path.join(output, file), fullPage: true });
      rows.push({ surface, lang, width, file, ...geometry }); console.log(`Captured ${rows.length}/54 ${file}`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); await server.close(); fs.writeFileSync(path.join(output, "matrix.json"), JSON.stringify(rows, null, 2)); }
assert.equal(rows.length, 54);
