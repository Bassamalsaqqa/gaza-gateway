/**
 * TravellersPicker — Gaza Gateway
 *
 * Standalone accessible passenger-count picker for the redesigned flight-search console.
 * Desktop/tablet: Radix Popover anchored to the trigger.
 * Mobile: Radix Dialog bottom sheet.
 *
 * Shows only the passenger stepper rows (Adults · Children · Infants) and a Done button.
 * Mirrors the structural pattern of TravellersCabinPicker for consistency.
 *
 * Passenger rules:
 *   adults: min 1, max 9
 *   children: min 0, max 8
 *   infants: min 0, max 4 AND infants ≤ adults (clamped on adult decrease)
 */

import React, { useId, useRef } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { ChevronDown, Users } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  PAX_ROWS,
  StepperRow,
} from "@/components/travellers-cabin/travellers-cabin-panel";
import { btnClass } from "@/components/kit";

/* -------------------------------------------------------------------------- */
/*  Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface TravellersPickerProps {
  adults: number;
  children: number;
  infants: number;
  onAdultsChange: (n: number) => void;
  onChildrenChange: (n: number) => void;
  onInfantsChange: (n: number) => void;
  /** Called when the picker closes (Done / Escape / outside). */
  onClose?: () => void;
  disabled?: boolean;
  /** id applied to trigger button; stable for aria-controls */
  id?: string;
  variant?: "default" | "console";
}

/* -------------------------------------------------------------------------- */
/*  Passenger summary helper                                                    */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Main component                                                              */
/* -------------------------------------------------------------------------- */

