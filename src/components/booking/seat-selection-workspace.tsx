import { Check, Sparkles, User } from "lucide-react";
import { Eyebrow } from "@/components/kit";
import { BookingLegSwitcher } from "@/components/booking/booking-leg-switcher";
import { SeatMap } from "@/components/booking/seat-map";
import {
  EXTRA_LEGROOM_ROWS,
  seatFee,
  suggestSeat,
  type Flight,
} from "@/lib/data";
import { money } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Draft } from "@/lib/store";
import { cn } from "@/lib/utils";

export interface SeatSelectionWorkspaceProps {
  draft: Draft;
  activePassenger: number;
  onActivePassengerChange: (index: number) => void;
  seatLeg: "out" | "in";
  onSeatLegChange: (leg: "out" | "in") => void;
  onSelectSeat: (position: number, seat: string) => void;
  seatable: number[];
  passengerLabels: string[];
  seatAssignments: (leg: "out" | "in") => Record<number, string>;
  totals: { fare: number; taxes: number; extras: number; total: number };
  seatPreference?: string;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
  stepNav: React.ReactNode;
}

export function SeatSelectionWorkspace({
  draft,
  activePassenger,
  onActivePassengerChange,
  seatLeg,
  onSeatLegChange,
  onSelectSeat,
  seatable,
  passengerLabels,
  seatAssignments,
  totals,
  seatPreference = "none",
  headingRef,
  stepNav,
}: SeatSelectionWorkspaceProps) {
  const { t, lang } = useI18n();
  const isOneWay = !draft.inbound;

  const currentFlight =
    (seatLeg === "out" ? draft.outbound : draft.inbound) ?? draft.outbound;
  const currentFlightId = currentFlight?.id ?? "unknown";

  const outboundAssignments = seatAssignments("out");
  const inboundAssignments = seatAssignments("in");

  const outboundAssignedCount = Object.keys(outboundAssignments).length;
  const inboundAssignedCount = Object.keys(inboundAssignments).length;

  const currentAssignments = seatLeg === "out" ? outboundAssignments : inboundAssignments;
  const activeSeat = currentAssignments[activePassenger];

  const activeRow = activeSeat ? Number.parseInt(activeSeat.replace(/\D/g, ""), 10) : 0;
  const isActiveExtra = activeRow > 0 && EXTRA_LEGROOM_ROWS.includes(activeRow);
  const activeFee = activeRow > 0 ? seatFee(activeRow) : 0;

  // Calculate total seat fees across all passengers and legs
  const totalSeatFees = Object.values(draft.seats).reduce((sum, seat) => {
    const row = Number.parseInt(seat.replace(/\D/g, ""), 10);
    return sum + (row ? seatFee(row) : 0);
  }, 0);

  return (
    <section
      aria-labelledby="seats-title"
      data-surface-target="booking.seat-console"
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <Eyebrow>{t("step.seats")}</Eyebrow>
        <h1
          id="seats-title"
          ref={headingRef}
          tabIndex={-1}
          className="mt-2 text-2xl font-bold sm:text-3xl outline-none text-foreground"
        >
          {t("book.seatTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("book.seatSub")}</p>
      </div>

      {/* Two-region responsive workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)] lg:gap-8 items-start">
        {/* Region 1: Selection & Budget Console (Sticky on desktop) */}
        <div data-testid="seat-selection-console" className="space-y-5 lg:sticky lg:top-24">
          {/* Leg Route Switcher */}
          <BookingLegSwitcher
            activeLeg={seatLeg}
            onChangeLeg={onSeatLegChange}
            outboundFlight={draft.outbound}
            inboundFlight={draft.inbound}
            outboundAssignedCount={outboundAssignedCount}
            inboundAssignedCount={inboundAssignedCount}
            totalPassengers={seatable.length}
          />

          {/* Passenger Assignment Selector Console */}
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t("book.seatAssign")}
              </span>
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                {`${Object.keys(currentAssignments).length}/${seatable.length}`}
              </span>
            </div>

            <div className="space-y-2" role="group" aria-label={t("book.seatAssign")}>
              {seatable.map((paxIndex, position) => {
                const isCurrent = activePassenger === position;
                const assigned = currentAssignments[position];
                const row = assigned ? Number.parseInt(assigned.replace(/\D/g, ""), 10) : 0;
                const isExtra = row > 0 && EXTRA_LEGROOM_ROWS.includes(row);
                const fee = row > 0 ? seatFee(row) : 0;
                const label = passengerLabels[position] || `${t("book.passenger")} ${position + 1}`;

                return (
                  <button
                    key={paxIndex}
                    type="button"
                    onClick={() => onActivePassengerChange(position)}
                    aria-pressed={isCurrent}
                    className={cn(
                      "relative w-full flex items-center justify-between rounded-lg border p-3 text-start transition-all cursor-pointer select-none",
                      "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                      "border-border bg-card hover:bg-secondary/40",
                      isCurrent && "border-primary shadow-xs ring-1 ring-primary/30",
                    )}
                  >
                    {isCurrent ? (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 rounded-lg bg-brand-soft/25"
                      />
                    ) : null}
                    <div className="relative flex items-center gap-2.5 min-w-0">
                      <div
                        className={cn(
                          "flex size-7 items-center justify-center rounded-full shrink-0 text-xs font-bold transition-colors",
                          isCurrent
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground",
                        )}
                        aria-hidden="true"
                      >
                        <User className="size-3.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {label}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {assigned ? (
                            isExtra ? (
                              <span className="text-clay font-medium">{`${t("book.seatExtra")} (+${money(fee, lang)})`}</span>
                            ) : (
                              <span>{t("book.standardSeatIncluded")}</span>
                            )
                          ) : (
                            <span className="italic">{t("book.noSeatAssigned")}</span>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 text-end ms-2">
                      {assigned ? (
                        <span className="code-id rounded-md bg-secondary px-2.5 py-1 text-xs font-bold text-foreground">
                          {assigned}
                        </span>
                      ) : (
                        <span className="rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">
                          {t("book.select")}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Seat Details & Pricing Callout */}
            <div className="rounded-lg bg-sand p-3.5 border border-border/60 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">
                  {t("book.activeSelection", {
                    name: passengerLabels[activePassenger] || `${t("book.passenger")} ${activePassenger + 1}`,
                  })}
                </span>
                {activeSeat ? (
                  <span className="code-id font-bold text-foreground">{activeSeat}</span>
                ) : (
                  <span className="text-muted-foreground italic">—</span>
                )}
              </div>

              {activeSeat ? (
                <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
                  <span className="text-muted-foreground">
                    {isActiveExtra ? t("book.seatExtra") : t("book.standardSeat")}
                  </span>
                  <span className="font-semibold text-foreground">
                    {activeFee > 0 ? `+${money(activeFee, lang)}` : t("book.included")}
                  </span>
                </div>
              ) : null}

              {/* Seat fees subtotal */}
              <div className="flex items-center justify-between text-xs pt-1.5 border-t border-border/50 text-muted-foreground">
                <span>{t("book.seatFees")}</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {totalSeatFees > 0 ? money(totalSeatFees, lang) : money(0, lang)}
                </span>
              </div>

              {/* Full Live Booking Total */}
              <div className="pt-2 border-t border-border/80">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wider text-foreground">
                      {t("book.total")}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {t("book.fareTotal")}: {money(totals.fare + totals.taxes, lang)}
                      {totals.extras > 0 ? ` · ${t("book.extrasTotal")}: ${money(totals.extras, lang)}` : ""}
                    </span>
                  </div>
                  <span
                    className="font-mono text-xl font-bold text-brand-deep tabular-nums"
                    data-testid="seat-console-live-total"
                  >
                    {money(totals.total, lang)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation on desktop inside console */}
          <div className="hidden lg:block">{stepNav}</div>
        </div>

        {/* Region 2: Interactive Aircraft Seat Map with linked tabpanel semantics for round-trip or region for one-way */}
        <div
          id={isOneWay ? "seat-map-section" : "seat-map-panel"}
          role={isOneWay ? "region" : "tabpanel"}
          aria-label={isOneWay ? t("book.seatTitle") : undefined}
          aria-labelledby={isOneWay ? undefined : `seat-leg-tab-${seatLeg}`}
          tabIndex={0}
          className="w-full min-w-0 outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-xl"
        >
          <SeatMap
            flightId={currentFlightId}
            assignments={currentAssignments}
            activePassenger={activePassenger}
            onActivePassengerChange={onActivePassengerChange}
            onSelect={onSelectSeat}
            passengerLabels={passengerLabels}
            cabin={draft.criteria.cabin}
            suggestedSeat={suggestSeat(
              currentFlightId,
              draft.criteria.cabin,
              seatPreference,
              Object.values(draft.seats),
            )}
          />

          {/* Navigation on mobile beneath seat map */}
          <div className="block lg:hidden mt-6">{stepNav}</div>
        </div>
      </div>
    </section>
  );
}
