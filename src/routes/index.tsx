import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Camera, Luggage, Plane, Ticket } from "lucide-react";
import { useMemo, useState } from "react";
import { FlightSearchForm } from "@/components/flight-search-form";
import { DestinationCard } from "@/components/destination-card";
import { FlightTable } from "@/components/flight-table";
import { btnClass, Code, Container, Eyebrow, SectionHeader } from "@/components/kit";
import { arrivalsOn, departuresOn, destinations, galleryItems, img, todayISO } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
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
        content: "Flights from Gaza with Palestinian Airlines, and the story of the airport they leave from.",
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
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-ink text-ink-foreground">
        <img
          src={img("coastal-runway-sky-dusk", 1920, 1080)}
          alt=""
          className="absolute inset-0 -z-10 size-full object-cover opacity-30"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ink/85 via-ink/70 to-ink" />
        <Container className="pt-14 pb-32 sm:pt-20 sm:pb-40">
          <Eyebrow className="text-clay-soft">{t("home.kicker")}</Eyebrow>
          <h1 className="mt-4 max-w-3xl text-3xl leading-[1.08] font-bold sm:text-5xl lg:text-6xl">{t("home.h1")}</h1>
          <p className="mt-5 max-w-xl text-sm text-ink-muted sm:text-base">{t("home.sub")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/airport" className={btnClass("clay", "md")}>
              {t("home.exploreAirport")}
              <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
            </Link>
            <Link
              to="/flights"
              className={btnClass("ghost", "md", "border border-ink-border text-ink-foreground hover:bg-ink-border")}
            >
              {t("home.viewFlights")}
            </Link>
          </div>
        </Container>
      </section>

      {/* Search */}
      <Container className="-mt-24 sm:-mt-28">
        <FlightSearchForm />
      </Container>

      {/* Board */}
      <Container className="mt-20">
        <SectionHeader
          eyebrow={t("flights.today")}
          title={t("home.boardTitle")}
          description={t("home.boardSub")}
          action={
            <Link to="/flights" className={btnClass("outline", "sm")}>
              {t("home.fullBoard")}
            </Link>
          }
        />
        <div className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-6">
          <div className="flex gap-1 rounded-lg bg-secondary p-1" role="tablist" aria-label={t("flights.title")}>
            {(["departures", "arrivals"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={board === mode}
                onClick={() => setBoard(mode)}
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                  board === mode ? "bg-card text-foreground shadow-[var(--shadow-soft)]" : "text-muted-foreground",
                )}
              >
                {t(mode === "departures" ? "flights.departures" : "flights.arrivals")}
              </button>
            ))}
          </div>
          <div className="mt-4 overflow-x-auto">
            <FlightTable flights={flights} mode={board} compact />
          </div>
        </div>
      </Container>

      {/* Destinations */}
      <Container className="mt-20">
        <SectionHeader
          eyebrow={<span className="code-id">PS</span> ? "Network" : "Network"}
          title={t("home.destTitle")}
          description={t("home.destSub")}
          action={
            <Link to="/destinations" className={btnClass("outline", "sm")}>
              {t("home.allDest")}
            </Link>
          }
        />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.slice(0, 6).map((destination) => (
            <DestinationCard key={destination.code} destination={destination} />
          ))}
        </div>
      </Container>

      {/* Airport story */}
      <section className="mt-24 bg-ink py-20 text-ink-foreground">
        <Container>
          <SectionHeader
            tone="dark"
            eyebrow={t("home.storyKicker")}
            title={t("home.storyTitle")}
            description={t("home.storySub")}
          />
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {(
              [
                { to: "/airport/past", title: "home.past", sub: "home.pastSub", seed: "archive-terminal-old" },
                { to: "/airport/present", title: "home.present", sub: "home.presentSub", seed: "empty-runway-today" },
                { to: "/airport/future", title: "home.future", sub: "home.futureSub", seed: "terminal-concept-render" },
              ] as const
            ).map((chapter) => (
              <Link
                key={chapter.to}
                to={chapter.to}
                className="group relative overflow-hidden rounded-xl border border-ink-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay-soft"
              >
                <img
                  src={img(chapter.seed, 800, 600)}
                  alt=""
                  loading="lazy"
                  className="aspect-[4/3] size-full object-cover opacity-45 transition-all duration-500 group-hover:opacity-60 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <h3 className="text-2xl font-bold">{t(chapter.title)}</h3>
                  <p className="mt-1.5 text-sm text-ink-muted">{t(chapter.sub)}</p>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-clay-soft">
                    {t("airport.readChapter")}
                    <ArrowRight aria-hidden="true" className="size-3.5 rtl:rotate-180" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* Manage + travel info */}
      <Container className="mt-20 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-brand-soft/60 p-6 lg:col-span-2">
          <Ticket aria-hidden="true" className="size-6 text-brand-deep" />
          <h2 className="mt-4 text-2xl font-bold">{t("home.manageTitle")}</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">{t("home.manageSub")}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/manage" className={btnClass("primary", "md")}>
              {t("nav.manage")}
            </Link>
            <Link to="/signin" className={btnClass("outline", "md")}>
              {t("nav.signin")}
            </Link>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <Luggage aria-hidden="true" className="size-6 text-clay" />
          <h2 className="mt-4 text-lg font-bold">{t("home.infoTitle")}</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {(
              [
                { key: "travel.baggage", label: "Baggage", to: "/travel" },
                { key: "travel.documents", label: "Documents", to: "/travel" },
                { key: "travel.accessibility", label: "Accessibility", to: "/travel" },
              ] as const
            ).map((item, i) => (
              <li key={i}>
                <Link to={item.to} className="flex items-center justify-between gap-2 text-foreground hover:text-primary">
                  {[t("book.baggage"), t("book.docNumber"), t("book.assistance")][i]}
                  <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground rtl:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Container>

      {/* Archive */}
      <Container className="mt-20">
        <SectionHeader
          eyebrow={t("nav.gallery")}
          title={t("home.archiveTitle")}
          description={t("home.archiveSub")}
          action={
            <Link to="/gallery" className={btnClass("outline", "sm")}>
              {t("home.openArchive")}
            </Link>
          }
        />
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {archive.map((item) => (
            <li key={item.id} className="overflow-hidden rounded-lg border border-border">
              <Link to="/gallery" aria-label={item.title[lang === "ar" ? "ar" : "en"]}>
                <img
                  src={img(item.imageSeed, 400, 400)}
                  alt=""
                  loading="lazy"
                  className="aspect-square size-full object-cover transition-opacity hover:opacity-85"
                />
              </Link>
            </li>
          ))}
        </ul>
      </Container>

      <Container className="mt-20 mb-4">
        <div className="flex flex-col items-start gap-4 rounded-xl border border-border bg-sand p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Plane aria-hidden="true" className="mt-0.5 size-5 text-brand-deep rtl:-scale-x-100" />
            <p className="max-w-xl text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">
                <Code>GZA</Code> · <Code>PS</Code>
              </span>{" "}
              {t("footer.rights")}
            </p>
          </div>
          <Link to="/about" className={btnClass("outline", "sm")}>
            <Camera aria-hidden="true" className="size-4" />
            {t("nav.about")}
          </Link>
        </div>
      </Container>
    </>
  );
}
