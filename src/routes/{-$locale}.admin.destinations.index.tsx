import { GazaTable, GazaTableBody, GazaTableCaption, GazaTableCell, GazaTableHead, GazaTableHeader, GazaTableRow } from "@/components/gaza-table";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppLink } from "@/components/app-link";
import { Input, btnClass } from "@/components/kit";
import {
  AdminChip,
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  Ltr,
  Toolbar,
} from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { useI18n } from "@/lib/i18n";
import { money } from "@/lib/format";
import { useNetworkQuery, plannedWeeklyDepartures } from "@/lib/network";
import { useSchedulesQuery } from "@/lib/schedules";
import { legacyDestinationPresentationByCode } from "@/lib/destination-reference";
import { NetworkState } from "@/components/admin/network-state";
import { pageHead } from "@/lib/head";
import { publishedDestinationsEditorial } from "@/content/published/destinations-editorial";
export const Route = createFileRoute("/{-$locale}/admin/destinations/")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/destinations",
      en: {
        title: "Destinations — Gaza International Airport administration",
        description: "Browser-local airport reference operations and recurring planning frequency.",
      },
      ar: {
        title: "المحطات — إدارة مطار غزة الدولي",
        description: "عمليات مراجع المطارات المحفوظة في المتصفح ووتيرة التخطيط المتكرر.",
      },
      noindex: true,
    }),
  component: AdminDestinationsPage,
});

