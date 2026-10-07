import { useMemo } from "react";
import { ExternalLink, AlertTriangle, FileText, Video as VideoIcon } from "lucide-react";
import { AdminChip, GazaSheet, Ltr } from "@/components/admin/admin-kit";
import { btnClass } from "@/components/kit";
import { pick } from "@/lib/i18n";
import { SOURCE_REGISTRY } from "@/lib/archive/sources";
import {
  ARCHIVE_SUBJECT_LABELS,
  HISTORICAL_PHASE_LABELS,
  MEDIUM_LABELS,
  type ArchiveRecord,
  type SourceRecord,
} from "@/lib/archive/types";
import { MEDIA } from "@/lib/media";
import {
  formatDateWithPrecision,
  getEvidenceStatusTone,
  getPublicationStateTone,
  getRightsStatusTone,
  useArchiveAdminI18n,
} from "./i18n";

export interface ArchiveRecordSheetProps {
  record: ArchiveRecord | null;
  sources?: readonly SourceRecord[] | undefined;
  draftSourceIds?: readonly string[] | undefined;
  isDraft?: boolean | undefined;
  canEdit?: boolean | undefined;
  onClose: () => void;
  onEdit?: ((id: string) => void) | undefined;
  onOpenDuplicateTarget?: ((targetId: string) => void) | undefined;
}

