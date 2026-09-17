import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field, Input, Select, btnClass } from "@/components/kit";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { useI18n, pick } from "@/lib/i18n";
import { destinationByCode, destinations } from "@/lib/data";
import type { ExceptionKind, Schedule } from "@/lib/admin-ops";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/{-$locale}/admin/schedules")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/schedules",
      en: {
        title: "Recurring schedules — Gaza International Airport administration",
        description: "The repeating Palestinian Airlines schedule behind dated flights from Gaza.",
      },
      ar: {
        title: "الجداول المتكررة — إدارة مطار غزة الدولي",
        description: "الجدول المتكرر للخطوط الجوية الفلسطينية الذي تُبنى عليه الرحلات من غزة.",
      },
      noindex: true,
    }),
  component: AdminSchedulesPage,
});

const KINDS: ExceptionKind[] = ["cancelled", "time", "aircraft", "extra"];

function emptySchedule(): Schedule {
  const first = destinations[0];
  return {
    id: `sch-new-${Date.now()}`,
    number: "PS",
    direction: "out",
    destination: first ? first.code : "AMM",
    days: [1, 3, 5],
    departTime: "08:00",
    arriveTime: "10:00",
    aircraft: "Airbus A320neo",
    from: "2026-01-11",
    until: "2026-12-19",
    active: true,
    exceptions: [],
  };
}