export function TravellersPicker({
  adults,
  children,
  infants,
  onAdultsChange,
  onChildrenChange,
  onInfantsChange,
  onClose,
  disabled = false,
  id = "search-travellers",
  variant = "default",
}: TravellersPickerProps) {
  const { t, lang } = useI18n();
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const uid = useId();
  const idPrefix = `tp-${uid.replace(/:/g, "")}`;
  const panelId = `${idPrefix}-panel`;

  const total = adults + children + infants;
  const paxLabel =
    total === 1
      ? t("search.passengerCountOne")
      : t("search.passengerCount", { n: total });

  const detailItems = ([
    [adults, adults === 1 ? "search.adultOne" : "search.adults"],
    [children, children === 1 ? "search.childOne" : "search.children"],
    [infants, infants === 1 ? "search.infantOne" : "search.infants"],
  ] as const).map(([count, key]) => ({ count, label: t(key).toLowerCase() }));
  const paxDetail = detailItems.map(({ count, label }) => `${count} ${label}`).join(" · ");
  const detailLine = (
    <span className="flex items-center gap-1 overflow-hidden whitespace-nowrap" data-slot="traveller-detail">
      {detailItems.map(({ count, label }, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span aria-hidden="true">·</span>}
          <span className="shrink-0"><bdi dir="ltr" className="numeral">{count}</bdi> {label}</span>
        </React.Fragment>
      ))}
    </span>
  );

  const handleClose = React.useCallback(() => {
    setOpen(false);
    onClose?.();
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, [onClose]);

  const prevIsMobileRef = useRef(isMobile);
  React.useEffect(() => {
    if (prevIsMobileRef.current !== undefined && prevIsMobileRef.current !== isMobile) {
      if (open) handleClose();
    }
    prevIsMobileRef.current = isMobile;
  }, [isMobile, open, handleClose]);

  const paxValues: Record<"adults" | "children" | "infants", number> = {
    adults,
    children,
    infants,
  };

  const onChangeFns = {
    adults: onAdultsChange,
    children: onChildrenChange,
    infants: onInfantsChange,
  };

  const effectiveMax = (key: "adults" | "children" | "infants", max: number) =>
    key === "infants" ? Math.min(max, adults) : max;

  const panelContent = (
    <div id={panelId}>
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
                if (key === "adults" && infants > next) {
                  onInfantsChange(next);
                }
              }}
              onIncrement={() => onChangeFns[key](Math.min(effMax, val + 1))}
              decrementLabel={`${t(labelKey)} −`}
              incrementLabel={`${t(labelKey)} +`}
              compact
            />
          );
        })}
      </div>
      <p className="mt-1.5 px-1 text-xs text-muted-foreground leading-snug">
        {t("search.infantNote")}
      </p>
      <div className="mt-2 px-1">
        <button
          type="button"
          onClick={handleClose}
          className={btnClass("secondary", "sm", "w-full justify-center")}
        >
          {t("search.done")}
        </button>
      </div>
    </div>
  );

  const isConsole = variant === "console";

  const triggerButton = (manualActivation: boolean) => (
    <button
      ref={triggerRef}
      type="button"
      id={id}
      disabled={disabled}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-controls={panelId}
      aria-label={`${t("search.travellers")}: ${paxLabel}, ${paxDetail}`}
      className={cn(
        isConsole
          ? "group flex flex-col items-start justify-center w-full min-h-[58px] px-2 py-1.5 text-start transition-colors rounded-lg hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring cursor-pointer select-none"
          : "flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3.5 text-sm font-medium transition-colors hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring cursor-pointer select-none",
        "disabled:pointer-events-none disabled:opacity-50",
      )}
      onClick={manualActivation ? () => setOpen((v) => !v) : undefined}
    >
      {isConsole ? (
        <div className="flex flex-col min-w-0 w-full text-start">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Users aria-hidden="true" className="size-3 text-muted-foreground/80 shrink-0" />
            <span>{t("search.travellers")}</span>
          </span>
          <div className="flex items-baseline justify-between gap-1.5 min-w-0 mt-0.5">
            <span className="font-bold text-foreground text-sm sm:text-base truncate">
              {paxLabel}
            </span>
            <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          </div>
          <span className="text-[11px] text-muted-foreground/80 truncate max-w-full">
            {detailLine}
          </span>
        </div>
      ) : (
        <span className="flex items-center gap-2 min-w-0">
          <Users aria-hidden="true" className="size-4 text-muted-foreground shrink-0" />
          <span className="flex flex-col min-w-0 text-start">
            <span className="font-semibold truncate leading-tight">{paxLabel}</span>
            <span className="text-xs text-muted-foreground truncate leading-tight">{detailLine}</span>
          </span>
        </span>
      )}
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
            closeLabel={t("common.close")}
            onCloseAutoFocus={(e) => {
              if (triggerRef.current?.isConnected) {
                e.preventDefault();
                triggerRef.current.focus();
              }
            }}
            className={cn(
              "fixed inset-x-0 bottom-0 top-auto left-0 right-0",
              "translate-x-0 translate-y-0",
              "max-h-[85dvh] w-full rounded-t-2xl rounded-b-none border-t border-border",
              "bg-popover p-4 overflow-y-auto",
              "data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4",
              "motion-reduce:data-[state=open]:slide-in-from-bottom-0 motion-reduce:data-[state=closed]:slide-out-to-bottom-0",
            )}
            style={{ maxWidth: "100%", transform: "none" }}
          >
            <DialogTitle className="text-base font-semibold mb-3">
              {t("search.travellers")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("search.travellersDesc")}
            </DialogDescription>
            {panelContent}
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
        if (!v) handleClose();
        else setOpen(true);
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        {triggerButton(false)}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={lang === "ar" ? "end" : "start"}
          sideOffset={6}
          className={cn(
            "z-50 w-64 rounded-xl border border-border bg-popover p-2.5",
            "shadow-[var(--shadow-lift)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
            "origin-(--radix-popover-content-transform-origin)",
            "motion-reduce:transition-none",
          )}
          onCloseAutoFocus={(e) => {
            if (triggerRef.current?.isConnected) {
              e.preventDefault();
              triggerRef.current.focus();
            }
          }}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const panel = document.getElementById(panelId);
            panel?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
          }}
        >
          {panelContent}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
