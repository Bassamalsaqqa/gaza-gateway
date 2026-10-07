import { it } from "node:test";
import assert from "node:assert/strict";
import { ARCHIVE_CATALOG, getGalleryItems, getVerifiedVideoReferences, VERIFIED_VIDEO_PRESENTATIONS } from "../../src/lib/archive/catalog.ts";
import { SOURCE_REGISTRY } from "../../src/lib/archive/sources.ts";
import { archiveRecordSchema, createArchiveRecordSchema } from "../../src/lib/archive/schema.ts";
import { LocalArchiveDraftRepository, ARCHIVE_DRAFT_KEY } from "../../src/lib/archive/drafts/repository.ts";
import { emptyArchiveDrafts, validateArchiveDrafts } from "../../src/lib/archive/drafts/schema.ts";
import { ArchiveDraftError } from "../../src/lib/archive/drafts/types.ts";
import type { ArchiveRecord, SourceRecord } from "../../src/lib/archive/types.ts";
import { saveArchiveDraft, discardArchiveDraft } from "../../src/lib/archive/drafts/commands.ts";
import { LocalActivityRepository } from "../../src/lib/activity/repository.ts";
import { ActivityStorageCoordinator } from "../../src/lib/activity/storage.ts";
import { assetFormat } from "../../src/components/admin/archive/filter-helpers.ts";
import { formatActivitySummary } from "../../src/lib/activity/format.ts";

