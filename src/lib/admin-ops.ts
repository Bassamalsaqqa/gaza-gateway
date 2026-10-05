/**
 * Operations configuration model for the staff workspace.
 * Session destinations configuration. Fleet, aircraft, seat maps, schedules, and commercial catalogs have separate canonical repositories.
 */
import { destinations } from "./data";

export const AIRCRAFT_NAMES = ["Airbus A320neo", "Airbus A321neo", "Boeing 737-800"] as const;

export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const next = [...list];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  const item = next[index] as T;
  next[index] = next[target] as T;
  next[target] = item;
  return next;
}

/* -------------------------------- destinations ----------------------------- */

export type DestinationConfig = {
  code: string;
  nameEn: string;
  nameAr: string;
  cityEn: string;
  cityAr: string;
  countryEn: string;
  countryAr: string;
  tz: string;
  flightMinutes: number;
  priceFrom: number;
  serviceActive: boolean;
  days: number[];
  weeklyFlights: number;
  descEn: string;
  descAr: string;
  goodToKnow: { en: string; ar: string }[];
  featured: boolean;
  published: boolean;
  seoTitleEn: string;
  seoTitleAr: string;
  seoDescEn: string;
  seoDescAr: string;
};

export function seedDestinationConfigs(): DestinationConfig[] {
  return destinations.map((d, i) => ({
    code: d.code,
    nameEn: d.name.en,
    nameAr: d.name.ar,
    cityEn: d.city.en,
    cityAr: d.city.ar,
    countryEn: d.country.en,
    countryAr: d.country.ar,
    tz: d.tz,
    flightMinutes: d.flightMinutes,
    priceFrom: d.priceFrom,
    serviceActive: true,
    days: [...d.days],
    weeklyFlights: d.weeklyFlights,
    descEn: d.blurb.en,
    descAr: i === 6 ? "" : d.blurb.ar,
    goodToKnow: d.goodToKnow.map((g) => ({ en: g.en, ar: g.ar })),
    featured: i < 3,
    published: true,
    seoTitleEn: `Flights from Gaza to ${d.city.en} — Palestinian Airlines`,
    seoTitleAr: `رحلات من غزة إلى ${d.city.ar} — الخطوط الجوية الفلسطينية`,
    seoDescEn: `Schedules, fares and travel information for Palestinian Airlines flights between Gaza and ${d.city.en}.`,
    seoDescAr: i === 6 ? "" : `الجداول والأسعار ومعلومات السفر لرحلات الخطوط الجوية الفلسطينية بين غزة و${d.city.ar}.`,
  }));
}

/* ----------------------------------- state --------------------------------- */

export type OpsState = {
  destinations: DestinationConfig[];
};

export function seedOpsState(): OpsState {
  return {
    destinations: seedDestinationConfigs(),
  };
}

/** Mock operational history for a dated flight — visible timeline only. */
export type HistoryEntry = { id: string; time: string; label: string; detail?: string };
