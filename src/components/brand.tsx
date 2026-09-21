import { AppLink } from "@/components/app-link";
import { useI18n } from "@/lib/i18n";
import { LOGO_SRC, LOGO_64_SRC, LOGO_128_SRC } from "@/lib/media";
import { cn } from "@/lib/utils";

/**
 * Institutional brand lockup for Gaza International Airport & Palestinian Airlines.
 * Strictly preserves pre-operational truth, responsive mobile ergonomics,
 * and LTR monospace isolation on the GZA code.
 * Integrates owner-provided approved mark on light surfaces while preserving
 * high-contrast dark-context fallback for dark surfaces.
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
      {tone === "dark" ? (
        <span
          aria-hidden="true"
          className="grid size-9 sm:size-10 shrink-0 place-items-center rounded-lg border border-ink-border bg-ink-foreground text-ink shadow-sm font-mono text-[0.7rem] sm:text-[0.75rem] font-bold tracking-wider transition-transform duration-200 group-hover:scale-[1.02]"
        >
          <span className="code-id">GZA</span>
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="grid size-9 sm:size-10 shrink-0 place-items-center rounded-lg border border-brand-deep/15 bg-sand/60 p-0.5 shadow-[var(--shadow-soft)] transition-transform duration-200 group-hover:scale-[1.02]"
        >
          <img
            src={LOGO_SRC}
            srcSet={`${LOGO_64_SRC} 1x, ${LOGO_128_SRC} 2x`}
            alt=""
            width={36}
            height={36}
            className="size-7 sm:size-8 object-contain"
            loading="eager"
            decoding="sync"
          />
        </span>
      )}
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
