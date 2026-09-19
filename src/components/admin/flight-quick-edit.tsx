import { useState } from "react";
import { Field, Input, Select, Textarea, btnClass } from "@/components/kit";
import { GazaSheet, Ltr, PermissionButton } from "@/components/admin/admin-kit";
import { useAdmin } from "@/lib/admin-store";
import { useI18n } from "@/lib/i18n";
import type { Flight, FlightStatus } from "@/lib/data";

export const FLIGHT_STATUSES: FlightStatus[] = [
  "Scheduled",
  "OnTime",
  "Boarding",
  "Delayed",
  "Departed",
  "Landed",
  "Cancelled",
];

export const GATE_IDENTIFIER_PATTERN = /^[A-Za-z0-9]{1,10}$/;

export type QuickEditFlight = Flight & { note?: string; revisedDepart?: string };

/**
 * Shared operational quick edit for a dated flight: status, terminal, gate,
 * aircraft, revised departure and a short note. Local admin state only.
 */
export function FlightQuickEdit({
  flight,
  onClose,
}: {
  flight: QuickEditFlight | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { can, applyOverride, toast, ops } = useAdmin();
  const mayEdit = can("ops.edit");

  const [form, setForm] = useState(() => blank(flight));
  const [loaded, setLoaded] = useState<string | null>(flight?.id ?? null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset the form whenever a different flight is opened.
  if (flight && flight.id !== loaded) {
    setLoaded(flight.id);
    setForm(blank(flight));
    setValidationError(null);
  }

  const save = () => {
    if (!flight) return;
    setValidationError(null);

    // Validate revised time if provided
    if (form.revised && form.revised.trim()) {
      const timeMatch = /^([01]\d|2[0-3]):[0-5]\d$/.test(form.revised.trim());
      if (!timeMatch) {
        setValidationError(t("adm.flight.revisedError"));
        return;
      }
    }

    if (form.gate && !GATE_IDENTIFIER_PATTERN.test(form.gate.trim())) {
      setValidationError(t("adm.flight.gateError"));
      return;
    }

    applyOverride(flight.id, {
      status: form.status,
      gate: form.gate.trim(),
      terminal: form.terminal.trim(),
      aircraft: form.aircraft.trim(),
      revisedDepart: form.revised.trim(),
      note: form.note.trim(),
    });
    toast(t("adm.edit.saved", { flight: flight.number }));
    onClose();
  };

  const aircraftNames = ops.aircraft.map((a) => a.name);
  if (flight && !aircraftNames.includes(flight.aircraft)) aircraftNames.unshift(flight.aircraft);

  return (
    <GazaSheet
      open={flight !== null}
      title={flight ? t("adm.edit.title", { flight: flight.number }) : ""}
      description={t("adm.edit.sub")}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={btnClass("outline", "sm")}>
            {t("adm.edit.cancel")}
          </button>
          <PermissionButton
            allowed={mayEdit}
            reason={t("adm.edit.readOnly")}
            variant="primary"
            onClick={save}
          >
            {t("adm.edit.save")}
          </PermissionButton>
        </>
      }
    >
      {flight ? (
        <div className="space-y-4">
          {validationError ? (
            <div
              role="alert"
              className="rounded-md border border-status-cancelled/30 bg-status-cancelled/10 px-3 py-2 text-xs font-semibold text-status-cancelled"
            >
              {validationError}
            </div>
          ) : null}
          <p className="text-sm">
            <Ltr className="font-bold">{flight.number}</Ltr>{" "}
            <Ltr className="text-muted-foreground">{`${flight.originCode} → ${flight.destinationCode}`}</Ltr>
          </p>
          <Field label={t("adm.edit.status")} htmlFor="fq-status">
            <Select
              id="fq-status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as FlightStatus })}
            >
              {FLIGHT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("adm.edit.terminal")} htmlFor="fq-terminal">
              <Input
                id="fq-terminal"
                dir="ltr"
                value={form.terminal}
                onChange={(e) => setForm({ ...form, terminal: e.target.value })}
              />
            </Field>
            <Field label={t("adm.edit.gate")} htmlFor="fq-gate">
              <Input
                id="fq-gate"
                dir="ltr"
                value={form.gate}
                onChange={(e) => setForm({ ...form, gate: e.target.value })}
              />
            </Field>
          </div>
          <Field label={t("adm.col.aircraft")} htmlFor="fq-aircraft">
            <Select
              id="fq-aircraft"
              dir="ltr"
              value={form.aircraft}
              onChange={(e) => setForm({ ...form, aircraft: e.target.value })}
            >
              {aircraftNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("adm.edit.revised")} htmlFor="fq-revised">
            <Input
              id="fq-revised"
              dir="ltr"
              type="time"
              value={form.revised}
              onChange={(e) => setForm({ ...form, revised: e.target.value })}
            />
          </Field>
          <Field label={t("adm.edit.note")} htmlFor="fq-note">
            <Textarea
              id="fq-note"
              className="min-h-24"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </Field>
          {!mayEdit ? (
            <p className="text-xs text-muted-foreground">{t("adm.edit.readOnly")}</p>
          ) : null}
        </div>
      ) : null}
    </GazaSheet>
  );
}

function blank(flight: QuickEditFlight | null) {
  return {
    status: (flight?.status ?? "Scheduled") as FlightStatus,
    gate: flight?.gate ?? "",
    terminal: flight?.terminal ?? "",
    aircraft: flight?.aircraft ?? "",
    revised: flight?.revisedDepart ?? "",
    note: flight?.note ?? "",
  };
}
