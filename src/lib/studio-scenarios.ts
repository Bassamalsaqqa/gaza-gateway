/**
 * Gaza Gateway — Deterministic Appearance Studio Scenarios & Fixtures
 *
 * Provides isolated, realistic mock scenarios across:
 * - Home (Destinations, Hero)
 * - Booking (Results, Fare, Passengers, Seats, Extras, Review)
 * - Travel (Preparing, Documents, Baggage, At Airport, Accessibility)
 * - Airport (Overview, Past, Present, Future Vision)
 *
 * Guarantees zero persistent state leakage and safe simulation.
 */

import {
  searchFlights,
  type Flight,
} from "@/lib/data";
import type { Draft, Passenger, SearchCriteria } from "@/lib/store";
import type { TargetId } from "@/design/surfaces/targets";

export type StudioPageId = "home" | "book" | "travel" | "airport";

export interface StudioScenario {
  id: string;
  pageId: StudioPageId;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  pathEn: string;
  pathAr: string;
  associatedTargetIds: TargetId[];
  step?: string;
  getMockDraft?: () => Draft;
}

// Deterministic future dates for reliable mock scenarios
const MOCK_DEPART_DATE = "2026-10-15";
const MOCK_RETURN_DATE = "2026-10-22";

export function createDeterministicMockDraft(step: "results" | "fare" | "passengers" | "seats" | "extras" | "review"): Draft {
  const criteria: SearchCriteria = {
    origin: "GZA",
    destination: "AMM",
    departDate: MOCK_DEPART_DATE,
    returnDate: MOCK_RETURN_DATE,
    tripType: "round",
    adults: 1,
    children: 0,
    infants: 0,
    cabin: "economy",
  };

  const outboundFlights = searchFlights("GZA", "AMM", MOCK_DEPART_DATE);
  const inboundFlights = searchFlights("AMM", "GZA", MOCK_RETURN_DATE);

  const outbound: Flight = outboundFlights[0] ?? {
    id: "GZA-AMM-20261015-PS204",
    number: "PS 204",
    originCode: "GZA",
    destinationCode: "AMM",
    date: MOCK_DEPART_DATE,
    departTime: "08:30",
    arriveTime: "09:45",
    durationMinutes: 75,
    aircraft: "Boeing 737-800",
    status: "Scheduled",
    gate: "A2",
    terminal: "1",
    basePrice: 165,
    seatsLeft: 8,
  };

  const inbound: Flight = inboundFlights[0] ?? {
    id: "AMM-GZA-20261022-PS205",
    number: "PS 205",
    originCode: "AMM",
    destinationCode: "GZA",
    date: MOCK_RETURN_DATE,
    departTime: "14:15",
    arriveTime: "15:30",
    durationMinutes: 75,
    aircraft: "Boeing 737-800",
    status: "Scheduled",
    gate: "B1",
    terminal: "1",
    basePrice: 175,
    seatsLeft: 12,
  };

  const mockPassenger: Passenger = {
    type: "adult",
    firstName: "Yousef",
    lastName: "Al-Kurd",
    dob: "1988-04-12",
    nationality: "PS",
    document: "P01489201",
  };

  const emptyPax: Passenger = {
    type: "adult",
    firstName: "",
    lastName: "",
    dob: "",
    nationality: "PS",
    document: "",
  };

  switch (step) {
    case "results":
      return {
        entry: "results",
        criteria,
        outbound: null,
        inbound: null,
        fareId: "classic",
        passengers: [emptyPax],
        seats: {},
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "", phone: "" },
      };

    case "fare":
      return {
        entry: "results",
        criteria,
        outbound,
        inbound,
        fareId: "classic",
        passengers: [emptyPax],
        seats: {},
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "", phone: "" },
      };

    case "passengers":
      return {
        entry: "results",
        criteria,
        outbound,
        inbound,
        fareId: "classic",
        passengers: [mockPassenger],
        seats: {},
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "yousef.kurd@example.ps", phone: "+970 59 912 3456" },
      };

    case "seats":
      return {
        entry: "results",
        criteria,
        outbound,
        inbound,
        fareId: "classic",
        passengers: [mockPassenger],
        seats: {
          "out-0": "12A",
          "in-0": "12F",
        },
        extras: { pax: [{ extraBags: 0, meal: "standard", assistance: [] }] },
        contact: { email: "yousef.kurd@example.ps", phone: "+970 59 912 3456" },
      };

    case "extras":
      return {
        entry: "results",
        criteria,
        outbound,
        inbound,
        fareId: "classic",
        passengers: [mockPassenger],
        seats: {
          "out-0": "12A",
          "in-0": "12F",
        },
        extras: { pax: [{ extraBags: 1, meal: "standard", assistance: [] }] },
        contact: { email: "yousef.kurd@example.ps", phone: "+970 59 912 3456" },
      };

    case "review":
    default:
      return {
        entry: "results",
        criteria,
        outbound,
        inbound,
        fareId: "classic",
        passengers: [mockPassenger],
        seats: {
          "out-0": "12A",
          "in-0": "12F",
        },
        extras: { pax: [{ extraBags: 1, meal: "standard", assistance: [] }] },
        contact: { email: "yousef.kurd@example.ps", phone: "+970 59 912 3456" },
      };
  }
}

