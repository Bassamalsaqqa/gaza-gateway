import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONTENT_DOCUMENT_KEYS, loadContentInventory } from "../../src/content/inventory.ts";
import { CONTENT_DRAFT_KEY, LocalContentRepository } from "../../src/content/repository.ts";
import { publishedTravel } from "../../src/content/published/travel.ts";
import { publishedDestinationsEditorial } from "../../src/content/published/destinations-editorial.ts";

describe("canonical CMS inventory and search projection", () => {
  it("uses all compiled documents without fabricated drafts, missing translations or update dates", async () => {
    const inventory = await loadContentInventory(new LocalContentRepository({ inMemory: true }));
    assert.equal(inventory.documents.length, CONTENT_DOCUMENT_KEYS.length);
    assert.deepEqual(inventory.unavailable, []);
    assert.ok(inventory.documents.every((item) => item.state === "published" && !item.missingAr && !item.missingSource));
    assert.ok(inventory.documents.every((item) => !Object.hasOwn(item, "updated")));
    assert.ok(inventory.entities.some((item) => item.key === "airport.future"));
    assert.ok(inventory.entities.some((item) => item.id === "pages.information:privacy" && item.search?.["page"] === "privacy"));
  });

  it("indexes saved bilingual copy and routes to its canonical document/section editor", async () => {
    const repo = new LocalContentRepository({ inMemory: true });
    const draft = structuredClone(publishedTravel);
    draft.sections[0]!.title.en = "Changed checklist"; draft.sections[0]!.title.ar = "قائمة معدلة";
    draft.sections[0]!.points[0]!.text.en = "Find this saved checklist note";
    await repo.saveDraft("travel", draft);
    const inventory = await loadContentInventory(repo);
    const item = inventory.entities.find((entry) => entry.id === `travel:${draft.sections[0]!.id}`)!;
    assert.deepEqual(item.title, draft.sections[0]!.title);
    assert.ok(item.searchText.includes("Find this saved checklist note"));
    assert.ok(item.searchText.includes("قائمة معدلة"));
    assert.equal(item.to, "/admin/website"); assert.equal(item.search?.["tab"], "travel");
    assert.equal(item.search?.["item"], draft.sections[0]!.id); assert.equal(item.state, "draft");
    assert.equal(inventory.documents.filter((entry) => entry.state === "draft").length, 1);
    await repo.discardDraft("travel");
    assert.equal((await loadContentInventory(repo)).entities.some((entry) => entry.searchText.includes("Find this saved checklist note")), false);
  });

  it("destination editorial results have exact canonical code routes and no mock customer facts", async () => {
    const repo = new LocalContentRepository({ inMemory: true });
    const draft = structuredClone(publishedDestinationsEditorial);
    draft.destinations[0]!.blurb.en = "Editorial Amman marker";
    await repo.saveDraft("destinations.editorial", draft);
    const inventory = await loadContentInventory(repo);
    const item = inventory.entities.find((entry) => entry.id === "destinations.editorial:AMM")!;
    assert.deepEqual(item.params, { code: "AMM" });
    assert.equal(item.to, "/admin/destinations/$code"); assert.equal(item.search?.["tab"], "content");
    assert.ok(item.searchText.includes("Editorial Amman marker"));
  });

  it("a corrupt sibling is explicitly unavailable while healthy drafts and compiled records remain usable", async () => {
    const draft = structuredClone(publishedTravel); draft.intro.title.en = "Healthy Travel";
    const bytes = JSON.stringify({ schemaVersion: 1, drafts: { travel: draft, home: { invalid: true } } });
    let writes = 0;
    const storage: Storage = { length: 1, clear() {}, removeItem() {}, key: () => CONTENT_DRAFT_KEY,
      getItem: (key) => key === CONTENT_DRAFT_KEY ? bytes : null, setItem() { writes += 1; } };
    const inventory = await loadContentInventory(new LocalContentRepository(storage));
    assert.deepEqual(inventory.unavailable, ["home"]);
    assert.equal(inventory.documents.find((entry) => entry.key === "travel")!.title.en, "Healthy Travel");
    const home = inventory.documents.find((entry) => entry.key === "home")!;
    assert.equal(home.draftUnavailable, true); assert.equal(home.state, "published");
    assert.equal(writes, 0); assert.equal(storage.getItem(CONTENT_DRAFT_KEY), bytes);
  });

  it("unavailable draft storage never manufactures successful zero-draft authority", async () => {
    const inventory = await loadContentInventory(new LocalContentRepository(null));
    assert.deepEqual(inventory.unavailable, [...CONTENT_DOCUMENT_KEYS]);
    assert.equal(inventory.documents.length, CONTENT_DOCUMENT_KEYS.length);
    assert.ok(inventory.documents.every((item) => item.draftUnavailable));
  });
});
