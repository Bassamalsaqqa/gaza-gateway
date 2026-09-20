import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AdminPageHeader, AdminPanel, AdminTabs, Ltr, Metric } from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { GazaTable, GazaTableBody, GazaTableCaption, GazaTableCell, GazaTableHead, GazaTableHeader, GazaTableRow } from "@/components/gaza-table";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useAdmin } from "@/lib/admin-store";
import { useI18n } from "@/lib/i18n";
import { analyticsOverview, contentStats, funnelSteps, routeStats } from "@/lib/admin-mock";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/{-$locale}/admin/analytics")({
  head: ({ params }) => pageHead({
    locale: params.locale,
    path: "/admin/analytics",
    en: { title: "Analytics — Gaza International Airport administration", description: "Prototype figures for visits, searches, bookings and content." },
    ar: { title: "التحليلات — إدارة مطار غزة الدولي", description: "أرقام أولية للزيارات والبحث والحجوزات والمحتوى." },
    noindex: true,
  }),
  component: AdminAnalyticsPage,
});

type Tab = "overview" | "funnel" | "routes" | "content";

function AdminAnalyticsPage() {
  const { t } = useI18n();
  const { can } = useAdmin();
  const [tab, setTab] = useState<Tab>("overview");
  if (!can("engagement.view")) return <AdminDenied area={t("a2.an.title")} permission="engagement.view" />;

  const funnelConfig = { value: { label: t("a2.an.tab.funnel"), color: "var(--brand)" } } satisfies ChartConfig;
  const routeConfig = {
    searched: { label: t("a2.an.mostSearched"), color: "var(--brand)" },
    booked: { label: t("a2.an.mostBooked"), color: "var(--clay)" },
  } satisfies ChartConfig;
  const tabs = [
    { id: "overview" as const, label: t("a2.an.tab.overview") },
    { id: "funnel" as const, label: t("a2.an.tab.funnel") },
    { id: "routes" as const, label: t("a2.an.tab.routes") },
    { id: "content" as const, label: t("a2.an.tab.content") },
  ];

  return <div className="space-y-4">
    <AdminPageHeader title={t("a2.an.title")} description={t("a2.an.sub")} meta={<p className="text-xs text-muted-foreground">{t("a2.mock")}</p>} />
    <AdminPanel bodyClassName="p-0">
      <AdminTabs label={t("a2.an.title")} active={tab} onChange={setTab} tabs={tabs} />
      <div className="p-4">
        {tab === "overview" ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{analyticsOverview.map((m) => <Metric key={m.id} label={t(m.labelKey)} value={m.value} hint={m.trend} />)}</div> : null}
        {tab === "funnel" ? <figure aria-label={t("a2.an.tab.funnel")}>
          <ChartContainer config={funnelConfig} className="h-[19rem] w-full aspect-auto">
            <BarChart accessibilityLayer data={funnelSteps.map((step) => ({ ...step, label: t(step.labelKey) }))} layout="vertical" margin={{ left: 8, right: 20 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={(value) => Number(value).toLocaleString("en-GB")} />
              <YAxis type="category" dataKey="label" width={110} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
        </figure> : null}
        {tab === "routes" ? <figure aria-label={`${t("a2.an.mostSearched")}, ${t("a2.an.mostBooked")}`}>
          <ChartContainer config={routeConfig} className="h-[20rem] w-full aspect-auto">
            <BarChart accessibilityLayer data={routeStats.map((route) => ({ ...route, route: `GZA → ${route.code}` }))} margin={{ left: 4, right: 12 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="route" tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(value) => Number(value).toLocaleString("en-GB")} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="searched" fill="var(--color-searched)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="booked" fill="var(--color-booked)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
        </figure> : null}
        {tab === "content" ? <div className="overflow-x-auto">
          <GazaTable><GazaTableCaption>{t("a2.an.tab.content")}</GazaTableCaption>
            <GazaTableHeader><GazaTableRow><GazaTableHead>{t("a2.title")}</GazaTableHead><GazaTableHead>{t("a2.an.views")}</GazaTableHead><GazaTableHead>{t("a2.an.avgTime")}</GazaTableHead></GazaTableRow></GazaTableHeader>
            <GazaTableBody>{contentStats.map((c) => <GazaTableRow key={c.id}><GazaTableCell>{t(c.labelKey)}</GazaTableCell><GazaTableCell><Ltr>{c.views}</Ltr></GazaTableCell><GazaTableCell><Ltr>{c.time}</Ltr></GazaTableCell></GazaTableRow>)}</GazaTableBody>
          </GazaTable>
        </div> : null}
      </div>
    </AdminPanel>
  </div>;
}
