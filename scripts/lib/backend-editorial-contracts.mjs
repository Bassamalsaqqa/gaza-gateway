/**
 * Gaza Gateway — Editorial, Settings, CMS & Contact Contracts & Adapters
 *
 * Provides pure development helpers for:
 * 1. Site Settings wire translation & validation (contact and appearance drafts).
 * 2. CMS Revisions wire translation, path-to-slug key binding & source receipts.
 * 3. Authentic Contact enquiries/inbox translation, validation, and minimal public submission receipts.
 */

export const CANONICAL_PATTERN_IDS = Object.freeze([
  "none",
  "pie-factory",
  "architect",
  "graph-paper",
  "rails",
  "connections",
  "signal",
  "topography",
  "steel-beams",
  "overlapping-diamonds",
  "floor-tile",
  "circuit-board",
  "gza-lattice",
  "runway-datum",
]);

export const INTENSITY_LEVELS = Object.freeze(["off", "very-subtle", "subtle", "present"]);
export const SCALE_LEVELS = Object.freeze(["small", "standard", "large"]);

export const SURFACE_FAMILIES = Object.freeze([
  "operational",
  "fare",
  "dossier",
  "form-sheet",
  "guide",
  "editorial",
]);

export const COMPONENT_TARGET_IDS = Object.freeze([
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
]);

export const TARGET_FAMILY_MAP = Object.freeze({
  "booking.flight-option": "operational",
  "booking.fare-option": "fare",
  "booking.trip-summary": "dossier",
  "booking.passenger-sheet": "form-sheet",
  "booking.seat-console": "operational",
  "booking.extras": "operational",
  "booking.review-dossier": "dossier",
  "travel.guide": "guide",
  "airport.chapter-card": "editorial",
  "airport.future-editorial": "editorial",
  "home.destination-card": "operational",
});

export const FAMILY_ALLOWLISTS = Object.freeze({
  operational: Object.freeze({
    frames: ["plain", "rail", "indexed"],
    tones: ["paper", "limestone", "olive-soft"],
    accents: ["none", "brand", "clay"],
    radii: ["compact", "soft"],
    elevations: ["flat", "soft", "lift"],
    patternPlacements: ["none", "rail", "corner"],
    mediaAllowed: false,
  }),
  fare: Object.freeze({
    frames: ["plain", "rail", "indexed"],
    tones: ["paper", "limestone", "olive-soft"],
    accents: ["none", "brand", "clay", "brass"],
    radii: ["compact", "soft"],
    elevations: ["flat", "soft", "lift"],
    patternPlacements: ["none", "header", "corner"],
    mediaAllowed: false,
  }),
  dossier: Object.freeze({
    frames: ["plain", "rail", "indexed", "ticket"],
    tones: ["paper", "limestone", "olive-soft", "olive", "ink"],
    accents: ["none", "brand", "clay", "brass"],
    radii: ["compact", "soft", "editorial"],
    elevations: ["flat", "soft", "lift"],
    patternPlacements: ["none", "rail", "header", "watermark"],
    mediaAllowed: false,
  }),
  "form-sheet": Object.freeze({
    frames: ["plain", "rail", "indexed"],
    tones: ["paper", "limestone"],
    accents: ["none", "brand"],
    radii: ["compact", "soft"],
    elevations: ["flat", "soft"],
    patternPlacements: ["none", "rail"],
    mediaAllowed: false,
  }),
  guide: Object.freeze({
    frames: ["plain", "rail", "indexed", "chapter"],
    tones: ["paper", "limestone", "olive-soft"],
    accents: ["none", "brand", "clay", "brass"],
    radii: ["soft", "editorial"],
    elevations: ["flat", "soft", "lift"],
    patternPlacements: ["none", "rail", "header", "corner"],
    mediaAllowed: true,
  }),
  editorial: Object.freeze({
    frames: ["plain", "rail", "indexed", "chapter"],
    tones: ["paper", "limestone", "olive-soft", "olive", "ink"],
    accents: ["none", "brand", "clay", "brass"],
    radii: ["soft", "editorial"],
    elevations: ["flat", "soft", "lift"],
    patternPlacements: ["none", "rail", "header", "corner", "watermark"],
    mediaAllowed: true,
  }),
});

export const TARGET_MEDIA_ALLOWED = Object.freeze({
  "booking.flight-option": false,
  "booking.fare-option": false,
  "booking.trip-summary": false,
  "booking.passenger-sheet": false,
  "booking.seat-console": false,
  "booking.extras": false,
  "booking.review-dossier": false,
  "travel.guide": true,
  "airport.chapter-card": true,
  "airport.future-editorial": true,
  "home.destination-card": false,
});

export const TARGET_ALLOWED_TRUTH_CLASSES = Object.freeze({
  "travel.guide": ["future-concept-ai", "brand-mark", "placeholder"],
  "airport.chapter-card": ["historical-documentary", "brand-mark", "placeholder"],
  "airport.future-editorial": ["future-concept-ai", "brand-mark", "placeholder"],
});

