import { executeAuditedAdminCommand } from "../lib/activity/audit-recorder.ts";
import type { ActivityActorSnapshot, ActivityRepository } from "../lib/activity/types.ts";
import { ContentError, type ContentRepository, type ContentWriteOptions } from "./repository.ts";
import type { ContentKey, ContentMap } from "./types.ts";

export type ContentCommandContext = {
  content: ContentRepository;
  activity: ActivityRepository;
  actor: ActivityActorSnapshot | null;
  onAuditWarning?: (message: string) => void;
};

function requireEditor(context: ContentCommandContext): void {
  if (!context.actor || (context.actor.role !== "admin" && context.actor.role !== "editor")) {
    throw new ContentError("permission_denied");
  }
}

/** Content commits first. Audit failure warns and never pretends the draft was rolled back. */
export async function saveContentDraft<K extends ContentKey>(
  context: ContentCommandContext, key: K, document: ContentMap[K], options?: ContentWriteOptions<K>,
) {
  requireEditor(context);
  return executeAuditedAdminCommand({
    domainCommand: () => context.content.saveDraftWithReceipt(key, document, options),
    activityRepo: context.activity,
    actor: context.actor,
    isNoOp: (receipt) => !receipt.changed,
    event: (receipt) => ({
      module: "content", action: "updated", targetType: "content_draft", targetId: receipt.key,
      before: receipt.before === null ? "absent" : "saved", after: "saved",
      metadata: {
        key: receipt.key, action: "save_draft",
        count: receipt.changes.added + receipt.changes.removed + receipt.changes.reordered + receipt.changes.visibility,
        summary: `added=${receipt.changes.added};removed=${receipt.changes.removed};reordered=${receipt.changes.reordered};visibility=${receipt.changes.visibility}`,
      },
    }),
    ...(context.onAuditWarning ? { onAuditWarning: context.onAuditWarning } : {}),
  });
}

export async function discardContentDraft<K extends ContentKey>(
  context: ContentCommandContext, key: K, options?: ContentWriteOptions<K>,
) {
  requireEditor(context);
  return executeAuditedAdminCommand({
    domainCommand: () => context.content.discardDraftWithReceipt(key, options),
    activityRepo: context.activity,
    actor: context.actor,
    isNoOp: (receipt) => !receipt.changed,
    event: (receipt) => ({
      module: "content", action: "cleared", targetType: "content_draft", targetId: receipt.key,
      before: "saved", after: "absent", metadata: { key: receipt.key, action: "discard_draft" },
    }),
    ...(context.onAuditWarning ? { onAuditWarning: context.onAuditWarning } : {}),
  });
}
