import { GazaTable, GazaTableBody, GazaTableCaption, GazaTableCell, GazaTableHead, GazaTableHeader, GazaTableRow } from "@/components/gaza-table";
import { AppLink } from "@/components/app-link";
import { ChevronDown, Plane } from "lucide-react";
import { Fragment, useState } from "react";
import { StatusBadge } from "./flight-status";
import { btnClass, Code } from "./kit";
import { GZA, airportByCode, minutesToLabel, type Flight } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function FlightTable({
  flights,
  mode,
  compact = false,
  variant = "default",
}: {
  flights: Flight[];
  mode: "departures" | "arrivals";
  compact?: boolean;
  variant?: "default" | "cinematic";
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState<string | null>(null);

  if (flights.length === 0) {
    return (
      <p className={cn("py-10 text-center text-sm", variant === "cinematic" ? "text-sand" : "border-t border-border text-muted-foreground")}>{t("flights.none")}</p>
    );
  }

  return (
    <>
      {/* Mobile Card / List View (sm:hidden, 320px - 639px): Zero horizontal scroll */}
      <div
        className="space-y-3 sm:hidden"
        role="region"
        aria-label={t(mode === "departures" ? "flights.departures" : "flights.arrivals")}
      >
        {flights.map((flight) => {
          const other = airportByCode(mode === "departures" ? flight.destinationCode : flight.originCode) ?? GZA;
          const time = mode === "departures" ? flight.departTime : flight.arriveTime;
          const expanded = open === flight.id;
          return (
            <div
              key={flight.id}
              className={cn(
                "flex flex-col rounded-xl p-3.5 text-start transition-colors",
                variant === "cinematic"
                  ? "border border-sand/20 bg-ink/80 text-sand backdrop-blur-xs shadow-md"
                  : "border border-border bg-card",
              )}
            >
              {/* Primary Bar: Time, Flight Number, Status */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn("code-id text-base font-bold", variant === "cinematic" ? "text-sand" : "text-foreground")}>{time}</span>
                  <Code className="text-xs font-semibold">{flight.number}</Code>
                </div>
                <StatusBadge status={flight.status} className={variant === "cinematic" ? "bg-sand/95" : ""} />
              </div>

              {/* Secondary Bar: City, Airport Code, and Accessible Expand/Details Control */}
              <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
                <div className="min-w-0 flex-1">
                  <span className={cn("block break-words text-sm font-semibold", variant === "cinematic" ? "text-sand" : "text-foreground")}>
                    {pick(lang, other.city)}
                  </span>
                  <Code className={cn("text-xs", variant === "cinematic" ? "text-sand/80" : "text-muted-foreground")}>{other.code}</Code>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : flight.id)}
                  aria-expanded={expanded}
                  aria-controls={`flight-details-m-${flight.id}`}
                  id={`flight-btn-m-${flight.id}`}
                  className={cn("inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", variant === "cinematic" ? "text-sand hover:bg-ink hover:text-sand" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}
                >
                  <span>{t("flights.details")}</span>
                  <span className="sr-only"> {flight.number}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      "size-4 transition-transform motion-reduce:transition-none",
                      expanded && "rotate-180",
                    )}
                  />
                </button>
              </div>

              {/* Expandable Details Section */}
              {expanded ? (
                <div
                  id={`flight-details-m-${flight.id}`}
                  role="region"
                  aria-labelledby={`flight-btn-m-${flight.id}`}
                  className="mt-3 -mx-3.5 -mb-3.5 rounded-b-xl border-t border-border/60 bg-sand/60 p-3.5"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <Detail label={t("flights.aircraft")} value={flight.aircraft} />
                    <Detail label={t("flights.duration")} value={minutesToLabel(flight.durationMinutes, lang)} mono />
                    <Detail label={t("flights.terminal")} value={flight.terminal} mono />
                    <Detail label={t("flights.gate")} value={flight.gate} mono />
                  </div>
                  <div className="mt-3.5 flex flex-col gap-2.5 border-t border-border/40 pt-3">
                    <span dir="ltr" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Plane aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
                      <Code>{flight.originCode}</Code>
                      <span aria-hidden="true">→</span>
                      <Code>{flight.destinationCode}</Code>
                    </span>
                    <div className="grid gap-2">
                      <AppLink
                        to="/flight/$flightId"
                        params={{ flightId: flight.id }}
                        className={cn(btnClass("primary", "sm"), "min-h-11 justify-center")}
                      >
                        {t("flights.details")}
                      </AppLink>
                      <AppLink
                        to="/destinations/$code"
                        params={{ code: other.code === GZA.code ? flight.originCode : other.code }}
                        className={cn(btnClass("outline", "sm"), "min-h-11 justify-center")}
                      >
                        {t("flights.book")}
                      </AppLink>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Desktop Tabular View (hidden sm:table): Preserves semantic table */}
      <GazaTable className={cn("hidden sm:table w-full text-start", variant === "cinematic" ? "border-separate border-spacing-y-2" : "border-collapse")}>
        <GazaTableCaption className="sr-only">{t(mode === "departures" ? "flights.departures" : "flights.arrivals")}</GazaTableCaption>
        <GazaTableHeader className={cn("table-header-group", variant === "cinematic" && "bg-ink/80 text-sand [&_th]:text-sand [&_tr]:border-0")}>
          <GazaTableRow className={cn("border-b text-start text-xs font-semibold uppercase tracking-wider", variant === "cinematic" ? "border-sand/20 text-sand/80" : "border-border text-muted-foreground")}>
            <GazaTableHead scope="col" className="py-3 pe-4 text-start">
              {t("flights.scheduled")}
            </GazaTableHead>
            <GazaTableHead scope="col" className="py-3 pe-4 text-start">
              {t("flights.flight")}
            </GazaTableHead>
            <GazaTableHead scope="col" className="py-3 pe-4 text-start">
              {t(mode === "departures" ? "flights.destination" : "flights.origin")}
            </GazaTableHead>
            <GazaTableHead scope="col" className="py-3 pe-4 text-start">
              {t("flights.status")}
            </GazaTableHead>
            {!compact ? (
            <GazaTableHead scope="col" className="hidden py-3 pe-4 text-start md:table-cell">
              {t("flights.gate")}
              </GazaTableHead>
            ) : null}
            <GazaTableHead scope="col" className="py-3 text-end">
              <span className="sr-only">{t("flights.details")}</span>
            </GazaTableHead>
          </GazaTableRow>
        </GazaTableHeader>
        <GazaTableBody>
          {flights.map((flight) => {
            const other = airportByCode(mode === "departures" ? flight.destinationCode : flight.originCode) ?? GZA;
            const time = mode === "departures" ? flight.departTime : flight.arriveTime;
            const expanded = open === flight.id;
            return (
              <Fragment key={flight.id}>
                <GazaTableRow className={cn("align-middle transition-colors", variant === "cinematic" ? "border-0 bg-ink/75 hover:bg-ink/90 text-sand" : "border-b border-border")}>
                  <GazaTableCell className="py-3.5 pe-4">
                    <span className="code-id text-lg font-semibold sm:text-base">{time}</span>
                  </GazaTableCell>
                  <GazaTableCell className="py-3.5 pe-4">
                    <Code className="text-sm font-semibold">{flight.number}</Code>
                  </GazaTableCell>
                  <GazaTableCell className="py-3.5 pe-4">
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold">{pick(lang, other.city)}</span>
                      <Code className={cn("text-xs", variant === "cinematic" ? "text-sand/80" : "text-muted-foreground")}>{other.code}</Code>
                    </span>
                  </GazaTableCell>
                  <GazaTableCell className="py-3.5 pe-4">
                    <StatusBadge status={flight.status} className={variant === "cinematic" ? "bg-sand/95" : ""} />
                  </GazaTableCell>
                  {!compact ? (
                    <GazaTableCell className="hidden py-3.5 pe-4 md:table-cell">
                      <Code className="text-sm">{flight.gate}</Code>
                    </GazaTableCell>
                  ) : null}
                  <GazaTableCell className="py-3.5 text-end">
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : flight.id)}
                      aria-expanded={expanded}
                      aria-controls={`flight-details-d-${flight.id}`}
                      id={`flight-btn-d-${flight.id}`}
                      className={cn("inline-flex min-h-11 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", variant === "cinematic" ? "text-sand hover:bg-ink hover:text-sand" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}
                    >
                      <span className="hidden sm:inline">{t("flights.details")}</span>
                      <span className="sr-only"> {flight.number}</span>
                      <ChevronDown
                        aria-hidden="true"
                        className={cn(
                          "size-4 transition-transform motion-reduce:transition-none",
                          expanded && "rotate-180",
                        )}
                      />
                    </button>
                  </GazaTableCell>
                </GazaTableRow>
                {expanded ? (
                  <GazaTableRow
                    id={`flight-details-d-${flight.id}`}
                    className="border-b border-border bg-sand/60"
                  >
                    <GazaTableCell colSpan={compact ? 5 : 6} className="px-1 py-4">
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Detail label={t("flights.aircraft")} value={flight.aircraft} />
                        <Detail label={t("flights.duration")} value={minutesToLabel(flight.durationMinutes, lang)} mono />
                        <Detail label={t("flights.terminal")} value={flight.terminal} mono />
                        <Detail label={t("flights.gate")} value={flight.gate} mono />
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span dir="ltr" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Plane aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
                          <Code>{flight.originCode}</Code>
                          <span aria-hidden="true">→</span>
                          <Code>{flight.destinationCode}</Code>
                        </span>
                        <AppLink to="/flight/$flightId" params={{ flightId: flight.id }} className={btnClass("primary", "sm")}>
                          {t("flights.details")}
                        </AppLink>
                        <AppLink
                          to="/destinations/$code"
                          params={{ code: other.code === GZA.code ? flight.originCode : other.code }}
                          className={btnClass("outline", "sm")}
                        >
                          {t("flights.book")}
                        </AppLink>
                      </div>
                    </GazaTableCell>
                  </GazaTableRow>
                ) : null}
              </Fragment>
            );
          })}
        </GazaTableBody>
      </GazaTable>
    </>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-sm font-medium", mono && "code-id")}>{value}</p>
    </div>
  );
}
