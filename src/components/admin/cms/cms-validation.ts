import type {
  HomeContent,
  TravelContent,
  AirportPastContent,
  AirportPresentContent,
  AirportFutureContent,
  DestinationsEditorialContent,
  DestinationsPresentationContent,
  InformationalPagesContent,
} from "../../../content/types.ts";
import { SOURCE_REGISTRY } from "../../../lib/archive/sources.ts";

/**
 * Validates a single plainText string according to Zod content schema:
 * - min length 1 (non-empty)
 * - max length 5000
 * - no HTML tags (/<\s*\/?\s*[a-z][^>]*>/i)
 * - no javascript: or data:text/html
 */
export function validatePlainText(value: string | undefined | null): string | null {
  if (!value || !value.trim()) {
    return "cms.err.required";
  }
  if (value.length > 5000) {
    return "cms.err.maxLength";
  }
  if (/<\s*\/?\s*[a-z][^>]*>/i.test(value)) {
    return "cms.err.htmlNotAllowed";
  }
  if (/javascript:|data:text\/html/i.test(value)) {
    return "cms.err.htmlNotAllowed";
  }
  return null;
}

/**
 * Validates HomeContent draft and returns a map of DOM field ID -> translation error key.
 */
export function validateHomeContent(draft: HomeContent): Record<string, string> {
  const errors: Record<string, string> = {};

  // SEO fields
  const seoTitleEn = validatePlainText(draft.seo.title.en);
  if (seoTitleEn) errors["seo-title-en"] = seoTitleEn;
  const seoTitleAr = validatePlainText(draft.seo.title.ar);
  if (seoTitleAr) errors["seo-title-ar"] = seoTitleAr;

  const seoDescEn = validatePlainText(draft.seo.description.en);
  if (seoDescEn) errors["seo-desc-en"] = seoDescEn;
  const seoDescAr = validatePlainText(draft.seo.description.ar);
  if (seoDescAr) errors["seo-desc-ar"] = seoDescAr;

  // Copy fields (all 17 keys)
  if (draft.copy) {
    for (const [key, loc] of Object.entries(draft.copy)) {
      const errEn = validatePlainText(loc?.en);
      if (errEn) errors[`copy-${key}-en`] = errEn;
      const errAr = validatePlainText(loc?.ar);
      if (errAr) errors[`copy-${key}-ar`] = errAr;
    }
  }

  // Sections
  if (!Array.isArray(draft.sections) || draft.sections.length !== 8) {
    errors["sections-order"] = "cms.sections.required";
  } else {
    const required = ["hero", "search", "board"] as const;
    required.forEach((id, idx) => {
      const sec = draft.sections[idx];
      if (!sec || sec.id !== id || !sec.visible) {
        errors[`section-${id}`] = "cms.sections.required";
      }
    });
  }

  return errors;
}

/**
 * Validates TravelContent draft and returns a map of DOM field ID -> translation error key.
 */
