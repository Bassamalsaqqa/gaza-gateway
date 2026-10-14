import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";
import { getGalleryItems } from "../../src/lib/archive/catalog.ts";
import { buildDefaultGalleryConfiguration } from "../../src/lib/archive/gallery-publication.ts";

/**
 * Gallery Publication & Parent Admin Guard UI Transport Suite
 *
 * Exercises the actual frontend React tree on Vite DEV to verify:
 * 1. Manual "Gallery Publication" tab selection persists without resetting to default "past".
 * 2. Editing display title marks dirty without triggering GET per keystroke.
 * 3. beforeunload event is guarded with defaultPrevented: false when clean, true when dirty.
 * 4. Tab switch Cancel/Escape keeps edits; Confirm ("Discard and switch") discards and switches tab.
 * 5. Sidebar navigation Cancel/Escape keeps edits and returns focus; Confirm ("Discard and leave") actually executes.
 * 6. Explicit Reload Cancel ("Keep local edits") keeps changes; Confirm ("Reload remote draft") reloads remote state.
 * 7. Actual HTTP 500 and 409 preserve local draft and retain dirty flag.
 * 8. Exact expectedRevision sent before save; no trailing GET after successful PUT ack.
 * 9. Busy save with controlled unresolved promise asserts confirm button is DISABLED, then releases promise, waits clean, and closes with Cancel.
 * 10. Concurrently higher remote revision does not silently rebase or wipe working edits.
 *
 * Runs across both English (LTR) and Arabic (RTL).
 */

const BASE_URL = process.env.BASE_URL ?? process.env.TEST_URL ?? "http://127.0.0.1:5191";
const output = "scratch/gallery-edit-guard-ui-evidence";
fs.mkdirSync(output, { recursive: true });


const csrf = "B".repeat(42) + "A";
const staffId = "11111111-1111-4111-8111-111111111111";

const permissions = [
  "dashboard.view",
  "admin.manage",
  "commercial.view",
  "ops.view",
  "content.view",
  "content.edit",
];

const compiledCatalog = getGalleryItems();
const defaultCfg = buildDefaultGalleryConfiguration(compiledCatalog);

const browser = await chromium.launch({ channel: "msedge", headless: true });
const checks = [];
let activePage = null;

function writeReceipt(passed, error = null) {
  fs.writeFileSync(
    `${output}/receipt.json`,
    JSON.stringify(
      {
        passed,
        totalChecks: checks.length,
        checks,
        ...(error ? { failedCheck: error.message, errorStack: error.stack } : {}),
        timestamp: new Date().toISOString(),
        transport: "Synthetic transport tests the actual React UI; real MySQL authority is tested separately",
      },
      null,
      2,
    ) + "\n",
  );
}