export function ArchiveRecordSheet({
  record,
  sources,
  draftSourceIds = [],
  isDraft,
  canEdit = false,
  onClose,
  onEdit,
  onOpenDuplicateTarget,
}: ArchiveRecordSheetProps) {
  const { lang, t } = useArchiveAdminI18n();

  const sourcesMap = useMemo(() => {
    if (!sources) return SOURCE_REGISTRY;
    return Object.fromEntries(sources.map((s) => [s.id, s]));
  }, [sources]);

  if (!record) return null;

  const mediaEntry = record.mediaId && record.mediaId in MEDIA ? MEDIA[record.mediaId as keyof typeof MEDIA] : null;
  const dateInfo = formatDateWithPrecision(record.date, record.datePrecision, t);

  return (
    <GazaSheet
      open={Boolean(record)}
      onClose={onClose}
      title={pick(lang, record.title)}
      description={record.id}
    >
      <div className="space-y-6 text-xs">
        {isDraft && <p className="rounded border border-border bg-sand p-3">{t("archive.edit.disclaimer")}</p>}
        {/* Top Badges & Status */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
          <AdminChip tone={getPublicationStateTone(record.publicationState)}>
            {isDraft ? t("archive.edit.proposedState", {state: t(`archive.pub.${record.publicationState}`)}) : t(`archive.pub.${record.publicationState}`)}
          </AdminChip>

          <AdminChip tone={getEvidenceStatusTone(record.evidenceStatus)}>
            {t(`archive.ev.${record.evidenceStatus}`)}
          </AdminChip>

          <AdminChip tone={getRightsStatusTone(record.rights.status)}>
            {t(`archive.rights.${record.rights.status}`)}
          </AdminChip>

          <AdminChip tone="muted">
            {MEDIUM_LABELS[record.medium] ? pick(lang, MEDIUM_LABELS[record.medium]) : record.medium}
          </AdminChip>

          {record.featured && (
            <AdminChip tone="brand">
              {t("archive.badge.featured")}
            </AdminChip>
          )}

          {isDraft && (
            <AdminChip tone="info">
              {t("archive.badge.localDraft")}
            </AdminChip>
          )}

          <Ltr className="select-all break-all font-mono">{record.id}</Ltr>
        </div>

        {/* Duplicate Warning Callout */}
        {record.duplicateOf && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>{t("archive.sheet.duplicateNotice", { target: record.duplicateOf })}</span>
            </div>
            {onOpenDuplicateTarget && (
              <button
                type="button"
                onClick={() => onOpenDuplicateTarget(record.duplicateOf!)}
                className="mt-1 font-semibold underline decoration-dotted hover:text-foreground"
              >
                {t("archive.action.inspectTarget")} (<Ltr>{record.duplicateOf}</Ltr>)
              </button>
            )}
          </div>
        )}

        {/* Section 1: General Information & Narrative */}
        <section aria-labelledby="sec-gen" className="space-y-3">
          <h3 id="sec-gen" className="text-sm font-bold text-foreground">
            {t("archive.sheet.general")}
          </h3>

          <div className="grid gap-3 rounded-md border border-border bg-card p-3">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground">{t("archive.field.title")}</p>
              <p className="font-semibold text-foreground"><Ltr>{record.title.en}</Ltr></p>
              <p className="font-arabic text-foreground">{record.title.ar}</p>
            </div>

            <div className="border-t border-border/60 pt-2">
              <p className="text-[11px] font-semibold text-muted-foreground">{t("archive.field.caption")}</p>
              <p className="text-muted-foreground"><Ltr>{record.caption.en}</Ltr></p>
              <p className="font-arabic text-muted-foreground mt-0.5">{record.caption.ar}</p>
            </div>

            <div className="border-t border-border/60 pt-2">
              <p className="text-[11px] font-semibold text-muted-foreground">{t("archive.field.alt")}</p>
              <p className="text-muted-foreground"><Ltr>{record.alt.en}</Ltr></p>
              <p className="font-arabic text-muted-foreground mt-0.5">{record.alt.ar}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-2">
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground">{t("archive.field.datePrecision")}</p>
                <p className="text-foreground">
                  <Ltr>{dateInfo.formatted}</Ltr>{" "}
                  <span className="text-[10px] text-muted-foreground">({record.datePrecision})</span>
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground">{t("archive.field.phase")}</p>
                <p className="text-foreground">
                  {HISTORICAL_PHASE_LABELS[record.phase]
                    ? pick(lang, HISTORICAL_PHASE_LABELS[record.phase])
                    : record.phase}
                </p>
              </div>
            </div>

            {record.location && (
              <div className="border-t border-border/60 pt-2">
                <p className="text-[11px] font-semibold text-muted-foreground">{t("archive.field.location")}</p>
                <p className="text-foreground">{record.location}</p>
              </div>
            )}

            {record.people && record.people.length > 0 && (
              <div className="border-t border-border/60 pt-2">
                <p className="text-[11px] font-semibold text-muted-foreground">{t("archive.field.people")}</p>
                <p className="text-foreground">{record.people.join(", ")}</p>
              </div>
            )}

            <div className="border-t border-border/60 pt-2">
              <p className="text-[11px] font-semibold text-muted-foreground mb-1">{t("archive.field.subjects")}</p>
              <div className="flex flex-wrap gap-1">
                {record.subjects.map((s) => (
                  <span key={s} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {ARCHIVE_SUBJECT_LABELS[s] ? pick(lang, ARCHIVE_SUBJECT_LABELS[s]) : s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Media Asset & Variants */}
        <section aria-labelledby="sec-media" className="space-y-3">
          <h3 id="sec-media" className="text-sm font-bold text-foreground">
            {t("archive.sheet.mediaPreview")}
          </h3>

          <div className="rounded-md border border-border bg-card p-3 space-y-3">
            {mediaEntry ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="size-20 shrink-0 overflow-hidden rounded border border-border bg-sand">
                    <img
                      src={mediaEntry.variants[0]?.src}
                      alt={pick(lang, record.alt)}
                      className="size-full object-cover"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground">
                      <Ltr>{record.mediaId}</Ltr>
                    </p>
                    <p className="text-muted-foreground">
                      {t("archive.sheet.intrinsicDimensions")}:{" "}
                      <Ltr>{`${mediaEntry.width} × ${mediaEntry.height} px`}</Ltr>
                    </p>
                    <p className="text-muted-foreground">
                      {t("archive.sheet.truthClass")}:{" "}
                      <span className="font-semibold">{t(`archive.truth.${mediaEntry.truthClass}`)}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {t("archive.badge.variantsCount", { count: mediaEntry.variants.length })}
                    </p>
                  </div>
                </div>

                {/* Variants List */}
                <div className="rounded border border-border/60 bg-background/50 p-2 space-y-1 text-[11px]">
                  <p className="font-semibold text-muted-foreground">{t("archive.sheet.variants")}</p>
                  <ul className="divide-y divide-border/40 font-mono text-[10px]">
                    {mediaEntry.variants.map((v, i) => {
                      const format = v.src.split(".").pop()?.toUpperCase() ?? "WEBP";
                      return (
                        <li key={i} className="flex items-center justify-between py-1">
                          <Ltr>{`${v.width}w (${v.width}×${v.height}) [${format}]`}</Ltr>
                          <Ltr className="truncate max-w-[14rem] text-muted-foreground/70">{v.src}</Ltr>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            ) : record.youtubeId ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <VideoIcon className="size-4 text-brand" />
                  <span className="font-semibold text-foreground">{t("archive.filter.externalVideo")}</span>
                </div>
                <p className="text-muted-foreground">
                  {t("archive.sheet.youtubeId")}: <Ltr className="font-mono">{record.youtubeId}</Ltr>
                </p>
                <div className="rounded bg-sand p-2.5 text-[11px] text-muted-foreground space-y-1.5">
                  <p>{t("archive.sheet.noEmbedPolicy")}</p>
                  <p className="text-[10px] text-muted-foreground/90 font-medium">
                    {t("archive.media.verifiedCount", { count: 4 })}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground py-2">
                <FileText className="size-4" />
                <span>{t("archive.media.notRegistered")}</span>
              </div>
            )}

            {/* Technical Provenance Strings */}
            <div className="border-t border-border/60 pt-2 space-y-1">
              {record.originalFilename && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">{t("archive.sheet.originalFilename")}:</span>
                  <Ltr className="font-mono text-[11px] break-all text-foreground">{record.originalFilename}</Ltr>
                </div>
              )}
              {record.intakeReference && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">{t("archive.sheet.intakeReference")}:</span>
                  <Ltr className="font-mono text-[11px] text-foreground">{record.intakeReference}</Ltr>
                </div>
              )}
              {record.curatorPublicationStatus && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">{t("archive.sheet.curatorStatus")}:</span>
                  <span className="font-mono text-[11px] text-foreground">{record.curatorPublicationStatus}</span>
                </div>
              )}
              {record.factCheckNotes && (
                <div className="pt-1">
                  <span className="text-[11px] font-semibold text-muted-foreground">{t("archive.sheet.factCheckNotes")}:</span>
                  <p className="mt-0.5 rounded bg-secondary/50 p-2 text-[11px] text-muted-foreground">
                    {record.factCheckNotes}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Section 3: Rights & Licensing */}
        <section aria-labelledby="sec-rights" className="space-y-3">
          <h3 id="sec-rights" className="text-sm font-bold text-foreground">
            {t("archive.sheet.rights")}
          </h3>

          <div className="grid gap-2 rounded-md border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("archive.field.rights")}</span>
              <span className="font-semibold text-foreground">{t(`archive.rights.${record.rights.status}`)}</span>
            </div>

            {record.rights.license && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("archive.field.license")}</span>
                {record.rights.licenseUrl ? (
                  <a
                    href={record.rights.licenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
                  >
                    <span>{record.rights.license}</span>
                    <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <span className="font-semibold text-foreground">{record.rights.license}</span>
                )}
              </div>
            )}

            {record.rights.credit && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("archive.field.credit")}</span>
                <span className="text-foreground">{record.rights.credit}</span>
              </div>
            )}

            {record.rights.holder && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("archive.field.holder")}</span>
                <span className="text-foreground">{record.rights.holder}</span>
              </div>
            )}

            {record.publicationBasis && (
              <div className="flex items-center justify-between border-t border-border/60 pt-2">
                <span className="text-muted-foreground">{t("archive.filter.pubBasis")}:</span>
                <span className="font-semibold text-foreground">{t(`archive.basis.${record.publicationBasis}`)}</span>
              </div>
            )}

            {record.rights.modificationNote && (
              <div className="border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                <span className="font-semibold">{t("archive.field.modificationNote")}</span>
                {record.rights.modificationNote}
              </div>
            )}
          </div>
        </section>

        {/* Section 4: Authoritative Sources */}
        <section aria-labelledby="sec-sources" className="space-y-3">
          <h3 id="sec-sources" className="text-sm font-bold text-foreground">
            {t("archive.sheet.citations")}
          </h3>

          <div className="rounded-md border border-border bg-card p-3 space-y-2">
            {record.sourceRefs.length === 0 ? (
              <p className="text-muted-foreground">{t("archive.sources.none")}</p>
            ) : (
              <ul className="divide-y divide-border/60 space-y-2">
                {record.sourceRefs.map((refId) => {
                  const src = sourcesMap[refId];
                  const isLocalDraft = draftSourceIds.includes(refId);
                  return (
                    <li key={refId} className="pt-2 first:pt-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Ltr className="font-mono font-semibold text-brand">{refId}</Ltr>
                          {isLocalDraft && (
                            <AdminChip tone="info">{t("archive.badge.localDraft")}</AdminChip>
                          )}
                        </div>
                        {src && (
                          <span className="text-[10px] text-muted-foreground">{src.publisher}</span>
                        )}
                      </div>
                      {src ? (
                        <>
                          <p className="font-semibold text-foreground">
                            {pick(lang, { en: src.title, ar: src.titleAr ?? src.title })}
                          </p>
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
                          >
                            <span>{t("archive.action.openExternal")}</span>
                            <ExternalLink className="size-3" />
                          </a>
                        </>
                      ) : (
                        <p className="text-muted-foreground italic">{t("archive.sources.unresolved")}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Footer Actions */}
        <div className="pt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className={btnClass("outline", "sm", canEdit && onEdit ? "flex-1" : "w-full")}
          >
            {t("archive.action.close")}
          </button>
          {canEdit && onEdit && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(record.id);
              }}
              className={btnClass("primary", "sm", "flex-1")}
            >
              {t("archive.action.edit")}
            </button>
          )}
        </div>
      </div>
    </GazaSheet>
  );
}
