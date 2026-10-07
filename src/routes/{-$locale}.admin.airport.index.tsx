import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
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
import { SOURCE_REGISTRY } from "@/lib/archive/sources";
import type {
  FutureCopyKey,
} from "@/content/types";
import {
  archiveItems,
  mediaItems,
  sourceRecords,
  type ArchiveItem,
  type MediaItem,
  type SourceRecord,
  type Verification,
} from "@/lib/admin-mock";

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

const verifTone = (v: Verification) =>
  v === "verified" ? "brand" : v === "pending" ? "warn" : "danger";

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
  const { t, lang } = useI18n();
  const search = Route.useSearch();
  const { can, toast } = useAdmin();

  const [tab, setTab] = useState<Tab>(() => search.tab ?? "past");
  const [editLang, setEditLang] = useState<Lang>("en");
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [reloadConflictOpen, setReloadConflictOpen] = useState(false);

  // Read-only reference inspection states (Phase 7B)
  const [item, setItem] = useState<ArchiveItem | null>(null);
  const [source, setSource] = useState<SourceRecord | null>(null);
  const [media, setMedia] = useState<MediaItem | null>(null);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [era, setEra] = useState("all");
  const [category, setCategory] = useState("all");
  const [state, setState] = useState("all");
  const [mediaKind, setMediaKind] = useState("all");

  const mayEdit = can("content.edit");

  // Synchronize search params tab if provided
  useEffect(() => {
    setTab(search.tab ?? "past");
  }, [search.tab]);

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
    return false;
  };

  const currentIsDirty = isTabDirty(tab);

  const busy = pastCms.saving || presentCms.saving || futureCms.saving;
  const anyDirty = pastCms.dirty || presentCms.dirty || futureCms.dirty;
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
      setTab(nextTab);
    }
  };

  const handleConfirmTabSwitch = () => {
    if (!pendingTab || busy) return;
    if (tab === "past") pastCms.resetLocalEdits();
    if (tab === "present") presentCms.resetLocalEdits();
    if (tab === "future") futureCms.resetLocalEdits();
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

  // Filtered rows for read-only archive reference tabs
  const archiveRows = useMemo(
    () =>
      archiveItems.filter((a) => {
        if (era !== "all" && a.era !== era) return false;
        if (category !== "all" && a.category !== category) return false;
        if (state === "missing" && a.source) return false;
        if (state !== "all" && state !== "missing" && a.state !== state) return false;
        return true;
      }),
    [era, category, state],
  );

  const mediaRows = useMemo(
    () =>
      mediaItems.filter((m) =>
        mediaKind === "all"
          ? true
          : mediaKind === "unused"
          ? m.usedIn.length === 0
          : m.kind === mediaKind,
      ),
    [mediaKind],
  );

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
            { id: "archive", label: t("a2.ap.tab.archive"), count: archiveItems.length },
            { id: "sources", label: t("a2.ap.tab.sources"), count: sourceRecords.length },
            { id: "media", label: t("a2.ap.tab.media"), count: mediaItems.length },
          ]}
        />

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
          {/* TAB: ARCHIVE (Phase 7B Read-Only Reference)                         */}
          {/* ------------------------------------------------------------------ */}
          {tab === "archive" && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-sand p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">
                  {t("cms.airport.archiveDisclosure")}
                </p>
              </div>

              <Toolbar>
                <Select aria-label={t("a2.ap.ar.era")} value={era} onChange={(e) => setEra(e.target.value)} className="w-auto">
                  <option value="all">{t("a2.all")}</option>
                  {(["past", "present", "future"] as const).map((v) => (
                    <option key={v} value={v}>{t(`a2.ap.era.${v}`)}</option>
                  ))}
                </Select>
                <Select aria-label={t("a2.ap.ar.category")} value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto">
                  <option value="all">{t("a2.all")}</option>
                  {(["photograph", "document", "architecture", "concept"] as const).map((v) => (
                    <option key={v} value={v}>{t(`a2.ap.cat.${v}`)}</option>
                  ))}
                </Select>
                <Select aria-label={t("a2.status")} value={state} onChange={(e) => setState(e.target.value)} className="w-auto">
                  <option value="all">{t("a2.all")}</option>
                  <option value="draft">{t("adm.state.draft")}</option>
                  <option value="published">{t("adm.state.published")}</option>
                  <option value="missing">{t("a2.ap.ar.missingSource")}</option>
                </Select>
                <div className="flex gap-1">
                  {(["grid", "table"] as const).map((v) => (
                    <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={btnClass(view === v ? "secondary" : "ghost", "sm")}>
                      {t(`a2.${v}`)}
                    </button>
                  ))}
                </div>
              </Toolbar>

              {archiveRows.length === 0 ? (
                <AdminEmpty title={t("a2.ap.tab.archive")} body={t("a2.mock")} />
              ) : view === "grid" ? (
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {archiveRows.map((a) => (
                    <li key={a.id} className="rounded-md border border-border p-3">
                      <div aria-hidden="true" className="mb-2 h-24 rounded bg-sand" />
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold">{pick(lang, a.title)}</h3>
                        <ContentStateChip state={a.state} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{pick(lang, a.caption)}</p>
                      <button type="button" className={btnClass("outline", "sm", "mt-2")} onClick={() => setItem(a)}>
                        {t("a2.inspect")}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="overflow-x-auto">
                  <GazaTable className="w-full text-sm">
                    <GazaTableCaption className="sr-only">{t("a2.ap.tab.archive")}</GazaTableCaption>
                    <GazaTableHeader>
                      <GazaTableRow className="border-b border-border type-th">
                        {[t("a2.title"), t("a2.ap.ar.era"), t("a2.ap.ar.category"), t("a2.date"), t("a2.ap.ar.source"), t("a2.status")].map((h) => (
                          <GazaTableHead key={h} scope="col" className="px-3 py-2 text-start font-bold">{h}</GazaTableHead>
                        ))}
                      </GazaTableRow>
                    </GazaTableHeader>
                    <GazaTableBody>
                      {archiveRows.map((a) => (
                        <GazaTableRow key={a.id} className="border-b border-border last:border-0">
                          <GazaTableCell className="px-3 py-2">
                            <button type="button" className="font-semibold underline decoration-dotted" onClick={() => setItem(a)}>
                              {pick(lang, a.title)}
                            </button>
                          </GazaTableCell>
                          <GazaTableCell className="px-3 py-2">{t(`a2.ap.era.${a.era}`)}</GazaTableCell>
                          <GazaTableCell className="px-3 py-2">{t(`a2.ap.cat.${a.category}`)}</GazaTableCell>
                          <GazaTableCell className="px-3 py-2"><Ltr>{a.date}</Ltr></GazaTableCell>
                          <GazaTableCell className="px-3 py-2">{a.source ? <Ltr>{a.source}</Ltr> : <AdminChip tone="danger">{t("a2.ap.ar.missingSource")}</AdminChip>}</GazaTableCell>
                          <GazaTableCell className="px-3 py-2"><ContentStateChip state={a.state} /></GazaTableCell>
                        </GazaTableRow>
                      ))}
                    </GazaTableBody>
                  </GazaTable>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------------ */}
          {/* TAB: SOURCES (Phase 7B Read-Only Reference)                         */}
          {/* ------------------------------------------------------------------ */}
          {tab === "sources" && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-sand p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">
                  {t("cms.airport.sourcesDisclosure")}
                </p>
              </div>

              <div className="overflow-x-auto">
                <GazaTable className="w-full text-sm">
                  <GazaTableCaption className="sr-only">{t("a2.ap.tab.sources")}</GazaTableCaption>
                  <GazaTableHeader>
                    <GazaTableRow className="border-b border-border type-th">
                      {[t("a2.title"), t("a2.ap.src.type"), t("a2.ap.src.org"), t("a2.date"), t("a2.status"), t("a2.ap.src.usedBy")].map((h) => (
                        <GazaTableHead key={h} scope="col" className="px-3 py-2 text-start font-bold">{h}</GazaTableHead>
                      ))}
                    </GazaTableRow>
                  </GazaTableHeader>
                  <GazaTableBody>
                    {sourceRecords.map((s) => (
                      <GazaTableRow key={s.id} className="border-b border-border last:border-0">
                        <GazaTableCell className="px-3 py-2">
                          <button type="button" className="font-semibold underline decoration-dotted" onClick={() => setSource(s)}>
                            {pick(lang, s.title)}
                          </button>
                        </GazaTableCell>
                        <GazaTableCell className="px-3 py-2">{t(`a2.ap.src.t.${s.type}`)}</GazaTableCell>
                        <GazaTableCell className="px-3 py-2">{s.org}</GazaTableCell>
                        <GazaTableCell className="px-3 py-2"><Ltr>{s.date}</Ltr></GazaTableCell>
                        <GazaTableCell className="px-3 py-2"><AdminChip tone={verifTone(s.verification)}>{t(`a2.ap.ver.${s.verification}`)}</AdminChip></GazaTableCell>
                        <GazaTableCell className="px-3 py-2"><Ltr>{s.usedBy}</Ltr></GazaTableCell>
                      </GazaTableRow>
                    ))}
                  </GazaTableBody>
                </GazaTable>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------------ */}
          {/* TAB: MEDIA (Phase 7B Read-Only Reference)                           */}
          {/* ------------------------------------------------------------------ */}
          {tab === "media" && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-sand p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">
                  {t("cms.airport.mediaDisclosure")}
                </p>
              </div>

              <Toolbar>
                <Select aria-label={t("a2.status")} value={mediaKind} onChange={(e) => setMediaKind(e.target.value)} className="w-auto">
                  <option value="all">{t("a2.all")}</option>
                  <option value="image">{t("a2.ap.md.kind.image")}</option>
                  <option value="document">{t("a2.ap.md.kind.document")}</option>
                  <option value="video">{t("a2.ap.md.kind.video")}</option>
                  <option value="unused">{t("a2.ap.md.unused")}</option>
                </Select>
                <div className="flex gap-1">
                  {(["grid", "list"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={(v === "grid") === (view === "grid")}
                      onClick={() => setView(v === "grid" ? "grid" : "table")}
                      className={btnClass((v === "grid") === (view === "grid") ? "secondary" : "ghost", "sm")}
                    >
                      {t(`a2.${v}`)}
                    </button>
                  ))}
                </div>
              </Toolbar>

              {mediaRows.length === 0 ? (
                <AdminEmpty title={t("a2.ap.tab.media")} body={t("a2.mock")} />
              ) : view === "grid" ? (
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {mediaRows.map((m) => (
                    <li key={m.id} className="rounded-md border border-border p-3">
                      <div aria-hidden="true" className="mb-2 h-20 rounded bg-sand" />
                      <p className="text-sm font-semibold">{pick(lang, m.title)}</p>
                      <p className="text-xs text-muted-foreground"><Ltr>{m.filename}</Ltr></p>
                      <p className="text-xs text-muted-foreground"><Ltr>{m.meta}</Ltr></p>
                      {m.usedIn.length === 0 ? <AdminChip tone="warn" className="mt-1">{t("a2.ap.md.unused")}</AdminChip> : null}
                      <button type="button" className={btnClass("outline", "sm", "mt-2")} onClick={() => setMedia(m)}>
                        {t("a2.inspect")}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {mediaRows.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{pick(lang, m.title)}</p>
                        <p className="text-xs text-muted-foreground">
                          <Ltr>{`${m.filename} · ${m.meta} · ${m.uploaded}`}</Ltr>
                        </p>
                      </div>
                      <button type="button" className={btnClass("outline", "sm")} onClick={() => setMedia(m)}>
                        {t("a2.inspect")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
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

      {/* Read-Only Archive Record Inspection Sheet */}
      <GazaSheet
        open={Boolean(item)}
        onClose={() => setItem(null)}
        title={item ? pick(lang, item.title) : ""}
        description={item ? item.id : ""}
      >
        {item && (
          <div className="space-y-4">
            <p className="text-sm">{pick(lang, item.caption)}</p>
            <div className="rounded bg-sand p-3 text-xs space-y-1">
              <p><span className="font-semibold">{t("a2.ap.ar.era")}:</span> {t(`a2.ap.era.${item.era}`)}</p>
              <p><span className="font-semibold">{t("a2.ap.ar.category")}:</span> {t(`a2.ap.cat.${item.category}`)}</p>
              <p><span className="font-semibold">{t("a2.date")}:</span> <Ltr>{item.date}</Ltr></p>
              <p><span className="font-semibold">{t("a2.ap.ar.source")}:</span> <Ltr>{item.source ?? "—"}</Ltr></p>
            </div>
            <button type="button" className={btnClass("outline", "sm", "w-full")} onClick={() => setItem(null)}>
              {t("a2.close")}
            </button>
          </div>
        )}
      </GazaSheet>

      {/* Read-Only Source Record Inspection Sheet */}
      <GazaSheet
        open={Boolean(source)}
        onClose={() => setSource(null)}
        title={source ? pick(lang, source.title) : ""}
        description={source ? source.id : ""}
      >
        {source && (
          <div className="space-y-4">
            <div className="rounded bg-sand p-3 text-xs space-y-1">
              <p><span className="font-semibold">{t("a2.ap.src.type")}:</span> {t(`a2.ap.src.t.${source.type}`)}</p>
              <p><span className="font-semibold">{t("a2.ap.src.org")}:</span> {source.org}</p>
              <p><span className="font-semibold">{t("a2.date")}:</span> <Ltr>{source.date}</Ltr></p>
              <p><span className="font-semibold">{t("a2.status")}:</span> {t(`a2.ap.ver.${source.verification}`)}</p>
              <p><span className="font-semibold">{t("a2.ap.src.usedBy")}:</span> <Ltr>{source.usedBy}</Ltr></p>
            </div>
            <button type="button" className={btnClass("outline", "sm", "w-full")} onClick={() => setSource(null)}>
              {t("a2.close")}
            </button>
          </div>
        )}
      </GazaSheet>

      {/* Read-Only Media Inspection Sheet */}
      <GazaSheet
        open={Boolean(media)}
        onClose={() => setMedia(null)}
        title={media ? pick(lang, media.title) : ""}
        description={media ? media.id : ""}
      >
        {media && (
          <div className="space-y-4">
            <div className="rounded bg-sand p-3 text-xs space-y-1">
              <p><span className="font-semibold">{t("a2.ap.md.filename")}:</span> <Ltr>{media.filename}</Ltr></p>
              <p><span className="font-semibold">{t("a2.ap.md.dimensions")}:</span> <Ltr>{media.meta}</Ltr></p>
              <p><span className="font-semibold">{t("a2.ap.md.usedIn")}:</span> <Ltr>{media.usedIn.join(", ") || "—"}</Ltr></p>
            </div>
            <button type="button" className={btnClass("outline", "sm", "w-full")} onClick={() => setMedia(null)}>
              {t("a2.close")}
            </button>
          </div>
        )}
      </GazaSheet>
    </div>
  );
}
