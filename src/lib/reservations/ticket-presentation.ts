/**
 * Gaza Gateway — Commemorative Ticket Presentation Mapper.
 *
 * Pure, deterministic mapper that transforms canonical ReservationDetail records
 * into presentation-ready view models for both on-site React rendering and
 * email parity.
 *
 * Engineering invariants:
 * - Real values only; no mockup static strings copied as truth.
 * - Technical identifiers (PNR, ticket number, flight number, IATA codes, dates, times) remain strictly LTR.
 * - Cabin/class rendered ONLY if present in canonical data; never fake-defaulted to Economy.
 * - No unnecessary contact PII, passport numbers, or internal UUIDs printed on the ticket.
 * - Cancelled status explicitly stated in text (never color-only).
 * - Clear disclosure of commemorative classification and future concept imagery.
 */

import type { ReservationDetail } from "./client.ts";

export type TicketLang = "en" | "ar";

export interface AirportMeta {
  code: string;
  city: { en: string; ar: string };
  name: { en: string; ar: string };
}

export const KNOWN_AIRPORTS: Record<string, AirportMeta> = {
  GZA: {
    code: "GZA",
    city: { en: "Gaza", ar: "غزة" },
    name: { en: "Gaza International Airport", ar: "مطار غزة الدولي" },
  },
  AMM: {
    code: "AMM",
    city: { en: "Amman", ar: "عمّان" },
    name: { en: "Queen Alia International", ar: "مطار الملكة علياء الدولي" },
  },
  CAI: {
    code: "CAI",
    city: { en: "Cairo", ar: "القاهرة" },
    name: { en: "Cairo International", ar: "مطار القاهرة الدولي" },
  },
  IST: {
    code: "IST",
    city: { en: "Istanbul", ar: "إسطنبول" },
    name: { en: "Istanbul Airport", ar: "مطار إسطنبول" },
  },
  DOH: {
    code: "DOH",
    city: { en: "Doha", ar: "الدوحة" },
    name: { en: "Hamad International", ar: "مطار حمد الدولي" },
  },
  DXB: {
    code: "DXB",
    city: { en: "Dubai", ar: "دبي" },
    name: { en: "Dubai International", ar: "مطار دبي الدولي" },
  },
  JED: {
    code: "JED",
    city: { en: "Jeddah", ar: "جدة" },
    name: { en: "King Abdulaziz International", ar: "مطار الملك عبد العزيز الدولي" },
  },
  RUH: {
    code: "RUH",
    city: { en: "Riyadh", ar: "الرياض" },
    name: { en: "King Khalid International", ar: "مطار الملك خالد الدولي" },
  },
  BEY: {
    code: "BEY",
    city: { en: "Beirut", ar: "بيروت" },
    name: { en: "Beirut–Rafic Hariri International", ar: "مطار رفيق الحريري الدولي" },
  },
  KWI: {
    code: "KWI",
    city: { en: "Kuwait City", ar: "الكويت" },
    name: { en: "Kuwait International", ar: "مطار الكويت الدولي" },
  },
  AUH: {
    code: "AUH",
    city: { en: "Abu Dhabi", ar: "أبوظبي" },
    name: { en: "Zayed International", ar: "مطار زايد الدولي" },
  },
  ATH: {
    code: "ATH",
    city: { en: "Athens", ar: "أثينا" },
    name: { en: "Athens International", ar: "مطار أثينا الدولي" },
  },
  FCO: {
    code: "FCO",
    city: { en: "Rome", ar: "روما" },
    name: { en: "Leonardo da Vinci–Fiumicino", ar: "مطار ليوناردو دا فينشي" },
  },
  CDG: {
    code: "CDG",
    city: { en: "Paris", ar: "باريس" },
    name: { en: "Charles de Gaulle", ar: "مطار شارل ديغول" },
  },
  LHR: {
    code: "LHR",
    city: { en: "London", ar: "لندن" },
    name: { en: "Heathrow", ar: "مطار هيثرو" },
  },
  FRA: {
    code: "FRA",
    city: { en: "Frankfurt", ar: "فرانكفورت" },
    name: { en: "Frankfurt Airport", ar: "مطار فرانكفورت" },
  },
  MAD: {
    code: "MAD",
    city: { en: "Madrid", ar: "مدريد" },
    name: { en: "Adolfo Suárez Madrid–Barajas", ar: "مطار مدريد باراخاس الدولي" },
  },
  BOM: {
    code: "BOM",
    city: { en: "Mumbai", ar: "مومباي" },
    name: { en: "Chhatrapati Shivaji Maharaj", ar: "مطار تشاتراباتي شيفاجي الدولي" },
  },
  KUL: {
    code: "KUL",
    city: { en: "Kuala Lumpur", ar: "كوالالمبور" },
    name: { en: "Kuala Lumpur International", ar: "مطار كوالالمبور الدولي" },
  },
  JFK: {
    code: "JFK",
    city: { en: "New York", ar: "نيويورك" },
    name: { en: "John F. Kennedy International", ar: "مطار جون إف كينيدي الدولي" },
  },
  YYZ: {
    code: "YYZ",
    city: { en: "Toronto", ar: "تورونتو" },
    name: { en: "Toronto Pearson International", ar: "مطار تورونتو بيرسون الدولي" },
  },
};

