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
  | "academic"
  | "video";

export const MEDIUM_LABELS: Record<Medium, { en: string; ar: string }> = {
  photograph: { en: "Photograph", ar: "صورة فوتوغرافية" },
  document: { en: "Document", ar: "وثيقة" },
  video: { en: "Video", ar: "تسجيل مرئي" },
  illustration: { en: "Illustration", ar: "رسم توضيحي" },
};

export const HISTORICAL_PHASE_LABELS: Record<HistoricalPhase, { en: string; ar: string }> = {
  "planning-construction": { en: "Planning & Construction", ar: "التخطيط والإنشاء" },
  "opening-golden-era": { en: "Opening & Operation", ar: "الافتتاح والتشغيل" },
  "closure-destruction": { en: "Closure & Destruction", ar: "الإغلاق والتدمير" },
  "post-destruction-ruins": { en: "Post-Destruction Ruins", ar: "أطلال ما بعد التدمير" },
  "contemporary-status": { en: "Contemporary Status", ar: "الوضع المعاصر" },
};

export const SOURCE_TYPE_LABELS: Record<SourceType, { en: string; ar: string }> = {
  treaty: { en: "Diplomatic Treaty", ar: "اتفاقية دبلوماسية" },
  "official-record": { en: "Official Aviation Record", ar: "سجل طيران مدني رسمي" },
  press: { en: "Contemporary Press", ar: "تغطية صحفية معاصرة" },
  archive: { en: "Archival Record", ar: "سجل أرشيفي" },
  academic: { en: "Academic Research", ar: "بحث أكاديمي" },
  video: { en: "Video Archive", ar: "أرشيف مرئي" },
};

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
  notesAr?: string;
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
