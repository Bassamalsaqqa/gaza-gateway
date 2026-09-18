import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Input, Select, Textarea, btnClass } from "@/components/kit";
import {
  AdminChip,
  AdminField,
  AdminPageHeader,
  AdminPanel,
  AdminSheet,
  AdminTabs,
  BilingualStatus,
  ContentStateChip,
  Ltr,
  PermissionButton,
} from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import {
  footerGroupsMock,
  headerNavMock,
  homeSections,
  legalLinksMock,
  sitePages,
  travelSections,
  type SitePage,
} from "@/lib/admin-mock";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/{-$locale}/admin/website")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/website",
      en: { title: "Website content — Gaza International Airport administration", description: "Homepage, travel information, pages and navigation." },
      ar: { title: "محتوى الموقع — إدارة مطار غزة الدولي", description: "الصفحة الرئيسية ومعلومات السفر والصفحات والتنقل." },
      noindex: true,
    }),
  component: AdminWebsitePage,
});

type Tab = "homepage" | "travel" | "pages" | "navigation";
type Lang = "en" | "ar";

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

function AdminWebsitePage() {
  const { t, lang } = useI18n();
  const { can, toast } = useAdmin();
  const [tab, setTab] = useState<Tab>("homepage");
  const [editLang, setEditLang] = useState<Lang>("en");
  const [travelTab, setTravelTab] = useState(travelSections[0]?.id ?? "prepare");
  const [page, setPage] = useState<SitePage | null>(null);
  const mayEdit = can("content.edit");

  if (!can("content.view")) return <AdminDenied area={t("a2.web.title")} permission="content.view" />;

  const publishBar = (
    <>
      <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => toast(t("a2.saved"))}>
        {t("a2.saveDraft")}
      </PermissionButton>
      <a href="/" target="_blank" rel="noreferrer" className={btnClass("outline", "sm")}>
        {t("a2.previewEn")}
      </a>
      <a href="/ar" target="_blank" rel="noreferrer" className={btnClass("outline", "sm")}>
        {t("a2.previewAr")}
      </a>
      <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} variant="primary" onClick={() => toast(t("a2.uiOnly"))}>
        {t("a2.publish")}
      </PermissionButton>
    </>
  );

  const activeTravel = travelSections.find((s) => s.id === travelTab) ?? travelSections[0];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("a2.web.title")}
        description={t("a2.web.sub")}
        meta={<p className="text-xs text-muted-foreground">{t("a2.mock")}</p>}
        action={publishBar}
      />

      <AdminPanel bodyClassName="p-0">
        <AdminTabs
          label={t("a2.web.title")}
          active={tab}
          onChange={setTab}
          tabs={[
            { id: "homepage", label: t("a2.web.tab.homepage") },
            { id: "travel", label: t("a2.web.tab.travel") },
            { id: "pages", label: t("a2.web.tab.pages") },
            { id: "navigation", label: t("a2.web.tab.navigation") },
          ]}
        />

        <div className="space-y-4 p-4">
          <LangToggle value={editLang} onChange={setEditLang} />

          {tab === "homepage" ? (
            <ul className="space-y-3">
              {homeSections.map((s, i) => (
                <li key={s.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold">{t(s.labelKey)}</h3>
                      <AdminChip tone={s.visible ? "brand" : "muted"}>{t(s.visible ? "a2.visible" : "a2.hidden")}</AdminChip>
                      <BilingualStatus missingAr={s.heading.ar.length === 0} />
                    </div>
                    <div className="flex gap-1.5">
                      <PermissionButton allowed={mayEdit && i > 0} reason={t("adm.edit.readOnly")} onClick={() => toast(t("a2.saved"))}>
                        <ChevronUp aria-hidden="true" className="size-3.5" />
                        <span className="sr-only">{t("a2.moveUp")}</span>
                      </PermissionButton>
                      <PermissionButton allowed={mayEdit && i < homeSections.length - 1} reason={t("adm.edit.readOnly")} onClick={() => toast(t("a2.saved"))}>
                        <ChevronDown aria-hidden="true" className="size-3.5" />
                        <span className="sr-only">{t("a2.moveDown")}</span>
                      </PermissionButton>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <AdminField label={t("a2.heading")} htmlFor={`hp-h-${s.id}`}>
                      <Input id={`hp-h-${s.id}`} dir={editLang === "ar" ? "rtl" : "ltr"} defaultValue={s.heading[editLang]} />
                    </AdminField>
                    <AdminField label={t("a2.media")} htmlFor={`hp-m-${s.id}`} hint={t("a2.selectMedia")}>
                      <Select id={`hp-m-${s.id}`} defaultValue="none">
                        <option value="none">{t("a2.none")}</option>
                        <option value="terminal-exterior.jpg">terminal-exterior.jpg</option>
                        <option value="site-aerial.jpg">site-aerial.jpg</option>
                      </Select>
                    </AdminField>
                    <AdminField label={t("a2.body")} htmlFor={`hp-b-${s.id}`} className="lg:col-span-2">
                      <Textarea id={`hp-b-${s.id}`} rows={2} dir={editLang === "ar" ? "rtl" : "ltr"} defaultValue={s.body[editLang]} />
                    </AdminField>
                    {s.items ? (
                      <AdminField label={t("a2.web.hp.items")} htmlFor={`hp-i-${s.id}`} className="lg:col-span-2">
                        <Input id={`hp-i-${s.id}`} dir="ltr" defaultValue={s.items.join(", ")} />
                      </AdminField>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {tab === "travel" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {travelSections.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={travelTab === s.id}
                    onClick={() => setTravelTab(s.id)}
                    className={btnClass(travelTab === s.id ? "secondary" : "ghost", "sm")}
                  >
                    {t(s.labelKey)}
                  </button>
                ))}
              </div>

              {activeTravel ? (
                <div className="space-y-3 rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold">{pick(lang, activeTravel.title)}</h3>
                    <AdminChip tone={activeTravel.visible ? "brand" : "muted"}>{t(activeTravel.visible ? "a2.visible" : "a2.hidden")}</AdminChip>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <AdminField label={t("a2.title")} htmlFor="tr-title">
                      <Input id="tr-title" dir={editLang === "ar" ? "rtl" : "ltr"} defaultValue={activeTravel.title[editLang]} />
                    </AdminField>
                    <AdminField label={t("a2.web.tr.intro")} htmlFor="tr-intro">
                      <Input id="tr-intro" dir={editLang === "ar" ? "rtl" : "ltr"} defaultValue={activeTravel.intro[editLang]} />
                    </AdminField>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("a2.web.tr.items")}</p>
                    {activeTravel.items.map((item, i) => (
                      <div key={item.id} className="flex flex-wrap items-end gap-2">
                        <AdminField label={`${t("a2.body")} ${i + 1}`} htmlFor={`tr-i-${item.id}`} className="min-w-0 flex-1">
                          <Input id={`tr-i-${item.id}`} dir={editLang === "ar" ? "rtl" : "ltr"} defaultValue={item.text[editLang]} />
                        </AdminField>
                        <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => toast(t("a2.uiOnly"))}>
                          {t("a2.delete")}
                        </PermissionButton>
                      </div>
                    ))}
                    <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => toast(t("a2.uiOnly"))}>
                      {t("a2.web.tr.addItem")}
                    </PermissionButton>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "pages" ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {sitePages.map((p) => (
                <li key={p.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold">{t(p.labelKey)}</h3>
                    <ContentStateChip state={p.state} />
                    <BilingualStatus missingAr={!p.ar} missingEn={!p.en} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {`${t("a2.web.pg.updated")}: `}
                    <Ltr>{p.updated}</Ltr>
                    {" · "}
                    <Ltr>{p.path}</Ltr>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button type="button" className={btnClass("outline", "sm")} onClick={() => setPage(p)}>
                      {t("a2.web.pg.open")}
                    </button>
                    <a href={p.path} target="_blank" rel="noreferrer" className={btnClass("ghost", "sm")}>
                      {t("a2.previewEn")}
                    </a>
                    <a href={`/ar${p.path}`} target="_blank" rel="noreferrer" className={btnClass("ghost", "sm")}>
                      {t("a2.previewAr")}
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {tab === "navigation" ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <section className="rounded-md border border-border">
                <h3 className="border-b border-border px-3 py-2 text-sm font-bold">{t("a2.web.nav.header")}</h3>
                <ul className="divide-y divide-border">
                  {headerNavMock.map((item, i) => (
                    <li key={item.id} className="flex flex-wrap items-end gap-2 p-3">
                      <AdminField label={t("a2.web.nav.label")} htmlFor={`nv-h-${item.id}`} className="min-w-0 flex-1">
                        <Input id={`nv-h-${item.id}`} dir={editLang === "ar" ? "rtl" : "ltr"} defaultValue={item.label[editLang]} />
                      </AdminField>
                      <AdminChip tone={item.visible ? "brand" : "muted"}>{t(item.visible ? "a2.visible" : "a2.hidden")}</AdminChip>
                      <span className="code-id text-xs text-muted-foreground">{i + 1}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="space-y-3">
                <div className="rounded-md border border-border">
                  <h3 className="border-b border-border px-3 py-2 text-sm font-bold">{t("a2.web.nav.footer")}</h3>
                  <ul className="divide-y divide-border">
                    {footerGroupsMock.map((g) => (
                      <li key={g.id} className="p-3">
                        <p className="text-sm font-semibold">{pick(lang, g.label)}</p>
                        <ul className="mt-1.5 space-y-1.5">
                          {g.links.map((l) => (
                            <li key={l.id} className="flex items-center gap-2">
                              <Input aria-label={t("a2.web.nav.label")} dir={editLang === "ar" ? "rtl" : "ltr"} defaultValue={l.label[editLang]} />
                              <AdminChip tone={l.visible ? "brand" : "muted"}>{t(l.visible ? "a2.visible" : "a2.hidden")}</AdminChip>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                    <li className="p-3">
                      <p className="text-sm font-semibold">{t("a2.web.nav.legal")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{legalLinksMock.map((l) => pick(lang, l.label)).join(" · ")}</p>
                    </li>
                  </ul>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {`${t("a2.web.nav.previewDesktop")} / ${t("a2.web.nav.previewMobile")}`}
                  </p>
                  <div className="mt-2 flex gap-3">
                    <div aria-hidden="true" className="h-16 flex-1 rounded border border-border bg-sand" />
                    <div aria-hidden="true" className="h-16 w-10 rounded border border-border bg-sand" />
                  </div>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </AdminPanel>

      <AdminSheet
        open={page !== null}
        title={page ? t(page.labelKey) : ""}
        description={page?.path ?? ""}
        onClose={() => setPage(null)}
        footer={
          <>
            <button type="button" className={btnClass("outline", "sm")} onClick={() => setPage(null)}>
              {t("a2.cancel")}
            </button>
            <PermissionButton
              allowed={mayEdit}
              reason={t("adm.edit.readOnly")}
              variant="primary"
              onClick={() => {
                setPage(null);
                toast(t("a2.saved"));
              }}
            >
              {t("a2.save")}
            </PermissionButton>
          </>
        }
      >
        {page ? (
          <div className="space-y-3">
            <AdminField label={t("a2.title")} htmlFor="pg-title">
              <Input id="pg-title" dir={editLang === "ar" ? "rtl" : "ltr"} defaultValue={t(page.labelKey)} />
            </AdminField>
            <AdminField label={t("a2.body")} htmlFor="pg-body">
              <Textarea id="pg-body" rows={5} dir={editLang === "ar" ? "rtl" : "ltr"} />
            </AdminField>
            {page.id === "contact" ? (
              <>
                <AdminField label={t("a2.web.pg.phone")} htmlFor="pg-phone">
                  <Input id="pg-phone" dir="ltr" defaultValue="+970 8 000 0000" />
                </AdminField>
                <AdminField label={t("a2.web.pg.email")} htmlFor="pg-email">
                  <Input id="pg-email" dir="ltr" defaultValue="hello@gza.ps" />
                </AdminField>
                <AdminField label={t("a2.web.pg.address")} htmlFor="pg-address">
                  <Input id="pg-address" defaultValue="Rafah, Gaza Strip" />
                </AdminField>
                <AdminField label={t("a2.web.pg.social")} htmlFor="pg-social">
                  <Input id="pg-social" dir="ltr" defaultValue="facebook.com/gza.airport" />
                </AdminField>
                <AdminField label={t("a2.web.pg.subjects")} htmlFor="pg-subjects">
                  <Input id="pg-subjects" defaultValue="Bookings, Accessibility, Archive, Media" />
                </AdminField>
              </>
            ) : null}
            <AdminField label={t("a2.status")} htmlFor="pg-state">
              <Select id="pg-state" defaultValue={page.state}>
                {(["draft", "published", "archived"] as const).map((s) => (
                  <option key={s} value={s}>{t(`adm.state.${s}`)}</option>
                ))}
              </Select>
            </AdminField>
          </div>
        ) : null}
      </AdminSheet>
    </div>
  );
}
