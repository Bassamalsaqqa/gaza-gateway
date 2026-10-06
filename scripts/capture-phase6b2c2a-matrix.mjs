import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { foundationContext } from "../tests/smoke/phase6b2c2a-foundation.mjs";
import { interactive } from "../tests/smoke/phase6b2b-correction-01.mjs";

const output = path.resolve("scratch/phase6b2c2a-screenshots");
fs.mkdirSync(output, { recursive: true });

const surfaces = [
  "schedule-list",
  "schedule-edit",
  "schedule-inactive",
  "schedule-legacy-annotation",
  "schedule-effect-cancellation",
  "schedule-effect-time",
  "schedule-effect-aircraft",
  "schedule-effect-extra",
  "schedule-validation",
];

const server = await preview({ preview: { port: 4182, strictPort: false } });
const baseUrl = "http://localhost:" + server.httpServer.address().port;
const browser = await chromium.launch({
  channel: process.platform === "win32" ? "msedge" : undefined,
  headless: true,
});

const rows = [];
try {
  for (const lang of ["en", "ar"]) {
    for (const width of [390, 768, 1440]) {
      for (const surface of surfaces) {
        const { context, prefix, dict } = await foundationContext(browser, lang);
        context.setDefaultTimeout(20000);
        const page = await context.newPage();
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : width === 768 ? 1024 : 900,
        });

        try {
          await page.goto(baseUrl + prefix + "/admin/schedules");
          await page.locator("main tbody tr, main ul li").filter({ visible: true }).first().waitFor();

          if (surface === "schedule-effect-aircraft") {
            await page.evaluate(() => {
              const fleet = JSON.parse(localStorage.getItem("gza.fleet.v1"));
              fleet.aircraft.find(a => a.id === "a321neo").model = "Airbus A321neo extended equipment reference for long model selection";
              localStorage.setItem("gza.fleet.v1", JSON.stringify(fleet));
            });
            await page.reload();
            await page.locator("main tbody tr, main ul li").filter({ visible: true }).first().waitFor();
          }
          if (surface === "schedule-list") {
            // Default active schedule list view
          } else if (surface === "schedule-inactive") {
            // Deactivate first schedule in store then view inactive tab
            await page.evaluate(() => {
              const s = JSON.parse(localStorage.getItem("gza.schedule.v1"));
              if (s && s.schedules && s.schedules[0]) {
                s.schedules[0].active = false;
                localStorage.setItem("gza.schedule.v1", JSON.stringify(s));
              }
            });
            await page.reload();
            await page.locator("main tbody tr, main ul li").filter({ visible: true }).first().waitFor();
            await page.getByRole("button", { name: dict["adm.common.inactive"], exact: true }).click();
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("gza.schedule.v1")).schedules.find(s => s.id === "foundation-browser").active), false);
            await page.locator("main tbody tr, main ul li").filter({ visible: true }).first().waitFor();
          } else {
            // Surfaces that interact with the schedule edit sheet
            await page.getByRole("button", { name: dict["adm.common.edit"], exact: true }).filter({ visible: true }).first().click();
            await interactive(page, "#sc-number");

            if (surface === "schedule-edit") {
              assert.equal(await page.locator("#sc-dest").isDisabled(), true);
              assert.equal(await page.locator("#sc-dir").isDisabled(), true);
            } else if (surface === "schedule-legacy-annotation") {
              // Add exception without applying operational effect (planning annotation)
              await page.getByRole("button", { name: dict["adm.sch.addException"], exact: true }).click();
              await page.getByText(dict["adm.sch.planningAnnotation"], { exact: true }).first().waitFor();
            } else if (surface === "schedule-effect-cancellation") {
              // Add exception, toggle Apply to dated operations (cancelled effect)
              await page.getByRole("button", { name: dict["adm.sch.addException"], exact: true }).click();
              const toggle = page.locator('button[id^="exc-effect-toggle-"]').first();
              await toggle.click();
              await page.getByText(dict["adm.sch.effectActive"], { exact: true }).first().waitFor();
            } else if (surface === "schedule-effect-time") {
              // Add exception, select kind 'time', toggle Apply to dated operations
              await page.getByRole("button", { name: dict["adm.sch.addException"], exact: true }).click();
              const kindSelect = page.locator('select[id^="exc-kind-"]').first();
              await kindSelect.selectOption("time");
              const toggle = page.locator('button[id^="exc-effect-toggle-"]').first();
              await toggle.click();
              await page.getByText(dict["adm.sch.effectActive"], { exact: true }).first().waitFor();
              await page.locator('input[id^="exc-effect-departTime-"]').first().waitFor();
            } else if (surface === "schedule-effect-aircraft") {
              // Add exception, select kind 'aircraft', toggle Apply to dated operations
              await page.getByRole("button", { name: dict["adm.sch.addException"], exact: true }).click();
              const kindSelect = page.locator('select[id^="exc-kind-"]').first();
              await kindSelect.selectOption("aircraft");
              const toggle = page.locator('button[id^="exc-effect-toggle-"]').first();
              await toggle.click();
              await page.getByText(dict["adm.sch.effectActive"], { exact: true }).first().waitFor();
              await page.locator('select[id^="exc-effect-aircraftId-"]').first().waitFor();
              await page.locator('select[id^="exc-effect-aircraftId-"]').first().selectOption("a321neo");
            } else if (surface === "schedule-effect-extra") {
              // Add exception, select kind 'extra', toggle Apply to dated operations
              await page.getByRole("button", { name: dict["adm.sch.addException"], exact: true }).click();
              const kindSelect = page.locator('select[id^="exc-kind-"]').first();
              await kindSelect.selectOption("extra");
              await page.locator('input[id^="exc-date-"]').first().fill("2026-10-07");
              const toggle = page.locator('button[id^="exc-effect-toggle-"]').first();
              await toggle.click();
              await page.getByText(dict["adm.sch.effectActive"], { exact: true }).first().waitFor();
              await page.locator('input[id^="exc-effect-departTime-"]').first().waitFor();
            } else if (surface === "schedule-validation") {
              // Clear departure time and save to trigger field error
              await page.fill("#sc-dep", "BadTime");
              await page.getByRole("dialog").getByRole("button", { name: dict["adm.edit.save"], exact: true }).click();
              await page.locator('#sc-dep[aria-invalid="true"]').waitFor();
              assert.equal(await page.locator(":focus").getAttribute("id"), "sc-dep");
            }
          }

          await page.waitForFunction(() =>
            [...document.querySelectorAll('[role="dialog"]')].every((d) => {
              const r = d.getBoundingClientRect();
              return r.left >= -1 && r.right <= innerWidth + 1;
            })
          );

          assert.equal(
            await page.locator("html").getAttribute("dir"),
            lang === "ar" ? "rtl" : "ltr"
          );

          const geometry = await page.evaluate(() => ({
            width: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            technical: [
              ...document.querySelectorAll(
                '#sc-number,#sc-dep,#sc-arr,#sc-from,#sc-until,#sc-ac,input[id^="exc-date-"],input[id^="exc-effect-departTime-"],input[id^="exc-effect-arriveTime-"],select[id^="exc-effect-aircraftId-"]'
              ),
            ].map((n) => ({ id: n.id, dir: n.getAttribute("dir") || n.dir })),
          }));

          assert.ok(
            geometry.scrollWidth <= width + 1 && geometry.bodyWidth <= width + 1,
            `${surface} overflow ${geometry.scrollWidth}/${width}`
          );
          assert.ok(
            geometry.technical.every((n) => n.dir === "ltr"),
            "Technical fields remain LTR"
          );

          if (surface.includes("annotation") || surface.includes("effect-")) {
            const control = page.locator('input[id^="exc-detail-"]').first();
            await control.scrollIntoViewIfNeeded();
            assert.equal(await control.isVisible(), true);
            const bounds = await control.boundingBox();
            assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= await page.evaluate(() => innerHeight), "Exception editor visible in screenshot");
          }
          const file = `${surface}-${lang}-${width}.png`;
          await page.screenshot({
            path: path.join(output, file),
            fullPage: true,
          });
          rows.push({ surface, lang, width, file, ...geometry });
          console.log(`Captured ${rows.length}/54 ${file}`);
        } finally {
          await context.close();
        }
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
  fs.writeFileSync(path.join(output, "matrix.json"), JSON.stringify(rows, null, 2));
}

assert.equal(rows.length, 54);
console.log("All 54 visual matrix cells captured successfully!");
