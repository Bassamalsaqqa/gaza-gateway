/**
 * Gaza Gateway — Destination photo registry base types, metadata, and pure helpers.
 *
 * Decoupled from bundler asset imports to allow fast, standalone unit testing
 * in Node.js without bundler plugins or loaders.
 */

export type DestinationPhotoId =
  | "city-amman"
  | "city-cairo"
  | "city-doha"
  | "city-dubai"
  | "city-istanbul"
  | "city-jeddah"
  | "city-riyadh"
  | "city-abu-dhabi"
  | "city-athens"
  | "city-beirut"
  | "city-frankfurt"
  | "city-kuala-lumpur"
  | "city-kuwait-city"
  | "city-london"
  | "city-madrid"
  | "city-mumbai"
  | "city-new-york"
  | "city-paris"
  | "city-rome"
  | "city-toronto"
  | "city-oslo"
  | "city-stockholm";

export const CORE_PHOTO_DESTINATION_CODES = [
  "AMM",
  "CAI",
  "DOH",
  "DXB",
  "IST",
  "JED",
  "RUH",
] as const;

export const MEMORIAL_EXPANSION_DESTINATION_CODES = [
  "BEY",
  "KWI",
  "AUH",
  "ATH",
  "FCO",
  "CDG",
  "LHR",
  "FRA",
  "MAD",
  "BOM",
  "KUL",
  "JFK",
  "YYZ",
  "OSL",
  "ARN",
] as const;

export const ALL_NETWORK_DESTINATION_CODES = [
  "AMM",
  "CAI",
  "IST",
  "DOH",
  "DXB",
  "JED",
  "RUH",
  "BEY",
  "KWI",
  "AUH",
  "ATH",
  "FCO",
  "CDG",
  "LHR",
  "FRA",
  "MAD",
  "BOM",
  "KUL",
  "JFK",
  "YYZ",
  "OSL",
  "ARN",
] as const;

export type DestinationCode = (typeof ALL_NETWORK_DESTINATION_CODES)[number];

export const GZA_HUB_CODE = "GZA" as const;
export type GzaHubCode = typeof GZA_HUB_CODE;

export const ALL_NETWORK_CODES = [GZA_HUB_CODE, ...ALL_NETWORK_DESTINATION_CODES] as const;
export type AllNetworkCode = (typeof ALL_NETWORK_CODES)[number];

export interface DestinationPhotoVariant {
  src: string;
  width: number;
  height: number;
}

export interface DestinationPhotoVariantMeta {
  width: number;
  height: number;
}

export interface DestinationPhotoMeta {
  id: DestinationPhotoId;
  cityCode: DestinationCode;
  cityNameEn: string;
  cityNameAr: string;
  /** Intrinsic width of largest variant */
  width: number;
  /** Intrinsic height of largest variant */
  height: number;
  variants: DestinationPhotoVariantMeta[];
  defaultFocalPoint: { x: number; y: number };
}

export interface DestinationPhoto extends Omit<DestinationPhotoMeta, "variants"> {
  variants: DestinationPhotoVariant[];
}

export const APPROVED_DESTINATION_CODES: readonly DestinationCode[] = ALL_NETWORK_DESTINATION_CODES;

export const APPROVED_DESTINATION_PHOTO_IDS: readonly DestinationPhotoId[] = [
  "city-amman",
  "city-cairo",
  "city-doha",
  "city-dubai",
  "city-istanbul",
  "city-jeddah",
  "city-riyadh",
  "city-abu-dhabi",
  "city-athens",
  "city-beirut",
  "city-frankfurt",
  "city-kuala-lumpur",
  "city-kuwait-city",
  "city-london",
  "city-madrid",
  "city-mumbai",
  "city-new-york",
  "city-paris",
  "city-rome",
  "city-toronto",
  "city-oslo",
  "city-stockholm",
] as const;

