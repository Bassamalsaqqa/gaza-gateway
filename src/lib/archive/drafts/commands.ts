import { executeAuditedAdminCommand } from "../../activity/audit-recorder.ts";
import type { ActivityActorSnapshot, ActivityRepository } from "../../activity/types.ts";
import { ArchiveDraftError, type ArchiveDraftRepository, type ArchiveDraftKind, type ArchiveDraftMap, type ArchiveWriteOptions } from "./types.ts";

export interface ArchiveCommandContext {
  archiveDrafts: ArchiveDraftRepository;
  activity: ActivityRepository;
  actor: ActivityActorSnapshot | null;
  onAuditWarning?: (message: string) => void;
}
function requireEditor(context: ArchiveCommandContext): void {
  if (!context.actor || !["admin", "editor"].includes(context.actor.role)) throw new ArchiveDraftError("permission_denied");
}
export async function saveArchiveDraft<K extends ArchiveDraftKind>(context: ArchiveCommandContext, kind: K, value: ArchiveDraftMap[K], options: ArchiveWriteOptions<K>) {
  requireEditor(context);
  return executeAuditedAdminCommand({
    domainCommand: () => context.archiveDrafts.save(kind, value, options), activityRepo: context.activity, actor: context.actor,
    isNoOp: (receipt) => !receipt.changed,
    event: (receipt) => ({
      module: "content", action: "updated", targetType: `archive_${receipt.kind}_draft`, targetId: receipt.id,
      before: receipt.beforeState, after: receipt.afterState,
      metadata: { action: "save_archive_draft", count: receipt.fields.length, summary: receipt.fields.join(",") },
    }),
    ...(context.onAuditWarning ? { onAuditWarning: context.onAuditWarning } : {}),
  });
}
export async function discardArchiveDraft<K extends ArchiveDraftKind>(context: ArchiveCommandContext, kind: K, id: string, options: ArchiveWriteOptions<K>) {
  requireEditor(context);
  return executeAuditedAdminCommand({
    domainCommand: () => context.archiveDrafts.discard(kind, id, options), activityRepo: context.activity, actor: context.actor,
    isNoOp: (receipt) => !receipt.changed,
    event: (receipt) => ({
      module: "content", action: "cleared", targetType: `archive_${receipt.kind}_draft`, targetId: receipt.id,
      before: "local_draft", after: "compiled", metadata: { action: "discard_archive_draft", count: receipt.fields.length, summary: receipt.fields.join(",") },
    }),
    ...(context.onAuditWarning ? { onAuditWarning: context.onAuditWarning } : {}),
  });
}
