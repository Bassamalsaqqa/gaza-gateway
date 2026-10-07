import { z } from "zod";
import { ARCHIVE_CATALOG, VERIFIED_VIDEO_PRESENTATIONS } from "../catalog.ts";
import { SOURCE_REGISTRY } from "../sources.ts";
import { createArchiveRecordSchema, sourceRecordSchema, extractVerifiedYouTubeId } from "../schema.ts";
import type { ArchiveRecord, SourceRecord } from "../types.ts";
import { ArchiveDraftError, type ArchiveDraftEnvelope, type ArchiveIssue } from "./types.ts";

export const emptyArchiveDrafts = (): ArchiveDraftEnvelope => ({ schemaVersion: 1, revision: 0, records: {}, sources: {} });
const shape = z.object({
  schemaVersion: z.literal(1), revision: z.number().int().nonnegative().refine(Number.isSafeInteger),
  records: z.record(z.string(), z.unknown()).refine((r) => Object.keys(r).length <= ARCHIVE_CATALOG.length),
  sources: z.record(z.string(), z.unknown()).refine((r) => Object.keys(r).length <= 100),
}).strict();
const immutable = ["id", "slug", "medium", "mediaId", "youtubeId", "originalFilename", "intakeReference", "duplicateOf", "curatorPublicationStatus"] as const;
export const ARCHIVE_TIMELINE_IDS = Array.from(new Set(["planning", "opening", "operations", "closure", "memory", ...ARCHIVE_CATALOG.flatMap((r) => r.relatedTimelineEventIds ?? [])]));
const timelineIds = new Set(ARCHIVE_TIMELINE_IDS);
const recordIds = new Set(ARCHIVE_CATALOG.map((r) => r.id));

export function sameArchiveValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameArchiveValue(v, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
    return Object.keys(x).length === Object.keys(y).length && Object.keys(x).every((k) => Object.hasOwn(y, k) && sameArchiveValue(x[k], y[k]));
  }
  return false;
}
function safeUrl(value: string): boolean {
  try { const u = new URL(value); return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}
function validDate(value: string, precision = "exact"): boolean {
  if (precision === "circa") return value.length <= 100;
  if (precision === "unknown") return true;
  const regex = precision === "year" ? /^\d{4}$/ : precision === "month" ? /^\d{4}-(0[1-9]|1[0-2])$/ : /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (!regex.test(value)) return false;
  const day = precision === "year" ? `${value}-01-01` : precision === "month" ? `${value}-01` : value;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
}
function bounds(value: unknown, path: string, issues: ArchiveIssue[], depth = 0): void {
  if (depth > 5) { issues.push({ path, rule: "bounded_metadata" }); return; }
  if (typeof value === "string" && (value.length > 5000 || /<\/?[a-z][^>]*>|javascript\s*:/i.test(value) ||
    Array.from(value).some((c) => c.charCodeAt(0) < 32 && ![9, 10, 13].includes(c.charCodeAt(0))))) issues.push({ path, rule: "plain_text" });
  if (Array.isArray(value)) {
    if (value.length > 100) issues.push({ path, rule: "bounded_metadata" });
    value.forEach((v, i) => bounds(v, `${path}.${i}`, issues, depth + 1));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) bounds(v, path ? `${path}.${k}` : k, issues, depth + 1);
  }
}
function unique(list: string[] | undefined, path: string, issues: ArchiveIssue[]) {
  if (list && new Set(list).size !== list.length) issues.push({ path, rule: "duplicate_reference" });
}

