import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { Field, Input, Select, Textarea, btnClass } from "@/components/kit";
import {
  AdminChip,
  AdminPageHeader,
  AdminPanel,
  AdminTabs,
  Ltr,
  PermissionButton,
} from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { useNetworkDestinationQuery } from "@/lib/network";
import { legacyDestinationPresentationByCode } from "@/lib/destination-reference";
import { NetworkBasics } from "@/components/admin/network-basics";
import { NetworkState } from "@/components/admin/network-state";
import { useSchedulesQuery } from "@/lib/schedules";
import { pageHead } from "@/lib/head";
import { contentRepository } from "@/content/repository";
import { publishedDestinationsPresentation } from "@/content/published/destinations-presentation";
import type { DestinationsPresentationContent, DestinationPhotoAssignment } from "@/content/types";
import {
  DESTINATION_PHOTOS,
  getDestinationPhotoById,
  smallestDestinationSrc,
  type DestinationPhotoId,
  type DestinationCode,
} from "@/lib/destination-media";


export const Route = createFileRoute("/{-$locale}/admin/destinations/$code")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: `/admin/destinations/${params.code}`,
      en: {
        title: "Destination editor — Gaza International Airport administration",
        description: "Route, public page and sharing details for one Palestinian Airlines destination.",
      },
      ar: {
        title: "محرّر المحطة — إدارة مطار غزة الدولي",
        description: "الخط والصفحة العامة وتفاصيل المشاركة لمحطة واحدة من الخطوط الجوية الفلسطينية.",
      },
      noindex: true,
    }),
  component: AdminDestinationEditorPage,
});

type Tab = "basics" | "public" | "route" | "seo";
type Editing = "en" | "ar";

