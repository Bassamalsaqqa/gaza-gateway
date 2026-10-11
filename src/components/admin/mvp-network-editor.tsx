import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Field, Input, Select, btnClass } from "@/components/kit";
import { AdminPageHeader, AdminPanel } from "./admin-kit";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { useRepositories } from "@/lib/repositories/registry";
import { HttpNetworkRepository, type AirportReference } from "@/lib/network/http-repository";
import { NETWORK_CODES } from "@/lib/network/types";
import { networkKeys } from "@/lib/network/keys";

/** Original Admin surface, shared airport authority including the GZA base. */
export function MvpNetworkEditor() {
  const { lang } = useI18n(); const { can } = useAdmin();
  const { network } = useRepositories(); const cache = useQueryClient();
  const [edit, setEdit] = useState<{ creating: boolean; value: AirportReference } | null>(null);
  const [failed, setFailed] = useState(false);
  const label = (en: string, ar: string) => pick(lang, { en, ar });
  const repository = network instanceof HttpNetworkRepository ? network : null;
  const airports = useQuery({ queryKey: [...networkKeys.all, "admin"], enabled: can("ops.view") && repository !== null,
    queryFn: ({ signal }) => { if (!repository) throw new Error("Network authority unavailable."); return repository.listAdmin(signal); }, retry: false });
  const save = useMutation({ mutationFn: async (command: { creating: boolean; value: AirportReference }) => {
    if (!repository) throw new Error("Network authority unavailable.");
    if (command.creating) return repository.create(command.value);
    const { code, ...patch } = command.value; return repository.patchAirport(code, patch);
  }, onSuccess: async () => { setEdit(null); await cache.invalidateQueries({ queryKey: networkKeys.all }); } });
  const editable = can("ops.edit") && !save.isPending;
  if (!can("ops.view")) return <p role="alert">{label("Access is not permitted.", "لا يُسمح بالوصول.")}</p>;
  if (airports.isPending) return <p role="status">{label("Loading airports...", "جارٍ تحميل المطارات...")}</p>;
  if (airports.isError || !repository) return <div role="alert">{label("Could not load airports.", "تعذر تحميل المطارات.")}
    <button className={btnClass("outline", "sm")} onClick={() => void airports.refetch()}>{label("Retry", "إعادة المحاولة")}</button></div>;
  const available = (["GZA", ...NETWORK_CODES] as const).filter(code => !airports.data?.some(item => item.code === code));
  const change = (patch: Partial<AirportReference>) => { if (edit) setEdit({ ...edit, value: { ...edit.value, ...patch } }); };
  return <div className="space-y-4">
    <AdminPageHeader title={label("Destinations and airports", "الوجهات والمطارات")} />
    <button type="button" disabled={!editable || available.length === 0} className={btnClass("outline", "sm")} onClick={() => {
      const code = available[0]; if (!code) return; setFailed(false);
      setEdit({ creating: true, value: { code, airportName: { en: "", ar: "" }, city: { en: "", ar: "" }, country: { en: "", ar: "" }, timezone: "", blockMinutes: 60, active: false } });
    }}>{label("Add airport", "إضافة مطار")}</button>
    {airports.data?.length === 0 && <p>{label("No airports have been configured.", "لم تتم إضافة مطارات.")}</p>}
    {airports.data?.map(airport => <AdminPanel key={airport.code} title={pick(lang, airport.airportName)}>
      <div className="flex flex-wrap items-center gap-3"><span dir="ltr">{airport.code}</span>
        <span>{pick(lang, airport.city)}</span><span>{airport.active ? label("Active", "نشط") : label("Inactive", "غير نشط")}</span>
        <button type="button" className={btnClass("outline", "sm")} disabled={!editable} onClick={() => { setFailed(false); setEdit({ creating: false, value: structuredClone(airport) }); }}>{label("Edit", "تعديل")}</button>
      </div>
    </AdminPanel>)}
    {edit && <AdminPanel title={label("Airport details", "تفاصيل المطار")}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); if (!editable) return; setFailed(false); void save.mutateAsync(edit).catch(() => setFailed(true)); }}>
        <Field htmlFor="airport-code" label={label("Airport code", "رمز المطار")}>
          <Select id="airport-code" dir="ltr" disabled={!edit.creating || !editable} value={edit.value.code} onChange={event => change({ code: event.target.value as AirportReference["code"] })}>
            {(edit.creating ? available : [edit.value.code]).map(code => <option key={code}>{code}</option>)}
          </Select>
        </Field>
        <Field htmlFor="airport-timezone" label={label("Time zone", "المنطقة الزمنية")}><Input id="airport-timezone" required maxLength={80} dir="ltr" value={edit.value.timezone} onChange={event => change({ timezone: event.target.value })} /></Field>
        {(["airportName", "city", "country"] as const).flatMap(field => (["en", "ar"] as const).map(locale => {
          const name = field === "airportName" ? label("Airport name", "اسم المطار") : field === "city" ? label("City", "المدينة") : label("Country", "الدولة");
          const id = `airport-${field}-${locale}`;
          return <Field key={id} htmlFor={id} label={`${name} (${locale === "en" ? label("English", "الإنجليزية") : label("Arabic", "العربية")})`}>
            <Input id={id} required maxLength={160} dir={locale === "ar" ? "rtl" : "ltr"} value={edit.value[field][locale]} onChange={event => change({ [field]: { ...edit.value[field], [locale]: event.target.value } })} />
          </Field>;
        }))}
        <Field htmlFor="airport-duration" label={label("Route duration (minutes)", "مدة المسار (دقائق)")}><Input id="airport-duration" type="number" required min={20} max={600} step={1} dir="ltr" value={edit.value.blockMinutes} onChange={event => change({ blockMinutes: Number(event.target.value) })} /></Field>
        <label className="flex items-center gap-2"><input type="checkbox" checked={edit.value.active} onChange={event => change({ active: event.target.checked })} />{label("Active", "نشط")}</label>
        {failed && <p role="alert" className="text-clay sm:col-span-2">{label("Could not save. Check the fields and retry.", "تعذر الحفظ. راجع الحقول وحاول مجدداً.")}</p>}
        <div className="flex gap-2 sm:col-span-2"><button type="submit" disabled={!editable} className={btnClass("primary", "sm")}>{label("Save", "حفظ")}</button>
          <button type="button" disabled={save.isPending} className={btnClass("outline", "sm")} onClick={() => setEdit(null)}>{label("Cancel", "إلغاء")}</button></div>
      </form>
    </AdminPanel>}
  </div>;
}
