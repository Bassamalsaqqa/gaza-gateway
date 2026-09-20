import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { btnClass, Field, Input, Notice, Panel } from "@/components/kit";
import { PassengerAuthShell } from "@/components/passenger-auth-shell";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/{-$locale}/reset-password")({
  head: () => ({
    meta: [
      { title: "Choose a new password — Gaza International Airport (GZA)" },
      {
        name: "description",
        content: "Set a new password for your Gaza International Airport passenger account.",
      },
      { property: "og:title", content: "Choose a new password — Gaza International Airport" },
      { property: "og:description", content: "Set a new password for your passenger account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <PassengerAuthShell
      title={t("auth.resetTitle")}
      description={t("auth.resetSub")}
      footer={<AppLink to="/signin" className="text-sm font-semibold text-brand-deep underline">{t("auth.backToSignIn")}</AppLink>}
    >
        {done ? (
          <Panel className="mt-6 space-y-4">
            <p className="text-sm font-semibold">{t("auth.resetDone")}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <AppLink to="/signin" className={btnClass("primary", "md")}>
                {t("auth.signin")}
              </AppLink>
              <AppLink to="/" className={btnClass("outline", "md")}>
                {t("denied.home")}
              </AppLink>
            </div>
            <Notice>{t("auth.recoveryNote")}</Notice>
          </Panel>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (password.length < 8) {
                setError(t("auth.tooShort"));
                return;
              }
              if (password !== confirm) {
                setError(t("auth.mismatch"));
                return;
              }
              setError(null);
              setDone(true);
            }}
            className="space-y-4"
          >
            <Field label={t("auth.newPassword")} htmlFor="rp-password">
              <Input
                id="rp-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <Field label={t("auth.confirmPassword")} htmlFor="rp-confirm">
              <Input
                id="rp-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </Field>
            {error ? (
              <p role="alert" className="text-sm font-semibold text-accent-foreground">
                {error}
              </p>
            ) : null}
            <button type="submit" className={btnClass("primary", "md", "w-full")}>
              {t("auth.resetSubmit")}
            </button>
            <Notice>{t("auth.recoveryNote")}</Notice>
          </form>
        )}
    </PassengerAuthShell>
  );
}
