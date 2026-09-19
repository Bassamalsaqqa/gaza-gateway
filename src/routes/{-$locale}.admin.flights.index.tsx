import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PlaneLanding, PlaneTakeoff } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { Input, Select, btnClass } from "@/components/kit";
import { StatusBadge } from "@/components/flight-status";
import {
  AdminChip,
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  Ltr,
  PermissionButton,
  Toolbar,
} from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import {
  FLIGHT_STATUSES,
  GATE_IDENTIFIER_PATTERN,
  FlightQuickEdit,
  type QuickEditFlight,
} from "@/components/admin/flight-quick-edit";
import { useAdmin } from "@/lib/admin-store";
import { useI18n, pick } from "@/lib/i18n";
import { dateLong } from "@/lib/format";
import {
  SEAT_LETTERS,
  SEAT_ROWS,
  arrivalsOn,
  departuresOn,
  destinationByCode,
  destinations,
  todayISO,
  type FlightStatus,
} from "@/lib/data";
import { checkedInPax, seatedPassengers, useStore } from "@/lib/store";
import { pageHead } from "@/lib/head";

const CAPACITY = SEAT_ROWS * SEAT_LETTERS.length;

export const Route = createFileRoute("/{-$locale}/admin/flights/")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/flights",
      en: {
        title: "Flights — Gaza International Airport administration",
        description: "Dated departures and arrivals at Gaza International Airport for airport staff.",
      },
      ar: {
        title: "الرحلات — إدارة مطار غزة الدولي",
        description: "المغادرات والقادمة بتواريخها في مطار غزة الدولي لموظفي المطار.",
      },
      noindex: true,
    }),
  component: AdminFlightsPage,
});

type Direction = "all" | "dep" | "arr";

