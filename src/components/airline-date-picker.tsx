import React, { useEffect, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";

import { searchFlights, todayISO } from "@/lib/data";
import { dateShort } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Field } from "@/components/kit";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";

import { parseISOLocal } from "./airline-date-picker/date-utils";
import type { AirlineCalendarContextValue } from "./airline-date-picker/airline-day-button";
import { AirlineCalendarSurface } from "./airline-date-picker/airline-calendar-surface";

export { parseISOLocal, formatISOLocal } from "./airline-date-picker/date-utils";
export { AirlineDayButton, AirlineCalendarContext } from "./airline-date-picker/airline-day-button";
export type { AirlineCalendarContextValue } from "./airline-date-picker/airline-day-button";
export { AirlineCalendarSurface } from "./airline-date-picker/airline-calendar-surface";

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

  // Independent meaningful lowest fare per visible month
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

  // Route-aware service availability checks for entered dates
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

  // Gracefully close on mobile/desktop boundary crossing
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
              htmlFor={tripType === "oneway" ? undefined : "search-return"}
              error={tripType === "round" && isDatePairInvalid ? t("search.errReturn") : activeReturnError}
              errorId="search-return-error"
            >
              {tripType === "oneway" ? (
                <div
                  id="search-return"
                  data-slot="return-date-slot"
                  aria-disabled="true"
                  className="flex h-11 w-full items-center justify-between rounded-lg border border-input bg-muted/30 px-3.5 text-sm font-medium text-muted-foreground select-none"
                >
                  <span className="flex items-center gap-2">
                    <CalendarIcon aria-hidden="true" className="size-4 text-muted-foreground/60 shrink-0" />
                    <span className="font-medium text-muted-foreground">
                      {t("search.oneWay")}
                    </span>
                  </span>
                </div>
              ) : (
                <button
                  ref={returnTriggerRef}
                  id="search-return"
                  data-slot="return-date-slot"
                  type="button"
                  onClick={() => handleTriggerClick("return")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleTriggerClick("return");
                    }
                  }}
                  disabled={disabled}
                  aria-expanded={open && activeTarget === "return"}
                  aria-haspopup="dialog"
                  aria-invalid={isDatePairInvalid || Boolean(activeReturnError)}
                  aria-describedby={
                    isDatePairInvalid || activeReturnError ? "search-return-error" : undefined
                  }
                  className={cn(
                    "flex h-11 w-full items-center justify-between rounded-lg border border-input bg-card px-3.5 text-sm font-medium transition-colors hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring cursor-pointer select-none",
                    (isDatePairInvalid || activeReturnError) && "border-destructive focus-visible:outline-destructive",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <CalendarIcon aria-hidden="true" className="size-4 text-muted-foreground shrink-0" />
                    <span className="tabular-nums font-mono font-semibold text-foreground">
                      {returnDate
                        ? dateShort(returnDate, lang)
                        : t("search.selectDates")}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground font-mono tabular-nums">
                    {returnDate || ""}
                  </span>
                </button>
              )}
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
            <AirlineCalendarSurface
              activeTarget={activeTarget}
              setActiveTarget={setActiveTarget}
              tripType={tripType}
              departDate={departDate}
              returnDate={returnDate}
              displayMonth={displayMonth}
              setDisplayMonth={setDisplayMonth}
              numberOfMonths={numberOfMonths}
              isMobile={isMobile}
              effectiveMinDate={effectiveMinDate}
              isDatePairInvalid={isDatePairInvalid}
              activeDepartError={activeDepartError}
              activeReturnError={activeReturnError}
              activeFrom={activeFrom}
              activeTo={activeTo}
              getRouteFare={getRouteFare}
              handleSelectDate={handleSelectDate}
              handleConfirm={handleConfirm}
              isConfirmDisabled={isConfirmDisabled}
              contextValue={contextValue}
              lang={lang}
              t={t}
            />
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
            <AirlineCalendarSurface
              activeTarget={activeTarget}
              setActiveTarget={setActiveTarget}
              tripType={tripType}
              departDate={departDate}
              returnDate={returnDate}
              displayMonth={displayMonth}
              setDisplayMonth={setDisplayMonth}
              numberOfMonths={numberOfMonths}
              isMobile={isMobile}
              effectiveMinDate={effectiveMinDate}
              isDatePairInvalid={isDatePairInvalid}
              activeDepartError={activeDepartError}
              activeReturnError={activeReturnError}
              activeFrom={activeFrom}
              activeTo={activeTo}
              getRouteFare={getRouteFare}
              handleSelectDate={handleSelectDate}
              handleConfirm={handleConfirm}
              isConfirmDisabled={isConfirmDisabled}
              contextValue={contextValue}
              lang={lang}
              t={t}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
