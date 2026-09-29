/**
 * Gaza Gateway — Typed media registry.
 * Registry of approved visual assets, including owner-provided AI-generated
 * future concept visualizations, authentic historical documentary archive photos,
 * and illustrative editorial photographs with strict truth classifications.
 *
 * IMPORTANT: Truth classes govern usage:
 * - 'historical-documentary': authentic historical records; never substitute with concept art.
 * - 'illustrative-future': illustrative future concept visualizations; never use as historical evidence.
 * - 'illustrative-photo': generic contextual photography; illustrative only.
 *
 * Do NOT use img() from data.ts for these assets — use this registry.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

import {
  APPROVED_MEDIA_CATALOG,
  type ApprovedMediaId,
  type TruthClass,
} from "./media-policy.ts";
export { APPROVED_MEDIA_CATALOG };
export type { ApprovedMediaId, TruthClass };

export interface MediaVariant {
  src: string;
  width: number;
  height: number;
}

export interface MediaEntry {
  /** Unique stable semantic ID */
  id: string;
  /** Intrinsic width of the largest variant (px) */
  width: number;
  /** Intrinsic height of the largest variant (px) */
  height: number;
  /** Variants at discrete widths (ascending) */
  variants: MediaVariant[];
  /** Truth classification — controls disclosure labeling */
  truthClass: TruthClass;
  /** Accessible alt text (English) */
  altEn: string;
  /** Accessible alt text (Arabic) */
  altAr: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vite asset imports — fingerprinted at build time
// ─────────────────────────────────────────────────────────────────────────────

// Hero (homepage)
import hero640 from "@/assets/media/concepts/future/hero-640.webp";
import hero960 from "@/assets/media/concepts/future/hero-960.webp";
import hero1280 from "@/assets/media/concepts/future/hero-1280.webp";
import hero1376 from "@/assets/media/concepts/future/hero-1376.webp";

// Aerial drone — day
import aerialDay640 from "@/assets/media/concepts/future/aerial-day-640.webp";
import aerialDay960 from "@/assets/media/concepts/future/aerial-day-960.webp";
import aerialDay1280 from "@/assets/media/concepts/future/aerial-day-1280.webp";
import aerialDay1376 from "@/assets/media/concepts/future/aerial-day-1376.webp";

// Aerial drone — night
import aerialNight640 from "@/assets/media/concepts/future/aerial-night-640.webp";
import aerialNight960 from "@/assets/media/concepts/future/aerial-night-960.webp";
import aerialNight1280 from "@/assets/media/concepts/future/aerial-night-1280.webp";
import aerialNight1376 from "@/assets/media/concepts/future/aerial-night-1376.webp";

// Landside entrance — day
import landsideDay640 from "@/assets/media/concepts/future/landside-day-640.webp";
import landsideDay960 from "@/assets/media/concepts/future/landside-day-960.webp";
import landsideDay1280 from "@/assets/media/concepts/future/landside-day-1280.webp";
import landsideDay1376 from "@/assets/media/concepts/future/landside-day-1376.webp";

// Landside entrance — night
import landsideNight640 from "@/assets/media/concepts/future/landside-night-640.webp";
import landsideNight960 from "@/assets/media/concepts/future/landside-night-960.webp";
import landsideNight1280 from "@/assets/media/concepts/future/landside-night-1280.webp";
import landsideNight1376 from "@/assets/media/concepts/future/landside-night-1376.webp";

// Runway — day
import runwayDay640 from "@/assets/media/concepts/future/runway-day-640.webp";
import runwayDay960 from "@/assets/media/concepts/future/runway-day-960.webp";
import runwayDay1280 from "@/assets/media/concepts/future/runway-day-1280.webp";
import runwayDay1376 from "@/assets/media/concepts/future/runway-day-1376.webp";

// Runway — night
import runwayNight640 from "@/assets/media/concepts/future/runway-night-640.webp";
import runwayNight960 from "@/assets/media/concepts/future/runway-night-960.webp";
import runwayNight1280 from "@/assets/media/concepts/future/runway-night-1280.webp";
import runwayNight1376 from "@/assets/media/concepts/future/runway-night-1376.webp";