export const DESTINATION_PHOTO_METADATA: Record<DestinationPhotoId, DestinationPhotoMeta> = {
  "city-amman": {
    id: "city-amman",
    cityCode: "AMM",
    cityNameEn: "Amman",
    cityNameAr: "عمّان",
    width: 1920,
    height: 1289,
    variants: [
      { width: 480, height: 322 },
      { width: 800, height: 537 },
      { width: 1200, height: 806 },
      { width: 1600, height: 1074 },
      { width: 1920, height: 1289 },
    ],
    defaultFocalPoint: { x: 50, y: 50 },
  },
  "city-cairo": {
    id: "city-cairo",
    cityCode: "CAI",
    cityNameEn: "Cairo",
    cityNameAr: "القاهرة",
    width: 1920,
    height: 1281,
    variants: [
      { width: 480, height: 320 },
      { width: 800, height: 534 },
      { width: 1200, height: 801 },
      { width: 1600, height: 1068 },
      { width: 1920, height: 1281 },
    ],
    defaultFocalPoint: { x: 50, y: 50 },
  },
  "city-doha": {
    id: "city-doha",
    cityCode: "DOH",
    cityNameEn: "Doha",
    cityNameAr: "الدوحة",
    width: 1920,
    height: 1280,
    variants: [
      { width: 480, height: 320 },
      { width: 800, height: 533 },
      { width: 1200, height: 800 },
      { width: 1600, height: 1067 },
      { width: 1920, height: 1280 },
    ],
    defaultFocalPoint: { x: 50, y: 50 },
  },
  "city-dubai": {
    id: "city-dubai",
    cityCode: "DXB",
    cityNameEn: "Dubai",
    cityNameAr: "دبي",
    width: 1920,
    height: 1280,
    variants: [
      { width: 480, height: 320 },
      { width: 800, height: 533 },
      { width: 1200, height: 800 },
      { width: 1600, height: 1067 },
      { width: 1920, height: 1280 },
    ],
    defaultFocalPoint: { x: 50, y: 50 },
  },
  "city-istanbul": {
    id: "city-istanbul",
    cityCode: "IST",
    cityNameEn: "Istanbul",
    cityNameAr: "إسطنبول",
    width: 1920,
    height: 1079,
    variants: [
      { width: 480, height: 270 },
      { width: 800, height: 449 },
      { width: 1200, height: 674 },
      { width: 1600, height: 899 },
      { width: 1920, height: 1079 },
    ],
    defaultFocalPoint: { x: 50, y: 50 },
  },
  "city-jeddah": {
    id: "city-jeddah",
    cityCode: "JED",
    cityNameEn: "Jeddah",
    cityNameAr: "جدة",
    width: 1920,
    height: 1172,
    variants: [
      { width: 480, height: 293 },
      { width: 800, height: 488 },
      { width: 1200, height: 733 },
      { width: 1600, height: 977 },
      { width: 1920, height: 1172 },
    ],
    defaultFocalPoint: { x: 50, y: 50 },
  },
  "city-riyadh": {
    id: "city-riyadh",
    cityCode: "RUH",
    cityNameEn: "Riyadh",
    cityNameAr: "الرياض",
    width: 1920,
    height: 1281,
    variants: [
      { width: 480, height: 320 },
      { width: 800, height: 534 },
      { width: 1200, height: 800 },
      { width: 1600, height: 1067 },
      { width: 1920, height: 1281 },
    ],
    defaultFocalPoint: { x: 50, y: 50 },
  },
  "city-abu-dhabi": {
    id: "city-abu-dhabi",
    cityCode: "AUH",
    cityNameEn: "Abu Dhabi",
    cityNameAr: "أبوظبي",
    width: 1920,
    height: 1296,
    variants: [
      { width: 480, height: 324 },
      { width: 800, height: 540 },
      { width: 1200, height: 810 },
      { width: 1600, height: 1080 },
      { width: 1920, height: 1296 },
    ],
    defaultFocalPoint: { x: 65, y: 50 },
  },
  "city-athens": {
    id: "city-athens",
    cityCode: "ATH",
    cityNameEn: "Athens",
    cityNameAr: "أثينا",
    width: 1920,
    height: 1440,
    variants: [
      { width: 480, height: 360 },
      { width: 800, height: 600 },
      { width: 1200, height: 900 },
      { width: 1600, height: 1200 },
      { width: 1920, height: 1440 },
    ],
    defaultFocalPoint: { x: 55, y: 50 },
  },
  "city-beirut": {
    id: "city-beirut",
    cityCode: "BEY",
    cityNameEn: "Beirut",
    cityNameAr: "بيروت",
    width: 1920,
    height: 1023,
    variants: [
      { width: 480, height: 256 },
      { width: 800, height: 426 },
      { width: 1200, height: 640 },
      { width: 1600, height: 853 },
      { width: 1920, height: 1023 },
    ],
    defaultFocalPoint: { x: 45, y: 55 },
  },
  "city-frankfurt": {
    id: "city-frankfurt",
    cityCode: "FRA",
    cityNameEn: "Frankfurt",
    cityNameAr: "فرانكفورت",
    width: 1920,
    height: 1272,
    variants: [
      { width: 480, height: 318 },
      { width: 800, height: 530 },
      { width: 1200, height: 795 },
      { width: 1600, height: 1060 },
      { width: 1920, height: 1272 },
    ],
    defaultFocalPoint: { x: 50, y: 50 },
  },
  "city-kuala-lumpur": {
    id: "city-kuala-lumpur",
    cityCode: "KUL",
    cityNameEn: "Kuala Lumpur",
    cityNameAr: "كوالالمبور",
    width: 1920,
    height: 1280,
    variants: [
      { width: 480, height: 320 },
      { width: 800, height: 533 },
      { width: 1200, height: 800 },
      { width: 1600, height: 1067 },
      { width: 1920, height: 1280 },
    ],
    defaultFocalPoint: { x: 50, y: 45 },
  },
  "city-kuwait-city": {
    id: "city-kuwait-city",
    cityCode: "KWI",
    cityNameEn: "Kuwait City",
    cityNameAr: "مدينة الكويت",
    width: 1920,
    height: 1239,
    variants: [
      { width: 480, height: 310 },
      { width: 800, height: 516 },
      { width: 1200, height: 775 },
      { width: 1600, height: 1033 },
      { width: 1920, height: 1239 },
    ],
    defaultFocalPoint: { x: 55, y: 45 },
  },
  "city-london": {
    id: "city-london",
    cityCode: "LHR",
    cityNameEn: "London",
    cityNameAr: "لندن",
    width: 1920,
    height: 1280,
    variants: [
      { width: 480, height: 320 },
      { width: 800, height: 533 },
      { width: 1200, height: 800 },
      { width: 1600, height: 1067 },
      { width: 1920, height: 1280 },
    ],
    defaultFocalPoint: { x: 60, y: 50 },
  },
  "city-madrid": {
    id: "city-madrid",
    cityCode: "MAD",
    cityNameEn: "Madrid",
    cityNameAr: "مدريد",
    width: 1920,
    height: 1280,
    variants: [
      { width: 480, height: 320 },
      { width: 800, height: 533 },
      { width: 1200, height: 800 },
      { width: 1600, height: 1067 },
      { width: 1920, height: 1280 },
    ],
    defaultFocalPoint: { x: 50, y: 50 },
  },
  "city-mumbai": {
    id: "city-mumbai",
    cityCode: "BOM",
    cityNameEn: "Mumbai",
    cityNameAr: "مومباي",
    width: 1920,
    height: 1280,
    variants: [
      { width: 480, height: 320 },
      { width: 800, height: 533 },
      { width: 1200, height: 800 },
      { width: 1600, height: 1067 },
      { width: 1920, height: 1280 },
    ],
    defaultFocalPoint: { x: 50, y: 40 },
  },
  "city-new-york": {
    id: "city-new-york",
    cityCode: "JFK",
    cityNameEn: "New York",
    cityNameAr: "نيويورك",
    width: 1920,
    height: 1224,
    variants: [
      { width: 480, height: 306 },
      { width: 800, height: 510 },
      { width: 1200, height: 765 },
      { width: 1600, height: 1020 },
      { width: 1920, height: 1224 },
    ],
    defaultFocalPoint: { x: 50, y: 45 },
  },
  "city-paris": {
    id: "city-paris",
    cityCode: "CDG",
    cityNameEn: "Paris",
    cityNameAr: "باريس",
    width: 1920,
    height: 1280,
    variants: [
      { width: 480, height: 320 },
      { width: 800, height: 533 },
      { width: 1200, height: 800 },
      { width: 1600, height: 1067 },
      { width: 1920, height: 1280 },
    ],
    defaultFocalPoint: { x: 60, y: 50 },
  },
  "city-rome": {
    id: "city-rome",
    cityCode: "FCO",
    cityNameEn: "Rome",
    cityNameAr: "روما",
    width: 1920,
    height: 1280,
    variants: [
      { width: 480, height: 320 },
      { width: 800, height: 533 },
      { width: 1200, height: 800 },
      { width: 1600, height: 1067 },
      { width: 1920, height: 1280 },
    ],
    defaultFocalPoint: { x: 50, y: 40 },
  },
  "city-toronto": {
    id: "city-toronto",
    cityCode: "YYZ",
    cityNameEn: "Toronto",
    cityNameAr: "تورونتو",
    width: 1920,
    height: 1280,
    variants: [
      { width: 480, height: 320 },
      { width: 800, height: 533 },
      { width: 1200, height: 800 },
      { width: 1600, height: 1067 },
      { width: 1920, height: 1280 },
    ],
    defaultFocalPoint: { x: 50, y: 52 },
  },
  "city-oslo": {
    id: "city-oslo",
    cityCode: "OSL",
    cityNameEn: "Oslo",
    cityNameAr: "أوسلو",
    width: 1920,
    height: 1080,
    variants: [
      { width: 480, height: 270 },
      { width: 800, height: 450 },
      { width: 1200, height: 675 },
      { width: 1600, height: 900 },
      { width: 1920, height: 1080 },
    ],
    defaultFocalPoint: { x: 50, y: 50 },
  },
  "city-stockholm": {
    id: "city-stockholm",
    cityCode: "ARN",
    cityNameEn: "Stockholm",
    cityNameAr: "ستوكهولم",
    width: 1920,
    height: 1280,
    variants: [
      { width: 480, height: 320 },
      { width: 800, height: 533 },
      { width: 1200, height: 800 },
      { width: 1600, height: 1067 },
      { width: 1920, height: 1280 },
    ],
    defaultFocalPoint: { x: 50, y: 50 },
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isDestinationPhotoId(value: unknown): value is DestinationPhotoId {
  return (
    typeof value === "string" &&
    APPROVED_DESTINATION_PHOTO_IDS.includes(value as DestinationPhotoId)
  );
}

export function isDestinationCode(value: unknown): value is DestinationCode {
  return (
    typeof value === "string" &&
    ALL_NETWORK_DESTINATION_CODES.includes(value as DestinationCode)
  );
}

export function buildDestinationSrcSet(photo: DestinationPhoto): string {
  return photo.variants.map((v) => `${v.src} ${v.width}w`).join(", ");
}

export function smallestDestinationSrc(photo: DestinationPhoto): string {
  return photo.variants[0]?.src ?? "";
}

export function largestDestinationSrc(photo: DestinationPhoto): string {
  return photo.variants[photo.variants.length - 1]?.src ?? "";
}
