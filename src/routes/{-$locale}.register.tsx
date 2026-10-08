import { AppLink, useAppNavigate } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { btnClass, Field, Input } from "@/components/kit";
import { PassengerAuthShell } from "@/components/passenger-auth-shell";
import { pageHead } from "@/lib/head";
import { useI18n } from "@/lib/i18n";
import { useSignInMutation } from "@/lib/passenger";

export const Route = createFileRoute("/{-$locale}/register")({
  head: ({ params }) => {
    const isAr = params.locale === "ar";
    return pageHead({
      title: isAr
        ? "إنشاء حساب مسافر — مطار غزة الدولي (GZA)"
        : "Create an account — Gaza International Airport (GZA)",
      description: isAr
        ? "أنشئ حساب مسافر لحفظ رحلات الخطوط الجوية الفلسطينية والمسافرين وتفضيلات السفر في مكان واحد."
        : "Create a passenger account to keep your Palestinian Airlines trips, travellers and travel preferences together.",
      locale: params.locale,
      path: "/register",
      noindex: true,
    });
  },
  validateSearch: (search: Record<string, unknown>) => ({
    ref: typeof search["ref"] === "string" ? (search["ref"] as string) : undefined,
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const { t } = useI18n();
  const navigate = useAppNavigate();
  const signInMutation = useSignInMutation();
  const { ref } = Route.useSearch();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await signInMutation.mutateAsync({
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
      });
      void navigate({ to: "/verify-email", search: ref ? { ref } : {} });
    } catch {
      setError(t("error.saveFailed"));
    }
  };

  return (
    <PassengerAuthShell
      title={t("auth.registerTitle")}
      description={t("auth.registerSub")}
      footer={
        <p className="text-sm text-muted-foreground">
          {t("auth.haveAccount")}{" "}
          <AppLink to="/signin" className="font-semibold text-brand-deep underline">
            {t("auth.signin")}
          </AppLink>
        </p>
      }
    >
      {ref ? (
        <p className="mt-3 text-sm font-semibold text-brand-deep">
          {t("auth.saveBookingNote", { ref })}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} aria-describedby={error ? "register-error" : undefined} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("book.firstName")} htmlFor="r-first">
            <Input
              id="r-first"
              autoComplete="given-name"
              value={form.firstName}
              onChange={(e) => {
                setError(null);
                setForm((prev) => ({ ...prev, firstName: e.target.value }));
              }}
              required
            />
          </Field>
          <Field label={t("book.lastName")} htmlFor="r-last">
            <Input
              id="r-last"
              autoComplete="family-name"
              value={form.lastName}
              onChange={(e) => {
                setError(null);
                setForm((prev) => ({ ...prev, lastName: e.target.value }));
              }}
              required
            />
          </Field>
        </div>
        <Field label={t("book.email")} htmlFor="r-email">
          <Input
            id="r-email"
            type="email"
            dir="ltr"
            autoComplete="email"
            value={form.email}
            onChange={(e) => {
              setError(null);
              setForm((prev) => ({ ...prev, email: e.target.value }));
            }}
            required
          />
        </Field>
        <Field label={t("auth.password")} htmlFor="r-password">
          <Input
            id="r-password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => {
              setError(null);
              setForm((prev) => ({ ...prev, password: e.target.value }));
            }}
            required
          />
        </Field>
        <button
          type="submit"
          disabled={signInMutation.isPending}
          className={btnClass("primary", "md", "w-full")}
        >
          {signInMutation.isPending ? t("common.loading") : t("auth.register")}
        </button>
        {error ? (
          <p id="register-error" role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </form>
    </PassengerAuthShell>
  );
}
