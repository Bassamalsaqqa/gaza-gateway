import { z } from "zod";
import { isApprovedMediaId, APPROVED_MEDIA_CATALOG } from "../lib/media-policy.ts";
import { SOURCE_REGISTRY } from "../lib/archive/sources.ts";
import { HOME_SECTION_POLICY, type ContentDocument, type ContentKey, type HomeCopyKey, type LocalizedText } from "./types.ts";

const HOME_COPY_KEYS: HomeCopyKey[] = [
  "h1", "sub", "heritageSpotlightTitle", "heritageSpotlightDesc", "past", "pastSub",
  "present", "presentSub", "future", "futureSub", "destTitle", "destSub",
  "manageTitle", "manageSub", "infoTitle", "archiveTitle", "archiveSub",
];
const TRAVEL_IDS = ["prepare", "documents", "baggage", "airport", "accessibility"];
const PAST_IDS = ["planning", "opening", "operations", "closure", "memory"];
const PLACEHOLDER_SEEDS = [
  "construction-site-archive", "opening-ceremony-archive", "terminal-departures-archive",
  "damaged-runway-archive", "oral-history-archive",
];
const unique = (values: string[]) => new Set(values).size === values.length;
const plainText = z.string().min(1).max(5000).refine(
  (value) => value.trim().length > 0 && !/<\s*\/?\s*[a-z][^>]*>/i.test(value) && !/javascript:|data:text\/html/i.test(value),
);
const localized = z.object({ en: plainText, ar: plainText }).strict();
const slug = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const approvedMedia = z.string().refine(isApprovedMediaId);
const seo = z.object({
  title: localized,
  description: localized,
  socialTitle: localized.optional(),
  socialDescription: localized.optional(),
  socialMediaId: approvedMedia.optional(),
}).strict();
const envelope = { schemaVersion: z.literal(1), seo };
const homeSection = z.object({
  id: z.enum(["hero", "search", "board", "heritage", "destinations", "manage", "travel", "archive"]),
  visible: z.boolean(),
}).strict().refine((section) => !HOME_SECTION_POLICY[section.id].required || section.visible);
const homeCopy = z.object(Object.fromEntries(HOME_COPY_KEYS.map((key) => [key, localized])) as Record<HomeCopyKey, typeof localized>).strict();
const home = z.object({
  ...envelope, id: z.literal("home"), kind: z.literal("home"),
  copy: homeCopy, sections: z.array(homeSection).length(8),
}).strict().refine((doc) => unique(doc.sections.map((s) => s.id)) &&
  ["hero", "search", "board"].every((id, index) => doc.sections[index]?.id === id));
const point = z.object({ id: slug, visible: z.boolean(), text: localized }).strict();
const travelSection = z.object({
  id: z.enum(["prepare", "documents", "baggage", "airport", "accessibility"]),
  visible: z.boolean(), title: localized, body: localized, points: z.array(point),
}).strict();
const travel = z.object({
  ...envelope, id: z.literal("travel"), kind: z.literal("travel"),
  intro: z.object({ title: localized, description: localized }).strict(),
  sections: z.array(travelSection).length(TRAVEL_IDS.length),
}).strict().refine((doc) => unique(doc.sections.map((s) => s.id)) &&
  unique(doc.sections.flatMap((s) => s.points.map((p) => p.id))));
const documentaryMedia = z.string().refine(
  (id) => isApprovedMediaId(id) && APPROVED_MEDIA_CATALOG[id] === "historical-documentary",
  { message: "Timeline media must be an approved historical-documentary asset" },
);

const timelineMedia = z.union([
  z.object({ kind: z.literal("media"), id: documentaryMedia }).strict(),
  z.object({ kind: z.literal("placeholder-seed"), seed: z.enum(PLACEHOLDER_SEEDS as [string, ...string[]]) }).strict().refine(() => false),
]);

const timelineEntry = z.object({
  id: z.enum(["planning", "opening", "operations", "closure", "memory"]),
  visible: z.boolean(),
  period: plainText,
  title: localized,
  body: localized,
  media: timelineMedia.optional(),
  evidence: z.enum(["verified", "provisional", "placeholder"]),
  sourceRefs: z.array(slug),
}).strict().superRefine((entry, ctx) => {
  if (entry.evidence === "verified" && entry.sourceRefs.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Verified timeline entry "${entry.id}" must cite at least one sourceRef`,
      path: ["sourceRefs"],
    });
  }
});

const past = z.object({
  ...envelope,
  id: z.literal("airport.past"),
  kind: z.literal("airport.past"),
  intro: z.object({ title: localized, description: localized, notice: localized }).strict(),
  timeline: z.array(timelineEntry).length(PAST_IDS.length),
}).strict().superRefine((doc, ctx) => {
  if (!unique(doc.timeline.map((entry) => entry.id))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate timeline entry ID" });
  }
  const allRefs = doc.timeline.flatMap((entry) => entry.sourceRefs);
  for (const ref of allRefs) {
    if (!SOURCE_REGISTRY[ref]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unresolved sourceRef: ${ref}`,
      });
    }
  }
});

