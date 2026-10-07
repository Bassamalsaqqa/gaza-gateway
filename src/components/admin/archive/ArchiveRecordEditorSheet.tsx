import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Lock, RefreshCw, Trash2, X } from "lucide-react";
import { AdminChip, AdminField, GazaSheet, Ltr } from "@/components/admin/admin-kit";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Input, Select, Textarea, btnClass } from "@/components/kit";
import { useAdmin } from "@/lib/admin-store";
import {
  ARCHIVE_SUBJECT_LABELS,
  HISTORICAL_PHASE_LABELS,
  type ArchiveRecord,
  type ArchiveSubject,
  type DatePrecision,
  type EvidenceStatus,
  type HistoricalPhase,
  type PublicationBasis,
  type PublicationState,
  type RightsStatus,
  type SourceRecord,
} from "@/lib/archive/types";
import { ARCHIVE_TIMELINE_IDS, sameArchiveValue } from "@/lib/archive/drafts/schema";
import { ArchiveDraftError } from "@/lib/archive/drafts/types";
import { useDiscardArchiveDraft, useSaveArchiveDraft } from "@/lib/archive/drafts/queries";
import { useArchiveAdminI18n } from "./i18n";
import { archiveEditorIssues } from "./editor-errors";
import { pick } from "@/lib/i18n";

export interface ArchiveRecordEditorSheetProps {
  record: ArchiveRecord | null;
  savedDraft: ArchiveRecord | null;
  effectiveSources: readonly SourceRecord[];
  effectiveRecords: readonly ArchiveRecord[];
  draftSourceIds?: readonly string[] | undefined;
  open: boolean;
  onClose: () => void;
  onSaved?: (() => void) | undefined;
  onDiscarded?: (() => void) | undefined;
  onDirtyChange?: ((isDirty: boolean) => void) | undefined;
}

interface RecordFormState {
  titleEn: string;
  titleAr: string;
  captionEn: string;
  captionAr: string;
  altEn: string;
  altAr: string;
  location: string;
  date: string;
  datePrecision: DatePrecision;
  phase: HistoricalPhase;
  subjects: ArchiveSubject[];
  peopleText: string;
  featured: boolean;
  factCheckNotes: string;
  evidenceStatus: EvidenceStatus;
  sourceRefs: string[];
  relatedTimelineEventIds: string[];
  relatedRecordIds: string[];
  rightsStatus: RightsStatus;
  rightsLicense: string;
  rightsLicenseUrl: string;
  rightsCredit: string;
  rightsHolder: string;
  rightsStatementUri: string;
  rightsModificationNote: string;
  publicationState: PublicationState;
  publicationBasis: PublicationBasis | "";
}

function recordToFormState(record: ArchiveRecord): RecordFormState {
  return {
    titleEn: record.title.en,
    titleAr: record.title.ar,
    captionEn: record.caption.en,
    captionAr: record.caption.ar,
    altEn: record.alt.en,
    altAr: record.alt.ar,
    location: record.location ?? "",
    date: record.date ?? "",
    datePrecision: record.datePrecision,
    phase: record.phase,
    subjects: [...record.subjects],
    peopleText: record.people ? record.people.join(", ") : "",
    featured: Boolean(record.featured),
    factCheckNotes: record.factCheckNotes ?? "",
    evidenceStatus: record.evidenceStatus,
    sourceRefs: [...record.sourceRefs],
    relatedRecordIds: [...(record.relatedRecordIds ?? [])],
    relatedTimelineEventIds: record.relatedTimelineEventIds ? [...record.relatedTimelineEventIds] : [],
    rightsStatus: record.rights.status,
    rightsLicense: record.rights.license ?? "",
    rightsLicenseUrl: record.rights.licenseUrl ?? "",
    rightsCredit: record.rights.credit ?? "",
    rightsHolder: record.rights.holder ?? "",
    rightsStatementUri: record.rights.statementUri ?? "",
    rightsModificationNote: record.rights.modificationNote ?? "",
    publicationState: record.publicationState,
    publicationBasis: record.publicationBasis ?? "",
  };
}

