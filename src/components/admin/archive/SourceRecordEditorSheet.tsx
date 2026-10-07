import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Lock, RefreshCw, Trash2, X } from "lucide-react";
import { AdminChip, AdminField, GazaSheet, Ltr } from "@/components/admin/admin-kit";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Input, Select, Textarea, btnClass } from "@/components/kit";
import { useAdmin } from "@/lib/admin-store";
import {
  SOURCE_TYPE_LABELS,
  type SourceRecord,
  type SourceType,
} from "@/lib/archive/types";
import { sameArchiveValue } from "@/lib/archive/drafts/schema";
import { ArchiveDraftError } from "@/lib/archive/drafts/types";
import { useDiscardArchiveDraft, useSaveArchiveDraft } from "@/lib/archive/drafts/queries";
import { useArchiveAdminI18n } from "./i18n";
import { archiveEditorIssues } from "./editor-errors";
import { pick } from "@/lib/i18n";

export interface SourceRecordEditorSheetProps {
  source: SourceRecord | null;
  savedDraft: SourceRecord | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (() => void) | undefined;
  onDiscarded?: (() => void) | undefined;
  onDirtyChange?: ((isDirty: boolean) => void) | undefined;
}

interface SourceFormState {
  id: string;
  title: string;
  titleAr: string;
  publisher: string;
  type: SourceType;
  language: "en" | "ar" | "he" | "multilingual";
  publicationDate: string;
  eventDate: string;
  accessedAt: string;
  url: string;
  archivalStatus: "live" | "archived-wayback" | "official-repository" | "print-record" | "";
  notes: string;
  notesAr: string;
}

const DEFAULT_NEW_SOURCE_FORM: SourceFormState = {
  id: "",
  title: "",
  titleAr: "",
  publisher: "",
  type: "official-record",
  language: "en",
  publicationDate: "",
  eventDate: "",
  accessedAt: "",
  url: "",
  archivalStatus: "live",
  notes: "",
  notesAr: "",
};

function sourceToFormState(source: SourceRecord | null): SourceFormState {
  if (!source) return { ...DEFAULT_NEW_SOURCE_FORM };
  return {
    id: source.id,
    title: source.title,
    titleAr: source.titleAr ?? "",
    publisher: source.publisher,
    type: source.type,
    language: source.language,
    publicationDate: source.publicationDate ?? "",
    eventDate: source.eventDate ?? "",
    accessedAt: source.accessedAt ?? "",
    url: source.url,
    archivalStatus: source.archivalStatus ?? "",
    notes: source.notes ?? "",
    notesAr: source.notesAr ?? "",
  };
}

function formStateToSource(form: SourceFormState): SourceRecord {
  const result: SourceRecord = {
    id: form.id.trim(),
    title: form.title.trim(),
    publisher: form.publisher.trim(),
    type: form.type,
    language: form.language,
    url: form.url.trim(),
  };

  const titleAr = form.titleAr.trim();
  if (titleAr) result.titleAr = titleAr;

  const pubDate = form.publicationDate.trim();
  if (pubDate) result.publicationDate = pubDate;

  const evDate = form.eventDate.trim();
  if (evDate) result.eventDate = evDate;

  const accessed = form.accessedAt.trim();
  if (accessed) result.accessedAt = accessed;

  if (form.archivalStatus) {
    result.archivalStatus = form.archivalStatus;
  }

  const notes = form.notes.trim();
  if (notes) result.notes = notes;

  const notesAr = form.notesAr.trim();
  if (notesAr) result.notesAr = notesAr;

  return result;
}

