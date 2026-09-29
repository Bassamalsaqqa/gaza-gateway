import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { btnClass, Notice, Panel } from "@/components/kit";
import { PassengerAuthShell } from "@/components/passenger-auth-shell";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/{-$locale}/forgot-password")({
  head: () => ({
    meta: [
      { title: "Password assistance — Gaza International Airport (GZA)" },
      {
        name: "description",
        content: "Account guidance for local Palestinian Airlines passenger access.",
      },
      { property: "og:title", content: "Password assistance — Gaza International Airport" },
      { property: "og:description", content: "Information on local passenger accounts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { t } = useI18n();

  return (
    <PassengerAuthShell
      title={t("auth.forgotTitle")}
      description={t("auth.forgotSub")}
      footer={
        <AppLink to="/signin" className="text-sm font-semibold text-brand-deep underline">
          {t("auth.backToSignIn")}
        </AppLink>
      }
    >
      <Panel className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("auth.forgotNotice")}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <AppLink to="/signin" className={btnClass("primary", "md")}>
            {t("auth.signin")}
          </AppLink>
          <AppLink to="/manage" className={btnClass("outline", "md")}>
            {t("manage.title")}
          </AppLink>
        </div>
        <Notice>{t("auth.demoNote")}</Notice>
      </Panel>
    </PassengerAuthShell>
  );
}
