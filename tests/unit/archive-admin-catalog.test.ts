import { it } from "node:test";
import assert from "node:assert/strict";
import { getIntakeArchiveRecords, getPublishedArchiveRecords } from "../../src/lib/archive/catalog.ts";
import { getAllSourceRecords, SOURCE_REGISTRY } from "../../src/lib/archive/sources.ts";
import { archiveRecordSchema } from "../../src/lib/archive/schema.ts";
import { APPROVED_MEDIA_CATALOG } from "../../src/lib/media-policy.ts";
import {
  DEFAULT_ARCHIVE_FILTERS,
  DEFAULT_MEDIA_FILTERS,
  DEFAULT_SOURCE_FILTERS,
  filterArchiveRecords,
  filterMediaRecords,
  filterSourceRecords,
  formatDateWithPrecision,
  getArchiveCatalogStats,
  getEvidenceStatusTone,
  getMediaCatalogStats,
  getPublicationStateTone,
  getRightsStatusTone,
  getSourceCatalogStats,
  isArchiveFilterActive,
  isMediaFilterActive,
  isSourceFilterActive,
} from "../../src/components/admin/archive/filter-helpers.ts";
import {
  archiveAdminAr,
  archiveAdminEn,
  type ArchiveAdminKey,
} from "../../src/lib/i18n-archive-admin.ts";

it("canonical archive baseline preserves exact record counts and schema validation", () => {
  const intake = getIntakeArchiveRecords();
  const published = getPublishedArchiveRecords();
  const sources = getAllSourceRecords();

  assert.equal(intake.length, 67, "Intake archive must contain exactly 67 canonical records");
  assert.equal(published.length, 38, "Published archive must contain exactly 38 compiled records");
  assert.equal(sources.length, 13, "Source registry must contain exactly 13 records");

  // Every single record must pass the strict archive schema
  for (const record of intake) {
    const parsed = archiveRecordSchema.safeParse(record);
    assert.ok(parsed.success, `Record ${record.id} failed schema validation: ${JSON.stringify(parsed.error?.issues)}`);
  }

  // Exactly 1 duplicate record (past-052 duplicate of past-050)
  const duplicates = intake.filter((r) => r.duplicateOf);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0]?.id, "past-052");
  assert.equal(duplicates[0]?.duplicateOf, "past-050");
  assert.equal(duplicates[0]?.publicationState, "excluded");

  // Exactly 2 excluded records: past-004 (render) and past-052 (duplicate)
  const excluded = intake.filter((r) => r.publicationState === "excluded");
  assert.equal(excluded.length, 2);
  const excludedIds = excluded.map((r) => r.id).sort();
  assert.deepEqual(excludedIds, ["past-004", "past-052"]);

  // Registered images vs external videos vs intake-only
  const withMedia = intake.filter((r) => r.mediaId);
  const withYoutube = intake.filter((r) => r.youtubeId);
  const intakeOnly = intake.filter((r) => !r.mediaId && !r.youtubeId);

  assert.equal(withMedia.length, 38, "Exactly 38 records have registered local media");
  assert.equal(withYoutube.length, 8, "Exactly 8 records have external YouTube video IDs");
  assert.equal(intakeOnly.length, 21, "Exactly 21 records have intake reference only");
  assert.equal(withMedia.length + withYoutube.length + intakeOnly.length, 67);

  // All 38 media IDs must be registered in APPROVED_MEDIA_CATALOG
  for (const r of withMedia) {
    assert.ok(r.mediaId! in APPROVED_MEDIA_CATALOG, `Media ID ${r.mediaId} must exist in APPROVED_MEDIA_CATALOG`);
  }
});

