import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { publishedHome } from "../../src/content/published/home.ts";
import { publishedTravel } from "../../src/content/published/travel.ts";
import { publishedAirportPast } from "../../src/content/published/airport-past.ts";
import { homeSections, timelineEntries } from "../../src/content/admin-adapters.ts";
import { contentHealth, isValidContent } from "../../src/content/schema.ts";
import { CONTENT_DRAFT_KEY, LocalContentRepository } from "../../src/content/repository.ts";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  length = 0;
  fail = false;
  clear() { this.data.clear(); this.length = 0; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); this.length = this.data.size; }
  setItem(key: string, value: string) {
    if (this.fail) throw new Error("blocked");
    this.data.set(key, value); this.length = this.data.size;
  }
}

const clone = <T>(value: T): T => structuredClone(value);

describe("typed published editorial content", () => {
  it("validates all compiled bilingual proof documents", () => {
    assert.equal(isValidContent("home", publishedHome), true);
    assert.equal(isValidContent("travel", publishedTravel), true);
    assert.equal(isValidContent("airport.past", publishedAirportPast), true);
    assert.equal(contentHealth(publishedTravel).hasArabic, true);
  });
  it("shares Home, Travel and Past records with Admin adapters", () => {
    assert.equal(homeSections[0]?.heading, publishedHome.copy.h1);
    assert.equal(timelineEntries[1]?.title, publishedAirportPast.timeline[1]?.title);
    assert.equal(publishedTravel.sections.find((s) => s.id === "baggage")?.id, "baggage");
  });
  it("rejects duplicate IDs, missing Arabic, invalid visibility and unknown fields", () => {
    const duplicate = clone(publishedTravel);
    duplicate.sections[1]!.id = duplicate.sections[0]!.id;
    assert.equal(isValidContent("travel", duplicate), false);
    const child = clone(publishedTravel);
    child.sections[0]!.points[1]!.id = child.sections[0]!.points[0]!.id;
    assert.equal(isValidContent("travel", child), false);
    const noArabic = clone(publishedTravel);
    noArabic.sections[0]!.title.ar = "";
    assert.equal(isValidContent("travel", noArabic), false);
    const hidden = clone(publishedHome);
    hidden.sections[0]!.visible = false;
    assert.equal(isValidContent("home", hidden), false);
    assert.equal(isValidContent("travel", { ...publishedTravel, script: "alert(1)" }), false);
    assert.equal(isValidContent("travel", { ...publishedTravel, kind: "unknown" }), false);
    assert.equal(isValidContent("travel", { ...publishedTravel, schemaVersion: 2 }), false);
  });
  it("keeps historical source grounding and rejects false media truth", () => {
    assert.equal(publishedAirportPast.timeline[0]?.evidence, "verified");
    const falseTruth = clone(publishedAirportPast);
    falseTruth.timeline[0]!.media = { kind: "media", id: "home-hero" };
    assert.equal(isValidContent("airport.past", falseTruth), false);
    const badEvidence = clone(publishedAirportPast);
    badEvidence.timeline[0]!.evidence = "invented" as typeof badEvidence.timeline[0]["evidence"];
    assert.equal(isValidContent("airport.past", badEvidence), false);
  });
});

describe("browser-local content drafts", () => {
  it("saves, previews, survives a new repository instance and discards without changing published", async () => {
    const storage = new MemoryStorage();
    const repo = new LocalContentRepository(storage);
    const draft = clone(publishedTravel);
    draft.sections[0]!.title.en = "Local draft title";
    await repo.saveDraft("travel", draft);
    assert.equal((await repo.getDraft("travel"))?.sections[0]?.title.en, "Local draft title");
    assert.equal((await new LocalContentRepository(storage).getPreview("travel")).sections[0]?.title.en, "Local draft title");
    assert.equal((await repo.getPublished("travel")).sections[0]?.title.en, publishedTravel.sections[0]?.title.en);
    await repo.discardDraft("travel");
    assert.equal(await repo.getDraft("travel"), null);
    assert.equal((await repo.getPreview("travel")).sections[0]?.title.en, publishedTravel.sections[0]?.title.en);
  });
  it("preserves the other language during independent edits", async () => {
    const repo = new LocalContentRepository(new MemoryStorage());
    const en = clone(publishedTravel);
    en.sections[0]!.title.en = "Edited English";
    await repo.saveDraft("travel", en);
    const ar = clone((await repo.getDraft("travel"))!);
    ar.sections[0]!.title.ar = "عنوان عربي";
    await repo.saveDraft("travel", ar);
    const result = await repo.getDraft("travel");
    assert.equal(result?.sections[0]?.title.en, "Edited English");
    assert.equal(result?.sections[0]?.title.ar, "عنوان عربي");
  });
  it("fails closed without changing malformed or unsupported-version storage", async () => {
    const storage = new MemoryStorage();
    storage.setItem(CONTENT_DRAFT_KEY, "{broken");
    await assert.rejects(new LocalContentRepository(storage).getDraft("travel"), { code: "corrupt_store" });
    assert.equal(storage.getItem(CONTENT_DRAFT_KEY), "{broken");
    storage.setItem(CONTENT_DRAFT_KEY, JSON.stringify({ schemaVersion: 2, drafts: { travel: publishedTravel } }));
    await assert.rejects(new LocalContentRepository(storage).getDraft("travel"), { code: "unsupported_version" });
    assert.equal(JSON.parse(storage.getItem(CONTENT_DRAFT_KEY)!).schemaVersion, 2);
  });
  it("does not claim success or adopt state when storage rejects the write", async () => {
    const storage = new MemoryStorage();
    const repo = new LocalContentRepository(storage);
    let events = 0;
    const unsubscribe = repo.subscribe(() => { events += 1; });
    storage.fail = true;
    await assert.rejects(repo.saveDraft("travel", clone(publishedTravel)));
    assert.equal(await repo.getDraft("travel"), null);
    assert.equal(events, 0);
    unsubscribe();
  });
  it("rejects unknown keys and invalid draft documents", async () => {
    const repo = new LocalContentRepository(new MemoryStorage());
    await assert.rejects(repo.getDraft("other" as "travel"));
    await assert.rejects(repo.saveDraft("travel", { ...publishedTravel, kind: "home" } as never));
  });
});
