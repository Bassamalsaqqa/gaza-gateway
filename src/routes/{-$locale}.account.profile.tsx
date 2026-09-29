import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { btnClass, Field, Input, Notice, Panel } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { usePassengerAccount, useUpdateAccountMutation } from "@/lib/passenger";

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
  const { data: account } = usePassengerAccount();
  const updateMutation = useUpdateAccountMutation();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: account?.firstName ?? "",
    lastName: account?.lastName ?? "",
    email: account?.email ?? "",
    phone: account?.phone ?? "",
  });

  useEffect(() => {
    if (account) {
      setForm({
        firstName: account.firstName ?? "",
        lastName: account.lastName ?? "",
        email: account.email ?? "",
        phone: account.phone ?? "",
      });
    }
  }, [account]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await updateMutation.mutateAsync({
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
      });
      setSaved(true);
    } catch {
      setError(t("error.saveFailed"));
    }
  };

  return (
    <Panel>
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("account.profile")}</h2>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label={t("book.firstName")} htmlFor="p-first">
          <Input
            id="p-first"
            value={form.firstName}
            onChange={(e) => {
              setSaved(false);
              setForm((prev) => ({ ...prev, firstName: e.target.value }));
            }}
          />
        </Field>
        <Field label={t("book.lastName")} htmlFor="p-last">
          <Input
            id="p-last"
            value={form.lastName}
            onChange={(e) => {
              setSaved(false);
              setForm((prev) => ({ ...prev, lastName: e.target.value }));
            }}
          />
        </Field>
        <Field
          label={t("book.email")}
          htmlFor="p-email"
          hint={t("account.emailReadOnly") || "Account identity email is fixed for this profile."}
        >
          <Input
            id="p-email"
            type="email"
            dir="ltr"
            readOnly
            aria-readonly="true"
            className="cursor-not-allowed bg-muted/50 text-muted-foreground"
            value={form.email}
          />
        </Field>
        <Field label={t("book.phone")} htmlFor="p-phone">
          <Input
            id="p-phone"
            type="tel"
            dir="ltr"
            value={form.phone}
            onChange={(e) => {
              setSaved(false);
              setForm((prev) => ({ ...prev, phone: e.target.value }));
            }}
          />
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
        <Notice>{t("account.profileNote")}</Notice>
      </div>
    </Panel>
  );
}
