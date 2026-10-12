import { z } from "zod";
import { getMvpUiClient } from "../api/mvp-ui-runtime.ts";
import { MvpApiError } from "../api/mvp-client.ts";
import { getGalleryItems, type GalleryDisplayItem } from "./catalog.ts";

const approvedRecordIds = new Set(getGalleryItems().map(item => item.id));

const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const galleryItemConfigSchema = z.object({
  recordId: z.string().min(1),
  visible: z.boolean(),
  title: z.object({
    en: z.string().max(500).optional(),
    ar: z.string().max(500).optional(),
  }).strict().refine(value => Object.keys(value).length > 0).nullable().optional(),
  caption: z.object({
    en: z.string().max(2000).optional(),
    ar: z.string().max(2000).optional(),
  }).strict().refine(value => Object.keys(value).length > 0).nullable().optional(),
}).strict();

export const galleryConfigurationPayloadSchema = z.object({
  items: z.array(galleryItemConfigSchema).min(1).max(100).superRefine((items, ctx) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (!approvedRecordIds.has(item.recordId) || seen.has(item.recordId)) {
        ctx.addIssue({ code: "custom", path: [index, "recordId"], message: "Unavailable or duplicate gallery record." });
      }
      seen.add(item.recordId);
    });
  }),
}).strict();

export const galleryPublishedDocumentSchema = z.object({
  id: z.literal("gallery"),
  kind: z.literal("gallery"),
  slug: z.literal("default"),
  revisionNumber: revision.refine((v) => v > 0),
  status: z.literal("published"),
  updatedAt: z.string(),
  payload: galleryConfigurationPayloadSchema,
}).strict();

export const galleryEditorialDocumentSchema = z.object({
  id: z.literal("gallery"),
  kind: z.literal("gallery"),
  slug: z.literal("default"),
  revisionNumber: revision,
  currentRevision: revision,
  publishedRevision: revision.refine((v) => v > 0).nullable(),
  draftRevision: revision.refine((v) => v > 0).nullable(),
  status: z.enum(["draft", "published", "unpublished"]),
  hasDraft: z.boolean(),
  tombstoned: z.boolean(),
  updatedAt: z.string(),
  payload: galleryConfigurationPayloadSchema.nullable(),
}).strict();

export const galleryReceiptSchema = z.object({
  slug: z.literal("default"),
  changed: z.boolean(),
  revision,
  currentRevision: revision,
  status: z.enum(["draft", "published", "unpublished"]),
}).strict();

export type GalleryItemConfig = z.infer<typeof galleryItemConfigSchema>;
export type GalleryConfigurationPayload = z.infer<typeof galleryConfigurationPayloadSchema>;
export type GalleryPublishedDocument = z.infer<typeof galleryPublishedDocumentSchema>;
export type GalleryEditorialDocument = z.infer<typeof galleryEditorialDocumentSchema>;
export type GalleryReceipt = z.infer<typeof galleryReceiptSchema>;

/**
 * Merges authoritative server published configuration with compiled archive records and videos.
 * - Selection and order is determined strictly by the published configuration items.
 * - Items with `visible === false` are omitted from public display.
 * - Display title and caption are overridden if specified; all source, rights, date,
 *   evidence, subjects, phases and media URLs remain compiled authority.
 */
export function applyPublishedGalleryConfiguration(
  publishedPayload: GalleryConfigurationPayload,
  compiledItems: GalleryDisplayItem[] = getGalleryItems(),
): GalleryDisplayItem[] {
  const byId = new Map(compiledItems.map((item) => [item.id, item]));
  const result: GalleryDisplayItem[] = [];

  for (const config of publishedPayload.items) {
    if (!config.visible) continue;
    const compiled = byId.get(config.recordId);
    if (!compiled) throw new Error("Published gallery refers to an unavailable approved record.");

    const mergedTitle = {
      en: config.title?.en !== undefined && config.title.en.trim() !== "" ? config.title.en : compiled.title.en,
      ar: config.title?.ar !== undefined && config.title.ar.trim() !== "" ? config.title.ar : compiled.title.ar,
    };

    const mergedCaption = {
      en: config.caption?.en !== undefined && config.caption.en.trim() !== "" ? config.caption.en : (compiled.caption?.en ?? ""),
      ar: config.caption?.ar !== undefined && config.caption.ar.trim() !== "" ? config.caption.ar : (compiled.caption?.ar ?? ""),
    };

    if (compiled.isVideo) {
      result.push({
        ...compiled,
        title: mergedTitle,
        caption: mergedCaption,
      });
    } else {
      result.push({
        ...compiled,
        title: mergedTitle,
        caption: mergedCaption,
      });
    }
  }

  return result;
}