export function validateTravelContent(draft: TravelContent): Record<string, string> {
  const errors: Record<string, string> = {};

  // SEO fields
  const seoTitleEn = validatePlainText(draft.seo.title.en);
  if (seoTitleEn) errors["seo-title-en"] = seoTitleEn;
  const seoTitleAr = validatePlainText(draft.seo.title.ar);
  if (seoTitleAr) errors["seo-title-ar"] = seoTitleAr;

  const seoDescEn = validatePlainText(draft.seo.description.en);
  if (seoDescEn) errors["seo-desc-en"] = seoDescEn;
  const seoDescAr = validatePlainText(draft.seo.description.ar);
  if (seoDescAr) errors["seo-desc-ar"] = seoDescAr;

  // Intro fields
  const introTitleEn = validatePlainText(draft.intro.title.en);
  if (introTitleEn) errors["tr-intro-title-en"] = introTitleEn;
  const introTitleAr = validatePlainText(draft.intro.title.ar);
  if (introTitleAr) errors["tr-intro-title-ar"] = introTitleAr;

  const introDescEn = validatePlainText(draft.intro.description.en);
  if (introDescEn) errors["tr-intro-desc-en"] = introDescEn;
  const introDescAr = validatePlainText(draft.intro.description.ar);
  if (introDescAr) errors["tr-intro-desc-ar"] = introDescAr;

  // Sections (all 5)
  const seenPointIds = new Set<string>();
  if (Array.isArray(draft.sections)) {
    for (const section of draft.sections) {
      const titleEn = validatePlainText(section.title.en);
      if (titleEn) errors[`tr-sec-${section.id}-title-en`] = titleEn;
      const titleAr = validatePlainText(section.title.ar);
      if (titleAr) errors[`tr-sec-${section.id}-title-ar`] = titleAr;

      const bodyEn = validatePlainText(section.body.en);
      if (bodyEn) errors[`tr-sec-${section.id}-body-en`] = bodyEn;
      const bodyAr = validatePlainText(section.body.ar);
      if (bodyAr) errors[`tr-sec-${section.id}-body-ar`] = bodyAr;

      if (Array.isArray(section.points)) {
        for (const pt of section.points) {
          if (!/^[a-z][a-z0-9-]{0,63}$/.test(pt.id) || seenPointIds.has(pt.id)) {
            errors[`tr-pt-${pt.id}-id`] = "cms.err.invalidPointId";
          }
          seenPointIds.add(pt.id);

          const ptEn = validatePlainText(pt.text.en);
          if (ptEn) errors[`tr-pt-${pt.id}-en`] = ptEn;
          const ptAr = validatePlainText(pt.text.ar);
          if (ptAr) errors[`tr-pt-${pt.id}-ar`] = ptAr;
        }
      }
    }
  }

  return errors;
}

/**
 * Validates AirportPastContent draft.
 */
export function validateAirportPastContent(draft: AirportPastContent): Record<string, string> {
  const errors: Record<string, string> = {};

  // SEO fields
  const seoTitleEn = validatePlainText(draft.seo.title.en);
  if (seoTitleEn) errors["seo-title-en"] = seoTitleEn;
  const seoTitleAr = validatePlainText(draft.seo.title.ar);
  if (seoTitleAr) errors["seo-title-ar"] = seoTitleAr;

  const seoDescEn = validatePlainText(draft.seo.description.en);
  if (seoDescEn) errors["seo-desc-en"] = seoDescEn;
  const seoDescAr = validatePlainText(draft.seo.description.ar);
  if (seoDescAr) errors["seo-desc-ar"] = seoDescAr;

  // Intro
  const introTitleEn = validatePlainText(draft.intro.title.en);
  if (introTitleEn) errors["past-intro-title-en"] = introTitleEn;
  const introTitleAr = validatePlainText(draft.intro.title.ar);
  if (introTitleAr) errors["past-intro-title-ar"] = introTitleAr;

  const introDescEn = validatePlainText(draft.intro.description.en);
  if (introDescEn) errors["past-intro-desc-en"] = introDescEn;
  const introDescAr = validatePlainText(draft.intro.description.ar);
  if (introDescAr) errors["past-intro-desc-ar"] = introDescAr;

  const introNoticeEn = validatePlainText(draft.intro.notice.en);
  if (introNoticeEn) errors["past-intro-notice-en"] = introNoticeEn;
  const introNoticeAr = validatePlainText(draft.intro.notice.ar);
  if (introNoticeAr) errors["past-intro-notice-ar"] = introNoticeAr;

  // Timeline (5 entries)
  if (Array.isArray(draft.timeline)) {
    for (const entry of draft.timeline) {
      const periodErr = validatePlainText(entry.period);
      if (periodErr) errors[`past-ch-${entry.id}-period`] = periodErr;

      const titleEn = validatePlainText(entry.title.en);
      if (titleEn) errors[`past-ch-${entry.id}-title-en`] = titleEn;
      const titleAr = validatePlainText(entry.title.ar);
      if (titleAr) errors[`past-ch-${entry.id}-title-ar`] = titleAr;

      const bodyEn = validatePlainText(entry.body.en);
      if (bodyEn) errors[`past-ch-${entry.id}-body-en`] = bodyEn;
      const bodyAr = validatePlainText(entry.body.ar);
      if (bodyAr) errors[`past-ch-${entry.id}-body-ar`] = bodyAr;

      if (entry.evidence === "verified" && (!entry.sourceRefs || entry.sourceRefs.length === 0)) {
        errors[`past-ch-${entry.id}-sourceRefs`] = "cms.err.sourceRefRequired";
      }
      for (const ref of entry.sourceRefs ?? []) {
        if (!SOURCE_REGISTRY[ref]) {
          errors[`past-ch-${entry.id}-sourceRefs`] = "cms.err.invalidSourceRef";
        }
      }
    }
  }

  return errors;
}