// Concourse interior — day
import concourseDay640 from "@/assets/media/concepts/future/concourse-day-640.webp";
import concourseDay960 from "@/assets/media/concepts/future/concourse-day-960.webp";
import concourseDay1280 from "@/assets/media/concepts/future/concourse-day-1280.webp";
import concourseDay1376 from "@/assets/media/concepts/future/concourse-day-1376.webp";

// Concourse interior — night
import concourseNight640 from "@/assets/media/concepts/future/concourse-night-640.webp";
import concourseNight960 from "@/assets/media/concepts/future/concourse-night-960.webp";
import concourseNight1280 from "@/assets/media/concepts/future/concourse-night-1280.webp";
import concourseNight1376 from "@/assets/media/concepts/future/concourse-night-1376.webp";

// Wide interior studies
import interiorA640 from "@/assets/media/concepts/future/interior-wide-a-640.webp";
import interiorA960 from "@/assets/media/concepts/future/interior-wide-a-960.webp";
import interiorA1280 from "@/assets/media/concepts/future/interior-wide-a-1280.webp";
import interiorA1376 from "@/assets/media/concepts/future/interior-wide-a-1376.webp";

import interiorB640 from "@/assets/media/concepts/future/interior-wide-b-640.webp";
import interiorB960 from "@/assets/media/concepts/future/interior-wide-b-960.webp";
import interiorB1280 from "@/assets/media/concepts/future/interior-wide-b-1280.webp";
import interiorB1376 from "@/assets/media/concepts/future/interior-wide-b-1376.webp";

// Passenger assistance (travel section)
import assistance480 from "@/assets/media/travel/assistance-480.webp";
import assistance800 from "@/assets/media/travel/assistance-800.webp";
import assistance1200 from "@/assets/media/travel/assistance-1200.webp";
import assistance1376 from "@/assets/media/travel/assistance-1376.webp";

// Owner brand mark derivatives (language-neutral visual mark)
import markLight1x from "@/assets/media/brand/gaza-mark-light-1x.png";
import markLight2x from "@/assets/media/brand/gaza-mark-light-2x.png";
import markLightFull from "@/assets/media/brand/gaza-mark-light.png";

import markDark1x from "@/assets/media/brand/gaza-mark-dark-1x.png";
import markDark2x from "@/assets/media/brand/gaza-mark-dark-2x.png";
import markDarkFull from "@/assets/media/brand/gaza-mark-dark.png";

// Documentary archive photos (year 2000)
import airportArchive2000_640 from "@/assets/media/documentary/airport-archive-2000-640.webp";
import airportArchive2000_960 from "@/assets/media/documentary/airport-archive-2000-960.webp";
import airportArchive2000_1280 from "@/assets/media/documentary/airport-archive-2000-1280.webp";
import airportArchive2000_1376 from "@/assets/media/documentary/airport-archive-2000-1376.webp";

import galleryAircraft2000_640 from "@/assets/media/documentary/gallery-aircraft-2000-640.webp";
import galleryAircraft2000_960 from "@/assets/media/documentary/gallery-aircraft-2000-960.webp";
import galleryAircraft2000_1280 from "@/assets/media/documentary/gallery-aircraft-2000-1280.webp";
import galleryAircraft2000_1376 from "@/assets/media/documentary/gallery-aircraft-2000-1376.webp";

// Editorial & service illustrative photos
import destinationsHero640 from "@/assets/media/editorial/destinations-hero-640.webp";
import destinationsHero960 from "@/assets/media/editorial/destinations-hero-960.webp";
import destinationsHero1280 from "@/assets/media/editorial/destinations-hero-1280.webp";
import destinationsHero1376 from "@/assets/media/editorial/destinations-hero-1376.webp";

