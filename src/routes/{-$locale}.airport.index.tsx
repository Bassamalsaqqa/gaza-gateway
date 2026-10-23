import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { Archive, ArrowRight, BookOpen, Layers, ShieldAlert, Sparkles } from "lucide-react";
import { ChapterNav } from "@/components/airport/chapter-nav";
import { btnClass, Container, Panel } from "@/components/kit";
import { ResponsiveImage } from "@/components/responsive-image";
import { PublicPhotoHero } from "@/components/media/public-photo-hero";
import { ArchiveContributionForm } from "@/components/archive/archive-contribution-form";
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

import { pageHead } from "@/lib/head";
import { getAirportSchema, getBreadcrumbSchema } from "@/lib/structured-data";

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
  head: ({ params }) => {
    const isAr = params.locale === "ar";
    const lang = isAr ? "ar" : "en";
    return pageHead({
      locale: params.locale,
      path: "/airport",
      en: {
        title: "The airport — past, present and future of GZA",
        description:
          "Gaza International Airport in three chapters: its history and archive, its present-day state, and the vision for its future.",
        socialTitle: "The airport — Gaza International Airport (GZA)",
        socialDescription: "History, present state and future vision in three chapters.",
      },
      ar: {
        title: "المطار — ماضي وحاضر ومستقبل مطار غزة الدولي (GZA)",
        description:
          "مطار غزة الدولي في ثلاثة فصول: تاريخه وأرشيفه، واقعه الراهن، ورؤية مستقبله.",
        socialTitle: "المطار — مطار غزة الدولي (GZA)",
        socialDescription: "تاريخ المطار، وواقعه الراهن، ورؤية مستقبله في ثلاثة فصول توثيقية.",
      },
      image: "/social/gaza-airport.jpg",
      schema: [
        getAirportSchema(lang),
        getBreadcrumbSchema([
          { name: isAr ? "الرئيسية" : "Home", path: isAr ? "/ar" : "/" },
          { name: isAr ? "المطار" : "The Airport", path: isAr ? "/ar/airport" : "/airport" },
        ]),
      ],
    });
  },
  component: AirportPage,
});

const chapterCards = [
  {
    id: "past" as const,
    to: "/airport/past" as const,
    numeral: "01",
    mediaId: "past-005" as const,
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
    mediaId: "airport-present-ruins-2008" as const,
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
    mediaId: "aerial-day" as const,
    titleKey: "airport.future" as const,
    horizonKey: "airport.futureHorizon" as const,
    summaryKey: "airport.futureSummary" as const,
    tagKey: "airport.conceptStudy" as const,
    isFuture: true,
  },
] as const;

function AirportPage() {
  const { t, lang } = useI18n();
  const isAr = lang === "ar";

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

        {/* Attributed Project Lead — Ayman Alazraq Artist Statement Connection */}
        <div className="mb-8 rounded-2xl border border-border bg-sand p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1.5 max-w-3xl">
              <div className="flex items-center gap-2">
                <span className="inline-block size-2 rounded-full bg-clay" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {isAr ? "مشروع فني عبر الإنترنت للفنان أيمن الأزرق" : "An internet-based art project by Ayman Alazraq"}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-foreground leading-relaxed">
                {isAr
                  ? "«مطار غزة الدولي — معاد صياغته»: مشروع فني يوثق تاريخ المطار والخطوط الجوية الفلسطينية، ويستحضر الذاكرة والحق في حرية الحركة والتنقل كشكل من أشكال المقاومة في وجه الإلغاء."
                  : "“Gaza International Airport — Remade” is an art project documenting airport heritage and Palestinian Airlines, asserting the right to free movement, return, and remembrance against erasure."}
              </p>
            </div>
            <AppLink
              to="/about"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold text-primary hover:border-primary/60 hover:bg-sand-deep/40 transition-all"
            >
              <span>{isAr ? "عن المشروع وتاريخه ←" : "About the project & history →"}</span>
            </AppLink>
          </div>
        </div>

        {/* Narrative Dossier Introduction */}
        <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h2 className="type-title-lg text-foreground">
              {t("airport.introTitle")}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              {t("airport.introBody")}
            </p>
          </div>
          <div className="shrink-0">
            <a
              href="#contribute"
              className={btnClass("primary", "md", "gap-2 inline-flex items-center cursor-pointer")}
            >
              <Archive aria-hidden="true" className="size-4" />
              <span>{isAr ? "المساهمة في الأرشيف" : "Contribute to Archive"}</span>
            </a>
          </div>
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
                    <ResponsiveImage
                      entry={ch.mediaId}
                      sizes="(min-width: 1024px) 33vw, 100vw"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/30 to-transparent" />
                    <div className="absolute bottom-3 start-4 end-4 flex items-center justify-between text-xs text-ink-muted">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-ink/70 px-2 py-0.5 font-mono text-[11px] text-ink-foreground backdrop-blur-xs">
                        <span className="numeral font-bold text-clay-soft">{ch.numeral}</span>
                        <span>·</span>
                        <span>{t(ch.tagKey)}</span>
                      </span>
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
                      className="pointer-events-none absolute inset-0 size-full select-none object-cover object-center opacity-40"
                    />
                    <div className="relative z-10 flex flex-1 flex-col">
                      <span className="type-label text-xs font-semibold text-clay-soft">{t(ch.horizonKey)}</span>
                      <h3 className="mt-1 text-2xl font-bold tracking-tight text-ink-foreground transition-colors group-hover:text-sand">
                        {t(ch.titleKey)}
                      </h3>
                      <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">
                        {t(ch.summaryKey)}
                      </p>
                    </div>
                  </div>
                </GazaSurface>
              </AppLink>
            </li>
          ))}
        </ul>

        {/* Inline Archival Contribution Section (Sole Form Instance on /airport) */}
        <section
          id="contribute"
          tabIndex={-1}
          aria-label={isAr ? "المساهمة في الأرشيف التوثيقي لمطار غزة الدولي" : "Contribute to the Gaza Airport Digital Archive"}
          className="mt-14 scroll-mt-24 focus:outline-none"
        >
          <ArchiveContributionForm />
        </section>

        {/* Curatorial Standard & Archival Notice */}
        <div className="mt-14 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
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
            <div className="mt-6 flex flex-col gap-2.5">
              <AppLink to="/gallery" className={btnClass("primary", "md", "w-full")}>
                <BookOpen aria-hidden="true" className="size-4" />
                <span>{t("home.openArchive")}</span>
              </AppLink>
              <a
                href="#contribute"
                className={btnClass("outline", "md", "w-full inline-flex items-center justify-center gap-2 cursor-pointer")}
              >
                <Archive aria-hidden="true" className="size-4" />
                <span>{isAr ? "المساهمة في الأرشيف" : "Contribute to Archive"}</span>
              </a>
            </div>
          </div>
        </div>
      </Container>
    </>
  );
}
