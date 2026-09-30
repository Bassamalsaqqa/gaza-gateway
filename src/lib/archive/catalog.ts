/**
 * Gaza Gateway — Archive Catalog & Safe Selectors (HC-1)
 *
 * Ground truth catalog of historical records, videos, and documentary assets.
 * Enforces strict boundary: public getters return ONLY records with
 * `publicationState === "published"`.
 */

import type { ArchiveRecord } from "./types.ts";

export const ARCHIVE_CATALOG: ArchiveRecord[] = [
  // 1. Authorized Published Documentary Record (Hero)
  {
    id: "rec-present-ruins-2008",
    slug: "gaza-airport-ruins-2008",
    medium: "photograph",
    phase: "post-destruction-ruins",
    subjects: ["damage-ruins", "airport-architecture"],
    title: {
      en: "Gaza International Airport Passenger Terminal Ruins",
      ar: "أطلال مبنى المسافرين بمطار غزة الدولي",
    },
    caption: {
      en: "Documentary photograph of the damaged passenger terminal and architectural dome at Gaza International Airport, captured on June 13, 2008.",
      ar: "صورة وثائقية لمبنى المسافرين المتضرر والقبة المعمارية في مطار غزة الدولي، وُثِّقت في 13 يونيو/حزيران 2008.",
    },
    alt: {
      en: "Documentary photograph of the destroyed passenger terminal and architectural dome at Gaza International Airport in 2008.",
      ar: "صورة وثائقية لمبنى المسافرين والقبة المعمارية المتضررة في مطار غزة الدولي عام 2008.",
    },
    date: "2008-06-13",
    datePrecision: "exact",
    location: "Rafah, Gaza Strip",
    mediaId: "airport-present-ruins-2008",
    evidenceStatus: "verified",
    sourceRefs: ["src-gisha-2008"],
    rights: {
      status: "licensed",
      license: "CC BY-SA 2.0 Generic",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
      credit: "Gisha Access",
      holder: "Gisha Access",
      modificationNote: "Resized to multi-density WebP derivatives (480w, 768w, 960w, 1109w); original panoramic framing preserved.",
    },
    publicationState: "published",
    featured: true,
  },

  // 2. Eight Video Catalog Intake (Staged / Held — Internal Intake Only)
  {
    id: "vid-afp-2014-ruins",
    slug: "afp-2014-ceasefire-controllers-ruins",
    medium: "video",
    phase: "post-destruction-ruins",
    subjects: ["damage-ruins", "operations-services"],
    title: {
      en: "After ceasefire, Gazans dream of reopened airport",
      ar: "بعد وقف إطلاق النار، الغزيون يحلمون بإعادة فتح المطار",
    },
    caption: {
      en: "Former air traffic controllers Anis and Wasim walk through the overgrown ruins of Yasser Arafat International Airport following the 2014 ceasefire.",
      ar: "مراقبا الحركة الجوية السابقان أنيس ووسيم يتجولان بين أطلال مطار ياسر عرفات الدولي عقب وقف إطلاق النار عام 2014.",
    },
    alt: {
      en: "AFP video report on Gaza airport ruins with former air traffic controllers in 2014.",
      ar: "تقرير مصور لوكالة فرانس برس بين أطلال مطار غزة مع مراقبي حركة جوية سابقين عام 2014.",
    },
    date: "2014",
    datePrecision: "year",
    location: "Rafah, Gaza Strip",
    youtubeId: "vYodi28td20",
    evidenceStatus: "unverified",
    sourceRefs: [],
    rights: {
      status: "rights-managed",
      holder: "AFP News Agency",
      credit: "AFP News Agency",
    },
    publicationState: "staging",
  },

  {
    id: "vid-afp-grounded-peace",
    slug: "afp-destroyed-airport-grounded-peace",
    medium: "video",
    phase: "post-destruction-ruins",
    subjects: ["damage-ruins", "passengers-pilgrimage"],
    title: {
      en: "Destroyed Gaza airport symbolises grounded peace hopes",
      ar: "مطار غزة المدمر يجسد آمال السلام المحطمة",
    },
    caption: {
      en: "A field report illustrating the physical decline of Gaza's airport and local reflections on lost dignity and freedom of movement.",
      ar: "تقرير ميداني يوضح التدهور المادي لمطار غزة وانعكاسات المواطنين على فقدان الكرامة وحرية التنقل.",
    },
    alt: {
      en: "AFP documentary video on Gaza airport destruction and blockade.",
      ar: "تقرير مصور لوكالة فرانس برس حول تدمير مطار غزة والحصار.",
    },
    datePrecision: "unknown",
    location: "Rafah, Gaza Strip",
    youtubeId: "yFF4KY-mQk0",
    evidenceStatus: "unverified",
    sourceRefs: [],
    rights: {
      status: "rights-managed",
      holder: "AFP News Agency",
      credit: "AFP News Agency",
    },
    publicationState: "staging",
  },

  {
    id: "vid-ap-1998-dahanieh-open-soon",
    slug: "ap-1998-dahanieh-airport-to-open-soon",
    medium: "video",
    phase: "opening-golden-era",
    subjects: ["airport-architecture", "passengers-pilgrimage"],
    title: {
      en: "GAZA STRIP: DAHANIEH INTERNATIONAL AIRPORT TO OPEN SOON",
      ar: "قطاع غزة: مطار الدهانية الدولي يوشك على الافتتاح",
    },
    caption: {
      en: "Archival news footage capturing the anticipation among Palestinians prior to the official opening of Dahanieh (Gaza) International Airport.",
      ar: "لقطات إخبارية أرشيفية توثق ترقب وتطلعات الفلسطينيين قبيل الافتتاح الرسمي لمطار غزة الدولي.",
    },
    alt: {
      en: "AP Archive footage of Gaza airport prior to opening in 1998.",
      ar: "مشاهد أرشيفية من وكالة أسوشيتد برس لمطار غزة قبيل الافتتاح عام 1998.",
    },
    date: "1998",
    datePrecision: "year",
    location: "Rafah, Gaza Strip",
    youtubeId: "0ExS0XCVk0E",
    evidenceStatus: "unverified",
    sourceRefs: ["src-ap-1998-opening"],
    rights: {
      status: "rights-managed",
      holder: "AP Archive",
      credit: "AP Archive",
    },
    publicationState: "staging",
  },

  {
    id: "vid-ayyad-1998-montage",
    slug: "motaz-ayyad-1998-airport-montage",
    medium: "video",
    phase: "opening-golden-era",
    subjects: ["operations-services", "official-visits", "aircraft-fleet"],
    title: {
      en: "Gaza international Airport",
      ar: "مطار غزة الدولي — مونتاج أرشيفي",
    },
    caption: {
      en: "Archival montage featuring terminal overview, in-flight scenes, and ribbon-cutting ceremony speeches by Yasser Arafat.",
      ar: "مونتاج يوثق مبنى المطار ولقطات على متن الرحلات وكلمات حفل الافتتاح للرئيس ياسر عرفات.",
    },
    alt: {
      en: "Archival footage compilation of Gaza airport and Palestinian Airlines.",
      ar: "تجميعة لقطات أرشيفية لمطار غزة والخطوط الجوية الفلسطينية.",
    },
    date: "1998",
    datePrecision: "year",
    location: "Rafah, Gaza Strip",
    youtubeId: "hJ-zww_qO6c",
    evidenceStatus: "unverified",
    sourceRefs: ["src-ap-1998-opening"],
    rights: {
      status: "unknown",
      holder: "Motaz Ayyad",
      credit: "Motaz Ayyad",
    },
    publicationState: "staging",
  },

  {
    id: "vid-harazeen-crushed-rubble",
    slug: "noor-harazeen-airport-dream-rubble",
    medium: "video",
    phase: "post-destruction-ruins",
    subjects: ["damage-ruins"],
    title: {
      en: "Gaza's International Airport, a Palestinian dream - Noor Harazeen Report",
      ar: "مطار غزة الدولي، حلم فلسطيني — تقرير نور حرازين",
    },
    caption: {
      en: "Investigative report examining the legacy of the airport, which was built to serve 700,000 passengers annually, and residents harvesting concrete rubble for gravel under blockade.",
      ar: "تقرير استقصائي حول الأثر الاقتصادي لفقدان المطار وتدوير ركام الخرسانة في ظل الحصار.",
    },
    alt: {
      en: "Video report on Gaza airport rubble recycling and economic impact.",
      ar: "تقرير مصور حول تدوير ركام مطار غزة والأثر الاقتصادي.",
    },
    datePrecision: "unknown",
    location: "Rafah, Gaza Strip",
    youtubeId: "jb8SszpUxgg",
    evidenceStatus: "unverified",
    sourceRefs: [],
    rights: {
      status: "rights-managed",
      holder: "Noor Harazeen",
      credit: "Noor Harazeen",
    },
    publicationState: "staging",
  },

  {
    id: "vid-bbc-2012-el-arish",
    slug: "bbc-2012-palestinian-airlines-el-arish",
    medium: "video",
    phase: "contemporary-status",
    subjects: ["aircraft-fleet", "operations-services"],
    title: {
      en: "Palestinian Airlines Fly Again - BBC News Report",
      ar: "الخطوط الجوية الفلسطينية تحلق مجدداً — تقرير بي بي سي نيوز",
    },
    caption: {
      en: "BBC News coverage of Palestinian Airlines resuming flights from exile at El Arish International Airport to Amman in 2012.",
      ar: "تغطية بي بي سي نيوز لاستئناف الخطوط الجوية الفلسطينية رحلاتها من مطار العريش إلى عمّان عام 2012.",
    },
    alt: {
      en: "BBC News video report on Palestinian Airlines flights from El Arish in 2012.",
      ar: "تقرير بي بي سي نيوز حول رحلات الخطوط الجوية الفلسطينية من العريش عام 2012.",
    },
    date: "2012",
    datePrecision: "year",
    location: "El Arish, Egypt",
    youtubeId: "gaSe8Pbmm5Q",
    evidenceStatus: "unverified",
    sourceRefs: [],
    rights: {
      status: "rights-managed",
      holder: "BBC News",
      credit: "Howard Johnson / BBC News",
    },
    publicationState: "staging",
  },

  // Video 7: Journeyman Pictures (held for provenance / conflict in supplied description)
  {
    id: "vid-journeyman-2002",
    slug: "journeyman-2002-tumultuous-short-history",
    medium: "video",
    phase: "closure-destruction",
    subjects: ["operations-services", "aircraft-fleet", "damage-ruins"],
    title: {
      en: "The Tumultuous Short History of Gaza's Airport (2002)",
      ar: "التاريخ القصير المضطرب لمطار غزة (2002)",
    },
    caption: {
      en: "Documentary tracking the complete lifespan of the airport, crew interviews, and the impact of airstrikes.",
      ar: "وثائقي يتتبع المسيرة الكاملة للمطار ومقابلات مع طاقم الطيران وأثر الضربات الجوية.",
    },
    alt: {
      en: "Journeyman Pictures documentary on the history and destruction of Gaza airport.",
      ar: "وثائقي جورنيمان بيكتشرز حول تاريخ مطار غزة وتدميره.",
    },
    date: "2002",
    datePrecision: "year",
    location: "Rafah, Gaza Strip",
    youtubeId: "tBht5QeKHaA",
    evidenceStatus: "unverified",
    sourceRefs: ["src-ap-1998-opening", "src-ap-1998-clinton"],
    rights: {
      status: "rights-managed",
      holder: "Journeyman Pictures",
      credit: "Journeyman Pictures",
    },
    publicationState: "hold-provenance",
    factCheckNotes: "Held for provenance review: supplied video description asserts a November 2, 1998 inauguration attended by Bill Clinton. Authoritative documentary record: commercial flights commenced November 24, 1998; official Clinton ribbon dedication was December 14, 1998.",
  },

  {
    id: "vid-aljazeera-ruins",
    slug: "aljazeera-destroyed-yasser-arafat-airport",
    medium: "video",
    phase: "post-destruction-ruins",
    subjects: ["damage-ruins", "airport-architecture"],
    title: {
      en: "مطار ياسر عرفات الدولي المدمر (Destroyed Yasser Arafat International Airport)",
      ar: "مطار ياسر عرفات الدولي المدمر — تقرير الجزيرة",
    },
    caption: {
      en: "Al Jazeera Arabic report presented from the ruins of the airport's Moroccan-tiled terminal and cracked runway.",
      ar: "تقرير ميداني للجزيرة من بين أطلال المطار ذي الزخارف المغربية والمدرج المتصدع.",
    },
    alt: {
      en: "Al Jazeera video report from the ruins of Gaza airport.",
      ar: "تقرير قناة الجزيرة من أطلال مطار غزة.",
    },
    datePrecision: "unknown",
    location: "Rafah, Gaza Strip",
    youtubeId: "-k3kR5f3nYY",
    evidenceStatus: "unverified",
    sourceRefs: [],
    rights: {
      status: "rights-managed",
      holder: "Al Jazeera Arabic",
      credit: "Al Jazeera Arabic (Abbas Nasser)",
    },
    publicationState: "staging",
  },

  // 3. Staged / Duplicate Historical Items (Audit Baseline)
  {
    id: "past-050",
    slug: "gaza-airport-past-interior-real-photo",
    medium: "photograph",
    phase: "opening-golden-era",
    subjects: ["interior-passenger-spaces"],
    title: {
      en: "Passenger Waiting Area Hall Interior",
      ar: "صالة الانتظار الداخلية للمسافرين",
    },
    caption: {
      en: "Historical photograph of the passenger terminal departure hall.",
      ar: "صورة تاريخية لصالة المغادرة في مبنى المسافرين.",
    },
    alt: {
      en: "Historical photo of passenger departure waiting hall.",
      ar: "صورة تاريخية لصالة انتظار المسافرين في المطار.",
    },
    datePrecision: "unknown",
    location: "Rafah, Gaza Strip",
    evidenceStatus: "unverified",
    sourceRefs: [],
    rights: {
      status: "unknown",
    },
    publicationState: "staging",
    originalFilename: "Gaza-Airport-Past-Interior-Real-Photo.jpg",
    intakeReference: "past-050",
  },

  {
    id: "past-052",
    slug: "gaza-airport-past-interior-waiting-area-hall",
    medium: "photograph",
    phase: "opening-golden-era",
    subjects: ["interior-passenger-spaces"],
    title: {
      en: "Passenger Waiting Area Hall (Duplicate Alias)",
      ar: "صالة الانتظار (نسخة مكررة)",
    },
    caption: {
      en: "Byte-identical duplicate of past-050.",
      ar: "نسخة مطابقة تماماً للملف past-050.",
    },
    alt: {
      en: "Duplicate photo alias of past-050.",
      ar: "صورة بديلة مكررة للملف past-050.",
    },
    datePrecision: "unknown",
    location: "Rafah, Gaza Strip",
    evidenceStatus: "unverified",
    sourceRefs: [],
    rights: {
      status: "unknown",
    },
    publicationState: "excluded",
    duplicateOf: "past-050",
    originalFilename: "Gaza-Airport-Past-Interior-Waiting-Area-Hall.jpg",
    intakeReference: "past-052",
    factCheckNotes: "Byte-identical SHA-256 hash match with past-050 (845fea904f291db18a9e62582bd33ffe352026d3cd6a2da3133c4c3f586e45e7). Excluded from independent publication.",
  },
];

