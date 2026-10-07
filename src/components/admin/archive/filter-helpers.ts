/**
 * Gaza Gateway — Archive, Source, and Media Catalog Filter Helpers (Pure Functions)
 *
 * Provides authoritative search and filtering pipelines, faceted options derivation,
 * and summary statistics. Completely pure and independently unit-testable.
 */

import type {
  ArchiveRecord,
  ArchiveSubject,
  DatePrecision,
  EvidenceStatus,
  HistoricalPhase,
  Medium,
  PublicationBasis,
  PublicationState,
  RightsStatus,
  SourceRecord,
  SourceType,
} from "../../../lib/archive/types.ts";
import {
  APPROVED_MEDIA_CATALOG,
  type ApprovedMediaId,
  type TruthClass,
} from "../../../lib/media-policy.ts";

/** Reports the actual registered path suffix; does not assume all variants are WebP. */
export function assetFormat(src: string): string {
  const match = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(src);
  return match ? match[1]!.toUpperCase() : "—";
}

/* ------------------------------------------------------------------------- */
/* 1. Archive Records Filtering                                               */
/* ------------------------------------------------------------------------- */

export interface ArchiveFilterState {
  query: string;
  medium: Medium | "all";
  phase: HistoricalPhase | "all";
  subject: ArchiveSubject | "all";
  publicationState: PublicationState | "all";
  publicationBasis: PublicationBasis | "all";
  rightsStatus: RightsStatus | "all";
  evidenceStatus: EvidenceStatus | "all";
  sourceCoverage: "all" | "has-sources" | "missing-sources";
  duplicateStatus: "all" | "canonical-only" | "duplicates-only";
  featured: "all" | "featured" | "standard";
}

export const DEFAULT_ARCHIVE_FILTERS: ArchiveFilterState = {
  query: "",
  medium: "all",
  phase: "all",
  subject: "all",
  publicationState: "all",
  publicationBasis: "all",
  rightsStatus: "all",
  evidenceStatus: "all",
  sourceCoverage: "all",
  duplicateStatus: "all",
  featured: "all",
};

export function filterArchiveRecords(
  records: readonly ArchiveRecord[],
  filters: ArchiveFilterState,
): ArchiveRecord[] {
  const q = filters.query.trim().toLowerCase();

  return records.filter((r) => {
    // Text search query
    if (q) {
      const matchId = r.id.toLowerCase().includes(q);
      const matchSlug = r.slug.toLowerCase().includes(q);
      const matchTitleEn = r.title.en.toLowerCase().includes(q);
      const matchTitleAr = r.title.ar.toLowerCase().includes(q);
      const matchCaptionEn = r.caption.en.toLowerCase().includes(q);
      const matchCaptionAr = r.caption.ar.toLowerCase().includes(q);
      const matchAltEn = r.alt.en.toLowerCase().includes(q);
      const matchAltAr = r.alt.ar.toLowerCase().includes(q);
      const matchLoc = r.location?.toLowerCase().includes(q) ?? false;
      const matchFilename = r.originalFilename?.toLowerCase().includes(q) ?? false;
      const matchIntake = r.intakeReference?.toLowerCase().includes(q) ?? false;
      const matchNotes = r.factCheckNotes?.toLowerCase().includes(q) ?? false;
      const matchPeople = r.people?.some((p) => p.toLowerCase().includes(q)) ?? false;
      const matchMediaId = r.mediaId?.toLowerCase().includes(q) ?? false;
      const matchYt = r.youtubeId?.toLowerCase().includes(q) ?? false;

      if (
        !matchId &&
        !matchSlug &&
        !matchTitleEn &&
        !matchTitleAr &&
        !matchCaptionEn &&
        !matchCaptionAr &&
        !matchAltEn &&
        !matchAltAr &&
        !matchLoc &&
        !matchFilename &&
        !matchIntake &&
        !matchNotes &&
        !matchPeople &&
        !matchMediaId &&
        !matchYt
      ) {
        return false;
      }
    }

    // Medium
    if (filters.medium !== "all" && r.medium !== filters.medium) {
      return false;
    }

    // Phase
    if (filters.phase !== "all" && r.phase !== filters.phase) {
      return false;
    }

    // Subject
    if (filters.subject !== "all" && !r.subjects.includes(filters.subject)) {
      return false;
    }

    // Publication state
    if (filters.publicationState !== "all" && r.publicationState !== filters.publicationState) {
      return false;
    }

    // Publication basis
    if (filters.publicationBasis !== "all" && r.publicationBasis !== filters.publicationBasis) {
      return false;
    }

    // Rights status
    if (filters.rightsStatus !== "all" && r.rights.status !== filters.rightsStatus) {
      return false;
    }

    // Evidence status
    if (filters.evidenceStatus !== "all" && r.evidenceStatus !== filters.evidenceStatus) {
      return false;
    }

    // Source coverage
    if (filters.sourceCoverage === "has-sources" && r.sourceRefs.length === 0) {
      return false;
    }
    if (filters.sourceCoverage === "missing-sources" && r.sourceRefs.length > 0) {
      return false;
    }

    // Duplicate status
    if (filters.duplicateStatus === "canonical-only" && Boolean(r.duplicateOf)) {
      return false;
    }
    if (filters.duplicateStatus === "duplicates-only" && !r.duplicateOf) {
      return false;
    }

    // Featured status
    if (filters.featured === "featured" && !r.featured) {
      return false;
    }
    if (filters.featured === "standard" && Boolean(r.featured)) {
      return false;
    }

    return true;
  });
}