class StorageDouble implements Storage {
  data = new Map<string, string>(); writes = 0; failWrite = false; failRead = false;
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { if (this.failRead) throw new Error("denied"); return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { if (this.failWrite) throw new Error("quota"); this.writes++; this.data.set(key, value); }
}
const locks = { request: async (_name: string, _options: unknown, commit: () => unknown) => commit() } as unknown as LockManager;
const memory = () => new LocalArchiveDraftRepository({ inMemory: true });
const record = (id = "past-003") => structuredClone(ARCHIVE_CATALOG.find((r) => r.id === id)!);
const source = (): SourceRecord => ({ id: "src-local-research", title: "Research citation", titleAr: "مصدر بحث", publisher: "Recorded publisher", type: "archive", language: "multilingual", url: "https://example.org/research" });
const isInvalid = (e: unknown) => e instanceof ArchiveDraftError && e.code === "invalid_draft" && e.issues.length > 0;

it("all accepted compiled records keep their HC validation and public selectors", () => {
  for (const r of ARCHIVE_CATALOG) {
    assert.equal(archiveRecordSchema.safeParse(r).success, true, r.id);
    assert.equal(createArchiveRecordSchema(SOURCE_REGISTRY).safeParse(r).success, true, r.id);
  }
  assert.equal(getVerifiedVideoReferences().length, 4);
  assert.equal(getGalleryItems().length, 42);
  assert.equal(assetFormat("/assets/ruins-hash.jpg"), "JPG");
  assert.equal(assetFormat("/assets/past-003-640.webp"), "WEBP");
});
it("missing/empty storage is read-only; compiled documents and returned drafts are detached", async () => {
  const storage = new StorageDouble(), repo = new LocalArchiveDraftRepository({ storage, locks });
  assert.equal((await repo.getSnapshot()).records.length, 67);
  assert.equal(storage.writes, 0);
  storage.data.set(ARCHIVE_DRAFT_KEY, JSON.stringify(emptyArchiveDrafts()));
  const snapshot = await repo.getSnapshot(); snapshot.compiledRecords[0]!.title.en = "Detached";
  assert.notEqual((await repo.getSnapshot()).compiledRecords[0]!.title.en, "Detached");
  assert.deepEqual(snapshot.recordDrafts, {}); assert.equal(storage.writes, 0);
});
it("save/discard/no-op receipts retain other drafts and never change public archive", async () => {
  const repo = memory(), r = record(), publicBefore = JSON.stringify(getGalleryItems());
  r.title.ar = "عنوان المسودة";
  const receipt = await repo.save("record", r, { expectedDraft: null });
  assert.equal(receipt.changed, true); assert.deepEqual(receipt.fields, ["title"]);
  r.title.ar = "Caller changed";
  assert.equal((await repo.getSnapshot()).recordDrafts[r.id]!.title.ar, "عنوان المسودة");
  const saved = (await repo.getSnapshot()).recordDrafts[r.id]!;
  assert.equal((await repo.save("record", saved, { expectedDraft: saved })).changed, false);
  assert.equal((await repo.getSnapshot()).revision, 1);
  await repo.save("source", source(), { expectedDraft: null });
  await repo.discard("record", r.id, { expectedDraft: saved });
  assert.ok((await repo.getSnapshot()).sourceDrafts[source().id]);
  assert.equal((await repo.discard("record", r.id, { expectedDraft: null })).changed, false);
  assert.equal(JSON.stringify(getGalleryItems()), publicBefore);
});
it("unknown records, forged intake identity, duplicate lineage and future concepts cannot be staged", async () => {
  const repo = memory();
  await assert.rejects(repo.save("record", { ...record(), id: "new-intake" }, { expectedDraft: null }), { code: "unknown_record" });
  for (const patch of [{ originalFilename: "forged.jpg" }, { intakeReference: "fake" }, { mediaId: "future-terminal" }, { medium: "illustration" }, { youtubeId: "ABCDEFGHIJK" }]) {
    await assert.rejects(repo.save("record", { ...record(), ...patch } as ArchiveRecord, { expectedDraft: null }), isInvalid);
  }
  await assert.rejects(repo.save("record", { ...record("past-052"), duplicateOf: undefined } as unknown as ArchiveRecord, { expectedDraft: null }), isInvalid);
  await assert.rejects(repo.save("record", { ...record("past-052"), publicationState: "published" }, { expectedDraft: null }), isInvalid);
});
it("every publication request enforces basis, honest credit and prohibited holder/licensing guards", async () => {
  const repo = memory();
  for (const patch of [
    { rights: { status: "unknown", credit: "" } },
    { rights: { status: "rights-managed", holder: "Getty", credit: "Getty" } },
    { rights: { status: "unknown", credit: "Reuters image" } },
    { rights: { status: "licensed", license: "CC", credit: "Archive" } },
    { publicationBasis: undefined },
    { subjects: ["illustrations"] },
    { sourceRefs: ["src-missing"] },
  ]) await assert.rejects(repo.save("record", { ...record(), ...patch } as unknown as ArchiveRecord, { expectedDraft: null }), isInvalid);
  const held = record(); held.publicationState = "hold-rights";
  await repo.save("record", held, { expectedDraft: null });
  assert.equal((await repo.getSnapshot()).recordDrafts[held.id]!.publicationState, "hold-rights");
});
it("new contextual sources resolve only in drafts, and referenced source discard rejects", async () => {
  const repo = memory(), s = source(), r = record(); r.sourceRefs = [s.id];
  await assert.rejects(repo.save("record", r, { expectedDraft: null }), isInvalid);
  await repo.save("source", s, { expectedDraft: null });
  await repo.save("record", r, { expectedDraft: null });
  assert.equal(archiveRecordSchema.safeParse(r).success, false);
  assert.equal(createArchiveRecordSchema({ ...SOURCE_REGISTRY, [s.id]: s }).safeParse(r).success, true);
  await assert.rejects(repo.discard("source", s.id, { expectedDraft: s }), isInvalid);
  assert.ok((await repo.getSnapshot()).sourceDrafts[s.id]);
  assert.equal(Object.hasOwn(SOURCE_REGISTRY, s.id), false);
});
it("source edits cannot change curated verified YouTube identity or bypass host checks", async () => {
  const repo = memory(), id = VERIFIED_VIDEO_PRESENTATIONS[0]!.sourceRef;
  for (const url of ["http://youtube.com/watch?v=ABCDEFGHIJK", "https://youtube.com.evil.test/watch?v=ABCDEFGHIJK", "https://youtube.com/watch?v=ABCDEFGHIJK"]) {
    await assert.rejects(repo.save("source", { ...SOURCE_REGISTRY[id]!, url }, { expectedDraft: null }), isInvalid);
  }
  await assert.rejects(repo.save("source", { ...SOURCE_REGISTRY[id]!, type: "press" }, { expectedDraft: null }), isInvalid);
});
it("calendar, plain-text, URL, reference and size boundaries reject at exact paths", async () => {
  const repo = memory();
  for (const patch of [
    { date: "1998-02-30", datePrecision: "exact" }, { title: { en: "<script>bad</script>", ar: "عنوان" } },
    { location: "x".repeat(5001) }, { relatedTimelineEventIds: ["invented-event"] },
    { relatedRecordIds: ["missing"] }, { sourceRefs: ["src-oslo-ii-1995", "src-oslo-ii-1995"] },
    { rights: { ...record().rights, statementUri: "javascript:alert(1)" } },
  ]) await assert.rejects(repo.save("record", { ...record(), ...patch } as ArchiveRecord, { expectedDraft: null }), isInvalid);
  await assert.rejects(repo.save("source", { ...source(), url: "https://user:pass@example.org/a" }, { expectedDraft: null }), isInvalid);
  await assert.rejects(repo.save("source", { ...source(), publicationDate: "2026-02-30" }, { expectedDraft: null }), isInvalid);
});
it("corrupt and unsupported stores fail closed without repair, write, or false notification", async () => {
  for (const bytes of ["{broken", "null", '{"schemaVersion":2}', '{"schemaVersion":1,"revision":0,"records":{"past-003":null},"sources":{}}', '{"schemaVersion":1,"revision":0,"records":{},"sources":{},"extra":true}']) {
    const storage = new StorageDouble(); storage.data.set(ARCHIVE_DRAFT_KEY, bytes);
    const repo = new LocalArchiveDraftRepository({ storage, locks }); let calls = 0; repo.subscribe(() => calls++);
    await assert.rejects(repo.getSnapshot(), ArchiveDraftError);
    await assert.rejects(repo.save("record", record(), { expectedDraft: null }), ArchiveDraftError);
    assert.equal(storage.getItem(ARCHIVE_DRAFT_KEY), bytes); assert.equal(storage.writes, 0); assert.equal(calls, 0);
  }
});
it("failed write preserves prior canonical bytes/revision and does not adopt or notify", async () => {
  const storage = new StorageDouble(), repo = new LocalArchiveDraftRepository({ storage, locks });
  await repo.save("record", record(), { expectedDraft: null });
  const before = storage.getItem(ARCHIVE_DRAFT_KEY); let calls = 0; repo.subscribe(() => calls++);
  storage.failWrite = true;
  await assert.rejects(repo.save("record", { ...record(), featured: false }, { expectedDraft: record() }), { code: "write_failed" });
  assert.equal(storage.getItem(ARCHIVE_DRAFT_KEY), before); assert.equal(calls, 0);
  assert.equal((await repo.getSnapshot()).revision, 1);
  storage.failRead = true; await assert.rejects(repo.getSnapshot(), { code: "storage_unavailable" });
  await assert.rejects(new LocalArchiveDraftRepository({ storage: null }).getSnapshot(), { code: "storage_unavailable" });
});
it("two independent repositories reject a stale draft at locked reread with zero overwriting writes", async () => {
  const storage = new StorageDouble(); let enter!: () => void, release!: () => void;
  const entered = new Promise<void>((r) => { enter = r; }), held = new Promise<void>((r) => { release = r; });
  const slowLocks = { request: async (_key: string, _options: unknown, commit: () => unknown) => { enter(); await held; return commit(); } } as unknown as LockManager;
  const a = new LocalArchiveDraftRepository({ storage, locks: slowLocks }), b = new LocalArchiveDraftRepository({ storage, locks });
  let calls = 0; a.subscribe(() => calls++);
  const pending = a.save("record", { ...record(), location: "Writer A" }, { expectedDraft: null });
  await entered; await b.save("record", { ...record(), location: "Writer B" }, { expectedDraft: null });
  release(); await assert.rejects(pending, { code: "draft_conflict" });
  assert.equal(storage.writes, 1); assert.equal(calls, 0);
  assert.equal((await a.getSnapshot()).recordDrafts[record().id]!.location, "Writer B");
});
it("source and record commands reread siblings inside the lock and preserve concurrent unrelated drafts", async () => {
  const storage = new StorageDouble(), a = new LocalArchiveDraftRepository({ storage, locks }), b = new LocalArchiveDraftRepository({ storage, locks });
  await a.save("record", record(), { expectedDraft: null });
  await b.save("record", record("past-005"), { expectedDraft: null });
  assert.equal(Object.keys((await a.getSnapshot()).recordDrafts).length, 2);
  await assert.rejects(a.save("record", record(), undefined as never), { code: "invalid_draft" });
  await assert.rejects(new LocalArchiveDraftRepository({ storage, locks: null }).discard("record", record().id, { expectedDraft: record() }), { code: "coordination_unavailable" });
});
it("memory mode ignores persistent bytes entirely and does not touch another instance", async () => {
  const denied = { getItem: () => { throw new Error("must not read"); }, setItem: () => { throw new Error("must not write"); } } as unknown as Storage;
  const a = new LocalArchiveDraftRepository({ inMemory: true, storage: denied }), b = memory();
  await a.save("record", record(), { expectedDraft: null });
  assert.equal(Object.keys((await b.getSnapshot()).recordDrafts).length, 0);
});
it("audit records committed field names/state only; no-ops, failed commands and viewers produce no event", async () => {
  const archiveDrafts = memory(); let id = 0;
  const activity = new LocalActivityRepository({ coordinator: new ActivityStorageCoordinator({ inMemoryOnly: true }), generateId: () => `archive-${++id}` });
  const actor = { id: "adm-1", name: { en: "Rana", ar: "رنا" }, role: "admin" as const, email: "rana@gza.ps" };
  const ctx = { archiveDrafts, activity, actor }, r = record(); r.factCheckNotes = "Private curator notes";
  await saveArchiveDraft(ctx, "record", r, { expectedDraft: null });
  const event = (await activity.list())[0]!;
  assert.equal(event.metadata?.["summary"], "factCheckNotes");
  assert.match(formatActivitySummary(event, "en", (key) => key), /local archive draft/);
  assert.match(formatActivitySummary(event, "ar", (key) => key), /مسودة الأرشيف المحلية/);
  assert.equal(JSON.stringify(event).includes("Private curator notes"), false);
  await saveArchiveDraft(ctx, "record", r, { expectedDraft: r });
  await assert.rejects(saveArchiveDraft(ctx, "record", { ...r, sourceRefs: ["missing"] }, { expectedDraft: r }), isInvalid);
  await assert.rejects(saveArchiveDraft({ ...ctx, actor: { ...actor, role: "viewer" } }, "record", r, { expectedDraft: r }), { code: "permission_denied" });
  assert.equal((await activity.list()).length, 1);
  await discardArchiveDraft(ctx, "record", r.id, { expectedDraft: r });
  assert.equal((await activity.list()).length, 2);
});
it("audit failure warns after a successful draft without rolling it back", async () => {
  const archiveDrafts = memory(); let warning = "";
  const activity = new LocalActivityRepository({ coordinator: new ActivityStorageCoordinator({ storage: null }) });
  const actor = { id: "adm-1", name: { en: "Rana", ar: "رنا" }, role: "admin" as const, email: "rana@gza.ps" };
  await saveArchiveDraft({ archiveDrafts, activity, actor, onAuditWarning: (w) => { warning = w; } }, "record", record(), { expectedDraft: null });
  assert.equal(warning, "audit_append_failed"); assert.ok((await archiveDrafts.getSnapshot()).recordDrafts[record().id]);
});
it("invalid source/record overlays fail contextual schema checks without mutating compiled objects", () => {
  const state = emptyArchiveDrafts(); state.sources[source().id] = source();
  assert.equal(Object.keys(validateArchiveDrafts(state).sources).length, 1);
  state.records["past-003"] = { ...record(), id: "past-005" };
  assert.throws(() => validateArchiveDrafts(state), isInvalid);
});

it("subscriptions respond only to relevant storage authority and detach cleanly", async () => {
  const originalWindow = globalThis.window;
  const events = new EventTarget();
  Object.assign(events, { localStorage: new StorageDouble() });
  Object.defineProperty(globalThis, "window", { configurable: true, value: events });
  try {
    const storage = new StorageDouble(), repo = new LocalArchiveDraftRepository({ storage, locks });
    let calls = 0; const off = repo.subscribe(() => calls++);
    const change = (key: string | null, storageArea: Storage = storage) => {
      const event = new Event("storage"); Object.assign(event, { key, storageArea }); events.dispatchEvent(event);
    };
    change("gza.repo.v1"); change(ARCHIVE_DRAFT_KEY, new StorageDouble()); assert.equal(calls, 0);
    change(ARCHIVE_DRAFT_KEY); assert.equal(calls, 1);
    storage.data.set(ARCHIVE_DRAFT_KEY, "{broken"); change(null); assert.equal(calls, 2);
    await assert.rejects(repo.getSnapshot(), { code: "corrupt_store" });
    off(); change(ARCHIVE_DRAFT_KEY); assert.equal(calls, 2);
  } finally {
    if (originalWindow === undefined) Reflect.deleteProperty(globalThis, "window");
    else Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});
