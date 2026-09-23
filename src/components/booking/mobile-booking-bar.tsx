import { useState } from "react";
import { ArrowRight, ChevronUp } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { PriceSummary } from "@/components/booking/price-summary";
import { money } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { paxCount, type Draft } from "@/lib/store";
import { cn } from "@/lib/utils";

export interface MobileBookingBarProps {
  draft: Draft;
  totals: { fare: number; taxes: number; extras: number; total: number };
  className?: string;
}

export function MobileBookingBar({ draft, totals, className }: MobileBookingBarProps) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);

  const paxTotal = paxCount(draft.criteria);

  return (
    <>
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur-md shadow-[var(--shadow-lift)] lg:hidden",
          "px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3">
          {/* Trip Itinerary Context */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                <span dir="ltr">{draft.criteria.origin}</span>
                <ArrowRight aria-hidden="true" className="size-3 rtl:rotate-180 text-muted-foreground shrink-0" />
                <span dir="ltr">{draft.criteria.destination}</span>
              </span>
              <span>·</span>
              <span>
                {paxTotal === 1
                  ? t("search.passengerCountOne")
                  : t("search.passengerCount", { n: paxTotal })}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 text-xs font-semibold text-brand-deep hover:underline cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              aria-label={t("book.viewBreakdown")}
              data-testid="mobile-booking-breakdown-trigger"
            >
              <span>{t("book.viewBreakdown")}</span>
              <ChevronUp aria-hidden="true" className="size-3.5" />
            </button>
          </div>

          {/* Running Total & Breakdown Trigger */}
          <div className="shrink-0 text-end">
            <span className="block text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("book.total")}
            </span>
            <span className="text-lg font-bold text-foreground tabular-nums">
              {money(totals.total, lang)}
            </span>
          </div>
        </div>
      </div>

      {/* Accessible Price Breakdown Sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="text-start">
            <SheetTitle className="text-lg font-bold text-foreground">
              {t("book.summary")}
            </SheetTitle>
            <SheetDescription className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span dir="ltr">{draft.criteria.origin}</span>
                <ArrowRight aria-hidden="true" className="size-3 rtl:rotate-180 text-muted-foreground shrink-0" />
                <span dir="ltr">{draft.criteria.destination}</span>
              </span>
              {draft.outbound ? (
                <span>
                  · <span dir="ltr" className="code-id">{draft.outbound.number}</span>
                </span>
              ) : null}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <PriceSummary draft={draft} compact={false} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