it("archive filter correctly filters records across all dimensions", () => {
  const records = getIntakeArchiveRecords();

  // Default filter returns all records
  const all = filterArchiveRecords(records, DEFAULT_ARCHIVE_FILTERS);
  assert.equal(all.length, 67);
  assert.equal(isArchiveFilterActive(DEFAULT_ARCHIVE_FILTERS), false);

  // Search by ID
  const byId = filterArchiveRecords(records, { ...DEFAULT_ARCHIVE_FILTERS, query: "past-001" });
  assert.equal(byId.length, 1);
  assert.equal(byId[0]?.id, "past-001");

  // Search by Arabic title keyword (e.g. ياسر عرفات)
  const byAr = filterArchiveRecords(records, { ...DEFAULT_ARCHIVE_FILTERS, query: "ياسر عرفات" });
  assert.ok(byAr.length >= 1, "Must find records mentioning Yasser Arafat in Arabic");

  // Medium filter: document vs photograph
  const docs = filterArchiveRecords(records, { ...DEFAULT_ARCHIVE_FILTERS, medium: "document" });
  assert.ok(docs.length >= 1);
  assert.ok(docs.every((r) => r.medium === "document"));

  const photos = filterArchiveRecords(records, { ...DEFAULT_ARCHIVE_FILTERS, medium: "photograph" });
  assert.ok(photos.length >= 50);
  assert.ok(photos.every((r) => r.medium === "photograph"));

  // Phase filter: opening-golden-era
  const goldenPhase = filterArchiveRecords(records, { ...DEFAULT_ARCHIVE_FILTERS, phase: "opening-golden-era" });
  assert.ok(goldenPhase.length > 0);
  assert.ok(goldenPhase.every((r) => r.phase === "opening-golden-era"));

  // Publication state filter: published vs hold-rights vs hold-provenance vs excluded
  const pub = filterArchiveRecords(records, { ...DEFAULT_ARCHIVE_FILTERS, publicationState: "published" });
  assert.equal(pub.length, 38);

  const holdRights = filterArchiveRecords(records, { ...DEFAULT_ARCHIVE_FILTERS, publicationState: "hold-rights" });
  assert.equal(holdRights.length, 9);

  const holdProvenance = filterArchiveRecords(records, { ...DEFAULT_ARCHIVE_FILTERS, publicationState: "hold-provenance" });
  assert.equal(holdProvenance.length, 12);

  const excl = filterArchiveRecords(records, { ...DEFAULT_ARCHIVE_FILTERS, publicationState: "excluded" });
  assert.equal(excl.length, 2);

  // Duplicate state filter
  const canonicalOnly = filterArchiveRecords(records, { ...DEFAULT_ARCHIVE_FILTERS, duplicateStatus: "canonical-only" });
  assert.equal(canonicalOnly.length, 66, "Canonical-only must exclude past-052");
  assert.ok(!canonicalOnly.some((r) => r.id === "past-052"));

  const duplicatesOnly = filterArchiveRecords(records, { ...DEFAULT_ARCHIVE_FILTERS, duplicateStatus: "duplicates-only" });
  assert.equal(duplicatesOnly.length, 1, "Duplicates-only must return only past-052");
  assert.equal(duplicatesOnly[0]?.id, "past-052");

  // Source coverage filter
  const withSrc = filterArchiveRecords(records, { ...DEFAULT_ARCHIVE_FILTERS, sourceCoverage: "has-sources" });
  assert.equal(withSrc.length, 5);
  assert.ok(withSrc.every((r) => r.sourceRefs.length > 0));

  const missingSrc = filterArchiveRecords(records, { ...DEFAULT_ARCHIVE_FILTERS, sourceCoverage: "missing-sources" });
  assert.equal(missingSrc.length, 62);
  assert.ok(missingSrc.every((r) => r.sourceRefs.length === 0));
  assert.equal(withSrc.length + missingSrc.length, 67);

  // Featured filter
  const featured = filterArchiveRecords(records, { ...DEFAULT_ARCHIVE_FILTERS, featured: "featured" });
  assert.ok(featured.length > 0);
  assert.ok(featured.every((r) => r.featured === true));
});

it("getArchiveCatalogStats aggregates exact truthful counts", () => {
  const records = getIntakeArchiveRecords();
  const stats = getArchiveCatalogStats(records);

  assert.equal(stats.total, 67);
  assert.equal(stats.published, 38);
  assert.equal(stats.held, 27);
  assert.equal(stats.excluded, 2);
  assert.equal(stats.duplicates, 1);
  assert.equal(stats.withSources, 5);
  assert.equal(stats.missingSources, 62);
  assert.equal(stats.exactDates, 7);
  assert.equal(stats.unknownDates, 58);
  assert.equal(stats.withSources + stats.missingSources, 67);
});

it("source catalog filter and statistics correctly link to citing archive records", () => {
  const sources = getAllSourceRecords();
  const archive = getIntakeArchiveRecords();

  const stats = getSourceCatalogStats(sources, archive);
  assert.equal(stats.total, 13);
  assert.equal(stats.cited, 5);
  assert.equal(stats.uncited, 8);

  // Filter cited vs uncited
  const citedSources = filterSourceRecords(sources, archive, { ...DEFAULT_SOURCE_FILTERS, citationCoverage: "cited" });
  assert.equal(citedSources.length, 5);

  const uncitedSources = filterSourceRecords(sources, archive, { ...DEFAULT_SOURCE_FILTERS, citationCoverage: "uncited" });
  assert.equal(uncitedSources.length, 8);

  // Filter by source type
  const treaties = filterSourceRecords(sources, archive, { ...DEFAULT_SOURCE_FILTERS, type: "treaty" });
  assert.ok(treaties.length >= 1);
  assert.ok(treaties.every((s) => s.type === "treaty"));

  // Text search on source URL or publisher
  const searchUn = filterSourceRecords(sources, archive, { ...DEFAULT_SOURCE_FILTERS, query: "Nations" });
  assert.ok(searchUn.length >= 1);
});

