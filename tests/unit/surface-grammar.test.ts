import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ALL_TARGET_IDS,
  CANVAS_TARGET_IDS,
  COMPONENT_TARGET_IDS,
  FAMILY_TARGET_IDS,
  getTargetFamily,
  isTargetId,
  resolveTargetRecipe,
  sanitizeTargetOverride,
  TARGET_ALLOWED_TRUTH_CLASSES,
  TARGET_MEDIA_ALLOWED,
} from "../../src/design/surfaces/runtime-targets.ts";
import {
  DEFAULT_SURFACE_GRAMMAR_CONFIG,
  DEFAULT_SURFACE_RECIPES,
  sanitizeSurfaceGrammarConfig,
  sanitizeSurfaceRecipe,
} from "../../src/design/surfaces/presets.ts";
import type { SurfaceGrammarConfig } from "../../src/design/surfaces/types.ts";
import {
  APPROVED_MEDIA_CATALOG,
  getCanonicalTruthClass,
  isApprovedMediaId,
  sanitizeMediaTreatmentAuthoritative,
} from "../../src/lib/media-policy.ts";

describe("Surface Grammar & Runtime Targets", () => {
  describe("Target ID Classification", () => {
    it("recognizes valid canvas, family, and component target IDs", () => {
      assert.equal(isTargetId("canvas.public"), true);
      assert.equal(isTargetId("canvas.sand"), true);
      assert.equal(isTargetId("family.operational"), true);
      assert.equal(isTargetId("booking.flight-option"), true);
      assert.equal(isTargetId("travel.guide"), true);
    });

    it("rejects invalid, unknown, or deprecated target IDs", () => {
      assert.equal(isTargetId("canvas.admin"), false);
      assert.equal(isTargetId("unknown.target"), false);
      assert.equal(isTargetId(""), false);
      assert.equal(isTargetId(null), false);
      assert.equal(isTargetId(123), false);
    });

    it("maps component targets to their correct semantic family", () => {
      assert.equal(getTargetFamily("booking.flight-option"), "operational");
      assert.equal(getTargetFamily("booking.fare-option"), "fare");
      assert.equal(getTargetFamily("booking.trip-summary"), "dossier");
      assert.equal(getTargetFamily("booking.passenger-sheet"), "form-sheet");
      assert.equal(getTargetFamily("travel.guide"), "guide");
      assert.equal(getTargetFamily("airport.chapter-card"), "editorial");
      assert.equal(getTargetFamily("canvas.public"), null);
    });
  });

  describe("Family Inheritance vs Delta Component Override Resolution", () => {
    it("inherits directly from family when target override is absent", () => {
      const config: SurfaceGrammarConfig = {
        enabled: true,
        families: {
          ...DEFAULT_SURFACE_GRAMMAR_CONFIG.families,
          operational: {
            ...DEFAULT_SURFACE_RECIPES.operational,
            tone: "olive-soft",
            frame: "rail",
          },
        },
      };

      const resolved = resolveTargetRecipe("booking.flight-option", config);
      assert.equal(resolved.tone, "olive-soft");
      assert.equal(resolved.frame, "rail");
      assert.equal(resolved.radius, DEFAULT_SURFACE_RECIPES.operational.radius);
    });

    it("applies target override over family recipe for customized components", () => {
      const config: SurfaceGrammarConfig = {
        enabled: true,
        families: {
          ...DEFAULT_SURFACE_GRAMMAR_CONFIG.families,
          operational: {
            ...DEFAULT_SURFACE_RECIPES.operational,
            tone: "paper",
            frame: "plain",
          },
        },
        targetOverrides: {
          "booking.flight-option": {
            tone: "limestone",
            frame: "indexed",
          },
        },
      };

      const resolved = resolveTargetRecipe("booking.flight-option", config);
      assert.equal(resolved.tone, "limestone");
      assert.equal(resolved.frame, "indexed");
      assert.equal(resolved.radius, DEFAULT_SURFACE_RECIPES.operational.radius);
    });

    it("regression test: delta inheritance propagates subsequent family changes to non-overridden fields", () => {
      // 1. Initial state: component has delta override for ONLY frame
      const config: SurfaceGrammarConfig = {
        enabled: true,
        families: {
          ...DEFAULT_SURFACE_GRAMMAR_CONFIG.families,
          editorial: {
            ...DEFAULT_SURFACE_RECIPES.editorial,
            frame: "chapter",
            tone: "ink",
            accent: "clay",
          },
        },
        targetOverrides: {
          "airport.future-editorial": {
            frame: "plain", // Only customize frame (delta)
          },
        },
      };

      // Initially, frame is plain (from delta), tone is ink (from family)
      const initial = resolveTargetRecipe("airport.future-editorial", config);
      assert.equal(initial.frame, "plain");
      assert.equal(initial.tone, "ink");
      assert.equal(initial.accent, "clay");

      // 2. Owner changes family tone to sand-deep and accent to gold
      config.families.editorial = {
        ...config.families.editorial,
        tone: "sand-deep",
        accent: "gold",
      };

      // 3. Component MUST receive the family changes for tone & accent while preserving its frame delta
      const updated = resolveTargetRecipe("airport.future-editorial", config);
      assert.equal(updated.frame, "plain"); // Preserved custom delta
      assert.equal(updated.tone, "sand-deep"); // Propagated from family!
      assert.equal(updated.accent, "gold"); // Propagated from family!

      // 4. "Reset to family" removes the delta entry completely
      delete config.targetOverrides?.["airport.future-editorial"];
      const reset = resolveTargetRecipe("airport.future-editorial", config);
      assert.equal(reset.frame, "chapter"); // Fully back to family recipe
      assert.equal(reset.tone, "sand-deep");
    });
  });

  describe("Authoritative Media Policy & Truth Sanitization", () => {
    it("disallows media treatment on non-media components (e.g. flight-option)", () => {
      const rawOverride = {
        frame: "rail",
        mediaTreatment: {
          treatment: "cover",
          mediaId: "home-hero",
          truthClass: "future-concept-ai",
        },
      };

      const sanitized = sanitizeTargetOverride("booking.flight-option", rawOverride);
      assert.equal(sanitized.frame, "rail");
      assert.equal(sanitized.mediaTreatment, undefined); // Media strictly stripped
    });

    it("allows approved media on media-supported components with canonical truth class", () => {
      const rawOverride = {
        frame: "chapter",
        mediaTreatment: {
          treatment: "top",
          mediaId: "home-hero",
        },
      };

      const sanitized = sanitizeTargetOverride("travel.guide", rawOverride);
      assert.equal(sanitized.frame, "chapter");
      assert.notEqual(sanitized.mediaTreatment, undefined);
      assert.equal(sanitized.mediaTreatment?.mediaId, "home-hero");
      assert.equal(sanitized.mediaTreatment?.truthClass, "future-concept-ai");
      assert.equal(sanitized.mediaTreatment?.treatment, "top");
    });

    it("rejects unknown / unapproved media IDs", () => {
      const rawOverride = {
        mediaTreatment: {
          treatment: "cover",
          mediaId: "unapproved-random-pic",
          truthClass: "future-concept-ai",
        },
      };

      const sanitized = sanitizeTargetOverride("travel.guide", rawOverride);
      assert.equal(sanitized.mediaTreatment, undefined);
    });

    it("strictly rejects future AI concepts on historical chapter cards (airport.chapter-card)", () => {
      // airport.chapter-card is historical Past/Present; NEVER allow future-concept-ai
      const rawOverride = {
        mediaTreatment: {
          treatment: "cover",
          mediaId: "landside-day", // Valid AI concept, but forbidden on historical chapter card
          truthClass: "future-concept-ai",
        },
      };

      const sanitized = sanitizeTargetOverride("airport.chapter-card", rawOverride);
      assert.equal(sanitized.mediaTreatment, undefined);
    });

    it("rejects forged truth class claims", () => {
      // Forgery attempt: passing AI image with forged brand-mark truth class
      const rawOverride = {
        mediaTreatment: {
          treatment: "cover",
          mediaId: "landside-day", // Actually future-concept-ai
          truthClass: "brand-mark", // Forged claim!
        },
      };

      const sanitized = sanitizeTargetOverride("airport.chapter-card", rawOverride);
      assert.equal(sanitized.mediaTreatment, undefined);
    });

    it("assigns canonical truth class from registry regardless of user-passed truthClass", () => {
      // Valid brand-mark (logo) with incorrect user-supplied truthClass
      const rawOverride = {
        mediaTreatment: {
          treatment: "side",
          mediaId: "logo",
          truthClass: "future-concept-ai", // Incorrect/forged
        },
      };

      const sanitized = sanitizeTargetOverride("travel.guide", rawOverride);
      assert.notEqual(sanitized.mediaTreatment, undefined);
      assert.equal(sanitized.mediaTreatment?.mediaId, "logo");
      assert.equal(sanitized.mediaTreatment?.truthClass, "brand-mark"); // Canonical metadata enforced!
    });

    it("handles malformed, null, and non-object media inputs safely", () => {
      assert.equal(sanitizeMediaTreatmentAuthoritative(null), undefined);
      assert.equal(sanitizeMediaTreatmentAuthoritative(undefined), undefined);
      assert.equal(sanitizeMediaTreatmentAuthoritative(42), undefined);
      assert.equal(sanitizeMediaTreatmentAuthoritative("string"), undefined);
      assert.equal(sanitizeMediaTreatmentAuthoritative({}), undefined);
    });

    it("guarantees 100% bidirectional parity between MEDIA and APPROVED_MEDIA_CATALOG", () => {
      const mediaSource = readFileSync(
        new URL("../../src/lib/media.ts", import.meta.url),
        "utf8",
      );

      // Extract all entry keys and their declared truthClass from src/lib/media.ts
      const mediaMap: Record<string, string> = {};
      const entryRegex = /(?:["']?([a-z0-9-]+)["']?):\s*\{\s*id:\s*"([a-z0-9-]+)"[\s\S]*?truthClass:\s*(?:APPROVED_MEDIA_CATALOG\["([a-z0-9-]+)"\]|"([a-z0-9-]+)")/g;
      let match;
      while ((match = entryRegex.exec(mediaSource)) !== null) {
        const key = match[1];
        const tc = match[3]
          ? (APPROVED_MEDIA_CATALOG as Record<string, string>)[match[3]]
          : match[4];
        if (key && tc) {
          mediaMap[key] = tc;
        }
      }

      const policyKeys = Object.keys(APPROVED_MEDIA_CATALOG).sort();
      const mediaKeys = Object.keys(mediaMap).sort();

      assert.deepEqual(
        policyKeys,
        mediaKeys,
        "All approved media IDs in APPROVED_MEDIA_CATALOG must exactly match MEDIA registry keys",
      );

      assert.equal(policyKeys.length, 14, "Exactly 14 canonical media items are approved");

      for (const key of policyKeys) {
        const canonicalTruth = APPROVED_MEDIA_CATALOG[key as keyof typeof APPROVED_MEDIA_CATALOG];
        const mediaEntryTruth = mediaMap[key];
        assert.equal(
          mediaEntryTruth,
          canonicalTruth,
          `TruthClass mismatch for media ID "${key}": media has "${mediaEntryTruth}", policy has "${canonicalTruth}"`,
        );
      }
    });
  });

  describe("Config Sanitization & Robustness", () => {
    it("sanitizes corrupt or partial surface grammar configuration safely", () => {
      const corrupt = {
        enabled: "not-a-boolean",
        families: "invalid",
        targetOverrides: {
          "unknown.target": { tone: "paper" },
          "booking.flight-option": { tone: "invalid-tone", frame: "plain" },
        },
      };

      const clean = sanitizeSurfaceGrammarConfig(corrupt);
      assert.equal(typeof clean.enabled, "boolean");
      assert.equal(clean.targetOverrides?.["unknown.target"], undefined);
      assert.equal(clean.targetOverrides?.["booking.flight-option"]?.frame, "plain");
      assert.equal(clean.targetOverrides?.["booking.flight-option"]?.tone, undefined);
    });

    it("preserves empty delta targetOverrides ({}) across reload and sanitization", () => {
      const configWithEmptyDelta = {
        enabled: true,
        families: DEFAULT_SURFACE_RECIPES,
        targetOverrides: {
          "booking.flight-option": {},
        },
      };

      const clean = sanitizeSurfaceGrammarConfig(configWithEmptyDelta);
      assert.notEqual(clean.targetOverrides, undefined);
      assert.notEqual(clean.targetOverrides?.["booking.flight-option"], undefined);
      assert.deepEqual(clean.targetOverrides?.["booking.flight-option"], {});

      // Verifying that isCustomized remains true (override exists) and resolves to family defaults
      const resolved = resolveTargetRecipe("booking.flight-option", clean);
      assert.equal(resolved.tone, DEFAULT_SURFACE_RECIPES.operational.tone);
      assert.equal(resolved.frame, DEFAULT_SURFACE_RECIPES.operational.frame);
    });

    it("preserves single-property deltas, inherits family recipes, and dynamically updates on family change", () => {
      // 1. Customized component with single field delta
      const initial = sanitizeSurfaceGrammarConfig({
        enabled: true,
        families: DEFAULT_SURFACE_RECIPES,
        targetOverrides: {
          "booking.flight-option": { tone: "limestone" },
        },
      });

      assert.deepEqual(initial.targetOverrides?.["booking.flight-option"], { tone: "limestone" });
      const res1 = resolveTargetRecipe("booking.flight-option", initial);
      assert.equal(res1.tone, "limestone");
      assert.equal(res1.accent, "brand"); // Inherited from operational family

      // 2. Family recipe update propagates to non-overridden fields
      initial.families.operational = {
        ...initial.families.operational,
        accent: "clay",
      };
      const res2 = resolveTargetRecipe("booking.flight-option", initial);
      assert.equal(res2.tone, "limestone"); // Preserved delta
      assert.equal(res2.accent, "clay"); // Propagated family update!

      // 3. Reset to family removes override key
      delete initial.targetOverrides?.["booking.flight-option"];
      const res3 = resolveTargetRecipe("booking.flight-option", initial);
      assert.equal(res3.tone, "paper"); // Operational default tone restored
      assert.equal(res3.accent, "clay");
    });
  });
});
