import { Switch } from "@/components/ui/switch";
import { GazaTable, GazaTableBody, GazaTableCaption, GazaTableCell, GazaTableHead, GazaTableHeader, GazaTableRow } from "@/components/gaza-table";
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
  GazaSheet,
  Ltr,
  PermissionButton,
  Toolbar,
} from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import { useAdmin } from "@/lib/admin-store";
import { useI18n, pick } from "@/lib/i18n";
import { destinationByCode, destinations } from "@/lib/data";
import type { ExceptionKind, Schedule, ScheduleCreateInput } from "@/lib/schedules";
import {
  parseSchedule, ScheduleValidationError, newScheduleId,
  useSchedulesQuery,
  useCreateScheduleMutation,
  useUpdateScheduleMutation,
  useDeleteScheduleMutation,
} from "@/lib/schedules";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/{-$locale}/admin/schedules")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/schedules",
      en: {
        title: "Recurring schedules — Gaza International Airport administration",
        description: "Browser-local recurring schedule planning for the prototype.",
      },
      ar: {
        title: "الجداول المتكررة — إدارة مطار غزة الدولي",
        description: "تخطيط الجداول المتكررة للنموذج الأولي، محفوظ في هذا المتصفح.",
      },
      noindex: true,
    }),
  component: AdminSchedulesPage,
});

const KINDS: ExceptionKind[] = ["cancelled", "time", "aircraft", "extra"];

