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
  getFeaturedArchiveRecords,
  getVerifiedVideoReferences,
  getGalleryItems,
  getDerivedFilterOptions,
  getPublishedArchiveRecordsForTimelineEvent,
} from "../../src/lib/archive/catalog.ts";
import type { ArchiveRecord, PublicationBasis, ArchiveSubject } from "../../src/lib/archive/types.ts";
import { SOURCE_REGISTRY, getAllSourceRecords } from "../../src/lib/archive/sources.ts";
import {
  archiveRecordSchema,
  sourceRecordSchema,
  ELIGIBLE_OWNER_INTAKE_IDS,
  ELIGIBLE_OWNER_INTAKE_REGISTRY,
  extractVerifiedYouTubeId,
} from "../../src/lib/archive/schema.ts";
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

      if (record.medium === "photograph" || record.medium === "document") {
        if (record.publicationBasis === "rights-cleared") {
          assert.notEqual(record.rights.status, "unknown", `${record.id} rights-cleared record cannot have unknown rights`);
          assert.ok(
            record.rights.license || record.rights.credit,
            `${record.id} rights-cleared record must provide license or credit`,
          );
        } else if (record.publicationBasis === "product-owner-directed-display") {
          assert.equal(record.rights.status, "unknown", `${record.id} owner-directed photo has honest unknown rights status`);
          assert.ok(
            record.rights.credit,
            `${record.id} owner-directed photo must provide credit statement`,
          );
          assert.ok(record.mediaId, `${record.id} owner-directed photo must have registered mediaId`);
        }
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

    // A malformed requested document is unavailable, not a silently absent draft.
    await assert.rejects(repo.getDraft("airport.present"), { code: "corrupt_store" });

    // Saving a healthy sibling must preserve malformed bytes rather than repair them.
    const editedHome = structuredClone(publishedHome);
    editedHome.copy.h1.en = "Healthy Home draft";
    await repo.saveDraft("home", editedHome);

    const rawCommitted = JSON.parse(mockStorage.getItem("gza.content.draft.v1")!);
    assert.ok(rawCommitted.drafts.home, "Home draft must NOT be wiped out when saving airport.present");
    assert.deepEqual(rawCommitted.drafts["airport.present"], seededPayload.drafts["airport.present"]);

    // Discarding Home must also leave the malformed sibling untouched.
    await repo.discardDraft("home");

    const rawAfterDiscard = JSON.parse(mockStorage.getItem("gza.content.draft.v1")!);
    assert.equal(rawAfterDiscard.drafts.home, undefined);
    assert.deepEqual(rawAfterDiscard.drafts["airport.present"], seededPayload.drafts["airport.present"]);
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
      if (rec.medium === "photograph" || rec.medium === "document") {
        if (rec.publicationBasis === "rights-cleared") {
          assert.notEqual(rec.rights.status, "unknown", `${rec.id} rights-cleared record must have known rights`);
          assert.notEqual(rec.rights.status, "rights-managed");
          assert.ok(rec.rights.credit || rec.rights.license, `Record ${rec.id} must have credit or license`);
          if (rec.rights.status === "licensed") {
            assert.ok(rec.rights.licenseUrl, `Licensed record ${rec.id} must have licenseUrl`);
            assert.match(rec.rights.licenseUrl, /^https?:\/\//);
          }
          assert.notEqual(rec.datePrecision, "unknown");
        } else if (rec.publicationBasis === "product-owner-directed-display") {
          assert.equal(rec.rights.status, "unknown", `${rec.id} owner-directed photo has honest unknown rights status`);
          assert.ok(rec.rights.credit, `Owner-directed record ${rec.id} must preserve credit statement`);
          assert.ok(rec.mediaId, `Owner-directed record ${rec.id} must have mediaId`);
          assert.ok(APPROVED_MEDIA_CATALOG[rec.mediaId], `Media ${rec.mediaId} must be registered in APPROVED_MEDIA_CATALOG`);
        }
      }
      assert.ok(rec.title.en.trim().length > 0);
      assert.ok(rec.title.ar.trim().length > 0);
      assert.ok(rec.alt.en.trim().length > 0);
      assert.ok(rec.alt.ar.trim().length > 0);
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
    assert.ok(!gallerySrc.includes("img("), "Gallery route must not use img() seed function");
    assert.ok(
      gallerySrc.includes("getGalleryItems") || gallerySrc.includes("getPublishedArchiveRecords"),
      "Gallery route must use canonical archive selectors",
    );

    const pastSrc = readFileSync(new URL("../../src/routes/{-$locale}.airport.past.tsx", import.meta.url), "utf8");
    assert.ok(!pastSrc.includes("airport-archive-hall"), "Past route must not use seeded airport-archive-hall hero");
    assert.ok(pastSrc.includes("airport-archive-hero-2000"), "Past route must use approved airport-archive-hero-2000 hero");

    for (const entry of publishedAirportPast.timeline) {
      assert.notEqual(entry.media?.kind, "placeholder-seed", `Timeline entry ${entry.id} must not use placeholder-seed`);
    }
  });

  // HC2-C1-1: SourceRecord schema and registry validate notesAr and bilingual completeness
  it("HC2-C1-1: SourceRecord schema and registry validate notesAr and bilingual parity", () => {
    const sources = getAllSourceRecords();
    for (const src of sources) {
      const parsed = sourceRecordSchema.safeParse(src);
      assert.ok(parsed.success, `Source ${src.id} failed schema: ${JSON.stringify(parsed.error?.issues)}`);
      assert.ok(src.notesAr && src.notesAr.trim().length > 0, `Source ${src.id} must have non-empty notesAr`);
      assert.ok(src.titleAr && src.titleAr.trim().length > 0, `Source ${src.id} must have non-empty titleAr`);
    }

    // Probes: schema allows optional notesAr, but rejects non-string notesAr
    const validWithNotesAr = {
      ...sources[0],
      notesAr: "ملاحظات عربية موثقة",
    };
    assert.equal(sourceRecordSchema.safeParse(validWithNotesAr).success, true);
  });

  // HC2-C1-2: Past timeline claims grounded in audited claim matrix
  it("HC2-C1-2: Past timeline chapters are strictly grounded in audited sources and accurate chronology", () => {
    const planning = publishedAirportPast.timeline.find((t) => t.id === "planning");
    assert.ok(planning, "planning chapter must exist");
    assert.ok(planning.sourceRefs.includes("src-worldbank-2007"), "planning must cite src-worldbank-2007 for funding");
    assert.ok(planning.sourceRefs.includes("src-saleh-hegab-airport"), "planning must cite src-saleh-hegab-airport for design");
    assert.match(planning.body.en, /design specifications \(3,080 m × 45 m\)/, "runway must be described as design specifications");
    assert.match(planning.body.ar, /المواصفات التصميمية للمدرج \(3,080 متراً × 45 متراً\)/, "Arabic runway must be described as design specifications");

    const opening = publishedAirportPast.timeline.find((t) => t.id === "opening");
    assert.ok(opening, "opening chapter must exist");
    assert.match(opening.body.en, /November 24, 1998/);
    assert.match(opening.body.en, /December 14, 1998/);
    assert.match(opening.body.en, /early December 1998/, "Must mention scheduled commercial service starting in early December");
    assert.ok(!opening.body.en.includes("Commercial passenger flights commenced on November 24"), "Must NOT conflate Nov 24 opening with scheduled commercial start");
    assert.ok(opening.sourceRefs.includes("src-video-ap-1998-opening"), "opening must cite AP video");
    assert.ok(opening.sourceRefs.includes("src-video-clinton-1998"), "opening must cite Clinton video");

    const operations = publishedAirportPast.timeline.find((t) => t.id === "operations");
    assert.ok(operations, "operations chapter must exist");
    assert.ok(operations.sourceRefs.includes("src-worldbank-2007"), "operations must cite World Bank 2007 report");
    assert.ok(operations.sourceRefs.includes("src-unsco-2000"), "operations must cite UNSCO 2000 report");
    assert.ok(operations.sourceRefs.includes("src-unrwa-2001"), "operations must cite UNRWA 2001 report");
    assert.match(operations.body.en, /700,000 passengers annually/, "Must reference 700,000 design capacity");
    assert.match(operations.body.en, /about 60,000 passengers/, "Must reference about 60,000 passengers in 1999");
    assert.match(operations.body.en, /1,168 flights/, "Must reference 1,168 flights in 1999");
    assert.ok(!operations.body.en.includes("90,000"), "Must not claim 90,000 passengers");
    assert.match(operations.body.en, /Amman, Cairo, Jeddah, Dubai, Doha, Istanbul, and Larnaca/, "Must list verified routes");

    const closure = publishedAirportPast.timeline.find((t) => t.id === "closure");
    assert.ok(closure, "closure chapter must exist");
    assert.equal(closure.period, "2000–2002", "closure period must be 2000–2002");
    assert.ok(closure.sourceRefs.includes("src-unsco-2000"), "closure must cite UNSCO 2000 report");
    assert.ok(closure.sourceRefs.includes("src-unrwa-2001"), "closure must cite UNRWA 2001 report");
    assert.ok(closure.sourceRefs.includes("src-icao-council-2002"), "closure must cite ICAO resolution");
    assert.ok(closure.sourceRefs.includes("src-worldbank-2007"), "closure must cite World Bank report for damages");
    assert.match(closure.body.en, /October 8, 2000/, "Must note October 8, 2000 initial closure");
    assert.match(closure.body.en, /October 19/, "Must note October 19 brief reopening");
    assert.match(closure.body.en, /February 25, 2001/, "Must note February 25, 2001 continuous closure");
    assert.match(closure.body.en, /December 2001/, "Must note December 2001 radar destruction");
    assert.match(closure.body.en, /January 2002/, "Must note January 2002 runway bulldozing");
    assert.match(closure.body.en, /March 13, 2002/, "Must note March 13, 2002 ICAO resolution");

    const memory = publishedAirportPast.timeline.find((t) => t.id === "memory");
    assert.ok(memory, "memory chapter must exist");
    assert.ok(memory.sourceRefs.includes("src-gisha-2008"), "memory must cite Gisha 2008 photo");
    assert.ok(!memory.body.en.includes("documentary surveys"), "memory must not claim broad surveys");
  });

  // HC2-C1-3: All 8 video intake items audited and reconciled; verified third-party videos exposed as SourceRecords
  it("HC2-C1-3: All eight catalog videos are audited; verified external videos are SourceRecords without leaking into published media", () => {
    const intakeVideos = getIntakeArchiveRecords().filter((r) => r.medium === "video");
    assert.equal(intakeVideos.length, 8, "Must have exactly 8 video intake records");

    const expectedYoutubeIds = [
      "vYodi28td20",
      "yFF4KY-mQk0",
      "0ExS0XCVk0E",
      "hJ-zww_qO6c",
      "jb8SszpUxgg",
      "gaSe8Pbmm5Q",
      "tBht5QeKHaA",
      "-k3kR5f3nYY",
    ];

    for (const yid of expectedYoutubeIds) {
      const match = intakeVideos.find((v) => v.youtubeId === yid);
      assert.ok(match, `YouTube ID ${yid} must exist in intake catalog`);
      assert.notEqual(match.publicationState, "published", `${yid} must not be published as media`);
    }

    // vYodi28td20 specifically: verified as AP Archive, not AFP 2014 ruins
    const vYodi = intakeVideos.find((v) => v.youtubeId === "vYodi28td20");
    assert.ok(vYodi);
    assert.equal(vYodi.rights.holder, "Associated Press");
    assert.match(vYodi.title.en, /INTERNATIONAL AIRPORT OPENS/);

    // Verified video SourceRecords in registry
    const videoSources = getAllSourceRecords().filter((s) => s.type === "video");
    assert.ok(videoSources.length >= 4, "Must have at least 4 verified video SourceRecords");
    for (const vs of videoSources) {
      assert.match(vs.url, /^https:\/\/www\.youtube\.com\/watch\?v=[a-zA-Z0-9_-]+/);
      assert.ok(vs.notesAr && vs.notesAr.length > 0);
    }
  });

  // HC2-C1-4: Dynamic filter derivation and singleton handling
  it("HC2-C1-4: Dynamic filter derivation from published records suppresses empty choices for singleton collections", () => {
    const published = getPublishedArchiveRecords();
    const availableMediums = Array.from(new Set(published.map((r) => r.medium))).sort();
    const availablePhases = Array.from(new Set(published.map((r) => r.phase))).sort();

    // Published documentary records include photographs and documents across historical phases
    assert.deepEqual(availableMediums, ["document", "photograph"]);
    assert.ok(availablePhases.includes("opening-golden-era"), "Must include opening-golden-era phase");
    assert.ok(availablePhases.includes("post-destruction-ruins"), "Must include post-destruction-ruins phase");

    // Gallery route derives options deterministically and does NOT hardcode empty options
    const gallerySrc = readFileSync(new URL("../../src/routes/{-$locale}.gallery.tsx", import.meta.url), "utf8");
    assert.ok(
      gallerySrc.includes("availableMediums.length >= 2") ||
      gallerySrc.includes("derivedFilters.mediums.length >= 2") ||
      gallerySrc.includes("filterOptions.mediums.length >= 2"),
      "Category dropdown must be guarded against empty or singleton choices",
    );
    assert.ok(
      gallerySrc.includes("availablePhases.length >= 2") ||
      gallerySrc.includes("derivedFilters.phases.length >= 2") ||
      gallerySrc.includes("filterOptions.phases.length >= 2"),
      "Era dropdown must be guarded against empty or singleton choices",
    );
  });

  // HC2-C1-5: Arabic parity in Gallery & Past
  it("HC2-C1-5: Enforces Arabic parity for Lightbox date, location display, source notes, and mixed-state notice", () => {
    // i18n keys
    assert.equal(en["gallery.date"], "Date");
    assert.equal(ar["gallery.date"], "التاريخ");
    assert.equal(en["gallery.watchSource"], "Watch at original source");
    assert.equal(ar["gallery.watchSource"], "شاهد في المصدر الأصلي");
    assert.ok(en["airport.sourcesNoticeMixed"].length > 0);
    assert.ok(ar["airport.sourcesNoticeMixed"].length > 0);

    // Past route renders mixed-state notice in methodology panel
    const pastSrc = readFileSync(new URL("../../src/routes/{-$locale}.airport.past.tsx", import.meta.url), "utf8");
    assert.ok(pastSrc.includes("airport.sourcesNoticeMixed"), "Past route must render airport.sourcesNoticeMixed");

    // Gallery route localizes location and date
    const gallerySrc = readFileSync(new URL("../../src/routes/{-$locale}.gallery.tsx", import.meta.url), "utf8");
    assert.ok(gallerySrc.includes('t("gallery.date")'), "Gallery lightbox must use localized Date label");
    assert.ok(gallerySrc.includes("formatLocation"), "Gallery lightbox must use formatLocation helper");
  });

  // HC2-C2-1: Primary World Bank Report No. 69315 audit & exact metrics
  it("HC2-C2-1: World Bank Report No. 69315 metadata, exact 1999 volume, routes, and design capacity are verified", () => {
    const wb = SOURCE_REGISTRY["src-worldbank-2007"];
    assert.ok(wb, "src-worldbank-2007 must exist in SOURCE_REGISTRY");
    assert.equal(wb.title, "West Bank and Gaza - Transport Sector Strategy Note");
    assert.equal(wb.titleAr, "الضفة الغربية وقطاع غزة — مذكرة استراتيجية قطاع النقل");
    assert.equal(wb.publicationDate, "2007-10-30");
    assert.equal(wb.url, "https://documents.worldbank.org/en/publication/documents-reports/documentdetail/932271469672170770/693150ESW0P1000ctober030020070Final");
    assert.match(wb.notes, /Report No\. 69315/);
    assert.match(wb.notes, /Project ID P100971/);
    assert.match(wb.notes, /Annex 6/);
    assert.match(wb.notes, /about 60,000/);
    assert.match(wb.notes, /1,168.*flights/);
    assert.match(wb.notes, /41,000.*Palestinian Airlines/);
    assert.match(wb.notes, /\$86\.5M/);
    assert.match(wb.notes, /Royal Wings, EgyptAir, Royal Air Maroc, Tarom/);
    assert.ok(wb.notesAr && wb.notesAr.includes("60 ألف"), "Arabic notes must state 60 thousand");
    assert.ok(!wb.notes.includes("90,000"), "Must not cite unverified 90,000 figure");

    const pastOps = publishedAirportPast.timeline.find((t) => t.id === "operations");
    assert.ok(pastOps);
    assert.match(pastOps.body.en, /about 60,000 passengers across 1,168 flights/);
    assert.match(pastOps.body.ar, /نحو 60 ألف مسافر في 1,168 رحلة/);
    assert.ok(!pastOps.body.en.includes("90,000"));
    assert.ok(!pastOps.body.ar.includes("90 ألف"));
  });

  // HC2-C2-2: UN primary documents and exact closure chronology
  it("HC2-C2-2: Registers UNSCO and UNRWA primary documents and enforces precise closure chronology", () => {
    const unsco = SOURCE_REGISTRY["src-unsco-2000"];
    assert.ok(unsco, "src-unsco-2000 must exist in SOURCE_REGISTRY");
    assert.equal(unsco.publisher, "Office of the United Nations Special Coordinator in the Occupied Territories (UNSCO)");
    assert.equal(unsco.publicationDate, "2000-10");
    assert.equal(unsco.url, "https://www.un.org/unispal/document/auto-insert-202335/");
    assert.match(unsco.notes, /initial closure of Gaza International Airport on October 8, 2000/);
    assert.match(unsco.notes, /temporary reopening on October 19, 2000/);

    const unrwa = SOURCE_REGISTRY["src-unrwa-2001"];
    assert.ok(unrwa, "src-unrwa-2001 must exist in SOURCE_REGISTRY");
    assert.equal(unrwa.publisher, "United Nations General Assembly");
    assert.equal(unrwa.publicationDate, "2001");
    assert.equal(unrwa.url, "https://www.un.org/unispal/document/auto-insert-184580/");
    assert.match(unrwa.notes, /continuous closure starting February 25, 2001/);
    assert.match(unrwa.notes, /A\/56\/13/);

    const closure = publishedAirportPast.timeline.find((t) => t.id === "closure");
    assert.ok(closure);
    assert.equal(closure.period, "2000–2002");
    assert.deepEqual(closure.sourceRefs, ["src-unsco-2000", "src-unrwa-2001", "src-icao-council-2002", "src-worldbank-2007"]);
    assert.match(closure.body.en, /October 8, 2000/);
    assert.match(closure.body.en, /October 19/);
    assert.match(closure.body.en, /February 25, 2001/);
    assert.match(closure.body.en, /December 2001/);
    assert.match(closure.body.en, /January 2002/);
    assert.match(closure.body.en, /March 13, 2002/);
    assert.match(closure.body.ar, /8 تشرين الأول\/أكتوبر 2000/);
    assert.match(closure.body.ar, /19 تشرين الأول\/أكتوبر/);
    assert.match(closure.body.ar, /25 شباط\/فبراير 2001/);
    assert.match(closure.body.ar, /كانون الأول\/ديسمبر 2001/);
    assert.match(closure.body.ar, /كانون الثاني\/يناير 2002/);
    assert.match(closure.body.ar, /13 آذار\/مارس 2002/);
  });

  // HC2-C2-3: Video provenance matrix and upstream oEmbed reconciliation
  it("HC2-C2-3: Reconciles all 8 intake video records against upstream oEmbed metadata and isolates held items", () => {
    const intakeVideos = getIntakeArchiveRecords().filter((r) => r.medium === "video");
    assert.equal(intakeVideos.length, 8);

    // Clinton FOIA release (tBht5QeKHaA) cataloged as vid-journeyman-2002
    const clintonVid = intakeVideos.find((v) => v.youtubeId === "tBht5QeKHaA");
    assert.ok(clintonVid, "tBht5QeKHaA Clinton FOIA video must exist in catalog");
    assert.equal(clintonVid.id, "vid-journeyman-2002");
    assert.equal(clintonVid.rights.holder, "William J. Clinton Presidential Library / US National Archives");
    assert.match(clintonVid.title.en, /Pres\. Clinton and Chairman Arafat at Gaza Airport/);
    assert.equal(clintonVid.publicationState, "hold-provenance");

    // Journeyman held items
    const jm1 = intakeVideos.find((v) => v.youtubeId === "hJ-zww_qO6c");
    assert.ok(jm1);
    assert.equal(jm1.id, "vid-ayyad-1998-montage");
    assert.equal(jm1.publicationState, "hold-provenance");

    const jm2 = intakeVideos.find((v) => v.youtubeId === "jb8SszpUxgg");
    assert.ok(jm2);
    assert.equal(jm2.id, "vid-harazeen-crushed-rubble");
    assert.equal(jm2.publicationState, "hold-provenance");

    // BBC El Arish Howard Johnson report
    const bbcVid = intakeVideos.find((v) => v.youtubeId === "0ExS0XCVk0E");
    assert.ok(bbcVid);
    assert.equal(bbcVid.id, "vid-ap-1998-dahanieh-open-soon");
    assert.equal(bbcVid.rights.holder, "BBC News");
    assert.equal(bbcVid.publicationState, "staging");

    // Motaz montage
    const motazVid = intakeVideos.find((v) => v.youtubeId === "yFF4KY-mQk0");
    assert.ok(motazVid);
    assert.equal(motazVid.id, "vid-afp-grounded-peace");
    assert.equal(motazVid.rights.holder, "Motaz Ayyad");
    assert.equal(motazVid.publicationState, "staging");

    // AP 1998 opening
    const apVid = intakeVideos.find((v) => v.youtubeId === "vYodi28td20");
    assert.ok(apVid);
    assert.equal(apVid.id, "vid-afp-2014-ruins");
    assert.equal(apVid.rights.holder, "Associated Press");
    assert.equal(apVid.publicationState, "staging");

    // AFP 2018 report
    const afpVid = intakeVideos.find((v) => v.youtubeId === "gaSe8Pbmm5Q");
    assert.ok(afpVid);
    assert.equal(afpVid.id, "vid-bbc-2012-el-arish");
    assert.equal(afpVid.rights.holder, "AFP News Agency");
    assert.equal(afpVid.publicationState, "staging");

    // Al Jazeera 2009 ruins report
    const ajVid = intakeVideos.find((v) => v.youtubeId === "-k3kR5f3nYY");
    assert.ok(ajVid);
    assert.equal(ajVid.id, "vid-aljazeera-ruins");
    assert.equal(ajVid.rights.holder, "Al Jazeera Arabic");
    assert.equal(ajVid.publicationState, "staging");

    // Exactly 4 verified video SourceRecords in SOURCE_REGISTRY
    const registryVideoSources = getAllSourceRecords().filter((s) => s.type === "video");
    assert.equal(registryVideoSources.length, 4);
    const sourceIds = registryVideoSources.map((s) => s.id).sort();
    assert.deepEqual(sourceIds, [
      "src-video-afp-2018",
      "src-video-aljazeera-2009",
      "src-video-ap-1998-opening",
      "src-video-clinton-1998",
    ]);

    // Neither the 3 held videos nor the 5 staging videos are marked published
    for (const v of intakeVideos) {
      assert.notEqual(v.publicationState, "published", `Video ${v.id} must never have published state`);
    }
  });

  // HC2-C2-4: Registry and catalog counts invariant
  it("HC2-C2-4: Guarantees exact machine counts for source registry (13) and catalog records (67)", () => {
    const allSources = getAllSourceRecords();
    assert.equal(allSources.length, 13, "SOURCE_REGISTRY must have exactly 13 records (9 text/official + 4 video)");

    const textSources = allSources.filter((s) => s.type !== "video");
    const videoSources = allSources.filter((s) => s.type === "video");
    assert.equal(textSources.length, 9, "Must have exactly 9 non-video sources");
    assert.equal(videoSources.length, 4, "Must have exactly 4 video sources");

    // Catalog records
    const publishedRecords = getPublishedArchiveRecords();
    assert.equal(publishedRecords.length, 38, "38 records published (37 owner intake + 1 Gisha ruins)");
    const gishaRecord = publishedRecords.find((r) => r.id === "rec-present-ruins-2008");
    assert.ok(gishaRecord, "rec-present-ruins-2008 must be published");
    assert.equal(gishaRecord?.mediaId, "airport-present-ruins-2008");

    const intakeRecords = getIntakeArchiveRecords();
    assert.equal(intakeRecords.length, 67, "Must have exactly 67 intake catalog records (58 owner intake + 8 videos + 1 Gisha)");

    const stagingVideos = intakeRecords.filter((r) => r.medium === "video" && r.publicationState === "staging");
    const heldVideos = intakeRecords.filter((r) => r.medium === "video" && r.publicationState === "hold-provenance");
    assert.equal(stagingVideos.length, 5, "5 videos in staging");
    assert.equal(heldVideos.length, 3, "3 videos in hold-provenance");

    const ownerIntake = intakeRecords.filter((r) => r.id.startsWith("past-"));
    assert.equal(ownerIntake.length, 58, "Must have all 58 owner intake records");
    const ownerPublished = ownerIntake.filter((r) => r.publicationState === "published");
    assert.equal(ownerPublished.length, 37, "Must have exactly 37 owner intake records published");
    const ownerHeld = ownerIntake.filter((r) => r.publicationState.startsWith("hold-"));
    assert.equal(ownerHeld.length, 18, "Must have 18 owner intake records held");
    const ownerExcluded = ownerIntake.filter((r) => r.publicationState === "excluded");
    assert.equal(ownerExcluded.length, 2, "Must have 2 owner intake records excluded (past-004 illustration, past-052 duplicate)");
    const ownerStaging = ownerIntake.filter((r) => r.publicationState === "staging");
    assert.equal(ownerStaging.length, 1, "Must have 1 owner intake record in staging (past-037)");
  });

  // HC2-C3-1: Documentation source identities & treaty airspace jurisdiction integrity
  it("HC2-C3-1: Enforces accurate documentation identities, Oslo II Article XIII airspace security, and distinct video source references", () => {
    // 1. Verify docs/ATTRIBUTIONS.md contents
    const attributionsPath = new URL("../../docs/ATTRIBUTIONS.md", import.meta.url);
    const attributionsText = readFileSync(attributionsPath, "utf8");

    // Oslo II aviation provision is Article XIII (Security of the Airspace), NOT Article IX
    assert.ok(
      attributionsText.includes("Article XIII (Security of the Airspace)"),
      "ATTRIBUTIONS.md must cite Oslo II Annex I Article XIII",
    );
    assert.ok(
      !attributionsText.includes("Article IX (Passenger Terminal and Airfield)"),
      "ATTRIBUTIONS.md must not assign aviation provisions to Article IX",
    );
    assert.ok(
      !attributionsText.includes("Article IX"),
      "ATTRIBUTIONS.md must contain no erroneous Article IX references",
    );

    // Press publishers in ATTRIBUTIONS.md
    assert.ok(
      attributionsText.includes("The New York Times — Opening (`src-ap-1998-opening`)"),
      "ATTRIBUTIONS.md must identify src-ap-1998-opening as The New York Times",
    );
    assert.ok(
      attributionsText.includes("The Washington Post — State Dedication (`src-ap-1998-clinton`)"),
      "ATTRIBUTIONS.md must identify src-ap-1998-clinton as The Washington Post",
    );
    assert.ok(
      !attributionsText.includes("Story No. 008779"),
      "ATTRIBUTIONS.md must not contain obsolete AP Story No. 008779 for NYT press source",
    );
    assert.ok(
      !attributionsText.includes("Story No. 010041"),
      "ATTRIBUTIONS.md must not contain obsolete AP Story No. 010041 for WaPo press source",
    );

    // Video references in ATTRIBUTIONS.md
    assert.ok(
      attributionsText.includes("Authoritative External Video References (HC-2)"),
      "ATTRIBUTIONS.md must include dedicated video references section",
    );
    assert.ok(
      attributionsText.includes("src-video-ap-1998-opening"),
      "ATTRIBUTIONS.md must document src-video-ap-1998-opening",
    );
    assert.ok(
      attributionsText.includes("src-video-clinton-1998"),
      "ATTRIBUTIONS.md must document src-video-clinton-1998",
    );

    // 2. Verify SOURCE_REGISTRY publishers and types
    const nyt = SOURCE_REGISTRY["src-ap-1998-opening"];
    assert.ok(nyt);
    assert.equal(nyt.publisher, "The New York Times");
    assert.equal(nyt.type, "press");
    assert.equal(nyt.eventDate, "1998-11-24");
    assert.equal(nyt.publicationDate, "1998-11-25");

    const wapo = SOURCE_REGISTRY["src-ap-1998-clinton"];
    assert.ok(wapo);
    assert.equal(wapo.publisher, "The Washington Post");
    assert.equal(wapo.type, "press");
    assert.equal(wapo.eventDate, "1998-12-14");
    assert.equal(wapo.publicationDate, "1998-12-15");

    const apVid = SOURCE_REGISTRY["src-video-ap-1998-opening"];
    assert.ok(apVid);
    assert.equal(apVid.publisher, "AP Archive");
    assert.equal(apVid.type, "video");
    assert.equal(apVid.eventDate, "1998-11-24");

    const clintonVid = SOURCE_REGISTRY["src-video-clinton-1998"];
    assert.ok(clintonVid);
    assert.equal(clintonVid.publisher, "William J. Clinton Presidential Library");
    assert.equal(clintonVid.type, "video");
    assert.equal(clintonVid.eventDate, "1998-12-14");

    // All 4 video sources have distinct IDs and live/official URLs
    const videoSources = [
      SOURCE_REGISTRY["src-video-ap-1998-opening"],
      SOURCE_REGISTRY["src-video-clinton-1998"],
      SOURCE_REGISTRY["src-video-aljazeera-2009"],
      SOURCE_REGISTRY["src-video-afp-2018"],
    ];
    for (const vs of videoSources) {
      assert.ok(vs, "Video source must exist in SOURCE_REGISTRY");
      assert.equal(vs.type, "video");
      assert.match(vs.url, /^https:\/\/www\.youtube\.com\/watch\?v=/);
    }
  });

  // HC2-C3-2: Clinton video upstream verification, publication date, event date, and FOIA collection provenance
  it("HC2-C3-2: Reconciles Clinton video upstream upload date (2017-08-30), historical event date (1998-12-14), and FOIA collection provenance", () => {
    const clintonVid = SOURCE_REGISTRY["src-video-clinton-1998"];
    assert.ok(clintonVid, "src-video-clinton-1998 must exist");
    assert.equal(clintonVid.publicationDate, "2017-08-30", "Verified YouTube upstream uploadDate is 2017-08-30 (not 2021-08-10)");
    assert.equal(clintonVid.eventDate, "1998-12-14", "Event date must remain 1998-12-14 (Clinton ribbon-cutting dedication)");
    assert.equal(clintonVid.url, "https://www.youtube.com/watch?v=tBht5QeKHaA");
    assert.equal(clintonVid.publisher, "William J. Clinton Presidential Library");

    // Bilingual notes document White House Communications Agency and FOIA request 2017-0234-F
    assert.match(clintonVid.notes, /White House Communications Agency \(WHCA\)/);
    assert.match(clintonVid.notes, /FOIA request 2017-0234-F/);
    assert.match(clintonVid.notes, /August 30, 2017/);
    assert.ok(clintonVid.notesAr, "Arabic notes must be present");
    assert.match(clintonVid.notesAr, /وكالة الاتصالات بالبيت الأبيض/);
    assert.match(clintonVid.notesAr, /2017-0234-F/);
    assert.match(clintonVid.notesAr, /30 آب\/أغسطس 2017/);

    // Intake archive record vid-journeyman-2002 remains isolated in hold-provenance
    const intakeVid = getArchiveRecordById("vid-journeyman-2002", true);
    assert.ok(intakeVid);
    assert.equal(intakeVid.youtubeId, "tBht5QeKHaA");
    assert.equal(intakeVid.publicationState, "hold-provenance");
    assert.ok(!getPublishedArchiveRecords().some((r) => r.id === "vid-journeyman-2002"));
  });

  // HC2-C3-3: World Bank distinct identifier roles, traffic decoupling, and financing discrepancy documentation
  it("HC2-C3-3: Enforces World Bank distinct identifier roles (Report No. 69315 vs Project ID P100971), traffic decoupling, and financing explanation", () => {
    const wb = SOURCE_REGISTRY["src-worldbank-2007"];
    assert.ok(wb);

    // Clean human title without forced report number
    assert.equal(wb.title, "West Bank and Gaza - Transport Sector Strategy Note");
    assert.equal(wb.titleAr, "الضفة الغربية وقطاع غزة — مذكرة استراتيجية قطاع النقل");

    // Distinct identifier roles documented in notes
    assert.match(wb.notes, /Report No\. 69315/);
    assert.match(wb.notes, /Project ID P100971/);
    assert.ok(wb.notesAr);
    assert.match(wb.notesAr, /تقرير رقم 69315/);
    assert.match(wb.notesAr, /معرّف المشروع P100971/);

    // Traffic semantics unambiguously decoupled: 60k total airport pax / 1,168 flights; 41k PAL pax
    assert.match(wb.notes, /about 60,000 total airport passengers across 1,168 total airport flights/);
    assert.match(wb.notes, /about 41,000 passengers travelled with Palestinian Airlines/);
    assert.match(wb.notesAr, /نحو 60 ألف مسافر إجمالي بالمطار عبر 1,168 رحلة للمطار/);
    assert.match(wb.notesAr, /سافر نحو 41 ألف مسافر عبر الخطوط الفلسطينية/);

    // Financing discrepancy documented in notes: Section 2.5 ($86.5M) vs Annex Table 20 ($86.7M, PA land $7.4M, loans $39.6M, grants $39.7M)
    assert.match(wb.notes, /Section 2\.5/);
    assert.match(wb.notes, /\$86\.5M/);
    assert.match(wb.notes, /Annex Table 20/);
    assert.match(wb.notes, /\$86\.7M/);
    assert.match(wb.notes, /\$7\.4M PA land contribution/);
    assert.match(wb.notes, /\$39\.6M soft loans/);
    assert.match(wb.notes, /\$39\.7M grants/);

    assert.match(wb.notesAr, /القسم 2\.5/);
    assert.match(wb.notesAr, /86\.5 مليون دولار/);
    assert.match(wb.notesAr, /جدول الملحق 20/);
    assert.match(wb.notesAr, /86\.7 مليون دولار/);
    assert.match(wb.notesAr, /7\.4 مليون مساهمة أرض/);
    assert.match(wb.notesAr, /39\.6 مليون قروض ميسرة/);
    assert.match(wb.notesAr, /39\.7 مليون منح/);

    // Timeline planning body mentions PA land, soft loans, and international donor grants
    const planning = publishedAirportPast.timeline.find((t) => t.id === "planning");
    assert.ok(planning);
    assert.match(planning.body.en, /Palestinian Authority land contribution, soft loans, and international donor grants/);
    assert.match(planning.body.ar, /مساهمة السلطة الفلسطينية في توفير الأرض، وقروض ميسرة، ومنح المانحين الدوليين/);

    // Timeline operations body mentions 60,000 passengers across 1,168 flights, and 41,000 on PAL
    const operations = publishedAirportPast.timeline.find((t) => t.id === "operations");
    assert.ok(operations);
    assert.match(operations.body.en, /about 60,000 passengers across 1,168 flights/);
    assert.match(operations.body.en, /about 41,000 passengers travelling on Palestinian Airlines/);
    assert.match(operations.body.ar, /نحو 60 ألف مسافر في 1,168 رحلة/);
    assert.match(operations.body.ar, /سافر نحو 41 ألفاً منهم على متن الخطوط الجوية الفلسطينية/);
  });
});

