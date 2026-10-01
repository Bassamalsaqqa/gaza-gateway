import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, FileText } from "lucide-react";
import { useMemo } from "react";
import { ChapterNav, ChapterPagination } from "@/components/airport/chapter-nav";
import { Container, Panel } from "@/components/kit";
import { PublicPhotoHero } from "@/components/media/public-photo-hero";
import { ResponsiveImage } from "@/components/responsive-image";
import { getSourceRecordById } from "@/lib/archive";
import { MEDIA } from "@/lib/media";
import { pick, useI18n } from "@/lib/i18n";
import { publishedAirportPast } from "@/content/published/airport-past";
import { ContentPreviewNotice, useContentPreview } from "@/content/preview";

type AirportSearch = {
  skinPreview?: 1;
  studioPreview?: 1;
  baseline?: 1;
};

export const Route = createFileRoute("/{-$locale}/airport/past")({
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
    const rawBaseline = search["baseline"];
    if (rawBaseline === "1" || rawBaseline === 1 || rawBaseline === '"1"') {
      out.baseline = 1;
    }
    return out;
  },
  head: ({ params }) => ({
    meta: [
      { title: publishedAirportPast.seo.title[params.locale === "ar" ? "ar" : "en"] },
      {
        name: "description",
        content: publishedAirportPast.seo.description[params.locale === "ar" ? "ar" : "en"],
      },
      { property: "og:title", content: "The past — Gaza International Airport" },
      { property: "og:description", content: "Construction, opening, operation, closure and memory." },
    ],
  }),
  component: PastPage,
});

function PastPage() {
  const { t, lang } = useI18n();
  const { content, previewing } = useContentPreview("airport.past", publishedAirportPast);

  // Extract all unique source records referenced by published timeline chapters
  const allReferencedSources = useMemo(() => {
    const refs = Array.from(new Set(content.timeline.flatMap((entry) => entry.sourceRefs)));
    return refs
      .map((refId) => getSourceRecordById(refId))
      .filter((record): record is NonNullable<typeof record> => Boolean(record));
  }, [content.timeline]);

  return (
    <>
      {previewing ? <ContentPreviewNotice /> : null}
      {/* Editorial Chapter Hero using accepted historical-documentary hero */}
      <PublicPhotoHero
        mediaId="airport-archive-hero-2000"
        routeKey="past"
        title={pick(lang, content.intro.title)}
        description={pick(lang, content.intro.description)}
        focalPosition="50% 45%"
      />

      <Container className="py-8 sm:py-12">
        {/* Persistent Chapter Sequence Navigation */}
        <ChapterNav activeChapter="past" className="mb-8" />

        {/* Curatorial Standard Notice */}
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {pick(lang, content.intro.notice)}
        </p>

        {/* Chronological Timeline */}
        <section aria-label={t("airport.chapterSequence")} className="mt-12">
          <ol className="relative space-y-12 border-s-2 border-border ps-6 sm:space-y-16 sm:ps-10">
            {content.timeline.filter((entry) => entry.visible).map((entry) => (
              <li key={entry.id} className="relative">
                {/* Timeline Marker Dot */}
                <span
                  aria-hidden="true"
                  className="absolute -start-[1.95rem] top-1.5 grid size-4 place-items-center rounded-full bg-card ring-4 ring-background sm:-start-[2.95rem]"
                >
                  <span className="size-2 rounded-full bg-primary" />
                </span>

                {/* Milestone Era Tag */}
                <div className="flex items-center gap-2">
                  <span className="numeral inline-block font-mono text-sm font-bold text-clay">
                    {entry.period}
                  </span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs font-semibold text-primary">
                    {entry.evidence === "verified"
                      ? t("airport.documentaryRecord")
                      : entry.evidence === "provisional"
                        ? t("airport.provisionalRecord")
                        : t("airport.placeholderRecord")}
                  </span>
                </div>

                {/* Title */}
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {pick(lang, entry.title)}
                </h2>

                {/* Narrative & Visual Stage */}
                <div className="mt-5 space-y-4">
                  <p className="text-base leading-relaxed text-muted-foreground">
                    {pick(lang, entry.body)}
                  </p>

                  {/* Real documentary media if present */}
                  {entry.media?.kind === "media" && entry.media.id in MEDIA ? (
                    <figure className="max-w-md overflow-hidden rounded-2xl border border-border bg-secondary shadow-xs">
                      <div className="relative aspect-4/3 w-full overflow-hidden bg-ink">
                        <ResponsiveImage
                          entry={entry.media.id as keyof typeof MEDIA}
                          sizes="(max-width: 640px) 100vw, 450px"
                          className="size-full object-cover opacity-90 transition-transform duration-500 hover:scale-105"
                        />
                      </div>
                      <figcaption className="p-3 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {pick(lang, entry.title)}
                        </span>
                      </figcaption>
                    </figure>
                  ) : null}

                  {/* Source citations for verified entry */}
                  {entry.sourceRefs && entry.sourceRefs.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <span className="text-xs font-semibold text-foreground">
                        {t("gallery.sourceReferences")}:
                      </span>
                      {entry.sourceRefs.map((refId) => {
                        const src = getSourceRecordById(refId);
                        if (!src) return null;
                        return (
                          <a
                            key={refId}
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-2.5 py-1 text-xs font-medium text-clay hover:border-clay/40 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            <span>{pick(lang, { en: src.title, ar: src.titleAr ?? src.title })}</span>
                            <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
                          </a>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs leading-normal text-muted-foreground/80">
                      {t("airport.awaitingReferences")}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Archival Methodology & Source Documentation */}
        <Panel className="mt-16 border-clay/20 bg-card">
          <div className="flex items-center gap-2.5 text-foreground">
            <FileText aria-hidden="true" className="size-5 text-clay" />
            <h2 className="text-xl font-bold">{t("airport.sources")}</h2>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {t("airport.methodologyBody")}
          </p>
          <p className="mt-2 text-xs leading-normal text-muted-foreground/80">
            {t("airport.awaitingReferences")}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {allReferencedSources.map((source) => (
              <div
                key={source.id}
                className="flex flex-col justify-between rounded-lg border border-border bg-secondary/40 p-3.5 text-xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{source.publisher}</span>
                    <span className="code-id">{source.id}</span>
                  </div>
                  <p className="mt-1.5 font-medium text-foreground leading-snug">
                    {pick(lang, { en: source.title, ar: source.titleAr ?? source.title })}
                  </p>
                  {source.notes ? (
                    <p className="mt-1 text-muted-foreground line-clamp-2">
                      {source.notes}
                    </p>
                  ) : null}
                </div>
                <div className="mt-3 pt-2 border-t border-border/50">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-clay hover:underline"
                  >
                    <span>{t("gallery.viewSource")}</span>
                    <ExternalLink aria-hidden="true" className="size-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Chapter Pagination to Next: Present */}
        <ChapterPagination currentChapter="past" />
      </Container>
    </>
  );
}
