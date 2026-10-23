import { z } from "zod";
import { resolveIdentityApiClientConfig, type IdentityApiClientConfig } from "../api/identity-client-config.ts";
import { identityUiClientConfig } from "../api/identity-ui-config.ts";
import { getMvpUiClient } from "../api/mvp-ui-runtime.ts";

/** Direct downloads must use the same approved API origin and cookie path as requests. */
export function archiveAttachmentDownloadUrl(config: IdentityApiClientConfig, id: string | number, fileId: string | number): string {
  const resolved = resolveIdentityApiClientConfig(config);
  if (!resolved.enabled || !resolved.baseUrl) throw new Error("Archive API is disabled.");
  const contributionId = z.string().uuid().parse(id);
  const attachmentId = z.string().uuid().parse(fileId);
  return `${resolved.baseUrl}/admin/archive/contributions/${encodeURIComponent(contributionId)}/files/${encodeURIComponent(attachmentId)}/download`;
}

export const PROHIBITED_EXTENSIONS = [
  "svg", "svgz", "htm", "html", "xhtml", "shtml", "xml",
  "php", "phtml", "phar", "sh", "bash", "exe", "bat", "cmd",
  "com", "scr", "msi", "vbs", "js", "jar", "py", "pl", "cgi",
] as const;

export function isForbiddenFileExtension(filename: string): boolean {
  const lower = filename.toLowerCase().trim();
  const parts = lower.split(".");
  // Unsafe double extension check: e.g. photo.php.jpg or doc.exe.png
  if (parts.length > 2) {
    for (let i = 1; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (seg && (PROHIBITED_EXTENSIONS as readonly string[]).includes(seg)) {
        return true;
      }
    }
  }
  const lastExt = parts.length > 1 ? parts[parts.length - 1]! : "";
  return (PROHIBITED_EXTENSIONS as readonly string[]).includes(lastExt);
}

export const contributionTypeSchema = z.enum([
  "photograph",
  "document",
  "video_reference",
  "oral_history",
  "artifact",
  "future_concept",
  "design",
  "other",
]);

export type ContributionType = z.infer<typeof contributionTypeSchema>;

export const contributionChapterSchema = z.enum([
  "historical",
  "contemporary",
  "imagined_future",
]);

export type ContributionChapter = z.infer<typeof contributionChapterSchema>;

export const contributionRightsStatusSchema = z.enum([
  "owned_authorized",
  "reference_unconfirmed",
  "unknown",
]);

export type ContributionRightsStatus = z.infer<typeof contributionRightsStatusSchema>;

export const contributionStatusSchema = z.enum([
  "submitted",
  "received",
  "under_review",
  "accepted",
  "declined",
  "archived",
]);

export type ContributionStatus = z.infer<typeof contributionStatusSchema>;

/** References are recorded for private review, never fetched by the server. */
export const archiveReferenceUrlSchema = z.string().trim().max(2000).url().refine(
  value => /^https?:\/\//i.test(value),
  { message: "Use a complete HTTP or HTTPS reference URL." },
);

export const archiveContributionSubmitSchema = z.object({
  contributorName: z.string().min(2).max(120),
  contributorNameAr: z.string().max(120).optional().nullable(),
  contributorEmail: z.string().email().max(160),
  chapter: contributionChapterSchema,
  contributionType: contributionTypeSchema,
  approximateDate: z.string().max(100).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  credit: z.string().max(254).optional().nullable(),
  rightsStatus: z.enum(["owned_authorized", "reference_unconfirmed"]),
  sourceNote: z.string().max(5000).optional().nullable(),
  referenceUrl: archiveReferenceUrlSchema.optional().nullable(),
  description: z.string().min(10).max(5000),
  permissionConsent: z.literal(true),
  submissionId: z.string().max(64).optional(),
}).strict().superRefine((data, ctx) => {
  if (data.rightsStatus === "reference_unconfirmed") {
    const note = data.sourceNote?.trim() ?? "";
    const url = data.referenceUrl?.trim() ?? "";
    if (!note && !url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Reference citation, link, or provenance note is required for unconfirmed rights references.",
        path: ["sourceNote"],
      });
    }
  }
});

export type ArchiveContributionSubmit = z.infer<typeof archiveContributionSubmitSchema>;

export const contributionSubmissionReceiptSchema = z.object({
  reference: z.string().regex(/^GZA-ARC-[A-Z0-9]+$/),
  status: z.literal("received"),
  createdAt: z.string(),
}).strict();

export type ContributionSubmissionReceipt = z.infer<typeof contributionSubmissionReceiptSchema>;

export const contributionFileSchema = z.object({
  id: z.union([z.string().uuid(), z.number()]),
  originalFilename: z.string(),
  fileBytes: z.number().int().nonnegative().optional(),
  fileSizeBytes: z.number().int().nonnegative().optional(),
  mimeType: z.string(),
  sha256: z.string().optional(),
  downloadUrl: z.string().optional(),
  createdAt: z.string().optional(),
});

export type ContributionFile = z.infer<typeof contributionFileSchema>;

