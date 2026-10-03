import assert from "node:assert/strict";
import { commercialContext, commercialFixture, availableSeat } from "./phase6a-commercial.mjs";
import { admin2En, admin2Ar } from "../../src/lib/i18n-admin2.ts";
import { flightDepartureEpoch } from "../../src/lib/booking-rules.ts";
import { LocalFlightRepository } from "../../src/lib/repositories/flight-repository.ts";
import { RepoStorageCoordinator } from "../../src/lib/repositories/storage.ts";

async function associated(page, id) {
  const input = page.locator(`#${id}`);
  await input.locator('xpath=self::*[@aria-invalid="true"]').waitFor();
  const errorId = await input.getAttribute("aria-describedby");
  assert.ok(errorId);
  assert.ok((await page.locator(`#${errorId}`).innerText()).trim());
  await page.waitForFunction((id) => document.activeElement?.id === id, id);
  assert.equal(await input.evaluate((el) => document.activeElement === el), true);
}
async function blockStorage(page) {
  await page.evaluate(() => {
    window.__c2Fail = true;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "gza.repo.v1" && window.__c2Fail)
        throw new DOMException("test quota", "QuotaExceededError");
      return original.call(this, k, v);
    };
  });
}
async function unblock(page) {
  await page.evaluate(() => {
    window.__c2Fail = false;
  });
}
async function noInvalid(dialog) {
  assert.equal(await dialog.locator('[aria-invalid="true"]').count(), 0);
}
const rowFor = (page, b) => page.locator("tbody tr").filter({ hasText: b.ref });

