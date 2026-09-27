import { z } from "zod";
import { isApprovedMediaId } from "../lib/media-policy.ts";
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
  (value) => !/<\s*\/?\s*[a-z][^>]*>/i.test(value) && !/javascript:|data:text\/html/i.test(value),
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
const media = z.union([
  z.object({ kind: z.literal("placeholder-seed"), seed: z.enum(PLACEHOLDER_SEEDS as [string, ...string[]]) }).strict(),
  // The current approved catalog has only brand marks and future concepts.
  // Documentary historical assets require a later owner-approved catalog entry.
  z.object({ kind: z.literal("media"), id: approvedMedia }).strict().refine(() => false),
]);
const timelineEntry = z.object({
  id: z.enum(["planning", "opening", "operations", "closure", "memory"]),
  visible: z.boolean(), period: plainText, title: localized, body: localized, media,
  evidence: z.enum(["verified", "provisional", "placeholder"]),
  sourceRefs: z.array(slug),
}).strict();
const past = z.object({
  ...envelope, id: z.literal("airport.past"), kind: z.literal("airport.past"),
  intro: z.object({ title: localized, description: localized, notice: localized }).strict(),
  timeline: z.array(timelineEntry).length(PAST_IDS.length),
}).strict().refine((doc) => unique(doc.timeline.map((entry) => entry.id)));

export function isContentKey(value: unknown): value is ContentKey {
  return value === "home" || value === "travel" || value === "airport.past";
}
export function isValidContent(key: ContentKey, value: unknown): value is ContentDocument {
  if (key === "home") return home.safeParse(value).success;
  if (key === "travel") return travel.safeParse(value).success;
  return past.safeParse(value).success;
}
export function contentHealth(value: ContentDocument) {
  const texts: LocalizedText[] = value.kind === "home" ? Object.values(value.copy) :
    value.kind === "travel" ? value.sections.flatMap((section) => [section.title, section.body, ...section.points.map((point) => point.text)]) :
      value.timeline.flatMap((entry) => [entry.title, entry.body]);
  return {
    hasEnglish: texts.every((item) => item.en.trim().length > 0),
    hasArabic: texts.every((item) => item.ar.trim().length > 0),
    missingSource: value.kind === "airport.past" && value.timeline.some((entry) => entry.sourceRefs.length === 0),
  };
}
