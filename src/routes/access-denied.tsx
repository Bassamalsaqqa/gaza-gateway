import { Link, createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { btnClass, Container, Panel } from "@/components/kit";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/access-denied")({
  head: () => ({
    meta: [
      { title: "Area not available — Gaza International Airport (GZA)" },
      {
        name: "description",
        content:
          "This part of the Gaza International Airport passenger account isn't available. Return to your account overview or contact the airport team.",
      },
      { property: "og:title", content: "Area not available — Gaza International Airport" },
      { property: "og:description", content: "This part of your passenger account isn't available." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
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
          <Link to="/account" className={btnClass("primary", "md")}>
            {t("denied.account")}
          </Link>
          <Link to="/" className={btnClass("outline", "md")}>
            {t("denied.home")}
          </Link>
          <Link to="/contact" className={btnClass("ghost", "md")}>
            {t("denied.contact")}
          </Link>
        </div>
      </Panel>
    </Container>
  );
}
