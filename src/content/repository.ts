import { contentValidationIssues, isContentKey, isValidContent } from "./schema.ts";
import type { ContentKey, ContentMap } from "./types.ts";
import { contentStructureChanges, type ContentStructureChanges } from "./changes.ts";

export const CONTENT_DRAFT_KEY = "gza.content.draft.v1";
export type ContentDraftState = { schemaVersion: 1; drafts: Partial<ContentMap> };
type RawDraftState = { schemaVersion: 1; drafts: Record<string, unknown> };
export type ContentErrorCode = "unknown_document" | "invalid_draft" | "corrupt_store" |
  "unsupported_version" | "storage_unavailable" | "write_failed" | "coordination_unavailable" | "draft_conflict" | "permission_denied";
const messages: Record<ContentErrorCode, string> = {
  unknown_document: "Unknown content document",
  invalid_draft: "Invalid content draft",
  corrupt_store: "Content draft storage contains invalid data",
  unsupported_version: "Content draft storage version is unsupported",
  storage_unavailable: "Content draft storage is unavailable",
  write_failed: "Could not save the content draft",
  coordination_unavailable: "Content draft write coordination is unavailable",
  draft_conflict: "This content draft changed in another editor",
  permission_denied: "Content editing permission is required",
};
export class ContentError extends Error {
  readonly code: ContentErrorCode;
  readonly issues: ReturnType<typeof contentValidationIssues>;
  constructor(code: ContentErrorCode, issues: ReturnType<typeof contentValidationIssues> = []) {
    super(messages[code]);
    this.name = "ContentError";
    this.code = code;
    this.issues = issues;
  }
}

/** The baseline is the stored draft (null if absent), not the compiled published document. */
export type ContentWriteOptions<K extends ContentKey> = { expectedDraft?: ContentMap[K] | null };
export type ContentMutationReceipt<K extends ContentKey> = {
  key: K; changed: boolean; before: ContentMap[K] | null; after: ContentMap[K] | null; changes: ContentStructureChanges;
};
export type ContentRepositoryOptions = { inMemory?: boolean; storage?: Storage | null; locks?: LockManager | null };
const emptyRaw = (): RawDraftState => ({ schemaVersion: 1, drafts: {} });
const detach = <T>(value: T): T => structuredClone(value);

