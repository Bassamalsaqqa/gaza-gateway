import { EXTRA_LEGROOM_ROWS, SEAT_LETTERS, SEAT_ROWS, isSeatAvailable, seatFee } from "@/lib/data";
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
};

export function SeatMap({
  flightId,
  assignments,
  activePassenger,
  onSelect,
  passengerLabels,
  onActivePassengerChange,
}: SeatMapProps) {
  const { t, lang } = useI18n();
  const taken = new Set(Object.values(assignments));

  return (
    <div>
      {passengerLabels.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("book.seatAssign")}>
          {passengerLabels.map((label, index) => (
            <button
              key={index}
              type="button"
              onClick={() => onActivePassengerChange(index)}
              aria-pressed={activePassenger === index}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                activePassenger === index
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-card text-muted-foreground",
              )}
            >
              {label}
              {assignments[index] ? <span className="code-id ms-1.5">{assignments[index]}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <Legend className="border-input bg-card" label={t("book.seatAvailable")} />
        <Legend className="border-transparent bg-primary" label={t("book.seatSelected")} />
        <Legend className="border-transparent bg-secondary" label={t("book.seatUnavailable")} />
        <Legend className="border-clay/50 bg-clay-soft" label={`${t("book.seatExtra")} · ${money(18, lang)}`} />
      </ul>

      <div className="mt-5 overflow-x-auto">
        <div className="mx-auto w-max rounded-t-[3rem] border border-border bg-sand/60 px-3 pt-8 pb-6 sm:px-6">
          <div className="mb-3 flex justify-center gap-1.5 ps-8">
            {SEAT_LETTERS.map((letter, i) => (
              <span
                key={letter}
                className={cn(
                  "code-id w-8 text-center text-[0.7rem] font-semibold text-muted-foreground sm:w-9",
                  i === 3 && "ms-6",
                )}
              >
                {letter}
              </span>
            ))}
          </div>
          {Array.from({ length: SEAT_ROWS }, (_, r) => r + 1).map((row) => (
            <div key={row} className="mb-1.5 flex items-center justify-center gap-1.5">
              <span className="code-id w-8 text-end text-[0.7rem] text-muted-foreground">{row}</span>
              {SEAT_LETTERS.map((letter, i) => {
                const seat = `${row}${letter}`;
                const available = isSeatAvailable(flightId, row, letter);
                const selectedBy = Object.entries(assignments).find(([, value]) => value === seat);
                const isSelected = Boolean(selectedBy);
                const extra = EXTRA_LEGROOM_ROWS.includes(row);
                const disabled = !available || (isSelected && Number(selectedBy?.[0]) !== activePassenger);
                return (
                  <button
                    key={seat}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelect(activePassenger, seat)}
                    aria-label={`${t("book.seatFor")} ${seat}${extra ? ` · ${t("book.seatExtra")}` : ""}`}
                    aria-pressed={isSelected}
                    className={cn(
                      "size-8 rounded-md border text-[0.65rem] font-semibold transition-colors sm:size-9",
                      i === 3 && "ms-6",
                      isSelected
                        ? "border-transparent bg-primary text-primary-foreground"
                        : !available
                          ? "cursor-not-allowed border-transparent bg-secondary text-muted-foreground/40"
                          : extra
                            ? "border-clay/50 bg-clay-soft text-accent-foreground hover:border-clay"
                            : "border-input bg-card hover:border-primary",
                    )}
                  >
                    <span className="code-id">{taken.has(seat) && !isSelected ? "" : letter}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        {t("book.seatExtra")}: {money(seatFee(1), lang)} · {t("book.seatSub")}
      </p>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden="true" className={cn("size-4 rounded border", className)} />
      {label}
    </li>
  );
}
