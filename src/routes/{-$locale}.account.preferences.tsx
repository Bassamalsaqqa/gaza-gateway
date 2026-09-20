import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { btnClass, Field, Notice, Panel } from "@/components/kit";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mealOptions } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

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
  const { account, updateAccount } = useStore();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    seat: account?.seatPreference ?? "window",
    meal: account?.mealPreference ?? "standard",
  });

  return (
    <Panel>
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("account.preferences")}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateAccount({ seatPreference: form.seat, mealPreference: form.meal });
          setSaved(true);
        }}
        className="mt-4 grid gap-3 sm:grid-cols-2"
      >
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t("account.prefSeat")}</legend>
          <RadioGroup value={form.seat} onValueChange={(seat) => setForm((prev) => ({ ...prev, seat }))} className="grid grid-cols-3 gap-2">
            {([[
              "window", t("account.seatWindow"),
            ], ["aisle", t("account.seatAisle")], ["none", t("account.seatNone")]] as const).map(([value, label]) => (
              <div key={value} className="relative">
                <RadioGroupItem id={`pref-seat-${value}`} value={value} className="peer sr-only" />
                <label htmlFor={`pref-seat-${value}`} className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-input bg-card px-2 text-center text-sm font-semibold transition-colors hover:bg-secondary/40 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-brand-soft peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
                  {label}
                </label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>
        <Field label={t("account.prefMeal")} htmlFor="pref-meal">
          <Select value={form.meal} onValueChange={(meal) => setForm((prev) => ({ ...prev, meal }))}>
            <SelectTrigger id="pref-meal" className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>{mealOptions.map((meal) => <SelectItem key={meal.id} value={meal.id}>{pick(lang, meal.label)}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <button type="submit" className={btnClass("primary", "md")}>
            {t("account.save")}
          </button>
          {saved ? <p className="mt-3 text-sm font-medium text-brand-deep">{t("account.saved")}</p> : null}
        </div>
      </form>
      <div className="mt-5">
        <Notice>{t("account.prefNote")}</Notice>
      </div>
    </Panel>
  );
}
