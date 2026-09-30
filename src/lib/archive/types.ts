/**
 * Gaza Gateway — Archive, Source & Rights Foundation Types (HC-1)
 *
 * Provides authoritative domain types for historical documentary records,
 * multi-dimensional archival classifications, copyright/licensing statuses,
 * and external source records.
 */

export type PublicationState =
  | "published"
  | "staging"
  | "hold-rights"
  | "hold-provenance"
  | "excluded";

export type RightsStatus =
  | "owner-cleared"
  | "public-domain"
  | "licensed"
  | "attribution-license"
  | "rights-managed"
  | "unknown";

export type EvidenceStatus =
  | "verified"
  | "partially-verified"
  | "unverified";

export type Medium =
  | "photograph"
  | "document"
  | "video"
  | "illustration";

export type HistoricalPhase =
  | "planning-construction"
  | "opening-golden-era"
  | "closure-destruction"
  | "post-destruction-ruins"
  | "contemporary-status";

export type DatePrecision = "exact" | "month" | "year" | "circa" | "unknown";

export type SourceType =
  | "treaty"
  | "official-record"
  | "press"
  | "archive"
  | "academic";

export interface SourceRecord {
  id: string;
  title: string;
  titleAr?: string;
  publisher: string;
  type: SourceType;
  language: "en" | "ar" | "he" | "multilingual";
  publicationDate?: string;
  eventDate?: string;
  url: string;
  accessedAt?: string;
  archivalStatus?: "live" | "archived-wayback" | "official-repository" | "print-record";
  notes?: string;
}

export interface ArchiveRights {
  status: RightsStatus;
  license?: string;
  licenseUrl?: string;
  credit?: string;
  holder?: string;
  statementUri?: string;
  modificationNote?: string;
}

export interface ArchiveRecord {
  id: string;
  slug: string;
  medium: Medium;
  phase: HistoricalPhase;
  subjects: string[];
  title: {
    en: string;
    ar: string;
  };
  caption: {
    en: string;
    ar: string;
  };
  alt: {
    en: string;
    ar: string;
  };
  date?: string;
  datePrecision: DatePrecision;
  people?: string[];
  location?: string;
  mediaId?: string;
  youtubeId?: string;
  evidenceStatus: EvidenceStatus;
  sourceRefs: string[];
  rights: ArchiveRights;
  publicationState: PublicationState;
  relatedTimelineEventIds?: string[];
  relatedRecordIds?: string[];
  featured?: boolean;
  originalFilename?: string;
  intakeReference?: string;
  duplicateOf?: string;
  factCheckNotes?: string;
}
