import type { ApprovedMediaId } from "../lib/media-policy.ts";

export type LocalizedText = { en: string; ar: string };
export type ContentKey = "home" | "travel" | "airport.past" | "airport.present" | "airport.future" |
  "destinations.presentation" | "destinations.editorial" | "pages.information";
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
  media?: MediaReference;
  evidence: EvidenceState;
  sourceRefs: string[];
}
export interface AirportPastContent extends ContentEnvelope<"airport.past"> {
  intro: { title: LocalizedText; description: LocalizedText; notice: LocalizedText };
  timeline: HistoricalTimelineEntry[];
}

export interface AirportPresentFact {
  id: string;
  label: LocalizedText;
  value: LocalizedText;
  detail: LocalizedText;
  sourceRefs: string[];
}

export interface AirportPresentDossier {
  id: string;
  title: LocalizedText;
  paragraphs: LocalizedText[];
  sourceRefs: string[];
}

export interface AirportPresentSpatial {
  title: LocalizedText;
  description: LocalizedText;
  evidentiaryRuleTitle: LocalizedText;
  evidentiaryRuleBody: LocalizedText;
  sourceRefs: string[];
}

export interface AirportPresentGlobalHorizons {
  eyebrow: LocalizedText;
  title: LocalizedText;
  description: LocalizedText;
}

export interface AirportPresentContent extends ContentEnvelope<"airport.present"> {
  intro: {
    title: LocalizedText;
    subtitle: LocalizedText;
    notice: LocalizedText;
  };
  facts: AirportPresentFact[];
  dossiers: AirportPresentDossier[];
  spatial: AirportPresentSpatial;
  globalHorizons: AirportPresentGlobalHorizons;
}

export interface DestinationPhotoAssignment {
  code: "AMM" | "CAI" | "DOH" | "DXB" | "IST" | "JED" | "RUH";
  photoId: "city-amman" | "city-cairo" | "city-doha" | "city-dubai" | "city-istanbul" | "city-jeddah" | "city-riyadh";
  focalPoint?: { x: number; y: number };
}

export interface DestinationsPresentationContent extends ContentEnvelope<"destinations.presentation"> {
  assignments: DestinationPhotoAssignment[];
}

/** Illustrative disclosure and image truth classes remain immutable media/UI authority. */
export type FutureCopyKey = "title" | "subtitle" | "notice" | "terminalTitle" | "terminalBody" |
  "hospitalityTitle" | "hospitalityBody" | "masterplanTitle" | "masterplanBody" | "networkTitle" | "networkBody";
export interface AirportFutureContent extends ContentEnvelope<"airport.future"> {
  copy: Record<FutureCopyKey, LocalizedText>;
}

export interface DestinationEditorialEntry {
  code: DestinationPhotoAssignment["code"];
  seo: PageSeoContent;
  blurb: LocalizedText;
  goodToKnow: TravelPoint[];
}
/** Editorial only: price, frequency, route availability, duration and equipment are excluded. */
export interface DestinationsEditorialContent extends ContentEnvelope<"destinations.editorial"> {
  destinations: DestinationEditorialEntry[];
}

export type InformationalPageId = "about" | "contact" | "privacy" | "terms";
export interface InformationalPageBlock {
  id: string;
  visible: boolean;
  title: LocalizedText;
  paragraphs: LocalizedText[];
}
export interface InformationalPageContent {
  id: InformationalPageId;
  seo: PageSeoContent;
  title: LocalizedText;
  description: LocalizedText;
  blocks: InformationalPageBlock[];
}
export interface InformationalPagesContent extends ContentEnvelope<"pages.information"> {
  pages: InformationalPageContent[];
}

export interface ContentMap {
  home: HomeContent;
  travel: TravelContent;
  "airport.past": AirportPastContent;
  "airport.present": AirportPresentContent;
  "airport.future": AirportFutureContent;
  "destinations.presentation": DestinationsPresentationContent;
  "destinations.editorial": DestinationsEditorialContent;
  "pages.information": InformationalPagesContent;
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
