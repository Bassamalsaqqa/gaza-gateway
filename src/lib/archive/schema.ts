/**
 * Gaza Gateway — Archive & Rights Zod Validation Schema (HC-1)
 *
 * Implements strict schema validation for archive records and source citations,
 * guaranteeing archival integrity, bilingual completeness, licensing compliance,
 * and canonical truth boundaries.
 */

import { z } from "zod";
import { APPROVED_MEDIA_CATALOG } from "../media-policy.ts";
import { SOURCE_REGISTRY } from "./sources.ts";

export const publicationStateSchema = z.enum([
  "published",
  "staging",
  "hold-rights",
  "hold-provenance",
  "excluded",
]);

export const rightsStatusSchema = z.enum([
  "owner-cleared",
  "public-domain",
  "licensed",
  "attribution-license",
  "rights-managed",
  "unknown",
]);

export const evidenceStatusSchema = z.enum([
  "verified",
  "partially-verified",
  "unverified",
]);

export const mediumSchema = z.enum([
  "photograph",
  "document",
  "video",
  "illustration",
]);

export const historicalPhaseSchema = z.enum([
  "planning-construction",
  "opening-golden-era",
  "closure-destruction",
  "post-destruction-ruins",
  "contemporary-status",
]);

export const datePrecisionSchema = z.enum([
  "exact",
  "month",
  "year",
  "circa",
  "unknown",
]);

export const sourceTypeSchema = z.enum([
  "treaty",
  "official-record",
  "press",
  "archive",
  "academic",
  "video",
]);

export const sourceRecordSchema = z.object({
  id: z.string().regex(/^src-[a-z0-9-]+$/),
  title: z.string().trim().min(3),
  titleAr: z.string().trim().min(3).optional(),
  publisher: z.string().trim().min(2),
  type: sourceTypeSchema,
  language: z.enum(["en", "ar", "he", "multilingual"]),
  publicationDate: z.string().optional(),
  eventDate: z.string().optional(),
  url: z.string().url(),
  accessedAt: z.string().optional(),
  archivalStatus: z.enum([
    "live",
    "archived-wayback",
    "official-repository",
    "print-record",
  ]).optional(),
  notes: z.string().optional(),
  notesAr: z.string().optional(),
}).strict();

export const archiveRightsSchema = z.object({
  status: rightsStatusSchema,
  license: z.string().optional(),
  licenseUrl: z.string().url().optional(),
  credit: z.string().optional(),
  holder: z.string().optional(),
  statementUri: z.string().url().optional(),
  modificationNote: z.string().optional(),
}).strict();

export const localizedArchiveTextSchema = z.object({
  en: z.string().trim().min(1, "English text must not be empty"),
  ar: z.string().trim().min(1, "Arabic text must not be empty"),
}).strict();

