import { z } from "zod";
import type { MvpApiClient } from "../lib/api/mvp-client.ts";
import { MvpApiError } from "../lib/api/mvp-client.ts";
import { ContentError, getPublishedContent, type ContentRepository, type ContentWriteOptions, type ContentMutationReceipt } from "./repository.ts";
import { contentStructureChanges } from "./changes.ts";
import { isContentKey, isValidContent } from "./schema.ts";
import type { ContentKey, ContentMap } from "./types.ts";

const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const identity = { id: z.string(), kind: z.string(), slug: z.string() };
const publicSchema = z.object({ ...identity, revisionNumber: revision.refine(value => value > 0), status: z.literal("published"), updatedAt: z.string().datetime({ offset: true }), payload: z.unknown() }).strict();
const editorialSchema = z.object({ ...identity, revisionNumber: revision, currentRevision: revision, publishedRevision: revision.refine(value => value > 0).nullable(), draftRevision: revision.refine(value => value > 0).nullable(),
  status: z.enum(["draft", "published", "unpublished"]), hasDraft: z.boolean(), tombstoned: z.boolean(), updatedAt: z.string().datetime({ offset: true }), payload: z.unknown().nullable(),
}).strict().refine(value => value.hasDraft === (value.draftRevision !== null) && (!value.hasDraft || value.payload !== null) && (value.tombstoned || value.status !== "unpublished"));
const receiptSchema = z.object({ slug: z.string(), changed: z.boolean(), revision, currentRevision: revision, status: z.enum(["draft", "published", "unpublished"]) }).strict();
export type ServerEditorialDocument<K extends ContentKey> = Omit<z.infer<typeof editorialSchema>, "payload"> & { payload: ContentMap[K] | null };

/** Public and private reads are separate. Only an explicit never-published 404 uses the compiled baseline. */
export class HttpContentRepository implements ContentRepository {
  readonly hasServerPublication = true;
  private readonly client: () => MvpApiClient;
  private readonly listeners = new Set<() => void>();
  constructor(client: () => MvpApiClient) { this.client = client; }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private notify() { for (const listener of this.listeners) { try { listener(); } catch { /* Durable server write already committed. */ } } }
  private key(key: ContentKey) { if (!isContentKey(key)) throw new ContentError("unknown_document"); }
  private payload<K extends ContentKey>(key: K, record: { id: string; kind: string; slug: string; payload?: unknown }): ContentMap[K] {
    if (record.id !== key || record.kind !== key || record.slug !== key || !isValidContent(key, record.payload)) throw new ContentError("corrupt_store");
    return structuredClone(record.payload) as ContentMap[K];
  }
  private expected<K extends ContentKey>(options?: ContentWriteOptions<K>) {
    if (!Number.isSafeInteger(options?.expectedRevision) || options!.expectedRevision! < 0) throw new ContentError("draft_conflict");
    return options!.expectedRevision!;
  }
  private fail(error: unknown): never {
    if (error instanceof ContentError) throw error;
    if (error instanceof MvpApiError) {
      if (error.status === 409) throw new ContentError("draft_conflict");
      if (error.status === 401 || error.status === 403) throw new ContentError("permission_denied");
      if (error.status === 422) throw new ContentError("invalid_draft");
    }
    throw new ContentError("storage_unavailable");
  }
  async getPublished<K extends ContentKey>(key: K): Promise<ContentMap[K]> {
    this.key(key);
    try { return this.payload(key, await this.client().request({ method: "GET", path: `/cms/published/${key}`, realm: "public", schema: publicSchema })); }
    catch (error) {
      if (error instanceof MvpApiError && error.status === 404 && error.code === "not_found") return getPublishedContent(key);
      if (error instanceof MvpApiError && error.status === 410) throw new ContentError("unpublished");
      if (error instanceof ContentError) throw error;
      throw new ContentError("content_unavailable");
    }
  }
  private document<K extends ContentKey>(key: K, record: z.infer<typeof editorialSchema>): ServerEditorialDocument<K> {
    if (record.id !== key || record.kind !== key || record.slug !== key) throw new ContentError("corrupt_store");
    return { ...record, payload: record.payload === null ? null : this.payload(key, record) };
  }
  async getEditorial<K extends ContentKey>(key: K): Promise<ServerEditorialDocument<K> | null> {
    this.key(key);
    try { return this.document(key, await this.client().request({ method: "GET", path: `/cms/editorial/${key}`, realm: "staff", schema: editorialSchema })); }
    catch (error) { if (error instanceof MvpApiError && error.status === 404 && error.code === "not_found") return null; this.fail(error); }
  }
  async getDraft<K extends ContentKey>(key: K) { const doc = await this.getEditorial(key); return doc?.hasDraft ? doc.payload : null; }
  async getPreview<K extends ContentKey>(key: K) { const doc = await this.getEditorial(key); return doc?.payload ?? this.getPublished(key); }
  async saveDraftWithReceipt<K extends ContentKey>(key: K, document: ContentMap[K], options?: ContentWriteOptions<K>): Promise<ContentMutationReceipt<K>> {
    this.key(key); this.payload(key, { id: key, kind: key, slug: key, payload: document });
    const expectedRevision = this.expected(options);
    try {
      const receipt = await this.client().request({ method: "PUT", path: `/cms/editorial/${key}/draft`, realm: "staff", body: { expectedRevision, payload: document }, schema: receiptSchema });
      if (receipt.slug !== key || receipt.currentRevision < expectedRevision || receipt.changed !== (receipt.currentRevision > expectedRevision)) throw new ContentError("corrupt_store");
      if (receipt.changed) this.notify();
      return { key, changed: receipt.changed, before: options?.expectedDraft ?? null, after: structuredClone(document), changes: contentStructureChanges(options?.expectedDraft ?? null, document), currentRevision: receipt.currentRevision };
    } catch (error) { this.fail(error); }
  }
  async discardDraftWithReceipt<K extends ContentKey>(key: K, options?: ContentWriteOptions<K>): Promise<ContentMutationReceipt<K>> {
    const expectedRevision = this.expected(options);
    const doc = await this.transition(key, "discard", expectedRevision);
    return { key, changed: doc.currentRevision > expectedRevision, before: options?.expectedDraft ?? null, after: null, changes: contentStructureChanges(options?.expectedDraft ?? null, null), currentRevision: doc.currentRevision };
  }
  async saveDraft<K extends ContentKey>(key: K, document: ContentMap[K], options?: ContentWriteOptions<K>) { await this.saveDraftWithReceipt(key, document, options); }
  async discardDraft<K extends ContentKey>(key: K, options?: ContentWriteOptions<K>) { await this.discardDraftWithReceipt(key, options); }
  async transition<K extends ContentKey>(key: K, action: "publish" | "unpublish" | "discard" | "restore", expectedRevision: number, targetRevision?: number): Promise<ServerEditorialDocument<K>> {
    this.key(key); this.expected({ expectedRevision });
    if (action === "restore" && (!Number.isSafeInteger(targetRevision) || targetRevision! < 1)) throw new ContentError("invalid_draft");
    try {
      const result = this.document(key, await this.client().request({ method: "POST", path: `/cms/editorial/${key}/${action}`, realm: "staff", body: { expectedRevision, ...(action === "restore" ? { targetRevision } : {}) }, schema: editorialSchema }));
      if (result.currentRevision < expectedRevision) throw new ContentError("corrupt_store");
      if (result.currentRevision > expectedRevision) this.notify(); return result;
    } catch (error) { this.fail(error); }
  }
}
