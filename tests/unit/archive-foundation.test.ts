/**
 * Gaza Gateway — Archive & Present Content Truth Test Suite (HC-0 / HC-1)
 *
 * Enforces architectural, licensing, and evidentiary invariants:
 * 1. Public selector excludes staging, rights holds, provenance holds, and excluded records.
 * 2. Duplicate past-052 is never an independent published record from past-050.
 * 3. Future concepts cannot enter documentary Past/Present context; decorative skins are not documentary MEDIA IDs.
 * 4. Published photos require rights metadata, verified records resolving nonempty sourceRefs, bilingual title/caption/alt.
 * 5. Unique SourceRecord IDs, valid URLs, and resolving published fact refs.
 * 6. Distinct Nov 24 opening and Dec 14 Clinton event IDs and dates (Journeyman held).
 * 7. Dated 2008 hero has date context and cannot be called today.
 * 8. New Present content and schema preserves sibling existing drafts and normal route preview immunity.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ARCHIVE_CATALOG,
  getPublishedArchiveRecords,
  getArchiveRecordById,
  getArchiveRecordBySlug,
  getIntakeArchiveRecords,
} from "../../src/lib/archive/catalog.ts";
import type { ArchiveRecord } from "../../src/lib/archive/types.ts";
import { SOURCE_REGISTRY, getAllSourceRecords } from "../../src/lib/archive/sources.ts";
import { archiveRecordSchema, sourceRecordSchema } from "../../src/lib/archive/schema.ts";
import {
  APPROVED_MEDIA_CATALOG,
  TARGET_ALLOWED_TRUTH_CLASSES,
} from "../../src/lib/media-policy.ts";
import { en, ar } from "../../src/lib/i18n-public.ts";
import {
  isContentKey,
  isValidContent,
} from "../../src/content/schema.ts";
import { publishedAirportPresent } from "../../src/content/published/airport-present.ts";
import { publishedAirportPast } from "../../src/content/published/airport-past.ts";
import { publishedHome } from "../../src/content/published/home.ts";
import { publishedTravel } from "../../src/content/published/travel.ts";
import { LocalContentRepository } from "../../src/content/repository.ts";

const mediaSource = readFileSync(new URL("../../src/lib/media.ts", import.meta.url), "utf8");

describe("HC-0 / HC-1 Archive & Present Foundation Invariants", () => {
  // Test 1: Public selector excludes staging, rights holds, provenance holds, excluded
  it("1. Public selector returns ONLY published records and strictly excludes staging and holds", () => {
    const published = getPublishedArchiveRecords();
    assert.ok(published.length > 0, "Must have at least one published record");

    for (const record of published) {
      assert.equal(
        record.publicationState,
        "published",
        `Record ${record.id} in published list has non-published state ${record.publicationState}`,
      );
    }

    const nonPublishedInCatalog = ARCHIVE_CATALOG.filter(
      (r) => r.publicationState !== "published",
    );
    assert.ok(nonPublishedInCatalog.length > 0, "Catalog must retain staged/held records");

    for (const held of nonPublishedInCatalog) {
      assert.ok(
        !published.some((p) => p.id === held.id),
        `Held/staged record ${held.id} (${held.publicationState}) leaked into published records`,
      );
    }
  });

  // Test 2: Duplicate past-052 never independent published record from past-050
  it("2. Duplicate past-052 is an alias of past-050 and is excluded from independent publication", () => {
    const rec52 = getArchiveRecordById("past-052", true);
    assert.ok(rec52, "past-052 must exist in archive intake catalog");
    assert.equal(rec52.duplicateOf, "past-050", "past-052 must reference past-050 as canonical");
    assert.equal(rec52.publicationState, "excluded", "past-052 must be excluded from publication");

    const published = getPublishedArchiveRecords();
    assert.ok(
      !published.some((r) => r.id === "past-052"),
      "past-052 must never be independently published",
    );
  });

  // Test 3: Future concepts cannot enter documentary Past/Present context; decorative skins aren't documentary MEDIA IDs
  it("3. Future concepts cannot enter documentary context, and decorative skins are not in MEDIA catalog", () => {
    const allowed = TARGET_ALLOWED_TRUTH_CLASSES["airport.chapter-card"];
    assert.ok(allowed, "airport.chapter-card target policy must exist");
    assert.ok(
      !allowed.includes("future-concept-ai"),
      "airport.chapter-card must strictly prohibit future-concept-ai",
    );
    assert.ok(
      allowed.includes("historical-documentary"),
      "airport.chapter-card must permit historical-documentary",
    );

    // Decorative skins must remain outside the evidentiary media catalog
    const decorativeSkinNames = [
      "fact-location",
      "fact-aero-codes",
      "fact-operating-period",
      "fact-facility-status",
      "dossier-boundaries",
      "dossier-runway",
      "dossier-verification",
      "spatial-geometry",
      "global-network",
    ];

    for (const skin of decorativeSkinNames) {
      assert.ok(
        !(skin in APPROVED_MEDIA_CATALOG),
        `Decorative skin ${skin} must NOT be in APPROVED_MEDIA_CATALOG`,
      );
      assert.ok(
        !mediaSource.includes(`"${skin}":`),
        `Decorative skin ${skin} must NOT be in MEDIA registry`,
      );
    }
  });

  // Test 4: Published photos require rights metadata, verified records resolving nonempty sourceRefs, bilingual title/caption/alt
  it("4. Published photos require rights metadata, verified records resolve sourceRefs, and all have bilingual copy", () => {
    const published = getPublishedArchiveRecords();

    for (const record of published) {
      // Validate schema
      const parseResult = archiveRecordSchema.safeParse(record);
      assert.ok(
        parseResult.success,
        `Record ${record.id} failed schema validation: ${JSON.stringify(parseResult.error?.issues)}`,
      );

      // Bilingual text
      assert.ok(record.title.en.trim().length > 0, `${record.id} missing title.en`);
      assert.ok(record.title.ar.trim().length > 0, `${record.id} missing title.ar`);
      assert.ok(record.caption.en.trim().length > 0, `${record.id} missing caption.en`);
      assert.ok(record.caption.ar.trim().length > 0, `${record.id} missing caption.ar`);
      assert.ok(record.alt.en.trim().length > 0, `${record.id} missing alt.en`);
      assert.ok(record.alt.ar.trim().length > 0, `${record.id} missing alt.ar`);

      if (record.medium === "photograph") {
        assert.notEqual(record.rights.status, "unknown", `${record.id} photo cannot have unknown rights`);
        assert.ok(
          record.rights.license || record.rights.credit,
          `${record.id} photo must provide license or credit`,
        );
      }

      if (record.evidenceStatus === "verified") {
        assert.ok(record.sourceRefs.length > 0, `${record.id} verified record must cite sourceRefs`);
        for (const ref of record.sourceRefs) {
          assert.ok(
            SOURCE_REGISTRY[ref],
            `${record.id} cites unresolved sourceRef: ${ref}`,
          );
        }
      }
    }
  });

  // Test 5: Unique SourceRecord IDs, valid URLs, resolving fact refs
  it("5. Unique SourceRecord IDs, valid URLs, and resolving published fact refs", () => {
    const sources = getAllSourceRecords();
    const ids = new Set<string>();

    for (const src of sources) {
      assert.ok(!ids.has(src.id), `Duplicate SourceRecord ID: ${src.id}`);
      ids.add(src.id);
      const schemaResult = sourceRecordSchema.safeParse(src);
      assert.ok(
        schemaResult.success,
        `SourceRecord ${src.id} failed sourceRecordSchema: ${JSON.stringify(schemaResult.error?.issues)}`,
      );
      assert.match(src.url, /^https?:\/\//, `SourceRecord ${src.id} has invalid URL: ${src.url}`);
    }

    // Also assert every entry in the raw SOURCE_REGISTRY dictionary parses cleanly
    for (const [key, src] of Object.entries(SOURCE_REGISTRY)) {
      const result = sourceRecordSchema.safeParse(src);
      assert.ok(
        result.success,
        `SOURCE_REGISTRY[${key}] failed sourceRecordSchema: ${JSON.stringify(result.error?.issues)}`,
      );
    }

    // Verify all sourceRefs in publishedAirportPresent resolve
    const presentSources = [
      ...publishedAirportPresent.facts.flatMap((f) => f.sourceRefs),
      ...publishedAirportPresent.dossiers.flatMap((d) => d.sourceRefs),
      ...publishedAirportPresent.spatial.sourceRefs,
    ];

    assert.ok(presentSources.length > 0, "Present content must cite sources");
    for (const ref of presentSources) {
      assert.ok(
        SOURCE_REGISTRY[ref],
        `publishedAirportPresent cites unresolved sourceRef: ${ref}`,
      );
    }
  });

  // Test 6: Distinct Nov 24 opening and Dec 14 Clinton event IDs and dates
  it("6. Nov 24, 1998 opening and Dec 14, 1998 Clinton visit are distinct events; Journeyman video is held", () => {
    const openingSrc = SOURCE_REGISTRY["src-ap-1998-opening"];
    const clintonSrc = SOURCE_REGISTRY["src-ap-1998-clinton"];

    assert.ok(openingSrc, "src-ap-1998-opening must exist");
    assert.ok(clintonSrc, "src-ap-1998-clinton must exist");
    assert.equal(openingSrc.publicationDate, "1998-11-25", "NYTimes report was published Nov 25, 1998");
    assert.equal(openingSrc.eventDate, "1998-11-24", "Commercial opening was Nov 24, 1998");
    assert.equal(clintonSrc.publicationDate, "1998-12-15", "Washington Post report was published Dec 15, 1998");
    assert.equal(clintonSrc.eventDate, "1998-12-14", "Clinton ribbon dedication was Dec 14, 1998");
    assert.notEqual(openingSrc.id, clintonSrc.id, "Events must be distinct");

    // Video 7 (Journeyman) must be held due to incorrect Nov 2 date claim
    const vid7 = getArchiveRecordById("vid-journeyman-2002", true);
    assert.ok(vid7, "vid-journeyman-2002 must be in catalog");
    assert.equal(
      vid7.publicationState,
      "hold-provenance",
      "Journeyman video must be held from publication for fact checking",
    );
    assert.match(
      vid7.factCheckNotes ?? "",
      /November 2, 1998/,
      "Must document the held November 2 date claim",
    );
  });

  // Test 7: Dated 2008 hero has date context and cannot be called today
  it("7. Dated 2008 hero has explicit date context and cannot claim to depict today", () => {
    assert.equal(
      APPROVED_MEDIA_CATALOG["airport-present-ruins-2008"],
      "historical-documentary",
    );
    assert.ok(
      mediaSource.includes('"airport-present-ruins-2008"'),
      "airport-present-ruins-2008 must exist in media.ts",
    );

    const altEnMatch = mediaSource.match(/"airport-present-ruins-2008"[\s\S]*?altEn:\s*"([^"]+)"/);
    const altArMatch = mediaSource.match(/"airport-present-ruins-2008"[\s\S]*?altAr:\s*"([^"]+)"/);
    assert.ok(altEnMatch, "Must define altEn");
    assert.ok(altArMatch, "Must define altAr");
    const altEn = altEnMatch[1];
    const altAr = altArMatch[1];

    // Alt text must mention 2008 and never claim to be today
    assert.match(altEn, /2008/);
    assert.match(altAr, /2008/);
    assert.ok(!altEn.toLowerCase().includes("today"), "Must not claim 2008 photo is today");
    assert.ok(!altEn.toLowerCase().includes("current photo"), "Must not claim 2008 photo is current");

    // Hero archive context label must exist in i18n
    const enLabel = en["media.archive2008Label"];
    const arLabel = ar["media.archive2008Label"];
    assert.ok(enLabel, "media.archive2008Label must exist in English");
    assert.ok(arLabel, "media.archive2008Label must exist in Arabic");
    assert.match(enLabel, /June 2008/, "EN label must indicate June 2008");
    assert.match(arLabel, /2008/, "AR label must include 2008 Western digits");
    assert.match(arLabel, /يونيو\/حزيران/, "AR label must include June in Arabic");
  });

  // Test 8: New Present content and schema preserves sibling existing drafts and normal route preview immunity
  it("8. Present content validates, preserves sibling drafts, and maintains preview immunity", async () => {
    assert.ok(isContentKey("airport.present"), "airport.present must be a recognized ContentKey");
    assert.ok(isValidContent("airport.present", publishedAirportPresent), "publishedAirportPresent must be valid");

    // Sibling schemas must remain valid
    assert.ok(isValidContent("home", publishedHome), "home must remain valid");
    assert.ok(isValidContent("travel", publishedTravel), "travel must remain valid");
    assert.ok(isValidContent("airport.past", publishedAirportPast), "airport.past must remain valid");

    // Mock storage test for LocalContentRepository
    const store = new Map<string, string>();
    const mockStorage: Storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    };

    const repo = new LocalContentRepository(mockStorage);

    // Initial state: published returned
    const initial = await repo.getPublished("airport.present");
    assert.equal(initial.id, "airport.present");

    // Normal getPublished ignores drafts
    await repo.saveDraft("airport.present", {
      ...publishedAirportPresent,
      intro: {
        ...publishedAirportPresent.intro,
        title: { en: "Draft Title", ar: "عنوان مسودة" },
      },
    });

    // Preview sees draft
    const preview = await repo.getPreview("airport.present");
    assert.equal(preview.intro.title.en, "Draft Title");

    // Published remains untouched
    const publishedAfterDraft = await repo.getPublished("airport.present");
    assert.equal(publishedAfterDraft.intro.title.en, publishedAirportPresent.intro.title.en);

    // Sibling draft isolation: draft storage contains airport.present, but other keys remain null
    const pastDraft = await repo.getDraft("airport.past");
    assert.equal(pastDraft, null, "airport.past draft must remain unaffected");

    // Discarding draft
    await repo.discardDraft("airport.present");
    const previewAfterDiscard = await repo.getPreview("airport.present");
    assert.equal(previewAfterDiscard.intro.title.en, publishedAirportPresent.intro.title.en);
  });

  // Test 9: Archive Record Schema Negative Probes (Direct reproduction of Codex findings)
  it("9. Archive record schema rejects future-hero mediaId, published duplicates, unpermitted rights, whitespace alt, and unknown dates for published records", () => {
    const publishedSample = getPublishedArchiveRecords()[0];
    assert.ok(publishedSample, "Must have a published record sample");

    // 9a. Reject future-concept in documentary mediaId
    const futureHeroProbe = {
      ...publishedSample,
      id: "probe-future-hero",
      slug: "probe-future-hero",
      mediaId: "future-hero",
    };
    const futureHeroResult = archiveRecordSchema.safeParse(futureHeroProbe);
    assert.equal(futureHeroResult.success, false, "Must reject future-hero mediaId in documentary record");
    assert.ok(
      futureHeroResult.error?.issues.some((i) => i.path.includes("mediaId")),
      "Must flag mediaId issue for future-hero",
    );

    // 9b. Reject duplicateOf with publicationState: "published"
    const duplicatePublishedProbe = {
      ...publishedSample,
      id: "probe-duplicate-published",
      slug: "probe-duplicate-published",
      duplicateOf: "past-050",
      publicationState: "published",
    };
    const dupResult = archiveRecordSchema.safeParse(duplicatePublishedProbe);
    assert.equal(dupResult.success, false, "Must reject published duplicate record");
    assert.ok(
      dupResult.error?.issues.some((i) => i.path.includes("publicationState")),
      "Must flag publicationState issue for duplicate published record",
    );

    // 9c. Reject rights-managed or unknown on published records
    const rightsManagedProbe = {
      ...publishedSample,
      id: "probe-rights-managed",
      slug: "probe-rights-managed",
      rights: { status: "rights-managed", credit: "AFP" },
    };
    const rmResult = archiveRecordSchema.safeParse(rightsManagedProbe);
    assert.equal(rmResult.success, false, "Must reject rights-managed status on published record");

    const unknownRightsProbe = {
      ...publishedSample,
      id: "probe-unknown-rights",
      slug: "probe-unknown-rights",
      rights: { status: "unknown" },
    };
    const unkResult = archiveRecordSchema.safeParse(unknownRightsProbe);
    assert.equal(unkResult.success, false, "Must reject unknown rights status on published record");

    // 9d. Reject whitespace-only alt text
    const whitespaceAltProbe = {
      ...publishedSample,
      id: "probe-whitespace-alt",
      slug: "probe-whitespace-alt",
      alt: { en: "   ", ar: "   " },
    };
    const wsResult = archiveRecordSchema.safeParse(whitespaceAltProbe);
    assert.equal(wsResult.success, false, "Must reject whitespace-only alt text");

    // 9e. Allow datePrecision="unknown" and omitted date on staging records, but reject on published records
    const stagingUnknownDate = {
      ...publishedSample,
      id: "probe-staging-unknown-date",
      slug: "probe-staging-unknown-date",
      publicationState: "staging",
      date: undefined,
      datePrecision: "unknown",
      rights: { status: "unknown" },
      evidenceStatus: "unverified",
      sourceRefs: [],
    };
    const stagingResult = archiveRecordSchema.safeParse(stagingUnknownDate);
    assert.equal(stagingResult.success, true, "Staging intake record must allow unknown date precision");

    const publishedUnknownDate = {
      ...publishedSample,
      id: "probe-published-unknown-date",
      slug: "probe-published-unknown-date",
      datePrecision: "unknown",
    };
    const pubDateResult = archiveRecordSchema.safeParse(publishedUnknownDate);
    assert.equal(pubDateResult.success, false, "Published record must reject unknown date precision");

    // 9f. Reject empty owner-cleared rights
    const emptyOwnerCleared = {
      ...publishedSample,
      id: "probe-empty-owner-cleared",
      slug: "probe-empty-owner-cleared",
      rights: { status: "owner-cleared" },
    };
    const emptyOwnerResult = archiveRecordSchema.safeParse(emptyOwnerCleared);
    assert.equal(emptyOwnerResult.success, false, "Must reject empty owner-cleared rights");

    // 9g. Reject empty public-domain rights
    const emptyPublicDomain = {
      ...publishedSample,
      id: "probe-empty-public-domain",
      slug: "probe-empty-public-domain",
      rights: { status: "public-domain" },
    };
    const emptyPdResult = archiveRecordSchema.safeParse(emptyPublicDomain);
    assert.equal(emptyPdResult.success, false, "Must reject empty public-domain rights");

    // 9h. Reject whitespace licensed rights
    const whitespaceLicense = {
      ...publishedSample,
      id: "probe-ws-license",
      slug: "probe-ws-license",
      rights: { status: "licensed", license: " ", credit: "Gisha Access" },
    };
    const wsLicenseResult = archiveRecordSchema.safeParse(whitespaceLicense);
    assert.equal(wsLicenseResult.success, false, "Must reject whitespace license string");

    const whitespaceCredit = {
      ...publishedSample,
      id: "probe-ws-credit",
      slug: "probe-ws-credit",
      rights: { status: "licensed", license: "CC BY-SA 2.0", credit: "   " },
    };
    const wsCreditResult = archiveRecordSchema.safeParse(whitespaceCredit);
    assert.equal(wsCreditResult.success, false, "Must reject whitespace credit string");

    // 9i. Positive validation: current CC photo rights succeed
    const validCcPhoto = {
      ...publishedSample,
      rights: {
        status: "licensed",
        license: "CC BY-SA 2.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
        credit: "Gisha Access",
      },
    };
    assert.equal(archiveRecordSchema.safeParse(validCcPhoto).success, true, "Valid CC photo rights must succeed");

    // 9j. Reject published licensed record with missing, empty, or invalid licenseUrl
    const missingLicenseUrl = {
      ...publishedSample,
      id: "probe-missing-license-url",
      slug: "probe-missing-license-url",
      rights: {
        status: "licensed",
        license: "CC BY-SA 2.0",
        credit: "Gisha Access",
      },
    };
    const missingUrlResult = archiveRecordSchema.safeParse(missingLicenseUrl);
    assert.equal(missingUrlResult.success, false, "Must reject published licensed record without licenseUrl");

    const emptyLicenseUrl = {
      ...publishedSample,
      id: "probe-empty-license-url",
      slug: "probe-empty-license-url",
      rights: {
        status: "licensed",
        license: "CC BY-SA 2.0",
        credit: "Gisha Access",
        licenseUrl: "   ",
      },
    };
    const emptyUrlResult = archiveRecordSchema.safeParse(emptyLicenseUrl);
    assert.equal(emptyUrlResult.success, false, "Must reject published licensed record with empty licenseUrl");

    const invalidLicenseUrl = {
      ...publishedSample,
      id: "probe-invalid-license-url",
      slug: "probe-invalid-license-url",
      rights: {
        status: "licensed",
        license: "CC BY-SA 2.0",
        credit: "Gisha Access",
        licenseUrl: "not-a-url",
      },
    };
    const invalidUrlResult = archiveRecordSchema.safeParse(invalidLicenseUrl);
    assert.equal(invalidUrlResult.success, false, "Must reject published licensed record with non-URL licenseUrl");

    // 9k. Reject published attribution-license record with missing licenseUrl
    const missingAttrLicenseUrl = {
      ...publishedSample,
      id: "probe-missing-attr-license-url",
      slug: "probe-missing-attr-license-url",
      rights: {
        status: "attribution-license",
        license: "CC BY 4.0",
        credit: "Author",
      },
    };
    const missingAttrUrlResult = archiveRecordSchema.safeParse(missingAttrLicenseUrl);
    assert.equal(missingAttrUrlResult.success, false, "Must reject published attribution-license record without licenseUrl");
  });

  // Test 10: Present content schema strictly rejects unresolved sourceRefs
  it("10. Present content schema rejects documents with unresolved sourceRefs", () => {
    const invalidDoc = {
      ...publishedAirportPresent,
      facts: [
        {
          ...publishedAirportPresent.facts[0],
          sourceRefs: ["src-nonexistent-fake-source"],
        },
        ...publishedAirportPresent.facts.slice(1),
      ],
    };
    const valid = isValidContent("airport.present", invalidDoc);
    assert.equal(valid, false, "Must reject airport.present content with unresolved sourceRefs");
  });

  // Test 11: Independent sibling draft recovery and preservation when Present is malformed
  it("11. LocalContentRepository recovers valid sibling drafts independently and preserves raw sibling data when airport.present is malformed", async () => {
    const store = new Map<string, string>();
    const mockStorage: Storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    };

    // Seed storage with valid Home draft PLUS malformed airport.present draft
    const seededPayload = {
      schemaVersion: 1,
      drafts: {
        home: publishedHome,
        "airport.present": {
          id: "airport.present",
          kind: "airport.present",
          schemaVersion: 1,
          malformedData: true, // missing required fields
        },
      },
    };
    mockStorage.setItem("gza.content.draft.v1", JSON.stringify(seededPayload));

    const repo = new LocalContentRepository(mockStorage);

    // 11a. getDraft("home") MUST succeed and recover valid Home draft (does NOT return null)
    const homeDraft = await repo.getDraft("home");
    assert.ok(homeDraft, "Valid Home draft must be recovered despite malformed sibling airport.present");
    assert.equal(homeDraft.id, "home");

    // 11b. getDraft("airport.present") returns null because it is malformed
    const presentDraft = await repo.getDraft("airport.present");
    assert.equal(presentDraft, null, "Malformed airport.present draft must evaluate to null");

    // 11c. Saving a valid airport.present draft MUST preserve the sibling Home draft
    await repo.saveDraft("airport.present", publishedAirportPresent);

    const rawCommitted = JSON.parse(mockStorage.getItem("gza.content.draft.v1")!);
    assert.ok(rawCommitted.drafts.home, "Home draft must NOT be wiped out when saving airport.present");
    assert.ok(rawCommitted.drafts["airport.present"], "airport.present draft must be saved");

    // 11d. Discarding airport.present MUST NOT wipe out the sibling Home draft
    await repo.discardDraft("airport.present");

    const rawAfterDiscard = JSON.parse(mockStorage.getItem("gza.content.draft.v1")!);
    assert.ok(rawAfterDiscard.drafts.home, "Home draft must survive discard of airport.present");
    assert.equal(rawAfterDiscard.drafts["airport.present"], undefined, "airport.present must be removed");
  });

  // Test 12: Public getters hold immunity (staging and excluded records are inaccessible via public lookups)
  it("12. Public selectors and getters strictly exclude staging and excluded records", () => {
    // past-052 is in intake catalog as excluded
    const publicById = getArchiveRecordById("past-052");
    assert.equal(publicById, undefined, "getArchiveRecordById must NOT return excluded record past-052 by default");

    const publicBySlug = getArchiveRecordBySlug("gaza-airport-past-interior-waiting-area-hall");
    assert.equal(publicBySlug, undefined, "getArchiveRecordBySlug must NOT return excluded record by default");

    // Video 7 (Journeyman) is in catalog as hold-provenance
    const publicVid7 = getArchiveRecordById("vid-journeyman-2002");
    assert.equal(publicVid7, undefined, "getArchiveRecordById must NOT return held video by default");

    // Published ruins record MUST be returned
    const publishedRuins = getArchiveRecordById("rec-present-ruins-2008");
    assert.ok(publishedRuins, "Published ruins record must be returned");
    assert.equal(publishedRuins.id, "rec-present-ruins-2008");
  });

  // Test 13: Public archive selectors reject injected unpermitted records (Codex probe reproduction)
  it("13. Public archive selectors reject injected unpermitted records (Codex probe reproduction)", () => {
    const bad = {
      ...ARCHIVE_CATALOG[0],
      id: "rejected-but-selected",
      duplicateOf: "past-050",
      mediaId: "future-hero",
    };
    assert.equal(archiveRecordSchema.safeParse(bad).success, false, "Schema must reject invalid bad record");
    ARCHIVE_CATALOG.push(bad as unknown as ArchiveRecord);
    const selected = getPublishedArchiveRecords().some((r) => r.id === bad.id);
    ARCHIVE_CATALOG.pop();
    assert.equal(selected, false, "Public getter must NOT select unpermitted injected record");

    // Probe published licensed record without licenseUrl:
    const badLicense = {
      ...ARCHIVE_CATALOG[0],
      id: "injected-missing-license-url",
      publicationState: "published" as const,
      rights: {
        status: "licensed" as const,
        license: "CC BY-SA 2.0",
        credit: "Sample Credit",
      },
    };
    assert.equal(archiveRecordSchema.safeParse(badLicense).success, false, "Schema must reject published licensed record without licenseUrl");
    ARCHIVE_CATALOG.push(badLicense as unknown as ArchiveRecord);
    const selectedBadLicense = getPublishedArchiveRecords().some((r) => r.id === badLicense.id);
    ARCHIVE_CATALOG.pop();
    assert.equal(selectedBadLicense, false, "Public getter must NOT select published record missing licenseUrl");
  });

  // Test 14: Present content authority and factual precision invariants
  it("14. Published Airport Present content is the authoritative rendering source without ungrounded coordinates/elevation or radar claims", () => {
    // 14a. Fact structure and identifiers match expected canonical keys
    const factIds = publishedAirportPresent.facts.map((f) => f.id);
    assert.deepEqual(factIds, [
      "fact-location",
      "fact-aero-codes",
      "fact-operating-period",
      "fact-facility-status",
    ]);

    // 14b. Coordinates and elevation are omitted from factual copy
    const factsCombined = JSON.stringify(publishedAirportPresent.facts);
    assert.ok(!factsCombined.includes("31°14"), "Ungrounded coordinates must not appear in facts");
    assert.ok(!factsCombined.includes("34°16"), "Ungrounded coordinates must not appear in facts");
    assert.ok(!factsCombined.includes("98m"), "Ungrounded elevation must not appear in facts");
    assert.ok(!factsCombined.includes("320ft"), "Ungrounded elevation must not appear in facts");

    // 14c. Retained technical identifiers: GZA, LVGZ, and Runway 01/19
    const aeroFact = publishedAirportPresent.facts.find((f) => f.id === "fact-aero-codes");
    assert.ok(aeroFact, "fact-aero-codes must exist");
    assert.equal(aeroFact.value.en, "IATA: GZA · ICAO: LVGZ");
    assert.equal(aeroFact.value.ar, "IATA: GZA · ICAO: LVGZ");
    assert.match(aeroFact.detail.en, /01\/19/);
    assert.match(aeroFact.detail.ar, /01\/19/);
    assert.match(aeroFact.detail.en, /3,080/);

    // 14d. Operating period does not claim an ungrounded October 2000 cessation month
    const opFact = publishedAirportPresent.facts.find((f) => f.id === "fact-operating-period");
    assert.ok(opFact, "fact-operating-period must exist");
    assert.ok(!JSON.stringify(opFact).includes("Oct 2000"), "Ungrounded Oct 2000 month must not appear");
    assert.match(opFact.value.en, /Nov 1998/);

    // 14e. Hero alt text in media.ts does not claim 'radar dome'
    const heroMedia = (mediaSource.match(/"airport-present-ruins-2008"[\s\S]*?altEn:\s*"([^"]+)"/)?.[1] ?? "");
    assert.ok(!heroMedia.toLowerCase().includes("radar"), "Hero alt must not identify a radar dome");
    const heroMediaAr = (mediaSource.match(/"airport-present-ruins-2008"[\s\S]*?altAr:\s*"([^"]+)"/)?.[1] ?? "");
    assert.ok(!heroMediaAr.includes("رادار"), "Hero Arabic alt must not identify a radar dome");

    // 14f. Intro notice and verification prose do not claim photographic or documentary 'survey'
    const noticeJson = JSON.stringify(publishedAirportPresent.intro.notice);
    assert.ok(!noticeJson.toLowerCase().includes("survey"), "Intro notice must not claim a survey");
    assert.ok(!noticeJson.includes("مسح"), "Intro notice Arabic must not claim a survey");

    const allPresentJson = JSON.stringify(publishedAirportPresent);
    assert.ok(!allPresentJson.toLowerCase().includes("photographic survey"), "Prose must not claim a photographic survey");
    assert.ok(!allPresentJson.toLowerCase().includes("documentary survey"), "Prose must not claim a documentary survey");
    assert.ok(!allPresentJson.includes("مسوحات ميدانية"), "Arabic prose must not claim field surveys");

    // 14g. Verified technical engineering source (Saleh & Hegab) is cited for runway design and location, and resolves
    assert.ok(
      aeroFact.sourceRefs.includes("src-saleh-hegab-airport"),
      "fact-aero-codes must cite src-saleh-hegab-airport",
    );
    const locationFact = publishedAirportPresent.facts.find((f) => f.id === "fact-location");
    assert.ok(
      locationFact?.sourceRefs.includes("src-saleh-hegab-airport"),
      "fact-location must cite src-saleh-hegab-airport",
    );
    const runwayDossier = publishedAirportPresent.dossiers.find((d) => d.id === "dossier-runway");
    assert.ok(
      runwayDossier?.sourceRefs.includes("src-saleh-hegab-airport"),
      "dossier-runway must cite src-saleh-hegab-airport",
    );
    assert.equal(
      SOURCE_REGISTRY["src-saleh-hegab-airport"].url,
      "https://www.saleh-hegab.com/en/portfolio/transit-system-airports-harbors/",
      "src-saleh-hegab-airport must point to the verified engineering portfolio URL",
    );
  });

  // Test 15: Acceptance Truth Correction 0.1 invariants
  it("15. Enforces institutional status separation, absence of settled 235ha/60m claims, retired legacy key removal, and attribution persistence", () => {
    // 15a. Facility institutional status is distinct from dated 2008 physical record
    const facilityFact = publishedAirportPresent.facts.find((f) => f.id === "fact-facility-status");
    assert.ok(facilityFact, "fact-facility-status must exist");
    assert.equal(facilityFact.value.en, "Not operating as a civil airport");
    assert.equal(facilityFact.value.ar, "غير عامل كمطار مدني");
    assert.match(
      facilityFact.detail.en,
      /Ruins documented in June 2008 · current physical condition requires new verified field evidence/,
    );
    assert.match(facilityFact.detail.ar, /2008/);
    assert.match(facilityFact.detail.ar, /تتطلب توثيقاً ميدانياً حديثاً/);

    // 15b. No settled 235ha or 60m width claim in canonical Present copy or remaining fallback keys
    const canonicalPresentStr = JSON.stringify(publishedAirportPresent);
    assert.ok(!canonicalPresentStr.includes("235 hectare"), "No 235 hectares in Present copy");
    assert.ok(!canonicalPresentStr.includes("235 هكتار"), "No 235 hectares in Arabic Present copy");
    assert.ok(!canonicalPresentStr.includes("60 metres in width"), "No 60 metres in Present copy");
    assert.ok(!canonicalPresentStr.includes("60 متراً"), "No 60 metres in Arabic Present copy");

    // 15c. Zero-consumer legacy Present factual keys are retired from both EN and AR dictionaries
    const retiredKeys = [
      "airport.presentSubtitle",
      "airport.presentNotice",
      "airport.siteLocationLabel",
      "airport.siteLocationValue",
      "airport.siteAeroCodesLabel",
      "airport.siteOperatingPeriodLabel",
      "airport.siteOperatingPeriodValue",
      "airport.siteStatusLabel",
      "airport.siteStatusValue",
      "airport.siteBoundariesTitle",
      "airport.siteBoundariesBody1",
      "airport.siteBoundariesBody2",
      "airport.runwayTitle",
      "airport.runwayBody",
      "airport.verificationTitle",
      "airport.verificationBody",
      "airport.spatialEyebrow",
      "airport.spatialTitle",
      "airport.spatialBody",
      "airport.evidentiaryRuleTitle",
      "airport.evidentiaryRuleBody",
    ];
    for (const key of retiredKeys) {
      assert.ok(!(key in en), `Retired key ${key} must not exist in en dictionary`);
      assert.ok(!(key in ar), `Retired key ${key} must not exist in ar dictionary`);
    }

    // 15d. airport.presentSummary reconciled (does not claim 'today')
    assert.ok(!en["airport.presentSummary"].includes("today"), "airport.presentSummary EN must not claim today");
    assert.ok(!ar["airport.presentSummary"].includes("اليوم"), "airport.presentSummary AR must not claim today");

    // 15e. Ruins record remains historical-documentary/published/licensed/source-backed/dated 2008
    const ruinsRecord = getArchiveRecordById("rec-present-ruins-2008");
    assert.ok(ruinsRecord, "rec-present-ruins-2008 must exist");
    assert.equal(ruinsRecord.mediaId, "airport-present-ruins-2008");
    assert.equal(ruinsRecord.publicationState, "published");
    assert.equal(ruinsRecord.rights?.license, "CC BY-SA 2.0 Generic");
    assert.ok(ruinsRecord.rights?.licenseUrl, "Ruins record must have licenseUrl");
    assert.ok(ruinsRecord.sourceRefs.includes("src-gisha-2008"), "Ruins record must cite src-gisha-2008");
    assert.equal(ruinsRecord.date, "2008-06-13");

    // 15f. All nine decorative skins remain outside approved semantic MEDIA
    const decorativeSkinIds = [
      "dossier-boundaries",
      "dossier-runway",
      "dossier-verification",
      "fact-aero-codes",
      "fact-facility-status",
      "fact-location",
      "fact-operating-period",
      "global-network",
      "spatial-geometry",
    ];
    for (const id of decorativeSkinIds) {
      assert.ok(
        !(id in APPROVED_MEDIA_CATALOG),
        `Decorative skin ${id} must not be in APPROVED_MEDIA_CATALOG`,
      );
    }

    // 15g. Staged/held archive records remain absent from public selectors
    const published = getPublishedArchiveRecords();
    const intake = getIntakeArchiveRecords();
    for (const item of intake) {
      if (item.publicationState !== "published") {
        assert.ok(
          !published.some((p) => p.id === item.id),
          `Non-published intake record ${item.id} must be absent from published selector`,
        );
      }
    }

    // 15h. Public attribution persists on both EN and AR Present
    assert.ok(en["present.credit.label"], "EN attribution label must exist");
    assert.ok(ar["present.credit.label"], "AR attribution label must exist");
    assert.ok(en["present.credit.licenseLabel"], "EN license label must exist");
    assert.ok(ar["present.credit.licenseLabel"], "AR license label must exist");
    assert.ok(en["present.credit.photoBy"], "EN photo credit must exist");
    assert.ok(ar["present.credit.photoBy"], "AR photo credit must exist");

    // 15i. Live keys for Overview, Past, and Future resolve to non-empty EN and AR strings
    const liveKeys = [
      "airport.sourcesBody",
      "airport.awaitingReferences",
      "airport.methodologyBody",
      "airport.futureSubtitle",
      "airport.pastSubtitle",
      "airport.pastNotice",
      "airport.futureSummary",
    ];
    for (const key of liveKeys) {
      assert.ok(
        typeof (en as Record<string, string>)[key] === "string" && (en as Record<string, string>)[key].trim().length > 0,
        `Live key ${key} must resolve to non-empty string in en`,
      );
      assert.ok(
        typeof (ar as Record<string, string>)[key] === "string" && (ar as Record<string, string>)[key].trim().length > 0,
        `Live key ${key} must resolve to non-empty string in ar`,
      );
    }
  });
});

describe("HC-2 Historical Archive Publication Invariants", () => {
  // HC2-1: Public selector exposes only schema-valid published records; staging, hold-rights, hold-provenance, excluded, duplicateOf never leak.
  it("HC2-1: Public archive selector exposes strictly published, schema-valid records; staging, holds, and duplicates never leak", () => {
    const published = getPublishedArchiveRecords();
    assert.ok(published.length > 0, "Must have at least one published record");

    for (const record of published) {
      assert.equal(record.publicationState, "published");
      assert.equal(record.duplicateOf, undefined);
      const schemaCheck = archiveRecordSchema.safeParse(record);
      assert.ok(schemaCheck.success, `Published record ${record.id} must satisfy archiveRecordSchema`);
    }

    const allIntake = getIntakeArchiveRecords();
    for (const intake of allIntake) {
      if (intake.publicationState !== "published" || intake.duplicateOf) {
        assert.ok(
          !published.some((p) => p.id === intake.id),
          `Unpublished intake record ${intake.id} (${intake.publicationState}) must never appear in published selector`,
        );
      }
    }
  });

  // HC2-2: past-052 stays excluded duplicate of past-050; no independent duplicate publication
  it("HC2-2: past-052 remains excluded duplicate alias of past-050 with no independent publication", () => {
    const intake52 = getArchiveRecordById("past-052", true);
    assert.ok(intake52, "past-052 must exist in intake archive");
    assert.equal(intake52.duplicateOf, "past-050");
    assert.equal(intake52.publicationState, "excluded");

    // Public lookups must return undefined
    assert.equal(getArchiveRecordById("past-052"), undefined);
    assert.equal(getArchiveRecordBySlug("gaza-airport-past-interior-waiting-area-hall"), undefined);

    const published = getPublishedArchiveRecords();
    assert.ok(!published.some((r) => r.id === "past-052"), "past-052 must not exist in published archive");
  });

  // HC2-3: Public documentary IDs are historical-documentary; Future AI cannot enter archive/Past evidence
  it("HC2-3: Public documentary IDs are historical-documentary; Future AI is rejected from Past/Archive evidence", () => {
    const published = getPublishedArchiveRecords();
    for (const record of published) {
      if (record.mediaId) {
        assert.equal(
          APPROVED_MEDIA_CATALOG[record.mediaId],
          "historical-documentary",
          `Record ${record.id} mediaId ${record.mediaId} must have historical-documentary truth class`,
        );
      }
    }

    // Past timeline rejects future-concept-ai or illustrative-photo
    const pastHeroProbe = JSON.parse(JSON.stringify(publishedAirportPast));
    pastHeroProbe.timeline[0].media = { kind: "media", id: "future-hero" };
    assert.equal(isValidContent("airport.past", pastHeroProbe), false, "Must reject future-hero in Past timeline");

    const illustrativeProbe = JSON.parse(JSON.stringify(publishedAirportPast));
    illustrativeProbe.timeline[0].media = { kind: "media", id: "home-hero" };
    assert.equal(isValidContent("airport.past", illustrativeProbe), false, "Must reject illustrative-photo in Past timeline");
  });

  // HC2-4: Published photos satisfy rights/credit/license URL/source/date/bilingual contracts; verified records and verified Past chapters have nonempty resolvable sourceRefs
  it("HC2-4: Published photos satisfy rights/credit/license contracts, and all verified Past entries cite resolvable sources", () => {
    const published = getPublishedArchiveRecords();
    for (const rec of published) {
      if (rec.medium === "photograph") {
        assert.notEqual(rec.rights.status, "unknown");
        assert.notEqual(rec.rights.status, "rights-managed");
        assert.ok(rec.rights.credit || rec.rights.license, `Record ${rec.id} must have credit or license`);
        if (rec.rights.status === "licensed") {
          assert.ok(rec.rights.licenseUrl, `Licensed record ${rec.id} must have licenseUrl`);
          assert.match(rec.rights.licenseUrl, /^https?:\/\//);
        }
      }
      assert.ok(rec.title.en.trim().length > 0);
      assert.ok(rec.title.ar.trim().length > 0);
      assert.ok(rec.alt.en.trim().length > 0);
      assert.ok(rec.alt.ar.trim().length > 0);
      assert.notEqual(rec.datePrecision, "unknown");
    }

    // Verified Past timeline chapters
    for (const entry of publishedAirportPast.timeline) {
      if (entry.evidence === "verified") {
        assert.ok(entry.sourceRefs.length > 0, `Verified entry ${entry.id} must cite at least one sourceRef`);
        for (const ref of entry.sourceRefs) {
          assert.ok(SOURCE_REGISTRY[ref], `Entry ${entry.id} references non-existent source: ${ref}`);
        }
      }
    }
  });

  // HC2-5: Source IDs unique; public external references resolve to actual registry entries; held videos cannot become published media
  it("HC2-5: Source IDs are unique, valid, and held videos never leak as published media", () => {
    const sources = getAllSourceRecords();
    const seen = new Set<string>();
    for (const s of sources) {
      assert.ok(!seen.has(s.id), `Duplicate source ID: ${s.id}`);
      seen.add(s.id);
      assert.match(s.url, /^https?:\/\//, `Source ${s.id} has invalid URL: ${s.url}`);
    }

    // Video intake catalog items remain unpublished
    const intakeVideos = getIntakeArchiveRecords().filter((r) => r.medium === "video");
    assert.ok(intakeVideos.length >= 7, "Intake catalog must include at least 7 video records");
    for (const vid of intakeVideos) {
      assert.notEqual(vid.publicationState, "published", `Intake video ${vid.id} must not be published`);
      assert.equal(getArchiveRecordById(vid.id), undefined, `Intake video ${vid.id} must not be publicly retrievable`);
    }
  });

  // HC2-6: Gallery no legacy galleryItems authority or seeded historical photos; Past no seeded hero/false evidence timeline image
  it("HC2-6: Gallery and Past do not rely on legacy galleryItems or seeded images", () => {
    const gallerySrc = readFileSync(new URL("../../src/routes/{-$locale}.gallery.tsx", import.meta.url), "utf8");
    assert.ok(!gallerySrc.includes("galleryItems"), "Gallery route must not reference legacy galleryItems");
    assert.ok(!gallerySrc.includes("img("), "Gallery route must not use img() seed function");
    assert.ok(gallerySrc.includes("getPublishedArchiveRecords"), "Gallery route must use canonical getPublishedArchiveRecords");

    const pastSrc = readFileSync(new URL("../../src/routes/{-$locale}.airport.past.tsx", import.meta.url), "utf8");
    assert.ok(!pastSrc.includes("airport-archive-hall"), "Past route must not use seeded airport-archive-hall hero");
    assert.ok(pastSrc.includes("airport-archive-hero-2000"), "Past route must use approved airport-archive-hero-2000 hero");

    for (const entry of publishedAirportPast.timeline) {
      assert.notEqual(entry.media?.kind, "placeholder-seed", `Timeline entry ${entry.id} must not use placeholder-seed`);
    }
  });
});
