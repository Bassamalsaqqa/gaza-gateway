import { resolveBookingPricing } from "@/lib/commercial/pricing";
import { useCommercialOptions } from "@/lib/commercial/queries";
import { CommercialCatalogState } from "@/components/commercial-catalog-state";
import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Ticket, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { airportByCode } from "@/lib/data";
import { Code, Container, EmptyState, GazaLoadingState, Notice, Panel, Pill, btnClass } from "@/components/kit";
import { StatusBadge } from "@/components/flight-status";
import { dateLong, money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { extrasFor, totalExtraBags } from "@/lib/booking-draft";
import {
  useBookingEffectiveFlights,
  useBookingQuery,
  useClaimBookingMutation,
  type ClaimResult,
} from "@/lib/repositories";
import { bookingBelongsToAccount, normalizeEmailIdentity, usePassengerAccount } from "@/lib/passenger";
import { passesForBooking } from "@/components/booking/boarding-pass";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/{-$locale}/booking-confirmation/$ref")({
  head: ({ params }) => {
    const isAr = params.locale === "ar";
    return pageHead({
      title: isAr
        ? "تأكيد الحجز — مطار غزة الدولي (GZA)"
        : "Booking Confirmed — Gaza International Airport (GZA)",
      description: isAr
        ? "تم تأكيد حجز الخطوط الجوية الفلسطينية. احتفظ برقم الحجز لإدارة الرحلة لاحقاً."
        : "Your Palestinian Airlines booking is confirmed. Keep your booking reference to manage the trip later.",
      locale: params.locale,
      path: "/booking-confirmation",
      noindex: true,
    });
  },
  component: ConfirmationPage,
});

