import { currentDeparturesOn, currentArrivalsOn } from "../helpers/current-service-fixture.ts";
import assert from "node:assert/strict";
import {
  todayISO,
  addDaysISO,
  isSeatAvailable,
  cabinZone,
} from "../../src/lib/data.ts";
import { flightDepartureEpoch } from "../../src/lib/booking-rules.ts";
import { bookingTotal } from "../../src/lib/domain/pricing.ts";

export function availableSeat(f, index = 0) {
  const seats = [],
    zone = cabinZone("economy");
  for (let row = zone.firstRow; row <= zone.lastRow; row++)
    for (const letter of ["A", "B", "C", "D", "E", "F"])
      if (isSeatAvailable(f.id, row, letter)) seats.push(`${row}${letter}`);
  return seats[index];
}
export function counterTestFlight() {
  return currentDeparturesOn(addDaysISO(todayISO(), 5)).find(f => f.aircraftId === "a320neo");
}
export function commercialFixture() {
  // Preconstructed PNR on current-service identity; legacy compatibility has separate fixtures.
  const f = counterTestFlight();
  // A route need not operate its return on the following weekday. Select a real compiled service.
  const inbound = Array.from({ length: 7 }, (_, i) => currentArrivalsOn(addDaysISO(f.date, i + 1)))
    .flat().find((x) => x.originCode === f.destinationCode && x.status !== "Cancelled" && x.seatsLeft > 0);
  assert.ok(inbound);
  const date = inbound.date;
  return {
    ref: "GZA-C601",
    createdAt: "2026-01-01T10:13:00Z",
    channel: "desk",
    ownerEmail: null,
    status: "confirmed",
    criteria: {
      tripType: "round",
      origin: "GZA",
      destination: f.destinationCode,
      departDate: f.date,
      returnDate: date,
      adults: 1,
      children: 0,
      infants: 0,
      cabin: "economy",
    },
    outbound: f,
    inbound,
    fareId: "classic",
    passengers: [
      {
        id: "pax-C601-0",
        type: "adult",
        firstName: "Audit",
        lastName: "Example",
        dob: "1980-01-01",
        nationality: "PS",
        document: "AUDIT-123",
      },
    ],
    seats: { "out-0": availableSeat(f), "in-0": availableSeat(inbound) },
    extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
    contact: { email: "audit@example.com", phone: "+970599000000" },
    checkedIn: { out: [], in: [] },
    total: 100,
  };
}

export async function commercialContext(browser, b, staffId = "adm-1") {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(
    ({ b, staffId, clock, currentId }) => {
      if (!localStorage.getItem("gza.admin.v1"))
        localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId, overrides: {} }));
      if (!localStorage.getItem("gza.repo.v1"))
        localStorage.setItem(
          "gza.repo.v1",
          JSON.stringify({ schemaVersion: 1, bookings: b ? [b] : [], flightOverrides: b ? Object.fromEntries([b.outbound, b.inbound].filter(f => f?.id.startsWith("svc1-")).map(f => [f.id, {status:"Scheduled"}])) : { [currentId]: { status: "Scheduled" } } }),
        );
      const RealDate = Date;
      window.Date = class extends RealDate {
        constructor(...args) {
          if (!args.length) super(clock);
          else super(...args);
        }
        static now() {
          return clock;
        }
      };
    },
    { b, staffId, currentId: counterTestFlight().id, clock: flightDepartureEpoch(b?.outbound ?? counterTestFlight()) - 2 * 3600000 },
  );
  return context;
}
async function stored(page, ref) {
  return page.evaluate(
    (ref) => JSON.parse(localStorage.getItem("gza.repo.v1")).bookings.find((b) => b.ref === ref),
    ref,
  );
}
async function saveSheet(page) {
  const d = page.getByRole("dialog");
  await d.getByRole("button", { name: /^Save$|^حفظ$/ }).click();
  await d.waitFor({ state: "hidden" });
}
async function storageMatch(page, ref, field, value) {
  await page.waitForFunction(
    ({ ref, field, value }) => {
      let b = JSON.parse(localStorage.getItem("gza.repo.v1")).bookings.find((b) => b.ref === ref);
      return JSON.stringify(field.split(".").reduce((x, k) => x[k], b)) === JSON.stringify(value);
    },
    { ref, field, value },
  );
}

