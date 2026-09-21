import React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";

import { cabins } from "@/lib/data";
import { cn } from "@/lib/utils";
import { btnClass } from "@/components/kit";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                   */
/* -------------------------------------------------------------------------- */

export const PAX_ROWS = [
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

export interface StepperRowProps {
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

export function StepperRow({
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

export interface CabinListProps {
  cabin: string;
  onCabinChange: (id: string) => void;
  t: (key: string) => string;
  legendId: string;
}

export function CabinList({ cabin, onCabinChange, t, legendId }: CabinListProps) {
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
/*  Trigger summary helper                                                      */
/* -------------------------------------------------------------------------- */

export function triggerSummary(
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
/*  Panel Content                                                               */
/* -------------------------------------------------------------------------- */

export interface TravellersCabinPanelProps {
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

export function TravellersCabinPanel({
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
}: TravellersCabinPanelProps) {
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