export function isArchiveFilterActive(filters: ArchiveFilterState): boolean {
  return (
    Boolean(filters.query.trim()) ||
    filters.medium !== "all" ||
    filters.phase !== "all" ||
    filters.subject !== "all" ||
    filters.publicationState !== "all" ||
    filters.publicationBasis !== "all" ||
    filters.rightsStatus !== "all" ||
    filters.evidenceStatus !== "all" ||
    filters.sourceCoverage !== "all" ||
    filters.duplicateStatus !== "all" ||
    filters.featured !== "all"
  );
}

export function getArchiveCatalogStats(records: readonly ArchiveRecord[]) {
  let published = 0;
  let held = 0;
  let excluded = 0;
  let duplicates = 0;
  let withSources = 0;
  let missingSources = 0;
  let exactDates = 0;
  let unknownDates = 0;

  for (const r of records) {
    if (r.publicationState === "published") published++;
    else if (r.publicationState === "excluded") excluded++;
    else held++; // staging, hold-rights, hold-provenance

    if (r.duplicateOf) duplicates++;
    if (r.sourceRefs.length > 0) withSources++;
    else missingSources++;

    if (r.datePrecision === "exact") exactDates++;
    else if (r.datePrecision === "unknown" || !r.date) unknownDates++;
  }

  return {
    total: records.length,
    published,
    held,
    excluded,
    duplicates,
    withSources,
    missingSources,
    exactDates,
    unknownDates,
  };
}

/* ------------------------------------------------------------------------- */
/* 2. Source Records Filtering                                                */
/* ------------------------------------------------------------------------- */

export interface SourceFilterState {
  query: string;
  type: SourceType | "all";
  language: "all" | "en" | "ar" | "he" | "multilingual";
  archivalStatus: "all" | "live" | "archived-wayback" | "official-repository" | "print-record";
  citationCoverage: "all" | "cited" | "uncited";
}

export const DEFAULT_SOURCE_FILTERS: SourceFilterState = {
  query: "",
  type: "all",
  language: "all",
  archivalStatus: "all",
  citationCoverage: "all",
};

export function filterSourceRecords(
  sources: readonly SourceRecord[],
  archiveRecords: readonly ArchiveRecord[],
  filters: SourceFilterState,
): SourceRecord[] {
  const q = filters.query.trim().toLowerCase();

  // Precompute citation counts
  const citationCounts = new Map<string, number>();
  for (const r of archiveRecords) {
    for (const ref of r.sourceRefs) {
      citationCounts.set(ref, (citationCounts.get(ref) ?? 0) + 1);
    }
  }

  return sources.filter((s) => {
    // Text search query
    if (q) {
      const matchId = s.id.toLowerCase().includes(q);
      const matchTitle = s.title.toLowerCase().includes(q);
      const matchTitleAr = s.titleAr?.toLowerCase().includes(q) ?? false;
      const matchPub = s.publisher.toLowerCase().includes(q);
      const matchNotes = s.notes?.toLowerCase().includes(q) ?? false;
      const matchNotesAr = s.notesAr?.toLowerCase().includes(q) ?? false;
      const matchUrl = s.url.toLowerCase().includes(q);

      if (!matchId && !matchTitle && !matchTitleAr && !matchPub && !matchNotes && !matchNotesAr && !matchUrl) {
        return false;
      }
    }

    // Type
    if (filters.type !== "all" && s.type !== filters.type) {
      return false;
    }

    // Language
    if (filters.language !== "all" && s.language !== filters.language) {
      return false;
    }

    // Archival status
    if (filters.archivalStatus !== "all" && s.archivalStatus !== filters.archivalStatus) {
      return false;
    }

    // Citation coverage
    const count = citationCounts.get(s.id) ?? 0;
    if (filters.citationCoverage === "cited" && count === 0) {
      return false;
    }
    if (filters.citationCoverage === "uncited" && count > 0) {
      return false;
    }

    return true;
  });
}

export function isSourceFilterActive(filters: SourceFilterState): boolean {
  return (
    Boolean(filters.query.trim()) ||
    filters.type !== "all" ||
    filters.language !== "all" ||
    filters.archivalStatus !== "all" ||
    filters.citationCoverage !== "all"
  );
}

export function getSourceCatalogStats(
  sources: readonly SourceRecord[],
  archiveRecords: readonly ArchiveRecord[],
) {
  const citedIds = new Set<string>();
  for (const r of archiveRecords) {
    for (const ref of r.sourceRefs) {
      citedIds.add(ref);
    }
  }

  let cited = 0;
  let uncited = 0;

  for (const s of sources) {
    if (citedIds.has(s.id)) cited++;
    else uncited++;
  }

  return {
    total: sources.length,
    cited,
    uncited,
  };
}

