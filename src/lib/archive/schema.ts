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

export const publicationBasisSchema = z.enum([
  "rights-cleared",
  "product-owner-directed-display",
  "external-embed",
]);

export const archiveSubjectSchema = z.enum([
  "airport-architecture",
  "operations-services",
  "interior-passenger-spaces",
  "aircraft-fleet",
  "crew-staff",
  "passengers-pilgrimage",
  "humanitarian-aviation",
  "official-visits",
  "damage-ruins",
  "documents-ephemera",
  "illustrations",
]);

export const localizedArchiveTextSchema = z.object({
  en: z.string().trim().min(1, "English text must not be empty"),
  ar: z.string().trim().min(1, "Arabic text must not be empty"),
}).strict();

export interface EligibleOwnerIntakeRecord {
  id: string;
  originalFilename: string;
  intakeReference: string;
  medium: "photograph" | "document";
  mediaId: string;
}

export const ELIGIBLE_OWNER_INTAKE_REGISTRY: Record<string, EligibleOwnerIntakeRecord> = {
  "past-003": { id: "past-003", originalFilename: "Gaza-Airport-Past-Airplane-1.jpg", intakeReference: "past-003", medium: "photograph", mediaId: "past-003" },
  "past-005": { id: "past-005", originalFilename: "Gaza-Airport-Past-Airplane-3.jpg", intakeReference: "past-005", medium: "photograph", mediaId: "past-005" },
  "past-006": { id: "past-006", originalFilename: "Gaza-Airport-Past-Airplane-Flight-Attendant-Female-Working.jpg", intakeReference: "past-006", medium: "photograph", mediaId: "past-006" },
  "past-007": { id: "past-007", originalFilename: "Gaza-Airport-Past-Airplane-Flight-Crew-Members.jpg", intakeReference: "past-007", medium: "photograph", mediaId: "past-007" },
  "past-008": { id: "past-008", originalFilename: "Gaza-Airport-Past-Airplane-Flight-Crew-Members-Cabin-Captain-In-Flight.jpg", intakeReference: "past-008", medium: "photograph", mediaId: "past-008" },
  "past-009": { id: "past-009", originalFilename: "Gaza-Airport-Past-Airplane-Flight-Four-Pilots-Photo.jpg", intakeReference: "past-009", medium: "photograph", mediaId: "past-009" },
  "past-010": { id: "past-010", originalFilename: "Gaza-Airport-Past-Airplane-Loading-People-Working.jpg", intakeReference: "past-010", medium: "photograph", mediaId: "past-010" },
  "past-011": { id: "past-011", originalFilename: "Gaza-Airport-Past-Airplane-Passengers-Returning-Home.jpg", intakeReference: "past-011", medium: "photograph", mediaId: "past-011" },
  "past-012": { id: "past-012", originalFilename: "Gaza-Airport-Past-Airplane-Passengers-Returning-Home-1.jpg", intakeReference: "past-012", medium: "photograph", mediaId: "past-012" },
  "past-014": { id: "past-014", originalFilename: "Gaza-Airport-Past-Airplane-Pilgrim-Woman-Looking-Back-Heading-To-Makkah-Palestinian-Airplines.jpg", intakeReference: "past-014", medium: "photograph", mediaId: "past-014" },
  "past-015": { id: "past-015", originalFilename: "Gaza-Airport-Past-Airplane-Pilgrim-Women-Returning-Home.jpg", intakeReference: "past-015", medium: "photograph", mediaId: "past-015" },
  "past-016": { id: "past-016", originalFilename: "Gaza-Airport-Past-Airplane-Pilgrim-Women-Returning-Home-1.jpg", intakeReference: "past-016", medium: "photograph", mediaId: "past-016" },
  "past-021": { id: "past-021", originalFilename: "Gaza-Airport-Past-Exterior-Air-Cargo-Management.jpg", intakeReference: "past-021", medium: "photograph", mediaId: "past-021" },
  "past-022": { id: "past-022", originalFilename: "Gaza-Airport-Past-Exterior-Air-Cargo-Management-2.jpg", intakeReference: "past-022", medium: "photograph", mediaId: "past-022" },
  "past-023": { id: "past-023", originalFilename: "Gaza-Airport-Past-Exterior-Ambulance-Vehicle.jpg", intakeReference: "past-023", medium: "photograph", mediaId: "past-023" },
  "past-024": { id: "past-024", originalFilename: "Gaza-Airport-Past-Exterior-And-Garden.jpg", intakeReference: "past-024", medium: "photograph", mediaId: "past-024" },
  "past-026": { id: "past-026", originalFilename: "Gaza-Airport-Past-Exterior-Bombed-Partially.jpg", intakeReference: "past-026", medium: "photograph", mediaId: "past-026" },
  "past-028": { id: "past-028", originalFilename: "Gaza-Airport-Past-Exterior-Empty-Parking.jpg", intakeReference: "past-028", medium: "photograph", mediaId: "past-028" },
  "past-029": { id: "past-029", originalFilename: "Gaza-Airport-Past-Exterior-Feul-Tanks.jpg", intakeReference: "past-029", medium: "photograph", mediaId: "past-029" },
  "past-030": { id: "past-030", originalFilename: "Gaza-Airport-Past-Exterior-Fire-Fighter-Vehicle.jpg", intakeReference: "past-030", medium: "photograph", mediaId: "past-030" },
  "past-031": { id: "past-031", originalFilename: "Gaza-Airport-Past-Exterior-Intact.jpg", intakeReference: "past-031", medium: "photograph", mediaId: "past-031" },
  "past-032": { id: "past-032", originalFilename: "Gaza-Airport-Past-Exterior-Intact-1.jpg", intakeReference: "past-032", medium: "photograph", mediaId: "past-032" },
  "past-033": { id: "past-033", originalFilename: "Gaza-Airport-Past-Exterior-Intact-2.jpg", intakeReference: "past-033", medium: "photograph", mediaId: "past-033" },
  "past-038": { id: "past-038", originalFilename: "Gaza-Airport-Past-Exterior-Security-Guards-Praying-Garden.jpg", intakeReference: "past-038", medium: "photograph", mediaId: "past-038" },
  "past-040": { id: "past-040", originalFilename: "Gaza-Airport-Past-Exterior-Tower-Intact-2.jpg", intakeReference: "past-040", medium: "photograph", mediaId: "past-040" },
  "past-042": { id: "past-042", originalFilename: "Gaza-Airport-Past-Interior-Baggage-Claim.jpg", intakeReference: "past-042", medium: "photograph", mediaId: "past-042" },
  "past-043": { id: "past-043", originalFilename: "Gaza-Airport-Past-Interior-Baggage-Claim-1.jpg", intakeReference: "past-043", medium: "photograph", mediaId: "past-043" },
  "past-044": { id: "past-044", originalFilename: "Gaza-Airport-Past-Interior-Bank-1.jpg", intakeReference: "past-044", medium: "photograph", mediaId: "past-044" },
  "past-045": { id: "past-045", originalFilename: "Gaza-Airport-Past-Interior-Boarding-Area-1.jpg", intakeReference: "past-045", medium: "photograph", mediaId: "past-045" },
  "past-046": { id: "past-046", originalFilename: "Gaza-Airport-Past-Interior-Hall-1.jpg", intakeReference: "past-046", medium: "photograph", mediaId: "past-046" },
  "past-049": { id: "past-049", originalFilename: "Gaza-Airport-Past-Interior-People-In-The-Hall.jpg", intakeReference: "past-049", medium: "photograph", mediaId: "past-049" },
  "past-050": { id: "past-050", originalFilename: "Gaza-Airport-Past-Interior-Real-Photo.jpg", intakeReference: "past-050", medium: "photograph", mediaId: "past-050" },
  "past-051": { id: "past-051", originalFilename: "Gaza-Airport-Past-Interior-Security-Check-Area-1.jpg", intakeReference: "past-051", medium: "photograph", mediaId: "past-051" },
  "past-053": { id: "past-053", originalFilename: "Gaza-Airport-Past-Interior-Waiting-Area-Hall-1.jpg", intakeReference: "past-053", medium: "photograph", mediaId: "past-053" },
  "past-054": { id: "past-054", originalFilename: "Gaza-Airport-Past-Palestinian-Authority-Stamp-08.04.200-Passport-Control-Going-Out.jpg", intakeReference: "past-054", medium: "document", mediaId: "past-054" },
  "past-056": { id: "past-056", originalFilename: "Gaza-Airport-Past-Tower-Control-People-Working.jpg", intakeReference: "past-056", medium: "photograph", mediaId: "past-056" },
  "past-058": { id: "past-058", originalFilename: "مطار-غزة-الدولي-768x484.jpg", intakeReference: "past-058", medium: "photograph", mediaId: "past-058" },
};

