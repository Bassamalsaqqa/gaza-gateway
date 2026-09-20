import * as React from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-primary/10 motion-reduce:animate-none", className)} {...props} />;
}

/**
 * Shared Gaza structural skeleton loading family.
 * - Single localized role="status" live container for screen-reader awareness.
 * - Decorative sub-elements explicitly aria-hidden="true".
 * - Respects prefers-reduced-motion (no pulse).
 * - Matches the Gaza layout proportions without fake delays or dimensions shifts.
 */
function GazaLoadingState({
  message,
  className,
  children,
}: {
  message?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  const loadingText = message || t("common.loading");

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("w-full py-6 sm:py-10", className)}
    >
      <span className="sr-only">{loadingText}</span>
      {children ?? (
        <div className="space-y-4" aria-hidden="true">
          <Skeleton className="h-8 w-48 max-w-[60%] rounded-lg" />
          <Skeleton className="h-4 w-72 max-w-[80%] rounded" />
          <div className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs">
            <Skeleton className="h-6 w-1/3 rounded" />
            <Skeleton className="h-4 w-2/3 rounded" />
            <div className="pt-2 grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { Skeleton, GazaLoadingState };
