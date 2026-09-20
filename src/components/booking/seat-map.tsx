import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EXTRA_LEGROOM_ROWS,
  SEAT_LETTERS,
  cabinZone,
  isSeatAvailable,
  seatFee,
} from "@/lib/data";
import { money } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type SeatMapProps = {
  flightId: string;
  /** seat code per passenger index, e.g. { 0: "12A" } */
  assignments: Record<number, string>;
  activePassenger: number;
  onSelect: (passengerIndex: number, seat: string) => void;
  passengerLabels: string[];
  onActivePassengerChange: (index: number) => void;
  /** Booked cabin — only that zone of the aircraft is selectable. */
  cabin?: string;
  /** Optional seat suggested from a saved seat preference. */
  suggestedSeat?: string | undefined;
};

function parseRow(seat: string): number {
  return Number.parseInt(seat.replace(/\D/g, ""), 10) || 1;
}

function parseLetter(seat: string): (typeof SEAT_LETTERS)[number] {
  const match = seat.match(/[A-F]/i);
  return (match ? match[0].toUpperCase() : "A") as (typeof SEAT_LETTERS)[number];
}

function isSeatInZone(seat: string, firstRow: number, lastRow: number): boolean {
  const row = parseRow(seat);
  return row >= firstRow && row <= lastRow;
}

function seatPositionLabel(
  letter: string,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (letter === "A" || letter === "F") {
    return t("book.seatWindow");
  }
  if (letter === "C" || letter === "D") {
    return t("book.seatAisle");
  }
  return t("book.seatMiddle");
}