/**
 * Validates AirportPresentContent draft.
 */
export function validateAirportPresentContent(draft: AirportPresentContent): Record<string, string> {
  const errors: Record<string, string> = {};

  // SEO fields
  const seoTitleEn = validatePlainText(draft.seo.title.en);
  if (seoTitleEn) errors["seo-title-en"] = seoTitleEn;
  const seoTitleAr = validatePlainText(draft.seo.title.ar);
  if (seoTitleAr) errors["seo-title-ar"] = seoTitleAr;

  const seoDescEn = validatePlainText(draft.seo.description.en);
  if (seoDescEn) errors["seo-desc-en"] = seoDescEn;
  const seoDescAr = validatePlainText(draft.seo.description.ar);
  if (seoDescAr) errors["seo-desc-ar"] = seoDescAr;

  // Intro
  const introTitleEn = validatePlainText(draft.intro.title.en);
  if (introTitleEn) errors["pr-intro-title-en"] = introTitleEn;
  const introTitleAr = validatePlainText(draft.intro.title.ar);
  if (introTitleAr) errors["pr-intro-title-ar"] = introTitleAr;

  const introSubEn = validatePlainText(draft.intro.subtitle.en);
  if (introSubEn) errors["pr-intro-sub-en"] = introSubEn;
  const introSubAr = validatePlainText(draft.intro.subtitle.ar);
  if (introSubAr) errors["pr-intro-sub-ar"] = introSubAr;

  const introNoticeEn = validatePlainText(draft.intro.notice.en);
  if (introNoticeEn) errors["pr-intro-notice-en"] = introNoticeEn;
  const introNoticeAr = validatePlainText(draft.intro.notice.ar);
  if (introNoticeAr) errors["pr-intro-notice-ar"] = introNoticeAr;

  // Facts (4)
  if (Array.isArray(draft.facts)) {
    for (const fact of draft.facts) {
      const lEn = validatePlainText(fact.label.en);
      if (lEn) errors[`pr-fact-${fact.id}-label-en`] = lEn;
      const lAr = validatePlainText(fact.label.ar);
      if (lAr) errors[`pr-fact-${fact.id}-label-ar`] = lAr;

      const vEn = validatePlainText(fact.value.en);
      if (vEn) errors[`pr-fact-${fact.id}-val-en`] = vEn;
      const vAr = validatePlainText(fact.value.ar);
      if (vAr) errors[`pr-fact-${fact.id}-val-ar`] = vAr;

      const dEn = validatePlainText(fact.detail.en);
      if (dEn) errors[`pr-fact-${fact.id}-detail-en`] = dEn;
      const dAr = validatePlainText(fact.detail.ar);
      if (dAr) errors[`pr-fact-${fact.id}-detail-ar`] = dAr;

      if (!fact.sourceRefs || fact.sourceRefs.length === 0) {
        errors[`pr-fact-${fact.id}-sourceRefs`] = "cms.err.sourceRefRequired";
      }
      for (const ref of fact.sourceRefs ?? []) {
        if (!SOURCE_REGISTRY[ref]) {
          errors[`pr-fact-${fact.id}-sourceRefs`] = "cms.err.invalidSourceRef";
        }
      }
    }
  }

  // Dossiers (3)
  if (Array.isArray(draft.dossiers)) {
    for (const dossier of draft.dossiers) {
      const tEn = validatePlainText(dossier.title.en);
      if (tEn) errors[`pr-dossier-${dossier.id}-title-en`] = tEn;
      const tAr = validatePlainText(dossier.title.ar);
      if (tAr) errors[`pr-dossier-${dossier.id}-title-ar`] = tAr;

      if (Array.isArray(dossier.paragraphs)) {
        dossier.paragraphs.forEach((p, idx) => {
          const pEn = validatePlainText(p.en);
          if (pEn) errors[`pr-dossier-${dossier.id}-p-${idx}-en`] = pEn;
          const pAr = validatePlainText(p.ar);
          if (pAr) errors[`pr-dossier-${dossier.id}-p-${idx}-ar`] = pAr;
        });
      }

      if (!dossier.sourceRefs || dossier.sourceRefs.length === 0) {
        errors[`pr-dossier-${dossier.id}-sourceRefs`] = "cms.err.sourceRefRequired";
      }
      for (const ref of dossier.sourceRefs ?? []) {
        if (!SOURCE_REGISTRY[ref]) {
          errors[`pr-dossier-${dossier.id}-sourceRefs`] = "cms.err.invalidSourceRef";
        }
      }
    }
  }

  // Spatial
  if (draft.spatial) {
    const spTitleEn = validatePlainText(draft.spatial.title.en);
    if (spTitleEn) errors["pr-spatial-title-en"] = spTitleEn;
    const spTitleAr = validatePlainText(draft.spatial.title.ar);
    if (spTitleAr) errors["pr-spatial-title-ar"] = spTitleAr;

    const spDescEn = validatePlainText(draft.spatial.description.en);
    if (spDescEn) errors["pr-spatial-desc-en"] = spDescEn;
    const spDescAr = validatePlainText(draft.spatial.description.ar);
    if (spDescAr) errors["pr-spatial-desc-ar"] = spDescAr;

    const spRuleTEn = validatePlainText(draft.spatial.evidentiaryRuleTitle.en);
    if (spRuleTEn) errors["pr-spatial-rule-title-en"] = spRuleTEn;
    const spRuleTAr = validatePlainText(draft.spatial.evidentiaryRuleTitle.ar);
    if (spRuleTAr) errors["pr-spatial-rule-title-ar"] = spRuleTAr;

    const spRuleBEn = validatePlainText(draft.spatial.evidentiaryRuleBody.en);
    if (spRuleBEn) errors["pr-spatial-rule-body-en"] = spRuleBEn;
    const spRuleBAr = validatePlainText(draft.spatial.evidentiaryRuleBody.ar);
    if (spRuleBAr) errors["pr-spatial-rule-body-ar"] = spRuleBAr;

    if (!draft.spatial.sourceRefs || draft.spatial.sourceRefs.length === 0) {
      errors["pr-spatial-sourceRefs"] = "cms.err.sourceRefRequired";
    }
    for (const ref of draft.spatial.sourceRefs ?? []) {
      if (!SOURCE_REGISTRY[ref]) {
        errors["pr-spatial-sourceRefs"] = "cms.err.invalidSourceRef";
      }
    }
  }

  // Global Horizons
  if (draft.globalHorizons) {
    const ghEyeEn = validatePlainText(draft.globalHorizons.eyebrow.en);
    if (ghEyeEn) errors["pr-gh-eyebrow-en"] = ghEyeEn;
    const ghEyeAr = validatePlainText(draft.globalHorizons.eyebrow.ar);
    if (ghEyeAr) errors["pr-gh-eyebrow-ar"] = ghEyeAr;

    const ghTitleEn = validatePlainText(draft.globalHorizons.title.en);
    if (ghTitleEn) errors["pr-gh-title-en"] = ghTitleEn;
    const ghTitleAr = validatePlainText(draft.globalHorizons.title.ar);
    if (ghTitleAr) errors["pr-gh-title-ar"] = ghTitleAr;

    const ghDescEn = validatePlainText(draft.globalHorizons.description.en);
    if (ghDescEn) errors["pr-gh-desc-en"] = ghDescEn;
    const ghDescAr = validatePlainText(draft.globalHorizons.description.ar);
    if (ghDescAr) errors["pr-gh-desc-ar"] = ghDescAr;
  }

  return errors;
}

