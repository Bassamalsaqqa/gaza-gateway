import { Switch } from "@/components/ui/switch";
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState, FormEvent } from "react";
import { Input, Select, Button } from "@/components/kit";
import { AdminField, AdminPageHeader, AdminPanel, AdminStickyActions, AdminTabs, PermissionButton } from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { useI18n, pick } from "@/lib/i18n";
import { pageHead } from "@/lib/head";
import { settingsRepository, computeExternalSettingsSync } from "@/lib/settings";
import type { ContactSettings } from "@/lib/settings";
import { PUBLISHED_CONTACT_SETTINGS } from "@/lib/settings/defaults";
import { validateContactSettings } from "@/lib/settings/validation";

import { MvpContactSettings } from "@/components/admin/mvp-contact-settings";
import { MvpEmailSettings } from "@/components/admin/mvp-email-settings";
import { StaffIdentityWorkspace } from "@/components/identity/staff-workspace";
import { identityUiRequested } from "@/lib/api/identity-ui-runtime";
import { AppLink } from "@/components/app-link";

const AppearanceLab = lazy(() =>
  import("@/components/admin/appearance-lab").then((m) => ({ default: m.AppearanceLab })),
);

type Tab = "airport" | "service" | "contact" | "localization" | "appearance" | "security" | "email";

type SettingsSearch = {
  tab?: Tab;
  skinPreview?: 1;
  scenario?: string;
};