function AdminDestinationsPage() {
  const { t, lang } = useI18n();
  const { can } = useAdmin();
  const network = useNetworkQuery();
  const schedules = useSchedulesQuery();
  const [query, setQuery] = useState("");

  const mayOpsView = can("ops.view");
  const mayContentView = can("content.view");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return network.data ?? [];
    return (network.data ?? []).filter((d) =>
      [d.code, d.city.en, d.city.ar, d.country.en, d.country.ar, d.airportName.en, d.airportName.ar]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [network.data, query]);

  if (!mayOpsView && !mayContentView) {
    return <AdminDenied area={t("adm.dest.title")} permission="ops.view" />;
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("adm.dest.title")}
        description={mayOpsView ? t("network.subtitle") : t("cms.dest.editorialTitle")}
      />

      {mayOpsView && (
        <p className="text-xs text-muted-foreground">{t("network.scope")}</p>
      )}

      {/* Editorial Content Access Notice for content editors */}
      {mayContentView && (
        <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">{t("cms.dest.editorialTitle")}</p>
          <p className="mt-0.5">{t("cms.dest.opsNotice")}</p>
        </div>
      )}

      <AdminPanel bodyClassName="p-0">
        <Toolbar>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("adm.dest.searchPlaceholder")}
            aria-label={t("adm.common.search")}
            className="h-9 w-full min-w-40 max-w-56 text-sm sm:w-56"
          />
          {network.isSuccess ? (
            <span className="ms-auto text-xs text-muted-foreground">
              {t("adm.common.results", { n: rows.length })}
            </span>
          ) : null}
        </Toolbar>

        {/* Truthful Network status */}
        <NetworkState
          pending={network.isPending}
          error={network.isError}
          onRetry={() => void network.refetch()}
        />

        {mayOpsView && schedules.isError ? (
          <div role="alert" className="px-4 py-2 text-xs text-muted-foreground">
            {t("network.frequencyUnavailable")}{" "}
            <button
              type="button"
              className={btnClass("outline", "sm")}
              onClick={() => void schedules.refetch()}
            >
              {t("adm.ops.retry")}
            </button>
          </div>
        ) : null}

        {/* If network fails, content editors can still access editorial content */}
        {mayContentView && (network.isError || !mayOpsView || (network.isSuccess && network.data.length === 0)) ? (
          <div className="p-4 space-y-3">
            <p className="text-xs font-semibold text-foreground">
              {t("cms.dest.editorialTitle")}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {publishedDestinationsEditorial.destinations.map((entry) => (
                <li
                  key={entry.code}
                  className="flex items-center justify-between rounded-md border border-border p-3 bg-card"
                >
                  <div>
                    <Ltr className="font-bold text-foreground">{entry.code}</Ltr>
                    <p className="text-xs text-muted-foreground">
                      {entry.seo.title[lang]}
                    </p>
                  </div>
                  <AppLink
                    to="/admin/destinations/$code"
                    params={{ code: entry.code }}
                    search={{ tab: "content" }}
                    className={btnClass("primary", "sm")}
                  >
                    {t("cms.dest.editEditorial")}
                  </AppLink>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {network.isPending || network.isError ? null : rows.length === 0 ? (
          <AdminEmpty title={t("adm.dest.empty")} body={t("adm.dest.emptyBody")} />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <GazaTable className="w-full min-w-[54rem] text-sm">
                <GazaTableCaption className="sr-only">{t("adm.dest.title")}</GazaTableCaption>
                <GazaTableHeader>
                  <GazaTableRow className="border-b border-border type-th">
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                      {t("adm.dest.code")}
                    </GazaTableHead>
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                      {t("adm.dest.city")}
                    </GazaTableHead>
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                      {t("adm.dest.country")}
                    </GazaTableHead>
                    {mayOpsView && (
                      <>
                        <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                          {t("adm.dest.service")}
                        </GazaTableHead>
                        <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                          {t("network.frequency")}
                        </GazaTableHead>
                        <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                          {t("network.legacyFare")}
                        </GazaTableHead>
                      </>
                    )}
                    <GazaTableHead scope="col" className="px-3 py-2 text-end font-bold">
                      {t("adm.col.actions")}
                    </GazaTableHead>
                  </GazaTableRow>
                </GazaTableHeader>
                <GazaTableBody>
                  {rows.map((d) => (
                    <GazaTableRow key={d.code} className="border-b border-border last:border-0">
                      <GazaTableCell className="px-3 py-2">
                        <Ltr className="font-bold">{d.code}</Ltr>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2 font-semibold">
                        {d.city[lang]}
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2 text-muted-foreground">
                        {d.country[lang]}
                      </GazaTableCell>
                      {mayOpsView && (
                        <>
                          <GazaTableCell className="px-3 py-2">
                            <AdminChip tone={d.active ? "brand" : "muted"}>
                              {t(d.active ? "adm.common.active" : "adm.common.inactive")}
                            </AdminChip>
                          </GazaTableCell>
                          <GazaTableCell className="px-3 py-2">
                            <Ltr>
                              {schedules.isSuccess && !schedules.isError
                                ? plannedWeeklyDepartures(d.code, schedules.data)
                                : t("network.frequencyUnavailable")}
                            </Ltr>
                          </GazaTableCell>
                          <GazaTableCell className="px-3 py-2">
                            {legacyDestinationPresentationByCode(d.code)?.priceFrom != null
                              ? money(legacyDestinationPresentationByCode(d.code)!.priceFrom, lang)
                              : "—"}
                          </GazaTableCell>
                        </>
                      )}
                      <GazaTableCell className="px-3 py-2 text-end">
                        <div className="flex items-center justify-end gap-1.5">
                          {mayOpsView && (
                            <AppLink
                              to="/admin/destinations/$code"
                              params={{ code: d.code }}
                              className={btnClass("outline", "sm")}
                            >
                              {t("adm.common.edit")}
                            </AppLink>
                          )}
                          {mayContentView && (
                            <AppLink
                              to="/admin/destinations/$code"
                              params={{ code: d.code }}
                              search={{ tab: "content" }}
                              className={btnClass(mayOpsView ? "ghost" : "primary", "sm")}
                            >
                              {t("cms.dest.editEditorial")}
                            </AppLink>
                          )}
                        </div>
                      </GazaTableCell>
                    </GazaTableRow>
                  ))}
                </GazaTableBody>
              </GazaTable>
            </div>

            <ul className="divide-y divide-border lg:hidden">
              {rows.map((d) => (
                <li key={`${d.code}-card`} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p>
                        <Ltr className="font-bold">{d.code}</Ltr>{" "}
                        <span className="font-semibold">{d.city[lang]}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{d.country[lang]}</p>
                    </div>
                    {mayOpsView && (
                      <AdminChip tone={d.active ? "brand" : "muted"}>
                        {t(d.active ? "adm.common.active" : "adm.common.inactive")}
                      </AdminChip>
                    )}
                  </div>
                  {mayOpsView && (
                    <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <dt className="font-semibold text-muted-foreground">
                          {t("network.frequency")}
                        </dt>
                        <dd>
                          <Ltr>
                            {schedules.isSuccess && !schedules.isError
                              ? plannedWeeklyDepartures(d.code, schedules.data)
                              : t("network.frequencyUnavailable")}
                          </Ltr>
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-muted-foreground">
                          {t("network.legacyFare")}
                        </dt>
                        <dd>
                          {legacyDestinationPresentationByCode(d.code)?.priceFrom != null
                            ? money(legacyDestinationPresentationByCode(d.code)!.priceFrom, lang)
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {mayOpsView && (
                      <AppLink
                        to="/admin/destinations/$code"
                        params={{ code: d.code }}
                        className={btnClass("outline", "sm")}
                      >
                        {t("adm.common.edit")}
                      </AppLink>
                    )}
                    {mayContentView && (
                      <AppLink
                        to="/admin/destinations/$code"
                        params={{ code: d.code }}
                        search={{ tab: "content" }}
                        className={btnClass(mayOpsView ? "ghost" : "primary", "sm")}
                      >
                        {t("cms.dest.editEditorial")}
                      </AppLink>
                    )}
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
