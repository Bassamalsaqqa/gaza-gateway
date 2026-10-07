import { useMemo, useState } from "react";
import { Search, RotateCcw, LayoutGrid, List, AlertTriangle, FileText, Video as VideoIcon, Image as ImageIcon } from "lucide-react";
import { AdminChip, AdminEmpty, Ltr, Toolbar } from "@/components/admin/admin-kit";
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
  ARCHIVE_SUBJECT_LABELS,
  HISTORICAL_PHASE_LABELS,
  MEDIUM_LABELS,
  type ArchiveRecord,
  type ArchiveSubject,
  type EvidenceStatus,
  type HistoricalPhase,
  type Medium,
  type PublicationBasis,
  type PublicationState,
  type RightsStatus,
  type SourceRecord,
} from "@/lib/archive/types";
import { MEDIA } from "@/lib/media";
import {
  DEFAULT_ARCHIVE_FILTERS,
  filterArchiveRecords,
  getArchiveCatalogStats,
  isArchiveFilterActive,
  type ArchiveFilterState,
} from "./filter-helpers";
import {
  formatDateWithPrecision,
  getEvidenceStatusTone,
  getPublicationStateTone,
  getRightsStatusTone,
  useArchiveAdminI18n,
} from "./i18n";

export interface ArchiveCatalogProps {
  records: readonly ArchiveRecord[];
  compiledRecords?: readonly ArchiveRecord[];
  sources: readonly SourceRecord[];
  draftRecordIds?: readonly string[];
  canEdit?: boolean | undefined;
  onOpenRecord: (id: string) => void;
  onEditRecord?: ((id: string) => void) | undefined;
}

