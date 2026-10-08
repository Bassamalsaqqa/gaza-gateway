import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSeatAvailable } from "@/lib/data";
import {
  FROZEN_LEGACY_SEAT_LAYOUT,
  type LegSeatLayoutSnapshot,
} from "@/lib/domain/booking";
import {
  parseSeatCode,
  seatExists,
  seatPosition,
  type LayoutGeometry,
} from "@/lib/fleet/layout";
import { money } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type SeatMapProps = {
  flightId?: string | undefined;
  /** seat code per passenger index, e.g. { 0: "12A" } */
  assignments?: Record<number, string> | undefined;
  activePassenger?: number | undefined;
  onSelect?: ((passengerIndex: number, seat: string) => void) | undefined;
  passengerLabels?: string[] | undefined;
  onActivePassengerChange?: ((index: number) => void) | undefined;
  /** Booked cabin — only that zone of the aircraft is selectable. If omitted in read-only mode, shows entire plane. */
  cabin?: string | undefined;
  /** Optional seat suggested from a saved seat preference. */
  suggestedSeat?: string | undefined;
  className?: string | undefined;
  /** Dynamic layout geometry or sealed leg snapshot. Falls back to frozen legacy layout if omitted. */
  layout?: LayoutGeometry | LegSeatLayoutSnapshot | undefined;
  /** Advisory canonical cross-PNR occupied seats. */
  occupiedSeats?: Set<string> | undefined;
  /** Extra legroom seat fee. Defaults to 18. */
  extraLegroomPrice?: number | undefined;
  /** Whether the seat map is in read-only preview mode. */
  readOnly?: boolean | undefined;
};

function parseRow(seat: string): number {
  const parsed = parseSeatCode(seat);
  return parsed?.row ?? (Number.parseInt(seat.replace(/\D/g, ""), 10) || 1);
}

function parseLetter(seat: string): string {
  const parsed = parseSeatCode(seat);
  if (parsed) return parsed.letter;
  const match = seat.match(/[A-Za-z]/);
  return match ? match[0].toUpperCase() : "A";
}

function isSeatInZone(seat: string, firstRow: number, lastRow: number): boolean {
  const row = parseRow(seat);
  return row >= firstRow && row <= lastRow;
}

function seatPositionLabel(
  layout: LayoutGeometry,
  letter: string,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const pos = seatPosition(layout, letter);
  if (pos === "window") {
    return t("book.seatWindow");
  }
  if (pos === "aisle") {
    return t("book.seatAisle");
  }
  return t("book.seatMiddle");
}

/**
 * Top-down aircraft seat silhouette icon
 */
export function AircraftSeatIcon({
  className,
  isSelected,
}: {
  className?: string;
  isSelected?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn("size-3.5 shrink-0 pointer-events-none", className)}
    >
      {/* Top Headrest */}
      <rect x="7" y="2" width="10" height="3" rx="1.5" opacity={isSelected ? "1" : "0.75"} />
      {/* Seat Cushion / Backrest */}
      <rect x="6" y="6" width="12" height="12" rx="2.5" opacity={isSelected ? "1" : "0.55"} />
      {/* Left armrest */}
      <rect x="3" y="7" width="2" height="9" rx="1" opacity={isSelected ? "1" : "0.85"} />
      {/* Right armrest */}
      <rect x="19" y="7" width="2" height="9" rx="1" opacity={isSelected ? "1" : "0.85"} />
    </svg>
  );
}

const EMPTY_ASSIGNMENTS: Record<number, string> = {};
const EMPTY_PASSENGER_LABELS: string[] = [];

