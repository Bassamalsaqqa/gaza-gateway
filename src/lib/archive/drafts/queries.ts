import { useQuery, useMutation } from "@tanstack/react-query";
import { useRepositories } from "../../repositories/registry.ts";
import { useAdmin } from "../../admin-store.tsx";
import { useI18n } from "../../i18n.tsx";
import { archiveDraftKeys } from "./keys.ts";
import { saveArchiveDraft, discardArchiveDraft } from "./commands.ts";
import type { ArchiveDraftKind, ArchiveDraftMap } from "./types.ts";

export function useArchiveDraftSnapshot(enabled = true) {
  const { archiveDrafts } = useRepositories();
  return useQuery({ queryKey: archiveDraftKeys.snapshot, queryFn: () => archiveDrafts.getSnapshot(), enabled, retry: false });
}
function useCommandContext() {
  const { archiveDrafts, activity } = useRepositories();
  const { actor, toast } = useAdmin();
  const { t } = useI18n();
  return { archiveDrafts, activity, actor, onAuditWarning: () => toast(t("a2.ac.auditWarning")) };
}
export function useSaveArchiveDraft<K extends ArchiveDraftKind>(kind: K) {
  const context = useCommandContext();
  return useMutation({ mutationFn: (input: { value: ArchiveDraftMap[K]; expectedDraft: ArchiveDraftMap[K] | null }) => saveArchiveDraft(context, kind, input.value, { expectedDraft: input.expectedDraft }) });
}
export function useDiscardArchiveDraft<K extends ArchiveDraftKind>(kind: K) {
  const context = useCommandContext();
  return useMutation({ mutationFn: (input: { id: string; expectedDraft: ArchiveDraftMap[K] | null }) => discardArchiveDraft(context, kind, input.id, { expectedDraft: input.expectedDraft }) });
}
