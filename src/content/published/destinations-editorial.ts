import { destinations } from "../../lib/data.ts";
import { publishedDestinationsPresentation } from "./destinations-presentation.ts";
import type { DestinationsEditorialContent, DestinationEditorialEntry } from "../types.ts";

/** Only the accepted read-only editorial fixture is copied; no operational facts enter CMS. */
export const publishedDestinationsEditorial: DestinationsEditorialContent = {
  id: "destinations.editorial", kind: "destinations.editorial", schemaVersion: 1,
  seo: structuredClone(publishedDestinationsPresentation.seo),
  destinations: destinations.map((destination) => ({
    code: destination.code as DestinationEditorialEntry["code"],
    seo: {
      title: {
        en: `${destination.city.en} (${destination.code}) from Gaza — Palestinian Airlines`,
        ar: `${destination.city.ar} (${destination.code}) من غزة — الخطوط الجوية الفلسطينية`,
      },
      description: {
        en: `Palestinian Airlines flies from Gaza International Airport to ${destination.city.en}. Flight time, weekly schedule, fares and booking.`,
        ar: `الخطوط الجوية الفلسطينية من مطار غزة الدولي إلى ${destination.city.ar}. معلومات الوجهة والرحلات والحجز التجريبي.`,
      },
    },
    blurb: structuredClone(destination.blurb),
    goodToKnow: destination.goodToKnow.map((text, index) => ({
      id: `${destination.code.toLowerCase()}-point-${index + 1}`, text: structuredClone(text), visible: true,
    })),
  })),
};
