import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Link as LinkIcon } from "lucide-react";
import { useState } from "react";
import { btnClass, Container, Notice, Panel } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { usePassengerAccount } from "@/lib/passenger";
import { useClaimBookingMutation } from "@/lib/passenger";

export const Route = createFileRoute("/{-$locale}/verify-email")({
  head: () => ({
    meta: [
      { title: "Account setup — Gaza International Airport (GZA)" },
      {
        name: "description",
        content: "Complete local account setup on this device and link eligible bookings.",
      },
      { property: "og:title", content: "Account setup — Gaza International Airport" },
      { property: "og:description", content: "Complete local passenger account setup." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    ref: typeof search["ref"] === "string" ? (search["ref"] as string) : undefined,
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { t } = useI18n();
  const { data: account } = usePassengerAccount();
  const claimMutation = useClaimBookingMutation();
  const { ref } = Route.useSearch();
  const [claimStatusText, setClaimStatusText] = useState<string | null>(null);

  const email = account?.email ?? "your email";

  const handleClaim = async () => {
    if (!ref || !account?.email) return;
    try {
      const res = await claimMutation.mutateAsync({ ref, accountEmail: account.email });
      if (res.status === "claimed") {
        setClaimStatusText(t("auth.claimSuccess", { ref }));
      } else if (res.status === "already-owned-by-user") {
        setClaimStatusText(t("auth.claimAlreadyOwned", { ref }));
      } else {
        setClaimStatusText(t("auth.claimFailed", { ref }));
      }
    } catch {
      setClaimStatusText(t("auth.claimFailed", { ref }));
    }
  };

  return (
    <Container className="flex justify-center py-14">
      <div className="w-full max-w-md">
        <CheckCircle2 aria-hidden="true" className="size-8 text-brand-deep" />
        <h1 className="mt-4 text-3xl font-bold">{t("auth.verifyTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("auth.verifySub", { email })}</p>

        <Panel className="mt-6 space-y-4">
          <p className="text-sm font-semibold">{t("auth.verifyDone")}</p>

          {ref ? (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3.5">
              <div className="flex items-center gap-2">
                <LinkIcon aria-hidden="true" className="size-4 text-brand-deep" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("manage.bookingRef")}
                </span>
                <span className="code-id font-mono font-bold">{ref}</span>
              </div>
              {claimStatusText ? (
                <p role="status" className="text-sm font-medium text-brand-deep">
                  {claimStatusText}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleClaim}
                  disabled={claimMutation.isPending}
                  className={btnClass("primary", "sm", "w-full")}
                >
                  {claimMutation.isPending ? t("common.loading") : t("auth.claimEligible", { ref })}
                </button>
              )}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            {ref ? (
              <AppLink to="/account/trips/$ref" params={{ ref }} className={btnClass("primary", "md")}>
                {t("auth.viewTrip")}
              </AppLink>
            ) : null}
            <AppLink to="/account" className={btnClass(ref ? "outline" : "primary", "md")}>
              {t("auth.goToAccount")}
            </AppLink>
            <AppLink to="/book" className={btnClass("outline", "md")}>
              {t("nav.book")}
            </AppLink>
          </div>

          <Notice>{t("auth.demoNote")}</Notice>
        </Panel>

        <p className="mt-5 text-sm text-muted-foreground">
          <AppLink to="/signin" className="font-semibold text-brand-deep underline">
            {t("auth.backToSignIn")}
          </AppLink>
        </p>
      </div>
    </Container>
  );
}
