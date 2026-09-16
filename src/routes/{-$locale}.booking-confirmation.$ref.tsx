import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Ticket, UserPlus } from "lucide-react";
import { EXTRA_BAG_PRICE, airportByCode, fares, mealOptions } from "@/lib/data";
import { btnClass, Code, Container, EmptyState, Notice, Panel } from "@/components/kit";
import { dateLong, money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { anyCheckedIn, useStore } from "@/lib/store";

export const Route = createFileRoute("/{-$locale}/booking-confirmation/$ref")({
  head: ({ params }) => ({
    meta: [
      { title: `Booking ${params.ref} confirmed — Gaza International Airport (GZA)` },
      {
        name: "description",
        content: "Your Palestinian Airlines booking is confirmed. Keep your booking reference to manage the trip later.",
      },
      { property: "og:title", content: "Booking confirmed — Palestinian Airlines" },
      { property: "og:description", content: "Itinerary, passengers, seats and next steps for your booking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConfirmationPage,
});

function ConfirmationPage() {
  const { ref } = Route.useParams();
  const { t, lang } = useI18n();
  const { findBooking, account, claimBooking, ready } = useStore();
  const booking = findBooking(ref);

  if (!ready) {
    return (
      <Container className="py-16">
        <p className="text-sm text-muted-foreground">…</p>
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

  const fare = fares.find((f) => f.id === booking.fareId);
  const meal = mealOptions.find((m) => m.id === booking.extras.meal);

  return (
    <Container className="py-10 sm:py-14">
      <div className="mx-auto max-w-3xl space-y-5">
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
            {[booking.outbound, booking.inbound].map((flight, index) =>
              flight ? (
                <li key={flight.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t(index === 0 ? "book.outbound" : "book.inbound")}
                  </p>
                  <p className="mt-1 font-semibold">
                    {pick(lang, airportByCode(flight.originCode)?.city ?? { en: flight.originCode, ar: flight.originCode })}{" "}
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
                    <span className="code-id">{flight.departTime}</span>–
                    <span className="code-id">{flight.arriveTime}</span> · {t("flights.terminal")}{" "}
                    <span className="code-id">{flight.terminal}</span>
                  </p>
                </li>
              ) : null,
            )}
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
                <dd className="font-medium">{fare ? pick(lang, fare.name) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("book.extraBag")}</dt>
                <dd className="numeral font-medium">
                  {booking.extras.extraBags > 0
                    ? `${booking.extras.extraBags} · ${money(booking.extras.extraBags * EXTRA_BAG_PRICE, lang)}`
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("book.meal")}</dt>
                <dd className="font-medium">{meal ? pick(lang, meal.label) : "—"}</dd>
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
            {anyCheckedIn(booking) ? (
              <AppLink
                to="/boarding-pass/$ref/$pax"
                params={{ ref: booking.ref, pax: "0" }}
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
              <AppLink to="/register" className={btnClass("clay", "md")}>
                <UserPlus aria-hidden="true" className="size-4" />
                {t("book.createAccount")}
              </AppLink>
            ) : booking.ownerEmail === account.email ? (
              <AppLink to="/account/trips" className={btnClass("outline", "md")}>
                {t("account.trips")}
              </AppLink>
            ) : (
              <button type="button" onClick={() => claimBooking(booking.ref)} className={btnClass("clay", "md")}>
                {t("conf.linkAccount")}
              </button>
            )}
          </div>
          <div className="mt-4">
            <Notice>{t("conf.guestNote")}</Notice>
          </div>
        </Panel>
      </div>
    </Container>
  );
}
