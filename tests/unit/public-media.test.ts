import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import {
  APPROVED_MEDIA_CATALOG,
  getCanonicalTruthClass,
  isApprovedMediaId,
  TARGET_ALLOWED_TRUTH_CLASSES,
  sanitizeMediaTreatmentAuthoritative,
  type TruthClass,
} from "../../src/lib/media-policy.ts";
import { TARGET_REGISTRY } from "../../src/design/surfaces/targets.ts";

describe("Public Media Registry & Truth Policy (Checkpoint 2026-09-29)", () => {
  const PHOTO_HERO_IDS = [
    "airport-archive-hero-2000",
    "gallery-aircraft-archive-2000",
    "destinations-hero",
    "travel-info-hero",
    "manage-booking-hero",
    "check-in-hero",
    "signin-photo",
  ] as const;

  it("registers all 7 photo heroes in APPROVED_MEDIA_CATALOG with canonical truth classes", () => {
    assert.equal(getCanonicalTruthClass("airport-archive-hero-2000"), "historical-documentary");
    assert.equal(getCanonicalTruthClass("gallery-aircraft-archive-2000"), "historical-documentary");
    assert.equal(getCanonicalTruthClass("destinations-hero"), "illustrative-photo");
    assert.equal(getCanonicalTruthClass("travel-info-hero"), "illustrative-photo");
    assert.equal(getCanonicalTruthClass("manage-booking-hero"), "illustrative-photo");
    assert.equal(getCanonicalTruthClass("check-in-hero"), "illustrative-photo");
    assert.equal(getCanonicalTruthClass("signin-photo"), "illustrative-photo");
  });

  it("ensures each photo hero is registered in the MEDIA registry in src/lib/media.ts", () => {
    const mediaSource = readFileSync(
      new URL("../../src/lib/media.ts", import.meta.url),
      "utf8",
    );

    for (const id of PHOTO_HERO_IDS) {
      assert.ok(isApprovedMediaId(id), `${id} must be an approved media ID`);
      assert.ok(
        mediaSource.includes(`"${id}":`),
        `MEDIA object must define an entry for "${id}"`,
      );
      assert.ok(
        mediaSource.includes(`id: "${id}"`),
        `MEDIA entry must define id: "${id}"`,
      );
      assert.ok(
        mediaSource.includes(`truthClass: "${APPROVED_MEDIA_CATALOG[id]}"`),
        `MEDIA entry for "${id}" must declare truthClass: "${APPROVED_MEDIA_CATALOG[id]}"`,
      );
    }
  });

  it("verifies all generated photo derivatives exist on disk with valid file sizes", () => {
    const derivatives = [
      // Airport archive
      "src/assets/media/documentary/airport-archive-2000-640.webp",
      "src/assets/media/documentary/airport-archive-2000-960.webp",
      "src/assets/media/documentary/airport-archive-2000-1280.webp",
      "src/assets/media/documentary/airport-archive-2000-1376.webp",
      // Gallery aircraft archive
      "src/assets/media/documentary/gallery-aircraft-2000-640.webp",
      "src/assets/media/documentary/gallery-aircraft-2000-960.webp",
      "src/assets/media/documentary/gallery-aircraft-2000-1280.webp",
      "src/assets/media/documentary/gallery-aircraft-2000-1376.webp",
      // Destinations hero
      "src/assets/media/editorial/destinations-hero-640.webp",
      "src/assets/media/editorial/destinations-hero-960.webp",
      "src/assets/media/editorial/destinations-hero-1280.webp",
      "src/assets/media/editorial/destinations-hero-1376.webp",
      // Travel info hero
      "src/assets/media/editorial/travel-info-hero-640.webp",
      "src/assets/media/editorial/travel-info-hero-960.webp",
      "src/assets/media/editorial/travel-info-hero-1280.webp",
      "src/assets/media/editorial/travel-info-hero-1376.webp",
      // Manage booking hero
      "src/assets/media/editorial/manage-booking-hero-640.webp",
      "src/assets/media/editorial/manage-booking-hero-960.webp",
      "src/assets/media/editorial/manage-booking-hero-1280.webp",
      "src/assets/media/editorial/manage-booking-hero-1376.webp",
      // Check-in hero
      "src/assets/media/editorial/check-in-hero-640.webp",
      "src/assets/media/editorial/check-in-hero-960.webp",
      "src/assets/media/editorial/check-in-hero-1280.webp",
      "src/assets/media/editorial/check-in-hero-1376.webp",
      // Sign-in photo
      "src/assets/media/editorial/signin-photo-640.webp",
      "src/assets/media/editorial/signin-photo-960.webp",
      "src/assets/media/editorial/signin-photo-1280.webp",
      "src/assets/media/editorial/signin-photo-1376.webp",
    ];

    for (const relPath of derivatives) {
      assert.ok(existsSync(relPath), `Derivative must exist: ${relPath}`);
      const stats = statSync(relPath);
      assert.ok(stats.size > 10000, `Derivative ${relPath} size must be > 10KB (got ${stats.size} bytes)`);
    }
  });

  it("verifies 4 utility rail card derivatives exist on disk with valid file sizes", () => {
    const utilityCards = [
      "src/assets/media/decorative/home-utility/utility-flight-status.webp",
      "src/assets/media/decorative/home-utility/utility-check-in.webp",
      "src/assets/media/decorative/home-utility/utility-travel-guidelines.webp",
      "src/assets/media/decorative/home-utility/utility-airport-heritage.webp",
    ];

    for (const relPath of utilityCards) {
      assert.ok(existsSync(relPath), `Utility card derivative must exist: ${relPath}`);
      const stats = statSync(relPath);
      assert.ok(stats.size > 5000, `Utility card ${relPath} size must be > 5KB (got ${stats.size} bytes)`);
    }
  });

  it("strictly enforces documentary vs illustrative target boundaries", () => {
    // airport.chapter-card allows historical-documentary and brand-mark, strictly rejects illustrative
    const historicalAirport = sanitizeMediaTreatmentAuthoritative(
      { mediaId: "airport-archive-hero-2000", treatment: "cover" },
      { targetId: "airport.chapter-card" },
    );
    assert.ok(historicalAirport, "airport-archive-hero-2000 must be allowed on airport.chapter-card");
    assert.equal(historicalAirport?.truthClass, "historical-documentary");

    // Illustrative photo must be rejected on airport.chapter-card
    const illustrativeAirport = sanitizeMediaTreatmentAuthoritative(
      { mediaId: "destinations-hero", treatment: "cover" },
      { targetId: "airport.chapter-card" },
    );
    assert.equal(illustrativeAirport, undefined, "destinations-hero must be rejected on airport.chapter-card");

    // Future AI concept must be rejected on airport.chapter-card
    const futureAirport = sanitizeMediaTreatmentAuthoritative(
      { mediaId: "home-hero", treatment: "cover" },
      { targetId: "airport.chapter-card" },
    );
    assert.equal(futureAirport, undefined, "home-hero (AI) must be rejected on airport.chapter-card");
  });

  it("verifies operational surfaces reject all media types", () => {
    const operationalTargets = [
      "booking.flight-option",
      "booking.fare-option",
      "booking.trip-summary",
      "booking.passenger-sheet",
      "booking.seat-console",
      "booking.extras",
      "booking.review-dossier",
    ];

    for (const target of operationalTargets) {
      const sanitized = sanitizeMediaTreatmentAuthoritative(
        { mediaId: "destinations-hero", treatment: "cover" },
        { targetId: target },
      );
      assert.equal(sanitized, undefined, `Operational target ${target} must strictly reject media`);
    }
  });

  it("verifies all 7 photo heroes have grounded, accurate EN and AR alt texts reflecting visible pixels", () => {
    const mediaSource = readFileSync(
      new URL("../../src/lib/media.ts", import.meta.url),
      "utf8",
    );

    const expectedAltTexts: Record<string, { en: string; ar: string }> = {
      "airport-archive-hero-2000": {
        en: "Historical photograph of the Gaza International Airport passenger terminal and control tower in 2000.",
        ar: "صورة تاريخية لمبنى المسافرين وبرج المراقبة في مطار غزة الدولي عام 2000.",
      },
      "gallery-aircraft-archive-2000": {
        en: "Historical photograph of a Palestinian Airlines passenger aircraft on the tarmac at Gaza International Airport in 2000.",
        ar: "صورة تاريخية لطائرة ركاب تابعة للخطوط الجوية الفلسطينية على مدرج مطار غزة الدولي عام 2000.",
      },
      "destinations-hero": {
        en: "Aerial view of snow-covered mountain ridges and cloud banks beneath a clear sky.",
        ar: "مشهد جوي لقمم جبلية مكسوة بالثلوج وتشكيلات سحابية تحت سماء صافية.",
      },
      "travel-info-hero": {
        en: "Outdoor bilingual bus stop sign on a pedestrian walkway beside modern buildings and a roadway.",
        ar: "لوحة موقف حافلات ثنائية اللغة على رصيف مشاة بمحاذاة مبانٍ حديثة وطريق للمركبات.",
      },
      "manage-booking-hero": {
        en: "Close view of hands using a desktop computer keyboard and mouse at a service workstation.",
        ar: "لقطة قريبة ليدي موظف يستخدم لوحة مفاتيح وفأرة حاسوب عند منصة خدمة.",
      },
      "check-in-hero": {
        en: "Empty passenger queuing lane with stanchions and service counters inside a terminal.",
        ar: "مسار اصطفاف خالٍ للمسافرين بحواجز شريطية ومكاتب خدمة داخل صالة المطار.",
      },
      "signin-photo": {
        en: "Commercial passenger aircraft parked at a terminal jet bridge on an airport apron.",
        ar: "طائرة ركاب تجارية متوقفة عند جسر صعود المسافرين في ساحة المطار.",
      },
    };

    for (const [id, alts] of Object.entries(expectedAltTexts)) {
      assert.ok(
        mediaSource.includes(`altEn: "${alts.en}"`),
        `MEDIA["${id}"] must have grounded English alt text: "${alts.en}"`,
      );
      assert.ok(
        mediaSource.includes(`altAr: "${alts.ar}"`),
        `MEDIA["${id}"] must have grounded Arabic alt text: "${alts.ar}"`,
      );
    }
  });

  it("targets.ts TARGET_REGISTRY allowedTruthClasses agrees with media-policy.ts canonical policy", () => {
    // Regression guard: asserts actual TARGET_REGISTRY metadata against canonical TARGET_ALLOWED_TRUTH_CLASSES.
    // Order-independent set comparison guarantees zero policy drift across targets.

    // 1. Specific assertion for airport.chapter-card metadata in TARGET_REGISTRY
    const airportChapterCardDef = TARGET_REGISTRY["airport.chapter-card"];
    assert.ok(airportChapterCardDef, "TARGET_REGISTRY['airport.chapter-card'] must exist");

    const registrySet = new Set(airportChapterCardDef.allowedTruthClasses ?? []);
    const canonicalSet = new Set(TARGET_ALLOWED_TRUTH_CLASSES["airport.chapter-card"] ?? []);

    assert.deepEqual(
      registrySet,
      canonicalSet,
      "TARGET_REGISTRY['airport.chapter-card'] allowedTruthClasses must match canonical TARGET_ALLOWED_TRUTH_CLASSES",
    );
    assert.ok(
      registrySet.has("historical-documentary"),
      "TARGET_REGISTRY['airport.chapter-card'] must explicitly allow historical-documentary",
    );
    assert.ok(
      !registrySet.has("future-concept-ai"),
      "TARGET_REGISTRY['airport.chapter-card'] must strictly reject future-concept-ai",
    );
    assert.ok(
      !registrySet.has("illustrative-photo"),
      "TARGET_REGISTRY['airport.chapter-card'] must strictly reject illustrative-photo",
    );

    // 2. Comprehensive check for all targets declared in TARGET_ALLOWED_TRUTH_CLASSES
    for (const [targetId, expectedClasses] of Object.entries(TARGET_ALLOWED_TRUTH_CLASSES)) {
      const targetDef = TARGET_REGISTRY[targetId as keyof typeof TARGET_REGISTRY];
      assert.ok(targetDef, `Target '${targetId}' from TARGET_ALLOWED_TRUTH_CLASSES must exist in TARGET_REGISTRY`);
      const targetRegistrySet = new Set(targetDef.allowedTruthClasses ?? []);
      const targetCanonicalSet = new Set(expectedClasses);
      assert.deepEqual(
        targetRegistrySet,
        targetCanonicalSet,
        `TARGET_REGISTRY['${targetId}'] allowedTruthClasses must match canonical TARGET_ALLOWED_TRUTH_CLASSES`,
      );
    }

    // 3. Positive historical and negative future/illustrative runtime sanitization checks
    const historicalOk = sanitizeMediaTreatmentAuthoritative(
      { mediaId: "airport-archive-hero-2000", treatment: "cover" },
      { targetId: "airport.chapter-card" },
    );
    assert.ok(historicalOk, "historical-documentary airport-archive-hero-2000 must pass on airport.chapter-card");
    assert.equal(historicalOk?.truthClass, "historical-documentary");

    const futureRejected = sanitizeMediaTreatmentAuthoritative(
      { mediaId: "home-hero", treatment: "cover" },
      { targetId: "airport.chapter-card" },
    );
    assert.equal(futureRejected, undefined, "future-concept-ai home-hero must be rejected on airport.chapter-card");

    const illustrativeRejected = sanitizeMediaTreatmentAuthoritative(
      { mediaId: "destinations-hero", treatment: "cover" },
      { targetId: "airport.chapter-card" },
    );
    assert.equal(
      illustrativeRejected,
      undefined,
      "illustrative-photo destinations-hero must be rejected on airport.chapter-card",
    );
  });
});
