import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
  const mayEditOps = can("ops.edit");
  const { bookings } = useStore();

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

  const quickActions = [
    { key: "adm.quick.schedule", permission: "ops.edit" as const },
    { key: "adm.quick.booking", permission: "commercial.edit" as const },
    { key: "adm.quick.media", permission: "content.edit" as const },
    { key: "adm.quick.archive", permission: "content.edit" as const },
    { key: "adm.quick.homepage", permission: "content.edit" as const },
  ];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("adm.dash.title")}
        description={t("adm.dash.sub", { date: dateLong(data.today, lang) })}
        action={
          <button
            type="button"
            onClick={() => toast(t("adm.quick.later", { action: t("adm.dash.allFlights") }))}
            className={btnClass("outline", "sm")}
          >
            {t("adm.dash.allFlights")}
          </button>
        }
      />

      {/* A. Today summary */}
      <section aria-label={t("adm.dash.today")}>
        <h2 className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {t("adm.dash.today")}
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
          <Metric label={t("adm.dash.departures")} value={data.metrics.departures} emphasis />
          <Metric label={t("adm.dash.arrivals")} value={data.metrics.arrivals} emphasis />
          <Metric label={t("adm.dash.bookings")} value={data.metrics.bookingsToday} />
          <Metric label={t("adm.dash.passengers")} value={data.metrics.passengersTravelling} />
          <Metric label={t("adm.dash.checkedIn")} value={data.metrics.passengersCheckedIn} tone="brand" />
          <Metric label={t("adm.dash.delayed")} value={data.metrics.delayed} tone={data.metrics.delayed ? "warn" : "neutral"} />
          <Metric
            label={t("adm.dash.cancelled")}
            value={data.metrics.cancelled}
            tone={data.metrics.cancelled ? "danger" : "neutral"}
          />
          <Metric label={t("adm.dash.enquiries")} value={data.metrics.enquiries} />
          <Metric label={t("adm.dash.contentAttention")} value={data.metrics.contentAttention} />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* B. Today's operation */}
        <AdminPanel title={t("adm.dash.operation")} description={t("adm.dash.operationSub")} bodyClassName="p-0">
          {/* Desktop table */}
          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[58rem] text-sm">
              <thead>
                <tr className="border-b border-border text-start text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.time")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.flight")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.route")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.aircraft")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.gate")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.load")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.checkin")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.status")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-bold">{t("adm.col.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {data.operation.map((f) => (
                  <tr key={`${f.id}-${f.direction}`} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
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
                    </td>
                    <td className="px-3 py-2">
                      <Ltr className="font-bold">{f.number}</Ltr>
                    </td>
                    <td className="px-3 py-2">
                      <Ltr>{`${f.originCode} → ${f.destinationCode}`}</Ltr>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <Ltr>{f.aircraft}</Ltr>
                    </td>
                    <td className="px-3 py-2">
                      {f.gate ? (
                        <Ltr>{`${f.terminal} · ${f.gate}`}</Ltr>
                      ) : (
                        <AdminChip tone="warn">{t("adm.flight.noGate")}</AdminChip>
                      )}
                    </td>
                    <td className="px-3 py-2">
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
                    </td>
                    <td className="px-3 py-2">
                      {checkinFor(f).total === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <AdminChip tone={checkinFor(f).checked === checkinFor(f).total ? "brand" : "neutral"}>
                          {t("adm.flight.checkedOf", { n: checkinFor(f).checked, total: checkinFor(f).total })}
                        </AdminChip>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={f.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-end">
                      <PermissionButton
                        allowed={mayEditOps}
                        reason={t("adm.edit.readOnly")}
                        onClick={() => openEdit(f)}
                      >
                        {t("adm.flight.quickEdit")}
                      </PermissionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

        {/* C. Needs attention */}
        <div id="attention" className="space-y-4">
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

          {/* E. Content status */}
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
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* D. Recent bookings */}
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
                        <Ltr className="text-sm font-bold">{b.ref}</Ltr>
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
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="border-b border-border text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                      <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.pnr")}</th>
                      <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.passenger")}</th>
                      <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.route")}</th>
                      <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.date")}</th>
                      <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.checkin")}</th>
                      <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((b) => {
                      const lead = b.passengers[0];
                      const checked = checkedInPax(b, "out").length;
                      const total = seatedPassengers(b).length;
                      return (
                        <tr key={b.ref} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">
                            <Ltr className="font-bold">{b.ref}</Ltr>
                          </td>
                          <td className="px-3 py-2">{`${lead?.firstName ?? ""} ${lead?.lastName ?? ""}`.trim() || "—"}</td>
                          <td className="px-3 py-2">
                            <Ltr>{`${b.outbound.originCode} → ${b.outbound.destinationCode}`}</Ltr>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{dateShort(b.outbound.date, lang)}</td>
                          <td className="px-3 py-2">
                            {b.status === "cancelled" ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <AdminChip tone={checked === total && total > 0 ? "brand" : "neutral"}>
                                {t("adm.flight.checkedOf", { n: checked, total })}
                              </AdminChip>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <AdminChip tone={b.status === "cancelled" ? "danger" : "brand"}>
                              {t(`adm.booking.${b.status}`)}
                            </AdminChip>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </AdminPanel>

        {/* F. Quick actions */}
        <AdminPanel title={t("adm.dash.quick")}>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => {
              const label = t(action.key);
              const allowed = can(action.permission);
              return (
                <PermissionButton
                  key={action.key}
                  allowed={allowed}
                  reason={t("adm.quick.noPermission")}
                  onClick={() => toast(t("adm.quick.later", { action: label }))}
                >
                  {label}
                </PermissionButton>
              );
            })}
            <button
              type="button"
              onClick={() => toast(t("adm.quick.later", { action: t("adm.quick.findBooking") }))}
              className={btnClass("primary", "sm")}
            >
              {t("adm.quick.findBooking")}
            </button>
          </div>
        </AdminPanel>
      </div>

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
