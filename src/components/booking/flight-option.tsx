import { Plane } from "lucide-react";
import { btnClass, Code } from "@/components/kit";
import { StatusBadge } from "@/components/flight-status";
import { airportByCode, farePrice, minutesToLabel, type Flight } from "@/lib/data";
import { money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function FlightOption({
  flight,
  cabin,
  selected,
  onSelect,
}: {
  flight: Flight;
  cabin: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t, lang } = useI18n();
  const from = airportByCode(flight.originCode);
  const to = airportByCode(flight.destinationCode);
  const price = farePrice(flight.basePrice, "essential", cabin);

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 transition-colors sm:p-5",
        selected ? "border-primary ring-1 ring-primary/40" : "border-border",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4 sm:gap-6">
          <div>
            <p className="code-id text-2xl font-bold">{flight.departTime}</p>
            <Code className="text-xs text-muted-foreground">{flight.originCode}</Code>
          </div>
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <span className="numeral text-[0.7rem]">{minutesToLabel(flight.durationMinutes, lang)}</span>
            <span aria-hidden="true" className="flex w-16 items-center gap-1 sm:w-24">
              <span className="h-px flex-1 bg-border" />
              <Plane className="size-3.5 rtl:-scale-x-100" />
              <span className="h-px flex-1 bg-border" />
            </span>
            <span className="text-[0.7rem]">{t("book.nonstop")}</span>
          </div>
          <div>
            <p className="code-id text-2xl font-bold">{flight.arriveTime}</p>
            <Code className="text-xs text-muted-foreground">{flight.destinationCode}</Code>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
          <div className="text-start sm:text-end">
            <p className="text-lg font-bold">{money(price, lang)}</p>
            <p className="text-xs text-muted-foreground">{t("book.perPassenger")}</p>
          </div>
          <button type="button" onClick={onSelect} className={btnClass(selected ? "secondary" : "primary", "sm")}>
            {selected ? t("book.selected") : t("book.select")}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">
          <Code>{flight.number}</Code>
        </span>
        <span>{flight.aircraft}</span>
        <span>
          {from ? pick(lang, from.city) : flight.originCode} → {to ? pick(lang, to.city) : flight.destinationCode}
        </span>
        <StatusBadge status={flight.status} />
        <span className="numeral">{t("book.seatsLeft", { n: flight.seatsLeft })}</span>
      </div>
    </div>
  );
}