export const ELIGIBLE_OWNER_INTAKE_IDS = new Set<string>(
  Object.keys(ELIGIBLE_OWNER_INTAKE_REGISTRY)
);

export const PROHIBITED_RIGHTS_HOLDERS = [
  /getty/i,
  /reuters/i,
  /airliners\.net/i,
  /associated press/i,
  /\bafp\b/i,
  /agence france-presse/i,
  /journeyman/i,
];

/**
 * Resolves and validates a canonical 11-character YouTube video ID from an HTTPS URL.
 * Strictly verifies HTTPS protocol and allowed upstream YouTube hostnames.
 * Rejects non-HTTPS (e.g. HTTP), spoofed/arbitrary hostnames, and invalid ID formats.
 */
export function extractVerifiedYouTubeId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") {
      return null;
    }
    const hostname = parsed.hostname.toLowerCase();
    const ALLOWED_YOUTUBE_HOSTS = new Set([
      "www.youtube.com",
      "youtube.com",
      "m.youtube.com",
      "youtu.be",
      "www.youtube-nocookie.com",
    ]);
    if (!ALLOWED_YOUTUBE_HOSTS.has(hostname)) {
      return null;
    }

    let candidateId: string | null = null;
    if (hostname === "youtu.be") {
      candidateId = parsed.pathname.slice(1).split("/")[0] || null;
    } else if (parsed.pathname === "/watch") {
      candidateId = parsed.searchParams.get("v");
    } else if (parsed.pathname.startsWith("/embed/")) {
      candidateId = parsed.pathname.slice(7).split("/")[0] || null;
    }

    if (candidateId && /^[a-zA-Z0-9_-]{11}$/.test(candidateId)) {
      return candidateId;
    }
    return null;
  } catch {
    return null;
  }
}

