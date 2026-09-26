import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { ArrowRight, Ban, Plane } from "lucide-react";
import { useMemo } from "react";
import { Code } from "@/components/kit";
import { StatusBadge } from "@/components/flight-status";
import {
  airportByCode,
  farePrice,
  getFlightBookability,
  minutesToLabel,
  type Flight,
  type FlightUnbookableReason,
} from "@/lib/data";
import { unbookableReasonLabelKey } from "@/lib/booking-rules";
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

export interface FlightOptionProps {
  flight: Flight;
  cabin: string;
  paxCount?: number;
  disabled?: boolean;
  unbookableReason?: FlightUnbookableReason;
  className?: string;
}

export function FlightOption({
  flight,
  cabin,
  paxCount,
  disabled: propDisabled,
  unbookableReason: propReason,
  className,
}: FlightOptionProps) {
  const { t, lang } = useI18n();
  const from = airportByCode(flight.originCode);
  const to = airportByCode(flight.destinationCode);
  const price = farePrice(flight.basePrice, "essential", cabin);

  const bookability = useMemo(
    () => getFlightBookability(flight, { paxCount }),
    [flight, paxCount],
  );
  const isBookable = propDisabled !== undefined ? !propDisabled : bookability.bookable;
  const reason = propReason ?? bookability.reason;
  const reasonLabel = !isBookable ? t(unbookableReasonLabelKey(reason)) : "";

  const accessibleName = useMemo(() => {
    const originCity = from ? pick(lang, from.city) : flight.originCode;
    const destCity = to ? pick(lang, to.city) : flight.destinationCode;
    const durationStr = minutesToLabel(flight.durationMinutes, lang);
    const priceStr = money(price, lang);

    const base = t("book.flightOptionAria", {
      number: flight.number,
      originCity,
      originCode: flight.originCode,
      destCity,
      destCode: flight.destinationCode,
      departTime: flight.departTime,
      arriveTime: flight.arriveTime,
      duration: durationStr,
      nonstop: t("book.nonstop"),
      price: priceStr,
    });

    return !isBookable ? `${base} (${reasonLabel})` : base;
  }, [flight, from, to, price, lang, t, isBookable, reasonLabel]);

  const { active, recipe } = useSurfaceRecipe("operational", "booking.flight-option");

  return (
    <RadioGroupPrimitive.Item
      value={flight.id}
      id={`flight-option-${flight.id}`}
      disabled={!isBookable}
      aria-label={accessibleName}
      data-surface-target="booking.flight-option"
      data-surface-family={active ? "operational" : undefined}
      data-surface-frame={active ? recipe.frame : undefined}
      data-surface-tone={active ? recipe.tone : undefined}
      className={cn(
        "group relative block w-full text-start border p-4 sm:p-5",
        "cursor-pointer select-none transition-all duration-150",
        !isBookable && "cursor-not-allowed opacity-60 data-[state=unchecked]:hover:border-border data-[state=unchecked]:hover:bg-card",
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
              isBookable && "hover:border-primary/50",
              "data-[state=checked]:border-primary data-[state=checked]:ring-2 data-[state=checked]:ring-primary/40 data-[state=checked]:bg-surface-olive-soft",
            ]
          : [
              "rounded-xl border-border bg-card",
              isBookable && "hover:border-primary/40 hover:bg-card/90",
              "data-[state=checked]:border-primary data-[state=checked]:ring-2 data-[state=checked]:ring-primary/30",
            ],
        isBookable && "active:scale-[0.99] active:transition-none motion-reduce:active:scale-100 motion-reduce:transform-none motion-reduce:transition-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      {/* Localized brand tint overlay over opaque card base when checked (baseline only) */}
      {!active ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-xl bg-brand-soft/20 group-data-[state=unchecked]:hidden"
        />
      ) : null}

      {/* Preview Surface Index */}
      {active ? (
        <div className="mb-2.5 flex items-center justify-between">
          <SurfaceIndex
            code={flight.number}
            label={t("book.nonstop")}
            accent={recipe.accent}
          />
        </div>
      ) : null}

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4 sm:gap-6">
          <div>
            <p className="code-id text-2xl font-bold" dir="ltr">{flight.departTime}</p>
            <Code className="text-xs text-muted-foreground" dir="ltr">{flight.originCode}</Code>
          </div>
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <span className="numeral text-xs">{minutesToLabel(flight.durationMinutes, lang)}</span>
            <span aria-hidden="true" className="flex w-16 items-center gap-1 sm:w-24">
              <span className="h-px flex-1 bg-border" />
              <Plane className="size-3.5 rtl:-scale-x-100" />
              <span className="h-px flex-1 bg-border" />
            </span>
            <span className="text-xs">{t("book.nonstop")}</span>
          </div>
          <div>
            <p className="code-id text-2xl font-bold" dir="ltr">{flight.arriveTime}</p>
            <Code className="text-xs text-muted-foreground" dir="ltr">{flight.destinationCode}</Code>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
          <div className="text-start sm:text-end">
            <p className="text-lg font-bold">{money(price, lang)}</p>
            <p className="text-xs text-muted-foreground">{t("book.perPassenger")}</p>
          </div>

          {/* Visual Radio Selection Affordance */}
          <div className="flex items-center gap-2">
            {!isBookable ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold",
                  "border border-destructive/30 bg-destructive/10 text-destructive",
                )}
              >
                <Ban aria-hidden="true" className="size-3.5 shrink-0" />
                <span>{reasonLabel || t("book.unavailable")}</span>
              </span>
            ) : (
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
            )}
          </div>
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">
          <Code dir="ltr">{flight.number}</Code>
        </span>
        <span>{flight.aircraft}</span>
        <span className="inline-flex items-center gap-1.5">
          <span>{from ? pick(lang, from.city) : flight.originCode}</span>
          <ArrowRight aria-hidden="true" className="size-3 rtl:rotate-180 text-muted-foreground shrink-0" />
          <span>{to ? pick(lang, to.city) : flight.destinationCode}</span>
        </span>
        <StatusBadge status={flight.status} />
        {!isBookable ? (
          <span className="font-medium text-destructive">
            {reasonLabel}
          </span>
        ) : (
          <span className="numeral">{t("book.seatsLeft", { n: flight.seatsLeft })}</span>
        )}
      </div>
    </RadioGroupPrimitive.Item>
  );
}
