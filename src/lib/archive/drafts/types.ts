import type { ArchiveRecord, SourceRecord } from "../types.ts";

export type ArchiveDraftKind = "record" | "source";
export type ArchiveDraftMap = { record: ArchiveRecord; source: SourceRecord };
export interface ArchiveDraftEnvelope {
  schemaVersion: 1;
  revision: number;
  records: Record<string, ArchiveRecord>;
  sources: Record<string, SourceRecord>;
}
export interface ArchiveDraftSnapshot {
  revision: number;
  compiledRecords: ArchiveRecord[];
  compiledSources: SourceRecord[];
  records: ArchiveRecord[];
  sources: SourceRecord[];
  recordDrafts: Record<string, ArchiveRecord>;
  sourceDrafts: Record<string, SourceRecord>;
}
export type ArchiveDraftCode = "invalid_draft" | "unknown_record" | "draft_conflict" |
  "corrupt_store" | "unsupported_version" | "storage_unavailable" | "write_failed" |
  "coordination_unavailable" | "permission_denied";
export type ArchiveIssue = { path: string; rule: string };
export class ArchiveDraftError extends Error {
  readonly code: ArchiveDraftCode;
  readonly issues: ArchiveIssue[];
  constructor(code: ArchiveDraftCode, issues: ArchiveIssue[] = []) {
    super(`Archive draft operation failed: ${code}`);
    this.name = "ArchiveDraftError";
    this.code = code;
    this.issues = issues;
  }
}
/** Expected saved draft is REQUIRED; null means no saved local draft, not compiled content. */
export type ArchiveWriteOptions<K extends ArchiveDraftKind> = { expectedDraft: ArchiveDraftMap[K] | null };
export type ArchiveDraftReceipt<K extends ArchiveDraftKind> = {
  kind: K; id: string; changed: boolean;
  before: ArchiveDraftMap[K] | null; after: ArchiveDraftMap[K] | null;
  /** Changed root fields relative to the previous effective local metadata (compiled if no draft). */
  fields: string[];
  beforeState: string; afterState: string;
};
export interface ArchiveDraftRepository {
  getSnapshot(): Promise<ArchiveDraftSnapshot>;
  save<K extends ArchiveDraftKind>(kind: K, value: ArchiveDraftMap[K], options: ArchiveWriteOptions<K>): Promise<ArchiveDraftReceipt<K>>;
  discard<K extends ArchiveDraftKind>(kind: K, id: string, options: ArchiveWriteOptions<K>): Promise<ArchiveDraftReceipt<K>>;
  subscribe(listener: () => void): () => void;
}