/** Stable draft factory. Uses crypto.randomUUID for ID; one ID per new draft. */
function emptySchedule(): Schedule {
  const id = newScheduleId();
  const first = destinations[0];
  return {
    id,
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
  const { can, ops, toast } = useAdmin();
  const [query, setQuery] = useState("");
  const [dest, setDest] = useState("all");
  const [state, setState] = useState<"all" | "active" | "inactive">("all");
  const [draft, setDraft] = useState<Schedule | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Schedule | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const mayEdit = can("ops.edit");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Canonical repository data
  const { data: schedules = [], isPending: loading, isError: loadError } = useSchedulesQuery();
  const createSchedule = useCreateScheduleMutation();
  const updateSchedule = useUpdateScheduleMutation();
  const deleteSchedule = useDeleteScheduleMutation();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return schedules.filter((s) => {
      if (dest !== "all" && s.destination !== dest) return false;
      if (state === "active" && !s.active) return false;
      if (state === "inactive" && s.active) return false;
      if (!q) return true;
      const d = destinationByCode(s.destination);
      return [s.number, s.destination, d ? d.city.en : "", d ? d.city.ar : ""].join(" ").toLowerCase().includes(q);
    });
  }, [schedules, query, dest, state]);

  if (!can("ops.view")) return <AdminDenied area={t("adm.sch.title")} permission="ops.view" />;

  const daysLabel = (days: number[]) => {
    if (days.length === 7) return t("adm.days.every");
    if (days.length === 0) return t("adm.days.none");
    return [...days].sort((a, b) => a - b).map((d) => t(`adm.day.${d}`)).join(" · ");
  };

  const routeLabel = (s: Schedule) =>
    s.direction === "out" ? `GZA → ${s.destination}` : `${s.destination} → GZA`;

  const save = async () => {
    if (!draft || !mayEdit || createSchedule.isPending || updateSchedule.isPending) return;
    setSaveError(null);
    setFieldErrors({});
    try {
      if (isNew) {
        await createSchedule.mutateAsync(parseSchedule(draft) as ScheduleCreateInput);
      } else {
        await updateSchedule.mutateAsync({ id: draft.id, patch: parseSchedule(draft) });
      }
      toast(t("adm.sch.saved", { number: draft.number }));
      setDraft(null);
    } catch (err) {
      if (err instanceof ScheduleValidationError) {
        const errors: Record<string, string> = {};
        for (const issue of err.issues) {
          const path = issue.path.join(".");
          const key = String(issue.path[0] ?? "number");
          errors[path] = t("adm.sch.error." + key);
        }
        setFieldErrors(errors);
        const firstPath = Object.keys(errors)[0] ?? "number";
        const map: Record<string, string> = { number: "sc-number", direction: "sc-dir", destination: "sc-dest", days: "sc-days", departTime: "sc-dep", arriveTime: "sc-arr", aircraft: "sc-ac", from: "sc-from", until: "sc-until", active: "sc-active", exceptions: "sc-exceptions" };
        const parts = firstPath.split(".");
        const exception = draft.exceptions[Number(parts[1])];
        const target = parts[0] === "exceptions" && exception && parts[2]
          ? "exc-" + (parts[2] === "date" ? "date" : parts[2] === "kind" ? "kind" : "detail") + "-" + exception.id
          : map[parts[0] ?? "number"];
        document.getElementById(target ?? "sc-number")?.focus();
      } else setSaveError(t("adm.sch.saveError"));
      // Sheet/fields retained so user can retry
    }
  };

  const remove = async (s: Schedule) => {
    if (!mayEdit || deleteSchedule.isPending) return;
    setDeleteError(null);
    try {
      await deleteSchedule.mutateAsync(s.id);
      toast(t("adm.sch.deleted", { number: s.number }));
      setConfirmDelete(null);
    } catch (err) {
      setDeleteError(t("adm.sch.saveError"));
    }
  };

  const toggleDay = (day: number) => {
    if (!draft) return;
    const days = draft.days.includes(day) ? draft.days.filter((d) => d !== day) : [...draft.days, day];
    setDraft({ ...draft, days: days.sort((a, b) => a - b) });
  };

  return (
    <div className="space-y-4">
      {/* Planning disclosure (EN/AR, restrained) */}
      <div role="note" className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
        {t("adm.sch.planningNote")}
      </div>

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
              setSaveError(null);
              setFieldErrors({});
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

        {loading ? <p role="status" className="p-4">{t("adm.ops.loading")}</p> : loadError ? <p role="alert" className="p-4">{t("adm.ops.loadError")}</p> : rows.length === 0 ? (
          <AdminEmpty title={t("adm.sch.empty")} body={t("adm.sch.emptyBody")} />
        ) : (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <GazaTable className="w-full min-w-[58rem] text-sm">
                <GazaTableCaption className="sr-only">{t("adm.sch.title")}</GazaTableCaption>
                <GazaTableHeader>
                  <GazaTableRow className="border-b border-border type-th">
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.sch.number")}</GazaTableHead>
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.sch.route")}</GazaTableHead>
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.sch.days")}</GazaTableHead>
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.sch.depart")}</GazaTableHead>
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.sch.arrive")}</GazaTableHead>
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.col.aircraft")}</GazaTableHead>
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.sch.effective")}</GazaTableHead>
                    <GazaTableHead scope="col" className="px-3 py-2 text-start font-bold">{t("adm.sch.state")}</GazaTableHead>
                    <GazaTableHead scope="col" className="px-3 py-2 text-end font-bold">{t("adm.col.actions")}</GazaTableHead>
                  </GazaTableRow>
                </GazaTableHeader>
                <GazaTableBody>
                  {rows.map((s) => (
                    <GazaTableRow key={s.id} className="border-b border-border last:border-0">
                      <GazaTableCell className="px-3 py-2">
                        <Ltr className="font-bold">{s.number}</Ltr>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        <Ltr>{routeLabel(s)}</Ltr>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2 text-xs text-muted-foreground">{daysLabel(s.days)}</GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        <Ltr>{s.departTime}</Ltr>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        <Ltr>{s.arriveTime}</Ltr>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2 text-muted-foreground">
                        <Ltr>{s.aircraft}</Ltr>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2 text-xs">
                        <Ltr>{`${s.from} → ${s.until}`}</Ltr>
                        {s.exceptions.length > 0 ? (
                          <AdminChip tone="warn" className="ms-1.5">
                            {t("adm.sch.exceptionsCount", { n: s.exceptions.length })}
                          </AdminChip>
                        ) : null}
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        <AdminChip tone={s.active ? "brand" : "muted"}>
                          {t(s.active ? "adm.common.active" : "adm.common.inactive")}
                        </AdminChip>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        <span className="flex flex-wrap justify-end gap-1.5">
                          <PermissionButton
                            allowed={mayEdit}
                            reason={t("adm.edit.readOnly")}
                            onClick={() => {
                              setIsNew(false);
                              setSaveError(null);
                              setFieldErrors({});
                              setDraft({ ...s, days: [...s.days], exceptions: s.exceptions.map((e) => ({ ...e })) });
                            }}
                          >
                            {t("adm.common.edit")}
                          </PermissionButton>
                          <PermissionButton
                            allowed={mayEdit}
                            reason={t("adm.edit.readOnly")}
                            onClick={() => { setDeleteError(null); setConfirmDelete(s); }}
                          >
                            <Trash2 aria-hidden="true" className="size-3.5" />
                            <span className="sr-only">{t("adm.common.delete")}</span>
                          </PermissionButton>
                        </span>
                      </GazaTableCell>
                    </GazaTableRow>
                  ))}
                </GazaTableBody>
              </GazaTable>
            </div>

            <ul className="divide-y divide-border xl:hidden">
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
                      <dd><Ltr>{s.departTime}</Ltr></dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-muted-foreground">{t("adm.sch.arrive")}</dt>
                      <dd><Ltr>{s.arriveTime}</Ltr></dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-muted-foreground">{t("adm.col.aircraft")}</dt>
                      <dd><Ltr>{s.aircraft}</Ltr></dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-muted-foreground">{t("adm.sch.effective")}</dt>
                      <dd><Ltr>{`${s.from} → ${s.until}`}</Ltr></dd>
                    </div>
                  </dl>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <PermissionButton
                      allowed={mayEdit}
                      reason={t("adm.edit.readOnly")}
                      onClick={() => {
                        setIsNew(false);
                        setSaveError(null);
                        setFieldErrors({});
                        setDraft({ ...s, days: [...s.days], exceptions: s.exceptions.map((e) => ({ ...e })) });
                      }}
                    >
                      {t("adm.common.edit")}
                    </PermissionButton>
                    <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} onClick={() => { setDeleteError(null); setConfirmDelete(s); }}>
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
      <GazaSheet
        open={draft !== null}
        title={isNew ? t("adm.sch.new") : t("adm.sch.edit")}
        description={draft ? routeLabel(draft) : ""}
        onClose={() => setDraft(null)}
        footer={
          <>
            {saveError ? (
              <p role="alert" className="text-xs font-semibold text-status-cancelled">{saveError}</p>
            ) : null}
            <button type="button" onClick={() => setDraft(null)} className={btnClass("outline", "sm")}>
              {t("adm.edit.cancel")}
            </button>
            <PermissionButton allowed={mayEdit} reason={t("adm.edit.readOnly")} variant="primary" disabled={createSchedule.isPending || updateSchedule.isPending} aria-busy={createSchedule.isPending || updateSchedule.isPending} onClick={save}>
              {t("adm.edit.save")}
            </PermissionButton>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("adm.sch.number")} htmlFor="sc-number" error={fieldErrors["number"]} errorId="sc-number-error">
                <Input
                  id="sc-number" aria-invalid={Boolean(fieldErrors["number"]) || undefined} aria-describedby={fieldErrors["number"] ? "sc-number-error" : undefined}
                  dir="ltr"
                  value={draft.number}
                  onChange={(e) => setDraft({ ...draft, number: e.target.value.toUpperCase() })}
                />
              </Field>
              <Field label={t("adm.sch.direction")} htmlFor="sc-dir" error={fieldErrors["direction"]} errorId="sc-dir-error">
                <Select
                  id="sc-dir" aria-invalid={Boolean(fieldErrors["direction"]) || undefined} aria-describedby={fieldErrors["direction"] ? "sc-dir-error" : undefined}
                  value={draft.direction}
                  onChange={(e) => setDraft({ ...draft, direction: e.target.value as "out" | "in" })}
                >
                  <option value="out">{t("adm.sch.out")}</option>
                  <option value="in">{t("adm.sch.in")}</option>
                </Select>
              </Field>
            </div>

            <Field label={t("adm.sch.destination")} htmlFor="sc-dest" error={fieldErrors["destination"]} errorId="sc-dest-error">
              <Select id="sc-dest" aria-invalid={Boolean(fieldErrors["destination"]) || undefined} aria-describedby={fieldErrors["destination"] ? "sc-dest-error" : undefined} value={draft.destination} onChange={(e) => setDraft({ ...draft, destination: e.target.value })}>
                {destinations.map((d) => (
                  <option key={d.code} value={d.code}>
                    {`${d.code} — ${pick(lang, d.city)}`}
                  </option>
                ))}
              </Select>
            </Field>

            <fieldset id="sc-days" tabIndex={-1} aria-invalid={Boolean(fieldErrors["days"]) || undefined} aria-describedby={fieldErrors["days"] ? "sc-days-error" : undefined}>
              <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
              {fieldErrors["days"] ? <p id="sc-days-error" role="alert" className="text-xs text-destructive">{fieldErrors["days"]}</p> : null}
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t("adm.sch.depart")} htmlFor="sc-dep" error={fieldErrors["departTime"]} errorId="sc-dep-error">
                <Input
                  id="sc-dep" aria-invalid={Boolean(fieldErrors["departTime"]) || undefined} aria-describedby={fieldErrors["departTime"] ? "sc-dep-error" : undefined}
                  dir="ltr"
                  type="time"
                  value={draft.departTime}
                  onChange={(e) => setDraft({ ...draft, departTime: e.target.value })}
                />
              </Field>
              <Field label={t("adm.sch.arrive")} htmlFor="sc-arr" error={fieldErrors["arriveTime"]} errorId="sc-arr-error">
                <Input
                  id="sc-arr" aria-invalid={Boolean(fieldErrors["arriveTime"]) || undefined} aria-describedby={fieldErrors["arriveTime"] ? "sc-arr-error" : undefined}
                  dir="ltr"
                  type="time"
                  value={draft.arriveTime}
                  onChange={(e) => setDraft({ ...draft, arriveTime: e.target.value })}
                />
              </Field>
            </div>

            <Field label={t("adm.col.aircraft")} htmlFor="sc-ac" error={fieldErrors["aircraft"]} errorId="sc-ac-error">
              <Select id="sc-ac" aria-invalid={Boolean(fieldErrors["aircraft"]) || undefined} aria-describedby={fieldErrors["aircraft"] ? "sc-ac-error" : undefined} dir="ltr" value={draft.aircraft} onChange={(e) => setDraft({ ...draft, aircraft: e.target.value })}>
                {ops.aircraft.map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t("adm.sch.from")} htmlFor="sc-from" error={fieldErrors["from"]} errorId="sc-from-error">
                <Input id="sc-from" aria-invalid={Boolean(fieldErrors["from"]) || undefined} aria-describedby={fieldErrors["from"] ? "sc-from-error" : undefined} dir="ltr" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
              </Field>
              <Field label={t("adm.sch.until")} htmlFor="sc-until" error={fieldErrors["until"]} errorId="sc-until-error">
                <Input id="sc-until" aria-invalid={Boolean(fieldErrors["until"]) || undefined} aria-describedby={fieldErrors["until"] ? "sc-until-error" : undefined} dir="ltr" type="date" value={draft.until} onChange={(e) => setDraft({ ...draft, until: e.target.value })} />
              </Field>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="sc-active"
                checked={draft.active}
                onCheckedChange={(val) => setDraft({ ...draft, active: val })}
              />
              <label htmlFor="sc-active" className="text-sm font-semibold cursor-pointer select-none">
                {t("adm.common.active")}
              </label>
            </div>

            <div id="sc-exceptions" tabIndex={-1} className="border-t border-border pt-3">
              {fieldErrors["exceptions"] ? <p role="alert" className="text-xs text-destructive">{fieldErrors["exceptions"]}</p> : null}
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">{t("adm.sch.exceptions")}</h3>
                <button
                  type="button"
                  onClick={() => {
                    const excId = newScheduleId();
                    setDraft({
                      ...draft,
                      exceptions: [
                        ...draft.exceptions,
                        { id: excId, date: draft.from, kind: "cancelled", detail: "" },
                      ],
                    });
                  }}
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
                        <Field label={t("adm.sch.excDate")} htmlFor={`exc-date-${exc.id}`} error={fieldErrors["exceptions." + i + ".date"]} errorId={"exc-date-"+exc.id+"-error"}>
                          <Input
                            id={`exc-date-${exc.id}`} aria-invalid={Boolean(fieldErrors["exceptions." + i + ".date"]) || undefined} aria-describedby={fieldErrors["exceptions." + i + ".date"] ? "exc-date-"+exc.id+"-error" : undefined}
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
                        <Field label={t("adm.sch.excKind")} htmlFor={`exc-kind-${exc.id}`} error={fieldErrors["exceptions." + i + ".kind"]} errorId={"exc-kind-"+exc.id+"-error"}>
                          <Select
                            id={`exc-kind-${exc.id}`} aria-invalid={Boolean(fieldErrors["exceptions." + i + ".kind"]) || undefined} aria-describedby={fieldErrors["exceptions." + i + ".kind"] ? "exc-kind-"+exc.id+"-error" : undefined}
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
                      <Field label={t("adm.sch.excDetail")} htmlFor={`exc-detail-${exc.id}`} error={fieldErrors["exceptions." + i + ".detail"]} errorId={"exc-detail-"+exc.id+"-error"} className="mt-2">
                        <Input
                          id={`exc-detail-${exc.id}`} aria-invalid={Boolean(fieldErrors["exceptions." + i + ".detail"]) || undefined} aria-describedby={fieldErrors["exceptions." + i + ".detail"] ? "exc-detail-"+exc.id+"-error" : undefined}
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
      </GazaSheet>

      <ConfirmDialog
        open={confirmDelete !== null}
        title={t("adm.sch.deleteTitle")}
        body={confirmDelete ? t("adm.sch.deleteBody", { number: confirmDelete.number }) : ""}
        confirmLabel={t("adm.common.delete")}
        pending={deleteSchedule.isPending}
        error={deleteError}
        preserveOpenOnConfirm
        onConfirm={() => confirmDelete && remove(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}
