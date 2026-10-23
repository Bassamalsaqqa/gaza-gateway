import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { publishedInformationPages } from "../../src/content/published/information-pages.ts";
import { privacySections, termsSections, aboutSections } from "../../src/content/published/information-sections.ts";
import { publishedHome } from "../../src/content/published/home.ts";

describe("October 23 Editorial Narrative & Identity Truth", () => {
  it("publishedInformationPages contains all 4 required information pages with valid SEO", () => {
    assert.equal(publishedInformationPages.pages.length, 4);
    const pageIds = publishedInformationPages.pages.map((p) => p.id);
    assert.deepEqual(pageIds, ["about", "contact", "privacy", "terms"]);
  });

  it("about page features credited artist statement and stable CMS block IDs", () => {
    const aboutPage = publishedInformationPages.pages.find((p) => p.id === "about");
    assert.ok(aboutPage, "About page must exist");
    assert.match(aboutPage.title.en, /Gaza International Airport/);
    assert.match(aboutPage.description.en, /Ayman Alazraq/);

    const blockIds = aboutPage.blocks.map((b) => b.id);
    const expectedStatementIds = [
      "about-statement-origin",
      "about-statement-response",
      "about-statement-forward",
      "about-statement-archive",
      "about-statement-how",
    ];
    for (const expectedId of expectedStatementIds) {
      assert.ok(blockIds.includes(expectedId), `Missing statement block ID: ${expectedId}`);
    }

    assert.ok(blockIds.includes("about-history-context"), "Missing history context block ID");
    assert.ok(blockIds.includes("about-conceptual-network"), "Missing conceptual network block ID");
    assert.ok(blockIds.includes("about-material"), "Missing material block ID");
  });

  it("preserves artist original English political and emotional voice in statement", () => {
    const originBlock = aboutSections.find((s) => s.id === "about-statement-origin");
    assert.ok(originBlock);
    const originText = originBlock.body.map((b) => b.en).join(" ");
    assert.match(originText, /In 2009 I launched gazaairport\.com/);
    assert.match(originText, /Open Academy in 2008/);

    const responseBlock = aboutSections.find((s) => s.id === "about-statement-response");
    assert.ok(responseBlock);
    const responseText = responseBlock.body.map((b) => b.en).join(" ");
    assert.match(responseText, /genocide is taking place now/i);
    assert.match(responseText, /The airport that never fully carried passengers now stands as a symbol of what was taken/);

    const forwardBlock = aboutSections.find((s) => s.id === "about-statement-forward");
    assert.ok(forwardBlock);
    const forwardText = forwardBlock.body.map((b) => b.en).join(" ");
    assert.match(forwardText, /We will keep imagining our future\. We will rebuild Gaza\./);
    assert.match(forwardText, /Every ticket is a small act of refusal against erasure\./);
  });

  it("distinguishes historical Palestinian Airlines from Palestine Airways Limited art concept", () => {
    const historyBlock = aboutSections.find((s) => s.id === "about-history-context");
    assert.ok(historyBlock);
    const historyText = historyBlock.body.map((b) => b.en).join(" ");
    assert.match(historyText, /Palestinian Airlines/);
    assert.match(historyText, /Palestinian Central Bureau of Statistics/);
    assert.match(historyText, /briefly carried passengers.*never fulfilled.*promise/);

    const conceptBlock = aboutSections.find((s) => s.id === "about-conceptual-network");
    assert.ok(conceptBlock);
    const conceptText = conceptBlock.body.map((b) => b.en).join(" ");
    assert.match(conceptText, /Palestine Airways Limited/);
    assert.match(conceptText, /art installation at the Open Academy in 2008/);
    assert.match(conceptText, /do not describe an active commercial carrier/);
  });

  it("privacy notice truthfully reflects installed backend, OTP, private archive, and opt-in telemetry", () => {
    const privacyText = privacySections.flatMap((s) => s.body).map((b) => b.en).join(" ");
    // Truthful backend bookings
    assert.match(privacyText, /backend database/i);
    // Secure verification
    assert.match(privacyText, /email verification code/i);
    // Private curatorial review
    assert.match(privacyText, /private backend storage for curatorial review/i);
    assert.match(privacyText, /never published automatically/i);
    // Opt-in first-party telemetry
    assert.match(privacyText, /only after you allow it/i);
    assert.match(privacyText, /Do Not Track \(DNT\)/);
    // No payment, no commercial transport
    assert.match(privacyText, /No payment is taken/i);
    assert.match(privacyText, /cannot be used for travel/i);
    // No false prototype local-storage claims
    assert.doesNotMatch(privacyText, /prototype has no backend/i);
    assert.doesNotMatch(privacyText, /kept in your own browser's local storage only/i);
  });

  it("terms of use accurately define art project scope and non-commercial flights", () => {
    const termsText = termsSections.flatMap((s) => s.body).map((b) => b.en).join(" ");
    assert.match(termsText, /internet-based art project/i);
    assert.match(termsText, /does not constitute a contract of carriage/i);
    assert.match(termsText, /non-commercial/i);
    assert.match(termsText, /private curatorial review/i);
  });

  it("ensures all block IDs in pages.information are unique valid slugs", () => {
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    const allBlockIds = publishedInformationPages.pages.flatMap((page) =>
      page.blocks.map((block) => block.id)
    );
    for (const id of allBlockIds) {
      assert.match(id, slugRegex, `Block ID "${id}" must be a valid slug`);
    }
    const idSet = new Set(allBlockIds);
    assert.equal(idSet.size, allBlockIds.length, "All block IDs in pages.information must be unique");
  });

  it("removes unsupported verified-provenance claims from home copy", () => {
    const homeArchiveSub = publishedHome.copy.archiveSub.en;
    assert.doesNotMatch(homeArchiveSub, /^Verified documentary records/i);
    assert.match(homeArchiveSub, /Documentary records and external primary sources/i);
  });
});

it("preserves every supplied original English statement paragraph verbatim apart from whitespace", () => {
  const original = readFileSync(new URL("../../docs/editorial-oct23/ARTIST_STATEMENT_SOURCE.md", import.meta.url), "utf8");
  const body = original.split("### Origin (2009)")[1]!;
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  const actual = normalize(aboutSections.filter(s => s.id.startsWith("about-statement-")).flatMap(s => s.body.map(p => p.en)).join(" "));
  const paragraphs = body.replace(/^###.*$/gm, "").split(/\n\s*\n/).map(p => p.trim()).filter(p => p && !p.startsWith("###") && !p.startsWith("*Personal contact"));
  assert.ok(paragraphs.length >= 12);
  for (const paragraph of paragraphs) assert.ok(actual.includes(normalize(paragraph)), "Artist paragraph changed: " + paragraph.slice(0, 70));
});
