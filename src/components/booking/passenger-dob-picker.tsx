import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { dateLong } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

export interface PassengerDobPickerProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  passengerType?: "adult" | "child" | "infant" | undefined;
  ariaInvalid?: boolean | undefined;
  ariaDescribedBy?: string | undefined;
  disabled?: boolean | undefined;
  required?: boolean | undefined;
  className?: string | undefined;
}

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

export function PassengerDobPicker({
  id,
  value,
  onChange,
  passengerType = "adult",
  ariaInvalid,
  ariaDescribedBy,
  disabled = false,
  required = false,
  className,
}: PassengerDobPickerProps) {
  const { t, lang } = useI18n();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousIsMobileRef = useRef(isMobile);

  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const startMonth = useMemo(() => new Date(currentYear - 120, 0), [currentYear]);
  const endMonth = today;

  const parsedDate = useMemo(() => parseISOLocal(value), [value]);

  const defaultMonthForPassengerType = useMemo(() => {
    const m = today.getMonth();
    if (passengerType === "infant") return new Date(currentYear - 1, m);
    if (passengerType === "child") return new Date(currentYear - 7, m);
    return new Date(currentYear - 30, m);
  }, [passengerType, currentYear, today]);

  const [activeMonth, setActiveMonth] = useState<Date>(
    () => parsedDate || defaultMonthForPassengerType,
  );

  // Sync active month when opening or when value changes
  useEffect(() => {
    if (open) {
      setActiveMonth(parsedDate || defaultMonthForPassengerType);
    }
  }, [open, parsedDate, defaultMonthForPassengerType]);

  useEffect(() => {
    if (previousIsMobileRef.current !== isMobile && open) {
      setOpen(false);
    }
    previousIsMobileRef.current = isMobile;
  }, [isMobile, open]);

  const formattedDate = useMemo(() => {
    if (!parsedDate) return "";
    return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(parsedDate);
  }, [parsedDate, lang]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const handleDateSelect = useCallback(
    (date: Date | undefined) => {
      if (date) {
        onChange(formatISOLocal(date));
        handleClose();
        // Restore focus to trigger button
        setTimeout(() => {
          triggerRef.current?.focus();
        }, 50);
      }
    },
    [onChange, handleClose],
  );

  const calendarContent = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-border/80 pb-2 px-1">
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("book.dob")}
          </span>
          {value && parsedDate ? (
            <span className="text-sm font-bold text-foreground tabular-nums">
              {formattedDate}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {t("book.selectDob")}
            </span>
          )}
        </div>
        {value ? (
          <span dir="ltr" className="code-id font-mono text-xs text-muted-foreground shrink-0">
            {value}
          </span>
        ) : null}
      </div>

      <Calendar
        mode="single"
        captionLayout="dropdown"
        startMonth={startMonth}
        endMonth={endMonth}
        disabled={{ after: today }}
        selected={parsedDate}
        month={activeMonth}
        onMonthChange={setActiveMonth}
        onSelect={handleDateSelect}
        dir={lang === "ar" ? "rtl" : "ltr"}
        formatters={{
          formatDay: (d) => String(d.getDate()),
          formatYearCaption: (d) => String(d.getFullYear()),
          formatYearDropdown: (d) => String(d.getFullYear()),
          formatMonthCaption: (d) =>
            new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", {
              month: "long",
              year: "numeric",
            }).format(d),
          formatMonthDropdown: (d) =>
            new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en", {
              month: "long",
            }).format(d),
          formatWeekdayName: (d) =>
            new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", {
              weekday: "short",
            }).format(d),
        }}
        labels={{
          labelDayButton: (date, modifiers) => {
            const parts = [dateLong(formatISOLocal(date), lang)];
            if (modifiers["today"]) parts.push(t("book.dateToday"));
            if (modifiers["selected"]) parts.push(t("book.dateSelected"));
            if (modifiers["disabled"]) parts.push(t("book.dateUnavailable"));
            return parts.join(lang === "ar" ? "، " : ", ");
          },
          labelMonthDropdown: () => t("book.selectMonth"),
          labelYearDropdown: () => t("book.selectYear"),
          labelNext: () => t("book.nextMonth"),
          labelPrevious: () => t("book.prevMonth"),
        }}
        classNames={{
          dropdowns: "flex h-9 w-full items-center justify-center gap-2 text-sm font-medium",
          dropdown_root:
            "relative rounded-lg border border-border/80 bg-background/60 hover:bg-secondary/40 transition-colors shadow-xs",
          dropdown: "absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10",
          caption_label:
            "flex h-9 items-center gap-1.5 px-2.5 text-sm font-semibold [&>svg]:size-3.5 [&>svg]:text-muted-foreground",
        }}
        className="p-0 select-none"
      />
    </div>
  );

  const triggerButton = (
    <button
      ref={triggerRef}
      id={id}
      type="button"
      onClick={() => setOpen((prev) => !prev)}
      disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      aria-required={required}
      className={cn(
        "flex h-11 w-full items-center justify-between rounded-lg border border-input bg-card px-3 text-sm font-medium transition-colors",
        "hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring cursor-pointer select-none",
        ariaInvalid && "border-destructive focus-visible:outline-destructive ring-destructive/20 ring-1",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <span className="flex items-center gap-2 min-w-0">
        <CalendarIcon aria-hidden="true" className="size-4 text-muted-foreground shrink-0" />
        <span
          className={cn(
            "truncate",
            !value && "text-muted-foreground font-normal",
            value && "tabular-nums text-foreground",
          )}
        >
          {value ? formattedDate : t("book.selectDob")}
        </span>
      </span>
      {value ? (
        <span dir="ltr" className="code-id font-mono text-xs text-muted-foreground shrink-0">
          {value}
        </span>
      ) : (
        <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground/70 shrink-0" />
      )}
    </button>
  );

  return (
    <>
      {/* Desktop / Tablet Popover */}
      {!isMobile ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverAnchor asChild>{triggerButton}</PopoverAnchor>
          <PopoverContent
            align="start"
            sideOffset={6}
            className="w-auto p-4 rounded-xl border border-border bg-popover shadow-[var(--shadow-lift)] z-50 overflow-hidden"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              triggerRef.current?.focus();
            }}
          >
            {calendarContent}
          </PopoverContent>
        </Popover>
      ) : (
        /* Mobile Dialog */
        <>
          {triggerButton}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent
              closeLabel={t("common.close")}
              className="fixed inset-x-0 bottom-0 top-auto sm:top-[50%] sm:bottom-auto sm:left-[50%] sm:-translate-x-1/2 sm:-translate-y-1/2 w-full max-w-sm flex flex-col p-4 rounded-t-2xl sm:rounded-2xl border-border bg-card shadow-2xl z-50 duration-200"
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                triggerRef.current?.focus();
              }}
            >
              <DialogTitle className="text-base font-bold">{t("book.dob")}</DialogTitle>
              <DialogDescription className="sr-only">{t("book.selectDob")}</DialogDescription>
              {calendarContent}
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  );
}
