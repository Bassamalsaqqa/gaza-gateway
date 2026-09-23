import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { PlaneLanding, PlaneTakeoff, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { FlightTable } from "@/components/flight-table";
import { Container, Field, Input, PageHeader, Select } from "@/components/kit";
import { addDaysISO, airportByCode, arrivalsOn, departuresOn, todayISO } from "@/lib/data";
import { dateShort } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/{-$locale}/flights")({
  head: () => ({
    meta: [
      { title: "Departures & Arrivals — Gaza International Airport (GZA)" },
      {
        name: "description",
        content:
          "Live-style Palestinian Airlines departure and arrival information at Gaza International Airport, with flight numbers, times, gates and status.",
      },
      { property: "og:title", content: "Departures & Arrivals — GZA" },
      { property: "og:description", content: "Flight information board for Gaza International Airport." },
    ],
  }),
  component: FlightsPage,
});

function FlightsPage() {
  const { t, lang } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const today = todayISO();
  const [mode, setMode] = useState<"departures" | "arrivals">("departures");
  const [date, setDate] = useState(today);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(today, i)), [today]);

  const flights = useMemo(() => {
    const list = mode === "departures" ? departuresOn(date) : arrivalsOn(date);
    return list.filter((f) => {
      if (status !== "all" && f.status !== status) return false;
      if (!query.trim()) return true;
      const other = airportByCode(mode === "departures" ? f.destinationCode : f.originCode);
      const haystack = [
        f.number,
        f.destinationCode,
        f.originCode,
        other ? other.city.en : "",
        other ? other.city.ar : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    });
  }, [mode, date, query, status]);

  // Spatial transition direction calculations
  const slideDistance = 30;
  const isArrivals = mode === "arrivals";
  const dirMultiplier = lang === "ar" ? -1 : 1;
  const initialX = shouldReduceMotion ? 0 : (isArrivals ? slideDistance : -slideDistance) * dirMultiplier;
  const exitX = shouldReduceMotion ? 0 : (isArrivals ? -slideDistance : slideDistance) * dirMultiplier;

  return (
    <>
      <PageHeader title={t("flights.title")} description={t("flights.sub")} />

      <Container className="py-8 space-y-6">
        {/* Sliding Flight Board Switcher */}
        <div className="max-w-md mx-auto">
          <div
            role="group"
            aria-label={t("flights.switchBoard")}
            className="relative grid grid-cols-2 h-auto gap-1 rounded-xl bg-secondary/80 p-1.5 border border-border shadow-xs"
          >
            {(["departures", "arrivals"] as const).map((value) => {
              const isActive = mode === value;
              const Icon = value === "departures" ? PlaneTakeoff : PlaneLanding;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setMode(value)}
                  onKeyDown={(e) => {
                    const isRtl = lang === "ar";
                    const nextKey = isRtl ? "ArrowLeft" : "ArrowRight";
                    const prevKey = isRtl ? "ArrowRight" : "ArrowLeft";
                    if (e.key === nextKey || e.key === prevKey) {
                      e.preventDefault();
                      setMode(value === "departures" ? "arrivals" : "departures");
                    }
                  }}
                  className={cn(
                    "relative z-10 flex min-h-[46px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors cursor-pointer select-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {isActive ? (
                    <motion.div
                      layoutId="flights-active-tab"
                      transition={
                        shouldReduceMotion
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 450, damping: 35 }
                      }
                      className="absolute inset-0 rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]"
                      style={{ zIndex: -1 }}
                    />
                  ) : null}
                  <Icon
                    aria-hidden="true"
                    className={cn("size-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")}
                  />
                  <span>{t(value === "departures" ? "flights.departures" : "flights.arrivals")}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Unified Operational Toolbar: Dates + Search & Status */}
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs space-y-4">
          {/* Date Selector Row */}
          <div>
            <div className="flex items-center gap-1.5 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 pb-1 sm:pb-0 scrollbar-none">
              {dates.map((iso, index) => {
                const isSelected = date === iso;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => setDate(iso)}
                    aria-pressed={isSelected}
                    className={cn(
                      "shrink-0 min-h-10 rounded-lg border px-3.5 py-2 text-xs sm:text-sm font-semibold transition-all cursor-pointer select-none",
                      "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground shadow-xs font-bold"
                        : "border-input bg-card text-muted-foreground hover:text-foreground hover:bg-secondary/40",
                    )}
                  >
                    {index === 0 ? t("flights.today") : index === 1 ? t("flights.tomorrow") : dateShort(iso, lang)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search & Status Filters */}
          <div className="grid gap-3 pt-3 border-t border-border/60 sm:grid-cols-[2fr_1fr]">
            <Field label={t("flights.search")} htmlFor="board-search">
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="board-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="PS101 · Amman"
                  className="ps-9"
                />
              </div>
            </Field>
            <Field label={t("flights.status")} htmlFor="board-status">
              <Select id="board-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">{t("gallery.all")}</option>
                {["Scheduled", "OnTime", "Boarding", "Delayed", "Departed", "Landed", "Cancelled"].map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        {/* Sliding Board Surface with spatial continuity transition */}
        <div className="rounded-xl border border-border bg-card p-4 sm:p-6 shadow-[var(--shadow-soft)] overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-3">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <span>{t(mode === "departures" ? "flights.departures" : "flights.arrivals")}</span>
              <span className="text-xs font-normal text-muted-foreground">
                ({flights.length})
              </span>
            </h2>
            <p className="text-sm text-muted-foreground font-medium">{dateShort(date, lang)}</p>
          </div>

          <div className="relative overflow-hidden pt-3">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mode}
                initial={{ opacity: 0, x: initialX }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: exitX }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0.15 }
                    : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }
                }
                className="w-full overflow-x-auto"
              >
                <FlightTable flights={flights} mode={mode} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {t("fd.note")}
        </p>
      </Container>
    </>
  );
}
