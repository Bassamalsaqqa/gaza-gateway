import { AppLink } from "@/components/app-link";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Institutional brand lockup for Gaza International Airport & Palestinian Airlines.
 * Strictly preserves pre-operational truth, responsive mobile ergonomics,
 * and LTR monospace isolation on the GZA code.
 */
export function Brand({
  tone = "light",
  compact = false,
}: {
  tone?: "light" | "dark";
  compact?: boolean;
}) {
  const { t } = useI18n();
  return (
    <AppLink
      to="/"
      className="group inline-flex items-center gap-2 sm:gap-2.5 rounded-lg min-w-0 shrink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      aria-label={`${t("brand.airport")} — ${t("brand.airline")}`}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-9 sm:size-10 shrink-0 place-items-center rounded-lg border font-mono text-[0.7rem] sm:text-[0.75rem] font-bold tracking-wider transition-transform duration-200 group-hover:scale-[1.02]",
          tone === "dark"
            ? "border-ink-border bg-ink-foreground text-ink shadow-sm"
            : "border-brand-deep/20 bg-brand text-primary-foreground shadow-[var(--shadow-soft)]",
        )}
      >
        <span className="code-id">GZA</span>
      </span>
      <span className="flex flex-col leading-tight min-w-0 truncate">
        <span
          className={cn(
            "font-display text-xs sm:text-[0.95rem] font-bold tracking-tight truncate",
            tone === "dark" ? "text-ink-foreground" : "text-foreground",
          )}
        >
          {compact ? (
            <>
              <span className="sm:hidden">{t("brand.airportShort")}</span>
              <span className="hidden sm:inline">{t("brand.airport")}</span>
            </>
          ) : (
            t("brand.airport")
          )}
        </span>
        <span
          className={cn(
            "text-[0.65rem] sm:text-xs font-medium truncate",
            compact ? "hidden sm:inline-block" : "inline-block",
            tone === "dark" ? "text-ink-muted" : "text-muted-foreground",
          )}
        >
          {t("brand.airline")}
        </span>
      </span>
    </AppLink>
  );
}
