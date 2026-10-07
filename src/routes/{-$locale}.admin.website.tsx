import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { Input, Select, Textarea, btnClass } from "@/components/kit";
import {
  AdminChip,
  AdminPageHeader,
  AdminPanel,
  AdminTabs,
  BilingualStatus,
  Ltr,
  PermissionButton,
} from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { CmsField as AdminField, CmsValidationFields } from "@/components/admin/cms/CmsField";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  CmsDraftBar,
  CmsConflictBanner,
  CmsSeoFields,
  CmsSectionList,
  useCmsDocument,
  validateHomeContent,
  validateTravelContent,
} from "@/components/admin/cms";
import { validateInformationPagesContent } from "@/components/admin/cms/cms-validation";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { publishedHome } from "@/content/published/home";
import { publishedTravel } from "@/content/published/travel";
import { publishedInformationPages } from "@/content/published/information-pages";
import { primaryNav, drawerNav, footerColumns } from "@/lib/site-navigation";
import type {
  HomeCopyKey,
  HomeSection,
  InformationalPageBlock,
  InformationalPageId,
  PageSeoContent,
} from "@/content/types";
import { pageHead } from "@/lib/head";

type Tab = "homepage" | "travel" | "pages" | "navigation";
type Lang = "en" | "ar";

const VALID_TABS: readonly Tab[] = ["homepage", "travel", "pages", "navigation"];
const VALID_PAGES: readonly InformationalPageId[] = ["about", "contact", "privacy", "terms"];

export const Route = createFileRoute("/{-$locale}/admin/website")({
  validateSearch: (search: Record<string, unknown>): {
    tab?: Tab | undefined;
    item?: string | undefined;
    page?: InformationalPageId | undefined;
  } => {
    const rawTab = search["tab"];
    const tabStr = typeof rawTab === "string" ? rawTab : "";
    const tab = (VALID_TABS as readonly string[]).includes(tabStr) ? (tabStr as Tab) : undefined;

    const rawItem = search["item"];
    const item = typeof rawItem === "string" && rawItem.trim() ? rawItem.trim() : undefined;

    const rawPage = search["page"];
    const pageStr = typeof rawPage === "string" ? rawPage : "";
    const page = (VALID_PAGES as readonly string[]).includes(pageStr) ? (pageStr as InformationalPageId) : undefined;

    return { tab, item, page };
  },
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/website",
      en: {
        title: "Website content — Gaza International Airport administration",
        description: "Homepage, travel information, pages and navigation.",
      },
      ar: {
        title: "محتوى الموقع — إدارة مطار غزة الدولي",
        description: "الصفحة الرئيسية ومعلومات السفر والصفحات والتنقل.",
      },
      noindex: true,
    }),
  component: AdminWebsitePage,
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

const HOME_COPY_GROUPS: {
  groupId: string;
  groupLabelKey: string;
  keys: { key: HomeCopyKey; labelKey: string; isTextarea?: boolean }[];
}[] = [
  {
    groupId: "hero",
    groupLabelKey: "cms.copy.heroGroup",
    keys: [
      { key: "h1", labelKey: "cms.copy.h1" },
      { key: "sub", labelKey: "cms.copy.sub", isTextarea: true },
    ],
  },
  {
    groupId: "heritage",
    groupLabelKey: "cms.copy.heritageGroup",
    keys: [
      { key: "heritageSpotlightTitle", labelKey: "cms.copy.heritageSpotlightTitle" },
      { key: "heritageSpotlightDesc", labelKey: "cms.copy.heritageSpotlightDesc", isTextarea: true },
      { key: "past", labelKey: "cms.copy.past" },
      { key: "pastSub", labelKey: "cms.copy.pastSub", isTextarea: true },
      { key: "present", labelKey: "cms.copy.present" },
      { key: "presentSub", labelKey: "cms.copy.presentSub", isTextarea: true },
      { key: "future", labelKey: "cms.copy.future" },
      { key: "futureSub", labelKey: "cms.copy.futureSub", isTextarea: true },
    ],
  },
  {
    groupId: "destinations",
    groupLabelKey: "cms.copy.destinationsGroup",
    keys: [
      { key: "destTitle", labelKey: "cms.copy.destTitle" },
      { key: "destSub", labelKey: "cms.copy.destSub", isTextarea: true },
    ],
  },
  {
    groupId: "manage",
    groupLabelKey: "cms.copy.manageGroup",
    keys: [
      { key: "manageTitle", labelKey: "cms.copy.manageTitle" },
      { key: "manageSub", labelKey: "cms.copy.manageSub", isTextarea: true },
    ],
  },
  {
    groupId: "travel",
    groupLabelKey: "cms.copy.travelGroup",
    keys: [{ key: "infoTitle", labelKey: "cms.copy.infoTitle" }],
  },
  {
    groupId: "archive",
    groupLabelKey: "cms.copy.archiveGroup",
    keys: [
      { key: "archiveTitle", labelKey: "cms.copy.archiveTitle" },
      { key: "archiveSub", labelKey: "cms.copy.archiveSub", isTextarea: true },
    ],
  },
];

