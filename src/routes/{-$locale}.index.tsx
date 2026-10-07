import { useFlightsQuery } from "@/lib/repositories";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Building2, Calendar, Clock, Luggage, Plane, Ticket } from "lucide-react";
import { useMemo, useState } from "react";
import { FlightSearchForm } from "@/components/flight-search-form";
import { DestinationCard } from "@/components/destination-card";
import { FlightTable } from "@/components/flight-table";
import { StatusBadge } from "@/components/flight-status";
import { btnClass, Code, Container, SectionHeader } from "@/components/kit";
import {
  airportByCode,
  destinations,
  GZA,
  img,
  todayISO,
} from "@/lib/data";
import { getFeaturedArchiveRecords } from "@/lib/archive";
import { pick, useI18n } from "@/lib/i18n";
import { ResponsiveImage } from "@/components/responsive-image";
import { MEDIA } from "@/lib/media";
import { publishedHome } from "@/content/published/home";
import { publishedDestinationsPresentation } from "@/content/published/destinations-presentation";
import { getDestinationPhotoByCode, getDestinationPhotoById } from "@/lib/destination-media";
import { ContentPreviewNotice, useContentPreview } from "@/content/preview";
import { cn } from "@/lib/utils";
import alreadyBookedImg from "@/assets/media/decorative/cards/already-booked-routes.webp";
import beforeTravelImg from "@/assets/media/decorative/cards/before-travel-palms.webp";
import airportPastBodyImg from "@/assets/media/decorative/airport/airport-past-body.webp";
import airportPresentBodyImg from "@/assets/media/decorative/airport/airport-present-body.webp";
import airportFutureBodyImg from "@/assets/media/decorative/airport/airport-future-body.webp";
import utilityStatusImg from "@/assets/media/decorative/home-utility/utility-flight-status.webp";
import utilityCheckinImg from "@/assets/media/decorative/home-utility/utility-check-in.webp";
import utilityTravelImg from "@/assets/media/decorative/home-utility/utility-travel-guidelines.webp";
import utilityHeritageImg from "@/assets/media/decorative/home-utility/utility-airport-heritage.webp";

const chapterBodyImages = {
  past: airportPastBodyImg,
  present: airportPresentBodyImg,
  future: airportFutureBodyImg,
} as const;

