/**
 * Gaza Gateway — Semantic Appearance-Target Registry
 *
 * Provides a typed semantic appearance-target registry for global canvases,
 * six families, and meaningful component recipes.
 *
 * Drives inspector navigation, breadcrumbs, route/scenario availability,
 * allowed controls, media-truth enforcement, and reset behavior.
 */

import {
  SURFACE_FAMILY_IDS,
  type PatternPlacement,
  type SurfaceAccent,
  type SurfaceElevation,
  type SurfaceFamilyId,
  type SurfaceFrame,
  type SurfaceRadius,
  type SurfaceRecipe,
  type SurfaceTone,
  type SurfaceGrammarConfig,
  type MediaTreatment,
} from "./types";
import { FAMILY_ALLOWLISTS } from "./allowlists";
import { DEFAULT_SURFACE_RECIPES } from "./presets";
import type { PatternId, IntensityLevel, ScaleLevel } from "@/design/patterns/pattern-types";
import { canonicalPatternId } from "@/design/patterns/pattern-types";

export * from "./runtime-targets";
import {
  type CanvasTargetId,
  type ComponentTargetId,
  type FamilyTargetId,
  type TargetId,
  ALL_TARGET_IDS,
  CANVAS_TARGET_IDS,
  COMPONENT_TARGET_IDS,
  FAMILY_TARGET_IDS,
  TARGET_FAMILY_MAP,
  getTargetFamily,
  isTargetId,
  resolveTargetRecipe,
} from "./runtime-targets";

export interface AllowedControls {
  frame: boolean;
  tone: boolean;
  accent: boolean;
  radius: boolean;
  elevation: boolean;
  pattern: boolean;
  placement: boolean;
  intensity: boolean;
  scale: boolean;
  media: boolean;
}

export interface TargetMeta {
  id: TargetId;
  kind: "canvas" | "family" | "component";
  familyId?: SurfaceFamilyId;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  route: string;
  scenarioId: string;
  mediaAllowed: boolean;
  /** Restricts media types according to truth policies */
  allowedTruthClasses?: ("future-concept-ai" | "brand-mark" | "placeholder")[];
  allowedControls: AllowedControls;
}

const CANVAS_CONTROLS: AllowedControls = {
  frame: false,
  tone: false,
  accent: false,
  radius: false,
  elevation: false,
  pattern: true,
  placement: false,
  intensity: true,
  scale: true,
  media: false,
};

const FAMILY_CONTROLS_BASE: AllowedControls = {
  frame: true,
  tone: true,
  accent: true,
  radius: true,
  elevation: true,
  pattern: true,
  placement: true,
  intensity: true,
  scale: true,
  media: false,
};

