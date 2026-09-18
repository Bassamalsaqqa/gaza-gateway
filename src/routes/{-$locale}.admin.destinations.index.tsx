import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppLink } from "@/components/app-link";
import { Input, btnClass } from "@/components/kit";
import {
  AdminChip,
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  BilingualStatus,
  Ltr,
  Toolbar,
} from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { useI18n } from "@/lib/i18n";
import { money } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/{-$locale}/admin/destinations/")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/destinations",
      en: {
        title: "Destinations — Gaza International Airport administration",
        description: "The published Palestinian Airlines network from Gaza and each destination page.",
      },
      ar: {
        title: "المحطات — إدارة مطار غزة الدولي",
        description: "شبكة الخطوط الجوية الفلسطينية المنشورة من غزة وصفحة كل محطة.",
      },
      noindex: true,
    }),
  component: AdminDestinationsPage,
});

function AdminDestinationsPage() {
  const { t, lang } = useI18n();
  const { can, ops } = useAdmin();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ops.destinations;
    return ops.destinations.filter((d) =>
      [d.code, d.cityEn, d.cityAr, d.countryEn, d.countryAr].join(" ").toLowerCase().includes(q),
    );
  }, [ops.destinations, query]);

  if (!can("ops.view")) return <AdminDenied area={t("adm.dest.title")} permission="ops.view" />;

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t("adm.dest.title")} description={t("adm.dest.sub")} />

      <AdminPanel bodyClassName="p-0">
        <Toolbar>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("adm.dest.searchPlaceholder")}
            aria-label={t("adm.common.search")}
            className="h-9 w-full min-w-40 max-w-56 text-sm sm:w-56"
          />
          <span className="ms-auto text-xs text-muted-foreground">{t("adm.common.results", { n: rows.length })}</span>
        </Toolbar>

        {rows.length === 0 ? (
          <AdminEmpty title={t("adm.dest.empty")} body={t("adm.dest.emptyBody")} />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[54rem] text-sm">
                <caption className="sr-only">{t("adm.dest.title")}</caption>
                <thead>
                  <tr className="border-b border-border type-th">
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.dest.code")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.dest.city")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.dest.country")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.dest.service")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.dest.frequency")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.dest.priceFrom")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.dest.published")}</th>
                    <th scope="col" className="px-3 py-2 text-end font-bold">{t("adm.col.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.code} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <Ltr className="font-bold">{d.code}</Ltr>
                      </td>
                      <td className="px-3 py-2 font-semibold">
                        {lang === "ar" ? d.cityAr : d.cityEn}
                        <BilingualStatus missingAr={!d.descAr} />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{lang === "ar" ? d.countryAr : d.countryEn}</td>
                      <td className="px-3 py-2">
                        <AdminChip tone={d.serviceActive ? "brand" : "muted"}>
                          {t(d.serviceActive ? "adm.common.active" : "adm.common.inactive")}
                        </AdminChip>
                      </td>
                      <td className="px-3 py-2">
                        <Ltr>{d.weeklyFlights}</Ltr>
                      </td>
                      <td className="px-3 py-2">{money(d.priceFrom, lang)}</td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap gap-1.5">
                          <AdminChip tone={d.published ? "brand" : "warn"}>
                            {t(d.published ? "adm.dest.published" : "adm.content.draft")}
                          </AdminChip>
                          {d.featured ? <AdminChip tone="info">{t("adm.dest.featured")}</AdminChip> : null}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-end">
                        <AppLink
                          to="/admin/destinations/$code"
                          params={{ code: d.code }}
                          className={btnClass("primary", "sm")}
                        >
                          {t("adm.common.edit")}
                        </AppLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-border lg:hidden">
              {rows.map((d) => (
                <li key={`${d.code}-card`} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p>
                        <Ltr className="font-bold">{d.code}</Ltr>{" "}
                        <span className="font-semibold">{lang === "ar" ? d.cityAr : d.cityEn}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{lang === "ar" ? d.countryAr : d.countryEn}</p>
                    </div>
                    <AdminChip tone={d.published ? "brand" : "warn"}>
                      {t(d.published ? "adm.dest.published" : "adm.content.draft")}
                    </AdminChip>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="font-semibold text-muted-foreground">{t("adm.dest.frequency")}</dt>
                      <dd>
                        <Ltr>{d.weeklyFlights}</Ltr>
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-muted-foreground">{t("adm.dest.priceFrom")}</dt>
                      <dd>{money(d.priceFrom, lang)}</dd>
                    </div>
                  </dl>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <BilingualStatus missingAr={!d.descAr} />
                    <AppLink
                      to="/admin/destinations/$code"
                      params={{ code: d.code }}
                      className={btnClass("primary", "sm")}
                    >
                      {t("adm.common.edit")}
                    </AppLink>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </AdminPanel>
    </div>
  );
}