export const Route = createFileRoute("/{-$locale}/")({
  head: ({ params }) => ({
    meta: [
      { title: publishedHome.seo.title[params.locale === "ar" ? "ar" : "en"] },
      {
        name: "description",
        content: publishedHome.seo.description[params.locale === "ar" ? "ar" : "en"],
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
  const { content, previewing, previewError, previewLoading } = useContentPreview("home", publishedHome);
  const { content: destPresentation, previewError: destinationPreviewError, previewLoading: destinationPreviewLoading } = useContentPreview("destinations.presentation", publishedDestinationsPresentation);
  const today = todayISO();
  const [board, setBoard] = useState<"departures" | "arrivals">("departures");
  const boardQuery = useFlightsQuery(today, board === "departures" ? "dep" : "arr");
  const flights = !boardQuery.isError ? (boardQuery.data ?? []).slice(0, 5) : [];
  const archive = useMemo(() => getFeaturedArchiveRecords(6), []);

  return (
    <>
      {previewing ? <ContentPreviewNotice error={previewError ?? destinationPreviewError} loading={previewLoading || destinationPreviewLoading} /> : null}
      {/* 1. Civic Hero Section with Atmospheric Lighting & Identity */}
      <section className="relative isolate overflow-hidden bg-ink text-ink-foreground">
        {/* Real owner-provided concept hero — eager, high-priority LCP candidate with explicit positive stacking */}
        <ResponsiveImage
          entry="home-hero"
          sizes="100vw"
          loading="eager"
          fetchPriority="high"
          className="absolute inset-0 z-0 size-full object-cover opacity-90"
        />
        {/* Directional, localized overlay: stronger behind copy, lighter on photographic features */}
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-ink via-ink/65 to-ink/35 sm:bg-gradient-to-r sm:from-ink/90 sm:via-ink/60 sm:to-ink/20 sm:rtl:bg-gradient-to-l" />

        <Container className="relative z-20 pt-12 pb-32 sm:pt-16 sm:pb-40 lg:pt-20 lg:pb-44">
          <div className="flex flex-col items-start">
            <p className="type-label text-clay-soft">
              <span className="code-id font-mono font-semibold">GZA · PS</span>
              <span className="mx-1.5 opacity-60" aria-hidden="true">
                ·
              </span>
              <span>{t("brand.airline")}</span>
            </p>

            <h1 className="type-title-hero mt-3 max-w-3xl text-ink-foreground">
              {pick(lang, content.copy.h1)}
            </h1>

            <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
              {pick(lang, content.copy.sub)}
            </p>

            <p className="mt-2.5 text-xs text-ink-muted/80 sm:text-sm">
              {t("home.heroNotice")}
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
        {/* Concept truth label — restrained, bottom-right with positive stacking */}
        <p className="absolute bottom-3 end-4 z-20 text-[0.6rem] text-ink-foreground/60 select-none pointer-events-none">
          {t("media.conceptShortLabel")}
        </p>
      </section>

      {/* 2. Integrated Flight Search Console (Overlapping Hero Boundary) */}
      <Container className="-mt-20 sm:-mt-28 lg:-mt-32">
        <FlightSearchForm context="home" />
      </Container>

      {/* 3. Integrated passenger utility rail */}
      <Container className="mt-5 sm:mt-6">
        <div
          data-home-utility-rail="true"
          className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] sm:grid sm:grid-cols-2 lg:grid-cols-[1.15fr_1.15fr_0.85fr_0.85fr]"
        >
          {/* 01. Flight Status */}
          <AppLink
            to="/flights"
            data-utility-card="flight-status"
            className="group relative flex min-h-16 items-center gap-3.5 overflow-hidden border-b border-border bg-brand px-4 py-3.5 text-primary-foreground transition-colors hover:bg-brand-deep focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring sm:min-h-18 sm:border-e lg:border-b-0"
          >
            <img
              src={utilityStatusImg}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="pointer-events-none absolute inset-0 size-full select-none object-cover opacity-90 ltr:scale-x-[-1]"
            />
            <div className="pointer-events-none absolute inset-0 bg-brand/30 transition-colors duration-200 group-hover:bg-brand/15" aria-hidden="true" />
            <Plane aria-hidden="true" className="relative z-10 size-5 sm:size-6 shrink-0 opacity-90 rtl:-scale-x-100" />
            <div className="relative z-10 flex flex-col min-w-0">
              <span className="text-sm sm:text-base font-bold text-white drop-shadow-xs">{t("home.quickStatusTitle")}</span>
              <span className="text-xs text-white/85 truncate drop-shadow-xs">{t("home.quickStatusSub")}</span>
            </div>
            <ArrowRight aria-hidden="true" className="relative z-10 ms-auto size-4 text-white/80 opacity-80 rtl:rotate-180 shrink-0" />
          </AppLink>

          {/* 02. Online Check-in */}
          <AppLink
            to="/check-in"
            data-utility-card="check-in"
            className="group relative flex min-h-16 items-center gap-3.5 overflow-hidden border-b border-border bg-sand-deep/70 px-4 py-3.5 transition-colors hover:bg-sand-deep focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring sm:min-h-18 lg:border-b-0 lg:border-e"
          >
            <img
              src={utilityCheckinImg}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="pointer-events-none absolute inset-0 size-full select-none object-cover opacity-90 ltr:scale-x-[-1]"
            />
            <div className="pointer-events-none absolute inset-0 bg-sand-deep/35 transition-colors duration-200 group-hover:bg-sand-deep/20" aria-hidden="true" />
            <Ticket aria-hidden="true" className="relative z-10 size-5 sm:size-6 shrink-0 text-brand-deep" />
            <div className="relative z-10 flex flex-col min-w-0">
              <span className="text-sm sm:text-base font-bold text-foreground group-hover:text-brand-deep">
                {t("home.quickCheckinTitle")}
              </span>
              <span className="text-xs text-foreground/80 truncate">{t("home.quickCheckinSub")}</span>
            </div>
            <ArrowRight
              aria-hidden="true"
              className="relative z-10 ms-auto size-4 text-brand-deep/80 rtl:rotate-180 shrink-0"
            />
          </AppLink>

          {/* 03. Travel Guidelines */}
          <AppLink
            to="/travel"
            data-utility-card="travel-guidelines"
            className="group relative flex min-h-16 items-center gap-3 overflow-hidden border-b border-border bg-card px-4 py-3.5 transition-colors hover:bg-secondary focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring sm:min-h-18 sm:border-b-0 sm:border-e"
          >
            <img
              src={utilityTravelImg}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="pointer-events-none absolute inset-0 size-full select-none object-cover opacity-90 ltr:scale-x-[-1]"
            />
            <div className="pointer-events-none absolute inset-0 bg-card/60 transition-colors duration-200 group-hover:bg-card/45" aria-hidden="true" />
            <Luggage aria-hidden="true" className="relative z-10 size-5 shrink-0 text-clay" />
            <div className="relative z-10 flex flex-col min-w-0">
              <span className="text-sm font-bold text-foreground group-hover:text-clay">
                {t("home.quickBaggageTitle")}
              </span>
              <span className="text-xs text-muted-foreground truncate">{t("home.quickBaggageSub")}</span>
            </div>
          </AppLink>

          {/* 04. Airport Heritage */}
          <AppLink
            to="/airport"
            data-utility-card="airport-heritage"
            className="group relative flex min-h-16 items-center gap-3 overflow-hidden bg-card px-4 py-3.5 transition-colors hover:bg-secondary focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring sm:min-h-18"
          >
            <img
              src={utilityHeritageImg}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="pointer-events-none absolute inset-0 size-full select-none object-cover opacity-90 ltr:scale-x-[-1]"
            />
            <div className="pointer-events-none absolute inset-0 bg-card/60 transition-colors duration-200 group-hover:bg-card/45" aria-hidden="true" />
            <Building2 aria-hidden="true" className="relative z-10 size-5 shrink-0 text-foreground/80" />
            <div className="relative z-10 flex flex-col min-w-0">
              <span className="text-sm font-bold text-foreground">
                {t("home.quickHeritageTitle")}
              </span>
              <span className="text-xs text-muted-foreground truncate">{t("home.quickHeritageSub")}</span>
            </div>
          </AppLink>
        </div>
      </Container>

      {/* 4. Today at GZA / Flight Schedule Matrix */}
      <Container className="mt-12 sm:mt-16">
        <SectionHeader
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

          {boardQuery.isLoading || boardQuery.isError || flights.length === 0 ? (
            <p role={boardQuery.isError ? "alert" : "status"} className="mt-5 text-sm text-muted-foreground">
              {t(boardQuery.isError ? "services.error.unavailable" : boardQuery.isLoading ? "services.loading" : "services.empty")}
              {boardQuery.isError && <button type="button" className={btnClass("ghost", "sm")} onClick={() => void boardQuery.refetch()}>{t("adm.ops.retry")}</button>}
            </p>
          ) : null}
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
      <section className="mt-20 sm:mt-24 border-y border-border bg-ambient-sand py-16 sm:py-20">
        <Container>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="type-title-lg text-foreground">
                {pick(lang, content.copy.heritageSpotlightTitle)}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                {pick(lang, content.copy.heritageSpotlightDesc)}
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

          {/* 3 Heritage Chapters (Past, Present, Future) */}
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                {
                  id: "past",
                  to: "/airport/past",
                  title: content.copy.past,
                  sub: content.copy.pastSub,
                  mediaId: "past-024" as const,
                  isFuture: false,
                },
                {
                  id: "present",
                  to: "/airport/present",
                  title: content.copy.present,
                  sub: content.copy.presentSub,
                  mediaId: "airport-present-ruins-2008" as const,
                  isFuture: false,
                },
                {
                  id: "future",
                  to: "/airport/future",
                  title: content.copy.future,
                  sub: content.copy.futureSub,
                  mediaId: "aerial-day" as const,
                  isFuture: true,
                },
              ] as const
            ).map((chapter) => (
              <AppLink
                key={chapter.to}
                to={chapter.to}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-ink">
                  <ResponsiveImage
                    entry={chapter.mediaId}
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/30 to-transparent" />
                  {chapter.isFuture && (
                    <span className="absolute bottom-2.5 end-3 rounded bg-ink/80 px-1.5 py-0.5 font-mono text-[0.65rem] text-ink-muted">
                      {t("media.conceptShortLabel")}
                    </span>
                  )}
                </div>

                <div
                  data-decorative-asset={`home-airport-${chapter.id}-body`}
                  data-testid={`home-airport-${chapter.id}-body`}
                  className="relative flex flex-1 flex-col justify-between overflow-hidden bg-ink p-5 text-ink-foreground"
                >
                  <img
                    data-decorative-asset={`home-airport-${chapter.id}-body`}
                    data-testid={`home-airport-${chapter.id}-body`}
                    src={chapterBodyImages[chapter.id]}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="pointer-events-none absolute inset-0 size-full select-none object-cover object-center"
                  />
                  <div className="relative z-10 flex flex-1 flex-col justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-ink-foreground transition-colors group-hover:text-sand">
                        {pick(lang, chapter.title)}
                      </h3>
                      <p className="mt-2 text-xs leading-relaxed text-ink-muted sm:text-sm">
                        {pick(lang, chapter.sub)}
                      </p>
                    </div>
                  </div>
                </div>
              </AppLink>
            ))}
          </div>
        </Container>
      </section>

      {/* 6. Opening Regional Route Network */}
      <Container className="mt-16 sm:mt-20">
        <SectionHeader
          title={pick(lang, content.copy.destTitle)}
          description={pick(lang, content.copy.destSub)}
          action={
            <AppLink to="/destinations" className={btnClass("outline", "sm")}>
              {t("home.allDest")}
            </AppLink>
          }
        />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.slice(0, 6).map((destination) => {
            const assignment = destPresentation.assignments.find((a) => a.code === destination.code);
            const photo = (assignment && getDestinationPhotoById(assignment.photoId)) ?? getDestinationPhotoByCode(destination.code);
            return (
              <DestinationCard
                key={destination.code}
                destination={destination}
                photoOverride={photo}
                focalOverride={assignment?.focalPoint}
              />
            );
          })}
        </div>
      </Container>

      {/* 7. Manage Booking & Passenger Information */}
      <Container className="mt-16 sm:mt-20 grid gap-4 lg:grid-cols-3">
        <div
          data-decorative-asset="already-booked-card"
          className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-ink p-6 text-ink-foreground lg:col-span-2"
        >
          <img
            src={alreadyBookedImg}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="pointer-events-none absolute inset-0 size-full select-none object-cover object-center"
          />
          <div className="relative z-10">
            <div className="flex size-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <Ticket aria-hidden="true" className="size-5" />
            </div>
            <h2 className="mt-4 text-2xl font-bold text-ink-foreground sm:text-3xl">
              {pick(lang, content.copy.manageTitle)}
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-muted">
              {pick(lang, content.copy.manageSub)}
            </p>
          </div>

          <div className="relative z-10 mt-6 flex flex-wrap gap-3">
            <AppLink to="/manage" className={btnClass("secondary", "md", "focus-visible:outline-ink-foreground")}>
              {t("nav.manage")}
            </AppLink>
            <AppLink to="/signin" className={btnClass("outline", "md", "focus-visible:outline-ink-foreground")}>
              {t("nav.signin")}
            </AppLink>
          </div>
        </div>

        <div
          data-decorative-asset="before-travel-card"
          className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-ink p-6 text-ink-foreground shadow-xs"
        >
          <img
            src={beforeTravelImg}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="pointer-events-none absolute inset-0 size-full select-none object-cover object-center"
          />
          <div className="relative z-10">
            <div className="flex size-11 items-center justify-center rounded-xl bg-clay-soft text-clay">
              <Luggage aria-hidden="true" className="size-5" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-ink-foreground">{pick(lang, content.copy.infoTitle)}</h2>
            <ul className="mt-4 space-y-3 divide-y divide-ink-muted/40 text-sm">
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
                    className="flex items-center justify-between gap-2 font-medium text-ink-foreground transition-colors hover:text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-foreground"
                  >
                    <span>{item.label}</span>
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 text-ink-muted rtl:rotate-180"
                    />
                  </AppLink>
                </li>
              ))}
            </ul>
          </div>

          <AppLink
            to="/travel"
            className={btnClass("secondary", "sm", "relative z-10 mt-6 self-start text-xs font-semibold focus-visible:outline-ink-foreground")}
          >
            {t("common.learnMore")} →
          </AppLink>
        </div>
      </Container>

      {/* 8. Archival Gallery Preview */}
      <section data-testid="home-archive-preview">
        <Container className="mt-16 sm:mt-20 mb-12">
          <SectionHeader
            title={pick(lang, content.copy.archiveTitle)}
            description={pick(lang, content.copy.archiveSub)}
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
                <AppLink to="/gallery" aria-label={pick(lang, item.title)}>
                  {item.mediaId && item.mediaId in MEDIA ? (
                    <ResponsiveImage
                      entry={item.mediaId as keyof typeof MEDIA}
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                      altOverride={{ en: item.alt.en, ar: item.alt.ar }}
                      className="aspect-square size-full object-cover transition-opacity group-hover:opacity-85"
                    />
                  ) : (
                    <span className="aspect-square flex size-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
                      {pick(lang, item.title)}
                    </span>
                  )}
                </AppLink>
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </>
  );
}
