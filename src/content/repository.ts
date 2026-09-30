import { isContentKey, isValidContent } from "./schema.ts";
import type { ContentKey, ContentMap } from "./types.ts";

export const CONTENT_DRAFT_KEY = "gza.content.draft.v1";
export type ContentDraftState = { schemaVersion: 1; drafts: Partial<ContentMap> };
type RawDraftState = { schemaVersion: 1; drafts: Record<string, unknown> };

const emptyRaw = (): RawDraftState => ({ schemaVersion: 1, drafts: {} });
const empty = (): ContentDraftState => ({ schemaVersion: 1, drafts: {} });

export async function getPublishedContent<K extends ContentKey>(key: K): Promise<ContentMap[K]> {
  if (key === "home") return (await import("./published/home.ts")).publishedHome as unknown as ContentMap[K];
  if (key === "travel") return (await import("./published/travel.ts")).publishedTravel as unknown as ContentMap[K];
  if (key === "airport.past") return (await import("./published/airport-past.ts")).publishedAirportPast as unknown as ContentMap[K];
  if (key === "airport.present") return (await import("./published/airport-present.ts")).publishedAirportPresent as unknown as ContentMap[K];
  if (key === "destinations.presentation") {
    return (await import("./published/destinations-presentation.ts")).publishedDestinationsPresentation as unknown as ContentMap[K];
  }
  throw new Error("Unknown content document");
}

export interface ContentRepository {
  getPublished<K extends ContentKey>(key: K): Promise<ContentMap[K]>;
  getDraft<K extends ContentKey>(key: K): Promise<ContentMap[K] | null>;
  getPreview<K extends ContentKey>(key: K): Promise<ContentMap[K]>;
  saveDraft<K extends ContentKey>(key: K, document: ContentMap[K]): Promise<void>;
  discardDraft(key: ContentKey): Promise<void>;
  subscribe(listener: () => void): () => void;
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

export class LocalContentRepository implements ContentRepository {
  private readonly listeners = new Set<() => void>();
  private listening = false;
  private readonly suppliedStorage: Storage | null | undefined;
  constructor(suppliedStorage?: Storage | null) { this.suppliedStorage = suppliedStorage; }

  private storage(): Storage | null { return this.suppliedStorage === undefined ? browserStorage() : this.suppliedStorage; }
  private notify = () => { for (const listener of this.listeners) listener(); };
  private onStorage = (event: StorageEvent) => { if (event.key === CONTENT_DRAFT_KEY) this.notify(); };

  private readRaw(): RawDraftState {
    try {
      const raw = this.storage()?.getItem(CONTENT_DRAFT_KEY);
      if (!raw) return emptyRaw();
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyRaw();
      const state = parsed as Record<string, unknown>;
      if (state["schemaVersion"] !== 1 || !state["drafts"] || typeof state["drafts"] !== "object" || Array.isArray(state["drafts"])) {
        return emptyRaw();
      }
      return {
        schemaVersion: 1,
        drafts: { ...(state["drafts"] as Record<string, unknown>) },
      };
    } catch {
      return emptyRaw();
    }
  }

  private read(): ContentDraftState {
    const raw = this.readRaw();
    const validDrafts: Partial<ContentMap> = {};
    for (const [key, value] of Object.entries(raw.drafts)) {
      if (isContentKey(key) && isValidContent(key, value)) {
        (validDrafts as Record<string, unknown>)[key] = value;
      }
    }
    return { schemaVersion: 1, drafts: validDrafts };
  }

  private commitRaw(next: RawDraftState): void {
    const storage = this.storage();
    if (!storage) throw new Error("Content draft storage is unavailable");
    storage.setItem(CONTENT_DRAFT_KEY, JSON.stringify(next));
    this.notify();
  }

  getPublished<K extends ContentKey>(key: K): Promise<ContentMap[K]> { return getPublishedContent(key); }

  async getDraft<K extends ContentKey>(key: K): Promise<ContentMap[K] | null> {
    if (!isContentKey(key)) throw new Error("Unknown content document");
    return (this.read().drafts[key] as ContentMap[K] | undefined) ?? null;
  }

  async getPreview<K extends ContentKey>(key: K): Promise<ContentMap[K]> {
    return (await this.getDraft(key)) ?? this.getPublished(key);
  }

  async saveDraft<K extends ContentKey>(key: K, document: ContentMap[K]): Promise<void> {
    if (!isContentKey(key) || !isValidContent(key, document)) throw new Error("Invalid content draft");
    const raw = this.readRaw();
    this.commitRaw({
      schemaVersion: 1,
      drafts: { ...raw.drafts, [key]: document },
    });
  }

  async discardDraft(key: ContentKey): Promise<void> {
    if (!isContentKey(key)) throw new Error("Unknown content document");
    const raw = this.readRaw();
    if (!Object.hasOwn(raw.drafts, key)) return;
    const nextDrafts = { ...raw.drafts };
    delete nextDrafts[key];
    this.commitRaw({ schemaVersion: 1, drafts: nextDrafts });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (!this.listening && typeof window !== "undefined") {
      window.addEventListener("storage", this.onStorage);
      this.listening = true;
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listening && this.listeners.size === 0 && typeof window !== "undefined") {
        window.removeEventListener("storage", this.onStorage);
        this.listening = false;
      }
    };
  }
}

export const contentRepository = new LocalContentRepository();