import { archiveRecordSchema } from "./schema.ts";

/**
 * Validates canonical publication permission:
 * Must have publicationState === "published", not be a duplicate alias,
 * and satisfy all archiveRecordSchema invariants (rights, truthClass, alt).
 */
export function isPermittedPublishedRecord(record: ArchiveRecord): boolean {
  if (record.publicationState !== "published") return false;
  if (record.duplicateOf) return false;
  return archiveRecordSchema.safeParse(record).success;
}

/**
 * Strict canonical selector: returns ONLY validated, permitted published records.
 * Prevents accidental runtime leakage of staging, rights-held, provenance-held, duplicate,
 * or schema-failing records.
 */
export function getPublishedArchiveRecords(): ArchiveRecord[] {
  return ARCHIVE_CATALOG.filter(isPermittedPublishedRecord);
}

/**
 * Safe public ID lookup: returns ONLY validated permitted published records by default.
 * Passing `includeUnpublished = true` is explicitly restricted to non-runtime / intake auditing.
 */
export function getArchiveRecordById(id: string, includeUnpublished = false): ArchiveRecord | undefined {
  if (includeUnpublished) {
    return ARCHIVE_CATALOG.find((record) => record.id === id);
  }
  return getPublishedArchiveRecords().find((record) => record.id === id);
}

/**
 * Safe public slug lookup: returns ONLY validated permitted published records by default.
 */
export function getArchiveRecordBySlug(slug: string, includeUnpublished = false): ArchiveRecord | undefined {
  if (includeUnpublished) {
    return ARCHIVE_CATALOG.find((record) => record.slug === slug);
  }
  return getPublishedArchiveRecords().find((record) => record.slug === slug);
}

/**
 * Explicit internal helper for intake audit and non-runtime tooling.
 */
export function getIntakeArchiveRecords(): ArchiveRecord[] {
  return [...ARCHIVE_CATALOG];
}
