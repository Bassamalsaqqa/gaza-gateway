import { ScheduleExceptionEditor } from "@/components/admin/schedule-exception-editor";
import { Switch } from "@/components/ui/switch";
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
import { Plus } from "lucide-react";
import { Field, Input, Select, btnClass } from "@/components/kit";
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
import { aircraftNameToId } from "@/lib/data";
import { useNetworkQuery, NetworkError, type NetworkDestination } from "@/lib/network";
import { useAppNavigate } from "@/components/app-link";
import { useFleetQuery } from "@/lib/fleet";
import type { Schedule, ScheduleCreateInput } from "@/lib/schedules";
import {
  parseSchedule,
  ScheduleValidationError,
  newScheduleId,
  useSchedulesQuery,
  useCreateScheduleMutation,
  useUpdateScheduleMutation,
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
  validateSearch: (search: Record<string, unknown>) => ({
    destination:
      typeof search["destination"] === "string" && /^[A-Z]{3}$/.test(search["destination"])
        ? search["destination"]
        : undefined,
  }),
  component: AdminSchedulesPage,
});

/** Stable draft factory. Uses crypto.randomUUID for ID; one ID per new draft. */
function emptySchedule(
  destination: string,
  defaultPlane?: { id: string; model: string },
): Schedule {
  const id = newScheduleId();
  return {
    id,
    number: "PS",
    direction: "out",
    destination,
    days: [1, 3, 5],
    departTime: "08:00",
    arriveTime: "10:00",
    aircraft: defaultPlane?.model ?? "",
    ...(defaultPlane ? { aircraftId: defaultPlane.id } : {}),
    from: "2026-01-11",
    until: "2026-12-19",
    active: true,
    exceptions: [],
  };
}

