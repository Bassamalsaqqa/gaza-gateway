import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, PlaneLanding, PlaneTakeoff } from "lucide-react";
import { useRef } from "react";
import type { Flight } from "@/lib/data";
import { dateShort } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface BookingLegSwitcherProps {
  activeLeg: "out" | "in";
  onChangeLeg: (leg: "out" | "in") => void;
  outboundFlight: Flight | null;
  inboundFlight: Flight | null;
  outboundAssignedCount: number;
  inboundAssignedCount: number;
  totalPassengers: number;
  className?: string;
}

export function BookingLegSwitcher({
  activeLeg,
  onChangeLeg,
  outboundFlight,
  inboundFlight,
  outboundAssignedCount,
  inboundAssignedCount,
  totalPassengers,
  className,
}: BookingLegSwitcherProps) {
  const { t, lang } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const tabRefs = useRef<Record<"out" | "in", HTMLButtonElement | null>>({
    out: null,
    in: null,
  });

  if (!inboundFlight) {
    // Only one-way flight: show informative route badge rather than interactive switcher
    return (
      <div
        className={cn(
          "flex items-center justify-between rounded-xl border border-border bg-card p-3.5 shadow-xs",
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand-deep"
            aria-hidden="true"
          >
            <PlaneTakeoff className="size-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                {t("book.outbound")}
              </span>
              {outboundFlight ? (
                <span className="inline-flex items-center gap-1 text-sm font-bold">
                  <span className="code-id" dir="ltr">{outboundFlight.originCode}</span>
                  <ArrowRight aria-hidden="true" className="size-3 rtl:rotate-180 text-muted-foreground shrink-0" />
                  <span className="code-id" dir="ltr">{outboundFlight.destinationCode}</span>
                </span>
              ) : null}
            </div>
            {outboundFlight ? (
              <p className="text-xs text-muted-foreground">
                {dateShort(outboundFlight.date, lang)} ·{" "}
                <span dir="ltr" className="code-id">
                  {outboundFlight.number}
                </span>
              </p>
            ) : null}
          </div>
        </div>

        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
            outboundAssignedCount === totalPassengers && totalPassengers > 0
              ? "bg-brand-soft text-brand-deep"
              : "bg-secondary text-muted-foreground",
          )}
        >
          {outboundAssignedCount === totalPassengers && totalPassengers > 0 ? (
            <Check aria-hidden="true" className="size-3" />
          ) : null}
          <span>{`${outboundAssignedCount}/${totalPassengers}`}</span>
        </span>
      </div>
    );
  }

  const legs = [
    {
      id: "out" as const,
      label: t("book.outbound"),
      icon: PlaneTakeoff,
      flight: outboundFlight,
      assigned: outboundAssignedCount,
    },
    {
      id: "in" as const,
      label: t("book.inbound"),
      icon: PlaneLanding,
      flight: inboundFlight,
      assigned: inboundAssignedCount,
    },
  ];

  const handleKeyDown = (e: React.KeyboardEvent, currentId: "out" | "in") => {
    const isRtl = lang === "ar";
    const nextKey = isRtl ? "ArrowLeft" : "ArrowRight";
    const prevKey = isRtl ? "ArrowRight" : "ArrowLeft";

    if (e.key === nextKey || e.key === prevKey) {
      e.preventDefault();
      const targetId = currentId === "out" ? "in" : "out";
      onChangeLeg(targetId);
      tabRefs.current[targetId]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      onChangeLeg("out");
      tabRefs.current.out?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      onChangeLeg("in");
      tabRefs.current.in?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label={t("book.seatTitle")}
      className={cn(
        "relative grid grid-cols-2 gap-1.5 rounded-xl border border-border bg-secondary/60 p-1.5 shadow-xs",
        className,
      )}
    >
      {legs.map((leg) => {
        const isActive = activeLeg === leg.id;
        const Icon = leg.icon;
        const allAssigned = leg.assigned === totalPassengers && totalPassengers > 0;

        return (
          <button
            key={leg.id}
            ref={(el) => {
              tabRefs.current[leg.id] = el;
            }}
            id={`seat-leg-tab-${leg.id}`}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-controls="seat-map-panel"
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChangeLeg(leg.id)}
            onKeyDown={(e) => handleKeyDown(e, leg.id)}
            className={cn(
              "relative z-10 flex min-h-[52px] cursor-pointer flex-col justify-center rounded-lg px-3 py-2 text-start transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring select-none",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {/* Sliding Active Indicator */}
            {isActive ? (
              <motion.div
                layoutId="active-seat-leg"
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 450, damping: 35 }
                }
                className="absolute inset-0 rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]"
                style={{ zIndex: -1 }}
              />
            ) : null}

            <div className="flex items-center justify-between gap-1.5">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
                <Icon
                  aria-hidden="true"
                  className={cn("size-3.5", isActive ? "text-primary" : "text-muted-foreground")}
                />
                <span>{leg.label}</span>
              </span>

              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                  allAssigned
                    ? "bg-brand-soft text-brand-deep"
                    : isActive
                      ? "bg-secondary text-foreground"
                      : "bg-background/60 text-muted-foreground",
                )}
              >
                {allAssigned ? <Check aria-hidden="true" className="size-2.5" /> : null}
                <span>{`${leg.assigned}/${totalPassengers}`}</span>
              </span>
            </div>

            {leg.flight ? (
              <div className="mt-0.5 flex items-center justify-between gap-1 text-xs text-muted-foreground">
                <span dir="ltr" className="code-id font-bold text-foreground">
                  {leg.flight.originCode} → {leg.flight.destinationCode}
                </span>
                <span className="text-[11px]">{dateShort(leg.flight.date, lang)}</span>
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
