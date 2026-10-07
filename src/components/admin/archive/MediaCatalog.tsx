import { useMemo, useState } from "react";
import { Search, RotateCcw, LayoutGrid, List, Video as VideoIcon, FileText, Image as ImageIcon, ShieldCheck } from "lucide-react";
import { AdminChip, AdminEmpty, Ltr } from "@/components/admin/admin-kit";
import {
  GazaTable,
  GazaTableBody,
  GazaTableCaption,
  GazaTableCell,
  GazaTableHead,
  GazaTableHeader,
  GazaTableRow,
} from "@/components/gaza-table";
import { Input, Select, btnClass } from "@/components/kit";
import { pick } from "@/lib/i18n";
import type { ArchiveRecord, PublicationState } from "@/lib/archive/types";
import {
  APPROVED_MEDIA_CATALOG,
  type ApprovedMediaId,
  type TruthClass,
} from "@/lib/media-policy";
import { getVerifiedVideoReferences } from "@/lib/archive/catalog";
import { MEDIA } from "@/lib/media";
import {
  DEFAULT_MEDIA_FILTERS,
  filterMediaRecords,
  getMediaCatalogStats,
  isMediaFilterActive,
  type MediaFilterState,
} from "./filter-helpers";
import { getPublicationStateTone, useArchiveAdminI18n } from "./i18n";

export interface MediaCatalogProps {
  records: readonly ArchiveRecord[];
  onOpenMediaRecord: (id: string) => void;
}

