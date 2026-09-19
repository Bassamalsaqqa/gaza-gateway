import { GazaTable, GazaTableBody, GazaTableCaption, GazaTableCell, GazaTableHead, GazaTableHeader, GazaTableRow } from "@/components/gaza-table";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PlaneLanding, PlaneTakeoff } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { Field, Input, Select, Textarea, btnClass } from "@/components/kit";
import { StatusBadge } from "@/components/flight-status";
import {
  AdminChip,
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  AdminSheet,
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

const STATUSES: FlightStatus[] = ["Scheduled", "OnTime", "Boarding", "Delayed", "Departed", "Landed", "Cancelled"];
const CAPACITY = SEAT_ROWS * SEAT_LETTERS.length;

export const Route = createFileRoute("/{-$locale}/admin/")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin",
      en: {
        title: "Dashboard — Gaza International Airport administration",
        description: "Today's departures, arrivals, bookings and content status for Gaza International Airport staff.",
      },
      ar: {
        title: "لوحة المتابعة — إدارة مطار غزة الدولي",
        description: "مغادرات اليوم والقادمة والحجوزات وحالة المحتوى لموظفي مطار غزة الدولي.",
      },
      noindex: true,
    }),
  component: AdminDashboardPage,
});

type EditState = { flight: OpsFlight; status: FlightStatus; gate: string; terminal: string; revised: string; note: string };

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
        { key: "dep", show: mayOps, label: t("adm.dash.departures"), value: data.metrics.departures, emphasis: true },
        { key: "arr", show: mayOps, label: t("adm.dash.arrivals"), value: data.metrics.arrivals, emphasis: true },
        { key: "bks", show: mayCommercial, label: t("adm.dash.bookings"), value: data.metrics.bookingsToday },
        { key: "pax", show: mayCommercial, label: t("adm.dash.passengers"), value: data.metrics.passengersTravelling },
        { key: "chk", show: mayCommercial, label: t("adm.dash.checkedIn"), value: data.metrics.passengersCheckedIn, tone: "brand" as const },
        { key: "del", show: mayOps, label: t("adm.dash.delayed"), value: data.metrics.delayed, tone: data.metrics.delayed ? ("warn" as const) : ("neutral" as const) },
        { key: "cxl", show: mayOps, label: t("adm.dash.cancelled"), value: data.metrics.cancelled, tone: data.metrics.cancelled ? ("danger" as const) : ("neutral" as const) },
        { key: "enq", show: mayEngagement, label: t("adm.dash.enquiries"), value: data.metrics.enquiries },
        { key: "cnt", show: mayContent, label: t("adm.dash.contentAttention"), value: data.metrics.contentAttention },
      ].filter((m) => m.show),
    [mayOps, mayCommercial, mayContent, mayEngagement, data.metrics, t],
  );

  const quickActions = useMemo(
    () =>
      [
        { key: "adm.quick.schedule", to: "/admin/schedules", permission: "ops.edit" as const, show: mayOps },
        { key: "adm.quick.booking", to: "/admin/bookings/new", permission: "commercial.edit" as const, show: mayCommercial },
        { key: "adm.quick.media", to: "/admin/website", permission: "content.edit" as const, show: mayContent },
        { key: "adm.quick.archive", to: "/admin/airport", permission: "content.edit" as const, show: mayContent },
        { key: "adm.quick.homepage", to: "/admin/website", permission: "content.edit" as const, show: mayContent },
      ].filter((a) => a.show),
    [mayOps, mayCommercial, mayContent],
  );

  const operationPanel = (
    <AdminPanel title={t("adm.dash.operation")} description={t("adm.dash.operationSub")} bodyClassName="p-0">
      {/* Desktop table */}
      <div className="hidden overflow-x-auto xl:block">
        <GazaTable className="w-full min-w-[58rem] text-sm">
          <GazaTableCaption>{t("adm.dash.operation")}</GazaTableCaption>
          <GazaTableHeader>
            <GazaTableRow className="border-b border-border type-th">
              <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.time")}</GazaTableHead>
              <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.flight")}</GazaTableHead>
              <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.route")}</GazaTableHead>
              <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.aircraft")}</GazaTableHead>
              <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.gate")}</GazaTableHead>
              <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.load")}</GazaTableHead>
              <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.checkin")}</GazaTableHead>
              <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.status")}</GazaTableHead>
              <GazaTableHead scope="col" className="px-3 py-2 text-end font-bold">{t("adm.col.actions")}</GazaTableHead>
            </GazaTableRow>
          </GazaTableHeader>
          <GazaTableBody>
            {data.operation.map((f) => (
              <GazaTableRow key={`${f.id}-${f.direction}`} className="border-b border-border last:border-0">
                <GazaTableCell className="px-3 py-2">
                  <Ltr className="font-semibold">{f.direction === "dep" ? f.departTime : f.arriveTime}</Ltr>
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
                    <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                      <span
                        className="block h-full rounded-full bg-brand"
                        style={{ width: `${Math.round((loadOf(f) / CAPACITY) * 100)}%` }}
                      />
                    </span>
                    <Ltr className="text-xs text-muted-foreground">{`${loadOf(f)}/${CAPACITY}`}</Ltr>
                  </span>
                  <span className="sr-only">{t("adm.flight.loadOf", { n: loadOf(f), total: CAPACITY })}</span>
                </GazaTableCell>
                <GazaTableCell className="px-3 py-2">
                  {checkinFor(f).total === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <AdminChip tone={checkinFor(f).checked === checkinFor(f).total ? "brand" : "neutral"}>
                      {t("adm.flight.checkedOf", { n: checkinFor(f).checked, total: checkinFor(f).total })}
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
            <li key={`${f.id}-${f.direction}-m`} className="border-b border-border px-3 py-3 last:border-0">
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
                {f.gate ? <Ltr>{`${f.terminal} · ${f.gate}`}</Ltr> : <AdminChip tone="warn">{t("adm.flight.noGate")}</AdminChip>}
                <Ltr>{`${loadOf(f)}/${CAPACITY}`}</Ltr>
                {ci.total > 0 ? (
                  <AdminChip tone={ci.checked === ci.total ? "brand" : "neutral"}>
                    {t("adm.flight.checkedOf", { n: ci.checked, total: ci.total })}
                  </AdminChip>
                ) : null}
              </div>
              {f.note ? <p className="mt-1 text-xs text-accent-foreground">{f.note}</p> : null}
              <div className="mt-2">
                <PermissionButton allowed={mayEditOps} reason={t("adm.edit.readOnly")} onClick={() => openEdit(f)}>
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
    <AdminPanel title={t("adm.dash.attention")} bodyClassName="p-0">
      {data.attention.length === 0 ? (
        <AdminEmpty title={t("adm.attn.none")} />
      ) : (
        <ul className="max-h-[26rem] overflow-y-auto">
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
    <AdminPanel title={t("adm.dash.content")} bodyClassName="p-0">
      <div className="grid grid-cols-2 gap-2 p-3">
        <Metric label={t("adm.content.drafts")} value={data.content.drafts} />
        <Metric label={t("adm.content.missingAr")} value={data.content.missingAr} tone="warn" />
        <Metric label={t("adm.content.awaitingSource")} value={data.content.awaitingSource} tone="warn" />
        <Metric label={t("adm.content.published")} value={data.content.published} tone="brand" />
      </div>
      <ul className="border-t border-border">
        {data.content.items.slice(0, 4).map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 last:border-0">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t(c.titleKey)}</span>
            <ContentStateChip state={c.state} />
            <BilingualStatus missingAr={c.missingAr ?? false} />
          </li>
        ))}
      </ul>
    </AdminPanel>
  );

  const recentBookingsPanel = (
    <AdminPanel title={t("adm.dash.recent")} bodyClassName="p-0">
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
                      <AdminChip tone={checked === total && total > 0 ? "brand" : "neutral"}>
                        {t("adm.flight.checkedOf", { n: checked, total })}
                      </AdminChip>
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
                  <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.pnr")}</GazaTableHead>
                  <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.passenger")}</GazaTableHead>
                  <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.route")}</GazaTableHead>
                  <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.date")}</GazaTableHead>
                  <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.checkin")}</GazaTableHead>
                  <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.status")}</GazaTableHead>
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
                      <GazaTableCell className="px-3 py-2">{`${lead?.firstName ?? ""} ${lead?.lastName ?? ""}`.trim() || "—"}</GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        <Ltr>{`${b.outbound.originCode} → ${b.outbound.destinationCode}`}</Ltr>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2 text-muted-foreground">{dateShort(b.outbound.date, lang)}</GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        {b.status === "cancelled" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <AdminChip tone={checked === total && total > 0 ? "brand" : "neutral"}>
                            {t("adm.flight.checkedOf", { n: checked, total })}
                          </AdminChip>
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

  const quickActionsPanel = (
    <AdminPanel title={t("adm.dash.quick")}>
      <div className="flex flex-wrap gap-2">
        {quickActions.map((action) => {
          const label = t(action.key);
          const allowed = can(action.permission);
          if (!allowed) {
            return (
              <PermissionButton
                key={action.key}
                allowed={false}
                reason={t("adm.quick.noPermission")}
              >
                {label}
              </PermissionButton>
            );
          }
          return (
            <AppLink
              key={action.key}
              to={action.to}
              className={btnClass("outline", "sm")}
            >
              {label}
            </AppLink>
          );
        })}
        {mayCommercial ? (
          <AppLink
            to="/admin/bookings"
            className={btnClass("primary", "sm")}
          >
            {t("adm.quick.findBooking")}
          </AppLink>
        ) : null}
      </div>
    </AdminPanel>
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("adm.dash.title")}
        description={t("adm.dash.sub", { date: dateLong(data.today, lang) })}
        meta={
          <div className="flex items-center gap-2">
            <AdminChip tone="muted" className="text-[11px]">
              {t("adm.shell.simulation")}
            </AdminChip>
          </div>
        }
        action={
          mayOps ? (
            <AppLink
              to="/admin/flights"
              className={btnClass("outline", "sm")}
            >
              {t("adm.dash.allFlights")}
            </AppLink>
          ) : null
        }
      />

      {/* A. Today summary */}
      {summaryMetrics.length > 0 ? (
        <section aria-label={t("adm.dash.today")}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("adm.dash.today")}
          </h2>
          <div
            className={cn(
              "grid gap-2",
              summaryMetrics.length <= 2
                ? "grid-cols-2"
                : summaryMetrics.length <= 4
                  ? "grid-cols-2 sm:grid-cols-4"
                  : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9",
            )}
          >
            {summaryMetrics.map((m) => (
              <Metric key={m.key} label={m.label} value={m.value} emphasis={m.emphasis} tone={m.tone} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Dynamic layout based on available domains */}
      {mayOps && mayCommercial ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            {operationPanel}
            <div id="attention" className="space-y-4">
              {attentionPanel}
              {mayContent ? contentPanel : null}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            {recentBookingsPanel}
            {quickActionsPanel}
          </div>
        </>
      ) : mayOps && !mayCommercial ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            {operationPanel}
            <div id="attention" className="space-y-4">
              {attentionPanel}
              {mayContent ? contentPanel : null}
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)]">
            {quickActionsPanel}
          </div>
        </>
      ) : !mayOps && mayCommercial ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            {recentBookingsPanel}
            <div id="attention" className="space-y-4">
              {attentionPanel}
              {mayContent ? contentPanel : null}
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)]">
            {quickActionsPanel}
          </div>
        </>
      ) : (
        /* Content Editor / content-only layout */
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {mayContent ? contentPanel : null}
          <div id="attention" className="space-y-4">
            {attentionPanel}
            {quickActionsPanel}
          </div>
        </div>
      )}

      {/* Quick-edit drawer */}
      <AdminSheet
        open={edit !== null}
        title={edit ? t("adm.edit.title", { flight: edit.flight.number }) : ""}
        description={t("adm.edit.sub")}
        onClose={() => setEdit(null)}
        footer={
          <>
            <button type="button" onClick={() => setEdit(null)} className={btnClass("outline", "sm")}>
              {t("adm.edit.cancel")}
            </button>
            <PermissionButton allowed={mayEditOps} reason={t("adm.edit.readOnly")} variant="primary" onClick={save}>
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
                <Input id="qe-terminal" dir="ltr" value={edit.terminal} onChange={(e) => setEdit({ ...edit, terminal: e.target.value })} />
              </Field>
              <Field label={t("adm.edit.gate")} htmlFor="qe-gate">
                <Input id="qe-gate" dir="ltr" value={edit.gate} onChange={(e) => setEdit({ ...edit, gate: e.target.value })} />
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
            {!mayEditOps ? <p className="text-xs text-muted-foreground">{t("adm.edit.readOnly")}</p> : null}
          </div>
        ) : null}
      </AdminSheet>
    </div>
  );
}
