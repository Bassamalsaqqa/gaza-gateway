import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createServer } from "vite";

async function startServer(port = 4174) {
  const server = await createServer({
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

async function runCmsSmoke() {
  console.log("\n========================================");
  console.log("Phase 7 Task 1 — CMS Website Smoke Test");
  console.log("Targeting /admin/website and /ar/admin/website at 1440 and 390");
  console.log("========================================\n");

  const server = process.env.CMS_TEST_URL
    ? { url: process.env.CMS_TEST_URL, stop: async () => {} }
    : await startServer(4174);
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
    // ------------------------------------------------------------------------
    // Check 1: Desktop 1440x900 — English /admin/website (Home CMS Editor)
    // ------------------------------------------------------------------------
    console.log("Running Check 1: Desktop 1440x900 — Home CMS Editor (save, preview, discard, section policy)...");
    const ctxDesktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await ctxDesktop.addInitScript(() => {
      localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
    });
    const pageDesktop = await ctxDesktop.newPage();
    await pageDesktop.goto(`${baseUrl}/admin/website`, { waitUntil: "networkidle" });

    // Verify page title and header
    await pageDesktop.getByRole("heading", { name: "Website content", level: 1 }).waitFor({ timeout: 15000 });
    await pageDesktop.getByText("Compiled published content", { exact: true }).waitFor();
    await pageDesktop.getByText("Local browser draft · Not published").waitFor();

    // Verify preview links with ?contentPreview=1
    const previewEn = pageDesktop.getByRole("link", { name: "Preview English" });
    const previewAr = pageDesktop.getByRole("link", { name: "Preview Arabic" });
    assert.equal(await previewEn.getAttribute("href"), "/?contentPreview=1");
    assert.equal(await previewAr.getAttribute("href"), "/ar?contentPreview=1");

    // Verify required section policy: hero, search, board are locked
    const requiredBadges = pageDesktop.getByText("Required");
    assert.equal(await requiredBadges.count(), 3, "Expected 3 required section badges");

    // Verify copy editing: change headline
    const headlineInput = pageDesktop.locator("#copy-h1-en");
    await headlineInput.waitFor();
    await headlineInput.fill("Flights from Gaza — New Edition");

    // Status chip should transition to "Unsaved changes"
    await pageDesktop.getByText("Unsaved changes").waitFor();

    // Save draft
    const saveButton = pageDesktop.getByRole("button", { name: "Save draft" });
    assert.equal(await saveButton.isEnabled(), true);
    await saveButton.click();

    // Should transition to "Local draft saved"
    await pageDesktop.getByText("Local draft saved", { exact: true }).waitFor();

    // Verify draft stored in localStorage
    const storedDraft = await pageDesktop.evaluate(() => {
      const raw = localStorage.getItem("gza.content.draft.v1");
      return raw ? JSON.parse(raw) : null;
    });
    assert.ok(storedDraft?.drafts?.home, "Home draft was not persisted in gza.content.draft.v1");
    assert.equal(storedDraft.drafts.home.copy.h1.en, "Flights from Gaza — New Edition");
    const savedEvents = await pageDesktop.evaluate(() => JSON.parse(localStorage.getItem("gza.activity.v1")).events);
    assert.equal(savedEvents.filter((event) => event.module === "content" && event.targetId === "home").length, 1);

    // Verify discard draft
    const discardBtn = pageDesktop.getByRole("button", { name: "Discard draft" });
    await discardBtn.click();

    // Confirmation dialog appears
    const confirmDiscardBtn = pageDesktop.getByRole("alertdialog").getByRole("button", { name: "Discard draft" });
    await confirmDiscardBtn.click();

    // Reverts to compiled published content
    await pageDesktop.getByText("Compiled published content", { exact: true }).waitFor();
    const storageAfterDiscard = await pageDesktop.evaluate(() => {
      const raw = localStorage.getItem("gza.content.draft.v1");
      return raw ? JSON.parse(raw) : null;
    });
    assert.equal(storageAfterDiscard?.drafts?.home, undefined, "Home draft was not discarded");
    const discardedEvents = await pageDesktop.evaluate(() => JSON.parse(localStorage.getItem("gza.activity.v1")).events);
    assert.equal(discardedEvents.filter((event) => event.module === "content" && event.targetId === "home").length, 2);

    // Native cross-tab change while this form is dirty must retain the local values.
    await headlineInput.fill("Unsaved editor A");
    const editorB = await ctxDesktop.newPage();
    await editorB.goto(`${baseUrl}/admin/website`, { waitUntil: "networkidle" });
    await editorB.locator("#copy-h1-en").fill("Committed editor B");
    await editorB.getByRole("button", { name: "Save draft", exact: true }).click();
    await editorB.getByText("Local draft saved", { exact: true }).waitFor();
    await pageDesktop.getByText("External changes detected", { exact: true }).waitFor();
    assert.equal(await headlineInput.inputValue(), "Unsaved editor A");
    const beforeStaleSave = await pageDesktop.evaluate(() => ({ draft: localStorage.getItem("gza.content.draft.v1"), audit: localStorage.getItem("gza.activity.v1") }));
    await saveButton.click();
    await pageDesktop.getByText("Another editor changed this draft. Reload the saved version before saving again.", { exact: true }).waitFor().catch(async (error) => {
      console.error("Stale-save diagnostic", await pageDesktop.getByRole("alert").allTextContents(), await headlineInput.inputValue());
      throw error;
    });
    assert.deepEqual(await pageDesktop.evaluate(() => ({ draft: localStorage.getItem("gza.content.draft.v1"), audit: localStorage.getItem("gza.activity.v1") })), beforeStaleSave);
    await pageDesktop.getByRole("button", { name: "Reload remote draft", exact: true }).click();
    await pageDesktop.getByRole("alertdialog").getByRole("button", { name: "Reload remote draft", exact: true }).click();
    await pageDesktop.waitForFunction(() => document.getElementById("copy-h1-en")?.value === "Committed editor B");
    await editorB.close();

    // Required write failure remains visible; no false audit or success.
    await headlineInput.fill("Retained after quota failure");
    await pageDesktop.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === "gza.content.draft.v1") throw new DOMException("Quota", "QuotaExceededError");
        return original.call(this, key, value);
      };
    });
    const beforeFailedSave = await pageDesktop.evaluate(() => localStorage.getItem("gza.activity.v1"));
    await saveButton.click();
    await pageDesktop.getByText("The draft could not be saved in this browser. Your edits have been kept.", { exact: true }).waitFor();
    assert.equal(await headlineInput.inputValue(), "Retained after quota failure");
    assert.equal(await pageDesktop.evaluate(() => localStorage.getItem("gza.activity.v1")), beforeFailedSave);
    await pageDesktop.locator('a[href="/admin/staff"]').first().click();
    await pageDesktop.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
    assert.ok(pageDesktop.url().endsWith("/admin/website"));
    assert.equal(await headlineInput.inputValue(), "Retained after quota failure");
    console.log("✔ Check 1 passed: Home CMS draft lifecycle and section policy verified at 1440.");

    // ------------------------------------------------------------------------
    // Check 2: Mobile 390x844 — Arabic /ar/admin/website (Travel CMS Editor)
    // ------------------------------------------------------------------------
    console.log("Running Check 2: Mobile 390x844 — Travel CMS Editor (points, other-locale preservation, reorder)...");
    const ctxMobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await ctxMobile.addInitScript(() => {
      localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
    });
    const pageMobile = await ctxMobile.newPage();
    await pageMobile.goto(`${baseUrl}/ar/admin/website`, { waitUntil: "networkidle" });

    // Switch to Travel tab ("معلومات السفر")
    const travelTabBtn = pageMobile.getByRole("tab", { name: "معلومات السفر" });
    await travelTabBtn.click();

    // Verify Travel preview links
    const trPreviewEn = pageMobile.getByRole("link", { name: "معاينة بالإنجليزية" });
    const trPreviewAr = pageMobile.getByRole("link", { name: "معاينة بالعربية" });
    assert.equal(await trPreviewEn.getAttribute("href"), "/travel?contentPreview=1");
    assert.equal(await trPreviewAr.getAttribute("href"), "/ar/travel?contentPreview=1");

    // Add checklist point ("إضافة عنصر")
    const addPointBtn = pageMobile.getByRole("button", { name: "إضافة عنصر" });
    await addPointBtn.click();

    // Switch edit language to Arabic ("العربية")
    const arToggleBtn = pageMobile.getByRole("button", { name: "العربية", exact: true });
    await arToggleBtn.click();

    // Find the newly added point input and type Arabic text
    const pointInputs = pageMobile.locator('[id^="tr-pt-"][id$="-ar"]');
    const newPointInput = pointInputs.last();
    await newPointInput.fill("نص جديد للتحقق من السفر");

    // Switch edit language to English ("الإنجليزية")
    const enToggleBtn = pageMobile.getByRole("button", { name: "الإنجليزية", exact: true });
    await enToggleBtn.click();

    // Enter English text for the new point
    const enPointInputs = pageMobile.locator('[id^="tr-pt-"][id$="-en"]');
    const newEnPointInput = enPointInputs.last();
    await newEnPointInput.fill("New verified checklist item");

    // Save travel draft ("حفظ مسوّدة")
    const saveTravelBtn = pageMobile.getByRole("button", { name: "حفظ مسوّدة" });
    await saveTravelBtn.click();
    await pageMobile.getByText("تم حفظ المسودة محليًا", { exact: true }).waitFor();

    // Verify persisted in localStorage with both languages
    const travelDraft = await pageMobile.evaluate(() => {
      const raw = localStorage.getItem("gza.content.draft.v1");
      return raw ? JSON.parse(raw) : null;
    });
    assert.ok(travelDraft?.drafts?.travel, "Travel draft was not persisted");
    const prepSec = travelDraft.drafts.travel.sections.find((s) => s.id === "prepare");
    const lastPt = prepSec.points.at(-1);
    assert.equal(lastPt.text.ar, "نص جديد للتحقق من السفر");
    assert.equal(lastPt.text.en, "New verified checklist item");
    console.log("✔ Check 2 passed: Travel CMS item add and bilingual preservation verified at 390.");

    // ------------------------------------------------------------------------
    // Check 3: Read-Only / Viewer Mode Check
    // ------------------------------------------------------------------------
    console.log("Running Check 3: Viewer read-only permissions check...");
    const ctxViewer = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await ctxViewer.addInitScript(() => {
      localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-3", overrides: {} }));
    });
    const pageViewer = await ctxViewer.newPage();
    await pageViewer.goto(`${baseUrl}/admin/website`, { waitUntil: "networkidle" });

    // Inputs must be read-only
    const homeH1Input = pageViewer.locator("#copy-h1-en");
    await homeH1Input.waitFor();
    assert.equal(await homeH1Input.getAttribute("readonly"), "");

    // Save button must be disabled for viewer
    const viewerSaveBtn = pageViewer.getByRole("button", { name: "Save draft" });
    assert.equal(await viewerSaveBtn.isDisabled(), true);
    console.log("✔ Check 3 passed: Viewer read-only protections verified.");

    console.log("\n========================================");
    console.log("All CMS Website smoke checks passed successfully!");
    console.log("========================================\n");
  } finally {
    await browser.close();
    await server.stop();
  }
}

runCmsSmoke().catch((err) => {
  console.error("Smoke check failure:", err);
  process.exit(1);
});