function AdminWebsitePage() {
  const { t, lang } = useI18n();
  const { can, toast } = useAdmin();
  const search = Route.useSearch();

  const [tab, setTab] = useState<Tab>(search.tab ?? "homepage");
  const [editLang, setEditLang] = useState<Lang>("en");
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [conflictReloadDialogOpen, setConflictReloadDialogOpen] = useState(false);
  const [travelActiveSectionId, setTravelActiveSectionId] = useState<string>(search.item ?? "prepare");
  const [selectedPageId, setSelectedPageId] = useState<InformationalPageId>(search.page ?? "about");

  const mayEdit = can("content.edit");

  // Home CMS Document
  const homeCms = useCmsDocument({
    key: "home",
    published: publishedHome,
    validate: validateHomeContent,
    editLang,
    onInvalidField: (field) => {
      if (field.endsWith("-ar")) setEditLang("ar");
      if (field.endsWith("-en")) setEditLang("en");
    },
  });

  // Travel CMS Document
  const travelCms = useCmsDocument({
    key: "travel",
    published: publishedTravel,
    validate: validateTravelContent,
    editLang,
    onInvalidField: (field) => {
      if (field.endsWith("-ar")) setEditLang("ar");
      if (field.endsWith("-en")) setEditLang("en");
      const section = travelCms.draft.sections.find((item) =>
        field.startsWith(`tr-sec-${item.id}-`) || item.points.some((point) => field.startsWith(`tr-pt-${point.id}-`)));
      if (section) setTravelActiveSectionId(section.id);
    },
  });

  // Pages CMS Document
  const pagesCms = useCmsDocument({
    key: "pages.information",
    published: publishedInformationPages,
    validate: validateInformationPagesContent,
    editLang,
    onInvalidField: (field) => {
      if (field.endsWith("-ar")) setEditLang("ar");
      if (field.endsWith("-en")) setEditLang("en");
      for (const p of VALID_PAGES) {
        if (field.startsWith(`pg-${p}-`)) {
          setSelectedPageId(p);
          break;
        }
      }
    },
  });

  // Keep state synchronized with deep-link search parameters
  useEffect(() => {
    setTab(search.tab ?? "homepage");
  }, [search.tab]);

  useEffect(() => {
    setTravelActiveSectionId(publishedTravel.sections.some((section) => section.id === search.item) ? search.item! : "prepare");
  }, [search.item]);

  useEffect(() => {
    setSelectedPageId(search.page ?? "about");
  }, [search.page]);

  const navigationBlocker = useBlocker({
    shouldBlockFn: () =>
      homeCms.dirty ||
      travelCms.dirty ||
      pagesCms.dirty ||
      homeCms.saving ||
      travelCms.saving ||
      pagesCms.saving,
    enableBeforeUnload:
      homeCms.dirty ||
      travelCms.dirty ||
      pagesCms.dirty ||
      homeCms.saving ||
      travelCms.saving ||
      pagesCms.saving,
    withResolver: true,
  });

  if (!can("content.view")) {
    return <AdminDenied area={t("a2.web.title")} permission="content.view" />;
  }

  // Handle tab switching with dirty protection
  const handleTabChange = (nextTab: Tab) => {
    if (nextTab === tab || homeCms.saving || travelCms.saving || pagesCms.saving) return;
    const isCurrentDirty =
      (tab === "homepage" && homeCms.dirty) ||
      (tab === "travel" && travelCms.dirty) ||
      (tab === "pages" && pagesCms.dirty);
    if (isCurrentDirty) {
      setPendingTab(nextTab);
    } else {
      setTab(nextTab);
    }
  };

  const handleConfirmTabSwitch = () => {
    if (!pendingTab) return;
    if (tab === "homepage") {
      homeCms.resetLocalEdits();
    } else if (tab === "travel") {
      travelCms.resetLocalEdits();
    } else if (tab === "pages") {
      pagesCms.resetLocalEdits();
    }
    setTab(pendingTab);
    setPendingTab(null);
  };

  const handleCancelTabSwitch = () => {
    setPendingTab(null);
  };

  // Home actions
  const handleSaveHome = async () => {
    const res = await homeCms.save();
    if (res.success) {
      if (res.changed) toast(t("cms.savedDraftSuccess"));
    } else if (res.errors && Object.keys(res.errors).length > 0) {
      toast(t("cms.err.fixErrors"));
    } else if (homeCms.saveError) {
      toast(homeCms.saveError);
    }
  };

  const handleDiscardHome = async () => {
    const success = await homeCms.discard();
    if (success) {
      toast(t("cms.discardSuccess"));
    }
    setDiscardDialogOpen(false);
  };

  const updateHomeCopy = (key: HomeCopyKey, value: string) => {
    homeCms.setDraft((current) => ({
      ...current,
      copy: {
        ...current.copy,
        [key]: {
          ...current.copy[key],
          [editLang]: value,
        },
      },
    }));
  };

  const updateHomeSeo = (updatedSeo: PageSeoContent) => {
    homeCms.setDraft((current) => ({
      ...current,
      seo: updatedSeo,
    }));
  };

  const updateHomeSections = (updatedSections: HomeSection[]) => {
    homeCms.setDraft((current) => ({
      ...current,
      sections: updatedSections,
    }));
  };

  // Travel actions
  const handleSaveTravel = async () => {
    const res = await travelCms.save();
    if (res.success) {
      if (res.changed) toast(t("cms.savedDraftSuccess"));
    } else if (res.errors && Object.keys(res.errors).length > 0) {
      toast(t("cms.err.fixErrors"));
    } else if (travelCms.saveError) {
      toast(travelCms.saveError);
    }
  };

  const handleDiscardTravel = async () => {
    const success = await travelCms.discard();
    if (success) {
      toast(t("cms.discardSuccess"));
    }
    setDiscardDialogOpen(false);
  };

  const updateTravelIntro = (field: "title" | "description", value: string) => {
    travelCms.setDraft((current) => ({
      ...current,
      intro: {
        ...current.intro,
        [field]: {
          ...current.intro[field],
          [editLang]: value,
        },
      },
    }));
  };

  const updateTravelSeo = (updatedSeo: PageSeoContent) => {
    travelCms.setDraft((current) => ({
      ...current,
      seo: updatedSeo,
    }));
  };

  const updateTravelSectionText = (
    sectionId: string,
    field: "title" | "body",
    value: string,
  ) => {
    travelCms.setDraft((current) => ({
      ...current,
      sections: current.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          [field]: {
            ...sec[field],
            [editLang]: value,
          },
        };
      }),
    }));
  };

  const toggleTravelSectionVisibility = (sectionId: string, visible: boolean) => {
    travelCms.setDraft((current) => ({
      ...current,
      sections: current.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return { ...sec, visible };
      }),
    }));
  };

  const updatePoint = (
    sectionId: string,
    pointId: string,
    field: "text" | "visible",
    value: string | boolean,
  ) => {
    travelCms.setDraft((current) => ({
      ...current,
      sections: current.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          points: sec.points.map((pt) => {
            if (pt.id !== pointId) return pt;
            if (field === "visible") {
              return { ...pt, visible: Boolean(value) };
            }
            return {
              ...pt,
              text: {
                ...pt.text,
                [editLang]: String(value),
              },
            };
          }),
        };
      }),
    }));
  };

  const movePoint = (sectionId: string, fromIndex: number, toIndex: number) => {
    travelCms.setDraft((current) => ({
      ...current,
      sections: current.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const points = [...sec.points];
        if (
          fromIndex < 0 ||
          fromIndex >= points.length ||
          toIndex < 0 ||
          toIndex >= points.length
        ) {
          return sec;
        }
        const temp = points[fromIndex]!;
        points[fromIndex] = points[toIndex]!;
        points[toIndex] = temp;
        return { ...sec, points };
      }),
    }));
  };

  const addPoint = (sectionId: string) => {
    travelCms.setDraft((current) => {
      const existingIds = new Set(current.sections.flatMap((s) => s.points.map((p) => p.id)));
      let candidate = `${sectionId}-pt-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2, 6)}`;
      while (existingIds.has(candidate)) {
        candidate = `${sectionId}-pt-${Math.random().toString(36).slice(2, 8)}`;
      }
      return {
        ...current,
        sections: current.sections.map((sec) => {
          if (sec.id !== sectionId) return sec;
          return {
            ...sec,
            points: [
              ...sec.points,
              {
                id: candidate,
                visible: true,
                text: { en: "", ar: "" },
              },
            ],
          };
        }),
      };
    });
  };

  const deletePoint = (sectionId: string, pointId: string) => {
    travelCms.setDraft((current) => ({
      ...current,
      sections: current.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          points: sec.points.filter((pt) => pt.id !== pointId),
        };
      }),
    }));
  };

  // Pages actions
  const handleSavePages = async () => {
    const res = await pagesCms.save();
    if (res.success) {
      if (res.changed) toast(t("cms.savedDraftSuccess"));
    } else if (res.errors && Object.keys(res.errors).length > 0) {
      toast(t("cms.err.fixErrors"));
    } else if (pagesCms.saveError) {
      toast(pagesCms.saveError);
    }
  };

  const handleDiscardPages = async () => {
    const success = await pagesCms.discard();
    if (success) {
      toast(t("cms.discardSuccess"));
    }
    setDiscardDialogOpen(false);
  };

  const updatePageTitleDesc = (pageId: InformationalPageId, field: "title" | "description", val: string) => {
    pagesCms.setDraft((cur) => ({
      ...cur,
      pages: cur.pages.map((p) =>
        p.id === pageId
          ? {
              ...p,
              [field]: {
                ...p[field],
                [editLang]: val,
              },
            }
          : p,
      ),
    }));
  };

  const updatePageSeo = (pageId: InformationalPageId, field: "title" | "description", val: string) => {
    pagesCms.setDraft((cur) => ({
      ...cur,
      pages: cur.pages.map((p) =>
        p.id === pageId
          ? {
              ...p,
              seo: {
                ...p.seo,
                [field]: {
                  ...p.seo[field],
                  [editLang]: val,
                },
              },
            }
          : p,
      ),
    }));
  };

  const updateBlock = (pageId: InformationalPageId, blockId: string, patch: Partial<InformationalPageBlock>) => {
    pagesCms.setDraft((cur) => ({
      ...cur,
      pages: cur.pages.map((p) => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          blocks: p.blocks.map((b) => {
            if (b.id !== blockId) return b;
            return {
              ...b,
              ...patch,
              ...(patch.title ? { title: { ...b.title, ...patch.title } } : {}),
            };
          }),
        };
      }),
    }));
  };

  const addBlock = (pageId: InformationalPageId) => {
    pagesCms.setDraft((cur) => {
      const existingIds = new Set(cur.pages.flatMap((p) => p.blocks.map((b) => b.id)));
      let candidate = `${pageId}-blk-${Date.now().toString(36).slice(-4)}`;
      while (existingIds.has(candidate)) {
        candidate = `${pageId}-blk-${Math.random().toString(36).slice(2, 6)}`;
      }
      return {
        ...cur,
        pages: cur.pages.map((p) => {
          if (p.id !== pageId) return p;
          return {
            ...p,
            blocks: [
              ...p.blocks,
              {
                id: candidate,
                visible: true,
                title: { en: "New section", ar: "قسم جديد" },
                paragraphs: [{ en: "Content paragraph text.", ar: "نص الفقرة هنا." }],
              },
            ],
          };
        }),
      };
    });
  };

  const deleteBlock = (pageId: InformationalPageId, blockId: string) => {
    pagesCms.setDraft((cur) => ({
      ...cur,
      pages: cur.pages.map((p) => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          blocks: p.blocks.filter((b) => b.id !== blockId),
        };
      }),
    }));
  };

  const moveBlock = (pageId: InformationalPageId, fromIdx: number, toIdx: number) => {
    pagesCms.setDraft((cur) => ({
      ...cur,
      pages: cur.pages.map((p) => {
        if (p.id !== pageId) return p;
        const blks = [...p.blocks];
        if (fromIdx < 0 || fromIdx >= blks.length || toIdx < 0 || toIdx >= blks.length) return p;
        const temp = blks[fromIdx]!;
        blks[fromIdx] = blks[toIdx]!;
        blks[toIdx] = temp;
        return { ...p, blocks: blks };
      }),
    }));
  };

  const updateParagraph = (pageId: InformationalPageId, blockId: string, paraIdx: number, text: string) => {
    pagesCms.setDraft((cur) => ({
      ...cur,
      pages: cur.pages.map((p) => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          blocks: p.blocks.map((b) => {
            if (b.id !== blockId) return b;
            const paras = [...b.paragraphs];
            const curPara = paras[paraIdx] ?? { en: "", ar: "" };
            paras[paraIdx] = { ...curPara, [editLang]: text };
            return { ...b, paragraphs: paras };
          }),
        };
      }),
    }));
  };

  const addParagraph = (pageId: InformationalPageId, blockId: string) => {
    pagesCms.setDraft((cur) => ({
      ...cur,
      pages: cur.pages.map((p) => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          blocks: p.blocks.map((b) => {
            if (b.id !== blockId) return b;
            return {
              ...b,
              paragraphs: [...b.paragraphs, { en: "", ar: "" }],
            };
          }),
        };
      }),
    }));
  };

  const deleteParagraph = (pageId: InformationalPageId, blockId: string, paraIdx: number) => {
    pagesCms.setDraft((cur) => ({
      ...cur,
      pages: cur.pages.map((p) => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          blocks: p.blocks.map((b) => {
            if (b.id !== blockId) return b;
            return {
              ...b,
              paragraphs: b.paragraphs.filter((_, idx) => idx !== paraIdx),
            };
          }),
        };
      }),
    }));
  };

  // Header action bar based on current tab
  const headerAction =
    tab === "homepage" ? (
      <CmsDraftBar
        mayEdit={mayEdit}
        draftReady={homeCms.ready}
                unavailable={Boolean(homeCms.saveError)}
        dirty={homeCms.dirty}
        savedDraft={homeCms.savedDraft}
        saving={homeCms.saving}
        previewUrlEn="/?contentPreview=1"
        previewUrlAr="/ar?contentPreview=1"
        onSave={() => {
          void handleSaveHome();
        }}
        onDiscard={() => setDiscardDialogOpen(true)}
      />
    ) : tab === "travel" ? (
      <CmsDraftBar
        mayEdit={mayEdit}
        draftReady={travelCms.ready}
                unavailable={Boolean(travelCms.saveError)}
        dirty={travelCms.dirty}
        savedDraft={travelCms.savedDraft}
        saving={travelCms.saving}
        previewUrlEn="/travel?contentPreview=1"
        previewUrlAr="/ar/travel?contentPreview=1"
        onSave={() => {
          void handleSaveTravel();
        }}
        onDiscard={() => setDiscardDialogOpen(true)}
      />
    ) : tab === "pages" ? (
      <CmsDraftBar
        mayEdit={mayEdit}
        draftReady={pagesCms.ready}
                unavailable={Boolean(pagesCms.saveError)}
        dirty={pagesCms.dirty}
        savedDraft={pagesCms.savedDraft}
        saving={pagesCms.saving}
        previewUrlEn={`/${selectedPageId}?contentPreview=1`}
        previewUrlAr={`/ar/${selectedPageId}?contentPreview=1`}
        onSave={() => {
          void handleSavePages();
        }}
        onDiscard={() => setDiscardDialogOpen(true)}
      />
    ) : null;

  const activeTravelSection =
    travelCms.draft.sections.find((s) => s.id === travelActiveSectionId) ??
    travelCms.draft.sections[0];
  const activeTravelSectionIndex = travelCms.draft.sections.findIndex(
    (s) => s.id === activeTravelSection?.id,
  );

  const activePage =
    pagesCms.draft.pages.find((p) => p.id === selectedPageId) ??
    pagesCms.draft.pages[0];

  const dirFor = editLang === "ar" ? "rtl" : "ltr";

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("a2.web.title")}
        description={t("a2.web.sub")}
        meta={
          <p className="text-xs text-muted-foreground">
            {tab === "navigation"
              ? t("cms.nav.disclosure")
              : t("content.localNotPublished")}
          </p>
        }
        action={headerAction}
      />

      <AdminPanel bodyClassName="p-0">
        <AdminTabs
          label={t("a2.web.title")}
          active={tab}
          onChange={(newTab) => handleTabChange(newTab as Tab)}
          tabs={[
            { id: "homepage", label: t("a2.web.tab.homepage") },
            { id: "travel", label: t("a2.web.tab.travel") },
            { id: "pages", label: t("a2.web.tab.pages") },
            { id: "navigation", label: t("a2.web.tab.navigation") },
          ]}
        />

        <div className="space-y-4 p-4">
          <LangToggle value={editLang} onChange={setEditLang} />

          {/* -------------------- HOMEPAGE TAB -------------------- */}
          {tab === "homepage" ? (
            <div className="space-y-6">
              {homeCms.conflict ? (
                <CmsConflictBanner
                  onReload={() => setConflictReloadDialogOpen(true)}
                  onDismiss={homeCms.dismissConflict}
                />
              ) : null}

              {homeCms.saveError ? (
                <p role="alert" className="text-sm text-destructive">
                  <span>{homeCms.saveError}</span>
                  <button type="button" className={btnClass("ghost", "sm")} onClick={() => { void homeCms.retryRead(); }}>{t("cms.retry")}</button>
                </p>
              ) : null}

              {/* Sections Layout & Ordering */}
              <CmsSectionList
                sections={homeCms.draft.sections}
                mayEdit={mayEdit && homeCms.ready && !homeCms.saving}
                onChange={updateHomeSections}
              />

              {/* SEO Metadata */}
              <CmsSeoFields
                seo={homeCms.draft.seo}
                editLang={editLang}
                mayEdit={mayEdit}
                ready={homeCms.ready}
                errors={homeCms.errors}
                onChange={updateHomeSeo}
              />

              {/* Copy Groups */}
              <div className="space-y-4">
                <div className="border-b border-border pb-2">
                  <h2 className="text-base font-bold">{t("cms.copy.heading")}</h2>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {HOME_COPY_GROUPS.map((group) => (
                    <section
                      key={group.groupId}
                      aria-labelledby={`home-grp-${group.groupId}-heading`}
                      className="rounded-lg border border-border bg-card p-4 space-y-3"
                    >
                      <h3
                        id={`home-grp-${group.groupId}-heading`}
                        className="text-sm font-bold border-b border-border pb-2"
                      >
                        {t(group.groupLabelKey)}
                      </h3>

                      <div className="space-y-3">
                        {group.keys.map((item) => {
                          const val = homeCms.draft.copy[item.key]?.[editLang] ?? "";
                          const errKey = homeCms.errors[`copy-${item.key}-${editLang}`];
                          return (
                            <AdminField
                              key={item.key}
                              label={t(item.labelKey)}
                              htmlFor={`copy-${item.key}-${editLang}`}
                            >
                              {item.isTextarea ? (
                                <Textarea
                                  id={`copy-${item.key}-${editLang}`}
                                  dir={editLang === "ar" ? "rtl" : "ltr"}
                                  value={val}
                                  readOnly={!mayEdit || !homeCms.ready || homeCms.saving}
                                  aria-invalid={errKey ? "true" : "false"}
                                  aria-describedby={
                                    errKey ? `copy-${item.key}-${editLang}-err` : undefined
                                  }
                                  onChange={(e) => updateHomeCopy(item.key, e.target.value)}
                                  className="min-h-20"
                                />
                              ) : (
                                <Input
                                  id={`copy-${item.key}-${editLang}`}
                                  dir={editLang === "ar" ? "rtl" : "ltr"}
                                  value={val}
                                  readOnly={!mayEdit || !homeCms.ready || homeCms.saving}
                                  aria-invalid={errKey ? "true" : "false"}
                                  aria-describedby={
                                    errKey ? `copy-${item.key}-${editLang}-err` : undefined
                                  }
                                  onChange={(e) => updateHomeCopy(item.key, e.target.value)}
                                />
                              )}
                              {errKey ? (
                                <p
                                  id={`copy-${item.key}-${editLang}-err`}
                                  role="alert"
                                  className="text-xs text-destructive"
                                >
                                  {t(errKey)}
                                </p>
                              ) : null}
                            </AdminField>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {/* -------------------- TRAVEL TAB -------------------- */}
          {tab === "travel" ? (
            <div className="space-y-6">
              {travelCms.conflict ? (
                <CmsConflictBanner
                  onReload={() => setConflictReloadDialogOpen(true)}
                  onDismiss={travelCms.dismissConflict}
                />
              ) : null}

              {travelCms.saveError ? (
                <p role="alert" className="text-sm text-destructive">
                  <span>{travelCms.saveError}</span>
                  <button type="button" className={btnClass("ghost", "sm")} onClick={() => { void travelCms.retryRead(); }}>{t("cms.retry")}</button>
                </p>
              ) : null}

              {/* Travel Overview & Intro */}
              <section
                aria-labelledby="tr-intro-heading"
                className="rounded-lg border border-border bg-card p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                  <div>
                    <h2 id="tr-intro-heading" className="text-sm font-bold">
                      {t("cms.travel.intro")}
                    </h2>
                  </div>
                  <BilingualStatus
                    missingAr={
                      !travelCms.draft.intro.title.ar?.trim() ||
                      !travelCms.draft.intro.description.ar?.trim()
                    }
                    missingEn={
                      !travelCms.draft.intro.title.en?.trim() ||
                      !travelCms.draft.intro.description.en?.trim()
                    }
                  />
                </div>

                {(() => {
                  const introTitleErr = travelCms.errors[`tr-intro-title-${editLang}`];
                  const introDescErr = travelCms.errors[`tr-intro-desc-${editLang}`];
                  return (
                    <div className="grid gap-3 lg:grid-cols-2">
                      <AdminField
                        label={t("a2.title")}
                        htmlFor={`tr-intro-title-${editLang}`}
                      >
                        <Input
                          id={`tr-intro-title-${editLang}`}
                          dir={editLang === "ar" ? "rtl" : "ltr"}
                          value={travelCms.draft.intro.title[editLang] ?? ""}
                          readOnly={!mayEdit || !travelCms.ready || travelCms.saving}
                          aria-invalid={introTitleErr ? "true" : "false"}
                          aria-describedby={
                            introTitleErr ? `tr-intro-title-${editLang}-err` : undefined
                          }
                          onChange={(e) => updateTravelIntro("title", e.target.value)}
                        />
                        {introTitleErr ? (
                          <p
                            id={`tr-intro-title-${editLang}-err`}
                            role="alert"
                            className="text-xs text-destructive"
                          >
                            {t(introTitleErr)}
                          </p>
                        ) : null}
                      </AdminField>

                      <AdminField
                        label={t("a2.body")}
                        htmlFor={`tr-intro-desc-${editLang}`}
                      >
                        <Input
                          id={`tr-intro-desc-${editLang}`}
                          dir={editLang === "ar" ? "rtl" : "ltr"}
                          value={travelCms.draft.intro.description[editLang] ?? ""}
                          readOnly={!mayEdit || !travelCms.ready || travelCms.saving}
                          aria-invalid={introDescErr ? "true" : "false"}
                          aria-describedby={
                            introDescErr ? `tr-intro-desc-${editLang}-err` : undefined
                          }
                          onChange={(e) => updateTravelIntro("description", e.target.value)}
                        />
                        {introDescErr ? (
                          <p
                            id={`tr-intro-desc-${editLang}-err`}
                            role="alert"
                            className="text-xs text-destructive"
                          >
                            {t(introDescErr)}
                          </p>
                        ) : null}
                      </AdminField>
                    </div>
                  );
                })()}
              </section>

              {/* SEO Metadata */}
              <CmsSeoFields
                seo={travelCms.draft.seo}
                editLang={editLang}
                mayEdit={mayEdit}
                ready={travelCms.ready}
                errors={travelCms.errors}
                onChange={updateTravelSeo}
              />

              {/* Sections Navigation & Reordering */}
              <section aria-labelledby="tr-sections-heading" className="space-y-4">
                <div className="border-b border-border pb-2">
                  <h2 id="tr-sections-heading" className="text-base font-bold">
                    {t("cms.travel.sections")}
                  </h2>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {travelCms.draft.sections.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={travelActiveSectionId === s.id}
                      onClick={() => setTravelActiveSectionId(s.id)}
                      className={btnClass(
                        travelActiveSectionId === s.id ? "secondary" : "ghost",
                        "sm",
                      )}
                    >
                      <span>{pick(lang, s.title)}</span>
                      {!s.visible ? (
                        <span className="ms-1.5 text-xs text-muted-foreground">
                          ({t("a2.hidden")})
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>

                {activeTravelSection ? (
                  <div className="space-y-4 rounded-lg border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold">
                          {pick(lang, activeTravelSection.title)}
                        </h3>
                        <span className="text-xs text-muted-foreground">
                          (<Ltr>{activeTravelSection.id}</Ltr>)
                        </span>
                        <AdminChip tone={activeTravelSection.visible ? "brand" : "muted"}>
                          {t(activeTravelSection.visible ? "a2.visible" : "a2.hidden")}
                        </AdminChip>
                        <BilingualStatus
                          missingAr={
                            !activeTravelSection.title.ar?.trim() ||
                            !activeTravelSection.body.ar?.trim()
                          }
                          missingEn={
                            !activeTravelSection.title.en?.trim() ||
                            !activeTravelSection.body.en?.trim()
                          }
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={activeTravelSection.visible}
                            disabled={!mayEdit || !travelCms.ready || travelCms.saving}
                            onChange={(e) =>
                              toggleTravelSectionVisibility(
                                activeTravelSection.id,
                                e.target.checked,
                              )
                            }
                            className="rounded border-border"
                          />
                          <span>{t("cms.travel.sectionVisibility")}</span>
                        </label>
                      </div>
                    </div>

                    {/* Section Text */}
                    {(() => {
                      const secTitleErr =
                        travelCms.errors[`tr-sec-${activeTravelSection.id}-title-${editLang}`];
                      const secBodyErr =
                        travelCms.errors[`tr-sec-${activeTravelSection.id}-body-${editLang}`];
                      return (
                        <div className="space-y-3">
                          <AdminField
                            label={t("a2.title")}
                            htmlFor={`tr-sec-${activeTravelSection.id}-title-${editLang}`}
                          >
                            <Input
                              id={`tr-sec-${activeTravelSection.id}-title-${editLang}`}
                              dir={editLang === "ar" ? "rtl" : "ltr"}
                              value={activeTravelSection.title[editLang] ?? ""}
                              readOnly={!mayEdit || !travelCms.ready || travelCms.saving}
                              aria-invalid={secTitleErr ? "true" : "false"}
                              aria-describedby={
                                secTitleErr
                                  ? `tr-sec-${activeTravelSection.id}-title-${editLang}-err`
                                  : undefined
                              }
                              onChange={(e) =>
                                updateTravelSectionText(
                                  activeTravelSection.id,
                                  "title",
                                  e.target.value,
                                )
                              }
                            />
                            {secTitleErr ? (
                              <p
                                id={`tr-sec-${activeTravelSection.id}-title-${editLang}-err`}
                                role="alert"
                                className="text-xs text-destructive"
                              >
                                {t(secTitleErr)}
                              </p>
                            ) : null}
                          </AdminField>

                          <AdminField
                            label={t("a2.body")}
                            htmlFor={`tr-sec-${activeTravelSection.id}-body-${editLang}`}
                          >
                            <Textarea
                              id={`tr-sec-${activeTravelSection.id}-body-${editLang}`}
                              dir={editLang === "ar" ? "rtl" : "ltr"}
                              value={activeTravelSection.body[editLang] ?? ""}
                              readOnly={!mayEdit || !travelCms.ready || travelCms.saving}
                              aria-invalid={secBodyErr ? "true" : "false"}
                              aria-describedby={
                                secBodyErr
                                  ? `tr-sec-${activeTravelSection.id}-body-${editLang}-err`
                                  : undefined
                              }
                              onChange={(e) =>
                                updateTravelSectionText(
                                  activeTravelSection.id,
                                  "body",
                                  e.target.value,
                                )
                              }
                              className="min-h-24"
                            />
                            {secBodyErr ? (
                              <p
                                id={`tr-sec-${activeTravelSection.id}-body-${editLang}-err`}
                                role="alert"
                                className="text-xs text-destructive"
                              >
                                {t(secBodyErr)}
                              </p>
                            ) : null}
                          </AdminField>
                        </div>
                      );
                    })()}

                    {/* Section Points List */}
                    <div className="space-y-3 pt-3 border-t border-border">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-sm font-bold">
                          {t("cms.travel.points")}
                        </h4>
                        <PermissionButton
                          allowed={mayEdit && travelCms.ready && !travelCms.saving}
                          reason={t("adm.edit.readOnly")}
                          variant="outline"
                          size="sm"
                          onClick={() => addPoint(activeTravelSection.id)}
                        >
                          <Plus aria-hidden="true" className="size-3.5" />
                          <span>{t("cms.travel.addPoint")}</span>
                        </PermissionButton>
                      </div>

                      {activeTravelSection.points.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {t("cms.travel.emptyPoints")}
                        </p>
                      ) : null}

                      <div className="space-y-2">
                        {activeTravelSection.points.map((pt, ptIdx) => {
                          const ptErr =
                            travelCms.errors[`tr-pt-${pt.id}-${editLang}`];
                          const canMovePtUp =
                            ptIdx > 0 &&
                            mayEdit &&
                            travelCms.ready &&
                            !travelCms.saving;
                          const canMovePtDown =
                            ptIdx < activeTravelSection.points.length - 1 &&
                            mayEdit &&
                            travelCms.ready &&
                            !travelCms.saving;
                          return (
                            <div
                              key={pt.id}
                              className="flex flex-wrap items-start gap-2 rounded-md border border-border p-2.5 bg-background"
                            >
                              <div className="flex items-center gap-1.5 pt-1.5">
                                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <input
                                    type="checkbox"
                                    checked={pt.visible}
                                    disabled={
                                      !mayEdit ||
                                      !travelCms.ready ||
                                      travelCms.saving
                                    }
                                    onChange={(e) =>
                                      updatePoint(
                                        activeTravelSection.id,
                                        pt.id,
                                        "visible",
                                        e.target.checked,
                                      )
                                    }
                                    className="rounded border-border"
                                  />
                                  <span className="sr-only">
                                    {t("cms.travel.pointVisibility")}
                                  </span>
                                </label>
                              </div>

                              <div className="min-w-0 flex-1">
                                <Input
                                  id={`tr-pt-${pt.id}-${editLang}`}
                                  dir={editLang === "ar" ? "rtl" : "ltr"}
                                  value={pt.text[editLang] ?? ""}
                                  readOnly={
                                    !mayEdit ||
                                    !travelCms.ready ||
                                    travelCms.saving
                                  }
                                  aria-invalid={ptErr ? "true" : "false"}
                                  aria-describedby={
                                    ptErr ? `tr-pt-${pt.id}-${editLang}-err` : undefined
                                  }
                                  onChange={(e) =>
                                    updatePoint(
                                      activeTravelSection.id,
                                      pt.id,
                                      "text",
                                      e.target.value,
                                    )
                                  }
                                  placeholder={t("cms.travel.pointPlaceholder")}
                                />
                                {ptErr ? (
                                  <p
                                    id={`tr-pt-${pt.id}-${editLang}-err`}
                                    role="alert"
                                    className="text-xs text-destructive mt-1"
                                  >
                                    {t(ptErr)}
                                  </p>
                                ) : null}
                              </div>

                              <div className="flex items-center gap-1">
                                <PermissionButton
                                  allowed={canMovePtUp}
                                  reason={t("adm.edit.readOnly")}
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    movePoint(
                                      activeTravelSection.id,
                                      ptIdx,
                                      ptIdx - 1,
                                    )
                                  }
                                >
                                  <ChevronUp aria-hidden="true" className="size-4" />
                                  <span className="sr-only">
                                    {t("cms.travel.movePointUp")}
                                  </span>
                                </PermissionButton>

                                <PermissionButton
                                  allowed={canMovePtDown}
                                  reason={t("adm.edit.readOnly")}
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    movePoint(
                                      activeTravelSection.id,
                                      ptIdx,
                                      ptIdx + 1,
                                    )
                                  }
                                >
                                  <ChevronDown aria-hidden="true" className="size-4" />
                                  <span className="sr-only">
                                    {t("cms.travel.movePointDown")}
                                  </span>
                                </PermissionButton>

                                <PermissionButton
                                  allowed={mayEdit}
                                  reason={t("adm.edit.readOnly")}
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    deletePoint(activeTravelSection.id, pt.id)
                                  }
                                >
                                  <Trash2
                                    aria-hidden="true"
                                    className="size-4 text-destructive"
                                  />
                                  <span className="sr-only">
                                    {t("cms.travel.deletePoint")}
                                  </span>
                                </PermissionButton>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}

          {/* -------------------- PAGES TAB (Canonical Informational Pages) -------------------- */}
          {tab === "pages" ? (
            <CmsValidationFields errors={pagesCms.errors}>
            <div className="space-y-6">
              {pagesCms.conflict ? (
                <CmsConflictBanner
                  onReload={() => setConflictReloadDialogOpen(true)}
                  onDismiss={pagesCms.dismissConflict}
                />
              ) : null}

              {pagesCms.saveError ? (
                <p role="alert" className="text-sm text-destructive">
                  <span>{pagesCms.saveError}</span>
                  <button type="button" className={btnClass("ghost", "sm")} onClick={() => { void pagesCms.retryRead(); }}>{t("cms.retry")}</button>
                </p>
              ) : null}

              {/* Page Selector Tabs */}
              <div className="space-y-2">
                <h2 className="text-sm font-bold">{t("cms.pages.heading")}</h2>
                <div className="flex flex-wrap gap-1.5">
                  {VALID_PAGES.map((pid) => {
                    const pg = pagesCms.draft.pages.find((p) => p.id === pid);
                    const label = pg ? pick(lang, pg.title) : pid;
                    return (
                      <button
                        key={pid}
                        type="button"
                        aria-pressed={selectedPageId === pid}
                        onClick={() => setSelectedPageId(pid)}
                        className={btnClass(selectedPageId === pid ? "secondary" : "ghost", "sm")}
                      >
                        <span>{label}</span>
                        <span className="ms-1.5 text-xs text-muted-foreground font-mono">
                          ({pid})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {activePage ? (
                <div className="space-y-6 rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold">
                        {pick(lang, activePage.title)}
                      </h3>
                      <Ltr className="rounded bg-sand px-1.5 py-0.5 font-mono text-xs text-muted-foreground border border-border">
                        /{activePage.id}
                      </Ltr>
                      <BilingualStatus
                        missingAr={!activePage.title.ar?.trim() || !activePage.description.ar?.trim()}
                        missingEn={!activePage.title.en?.trim() || !activePage.description.en?.trim()}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={`/${activePage.id}?contentPreview=1`}
                        target="_blank"
                        rel="noreferrer"
                        className={btnClass("outline", "sm")}
                      >
                        {t("a2.previewEn")}
                      </a>
                      <a
                        href={`/ar/${activePage.id}?contentPreview=1`}
                        target="_blank"
                        rel="noreferrer"
                        className={btnClass("outline", "sm")}
                      >
                        {t("a2.previewAr")}
                      </a>
                    </div>
                  </div>

                  {/* Page Title & Description */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(() => {
                      const titleErr = pagesCms.errors[`pg-${activePage.id}-title-${editLang}`];
                      return (
                        <AdminField
                          label={t("cms.pages.pageTitle")}
                          htmlFor={`pg-${activePage.id}-title-${editLang}`}
                        >
                          <Input
                            id={`pg-${activePage.id}-title-${editLang}`}
                            dir={dirFor}
                            value={activePage.title[editLang] ?? ""}
                            readOnly={!mayEdit || !pagesCms.ready || pagesCms.saving}
                            aria-invalid={titleErr ? "true" : "false"}
                            onChange={(e) => updatePageTitleDesc(activePage.id, "title", e.target.value)}
                          />
                          {titleErr ? (
                            <p role="alert" className="text-xs text-destructive mt-1">
                              {t(titleErr)}
                            </p>
                          ) : null}
                        </AdminField>
                      );
                    })()}

                    {(() => {
                      const descErr = pagesCms.errors[`pg-${activePage.id}-desc-${editLang}`];
                      return (
                        <AdminField
                          label={t("cms.pages.pageDesc")}
                          htmlFor={`pg-${activePage.id}-desc-${editLang}`}
                        >
                          <Input
                            id={`pg-${activePage.id}-desc-${editLang}`}
                            dir={dirFor}
                            value={activePage.description[editLang] ?? ""}
                            readOnly={!mayEdit || !pagesCms.ready || pagesCms.saving}
                            aria-invalid={descErr ? "true" : "false"}
                            onChange={(e) => updatePageTitleDesc(activePage.id, "description", e.target.value)}
                          />
                          {descErr ? (
                            <p role="alert" className="text-xs text-destructive mt-1">
                              {t(descErr)}
                            </p>
                          ) : null}
                        </AdminField>
                      );
                    })()}
                  </div>

                  {/* Page SEO */}
                  <div className="space-y-3 pt-3 border-t border-border">
                    <h4 className="text-sm font-bold">{t("cms.seo.title")}</h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(() => {
                        const seoTitleErr = pagesCms.errors[`pg-${activePage.id}-seo-title-${editLang}`];
                        return (
                          <AdminField
                            label={t("cms.seo.pageTitle")}
                            htmlFor={`pg-${activePage.id}-seo-title-${editLang}`}
                          >
                            <Input
                              id={`pg-${activePage.id}-seo-title-${editLang}`}
                              dir={dirFor}
                              value={activePage.seo.title[editLang] ?? ""}
                              readOnly={!mayEdit || !pagesCms.ready || pagesCms.saving}
                              aria-invalid={seoTitleErr ? "true" : "false"}
                              onChange={(e) => updatePageSeo(activePage.id, "title", e.target.value)}
                            />
                            {seoTitleErr ? (
                              <p role="alert" className="text-xs text-destructive mt-1">
                                {t(seoTitleErr)}
                              </p>
                            ) : null}
                          </AdminField>
                        );
                      })()}

                      {(() => {
                        const seoDescErr = pagesCms.errors[`pg-${activePage.id}-seo-desc-${editLang}`];
                        return (
                          <AdminField
                            label={t("cms.seo.metaDesc")}
                            htmlFor={`pg-${activePage.id}-seo-desc-${editLang}`}
                          >
                            <Input
                              id={`pg-${activePage.id}-seo-desc-${editLang}`}
                              dir={dirFor}
                              value={activePage.seo.description[editLang] ?? ""}
                              readOnly={!mayEdit || !pagesCms.ready || pagesCms.saving}
                              aria-invalid={seoDescErr ? "true" : "false"}
                              onChange={(e) => updatePageSeo(activePage.id, "description", e.target.value)}
                            />
                            {seoDescErr ? (
                              <p role="alert" className="text-xs text-destructive mt-1">
                                {t(seoDescErr)}
                              </p>
                            ) : null}
                          </AdminField>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Contact authority notice */}
                  {activePage.id === "contact" ? (
                    <div className="rounded-md border border-border/80 bg-secondary/50 p-3 text-xs text-muted-foreground space-y-1">
                      <p className="font-semibold text-foreground">
                        {t("cms.pages.contactAuthorityNotice")}
                      </p>
                    </div>
                  ) : null}

                  {/* Content Blocks (for about, privacy, terms) */}
                  {activePage.id !== "contact" ? (
                    <div className="space-y-4 pt-3 border-t border-border">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-sm font-bold">{t("cms.pages.blocks")}</h4>
                        <PermissionButton
                          allowed={mayEdit && pagesCms.ready && !pagesCms.saving}
                          reason={t("adm.edit.readOnly")}
                          variant="outline"
                          size="sm"
                          onClick={() => addBlock(activePage.id)}
                        >
                          <Plus aria-hidden="true" className="size-3.5" />
                          <span>{t("cms.pages.addBlock")}</span>
                        </PermissionButton>
                      </div>

                      {activePage.blocks.length === 0 ? (
                        <p className="text-xs text-muted-foreground">{t("cms.pages.emptyBlocks")}</p>
                      ) : null}

                      <div className="space-y-3">
                        {activePage.blocks.map((block, bIdx) => {
                          const titleErr = pagesCms.errors[`pg-${activePage.id}-blk-${block.id}-title-${editLang}`];
                          const canMoveUp = bIdx > 0 && mayEdit && !pagesCms.saving;
                          const canMoveDown = bIdx < activePage.blocks.length - 1 && mayEdit && !pagesCms.saving;
                          return (
                            <div
                              key={block.id}
                              className="rounded-md border border-border p-3 space-y-3 bg-background"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                                <div className="flex items-center gap-2">
                                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <input
                                      type="checkbox"
                                      checked={block.visible}
                                      disabled={!mayEdit || !pagesCms.ready || pagesCms.saving}
                                      onChange={(e) => updateBlock(activePage.id, block.id, { visible: e.target.checked })}
                                      className="rounded border-border"
                                    />
                                    <span>{t("cms.pages.blockVisibility")}</span>
                                  </label>
                                  <Ltr className="font-mono text-[11px] text-muted-foreground">
                                    {block.id}
                                  </Ltr>
                                </div>

                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    aria-label={t("cms.pages.moveBlockUp")}
                                    disabled={!canMoveUp}
                                    onClick={() => moveBlock(activePage.id, bIdx, bIdx - 1)}
                                    className={btnClass("ghost", "sm")}
                                  >
                                    <ChevronUp aria-hidden="true" className="size-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={t("cms.pages.moveBlockDown")}
                                    disabled={!canMoveDown}
                                    onClick={() => moveBlock(activePage.id, bIdx, bIdx + 1)}
                                    className={btnClass("ghost", "sm")}
                                  >
                                    <ChevronDown aria-hidden="true" className="size-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={t("cms.pages.deleteBlock")}
                                    disabled={!mayEdit || !pagesCms.ready || pagesCms.saving}
                                    onClick={() => deleteBlock(activePage.id, block.id)}
                                    className={btnClass("ghost", "sm", "text-destructive hover:bg-destructive/10")}
                                  >
                                    <Trash2 aria-hidden="true" className="size-3.5" />
                                  </button>
                                </div>
                              </div>

                              <AdminField
                                label={t("cms.pages.blockTitle")}
                                htmlFor={`pg-${activePage.id}-blk-${block.id}-title-${editLang}`}
                              >
                                <Input
                                  id={`pg-${activePage.id}-blk-${block.id}-title-${editLang}`}
                                  dir={dirFor}
                                  value={block.title[editLang] ?? ""}
                                  readOnly={!mayEdit || !pagesCms.ready || pagesCms.saving}
                                  aria-invalid={titleErr ? "true" : "false"}
                                  onChange={(e) =>
                                    updateBlock(activePage.id, block.id, {
                                      title: { ...block.title, [editLang]: e.target.value },
                                    })
                                  }
                                />
                                {titleErr ? (
                                  <p role="alert" className="text-xs text-destructive mt-1">
                                    {t(titleErr)}
                                  </p>
                                ) : null}
                              </AdminField>

                              {/* Paragraphs in block */}
                              <div className="space-y-2 pt-2 border-t border-border/40">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-muted-foreground">
                                    {t("cms.airport.paragraphs")}
                                  </span>
                                  <PermissionButton
                                    allowed={mayEdit && pagesCms.ready && !pagesCms.saving}
                                    reason={t("adm.edit.readOnly")}
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => addParagraph(activePage.id, block.id)}
                                  >
                                    <Plus aria-hidden="true" className="size-3" />
                                    <span>{t("cms.pages.addParagraph")}</span>
                                  </PermissionButton>
                                </div>

                                {block.paragraphs.map((para, pIdx) => {
                                  const pErr = pagesCms.errors[`pg-${activePage.id}-blk-${block.id}-p-${pIdx}-${editLang}`];
                                  return (
                                    <div key={pIdx} className="flex items-start gap-2">
                                      <div className="min-w-0 flex-1">
                                        <Textarea
                                          id={`pg-${activePage.id}-blk-${block.id}-p-${pIdx}-${editLang}`}
                                          dir={dirFor}
                                          className="min-h-16 text-xs"
                                          value={para[editLang] ?? ""}
                                          readOnly={!mayEdit || !pagesCms.ready || pagesCms.saving}
                                          aria-invalid={pErr ? "true" : "false"}
                                          aria-label={`${t("cms.airport.paragraphs")} ${pIdx + 1}`}
                                          aria-describedby={pErr ? `pg-${activePage.id}-blk-${block.id}-p-${pIdx}-${editLang}-err` : undefined}
                                          onChange={(e) =>
                                            updateParagraph(activePage.id, block.id, pIdx, e.target.value)
                                          }
                                        />
                                        {pErr ? (
                                          <p id={`pg-${activePage.id}-blk-${block.id}-p-${pIdx}-${editLang}-err`} role="alert" className="text-[11px] text-destructive mt-0.5">
                                            {t(pErr)}
                                          </p>
                                        ) : null}
                                      </div>
                                      {block.paragraphs.length > 1 && (
                                        <button
                                          type="button"
                                          aria-label={t("cms.pages.deleteParagraph")}
                                          disabled={!mayEdit || !pagesCms.ready || pagesCms.saving}
                                          onClick={() => deleteParagraph(activePage.id, block.id, pIdx)}
                                          className={btnClass("ghost", "sm", "text-destructive hover:bg-destructive/10")}
                                        >
                                          <Trash2 aria-hidden="true" className="size-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            </CmsValidationFields>
          ) : null}

          {/* -------------------- NAVIGATION TAB (Compiled Shared Navigation) -------------------- */}
          {tab === "navigation" ? (
            <div className="space-y-6">
              {/* Disclosure Notice */}
              <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground space-y-2">
                <p className="font-semibold text-foreground">{t("cms.nav.disclosure")}</p>
                <div>
                  <AppLink
                    to="/admin/destinations"
                    className={btnClass("outline", "sm")}
                  >
                    {t("cms.nav.destinationLink")}
                  </AppLink>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                {/* Header Primary Navigation */}
                <section aria-labelledby="nv-primary-heading" className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <h3 id="nv-primary-heading" className="text-sm font-bold border-b border-border pb-2">
                    {t("cms.nav.primary")}
                  </h3>
                  <ul className="divide-y divide-border text-xs">
                    {primaryNav.map((item) => (
                      <li key={item.to} className="flex items-center justify-between py-2">
                        <span className="font-semibold text-foreground">{t(item.key)}</span>
                        <Ltr className="font-mono text-muted-foreground">{item.to}</Ltr>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Mobile Drawer Navigation */}
                <section aria-labelledby="nv-drawer-heading" className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <h3 id="nv-drawer-heading" className="text-sm font-bold border-b border-border pb-2">
                    {t("cms.nav.drawer")}
                  </h3>
                  <ul className="divide-y divide-border text-xs">
                    {drawerNav.map((item) => (
                      <li key={item.to} className="flex items-center justify-between py-2">
                        <span className="font-semibold text-foreground">{t(item.key)}</span>
                        <Ltr className="font-mono text-muted-foreground">{item.to}</Ltr>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              {/* Footer Columns */}
              <section aria-labelledby="nv-footer-heading" className="rounded-lg border border-border bg-card p-4 space-y-4">
                <h3 id="nv-footer-heading" className="text-sm font-bold border-b border-border pb-2">
                  {t("cms.nav.footer")}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {footerColumns.map((col) => (
                    <div key={col.key} className="space-y-2">
                      <p className="text-xs font-bold text-foreground">{t(col.key)}</p>
                      <ul className="space-y-1.5 text-xs">
                        {col.links.map((link) => (
                          <li key={link.to} className="flex items-center justify-between gap-1">
                            <span className="text-muted-foreground">{t(link.key)}</span>
                            <Ltr className="font-mono text-[11px] text-muted-foreground/70">{link.to}</Ltr>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </AdminPanel>

      <ConfirmDialog
        cancelLabel={t("a2.cancel")}
        open={navigationBlocker.status === "blocked"}
        title={t("cms.unsaved.title")}
        body={t("cms.unsaved.desc")}
        confirmLabel={t("cms.unsaved.leave")}
        onConfirm={() => {
          if (!homeCms.saving && !travelCms.saving && !pagesCms.saving) {
            navigationBlocker.proceed?.();
          }
        }}
        onClose={() => navigationBlocker.reset?.()}
      />

      {/* Confirmation Dialog: Tab switch with unsaved edits */}
      <ConfirmDialog
        cancelLabel={t("a2.cancel")}
        open={pendingTab !== null}
        title={t("cms.unsaved.title")}
        body={t("cms.unsaved.desc")}
        confirmLabel={t("cms.unsaved.discardAndLeave")}
        onConfirm={handleConfirmTabSwitch}
        onClose={handleCancelTabSwitch}
      />

      {/* Confirmation Dialog: Discard draft */}
      <ConfirmDialog
        cancelLabel={t("a2.cancel")}
        open={discardDialogOpen}
        title={t("cms.discard.title")}
        body={t("cms.discard.desc")}
        confirmLabel={t("cms.discard.confirm")}
        onConfirm={() => {
          if (tab === "homepage") {
            void handleDiscardHome();
          } else if (tab === "travel") {
            void handleDiscardTravel();
          } else if (tab === "pages") {
            void handleDiscardPages();
          }
        }}
        onClose={() => setDiscardDialogOpen(false)}
      />

      {/* Confirmation Dialog: Reload remote draft on conflict */}
      <ConfirmDialog
        cancelLabel={t("a2.cancel")}
        open={conflictReloadDialogOpen}
        title={t("cms.conflict.confirmTitle")}
        body={t("cms.conflict.confirmDesc")}
        confirmLabel={t("cms.conflict.reload")}
        onConfirm={() => {
          if (tab === "homepage") {
            void homeCms.reloadRemote();
          } else if (tab === "travel") {
            void travelCms.reloadRemote();
          } else if (tab === "pages") {
            void pagesCms.reloadRemote();
          }
          setConflictReloadDialogOpen(false);
        }}
        onClose={() => setConflictReloadDialogOpen(false)}
      />
    </div>
  );
}