/**
 * Validates AirportFutureContent draft.
 */
export function validateAirportFutureContent(draft: AirportFutureContent): Record<string, string> {
  const errors: Record<string, string> = {};

  // SEO fields
  const seoTitleEn = validatePlainText(draft.seo.title.en);
  if (seoTitleEn) errors["seo-title-en"] = seoTitleEn;
  const seoTitleAr = validatePlainText(draft.seo.title.ar);
  if (seoTitleAr) errors["seo-title-ar"] = seoTitleAr;

  const seoDescEn = validatePlainText(draft.seo.description.en);
  if (seoDescEn) errors["seo-desc-en"] = seoDescEn;
  const seoDescAr = validatePlainText(draft.seo.description.ar);
  if (seoDescAr) errors["seo-desc-ar"] = seoDescAr;

  // Copy fields (all 11 keys)
  if (draft.copy) {
    for (const [key, loc] of Object.entries(draft.copy)) {
      const errEn = validatePlainText(loc?.en);
      if (errEn) errors[`future-copy-${key}-en`] = errEn;
      const errAr = validatePlainText(loc?.ar);
      if (errAr) errors[`future-copy-${key}-ar`] = errAr;
    }
  }

  return errors;
}

/**
 * Validates DestinationsEditorialContent draft.
 */
