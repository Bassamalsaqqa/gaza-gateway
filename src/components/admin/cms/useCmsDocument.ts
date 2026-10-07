import { useCallback, useEffect, useMemo, useReducer } from "react";
import { useRepositories } from "@/lib/repositories/registry";
import { useAdmin } from "@/lib/admin-store";
import { useI18n } from "@/lib/i18n";
import { ContentError } from "@/content/repository";
import { saveContentDraft, discardContentDraft } from "@/content/commands";
import { contentValidationIssues } from "@/content/schema";
import type { ContentKey, ContentMap } from "@/content/types";
import { focusFirstInvalidField } from "./cms-validation";
import { CmsEditSession } from "./edit-session";

export interface UseCmsDocumentOptions<K extends ContentKey> {
  key: K;
  published: ContentMap[K];
  validate: (doc: ContentMap[K]) => Record<string, string>;
  editLang?: "en" | "ar";
  onInvalidField?: (field: string) => void;
}

export function useCmsDocument<K extends ContentKey>({ key, published, validate, editLang = "en", onInvalidField }: UseCmsDocumentOptions<K>) {
  const { content, activity } = useRepositories();
  const { actor, can, toast } = useAdmin();
  const { t } = useI18n();
  const [, render] = useReducer((value: number) => value + 1, 0);
  const { editor } = useMemo(() => ({ key, content, editor: new CmsEditSession(published) }), [key, published, content]);
  const errorMessage = useCallback((error: unknown) => t(`cms.error.${error instanceof ContentError ? error.code : "write_failed"}`), [t]);
  const readRemote = useCallback(async (reload = false) => {
    if (editor.busy) return;
    const epoch = editor.beginRead();
    try { editor.adoptRemote(await content.getDraft(key), epoch, reload); }
    catch (error) { editor.failRead(errorMessage(error), epoch); }
    if (editor.active) render();
  }, [content, key, editor, errorMessage]);

  useEffect(() => {
    editor.activate();
    const unsubscribe = content.subscribe(() => { void readRemote(); });
    void readRemote();
    return () => { unsubscribe(); editor.dispose(); };
  }, [content, editor, readRemote]);

  const setDraft = useCallback((next: ContentMap[K] | ((current: ContentMap[K]) => ContentMap[K])) => {
    if (!can("content.edit")) return;
    editor.update(next);
    render();
  }, [editor, can]);

  const save = useCallback(async (): Promise<{ success: boolean; changed?: boolean; errors?: Record<string, string> }> => {
    if (!can("content.edit") || !editor.ready || editor.busy) return { success: false };
    const payload = structuredClone(editor.draft);
    const errors = validate(payload);
    if (Object.keys(errors).length || contentValidationIssues(key, payload).length) {
      editor.errors = errors;
      editor.error = Object.keys(errors).length ? null : t("cms.err.fixErrors");
      render();
      const field = Object.keys(errors).find((id) => id.endsWith(`-${editLang}`)) ?? Object.keys(errors)[0];
      if (field) onInvalidField?.(field);
      requestAnimationFrame(() => focusFirstInvalidField(errors, editLang));
      return { success: false, errors };
    }
    const input = editor.beginCommand();
    render();
    let succeeded = false;
    try {
      const receipt = await saveContentDraft({ content, activity, actor,
        onAuditWarning: () => toast(t("a2.ac.auditWarning")) }, key, input.document, { expectedDraft: input.expectedDraft });
      editor.committed(receipt.after);
      succeeded = true;
      return { success: true, changed: receipt.changed };
    } catch (error) {
      if (editor.active) {
        editor.error = errorMessage(error);
        if (error instanceof ContentError && error.code === "draft_conflict") editor.conflict = true;
      }
      return { success: false };
    } finally {
      editor.busy = false;
      if (editor.active) { render(); if (succeeded) void readRemote(); }
    }
  }, [editor, validate, key, can, editLang, onInvalidField, content, activity, actor, toast, t, errorMessage, readRemote]);

  const discard = useCallback(async () => {
    if (!can("content.edit") || !editor.ready || editor.busy) return false;
    const input = editor.beginCommand();
    render();
    let succeeded = false;
    try {
      const receipt = await discardContentDraft({ content, activity, actor,
        onAuditWarning: () => toast(t("a2.ac.auditWarning")) }, key, { expectedDraft: input.expectedDraft });
      editor.committed(receipt.after, true);
      succeeded = true;
      return true;
    } catch (error) {
      if (editor.active) {
        editor.error = errorMessage(error);
        if (error instanceof ContentError && error.code === "draft_conflict") editor.conflict = true;
      }
      return false;
    } finally {
      editor.busy = false;
      if (editor.active) { render(); if (succeeded) void readRemote(); }
    }
  }, [can, editor, content, activity, actor, toast, t, key, errorMessage, readRemote]);

  return {
    draft: editor.draft, setDraft, savedDraft: editor.savedDraft,
    ready: editor.ready, dirty: editor.dirty, saving: editor.busy,
    saveError: editor.error, conflict: editor.conflict, errors: editor.errors,
    setErrors: (errors: Record<string, string>) => { editor.errors = errors; render(); },
    save, discard,
    reloadRemote: () => readRemote(true),
    retryRead: () => readRemote(),
    dismissConflict: () => { editor.conflict = false; render(); },
    resetLocalEdits: () => { editor.reset(); render(); },
  };
}