export const Route = createFileRoute("/{-$locale}/admin/settings")({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => {
    const out: SettingsSearch = {};
    const raw = search["tab"];
    if (raw === "airport" || raw === "service" || raw === "contact" || raw === "localization" || raw === "appearance" || raw === "security" || raw === "email") {
      out.tab = raw;
    }
    const rawPreview = search["skinPreview"];
    if (rawPreview === "1" || rawPreview === 1 || rawPreview === '"1"') {
      out.skinPreview = 1;
    }
    const rawScenario = search["scenario"];
    if (typeof rawScenario === "string" && rawScenario.trim().length > 0) {
      out.scenario = rawScenario.trim();
    }
    return out;
  },
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/settings",
      en: { title: "Settings — Gaza International Airport administration", description: "Airport, passenger service, contact and language settings." },
      ar: { title: "الإعدادات — إدارة مطار غزة الدولي", description: "إعدادات المطار وخدمة المسافرين والتواصل واللغة." },
      noindex: true,
    }),
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  return identityUiRequested ? <ServerStaffSettings /> : <MockAdminSettingsPage />;
}
function ServerStaffSettings() {
  const { t, lang } = useI18n();
  const { can } = useAdmin();
  const search = Route.useSearch();
  type Section = "contact" | "email" | "security" | "appearance";
  const initialSection = search.tab === "email" || search.tab === "security" || search.tab === "appearance" ? search.tab : "contact";
  const [section, setSection] = useState<Section>(can("admin.manage") ? initialSection : "security");
  const sections: { id: Section; en: string; ar: string; description: string; descriptionAr: string }[] = [
    ...(can("admin.manage") ? [
      {id: "contact" as const, en: "General & contact", ar: "عام والتواصل", description: "Public contact information and saved drafts.", descriptionAr: "بيانات التواصل العامة والمسودات المحفوظة."},
      {id: "email" as const, en: "Email & notifications", ar: "البريد والإشعارات", description: "Sender configuration, test messages and delivery status.", descriptionAr: "إعدادات المرسل ورسائل الاختبار وحالة الإرسال."},
    ] : []),
    {id: "security", en: "Team & security", ar: "الفريق والأمان", description: "Your password, sessions and optional authenticator. Team actions require administrator permission.", descriptionAr: "كلمة مرورك وجلساتك وتطبيق المصادقة الاختياري. تتطلب إدارة الفريق صلاحية المسؤول."},
    {id: "appearance", en: "Appearance & language", ar: "المظهر واللغة", description: "Published website presentation and bilingual content.", descriptionAr: "مظهر الموقع المنشور والمحتوى باللغتين."},
  ];
  const current = sections.find((item) => item.id === section) ?? sections[0]!;
  return <div className="space-y-6"><AdminPageHeader title={t("a2.se.title")} />
    <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label={pick(lang,{en:"Settings sections",ar:"أقسام الإعدادات"})} className="flex gap-1 overflow-x-auto border-b border-border pb-3 lg:sticky lg:top-4 lg:flex-col lg:overflow-visible lg:border-b-0 lg:pb-0">
        {sections.map((item) => <button key={item.id} type="button" aria-pressed={section === item.id} onClick={() => setSection(item.id)}
          className={`min-h-11 shrink-0 rounded-lg px-4 py-3 text-start text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring ${section === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-sand-deep hover:text-foreground"}`}>
          {pick(lang,item)}
        </button>)}
      </nav>
      <div className="min-w-0 space-y-5">
        <div><h2 className="text-xl font-semibold">{pick(lang,current)}</h2><p className="mt-2 max-w-prose text-sm text-muted-foreground">{lang === "ar" ? current.descriptionAr : current.description}</p></div>
        {/* Keep sections mounted so switching navigation does not discard unsaved form state. */}
        {can("admin.manage") && <><div hidden={section !== "contact"}><MvpContactSettings /></div><div hidden={section !== "email"}><MvpEmailSettings /></div></>}
        <div hidden={section !== "security"}><AdminPanel><StaffIdentityWorkspace /></AdminPanel></div>
        <div hidden={section !== "appearance"}><AdminPanel className="space-y-4"><p className="text-sm text-muted-foreground">{pick(lang,{en:"Manage published English and Arabic website content in Website content. Only server-published changes appear to visitors.",ar:"أدر محتوى الموقع بالإنجليزية والعربية من قسم محتوى الموقع. تظهر للزوار التغييرات المنشورة على الخادم فقط."})}</p>
          {can("content.view") && <AppLink to="/admin/website" className="inline-flex min-h-11 items-center font-semibold text-brand-deep underline underline-offset-4">{pick(lang,{en:"Open website content",ar:"فتح محتوى الموقع"})}</AppLink>}
        </AdminPanel></div>
      </div>
    </div>
  </div>;
}
function MockAdminSettingsPage() {
  const { t, lang } = useI18n();
  const { can, toast } = useAdmin();
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>(search.tab ?? "airport");

  // Contact Draft State
  const [savedContact, setSavedContact] = useState<ContactSettings | null>(null);
  const [contactState, setContactState] = useState<ContactSettings>(PUBLISHED_CONTACT_SETTINGS);
  const [isContactDirty, setIsContactDirty] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [contactSaveError, setContactSaveError] = useState<string | null>(null);
  const [externalNotice, setExternalNotice] = useState(false);

  const isContactDirtyRef = useRef(isContactDirty);
  isContactDirtyRef.current = isContactDirty;
  const contactStateRef = useRef(contactState);
  contactStateRef.current = contactState;
  const savedContactRef = useRef(savedContact);
  savedContactRef.current = savedContact;

  useEffect(() => {
    if (search.tab && search.tab !== tab) {
      setTab(search.tab);
    }
  }, [search.tab, tab]);

  useEffect(() => {
    let unmounted = false;
    const load = async () => {
      const draft = await settingsRepository.getContactDraft();
      if (!unmounted) {
        setSavedContact(draft);
        setContactState(draft ?? PUBLISHED_CONTACT_SETTINGS);
        setIsContactDirty(false);
        setExternalNotice(false);
      }
    };
    load();
    const unsub = settingsRepository.subscribe((newEnvelope) => {
      if (!unmounted) {
        const sync = computeExternalSettingsSync({
          currentSaved: savedContactRef.current,
          currentWorking: contactStateRef.current,
          isDirty: isContactDirtyRef.current,
          incomingSaved: newEnvelope?.site?.contact ?? null,
          publishedDefault: PUBLISHED_CONTACT_SETTINGS,
        });

        if (!sync.hasSavedChanged) {
          return;
        }

        setSavedContact(sync.nextSaved);
        savedContactRef.current = sync.nextSaved;
        setIsContactDirty(sync.nextIsDirty);
        isContactDirtyRef.current = sync.nextIsDirty;
        setExternalNotice(sync.nextExternalNotice);

        if (sync.shouldAdopt) {
          setContactState(sync.nextWorking);
          contactStateRef.current = sync.nextWorking;
          setValidationErrors([]);
          setContactSaveError(null);
        } else if (!sync.nextIsDirty) {
          setContactSaveError(null);
        }
      }
    });
    return () => {
      unmounted = true;
      unsub();
    };
  }, []);

  const mayEdit = can("admin.manage");

  if (!can("admin.manage")) return <AdminDenied area={t("a2.se.title")} permission="admin.manage" />;

  const handleContactChange = (field: keyof ContactSettings, value: string) => {
    setContactState((prev) => {
      const next = { ...prev, [field]: value };
      contactStateRef.current = next;
      const base = savedContactRef.current ?? PUBLISHED_CONTACT_SETTINGS;
      const dirty = JSON.stringify(next) !== JSON.stringify(base);
      setIsContactDirty(dirty);
      isContactDirtyRef.current = dirty;
      if (!dirty) {
        setExternalNotice(false);
      }
      return next;
    });
    setValidationErrors([]);
    setContactSaveError(null);
  };

  const handleSaveContact = async (e: FormEvent) => {
    e.preventDefault();
    if (!mayEdit) return;
    setValidationErrors([]);
    setContactSaveError(null);

    const validation = validateContactSettings(contactState);
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      toast("Validation error: " + validation.errors[0]);
      return;
    }

    try {
      await settingsRepository.saveContactDraft(validation.sanitized);
      setSavedContact(validation.sanitized);
      savedContactRef.current = validation.sanitized;
      setContactState(validation.sanitized);
      contactStateRef.current = validation.sanitized;
      setIsContactDirty(false);
      isContactDirtyRef.current = false;
      setExternalNotice(false);
      toast(t("a2.se.savedDraft") || "Draft saved locally");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setContactSaveError(msg);
      toast(t("a2.se.saveFailed") || "Changes could not be saved. Please try again.");
    }
  };

  const handleDiscardContact = () => {
    setValidationErrors([]);
    setContactSaveError(null);
    setExternalNotice(false);
    const fallback = savedContactRef.current ?? PUBLISHED_CONTACT_SETTINGS;
    setContactState(fallback);
    contactStateRef.current = fallback;
    setIsContactDirty(false);
    isContactDirtyRef.current = false;
  };

  const handleDiscardSavedDraft = async () => {
    setValidationErrors([]);
    setContactSaveError(null);
    setExternalNotice(false);
    try {
      await settingsRepository.discardContactDraft();
      setSavedContact(null);
      savedContactRef.current = null;
      setContactState(PUBLISHED_CONTACT_SETTINGS);
      contactStateRef.current = PUBLISHED_CONTACT_SETTINGS;
      setIsContactDirty(false);
      isContactDirtyRef.current = false;
      toast(t("a2.se.discardSavedSuccess") || "Draft discarded. Reverted to published default.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setContactSaveError(msg);
      toast(t("a2.se.saveFailed") || "Changes could not be saved. Please try again.");
    }
  };

  const text = (id: string, label: string, value: string, dir: "ltr" | "auto" = "auto", readOnly = true) => (
    <AdminField key={id} label={label} htmlFor={id}>
      <Input id={id} defaultValue={value} dir={dir} readOnly={readOnly} className={readOnly ? "opacity-70" : ""} />
    </AdminField>
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("a2.se.title")}
        description={t("a2.se.sub")}
        meta={
          tab === "security" ? (
            <p className="text-xs text-muted-foreground font-medium">
              {pick(lang, {
                en: "Staff credentials, passkeys, MFA enrollment and active session management.",
                ar: "بيانات اعتماد الموظفين والمفاتيح وتفعيل التحقق الثنائي وإدارة الجلسات النشطة.",
              })}
            </p>
          ) : tab === "contact" || tab === "appearance" ? (
            <p className="text-xs font-medium text-status-delayed">
              {t("a2.se.metaDraft") || "Local, unpublished draft. Changes are stored in this browser only."}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground font-medium">
              {t("a2.se.metaReadOnly") || "Read-only system, operational policy, and build configuration reference."}
            </p>
          )
        }
      />

      <AdminPanel bodyClassName="p-0">
        <AdminTabs
          label={t("a2.se.title")}
          active={tab}
          onChange={setTab}
          tabs={[
            { id: "airport", label: t("a2.se.tab.airport") },
            { id: "service", label: t("a2.se.tab.service") },
            { id: "contact", label: t("a2.se.tab.contact") },
            { id: "localization", label: t("a2.se.tab.localization") },
            { id: "appearance", label: t("a2.se.tab.appearance") },
            { id: "security", label: pick(lang, { en: "Security & Sessions", ar: "الأمان والجلسات" }) },
          ]}
        >
        <div className="p-4">
          {tab === "security" ? (
            identityUiRequested ? (
              <StaffIdentityWorkspace />
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">
                  {pick(lang, {
                    en: "Staff Credentials & Active Sessions",
                    ar: "بيانات اعتماد الموظفين والجلسات النشطة",
                  })}
                </p>
                <p className="mt-1">
                  {pick(lang, {
                    en: "Live staff identity management is active in server preview mode.",
                    ar: "تتوفر إدارة جلسات وهوية الموظفين المباشرة في وضع معاينة الخادم.",
                  })}
                </p>
              </div>
            )
          ) : tab === "appearance" ? (
            <Suspense fallback={<div className="p-4 text-xs text-muted-foreground animate-pulse">...</div>}>
              <AppearanceLab />
            </Suspense>
          ) : tab === "contact" ? (
            <form onSubmit={handleSaveContact}>
              {externalNotice && (
                <div role="status" className="mb-4 p-3 text-xs rounded bg-status-delayed/10 text-status-delayed border border-status-delayed/20">
                  {t("a2.se.externalChangeNotice") || "The saved draft was updated in another tab. Your unsaved changes have been kept."}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <AdminField label={t("a2.web.pg.phone")} htmlFor="c-phone">
                  <Input id="c-phone" value={contactState.phone} onChange={(e) => handleContactChange("phone", e.target.value)} dir="ltr" required />
                </AdminField>
                <AdminField label={t("a2.web.pg.email")} htmlFor="c-email">
                  <Input id="c-email" type="email" value={contactState.email} onChange={(e) => handleContactChange("email", e.target.value)} dir="ltr" required />
                </AdminField>
                <AdminField label={t("a2.web.pg.address") + " (EN)"} htmlFor="c-address-en">
                  <Input id="c-address-en" value={contactState.addressEn} onChange={(e) => handleContactChange("addressEn", e.target.value)} dir="ltr" required />
                </AdminField>
                <AdminField label={t("a2.web.pg.address") + " (AR)"} htmlFor="c-address-ar">
                  <Input id="c-address-ar" value={contactState.addressAr} onChange={(e) => handleContactChange("addressAr", e.target.value)} dir="rtl" required />
                </AdminField>
                <AdminField label={t("a2.se.facebook") || "Facebook URL"} htmlFor="c-fb">
                  <Input id="c-fb" type="url" value={contactState.socialFacebook} onChange={(e) => handleContactChange("socialFacebook", e.target.value)} dir="ltr" placeholder="https://..." />
                </AdminField>
                <AdminField label={t("a2.se.instagram") || "Instagram URL"} htmlFor="c-ig">
                  <Input id="c-ig" type="url" value={contactState.socialInstagram} onChange={(e) => handleContactChange("socialInstagram", e.target.value)} dir="ltr" placeholder="https://..." />
                </AdminField>
                <AdminField label={t("a2.se.x") || "X URL"} htmlFor="c-x">
                  <Input id="c-x" type="url" value={contactState.socialX} onChange={(e) => handleContactChange("socialX", e.target.value)} dir="ltr" placeholder="https://..." />
                </AdminField>
                <AdminField label={t("a2.se.youtube") || "YouTube URL"} htmlFor="c-yt">
                  <Input id="c-yt" type="url" value={contactState.socialYouTube} onChange={(e) => handleContactChange("socialYouTube", e.target.value)} dir="ltr" placeholder="https://..." />
                </AdminField>
              </div>

              {validationErrors.length > 0 && (
                <div role="alert" className="mt-4 p-3 text-xs rounded bg-destructive/10 text-destructive border border-destructive/20">
                  <ul className="list-disc list-inside space-y-1">
                    {validationErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {contactSaveError && (
                <div role="alert" className="mt-4 p-3 text-xs rounded bg-destructive/10 text-destructive border border-destructive/20">
                  {contactSaveError}
                </div>
              )}

              <AdminStickyActions>
                <div className="flex gap-2 items-center flex-1">
                  {savedContact && (
                    <>
                      <a href="/contact?settingsPreview=1" target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">{t("a2.se.previewEn") || "Preview EN"} ↗</a>
                      <a href="/ar/contact?settingsPreview=1" target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline ml-3">{t("a2.se.previewAr") || "Preview AR"} ↗</a>
                    </>
                  )}
                  <span className="text-xs ml-auto mr-4">
                    {isContactDirty ? (
                      <span className="text-xs font-semibold text-status-delayed bg-status-delayed/15 px-2 py-0.5 rounded-full">{t("a2.se.unsaved") || "Unsaved"}</span>
                    ) : savedContact ? (
                      <span className="text-xs font-semibold text-status-ontime bg-brand-soft px-2 py-0.5 rounded-full">{t("a2.se.savedDraft") || "Saved"}</span>
                    ) : (
                      <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{t("a2.se.publishedBaseline") || "Published baseline"}</span>
                    )}
                  </span>
                </div>
                {isContactDirty && (
                  <Button type="button" variant="ghost" onClick={handleDiscardContact}>
                    {t("a2.se.discard") || "Discard Unsaved"}
                  </Button>
                )}
                {!isContactDirty && savedContact && (
                  <Button type="button" variant="outline" className="text-destructive hover:bg-destructive/10 border-destructive/30" onClick={handleDiscardSavedDraft}>
                    {t("a2.se.discardSaved") || "Discard Saved Draft"}
                  </Button>
                )}
                {mayEdit ? (
                  <Button type="submit" variant="primary" disabled={!isContactDirty}>
                    {t("a2.saveDraft") || "Save Draft"}
                  </Button>
                ) : (
                  <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} variant="primary" onClick={() => {}}>
                    {t("a2.saveDraft") || "Save Draft"}
                  </PermissionButton>
                )}
              </AdminStickyActions>
            </form>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {tab === "airport"
                  ? [
                      text("se-airport", t("a2.se.airportName"), "Gaza International Airport"),
                      text("se-iata", t("a2.se.iata"), "GZA", "ltr"),
                      text("se-airline", t("a2.se.airlineName"), "Palestine Airways Limited"),
                      text("se-code", t("a2.se.airlineCode"), "PS", "ltr"),
                      text("se-tz", t("a2.se.timezone"), "Asia/Gaza (UTC+3)", "ltr"),
                      text("se-terminals", t("a2.se.terminals"), "Terminal 1", "ltr"),
                      text("se-gates", t("a2.se.gates"), "A1, A2, A4, B1, B3", "ltr"),
                    ]
                  : null}

                {tab === "service"
                  ? [
                      text("se-open", t("a2.se.ciOpens"), "24 h", "ltr"),
                      text("se-close", t("a2.se.ciCloses"), "60 min", "ltr"),
                      text("se-board", t("a2.se.boarding"), "20 min", "ltr"),
                      text("se-cabin", t("a2.se.cabinBag"), "7 kg", "ltr"),
                      text("se-checked", t("a2.se.checkedBag"), "23 kg", "ltr"),
                      text("se-extra", t("a2.se.extraBag"), "35", "ltr"),
                      text("se-currency", t("a2.se.currency"), "USD", "ltr"),
                    ]
                  : null}

                {tab === "localization" ? (
                  <>
                    <div className="flex flex-col gap-1.5 opacity-70">
                      <label htmlFor="se-en" className="type-label text-muted-foreground">
                        {t("a2.se.enEnabled")}
                      </label>
                      <div className="flex h-11 items-center">
                        <Switch id="se-en" defaultChecked disabled />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 opacity-70">
                      <label htmlFor="se-ar" className="type-label text-muted-foreground">
                        {t("a2.se.arEnabled")}
                      </label>
                      <div className="flex h-11 items-center">
                        <Switch id="se-ar" defaultChecked disabled />
                      </div>
                    </div>
                    <AdminField label={t("a2.se.defaultLang")} htmlFor="se-default">
                      <Select id="se-default" defaultValue="en" disabled className="opacity-70">
                        <option value="en">{t("a2.english")}</option>
                        <option value="ar">{t("a2.arabic")}</option>
                      </Select>
                    </AdminField>
                    {text("se-date", t("a2.se.dateFormat"), "DD/MM/YYYY", "ltr")}
                    {text("se-time", t("a2.se.timeFormat"), "24 h", "ltr")}
                    {text("se-cf", t("a2.se.currencyFormat"), "$1,234", "ltr")}
                  </>
                ) : null}
              </div>
            </>
          )}
        </div>
        </AdminTabs>
      </AdminPanel>
    </div>
  );
}