export function SourceRecordEditorSheet({
  source,
  savedDraft,
  open,
  onClose,
  onSaved,
  onDiscarded,
  onDirtyChange,
}: SourceRecordEditorSheetProps) {
  const { lang, t } = useArchiveAdminI18n();
  const { toast } = useAdmin();

  const isNew = !source;

  const [formState, setFormState] = useState<SourceFormState>(DEFAULT_NEW_SOURCE_FORM);
  const [initialSource, setInitialSource] = useState<SourceRecord>(() => formStateToSource(DEFAULT_NEW_SOURCE_FORM));
  const [expectedDraft, setExpectedDraft] = useState<SourceRecord | null>(null);

  const loadedId = useRef<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [relatedErrors, setRelatedErrors] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [discardReferencedError, setDiscardReferencedError] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  const saveMutation = useSaveArchiveDraft("source");
  const discardMutation = useDiscardArchiveDraft("source");

  useEffect(() => {
    const id = open ? (source?.id ?? "__new__") : null;
    if (id && loadedId.current === id) {
      if (!sameArchiveValue(savedDraft, expectedDraft)) setConflict(true);
      return;
    }
    loadedId.current = id;
    setGeneralError(null);
    setRelatedErrors([]);
    if (open) {
      if (source) {
        setFormState(sourceToFormState(source));
        setInitialSource(structuredClone(source));
        setExpectedDraft(savedDraft ? structuredClone(savedDraft) : null);
      } else {
        setFormState({ ...DEFAULT_NEW_SOURCE_FORM });
        setInitialSource(formStateToSource(DEFAULT_NEW_SOURCE_FORM));
        setExpectedDraft(null);
      }
      setErrors({});
      setConflict(false);
      setDiscardReferencedError(false);
    } else {
      setFormState({ ...DEFAULT_NEW_SOURCE_FORM });
      setInitialSource(formStateToSource(DEFAULT_NEW_SOURCE_FORM));
      setExpectedDraft(null);
      setErrors({});
      setConflict(false);
      setDiscardReferencedError(false);
    }
  }, [open, source, savedDraft, expectedDraft]);

  const currentSource = useMemo(() => {
    return formStateToSource(formState);
  }, [formState]);

  const isDirty = useMemo(() => {
    return !sameArchiveValue(currentSource, initialSource);
  }, [currentSource, initialSource]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleRequestClose = () => {
    if (saveMutation.isPending || discardMutation.isPending) return;
    if (isDirty) {
      setCloseConfirmOpen(true);
    } else {
      onClose();
    }
  };

  const handleSave = async () => {
    if (saveMutation.isPending) return;
    setErrors({});
    setGeneralError(null);
    setRelatedErrors([]);
    setConflict(false);
    setDiscardReferencedError(false);

    const payload = formStateToSource(formState);

    try {
      await saveMutation.mutateAsync({
        value: payload,
        expectedDraft,
      });
      toast(t("archive.edit.saveSuccess"));
      onSaved?.();
      onClose();
    } catch (err) {
      if (err instanceof ArchiveDraftError) {
        if (err.code === "draft_conflict") {
          setConflict(true);
          return;
        }
        if (err.code === "invalid_draft") {
          const mapped = archiveEditorIssues(err.issues, "source", payload.id);
          setErrors(mapped.errors);
          setRelatedErrors(mapped.related);
          if (mapped.first) requestAnimationFrame(() => document.getElementById(`src-field-${mapped.first!.replace(/\./g, "-")}`)?.focus());
          return;
        }
      }
      setGeneralError(t("archive.edit.operationError"));
    }
  };

  const handleDiscard = async () => {
    if (!source || discardMutation.isPending) return;
    setDiscardReferencedError(false);

    try {
      await discardMutation.mutateAsync({
        id: source.id,
        expectedDraft,
      });
      toast(t("archive.edit.discardSuccess"));
      setDiscardConfirmOpen(false);
      onDiscarded?.();
      onClose();
    } catch (err) {
      if (err instanceof ArchiveDraftError) {
        if (err.code === "draft_conflict") {
          setConflict(true);
          setDiscardConfirmOpen(false);
          return;
        }
        if (err.code === "invalid_draft" && err.issues.some((i) => i.rule === "hc_guard")) {
          setDiscardReferencedError(true);
          setDiscardConfirmOpen(false);
          return;
        }
      }
      setGeneralError(t("archive.edit.operationError"));
      setDiscardConfirmOpen(false);
    }
  };

  const handleReloadLatest = () => {
    if (source) {
      setFormState(sourceToFormState(source));
      setInitialSource(structuredClone(source));
      setExpectedDraft(savedDraft ? structuredClone(savedDraft) : null);
      setErrors({});
      setConflict(false);
    }
  };

  const getFieldError = (path: string): string | undefined => errors[path];

  return (
    <>
      <GazaSheet
        open={open}
        onClose={handleRequestClose}
        title={isNew ? t("archive.edit.newSourceTitle") : t("archive.edit.sourceTitle")}
        description={isNew ? t("archive.tab.sources") : source.id}
      >
        <div className="space-y-6 text-xs pb-16">
          {generalError && <p role="alert" className="rounded border border-destructive/40 p-3 text-destructive">{generalError}</p>}
          {relatedErrors.length > 0 && <div role="alert" className="rounded border border-destructive/40 p-3 text-destructive"><p>{t("archive.edit.relatedError")}</p><ul>{relatedErrors.map((path) => <li key={path}><Ltr className="break-all">{path}</Ltr></li>)}</ul></div>}
          {/* Top Badges */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
            <AdminChip tone="brand">
              <Ltr className="font-mono">{isNew ? t("archive.action.newSource") : source.id}</Ltr>
            </AdminChip>
            {savedDraft && (
              <AdminChip tone="info">{t("archive.badge.localDraft")}</AdminChip>
            )}
            {isDirty && (
              <AdminChip tone="warn">{t("archive.edit.unsavedBadge")}</AdminChip>
            )}
          </div>

          <p className="rounded border border-border bg-sand p-3">{t("archive.edit.disclaimer")}</p>
          {/* Conflict Banner */}
          {conflict && (
            <div
              role="alert"
              className="rounded-lg border border-status-delayed/40 bg-status-delayed/10 p-4 text-foreground space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="size-5 text-status-delayed shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">{t("cms.conflict.title")}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("archive.edit.conflictAlert")}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleReloadLatest}
                  className={btnClass("secondary", "sm")}
                >
                  <RefreshCw className="size-3.5 me-1.5" />
                  <span>{t("archive.action.reload")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConflict(false)}
                  className={btnClass("ghost", "sm")}
                >
                  <X className="size-3.5 me-1.5" />
                  <span>{t("archive.action.keepLocal")}</span>
                </button>
              </div>
            </div>
          )}

          {/* Discard Referenced Error Alert */}
          {discardReferencedError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive space-y-2"
            >
              <div className="flex items-center gap-2 font-semibold text-sm">
                <AlertTriangle className="size-4 shrink-0" />
                <span>{t("archive.edit.discardReferencedError")}</span>
              </div>
            </div>
          )}

          {/* Form Fields */}
          <div className="rounded-md border border-border bg-card p-4 space-y-4">
            {/* Source ID */}
            <AdminField
              label={t("archive.field.sourceId")}
              htmlFor="src-field-id"
              hint={isNew ? t("archive.edit.sourceHelpId") : undefined}
            >
              <div className="relative">
                <Input
                  id="src-field-id"
                  dir="ltr"
                  placeholder="src-lowercase-slug"
                  value={formState.id}
                  readOnly={!isNew}
                  className={!isNew ? "bg-sand font-mono pe-8" : "font-mono"}
                  aria-invalid={Boolean(getFieldError("id"))}
                  aria-describedby={getFieldError("id") ? "src-field-id-err" : undefined}
                  onChange={(e) =>
                    isNew && setFormState((prev) => ({ ...prev, id: e.target.value.toLowerCase() }))
                  }
                />
                {!isNew && (
                  <Lock className="pointer-events-none absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                )}
              </div>
              {getFieldError("id") && (
                <p id="src-field-id-err" role="alert" className="mt-1 text-xs text-destructive">
                  {t(getFieldError("id")!)}
                </p>
              )}
            </AdminField>

            {/* Title (English) */}
            <AdminField label={t("archive.field.title")} htmlFor="src-field-title">
              <Input
                id="src-field-title"
                dir="ltr"
                value={formState.title}
                aria-invalid={Boolean(getFieldError("title"))}
                aria-describedby={getFieldError("title") ? "src-field-title-err" : undefined}
                onChange={(e) => setFormState((prev) => ({ ...prev, title: e.target.value }))}
              />
              {getFieldError("title") && (
                <p id="src-field-title-err" role="alert" className="mt-1 text-xs text-destructive">
                  {t(getFieldError("title")!)}
                </p>
              )}
            </AdminField>

            {/* Title (Arabic) */}
            <AdminField label={t("archive.field.titleAr")} htmlFor="src-field-titleAr">
              <Input
                id="src-field-titleAr"
                dir="rtl"
                value={formState.titleAr}
                aria-invalid={Boolean(getFieldError("titleAr"))}
                aria-describedby={getFieldError("titleAr") ? "src-field-titleAr-err" : undefined}
                onChange={(e) => setFormState((prev) => ({ ...prev, titleAr: e.target.value }))}
              />
              {getFieldError("titleAr") && (
                <p id="src-field-titleAr-err" role="alert" className="mt-1 text-xs text-destructive">
                  {t(getFieldError("titleAr")!)}
                </p>
              )}
            </AdminField>

            {/* Publisher & Source Type */}
            <div className="grid gap-3 sm:grid-cols-2">
              <AdminField label={t("archive.field.publisher")} htmlFor="src-field-publisher">
                <Input
                  id="src-field-publisher"
                  value={formState.publisher}
                  aria-invalid={Boolean(getFieldError("publisher"))}
                  aria-describedby={getFieldError("publisher") ? "src-field-publisher-err" : undefined}
                  onChange={(e) => setFormState((prev) => ({ ...prev, publisher: e.target.value }))}
                />
                {getFieldError("publisher") && (
                  <p id="src-field-publisher-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("publisher")!)}
                  </p>
                )}
              </AdminField>

              <AdminField label={t("archive.field.sourceType")} htmlFor="src-field-type">
                <Select
                  id="src-field-type"
                  value={formState.type}
                  aria-invalid={Boolean(getFieldError("type"))}
                  aria-describedby={getFieldError("type") ? "src-field-type-err" : undefined}
                  onChange={(e) => setFormState((prev) => ({ ...prev, type: e.target.value as SourceType }))}
                >
                  {(Object.keys(SOURCE_TYPE_LABELS) as SourceType[]).map((st) => (
                    <option key={st} value={st}>
                      {pick(lang, SOURCE_TYPE_LABELS[st])}
                    </option>
                  ))}
                </Select>
                {getFieldError("type") && (
                  <p id="src-field-type-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("type")!)}
                  </p>
                )}
              </AdminField>
            </div>

            {/* Language & Archival Status */}
            <div className="grid gap-3 sm:grid-cols-2">
              <AdminField label={t("archive.field.language")} htmlFor="src-field-language">
                <Select
                  id="src-field-language"
                  value={formState.language}
                  aria-invalid={Boolean(getFieldError("language"))}
                  aria-describedby={getFieldError("language") ? "src-field-language-err" : undefined}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      language: e.target.value as SourceFormState["language"],
                    }))
                  }
                >
                  <option value="en">{t("archive.field.english")}</option>
                  <option value="ar">{t("archive.field.arabic")}</option>
                  <option value="he">{t("archive.field.hebrew")}</option>
                  <option value="multilingual">{t("archive.field.multilingual")}</option>
                </Select>
                {getFieldError("language") && (
                  <p id="src-field-language-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("language")!)}
                  </p>
                )}
              </AdminField>

              <AdminField label={t("archive.filter.archivalStatus")} htmlFor="src-field-archivalStatus">
                <Select
                  id="src-field-archivalStatus"
                  value={formState.archivalStatus}
                  aria-invalid={Boolean(getFieldError("archivalStatus"))}
                  aria-describedby={getFieldError("archivalStatus") ? "src-field-archivalStatus-err" : undefined}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      archivalStatus: e.target.value as SourceFormState["archivalStatus"],
                    }))
                  }
                >
                  <option value="">{t("archive.src.status.unknown")}</option>
                  <option value="live">{t("archive.src.status.live")}</option>
                  <option value="official-repository">{t("archive.src.status.official-repository")}</option>
                  <option value="archived-wayback">{t("archive.src.status.archived-wayback")}</option>
                  <option value="print-record">{t("archive.src.status.print-record")}</option>
                </Select>
                {getFieldError("archivalStatus") && (
                  <p id="src-field-archivalStatus-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("archivalStatus")!)}
                  </p>
                )}
              </AdminField>
            </div>

            {/* URL */}
            <AdminField label={t("archive.field.url")} htmlFor="src-field-url">
              <Input
                id="src-field-url"
                dir="ltr"
                placeholder="https://..."
                value={formState.url}
                aria-invalid={Boolean(getFieldError("url"))}
                aria-describedby={getFieldError("url") ? "src-field-url-err" : undefined}
                onChange={(e) => setFormState((prev) => ({ ...prev, url: e.target.value }))}
              />
              {getFieldError("url") && (
                <p id="src-field-url-err" role="alert" className="mt-1 text-xs text-destructive">
                  {t(getFieldError("url")!)}
                </p>
              )}
            </AdminField>

            {/* Dates: Publication, Event, Access */}
            <div className="grid gap-3 sm:grid-cols-3">
              <AdminField label={t("archive.field.publicationDate")} htmlFor="src-field-publicationDate">
                <Input
                  id="src-field-publicationDate"
                  dir="ltr"
                  placeholder="YYYY, YYYY-MM, YYYY-MM-DD"
                  value={formState.publicationDate}
                  aria-invalid={Boolean(getFieldError("publicationDate"))}
                  aria-describedby={getFieldError("publicationDate") ? "src-field-publicationDate-err" : undefined}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, publicationDate: e.target.value }))
                  }
                />
                {getFieldError("publicationDate") && (
                  <p id="src-field-publicationDate-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("publicationDate")!)}
                  </p>
                )}
              </AdminField>

              <AdminField label={t("archive.field.eventDate")} htmlFor="src-field-eventDate">
                <Input
                  id="src-field-eventDate"
                  dir="ltr"
                  placeholder="YYYY, YYYY-MM, YYYY-MM-DD"
                  value={formState.eventDate}
                  aria-invalid={Boolean(getFieldError("eventDate"))}
                  aria-describedby={getFieldError("eventDate") ? "src-field-eventDate-err" : undefined}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, eventDate: e.target.value }))
                  }
                />
                {getFieldError("eventDate") && (
                  <p id="src-field-eventDate-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("eventDate")!)}
                  </p>
                )}
              </AdminField>

              <AdminField label={t("archive.field.accessedAt")} htmlFor="src-field-accessedAt">
                <Input
                  id="src-field-accessedAt"
                  dir="ltr"
                  placeholder="YYYY-MM-DD"
                  value={formState.accessedAt}
                  aria-invalid={Boolean(getFieldError("accessedAt"))}
                  aria-describedby={getFieldError("accessedAt") ? "src-field-accessedAt-err" : undefined}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, accessedAt: e.target.value }))
                  }
                />
                {getFieldError("accessedAt") && (
                  <p id="src-field-accessedAt-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("accessedAt")!)}
                  </p>
                )}
              </AdminField>
            </div>

            {/* Notes (English) */}
            <AdminField label={t("archive.field.notes")} htmlFor="src-field-notes">
              <Textarea
                id="src-field-notes"
                rows={2}
                dir="ltr"
                value={formState.notes}
                aria-invalid={Boolean(getFieldError("notes"))}
                aria-describedby={getFieldError("notes") ? "src-field-notes-err" : undefined}
                onChange={(e) => setFormState((prev) => ({ ...prev, notes: e.target.value }))}
              />
              {getFieldError("notes") && (
                <p id="src-field-notes-err" role="alert" className="mt-1 text-xs text-destructive">
                  {t(getFieldError("notes")!)}
                </p>
              )}
            </AdminField>

            {/* Notes (Arabic) */}
            <AdminField label={t("archive.field.notesAr")} htmlFor="src-field-notesAr">
              <Textarea
                id="src-field-notesAr"
                rows={2}
                dir="rtl"
                value={formState.notesAr}
                aria-invalid={Boolean(getFieldError("notesAr"))}
                aria-describedby={getFieldError("notesAr") ? "src-field-notesAr-err" : undefined}
                onChange={(e) => setFormState((prev) => ({ ...prev, notesAr: e.target.value }))}
              />
              {getFieldError("notesAr") && (
                <p id="src-field-notesAr-err" role="alert" className="mt-1 text-xs text-destructive">
                  {t(getFieldError("notesAr")!)}
                </p>
              )}
            </AdminField>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card/95 p-4 backdrop-blur">
          <div>
            {!isNew && savedDraft && (
              <button
                type="button"
                onClick={() => setDiscardConfirmOpen(true)}
                disabled={saveMutation.isPending || discardMutation.isPending}
                className={btnClass("destructive", "sm")}
              >
                <Trash2 className="size-3.5 me-1" />
                <span>{t("archive.action.discardDraft")}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRequestClose}
              disabled={saveMutation.isPending || discardMutation.isPending}
              className={btnClass("outline", "sm")}
            >
              {t("archive.action.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saveMutation.isPending || discardMutation.isPending}
              className={btnClass("primary", "sm")}
            >
              {saveMutation.isPending ? t("archive.action.saving") : t("archive.action.saveDraft")}
            </button>
          </div>
        </div>
      </GazaSheet>

      {/* Discard Confirmation Dialog */}
      <ConfirmDialog
        open={discardConfirmOpen}
        title={t("archive.edit.discardConfirmTitle")}
        body={t("archive.edit.discardConfirmDesc")}
        confirmLabel={t("archive.action.discardDraft")}
        cancelLabel={t("archive.action.cancel")}
        onConfirm={handleDiscard}
        onClose={() => setDiscardConfirmOpen(false)}
      />

      {/* Unsaved Changes Close Confirmation Dialog */}
      <ConfirmDialog
        open={closeConfirmOpen}
        title={t("cms.unsaved.title")}
        body={t("archive.edit.unsavedChanges")}
        confirmLabel={t("cms.unsaved.discardAndLeave")}
        cancelLabel={t("archive.action.cancel")}
        onConfirm={() => {
          setCloseConfirmOpen(false);
          onClose();
        }}
        onClose={() => setCloseConfirmOpen(false)}
      />
    </>
  );
}
