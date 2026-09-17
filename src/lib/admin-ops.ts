/**
 * Operations & commercial configuration model for the staff workspace.
 * Frontend mock only: seeded from the public product data, held in local state.
 */
import {
  SEAT_LETTERS,
  SEAT_ROWS,
  EXTRA_LEGROOM_ROWS,
  cabinZones,
  destinations,
  fares,
  mealOptions,
  assistanceOptions,
  EXTRA_BAG_PRICE,
  type CabinId,
} from "./data";

/* --------------------------------- schedules ------------------------------- */

export type ExceptionKind = "cancelled" | "time" | "aircraft" | "extra";

export type ScheduleException = {
  id: string;
  date: string;
  kind: ExceptionKind;
  detail: string;
};

export type Schedule = {
  id: string;
  number: string;
  /** out = GZA → destination, in = destination → GZA */
  direction: "out" | "in";
  destination: string;
  days: number[];
  departTime: string;
  arriveTime: string;
  aircraft: string;
  from: string;
  until: string;
  active: boolean;
  exceptions: ScheduleException[];
};

export const AIRCRAFT_NAMES = ["Airbus A320neo", "Airbus A321neo", "Boeing 737-800"] as const;

const outSlots = ["07:15", "08:40", "10:05", "13:20", "16:45", "19:10", "21:35"];
const inSlots = ["11:30", "12:55", "14:20", "17:35", "20:00", "22:25", "06:50"];

function addMinutes(time: string, minutes: number): string {
  const [hh, mm] = time.split(":");
  const total = Number(hh ?? 0) * 60 + Number(mm ?? 0) + minutes;
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${`${Math.floor(wrapped / 60)}`.padStart(2, "0")}:${`${wrapped % 60}`.padStart(2, "0")}`;
}

export function seedSchedules(): Schedule[] {
  const list: Schedule[] = [];
  destinations.forEach((dest, i) => {
    const aircraft = AIRCRAFT_NAMES[i % AIRCRAFT_NAMES.length] as string;
    const out = outSlots[i % outSlots.length] as string;
    const back = inSlots[i % inSlots.length] as string;
    list.push({
      id: `sch-${dest.code}-out`,
      number: `PS${100 + i * 2}`,
      direction: "out",
      destination: dest.code,
      days: [...dest.days],
      departTime: out,
      arriveTime: addMinutes(out, dest.flightMinutes),
      aircraft,
      from: "2026-01-11",
      until: "2026-12-19",
      active: true,
      exceptions: [],
    });
    list.push({
      id: `sch-${dest.code}-in`,
      number: `PS${101 + i * 2}`,
      direction: "in",
      destination: dest.code,
      days: [...dest.days],
      departTime: back,
      arriveTime: addMinutes(back, dest.flightMinutes),
      aircraft,
      from: "2026-01-11",
      until: "2026-12-19",
      active: dest.code !== "RUH",
      exceptions: [],
    });
  });
  const first = list[0];
  if (first) {
    first.exceptions = [
      { id: "exc-1", date: "2026-10-03", kind: "cancelled", detail: "Runway maintenance window" },
      { id: "exc-2", date: "2026-10-17", kind: "time", detail: "Departs 09:10 instead of 07:15" },
    ];
  }
  const second = list[2];
  if (second) {
    second.exceptions = [
      { id: "exc-3", date: "2026-11-05", kind: "aircraft", detail: "Operated by Airbus A321neo" },
    ];
  }
  return list;
}

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

/* ----------------------------------- fares --------------------------------- */

export type FareConfig = {
  id: string;
  nameEn: string;
  nameAr: string;
  cabins: CabinId[];
  checkedBags: number;
  seatEn: string;
  seatAr: string;
  changesEn: string;
  changesAr: string;
  refundEn: string;
  refundAr: string;
  featured: boolean;
  order: number;
};

export function seedFares(): FareConfig[] {
  return fares.map((f, i) => ({
    id: f.id,
    nameEn: f.name.en,
    nameAr: f.name.ar,
    cabins: (f.id === "essential" ? ["economy"] : ["economy", "premium", "business"]) as CabinId[],
    checkedBags: f.checkedBags,
    seatEn: f.seatSelection.en,
    seatAr: f.seatSelection.ar,
    changesEn: f.changes.en,
    changesAr: f.changes.ar,
    refundEn: f.refund.en,
    refundAr: f.refund.ar,
    featured: Boolean(f.highlight),
    order: i + 1,
  }));
}

/* ---------------------------------- baggage -------------------------------- */

export type BaggageConfig = {
  cabinKg: number;
  cabinDims: string;
  checkedKg: number;
  extraBagPrice: number;
  noteEn: string;
  noteAr: string;
};

export function seedBaggage(): BaggageConfig {
  return {
    cabinKg: 7,
    cabinDims: "55 × 40 × 20 cm",
    checkedKg: 23,
    extraBagPrice: EXTRA_BAG_PRICE,
    noteEn: "Every fare includes one cabin bag. Checked allowance depends on the fare chosen.",
    noteAr: "تشمل كل أجرة حقيبة كابينة واحدة. يعتمد الوزن المسجّل على الأجرة المختارة.",
  };
}

/* -------------------------- meals / assistance options -------------------- */

export type OptionItem = { id: string; en: string; ar: string; enabled: boolean };

export function seedMeals(): OptionItem[] {
  return mealOptions.map((m) => ({ id: m.id, en: m.label.en, ar: m.label.ar, enabled: true }));
}

export function seedAssistance(): OptionItem[] {
  return assistanceOptions.map((a) => ({ id: a.id, en: a.label.en, ar: a.label.ar, enabled: true }));
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
  heroSeed: string;
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
    heroSeed: d.imageSeed,
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
  schedules: Schedule[];
  aircraft: AircraftType[];
  seatMaps: Record<string, SeatMapConfig>;
  fares: FareConfig[];
  baggage: BaggageConfig;
  meals: OptionItem[];
  assistance: OptionItem[];
  destinations: DestinationConfig[];
};

export function seedOpsState(): OpsState {
  return {
    schedules: seedSchedules(),
    aircraft: seedAircraft(),
    seatMaps: seedSeatMaps(),
    fares: seedFares(),
    baggage: seedBaggage(),
    meals: seedMeals(),
    assistance: seedAssistance(),
    destinations: seedDestinationConfigs(),
  };
}

/** Mock operational history for a dated flight — visible timeline only. */
export type HistoryEntry = { id: string; time: string; label: string; detail?: string };
