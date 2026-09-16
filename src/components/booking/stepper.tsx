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

export function Stepper({ current }: { current: BookingStep }) {
  const { t } = useI18n();
  const visible = bookingSteps.filter((s) => s !== "search");
  const index = visible.indexOf(current as (typeof visible)[number]);

  return (
    <nav aria-label={t("book.title")} className="border-b border-border bg-card">
      <ol className="mx-auto flex w-full max-w-6xl items-center gap-1 overflow-x-auto px-4 py-3 sm:px-6">
        {visible.map((step, i) => {
          const done = index > i;
          const active = index === i;
          return (
            <li key={step} className="flex shrink-0 items-center">
              <span
                aria-current={active ? "step" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
                  active && "bg-primary text-primary-foreground",
                  done && "text-brand-deep",
                  !active && !done && "text-muted-foreground",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-5 place-items-center rounded-full text-[0.65rem]",
                    active ? "bg-primary-foreground/20" : done ? "bg-brand-soft" : "bg-secondary",
                  )}
                >
                  {done ? <Check className="size-3" /> : <span className="numeral">{i + 1}</span>}
                </span>
                {t(`step.${step}`)}
              </span>
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
