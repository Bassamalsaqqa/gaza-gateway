import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { btnClass, Field, Input, Notice, Panel } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/{-$locale}/account/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Gaza International Airport (GZA)" },
      { name: "description", content: "Your name, email and contact number for Palestinian Airlines bookings." },
      { property: "og:title", content: "Profile — Gaza International Airport" },
      { property: "og:description", content: "Manage your passenger profile details." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { t } = useI18n();
  const { account, updateAccount } = useStore();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    firstName: account?.firstName ?? "",
    lastName: account?.lastName ?? "",
    email: account?.email ?? "",
    phone: account?.phone ?? "",
  });

  return (
    <Panel>
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("account.profile")}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateAccount(form);
          setSaved(true);
        }}
        className="mt-4 grid gap-3 sm:grid-cols-2"
      >
        <Field label={t("book.firstName")} htmlFor="p-first">
          <Input
            id="p-first"
            value={form.firstName}
            onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
          />
        </Field>
        <Field label={t("book.lastName")} htmlFor="p-last">
          <Input
            id="p-last"
            value={form.lastName}
            onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
          />
        </Field>
        <Field label={t("book.email")} htmlFor="p-email">
          <Input
            id="p-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          />
        </Field>
        <Field label={t("book.phone")} htmlFor="p-phone">
          <Input
            id="p-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
          />
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