export const archiveRecordSchema = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  medium: mediumSchema,
  phase: historicalPhaseSchema,
  subjects: z.array(z.string().min(1)),
  title: localizedArchiveTextSchema,
  caption: localizedArchiveTextSchema,
  alt: localizedArchiveTextSchema,
  date: z.string().trim().min(1).optional(),
  datePrecision: datePrecisionSchema,
  people: z.array(z.string()).optional(),
  location: z.string().optional(),
  mediaId: z.string().optional(),
  youtubeId: z.string().optional(),
  evidenceStatus: evidenceStatusSchema,
  sourceRefs: z.array(z.string()),
  rights: archiveRightsSchema,
  publicationState: publicationStateSchema,
  relatedTimelineEventIds: z.array(z.string()).optional(),
  relatedRecordIds: z.array(z.string()).optional(),
  featured: z.boolean().optional(),
  originalFilename: z.string().optional(),
  intakeReference: z.string().optional(),
  duplicateOf: z.string().optional(),
  factCheckNotes: z.string().optional(),
}).strict().superRefine((record, ctx) => {
  // 1. mediaId Truth Class & Catalog Guard
  if (record.mediaId) {
    const truthClass = (APPROVED_MEDIA_CATALOG as Record<string, string | undefined>)[record.mediaId];
    if (!truthClass) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `mediaId "${record.mediaId}" is not registered in APPROVED_MEDIA_CATALOG`,
        path: ["mediaId"],
      });
    } else if (truthClass !== "historical-documentary") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `mediaId "${record.mediaId}" has truthClass "${truthClass}". Documentary archive records reject non-documentary or future concepts.`,
        path: ["mediaId"],
      });
    }
  }

  // 2. Duplicate Records Cannot Independently Publish
  if (record.duplicateOf && record.publicationState === "published") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Record "${record.id}" is a duplicate alias of "${record.duplicateOf}" and cannot be published independently`,
      path: ["publicationState"],
    });
  }

  // 3. Resolving sourceRefs validation (all sourceRefs must resolve)
  for (const ref of record.sourceRefs) {
    if (!SOURCE_REGISTRY[ref]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unresolved sourceRef: ${ref}`,
        path: ["sourceRefs"],
      });
    }
  }

  // 4. Invariants for Published Records
  if (record.publicationState === "published") {
    // 4a. Date must be known and non-empty
    if (!record.date || record.date.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Published record must have a valid non-empty date",
        path: ["date"],
      });
    }
    if (record.datePrecision === "unknown") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Published record cannot have unknown date precision",
        path: ["datePrecision"],
      });
    }

    // 4b. Rights: rights-managed or unknown cannot be published without explicit permission
    if (record.rights.status === "rights-managed") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Published record cannot be rights-managed without explicit proven license clearance",
        path: ["rights", "status"],
      });
    }
    if (record.rights.status === "unknown") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Published record cannot have unknown rights status",
        path: ["rights", "status"],
      });
    }

    // 4c. Licensed / attribution-license must have non-empty license name, valid licenseUrl, AND credit
    if (
      record.rights.status === "licensed" ||
      record.rights.status === "attribution-license"
    ) {
      const licenseTrimmed = record.rights.license?.trim();
      const creditTrimmed = record.rights.credit?.trim();
      const licenseUrlTrimmed = record.rights.licenseUrl?.trim();
      if (!licenseTrimmed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Licensed published record must specify a non-empty license name",
          path: ["rights", "license"],
        });
      }
      if (!creditTrimmed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Licensed published record must specify a non-empty credit",
          path: ["rights", "credit"],
        });
      }
      if (!licenseUrlTrimmed || !/^https?:\/\//.test(licenseUrlTrimmed)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Licensed published record must specify a valid licenseUrl",
          path: ["rights", "licenseUrl"],
        });
      }
    }

    // 4d. Owner-cleared must have non-empty holder, credit, or statementUri
    if (record.rights.status === "owner-cleared") {
      const holderTrimmed = record.rights.holder?.trim();
      const creditTrimmed = record.rights.credit?.trim();
      const statementTrimmed = record.rights.statementUri?.trim();
      if (!holderTrimmed && !creditTrimmed && !statementTrimmed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Owner-cleared published record must specify non-empty holder, credit, or statementUri",
          path: ["rights"],
        });
      }
    }

    // 4e. Public-domain must have non-empty statementUri, credit, or holder
    if (record.rights.status === "public-domain") {
      const holderTrimmed = record.rights.holder?.trim();
      const creditTrimmed = record.rights.credit?.trim();
      const statementTrimmed = record.rights.statementUri?.trim();
      if (!statementTrimmed && !creditTrimmed && !holderTrimmed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Public-domain published record must specify non-empty statementUri, credit, or holder",
          path: ["rights"],
        });
      }
    }

    // 4f. Verified records must have at least one sourceRef
    if (record.evidenceStatus === "verified" && record.sourceRefs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Published verified record must cite at least one sourceRef",
        path: ["sourceRefs"],
      });
    }
  }
});
