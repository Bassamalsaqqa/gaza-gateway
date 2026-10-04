/**
 * Remaining operations configuration model for the staff workspace.
 * Session-only aircraft/seat maps/destinations. Schedules and commercial catalogs have separate repositories.
 */
import {
  SEAT_LETTERS,
  SEAT_ROWS,
  EXTRA_LEGROOM_ROWS,
  cabinZones,
  destinations,
  type CabinId,
} from "./data";

/* --------------------------------- schedules ------------------------------- */

export const AIRCRAFT_NAMES = ["Airbus A320neo", "Airbus A321neo", "Boeing 737-800"] as const;

/* --------------------------------- aircraft -------------------------------- */

export type AircraftType = {
  id: string;
  name: string;
  registration: string;
  capacity: number;
  cabins: CabinId[];
  active: boolean;
};

export function seedAircraft(): AircraftType[] {
  return [
    {
      id: "a320neo",
      name: "Airbus A320neo",
      registration: "PS-GZA",
      capacity: 168,
      cabins: ["economy", "premium", "business"],
      active: true,
    },
    {
      id: "a321neo",
      name: "Airbus A321neo",
      registration: "PS-GZB",
      capacity: 196,
      cabins: ["economy", "premium", "business"],
      active: true,
    },
    {
      id: "b737800",
      name: "Boeing 737-800",
      registration: "PS-GZC",
      capacity: 162,
      cabins: ["economy", "business"],
      active: false,
    },
  ];
}

/* -------------------------------- seat maps -------------------------------- */

export type SeatZone = { id: CabinId; firstRow: number; lastRow: number };

export type SeatMapConfig = {
  aircraftId: string;
  rows: number;
  letters: string[];
  /** Aisle sits after this many seat letters (3 = A B C | D E F). */
  aisleAfter: number;
  zones: SeatZone[];
  extraLegroomRows: number[];
  /** Seats that do not exist or are blocked, e.g. "12B". */
  unavailable: string[];
  feeLabelEn: string;
  feeLabelAr: string;
};

export function defaultSeatMap(aircraftId: string, rows = SEAT_ROWS): SeatMapConfig {
  return {
    aircraftId,
    rows,
    letters: [...SEAT_LETTERS],
    aisleAfter: 3,
    zones: cabinZones.map((z) => ({ id: z.id, firstRow: z.firstRow, lastRow: Math.min(z.lastRow, rows) })),
    extraLegroomRows: [...EXTRA_LEGROOM_ROWS],
    unavailable: [],
    feeLabelEn: "Extra legroom — $18",
    feeLabelAr: "مساحة أرجل أوسع — 18 دولاراً",
  };
}

export function seedSeatMaps(): Record<string, SeatMapConfig> {
  return {
    a320neo: defaultSeatMap("a320neo", 28),
    a321neo: { ...defaultSeatMap("a321neo", 33), unavailable: ["33B", "33E"] },
    b737800: { ...defaultSeatMap("b737800", 27), extraLegroomRows: [1, 11, 12] },
  };
}

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
  aircraft: AircraftType[];
  seatMaps: Record<string, SeatMapConfig>;
  destinations: DestinationConfig[];
};

export function seedOpsState(): OpsState {
  return {
    aircraft: seedAircraft(),
    seatMaps: seedSeatMaps(),
    destinations: seedDestinationConfigs(),
  };
}

/** Mock operational history for a dated flight — visible timeline only. */
export type HistoryEntry = { id: string; time: string; label: string; detail?: string };
