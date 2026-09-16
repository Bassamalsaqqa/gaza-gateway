import { Link } from "@tanstack/react-router";
import { Luggage, Ticket, XCircle } from "lucide-react";
import { StatusBadge } from "@/components/flight-status";
import { btnClass, Code, Panel, Pill } from "@/components/kit";
import { EXTRA_BAG_PRICE, airportByCode, assistanceOptions, fares, mealOptions } from "@/lib/data";
import { dateLong, money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import type { Booking } from "@/lib/store";

export function BookingDetail({
  booking,
  onCheckin,
  onCancel,
}: {
  booking: Booking;
  onCheckin?: () => void;
  onCancel?: () => void;
}) {
  const { t, lang } = useI18n();
  const fare = fares.find((f) => f.id === booking.fareId);
  const meal = mealOptions.find((m) => m.id === booking.extras.meal);

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-muted-foreground">{t("book.reference")}</p>
            <p className="code-id text-3xl font-bold tracking-[0.16em]">{booking.ref}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {booking.status === "cancelled" ? (
              <Pill tone="ink">{t("manage.cancelled")}</Pill>
            ) : (
              <StatusBadge status={booking.outbound.status} />
            )}
            {booking.checkedIn ? <Pill tone="brand">{t("manage.checkedIn")}</Pill> : null}
            {fare ? <Pill>{pick(lang, fare.name)}</Pill> : null}
          </div>
        </div>
      </Panel>

      {[booking.outbound, booking.inbound].map((flight, index) =>
        flight ? (
          <Panel key={flight.id}>
            <p className="eyebrow text-clay">{t(index === 0 ? "book.outbound" : "book.inbound")}</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-lg font-bold">
                {pick(lang, airportByCode(flight.originCode)?.city ?? { en: flight.originCode, ar: flight.originCode })} →{" "}
                {pick(
                  lang,
                  airportByCode(flight.destinationCode)?.city ?? { en: flight.destinationCode, ar: flight.destinationCode },
                )}
              </p>
              <Link to="/flight/$flightId" params={{ flightId: flight.id }} className="text-sm underline">
                <Code className="text-sm text-muted-foreground">{flight.number}</Code>
              </Link>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {dateLong(flight.date, lang)} · <span className="code-id">{flight.departTime}</span>–
              <span className="code-id">{flight.arriveTime}</span> · {t("flights.gate")}{" "}
              <span className="code-id">{flight.gate}</span> · {t("flights.terminal")}{" "}
              <span className="code-id">{flight.terminal}</span> · {flight.aircraft}
            </p>
          </Panel>
        ) : null,
      )}

      <Panel>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("book.passengersLabel")}</h2>
        <ul className="mt-3 divide-y divide-border">
          {booking.passengers.map((p, i) => (
            <li key={`${p.firstName}-${p.lastName}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span className="font-medium">
                {p.firstName} {p.lastName}
              </span>
              <span className="text-muted-foreground">
                {t("book.seatsLabel")}:{" "}
                <span className="code-id">
                  {[booking.seats[`out-${i}`], booking.seats[`in-${i}`]].filter(Boolean).join(" / ") || "—"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("book.baggage")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="numeral">{(fare?.checkedBags ?? 0) === 0 ? "—" : `${fare?.checkedBags} × 23 kg`}</span>
          {booking.extras.extraBags > 0 ? (
            <>
              {" · "}
              <span className="numeral">
                +{booking.extras.extraBags} {t("book.extraBag")} ({money(booking.extras.extraBags * EXTRA_BAG_PRICE, lang)})
              </span>
            </>
          ) : null}
        </p>
        <dl className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          <Row label={t("book.meal")} value={meal ? pick(lang, meal.label) : "—"} />
          <Row
            label={t("book.assistance")}
            value={
              booking.extras.assistance.length === 0
                ? t("book.none")
                : booking.extras.assistance
                    .map((id) => pick(lang, assistanceOptions.find((a) => a.id === id)?.label ?? { en: id, ar: id }))
                    .join(", ")
            }
          />
          <Row label={t("book.email")} value={booking.contact.email || "—"} mono />
          <Row label={t("book.phone")} value={booking.contact.phone || "—"} mono />
        </dl>
        <p className="mt-3 flex items-baseline justify-between border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">{t("book.total")}</span>
          <span className="text-lg font-bold">{money(booking.total, lang)}</span>
        </p>
      </Panel>

      {booking.status === "confirmed" ? (
        <Panel>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("manage.actions")}</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {onCheckin && !booking.checkedIn ? (
              <button type="button" onClick={onCheckin} className={btnClass("primary", "sm")}>
                <Ticket aria-hidden="true" className="size-4" />
                {t("manage.checkin")}
              </button>
            ) : null}
            {booking.checkedIn ? (
              <Link
                to="/boarding-pass/$ref/$pax"
                params={{ ref: booking.ref, pax: "0" }}
                className={btnClass("outline", "sm")}
              >
                {t("book.boardingPass")}
              </Link>
            ) : null}
            <Link to="/book" className={btnClass("outline", "sm")}>
              <Luggage aria-hidden="true" className="size-4" />
              {t("manage.addBags")}
            </Link>
            {onCancel ? (
              <button type="button" onClick={onCancel} className={btnClass("ghost", "sm")}>
                <XCircle aria-hidden="true" className="size-4" />
                {t("manage.cancel")}
              </button>
            ) : null}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "code-id font-medium" : "font-medium"}>{value}</dd>
    </div>
  );
}
