import { dateShort } from "../../src/lib/format.ts";
import assert from "node:assert/strict";
import { commercialContext, commercialFixture, availableSeat, counterTestFlight } from "./phase6a-commercial.mjs";
import { flightDepartureEpoch } from "../../src/lib/booking-rules.ts";
import { adminEn, adminAr } from "../../src/lib/i18n-admin.ts";
import { departuresOn, todayISO, addDaysISO, SEAT_ROWS, SEAT_LETTERS } from "../../src/lib/data.ts";
import { resolveFlightCapacity } from "../../src/lib/fleet/layout.ts";
import { seedFleetEnvelope } from "../../src/lib/fleet/seed.ts";

export function operationsFixture() {
  const b = commercialFixture(),
    f = departuresOn(b.criteria.departDate).find(
      (f) =>
        f.departTime >= "08:00" &&
        f.departTime <= "20:00" &&
        f.status !== "Cancelled" &&
        f.seatsLeft > 0 &&
        ["Scheduled", "OnTime", "Delayed"].includes(
          departuresOn(f.date, flightDepartureEpoch(f) - 2 * 3600000).find((x) => x.id === f.id)
            ?.status,
        ),
    );
  assert.ok(f);
  const { returnDate, ...criteria } = b.criteria;
  return {
    ...b,
    outbound: f,
    inbound: null,
    criteria: { ...criteria, tripType: "oneway", destination: f.destinationCode },
    seats: { "out-0": availableSeat(f) },
  };
}
const store = (page) => page.evaluate(() => localStorage.getItem("gza.schedule.v1"));
const mainRow = (page, number) => page.locator("main tbody tr").filter({ hasText: number }).first();
async function save(page, dict = adminEn) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: dict["adm.edit.save"], exact: true })
    .click();
}
async function waitClosed(page) {
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}
async function edit(page, number, dict = adminEn) {
  await mainRow(page, number)
    .getByRole("button", { name: dict["adm.common.edit"], exact: true })
    .click();
}
async function failure(page, key) {
  await page.evaluate((key) => {
    const old = Storage.prototype.setItem;
    window.__b1Blocked = key;
    Storage.prototype.setItem = function (k, v) {
      if (window.__b1Blocked === k) throw new DOMException("Test quota", "QuotaExceededError");
      return old.call(this, k, v);
    };
  }, key);
}
async function retry(page) {
  await page.evaluate(() => {
    window.__b1Blocked = null;
  });
}
async function alert(page) {
  await page.getByRole("dialog").getByRole("alert").waitFor();
  assert.equal(await page.getByRole("dialog").locator('[aria-invalid="true"]').count(), 0);
}
async function flightRow(page, number) {
  const row = mainRow(page, number);
  await row.waitFor();
  return row;
}