function AdminFlightsPage() {
  const { t, lang } = useI18n();
  const { can, withOverride, applyOverride, toast } = useAdmin();
  const { bookings } = useStore();
  const urlSearch = useRouterState({
    select: (s) => (s.location.search as Record<string, string | undefined>) || {},
  });

  const [date, setDate] = useState(todayISO());
  const [direction, setDirection] = useState<Direction>("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<FlightStatus | "all">("all");
  const [route, setRoute] = useState("all");
  const [edit, setEdit] = useState<QuickEditFlight | null>(null);
  const [editingGate, setEditingGate] = useState<{ flightId: string; value: string; error?: string | undefined } | null>(null);

  useEffect(() => {
    const dir = urlSearch["dir"];
    const st = urlSearch["status"];
    if (dir === "dep" || dir === "arr" || dir === "all") {
      setDirection(dir);
    }
    if (
      st &&
      ["scheduled", "boarding", "delayed", "departed", "arrived", "cancelled", "all"].includes(st)
    ) {
      setStatus(st as FlightStatus | "all");
    }
  }, [urlSearch]);

  const mayEdit = can("ops.edit");

  const handleSaveGate = (flightId: string) => {
    if (!editingGate) return;
    const trimmed = editingGate.value.trim();
    if (!GATE_IDENTIFIER_PATTERN.test(trimmed)) {
      setEditingGate({ ...editingGate, error: t("adm.flight.gateError") });
      return;
    }
    applyOverride(flightId, { gate: trimmed });
    const fl = rows.find((r) => r.id === flightId);
    toast(t("adm.edit.saved", { flight: fl?.number ?? flightId }));
    setEditingGate(null);
  };

  const rows = useMemo(() => {
    const dep = departuresOn(date).map((f) => ({ ...withOverride(f), direction: "dep" as const }));
    const arr = arrivalsOn(date).map((f) => ({ ...withOverride(f), direction: "arr" as const }));
    let list = direction === "dep" ? dep : direction === "arr" ? arr : [...dep, ...arr];
    list = list.sort((a, b) =>
      (a.direction === "dep" ? a.departTime : a.arriveTime).localeCompare(
        b.direction === "dep" ? b.departTime : b.arriveTime,
      ),
    );
    const q = query.trim().toLowerCase();
    return list.filter((f) => {
      if (status !== "all" && f.status !== status) return false;
      const other = f.direction === "dep" ? f.destinationCode : f.originCode;
      if (route !== "all" && other !== route) return false;
      if (!q) return true;
      const dest = destinationByCode(other);
      const haystack = [f.number, f.originCode, f.destinationCode, dest ? dest.city.en : "", dest ? dest.city.ar : ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [date, direction, query, status, route, withOverride]);

  if (!can("ops.view")) return <AdminDenied area={t("adm.fl.title")} permission="ops.view" />;

  const progress = (flightId: string) => {
    let checked = 0;
    let total = 0;
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      for (const leg of ["out", "in"] as const) {
        const legFlight = leg === "out" ? b.outbound : b.inbound;
        if (legFlight?.id !== flightId) continue;
        total += seatedPassengers(b).length;
        checked += checkedInPax(b, leg).length;
      }
    }
    return { checked, total };
  };

  const clear = () => {
    setDirection("all");
    setQuery("");
    setStatus("all");
    setRoute("all");
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("adm.fl.title")}
        description={t("adm.fl.sub")}
        action={
          <button type="button" onClick={() => setDate(todayISO())} className={btnClass("outline", "sm")}>
            {t("adm.fl.today")}
          </button>
        }
        meta={<p className="text-xs text-muted-foreground">{dateLong(date, lang)}</p>}
      />

      <AdminPanel bodyClassName="p-0">
        <Toolbar>
          <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <span>{t("adm.fl.date")}</span>
            <Input
              dir="ltr"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayISO())}
              className="h-9 w-[10.5rem] text-sm"
              aria-label={t("adm.fl.date")}
            />
          </label>

          <div role="group" aria-label={t("adm.fl.direction")} className="flex rounded-md border border-border">
            {([
              ["all", t("adm.common.all")],
              ["dep", t("adm.fl.departures")],
              ["arr", t("adm.fl.arrivals")],
            ] as [Direction, string][]).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={direction === id}
                onClick={() => setDirection(id)}
                className={`px-2.5 py-1.5 text-xs font-semibold first:rounded-s-md last:rounded-e-md ${
                  direction === id ? "bg-brand-soft text-brand-deep" : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("adm.fl.searchPlaceholder")}
            aria-label={t("adm.fl.searchLabel")}
            className="h-9 w-full min-w-40 max-w-56 text-sm sm:w-56"
          />

          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as FlightStatus | "all")}
            aria-label={t("adm.col.status")}
            className="h-9 w-auto text-sm"
          >
            <option value="all">{t("adm.fl.allStatuses")}</option>
            {FLIGHT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </Select>

          <Select
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            aria-label={t("adm.fl.allRoutes")}
            className="h-9 w-auto text-sm"
          >
            <option value="all">{t("adm.fl.allRoutes")}</option>
            {destinations.map((d) => (
              <option key={d.code} value={d.code}>
                {`${d.code} — ${pick(lang, d.city)}`}
              </option>
            ))}
          </Select>

          <span className="ms-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("adm.common.results", { n: rows.length })}</span>
            <button
              type="button"
              onClick={clear}
              className="rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {t("adm.common.clear")}
            </button>
          </span>
        </Toolbar>

        {rows.length === 0 ? (
          <AdminEmpty title={t("adm.fl.empty")} body={t("adm.fl.emptyBody")} />
        ) : (
          <>
            {/* Wide screens: operational table */}
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[62rem] text-sm">
                <caption className="sr-only">{t("adm.fl.title")}</caption>
                <thead className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur shadow-sm">
                  <tr className="type-th">
                    <th scope="col" className="px-3 py-2.5 text-start font-bold">{t("adm.col.time")}</th>
                    <th scope="col" className="px-3 py-2.5 text-start font-bold">{t("adm.col.flight")}</th>
                    <th scope="col" className="px-3 py-2.5 text-start font-bold">{t("adm.col.route")}</th>
                    <th scope="col" className="px-3 py-2.5 text-start font-bold">{t("adm.col.aircraft")}</th>
                    <th scope="col" className="px-3 py-2.5 text-start font-bold">{t("adm.col.gate")}</th>
                    <th scope="col" className="px-3 py-2.5 text-start font-bold">{t("adm.col.load")}</th>
                    <th scope="col" className="px-3 py-2.5 text-start font-bold">{t("adm.col.checkin")}</th>
                    <th scope="col" className="px-3 py-2.5 text-start font-bold">{t("adm.col.status")}</th>
                    <th scope="col" className="px-3 py-2.5 text-end font-bold">{t("adm.col.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((f) => {
                    const sold = Math.max(0, CAPACITY - f.seatsLeft);
                    const p = progress(f.id);
                    const isEditingThisGate = editingGate?.flightId === f.id;

                    return (
                      <tr key={`${f.id}-${f.direction}`} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
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
                          {isEditingThisGate ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1">
                                <Input
                                  autoFocus
                                  dir="ltr"
                                  value={editingGate.value}
                                  onChange={(e) => setEditingGate({ ...editingGate, value: e.target.value, error: undefined })}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveGate(f.id);
                                    if (e.key === "Escape") setEditingGate(null);
                                  }}
                                  className="h-7 w-20 px-1.5 text-xs font-semibold"
                                  aria-label={t("adm.flight.inlineGate", { flight: f.number })}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveGate(f.id)}
                                  className="rounded bg-primary px-1.5 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring"
                                >
                                  {t("adm.flight.inlineSave")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingGate(null)}
                                  className="rounded border border-border px-1.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
                                >
                                  {t("adm.flight.inlineCancel")}
                                </button>
                              </div>
                              {editingGate.error ? (
                                <span role="alert" className="text-[10px] font-semibold text-status-cancelled">
                                  {editingGate.error}
                                </span>
                              ) : null}
                            </div>
                          ) : mayEdit ? (
                            <button
                              type="button"
                              onClick={() => setEditingGate({ flightId: f.id, value: f.gate || "" })}
                              aria-label={t("adm.flight.inlineGate", { flight: f.number })}
                              title={t("adm.flight.inlineGate", { flight: f.number })}
                              className="group flex items-center gap-1 rounded px-1.5 py-1 text-start hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
                            >
                              {f.gate ? (
                                <Ltr className="font-semibold text-foreground group-hover:text-primary">{`${f.terminal} · ${f.gate}`}</Ltr>
                              ) : (
                                <AdminChip tone="warn">{t("adm.flight.noGate")}</AdminChip>
                              )}
                              <span aria-hidden="true" className="text-[11px] text-muted-foreground group-hover:text-foreground">✎</span>
                            </button>
                          ) : f.gate ? (
                            <Ltr>{`${f.terminal} · ${f.gate}`}</Ltr>
                          ) : (
                            <AdminChip tone="warn">{t("adm.flight.noGate")}</AdminChip>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Ltr className="text-xs text-muted-foreground">{`${sold}/${CAPACITY}`}</Ltr>
                          <span className="sr-only">{t("adm.flight.loadOf", { n: sold, total: CAPACITY })}</span>
                        </td>
                        <td className="px-3 py-2">
                          <AdminChip tone={p.total > 0 && p.checked === p.total ? "brand" : "neutral"}>
                            {t("adm.flight.checkedOf", { n: p.checked, total: p.total })}
                          </AdminChip>
                        </td>
                        <td className="px-3 py-2">
                          {mayEdit ? (
                            <select
                              aria-label={t("adm.flight.inlineStatus", { flight: f.number })}
                              value={f.status}
                              onChange={(e) => {
                                const newStatus = e.target.value as FlightStatus;
                                applyOverride(f.id, { status: newStatus });
                                toast(t("adm.edit.saved", { flight: f.number }));
                              }}
                              className="h-8 rounded-md border border-border bg-card px-2 text-xs font-semibold text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                              {FLIGHT_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {t(`status.${s}`)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <StatusBadge status={f.status} />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className="flex flex-wrap justify-end gap-1.5">
                            <PermissionButton
                              allowed={mayEdit}
                              reason={t("adm.edit.readOnly")}
                              onClick={() => setEdit(f)}
                            >
                              {t("adm.flight.quickEdit")}
                            </PermissionButton>
                            <AppLink
                              to="/admin/flights/$flightId"
                              params={{ flightId: f.id }}
                              className={btnClass("primary", "sm")}
                            >
                              {t("adm.fl.open")}
                            </AppLink>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Narrow screens: stacked operational records */}
            <ul className="divide-y divide-border xl:hidden">
              {rows.map((f) => {
                const sold = Math.max(0, CAPACITY - f.seatsLeft);
                const p = progress(f.id);
                const isEditingThisGate = editingGate?.flightId === f.id;

                return (
                  <li key={`${f.id}-${f.direction}-card`} className="px-4 py-3.5 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2">
                          <Ltr className="text-base font-bold">
                            {f.direction === "dep" ? f.departTime : f.arriveTime}
                          </Ltr>
                          <Ltr className="font-semibold">{f.number}</Ltr>
                          {f.direction === "dep" ? (
                            <PlaneTakeoff aria-label={t("adm.flight.departure")} className="size-3.5 text-muted-foreground" />
                          ) : (
                            <PlaneLanding aria-label={t("adm.flight.arrival")} className="size-3.5 text-muted-foreground" />
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          <Ltr>{`${f.originCode} → ${f.destinationCode} · ${f.aircraft}`}</Ltr>
                        </p>
                      </div>

                      <div className="shrink-0">
                        {mayEdit ? (
                          <select
                            aria-label={t("adm.flight.inlineStatus", { flight: f.number })}
                            value={f.status}
                            onChange={(e) => {
                              const newStatus = e.target.value as FlightStatus;
                              applyOverride(f.id, { status: newStatus });
                              toast(t("adm.edit.saved", { flight: f.number }));
                            }}
                            className="h-11 min-h-11 rounded-md border border-border bg-card px-2 text-xs font-semibold text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            {FLIGHT_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {t(`status.${s}`)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <StatusBadge status={f.status} />
                        )}
                      </div>
                    </div>

                    <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <div>
                        <dt className="font-semibold text-muted-foreground">{t("adm.col.gate")}</dt>
                        <dd className="mt-0.5">
                          {isEditingThisGate ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1">
                                <Input
                                  autoFocus
                                  dir="ltr"
                                  value={editingGate.value}
                                  onChange={(e) => setEditingGate({ ...editingGate, value: e.target.value, error: undefined })}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveGate(f.id);
                                    if (e.key === "Escape") setEditingGate(null);
                                  }}
                                  className="h-11 w-20 px-1.5 text-xs font-semibold"
                                  aria-label={t("adm.flight.inlineGate", { flight: f.number })}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveGate(f.id)}
                                  className="min-h-11 min-w-11 rounded bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                                >
                                  {t("adm.flight.inlineSave")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingGate(null)}
                                  className="min-h-11 min-w-11 rounded border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                                >
                                  {t("adm.flight.inlineCancel")}
                                </button>
                              </div>
                              {editingGate.error ? (
                                <span role="alert" className="text-[10px] font-semibold text-status-cancelled">
                                  {editingGate.error}
                                </span>
                              ) : null}
                            </div>
                          ) : mayEdit ? (
                            <button
                              type="button"
                              onClick={() => setEditingGate({ flightId: f.id, value: f.gate || "" })}
                              aria-label={t("adm.flight.inlineGate", { flight: f.number })}
                              title={t("adm.flight.inlineGate", { flight: f.number })}
                              className="group inline-flex min-h-11 items-center gap-1 rounded px-2 py-1 text-start hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
                            >
                              {f.gate ? (
                                <Ltr className="font-semibold text-foreground group-hover:text-primary">{`${f.terminal} · ${f.gate}`}</Ltr>
                              ) : (
                                <AdminChip tone="warn">{t("adm.flight.noGate")}</AdminChip>
                              )}
                              <span aria-hidden="true" className="text-[11px] text-muted-foreground group-hover:text-foreground">✎</span>
                            </button>
                          ) : f.gate ? (
                            <Ltr>{`${f.terminal} · ${f.gate}`}</Ltr>
                          ) : (
                            <AdminChip tone="warn">{t("adm.flight.noGate")}</AdminChip>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-muted-foreground">{t("adm.col.load")}</dt>
                        <dd className="mt-0.5">
                          <Ltr>{`${sold}/${CAPACITY}`}</Ltr>
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-muted-foreground">{t("adm.col.checkin")}</dt>
                        <dd className="mt-0.5">{t("adm.flight.checkedOf", { n: p.checked, total: p.total })}</dd>
                      </div>
                      {f.revisedDepart ? (
                        <div>
                          <dt className="font-semibold text-muted-foreground">{t("adm.fd.revised")}</dt>
                          <dd className="mt-0.5">
                            <Ltr>{f.revisedDepart}</Ltr>
                          </dd>
                        </div>
                      ) : null}
                    </dl>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <PermissionButton
                        allowed={mayEdit}
                        reason={t("adm.edit.readOnly")}
                        size="sm"
                        className="h-11 min-h-11"
                        onClick={() => setEdit(f)}
                      >
                        {t("adm.flight.quickEdit")}
                      </PermissionButton>
                      <AppLink
                        to="/admin/flights/$flightId"
                        params={{ flightId: f.id }}
                        className={btnClass("primary", "sm", "h-11 min-h-11")}
                      >
                        {t("adm.fl.open")}
                      </AppLink>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </AdminPanel>

      <FlightQuickEdit flight={edit} onClose={() => setEdit(null)} />
    </div>
  );
}