export function SeatMap({
  flightId,
  assignments,
  activePassenger,
  onSelect,
  passengerLabels,
  onActivePassengerChange,
  cabin = "economy",
  suggestedSeat,
}: SeatMapProps) {
  const { t, lang } = useI18n();
  const taken = useMemo(() => new Set(Object.values(assignments)), [assignments]);
  const zone = cabinZone(cabin);
  const rows = useMemo(
    () =>
      Array.from(
        { length: zone.lastRow - zone.firstRow + 1 },
        (_, i) => zone.firstRow + i,
      ),
    [zone.firstRow, zone.lastRow],
  );

  const seatButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [liveMessage, setLiveMessage] = useState<string>("");

  // Determine an initial sensible focused seat within current cabin zone
  const firstAvailableSeat = useMemo(() => {
    for (const r of rows) {
      for (const l of SEAT_LETTERS) {
        if (isSeatAvailable(flightId, r, l)) return `${r}${l}`;
      }
    }
    return `${rows[0]}${SEAT_LETTERS[0]}`;
  }, [flightId, rows]);

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
      const selectedByEntry = Object.entries(assignments).find(([, val]) => val === seat);
      const isSelected = Boolean(selectedByEntry);
      const isAssignedToOther = isSelected && Number(selectedByEntry?.[0]) !== activePassenger;
      const available = isSeatAvailable(flightId, parseRow(seat), parseLetter(seat));

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
    [activePassenger, assignedCurrent, assignments, flightId, onSelect, passengerLabels, t],
  );

  const handleKeyDown = (e: React.KeyboardEvent, row: number, letterIndex: number) => {
    let nextRow = row;
    let nextLetterIndex = letterIndex;
    let handled = false;

    switch (e.key) {
      case "ArrowRight":
        handled = true;
        // In LTR aircraft geometry, ArrowRight moves starboard (increasing letter index)
        if (nextLetterIndex < SEAT_LETTERS.length - 1) {
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
          nextLetterIndex = SEAT_LETTERS.length - 1;
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
        nextLetterIndex = SEAT_LETTERS.length - 1;
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
        handleSelectSeat(`${row}${SEAT_LETTERS[letterIndex]}`);
        return;
    }

    if (handled) {
      e.preventDefault();
      const nextSeat = `${nextRow}${SEAT_LETTERS[nextLetterIndex]}`;
      setFocusedSeat(nextSeat);
      const btn = seatButtonRefs.current.get(nextSeat);
      if (btn) btn.focus();
    }
  };

  return (
    <div className="w-full min-w-0">
      {/* Live region for screen reader seat selection announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>

      {passengerLabels.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("book.seatAssign")}>
          {passengerLabels.map((label, index) => (
            <button
              key={index}
              type="button"
              onClick={() => onActivePassengerChange(index)}
              aria-pressed={activePassenger === index}
              className={cn(
                "min-h-11 cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors active:scale-[0.99] motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                activePassenger === index
                  ? "border-primary bg-primary text-primary-foreground shadow-xs"
                  : "border-input bg-card text-muted-foreground hover:bg-secondary/60",
              )}
            >
              {label}
              {assignments[index] ? <span className="code-id ms-1.5">{assignments[index]}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
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
            onClick={() => {
              setFocusedSeat(suggestedSeat);
              handleSelectSeat(suggestedSeat);
            }}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-clay/50 bg-clay-soft px-3.5 py-1.5 text-xs font-semibold text-accent-foreground hover:border-clay active:scale-[0.99] motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            <Sparkles aria-hidden="true" className="size-3.5 text-clay" />
            {t("book.useSuggested")} <span className="code-id">{suggestedSeat}</span>
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("book.seatZoneNote")}</p>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label={t("book.seatLegend")}>
        <Legend className="border-input bg-card" label={t("book.seatAvailable")} />
        <Legend className="border-transparent bg-primary text-primary-foreground" label={t("book.seatSelected")} />
        <Legend className="border-transparent bg-secondary text-muted-foreground/50" label={t("book.seatUnavailable")} />
        <Legend className="border-clay/50 bg-clay-soft text-accent-foreground" label={`${t("book.seatExtra")} · ${money(18, lang)}`} />
      </ul>

      {/* Aircraft seating grid container with strict LTR geometry */}
      <div className="mt-5 w-full min-w-0 max-w-full overflow-x-auto pb-3">
        <div
          dir="ltr"
          role="grid"
          aria-label={t("book.seatTitle")}
          aria-rowcount={rows.length}
          aria-colcount={SEAT_LETTERS.length}
          className="mx-auto w-max rounded-t-[3.5rem] border border-border bg-sand/60 px-3 pt-8 pb-6 sm:px-8 shadow-[var(--shadow-soft)]"
        >
          {/* Nose / Front of aircraft indicator */}
          <div className="mb-5 flex flex-col items-center justify-center text-muted-foreground/70 select-none">
            <div className="h-2 w-14 rounded-t-full bg-border" />
            <span className="mt-1 text-[0.65rem] font-bold tracking-widest uppercase">
              {t("book.frontOfAircraft")}
            </span>
          </div>

          {/* Seat Letters Header (Columns A-F with aisle gap) */}
          <div className="mb-3 flex items-center justify-center gap-1.5 sm:gap-2" role="row">
            <span className="w-8 sm:w-9" aria-hidden="true" />
            {SEAT_LETTERS.map((letter, i) => (
              <span
                key={letter}
                role="columnheader"
                className={cn(
                  "code-id w-11 text-center text-xs font-bold text-muted-foreground",
                  i === 3 && "ms-4 sm:ms-6",
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
              aria-rowindex={rowIndex + 1}
              className="mb-2 flex items-center justify-center gap-1.5 sm:gap-2"
            >
              <span
                className="code-id w-8 text-end text-xs font-semibold text-muted-foreground sm:w-9 shrink-0"
                aria-hidden="true"
              >
                {row}
              </span>
              {SEAT_LETTERS.map((letter, colIndex) => {
                const seat = `${row}${letter}`;
                const available = isSeatAvailable(flightId, row, letter);
                const selectedBy = Object.entries(assignments).find(([, value]) => value === seat);
                const isSelected = Boolean(selectedBy);
                const isCurrentPaxSelected = isSelected && Number(selectedBy?.[0]) === activePassenger;
                const isOtherPaxSelected = isSelected && !isCurrentPaxSelected;
                const extra = EXTRA_LEGROOM_ROWS.includes(row);
                const suggested = suggestedSeat === seat && !isSelected && available;
                const disabled = !available || isOtherPaxSelected;
                const isFocused = seat === focusedSeat;
                const posLabel = seatPositionLabel(letter, t);

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
                    className={cn(colIndex === 3 && "ms-4 sm:ms-6")}
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
                      onClick={() => {
                        setFocusedSeat(seat);
                        handleSelectSeat(seat);
                      }}
                      onFocus={() => setFocusedSeat(seat)}
                      onKeyDown={(e) => handleKeyDown(e, row, colIndex)}
                      className={cn(
                        "size-11 min-h-11 min-w-11 rounded-md border text-xs font-semibold transition-colors flex items-center justify-center",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        isCurrentPaxSelected
                          ? "border-transparent bg-primary text-primary-foreground shadow-xs font-bold ring-1 ring-primary/40"
                          : !available
                            ? "cursor-not-allowed border-transparent bg-secondary text-muted-foreground/35 opacity-70"
                            : isOtherPaxSelected
                              ? "cursor-not-allowed border-transparent bg-secondary/80 text-muted-foreground/50"
                              : extra
                                ? "border-clay/60 bg-clay-soft text-accent-foreground hover:border-clay"
                                : "cursor-pointer border-input bg-card hover:border-primary active:bg-brand-soft",
                        suggested && !isSelected && "ring-2 ring-clay ring-offset-1",
                      )}
                    >
                      <span className="code-id">{taken.has(seat) && !isSelected ? "" : letter}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        {t("book.seatExtra")}: {money(seatFee(EXTRA_LEGROOM_ROWS[0] ?? 11), lang)} · {t("book.seatSub")}
      </p>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden="true" className={cn("size-3.5 rounded border", className)} />
      {label}
    </li>
  );
}
