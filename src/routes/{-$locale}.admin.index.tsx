import {
  GazaTable,
  GazaTableBody,
  GazaTableCaption,
  GazaTableCell,
  GazaTableHead,
  GazaTableHeader,
  GazaTableRow,
} from "@/components/gaza-table";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Globe,
  PlaneLanding,
  PlaneTakeoff,
  Ticket,
  Users,
} from "lucide-react";
import { AppLink } from "@/components/app-link";
import { Field, Input, Select, Textarea, btnClass } from "@/components/kit";
import { StatusBadge } from "@/components/flight-status";
import {
  AdminChip,
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  GazaSheet,
  AttentionRow,
  BilingualStatus,
  ContentStateChip,
  Ltr,
  Metric,
  PermissionButton,
} from "@/components/admin/admin-kit";
import { useDashboardData, type OpsFlight } from "@/components/admin/dashboard-data";
import { useAdmin } from "@/lib/admin-store";
import { useI18n } from "@/lib/i18n";
import { dateLong, dateShort } from "@/lib/format";
import { SEAT_ROWS, SEAT_LETTERS, type FlightStatus } from "@/lib/data";
import { checkedInPax, seatedPassengers, useStore } from "@/lib/store";
import { pageHead } from "@/lib/head";
import { cn } from "@/lib/utils";

const STATUSES: FlightStatus[] = [
  "Scheduled",
  "OnTime",
  "Boarding",
  "Delayed",
  "Departed",
  "Landed",
  "Cancelled",
];
const CAPACITY = SEAT_ROWS * SEAT_LETTERS.length;

export const Route = createFileRoute("/{-$locale}/admin/")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin",
      en: {
        title: "Dashboard — Gaza International Airport administration",
        description:
          "Today's departures, arrivals, bookings and content status for Gaza International Airport staff.",
      },
      ar: {
        title: "لوحة المتابعة — إدارة مطار غزة الدولي",
        description: "مغادرات اليوم والقادمة والحجوزات وحالة المحتوى لموظفي مطار غزة الدولي.",
      },
      noindex: true,
    }),
  component: AdminDashboardPage,
});

type EditState = {
  flight: OpsFlight;
  status: FlightStatus;
  gate: string;
  terminal: string;
  revised: string;
  note: string;
};

function loadOf(flight: OpsFlight): number {
  return Math.max(0, CAPACITY - flight.seatsLeft);
}

