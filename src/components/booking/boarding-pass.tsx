import { Plane } from "lucide-react";
import { StatusBadge } from "@/components/flight-status";
import { Code, Pill } from "@/components/kit";
import { airportByCode, fares, type Flight } from "@/lib/data";
import { dateShort } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { isCheckedIn, type Booking } from "@/lib/store";

export type PassLeg = "out" | "in";

export type BoardingPassItem = {
  booking: Booking;
  paxIndex: number;
  leg: PassLeg;
  flight: Flight;
  seat: string | undefined;
};

/**
 * A pass exists for each passenger on each leg that has actually been
 * checked in. An outbound check-in never produces a return pass.
 */
export function passesForBooking(booking: Booking): BoardingPassItem[] {
  if (booking.status !== "confirmed") return [];
  const legs: { leg: PassLeg; flight: Flight }[] = [];
  if (isCheckedIn(booking, "out")) legs.push({ leg: "out", flight: booking.outbound });
  if (booking.inbound && isCheckedIn(booking, "in")) legs.push({ leg: "in", flight: booking.inbound });
  return booking.passengers.flatMap((_, paxIndex) =>
    legs.map(({ leg, flight }) => ({
      booking,
      paxIndex,
      leg,
      flight,
      seat: booking.seats[`${leg}-${paxIndex}`],
    })),
  );
}

/** Boarding opens 45 minutes before the scheduled departure in the local mock schedule. */
export function boardingTime(departTime: string): string {
  const [h, m] = departTime.split(":").map((part) => Number(part));
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return departTime;
  const total = (h * 60 + m - 45 + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function BoardingPassCard({ item, compact = false }: { item: BoardingPassItem; compact?: boolean }) {
  const { t, lang } = useI18n();
  const { booking, paxIndex, leg, flight, seat } = item;
  const passenger = booking.passengers[paxIndex];
  const from = airportByCode(flight.originCode);
  const to = airportByCode(flight.destinationCode);
  const fare = fares.find((f) => f.id === booking.fareId);

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] print:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-ink px-5 py-3 text-ink-foreground">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Plane aria-hidden="true" className="size-4 rtl:-scale-x-100" />
          {t("brand.airline")}
        </span>
        <span className="flex items-center gap-3 text-xs text-ink-muted">
          {t(leg === "out" ? "bp.legOut" : "bp.legIn")}
          <Code className="text-sm font-semibold text-ink-foreground">{flight.number}</Code>
        </span>
      </div>

      <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={flight.status} />
            {isCheckedIn(booking, leg) ? <Pill tone="brand">{t(leg === "out" ? "ci.checkedOut" : "ci.checkedIn")}</Pill> : null}
            {fare ? <Pill>{pick(lang, fare.name)}</Pill> : null}
          </div>

          <p className="eyebrow mt-4 text-muted-foreground">{t("bp.passenger")}</p>
          <p className="mt-1 text-xl font-bold uppercase sm:text-2xl">
            {passenger ? `${passenger.lastName} / ${passenger.firstName}` : "—"}
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
            <Big label={t("flights.origin")} code={flight.originCode} city={from ? pick(lang, from.city) : ""} />
            <Plane aria-hidden="true" className="mb-2 size-4 text-muted-foreground rtl:-scale-x-100" />
            <Big label={t("flights.destination")} code={flight.destinationCode} city={to ? pick(lang, to.city) : ""} />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Cell label={t("flights.date")} value={dateShort(flight.date, lang)} />
            <Cell label={t("flights.scheduled")} value={flight.departTime} mono />
            <Cell label={t("bp.boardingTime")} value={boardingTime(flight.departTime)} mono />
            <Cell label={t("book.seatsLabel")} value={seat ?? "—"} mono />
            <Cell label={t("flights.terminal")} value={flight.terminal} mono />
            <Cell label={t("flights.gate")} value={flight.gate} mono />
            <Cell label={t("book.reference")} value={booking.ref} mono />
            <Cell label={t("bp.sequence")} value={`${paxIndex + 1}/${booking.passengers.length}`} mono />
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
            {booking.ref}·{flight.number}·{seat ?? "—"}
          </Code>
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
