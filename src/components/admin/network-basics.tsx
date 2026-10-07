import { useState } from "react";
import { Field, Input, btnClass } from "@/components/kit";
import { AdminStickyActions, PermissionButton } from "./admin-kit";
import { Switch } from "@/components/ui/switch";
import { useAdmin } from "@/lib/admin-store";
import { useI18n } from "@/lib/i18n";
import { NetworkError, parseNetworkDestination, useUpdateNetworkDestinationMutation, type NetworkDestination, type NetworkDestinationPatch } from "@/lib/network";
import { useRepositories } from "@/lib/repositories";
import { executeAuditedAdminCommand } from "@/lib/activity";

export function NetworkBasics({ destination, unavailable }: { destination: NetworkDestination; unavailable: boolean }) {
  const { t } = useI18n();
  const { can, toast, actor } = useAdmin();
  const { activity: activityRepo } = useRepositories();
  const mutation = useUpdateNetworkDestinationMutation();
  const [edit, setEdit] = useState<{ base: NetworkDestination; value: NetworkDestination } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState(false);
  const form = edit?.value ?? destination;
  const remoteChanged = Boolean(edit && JSON.stringify(edit.base) !== JSON.stringify(destination));
  const reset = () => { setEdit(null); setErrors({}); setSaveError(false); };
  const change = (patch: Partial<NetworkDestination>) => setEdit({ base: edit?.base ?? destination, value: { ...form, ...patch } });
  const mayEdit = can("ops.edit") && !unavailable && !mutation.isPending;
  const save = async () => {
    if (!mayEdit || remoteChanged) return;
    setErrors({}); setSaveError(false);
    try {
      const { code, ...values } = parseNetworkDestination(form);
      const base = edit?.base ?? destination;
      const patch = Object.fromEntries(Object.entries(values).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(base[key as keyof NetworkDestination]))) as NetworkDestinationPatch;
      if (Object.keys(patch).length > 0) {
        await executeAuditedAdminCommand({
          domainCommand: () => mutation.mutateAsync({ code, patch }),
          activityRepo,
          actor,
          event: {
            module: "network",
            action: "updated",
            targetType: "destination",
            targetId: code,
            metadata: {
              code,
              active: patch.active ?? destination.active,
            },
          },
          isNoOp: (receipt) => !receipt.changed,
          onAuditWarning: () => toast(t("a2.ac.auditWarning")),
        });
      }
      reset(); toast(t("adm.dest.saved", { code }));
    } catch (error) {
      if (error instanceof NetworkError && error.code === "invalid_network") {
        const next: Record<string, string> = {};
        for (const issue of error.issues) {
          const field = issue.path.join(".");
          next[field] = t(["airportName", "city", "country"].includes(String(issue.path[0])) ? "network.invalid.label" : `network.invalid.${field}`);
        }
        setErrors(next);
        requestAnimationFrame(() => document.getElementById(`de-${Object.keys(next)[0]?.replaceAll(".", "-")}`)?.focus());
      } else setSaveError(true);
    }
  };
  const association = (field: string) => ({
    "aria-invalid": Boolean(errors[field]) || undefined,
    "aria-describedby": errors[field] ? `de-${field.replaceAll(".", "-")}-error` : undefined,
  });
  return <div className="space-y-4" data-testid="network-basics">
    <p className="text-xs text-muted-foreground">{t("network.scope")}</p>
    {remoteChanged ? <div role="alert" className="text-sm text-muted-foreground">{t("network.remoteChanged")} <button type="button" onClick={reset} className={btnClass("outline", "sm")}>{t("network.reload")}</button></div> : null}
    {saveError ? <p role="alert" className="text-sm text-destructive">{t("network.saveError")}</p> : null}
    <fieldset disabled={!mayEdit} className="grid min-w-0 gap-3 sm:grid-cols-2">
      <Field label={t("adm.dest.iata")} htmlFor="de-code"><Input id="de-code" dir="ltr" value={form.code} readOnly /></Field>
      <Field label={t("adm.dest.tz")} htmlFor="de-timezone" error={errors["timezone"]} errorId="de-timezone-error">
        <Input id="de-timezone" dir="ltr" value={form.timezone} onChange={e => change({ timezone: e.target.value })} {...association("timezone")} />
      </Field>
      {(["airportName", "city", "country"] as const).flatMap(field => (["en", "ar"] as const).map(locale => {
        const key = `${field}.${locale}`, id = `de-${field}-${locale}`;
        return <Field key={key} htmlFor={id} error={errors[key]} errorId={`${id}-error`} label={`${t(`adm.dest.${field}`)} (${t(locale === "en" ? "adm.common.english" : "adm.common.arabic")})`}>
          <Input id={id} dir={locale === "ar" ? "rtl" : "ltr"} value={form[field][locale]} onChange={e => change({ [field]: { ...form[field], [locale]: e.target.value } })} {...association(key)} />
        </Field>;
      }))}
      <Field label={t("adm.dest.duration")} htmlFor="de-blockMinutes" error={errors["blockMinutes"]} errorId="de-blockMinutes-error">
        <Input id="de-blockMinutes" dir="ltr" type="number" min={20} max={600} step={1} value={Number.isFinite(form.blockMinutes) ? form.blockMinutes : ""} onChange={e => change({ blockMinutes: e.target.value === "" ? NaN : Number(e.target.value) })} {...association("blockMinutes")} />
      </Field>
      <div className="flex items-center gap-3"><Switch id="de-active" checked={form.active} onCheckedChange={active => change({ active })} /><label htmlFor="de-active" className="text-sm font-semibold">{t("adm.common.active")}</label></div>
    </fieldset>
    <AdminStickyActions>
      <button type="button" disabled={mutation.isPending} onClick={reset} className={btnClass("outline", "sm")}>{t("adm.edit.cancel")}</button>
      <PermissionButton allowed={mayEdit && !remoteChanged} reason={t("adm.edit.readOnly")} variant="primary" onClick={() => void save()}>{t("adm.edit.save")}</PermissionButton>
    </AdminStickyActions>
  </div>;
}
