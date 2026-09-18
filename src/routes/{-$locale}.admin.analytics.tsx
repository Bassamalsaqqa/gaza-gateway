import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AdminPageHeader, AdminPanel, AdminTabs, Ltr, Metric } from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { useI18n } from "@/lib/i18n";
import { analyticsOverview, contentStats, funnelSteps, routeStats } from "@/lib/admin-mock";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/{-$locale}/admin/analytics")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/analytics",
      en: { title: "Analytics — Gaza International Airport administration", description: "Prototype figures for visits, searches, bookings and content." },
      ar: { title: "التحليلات — إدارة مطار غزة الدولي", description: "أرقام أولية للزيارات والبحث والحجوزات والمحتوى." },
      noindex: true,
    }),
  component: AdminAnalyticsPage,
});

type Tab = "overview" | "funnel" | "routes" | "content";

function Bar({ value, max }: { value: number; max: number }) {
  const pct = Math.max(4, Math.round((value / max) * 100));
  return (
    <span aria-hidden="true" className="block h-2 rounded-full bg-secondary">
      <span className="block h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} />
    </span>
  );
}

function AdminAnalyticsPage() {
  const { t } = useI18n();
  const { can } = useAdmin();
  const [tab, setTab] = useState<Tab>("overview");

  if (!can("engagement.view")) return <AdminDenied area={t("a2.an.title")} permission="engagement.view" />;

  const funnelMax = funnelSteps[0]?.value ?? 1;
  const searchMax = Math.max(...routeStats.map((r) => r.searched));
  const bookedMax = Math.max(...routeStats.map((r) => r.booked));

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t("a2.an.title")} description={t("a2.an.sub")} meta={<p className="text-xs text-muted-foreground">{t("a2.mock")}</p>} />

      <AdminPanel bodyClassName="p-0">
        <AdminTabs
          label={t("a2.an.title")}
          active={tab}
          onChange={setTab}
          tabs={[
            { id: "overview", label: t("a2.an.tab.overview") },
            { id: "funnel", label: t("a2.an.tab.funnel") },
            { id: "routes", label: t("a2.an.tab.routes") },
            { id: "content", label: t("a2.an.tab.content") },
          ]}
        />
        <div className="p-4">
          {tab === "overview" ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {analyticsOverview.map((m) => (
                <Metric key={m.id} label={t(m.labelKey)} value={m.value} hint={m.trend} />
              ))}
            </div>
          ) : null}

          {tab === "funnel" ? (
            <ol className="space-y-2.5">
              {funnelSteps.map((s) => (
                <li key={s.id}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold">{t(s.labelKey)}</span>
                    <Ltr className="text-muted-foreground">{s.value.toLocaleString("en-GB")}</Ltr>
                  </div>
                  <div className="mt-1">
                    <Bar value={s.value} max={funnelMax} />
                  </div>
                </li>
              ))}
            </ol>
          ) : null}

          {tab === "routes" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {[
                { title: t("a2.an.mostSearched"), key: "searched" as const, max: searchMax },
                { title: t("a2.an.mostBooked"), key: "booked" as const, max: bookedMax },
              ].map((col) => (
                <section key={col.title} className="rounded-md border border-border">
                  <h3 className="border-b border-border px-3 py-2 text-sm font-bold">{col.title}</h3>
                  <ul className="space-y-2.5 p-3">
                    {[...routeStats]
                      .sort((a, b) => b[col.key] - a[col.key])
                      .map((r) => (
                        <li key={r.code}>
                          <div className="flex items-center justify-between text-sm">
                            <Ltr className="font-semibold">{`GZA → ${r.code}`}</Ltr>
                            <Ltr className="text-muted-foreground">{r[col.key].toLocaleString("en-GB")}</Ltr>
                          </div>
                          <div className="mt-1">
                            <Bar value={r[col.key]} max={col.max} />
                          </div>
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : null}

          {tab === "content" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{t("a2.an.tab.content")}</caption>
                <thead>
                  <tr className="border-b border-border type-th">
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("a2.title")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("a2.an.views")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("a2.an.avgTime")}</th>
                  </tr>
                </thead>
                <tbody>
                  {contentStats.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">{t(c.labelKey)}</td>
                      <td className="px-3 py-2"><Ltr>{c.views}</Ltr></td>
                      <td className="px-3 py-2"><Ltr>{c.time}</Ltr></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </AdminPanel>
    </div>
  );
}