export function validateDestinationsEditorialContent(draft: DestinationsEditorialContent): Record<string, string> {
  const errors: Record<string, string> = {};

  // Document SEO
  const seoTitleEn = validatePlainText(draft.seo.title.en);
  if (seoTitleEn) errors["seo-title-en"] = seoTitleEn;
  const seoTitleAr = validatePlainText(draft.seo.title.ar);
  if (seoTitleAr) errors["seo-title-ar"] = seoTitleAr;

  const seoDescEn = validatePlainText(draft.seo.description.en);
  if (seoDescEn) errors["seo-desc-en"] = seoDescEn;
  const seoDescAr = validatePlainText(draft.seo.description.ar);
  if (seoDescAr) errors["seo-desc-ar"] = seoDescAr;

  // 7 destinations
  if (Array.isArray(draft.destinations)) {
    for (const dest of draft.destinations) {
      const dSeoTitleEn = validatePlainText(dest.seo.title.en);
      if (dSeoTitleEn) errors[`dst-ed-${dest.code}-seo-title-en`] = dSeoTitleEn;
      const dSeoTitleAr = validatePlainText(dest.seo.title.ar);
      if (dSeoTitleAr) errors[`dst-ed-${dest.code}-seo-title-ar`] = dSeoTitleAr;

      const dSeoDescEn = validatePlainText(dest.seo.description.en);
      if (dSeoDescEn) errors[`dst-ed-${dest.code}-seo-desc-en`] = dSeoDescEn;
      const dSeoDescAr = validatePlainText(dest.seo.description.ar);
      if (dSeoDescAr) errors[`dst-ed-${dest.code}-seo-desc-ar`] = dSeoDescAr;

      const blurbEn = validatePlainText(dest.blurb.en);
      if (blurbEn) errors[`dst-ed-${dest.code}-blurb-en`] = blurbEn;
      const blurbAr = validatePlainText(dest.blurb.ar);
      if (blurbAr) errors[`dst-ed-${dest.code}-blurb-ar`] = blurbAr;

      const seenPointIds = new Set<string>();
      if (Array.isArray(dest.goodToKnow)) {
        for (const pt of dest.goodToKnow) {
          if (!/^[a-z][a-z0-9-]{0,63}$/.test(pt.id) || seenPointIds.has(pt.id)) {
            errors[`dst-ed-${dest.code}-pt-${pt.id}-id`] = "cms.err.invalidPointId";
          }
          seenPointIds.add(pt.id);

          const ptEn = validatePlainText(pt.text.en);
          if (ptEn) errors[`dst-ed-${dest.code}-pt-${pt.id}-en`] = ptEn;
          const ptAr = validatePlainText(pt.text.ar);
          if (ptAr) errors[`dst-ed-${dest.code}-pt-${pt.id}-ar`] = ptAr;
        }
      }
    }
  }

  return errors;
}

/**
 * Validates DestinationsPresentationContent draft.
 */
export function validateDestinationsPresentationContent(draft: DestinationsPresentationContent): Record<string, string> {
  const errors: Record<string, string> = {};

  if (Array.isArray(draft.assignments)) {
    for (const a of draft.assignments) {
      if (a.focalPoint) {
        if (a.focalPoint.x < 0 || a.focalPoint.x > 100 || a.focalPoint.y < 0 || a.focalPoint.y > 100) {
          errors[`dst-pres-${a.code}-focal`] = "cms.err.invalidFocalPoint";
        }
      }
    }
  }

  return errors;
}

/**
 * Validates InformationalPagesContent draft.
 */
