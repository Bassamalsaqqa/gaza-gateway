import assert from "node:assert/strict";
import { networkContext } from "./phase6b2c1-network.mjs";
import { interactive } from "./phase6b2b-correction-01.mjs";
import { customerToRouteId } from "../../src/lib/customer-directory/id.ts";
import { seedStaffEnvelope } from "../../src/lib/staff/seed.ts";
import { admin2En, admin2Ar } from "../../src/lib/i18n-admin2.ts";

export async function runPhase6CConvergenceChecks({ checkStep, browser, baseUrl }) {
  for (const [index, lang] of ["en", "ar"].entries()) {
    await checkStep(`Check ${135 + index}: Phase 6C ${lang} canonical claim, booking/config audit, no-op/failure and native staff revocation`, async () => {
      const { context, b: booking, prefix, dict } = await networkContext(browser, lang);
      const copy = lang === "ar" ? admin2Ar : admin2En;
      await context.addInitScript(({ email, staff }) => {
        if (!localStorage.getItem("gza.passenger.v1")) localStorage.setItem("gza.passenger.v1", JSON.stringify({ schemaVersion: 1, account: { email, firstName: "Audit", lastName: "Example", phone: "+970599000000", seatPreference: "none", mealPreference: "standard", newsletter: false }, travelers: [] }));
        if (!localStorage.getItem("gza.staff.v1")) localStorage.setItem("gza.staff.v1", JSON.stringify(staff));
      }, { email: booking.contact.email, staff: { ...seedStaffEnvelope(), staff: seedStaffEnvelope().staff.map((s) => ({ ...s, ...(s.id === "adm-2" ? { role: "admin" } : {}) })) } });
      const errors = [];
      try {
        const page = await context.newPage();
        page.on("pageerror", (e) => errors.push(e.message));
        const events = () => page.evaluate(() => JSON.parse(localStorage.getItem("gza.activity.v1") || '{"events":[]}').events);
        const saveDialog = async () => { const dialog = page.getByRole("dialog"); await dialog.getByRole("button", { name: copy["a2.save"], exact: true }).click(); await dialog.waitFor({ state: "hidden" }); };
        const accountId = customerToRouteId("account", booking.contact.email);
        await page.goto(baseUrl + prefix + "/admin/customers/" + accountId);
        await page.getByRole("heading", { name: "Audit Example", exact: true }).waitFor();
        await page.getByRole("button", { name: copy["a2.cu.attach"], exact: true }).click();
        await interactive(page, "#attach-pnr");
        await page.fill("#attach-pnr", booking.ref);
        await page.getByRole("dialog").getByRole("button", { name: copy["a2.cu.attach"], exact: true }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        const claimed = await page.evaluate((ref) => JSON.parse(localStorage.getItem("gza.repo.v1")).bookings.find((b) => b.ref === ref), booking.ref);
        assert.equal(claimed.ownerEmail, booking.contact.email);
        assert.equal((await events()).filter((e) => e.targetId === booking.ref && e.metadata?.accountEmail === booking.contact.email).length, 1);

        await page.goto(baseUrl + prefix + "/admin/bookings/" + booking.ref);
        const editContact = () => page.getByRole("button", { name: copy["a2.bd.editContact"], exact: true }).click();
        await editContact(); await interactive(page, "#bd-phone");
        await page.fill("#bd-phone", "+970599000111"); await saveDialog();
        const contactAudit = (await events()).filter((e) => e.module === "bookings" && e.targetType === "booking_contact" && e.targetId === booking.ref);
        assert.equal(contactAudit.length, 1);
        assert.equal(contactAudit[0].actor.id, "adm-1");
        assert.equal(contactAudit[0].actor.role, "admin");
        const count = (await events()).length;
        await editContact(); await interactive(page, "#bd-phone"); await saveDialog();
        assert.equal((await events()).length, count, "identical contact save is not an audit event");
        await editContact(); await interactive(page, "#bd-email"); await page.fill("#bd-email", "invalid");
        await page.getByRole("dialog").getByRole("button", { name: copy["a2.save"], exact: true }).click();
        await page.locator('#bd-email[aria-invalid="true"]').waitFor();
        assert.equal((await events()).length, count, "failed validation must not audit");
        await page.getByRole("dialog").getByRole("button", { name: copy["a2.cancel"], exact: true }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });

        // Domain commit succeeds even when the separate audit store cannot persist.
        await page.evaluate(() => { const original = Storage.prototype.setItem; window.__auditFail = true; Storage.prototype.setItem = function (key, value) { if (key === "gza.activity.v1" && window.__auditFail) throw new DOMException("audit quota", "QuotaExceededError"); return original.call(this, key, value); }; });
        await editContact(); await interactive(page, "#bd-phone"); await page.fill("#bd-phone", "+970599000222"); await saveDialog();
        await page.getByText(copy["a2.ac.auditWarning"], { exact: true }).waitFor();
        assert.equal((await events()).length, count);
        const persistedPhone = await page.evaluate((ref) => JSON.parse(localStorage.getItem("gza.repo.v1")).bookings.find((b) => b.ref === ref).contact.phone, booking.ref);
        assert.equal(persistedPhone, "+970599000222");
        await page.evaluate(() => { window.__auditFail = false; });

        await page.goto(baseUrl + prefix + "/admin/destinations/AMM");
        await interactive(page, "#de-city-en");
        await page.fill("#de-city-en", "Phase 6C Audit City");
        await page.getByRole("button", { name: dict["adm.edit.save"], exact: true }).click();
        await page.waitForFunction(() => JSON.parse(localStorage.getItem("gza.network.v1")).destinations.find((d) => d.code === "AMM").city.en === "Phase 6C Audit City");
        assert.equal((await events()).filter((e) => e.module === "network" && e.targetId === "AMM" && e.actor.id === "adm-1").length, 1);

        // Native cross-tab staff changes, independently of the session storage key.
        await page.goto(baseUrl + prefix + "/admin/staff");
        const other = await context.newPage();
        other.on("pageerror", (e) => errors.push(e.message));
        await other.goto(baseUrl + prefix + "/admin/staff");
        await page.getByRole("button", { name: copy["a2.st.invite"], exact: true }).waitFor();
        await other.evaluate(() => { const state = JSON.parse(localStorage.getItem("gza.staff.v1")); state.staff.find((s) => s.id === "adm-1").role = "viewer"; state.revision++; localStorage.setItem("gza.staff.v1", JSON.stringify(state)); });
        await page.getByRole("heading", { name: dict["adm.denied.title"], exact: true }).waitFor();
        assert.equal(await page.getByRole("button", { name: copy["a2.st.changeRole"], exact: true }).count(), 0);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("gza.admin.v1")).staffId), "adm-1");
        await other.evaluate(() => { const state = JSON.parse(localStorage.getItem("gza.staff.v1")); state.staff.find((s) => s.id === "adm-1").status = "disabled"; state.revision++; localStorage.setItem("gza.staff.v1", JSON.stringify(state)); });
        await page.getByRole("heading", { name: dict["adm.signin.required"], exact: true }).waitFor();
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("gza.admin.v1")).staffId), null);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  }
}