function AdminDashboardPage() {
  const { t, lang } = useI18n();
  const { can, applyOverride, toast } = useAdmin();
  const data = useDashboardData();
  const [edit, setEdit] = useState<EditState | null>(null);
  const { bookings } = useStore();

  const mayOps = can("ops.view");
  const mayCommercial = can("commercial.view");
  const mayContent = can("content.view");
  const mayEngagement = can("engagement.view");
  const mayEditOps = can("ops.edit");

  /** Check-in progress for a flight, from bookings held locally. */
  const checkinFor = (flight: OpsFlight) => {
    let checked = 0;
    let total = 0;
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      for (const leg of ["out", "in"] as const) {
        const legFlight = leg === "out" ? b.outbound : b.inbound;
        if (legFlight?.id !== flight.id) continue;
        total += seatedPassengers(b).length;
        checked += checkedInPax(b, leg).length;
      }
    }
    return { checked, total };
  };

  const openEdit = (flight: OpsFlight) =>
    setEdit({
      flight,
      status: flight.status,
      gate: flight.gate,
      terminal: flight.terminal,
      revised: flight.revisedDepart ?? "",
      note: flight.note ?? "",
    });

  const save = () => {
    if (!edit) return;
    applyOverride(edit.flight.id, {
      status: edit.status,
      gate: edit.gate,
      terminal: edit.terminal,
      revisedDepart: edit.revised,
      note: edit.note,
    });
    toast(t("adm.edit.saved", { flight: edit.flight.number }));
    setEdit(null);
  };

  const summaryMetrics = useMemo(
    () =>
      [
        {
          key: "dep",
          show: mayOps,
          label: t("adm.dash.departures"),
          value: data.metrics.departures,
          icon: PlaneTakeoff,
          wellClass: "border-primary/20 bg-primary/10 text-primary",
        },
        {
          key: "arr",
          show: mayOps,
          label: t("adm.dash.arrivals"),
          value: data.metrics.arrivals,
          icon: PlaneLanding,
          wellClass: "border-primary/20 bg-primary/10 text-primary",
        },
        {
          key: "bks",
          show: mayCommercial,
          label: t("adm.dash.bookings"),
          value: data.metrics.bookingsToday,
          icon: Ticket,
          wellClass: "border-clay/25 bg-clay/10 text-clay-deep",
        },
        {
          key: "pax",
          show: mayCommercial,
          label: t("adm.dash.passengers"),
          value: data.metrics.passengersTravelling,
          icon: Users,
          wellClass: "border-border bg-secondary text-foreground",
        },
      ].filter((m) => m.show),
    [mayOps, mayCommercial, data.metrics, t],
  );

  const hasIrregularity = (data.metrics.delayed > 0 || data.metrics.cancelled > 0) && mayOps;

  const operationPanel = (
    <AdminPanel
      title={t("adm.dash.operation")}
      description={t("adm.dash.operationSub")}
      icon={<CalendarClock className="size-4 text-primary" />}
      badge={
        <span className="text-xs font-mono font-medium text-muted-foreground">
          ({data.operation.length})
        </span>
      }
      className="rounded-xl border border-border bg-card shadow-xs"
      bodyClassName="p-0"
    >
      {/* Desktop table */}
      <div className="hidden overflow-x-auto xl:block">
        <GazaTable className="w-full min-w-[58rem] text-sm">
          <GazaTableCaption>{t("adm.dash.operation")}</GazaTableCaption>
          <GazaTableHeader>
            <GazaTableRow className="border-b border-border type-th">
              <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                {t("adm.col.time")}
              </GazaTableHead>
              <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                {t("adm.col.flight")}
              </GazaTableHead>
              <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                {t("adm.col.route")}
              </GazaTableHead>
              <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                {t("adm.col.aircraft")}
              </GazaTableHead>
              <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                {t("adm.col.gate")}
              </GazaTableHead>
              <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                {t("adm.col.load")}
              </GazaTableHead>
              <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                {t("adm.col.checkin")}
              </GazaTableHead>
              <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                {t("adm.col.status")}
              </GazaTableHead>
              <GazaTableHead scope="col" className="px-3 py-2 text-end font-bold">
                {t("adm.col.actions")}
              </GazaTableHead>
            </GazaTableRow>
          </GazaTableHeader>
          <GazaTableBody>
            {data.operation.map((f) => (
              <GazaTableRow
                key={`${f.id}-${f.direction}`}
                className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors"
              >
                <GazaTableCell className="px-3 py-2">
                  <Ltr className="font-semibold">
                    {f.direction === "dep" ? f.departTime : f.arriveTime}
                  </Ltr>
                  <span className="ms-1.5 inline-flex align-middle text-muted-foreground">
                    {f.direction === "dep" ? (
                      <PlaneTakeoff aria-label={t("adm.flight.departure")} className="size-3.5" />
                    ) : (
                      <PlaneLanding aria-label={t("adm.flight.arrival")} className="size-3.5" />
                    )}
                  </span>
                  {f.revisedDepart ? (
                    <span className="block">
                      <AdminChip tone="warn">
                        <Ltr>{f.revisedDepart}</Ltr>
                      </AdminChip>
                    </span>
                  ) : null}
                </GazaTableCell>
                <GazaTableCell className="px-3 py-2">
                  <Ltr className="font-bold">{f.number}</Ltr>
                </GazaTableCell>
                <GazaTableCell className="px-3 py-2">
                  <Ltr>{`${f.originCode} → ${f.destinationCode}`}</Ltr>
                </GazaTableCell>
                <GazaTableCell className="px-3 py-2 text-muted-foreground">
                  <Ltr>{f.aircraft}</Ltr>
                </GazaTableCell>
                <GazaTableCell className="px-3 py-2">
                  {f.gate ? (
                    <Ltr>{`${f.terminal} · ${f.gate}`}</Ltr>
                  ) : (
                    <AdminChip tone="warn">{t("adm.flight.noGate")}</AdminChip>
                  )}
                </GazaTableCell>
                <GazaTableCell className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2 w-16 overflow-hidden rounded-full bg-secondary/80 border border-border/40"
                    >
                      <span
                        className="block h-full rounded-full bg-brand"
                        style={{ width: `${Math.round((loadOf(f) / CAPACITY) * 100)}%` }}
                      />
                    </span>
                    <Ltr className="text-xs font-medium text-muted-foreground tabular-nums">{`${loadOf(f)}/${CAPACITY}`}</Ltr>
                  </span>
                  <span className="sr-only">
                    {t("adm.flight.loadOf", { n: loadOf(f), total: CAPACITY })}
                  </span>
                </GazaTableCell>
                <GazaTableCell className="px-3 py-2">
                  {checkinFor(f).total === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <AdminChip
                      tone={checkinFor(f).checked === checkinFor(f).total ? "brand" : "neutral"}
                    >
                      {t("adm.flight.checkedOf", {
                        n: checkinFor(f).checked,
                        total: checkinFor(f).total,
                      })}
                    </AdminChip>
                  )}
                </GazaTableCell>
                <GazaTableCell className="px-3 py-2">
                  <StatusBadge status={f.status} />
                </GazaTableCell>
                <GazaTableCell className="whitespace-nowrap px-3 py-2 text-end">
                  <PermissionButton
                    allowed={mayEditOps}
                    reason={t("adm.edit.readOnly")}
                    onClick={() => openEdit(f)}
                  >
                    {t("adm.flight.quickEdit")}
                  </PermissionButton>
                </GazaTableCell>
              </GazaTableRow>
            ))}
          </GazaTableBody>
        </GazaTable>
      </div>

      {/* Mobile / tablet stacked list */}
      <ul className="xl:hidden">
        {data.operation.map((f) => {
          const ci = checkinFor(f);
          return (
            <li
              key={`${f.id}-${f.direction}-m`}
              className="border-b border-border px-3 py-3 last:border-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Ltr className="font-bold">{f.number}</Ltr>
                  <Ltr className="text-sm text-muted-foreground">{`${f.originCode} → ${f.destinationCode}`}</Ltr>
                </span>
                <StatusBadge status={f.status} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  {f.direction === "dep" ? (
                    <PlaneTakeoff aria-label={t("adm.flight.departure")} className="size-3.5" />
                  ) : (
                    <PlaneLanding aria-label={t("adm.flight.arrival")} className="size-3.5" />
                  )}
                  <Ltr>{f.direction === "dep" ? f.departTime : f.arriveTime}</Ltr>
                </span>
                <Ltr>{f.aircraft}</Ltr>
                {f.gate ? (
                  <Ltr>{`${f.terminal} · ${f.gate}`}</Ltr>
                ) : (
                  <AdminChip tone="warn">{t("adm.flight.noGate")}</AdminChip>
                )}
                <Ltr>{`${loadOf(f)}/${CAPACITY}`}</Ltr>
                {ci.total > 0 ? (
                  <AdminChip tone={ci.checked === ci.total ? "brand" : "neutral"}>
                    {t("adm.flight.checkedOf", { n: ci.checked, total: ci.total })}
                  </AdminChip>
                ) : null}
              </div>
              {f.note ? <p className="mt-1 text-xs text-accent-foreground">{f.note}</p> : null}
              <div className="mt-2">
                <PermissionButton
                  allowed={mayEditOps}
                  reason={t("adm.edit.readOnly")}
                  onClick={() => openEdit(f)}
                >
                  {t("adm.flight.quickEdit")}
                </PermissionButton>
              </div>
            </li>
          );
        })}
      </ul>
    </AdminPanel>
  );

  const attentionPanel = (
    <AdminPanel
      title={t("adm.dash.attention")}
      icon={<AlertTriangle className="size-4 text-status-delayed" />}
      badge={
        data.attention.length > 0 ? (
          <AdminChip tone="warn" className="text-[11px] px-1.5 py-0">
            {data.attention.length}
          </AdminChip>
        ) : null
      }
      className="rounded-xl border border-border bg-card shadow-xs"
      bodyClassName="p-0"
    >
      {data.attention.length === 0 ? (
        <AdminEmpty title={t("adm.attn.none")} />
      ) : (
        <ul className="max-h-[26rem] overflow-y-auto divide-y divide-border">
          {data.attention.slice(0, 12).map((item) => (
            <AttentionRow
              key={item.id}
              severity={item.severity}
              title={item.title}
              module={item.module}
              next={item.next}
            />
          ))}
        </ul>
      )}
    </AdminPanel>
  );

  const contentPanel = (
    <AdminPanel
      title={t("adm.dash.content")}
      icon={<Globe className="size-4 text-brand-deep" />}
      className="rounded-xl border border-border bg-card shadow-xs"
      bodyClassName="p-0"
    >
      <div className="grid grid-cols-2 divide-y divide-x sm:divide-y-0 sm:grid-cols-4 divide-border border-b border-border bg-secondary/15">
        <div className="flex items-center justify-between p-2.5 sm:p-3">
          <span className="text-xs font-medium text-muted-foreground truncate">
            {t("adm.content.drafts")}
          </span>
          <span className="code-id text-sm font-bold tabular-nums text-foreground ms-2">
            {data.content.drafts}
          </span>
        </div>
        <div className="flex items-center justify-between p-2.5 sm:p-3">
          <span className="text-xs font-medium text-muted-foreground truncate">
            {t("adm.content.missingAr")}
          </span>
          <span
            className={cn(
              "code-id text-sm font-bold tabular-nums ms-2",
              data.content.missingAr > 0 ? "text-status-delayed" : "text-foreground",
            )}
          >
            {data.content.missingAr}
          </span>
        </div>
        <div className="flex items-center justify-between p-2.5 sm:p-3">
          <span className="text-xs font-medium text-muted-foreground truncate">
            {t("adm.content.awaitingSource")}
          </span>
          <span
            className={cn(
              "code-id text-sm font-bold tabular-nums ms-2",
              data.content.awaitingSource > 0 ? "text-status-delayed" : "text-foreground",
            )}
          >
            {data.content.awaitingSource}
          </span>
        </div>
        <div className="flex items-center justify-between p-2.5 sm:p-3">
          <span className="text-xs font-medium text-muted-foreground truncate">
            {t("adm.content.published")}
          </span>
          <span className="code-id text-sm font-bold tabular-nums text-brand-deep ms-2">
            {data.content.published}
          </span>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {data.content.items.slice(0, 4).map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 sm:px-4">
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
              {t(c.titleKey)}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <ContentStateChip state={c.state} />
              <BilingualStatus missingAr={c.missingAr ?? false} />
            </div>
          </li>
        ))}
      </ul>
    </AdminPanel>
  );

  const recentBookingsPanel = (
    <AdminPanel
      title={t("adm.dash.recent")}
      icon={<Ticket className="size-4 text-clay-deep" />}
      badge={
        <span className="text-xs font-mono font-medium text-muted-foreground">
          ({data.recent.length})
        </span>
      }
      className="rounded-xl border border-border bg-card shadow-xs"
      bodyClassName="p-0"
    >
      {data.recent.length === 0 ? (
        <AdminEmpty title={t("adm.recent.empty")} body={t("adm.recent.emptyBody")} />
      ) : (
        <>
          {/* Mobile compact card list */}
          <ul className="divide-y divide-border sm:hidden">
            {data.recent.map((b) => {
              const lead = b.passengers[0];
              const checked = checkedInPax(b, "out").length;
              const total = seatedPassengers(b).length;
              return (
                <li key={`${b.ref}-m`} className="space-y-1.5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <AppLink
                      to="/admin/bookings/$ref"
                      params={{ ref: b.ref }}
                      className="text-sm font-bold text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Ltr>{b.ref}</Ltr>
                    </AppLink>
                    <AdminChip tone={b.status === "cancelled" ? "danger" : "brand"}>
                      {t(`adm.booking.${b.status}`)}
                    </AdminChip>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium text-foreground">
                      {`${lead?.firstName ?? ""} ${lead?.lastName ?? ""}`.trim() || "—"}
                    </span>
                    <Ltr className="shrink-0 text-muted-foreground">
                      {`${b.outbound.originCode} → ${b.outbound.destinationCode}`}
                    </Ltr>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-0.5 text-xs text-muted-foreground">
                    <span>{dateShort(b.outbound.date, lang)}</span>
                    {b.status === "cancelled" ? (
                      <span>—</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className="h-1 w-10 overflow-hidden rounded-full bg-secondary shrink-0"
                        >
                          <span
                            className={cn(
                              "block h-full rounded-full",
                              checked === total && total > 0 ? "bg-brand" : "bg-primary",
                            )}
                            style={{
                              width: `${total > 0 ? Math.round((checked / total) * 100) : 0}%`,
                            }}
                          />
                        </span>
                        <AdminChip
                          tone={checked === total && total > 0 ? "brand" : "neutral"}
                          className="text-[11px] px-1.5 py-0"
                        >
                          {t("adm.flight.checkedOf", { n: checked, total })}
                        </AdminChip>
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop / tablet table */}
          <div className="hidden overflow-x-auto sm:block">
            <GazaTable className="w-full min-w-[34rem] text-sm">
              <GazaTableCaption>{t("adm.dash.recent")}</GazaTableCaption>
              <GazaTableHeader>
                <GazaTableRow className="border-b border-border type-th">
                  <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                    {t("adm.col.pnr")}
                  </GazaTableHead>
                  <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                    {t("adm.col.passenger")}
                  </GazaTableHead>
                  <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                    {t("adm.col.route")}
                  </GazaTableHead>
                  <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                    {t("adm.col.date")}
                  </GazaTableHead>
                  <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                    {t("adm.col.checkin")}
                  </GazaTableHead>
                  <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">
                    {t("adm.col.status")}
                  </GazaTableHead>
                </GazaTableRow>
              </GazaTableHeader>
              <GazaTableBody>
                {data.recent.map((b) => {
                  const lead = b.passengers[0];
                  const checked = checkedInPax(b, "out").length;
                  const total = seatedPassengers(b).length;
                  return (
                    <GazaTableRow key={b.ref} className="border-b border-border last:border-0">
                      <GazaTableCell className="px-3 py-2">
                        <AppLink
                          to="/admin/bookings/$ref"
                          params={{ ref: b.ref }}
                          className="font-bold text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Ltr>{b.ref}</Ltr>
                        </AppLink>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        {`${lead?.firstName ?? ""} ${lead?.lastName ?? ""}`.trim() || "—"}
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        <Ltr>{`${b.outbound.originCode} → ${b.outbound.destinationCode}`}</Ltr>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2 text-muted-foreground">
                        {dateShort(b.outbound.date, lang)}
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        {b.status === "cancelled" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : total === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="h-1.5 w-12 overflow-hidden rounded-full bg-secondary shrink-0"
                            >
                              <span
                                className={cn(
                                  "block h-full rounded-full transition-all",
                                  checked === total
                                    ? "bg-brand"
                                    : checked > 0
                                      ? "bg-primary"
                                      : "bg-muted-foreground/30",
                                )}
                                style={{ width: `${Math.round((checked / total) * 100)}%` }}
                              />
                            </span>
                            <span className="text-xs font-medium tabular-nums text-muted-foreground">
                              {checked}/{total}
                            </span>
                            {checked === total ? (
                              <span
                                className="inline-flex size-1.5 rounded-full bg-brand shrink-0"
                                aria-hidden="true"
                              />
                            ) : null}
                            <span className="sr-only">
                              {t("adm.flight.checkedOf", { n: checked, total })}
                            </span>
                          </div>
                        )}
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        <AdminChip tone={b.status === "cancelled" ? "danger" : "brand"}>
                          {t(`adm.booking.${b.status}`)}
                        </AdminChip>
                      </GazaTableCell>
                    </GazaTableRow>
                  );
                })}
              </GazaTableBody>
            </GazaTable>
          </div>
        </>
      )}
    </AdminPanel>
  );

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={t("adm.dash.title")}
        description={t("adm.dash.sub", { date: dateLong(data.today, lang) })}
        action={
          mayOps ? (
            <AppLink to="/admin/flights" className={btnClass("outline", "sm")}>
              {t("adm.dash.allFlights")}
            </AppLink>
          ) : null
        }
      />

      {/* D1. Single operational summary surface (Departures, Arrivals, Bookings, Passengers) */}
      {summaryMetrics.length > 0 ? (
        <section
          aria-label={t("adm.dash.today")}
          data-testid="operations-summary"
          className="overflow-hidden rounded-xl border border-border bg-card shadow-xs"
        >
          <div
            className={cn(
              "grid divide-y divide-border sm:divide-y-0 sm:divide-x rtl:sm:divide-x-reverse",
              summaryMetrics.length === 4
                ? "grid-cols-2 sm:grid-cols-4"
                : summaryMetrics.length === 2
                  ? "grid-cols-2"
                  : "grid-cols-1 sm:grid-cols-3",
            )}
          >
            {summaryMetrics.map((m) => {
              const Icon = m.icon;
              return (
                <div
                  key={m.key}
                  className="flex items-center justify-between gap-2.5 p-3 sm:px-5 sm:py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-muted-foreground leading-snug">
                      {m.label}
                    </span>
                    <span className="code-id mt-0.5 block text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums">
                      {m.value}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "flex size-8.5 sm:size-9 shrink-0 items-center justify-center rounded-lg border",
                      m.wellClass,
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="size-4 sm:size-4.5" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* D2. Restrained secondary irregularity line */}
          {hasIrregularity ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-sand/30 px-4 py-2 text-xs">
              <span className="font-semibold text-muted-foreground">{t("adm.dash.today")}:</span>
              {data.metrics.delayed > 0 ? (
                <span className="inline-flex items-center gap-1 font-medium text-status-delayed">
                  <span className="size-1.5 rounded-full bg-status-delayed" aria-hidden="true" />
                  <span className="tabular-nums">{data.metrics.delayed}</span>{" "}
                  {t("adm.dash.delayed")}
                </span>
              ) : null}
              {data.metrics.delayed > 0 && data.metrics.cancelled > 0 ? (
                <span aria-hidden="true" className="text-muted-foreground/40">
                  ·
                </span>
              ) : null}
              {data.metrics.cancelled > 0 ? (
                <span className="inline-flex items-center gap-1 font-medium text-status-cancelled">
                  <span className="size-1.5 rounded-full bg-status-cancelled" aria-hidden="true" />
                  <span className="tabular-nums">{data.metrics.cancelled}</span>{" "}
                  {t("adm.dash.cancelled")}
                </span>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Operation Board — Full Width */}
      {mayOps ? <div className="w-full">{operationPanel}</div> : null}

      {/* Secondary section: Recent Bookings + Secondary Rails */}
      {mayCommercial && (data.attention.length > 0 || mayContent) ? (
        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-12">
          {/* Recent Bookings: full width below 1536px, 8-col on >= 1536px */}
          <div className="w-full 2xl:col-span-8">{recentBookingsPanel}</div>

          {/* Secondary rails: 2-column row on tablet/desktop (768px-1535px), stacked right rail on >= 1536px */}
          <div
            id="attention"
            className="w-full space-y-5 2xl:col-span-4 md:max-2xl:grid md:max-2xl:grid-cols-2 md:max-2xl:gap-5 md:max-2xl:space-y-0"
          >
            {attentionPanel}
            {mayContent ? contentPanel : null}
          </div>
        </div>
      ) : mayCommercial ? (
        <div className="w-full">{recentBookingsPanel}</div>
      ) : mayOps && (data.attention.length > 0 || mayContent) ? (
        <div id="attention" className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {attentionPanel}
          {mayContent ? contentPanel : null}
        </div>
      ) : data.attention.length > 0 || mayContent ? (
        /* Content Editor / viewer / other restricted role layout */
        <div id="attention" className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {attentionPanel}
          {mayContent ? contentPanel : null}
        </div>
      ) : null}

      {/* Quick-edit drawer */}
      <GazaSheet
        open={edit !== null}
        title={edit ? t("adm.edit.title", { flight: edit.flight.number }) : ""}
        description={t("adm.edit.sub")}
        onClose={() => setEdit(null)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setEdit(null)}
              className={btnClass("outline", "sm")}
            >
              {t("adm.edit.cancel")}
            </button>
            <PermissionButton
              allowed={mayEditOps}
              reason={t("adm.edit.readOnly")}
              variant="primary"
              onClick={save}
            >
              {t("adm.edit.save")}
            </PermissionButton>
          </>
        }
      >
        {edit ? (
          <div className="space-y-4">
            <p className="text-sm">
              <Ltr className="font-bold">{edit.flight.number}</Ltr>{" "}
              <Ltr className="text-muted-foreground">{`${edit.flight.originCode} → ${edit.flight.destinationCode}`}</Ltr>
            </p>
            <Field label={t("adm.edit.status")} htmlFor="qe-status">
              <Select
                id="qe-status"
                value={edit.status}
                onChange={(e) => setEdit({ ...edit, status: e.target.value as FlightStatus })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("adm.edit.terminal")} htmlFor="qe-terminal">
                <Input
                  id="qe-terminal"
                  dir="ltr"
                  value={edit.terminal}
                  onChange={(e) => setEdit({ ...edit, terminal: e.target.value })}
                />
              </Field>
              <Field label={t("adm.edit.gate")} htmlFor="qe-gate">
                <Input
                  id="qe-gate"
                  dir="ltr"
                  value={edit.gate}
                  onChange={(e) => setEdit({ ...edit, gate: e.target.value })}
                />
              </Field>
            </div>
            <Field label={t("adm.edit.revised")} htmlFor="qe-revised">
              <Input
                id="qe-revised"
                type="time"
                dir="ltr"
                value={edit.revised}
                onChange={(e) => setEdit({ ...edit, revised: e.target.value })}
              />
            </Field>
            <Field label={t("adm.edit.note")} htmlFor="qe-note">
              <Textarea
                id="qe-note"
                value={edit.note}
                placeholder={t("adm.edit.notePlaceholder")}
                onChange={(e) => setEdit({ ...edit, note: e.target.value })}
                className="min-h-20"
              />
            </Field>
            {!mayEditOps ? (
              <p className="text-xs text-muted-foreground">{t("adm.edit.readOnly")}</p>
            ) : null}
          </div>
        ) : null}
      </GazaSheet>
    </div>
  );
}
