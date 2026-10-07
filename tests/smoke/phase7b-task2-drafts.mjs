import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = path.resolve(__dirname, "../..");
const SCREENSHOTS_DIR = path.resolve(WORKTREE_ROOT, "scratch/phase7b-task2/screenshots");
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function startServer(port = 4178) {
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
  console.log("\n==================================================================");
  console.log("Phase 7B Task 2 — Archive & Source Draft Forms Smoke Tests");
  console.log("==================================================================\n");

  const server = process.env.DRAFTS_TEST_URL
    ? { url: process.env.DRAFTS_TEST_URL, stop: async () => {} }
    : await startServer(4178);
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

  const pageErrors = [];

  try {
    // ------------------------------------------------------------------------
    // Check 1: Viewer Protection (adm-3 role) — Zero Edit Controls
    // ------------------------------------------------------------------------
    console.log("Check 1: Viewer (adm-3) protection — zero edit controls...");
    const ctxViewer = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await ctxViewer.addInitScript(() => {
      localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-3", overrides: {} }));
    });
    const pageViewer = await ctxViewer.newPage();
    pageViewer.on("pageerror", (err) => pageErrors.push(err.message));

    await pageViewer.goto(`${baseUrl}/admin/airport?tab=archive`, { waitUntil: "networkidle" });
    await pageViewer.waitForTimeout(500);

    // Assert zero "Edit" buttons in archive records
    const archiveEditButtons = await pageViewer.locator('button:has-text("Edit record"), button:text-is("Edit")').count();
    assert.equal(archiveEditButtons, 0, "Viewer adm-3 must see 0 edit buttons in archive list");

    // Check Sources tab
    const sourcesTabViewer = pageViewer.getByRole("tab", { name: /Sources/i });
    await sourcesTabViewer.click();
    await pageViewer.waitForTimeout(300);

    const newSourceBtnCount = await pageViewer.locator('button:has-text("+ New source"), button:has-text("New source")').count();
    assert.equal(newSourceBtnCount, 0, "Viewer adm-3 must see 0 '+ New source' buttons");

    const sourceEditButtons = await pageViewer.locator('button:has-text("Edit source")').count();
    assert.equal(sourceEditButtons, 0, "Viewer adm-3 must see 0 source edit buttons");

    await pageViewer.screenshot({
      path: path.join(SCREENSHOTS_DIR, "01-viewer-protection-en.png"),
      fullPage: false,
    });
    await ctxViewer.close();
    console.log("✔ Check 1 passed: Viewer has zero edit/creation controls");

    // ------------------------------------------------------------------------
    // Check 2: Desktop 1440 EN — Inspect Real Image Variant & Animation Bounds
    // ------------------------------------------------------------------------
    console.log("Check 2: Desktop 1440 EN — Inspect Image Variant past-003 & dialog bounds...");
    const ctxAdmin = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await ctxAdmin.addInitScript(() => {
      localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
    });
    const pageAdmin = await ctxAdmin.newPage();
    pageAdmin.on("pageerror", (err) => pageErrors.push(err.message));

    await pageAdmin.goto(`${baseUrl}/admin/airport?tab=archive`, { waitUntil: "networkidle" });
    await pageAdmin.waitForTimeout(500);

    // Find and inspect past-003
    const cardPast003 = pageAdmin.locator('li:has-text("past-003"), tr:has-text("past-003")').first();
    await cardPast003.waitFor({ timeout: 10000 });
    const inspectBtn = cardPast003.locator('button:has-text("Inspect")').first();
    await inspectBtn.click();

    // Wait for animation to settle
    await pageAdmin.waitForTimeout(600);

    const sheetDialog = pageAdmin.locator('[role="dialog"]').first();
    await sheetDialog.waitFor();

    // Verify format [WEBP] / [AVIF] / [JPG]
    const formatVariant = sheetDialog.locator('text=/WEBP|AVIF|JPG|JPEG/').first();
    await formatVariant.waitFor({ timeout: 5000 });

    const box = await sheetDialog.boundingBox();
    assert.ok(box, "Dialog must have a bounding box");
    assert.ok(box.width > 300, `Dialog width must be > 300px, was ${box.width}`);
    assert.ok(box.x >= 0, `Dialog x-position must be within viewport, was ${box.x}`);

    // Verify page has no horizontal overflow
    const hasHorizontalOverflow = await pageAdmin.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    assert.equal(hasHorizontalOverflow, false, "Page must not have horizontal overflow with dialog open");

    // Close inspect sheet
    const closeBtn = sheetDialog.locator('button[aria-label="Close"], button:has-text("Close")').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await pageAdmin.keyboard.press("Escape");
    }
    await pageAdmin.waitForTimeout(300);

    await pageAdmin.screenshot({
      path: path.join(SCREENSHOTS_DIR, "02-desktop-image-inspection.png"),
      fullPage: false,
    });
    console.log("✔ Check 2 passed: Real image dialog bounds, variant format and overflow verified");

    // ------------------------------------------------------------------------
    // Check 3: Save Bilingual Record Draft, Reload Persistence & Public Verification
    // ------------------------------------------------------------------------
    console.log("Check 3: Save bilingual record draft, reload persistence & verify public unchanged...");

    // Click Edit on past-003
    const cardPast003ForEdit = pageAdmin.locator('li:has-text("past-003"), tr:has-text("past-003")').first();
    const editPast003 = cardPast003ForEdit.locator('button:has-text("Edit")').first();
    await editPast003.click();
    await pageAdmin.waitForTimeout(600);

    const recordEditor = pageAdmin.locator('[role="dialog"]').first();
    await recordEditor.waitFor();

    const titleEnInput = pageAdmin.locator("#rec-field-title-en");
    await titleEnInput.waitFor();
    const originalEnTitle = await titleEnInput.inputValue();
    const testEnTitle = `${originalEnTitle} [Task2 Draft]`;
    await titleEnInput.fill(testEnTitle);

    // Switch to Arabic in the editor
    const arabicTabBtn = recordEditor.locator('button:has-text("العربية"), button:has-text("Arabic")').first();
    await arabicTabBtn.click();
    await pageAdmin.waitForTimeout(200);

    const titleArInput = pageAdmin.locator("#rec-field-title-ar");
    await titleArInput.waitFor();
    const originalArTitle = await titleArInput.inputValue();
    const testArTitle = `${originalArTitle} [مسودة تجريبية]`;
    await titleArInput.fill(testArTitle);

    // Save Draft
    const saveDraftBtn = recordEditor.locator('button:has-text("Save local draft")').first();
    await saveDraftBtn.click();

    // Verify toast or sheet close
    await recordEditor.waitFor({ state: "detached", timeout: 5000 });
    console.log("Draft saved and editor sheet closed.");

    // Verify Draft badge appears on card/row past-003
    const cardWithDraft = pageAdmin.locator('li:has-text("past-003"), tr:has-text("past-003")').first();
    await cardWithDraft.locator('span:has-text("Draft")').waitFor({ timeout: 5000 });

    // Reload page and verify persistence
    await pageAdmin.reload({ waitUntil: "networkidle" });
    await pageAdmin.waitForTimeout(500);
    const cardAfterReload = pageAdmin.locator('li:has-text("past-003"), tr:has-text("past-003")').first();
    await cardAfterReload.locator('span:has-text("Draft")').waitFor({ timeout: 5000 });

    // Verify public view does not leak the draft
    const pagePublic = await ctxAdmin.newPage();
    await pagePublic.goto(`${baseUrl}/airport/past`, { waitUntil: "networkidle" });
    const publicContent = await pagePublic.content();
    assert.ok(!publicContent.includes("[Task2 Draft]"), "Public page must not contain unpromoted draft copy");
    await pagePublic.close();

    await pageAdmin.screenshot({
      path: path.join(SCREENSHOTS_DIR, "03-bilingual-draft-persisted.png"),
      fullPage: false,
    });
    console.log("✔ Check 3 passed: Bilingual draft persisted, public view untouched");

    // ------------------------------------------------------------------------
    // Check 4: Rights / Publication Rejection with Retained Input and Exact Error
    // ------------------------------------------------------------------------
    console.log("Check 4: Publication rejection with retained input and exact field error...");
    const cardPast003Again = pageAdmin.locator('li:has-text("past-003"), tr:has-text("past-003")').first();
    await cardPast003Again.locator('button:has-text("Edit")').first().click();
    await pageAdmin.waitForTimeout(600);

    const pubStateSelect = pageAdmin.locator("#rec-field-publicationState");
    await pubStateSelect.selectOption("published");

    const pubBasisSelect = pageAdmin.locator("#rec-field-publicationBasis");
    await pubBasisSelect.selectOption("");

    const saveAttemptBtn = pageAdmin.locator('button:has-text("Save local draft")').first();
    await saveAttemptBtn.click();
    await pageAdmin.waitForTimeout(500);

    // Assert exact field error is visible
    const anyErr = pageAdmin.locator('#rec-field-publicationBasis-err, #rec-field-rights-status-err, #rec-field-date-err').first();
    await anyErr.waitFor();
    const errText = await anyErr.textContent();
    assert.ok(errText && errText.length > 0, "Must display publication/rights rejection error");

    // Assert input was retained
    const currentPubState = await pubStateSelect.inputValue();
    assert.equal(currentPubState, "published", "Input state must be retained on rejection");

    // Cancel / Close editor
    const cancelBtn = pageAdmin.locator('button:has-text("Cancel")').first();
    await cancelBtn.click();
    await pageAdmin.waitForTimeout(300);

    // Confirm discard dialog if dirty
    const confirmDiscard = pageAdmin.locator('[role="alertdialog"] button:has-text("Discard")').first();
    if (await confirmDiscard.isVisible()) {
      await confirmDiscard.click();
    }
    await pageAdmin.locator('[role="dialog"]').first().waitFor({ state: "detached", timeout: 5000 });

    await pageAdmin.screenshot({
      path: path.join(SCREENSHOTS_DIR, "04-publication-rejection-error.png"),
      fullPage: false,
    });
    console.log("✔ Check 4 passed: Publication rejection with retained input and exact error validated");

    // ------------------------------------------------------------------------
    // Check 5: Source Creation & Selectable in Record Editor
    // ------------------------------------------------------------------------
    console.log("Check 5: Source creation and availability in record editor...");
    const sourcesTab = pageAdmin.getByRole("tab", { name: /Sources/i });
    await sourcesTab.click();
    await pageAdmin.waitForTimeout(400);

    const newSourceBtn = pageAdmin.locator('button:has-text("New source")').first();
    await newSourceBtn.click();
    await pageAdmin.waitForTimeout(400);

    const srcEditor = pageAdmin.locator('[role="dialog"]').first();
    await srcEditor.waitFor();

    const srcIdInput = pageAdmin.locator("#src-field-id");
    await srcIdInput.fill("src-smoke-source");

    const srcTitleInput = pageAdmin.locator("#src-field-title");
    await srcTitleInput.fill("Smoke Test Verified Source");

    const srcPublisherInput = pageAdmin.locator("#src-field-publisher");
    await srcPublisherInput.fill("Palestinian Civil Aviation");

    const srcUrlInput = pageAdmin.locator("#src-field-url");
    await srcUrlInput.fill("https://example.com/smoke-source");

    const saveSourceBtn = srcEditor.locator('button:has-text("Save local draft")').first();
    await saveSourceBtn.click();
    await srcEditor.waitFor({ state: "detached", timeout: 5000 });

    // Assert newly created source appears in list
    await pageAdmin.locator('tr:has-text("src-smoke-source")').waitFor({ timeout: 5000 });

    // Verify it is selectable in record editor
    const archiveTab = pageAdmin.getByRole("tab", { name: /Archive/i });
    await archiveTab.click();
    await pageAdmin.waitForTimeout(400);

    const editRecordBtn = pageAdmin.locator('li:has-text("past-003") button:has-text("Edit"), tr:has-text("past-003") button:has-text("Edit")').first();
    await editRecordBtn.click();
    await pageAdmin.waitForTimeout(600);

    const newSourceCheckbox = pageAdmin.locator('label:has-text("src-smoke-source") input[type="checkbox"]');
    await newSourceCheckbox.waitFor();
    assert.ok(await newSourceCheckbox.isVisible(), "New source must be selectable in record editor");

    // Link it and save
    await newSourceCheckbox.check();
    const saveLinkedRecordBtn = pageAdmin.locator('button:has-text("Save local draft")').first();
    await saveLinkedRecordBtn.click();
    await pageAdmin.locator('[role="dialog"]').first().waitFor({ state: "detached", timeout: 5000 });

    await pageAdmin.screenshot({
      path: path.join(SCREENSHOTS_DIR, "05-source-created-and-linked.png"),
      fullPage: false,
    });
    console.log("✔ Check 5 passed: Source created and linked to record draft");

    // ------------------------------------------------------------------------
    // Check 6: Referenced-Source Discard Rejection
    // ------------------------------------------------------------------------
    console.log("Check 6: Referenced source discard rejection...");
    await sourcesTab.click();
    await pageAdmin.waitForTimeout(400);

    const editSmokeSource = pageAdmin.locator('tr:has-text("src-smoke-source") button:has-text("Edit source")').first();
    await editSmokeSource.click();
    await pageAdmin.waitForTimeout(500);

    const discardSrcBtn = pageAdmin.locator('button:has-text("Discard draft")').first();
    await discardSrcBtn.click();
    await pageAdmin.waitForTimeout(300);

    // Confirm discard
    const confirmDiscardBtn = pageAdmin.locator('[role="alertdialog"] button:has-text("Discard draft")').first();
    await confirmDiscardBtn.click();
    await pageAdmin.waitForTimeout(600);

    // Assert discard referenced error alert appears
    const discardRefAlert = pageAdmin.locator('[role="alert"]:has-text("referenced")');
    await discardRefAlert.waitFor();
    assert.ok(await discardRefAlert.isVisible(), "Discard referenced error alert must appear");

    // Close source sheet
    await pageAdmin.keyboard.press("Escape");
    await pageAdmin.waitForTimeout(400);

    await pageAdmin.screenshot({
      path: path.join(SCREENSHOTS_DIR, "06-referenced-discard-rejected.png"),
      fullPage: false,
    });
    console.log("✔ Check 6 passed: Referenced source discard rejection confirmed");

    // ------------------------------------------------------------------------
    // Check 7: Cross-Tab Conflict Alert
    // ------------------------------------------------------------------------
    console.log("Check 7: Cross-tab conflict alert when baseline is stale...");
    await archiveTab.click();
    await pageAdmin.waitForTimeout(400);
    const editConflictRecord = pageAdmin.locator('li:has-text("past-003") button:has-text("Edit"), tr:has-text("past-003") button:has-text("Edit")').first();
    await editConflictRecord.click();
    await pageAdmin.waitForTimeout(600);

    const localTitle = "Local change attempting stale save";
    await pageAdmin.locator("#rec-field-title-en").fill(localTitle);
    const remotePage = await ctxAdmin.newPage();
    await remotePage.goto(`${baseUrl}/admin/airport?tab=archive`, {waitUntil: "networkidle"});
    // A separate tab creates a native StorageEvent in the still-open editor.
    await remotePage.evaluate(() => {
      const stored = localStorage.getItem("gza.archive.draft.v1");
      if (stored) {
        const parsed = JSON.parse(stored);
        parsed.revision = (parsed.revision || 0) + 1;
        if (parsed.records && parsed.records["past-003"]) {
          parsed.records["past-003"].title.en = "Remote Background Change";
        }
        localStorage.setItem("gza.archive.draft.v1", JSON.stringify(parsed));
      }
    });

    const conflictTitleEn = pageAdmin.locator("#rec-field-title-en");
    await pageAdmin.locator('[role="alert"]:has-text("another session")').waitFor();
    assert.equal(await conflictTitleEn.inputValue(), localTitle, "Remote refresh must retain unsaved input");
    await pageAdmin.getByRole("button", {name: "Keep local edits", exact: true}).click();
    const saveStaleBtn = pageAdmin.locator('button:has-text("Save local draft")').first();
    await saveStaleBtn.click();
    await pageAdmin.waitForTimeout(500);

    const conflictBanner = pageAdmin.locator('[role="alert"]:has-text("External changes"), [role="alert"]:has-text("another session")');
    await conflictBanner.waitFor();
    assert.ok(await conflictBanner.isVisible(), "Conflict banner must be displayed on stale save");

    assert.equal(await conflictTitleEn.inputValue(), localTitle, "Rejected save retains local input");
    const canonicalTitle = await remotePage.evaluate(() => JSON.parse(localStorage.getItem("gza.archive.draft.v1")).records["past-003"].title.en);
    assert.equal(canonicalTitle, "Remote Background Change", "Stale save cannot overwrite newer canonical draft");
    await pageAdmin.getByRole("button", {name: "Reload latest", exact: true}).click();
    assert.equal(await conflictTitleEn.inputValue(), canonicalTitle, "Explicit reload gets actual latest proposal");
    const beforeNoop = await pageAdmin.evaluate(() => [localStorage.getItem("gza.archive.draft.v1"), localStorage.getItem("gza.activity.v1")]);
    await saveStaleBtn.click();
    await pageAdmin.locator('[role="dialog"]').first().waitFor({state: "detached"});
    assert.deepEqual(await pageAdmin.evaluate(() => [localStorage.getItem("gza.archive.draft.v1"), localStorage.getItem("gza.activity.v1")]), beforeNoop, "Identical save performs no write or audit");
    await remotePage.close();
    await pageAdmin.screenshot({
      path: path.join(SCREENSHOTS_DIR, "07-cross-tab-conflict.png"),
      fullPage: false,
    });

    console.log("✔ Check 7 passed: Cross-tab conflict banner displayed");

    // ------------------------------------------------------------------------
    // Check 8: Arabic Mobile 390 Check
    // ------------------------------------------------------------------------
    console.log("Check 8: Arabic Mobile 390 layout and RTL inspection...");
    const ctxAr = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await ctxAr.addInitScript(() => {
      localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
    });
    const pageAr = await ctxAr.newPage();
    pageAr.on("pageerror", (err) => pageErrors.push(err.message));

    await pageAr.goto(`${baseUrl}/ar/admin/airport?tab=archive`, { waitUntil: "networkidle" });
    await pageAr.waitForTimeout(500);

    // Assert RTL dir
    const htmlDir = await pageAr.getAttribute("html", "dir");
    assert.equal(htmlDir, "rtl", "Arabic page must have dir=rtl");

    // Assert no horizontal page overflow
    const arOverflow = await pageAr.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    assert.equal(arOverflow, false, "Arabic mobile page must not have horizontal overflow");

    await pageAr.locator('li:has-text("past-003"), tr:has-text("past-003")').first().getByRole("button", {name: "تعديل السجل", exact: true}).click();
    await pageAr.waitForFunction(() => { const d=document.querySelector('[role="dialog"]'); if(!d)return false; const b=d.getBoundingClientRect(); return b.left>=-1 && b.right<=innerWidth+1 && b.width>300; });
    await pageAr.getByRole("button", {name: "العربية", exact:true}).click();
    await pageAr.locator("#rec-field-title-ar").fill("<b>invalid</b>");
    await pageAr.getByRole("button", {name:"حفظ مسودة محلية", exact:true}).click();
    await pageAr.locator('#rec-field-title-ar[aria-invalid="true"]').waitFor();
    assert.equal(await pageAr.locator("#rec-field-title-ar").evaluate(el=>el===document.activeElement), true, "Invalid Arabic field focused");
    await pageAr.screenshot({
      path: path.join(SCREENSHOTS_DIR, "08-arabic-mobile-390.png"),
      fullPage: false,
    });
    await ctxAr.close();
    console.log("✔ Check 8 passed: Arabic mobile 390 layout verified");

    console.log("Check 9: Citation navigation and corrupt draft isolation...");
    await pageAdmin.goto(`${baseUrl}/admin/airport?tab=sources&item=src-smoke-source`, {waitUntil: "networkidle"});
    const sourceInspection = pageAdmin.getByRole("dialog");
    await sourceInspection.getByRole("button", {name: "Inspect record", exact:true}).first().click();
    await pageAdmin.waitForURL(/tab=archive/);
    await pageAdmin.getByRole("dialog").getByText("past-003", {exact:true}).first().waitFor();
    assert.equal(await pageAdmin.getByRole("dialog").count(), 1, "Citation navigation opens only the target record sheet");
    await pageAdmin.evaluate(() => localStorage.setItem("gza.archive.draft.v1", "{broken"));
    await pageAdmin.goto(`${baseUrl}/admin/airport?tab=archive`, {waitUntil:"networkidle"});
    await pageAdmin.getByRole("alert").filter({hasText:"Draft storage is unavailable"}).waitFor();
    assert.equal(await pageAdmin.getByRole("button", {name:"Edit record", exact:true}).count(), 0);
    assert.equal(await pageAdmin.evaluate(() => localStorage.getItem("gza.archive.draft.v1")), "{broken", "Corrupt raw draft bytes are not repaired");
    await pageAdmin.goto(`${baseUrl}/admin/airport?tab=past`, {waitUntil:"networkidle"});
    await pageAdmin.locator("#past-intro-title-en").fill("Independent CMS remains editable");
    assert.equal(await pageAdmin.getByRole("button", {name:"Save draft", exact:true}).isEnabled(), true, "Independent Phase 7 CMS stays usable");
    await pageAdmin.getByRole("button", {name:"Save draft", exact:true}).click();
    await pageAdmin.getByText("Local draft saved", {exact:true}).waitFor();
    assert.equal(await pageAdmin.evaluate(() => JSON.parse(localStorage.getItem("gza.content.draft.v1")).drafts["airport.past"].intro.title.en), "Independent CMS remains editable");
    console.log("✔ Check 9 passed: Citation navigation and corrupt draft isolation");

    await ctxAdmin.close();
  } finally {
    if (browser) await browser.close();
    await server.stop();
  }

  assert.equal(pageErrors.length, 0, `Browser page errors occurred: ${pageErrors.join(", ")}`);
  console.log("\n==================================================================");
  console.log("All Phase 7B Task 2 Smoke Checks PASSED cleanly!");
  console.log("==================================================================\n");
}

runTask2Smoke().catch((err) => {
  console.error("Task 2 Smoke Test Failed:", err);
  process.exit(1);
});
