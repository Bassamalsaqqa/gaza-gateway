import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Building2, Calendar, Clock, Luggage, Plane, Ticket } from "lucide-react";
import { useMemo, useState } from "react";
import { FlightSearchForm } from "@/components/flight-search-form";
import { DestinationCard } from "@/components/destination-card";
import { FlightTable } from "@/components/flight-table";
import { StatusBadge } from "@/components/flight-status";
import { btnClass, Code, Container, Eyebrow, SectionHeader } from "@/components/kit";
import {
  airportByCode,
  arrivalsOn,
  departuresOn,
  destinations,
  galleryItems,
  GZA,
  img,
  todayISO,
} from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/{-$locale}/")({
  head: () => ({
    meta: [
      { title: "Gaza International Airport (GZA) — Flights & Palestinian Airlines" },
      {
        name: "description",
        content:
          "Search Palestinian Airlines flights from Gaza International Airport to Amman, Cairo, Istanbul, Doha, Dubai, Jeddah and Riyadh — and explore the airport's past, present and future.",
      },
      { property: "og:title", content: "Gaza International Airport (GZA)" },
      {
        property: "og:description",
        content:
          "Flights from Gaza with Palestinian Airlines, and the story of the airport they leave from.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { t, lang } = useI18n();
  const today = todayISO();
  const [board, setBoard] = useState<"departures" | "arrivals">("departures");
  const flights = useMemo(
    () => (board === "departures" ? departuresOn(today) : arrivalsOn(today)).slice(0, 5),
    [board, today],
  );
  const archive = galleryItems.slice(0, 6);

  return (
    <>
      {/* 1. Civic Hero Section with Atmospheric Lighting & Identity */}
      <section className="relative isolate overflow-hidden bg-ink text-ink-foreground">
        <img
          src={img("coastal-runway-sky-dusk", 1920, 1080)}
          alt=""
          className="absolute inset-0 -z-10 size-full object-cover opacity-25"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ink/90 via-ink/75 to-ink" />

        <Container className="pt-12 pb-32 sm:pt-16 sm:pb-40 lg:pt-20 lg:pb-44">
          <div className="flex flex-col items-start">
            {/* Ambient Station Protocol Badge */}
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-ink-border bg-ink/60 px-3 py-1 text-xs text-ink-muted backdrop-blur-xs">
              <span
                className="size-2 rounded-full bg-status-ontime animate-pulse"
                aria-hidden="true"
              />
              <span className="code-id font-bold text-ink-foreground">GZA</span>
              <span className="opacity-40" aria-hidden="true">
                ·
              </span>
              <span>{t("home.statusNotice")}</span>
            </div>

            <Eyebrow className="text-clay-soft">
              <span className="code-id font-mono font-bold">GZA · PS</span>
              <span className="mx-1.5 opacity-60" aria-hidden="true">
                ·
              </span>
              <span>{t("brand.airline")}</span>
            </Eyebrow>

            <h1 className="mt-4 max-w-3xl text-3xl font-bold leading-[1.12] tracking-tight sm:text-5xl lg:text-6xl">
              {t("home.h1")}
            </h1>

            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base lg:text-lg">
              {t("home.sub")}
            </p>

            <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <AppLink
                to="/airport"
                className={btnClass(
                  "clay",
                  "md",
                  "w-full justify-center sm:w-auto shadow-[var(--shadow-soft)] hover:shadow-md",
                )}
              >
                <span>{t("home.exploreAirport")}</span>
                <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
              </AppLink>

              <AppLink
                to="/flights"
                className={btnClass(
                  "ghost",
                  "md",
                  "w-full justify-center sm:w-auto border border-ink-border text-ink-foreground hover:bg-ink-border/80",
                )}
              >
                {t("home.viewFlights")}
              </AppLink>
            </div>
          </div>
        </Container>
      </section>

      {/* 2. Integrated Flight Search Console (Overlapping Hero Boundary) */}
      <Container className="-mt-20 sm:-mt-28 lg:-mt-32">
        <FlightSearchForm variant="panel" />
      </Container>

      {/* 3. Integrated passenger utility rail */}
      <Container className="mt-6 sm:mt-8">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] sm:grid sm:grid-cols-2 lg:grid-cols-[1.15fr_1.15fr_0.85fr_0.85fr]">
          <AppLink
            to="/flights"
            className="group relative flex min-h-20 items-center gap-4 border-b border-border bg-brand px-4 py-4 text-primary-foreground transition-colors hover:bg-brand-deep focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring sm:min-h-24 sm:border-e lg:border-b-0"
          >
            <Plane aria-hidden="true" className="size-6 shrink-0 opacity-85 rtl:-scale-x-100" />
            <div className="flex flex-col min-w-0">
              <span className="text-base font-bold">{t("home.quickStatusTitle")}</span>
              <span className="text-xs text-primary-foreground/75">{t("home.quickStatusSub")}</span>
            </div>
            <ArrowRight aria-hidden="true" className="ms-auto size-4 opacity-60 rtl:rotate-180" />
          </AppLink>

          <AppLink
            to="/check-in"
            className="group relative flex min-h-20 items-center gap-4 border-b border-border bg-sand-deep/55 px-4 py-4 transition-colors hover:bg-sand-deep focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring sm:min-h-24 lg:border-b-0 lg:border-e"
          >
            <Ticket aria-hidden="true" className="size-6 shrink-0 text-brand-deep" />
            <div className="flex flex-col min-w-0">
              <span className="text-base font-bold text-foreground group-hover:text-brand-deep">
                {t("home.quickCheckinTitle")}
              </span>
              <span className="text-xs text-muted-foreground">{t("home.quickCheckinSub")}</span>
            </div>
            <ArrowRight
              aria-hidden="true"
              className="ms-auto size-4 text-brand-deep/60 rtl:rotate-180"
            />
          </AppLink>

          <AppLink
            to="/travel"
            className="group relative flex min-h-16 items-center gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-secondary focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring sm:min-h-20 sm:border-b-0 sm:border-e"
          >
            <Luggage aria-hidden="true" className="size-5 shrink-0 text-clay" />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-foreground group-hover:text-clay">
                {t("home.quickBaggageTitle")}
              </span>
              <span className="text-xs text-muted-foreground">{t("home.quickBaggageSub")}</span>
            </div>
          </AppLink>

          <AppLink
            to="/airport"
            className="group relative flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring sm:min-h-20"
          >
            <Building2 aria-hidden="true" className="size-5 shrink-0 text-foreground/75" />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-foreground">
                {t("home.quickHeritageTitle")}
              </span>
              <span className="text-xs text-muted-foreground">{t("home.quickHeritageSub")}</span>
            </div>
          </AppLink>
        </div>
      </Container>

      {/* 4. Today at GZA / Flight Schedule Matrix */}
      <Container className="mt-16 sm:mt-20">
        <SectionHeader
          eyebrow={t("flights.today")}
          title={t("home.boardTitle")}
          description={t("home.boardSub")}
          action={
            <AppLink to="/flights" className={btnClass("outline", "sm")}>
              {t("home.fullBoard")}
            </AppLink>
          }
        />

        <div className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-[var(--shadow-soft)]">
          {/* Departures / Arrivals Tablist */}
          <Tabs
            value={board}
            onValueChange={(val) => setBoard(val as "departures" | "arrivals")}
            dir={lang === "ar" ? "rtl" : "ltr"}
            className="w-full"
          >
            <TabsList
              aria-label={t("flights.title")}
              className="flex w-full h-auto gap-1 rounded-xl bg-secondary p-1"
            >
              {(["departures", "arrivals"] as const).map((mode) => (
                <TabsTrigger
                  key={mode}
                  value={mode}
                  className={cn(
                    "flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring cursor-pointer select-none",
                    "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[var(--shadow-soft)]",
                    "data-[state=inactive]:text-muted-foreground hover:data-[state=inactive]:text-foreground",
                  )}
                >
                  {t(mode === "departures" ? "flights.departures" : "flights.arrivals")}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Desktop Tabular View */}
          <div className="mt-5 hidden sm:block overflow-x-auto">
            <FlightTable flights={flights} mode={board} compact />
          </div>

          {/* Mobile Reflow Cards View (320px - 639px) for Zero Horizontal Clipping */}
          <div className="mt-4 space-y-3 sm:hidden">
            {flights.map((flight) => {
              const other =
                airportByCode(
                  board === "departures" ? flight.destinationCode : flight.originCode,
                ) ?? GZA;
              const time = board === "departures" ? flight.departTime : flight.arriveTime;
              return (
                <div
                  key={flight.id}
                  className="flex flex-col gap-2.5 rounded-xl border border-border bg-sand/60 p-3.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="code-id text-base font-bold text-foreground">{time}</span>
                    <StatusBadge status={flight.status} />
                  </div>
                  <div className="flex items-baseline justify-between gap-2 border-t border-border/60 pt-2 text-sm">
                    <span className="font-semibold text-foreground">
                      {pick(lang, other.city)}{" "}
                      <Code className="text-xs text-muted-foreground">{other.code}</Code>
                    </span>
                    <span className="code-id text-xs text-muted-foreground">{flight.number}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{flight.gate}</span>
                    <AppLink
                      to="/flight/$flightId"
                      params={{ flightId: flight.id }}
                      className="font-semibold text-primary hover:underline"
                    >
                      {t("flights.details")} →
                    </AppLink>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Container>

      {/* 5. Living Heritage Spotlight (First-Class Structural Chapter Bridge) */}
      <section className="mt-20 sm:mt-24 border-y border-border bg-sand/80 py-16 sm:py-20">
        <Container>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand-deep">
                {t("home.heritageBadge")}
              </span>
              <span className="text-xs font-medium text-clay">{t("home.heritageTag")}</span>
            </div>

            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <h2 className="text-2xl font-bold tracking-tight sm:text-4xl text-foreground">
                  {t("home.heritageSpotlightTitle")}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {t("home.heritageSpotlightDesc")}
                </p>
              </div>

              <AppLink
                to="/gallery"
                className={btnClass("outline", "sm", "self-start lg:self-auto shrink-0")}
              >
                <span>{t("home.exploreArchive")}</span>
                <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
              </AppLink>
            </div>
          </div>

          {/* 3 Heritage Chapters (Past, Present, Future) */}
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                {
                  to: "/airport/past",
                  title: "home.past",
                  sub: "home.pastSub",
                  seed: "archive-terminal-old",
                  era: t("home.eraPast"),
                },
                {
                  to: "/airport/present",
                  title: "home.present",
                  sub: "home.presentSub",
                  seed: "empty-runway-today",
                  era: t("home.eraPresent"),
                },
                {
                  to: "/airport/future",
                  title: "home.future",
                  sub: "home.futureSub",
                  seed: "terminal-concept-render",
                  era: t("home.eraFuture"),
                },
              ] as const
            ).map((chapter) => (
              <AppLink
                key={chapter.to}
                to={chapter.to}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-ink">
                  <img
                    src={img(chapter.seed, 800, 500)}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover opacity-70 transition-transform duration-500 group-hover:scale-105 group-hover:opacity-85"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/30 to-transparent" />
                  <span className="absolute start-3.5 top-3.5 rounded-md bg-ink/70 px-2.5 py-1 text-xs font-semibold text-ink-foreground backdrop-blur-xs">
                    {chapter.era}
                  </span>
                </div>

                <div className="flex flex-1 flex-col justify-between p-5">
                  <div>
                    <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                      {t(chapter.title)}
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                      {t(chapter.sub)}
                    </p>
                  </div>

                  <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-brand-deep group-hover:text-primary">
                    <span>{t("airport.readChapter")}</span>
                    <ArrowRight aria-hidden="true" className="size-3.5 rtl:rotate-180" />
                  </span>
                </div>
              </AppLink>
            ))}
          </div>
        </Container>
      </section>

      {/* 6. Opening Regional Route Network */}
      <Container className="mt-16 sm:mt-20">
        <SectionHeader
          eyebrow={t("nav.destinations")}
          title={t("home.destTitle")}
          description={t("home.destSub")}
          action={
            <AppLink to="/destinations" className={btnClass("outline", "sm")}>
              {t("home.allDest")}
            </AppLink>
          }
        />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.slice(0, 6).map((destination) => (
            <DestinationCard key={destination.code} destination={destination} />
          ))}
        </div>
      </Container>

      {/* 7. Manage Booking & Passenger Information */}
      <Container className="mt-16 sm:mt-20 grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-brand-soft/70 p-6 lg:col-span-2">
          <div>
            <div className="flex size-11 items-center justify-center rounded-xl bg-brand text-primary-foreground">
              <Ticket aria-hidden="true" className="size-5" />
            </div>
            <h2 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">
              {t("home.manageTitle")}
            </h2>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground leading-relaxed">
              {t("home.manageSub")}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <AppLink to="/manage" className={btnClass("primary", "md")}>
              {t("nav.manage")}
            </AppLink>
            <AppLink to="/signin" className={btnClass("outline", "md")}>
              {t("nav.signin")}
            </AppLink>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-xs">
          <div>
            <div className="flex size-11 items-center justify-center rounded-xl bg-clay-soft text-clay">
              <Luggage aria-hidden="true" className="size-5" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-foreground">{t("home.infoTitle")}</h2>
            <ul className="mt-4 space-y-3 text-sm divide-y divide-border/60">
              {(
                [
                  { label: t("book.baggage"), to: "/travel" },
                  { label: t("book.docNumber"), to: "/travel" },
                  { label: t("book.assistance"), to: "/travel" },
                ] as const
              ).map((item, i) => (
                <li key={i} className={i > 0 ? "pt-3" : ""}>
                  <AppLink
                    to={item.to}
                    className="flex items-center justify-between gap-2 text-foreground font-medium hover:text-primary transition-colors"
                  >
                    <span>{item.label}</span>
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 text-muted-foreground rtl:rotate-180"
                    />
                  </AppLink>
                </li>
              ))}
            </ul>
          </div>

          <AppLink
            to="/travel"
            className={btnClass("ghost", "sm", "mt-6 self-start text-xs font-semibold")}
          >
            {t("common.learnMore")} →
          </AppLink>
        </div>
      </Container>

      {/* 8. Archival Gallery Preview */}
      <Container className="mt-16 sm:mt-20">
        <SectionHeader
          eyebrow={t("nav.gallery")}
          title={t("home.archiveTitle")}
          description={t("home.archiveSub")}
          action={
            <AppLink to="/gallery" className={btnClass("outline", "sm")}>
              {t("home.openArchive")}
            </AppLink>
          }
        />
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {archive.map((item) => (
            <li
              key={item.id}
              className="group overflow-hidden rounded-xl border border-border bg-card shadow-xs transition-transform hover:-translate-y-1"
            >
              <AppLink to="/gallery" aria-label={item.title[lang === "ar" ? "ar" : "en"]}>
                <img
                  src={img(item.imageSeed, 400, 400)}
                  alt=""
                  loading="lazy"
                  className="aspect-square size-full object-cover transition-opacity group-hover:opacity-85"
                />
              </AppLink>
            </li>
          ))}
        </ul>
      </Container>

      {/* 9. Civic Airport Callout Banner */}
      <Container className="mt-16 sm:mt-20 mb-8">
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-sand p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-deep">
              <Plane aria-hidden="true" className="size-5 rtl:-scale-x-100" />
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">
                <Code>GZA</Code> · <Code>PS</Code>
              </span>{" "}
              {t("footer.rights")}
            </p>
          </div>
          <AppLink to="/about" className={btnClass("outline", "sm", "shrink-0")}>
            {t("nav.about")}
          </AppLink>
        </div>
      </Container>
    </>
  );
}
