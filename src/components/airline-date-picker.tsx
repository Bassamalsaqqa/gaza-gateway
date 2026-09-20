import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { DayButton, getDefaultClassNames } from "react-day-picker";

import { searchFlights, todayISO } from "@/lib/data";
import { dateLong, dateShort, money } from "@/lib/format";
import { useI18n, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { btnClass, Field } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Calendar as DayPickerCalendar } from "@/components/ui/calendar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";

function parseISOLocal(iso: string): Date | undefined {
  if (!iso) return undefined;
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return undefined;
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (year === undefined || month === undefined || day === undefined) return undefined;
  return new Date(year, month - 1, day, 12, 0, 0);
}

function formatISOLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

interface AirlineCalendarContextValue {
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

const AirlineCalendarContext = createContext<AirlineCalendarContextValue | null>(null);

function AirlineDayButton({
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

  // Natural localized truthful accessible day names (Correction 2)
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

export interface AirlineDatePickerProps {
  tripType: "round" | "oneway";
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
  onDepartChange: (date: string) => void;
  onReturnChange: (date: string) => void;
  minDate?: string | undefined;
  isDatePairInvalid?: boolean | undefined;
  departError?: string | undefined;
  returnError?: string | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

export function AirlineDatePicker({
  tripType,
  origin,
  destination,
  departDate,
  returnDate,
  onDepartChange,
  onReturnChange,
  minDate,
  isDatePairInvalid = false,
  departError: departErrorProp,
  returnError: returnErrorProp,
  disabled = false,
  className,
}: AirlineDatePickerProps) {
  const { t, lang } = useI18n();
  const isMobile = useIsMobile();

  const [open, setOpen] = useState(false);
  const [activeTarget, setActiveTarget] = useState<"depart" | "return">("depart");
  const [displayMonth, setDisplayMonth] = useState<Date>(() => parseISOLocal(departDate) ?? new Date());
  const [numberOfMonths, setNumberOfMonths] = useState(1);

  const departTriggerRef = useRef<HTMLButtonElement | null>(null);
  const returnTriggerRef = useRef<HTMLButtonElement | null>(null);
  const lastDateTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Update desktop two-month composition
  useEffect(() => {
    const updateMonths = () => {
      if (typeof window !== "undefined") {
        setNumberOfMonths(window.innerWidth >= 1024 && tripType === "round" ? 2 : 1);
      }
    };
    updateMonths();
    window.addEventListener("resize", updateMonths);
    return () => window.removeEventListener("resize", updateMonths);
  }, [tripType]);


  // Synchronize display month when opening or target changes
  useEffect(() => {
    if (open) {
      const targetDate = activeTarget === "return" && returnDate ? returnDate : departDate;
      const parsed = parseISOLocal(targetDate);
      if (parsed) {
        setDisplayMonth(parsed);
      }
    }
  }, [open, activeTarget, departDate, returnDate]);

  // Active route endpoints based on active selection target
  // Departure: origin -> destination; Return: destination -> origin
  const activeFrom = activeTarget === "depart" ? origin : destination;
  const activeTo = activeTarget === "depart" ? destination : origin;

  // Memoized route fare lookup
  const getRouteFare = useMemo(() => {
    const cache = new Map<string, { hasService: boolean; lowestFare: number | null }>();
    return (isoDate: string) => {
      const cached = cache.get(isoDate);
      if (cached !== undefined) return cached;
      if (!activeFrom || !activeTo || activeFrom === activeTo) {
        const res = { hasService: false, lowestFare: null };
        cache.set(isoDate, res);
        return res;
      }
      const flights = searchFlights(activeFrom, activeTo, isoDate);
      if (!flights || flights.length === 0) {
        const res = { hasService: false, lowestFare: null };
        cache.set(isoDate, res);
        return res;
      }
      const lowestFare = Math.min(...flights.map((f) => f.basePrice));
      const res = { hasService: true, lowestFare };
      cache.set(isoDate, res);
      return res;
    };
  }, [activeFrom, activeTo]);

  const getDepartFare = useMemo(() => {
    const cache = new Map<string, { hasService: boolean; lowestFare: number | null }>();
    return (isoDate: string) => {
      const cached = cache.get(isoDate);
      if (cached) return cached;
      const flights = origin && destination && origin !== destination
        ? searchFlights(origin, destination, isoDate)
        : [];
      const result = flights.length
        ? { hasService: true, lowestFare: Math.min(...flights.map((flight) => flight.basePrice)) }
        : { hasService: false, lowestFare: null };
      cache.set(isoDate, result);
      return result;
    };
  }, [origin, destination]);

  const effectiveMinDate = activeTarget === "return" && departDate
    ? departDate > (minDate || todayISO()) ? departDate : (minDate || todayISO())
    : (minDate || todayISO());

  // Defect 2: Independent meaningful lowest fare per visible month
  // A month has a meaningful minimum only when at least two selectable service dates have fares
  const getMinFareForMonth = useMemo(() => {
    const cache = new Map<string, number | null>();
    return (year: number, month: number): number | null => {
      const key = `${activeFrom}-${activeTo}-${year}-${month}`;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;

      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const effectiveMin = effectiveMinDate;
      const fares: number[] = [];

      for (let d = 1; d <= daysInMonth; d++) {
        const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        if (iso >= effectiveMin) {
          const info = getRouteFare(iso);
          if (info.hasService && info.lowestFare !== null) {
            fares.push(info.lowestFare);
          }
        }
      }

      const res = fares.length > 1 ? Math.min(...fares) : null;
      cache.set(key, res);
      return res;
    };
  }, [activeFrom, activeTo, effectiveMinDate, getRouteFare]);

  // Defect 3: Route-aware service availability checks for entered dates
  const isNetworkValid = (origin === "GZA" || destination === "GZA") && origin !== destination;
  const hasDepartService = !departDate || !isNetworkValid || searchFlights(origin, destination, departDate).length > 0;
  const hasReturnService = tripType !== "round" || !returnDate || !isNetworkValid || searchFlights(destination, origin, returnDate).length > 0;

  const departRoute = lang === "ar" ? `\u2066${origin} → ${destination}\u2069` : `${origin} → ${destination}`;
  const returnRoute = lang === "ar" ? `\u2066${destination} → ${origin}\u2069` : `${destination} → ${origin}`;
  const isolatedDepartDate = lang === "ar" ? `\u2066${departDate}\u2069` : departDate;
  const isolatedReturnDate = lang === "ar" ? `\u2066${returnDate}\u2069` : returnDate;

  const computedDepartError = !hasDepartService && departDate
    ? t("search.errDepartNoService", { date: isolatedDepartDate, route: departRoute })
    : undefined;

  const computedReturnError = tripType === "round" && !hasReturnService && returnDate
    ? t("search.errReturnNoService", { date: isolatedReturnDate, route: returnRoute })
    : undefined;

  const activeDepartError = departErrorProp || computedDepartError;
  const activeReturnError = returnErrorProp || computedReturnError;

  const handleTriggerClick = (target: "depart" | "return") => {
    if (disabled) return;
    if (target === "return" && tripType === "oneway") return;
    lastDateTriggerRef.current = target === "depart" ? departTriggerRef.current : returnTriggerRef.current;
    setActiveTarget(target);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    lastDateTriggerRef.current?.focus();
  };

  // Gracefully close on mobile/desktop boundary crossing to prevent stale portals or locks
  const prevIsMobileRef = useRef(isMobile);
  useEffect(() => {
    if (prevIsMobileRef.current !== undefined && prevIsMobileRef.current !== isMobile) {
      if (open) {
        handleClose();
      }
    }
    prevIsMobileRef.current = isMobile;
  }, [isMobile, open]);

  const handleSelectDate = (iso: string) => {
    if (activeTarget === "depart") {
      onDepartChange(iso);
      if (returnDate && returnDate < iso) onReturnChange("");
      if (tripType === "round") {
        setActiveTarget("return");
      }
    } else {
      onReturnChange(iso);
    }
    // Never auto-close; wait for explicit confirm action or escape
  };

  const isConfirmDisabled =
    !departDate ||
    !hasDepartService ||
    (tripType === "round" && (!returnDate || returnDate < departDate || !hasReturnService));

  const handleConfirm = () => {
    if (isConfirmDisabled) return;
    setOpen(false);
    lastDateTriggerRef.current?.focus();
  };

  const contextValue = useMemo<AirlineCalendarContextValue>(
    () => ({
      activeFrom,
      activeTo,
      getRouteFare,
      lang,
      t,
      getMinFareForMonth,
      minDate: effectiveMinDate,
      departDate,
      getDepartFare,
    }),
    [activeFrom, activeTo, getRouteFare, lang, t, getMinFareForMonth, effectiveMinDate, departDate, getDepartFare],
  );

  // Common calendar surface shared between desktop popover and mobile dialog
  const calendarSurface = (
    <AirlineCalendarContext.Provider value={contextValue}>
      <div className="flex flex-col">
        {/* Top Summary Tabs */}
        <div className="flex items-center gap-2 border-b border-border/60 pb-3 mb-3">
          <button
            type="button"
            data-tab="depart"
            onClick={() => setActiveTarget("depart")}
            aria-pressed={activeTarget === "depart"}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-start transition-all border cursor-pointer select-none",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
              activeTarget === "depart"
                ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                : "border-border/60 bg-secondary/30 text-muted-foreground hover:bg-secondary/60",
            )}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wider">
              {t("search.depart")}
            </div>
            <div className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {departDate ? dateShort(departDate, lang) : t("search.selectDates")}
            </div>
          </button>

          {tripType === "round" && (
            <button
              type="button"
              data-tab="return"
              onClick={() => setActiveTarget("return")}
              aria-pressed={activeTarget === "return"}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-start transition-all border cursor-pointer select-none",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                activeTarget === "return"
                  ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                  : "border-border/60 bg-secondary/30 text-muted-foreground hover:bg-secondary/60",
                isDatePairInvalid && "border-destructive text-destructive",
              )}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider">
                {t("search.return")}
              </div>
              <div className="font-mono text-sm font-semibold tabular-nums text-foreground">
                {returnDate ? dateShort(returnDate, lang) : t("search.selectDates")}
              </div>
            </button>
          )}
        </div>

        <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{activeTarget === "depart" ? t("search.depart") : t("search.return")}</span>
          <span dir="ltr" className="font-mono font-semibold text-foreground">
            {activeFrom} → {activeTo}
          </span>
        </div>

        {/* Date Validation Alert inside Surface if Invalid */}
        {isDatePairInvalid && tripType === "round" && (
          <div
            role="alert"
            className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive"
          >
            {t("search.errReturn")}
          </div>
        )}
        {activeDepartError && (
          <div
            role="alert"
            className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive"
          >
            {activeDepartError}
          </div>
        )}
        {activeReturnError && tripType === "round" && (
          <div
            role="alert"
            className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive"
          >
            {activeReturnError}
          </div>
        )}

        {/* Calendar Picker */}
        <div className="overflow-x-auto flex justify-center">
          {tripType === "round" ? (
            <DayPickerCalendar
              mode="range"
              month={displayMonth}
              onMonthChange={setDisplayMonth}
              selected={{
                from: departDate ? parseISOLocal(departDate) : undefined,
                to:
                  returnDate && departDate && returnDate >= departDate
                    ? parseISOLocal(returnDate)
                    : undefined,
              }}
              onSelect={(_range, triggerDate) => {
                if (!triggerDate) return;
                handleSelectDate(formatISOLocal(triggerDate));
              }}
              numberOfMonths={isMobile ? 1 : numberOfMonths}
              disabled={[
                { before: parseISOLocal(effectiveMinDate) ?? new Date() },
                (date: Date) => {
                  const iso = formatISOLocal(date);
                  return !getRouteFare(iso).hasService;
                },
              ]}
              dir={lang === "ar" ? "rtl" : "ltr"}
              formatters={{
                formatDay: (d) => String(d.getDate()),
                formatMonthCaption: (d) =>
                  new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", {
                    month: "long",
                    year: "numeric",
                  }).format(d),
                formatWeekdayName: (d) =>
                  new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", {
                    weekday: "short",
                  }).format(d),
              }}
              components={{
                DayButton: AirlineDayButton,
              }}
              className="p-0 select-none"
            />
          ) : (
            <DayPickerCalendar
              mode="single"
              month={displayMonth}
              onMonthChange={setDisplayMonth}
              selected={departDate ? parseISOLocal(departDate) : undefined}
              onSelect={(date) => {
                if (!date) return;
                handleSelectDate(formatISOLocal(date));
              }}
              numberOfMonths={1}
              disabled={[
                { before: parseISOLocal(effectiveMinDate) ?? new Date() },
                (date: Date) => {
                  const iso = formatISOLocal(date);
                  return !getRouteFare(iso).hasService;
                },
              ]}
              dir={lang === "ar" ? "rtl" : "ltr"}
              formatters={{
                formatDay: (d) => String(d.getDate()),
                formatMonthCaption: (d) =>
                  new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", {
                    month: "long",
                    year: "numeric",
                  }).format(d),
                formatWeekdayName: (d) =>
                  new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", {
                    weekday: "short",
                  }).format(d),
              }}
              components={{
                DayButton: AirlineDayButton,
              }}
              className="p-0 select-none"
            />
          )}
        </div>

        {/* Footer Summary & Confirm Action */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 border-t border-border/60 pt-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground font-mono tabular-nums">
              {departDate && tripType === "round" && returnDate
                ? `${departDate} → ${returnDate}`
                : departDate || ""}
            </span>
            <span className="text-[11px] text-muted-foreground/80">
              * {t("search.fareDisclaimer")}
            </span>
          </div>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className={btnClass(
              "primary",
              "sm",
              "cursor-pointer select-none disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {t("search.confirmDates")}
          </button>
        </div>
      </div>
    </AirlineCalendarContext.Provider>
  );

  return (
    <div className={cn("md:col-span-2 lg:col-span-2", className)}>
      <Popover open={!isMobile && open} onOpenChange={(val) => { if (!val) handleClose(); }}>
        <PopoverAnchor asChild>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4">
            {/* Departure Field and Trigger */}
            <Field
              label={t("search.depart")}
              htmlFor="search-depart"
              error={activeDepartError}
              errorId="search-depart-error"
            >
              <button
                ref={departTriggerRef}
                id="search-depart"
                type="button"
                onClick={() => handleTriggerClick("depart")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleTriggerClick("depart");
                  }
                }}
                disabled={disabled}
                aria-expanded={open && activeTarget === "depart"}
                aria-haspopup="dialog"
                aria-invalid={Boolean(activeDepartError)}
                aria-describedby={activeDepartError ? "search-depart-error" : undefined}
                className={cn(
                  "flex h-11 w-full items-center justify-between rounded-lg border border-input bg-card px-3.5 text-sm font-medium transition-colors hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring cursor-pointer select-none",
                  activeDepartError && "border-destructive focus-visible:outline-destructive",
                )}
              >
                <span className="flex items-center gap-2">
                  <CalendarIcon aria-hidden="true" className="size-4 text-muted-foreground shrink-0" />
                  <span className="tabular-nums font-mono font-semibold text-foreground">
                    {departDate ? dateShort(departDate, lang) : t("search.selectDates")}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground font-mono tabular-nums">
                  {departDate || ""}
                </span>
              </button>
            </Field>

            {/* Return Field and Trigger */}
            <Field
              label={t("search.return")}
              htmlFor="search-return"
              hint={tripType === "oneway" ? t("search.oneWay") : undefined}
              error={isDatePairInvalid ? t("search.errReturn") : activeReturnError}
              errorId="search-return-error"
            >
              <button
                ref={returnTriggerRef}
                id="search-return"
                type="button"
                onClick={() => handleTriggerClick("return")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleTriggerClick("return");
                  }
                }}
                disabled={disabled || tripType === "oneway"}
                aria-disabled={disabled || tripType === "oneway"}
                aria-expanded={open && activeTarget === "return"}
                aria-haspopup="dialog"
                aria-invalid={isDatePairInvalid || Boolean(activeReturnError)}
                aria-describedby={
                  isDatePairInvalid || activeReturnError ? "search-return-error" : undefined
                }
                className={cn(
                  "flex h-11 w-full items-center justify-between rounded-lg border border-input bg-card px-3.5 text-sm font-medium transition-colors hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring cursor-pointer select-none",
                  (isDatePairInvalid || activeReturnError) && "border-destructive focus-visible:outline-destructive",
                  tripType === "oneway" && "bg-muted/40 cursor-not-allowed text-muted-foreground",
                )}
              >
                <span className="flex items-center gap-2">
                  <CalendarIcon aria-hidden="true" className="size-4 text-muted-foreground shrink-0" />
                  <span className="tabular-nums font-mono font-semibold text-foreground">
                    {tripType === "oneway"
                      ? "—"
                      : returnDate
                        ? dateShort(returnDate, lang)
                        : t("search.selectDates")}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground font-mono tabular-nums">
                  {tripType === "oneway" ? "" : returnDate || ""}
                </span>
              </button>
            </Field>
          </div>
        </PopoverAnchor>

        {/* Desktop Popover Surface */}
        {!isMobile && (
          <PopoverContent
            align="start"
            sideOffset={8}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              lastDateTriggerRef.current?.focus();
            }}
            className="w-auto p-4 sm:p-5 max-w-[calc(100vw-2rem)] shadow-[var(--shadow-lift)] rounded-2xl border-border bg-card z-50"
          >
            {calendarSurface}
          </PopoverContent>
        )}
      </Popover>

      {/* Mobile Focused Dialog Surface */}
      {isMobile && (
        <Dialog open={open} onOpenChange={(val) => { if (!val) handleClose(); }}>
          <DialogContent
            closeLabel={t("common.close")}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              lastDateTriggerRef.current?.focus();
            }}
            className="fixed inset-x-0 bottom-0 top-auto sm:top-[50%] sm:bottom-auto sm:left-[50%] sm:-translate-x-1/2 sm:-translate-y-1/2 w-full max-w-md max-h-[92vh] flex flex-col p-4 rounded-t-2xl sm:rounded-2xl border-border bg-card shadow-2xl overflow-y-auto z-50 duration-200"
          >
            <DialogTitle className="sr-only">{t("search.dates")}</DialogTitle>
            <DialogDescription className="sr-only">{t("search.fareDisclaimer")}</DialogDescription>
            {calendarSurface}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