function formStateToRecord(base: ArchiveRecord, form: RecordFormState): ArchiveRecord {
  const result: ArchiveRecord = {
    // Immutable base properties preserved
    id: base.id,
    slug: base.slug,
    medium: base.medium,
    ...(base.mediaId ? { mediaId: base.mediaId } : {}),
    ...(base.youtubeId ? { youtubeId: base.youtubeId } : {}),
    ...(base.originalFilename ? { originalFilename: base.originalFilename } : {}),
    ...(base.intakeReference ? { intakeReference: base.intakeReference } : {}),
    ...(base.duplicateOf ? { duplicateOf: base.duplicateOf } : {}),
    ...(base.curatorPublicationStatus ? { curatorPublicationStatus: base.curatorPublicationStatus } : {}),


    // Form edited fields
    title: { en: form.titleEn, ar: form.titleAr },
    caption: { en: form.captionEn, ar: form.captionAr },
    alt: { en: form.altEn, ar: form.altAr },
    datePrecision: form.datePrecision,
    phase: form.phase,
    subjects: form.subjects,
    evidenceStatus: form.evidenceStatus,
    sourceRefs: form.sourceRefs,
    rights: {
      status: form.rightsStatus,
    },
    publicationState: form.publicationState,
  };

  const loc = form.location.trim();
  if (loc) result.location = loc;

  const dt = form.date.trim();
  if (dt) result.date = dt;

  const people = form.peopleText.split(",").map((p) => p.trim()).filter(Boolean);
  if (people.length > 0) result.people = people;

  if (form.featured || base.featured !== undefined) result.featured = form.featured;

  const fcn = form.factCheckNotes.trim();
  if (fcn) result.factCheckNotes = fcn;

  if (form.relatedRecordIds.length > 0) result.relatedRecordIds = [...form.relatedRecordIds];
  if (form.relatedTimelineEventIds.length > 0) result.relatedTimelineEventIds = form.relatedTimelineEventIds;

  const lic = form.rightsLicense.trim();
  if (lic) result.rights.license = lic;

  const licUrl = form.rightsLicenseUrl.trim();
  if (licUrl) result.rights.licenseUrl = licUrl;

  const cred = form.rightsCredit.trim();
  if (cred) result.rights.credit = cred;

  const holder = form.rightsHolder.trim();
  if (holder) result.rights.holder = holder;

  const stmt = form.rightsStatementUri.trim();
  if (stmt) result.rights.statementUri = stmt;

  const modNote = form.rightsModificationNote.trim();
  if (modNote) result.rights.modificationNote = modNote;

  if (form.publicationBasis) {
    result.publicationBasis = form.publicationBasis as PublicationBasis;
  }

  return result;
}

