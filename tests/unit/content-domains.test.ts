import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isContentKey, isValidContent, contentHealth } from "../../src/content/schema.ts";
import { LocalContentRepository } from "../../src/content/repository.ts";
import { publishedAirportFuture } from "../../src/content/published/airport-future.ts";
import { publishedDestinationsEditorial } from "../../src/content/published/destinations-editorial.ts";
import { publishedInformationPages } from "../../src/content/published/information-pages.ts";
import { privacySections, termsSections } from "../../src/content/published/information-sections.ts";
import { en, ar } from "../../src/lib/i18n-public.ts";
import { destinations } from "../../src/lib/data.ts";
import type { ContentKey } from "../../src/content/types.ts";
import { compiledContentHead } from "../../src/content/head.ts";

describe("Phase 7 authored content domains", () => {
  it("all eight compiled documents validate, have bilingual copy and remain independently readable", async () => {
    const repo = new LocalContentRepository(null);
    const keys: ContentKey[] = ["home", "travel", "airport.past", "airport.present", "airport.future", "destinations.presentation", "destinations.editorial", "pages.information"];
    for (const key of keys) {
      assert.equal(isContentKey(key), true);
      const doc = await repo.getPublished(key);
      assert.equal(isValidContent(key, doc), true, key);
      assert.equal(contentHealth(doc).hasEnglish, true, key);
      assert.equal(contentHealth(doc).hasArabic, true, key);
    }
    assert.equal(isContentKey("flights"), false);
    assert.equal(isValidContent("unknown" as ContentKey, publishedDestinationsEditorial), false);
  });

  it("Future defaults retain the accepted narrative and cannot modify media classification", () => {
    assert.deepEqual(publishedAirportFuture.copy.title, { en: en["airport.future"], ar: ar["airport.future"] });
    assert.deepEqual(publishedAirportFuture.copy.masterplanBody, { en: en["airport.themeMasterplanBody"], ar: ar["airport.themeMasterplanBody"] });
    assert.equal(isValidContent("airport.future", { ...publishedAirportFuture, truthClass: "historical-documentary" }), false);
    assert.equal(isValidContent("airport.future", { ...publishedAirportFuture, copy: { ...publishedAirportFuture.copy, disclosure: { en: "Real airport", ar: "مطار حقيقي" } } }), false);
  });

  it("destination defaults reproduce compiled copy with stable point IDs and exclude sale authority", () => {
    for (const destination of destinations) {
      const entry = publishedDestinationsEditorial.destinations.find((item) => item.code === destination.code)!;
      assert.deepEqual(entry.blurb, destination.blurb);
      assert.deepEqual(entry.goodToKnow.map((point) => point.text), destination.goodToKnow);
      assert.ok(entry.goodToKnow.every((point) => point.visible));
      for (const extra of [{ active: false }, { priceFrom: 1 }, { weeklyFlights: 100 }, { aircraftId: "a320neo" }, { blockMinutes: 50 }]) {
        const draft = structuredClone(publishedDestinationsEditorial);
        Object.assign(draft.destinations[0]!, extra);
        assert.equal(isValidContent("destinations.editorial", draft), false, Object.keys(extra)[0]);
      }
    }
  });

  it("destination point CRUD, reorder and visibility retain exact bilingual item identities", async () => {
    const repo = new LocalContentRepository({ inMemory: true });
    const draft = structuredClone(publishedDestinationsEditorial);
    const entry = draft.destinations[0]!;
    const unchanged = structuredClone(entry.goodToKnow[0]!);
    entry.goodToKnow.push({ id: "amm-point-added", text: { en: "Additional note", ar: "ملاحظة إضافية" }, visible: true });
    entry.goodToKnow.reverse();
    entry.goodToKnow[0]!.visible = false;
    await repo.saveDraft("destinations.editorial", draft);
    const saved = (await repo.getDraft("destinations.editorial"))!;
    assert.equal(saved.destinations[0]!.goodToKnow[0]!.id, "amm-point-added");
    assert.equal(saved.destinations[0]!.goodToKnow[0]!.visible, false);
    assert.deepEqual(saved.destinations[0]!.goodToKnow.find((point) => point.id === unchanged.id), unchanged);
    entry.goodToKnow = entry.goodToKnow.filter((point) => point.id !== "amm-point-added");
    await repo.saveDraft("destinations.editorial", draft);
    assert.equal((await repo.getDraft("destinations.editorial"))!.destinations[0]!.goodToKnow.some((point) => point.id === "amm-point-added"), false);
  });

  it("duplicate codes, item IDs, absent translations, blank fields and unknown properties reject", () => {
    const duplicateCode = structuredClone(publishedDestinationsEditorial);
    duplicateCode.destinations[1]!.code = duplicateCode.destinations[0]!.code;
    assert.equal(isValidContent("destinations.editorial", duplicateCode), false);
    const duplicatePoint = structuredClone(publishedDestinationsEditorial);
    duplicatePoint.destinations[1]!.goodToKnow[0]!.id = duplicatePoint.destinations[0]!.goodToKnow[0]!.id;
    assert.equal(isValidContent("destinations.editorial", duplicatePoint), false);
    const missingArabic = structuredClone(publishedAirportFuture);
    missingArabic.copy.title.ar = "   ";
    assert.equal(isValidContent("airport.future", missingArabic), false);
    const missingPage = structuredClone(publishedInformationPages); missingPage.pages.pop();
    assert.equal(isValidContent("pages.information", missingPage), false);
    const badId = structuredClone(publishedInformationPages); badId.pages[0]!.blocks[0]!.id = "unsafe/id";
    assert.equal(isValidContent("pages.information", badId), false);
    const duplicateBlock = structuredClone(publishedInformationPages);
    duplicateBlock.pages[2]!.blocks[0]!.id = duplicateBlock.pages[0]!.blocks[0]!.id;
    assert.equal(isValidContent("pages.information", duplicateBlock), false);
  });

  it("legal prose retains exact accepted paragraphs; Contact settings/inbox facts are not CMS", () => {
    const privacy = publishedInformationPages.pages.find((page) => page.id === "privacy")!;
    const terms = publishedInformationPages.pages.find((page) => page.id === "terms")!;
    assert.deepEqual(privacy.blocks.map((block) => block.paragraphs), privacySections.map((section) => section.body));
    assert.deepEqual(terms.blocks.map((block) => block.title), termsSections.map((section) => section.heading));
    const contact = publishedInformationPages.pages.find((page) => page.id === "contact")!;
    assert.deepEqual(contact.blocks, []);
    const invalid = structuredClone(publishedInformationPages);
    Object.assign(invalid.pages[1]!, { email: "changed@example.com", phone: "123", topics: ["new"] });
    assert.equal(isValidContent("pages.information", invalid), false);
  });

  it("one locale edit does not change the other locale or unrelated page documents", async () => {
    const repo = new LocalContentRepository({ inMemory: true });
    const draft = structuredClone(publishedInformationPages);
    const oldContact = structuredClone(draft.pages[1]!);
    const arTitle = draft.pages[0]!.title.ar;
    draft.pages[0]!.title.en = "Edited About";
    await repo.saveDraft("pages.information", draft);
    assert.equal((await repo.getDraft("pages.information"))!.pages[0]!.title.ar, arTitle);
    assert.deepEqual((await repo.getDraft("pages.information"))!.pages[1], oldContact);
    assert.deepEqual(await repo.getPublished("pages.information"), publishedInformationPages);
  });

  it("static metadata remains compiled when a different local SEO draft exists", async () => {
    const repo = new LocalContentRepository({ inMemory: true });
    const draft = structuredClone(publishedAirportFuture);
    draft.seo.title.en = "Unpublished metadata";
    await repo.saveDraft("airport.future", draft);
    assert.equal(compiledContentHead(publishedAirportFuture.seo, undefined).meta[0]!.title, publishedAirportFuture.seo.title.en);
    assert.equal(compiledContentHead(publishedAirportFuture.seo, "ar").meta[0]!.title, publishedAirportFuture.seo.title.ar);
    assert.equal(JSON.stringify(compiledContentHead(publishedAirportFuture.seo, undefined)).includes("Unpublished metadata"), false);
  });
});