function AdminSchedulesPage() {
  const { t, lang } = useI18n();
  const { can, toast } = useAdmin();
  const { data: fleetData, isError: fleetError } = useFleetQuery();
  const [query, setQuery] = useState("");
  const network = useNetworkQuery();
  const navigate = useAppNavigate();
  const search = Route.useSearch();
  const dest = search["destination"] ?? "all";
  const setDest = (value: string) =>
    void navigate({
      to: "/admin/schedules",
      search: { destination: value === "all" ? undefined : value },
    });
  const destinations = useMemo(() => network.data ?? [], [network.data]);
  const destinationOptions: {
    code: string;
    city?: NetworkDestination["city"];
    active?: boolean;
  }[] = [...destinations];
  const [state, setState] = useState<"all" | "active" | "inactive">("all");
  const [draft, setDraft] = useState<Schedule | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const mayEdit = can("ops.edit");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Canonical repository data
  const { data: schedules = [], isPending: loading, isError: loadError } = useSchedulesQuery();
  for (const code of new Set([
    ...schedules.map((s) => s.destination),
    ...(draft ? [draft.destination] : []),
  ])) {
    if (!destinationOptions.some((d) => d.code === code)) destinationOptions.push({ code });
  }
  const createSchedule = useCreateScheduleMutation();
  const updateSchedule = useUpdateScheduleMutation();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return schedules.filter((s) => {
      if (dest !== "all" && s.destination !== dest) return false;
      if (state === "active" && !s.active) return false;
      if (state === "inactive" && s.active) return false;
      if (!q) return true;
      const d = destinations.find((d) => d.code === s.destination);
      return [s.number, s.destination, d ? d.city.en : "", d ? d.city.ar : ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [schedules, query, dest, state, destinations]);

  const scheduleAircraftOptions = useMemo(() => {
    const options: { id: string; label: string }[] = [];
    if (fleetData?.aircraft) {
      for (const a of fleetData.aircraft) {
        if (a.active) {
          options.push({
            id: a.id,
            label: `${a.model} (${a.registration})`,
          });
        }
      }

      const currentPlane = draft
        ? fleetData.aircraft.find(
            (a) => a.id === (draft.aircraftId ?? aircraftNameToId(draft.aircraft)),
          )
        : undefined;

      if (currentPlane && !currentPlane.active) {
        if (!options.some((o) => o.id === currentPlane.id)) {
          options.unshift({
            id: currentPlane.id,
            label: `${currentPlane.model} (${currentPlane.registration}) [${t("adm.common.inactive")}]`,
          });
        }
      } else if (draft?.aircraft && !currentPlane) {
        options.unshift({
          id: draft.aircraftId ?? draft.aircraft,
          label: `${draft.aircraft} [${t("fleet.legacy")}]`,
        });
      }
    } else if (draft) {
      options.push({
        id: draft.aircraftId ?? draft.aircraft,
        label: draft.aircraft,
      });
    }
    return options;
  }, [fleetData, draft, t]);

  if (!can("ops.view")) return <AdminDenied area={t("adm.sch.title")} permission="ops.view" />;

  const daysLabel = (days: number[]) => {
    if (days.length === 7) return t("adm.days.every");
    if (days.length === 0) return t("adm.days.none");
    return [...days]
      .sort((a, b) => a - b)
      .map((d) => t(`adm.day.${d}`))
      .join(" · ");
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
        const { id, destination, direction, ...patch } = parseSchedule(draft);
        await updateSchedule.mutateAsync({ id, patch });
      }
      toast(t("adm.sch.saved", { number: draft.number }));
      setDraft(null);
    } catch (err) {
      if (err instanceof ScheduleValidationError) {
        const errors: Record<string, string> = {};
        for (const issue of err.issues) {
          const path = issue.path.join(".");
          if (issue.path[0] === "exceptions" && issue.path[2] === "effect" && issue.path[3]) {
            errors[path] = t(
              "adm.sch.error.exceptions." +
                (issue.path[3] === "aircraft" ? "aircraftId" : issue.path[3]),
            );
          } else if (issue.path[0] === "exceptions" && issue.path[2] === "date") {
            errors[path] = t(
              draft.exceptions[Number(issue.path[1])]?.kind === "extra"
                ? "adm.sch.error.exceptions.extraDate"
                : "adm.sch.error.exceptions.date",
            );
          } else if (issue.path[0] === "exceptions" && issue.path[2] === "kind") {
            errors[path] = t("adm.sch.error.exceptions.conflict");
          } else {
            const key = String(issue.path[0] ?? "number");
            errors[path] = t("adm.sch.error." + key);
          }
        }
        setFieldErrors(errors);
        const firstPath = Object.keys(errors)[0] ?? "number";
        const map: Record<string, string> = {
          number: "sc-number",
          direction: "sc-dir",
          destination: "sc-dest",
          days: "sc-days",
          departTime: "sc-dep",
          arriveTime: "sc-arr",
          aircraft: "sc-ac",
          aircraftId: "sc-ac",
          from: "sc-from",
          until: "sc-until",
          active: "sc-active",
          exceptions: "sc-exceptions",
        };
        const parts = firstPath.split(".");
        let targetId = map[parts[0] ?? "number"];
        if (parts[0] === "exceptions" && parts[1] !== undefined) {
          const excIndex = Number(parts[1]);
          const exception = draft.exceptions[excIndex];
          if (exception) {
            if (parts[2] === "effect" && parts[3]) {
              targetId = `exc-effect-${parts[3] === "aircraft" ? "aircraftId" : parts[3]}-${exception.id}`;
            } else if (parts[2]) {
              targetId = `exc-${parts[2]}-${exception.id}`;
            } else {
              targetId = `exc-date-${exception.id}`;
            }
          }
        }
        document.getElementById(targetId ?? "sc-number")?.focus();
      } else {
        setSaveError(t(err instanceof NetworkError ? "network.unavailable" : "adm.sch.saveError"));
      }
    }
  };

  const toggleDay = (day: number) => {
    if (!draft) return;
    const days = draft.days.includes(day)
      ? draft.days.filter((d) => d !== day)
      : [...draft.days, day];
    setDraft({ ...draft, days: days.sort((a, b) => a - b) });
  };

  return (
    <div className="space-y-4">
      {/* Planning disclosure (EN/AR, restrained) */}
      <div
        role="note"
        className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground"
      >
        {t("adm.sch.planningNote")}
      </div>

      {network.isError ? (
        <div role="alert" className="text-xs text-muted-foreground">
          {t("network.unavailable")}{" "}
          <button
            type="button"
            className={btnClass("outline", "sm")}
            onClick={() => void network.refetch()}
          >
            {t("adm.ops.retry")}
          </button>
        </div>
      ) : null}
      <AdminPageHeader
        title={t("adm.sch.title")}
        description={t("adm.sch.sub")}
        action={
          <PermissionButton
            allowed={
              mayEdit &&
              !fleetError &&
              network.isSuccess &&
              !network.isError &&
              destinations.length > 0 &&
              Boolean(fleetData?.aircraft.some((a) => a.active))
            }
            reason={t(
              !mayEdit
                ? "adm.edit.readOnly"
                : network.isError
                  ? "network.unavailable"
                  : "fleet.error.unavailable",
            )}
            variant="primary"
            onClick={() => {
              setIsNew(true);
              setSaveError(null);
              setFieldErrors({});
              const defaultDest = (dest !== "all" ? dest : destinations[0]?.code) ?? "AMM";
              const defaultPlane = fleetData?.aircraft.find((a) => a.active);
              setDraft(
                emptySchedule(
                  defaultDest,
                  defaultPlane ? { id: defaultPlane.id, model: defaultPlane.model } : undefined,
                ),
              );
            }}
          >
            <Plus aria-hidden="true" className="size-4" />
            {t("adm.sch.new")}
          </PermissionButton>
        }
      />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("adm.sch.searchPlaceholder")}
            className="w-48"
          />
          <Select value={dest} onChange={(e) => setDest(e.target.value)}>
            <option value="all">{t("adm.sch.allDest")}</option>
            {destinationOptions.map((d) => (
              <option key={d.code} value={d.code}>
                {d.code}
                {d.city ? ` — ${pick(lang, d.city)}` : ""}
                {d.active === false ? ` [${t("adm.common.inactive")}]` : ""}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-1 border-s border-border ps-2">
            {(["all", "active", "inactive"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setState(s)}
                className={`rounded px-2.5 py-1 text-xs font-semibold ${
                  state === s ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
                }`}
              >
                {t(
                  s === "all"
                    ? "adm.common.all"
                    : s === "active"
                      ? "adm.common.active"
                      : "adm.common.inactive",
                )}
              </button>
            ))}
          </div>
        </div>
      </Toolbar>

      <AdminPanel>
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">{t("adm.ops.loading")}</p>
        ) : loadError ? (
          <p className="p-6 text-sm text-destructive">{t("adm.ops.loadError")}</p>
        ) : rows.length === 0 ? (
          <AdminEmpty
            title={t("adm.sch.empty")}
            body={t("adm.sch.emptyBody")}
            action={
              dest !== "all" || query || state !== "all" ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setDest("all");
                    setState("all");
                  }}
                  className={btnClass("outline", "sm")}
                >
                  {t("adm.filter.reset")}
                </button>
              ) : null
            }
          />
        ) : (
          <>
            <div className="hidden xl:block">
              <GazaTable>
                <GazaTableCaption className="sr-only">{t("adm.sch.title")}</GazaTableCaption>
                <GazaTableHeader>
                  <GazaTableRow>
                    <GazaTableHead>{t("adm.sch.number")}</GazaTableHead>
                    <GazaTableHead>{t("adm.sch.route")}</GazaTableHead>
                    <GazaTableHead>{t("adm.sch.days")}</GazaTableHead>
                    <GazaTableHead>{t("adm.sch.depart")}</GazaTableHead>
                    <GazaTableHead>{t("adm.sch.arrive")}</GazaTableHead>
                    <GazaTableHead>{t("adm.col.aircraft")}</GazaTableHead>
                    <GazaTableHead>{t("adm.sch.effective")}</GazaTableHead>
                    <GazaTableHead>{t("adm.sch.exceptions")}</GazaTableHead>
                    <GazaTableHead>{t("adm.sch.state")}</GazaTableHead>
                    <GazaTableHead className="text-end">{t("adm.common.actions")}</GazaTableHead>
                  </GazaTableRow>
                </GazaTableHeader>
                <GazaTableBody>
                  {rows.map((s) => (
                    <GazaTableRow key={s.id}>
                      <GazaTableCell className="px-3 py-2 font-mono font-bold">
                        <Ltr>{s.number}</Ltr>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        <Ltr>{routeLabel(s)}</Ltr>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2 text-xs text-muted-foreground">
                        {daysLabel(s.days)}
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2 font-mono text-xs">
                        <Ltr>{s.departTime}</Ltr>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2 font-mono text-xs">
                        <Ltr>{s.arriveTime}</Ltr>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2 text-xs">
                        <Ltr>{s.aircraft}</Ltr>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2 text-xs text-muted-foreground">
                        <Ltr>{`${s.from} → ${s.until}`}</Ltr>
                      </GazaTableCell>
                      <GazaTableCell className="px-3 py-2">
                        <span className="font-mono text-xs">{s.exceptions.length}</span>
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
                              setDraft(structuredClone(s));
                            }}
                          >
                            {t("adm.common.edit")}
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
                      <dt className="font-semibold text-muted-foreground">
                        {t("adm.col.aircraft")}
                      </dt>
                      <dd>
                        <Ltr>{s.aircraft}</Ltr>
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-muted-foreground">
                        {t("adm.sch.effective")}
                      </dt>
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
                        setSaveError(null);
                        setFieldErrors({});
                        setDraft(structuredClone(s));
                      }}
                    >
                      {t("adm.common.edit")}
                    </PermissionButton>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </AdminPanel>

      {/* Schedule editor sheet */}
      <GazaSheet
        open={draft !== null}
        title={isNew ? t("adm.sch.new") : t("adm.sch.edit")}
        description={
          isNew ? t("adm.sch.sub") : `${draft?.number ?? ""} (${draft ? routeLabel(draft) : ""})`
        }
        onClose={() => setDraft(null)}
        footer={
          draft ? (
            <div className="flex w-full items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                <Ltr>{draft.id}</Ltr>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className={btnClass("outline", "sm")}
                >
                  {t("adm.common.cancel")}
                </button>
                <PermissionButton
                  allowed={mayEdit}
                  reason={t("adm.edit.readOnly")}
                  variant="primary"
                  disabled={createSchedule.isPending || updateSchedule.isPending}
                  aria-busy={createSchedule.isPending || updateSchedule.isPending}
                  onClick={save}
                >
                  {t("adm.edit.save")}
                </PermissionButton>
              </div>
            </div>
          ) : undefined
        }
      >
        {draft ? (
          <fieldset disabled={!mayEdit} className="space-y-4">
            {saveError ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              >
                {saveError}
              </div>
            ) : null}

            <Field
              label={t("adm.sch.number")}
              htmlFor="sc-number"
              error={fieldErrors["number"]}
              errorId="sc-number-error"
            >
              <Input
                id="sc-number"
                aria-invalid={Boolean(fieldErrors["number"]) || undefined}
                aria-describedby={fieldErrors["number"] ? "sc-number-error" : undefined}
                dir="ltr"
                value={draft.number}
                onChange={(e) => setDraft({ ...draft, number: e.target.value })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label={t("adm.sch.direction")}
                htmlFor="sc-dir"
                error={fieldErrors["direction"]}
                errorId="sc-dir-error"
              >
                <Select
                  id="sc-dir"
                  aria-invalid={Boolean(fieldErrors["direction"]) || undefined}
                  aria-describedby={fieldErrors["direction"] ? "sc-dir-error" : undefined}
                  value={draft.direction}
                  disabled={!isNew}
                  onChange={(e) =>
                    setDraft({ ...draft, direction: e.target.value as "out" | "in" })
                  }
                >
                  <option value="out">{t("adm.sch.out")}</option>
                  <option value="in">{t("adm.sch.in")}</option>
                </Select>
              </Field>

              <Field
                label={t("adm.sch.destination")}
                htmlFor="sc-dest"
                error={fieldErrors["destination"]}
                errorId="sc-dest-error"
              >
                <Select
                  id="sc-dest"
                  aria-invalid={Boolean(fieldErrors["destination"]) || undefined}
                  aria-describedby={fieldErrors["destination"] ? "sc-dest-error" : undefined}
                  value={draft.destination}
                  disabled={!isNew}
                  onChange={(e) => setDraft({ ...draft, destination: e.target.value })}
                >
                  {destinationOptions.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.code}
                      {d.city ? ` — ${pick(lang, d.city)}` : ""}
                      {d.active === false ? ` [${t("adm.common.inactive")}]` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {!isNew ? (
              <p className="text-xs text-muted-foreground">{t("network.routeLocked")}</p>
            ) : null}

            <div id="sc-days" tabIndex={-1} className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                {t("adm.sch.days")}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                  const active = draft.days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      aria-pressed={active}
                      className={`h-8 min-w-8 rounded px-2 text-xs font-semibold ${
                        active
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-background hover:bg-secondary"
                      }`}
                    >
                      {t(`adm.day.${day}`)}
                    </button>
                  );
                })}
              </div>
              {fieldErrors["days"] ? (
                <p id="sc-days-error" role="alert" className="text-xs text-destructive">
                  {fieldErrors["days"]}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label={t("adm.sch.depart")}
                htmlFor="sc-dep"
                error={fieldErrors["departTime"]}
                errorId="sc-dep-error"
              >
                <Input
                  id="sc-dep"
                  aria-invalid={Boolean(fieldErrors["departTime"]) || undefined}
                  aria-describedby={fieldErrors["departTime"] ? "sc-dep-error" : undefined}
                  dir="ltr"
                  placeholder="08:00"
                  value={draft.departTime}
                  onChange={(e) => setDraft({ ...draft, departTime: e.target.value })}
                />
              </Field>
              <Field
                label={t("adm.sch.arrive")}
                htmlFor="sc-arr"
                error={fieldErrors["arriveTime"]}
                errorId="sc-arr-error"
              >
                <Input
                  id="sc-arr"
                  aria-invalid={Boolean(fieldErrors["arriveTime"]) || undefined}
                  aria-describedby={fieldErrors["arriveTime"] ? "sc-arr-error" : undefined}
                  dir="ltr"
                  placeholder="10:00"
                  value={draft.arriveTime}
                  onChange={(e) => setDraft({ ...draft, arriveTime: e.target.value })}
                />
              </Field>
            </div>

            <Field
              label={t("adm.col.aircraft")}
              htmlFor="sc-ac"
              error={fieldErrors["aircraftId"] ?? fieldErrors["aircraft"]}
              errorId="sc-ac-error"
            >
              <Select
                id="sc-ac"
                disabled={!mayEdit || fleetError || !fleetData}
                dir="ltr"
                aria-invalid={
                  Boolean(fieldErrors["aircraftId"] ?? fieldErrors["aircraft"]) || undefined
                }
                aria-describedby={
                  (fieldErrors["aircraftId"] ?? fieldErrors["aircraft"]) ? "sc-ac-error" : undefined
                }
                value={draft.aircraftId ?? draft.aircraft}
                onChange={(e) => {
                  const chosen = fleetData?.aircraft?.find((a) => a.id === e.target.value);
                  setDraft({
                    ...draft,
                    aircraftId: chosen ? chosen.id : e.target.value,
                    aircraft: chosen ? chosen.model : draft.aircraft,
                  });
                }}
              >
                {scheduleAircraftOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </Select>
              {fleetError ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("adm.flight.fleetUnavailable") ||
                    "Fleet configuration is unavailable; aircraft reassignment is disabled."}
                </p>
              ) : null}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label={t("adm.sch.from")}
                htmlFor="sc-from"
                error={fieldErrors["from"]}
                errorId="sc-from-error"
              >
                <Input
                  id="sc-from"
                  aria-invalid={Boolean(fieldErrors["from"]) || undefined}
                  aria-describedby={fieldErrors["from"] ? "sc-from-error" : undefined}
                  dir="ltr"
                  type="date"
                  value={draft.from}
                  onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                />
              </Field>
              <Field
                label={t("adm.sch.until")}
                htmlFor="sc-until"
                error={fieldErrors["until"]}
                errorId="sc-until-error"
              >
                <Input
                  id="sc-until"
                  aria-invalid={Boolean(fieldErrors["until"]) || undefined}
                  aria-describedby={fieldErrors["until"] ? "sc-until-error" : undefined}
                  dir="ltr"
                  type="date"
                  value={draft.until}
                  onChange={(e) => setDraft({ ...draft, until: e.target.value })}
                />
              </Field>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="sc-active"
                checked={draft.active}
                onCheckedChange={(val) => setDraft({ ...draft, active: val })}
              />
              <label
                htmlFor="sc-active"
                className="text-sm font-semibold cursor-pointer select-none"
              >
                {t("adm.common.active")}
              </label>
            </div>

            <div id="sc-exceptions" tabIndex={-1} className="border-t border-border pt-3">
              {fieldErrors["exceptions"] ? (
                <p role="alert" className="text-xs text-destructive mb-2">
                  {fieldErrors["exceptions"]}
                </p>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">{t("adm.sch.exceptions")}</h3>
                <button
                  type="button"
                  onClick={() => {
                    const excId = newScheduleId();
                    let excDate = draft.from;
                    if (
                      draft.days.length > 0 &&
                      Number.isFinite(new Date(`${draft.from}T00:00:00Z`).getTime())
                    ) {
                      let cur = draft.from;
                      for (let d = 0; d < 7; d++) {
                        const dt = new Date(`${cur}T00:00:00Z`);
                        if (draft.days.includes(dt.getUTCDay())) {
                          excDate = cur;
                          break;
                        }
                        dt.setUTCDate(dt.getUTCDate() + 1);
                        cur = dt.toISOString().slice(0, 10);
                      }
                    }
                    setDraft({
                      ...draft,
                      exceptions: [
                        ...draft.exceptions,
                        { id: excId, date: excDate, kind: "cancelled", detail: "" },
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
                    <li
                      key={exc.id}
                      className="rounded-md border border-border bg-card p-3 space-y-3"
                    >
                      <ScheduleExceptionEditor
                        exception={exc}
                        index={i}
                        schedule={draft}
                        aircraft={fleetData?.aircraft ?? []}
                        fleetUnavailable={fleetError || !fleetData}
                        editable={mayEdit}
                        errors={fieldErrors}
                        onChange={(exception) =>
                          setDraft({
                            ...draft,
                            exceptions: draft.exceptions.map((e, n) => (n === i ? exception : e)),
                          })
                        }
                      />
                      <button
                        type="button"
                        disabled={!mayEdit}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            exceptions: draft.exceptions.filter((x) => x.id !== exc.id),
                          })
                        }
                        className="rounded-md px-2 py-1 text-xs font-semibold text-status-cancelled hover:bg-secondary disabled:opacity-50"
                      >
                        {t("adm.sch.excRemove")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </fieldset>
        ) : null}
      </GazaSheet>
    </div>
  );
}