export function ArchiveRecordEditorSheet({
  record,
  savedDraft,
  effectiveSources,
  effectiveRecords,
  draftSourceIds = [],
  open,
  onClose,
  onSaved,
  onDiscarded,
  onDirtyChange,
}: ArchiveRecordEditorSheetProps) {
  const { lang, t } = useArchiveAdminI18n();
  const { toast } = useAdmin();

  // Detached draft state
  const [formState, setFormState] = useState<RecordFormState | null>(null);
  const [initialRecord, setInitialRecord] = useState<ArchiveRecord | null>(null);
  const [expectedDraft, setExpectedDraft] = useState<ArchiveRecord | null>(null);

  // UI state
  const [activeLang, setActiveLang] = useState<"en" | "ar">("en");
  const loadedId = useRef<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [relatedErrors, setRelatedErrors] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  const saveMutation = useSaveArchiveDraft("record");
  const discardMutation = useDiscardArchiveDraft("record");

  // Sample and initialize on open
  useEffect(() => {
    const id = open && record ? record.id : null;
    if (id && loadedId.current === id) {
      if (!sameArchiveValue(savedDraft, expectedDraft)) setConflict(true);
      return;
    }
    loadedId.current = id;
    setGeneralError(null);
    setRelatedErrors([]);
    if (open && record) {
      setFormState(recordToFormState(record));
      setInitialRecord(structuredClone(record));
      setExpectedDraft(savedDraft ? structuredClone(savedDraft) : null);
      setErrors({});
      setConflict(false);
    } else {
      setFormState(null);
      setInitialRecord(null);
      setExpectedDraft(null);
      setErrors({});
      setConflict(false);
    }
  }, [open, record, savedDraft, expectedDraft]);

  const currentRecord = useMemo(() => {
    if (!record || !formState) return null;
    return formStateToRecord(record, formState);
  }, [record, formState]);

  const isDirty = useMemo(() => {
    if (!currentRecord || !initialRecord) return false;
    return !sameArchiveValue(currentRecord, initialRecord);
  }, [currentRecord, initialRecord]);

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
    if (!currentRecord || saveMutation.isPending) return;
    setErrors({});
    setGeneralError(null);
    setRelatedErrors([]);
    setConflict(false);

    try {
      await saveMutation.mutateAsync({
        value: currentRecord,
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
          const mapped = archiveEditorIssues(err.issues, "record", record!.id);
          setErrors(mapped.errors);
          setRelatedErrors(mapped.related);
          const invalidLocale = mapped.first?.match(/\.(en|ar)$/)?.[1];
          if (invalidLocale === "en" || invalidLocale === "ar") setActiveLang(invalidLocale);
          if (mapped.first) requestAnimationFrame(() => document.getElementById(`rec-field-${mapped.first!.replace(/\./g, "-")}`)?.focus());
          return;
        }
      }
      setGeneralError(t("archive.edit.operationError"));
    }
  };

  const handleDiscard = async () => {
    if (!record || discardMutation.isPending) return;
    try {
      await discardMutation.mutateAsync({
        id: record.id,
        expectedDraft,
      });
      toast(t("archive.edit.discardSuccess"));
      setDiscardConfirmOpen(false);
      onDiscarded?.();
      onClose();
    } catch (err) {
      if (err instanceof ArchiveDraftError && err.code === "draft_conflict") {
        setConflict(true);
        setDiscardConfirmOpen(false);
        return;
      }
      setGeneralError(t("archive.edit.operationError"));
      setDiscardConfirmOpen(false);
    }
  };

  const handleReloadLatest = () => {
    if (record) {
      setFormState(recordToFormState(record));
      setInitialRecord(structuredClone(record));
      setExpectedDraft(savedDraft ? structuredClone(savedDraft) : null);
      setErrors({});
      setConflict(false);
    }
  };

  if (!formState || !record) return null;

  const getFieldError = (path: string): string | undefined => errors[path];

  return (
    <>
      <GazaSheet
        open={open}
        onClose={handleRequestClose}
        title={t("archive.edit.recordTitle")}
        description={record.id}
      >
        <div className="space-y-6 text-xs pb-16">
          {generalError && <p role="alert" className="rounded border border-destructive/40 p-3 text-destructive">{generalError}</p>}
          {relatedErrors.length > 0 && <div role="alert" className="rounded border border-destructive/40 p-3 text-destructive"><p>{t("archive.edit.relatedError")}</p><ul>{relatedErrors.map((path) => <li key={path}><Ltr className="break-all">{path}</Ltr></li>)}</ul></div>}
          {/* Top Badges & Status */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
            <AdminChip tone="brand">
              <Ltr className="font-mono">{record.id}</Ltr>
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

          {/* Section 1: Bilingual Narrative */}
          <section className="rounded-md border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="font-bold text-sm text-foreground">
                {t("archive.field.sectionGeneral")}
              </h3>
              <div role="group" aria-label={t("archive.field.language")} className="flex gap-1">
                {(["en", "ar"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={activeLang === l}
                    onClick={() => setActiveLang(l)}
                    className={btnClass(activeLang === l ? "secondary" : "ghost", "sm")}
                  >
                    {t(l === "en" ? "archive.field.english" : "archive.field.arabic")}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3">
              {/* Title */}
              <AdminField
                label={`${t("archive.field.title")} (${t(activeLang === "en" ? "archive.field.english" : "archive.field.arabic")})`}
                htmlFor={`rec-field-title-${activeLang}`}
              >
                <Input
                  id={`rec-field-title-${activeLang}`}
                  dir={activeLang === "ar" ? "rtl" : "ltr"}
                  value={activeLang === "en" ? formState.titleEn : formState.titleAr}
                  aria-invalid={Boolean(getFieldError(`title.${activeLang}`))}
                  aria-describedby={getFieldError(`title.${activeLang}`) ? `rec-field-title-${activeLang}-err` : undefined}
                  onChange={(e) =>
                    setFormState((prev) =>
                      prev
                        ? activeLang === "en"
                          ? { ...prev, titleEn: e.target.value }
                          : { ...prev, titleAr: e.target.value }
                        : null,
                    )
                  }
                />
                {getFieldError(`title.${activeLang}`) && (
                  <p id={`rec-field-title-${activeLang}-err`} role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError(`title.${activeLang}`)!)}
                  </p>
                )}
              </AdminField>

              {/* Caption */}
              <AdminField
                label={`${t("archive.field.caption")} (${t(activeLang === "en" ? "archive.field.english" : "archive.field.arabic")})`}
                htmlFor={`rec-field-caption-${activeLang}`}
              >
                <Textarea
                  id={`rec-field-caption-${activeLang}`}
                  rows={2}
                  dir={activeLang === "ar" ? "rtl" : "ltr"}
                  value={activeLang === "en" ? formState.captionEn : formState.captionAr}
                  aria-invalid={Boolean(getFieldError(`caption.${activeLang}`))}
                  aria-describedby={getFieldError(`caption.${activeLang}`) ? `rec-field-caption-${activeLang}-err` : undefined}
                  onChange={(e) =>
                    setFormState((prev) =>
                      prev
                        ? activeLang === "en"
                          ? { ...prev, captionEn: e.target.value }
                          : { ...prev, captionAr: e.target.value }
                        : null,
                    )
                  }
                />
                {getFieldError(`caption.${activeLang}`) && (
                  <p id={`rec-field-caption-${activeLang}-err`} role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError(`caption.${activeLang}`)!)}
                  </p>
                )}
              </AdminField>

              {/* Alt Text */}
              <AdminField
                label={`${t("archive.field.alt")} (${t(activeLang === "en" ? "archive.field.english" : "archive.field.arabic")})`}
                htmlFor={`rec-field-alt-${activeLang}`}
              >
                <Input
                  id={`rec-field-alt-${activeLang}`}
                  dir={activeLang === "ar" ? "rtl" : "ltr"}
                  value={activeLang === "en" ? formState.altEn : formState.altAr}
                  aria-invalid={Boolean(getFieldError(`alt.${activeLang}`))}
                  aria-describedby={getFieldError(`alt.${activeLang}`) ? `rec-field-alt-${activeLang}-err` : undefined}
                  onChange={(e) =>
                    setFormState((prev) =>
                      prev
                        ? activeLang === "en"
                          ? { ...prev, altEn: e.target.value }
                          : { ...prev, altAr: e.target.value }
                        : null,
                    )
                  }
                />
                {getFieldError(`alt.${activeLang}`) && (
                  <p id={`rec-field-alt-${activeLang}-err`} role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError(`alt.${activeLang}`)!)}
                  </p>
                )}
              </AdminField>

              {/* Location */}
              <AdminField label={t("archive.field.location")} htmlFor="rec-field-location">
                <Input
                  id="rec-field-location"
                  value={formState.location}
                  aria-invalid={Boolean(getFieldError("location"))}
                  aria-describedby={getFieldError("location") ? "rec-field-location-err" : undefined}
                  onChange={(e) =>
                    setFormState((prev) => (prev ? { ...prev, location: e.target.value } : null))
                  }
                />
                {getFieldError("location") && (
                  <p id="rec-field-location-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("location")!)}
                  </p>
                )}
              </AdminField>
            </div>
          </section>

          {/* Section 2: Chronology & Categorization */}
          <section className="rounded-md border border-border bg-card p-4 space-y-4">
            <h3 className="font-bold text-sm text-foreground border-b border-border pb-2">
              {t("archive.field.sectionChronology")}
            </h3>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Date */}
              <AdminField label={t("archive.field.date")} htmlFor="rec-field-date">
                <Input
                  id="rec-field-date"
                  dir="ltr"
                  placeholder="YYYY, YYYY-MM, YYYY-MM-DD"
                  value={formState.date}
                  aria-invalid={Boolean(getFieldError("date"))}
                  aria-describedby={getFieldError("date") ? "rec-field-date-err" : undefined}
                  onChange={(e) =>
                    setFormState((prev) => (prev ? { ...prev, date: e.target.value } : null))
                  }
                />
                {getFieldError("date") && (
                  <p id="rec-field-date-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("date")!)}
                  </p>
                )}
              </AdminField>

              {/* Date Precision */}
              <AdminField label={t("archive.field.datePrecision")} htmlFor="rec-field-datePrecision">
                <Select
                  id="rec-field-datePrecision"
                  value={formState.datePrecision}
                  aria-invalid={Boolean(getFieldError("datePrecision"))}
                  aria-describedby={getFieldError("datePrecision") ? "rec-field-datePrecision-err" : undefined}
                  onChange={(e) =>
                    setFormState((prev) =>
                      prev ? { ...prev, datePrecision: e.target.value as DatePrecision } : null,
                    )
                  }
                >
                  <option value="exact">{t("archive.badge.exactDate")}</option>
                  <option value="circa">{t("archive.badge.approxDate")}</option>
                  <option value="year">{t("archive.field.year")}</option>
                  <option value="month">{t("archive.field.month")}</option>
                  <option value="unknown">{t("archive.badge.missingDate")}</option>
                </Select>
                {getFieldError("datePrecision") && (
                  <p id="rec-field-datePrecision-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("datePrecision")!)}
                  </p>
                )}
              </AdminField>

              {/* Historical Phase */}
              <AdminField label={t("archive.field.phase")} htmlFor="rec-field-phase" className="sm:col-span-2">
                <Select
                  id="rec-field-phase"
                  value={formState.phase}
                  aria-invalid={Boolean(getFieldError("phase"))}
                  aria-describedby={getFieldError("phase") ? "rec-field-phase-err" : undefined}
                  onChange={(e) =>
                    setFormState((prev) =>
                      prev ? { ...prev, phase: e.target.value as HistoricalPhase } : null,
                    )
                  }
                >
                  {(Object.keys(HISTORICAL_PHASE_LABELS) as HistoricalPhase[]).map((p) => (
                    <option key={p} value={p}>
                      {pick(lang, HISTORICAL_PHASE_LABELS[p])}
                    </option>
                  ))}
                </Select>
                {getFieldError("phase") && (
                  <p id="rec-field-phase-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("phase")!)}
                  </p>
                )}
              </AdminField>

              {/* People */}
              <AdminField label={t("archive.field.people")} htmlFor="rec-field-people" className="sm:col-span-2">
                <Input
                  id="rec-field-people"
                  placeholder="e.g. Yasser Arafat, Bill Clinton"
                  value={formState.peopleText}
                  aria-invalid={Boolean(getFieldError("people"))}
                  aria-describedby={getFieldError("people") ? "rec-field-people-err" : undefined}
                  onChange={(e) =>
                    setFormState((prev) => (prev ? { ...prev, peopleText: e.target.value } : null))
                  }
                />
                {getFieldError("people") && (
                  <p id="rec-field-people-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("people")!)}
                  </p>
                )}
              </AdminField>

              {/* Fact Check Notes */}
              <AdminField
                label={t("archive.field.factCheckNotes")}
                htmlFor="rec-field-factCheckNotes"
                className="sm:col-span-2"
              >
                <Textarea
                  id="rec-field-factCheckNotes"
                  rows={2}
                  value={formState.factCheckNotes}
                  aria-invalid={Boolean(getFieldError("factCheckNotes"))}
                  aria-describedby={getFieldError("factCheckNotes") ? "rec-field-factCheckNotes-err" : undefined}
                  onChange={(e) =>
                    setFormState((prev) => (prev ? { ...prev, factCheckNotes: e.target.value } : null))
                  }
                />
                {getFieldError("factCheckNotes") && (
                  <p id="rec-field-factCheckNotes-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("factCheckNotes")!)}
                  </p>
                )}
              </AdminField>

              {/* Featured toggle */}
              <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="rec-field-featured"
                  checked={formState.featured}
                  onChange={(e) =>
                    setFormState((prev) => (prev ? { ...prev, featured: e.target.checked } : null))
                  }
                  className="rounded border-border text-brand focus:ring-brand size-4"
                />
                <label htmlFor="rec-field-featured" className="text-xs font-semibold text-foreground cursor-pointer">
                  {t("archive.field.featured")}
                </label>
              </div>
            </div>

            {/* Subjects checklist */}
            <div className="space-y-1.5 border-t border-border/60 pt-3">
              <label className="text-xs font-semibold text-foreground">{t("archive.field.subjects")}</label>
              <div id="rec-field-subjects" tabIndex={-1} role="group" aria-label={t("archive.field.subjects")} aria-invalid={Boolean(getFieldError("subjects"))} aria-describedby={getFieldError("subjects") ? "rec-field-subjects-err" : undefined} className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 rounded border border-border bg-background/50">
                {(Object.keys(ARCHIVE_SUBJECT_LABELS) as ArchiveSubject[]).map((subj) => {
                  const isChecked = formState.subjects.includes(subj);
                  return (
                    <label key={subj} className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const nextSubjs = e.target.checked
                            ? [...formState.subjects, subj]
                            : formState.subjects.filter((s) => s !== subj);
                          setFormState((prev) => (prev ? { ...prev, subjects: nextSubjs } : null));
                        }}
                        className="rounded border-border text-brand focus:ring-brand size-3.5"
                      />
                      <span className="truncate">{pick(lang, ARCHIVE_SUBJECT_LABELS[subj])}</span>
                    </label>
                  );
                })}
              </div>
              {getFieldError("subjects") && (
                <p id="rec-field-subjects-err" role="alert" className="mt-1 text-xs text-destructive">
                  {t(getFieldError("subjects")!)}
                </p>
              )}
            </div>
          </section>

          {/* Section 3: Sources & Evidence Verification */}
          <section className="rounded-md border border-border bg-card p-4 space-y-4">
            <h3 className="font-bold text-sm text-foreground border-b border-border pb-2">
              {t("archive.field.sectionSources")}
            </h3>

            {/* Evidence status */}
            <AdminField label={t("archive.filter.evidence")} htmlFor="rec-field-evidenceStatus">
              <Select
                id="rec-field-evidenceStatus"
                value={formState.evidenceStatus}
                aria-invalid={Boolean(getFieldError("evidenceStatus"))}
                aria-describedby={getFieldError("evidenceStatus") ? "rec-field-evidenceStatus-err" : undefined}
                onChange={(e) =>
                  setFormState((prev) =>
                    prev ? { ...prev, evidenceStatus: e.target.value as EvidenceStatus } : null,
                  )
                }
              >
                <option value="verified">{t("archive.ev.verified")}</option>
                <option value="partially-verified">{t("archive.ev.partially-verified")}</option>
                <option value="unverified">{t("archive.ev.unverified")}</option>
              </Select>
              {getFieldError("evidenceStatus") && (
                <p id="rec-field-evidenceStatus-err" role="alert" className="mt-1 text-xs text-destructive">
                  {t(getFieldError("evidenceStatus")!)}
                </p>
              )}
            </AdminField>

            {/* Cited source checklist */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">{t("archive.field.sources")}</label>
              <div id="rec-field-sourceRefs" tabIndex={-1} role="group" aria-label={t("archive.field.sources")} aria-invalid={Boolean(getFieldError("sourceRefs"))} aria-describedby={getFieldError("sourceRefs") ? "rec-field-sourceRefs-err" : undefined} className="space-y-1 max-h-48 overflow-y-auto p-2 rounded border border-border bg-background/50">
                {effectiveSources.map((src) => {
                  const isChecked = formState.sourceRefs.includes(src.id);
                  const isLocalDraft = draftSourceIds.includes(src.id);
                  return (
                    <label key={src.id} className="flex items-start gap-2 p-1 rounded hover:bg-secondary/40 cursor-pointer text-[11px]">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const nextRefs = e.target.checked
                            ? [...formState.sourceRefs, src.id]
                            : formState.sourceRefs.filter((id) => id !== src.id);
                          setFormState((prev) => (prev ? { ...prev, sourceRefs: nextRefs } : null));
                        }}
                        className="rounded border-border text-brand focus:ring-brand size-3.5 mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Ltr className="font-mono font-bold text-foreground">{src.id}</Ltr>
                          {isLocalDraft && (
                            <AdminChip tone="info">{t("archive.badge.localDraft")}</AdminChip>
                          )}
                        </div>
                        <p className="truncate text-muted-foreground">
                          {pick(lang, { en: src.title, ar: src.titleAr ?? src.title })}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
              {getFieldError("sourceRefs") && (
                <p id="rec-field-sourceRefs-err" role="alert" className="mt-1 text-xs text-destructive">
                  {t(getFieldError("sourceRefs")!)}
                </p>
              )}
            </div>

            {/* Related Timeline IDs */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">{t("archive.field.relatedTimeline")}</label>
              <div id="rec-field-relatedTimelineEventIds" tabIndex={-1} role="group" aria-label={t("archive.field.relatedTimeline")} aria-invalid={Boolean(getFieldError("relatedTimelineEventIds"))} aria-describedby={getFieldError("relatedTimelineEventIds") ? "rec-field-relatedTimelineEventIds-err" : undefined} className="flex flex-wrap gap-1 p-2 rounded border border-border bg-background/50">
                {ARCHIVE_TIMELINE_IDS.map((tId) => {
                  const isChecked = formState.relatedTimelineEventIds.includes(tId);
                  return (
                    <button
                      key={tId}
                      type="button"
                      aria-pressed={isChecked}
                      onClick={() => {
                        const cur = formState.relatedTimelineEventIds;
                        const next = isChecked ? cur.filter((id) => id !== tId) : [...cur, tId];
                        setFormState((prev) => (prev ? { ...prev, relatedTimelineEventIds: next } : null));
                      }}
                      className={btnClass(isChecked ? "secondary" : "outline", "sm", "text-[10px] py-0.5 px-2")}
                    >
                      <Ltr>{tId}</Ltr>
                    </button>
                  );
                })}
              </div>
              {getFieldError("relatedTimelineEventIds") && (
                <p id="rec-field-relatedTimelineEventIds-err" role="alert" className="mt-1 text-xs text-destructive">
                  {t(getFieldError("relatedTimelineEventIds")!)}
                </p>
              )}
            </div>
          </section>

            <div className="space-y-2">
              <label className="text-xs font-semibold">{t("archive.field.relatedRecords")}</label>
              <div id="rec-field-relatedRecordIds" role="group" tabIndex={-1} aria-label={t("archive.field.relatedRecords")} aria-invalid={Boolean(getFieldError("relatedRecordIds"))} aria-describedby={getFieldError("relatedRecordIds") ? "rec-field-relatedRecordIds-err" : undefined} className="max-h-48 overflow-y-auto rounded border border-border p-2 space-y-2">
                {effectiveRecords.filter((r) => r.id !== record.id).map((r) => <label key={r.id} className="flex items-start gap-2 text-xs">
                  <input type="checkbox" checked={formState.relatedRecordIds.includes(r.id)} onChange={(e) => setFormState((prev) => prev ? {...prev, relatedRecordIds: e.target.checked ? [...prev.relatedRecordIds, r.id] : prev.relatedRecordIds.filter((id) => id !== r.id)} : null)} />
                  <Ltr>{r.id}</Ltr><span>{pick(lang, r.title)}</span>
                </label>)}
              </div>
              {getFieldError("relatedRecordIds") && <p id="rec-field-relatedRecordIds-err" role="alert" className="text-destructive">{t(getFieldError("relatedRecordIds")!)}</p>}
            </div>

          {/* Section 4: Rights & Copyright Clearance */}
          <section className="rounded-md border border-border bg-card p-4 space-y-4">
            <h3 className="font-bold text-sm text-foreground border-b border-border pb-2">
              {t("archive.field.sectionRights")}
            </h3>

            {/* Prominent Rights Disclaimer */}
            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>{t("archive.edit.rightsWarning")}</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Rights Status */}
              <AdminField label={t("archive.field.rights")} htmlFor="rec-field-rights-status">
                <Select
                  id="rec-field-rights-status"
                  value={formState.rightsStatus}
                  aria-invalid={Boolean(getFieldError("rights.status"))}
                  aria-describedby={getFieldError("rights.status") ? "rec-field-rights-status-err" : undefined}
                  onChange={(e) =>
                    setFormState((prev) =>
                      prev ? { ...prev, rightsStatus: e.target.value as RightsStatus } : null,
                    )
                  }
                >
                  <option value="owner-cleared">{t("archive.rights.owner-cleared")}</option>
                  <option value="public-domain">{t("archive.rights.public-domain")}</option>
                  <option value="licensed">{t("archive.rights.licensed")}</option>
                  <option value="attribution-license">{t("archive.rights.attribution-license")}</option>
                  <option value="rights-managed">{t("archive.rights.rights-managed")}</option>
                  <option value="unknown">{t("archive.rights.unknown")}</option>
                </Select>
                {getFieldError("rights.status") && (
                  <p id="rec-field-rights-status-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("rights.status")!)}
                  </p>
                )}
              </AdminField>

              {/* License */}
              <AdminField label={t("archive.field.license")} htmlFor="rec-field-rights-license">
                <Input
                  id="rec-field-rights-license"
                  placeholder="e.g. CC BY-SA 4.0"
                  value={formState.rightsLicense}
                  aria-invalid={Boolean(getFieldError("rights.license"))}
                  aria-describedby={getFieldError("rights.license") ? "rec-field-rights-license-err" : undefined}
                  onChange={(e) =>
                    setFormState((prev) => (prev ? { ...prev, rightsLicense: e.target.value } : null))
                  }
                />
                {getFieldError("rights.license") && (
                  <p id="rec-field-rights-license-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("rights.license")!)}
                  </p>
                )}
              </AdminField>

              {/* License URL */}
              <AdminField
                label={t("archive.field.licenseUrl")}
                htmlFor="rec-field-rights-licenseUrl"
                className="sm:col-span-2"
              >
                <Input
                  id="rec-field-rights-licenseUrl"
                  dir="ltr"
                  placeholder="https://creativecommons.org/licenses/..."
                  value={formState.rightsLicenseUrl}
                  aria-invalid={Boolean(getFieldError("rights.licenseUrl"))}
                  aria-describedby={getFieldError("rights.licenseUrl") ? "rec-field-rights-licenseUrl-err" : undefined}
                  onChange={(e) =>
                    setFormState((prev) => (prev ? { ...prev, rightsLicenseUrl: e.target.value } : null))
                  }
                />
                {getFieldError("rights.licenseUrl") && (
                  <p id="rec-field-rights-licenseUrl-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("rights.licenseUrl")!)}
                  </p>
                )}
              </AdminField>

              {/* Credit */}
              <AdminField label={t("archive.field.credit")} htmlFor="rec-field-rights-credit">
                <Input
                  id="rec-field-rights-credit"
                  value={formState.rightsCredit}
                  aria-invalid={Boolean(getFieldError("rights.credit"))}
                  aria-describedby={getFieldError("rights.credit") ? "rec-field-rights-credit-err" : undefined}
                  onChange={(e) =>
                    setFormState((prev) => (prev ? { ...prev, rightsCredit: e.target.value } : null))
                  }
                />
                {getFieldError("rights.credit") && (
                  <p id="rec-field-rights-credit-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("rights.credit")!)}
                  </p>
                )}
              </AdminField>

              {/* Holder */}
              <AdminField label={t("archive.field.holder")} htmlFor="rec-field-rights-holder">
                <Input
                  id="rec-field-rights-holder"
                  value={formState.rightsHolder}
                  aria-invalid={Boolean(getFieldError("rights.holder"))}
                  aria-describedby={getFieldError("rights.holder") ? "rec-field-rights-holder-err" : undefined}
                  onChange={(e) =>
                    setFormState((prev) => (prev ? { ...prev, rightsHolder: e.target.value } : null))
                  }
                />
                {getFieldError("rights.holder") && (
                  <p id="rec-field-rights-holder-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("rights.holder")!)}
                  </p>
                )}
              </AdminField>

              {/* Statement URI */}
              <AdminField
                label={t("archive.field.statementUri")}
                htmlFor="rec-field-rights-statementUri"
                className="sm:col-span-2"
              >
                <Input
                  id="rec-field-rights-statementUri"
                  dir="ltr"
                  value={formState.rightsStatementUri}
                  aria-invalid={Boolean(getFieldError("rights.statementUri"))}
                  aria-describedby={getFieldError("rights.statementUri") ? "rec-field-rights-statementUri-err" : undefined}
                  onChange={(e) =>
                    setFormState((prev) => (prev ? { ...prev, rightsStatementUri: e.target.value } : null))
                  }
                />
                {getFieldError("rights.statementUri") && (
                  <p id="rec-field-rights-statementUri-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("rights.statementUri")!)}
                  </p>
                )}
              </AdminField>

              {/* Modification Note */}
              <AdminField
                label={t("archive.field.modificationNote")}
                htmlFor="rec-field-rights-modificationNote"
                className="sm:col-span-2"
              >
                <Input
                  id="rec-field-rights-modificationNote"
                  value={formState.rightsModificationNote}
                  aria-invalid={Boolean(getFieldError("rights.modificationNote"))}
                  aria-describedby={getFieldError("rights.modificationNote") ? "rec-field-rights-modificationNote-err" : undefined}
                  onChange={(e) =>
                    setFormState((prev) => (prev ? { ...prev, rightsModificationNote: e.target.value } : null))
                  }
                />
                {getFieldError("rights.modificationNote") && (
                  <p id="rec-field-rights-modificationNote-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("rights.modificationNote")!)}
                  </p>
                )}
              </AdminField>
            </div>
          </section>

          {/* Section 5: Publication Target & Compliance */}
          <section className="rounded-md border border-border bg-card p-4 space-y-4">
            <h3 className="font-bold text-sm text-foreground border-b border-border pb-2">
              {t("archive.field.sectionPublication")}
            </h3>

            {/* Prominent Promotion Disclaimer */}
            <div className="rounded border border-primary/40 bg-primary/10 p-3 text-foreground space-y-1">
              <p className="font-semibold text-xs">{t("archive.edit.disclaimer")}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Publication State */}
              <AdminField label={t("archive.filter.pubState")} htmlFor="rec-field-publicationState">
                <Select
                  id="rec-field-publicationState"
                  value={formState.publicationState}
                  aria-invalid={Boolean(getFieldError("publicationState"))}
                  aria-describedby={getFieldError("publicationState") ? "rec-field-publicationState-err" : undefined}
                  onChange={(e) =>
                    setFormState((prev) =>
                      prev ? { ...prev, publicationState: e.target.value as PublicationState } : null,
                    )
                  }
                >
                  <option value="published">{t("archive.pub.published")}</option>
                  <option value="staging">{t("archive.pub.staging")}</option>
                  <option value="hold-rights">{t("archive.pub.hold-rights")}</option>
                  <option value="hold-provenance">{t("archive.pub.hold-provenance")}</option>
                  <option value="excluded">{t("archive.pub.excluded")}</option>
                </Select>
                {getFieldError("publicationState") && (
                  <p id="rec-field-publicationState-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("publicationState")!)}
                  </p>
                )}
              </AdminField>

              {/* Publication Basis */}
              <AdminField label={t("archive.filter.pubBasis")} htmlFor="rec-field-publicationBasis">
                <Select
                  id="rec-field-publicationBasis"
                  value={formState.publicationBasis}
                  aria-invalid={Boolean(getFieldError("publicationBasis"))}
                  aria-describedby={getFieldError("publicationBasis") ? "rec-field-publicationBasis-err" : undefined}
                  onChange={(e) =>
                    setFormState((prev) =>
                      prev
                        ? { ...prev, publicationBasis: (e.target.value as PublicationBasis) || "" }
                        : null,
                    )
                  }
                >
                  <option value="">-- None --</option>
                  <option value="rights-cleared">{t("archive.basis.rights-cleared")}</option>
                  <option value="product-owner-directed-display">
                    {t("archive.basis.product-owner-directed-display")}
                  </option>
                  <option value="external-embed">{t("archive.basis.external-embed")}</option>
                </Select>
                {getFieldError("publicationBasis") && (
                  <p id="rec-field-publicationBasis-err" role="alert" className="mt-1 text-xs text-destructive">
                    {t(getFieldError("publicationBasis")!)}
                  </p>
                )}
              </AdminField>
            </div>
            {formState.publicationState === "published" && (
              <p className="text-[11px] text-muted-foreground italic">
                {t("archive.edit.publishedTargetNote")}
              </p>
            )}
          </section>

          {/* Section 6: Immutable Technical Provenance */}
          <section className="rounded-md border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <Lock className="size-4 text-muted-foreground" />
              <h3 className="font-bold text-sm text-foreground">
                {t("archive.field.sectionImmutable")}
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t("archive.edit.immutableIntakeNotice")}
            </p>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono rounded border border-border/60 bg-sand p-2.5">
              <div>
                <span className="text-muted-foreground block text-[10px]">{t("archive.field.recordId")}:</span>
                <Ltr className="font-bold text-foreground">{record.id}</Ltr>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">{t("archive.field.slug")}:</span>
                <Ltr className="text-foreground">{record.slug}</Ltr>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">{t("archive.field.medium")}:</span>
                <span className="text-foreground">{record.medium}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">{t("archive.field.mediaId")}:</span>
                <Ltr className="text-foreground">{record.mediaId ?? "—"}</Ltr>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">{t("archive.sheet.youtubeId")}:</span>
                <Ltr className="text-foreground">{record.youtubeId ?? "—"}</Ltr>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">{t("archive.sheet.curatorStatus")}:</span>
                <span className="text-foreground">{record.curatorPublicationStatus ?? "—"}</span>
              </div>
              {record.originalFilename && (
                <div className="col-span-2">
                  <span className="text-muted-foreground block text-[10px]">{t("archive.sheet.originalFilename")}:</span>
                  <Ltr className="text-foreground break-all">{record.originalFilename}</Ltr>
                </div>
              )}
              {record.intakeReference && (
                <div className="col-span-2">
                  <span className="text-muted-foreground block text-[10px]">{t("archive.sheet.intakeReference")}:</span>
                  <Ltr className="text-foreground">{record.intakeReference}</Ltr>
                </div>
              )}
              {record.duplicateOf && (
                <div className="col-span-2">
                  <span className="text-muted-foreground block text-[10px]">{t("archive.filter.duplicates")}:</span>
                  <Ltr className="text-foreground">{t("archive.sheet.duplicateNotice", {target: record.duplicateOf})}</Ltr>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Fixed Footer Actions */}
        <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card/95 p-4 backdrop-blur">
          <div>
            {savedDraft && (
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