function ConfirmationPage() {
  const { ref } = Route.useParams();
  const normalizedRef = (ref || "").trim().toUpperCase();
  const { t, lang } = useI18n();
  const commercial = useCommercialOptions();
  const { fares, mealOptions } = commercial;
  const { data: account } = usePassengerAccount();
  const normalizedAccountEmail = account?.email ? normalizeEmailIdentity(account.email) : null;
  const claimMutation = useClaimBookingMutation();
  const [scopedClaim, setScopedClaim] = useState<{
    ref: string;
    accountEmail: string;
    status: ClaimResult["status"];
    error: string | null;
  } | null>(null);

  useEffect(() => {
    setScopedClaim(null);
  }, [normalizedRef, normalizedAccountEmail]);

  const { data: booking, isPending, isError } = useBookingQuery(normalizedRef);
  const effectiveFlights = useBookingEffectiveFlights(booking);
  const passes = booking
    ? passesForBooking(booking, {
        out: effectiveFlights.outbound.effectiveFlight,
        in: effectiveFlights.inbound?.effectiveFlight ?? null,
      })
    : [];
  const firstPass = passes[0];

  const activeClaim =
    scopedClaim &&
    scopedClaim.ref === normalizedRef &&
    scopedClaim.accountEmail === normalizedAccountEmail
      ? scopedClaim
      : null;

  const isConfirmedOwner = Boolean(
    account &&
    booking &&
    bookingBelongsToAccount(booking, account.email)
  );

  const isClaimedOrOwned =
    isConfirmedOwner ||
    activeClaim?.status === "claimed" ||
    activeClaim?.status === "already-owned-by-user";

  if (isPending) {
    return (
      <Container className="py-16">
        <GazaLoadingState />
      </Container>
    );
  }

  if (isError) {
    return (
      <Container className="py-14">
        <EmptyState title={t("conf.loadFailed")} description={t("conf.loadFailedSub")} />
      </Container>
    );
  }

  if (!booking) {
    return (
      <Container className="py-14">
        <EmptyState
          title={t("conf.notFound")}
          description={t("conf.notFoundSub")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <AppLink to="/manage" className={btnClass("primary", "md")}>
                {t("manage.title")}
              </AppLink>
              <AppLink to="/book" className={btnClass("outline", "md")}>
                {t("nav.book")}
              </AppLink>
            </div>
          }
        />
      </Container>
    );
  }

  const basis = resolveBookingPricing(booking);
  const fare = fares.find((f) => f.id === booking.fareId);
  const extraBags = totalExtraBags(booking.extras);

  return (
    <Container className="py-10 sm:py-14">
      <div className="mx-auto max-w-3xl space-y-5">
        <CommercialCatalogState />
        <div className="rounded-xl border border-primary/30 bg-brand-soft/60 p-6">
          <span className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground">
            <Check aria-hidden="true" className="size-5" />
          </span>
          <h1 className="mt-4 text-2xl font-bold sm:text-3xl">{t("book.confirmed")}</h1>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">{t("book.confirmedSub")}</p>
          <div className="mt-5 inline-flex flex-col rounded-lg border border-border bg-card px-5 py-3">
            <span className="eyebrow text-muted-foreground">{t("book.reference")}</span>
            <span className="code-id mt-1 text-3xl font-bold tracking-[0.18em]">{booking.ref}</span>
          </div>
          {booking.contact.email ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {t("conf.contactEmail")} <span className="code-id font-semibold">{booking.contact.email}</span>
            </p>
          ) : null}
        </div>

        <Panel>
          <p className="eyebrow text-clay">{t("conf.itinerary")}</p>
          <ul className="mt-3 divide-y divide-border">
            {[booking.outbound, booking.inbound].map((flight, index) => {
              if (!flight) return null;
              const legState = index === 0 ? effectiveFlights.outbound : effectiveFlights.inbound;
              const eff = legState?.effectiveFlight;
              const isLegLoading = legState?.isLoading ?? false;
              const isLegUnavailable = (legState?.isUnavailable || legState?.isError) ?? false;

              return (
                <li key={flight.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t(index === 0 ? "book.outbound" : "book.inbound")}
                    </p>
                    {isLegLoading ? (
                      <Pill tone="neutral">{t("common.loading")}</Pill>
                    ) : isLegUnavailable ? (
                      <Pill tone="ink">{t("bp.operationalUnavailable")}</Pill>
                    ) : eff ? (
                      <StatusBadge status={eff.status} />
                    ) : null}
                  </div>
                  <p className="mt-1 font-semibold">
                    {pick(
                      lang,
                      airportByCode(flight.originCode)?.city ?? { en: flight.originCode, ar: flight.originCode },
                    )}{" "}
                    →{" "}
                    {pick(
                      lang,
                      airportByCode(flight.destinationCode)?.city ?? {
                        en: flight.destinationCode,
                        ar: flight.destinationCode,
                      },
                    )}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <Code>{flight.number}</Code> · {dateLong(flight.date, lang)} ·{" "}
                    <span className="code-id">{flight.departTime}</span>
                    {eff?.revisedDepart ? (
                      <>
                        {" · "}
                        {t("bp.revised")}:{" "}
                        <span className="code-id font-semibold text-clay">{eff.revisedDepart}</span>
                      </>
                    ) : null}
                    {" – "}
                    <span className="code-id">{eff?.arriveTime ?? flight.arriveTime}</span> · {t("flights.terminal")}{" "}
                    <span className="code-id">{eff?.terminal ?? "—"}</span> · {t("flights.gate")}{" "}
                    <span className="code-id">{eff?.gate ?? "—"}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="grid gap-4 sm:grid-cols-2">
          <Panel>
            <p className="eyebrow text-clay">{t("book.passengersLabel")}</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {booking.passengers.map((p, i) => (
                <li key={`${p.lastName}-${i}`} className="flex justify-between gap-3">
                  <span>
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="code-id text-muted-foreground">
                    {[booking.seats[`out-${i}`], booking.seats[`in-${i}`]].filter(Boolean).join(" / ") || "—"}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <p className="eyebrow text-clay">{t("book.total")}</p>
            <dl className="mt-2 space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("book.fareTotal")}</dt>
                <dd className="font-medium">{fare ? pick(lang, fare.name) : <span dir="ltr">{booking.fareId}</span>}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("book.included")}</dt><dd dir="ltr">{basis.checkedBags} × {basis.checkedBagKg} kg</dd></div><div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("book.extraBag")}</dt>
                <dd className="numeral font-medium">
                  {extraBags > 0 ? `${extraBags} · ${money(extraBags * basis.extraBagPrice, lang)}` : "—"}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">{t("book.meal")}</dt>
                <dd className="space-y-0.5">
                  {booking.passengers.map((p, i) => {
                    const paxExtras = extrasFor(booking.extras, i);
                    const paxMeal = mealOptions.find((m) => m.id === paxExtras.meal);
                    return (
                      <span key={`conf-meal-${i}`} className="flex justify-between gap-3 font-medium">
                        <span className="text-muted-foreground">
                          {`${p.firstName} ${p.lastName}`.trim() || `${t("book.passenger")} ${i + 1}`}
                        </span>
                        <span>{paxMeal ? pick(lang, paxMeal.label) : paxExtras.meal}</span>
                      </span>
                    );
                  })}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-border pt-2">
                <dt className="font-semibold">{t("book.total")}</dt>
                <dd className="text-lg font-bold">{money(booking.total, lang)}</dd>
              </div>
            </dl>
          </Panel>
        </div>

        <Panel>
          <p className="eyebrow text-clay">{t("conf.next")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <AppLink to="/manage/$ref" params={{ ref: booking.ref }} className={btnClass("primary", "md")}>
              {t("book.viewBooking")}
            </AppLink>
            {firstPass ? (
              <AppLink
                to="/boarding-pass/$ref/$leg/$pax"
                params={{ ref: booking.ref, leg: firstPass.leg, pax: String(firstPass.paxIndex) }}
                className={btnClass("outline", "md")}
              >
                {t("book.boardingPass")}
              </AppLink>
            ) : booking.status === "confirmed" ? (
              <AppLink to="/manage/$ref/check-in" params={{ ref: booking.ref }} className={btnClass("outline", "md")}>
                <Ticket aria-hidden="true" className="size-4" />
                {t("manage.checkin")}
              </AppLink>
            ) : null}
            {!account ? (
              <AppLink to="/register" search={{ ref: booking.ref }} className={btnClass("clay", "md")}>
                <UserPlus aria-hidden="true" className="size-4" />
                {t("book.createAccount")}
              </AppLink>
            ) : isClaimedOrOwned ? (
              <AppLink to="/account/trips" className={btnClass("outline", "md")}>
                {t("account.trips")}
              </AppLink>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  if (!account?.email) return;
                  const res = await claimMutation.mutateAsync({
                    ref: booking.ref,
                    accountEmail: account.email,
                  });
                  setScopedClaim({
                    ref: normalizedRef,
                    accountEmail: normalizedAccountEmail!,
                    status: res.status,
                    error:
                      res.status === "contact-mismatch"
                        ? t("auth.claimContactMismatch")
                        : res.status === "owned-by-another"
                          ? t("auth.claimOwnedByAnother")
                          : res.status === "not-found"
                            ? t("auth.claimNotFound")
                            : null,
                  });
                }}
                disabled={claimMutation.isPending}
                className={btnClass("outline", "md")}
              >
                <UserPlus aria-hidden="true" className="size-4" />
                {claimMutation.isPending ? t("common.saving") : t("auth.claimEligible", { ref: booking.ref })}
              </button>
            )}
          </div>
          {activeClaim?.error ? (
            <p role="alert" className="mt-3 text-sm font-semibold text-destructive">
              {activeClaim.error}
            </p>
          ) : activeClaim?.status === "claimed" ? (
            <p role="status" className="mt-3 text-sm font-semibold text-brand-deep">
              {t("auth.claimSuccess", { ref: booking.ref })}
            </p>
          ) : activeClaim?.status === "already-owned-by-user" ? (
            <p role="status" className="mt-3 text-sm font-semibold text-brand-deep">
              {t("auth.claimAlreadyOwned", { ref: booking.ref })}
            </p>
          ) : null}
        </Panel>

        <Notice>{t("conf.manageNotice")}</Notice>
      </div>
    </Container>
  );
}