it("media catalog filter and stats handle registered images, external videos, and intake references", () => {
  const records = getIntakeArchiveRecords();
  const stats = getMediaCatalogStats(records);

  assert.equal(stats.total, 67);
  assert.equal(stats.registeredImages, 38);
  assert.equal(stats.externalVideos, 8);
  assert.equal(stats.intakeOnly, 21);

  // Filter: registered-image
  const imgOnly = filterMediaRecords(records, { ...DEFAULT_MEDIA_FILTERS, assetType: "registered-image" });
  assert.equal(imgOnly.length, 38);
  assert.ok(imgOnly.every((r) => Boolean(r.mediaId)));

  // Filter: external-video
  const ytOnly = filterMediaRecords(records, { ...DEFAULT_MEDIA_FILTERS, assetType: "external-video" });
  assert.equal(ytOnly.length, 8);
  assert.ok(ytOnly.every((r) => Boolean(r.youtubeId)));

  // Filter: intake-only
  const intakeOnly = filterMediaRecords(records, { ...DEFAULT_MEDIA_FILTERS, assetType: "intake-only" });
  assert.equal(intakeOnly.length, 21);
  assert.ok(intakeOnly.every((r) => !r.mediaId && !r.youtubeId));

  // Filter: truthClass historical-documentary
  const histDoc = filterMediaRecords(records, { ...DEFAULT_MEDIA_FILTERS, truthClass: "historical-documentary" });
  assert.equal(histDoc.length, 38);
});

it("archive admin translation dictionary maintains complete key parity between EN and AR", () => {
  const enKeys = Object.keys(archiveAdminEn) as ArchiveAdminKey[];
  const arKeys = Object.keys(archiveAdminAr) as ArchiveAdminKey[];

  assert.equal(enKeys.length, arKeys.length, "EN and AR dictionaries must have equal number of keys");

  for (const key of enKeys) {
    assert.ok(key in archiveAdminAr, `Key '${key}' is missing from Arabic dictionary`);
    assert.ok(
      archiveAdminAr[key] && archiveAdminAr[key].trim().length > 0,
      `Arabic translation for '${key}' must not be empty`,
    );
    assert.ok(
      archiveAdminEn[key] && archiveAdminEn[key].trim().length > 0,
      `English translation for '${key}' must not be empty`,
    );
  }
});

it("date formatting handles exact vs circa vs year vs unknown precision truthfully", () => {
  const t = (k: ArchiveAdminKey, vars?: Record<string, string | number>) =>
    Object.entries(vars ?? {}).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), archiveAdminEn[k]!);

  // Exact date
  const exact = formatDateWithPrecision("1998-11-24", "exact", t);
  assert.equal(exact.formatted, "1998-11-24");
  assert.equal(exact.isExact, true);
  assert.equal(exact.isMissing, false);

  // Circa date
  const circa = formatDateWithPrecision("1998", "circa", t);
  assert.equal(circa.formatted, "c. 1998");
  assert.equal(circa.isExact, false);
  assert.equal(circa.isMissing, false);
  assert.equal(formatDateWithPrecision("1998", "circa", (key, vars) => archiveAdminAr[key]!.replace("{date}", String(vars?.["date"]))).formatted, "حوالي 1998");

  // Year date
  const year = formatDateWithPrecision("1998", "year", t);
  assert.equal(year.formatted, "1998");
  assert.equal(year.isExact, false);
  assert.equal(year.isMissing, false);

  // Unknown date
  const unknown = formatDateWithPrecision(undefined, "unknown", t);
  assert.equal(unknown.formatted, "Date unknown");
  assert.equal(unknown.isExact, false);
  assert.equal(unknown.isMissing, true);
});

it("status and badge tone helpers assign proper semantic tone tokens", () => {
  assert.equal(getPublicationStateTone("published"), "brand");
  assert.equal(getPublicationStateTone("hold-rights"), "warn");
  assert.equal(getPublicationStateTone("hold-provenance"), "warn");
  assert.equal(getPublicationStateTone("excluded"), "danger");

  assert.equal(getEvidenceStatusTone("verified"), "brand");
  assert.equal(getEvidenceStatusTone("partially-verified"), "warn");
  assert.equal(getEvidenceStatusTone("unverified"), "danger");

  assert.equal(getRightsStatusTone("public-domain"), "brand");
  assert.equal(getRightsStatusTone("owner-cleared"), "brand");
  assert.equal(getRightsStatusTone("licensed"), "info");
  assert.equal(getRightsStatusTone("rights-managed"), "warn");
  assert.equal(getRightsStatusTone("unknown"), "muted");
});
