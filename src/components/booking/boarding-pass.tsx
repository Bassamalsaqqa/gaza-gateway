import { Plane } from "lucide-react";
import ticketWorldMapImg from "@/assets/media/decorative/cards/ticket-world-map.webp";
import { StatusBadge } from "@/components/flight-status";
import { Code, Pill } from "@/components/kit";
import { airportByCode, fares } from "@/lib/data";
import { dateShort } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { checkedInPax, isPaxCheckedIn, type Booking, type Leg } from "@/lib/domain/booking";
import { buildBoardingPassViewModel, type BoardingPassViewModel } from "@/lib/domain/boarding-pass";
import type { Flight } from "@/lib/data";

export type PassLeg = Leg;

export type BoardingPassItem = BoardingPassViewModel;

/**
 * A pass exists for one booking, one passenger and one leg — and only when that
 * passenger has actually checked in for that leg.
 */
export function passesForBooking(
  booking: Booking,
  effectiveFlights?: { out?: Flight | null | undefined; in?: Flight | null | undefined } | undefined,
): BoardingPassItem[] {
  if (booking.status !== "confirmed") return [];
  const legs: Leg[] = booking.inbound ? ["out", "in"] : ["out"];
  return legs.flatMap((leg) =>
    checkedInPax(booking, leg).map((paxIndex) => {
      const eff = leg === "in" ? effectiveFlights?.in : effectiveFlights?.out;
      return buildBoardingPassViewModel(booking, leg, paxIndex, eff);
    }),
  );
}

/** One specific pass, or null when that passenger/leg is not checked in. */
export function passFor(
  booking: Booking,
  leg: Leg,
  paxIndex: number,
  effectiveFlight?: Flight | null,
): BoardingPassItem | null {
  const passenger = booking.passengers[paxIndex];
  if (!passenger || passenger.type === "infant") return null;
  if (!isPaxCheckedIn(booking, leg, paxIndex)) return null;
  if (leg === "in" && !booking.inbound) return null;
  return buildBoardingPassViewModel(booking, leg, paxIndex, effectiveFlight);
}

