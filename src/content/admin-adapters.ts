/** Transitional view shapes for existing Admin CMS panels. Published documents remain authoritative. */
import { publishedHome } from "./published/home.ts";
import { publishedAirportPast } from "./published/airport-past.ts";
import type { LocalizedText } from "./types.ts";

const blank: LocalizedText = { en: "", ar: "" };
const visible = (id: string) => publishedHome.sections.find((section) => section.id === id)?.visible ?? false;

export const homeSections = [
  { id: "hero", labelKey: "a2.web.hp.hero", heading: publishedHome.copy.h1, body: publishedHome.copy.sub, visible: visible("hero") },
  { id: "heritage", labelKey: "a2.web.hp.story", heading: publishedHome.copy.heritageSpotlightTitle, body: publishedHome.copy.heritageSpotlightDesc, visible: visible("heritage") },
  { id: "destinations", labelKey: "a2.web.hp.featured", heading: publishedHome.copy.destTitle, body: publishedHome.copy.destSub, visible: visible("destinations") },
  { id: "manage", labelKey: "a2.web.hp.manage", heading: publishedHome.copy.manageTitle, body: publishedHome.copy.manageSub, visible: visible("manage") },
  { id: "travel", labelKey: "a2.web.hp.shortcuts", heading: publishedHome.copy.infoTitle, body: blank, visible: visible("travel") },
  { id: "archive", labelKey: "a2.web.hp.archive", heading: publishedHome.copy.archiveTitle, body: publishedHome.copy.archiveSub, visible: visible("archive") },
];

export type AdminPastEntry = {
  id: string;
  period: string;
  title: LocalizedText;
  narrative: LocalizedText;
  media: string;
  verification: "verified" | "pending" | "unsourced";
  state: "published";
};

export const timelineEntries: AdminPastEntry[] = publishedAirportPast.timeline.map((entry) => ({
  id: entry.id,
  period: entry.period,
  title: entry.title,
  narrative: entry.body,
  media: entry.media.seed,
  verification: entry.evidence === "verified" ? "verified" : "unsourced",
  state: "published",
}));