export const FAMILY_ALLOWED_TRUTH_CLASSES = Object.freeze({
  guide: ["future-concept-ai", "brand-mark", "placeholder"],
  editorial: ["future-concept-ai", "brand-mark", "placeholder"],
});

export const APPROVED_MEDIA_CATALOG = Object.freeze({
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
  "airport-archive-hero-2000": "historical-documentary",
  "gallery-aircraft-archive-2000": "historical-documentary",
  "airport-present-ruins-2008": "historical-documentary",
  "destinations-hero": "illustrative-photo",
  "travel-info-hero": "illustrative-photo",
  "manage-booking-hero": "illustrative-photo",
  "check-in-hero": "illustrative-photo",
  "signin-photo": "illustrative-photo",
  "past-003": "historical-documentary",
  "past-005": "historical-documentary",
  "past-006": "historical-documentary",
  "past-007": "historical-documentary",
  "past-008": "historical-documentary",
  "past-009": "historical-documentary",
  "past-010": "historical-documentary",
  "past-011": "historical-documentary",
  "past-012": "historical-documentary",
  "past-014": "historical-documentary",
  "past-015": "historical-documentary",
  "past-016": "historical-documentary",
  "past-021": "historical-documentary",
  "past-022": "historical-documentary",
  "past-023": "historical-documentary",
  "past-024": "historical-documentary",
  "past-026": "historical-documentary",
  "past-028": "historical-documentary",
  "past-029": "historical-documentary",
  "past-030": "historical-documentary",
  "past-031": "historical-documentary",
  "past-032": "historical-documentary",
  "past-033": "historical-documentary",
  "past-038": "historical-documentary",
  "past-040": "historical-documentary",
  "past-042": "historical-documentary",
  "past-043": "historical-documentary",
  "past-044": "historical-documentary",
  "past-045": "historical-documentary",
  "past-046": "historical-documentary",
  "past-049": "historical-documentary",
  "past-050": "historical-documentary",
  "past-051": "historical-documentary",
  "past-053": "historical-documentary",
  "past-054": "historical-documentary",
  "past-056": "historical-documentary",
  "past-058": "historical-documentary",
});

export const CANONICAL_CONTENT_KEYS = Object.freeze([
  "home",
  "travel",
  "airport.past",
  "airport.present",
  "airport.future",
  "destinations.presentation",
  "destinations.editorial",
  "pages.information",
]);

export const CONTACT_TOPICS = Object.freeze([
  "booking",
  "baggage",
  "accessibility",
  "archive",
  "media",
  "other",
]);

export const CONTACT_STATUSES = Object.freeze(["new", "open", "resolved", "spam"]);
export const CONTACT_LANGUAGES = Object.freeze(["en", "ar"]);

const PHONE_REGEX = /^\+?[0-9\s\-()]{7,25}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Maps pattern alias identifiers to canonical ID.
 * "gza-geometric" is an authentic alias for canonical "pie-factory".
 *
 * @param {string} id
 * @returns {string}
 */
export function canonicalPatternId(id) {
  if (id === "gza-geometric") return "pie-factory";
  if (CANONICAL_PATTERN_IDS.includes(id)) return id;
  return "none";
}

/**
 * Converts source ContactSettings to wire ContactSettingsDto.
 *
 * @param {object} contact Source ContactSettings
 * @returns {object} ContactSettingsDto
 */
export function sourceContactSettingsToWire(contact) {
  if (!contact || typeof contact !== "object") {
    throw new Error("Invalid contact settings: must be a non-null object");
  }
  return {
    phone: String(contact.phone ?? ""),
    email: String(contact.email ?? ""),
    addressEn: String(contact.addressEn ?? ""),
    addressAr: String(contact.addressAr ?? ""),
    socialInstagram: String(contact.socialInstagram ?? ""),
    socialX: String(contact.socialX ?? ""),
    socialFacebook: String(contact.socialFacebook ?? ""),
    socialYouTube: String(contact.socialYouTube ?? ""),
  };
}

