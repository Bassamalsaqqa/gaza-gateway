import { AppLink } from "@/components/app-link";
import { useI18n } from "@/lib/i18n";
import {
  MARK_LIGHT_SRC,
  MARK_LIGHT_1X_SRC,
  MARK_LIGHT_2X_SRC,
  MARK_DARK_SRC,
  MARK_DARK_1X_SRC,
  MARK_DARK_2X_SRC,
} from "@/lib/media";
import { cn } from "@/lib/utils";

/**
 * Institutional brand lockup for Gaza International Airport & Palestinian Airlines.
 * Strictly preserves pre-operational truth, responsive mobile ergonomics,
 * and LTR monospace isolation on technical codes.
 * Integrates owner-provided approved mark on light and dark surfaces using
 * authorized transparent production derivatives with natural aspect ratio.
 */
export function Brand({
  tone = "light",
  compact = false,
}: {
  tone?: "light" | "dark";
  compact?: boolean;
}) {
  const { t } = useI18n();
  const isDark = tone === "dark";

  return (
    <AppLink
      to="/"
      className="group inline-flex items-center gap-2 sm:gap-2.5 rounded-lg min-w-0 shrink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      aria-label={`${t("brand.airport")} — ${t("brand.airline")}`}
    >
      <span aria-hidden="true" className="shrink-0 flex items-center">
        <img
          src={isDark ? MARK_DARK_SRC : MARK_LIGHT_SRC}
          srcSet={
            isDark
              ? `${MARK_DARK_1X_SRC} 1x, ${MARK_DARK_2X_SRC} 2x`
              : `${MARK_LIGHT_1X_SRC} 1x, ${MARK_LIGHT_2X_SRC} 2x`
          }
          alt=""
          width={74}
          height={44}
          className={cn(
            "w-auto object-contain shrink-0 transition-transform duration-200 group-hover:scale-[1.02]",
            compact ? "h-7 sm:h-8" : "h-8 sm:h-9.5",
          )}
          loading="eager"
          decoding="sync"
        />
      </span>
      <span className="flex flex-col leading-tight min-w-0 truncate">
        <span
          className={cn(
            "font-display text-xs sm:text-[0.95rem] font-bold tracking-tight truncate",
            isDark ? "text-ink-foreground" : "text-foreground",
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
            isDark ? "text-ink-muted" : "text-muted-foreground",
          )}
        >
          {t("brand.airline")}
        </span>
      </span>
    </AppLink>
  );
}
