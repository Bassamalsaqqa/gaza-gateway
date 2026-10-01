import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";

import { isFlightBookable, todayISO } from "@/lib/data";
import { dateParts, dateShort } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useFlightSearchQuery, useMonthlyFlightServiceQuery } from "@/lib/repositories";
import type { MonthlyDayService } from "@/lib/repositories/types";
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
import { DatePartsLabel } from "./airline-date-picker/date-parts-label";

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
  variant?: "default" | "console" | undefined;
  paxCount?: number | undefined;
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
  variant = "default",
  paxCount = 1,
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
        setNumberOfMonths(window.innerWidth >= 1280 && tripType === "round" ? 2 : 1);
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
  const isNetworkValid = (origin === "GZA" || destination === "GZA") && origin !== destination;

  const year1 = displayMonth.getFullYear();
  const month1 = displayMonth.getMonth() + 1;
  const nextMonthDate = new Date(year1, month1, 1);
  const year2 = nextMonthDate.getFullYear();
  const month2 = nextMonthDate.getMonth() + 1;

  // Monthly service queries for outbound and inbound
  const { data: outMonth1 } = useMonthlyFlightServiceQuery(
    origin,
    destination,
    year1,
    month1,
    { paxCount },
    { enabled: open && isNetworkValid },
  );
  const { data: outMonth2 } = useMonthlyFlightServiceQuery(
    origin,
    destination,
    year2,
    month2,
    { paxCount },
    { enabled: open && isNetworkValid && numberOfMonths >= 2 },
  );

  const { data: inMonth1 } = useMonthlyFlightServiceQuery(
    destination,
    origin,
    year1,
    month1,
    { paxCount },
    { enabled: open && isNetworkValid && tripType === "round" },
  );
  const { data: inMonth2 } = useMonthlyFlightServiceQuery(
    destination,
    origin,
    year2,
    month2,
    { paxCount },
    { enabled: open && isNetworkValid && numberOfMonths >= 2 && tripType === "round" },
  );

  const outboundServices = useMemo(() => {
    const map: Record<string, MonthlyDayService> = {};
    if (outMonth1) Object.assign(map, outMonth1);
    if (outMonth2) Object.assign(map, outMonth2);
    return map;
  }, [outMonth1, outMonth2]);

  const inboundServices = useMemo(() => {
    const map: Record<string, MonthlyDayService> = {};
    if (inMonth1) Object.assign(map, inMonth1);
    if (inMonth2) Object.assign(map, inMonth2);
    return map;
  }, [inMonth1, inMonth2]);

  const activeServices = activeTarget === "depart" ? outboundServices : inboundServices;

  const effectiveMinDate = activeTarget === "return" && departDate
    ? departDate > (minDate || todayISO()) ? departDate : (minDate || todayISO())
    : (minDate || todayISO());

  const getRouteFare = useCallback(
    (isoDate: string) => {
      const day = activeServices[isoDate];
      if (day && day.hasService) {
        return { hasService: true, lowestFare: day.lowestFare };
      }
      return { hasService: false, lowestFare: null };
    },
    [activeServices],
  );

  const getDepartFare = useCallback(
    (isoDate: string) => {
      const day = outboundServices[isoDate];
      if (day && day.hasService) {
        return { hasService: true, lowestFare: day.lowestFare };
      }
      return { hasService: false, lowestFare: null };
    },
    [outboundServices],
  );

  const getMinFareForMonth = useCallback(
    (year: number, monthZeroIndexed: number): number | null => {
      const monthStr = String(monthZeroIndexed + 1).padStart(2, "0");
      const prefix = `${year}-${monthStr}-`;
      const fares: number[] = [];
      for (const [dateStr, info] of Object.entries(activeServices)) {
        if (
          dateStr.startsWith(prefix) &&
          dateStr >= effectiveMinDate &&
          info.hasService &&
          info.lowestFare !== null
        ) {
          fares.push(info.lowestFare);
        }
      }
      return fares.length > 1 ? Math.min(...fares) : null;
    },
    [activeServices, effectiveMinDate],
  );

  // Route-aware service availability checks for entered dates using effective flight queries
  const { data: departDateFlights, isLoading: isDepartLoading } = useFlightSearchQuery(
    origin,
    destination,
    departDate,
    { paxCount },
    { enabled: Boolean(departDate && isNetworkValid) },
  );

  const { data: returnDateFlights, isLoading: isReturnLoading } = useFlightSearchQuery(
    destination,
    origin,
    returnDate,
    { paxCount },
    { enabled: Boolean(tripType === "round" && returnDate && isNetworkValid) },
  );

  const hasDepartService =
    !departDate ||
    !isNetworkValid ||
    isDepartLoading ||
    (departDateFlights ? departDateFlights.length > 0 : true);

  const hasReturnService =
    tripType !== "round" ||
    !returnDate ||
    !isNetworkValid ||
    isReturnLoading ||
    (returnDateFlights ? returnDateFlights.length > 0 : true);

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

  const isConsole = variant === "console";
  const departParts = useMemo(() => dateParts(departDate, lang), [departDate, lang]);
  const returnParts = useMemo(() => dateParts(returnDate, lang), [returnDate, lang]);

  return (
    <div className={cn("md:col-span-2 lg:col-span-2", className)}>
      <Popover open={!isMobile && open} onOpenChange={(val) => { if (!val) handleClose(); }}>
        <PopoverAnchor asChild>
          {isConsole ? (
            <div className={cn("grid gap-1 sm:gap-2 w-full min-w-0", tripType === "oneway" ? "grid-cols-1" : "grid-cols-2")}>
              {/* Departure Trigger */}
              <button
                ref={departTriggerRef}
                id="search-depart"
                type="button"
                title={departDate || undefined}
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
                  "group flex flex-col items-start justify-center w-full min-h-[58px] px-1.5 py-1 sm:px-2 sm:py-1.5 text-start transition-colors rounded-lg hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring cursor-pointer select-none",
                  activeDepartError && "border border-destructive focus-visible:outline-destructive",
                )}
              >
                <span className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                  <CalendarIcon aria-hidden="true" className="size-3 text-muted-foreground/80 shrink-0" />
                  <span>{t("search.depart")}</span>
                </span>
                <div className="flex flex-col items-start min-w-0 mt-0.5">
                  <span className="text-base sm:text-lg xl:text-xl font-bold text-foreground tracking-tight">
                    {departParts ? <DatePartsLabel iso={departDate} lang={lang} /> : t("search.selectDates")}
                  </span>
                  {departParts ? (
                    <span
                      data-slot="date-weekday"
                      className="text-[11px] sm:text-xs text-muted-foreground font-medium truncate max-w-full block"
                    >
                      {departParts.weekday}
                    </span>
                  ) : null}
                </div>
              </button>

              {/* Return Trigger — omitted from layout when oneway */}
              {tripType === "round" && (
                <button
                  ref={returnTriggerRef}
                  id="search-return"
                  data-slot="return-date-slot"
                  type="button"
                  title={returnDate || undefined}
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
                    "group flex flex-col items-start justify-center w-full min-h-[58px] px-1.5 py-1 sm:px-2 sm:py-1.5 text-start transition-colors rounded-lg hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring cursor-pointer select-none",
                    (isDatePairInvalid || activeReturnError) && "border border-destructive focus-visible:outline-destructive",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                    <CalendarIcon aria-hidden="true" className="size-3 text-muted-foreground/80 shrink-0" />
                    <span>{t("search.return")}</span>
                  </span>
                  <div className="flex flex-col items-start min-w-0 mt-0.5">
                    <span className="text-base sm:text-lg xl:text-xl font-bold text-foreground tracking-tight">
                      {returnParts ? <DatePartsLabel iso={returnDate} lang={lang} /> : t("search.selectDates")}
                    </span>
                    {returnParts ? (
                      <span
                        data-slot="date-weekday"
                        className="text-[11px] sm:text-xs text-muted-foreground font-medium truncate max-w-full block"
                      >
                        {returnParts.weekday}
                      </span>
                    ) : null}
                  </div>
                </button>
              )}
            </div>
          ) : (
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
                  title={departDate || undefined}
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
                    title={returnDate || undefined}
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
                  </button>
                )}
              </Field>
            </div>
          )}
        </PopoverAnchor>

        {/* Desktop Popover Surface */}
        {!isMobile && (
          <PopoverContent
            align={lang === "ar" ? "end" : "start"}
            sideOffset={8}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              lastDateTriggerRef.current?.focus();
            }}
            className="w-auto p-2.5 max-w-[calc(100vw-2rem)] shadow-[var(--shadow-lift)] rounded-xl border-border bg-card z-50"
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
            className="fixed inset-x-0 bottom-0 top-auto w-full max-h-[92dvh] flex flex-col p-1.5 sm:p-3 rounded-t-2xl rounded-b-none border-border bg-card shadow-2xl overflow-y-auto z-50 duration-200"
            style={{ maxWidth: "100%", translate: "none", animation: "none" }}
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
