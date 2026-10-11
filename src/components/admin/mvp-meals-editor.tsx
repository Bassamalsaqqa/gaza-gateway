import { useState } from "react";
import { Field, Input, btnClass } from "@/components/kit";
import { AdminPanel } from "./admin-kit";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { useMealMutation, useMealsQuery, type MealCommand } from "@/lib/meals/queries";
import type { MealCreate, MealOption } from "@/lib/meals/http-repository";

export function MvpMealsEditor() {
  const { lang } = useI18n(); const { can } = useAdmin();
  const catalog = useMealsQuery(true, can("commercial.view")); const mutation = useMealMutation();
  const [edit, setEdit] = useState<{ creating: boolean; value: MealCreate } | null>(null);
  const [error, setError] = useState(false);
  const label = (en: string, ar: string) => pick(lang, { en, ar });
  const editable = can("commercial.edit") && !mutation.isPending;
  const run = async (command: MealCommand) => {
    if (!editable) return; setError(false);
    try { await mutation.mutateAsync(command); setEdit(null); } catch { setError(true); }
  };
  if (!can("commercial.view")) return <p role="alert">{label("Access is not permitted.", "لا يُسمح بالوصول.")}</p>;
  if (catalog.isPending) return <p role="status">{label("Loading meals...", "جاري تحميل الوجبات...")}</p>;
  if (catalog.isError) return <button className={btnClass("outline", "sm")} onClick={() => void catalog.refetch()}>{label("Retry loading", "إعادة التحميل")}</button>;
  const snapshot = catalog.data;
  const startEdit = (meal: MealOption) => { setError(false); setEdit({ creating: false, value: structuredClone(meal) }); };
  return <div className="space-y-4">
    {error && <p role="alert" className="text-clay">{label("Could not save. Refresh the list and try again.", "تعذر الحفظ. حدّث القائمة وحاول مجدداً.")}</p>}
    <button type="button" disabled={!editable} className={btnClass("outline", "sm")} onClick={() => setEdit({ creating: true, value: { id: "", label: { en: "", ar: "" }, active: true } })}>
      {label("Add meal", "إضافة وجبة")}</button>
    {snapshot.meals.length === 0 && <p>{label("No meals have been added.", "لم تتم إضافة وجبات.")}</p>}
    {snapshot.meals.map((meal, index) => <AdminPanel key={meal.id} title={pick(lang, meal.label)}>
      <div className="flex flex-wrap items-center gap-2">
        <span dir="ltr" className="code-id">{meal.id}</span>
        <span>{meal.active ? label("Active", "نشطة") : label("Inactive", "غير نشطة")}</span>
        {snapshot.defaultMealId === meal.id && <span>{label("Default", "الافتراضية")}</span>}
        <button type="button" disabled={!editable} className={btnClass("outline", "sm")} onClick={() => startEdit(meal)}>{label("Edit", "تعديل")}</button>
        <button type="button" disabled={!editable || !meal.active || snapshot.defaultMealId === meal.id} className={btnClass("outline", "sm")} onClick={() => void run({ kind: "default", id: meal.id })}>{label("Make default", "تعيين كافتراضية")}</button>
        <button type="button" disabled={!editable || index === 0} className={btnClass("outline", "sm")} onClick={() => {
          const ids = snapshot.meals.map(item => item.id); [ids[index - 1], ids[index]] = [ids[index]!, ids[index - 1]!]; void run({ kind: "order", ids });
        }}>{label("Move up", "نقل للأعلى")}</button>
      </div>
    </AdminPanel>)}
    {edit && <AdminPanel title={label("Meal details", "تفاصيل الوجبة")}>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (edit.creating) void run({ kind: "create", body: edit.value });
        else { const { id, ...body } = edit.value; void run({ kind: "patch", id, body }); } }}>
        <Field htmlFor="meal-id" label={label("Identifier", "المعرّف")}><Input id="meal-id" dir="ltr" value={edit.value.id} disabled={!edit.creating} required pattern="[A-Za-z0-9_-]{1,64}" maxLength={64}
          onChange={event => setEdit({ ...edit, value: { ...edit.value, id: event.target.value } })} /></Field>
        {(["en", "ar"] as const).map(locale => <Field key={locale} htmlFor={`meal-label-${locale}`} label={locale === "en" ? label("English name", "الاسم الإنجليزي") : label("Arabic name", "الاسم العربي")}>
          <Input id={`meal-label-${locale}`} dir={locale === "ar" ? "rtl" : "ltr"} required maxLength={500} value={edit.value.label[locale]}
            onChange={event => setEdit({ ...edit, value: { ...edit.value, label: { ...edit.value.label, [locale]: event.target.value } } })} /></Field>)}
        <label className="flex items-center gap-2"><input type="checkbox" checked={edit.value.active}
          disabled={snapshot.defaultMealId === edit.value.id} onChange={event => setEdit({ ...edit, value: { ...edit.value, active: event.target.checked } })} />{label("Active", "نشطة")}</label>
        {snapshot.defaultMealId === edit.value.id && <p className="text-sm text-muted-foreground">{label("Choose another default before retiring this meal.", "اختر وجبة افتراضية أخرى قبل إيقاف هذه الوجبة.")}</p>}
        <div className="flex gap-2"><button type="submit" disabled={!editable} className={btnClass("primary", "sm")}>{label("Save", "حفظ")}</button>
          <button type="button" className={btnClass("outline", "sm")} onClick={() => setEdit(null)}>{label("Cancel", "إلغاء")}</button></div>
      </form>
    </AdminPanel>}
  </div>;
}