/**
 * Validates wire ContactSettingsDto or draft payload.
 *
 * Rules:
 * - phone: at least 7 digits, valid phone format
 * - email: valid email format
 * - addressEn: non-empty, at least 3 chars
 * - addressAr: non-empty, at least 3 chars
 * - social fields: empty string OR valid https URL
 * - No forbidden aliases (e.g. linkedIn, linkedin, nested addresses)
 *
 * @param {object} wire
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateContactSettingsWire(wire) {
  const errors = [];
  if (!wire || typeof wire !== "object" || Array.isArray(wire)) {
    return { valid: false, errors: ["Invalid contact payload: expected a non-null object"] };
  }

  if ("linkedIn" in wire || "linkedin" in wire) {
    errors.push("Forbidden alias: LinkedIn is not a supported contact social channel");
  }

  const phone = typeof wire.phone === "string" ? wire.phone.trim() : "";
  if (!phone || !PHONE_REGEX.test(phone)) {
    errors.push("phone: A valid phone number of at least 7 digits is required");
  }

  const email = typeof wire.email === "string" ? wire.email.trim() : "";
  if (!email || !EMAIL_REGEX.test(email)) {
    errors.push("email: A valid email address is required");
  }

  const addressEn = typeof wire.addressEn === "string" ? wire.addressEn.trim() : "";
  if (!addressEn || addressEn.length < 3) {
    errors.push("addressEn: English address must be at least 3 characters");
  }

  const addressAr = typeof wire.addressAr === "string" ? wire.addressAr.trim() : "";
  if (!addressAr || addressAr.length < 3) {
    errors.push("addressAr: Arabic address must be at least 3 characters");
  }

  const socialFields = ["socialInstagram", "socialX", "socialFacebook", "socialYouTube"];
  for (const field of socialFields) {
    const val = wire[field];
    if (val !== undefined && val !== null && val !== "") {
      if (typeof val !== "string") {
        errors.push(`${field}: URL must be a string`);
      } else {
        const trimmed = val.trim();
        try {
          const parsed = new URL(trimmed);
          if (parsed.protocol !== "https:") {
            errors.push(`${field}: Only secure HTTPS URLs are permitted`);
          } else if (!parsed.hostname || !parsed.hostname.includes(".")) {
            errors.push(`${field}: Invalid hostname in URL`);
          }
        } catch {
          errors.push(`${field}: Invalid URL format`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Converts wire ContactSettingsDto into source ContactSettings.
 *
 * @param {object} wire
 * @returns {object} Source ContactSettings
 */
export function wireContactSettingsToSource(wire) {
  const valRes = validateContactSettingsWire(wire);
  if (!valRes.valid) {
    throw new Error(`Contact settings validation failed: ${valRes.errors.join("; ")}`);
  }
  return {
    phone: String(wire.phone).trim(),
    email: String(wire.email).trim(),
    addressEn: String(wire.addressEn).trim(),
    addressAr: String(wire.addressAr).trim(),
    socialInstagram: typeof wire.socialInstagram === "string" ? wire.socialInstagram.trim() : "",
    socialX: typeof wire.socialX === "string" ? wire.socialX.trim() : "",
    socialFacebook: typeof wire.socialFacebook === "string" ? wire.socialFacebook.trim() : "",
    socialYouTube: typeof wire.socialYouTube === "string" ? wire.socialYouTube.trim() : "",
  };
}

/**
 * Helper to validate a MediaTreatment object against allowlists and approved media catalog.
 */
function validateMediaTreatmentObject(mt, path, family, targetId, errors) {
  const allowedKeys = new Set([
    "mediaId",
    "treatment",
    "focalX",
    "focalY",
    "overlay",
    "aspect",
    "truthClass",
  ]);
  for (const k of Object.keys(mt)) {
    if (!allowedKeys.has(k)) {
      errors.push(`${path}: unrecognized property '${k}'`);
    }
  }
  if (
    mt.treatment !== undefined &&
    !["none", "top", "side", "cover", "watermark"].includes(mt.treatment)
  ) {
    errors.push(`${path}.treatment: invalid treatment '${mt.treatment}'`);
  }
  if (mt.overlay !== undefined && !["none", "subtle", "dark", "gradient"].includes(mt.overlay)) {
    errors.push(`${path}.overlay: invalid overlay '${mt.overlay}'`);
  }
  if (mt.aspect !== undefined && !["auto", "16:9", "4:3", "3:2", "1:1"].includes(mt.aspect)) {
    errors.push(`${path}.aspect: invalid aspect '${mt.aspect}'`);
  }
  if (
    mt.focalX !== undefined &&
    (typeof mt.focalX !== "number" || mt.focalX < 0 || mt.focalX > 100)
  ) {
    errors.push(`${path}.focalX: must be a number between 0 and 100`);
  }
  if (
    mt.focalY !== undefined &&
    (typeof mt.focalY !== "number" || mt.focalY < 0 || mt.focalY > 100)
  ) {
    errors.push(`${path}.focalY: must be a number between 0 and 100`);
  }

  if (mt.mediaId !== undefined) {
    if (
      typeof mt.mediaId !== "string" ||
      !Object.prototype.hasOwnProperty.call(APPROVED_MEDIA_CATALOG, mt.mediaId)
    ) {
      errors.push(`${path}.mediaId: '${mt.mediaId}' is not in approved media catalog`);
      return;
    }
    const canonicalTruth = APPROVED_MEDIA_CATALOG[mt.mediaId];

    if (mt.truthClass !== undefined && mt.truthClass !== canonicalTruth) {
      errors.push(
        `${path}.truthClass: caller truthClass '${mt.truthClass}' does not match authoritative canonical truthClass '${canonicalTruth}' for mediaId '${mt.mediaId}'`,
      );
    }

    if (targetId) {
      const allowedTruth = TARGET_ALLOWED_TRUTH_CLASSES[targetId];
      if (!allowedTruth || !allowedTruth.includes(canonicalTruth)) {
        errors.push(
          `${path}: media truthClass '${canonicalTruth}' is not allowed for target '${targetId}'`,
        );
      }
    } else if (family) {
      const allowedTruth = FAMILY_ALLOWED_TRUTH_CLASSES[family];
      if (!allowedTruth || !allowedTruth.includes(canonicalTruth)) {
        errors.push(
          `${path}: media truthClass '${canonicalTruth}' is not allowed for family '${family}'`,
        );
      }
    }
  } else if (mt.truthClass !== undefined) {
    errors.push(
      `${path}: truthClass cannot be specified without a valid mediaId from approved catalog`,
    );
  }
}

