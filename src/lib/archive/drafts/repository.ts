import { ARCHIVE_CATALOG } from "../catalog.ts";
import { SOURCE_REGISTRY } from "../sources.ts";
import { emptyArchiveDrafts, sameArchiveValue, validateArchiveDrafts } from "./schema.ts";
import {
  ArchiveDraftError, type ArchiveDraftEnvelope, type ArchiveDraftKind, type ArchiveDraftMap,
  type ArchiveDraftReceipt, type ArchiveDraftRepository, type ArchiveDraftSnapshot, type ArchiveWriteOptions,
} from "./types.ts";

export const ARCHIVE_DRAFT_KEY = "gza.archive.draft.v1";
export interface ArchiveDraftOptions { inMemory?: boolean; storage?: Storage | null; locks?: LockManager | null }
const detach = <T>(value: T): T => structuredClone(value);
const collection = (kind: ArchiveDraftKind): "records" | "sources" => kind === "record" ? "records" : "sources";
function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

/** Lazy, independent draft authority. Reads never write, repair, publish or import raw media. */
export class LocalArchiveDraftRepository implements ArchiveDraftRepository {
  private readonly options: ArchiveDraftOptions;
  private memory = emptyArchiveDrafts();
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private listening = false;
  constructor(options: ArchiveDraftOptions = {}) { this.options = { ...options }; }
  private storage(): Storage | null { return this.options.storage === undefined ? browserStorage() : this.options.storage; }
  private notify = () => { for (const listener of this.listeners) { try { listener(); } catch { /* committed command remains successful */ } } };
  private onStorage = (event: StorageEvent) => {
    if ((event.key === null || event.key === ARCHIVE_DRAFT_KEY) && (!event.storageArea || event.storageArea === this.storage())) this.notify();
  };
  private read(): ArchiveDraftEnvelope {
    if (this.options.inMemory) return detach(this.memory);
    const storage = this.storage();
    if (!storage) throw new ArchiveDraftError("storage_unavailable");
    let raw: string | null;
    try { raw = storage.getItem(ARCHIVE_DRAFT_KEY); } catch { throw new ArchiveDraftError("storage_unavailable"); }
    if (raw === null) return emptyArchiveDrafts();
    if (raw.length > 2_000_000) throw new ArchiveDraftError("corrupt_store");
    let state: unknown;
    try { state = JSON.parse(raw); } catch { throw new ArchiveDraftError("corrupt_store"); }
    if (state && typeof state === "object" && "schemaVersion" in state && state.schemaVersion !== 1) throw new ArchiveDraftError("unsupported_version");
    try { return validateArchiveDrafts(state); } catch { throw new ArchiveDraftError("corrupt_store"); }
  }
  async getSnapshot(): Promise<ArchiveDraftSnapshot> {
    const state = this.read();
    return detach({
      revision: state.revision,
      compiledRecords: ARCHIVE_CATALOG, compiledSources: Object.values(SOURCE_REGISTRY),
      records: ARCHIVE_CATALOG.map((r) => state.records[r.id] ?? r),
      sources: Object.values({ ...SOURCE_REGISTRY, ...state.sources }),
      recordDrafts: state.records, sourceDrafts: state.sources,
    });
  }
  private async mutate<K extends ArchiveDraftKind>(kind: K, id: string, value: ArchiveDraftMap[K] | null, options: ArchiveWriteOptions<K>): Promise<ArchiveDraftReceipt<K>> {
    if ((kind !== "record" && kind !== "source") || !options || !Object.hasOwn(options, "expectedDraft")) throw new ArchiveDraftError("invalid_draft");
    const name = collection(kind);
    let submitted: ArchiveDraftMap[K] | null, baseline: ArchiveDraftMap[K] | null;
    try { submitted = detach(value); baseline = detach(options.expectedDraft); } catch { throw new ArchiveDraftError("invalid_draft"); }
    const compiled = kind === "record" ? ARCHIVE_CATALOG.find((r) => r.id === id) : SOURCE_REGISTRY[id];
    if (kind === "record" && !compiled) throw new ArchiveDraftError("unknown_record");
    if (kind === "source" && (!/^src-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 100)) throw new ArchiveDraftError("invalid_draft", [{ path: `sources.${id}.id`, rule: "identity" }]);
    const commit = (): ArchiveDraftReceipt<K> => {
      const current = this.read();
      const before = (Object.hasOwn(current[name], id) ? current[name][id] : null) as ArchiveDraftMap[K] | null;
      if (!sameArchiveValue(before, baseline)) throw new ArchiveDraftError("draft_conflict");
      const candidate = detach(current);
      if (submitted === null) delete candidate[name][id];
      else Object.assign(candidate[name], { [id]: submitted });
      // Inside the lock: validates current sibling/source edits too, not stale preflight references.
      const next = validateArchiveDrafts(candidate);
      const after = (Object.hasOwn(next[name], id) ? next[name][id] : null) as ArchiveDraftMap[K] | null;
      const changed = !sameArchiveValue(before, after);
      const previous = before ?? compiled ?? null;
      const effectiveAfter = after ?? compiled ?? null;
      const fields = Array.from(new Set([...Object.keys(previous ?? {}), ...Object.keys(effectiveAfter ?? {})])).filter((field) =>
        !sameArchiveValue((previous as unknown as Record<string, unknown> | null)?.[field], (effectiveAfter as unknown as Record<string, unknown> | null)?.[field]));
      if (changed) {
        if (!Number.isSafeInteger(current.revision + 1)) throw new ArchiveDraftError("write_failed");
        next.revision = current.revision + 1;
        const encoded = JSON.stringify(next);
        if (encoded.length > 2_000_000) throw new ArchiveDraftError("invalid_draft");
        if (this.options.inMemory) this.memory = detach(next);
        else {
          const storage = this.storage();
          if (!storage) throw new ArchiveDraftError("storage_unavailable");
          try { storage.setItem(ARCHIVE_DRAFT_KEY, encoded); } catch { throw new ArchiveDraftError("write_failed"); }
        }
        this.notify();
      }
      return detach({ kind, id, changed, before, after, fields,
        beforeState: previous && "publicationState" in previous ? previous.publicationState : previous ? "present" : "absent",
        afterState: effectiveAfter && "publicationState" in effectiveAfter ? effectiveAfter.publicationState : effectiveAfter ? "present" : "absent",
      });
    };
    const run = async () => {
      if (this.options.inMemory) return commit();
      let locks: LockManager | null;
      try { locks = this.options.locks === undefined ? (typeof navigator === "undefined" ? null : navigator.locks ?? null) : this.options.locks; } catch { throw new ArchiveDraftError("coordination_unavailable"); }
      if (!locks) throw new ArchiveDraftError("coordination_unavailable");
      let entered = false;
      try {
        return await locks.request(ARCHIVE_DRAFT_KEY, { signal: AbortSignal.timeout(5000) }, () => { entered = true; return commit(); });
      } catch (error) {
        if (entered) throw error;
        throw new ArchiveDraftError("coordination_unavailable");
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }
  save<K extends ArchiveDraftKind>(kind: K, value: ArchiveDraftMap[K], options: ArchiveWriteOptions<K>): Promise<ArchiveDraftReceipt<K>> {
    if (!value || typeof value.id !== "string") return Promise.reject(new ArchiveDraftError("invalid_draft"));
    return this.mutate(kind, value.id, value, options);
  }
  discard<K extends ArchiveDraftKind>(kind: K, id: string, options: ArchiveWriteOptions<K>): Promise<ArchiveDraftReceipt<K>> { return this.mutate(kind, id, null, options); }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (!this.options.inMemory && !this.listening && typeof window !== "undefined") { window.addEventListener("storage", this.onStorage); this.listening = true; }
    return () => {
      this.listeners.delete(listener);
      if (this.listening && !this.listeners.size && typeof window !== "undefined") { window.removeEventListener("storage", this.onStorage); this.listening = false; }
    };
  }
}