/** Always revalidates the WHOLE projected catalog, so source edits cannot invalidate a saved record. */
export function validateArchiveDrafts(raw: unknown): ArchiveDraftEnvelope {
  const parsed = shape.safeParse(raw);
  if (!parsed.success) throw new ArchiveDraftError("invalid_draft", parsed.error.issues.map((i) => ({ path: i.path.join("."), rule: "envelope" })));
  const issues: ArchiveIssue[] = [];
  const state = structuredClone(parsed.data) as ArchiveDraftEnvelope;
  const sources: Record<string, SourceRecord> = { ...SOURCE_REGISTRY };
  for (const [id, rawSource] of Object.entries(state.sources)) {
    const result = sourceRecordSchema.safeParse(rawSource);
    if (!result.success) {
      issues.push(...result.error.issues.map((i) => ({ path: `sources.${id}.${i.path.join(".")}`, rule: "source_schema" })));
      continue;
    }
    const s = Object.fromEntries(Object.entries(result.data).filter(([, v]) => v !== undefined)) as unknown as SourceRecord;
    if (s.id !== id || id.length > 100 || !/^src-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) issues.push({ path: `sources.${id}.id`, rule: "identity" });
    bounds(s, `sources.${id}`, issues);
    if (!safeUrl(s.url)) issues.push({ path: `sources.${id}.url`, rule: "safe_url" });
    for (const field of ["publicationDate", "eventDate", "accessedAt"] as const) {
      const v = s[field];
      if (v && !validDate(v, /^\d{4}$/.test(v) ? "year" : /^\d{4}-\d{2}$/.test(v) ? "month" : "exact")) issues.push({ path: `sources.${id}.${field}`, rule: "calendar_date" });
    }
    // Parsed values are detached and trimmed by the accepted schemas.
    state.sources[id] = s;
    sources[id] = s;
  }
  const schema = createArchiveRecordSchema(sources);
  for (const presentation of VERIFIED_VIDEO_PRESENTATIONS) {
    const source = sources[presentation.sourceRef];
    if (!source || source.type !== "video" || extractVerifiedYouTubeId(source.url) !== presentation.expectedYouTubeId) {
      issues.push({ path: `sources.${presentation.sourceRef}.url`, rule: "verified_video_reference" });
    }
  }
  for (const [id, r] of Object.entries(state.records)) {
    const compiled = ARCHIVE_CATALOG.find((c) => c.id === id);
    if (!compiled) { issues.push({ path: `records.${id}.id`, rule: "unknown_record" }); continue; }
    if (!r || typeof r !== "object" || Array.isArray(r)) { issues.push({ path: `records.${id}`, rule: "record_schema" }); continue; }
    for (const field of immutable) if (!sameArchiveValue(r[field], compiled[field])) issues.push({ path: `records.${id}.${field}`, rule: "immutable_intake" });
    bounds(r, `records.${id}`, issues);
  }
  for (const compiled of ARCHIVE_CATALOG) {
    const r = state.records[compiled.id] ?? compiled;
    const prefix = `records.${compiled.id}`;
    const result = schema.safeParse(r);
    if (!result.success) {
      issues.push(...result.error.issues.map((i) => ({ path: `${prefix}.${i.path.join(".")}`, rule: "hc_guard" })));
      continue;
    }
    if (!Object.hasOwn(state.records, compiled.id)) continue;
    const value = Object.fromEntries(Object.entries(result.data).filter(([, v]) => v !== undefined)) as unknown as ArchiveRecord;
    if (value.publicationState === "published" && !value.publicationBasis) issues.push({ path: `${prefix}.publicationBasis`, rule: "publication_basis" });
    if (value.datePrecision !== "unknown" && (!value.date || !validDate(value.date, value.datePrecision))) issues.push({ path: `${prefix}.date`, rule: "calendar_date" });
    for (const field of ["licenseUrl", "statementUri"] as const) if (value.rights[field] && !safeUrl(value.rights[field]!)) issues.push({ path: `${prefix}.rights.${field}`, rule: "safe_url" });
    for (const field of ["subjects", "sourceRefs", "people", "relatedRecordIds", "relatedTimelineEventIds"] as const) unique(value[field], `${prefix}.${field}`, issues);
    if (value.relatedRecordIds?.some((ref) => !recordIds.has(ref) || ref === value.id)) issues.push({ path: `${prefix}.relatedRecordIds`, rule: "record_reference" });
    if (value.relatedTimelineEventIds?.some((ref) => !timelineIds.has(ref))) issues.push({ path: `${prefix}.relatedTimelineEventIds`, rule: "timeline_reference" });
    state.records[compiled.id] = value;
  }
  if (issues.length) throw new ArchiveDraftError("invalid_draft", issues);
  return state;
}
