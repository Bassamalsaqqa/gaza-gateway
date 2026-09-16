import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { btnClass, Field, Notice, Panel, Select } from "@/components/kit";
import { mealOptions } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/account/preferences")({
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
    seat: account?.prefSeat ?? "window",
    meal: account?.prefMeal ?? "standard",
    cabin: account?.prefCabin ?? "economy",
  });

  return (
    <Panel>
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("account.preferences")}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateAccount({ prefSeat: form.seat, prefMeal: form.meal, prefCabin: form.cabin });
          setSaved(true);
        }}
        className="mt-4 grid gap-3 sm:grid-cols-2"
      >
        <Field label={t("account.prefSeat")} htmlFor="pref-seat">
          <Select
            id="pref-seat"
            value={form.seat}
            onChange={(e) => setForm((prev) => ({ ...prev, seat: e.target.value }))}
          >
            <option value="window">{t("account.seatWindow")}</option>
            <option value="aisle">{t("account.seatAisle")}</option>
            <option value="none">{t("account.seatNone")}</option>
          </Select>
        </Field>
        <Field label={t("account.prefMeal")} htmlFor="pref-meal">
          <Select
            id="pref-meal"
            value={form.meal}
            onChange={(e) => setForm((prev) => ({ ...prev, meal: e.target.value }))}
          >
            {mealOptions.map((meal) => (
              <option key={meal.id} value={meal.id}>
                {pick(lang, meal.name)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("account.prefCabin")} htmlFor="pref-cabin">
          <Select
            id="pref-cabin"
            value={form.cabin}
            onChange={(e) => setForm((prev) => ({ ...prev, cabin: e.target.value }))}
          >
            <option value="economy">{t("cabin.economy")}</option>
            <option value="premium">{t("cabin.premium")}</option>
            <option value="business">{t("cabin.business")}</option>
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
        <Notice>{t("auth.demoNote")}</Notice>
      </div>
    </Panel>
  );
}
