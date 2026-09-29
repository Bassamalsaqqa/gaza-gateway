import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Layers, ShieldAlert } from "lucide-react";
import { ChapterNav } from "@/components/airport/chapter-nav";
import { btnClass, Container, Panel } from "@/components/kit";
import { img } from "@/lib/data";
import { ResponsiveImage } from "@/components/responsive-image";
import { PublicPhotoHero } from "@/components/media/public-photo-hero";
import { useI18n } from "@/lib/i18n";
import { GazaSurface } from "@/design/surfaces";
import pastBodyImg from "@/assets/media/decorative/airport/airport-past-body.webp";
import presentBodyImg from "@/assets/media/decorative/airport/airport-present-body.webp";
import futureBodyImg from "@/assets/media/decorative/airport/airport-future-body.webp";
import sourcesMetadataImg from "@/assets/media/decorative/airport/airport-sources-metadata.webp";

const chapterBodyImages = {
  past: pastBodyImg,
  present: presentBodyImg,
  future: futureBodyImg,
} as const;

type AirportSearch = {
  skinPreview?: 1;
  studioPreview?: 1;
};

export const Route = createFileRoute("/{-$locale}/airport/")({
  validateSearch: (search: Record<string, unknown>): AirportSearch => {
    const out: AirportSearch = {};
    const rawPreview = search["skinPreview"];
    if (rawPreview === "1" || rawPreview === 1 || rawPreview === '"1"') {
      out.skinPreview = 1;
    }
    const rawStudio = search["studioPreview"];
    if (rawStudio === "1" || rawStudio === 1 || rawStudio === '"1"') {
      out.studioPreview = 1;
    }
    return out;
  },
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
      <PublicPhotoHero
        mediaId="airport-archive-hero-2000"
        routeKey="airport"
        title={t("airport.title")}
        description={t("airport.sub")}
        focalPosition="center 0%"
      />

      <Container className="py-8 sm:py-12">
        {/* Persistent Chapter Sequence Navigation */}
        <ChapterNav activeChapter="overview" className="mb-8" />

        {/* Narrative Dossier Introduction */}
        <div className="mb-10 max-w-3xl">
          <h2 className="type-title-lg text-foreground">
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
                className="group flex h-full flex-col overflow-hidden rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <GazaSurface
                  family="editorial"
                  target="airport.chapter-card"
                  baselineClassName="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] transition-all hover:border-border/80 hover:shadow-[var(--shadow-lift)]"
                  className="flex h-full flex-col overflow-hidden transition-all hover:shadow-[var(--shadow-lift)]"
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
                      {ch.isFuture && (
                        <span className="text-[11px] text-clay-soft/90 font-mono">
                          {t("media.conceptShortLabel")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Editorial Content */}
                  <div
                    data-decorative-asset={`airport-${ch.id}-body`}
                    data-testid={`airport-${ch.id}-body`}
                    className="relative flex flex-1 flex-col overflow-hidden bg-ink p-5 sm:p-6 text-ink-foreground"
                  >
                    <img
                      data-decorative-asset={`airport-${ch.id}-body`}
                      data-testid={`airport-${ch.id}-body`}
                      src={chapterBodyImages[ch.id]}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className="pointer-events-none absolute inset-0 size-full select-none object-cover object-center"
                    />
                    <div className="relative z-10 flex flex-1 flex-col">
                      <span className="type-label text-xs font-semibold text-clay-soft">{t(ch.horizonKey)}</span>
                      <h3 className="mt-1 text-2xl font-bold tracking-tight text-ink-foreground transition-colors group-hover:text-sand">
                        {t(ch.titleKey)}
                      </h3>
                      <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">
                        {t(ch.summaryKey)}
                      </p>

                      <div className="mt-6 flex items-center gap-2 border-t border-ink-border pt-4 text-sm font-semibold text-sand transition-colors group-hover:text-sand-deep">
                        <span>{t("airport.readChapter")}</span>
                        <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
                      </div>
                    </div>
                  </div>
                </GazaSurface>
              </AppLink>
            </li>
          ))}
        </ul>

        {/* Curatorial Standard & Archival Notice */}
        <div className="mt-12 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Panel
            data-decorative-asset="airport-sources-metadata"
            data-testid="airport-sources-metadata"
            className="relative overflow-hidden border-border bg-ink p-6 text-ink-foreground"
          >
            <img
              data-decorative-asset="airport-sources-metadata"
              data-testid="airport-sources-metadata"
              src={sourcesMetadataImg}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="pointer-events-none absolute inset-0 size-full select-none object-cover object-center"
            />
            <div className="pointer-events-none absolute inset-0 bg-ink/40" aria-hidden="true" />
            <div className="relative z-10">
              <div className="flex items-center gap-2.5 text-clay-soft">
                <ShieldAlert aria-hidden="true" className="size-5 shrink-0" />
                <h3 className="text-lg font-bold text-ink-foreground">{t("airport.sources")}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ink-foreground">
                {t("airport.sourcesBody")}
              </p>
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