export const contributionAuditSchema = z.object({
  id: z.union([z.string().uuid(), z.number()]),
  staffId: z.string().optional(),
  staffName: z.string().optional(),
  action: z.string(),
  oldValue: z.string().nullable().optional(),
  newValue: z.string().nullable().optional(),
  details: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type ContributionAudit = z.infer<typeof contributionAuditSchema>;

export const contributionListItemSchema = z.object({
  id: z.union([z.string().uuid(), z.number()]),
  publicReference: z.string(),
  submissionId: z.string(),
  contributorName: z.string(),
  contributorNameArabic: z.string().nullable().optional(),
  contributorNameAr: z.string().nullable().optional(),
  email: z.string().optional(),
  contributorEmail: z.string().optional(),
  chapter: contributionChapterSchema.nullable().optional(),
  contributionType: contributionTypeSchema,
  rightsStatus: contributionRightsStatusSchema.nullable().optional(),
  approximateDate: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  credit: z.string().nullable().optional(),
  sourceNote: z.string().nullable().optional(),
  referenceUrl: z.string().nullable().optional(),
  status: contributionStatusSchema,
  curatorNotes: z.string().optional(),
  assignedStaffId: z.string().nullable().optional(),
  assignedStaffName: z.string().nullable().optional(),
  filesCount: z.number().int().nonnegative().optional(),
  createdAt: z.string().optional(),
  submittedAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type ContributionListItem = z.infer<typeof contributionListItemSchema>;

export const contributionListResponseSchema = z.object({
  items: z.array(contributionListItemSchema),
  countReceived: z.number().int().nonnegative().optional(),
});

export const contributionDetailSchema = z.object({
  id: z.union([z.string().uuid(), z.number()]),
  publicReference: z.string(),
  submissionId: z.string(),
  contributorName: z.string(),
  contributorNameArabic: z.string().nullable().optional(),
  contributorNameAr: z.string().nullable().optional(),
  email: z.string().optional(),
  contributorEmail: z.string().optional(),
  chapter: contributionChapterSchema.nullable().optional(),
  contributionType: contributionTypeSchema,
  rightsStatus: contributionRightsStatusSchema.nullable().optional(),
  approximateDate: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  credit: z.string().nullable().optional(),
  sourceNote: z.string().nullable().optional(),
  referenceUrl: z.string().nullable().optional(),
  description: z.string(),
  permissionConsent: z.boolean(),
  status: contributionStatusSchema,
  curatorNotes: z.string().optional(),
  assignedStaffId: z.string().nullable().optional(),
  assignedStaffName: z.string().nullable().optional(),
  files: z.array(contributionFileSchema),
  audits: z.array(contributionAuditSchema),
  createdAt: z.string().optional(),
  submittedAt: z.string().optional(),
  reviewedAt: z.string().nullable().optional(),
  updatedAt: z.string().optional(),
});

export type ContributionDetail = z.infer<typeof contributionDetailSchema>;

export const archiveContributionsClient = {
  submit: (formData: FormData) =>
    getMvpUiClient().request({
      method: "POST",
      path: "/archive/contributions",
      realm: "passenger",
      body: formData,
      statuses: [200, 202],
      schema: contributionSubmissionReceiptSchema,
    }),

  list: (params?: {
    status?: string;
    type?: string;
    chapter?: string;
    rightsStatus?: string;
    search?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.status && params.status !== "all") searchParams.set("status", params.status);
    if (params?.type && params.type !== "all") searchParams.set("type", params.type);
    if (params?.chapter && params.chapter !== "all") searchParams.set("chapter", params.chapter);
    if (params?.rightsStatus && params.rightsStatus !== "all") searchParams.set("rightsStatus", params.rightsStatus);
    if (params?.search) searchParams.set("search", params.search);
    const query = searchParams.size ? `?${searchParams.toString()}` : "";
    return getMvpUiClient().request({
      method: "GET",
      path: `/admin/archive/contributions${query}`,
      realm: "staff",
      schema: contributionListResponseSchema,
    });
  },

  getById: (id: string | number) =>
    getMvpUiClient().request({
      method: "GET",
      path: `/admin/archive/contributions/${id}`,
      realm: "staff",
      schema: contributionDetailSchema,
    }),

  updateStatus: (id: string | number, status: ContributionStatus) =>
    getMvpUiClient().request({
      method: "PATCH",
      path: `/admin/archive/contributions/${id}/status`,
      realm: "staff",
      body: { status },
      schema: z.object({
        id: z.union([z.string().uuid(), z.number()]),
        status: contributionStatusSchema,
        changed: z.boolean(),
        beforeStatus: z.string().optional(),
      }).strict(),
    }),

  assignStaff: (id: string | number, staffId: string | null) =>
    getMvpUiClient().request({
      method: "PATCH",
      path: `/admin/archive/contributions/${id}/assign`,
      realm: "staff",
      body: { staffId },
      schema: z.object({
        id: z.union([z.string().uuid(), z.number()]),
        assignedStaffId: z.string().nullable(),
        changed: z.boolean(),
        beforeAssignee: z.string().nullable().optional(),
      }).strict(),
    }),

  saveNotes: (id: string | number, curatorNotes: string) =>
    getMvpUiClient().request({
      method: "POST",
      path: `/admin/archive/contributions/${id}/notes`,
      realm: "staff",
      body: { curatorNotes },
      schema: z.object({
        id: z.union([z.string().uuid(), z.number()]),
        curatorNotes: z.string(),
      }).strict(),
    }),

  getDownloadUrl: (id: string | number, fileId: string | number) =>
    archiveAttachmentDownloadUrl(identityUiClientConfig(import.meta.env ?? {}), id, fileId),
};