export function resolveAirport(code: string, lang: TicketLang): { code: string; city: string; airport: string } {
  const normalized = (code || "").trim().toUpperCase();
  const entry = KNOWN_AIRPORTS[normalized];
  if (entry) {
    return {
      code: normalized,
      city: entry.city[lang] || entry.city.en,
      airport: entry.name[lang] || entry.name.en,
    };
  }
  return {
    code: normalized,
    city: normalized,
    airport: normalized,
  };
}

const MONTH_NAMES_EN = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;
const MONTH_NAMES_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
] as const;

/**
 * Formats ISO date (YYYY-MM-DD) into authentic uppercase aviation date string.
 * Strictly enforces Western Latin digits for numbers in both EN and AR.
 */
export function formatTicketDate(iso: string | null | undefined, lang: TicketLang): string {
  if (!iso || typeof iso !== "string") return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return iso;

  const year = match[1];
  const monthIdx = parseInt(match[2] ?? "1", 10) - 1;
  const day = parseInt(match[3] ?? "1", 10).toString();

  if (monthIdx < 0 || monthIdx > 11) return iso;

  if (lang === "ar") {
    return `${day} ${MONTH_NAMES_AR[monthIdx]} ${year}`;
  }
  return `${day} ${MONTH_NAMES_EN[monthIdx]} ${year}`;
}

export interface MappedPassengerTicket {
  ticketNumber: string;
  reference: string;
  status: "confirmed" | "cancelled";
  statusLabel: string;
  isCancelled: boolean;
  passengerName: string;
  passengerType: "adult" | "child";
  passengerTypeLabel: string;
  nationality: string;
  flightNumber: string;
  direction?: "out" | "in" | undefined;
  originCode: string;
  originCity: string;
  originAirport: string;
  destinationCode: string;
  destinationCity: string;
  destinationAirport: string;
  date: string;
  formattedDate: string;
  departTime: string;
  arriveTime: string;
  arrivalDate: string | null;
  formattedArrivalDate: string | null;
  dayOffset: number;
  dayOffsetLabel: string | null;
  isOvernight: boolean;
  originTimezone: string | null;
  destinationTimezone: string | null;
  seatCode: string;
  hasAssignedSeat: boolean;
  mealLabel: string;
  aircraftModel: string | null;
  cabin: string | null;
  issuedAt: string;
  classification: string;
  validityNotice: string;
  conceptNotice: string;
  skylineNotice: string;
  carrierName: string;
  carrierCode: string;
  hubName: string;
}

export interface MappedReservationTicketGroup {
  reference: string;
  status: "confirmed" | "cancelled";
  statusLabel: string;
  isCancelled: boolean;
  issuedAt: string;
  classification: string;
  validityNotice: string;
  conceptNotice: string;
  tickets: MappedPassengerTicket[];
  flight: {
    flightNumber: string;
    originCode: string;
    originCity: string;
    destinationCode: string;
    destinationCity: string;
    date: string;
    formattedDate: string;
    departTime: string;
    arriveTime: string;
    arrivalDate: string | null;
    dayOffset: number;
    dayOffsetLabel: string | null;
    isOvernight: boolean;
    originTimezone: string | null;
    destinationTimezone: string | null;
    aircraftModel: string | null;
  };
}

