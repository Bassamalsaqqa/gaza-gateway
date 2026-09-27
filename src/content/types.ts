import type { ApprovedMediaId } from "../lib/media-policy.ts";

export type LocalizedText = { en: string; ar: string };
export type ContentKey = "home" | "travel" | "airport.past";
export type EvidenceState = "verified" | "provisional" | "placeholder";
export type MediaReference =
  | { kind: "media"; id: ApprovedMediaId }
  | { kind: "placeholder-seed"; seed: string };

export interface PageSeoContent {
  title: LocalizedText;
  description: LocalizedText;
  socialTitle?: LocalizedText;
  socialDescription?: LocalizedText;
  socialMediaId?: ApprovedMediaId;
}

interface ContentEnvelope<K extends ContentKey> {
  id: K;
  kind: K;
  schemaVersion: 1;
  seo: PageSeoContent;
}

export type HomeCopyKey =
  | "h1" | "sub" | "heritageSpotlightTitle" | "heritageSpotlightDesc"
  | "past" | "pastSub" | "present" | "presentSub" | "future" | "futureSub"
  | "destTitle" | "destSub" | "manageTitle" | "manageSub" | "infoTitle"
  | "archiveTitle" | "archiveSub";

export type HomeSectionId = "hero" | "search" | "board" | "heritage" | "destinations" | "manage" | "travel" | "archive";
export interface HomeSection {
  id: HomeSectionId;
  visible: boolean;
}
export interface HomeContent extends ContentEnvelope<"home"> {
  copy: Record<HomeCopyKey, LocalizedText>;
  sections: HomeSection[];
}

export interface TravelPoint { id: string; text: LocalizedText; visible: boolean }
export interface TravelGuideSection {
  id: string;
  visible: boolean;
  title: LocalizedText;
  body: LocalizedText;
  points: TravelPoint[];
}
export interface TravelContent extends ContentEnvelope<"travel"> {
  intro: { title: LocalizedText; description: LocalizedText };
  sections: TravelGuideSection[];
}

export interface HistoricalTimelineEntry {
  id: string;
  visible: boolean;
  period: string;
  title: LocalizedText;
  body: LocalizedText;
  media: MediaReference;
  evidence: EvidenceState;
  sourceRefs: string[];
}
export interface AirportPastContent extends ContentEnvelope<"airport.past"> {
  intro: { title: LocalizedText; description: LocalizedText; notice: LocalizedText };
  timeline: HistoricalTimelineEntry[];
}

export interface ContentMap {
  home: HomeContent;
  travel: TravelContent;
  "airport.past": AirportPastContent;
}
export type ContentDocument = ContentMap[ContentKey];

export const HOME_SECTION_POLICY: Record<HomeSectionId, { required: boolean; hideable: boolean; reorderable: boolean }> = {
  hero: { required: true, hideable: false, reorderable: false },
  search: { required: true, hideable: false, reorderable: false },
  board: { required: true, hideable: false, reorderable: false },
  heritage: { required: false, hideable: true, reorderable: true },
  destinations: { required: false, hideable: true, reorderable: true },
  manage: { required: false, hideable: true, reorderable: true },
  travel: { required: false, hideable: true, reorderable: true },
  archive: { required: false, hideable: true, reorderable: true },
};
