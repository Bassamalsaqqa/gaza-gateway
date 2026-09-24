import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { ArrowRight, Check, ChevronDown, ChevronUp, Luggage, Ticket } from "lucide-react";
import { useMemo, useState } from "react";
import type { Fare } from "@/lib/data";
import { money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  useSurfaceRecipe,
  ACCENT_RAIL_CLASSES,
  RADIUS_CLASSES,
  ELEVATION_CLASSES,
  TONE_CLASSES,
  SurfaceIndex,
} from "@/design/surfaces";

export interface FareOptionProps {
  fare: Fare;
  price: number;
  selected?: boolean;
  className?: string;
}

export function FareOption({ fare, price, selected = false, className }: FareOptionProps) {
  const { t, lang } = useI18n();
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const accessibleName = useMemo(() => {
    const localizedName = pick(lang, fare.name);
    const priceStr = money(price, lang);
    const perPassengerStr = t("book.perPassenger");
    const recommendedStr = fare.highlight ? t("book.fareRecommendedTag") : "";
    const bagsStr =
      fare.checkedBags === 0
        ? t("book.cabinBagOnly")
        : t("book.checkedBagsCount", { n: fare.checkedBags });
    const seatSelectionStr = pick(lang, fare.seatSelection);
    const changesStr = pick(lang, fare.changes);
    const refundStr = pick(lang, fare.refund);

    return t("book.fareOptionAria", {
      name: localizedName,
      price: priceStr,
      perPassenger: perPassengerStr,
      recommended: recommendedStr,
      bags: bagsStr,
      seatSelection: seatSelectionStr,
      changes: changesStr,
      refund: refundStr,
    });
  }, [fare, price, lang, t]);

  const bagsLabel =
    fare.checkedBags === 0
      ? t("book.cabinBagOnly")
      : t("book.checkedBagsCount", { n: fare.checkedBags });

  const { active, recipe } = useSurfaceRecipe("fare", "booking.fare-option");
  const fareIndex = fare.id === "essential" ? "01" : fare.id === "classic" ? "02" : "03";

  return (
    <div
      data-surface-target="booking.fare-option"
      data-surface-family={active ? "fare" : undefined}
      data-surface-frame={active ? recipe.frame : undefined}
      data-surface-tone={active ? recipe.tone : undefined}
      className={cn(
        "relative flex flex-col justify-between border p-4 sm:p-5 text-start transition-all duration-150 h-full",
        active
          ? [
              TONE_CLASSES[recipe.tone].bg,
              TONE_CLASSES[recipe.tone].text,
              TONE_CLASSES[recipe.tone].border,
              RADIUS_CLASSES[recipe.radius],
              ELEVATION_CLASSES[recipe.elevation],
              (recipe.frame === "rail" || recipe.frame === "indexed") && [
                recipe.frame === "rail" ? "border-s-[4px]" : "border-s-[5px]",
                ACCENT_RAIL_CLASSES[recipe.accent],
              ],
              selected
                ? "border-primary ring-2 ring-primary/40 bg-surface-olive-soft"
                : "hover:border-primary/50",
            ]
          : [
              "rounded-xl border-border bg-card",
              selected
                ? "border-primary ring-2 ring-primary/30 shadow-xs"
                : "hover:border-primary/50 hover:bg-card/95",
              fare.highlight && !selected && "border-primary/30",
            ],
        className,
      )}
    >
      {/* Localized brand tint overlay over opaque card base when selected (baseline only) */}
      {!active && selected ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-xl bg-brand-soft/25"
        />
      ) : null}
      <RadioGroupPrimitive.Item
        value={fare.id}
        id={`fare-option-${fare.id}`}
        aria-label={accessibleName}
        className={cn(
          "group w-full text-start cursor-pointer select-none rounded-lg outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <div>
          {/* Header with Title, Recommended Tag, and Radio Indicator */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {fare.highlight ? (
                <span className="mb-1.5 inline-block rounded-full bg-clay-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent-foreground">
                  {t("book.recommended")}
                </span>
              ) : null}
              {active ? (
                <div className="flex items-center gap-2">
                  <SurfaceIndex code={fareIndex} accent={fare.highlight ? "brand" : "none"} />
                  <h2 className="text-base sm:text-lg font-bold text-foreground">
                    {pick(lang, fare.name)}
                  </h2>
                </div>
              ) : (
                <h2 className="text-base sm:text-lg font-bold text-foreground">
                  {pick(lang, fare.name)}
                </h2>
              )}
            </div>

            {/* Accessible Radio Circle Indicator — NOT a nested button */}
            <div
              aria-hidden="true"
              className={cn(
                "size-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors mt-0.5",
                selected
                  ? "border-primary bg-primary"
                  : "border-border bg-card group-hover:border-primary/60",
              )}
            >
              <RadioGroupPrimitive.Indicator asChild>
                <span className="block size-2 rounded-full bg-primary-foreground" />
              </RadioGroupPrimitive.Indicator>
            </div>
          </div>

          {/* Pricing */}
          <div className="mt-3">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {money(price, lang)}
            </span>
            <span className="ms-1.5 text-xs text-muted-foreground">{t("book.perPassenger")}</span>
          </div>

          {/* Mobile Concise Summary (Compact by default) */}
          <div className="mt-3 block sm:hidden">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Luggage aria-hidden="true" className="size-3.5 shrink-0 text-brand-deep" />
              <span>{bagsLabel}</span>
              <span>·</span>
              <Ticket aria-hidden="true" className="size-3.5 shrink-0 text-brand-deep" />
              <span className="truncate">{pick(lang, fare.seatSelection)}</span>
            </p>
          </div>

          {/* Full Benefits List (Always visible on desktop) */}
          <div className="hidden sm:block mt-4 space-y-2 text-sm text-muted-foreground">
            <ul className="space-y-2.5">
              <li className="flex items-start gap-2.5">
                <Luggage aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                <span>{bagsLabel}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Ticket aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                <span>{pick(lang, fare.seatSelection)}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <ArrowRight
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-brand-deep rtl:rotate-180"
                />
                <span>{pick(lang, fare.changes)}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                <span>{pick(lang, fare.refund)}</span>
              </li>
            </ul>

            {/* Flexibility summary */}
            <p className="mt-3.5 border-t border-border/70 pt-2.5 text-xs text-muted-foreground">
              {pick(lang, fare.flexibility)}
            </p>
          </div>
        </div>
      </RadioGroupPrimitive.Item>

      {/* Mobile Details Disclosure (Strictly outside RadioGroupPrimitive.Item) */}
      <div className="block sm:hidden mt-2 border-t border-border/50 pt-1">
        <button
          type="button"
          onClick={() => setMobileExpanded((prev) => !prev)}
          aria-expanded={mobileExpanded}
          aria-controls={`fare-details-${fare.id}`}
          className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 py-2 text-xs font-semibold text-brand-deep hover:underline cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <span>{mobileExpanded ? t("book.hideDetails") : t("book.showDetails")}</span>
          {mobileExpanded ? (
            <ChevronUp aria-hidden="true" className="size-3.5" />
          ) : (
            <ChevronDown aria-hidden="true" className="size-3.5" />
          )}
        </button>

        <div
          id={`fare-details-${fare.id}`}
          hidden={!mobileExpanded}
          className={cn(
            "mt-1 space-y-2 text-sm text-muted-foreground pb-2",
            !mobileExpanded && "hidden",
          )}
        >
          <ul className="space-y-2">
            <li className="flex items-start gap-2">
              <Luggage aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep" />
              <span>{bagsLabel}</span>
            </li>
            <li className="flex items-start gap-2">
              <Ticket aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep" />
              <span>{pick(lang, fare.seatSelection)}</span>
            </li>
            <li className="flex items-start gap-2">
              <ArrowRight
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-brand-deep rtl:rotate-180"
              />
              <span>{pick(lang, fare.changes)}</span>
            </li>
            <li className="flex items-start gap-2">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep" />
              <span>{pick(lang, fare.refund)}</span>
            </li>
          </ul>
          <p className="mt-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
            {pick(lang, fare.flexibility)}
          </p>
        </div>
      </div>
    </div>
  );
}