export function MediaCatalog({
  records,
  onOpenMediaRecord,
}: MediaCatalogProps) {
  const { lang, t } = useArchiveAdminI18n();
  const [filters, setFilters] = useState<MediaFilterState>(DEFAULT_MEDIA_FILTERS);
  const [view, setView] = useState<"grid" | "table">("grid");

  const stats = useMemo(() => getMediaCatalogStats(records), [records]);
  const filteredRecords = useMemo(
    () => filterMediaRecords(records, filters),
    [records, filters],
  );

  const filterActive = isMediaFilterActive(filters);

  const resetFilters = () => {
    setFilters(DEFAULT_MEDIA_FILTERS);
  };

  return (
    <div className="space-y-4">
      {/* Editorial Disclosure */}
      <div className="rounded-md border border-border bg-sand p-3 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground mb-1">
          {t("archive.disclosure.media")}
          <span className="block mt-1">{t("archive.media.verifiedCount", { count: getVerifiedVideoReferences().length })}</span>
        </p>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
        <div className="rounded-md border border-border bg-card p-2.5">
          <p className="text-[11px] text-muted-foreground">{t("archive.stats.mediaTotal")}</p>
          <p className="text-base font-bold text-foreground">{stats.total}</p>
        </div>
        <div className="rounded-md border border-border bg-card p-2.5">
          <p className="text-[11px] text-muted-foreground">{t("archive.stats.mediaRegistered")}</p>
          <p className="text-base font-bold text-brand">{stats.registeredImages}</p>
        </div>
        <div className="rounded-md border border-border bg-card p-2.5">
          <p className="text-[11px] text-muted-foreground">{t("archive.stats.mediaVideos")}</p>
          <p className="text-base font-bold text-brand">{stats.externalVideos}</p>
        </div>
        <div className="rounded-md border border-border bg-card p-2.5">
          <p className="text-[11px] text-muted-foreground">{t("archive.filter.intakeOnly")}</p>
          <p className="text-base font-bold text-muted-foreground">{stats.intakeOnly}</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="space-y-3 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Text Search */}
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label={t("archive.filter.searchMedia")}
              placeholder={t("archive.filter.searchMedia")}
              value={filters.query}
              onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value }))}
              className="ps-8 text-xs"
            />
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-pressed={view === "grid"}
              aria-label={t("archive.view.grid")}
              onClick={() => setView("grid")}
              className={btnClass(view === "grid" ? "secondary" : "ghost", "sm")}
            >
              <LayoutGrid className="size-3.5" />
              <span className="sr-only sm:not-sr-only sm:ms-1">{t("archive.view.grid")}</span>
            </button>
            <button
              type="button"
              aria-pressed={view === "table"}
              aria-label={t("archive.view.table")}
              onClick={() => setView("table")}
              className={btnClass(view === "table" ? "secondary" : "ghost", "sm")}
            >
              <List className="size-3.5" />
              <span className="sr-only sm:not-sr-only sm:ms-1">{t("archive.view.table")}</span>
            </button>
          </div>

          {filterActive && (
            <button
              type="button"
              onClick={resetFilters}
              className={btnClass("outline", "sm")}
            >
              <RotateCcw className="size-3.5 me-1" />
              <span>{t("archive.filter.reset")}</span>
            </button>
          )}
        </div>

        {/* Faceted Select Filters */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 text-xs">
          {/* Asset Kind */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">{t("archive.filter.assetType")}</label>
            <Select
              aria-label={t("archive.filter.assetType")}
              value={filters.assetType}
              onChange={(e) => setFilters((prev) => ({ ...prev, assetType: e.target.value as MediaFilterState["assetType"] }))}
              className="w-full text-xs"
            >
              <option value="all">{t("archive.filter.all")}</option>
              <option value="registered-image">{t("archive.filter.registeredImage")}</option>
              <option value="external-video">{t("archive.filter.externalVideo")}</option>
              <option value="intake-only">{t("archive.filter.intakeOnly")}</option>
            </Select>
          </div>

          {/* Truth Classification */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">{t("archive.sheet.truthClass")}</label>
            <Select
              aria-label={t("archive.sheet.truthClass")}
              value={filters.truthClass}
              onChange={(e) => setFilters((prev) => ({ ...prev, truthClass: e.target.value as TruthClass | "all" }))}
              className="w-full text-xs"
            >
              <option value="all">{t("archive.filter.all")}</option>
              <option value="historical-documentary">{t("archive.truth.historical-documentary")}</option>
              <option value="future-concept-ai">{t("archive.truth.future-concept-ai")}</option>
              <option value="illustrative-photo">{t("archive.truth.illustrative-photo")}</option>
              <option value="brand-mark">{t("archive.truth.brand-mark")}</option>
            </Select>
          </div>

          {/* Publication State */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">{t("archive.filter.pubState")}</label>
            <Select
              aria-label={t("archive.filter.pubState")}
              value={filters.publicationState}
              onChange={(e) => setFilters((prev) => ({ ...prev, publicationState: e.target.value as PublicationState | "all" }))}
              className="w-full text-xs"
            >
              <option value="all">{t("archive.filter.all")}</option>
              {(["published", "staging", "hold-rights", "hold-provenance", "excluded"] as const).map((s) => (
                <option key={s} value={s}>{t(`archive.pub.${s}`)}</option>
              ))}
            </Select>
          </div>
        </div>

        {/* Results Count */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <span>{t("archive.filter.activeCount", { count: filteredRecords.length, total: records.length })}</span>
        </div>
      </div>

      {/* Results View */}
      {filteredRecords.length === 0 ? (
        <AdminEmpty
          title={t("archive.filter.empty")}
          body={t("archive.filter.emptyHint")}
        />
      ) : view === "grid" ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredRecords.map((r) => {
            const mediaEntry = r.mediaId && r.mediaId in MEDIA ? MEDIA[r.mediaId as keyof typeof MEDIA] : null;
            const truthClass = r.mediaId ? APPROVED_MEDIA_CATALOG[r.mediaId as ApprovedMediaId] : undefined;

            return (
              <li
                key={r.id}
                className="flex flex-col justify-between rounded-lg border border-border bg-card p-3 space-y-3 transition-colors hover:border-border/80"
              >
                <div className="space-y-2.5">
                  {/* Thumbnail / Visual */}
                  <div className="relative h-32 w-full overflow-hidden rounded-md border border-border bg-sand flex items-center justify-center">
                    {mediaEntry ? (
                      <img
                        src={mediaEntry.variants[0]?.src}
                        alt={pick(lang, r.alt)}
                        className="size-full object-cover"
                      />
                    ) : r.youtubeId ? (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <VideoIcon className="size-8 text-brand" />
                        <span className="font-mono text-[10px]">{r.youtubeId}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <FileText className="size-8 text-muted-foreground/60" />
                        <span className="text-[10px]">{t("archive.media.notRegistered")}</span>
                      </div>
                    )}

                    {/* Truth Class Overlay */}
                    {truthClass && (
                      <div className="absolute top-1.5 start-1.5 rounded bg-brand/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {t(`archive.truth.${truthClass}`)}
                      </div>
                    )}
                  </div>

                  {/* Identification */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <Ltr className="font-mono text-[11px] font-bold text-foreground truncate">
                        {r.mediaId ?? r.youtubeId ?? r.id}
                      </Ltr>
                      <AdminChip tone={getPublicationStateTone(r.publicationState)}>
                        {t(`archive.pub.${r.publicationState}`)}
                      </AdminChip>
                    </div>

                    <p className="text-xs font-semibold text-foreground line-clamp-1">
                      {pick(lang, r.title)}
                    </p>

                    {r.originalFilename && (
                      <p className="text-[11px] text-muted-foreground">
                        <Ltr className="font-mono truncate block">{r.originalFilename}</Ltr>
                      </p>
                    )}
                  </div>

                  {/* Metadata Chips */}
                  <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-border/40 text-[11px]">
                    {mediaEntry ? (
                      <>
                        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-foreground font-mono">
                          <Ltr>{`${mediaEntry.width} × ${mediaEntry.height}`}</Ltr>
                        </span>
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {t("archive.badge.variantsCount", { count: mediaEntry.variants.length })}
                        </span>
                      </>
                    ) : r.youtubeId ? (
                      <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                        {t("archive.filter.externalVideo")}
                      </span>
                    ) : (
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {t("archive.filter.intakeOnly")}
                      </span>
                    )}

                    <span className="text-[10px] text-muted-foreground italic ms-auto">
                      {t("archive.sheet.sizeUnavailable")}
                    </span>
                  </div>
                </div>

                {/* Inspect Action */}
                <div className="pt-2 border-t border-border/40">
                  <button
                    type="button"
                    onClick={() => onOpenMediaRecord(r.id)}
                    className={btnClass("outline", "sm", "w-full")}
                  >
                    {t("archive.action.inspectMedia")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        /* Table View */
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <GazaTable className="w-full text-xs">
            <GazaTableCaption className="sr-only">{t("archive.tab.media")}</GazaTableCaption>
            <GazaTableHeader>
              <GazaTableRow className="border-b border-border type-th">
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.mediaId")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.recordId")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.kind")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.sheet.truthClass")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.dimensions")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.variants")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.state")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-end font-bold">{t("archive.field.action")}</GazaTableHead>
              </GazaTableRow>
            </GazaTableHeader>
            <GazaTableBody>
              {filteredRecords.map((r) => {
                const mediaEntry = r.mediaId && r.mediaId in MEDIA ? MEDIA[r.mediaId as keyof typeof MEDIA] : null;
                const truthClass = r.mediaId ? APPROVED_MEDIA_CATALOG[r.mediaId as ApprovedMediaId] : undefined;

                return (
                  <GazaTableRow key={r.id} className="border-b border-border/60 hover:bg-secondary/20">
                    <GazaTableCell className="px-3 py-2 font-mono font-semibold text-foreground">
                      <button
                        type="button"
                        onClick={() => onOpenMediaRecord(r.id)}
                        className="text-start underline decoration-dotted hover:text-brand"
                      >
                        <Ltr>{r.mediaId ?? r.youtubeId ?? r.id}</Ltr>
                      </button>
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2 max-w-[14rem] truncate font-medium text-foreground">
                      <Ltr className="font-mono text-[11px] text-muted-foreground me-1">{r.id}</Ltr>
                      {pick(lang, r.title)}
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2 text-muted-foreground">
                      {mediaEntry ? "Image" : r.youtubeId ? "Video" : "Intake"}
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2">
                      {truthClass ? (
                        <AdminChip tone="brand">{t(`archive.truth.${truthClass}`)}</AdminChip>
                      ) : (
                        "-"
                      )}
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2 font-mono text-muted-foreground">
                      {mediaEntry ? <Ltr>{`${mediaEntry.width}×${mediaEntry.height}`}</Ltr> : "-"}
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2 font-mono">
                      {mediaEntry ? <Ltr>{mediaEntry.variants.length}</Ltr> : "-"}
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2">
                      <AdminChip tone={getPublicationStateTone(r.publicationState)}>
                        {t(`archive.pub.${r.publicationState}`)}
                      </AdminChip>
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2 text-end">
                      <button
                        type="button"
                        onClick={() => onOpenMediaRecord(r.id)}
                        className={btnClass("outline", "sm")}
                      >
                        {t("archive.action.inspectMedia")}
                      </button>
                    </GazaTableCell>
                  </GazaTableRow>
                );
              })}
            </GazaTableBody>
          </GazaTable>
        </div>
      )}
    </div>
  );
}