export const archiveRecordSchema = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  medium: mediumSchema,
  phase: historicalPhaseSchema,
  subjects: z.array(archiveSubjectSchema),
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
  publicationBasis: publicationBasisSchema.optional(),
  curatorPublicationStatus: z.string().optional(),
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

  // 3. Non-documentary illustration exclusion guard
  if (
    (record.medium === "illustration" || record.subjects.includes("illustrations")) &&
    record.publicationState === "published"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Record "${record.id}" is an illustration and cannot be published in the documentary stream`,
      path: ["publicationState"],
    });
  }

  // 4. Resolving sourceRefs validation (all sourceRefs must resolve)
  for (const ref of record.sourceRefs) {
    if (!SOURCE_REGISTRY[ref]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unresolved sourceRef: ${ref}`,
        path: ["sourceRefs"],
      });
    }
  }

  // 5. Invariants for Published Records
  if (record.publicationState === "published") {
    // 5a. Product owner-directed display publication basis
    if (record.publicationBasis === "product-owner-directed-display") {
      // Must resolve to an explicitly eligible owner-intake record
      const eligible = ELIGIBLE_OWNER_INTAKE_REGISTRY[record.id];
      if (!eligible) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Record "${record.id}" is not in the audited list of eligible owner-intake records for product-owner-directed-display`,
          path: ["id"],
        });
      } else {
        // Intake reference must strictly match canonical intake reference
        if (record.intakeReference !== eligible.intakeReference) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Published owner-directed record "${record.id}" must have matching intakeReference "${eligible.intakeReference}", got "${record.intakeReference ?? "undefined"}"`,
            path: ["intakeReference"],
          });
        }

        // originalFilename must strictly match canonical audited filename
        if (record.originalFilename !== eligible.originalFilename) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Published owner-directed record "${record.id}" must have audited originalFilename "${eligible.originalFilename}", got "${record.originalFilename ?? "undefined"}"`,
            path: ["originalFilename"],
          });
        }

        // medium must strictly match canonical audited medium
        if (record.medium !== eligible.medium) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Published owner-directed record "${record.id}" must have audited medium "${eligible.medium}", got "${record.medium}"`,
            path: ["medium"],
          });
        }

        // mediaId must strictly match canonical audited mediaId
        if (record.mediaId !== eligible.mediaId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Published owner-directed record "${record.id}" must have audited mediaId "${eligible.mediaId}", got "${record.mediaId ?? "undefined"}"`,
            path: ["mediaId"],
          });
        }
      }

      // Curator publication status must strictly be "staging-rights-review"
      if (record.curatorPublicationStatus !== "staging-rights-review") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Published owner-directed record "${record.id}" must have curatorPublicationStatus "staging-rights-review", got "${record.curatorPublicationStatus ?? "undefined"}"`,
          path: ["curatorPublicationStatus"],
        });
      }

      // Cannot have youtubeId
      if (record.youtubeId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Published owner-directed display record cannot have a youtubeId",
          path: ["youtubeId"],
        });
      }

      // Medium cannot be illustration or video
      if (record.medium === "illustration" || record.medium === "video") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Published owner-directed display record cannot have medium "${record.medium}"`,
          path: ["medium"],
        });
      }

      // Known rights-managed or agency-held material CANNOT bypass hold via owner-directed display
      if (record.rights.status === "rights-managed") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Record "${record.id}" has rights.status "rights-managed" and cannot be published under owner-directed display without verified license clearance`,
          path: ["rights", "status"],
        });
      }

      const holder = record.rights.holder ?? "";
      const credit = record.rights.credit ?? "";
      if (PROHIBITED_RIGHTS_HOLDERS.some((p) => p.test(holder) || p.test(credit))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Record "${record.id}" references third-party agency rights holder/credit ("${holder || credit}") and cannot publish under owner-directed display`,
          path: ["rights", holder ? "holder" : "credit"],
        });
      }

      // If rights.status is unknown, credit must provide honest archive intake attribution
      if (record.rights.status === "unknown" && (!credit || credit.trim().length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Published owner-directed record "${record.id}" with unknown rights must specify credit`,
          path: ["rights", "credit"],
        });
      }
      // Note: NO early return!
    }

    // 5b. External embed basis (e.g. video references)
    if (record.publicationBasis === "external-embed") {
      // Must be video medium
      if (record.medium !== "video") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `External embed publication basis requires medium "video", got "${record.medium}"`,
          path: ["medium"],
        });
      }

      // Cannot authorize local mediaId
      if (record.mediaId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `External embed record cannot have a local mediaId ("${record.mediaId}")`,
          path: ["mediaId"],
        });
      }

      // Must have valid 11-character youtubeId
      if (!record.youtubeId || !/^[a-zA-Z0-9_-]{11}$/.test(record.youtubeId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "External embed record must have a valid 11-character youtubeId",
          path: ["youtubeId"],
        });
      }

      // Must have at least one sourceRef
      if (!record.sourceRefs || record.sourceRefs.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "External embed record must cite at least one sourceRef in SOURCE_REGISTRY",
          path: ["sourceRefs"],
        });
      } else {
        // Must resolve to an actual video SourceRecord with matching verified HTTPS YouTube URL
        const matchingSrc = record.sourceRefs
          .map((ref) => SOURCE_REGISTRY[ref])
          .find((src) => src && src.type === "video");

        if (!matchingSrc) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `External embed record "${record.id}" must reference a verified video SourceRecord in SOURCE_REGISTRY`,
            path: ["sourceRefs"],
          });
        } else {
          const verifiedSrcYouTubeId = extractVerifiedYouTubeId(matchingSrc.url);
          if (!verifiedSrcYouTubeId) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `SourceRecord "${matchingSrc.id}" has invalid, insecure, or spoofed video URL: "${matchingSrc.url}"`,
              path: ["sourceRefs"],
            });
          } else if (record.youtubeId !== verifiedSrcYouTubeId) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `External embed record youtubeId "${record.youtubeId}" does not match verified sourceRef YouTube ID "${verifiedSrcYouTubeId}" from "${matchingSrc.url}"`,
              path: ["youtubeId"],
            });
          }
        }
      }

      // Rights-managed material cannot bypass holds
      if (record.rights.status === "rights-managed") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "External embed record cannot publish rights-managed material without license clearance",
          path: ["rights", "status"],
        });
      }
      // Note: NO early return!
    }

    // 5c. Rights-cleared publication basis (default for licensed/cleared records)
    if (
      !record.publicationBasis ||
      record.publicationBasis === "rights-cleared"
    ) {
      // Date must be known and non-empty
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

      // Rights: rights-managed or unknown cannot be published without explicit permission
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
    }

    // 5d. Universal licensing obligations across all publication bases
    // Licensed / attribution-license must have non-empty license name, valid licenseUrl, AND credit
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

    // Owner-cleared must have non-empty holder, credit, or statementUri
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

    // Public-domain must have non-empty statementUri, credit, or holder
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

    // Verified records must have at least one sourceRef
    if (record.evidenceStatus === "verified" && record.sourceRefs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Published verified record must cite at least one sourceRef",
        path: ["sourceRefs"],
      });
    }
  }
});
