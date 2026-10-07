import type { ArchiveIssue } from "../../../lib/archive/drafts/types.ts";

/** Map canonical issues to this editor only; other catalog failures remain visible summaries. */
export function archiveEditorIssues(issues: ArchiveIssue[], kind: "record" | "source", id: string) {
  const prefix = `${kind === "record" ? "records" : "sources"}.${id}.`;
  const errors: Record<string, string> = {};
  const related = new Set<string>();
  for (const issue of issues) {
    if (!issue.path.startsWith(prefix)) { related.add(issue.path); continue; }
    let field = issue.path.slice(prefix.length).replace(/\.\d+(?:\..*)?$/, "");
    if (field === "rights") field = "rights.status";
    if (kind === "record" && field === "id" && issue.rule === "hc_guard") field = "publicationBasis";
    const keys: Record<string, string> = {
      identity: "sourceId", safe_url: "safeUrl", calendar_date: "calendarDate",
      plain_text: "plainText", duplicate_reference: "uniqueReference",
      publication_basis: "publicationBasis", hc_guard: "hcGuard",
      bounded_metadata: "boundedMetadata", verified_video_reference: "hcGuard",
      record_reference: "uniqueReference", timeline_reference: "uniqueReference",
    };
    errors[field] = `archive.error.${keys[issue.rule] ?? "required"}`;
  }
  return { errors, related: [...related], first: Object.keys(errors)[0] ?? null };
}
