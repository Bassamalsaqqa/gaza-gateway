/**
 * TravellersCabinPicker — Gaza Gateway Batch 2C
 *
 * A controlled, accessible combination picker for passenger counts and cabin class.
 * Desktop/tablet: Radix Popover anchored to the trigger.
 * Mobile: Radix Dialog bottom sheet (Gaza/Airline pattern established in Batch 2B).
 *
 * Passenger rules preserved exactly from FlightSearchForm:
 *   adults: min 1, max 9
 *   children: min 0, max 8
 *   infants: min 0, max 4  AND  infants <= adults (clamped on adult decrease)
 *
 * Cabin: Radix RadioGroup in stacked-list treatment.
 */

import React, { useId, useRef } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Users } from "lucide-react";

import type { CabinId } from "@/lib/data";
import { cabins } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { btnClass } from "@/components/kit";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";

/* -------------------------------------------------------------------------- */
/*  Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface TravellersCabinPickerProps {
  adults: number;
  children: number;
  infants: number;
  cabin: string;
  onAdultsChange: (n: number) => void;
  onChildrenChange: (n: number) => void;
  onInfantsChange: (n: number) => void;
  onCabinChange: (id: string) => void;
  /** Called when the picker closes (Done / Escape / outside). */
  onClose?: () => void;
  disabled?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                   */
/* -------------------------------------------------------------------------- */

const PAX_ROWS = [
  {
    key: "adults" as const,
    labelKey: "search.adults",
    descKey: "search.adultsDesc",
    min: 1,
    max: 9,
  },
  {
    key: "children" as const,
    labelKey: "search.children",
    descKey: "search.childrenDesc",
    min: 0,
    max: 8,
  },
  {
    key: "infants" as const,
    labelKey: "search.infants",
    descKey: "search.infantsDesc",
    min: 0,
    max: 4,
  },
] as const;

/* -------------------------------------------------------------------------- */
/*  Stepper row                                                                 */
/* -------------------------------------------------------------------------- */

interface StepperRowProps {
  labelId: string;
  descId: string;
  label: string;
  desc: string;
  value: number;
  min: number;
  effectiveMax: number;
  onDecrement: () => void;
  onIncrement: () => void;
  decrementLabel: string;
  incrementLabel: string;
}