import travelInfoHero640 from "@/assets/media/editorial/travel-info-hero-640.webp";
import travelInfoHero960 from "@/assets/media/editorial/travel-info-hero-960.webp";
import travelInfoHero1280 from "@/assets/media/editorial/travel-info-hero-1280.webp";
import travelInfoHero1376 from "@/assets/media/editorial/travel-info-hero-1376.webp";

import manageBookingHero640 from "@/assets/media/editorial/manage-booking-hero-640.webp";
import manageBookingHero960 from "@/assets/media/editorial/manage-booking-hero-960.webp";
import manageBookingHero1280 from "@/assets/media/editorial/manage-booking-hero-1280.webp";
import manageBookingHero1376 from "@/assets/media/editorial/manage-booking-hero-1376.webp";

import checkInHero640 from "@/assets/media/editorial/check-in-hero-640.webp";
import checkInHero960 from "@/assets/media/editorial/check-in-hero-960.webp";
import checkInHero1280 from "@/assets/media/editorial/check-in-hero-1280.webp";
import checkInHero1376 from "@/assets/media/editorial/check-in-hero-1376.webp";

import signinPhoto640 from "@/assets/media/editorial/signin-photo-640.webp";
import signinPhoto960 from "@/assets/media/editorial/signin-photo-960.webp";
import signinPhoto1280 from "@/assets/media/editorial/signin-photo-1280.webp";
import signinPhoto1376 from "@/assets/media/editorial/signin-photo-1376.webp";

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