export async function runCommercialCorrection02Checks({ checkStep, browser, baseUrl }) {
  await checkStep(
    "Check 66: Phase 6A Correction 02 — effective cleared gate, Arabic Date direction, selected-date and eligibility truth",
    async () => {
      const b = commercialFixture(),
        coordinator = new RepoStorageCoordinator({ inMemoryOnly: true });
      const flights = new LocalFlightRepository(coordinator);
      await flights.setOverride(b.outbound.id, { gate: "", status: "Scheduled" });
      const override = await flights.getOverride(b.outbound.id);
      assert.equal((await flights.getFlightById(b.outbound.id)).gate, "");
      for (const locale of ["en", "ar"]) {
        const dict = locale === "ar" ? admin2Ar : admin2En,
          prefix = locale === "ar" ? "/ar" : "";
        const context = await commercialContext(browser, b);
        await context.addInitScript(
          ({ id, override, clock }) => {
            if (!localStorage.getItem("c2-gate-init")) {
              const state = JSON.parse(localStorage.getItem("gza.repo.v1"));
              state.flightOverrides[id] = override;
              localStorage.setItem("gza.repo.v1", JSON.stringify(state));
              localStorage.setItem("c2-gate-init", "1");
            }
            const now = Number(localStorage.getItem("c2-clock") || clock),
              RealDate = window.Date;
            window.Date = class extends RealDate {
              constructor(...args) {
                if (!args.length) super(now);
                else super(...args);
              }
              static now() {
                return now;
              }
            };
          },
          { id: b.outbound.id, override, clock: flightDepartureEpoch(b.outbound) - 48 * 3600000 },
        );
        try {
          const page = await context.newPage();
          await page.goto(
            `${baseUrl}${prefix}/admin/check-in?date=${b.outbound.date}&flightId=${b.outbound.id}&ref=${b.ref}`,
          );
          await page.getByTestId(`desk-gate-${b.outbound.id}`).waitFor();
          assert.equal(await page.getByTestId(`desk-gate-${b.outbound.id}`).innerText(), "—");
          assert.equal(await page.locator("#desk-date").getAttribute("dir"), "ltr");
          assert.equal(await page.locator("#desk-date").inputValue(), b.outbound.date);
          const label = page.locator('label[for="desk-date"]');
          if (locale === "ar") assert.match(await label.innerText(), /[\u0600-\u06ff]/);
          assert.equal(await label.locator('[dir="ltr"]').count(), 0);
          if (locale === "ar") assert.equal(
            await page
              .locator("main label")
              .evaluateAll((labels) => labels.filter((el) => el.closest('[dir="ltr"]')).length),
            0,
          );
          await rowFor(page, b).getByText(dict["a2.ci.st.early"], { exact: true }).first().waitFor();
          assert.ok((await page.locator("main").innerText()).includes(dict["a2.ci.today"]));
          assert.ok(
            !/today's departures|مغادرات اليوم/i.test(await page.locator("main").innerText()),
          );
          await page.evaluate(
            ({ clock, id }) => {
              localStorage.setItem("c2-clock", String(clock));
              const state = JSON.parse(localStorage.getItem("gza.repo.v1"));
              state.flightOverrides[id].gate = "A1";
              localStorage.setItem("gza.repo.v1", JSON.stringify(state));
            },
            { clock: flightDepartureEpoch(b.outbound) - 30 * 60000, id: b.outbound.id },
          );
          await page.reload();
          await rowFor(page, b).getByText(dict["a2.ci.st.closed"], { exact: true }).first().waitFor();
          assert.equal(await page.getByTestId(`desk-gate-${b.outbound.id}`).innerText(), "A1");
        } finally {
          await context.close();
        }
      }
      flights.destroy();
    },
  );

  await checkStep(
    "Check 67: Phase 6A Correction 02 — bilingual Booking Detail field validation versus storage alerts and value-preserving retry",
    async () => {
      for (const locale of ["en", "ar"]) {
        const b = commercialFixture(),
          context = await commercialContext(browser, b),
          prefix = locale === "ar" ? "/ar" : "",
          dict = locale === "ar" ? admin2Ar : admin2En;
        try {
          const page = await context.newPage();
          await page.goto(`${baseUrl}${prefix}/admin/bookings/${b.ref}`);
          await page.getByRole("button", { name: dict["a2.bd.editContact"], exact: true }).click();
          const dialog = page.getByRole("dialog"),
            save = dialog.getByRole("button", { name: dict["a2.save"], exact: true });
          await page.fill("#bd-email", "not-an-email");
          await save.click();
          await associated(page, "bd-email");
          assert.notEqual(await page.locator("#bd-phone").getAttribute("aria-invalid"), "true");
          await page.fill("#bd-email", "c2retry@example.com");
          await blockStorage(page);
          await save.click();
          await dialog.getByRole("alert").filter({ hasText: dict["a6.err.storage"] }).waitFor();
          await noInvalid(dialog);
          assert.equal(await page.locator("#bd-email").inputValue(), "c2retry@example.com");
          assert.equal(
            await page.evaluate(
              () => JSON.parse(localStorage.getItem("gza.repo.v1")).bookings[0].contact.email,
            ),
            b.contact.email,
          );
          await unblock(page);
          await save.click();
          await dialog.waitFor({ state: "hidden" });
          await page.getByText("c2retry@example.com", { exact: true }).waitFor();
          await page.getByRole("button", { name: dict["a2.bd.changeSeat"], exact: true }).click();
          const id = `bd-seat-out-${b.passengers[0].id}`;
          await page.fill(`#${id}`, "INVALID");
          await save.click();
          await associated(page, id);
          assert.notEqual(
            await page.locator(`#bd-seat-in-${b.passengers[0].id}`).getAttribute("aria-invalid"),
            "true",
          );
          await page.fill(`#${id}`, availableSeat(b.outbound, 1));
          await blockStorage(page);
          await save.click();
          await dialog.getByRole("alert").filter({ hasText: dict["a6.err.storage"] }).waitFor();
          await noInvalid(dialog);
          assert.equal(await page.locator(`#${id}`).inputValue(), availableSeat(b.outbound, 1));
          await unblock(page);
          await save.click();
          await dialog.waitFor({ state: "hidden" });
          await page.getByRole("tab", { name: dict["a2.bd.tab.checkin"], exact: true }).click();
          assert.ok((await page.locator("main").innerText()).includes(dict["a2.bd.bp.notIssued"]));
          assert.ok(!/Not issued yet|لم تُصدر بعد/.test(await page.locator("main").innerText()));
        } finally {
          await context.close();
        }
      }
    },
  );

  await checkStep(
    "Check 68: Phase 6A Correction 02 — bilingual Check-in field associations and storage failure without unrelated invalid inputs",
    async () => {
      for (const locale of ["en", "ar"]) {
        const b = commercialFixture(),
          context = await commercialContext(browser, b),
          prefix = locale === "ar" ? "/ar" : "",
          dict = locale === "ar" ? admin2Ar : admin2En;
        try {
          const page = await context.newPage();
          await page.goto(
            `${baseUrl}${prefix}/admin/check-in?date=${b.outbound.date}&flightId=${b.outbound.id}&ref=${b.ref}`,
          );
          await rowFor(page, b)
            .getByRole("button", { name: dict["a2.ci.viewExtras"], exact: true })
            .click();
          const dialog = page.getByRole("dialog"),
            complete = dialog.getByRole("button", { name: dict["a2.ci.checkIn"], exact: true });
          await page.fill("#sheet-ci-doc", "");
          await complete.click();
          await associated(page, "sheet-ci-doc");
          assert.notEqual(
            await page.locator("#sheet-ci-seat").getAttribute("aria-invalid"),
            "true",
          );
          await page.fill("#sheet-ci-doc", "C2-KEPT-DOC");
          await page.fill("#sheet-ci-seat", "INVALID");
          await complete.click();
          await associated(page, "sheet-ci-seat");
          assert.notEqual(await page.locator("#sheet-ci-doc").getAttribute("aria-invalid"), "true");
          await page.fill("#sheet-ci-seat", availableSeat(b.outbound));
          await blockStorage(page);
          await complete.click();
          await dialog.getByRole("alert").filter({ hasText: dict["a6.err.storage"] }).waitFor();
          await noInvalid(dialog);
          assert.equal(await page.locator("#sheet-ci-doc").inputValue(), "C2-KEPT-DOC");
          assert.equal(
            await page.locator("#sheet-ci-seat").inputValue(),
            availableSeat(b.outbound),
          );
          assert.deepEqual(
            await page.evaluate(
              () => JSON.parse(localStorage.getItem("gza.repo.v1")).bookings[0].checkedIn.out,
            ),
            [],
          );
          await unblock(page);
          await complete.click();
          await dialog.waitFor({ state: "hidden" });
          await rowFor(page, b)
            .getByRole("link", { name: dict["a2.ci.issue"], exact: true })
            .waitFor();
          assert.ok(
            !/Issue boarding pass|إصدار بطاقة الصعود/.test(await rowFor(page, b).innerText()),
          );
        } finally {
          await context.close();
        }
      }
    },
  );
}