/**
 * Converts source AppearanceSettings to wire AppearanceSettingsDto.
 * Invariant: Legacy 'cards' is quarantined and excluded from new command DTOs.
 *
 * @param {object} appearance Source AppearanceSettings
 * @returns {object} AppearanceSettingsDto
 */
export function sourceAppearanceSettingsToWire(appearance) {
  if (!appearance || typeof appearance !== "object") {
    throw new Error("Invalid appearance settings: must be a non-null object");
  }
  const wire = {
    publicCanvas: {
      pattern: appearance.publicCanvas?.pattern ?? "pie-factory",
      intensity: appearance.publicCanvas?.intensity ?? "present",
      scale: appearance.publicCanvas?.scale ?? "standard",
    },
    sandSection: {
      pattern: appearance.sandSection?.pattern ?? "pie-factory",
      intensity: appearance.sandSection?.intensity ?? "present",
      scale: appearance.sandSection?.scale ?? "standard",
    },
    adminCanvas: {
      pattern: appearance.adminCanvas?.pattern ?? "pie-factory",
      intensity: appearance.adminCanvas?.intensity ?? "present",
      scale: appearance.adminCanvas?.scale ?? "standard",
    },
  };
  if (appearance.surfaceGrammar !== undefined) {
    wire.surfaceGrammar = appearance.surfaceGrammar;
  }
  return wire;
}

