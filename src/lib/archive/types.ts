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

export type PublicationBasis =
  | "rights-cleared"
  | "product-owner-directed-display"
  | "external-embed";

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

export type ArchiveSubject =
  | "airport-architecture"
  | "operations-services"
  | "interior-passenger-spaces"
  | "aircraft-fleet"
  | "crew-staff"
  | "passengers-pilgrimage"
  | "humanitarian-aviation"
  | "official-visits"
  | "damage-ruins"
  | "documents-ephemera"
  | "illustrations";

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

export const ARCHIVE_SUBJECT_LABELS: Record<ArchiveSubject, { en: string; ar: string }> = {
  "airport-architecture": { en: "Airport Architecture", ar: "عمارة المطار" },
  "operations-services": { en: "Operations & Services", ar: "العمليات والخدمات" },
  "interior-passenger-spaces": { en: "Passenger Spaces & Interiors", ar: "مساحات المسافرين والصالات" },
  "aircraft-fleet": { en: "Aircraft & Fleet", ar: "الطائرات والأسطول" },
  "crew-staff": { en: "Crew & Personnel", ar: "طواقم العمل والموظفون" },
  "passengers-pilgrimage": { en: "Passengers & Pilgrimage", ar: "المسافرون وموسم الحج" },
  "humanitarian-aviation": { en: "Humanitarian Aviation", ar: "طيران الإغاثة الإنساني" },
  "official-visits": { en: "Official Visits & Ceremonies", ar: "الزيارات والمراسم الرسمية" },
  "damage-ruins": { en: "Destruction & Ruins", ar: "الدمار والأطلال" },
  "documents-ephemera": { en: "Documents & Ephemera", ar: "الوثائق والمقتنيات" },
  illustrations: { en: "Illustrations", ar: "رسومات توضيحية" },
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

export interface VerifiedVideoReference {
  id: string;
  sourceRef: string;
  youtubeId: string;
  title: { en: string; ar: string };
  caption: { en: string; ar: string };
  alt: { en: string; ar: string };
  publisher: string;
  date?: string | undefined;
  uploadDate?: string | undefined;
  datePrecision: DatePrecision;
  phase: HistoricalPhase;
  subjects: ArchiveSubject[];
  medium: "video";
  url: string;
  notes?: string | undefined;
  notesAr?: string | undefined;
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
  subjects: ArchiveSubject[];
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
  publicationBasis?: PublicationBasis;
  curatorPublicationStatus?: string;
  relatedTimelineEventIds?: string[];
  relatedRecordIds?: string[];
  featured?: boolean;
  originalFilename?: string;
  intakeReference?: string;
  duplicateOf?: string;
  factCheckNotes?: string;
}
