import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Input, Select, Textarea, btnClass } from "@/components/kit";
import {
  AdminChip,
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  GazaSheet,
  AdminTabs,
  BilingualStatus,
  ContentStateChip,
  Ltr,
  Toolbar,
} from "@/components/admin/admin-kit";
import { GazaTable, GazaTableBody, GazaTableCaption, GazaTableCell, GazaTableHead, GazaTableHeader, GazaTableRow } from "@/components/gaza-table";
import { AdminDenied } from "@/components/admin/admin-denied";
import { CmsField as AdminField, CmsValidationFields } from "@/components/admin/cms/CmsField";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  CmsDraftBar,
  CmsConflictBanner,
  CmsSeoFields,
  useCmsDocument,
  validateAirportPastContent,
  validateAirportPresentContent,
  validateAirportFutureContent,
} from "@/components/admin/cms";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/head";
import { publishedAirportPast } from "@/content/published/airport-past";
import { publishedAirportPresent } from "@/content/published/airport-present";
import { publishedAirportFuture } from "@/content/published/airport-future";
import { SOURCE_REGISTRY, getAllSourceRecords } from "@/lib/archive/sources";
import { getIntakeArchiveRecords } from "@/lib/archive/catalog";
import type { ArchiveRecord, SourceRecord } from "@/lib/archive/types";
import type {
  FutureCopyKey,
} from "@/content/types";
import {
  ArchiveCatalog,
  ArchiveRecordEditorSheet,
  ArchiveRecordSheet,
  MediaCatalog,
  MediaVariantSheet,
  SourceCatalog,
  SourceRecordEditorSheet,
  SourceRecordSheet,
} from "@/components/admin/archive";
import { useArchiveAdminI18n } from "@/components/admin/archive/i18n";
import { useArchiveDraftSnapshot } from "@/lib/archive/drafts/queries";

type Tab = "past" | "present" | "future" | "archive" | "sources" | "media";
type Lang = "en" | "ar";

const VALID_TABS: readonly Tab[] = ["past", "present", "future", "archive", "sources", "media"];

export const Route = createFileRoute("/{-$locale}/admin/airport/")({
  validateSearch: (search: Record<string, unknown>): {
    tab?: Tab | undefined;
    item?: string | undefined;
  } => {
    const rawTab = search["tab"];
    const tabStr = typeof rawTab === "string" ? rawTab : "";
    const tab = (VALID_TABS as readonly string[]).includes(tabStr) ? (tabStr as Tab) : undefined;
    const rawItem = search["item"];
    const item = typeof rawItem === "string" && rawItem.trim() ? rawItem.trim() : undefined;
    return { tab, item };
  },
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/airport",
      en: {
        title: "Airport & archive — Gaza International Airport administration",
        description: "Past, present, future, archive, sources and media.",
      },
      ar: {
        title: "المطار والأرشيف — إدارة مطار غزة الدولي",
        description: "الماضي والحاضر والمستقبل والأرشيف والمصادر والوسائط.",
      },
      noindex: true,
    }),
  component: AdminAirportPage,
});

function LangToggle({ value, onChange }: { value: Lang; onChange: (v: Lang) => void }) {
  const { t } = useI18n();
  return (
    <div role="group" aria-label={`${t("a2.english")} / ${t("a2.arabic")}`} className="flex gap-1">
      {(["en", "ar"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={value === l}
          onClick={() => onChange(l)}
          className={btnClass(value === l ? "secondary" : "ghost", "sm")}
        >
          {t(l === "en" ? "a2.english" : "a2.arabic")}
        </button>
      ))}
    </div>
  );
}

function SourceSelector({
  sourceRefs,
  onChange,
  readOnly = false,
  errorKey,
  fieldId,
}: {
  sourceRefs: string[];
  onChange: (refs: string[]) => void;
  readOnly?: boolean | undefined;
  errorKey?: string | undefined;
  fieldId: string;
}) {
  const { t, lang } = useI18n();
  const [selectedToAdd, setSelectedToAdd] = useState("");

  const handleAdd = (refId: string) => {
    if (!refId || sourceRefs.includes(refId)) return;
    onChange([...sourceRefs, refId]);
    setSelectedToAdd("");
  };

  const handleRemove = (refId: string) => {
    onChange(sourceRefs.filter((r) => r !== refId));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {sourceRefs.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("cms.airport.noSources")}</p>
        ) : (
          sourceRefs.map((ref) => {
            const record = SOURCE_REGISTRY[ref];
            return (
              <span
                key={ref}
                className="inline-flex items-center gap-1 rounded bg-sand px-2 py-1 text-xs font-medium text-foreground border border-border"
              >
                <Ltr className="font-mono text-xs">{ref}</Ltr>
                {record ? (
                  <span className="max-w-[200px] truncate text-muted-foreground">
                    ({pick(lang, { en: record.title, ar: record.titleAr ?? record.title })})
                  </span>
                ) : (
                  <span className="text-destructive font-bold">{t("cms.err.invalidSourceRef")}</span>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    aria-label={`${t("cms.airport.removeSourceRef")}: ${ref}`}
                    onClick={() => handleRemove(ref)}
                    className="ms-1 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })
        )}
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            id={fieldId}
            dir="ltr"
            aria-invalid={Boolean(errorKey)}
            aria-describedby={errorKey ? `${fieldId}-err` : undefined}
            aria-label={t("cms.airport.selectSource")}
            value={selectedToAdd}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedToAdd(val);
              if (val) handleAdd(val);
            }}
            className="text-xs max-w-md"
          >
            <option value="">-- {t("cms.airport.selectSource")} --</option>
            {Object.values(SOURCE_REGISTRY).map((s) => (
              <option key={s.id} value={s.id} disabled={sourceRefs.includes(s.id)}>
                {s.id} — {pick(lang, { en: s.title, ar: s.titleAr ?? s.title })}
              </option>
            ))}
          </Select>
        </div>
      )}

      {errorKey && (
        <p id={`${fieldId}-err`} role="alert" className="text-xs text-destructive">
          {t(errorKey)}
        </p>
      )}
    </div>
  );
}

