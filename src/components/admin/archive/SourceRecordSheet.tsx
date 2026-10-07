import { ExternalLink, ArrowRight } from "lucide-react";
import { AdminChip, GazaSheet, Ltr } from "@/components/admin/admin-kit";
import { btnClass } from "@/components/kit";
import { pick } from "@/lib/i18n";
import {
  SOURCE_TYPE_LABELS,
  type ArchiveRecord,
  type SourceRecord,
} from "@/lib/archive/types";
import { getPublicationStateTone, useArchiveAdminI18n } from "./i18n";

export interface SourceRecordSheetProps {
  source: SourceRecord | null;
  archiveRecords: readonly ArchiveRecord[];
  draftRecordIds?: readonly string[];
  isDraft?: boolean | undefined;
  canEdit?: boolean | undefined;
  onClose: () => void;
  onEdit?: ((id: string) => void) | undefined;
  onOpenArchiveRecord?: ((recordId: string) => void) | undefined;
}

export function SourceRecordSheet({
  source,
  archiveRecords,
  draftRecordIds = [],
  isDraft,
  canEdit = false,
  onClose,
  onEdit,
  onOpenArchiveRecord,
}: SourceRecordSheetProps) {
  const { lang, t } = useArchiveAdminI18n();

  if (!source) return null;

  const citingRecords = archiveRecords.filter((r) => r.sourceRefs.includes(source.id));

  return (
    <GazaSheet
      open={Boolean(source)}
      onClose={onClose}
      title={pick(lang, { en: source.title, ar: source.titleAr ?? source.title })}
      description={source.id}
    >
      <div className="space-y-6 text-xs">
        {isDraft && <p className="rounded border border-border bg-sand p-3">{t("archive.edit.disclaimer")}</p>}
        {/* Top Badges & Status */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
          <AdminChip tone="brand">
            {SOURCE_TYPE_LABELS[source.type]
              ? pick(lang, SOURCE_TYPE_LABELS[source.type])
              : source.type}
          </AdminChip>

          <AdminChip tone="muted">
            {source.language.toUpperCase()}
          </AdminChip>

          {source.archivalStatus && (
            <AdminChip tone="info">
              {t(`archive.src.status.${source.archivalStatus}`)}
            </AdminChip>
          )}

          {isDraft && (
            <AdminChip tone="info">
              {t("archive.badge.localDraft")}
            </AdminChip>
          )}

          <AdminChip tone={citingRecords.length > 0 ? "brand" : "muted"}>
            {citingRecords.length > 0
              ? t("archive.badge.citationsCount", { count: citingRecords.length })
              : t("archive.badge.noCitations")}
          </AdminChip>

          <Ltr className="select-all break-all font-mono">{source.id}</Ltr>
        </div>

        {/* Section 1: Canonical Source Document Metadata */}
        <section aria-labelledby="sec-src-doc" className="space-y-3">
          <h3 id="sec-src-doc" className="text-sm font-bold text-foreground">
            {t("archive.sheet.general")}
          </h3>

          <div className="grid gap-3 rounded-md border border-border bg-card p-3">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground">{t("archive.field.title")}</p>
              <p className="font-semibold text-foreground"><Ltr>{source.title}</Ltr></p>
              {source.titleAr && (
                <p className="font-arabic text-foreground mt-1">{source.titleAr}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-2">
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground">{t("archive.field.publisher")}</p>
                <p className="font-medium text-foreground">{source.publisher}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground">{t("archive.field.sourceType")}</p>
                <p className="font-medium text-foreground">
                  {SOURCE_TYPE_LABELS[source.type]
                    ? pick(lang, SOURCE_TYPE_LABELS[source.type])
                    : source.type}
                </p>
              </div>
            </div>

            {(source.publicationDate || source.eventDate) && (
              <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-2">
                {source.publicationDate && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground">{t("archive.field.publicationDate")}</p>
                    <p className="text-foreground"><Ltr>{source.publicationDate}</Ltr></p>
                  </div>
                )}
                {source.eventDate && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground">{t("archive.field.eventDate")}</p>
                    <p className="text-foreground"><Ltr>{source.eventDate}</Ltr></p>
                  </div>
                )}
              </div>
            )}

            {source.accessedAt && (
              <div className="border-t border-border/60 pt-2">
                <p className="text-[11px] font-semibold text-muted-foreground">{t("archive.field.accessedAt")}</p>
                <p className="text-foreground"><Ltr>{source.accessedAt}</Ltr></p>
              </div>
            )}

            {/* Authoritative URL */}
            <div className="border-t border-border/60 pt-2 space-y-1">
              <p className="text-[11px] font-semibold text-muted-foreground">{t("archive.sources.url")}</p>
              <div className="flex items-center justify-between gap-2">
                <Ltr className="font-mono text-[11px] truncate max-w-[16rem] text-muted-foreground">
                  {source.url}
                </Ltr>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded bg-brand/10 px-2 py-1 text-xs font-semibold text-brand hover:bg-brand/20 shrink-0"
                >
                  <span>{t("archive.action.openExternal")}</span>
                  <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Notes and Archival Context */}
        {(source.notes || source.notesAr) && (
          <section aria-labelledby="sec-src-notes" className="space-y-3">
            <h3 id="sec-src-notes" className="text-sm font-bold text-foreground">
              {t("archive.sheet.provenance")}
            </h3>

            <div className="rounded-md border border-border bg-card p-3 space-y-2">
              {source.notes && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground">{t("archive.field.english")}</p>
                  <p className="text-muted-foreground"><Ltr>{source.notes}</Ltr></p>
                </div>
              )}
              {source.notesAr && (
                <div className="border-t border-border/60 pt-2">
                  <p className="text-[11px] font-semibold text-muted-foreground">{t("archive.field.arabic")}</p>
                  <p className="font-arabic text-muted-foreground">{source.notesAr}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Section 3: Referencing Archive Records */}
        <section aria-labelledby="sec-src-citing" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 id="sec-src-citing" className="text-sm font-bold text-foreground">
              {t("archive.stats.sourcesCited")} ({citingRecords.length})
            </h3>
          </div>

          <div className="rounded-md border border-border bg-card p-3 space-y-2">
            {citingRecords.length === 0 ? (
              <p className="text-muted-foreground py-1">
                {t("archive.badge.noCitations")}
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {citingRecords.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <Ltr className="font-mono text-[11px] font-semibold text-foreground">{r.id}</Ltr>
                        <AdminChip tone={getPublicationStateTone(r.publicationState)}>
                          {draftRecordIds.includes(r.id) ? t("archive.edit.proposedState", {state: t(`archive.pub.${r.publicationState}`)}) : t(`archive.pub.${r.publicationState}`)}
                        </AdminChip>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {pick(lang, r.title)}
                      </p>
                    </div>

                    {onOpenArchiveRecord && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenArchiveRecord(r.id);
                        }}
                        className="inline-flex items-center gap-1 text-xs text-brand hover:underline shrink-0"
                      >
                        <span>{t("archive.action.inspect")}</span>
                        <ArrowRight className="size-3 rtl:-scale-x-100" />
                      </button>
                    )}
                  </li>
                ))}
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
                onEdit(source.id);
              }}
              className={btnClass("primary", "sm", "flex-1")}
            >
              {t("archive.action.editSource")}
            </button>
          )}
        </div>
      </div>
    </GazaSheet>
  );
}
