import type { ContentRepository } from "./repository.ts";
import type { ContentDocument, ContentKey, LocalizedText } from "./types.ts";
import { contentHealth } from "./schema.ts";

export const CONTENT_DOCUMENT_KEYS = ["home", "travel", "airport.past", "airport.present", "airport.future", "destinations.presentation", "destinations.editorial", "pages.information"] as const satisfies readonly ContentKey[];
type EditorTarget = { to: string; params?: Record<string, string>; search?: Record<string, string> };
export type ContentInventoryItem = EditorTarget & {
  id: string; key: ContentKey; title: LocalizedText; module: string;
  state: "draft" | "published"; draftUnavailable: boolean; missingAr: boolean; missingSource: boolean;
};
export type ContentSearchEntry = ContentInventoryItem & { searchText: string };
export type ContentInventory = { documents: ContentInventoryItem[]; entities: ContentSearchEntry[]; unavailable: ContentKey[] };

function editorTarget(key: ContentKey): EditorTarget {
  if (key.startsWith("airport.")) return { to: "/admin/airport", search: { tab: key.slice("airport.".length) } };
  if (key.startsWith("destinations.")) return { to: "/admin/destinations" };
  return { to: "/admin/website", search: { tab: key === "home" ? "homepage" : key === "travel" ? "travel" : "pages" } };
}

function localizedSearchText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  if ("en" in value && "ar" in value && typeof value.en === "string" && typeof value.ar === "string") return `${value.en} ${value.ar}`;
  return Object.values(value).map(localizedSearchText).join(" ");
}

function titleOf(doc: ContentDocument): LocalizedText {
  if (doc.kind === "home") return doc.copy.h1;
  if (doc.kind === "airport.future") return doc.copy.title;
  if (doc.kind === "travel" || doc.kind === "airport.past" || doc.kind === "airport.present") return doc.intro.title;
  return doc.seo.title;
}

/** Published documents stay discoverable during a local-draft failure, with an explicit flag.
 * No raw invalid draft is indexed, and no compiled fixture invents an unpublished item/history. */
export async function loadContentInventory(repository: ContentRepository): Promise<ContentInventory> {
  const rows = await Promise.all(CONTENT_DOCUMENT_KEYS.map(async (key) => {
    const published = await repository.getPublished(key);
    let draft: ContentDocument | null = null;
    let draftUnavailable = false;
    try { draft = await repository.getDraft(key); } catch { draftUnavailable = true; }
    const doc = draft ?? published;
    const health = contentHealth(doc);
    const item: ContentInventoryItem = {
      id: key, key, title: titleOf(doc), module: key.startsWith("airport.") ? "a2.nav.airport" : "a2.web.title",
      state: draft ? "draft" : "published", draftUnavailable,
      missingAr: !health.hasArabic, missingSource: health.missingSource,
      ...editorTarget(key),
    };
    const entities: ContentSearchEntry[] = [];
    const add = (id: string, title: LocalizedText, value: unknown, target: EditorTarget = editorTarget(key)) => {
      entities.push({ ...item, ...target, id: `${key}:${id}`, title, searchText: `${key} ${id} ${localizedSearchText(value)}` });
    };
    add(key, item.title, doc);
    if (doc.kind === "travel") for (const section of doc.sections) add(section.id, section.title, section, { to: "/admin/website", search: { tab: "travel", item: section.id } });
    if (doc.kind === "airport.past") for (const entry of doc.timeline) add(entry.id, entry.title, entry, { to: "/admin/airport", search: { tab: "past", item: entry.id } });
    if (doc.kind === "airport.present") {
      for (const fact of doc.facts) add(fact.id, fact.label, fact, { to: "/admin/airport", search: { tab: "present", item: fact.id } });
      for (const dossier of doc.dossiers) add(dossier.id, dossier.title, dossier, { to: "/admin/airport", search: { tab: "present", item: dossier.id } });
    }
    if (doc.kind === "destinations.editorial") for (const entry of doc.destinations) add(entry.code, entry.seo.title, entry, { to: "/admin/destinations/$code", params: { code: entry.code }, search: { tab: "content" } });
    if (doc.kind === "pages.information") for (const page of doc.pages) add(page.id, page.title, page, { to: "/admin/website", search: { tab: "pages", page: page.id } });
    return { item, entities };
  }));
  return {
    documents: rows.map((row) => row.item), entities: rows.flatMap((row) => row.entities),
    unavailable: rows.filter((row) => row.item.draftUnavailable).map((row) => row.item.key),
  };
}
