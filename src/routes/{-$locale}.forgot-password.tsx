import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { btnClass, Container, Field, Input, Notice, Panel } from "@/components/kit";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/{-$locale}/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — Gaza International Airport (GZA)" },
      {
        name: "description",
        content:
          "Request a password reset link for your Gaza International Airport passenger account and regain access to your trips.",
      },
      { property: "og:title", content: "Reset your password — Gaza International Airport" },
      { property: "og:description", content: "Request a password reset link for your passenger account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <Container className="flex justify-center py-14">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold">{t("auth.forgotTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("auth.forgotSub")}</p>

        {sent ? (
          <Panel className="mt-6 space-y-4">
            <p className="text-sm font-semibold">{t("auth.forgotSent", { email })}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <AppLink to="/reset-password" className={btnClass("primary", "md")}>
                {t("auth.openReset")}
              </AppLink>
              <AppLink to="/signin" className={btnClass("outline", "md")}>
                {t("auth.backToSignIn")}
              </AppLink>
            </div>
            <Notice>{t("auth.recoveryNote")}</Notice>
          </Panel>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
            }}
            className="surface mt-6 space-y-4 p-5 sm:p-6"
          >
            <Field label={t("book.email")} htmlFor="fp-email">
              <Input
                id="fp-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <button type="submit" className={btnClass("primary", "md", "w-full")}>
              {t("auth.forgotSubmit")}
            </button>
            <Notice>{t("auth.recoveryNote")}</Notice>
          </form>
        )}

        <p className="mt-5 text-sm text-muted-foreground">
          <AppLink to="/signin" className="font-semibold text-brand-deep underline">
            {t("auth.backToSignIn")}
          </AppLink>
        </p>
      </div>
    </Container>
  );
}
