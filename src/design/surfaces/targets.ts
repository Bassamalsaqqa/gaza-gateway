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
import { MEDIA } from "@/lib/media";
import type { PatternId, IntensityLevel, ScaleLevel } from "@/design/patterns/pattern-types";
import { canonicalPatternId } from "@/design/patterns/pattern-types";

export type CanvasTargetId = "canvas.public" | "canvas.sand" | "canvas.admin";

export type FamilyTargetId =
  | "family.operational"
  | "family.fare"
  | "family.dossier"
  | "family.form-sheet"
  | "family.guide"
  | "family.editorial";

export type ComponentTargetId =
  | "booking.flight-option"
  | "booking.fare-option"
  | "booking.trip-summary"
  | "booking.passenger-sheet"
  | "booking.seat-console"
  | "booking.extras"
  | "booking.review-dossier"
  | "travel.guide"
  | "airport.chapter-card"
  | "airport.future-editorial"
  | "home.destination-card";

export type TargetId = CanvasTargetId | FamilyTargetId | ComponentTargetId;

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

export const CANVAS_TARGET_IDS: readonly CanvasTargetId[] = [
  "canvas.public",
  "canvas.sand",
  "canvas.admin",
] as const;

export const FAMILY_TARGET_IDS: readonly FamilyTargetId[] = [
  "family.operational",
  "family.fare",
  "family.dossier",
  "family.form-sheet",
  "family.guide",
  "family.editorial",
] as const;

export const COMPONENT_TARGET_IDS: readonly ComponentTargetId[] = [
  "booking.flight-option",
  "booking.fare-option",
  "booking.trip-summary",
  "booking.passenger-sheet",
  "booking.seat-console",
  "booking.extras",
  "booking.review-dossier",
  "travel.guide",
  "airport.chapter-card",
  "airport.future-editorial",
  "home.destination-card",
] as const;

