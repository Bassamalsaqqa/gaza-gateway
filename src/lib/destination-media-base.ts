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
  | "city-riyadh";

export type DestinationCode = "AMM" | "CAI" | "DOH" | "DXB" | "IST" | "JED" | "RUH";

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

export const APPROVED_DESTINATION_CODES: readonly DestinationCode[] = [
  "AMM",
  "CAI",
  "DOH",
  "DXB",
  "IST",
  "JED",
  "RUH",
] as const;

export const APPROVED_DESTINATION_PHOTO_IDS: readonly DestinationPhotoId[] = [
  "city-amman",
  "city-cairo",
  "city-doha",
  "city-dubai",
  "city-istanbul",
  "city-jeddah",
  "city-riyadh",
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
    APPROVED_DESTINATION_CODES.includes(value as DestinationCode)
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
