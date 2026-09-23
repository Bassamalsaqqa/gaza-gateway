import { useState } from "react";
import { Baby, ChevronDown, ChevronUp, Luggage, Plus, Minus, User, UtensilsCrossed, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eyebrow, Field } from "@/components/kit";
import {
  EXTRA_BAG_PRICE,
  assistanceOptions,
  fares,
  mealOptions,
} from "@/lib/data";
import { money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import {
  extrasFor,
  totalExtraBags,
  type Draft,
  type Passenger,
  type PaxExtras,
} from "@/lib/store";
import { cn } from "@/lib/utils";

export interface ExtrasStepProps {
  draft: Draft;
  onUpdateDraft: (updater: (prev: Draft) => Draft) => void;
  paxList: Passenger[];
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
  stepNav: React.ReactNode;
}

export function ExtrasStep({
  draft,
  onUpdateDraft,
  paxList,
  headingRef,
  stepNav,
}: ExtrasStepProps) {
  const { t, lang } = useI18n();
  const [activePaxIndex, setActivePaxIndex] = useState(0);
  const [assistanceOpen, setAssistanceOpen] = useState<Record<number, boolean>>({});

  const fareObj = fares.find((f) => f.id === draft.fareId);
  const includedBags = fareObj?.checkedBags ?? 0;

  const currentPassenger = paxList[activePaxIndex] ?? paxList[0];
  const currentExtras = extrasFor(draft.extras, activePaxIndex);

  const setPaxExtras = (patch: Partial<PaxExtras>) => {
    onUpdateDraft((prev) => ({
      ...prev,
      extras: {
        pax: prev.extras.pax.map((item, i) =>
          i === activePaxIndex ? { ...item, ...patch } : item,
        ),
      },
    }));
  };

  const isAssistanceExpanded =
    assistanceOpen[activePaxIndex] || (currentExtras.assistance && currentExtras.assistance.length > 0);

  const paxName = (p: Passenger, i: number) => {
    const full = `${p.firstName} ${p.lastName}`.trim();
    return full || `${t("book.passenger")} ${i + 1}`;
  };

  const currentPassengerLabel = currentPassenger
    ? paxName(currentPassenger, activePaxIndex)
    : `${t("book.passenger")} 1`;

  const totalBags = totalExtraBags(draft.extras);
  const totalBagsFee = totalBags * EXTRA_BAG_PRICE;

  return (
    <section aria-labelledby="extras-title" className="space-y-6">
      {/* Step Header */}
      <div>
        <Eyebrow>{t("step.extras")}</Eyebrow>
        <h1
          id="extras-title"
          ref={headingRef}
          tabIndex={-1}
          className="mt-2 text-2xl font-bold sm:text-3xl outline-none text-foreground"
        >
          {t("book.extrasTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("book.extrasSub")}</p>
      </div>

      {/* Passenger Switcher (when multiple passengers exist) */}
      {paxList.length > 1 ? (
        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t("book.selectPassenger")}
          </span>
          <div
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5"
            role="group"
            aria-label={t("book.selectPassenger")}
          >
            {paxList.map((passenger, index) => {
              const isActive = activePaxIndex === index;
              const extras = extrasFor(draft.extras, index);
              const label = paxName(passenger, index);

              return (
                <button
                  key={index}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActivePaxIndex(index)}
                  className={cn(
                    "relative flex flex-col justify-between rounded-xl border p-3 text-start transition-all cursor-pointer select-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                    "border-border bg-card hover:bg-secondary/40",
                    isActive && "border-primary shadow-xs ring-1 ring-primary/30",
                  )}
                >
                  {isActive ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-xl bg-brand-soft/25"
                    />
                  ) : null}
                  <div className="relative flex items-center gap-2">
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full text-xs font-bold shrink-0",
                        isActive ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="truncate text-sm font-bold text-foreground">
                      {label}
                    </span>
                  </div>

                  <div className="relative mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="rounded bg-secondary px-1.5 py-0.5 font-medium">
                      {extras.extraBags > 0
                        ? `+${extras.extraBags} ${t("book.extraBag")}`
                        : t("book.included")}
                    </span>
                    {extras.assistance.length > 0 ? (
                      <span className="rounded bg-brand-soft px-1.5 py-0.5 text-brand-deep font-semibold">
                        {t("book.assistance")}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Active Passenger Extras Card */}
      <div className="rounded-xl border border-border bg-card p-5 sm:p-7 shadow-xs space-y-6">
        {/* Active Passenger Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-sand text-foreground">
              <User className="size-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-foreground">
                {currentPassengerLabel}
              </h2>
              <p className="text-xs text-muted-foreground">
                {currentPassenger?.type === "child"
                  ? t("book.child")
                  : currentPassenger?.type === "infant"
                    ? t("book.infant")
                    : t("book.adult")}
              </p>
            </div>
          </div>

          <div className="text-end">
            <span className="text-xs text-muted-foreground block">{t("book.extrasTotal")}</span>
            <span className="text-base font-bold text-foreground tabular-nums">
              {money(currentExtras.extraBags * EXTRA_BAG_PRICE, lang)}
            </span>
          </div>
        </div>

        {/* 1. Checked Baggage */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Luggage aria-hidden="true" className="size-4 text-brand-deep" />
            <h3>{t("book.baggage")}</h3>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("book.included")}:{" "}
            <span className="font-semibold text-foreground">
              {includedBags === 0 ? t("book.cabinBagOnly") : `${includedBags} × 23 kg`}
            </span>
          </p>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-sand p-4">
            <div>
              <span className="text-sm font-semibold text-foreground block">
                {t("book.extraBag")}
              </span>
              <span className="text-xs text-muted-foreground">
                {money(EXTRA_BAG_PRICE, lang)} {t("book.perPassenger")}
              </span>
            </div>

            {/* Stepper with accessible 44px buttons */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="size-11 min-h-[44px] min-w-[44px] rounded-lg border border-input bg-card text-foreground disabled:opacity-40 transition-colors hover:bg-secondary flex items-center justify-center cursor-pointer disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-ring"
                disabled={currentExtras.extraBags === 0}
                onClick={() => setPaxExtras({ extraBags: Math.max(0, currentExtras.extraBags - 1) })}
                aria-label={`${t("book.extraBag")} − ${currentPassengerLabel}`}
              >
                <Minus aria-hidden="true" className="size-4" />
              </button>
              <span className="w-8 text-center text-base font-bold tabular-nums text-foreground">
                {currentExtras.extraBags}
              </span>
              <button
                type="button"
                className="size-11 min-h-[44px] min-w-[44px] rounded-lg border border-input bg-card text-foreground disabled:opacity-40 transition-colors hover:bg-secondary flex items-center justify-center cursor-pointer disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-ring"
                disabled={currentExtras.extraBags >= 4}
                onClick={() => setPaxExtras({ extraBags: Math.min(4, currentExtras.extraBags + 1) })}
                aria-label={`${t("book.extraBag")} + ${currentPassengerLabel}`}
              >
                <Plus aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 2. Special Meal Selection */}
        <div className="space-y-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <UtensilsCrossed aria-hidden="true" className="size-4 text-brand-deep" />
              <h3>{t("book.meal")}</h3>
            </div>
            <span className="text-xs font-medium text-brand-deep">
              {t("book.included")}
            </span>
          </div>

          <div className="max-w-md">
            <Field label={t("book.meal")} htmlFor={`meal-${activePaxIndex}`} className="sr-only">
              <span />
            </Field>
            <Select
              value={currentExtras.meal}
              onValueChange={(meal) => setPaxExtras({ meal })}
            >
              <SelectTrigger
                id={`meal-${activePaxIndex}`}
                className="h-11 rounded-lg bg-card"
                aria-label={`${t("book.meal")} - ${currentPassengerLabel}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mealOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {pick(lang, option.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 3. Special Assistance (Opt-in & Dignified) */}
        <div className="space-y-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Baby aria-hidden="true" className="size-4 text-brand-deep" />
              <h3>{t("book.assistance")}</h3>
            </div>
            <span className="rounded-full bg-sand px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {t("book.assistanceComplimentary")}
            </span>
          </div>

          <p className="text-xs text-muted-foreground">{t("book.assistanceNote")}</p>

          {/* Collapsible Trigger when no assistance is currently active */}
          {!isAssistanceExpanded ? (
            <button
              type="button"
              onClick={() =>
                setAssistanceOpen((prev) => ({ ...prev, [activePaxIndex]: true }))
              }
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-deep hover:underline cursor-pointer"
            >
              <span>{t("book.showDetails")}</span>
              <ChevronDown aria-hidden="true" className="size-3.5" />
            </button>
          ) : (
            <div className="space-y-3 pt-1">
              <div className="grid gap-2.5 sm:grid-cols-2">
                {assistanceOptions.map((option) => {
                  const checked = currentExtras.assistance.includes(option.id);
                  return (
                    <label
                      key={option.id}
                      htmlFor={`assistance-${activePaxIndex}-${option.id}`}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 text-sm transition-colors select-none",
                        checked
                          ? "border-primary bg-brand-soft/30 font-medium"
                          : "border-input bg-card hover:bg-secondary/30",
                      )}
                    >
                      <Checkbox
                        id={`assistance-${activePaxIndex}-${option.id}`}
                        className="size-5 shrink-0"
                        checked={checked}
                        onCheckedChange={(next) =>
                          setPaxExtras({
                            assistance:
                              next === true
                                ? [...currentExtras.assistance, option.id]
                                : currentExtras.assistance.filter((id) => id !== option.id),
                          })
                        }
                      />
                      <span>{pick(lang, option.label)}</span>
                    </label>
                  );
                })}
              </div>

              {currentExtras.assistance.length === 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    setAssistanceOpen((prev) => ({ ...prev, [activePaxIndex]: false }))
                  }
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline cursor-pointer"
                >
                  <span>{t("book.hideDetails")}</span>
                  <ChevronUp aria-hidden="true" className="size-3" />
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Extras Summary Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-sand px-4 py-3 text-xs">
        <span className="text-muted-foreground">
          {t("book.extraBag")}: <strong className="text-foreground">{totalBags}</strong>
        </span>
        <span className="font-semibold text-foreground">
          {t("book.extrasTotal")}: <strong className="tabular-nums">{money(totalBagsFee, lang)}</strong>
        </span>
      </div>

      {stepNav}
    </section>
  );
}
