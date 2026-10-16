import { useRef, useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { pick } from "@/lib/i18n";
import type { Lang } from "@/lib/locale";
import type { TravelGuideSection } from "@/content/types";
import { getTravelSectionMeta } from "./travel-helpers";
import {
  Compass,
  FileText,
  Luggage,
  Building2,
  HeartHandshake,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  compass: Compass,
  "file-text": FileText,
  luggage: Luggage,
  building: Building2,
  accessibility: HeartHandshake,
  "help-circle": HelpCircle,
};

interface TravelNavProps {
  sections: TravelGuideSection[];
  activeId: string;
  onSelect: (id: string) => void;
  lang: Lang;
}

export function TravelNav({ sections, activeId, onSelect, lang }: TravelNavProps) {
  const isAr = lang === "ar";
  const reduceMotion = useReducedMotion();
  const navContainerRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Keep keyboard selection visible immediately, including narrow RTL rails.
  useEffect(() => {
    const trigger = triggerRefs.current.get(activeId);
    const container = navContainerRef.current;
    if (trigger && container) {
      const cRect = container.getBoundingClientRect();
      const tRect = trigger.getBoundingClientRect();

      if (tRect.left < cRect.left || tRect.right > cRect.right) {
        trigger.scrollIntoView({
          behavior: "instant",
          block: "nearest",
          inline: "center",
        });
      }
    }
  }, [activeId, reduceMotion]);

  // Robust roving focus with bidirectional wrapping and explicit DOM focus movement
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;

    if (e.key === "ArrowRight") {
      nextIndex = isAr ? index - 1 : index + 1;
    } else if (e.key === "ArrowLeft") {
      nextIndex = isAr ? index + 1 : index - 1;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = sections.length - 1;
    } else {
      return;
    }

    // Wrap around bounds
    if (nextIndex < 0) {
      nextIndex = sections.length - 1;
    } else if (nextIndex >= sections.length) {
      nextIndex = 0;
    }

    e.preventDefault();
    const nextSection = sections[nextIndex];
    if (nextSection) {
      onSelect(nextSection.id);
      // Immediately move DOM focus to the newly selected tab
      const nextTrigger = triggerRefs.current.get(nextSection.id);
      if (nextTrigger) {
        nextTrigger.focus();
      }
    }
  };

  return (
    <nav
      aria-label={isAr ? "أقسام دليل السفر" : "Travel Guide Navigation"}
      className="sticky top-20 z-20 mb-8 rounded-2xl border border-border bg-card/95 p-1.5 sm:p-2 backdrop-blur-md shadow-xs"
    >
      <div
        ref={navContainerRef}
        role="tablist"
        aria-orientation="horizontal"
        className="flex gap-2 overflow-x-auto no-scrollbar motion-safe:scroll-smooth"
        dir={isAr ? "rtl" : "ltr"}
      >
        {sections.map((section, idx) => {
          const isActive = section.id === activeId;
          const meta = getTravelSectionMeta(section, lang);
          const Icon = ICON_MAP[meta.iconType] || HelpCircle;

          return (
            <button
              key={section.id}
              ref={(el) => {
                if (el) triggerRefs.current.set(section.id, el);
                else triggerRefs.current.delete(section.id);
              }}
              role="tab"
              id={`travel-tab-${section.id}`}
              aria-selected={isActive}
              aria-controls={`travel-panel-${section.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelect(section.id)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={cn(
                "group relative flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2 text-start transition-all cursor-pointer select-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                isActive
                  ? "bg-primary/10 text-brand-deep font-semibold"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <div
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-lg transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground group-hover:bg-sand-deep group-hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] font-mono tracking-tight text-muted-foreground opacity-80">
                  {meta.stepNumber}
                </span>
                <span className="text-xs sm:text-sm font-semibold whitespace-nowrap">
                  {pick(lang, section.title)}
                </span>
              </div>

              {isActive ? (
                <motion.span
                  layoutId="travel-active-rail"
                  className="absolute inset-0 -z-10 rounded-xl border border-primary/40 bg-brand-soft/30"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
                  }
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
