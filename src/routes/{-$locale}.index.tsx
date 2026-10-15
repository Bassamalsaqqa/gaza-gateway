import { HomeCinematicBackdrop } from "@/components/airport/cinematic/home-cinematic-backdrop";
import { MvpFlightSearchConsole } from "@/components/mvp-flight-search-console";
import { identityUiRequested } from "@/lib/api/identity-ui-runtime";
import { useNetworkQuery } from "@/lib/network/queries";
import { NetworkReadState } from "@/components/network-read-state";
import { useFlightsQuery } from "@/lib/repositories";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, Building2, Luggage, Plane, Ticket } from "lucide-react";
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

import { pageHead } from "@/lib/head";
import { getAirportSchema, getAirlineSchema, getWebSiteSchema } from "@/lib/structured-data";

export const Route = createFileRoute("/{-$locale}/")({
  head: ({ params }) => {
    const isAr = params.locale === "ar";
    const lang = isAr ? "ar" : "en";
    const head = pageHead({
      locale: params.locale,
      path: "/",
      en: {
        title: publishedHome.seo.title.en,
        description: publishedHome.seo.description.en,
        socialTitle: "Gaza International Airport (GZA) — Palestinian Airlines",
        socialDescription: "Flights from Gaza with Palestinian Airlines, and the story of the airport they leave from.",
      },
      ar: {
        title: publishedHome.seo.title.ar,
        description: publishedHome.seo.description.ar,
        socialTitle: "مطار غزة الدولي (GZA) — الخطوط الجوية الفلسطينية",
        socialDescription: "رحلات من غزة مع الخطوط الجوية الفلسطينية، وقصة المطار وتاريخه ورؤيته.",
      },
      image: "/social/gaza-airport.jpg",
      imageAlt: isAr
        ? "تصور معماري لمطار غزة الدولي — مفهوم مستقبلي توضيحي"
        : "Aerial architectural concept of the future Gaza International Airport — illustrative future concept.",
      schema: [
        getWebSiteSchema(lang),
        getAirportSchema(lang),
        getAirlineSchema(lang),
      ],
    });
    return {
      ...head,
      meta: [
        ...head.meta,
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      ],
    };
  },
  component: Home,
});

