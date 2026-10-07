import { useMutation, useQuery } from "@tanstack/react-query";
import { useRepositories } from "../lib/repositories/registry.ts";
import { useAdmin } from "../lib/admin-store.tsx";
import { useI18n } from "../lib/i18n.tsx";
import { contentKeys } from "./keys.ts";
import { discardContentDraft, saveContentDraft } from "./commands.ts";
import type { ContentKey, ContentMap } from "./types.ts";
import { loadContentInventory } from "./inventory.ts";

export function useContentInventoryQuery(enabled = true) {
  const { content } = useRepositories();
  return useQuery({ queryKey: contentKeys.inventory, queryFn: () => loadContentInventory(content), enabled, retry: false });
}

export function useContentDocumentQuery<K extends ContentKey>(key: K) {
  const { content } = useRepositories();
  return useQuery({
    queryKey: contentKeys.document(key),
    queryFn: async () => {
      const [published, draft] = await Promise.all([content.getPublished(key), content.getDraft(key)]);
      return { published, draft };
    },
    retry: false,
  });
}

function useContentCommandContext() {
  const { content, activity } = useRepositories();
  const { actor, toast } = useAdmin();
  const { t } = useI18n();
  return { content, activity, actor, onAuditWarning: () => toast(t("a2.ac.auditWarning")) };
}

export function useSaveContentDraft<K extends ContentKey>(key: K) {
  const context = useContentCommandContext();
  return useMutation({ mutationFn: (input: { document: ContentMap[K]; expectedDraft: ContentMap[K] | null }) =>
    saveContentDraft(context, key, input.document, { expectedDraft: input.expectedDraft }) });
}

export function useDiscardContentDraft<K extends ContentKey>(key: K) {
  const context = useContentCommandContext();
  return useMutation({ mutationFn: (input: { expectedDraft: ContentMap[K] | null }) =>
    discardContentDraft(context, key, { expectedDraft: input.expectedDraft }) });
}