export async function runCommercialChecks({ checkStep, browser, baseUrl }) {
  await checkStep(
    "Check 62: Phase 6A corrected — mounted two-tab contact/seat/Extras convergence, both legs, exact price and public-to-admin edit",
    async () => {
      const b = commercialFixture(),
        context = await commercialContext(browser, b);
      try {
        const admin = await context.newPage(),
          pub = await context.newPage();
        await admin.goto(`${baseUrl}/admin/bookings/${b.ref}`);
        await pub.goto(`${baseUrl}/manage/${b.ref}`);
        await pub.getByText(b.contact.email, { exact: true }).waitFor();
        await admin.getByRole("button", { name: /^Edit contact$/i }).click();
        await admin.fill("#bd-email", "changed@example.com");
        await saveSheet(admin);
        await pub.getByText("changed@example.com", { exact: true }).waitFor(); // no reload: real storage event + query invalidation
        await admin.getByRole("button", { name: /^Change seat$/i }).click();
        await admin.fill(`#bd-seat-out-${b.passengers[0].id}`, availableSeat(b.outbound, 1));
        await admin.fill(`#bd-seat-in-${b.passengers[0].id}`, availableSeat(b.inbound, 1));
        await saveSheet(admin);
        await storageMatch(pub, b.ref, "seats.out-0", availableSeat(b.outbound, 1));
        assert.ok((await pub.locator("main").innerText()).includes(availableSeat(b.outbound, 1)));
        await admin.getByRole("button", { name: /^Edit extras$/i }).click();
        await admin.fill(`#bd-bags-${b.passengers[0].id}`, "2");
        await admin.selectOption(`#bd-meal-${b.passengers[0].id}`, "vegetarian");
        await admin.getByRole("dialog").locator('input[value="wheelchair"]').check();
        await saveSheet(admin);
        await storageMatch(pub, b.ref, "extras.pax.0.extraBags", 2);
        const updated = await stored(pub, b.ref);
        assert.equal(updated.total, bookingTotal(updated).total);
        await pub
          .getByText(/Vegetarian/, { exact: false })
          .first()
          .waitFor();
        await pub.goto(`${baseUrl}/manage/${b.ref}/contact`);
        await pub.locator('input[type="email"]').fill("public.change@example.com");
        await pub.getByRole("button", { name: /Save contact|Save changes|Save$/i }).click();
        await admin.getByText("public.change@example.com", { exact: true }).waitFor(); // admin remains mounted
      } finally {
        await context.close();
      }
    },
  );
  await checkStep(
    "Check 63: Phase 6A corrected — desk check-in, actual public pass access, immutable seats, Undo, persistence and failed-write rollback",
    async () => {
      const b = commercialFixture(),
        context = await commercialContext(browser, b);
      try {
        const desk = await context.newPage(),
          pub = await context.newPage();
        await desk.goto(
          `${baseUrl}/admin/check-in?date=${b.outbound.date}&ref=${b.ref}&flightId=${b.outbound.id}`,
        );
        await pub.goto(`${baseUrl}/manage/${b.ref}`);
        await desk
          .locator("tbody tr")
          .filter({ hasText: b.ref })
          .getByRole("button", { name: /^Check in$/i })
          .click();
        const pass = pub.locator(`a[href*="/boarding-pass/${b.ref}/out/0"]`);
        await pass.waitFor();
        const bp = await context.newPage();
        await bp.goto(`${baseUrl}/boarding-pass/${b.ref}/out/0`);
        await bp.getByText(b.ref, { exact: false }).first().waitFor();
        assert.ok(!(await bp.locator("main").innerText()).includes("not available"));
        await bp.close();
        const detail = await context.newPage();
        await detail.goto(`${baseUrl}/admin/bookings/${b.ref}`);
        await detail.getByRole("button", { name: /^Change seat$/i }).click();
        assert.equal(await detail.locator(`#bd-seat-out-${b.passengers[0].id}`).isDisabled(), true);
        await detail
          .getByRole("dialog")
          .getByRole("button", { name: /^Cancel$/ })
          .click();
        await detail.close();
        const before = await stored(desk, b.ref);
        await desk.evaluate(() => {
          window.__failRepo = true;
          const original = Storage.prototype.setItem;
          Storage.prototype.setItem = function (k, v) {
            if (window.__failRepo && k === "gza.repo.v1")
              throw new DOMException("synthetic quota", "QuotaExceededError");
            return original.call(this, k, v);
          };
        });
        await desk.getByRole("button", { name: /Undo/i }).click();
        await desk
          .getByText(/could not be saved in this browser/i)
          .first()
          .waitFor();
        assert.deepEqual(await stored(desk, b.ref), before);
        await pass.waitFor();
        await desk.evaluate(() => {
          window.__failRepo = false;
        });
        await desk.getByRole("button", { name: /Undo/i }).click();
        await pass.waitFor({ state: "hidden" });
        const after = await stored(pub, b.ref);
        assert.deepEqual(after.checkedIn.out, []);
        assert.deepEqual(after.seats, before.seats);
        assert.deepEqual(after.passengers, before.passengers);
        assert.deepEqual(after.extras, before.extras);
        await desk.reload();
        await desk
          .locator("tbody tr")
          .filter({ hasText: b.ref })
          .getByRole("button", { name: /^Check in$/i })
          .waitFor();
        await pub.goto(`${baseUrl}/boarding-pass/${b.ref}/out/0`);
        assert.equal(await pub.getByRole("button", { name: /Print|Download/i }).count(), 0);
      } finally {
        await context.close();
      }
    },
  );
  await checkStep(
    "Check 64: Phase 6A corrected — Arabic field errors, no silent destination substitution, step prerequisites and stable storage-failure retry",
    async () => {
      const f = counterTestFlight(),
        context = await commercialContext(browser, null);
      try {
        const page = await context.newPage();
        await page.goto(`${baseUrl}/ar/admin/bookings/new`);
        await page.fill("#nb-date", f.date);
        const unserved = "DOH";
        await page.selectOption("#nb-dest", unserved);
        assert.equal(await page.locator("#nb-dest").inputValue(), unserved);
        if (!currentDeparturesOn(f.date).some((x) => x.destinationCode === unserved))
          assert.equal(await page.locator('input[name="nb-flight-choice"]').count(), 0);
        await page.selectOption("#nb-dest", f.destinationCode);
        await page.locator('input[name="nb-flight-choice"]').first().check();
        await page.getByRole("button", { name: /التالي: اختيار الأجرة/ }).click();
        await page.getByRole("button", { name: /التالي: بيانات المسافرين/ }).click();
        await page.getByRole("button", { name: /التالي: المقاعد والإضافات/ }).click();
        await page.locator('[aria-invalid="true"]').first().waitFor();
        const alert = await page.getByRole("alert").innerText();
        assert.match(alert, /[\u0600-\u06ff]/);
        assert.doesNotMatch(alert, /Passenger|requires|email|Invalid/);
        await page.fill("#pax-0-fn", "بسام");
        await page.fill("#pax-0-ln", "اختبار");
        await page.fill("#pax-0-dob", "1980-01-01");
        await page.fill("#pax-0-doc", "AUDIT-AR");
        await page.fill("#nb-contact-email", "arabic@example.com");
        assert.equal(await page.locator("#nb-contact-email").getAttribute("dir"), "ltr");
        await page.getByRole("button", { name: /التالي: المقاعد والإضافات/ }).click();
        await page.fill("#pax-0-seat", "1A");
        await page.getByRole("button", { name: /التالي: المراجعة/ }).click();
        await page.getByRole("alert").waitFor();
        assert.equal(await page.locator("#pax-0-seat").getAttribute("aria-invalid"), "true");
        assert.equal(await page.locator("#pax-0-seat").getAttribute("aria-describedby"), "pax-0-seat-error");
        assert.ok((await page.locator("#pax-0-seat-error").innerText()).trim());
        assert.equal(await page.locator("#pax-0-seat").evaluate(el => document.activeElement === el), true);
        assert.equal(
          await page.getByRole("button", { name: /إنشاء حجز بالمكتب/ }).count(),
          0,
        );
        await page.fill("#pax-0-seat", availableSeat(f));
        await page.getByRole("button", { name: /التالي: المراجعة/ }).click();
        await page.evaluate(() => {
          window.__attempts = [];
          window.__failRepo = true;
          const original = Storage.prototype.setItem;
          Storage.prototype.setItem = function (k, v) {
            if (k === "gza.repo.v1") {
              window.__attempts.push(JSON.parse(v).bookings[0].submissionId);
              if (window.__failRepo)
                throw new DOMException("synthetic quota", "QuotaExceededError");
            }
            return original.call(this, k, v);
          };
        });
        await page.getByRole("button", { name: /إنشاء حجز بالمكتب/ }).click();
        await page.getByRole("alert").waitFor();
        assert.equal(
          (await page.evaluate(() => JSON.parse(localStorage.getItem("gza.repo.v1")).bookings))
            .length,
          0,
        );
        await page.evaluate(() => {
          window.__failRepo = false;
        });
        await page.getByRole("button", { name: /إنشاء حجز بالمكتب/ }).click();
        await page.locator("main .text-3xl").waitFor();
        const attempts = await page.evaluate(() => window.__attempts);
        assert.equal(attempts.length, 2);
        assert.equal(attempts[0], attempts[1]);
        const pnr = (await page.locator("main .text-3xl").innerText()).trim();
        assert.notEqual(pnr, "GZA-NEW1");
        assert.equal((await stored(page, pnr)).total, bookingTotal(await stored(page, pnr)).total);
      } finally {
        await context.close();
      }
    },
  );
  await checkStep(
    "Check 65: Phase 6A corrected — nonvacuous viewer boundaries, invalid search fallback and cancellation convergence",
    async () => {
      const b = commercialFixture(),
        context = await commercialContext(browser, b, "adm-3");
      try {
        const page = await context.newPage();
        await page.goto(`${baseUrl}/admin/bookings/${b.ref}`);
        for (const name of [
          /^Edit contact$/i,
          /^Change seat$/i,
          /^Edit extras$/i,
          /Cancel booking/i,
        ]) {
          const control = page.getByRole("button", { name });
          await control.waitFor();
          assert.equal(await control.count(), 1);
          assert.equal(await control.isDisabled(), true);
        }
        await page.goto(`${baseUrl}/admin/check-in?date=not-a-date&flightId=stale&ref=!!!`);
        assert.match(await page.locator("#desk-date").inputValue(), /^\d{4}-\d{2}-\d{2}$/);
        await page.goto(
          `${baseUrl}/admin/check-in?date=${b.outbound.date}&flightId=${b.outbound.id}&ref=${b.ref}`,
        );
        const checkin = page
          .locator("tbody tr")
          .filter({ hasText: b.ref })
          .getByRole("button", { name: /^Check in$/i });
        await checkin.waitFor();
        assert.equal(await checkin.count(), 1);
        assert.equal(await checkin.isDisabled(), true);
        await page.goto(`${baseUrl}/admin/bookings/new`);
        await page.fill("#nb-date", b.outbound.date);
        await page.selectOption("#nb-dest", b.outbound.destinationCode);
        await page.locator('input[name="nb-flight-choice"]').first().check();
        await page.getByRole("button", { name: /Next: Fare Selection/i }).click();
        await page.getByRole("button", { name: /Next: Passenger Details/i }).click();
        await page.fill("#pax-0-fn", "Viewer");
        await page.fill("#pax-0-ln", "Audit");
        await page.fill("#pax-0-dob", "1980-01-01");
        await page.fill("#nb-contact-email", "viewer@example.com");
        await page.getByRole("button", { name: /Next: Seats & Extras/i }).click();
        await page.getByRole("button", { name: /Next: Review$/i }).click();
        const create = page.getByRole("button", { name: /Create desk booking/i });
        await create.waitFor();
        assert.equal(await create.count(), 1);
        assert.equal(await create.isDisabled(), true);
        assert.equal(
          (await page.evaluate(() => JSON.parse(localStorage.getItem("gza.repo.v1")).bookings))
            .length,
          1,
        );
      } finally {
        await context.close();
      }
      const editor = await commercialContext(browser, b);
      try {
        const page = await editor.newPage(),
          pub = await editor.newPage();
        await page.goto(`${baseUrl}/admin/bookings/${b.ref}`);
        await pub.goto(`${baseUrl}/manage/${b.ref}`);
        await page.evaluate(() => {
          window.__failCancel = true;
          const original = Storage.prototype.setItem;
          Storage.prototype.setItem = function (k, v) {
            if (k === "gza.repo.v1" && window.__failCancel)
              throw new DOMException("synthetic quota", "QuotaExceededError");
            return original.call(this, k, v);
          };
        });
        await page.getByRole("button", { name: /Cancel booking/i }).click();
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: /Cancel booking/i })
          .click();
        await page.getByRole("alertdialog").getByRole("alert").waitFor();
        assert.equal((await stored(page, b.ref)).status, "confirmed");
        assert.equal((await stored(pub, b.ref)).status, "confirmed");
        await page.evaluate(() => {
          window.__failCancel = false;
        });
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: /Cancel booking/i })
          .click();
        await page.getByRole("alertdialog").waitFor({ state: "hidden" });
        await storageMatch(pub, b.ref, "status", "cancelled");
        await pub
          .getByText(/cancelled/i)
          .first()
          .waitFor();
      } finally {
        await editor.close();
      }
    },
  );
}
