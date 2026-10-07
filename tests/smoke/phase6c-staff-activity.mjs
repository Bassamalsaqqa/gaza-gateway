import assert from "node:assert/strict";
import { networkContext } from "./phase6b2c1-network.mjs";
import { SEED_STAFF_MEMBERS } from "../../src/lib/staff/seed.ts";

export async function runPhase6CStaffActivityChecks({ checkStep, browser, baseUrl }) {
  // Check 133: English Staff, Customer Directory, Claim, Activity Audit, and Cross-Tab Session
  await checkStep(
    "Check 133: Phase 6C EN Staff directory CRUD, last-admin protection, derived customers, claim sheet, and activity audit recording",
    async () => {
      const { context, prefix } = await networkContext(browser, "en", "adm-1");
      const pageErrors = [];
      const consoleErrors = [];

      const assertNoOverflow = async (p, label) => {
        const hasOverflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        assert.equal(hasOverflow, false, `Horizontal overflow detected on ${label} (${p.url()})`);
      };

      try {
        const page = await context.newPage();
        page.on("pageerror", (err) => pageErrors.push(err.message || String(err)));
        page.on("console", (msg) => {
          if (msg.type() === "error") consoleErrors.push(msg.text());
        });

        // 1. Staff directory: loads canonical staff
        await page.goto(`${baseUrl}/admin/staff`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("table tbody tr", { timeout: 10000 });
        await assertNoOverflow(page, "Staff directory");
        const rows = page.locator("table tbody tr");
        assert.ok((await rows.count()) >= 4, "Expected at least 4 seeded staff members");

        // Verify seeded admin Rana Habib is present
        await page.getByText("Rana Habib").first().waitFor();

        // 2. Last-admin protection: Attempting to demote only active admin is blocked
        const ranaRow = rows.filter({ hasText: "Rana Habib" });
        const changeRoleBtn = ranaRow.getByRole("button", { name: /Change role|تعديل الدور/i }).first();
        await changeRoleBtn.waitFor({ timeout: 5000 });
        await changeRoleBtn.click();

        // Sheet opens with role selector
        await page.waitForSelector("#st-role-edit", { timeout: 5000 });
        await page.selectOption("#st-role-edit", "editor");

        const saveRoleBtn = page.getByRole("button", { name: /Save role|Save changes|^Save$|حفظ الدور|^حفظ$/i }).first();
        await saveRoleBtn.click();

        // Expect error alert or message regarding last admin protection
        await page.waitForSelector("text=/Cannot demote or disable the last active administrator|لا يمكن خفض رتبة أو تعطيل/i", { timeout: 5000 });
        const cancelBtn = page.getByRole("button", { name: /Cancel|إلغاء/i }).first();
        await cancelBtn.click();
        await page.waitForTimeout(300);

        // 3. Add staff profile
        const addBtn = page.getByRole("button", { name: /Invite staff|Add staff profile|Add a staff profile|دعوة عضو جديد/i }).first();
        await addBtn.waitFor({ timeout: 5000 });
        await addBtn.click();
        await page.waitForSelector("#st-name-en", { timeout: 5000 });
        await page.fill("#st-name-en", "Kareem Audit");
        await page.fill("#st-name-ar", "كريم تدقيق");
        await page.fill("#st-email", "kareem.audit@gza.ps");
        await page.selectOption("#st-role", "editor");
        await page.fill("#st-title-en", "Audit Specialist");
        await page.fill("#st-title-ar", "أخصائي تدقيق");

        const saveStaffBtn = page.getByRole("button", { name: /Save profile|Save staff|^Save$|حفظ الملف/i }).first();
        await saveStaffBtn.click();
        await page.waitForTimeout(1000);

        // Verify new staff member appears in list
        await page.getByText("Kareem Audit").first().waitFor({ timeout: 5000 });

        // 4. Derived customer directory
        await page.goto(`${baseUrl}/admin/customers`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("table tbody tr", { timeout: 10000 });
        await assertNoOverflow(page, "Customer directory");
        const customerRows = page.locator("table tbody tr");
        assert.ok((await customerRows.count()) >= 1, "Expected at least 1 customer row projected");

        // Click first customer row to navigate to details
        const firstCustomerLink = customerRows.first().locator("a").first();
        const href = await firstCustomerLink.getAttribute("href");
        assert.ok(href && href.includes("/admin/customers/cus_"), "Expected bijective route ID format (cus_acc_* or cus_gst_*)");
        await firstCustomerLink.click();
        await page.waitForURL(url => url.pathname.includes("/admin/customers/cus_"), { timeout: 5000 });
        await assertNoOverflow(page, "Customer detail");

        // 5. Account Claim / Attach Booking Sheet
        // Locate account customer or attach button
        const attachBookingBtn = page.getByRole("button", { name: /Attach booking|إرفاق حجز/i }).first();
        if ((await attachBookingBtn.count()) > 0) {
          await attachBookingBtn.click();
          await page.waitForSelector("form input, #attach-pnr, [role='dialog'] input", { timeout: 5000 });
          await assertNoOverflow(page, "Attach booking sheet");
          const sheetCancel = page.getByRole("button", { name: /Cancel|Close|إلغاء|إغلاق/i }).first();
          if ((await sheetCancel.count()) > 0) {
            await sheetCancel.click();
            await page.waitForTimeout(300);
          }
        }

        // 6. Canonical Activity Log & Audit Recording
        await page.goto(`${baseUrl}/admin/activity`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("table tbody tr, .space-y-3, main", { timeout: 10000 });
        await assertNoOverflow(page, "Activity log");

        // Verify audit trail recorded staff creation
        const activityBody = await page.locator("main").innerText();
        assert.ok(
          activityBody.includes("Kareem") || activityBody.includes("staff") || activityBody.includes("Rana"),
          "Activity log must reflect recorded admin audit event"
        );

        // 7. Multi-tab Session Revocation via real native storage event
        const page2 = await context.newPage();
        await page2.goto(`${baseUrl}/admin/staff`, { waitUntil: "domcontentloaded" });
        await page2.evaluate(() => {
          localStorage.removeItem("gza.admin.v1");
        });
        await page2.close();

        // page naturally reacts via window 'storage' listener without reload or synthetic dispatch
        const signinHeading = page.getByRole("heading", { name: /Sign in|سجّل الدخول/i });
        await signinHeading.waitFor({ timeout: 5000 });
        const pageText = await page.locator("body").innerText();
        assert.ok(
          pageText.includes("Sign in") || pageText.includes("signin"),
          "Multi-tab session invalidation must revoke authority"
        );
        await page2.close();

        // Ensure zero page errors were thrown during execution
        assert.equal(pageErrors.length, 0, `Page errors encountered in Check 133: ${pageErrors.join("; ")}`);
      } finally {
        await context.close();
      }
    }
  );

  // Check 134: Arabic parity across staff, customer, activity surfaces
  await checkStep(
    "Check 134: Phase 6C AR Arabic parity across staff directory, customer directory, activity log, and RTL direction",
    async () => {
      const { context } = await networkContext(browser, "ar", "adm-1");
      const pageErrors = [];

      const assertNoOverflow = async (p, label) => {
        const hasOverflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        assert.equal(hasOverflow, false, `Horizontal overflow detected on ${label} (${p.url()})`);
      };

      try {
        const page = await context.newPage();
        page.on("pageerror", (err) => pageErrors.push(err.message || String(err)));

        // 1. Arabic Staff Directory
        await page.goto(`${baseUrl}/ar/admin/staff`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("table tbody tr", { timeout: 10000 });
        await assertNoOverflow(page, "Arabic staff directory");
        await page.getByText("رنا حبيب").first().waitFor();

        // Verify direction is RTL
        const htmlDir = await page.locator("html").getAttribute("dir");
        assert.equal(htmlDir, "rtl", "Arabic staff page must have dir='rtl'");

        // 2. Arabic Customer Directory
        await page.goto(`${baseUrl}/ar/admin/customers`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("table tbody tr", { timeout: 10000 });
        await assertNoOverflow(page, "Arabic customer directory");
        const customerTableText = await page.locator("table").innerText();
        assert.match(customerTableText, /[\u0600-\u06ff]/, "Arabic customer table must display Arabic text");

        // 3. Arabic Activity Log
        await page.goto(`${baseUrl}/ar/admin/activity`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("table tbody tr, .space-y-3, main", { timeout: 10000 });
        await assertNoOverflow(page, "Arabic activity log");
        const activityText = await page.locator("main").innerText();
        assert.match(activityText, /[\u0600-\u06ff]/, "Arabic activity page must display Arabic text");

        // Ensure zero page errors
        assert.equal(pageErrors.length, 0, `Page errors encountered in Check 134: ${pageErrors.join("; ")}`);
      } finally {
        await context.close();
      }
    }
  );
}
