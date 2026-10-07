import { useMemo, useState } from "react";
import { Search, RotateCcw, ExternalLink, Plus } from "lucide-react";
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
import {
  SOURCE_TYPE_LABELS,
  type ArchiveRecord,
  type SourceRecord,
  type SourceType,
} from "@/lib/archive/types";
import {
  DEFAULT_SOURCE_FILTERS,
  filterSourceRecords,
  getSourceCatalogStats,
  isSourceFilterActive,
  type SourceFilterState,
} from "./filter-helpers";
import { useArchiveAdminI18n } from "./i18n";

export interface SourceCatalogProps {
  sources: readonly SourceRecord[];
  archiveRecords: readonly ArchiveRecord[];
  draftSourceIds?: readonly string[] | undefined;
  canEdit?: boolean | undefined;
  onOpenSource: (id: string) => void;
  onEditSource?: ((id: string) => void) | undefined;
  onNewSource?: (() => void) | undefined;
}

export function SourceCatalog({
  sources,
  archiveRecords,
  draftSourceIds = [],
  canEdit = false,
  onOpenSource,
  onEditSource,
  onNewSource,
}: SourceCatalogProps) {
  const { lang, t } = useArchiveAdminI18n();
  const [filters, setFilters] = useState<SourceFilterState>(DEFAULT_SOURCE_FILTERS);

  const stats = useMemo(
    () => getSourceCatalogStats(sources, archiveRecords),
    [sources, archiveRecords],
  );

  const filteredSources = useMemo(
    () => filterSourceRecords(sources, archiveRecords, filters),
    [sources, archiveRecords, filters],
  );

  const filterActive = isSourceFilterActive(filters);

  const resetFilters = () => {
    setFilters(DEFAULT_SOURCE_FILTERS);
  };

  return (
    <div className="space-y-4">
      {/* Editorial Disclosure */}
      <div className="rounded-md border border-border bg-sand p-3 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground mb-1">
          {t("archive.disclosure.sources")}
        </p>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md border border-border bg-card p-2.5">
          <p className="text-[11px] text-muted-foreground">{t("archive.stats.sourcesTotal")}</p>
          <p className="text-base font-bold text-foreground">{stats.total}</p>
        </div>
        <div className="rounded-md border border-border bg-card p-2.5">
          <p className="text-[11px] text-muted-foreground">{t("archive.stats.sourcesCited")}</p>
          <p className="text-base font-bold text-brand">{stats.cited}</p>
        </div>
        <div className="rounded-md border border-border bg-card p-2.5">
          <p className="text-[11px] text-muted-foreground">{t("archive.filter.uncited")}</p>
          <p className="text-base font-bold text-muted-foreground">{stats.uncited}</p>
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
              aria-label={t("archive.filter.searchSources")}
              placeholder={t("archive.filter.searchSources")}
              value={filters.query}
              onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value }))}
              className="ps-8 text-xs"
            />
          </div>

          {canEdit && onNewSource && (
            <button
              type="button"
              onClick={onNewSource}
              className={btnClass("primary", "sm")}
            >
              <Plus className="size-3.5 me-1" />
              <span>{t("archive.action.newSource")}</span>
            </button>
          )}

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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
          {/* Source Type */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">{t("archive.filter.sourceType")}</label>
            <Select
              aria-label={t("archive.filter.sourceType")}
              value={filters.type}
              onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value as SourceType | "all" }))}
              className="w-full text-xs"
            >
              <option value="all">{t("archive.filter.all")}</option>
              {(Object.keys(SOURCE_TYPE_LABELS) as SourceType[]).map((st) => (
                <option key={st} value={st}>{pick(lang, SOURCE_TYPE_LABELS[st])}</option>
              ))}
            </Select>
          </div>

          {/* Language */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">{t("archive.filter.language")}</label>
            <Select
              aria-label={t("archive.filter.language")}
              value={filters.language}
              onChange={(e) => setFilters((prev) => ({ ...prev, language: e.target.value as SourceFilterState["language"] }))}
              className="w-full text-xs"
            >
              <option value="all">{t("archive.filter.all")}</option>
              <option value="en">{t("archive.field.english")}</option>
              <option value="ar">العربية (AR)</option>
              <option value="he">{t("archive.field.hebrew")}</option>
              <option value="multilingual">{t("archive.field.multilingual")}</option>
            </Select>
          </div>

          {/* Archival Status */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">{t("archive.filter.archivalStatus")}</label>
            <Select
              aria-label={t("archive.filter.archivalStatus")}
              value={filters.archivalStatus}
              onChange={(e) => setFilters((prev) => ({ ...prev, archivalStatus: e.target.value as SourceFilterState["archivalStatus"] }))}
              className="w-full text-xs"
            >
              <option value="all">{t("archive.filter.all")}</option>
              <option value="live">{t("archive.src.status.live")}</option>
              <option value="official-repository">{t("archive.src.status.official-repository")}</option>
              <option value="archived-wayback">{t("archive.src.status.archived-wayback")}</option>
              <option value="print-record">{t("archive.src.status.print-record")}</option>
            </Select>
          </div>

          {/* Citation Coverage */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">{t("archive.filter.citationCoverage")}</label>
            <Select
              aria-label={t("archive.filter.citationCoverage")}
              value={filters.citationCoverage}
              onChange={(e) => setFilters((prev) => ({ ...prev, citationCoverage: e.target.value as SourceFilterState["citationCoverage"] }))}
              className="w-full text-xs"
            >
              <option value="all">{t("archive.filter.all")}</option>
              <option value="cited">{t("archive.filter.cited")}</option>
              <option value="uncited">{t("archive.filter.uncited")}</option>
            </Select>
          </div>
        </div>

        {/* Filter Results Summary */}
        <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground border-t border-border/40">
          <span>{t("archive.filter.activeCount", { count: filteredSources.length, total: sources.length })}</span>
        </div>
      </div>

      {/* Sources List Table */}
      {filteredSources.length === 0 ? (
        <AdminEmpty
          title={t("archive.filter.empty")}
          body={t("archive.filter.emptyHint")}
          action={
            filterActive ? (
              <button
                type="button"
                onClick={resetFilters}
                className={btnClass("outline", "sm")}
              >
                {t("archive.filter.reset")}
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <GazaTable className="w-full text-xs">
            <GazaTableCaption className="sr-only">{t("archive.tab.sources")}</GazaTableCaption>
            <GazaTableHeader>
              <GazaTableRow className="border-b border-border type-th">
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.sourceId")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.title")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.publisher")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.sourceType")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.language")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.date")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.citations")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.state")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-end font-bold">{t("archive.field.action")}</GazaTableHead>
              </GazaTableRow>
            </GazaTableHeader>
            <GazaTableBody>
              {filteredSources.map((s) => {
                const citeCount = archiveRecords.filter((r) => r.sourceRefs.includes(s.id)).length;
                const isDraft = draftSourceIds.includes(s.id);
                return (
                  <GazaTableRow key={s.id} className="border-b border-border/60 hover:bg-secondary/20">
                    <GazaTableCell className="px-3 py-2 font-mono font-semibold text-brand">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenSource(s.id)}
                          className="text-start underline decoration-dotted hover:text-foreground"
                        >
                          <Ltr>{s.id}</Ltr>
                        </button>
                        {isDraft && (
                          <AdminChip tone="info">{t("archive.badge.localDraft")}</AdminChip>
                        )}
                      </div>
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2 max-w-[18rem] truncate font-medium text-foreground">
                      {pick(lang, { en: s.title, ar: s.titleAr ?? s.title })}
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2 text-muted-foreground truncate max-w-[12rem]">
                      {s.publisher}
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2">
                      <AdminChip tone="muted">
                        {SOURCE_TYPE_LABELS[s.type]
                          ? pick(lang, SOURCE_TYPE_LABELS[s.type])
                          : s.type}
                      </AdminChip>
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2 text-muted-foreground font-mono">
                      {s.language.toUpperCase()}
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2 text-muted-foreground">
                      <Ltr>{s.publicationDate ?? s.eventDate ?? "-"}</Ltr>
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2">
                      {citeCount > 0 ? (
                        <span className="font-semibold text-brand"><Ltr>{citeCount}</Ltr></span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2">
                      {s.archivalStatus ? (
                        <AdminChip tone="info">
                          {t(`archive.src.status.${s.archivalStatus}`)}
                        </AdminChip>
                      ) : (
                        "-"
                      )}
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2 text-end">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={btnClass("ghost", "sm")}
                          title={t("archive.action.openExternal")}
                        >
                          <ExternalLink className="size-3.5" />
                          <span className="sr-only">{t("archive.action.openExternal")}</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => onOpenSource(s.id)}
                          className={btnClass("outline", "sm")}
                        >
                          {t("archive.action.inspectSource")}
                        </button>
                        {canEdit && onEditSource && (
                          <button
                            type="button"
                            onClick={() => onEditSource(s.id)}
                            className={btnClass("primary", "sm")}
                          >
                            {t("archive.action.editSource")}
                          </button>
                        )}
                      </div>
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
