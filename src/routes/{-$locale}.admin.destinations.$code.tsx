import { Switch } from "@/components/ui/switch";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { Field, Input, Select, Textarea, btnClass } from "@/components/kit";
import {
  AdminChip,
  AdminPageHeader,
  AdminPanel,
  AdminStickyActions,
  AdminTabs,
  BilingualStatus,
  Ltr,
  PermissionButton,
} from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import type { DestinationConfig } from "@/lib/admin-ops";
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
  const { can, ops, patchOps, toast } = useAdmin();
  const { data: schedules = [], isPending: schedulesLoading, isError: schedulesError } = useSchedulesQuery();

  const current = useMemo(() => ops.destinations.find((d) => d.code === code) ?? null, [ops.destinations, code]);
  const [draft, setDraft] = useState<DestinationConfig | null>(current);
  const [loaded, setLoaded] = useState(code);
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
    setMediaSaving(true);
    setMediaError(false);
    try {
      await contentRepository.saveDraft("destinations.presentation", presentationDraft);
      setSavedPresentation(presentationDraft);
      toast(t("a2.saved") || "Image draft saved locally");
    } catch {
      setMediaError(true);
    } finally {
      setMediaSaving(false);
    }
  };

  const discardImageDraft = async () => {
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

  if (code !== loaded) {
    setLoaded(code);
    setDraft(current);
  }

  const mayEdit = can("ops.edit");

  if (!can("ops.view")) return <AdminDenied area={t("adm.dest.title")} permission="ops.view" />;

  if (!draft) {
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

  const set = (patch: Partial<DestinationConfig>) => setDraft({ ...draft, ...patch });

  const save = () => {
    patchOps("destinations", ops.destinations.map((d) => (d.code === draft.code ? draft : d)));
    toast(t("adm.dest.saved", { code: draft.code }));
  };

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
        title={lang === "ar" ? draft.cityAr : draft.cityEn}
        description={lang === "ar" ? draft.countryAr : draft.countryEn}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <AdminChip tone="muted">
              <Ltr>{draft.code}</Ltr>
            </AdminChip>
            <AdminChip tone={draft.published ? "brand" : "warn"}>
              {t(draft.published ? "adm.dest.published" : "adm.content.draft")}
            </AdminChip>
            {draft.featured ? <AdminChip tone="info">{t("adm.dest.featured")}</AdminChip> : null}
            <BilingualStatus missingAr={!draft.descAr} />
          </div>
        }
        action={
          <>
            <a
              href={`/destinations/${draft.code}`}
              target="_blank"
              rel="noreferrer"
              className={btnClass("outline", "sm")}
            >
              {t("adm.common.previewEn")}
            </a>
            <a
              href={`/ar/destinations/${draft.code}`}
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
          {tab === "basics" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold">{t("adm.dest.tab.basics")}</h2>
                {langTabs}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("adm.dest.iata")} htmlFor="de-code">
                  <Input id="de-code" dir="ltr" value={draft.code} readOnly />
                </Field>
                <Field label={t("adm.dest.tz")} htmlFor="de-tz">
                  <Input id="de-tz" dir="ltr" value={draft.tz} onChange={(e) => set({ tz: e.target.value })} />
                </Field>
                <Field label={t("adm.dest.airportName")} htmlFor="de-name">
                  <Input
                    id="de-name"
                    dir={dirFor}
                    value={editing === "ar" ? draft.nameAr : draft.nameEn}
                    onChange={(e) => set(editing === "ar" ? { nameAr: e.target.value } : { nameEn: e.target.value })}
                  />
                </Field>
                <Field label={t("adm.dest.city")} htmlFor="de-city">
                  <Input
                    id="de-city"
                    dir={dirFor}
                    value={editing === "ar" ? draft.cityAr : draft.cityEn}
                    onChange={(e) => set(editing === "ar" ? { cityAr: e.target.value } : { cityEn: e.target.value })}
                  />
                </Field>
                <Field label={t("adm.dest.country")} htmlFor="de-country">
                  <Input
                    id="de-country"
                    dir={dirFor}
                    value={editing === "ar" ? draft.countryAr : draft.countryEn}
                    onChange={(e) =>
                      set(editing === "ar" ? { countryAr: e.target.value } : { countryEn: e.target.value })
                    }
                  />
                </Field>
                <Field label={t("adm.dest.duration")} htmlFor="de-dur">
                  <Input
                    id="de-dur"
                    dir="ltr"
                    type="number"
                    min={30}
                    value={draft.flightMinutes}
                    onChange={(e) => set({ flightMinutes: Number(e.target.value) || 0 })}
                  />
                </Field>
              </div>
            </div>
          ) : null}

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
                    data-admin-destination-preview={draft.code}
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
                      <p className="text-xs font-semibold text-destructive">
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
                        href={`/destinations/${draft.code}?contentPreview=1`}
                        target="_blank"
                        rel="noreferrer"
                        className={btnClass("outline", "sm")}
                      >
                        {t("adm.common.previewEn")} ({pick(lang, { en: "Draft", ar: "مسودة" })})
                      </a>
                      <a
                        href={`/ar/destinations/${draft.code}?contentPreview=1`}
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
                  <Field label={t("adm.dest.description")} htmlFor="de-desc">
                    <Textarea
                      id="de-desc"
                      dir={dirFor}
                      className="min-h-28"
                      value={editing === "ar" ? draft.descAr : draft.descEn}
                      onChange={(e) => set(editing === "ar" ? { descAr: e.target.value } : { descEn: e.target.value })}
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t("adm.dest.priceFrom")} htmlFor="de-price">
                      <Input
                        id="de-price"
                        dir="ltr"
                        type="number"
                        min={0}
                        value={draft.priceFrom}
                        onChange={(e) => set({ priceFrom: Number(e.target.value) || 0 })}
                      />
                    </Field>
                    <div className="flex flex-col justify-center gap-3 pt-4">
                      <div className="flex items-center gap-2.5">
                        <Switch
                          id="dest-featured"
                          checked={draft.featured}
                          onCheckedChange={(val) => set({ featured: val })}
                        />
                        <label htmlFor="dest-featured" className="text-sm font-semibold cursor-pointer select-none">
                          {t("adm.dest.featured")}
                        </label>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Switch
                          id="dest-published"
                          checked={draft.published}
                          onCheckedChange={(val) => set({ published: val })}
                        />
                        <label htmlFor="dest-published" className="text-sm font-semibold cursor-pointer select-none">
                          {t("adm.dest.visible")}
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold">{t("adm.dest.goodToKnow")}</h3>
                  <button
                    type="button"
                    onClick={() => set({ goodToKnow: [...draft.goodToKnow, { en: "", ar: "" }] })}
                    className={btnClass("outline", "sm")}
                  >
                    <Plus aria-hidden="true" className="size-3.5" />
                    {t("adm.dest.addPoint")}
                  </button>
                </div>
                <ul className="mt-2 space-y-2">
                  {draft.goodToKnow.map((point, i) => (
                    <li key={`gtk-${i}`} className="flex items-start gap-2">
                      <Textarea
                        dir={dirFor}
                        aria-label={`${t("adm.dest.goodToKnow")} ${i + 1}`}
                        className="min-h-16"
                        value={editing === "ar" ? point.ar : point.en}
                        onChange={(e) => {
                          const next = draft.goodToKnow.map((p, idx) =>
                            idx === i ? (editing === "ar" ? { ...p, ar: e.target.value } : { ...p, en: e.target.value }) : p,
                          );
                          set({ goodToKnow: next });
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => set({ goodToKnow: draft.goodToKnow.filter((_, idx) => idx !== i) })}
                        aria-label={t("adm.dest.removePoint")}
                        className="mt-1 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <X aria-hidden="true" className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {tab === "route" ? (
            <div className="space-y-4">
              <h2 className="text-sm font-bold">{t("adm.dest.tab.route")}</h2>
              <p className="text-sm">
                <Ltr>{`GZA ↔ ${draft.code}`}</Ltr>
              </p>
              <div className="flex items-center gap-2.5">
                <Switch
                  id="dest-service-active"
                  checked={draft.serviceActive}
                  onCheckedChange={(val) => set({ serviceActive: val })}
                />
                <label htmlFor="dest-service-active" className="text-sm font-semibold cursor-pointer select-none">
                  {t("adm.dest.serviceActive")}
                </label>
              </div>

              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("adm.dest.days")}
                </legend>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={draft.days.includes(d)}
                      onClick={() =>
                        set({
                          days: draft.days.includes(d)
                            ? draft.days.filter((x) => x !== d)
                            : [...draft.days, d].sort((a, b) => a - b),
                        })
                      }
                      className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                        draft.days.includes(d)
                          ? "border-brand bg-brand-soft text-brand-deep"
                          : "border-border text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {t(`adm.day.${d}`)}
                    </button>
                  ))}
                </div>
              </fieldset>

              <Field label={t("adm.dest.frequency")} htmlFor="de-weekly" className="max-w-40">
                <Input
                  id="de-weekly"
                  dir="ltr"
                  type="number"
                  min={0}
                  value={draft.weeklyFlights}
                  onChange={(e) => set({ weeklyFlights: Number(e.target.value) || 0 })}
                />
              </Field>

              <div className="border-t border-border pt-3">
                <h3 className="text-sm font-bold">{t("adm.dest.related")}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{t("adm.sch.planningNote")}</p>
                {schedulesLoading ? <p role="status">{t("adm.ops.loading")}</p> : schedulesError ? <p role="alert">{t("adm.ops.loadError")}</p> : schedules.filter((s) => s.destination === draft.code).length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{t("adm.dest.relatedEmpty")}</p>
                ) : (
                  <ul className="mt-2 divide-y divide-border rounded-md border border-border text-sm">
                    {schedules
                      .filter((s) => s.destination === draft.code)
                      .map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                          <span>
                            <Ltr className="font-bold">{s.number}</Ltr>{" "}
                            <Ltr className="text-xs text-muted-foreground">
                              {s.direction === "out" ? `GZA → ${s.destination}` : `${s.destination} → GZA`}
                            </Ltr>
                          </span>
                          <span className="flex items-center gap-2">
                            <Ltr className="text-xs text-muted-foreground">{`${s.departTime} → ${s.arriveTime}`}</Ltr>
                            <AdminChip tone={s.active ? "brand" : "muted"}>
                              {t(s.active ? "adm.common.active" : "adm.common.inactive")}
                            </AdminChip>
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
                <AppLink to="/admin/schedules" className={btnClass("outline", "sm", "mt-3")}>
                  {t("adm.sch.title")}
                </AppLink>
              </div>
            </div>
          ) : null}

          {tab === "seo" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold">{t("adm.dest.tab.seo")}</h2>
                {langTabs}
              </div>
              <Field label={t("adm.dest.seoTitle")} htmlFor="de-seot">
                <Input
                  id="de-seot"
                  dir={dirFor}
                  value={editing === "ar" ? draft.seoTitleAr : draft.seoTitleEn}
                  onChange={(e) =>
                    set(editing === "ar" ? { seoTitleAr: e.target.value } : { seoTitleEn: e.target.value })
                  }
                />
              </Field>
              <Field label={t("adm.dest.seoDesc")} htmlFor="de-seod">
                <Textarea
                  id="de-seod"
                  dir={dirFor}
                  className="min-h-24"
                  value={editing === "ar" ? draft.seoDescAr : draft.seoDescEn}
                  onChange={(e) => set(editing === "ar" ? { seoDescAr: e.target.value } : { seoDescEn: e.target.value })}
                />
              </Field>
              <div>
                <Field label={t("adm.dest.socialImage")} htmlFor="de-social">
                  <Input
                    id="de-social"
                    dir={dirFor}
                    readOnly
                    value={pick(lang, {
                      en: "Not configured (site default: /social/gaza-airport.jpg)",
                      ar: "غير مهيأة (افتراضي الموقع: /social/gaza-airport.jpg)",
                    })}
                  />
                </Field>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pick(lang, {
                    en: "Per-destination social image metadata is not configured; sharing falls back to the site-wide default image. Local photo drafts do not alter static head tags.",
                    ar: "بيانات صورة المشاركة لوسائل التواصل غير مهيأة لكل وجهة؛ وتعتمد المشاركة الصورة الافتراضية للموقع. المسودات المحلية للصور لا تغيّر وسوم الميتا الثابتة.",
                  })}
                </p>
              </div>
            </div>
          ) : null}

          <AdminStickyActions>
            <button type="button" onClick={() => setDraft(current)} className={btnClass("outline", "sm")}>
              {t("adm.edit.cancel")}
            </button>
            <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} variant="primary" onClick={save}>
              {t("adm.edit.save")}
            </PermissionButton>
          </AdminStickyActions>
        </div>
      </AdminPanel>
    </div>
  );
}
