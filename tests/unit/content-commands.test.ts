import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { saveContentDraft, discardContentDraft } from "../../src/content/commands.ts";
import { LocalContentRepository } from "../../src/content/repository.ts";
import { publishedTravel } from "../../src/content/published/travel.ts";
import { ActivityStorageCoordinator } from "../../src/lib/activity/storage.ts";
import { LocalActivityRepository } from "../../src/lib/activity/repository.ts";
import { formatActivitySummary } from "../../src/lib/activity/format.ts";
import { createRepositories } from "../../src/lib/repositories/registry.ts";
import type { ActivityActorSnapshot } from "../../src/lib/activity/types.ts";

const actor: ActivityActorSnapshot = { id: "adm-1", name: { en: "Rana", ar: "رنا" }, email: "rana@gza.ps", role: "admin" };
function context() {
  let id = 0;
  return {
    content: new LocalContentRepository({ inMemory: true }),
    activity: new LocalActivityRepository({ coordinator: new ActivityStorageCoordinator({ inMemoryOnly: true }),
      now: () => "2026-10-07T10:00:00Z", generateId: () => `cms-${++id}` }),
    actor: structuredClone(actor),
  };
}

describe("CMS administrative command audit", () => {
  it("audits a committed save and discard with bounded semantic state, not authored copy", async () => {
    const ctx = context();
    const draft = structuredClone(publishedTravel); draft.intro.title.en = "Private unpublished copy";
    await saveContentDraft(ctx, "travel", draft, { expectedDraft: null });
    const events = await ctx.activity.list({ module: "content" });
    assert.equal(events.length, 1);
    assert.equal(events[0]!.targetId, "travel"); assert.equal(events[0]!.targetType, "content_draft");
    assert.equal(events[0]!.before, "absent"); assert.equal(events[0]!.after, "saved");
    assert.equal(events[0]!.metadata?.["action"], "save_draft");
    assert.equal(JSON.stringify(events).includes("Private unpublished copy"), false);
    assert.match(formatActivitySummary(events[0]!, "en", (key) => key), /saved the local draft/);
    assert.match(formatActivitySummary(events[0]!, "ar", (key) => key), /المسودة المحلية/);
    await discardContentDraft(ctx, "travel", { expectedDraft: draft });
    const discarded = (await ctx.activity.list()).find((event) => event.action === "cleared")!;
    assert.equal(discarded.before, "saved"); assert.equal(discarded.after, "absent");
    assert.match(formatActivitySummary(discarded, "en", (key) => key), /discarded the local draft/);
  });

  it("no-op saves and discards produce no duplicate audit events", async () => {
    const ctx = context();
    assert.equal((await discardContentDraft(ctx, "travel")).changed, false);
    await saveContentDraft(ctx, "travel", publishedTravel);
    assert.equal((await saveContentDraft(ctx, "travel", publishedTravel)).changed, false);
    assert.equal((await ctx.activity.list()).length, 1);
  });

  it("a save audits committed item additions, removals, reorder and visibility without text", async () => {
    const ctx = context();
    await saveContentDraft(ctx, "travel", publishedTravel);
    const draft = structuredClone(publishedTravel);
    const points = draft.sections[0]!.points;
    assert.ok(points.length >= 3);
    points.pop(); points.reverse(); points[0]!.visible = false;
    points.push({ id: "extra-note", text: { en: "Private note", ar: "ملاحظة خاصة" }, visible: true });
    const receipt = await saveContentDraft(ctx, "travel", draft, { expectedDraft: publishedTravel });
    assert.deepEqual(receipt.changes, { added: 1, removed: 1, reordered: 1, visibility: 1 });
    const event = (await ctx.activity.list()).find((item) => item.before === "saved")!;
    assert.equal(event.metadata?.["summary"], "added=1;removed=1;reordered=1;visibility=1");
    assert.equal(event.metadata?.["count"], 4);
    assert.equal(JSON.stringify(event).includes("Private note"), false);
  });

  it("validation, storage, and stale baseline failures never create an event", async () => {
    const ctx = context();
    const invalid = structuredClone(publishedTravel); invalid.intro.title.ar = "";
    await assert.rejects(saveContentDraft(ctx, "travel", invalid), { code: "invalid_draft" });
    await assert.rejects(saveContentDraft({ ...ctx, content: new LocalContentRepository(null) }, "travel", publishedTravel), { code: "storage_unavailable" });
    assert.equal((await ctx.activity.list()).length, 0);
    await saveContentDraft(ctx, "travel", publishedTravel);
    await assert.rejects(discardContentDraft(ctx, "travel", { expectedDraft: null }), { code: "draft_conflict" });
    assert.equal((await ctx.activity.list()).length, 1);
  });

  it("viewer and unauthenticated commands cannot edit or fabricate a staff audit", async () => {
    const ctx = context();
    await assert.rejects(saveContentDraft({ ...ctx, actor: { ...actor, role: "viewer" } }, "travel", publishedTravel), { code: "permission_denied" });
    await assert.rejects(saveContentDraft({ ...ctx, actor: null }, "travel", publishedTravel), { code: "permission_denied" });
    assert.equal(await ctx.content.getDraft("travel"), null);
    assert.equal((await ctx.activity.list()).length, 0);
  });

  it("audit failure retains the successful draft and reports a truthful warning", async () => {
    const ctx = context(); let warning: string | undefined; let logged = 0;
    const log = console.warn; console.warn = () => { logged += 1; };
    try {
      const activity = new LocalActivityRepository(new ActivityStorageCoordinator({ storage: null }));
      const receipt = await saveContentDraft({ ...ctx, activity, onAuditWarning: (message) => { warning = message; } }, "travel", publishedTravel);
      assert.equal(receipt.changed, true);
      assert.deepEqual(await ctx.content.getDraft("travel"), publishedTravel);
      assert.equal(warning, "audit_append_failed"); assert.equal(logged, 1);
    } finally { console.warn = log; }
  });

  it("captures the actor before the domain await and cannot be retitled by caller mutation", async () => {
    const ctx = context();
    const pending = saveContentDraft(ctx, "travel", publishedTravel);
    ctx.actor.name.en = "Changed after submit";
    await pending;
    assert.equal((await ctx.activity.list())[0]!.actor.name.en, "Rana");
  });

  it("registry memory/Studio-style content stays separate from browser drafts", async () => {
    let reads = 0, writes = 0;
    const storage: Storage = { length: 0, clear() {}, key: () => null, removeItem() {},
      getItem() { reads += 1; return null; }, setItem() { writes += 1; } };
    const studio = createRepositories({ inMemoryOnly: true, storage });
    await studio.content.saveDraft("travel", publishedTravel);
    assert.deepEqual(await studio.content.getPreview("travel"), publishedTravel);
    assert.equal(reads, 0); assert.equal(writes, 0);
    assert.equal(await createRepositories({ inMemoryOnly: true, storage }).content.getDraft("travel"), null);
  });
});