/**
 * Validates wire AppearanceSettingsDto.
 *
 * Enforces:
 * 1. Legacy cards quarantine (rejected if present).
 * 2. Strict top-level keys.
 * 3. Canvases patterns, intensities, and scales.
 * 4. Authentic 6-family surface grammar and per-family allowlists.
 * 5. Registered target overrides, forbidding arbitrary CSS/JS properties.
 * 6. Authoritative media policy (approved IDs, canonical truth classes, target restrictions).
 *
 * @param {object} wire
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAppearanceSettingsWire(wire) {
  const errors = [];
  if (!wire || typeof wire !== "object" || Array.isArray(wire)) {
    return { valid: false, errors: ["Invalid appearance payload: expected a non-null object"] };
  }

  // Quarantine legacy cards
  if ("cards" in wire || wire.cards !== undefined) {
    errors.push(
      "cards: Legacy cards configuration is quarantined and cannot be submitted as an editable production setting",
    );
  }

  // Check top-level allowed keys
  const allowedTopKeys = new Set(["publicCanvas", "sandSection", "adminCanvas", "surfaceGrammar"]);
  for (const k of Object.keys(wire)) {
    if (k !== "cards" && !allowedTopKeys.has(k)) {
      errors.push(`unrecognized property '${k}' not allowed in appearance payload`);
    }
  }

  const sections = ["publicCanvas", "sandSection", "adminCanvas"];
  for (const sec of sections) {
    const canvas = wire[sec];
    if (!canvas || typeof canvas !== "object" || Array.isArray(canvas)) {
      errors.push(`${sec}: missing or invalid canvas configuration object`);
      continue;
    }
    const pat = canvas.pattern;
    if (pat !== "gza-geometric" && !CANONICAL_PATTERN_IDS.includes(pat)) {
      errors.push(`${sec}.pattern: invalid pattern '${pat}'`);
    }
    if (!INTENSITY_LEVELS.includes(canvas.intensity)) {
      errors.push(`${sec}.intensity: invalid intensity '${canvas.intensity}'`);
    }
    if (!SCALE_LEVELS.includes(canvas.scale)) {
      errors.push(`${sec}.scale: invalid scale '${canvas.scale}'`);
    }
  }

  // Validate surfaceGrammar if provided
  if (wire.surfaceGrammar !== undefined) {
    const sg = wire.surfaceGrammar;
    if (!sg || typeof sg !== "object" || Array.isArray(sg)) {
      errors.push("surfaceGrammar: expected a non-null object");
    } else {
      for (const k of Object.keys(sg)) {
        if (k !== "enabled" && k !== "families" && k !== "targetOverrides") {
          errors.push(`surfaceGrammar: unrecognized property '${k}'`);
        }
      }
      if (typeof sg.enabled !== "boolean") {
        errors.push("surfaceGrammar.enabled: must be a boolean");
      }
      if (!sg.families || typeof sg.families !== "object" || Array.isArray(sg.families)) {
        errors.push("surfaceGrammar.families: must be an object with the 6 canonical families");
      } else {
        const familyKeys = Object.keys(sg.families);
        for (const fam of SURFACE_FAMILIES) {
          if (!familyKeys.includes(fam)) {
            errors.push(`surfaceGrammar.families: missing required family '${fam}'`);
          }
        }
        for (const k of familyKeys) {
          if (!SURFACE_FAMILIES.includes(k)) {
            errors.push(`surfaceGrammar.families: unrecognized family key '${k}'`);
            continue;
          }
          const recipe = sg.families[k];
          if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) {
            errors.push(`surfaceGrammar.families.${k}: must be a recipe object`);
            continue;
          }
          if (recipe.family !== k) {
            errors.push(
              `surfaceGrammar.families.${k}.family: family property '${recipe.family}' does not match key '${k}'`,
            );
          }

          const allowedRecipeKeys = new Set([
            "family",
            "frame",
            "tone",
            "accent",
            "radius",
            "elevation",
            "pattern",
            "patternPlacement",
            "patternIntensity",
            "patternScale",
            "mediaTreatment",
          ]);
          for (const rk of Object.keys(recipe)) {
            if (!allowedRecipeKeys.has(rk)) {
              errors.push(`surfaceGrammar.families.${k}: unrecognized property '${rk}'`);
            }
          }

          const allowlist = FAMILY_ALLOWLISTS[k];
          if (!allowlist.frames.includes(recipe.frame)) {
            errors.push(
              `surfaceGrammar.families.${k}.frame: '${recipe.frame}' is not allowed for family '${k}'`,
            );
          }
          if (!allowlist.tones.includes(recipe.tone)) {
            errors.push(
              `surfaceGrammar.families.${k}.tone: '${recipe.tone}' is not allowed for family '${k}'`,
            );
          }
          if (!allowlist.accents.includes(recipe.accent)) {
            errors.push(
              `surfaceGrammar.families.${k}.accent: '${recipe.accent}' is not allowed for family '${k}'`,
            );
          }
          if (!allowlist.radii.includes(recipe.radius)) {
            errors.push(
              `surfaceGrammar.families.${k}.radius: '${recipe.radius}' is not allowed for family '${k}'`,
            );
          }
          if (!allowlist.elevations.includes(recipe.elevation)) {
            errors.push(
              `surfaceGrammar.families.${k}.elevation: '${recipe.elevation}' is not allowed for family '${k}'`,
            );
          }
          if (!allowlist.patternPlacements.includes(recipe.patternPlacement)) {
            errors.push(
              `surfaceGrammar.families.${k}.patternPlacement: '${recipe.patternPlacement}' is not allowed for family '${k}'`,
            );
          }
          if (
            recipe.pattern !== "gza-geometric" &&
            !CANONICAL_PATTERN_IDS.includes(recipe.pattern)
          ) {
            errors.push(
              `surfaceGrammar.families.${k}.pattern: invalid pattern '${recipe.pattern}'`,
            );
          }
          if (
            recipe.patternIntensity !== undefined &&
            !INTENSITY_LEVELS.includes(recipe.patternIntensity)
          ) {
            errors.push(
              `surfaceGrammar.families.${k}.patternIntensity: invalid intensity '${recipe.patternIntensity}'`,
            );
          }
          if (recipe.patternScale !== undefined && !SCALE_LEVELS.includes(recipe.patternScale)) {
            errors.push(
              `surfaceGrammar.families.${k}.patternScale: invalid scale '${recipe.patternScale}'`,
            );
          }

          if (recipe.mediaTreatment !== undefined && recipe.mediaTreatment !== null) {
            const mt = recipe.mediaTreatment;
            if (typeof mt !== "object" || Array.isArray(mt)) {
              errors.push(`surfaceGrammar.families.${k}.mediaTreatment: expected an object`);
            } else if (!allowlist.mediaAllowed) {
              errors.push(
                `surfaceGrammar.families.${k}: mediaTreatment is not allowed for family '${k}'`,
              );
            } else {
              validateMediaTreatmentObject(
                mt,
                `surfaceGrammar.families.${k}.mediaTreatment`,
                k,
                null,
                errors,
              );
            }
          }
        }
      }

      if (sg.targetOverrides !== undefined) {
        if (
          !sg.targetOverrides ||
          typeof sg.targetOverrides !== "object" ||
          Array.isArray(sg.targetOverrides)
        ) {
          errors.push("surfaceGrammar.targetOverrides: expected a non-null object");
        } else {
          for (const targetId of Object.keys(sg.targetOverrides)) {
            if (!COMPONENT_TARGET_IDS.includes(targetId)) {
              errors.push(`surfaceGrammar.targetOverrides: unknown target ID '${targetId}'`);
              continue;
            }
            const override = sg.targetOverrides[targetId];
            if (!override || typeof override !== "object" || Array.isArray(override)) {
              errors.push(
                `surfaceGrammar.targetOverrides.${targetId}: expected an override object`,
              );
              continue;
            }

            const allowedOverrideKeys = new Set([
              "frame",
              "tone",
              "accent",
              "radius",
              "elevation",
              "pattern",
              "patternPlacement",
              "patternIntensity",
              "patternScale",
              "mediaTreatment",
            ]);
            for (const ok of Object.keys(override)) {
              if (!allowedOverrideKeys.has(ok)) {
                errors.push(
                  `surfaceGrammar.targetOverrides.${targetId}: unrecognized property '${ok}' not allowed`,
                );
              }
            }

            const targetFamily = TARGET_FAMILY_MAP[targetId];
            const allowlist = FAMILY_ALLOWLISTS[targetFamily];

            if (override.frame !== undefined && !allowlist.frames.includes(override.frame)) {
              errors.push(
                `surfaceGrammar.targetOverrides.${targetId}.frame: '${override.frame}' is not allowed for target '${targetId}'`,
              );
            }
            if (override.tone !== undefined && !allowlist.tones.includes(override.tone)) {
              errors.push(
                `surfaceGrammar.targetOverrides.${targetId}.tone: '${override.tone}' is not allowed for target '${targetId}'`,
              );
            }
            if (override.accent !== undefined && !allowlist.accents.includes(override.accent)) {
              errors.push(
                `surfaceGrammar.targetOverrides.${targetId}.accent: '${override.accent}' is not allowed for target '${targetId}'`,
              );
            }
            if (override.radius !== undefined && !allowlist.radii.includes(override.radius)) {
              errors.push(
                `surfaceGrammar.targetOverrides.${targetId}.radius: '${override.radius}' is not allowed for target '${targetId}'`,
              );
            }
            if (
              override.elevation !== undefined &&
              !allowlist.elevations.includes(override.elevation)
            ) {
              errors.push(
                `surfaceGrammar.targetOverrides.${targetId}.elevation: '${override.elevation}' is not allowed for target '${targetId}'`,
              );
            }
            if (
              override.patternPlacement !== undefined &&
              !allowlist.patternPlacements.includes(override.patternPlacement)
            ) {
              errors.push(
                `surfaceGrammar.targetOverrides.${targetId}.patternPlacement: '${override.patternPlacement}' is not allowed for target '${targetId}'`,
              );
            }
            if (
              override.pattern !== undefined &&
              override.pattern !== "gza-geometric" &&
              !CANONICAL_PATTERN_IDS.includes(override.pattern)
            ) {
              errors.push(
                `surfaceGrammar.targetOverrides.${targetId}.pattern: invalid pattern '${override.pattern}'`,
              );
            }
            if (
              override.patternIntensity !== undefined &&
              !INTENSITY_LEVELS.includes(override.patternIntensity)
            ) {
              errors.push(
                `surfaceGrammar.targetOverrides.${targetId}.patternIntensity: invalid intensity '${override.patternIntensity}'`,
              );
            }
            if (
              override.patternScale !== undefined &&
              !SCALE_LEVELS.includes(override.patternScale)
            ) {
              errors.push(
                `surfaceGrammar.targetOverrides.${targetId}.patternScale: invalid scale '${override.patternScale}'`,
              );
            }

            if (override.mediaTreatment !== undefined && override.mediaTreatment !== null) {
              const mt = override.mediaTreatment;
              if (typeof mt !== "object" || Array.isArray(mt)) {
                errors.push(
                  `surfaceGrammar.targetOverrides.${targetId}.mediaTreatment: expected an object`,
                );
              } else if (!TARGET_MEDIA_ALLOWED[targetId] || !allowlist.mediaAllowed) {
                errors.push(
                  `surfaceGrammar.targetOverrides.${targetId}: mediaTreatment is not allowed for target '${targetId}'`,
                );
              } else {
                validateMediaTreatmentObject(
                  mt,
                  `surfaceGrammar.targetOverrides.${targetId}.mediaTreatment`,
                  targetFamily,
                  targetId,
                  errors,
                );
              }
            }
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Converts wire AppearanceSettingsDto to source AppearanceSettings.
 * Canonicalizes "gza-geometric" to "pie-factory" in canvases, families, and overrides.
 *
 * @param {object} wire
 * @returns {object} Source AppearanceSettings
 */