function AdminAirportPage() {
  const { t, lang } = useArchiveAdminI18n();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { can, toast } = useAdmin();

  const [tab, setTab] = useState<Tab>(() => search.tab ?? "past");
  const [editLang, setEditLang] = useState<Lang>("en");
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [reloadConflictOpen, setReloadConflictOpen] = useState(false);

  // Canonical records & inspection states (Phase 7B)
  const intakeRecords = useMemo(() => getIntakeArchiveRecords(), []);
  const allSources = useMemo(() => getAllSourceRecords(), []);

  const mayEdit = can("content.edit");
  const draftSnapshotQuery = useArchiveDraftSnapshot(true);
  const draftStorageError = draftSnapshotQuery.isError;
  const canEdit = mayEdit;
  const canEditArchive = mayEdit && draftSnapshotQuery.isSuccess && !draftStorageError;

  const effectiveRecords = (!draftStorageError && draftSnapshotQuery.data?.records) || intakeRecords;
  const effectiveSources = (!draftStorageError && draftSnapshotQuery.data?.sources) || allSources;
  const recordDrafts = draftSnapshotQuery.data?.recordDrafts;
  const sourceDrafts = draftSnapshotQuery.data?.sourceDrafts;
  const draftRecordIds = useMemo(() => Object.keys(recordDrafts ?? {}), [recordDrafts]);
  const draftSourceIds = useMemo(() => Object.keys(sourceDrafts ?? {}), [sourceDrafts]);

  const [selectedArchiveRecord, setSelectedArchiveRecord] = useState<ArchiveRecord | null>(null);
  const [selectedSourceRecord, setSelectedSourceRecord] = useState<{id: string} | null>(null);
  const [selectedMediaRecord, setSelectedMediaRecord] = useState<ArchiveRecord | null>(null);

  // Editing sheets states
  const [editingRecord, setEditingRecord] = useState<ArchiveRecord | null>(null);
  const [editingSource, setEditingSource] = useState<{ source: SourceRecord | null; isNew: boolean } | null>(null);
  const [recordEditorDirty, setRecordEditorDirty] = useState(false);
  const [sourceEditorDirty, setSourceEditorDirty] = useState(false);

  // Synchronize search params tab if provided
  useEffect(() => {
    setTab(search.tab ?? "past");
  }, [search.tab]);

  // Navigation controls the opened sheet, not every query refresh.
  useEffect(() => {
    setSelectedArchiveRecord(null);
    setSelectedSourceRecord(null);
    setSelectedMediaRecord(null);
    setEditingRecord(null);
    setEditingSource(null);
    setRecordEditorDirty(false);
    setSourceEditorDirty(false);
    if (!search.item) return;
    if (tab === "archive") setSelectedArchiveRecord(intakeRecords.find((r) => r.id === search.item) ?? null);
    if (tab === "sources") setSelectedSourceRecord(allSources.find((r) => r.id === search.item) ?? {id: search.item});
    if (tab === "media") setSelectedMediaRecord(intakeRecords.find((r) => r.id === search.item || r.mediaId === search.item) ?? null);
  }, [search.item, tab, intakeRecords, allSources]);

  // Documents
  const pastCms = useCmsDocument({
    key: "airport.past",
    published: publishedAirportPast,
    validate: validateAirportPastContent,
    editLang,
    onInvalidField: (field) => {
      if (field.endsWith("-ar")) setEditLang("ar");
      if (field.endsWith("-en")) setEditLang("en");
      setTab("past");
    },
  });

  const presentCms = useCmsDocument({
    key: "airport.present",
    published: publishedAirportPresent,
    validate: validateAirportPresentContent,
    editLang,
    onInvalidField: (field) => {
      if (field.endsWith("-ar")) setEditLang("ar");
      if (field.endsWith("-en")) setEditLang("en");
      setTab("present");
    },
  });

  const futureCms = useCmsDocument({
    key: "airport.future",
    published: publishedAirportFuture,
    validate: validateAirportFutureContent,
    editLang,
    onInvalidField: (field) => {
      if (field.endsWith("-ar")) setEditLang("ar");
      if (field.endsWith("-en")) setEditLang("en");
      setTab("future");
    },
  });

  // Check dirty state of active tab
  const isTabDirty = (tabName: Tab) => {
    if (tabName === "past") return pastCms.dirty;
    if (tabName === "present") return presentCms.dirty;
    if (tabName === "future") return futureCms.dirty;
    if (tabName === "archive") return recordEditorDirty;
    if (tabName === "sources") return sourceEditorDirty;
    return false;
  };

  const currentIsDirty = isTabDirty(tab);

  const busy = pastCms.saving || presentCms.saving || futureCms.saving;
  const anyDirty = pastCms.dirty || presentCms.dirty || futureCms.dirty || recordEditorDirty || sourceEditorDirty;
  const navigationBlocker = useBlocker({
    shouldBlockFn: () => anyDirty || busy,
    enableBeforeUnload: anyDirty || busy,
    withResolver: true,
  });

  useEffect(() => {
    if (!search.item) return;
    const frame = requestAnimationFrame(() => {
      const item = search.item;
      const target = item && (pastCms.draft.timeline.some((entry) => entry.id === item) ? `past-ch-${item}` :
        presentCms.draft.facts.some((entry) => entry.id === item) ? `pr-fact-${item}` :
        presentCms.draft.dossiers.some((entry) => entry.id === item) ? `pr-dossier-${item}` : null);
      if (target) document.getElementById(target)?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [search.item, tab, pastCms.ready, presentCms.ready, pastCms.draft.timeline, presentCms.draft.facts, presentCms.draft.dossiers]);

  const handleTabChange = (nextTab: Tab) => {
    if (nextTab === tab || busy) return;
    if (currentIsDirty) {
      setPendingTab(nextTab);
    } else {
      setEditingRecord(null);
      setEditingSource(null);
      setTab(nextTab);
    }
  };

  const handleConfirmTabSwitch = () => {
    if (!pendingTab || busy) return;
    if (tab === "past") pastCms.resetLocalEdits();
    if (tab === "present") presentCms.resetLocalEdits();
    if (tab === "future") futureCms.resetLocalEdits();
    if (tab === "archive") {
      setEditingRecord(null);
      setRecordEditorDirty(false);
    }
    if (tab === "sources") {
      setEditingSource(null);
      setSourceEditorDirty(false);
    }
    setTab(pendingTab);
    setPendingTab(null);
  };

  const handleCancelTabSwitch = () => {
    setPendingTab(null);
  };

  // Past Document Handlers
  const handleSavePast = async () => {
    const res = await pastCms.save();
    if (res.success) {
      if (res.changed) toast(t("cms.savedDraftSuccess"));
    } else if (res.errors && Object.keys(res.errors).length > 0) {
      toast(t("cms.err.fixErrors"));
    } else if (pastCms.saveError) {
      toast(pastCms.saveError);
    }
  };

  const handleDiscardPast = async () => {
    const success = await pastCms.discard();
    if (success) toast(t("cms.discardSuccess"));
    setDiscardDialogOpen(false);
  };

  const updatePastIntro = (field: "title" | "description" | "notice", value: string) => {
    pastCms.setDraft((cur) => ({
      ...cur,
      intro: {
        ...cur.intro,
        [field]: { ...cur.intro[field], [editLang]: value },
      },
    }));
  };

  const updatePastTimelineEntry = (
    id: string,
    field: "title" | "body",
    value: string,
  ) => {
    pastCms.setDraft((cur) => ({
      ...cur,
      timeline: cur.timeline.map((entry) =>
        entry.id === id
          ? { ...entry, [field]: { ...entry[field], [editLang]: value } }
          : entry,
      ),
    }));
  };

  const updatePastPeriod = (id: string, period: string) => {
    pastCms.setDraft((cur) => ({
      ...cur,
      timeline: cur.timeline.map((entry) =>
        entry.id === id ? { ...entry, period } : entry,
      ),
    }));
  };

  const updatePastSourceRefs = (id: string, sourceRefs: string[]) => {
    pastCms.setDraft((cur) => ({
      ...cur,
      timeline: cur.timeline.map((entry) =>
        entry.id === id ? { ...entry, sourceRefs } : entry,
      ),
    }));
  };

  const togglePastVisibility = (id: string) => {
    pastCms.setDraft((cur) => ({
      ...cur,
      timeline: cur.timeline.map((entry) =>
        entry.id === id ? { ...entry, visible: !entry.visible } : entry,
      ),
    }));
  };

  const movePastChapter = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= pastCms.draft.timeline.length) return;
    pastCms.setDraft((cur) => {
      const items = [...cur.timeline];
      const a = items[fromIdx];
      const b = items[toIdx];
      if (!a || !b) return cur;
      items[fromIdx] = b;
      items[toIdx] = a;
      return { ...cur, timeline: items };
    });
  };

  // Present Document Handlers
  const handleSavePresent = async () => {
    const res = await presentCms.save();
    if (res.success) {
      if (res.changed) toast(t("cms.savedDraftSuccess"));
    } else if (res.errors && Object.keys(res.errors).length > 0) {
      toast(t("cms.err.fixErrors"));
    } else if (presentCms.saveError) {
      toast(presentCms.saveError);
    }
  };

  const handleDiscardPresent = async () => {
    const success = await presentCms.discard();
    if (success) toast(t("cms.discardSuccess"));
    setDiscardDialogOpen(false);
  };

  const updatePresentIntro = (field: "title" | "subtitle" | "notice", value: string) => {
    presentCms.setDraft((cur) => ({
      ...cur,
      intro: {
        ...cur.intro,
        [field]: { ...cur.intro[field], [editLang]: value },
      },
    }));
  };

  const updatePresentFact = (
    factId: string,
    field: "label" | "value" | "detail",
    value: string,
  ) => {
    presentCms.setDraft((cur) => ({
      ...cur,
      facts: cur.facts.map((f) =>
        f.id === factId
          ? { ...f, [field]: { ...f[field], [editLang]: value } }
          : f,
      ),
    }));
  };

  const updatePresentFactSources = (factId: string, sourceRefs: string[]) => {
    presentCms.setDraft((cur) => ({
      ...cur,
      facts: cur.facts.map((f) => (f.id === factId ? { ...f, sourceRefs } : f)),
    }));
  };

  const updatePresentDossierTitle = (dossierId: string, value: string) => {
    presentCms.setDraft((cur) => ({
      ...cur,
      dossiers: cur.dossiers.map((d) =>
        d.id === dossierId
          ? { ...d, title: { ...d.title, [editLang]: value } }
          : d,
      ),
    }));
  };

  const updatePresentDossierParagraph = (
    dossierId: string,
    pIdx: number,
    value: string,
  ) => {
    presentCms.setDraft((cur) => ({
      ...cur,
      dossiers: cur.dossiers.map((d) => {
        if (d.id !== dossierId) return d;
        const paragraphs = [...d.paragraphs];
        paragraphs[pIdx] = { ...paragraphs[pIdx]!, [editLang]: value };
        return { ...d, paragraphs };
      }),
    }));
  };

  const addPresentDossierParagraph = (dossierId: string) => {
    presentCms.setDraft((cur) => ({
      ...cur,
      dossiers: cur.dossiers.map((d) => {
        if (d.id !== dossierId) return d;
        return {
          ...d,
          paragraphs: [...d.paragraphs, { en: "New documented paragraph", ar: "فقرة توثيقية جديدة" }],
        };
      }),
    }));
  };

  const deletePresentDossierParagraph = (dossierId: string, pIdx: number) => {
    presentCms.setDraft((cur) => ({
      ...cur,
      dossiers: cur.dossiers.map((d) => {
        if (d.id !== dossierId || d.paragraphs.length <= 1) return d;
        return {
          ...d,
          paragraphs: d.paragraphs.filter((_, idx) => idx !== pIdx),
        };
      }),
    }));
  };

  const updatePresentDossierSources = (dossierId: string, sourceRefs: string[]) => {
    presentCms.setDraft((cur) => ({
      ...cur,
      dossiers: cur.dossiers.map((d) => (d.id === dossierId ? { ...d, sourceRefs } : d)),
    }));
  };

  const updatePresentSpatial = (
    field: "title" | "description" | "evidentiaryRuleTitle" | "evidentiaryRuleBody",
    value: string,
  ) => {
    presentCms.setDraft((cur) => ({
      ...cur,
      spatial: {
        ...cur.spatial,
        [field]: { ...cur.spatial[field], [editLang]: value },
      },
    }));
  };

  const updatePresentSpatialSources = (sourceRefs: string[]) => {
    presentCms.setDraft((cur) => ({
      ...cur,
      spatial: { ...cur.spatial, sourceRefs },
    }));
  };

  const updatePresentGlobalHorizons = (
    field: "eyebrow" | "title" | "description",
    value: string,
  ) => {
    presentCms.setDraft((cur) => ({
      ...cur,
      globalHorizons: {
        ...cur.globalHorizons,
        [field]: { ...cur.globalHorizons[field], [editLang]: value },
      },
    }));
  };

  // Future Document Handlers
  const handleSaveFuture = async () => {
    const res = await futureCms.save();
    if (res.success) {
      if (res.changed) toast(t("cms.savedDraftSuccess"));
    } else if (res.errors && Object.keys(res.errors).length > 0) {
      toast(t("cms.err.fixErrors"));
    } else if (futureCms.saveError) {
      toast(futureCms.saveError);
    }
  };

  const handleDiscardFuture = async () => {
    const success = await futureCms.discard();
    if (success) toast(t("cms.discardSuccess"));
    setDiscardDialogOpen(false);
  };

  const updateFutureCopy = (key: FutureCopyKey, value: string) => {
    futureCms.setDraft((cur) => ({
      ...cur,
      copy: {
        ...cur.copy,
        [key]: { ...cur.copy[key], [editLang]: value },
      },
    }));
  };


  const FUTURE_SECTIONS: {
    groupId: string;
    groupLabel: string;
    keys: { key: FutureCopyKey; labelKey: string; isTextarea?: boolean }[];
  }[] = [
    {
      groupId: "hero",
      groupLabel: t("cms.airport.introHeading"),
      keys: [
        { key: "title", labelKey: "a2.title" },
        { key: "subtitle", labelKey: "a2.body", isTextarea: true },
        { key: "notice", labelKey: "cms.airport.futureNoticeLabel", isTextarea: true },
      ],
    },
    {
      groupId: "terminal",
      groupLabel: t("a2.ap.fu.terminal"),
      keys: [
        { key: "terminalTitle", labelKey: "a2.title" },
        { key: "terminalBody", labelKey: "a2.body", isTextarea: true },
      ],
    },
    {
      groupId: "hospitality",
      groupLabel: t("a2.ap.fu.experience"),
      keys: [
        { key: "hospitalityTitle", labelKey: "a2.title" },
        { key: "hospitalityBody", labelKey: "a2.body", isTextarea: true },
      ],
    },
    {
      groupId: "masterplan",
      groupLabel: t("a2.ap.fu.masterplan"),
      keys: [
        { key: "masterplanTitle", labelKey: "a2.title" },
        { key: "masterplanBody", labelKey: "a2.body", isTextarea: true },
      ],
    },
    {
      groupId: "network",
      groupLabel: t("a2.ap.fu.network"),
      keys: [
        { key: "networkTitle", labelKey: "a2.title" },
        { key: "networkBody", labelKey: "a2.body", isTextarea: true },
      ],
    },
  ];

  if (!can("content.view")) return <AdminDenied area={t("a2.ap.title")} permission="content.view" />;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("a2.ap.title")}
        description={t("a2.ap.sub")}
        meta={
          <p className="text-xs text-muted-foreground">
            {t("cms.localDraftDisclaimer")}
          </p>
        }
      />

      <AdminPanel bodyClassName="p-0">
        <AdminTabs
          label={t("a2.ap.title")}
          active={tab}
          onChange={handleTabChange}
          tabs={[
            { id: "past", label: t("a2.ap.tab.past") },
            { id: "present", label: t("a2.ap.tab.present") },
            { id: "future", label: t("a2.ap.tab.future") },
            { id: "archive", label: t("a2.ap.tab.archive"), count: effectiveRecords.length },
            { id: "sources", label: t("a2.ap.tab.sources"), count: effectiveSources.length },
            { id: "media", label: t("a2.ap.tab.media"), count: intakeRecords.length },
          ]}
        >

        <div className="space-y-4 p-4">
          {["past", "present", "future"].includes(tab) && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <LangToggle value={editLang} onChange={setEditLang} />
              <div className="flex items-center gap-2">
                <BilingualStatus
                  missingAr={
                    tab === "past"
                      ? !pastCms.draft.intro.title.ar.trim()
                      : tab === "present"
                      ? !presentCms.draft.intro.title.ar.trim()
                      : !futureCms.draft.copy.title.ar.trim()
                  }
                />
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------------ */}
          {/* TAB: PAST                                                          */}
          {/* ------------------------------------------------------------------ */}
          {tab === "past" && (
            <CmsValidationFields errors={pastCms.errors}>
              {pastCms.saveError && <p role="alert" className="text-sm text-destructive">
                <span>{pastCms.saveError}</span>
                <button type="button" className={btnClass("ghost", "sm")} onClick={() => { void pastCms.retryRead(); }}>{t("cms.retry")}</button>
              </p>}
            <fieldset className="space-y-6 min-w-0" disabled={!mayEdit || !pastCms.ready || pastCms.saving}>
              <CmsDraftBar
                mayEdit={mayEdit}
                draftReady={pastCms.ready}
                unavailable={Boolean(pastCms.saveError)}
                dirty={pastCms.dirty}
                savedDraft={pastCms.savedDraft}
                saving={pastCms.saving}
                previewUrlEn="/airport/past?contentPreview=1"
                previewUrlAr="/ar/airport/past?contentPreview=1"
                onSave={handleSavePast}
                onDiscard={() => setDiscardDialogOpen(true)}
              />

              {pastCms.conflict && (
                <CmsConflictBanner
                  onReload={() => setReloadConflictOpen(true)}
                  onDismiss={pastCms.dismissConflict}
                />
              )}

              {/* SEO */}
              <CmsSeoFields
                seo={pastCms.draft.seo}
                editLang={editLang}
                mayEdit={mayEdit}
                ready={pastCms.ready}
                errors={pastCms.errors}
                onChange={(seo) => pastCms.setDraft((cur) => ({ ...cur, seo }))}
              />

              {/* Intro Narrative */}
              <section className="rounded-md border border-border p-4 space-y-4 bg-surface">
                <h2 className="text-sm font-bold text-foreground">
                  {t("cms.airport.introHeading")}
                </h2>
                <div className="grid gap-3 lg:grid-cols-2">
                  <AdminField
                    label={`${t("a2.title")} (${t(editLang === "en" ? "a2.english" : "a2.arabic")})`}
                    htmlFor={`past-intro-title-${editLang}`}
                  >
                    <Input
                      id={`past-intro-title-${editLang}`}
                      dir={editLang === "ar" ? "rtl" : "ltr"}
                      value={pastCms.draft.intro.title[editLang]}
                      readOnly={!mayEdit || !pastCms.ready}
                      aria-invalid={Boolean(pastCms.errors[`past-intro-title-${editLang}`])}
                      aria-describedby={
                        pastCms.errors[`past-intro-title-${editLang}`]
                          ? `past-intro-title-${editLang}-err`
                          : undefined
                      }
                      onChange={(e) => updatePastIntro("title", e.target.value)}
                    />
                    {pastCms.errors[`past-intro-title-${editLang}`] && (
                      <p id={`past-intro-title-${editLang}-err`} role="alert" className="mt-1 text-xs text-destructive">
                        {t(pastCms.errors[`past-intro-title-${editLang}`]!)}
                      </p>
                    )}
                  </AdminField>

                  <AdminField
                    label={`${t("cms.copy.sub")} (${t(editLang === "en" ? "a2.english" : "a2.arabic")})`}
                    htmlFor={`past-intro-desc-${editLang}`}
                  >
                    <Input
                      id={`past-intro-desc-${editLang}`}
                      dir={editLang === "ar" ? "rtl" : "ltr"}
                      value={pastCms.draft.intro.description[editLang]}
                      readOnly={!mayEdit || !pastCms.ready}
                      aria-invalid={Boolean(pastCms.errors[`past-intro-desc-${editLang}`])}
                      aria-describedby={
                        pastCms.errors[`past-intro-desc-${editLang}`]
                          ? `past-intro-desc-${editLang}-err`
                          : undefined
                      }
                      onChange={(e) => updatePastIntro("description", e.target.value)}
                    />
                    {pastCms.errors[`past-intro-desc-${editLang}`] && (
                      <p id={`past-intro-desc-${editLang}-err`} role="alert" className="mt-1 text-xs text-destructive">
                        {t(pastCms.errors[`past-intro-desc-${editLang}`]!)}
                      </p>
                    )}
                  </AdminField>

                  <AdminField
                    label={`${t("a2.ap.past.narrative")} (${t(editLang === "en" ? "a2.english" : "a2.arabic")})`}
                    htmlFor={`past-intro-notice-${editLang}`}
                    className="lg:col-span-2"
                  >
                    <Textarea
                      id={`past-intro-notice-${editLang}`}
                      rows={2}
                      dir={editLang === "ar" ? "rtl" : "ltr"}
                      value={pastCms.draft.intro.notice[editLang]}
                      readOnly={!mayEdit || !pastCms.ready}
                      aria-invalid={Boolean(pastCms.errors[`past-intro-notice-${editLang}`])}
                      aria-describedby={
                        pastCms.errors[`past-intro-notice-${editLang}`]
                          ? `past-intro-notice-${editLang}-err`
                          : undefined
                      }
                      onChange={(e) => updatePastIntro("notice", e.target.value)}
                    />
                    {pastCms.errors[`past-intro-notice-${editLang}`] && (
                      <p id={`past-intro-notice-${editLang}-err`} role="alert" className="mt-1 text-xs text-destructive">
                        {t(pastCms.errors[`past-intro-notice-${editLang}`]!)}
                      </p>
                    )}
                  </AdminField>
                </div>
              </section>

              {/* Historical Timeline Chapters */}
              <section className="space-y-4">
                <h2 className="text-sm font-bold text-foreground">
                  {t("cms.airport.chapters")}
                </h2>
                <ol className="space-y-4">
                  {pastCms.draft.timeline.map((entry, idx) => (
                    <li
                      key={entry.id}
                      id={`past-ch-${entry.id}`}
                      className="rounded-md border border-border p-4 bg-surface space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-muted-foreground bg-sand px-2 py-0.5 rounded">
                            {entry.id}
                          </span>
                          <span className="text-sm font-semibold">
                            {pick(lang, entry.title)}
                          </span>
                          <AdminChip tone={entry.visible ? "brand" : "muted"}>
                            {t(entry.visible ? "a2.visible" : "a2.hidden")}
                          </AdminChip>
                          <AdminChip tone={entry.evidence === "verified" ? "brand" : "warn"}>
                            {t(`cms.evidence.${entry.evidence}`)}
                          </AdminChip>
                        </div>

                        {mayEdit && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              aria-label={t("a2.moveUp")}
                              onClick={() => movePastChapter(idx, idx - 1)}
                              className={btnClass("ghost", "sm")}
                            >
                              <ChevronUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === pastCms.draft.timeline.length - 1}
                              aria-label={t("a2.moveDown")}
                              onClick={() => movePastChapter(idx, idx + 1)}
                              className={btnClass("ghost", "sm")}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => togglePastVisibility(entry.id)}
                              className={btnClass("outline", "sm")}
                            >
                              {t(entry.visible ? "a2.hide" : "a2.show")}
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="grid gap-3 lg:grid-cols-3">
                        <AdminField label={t("cms.airport.period")} htmlFor={`past-ch-${entry.id}-period`}>
                          <Input
                            id={`past-ch-${entry.id}-period`}
                            dir="ltr"
                            value={entry.period}
                            readOnly={!mayEdit || !pastCms.ready}
                            aria-invalid={Boolean(pastCms.errors[`past-ch-${entry.id}-period`])}
                            onChange={(e) => updatePastPeriod(entry.id, e.target.value)}
                          />
                        </AdminField>

                        <AdminField
                          label={`${t("cms.airport.chapterTitle")} (${t(editLang === "en" ? "a2.english" : "a2.arabic")})`}
                          htmlFor={`past-ch-${entry.id}-title-${editLang}`}
                          className="lg:col-span-2"
                        >
                          <Input
                            id={`past-ch-${entry.id}-title-${editLang}`}
                            dir={editLang === "ar" ? "rtl" : "ltr"}
                            value={entry.title[editLang]}
                            readOnly={!mayEdit || !pastCms.ready}
                            aria-invalid={Boolean(pastCms.errors[`past-ch-${entry.id}-title-${editLang}`])}
                            onChange={(e) => updatePastTimelineEntry(entry.id, "title", e.target.value)}
                          />
                        </AdminField>

                        <AdminField
                          label={`${t("cms.airport.chapterBody")} (${t(editLang === "en" ? "a2.english" : "a2.arabic")})`}
                          htmlFor={`past-ch-${entry.id}-body-${editLang}`}
                          className="lg:col-span-3"
                        >
                          <Textarea
                            id={`past-ch-${entry.id}-body-${editLang}`}
                            rows={3}
                            dir={editLang === "ar" ? "rtl" : "ltr"}
                            value={entry.body[editLang]}
                            readOnly={!mayEdit || !pastCms.ready}
                            aria-invalid={Boolean(pastCms.errors[`past-ch-${entry.id}-body-${editLang}`])}
                            onChange={(e) => updatePastTimelineEntry(entry.id, "body", e.target.value)}
                          />
                        </AdminField>

                        <p className="text-xs text-muted-foreground">{t("cms.airport.evidence")}: {t(`cms.evidence.${entry.evidence}`)}</p>

                        <div className="lg:col-span-2 space-y-1">
                          <label className="text-xs font-semibold text-foreground">
                            {t("cms.airport.sources")}
                          </label>
                          <SourceSelector
                            sourceRefs={entry.sourceRefs}
                            onChange={(refs) => updatePastSourceRefs(entry.id, refs)}
                            readOnly={!mayEdit || !pastCms.ready}
                            errorKey={pastCms.errors[`past-ch-${entry.id}-sourceRefs`]}
                            fieldId={`past-ch-${entry.id}-sourceRefs`}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </fieldset>
            </CmsValidationFields>
          )}

          {/* ------------------------------------------------------------------ */}
          {/* TAB: PRESENT                                                       */}
          {/* ------------------------------------------------------------------ */}
          {tab === "present" && (
            <CmsValidationFields errors={presentCms.errors}>
              {presentCms.saveError && <p role="alert" className="text-sm text-destructive">
                <span>{presentCms.saveError}</span>
                <button type="button" className={btnClass("ghost", "sm")} onClick={() => { void presentCms.retryRead(); }}>{t("cms.retry")}</button>
              </p>}
            <fieldset className="space-y-6 min-w-0" disabled={!mayEdit || !presentCms.ready || presentCms.saving}>
              <CmsDraftBar
                mayEdit={mayEdit}
                draftReady={presentCms.ready}
                unavailable={Boolean(presentCms.saveError)}
                dirty={presentCms.dirty}
                savedDraft={presentCms.savedDraft}
                saving={presentCms.saving}
                previewUrlEn="/airport/present?contentPreview=1"
                previewUrlAr="/ar/airport/present?contentPreview=1"
                onSave={handleSavePresent}
                onDiscard={() => setDiscardDialogOpen(true)}
              />

              {presentCms.conflict && (
                <CmsConflictBanner
                  onReload={() => setReloadConflictOpen(true)}
                  onDismiss={presentCms.dismissConflict}
                />
              )}

              {/* SEO */}
              <CmsSeoFields
                seo={presentCms.draft.seo}
                editLang={editLang}
                mayEdit={mayEdit}
                ready={presentCms.ready}
                errors={presentCms.errors}
                onChange={(seo) => presentCms.setDraft((cur) => ({ ...cur, seo }))}
              />

              {/* Intro */}
              <section className="rounded-md border border-border p-4 space-y-4 bg-surface">
                <h2 className="text-sm font-bold text-foreground">
                  {t("cms.airport.introHeading")}
                </h2>
                <div className="grid gap-3 lg:grid-cols-2">
                  <AdminField
                    label={`${t("a2.title")} (${t(editLang === "en" ? "a2.english" : "a2.arabic")})`}
                    htmlFor={`pr-intro-title-${editLang}`}
                  >
                    <Input
                      id={`pr-intro-title-${editLang}`}
                      dir={editLang === "ar" ? "rtl" : "ltr"}
                      value={presentCms.draft.intro.title[editLang]}
                      readOnly={!mayEdit || !presentCms.ready}
                      aria-invalid={Boolean(presentCms.errors[`pr-intro-title-${editLang}`])}
                      onChange={(e) => updatePresentIntro("title", e.target.value)}
                    />
                  </AdminField>

                  <AdminField
                    label={`${t("cms.copy.sub")} (${t(editLang === "en" ? "a2.english" : "a2.arabic")})`}
                    htmlFor={`pr-intro-sub-${editLang}`}
                  >
                    <Input
                      id={`pr-intro-sub-${editLang}`}
                      dir={editLang === "ar" ? "rtl" : "ltr"}
                      value={presentCms.draft.intro.subtitle[editLang]}
                      readOnly={!mayEdit || !presentCms.ready}
                      aria-invalid={Boolean(presentCms.errors[`pr-intro-sub-${editLang}`])}
                      onChange={(e) => updatePresentIntro("subtitle", e.target.value)}
                    />
                  </AdminField>

                  <AdminField
                    label={`${t("cms.airport.futureNoticeLabel")} (${t(editLang === "en" ? "a2.english" : "a2.arabic")})`}
                    htmlFor={`pr-intro-notice-${editLang}`}
                    className="lg:col-span-2"
                  >
                    <Textarea
                      id={`pr-intro-notice-${editLang}`}
                      rows={2}
                      dir={editLang === "ar" ? "rtl" : "ltr"}
                      value={presentCms.draft.intro.notice[editLang]}
                      readOnly={!mayEdit || !presentCms.ready}
                      aria-invalid={Boolean(presentCms.errors[`pr-intro-notice-${editLang}`])}
                      onChange={(e) => updatePresentIntro("notice", e.target.value)}
                    />
                  </AdminField>
                </div>
              </section>

              {/* Four Facts */}
              <section className="rounded-md border border-border p-4 space-y-4 bg-surface">
                <h2 className="text-sm font-bold text-foreground">
                  {t("cms.airport.presentFacts")}
                </h2>
                <ul className="space-y-4">
                  {presentCms.draft.facts.map((fact) => (
                    <li
                      key={fact.id}
                      id={`pr-fact-${fact.id}`}
                      className="rounded border border-border p-3 space-y-3 bg-card"
                    >
                      <div className="flex items-center justify-between border-b border-border pb-1">
                        <Ltr className="font-mono text-xs font-bold text-muted-foreground">{fact.id}</Ltr>
                        <span className="text-xs font-semibold">{pick(lang, fact.label)}</span>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-3">
                        <AdminField label={`${t("cms.airport.factLabel")} (${t(editLang === "en" ? "a2.english" : "a2.arabic")})`} htmlFor={`pr-fact-${fact.id}-label-${editLang}`}>
                          <Input
                            id={`pr-fact-${fact.id}-label-${editLang}`}
                            dir={editLang === "ar" ? "rtl" : "ltr"}
                            value={fact.label[editLang]}
                            readOnly={!mayEdit || !presentCms.ready}
                            aria-invalid={Boolean(presentCms.errors[`pr-fact-${fact.id}-label-${editLang}`])}
                            onChange={(e) => updatePresentFact(fact.id, "label", e.target.value)}
                          />
                        </AdminField>

                        <AdminField label={`${t("cms.airport.factValue")} (${t(editLang === "en" ? "a2.english" : "a2.arabic")})`} htmlFor={`pr-fact-${fact.id}-val-${editLang}`}>
                          <Input
                            id={`pr-fact-${fact.id}-val-${editLang}`}
                            dir={editLang === "ar" ? "rtl" : "ltr"}
                            value={fact.value[editLang]}
                            readOnly={!mayEdit || !presentCms.ready}
                            aria-invalid={Boolean(presentCms.errors[`pr-fact-${fact.id}-val-${editLang}`])}
                            onChange={(e) => updatePresentFact(fact.id, "value", e.target.value)}
                          />
                        </AdminField>

                        <AdminField label={`${t("cms.airport.factDetail")} (${t(editLang === "en" ? "a2.english" : "a2.arabic")})`} htmlFor={`pr-fact-${fact.id}-detail-${editLang}`}>
                          <Input
                            id={`pr-fact-${fact.id}-detail-${editLang}`}
                            dir={editLang === "ar" ? "rtl" : "ltr"}
                            value={fact.detail[editLang]}
                            readOnly={!mayEdit || !presentCms.ready}
                            aria-invalid={Boolean(presentCms.errors[`pr-fact-${fact.id}-detail-${editLang}`])}
                            onChange={(e) => updatePresentFact(fact.id, "detail", e.target.value)}
                          />
                        </AdminField>

                        <div className="lg:col-span-3 space-y-1">
                          <label className="text-xs font-semibold text-foreground">
                            {t("cms.airport.sources")}
                          </label>
                          <SourceSelector
                            sourceRefs={fact.sourceRefs}
                            onChange={(refs) => updatePresentFactSources(fact.id, refs)}
                            readOnly={!mayEdit || !presentCms.ready}
                            errorKey={presentCms.errors[`pr-fact-${fact.id}-sourceRefs`]}
                            fieldId={`pr-fact-${fact.id}-sourceRefs`}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Three Dossiers */}
              <section className="rounded-md border border-border p-4 space-y-4 bg-surface">
                <h2 className="text-sm font-bold text-foreground">
                  {t("cms.airport.presentDossiers")}
                </h2>
                <ul className="space-y-4">
                  {presentCms.draft.dossiers.map((dossier) => (
                    <li
                      key={dossier.id}
                      id={`pr-dossier-${dossier.id}`}
                      className="rounded border border-border p-3 space-y-3 bg-card"
                    >
                      <div className="flex items-center justify-between border-b border-border pb-1">
                        <Ltr className="font-mono text-xs font-bold text-muted-foreground">{dossier.id}</Ltr>
                        <span className="text-xs font-semibold">{pick(lang, dossier.title)}</span>
                      </div>
                      <div className="space-y-3">
                        <AdminField label={`${t("cms.airport.dossierTitle")} (${t(editLang === "en" ? "a2.english" : "a2.arabic")})`} htmlFor={`pr-dossier-${dossier.id}-title-${editLang}`}>
                          <Input
                            id={`pr-dossier-${dossier.id}-title-${editLang}`}
                            dir={editLang === "ar" ? "rtl" : "ltr"}
                            value={dossier.title[editLang]}
                            readOnly={!mayEdit || !presentCms.ready}
                            aria-invalid={Boolean(presentCms.errors[`pr-dossier-${dossier.id}-title-${editLang}`])}
                            onChange={(e) => updatePresentDossierTitle(dossier.id, e.target.value)}
                          />
                        </AdminField>

                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-foreground">
                            {t("cms.airport.paragraphs")}
                          </label>
                          {dossier.paragraphs.map((p, pIdx) => (
                            <div key={pIdx} className="flex gap-2 items-start">
                              <AdminField className="min-w-0 flex-1" label={`${t("cms.airport.paragraphs")} ${pIdx + 1}`} htmlFor={`pr-dossier-${dossier.id}-p-${pIdx}-${editLang}`}>
                              <Textarea
                                id={`pr-dossier-${dossier.id}-p-${pIdx}-${editLang}`}
                                rows={2}
                                dir={editLang === "ar" ? "rtl" : "ltr"}
                                value={p[editLang]}
                                readOnly={!mayEdit || !presentCms.ready}
                                aria-invalid={Boolean(presentCms.errors[`pr-dossier-${dossier.id}-p-${pIdx}-${editLang}`])}
                                className="flex-1"
                                onChange={(e) => updatePresentDossierParagraph(dossier.id, pIdx, e.target.value)}
                              />
                              </AdminField>
                              {mayEdit && dossier.paragraphs.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => deletePresentDossierParagraph(dossier.id, pIdx)}
                                  aria-label={t("cms.airport.deleteParagraph")}
                                  className={btnClass("ghost", "sm", "text-destructive")}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          ))}
                          {mayEdit && (
                            <button
                              type="button"
                              onClick={() => addPresentDossierParagraph(dossier.id)}
                              className={btnClass("outline", "sm", "gap-1")}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              {t("cms.airport.addParagraph")}
                            </button>
                          )}
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-foreground">
                            {t("cms.airport.sources")}
                          </label>
                          <SourceSelector
                            sourceRefs={dossier.sourceRefs}
                            onChange={(refs) => updatePresentDossierSources(dossier.id, refs)}
                            readOnly={!mayEdit || !presentCms.ready}
                            errorKey={presentCms.errors[`pr-dossier-${dossier.id}-sourceRefs`]}
                            fieldId={`pr-dossier-${dossier.id}-sourceRefs`}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Spatial Documentation */}
              <section className="rounded-md border border-border p-4 space-y-4 bg-surface">
                <h2 className="text-sm font-bold text-foreground">
                  {t("cms.airport.spatial")}
                </h2>
                <div className="grid gap-3 lg:grid-cols-2">
                  <AdminField label={`${t("a2.title")} (${t(editLang === "en" ? "a2.english" : "a2.arabic")})`} htmlFor={`pr-spatial-title-${editLang}`}>
                    <Input
                      id={`pr-spatial-title-${editLang}`}
                      dir={editLang === "ar" ? "rtl" : "ltr"}
                      value={presentCms.draft.spatial.title[editLang]}
                      readOnly={!mayEdit || !presentCms.ready}
                      onChange={(e) => updatePresentSpatial("title", e.target.value)}
                    />
                  </AdminField>

                  <AdminField label={`${t("cms.airport.evidentiaryRule")} (${t(editLang === "en" ? "a2.english" : "a2.arabic")})`} htmlFor={`pr-spatial-rule-title-${editLang}`}>
                    <Input
                      id={`pr-spatial-rule-title-${editLang}`}
                      dir={editLang === "ar" ? "rtl" : "ltr"}
                      value={presentCms.draft.spatial.evidentiaryRuleTitle[editLang]}
                      readOnly={!mayEdit || !presentCms.ready}
                      onChange={(e) => updatePresentSpatial("evidentiaryRuleTitle", e.target.value)}
                    />
                  </AdminField>

                  <AdminField label={`${t("cms.copy.sub")} (${t(editLang === "en" ? "a2.english" : "a2.arabic")})`} htmlFor={`pr-spatial-desc-${editLang}`} className="lg:col-span-2">
                    <Textarea
                      id={`pr-spatial-desc-${editLang}`}
                      rows={2}
                      dir={editLang === "ar" ? "rtl" : "ltr"}
                      value={presentCms.draft.spatial.description[editLang]}
                      readOnly={!mayEdit || !presentCms.ready}
                      onChange={(e) => updatePresentSpatial("description", e.target.value)}
                    />
                  </AdminField>

                  <AdminField label={`${t("cms.airport.evidentiaryRuleBody")} (${t(editLang === "en" ? "a2.english" : "a2.arabic")})`} htmlFor={`pr-spatial-rule-body-${editLang}`} className="lg:col-span-2">
                    <Textarea
                      id={`pr-spatial-rule-body-${editLang}`}
                      rows={2}
                      dir={editLang === "ar" ? "rtl" : "ltr"}
                      value={presentCms.draft.spatial.evidentiaryRuleBody[editLang]}
                      readOnly={!mayEdit || !presentCms.ready}
                      onChange={(e) => updatePresentSpatial("evidentiaryRuleBody", e.target.value)}
                    />
                  </AdminField>

                  <div className="lg:col-span-2 space-y-1">
                    <label className="text-xs font-semibold text-foreground">
                      {t("cms.airport.sources")}
                    </label>
                    <SourceSelector
                      sourceRefs={presentCms.draft.spatial.sourceRefs}
                      onChange={updatePresentSpatialSources}
                      readOnly={!mayEdit || !presentCms.ready}
                      errorKey={presentCms.errors["pr-spatial-sourceRefs"]}
                      fieldId="pr-spatial-sourceRefs"
                    />
                  </div>
                </div>
              </section>

              {/* Global Horizons */}
              <section className="rounded-md border border-border p-4 space-y-4 bg-surface">
                <h2 className="text-sm font-bold text-foreground">
                  {t("cms.airport.globalHorizons")}
                </h2>
                <div className="grid gap-3 lg:grid-cols-2">
                  <AdminField label={`${t("cms.airport.eyebrow")} (${t(editLang === "en" ? "a2.english" : "a2.arabic")})`} htmlFor={`pr-gh-eyebrow-${editLang}`}>
                    <Input
                      id={`pr-gh-eyebrow-${editLang}`}
                      dir={editLang === "ar" ? "rtl" : "ltr"}
                      value={presentCms.draft.globalHorizons.eyebrow[editLang]}
                      readOnly={!mayEdit || !presentCms.ready}
                      onChange={(e) => updatePresentGlobalHorizons("eyebrow", e.target.value)}
                    />
                  </AdminField>

                  <AdminField label={`${t("a2.title")} (${t(editLang === "en" ? "a2.english" : "a2.arabic")})`} htmlFor={`pr-gh-title-${editLang}`}>
                    <Input
                      id={`pr-gh-title-${editLang}`}
                      dir={editLang === "ar" ? "rtl" : "ltr"}
                      value={presentCms.draft.globalHorizons.title[editLang]}
                      readOnly={!mayEdit || !presentCms.ready}
                      onChange={(e) => updatePresentGlobalHorizons("title", e.target.value)}
                    />
                  </AdminField>

                  <AdminField label={`${t("cms.copy.sub")} (${t(editLang === "en" ? "a2.english" : "a2.arabic")})`} htmlFor={`pr-gh-desc-${editLang}`} className="lg:col-span-2">
                    <Textarea
                      id={`pr-gh-desc-${editLang}`}
                      rows={2}
                      dir={editLang === "ar" ? "rtl" : "ltr"}
                      value={presentCms.draft.globalHorizons.description[editLang]}
                      readOnly={!mayEdit || !presentCms.ready}
                      onChange={(e) => updatePresentGlobalHorizons("description", e.target.value)}
                    />
                  </AdminField>
                </div>
              </section>
            </fieldset>
            </CmsValidationFields>
          )}

          {/* ------------------------------------------------------------------ */}
          {/* TAB: FUTURE                                                        */}
          {/* ------------------------------------------------------------------ */}
          {tab === "future" && (
            <CmsValidationFields errors={futureCms.errors}>
              {futureCms.saveError && <p role="alert" className="text-sm text-destructive">
                <span>{futureCms.saveError}</span>
                <button type="button" className={btnClass("ghost", "sm")} onClick={() => { void futureCms.retryRead(); }}>{t("cms.retry")}</button>
              </p>}
            <fieldset className="space-y-6 min-w-0" disabled={!mayEdit || !futureCms.ready || futureCms.saving}>
              <CmsDraftBar
                mayEdit={mayEdit}
                draftReady={futureCms.ready}
                unavailable={Boolean(futureCms.saveError)}
                dirty={futureCms.dirty}
                savedDraft={futureCms.savedDraft}
                saving={futureCms.saving}
                previewUrlEn="/airport/future?contentPreview=1"
                previewUrlAr="/ar/airport/future?contentPreview=1"
                onSave={handleSaveFuture}
                onDiscard={() => setDiscardDialogOpen(true)}
              />

              {futureCms.conflict && (
                <CmsConflictBanner
                  onReload={() => setReloadConflictOpen(true)}
                  onDismiss={futureCms.dismissConflict}
                />
              )}

              {/* Mandatory Illustrative Notice */}
              <div className="rounded-md border border-border bg-sand p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">
                  {t("cms.airport.futureNotice")}
                </p>
                <p>{t("a2.ap.fu.placeholder")}</p>
              </div>

              {/* SEO */}
              <CmsSeoFields
                seo={futureCms.draft.seo}
                editLang={editLang}
                mayEdit={mayEdit}
                ready={futureCms.ready}
                errors={futureCms.errors}
                onChange={(seo) => futureCms.setDraft((cur) => ({ ...cur, seo }))}
              />

              {/* Thematic Vision Sections */}
              {FUTURE_SECTIONS.map((sec) => (
                <section
                  key={sec.groupId}
                  className="rounded-md border border-border p-4 space-y-4 bg-surface"
                >
                  <h2 className="text-sm font-bold text-foreground">
                    {sec.groupLabel}
                  </h2>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {sec.keys.map(({ key, labelKey, isTextarea }) => {
                      const val = futureCms.draft.copy[key]?.[editLang] ?? "";
                      const errKey = futureCms.errors[`future-copy-${key}-${editLang}`];
                      return (
                        <AdminField
                          key={key}
                          label={`${t(labelKey)} (${t(editLang === "en" ? "a2.english" : "a2.arabic")})`}
                          htmlFor={`future-copy-${key}-${editLang}`}
                          className={isTextarea ? "lg:col-span-2" : ""}
                        >
                          {isTextarea ? (
                            <Textarea
                              id={`future-copy-${key}-${editLang}`}
                              rows={2}
                              dir={editLang === "ar" ? "rtl" : "ltr"}
                              value={val}
                              readOnly={!mayEdit || !futureCms.ready}
                              aria-invalid={Boolean(errKey)}
                              aria-describedby={errKey ? `future-copy-${key}-${editLang}-err` : undefined}
                              onChange={(e) => updateFutureCopy(key, e.target.value)}
                            />
                          ) : (
                            <Input
                              id={`future-copy-${key}-${editLang}`}
                              dir={editLang === "ar" ? "rtl" : "ltr"}
                              value={val}
                              readOnly={!mayEdit || !futureCms.ready}
                              aria-invalid={Boolean(errKey)}
                              aria-describedby={errKey ? `future-copy-${key}-${editLang}-err` : undefined}
                              onChange={(e) => updateFutureCopy(key, e.target.value)}
                            />
                          )}
                          {errKey && (
                            <p id={`future-copy-${key}-${editLang}-err`} role="alert" className="mt-1 text-xs text-destructive">
                              {t(errKey)}
                            </p>
                          )}
                        </AdminField>
                      );
                    })}
                  </div>
                </section>
              ))}
            </fieldset>
            </CmsValidationFields>
          )}

          {/* ------------------------------------------------------------------ */}
          {/* TAB: ARCHIVE (Phase 7B Canonical Catalog)                           */}
          {/* ------------------------------------------------------------------ */}
          {/* ------------------------------------------------------------------ */}
          {/* TAB: ARCHIVE (Phase 7B Canonical Catalog)                           */}
          {/* ------------------------------------------------------------------ */}
          {tab === "archive" && (
            <>
              {draftStorageError && (
                <div
                  role="alert"
                  className="mb-4 flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-foreground sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-foreground">{t("error.title")}</h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">{t("archive.edit.storageError")}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void draftSnapshotQuery.refetch()}
                    className={btnClass("secondary", "sm")}
                  >
                    <RefreshCw aria-hidden="true" className="me-1.5 size-3.5" />
                    <span>{t("archive.action.retry")}</span>
                  </button>
                </div>
              )}

              <ArchiveCatalog
                records={effectiveRecords}
                compiledRecords={intakeRecords}
                sources={effectiveSources}
                draftRecordIds={draftRecordIds}
                canEdit={canEditArchive}
                onOpenRecord={(id) => {
                  const match = effectiveRecords.find((r) => r.id === id);
                  if (match) {
                    setEditingRecord(null);
                    setSelectedArchiveRecord(match);
                  }
                }}
                onEditRecord={canEditArchive ? (id) => {
                  const match = effectiveRecords.find((r) => r.id === id);
                  if (match) {
                    setSelectedArchiveRecord(null);
                    setEditingRecord(match);
                  }
                } : undefined}
              />
            </>
          )}

          {/* ------------------------------------------------------------------ */}
          {/* TAB: SOURCES (Phase 7B Canonical Registry)                          */}
          {/* ------------------------------------------------------------------ */}
          {tab === "sources" && (
            <>
              {draftStorageError && (
                <div
                  role="alert"
                  className="mb-4 flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-foreground sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-foreground">{t("error.title")}</h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">{t("archive.edit.storageError")}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void draftSnapshotQuery.refetch()}
                    className={btnClass("secondary", "sm")}
                  >
                    <RefreshCw aria-hidden="true" className="me-1.5 size-3.5" />
                    <span>{t("archive.action.retry")}</span>
                  </button>
                </div>
              )}

              <SourceCatalog
                sources={effectiveSources}
                archiveRecords={effectiveRecords}
                draftSourceIds={draftSourceIds}
                canEdit={canEditArchive}
                onOpenSource={(id) => {
                  const match = effectiveSources.find((s) => s.id === id);
                  if (match) {
                    setEditingSource(null);
                    setSelectedSourceRecord(match);
                  }
                }}
                onEditSource={canEditArchive ? (id) => {
                  const match = effectiveSources.find((s) => s.id === id);
                  if (match) {
                    setSelectedSourceRecord(null);
                    setEditingSource({ source: match, isNew: false });
                  }
                } : undefined}
                onNewSource={canEditArchive ? () => {
                  setSelectedSourceRecord(null);
                  setEditingSource({ source: null, isNew: true });
                } : undefined}
              />
            </>
          )}

          {/* ------------------------------------------------------------------ */}
          {/* TAB: MEDIA (Phase 7B Media & Variant Inspection)                    */}
          {/* ------------------------------------------------------------------ */}
          {tab === "media" && (
            <MediaCatalog
              records={intakeRecords}
              onOpenMediaRecord={(id) => {
                const match = intakeRecords.find((r) => r.id === id);
                if (match) setSelectedMediaRecord(match);
              }}
            />
          )}
        </div>
        </AdminTabs>
      </AdminPanel>

      <ConfirmDialog open={navigationBlocker.status === "blocked"} title={t("cms.unsaved.title")}
        body={t("cms.unsaved.desc")} confirmLabel={t("cms.unsaved.leave")} cancelLabel={t("a2.cancel")}
        onConfirm={() => { if (!busy) navigationBlocker.proceed?.(); }} onClose={() => navigationBlocker.reset?.()} />
      <ConfirmDialog open={reloadConflictOpen} title={t("cms.conflict.confirmTitle")}
        body={t("cms.conflict.confirmDesc")} confirmLabel={t("cms.conflict.reload")} cancelLabel={t("a2.cancel")}
        onConfirm={() => { if (!busy) { const cms = tab === "past" ? pastCms : tab === "present" ? presentCms : futureCms; void cms.reloadRemote(); setReloadConflictOpen(false); } }}
        onClose={() => setReloadConflictOpen(false)} />
      {/* Discard Draft Modal */}
      <ConfirmDialog
        open={discardDialogOpen}
        title={t("cms.discard.title")}
        body={t("cms.discard.desc")}
        confirmLabel={t("cms.discard.confirm")}
        cancelLabel={t("a2.cancel")}
        onConfirm={() => {
          if (tab === "past") void handleDiscardPast();
          else if (tab === "present") void handleDiscardPresent();
          else if (tab === "future") void handleDiscardFuture();
        }}
        onClose={() => setDiscardDialogOpen(false)}
      />

      {/* Dirty Tab Switching Modal */}
      <ConfirmDialog
        open={Boolean(pendingTab)}
        title={t("cms.unsaved.title")}
        body={t("cms.unsaved.desc")}
        confirmLabel={t("cms.unsaved.discardAndLeave")}
        cancelLabel={t("a2.cancel")}
        onConfirm={handleConfirmTabSwitch}
        onClose={handleCancelTabSwitch}
      />

      {/* Canonical Archive Record Inspection Sheet */}
      <ArchiveRecordSheet
        record={effectiveRecords.find((r) => r.id === selectedArchiveRecord?.id) ?? null}
        sources={effectiveSources}
        draftSourceIds={draftSourceIds}
        isDraft={selectedArchiveRecord ? draftRecordIds.includes(selectedArchiveRecord.id) : false}
        canEdit={canEditArchive}
        onClose={() => setSelectedArchiveRecord(null)}
        onEdit={(id) => {
          const match = effectiveRecords.find((r) => r.id === id);
          if (match) {
            setSelectedArchiveRecord(null);
            setEditingRecord(match);
          }
        }}
        onOpenDuplicateTarget={(targetId) => {
          const target = effectiveRecords.find((r) => r.id === targetId);
          if (target) setSelectedArchiveRecord(target);
        }}
      />

      {/* Canonical Source Record Inspection Sheet */}
      <SourceRecordSheet
        source={effectiveSources.find((s) => s.id === selectedSourceRecord?.id) ?? null}
        archiveRecords={effectiveRecords}
        draftRecordIds={draftRecordIds}
        isDraft={selectedSourceRecord ? draftSourceIds.includes(selectedSourceRecord.id) : false}
        canEdit={canEditArchive}
        onClose={() => setSelectedSourceRecord(null)}
        onEdit={(id) => {
          const match = effectiveSources.find((s) => s.id === id);
          if (match) {
            setSelectedSourceRecord(null);
            setEditingSource({ source: match, isNew: false });
          }
        }}
        onOpenArchiveRecord={(recordId) => {
          const match = effectiveRecords.find((r) => r.id === recordId);
          if (match) {
            void navigate({search: {tab: "archive", item: recordId}});
          }
        }}
      />

      {/* Archive Record Editor Sheet */}
      <ArchiveRecordEditorSheet
        record={effectiveRecords.find((r) => r.id === editingRecord?.id) ?? editingRecord}
        savedDraft={editingRecord ? (recordDrafts?.[editingRecord.id] ?? null) : null}
        effectiveSources={effectiveSources}
        effectiveRecords={effectiveRecords}
        draftSourceIds={draftSourceIds}
        open={Boolean(editingRecord)}
        onClose={() => {
          setEditingRecord(null);
          setRecordEditorDirty(false);
        }}
        onDirtyChange={setRecordEditorDirty}
        onSaved={() => {
          void draftSnapshotQuery.refetch();
        }}
        onDiscarded={() => {
          void draftSnapshotQuery.refetch();
        }}
      />

      {/* Source Record Editor Sheet */}
      <SourceRecordEditorSheet
        source={effectiveSources.find((s) => s.id === editingSource?.source?.id) ?? editingSource?.source ?? null}
        savedDraft={editingSource?.source ? (sourceDrafts?.[editingSource.source.id] ?? null) : null}
        open={Boolean(editingSource)}
        onClose={() => {
          setEditingSource(null);
          setSourceEditorDirty(false);
        }}
        onDirtyChange={setSourceEditorDirty}
        onSaved={() => {
          void draftSnapshotQuery.refetch();
        }}
        onDiscarded={() => {
          void draftSnapshotQuery.refetch();
        }}
      />

      {/* Media & Variant Inspection Sheet */}
      <MediaVariantSheet
        record={selectedMediaRecord}
        onClose={() => setSelectedMediaRecord(null)}
      />
    </div>
  );
}