// Ignore property insertion order when checking document baselines and no-ops.
function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => sameValue(value, right[index]));
  }
  if (left && right && typeof left === "object" && typeof right === "object" && !Array.isArray(left) && !Array.isArray(right)) {
    const a = Object.keys(left), b = Object.keys(right);
    return a.length === b.length && a.every((key) => Object.hasOwn(right, key) &&
      sameValue((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
  }
  return false;
}

export async function getPublishedContent<K extends ContentKey>(key: K): Promise<ContentMap[K]> {
  let document: unknown;
  if (key === "home") document = (await import("./published/home.ts")).publishedHome;
  else if (key === "travel") document = (await import("./published/travel.ts")).publishedTravel;
  else if (key === "airport.past") document = (await import("./published/airport-past.ts")).publishedAirportPast;
  else if (key === "airport.present") document = (await import("./published/airport-present.ts")).publishedAirportPresent;
  else if (key === "destinations.presentation") document = (await import("./published/destinations-presentation.ts")).publishedDestinationsPresentation;
  else if (key === "airport.future") document = (await import("./published/airport-future.ts")).publishedAirportFuture;
  else if (key === "destinations.editorial") document = (await import("./published/destinations-editorial.ts")).publishedDestinationsEditorial;
  else if (key === "pages.information") document = (await import("./published/information-pages.ts")).publishedInformationPages;
  else throw new ContentError("unknown_document");
  return detach(document) as ContentMap[K];
}

export interface ContentRepository {
  getPublished<K extends ContentKey>(key: K): Promise<ContentMap[K]>;
  getDraft<K extends ContentKey>(key: K): Promise<ContentMap[K] | null>;
  getPreview<K extends ContentKey>(key: K): Promise<ContentMap[K]>;
  saveDraft<K extends ContentKey>(key: K, document: ContentMap[K], options?: ContentWriteOptions<K>): Promise<void>;
  discardDraft<K extends ContentKey>(key: K, options?: ContentWriteOptions<K>): Promise<void>;
  saveDraftWithReceipt<K extends ContentKey>(key: K, document: ContentMap[K], options?: ContentWriteOptions<K>): Promise<ContentMutationReceipt<K>>;
  discardDraftWithReceipt<K extends ContentKey>(key: K, options?: ContentWriteOptions<K>): Promise<ContentMutationReceipt<K>>;
  subscribe(listener: () => void): () => void;
}
function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

export class LocalContentRepository implements ContentRepository {
  private readonly listeners = new Set<() => void>();
  private listening = false;
  private queue: Promise<unknown> = Promise.resolve();
  private memoryState = emptyRaw();
  private readonly options: ContentRepositoryOptions;
  /** Storage/null constructor stays compatible; memory mode must be explicitly requested. */
  constructor(storageOrOptions?: Storage | null | ContentRepositoryOptions) {
    this.options = storageOrOptions === null ? { storage: null } :
      storageOrOptions && "getItem" in storageOrOptions ? { storage: storageOrOptions } : { ...storageOrOptions };
  }
  private storage(): Storage | null {
    return this.options.storage === undefined ? browserStorage() : this.options.storage;
  }
  private notify = () => {
    for (const listener of this.listeners) {
      try { listener(); } catch { /* A subscriber cannot turn a committed save into a failure. */ }
    }
  };
  private onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== CONTENT_DRAFT_KEY) return;
    if (event.storageArea && event.storageArea !== this.storage()) return;
    this.notify();
  };
  private readRaw(): RawDraftState {
    if (this.options.inMemory) return detach(this.memoryState);
    const storage = this.storage();
    if (!storage) throw new ContentError("storage_unavailable");
    let raw: string | null;
    try { raw = storage.getItem(CONTENT_DRAFT_KEY); } catch { throw new ContentError("storage_unavailable"); }
    if (raw === null) return emptyRaw();
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new ContentError("corrupt_store"); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ContentError("corrupt_store");
    const state = parsed as Record<string, unknown>;
    if (state["schemaVersion"] !== 1) throw new ContentError("unsupported_version");
    if (!state["drafts"] || typeof state["drafts"] !== "object" || Array.isArray(state["drafts"]) ||
      Object.keys(state).some((key) => key !== "schemaVersion" && key !== "drafts")) throw new ContentError("corrupt_store");
    // Keep unknown/sibling payloads. A bad sibling does not block a healthy document,
    // and is never silently deleted or repaired.
    return { schemaVersion: 1, drafts: state["drafts"] as Record<string, unknown> };
  }
  private document<K extends ContentKey>(state: RawDraftState, key: K): ContentMap[K] | null {
    if (!isContentKey(key)) throw new ContentError("unknown_document");
    if (!Object.hasOwn(state.drafts, key)) return null;
    const value = state.drafts[key];
    if (!isValidContent(key, value)) throw new ContentError("corrupt_store");
    return detach(value) as ContentMap[K];
  }
  getPublished<K extends ContentKey>(key: K): Promise<ContentMap[K]> { return getPublishedContent(key); }
  async getDraft<K extends ContentKey>(key: K): Promise<ContentMap[K] | null> {
    if (!isContentKey(key)) throw new ContentError("unknown_document");
    return this.document(this.readRaw(), key);
  }
  async getPreview<K extends ContentKey>(key: K): Promise<ContentMap[K]> {
    return (await this.getDraft(key)) ?? this.getPublished(key);
  }
  private async mutate<K extends ContentKey>(key: K, after: ContentMap[K] | null, options?: ContentWriteOptions<K>): Promise<ContentMutationReceipt<K>> {
    if (!isContentKey(key)) throw new ContentError("unknown_document");
    const submitted = detach(after);
    const baseline = options && Object.hasOwn(options, "expectedDraft") ? detach(options.expectedDraft ?? null) : this.document(this.readRaw(), key);
    const commit = (): ContentMutationReceipt<K> => {
      const current = this.readRaw();
      const before = this.document(current, key);
      if (!sameValue(before, baseline)) throw new ContentError("draft_conflict");
      const changed = !sameValue(before, submitted);
      if (changed) {
        const drafts = { ...current.drafts };
        if (submitted === null) delete drafts[key];
        else drafts[key] = submitted;
        const next: RawDraftState = { schemaVersion: 1, drafts };
        if (this.options.inMemory) this.memoryState = detach(next);
        else {
          const storage = this.storage();
          if (!storage) throw new ContentError("storage_unavailable");
          try { storage.setItem(CONTENT_DRAFT_KEY, JSON.stringify(next)); } catch { throw new ContentError("write_failed"); }
        }
        this.notify();
      }
      return detach({ key, changed, before, after: submitted, changes: contentStructureChanges(before, submitted) });
    };
    const run = async () => {
      if (this.options.inMemory) return commit();
      let locks: LockManager | null;
      try {
        locks = this.options.locks === undefined ? (typeof navigator === "undefined" ? null : navigator.locks ?? null) : this.options.locks;
      } catch { throw new ContentError("coordination_unavailable"); }
      if (!locks) {
        if (typeof window === "undefined") return commit();
        throw new ContentError("coordination_unavailable");
      }
      let entered = false;
      try {
        return await locks.request(CONTENT_DRAFT_KEY, { signal: AbortSignal.timeout(5000) }, () => {
          entered = true;
          return commit();
        });
      } catch (error) {
        if (entered) throw error;
        throw new ContentError("coordination_unavailable");
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }
  async saveDraftWithReceipt<K extends ContentKey>(key: K, document: ContentMap[K], options?: ContentWriteOptions<K>): Promise<ContentMutationReceipt<K>> {
    if (!isContentKey(key)) throw new ContentError("unknown_document");
    let submitted: ContentMap[K];
    try { submitted = detach(document); } catch { throw new ContentError("invalid_draft"); }
    const issues = contentValidationIssues(key, submitted);
    if (issues.length) throw new ContentError("invalid_draft", issues);
    return this.mutate(key, submitted, options);
  }
  async discardDraftWithReceipt<K extends ContentKey>(key: K, options?: ContentWriteOptions<K>): Promise<ContentMutationReceipt<K>> {
    return this.mutate(key, null, options);
  }
  async saveDraft<K extends ContentKey>(key: K, document: ContentMap[K], options?: ContentWriteOptions<K>): Promise<void> {
    await this.saveDraftWithReceipt(key, document, options);
  }
  async discardDraft<K extends ContentKey>(key: K, options?: ContentWriteOptions<K>): Promise<void> {
    await this.discardDraftWithReceipt(key, options);
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (!this.options.inMemory && !this.listening && typeof window !== "undefined") {
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
