import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { admin2En, admin2Ar } from "../../src/lib/i18n-admin2.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = path.resolve(__dirname, "../..");
const SCREENSHOTS_DIR = path.resolve(WORKTREE_ROOT, "scratch/phase7-task2/screenshots");
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function startServer(port = 4175) {
  const server = await createServer({
    root: WORKTREE_ROOT,
    configFile: path.resolve(WORKTREE_ROOT, "vite.config.ts"),
    server: { port },
    logLevel: "error",
  });
  await server.listen();
  return {
    url: `http://localhost:${port}`,
    stop: async () => {
      await server.close();
    },
  };
}

async function runTask2Smoke() {
  console.log("\n========================================================");
  console.log("Phase 7 Task 2 — Targeted CMS Verification & Smoke Tests");
  console.log("========================================================\n");

  const server = process.env.CMS_TEST_URL
    ? { url: process.env.CMS_TEST_URL, stop: async () => {} }
    : await startServer(4175);
  const baseUrl = server.url;
  console.log(`Server running at ${baseUrl}`);

  let browser;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  } catch {
    try {
      browser = await chromium.launch({ channel: "chrome", headless: true });
    } catch {
      browser = await chromium.launch({ headless: true });
    }
  }

  try {
    if (process.env.CMS_FOCUS_TASK2 !== "errors") {
    // ------------------------------------------------------------------------
    // Check 1: Airport CMS Editor (Desktop 1440x900, EN & AR)
    // ------------------------------------------------------------------------
    console.log("Running Check 1: Airport CMS Editor (save, preview, discard, sources grounding)...");
    const ctxDesktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await ctxDesktop.addInitScript(() => {
      localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
    });
    const pageAirport = await ctxDesktop.newPage();
    await pageAirport.goto(`${baseUrl}/admin/airport`, { waitUntil: "networkidle" });

    // Verify page header and Past tab
    await pageAirport.getByRole("heading", { name: "Airport & archive", level: 1 }).waitFor({ timeout: 15000 });
    await pageAirport.getByText("Compiled published content", { exact: true }).waitFor();

    // Verify preview links with ?contentPreview=1
    const prevEn = pageAirport.getByRole("link", { name: "Preview English" });
    const prevAr = pageAirport.getByRole("link", { name: "Preview Arabic" });
    assert.equal(await prevEn.getAttribute("href"), "/airport/past?contentPreview=1");
    assert.equal(await prevAr.getAttribute("href"), "/ar/airport/past?contentPreview=1");

    // Edit Past intro title
    const introTitle = pageAirport.locator("#past-intro-title-en");
    await introTitle.waitFor();
    await introTitle.fill("Gaza International Airport — Curated Documentary History");

    // Status chip should transition to "Unsaved changes"
    await pageAirport.getByText("Unsaved changes").waitFor();

    // Save draft
    const saveBtn = pageAirport.getByRole("button", { name: "Save draft" });
    assert.equal(await saveBtn.isEnabled(), true);
    await saveBtn.click();
    await pageAirport.getByText("Local draft saved", { exact: true }).waitFor();

    // Verify draft stored in localStorage
    const pastDraft = await pageAirport.evaluate(() => {
      const raw = localStorage.getItem("gza.content.draft.v1");
      return raw ? JSON.parse(raw) : null;
    });
    assert.ok(pastDraft?.drafts?.["airport.past"], "Airport Past draft not persisted");
    assert.equal(pastDraft.drafts["airport.past"].intro.title.en, "Gaza International Airport — Curated Documentary History");
    const previewPast = await ctxDesktop.newPage();
    await previewPast.goto(`${baseUrl}/airport/past?contentPreview=1`);
    await previewPast.getByRole("heading", { name: "Gaza International Airport — Curated Documentary History", exact: true }).waitFor();
    await previewPast.goto(`${baseUrl}/airport/past`);
    assert.equal(await previewPast.getByRole("heading", { name: "Gaza International Airport — Curated Documentary History", exact: true }).count(), 0);
    await previewPast.close();

    // Capture screenshot
    await pageAirport.screenshot({ path: path.join(SCREENSHOTS_DIR, "01-airport-past-saved-1440.png") });

    // Discard draft
    const discardBtn = pageAirport.getByRole("button", { name: "Discard draft" });
    await discardBtn.click();
    const confirmDiscard = pageAirport.getByRole("button", { name: "Discard draft" }).last();
    await confirmDiscard.click();
    await pageAirport.getByText("Compiled published content", { exact: true }).waitFor();
    console.log("✔ Check 1 passed: Airport Past CMS save, preview, discard verified.");

    // ------------------------------------------------------------------------
    // Check 2: Airport Present & Future Deep Linking at 390 Mobile
    // ------------------------------------------------------------------------
    console.log("Running Check 2: Airport Present & Future Deep Linking (390 Mobile, RTL)...");
    const ctxMobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await ctxMobile.addInitScript(() => {
      localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
    });
    const pageAirportMobile = await ctxMobile.newPage();
    await pageAirportMobile.goto(`${baseUrl}/ar/admin/airport?tab=present`, { waitUntil: "networkidle" });

    // Verify Present tab is active in Arabic
    await pageAirportMobile.getByText("المؤشرات والمعلومات الموثقة").waitFor({ timeout: 15000 });
    await pageAirportMobile.screenshot({ path: path.join(SCREENSHOTS_DIR, "02-airport-present-mobile-390.png") });

    // Navigate to Future tab via deep link
    await pageAirportMobile.goto(`${baseUrl}/ar/admin/airport?tab=future`, { waitUntil: "networkidle" });
    // Verify illustrative notice is rendered
    await pageAirportMobile.getByText("إشعار توضيحي").waitFor({ timeout: 15000 });
    await pageAirportMobile.screenshot({ path: path.join(SCREENSHOTS_DIR, "03-airport-future-mobile-390.png") });
    console.log("✔ Check 2 passed: Airport Present/Future mobile deep links & Arabic RTL verified.");

    // ------------------------------------------------------------------------
    // Check 3: Destination Editorial & Presentation (Content Editor without ops.view)
    // ------------------------------------------------------------------------
    console.log("Running Check 3: Destination Editorial & Presentation Editor (Content Editor adm-2)...");
    const ctxEditor = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await ctxEditor.addInitScript(() => {
      // adm-2 has content.view + content.edit, but NO ops.view or ops.edit
      localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-2", overrides: {} }));
    });
    const pageDest = await ctxEditor.newPage();
    await pageDest.goto(`${baseUrl}/admin/destinations`, { waitUntil: "networkidle" });

    // Verify content editor can access destinations list
    await pageDest.getByText("الدليل والسرد التحريري").or(pageDest.getByText("Editorial narrative & guide")).first().waitFor({ timeout: 15000 });
    await pageDest.screenshot({ path: path.join(SCREENSHOTS_DIR, "04-destinations-index-editor-1440.png") });

    // Open Amman editorial editor via deep link
    await pageDest.goto(`${baseUrl}/admin/destinations/AMM?tab=content`, { waitUntil: "networkidle" });
    await pageDest.getByText("Editorial narrative & guide").or(pageDest.getByText("الدليل والسرد التحريري")).first().waitFor();

    // Add Good to know point
    const addPtBtn = pageDest.getByRole("button", { name: "Add point" }).or(pageDest.getByRole("button", { name: "إضافة معلومة" })).first();
    await addPtBtn.click();

    // Save editorial draft
    const editorialSection = pageDest.locator('section[aria-labelledby="dst-ed-heading"]');
    const saveEditorialBtn = editorialSection.getByRole("button", { name: "Save draft" });
    await saveEditorialBtn.click();
    await pageDest.getByText("Local draft saved").first().waitFor();

    // Verify localStorage has AMM point and preserves other destinations (e.g. CAI)
    const destDraft = await pageDest.evaluate(() => {
      const raw = localStorage.getItem("gza.content.draft.v1");
      return raw ? JSON.parse(raw) : null;
    });
    assert.ok(destDraft?.drafts?.["destinations.editorial"], "Destinations editorial draft not persisted");
    const ammEntry = destDraft.drafts["destinations.editorial"].destinations.find((d) => d.code === "AMM");
    assert.ok(ammEntry);
    const caiEntry = destDraft.drafts["destinations.editorial"].destinations.find((d) => d.code === "CAI");
    assert.ok(caiEntry, "Other destination CAI was not preserved in bundle");
    const compiledEditorial = await pageDest.evaluate(async () =>
      (await import("/src/content/published/destinations-editorial.ts")).publishedDestinationsEditorial);
    assert.deepEqual(destDraft.drafts["destinations.editorial"].destinations.filter((d) => d.code !== "AMM"),
      compiledEditorial.destinations.filter((d) => d.code !== "AMM"), "Other destinations must retain their exact compiled facts");

    await pageDest.screenshot({ path: path.join(SCREENSHOTS_DIR, "05-destination-editorial-amm-1440.png") });
    console.log("✔ Check 3 passed: Destination editorial CRUD & other-code preservation verified.");

    // ------------------------------------------------------------------------
    // Check 4: Website Pages & Navigation Tabs
    // ------------------------------------------------------------------------
    console.log("Running Check 4: Website Pages (Block CRUD) & Compiled Navigation...");
    const pageWeb = await ctxDesktop.newPage();
    await pageWeb.goto(`${baseUrl}/admin/website?tab=pages&page=about`, { waitUntil: "networkidle" });

    // Verify informational pages heading
    await pageWeb.getByText("Informational pages").or(pageWeb.getByText("الصفحات التعريفية")).first().waitFor({ timeout: 15000 });

    // Add block to About page
    const addBlockBtn = pageWeb.getByRole("button", { name: "Add content block" }).or(pageWeb.getByRole("button", { name: "إضافة قسم" })).first();
    await addBlockBtn.click();

    // Save pages draft
    const savePagesBtn = pageWeb.getByRole("button", { name: "Save draft" }).first();
    await savePagesBtn.click();
    await pageWeb.getByText("Local draft saved").first().waitFor();

    // Verify other pages (contact, privacy, terms) preserved in draft
    const pagesDraft = await pageWeb.evaluate(() => {
      const raw = localStorage.getItem("gza.content.draft.v1");
      return raw ? JSON.parse(raw) : null;
    });
    assert.ok(pagesDraft?.drafts?.["pages.information"], "Pages draft not persisted");
    assert.equal(pagesDraft.drafts["pages.information"].pages.length, 4, "Expected all 4 pages preserved");
    const compiledPages = await pageWeb.evaluate(async () =>
      (await import("/src/content/published/information-pages.ts")).publishedInformationPages);
    assert.deepEqual(pagesDraft.drafts["pages.information"].pages.filter((p) => p.id !== "about"),
      compiledPages.pages.filter((p) => p.id !== "about"), "Other page values must remain byte-equivalent");

    // Navigate to Contact page and verify authority notice
    await pageWeb.goto(`${baseUrl}/admin/website?tab=pages&page=contact`, { waitUntil: "networkidle" });
    await pageWeb.getByText("Settings / Contact authority")
      .or(pageWeb.getByText("صلاحيات الإعدادات والتواصل"))
      .first()
      .waitFor();

    // Navigate to Navigation tab and verify compiled links & source update notice
    await pageWeb.goto(`${baseUrl}/admin/website?tab=navigation`, { waitUntil: "networkidle" });
    await pageWeb.getByText("Compiled site navigation")
      .or(pageWeb.getByText("التنقل البرمجي المترجم"))
      .first()
      .waitFor();
    await pageWeb.getByRole("link", { name: "Destination editorial content can also be managed from the Destinations management area." })
      .or(pageWeb.getByRole("link", { name: "يمكن أيضاً إدارة المحتوى التحريري للوجهات من قسم إدارة الوجهات." }))
      .first()
      .waitFor();

    await pageWeb.screenshot({ path: path.join(SCREENSHOTS_DIR, "06-website-navigation-1440.png") });
    console.log("✔ Check 4 passed: Pages block CRUD, Contact disclosure & Compiled navigation verified.");

    // ------------------------------------------------------------------------
    // Check 5: Viewer Read-Only Permissions (adm-3)
    // ------------------------------------------------------------------------
    console.log("Running Check 5: Viewer read-only permissions check...");
    const ctxViewer = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await ctxViewer.addInitScript(() => {
      localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-3", overrides: {} }));
    });
    const pageViewer = await ctxViewer.newPage();
    await pageViewer.goto(`${baseUrl}/admin/airport`, { waitUntil: "networkidle" });

    // Verify save button disabled
    const viewerSaveBtn = pageViewer.getByRole("button", { name: "Save draft" }).first();
    assert.equal(await viewerSaveBtn.isDisabled(), true);
    console.log("✔ Check 5 passed: Viewer read-only protections verified.");
    }

    console.log("Running Check 6: EN/AR invalid-field focus, native cross-tab conflict, read failure and responsive errors...");
    for (const locale of ["en", "ar"]) {
      const copy = locale === "ar" ? admin2Ar : admin2En;
      const prefix = locale === "ar" ? "/ar" : "";
      const context = await browser.newContext({ viewport: { width: locale === "ar" ? 390 : 1440, height: 900 } });
      await context.addInitScript(() => localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1" })));
      const a = await context.newPage();
      const errors = [];
      a.on("pageerror", (error) => errors.push(error.message));
      await a.goto(`${baseUrl}${prefix}/admin/airport?tab=future`);
      await a.getByRole("button", { name: locale === "ar" ? "العربية" : "Arabic", exact: true }).click();
      await a.locator("#future-copy-title-ar").fill("");
      await a.getByRole("button", { name: locale === "ar" ? "الإنجليزية" : "English", exact: true }).click();
      const saveName = copy["a2.saveDraft"];
      await a.getByRole("button", { name: saveName, exact: true }).click();
      const invalid = a.locator("#future-copy-title-ar");
      await invalid.waitFor();
      await a.waitForFunction(() => document.activeElement?.id === "future-copy-title-ar");
      assert.equal(await invalid.getAttribute("aria-invalid"), "true");
      assert.equal(await invalid.getAttribute("aria-describedby"), "future-copy-title-ar-err");
      assert.equal(await a.evaluate(() => localStorage.getItem("gza.activity.v1")), null, "Failed validation must not audit");
      await invalid.fill("مستقبل المطار — مراجعة تحريرية");
      await a.getByRole("button", { name: saveName, exact: true }).click();
      await a.waitForFunction(() => JSON.parse(localStorage.getItem("gza.content.draft.v1") || "{}").drafts?.["airport.future"]);
      await invalid.fill("تعديل محلي محفوظ في النموذج");
      const b = await context.newPage();
      await b.goto(`${baseUrl}${prefix}/admin/airport?tab=future`);
      await b.getByRole("button", { name: locale === "ar" ? "العربية" : "Arabic", exact: true }).click();
      await b.locator("#future-copy-title-ar").fill("تعديل من تبويب آخر");
      await b.getByRole("button", { name: saveName, exact: true }).click();
      await b.getByText(copy["content.localDraft"], { exact: true }).waitFor();
      await a.waitForFunction(() => JSON.parse(localStorage.getItem("gza.content.draft.v1") || "{}").drafts?.["airport.future"].copy.title.ar === "تعديل من تبويب آخر");
      const committed = await a.evaluate(() => ({ content: localStorage.getItem("gza.content.draft.v1"), activity: localStorage.getItem("gza.activity.v1") }));
      await a.getByRole("button", { name: saveName, exact: true }).click();
      await a.getByText(locale === "ar"
        ? "غيّر محرر آخر هذه المسودة. أعد تحميل النسخة المحفوظة قبل الحفظ مجددًا."
        : "Another editor changed this draft. Reload the saved version before saving again.", { exact: true }).waitFor();
      assert.equal(await invalid.inputValue(), "تعديل محلي محفوظ في النموذج");
      assert.deepEqual(await a.evaluate(() => ({ content: localStorage.getItem("gza.content.draft.v1"), activity: localStorage.getItem("gza.activity.v1") })), committed);
      await b.evaluate(() => localStorage.setItem("gza.content.draft.v1", "{broken"));
      await a.getByText(locale === "ar"
        ? "تحتوي المسودة المحلية المحفوظة على بيانات غير صالحة. تم الاحتفاظ بتعديلاتك."
        : "The saved local draft contains invalid data. Your edits have been kept.", { exact: true }).waitFor();
      assert.equal(await invalid.inputValue(), "تعديل محلي محفوظ في النموذج");
      assert.equal(await a.getByRole("button", { name: saveName, exact: true }).isDisabled(), true);
      assert.equal(await a.evaluate(() => localStorage.getItem("gza.content.draft.v1")), "{broken");
      const overflow = await a.evaluate(() => ({
        client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
        elements: [...document.querySelectorAll("body *")].map((e) => ({ tag: e.tagName, id: e.id, className: e.className,
          left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right }))
          .filter((e) => e.left < -1 || e.right > document.documentElement.clientWidth + 1),
      }));
      await a.screenshot({ path: path.join(SCREENSHOTS_DIR, `07-retained-conflict-error-${locale}.png`) });
      assert.ok(overflow.scroll <= overflow.client + 1, `${locale} overflow: ${JSON.stringify(overflow)}`);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log("✔ Check 6 passed: EN/AR field focus, exact conflict/no-write proof, raw-byte preservation and no overflow/page errors.");

    console.log("\n========================================================");
    console.log("ALL TARGETED PHASE 7 TASK 2 CHECKS PASSED SUCCESSFULLY!");
    console.log("========================================================\n");
  } finally {
    await browser.close();
    await server.stop();
  }
}

runTask2Smoke().catch((err) => {
  console.error("Task 2 smoke check failure:", err);
  process.exit(1);
});
