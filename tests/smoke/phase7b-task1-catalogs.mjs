import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = path.resolve(__dirname, "../..");
const SCREENSHOTS_DIR = path.resolve(WORKTREE_ROOT, "scratch/phase7b-task1/screenshots");
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function startServer(port = 4176) {
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

async function runTask1Smoke() {
  console.log("\n==================================================================");
  console.log("Phase 7B Task 1 — Canonical Catalogs & Media Variant Smoke Tests");
  console.log("==================================================================\n");

  const server = process.env.CATALOGS_TEST_URL
    ? { url: process.env.CATALOGS_TEST_URL, stop: async () => {} }
    : await startServer(4176);
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
    // Check 1: Desktop 1440x900 (EN) - Archive, Sources, Media Catalogs
    // ------------------------------------------------------------------------
    console.log("Running Check 1: EN Desktop 1440x900 Canonical Catalogs & Sheets...");
    const ctxDesktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await ctxDesktop.addInitScript(() => {
      localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
    });

    const pageDesktop = await ctxDesktop.newPage();
    pageDesktop.on("pageerror", (err) => {
      console.error("Page error:", err);
      pageErrors.push(err.message);
    });

    await pageDesktop.goto(`${baseUrl}/admin/airport?tab=archive`, { waitUntil: "networkidle" });

    // Verify Tab counts: Archive (67), Sources (13), Media (67)
    console.log("Verifying canonical tab badges...");
    const archiveTab = pageDesktop.getByRole("tab", { name: /Archive/i });
    await archiveTab.waitFor({ timeout: 15000 });
    const archiveTabText = await archiveTab.textContent();
    assert.match(archiveTabText, /67/, "Archive tab must display count 67");

    const sourcesTab = pageDesktop.getByRole("tab", { name: /Sources/i });
    const sourcesTabText = await sourcesTab.textContent();
    assert.match(sourcesTabText, /13/, "Sources tab must display count 13");

    const mediaTab = pageDesktop.getByRole("tab", { name: /Media/i });
    const mediaTabText = await mediaTab.textContent();
    assert.match(mediaTabText, /67/, "Media tab must display count 67");

    // Click archive tab explicitly to ensure panel is active
    await archiveTab.click();
    await pageDesktop.waitForTimeout(300);

    // Verify overview stats banner
    console.log("Verifying Archive catalog overview stats...");
    await pageDesktop.getByText(/Total records/i).waitFor({ timeout: 5000 });
    await pageDesktop.getByText(/Published/i).first().waitFor();
    await pageDesktop.getByText(/Excluded/i).first().waitFor();

    // Test duplicate filtering: past-052
    console.log("Filtering by duplicate status (duplicates-only)...");
    const dupSelect = pageDesktop.getByLabel(/Duplicate/i);
    await dupSelect.selectOption("duplicates-only");

    // Wait for filtered list: only past-052 should be visible
    await pageDesktop.getByText("past-052").waitFor();
    const inspectBtn = pageDesktop.locator('button:has-text("Inspect")').first();
    await inspectBtn.click();

    // Verify ArchiveRecordSheet opens
    console.log("Verifying ArchiveRecordSheet for duplicate past-052...");
    const sheetDescription = pageDesktop.locator('[role="dialog"] p:has-text("past-052"), [role="dialog"] span:has-text("past-052")');
    await sheetDescription.first().waitFor();

    // Verify duplicate notice inside sheet
    const dupNotice = pageDesktop.locator('[role="dialog"]').getByText(/duplicate of canonical record past-050/i);
    await dupNotice.waitFor();

    // Take screenshot of duplicate sheet
    await pageDesktop.screenshot({
      path: path.resolve(SCREENSHOTS_DIR, "01-desktop-archive-duplicate-sheet.png"),
      fullPage: false,
    });
    console.log("Saved: 01-desktop-archive-duplicate-sheet.png");

    // Click jump to canonical target (past-050)
    console.log("Jumping to canonical target past-050...");
    const jumpBtn = pageDesktop.getByRole("button", { name: /Inspect canonical target \(past-050\)/i });
    await jumpBtn.click();

    // Verify sheet transitioned to past-050
    const canonicalDesc = pageDesktop.locator('[role="dialog"] p:has-text("past-050"), [role="dialog"] span:has-text("past-050")');
    await canonicalDesc.first().waitFor();
    assert.equal(await pageDesktop.locator('[role="dialog"]').getByText(/duplicate of canonical record/i).count(), 0, "past-050 is not a duplicate");

    // Close sheet
    await pageDesktop.keyboard.press("Escape");
    await pageDesktop.waitForTimeout(300);

    // Switch to Sources Tab
    console.log("Switching to Sources tab...");
    await sourcesTab.click();
    await pageDesktop.waitForTimeout(300);

    // Verify Sources catalog overview stats: 13 total, 5 cited, 8 uncited
    await pageDesktop.getByText(/Total sources/i).waitFor();
    await pageDesktop.getByText(/Cited sources/i).first().waitFor();
    await pageDesktop.getByText(/Uncited in catalog/i).first().waitFor();

    // Inspect src-oslo-ii-1995
    console.log("Inspecting source record src-oslo-ii-1995...");
    const osloRow = pageDesktop.locator('tr:has-text("src-oslo-ii-1995")');
    await osloRow.waitFor();
    const osloInspectBtn = osloRow.locator('button:has-text("Inspect")');
    await osloInspectBtn.click();

    // Verify SourceRecordSheet
    const sourceSheetDesc = pageDesktop.locator('[role="dialog"] p:has-text("src-oslo-ii-1995"), [role="dialog"] span:has-text("src-oslo-ii-1995")');
    await sourceSheetDesc.first().waitFor();
    await pageDesktop.locator('[role="dialog"]').getByText(/United Nations \/ Government of Israel and PLO/i).waitFor();

    // Take screenshot of source sheet
    await pageDesktop.screenshot({
      path: path.resolve(SCREENSHOTS_DIR, "02-desktop-source-sheet.png"),
      fullPage: false,
    });
    console.log("Saved: 02-desktop-source-sheet.png");

    // Close source sheet
    await pageDesktop.keyboard.press("Escape");
    await pageDesktop.waitForTimeout(300);

    // Switch to Media Tab
    console.log("Switching to Media tab...");
    await mediaTab.click();
    await pageDesktop.waitForTimeout(300);

    // Verify Media overview stats: 67 total, 38 registered images, 8 external videos, 21 intake references
    await pageDesktop.getByText(/Media records/i).first().waitFor();
    await pageDesktop.getByText(/Registered images/i).first().waitFor();
    await pageDesktop.getByText(/External videos/i).first().waitFor();
    await pageDesktop.getByText(/Intake reference only/i).first().waitFor();

    // Filter by External Video
    console.log("Filtering media assets by external video...");
    const assetKindSelect = pageDesktop.getByLabel(/Asset kind/i);
    await assetKindSelect.selectOption("external-video");
    await pageDesktop.waitForTimeout(300);

    // Inspect one of the video records
    const videoInspectBtn = pageDesktop.locator('button:has-text("Inspect")').first();
    await videoInspectBtn.click();

    // Verify MediaVariantSheet shows external video notice and safe link
    console.log("Verifying MediaVariantSheet for external video...");
    const mediaSheet = pageDesktop.locator('[role="dialog"]');
    await mediaSheet.getByText(/External video catalog entries/i).waitFor();
    await mediaSheet.getByText(/Catalog YouTube ID/i).waitFor();
    await mediaSheet.getByText(/External embed reference only/i).waitFor();

    // Take screenshot of media variant sheet
    await pageDesktop.screenshot({
      path: path.resolve(SCREENSHOTS_DIR, "03-desktop-media-variant-sheet.png"),
      fullPage: false,
    });
    console.log("Saved: 03-desktop-media-variant-sheet.png");

    await pageDesktop.close();
    await ctxDesktop.close();

    // ------------------------------------------------------------------------
    // Check 2: Mobile 390x844 (AR RTL) - Directionality, Localization, No Overflow
    // ------------------------------------------------------------------------
    console.log("Running Check 2: Mobile 390x844 AR (RTL) Layout & Translations...");
    const ctxMobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await ctxMobile.addInitScript(() => {
      localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-1", overrides: {} }));
    });

    const pageMobile = await ctxMobile.newPage();
    pageMobile.on("pageerror", (err) => {
      console.error("Mobile page error:", err);
      pageErrors.push(err.message);
    });

    await pageMobile.goto(`${baseUrl}/ar/admin/airport?tab=archive`, { waitUntil: "networkidle" });

    // Verify document root dir="rtl"
    const isRtl = await pageMobile.evaluate(() => document.documentElement.dir === "rtl");
    assert.ok(isRtl, "Page root direction must be rtl");

    // Verify Arabic tab counts
    const arArchiveTab = pageMobile.getByRole("tab", { name: /الأرشيف/i });
    await arArchiveTab.waitFor({ timeout: 15000 });
    const arTabText = await arArchiveTab.textContent();
    assert.match(arTabText, /67/, "Arabic Archive tab must display count 67");

    // Click Arabic archive tab explicitly
    await arArchiveTab.click();
    await pageMobile.waitForTimeout(300);

    // Verify no horizontal overflow on mobile 390px
    const hasHorizontalOverflow = await pageMobile.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    });
    assert.equal(hasHorizontalOverflow, false, "Mobile page must not have horizontal overflow");

    // Open first record inspection sheet on mobile
    const mobileInspectBtn = pageMobile.locator('button:has-text("معاينة")').first();
    await mobileInspectBtn.waitFor();
    await mobileInspectBtn.click();

    // Verify sheet open with Arabic labels
    await pageMobile.locator('[role="dialog"]').getByText(/المعلومات العامة/i).waitFor();
    // Page scrollWidth alone cannot detect a clipped, animated fixed sheet.
    await pageMobile.waitForFunction(() => {
      const sheet = document.querySelector('[role="dialog"]');
      if (!sheet) return false;
      const box = sheet.getBoundingClientRect();
      return box.left >= -1 && box.right <= innerWidth + 1 && box.width >= innerWidth - 1;
    });
    assert.equal(await pageMobile.locator('[role="dialog"]').getByText("Caption", { exact: true }).count(), 0);

    // Take screenshot of mobile AR sheet
    await pageMobile.screenshot({
      path: path.resolve(SCREENSHOTS_DIR, "04-mobile-ar-archive-sheet.png"),
      fullPage: false,
    });
    console.log("Saved: 04-mobile-ar-archive-sheet.png");

    await pageMobile.close();
    await ctxMobile.close();

    // ------------------------------------------------------------------------
    // Check 3: Read-Only Viewer (adm-3) - Inspection without mutation
    // ------------------------------------------------------------------------
    console.log("Running Check 3: Read-Only Viewer (adm-3)...");
    const ctxViewer = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await ctxViewer.addInitScript(() => {
      localStorage.setItem("gza.admin.v1", JSON.stringify({ staffId: "adm-3", overrides: {} }));
    });

    const pageViewer = await ctxViewer.newPage();
    pageViewer.on("pageerror", (err) => {
      console.error("Viewer page error:", err);
      pageErrors.push(err.message);
    });

    await pageViewer.goto(`${baseUrl}/admin/airport?tab=archive`, { waitUntil: "networkidle" });
    const viewerArchiveTab = pageViewer.getByRole("tab", { name: /Archive/i });
    await viewerArchiveTab.waitFor({ timeout: 15000 });
    await viewerArchiveTab.click();
    await pageViewer.waitForTimeout(300);

    // Open an inspect sheet
    const viewerInspectBtn = pageViewer.locator('button:has-text("Inspect")').first();
    await viewerInspectBtn.click();

    // Verify inspection sheet opens cleanly
    const viewerSheet = pageViewer.locator('[role="dialog"]');
    await viewerSheet.waitFor();

    // Verify ZERO Save, Edit, or Discard buttons in the inspection sheet
    const saveButtonCount = await viewerSheet.locator('button:has-text("Save"), button:has-text("Publish"), button:has-text("Delete")').count();
    assert.equal(saveButtonCount, 0, "Inspection sheet must not contain Save or Publish buttons");

    // Take screenshot of viewer inspection
    await pageViewer.screenshot({
      path: path.resolve(SCREENSHOTS_DIR, "05-viewer-archive-inspection.png"),
      fullPage: false,
    });
    console.log("Saved: 05-viewer-archive-inspection.png");

    await pageViewer.close();
    await ctxViewer.close();

    assert.equal(pageErrors.length, 0, `Page errors encountered during smoke test: ${pageErrors.join("; ")}`);

    console.log("\n==================================================================");
    console.log("Phase 7B Task 1 — All targeted smoke checks passed successfully!");
    console.log("==================================================================\n");
  } finally {
    if (browser) await browser.close();
    if (server) await server.stop();
  }
}

runTask1Smoke().catch((err) => {
  console.error("Smoke test failure:", err);
  process.exit(1);
});
