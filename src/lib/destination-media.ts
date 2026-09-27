/**
 * Gaza Gateway — Typed destination photo registry.
 * Owner-provided destination editorial photographs for the 7 opening route destinations.
 *
 * Distinct from historical / Future MEDIA truth classes and heavy Admin registries.
 * Rights / provenance metadata pending Phase 7B.
 */

// ─── Vite Asset Imports (Fingerprinted at build time) ─────────────────────────

// Amman (AMM)
import amman480 from "@/assets/media/destinations/amman-480.webp";
import amman800 from "@/assets/media/destinations/amman-800.webp";
import amman1200 from "@/assets/media/destinations/amman-1200.webp";
import amman1600 from "@/assets/media/destinations/amman-1600.webp";
import amman1920 from "@/assets/media/destinations/amman-1920.webp";

// Cairo (CAI)
import cairo480 from "@/assets/media/destinations/cairo-480.webp";
import cairo800 from "@/assets/media/destinations/cairo-800.webp";
import cairo1200 from "@/assets/media/destinations/cairo-1200.webp";
import cairo1600 from "@/assets/media/destinations/cairo-1600.webp";
import cairo1920 from "@/assets/media/destinations/cairo-1920.webp";

// Doha (DOH)
import doha480 from "@/assets/media/destinations/doha-480.webp";
import doha800 from "@/assets/media/destinations/doha-800.webp";
import doha1200 from "@/assets/media/destinations/doha-1200.webp";
import doha1600 from "@/assets/media/destinations/doha-1600.webp";
import doha1920 from "@/assets/media/destinations/doha-1920.webp";

// Dubai (DXB)
import dubai480 from "@/assets/media/destinations/dubai-480.webp";
import dubai800 from "@/assets/media/destinations/dubai-800.webp";
import dubai1200 from "@/assets/media/destinations/dubai-1200.webp";
import dubai1600 from "@/assets/media/destinations/dubai-1600.webp";
import dubai1920 from "@/assets/media/destinations/dubai-1920.webp";

// Istanbul (IST)
import istanbul480 from "@/assets/media/destinations/istanbul-480.webp";
import istanbul800 from "@/assets/media/destinations/istanbul-800.webp";
import istanbul1200 from "@/assets/media/destinations/istanbul-1200.webp";
import istanbul1600 from "@/assets/media/destinations/istanbul-1600.webp";
import istanbul1920 from "@/assets/media/destinations/istanbul-1920.webp";

// Jeddah (JED)
import jeddah480 from "@/assets/media/destinations/jeddah-480.webp";
import jeddah800 from "@/assets/media/destinations/jeddah-800.webp";
import jeddah1200 from "@/assets/media/destinations/jeddah-1200.webp";
import jeddah1600 from "@/assets/media/destinations/jeddah-1600.webp";
import jeddah1920 from "@/assets/media/destinations/jeddah-1920.webp";

// Riyadh (RUH)
import riyadh480 from "@/assets/media/destinations/riyadh-480.webp";
import riyadh800 from "@/assets/media/destinations/riyadh-800.webp";
import riyadh1200 from "@/assets/media/destinations/riyadh-1200.webp";
import riyadh1600 from "@/assets/media/destinations/riyadh-1600.webp";
import riyadh1920 from "@/assets/media/destinations/riyadh-1920.webp";

import {
  DESTINATION_PHOTO_METADATA,
  isDestinationCode,
  isDestinationPhotoId,
  type DestinationCode,
  type DestinationPhoto,
  type DestinationPhotoId,
} from "./destination-media-base";

export * from "./destination-media-base";

// ─── Registry Entries ────────────────────────────────────────────────────────

const ammanSources = [amman480, amman800, amman1200, amman1600, amman1920];
const cairoSources = [cairo480, cairo800, cairo1200, cairo1600, cairo1920];
const dohaSources = [doha480, doha800, doha1200, doha1600, doha1920];
const dubaiSources = [dubai480, dubai800, dubai1200, dubai1600, dubai1920];
const istanbulSources = [istanbul480, istanbul800, istanbul1200, istanbul1600, istanbul1920];
const jeddahSources = [jeddah480, jeddah800, jeddah1200, jeddah1600, jeddah1920];
const riyadhSources = [riyadh480, riyadh800, riyadh1200, riyadh1600, riyadh1920];

function attachSources(
  meta: (typeof DESTINATION_PHOTO_METADATA)[DestinationPhotoId],
  sources: string[],
): DestinationPhoto {
  return {
    ...meta,
    variants: meta.variants.map((v, i) => ({
      ...v,
      src: sources[i] ?? "",
    })),
  };
}

export const DESTINATION_PHOTOS: Record<DestinationPhotoId, DestinationPhoto> = {
  "city-amman": attachSources(DESTINATION_PHOTO_METADATA["city-amman"], ammanSources),
  "city-cairo": attachSources(DESTINATION_PHOTO_METADATA["city-cairo"], cairoSources),
  "city-doha": attachSources(DESTINATION_PHOTO_METADATA["city-doha"], dohaSources),
  "city-dubai": attachSources(DESTINATION_PHOTO_METADATA["city-dubai"], dubaiSources),
  "city-istanbul": attachSources(DESTINATION_PHOTO_METADATA["city-istanbul"], istanbulSources),
  "city-jeddah": attachSources(DESTINATION_PHOTO_METADATA["city-jeddah"], jeddahSources),
  "city-riyadh": attachSources(DESTINATION_PHOTO_METADATA["city-riyadh"], riyadhSources),
};

export const DESTINATION_PHOTO_BY_CODE: Record<DestinationCode, DestinationPhoto> = {
  AMM: DESTINATION_PHOTOS["city-amman"],
  CAI: DESTINATION_PHOTOS["city-cairo"],
  DOH: DESTINATION_PHOTOS["city-doha"],
  DXB: DESTINATION_PHOTOS["city-dubai"],
  IST: DESTINATION_PHOTOS["city-istanbul"],
  JED: DESTINATION_PHOTOS["city-jeddah"],
  RUH: DESTINATION_PHOTOS["city-riyadh"],
};

export function getDestinationPhotoByCode(code: string): DestinationPhoto | undefined {
  if (isDestinationCode(code)) {
    return DESTINATION_PHOTO_BY_CODE[code];
  }
  return undefined;
}

export function getDestinationPhotoById(id: string): DestinationPhoto | undefined {
  if (isDestinationPhotoId(id)) {
    return DESTINATION_PHOTOS[id];
  }
  return undefined;
}