export function validateInformationPagesContent(draft: InformationalPagesContent): Record<string, string> {
  const errors: Record<string, string> = {};

  // Document SEO
  const seoTitleEn = validatePlainText(draft.seo.title.en);
  if (seoTitleEn) errors["seo-title-en"] = seoTitleEn;
  const seoTitleAr = validatePlainText(draft.seo.title.ar);
  if (seoTitleAr) errors["seo-title-ar"] = seoTitleAr;

  const seoDescEn = validatePlainText(draft.seo.description.en);
  if (seoDescEn) errors["seo-desc-en"] = seoDescEn;
  const seoDescAr = validatePlainText(draft.seo.description.ar);
  if (seoDescAr) errors["seo-desc-ar"] = seoDescAr;

  // 4 pages
  const seenBlockIds = new Set<string>();
  if (Array.isArray(draft.pages)) {
    for (const page of draft.pages) {
      const pTitleEn = validatePlainText(page.title.en);
      if (pTitleEn) errors[`pg-${page.id}-title-en`] = pTitleEn;
      const pTitleAr = validatePlainText(page.title.ar);
      if (pTitleAr) errors[`pg-${page.id}-title-ar`] = pTitleAr;

      const pDescEn = validatePlainText(page.description.en);
      if (pDescEn) errors[`pg-${page.id}-desc-en`] = pDescEn;
      const pDescAr = validatePlainText(page.description.ar);
      if (pDescAr) errors[`pg-${page.id}-desc-ar`] = pDescAr;

      const pSeoTitleEn = validatePlainText(page.seo.title.en);
      if (pSeoTitleEn) errors[`pg-${page.id}-seo-title-en`] = pSeoTitleEn;
      const pSeoTitleAr = validatePlainText(page.seo.title.ar);
      if (pSeoTitleAr) errors[`pg-${page.id}-seo-title-ar`] = pSeoTitleAr;

      const pSeoDescEn = validatePlainText(page.seo.description.en);
      if (pSeoDescEn) errors[`pg-${page.id}-seo-desc-en`] = pSeoDescEn;
      const pSeoDescAr = validatePlainText(page.seo.description.ar);
      if (pSeoDescAr) errors[`pg-${page.id}-seo-desc-ar`] = pSeoDescAr;

      if (Array.isArray(page.blocks)) {
        for (const block of page.blocks) {
          if (!/^[a-z][a-z0-9-]{0,63}$/.test(block.id) || seenBlockIds.has(block.id)) {
            errors[`pg-${page.id}-blk-${block.id}-id`] = "cms.err.invalidBlockId";
          }
          seenBlockIds.add(block.id);

          const bTitleEn = validatePlainText(block.title.en);
          if (bTitleEn) errors[`pg-${page.id}-blk-${block.id}-title-en`] = bTitleEn;
          const bTitleAr = validatePlainText(block.title.ar);
          if (bTitleAr) errors[`pg-${page.id}-blk-${block.id}-title-ar`] = bTitleAr;

          if (Array.isArray(block.paragraphs)) {
            block.paragraphs.forEach((p, idx) => {
              const paraEn = validatePlainText(p.en);
              if (paraEn) errors[`pg-${page.id}-blk-${block.id}-p-${idx}-en`] = paraEn;
              const paraAr = validatePlainText(p.ar);
              if (paraAr) errors[`pg-${page.id}-blk-${block.id}-p-${idx}-ar`] = paraAr;
            });
          }
        }
      }
    }
  }

  return errors;
}

/**
 * Focuses the first invalid field matching active edit locale or first error found.
 */
export function focusFirstInvalidField(
  errors: Record<string, string>,
  activeLang?: "en" | "ar",
): string | null {
  const errorKeys = Object.keys(errors);
  if (errorKeys.length === 0) return null;

  const sortedKeys = activeLang
    ? [...errorKeys].sort((a, b) => {
        const aMatches = a.endsWith(`-${activeLang}`);
        const bMatches = b.endsWith(`-${activeLang}`);
        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
        return 0;
      })
    : errorKeys;

  for (const key of sortedKeys) {
    if (typeof document !== "undefined") {
      const el = document.getElementById(key);
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return key;
      }
    }
  }
  return sortedKeys[0] ?? null;
}
