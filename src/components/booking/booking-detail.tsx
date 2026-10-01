import { useState } from "react";
import { AppLink } from "@/components/app-link";
import { Armchair, Luggage, Mail, Ticket, XCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StatusBadge } from "@/components/flight-status";
import { btnClass, Code, Panel, Pill } from "@/components/kit";
import { EXTRA_BAG_PRICE, airportByCode, assistanceOptions, fares, mealOptions } from "@/lib/data";
import { dateLong, money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import {
  bookingLegs,
  checkedInPax,
  infantsWith,
  isPaxCheckedIn,
  legFullyCheckedIn,
  openLegs,
  openPaxForLeg,
  seatedPassengers,
  type Booking,
  type Leg,
} from "@/lib/domain/booking";
import { extrasFor, totalExtraBags } from "@/lib/booking-draft";
import { useBookingEffectiveFlights } from "@/lib/repositories/queries";

export function BookingDetail({
  booking,
  onCancel,
}: {
  booking: Booking;
  onCancel?: () => Promise<void> | void;
}) {
  const { t, lang } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const fare = fares.find((f) => f.id === booking.fareId);
  const legs = bookingLegs(booking);
  const remainingLegs = openLegs(booking);
  const active = booking.status === "confirmed";

  const effectiveFlights = useBookingEffectiveFlights(booking);

  const paxName = (i: number) => {
    const p = booking.passengers[i];
    return `${p?.firstName ?? ""} ${p?.lastName ?? ""}`.trim() || t("book.pax", { n: String(i + 1) });
  };

  // The CTA has to say which flight still needs check-in.
  const checkinLabel =
    remainingLegs.length === 1
      ? t(remainingLegs[0] === "out" ? "manage.checkinOut" : "manage.checkinIn")
      : t("manage.checkinBoth");

  const outboundEffective = effectiveFlights.outbound.effectiveFlight ?? booking.outbound;
  const isOutboundUnavailable = effectiveFlights.outbound.isUnavailable;

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
            ) : isOutboundUnavailable ? (
              <Pill tone="ink">{t("bp.operationalUnavailable")}</Pill>
            ) : (
              <StatusBadge status={outboundEffective.status} />
            )}
            {fare ? <Pill>{pick(lang, fare.name)}</Pill> : null}
          </div>
        </div>

        {active ? (
          <div className="mt-5 border-t border-border pt-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              {t("manage.statusTitle")}
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {legs.map((leg) => {
                const done = checkedInPax(booking, leg).length;
                const open = openPaxForLeg(booking, leg).length;
                return (
                  <li key={leg} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{t(leg === "out" ? "ci.legOut" : "ci.legIn")}</span>
                    <span className="flex flex-wrap items-center gap-2">
                      {done > 0 ? (
                        <Pill tone="brand">
                          {t("ci.paxDone")} <span className="numeral">{done}</span>
                        </Pill>
                      ) : null}
                      {open > 0 ? (
                        <Pill>
                          {open === 1 ? t("ci.paxRemainingOne") : t("ci.paxRemaining", { n: String(open) })}
                        </Pill>
                      ) : (
                        <Pill tone="brand">{t("ci.alreadyDone")}</Pill>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </Panel>

      {[booking.outbound, booking.inbound].map((flight, index) => {
        if (!flight) return null;
        const legState = index === 0 ? effectiveFlights.outbound : effectiveFlights.inbound;
        const effective = legState?.effectiveFlight;
        const isUnavailable = legState?.isUnavailable ?? false;
        const displayFlight = effective ?? flight;

        return (
          <Panel key={flight.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="eyebrow text-clay">{t(index === 0 ? "book.outbound" : "book.inbound")}</p>
              {isUnavailable ? (
                <Pill tone="ink">{t("bp.operationalUnavailable")}</Pill>
              ) : effective ? (
                <StatusBadge status={effective.status} />
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-lg font-bold">
                {pick(lang, airportByCode(flight.originCode)?.city ?? { en: flight.originCode, ar: flight.originCode })} →{" "}
                {pick(
                  lang,
                  airportByCode(flight.destinationCode)?.city ?? { en: flight.destinationCode, ar: flight.destinationCode },
                )}
              </p>
              <AppLink to="/flight/$flightId" params={{ flightId: flight.id }} className="text-sm underline">
                <Code className="text-sm text-muted-foreground">{displayFlight.number}</Code>
              </AppLink>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {dateLong(flight.date, lang)} ·{" "}
              <span>
                {t("flights.scheduled")}: <span className="code-id">{flight.departTime}</span>
              </span>
              {effective?.revisedDepart ? (
                <span>
                  {" · "}
                  {t("bp.revised")}:{" "}
                  <span className="code-id font-semibold text-clay">{effective.revisedDepart}</span>
                </span>
              ) : null}
              {" – "}
              <span className="code-id">{displayFlight.arriveTime}</span> · {t("flights.gate")}{" "}
              <span className="code-id">{displayFlight.gate}</span> · {t("flights.terminal")}{" "}
              <span className="code-id">{displayFlight.terminal}</span> · {displayFlight.aircraft}
            </p>
            {effective?.note ? (
              <p className="mt-2 text-xs text-muted-foreground">{effective.note}</p>
            ) : null}
          </Panel>
        );
      })}

      <Panel>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("book.passengersLabel")}</h2>
        <ul className="mt-3 divide-y divide-border">
          {booking.passengers.map((p, i) => {
            const adult = p.type === "infant" ? booking.passengers[p.withAdult ?? 0] : undefined;
            const extras = extrasFor(booking.extras, i);
            const meal = mealOptions.find((m) => m.id === extras.meal);
            return (
              <li key={`${p.firstName}-${p.lastName}-${i}`} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">
                    {paxName(i)}
                    {p.type !== "adult" ? (
                      <span className="ms-2 align-middle">
                        <Pill>{t(p.type === "child" ? "book.child" : "book.infant")}</Pill>
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground">
                    {p.type === "infant" ? (
                      t("book.onLapWith", { name: `${adult?.firstName ?? ""} ${adult?.lastName ?? ""}`.trim() })
                    ) : (
                      <>
                        {t("book.seatsLabel")}:{" "}
                        <span className="code-id">
                          {[booking.seats[`out-${i}`], booking.seats[`in-${i}`]].filter(Boolean).join(" / ") || "—"}
                        </span>
                      </>
                    )}
                  </span>
                </div>

                {p.type !== "infant" ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {legs.map((leg) =>
                      isPaxCheckedIn(booking, leg, i) ? (
                        <Pill key={leg} tone="brand">
                          {t(leg === "out" ? "ci.checkedOut" : "ci.checkedIn")}
                        </Pill>
                      ) : null,
                    )}
                    {meal ? <span>{pick(lang, meal.label)}</span> : null}
                    {extras.extraBags > 0 ? (
                      <span className="numeral">
                        +{extras.extraBags} {t("book.extraBag")}
                      </span>
                    ) : null}
                    {extras.assistance.length > 0 ? (
                      <span>
                        {extras.assistance
                          .map((id: string) => pick(lang, assistanceOptions.find((a) => a.id === id)?.label ?? { en: id, ar: id }))
                          .join(", ")}
                      </span>
                    ) : null}
                    {infantsWith(booking, i).length > 0 ? (
                      <span>
                        {t("book.infantOf")} {infantsWith(booking, i).map((x) => paxName(x)).join(", ")}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {active && p.type !== "infant" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {legs.map((leg) =>
                      isPaxCheckedIn(booking, leg, i) ? (
                        <AppLink
                          key={leg}
                          to="/boarding-pass/$ref/$leg/$pax"
                          params={{ ref: booking.ref, leg, pax: String(i) }}
                          className={btnClass("outline", "sm")}
                        >
                          <Ticket aria-hidden="true" className="size-4" />
                          {t(leg === "out" ? "bp.viewOut" : "bp.viewIn")}
                        </AppLink>
                      ) : null,
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("book.baggage")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="numeral">
            {(fare?.checkedBags ?? 0) === 0 ? "—" : `${fare?.checkedBags} × 23 kg`}
          </span>
          {totalExtraBags(booking.extras) > 0 ? (
            <>
              {" · "}
              <span className="numeral">
                +{totalExtraBags(booking.extras)} {t("book.extraBag")} (
                {money(totalExtraBags(booking.extras) * EXTRA_BAG_PRICE, lang)})
              </span>
            </>
          ) : null}
        </p>
        <dl className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          <Row label={t("book.email")} value={booking.contact.email || "—"} mono />
          <Row label={t("book.phone")} value={booking.contact.phone || "—"} mono />
        </dl>
        <p className="mt-3 flex items-baseline justify-between border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">{t("book.total")}</span>
          <span className="text-lg font-bold">{money(booking.total, lang)}</span>
        </p>
      </Panel>

      {active ? (
        <Panel>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("manage.actions")}</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {remainingLegs.length > 0 ? (
              <AppLink to="/manage/$ref/check-in" params={{ ref: booking.ref }} className={btnClass("primary", "sm")}>
                <Ticket aria-hidden="true" className="size-4" />
                {checkinLabel}
              </AppLink>
            ) : null}
            <AppLink to="/manage/$ref/seats" params={{ ref: booking.ref }} className={btnClass("outline", "sm")}>
              <Armchair aria-hidden="true" className="size-4" />
              {t("manage.changeSeats")}
            </AppLink>
            <AppLink to="/manage/$ref/extras" params={{ ref: booking.ref }} className={btnClass("outline", "sm")}>
              <Luggage aria-hidden="true" className="size-4" />
              {t("manage.editExtras")}
            </AppLink>
            <AppLink to="/manage/$ref/contact" params={{ ref: booking.ref }} className={btnClass("outline", "sm")}>
              <Mail aria-hidden="true" className="size-4" />
              {t("manage.editContact")}
            </AppLink>
            {onCancel ? (
              <button type="button" onClick={() => setConfirmOpen(true)} className={btnClass("ghost", "sm")}>
                <XCircle aria-hidden="true" className="size-4" />
                {t("manage.cancel")}
              </button>
            ) : null}
          </div>
          {legs.every((leg) => legFullyCheckedIn(booking, leg)) && seatedPassengers(booking).length > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">{t("ci.allDone")}</p>
          ) : null}
        </Panel>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title={t("manage.cancelConfirmTitle")}
        body={t("manage.cancelConfirmBody", { ref: booking.ref })}
        confirmLabel={t("manage.cancelConfirmYes")}
        onConfirm={async () => {
          try {
            setCancelError(null);
            await onCancel?.();
            setConfirmOpen(false);
          } catch {
            setConfirmOpen(false);
            setCancelError(t("error.saveFailed"));
          }
        }}
        onClose={() => {
          setConfirmOpen(false);
          setCancelError(null);
        }}
      />
      {cancelError ? (
        <p role="alert" className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {cancelError}
        </p>
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