export const ALL_TARGET_IDS: readonly TargetId[] = [
  ...CANVAS_TARGET_IDS,
  ...FAMILY_TARGET_IDS,
  ...COMPONENT_TARGET_IDS,
] as const;

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
  "canvas.admin": {
    id: "canvas.admin",
    kind: "canvas",
    nameEn: "Admin Workspace Canvas",
    nameAr: "خلفية مساحة العمل الإدارية",
    descriptionEn: "Background pattern for staff administration workspace and telemetry panels.",
    descriptionAr: "النقش الخلفي لمساحة العمل الإدارية ولوحات العمليات للطاقم.",
    route: "/admin/settings?tab=appearance",
    scenarioId: "admin.appearance",
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

export function isTargetId(val: unknown): val is TargetId {
  return typeof val === "string" && (ALL_TARGET_IDS as readonly string[]).includes(val);
}

export function getTargetMeta(id: TargetId): TargetMeta {
  return TARGET_REGISTRY[id] ?? TARGET_REGISTRY["booking.flight-option"];
}

export function getTargetFamily(id: TargetId): SurfaceFamilyId | undefined {
  return TARGET_REGISTRY[id]?.familyId;
}

/**
 * Resolves effective SurfaceRecipe for a semantic target ID, taking into account:
 * 1. Authored default recipe for target's family
 * 2. Family recipe override from SurfaceGrammarConfig
 * 3. Component target override from SurfaceGrammarConfig.targetOverrides
 */
export function resolveTargetRecipe(
  targetId: TargetId,
  config: SurfaceGrammarConfig,
): SurfaceRecipe {
  const meta = getTargetMeta(targetId);
  const family = meta.familyId ?? "operational";
  const familyDefault = DEFAULT_SURFACE_RECIPES[family];
  const familyRecipe = config.families[family] ?? familyDefault;
  const targetOverride = config.targetOverrides?.[targetId];

  if (!targetOverride) {
    return familyRecipe;
  }

  return {
    ...familyRecipe,
    ...targetOverride,
    family,
  };
}

/**
 * Validates and sanitizes a partial SurfaceRecipe for a specific TargetId,
 * enforcing the family allowlists and media truth classification policies.
 */
export function sanitizeTargetOverride(
  targetId: TargetId,
  raw: unknown,
): Partial<SurfaceRecipe> {
  if (!raw || typeof raw !== "object") return {};
  const meta = getTargetMeta(targetId);
  const family = meta.familyId;
  if (!family) return {};

  const allowlist = FAMILY_ALLOWLISTS[family];
  const obj = raw as Partial<SurfaceRecipe>;
  const clean: Partial<SurfaceRecipe> = {};

  if (obj.frame && (allowlist.frames as readonly string[]).includes(obj.frame)) {
    clean.frame = obj.frame as SurfaceFrame;
  }
  if (obj.tone && (allowlist.tones as readonly string[]).includes(obj.tone)) {
    clean.tone = obj.tone as SurfaceTone;
  }
  if (obj.accent && (allowlist.accents as readonly string[]).includes(obj.accent)) {
    clean.accent = obj.accent as SurfaceAccent;
  }
  if (obj.radius && (allowlist.radii as readonly string[]).includes(obj.radius)) {
    clean.radius = obj.radius as SurfaceRadius;
  }
  if (obj.elevation && (allowlist.elevations as readonly string[]).includes(obj.elevation)) {
    clean.elevation = obj.elevation as SurfaceElevation;
  }
  if (typeof obj.pattern === "string") {
    clean.pattern = canonicalPatternId(obj.pattern);
  }
  if (
    obj.patternPlacement &&
    (allowlist.patternPlacements as readonly string[]).includes(obj.patternPlacement)
  ) {
    clean.patternPlacement = obj.patternPlacement as PatternPlacement;
  }
  if (
    obj.patternIntensity &&
    ["off", "very-subtle", "subtle", "present"].includes(obj.patternIntensity)
  ) {
    clean.patternIntensity = obj.patternIntensity as IntensityLevel;
  }
  if (
    obj.patternScale &&
    ["small", "standard", "large"].includes(obj.patternScale)
  ) {
    clean.patternScale = obj.patternScale as ScaleLevel;
  }

  // Media treatment sanitization
  if (meta.mediaAllowed && allowlist.mediaAllowed && obj.mediaTreatment) {
    const rawMt = obj.mediaTreatment;
    const mediaId = typeof rawMt.mediaId === "string" ? rawMt.mediaId : undefined;
    const mediaItem = mediaId ? MEDIA[mediaId] : undefined;

    // Truth policy check: only permit media whose truthClass is allowed for this target
    let safeMediaId: string | undefined = undefined;
    if (mediaItem && meta.allowedTruthClasses?.includes(mediaItem.truthClass)) {
      safeMediaId = mediaItem.id;
    }

    const treatments = ["none", "top", "side", "cover", "watermark"] as const;
    const treatment =
      typeof rawMt.treatment === "string" && (treatments as readonly string[]).includes(rawMt.treatment)
        ? rawMt.treatment
        : undefined;

    const focalX =
      typeof rawMt.focalX === "number" && !isNaN(rawMt.focalX)
        ? Math.max(0, Math.min(100, Math.round(rawMt.focalX)))
        : 50;

    const focalY =
      typeof rawMt.focalY === "number" && !isNaN(rawMt.focalY)
        ? Math.max(0, Math.min(100, Math.round(rawMt.focalY)))
        : 50;

    const overlays = ["none", "subtle", "dark", "gradient"] as const;
    const overlay =
      typeof rawMt.overlay === "string" && (overlays as readonly string[]).includes(rawMt.overlay)
        ? rawMt.overlay
        : "none";

    const aspects = ["auto", "16:9", "4:3", "3:2", "1:1"] as const;
    const aspect =
      typeof rawMt.aspect === "string" && (aspects as readonly string[]).includes(rawMt.aspect)
        ? rawMt.aspect
        : "auto";

    clean.mediaTreatment = {
      mediaId: safeMediaId,
      treatment,
      focalX,
      focalY,
      overlay,
      aspect,
      truthClass: mediaItem ? mediaItem.truthClass : undefined,
    };
  }

  return clean;
}
