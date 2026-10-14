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
  const [progress, setProgress] = useState(0);
  const rafId = useRef<number | null>(null);
  const locationHref = useRouterState({ select: (s) => s.location.href });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const normalizedPath = pathname.replace(/\/$/, "");
  const isBookingRoute = normalizedPath === "/book" || normalizedPath === "/ar/book";
  const isHomePage = normalizedPath === "" || normalizedPath === "/ar";

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      setProgress(Math.min(1, Math.max(0, scrollY / scrollable)));
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
    window.addEventListener("resize", onScroll);
    const resizeObserver = new ResizeObserver(onScroll);
    resizeObserver.observe(document.body);
    // Initial check on mount
    checkScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      resizeObserver.disconnect();
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
      const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      setProgress(Math.min(1, Math.max(0, scrollY / scrollable)));
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
      style={{ filter: `drop-shadow(0 1px 3px color-mix(in oklch, var(--ink) ${isHomePage ? "60%" : "25%"}, transparent))` }}
      className={cn(
        "fixed end-4 sm:end-6 bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] z-30",
        isBookingRoute ? "hidden lg:flex" : "flex",
        "size-12 min-h-12 min-w-12 sm:size-[52px] sm:min-h-[52px] sm:min-w-[52px] items-center justify-center rounded-full bg-transparent border-0 cursor-pointer select-none",
        isHomePage
          ? "text-sand hover:text-white focus-visible:outline-white"
          : "text-brand hover:text-brand-deep focus-visible:outline-brand",
        "motion-safe:hover:-translate-y-0.5 active:scale-95 transition-all duration-200 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100",
        "focus-visible:outline-2 focus-visible:outline-offset-2",
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-2 pointer-events-none",
      )}
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full -rotate-90"
        viewBox="0 0 44 44"
      >
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="4.5"
        />
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinecap="round"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={1 - progress}
        />
      </svg>
      <ArrowUp aria-hidden="true" className="size-6 shrink-0" strokeWidth={4.5} />
      <span className="sr-only">{t("common.backToTop")}</span>
    </button>
  );
}
