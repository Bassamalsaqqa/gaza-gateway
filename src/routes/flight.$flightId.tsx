import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Plane } from "lucide-react";
import { StatusBadge } from "@/components/flight-status";
import { btnClass, Code, Container, EmptyState, Notice, Panel, Pill } from "@/components/kit";
import {
  AIRLINE,
  addDaysISO,
  airportByCode,
  farePrice,
  flightById,
  GZA,
  minutesToLabel,
  type Flight,
} from "@/lib/data";
import { dateLong, money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { defaultCriteria, useStore } from "@/lib/store";

export const Route = createFileRoute("/flight/$flightId")({
  head: ({ params }) => {
    const flight = flightById(params.flightId);
    const title = flight
      ? `${flight.number} ${flight.originCode}–${flight.destinationCode} — Gaza International Airport (GZA)`
      : "Flight details — Gaza International Airport (GZA)";
    const description = flight
      ? `Palestinian Airlines ${flight.number} departs ${flight.originCode} at ${flight.departTime} and arrives ${flight.destinationCode} at ${flight.arriveTime}. Aircraft, terminal, gate and status.`
      : "Flight details for Palestinian Airlines services at Gaza International Airport.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: FlightDetailPage,
});

function FlightDetailPage() {
  const { flightId } = Route.useParams();
  const { t, lang } = useI18n();
  const flight = flightById(flightId);

  if (!flight) {
    return (
      <Container className="py-14">
        <EmptyState
          icon={<Plane aria-hidden="true" className="size-6 rtl:-scale-x-100" />}
          title={t("fd.notFound")}
          description={t("fd.notFoundSub")}
          action={
            <Link to="/flights" className={btnClass("primary", "md")}>
              {t("fd.openBoard")}
            </Link>
          }
        />
      </Container>
    );
  }

  return <FlightDetail flight={flight} lang={lang} t={t} />;
}

function FlightDetail({
  flight,
  lang,
  t,
}: {
  flight: Flight;
  lang: "en" | "ar";
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const navigate = useNavigate();
  const { resetDraft, setDraft } = useStore();
  const from = airportByCode(flight.originCode) ?? GZA;
  const to = airportByCode(flight.destinationCode) ?? GZA;
  const price = farePrice(flight.basePrice, "essential", "economy");
  const routeCode = flight.originCode === GZA.code ? flight.destinationCode : flight.originCode;

  function bookThisFlight() {
    const criteria = {
      ...defaultCriteria(flight.date, addDaysISO(flight.date, 7)),
      tripType: "oneway" as const,
      origin: flight.originCode,
      destination: flight.destinationCode,
      departDate: flight.date,
    };
    resetDraft(criteria);
    setDraft((prev) => ({ ...prev, entry: "results", outbound: flight }));
    void navigate({ to: "/book" });
  }

  return (
    <>
      <header className="border-b border-ink-border bg-ink text-ink-foreground">
        <Container className="py-10 sm:py-14">
          <div className="flex flex-wrap items-center gap-3">
            <Pill tone="clay">
              <Code>{flight.number}</Code>
            </Pill>
            <StatusBadge status={flight.status} />
            <span className="text-xs text-ink-muted">{t("fd.operatedBy", { airline: pick(lang, AIRLINE.name) })}</span>
          </div>

          <h1 className="mt-4 text-3xl font-bold sm:text-5xl">
            {pick(lang, from.city)} <span aria-hidden="true">→</span> {pick(lang, to.city)}
          </h1>
          <p className="mt-3 text-sm text-ink-muted sm:text-base">{dateLong(flight.date, lang)}</p>

          <div className="mt-8 grid gap-6 sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <TimeBlock label={t("fd.depart")} time={flight.departTime} code={flight.originCode} city={pick(lang, from.city)} />
            <div className="flex flex-col items-center gap-1 text-ink-muted">
              <span className="numeral text-xs">{minutesToLabel(flight.durationMinutes, lang)}</span>
              <span aria-hidden="true" className="flex w-full max-w-48 items-center gap-2">
                <span className="h-px flex-1 bg-ink-border" />
                <Plane className="size-4 rtl:-scale-x-100" />
                <span className="h-px flex-1 bg-ink-border" />
              </span>
              <span className="text-xs">{t("book.nonstop")}</span>
            </div>
            <TimeBlock label={t("fd.arrive")} time={flight.arriveTime} code={flight.destinationCode} city={pick(lang, to.city)} />
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button type="button" onClick={bookThisFlight} className={btnClass("clay", "lg")}>
              {t("fd.bookThis")}
              <ArrowRight aria-hidden="true" className="size-4 rtl:-scale-x-100" />
            </button>
            <Link to="/destinations/$code" params={{ code: routeCode }} className={btnClass("outline", "lg")}>
              {t("flights.book")}
            </Link>
            <p className="numeral text-sm text-ink-muted">{t("fd.fromPrice", { price: money(price, lang) })}</p>
          </div>
        </Container>
      </header>

      <Container className="py-10">
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <h2 className="text-lg font-bold">{t("fd.aboutFlight")}</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Item label={t("flights.flight")} value={flight.number} mono />
              <Item label={t("flights.status")} node={<StatusBadge status={flight.status} />} />
              <Item label={t("flights.date")} value={dateLong(flight.date, lang)} />
              <Item label={t("flights.duration")} value={minutesToLabel(flight.durationMinutes, lang)} mono />
              <Item label={t("flights.aircraft")} value={flight.aircraft} />
              <Item label={t("flights.terminal")} value={flight.terminal} mono />
              <Item label={t("flights.gate")} value={flight.gate} mono />
              <Item label={t("search.cabin")} value={t("cabin.economy")} />
              <Item label={t("book.seatsLeft", { n: flight.seatsLeft })} value={`${flight.seatsLeft}`} mono />
            </dl>
            <p className="mt-5 text-xs text-muted-foreground">{t("fd.localTime")}</p>
          </Panel>

          <Panel>
            <h2 className="text-lg font-bold">{t("fd.airports")}</h2>
            <div className="mt-4 space-y-5">
              <AirportBlock label={t("flights.origin")} lang={lang} airport={from} />
              <AirportBlock label={t("flights.destination")} lang={lang} airport={to} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/flights" className={btnClass("outline", "sm")}>
                {t("fd.openBoard")}
              </Link>
              <Link to="/travel" className={btnClass("ghost", "sm")}>
                {t("nav.travel")}
              </Link>
            </div>
          </Panel>
        </div>

        <div className="mt-6">
          <Notice title={t("common.notice")}>{t("fd.note")}</Notice>
        </div>
      </Container>
    </>
  );
}

function TimeBlock({ label, time, code, city }: { label: string; time: string; code: string; city: string }) {
  return (
    <div>
      <p className="eyebrow text-clay-soft">{label}</p>
      <p className="code-id mt-1 text-4xl font-bold sm:text-5xl">{time}</p>
      <p className="mt-1 text-sm text-ink-muted">
        <Code>{code}</Code> · {city}
      </p>
    </div>
  );
}

function Item({ label, value, node, mono }: { label: string; value?: string; node?: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={mono ? "code-id mt-1 text-sm font-medium" : "mt-1 text-sm font-medium"}>{node ?? value}</dd>
    </div>
  );
}

function AirportBlock({
  label,
  airport,
  lang,
}: {
  label: string;
  airport: { code: string; city: { en: string; ar: string }; country: { en: string; ar: string }; name: { en: string; ar: string }; tz: string };
  lang: "en" | "ar";
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">
        <Code>{airport.code}</Code> · {pick(lang, airport.city)}
      </p>
      <p className="text-sm text-muted-foreground">{pick(lang, airport.name)}</p>
      <p className="text-xs text-muted-foreground">
        {pick(lang, airport.country)} · <Code>{airport.tz}</Code>
      </p>
    </div>
  );
}
