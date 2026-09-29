/**
 * CabinPicker — Gaza Gateway
 *
 * Standalone accessible cabin-class picker for the redesigned flight-search console.
 * Desktop/tablet: Radix Popover anchored to the trigger.
 * Mobile: Radix Dialog bottom sheet.
 *
 * Mirrors the structural pattern of TravellersCabinPicker for consistency.
 * Cabin options: Economy · Premium economy · Business (from cabins[] in data.ts)
 */

import React, { useId, useRef } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { ChevronDown } from "lucide-react";

import { cabins } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { CabinList } from "@/components/travellers-cabin/travellers-cabin-panel";

/* -------------------------------------------------------------------------- */
/*  Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface CabinPickerProps {
  /** Currently selected cabin id: "economy" | "premium" | "business" */
  cabin: string;
  onCabinChange: (id: string) => void;
  disabled?: boolean;
  /** id applied to the trigger button; must be stable for aria-controls */
  id?: string;
  variant?: "default" | "console";
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                              */
/* -------------------------------------------------------------------------- */

export function CabinPicker({
  cabin,
  onCabinChange,
  disabled = false,
  id = "search-cabin",
  variant = "default",
}: CabinPickerProps) {
  const { t, lang } = useI18n();
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const uid = useId();
  const panelId = `cp-${uid.replace(/:/g, "")}-panel`;

  const cabinData = cabins.find((c) => c.id === cabin);
  const cabinLabel = cabinData ? t(cabinData.label) : cabin;

  const handleClose = React.useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, []);

  // Gracefully close on mobile/desktop boundary crossing
  const prevIsMobileRef = useRef(isMobile);
  React.useEffect(() => {
    if (prevIsMobileRef.current !== undefined && prevIsMobileRef.current !== isMobile) {
      if (open) handleClose();
    }
    prevIsMobileRef.current = isMobile;
  }, [isMobile, open, handleClose]);

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
      aria-label={`${t("search.cabinClass")}: ${cabinLabel}`}
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
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("search.cabinClass")}
          </span>
          <div className="flex items-baseline justify-between gap-1.5 min-w-0 mt-0.5">
            <span className="font-bold text-foreground text-sm sm:text-base truncate">
              {cabinLabel}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-4 text-muted-foreground shrink-0 transition-transform duration-150",
                open && "rotate-180",
              )}
            />
          </div>
        </div>
      ) : (
        <>
          <span className="truncate font-semibold">{cabinLabel}</span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4 text-muted-foreground shrink-0 transition-transform duration-150",
              open && "rotate-180",
            )}
          />
        </>
      )}
    </button>
  );

  const panelContent = (
    <div id={panelId} className="w-full">
      <CabinList
        cabin={cabin}
        dir={lang === "ar" ? "rtl" : "ltr"}
        onCabinChange={(id) => {
          onCabinChange(id);
          handleClose();
        }}
        t={t}
        legendId={`${panelId}-legend`}
      />
    </div>
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
              "max-h-[70dvh] w-full rounded-t-2xl rounded-b-none border-t border-border",
              "bg-popover p-4 overflow-y-auto",
              "data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4",
              "motion-reduce:data-[state=open]:slide-in-from-bottom-0 motion-reduce:data-[state=closed]:slide-out-to-bottom-0",
            )}
            style={{ maxWidth: "100%", transform: "none" }}
          >
            <DialogTitle className="text-base font-semibold mb-3">
              {t("search.cabinClass")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("search.cabinClassDesc")}
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
            "z-50 w-52 rounded-xl border border-border bg-popover p-1.5",
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
            panel?.querySelector<HTMLElement>("[role='radio']")?.focus();
          }}
        >
          {panelContent}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