describe("HC-3 Owner Archive Visual Integration Invariants", () => {
  it("HC3-1: Basis-specific publication and schema validation decouple display authorization from license clearance", () => {
    const published = getPublishedArchiveRecords();
    assert.equal(published.length, 38, "Must have exactly 38 published records");

    for (const record of published) {
      const parsed = archiveRecordSchema.safeParse(record);
      assert.ok(parsed.success, `Record ${record.id} must satisfy archiveRecordSchema: ${JSON.stringify(parsed.error?.issues)}`);

      if (record.publicationBasis === "rights-cleared") {
        assert.equal(record.id, "rec-present-ruins-2008");
        assert.equal(record.rights.status, "licensed");
        assert.ok(record.rights.licenseUrl && record.rights.licenseUrl.startsWith("http"));
        assert.equal(record.evidenceStatus, "verified");
        assert.ok(record.sourceRefs.length > 0);
      } else if (record.publicationBasis === "product-owner-directed-display") {
        assert.equal(record.rights.status, "unknown", `${record.id} must preserve honest unknown rights status`);
        assert.ok(record.rights.credit.trim().length > 0, `${record.id} must provide credit statement`);
        assert.ok(record.mediaId, `${record.id} must have mediaId`);
        assert.equal(
          APPROVED_MEDIA_CATALOG[record.mediaId! as keyof typeof APPROVED_MEDIA_CATALOG],
          "historical-documentary",
          `${record.mediaId} must be historical-documentary`,
        );
      } else {
        assert.fail(`Unexpected publication basis: ${record.publicationBasis}`);
      }
    }
  });

  it("HC3-2: Canonical accounting of all 58 intake files, 18 holds, 2 excluded, 1 staging, and 0 leakages", () => {
    const allIntake = getIntakeArchiveRecords();
    const ownerIntake = allIntake.filter((r) => r.id.startsWith("past-"));
    assert.equal(ownerIntake.length, 58, "All 58 owner files must be represented");

    const published = ownerIntake.filter((r) => r.publicationState === "published");
    assert.equal(published.length, 37, "Exactly 37 owner intake records published");

    const held = ownerIntake.filter((r) => r.publicationState.startsWith("hold-"));
    assert.equal(held.length, 18, "Exactly 18 owner intake records held");

    const excluded = ownerIntake.filter((r) => r.publicationState === "excluded");
    assert.equal(excluded.length, 2, "Exactly 2 owner intake records excluded (past-004, past-052)");

    const staging = ownerIntake.filter((r) => r.publicationState === "staging");
    assert.equal(staging.length, 1, "Exactly 1 owner intake record in staging (past-037)");

    // Verify duplicate exclusion
    const rec52 = getArchiveRecordById("past-052", true);
    assert.ok(rec52);
    assert.equal(rec52.duplicateOf, "past-050");
    assert.equal(rec52.publicationState, "excluded");

    // Verify illustration exclusion
    const rec04 = getArchiveRecordById("past-004", true);
    assert.ok(rec04);
    assert.equal(rec04.medium, "illustration");
    assert.equal(rec04.publicationState, "excluded");

    // Verify no held or excluded records leak into public selector
    const publicRecords = getPublishedArchiveRecords();
    for (const h of held) {
      assert.ok(!publicRecords.some((p) => p.id === h.id), `Held record ${h.id} must not leak`);
    }
    assert.ok(!publicRecords.some((p) => p.id === "past-052"), "past-052 must not leak");
    assert.ok(!publicRecords.some((p) => p.id === "past-004"), "past-004 must not leak");
    assert.ok(!publicRecords.some((p) => p.id === "past-037"), "past-037 must not leak");
  });

  it("HC3-3: Canonical featured six selector returns diverse, non-empty, published records", () => {
    const featured = getFeaturedArchiveRecords(6);
    assert.equal(featured.length, 6, "Must return exactly 6 featured records");

    const ids = featured.map((r) => r.id);
    assert.equal(new Set(ids).size, 6, "Featured records must all be unique");

    // Must all be published
    for (const rec of featured) {
      assert.equal(rec.publicationState, "published");
    }

    // Must cover diverse subjects / categories
    const subjects = new Set(featured.flatMap((r) => r.subjects));
    assert.ok(subjects.has("airport-architecture"), "Featured must include architecture");
    assert.ok(subjects.has("interior-passenger-spaces"), "Featured must include interior");
    assert.ok(subjects.has("aircraft-fleet") || subjects.has("operations-services"), "Featured must include aircraft or operations");
    assert.ok(subjects.has("crew-staff") || subjects.has("passengers-pilgrimage"), "Featured must include people");
    assert.ok(subjects.has("documents-ephemera"), "Featured must include documents/ephemera");
    assert.ok(subjects.has("damage-ruins"), "Featured must include ruins/present evidence");
  });

  it("HC3-4: External video references are strictly decoupled from local media publication", () => {
    const videos = getVerifiedVideoReferences();
    assert.equal(videos.length, 4, "Must have exactly 4 verified video references");

    const expectedIds = ["src-video-afp-2018", "src-video-aljazeera-2009", "src-video-ap-1998-opening", "src-video-clinton-1998"];
    const actualIds = videos.map((v) => v.sourceRef).sort();
    assert.deepEqual(actualIds, expectedIds);

    for (const v of videos) {
      assert.ok(v.youtubeId && v.youtubeId.length > 5, `Invalid youtubeId for ${v.id}`);
      assert.ok(v.title.en && v.title.ar, `Missing bilingual title for ${v.id}`);
      assert.ok(v.publisher && v.publisher.length > 0, `Missing publisher for ${v.id}`);
      assert.ok(v.date && v.date.length >= 4, `Invalid date for ${v.id}`);
    }

    // Ensure none of the 8 internal video intake records are marked published
    const intakeRecords = getIntakeArchiveRecords();
    const videoIntake = intakeRecords.filter((r) => r.medium === "video");
    assert.equal(videoIntake.length, 8);
    for (const vi of videoIntake) {
      assert.notEqual(vi.publicationState, "published", `Video intake ${vi.id} cannot be published as local media`);
      assert.equal(vi.mediaId, undefined, `Video intake ${vi.id} must not have a local mediaId`);
    }
  });

  it("HC3-5: Gallery items unify photos and videos, and derive filter options without empty choices", () => {
    const galleryItems = getGalleryItems();
    assert.equal(galleryItems.length, 42, "38 published photos/documents + 4 verified videos = 42 gallery items");

    const videoItems = galleryItems.filter((i) => i.medium === "video");
    const photoItems = galleryItems.filter((i) => i.medium === "photograph");
    const docItems = galleryItems.filter((i) => i.medium === "document");

    assert.equal(videoItems.length, 4);
    assert.equal(photoItems.length, 37);
    assert.equal(docItems.length, 1);

    const filters = getDerivedFilterOptions(galleryItems);
    assert.deepEqual(filters.mediums, ["document", "photograph", "video"]);
    assert.ok(filters.phases.length >= 3, "Must have at least 3 phases");
    assert.ok(filters.subjects.length >= 6, "Must have at least 6 distinct subjects");

    // Every item must have valid title, alt or caption, and subjects
    for (const item of galleryItems) {
      assert.ok(item.title.en.trim().length > 0);
      assert.ok(item.title.ar.trim().length > 0);
      assert.ok(item.subjects.length > 0);
    }
  });

  it("HC3-6: Media registry enforces documentary classification on all 37 owner derivatives", () => {
    const published = getPublishedArchiveRecords().filter((r) => r.id.startsWith("past-"));
    assert.equal(published.length, 37);

    for (const rec of published) {
      assert.ok(rec.mediaId, `Record ${rec.id} must have mediaId`);
      const truthClass = APPROVED_MEDIA_CATALOG[rec.mediaId! as keyof typeof APPROVED_MEDIA_CATALOG];
      assert.equal(truthClass, "historical-documentary");
    }
  });

  // HC3-7: Adversarial tests for publication basis validation bypasses
  it("HC3-7: Adversarial tests reject all publication basis bypasses and enforce positive eligibility", () => {
    const validPublic = getArchiveRecordById("past-003", true)!;
    assert.ok(validPublic, "past-003 must exist");
    const held002 = getArchiveRecordById("past-002", true)!;
    assert.ok(held002, "past-002 must exist");

    // Case 1: owner-directed with missing curatorPublicationStatus and missing intakeReference
    const case1 = {
      ...validPublic,
      curatorPublicationStatus: undefined,
      intakeReference: undefined,
    };
    const res1 = archiveRecordSchema.safeParse(case1);
    assert.equal(res1.success, false, "Must reject owner-directed record with missing curatorPublicationStatus / intakeReference");

    // Case 2: owner-directed with rights-managed status and Getty Images holder
    const case2 = {
      ...validPublic,
      rights: {
        status: "rights-managed" as const,
        holder: "Getty Images",
        credit: "Getty Images",
      },
    };
    const res2 = archiveRecordSchema.safeParse(case2);
    assert.equal(res2.success, false, "Must reject owner-directed display with rights-managed / Getty Images");

    // Case 3: local photograph with mediaId, curatorPublicationStatus hold-rights, rights-managed, changed to external-embed with arbitrary youtubeId
    const case3 = {
      ...held002,
      publicationBasis: "external-embed" as const,
      publicationState: "published" as const,
      youtubeId: "dQw4w9WgXcQ",
    };
    const res3 = archiveRecordSchema.safeParse(case3);
    assert.equal(res3.success, false, "Must reject local media masquerading as external-embed with arbitrary youtubeId");

    // Case 4: Swapping originalFilename from held past-002 while retaining eligible past-003 identity
    const case4a = {
      ...validPublic,
      originalFilename: held002.originalFilename,
    };
    const res4a = archiveRecordSchema.safeParse(case4a);
    assert.equal(res4a.success, false, "Must reject past-003 with substituted held past-002 filename");

    // Case 4b: Swapping held filename AND unrelated mediaId (airport-archive-hero-2000)
    const case4b = {
      ...validPublic,
      originalFilename: held002.originalFilename,
      mediaId: "airport-archive-hero-2000",
    };
    const res4b = archiveRecordSchema.safeParse(case4b);
    assert.equal(res4b.success, false, "Must reject substituted filename and unrelated mediaId");

    // Case 4c: Swapping mediaId to past-005 while retaining past-003 identity
    const case4c = {
      ...validPublic,
      mediaId: "past-005",
    };
    const res4c = archiveRecordSchema.safeParse(case4c);
    assert.equal(res4c.success, false, "Must reject swapped mediaId past-005 on past-003");

    // Case 4d: Swapping arbitrary originalFilename
    const case4d = {
      ...validPublic,
      originalFilename: "arbitrary-renamed-file.jpg",
    };
    const res4d = archiveRecordSchema.safeParse(case4d);
    assert.equal(res4d.success, false, "Must reject arbitrary non-audited originalFilename");

    // Case 4e: Swapping medium to document on photograph past-003
    const case4e = {
      ...validPublic,
      medium: "document" as const,
    };
    const res4e = archiveRecordSchema.safeParse(case4e);
    assert.equal(res4e.success, false, "Must reject non-audited medium on past-003");

    // Case 4f: Swapping intakeReference on past-003
    const case4f = {
      ...validPublic,
      intakeReference: "past-005",
    };
    const res4f = archiveRecordSchema.safeParse(case4f);
    assert.equal(res4f.success, false, "Must reject mismatched intakeReference on past-003");

    // Case 5: Held identity spoofing (past-001 or past-013 given staging-rights-review)
    const heldRec = getArchiveRecordById("past-001", true)!;
    assert.ok(heldRec, "past-001 must exist");
    const case5 = {
      ...heldRec,
      publicationBasis: "product-owner-directed-display" as const,
      publicationState: "published" as const,
      curatorPublicationStatus: "staging-rights-review",
      intakeReference: "past-001",
      mediaId: "past-001",
    };
    const res5 = archiveRecordSchema.safeParse(case5);
    assert.equal(res5.success, false, "Must reject held ID past-001 attempting to publish under owner display");

    // Case 6: Non-intake ID spoofing (e.g. past-999)
    const case6 = {
      ...validPublic,
      id: "past-999",
      slug: "past-999-fake",
      intakeReference: "past-999",
    };
    const res6 = archiveRecordSchema.safeParse(case6);
    assert.equal(res6.success, false, "Must reject non-audited ID past-999 under owner display");

    // Case 7: External embed with mismatched or non-video sourceRef
    const case7a = {
      ...validPublic,
      medium: "video" as const,
      mediaId: undefined,
      publicationBasis: "external-embed" as const,
      youtubeId: "vYodi28td20",
      sourceRefs: ["src-oslo-ii-1995"], // treaty, not video
    };
    const res7a = archiveRecordSchema.safeParse(case7a);
    assert.equal(res7a.success, false, "Must reject external embed with non-video sourceRef");

    const case7b = {
      ...validPublic,
      medium: "video" as const,
      mediaId: undefined,
      publicationBasis: "external-embed" as const,
      youtubeId: "tBht5QeKHaA", // Clinton ID
      sourceRefs: ["src-video-afp-2018"], // valid video source, but URL has gaSe8Pbmm5Q
    };
    const res7b = archiveRecordSchema.safeParse(case7b);
    assert.equal(res7b.success, false, "Must reject external embed with mismatched youtubeId and sourceRef URL");

    // Case 7c: External embed with HTTP (non-HTTPS) source URL
    const apSource = SOURCE_REGISTRY["src-video-ap-1998-opening"];
    const origApUrl = apSource.url;
    try {
      apSource.url = "http://www.youtube.com/watch?v=vYodi28td20";
      const case7c = {
        ...validPublic,
        medium: "video" as const,
        mediaId: undefined,
        publicationBasis: "external-embed" as const,
        youtubeId: "vYodi28td20",
        sourceRefs: ["src-video-ap-1998-opening"],
      };
      assert.equal(archiveRecordSchema.safeParse(case7c).success, false, "Must reject external embed with HTTP source URL");

      // Case 7d: External embed with spoofed host URL
      apSource.url = "https://example.com/youtube.com/watch?v=vYodi28td20";
      assert.equal(archiveRecordSchema.safeParse(case7c).success, false, "Must reject external embed with spoofed host URL");
    } finally {
      apSource.url = origApUrl;
    }

    // Case 8: Universal licensing obligations across all publication bases
    const case8 = {
      ...validPublic,
      rights: {
        status: "licensed" as const,
        license: "", // empty license name
        licenseUrl: "https://example.com/license",
        credit: "Some Credit",
      },
    };
    const res8 = archiveRecordSchema.safeParse(case8);
    assert.equal(res8.success, false, "Must reject licensed record with empty license name even under owner display");

    // Positive Test 1: All 37 real eligible owner records pass validation
    for (const id of ELIGIBLE_OWNER_INTAKE_IDS) {
      const rec = getArchiveRecordById(id, true);
      assert.ok(rec, `Eligible record ${id} must exist in catalog`);
      const res = archiveRecordSchema.safeParse(rec);
      assert.equal(res.success, true, `Real eligible record ${id} must pass schema validation`);
    }

    // Positive Test 2: Legitimate Gisha licensed record passes
    const gisha = getArchiveRecordById("rec-present-ruins-2008")!;
    assert.ok(gisha);
    const resGisha = archiveRecordSchema.safeParse(gisha);
    assert.equal(resGisha.success, true, "Gisha licensed record must pass validation");
  });

  // HC3-8: Timeline media associations derive from canonical records and exclude operational interiors from destruction
  it("HC3-8: Timeline selectors derive from canonical relatedTimelineEventIds and exclude operational interiors from destruction", () => {
    // 1. Operational counters (past-045) and security (past-051) must be in operations
    const opPhotos = getPublishedArchiveRecordsForTimelineEvent("operations");
    const opIds = opPhotos.map((p) => p.id);
    assert.ok(opIds.includes("past-045"), "past-045 (counters) must be associated with operations");
    assert.ok(opIds.includes("past-051"), "past-051 (security screening) must be associated with operations");
    assert.ok(opIds.includes("past-007"), "past-007 (crew) must be associated with operations");
    assert.ok(opIds.includes("past-050"), "past-050 (waiting hall) must be associated with operations");
    assert.ok(opIds.includes("past-054"), "past-054 (passport stamp) must be associated with operations");

    // 2. Closure/destruction must strictly EXCLUDE operational interiors past-045 and past-051
    const closurePhotos = getPublishedArchiveRecordsForTimelineEvent("closure");
    const closureIds = closurePhotos.map((p) => p.id);
    assert.ok(!closureIds.includes("past-045"), "past-045 must NOT be in closure/destruction");
    assert.ok(!closureIds.includes("past-051"), "past-051 must NOT be in closure/destruction");
    // Closure must only contain records of damage/destruction
    for (const cp of closurePhotos) {
      assert.ok(cp.subjects.includes("damage-ruins") || cp.phase === "closure-destruction", `${cp.id} must be genuine damage/ruins record`);
    }

    // 3. Memory must contain genuine ruins record
    const memoryPhotos = getPublishedArchiveRecordsForTimelineEvent("memory");
    const memoryIds = memoryPhotos.map((p) => p.id);
    assert.ok(memoryIds.includes("rec-present-ruins-2008"), "rec-present-ruins-2008 must be in memory");

    // 4. Planning chapter has no unsupported architectural associations fabricated
    const planningPhotos = getPublishedArchiveRecordsForTimelineEvent("planning");
    assert.deepEqual(planningPhotos, [], "Planning chapter must return empty strip rather than unsupported photos");

    // 5. Selectors reject held and duplicate records even if requested
    const allPublished = getPublishedArchiveRecords();
    for (const eventId of ["planning", "opening", "operations", "closure", "memory"]) {
      const records = getPublishedArchiveRecordsForTimelineEvent(eventId);
      for (const r of records) {
        assert.equal(r.publicationState, "published", `Timeline record ${r.id} must be published`);
        assert.equal(r.duplicateOf, undefined, `Timeline record ${r.id} must not be a duplicate alias`);
      }
    }
  });

  // HC3-9: External video references resolve dynamically from SOURCE_REGISTRY and distinguish event from upload dates
  it("HC3-9: External video references resolve dynamically from SOURCE_REGISTRY with distinct event/upload dates", () => {
    const videos = getVerifiedVideoReferences();
    assert.equal(videos.length, 4, "Must return exactly 4 verified video references");

    // 1. Verify AFP eventDate (month precision 2018-09) is distinct from publication/upload date (2018-09-12)
    const afpVideo = videos.find((v) => v.sourceRef === "src-video-afp-2018")!;
    assert.ok(afpVideo, "AFP video reference must exist");
    assert.equal(afpVideo.date, "2018-09", "Event date for AFP must be 2018-09");
    assert.equal(afpVideo.datePrecision, "month", "AFP datePrecision must be month");
    assert.equal(afpVideo.uploadDate, "2018-09-12", "AFP uploadDate must be exact 2018-09-12");

    // 2. Verify all four known source IDs and their YouTube IDs
    const expectedMappings: Record<string, string> = {
      "src-video-ap-1998-opening": "vYodi28td20",
      "src-video-clinton-1998": "tBht5QeKHaA",
      "src-video-aljazeera-2009": "-k3kR5f3nYY",
      "src-video-afp-2018": "gaSe8Pbmm5Q",
    };
    for (const v of videos) {
      assert.equal(v.youtubeId, expectedMappings[v.sourceRef], `YouTube ID mismatch for ${v.sourceRef}`);
      assert.ok(v.url.includes(v.youtubeId), `URL must contain YouTube ID for ${v.sourceRef}`);
    }

    // 3. Verify dynamic resolution: mutating SOURCE_REGISTRY publisher is reflected
    const originalPublisher = SOURCE_REGISTRY["src-video-ap-1998-opening"].publisher;
    try {
      SOURCE_REGISTRY["src-video-ap-1998-opening"].publisher = "Dynamic AP Archive Test";
      const updatedVideos = getVerifiedVideoReferences();
      const updatedAP = updatedVideos.find((v) => v.sourceRef === "src-video-ap-1998-opening")!;
      assert.equal(updatedAP.publisher, "Dynamic AP Archive Test", "Publisher change must be dynamically reflected");
    } finally {
      SOURCE_REGISTRY["src-video-ap-1998-opening"].publisher = originalPublisher;
    }

    // 4. In-memory temporary URL mutation tests for security & identity enforcement
    const originalApUrl = SOURCE_REGISTRY["src-video-ap-1998-opening"].url;
    try {
      // Insecure HTTP URL -> excluded from verified video references
      SOURCE_REGISTRY["src-video-ap-1998-opening"].url = "http://www.youtube.com/watch?v=vYodi28td20";
      const httpVids = getVerifiedVideoReferences();
      assert.equal(httpVids.find((v) => v.sourceRef === "src-video-ap-1998-opening"), undefined, "Insecure HTTP video source must be excluded from projection");

      // Spoofed host URL -> excluded from verified video references
      SOURCE_REGISTRY["src-video-ap-1998-opening"].url = "https://example.com/youtube.com/watch?v=vYodi28td20";
      const spoofVids = getVerifiedVideoReferences();
      assert.equal(spoofVids.find((v) => v.sourceRef === "src-video-ap-1998-opening"), undefined, "Spoofed host video source must be excluded from projection");

      // Changed video identity (Clinton ID on AP source) -> excluded because expectedYouTubeId mismatches
      SOURCE_REGISTRY["src-video-ap-1998-opening"].url = "https://www.youtube.com/watch?v=tBht5QeKHaA";
      const changedVids = getVerifiedVideoReferences();
      assert.equal(changedVids.find((v) => v.sourceRef === "src-video-ap-1998-opening"), undefined, "Mismatched video ID on AP source must be excluded to prevent attaching AP presentation to Clinton video");
    } finally {
      SOURCE_REGISTRY["src-video-ap-1998-opening"].url = originalApUrl;
    }

    // 5. extractVerifiedYouTubeId unit test coverage
    assert.equal(extractVerifiedYouTubeId("https://www.youtube.com/watch?v=vYodi28td20"), "vYodi28td20");
    assert.equal(extractVerifiedYouTubeId("https://youtu.be/vYodi28td20"), "vYodi28td20");
    assert.equal(extractVerifiedYouTubeId("https://www.youtube-nocookie.com/embed/vYodi28td20"), "vYodi28td20");
    assert.equal(extractVerifiedYouTubeId("http://www.youtube.com/watch?v=vYodi28td20"), null);
    assert.equal(extractVerifiedYouTubeId("https://example.com/watch?v=vYodi28td20"), null);
    assert.equal(extractVerifiedYouTubeId("not-a-url"), null);
  });

  // HC3-10: Public rights copy and attribution consistency
  it("HC3-10: Gallery renders concise rights notice and excludes contradictory noticeBody block", () => {
    // 1. Verify concise public rights notice exists in EN and AR i18n
    assert.ok(en["gallery.publicRightsNotice"], "EN must have gallery.publicRightsNotice");
    assert.ok(ar["gallery.publicRightsNotice"], "AR must have gallery.publicRightsNotice");
    assert.ok(en["gallery.publicRightsNotice"].includes("Rights in historical photographs"));
    assert.ok(ar["gallery.publicRightsNotice"].includes("تبقى حقوق الصور والتسجيلات"));

    // 2. Verify Gallery route file does NOT render gallery.noticeBody
    const galleryRouteSource = readFileSync(
      new URL("../../src/routes/{-$locale}.gallery.tsx", import.meta.url),
      "utf8",
    );
    assert.ok(
      !galleryRouteSource.includes("gallery.noticeBody"),
      "Gallery route must NOT render contradictory gallery.noticeBody block",
    );

    // 3. Verify Gisha photograph retains exact CC BY-SA 2.0 Generic license
    const gisha = getArchiveRecordById("rec-present-ruins-2008")!;
    assert.equal(gisha.rights.license, "CC BY-SA 2.0 Generic");
    assert.equal(gisha.rights.licenseUrl, "https://creativecommons.org/licenses/by-sa/2.0/");
    assert.equal(gisha.rights.credit, "Gisha Access");
  });

  it("HC3-11: Public copy preserves unknown reuse rights and Future illustrative disclosure in both languages", () => {
    assert.ok(getPublishedArchiveRecords().some((record) => record.rights.status === "unknown"));
    assert.match(en["airport.sourcesBody"], /reuse rights remain unconfirmed/);
    assert.match(ar["airport.sourcesBody"], /لم تُثبت حقوق إعادة استخدامها/);
    assert.doesNotMatch(publishedAirportPast.intro.notice.en, /intake materials remain staged and held/);
    assert.equal(publishedAirportPast.intro.notice.en, en["airport.pastNotice"]);
    assert.equal(publishedAirportPast.intro.notice.ar, ar["airport.pastNotice"]);
    for (const dictionary of [en, ar]) {
      for (const key of ["gallery.sub", "airport.sourcesBody", "airport.pastNotice", "footer.rights"] as const) {
        assert.doesNotMatch(dictionary[key], /Cleared documentary photography|Unverified intake imagery remains held|صوراً مؤقتة|وفقاً للمعايير التوثيقية المؤسسية/);
      }
    }
    assert.match(en["footer.rights"], /respective owners/);
    assert.match(ar["footer.rights"], /حقوق الصور والتسجيلات التاريخية لأصحابها/);
    assert.match(en["footer.rights"], /Future imagery is illustrative, not historical evidence/);
    assert.match(ar["footer.rights"], /صور المستقبل توضيحية وليست أدلة تاريخية/);
  });
});