function AdminDestinationEditorPage() {
  const { t, lang } = useI18n();
  const { code } = Route.useParams();
  const { can, toast } = useAdmin();
  const network = useNetworkDestinationQuery(code);
  const editorial = legacyDestinationPresentationByCode(code);
  const { data: schedules = [], isPending: schedulesLoading, isError: schedulesError } = useSchedulesQuery();

  const [tab, setTab] = useState<Tab>("basics");
  const [editing, setEditing] = useState<Editing>(lang === "ar" ? "ar" : "en");

  const [presentationDraft, setPresentationDraft] = useState<DestinationsPresentationContent>(publishedDestinationsPresentation);
  const [savedPresentation, setSavedPresentation] = useState<DestinationsPresentationContent | null>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaSaving, setMediaSaving] = useState(false);
  const [mediaError, setMediaError] = useState(false);

  useEffect(() => {
    let alive = true;
    void contentRepository.getDraft("destinations.presentation").then((d) => {
      if (!alive) return;
      setSavedPresentation(d);
      setPresentationDraft(d ?? publishedDestinationsPresentation);
      setMediaReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const currentAssignment: DestinationPhotoAssignment = useMemo(() => {
    return (
      presentationDraft.assignments.find((a) => a.code === code) ?? {
        code: code as DestinationCode,
        photoId: `city-${code.toLowerCase()}` as DestinationPhotoId,
        focalPoint: { x: 50, y: 50 },
      }
    );
  }, [presentationDraft.assignments, code]);

  const selectedPhoto = getDestinationPhotoById(currentAssignment.photoId) ?? DESTINATION_PHOTOS["city-amman"];
  const currentFocal = currentAssignment.focalPoint ?? { x: 50, y: 50 };

  const updateAssignment = (patch: Partial<DestinationPhotoAssignment>) => {
    setPresentationDraft((cur) => ({
      ...cur,
      assignments: cur.assignments.map((a) =>
        a.code === code ? { ...a, ...patch } : a
      ),
    }));
  };

  const presentationDirty =
    JSON.stringify(presentationDraft) !==
    JSON.stringify(savedPresentation ?? publishedDestinationsPresentation);

  const mayEditContent = can("content.edit");

  const saveImageDraft = async () => {
    if (!mayEditContent || !mediaReady || mediaSaving) return;
    setMediaSaving(true);
    setMediaError(false);
    try {
      await contentRepository.saveDraft("destinations.presentation", presentationDraft);
      setSavedPresentation(presentationDraft);
      toast(t("a2.saved"));
    } catch {
      setMediaError(true);
    } finally {
      setMediaSaving(false);
    }
  };

  const discardImageDraft = async () => {
    if (!mayEditContent || !mediaReady || mediaSaving) return;
    setMediaError(false);
    try {
      await contentRepository.discardDraft("destinations.presentation");
      setSavedPresentation(null);
      setPresentationDraft(publishedDestinationsPresentation);
      toast(pick(lang, { en: "Draft discarded", ar: "تم تجاهل المسودة" }));
    } catch {
      setMediaError(true);
    }
  };

  if (!can("ops.view")) return <AdminDenied area={t("adm.dest.title")} permission="ops.view" />;

  if (!editorial) {
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

  const dirFor = editing === "ar" ? "rtl" : "ltr";

  return (
    <div className="space-y-4">
      <AppLink to="/admin/destinations" className={btnClass("outline", "sm")}>
        <ArrowLeft aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
        {t("adm.dest.back")}
      </AppLink>

      <AdminPageHeader
        title={network.data ? pick(lang, network.data.city) : code}
        description={network.data ? pick(lang, network.data.country) : ""}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <AdminChip tone="muted">
              <Ltr>{code}</Ltr>
            </AdminChip>
            {network.data && !network.isError ? <AdminChip tone={network.data.active ? "brand" : "muted"}>{t(network.data.active ? "adm.common.active" : "adm.common.inactive")}</AdminChip> : null}
          </div>
        }
        action={
          <>
            <a
              href={`/destinations/${code}`}
              target="_blank"
              rel="noreferrer"
              className={btnClass("outline", "sm")}
            >
              {t("adm.common.previewEn")}
            </a>
            <a
              href={`/ar/destinations/${code}`}
              target="_blank"
              rel="noreferrer"
              className={btnClass("outline", "sm")}
            >
              {t("adm.common.previewAr")}
            </a>
          </>
        }
      />

      <AdminPanel bodyClassName="p-0">
        <AdminTabs
          label={t("adm.dest.tabs")}
          active={tab}
          onChange={setTab}
          tabs={[
            { id: "basics" as Tab, label: t("adm.dest.tab.basics") },
            { id: "public" as Tab, label: t("adm.dest.tab.public") },
            { id: "route" as Tab, label: t("adm.dest.tab.route") },
            { id: "seo" as Tab, label: t("adm.dest.tab.seo") },
          ]}
        />

        <div className="p-4">
          {tab === "basics" ? <>
            <NetworkState pending={network.isPending} error={network.isError} onRetry={() => void network.refetch()} />
            {network.data ? <NetworkBasics key={code} destination={network.data} unavailable={network.isError} /> : null}
          </> : null}

          {tab === "public" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold">{t("adm.dest.tab.public")}</h2>
                {langTabs}
              </div>

              <div className="grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("adm.dest.hero")}
                  </p>
                  <img
                    data-admin-destination-preview={code}
                    src={smallestDestinationSrc(selectedPhoto)}
                    alt=""
                    style={{ objectPosition: `${currentFocal.x}% ${currentFocal.y}%` }}
                    className="aspect-[3/2] w-full rounded-md border border-border object-cover"
                  />
                  <div className="space-y-2">
                    <Field label={pick(lang, { en: "Approved city photograph", ar: "صورة المدينة المعتمدة" })} htmlFor="de-photo">
                      <Select
                        id="de-photo"
                        dir="ltr"
                        value={currentAssignment.photoId}
                        onChange={(e) => updateAssignment({ photoId: e.target.value as DestinationPhotoId })}
                      >
                        {Object.values(DESTINATION_PHOTOS).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.cityNameEn} ({p.cityCode}) — {p.id}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <div className="grid grid-cols-2 gap-2">
                      <Field label={pick(lang, { en: "Focal X (%)", ar: "مركز الصورة أفقي (%)" })} htmlFor="de-focal-x">
                        <Input
                          id="de-focal-x"
                          type="number"
                          min={0}
                          max={100}
                          dir="ltr"
                          value={currentFocal.x}
                          onChange={(e) => updateAssignment({ focalPoint: { ...currentFocal, x: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } })}
                        />
                      </Field>
                      <Field label={pick(lang, { en: "Focal Y (%)", ar: "مركز الصورة عمودي (%)" })} htmlFor="de-focal-y">
                        <Input
                          id="de-focal-y"
                          type="number"
                          min={0}
                          max={100}
                          dir="ltr"
                          value={currentFocal.y}
                          onChange={(e) => updateAssignment({ focalPoint: { ...currentFocal, y: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } })}
                        />
                      </Field>
                    </div>

                    <div className="rounded-md border border-border/80 bg-secondary/50 p-2.5 text-xs text-muted-foreground">
                      <p className="font-semibold text-foreground">
                        {savedPresentation
                          ? pick(lang, { en: "Draft active (stored in this browser, not published)", ar: "مسودة مفعلة (محفوظة في هذا المتصفح فقط ولم تُنشر)" })
                          : pick(lang, { en: "Using published destination photograph", ar: "تُستخدم صورة الوجهة المنشورة" })}
                      </p>
                      <p className="mt-1">
                        {pick(lang, {
                          en: "Saving a draft preserves your selection in browser storage for preview. Production deployment requires code release.",
                          ar: "حفظ المسودة يبقي اختيارك في ذاكرة المتصفح للمعاينة فقط. نشر التغييرات للإنتاج يتطلب إصداراً في الكود.",
                        })}
                      </p>
                    </div>

                    {mediaError && (
                      <p role="alert" className="text-xs font-semibold text-destructive">
                        {pick(lang, { en: "Failed to persist draft to storage.", ar: "فشل حفظ المسودة في الذاكرة المحلية." })}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      <PermissionButton
                        allowed={mayEditContent && mediaReady && presentationDirty && !mediaSaving}
                        reason={t("adm.edit.readOnly")}
                        onClick={() => { void saveImageDraft(); }}
                      >
                        {pick(lang, { en: "Save image draft", ar: "حفظ مسودة الصورة" })}
                      </PermissionButton>

                      <a
                        href={`/destinations/${code}?contentPreview=1`}
                        target="_blank"
                        rel="noreferrer"
                        className={btnClass("outline", "sm")}
                      >
                        {t("adm.common.previewEn")} ({pick(lang, { en: "Draft", ar: "مسودة" })})
                      </a>
                      <a
                        href={`/ar/destinations/${code}?contentPreview=1`}
                        target="_blank"
                        rel="noreferrer"
                        className={btnClass("outline", "sm")}
                      >
                        {t("adm.common.previewAr")} ({pick(lang, { en: "Draft", ar: "مسودة" })})
                      </a>

                      <PermissionButton
                        allowed={mayEditContent && mediaReady && savedPresentation !== null && !mediaSaving}
                        reason={t("adm.edit.readOnly")}
                        onClick={() => { void discardImageDraft(); }}
                      >
                        {pick(lang, { en: "Discard draft", ar: "تراجع عن المسودة" })}
                      </PermissionButton>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">{t("network.publicReadonly")}</p>
                  <Field label={t("adm.dest.description")} htmlFor="de-desc">
                    <Textarea id="de-desc" dir={dirFor} className="min-h-28" value={editorial.blurb[editing]} readOnly />
                  </Field>
                  <h3 className="text-sm font-bold">{t("adm.dest.goodToKnow")}</h3>
                  <ul className="space-y-2 text-sm">{editorial.goodToKnow.map((item, index) => <li key={index} dir={dirFor}>{item[editing]}</li>)}</ul>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "route" ? (
            <div className="space-y-4">
              <h2 className="text-sm font-bold">{t("adm.dest.related")}</h2>
              <p className="text-xs text-muted-foreground">{t("adm.sch.planningNote")}</p>
              {schedulesLoading ? <p role="status">{t("adm.ops.loading")}</p> : schedulesError ? <p role="alert">{t("adm.ops.loadError")}</p> : schedules.filter(s => s.destination === code).length === 0 ? <p className="text-sm text-muted-foreground">{t("adm.dest.relatedEmpty")}</p> : (
                <ul className="divide-y divide-border rounded-md border border-border text-sm">
                  {schedules.filter(s => s.destination === code).map(s => <li key={s.id} className="space-y-2 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><Ltr className="font-bold"><span>{s.number}</span> · {s.direction === "out" ? `GZA → ${s.destination}` : `${s.destination} → GZA`}</Ltr><AdminChip tone={s.active ? "brand" : "muted"}>{t(s.active ? "adm.common.active" : "adm.common.inactive")}</AdminChip></div>
                    <dl className="grid gap-2 text-xs sm:grid-cols-2">
                      <div><dt className="font-semibold">{t("adm.sch.days")}</dt><dd>{s.days.map(day => t(`adm.day.${day}`)).join(" · ")}</dd></div>
                      <div><dt className="font-semibold">{t("adm.sch.depart")} / {t("adm.sch.arrive")}</dt><dd><Ltr>{s.departTime} → {s.arriveTime}</Ltr></dd></div>
                      <div><dt className="font-semibold">{t("adm.col.aircraft")}</dt><dd><Ltr>{s.aircraft}</Ltr></dd></div>
                      <div><dt className="font-semibold">{t("adm.sch.from")} / {t("adm.sch.until")}</dt><dd><Ltr>{s.from} → {s.until}</Ltr></dd></div>
                      <div><dt className="font-semibold">{t("adm.sch.exceptions")}</dt><dd><Ltr>{s.exceptions.length}</Ltr></dd></div>
                    </dl>
                  </li>)}
                </ul>
              )}
              <AppLink to="/admin/schedules" search={{ destination: code }} className={btnClass("outline", "sm")}>{t("adm.sch.title")}</AppLink>
            </div>
          ) : null}
          {tab === "seo" ? <div className="space-y-4">
            <p className="text-xs text-muted-foreground">{t("network.seoReadonly")}</p>
            <Field label={t("adm.dest.seoTitle")} htmlFor="de-seot"><Input id="de-seot" dir="ltr" value={editorial.seoTitle} readOnly /></Field>
            <Field label={t("adm.dest.seoDesc")} htmlFor="de-seod"><Textarea id="de-seod" dir="ltr" value={editorial.seoDescription} readOnly /></Field>
            <Field label={t("adm.dest.socialImage")} htmlFor="de-social"><Input id="de-social" dir="ltr" value="/social/gaza-airport.jpg" readOnly /></Field>
          </div> : null}
        </div>
      </AdminPanel>
    </div>
  );
}
