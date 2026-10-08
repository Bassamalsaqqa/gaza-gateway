import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { Field, Input, Select, Textarea, btnClass } from "@/components/kit";
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
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { useNetworkDestinationQuery } from "@/lib/network";
import { legacyDestinationPresentationByCode } from "@/lib/destination-reference";
import { NetworkBasics } from "@/components/admin/network-basics";
import { NetworkState } from "@/components/admin/network-state";
import { useSchedulesQuery } from "@/lib/schedules";
import { pageHead } from "@/lib/head";
import { publishedDestinationsEditorial } from "@/content/published/destinations-editorial";
import { publishedDestinationsPresentation } from "@/content/published/destinations-presentation";
import type {
  DestinationEditorialEntry,
  DestinationPhotoAssignment,
  TravelPoint,
} from "@/content/types";
import {
  DESTINATION_PHOTOS,
  getDestinationPhotoById,
  smallestDestinationSrc,
  type DestinationPhotoId,
} from "@/lib/destination-media";
import {
  CmsConflictBanner,
  CmsDraftBar,
  useCmsDocument,
  validateDestinationsEditorialContent,
  validateDestinationsPresentationContent,
} from "@/components/admin/cms";

type Tab = "basics" | "content" | "public" | "route" | "seo";
type Editing = "en" | "ar";

const VALID_TABS: readonly Tab[] = ["basics", "content", "public", "route", "seo"];

export const Route = createFileRoute("/{-$locale}/admin/destinations/$code")({
  validateSearch: (search: Record<string, unknown>): {
    tab?: Tab | undefined;
  } => {
    const rawTab = search["tab"];
    const tabStr = typeof rawTab === "string" ? rawTab : "";
    const tab = (VALID_TABS as readonly string[]).includes(tabStr) ? (tabStr as Tab) : undefined;
    return { tab };
  },
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: `/admin/destinations/${params.code}`,
      en: {
        title: "Destination editor — Gaza International Airport administration",
        description: "Route, editorial content, public presentation and sharing details.",
      },
      ar: {
        title: "محرّر المحطة — إدارة مطار غزة الدولي",
        description: "الخط والمحتوى التحريري والعرض البصري وتفاصيل المشاركة.",
      },
      noindex: true,
    }),
  component: AdminDestinationEditorPage,
});