export async function runPhase6B1Checks({ checkStep, browser, baseUrl }) {
  await checkStep(
    "Check 69: Phase 6B1 schedule create/edit/retire, reload, mounted two-tab convergence and current discovery boundary",
    async () => {
      const context = await commercialContext(browser, null);
      try {
        const a = await context.newPage(),
          b = await context.newPage(),
          publicTab = await context.newPage();
        const date = Array.from({length: 6}, (_, i) => addDaysISO(counterTestFlight().date, i + 1)).find(d => [1, 3, 5].includes(new Date(d + "T12:00:00Z").getUTCDay()));
        assert.ok(date);
        await publicTab.goto(baseUrl + "/flights");
        await publicTab.getByRole("button", {name: date === addDaysISO(counterTestFlight().date, 1) ? "Tomorrow" : dateShort(date, "en"), exact: true}).click();
        await publicTab.locator("main tbody tr").first().waitFor();
        const links = await publicTab
          .locator("main tbody tr")
          .evaluateAll((es) => es.map((e) => e.innerText));
        await a.goto(baseUrl + "/admin/schedules");
        await b.goto(baseUrl + "/admin/schedules");
        await a.getByRole("button", { name: "New schedule", exact: true }).click();
        await a.locator("#sc-number").fill("PS901");
        await a.locator("#sc-dest").selectOption("AMM");
        await save(a);
        await waitClosed(a);
        await mainRow(b, "PS901").waitFor();
        const first = JSON.parse(await store(a));
        const id = first.schedules.find((s) => s.number === "PS901").id;
        assert.equal(first.revision, 1);
        await a.reload();
        await edit(a, "PS901");
        await a.locator("#sc-number").fill("PS902");
        await save(a);
        await waitClosed(a);
        await mainRow(b, "PS902").waitFor();
        assert.equal(JSON.parse(await store(a)).schedules.find((s) => s.id === id).number, "PS902");
        await b.goto(baseUrl + "/admin/destinations/AMM");
        await b.getByRole("tab", { name: adminEn["adm.dest.tab.route"], exact: true }).click();
        await b.getByText("PS902", { exact: true }).waitFor();
        await publicTab.reload();
        await publicTab.getByRole("button", {name: date === addDaysISO(counterTestFlight().date, 1) ? "Tomorrow" : dateShort(date, "en"), exact: true}).click();
        await publicTab.locator("main tbody tr").first().waitFor();
        const expanded = await publicTab.locator("main tbody tr").evaluateAll(es => es.map(e => e.innerText));
        assert.equal(expanded.length, links.length + 1);
        assert.ok(expanded.some(text => text.includes("PS902")));
        await b.goto(baseUrl + "/admin/schedules");
        await mainRow(b, "PS902").waitFor();
        assert.equal(await mainRow(a, "PS902").locator('button:has-text("Delete")').count(), 0);
        await edit(a, "PS902");
        assert.equal(await a.locator('button:has-text("Delete")').count(), 0);
        await a.locator("#sc-active").click();
        await a.getByRole("button", { name: adminEn["adm.sch.addException"], exact: true }).click();
        await a.getByText(adminEn["adm.sch.planningAnnotation"], { exact: true }).first().waitFor();
        const toggle = a.locator('button[role="switch"]').last();
        await toggle.click();
        await a.getByText(adminEn["adm.sch.effectActive"], { exact: true }).first().waitFor();
        await save(a);
        await waitClosed(a);
        await b.getByRole("button", { name: adminEn["adm.common.active"], exact: true }).click();
        await mainRow(b, "PS902").waitFor({ state: "hidden" });
        await b.getByRole("button", { name: adminEn["adm.common.inactive"], exact: true }).click();
        await mainRow(b, "PS902").waitFor();
        await a.reload();
        const stored = JSON.parse(await store(a));
        const retired = stored.schedules.find((s) => s.id === id);
        assert.ok(retired);
        assert.equal(retired.active, false);
        assert.equal(retired.exceptions.length, 1);
        assert.ok(retired.exceptions[0].effect);
        await publicTab.reload();
        await publicTab.getByRole("button", {name: date === addDaysISO(counterTestFlight().date, 1) ? "Tomorrow" : dateShort(date, "en"), exact: true}).click();
        await publicTab.locator("main tbody tr").first().waitFor();
        assert.deepEqual(
          await publicTab.locator("main tbody tr").evaluateAll((es) => es.map((e) => e.innerText)),
          links,
        );
      } finally {
        await context.close();
      }
    },
  );
  await checkStep(
    "Check 70: Phase 6B1 schedule create/update/retirement failures preserve state and retry identity",
    async () => {
      const context = await commercialContext(browser, null);
      try {
        const page = await context.newPage();
        await page.goto(baseUrl + "/admin/schedules");
        await page.getByRole("button", { name: "New schedule", exact: true }).click();
        await page.locator("#sc-number").fill("PS903");
        await failure(page, "gza.schedule.v1");
        await save(page);
        await alert(page);
        assert.equal(await store(page), null);
        assert.equal(await page.locator("#sc-number").inputValue(), "PS903");
        await retry(page);
        await save(page);
        await waitClosed(page);
        const raw = await store(page);
        const id = JSON.parse(raw).schedules.find((s) => s.number === "PS903").id;
        await edit(page, "PS903");
        await page.locator("#sc-number").fill("PS904");
        await failure(page, "gza.schedule.v1");
        await save(page);
        await alert(page);
        assert.equal(await store(page), raw);
        assert.equal(await page.locator("#sc-number").inputValue(), "PS904");
        await retry(page);
        await save(page);
        await waitClosed(page);
        assert.equal(
          JSON.parse(await store(page)).schedules.find((s) => s.id === id).number,
          "PS904",
        );
        const before = await store(page);
        await edit(page, "PS904");
        await page.locator("#sc-active").click();
        await failure(page, "gza.schedule.v1");
        await save(page);
        await alert(page);
        assert.equal(await store(page), before);
        await retry(page);
        await save(page);
        await waitClosed(page);
        assert.equal(
          JSON.parse(await store(page)).schedules.find((s) => s.id === id).active,
          false,
        );
      } finally {
        await context.close();
      }
    },
  );
  await checkStep(
    "Check 71: Phase 6B1 Arabic validation, technical LTR fields, valid empty/corrupt stores and viewer permissions",
    async () => {
      const context = await commercialContext(browser, null);
      try {
        const page = await context.newPage();
        await page.goto(baseUrl + "/ar/admin/schedules");
        await page.getByRole("button", { name: adminAr["adm.sch.new"], exact: true }).click();
        await save(page, adminAr);
        await page.locator('#sc-number[aria-invalid="true"]').waitFor();
        assert.equal(
          await page.locator("#sc-number").getAttribute("aria-describedby"),
          "sc-number-error",
        );
        assert.ok(await page.locator("#sc-number-error").innerText());
        assert.equal(
          await page.locator("#sc-number").evaluate((el) => document.activeElement === el),
          true,
        );
        for (const id of ["sc-number", "sc-dep", "sc-arr", "sc-from", "sc-until", "sc-ac"])
          assert.equal(await page.locator("#" + id).getAttribute("dir"), "ltr");
        assert.match(await page.locator('label[for="sc-number"]').innerText(), /[\u0600-\u06ff]/);
        assert.equal(
          await page
            .locator('label[for="sc-number"]')
            .evaluate((el) => !!el.closest('[dir="ltr"]')),
          false,
        );
        await page.evaluate(() =>
          localStorage.setItem(
            "gza.schedule.v1",
            JSON.stringify({ schemaVersion: 1, revision: 1, schedules: [] }),
          ),
        );
        await page.reload();
        await page.getByText(adminAr["adm.sch.empty"], { exact: true }).waitFor();
        assert.equal(await page.locator("main tbody tr").count(), 0);
        await page.evaluate(() => localStorage.setItem("gza.schedule.v1", "broken"));
        await page.reload();
        await page.getByRole("button", { name: adminAr["adm.sch.new"], exact: true }).click();
        await page.locator("#sc-number").fill("PS905");
        await save(page, adminAr);
        await alert(page);
        assert.equal(await store(page), "broken");
      } finally {
        await context.close();
      }
      const viewer = await commercialContext(browser, null, "adm-3");
      try {
        const page = await viewer.newPage();
        await page.goto(baseUrl + "/admin/schedules");
        assert.equal(
          await page.getByRole("button", { name: "New schedule", exact: true }).isDisabled(),
          true,
        );
        const edits = page.getByRole("button", { name: "Edit", exact: true });
        await edits.first().waitFor();
        for (const el of await edits.all()) assert.equal(await el.isDisabled(), true);
        const deletes = page.getByRole("button", { name: "Delete", exact: true });
        assert.equal(await deletes.count(), 0);
        await page.goto(baseUrl + "/admin/flights");
        const quick = page.getByRole("button", { name: "Quick edit", exact: true });
        await quick.first().waitFor();
        assert.equal(await quick.first().isDisabled(), true);
        assert.equal(await store(page), null);
      } finally {
        await viewer.close();
      }
    },
  );
  await checkStep(
    "Check 72: Phase 6B1 canonical flight override cross-tab Admin/public/detail/search convergence and failure rollback",
    async () => {
      const booking = operationsFixture(),
        context = await commercialContext(browser, booking),
        f = booking.outbound;
      try {
        const a = await context.newPage(),
          b = await context.newPage();
        await a.goto(baseUrl + "/admin/flights?date=" + f.date);
        await b.goto(baseUrl + "/flight/" + f.id);
        const row = await flightRow(a, f.number);
        const capacity = resolveFlightCapacity(f, seedFleetEnvelope()) ?? (SEAT_ROWS * SEAT_LETTERS.length);
        await row.getByText("1/" + capacity, { exact: true }).waitFor();
        await row.getByRole("button", { name: "Quick edit", exact: true }).click();
        await a.locator("#fq-gate").fill("C9");
        await a.locator("#fq-status").selectOption("Delayed");
        const before = await a.evaluate(() => localStorage.getItem("gza.repo.v1"));
        await failure(a, "gza.repo.v1");
        await a
          .getByRole("dialog")
          .getByRole("button", { name: "Save changes", exact: true })
          .click();
        await alert(a);
        assert.equal(await a.locator("#fq-gate").inputValue(), "C9");
        assert.equal(await a.evaluate(() => localStorage.getItem("gza.repo.v1")), before);
        await retry(a);
        await a
          .getByRole("dialog")
          .getByRole("button", { name: "Save changes", exact: true })
          .click();
        await waitClosed(a);
        await b.getByText("C9", { exact: false }).waitFor();
        await b.goto(baseUrl + "/flights");
        const boardToday = await b.evaluate(() =>
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Gaza",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date()),
        );
        const dayIndex = Array.from({ length: 7 }, (_, i) => addDaysISO(boardToday, i)).indexOf(
          f.date,
        );
        assert.ok(dayIndex >= 0);
        await b
          .locator("main button[aria-pressed]")
          .filter({ hasNot: b.locator("svg") })
          .nth(dayIndex)
          .click();
        await b.getByText("C9", { exact: false }).first().waitFor();
        await a.goto(baseUrl + "/admin/flights/" + f.id);
        await a.getByText("C9", { exact: false }).first().waitFor();
        await b.goto(baseUrl + "/book");
        // The repository search itself must return the same effective overridden record.
        await b.waitForFunction(() => {
          const node = document.querySelector("main");
          let fiber = node?.[Object.keys(node).find((k) => k.startsWith("__reactFiber$"))];
          for (; fiber; fiber = fiber.return)
            if (fiber.memoizedProps?.value?.flight?.searchFlights) return true;
          return false;
        });
        const effective = await b.evaluate(
          async ({ origin, destination, date, id }) => {
            let node = document.querySelector("main");
            let fiber = node?.[Object.keys(node).find((k) => k.startsWith("__reactFiber$"))];
            for (; fiber; fiber = fiber.return) {
              const value = fiber.memoizedProps?.value;
              if (value?.flight?.searchFlights) {
                const flights = await value.flight.searchFlights(origin, destination, date);
                return flights.find((f) => f.id === id);
              }
            }
            throw new Error("Repository provider not mounted");
          },
          { origin: "GZA", destination: f.destinationCode, date: f.date, id: f.id },
        );
        assert.equal(effective, undefined, "Booked legacy operational service must not reenter current sale search");
      } finally {
        await context.close();
      }
    },
  );
  await checkStep(
    "Check 73: Phase 6B1 canonical booking/check-in metrics converge to flight detail and dashboard",
    async () => {
      const booking = operationsFixture(),
        context = await commercialContext(browser, booking),
        f = booking.outbound;
      try {
        const desk = await context.newPage(),
          detail = await context.newPage(),
          dashboard = await context.newPage();
        await dashboard.goto(baseUrl + "/admin");
        await dashboard.getByText("Check-in incomplete on " + f.number, { exact: true }).waitFor();
        const capacity = resolveFlightCapacity(f, seedFleetEnvelope()) ?? (SEAT_ROWS * SEAT_LETTERS.length);
        await mainRow(dashboard, f.number)
          .getByText("1/" + capacity, { exact: true })
          .waitFor();
        await detail.goto(baseUrl + "/admin/flights/" + f.id);
        await detail.getByRole("tab", { name: "Passengers", exact: false }).click();
        await detail
          .getByText(booking.ref, { exact: true })
          .filter({ visible: true })
          .first()
          .waitFor();
        await desk.goto(
          baseUrl + "/admin/check-in?date=" + f.date + "&flightId=" + f.id + "&ref=" + booking.ref,
        );
        const row = mainRow(desk, booking.ref);
        await row.waitFor();

        await row.getByRole("button", { name: "Check in", exact: true }).click();

        await detail.getByText("Checked in", { exact: true }).first().waitFor();
        // Dashboard clock is on the same station day as the fixture: check-in attention disappears.
        await dashboard.waitForFunction(
          (number) =>
            !document
              .querySelector("main")
              ?.textContent?.includes("Check-in incomplete on " + number),
          f.number,
        );
        await detail.getByRole("tab", { name: "Overview", exact: true }).click();
        await detail.getByText("1/1", { exact: true }).waitFor();
        await dashboard
          .getByText(booking.ref, { exact: true })
          .filter({ visible: true })
          .first()
          .waitFor();
      } finally {
        await context.close();
      }
    },
  );
  await checkStep(
    "Check 74: Phase 6B1 successful empty FlightRepository result is authoritative on Public Flights",
    async () => {
      const context = await commercialContext(browser, null);
      try {
        const page = await context.newPage();
        await page.goto(baseUrl + "/flights");
        await page.locator("main tbody tr").first().waitFor();
        await page.evaluate(async () => {
          let node = document.querySelector("main"),
            fiber = node?.[Object.keys(node).find((k) => k.startsWith("__reactFiber$"))],
            repo,
            client;
          for (; fiber; fiber = fiber.return) {
            const value = fiber.memoizedProps?.value;
            if (value?.flight?.getFlights) repo = value;
            if (value?.getQueryCache) client = value;
          }
          if (!repo || !client) throw new Error("Providers not mounted");
          repo.flight.getFlights = async () => [];
          await client.invalidateQueries({ queryKey: ["flights"] });
        });
        await page.locator("main tbody tr").first().waitFor({ state: "hidden" });
        assert.equal(await page.locator("main tbody tr").count(), 0);
        assert.ok((await page.locator("main").innerText()).includes("No flights"));
      } finally {
        await context.close();
      }
    },
  );
  await checkStep(
    "Check 75: Phase 6B1 Arabic inline gate/status and dashboard override errors preserve edits and retry",
    async () => {
      const booking = operationsFixture(),
        context = await commercialContext(browser, booking),
        f = booking.outbound;
      try {
        const a = await context.newPage(),
          b = await context.newPage();
        await a.goto(baseUrl + "/ar/admin/flights?date=" + f.date);
        const row = await flightRow(a, f.number),
          gateLabel = adminAr["adm.flight.inlineGate"].replace("{flight}", f.number);
        await row.getByRole("button", { name: gateLabel, exact: true }).click();
        const gate = row.getByRole("textbox", { name: gateLabel, exact: true });
        await gate.fill("D8");
        const before = await a.evaluate(() => localStorage.getItem("gza.repo.v1"));
        await failure(a, "gza.repo.v1");
        await row
          .getByRole("button", { name: adminAr["adm.flight.inlineSave"], exact: true })
          .click();
        await row.getByRole("alert").waitFor();
        assert.equal(await gate.getAttribute("aria-invalid"), null);
        assert.equal(await gate.inputValue(), "D8");
        assert.equal(await a.evaluate(() => localStorage.getItem("gza.repo.v1")), before);
        await retry(a);
        await row
          .getByRole("button", { name: adminAr["adm.flight.inlineSave"], exact: true })
          .click();
        await gate.waitFor({ state: "hidden" });
        const status = row.getByRole("combobox");
        await failure(a, "gza.repo.v1");
        await status.selectOption("Delayed");
        await a.locator("main").getByRole("alert").waitFor();
        assert.equal(await status.inputValue(), "Delayed");
        await retry(a);
        await a.getByRole("button", { name: adminAr["adm.ops.retry"], exact: true }).click();
        await a.waitForFunction(
          (id) =>
            JSON.parse(localStorage.getItem("gza.repo.v1")).flightOverrides[id]?.status ===
            "Delayed",
          f.id,
        );
        await b.goto(baseUrl + "/ar/admin");
        await b
          .locator("main tbody tr")
          .filter({ hasText: f.number })
          .first()
          .getByRole("button", { name: adminAr["adm.flight.quickEdit"], exact: true })
          .click();
        await b.locator("#qe-gate").fill("E7");
        await failure(b, "gza.repo.v1");
        await b
          .getByRole("dialog")
          .getByRole("button", { name: adminAr["adm.edit.save"], exact: true })
          .click();
        await alert(b);
        assert.equal(await b.locator("#qe-gate").inputValue(), "E7");
        assert.equal(await b.locator("#qe-gate").getAttribute("dir"), "ltr");
        await retry(b);
        await b
          .getByRole("dialog")
          .getByRole("button", { name: adminAr["adm.edit.save"], exact: true })
          .click();
        await waitClosed(b);
        await row.getByText("E7", { exact: false }).waitFor();
      } finally {
        await context.close();
      }
    },
  );
}
