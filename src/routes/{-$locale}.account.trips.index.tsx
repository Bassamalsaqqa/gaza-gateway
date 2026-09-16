import { Link, createFileRoute } from "@tanstack/react-router";
import { StatusBadge } from "@/components/flight-status";
import { btnClass, Code, EmptyState, Panel, Pill } from "@/components/kit";
import { airportByCode } from "@/lib/data";
import { dateLong, money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/{-$locale}/account/trips/")({
  head: () => ({
    meta: [
      { title: "My trips — Gaza International Airport (GZA)" },
      { name: "description", content: "All your Palestinian Airlines bookings from Gaza, upcoming and past." },
      { property: "og:title", content: "My trips — Gaza International Airport" },
      { property: "og:description", content: "Upcoming and past bookings in one list." },
    ],
  }),
  component: TripsPage,
});

function TripsPage() {
  const { t, lang } = useI18n();
  const { bookings } = useStore();

  if (bookings.length === 0) {
    return (
      <EmptyState
        title={t("account.noTrips")}
        description={t("account.noTripsSub")}
        action={
          <Link to="/book" className={btnClass("primary", "md")}>
            {t("account.bookNow")}
          </Link>
        }
      />
    );
  }

  return (
    <ul className="space-y-4">
      {bookings.map((booking) => (
        <li key={booking.ref}>
          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold">
                  {pick(
                    lang,
                    airportByCode(booking.outbound.originCode)?.city ?? {
                      en: booking.outbound.originCode,
                      ar: booking.outbound.originCode,
                    },
                  )}{" "}
                  →{" "}
                  {pick(
                    lang,
                    airportByCode(booking.outbound.destinationCode)?.city ?? {
                      en: booking.outbound.destinationCode,
                      ar: booking.outbound.destinationCode,
                    },
                  )}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {dateLong(booking.outbound.date, lang)} · <Code>{booking.outbound.number}</Code> ·{" "}
                  <span className="code-id">{booking.ref}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {booking.status === "cancelled" ? (
                  <Pill tone="ink">{t("manage.cancelled")}</Pill>
                ) : (
                  <StatusBadge status={booking.outbound.status} />
                )}
                {booking.checkedIn ? <Pill tone="brand">{t("manage.checkedIn")}</Pill> : null}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                {t("book.total")}: <span className="font-semibold text-foreground">{money(booking.total, lang)}</span>
              </p>
              <Link to="/account/trips/$ref" params={{ ref: booking.ref }} className={btnClass("outline", "sm")}>
                {t("account.viewTrip")}
              </Link>
            </div>
          </Panel>
        </li>
      ))}
    </ul>
  );
}