export function BoardingPassCard({ item, compact = false }: { item: BoardingPassItem; compact?: boolean }) {
  const { t, lang } = useI18n();
  const {
    ref,
    leg,
    paxIndex,
    passengerName,
    infantNames,
    flight,
    seat,
    sequence,
    totalCheckedIn,
    scheduledDepartureTime,
    revisedDepartureTime,
    boardingOpensTime,
    boardingTime,
    fareId,
    operationalStatus,
  } = item;
  const from = airportByCode(flight.originCode);
  const to = airportByCode(flight.destinationCode);
  const fare = fares.find((f) => f.id === fareId);

  const isNonActive = operationalStatus !== "active";

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-soft)] print:shadow-none ${
        isNonActive ? "border-muted-foreground/30 opacity-90" : "border-border"
      }`}
    >
      <div
        data-decorative-asset="boarding-pass-ticket-band"
        className={`relative flex flex-wrap items-center justify-between gap-3 overflow-hidden px-5 py-3 text-ink-foreground ${
          isNonActive ? "bg-muted-foreground/70" : "bg-clay"
        }`}
      >
        <img
          src={ticketWorldMapImg}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full select-none object-cover object-center"
        />

        <span className="relative z-10 flex items-center gap-2 text-sm font-semibold">
          <Plane aria-hidden="true" className="size-4 rtl:-scale-x-100" />
          {t("brand.airline")}
        </span>
        <span className="relative z-10 flex items-center gap-3 text-xs text-ink-foreground">
          {t(leg === "out" ? "bp.legOut" : "bp.legIn")}
          <Code className="text-sm font-semibold text-ink-foreground">{flight.number}</Code>
        </span>
      </div>

      <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:p-6">
        <div>
          {operationalStatus === "cancelled" ? (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive"
            >
              {t("bp.notValidCancelled")}
            </div>
          ) : operationalStatus === "departed" ? (
            <div
              role="status"
              className="mb-4 rounded-xl border border-border bg-muted/60 p-3 text-sm font-medium text-muted-foreground"
            >
              {t("bp.flightDeparted")}
            </div>
          ) : operationalStatus === "landed" ? (
            <div
              role="status"
              className="mb-4 rounded-xl border border-border bg-muted/60 p-3 text-sm font-medium text-muted-foreground"
            >
              {t("bp.flightLanded")}
            </div>
          ) : operationalStatus === "unavailable" ? (
            <div
              role="status"
              className="mb-4 rounded-xl border border-border bg-muted/60 p-3 text-sm font-medium text-muted-foreground"
            >
              {t("bp.operationalUnavailable")}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {operationalStatus === "unavailable" ? (
              <Pill tone="ink">{t("bp.operationalUnavailable")}</Pill>
            ) : (
              <StatusBadge status={flight.status} />
            )}
            <Pill tone="brand">{t("ci.paxDone")}</Pill>
            {fare ? <Pill>{pick(lang, fare.name)}</Pill> : null}
          </div>

          <p className="eyebrow mt-4 text-muted-foreground">{t("bp.passenger")}</p>
          <p className="mt-1 text-xl font-bold uppercase sm:text-2xl">{passengerName}</p>
          {infantNames.length > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("bp.infantOnPass", {
                name: infantNames.join(", "),
              })}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
            <Big label={t("flights.origin")} code={flight.originCode} city={from ? pick(lang, from.city) : ""} />
            <Plane aria-hidden="true" className="mb-2 size-4 text-muted-foreground rtl:-scale-x-100" />
            <Big label={t("flights.destination")} code={flight.destinationCode} city={to ? pick(lang, to.city) : ""} />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Cell label={t("flights.date")} value={dateShort(flight.date, lang)} />
            <Cell label={t("flights.scheduled")} value={scheduledDepartureTime} mono />
            {revisedDepartureTime ? (
              <Cell label={t("bp.revised")} value={revisedDepartureTime} mono />
            ) : null}
            <Cell label={t("bp.boardingOpens")} value={boardingOpensTime || boardingTime} mono />
            <Cell label={t("book.seatsLabel")} value={seat ?? "—"} mono />
            <Cell label={t("flights.terminal")} value={flight.terminal} mono />
            <Cell label={t("flights.gate")} value={flight.gate} mono />
            <Cell label={t("book.reference")} value={ref} mono />
            <Cell label={t("bp.sequence")} value={`${sequence}/${totalCheckedIn}`} mono />
          </div>

          {!compact ? (
            <>
              <p className="mt-5 text-xs text-muted-foreground">{flight.aircraft}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("bp.boardingNote")}</p>
            </>
          ) : null}
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-dashed border-border pt-5 sm:border-s sm:border-t-0 sm:ps-6 sm:pt-0">
          <div
            aria-hidden="true"
            className="h-28 w-full rounded-lg bg-[repeating-linear-gradient(90deg,var(--color-foreground)_0_3px,transparent_3px_7px)] sm:h-40 sm:w-16 sm:bg-[repeating-linear-gradient(0deg,var(--color-foreground)_0_3px,transparent_3px_7px)]"
          />
          <Code className="text-[0.65rem] text-muted-foreground">
            {ref}·{flight.number}·{seat ?? "—"}
          </Code>
          <p className="max-w-[120px] text-center text-[0.65rem] text-muted-foreground">{t("bp.notReal")}</p>
        </div>
      </div>
    </article>
  );
}

function Big({ label, code, city }: { label: string; code: string; city: string }) {
  return (
    <div>
      <p className="eyebrow text-muted-foreground">{label}</p>
      <p className="code-id text-3xl font-bold sm:text-4xl">{code}</p>
      <p className="text-xs text-muted-foreground">{city}</p>
    </div>
  );
}

function Cell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="eyebrow text-muted-foreground">{label}</p>
      <p className={mono ? "code-id mt-1 text-base font-bold" : "mt-1 text-base font-bold"}>{value}</p>
    </div>
  );
}