try {
  for (const locale of ["", "/ar"]) {
    const isAr = locale === "/ar";
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      timezoneId: "Asia/Gaza",
    });

    let currentServerRevision = 1;
    let editorialDoc = {
      id: "gallery",
      kind: "gallery",
      slug: "default",
      revisionNumber: currentServerRevision,
      currentRevision: currentServerRevision,
      publishedRevision: 1,
      draftRevision: currentServerRevision,
      status: "published",
      hasDraft: false,
      tombstoned: false,
      updatedAt: "2026-10-14T12:00:00Z",
      payload: defaultCfg,
    };

    let editorialGetCount = 0;
    let failWith409 = false;
    let failWith500 = false;
    let pendingSavePromise = null;
    const writeRequests = [];

    await context.route("**/api/v1/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace(/^\/api\/v1/, "");
      const headers = {
        "Access-Control-Allow-Origin": BASE_URL,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Expose-Headers": "X-Request-Id",
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Accept, Content-Type, X-Request-Id, X-CSRF-TOKEN",
      };

      if (request.method() === "OPTIONS") {
        return route.fulfill({ status: 204, headers });
      }

      const requestId = request.headers()["x-request-id"] ?? crypto.randomUUID();
      headers["X-Request-Id"] = requestId;
      const meta = { requestId, timestamp: new Date().toISOString() };

      if (path === "/staff/csrf") {
        return route.fulfill({
          status: 200,
          headers,
          contentType: "application/json",
          body: JSON.stringify({ csrfToken: csrf }),
        });
      }

      if (path === "/staff/me") {
        return route.fulfill({
          status: 200,
          headers,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              id: staffId,
              username: "owner",
              email: "staff@example.invalid",
              fullNameEn: "Synthetic Owner",
              fullNameAr: "مالك تجريبي",
              role: "admin",
              permissions,
              mfaEnabled: false,
            },
            meta,
          }),
        });
      }

      if (path === "/gallery/editorial" && request.method() === "GET") {
        editorialGetCount++;
        return route.fulfill({
          status: 200,
          headers,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: editorialDoc,
            meta,
          }),
        });
      }

      if (path === "/gallery/editorial/draft" && request.method() === "PUT") {
        const body = request.postDataJSON();
        writeRequests.push({ path, body, expectedRevision: body.expectedRevision });

        if (pendingSavePromise) {
          await pendingSavePromise;
        }

        if (failWith500) {
          return route.fulfill({
            status: 500,
            headers,
            contentType: "application/json",
            body: JSON.stringify({
              success: false,
              error: {
                code: "server_error",
                message: "Internal server error occurred.",
              },
              meta,
            }),
          });
        }

        if (failWith409) {
          return route.fulfill({
            status: 409,
            headers,
            contentType: "application/json",
            body: JSON.stringify({
              success: false,
              error: {
                code: "conflict",
                message: "Revision conflict: remote document advanced by another session.",
              },
              meta,
            }),
          });
        }

        currentServerRevision += 1;
        editorialDoc = {
          ...editorialDoc,
          revisionNumber: currentServerRevision,
          currentRevision: currentServerRevision,
          draftRevision: currentServerRevision,
          hasDraft: true,
          status: "draft",
          payload: body.payload,
        };

        const receipt = {
          slug: "default",
          changed: true,
          revision: currentServerRevision,
          currentRevision: currentServerRevision,
          status: "draft",
        };

        return route.fulfill({
          status: 200,
          headers,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: receipt,
            meta,
          }),
        });
      }

      if (path === "/gallery/editorial/discard" && request.method() === "POST") {
        currentServerRevision += 1;
        editorialDoc = {
          ...editorialDoc,
          revisionNumber: currentServerRevision,
          currentRevision: currentServerRevision,
          draftRevision: null,
          hasDraft: false,
          status: "published",
          payload: defaultCfg,
        };
        return route.fulfill({
          status: 200,
          headers,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: editorialDoc,
            meta,
          }),
        });
      }

      if (path.startsWith("/admin/activity") && request.method() === "GET") {
        return route.fulfill({
          status: 200,
          headers,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: { items: [], total: 0, page: 1, limit: 25 },
            meta,
          }),
        });
      }

      // Valid 404 envelope for unused/unmatched endpoints (not 200 {})
      return route.fulfill({
        status: 404,
        headers,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: {
            code: "not_found",
            message: `Endpoint ${request.method()} ${path} not found.`,
          },
          meta,
        }),
      });
    });

    const page = await context.newPage();
    activePage = page;
    page.setDefaultNavigationTimeout(45000);
    page.setDefaultTimeout(15000);

    const isBeforeUnloadPrevented = async () => {
      return page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      });
    };

    const nav = (subpath) =>
      page.goto(`${BASE_URL}${locale}${subpath}`, { waitUntil: "domcontentloaded" });

    // 1. Initial navigation to Airport admin
    await nav("/admin/airport");
    await page.waitForLoadState("networkidle");

    // Clean state beforeunload assertion (event.defaultPrevented only)
    assert.equal(
      await isBeforeUnloadPrevented(),
      false,
      `${locale} clean state beforeunload is not defaultPrevented`,
    );
    checks.push(`${locale} clean beforeunload is false`);

    // Click Gallery Tab using actual component label
    const galleryTab = page.getByRole("tab", {
      name: isAr ? "نشر المعرض" : "Gallery Publication",
    });
    await galleryTab.waitFor({ state: "visible" });
    await galleryTab.click();

    // Verify Gallery panel is displayed
    const galleryPanelHeader = page.getByText(
      isAr ? "إدارة نشر المعرض التوثيقي" : "Archive Gallery Publication",
    );
    await galleryPanelHeader.waitFor({ state: "visible" });

    // Assert manual tab persists across renders without reverting to default "past"
    await page.waitForTimeout(400);
    assert.ok(
      await galleryPanelHeader.isVisible(),
      `${locale} Manual Gallery tab did not revert to past`,
    );
    checks.push(`${locale} manual Gallery tab persists`);

    // 2. Assert title edit marks dirty without triggering GET per keystroke
    const initialGetCount = editorialGetCount;
    const titleInput = page.getByRole("textbox", {
      name: isAr ? "العنوان rec-present-ruins-2008" : "Display title rec-present-ruins-2008",
    });
    await titleInput.waitFor({ state: "visible" });

    await titleInput.fill("Edited Runway Heading 1998");
    await page.waitForTimeout(200);

    const unsavedChip = page.getByText(isAr ? "تغييرات غير محفوظة" : "Unsaved Changes", { exact: true });
    await unsavedChip.waitFor({ state: "visible" });
    assert.equal(
      editorialGetCount,
      initialGetCount,
      `${locale} GET request was not repeated on input typing`,
    );
    checks.push(`${locale} editing title marks dirty without GET keystroke repetition`);

    // Dirty state beforeunload assertion (event.defaultPrevented only)
    assert.equal(
      await isBeforeUnloadPrevented(),
      true,
      `${locale} dirty state beforeunload is defaultPrevented`,
    );
    checks.push(`${locale} dirty beforeunload is true`);

    // 3. Tab switch Escape, Cancel, and Confirm
    const pastTab = page.getByRole("tab", { name: isAr ? "الماضي" : "Past" });
    await pastTab.click();

    // Tab switch dialog appears (role alertdialog)
    const tabDialog = page.getByRole("alertdialog");
    await tabDialog.waitFor({ state: "visible" });

    // Test Escape dismissal
    await page.keyboard.press("Escape");
    await tabDialog.waitFor({ state: "hidden" });
    assert.ok(await galleryPanelHeader.isVisible(), `${locale} Tab switch Escape remained on Gallery`);
    assert.equal(await titleInput.inputValue(), "Edited Runway Heading 1998");
    checks.push(`${locale} tab switch Escape keeps local edits`);

    // Click Past tab again and test Cancel button
    await pastTab.click();
    await tabDialog.waitFor({ state: "visible" });
    const tabCancelBtn = tabDialog.getByRole("button", { name: isAr ? "إلغاء" : "Cancel" });
    await tabCancelBtn.click();
    await tabDialog.waitFor({ state: "hidden" });
    assert.ok(await galleryPanelHeader.isVisible(), `${locale} Tab switch Cancel remained on Gallery`);
    assert.equal(await titleInput.inputValue(), "Edited Runway Heading 1998");
    checks.push(`${locale} tab switch Cancel keeps local edits`);

    // Click Past tab again and confirm discard ("Discard and switch" / "تجاهل والتبديل")
    await pastTab.click();
    await tabDialog.waitFor({ state: "visible" });
    const tabConfirmBtn = tabDialog.getByRole("button", {
      name: isAr ? "تجاهل والتبديل" : "Discard and switch",
    });
    await tabConfirmBtn.click();
    await tabDialog.waitFor({ state: "hidden" });

    // Assert navigated to Past tab
    assert.ok(
      await page.getByRole("tab", { name: isAr ? "الماضي" : "Past", selected: true }).isVisible(),
      `${locale} Confirmed tab switch navigated to Past`,
    );
    checks.push(`${locale} tab switch Confirm discards and switches tab`);

    // 4. Return to Gallery tab for sidebar navigation test
    await galleryTab.click();
    await galleryPanelHeader.waitFor({ state: "visible" });
    await titleInput.fill("Edited Runway Second Draft");
    await unsavedChip.waitFor({ state: "visible" });

    // Sidebar navigation blocker modal (href: locale + '/admin/activity')
    const sidebarLink = page.locator(`a[href="${locale}/admin/activity"]`).first();
    await sidebarLink.focus();
    await page.keyboard.press("Enter");

    // Route navigation blocker appears (role alertdialog)
    const routeDialog = page.getByRole("alertdialog");
    await routeDialog.waitFor({ state: "visible" });

    // Test Escape dismissal and focus return
    await page.keyboard.press("Escape");
    await routeDialog.waitFor({ state: "hidden" });
    const afterEscapeActive = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      href: document.activeElement?.getAttribute("href"),
    }));
    assert.ok(
      afterEscapeActive.href === `${locale}/admin/activity`,
      `${locale} Escape returned focus to the initiating sidebar link`,
    );
    assert.ok(await galleryPanelHeader.isVisible(), `${locale} Sidebar Escape remained on Gallery`);
    assert.equal(await titleInput.inputValue(), "Edited Runway Second Draft");
    checks.push(`${locale} sidebar navigation modal Escape and focus return`);

    // Click sidebar link again and test Cancel
    await sidebarLink.click();
    await routeDialog.waitFor({ state: "visible" });
    const routeCancelBtn = routeDialog.getByRole("button", { name: isAr ? "إلغاء" : "Cancel" });
    await routeCancelBtn.click();
    await routeDialog.waitFor({ state: "hidden" });
    assert.ok(await galleryPanelHeader.isVisible(), `${locale} Sidebar Cancel remained on Gallery`);
    assert.equal(await titleInput.inputValue(), "Edited Runway Second Draft");
    checks.push(`${locale} sidebar navigation Cancel keeps local edits`);

    // Click sidebar link again and confirm leave ("Discard and leave" / "تجاهل والمغادرة")
    await sidebarLink.click();
    await routeDialog.waitFor({ state: "visible" });
    const routeConfirmBtn = routeDialog.getByRole("button", {
      name: isAr ? "تجاهل والمغادرة" : "Discard and leave",
    });
    await routeConfirmBtn.click();

    // Route confirmation ACTUALLY EXECUTES
    await page.waitForURL(`**${locale}/admin/activity*`);
    assert.ok(
      page.url().includes("/admin/activity"),
      `${locale} Route confirmation actually executed navigation to /admin/activity`,
    );
    checks.push(`${locale} route confirmation actually executes`);

    // 5. Navigate back to Airport admin Gallery tab
    await nav("/admin/airport");
    await galleryTab.click();
    await galleryPanelHeader.waitFor({ state: "visible" });
    await titleInput.fill("Edited Runway Reload Test");
    await unsavedChip.waitFor({ state: "visible" });

    // 6. Reload Cancel ("Keep local edits") & Confirm ("Reload remote draft")
    const reloadBtn = page
      .getByRole("button", { name: isAr ? "إعادة تحميل" : "Reload" })
      .or(page.getByRole("button", { name: isAr ? "تحديث" : "Refresh" }))
      .or(page.locator('button[title="Refresh"], button[title="تحديث"]'))
      .first();
    await reloadBtn.click();

    const reloadDialog = page.getByRole("alertdialog");
    await reloadDialog.waitFor({ state: "visible" });

    const keepEditsBtn = reloadDialog.getByRole("button", {
      name: isAr ? "الاحتفاظ بالتعديلات المحلية" : "Keep local edits",
    });
    await keepEditsBtn.click();
    await reloadDialog.waitFor({ state: "hidden" });
    assert.equal(await titleInput.inputValue(), "Edited Runway Reload Test");
    checks.push(`${locale} reload confirmation Keep local edits preserves changes`);

    await reloadBtn.click();
    await reloadDialog.waitFor({ state: "visible" });
    const reloadRemoteBtn = reloadDialog.getByRole("button", {
      name: isAr ? "إعادة تحميل المسودة الخارجية" : "Reload remote draft",
    });
    await reloadRemoteBtn.click();
    await reloadDialog.waitFor({ state: "hidden" });

    // Edits reverted to baseline and dirty flag cleared
    await unsavedChip.waitFor({ state: "hidden" });
    assert.notEqual(await titleInput.inputValue(), "Edited Runway Reload Test");
    assert.equal(
      await isBeforeUnloadPrevented(),
      false,
      `${locale} beforeunload is clean after reload remote draft`,
    );
    checks.push(`${locale} reload confirmation Confirm reloads remote draft and clears guard`);

    // 7. Actual 500 error preserves local draft and dirty guard
    await titleInput.fill("Edits for 500 Test");
    await unsavedChip.waitFor({ state: "visible" });
    failWith500 = true;

    const saveDraftBtn = page.getByRole("button", { name: isAr ? "حفظ المسودة" : "Save Draft" });
    const failedSave = page.waitForResponse(r => r.url().endsWith("/gallery/editorial/draft") && r.status() === 500);
    await saveDraftBtn.click();
    await failedSave;
    await page.waitForFunction(() => !document.querySelector('input[aria-label*="rec-present-ruins-2008"]')?.disabled);

    assert.equal(await titleInput.inputValue(), "Edits for 500 Test");
    assert.ok(await unsavedChip.isVisible(), `${locale} dirty chip remains on 500`);
    failWith500 = false;
    checks.push(`${locale} actual 500 error preserves local edits and dirty guard`);

    // 8. Actual 409 conflict preserves local draft and dirty guard
    await titleInput.fill("Edits for 409 Test");
    await unsavedChip.waitFor({ state: "visible" });
    failWith409 = true;

    await saveDraftBtn.click();

    // 409 conflict alert appears with actual Reload button inside
    const conflictAlert = page.getByRole("alert").filter({
      hasText: isAr ? "تم تحديث بيانات المعرض" : "Gallery publication was modified",
    });
    await conflictAlert.waitFor({ state: "visible" });
    const conflictReloadBtn = conflictAlert.getByRole("button", {
      name: isAr ? "إعادة تحميل" : "Reload",
    });
    assert.ok(await conflictReloadBtn.isVisible(), `${locale} conflict banner shows actual Reload button`);

    assert.equal(await titleInput.inputValue(), "Edits for 409 Test");
    assert.ok(await unsavedChip.isVisible(), `${locale} dirty chip remains on 409`);
    failWith409 = false;
    checks.push(`${locale} actual 409 conflict preserves local edits and dirty guard`);

    // 9. Successful save: exact expectedRevision and assert no GET on keystroke or after PUT ack
    const preSaveGetCount = editorialGetCount;
    const revBeforeSave = currentServerRevision;
    await titleInput.fill("Final Approved Title 2026");

    assert.equal(
      editorialGetCount,
      preSaveGetCount,
      `${locale} no GET request triggered during typing`,
    );
    checks.push(`${locale} no GET on keystroke`);

    await saveDraftBtn.click();
    await page.getByText(isAr ? "تم حفظ المسودة بنجاح" : "Draft saved successfully").waitFor();
    await unsavedChip.waitFor({ state: "hidden" });

    assert.equal(
      editorialGetCount,
      preSaveGetCount,
      `${locale} no trailing GET request after PUT ack`,
    );
    checks.push(`${locale} no GET after PUT ack`);

    const lastWrite = writeRequests[writeRequests.length - 1];
    assert.equal(
      lastWrite.expectedRevision,
      revBeforeSave,
      `${locale} exact expectedRevision sent before save`,
    );
    checks.push(`${locale} exact expectedRevision in save payload`);

    // Tab switch now proceeds without prompt
    await pastTab.click();
    assert.ok(
      await page.getByRole("tab", { name: isAr ? "الماضي" : "Past", selected: true }).isVisible(),
      `${locale} Clean state allows unprompted tab switch`,
    );
    checks.push(`${locale} save success clears guard and enables unprompted tab switch`);

    // 10. Return to Gallery for Busy save controlled unresolved promise test
    await galleryTab.click();
    await galleryPanelHeader.waitFor({ state: "visible" });
    await titleInput.fill("Controlled Busy Draft");
    await unsavedChip.waitFor({ state: "visible" });

    let releaseSavePromise = null;
    pendingSavePromise = new Promise((resolve) => {
      releaseSavePromise = resolve;
    });

    // Start save Draft; PUT request enters route handler and awaits release
    const putEntered = page.waitForRequest(r => r.method() === "PUT" && r.url().endsWith("/gallery/editorial/draft"));
    const saveInFlightPromise = saveDraftBtn.click();
    await putEntered;

    // Attempt route navigation while save is in flight (busy)
    await sidebarLink.click();
    const busyDialog = page.getByRole("alertdialog");
    await busyDialog.waitFor({ state: "visible" });

    // Assert confirm button is DISABLED while save is busy
    const busyConfirmBtn = busyDialog.getByRole("button", {
      name: isAr ? "تجاهل والمغادرة" : "Discard and leave",
    });
    assert.ok(
      await busyConfirmBtn.isDisabled(),
      `${locale} route confirm button is DISABLED while save is busy`,
    );
    checks.push(`${locale} confirm button disabled during busy save`);

    // Release the controlled save promise
    releaseSavePromise();
    pendingSavePromise = null;
    await saveInFlightPromise;

    // Close modal with Cancel and wait clean
    const busyCancelBtn = busyDialog.getByRole("button", {
      name: isAr ? "إلغاء" : "Cancel",
    });
    await busyCancelBtn.click();
    await busyDialog.waitFor({ state: "hidden" });
    await unsavedChip.waitFor({ state: "hidden" });
    checks.push(`${locale} busy save resolved cleanly and modal closed with Cancel`);

    // 11. Concurrent remote higher revision does not silently rebase working edits
    editorialDoc = {
      ...editorialDoc,
      currentRevision: currentServerRevision + 5,
    };
    await titleInput.fill("My Local Unsaved Work");
    await unsavedChip.waitFor({ state: "visible" });

    await reloadBtn.click();
    const concurrentDialog = page.getByRole("alertdialog");
    await concurrentDialog.waitFor({ state: "visible" });
    const keepConcurrentEditsBtn = concurrentDialog.getByRole("button", {
      name: isAr ? "الاحتفاظ بالتعديلات المحلية" : "Keep local edits",
    });
    await keepConcurrentEditsBtn.click();
    await concurrentDialog.waitFor({ state: "hidden" });

    assert.equal(await titleInput.inputValue(), "My Local Unsaved Work");
    const acknowledgedRevision = currentServerRevision;
    failWith409 = true;
    const conflictResponse = page.waitForResponse(r => r.url().endsWith("/gallery/editorial/draft") && r.status() === 409);
    await saveDraftBtn.click();
    await conflictResponse;
    await conflictAlert.waitFor({ state: "visible" });
    assert.equal(writeRequests.at(-1).expectedRevision, acknowledgedRevision, "CAS stays at acknowledged revision");
    assert.equal(await titleInput.inputValue(), "My Local Unsaved Work");
    assert.ok(await unsavedChip.isVisible());

    checks.push(`${locale} higher remote revision does not silently rebase working edits`);

    await page.screenshot({
      path: `${output}/${isAr ? "ar" : "en"}-gallery-guard-complete.png`,
      fullPage: true,
    });

    await context.close();
    activePage = null;
  }

  writeReceipt(true);
  console.log(`PASS ${checks.length} focused EN/AR gallery guard browser checks.`);
} catch (error) {
  writeReceipt(false, error);
  if (activePage) {
    try {
      fs.writeFileSync(`${output}/failure-body.txt`, await activePage.locator("body").innerText());
      await activePage.screenshot({ path: `${output}/failure.png`, fullPage: true });
    } catch {
      // Ignore secondary screenshot error
    }
  }
  throw error;
} finally {
  await browser.close();
}