/* ------------------------------------------------------------------------- */
/* 3. Media & Variant Records Filtering                                       */
/* ------------------------------------------------------------------------- */

export interface MediaFilterState {
  query: string;
  assetType: "all" | "registered-image" | "external-video" | "intake-only";
  truthClass: TruthClass | "all";
  publicationState: PublicationState | "all";
}

export const DEFAULT_MEDIA_FILTERS: MediaFilterState = {
  query: "",
  assetType: "all",
  truthClass: "all",
  publicationState: "all",
};

export function filterMediaRecords(
  records: readonly ArchiveRecord[],
  filters: MediaFilterState,
): ArchiveRecord[] {
  const q = filters.query.trim().toLowerCase();

  return records.filter((r) => {
    // Text search query
    if (q) {
      const matchId = r.id.toLowerCase().includes(q);
      const matchMediaId = r.mediaId?.toLowerCase().includes(q) ?? false;
      const matchYt = r.youtubeId?.toLowerCase().includes(q) ?? false;
      const matchFilename = r.originalFilename?.toLowerCase().includes(q) ?? false;
      const matchIntake = r.intakeReference?.toLowerCase().includes(q) ?? false;
      const matchTitleEn = r.title.en.toLowerCase().includes(q);
      const matchTitleAr = r.title.ar.toLowerCase().includes(q);

      if (!matchId && !matchMediaId && !matchYt && !matchFilename && !matchIntake && !matchTitleEn && !matchTitleAr) {
        return false;
      }
    }

    // Asset type
    if (filters.assetType === "registered-image" && !r.mediaId) {
      return false;
    }
    if (filters.assetType === "external-video" && !r.youtubeId) {
      return false;
    }
    if (filters.assetType === "intake-only" && (Boolean(r.mediaId) || Boolean(r.youtubeId))) {
      return false;
    }

    // Truth class
    if (filters.truthClass !== "all") {
      const registeredTruth = r.mediaId ? APPROVED_MEDIA_CATALOG[r.mediaId as ApprovedMediaId] : undefined;
      if (registeredTruth !== filters.truthClass) {
        return false;
      }
    }

    // Publication state
    if (filters.publicationState !== "all" && r.publicationState !== filters.publicationState) {
      return false;
    }

    return true;
  });
}

export function isMediaFilterActive(filters: MediaFilterState): boolean {
  return (
    Boolean(filters.query.trim()) ||
    filters.assetType !== "all" ||
    filters.truthClass !== "all" ||
    filters.publicationState !== "all"
  );
}

export function getMediaCatalogStats(records: readonly ArchiveRecord[]) {
  let registeredImages = 0;
  let externalVideos = 0;
  let intakeOnly = 0;

  for (const r of records) {
    if (r.mediaId) registeredImages++;
    else if (r.youtubeId) externalVideos++;
    else intakeOnly++;
  }

  return {
    total: records.length,
    registeredImages,
    externalVideos,
    intakeOnly,
  };
}

/* ------------------------------------------------------------------------- */
/* 4. Tone & Date Formatting Helpers (Pure Functions)                         */
/* ------------------------------------------------------------------------- */

export function getPublicationStateTone(
  state: PublicationState,
): "brand" | "info" | "warn" | "danger" | "muted" {
  switch (state) {
    case "published":
      return "brand";
    case "staging":
      return "info";
    case "hold-rights":
    case "hold-provenance":
      return "warn";
    case "excluded":
      return "danger";
    default:
      return "muted";
  }
}

export function getEvidenceStatusTone(
  status: EvidenceStatus,
): "brand" | "warn" | "danger" {
  switch (status) {
    case "verified":
      return "brand";
    case "partially-verified":
      return "warn";
    case "unverified":
      return "danger";
    default:
      return "warn";
  }
}

export function getRightsStatusTone(
  status: RightsStatus,
): "brand" | "info" | "warn" | "danger" | "muted" {
  switch (status) {
    case "owner-cleared":
    case "public-domain":
      return "brand";
    case "licensed":
    case "attribution-license":
      return "info";
    case "rights-managed":
      return "warn";
    case "unknown":
      return "muted";
    default:
      return "muted";
  }
}

export function formatDateWithPrecision(
  date: string | undefined,
  precision: DatePrecision,
  t: (key: string, vars?: Record<string, string | number>) => string,
): { formatted: string; isExact: boolean; isMissing: boolean } {
  if (!date || precision === "unknown") {
    return {
      formatted: t("archive.badge.missingDate"),
      isExact: false,
      isMissing: true,
    };
  }

  const isExact = precision === "exact";
  if (precision === "circa") {
    return {
      formatted: t("archive.date.circa", { date }),
      isExact: false,
      isMissing: false,
    };
  }

  return {
    formatted: date,
    isExact,
    isMissing: false,
  };
}
