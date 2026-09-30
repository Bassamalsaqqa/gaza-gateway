import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Link as LinkIcon, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { btnClass, Container, GazaLoadingState, Notice, Panel } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { bookingBelongsToAccount, normalizeEmailIdentity, usePassengerAccount } from "@/lib/passenger";
import { useBookingQuery, useClaimBookingMutation, type ClaimResult } from "@/lib/repositories";

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
  const { data: account, isLoading } = usePassengerAccount();
  const claimMutation = useClaimBookingMutation();
  const { ref } = Route.useSearch();
  const normalizedRef = (ref || "").trim().toUpperCase();
  const normalizedAccountEmail = account?.email ? normalizeEmailIdentity(account.email) : null;
  const { data: canonicalBooking } = useBookingQuery(normalizedRef || undefined);

  const [scopedClaim, setScopedClaim] = useState<{
    ref: string;
    accountEmail: string;
    status: ClaimResult["status"];
    error: string | null;
  } | null>(null);

  useEffect(() => {
    setScopedClaim(null);
  }, [normalizedRef, normalizedAccountEmail]);

  if (isLoading) {
    return (
      <Container className="py-16">
        <GazaLoadingState />
      </Container>
    );
  }

  // Truthful setup-required state when no canonical account exists on this device
  if (!account) {
    return (
      <Container className="flex justify-center py-14">
        <div className="w-full max-w-md">
          <ShieldAlert aria-hidden="true" className="size-8 text-clay" />
          <h1 className="mt-4 text-3xl font-bold">{t("auth.setupRequiredTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("auth.setupRequiredSub")}</p>

          <Panel className="mt-6 space-y-4">
            <Notice>{t("auth.setupRequiredNotice")}</Notice>

            {normalizedRef ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3.5">
                <div className="flex items-center gap-2">
                  <LinkIcon aria-hidden="true" className="size-4 text-clay" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("manage.bookingRef")}
                  </span>
                  <span className="code-id font-mono font-bold">{normalizedRef}</span>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <AppLink to="/register" {...(normalizedRef ? { search: { ref: normalizedRef } } : {})} className={btnClass("primary", "md")}>
                {t("nav.register")}
              </AppLink>
              <AppLink to="/signin" {...(normalizedRef ? { search: { ref: normalizedRef } } : {})} className={btnClass("outline", "md")}>
                {t("nav.signin")}
              </AppLink>
              {normalizedRef ? (
                <AppLink to="/manage/$ref" params={{ ref: normalizedRef }} className={btnClass("outline", "md")}>
                  {t("book.viewBooking")}
                </AppLink>
              ) : null}
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

  const activeClaim =
    scopedClaim &&
    normalizedRef &&
    scopedClaim.ref === normalizedRef &&
    scopedClaim.accountEmail === normalizedAccountEmail
      ? scopedClaim
      : null;

  const isCanonicalOwner = Boolean(
    account &&
    canonicalBooking &&
    bookingBelongsToAccount(canonicalBooking, account.email)
  );

  const isClaimedOrOwned =
    isCanonicalOwner ||
    activeClaim?.status === "claimed" ||
    activeClaim?.status === "already-owned-by-user";

  const handleClaim = async () => {
    if (!normalizedRef || !account?.email) return;
    try {
      const res = await claimMutation.mutateAsync({ ref: normalizedRef, accountEmail: account.email });
      let err: string | null = null;
      if (res.status === "contact-mismatch") {
        err = t("auth.claimContactMismatch");
      } else if (res.status === "owned-by-another") {
        err = t("auth.claimOwnedByAnother");
      } else if (res.status === "not-found") {
        err = t("auth.claimNotFound");
      }
      setScopedClaim({
        ref: normalizedRef,
        accountEmail: normalizedAccountEmail!,
        status: res.status,
        error: err,
      });
    } catch {
      setScopedClaim({
        ref: normalizedRef,
        accountEmail: normalizedAccountEmail!,
        status: "not-found",
        error: t("error.saveFailed"),
      });
    }
  };

  return (
    <Container className="flex justify-center py-14">
      <div className="w-full max-w-md">
        <CheckCircle2 aria-hidden="true" className="size-8 text-brand-deep" />
        <h1 className="mt-4 text-3xl font-bold">{t("auth.verifyTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("auth.verifySub", { email: account.email })}</p>

        <Panel className="mt-6 space-y-4">
          <p className="text-sm font-semibold">{t("auth.verifyDone")}</p>

          {normalizedRef ? (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3.5">
              <div className="flex items-center gap-2">
                <LinkIcon aria-hidden="true" className="size-4 text-brand-deep" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("manage.bookingRef")}
                </span>
                <span className="code-id font-mono font-bold">{normalizedRef}</span>
              </div>
              {activeClaim?.status === "claimed" ? (
                <p role="status" className="text-sm font-medium text-brand-deep">
                  {t("auth.claimSuccess", { ref: normalizedRef })}
                </p>
              ) : activeClaim?.status === "already-owned-by-user" || (!activeClaim && isCanonicalOwner) ? (
                <p role="status" className="text-sm font-medium text-brand-deep">
                  {t("auth.claimAlreadyOwned", { ref: normalizedRef })}
                </p>
              ) : (
                <div className="space-y-2">
                  {activeClaim?.error ? (
                    <p role="alert" className="text-sm font-medium text-destructive">
                      {activeClaim.error}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleClaim}
                    disabled={claimMutation.isPending}
                    className={btnClass("primary", "sm", "w-full")}
                  >
                    {claimMutation.isPending
                      ? t("common.loading")
                      : activeClaim?.error
                        ? t("auth.claimRetry")
                        : t("auth.claimEligible", { ref: normalizedRef })}
                  </button>
                </div>
              )}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            {normalizedRef && isClaimedOrOwned ? (
              <AppLink to="/account/trips/$ref" params={{ ref: normalizedRef }} className={btnClass("primary", "md")}>
                {t("auth.viewTrip")}
              </AppLink>
            ) : null}
            {normalizedRef && !isClaimedOrOwned ? (
              <AppLink to="/manage/$ref" params={{ ref: normalizedRef }} className={btnClass("outline", "md")}>
                {t("book.viewBooking")}
              </AppLink>
            ) : null}
            <AppLink to="/account" className={btnClass(normalizedRef && isClaimedOrOwned ? "outline" : "primary", "md")}>
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