function AdminSchedulesPage() {
  const { t, lang } = useI18n();
  const { can, ops, patchOps, toast } = useAdmin();
  const [query, setQuery] = useState("");
  const [dest, setDest] = useState("all");
  const [state, setState] = useState<"all" | "active" | "inactive">("all");
  const [draft, setDraft] = useState<Schedule | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Schedule | null>(null);

  const mayEdit = can("ops.edit");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ops.schedules.filter((s) => {
      if (dest !== "all" && s.destination !== dest) return false;
      if (state === "active" && !s.active) return false;
      if (state === "inactive" && s.active) return false;
      if (!q) return true;
      const d = destinationByCode(s.destination);
      return [s.number, s.destination, d ? d.city.en : "", d ? d.city.ar : ""].join(" ").toLowerCase().includes(q);
    });
  }, [ops.schedules, query, dest, state]);

  if (!can("ops.view")) return <AdminDenied area={t("adm.sch.title")} permission="ops.view" />;

  const daysLabel = (days: number[]) => {
    if (days.length === 7) return t("adm.days.every");
    if (days.length === 0) return t("adm.days.none");
    return [...days].sort((a, b) => a - b).map((d) => t(`adm.day.${d}`)).join(" · ");
  };

  const routeLabel = (s: Schedule) =>
    s.direction === "out" ? `GZA → ${s.destination}` : `${s.destination} → GZA`;

  const save = () => {
    if (!draft) return;
    const list = isNew
      ? [...ops.schedules, draft]
      : ops.schedules.map((s) => (s.id === draft.id ? draft : s));
    patchOps("schedules", list);
    toast(t("adm.sch.saved", { number: draft.number }));
    setDraft(null);
  };

  const remove = (s: Schedule) => {
    patchOps("schedules", ops.schedules.filter((x) => x.id !== s.id));
    toast(t("adm.sch.deleted", { number: s.number }));
    setConfirmDelete(null);
  };

  const toggleDay = (day: number) => {
    if (!draft) return;
    const days = draft.days.includes(day) ? draft.days.filter((d) => d !== day) : [...draft.days, day];
    setDraft({ ...draft, days: days.sort((a, b) => a - b) });
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("adm.sch.title")}
        description={t("adm.sch.sub")}
        action={
          <PermissionButton
            allowed={mayEdit}
            reason={t("adm.edit.readOnly")}
            variant="primary"
            onClick={() => {
              setIsNew(true);
              setDraft(emptySchedule());
            }}
          >
            <Plus aria-hidden="true" className="size-3.5" />
            {t("adm.sch.new")}
          </PermissionButton>
        }
      />

      <AdminPanel bodyClassName="p-0">
        <Toolbar>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("adm.sch.searchPlaceholder")}
            aria-label={t("adm.common.search")}
            className="h-9 w-full min-w-40 max-w-56 text-sm sm:w-56"
          />
          <Select
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            aria-label={t("adm.sch.destination")}
            className="h-9 w-auto text-sm"
          >
            <option value="all">{t("adm.sch.allDest")}</option>
            {destinations.map((d) => (
              <option key={d.code} value={d.code}>
                {`${d.code} — ${pick(lang, d.city)}`}
              </option>
            ))}
          </Select>
          <Select
            value={state}
            onChange={(e) => setState(e.target.value as "all" | "active" | "inactive")}
            aria-label={t("adm.sch.state")}
            className="h-9 w-auto text-sm"
          >
            <option value="all">{t("adm.common.all")}</option>
            <option value="active">{t("adm.common.active")}</option>
            <option value="inactive">{t("adm.common.inactive")}</option>
          </Select>
          <span className="ms-auto text-xs text-muted-foreground">{t("adm.common.results", { n: rows.length })}</span>
        </Toolbar>

        {rows.length === 0 ? (
          <AdminEmpty title={t("adm.sch.empty")} body={t("adm.sch.emptyBody")} />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[58rem] text-sm">
                <caption className="sr-only">{t("adm.sch.title")}</caption>
                <thead>
                  <tr className="border-b border-border text-start text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.sch.number")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.sch.route")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.sch.days")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.sch.depart")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.sch.arrive")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.aircraft")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.sch.effective")}</th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">{t("adm.sch.state")}</th>
                    <th scope="col" className="px-3 py-2 text-end font-bold">{t("adm.col.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <Ltr className="font-bold">{s.number}</Ltr>
                      </td>
                      <td className="px-3 py-2">
                        <Ltr>{routeLabel(s)}</Ltr>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{daysLabel(s.days)}</td>
                      <td className="px-3 py-2">
                        <Ltr>{s.departTime}</Ltr>
                      </td>
                      <td className="px-3 py-2">
                        <Ltr>{s.arriveTime}</Ltr>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <Ltr>{s.aircraft}</Ltr>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <Ltr>{`${s.from} → ${s.until}`}</Ltr>
                        {s.exceptions.length > 0 ? (
                          <AdminChip tone="warn" className="ms-1.5">
                            {t("adm.sch.exceptionsCount", { n: s.exceptions.length })}
                          </AdminChip>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <AdminChip tone={s.active ? "brand" : "muted"}>
                          {t(s.active ? "adm.common.active" : "adm.common.inactive")}
                        </AdminChip>
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap justify-end gap-1.5">
                          <PermissionButton
                            allowed={mayEdit}
                            reason={t("adm.edit.readOnly")}
                            onClick={() => {
                              setIsNew(false);
                              setDraft({ ...s, days: [...s.days], exceptions: s.exceptions.map((e) => ({ ...e })) });
                            }}
                          >
                            {t("adm.common.edit")}
                          </PermissionButton>
                          <PermissionButton
                            allowed={mayEdit}
                            reason={t("adm.edit.readOnly")}
                            onClick={() => setConfirmDelete(s)}
                          >
                            <Trash2 aria-hidden="true" className="size-3.5" />
                            <span className="sr-only">{t("adm.common.delete")}</span>
                          </PermissionButton>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-border lg:hidden">
              {rows.map((s) => (
                <li key={`${s.id}-card`} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p>
                        <Ltr className="font-bold">{s.number}</Ltr>{" "}
                        <Ltr className="text-sm text-muted-foreground">{routeLabel(s)}</Ltr>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{daysLabel(s.days)}</p>
                    </div>
                    <AdminChip tone={s.active ? "brand" : "muted"}>
                      {t(s.active ? "adm.common.active" : "adm.common.inactive")}
                    </AdminChip>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="font-semibold text-muted-foreground">{t("adm.sch.depart")}</dt>
                      <dd>
                        <Ltr>{s.departTime}</Ltr>
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-muted-foreground">{t("adm.sch.arrive")}</dt>
                      <dd>
                        <Ltr>{s.arriveTime}</Ltr>
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-muted-foreground">{t("adm.col.aircraft")}</dt>
                      <dd>
                        <Ltr>{s.aircraft}</Ltr>
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-muted-foreground">{t("adm.sch.effective")}</dt>
                      <dd>
                        <Ltr>{`${s.from} → ${s.until}`}</Ltr>
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <PermissionButton
                      allowed={mayEdit}
                      reason={t("adm.edit.readOnly")}
                      onClick={() => {
                        setIsNew(false);
                        setDraft({ ...s, days: [...s.days], exceptions: s.exceptions.map((e) => ({ ...e })) });
                      }}
                    >
                      {t("adm.common.edit")}
                    </PermissionButton>
                    <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => setConfirmDelete(s)}>
                      {t("adm.common.delete")}
                    </PermissionButton>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </AdminPanel>

      {/* Schedule editor */}
      <AdminSheet
        open={draft !== null}
        title={isNew ? t("adm.sch.new") : t("adm.sch.edit")}
        description={draft ? routeLabel(draft) : ""}
        onClose={() => setDraft(null)}
        footer={
          <>
            <button type="button" onClick={() => setDraft(null)} className={btnClass("outline", "sm")}>
              {t("adm.edit.cancel")}
            </button>
            <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} variant="primary" onClick={save}>
              {t("adm.edit.save")}
            </PermissionButton>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("adm.sch.number")} htmlFor="sc-number">
                <Input
                  id="sc-number"
                  dir="ltr"
                  value={draft.number}
                  onChange={(e) => setDraft({ ...draft, number: e.target.value.toUpperCase() })}
                />
              </Field>
              <Field label={t("adm.sch.direction")} htmlFor="sc-dir">
                <Select
                  id="sc-dir"
                  value={draft.direction}
                  onChange={(e) => setDraft({ ...draft, direction: e.target.value as "out" | "in" })}
                >
                  <option value="out">{t("adm.sch.out")}</option>
                  <option value="in">{t("adm.sch.in")}</option>
                </Select>
              </Field>
            </div>

            <Field label={t("adm.sch.destination")} htmlFor="sc-dest">
              <Select id="sc-dest" value={draft.destination} onChange={(e) => setDraft({ ...draft, destination: e.target.value })}>
                {destinations.map((d) => (
                  <option key={d.code} value={d.code}>
                    {`${d.code} — ${pick(lang, d.city)}`}
                  </option>
                ))}
              </Select>
            </Field>

            <fieldset>
              <legend className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">
                {t("adm.sch.days")}
              </legend>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={draft.days.includes(d)}
                    onClick={() => toggleDay(d)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                      draft.days.includes(d)
                        ? "border-brand bg-brand-soft text-brand-deep"
                        : "border-border text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {t(`adm.day.${d}`)}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t("adm.sch.depart")} htmlFor="sc-dep">
                <Input
                  id="sc-dep"
                  dir="ltr"
                  type="time"
                  value={draft.departTime}
                  onChange={(e) => setDraft({ ...draft, departTime: e.target.value })}
                />
              </Field>
              <Field label={t("adm.sch.arrive")} htmlFor="sc-arr">
                <Input
                  id="sc-arr"
                  dir="ltr"
                  type="time"
                  value={draft.arriveTime}
                  onChange={(e) => setDraft({ ...draft, arriveTime: e.target.value })}
                />
              </Field>
            </div>

            <Field label={t("adm.col.aircraft")} htmlFor="sc-ac">
              <Select id="sc-ac" dir="ltr" value={draft.aircraft} onChange={(e) => setDraft({ ...draft, aircraft: e.target.value })}>
                {ops.aircraft.map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t("adm.sch.from")} htmlFor="sc-from">
                <Input id="sc-from" dir="ltr" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
              </Field>
              <Field label={t("adm.sch.until")} htmlFor="sc-until">
                <Input id="sc-until" dir="ltr" type="date" value={draft.until} onChange={(e) => setDraft({ ...draft, until: e.target.value })} />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                className="size-4 accent-[var(--brand)]"
              />
              {t("adm.common.active")}
            </label>

            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">{t("adm.sch.exceptions")}</h3>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      exceptions: [
                        ...draft.exceptions,
                        { id: `exc-${Date.now()}`, date: draft.from, kind: "cancelled", detail: "" },
                      ],
                    })
                  }
                  className={btnClass("outline", "sm")}
                >
                  <Plus aria-hidden="true" className="size-3.5" />
                  {t("adm.sch.addException")}
                </button>
              </div>

              {draft.exceptions.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">{t("adm.sch.noExceptions")}</p>
              ) : (
                <ul className="mt-2 space-y-3">
                  {draft.exceptions.map((exc, i) => (
                    <li key={exc.id} className="rounded-md border border-border p-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <Field label={t("adm.sch.excDate")} htmlFor={`exc-date-${exc.id}`}>
                          <Input
                            id={`exc-date-${exc.id}`}
                            dir="ltr"
                            type="date"
                            value={exc.date}
                            onChange={(e) => {
                              const next = [...draft.exceptions];
                              next[i] = { ...exc, date: e.target.value };
                              setDraft({ ...draft, exceptions: next });
                            }}
                          />
                        </Field>
                        <Field label={t("adm.sch.excKind")} htmlFor={`exc-kind-${exc.id}`}>
                          <Select
                            id={`exc-kind-${exc.id}`}
                            value={exc.kind}
                            onChange={(e) => {
                              const next = [...draft.exceptions];
                              next[i] = { ...exc, kind: e.target.value as ExceptionKind };
                              setDraft({ ...draft, exceptions: next });
                            }}
                          >
                            {KINDS.map((k) => (
                              <option key={k} value={k}>
                                {t(`adm.sch.exc.${k}`)}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                      <Field label={t("adm.sch.excDetail")} htmlFor={`exc-detail-${exc.id}`} className="mt-2">
                        <Input
                          id={`exc-detail-${exc.id}`}
                          value={exc.detail}
                          onChange={(e) => {
                            const next = [...draft.exceptions];
                            next[i] = { ...exc, detail: e.target.value };
                            setDraft({ ...draft, exceptions: next });
                          }}
                        />
                      </Field>
                      <button
                        type="button"
                        onClick={() => setDraft({ ...draft, exceptions: draft.exceptions.filter((x) => x.id !== exc.id) })}
                        className="mt-2 rounded-md px-2 py-1 text-xs font-semibold text-status-cancelled hover:bg-secondary"
                      >
                        {t("adm.sch.excRemove")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </AdminSheet>

      <ConfirmDialog
        open={confirmDelete !== null}
        title={t("adm.sch.deleteTitle")}
        body={confirmDelete ? t("adm.sch.deleteBody", { number: confirmDelete.number }) : ""}
        confirmLabel={t("adm.common.delete")}
        cancelLabel={t("adm.edit.cancel")}
        onConfirm={() => confirmDelete && remove(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
