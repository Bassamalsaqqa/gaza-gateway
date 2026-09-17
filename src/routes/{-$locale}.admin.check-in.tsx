import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Input, btnClass } from "@/components/kit";
import {
  AdminChip,
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  AdminSheet,
  Ltr,
  PermissionButton,
  Toolbar,
} from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { useI18n } from "@/lib/i18n";
import { deskFlights, deskPassengers, type DeskPassenger } from "@/lib/admin-mock";
import { pageHead } from "@/lib/head";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/{-$locale}/admin/check-in")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/check-in",
      en: { title: "Check-in desk — Gaza International Airport administration", description: "Passenger service desk for departures from Gaza." },
      ar: { title: "مكتب تسجيل الوصول — إدارة مطار غزة الدولي", description: "مكتب خدمة المسافرين للمغادرات من غزة." },
      noindex: true,
    }),
  component: AdminCheckInPage,
});

const statusTone = (s: DeskPassenger["status"]) =>
  s === "done" ? "brand" : s === "ready" ? "info" : s === "docs" ? "danger" : "muted";

function AdminCheckInPage() {
  const { t } = useI18n();
  const { can, toast } = useAdmin();
  const [flightId, setFlightId] = useState<string>(deskFlights[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<DeskPassenger | null>(null);
  const mayEdit = can("commercial.edit");

  const rows = useMemo(() => {
    const list = deskPassengers[flightId] ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => `${p.name} ${p.ref} ${p.seat ?? ""}`.toLowerCase().includes(q));
  }, [flightId, query]);

  if (!can("commercial.view")) return <AdminDenied area={t("a2.ci.title")} permission="commercial.view" />;

  const actionsFor = (p: DeskPassenger) => (
    <div className="flex flex-wrap gap-1.5">
      <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => toast(t("a2.ci.checkedInToast"))}>
        {p.status === "done" ? t("a2.ci.undo") : t("a2.ci.checkIn")}
      </PermissionButton>
      <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => toast(t("a2.ci.issuedToast"))}>
        {t("a2.ci.issue")}
      </PermissionButton>
      <button type="button" className={btnClass("ghost", "sm")} onClick={() => setSelected(p)}>
        {t("a2.ci.viewExtras")}
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t("a2.ci.title")} description={t("a2.ci.sub")} meta={<p className="text-xs text-muted-foreground">{t("a2.mock")}</p>} />

      <AdminPanel title={t("a2.ci.today")} bodyClassName="p-0">
        <Toolbar>
          <Input
            aria-label={t("a2.ci.search")}
            placeholder={t("a2.ci.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full sm:w-72"
          />
        </Toolbar>
        <ul className="flex flex-wrap gap-2 border-b border-border p-3">
          {deskFlights.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => setFlightId(f.id)}
                aria-pressed={flightId === f.id}
                className={cn(
                  "rounded-md border px-3 py-2 text-start text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  flightId === f.id ? "border-brand bg-brand-soft/40" : "border-border hover:bg-secondary",
                )}
              >
                <span className="block font-bold">
                  <Ltr>{`${f.depart} · ${f.number}`}</Ltr>
                </span>
                <span className="block text-muted-foreground">
                  <Ltr>{`${f.route} · ${t("a2.se.gates")} ${f.gate}`}</Ltr>
                </span>
                <span className="block text-muted-foreground">
                  <Ltr>{`${f.checkedIn}/${f.booked}`}</Ltr>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {rows.length === 0 ? (
          <AdminEmpty title={t("a2.ci.selectFlight")} body={t("a2.mock")} />
        ) : (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full text-sm">
                <caption className="sr-only">{t("a2.ci.title")}</caption>
                <thead>
                  <tr className="border-b border-border text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                    {[t("a2.ci.passenger"), "PNR", t("a2.ci.docs"), t("a2.bd.seat"), t("a2.bd.bags"), t("a2.bd.assistance"), t("a2.status"), t("a2.actions")].map((h) => (
                      <th key={h} scope="col" className="px-3 py-2 text-start font-bold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0 align-top">
                      <td className="px-3 py-2">
                        <button type="button" className="font-semibold underline decoration-dotted" onClick={() => setSelected(p)}>
                          {p.name}
                        </button>
                        {p.infant ? <AdminChip tone="info" className="ms-2">{t("a2.ci.infant")}</AdminChip> : null}
                      </td>
                      <td className="px-3 py-2"><Ltr>{p.ref}</Ltr></td>
                      <td className="px-3 py-2">
                        <AdminChip tone={p.docsOk ? "brand" : "danger"}>{t(p.docsOk ? "a2.ci.docsOk" : "a2.ci.docsMissing")}</AdminChip>
                      </td>
                      <td className="px-3 py-2">{p.seat ? <Ltr>{p.seat}</Ltr> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2"><Ltr>{p.bags}</Ltr></td>
                      <td className="px-3 py-2 text-muted-foreground">{p.assistance ?? t("a2.none")}</td>
                      <td className="px-3 py-2"><AdminChip tone={statusTone(p.status)}>{t(`a2.ci.st.${p.status}`)}</AdminChip></td>
                      <td className="px-3 py-2">{actionsFor(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-border xl:hidden">
              {rows.map((p) => (
                <li key={p.id} className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="text-sm font-semibold underline decoration-dotted" onClick={() => setSelected(p)}>
                      {p.name}
                    </button>
                    <Ltr className="text-xs text-muted-foreground">{p.ref}</Ltr>
                    <AdminChip tone={statusTone(p.status)}>{t(`a2.ci.st.${p.status}`)}</AdminChip>
                    {p.infant ? <AdminChip tone="info">{t("a2.ci.infant")}</AdminChip> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <Ltr>{`${p.seat ?? "—"} · ${p.bags}`}</Ltr>
                    {` · ${p.assistance ?? t("a2.none")}`}
                  </p>
                  {actionsFor(p)}
                </li>
              ))}
            </ul>
          </>
        )}
      </AdminPanel>

      <AdminSheet
        open={selected !== null}
        title={t("a2.ci.sheet")}
        description={selected?.name ?? ""}
        onClose={() => setSelected(null)}
        footer={
          <>
            <button type="button" className={btnClass("outline", "sm")} onClick={() => setSelected(null)}>
              {t("a2.cancel")}
            </button>
            <PermissionButton
              allowed={mayEdit}
              reason={t("adm.edit.readOnly")}
              variant="primary"
              onClick={() => {
                setSelected(null);
                toast(t("a2.ci.checkedInToast"));
              }}
            >
              {t("a2.ci.checkIn")}
            </PermissionButton>
          </>
        }
      >
        {selected ? (
          <dl className="space-y-3 text-sm">
            {[
              { k: "PNR", v: <Ltr>{selected.ref}</Ltr> },
              { k: t("a2.ci.docs"), v: t(selected.docsOk ? "a2.ci.docsOk" : "a2.ci.docsMissing") },
              { k: t("a2.bd.seat"), v: selected.seat ? <Ltr>{selected.seat}</Ltr> : t("a2.none") },
              { k: t("a2.bd.bags"), v: <Ltr>{selected.bags}</Ltr> },
              { k: t("a2.bd.assistance"), v: selected.assistance ?? t("a2.none") },
              { k: t("a2.status"), v: t(`a2.ci.st.${selected.status}`) },
            ].map((row) => (
              <div key={row.k}>
                <dt className="text-xs font-semibold text-muted-foreground">{row.k}</dt>
                <dd>{row.v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </AdminSheet>
    </div>
  );
}
