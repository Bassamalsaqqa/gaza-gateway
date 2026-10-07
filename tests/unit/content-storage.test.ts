import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONTENT_DRAFT_KEY, ContentError, LocalContentRepository } from "../../src/content/repository.ts";
import { publishedTravel } from "../../src/content/published/travel.ts";
import { publishedHome } from "../../src/content/published/home.ts";

class StorageDouble implements Storage {
  data = new Map<string, string>(); writes = 0; failWrite = false; failRead = false;
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { if (this.failRead) throw new Error("denied"); return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) {
    if (this.failWrite) throw new Error("quota");
    this.writes += 1; this.data.set(key, value);
  }
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
function heldLocks(entered: ReturnType<typeof deferred>, release: ReturnType<typeof deferred>): LockManager {
  return { request: async (_key: string, _options: unknown, commit: () => unknown) => {
    entered.resolve(); await release.promise; return commit();
  } } as unknown as LockManager;
}

describe("CMS draft command correctness", () => {
  it("reads the exact legacy v1 Travel envelope without migration or writes", async () => {
    const storage = new StorageDouble();
    const bytes = JSON.stringify({ schemaVersion: 1, drafts: { travel: publishedTravel } }, null, 2);
    storage.data.set(CONTENT_DRAFT_KEY, bytes);
    const repo = new LocalContentRepository(storage);
    assert.deepEqual(await repo.getDraft("travel"), publishedTravel);
    assert.deepEqual(await repo.getPreview("travel"), publishedTravel);
    assert.equal(storage.getItem(CONTENT_DRAFT_KEY), bytes);
    assert.equal(storage.writes, 0);
  });

  it("missing and valid empty authority stay empty without a read-time write", async () => {
    const storage = new StorageDouble(), repo = new LocalContentRepository(storage);
    assert.equal(await repo.getDraft("travel"), null);
    assert.equal(storage.writes, 0);
    storage.data.set(CONTENT_DRAFT_KEY, '{"schemaVersion":1,"drafts":{}}');
    assert.deepEqual(await repo.getPreview("home"), publishedHome);
    assert.equal(storage.writes, 0);
  });

  it("invalid envelopes reject reads and mutations without repair or notification", async () => {
    for (const bytes of ["", "{broken", "null", '{"schemaVersion":2,"drafts":{}}', '{"schemaVersion":1,"drafts":[]}', '{"schemaVersion":1,"drafts":{},"extra":true}']) {
      const storage = new StorageDouble(); storage.data.set(CONTENT_DRAFT_KEY, bytes);
      const repo = new LocalContentRepository(storage); let notifications = 0;
      repo.subscribe(() => { notifications += 1; });
      await assert.rejects(repo.getPreview("travel"), ContentError);
      await assert.rejects(repo.saveDraft("travel", publishedTravel), ContentError);
      await assert.rejects(repo.discardDraft("travel"), ContentError);
      assert.equal(storage.getItem(CONTENT_DRAFT_KEY), bytes);
      assert.equal(storage.writes, 0); assert.equal(notifications, 0);
    }
  });

  it("storage access and quota errors are truthful and preserve the committed draft", async () => {
    const storage = new StorageDouble(), repo = new LocalContentRepository(storage);
    await repo.saveDraft("travel", publishedTravel);
    const bytes = storage.getItem(CONTENT_DRAFT_KEY); let notifications = 0;
    repo.subscribe(() => { notifications += 1; });
    storage.failWrite = true;
    const draft = structuredClone(publishedTravel); draft.intro.title.en = "Unsaved";
    await assert.rejects(repo.saveDraft("travel", draft), { code: "write_failed" });
    assert.equal(storage.getItem(CONTENT_DRAFT_KEY), bytes); assert.equal(notifications, 0);
    storage.failRead = true;
    await assert.rejects(repo.getDraft("travel"), { code: "storage_unavailable" });
    await assert.rejects(new LocalContentRepository(null).getDraft("travel"), { code: "storage_unavailable" });
  });

  it("receipts have detached committed before/after values and suppress genuine no-op writes", async () => {
    const storage = new StorageDouble(), repo = new LocalContentRepository(storage);
    let notifications = 0; repo.subscribe(() => { notifications += 1; });
    const input = structuredClone(publishedTravel);
    const first = await repo.saveDraftWithReceipt("travel", input);
    assert.equal(first.changed, true); assert.equal(first.before, null);
    input.intro.title.en = "Caller changed"; first.after!.intro.title.en = "Receipt changed";
    assert.deepEqual(await repo.getDraft("travel"), publishedTravel);
    const saved = await repo.getDraft("travel"); saved!.intro.title.en = "Read changed";
    const compiled = await repo.getPublished("travel"); compiled.intro.title.en = "Published read changed";
    assert.deepEqual(await repo.getPublished("travel"), publishedTravel);
    const noop = await repo.saveDraftWithReceipt("travel", { ...publishedTravel, seo: { ...publishedTravel.seo } });
    assert.equal(noop.changed, false); assert.equal(storage.writes, 1); assert.equal(notifications, 1);
    const discarded = await repo.discardDraftWithReceipt("travel");
    assert.deepEqual(discarded.before, publishedTravel); assert.equal(discarded.after, null);
    assert.equal(discarded.changed, true);
    assert.equal((await repo.discardDraftWithReceipt("travel")).changed, false);
    assert.equal(storage.writes, 2); assert.equal(notifications, 2);
  });

  it("two writers reject a stale document baseline after the locked reread", async () => {
    const storage = new StorageDouble();
    const repoB = new LocalContentRepository(storage); await repoB.saveDraft("travel", publishedTravel);
    const entered = deferred(), release = deferred();
    const repoA = new LocalContentRepository({ storage, locks: heldLocks(entered, release) });
    let notifications = 0; repoA.subscribe(() => { notifications += 1; });
    const a = structuredClone(publishedTravel); a.intro.title.en = "Writer A";
    const pending = repoA.saveDraftWithReceipt("travel", a);
    await entered.promise;
    a.intro.title.ar = "Changed after submit";
    const b = structuredClone(publishedTravel); b.intro.title.en = "Writer B";
    await repoB.saveDraft("travel", b);
    const writes = storage.writes; release.resolve();
    await assert.rejects(pending, { code: "draft_conflict" });
    assert.deepEqual(await repoB.getDraft("travel"), b);
    assert.equal(storage.writes, writes); assert.equal(notifications, 0);
    assert.equal(a.intro.title.en, "Writer A", "Caller draft remains available");
  });

  it("editor-provided save and discard baselines reject a newer canonical draft", async () => {
    const storage = new StorageDouble(), repo = new LocalContentRepository(storage);
    await repo.saveDraft("travel", publishedTravel);
    const baseline = await repo.getDraft("travel");
    const newer = structuredClone(publishedTravel); newer.intro.title.ar = "عنوان جديد";
    await repo.saveDraft("travel", newer);
    const writes = storage.writes;
    await assert.rejects(repo.saveDraftWithReceipt("travel", publishedTravel, { expectedDraft: baseline }), { code: "draft_conflict" });
    await assert.rejects(repo.discardDraftWithReceipt("travel", { expectedDraft: baseline }), { code: "draft_conflict" });
    assert.deepEqual(await repo.getDraft("travel"), newer); assert.equal(storage.writes, writes);
  });

  it("a held save captures submitted values and never adopts later caller mutations", async () => {
    const storage = new StorageDouble(), entered = deferred(), release = deferred();
    const repo = new LocalContentRepository({ storage, locks: heldLocks(entered, release) });
    const draft = structuredClone(publishedTravel);
    draft.intro.title.en = "Submitted";
    const pending = repo.saveDraftWithReceipt("travel", draft, { expectedDraft: null });
    await entered.promise;
    draft.intro.title.en = "Changed after submit";
    release.resolve();
    const receipt = await pending;
    assert.equal(receipt.after!.intro.title.en, "Submitted");
    assert.equal((await repo.getDraft("travel"))!.intro.title.en, "Submitted");
  });

  it("sanitizes getter-bearing caller input once before validating the stored candidate", async () => {
    const repo = new LocalContentRepository({ inMemory: true });
    const draft = structuredClone(publishedTravel);
    let reads = 0;
    Object.defineProperty(draft.intro, "title", { enumerable: true, get() {
      reads += 1; return reads === 1 ? { en: "Submitted", ar: "مقدم" } : { en: "", ar: "" };
    } });
    await repo.saveDraft("travel", draft);
    assert.equal(reads, 1);
    assert.equal((await repo.getDraft("travel"))!.intro.title.en, "Submitted");
  });

  it("a concurrent change to another document is preserved by the locked merge", async () => {
    const storage = new StorageDouble(), entered = deferred(), release = deferred();
    const repoA = new LocalContentRepository({ storage, locks: heldLocks(entered, release) });
    const pending = repoA.saveDraft("travel", publishedTravel);
    await entered.promise;
    await new LocalContentRepository(storage).saveDraft("home", publishedHome);
    release.resolve(); await pending;
    assert.deepEqual(await repoA.getDraft("home"), publishedHome);
    assert.deepEqual(await repoA.getDraft("travel"), publishedTravel);
  });

  it("malformed siblings and unknown keys survive healthy-document edits exactly", async () => {
    const storage = new StorageDouble();
    const drafts = { home: { invalid: true }, later: { version: 9 }, travel: publishedTravel };
    storage.data.set(CONTENT_DRAFT_KEY, JSON.stringify({ schemaVersion: 1, drafts }));
    const repo = new LocalContentRepository(storage);
    await assert.rejects(repo.getDraft("home"), { code: "corrupt_store" });
    await assert.rejects(repo.saveDraft("home", publishedHome), { code: "corrupt_store" });
    await repo.discardDraft("travel");
    assert.deepEqual(JSON.parse(storage.getItem(CONTENT_DRAFT_KEY)!).drafts, { home: drafts.home, later: drafts.later });
  });

  it("explicit memory repositories never read or write persistent storage", async () => {
    const storage = new StorageDouble(); storage.failRead = true; storage.failWrite = true;
    const repo = new LocalContentRepository({ inMemory: true, storage });
    await repo.saveDraft("travel", publishedTravel);
    assert.deepEqual(await repo.getPreview("travel"), publishedTravel);
    assert.equal(await new LocalContentRepository({ inMemory: true, storage }).getDraft("travel"), null);
    assert.equal(storage.writes, 0);
  });

  it("invalid editor values provide exact structural issue paths before any write", async () => {
    const storage = new StorageDouble(), repo = new LocalContentRepository(storage);
    const draft = structuredClone(publishedTravel); draft.sections[0]!.title.ar = "";
    await assert.rejects(repo.saveDraftWithReceipt("travel", draft), (error: unknown) =>
      error instanceof ContentError && error.code === "invalid_draft" && error.issues.some((issue) => issue.path === "sections.0.title.ar"));
    assert.equal(storage.writes, 0);
  });
});