export const STUDIO_SCENARIOS: readonly StudioScenario[] = [
  // ───────────────────────────────────────────────────────────────────────────
  // Home
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "home.default",
    pageId: "home",
    titleEn: "Homepage & Destinations",
    titleAr: "الصفحة الرئيسية والوجهات",
    descriptionEn: "Hero pattern, quick booking widget, and destination showcase cards.",
    descriptionAr: "الواجهة الرئيسية ومحرك البحث السريع وبطاقات استعراض الوجهات.",
    pathEn: "/?studioPreview=1",
    pathAr: "/ar?studioPreview=1",
    associatedTargetIds: ["canvas.public", "home.destination-card"],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Booking Flow Scenarios
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "booking.results",
    pageId: "book",
    titleEn: "1. Flight Search & Results",
    titleAr: "1. نتائج والبحث عن الرحلات",
    descriptionEn: "Flight cards, route datums, departure times, and operational cards.",
    descriptionAr: "بطاقات الرحلات، مسار الطيران، مواعيد المغادرة، والبطاقات التشغيلية.",
    pathEn: "/book?step=results&studioPreview=1",
    pathAr: "/ar/book?step=results&studioPreview=1",
    step: "results",
    associatedTargetIds: ["booking.flight-option", "family.operational"],
    getMockDraft: () => createDeterministicMockDraft("results"),
  },
  {
    id: "booking.fare",
    pageId: "book",
    titleEn: "2. Fare Tier Selection",
    titleAr: "2. اختيار فئة السعر",
    descriptionEn: "Indexed fare tier cards (Essential, Classic, Flex) and trip summary.",
    descriptionAr: "فئات الأسعار المفهرسة (الأساسية، الكلاسيكية، المرنة) وملخص الرحلة.",
    pathEn: "/book?step=fare&studioPreview=1",
    pathAr: "/ar/book?step=fare&studioPreview=1",
    step: "fare",
    associatedTargetIds: ["booking.fare-option", "booking.trip-summary", "family.fare"],
    getMockDraft: () => createDeterministicMockDraft("fare"),
  },
  {
    id: "booking.passengers",
    pageId: "book",
    titleEn: "3. Passenger Details",
    titleAr: "3. استمارة بيانات المسافرين",
    descriptionEn: "Passenger form sheet containers with zero pattern distraction behind inputs.",
    descriptionAr: "استمارات بيانات المسافرين الواضحة الخالية من أي نقوش خلف الحقول.",
    pathEn: "/book?step=passengers&studioPreview=1",
    pathAr: "/ar/book?step=passengers&studioPreview=1",
    step: "passengers",
    associatedTargetIds: ["booking.passenger-sheet", "booking.trip-summary", "family.form-sheet"],
    getMockDraft: () => createDeterministicMockDraft("passengers"),
  },
  {
    id: "booking.seats",
    pageId: "book",
    titleEn: "4. Seat Map Console",
    titleAr: "4. خريطة ومنصة المقاعد",
    descriptionEn: "Interactive cabin seating layout, passenger switcher, and seating legend.",
    descriptionAr: "مخطط توزيع مقاعد المقصورة، التبديل بين المسافرين، ومفتاح الرموز.",
    pathEn: "/book?step=seats&studioPreview=1",
    pathAr: "/ar/book?step=seats&studioPreview=1",
    step: "seats",
    associatedTargetIds: ["booking.seat-console", "booking.trip-summary", "family.operational"],
    getMockDraft: () => createDeterministicMockDraft("seats"),
  },
  {
    id: "booking.extras",
    pageId: "book",
    titleEn: "5. Baggage & Ancillary",
    titleAr: "5. الأمتعة والخدمات الإضافية",
    descriptionEn: "Cabin baggage, checked bags, meal selection, and passenger assistance.",
    descriptionAr: "حقائب المقصورة، الأمتعة الإضافية، وجبات الطعام، والمساعدة الخاصة.",
    pathEn: "/book?step=extras&studioPreview=1",
    pathAr: "/ar/book?step=extras&studioPreview=1",
    step: "extras",
    associatedTargetIds: ["booking.extras", "booking.trip-summary"],
    getMockDraft: () => createDeterministicMockDraft("extras"),
  },
  {
    id: "booking.review",
    pageId: "book",
    titleEn: "6. Review Dossier",
    titleAr: "6. ملف مراجعة الحجز",
    descriptionEn: "Complete booking review dossier, manifest ledger, and price breakdown.",
    descriptionAr: "ملف مراجعة الحجز المتكامل، قائمة المسافرين، وتفاصيل الحساب المالي.",
    pathEn: "/book?step=review&studioPreview=1",
    pathAr: "/ar/book?step=review&studioPreview=1",
    step: "review",
    associatedTargetIds: ["booking.review-dossier", "booking.trip-summary", "family.dossier"],
    getMockDraft: () => createDeterministicMockDraft("review"),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Travel Guide Scenarios
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "travel.preparing",
    pageId: "travel",
    titleEn: "Travel: Preparing to Travel",
    titleAr: "السفر: الاستعداد للسفر",
    descriptionEn: "Passenger wayfinding plates, timeline guidelines, and limestone card rails.",
    descriptionAr: "إرشادات الاستعداد للسفر والمواعيد الزمنية على بطاقات الحجر الرملي.",
    pathEn: "/travel?section=prepare&studioPreview=1#prepare",
    pathAr: "/ar/travel?section=prepare&studioPreview=1#prepare",
    associatedTargetIds: ["travel.guide", "family.guide", "canvas.sand"],
  },
  {
    id: "travel.documents",
    pageId: "travel",
    titleEn: "Travel: Documents & Visas",
    titleAr: "السفر: الوثائق والتأشيرات",
    descriptionEn: "Passports, entry requirements, passenger responsibilities, and document checklists.",
    descriptionAr: "جوازات السفر، متطلبات الدخول، مسؤوليات المسافرين، وقوائم فحص الوثائق.",
    pathEn: "/travel?section=documents&studioPreview=1#documents",
    pathAr: "/ar/travel?section=documents&studioPreview=1#documents",
    associatedTargetIds: ["travel.guide", "family.guide"],
  },
  {
    id: "travel.baggage",
    pageId: "travel",
    titleEn: "Travel: Baggage Policy",
    titleAr: "السفر: سياسة الأمتعة",
    descriptionEn: "Cabin and checked baggage allowance guidelines and dimension specifications.",
    descriptionAr: "إرشادات أوزان وأبعاد الأمتعة اليدوية والمشحونة المسموح بها.",
    pathEn: "/travel?section=baggage&studioPreview=1#baggage",
    pathAr: "/ar/travel?section=baggage&studioPreview=1#baggage",
    associatedTargetIds: ["travel.guide"],
  },
  {
    id: "travel.airport",
    pageId: "travel",
    titleEn: "Travel: At the Airport",
    titleAr: "السفر: في المطار",
    descriptionEn: "Terminal passenger journey, check-in counters, security control, and boarding gates.",
    descriptionAr: "رحلة المسافر في المبنى، منصات تسجيل الوصول، التفتيش الأمني، وبوابات الصعود.",
    pathEn: "/travel?section=airport&studioPreview=1#airport",
    pathAr: "/ar/travel?section=airport&studioPreview=1#airport",
    associatedTargetIds: ["travel.guide", "family.guide"],
  },
  {
    id: "travel.accessibility",
    pageId: "travel",
    titleEn: "Travel: Accessibility & Assistance",
    titleAr: "السفر: سهولة الوصول والمساعدة",
    descriptionEn: "Special passenger assistance guides and accessible terminal services.",
    descriptionAr: "إرشادات الرعاية الخاصة والخدمات الميسرة للمسافرين في مبنى المطار.",
    pathEn: "/travel?section=accessibility&studioPreview=1#accessibility",
    pathAr: "/ar/travel?section=accessibility&studioPreview=1#accessibility",
    associatedTargetIds: ["travel.guide"],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Airport Editorial Scenarios
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "airport.overview",
    pageId: "airport",
    titleEn: "Airport: Overview & Heritage",
    titleAr: "المطار: نبذة وتاريخ",
    descriptionEn: "Historical opening timeline, operational chapters, and documentary dossier.",
    descriptionAr: "التسلسل الزمني لافتتاح المطار وفصول مسيرته التاريخية التوثيقية.",
    pathEn: "/airport?studioPreview=1",
    pathAr: "/ar/airport?studioPreview=1",
    associatedTargetIds: ["airport.chapter-card", "family.editorial", "canvas.sand"],
  },
  {
    id: "airport.past",
    pageId: "airport",
    titleEn: "Airport: Past & Archive",
    titleAr: "المطار: التاريخ والأرشيف",
    descriptionEn: "Construction, 1998 opening ceremony, operational period, and memory records.",
    descriptionAr: "مراحل الإنشاء، مراسم الافتتاح 1998، سنوات التشغيل، وتوثيق الذاكرة.",
    pathEn: "/airport/past?studioPreview=1",
    pathAr: "/ar/airport/past?studioPreview=1",
    associatedTargetIds: ["airport.chapter-card", "family.editorial"],
  },
  {
    id: "airport.present",
    pageId: "airport",
    titleEn: "Airport: Present Condition",
    titleAr: "المطار: الوضع الراهن والتوثيق",
    descriptionEn: "Factual site report, verified geographic coordinates, and physical conditions.",
    descriptionAr: "تقرير ميداني واقعي، الإحداثيات الجغرافية، والتوثيق المادي للموقع.",
    pathEn: "/airport/present?studioPreview=1",
    pathAr: "/ar/airport/present?studioPreview=1",
    associatedTargetIds: ["airport.chapter-card", "family.editorial"],
  },
  {
    id: "airport.future",
    pageId: "airport",
    titleEn: "Airport: Future Vision Studies",
    titleAr: "المطار: دراسات الرؤية المستقبلية",
    descriptionEn: "Architectural visual concept studies with mandatory illustrative truth labeling.",
    descriptionAr: "دراسات المفاهيم المعمارية المستقبلية الموسومة بإفصاح توضيحي إلزامي.",
    pathEn: "/airport/future?studioPreview=1",
    pathAr: "/ar/airport/future?studioPreview=1",
    associatedTargetIds: ["airport.future-editorial", "family.editorial"],
  },
];