function Home() {
  const network = useNetworkQuery(identityUiRequested);
  const publicDestinations = identityUiRequested ? (!network.isError ? network.data ?? [] : []).map(item => ({ code: item.code, city: item.city, country: item.country, flightMinutes: item.blockMinutes })) : destinations;
  const { t, lang } = useI18n();
  const isAr = lang === "ar";
  const { content, previewing, previewError, previewLoading } = useContentPreview("home", publishedHome);
  const { content: destPresentation, previewError: destinationPreviewError, previewLoading: destinationPreviewLoading } = useContentPreview("destinations.presentation", publishedDestinationsPresentation);
  const today = todayISO();
  const [board, setBoard] = useState<"departures" | "arrivals">("departures");
  const boardQuery = useFlightsQuery(today, board === "departures" ? "dep" : "arr", !identityUiRequested);
  const flights = !boardQuery.isError ? (boardQuery.data ?? []).slice(0, 5) : [];
  const archive = useMemo(() => getFeaturedArchiveRecords(6), []);

  return (
    <>
      {previewing ? <ContentPreviewNotice error={previewError ?? destinationPreviewError} loading={previewLoading || destinationPreviewLoading} /> : null}

      {/* 1. Continuous Viewport Background (Fixed Full-Viewport Backdrop) */}
      <HomeCinematicBackdrop />

      {/* 2. Floating Content Stack (All sections float over the background with open space between) */}
      <div className="relative z-10 flex flex-col gap-12 sm:gap-20 lg:gap-28 pb-16">
        {/* Hero Section: ONE uniform tinted GLASS surface, no border/directional gradient */}
        <section aria-label={t("brand.airport")} className="home-hero-section">
          <Container>
            <div className="home-frosted-glass relative max-w-3xl rounded-3xl p-5 sm:p-7 lg:p-8 text-ink-foreground shadow-xl">
              {/* Airline Badge & Symbolic Notice */}
              <div className="home-hero-badge-row flex flex-wrap items-center gap-3">
                <span className="code-id inline-flex items-center rounded-md border border-sand/30 bg-ink px-2.5 py-1 text-xs font-semibold text-sand">
                  GZA · PS
                </span>
                <span className="text-sm font-semibold text-sand/90">
                  {t("brand.airline")}
                </span>
                <span className="text-xs font-medium text-clay-soft">
                  · {isAr ? "مبادرة تذكارية رمزية" : "Symbolic Commemorative Initiative"}
                </span>
              </div>

              {/* Responsive home-only heading scale with short-height media queries */}
              <h1
                className="home-hero-title mt-4 font-display font-bold tracking-tight text-balance text-ink-foreground text-[1.85rem] leading-[1.12] sm:text-4xl sm:leading-[1.12] lg:text-5xl lg:leading-[1.08] xl:text-6xl xl:leading-[1.05]"
                style={{ fontFamily: "var(--font-display-family)" }}
              >
                {pick(lang, content.copy.h1)}
              </h1>

              {/* Subtitle */}
              <p className="home-hero-sub mt-3 max-w-2xl text-sm sm:text-base leading-relaxed text-ink-muted">
                {pick(lang, content.copy.sub)}
              </p>

              {/* Primary Call to Actions: Complete visible initial viewport */}
              <div className="home-hero-ctas mt-6 flex flex-wrap items-center gap-3 sm:gap-3.5">
                <a
                  href="#home-booking"
                  onClick={() => {
                    const el = document.getElementById("home-booking");
                    if (el) {
                      el.focus({ preventScroll: true });
                    }
                  }}
                  className={btnClass("clay", "md", "shadow-xl gap-2 font-semibold min-h-[44px]")}
                >
                  <span>{t("nav.book")}</span>
                  <ArrowDown className="size-4 shrink-0" aria-hidden="true" />
                </a>
                <AppLink
                  to="/airport"
                  className={btnClass(
                    "outline",
                    "md",
                    "border-sand/40 bg-ink/60 text-sand hover:bg-ink/80 font-semibold min-h-[44px]",
                  )}
                >
                  {t("home.exploreAirport")}
                </AppLink>
                <AppLink
                  to="/manage"
                  className={btnClass(
                    "outline",
                    "md",
                    "border-sand/40 bg-ink/60 text-sand hover:bg-ink/80 font-semibold min-h-[44px]",
                  )}
                >
                  <Ticket className="size-4 shrink-0" aria-hidden="true" />
                  <span>{t("nav.manage")}</span>
                </AppLink>
              </div>
            </div>
          </Container>
        </section>

        {/* Floating Booking Console: Center responsive form ~960-1000px max width */}
        <section
          id="home-booking"
          tabIndex={-1}
          aria-label={t("nav.book")}
          className="scroll-mt-[var(--header-height,72px)] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Container>
            <div className="mx-auto w-full max-w-[1000px]">
              {identityUiRequested ? (
                <MvpFlightSearchConsole variant="cinematic" />
              ) : (
                <FlightSearchForm context="home" variant="cinematic" />
              )}
            </div>
          </Container>
        </section>

        {/* Today at GZA / Flight Schedule Matrix (when !identityUiRequested) */}
        {!identityUiRequested ? (
          <section aria-label={t("home.boardTitle")}>
            <Container>
              <div className="home-frosted-glass home-flight-board-glass rounded-3xl p-4 sm:p-6 text-ink-foreground shadow-xl">
                {/* Heading on the frosted glass */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between pb-2">
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink-foreground">
                      {t("home.boardTitle")}
                    </h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      {t("home.boardSub")}
                    </p>
                  </div>
                  <AppLink
                    to="/flights"
                    className={btnClass("outline", "sm", "border-sand/30 bg-ink/70 text-sand hover:bg-ink self-start sm:self-auto shrink-0 shadow-md")}
                  >
                    {t("home.fullBoard")}
                  </AppLink>
                </div>

                <div className="mt-4 sm:mt-5">
                  {/* Departures / Arrivals Tablist as independent floating controls */}
                  <Tabs
                    value={board}
                    onValueChange={(val) => setBoard(val as "departures" | "arrivals")}
                    dir={lang === "ar" ? "rtl" : "ltr"}
                    className="w-full"
                  >
                    <TabsList
                      aria-label={t("flights.title")}
                      className="inline-flex w-auto max-w-full h-auto gap-2 rounded-xl bg-ink/65 p-1 shadow-lg"
                    >
                      {(["departures", "arrivals"] as const).map((mode) => (
                        <TabsTrigger
                          key={mode}
                          value={mode}
                          className={cn(
                            "flex-1 sm:flex-initial rounded-lg px-4 py-2 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring cursor-pointer select-none",
                            "data-[state=active]:bg-sand data-[state=active]:text-ink data-[state=active]:shadow-sm",
                            "data-[state=inactive]:text-sand/80 hover:data-[state=inactive]:text-sand",
                          )}
                        >
                          {t(mode === "departures" ? "flights.departures" : "flights.arrivals")}
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {(["departures", "arrivals"] as const).map((mode) => (
                      <TabsContent
                        key={mode}
                        value={mode}
                        forceMount
                        className="mt-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=inactive]:hidden"
                      >
                        {boardQuery.isLoading || boardQuery.isError || (mode === board && flights.length === 0) ? (
                          <p role={boardQuery.isError ? "alert" : "status"} className="mt-4 text-sm text-sand/80">
                            {t(boardQuery.isError ? "services.error.unavailable" : boardQuery.isLoading ? "services.loading" : "services.empty")}
                            {boardQuery.isError && (
                              <button type="button" className={btnClass("ghost", "sm", "text-sand underline")} onClick={() => void boardQuery.refetch()}>
                                {t("adm.ops.retry")}
                              </button>
                            )}
                          </p>
                        ) : null}

                        {/* Desktop Tabular View with cinematic variant */}
                        <div className="mt-4 hidden sm:block overflow-x-auto">
                          <FlightTable flights={mode === board ? flights : []} mode={mode} compact variant="cinematic" />
                        </div>

                        {/* Mobile Reflow Cards View */}
                        <div className="mt-4 space-y-3 sm:hidden">
                          {(mode === board ? flights : []).map((flight) => {
                            const other =
                              airportByCode(
                                mode === "departures" ? flight.destinationCode : flight.originCode,
                              ) ?? GZA;
                            const time = mode === "departures" ? flight.departTime : flight.arriveTime;
                            return (
                              <div
                                key={flight.id}
                                className="flex flex-col gap-2.5 rounded-xl bg-ink/75 p-3.5 text-ink-foreground shadow-md"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="code-id text-base font-bold text-sand">{time}</span>
                                  <StatusBadge status={flight.status} className="bg-sand/95" />
                                </div>
                                <div className="flex items-baseline justify-between gap-2 border-t border-sand/20 pt-2 text-sm">
                                  <span className="font-semibold text-sand">
                                    {pick(lang, other.city)}{" "}
                                    <Code className="text-xs text-sand/80 border-sand/20 bg-ink">{other.code}</Code>
                                  </span>
                                  <span className="code-id text-xs text-sand/80">{flight.number}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-sand/80">
                                  <span>{flight.gate}</span>
                                  <AppLink
                                    to="/flight/$flightId"
                                    params={{ flightId: flight.id }}
                                    className="font-semibold text-sand hover:underline"
                                  >
                                    {t("flights.details")} →
                                  </AppLink>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                </div>
              </div>
            </Container>
          </section>
        ) : null}

        {/* Living Heritage: 3 floating chapter cards aligned same height/tops, no intro banner */}
        <section aria-label={isAr ? "فصول المطار" : "Airport chapters"}>
          <Container>
            {/* 3 Heritage Chapters Floating Directly Below without stagger */}
            <div className="heritage-depth-group">
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
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
                    className="group relative flex h-full flex-col overflow-hidden rounded-2xl border-[3px] border-sand/30 bg-ink/85 shadow-2xl transition-all duration-300 hover:-translate-y-1 hover:border-sand/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
                      className="relative flex flex-1 flex-col justify-between overflow-hidden bg-ink/80 p-5 text-ink-foreground"
                    >
                      <img
                        data-decorative-asset={`home-airport-${chapter.id}-body`}
                        data-testid={`home-airport-${chapter.id}-body`}
                        src={chapterBodyImages[chapter.id]}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        className="pointer-events-none absolute inset-0 size-full select-none object-cover object-center opacity-30"
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
            </div>
          </Container>
        </section>

        {/* Opening Regional Route Network: Integrated SectionHeader + Floating Cards */}
        <section aria-label={pick(lang, content.copy.destTitle)}>
          <Container>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between rounded-2xl bg-ink/75 p-5 sm:p-6 text-ink-foreground shadow-xl backdrop-blur-xs">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-sand drop-shadow-sm">
                  {pick(lang, content.copy.destTitle)}
                </h2>
                <p className="mt-1 text-sm text-sand/80 max-w-2xl leading-relaxed">
                  {pick(lang, content.copy.destSub)}
                </p>
              </div>
              <AppLink
                to="/destinations"
                className={btnClass("outline", "sm", "border-sand/30 bg-ink text-sand hover:bg-brand-deep hover:text-sand self-start sm:self-auto shrink-0 shadow-md")}
              >
                {t("home.allDest")}
              </AppLink>
            </div>
            {identityUiRequested && (network.isPending || network.isError) ? (
              <div className="mt-4 rounded-2xl bg-sand/90 p-4 sm:p-6 shadow-md text-foreground">
                <NetworkReadState
                  loading={network.isPending}
                  error={network.isError}
                  onRetry={() => void network.refetch()}
                />
              </div>
            ) : null}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {publicDestinations.slice(0, 6).map((destination) => {
                const assignment = destPresentation.assignments.find((a) => a.code === destination.code);
                const photo =
                  (assignment && getDestinationPhotoById(assignment.photoId)) ??
                  getDestinationPhotoByCode(destination.code);
                return (
                  <DestinationCard
                    key={destination.code}
                    destination={destination}
                    photoOverride={photo}
                    focalOverride={assignment?.focalPoint}
                    variant="cinematic"
                  />
                );
              })}
            </div>
          </Container>
        </section>

        {/* Integrated Passenger Utility Rail: Separate Floating Semantic Cards */}
        <section aria-label={t("nav.primary")}>
          <Container>
            <div
              data-home-utility-rail="true"
              className={cn(
                "grid gap-4 sm:grid-cols-2",
                identityUiRequested ? "lg:grid-cols-3" : "lg:grid-cols-4",
              )}
            >
              {/* 01. Flight Status */}
              <AppLink
                to="/flights"
                data-utility-card="flight-status"
                className="group relative flex min-h-18 items-center gap-3.5 overflow-hidden rounded-2xl bg-brand/90 p-4 text-primary-foreground shadow-xl transition-all duration-300 hover:-translate-y-1 hover:bg-brand-deep hover:shadow-2xl focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transform-none motion-reduce:transition-none"
              >
                <img
                  src={utilityStatusImg}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="pointer-events-none absolute inset-0 size-full select-none object-cover opacity-85 ltr:scale-x-[-1]"
                />
                <div
                  className="pointer-events-none absolute inset-0 bg-brand/35 transition-colors duration-200 group-hover:bg-brand/20"
                  aria-hidden="true"
                />
                <Plane
                  aria-hidden="true"
                  className="relative z-10 size-6 shrink-0 opacity-95 rtl:-scale-x-100 drop-shadow-sm"
                />
                <div className="relative z-10 flex flex-col min-w-0">
                  <span className="text-base font-bold text-white drop-shadow-md">
                    {t("home.quickStatusTitle")}
                  </span>
                  <span className="text-xs text-white/90 truncate drop-shadow-sm">
                    {t("home.quickStatusSub")}
                  </span>
                </div>
                <ArrowRight
                  aria-hidden="true"
                  className="relative z-10 ms-auto size-4 text-white/90 opacity-90 rtl:rotate-180 shrink-0"
                />
              </AppLink>

              {/* 02. Online Check-in (Production Gate: !identityUiRequested) */}
              {!identityUiRequested ? (
                <AppLink
                  to="/check-in"
                  data-utility-card="check-in"
                  className="group relative flex min-h-18 items-center gap-3.5 overflow-hidden rounded-2xl bg-sand-deep/90 p-4 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:bg-sand-deep hover:shadow-2xl focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transform-none motion-reduce:transition-none"
                >
                  <img
                    src={utilityCheckinImg}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="pointer-events-none absolute inset-0 size-full select-none object-cover opacity-85 ltr:scale-x-[-1]"
                  />
                  <div
                    className="pointer-events-none absolute inset-0 bg-sand-deep/40 transition-colors duration-200 group-hover:bg-sand-deep/20"
                    aria-hidden="true"
                  />
                  <Ticket aria-hidden="true" className="relative z-10 size-6 shrink-0 text-brand-deep drop-shadow-sm" />
                  <div className="relative z-10 flex flex-col min-w-0">
                    <span className="text-base font-bold text-foreground group-hover:text-brand-deep drop-shadow-xs">
                      {t("home.quickCheckinTitle")}
                    </span>
                    <span className="text-xs text-foreground/85 truncate">
                      {t("home.quickCheckinSub")}
                    </span>
                  </div>
                  <ArrowRight
                    aria-hidden="true"
                    className="relative z-10 ms-auto size-4 text-brand-deep/90 rtl:rotate-180 shrink-0"
                  />
                </AppLink>
              ) : null}

              {/* 03. Travel Guidelines */}
              <AppLink
                to="/travel"
                data-utility-card="travel-guidelines"
                className="group relative flex min-h-18 items-center gap-3.5 overflow-hidden rounded-2xl bg-ink/80 p-4 text-ink-foreground shadow-xl transition-all duration-300 hover:-translate-y-1 hover:bg-ink hover:shadow-2xl focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transform-none motion-reduce:transition-none"
              >
                <img
                  src={utilityTravelImg}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="pointer-events-none absolute inset-0 size-full select-none object-cover opacity-85 ltr:scale-x-[-1]"
                />
                <div
                  className="pointer-events-none absolute inset-0 bg-ink/50 transition-colors duration-200 group-hover:bg-ink/30"
                  aria-hidden="true"
                />
                <Luggage aria-hidden="true" className="relative z-10 size-6 shrink-0 text-clay-soft drop-shadow-sm" />
                <div className="relative z-10 flex flex-col min-w-0">
                  <span className="text-base font-bold text-sand group-hover:text-clay-soft drop-shadow-xs">
                    {t("home.quickBaggageTitle")}
                  </span>
                  <span className="text-xs text-ink-muted truncate">
                    {t("home.quickBaggageSub")}
                  </span>
                </div>
              </AppLink>

              {/* 04. Airport Heritage */}
              <AppLink
                to="/airport"
                data-utility-card="airport-heritage"
                className="group relative flex min-h-18 items-center gap-3.5 overflow-hidden rounded-2xl bg-ink/80 p-4 text-ink-foreground shadow-xl transition-all duration-300 hover:-translate-y-1 hover:bg-ink hover:shadow-2xl focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transform-none motion-reduce:transition-none"
              >
                <img
                  src={utilityHeritageImg}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="pointer-events-none absolute inset-0 size-full select-none object-cover opacity-85 ltr:scale-x-[-1]"
                />
                <div
                  className="pointer-events-none absolute inset-0 bg-ink/50 transition-colors duration-200 group-hover:bg-ink/30"
                  aria-hidden="true"
                />
                <Building2 aria-hidden="true" className="relative z-10 size-6 shrink-0 text-sand/90 drop-shadow-sm" />
                <div className="relative z-10 flex flex-col min-w-0">
                  <span className="text-base font-bold text-sand drop-shadow-xs">
                    {t("home.quickHeritageTitle")}
                  </span>
                  <span className="text-xs text-ink-muted truncate">
                    {t("home.quickHeritageSub")}
                  </span>
                </div>
              </AppLink>
            </div>
          </Container>
        </section>

        {/* Manage Booking & Passenger Information */}
        <section aria-label={pick(lang, content.copy.manageTitle)}>
          <Container>
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Already Booked Card */}
              <div
                data-decorative-asset="already-booked-card"
                className="relative flex flex-col justify-between overflow-hidden rounded-2xl sm:rounded-3xl bg-ink/85 p-6 text-ink-foreground shadow-2xl sm:p-8 lg:col-span-2 backdrop-blur-xs"
              >
                <img
                  src={alreadyBookedImg}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="pointer-events-none absolute inset-0 size-full select-none object-cover object-center opacity-35"
                />
                <div className="relative z-10">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground shadow-xs">
                    <Ticket aria-hidden="true" className="size-5" />
                  </div>
                  <h2 className="mt-4 text-2xl sm:text-3xl font-bold text-ink-foreground">
                    {pick(lang, content.copy.manageTitle)}
                  </h2>
                  <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-muted">
                    {pick(lang, content.copy.manageSub)}
                  </p>
                </div>

                <div className="relative z-10 mt-6 flex flex-wrap gap-3">
                  <AppLink
                    to="/manage"
                    className={btnClass("secondary", "md", "focus-visible:outline-ink-foreground font-semibold")}
                  >
                    {t("nav.manage")}
                  </AppLink>
                  <AppLink
                    to="/signin"
                    className={btnClass("outline", "md", "border-sand/30 bg-ink text-sand hover:bg-brand-deep hover:text-sand focus-visible:outline-ink-foreground font-semibold")}
                  >
                    {t("nav.signin")}
                  </AppLink>
                </div>
              </div>

              {/* Before Travel Card */}
              <div
                data-decorative-asset="before-travel-card"
                className="relative flex flex-col justify-between overflow-hidden rounded-2xl sm:rounded-3xl bg-ink/85 p-6 text-ink-foreground shadow-2xl sm:p-8 backdrop-blur-xs"
              >
                <img
                  src={beforeTravelImg}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="pointer-events-none absolute inset-0 size-full select-none object-cover object-center opacity-35"
                />
                <div className="relative z-10">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-clay-soft text-clay shadow-xs">
                    <Luggage aria-hidden="true" className="size-5" />
                  </div>
                  <h2 className="mt-4 text-lg font-bold text-ink-foreground">
                    {pick(lang, content.copy.infoTitle)}
                  </h2>
                  <ul className="mt-4 space-y-3 divide-y divide-ink-muted/30 text-sm">
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
                          className="flex items-center justify-between gap-2 font-medium text-ink-foreground transition-colors hover:text-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-foreground"
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
                  className={btnClass(
                    "secondary",
                    "sm",
                    "relative z-10 mt-6 self-start text-xs font-semibold focus-visible:outline-ink-foreground",
                  )}
                >
                  {t("common.learnMore")} →
                </AppLink>
              </div>
            </div>
          </Container>
        </section>

        {/* Archival Gallery Preview: Integrated Header + Floating Thumbnail Row */}
        <section data-testid="home-archive-preview" aria-label={pick(lang, content.copy.archiveTitle)}>
          <Container>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between rounded-2xl bg-ink/75 p-5 sm:p-6 text-ink-foreground shadow-xl backdrop-blur-xs">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-sand drop-shadow-sm">
                  {pick(lang, content.copy.archiveTitle)}
                </h2>
                <p className="mt-1 text-sm text-sand/80 max-w-2xl leading-relaxed">
                  {pick(lang, content.copy.archiveSub)}
                </p>
              </div>
              <AppLink
                to="/gallery"
                className={btnClass("outline", "sm", "border-sand/30 bg-ink text-sand hover:bg-brand-deep hover:text-sand self-start sm:self-auto shrink-0 shadow-md")}
              >
                {t("home.openArchive")}
              </AppLink>
            </div>
            <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {archive.map((item) => (
                <li
                  key={item.id}
                  className="group overflow-hidden rounded-xl bg-ink/70 shadow-lg transition-transform hover:-translate-y-1 motion-reduce:transform-none"
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
                      <span className="aspect-square flex size-full items-center justify-center p-3 text-center text-xs text-sand/80">
                        {pick(lang, item.title)}
                      </span>
                    )}
                  </AppLink>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      </div>
    </>
  );
}
