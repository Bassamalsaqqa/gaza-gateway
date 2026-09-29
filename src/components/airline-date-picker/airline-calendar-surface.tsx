import React from "react";
import type { Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { btnClass } from "@/components/kit";
import { Calendar as DayPickerCalendar } from "@/components/ui/calendar";
import {
  AirlineCalendarContext,
  AirlineDayButton,
  type AirlineCalendarContextValue,
} from "./airline-day-button";
import { formatISOLocal, parseISOLocal } from "./date-utils";
import { DatePartsLabel } from "./date-parts-label";

export interface AirlineCalendarSurfaceProps {
  activeTarget: "depart" | "return";
  setActiveTarget: (target: "depart" | "return") => void;
  tripType: "round" | "oneway";
  departDate: string;
  returnDate: string;
  displayMonth: Date;
  setDisplayMonth: React.Dispatch<React.SetStateAction<Date>>;
  numberOfMonths: number;
  isMobile: boolean;
  effectiveMinDate: string;
  isDatePairInvalid?: boolean | undefined;
  activeDepartError?: string | undefined;
  activeReturnError?: string | undefined;
  activeFrom: string;
  activeTo: string;
  getRouteFare: (isoDate: string) => { hasService: boolean; lowestFare: number | null };
  handleSelectDate: (iso: string) => void;
  handleConfirm: () => void;
  isConfirmDisabled: boolean;
  contextValue: AirlineCalendarContextValue;
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export function AirlineCalendarSurface({
  activeTarget,
  setActiveTarget,
  tripType,
  departDate,
  returnDate,
  displayMonth,
  setDisplayMonth,
  numberOfMonths,
  isMobile,
  effectiveMinDate,
  isDatePairInvalid = false,
  activeDepartError,
  activeReturnError,
  activeFrom,
  activeTo,
  getRouteFare,
  handleSelectDate,
  handleConfirm,
  isConfirmDisabled,
  contextValue,
  lang,
  t,
}: AirlineCalendarSurfaceProps) {
  return (
    <AirlineCalendarContext.Provider value={contextValue}>
      <div className="flex flex-col">
        {/* Top Summary Tabs */}
        <div className="flex items-center gap-1.5 border-b border-border/60 pb-2 mb-2">
          <button
            type="button"
            data-tab="depart"
            onClick={() => setActiveTarget("depart")}
            aria-pressed={activeTarget === "depart"}
            className={cn(
              "flex-1 rounded-md px-2 py-1 text-start transition-colors border cursor-pointer select-none",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
              activeTarget === "depart"
                ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                : "border-border/60 bg-secondary/30 text-muted-foreground hover:bg-secondary/60",
            )}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wider">
              {t("search.depart")}
            </div>
            <div className="text-sm font-semibold text-foreground">
              {departDate ? <DatePartsLabel iso={departDate} lang={lang} /> : t("search.selectDates")}
            </div>
          </button>

          {tripType === "round" && (
            <button
              type="button"
              data-tab="return"
              onClick={() => setActiveTarget("return")}
              aria-pressed={activeTarget === "return"}
              className={cn(
                "flex-1 rounded-md px-2 py-1 text-start transition-colors border cursor-pointer select-none",
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
              <div className="text-sm font-semibold text-foreground">
                {returnDate ? <DatePartsLabel iso={returnDate} lang={lang} /> : t("search.selectDates")}
              </div>
            </button>
          )}
        </div>

        <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
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
        <div className="flex justify-center">
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
              className="p-0 select-none [--cell-size:2rem]"
              classNames={{ months: "relative flex flex-col gap-2 md:flex-row", month: "calendar-month flex w-full flex-col gap-2", week: "mt-1 flex w-full" }}
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
              className="p-0 select-none [--cell-size:2rem]"
              classNames={{ months: "relative flex flex-col gap-2 md:flex-row", month: "calendar-month flex w-full flex-col gap-2", week: "mt-1 flex w-full" }}
            />
          )}
        </div>

        {/* Footer Summary & Confirm Action */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
          <div className="flex flex-col gap-0.5">
            <span dir="ltr" className="text-xs text-muted-foreground font-mono tabular-nums">
              {departDate && tripType === "round" && returnDate
                ? `${departDate} → ${returnDate}`
                : departDate || ""}
            </span>
            <span className="text-[11px] text-muted-foreground" data-slot="calendar-currency-legend">
              {t("search.lowestFares")} · <bdi dir="ltr">USD</bdi>
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
}