export const MEDIA: Record<ApprovedMediaId, MediaEntry> = {
  "home-hero": {
    id: "home-hero",
    width: 1376,
    height: 768,
    variants: [
      { src: hero640, width: 640, height: 357 },
      { src: hero960, width: 960, height: 536 },
      { src: hero1280, width: 1280, height: 714 },
      { src: hero1376, width: 1376, height: 768 },
    ],
    truthClass: "future-concept-ai",
    altEn:
      "Aerial architectural concept of the future Gaza International Airport terminal and airfield.",
    altAr: "تصوّر معماري جوي لمفهوم مستقبلي لمبنى مطار غزة الدولي وساحة الطائرات.",
  },

  "aerial-day": {
    id: "aerial-day",
    width: 1376,
    height: 768,
    variants: [
      { src: aerialDay640, width: 640, height: 357 },
      { src: aerialDay960, width: 960, height: 536 },
      { src: aerialDay1280, width: 1280, height: 714 },
      { src: aerialDay1376, width: 1376, height: 768 },
    ],
    truthClass: "future-concept-ai",
    altEn:
      "Aerial architectural concept of the future Gaza International Airport terminal and airfield.",
    altAr: "تصوّر معماري جوي لمفهوم مستقبلي لمبنى مطار غزة الدولي وساحة الطائرات.",
  },

  "aerial-night": {
    id: "aerial-night",
    width: 1376,
    height: 768,
    variants: [
      { src: aerialNight640, width: 640, height: 357 },
      { src: aerialNight960, width: 960, height: 536 },
      { src: aerialNight1280, width: 1280, height: 714 },
      { src: aerialNight1376, width: 1376, height: 768 },
    ],
    truthClass: "future-concept-ai",
    altEn:
      "Night aerial architectural concept of the future Gaza International Airport terminal and airfield.",
    altAr: "تصوّر معماري جوي ليلي لمفهوم مستقبلي لمبنى مطار غزة الدولي وساحة الطائرات.",
  },

  "landside-day": {
    id: "landside-day",
    width: 1376,
    height: 768,
    variants: [
      { src: landsideDay640, width: 640, height: 357 },
      { src: landsideDay960, width: 960, height: 536 },
      { src: landsideDay1280, width: 1280, height: 714 },
      { src: landsideDay1376, width: 1376, height: 768 },
    ],
    truthClass: "future-concept-ai",
    altEn: "Architectural concept of the future landside departures entrance.",
    altAr: "تصوّر معماري لمفهوم مستقبلي لواجهة المغادرة والمدخل من جهة اليابسة.",
  },

  "landside-night": {
    id: "landside-night",
    width: 1376,
    height: 768,
    variants: [
      { src: landsideNight640, width: 640, height: 357 },
      { src: landsideNight960, width: 960, height: 536 },
      { src: landsideNight1280, width: 1280, height: 714 },
      { src: landsideNight1376, width: 1376, height: 768 },
    ],
    truthClass: "future-concept-ai",
    altEn: "Night architectural concept of the future landside departures entrance.",
    altAr: "تصوّر معماري ليلي لمفهوم مستقبلي لواجهة المغادرة والمدخل من جهة اليابسة.",
  },

  "runway-day": {
    id: "runway-day",
    width: 1376,
    height: 768,
    variants: [
      { src: runwayDay640, width: 640, height: 357 },
      { src: runwayDay960, width: 960, height: 536 },
      { src: runwayDay1280, width: 1280, height: 714 },
      { src: runwayDay1376, width: 1376, height: 768 },
    ],
    truthClass: "future-concept-ai",
    altEn: "Concept view along the future airport runway toward the coastal horizon.",
    altAr: "تصوّر لمشهد مستقبلي على امتداد مدرج المطار باتجاه الأفق الساحلي.",
  },

  "runway-night": {
    id: "runway-night",
    width: 1376,
    height: 768,
    variants: [
      { src: runwayNight640, width: 640, height: 357 },
      { src: runwayNight960, width: 960, height: 536 },
      { src: runwayNight1280, width: 1280, height: 714 },
      { src: runwayNight1376, width: 1376, height: 768 },
    ],
    truthClass: "future-concept-ai",
    altEn: "Night concept view along the future airport runway toward the coastal horizon.",
    altAr: "تصوّر ليلي لمشهد مستقبلي على امتداد مدرج المطار باتجاه الأفق الساحلي.",
  },

  "concourse-day": {
    id: "concourse-day",
    width: 1376,
    height: 768,
    variants: [
      { src: concourseDay640, width: 640, height: 357 },
      { src: concourseDay960, width: 960, height: 536 },
      { src: concourseDay1280, width: 1280, height: 714 },
      { src: concourseDay1376, width: 1376, height: 768 },
    ],
    truthClass: "future-concept-ai",
    altEn: "Interior architectural concept of a future passenger concourse.",
    altAr: "تصوّر معماري داخلي لمفهوم مستقبلي لصالة الركاب.",
  },

  "concourse-night": {
    id: "concourse-night",
    width: 1376,
    height: 768,
    variants: [
      { src: concourseNight640, width: 640, height: 357 },
      { src: concourseNight960, width: 960, height: 536 },
      { src: concourseNight1280, width: 1280, height: 714 },
      { src: concourseNight1376, width: 1376, height: 768 },
    ],
    truthClass: "future-concept-ai",
    altEn: "Night interior architectural concept of a future passenger concourse.",
    altAr: "تصوّر معماري داخلي ليلي لمفهوم مستقبلي لصالة الركاب.",
  },

  "interior-wide-a": {
    id: "interior-wide-a",
    width: 1376,
    height: 768,
    variants: [
      { src: interiorA640, width: 640, height: 357 },
      { src: interiorA960, width: 960, height: 536 },
      { src: interiorA1280, width: 1280, height: 714 },
      { src: interiorA1376, width: 1376, height: 768 },
    ],
    truthClass: "future-concept-ai",
    altEn: "Wide interior concept of the future Gaza International Airport terminal.",
    altAr: "تصوّر داخلي فسيح لمبنى مطار غزة الدولي المستقبلي.",
  },

  "interior-wide-b": {
    id: "interior-wide-b",
    width: 1376,
    height: 768,
    variants: [
      { src: interiorB640, width: 640, height: 357 },
      { src: interiorB960, width: 960, height: 536 },
      { src: interiorB1280, width: 1280, height: 714 },
      { src: interiorB1376, width: 1376, height: 768 },
    ],
    truthClass: "future-concept-ai",
    altEn: "Wide interior concept of the modern Gaza International Airport terminal.",
    altAr: "تصوّر داخلي فسيح لمبنى مطار غزة الدولي الحديث المستقبلي.",
  },

  "passenger-assistance": {
    id: "passenger-assistance",
    width: 1376,
    height: 768,
    variants: [
      { src: assistance480, width: 480, height: 268 },
      { src: assistance800, width: 800, height: 447 },
      { src: assistance1200, width: 1200, height: 670 },
      { src: assistance1376, width: 1376, height: 768 },
    ],
    truthClass: "future-concept-ai",
    altEn: "Illustrative passenger assistance scene inside a future airport terminal.",
    altAr: "مشهد توضيحي لمساعدة مسافر داخل مبنى مطار مستقبلي.",
  },

  "logo": {
    id: "logo",
    width: 433,
    height: 259,
    variants: [
      { src: markLight1x, width: 74, height: 44 },
      { src: markLight2x, width: 148, height: 88 },
      { src: markLightFull, width: 433, height: 259 },
    ],
    truthClass: "brand-mark",
    altEn: "Official insignia and emblem of Palestinian Airlines.",
    altAr: "الشعار المعتمد للخطوط الجوية الفلسطينية ومطار غزة الدولي.",
  },

  "brand-mark": {
    id: "brand-mark",
    width: 433,
    height: 259,
    variants: [
      { src: markLight1x, width: 74, height: 44 },
      { src: markLight2x, width: 148, height: 88 },
      { src: markLightFull, width: 433, height: 259 },
    ],
    truthClass: "brand-mark",
    altEn: "Official insignia and emblem of Palestinian Airlines.",
    altAr: "الشعار المعتمد للخطوط الجوية الفلسطينية ومطار غزة الدولي.",
  },

  "airport-archive-hero-2000": {
    id: "airport-archive-hero-2000",
    width: 1376,
    height: 911,
    variants: [
      { src: airportArchive2000_640, width: 640, height: 424 },
      { src: airportArchive2000_960, width: 960, height: 635 },
      { src: airportArchive2000_1280, width: 1280, height: 847 },
      { src: airportArchive2000_1376, width: 1376, height: 911 },
    ],
    truthClass: "historical-documentary",
    altEn: "Historical photograph of the Gaza International Airport passenger terminal and control tower in 2000.",
    altAr: "صورة تاريخية لمبنى المسافرين وبرج المراقبة في مطار غزة الدولي عام 2000.",
  },

  "gallery-aircraft-archive-2000": {
    id: "gallery-aircraft-archive-2000",
    width: 1376,
    height: 845,
    variants: [
      { src: galleryAircraft2000_640, width: 640, height: 393 },
      { src: galleryAircraft2000_960, width: 960, height: 590 },
      { src: galleryAircraft2000_1280, width: 1280, height: 786 },
      { src: galleryAircraft2000_1376, width: 1376, height: 845 },
    ],
    truthClass: "historical-documentary",
    altEn: "Historical photograph of a Palestinian Airlines passenger aircraft on the tarmac at Gaza International Airport in 2000.",
    altAr: "صورة تاريخية لطائرة ركاب تابعة للخطوط الجوية الفلسطينية على مدرج مطار غزة الدولي عام 2000.",
  },

  "destinations-hero": {
    id: "destinations-hero",
    width: 1376,
    height: 917,
    variants: [
      { src: destinationsHero640, width: 640, height: 427 },
      { src: destinationsHero960, width: 960, height: 640 },
      { src: destinationsHero1280, width: 1280, height: 853 },
      { src: destinationsHero1376, width: 1376, height: 917 },
    ],
    truthClass: "illustrative-photo",
    altEn: "Aerial view of snow-covered mountain ridges and cloud banks beneath a clear sky.",
    altAr: "مشهد جوي لقمم جبلية مكسوة بالثلوج وتشكيلات سحابية تحت سماء صافية.",
  },

  "travel-info-hero": {
    id: "travel-info-hero",
    width: 1376,
    height: 1032,
    variants: [
      { src: travelInfoHero640, width: 640, height: 480 },
      { src: travelInfoHero960, width: 960, height: 720 },
      { src: travelInfoHero1280, width: 1280, height: 960 },
      { src: travelInfoHero1376, width: 1376, height: 1032 },
    ],
    truthClass: "illustrative-photo",
    altEn: "Outdoor bilingual bus stop sign on a pedestrian walkway beside modern buildings and a roadway.",
    altAr: "لوحة موقف حافلات ثنائية اللغة على رصيف مشاة بمحاذاة مبانٍ حديثة وطريق للمركبات.",
  },

  "manage-booking-hero": {
    id: "manage-booking-hero",
    width: 1376,
    height: 916,
    variants: [
      { src: manageBookingHero640, width: 640, height: 426 },
      { src: manageBookingHero960, width: 960, height: 639 },
      { src: manageBookingHero1280, width: 1280, height: 852 },
      { src: manageBookingHero1376, width: 1376, height: 916 },
    ],
    truthClass: "illustrative-photo",
    altEn: "Close view of hands using a desktop computer keyboard and mouse at a service workstation.",
    altAr: "لقطة قريبة ليدي موظف يستخدم لوحة مفاتيح وفأرة حاسوب عند منصة خدمة.",
  },

  "check-in-hero": {
    id: "check-in-hero",
    width: 1376,
    height: 1032,
    variants: [
      { src: checkInHero640, width: 640, height: 480 },
      { src: checkInHero960, width: 960, height: 720 },
      { src: checkInHero1280, width: 1280, height: 960 },
      { src: checkInHero1376, width: 1376, height: 1032 },
    ],
    truthClass: "illustrative-photo",
    altEn: "Empty passenger queuing lane with stanchions and service counters inside a terminal.",
    altAr: "مسار اصطفاف خالٍ للمسافرين بحواجز شريطية ومكاتب خدمة داخل صالة المطار.",
  },

  "signin-photo": {
    id: "signin-photo",
    width: 1376,
    height: 1835,
    variants: [
      { src: signinPhoto640, width: 640, height: 853 },
      { src: signinPhoto960, width: 960, height: 1280 },
      { src: signinPhoto1280, width: 1280, height: 1707 },
      { src: signinPhoto1376, width: 1376, height: 1835 },
    ],
    truthClass: "illustrative-photo",
    altEn: "Commercial passenger aircraft parked at a terminal jet bridge on an airport apron.",
    altAr: "طائرة ركاب تجارية متوقفة عند جسر صعود المسافرين في ساحة المطار.",
  },
};

