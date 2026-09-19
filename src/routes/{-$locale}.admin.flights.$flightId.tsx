import { GazaTable, GazaTableBody, GazaTableCaption, GazaTableCell, GazaTableHead, GazaTableHeader, GazaTableRow } from "@/components/gaza-table";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { btnClass } from "@/components/kit";
import { StatusBadge } from "@/components/flight-status";
import {
  AdminChip,
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  AdminTabs,
  Ltr,
  Metric,
  PermissionButton,
} from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { FlightQuickEdit, type QuickEditFlight } from "@/components/admin/flight-quick-edit";
import { useAdmin } from "@/lib/admin-store";
import { useI18n, pick } from "@/lib/i18n";
import { dateLong } from "@/lib/format";
import {
  SEAT_LETTERS,
  SEAT_ROWS,
  airportByCode,
  flightById,
  minutesToLabel,
} from "@/lib/data";
import { checkedInPax, isPaxCheckedIn, seatedPassengers, useStore } from "@/lib/store";
import { pageHead } from "@/lib/head";

const CAPACITY = SEAT_ROWS * SEAT_LETTERS.length;

export const Route = createFileRoute("/{-$locale}/admin/flights/$flightId")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: `/admin/flights/${params.flightId}`,
      en: {
        title: "Flight detail — Gaza International Airport administration",
        description: "Operational detail, passengers and check-in progress for a single flight.",
      },
      ar: {
        title: "تفاصيل الرحلة — إدارة مطار غزة الدولي",
        description: "التفاصيل التشغيلية والمسافرون وتقدّم تسجيل الوصول لرحلة واحدة.",
      },
      noindex: true,
    }),
  component: AdminFlightDetailPage,
});

type Tab = "overview" | "passengers" | "checkin" | "history";

