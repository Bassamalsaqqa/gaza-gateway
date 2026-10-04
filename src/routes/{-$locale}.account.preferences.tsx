import { useCommercialOptions } from "@/lib/commercial/queries";
import { CommercialCatalogState } from "@/components/commercial-catalog-state";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { btnClass, Field, Notice, Panel } from "@/components/kit";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { pick, useI18n } from "@/lib/i18n";
import { usePassengerAccount, useUpdateAccountMutation } from "@/lib/passenger";

export const Route = createFileRoute("/{-$locale}/account/preferences")({
  head: () => ({
    meta: [
      { title: "Travel preferences — Gaza International Airport (GZA)" },
      { name: "description", content: "Set your preferred seat, meal, cabin and language for future bookings." },
      { property: "og:title", content: "Travel preferences — Gaza International Airport" },
      { property: "og:description", content: "Seat, meal, cabin and language preferences." },
    ],
  }),
  component: PreferencesPage,
});

function PreferencesPage() {
  const { t, lang } = useI18n();
  const commercial = useCommercialOptions();
  const { mealOptions } = commercial;
  const { data: account } = usePassengerAccount();
  const updateMutation = useUpdateAccountMutation();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    seat: account?.seatPreference ?? "window",
    meal: account?.mealPreference ?? "standard",
  });

  useEffect(() => {
    if (account) {
      setForm({
        seat: account.seatPreference ?? "window",
        meal: account.mealPreference ?? "standard",
      });
    }
  }, [account]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      if (!commercial.catalog || commercial.query.isError) throw new Error("catalog unavailable");
      const selected = mealOptions.find(m=>m.id===form.meal);
      if (!selected?.active && form.meal !== account?.mealPreference) { setError(t("commercial.error.service_unavailable")); return; }
      await updateMutation.mutateAsync({
        seatPreference: form.seat,
        mealPreference: form.meal,
      });
      setSaved(true);
    } catch {
      setError(t("error.saveFailed"));
    }
  };

  if (!commercial.catalog || commercial.query.isError) return <CommercialCatalogState />;
  const preferenceOptions = mealOptions.filter(m=>m.active || m.id===account?.mealPreference).sort((a,b)=>a.order-b.order);
  const unknownPreference = form.meal && !mealOptions.some(m=>m.id===form.meal);
  return (
    <Panel>
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("account.preferences")}</h2>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t("account.prefSeat")}</legend>
          <RadioGroup
            value={form.seat}
            onValueChange={(seat) => {
              setSaved(false);
              setForm((prev) => ({ ...prev, seat }));
            }}
            className="grid grid-cols-3 gap-2"
          >
            {([[
              "window", t("account.seatWindow"),
            ], ["aisle", t("account.seatAisle")], ["none", t("account.seatNone")]] as const).map(([value, label]) => (
              <div key={value} className="relative">
                <RadioGroupItem id={`pref-seat-${value}`} value={value} className="peer sr-only" />
                <label
                  htmlFor={`pref-seat-${value}`}
                  className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-input bg-card px-2 text-center text-sm font-semibold transition-colors hover:bg-secondary/40 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-brand-soft peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring"
                >
                  {label}
                </label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>
        <Field label={t("account.prefMeal")} htmlFor="pref-meal">
          <Select
            value={form.meal}
            onValueChange={(meal) => {
              setSaved(false);
              setForm((prev) => ({ ...prev, meal }));
            }}
          >
            <SelectTrigger id="pref-meal" className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>{unknownPreference ? <SelectItem value={form.meal}><span dir="ltr">{form.meal}</span></SelectItem> : null}{preferenceOptions.map((meal) => <SelectItem key={meal.id} value={meal.id}>{pick(lang, meal.label)}{!meal.active ? ` · ${t("commercial.retired")}` : ""}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className={btnClass("primary", "md")}
          >
            {updateMutation.isPending ? t("common.loading") : t("account.save")}
          </button>
          {saved ? (
            <p role="status" className="mt-3 text-sm font-medium text-brand-deep">
              {t("account.saved")}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-3 text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </form>
      <div className="mt-5">
        <Notice>{t("account.prefNote")}</Notice>
      </div>
    </Panel>
  );
}
