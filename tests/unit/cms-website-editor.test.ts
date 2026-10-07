import test from "node:test";
import assert from "node:assert/strict";
import { publishedHome } from "../../src/content/published/home.ts";
import { publishedTravel } from "../../src/content/published/travel.ts";
import { publishedAirportPast } from "../../src/content/published/airport-past.ts";
import { publishedAirportPresent } from "../../src/content/published/airport-present.ts";
import { publishedAirportFuture } from "../../src/content/published/airport-future.ts";
import { publishedDestinationsEditorial } from "../../src/content/published/destinations-editorial.ts";
import { publishedDestinationsPresentation } from "../../src/content/published/destinations-presentation.ts";
import { publishedInformationPages } from "../../src/content/published/information-pages.ts";
import {
  HOME_SECTION_POLICY,
  type HomeContent,
  type TravelContent,
  type DestinationsEditorialContent,
  type DestinationsPresentationContent,
  type InformationalPagesContent,
  type AirportPastContent,
} from "../../src/content/types.ts";
import {
  validatePlainText,
  validateHomeContent,
  validateTravelContent,
  validateAirportPastContent,
  validateAirportPresentContent,
  validateAirportFutureContent,
  validateDestinationsEditorialContent,
  validateDestinationsPresentationContent,
  validateInformationPagesContent,
  focusFirstInvalidField,
} from "../../src/components/admin/cms/cms-validation.ts";
import { LocalContentRepository } from "../../src/content/repository.ts";

function createMockStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  };
}

test("cms validation — plainText constraints", () => {
  assert.equal(validatePlainText(""), "cms.err.required");
  assert.equal(validatePlainText(null), "cms.err.required");
  assert.equal(validatePlainText(undefined), "cms.err.required");

  // HTML tag rejection
  assert.equal(validatePlainText("Hello <script>alert(1)</script>"), "cms.err.htmlNotAllowed");
  assert.equal(validatePlainText("Text with <p>paragraph</p>"), "cms.err.htmlNotAllowed");
  assert.equal(validatePlainText("javascript:void(0)"), "cms.err.htmlNotAllowed");
  assert.equal(validatePlainText("data:text/html,test"), "cms.err.htmlNotAllowed");

  // Length limit
  const longText = "a".repeat(5001);
  assert.equal(validatePlainText(longText), "cms.err.maxLength");

  // Valid plain text
  assert.equal(validatePlainText("Welcome to Gaza International Airport"), null);
  assert.equal(validatePlainText("مرحباً بكم في مطار غزة الدولي"), null);
});

test("cms validation — Home content validation and section policy", () => {
  // Published baseline is valid
  const baselineErrors = validateHomeContent(publishedHome as HomeContent);
  assert.deepEqual(baselineErrors, {});

  // Missing Arabic in copy is flagged
  const clone = structuredClone(publishedHome) as HomeContent;
  clone.copy.h1.ar = "";
  const errors1 = validateHomeContent(clone);
  assert.equal(errors1["copy-h1-ar"], "cms.err.required");

  // Missing English in SEO is flagged
  const clone2 = structuredClone(publishedHome) as HomeContent;
  clone2.seo.title.en = "";
  const errors2 = validateHomeContent(clone2);
  assert.equal(errors2["seo-title-en"], "cms.err.required");

  // Section policy: hero, search, board must be positions 0, 1, 2 and visible
  const clone3 = structuredClone(publishedHome) as HomeContent;
  clone3.sections[0]!.visible = false;
  const errors3 = validateHomeContent(clone3);
  assert.equal(errors3["section-hero"], "cms.sections.required");

  // Section policy: swapping a required section out of positions 0, 1, 2 fails
  const clone4 = structuredClone(publishedHome) as HomeContent;
  const temp = clone4.sections[0]!;
  clone4.sections[0] = clone4.sections[3]!;
  clone4.sections[3] = temp;
  const errors4 = validateHomeContent(clone4);
  assert.ok(errors4["section-hero"]);

  // Movable sections (indices 3..7) can be reordered and toggled hidden safely
  const clone5 = structuredClone(publishedHome) as HomeContent;
  assert.equal(HOME_SECTION_POLICY[clone5.sections[3]!.id].required, false);
  clone5.sections[3]!.visible = false;
  const sec3 = clone5.sections[3]!;
  clone5.sections[3] = clone5.sections[4]!;
  clone5.sections[4] = sec3;
  const errors5 = validateHomeContent(clone5);
  assert.deepEqual(errors5, {});
});