export function ArchiveCatalog({
  records,
  compiledRecords = records,
  sources,
  draftRecordIds = [],
  canEdit = false,
  onOpenRecord,
  onEditRecord,
}: ArchiveCatalogProps) {
  const { lang, t } = useArchiveAdminI18n();
  const [filters, setFilters] = useState<ArchiveFilterState>(DEFAULT_ARCHIVE_FILTERS);
  const [view, setView] = useState<"grid" | "table">("grid");

  const stats = useMemo(() => getArchiveCatalogStats(compiledRecords), [compiledRecords]);
  const filteredRecords = useMemo(
    () => filterArchiveRecords(records, filters),
    [records, filters],
  );

  const filterActive = isArchiveFilterActive(filters);

  const resetFilters = () => {
    setFilters(DEFAULT_ARCHIVE_FILTERS);
  };

  return (
    <div className="space-y-4">
      {/* Editorial Disclosure */}
      <div className="rounded-md border border-border bg-sand p-3 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground mb-1">
          {t("archive.disclosure.archive")}
        </p>
      </div>

      <p className="text-xs text-muted-foreground">{t("archive.edit.catalogTruth")}</p>
      {/* Overview Statistics Banner */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 text-xs">
        <div className="rounded-md border border-border bg-card p-2.5">
          <p className="text-[11px] text-muted-foreground">{t("archive.stats.total")}</p>
          <p className="text-base font-bold text-foreground">{stats.total}</p>
        </div>
        <div className="rounded-md border border-border bg-card p-2.5">
          <p className="text-[11px] text-muted-foreground">{t("archive.stats.published")}</p>
          <p className="text-base font-bold text-brand">{stats.published}</p>
        </div>
        <div className="rounded-md border border-border bg-card p-2.5">
          <p className="text-[11px] text-muted-foreground">{t("archive.stats.held")}</p>
          <p className="text-base font-bold text-amber-600 dark:text-amber-400">{stats.held}</p>
        </div>
        <div className="rounded-md border border-border bg-card p-2.5">
          <p className="text-[11px] text-muted-foreground">{t("archive.stats.excluded")}</p>
          <p className="text-base font-bold text-destructive">{stats.excluded}</p>
        </div>
        <div className="rounded-md border border-border bg-card p-2.5 col-span-2 sm:col-span-1">
          <p className="text-[11px] text-muted-foreground">{t("archive.filter.duplicates")}</p>
          <p className="text-base font-bold text-muted-foreground">{stats.duplicates}</p>
        </div>
      </div>

      {/* Search & Comprehensive Filters Toolbar */}
      <div className="space-y-3 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Text Search */}
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label={t("archive.filter.search")}
              placeholder={t("archive.filter.search")}
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

          {/* Reset Filters */}
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

        {/* Faceted Filter Selects */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 text-xs">
          {/* Medium */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">{t("archive.filter.medium")}</label>
            <Select
              aria-label={t("archive.filter.medium")}
              value={filters.medium}
              onChange={(e) => setFilters((prev) => ({ ...prev, medium: e.target.value as Medium | "all" }))}
              className="w-full text-xs"
            >
              <option value="all">{t("archive.filter.all")}</option>
              {(["photograph", "document", "video", "illustration"] as const).map((m) => (
                <option key={m} value={m}>{pick(lang, MEDIUM_LABELS[m])}</option>
              ))}
            </Select>
          </div>

          {/* Historical Phase */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">{t("archive.filter.phase")}</label>
            <Select
              aria-label={t("archive.filter.phase")}
              value={filters.phase}
              onChange={(e) => setFilters((prev) => ({ ...prev, phase: e.target.value as HistoricalPhase | "all" }))}
              className="w-full text-xs"
            >
              <option value="all">{t("archive.filter.all")}</option>
              {(["planning-construction", "opening-golden-era", "closure-destruction", "post-destruction-ruins", "contemporary-status"] as const).map((p) => (
                <option key={p} value={p}>{pick(lang, HISTORICAL_PHASE_LABELS[p])}</option>
              ))}
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

          {/* Rights Status */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">{t("archive.filter.rights")}</label>
            <Select
              aria-label={t("archive.filter.rights")}
              value={filters.rightsStatus}
              onChange={(e) => setFilters((prev) => ({ ...prev, rightsStatus: e.target.value as RightsStatus | "all" }))}
              className="w-full text-xs"
            >
              <option value="all">{t("archive.filter.all")}</option>
              {(["owner-cleared", "public-domain", "licensed", "attribution-license", "rights-managed", "unknown"] as const).map((r) => (
                <option key={r} value={r}>{t(`archive.rights.${r}`)}</option>
              ))}
            </Select>
          </div>

          {/* Source Coverage */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">{t("archive.filter.sourceCoverage")}</label>
            <Select
              aria-label={t("archive.filter.sourceCoverage")}
              value={filters.sourceCoverage}
              onChange={(e) => setFilters((prev) => ({ ...prev, sourceCoverage: e.target.value as ArchiveFilterState["sourceCoverage"] }))}
              className="w-full text-xs"
            >
              <option value="all">{t("archive.filter.all")}</option>
              <option value="has-sources">{t("archive.filter.hasSources")}</option>
              <option value="missing-sources">{t("archive.filter.missingSources")}</option>
            </Select>
          </div>

          {/* Duplicate Status */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">{t("archive.filter.duplicates")}</label>
            <Select
              aria-label={t("archive.filter.duplicates")}
              value={filters.duplicateStatus}
              onChange={(e) => setFilters((prev) => ({ ...prev, duplicateStatus: e.target.value as ArchiveFilterState["duplicateStatus"] }))}
              className="w-full text-xs"
            >
              <option value="all">{t("archive.filter.all")}</option>
              <option value="canonical-only">{t("archive.filter.canonicalOnly")}</option>
              <option value="duplicates-only">{t("archive.filter.duplicatesOnly")}</option>
            </Select>
          </div>
        </div>

        {/* Second Row Filters: Subject, Evidence, Basis, Featured */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs pt-1 border-t border-border/40">
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">{t("archive.filter.subject")}</label>
            <Select
              aria-label={t("archive.filter.subject")}
              value={filters.subject}
              onChange={(e) => setFilters((prev) => ({ ...prev, subject: e.target.value as ArchiveSubject | "all" }))}
              className="w-full text-xs"
            >
              <option value="all">{t("archive.filter.all")}</option>
              {(Object.keys(ARCHIVE_SUBJECT_LABELS) as ArchiveSubject[]).map((s) => (
                <option key={s} value={s}>{pick(lang, ARCHIVE_SUBJECT_LABELS[s])}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">{t("archive.filter.evidence")}</label>
            <Select
              aria-label={t("archive.filter.evidence")}
              value={filters.evidenceStatus}
              onChange={(e) => setFilters((prev) => ({ ...prev, evidenceStatus: e.target.value as EvidenceStatus | "all" }))}
              className="w-full text-xs"
            >
              <option value="all">{t("archive.filter.all")}</option>
              {(["verified", "partially-verified", "unverified"] as const).map((ev) => (
                <option key={ev} value={ev}>{t(`archive.ev.${ev}`)}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">{t("archive.filter.pubBasis")}</label>
            <Select
              aria-label={t("archive.filter.pubBasis")}
              value={filters.publicationBasis}
              onChange={(e) => setFilters((prev) => ({ ...prev, publicationBasis: e.target.value as PublicationBasis | "all" }))}
              className="w-full text-xs"
            >
              <option value="all">{t("archive.filter.all")}</option>
              {(["rights-cleared", "product-owner-directed-display", "external-embed"] as const).map((b) => (
                <option key={b} value={b}>{t(`archive.basis.${b}`)}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">{t("archive.filter.featured")}</label>
            <Select
              aria-label={t("archive.filter.featured")}
              value={filters.featured}
              onChange={(e) => setFilters((prev) => ({ ...prev, featured: e.target.value as ArchiveFilterState["featured"] }))}
              className="w-full text-xs"
            >
              <option value="all">{t("archive.filter.all")}</option>
              <option value="featured">{t("archive.filter.featuredOnly")}</option>
              <option value="standard">{t("archive.filter.standardOnly")}</option>
            </Select>
          </div>
        </div>

        {/* Filter Results Summary */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <span>{t("archive.filter.activeCount", { count: filteredRecords.length, total: records.length })}</span>
        </div>
      </div>

      {/* Results Rendering */}
      {filteredRecords.length === 0 ? (
        <AdminEmpty
          title={t("archive.filter.empty")}
          body={t("archive.filter.emptyHint")}
        />
      ) : view === "grid" ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredRecords.map((r) => {
            const mediaEntry = r.mediaId && r.mediaId in MEDIA ? MEDIA[r.mediaId as keyof typeof MEDIA] : null;
            const dateInfo = formatDateWithPrecision(r.date, r.datePrecision, t);
            const isDraft = draftRecordIds.includes(r.id);

            return (
              <li
                key={r.id}
                className="flex flex-col justify-between rounded-lg border border-border bg-card p-3 space-y-3 transition-colors hover:border-border/80"
              >
                <div className="space-y-2.5">
                  {/* Thumbnail / Asset Visual */}
                  <div className="relative h-28 w-full overflow-hidden rounded-md border border-border bg-sand flex items-center justify-center">
                    {mediaEntry ? (
                      <img
                        src={mediaEntry.variants[0]?.src}
                        alt={pick(lang, r.alt)}
                        className="size-full object-cover"
                      />
                    ) : r.youtubeId ? (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <VideoIcon className="size-6 text-brand" />
                        <span className="font-mono text-[10px]">{r.youtubeId}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <FileText className="size-6 text-muted-foreground/60" />
                        <span className="text-[10px]">{t("archive.media.notRegistered")}</span>
                      </div>
                    )}

                    {/* Duplicate Overlay Badge */}
                    {r.duplicateOf && (
                      <div className="absolute top-1.5 start-1.5 rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {t("archive.badge.duplicateOf", { target: r.duplicateOf })}
                      </div>
                    )}

                    {/* Local Draft Badge */}
                    {isDraft && (
                      <div className="absolute top-1.5 end-1.5 rounded bg-brand/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {t("archive.badge.localDraft")}
                      </div>
                    )}
                  </div>

                  {/* Header & Badges */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <Ltr className="font-mono text-[11px] font-bold text-foreground break-all">
                          {r.id}
                        </Ltr>
                        {isDraft && (
                          <AdminChip tone="info">{t("archive.badge.localDraft")}</AdminChip>
                        )}
                      </div>
                      <AdminChip tone={getPublicationStateTone(r.publicationState)}>
                        {draftRecordIds.includes(r.id) ? t("archive.edit.proposedState", {state: t(`archive.pub.${r.publicationState}`)}) : t(`archive.pub.${r.publicationState}`)}
                      </AdminChip>
                    </div>

                    <h4 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                      {pick(lang, r.title)}
                    </h4>

                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {pick(lang, r.caption)}
                    </p>
                  </div>

                  {/* Badges Bar */}
                  <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-border/40 text-[11px]">
                    <AdminChip tone={getEvidenceStatusTone(r.evidenceStatus)}>
                      {t(`archive.ev.${r.evidenceStatus}`)}
                    </AdminChip>

                    <AdminChip tone={getRightsStatusTone(r.rights.status)}>
                      {t(`archive.rights.${r.rights.status}`)}
                    </AdminChip>

                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {MEDIUM_LABELS[r.medium] ? pick(lang, MEDIUM_LABELS[r.medium]) : r.medium}
                    </span>

                    {/* Date badge */}
                    <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-foreground">
                      <Ltr>{dateInfo.formatted}</Ltr>
                    </span>

                    {/* Source coverage chip */}
                    {r.sourceRefs.length > 0 ? (
                      <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                        {t("archive.badge.citationsCount", { count: r.sourceRefs.length })}
                      </span>
                    ) : (
                      <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                        {t("archive.badge.noCitations")}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 border-t border-border/40 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenRecord(r.id)}
                    className={btnClass("outline", "sm", canEdit && onEditRecord ? "flex-1" : "w-full")}
                  >
                    {t("archive.action.inspect")}
                  </button>
                  {canEdit && onEditRecord && (
                    <button
                      type="button"
                      onClick={() => onEditRecord(r.id)}
                      className={btnClass("primary", "sm", "flex-1")}
                    >
                      {t("archive.action.edit")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        /* Table View */
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <GazaTable className="w-full text-xs">
            <GazaTableCaption className="sr-only">{t("archive.tab.archive")}</GazaTableCaption>
            <GazaTableHeader>
              <GazaTableRow className="border-b border-border type-th">
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.idSlug")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.title")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.medium")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.phase")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.date")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.sources")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.rights")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("archive.field.state")}</GazaTableHead>
                <GazaTableHead scope="col" className="px-3 py-2 text-end font-bold">{t("archive.field.action")}</GazaTableHead>
              </GazaTableRow>
            </GazaTableHeader>
            <GazaTableBody>
              {filteredRecords.map((r) => {
                const dateInfo = formatDateWithPrecision(r.date, r.datePrecision, t);
                return (
                  <GazaTableRow key={r.id} className="border-b border-border/60 hover:bg-secondary/20">
                    <GazaTableCell className="px-3 py-2 font-mono font-semibold text-foreground">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenRecord(r.id)}
                          className="text-start underline decoration-dotted hover:text-brand"
                        >
                          <Ltr>{r.id}</Ltr>
                        </button>
                        {draftRecordIds.includes(r.id) && (
                          <AdminChip tone="info">{t("archive.badge.localDraft")}</AdminChip>
                        )}
                      </div>
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2 max-w-[16rem] truncate font-medium text-foreground">
                      {pick(lang, r.title)}
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2 text-muted-foreground">
                      {MEDIUM_LABELS[r.medium] ? pick(lang, MEDIUM_LABELS[r.medium]) : r.medium}
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2 text-muted-foreground truncate max-w-[10rem]">
                      {HISTORICAL_PHASE_LABELS[r.phase] ? pick(lang, HISTORICAL_PHASE_LABELS[r.phase]) : r.phase}
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2 text-muted-foreground">
                      <Ltr>{dateInfo.formatted}</Ltr>
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2">
                      {r.sourceRefs.length > 0 ? (
                        <span className="font-semibold text-brand"><Ltr>{r.sourceRefs.length}</Ltr></span>
                      ) : (
                        <span className="font-semibold text-destructive">0</span>
                      )}
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2">
                      <AdminChip tone={getRightsStatusTone(r.rights.status)}>
                        {t(`archive.rights.${r.rights.status}`)}
                      </AdminChip>
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2">
                      <AdminChip tone={getPublicationStateTone(r.publicationState)}>
                        {draftRecordIds.includes(r.id) ? t("archive.edit.proposedState", {state: t(`archive.pub.${r.publicationState}`)}) : t(`archive.pub.${r.publicationState}`)}
                      </AdminChip>
                    </GazaTableCell>
                    <GazaTableCell className="px-3 py-2 text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenRecord(r.id)}
                          className={btnClass("outline", "sm")}
                        >
                          {t("archive.action.inspect")}
                        </button>
                        {canEdit && onEditRecord && (
                          <button
                            type="button"
                            onClick={() => onEditRecord(r.id)}
                            className={btnClass("primary", "sm")}
                          >
                            {t("archive.action.edit")}
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