function AdminFlightDetailPage() {
  const { t, lang } = useI18n();
  const { flightId } = Route.useParams();
  const { can, withOverride } = useAdmin();
  const { bookings } = useStore();
  const [tab, setTab] = useState<Tab>("overview");
  const [edit, setEdit] = useState<QuickEditFlight | null>(null);

  const base = flightById(flightId);
  const flight = base ? withOverride(base) : null;
  const mayEdit = can("ops.edit");

  const pax = useMemo(() => {
    if (!flight) return [];
    const list: {
      key: string;
      name: string;
      ref: string;
      seat: string;
      leg: "out" | "in";
      infant: boolean;
      checked: boolean;
      cancelled: boolean;
    }[] = [];
    for (const b of bookings) {
      for (const leg of ["out", "in"] as const) {
        const legFlight = leg === "out" ? b.outbound : b.inbound;
        if (legFlight?.id !== flight.id) continue;
        b.passengers.forEach((p, i) => {
          list.push({
            key: `${b.ref}-${leg}-${i}`,
            name: `${p.firstName} ${p.lastName}`.trim() || "—",
            ref: b.ref,
            seat: b.seats[`${leg}-${i}`] ?? "",
            leg,
            infant: p.type === "infant",
            checked: isPaxCheckedIn(b, leg, i),
            cancelled: b.status === "cancelled",
          });
        });
      }
    }
    return list;
  }, [bookings, flight]);

  const checkin = useMemo(() => {
    if (!flight) return { eligible: 0, checked: 0 };
    let eligible = 0;
    let checked = 0;
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      for (const leg of ["out", "in"] as const) {
        const legFlight = leg === "out" ? b.outbound : b.inbound;
        if (legFlight?.id !== flight.id) continue;
        eligible += seatedPassengers(b).length;
        checked += checkedInPax(b, leg).length;
      }
    }
    return { eligible, checked };
  }, [bookings, flight]);

  const history = useMemo(() => {
    if (!flight) return [];
    const items: { id: string; time: string; label: string }[] = [
      { id: "h-created", time: "06:00", label: t("adm.fd.hist.created") },
      { id: "h-gate", time: "07:20", label: t("adm.fd.hist.gate", { gate: flight.gate || "—", terminal: flight.terminal }) },
      { id: "h-checkin", time: "08:00", label: t("adm.fd.hist.checkin") },
      { id: "h-status", time: "09:05", label: t("adm.fd.hist.status", { status: t(`status.${flight.status}`) }) },
    ];
    if (flight.revisedDepart) {
      items.push({ id: "h-revised", time: "09:30", label: t("adm.fd.hist.revised", { time: flight.revisedDepart }) });
    }
    if (flight.note) items.push({ id: "h-note", time: "09:40", label: t("adm.fd.hist.note") });
    return items;
  }, [flight, t]);

  if (!can("ops.view")) return <AdminDenied area={t("adm.fl.title")} permission="ops.view" />;

  if (!flight) {
    return (
      <div className="space-y-4">
        <AppLink to="/admin/flights" className={btnClass("outline", "sm")}>
          <ArrowLeft aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
          {t("adm.fd.back")}
        </AppLink>
        <AdminPanel>
          <h1 className="text-lg font-bold">{t("adm.fd.notFound")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("adm.fd.notFoundBody")}</p>
        </AdminPanel>
      </div>
    );
  }

  const origin = airportByCode(flight.originCode);
  const destination = airportByCode(flight.destinationCode);
  const sold = Math.max(0, CAPACITY - flight.seatsLeft);

  return (
    <div className="space-y-4">
      <AppLink to="/admin/flights" className={btnClass("outline", "sm")}>
        <ArrowLeft aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
        {t("adm.fd.back")}
      </AppLink>

      <AdminPageHeader
        title={flight.number}
        description={`${origin ? pick(lang, origin.city) : flight.originCode} → ${
          destination ? pick(lang, destination.city) : flight.destinationCode
        }`}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={flight.status} />
            <AdminChip tone="muted">
              <Ltr>{flight.id}</Ltr>
            </AdminChip>
            <span className="text-xs text-muted-foreground">{dateLong(flight.date, lang)}</span>
          </div>
        }
        action={
          <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} variant="primary" onClick={() => setEdit(flight)}>
            {t("adm.flight.quickEdit")}
          </PermissionButton>
        }
      />

      <AdminPanel bodyClassName="p-0">
        <AdminTabs
          label={t("adm.fd.tabs")}
          active={tab}
          onChange={setTab}
          tabs={[
            { id: "overview" as Tab, label: t("adm.fd.tab.overview") },
            { id: "passengers" as Tab, label: t("adm.fd.tab.passengers"), count: pax.length },
            { id: "checkin" as Tab, label: t("adm.fd.tab.checkin") },
            { id: "history" as Tab, label: t("adm.fd.tab.history") },
          ]}
        />

        <div className="p-4">
          {tab === "overview" ? (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
                <Metric label={t("adm.fd.depart")} value={flight.departTime} emphasis />
                <Metric label={t("adm.fd.arrive")} value={flight.arriveTime} emphasis />
                <Metric label={t("adm.fd.duration")} value={minutesToLabel(flight.durationMinutes, lang)} />
                <Metric label={t("adm.col.gate")} value={flight.gate ? `${flight.terminal} · ${flight.gate}` : "—"} />
                <Metric label={t("adm.col.load")} value={`${sold}/${CAPACITY}`} />
                <Metric
                  label={t("adm.col.checkin")}
                  value={`${checkin.checked}/${checkin.eligible}`}
                  tone={checkin.eligible > 0 && checkin.checked === checkin.eligible ? "brand" : "neutral"}
                />
              </div>

              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("adm.col.aircraft")}</dt>
                  <dd className="mt-0.5">
                    <Ltr>{flight.aircraft}</Ltr>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("adm.col.route")}</dt>
                  <dd className="mt-0.5">
                    <Ltr>{`${flight.originCode} → ${flight.destinationCode}`}</Ltr>
                  </dd>
                </div>
                {flight.revisedDepart ? (
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("adm.fd.revised")}</dt>
                    <dd className="mt-0.5">
                      <AdminChip tone="warn">
                        <Ltr>{flight.revisedDepart}</Ltr>
                      </AdminChip>
                    </dd>
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("adm.fd.note")}</dt>
                  <dd className="mt-0.5 text-muted-foreground">{flight.note || "—"}</dd>
                </div>
              </dl>
            </div>
          ) : null}

          {tab === "passengers" ? (
            pax.length === 0 ? (
              <AdminEmpty title={t("adm.fd.pax.empty")} body={t("adm.fd.pax.emptyBody")} />
            ) : (
              <div className="overflow-x-auto">
                <GazaTable className="w-full min-w-[38rem] text-sm">
                  <GazaTableCaption className="sr-only">{t("adm.fd.tab.passengers")}</GazaTableCaption>
                  <GazaTableHeader>
                    <GazaTableRow className="border-b border-border type-th">
                      <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.fd.pax.name")}</GazaTableHead>
                      <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.pnr")}</GazaTableHead>
                      <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.fd.pax.seat")}</GazaTableHead>
                      <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.fd.pax.booking")}</GazaTableHead>
                      <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.checkin")}</GazaTableHead>
                    </GazaTableRow>
                  </GazaTableHeader>
                  <GazaTableBody>
                    {pax.map((p) => (
                      <GazaTableRow key={p.key} className="border-b border-border last:border-0">
                        <GazaTableCell className="px-3 py-2 font-semibold">
                          {p.name}
                          {p.infant ? (
                            <AdminChip tone="muted" className="ms-2">
                              {t("adm.fd.pax.infant")}
                            </AdminChip>
                          ) : null}
                        </GazaTableCell>
                        <GazaTableCell className="px-3 py-2">
                          <Ltr>{p.ref}</Ltr>
                        </GazaTableCell>
                        <GazaTableCell className="px-3 py-2">
                          {p.seat ? <Ltr>{p.seat}</Ltr> : <span className="text-muted-foreground">—</span>}
                        </GazaTableCell>
                        <GazaTableCell className="px-3 py-2">
                          <AdminChip tone={p.cancelled ? "danger" : "brand"}>
                            {t(p.cancelled ? "adm.booking.cancelled" : "adm.booking.confirmed")}
                          </AdminChip>
                        </GazaTableCell>
                        <GazaTableCell className="px-3 py-2">
                          {p.infant ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <AdminChip tone={p.checked ? "brand" : "neutral"}>
                              {t(p.checked ? "adm.fd.pax.checkedIn" : "adm.fd.pax.notCheckedIn")}
                            </AdminChip>
                          )}
                        </GazaTableCell>
                      </GazaTableRow>
                    ))}
                  </GazaTableBody>
                </GazaTable>
              </div>
            )
          ) : null}

          {tab === "checkin" ? (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3">
                <Metric label={t("adm.fd.ci.eligible")} value={checkin.eligible} emphasis />
                <Metric label={t("adm.fd.ci.checked")} value={checkin.checked} tone="brand" />
                <Metric
                  label={t("adm.fd.ci.remaining")}
                  value={Math.max(0, checkin.eligible - checkin.checked)}
                  tone={checkin.eligible - checkin.checked > 0 ? "warn" : "neutral"}
                />
              </div>
              {checkin.eligible === 0 ? (
                <AdminEmpty title={t("adm.fd.pax.empty")} body={t("adm.fd.pax.emptyBody")} />
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {pax
                    .filter((p) => !p.infant && !p.cancelled)
                    .map((p) => (
                      <li key={`ci-${p.key}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="font-semibold">
                          {p.name} <Ltr className="ms-1 text-xs text-muted-foreground">{p.ref}</Ltr>
                        </span>
                        <AdminChip tone={p.checked ? "brand" : "neutral"}>
                          {t(p.checked ? "adm.fd.pax.checkedIn" : "adm.fd.pax.notCheckedIn")}
                        </AdminChip>
                      </li>
                    ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">{t("adm.fd.ci.note")}</p>
            </div>
          ) : null}

          {tab === "history" ? (
            history.length === 0 ? (
              <AdminEmpty title={t("adm.fd.hist.empty")} />
            ) : (
              <ol className="space-y-3">
                {history.map((h) => (
                  <li key={h.id} className="flex gap-3 text-sm">
                    <Ltr className="w-12 shrink-0 font-semibold text-muted-foreground">{h.time}</Ltr>
                    <span>{h.label}</span>
                  </li>
                ))}
              </ol>
            )
          ) : null}
        </div>
      </AdminPanel>

      <FlightQuickEdit flight={edit} onClose={() => setEdit(null)} />
    </div>
  );
}
