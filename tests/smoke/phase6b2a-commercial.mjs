import assert from "node:assert/strict";
import { commercialContext, commercialFixture } from "./phase6a-commercial.mjs";
import { seedCommercialCatalog } from "../../src/lib/commercial/seed.ts";
import { pricingSnapshot, calculateBookingTotal } from "../../src/lib/commercial/pricing.ts";
import { adminEn, adminAr } from "../../src/lib/i18n-admin.ts";
import { en as publicEn, ar as publicAr } from "../../src/lib/i18n-public.ts";
const KEY = "gza.commercial.v1";
export async function catalogContext(browser, lang = "en", staff = "adm-1", withSnapshot = true) {
  const b = commercialFixture();
  const catalog = seedCommercialCatalog();
  if (withSnapshot) {
    b.pricingSnapshot = pricingSnapshot({ revision: 0, catalog }, b.fareId, b.criteria.cabin);
    b.total = calculateBookingTotal(b, b.pricingSnapshot).total;
  }
  const context = await commercialContext(browser, b, staff);
  await context.addInitScript(
    ({ catalog, b }) => {
      if (!localStorage.getItem("gza.commercial.v1"))
        localStorage.setItem(
          "gza.commercial.v1",
          JSON.stringify({ schemaVersion: 1, revision: 0, catalog }),
        );
      if (!localStorage.getItem("gza.booking.draft.v1"))
        localStorage.setItem(
          "gza.booking.draft.v1",
          JSON.stringify({
            schemaVersion: 1,
            status: "active",
            draft: {
              criteria: b.criteria,
              outbound: b.outbound,
              inbound: b.inbound,
              fareId: b.fareId,
              passengers: b.passengers,
              seats: b.seats,
              extras: b.extras,
              contact: b.contact,
            },
            revision: 1,
            submissionId: "catalog-browser",
            updatedAt: "2026-10-01T12:00:00Z",
          }),
        );
    },
    { catalog, b },
  );
  return {
    context,
    b,
    prefix: lang === "ar" ? "/ar" : "",
    dict: lang === "ar" ? adminAr : adminEn,
    pub: lang === "ar" ? publicAr : publicEn,
  };
}
const read = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("gza.commercial.v1")));
const booking = (page, ref) =>
  page.evaluate(
    (ref) => JSON.parse(localStorage.getItem("gza.repo.v1")).bookings.find((b) => b.ref === ref),
    ref,
  );
