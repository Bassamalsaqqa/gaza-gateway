import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { ArrowRight, Check, Luggage, Ticket } from "lucide-react";
import { useMemo } from "react";
import { Pill } from "@/components/kit";
import type { Fare } from "@/lib/data";
import { money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface FareOptionProps {
  fare: Fare;
  price: number;
  className?: string;
}

export function FareOption({ fare, price, className }: FareOptionProps) {
  const { t, lang } = useI18n();

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

  return (
    <RadioGroupPrimitive.Item
      value={fare.id}
      id={`fare-option-${fare.id}`}
      aria-label={accessibleName}
      className={cn(
        "group relative flex flex-col justify-between rounded-xl border p-5 text-start",
        "cursor-pointer select-none transition-all duration-150",
        "border-border bg-card hover:border-primary/40 hover:bg-card/90",
        "active:scale-[0.99] active:transition-none motion-reduce:active:scale-100 motion-reduce:transform-none motion-reduce:transition-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "data-[state=checked]:border-primary data-[state=checked]:ring-1 data-[state=checked]:ring-primary/40 data-[state=checked]:bg-brand-soft/20",
        className,
      )}
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{pick(lang, fare.name)}</h2>
            {fare.highlight ? (
              <div className="mt-1">
                <Pill tone="clay">{t("book.recommended")}</Pill>
              </div>
            ) : null}
          </div>

          {/* Visual Radio Selection Affordance */}
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                "border min-h-[36px] sm:min-h-0",
                "group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary group-data-[state=checked]:text-primary-foreground",
                "group-data-[state=unchecked]:border-border group-data-[state=unchecked]:bg-secondary/60 group-data-[state=unchecked]:text-muted-foreground",
                "group-hover:border-primary/50",
              )}
            >
              {/* Radio Circle Indicator */}
              <span
                aria-hidden="true"
                className={cn(
                  "size-4 rounded-full border-2 flex items-center justify-center transition-colors shrink-0",
                  "group-data-[state=checked]:border-primary-foreground",
                  "group-data-[state=unchecked]:border-muted-foreground group-hover:border-primary",
                )}
              >
                <RadioGroupPrimitive.Indicator asChild>
                  <span className="block size-2 rounded-full bg-primary-foreground" />
                </RadioGroupPrimitive.Indicator>
              </span>
              <span className="group-data-[state=checked]:inline group-data-[state=unchecked]:hidden">
                {t("book.selected")}
              </span>
              <span className="group-data-[state=checked]:hidden group-data-[state=unchecked]:inline">
                {t("book.select")}
              </span>
            </span>
          </div>
        </div>

        {/* Pricing */}
        <div className="mt-4">
          <p className="text-2xl font-bold">{money(price, lang)}</p>
          <p className="text-xs text-muted-foreground">{t("book.perPassenger")}</p>
        </div>

        {/* Benefits list */}
        <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <Luggage aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep" />
            <span className="numeral">
              {fare.checkedBags === 0
                ? t("book.cabinBagOnly")
                : t("book.checkedBagsCount", { n: fare.checkedBags })}
            </span>
          </li>
          <li className="flex gap-2">
            <Ticket aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep" />
            <span>{pick(lang, fare.seatSelection)}</span>
          </li>
          <li className="flex gap-2">
            <ArrowRight
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-brand-deep rtl:rotate-180"
            />
            <span>{pick(lang, fare.changes)}</span>
          </li>
          <li className="flex gap-2">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep" />
            <span>{pick(lang, fare.refund)}</span>
          </li>
        </ul>
      </div>

      {/* Flexibility summary footer */}
      <p className="mt-5 border-t border-border pt-3 text-xs text-muted-foreground">
        {pick(lang, fare.flexibility)}
      </p>
    </RadioGroupPrimitive.Item>
  );
}