export const TARGET_REGISTRY: Record<TargetId, TargetMeta> = {
  "canvas.public": {
    id: "canvas.public",
    kind: "canvas",
    nameEn: "Public Site Canvas",
    nameAr: "خلفية الموقع العام",
    descriptionEn: "Global page background and hero pattern across public visitor routes.",
    descriptionAr: "خلفية الصفحة العامة ونقوش الواجهة الرئيسية لزوار الموقع.",
    route: "/",
    scenarioId: "home.default",
    mediaAllowed: false,
    allowedControls: CANVAS_CONTROLS,
  },
  "canvas.sand": {
    id: "canvas.sand",
    kind: "canvas",
    nameEn: "Sand Section Canvas",
    nameAr: "خلفية المقاطع الرملية",
    descriptionEn: "Limestone sand background for guides, airport details, and travel chapters.",
    descriptionAr: "خلفية الحجر الرملي لأدلة السفر ومعلومات المطار والفصول التاريخية.",
    route: "/travel",
    scenarioId: "travel.preparing",
    mediaAllowed: false,
    allowedControls: CANVAS_CONTROLS,
  },

  "family.operational": {
    id: "family.operational",
    kind: "family",
    familyId: "operational",
    nameEn: "Operational Family",
    nameAr: "فئة العمليات والرحلات",
    descriptionEn: "Flight cards, seat assignment maps, telemetry feeds, and airfield controls.",
    descriptionAr: "بطاقات الرحلات، خرائط المقاعد، ومؤشرات العمليات الجوية.",
    route: "/book?step=results",
    scenarioId: "booking.results",
    mediaAllowed: false,
    allowedControls: FAMILY_CONTROLS_BASE,
  },
  "family.fare": {
    id: "family.fare",
    kind: "family",
    familyId: "fare",
    nameEn: "Fare Selection Family",
    nameAr: "فئة خيارات الأسعار",
    descriptionEn: "Coherent indexed fare tier options (01 Essential, 02 Classic, 03 Flex).",
    descriptionAr: "خيارات فئات الأسعار المفهرسة (01 الأساسية، 02 الكلاسيكية، 03 المرنة).",
    route: "/book?step=fare",
    scenarioId: "booking.fare",
    mediaAllowed: false,
    allowedControls: FAMILY_CONTROLS_BASE,
  },
  "family.dossier": {
    id: "family.dossier",
    kind: "family",
    familyId: "dossier",
    nameEn: "Dossier & Summary Family",
    nameAr: "فئة الملخصات والملفات",
    descriptionEn: "Trip manifest, price calculation ledger, and final booking review dossier.",
    descriptionAr: "ملف الرحلة، جدول تفاصيل الأسعار، وملف مراجعة الحجز النهائي.",
    route: "/book?step=review",
    scenarioId: "booking.review",
    mediaAllowed: false,
    allowedControls: FAMILY_CONTROLS_BASE,
  },
  "family.form-sheet": {
    id: "family.form-sheet",
    kind: "family",
    familyId: "form-sheet",
    nameEn: "Form Sheet Family",
    nameAr: "فئة استمارات البيانات",
    descriptionEn: "Passenger details, checkout inputs, and document sheets with zero pattern behind inputs.",
    descriptionAr: "بيانات المسافرين، حقول الإدخال، واستمارات الوثائق دون نقوش خلف الحقول.",
    route: "/book?step=passengers",
    scenarioId: "booking.passengers",
    mediaAllowed: false,
    allowedControls: {
      ...FAMILY_CONTROLS_BASE,
      pattern: false,
      placement: false,
    },
  },
  "family.guide": {
    id: "family.guide",
    kind: "family",
    familyId: "guide",
    nameEn: "Guide Plate Family",
    nameAr: "فئة أدلة المسافرين",
    descriptionEn: "Wayfinding plates, baggage guidelines, and passenger terminal advisories.",
    descriptionAr: "لوحات الإرشاد، إرشادات الأمتعة، وتوجيهات المسافرين في المبنى.",
    route: "/travel",
    scenarioId: "travel.preparing",
    mediaAllowed: true,
    allowedTruthClasses: ["future-concept-ai", "brand-mark", "placeholder"],
    allowedControls: {
      ...FAMILY_CONTROLS_BASE,
      media: true,
    },
  },
  "family.editorial": {
    id: "family.editorial",
    kind: "family",
    familyId: "editorial",
    nameEn: "Editorial Chapter Family",
    nameAr: "فئة الفصول التحريرية",
    descriptionEn: "Airport heritage chapters and future vision architectural concept studies.",
    descriptionAr: "فصول تاريخ المطار ودراسات المفاهيم المعمارية المستقبلية.",
    route: "/airport/future",
    scenarioId: "airport.future",
    mediaAllowed: true,
    allowedTruthClasses: ["future-concept-ai", "brand-mark", "placeholder"],
    allowedControls: {
      ...FAMILY_CONTROLS_BASE,
      media: true,
    },
  },

  "booking.flight-option": {
    id: "booking.flight-option",
    kind: "component",
    familyId: "operational",
    nameEn: "Flight Option Card",
    nameAr: "بطاقة خيار الرحلة",
    descriptionEn: "Interactive flight selection card with schedule, route datum, and fare pricing.",
    descriptionAr: "بطاقة اختيار الرحلة التفاعلية مع جدول المواعيد وخط السير والسعر.",
    route: "/book?step=results",
    scenarioId: "booking.results",
    mediaAllowed: false,
    allowedControls: FAMILY_CONTROLS_BASE,
  },
  "booking.fare-option": {
    id: "booking.fare-option",
    kind: "component",
    familyId: "fare",
    nameEn: "Fare Tier Card",
    nameAr: "بطاقة فئة السعر",
    descriptionEn: "Indexed fare option (Essential, Classic, Flex) with baggage rules and amenities.",
    descriptionAr: "فئة السعر المفهرسة مع شروط الأمتعة والمزايا المشمولة.",
    route: "/book?step=fare",
    scenarioId: "booking.fare",
    mediaAllowed: false,
    allowedControls: FAMILY_CONTROLS_BASE,
  },
  "booking.trip-summary": {
    id: "booking.trip-summary",
    kind: "component",
    familyId: "dossier",
    nameEn: "Trip Summary Ledger",
    nameAr: "جدول ملخص الرحلة",
    descriptionEn: "Sidebar ticket ledger summarizing selected itinerary, passengers, and price total.",
    descriptionAr: "جدول التذكرة الجانبي لملخص خط السير والمسافرين وإجمالي السعر.",
    route: "/book?step=fare",
    scenarioId: "booking.fare",
    mediaAllowed: false,
    allowedControls: FAMILY_CONTROLS_BASE,
  },
  "booking.passenger-sheet": {
    id: "booking.passenger-sheet",
    kind: "component",
    familyId: "form-sheet",
    nameEn: "Passenger Form Sheet",
    nameAr: "استمارة بيانات المسافر",
    descriptionEn: "Calm container for traveler name, date of birth, passport, and contact fields.",
    descriptionAr: "استمارة واضحة ومريحة لأسماء المسافرين وتواريخ الميلاد والوثائق وبيانات التواصل.",
    route: "/book?step=passengers",
    scenarioId: "booking.passengers",
    mediaAllowed: false,
    allowedControls: {
      ...FAMILY_CONTROLS_BASE,
      pattern: false,
      placement: false,
    },
  },
  "booking.seat-console": {
    id: "booking.seat-console",
    kind: "component",
    familyId: "operational",
    nameEn: "Seat Selection Console",
    nameAr: "منصة اختيار المقاعد",
    descriptionEn: "Airfield cabin layout console, passenger switcher, and seating legend.",
    descriptionAr: "منصة توزيع مقاعد الطائرة ومفاتيح التبديل بين المسافرين ودليل المقاعد.",
    route: "/book?step=seats",
    scenarioId: "booking.seats",
    mediaAllowed: false,
    allowedControls: FAMILY_CONTROLS_BASE,
  },
  "booking.extras": {
    id: "booking.extras",
    kind: "component",
    familyId: "operational",
    nameEn: "Baggage & Ancillary Options",
    nameAr: "خيارات الأمتعة والخدمات الإضافية",
    descriptionEn: "Cabin baggage, checked bags, inflight meal selection, and passenger assistance cards.",
    descriptionAr: "بطاقات حقائب المقصورة، الأمتعة المشحونة، الوجبات، وخدمات المساعدة الخاصة.",
    route: "/book?step=extras",
    scenarioId: "booking.extras",
    mediaAllowed: false,
    allowedControls: FAMILY_CONTROLS_BASE,
  },
  "booking.review-dossier": {
    id: "booking.review-dossier",
    kind: "component",
    familyId: "dossier",
    nameEn: "Booking Review Dossier",
    nameAr: "ملف مراجعة وتأكيد الحجز",
    descriptionEn: "Full passenger manifest, itinerary datum, and financial settlement breakdown.",
    descriptionAr: "ملف الحجز المتكامل المتضمن قائمة المسافرين ومخطط الرحلة وتفاصيل الدفع.",
    route: "/book?step=review",
    scenarioId: "booking.review",
    mediaAllowed: false,
    allowedControls: FAMILY_CONTROLS_BASE,
  },
  "travel.guide": {
    id: "travel.guide",
    kind: "component",
    familyId: "guide",
    nameEn: "Travel Guide Plate",
    nameAr: "لوحة دليل السفر",
    descriptionEn: "Informational travel card detailing documents, baggage policies, and airport security.",
    descriptionAr: "بطاقة إرشادية توضح الوثائق المطلوبة وسياسات الأمتعة وإجراءات المطار.",
    route: "/travel",
    scenarioId: "travel.preparing",
    mediaAllowed: true,
    allowedTruthClasses: ["future-concept-ai", "brand-mark", "placeholder"],
    allowedControls: {
      ...FAMILY_CONTROLS_BASE,
      media: true,
    },
  },
  "airport.chapter-card": {
    id: "airport.chapter-card",
    kind: "component",
    familyId: "editorial",
    nameEn: "Airport Heritage Chapter",
    nameAr: "فصل تاريخ وتراث المطار",
    descriptionEn: "Documentary chapter chronicling the historical opening and operational legacy of GZA.",
    descriptionAr: "فصل توثيقي يروي تاريخ افتتاح المطار ومسيرته التشغيلية.",
    route: "/airport",
    scenarioId: "airport.overview",
    mediaAllowed: true,
    // Strict truth policy: Never allow AI-generated illustrative imagery on historical past/present chapters
    allowedTruthClasses: ["brand-mark", "placeholder"],
    allowedControls: {
      ...FAMILY_CONTROLS_BASE,
      media: true,
    },
  },
  "airport.future-editorial": {
    id: "airport.future-editorial",
    kind: "component",
    familyId: "editorial",
    nameEn: "Future Vision Concept Study",
    nameAr: "دراسة الرؤية والمفاهيم المستقبلية",
    descriptionEn: "Architectural visual concept study with mandatory illustrative disclosure labeling.",
    descriptionAr: "دراسة تصورية معمارية مستقبلية مع وسم الإفصاح التوضيحي الإلزامي.",
    route: "/airport/future",
    scenarioId: "airport.future",
    mediaAllowed: true,
    // Permitted to use illustrative AI future concepts with mandatory disclosure
    allowedTruthClasses: ["future-concept-ai", "brand-mark", "placeholder"],
    allowedControls: {
      ...FAMILY_CONTROLS_BASE,
      media: true,
    },
  },
  "home.destination-card": {
    id: "home.destination-card",
    kind: "component",
    familyId: "guide",
    nameEn: "Destination Showcase Card",
    nameAr: "بطاقة استعراض الوجهات",
    descriptionEn: "Homepage card highlighting connected cities (Amman, Cairo, Istanbul, etc.).",
    descriptionAr: "بطاقة استعراض الوجهات المتصلة برحلات الخطوط الجوية الفلسطينية.",
    route: "/",
    scenarioId: "home.default",
    mediaAllowed: false,
    allowedControls: FAMILY_CONTROLS_BASE,
  },
};

export function getTargetMeta(id: TargetId): TargetMeta {
  return TARGET_REGISTRY[id] ?? TARGET_REGISTRY["booking.flight-option"];
}