function StepperRow({
  labelId,
  descId,
  label,
  desc,
  value,
  min,
  effectiveMax,
  onDecrement,
  onIncrement,
  decrementLabel,
  incrementLabel,
}: StepperRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex-1 min-w-0">
        <div id={labelId} className="text-sm font-semibold leading-tight">
          {label}
        </div>
        <div id={descId} className="text-xs text-muted-foreground mt-0.5 leading-snug">
          {desc}
        </div>
      </div>
      {/* Stepper group – labelled by the row label */}
      <div
        role="group"
        aria-labelledby={labelId}
        className="flex items-center gap-2 shrink-0"
      >
        <button
          type="button"
          onClick={onDecrement}
          disabled={value <= min}
          aria-label={decrementLabel}
          className={cn(
            "flex items-center justify-center rounded-lg border border-input bg-card",
            "text-base font-semibold leading-none",
            "transition-colors hover:bg-secondary",
            "disabled:opacity-40 disabled:hover:bg-card disabled:cursor-not-allowed",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            /* ≥ 44×44 CSS-px touch target */
            "size-11",
          )}
        >
          −
        </button>
        <span
          className="numeral w-8 text-center font-mono text-sm font-bold tabular-nums"
          aria-live="polite"
          aria-atomic="true"
          aria-label={`${label}: ${value}`}
        >
          {value}
        </span>
        <button
          type="button"
          onClick={onIncrement}
          disabled={value >= effectiveMax}
          aria-label={incrementLabel}
          className={cn(
            "flex items-center justify-center rounded-lg border border-input bg-card",
            "text-base font-semibold leading-none",
            "transition-colors hover:bg-secondary",
            "disabled:opacity-40 disabled:hover:bg-card disabled:cursor-not-allowed",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            "size-11",
          )}
        >
          +
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Cabin list (RadioGroup stacked list)                                        */
/* -------------------------------------------------------------------------- */

interface CabinListProps {
  cabin: string;
  onCabinChange: (id: string) => void;
  t: (key: string) => string;
  legendId: string;
}

function CabinList({ cabin, onCabinChange, t, legendId }: CabinListProps) {
  return (
    <div>
      <div
        id={legendId}
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5"
      >
        {t("search.cabin")}
      </div>
      <RadioGroupPrimitive.Root
        value={cabin}
        onValueChange={onCabinChange}
        aria-labelledby={legendId}
        className="flex flex-col divide-y divide-border rounded-lg border border-border overflow-hidden"
      >
        {cabins.map((c) => (
          <RadioGroupPrimitive.Item
            key={c.id}
            value={c.id}
            id={`pax-cabin-${c.id}`}
            className={cn(
              "group flex w-full items-center gap-3 px-3.5 py-3",
              "text-sm font-medium text-start cursor-pointer",
              "transition-colors duration-100",
              "hover:bg-secondary/60",
              "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
              "data-[state=checked]:bg-brand-soft/30 data-[state=checked]:text-brand-deep",
            )}
          >
            {/* Visual radio indicator */}
            <span
              aria-hidden="true"
              className={cn(
                "flex-shrink-0 size-4 rounded-full border-2 flex items-center justify-center transition-colors",
                "border-muted-foreground",
                "group-data-[state=checked]:border-primary",
              )}
            >
              <RadioGroupPrimitive.Indicator asChild>
                <span className="block size-2 rounded-full bg-primary" />
              </RadioGroupPrimitive.Indicator>
            </span>
            <span className="flex-1 select-none">
              {t(c.label)}
            </span>
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Inner panel content (shared between Popover and Dialog)                    */
/* -------------------------------------------------------------------------- */

interface PanelContentProps {
  adults: number;
  children: number;
  infants: number;
  cabin: string;
  onAdultsChange: (n: number) => void;
  onChildrenChange: (n: number) => void;
  onInfantsChange: (n: number) => void;
  onCabinChange: (id: string) => void;
  onDone: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  idPrefix: string;
}

function PanelContent({
  adults,
  children: childrenCount,
  infants,
  cabin,
  onAdultsChange,
  onChildrenChange,
  onInfantsChange,
  onCabinChange,
  onDone,
  t,
  idPrefix,
}: PanelContentProps) {
  const paxValues: Record<"adults" | "children" | "infants", number> = {
    adults,
    children: childrenCount,
    infants,
  };

  const onChangeFns = {
    adults: onAdultsChange,
    children: onChildrenChange,
    infants: onInfantsChange,
  };

  const effectiveMax = (key: "adults" | "children" | "infants", max: number) =>
    key === "infants" ? Math.min(max, adults) : max;

  const legendId = `${idPrefix}-cabin-legend`;

  return (
    <div className="flex flex-col gap-0">
      {/* Passenger stepper rows */}
      <div className="divide-y divide-border/60 px-1">
        {PAX_ROWS.map(({ key, labelKey, descKey, min, max }) => {
          const labelId = `${idPrefix}-${key}-label`;
          const descId = `${idPrefix}-${key}-desc`;
          const val = paxValues[key];
          const effMax = effectiveMax(key, max);
          return (
            <StepperRow
              key={key}
              labelId={labelId}
              descId={descId}
              label={t(labelKey)}
              desc={t(descKey)}
              value={val}
              min={min}
              effectiveMax={effMax}
              onDecrement={() => {
                const next = Math.max(min, val - 1);
                onChangeFns[key](next);
                // Clamp infants if adults decreased
                if (key === "adults" && infants > next) {
                  onInfantsChange(next);
                }
              }}
              onIncrement={() => onChangeFns[key](Math.min(effMax, val + 1))}
              decrementLabel={`${t(labelKey)} −`}
              incrementLabel={`${t(labelKey)} +`}
            />
          );
        })}
      </div>

      {/* Infant note */}
      <p className="mt-2 px-1 text-xs text-muted-foreground leading-snug">
        {t("search.infantNote")}
      </p>

      {/* Cabin */}
      <div className="mt-4 px-1">
        <CabinList
          cabin={cabin}
          onCabinChange={onCabinChange}
          t={t}
          legendId={legendId}
        />
      </div>

      {/* Done button */}
      <div className="mt-4 px-1">
        <button
          type="button"
          onClick={onDone}
          className={btnClass("secondary", "sm", "w-full justify-center")}
        >
          {t("search.done")}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Trigger summary                                                              */
/* -------------------------------------------------------------------------- */

function triggerSummary(
  t: (key: string, vars?: Record<string, string | number>) => string,
  total: number,
  cabin: string,
): string {
  const paxLabel =
    total === 1 ? t("search.passengerCountOne") : t("search.passengerCount", { n: total });
  const cabinData = cabins.find((c) => c.id === cabin);
  const cabinLabel = cabinData ? t(cabinData.label) : cabin;
  return `${paxLabel} · ${cabinLabel}`;
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                              */
/* -------------------------------------------------------------------------- */

export function TravellersCabinPicker({
  adults,
  children,
  infants,
  cabin,
  onAdultsChange,
  onChildrenChange,
  onInfantsChange,
  onCabinChange,
  onClose,
  disabled = false,
}: TravellersCabinPickerProps) {
  const { t, lang } = useI18n();
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const uid = useId();
  const idPrefix = `tcp-${uid.replace(/:/g, "")}`;

  const total = adults + children + infants;
  const summary = triggerSummary(t, total, cabin);

  const handleClose = React.useCallback(() => {
    setOpen(false);
    onClose?.();
    // Restore focus to trigger after the primitive has finished its close sequence
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, [onClose]);

  // Gracefully close on mobile/desktop boundary crossing to prevent stale portals or locks
  const prevIsMobileRef = useRef(isMobile);
  React.useEffect(() => {
    if (prevIsMobileRef.current !== undefined && prevIsMobileRef.current !== isMobile) {
      if (open) {
        handleClose();
      }
    }
    prevIsMobileRef.current = isMobile;
  }, [isMobile, open, handleClose]);

  const sharedPanelProps: PanelContentProps = {
    adults,
    children,
    infants,
    cabin,
    onAdultsChange,
    onChildrenChange,
    onInfantsChange,
    onCabinChange,
    onDone: handleClose,
    t,
    idPrefix,
  };

  /* Desktop activation belongs to Radix. The mobile trigger sits outside DialogTrigger. */
  const triggerButton = (manualActivation: boolean) => (
    <button
      ref={triggerRef}
      type="button"
      id="search-travellers"
      disabled={disabled}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-controls={`${idPrefix}-panel`}
      aria-label={summary}
      className={cn(
        "flex h-11 w-full items-center justify-between gap-2",
        "rounded-lg border border-input bg-card px-3.5",
        "text-sm font-medium",
        "transition-colors hover:bg-secondary/40",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        "cursor-pointer select-none",
      )}
      onClick={manualActivation ? () => setOpen((v) => !v) : undefined}
    >
      <span className="flex items-center gap-2 min-w-0">
        <Users aria-hidden="true" className="size-4 text-muted-foreground shrink-0" />
        <span className="truncate">{summary}</span>
      </span>
    </button>
  );

  if (isMobile) {
    return (
      <>
        {triggerButton(true)}
        <Dialog
          open={open}
          onOpenChange={(v) => {
            if (!v) handleClose();
            else setOpen(true);
          }}
        >
          <DialogContent
            id={`${idPrefix}-panel`}
            closeLabel={t("common.close")}
            onCloseAutoFocus={(e) => {
              if (triggerRef.current && triggerRef.current.isConnected) {
                e.preventDefault();
                triggerRef.current.focus();
              }
            }}
            className={cn(
              /* Bottom sheet: fixed bottom, full width, tall max, no center transform */
              "fixed inset-x-0 bottom-0 top-auto left-0 right-0",
              "translate-x-0 translate-y-0",
              "max-h-[85dvh] w-full rounded-t-2xl rounded-b-none border-t border-border",
              "bg-popover p-4 overflow-y-auto",
              "data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4",
              "motion-reduce:data-[state=open]:slide-in-from-bottom-0 motion-reduce:data-[state=closed]:slide-out-to-bottom-0",
            )}
            /* Remove the default centering classes from the base DialogContent */
            style={{ maxWidth: "100%", transform: "none" }}
          >
            <DialogTitle className="text-base font-semibold mb-3">
              {t("search.travellersAndCabin")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("search.travellersAndCabinDesc")}
            </DialogDescription>
            <PanelContent {...sharedPanelProps} />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  /* Desktop / tablet: Popover */
  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          handleClose();
        } else {
          setOpen(true);
        }
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        {triggerButton(false)}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          id={`${idPrefix}-panel`}
          align={lang === "ar" ? "end" : "start"}
          sideOffset={6}
          className={cn(
            "z-50 w-80 rounded-xl border border-border bg-popover p-4",
            "shadow-[var(--shadow-lift)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
            "origin-(--radix-popover-content-transform-origin)",
            "motion-reduce:transition-none",
          )}
          onCloseAutoFocus={(e) => {
            if (triggerRef.current && triggerRef.current.isConnected) {
              e.preventDefault();
              triggerRef.current.focus();
            }
          }}
          /* Keep focus inside until the user explicitly closes */
          onOpenAutoFocus={(e) => {
            // Let Radix handle the first-focus, but prevent page scroll
            e.preventDefault();
            const panel = document.getElementById(`${idPrefix}-panel`);
            const first = panel?.querySelector<HTMLElement>(
              "button:not([disabled]), input:not([disabled])",
            );
            first?.focus();
          }}
        >
          <PanelContent {...sharedPanelProps} />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