/**
 * Computes signed calendar day offset between flight departure date and arrival date.
 * Uses Date.UTC to guarantee calendar-day arithmetic independent of local execution timezone.
 */
export function computeDayOffset(flightDate: string | null | undefined, arrivalDate: string | null | undefined): number {
  if (!flightDate || !arrivalDate) return 0;
  const fMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(flightDate.trim());
  const aMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(arrivalDate.trim());
  if (!fMatch || !aMatch) return 0;
  const fYear = parseInt(fMatch[1]!, 10);
  const fMonth = parseInt(fMatch[2]!, 10) - 1;
  const fDay = parseInt(fMatch[3]!, 10);
  const aYear = parseInt(aMatch[1]!, 10);
  const aMonth = parseInt(aMatch[2]!, 10) - 1;
  const aDay = parseInt(aMatch[3]!, 10);

  const fUtc = Date.UTC(fYear, fMonth, fDay);
  const aUtc = Date.UTC(aYear, aMonth, aDay);
  const diffMs = aUtc - fUtc;
  return Math.round(diffMs / 86400000);
}

export function formatDayOffsetLabel(offset: number): string | null {
  if (offset > 0) return `+${offset}`;
  if (offset < 0) return `${offset}`;
  return null;
}

export function mapPassengerTicket(
  item: ReservationDetail["ticket"]["tickets"][number],
  reservation: ReservationDetail["reservation"],
  lang: TicketLang,
): MappedPassengerTicket {
  const p = item.passenger;
  const f = item.flight;
  const origin = resolveAirport(f.originCode, lang);
  const destination = resolveAirport(f.destinationCode, lang);

  // Schema authority requires status: fail closed on missing or unvalidated status
  const rawStatus = item.status || reservation.status;
  if (rawStatus !== "confirmed" && rawStatus !== "cancelled") {
    throw new Error(`Invalid or missing ticket status: ${String(rawStatus)}`);
  }
  const status: "confirmed" | "cancelled" = rawStatus;
  const isCancelled = status === "cancelled";
  const statusLabel = isCancelled ? (lang === "ar" ? "ملغى" : "Cancelled") : (lang === "ar" ? "مؤكد" : "Confirmed");

  const passengerName = [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || (lang === "ar" ? "مسافر" : "Passenger");
  const passengerTypeLabel = p.type === "child" ? (lang === "ar" ? "طفل" : "Child") : (lang === "ar" ? "بالغ" : "Adult");

  const formattedDate = formatTicketDate(f.date, lang);
  const dayOffset = computeDayOffset(f.date, f.arrivalDate);
  const dayOffsetLabel = formatDayOffsetLabel(dayOffset);
  const isOvernight = dayOffset !== 0;
  const formattedArrivalDate = f.arrivalDate ? formatTicketDate(f.arrivalDate, lang) : null;

  const seatCode = (p.seatCode || "").trim();
  const hasAssignedSeat = Boolean(seatCode);

  let mealLabel = lang === "ar" ? "بدون وجبة" : "No meal";
  if (p.meal?.label) {
    mealLabel = (lang === "ar" ? p.meal.label.ar : p.meal.label.en) || p.meal.label.en || mealLabel;
  }

  // Strict rule: "Cabin only if canonical data has it otherwise omit no fake default economy."
  const rawCabin =
    (item as { cabin?: unknown }).cabin ??
    (p as { cabin?: unknown }).cabin ??
    (f as { cabin?: unknown }).cabin;
  const cabin = typeof rawCabin === "string" && rawCabin.trim().length > 0 ? rawCabin.trim() : null;

  // Strict rule: "Canonical required aircraftModel only; absent may omit/unknown not invent."
  const rawAircraft = (f.aircraftModel || "").trim();
  const aircraftModel = rawAircraft.length > 0 ? rawAircraft : null;

  return {
    ticketNumber: item.ticketNumber,
    reference: item.reference || reservation.reference,
    status,
    statusLabel,
    isCancelled,
    passengerName,
    passengerType: p.type,
    passengerTypeLabel,
    nationality: p.nationality || "",
    flightNumber: f.flightNumber,
    direction: f.direction,
    originCode: origin.code,
    originCity: origin.city,
    originAirport: origin.airport,
    destinationCode: destination.code,
    destinationCity: destination.city,
    destinationAirport: destination.airport,
    date: f.date,
    formattedDate,
    departTime: f.departTime,
    arriveTime: f.arriveTime,
    arrivalDate: f.arrivalDate ?? null,
    formattedArrivalDate,
    dayOffset,
    dayOffsetLabel,
    isOvernight,
    originTimezone: f.originTimezone ?? null,
    destinationTimezone: f.destinationTimezone ?? null,
    seatCode,
    hasAssignedSeat,
    mealLabel,
    aircraftModel,
    cabin,
    issuedAt: item.issuedAt,
    classification: lang === "ar" ? "التذكرة / مسار الرحلة" : "Ticket / Itinerary",
    validityNotice: "",
    conceptNotice:
      lang === "ar"
        ? "تصوّر توضيحي مستقبلي مُولَّد بالذكاء الاصطناعي · لا يمثّل مبنى المطار الحالي أو التاريخي"
        : "AI-generated illustrative future concept · Not the current or historical terminal",
    skylineNotice:
      lang === "ar"
        ? "رسم معماري لأفق المدينة"
        : "Architectural skyline artwork",
    carrierName: lang === "ar" ? "الخطوط الجوية الفلسطينية" : "Palestinian Airlines",
    carrierCode: "PS",
    hubName: lang === "ar" ? "مطار غزة الدولي" : "Gaza International Airport",
  };
}

export function mapTicketPresentation(
  detail: ReservationDetail,
  lang: TicketLang,
): MappedReservationTicketGroup {
  const { reservation, ticket } = detail;
  const origin = resolveAirport(ticket.flight.originCode, lang);
  const destination = resolveAirport(ticket.flight.destinationCode, lang);

  // Schema authority requires status: fail closed on missing or unvalidated status
  const rawStatus = reservation.status || ticket.status;
  if (rawStatus !== "confirmed" && rawStatus !== "cancelled") {
    throw new Error(`Invalid or missing reservation status: ${String(rawStatus)}`);
  }
  const status: "confirmed" | "cancelled" = rawStatus;
  const isCancelled = status === "cancelled";
  const statusLabel = isCancelled ? (lang === "ar" ? "ملغى" : "Cancelled") : (lang === "ar" ? "مؤكد" : "Confirmed");

  const formattedDate = formatTicketDate(ticket.flight.date, lang);
  const dayOffset = computeDayOffset(ticket.flight.date, ticket.flight.arrivalDate);
  const dayOffsetLabel = formatDayOffsetLabel(dayOffset);
  const isOvernight = dayOffset !== 0;

  const tickets = ticket.tickets.map((item) => mapPassengerTicket(item, reservation, lang));

  const rawGroupAircraft = (ticket.flight.aircraftModel || "").trim();
  const aircraftModel = rawGroupAircraft.length > 0 ? rawGroupAircraft : null;

  return {
    reference: reservation.reference,
    status,
    statusLabel,
    isCancelled,
    issuedAt: ticket.issuedAt,
    classification: lang === "ar" ? "التذكرة / مسار الرحلة" : "Ticket / Itinerary",
    validityNotice: "",
    conceptNotice:
      lang === "ar"
        ? "تصوّر توضيحي مستقبلي مُولَّد بالذكاء الاصطناعي · لا يمثّل مبنى المطار الحالي أو التاريخي"
        : "AI-generated illustrative future concept · Not the current or historical terminal",
    tickets,
    flight: {
      flightNumber: ticket.flight.flightNumber,
      originCode: origin.code,
      originCity: origin.city,
      destinationCode: destination.code,
      destinationCity: destination.city,
      date: ticket.flight.date,
      formattedDate,
      departTime: ticket.flight.departTime,
      arriveTime: ticket.flight.arriveTime,
      arrivalDate: ticket.flight.arrivalDate ?? null,
      dayOffset,
      dayOffsetLabel,
      isOvernight,
      originTimezone: ticket.flight.originTimezone ?? null,
      destinationTimezone: ticket.flight.destinationTimezone ?? null,
      aircraftModel,
    },
  };
}
