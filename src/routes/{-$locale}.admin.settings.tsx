import { Switch } from "@/components/ui/switch";
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { Input, Select } from "@/components/kit";
import { AdminField, AdminPageHeader, AdminPanel, AdminStickyActions, AdminTabs, PermissionButton } from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/head";

const AppearanceLab = lazy(() =>
  import("@/components/admin/appearance-lab").then((m) => ({ default: m.AppearanceLab })),
);

export const Route = createFileRoute("/{-$locale}/admin/settings")({
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

type Tab = "airport" | "service" | "contact" | "localization" | "appearance";

function AdminSettingsPage() {
  const { t } = useI18n();
  const { can, toast } = useAdmin();
  const [tab, setTab] = useState<Tab>("airport");
  const mayEdit = can("admin.manage");

  if (!can("admin.manage")) return <AdminDenied area={t("a2.se.title")} permission="admin.manage" />;

  const text = (id: string, label: string, value: string, dir: "ltr" | "auto" = "auto") => (
    <AdminField key={id} label={label} htmlFor={id}>
      <Input id={id} defaultValue={value} dir={dir} />
    </AdminField>
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t("a2.se.title")} description={t("a2.se.sub")} meta={<p className="text-xs text-muted-foreground">{t("a2.mock")}</p>} />

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
          ]}
        />
        <div className="p-4">
          {tab === "appearance" ? (
            <Suspense fallback={<div className="p-4 text-xs text-muted-foreground animate-pulse">...</div>}>
              <AppearanceLab />
            </Suspense>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {tab === "airport"
                  ? [
                      text("se-airport", t("a2.se.airportName"), "Gaza International Airport"),
                      text("se-iata", t("a2.se.iata"), "GZA", "ltr"),
                      text("se-airline", t("a2.se.airlineName"), "Palestinian Airlines"),
                      text("se-code", t("a2.se.airlineCode"), "PS", "ltr"),
                      text("se-tz", t("a2.se.timezone"), "Asia/Gaza (UTC+3)", "ltr"),
                      text("se-terminals", t("a2.se.terminals"), "Terminal 1", "ltr"),
                      text("se-gates", t("a2.se.gates"), "A1, A2, A4, B1, B3", "ltr"),
                    ]
                  : null}

                {tab === "service"
                  ? [
                      text("se-open", t("a2.se.ciOpens"), "48 h", "ltr"),
                      text("se-close", t("a2.se.ciCloses"), "60 min", "ltr"),
                      text("se-board", t("a2.se.boarding"), "20 min", "ltr"),
                      text("se-cabin", t("a2.se.cabinBag"), "7 kg", "ltr"),
                      text("se-checked", t("a2.se.checkedBag"), "23 kg", "ltr"),
                      text("se-extra", t("a2.se.extraBag"), "35", "ltr"),
                      text("se-currency", t("a2.se.currency"), "USD", "ltr"),
                    ]
                  : null}

                {tab === "contact"
                  ? [
                      text("se-phone", t("a2.web.pg.phone"), "+970 8 000 0000", "ltr"),
                      text("se-email", t("a2.web.pg.email"), "hello@gza.ps", "ltr"),
                      text("se-address", t("a2.web.pg.address"), "Rafah, Gaza Strip"),
                      text("se-fb", t("a2.se.facebook"), "gza.airport", "ltr"),
                      text("se-ig", t("a2.se.instagram"), "gza.airport", "ltr"),
                      text("se-x", t("a2.se.x"), "gzaairport", "ltr"),
                      text("se-yt", t("a2.se.youtube"), "gzaairport", "ltr"),
                    ]
                  : null}

                {tab === "localization" ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="se-en" className="type-label text-muted-foreground">
                        {t("a2.se.enEnabled")}
                      </label>
                      <div className="flex h-11 items-center">
                        <Switch id="se-en" defaultChecked />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="se-ar" className="type-label text-muted-foreground">
                        {t("a2.se.arEnabled")}
                      </label>
                      <div className="flex h-11 items-center">
                        <Switch id="se-ar" defaultChecked />
                      </div>
                    </div>
                    <AdminField label={t("a2.se.defaultLang")} htmlFor="se-default">
                      <Select id="se-default" defaultValue="en">
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

              <AdminStickyActions>
                <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} variant="primary" onClick={() => toast(t("a2.saved"))}>
                  {t("a2.save")}
                </PermissionButton>
              </AdminStickyActions>
            </>
          )}
        </div>
      </AdminPanel>
    </div>
  );
}
