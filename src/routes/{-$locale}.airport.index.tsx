import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Layers, ShieldAlert } from "lucide-react";
import { ChapterNav } from "@/components/airport/chapter-nav";
import { btnClass, Container, Eyebrow, PageHeader, Panel } from "@/components/kit";
import { img } from "@/lib/data";
import { ResponsiveImage } from "@/components/responsive-image";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/{-$locale}/airport/")({
  head: () => ({
    meta: [
      { title: "The airport — past, present and future of GZA" },
      {
        name: "description",
        content:
          "Gaza International Airport in three chapters: its history and archive, its present-day state, and the vision for its future.",
      },
      { property: "og:title", content: "The airport — Gaza International Airport (GZA)" },
      { property: "og:description", content: "History, present state and future vision in three chapters." },
    ],
  }),
  component: AirportPage,
});

const chapterCards = [
  {
    id: "past" as const,
    to: "/airport/past" as const,
    numeral: "01",
    seed: "airport-archive-hall",
    titleKey: "airport.past" as const,
    horizonKey: "airport.pastHorizon" as const,
    summaryKey: "airport.pastSummary" as const,
    tagKey: "airport.provisionalRecord" as const,
    isFuture: false,
  },
  {
    id: "present" as const,
    to: "/airport/present" as const,
    numeral: "02",
    seed: "airport-present-ground",
    titleKey: "airport.present" as const,
    horizonKey: "airport.presentHorizon" as const,
    summaryKey: "airport.presentSummary" as const,
    tagKey: "airport.documentaryRecord" as const,
    isFuture: false,
  },
  {
    id: "future" as const,
    to: "/airport/future" as const,
    numeral: "03",
    seed: "airport-future-concept",
    titleKey: "airport.future" as const,
    horizonKey: "airport.futureHorizon" as const,
    summaryKey: "airport.futureSummary" as const,
    tagKey: "airport.conceptStudy" as const,
    isFuture: true,
  },
] as const;

function AirportPage() {
  const { t } = useI18n();

  return (
    <>
      <PageHeader
        eyebrow={t("nav.airport")}
        title={t("airport.title")}
        description={t("airport.sub")}
      />

      <Container className="py-8 sm:py-12">
        {/* Persistent Chapter Sequence Navigation */}
        <ChapterNav activeChapter="overview" className="mb-10" />

        {/* Narrative Dossier Introduction */}
        <div className="mb-10 max-w-3xl">
          <Eyebrow className="text-clay">{t("airport.chapterSequence")}</Eyebrow>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t("airport.introTitle")}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {t("airport.introBody")}
          </p>
        </div>

        {/* 3 Sequential Editorial Chapters */}
        <ul className="grid gap-6 lg:grid-cols-3">
          {chapterCards.map((ch) => (
            <li key={ch.id} className="flex flex-col">
              <AppLink
                to={ch.to}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] transition-all hover:border-border/80 hover:shadow-[var(--shadow-lift)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {/* Visual Anchor */}
                <div className="relative aspect-16/10 w-full overflow-hidden bg-ink">
                  {ch.isFuture ? (
                    <ResponsiveImage
                      entry="aerial-day"
                      sizes="(min-width: 1024px) 33vw, 100vw"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <img
                      src={img(ch.seed, 900, 560)}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover opacity-75 transition-transform duration-500 group-hover:scale-105"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/30 to-transparent" />
                  <div className="absolute bottom-3 start-4 end-4 flex items-center justify-between text-xs text-ink-muted">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-ink/70 px-2 py-0.5 font-mono text-[11px] text-ink-foreground backdrop-blur-xs">
                      <span className="numeral font-bold text-clay-soft">{ch.numeral}</span>
                      <span>·</span>
                      <span>{t(ch.tagKey)}</span>
                    </span>
                    {ch.isFuture ? (
                      <span className="text-[11px] text-clay-soft/90 font-mono">
                        {t("media.conceptShortLabel")}
                      </span>
                    ) : (
                      <span className="text-[11px] text-ink-muted/80">[PROVENANCE]</span>
                    )}
                  </div>
                </div>

                {/* Editorial Content */}
                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <span className="type-label text-xs text-clay">{t(ch.horizonKey)}</span>
                  <h3 className="mt-1 text-2xl font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
                    {t(ch.titleKey)}
                  </h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {t(ch.summaryKey)}
                  </p>

                  <div className="mt-6 flex items-center gap-2 border-t border-border pt-4 text-sm font-semibold text-primary transition-colors group-hover:text-brand-deep">
                    <span>{t("airport.readChapter")}</span>
                    <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
                  </div>
                </div>
              </AppLink>
            </li>
          ))}
        </ul>

        {/* Curatorial Standard & Archival Notice */}
        <div className="mt-12 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Panel className="border-clay/20 bg-card">
            <div className="flex items-center gap-2.5 text-clay">
              <ShieldAlert aria-hidden="true" className="size-5 shrink-0" />
              <h3 className="text-lg font-bold text-foreground">{t("airport.sources")}</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t("airport.sourcesBody")}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="code-id rounded-md bg-secondary px-2 py-1 text-muted-foreground">
                [CATALOG-ID-FIELD]
              </span>
              <span className="code-id rounded-md bg-secondary px-2 py-1 text-muted-foreground">
                [PROVENANCE]
              </span>
            </div>
          </Panel>

          <div className="flex flex-col justify-between rounded-2xl border border-border bg-sand p-6 shadow-xs">
            <div>
              <div className="flex items-center gap-2 text-foreground">
                <Layers aria-hidden="true" className="size-5 text-primary" />
                <h3 className="text-lg font-bold">{t("gallery.title")}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t("gallery.sub")}
              </p>
            </div>
            <div className="mt-6">
              <AppLink to="/gallery" className={btnClass("primary", "md", "w-full")}>
                <BookOpen aria-hidden="true" className="size-4" />
                <span>{t("home.openArchive")}</span>
              </AppLink>
            </div>
          </div>
        </div>
      </Container>
    </>
  );
}