export function wireAppearanceSettingsToSource(wire) {
  const valRes = validateAppearanceSettingsWire(wire);
  if (!valRes.valid) {
    throw new Error(`Appearance settings validation failed: ${valRes.errors.join("; ")}`);
  }
  const res = {
    publicCanvas: {
      pattern: canonicalPatternId(wire.publicCanvas.pattern),
      intensity: wire.publicCanvas.intensity,
      scale: wire.publicCanvas.scale,
    },
    sandSection: {
      pattern: canonicalPatternId(wire.sandSection.pattern),
      intensity: wire.sandSection.intensity,
      scale: wire.sandSection.scale,
    },
    adminCanvas: {
      pattern: canonicalPatternId(wire.adminCanvas.pattern),
      intensity: wire.adminCanvas.intensity,
      scale: wire.adminCanvas.scale,
    },
  };
  if (wire.surfaceGrammar !== undefined) {
    const sg = structuredClone(wire.surfaceGrammar);
    if (sg.families) {
      for (const fam of Object.keys(sg.families)) {
        if (sg.families[fam]?.pattern) {
          sg.families[fam].pattern = canonicalPatternId(sg.families[fam].pattern);
        }
      }
    }
    if (sg.targetOverrides) {
      for (const tid of Object.keys(sg.targetOverrides)) {
        if (sg.targetOverrides[tid]?.pattern) {
          sg.targetOverrides[tid].pattern = canonicalPatternId(sg.targetOverrides[tid].pattern);
        }
      }
    }
    res.surfaceGrammar = sg;
  }
  return res;
}

