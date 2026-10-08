import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { btnClass, Notice, Panel } from "@/components/kit";
import { PassengerAuthShell } from "@/components/passenger-auth-shell";
import { pageHead } from "@/lib/head";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/{-$locale}/forgot-password")({
  head: ({ params }) => {
    const isAr = params.locale === "ar";
    return pageHead({
      title: isAr
        ? "المساعدة في كلمة المرور — مطار غزة الدولي (GZA)"
        : "Password assistance — Gaza International Airport (GZA)",
      description: isAr
        ? "إرشادات استعادة حساب المسافر المحلي للوصول إلى رحلات الخطوط الجوية الفلسطينية."
        : "Account guidance for local Palestinian Airlines passenger access.",
      locale: params.locale,
      path: "/forgot-password",
      noindex: true,
    });
  },
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
