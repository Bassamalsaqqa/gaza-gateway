/**
 * Gaza Gateway — Heritage-Inspired Ground-Shuttle Conceptual Network
 *
 * Concise interactive overland shuttle concept envisioning regional links
 * from Gaza International Airport to Jaffa, Ramallah, Hebron, Nablus, Jerusalem, and Haifa.
 *
 * Grounded in pre-Nakba transportation company archives (96 records) verified by coordinator:
 * https://www.palestineremembered.com/tags/Transportation-Co..html
 */

import { useState, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { Bus, MapPin, ExternalLink, Route as RouteIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/locale";
import {
  HERITAGE_SHUTTLE_ARCHIVE_URL,
  HERITAGE_SHUTTLE_CITIES,
} from "./travel-shuttle-data";

interface TravelGroundShuttleProps {
  lang: Lang;
}

export function TravelGroundShuttle({ lang }: TravelGroundShuttleProps) {
  const isAr = lang === "ar";
  const reduceMotion = useReducedMotion();
  const [selectedCityId, setSelectedCityId] = useState<string>("jaffa");
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const activeCity =
    HERITAGE_SHUTTLE_CITIES.find((c) => c.id === selectedCityId) ?? HERITAGE_SHUTTLE_CITIES[0]!;

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;
    if (e.key === "ArrowRight") {
      nextIndex = isAr ? index - 1 : index + 1;
    } else if (e.key === "ArrowLeft") {
      nextIndex = isAr ? index + 1 : index - 1;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = HERITAGE_SHUTTLE_CITIES.length - 1;
    } else {
      return;
    }

    if (nextIndex < 0) {
      nextIndex = HERITAGE_SHUTTLE_CITIES.length - 1;
    } else if (nextIndex >= HERITAGE_SHUTTLE_CITIES.length) {
      nextIndex = 0;
    }

    e.preventDefault();
    const nextCity = HERITAGE_SHUTTLE_CITIES[nextIndex];
    if (nextCity) {
      setSelectedCityId(nextCity.id);
      buttonRefs.current.get(nextCity.id)?.focus({ preventScroll: true });
    }
  };

  return (
    <section
      id="ground-shuttle"
      aria-labelledby="ground-shuttle-heading"
      className="mt-10 sm:mt-12 rounded-2xl border border-sand-deep bg-sand p-4 sm:p-6 lg:p-7 shadow-xs"
    >
      {/* Header & Concise Memorial Concept Line */}
      <div className="max-w-[70ch]">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 font-mono text-xs font-semibold text-primary-foreground shadow-xs">
            <Bus className="size-3.5" aria-hidden="true" />
            <span>{isAr ? "حافلات الربط الإقليمي (مفهوم تذكاري)" : "Regional Ground Shuttle (Memorial Concept)"}</span>
          </span>
        </div>

        <h3
          id="ground-shuttle-heading"
          className="mt-3 font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground"
        >
          {isAr
            ? "شبكة حافلات الربط الإقليمي"
            : "Regional Ground-Shuttle Network"}
        </h3>

        <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
          {isAr
            ? "رؤية تذكارية ومدنية غير تشغيلية مستلهمة من شبكات الحافلات الفلسطينية قبل 1948 لربط مطار غزة بست حواضر إقليمية، دون مواعيد أو خدمات تجارية فعلية."
            : "A non-operational memorial concept inspired by pre-1948 Palestinian transit lines to link Gaza Airport with six regional hubs, without active commercial schedules or operators."}
        </p>
      </div>

      {/* 6 City Selection Pills */}
      <div className="mt-6">
        <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2.5 flex items-center gap-1.5">
          <MapPin className="size-3.5 text-brand-deep" aria-hidden="true" />
          <span>{isAr ? "المدن الإقليمية" : "Regional Destinations"}</span>
        </div>

        <div
          role="tablist"
          aria-label={isAr ? "محاور النقل البري الإقليمية" : "Regional Overland Corridors"}
          className="flex flex-wrap gap-2"
          dir={isAr ? "rtl" : "ltr"}
        >
          {HERITAGE_SHUTTLE_CITIES.map((city, idx) => {
            const isSelected = city.id === activeCity.id;
            return (
              <button
                key={city.id}
                ref={(el) => {
                  if (el) buttonRefs.current.set(city.id, el);
                  else buttonRefs.current.delete(city.id);
                }}
                role="tab"
                id={`shuttle-tab-${city.id}`}
                aria-selected={isSelected}
                aria-controls={`shuttle-panel-${city.id}`}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setSelectedCityId(city.id)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs sm:text-sm font-medium transition-all cursor-pointer select-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  isSelected
                    ? "bg-brand text-primary-foreground font-semibold shadow-xs"
                    : "bg-card text-foreground border border-sand-deep hover:bg-sand-deep hover:text-foreground",
                )}
              >
                <span>{city.name[lang]}</span>
                <span
                  className={cn(
                    "text-[10px] font-mono",
                    isSelected ? "text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {city.corridor[lang]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Compact Route Card */}
      <div
        id={`shuttle-panel-${activeCity.id}`}
        role="tabpanel"
        aria-labelledby={`shuttle-tab-${activeCity.id}`}
        tabIndex={0}
        className={cn(
          "mt-4 rounded-xl border border-sand-deep bg-card p-4 sm:p-5 shadow-xs",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          !reduceMotion && "transition-all duration-150",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-deep pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-brand text-primary-foreground">
              <RouteIcon className="size-3.5" aria-hidden="true" />
            </div>
            <span className="font-display text-base sm:text-lg font-bold text-foreground">
              {activeCity.name[lang]}
            </span>
            <span className="text-xs text-muted-foreground" aria-hidden="true">•</span>
            <span className="text-xs font-semibold text-brand-deep">
              {activeCity.corridor[lang]}
            </span>
          </div>

          <span className="rounded-full border border-sand-deep bg-sand px-2.5 py-0.5 text-xs font-medium text-foreground">
            {isAr ? "مسار مقترح" : "Proposed Corridor"}
          </span>
        </div>

        <p className="mt-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
          {activeCity.concept[lang]}
        </p>

        {/* Short source citation */}
        <div className="mt-4 flex flex-col gap-2 pt-3 border-t border-sand-deep sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground">
          <span>
            {isAr
              ? "مستوحى من 96 صورة وسجلاً لشركات الحافلات والنقل الفلسطينية قبل عام 1948."
              : "Inspired by 96 historical records of pre-1948 Palestinian transportation companies."}
          </span>

          <a
            href={HERITAGE_SHUTTLE_ARCHIVE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-brand-deep hover:underline"
          >
            <span>{isAr ? "عرض الأرشيف (Palestine Remembered)" : "View Archive (Palestine Remembered)"}</span>
            <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