/**
 * Adapts planned server settings draft receipt to wire envelope.
 *
 * @param {"contact"|"appearance"} domain
 * @param {boolean} changed
 * @param {number} revision
 * @returns {object} SettingsDraftReceiptDto
 */
export function adaptSettingsDraftReceiptToWire(domain, changed, revision = 1) {
  if (domain !== "contact" && domain !== "appearance") {
    throw new Error(`Invalid settings domain: '${domain}'`);
  }
  return {
    domain,
    changed: Boolean(changed),
    revision: Number(revision),
  };
}

/**
 * Validates contextual key-to-payload binding for CMS document drafts.
 *
 * Rules:
 * 1. slug must be one of the canonical 8 ContentKeys.
 * 2. payload must be a non-null object with schemaVersion: 1.
 * 3. payload.id must strictly equal slug.
 * 4. payload.kind must strictly equal slug.
 *
 * @param {string} slug
 * @param {object} payload
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCmsDraftKeyBinding(slug, payload) {
  const errors = [];
  if (!CANONICAL_CONTENT_KEYS.includes(slug)) {
    errors.push(
      `Unknown CMS document slug '${slug}': must be one of [${CANONICAL_CONTENT_KEYS.join(", ")}]`,
    );
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    errors.push("Missing or invalid CMS document payload: expected a non-null object");
    return { valid: false, errors };
  }
  if (payload.schemaVersion !== 1) {
    errors.push(`CMS payload schemaVersion must be 1, got ${payload.schemaVersion}`);
  }
  if (payload.id !== slug) {
    errors.push(`CMS document payload id '${payload.id}' does not match path slug '${slug}'`);
  }
  if (payload.kind !== slug) {
    errors.push(`CMS document payload kind '${payload.kind}' does not match path slug '${slug}'`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Adapts a source ContentMutationReceipt to wire CmsDraftReceiptDto.
 *
 * @param {object} receipt Source ContentMutationReceipt
 * @param {number} serverRevision Server revision (defaults to 1)
 * @returns {object} CmsDraftReceiptDto
 */
export function adaptCmsMutationReceiptToWire(receipt, serverRevision = 1) {
  if (!receipt || typeof receipt !== "object") {
    throw new Error("Invalid CMS mutation receipt: must be a non-null object");
  }
  const wire = {
    slug: receipt.key,
    changed: Boolean(receipt.changed),
    revision: Number(serverRevision),
  };
  if (receipt.changes !== undefined) {
    wire.changes = receipt.changes;
  }
  return wire;
}

/**
 * Converts source InternalNote to wire InternalNoteDto.
 *
 * @param {object} note Source InternalNote
 * @returns {object} InternalNoteDto
 */
export function sourceInternalNoteToWire(note) {
  if (!note || typeof note !== "object") {
    throw new Error("Invalid internal note: must be a non-null object");
  }
  const wire = {
    id: note.id,
    body: note.body,
    createdAt: note.createdAt,
    staffId: note.staffId,
  };
  if (note.staffName !== undefined) {
    wire.staffName = note.staffName;
  }
  return wire;
}

/**
 * Converts canonical source ContactMessage to wire ContactMessageDto for staff inbox.
 *
 * @param {object} msg Source ContactMessage
 * @returns {object} ContactMessageDto
 */
export function sourceContactMessageToWire(msg) {
  if (!msg || typeof msg !== "object") {
    throw new Error("Invalid contact message: must be a non-null object");
  }
  const wire = {
    id: msg.id,
    submissionId: msg.submissionId,
    senderName: msg.senderName,
    email: msg.email,
    topic: msg.topic,
    message: msg.message,
    language: msg.language,
    status: msg.status,
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
    source: msg.source,
    assignedStaffId: msg.assignedStaffId ?? null,
    replyDraft: msg.replyDraft ?? "",
    internalNotes: Array.isArray(msg.internalNotes)
      ? msg.internalNotes.map(sourceInternalNoteToWire)
      : [],
  };
  if (msg.bookingRef !== undefined && msg.bookingRef !== "") {
    wire.bookingRef = msg.bookingRef;
  }
  return wire;
}

