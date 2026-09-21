import React, { createContext, useContext, useEffect, useRef } from "react";
import { DayButton } from "react-day-picker";

import { todayISO } from "@/lib/data";
import { dateLong, money } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatISOLocal } from "./date-utils";

export interface AirlineCalendarContextValue {
  activeFrom: string;
  activeTo: string;
  getRouteFare: (isoDate: string) => { hasService: boolean; lowestFare: number | null };
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
  getMinFareForMonth: (year: number, month: number) => number | null;
  minDate: string;
  departDate: string;
  getDepartFare: (isoDate: string) => { hasService: boolean; lowestFare: number | null };
}

export const AirlineCalendarContext = createContext<AirlineCalendarContextValue | null>(null);

export function AirlineDayButton({
  day,
  modifiers,
  className,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const ctx = useContext(AirlineCalendarContext);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (modifiers["focused"]) ref.current?.focus();
  }, [modifiers]);

  const iso = formatISOLocal(day.date);
  const isOutside = Boolean(modifiers["outside"]);
  const isDisabled = Boolean(modifiers["disabled"]);
  const isSelected = Boolean(modifiers["selected"]);
  const isRangeStart = Boolean(modifiers["range_start"]);
  const isRangeEnd = Boolean(modifiers["range_end"]);
  const isRangeMiddle = Boolean(modifiers["range_middle"]);
  const isSelectedSingle = isSelected && !isRangeStart && !isRangeEnd && !isRangeMiddle;

  const fareInfo = ctx && !isOutside
    ? iso === ctx.departDate
      ? ctx.getDepartFare(iso)
      : ctx.getRouteFare(iso)
    : null;
  const hasService = fareInfo ? fareInfo.hasService : false;
  const lowestFare = fareInfo ? fareInfo.lowestFare : null;

  // Day label (always Latin digits)
  const dayNumber = String(day.date.getDate());

  // Defect 2: Separate meaningful minimum calculation per calendar month
  const dayYear = day.date.getFullYear();
  const dayMonth = day.date.getMonth();
  const monthMinFare = ctx && !isOutside ? ctx.getMinFareForMonth(dayYear, dayMonth) : null;

  const isLowestInMonth = Boolean(
    hasService &&
    lowestFare !== null &&
    monthMinFare !== null &&
    lowestFare === monthMinFare
  );

  // Natural localized truthful accessible day names
  const lang = ctx?.lang ?? "en";
  const t = ctx?.t ?? ((k: string) => k);
  const fullDateStr = dateLong(iso, lang);
  const separator = lang === "ar" ? "، " : ", ";

  const effectiveMinDate = ctx?.minDate ?? todayISO();
  const isPast = iso < effectiveMinDate;

  let statusText = t("search.unavailable");
  if (!isOutside) {
    if (!isDisabled && hasService && lowestFare !== null) {
      statusText = `${t("search.lowestFare")} ${money(lowestFare, lang)}`;
    } else if (!isPast && !hasService) {
      statusText = t("search.noService");
    } else {
      statusText = t("search.unavailable");
    }
  }
  const accessibleDayName = `${fullDateStr}${separator}${statusText}`;

  const { "aria-label": _defaultAriaLabel, ...restProps } = props;
  const effectiveDisabled = isDisabled || !hasService;

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      {...restProps}
      disabled={effectiveDisabled}
      aria-disabled={effectiveDisabled ? "true" : undefined}
      data-day={iso}
      data-service={hasService}
      data-fare={lowestFare ?? undefined}
      data-lowest-month={isLowestInMonth}
      data-selected-single={isSelectedSingle}
      data-range-start={isRangeStart}
      data-range-end={isRangeEnd}
      data-range-middle={isRangeMiddle}
      aria-label={accessibleDayName}
      className={cn(
        "relative flex flex-col items-center justify-center p-0 font-normal select-none transition-colors cursor-pointer",
        "h-11 sm:h-12 w-full min-w-[34px] sm:min-w-[38px] rounded-lg",
        // Selected / Range styles
        isSelectedSingle && "bg-primary text-primary-foreground font-semibold shadow-xs",
        isRangeStart && "bg-primary text-primary-foreground font-semibold rounded-e-none shadow-xs",
        isRangeEnd && "bg-primary text-primary-foreground font-semibold rounded-s-none shadow-xs",
        isRangeMiddle && "bg-accent/70 text-accent-foreground rounded-none font-medium",
        // Not selected states
        !isSelected && !isRangeStart && !isRangeEnd && !isRangeMiddle && [
          hasService && !isDisabled && "hover:bg-secondary/60 hover:text-foreground text-foreground",
          (!hasService || isDisabled) && "text-muted-foreground/35 cursor-not-allowed opacity-40 hover:bg-transparent",
        ],
        // Lowest fare subtle border indicator
        isLowestInMonth && !isSelected && !isRangeStart && !isRangeEnd && "ring-1 ring-primary/40",
        // Focus state
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
        className,
      )}
    >
      <span className="font-mono text-xs sm:text-sm font-semibold tabular-nums leading-none">
        {dayNumber}
      </span>
      {!isOutside && hasService && lowestFare !== null && (
        <span
          dir="ltr"
          className={cn(
            "mt-0.5 font-mono text-[10px] sm:text-[11px] font-medium leading-none tabular-nums",
            (isSelectedSingle || isRangeStart || isRangeEnd)
              ? "text-primary-foreground/90 font-semibold"
              : "text-muted-foreground/80",
          )}
        >
          {money(lowestFare, lang)}
        </span>
      )}
      {!isOutside && (!hasService || isDisabled) && (
        <span
          className="mt-0.5 text-[9px] sm:text-[10px] text-muted-foreground/35 leading-none font-mono"
          aria-hidden="true"
        >
          —
        </span>
      )}
    </Button>
  );
}
