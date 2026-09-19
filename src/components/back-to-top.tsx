import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const SHOW_THRESHOLD_PX = 350;
const HIDE_THRESHOLD_PX = 200;

/**
 * Global context-aware back-to-top control mounted once at the root level.
 * Observes normal window/document scrolling only.
 * Stacking: z-30 (above normal content, below modal overlays/dialogs/sheets at z-50/z-60).
 */
export function BackToTop() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const rafId = useRef<number | null>(null);
  const locationHref = useRouterState({ select: (s) => s.location.href });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      setVisible((prev) => {
        if (!prev && scrollY > SHOW_THRESHOLD_PX) return true;
        if (prev && scrollY < HIDE_THRESHOLD_PX) return false;
        return prev;
      });
    };

    const onScroll = () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        checkScroll();
        rafId.current = null;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    // Initial check on mount
    checkScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, []);

  // Recompute visibility on route changes without forcing page scroll
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raf = requestAnimationFrame(() => {
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      setVisible(scrollY > SHOW_THRESHOLD_PX);
    });
    return () => cancelAnimationFrame(raf);
  }, [locationHref]);

  const scrollToTop = () => {
    if (typeof window === "undefined") return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label={t("common.backToTop")}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      title={t("common.backToTop")}
      className={cn(
        "fixed end-4 sm:end-6 bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] z-30",
        "flex size-11 min-h-11 min-w-11 items-center justify-center rounded-md border border-border bg-card/95 text-foreground shadow-sm",
        "hover:bg-secondary hover:text-primary active:scale-95 transition-all duration-200",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-2 pointer-events-none"
      )}
    >
      <ArrowUp aria-hidden="true" className="size-4 shrink-0" />
      <span className="sr-only">{t("common.backToTop")}</span>
    </button>
  );
}