/**
 * Validates wire CreateContactMessageRequest for public submission.
 *
 * Rules:
 * - submissionId required
 * - senderName required
 * - email required and valid
 * - topic in CONTACT_TOPICS
 * - message required
 * - language in CONTACT_LANGUAGES
 * - bookingRef optional
 * - Caller cannot inject internal status, assignee, source, internalNotes, replyDraft, or id.
 *
 * @param {object} wire
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateContactCreateWire(wire) {
  const errors = [];
  if (!wire || typeof wire !== "object" || Array.isArray(wire)) {
    return {
      valid: false,
      errors: ["Invalid contact submission payload: expected a non-null object"],
    };
  }

  // Forbidden caller injections
  const forbidden = [
    "id",
    "status",
    "assignedStaffId",
    "source",
    "internalNotes",
    "replyDraft",
    "createdAt",
    "updatedAt",
  ];
  for (const f of forbidden) {
    if (f in wire) {
      errors.push(`Caller cannot specify private staff/system field '${f}' on public submission`);
    }
  }

  const subId = typeof wire.submissionId === "string" ? wire.submissionId.trim() : "";
  if (!subId) {
    errors.push("submissionId: Idempotent client submission identifier is required");
  }

  const sender = typeof wire.senderName === "string" ? wire.senderName.trim() : "";
  if (!sender) {
    errors.push("senderName: Sender name is required");
  }

  const email = typeof wire.email === "string" ? wire.email.trim() : "";
  if (!email || !EMAIL_REGEX.test(email)) {
    errors.push("email: Valid email address is required");
  }

  if (!CONTACT_TOPICS.includes(wire.topic)) {
    errors.push(`topic: Must be one of [${CONTACT_TOPICS.join(", ")}]`);
  }

  const message = typeof wire.message === "string" ? wire.message.trim() : "";
  if (!message) {
    errors.push("message: Message content is required");
  }

  if (!CONTACT_LANGUAGES.includes(wire.language)) {
    errors.push(`language: Must be one of [${CONTACT_LANGUAGES.join(", ")}]`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Converts wire CreateContactMessageRequest into source ContactCreateInput.
 *
 * @param {object} wire
 * @returns {object} ContactCreateInput
 */
export function wireContactCreateToSource(wire) {
  const valRes = validateContactCreateWire(wire);
  if (!valRes.valid) {
    throw new Error(`Contact creation input validation failed: ${valRes.errors.join("; ")}`);
  }
  const input = {
    submissionId: String(wire.submissionId).trim(),
    senderName: String(wire.senderName).trim(),
    email: String(wire.email).trim(),
    topic: wire.topic,
    message: String(wire.message).trim(),
    language: wire.language,
  };
  if (wire.bookingRef !== undefined && String(wire.bookingRef).trim() !== "") {
    input.bookingRef = String(wire.bookingRef).trim();
  }
  return input;
}

/**
 * Adapts created ContactMessage to minimal public acknowledgement receipt.
 * Invariant: Deliberately excludes private staff notes, reply drafts, body, and email PII.
 *
 * @param {object} msg Source ContactMessage
 * @returns {object} ContactSubmissionReceiptDto
 */
export function adaptContactSubmissionReceiptToWire(msg) {
  if (!msg || typeof msg !== "object") {
    throw new Error("Invalid contact message: must be a non-null object");
  }
  return {
    id: msg.id,
    submissionId: msg.submissionId,
    receivedAt: msg.createdAt,
  };
}

/**
 * Adapts source status change receipt to wire ContactStatusReceiptDto.
 *
 * @param {object} receipt Source ContactMutationReceipt
 * @param {number} serverRevision Server revision
 * @returns {object} ContactStatusReceiptDto
 */
export function adaptContactStatusReceiptToWire(receipt, serverRevision = 1) {
  if (!receipt || typeof receipt !== "object") {
    throw new Error("Invalid receipt: must be a non-null object");
  }
  const wire = {
    changed: Boolean(receipt.changed),
    message: sourceContactMessageToWire(receipt.message),
    revision: Number(serverRevision),
  };
  if (receipt.beforeStatus !== undefined) {
    wire.beforeStatus = receipt.beforeStatus;
  }
  return wire;
}

/**
 * Adapts source assignee change receipt to wire ContactAssigneeReceiptDto.
 *
 * @param {object} receipt Source ContactMutationReceipt
 * @param {number} serverRevision Server revision
 * @returns {object} ContactAssigneeReceiptDto
 */
export function adaptContactAssigneeReceiptToWire(receipt, serverRevision = 1) {
  if (!receipt || typeof receipt !== "object") {
    throw new Error("Invalid receipt: must be a non-null object");
  }
  return {
    changed: Boolean(receipt.changed),
    beforeAssignee: receipt.beforeAssignee ?? null,
    message: sourceContactMessageToWire(receipt.message),
    revision: Number(serverRevision),
  };
}

/**
 * Adapts contact inbox messages list to wire ContactInboxListResponse data envelope.
 *
 * @param {Array<object>} messages Source ContactMessage array
 * @param {number} total Total messages count
 * @param {number} countNew Count of new messages
 * @returns {object} Wire ContactInboxListResponse data envelope
 */
export function adaptContactInboxListToWire(messages, total, countNew) {
  return {
    items: (messages || []).map(sourceContactMessageToWire),
    total: Number(total ?? messages?.length ?? 0),
    countNew: Number(countNew ?? 0),
  };
}
