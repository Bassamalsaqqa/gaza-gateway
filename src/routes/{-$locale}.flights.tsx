import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { FlightTable } from "@/components/flight-table";
import { Container, Field, Input, PageHeader, Select } from "@/components/kit";
import { addDaysISO, airportByCode, arrivalsOn, departuresOn, todayISO } from "@/lib/data";
import { dateShort } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
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

  return (
    <>
      <PageHeader eyebrow="GZA · Terminal 1" title={t("flights.title")} description={t("flights.sub")} />

      <Container className="py-8">
        <div className="flex gap-1 rounded-lg bg-secondary p-1" role="tablist" aria-label={t("flights.title")}>
          {(["departures", "arrivals"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "flex-1 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors",
                mode === value ? "bg-card text-foreground shadow-[var(--shadow-soft)]" : "text-muted-foreground",
              )}
            >
              {t(value === "departures" ? "flights.departures" : "flights.arrivals")}
            </button>
          ))}
        </div>

        <div className="mt-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-2">
            {dates.map((iso, index) => (
              <button
                key={iso}
                type="button"
                onClick={() => setDate(iso)}
                aria-pressed={date === iso}
                className={cn(
                  "shrink-0 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors",
                  date === iso
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {index === 0 ? t("flights.today") : index === 1 ? t("flights.tomorrow") : dateShort(iso, lang)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr]">
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

        <div className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">
              {t(mode === "departures" ? "flights.departures" : "flights.arrivals")}
            </h2>
            <p className="text-sm text-muted-foreground">{dateShort(date, lang)}</p>
          </div>
          <div className="mt-3 overflow-x-auto">
            <FlightTable flights={flights} mode={mode} />
          </div>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          {t("fd.note")}
        </p>
      </Container>
    </>
  );
}
