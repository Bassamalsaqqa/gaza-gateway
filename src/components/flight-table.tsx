import { Link } from "@tanstack/react-router";
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
}: {
  flights: Flight[];
  mode: "departures" | "arrivals";
  compact?: boolean;
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState<string | null>(null);

  if (flights.length === 0) {
    return (
      <p className="border-t border-border py-10 text-center text-sm text-muted-foreground">{t("flights.none")}</p>
    );
  }

  return (
    <table className="w-full border-collapse text-start">
      <caption className="sr-only">{t(mode === "departures" ? "flights.departures" : "flights.arrivals")}</caption>
      <thead className="hidden sm:table-header-group">
        <tr className="border-b border-border text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <th scope="col" className="py-3 pe-4 text-start">
            {t("flights.scheduled")}
          </th>
          <th scope="col" className="py-3 pe-4 text-start">
            {t("flights.flight")}
          </th>
          <th scope="col" className="py-3 pe-4 text-start">
            {t(mode === "departures" ? "flights.destination" : "flights.origin")}
          </th>
          <th scope="col" className="py-3 pe-4 text-start">
            {t("flights.status")}
          </th>
          {!compact ? (
            <th scope="col" className="py-3 pe-4 text-start">
              {t("flights.gate")}
            </th>
          ) : null}
          <th scope="col" className="py-3 text-end">
            <span className="sr-only">{t("flights.details")}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {flights.map((flight) => {
          const other = airportByCode(mode === "departures" ? flight.destinationCode : flight.originCode) ?? GZA;
          const time = mode === "departures" ? flight.departTime : flight.arriveTime;
          const expanded = open === flight.id;
          return (
            <Fragment key={flight.id}>
              <tr className="border-b border-border align-middle">
                <td className="py-3.5 pe-4">
                  <span className="code-id text-lg font-semibold sm:text-base">{time}</span>
                </td>
                <td className="py-3.5 pe-4">
                  <Code className="text-sm font-semibold">{flight.number}</Code>
                </td>
                <td className="py-3.5 pe-4">
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">{pick(lang, other.city)}</span>
                    <Code className="text-xs text-muted-foreground">{other.code}</Code>
                  </span>
                </td>
                <td className="py-3.5 pe-4">
                  <StatusBadge status={flight.status} />
                </td>
                {!compact ? (
                  <td className="hidden py-3.5 pe-4 md:table-cell">
                    <Code className="text-sm">{flight.gate}</Code>
                  </td>
                ) : null}
                <td className="py-3.5 text-end">
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : flight.id)}
                    aria-expanded={expanded}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <span className="hidden sm:inline">{t("flights.details")}</span>
                    <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", expanded && "rotate-180")} />
                  </button>
                </td>
              </tr>
              {expanded ? (
                <tr className="border-b border-border bg-sand/60">
                  <td colSpan={compact ? 5 : 6} className="px-1 py-4">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Detail label={t("flights.aircraft")} value={flight.aircraft} />
                      <Detail label={t("flights.duration")} value={minutesToLabel(flight.durationMinutes, lang)} mono />
                      <Detail label={t("flights.terminal")} value={flight.terminal} mono />
                      <Detail label={t("flights.gate")} value={flight.gate} mono />
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Plane aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
                        <Code>{flight.originCode}</Code>
                        <span aria-hidden="true">→</span>
                        <Code>{flight.destinationCode}</Code>
                      </span>
                      <Link to="/flight/$flightId" params={{ flightId: flight.id }} className={btnClass("primary", "sm")}>
                        {t("flights.details")}
                      </Link>
                      <Link
                        to="/destinations/$code"
                        params={{ code: other.code === GZA.code ? flight.originCode : other.code }}
                        className={btnClass("outline", "sm")}
                      >
                        {t("flights.book")}
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
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