const presentFact = z.object({
  id: z.string(),
  label: localized,
  value: localized,
  detail: localized,
  sourceRefs: z.array(slug).min(1),
}).strict();

const presentDossier = z.object({
  id: z.string(),
  title: localized,
  paragraphs: z.array(localized).min(1),
  sourceRefs: z.array(slug).min(1),
}).strict();

const presentSpatial = z.object({
  title: localized,
  description: localized,
  evidentiaryRuleTitle: localized,
  evidentiaryRuleBody: localized,
  sourceRefs: z.array(slug).min(1),
}).strict();

const presentGlobalHorizons = z.object({
  eyebrow: localized,
  title: localized,
  description: localized,
}).strict();

const present = z.object({
  ...envelope,
  id: z.literal("airport.present"),
  kind: z.literal("airport.present"),
  intro: z.object({
    title: localized,
    subtitle: localized,
    notice: localized,
  }).strict(),
  facts: z.array(presentFact).length(4),
  dossiers: z.array(presentDossier).length(3),
  spatial: presentSpatial,
  globalHorizons: presentGlobalHorizons,
}).strict().superRefine((doc, ctx) => {
  if (!unique(doc.facts.map((f) => f.id))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate fact ID" });
  }
  if (!unique(doc.dossiers.map((d) => d.id))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate dossier ID" });
  }
  const allRefs = [
    ...doc.facts.flatMap((f) => f.sourceRefs),
    ...doc.dossiers.flatMap((d) => d.sourceRefs),
    ...doc.spatial.sourceRefs,
  ];
  for (const ref of allRefs) {
    if (!SOURCE_REGISTRY[ref]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unresolved sourceRef: ${ref}`,
      });
    }
  }
});

const destinationCode = z.enum(["AMM", "CAI", "DOH", "DXB", "IST", "JED", "RUH"]);
const destinationPhotoId = z.enum([
  "city-amman",
  "city-cairo",
  "city-doha",
  "city-dubai",
  "city-istanbul",
  "city-jeddah",
  "city-riyadh",
]);
const focalPoint = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
}).strict();
const destinationAssignment = z.object({
  code: destinationCode,
  photoId: destinationPhotoId,
  focalPoint: focalPoint.optional(),
}).strict();
const destinationsPresentation = z.object({
  ...envelope,
  id: z.literal("destinations.presentation"),
  kind: z.literal("destinations.presentation"),
  assignments: z.array(destinationAssignment).length(7),
}).strict().refine(
  (doc) =>
    unique(doc.assignments.map((a) => a.code)) &&
    ["AMM", "CAI", "DOH", "DXB", "IST", "JED", "RUH"].every((code) =>
      doc.assignments.some((a) => a.code === code)
    ),
);

const future = z.object({
  id: z.literal("airport.future"), kind: z.literal("airport.future"), schemaVersion: z.literal(1), seo,
  copy: z.object({
    title: localized, subtitle: localized, notice: localized,
    terminalTitle: localized, terminalBody: localized, hospitalityTitle: localized, hospitalityBody: localized,
    masterplanTitle: localized, masterplanBody: localized, networkTitle: localized, networkBody: localized,
  }).strict(),
}).strict();

const destinationCodes = ["AMM", "CAI", "DOH", "DXB", "IST", "JED", "RUH"] as const;
const editorialDestination = z.object({
  code: z.enum(destinationCodes), seo, blurb: localized,
  goodToKnow: z.array(z.object({ id: slug, text: localized, visible: z.boolean() }).strict()).max(50),
}).strict();
const destinationsEditorial = z.object({
  id: z.literal("destinations.editorial"), kind: z.literal("destinations.editorial"), schemaVersion: z.literal(1), seo,
  destinations: z.array(editorialDestination).length(7),
}).strict().superRefine((doc, ctx) => {
  if (new Set(doc.destinations.map((entry) => entry.code)).size !== 7) {
    ctx.addIssue({ code: "custom", path: ["destinations"], message: "Destination codes must be unique" });
  }
  const ids = doc.destinations.flatMap((entry) => entry.goodToKnow.map((point) => point.id));
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["destinations"], message: "Point IDs must be unique" });
});

const informationPage = z.object({
  id: z.enum(["about", "contact", "privacy", "terms"]), seo, title: localized, description: localized,
  blocks: z.array(z.object({
    id: slug, visible: z.boolean(), title: localized, paragraphs: z.array(localized).min(1).max(50),
  }).strict()).max(40),
}).strict();
const informationPages = z.object({
  id: z.literal("pages.information"), kind: z.literal("pages.information"), schemaVersion: z.literal(1), seo,
  pages: z.array(informationPage).length(4),
}).strict().superRefine((doc, ctx) => {
  if (new Set(doc.pages.map((page) => page.id)).size !== 4) ctx.addIssue({ code: "custom", path: ["pages"], message: "Page IDs must be unique" });
  const ids = doc.pages.flatMap((page) => page.blocks.map((block) => block.id));
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["pages"], message: "Block IDs must be unique" });
});

export function isContentKey(value: unknown): value is ContentKey {
  return (
    value === "home" ||
    value === "travel" ||
    value === "airport.past" ||
    value === "airport.present" ||
    value === "destinations.presentation" || value === "airport.future" ||
    value === "destinations.editorial" || value === "pages.information"
  );
}
export function isValidContent(key: ContentKey, value: unknown): value is ContentDocument {
  return contentValidationIssues(key, value).length === 0;
}

/** Field paths are structural; the editor translates issue codes for its own locale. */
export function contentValidationIssues(key: ContentKey, value: unknown) {
  if (!isContentKey(key)) return [{ path: "", code: "custom" }];
  const schema = key === "home" ? home : key === "travel" ? travel :
    key === "airport.past" ? past : key === "airport.present" ? present :
    key === "airport.future" ? future : key === "destinations.editorial" ? destinationsEditorial :
    key === "pages.information" ? informationPages : destinationsPresentation;
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => ({
    path: issue.path.map(String).join("."), code: issue.code,
  }));
}
export function contentHealth(value: ContentDocument) {
  if (value.kind === "airport.future" || value.kind === "destinations.editorial" || value.kind === "pages.information") {
    const texts = value.kind === "airport.future" ? Object.values(value.copy) :
      value.kind === "destinations.editorial" ? value.destinations.flatMap((entry) => [entry.blurb, ...entry.goodToKnow.map((point) => point.text), entry.seo.title, entry.seo.description]) :
      value.pages.flatMap((page) => [page.title, page.description, page.seo.title, page.seo.description,
        ...page.blocks.flatMap((block) => [block.title, ...block.paragraphs])]);
    return { hasEnglish: texts.every((text) => text.en.trim().length > 0),
      hasArabic: texts.every((text) => text.ar.trim().length > 0), missingSource: false };
  }
  if (value.kind === "destinations.presentation") {
    return {
      hasEnglish: true,
      hasArabic: true,
      missingSource: false,
    };
  }
  if (value.kind === "airport.present") {
    const texts: LocalizedText[] = [
      value.intro.title,
      value.intro.subtitle,
      value.intro.notice,
      ...value.facts.flatMap((f) => [f.label, f.value, f.detail]),
      ...value.dossiers.flatMap((d) => [d.title, ...d.paragraphs]),
      value.spatial.title,
      value.spatial.description,
      value.spatial.evidentiaryRuleTitle,
      value.spatial.evidentiaryRuleBody,
      value.globalHorizons.eyebrow,
      value.globalHorizons.title,
      value.globalHorizons.description,
    ];
    return {
      hasEnglish: texts.every((item) => item.en.trim().length > 0),
      hasArabic: texts.every((item) => item.ar.trim().length > 0),
      missingSource:
        value.facts.some((f) => f.sourceRefs.length === 0) ||
        value.dossiers.some((d) => d.sourceRefs.length === 0) ||
        value.spatial.sourceRefs.length === 0,
    };
  }
  const texts: LocalizedText[] = value.kind === "home" ? Object.values(value.copy) :
    value.kind === "travel" ? value.sections.flatMap((section) => [section.title, section.body, ...section.points.map((point) => point.text)]) :
      value.timeline.flatMap((entry) => [entry.title, entry.body]);
  return {
    hasEnglish: texts.every((item) => item.en.trim().length > 0),
    hasArabic: texts.every((item) => item.ar.trim().length > 0),
    missingSource: value.kind === "airport.past" && value.timeline.some((entry) => entry.sourceRefs.length === 0),
  };
}