test("cms validation — Travel content validation and structural requirements", () => {
  // Published baseline is valid
  const baselineErrors = validateTravelContent(publishedTravel as TravelContent);
  assert.deepEqual(baselineErrors, {});

  // Intro fields validation
  const clone = structuredClone(publishedTravel) as TravelContent;
  clone.intro.title.en = "";
  const errors1 = validateTravelContent(clone);
  assert.equal(errors1["tr-intro-title-en"], "cms.err.required");

  // Section title / body validation
  const clone2 = structuredClone(publishedTravel) as TravelContent;
  clone2.sections[0]!.title.ar = "";
  const errors2 = validateTravelContent(clone2);
  assert.equal(errors2[`tr-sec-${clone2.sections[0]!.id}-title-ar`], "cms.err.required");

  // Point text validation
  const clone3 = structuredClone(publishedTravel) as TravelContent;
  clone3.sections[0]!.points[0]!.text.en = "";
  const errors3 = validateTravelContent(clone3);
  assert.equal(errors3[`tr-pt-${clone3.sections[0]!.points[0]!.id}-en`], "cms.err.required");

  // Duplicate or invalid slug point ID
  const clone4 = structuredClone(publishedTravel) as TravelContent;
  clone4.sections[0]!.points.push({
    id: clone4.sections[0]!.points[0]!.id, // duplicate
    visible: true,
    text: { en: "Test", ar: "تجربة" },
  });
  const errors4 = validateTravelContent(clone4);
  assert.ok(errors4[`tr-pt-${clone4.sections[0]!.points[0]!.id}-id`]);
});

test("cms validation — focusFirstInvalidField prioritization", () => {
  const errors = {
    "copy-h1-ar": "cms.err.required",
    "copy-h1-en": "cms.err.required",
  };

  // When edit language is English, prioritizes -en
  const targetEn = focusFirstInvalidField(errors, "en");
  assert.equal(targetEn, "copy-h1-en");

  // When edit language is Arabic, prioritizes -ar
  const targetAr = focusFirstInvalidField(errors, "ar");
  assert.equal(targetAr, "copy-h1-ar");
});

test("cms repository — Home draft lifecycle (save, preview, other-locale preservation, discard)", async () => {
  const storage = createMockStorage();
  const repo = new LocalContentRepository(storage);

  // Baseline draft is null
  assert.equal(await repo.getDraft("home"), null);

  // Preview matches published
  const initialPreview = await repo.getPreview("home");
  assert.equal(initialPreview.copy.h1.en, publishedHome.copy.h1.en);

  // Modify only English copy
  const updatedHome = structuredClone(publishedHome) as HomeContent;
  const newEnTitle = "Flights from Gaza — New Edition";
  updatedHome.copy.h1.en = newEnTitle;

  // Save draft
  await repo.saveDraft("home", updatedHome);

  // Verify persisted draft
  const draft = await repo.getDraft("home");
  assert.ok(draft);
  assert.equal(draft.copy.h1.en, newEnTitle);
  // Arabic is preserved untouched
  assert.equal(draft.copy.h1.ar, publishedHome.copy.h1.ar);

  // Preview reflects draft
  const preview = await repo.getPreview("home");
  assert.equal(preview.copy.h1.en, newEnTitle);

  // Discard draft
  await repo.discardDraft("home");
  assert.equal(await repo.getDraft("home"), null);
  const revertedPreview = await repo.getPreview("home");
  assert.equal(revertedPreview.copy.h1.en, publishedHome.copy.h1.en);
});

test("cms repository — Travel draft lifecycle and point operations", async () => {
  const storage = createMockStorage();
  const repo = new LocalContentRepository(storage);

  const updatedTravel = structuredClone(publishedTravel) as TravelContent;
  const prepareSection = updatedTravel.sections.find((s) => s.id === "prepare");
  assert.ok(prepareSection);

  // Add new schema-valid checklist point
  const newPointId = `prepare-pt-${Date.now().toString(36)}`;
  prepareSection.points.push({
    id: newPointId,
    visible: true,
    text: { en: "Bring your booking confirmation receipt.", ar: "أحضر إيصال تأكيد الحجز." },
  });

  // Save draft
  await repo.saveDraft("travel", updatedTravel);

  const draft = await repo.getDraft("travel");
  assert.ok(draft);
  const draftPrepare = draft.sections.find((s) => s.id === "prepare");
  assert.ok(draftPrepare);
  assert.equal(draftPrepare.points.length, prepareSection.points.length);
  assert.equal(draftPrepare.points.at(-1)?.id, newPointId);

  // Reorder points: move the new point to first position
  const lastPoint = draftPrepare.points.pop()!;
  draftPrepare.points.unshift(lastPoint);
  await repo.saveDraft("travel", draft);

  const reorderedDraft = await repo.getDraft("travel");
  assert.ok(reorderedDraft);
  assert.equal(reorderedDraft.sections.find((s) => s.id === "prepare")?.points[0]?.id, newPointId);

  // Discard draft
  await repo.discardDraft("travel");
  assert.equal(await repo.getDraft("travel"), null);
});

