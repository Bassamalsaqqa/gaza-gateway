/**
 * TravellersCabinPicker — Gaza Gateway
 *
 * A controlled, accessible combination picker for passenger counts and cabin class.
 * Desktop/tablet: Radix Popover anchored to the trigger.
 * Mobile: Radix Dialog bottom sheet.
 *
 * Passenger rules preserved:
 *   adults: min 1, max 9
 *   children: min 0, max 8
 *   infants: min 0, max 4 AND infants <= adults (clamped on adult decrease)
 *
 * Refactored into orchestrator + TravellersCabinPanel family.
 */

import React, { useId, useRef } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Users } from "lucide-react";

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
  TravellersCabinPanel,
  triggerSummary,
  type TravellersCabinPanelProps,
} from "./travellers-cabin/travellers-cabin-panel";

export type { TravellersCabinPanelProps };

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

  const sharedPanelProps: TravellersCabinPanelProps = {
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
            <TravellersCabinPanel {...sharedPanelProps} />
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
          <TravellersCabinPanel {...sharedPanelProps} />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
