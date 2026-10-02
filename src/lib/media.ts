/**
 * Gaza Gateway — Typed media registry.
 * Registry of approved visual assets, including owner-provided AI-generated
 * future concept visualizations, authentic historical documentary archive photos,
 * and illustrative editorial photographs with strict truth classifications.
 *
 * IMPORTANT: Truth classes govern usage:
 * - 'historical-documentary': authentic historical records; never substitute with concept art.
 * - 'future-concept-ai': illustrative future concept visualizations; never use as historical evidence.
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

// Documentary archive photos (year 2008 ruins)
import airportPresentRuins2008_480 from "@/assets/media/documentary/airport-present-ruins-2008-480.webp";
import airportPresentRuins2008_768 from "@/assets/media/documentary/airport-present-ruins-2008-768.webp";
import airportPresentRuins2008_960 from "@/assets/media/documentary/airport-present-ruins-2008-960.webp";
import airportPresentRuins2008_1109 from "@/assets/media/documentary/airport-present-ruins-2008-1109.webp";

// Historical documentary archive photos (HC-3 owner intake display)
import past_003_360 from "@/assets/media/documentary/past/past-003-360.webp";
import past_003_480 from "@/assets/media/documentary/past/past-003-480.webp";
import past_003_600 from "@/assets/media/documentary/past/past-003-600.webp";
import past_005_360 from "@/assets/media/documentary/past/past-005-360.webp";
import past_005_480 from "@/assets/media/documentary/past/past-005-480.webp";
import past_005_600 from "@/assets/media/documentary/past/past-005-600.webp";
import past_006_360 from "@/assets/media/documentary/past/past-006-360.webp";
import past_006_470 from "@/assets/media/documentary/past/past-006-470.webp";
import past_007_360 from "@/assets/media/documentary/past/past-007-360.webp";
import past_007_480 from "@/assets/media/documentary/past/past-007-480.webp";
import past_007_600 from "@/assets/media/documentary/past/past-007-600.webp";
import past_008_360 from "@/assets/media/documentary/past/past-008-360.webp";
import past_008_480 from "@/assets/media/documentary/past/past-008-480.webp";
import past_008_600 from "@/assets/media/documentary/past/past-008-600.webp";
import past_009_360 from "@/assets/media/documentary/past/past-009-360.webp";
import past_009_480 from "@/assets/media/documentary/past/past-009-480.webp";
import past_009_600 from "@/assets/media/documentary/past/past-009-600.webp";
import past_010_360 from "@/assets/media/documentary/past/past-010-360.webp";
import past_010_480 from "@/assets/media/documentary/past/past-010-480.webp";
import past_010_640 from "@/assets/media/documentary/past/past-010-640.webp";
import past_011_360 from "@/assets/media/documentary/past/past-011-360.webp";
import past_011_480 from "@/assets/media/documentary/past/past-011-480.webp";
import past_011_600 from "@/assets/media/documentary/past/past-011-600.webp";
import past_012_360 from "@/assets/media/documentary/past/past-012-360.webp";
import past_012_480 from "@/assets/media/documentary/past/past-012-480.webp";
import past_012_600 from "@/assets/media/documentary/past/past-012-600.webp";
import past_014_360 from "@/assets/media/documentary/past/past-014-360.webp";
import past_014_480 from "@/assets/media/documentary/past/past-014-480.webp";
import past_014_600 from "@/assets/media/documentary/past/past-014-600.webp";
import past_015_360 from "@/assets/media/documentary/past/past-015-360.webp";
import past_015_480 from "@/assets/media/documentary/past/past-015-480.webp";
import past_015_600 from "@/assets/media/documentary/past/past-015-600.webp";
import past_016_360 from "@/assets/media/documentary/past/past-016-360.webp";
import past_016_480 from "@/assets/media/documentary/past/past-016-480.webp";
import past_016_600 from "@/assets/media/documentary/past/past-016-600.webp";
import past_021_360 from "@/assets/media/documentary/past/past-021-360.webp";
import past_021_480 from "@/assets/media/documentary/past/past-021-480.webp";
import past_021_640 from "@/assets/media/documentary/past/past-021-640.webp";
import past_022_360 from "@/assets/media/documentary/past/past-022-360.webp";
import past_022_480 from "@/assets/media/documentary/past/past-022-480.webp";
import past_022_640 from "@/assets/media/documentary/past/past-022-640.webp";
import past_023_360 from "@/assets/media/documentary/past/past-023-360.webp";
import past_023_480 from "@/assets/media/documentary/past/past-023-480.webp";
import past_023_640 from "@/assets/media/documentary/past/past-023-640.webp";
import past_024_360 from "@/assets/media/documentary/past/past-024-360.webp";
import past_024_480 from "@/assets/media/documentary/past/past-024-480.webp";
import past_024_640 from "@/assets/media/documentary/past/past-024-640.webp";
import past_024_960 from "@/assets/media/documentary/past/past-024-960.webp";
import past_024_1280 from "@/assets/media/documentary/past/past-024-1280.webp";
import past_024_1496 from "@/assets/media/documentary/past/past-024-1496.webp";
import past_026_360 from "@/assets/media/documentary/past/past-026-360.webp";
import past_026_480 from "@/assets/media/documentary/past/past-026-480.webp";
import past_026_640 from "@/assets/media/documentary/past/past-026-640.webp";
import past_026_750 from "@/assets/media/documentary/past/past-026-750.webp";
import past_028_360 from "@/assets/media/documentary/past/past-028-360.webp";
import past_028_480 from "@/assets/media/documentary/past/past-028-480.webp";
import past_028_600 from "@/assets/media/documentary/past/past-028-600.webp";
import past_029_360 from "@/assets/media/documentary/past/past-029-360.webp";
import past_029_480 from "@/assets/media/documentary/past/past-029-480.webp";
import past_029_640 from "@/assets/media/documentary/past/past-029-640.webp";
import past_030_360 from "@/assets/media/documentary/past/past-030-360.webp";
import past_030_480 from "@/assets/media/documentary/past/past-030-480.webp";
import past_030_640 from "@/assets/media/documentary/past/past-030-640.webp";
import past_031_360 from "@/assets/media/documentary/past/past-031-360.webp";
import past_031_480 from "@/assets/media/documentary/past/past-031-480.webp";
import past_031_640 from "@/assets/media/documentary/past/past-031-640.webp";
import past_032_360 from "@/assets/media/documentary/past/past-032-360.webp";
import past_032_480 from "@/assets/media/documentary/past/past-032-480.webp";
import past_032_640 from "@/assets/media/documentary/past/past-032-640.webp";
import past_032_689 from "@/assets/media/documentary/past/past-032-689.webp";
import past_033_360 from "@/assets/media/documentary/past/past-033-360.webp";
import past_033_480 from "@/assets/media/documentary/past/past-033-480.webp";
import past_033_640 from "@/assets/media/documentary/past/past-033-640.webp";
import past_038_360 from "@/assets/media/documentary/past/past-038-360.webp";
import past_038_480 from "@/assets/media/documentary/past/past-038-480.webp";
import past_038_640 from "@/assets/media/documentary/past/past-038-640.webp";
import past_038_960 from "@/assets/media/documentary/past/past-038-960.webp";
import past_040_360 from "@/assets/media/documentary/past/past-040-360.webp";
import past_040_480 from "@/assets/media/documentary/past/past-040-480.webp";
import past_040_640 from "@/assets/media/documentary/past/past-040-640.webp";
import past_040_720 from "@/assets/media/documentary/past/past-040-720.webp";
import past_042_360 from "@/assets/media/documentary/past/past-042-360.webp";
import past_042_480 from "@/assets/media/documentary/past/past-042-480.webp";
import past_042_640 from "@/assets/media/documentary/past/past-042-640.webp";
import past_042_800 from "@/assets/media/documentary/past/past-042-800.webp";
import past_043_360 from "@/assets/media/documentary/past/past-043-360.webp";
import past_043_480 from "@/assets/media/documentary/past/past-043-480.webp";
import past_043_640 from "@/assets/media/documentary/past/past-043-640.webp";
import past_044_360 from "@/assets/media/documentary/past/past-044-360.webp";
import past_044_480 from "@/assets/media/documentary/past/past-044-480.webp";
import past_044_640 from "@/assets/media/documentary/past/past-044-640.webp";
import past_044_720 from "@/assets/media/documentary/past/past-044-720.webp";
import past_045_360 from "@/assets/media/documentary/past/past-045-360.webp";
import past_045_480 from "@/assets/media/documentary/past/past-045-480.webp";
import past_045_640 from "@/assets/media/documentary/past/past-045-640.webp";
import past_046_360 from "@/assets/media/documentary/past/past-046-360.webp";
import past_046_480 from "@/assets/media/documentary/past/past-046-480.webp";
import past_046_640 from "@/assets/media/documentary/past/past-046-640.webp";
import past_049_360 from "@/assets/media/documentary/past/past-049-360.webp";
import past_049_480 from "@/assets/media/documentary/past/past-049-480.webp";
import past_049_600 from "@/assets/media/documentary/past/past-049-600.webp";
import past_050_360 from "@/assets/media/documentary/past/past-050-360.webp";
import past_050_480 from "@/assets/media/documentary/past/past-050-480.webp";
import past_050_640 from "@/assets/media/documentary/past/past-050-640.webp";
import past_050_960 from "@/assets/media/documentary/past/past-050-960.webp";
import past_050_1280 from "@/assets/media/documentary/past/past-050-1280.webp";
import past_050_2048 from "@/assets/media/documentary/past/past-050-2048.webp";
import past_051_360 from "@/assets/media/documentary/past/past-051-360.webp";
import past_051_480 from "@/assets/media/documentary/past/past-051-480.webp";
import past_051_640 from "@/assets/media/documentary/past/past-051-640.webp";
import past_053_360 from "@/assets/media/documentary/past/past-053-360.webp";
import past_053_480 from "@/assets/media/documentary/past/past-053-480.webp";
import past_053_640 from "@/assets/media/documentary/past/past-053-640.webp";
import past_054_360 from "@/assets/media/documentary/past/past-054-360.webp";
import past_054_480 from "@/assets/media/documentary/past/past-054-480.webp";
import past_054_640 from "@/assets/media/documentary/past/past-054-640.webp";
import past_056_360 from "@/assets/media/documentary/past/past-056-360.webp";
import past_056_480 from "@/assets/media/documentary/past/past-056-480.webp";
import past_056_640 from "@/assets/media/documentary/past/past-056-640.webp";
import past_056_800 from "@/assets/media/documentary/past/past-056-800.webp";
import past_058_360 from "@/assets/media/documentary/past/past-058-360.webp";
import past_058_480 from "@/assets/media/documentary/past/past-058-480.webp";
import past_058_640 from "@/assets/media/documentary/past/past-058-640.webp";
import past_058_768 from "@/assets/media/documentary/past/past-058-768.webp";

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

  "airport-present-ruins-2008": {
    id: "airport-present-ruins-2008",
    width: 1109,
    height: 411,
    variants: [
      { src: airportPresentRuins2008_480, width: 480, height: 178 },
      { src: airportPresentRuins2008_768, width: 768, height: 285 },
      { src: airportPresentRuins2008_960, width: 960, height: 356 },
      { src: airportPresentRuins2008_1109, width: 1109, height: 411 },
    ],
    truthClass: "historical-documentary",
    altEn: "Documentary photograph of the destroyed passenger terminal and architectural dome at Gaza International Airport, captured in June 2008.",
    altAr: "صورة وثائقية لمبنى المسافرين المدمر والقبة المعمارية في مطار غزة الدولي، وُثِّقت في يونيو/حزيران 2008.",
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

  // Historical documentary archive photos (HC-3 owner intake display)
  "past-003": {
    id: "past-003",
    width: 600,
    height: 335,
    variants: [
      { src: past_003_360, width: 360, height: 201 },
      { src: past_003_480, width: 480, height: 268 },
      { src: past_003_600, width: 600, height: 335 },
    ],
    truthClass: "historical-documentary",
    altEn: "A white Palestinian Airlines twin-engine turboprop with a high wing and T-tail parked on an apron.",
    altAr: "طائرة توربينية بيضاء للخطوط الجوية الفلسطينية ذات جناح مرتفع وذيل على شكل T متوقفة على ساحة مطار.",
  },
  "past-005": {
    id: "past-005",
    width: 600,
    height: 385,
    variants: [
      { src: past_005_360, width: 360, height: 231 },
      { src: past_005_480, width: 480, height: 308 },
      { src: past_005_600, width: 600, height: 385 },
    ],
    truthClass: "historical-documentary",
    altEn: "Airport apron, passenger terminal and tall control tower with part of a large airliner in the foreground.",
    altAr: "ساحة مطار ومبنى مسافرين وبرج مراقبة مرتفع وجزء من طائرة كبيرة في المقدمة.",
  },
  "past-006": {
    id: "past-006",
    width: 470,
    height: 600,
    variants: [
      { src: past_006_360, width: 360, height: 460 },
      { src: past_006_470, width: 470, height: 600 },
    ],
    truthClass: "historical-documentary",
    altEn: "A uniformed cabin crew member standing in an aircraft cabin during in-flight service.",
    altAr: "إحدى أفراد طاقم الضيافة بزي رسمي داخل مقصورة طائرة أثناء الخدمة.",
  },
  "past-007": {
    id: "past-007",
    width: 600,
    height: 407,
    variants: [
      { src: past_007_360, width: 360, height: 244 },
      { src: past_007_480, width: 480, height: 326 },
      { src: past_007_600, width: 600, height: 407 },
    ],
    truthClass: "historical-documentary",
    altEn: "Airline pilots and cabin crew pose together in front of a Palestinian Airlines aircraft.",
    altAr: "طيارون وأفراد ضيافة يقفون معاً أمام طائرة للخطوط الجوية الفلسطينية.",
  },
  "past-008": {
    id: "past-008",
    width: 600,
    height: 446,
    variants: [
      { src: past_008_360, width: 360, height: 268 },
      { src: past_008_480, width: 480, height: 357 },
      { src: past_008_600, width: 600, height: 446 },
    ],
    truthClass: "historical-documentary",
    altEn: "Three flight crew members seated in an aircraft cockpit, with one turning toward the camera.",
    altAr: "ثلاثة من أفراد الطاقم جالسون في قمرة قيادة طائرة وأحدهم يلتفت نحو الكاميرا.",
  },
  "past-009": {
    id: "past-009",
    width: 600,
    height: 397,
    variants: [
      { src: past_009_360, width: 360, height: 238 },
      { src: past_009_480, width: 480, height: 318 },
      { src: past_009_600, width: 600, height: 397 },
    ],
    truthClass: "historical-documentary",
    altEn: "Four uniformed pilots stand side by side in front of a Palestinian Airlines aircraft.",
    altAr: "أربعة طيارين بزي رسمي يقفون جنباً إلى جنب أمام طائرة للخطوط الجوية الفلسطينية.",
  },
  "past-010": {
    id: "past-010",
    width: 640,
    height: 433,
    variants: [
      { src: past_010_360, width: 360, height: 244 },
      { src: past_010_480, width: 480, height: 325 },
      { src: past_010_640, width: 640, height: 433 },
    ],
    truthClass: "historical-documentary",
    altEn: "Workers handle cardboard boxes beside an aircraft stairway marked Gaza International Airport on the apron.",
    altAr: "عمال يناولون صناديق بجانب سُلّم طائرة مكتوب عليه Gaza International Airport على ساحة المطار.",
  },
  "past-011": {
    id: "past-011",
    width: 600,
    height: 381,
    variants: [
      { src: past_011_360, width: 360, height: 229 },
      { src: past_011_480, width: 480, height: 305 },
      { src: past_011_600, width: 600, height: 381 },
    ],
    truthClass: "historical-documentary",
    altEn: "Passengers in light-colored clothing gather near the stairs of a Palestinian Airlines aircraft.",
    altAr: "مسافرون بملابس فاتحة يتجمعون قرب سُلّم طائرة للخطوط الجوية الفلسطينية.",
  },
  "past-012": {
    id: "past-012",
    width: 600,
    height: 407,
    variants: [
      { src: past_012_360, width: 360, height: 244 },
      { src: past_012_480, width: 480, height: 326 },
      { src: past_012_600, width: 600, height: 407 },
    ],
    truthClass: "historical-documentary",
    altEn: "Several passengers descend aircraft stairs while ground staff wait beside the aircraft.",
    altAr: "عدة مسافرين ينزلون سُلّم طائرة بينما يقف موظفون أرضيون بجانبها.",
  },
  "past-014": {
    id: "past-014",
    width: 600,
    height: 428,
    variants: [
      { src: past_014_360, width: 360, height: 257 },
      { src: past_014_480, width: 480, height: 342 },
      { src: past_014_600, width: 600, height: 428 },
    ],
    truthClass: "historical-documentary",
    altEn: "A passenger in white pilgrimage clothing stands in front of a Palestinian Airlines aircraft.",
    altAr: "مسافرة بملابس الحج البيضاء تقف أمام طائرة للخطوط الجوية الفلسطينية.",
  },
  "past-015": {
    id: "past-015",
    width: 600,
    height: 319,
    variants: [
      { src: past_015_360, width: 360, height: 191 },
      { src: past_015_480, width: 480, height: 255 },
      { src: past_015_600, width: 600, height: 319 },
    ],
    truthClass: "historical-documentary",
    altEn: "Passengers in white pilgrimage garments descend aircraft stairs with staff nearby.",
    altAr: "مسافرون بملابس الحج البيضاء ينزلون سُلّم طائرة وموظفون بالقرب منهم.",
  },
  "past-016": {
    id: "past-016",
    width: 600,
    height: 395,
    variants: [
      { src: past_016_360, width: 360, height: 237 },
      { src: past_016_480, width: 480, height: 316 },
      { src: past_016_600, width: 600, height: 395 },
    ],
    truthClass: "historical-documentary",
    altEn: "Passengers in white pilgrimage garments descend from an aircraft while a ground worker assists them.",
    altAr: "مسافرون بملابس الحج البيضاء ينزلون من طائرة بينما يساعدهم موظف أرضي.",
  },
  "past-021": {
    id: "past-021",
    width: 640,
    height: 480,
    variants: [
      { src: past_021_360, width: 360, height: 270 },
      { src: past_021_480, width: 480, height: 360 },
      { src: past_021_640, width: 640, height: 480 },
    ],
    truthClass: "historical-documentary",
    altEn: "Front of a small airport service building with an air-cargo sign above an arched entrance.",
    altAr: "واجهة مبنى خدمات صغير في المطار مع لافتة للشحن الجوي فوق مدخل مقوس.",
  },
  "past-022": {
    id: "past-022",
    width: 640,
    height: 480,
    variants: [
      { src: past_022_360, width: 360, height: 270 },
      { src: past_022_480, width: 480, height: 360 },
      { src: past_022_640, width: 640, height: 480 },
    ],
    truthClass: "historical-documentary",
    altEn: "Large rectangular airport hangar or service building with tall segmented doors.",
    altAr: "مبنى مستطيل كبير في المطار يشبه الحظيرة وله أبواب مقسمة مرتفعة.",
  },
  "past-023": {
    id: "past-023",
    width: 640,
    height: 480,
    variants: [
      { src: past_023_360, width: 360, height: 270 },
      { src: past_023_480, width: 480, height: 360 },
      { src: past_023_640, width: 640, height: 480 },
    ],
    truthClass: "historical-documentary",
    altEn: "Red-and-white ambulance parked in front of several airport service-bay doors.",
    altAr: "سيارة إسعاف حمراء وبيضاء متوقفة أمام عدة أبواب لمرافق خدمات في المطار.",
  },
  "past-024": {
    id: "past-024",
    width: 1496,
    height: 919,
    variants: [
      { src: past_024_360, width: 360, height: 221 },
      { src: past_024_480, width: 480, height: 295 },
      { src: past_024_640, width: 640, height: 393 },
      { src: past_024_960, width: 960, height: 590 },
      { src: past_024_1280, width: 1280, height: 786 },
      { src: past_024_1496, width: 1496, height: 919 },
    ],
    truthClass: "historical-documentary",
    altEn: "Wide view of the intact airport terminal and control tower behind landscaped grounds and palm trees.",
    altAr: "منظر واسع لمبنى المطار وبرج المراقبة وهما سليمَان خلف حدائق وأشجار نخيل.",
  },
  "past-026": {
    id: "past-026",
    width: 750,
    height: 472,
    variants: [
      { src: past_026_360, width: 360, height: 227 },
      { src: past_026_480, width: 480, height: 302 },
      { src: past_026_640, width: 640, height: 403 },
      { src: past_026_750, width: 750, height: 472 },
    ],
    truthClass: "historical-documentary",
    altEn: "Long row of freestanding airport arches leading toward a ruined building under a blue sky.",
    altAr: "صف طويل من أقواس المطار القائمة يقود نحو مبنى مهدّم تحت سماء زرقاء.",
  },
  "past-028": {
    id: "past-028",
    width: 600,
    height: 450,
    variants: [
      { src: past_028_360, width: 360, height: 270 },
      { src: past_028_480, width: 480, height: 360 },
      { src: past_028_600, width: 600, height: 450 },
    ],
    truthClass: "historical-documentary",
    altEn: "Open airport parking or approach area with a red car, palm trees and white entrance structures in the distance.",
    altAr: "منطقة مواقف أو وصول مفتوحة في المطار مع سيارة حمراء ونخيل ومنشآت مدخل بيضاء في الخلفية.",
  },
  "past-029": {
    id: "past-029",
    width: 640,
    height: 480,
    variants: [
      { src: past_029_360, width: 360, height: 270 },
      { src: past_029_480, width: 480, height: 360 },
      { src: past_029_640, width: 640, height: 480 },
    ],
    truthClass: "historical-documentary",
    altEn: "Three large cylindrical storage tanks with service piping in the foreground.",
    altAr: "ثلاثة خزانات أسطوانية كبيرة مع تجهيزات وأنابيب خدمات في المقدمة.",
  },
  "past-030": {
    id: "past-030",
    width: 640,
    height: 480,
    variants: [
      { src: past_030_360, width: 360, height: 270 },
      { src: past_030_480, width: 480, height: 360 },
      { src: past_030_640, width: 640, height: 480 },
    ],
    truthClass: "historical-documentary",
    altEn: "Red airport fire engine parked beside a cream-colored service building with an arched entrance.",
    altAr: "مركبة إطفاء حمراء في المطار متوقفة بجانب مبنى خدمات فاتح اللون بمدخل مقوس.",
  },
  "past-031": {
    id: "past-031",
    width: 640,
    height: 480,
    variants: [
      { src: past_031_360, width: 360, height: 270 },
      { src: past_031_480, width: 480, height: 360 },
      { src: past_031_640, width: 640, height: 480 },
    ],
    truthClass: "historical-documentary",
    altEn: "Symmetrical airport building with arched windows on two wings and a rounded glass entrance in the center.",
    altAr: "مبنى مطار متناظر بنوافذ مقوسة في جناحين ومدخل زجاجي مستدير في الوسط.",
  },
  "past-032": {
    id: "past-032",
    width: 689,
    height: 429,
    variants: [
      { src: past_032_360, width: 360, height: 224 },
      { src: past_032_480, width: 480, height: 299 },
      { src: past_032_640, width: 640, height: 398 },
      { src: past_032_689, width: 689, height: 429 },
    ],
    truthClass: "historical-documentary",
    altEn: "Airport control tower rising behind a long terminal façade with repeating pointed arches.",
    altAr: "برج مراقبة في المطار يرتفع خلف واجهة طويلة لمبنى المسافرين ذات أقواس مدببة متكررة.",
  },
  "past-033": {
    id: "past-033",
    width: 640,
    height: 480,
    variants: [
      { src: past_033_360, width: 360, height: 270 },
      { src: past_033_480, width: 480, height: 360 },
      { src: past_033_640, width: 640, height: 480 },
    ],
    truthClass: "historical-documentary",
    altEn: "Long intact airport terminal frontage with repeating arches, palm trees and signage along the roofline.",
    altAr: "واجهة طويلة وسليمة لمبنى المطار مع أقواس متكررة ونخيل ولافتة على خط السقف.",
  },
  "past-038": {
    id: "past-038",
    width: 960,
    height: 682,
    variants: [
      { src: past_038_360, width: 360, height: 256 },
      { src: past_038_480, width: 480, height: 341 },
      { src: past_038_640, width: 640, height: 455 },
      { src: past_038_960, width: 960, height: 682 },
    ],
    truthClass: "historical-documentary",
    altEn: "Uniformed personnel on a grassy area beside the airport terminal and control tower.",
    altAr: "أفراد بزي رسمي على مساحة عشبية بجانب مبنى المطار وبرج المراقبة.",
  },
  "past-040": {
    id: "past-040",
    width: 720,
    height: 540,
    variants: [
      { src: past_040_360, width: 360, height: 270 },
      { src: past_040_480, width: 480, height: 360 },
      { src: past_040_640, width: 640, height: 480 },
      { src: past_040_720, width: 720, height: 540 },
    ],
    truthClass: "historical-documentary",
    altEn: "Intact airport control tower framed by palm trees and green landscaping under a blue sky.",
    altAr: "برج مراقبة مطار سليم تحيط به أشجار نخيل وتشجير أخضر تحت سماء زرقاء.",
  },
  "past-042": {
    id: "past-042",
    width: 800,
    height: 534,
    variants: [
      { src: past_042_360, width: 360, height: 240 },
      { src: past_042_480, width: 480, height: 320 },
      { src: past_042_640, width: 640, height: 427 },
      { src: past_042_800, width: 800, height: 534 },
    ],
    truthClass: "historical-documentary",
    altEn: "Wide baggage-claim hall with a carousel, luggage trolleys and rows of pointed arches.",
    altAr: "صالة واسعة لاستلام الأمتعة فيها سير حقائب وعربات وأقواس مدببة متكررة.",
  },
  "past-043": {
    id: "past-043",
    width: 640,
    height: 480,
    variants: [
      { src: past_043_360, width: 360, height: 270 },
      { src: past_043_480, width: 480, height: 360 },
      { src: past_043_640, width: 640, height: 480 },
    ],
    truthClass: "historical-documentary",
    altEn: "Airport baggage-claim area with a carousel at right and service counters or doors at left.",
    altAr: "منطقة استلام أمتعة في المطار مع سير حقائب إلى اليمين وواجهات خدمات أو أبواب إلى اليسار.",
  },
  "past-044": {
    id: "past-044",
    width: 720,
    height: 536,
    variants: [
      { src: past_044_360, width: 360, height: 268 },
      { src: past_044_480, width: 480, height: 357 },
      { src: past_044_640, width: 640, height: 476 },
      { src: past_044_720, width: 720, height: 536 },
    ],
    truthClass: "historical-documentary",
    altEn: "Small bank counter inside the airport beneath bilingual Egyptian Arab Land Bank signage.",
    altAr: "مكتب مصرفي صغير داخل المطار أسفل لافتة ثنائية اللغة للبنك العقاري المصري العربي.",
  },
  "past-045": {
    id: "past-045",
    width: 640,
    height: 480,
    variants: [
      { src: past_045_360, width: 360, height: 270 },
      { src: past_045_480, width: 480, height: 360 },
      { src: past_045_640, width: 640, height: 480 },
    ],
    truthClass: "historical-documentary",
    altEn: "Several airport counters beneath overhead number signs and pointed architectural arches.",
    altAr: "عدة كاونترات في المطار أسفل لوحات أرقام وأقواس معمارية مدببة.",
  },
  "past-046": {
    id: "past-046",
    width: 640,
    height: 480,
    variants: [
      { src: past_046_360, width: 360, height: 270 },
      { src: past_046_480, width: 480, height: 360 },
      { src: past_046_640, width: 640, height: 480 },
    ],
    truthClass: "historical-documentary",
    altEn: "Long airport hall with repeated columns and arches, benches and overhead monitors.",
    altAr: "ممر طويل في المطار بأعمدة وأقواس متكررة ومقاعد وشاشات علوية.",
  },
  "past-049": {
    id: "past-049",
    width: 600,
    height: 418,
    variants: [
      { src: past_049_360, width: 360, height: 251 },
      { src: past_049_480, width: 480, height: 334 },
      { src: past_049_600, width: 600, height: 418 },
    ],
    truthClass: "historical-documentary",
    altEn: "Crowded airport terminal hall with many passengers, families and luggage beneath high windows and arches.",
    altAr: "صالة مطار مزدحمة بالمسافرين والعائلات والحقائب تحت نوافذ مرتفعة وأقواس.",
  },
  "past-050": {
    id: "past-050",
    width: 2048,
    height: 1365,
    variants: [
      { src: past_050_360, width: 360, height: 240 },
      { src: past_050_480, width: 480, height: 320 },
      { src: past_050_640, width: 640, height: 427 },
      { src: past_050_960, width: 960, height: 640 },
      { src: past_050_1280, width: 1280, height: 853 },
      { src: past_050_2048, width: 2048, height: 1365 },
    ],
    truthClass: "historical-documentary",
    altEn: "Large airport waiting hall with rows of metal seats, pointed arches and glazed service areas.",
    altAr: "صالة انتظار كبيرة في المطار فيها صفوف مقاعد معدنية وأقواس مدببة وواجهات خدمات زجاجية.",
  },
  "past-051": {
    id: "past-051",
    width: 640,
    height: 480,
    variants: [
      { src: past_051_360, width: 360, height: 270 },
      { src: past_051_480, width: 480, height: 360 },
      { src: past_051_640, width: 640, height: 480 },
    ],
    truthClass: "historical-documentary",
    altEn: "Airport security screening equipment including a metal detector, baggage scanner and operator monitor.",
    altAr: "معدات تفتيش أمني في المطار تشمل بوابة كشف معدني وجهاز فحص حقائب وشاشة تشغيل.",
  },
  "past-053": {
    id: "past-053",
    width: 640,
    height: 480,
    variants: [
      { src: past_053_360, width: 360, height: 270 },
      { src: past_053_480, width: 480, height: 360 },
      { src: past_053_640, width: 640, height: 480 },
    ],
    truthClass: "historical-documentary",
    altEn: "Rows of metal airport seats beside large pointed-arch windows with daylight entering the hall.",
    altAr: "صفوف من مقاعد المطار المعدنية بجانب نوافذ كبيرة مدببة يدخل منها ضوء النهار.",
  },
  "past-054": {
    id: "past-054",
    width: 640,
    height: 480,
    variants: [
      { src: past_054_360, width: 360, height: 270 },
      { src: past_054_480, width: 480, height: 360 },
      { src: past_054_640, width: 640, height: 480 },
    ],
    truthClass: "historical-documentary",
    altEn: "Blue passport stamp reading Palestinian Authority and Gaza International Airport with the date 8-04-2000.",
    altAr: "ختم جواز أزرق مكتوب عليه السلطة الفلسطينية ومطار غزة الدولي ويحمل تاريخ 8-04-2000.",
  },
  "past-056": {
    id: "past-056",
    width: 800,
    height: 535,
    variants: [
      { src: past_056_360, width: 360, height: 241 },
      { src: past_056_480, width: 480, height: 321 },
      { src: past_056_640, width: 640, height: 428 },
      { src: past_056_800, width: 800, height: 535 },
    ],
    truthClass: "historical-documentary",
    altEn: "Several staff members work at consoles and telephones inside an airport control tower overlooking the airfield.",
    altAr: "عدة موظفين يعملون على وحدات تحكم وهواتف داخل برج مراقبة يطل على ساحة المطار.",
  },
  "past-058": {
    id: "past-058",
    width: 768,
    height: 484,
    variants: [
      { src: past_058_360, width: 360, height: 227 },
      { src: past_058_480, width: 480, height: 302 },
      { src: past_058_640, width: 640, height: 403 },
      { src: past_058_768, width: 768, height: 484 },
    ],
    truthClass: "historical-documentary",
    altEn: "Intact airport building with repeated pointed arches, parked cars, lawn and a Palestinian flag.",
    altAr: "مبنى مطار سليم بأقواس مدببة متكررة وسيارات متوقفة ومساحة خضراء وعلم فلسطيني.",
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