test("cms validation — Airport Past/Present/Future validators", () => {
  // Published defaults have 0 errors
  assert.deepEqual(validateAirportPastContent(publishedAirportPast), {});
  assert.deepEqual(validateAirportPresentContent(publishedAirportPresent), {});
  assert.deepEqual(validateAirportFutureContent(publishedAirportFuture), {});

  // Past: corrupt source ref
  const corruptPast = structuredClone(publishedAirportPast);
  corruptPast.timeline[0]!.sourceRefs = ["nonexistent-source"];
  const pastErrors = validateAirportPastContent(corruptPast);
  assert.equal(pastErrors["past-ch-planning-sourceRefs"], "cms.err.invalidSourceRef");

  // Present: empty intro title
  const corruptPresent = structuredClone(publishedAirportPresent);
  corruptPresent.intro.title.en = "";
  const presentErrors = validateAirportPresentContent(corruptPresent);
  assert.equal(presentErrors["pr-intro-title-en"], "cms.err.required");

  // Future: empty copy
  const corruptFuture = structuredClone(publishedAirportFuture);
  corruptFuture.copy.title.en = "";
  const futureErrors = validateAirportFutureContent(corruptFuture);
  assert.equal(futureErrors["future-copy-title-en"], "cms.err.required");
});

test("cms validation — Destinations editorial and presentation validators", () => {
  assert.deepEqual(validateDestinationsEditorialContent(publishedDestinationsEditorial), {});
  assert.deepEqual(validateDestinationsPresentationContent(publishedDestinationsPresentation), {});

  // Editorial: invalid point ID
  const corruptEditorial = structuredClone(publishedDestinationsEditorial);
  corruptEditorial.destinations[0]!.goodToKnow[0]!.id = "INVALID_SLUG!";
  const edErrors = validateDestinationsEditorialContent(corruptEditorial);
  assert.equal(edErrors[`dst-ed-${corruptEditorial.destinations[0]!.code}-pt-INVALID_SLUG!-id`], "cms.err.invalidPointId");

  // Presentation: out of range focal point
  const corruptPresentation = structuredClone(publishedDestinationsPresentation);
  corruptPresentation.assignments[0]!.focalPoint = { x: 150, y: 50 };
  const presErrors = validateDestinationsPresentationContent(corruptPresentation);
  assert.equal(presErrors[`dst-pres-${corruptPresentation.assignments[0]!.code}-focal`], "cms.err.invalidFocalPoint");
});

test("cms validation — Informational pages validator", () => {
  assert.deepEqual(validateInformationPagesContent(publishedInformationPages), {});

  // Invalid block ID
  const corruptPages = structuredClone(publishedInformationPages);
  corruptPages.pages[0]!.blocks[0]!.id = "INVALID BLOCK ID";
  const pgErrors = validateInformationPagesContent(corruptPages);
  assert.equal(pgErrors["pg-about-blk-INVALID BLOCK ID-id"], "cms.err.invalidBlockId");

  // Empty page title
  corruptPages.pages[0]!.title.en = "";
  const titleErrors = validateInformationPagesContent(corruptPages);
  assert.equal(titleErrors["pg-about-title-en"], "cms.err.required");
});

test("cms repository — Destinations and Pages draft lifecycles", async () => {
  const storage = createMockStorage();
  const repo = new LocalContentRepository(storage);

  // 1. Destinations editorial draft
  const updatedEditorial = structuredClone(publishedDestinationsEditorial) as DestinationsEditorialContent;
  updatedEditorial.destinations[0]!.blurb.en = "Updated Amman editorial narrative.";
  await repo.saveDraft("destinations.editorial", updatedEditorial);
  const edDraft = await repo.getDraft("destinations.editorial");
  assert.ok(edDraft);
  assert.equal(edDraft.destinations[0]!.blurb.en, "Updated Amman editorial narrative.");
  assert.equal(edDraft.destinations[0]!.blurb.ar, publishedDestinationsEditorial.destinations[0]!.blurb.ar);
  await repo.discardDraft("destinations.editorial");
  assert.equal(await repo.getDraft("destinations.editorial"), null);

  // 2. Destinations presentation draft
  const updatedPresentation = structuredClone(publishedDestinationsPresentation) as DestinationsPresentationContent;
  updatedPresentation.assignments[0]!.focalPoint = { x: 25, y: 75 };
  await repo.saveDraft("destinations.presentation", updatedPresentation);
  const presDraft = await repo.getDraft("destinations.presentation");
  assert.ok(presDraft);
  assert.deepEqual(presDraft.assignments[0]!.focalPoint, { x: 25, y: 75 });
  await repo.discardDraft("destinations.presentation");
  assert.equal(await repo.getDraft("destinations.presentation"), null);

  // 3. Informational pages draft
  const updatedPages = structuredClone(publishedInformationPages) as InformationalPagesContent;
  updatedPages.pages[0]!.title.en = "About Our Gaza Gateway";
  await repo.saveDraft("pages.information", updatedPages);
  const pgDraft = await repo.getDraft("pages.information");
  assert.ok(pgDraft);
  assert.equal(pgDraft.pages[0]!.title.en, "About Our Gaza Gateway");
  await repo.discardDraft("pages.information");
  assert.equal(await repo.getDraft("pages.information"), null);
});
