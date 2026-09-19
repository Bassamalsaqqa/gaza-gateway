import { Check } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const bookingSteps = [
  "search",
  "results",
  "fare",
  "passengers",
  "seats",
  "extras",
  "review",
  "confirmation",
] as const;

export type BookingStep = (typeof bookingSteps)[number];

export type StepperProps = {
  current: BookingStep;
  maxStep?: BookingStep;
  onStepClick?: (step: BookingStep) => void;
};

export function Stepper({ current, maxStep, onStepClick }: StepperProps) {
  const { t, lang } = useI18n();
  const visible = bookingSteps.filter((s) => s !== "search" && s !== "confirmation");
  const index = visible.indexOf(current as (typeof visible)[number]);
  const position = Math.max(0, index) + 1;
  const percent = Math.round((position / visible.length) * 100);

  const maxIndex = maxStep ? visible.indexOf(maxStep as (typeof visible)[number]) : index;
  const doneSteps = visible.slice(0, Math.max(0, index));

  return (
    <nav aria-label={t("book.title")} className="border-b border-border bg-card">
      {/* Compact progress on small screens: where you are, what remains, and quick revisit */}
      <div className="mx-auto w-full max-w-6xl px-4 py-3 sm:px-6 md:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-bold">{t(`step.${visible[index] ?? "results"}`)}</p>
          <p className="numeral text-xs font-semibold text-muted-foreground">
            {t("book.stepOf", { n: String(position), total: String(visible.length) })}
          </p>
        </div>
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={visible.length}
          aria-valuenow={position}
          aria-valuetext={t("book.stepOf", { n: String(position), total: String(visible.length) })}
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary"
        >
          <span
            className="block h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        {doneSteps.length > 0 && onStepClick ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pt-1 text-xs">
            <span className="text-[0.7rem] font-medium text-muted-foreground me-1">
              {t("step.revisit")}
            </span>
            {doneSteps.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onStepClick(s)}
                className="inline-flex items-center gap-1 rounded-full border border-brand/20 bg-brand-soft/60 px-2.5 py-0.5 text-[0.7rem] font-medium text-brand-deep hover:bg-brand-soft transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                <Check aria-hidden="true" className="size-2.5" />
                <span>{t(`step.${s}`)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Full step progression on desktop */}
      <ol className="mx-auto hidden w-full max-w-6xl items-center gap-1 overflow-x-auto px-4 py-3 sm:px-6 md:flex">
        {visible.map((step, i) => {
          const active = index === i;
          const isPrior = index > i;
          const canRevisit = Boolean(onStepClick && (isPrior || (maxIndex >= i && !active)));

          return (
            <li key={step} className="flex shrink-0 items-center">
              {canRevisit ? (
                <button
                  type="button"
                  onClick={() => onStepClick?.(step)}
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-brand-deep hover:bg-brand-soft/70 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring cursor-pointer"
                  title={`${t(`step.${step}`)}`}
                >
                  <span
                    aria-hidden="true"
                    className="grid size-5 place-items-center rounded-full text-[0.65rem] bg-brand-soft"
                  >
                    <Check className="size-3 text-brand-deep" />
                  </span>
                  <span>{t(`step.${step}`)}</span>
                </button>
              ) : (
                <span
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold select-none",
                    active && "bg-primary text-primary-foreground shadow-xs",
                    !active && "text-muted-foreground/60",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-5 place-items-center rounded-full text-[0.65rem] font-bold",
                      active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-secondary text-muted-foreground/60",
                    )}
                  >
                    <span className="numeral">{i + 1}</span>
                  </span>
                  <span>{t(`step.${step}`)}</span>
                </span>
              )}
              {i < visible.length - 1 ? (
                <span aria-hidden="true" className="mx-0.5 h-px w-4 bg-border sm:w-6" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
