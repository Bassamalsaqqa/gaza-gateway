import { AppLink, useAppNavigate } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { btnClass, Field, Input } from "@/components/kit";
import { PassengerAuthShell } from "@/components/passenger-auth-shell";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/{-$locale}/signin")({
  head: () => ({
    meta: [
      { title: "Sign in — Gaza International Airport (GZA)" },
      {
        name: "description",
        content: "Sign in to view your Palestinian Airlines trips, boarding passes, saved travellers and preferences.",
      },
      { property: "og:title", content: "Sign in — Gaza International Airport" },
      { property: "og:description", content: "Access your trips and boarding passes." },
    ],
  }),
  component: SignInPage,
});

function SignInPage() {
  const { t } = useI18n();
  const navigate = useAppNavigate();
  const { signIn } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <PassengerAuthShell
      title={t("auth.signinTitle")}
      description={t("auth.signinSub")}
      footer={<>
        <p className="text-sm text-muted-foreground">{t("auth.noAccount")} <AppLink to="/register" className="font-semibold text-brand-deep underline">{t("auth.register")}</AppLink></p>
        <p className="mt-2 text-sm text-muted-foreground">{t("auth.guest")} <AppLink to="/manage" className="font-semibold text-brand-deep underline">{t("manage.title")}</AppLink></p>
      </>}
    >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            signIn(email);
            void navigate({ to: "/account" });
          }}
          className="space-y-4"
        >
          <Field label={t("book.email")} htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label={t("auth.password")} htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <p className="text-sm">
            <AppLink to="/forgot-password" className="font-semibold text-brand-deep underline">
              {t("auth.forgotLink")}
            </AppLink>
          </p>
          <button type="submit" className={btnClass("primary", "md", "w-full")}>
            {t("auth.signin")}
          </button>
        </form>

    </PassengerAuthShell>
  );
}