export function getScenarioById(id: string): StudioScenario | undefined {
  return STUDIO_SCENARIOS.find((s) => s.id === id);
}

export function getScenariosForPage(pageId: StudioPageId): StudioScenario[] {
  return STUDIO_SCENARIOS.filter((s) => s.pageId === pageId);
}

export function findScenarioForPath(path: string): StudioScenario | undefined {
  const clean = path.replace(/^\/ar/, "").replace(/\?.*$/, "");
  if (clean === "/book") {
    if (path.includes("step=fare")) return getScenarioById("booking.fare");
    if (path.includes("step=passengers")) return getScenarioById("booking.passengers");
    if (path.includes("step=seats")) return getScenarioById("booking.seats");
    if (path.includes("step=extras")) return getScenarioById("booking.extras");
    if (path.includes("step=review")) return getScenarioById("booking.review");
    return getScenarioById("booking.results");
  }
  if (clean === "/travel") {
    if (path.includes("documents")) return getScenarioById("travel.documents");
    if (path.includes("baggage")) return getScenarioById("travel.baggage");
    if (path.includes("airport")) return getScenarioById("travel.airport");
    if (path.includes("accessibility")) return getScenarioById("travel.accessibility");
    return getScenarioById("travel.preparing");
  }
  if (clean === "/airport/past") return getScenarioById("airport.past");
  if (clean === "/airport/present") return getScenarioById("airport.present");
  if (clean === "/airport/future") return getScenarioById("airport.future");
  if (clean === "/airport") return getScenarioById("airport.overview");
  return getScenarioById("home.default");
}
