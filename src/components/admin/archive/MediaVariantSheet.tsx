import { FileText, Video as VideoIcon, ShieldCheck } from "lucide-react";
import { AdminChip, GazaSheet, Ltr } from "@/components/admin/admin-kit";
import { btnClass } from "@/components/kit";
import { pick } from "@/lib/i18n";
import type { ArchiveRecord } from "@/lib/archive/types";
import {
  APPROVED_MEDIA_CATALOG,
  type ApprovedMediaId,
} from "@/lib/media-policy";
import { MEDIA } from "@/lib/media";
import { assetFormat } from "./filter-helpers";
import { getPublicationStateTone, useArchiveAdminI18n } from "./i18n";

export interface MediaVariantSheetProps {
  record: ArchiveRecord | null;
  onClose: () => void;
}

export function MediaVariantSheet({ record, onClose }: MediaVariantSheetProps) {
  const { lang, t } = useArchiveAdminI18n();

  if (!record) return null;

  const mediaEntry = record.mediaId && record.mediaId in MEDIA ? MEDIA[record.mediaId as keyof typeof MEDIA] : null;
  const truthClass = record.mediaId ? APPROVED_MEDIA_CATALOG[record.mediaId as ApprovedMediaId] : undefined;


  return (
    <GazaSheet
      open={Boolean(record)}
      onClose={onClose}
      title={record.mediaId ? record.mediaId : pick(lang, record.title)}
      description={record.id}
    >
      <div className="space-y-6 text-xs">
        {/* Top Badges */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
          {truthClass && (
            <AdminChip tone={truthClass === "historical-documentary" ? "brand" : "info"}>
              <span className="flex items-center gap-1">
                <ShieldCheck className="size-3" />
                <span>{t(`archive.truth.${truthClass}`)}</span>
              </span>
            </AdminChip>
          )}

          <AdminChip tone={getPublicationStateTone(record.publicationState)}>
            {t(`archive.pub.${record.publicationState}`)}
          </AdminChip>

          {mediaEntry && (
            <AdminChip tone="muted">
              {t("archive.badge.variantsCount", { count: mediaEntry.variants.length })}
            </AdminChip>
          )}

          <Ltr className="select-all break-all font-mono">{record.mediaId}</Ltr>
        </div>

        {/* Section 1: Asset Preview & Core Dimensions */}
        <section aria-labelledby="sec-ast-view" className="space-y-3">
          <h3 id="sec-ast-view" className="text-sm font-bold text-foreground">
            {t("archive.sheet.mediaPreview")}
          </h3>

          <div className="rounded-md border border-border bg-card p-3 space-y-3">
            {mediaEntry ? (
              <div className="space-y-3">
                <div className="overflow-hidden rounded border border-border bg-sand">
                  <img
                    src={mediaEntry.variants[mediaEntry.variants.length - 1]?.src ?? mediaEntry.variants[0]?.src}
                    alt={pick(lang, record.alt)}
                    className="max-h-64 w-full object-contain"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[11px] font-semibold text-muted-foreground">{t("archive.sheet.intrinsicDimensions")}:</span>
                    <p className="font-semibold text-foreground">
                      <Ltr>{`${mediaEntry.width} × ${mediaEntry.height} px`}</Ltr>
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-muted-foreground">{t("archive.field.format")}</span>
                    <p className="font-semibold text-foreground">{Array.from(new Set(mediaEntry.variants.map((v) => assetFormat(v.src)))).join(", ")}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-muted-foreground">{t("archive.sheet.fileSize")}:</span>
                    <p className="text-muted-foreground italic">{t("archive.sheet.sizeUnavailable")}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-muted-foreground">{t("archive.field.aspectRatio")}</span>
                    <p className="font-semibold text-foreground">
                      <Ltr>{(mediaEntry.width / mediaEntry.height).toFixed(2)}:1</Ltr>
                    </p>
                  </div>
                </div>
              </div>
            ) : record.youtubeId ? (
              <div className="space-y-3 py-2">
                <div className="flex items-center gap-2 text-brand">
                  <VideoIcon className="size-5" />
                  <span className="font-bold text-sm text-foreground">{t("archive.filter.externalVideo")}</span>
                </div>

                <div className="space-y-1">
                  <p className="text-muted-foreground">{t("archive.sheet.youtubeId")}:</p>
                  <Ltr className="font-mono text-xs font-semibold text-foreground">{record.youtubeId}</Ltr>
                </div>

                <div className="rounded bg-sand p-2.5 text-xs text-muted-foreground">
                  {t("archive.sheet.noEmbedPolicy")}
                </div>
              </div>
            ) : (
              <div className="py-4 text-center text-muted-foreground space-y-1">
                <FileText className="size-8 mx-auto text-muted-foreground/50" />
                <p className="font-semibold">{t("archive.media.notRegistered")}</p>
                <p className="text-[11px]">{t("archive.media.intakeOnly")}</p>
              </div>
            )}
          </div>
        </section>

        {/* Section 2: Responsive Variants Breakdown */}
        {mediaEntry && mediaEntry.variants.length > 0 && (
          <section aria-labelledby="sec-ast-vars" className="space-y-3">
            <h3 id="sec-ast-vars" className="text-sm font-bold text-foreground">
              {t("archive.sheet.variants")} ({mediaEntry.variants.length})
            </h3>

            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 text-start font-semibold text-muted-foreground">
                    <th scope="col" className="px-3 py-1.5 text-start">{t("archive.field.variantWidth")}</th>
                    <th scope="col" className="px-3 py-1.5 text-start">{t("archive.field.dimensions")}</th>
                    <th scope="col" className="px-3 py-1.5 text-start">{t("archive.field.assetPath")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-mono">
                  {mediaEntry.variants.map((v, i) => (
                    <tr key={i} className="hover:bg-secondary/20">
                      <td className="px-3 py-1.5 font-semibold text-foreground"><Ltr>{`${v.width}w`}</Ltr></td>
                      <td className="px-3 py-1.5 text-muted-foreground"><Ltr>{`${v.width} × ${v.height}`}</Ltr></td>
                      <td className="px-3 py-1.5 text-muted-foreground/80 truncate max-w-[14rem]"><Ltr>{v.src}</Ltr></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Section 3: Technical Provenance & Filenames (Plain text, never raw links) */}
        <section aria-labelledby="sec-ast-prov" className="space-y-3">
          <h3 id="sec-ast-prov" className="text-sm font-bold text-foreground">
            {t("archive.sheet.provenance")}
          </h3>

          <div className="rounded-md border border-border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">{t("archive.field.recordId")}</span>
              <Ltr className="font-mono text-foreground font-semibold">{record.id}</Ltr>
            </div>

            {record.originalFilename && (
              <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-1.5">
                <span className="text-[11px] text-muted-foreground">{t("archive.sheet.originalFilename")}:</span>
                <Ltr className="font-mono text-[11px] break-all text-foreground">{record.originalFilename}</Ltr>
              </div>
            )}

            {record.intakeReference && (
              <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-1.5">
                <span className="text-[11px] text-muted-foreground">{t("archive.sheet.intakeReference")}:</span>
                <Ltr className="font-mono text-foreground">{record.intakeReference}</Ltr>
              </div>
            )}

            {record.curatorPublicationStatus && (
              <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-1.5">
                <span className="text-[11px] text-muted-foreground">{t("archive.sheet.curatorStatus")}:</span>
                <span className="font-mono text-foreground">{record.curatorPublicationStatus}</span>
              </div>
            )}
          </div>
        </section>

        {/* Section 4: Provable Runtime Usage */}
        <section aria-labelledby="sec-ast-usage" className="space-y-3">
          <h3 id="sec-ast-usage" className="text-sm font-bold text-foreground">
            {t("archive.sheet.usageReferences")}
          </h3>

          <div className="rounded-md border border-border bg-card p-3">
            <p className="text-muted-foreground italic">{t("archive.sheet.notTracked")}</p>
          </div>
        </section>

        {/* Close Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className={btnClass("outline", "sm", "w-full")}
          >
            {t("archive.action.close")}
          </button>
        </div>
      </div>
    </GazaSheet>
  );
}
