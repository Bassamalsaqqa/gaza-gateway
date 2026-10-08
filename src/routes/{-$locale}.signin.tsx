import { AppLink, useAppNavigate } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { btnClass, Field, Input } from "@/components/kit";
import { PassengerAuthShell } from "@/components/passenger-auth-shell";
import { pageHead } from "@/lib/head";
import { useI18n } from "@/lib/i18n";
import { useSignInMutation } from "@/lib/passenger";

export const Route = createFileRoute("/{-$locale}/signin")({
  head: ({ params }) => {
    const isAr = params.locale === "ar";
    return pageHead({
      title: isAr
        ? "تسجيل الدخول — مطار غزة الدولي (GZA)"
        : "Sign in — Gaza International Airport (GZA)",
      description: isAr
        ? "سجّل الدخول لعرض رحلاتك وبطاقات صعود الطائرة والمسافرين المحفوظين وتفضيلاتك."
        : "Sign in to view your Palestinian Airlines trips, boarding passes, saved travellers and preferences.",
      locale: params.locale,
      path: "/signin",
      noindex: true,
    });
  },
  component: SignInPage,
});

function SignInPage() {
  const { t } = useI18n();
  const navigate = useAppNavigate();
  const signInMutation = useSignInMutation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await signInMutation.mutateAsync({ email });
      void navigate({ to: "/account" });
    } catch {
      setError(t("error.saveFailed"));
    }
  };

  return (
    <PassengerAuthShell
      title={t("auth.signinTitle")}
      description={t("auth.signinSub")}
      mediaPanel="signin"
      footer={
        <>
          <p className="text-sm text-muted-foreground">
            {t("auth.noAccount")}{" "}
            <AppLink to="/register" className="font-semibold text-brand-deep underline">
              {t("auth.register")}
            </AppLink>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("auth.guest")}{" "}
            <AppLink to="/manage" className="font-semibold text-brand-deep underline">
              {t("manage.title")}
            </AppLink>
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} aria-describedby={error ? "signin-error" : undefined} className="space-y-4">
        <Field label={t("book.email")} htmlFor="email">
          <Input
            id="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setError(null);
              setEmail(e.target.value);
            }}
            required
          />
        </Field>
        <Field label={t("auth.password")} htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setError(null);
              setPassword(e.target.value);
            }}
            required
          />
        </Field>
        <p className="text-sm">
          <AppLink to="/forgot-password" className="font-semibold text-brand-deep underline">
            {t("auth.forgotLink")}
          </AppLink>
        </p>
        <button
          type="submit"
          disabled={signInMutation.isPending}
          className={btnClass("primary", "md", "w-full")}
        >
          {signInMutation.isPending ? t("common.loading") : t("auth.signin")}
        </button>
        {error ? (
          <p id="signin-error" role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </form>
    </PassengerAuthShell>
  );
}
