import assert from "node:assert/strict";
import { networkContext } from "./phase6b2c1-network.mjs";
import { interactive } from "./phase6b2b-correction-01.mjs";
import { customerToRouteId } from "../../src/lib/customer-directory/id.ts";
import { admin2En, admin2Ar } from "../../src/lib/i18n-admin2.ts";
// Shared prototype passphrase fixture; avoid importing the UI navigation module into Node preview.
const MOCK_PASSPHRASE = "gza-admin";

export async function runPhase6CCorrection05Checks({ checkStep, browser, baseUrl }) {
  for (const [index, lang] of ["en", "ar"].entries()) {
    await checkStep(`Check ${137 + index}: Correction 05 ${lang} sign-in distinguishes corrupt directory and required write failure`, async () => {
      const { context, prefix, dict } = await networkContext(browser, lang);
      await context.addInitScript(() => {
        if (!localStorage.getItem("__correction05_signin")) {
          localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: null }));
          localStorage.setItem("gza.staff.v1", "{broken");
          localStorage.setItem("__correction05_signin", "1");
        }
      });
      try {
        const page = await context.newPage();
        const errors = []; page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(baseUrl + prefix + "/admin/signin");
        await interactive(page, "#adm-email");
        await page.fill("#adm-email", "rana.habib@gza.ps");
        await page.fill("#adm-pass", MOCK_PASSPHRASE);
        const submit = () => page.getByRole("button", { name: dict["adm.signin.submit"], exact: true }).click();
        await submit();
        await page.getByRole("alert").filter({ hasText: dict["adm.signin.errDirectory"] }).waitFor();
        assert.equal(await page.getByText(dict["adm.signin.errUnknown"], { exact: true }).count(), 0);
        assert.equal(await page.inputValue("#adm-email"), "rana.habib@gza.ps");
        assert.equal(await page.evaluate(() => localStorage.getItem("gza.staff.v1")), "{broken");
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("gza.admin.v1")).staffId), null);
        // Explicitly remove the injected corruption for this next independent scenario.
        await page.evaluate(() => { localStorage.removeItem("gza.staff.v1"); const set = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === "gza.staff.v1") { window.__staffWriteAttempts = (window.__staffWriteAttempts || 0) + 1; throw new DOMException("quota", "QuotaExceededError"); } return set.call(this, key, value); }; });
        await page.fill("#adm-email", "unknown@example.com"); await submit();
        await page.getByRole("alert").filter({ hasText: dict["adm.signin.errUnknown"] }).waitFor();
        await page.fill("#adm-email", "rana.habib@gza.ps"); await submit();
        await page.waitForFunction(() => window.__staffWriteAttempts > 0);
        await page.getByRole("alert").filter({ hasText: dict["adm.signin.errDirectory"] }).waitFor();
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("gza.admin.v1")).staffId), null);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("gza.activity.v1") || '{"events":[]}').events.length), 0);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });

    await checkStep(`Check ${139 + index}: Correction 05 ${lang} guest contact audit exact before/after, canonical Activity tab and no-op`, async () => {
      const { context, b: booking, prefix } = await networkContext(browser, lang);
      const copy = lang === "ar" ? admin2Ar : admin2En;
      try {
        const page = await context.newPage();
        const errors = []; page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(baseUrl + prefix + "/admin/customers/" + customerToRouteId("guest", booking.contact.email));
        const events = () => page.evaluate(() => JSON.parse(localStorage.getItem("gza.activity.v1") || '{"events":[]}').events);
        const edit = async () => { await page.getByRole("button", { name: copy["a2.cu.editContact"], exact: true }).click(); await interactive(page, "#cu-guest-phone"); };
        const save = async () => { const dialog = page.getByRole("dialog"); await dialog.getByRole("button", { name: copy["a2.save"], exact: true }).click(); await dialog.waitFor({ state: "hidden" }); };
        await edit();
        const beforeEmail = await page.inputValue("#cu-guest-email");
        const beforePhone = await page.inputValue("#cu-guest-phone");
        const changedPhone = "+970599005555";
        await page.fill("#cu-guest-phone", changedPhone); await save();
        const audit = (await events()).filter((e) => e.targetType === "guest_contact" && e.targetId === booking.ref);
        assert.equal(audit.length, 1);
        assert.equal(audit[0].before, `${beforeEmail} / ${beforePhone}`);
        assert.equal(audit[0].after, `${beforeEmail} / ${changedPhone}`);
        const stored = await page.evaluate((ref) => JSON.parse(localStorage.getItem("gza.repo.v1")).bookings.find((b) => b.ref === ref), booking.ref);
        assert.equal(stored.contact.phone, changedPhone);
        await page.getByRole("tab", { name: copy["a2.cu.tab.activity"], exact: true }).click();
        const history = page.getByTestId("customer-activity"); await history.waitFor();
        await history.getByText(`${beforeEmail} / ${beforePhone}`, { exact: true }).waitFor();
        await history.getByText(`${beforeEmail} / ${changedPhone}`, { exact: true }).waitFor();
        assert.equal(await history.locator('[dir="ltr"]').filter({ hasText: booking.ref }).count(), 1);
        assert.equal(await page.getByText(copy["a2.cu.noActivity"], { exact: true }).count(), 0);
        await edit(); await save();
        assert.equal((await events()).filter((e) => e.targetType === "guest_contact" && e.targetId === booking.ref).length, 1);
        // A canonical Activity read failure must not be rendered as empty history.
        await page.evaluate(() => localStorage.setItem("gza.activity.v1", "{broken"));
        await page.reload();
        await page.getByRole("tab", { name: copy["a2.cu.tab.activity"], exact: true }).click();
        await page.getByRole("alert").filter({ hasText: lang === "ar" ? "تعذر تحميل سجل النشاط في هذا المتصفح." : "Unable to load activity in this browser." }).waitFor();
        assert.equal(await page.getByText(copy["a2.cu.noActivity"], { exact: true }).count(), 0);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  }
}
