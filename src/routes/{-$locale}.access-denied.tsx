import { AppLink } from "@/components/app-link";
import { pageHead } from "@/lib/head";
import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { btnClass, Container, Panel } from "@/components/kit";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/{-$locale}/access-denied")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/access-denied",
      en: {
        title: "Area not available — Gaza International Airport (GZA)",
        description: "This part of the Gaza International Airport passenger account isn't available. Return to your account overview or contact the airport team.",
      },
      ar: {
        title: "هذا القسم غير متاح — مطار غزة الدولي (GZA)",
        description: "هذا الجزء من حساب المسافر غير متاح حالياً.",
      },
      noindex: true,
    }),
  component: AccessDeniedPage,
});

function AccessDeniedPage() {
  const { t } = useI18n();
  return (
    <Container className="py-14">
      <Panel className="mx-auto max-w-xl">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-clay-soft text-accent-foreground">
          <Lock aria-hidden="true" className="size-5" />
        </span>
        <h1 className="mt-5 text-2xl font-bold sm:text-3xl">{t("denied.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("denied.sub")}</p>
        <p className="mt-4 text-sm">{t("denied.body")}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <AppLink to="/account" className={btnClass("primary", "md")}>
            {t("denied.account")}
          </AppLink>
          <AppLink to="/" className={btnClass("outline", "md")}>
            {t("denied.home")}
          </AppLink>
          <AppLink to="/contact" className={btnClass("ghost", "md")}>
            {t("denied.contact")}
          </AppLink>
        </div>
      </Panel>
    </Container>
  );
}
