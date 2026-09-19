import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Building2, Lightbulb, Plane, Sparkles } from "lucide-react";
import { ChapterNav, ChapterPagination } from "@/components/airport/chapter-nav";
import { Container, Notice, Panel } from "@/components/kit";
import { destinations, img } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/{-$locale}/airport/future")({
  head: () => ({
    meta: [
      { title: "The future — vision for Gaza International Airport" },
      {
        name: "description",
        content:
          "Concepts for a reopened Gaza International Airport: terminal proposals, masterplan thinking, future passenger experience and a growing route network.",
      },
      { property: "og:title", content: "The future — Gaza International Airport" },
      { property: "og:description", content: "Terminal concepts, masterplan and future passenger experience." },
    ],
  }),
  component: FuturePage,
});

function FuturePage() {
  const { t, lang } = useI18n();

  const themes = [
    {
      icon: Building2,
      numeral: "01",
      titleKey: "airport.themeTerminalTitle" as const,
      bodyKey: "airport.themeTerminalBody" as const,
      seed: "terminal-concept-render",
      tag: "[PROVENANCE]",
    },
    {
      icon: Sparkles,
      numeral: "02",
      titleKey: "airport.themeHospitalityTitle" as const,
      bodyKey: "airport.themeHospitalityBody" as const,
      seed: "future-departures-hall",
      tag: "[PROVENANCE]",
    },
    {
      icon: Plane,
      numeral: "03",
      titleKey: "airport.themeMasterplanTitle" as const,
      bodyKey: "airport.themeMasterplanBody" as const,
      seed: "masterplan-diagram",
      tag: "[PROVENANCE]",
    },
  ];

  return (
    <>
      {/* Editorial Chapter Hero */}
      <section className="relative isolate overflow-hidden bg-ink text-ink-foreground">
        <img
          src={img("future-airport-vision", 1920, 1000)}
          alt=""
          className="absolute inset-0 -z-10 size-full object-cover opacity-35"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/80 to-ink/50" />
        <Container className="py-16 sm:py-24">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-border px-3 py-1 text-xs font-semibold text-clay-soft">
              <span className="numeral font-mono">03</span>
              <span>·</span>
              <span>{t("airport.chapter3")}</span>
            </span>
            <span className="text-xs font-medium text-ink-muted">{t("airport.futureHorizon")}</span>
          </div>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            {t("airport.future")}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
            {t("airport.futureSubtitle")}
          </p>
        </Container>
      </section>

      <Container className="py-8 sm:py-12">
        {/* Persistent Chapter Sequence Navigation */}
        <ChapterNav activeChapter="future" className="mb-10" />

        {/* Conceptual Planning Status Notice */}
        <Notice title={t("airport.placeholder")}>
          <p className="text-sm leading-relaxed">
            {t("airport.futureNotice")}
          </p>
        </Notice>

        {/* Masterplan Pillars / Themes */}
        <div className="mt-12 space-y-10">
          {themes.map((theme, index) => (
            <article
              key={theme.numeral}
              className={`grid gap-6 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] sm:grid-cols-2 ${
                index % 2 === 1 ? "sm:[&>figure]:order-last" : ""
              }`}
            >
              {/* Architectural Concept Visual */}
              <figure className="relative m-0 aspect-16/10 size-full overflow-hidden bg-ink sm:aspect-auto">
                <img
                  src={img(theme.seed, 900, 700)}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover opacity-85 transition-transform duration-500 hover:scale-105"
                />
                <span className="absolute bottom-3 start-4 rounded-md bg-ink/80 px-2 py-0.5 font-mono text-xs text-ink-muted">
                  {theme.tag}
                </span>
              </figure>

              {/* Narrative Content */}
              <div className="flex flex-col justify-between p-6 sm:p-8">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="numeral font-mono text-xs font-bold text-clay">
                      {theme.numeral}
                    </span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <theme.icon aria-hidden="true" className="size-4 text-primary" />
                    <span className="type-label text-xs text-muted-foreground">{t("airport.conceptStudy")}</span>
                  </div>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                    {t(theme.titleKey)}
                  </h2>
                  <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                    {t(theme.bodyKey)}
                  </p>
                </div>

                <div className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {t("airport.designIntentLabel")}{" "}
                  </span>
                  <span>
                    {t("airport.designIntentText")}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Future Network Vision Panel */}
        <Panel className="mt-14 border-clay/20 bg-card">
          <div className="flex items-center gap-2 text-foreground">
            <Lightbulb aria-hidden="true" className="size-5 text-clay" />
            <h2 className="text-xl font-bold">
              {t("airport.networkTitle")}
            </h2>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {t("airport.networkBody")}
          </p>

          <ul className="mt-5 flex flex-wrap gap-2.5">
            {destinations.map((destination) => (
              <li key={destination.code}>
                <AppLink
                  to="/destinations/$code"
                  params={{ code: destination.code }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-input bg-card px-3.5 py-2 text-sm font-semibold transition-all hover:border-primary hover:bg-secondary/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                >
                  <span className="code-id text-clay">{destination.code}</span>
                  <span className="text-foreground">{pick(lang, destination.city)}</span>
                  <ArrowRight aria-hidden="true" className="size-3.5 text-muted-foreground rtl:rotate-180" />
                </AppLink>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Chapter Pagination to Previous (Present) and Next (Archive) */}
        <ChapterPagination currentChapter="future" />
      </Container>
    </>
  );
}