/**
 * Builds the default published gallery configuration from the compiled gallery items.
 * Used when initializing an empty draft in Admin.
 */
export function buildDefaultGalleryConfiguration(
  compiledItems: GalleryDisplayItem[] = getGalleryItems(),
): GalleryConfigurationPayload {
  return {
    items: compiledItems.map((item) => ({
      recordId: item.id,
      visible: true,
      title: {
        en: item.title.en,
        ar: item.title.ar,
      },
      caption: {
        en: item.caption?.en ?? "",
        ar: item.caption?.ar ?? "",
      },
    })),
  };
}

/**
 * Reads public published gallery configuration from PostgreSQL API.
 * - Empty database (HTTP 404) returns null, indicating the compiled baseline should be used.
 * - Network errors throw an error; they must NOT silently fall back to stale local configuration.
 */
export async function fetchPublishedGallery(signal?: AbortSignal): Promise<GalleryPublishedDocument | null> {
  const client = getMvpUiClient();
  try {
    const envelope = await client.request({
      method: "GET",
      path: "/gallery/published",
      realm: "public",
      schema: galleryPublishedDocumentSchema,
      signal,
    });
    return envelope;
  } catch (error) {
    if (error instanceof MvpApiError && error.status === 404 && error.code === "not_found") {
      return null;
    }
    throw error;
  }
}

/** Staff operations */

export async function fetchGalleryEditorial(signal?: AbortSignal): Promise<GalleryEditorialDocument | null> {
  const client = getMvpUiClient();
  try {
    const envelope = await client.request({
      method: "GET",
      path: "/gallery/editorial",
      realm: "staff",
      schema: galleryEditorialDocumentSchema,
      signal,
    });
    return envelope;
  } catch (error) {
    if (error instanceof MvpApiError && error.status === 404 && error.code === "not_found") {
      return null;
    }
    throw error;
  }
}

export async function saveGalleryDraft(
  payload: GalleryConfigurationPayload,
  expectedRevision: number,
  signal?: AbortSignal,
): Promise<GalleryReceipt> {
  const client = getMvpUiClient();
  return client.request({
    method: "PUT",
    path: "/gallery/editorial/draft",
    realm: "staff",
    body: { expectedRevision, payload },
    schema: galleryReceiptSchema,
    signal,
  });
}

export async function discardGalleryDraft(
  expectedRevision: number,
  signal?: AbortSignal,
): Promise<GalleryEditorialDocument> {
  const client = getMvpUiClient();
  return client.request({
    method: "POST",
    path: "/gallery/editorial/discard",
    realm: "staff",
    body: { expectedRevision },
    schema: galleryEditorialDocumentSchema,
    signal,
  });
}

export async function publishGallery(
  expectedRevision: number,
  signal?: AbortSignal,
): Promise<GalleryEditorialDocument> {
  const client = getMvpUiClient();
  return client.request({
    method: "POST",
    path: "/gallery/editorial/publish",
    realm: "staff",
    body: { expectedRevision },
    schema: galleryEditorialDocumentSchema,
    signal,
  });
}

export async function unpublishGallery(
  expectedRevision: number,
  signal?: AbortSignal,
): Promise<GalleryEditorialDocument> {
  const client = getMvpUiClient();
  return client.request({
    method: "POST",
    path: "/gallery/editorial/unpublish",
    realm: "staff",
    body: { expectedRevision },
    schema: galleryEditorialDocumentSchema,
    signal,
  });
}

export async function restoreGallery(
  expectedRevision: number,
  targetRevision: number,
  signal?: AbortSignal,
): Promise<GalleryEditorialDocument> {
  const client = getMvpUiClient();
  return client.request({
    method: "POST",
    path: "/gallery/editorial/restore",
    realm: "staff",
    body: { expectedRevision, targetRevision },
    schema: galleryEditorialDocumentSchema,
    signal,
  });
}
