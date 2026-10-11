import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpContentRepository } from "../../src/content/http-repository.ts";
import { ContentError } from "../../src/content/repository.ts";
import { publishedHome } from "../../src/content/published/home.ts";
import { createMvpApiClient } from "../../src/lib/api/mvp-client.ts";
import { CmsEditSession } from "../../src/components/admin/cms/edit-session.ts";

const publicDocument = { id: "home", kind: "home", slug: "home", revisionNumber: 1, status: "published", updatedAt: "2026-10-11T00:00:00Z", payload: publishedHome };
const editorial = { ...publicDocument, currentRevision: 3, publishedRevision: 1, draftRevision: null, hasDraft: false, tombstoned: false };
function fixture(data: unknown, status = 200) {
  const calls: { path: string; body: unknown }[] = [];
  const client = createMvpApiClient({ enabled: true, nonProductionOptIn: true, environment: { MODE: "test" }, baseUrl: "https://127.0.0.1:18084",
    fetch: async (input, init) => {
      calls.push({ path: new URL(String(input)).pathname, body: init?.body ? JSON.parse(String(init.body)) : null });
      const requestId = new Headers(init?.headers).get("x-request-id")!;
      const body = status >= 400 ? { success: false, error: { code: "not_found", message: "Not found." }, meta: { requestId, timestamp: "2026-10-11T00:00:00Z" } }
        : { success: true, data, meta: { requestId, timestamp: "2026-10-11T00:00:00Z" } };
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-request-id": requestId } });
    } }, () => ({ getStaffCsrfBootstrap: async () => ({ csrfToken: "S".repeat(43) }), getAuthCsrfBootstrap: async () => ({ csrfToken: "P".repeat(43) }) }));
  return { repository: new HttpContentRepository(() => client), calls };
}
test("public CMS binds document identity and uses only explicit never-published fallback", async () => {
  const published = await fixture(publicDocument).repository.getPublished("home");
  assert.deepEqual(published, publishedHome); assert.notEqual(published, publishedHome);
  assert.deepEqual(await fixture(null, 404).repository.getPublished("home"), publishedHome);
  for (const status of [410, 503]) await assert.rejects(fixture(null, status).repository.getPublished("home"), ContentError);
  for (const data of [{ ...publicDocument, slug: "travel" }, { ...publicDocument, payload: null }, { ...publicDocument, injected: true }])
    await assert.rejects(fixture(data).repository.getPublished("home"), ContentError);
});
test("draft save requires a server revision and honest no-op receipts", async () => {
  const f = fixture({ slug: "home", changed: false, revision: 1, currentRevision: 3, status: "draft" });
  let notified = 0; f.repository.subscribe(() => notified++);
  await assert.rejects(f.repository.saveDraftWithReceipt("home", publishedHome)); assert.equal(f.calls.length, 0);
  const receipt = await f.repository.saveDraftWithReceipt("home", publishedHome, { expectedRevision: 3 });
  assert.equal(receipt.changed, false); assert.equal(notified, 0);
  assert.deepEqual(f.calls[0]?.body, { expectedRevision: 3, payload: publishedHome });
  await assert.rejects(fixture({ slug: "home", changed: false, revision: 2, currentRevision: 4, status: "draft" }).repository.saveDraftWithReceipt("home", publishedHome, { expectedRevision: 3 }));
});
test("discard computes changed from the actual CAS version and checks private DTO coherence", async () => {
  const f = fixture(editorial);
  assert.equal((await f.repository.discardDraftWithReceipt("home", { expectedRevision: 3 })).changed, false);
  assert.equal((await fixture({ ...editorial, currentRevision: 4 }).repository.discardDraftWithReceipt("home", { expectedRevision: 3 })).changed, true);
  await assert.rejects(fixture({ ...editorial, hasDraft: true, draftRevision: 2, payload: null }).repository.getEditorial("home"));
  await assert.rejects(f.repository.transition("home", "restore", 3, 0));
});
test("dirty editor retains its original CAS version until explicit remote reload", () => {
  const editor = new CmsEditSession({ title: "compiled" });
  editor.adoptRemote(null, editor.beginRead(), false, 2, { title: "published" });
  editor.update({ title: "unsaved" });
  editor.adoptRemote(null, editor.beginRead(), false, 3, { title: "other browser" });
  assert.equal(editor.conflict, true); assert.equal(editor.revision, 2); assert.equal(editor.draft.title, "unsaved");
  assert.equal(editor.beginCommand().expectedRevision, 2); editor.busy = false;
  editor.adoptRemote(null, editor.beginRead(), true, 3, { title: "other browser" });
  assert.equal(editor.revision, 3); assert.equal(editor.draft.title, "other browser"); assert.equal(editor.dirty, false);
});