export function SeatMap({
  flightId = "",
  assignments = EMPTY_ASSIGNMENTS,
  activePassenger = 0,
  onSelect,
  passengerLabels = EMPTY_PASSENGER_LABELS,
  onActivePassengerChange,
  cabin,
  suggestedSeat,
  className,
  layout,
  occupiedSeats,
  extraLegroomPrice = 18,
  readOnly = false,
}: SeatMapProps) {
  const { t, lang } = useI18n();
  const effectiveLayout = useMemo(
    () => layout ?? FROZEN_LEGACY_SEAT_LAYOUT,
    [layout],
  );

  const isReadOnly = readOnly || !onSelect;
  const isAllCabins = isReadOnly || cabin === "all" || !cabin;

  const taken = useMemo(() => new Set(Object.values(assignments)), [assignments]);

  const zone = useMemo(() => {
    if (isAllCabins) {
      return {
        id: "all" as const,
        firstRow: 1,
        lastRow: effectiveLayout.rows,
      };
    }
    return (
      effectiveLayout.zones.find((z) => z.id === cabin) ??
      effectiveLayout.zones[0] ?? {
        id: "economy" as const,
        firstRow: 1,
        lastRow: effectiveLayout.rows,
      }
    );
  }, [effectiveLayout.zones, effectiveLayout.rows, cabin, isAllCabins]);

  const rows = useMemo(
    () =>
      Array.from(
        { length: Math.max(0, zone.lastRow - zone.firstRow + 1) },
        (_, i) => zone.firstRow + i,
      ),
    [zone.firstRow, zone.lastRow],
  );

  const seatButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [liveMessage, setLiveMessage] = useState<string>("");

  const isSeatAvailableInMap = useCallback(
    (code: string, row: number, letter: string): boolean => {
      // 1. Nonexistent geometry
      if (!seatExists(effectiveLayout, code)) return false;
      // 2. Structural blocked seats
      if (effectiveLayout.unavailable.includes(code)) return false;
      if (isReadOnly) return true;
      // 3. Deterministic flight prototype pseudo-occupancy
      if (flightId && !isSeatAvailable(flightId, row, letter)) return false;
      // 4. Advisory canonical cross-PNR occupied seats
      if (occupiedSeats && occupiedSeats.has(code)) return false;
      return true;
    },
    [effectiveLayout, flightId, occupiedSeats, isReadOnly],
  );

  // Determine an initial sensible focused seat within current cabin zone
  const firstAvailableSeat = useMemo(() => {
    for (const r of rows) {
      for (const l of effectiveLayout.letters) {
        const code = `${r}${l}`;
        if (isSeatAvailableInMap(code, r, l)) return code;
      }
    }
    return `${rows[0] ?? 1}${effectiveLayout.letters[0] ?? "A"}`;
  }, [effectiveLayout.letters, isSeatAvailableInMap, rows]);

  const assignedCurrent = assignments[activePassenger];
  const preferredSeat =
    assignedCurrent && isSeatInZone(assignedCurrent, zone.firstRow, zone.lastRow)
      ? assignedCurrent
      : suggestedSeat && isSeatInZone(suggestedSeat, zone.firstRow, zone.lastRow) && !taken.has(suggestedSeat)
        ? suggestedSeat
        : firstAvailableSeat;

  const [focusedSeat, setFocusedSeat] = useState<string>(preferredSeat);

  // Sync focusedSeat when active passenger changes
  useEffect(() => {
    if (assignedCurrent && isSeatInZone(assignedCurrent, zone.firstRow, zone.lastRow)) {
      setFocusedSeat(assignedCurrent);
    }
  }, [activePassenger, assignedCurrent, zone.firstRow, zone.lastRow]);

  // Keep focusedSeat clamped inside current zone if cabin/flight changes
  useEffect(() => {
    if (!isSeatInZone(focusedSeat, zone.firstRow, zone.lastRow)) {
      setFocusedSeat(preferredSeat);
    }
  }, [focusedSeat, preferredSeat, zone.firstRow, zone.lastRow]);

  const handleSelectSeat = useCallback(
    (seat: string) => {
      if (isReadOnly || !onSelect) return;
      const selectedByEntry = Object.entries(assignments).find(([, val]) => val === seat);
      const isSelected = Boolean(selectedByEntry);
      const isAssignedToOther = isSelected && Number(selectedByEntry?.[0]) !== activePassenger;
      const available = isSeatAvailableInMap(seat, parseRow(seat), parseLetter(seat));

      if (!available) {
        setLiveMessage(t("book.seatLiveOccupied", { seat }));
        return;
      }

      if (isAssignedToOther) {
        setLiveMessage(t("book.seatLiveAssignedOther", { seat }));
        return;
      }

      const currentPaxLabel =
        passengerLabels[activePassenger] || `${t("book.passenger")} ${activePassenger + 1}`;
      const isDeselect = assignedCurrent === seat;

      onSelect(activePassenger, seat);

      if (isDeselect) {
        setLiveMessage(t("book.seatLiveDeselected", { seat }));
      } else {
        setLiveMessage(t("book.seatLiveSelected", { seat, name: currentPaxLabel }));
      }
    },
    [activePassenger, assignedCurrent, assignments, isSeatAvailableInMap, isReadOnly, onSelect, passengerLabels, t],
  );

  const handleKeyDown = (e: React.KeyboardEvent, row: number, letterIndex: number) => {
    let nextRow = row;
    let nextLetterIndex = letterIndex;
    let handled = false;

    switch (e.key) {
      case "ArrowRight":
        handled = true;
        // In LTR aircraft geometry, ArrowRight moves starboard (increasing letter index)
        if (nextLetterIndex < effectiveLayout.letters.length - 1) {
          nextLetterIndex += 1;
        } else if (nextRow < zone.lastRow) {
          nextRow += 1;
          nextLetterIndex = 0;
        }
        break;
      case "ArrowLeft":
        handled = true;
        // In LTR aircraft geometry, ArrowLeft moves port (decreasing letter index)
        if (nextLetterIndex > 0) {
          nextLetterIndex -= 1;
        } else if (nextRow > zone.firstRow) {
          nextRow -= 1;
          nextLetterIndex = effectiveLayout.letters.length - 1;
        }
        break;
      case "ArrowDown":
        handled = true;
        if (nextRow < zone.lastRow) {
          nextRow += 1;
        }
        break;
      case "ArrowUp":
        handled = true;
        if (nextRow > zone.firstRow) {
          nextRow -= 1;
        }
        break;
      case "Home":
        handled = true;
        nextLetterIndex = 0;
        break;
      case "End":
        handled = true;
        nextLetterIndex = effectiveLayout.letters.length - 1;
        break;
      case "PageUp":
        handled = true;
        nextRow = Math.max(zone.firstRow, nextRow - 4);
        break;
      case "PageDown":
        handled = true;
        nextRow = Math.min(zone.lastRow, nextRow + 4);
        break;
      case " ":
      case "Enter":
        e.preventDefault();
        handleSelectSeat(`${row}${effectiveLayout.letters[letterIndex]}`);
        return;
    }

    if (handled) {
      e.preventDefault();
      const nextSeat = `${nextRow}${effectiveLayout.letters[nextLetterIndex]}`;
      setFocusedSeat(nextSeat);
      const btn = seatButtonRefs.current.get(nextSeat);
      if (btn) btn.focus();
    }
  };

  return (
    <div className={cn("w-full min-w-0", className)}>
      {/* Live region for screen reader seat selection announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>

      {/* Cabin Zone Header and Suggestion */}
      {!isAllCabins ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("book.cabinZone", {
              cabin: t(`cabin.${zone.id}`),
              from: String(zone.firstRow),
              to: String(zone.lastRow),
            })}
          </p>
          {suggestedSeat && !taken.has(suggestedSeat) ? (
            <button
              type="button"
              data-testid="suggested-seat-btn"
              data-suggested-seat={suggestedSeat}
              onClick={() => {
                setFocusedSeat(suggestedSeat);
                handleSelectSeat(suggestedSeat);
              }}
              className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-clay/50 bg-clay-soft px-3 py-1 text-xs font-semibold text-accent-foreground hover:border-clay active:scale-[0.99] motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <Sparkles aria-hidden="true" className="size-3.5 text-clay" />
              <span>{t("book.useSuggested")}</span>
              <span className="code-id font-bold">{suggestedSeat}</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Consistent Icon Silhouette Legend */}
      <ul
        className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"
        aria-label={t("book.seatLegend")}
      >
        <li className="flex items-center gap-1.5">
          <span className="flex size-5 items-center justify-center rounded border border-input bg-card text-muted-foreground">
            <AircraftSeatIcon />
          </span>
          <span>{t("book.seatAvailable")}</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span className="flex size-5 items-center justify-center rounded border border-transparent bg-primary text-primary-foreground shadow-xs">
            <AircraftSeatIcon isSelected />
          </span>
          <span>{t("book.seatSelected")}</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span className="flex size-5 items-center justify-center rounded border border-clay/60 bg-clay-soft text-accent-foreground">
            <AircraftSeatIcon />
          </span>
          <span>{`${t("book.seatExtra")} · ${money(extraLegroomPrice, lang)}`}</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span className="flex size-5 items-center justify-center rounded border border-transparent bg-secondary text-muted-foreground/40 opacity-70">
            <AircraftSeatIcon />
          </span>
          <span>{t("book.seatUnavailable")}</span>
        </li>
      </ul>

      {/* Aircraft seating grid container with strict LTR physical geometry */}
      <div className="mt-5 w-full min-w-0 max-w-full overflow-x-auto pb-3">
        <div
          dir="ltr"
          role="grid"
          aria-label={t("book.seatTitle")}
          aria-rowcount={rows.length + 1}
          aria-colcount={effectiveLayout.letters.length}
          className="mx-auto w-max rounded-t-[3.5rem] border border-border bg-sand px-3 pt-7 pb-6 sm:px-8 shadow-[var(--shadow-soft)]"
        >
          {/* Nose / Front of aircraft indicator */}
          <div className="mb-5 flex flex-col items-center justify-center text-muted-foreground/70 select-none">
            <div className="h-2 w-14 rounded-t-full bg-border" />
            <span className="mt-1 text-[0.65rem] font-bold tracking-widest uppercase">
              {t("book.frontOfAircraft")}
            </span>
          </div>

          {/* Seat Letters Header */}
          <div className="mb-3 flex items-center justify-center gap-1.5 sm:gap-2" role="row" aria-rowindex={1}>
            <span className="w-8 sm:w-9" aria-hidden="true" />
            {effectiveLayout.letters.map((letter, i) => (
              <span
                key={letter}
                role="columnheader"
                className={cn(
                  "code-id w-11 text-center text-xs font-bold text-muted-foreground",
                  i === effectiveLayout.aisleAfter && "ms-4 sm:ms-6",
                )}
              >
                {letter}
              </span>
            ))}
          </div>

          {/* Seating Rows */}
          {rows.map((row, rowIndex) => (
            <div
              key={row}
              role="row"
              aria-rowindex={rowIndex + 2}
              className="mb-2 flex items-center justify-center gap-1.5 sm:gap-2"
            >
              <span
                className="code-id w-8 text-end text-xs font-semibold text-muted-foreground sm:w-9 shrink-0"
                aria-hidden="true"
              >
                {row}
              </span>
              {effectiveLayout.letters.map((letter, colIndex) => {
                const seat = `${row}${letter}`;
                const available = isSeatAvailableInMap(seat, row, letter);
                const selectedBy = Object.entries(assignments).find(([, value]) => value === seat);
                const isSelected = Boolean(selectedBy);
                const isCurrentPaxSelected = isSelected && Number(selectedBy?.[0]) === activePassenger;
                const isOtherPaxSelected = isSelected && !isCurrentPaxSelected;
                const extra = effectiveLayout.extraLegroomRows.includes(row);
                const suggested = suggestedSeat === seat && !isSelected && available;
                const disabled = !available || isOtherPaxSelected;
                const isFocused = seat === focusedSeat;
                const posLabel = seatPositionLabel(effectiveLayout, letter, t);

                let statusDesc = "";
                if (isCurrentPaxSelected) {
                  statusDesc = t("book.seatStatusCurrent");
                } else if (isOtherPaxSelected) {
                  const otherName =
                    passengerLabels[Number(selectedBy?.[0])] ||
                    `${t("book.passenger")} ${Number(selectedBy?.[0]) + 1}`;
                  statusDesc = t("book.seatStatusOther", { name: otherName });
                } else if (!available) {
                  statusDesc = t("book.seatUnavailable");
                } else if (suggested) {
                  statusDesc = t("book.seatStatusSuggested");
                } else {
                  statusDesc = t("book.seatAvailable");
                }

                const ariaLabel = extra
                  ? t("book.seatLabelExtra", { seat, pos: posLabel, extra: t("book.seatExtra"), status: statusDesc })
                  : t("book.seatLabel", { seat, pos: posLabel, status: statusDesc });

                return (
                  <div
                    key={seat}
                    role="gridcell"
                    aria-colindex={colIndex + 1}
                    className={cn(colIndex === effectiveLayout.aisleAfter && "ms-4 sm:ms-6")}
                  >
                    <button
                      ref={(el) => {
                        if (el) seatButtonRefs.current.set(seat, el);
                        else seatButtonRefs.current.delete(seat);
                      }}
                      type="button"
                      tabIndex={isFocused ? 0 : -1}
                      aria-label={ariaLabel}
                      aria-pressed={isCurrentPaxSelected}
                      aria-disabled={disabled ? "true" : undefined}
                      data-suggested-seat={suggested ? seat : undefined}
                      onClick={() => {
                        setFocusedSeat(seat);
                        handleSelectSeat(seat);
                      }}
                      onFocus={() => setFocusedSeat(seat)}
                      onKeyDown={(e) => handleKeyDown(e, row, colIndex)}
                      className={cn(
                        "size-11 min-h-11 min-w-11 rounded-lg border text-xs font-semibold transition-all flex flex-col items-center justify-center gap-0.5",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring cursor-pointer select-none",
                        isCurrentPaxSelected
                          ? "border-primary bg-primary text-primary-foreground shadow-xs font-bold ring-2 ring-primary/40"
                          : !available
                            ? "cursor-not-allowed border-transparent bg-secondary text-muted-foreground/35 opacity-65"
                            : isOtherPaxSelected
                              ? "cursor-not-allowed border-border/80 bg-secondary/80 text-muted-foreground/60"
                              : extra
                                ? "border-clay/60 bg-clay-soft text-accent-foreground hover:border-clay hover:bg-clay-soft/80"
                                : "border-input bg-card text-foreground hover:border-primary/80 hover:bg-secondary/40",
                        suggested && !isSelected && "ring-2 ring-clay ring-offset-1",
                      )}
                    >
                      <AircraftSeatIcon isSelected={isCurrentPaxSelected} />
                      <span className="code-id text-[10px] leading-none">
                        {isOtherPaxSelected
                          ? `P${Number(selectedBy?.[0]) + 1}`
                          : letter}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
