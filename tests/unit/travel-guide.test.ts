import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { publishedTravel } from "../../src/content/published/travel.ts";
import { validateTravelContent } from "../../src/components/admin/cms/cms-validation.ts";
import type { TravelContent, TravelGuideSection } from "../../src/content/types.ts";
import {
  normalizeTravelSections,
  resolveActiveSection,
  estimateReadTime,
  getTravelSectionMeta,
  getSectionSummaryFacts,
  getSectionFaqs,
  getSectionActions,
} from "../../src/components/travel-guide/travel-helpers.ts";

describe("Travel Guide Redesign — Unit & Behavioral Invariant Tests", () => {
  describe("Section Normalization (normalizeTravelSections)", () => {
    it("filters out invisible sections and invisible points while preserving exact order", () => {
      const mockSections: TravelGuideSection[] = [
        {
          id: "sec-1",
          visible: true,
          title: { en: "Section 1", ar: "القسم 1" },
          body: { en: "Body 1", ar: "النص 1" },
          points: [
            { id: "pt-1a", text: { en: "Point 1A", ar: "نقطة 1أ" }, visible: true },
            { id: "pt-1b", text: { en: "Point 1B", ar: "نقطة 1ب" }, visible: false },
          ],
        },
        {
          id: "sec-2",
          visible: false,
          title: { en: "Hidden Section", ar: "قسم مخفي" },
          body: { en: "Hidden body", ar: "نص مخفي" },
          points: [{ id: "pt-2a", text: { en: "Point 2A", ar: "نقطة 2أ" }, visible: true }],
        },
        {
          id: "sec-3",
          visible: true,
          title: { en: "Section 3", ar: "القسم 3" },
          body: { en: "Body 3", ar: "النص 3" },
          points: [
            { id: "pt-3a", text: { en: "Point 3A", ar: "نقطة 3أ" }, visible: false },
            { id: "pt-3b", text: { en: "Point 3B", ar: "نقطة 3ب" }, visible: true },
          ],
        },
      ];

      const normalized = normalizeTravelSections(mockSections);
      assert.equal(normalized.length, 2);
      assert.equal(normalized[0]?.id, "sec-1");
      assert.equal(normalized[1]?.id, "sec-3");
      assert.equal(normalized[0]?.points.length, 1);
      assert.equal(normalized[0]?.points[0]?.id, "pt-1a");
      assert.equal(normalized[1]?.points.length, 1);
      assert.equal(normalized[1]?.points[0]?.id, "pt-3b");
    });

    it("handles empty or malformed section lists safely", () => {
      assert.deepEqual(normalizeTravelSections([]), []);
      assert.deepEqual(normalizeTravelSections(null as unknown as TravelGuideSection[]), []);
      assert.deepEqual(normalizeTravelSections(undefined as unknown as TravelGuideSection[]), []);
    });
  });

  describe("Active Section Deep-Link Resolution (resolveActiveSection)", () => {
    const sections = [
      { id: "prepare", visible: true },
      { id: "documents", visible: true },
      { id: "baggage", visible: false }, // hidden section
      { id: "airport", visible: true },
      { id: "accessibility", visible: true },
    ];

    it("prioritizes query param over hash when query is valid", () => {
      assert.equal(resolveActiveSection(sections, "airport", "prepare"), "airport");
      assert.equal(resolveActiveSection(sections, "documents", "#airport"), "documents");
    });

    it("falls back to hash when query param is absent or points to hidden/invalid section", () => {
      assert.equal(resolveActiveSection(sections, "baggage", "#airport"), "airport");
      assert.equal(resolveActiveSection(sections, "nonexistent", "#/accessibility"), "accessibility");
      assert.equal(resolveActiveSection(sections, null, "#documents"), "documents");
      assert.equal(resolveActiveSection(sections, "", "airport"), "airport");
    });

    it("falls back to first visible section when both query and hash are missing or invalid", () => {
      assert.equal(resolveActiveSection(sections, null, null), "prepare");
      assert.equal(resolveActiveSection(sections, "", ""), "prepare");
      assert.equal(resolveActiveSection(sections, "unknown", "#hidden"), "prepare");
    });

    it("returns empty string when no sections are visible", () => {
      const allHidden = [
        { id: "one", visible: false },
        { id: "two", visible: false },
      ];
      assert.equal(resolveActiveSection(allHidden, "one", "one"), "");
      assert.equal(resolveActiveSection([], "one", "one"), "");
    });
  });

  describe("Dynamic Reading Time (estimateReadTime)", () => {
    it("derives reading time proportionally to word count", () => {
      const shortText = "This is a short paragraph of text.";
      assert.equal(estimateReadTime(shortText, "en"), "1 min read");
      assert.equal(estimateReadTime(shortText, "ar"), "1 دقيقة قراءة");

      const longText = Array(350).fill("word").join(" ");
      assert.equal(estimateReadTime(longText, "en"), "3 min read");
      assert.equal(estimateReadTime(longText, "ar"), "3 دقيقة قراءة");
    });
  });

  describe("Section Metadata & Derived Fields (getTravelSectionMeta)", () => {
    it("returns correct journey progression step numbers and derived read-time", () => {
      const prepSection = publishedTravel.sections[0]!;
      const prepMeta = getTravelSectionMeta(prepSection, "en");
      assert.equal(prepMeta.stepNumber, "01");
      assert.equal(prepMeta.category, "planning");
      assert.equal(prepMeta.iconType, "compass");
      assert.ok(prepMeta.readTime.includes("min read"));

      const bagSection = publishedTravel.sections[2]!;
      const bagMeta = getTravelSectionMeta(bagSection, "en");
      assert.equal(bagMeta.stepNumber, "03");
      assert.equal(bagMeta.category, "specifications");
      assert.equal(bagMeta.stageLabel, "Step 03 · Ticket & Reference");
    });

    it("provides graceful fallback for arbitrary CMS sections", () => {
      const customSection: TravelGuideSection = {
        id: "custom-faq",
        visible: true,
        title: { en: "FAQ", ar: "أسئلة" },
        body: { en: "Custom body", ar: "نص مخصص" },
        points: [],
      };
      const customMeta = getTravelSectionMeta(customSection, "en");
      assert.equal(customMeta.stepNumber, "•");
      assert.equal(customMeta.iconType, "help-circle");
      assert.equal(customMeta.category, "general");
    });
  });

  describe("Authentic Feature Summary Facts (getSectionSummaryFacts)", () => {
    it("derives facts from real memorial platform features without operational claims", () => {
      const docFactsEn = getSectionSummaryFacts("documents", "en");
      assert.equal(docFactsEn.length, 3);
      // Confirms contract fields are accurately described
      assert.equal(docFactsEn[0]?.value, "Name & Email");
      assert.equal(docFactsEn[1]?.value, "Optional for Guests");
      assert.ok(docFactsEn[2]?.value.includes("6-Digit Code"));

      const bagFactsEn = getSectionSummaryFacts("baggage", "en");
      assert.equal(bagFactsEn.length, 3);
      assert.equal(bagFactsEn[0]?.value, "Route, Seat & Ref");
      assert.equal(bagFactsEn[2]?.value, "$0.00 Free");

      // Verify NO fake boarding times or operational claims in facts
      for (const fact of bagFactsEn) {
        assert.ok(!fact.value.toLowerCase().includes("boarding"));
        assert.ok(!fact.value.toLowerCase().includes("gate"));
        assert.ok(!fact.value.toLowerCase().includes("escort"));
      }
    });

    it("returns empty array for unknown section IDs", () => {
      assert.deepEqual(getSectionSummaryFacts("unknown", "en"), []);
    });
  });

  describe("Authentic Section FAQs (getSectionFaqs)", () => {
    it("provides meaningful Q&A for every standard section in English and Arabic", () => {
      const sectionIds = ["prepare", "documents", "baggage", "airport", "accessibility"];
      for (const id of sectionIds) {
        const faqsEn = getSectionFaqs(id, "en");
        const faqsAr = getSectionFaqs(id, "ar");

        assert.ok(faqsEn.length >= 2, `Expected at least 2 FAQs for ${id} (EN)`);
        assert.ok(faqsAr.length >= 2, `Expected at least 2 FAQs for ${id} (AR)`);

        for (const f of faqsEn) {
          assert.ok(f.question.trim().length > 10, "FAQ question should be substantive");
          assert.ok(f.answer.trim().length > 20, "FAQ answer should be informative");
        }
        for (const f of faqsAr) {
          assert.ok(f.question.trim().length > 10, "Arabic FAQ question should be substantive");
          assert.ok(f.answer.trim().length > 20, "Arabic FAQ answer should be informative");
        }
      }
    });

    it("explains document references without misrepresenting collection contract", () => {
      const docFaqs = getSectionFaqs("documents", "en");
      const docVerificationFaq = docFaqs.find((f) => f.id === "doc-faq-1");
      assert.ok(docVerificationFaq);
      assert.ok(docVerificationFaq.answer.includes("document reference"));
      assert.ok(docVerificationFaq.answer.includes("passenger booking record"));
      assert.ok(docVerificationFaq.answer.includes("does not validate travel documents or visas"));
    });
  });

  describe("Contextual Action Links (getSectionActions)", () => {
    it("returns actionable real site links for each section without dead ends", () => {
      const validAppRoutes = new Set(["/flights", "/book", "/manage", "/airport/past", "/contact"]);

      const sectionIds = ["prepare", "documents", "baggage", "airport", "accessibility"];
      for (const id of sectionIds) {
        const actions = getSectionActions(id, "en");
        assert.ok(actions.length >= 1);
        for (const act of actions) {
          assert.ok(validAppRoutes.has(act.to), `Route ${act.to} must be a known application route`);
          assert.ok(act.label.trim().length > 0);
        }
      }
    });
  });

  describe("Published Travel Content Integrity & Historical Rigor", () => {
    it("validates publishedTravel baseline with CMS validator with zero errors", () => {
      const errors = validateTravelContent(publishedTravel as TravelContent);
      assert.deepEqual(errors, {});
    });

    it("contains all 5 canonical sections with visible: true and retained IDs", () => {
      assert.equal(publishedTravel.sections.length, 5);
      const expectedIds = ["prepare", "documents", "baggage", "airport", "accessibility"];
      const actualIds = publishedTravel.sections.map((s) => s.id);
      assert.deepEqual(actualIds, expectedIds);
      assert.ok(publishedTravel.sections.every((s) => s.visible === true));
    });

    it("accurately names baggage section as Your ticket & booking reference", () => {
      const baggage = publishedTravel.sections.find((s) => s.id === "baggage");
      assert.ok(baggage);
      assert.equal(baggage.title.en, "Your ticket & booking reference");
      assert.equal(baggage.title.ar, "تذكرتك ورمز الحجز");
    });

    it("accurately reflects backend form contract fields in documents section", () => {
      const docs = publishedTravel.sections.find((s) => s.id === "documents");
      assert.ok(docs);
      assert.ok(docs.body.en.includes("passenger name and a verified email"));
      assert.ok(docs.body.en.includes("optional"));
      assert.ok(docs.points.some((p) => p.text.en.includes("document reference blank")));
      assert.ok(docs.points.some((p) => p.text.en.includes("6-digit code")));
    });

    it("contains valid bilingual text for all titles, bodies, and points without empty strings", () => {
      for (const sec of publishedTravel.sections) {
        assert.ok(sec.title.en.trim().length > 0);
        assert.ok(sec.title.ar.trim().length > 0);
        assert.ok(sec.body.en.trim().length > 0);
        assert.ok(sec.body.ar.trim().length > 0);
        assert.equal(sec.points.length, 3, "Each standard section should retain 3 canonical points");
        for (const pt of sec.points) {
          assert.ok(pt.text.en.trim().length > 0);
          assert.ok(pt.text.ar.trim().length > 0);
          assert.equal(pt.visible, true);
        }
      }
    });
  });
});
