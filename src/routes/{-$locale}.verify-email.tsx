import { Link, createFileRoute } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { btnClass, Container, Notice, Panel } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/{-$locale}/verify-email")({
  head: () => ({
    meta: [
      { title: "Verify your email — Gaza International Airport (GZA)" },
      {
        name: "description",
        content: "Confirm your email address to finish setting up your Gaza International Airport passenger account.",
      },
      { property: "og:title", content: "Verify your email — Gaza International Airport" },
      { property: "og:description", content: "Confirm your email address to finish setting up your account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { t } = useI18n();
  const { account } = useStore();
  const [verified, setVerified] = useState(false);
  const [resent, setResent] = useState(false);
  const email = account?.email ?? "your email";

  return (
    <Container className="flex justify-center py-14">
      <div className="w-full max-w-md">
        <MailCheck aria-hidden="true" className="size-8 text-clay" />
        <h1 className="mt-4 text-3xl font-bold">{t("auth.verifyTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("auth.verifySub", { email })}</p>

        <Panel className="mt-6 space-y-4">
          {verified ? (
            <>
              <p className="text-sm font-semibold">{t("auth.verifyDone")}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link to="/account" className={btnClass("primary", "md")}>
                  {t("auth.goToAccount")}
                </Link>
                <Link to="/book" className={btnClass("outline", "md")}>
                  {t("nav.book")}
                </Link>
              </div>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setVerified(true)} className={btnClass("primary", "md", "w-full")}>
                {t("auth.verifyNow")}
              </button>
              <button
                type="button"
                onClick={() => setResent(true)}
                className={btnClass("outline", "md", "w-full")}
              >
                {t("auth.verifyResend")}
              </button>
              {resent ? <p className="text-sm font-semibold text-brand-deep">{t("auth.verifyResent")}</p> : null}
            </>
          )}
          <Notice>{t("auth.recoveryNote")}</Notice>
        </Panel>

        <p className="mt-5 text-sm text-muted-foreground">
          <Link to="/signin" className="font-semibold text-brand-deep underline">
            {t("auth.backToSignIn")}
          </Link>
        </p>
      </div>
    </Container>
  );
}
