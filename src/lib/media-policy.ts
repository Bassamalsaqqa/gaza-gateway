/**
 * Gaza Gateway — Lightweight Media Policy & Canonical Truth Classification
 *
 * Provides an authoritative media catalog policy and sanitization engine with ZERO
 * heavy asset/image imports. Keeps the public root startup bundle small and isolated
 * while preventing forged truth classes, unapproved media IDs, and mismatched assignments
 * across appearance exports, preview storage, and runtime targets.
 *
 * Invariant: Future concept AI visualizations MUST NOT be assigned to historical
 * Past/Present chapter cards (e.g. airport.chapter-card).
 */

export type TruthClass = "future-concept-ai" | "brand-mark" | "placeholder";

/**
 * Authoritative mapping of approved stable media IDs to their canonical TruthClass.
 * Derived from the official media registry metadata without importing image assets.
 */
export const APPROVED_MEDIA_CATALOG = {
  "home-hero": "future-concept-ai",
  "aerial-day": "future-concept-ai",
  "aerial-night": "future-concept-ai",
  "landside-day": "future-concept-ai",
  "landside-night": "future-concept-ai",
  "runway-day": "future-concept-ai",
  "runway-night": "future-concept-ai",
  "concourse-day": "future-concept-ai",
  "concourse-night": "future-concept-ai",
  "interior-wide-a": "future-concept-ai",
  "interior-wide-b": "future-concept-ai",
  "passenger-assistance": "future-concept-ai",
  logo: "brand-mark",
  "brand-mark": "brand-mark",
} as const satisfies Record<string, TruthClass>;

export type ApprovedMediaId = keyof typeof APPROVED_MEDIA_CATALOG;

export const APPROVED_MEDIA_IDS = Object.keys(APPROVED_MEDIA_CATALOG) as readonly string[];

/**
 * Permitted TruthClasses by target ID.
 * Targets not listed here do NOT allow media.
 */
export const TARGET_ALLOWED_TRUTH_CLASSES: Readonly<Record<string, readonly TruthClass[]>> = {
  "family.guide": ["future-concept-ai", "brand-mark", "placeholder"],
  "family.editorial": ["future-concept-ai", "brand-mark", "placeholder"],
  "travel.guide": ["future-concept-ai", "brand-mark", "placeholder"],
  // Strict truth policy: Never allow AI-generated illustrative imagery on historical past/present chapters
  "airport.chapter-card": ["brand-mark", "placeholder"],
  "airport.future-editorial": ["future-concept-ai", "brand-mark", "placeholder"],
};

/**
 * Permitted TruthClasses by surface family ID.
 */
export const FAMILY_ALLOWED_TRUTH_CLASSES: Readonly<Record<string, readonly TruthClass[]>> = {
  guide: ["future-concept-ai", "brand-mark", "placeholder"],
  editorial: ["future-concept-ai", "brand-mark", "placeholder"],
};

export function isApprovedMediaId(mediaId: string): mediaId is ApprovedMediaId {
  return Object.prototype.hasOwnProperty.call(APPROVED_MEDIA_CATALOG, mediaId);
}

export function getCanonicalTruthClass(mediaId: string): TruthClass | undefined {
  return (APPROVED_MEDIA_CATALOG as Record<string, TruthClass>)[mediaId];
}

export interface SanitizedMediaTreatmentOptions {
  targetId?: string | undefined;
  familyId?: string | undefined;
}

export interface MediaTreatmentShape {
  mediaId?: string | undefined;
  treatment?: ("none" | "top" | "side" | "cover" | "watermark") | undefined;
  focalX?: number | undefined;
  focalY?: number | undefined;
  overlay?: ("none" | "subtle" | "dark" | "gradient") | undefined;
  aspect?: ("auto" | "16:9" | "4:3" | "3:2" | "1:1") | undefined;
  truthClass?: TruthClass | undefined;
}

/**
 * Authoritatively validates and sanitizes a media treatment object.
 *
 * Rules:
 * 1. If context restricts media and target/family does not permit media, returns undefined.
 * 2. If mediaId is not in the approved catalog, strips mediaId and truthClass.
 * 3. Overrides any user-supplied or stored truthClass with the authoritative canonical
 *    truth class from APPROVED_MEDIA_CATALOG.
 * 4. If the canonical truth class is not permitted for the target/family (e.g. future AI
 *    on a historical chapter card), rejects the media (mediaId and truthClass stripped).
 */
export function sanitizeMediaTreatmentAuthoritative(
  raw: unknown,
  options?: SanitizedMediaTreatmentOptions,
): MediaTreatmentShape | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Partial<MediaTreatmentShape>;

  // Check if media is allowed for the target or family context
  let allowedTruth: readonly TruthClass[] | undefined = undefined;
  if (options?.targetId) {
    allowedTruth = TARGET_ALLOWED_TRUTH_CLASSES[options.targetId];
    if (!allowedTruth) return undefined; // Media disallowed for this target
  } else if (options?.familyId) {
    allowedTruth = FAMILY_ALLOWED_TRUTH_CLASSES[options.familyId];
    if (!allowedTruth) return undefined; // Media disallowed for this family
  }

  const rawMediaId =
    typeof obj.mediaId === "string" && obj.mediaId.trim().length > 0
      ? obj.mediaId.trim()
      : undefined;

  let safeMediaId: string | undefined = undefined;
  let canonicalTruth: TruthClass | undefined = undefined;

  if (rawMediaId && isApprovedMediaId(rawMediaId)) {
    const truth = APPROVED_MEDIA_CATALOG[rawMediaId];
    if (truth && (!allowedTruth || allowedTruth.includes(truth))) {
      safeMediaId = rawMediaId;
      canonicalTruth = truth;
    }
  }

  const treatments = ["none", "top", "side", "cover", "watermark"] as const;
  const treatment =
    typeof obj.treatment === "string" && (treatments as readonly string[]).includes(obj.treatment)
      ? obj.treatment
      : safeMediaId
        ? "cover"
        : "none";

  const focalX =
    typeof obj.focalX === "number" && !isNaN(obj.focalX)
      ? Math.max(0, Math.min(100, Math.round(obj.focalX)))
      : 50;

  const focalY =
    typeof obj.focalY === "number" && !isNaN(obj.focalY)
      ? Math.max(0, Math.min(100, Math.round(obj.focalY)))
      : 50;

  const overlays = ["none", "subtle", "dark", "gradient"] as const;
  const overlay =
    typeof obj.overlay === "string" && (overlays as readonly string[]).includes(obj.overlay)
      ? obj.overlay
      : "none";

  const aspects = ["auto", "16:9", "4:3", "3:2", "1:1"] as const;
  const aspect =
    typeof obj.aspect === "string" && (aspects as readonly string[]).includes(obj.aspect)
      ? obj.aspect
      : "auto";

  // If there's no safe media ID and user explicitly requested treatment: "none"
  if (!safeMediaId && obj.treatment === "none") {
    return {
      treatment: "none",
      focalX,
      focalY,
      overlay: "none",
      aspect: "auto",
    };
  }

  if (!safeMediaId) {
    return undefined;
  }

  return {
    mediaId: safeMediaId,
    treatment,
    focalX,
    focalY,
    overlay,
    aspect,
    truthClass: canonicalTruth,
  };
}