function AdminDestinationEditorPage() {
  const { t, lang } = useI18n();
  const { code } = Route.useParams();
  const search = Route.useSearch();
  const { can } = useAdmin();

  const mayOpsView = can("ops.view");
  const mayContentView = can("content.view");
  const mayEditContent = can("content.edit");

  const initialTab: Tab = search.tab ?? (!mayOpsView && mayContentView ? "content" : "basics");
  const [tab, setTab] = useState<Tab>(initialTab);
  const [editing, setEditing] = useState<Editing>(lang === "ar" ? "ar" : "en");

  const [discardEditorialOpen, setDiscardEditorialOpen] = useState(false);
  const [discardPresentationOpen, setDiscardPresentationOpen] = useState(false);
  const [reloadConflictEditorialOpen, setReloadConflictEditorialOpen] = useState(false);
  const [reloadConflictPresentationOpen, setReloadConflictPresentationOpen] = useState(false);

  useEffect(() => {
    const requested = search.tab ?? (mayOpsView ? "basics" : "content");
    setTab(!mayOpsView && (requested === "basics" || requested === "route") ? "content" : requested);
  }, [search.tab, code, mayOpsView]);

  const network = useNetworkDestinationQuery(code);
  const legacyEditorial = legacyDestinationPresentationByCode(code);
  const { data: schedules = [], isPending: schedulesLoading, isError: schedulesError } = useSchedulesQuery();

  // Canonical destinations.editorial CMS hook
  const editorialCms = useCmsDocument({
    key: "destinations.editorial",
    published: publishedDestinationsEditorial,
    validate: validateDestinationsEditorialContent,
    editLang: editing,
    onInvalidField: (field) => {
      if (field.endsWith("-ar")) setEditing("ar");
      if (field.endsWith("-en")) setEditing("en");
      setTab("content");
    },
  });

  // Canonical destinations.presentation CMS hook
  const presentationCms = useCmsDocument({
    key: "destinations.presentation",
    published: publishedDestinationsPresentation,
    validate: validateDestinationsPresentationContent,
    editLang: editing,
    onInvalidField: () => setTab("content"),
  });

  const navigationBlocker = useBlocker({
    shouldBlockFn: () =>
      editorialCms.dirty ||
      presentationCms.dirty ||
      editorialCms.saving ||
      presentationCms.saving,
    enableBeforeUnload:
      editorialCms.dirty ||
      presentationCms.dirty ||
      editorialCms.saving ||
      presentationCms.saving,
    withResolver: true,
  });

  const currentEditorial: DestinationEditorialEntry | undefined = useMemo(() => {
    return editorialCms.draft.destinations.find((d) => d.code === code);
  }, [editorialCms.draft.destinations, code]);

  const currentAssignment: DestinationPhotoAssignment | undefined = useMemo(() => {
    return presentationCms.draft.assignments.find((a) => a.code === code);
  }, [presentationCms.draft.assignments, code]);

  if (!mayOpsView && !mayContentView) {
    return <AdminDenied area={t("adm.dest.title")} permission="ops.view" />;
  }

  // If code is not recognized in both operational and editorial authority
  if (!legacyEditorial && !currentEditorial) {
    return (
      <div className="space-y-4">
        <AppLink to="/admin/destinations" className={btnClass("outline", "sm")}>
          <ArrowLeft aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
          {t("adm.dest.back")}
        </AppLink>
        <AdminPanel>
          <h1 className="text-lg font-bold">{t("adm.dest.notFound")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("adm.dest.notFoundBody")}</p>
        </AdminPanel>
      </div>
    );
  }

  const dirFor = editing === "ar" ? "rtl" : "ltr";

  // Helpers to update destinations.editorial
  const updateBlurb = (text: string) => {
    editorialCms.setDraft((cur) => ({
      ...cur,
      destinations: cur.destinations.map((d) =>
        d.code === code
          ? {
              ...d,
              blurb: {
                ...d.blurb,
                [editing]: text,
              },
            }
          : d,
      ),
    }));
  };

  const updateSeo = (field: "title" | "description", text: string) => {
    editorialCms.setDraft((cur) => ({
      ...cur,
      destinations: cur.destinations.map((d) =>
        d.code === code
          ? {
              ...d,
              seo: {
                ...d.seo,
                [field]: {
                  ...d.seo[field],
                  [editing]: text,
                },
              },
            }
          : d,
      ),
    }));
  };

  const updateGoodToKnowPoint = (pointId: string, patch: Partial<TravelPoint>) => {
    editorialCms.setDraft((cur) => ({
      ...cur,
      destinations: cur.destinations.map((d) => {
        if (d.code !== code) return d;
        return {
          ...d,
          goodToKnow: d.goodToKnow.map((pt) => {
            if (pt.id !== pointId) return pt;
            return {
              ...pt,
              ...patch,
              ...(patch.text ? { text: { ...pt.text, ...patch.text } } : {}),
            };
          }),
        };
      }),
    }));
  };

  const addGoodToKnowPoint = () => {
    editorialCms.setDraft((cur) => {
      const existingIds = new Set(
        cur.destinations.flatMap((d) => d.goodToKnow.map((pt) => pt.id)),
      );
      let candidate = `pt-${code.toLowerCase()}-${Date.now().toString(36).slice(-4)}`;
      while (existingIds.has(candidate)) {
        candidate = `pt-${code.toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`;
      }
      return {
        ...cur,
        destinations: cur.destinations.map((d) => {
          if (d.code !== code) return d;
          return {
            ...d,
            goodToKnow: [
              ...d.goodToKnow,
              {
                id: candidate,
                visible: true,
                text: { en: "Point detail", ar: "تفاصيل المعلومة" },
              },
            ],
          };
        }),
      };
    });
  };

  const deleteGoodToKnowPoint = (pointId: string) => {
    editorialCms.setDraft((cur) => ({
      ...cur,
      destinations: cur.destinations.map((d) => {
        if (d.code !== code) return d;
        return {
          ...d,
          goodToKnow: d.goodToKnow.filter((pt) => pt.id !== pointId),
        };
      }),
    }));
  };

  const moveGoodToKnowPoint = (fromIndex: number, toIndex: number) => {
    editorialCms.setDraft((cur) => ({
      ...cur,
      destinations: cur.destinations.map((d) => {
        if (d.code !== code) return d;
        const pts = [...d.goodToKnow];
        if (fromIndex < 0 || fromIndex >= pts.length || toIndex < 0 || toIndex >= pts.length) {
          return d;
        }
        const temp = pts[fromIndex]!;
        pts[fromIndex] = pts[toIndex]!;
        pts[toIndex] = temp;
        return { ...d, goodToKnow: pts };
      }),
    }));
  };

  // Helper to update destinations.presentation
  const updatePresentation = (patch: Partial<DestinationPhotoAssignment>) => {
    presentationCms.setDraft((cur) => ({
      ...cur,
      assignments: cur.assignments.map((a) =>
        a.code === code ? { ...a, ...patch } : a,
      ),
    }));
  };

  const selectedPhoto = currentAssignment
    ? getDestinationPhotoById(currentAssignment.photoId)
    : null;
  const currentFocal = currentAssignment?.focalPoint ?? { x: 50, y: 50 };

  const langTabs = (
    <div role="group" aria-label={t("adm.common.english")} className="flex rounded-md border border-border">
      {(["en", "ar"] as Editing[]).map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={editing === id}
          onClick={() => setEditing(id)}
          className={`px-3 py-1.5 text-xs font-semibold first:rounded-s-md last:rounded-e-md ${
            editing === id ? "bg-brand-soft text-brand-deep" : "text-muted-foreground hover:bg-secondary"
          }`}
        >
          {t(id === "en" ? "adm.common.english" : "adm.common.arabic")}
        </button>
      ))}
    </div>
  );

  const availableTabs: { id: Tab; label: string }[] = [
    ...(mayOpsView ? [{ id: "basics" as Tab, label: t("adm.dest.tab.basics") }] : []),
    { id: "content" as Tab, label: t("cms.dest.editorialTitle") },
    ...(mayOpsView ? [{ id: "route" as Tab, label: t("adm.dest.tab.route") }] : []),
    { id: "seo" as Tab, label: t("adm.dest.tab.seo") },
  ];

  return (
    <div className="space-y-4">
      <AppLink to="/admin/destinations" className={btnClass("outline", "sm")}>
        <ArrowLeft aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
        {t("adm.dest.back")}
      </AppLink>

      <AdminPageHeader
        title={network.data ? pick(lang, network.data.city) : currentEditorial ? pick(lang, currentEditorial.seo.title) : code}
        description={network.data ? pick(lang, network.data.country) : ""}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <AdminChip tone="muted">
              <Ltr>{code}</Ltr>
            </AdminChip>
            {network.data && !network.isError ? (
              <AdminChip tone={network.data.active ? "brand" : "muted"}>
                {t(network.data.active ? "adm.common.active" : "adm.common.inactive")}
              </AdminChip>
            ) : null}
          </div>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/destinations/${code.toLowerCase()}`}
              target="_blank"
              rel="noreferrer"
              className={btnClass("outline", "sm")}
            >
              {t("adm.common.previewEn")}
            </a>
            <a
              href={`/ar/destinations/${code.toLowerCase()}`}
              target="_blank"
              rel="noreferrer"
              className={btnClass("outline", "sm")}
            >
              {t("adm.common.previewAr")}
            </a>
          </div>
        }
      />

      <AdminPanel bodyClassName="p-0">
        <AdminTabs
          label={t("adm.dest.tabs")}
          active={tab}
          onChange={(next) => { if (!editorialCms.saving && !presentationCms.saving) setTab(next as Tab); }}
          tabs={availableTabs}
        >

        <div className="p-4 space-y-6">
          {/* -------------------- BASICS TAB (Operational) -------------------- */}
          {tab === "basics" ? (
            mayOpsView ? (
              <div className="space-y-4">
                <NetworkState
                  pending={network.isPending}
                  error={network.isError}
                  onRetry={() => void network.refetch()}
                />
                {network.data ? (
                  <NetworkBasics key={code} destination={network.data} unavailable={network.isError} />
                ) : null}
              </div>
            ) : (
              <AdminDenied area={t("adm.dest.tab.basics")} permission="ops.view" />
            )
          ) : null}

          {/* -------------------- CONTENT TAB (Editorial & Presentation) -------------------- */}
          {tab === "content" ? (
            <CmsValidationFields errors={{ ...presentationCms.errors, ...editorialCms.errors }}>
            <div className="space-y-8">
              {/* Conflict Banners */}
              {editorialCms.conflict ? (
                <CmsConflictBanner
                  onReload={() => setReloadConflictEditorialOpen(true)}
                  onDismiss={editorialCms.dismissConflict}
                />
              ) : null}

              {presentationCms.conflict ? (
                <CmsConflictBanner
                  onReload={() => setReloadConflictPresentationOpen(true)}
                  onDismiss={presentationCms.dismissConflict}
                />
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                  <h2 className="text-base font-bold">{t("cms.dest.editorialTitle")}</h2>
                  <p className="text-xs text-muted-foreground">{t("cms.dest.opsNotice")}</p>
                </div>
                {langTabs}
              </div>

              {/* 1. Visual Presentation (Photo & Focal Point) */}
              {currentAssignment && selectedPhoto ? (
                <section aria-labelledby="dst-pres-heading" className="rounded-lg border border-border bg-card p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                    <h3 id="dst-pres-heading" className="text-sm font-bold">
                      {t("cms.dest.presentationTitle")}
                    </h3>
                    <CmsDraftBar
                      mayEdit={mayEditContent}
                      draftReady={presentationCms.ready}
                unavailable={Boolean(presentationCms.saveError)}
                      dirty={presentationCms.dirty}
                      savedDraft={presentationCms.savedDraft}
                      saving={presentationCms.saving}
                      previewUrlEn={`/destinations/${code.toLowerCase()}?contentPreview=1`}
                      previewUrlAr={`/ar/destinations/${code.toLowerCase()}?contentPreview=1`}
                      onSave={() => { void presentationCms.save(); }}
                      onDiscard={() => setDiscardPresentationOpen(true)}
                    />
                  </div>

                  {presentationCms.saveError ? (
                    <p role="alert" className="text-xs text-destructive">
                      <span>{presentationCms.saveError}</span>
                      <button type="button" className={btnClass("ghost", "sm")} onClick={() => { void presentationCms.retryRead(); }}>{t("cms.retry")}</button>
                    </p>
                  ) : null}

                  <div className="grid gap-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
                    <div>
                      <img
                        data-admin-destination-preview={code}
                        src={smallestDestinationSrc(selectedPhoto)}
                        alt=""
                        style={{ objectPosition: `${currentFocal.x}% ${currentFocal.y}%` }}
                        className="aspect-[3/2] w-full rounded-md border border-border object-cover"
                      />
                    </div>
                    <div className="space-y-3">
                      <Field label={t("cms.dest.photoSelect")} htmlFor={`dst-pres-${code}-photo`}>
                        <Select
                          id={`dst-pres-${code}-photo`}
                          dir="ltr"
                          value={currentAssignment.photoId}
                          disabled={!mayEditContent || !presentationCms.ready || presentationCms.saving}
                          onChange={(e) =>
                            updatePresentation({ photoId: e.target.value as DestinationPhotoId })
                          }
                        >
                          {Object.values(DESTINATION_PHOTOS).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.cityNameEn} ({p.cityCode}) — {p.id}
                            </option>
                          ))}
                        </Select>
                      </Field>

                      <div className="grid grid-cols-2 gap-2">
                        <Field label={t("cms.dest.focalPointX")} htmlFor={`dst-pres-${code}-focal`}>
                          <Input
                            id={`dst-pres-${code}-focal`}
                            aria-invalid={Boolean(presentationCms.errors[`dst-pres-${code}-focal`])}
                            aria-describedby={presentationCms.errors[`dst-pres-${code}-focal`] ? `dst-pres-${code}-focal-err` : undefined}
                            type="number"
                            min={0}
                            max={100}
                            dir="ltr"
                            value={currentFocal.x}
                            disabled={!mayEditContent || !presentationCms.ready || presentationCms.saving}
                            onChange={(e) =>
                              updatePresentation({
                                focalPoint: {
                                  ...currentFocal,
                                  x: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                                },
                              })
                            }
                          />
                        </Field>
                        <Field label={t("cms.dest.focalPointY")} htmlFor={`dst-pres-${code}-focal-y`}>
                          <Input
                            id={`dst-pres-${code}-focal-y`}
                            aria-invalid={Boolean(presentationCms.errors[`dst-pres-${code}-focal`])}
                            aria-describedby={presentationCms.errors[`dst-pres-${code}-focal`] ? `dst-pres-${code}-focal-err` : undefined}
                            type="number"
                            min={0}
                            max={100}
                            dir="ltr"
                            value={currentFocal.y}
                            disabled={!mayEditContent || !presentationCms.ready || presentationCms.saving}
                            onChange={(e) =>
                              updatePresentation({
                                focalPoint: {
                                  ...currentFocal,
                                  y: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                                },
                              })
                            }
                          />
                        </Field>
                      </div>

                      {(() => {
                        const focalErr = presentationCms.errors[`dst-pres-${code}-focal`];
                        return focalErr ? (
                          <p id={`dst-pres-${code}-focal-err`} role="alert" className="text-xs text-destructive">
                            {t(focalErr)}
                          </p>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </section>
              ) : null}

              {/* 2. Destination Editorial Narrative (Blurb & Good to know) */}
              {currentEditorial ? (
                <section aria-labelledby="dst-ed-heading" className="rounded-lg border border-border bg-card p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                    <div className="flex items-center gap-2">
                      <h3 id="dst-ed-heading" className="text-sm font-bold">
                        {t("cms.dest.editorialTitle")}
                      </h3>
                      <BilingualStatus
                        missingAr={!currentEditorial.blurb.ar?.trim() || !currentEditorial.seo.title.ar?.trim()}
                        missingEn={!currentEditorial.blurb.en?.trim() || !currentEditorial.seo.title.en?.trim()}
                      />
                    </div>
                    <CmsDraftBar
                      mayEdit={mayEditContent}
                      draftReady={editorialCms.ready}
                unavailable={Boolean(editorialCms.saveError)}
                      dirty={editorialCms.dirty}
                      savedDraft={editorialCms.savedDraft}
                      saving={editorialCms.saving}
                      previewUrlEn={`/destinations/${code.toLowerCase()}?contentPreview=1`}
                      previewUrlAr={`/ar/destinations/${code.toLowerCase()}?contentPreview=1`}
                      onSave={() => { void editorialCms.save(); }}
                      onDiscard={() => setDiscardEditorialOpen(true)}
                    />
                  </div>

                  {editorialCms.saveError ? (
                    <p role="alert" className="text-xs text-destructive">
                      <span>{editorialCms.saveError}</span>
                      <button type="button" className={btnClass("ghost", "sm")} onClick={() => { void editorialCms.retryRead(); }}>{t("cms.retry")}</button>
                    </p>
                  ) : null}

                  {/* Blurb */}
                  {(() => {
                    const blurbErr = editorialCms.errors[`dst-ed-${code}-blurb-${editing}`];
                    return (
                      <AdminField
                        label={t("cms.dest.blurb")}
                        htmlFor={`dst-ed-${code}-blurb-${editing}`}
                      >
                        <Textarea
                          id={`dst-ed-${code}-blurb-${editing}`}
                          dir={dirFor}
                          className="min-h-24"
                          value={currentEditorial.blurb[editing] ?? ""}
                          readOnly={!mayEditContent || !editorialCms.ready || editorialCms.saving}
                          aria-invalid={blurbErr ? "true" : "false"}
                          aria-describedby={blurbErr ? `dst-ed-${code}-blurb-${editing}-err` : undefined}
                          onChange={(e) => updateBlurb(e.target.value)}
                        />
                        {blurbErr ? (
                          <p id={`dst-ed-${code}-blurb-${editing}-err`} role="alert" className="text-xs text-destructive">
                            {t(blurbErr)}
                          </p>
                        ) : null}
                      </AdminField>
                    );
                  })()}

                  {/* SEO in Content Tab */}
                  <div className="grid gap-3 sm:grid-cols-2 pt-2">
                    {(() => {
                      const seoTitleErr = editorialCms.errors[`dst-ed-${code}-seo-title-${editing}`];
                      return (
                        <AdminField
                          label={t("adm.dest.seoTitle")}
                          htmlFor={`dst-ed-${code}-seo-title-${editing}`}
                        >
                          <Input
                            id={`dst-ed-${code}-seo-title-${editing}`}
                            dir={dirFor}
                            value={currentEditorial.seo.title[editing] ?? ""}
                            readOnly={!mayEditContent || !editorialCms.ready || editorialCms.saving}
                            aria-invalid={seoTitleErr ? "true" : "false"}
                            onChange={(e) => updateSeo("title", e.target.value)}
                          />
                          {seoTitleErr ? (
                            <p role="alert" className="text-xs text-destructive">
                              {t(seoTitleErr)}
                            </p>
                          ) : null}
                        </AdminField>
                      );
                    })()}

                    {(() => {
                      const seoDescErr = editorialCms.errors[`dst-ed-${code}-seo-desc-${editing}`];
                      return (
                        <AdminField
                          label={t("adm.dest.seoDesc")}
                          htmlFor={`dst-ed-${code}-seo-desc-${editing}`}
                        >
                          <Input
                            id={`dst-ed-${code}-seo-desc-${editing}`}
                            dir={dirFor}
                            value={currentEditorial.seo.description[editing] ?? ""}
                            readOnly={!mayEditContent || !editorialCms.ready || editorialCms.saving}
                            aria-invalid={seoDescErr ? "true" : "false"}
                            onChange={(e) => updateSeo("description", e.target.value)}
                          />
                          {seoDescErr ? (
                            <p role="alert" className="text-xs text-destructive">
                              {t(seoDescErr)}
                            </p>
                          ) : null}
                        </AdminField>
                      );
                    })()}
                  </div>

                  {/* Good to know points */}
                  <div className="space-y-3 pt-3 border-t border-border">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold">{t("cms.dest.goodToKnow")}</h4>
                      <PermissionButton
                        allowed={mayEditContent && editorialCms.ready && !editorialCms.saving}
                        reason={t("adm.edit.readOnly")}
                        size="sm"
                        variant="outline"
                        onClick={addGoodToKnowPoint}
                      >
                        <Plus aria-hidden="true" className="size-3.5" />
                        <span>{t("cms.dest.addPoint")}</span>
                      </PermissionButton>
                    </div>

                    {currentEditorial.goodToKnow.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{t("cms.dest.emptyPoints")}</p>
                    ) : (
                      <ul className="space-y-2">
                        {currentEditorial.goodToKnow.map((pt, idx) => {
                          const ptErr = editorialCms.errors[`dst-ed-${code}-pt-${pt.id}-${editing}`];
                          const canMoveUp = idx > 0 && mayEditContent && !editorialCms.saving;
                          const canMoveDown =
                            idx < currentEditorial.goodToKnow.length - 1 &&
                            mayEditContent &&
                            !editorialCms.saving;
                          return (
                            <li
                              key={pt.id}
                              className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2.5 bg-background"
                            >
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <input
                                    type="checkbox"
                                    checked={pt.visible}
                                    disabled={!mayEditContent || !editorialCms.ready || editorialCms.saving}
                                    onChange={(e) =>
                                      updateGoodToKnowPoint(pt.id, { visible: e.target.checked })
                                    }
                                    className="rounded border-border"
                                  />
                                  <span className="sr-only">{t("cms.dest.pointVisibility")}</span>
                                </label>
                                <div className="min-w-0 flex-1">
                                  <Input
                                    id={`dst-ed-${code}-pt-${pt.id}-${editing}`}
                                    dir={dirFor}
                                    value={pt.text[editing] ?? ""}
                                    placeholder={t("cms.dest.goodToKnow")}
                                    readOnly={!mayEditContent || !editorialCms.ready || editorialCms.saving}
                                    aria-invalid={ptErr ? "true" : "false"}
                                    onChange={(e) =>
                                      updateGoodToKnowPoint(pt.id, {
                                        text: { [editing]: e.target.value } as Record<Editing, string>,
                                      })
                                    }
                                    className="h-8 text-xs"
                                  />
                                  {ptErr ? (
                                    <p role="alert" className="text-[11px] text-destructive mt-0.5">
                                      {t(ptErr)}
                                    </p>
                                  ) : null}
                                </div>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  aria-label="Move point up"
                                  disabled={!canMoveUp}
                                  onClick={() => moveGoodToKnowPoint(idx, idx - 1)}
                                  className={btnClass("ghost", "sm")}
                                >
                                  <ChevronUp aria-hidden="true" className="size-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Move point down"
                                  disabled={!canMoveDown}
                                  onClick={() => moveGoodToKnowPoint(idx, idx + 1)}
                                  className={btnClass("ghost", "sm")}
                                >
                                  <ChevronDown aria-hidden="true" className="size-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={t("cms.dest.deletePoint")}
                                  disabled={!mayEditContent || !editorialCms.ready || editorialCms.saving}
                                  onClick={() => deleteGoodToKnowPoint(pt.id)}
                                  className={btnClass("ghost", "sm", "text-destructive hover:bg-destructive/10")}
                                >
                                  <Trash2 aria-hidden="true" className="size-3.5" />
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </section>
              ) : null}
            </div>
            </CmsValidationFields>
          ) : null}

          {/* -------------------- ROUTE TAB (Operational Schedules) -------------------- */}
          {tab === "route" ? (
            mayOpsView ? (
              <div className="space-y-4">
                <h2 className="text-sm font-bold">{t("adm.dest.related")}</h2>
                <p className="text-xs text-muted-foreground">{t("adm.sch.planningNote")}</p>
                {schedulesLoading ? (
                  <p role="status">{t("adm.ops.loading")}</p>
                ) : schedulesError ? (
                  <p role="alert">{t("adm.ops.loadError")}</p>
                ) : schedules.filter((s) => s.destination === code).length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("adm.dest.relatedEmpty")}</p>
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border text-sm">
                    {schedules
                      .filter((s) => s.destination === code)
                      .map((s) => (
                        <li key={s.id} className="space-y-2 px-3 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Ltr className="font-bold">
                              <span>{s.number}</span> ·{" "}
                              {s.direction === "out" ? `GZA → ${s.destination}` : `${s.destination} → GZA`}
                            </Ltr>
                            <AdminChip tone={s.active ? "brand" : "muted"}>
                              {t(s.active ? "adm.common.active" : "adm.common.inactive")}
                            </AdminChip>
                          </div>
                          <dl className="grid gap-2 text-xs sm:grid-cols-2">
                            <div>
                              <dt className="font-semibold">{t("adm.sch.days")}</dt>
                              <dd>{s.days.map((day) => t(`adm.day.${day}`)).join(" · ")}</dd>
                            </div>
                            <div>
                              <dt className="font-semibold">
                                {t("adm.sch.depart")} / {t("adm.sch.arrive")}
                              </dt>
                              <dd>
                                <Ltr>
                                  {s.departTime} → {s.arriveTime}
                                </Ltr>
                              </dd>
                            </div>
                            <div>
                              <dt className="font-semibold">{t("adm.col.aircraft")}</dt>
                              <dd>
                                <Ltr>{s.aircraft}</Ltr>
                              </dd>
                            </div>
                            <div>
                              <dt className="font-semibold">
                                {t("adm.sch.from")} / {t("adm.sch.until")}
                              </dt>
                              <dd>
                                <Ltr>
                                  {s.from} → {s.until}
                                </Ltr>
                              </dd>
                            </div>
                            <div>
                              <dt className="font-semibold">{t("adm.sch.exceptions")}</dt>
                              <dd>
                                <Ltr>{s.exceptions.length}</Ltr>
                              </dd>
                            </div>
                          </dl>
                        </li>
                      ))}
                  </ul>
                )}
                <AppLink
                  to="/admin/schedules"
                  search={{ destination: code }}
                  className={btnClass("outline", "sm")}
                >
                  {t("adm.sch.title")}
                </AppLink>
              </div>
            ) : (
              <AdminDenied area={t("adm.dest.tab.route")} permission="ops.view" />
            )
          ) : null}

          {/* -------------------- SEO TAB -------------------- */}
          {tab === "seo" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{t("network.seoReadonly")}</p>
                {langTabs}
              </div>
              <Field label={t("adm.dest.seoTitle")} htmlFor="de-seot">
                <Input
                  id="de-seot"
                  dir={dirFor}
                  value={currentEditorial?.seo.title[editing] ?? legacyEditorial?.seoTitle ?? ""}
                  readOnly
                />
              </Field>
              <Field label={t("adm.dest.seoDesc")} htmlFor="de-seod">
                <Textarea
                  id="de-seod"
                  dir={dirFor}
                  value={currentEditorial?.seo.description[editing] ?? legacyEditorial?.seoDescription ?? ""}
                  readOnly
                />
              </Field>
              <Field label={t("adm.dest.socialImage")} htmlFor="de-social">
                <Input id="de-social" dir="ltr" value="/social/gaza-airport.jpg" readOnly />
              </Field>
            </div>
          ) : null}
        </div>
        </AdminTabs>
      </AdminPanel>

      {/* Navigation blocker confirmation */}
      <ConfirmDialog
        cancelLabel={t("a2.cancel")}
        open={navigationBlocker.status === "blocked"}
        title={t("cms.unsaved.title")}
        body={t("cms.unsaved.desc")}
        confirmLabel={t("cms.unsaved.leave")}
        onConfirm={() => {
          if (!editorialCms.saving && !presentationCms.saving) {
            navigationBlocker.proceed?.();
          }
        }}
        onClose={() => navigationBlocker.reset?.()}
      />

      {/* Discard confirmation: Editorial */}
      <ConfirmDialog
        cancelLabel={t("a2.cancel")}
        open={discardEditorialOpen}
        title={t("cms.discard.title")}
        body={t("cms.discard.desc")}
        confirmLabel={t("cms.discard.confirm")}
        onConfirm={() => {
          void editorialCms.discard();
          setDiscardEditorialOpen(false);
        }}
        onClose={() => setDiscardEditorialOpen(false)}
      />

      {/* Discard confirmation: Presentation */}
      <ConfirmDialog
        cancelLabel={t("a2.cancel")}
        open={discardPresentationOpen}
        title={t("cms.discard.title")}
        body={t("cms.discard.desc")}
        confirmLabel={t("cms.discard.confirm")}
        onConfirm={() => {
          void presentationCms.discard();
          setDiscardPresentationOpen(false);
        }}
        onClose={() => setDiscardPresentationOpen(false)}
      />

      {/* Conflict reload confirmation: Editorial */}
      <ConfirmDialog
        cancelLabel={t("a2.cancel")}
        open={reloadConflictEditorialOpen}
        title={t("cms.conflict.confirmTitle")}
        body={t("cms.conflict.confirmDesc")}
        confirmLabel={t("cms.conflict.reload")}
        onConfirm={() => {
          void editorialCms.reloadRemote();
          setReloadConflictEditorialOpen(false);
        }}
        onClose={() => setReloadConflictEditorialOpen(false)}
      />

      {/* Conflict reload confirmation: Presentation */}
      <ConfirmDialog
        cancelLabel={t("a2.cancel")}
        open={reloadConflictPresentationOpen}
        title={t("cms.conflict.confirmTitle")}
        body={t("cms.conflict.confirmDesc")}
        confirmLabel={t("cms.conflict.reload")}
        onConfirm={() => {
          void presentationCms.reloadRemote();
          setReloadConflictPresentationOpen(false);
        }}
        onClose={() => setReloadConflictPresentationOpen(false)}
      />
    </div>
  );
}