/** Build srcSet string from variants. */
export function buildSrcSet(entry: MediaEntry): string {
  return entry.variants.map((v) => `${v.src} ${v.width}w`).join(", ");
}

/** Smallest variant src (for src fallback). */
export function smallestSrc(entry: MediaEntry): string {
  return entry.variants[0]!.src;
}

/** Largest variant src. */
export function largestSrc(entry: MediaEntry): string {
  return entry.variants[entry.variants.length - 1]!.src;
}

/** Light-surface owner mark (1x: 74x44, ~4 KB). */
export const MARK_LIGHT_1X_SRC: string = markLight1x;

/** Light-surface owner mark (2x: 148x88, ~10 KB). */
export const MARK_LIGHT_2X_SRC: string = markLight2x;

/** Light-surface owner mark full resolution (433x259, ~14 KB). */
export const MARK_LIGHT_SRC: string = markLightFull;

/** Dark-surface owner mark (1x: 74x44, ~4 KB). */
export const MARK_DARK_1X_SRC: string = markDark1x;

/** Dark-surface owner mark (2x: 148x88, ~10 KB). */
export const MARK_DARK_2X_SRC: string = markDark2x;

/** Dark-surface owner mark full resolution (434x260, ~15 KB). */
export const MARK_DARK_SRC: string = markDarkFull;
