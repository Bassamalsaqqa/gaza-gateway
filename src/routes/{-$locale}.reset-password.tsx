import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { btnClass, Notice, Panel } from "@/components/kit";
import { PassengerAuthShell } from "@/components/passenger-auth-shell";
import { pageHead } from "@/lib/head";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/{-$locale}/reset-password")({
  head: ({ params }) => {
    const isAr = params.locale === "ar";
    return pageHead({
      title: isAr
        ? "إدارة كلمة المرور — مطار غزة الدولي (GZA)"
        : "Password management — Gaza International Airport (GZA)",
      description: isAr
        ? "معلومات عن بيانات اعتماد المسافر المحلي لرحلات الخطوط الجوية الفلسطينية."
        : "Information on local passenger credentials for Palestinian Airlines journeys.",
      locale: params.locale,
      path: "/reset-password",
      noindex: true,
    });
  },
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useI18n();

  return (
    <PassengerAuthShell
      title={t("auth.resetTitle")}
      description={t("auth.resetSub")}
      footer={
        <AppLink to="/signin" className="text-sm font-semibold text-brand-deep underline">
          {t("auth.backToSignIn")}
        </AppLink>
      }
    >
      <Panel className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("auth.resetNotice")}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <AppLink to="/signin" className={btnClass("primary", "md")}>
            {t("auth.signin")}
          </AppLink>
          <AppLink to="/" className={btnClass("outline", "md")}>
            {t("denied.home")}
          </AppLink>
        </div>
        <Notice>{t("auth.demoNote")}</Notice>
      </Panel>
    </PassengerAuthShell>
  );
}
