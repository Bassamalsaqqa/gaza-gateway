import { AppLink } from "@/components/app-link";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Temporary brand treatment for Gaza International Airport.
 * Replace the mark block below when the final logo is supplied.
 */
export function Brand({ tone = "light", compact = false }: { tone?: "light" | "dark"; compact?: boolean }) {
  const { t } = useI18n();
  return (
    <AppLink to="/" className="group inline-flex items-center gap-2.5" aria-label={t("brand.airport")}>
      <span
        aria-hidden="true"
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-md text-[0.7rem] font-bold tracking-[0.08em]",
          tone === "dark" ? "bg-ink-foreground text-ink" : "bg-primary text-primary-foreground",
        )}
      >
        <span className="code-id">GZA</span>
      </span>
      <span className={cn("flex flex-col leading-tight", compact && "hidden sm:flex")}>
        <span
          className={cn(
            "font-display text-[0.95rem] font-bold tracking-tight",
            tone === "dark" ? "text-ink-foreground" : "text-foreground",
          )}
        >
          {t("brand.airport")}
        </span>
        <span className={cn("text-xs", tone === "dark" ? "text-ink-muted" : "text-muted-foreground")}>
          {t("brand.airline")}
        </span>
      </span>
    </AppLink>
  );
}
