import { Field, Input, Select } from "@/components/kit";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import type { Aircraft } from "@/lib/fleet";
import type { Schedule, ScheduleException, ExceptionKind } from "@/lib/schedules";

/** A detached, explicit operator command. Notes never become effects implicitly. */
export function ScheduleExceptionEditor({
  exception: exc,
  index,
  schedule,
  aircraft,
  fleetUnavailable,
  editable,
  errors,
  onChange,
}: {
  exception: ScheduleException;
  index: number;
  schedule: Schedule;
  aircraft: Aircraft[];
  fleetUnavailable: boolean;
  editable: boolean;
  errors: Record<string, string>;
  onChange: (exception: ScheduleException) => void;
}) {
  const { t } = useI18n();
  const enabled = Boolean(exc.effect);
  const defaultPlane =
    aircraft.find((a) => a.active && a.id === schedule.aircraftId) ??
    aircraft.find((a) => a.active);
  const effectFor = (kind: ExceptionKind): ScheduleException => {
    const base = { id: exc.id, date: exc.date, detail: exc.detail };
    switch (kind) {
      case "cancelled":
        return { ...base, kind, effect: { cancelled: true } };
      case "time":
        return {
          ...base,
          kind,
          effect: { departTime: schedule.departTime, arriveTime: schedule.arriveTime },
        };
      case "aircraft":
        return {
          ...base,
          kind,
          effect: { aircraftId: defaultPlane?.id ?? "", aircraft: defaultPlane?.model ?? "" },
        };
      case "extra":
        return { ...base, kind, effect: {} };
    }
  };
  const errorFor = (field: string) => errors[`exceptions.${index}.${field}`];
  const control = (field: string) => {
    const id = `exc-${field.replace(".", "-")}-${exc.id}`;
    return {
      id,
      "aria-invalid": Boolean(errorFor(field)) || undefined,
      "aria-describedby": errorFor(field) ? `${id}-error` : undefined,
    };
  };
  const equipment = exc.kind === "aircraft" || exc.kind === "extra" ? exc.effect : undefined;
  const options = aircraft
    .filter((a) => a.active || a.id === equipment?.aircraftId)
    .map((a) => ({
      id: a.id,
      label: `${a.model} (${a.registration})${a.active ? "" : ` [${t("adm.common.inactive")}]`}`,
    }));
  if (equipment?.aircraftId && !options.some((a) => a.id === equipment.aircraftId))
    options.unshift({
      id: equipment.aircraftId,
      label: equipment.aircraft ?? equipment.aircraftId,
    });
  const changeTime = (field: "departTime" | "arriveTime", value: string) => {
    if (exc.kind === "time" && exc.effect)
      onChange({ ...exc, effect: { ...exc.effect, [field]: value } });
    if (exc.kind === "extra" && exc.effect) {
      const effect = { ...exc.effect };
      if (value) effect[field] = value;
      else delete effect[field];
      onChange({ ...exc, effect });
    }
  };
  const times =
    (exc.kind === "time" || exc.kind === "extra") && exc.effect ? exc.effect : undefined;
  return (
    <fieldset disabled={!editable} className="space-y-3">
      <legend className="text-xs font-semibold">
        {t(enabled ? "adm.sch.effectActive" : "adm.sch.planningAnnotation")}
      </legend>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`exc-effect-toggle-${exc.id}`} className="text-xs">
          {t("adm.sch.applyOperations")}
        </label>
        <Switch
          id={`exc-effect-toggle-${exc.id}`}
          checked={enabled}
          disabled={
            !editable ||
            (!enabled && exc.kind === "aircraft" && (fleetUnavailable || !defaultPlane))
          }
          onCheckedChange={(checked) => {
            if (!editable) return;
            if (checked) onChange(effectFor(exc.kind));
            else onChange({ id: exc.id, date: exc.date, detail: exc.detail, kind: exc.kind });
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field
          label={t("adm.sch.excDate")}
          htmlFor={control("date").id}
          error={errorFor("date")}
          errorId={`${control("date").id}-error`}
        >
          <Input
            {...control("date")}
            dir="ltr"
            type="date"
            value={exc.date}
            onChange={(e) => onChange({ ...exc, date: e.target.value })}
          />
        </Field>
        <Field
          label={t("adm.sch.excKind")}
          htmlFor={control("kind").id}
          error={errorFor("kind")}
          errorId={`${control("kind").id}-error`}
        >
          <Select
            {...control("kind")}
            value={exc.kind}
            onChange={(e) => {
              const kind = e.target.value as ExceptionKind;
              onChange(
                enabled
                  ? effectFor(kind)
                  : { id: exc.id, date: exc.date, detail: exc.detail, kind },
              );
            }}
          >
            {(["cancelled", "time", "aircraft", "extra"] as const).map((kind) => (
              <option
                key={kind}
                value={kind}
                disabled={enabled && kind === "aircraft" && (fleetUnavailable || !defaultPlane)}
              >
                {t(`adm.sch.exc.${kind}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {enabled && exc.kind === "cancelled" ? (
        <p className="text-xs text-muted-foreground">{t("adm.sch.cancelledNote")}</p>
      ) : null}
      {enabled && exc.kind === "extra" ? (
        <p className="text-xs text-muted-foreground">{t("adm.sch.extraTimesEquip")}</p>
      ) : null}
      {times ? (
        <div className="grid grid-cols-2 gap-2">
          {(["departTime", "arriveTime"] as const).map((field) => (
            <Field
              key={field}
              label={t(field === "departTime" ? "adm.sch.depart" : "adm.sch.arrive")}
              htmlFor={control(`effect.${field}`).id}
              error={errorFor(`effect.${field}`)}
              errorId={`${control(`effect.${field}`).id}-error`}
            >
              <Input
                {...control(`effect.${field}`)}
                dir="ltr"
                value={times[field] ?? ""}
                placeholder={schedule[field]}
                onChange={(e) => changeTime(field, e.target.value)}
              />
            </Field>
          ))}
        </div>
      ) : null}
      {equipment ? (
        <Field
          label={t("adm.col.aircraft")}
          htmlFor={control("effect.aircraftId").id}
          error={errorFor("effect.aircraftId") ?? errorFor("effect.aircraft")}
          errorId={`${control("effect.aircraftId").id}-error`}
        >
          <Select
            {...control("effect.aircraftId")}
            aria-invalid={
              Boolean(errorFor("effect.aircraftId") ?? errorFor("effect.aircraft")) || undefined
            }
            aria-describedby={
              (errorFor("effect.aircraftId") ?? errorFor("effect.aircraft"))
                ? `${control("effect.aircraftId").id}-error`
                : undefined
            }
            dir="ltr"
            disabled={!editable || fleetUnavailable}
            value={equipment.aircraftId ?? ""}
            onChange={(e) => {
              const chosen = aircraft.find((a) => a.id === e.target.value && a.active);
              if (exc.kind === "aircraft" && exc.effect && chosen)
                onChange({ ...exc, effect: { aircraftId: chosen.id, aircraft: chosen.model } });
              if (exc.kind === "extra" && exc.effect) {
                const effect = { ...exc.effect };
                delete effect.aircraftId;
                delete effect.aircraft;
                if (chosen)
                  Object.assign(effect, { aircraftId: chosen.id, aircraft: chosen.model });
                onChange({ ...exc, effect });
              }
            }}
          >
            {exc.kind === "extra" ? (
              <option value="">{t("adm.sch.useScheduleAircraft")}</option>
            ) : null}
            {options.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
          {fleetUnavailable ? (
            <p className="text-xs text-muted-foreground">{t("fleet.error.unavailable")}</p>
          ) : null}
        </Field>
      ) : null}
      <Field
        label={t("adm.sch.excDetail")}
        htmlFor={control("detail").id}
        error={errorFor("detail")}
        errorId={`${control("detail").id}-error`}
      >
        <Input
          {...control("detail")}
          value={exc.detail}
          onChange={(e) => onChange({ ...exc, detail: e.target.value })}
        />
      </Field>
    </fieldset>
  );
}