async function tab(page, dict, key) {
  await page.getByRole("tab", { name: dict[`adm.prod.tab.${key}`], exact: true }).click();
  await page.locator(`[data-testid="commercial-${key}"]`).waitFor();
}
async function save(page, dict) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: dict["adm.edit.save"], exact: true })
    .click();
}
async function closed(page) {
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}
async function editFare(page, dict, id = "classic") {
  await page
    .locator('[data-testid="commercial-fares"] > ul')
    .first()
    .locator("li")
    .filter({ hasText: id === "classic" ? "Classic" : "Essential" })
    .getByRole("button", { name: dict["adm.common.edit"], exact: true })
    .click();
}
export async function runPhase6B2AChecks({ checkStep, browser, baseUrl }) {
  for (const lang of ["en", "ar"]) {
    await checkStep(
      `Check ${lang === "en" ? 79 : 80}: 6B2A ${lang} mounted catalog/public convergence, historical PNR price and baggage snapshot`,
      async () => {
        const { context, b, prefix, dict, pub: publicCopy } = await catalogContext(browser, lang);
        try {
          const admin = await context.newPage(),
            pub = await context.newPage(),
            old = await context.newPage();
          await admin.goto(baseUrl + prefix + "/admin/products");
          await tab(admin, dict, "fares");
          await pub.goto(baseUrl + prefix + "/book?step=fare");
          await pub.locator("#fare-option-classic").waitFor();
          await old.goto(baseUrl + prefix + `/manage/${b.ref}`);
          await old.getByText(b.contact.email, { exact: true }).waitFor();
          const before = await booking(old, b.ref);
          // Select by immutable row order, which is independent of translated/configured name.
          await admin
            .locator('[data-testid="commercial-fares"] > ul')
            .first()
            .locator("li")
            .nth(1)
            .getByRole("button", { name: dict["adm.common.edit"], exact: true })
            .click();
          await admin.locator("#catalog-fare-name-en").fill("Canonical Classic");
          await admin.locator("#catalog-fare-name-ar").fill("الكلاسيكية المعتمدة");
          await admin.locator("#catalog-fare-multiplier").fill("2.1");
          await save(admin, dict);
          await closed(admin);
          await pub
            .getByText(lang === "ar" ? "الكلاسيكية المعتمدة" : "Canonical Classic", { exact: true })
            .first()
            .waitFor();
          assert.deepEqual(await booking(old, b.ref), before);
          await tab(admin, dict, "baggage");
          await admin.getByRole("button", { name: dict["adm.common.edit"], exact: true }).click();
          await admin.fill("#catalog-baggage-extraBagPrice", "91");
          await admin.fill("#catalog-baggage-checkedKg", "30");
          await save(admin, dict);
          await closed(admin);
          await pub.goto(baseUrl + prefix + "/book?step=extras");
          await pub.locator("main").getByText(/91/).first().waitFor();
          await old.goto(baseUrl + prefix + `/manage/${b.ref}/extras`);
          await old.locator("main").getByText(/35/).first().waitFor();
          assert.equal((await booking(old, b.ref)).pricingSnapshot.extraBagPrice, 35);
          assert.equal((await read(pub)).catalog.baggage.checkedKg, 30);
          const dimensions = (await read(pub)).catalog.baggage.cabinDims;
          assert.ok(
            (await pub.locator("main").innerText()).includes(`\u2066${dimensions}\u2069`),
            "Technical baggage dimensions must be isolated LTR",
          );
          await old.goto(baseUrl + prefix + `/booking-confirmation/${b.ref}`);
          await old.getByText(publicCopy["conf.manageNotice"], { exact: true }).waitFor();
          assert.equal(await old.getByText("conf.manageNotice", { exact: true }).count(), 0);
          assert.equal(
            await pub.locator("html").getAttribute("dir"),
            lang === "ar" ? "rtl" : "ltr",
          );
        } finally {
          await context.close();
        }
      },
    );
  }
  await checkStep(
    "Check 81: 6B2A persistent meal lifecycle, default identity, edit/order, retired history and active-only new selections",
    async () => {
      const { context, b, dict } = await catalogContext(browser);
      try {
        const page = await context.newPage();
        await page.goto(baseUrl + "/admin/products");
        await tab(page, dict, "meals");
        await page.getByRole("button", { name: dict["adm.prod.opt.add"], exact: true }).click();
        await page.fill("#catalog-meals-label-en", "Audit meal");
        await page.fill("#catalog-meals-label-ar", "وجبة اختبار");
        await save(page, dict);
        await closed(page);
        let row = page
          .locator('[data-testid="commercial-meals"] li')
          .filter({ hasText: "Audit meal" });
        await row.getByRole("button", { name: "Set as default", exact: true }).click();
        await page.waitForFunction(() =>
          JSON.parse(localStorage.getItem("gza.commercial.v1")).catalog.defaultMealId.startsWith(
            "meal-",
          ),
        );
        const id = (await read(page)).catalog.defaultMealId;
        assert.match(id, /^meal-/);
        await row.getByRole("button", { name: "Move up", exact: true }).click();
        await row.getByRole("button", { name: "Edit", exact: true }).click();
        await page.fill("#catalog-meals-label-en", "Renamed audit meal");
        await save(page, dict);
        await closed(page);
        const standard = page
          .locator('[data-testid="commercial-meals"] li')
          .filter({ hasText: /Standard/ });
        await standard.getByRole("button", { name: "Retire", exact: true }).click();
        await page.waitForFunction(
          () =>
            JSON.parse(localStorage.getItem("gza.commercial.v1")).catalog.meals.find(
              (m) => m.id === "standard",
            ).active === false,
        );
        await page.reload();
        await tab(page, dict, "meals");
        await page.getByText("Renamed audit meal", { exact: false }).first().waitFor();
        await page.goto(baseUrl + `/manage/${b.ref}/extras`);
        await page.locator("#meal-0").click();
        await page.getByRole("option", { name: /Standard.*No longer offered/ }).waitFor();
        await page.keyboard.press("Escape");
        const before = await booking(page, b.ref);
        await page.getByRole("button", { name: publicEn["common.save"], exact: true }).click();
        await page.waitForURL(`**/manage/${b.ref}`);
        assert.deepEqual((await booking(page, b.ref)).extras, before.extras);
      } finally {
        await context.close();
      }
    },
  );
  for (const lang of ["en", "ar"])
    await checkStep(
      `Check ${lang === "en" ? 82 : 83}: 6B2A ${lang} field validation, quota rollback, preserved edits and retry`,
      async () => {
        const { context, prefix, dict } = await catalogContext(browser, lang);
        try {
          const page = await context.newPage();
          await page.goto(baseUrl + prefix + "/admin/products");
          await tab(page, dict, "fares");
          await page
            .locator('[data-testid="commercial-fares"] > ul')
            .first()
            .locator("li")
            .nth(1)
            .getByRole("button", { name: dict["adm.common.edit"], exact: true })
            .click();
          await page.fill("#catalog-fare-multiplier", "0");
          await save(page, dict);
          assert.equal(
            await page.locator("#catalog-fare-multiplier").getAttribute("aria-invalid"),
            "true",
          );
          assert.equal(
            await page.locator("#catalog-fare-multiplier").getAttribute("aria-describedby"),
            "catalog-fare-multiplier-error",
          );
          assert.equal((await read(page)).revision, 0);
          await page.fill("#catalog-fare-multiplier", "2.2");
          await page.fill("#catalog-fare-name-en", "Retry preserved");
          await page.evaluate(() => {
            window.__catalogFail = true;
            const original = Storage.prototype.setItem;
            Storage.prototype.setItem = function (k, v) {
              if (k === "gza.commercial.v1" && window.__catalogFail)
                throw new DOMException("test quota", "QuotaExceededError");
              return original.call(this, k, v);
            };
          });
          await save(page, dict);
          await page.getByRole("dialog").getByRole("alert").waitFor();
          assert.equal(await page.locator("#catalog-fare-name-en").inputValue(), "Retry preserved");
          assert.equal(await page.getByRole("dialog").locator('[aria-invalid="true"]').count(), 0);
          assert.equal((await read(page)).revision, 0);
          if (lang === "ar")
            assert.match(await page.getByRole("dialog").getByRole("alert").innerText(), /[؀-ۿ]/);
          await page.evaluate(() => (window.__catalogFail = false));
          await save(page, dict);
          await closed(page);
          assert.equal((await read(page)).catalog.fares[1].multiplier, 2.2);
        } finally {
          await context.close();
        }
      },
    );
  await checkStep(
    "Check 84: 6B2A corrupt catalog produces truthful public/Admin unavailable state without overwrite",
    async () => {
      const { context } = await catalogContext(browser);
      try {
        const page = await context.newPage();
        await page.goto(baseUrl + "/admin/products");
        await page.evaluate(() => localStorage.setItem("gza.commercial.v1", "{bad-catalog"));
        await page.reload();
        await page.getByRole("tab", { name: adminEn["adm.prod.tab.fares"], exact: true }).click();
        await page.getByRole("alert").waitFor();
        assert.equal(await page.locator('[data-testid="commercial-fares"]').count(), 0);
        await page.goto(baseUrl + "/book?step=fare");
        await page.getByRole("alert").first().waitFor();
        assert.equal(await page.locator("#fare-option-classic").count(), 0);
        assert.equal(
          await page.evaluate(() => localStorage.getItem("gza.commercial.v1")),
          "{bad-catalog",
        );
      } finally {
        await context.close();
      }
    },
  );
  await checkStep(
    "Check 86: 6B2A new Counter PNR independently stores changed catalog revision; old PNR Extras retains original unit price",
    async () => {
      const { context, b, dict } = await catalogContext(browser);
      try {
        const admin = await context.newPage();
        await admin.goto(baseUrl + "/admin/products");
        await tab(admin, dict, "fares");
        await admin
          .locator('[data-testid="commercial-fares"] > ul')
          .first()
          .locator("li")
          .nth(1)
          .getByRole("button", { name: "Edit", exact: true })
          .click();
        await admin.fill("#catalog-fare-multiplier", "2.4");
        await save(admin, dict);
        await closed(admin);
        await tab(admin, dict, "baggage");
        await admin.getByRole("button", { name: "Edit", exact: true }).click();
        await admin.fill("#catalog-baggage-extraBagPrice", "88");
        await save(admin, dict);
        await closed(admin);
        const counter = await context.newPage();
        await counter.goto(baseUrl + "/admin/bookings/new");
        await counter.fill("#nb-date", b.outbound.date);
        await counter.selectOption("#nb-dest", b.outbound.destinationCode);
        await counter.locator('input[name="nb-flight-choice"]').first().check();
        await counter.getByRole("button", { name: "Next: Fare Selection", exact: true }).click();
        await counter.locator('input[name="nb-fare-choice"][value="classic"]').check();
        await counter.getByRole("button", { name: "Next: Passenger Details", exact: true }).click();
        await counter.fill("#pax-0-fn", "Catalog");
        await counter.fill("#pax-0-ln", "Revision");
        await counter.fill("#pax-0-dob", "1980-01-01");
        await counter.fill("#pax-0-doc", "CAT-B2A");
        await counter.fill("#nb-contact-email", "catalog.browser@example.ps");
        await counter.getByRole("button", { name: "Next: Seats & Extras", exact: true }).click();
        await counter.getByRole("button", { name: "Next: Review", exact: true }).click();
        await counter.getByRole("button", { name: "Create desk booking", exact: true }).click();
        await counter.locator("main .text-3xl").waitFor();
        const ref = (await counter.locator("main .text-3xl").innerText()).trim(),
          created = await booking(counter, ref);
        assert.equal(created.pricingSnapshot.fareMultiplier, 2.4);
        assert.equal(created.pricingSnapshot.extraBagPrice, 88);
        assert.equal(created.total, calculateBookingTotal(created, created.pricingSnapshot).total);
        const old = await context.newPage();
        await old.goto(baseUrl + `/manage/${b.ref}/extras`);
        await old.getByRole("button", { name: "1", exact: true }).click();
        await old.getByRole("button", { name: publicEn["common.save"], exact: true }).click();
        await old.waitForURL(`**/manage/${b.ref}`);
        const changed = await booking(old, b.ref);
        assert.equal(changed.pricingSnapshot.extraBagPrice, 35);
        assert.equal(changed.total, calculateBookingTotal(changed, changed.pricingSnapshot).total);
        await old.reload();
        assert.deepEqual((await booking(old, b.ref)).pricingSnapshot, b.pricingSnapshot);
      } finally {
        await context.close();
      }
    },
  );
  await checkStep(
    "Check 85: 6B2A viewer cannot mutate commercial catalog or the Fleet aircraft controls",
    async () => {
      const { context, dict } = await catalogContext(browser, "en", "adm-3");
      try {
        const page = await context.newPage();
        await page.goto(baseUrl + "/admin/products");
        await tab(page, dict, "fares");
        const controls = page
          .locator('[data-testid="commercial-fares"]')
          .getByRole("button", { name: "Edit", exact: true });
        assert.equal(await controls.count(), 6);
        for (const c of await controls.all()) assert.equal(await c.isDisabled(), true);
        assert.equal((await read(page)).revision, 0);
        await page.getByRole("tab", { name: "Aircraft", exact: true }).click();
        const newBtn = page.getByRole("button", { name: /New Aircraft/i });
        await newBtn.waitFor();
        assert.equal(await newBtn.isDisabled(), true);
      } finally {
        await context.close();
      }
    },
  );
  await checkStep(
    "Check 87: 6B2A stale fare blocks Public Review and Counter progression without substituting or clearing draft",
    async () => {
      const { context, b, dict } = await catalogContext(browser);
      try {
        const admin = await context.newPage(),
          pub = await context.newPage(),
          counter = await context.newPage();
        await pub.goto(baseUrl + "/book?step=review");
        await pub.getByRole("button", { name: /Confirm booking/ }).waitFor();
        await counter.goto(baseUrl + "/admin/bookings/new");
        await counter.fill("#nb-date", b.outbound.date);
        await counter.selectOption("#nb-dest", b.outbound.destinationCode);
        await counter.locator('input[name="nb-flight-choice"]').first().check();
        await counter.getByRole("button", { name: "Next: Fare Selection", exact: true }).click();
        await counter.locator('input[name="nb-fare-choice"][value="classic"]').check();
        await admin.goto(baseUrl + "/admin/products");
        await tab(admin, dict, "fares");
        await admin
          .locator('[data-testid="commercial-fares"] > ul')
          .first()
          .locator("li")
          .nth(1)
          .getByRole("button", { name: "Edit", exact: true })
          .click();
        await admin.locator("#catalog-active").uncheck();
        await save(admin, dict);
        await closed(admin);
        await pub
          .getByRole("alert")
          .filter({ hasText: publicEn["commercial.error.fare_unavailable"] })
          .waitFor();
        assert.equal(await pub.getByRole("button", { name: /Confirm booking/ }).count(), 0);
        const draft = await pub.evaluate(
          () => JSON.parse(localStorage.getItem("gza.booking.draft.v1")).draft,
        );
        assert.equal(draft.fareId, "classic");
        assert.deepEqual(draft.passengers, b.passengers);
        await counter.getByRole("button", { name: "Next: Passenger Details", exact: true }).click();
        await counter.getByRole("alert").waitFor();
        assert.equal(await counter.locator("#pax-0-fn").count(), 0);
        assert.equal((await booking(pub, b.ref)).total, b.total);
      } finally {
        await context.close();
      }
    },
  );
  await checkStep(
    "Check 88: 6B2A stale meal is rejected at public commit and retained for active replacement",
    async () => {
      const { context, b, dict } = await catalogContext(browser);
      try {
        const admin = await context.newPage(),
          pub = await context.newPage();
        await pub.goto(baseUrl + "/book?step=review");
        await pub.getByRole("button", { name: /Confirm booking/ }).waitFor();
        await admin.goto(baseUrl + "/admin/products");
        await tab(admin, dict, "meals");
        await admin
          .locator('[data-testid="commercial-meals"] li')
          .filter({ hasText: "Vegetarian" })
          .getByRole("button", { name: "Set as default", exact: true })
          .click();
        await admin
          .locator('[data-testid="commercial-meals"] li')
          .filter({ hasText: "Standard" })
          .getByRole("button", { name: "Retire", exact: true })
          .click();
        await admin.waitForFunction(
          () =>
            !JSON.parse(localStorage.getItem("gza.commercial.v1")).catalog.meals.find(
              (m) => m.id === "standard",
            ).active,
        );
        await pub.getByRole("button", { name: /Confirm booking/ }).click();
        await pub.waitForURL("**/book?step=extras");
        await pub
          .getByText(publicEn["commercial.error.service_unavailable"], { exact: true })
          .first()
          .waitFor();
        assert.equal(
          (await pub.evaluate(() => JSON.parse(localStorage.getItem("gza.repo.v1")).bookings))
            .length,
          1,
        );
        const draft = await pub.evaluate(
          () => JSON.parse(localStorage.getItem("gza.booking.draft.v1")).draft,
        );
        assert.equal(draft.extras.pax[0].meal, "standard");
        assert.deepEqual(draft.passengers, b.passengers);
      } finally {
        await context.close();
      }
    },
  );
}
