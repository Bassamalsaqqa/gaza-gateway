import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, FileText, Play } from "lucide-react";
import { useMemo } from "react";
import { ChapterNav, ChapterPagination } from "@/components/airport/chapter-nav";
import { Container, Panel } from "@/components/kit";
import { PublicPhotoHero } from "@/components/media/public-photo-hero";
import { ResponsiveImage } from "@/components/responsive-image";
import {
  getSourceRecordById,
  getPublishedArchiveRecordsForTimelineEvent,
  getVerifiedVideoReferences,
} from "@/lib/archive";
import { ArchiveVideoPlayer } from "@/components/archive/archive-video-player";
import { MEDIA } from "@/lib/media";
import { pick, useI18n } from "@/lib/i18n";
import { publishedAirportPast } from "@/content/published/airport-past";
import { ContentPreviewNotice, useContentPreview } from "@/content/preview";
import airportSourcesMetadataImg from "@/assets/media/decorative/airport/airport-sources-metadata.webp";

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

  // Verified external video references
  const verifiedVideos = useMemo(() => getVerifiedVideoReferences(), []);

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
              <li key={entry.id} data-timeline-id={entry.id} className="relative">
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

                  {/* Canonical documentary photo strip for this timeline event */}
                  {(() => {
                    const eventPhotos = getPublishedArchiveRecordsForTimelineEvent(entry.id);
                    if (eventPhotos.length === 0) return null;
                    return (
                      <div className="mt-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          {eventPhotos.map((photo) => {
                            if (!photo.mediaId || !(photo.mediaId in MEDIA)) return null;
                            return (
                              <figure
                                key={photo.id}
                                className="group overflow-hidden rounded-xl border border-border bg-card shadow-2xs"
                              >
                                <div className="relative aspect-4/3 w-full overflow-hidden bg-ink">
                                  <ResponsiveImage
                                    entry={photo.mediaId as keyof typeof MEDIA}
                                    sizes="(max-width: 640px) 100vw, 240px"
                                    altOverride={{ en: photo.alt.en, ar: photo.alt.ar }}
                                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                                  />
                                </div>
                                <figcaption className="p-2.5 text-xs text-muted-foreground">
                                  <span className="font-semibold text-foreground line-clamp-1">
                                    {pick(lang, photo.title)}
                                  </span>
                                  {photo.rights?.credit ? (
                                    <span className="mt-0.5 block text-[11px] text-muted-foreground/80 line-clamp-1">
                                      {photo.rights.credit}
                                    </span>
                                  ) : null}
                                </figcaption>
                              </figure>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

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
                            <ExternalLink aria-hidden="true" className="size-3 shrink-0 rtl:scale-x-[-1]" />
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

        {/* Archival Video Section — Watch the archive / شاهد الأرشيف */}
        <section className="mt-16 border-t border-border pt-12" aria-labelledby="watch-archive-heading">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
              <Play aria-hidden="true" className="size-3.5 fill-current" />
              <span>{t("gallery.externalVideo")}</span>
            </div>
            <h2 id="watch-archive-heading" className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {t("airport.watchArchive")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t("airport.watchArchiveSub")}
            </p>
          </div>

          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {verifiedVideos.map((video) => (
              <div
                key={video.id}
                className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs"
              >
                <ArchiveVideoPlayer
                  youtubeId={video.youtubeId}
                  title={pick(lang, video.title)}
                  facade={true}
                  originalUrl={video.url}
                  className="w-full"
                />
                <div className="flex flex-1 flex-col justify-between p-4">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{video.publisher}</span>
                      <span className="code-id text-clay">{video.date}</span>
                    </div>
                    <h3 className="mt-1.5 text-base font-bold text-foreground leading-snug">
                      {pick(lang, video.title)}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {pick(lang, video.caption)}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-clay hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <span>{t("gallery.watchSource")}</span>
                      <ExternalLink aria-hidden="true" className="size-3 rtl:scale-x-[-1]" />
                    </a>
                    <span className="code-id text-[11px] text-muted-foreground/70">{video.sourceRef}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
            {t("airport.sourcesNoticeMixed")}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {allReferencedSources.map((source) => (
              <a
                key={source.id}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${pick(lang, { en: source.title, ar: source.titleAr ?? source.title })} (${source.publisher})`}
                className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-ink p-5 text-ink-foreground shadow-xs transition-all hover:border-border/80 hover:shadow-[var(--shadow-lift)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <img
                  src={airportSourcesMetadataImg}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="pointer-events-none absolute inset-0 size-full select-none object-cover object-center opacity-35"
                />
                <div className="relative z-10 flex flex-1 flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-ink-muted">
                      <span className="font-semibold text-ink-foreground">{source.publisher}</span>
                      <span className="code-id text-clay-soft">{source.id}</span>
                    </div>
                    <h3 className="mt-2 text-sm font-bold text-ink-foreground leading-snug transition-colors group-hover:text-sand">
                      {pick(lang, { en: source.title, ar: source.titleAr ?? source.title })}
                    </h3>
                    {(() => {
                      const note = lang === "ar" ? source.notesAr : source.notes;
                      return note ? (
                        <p className="mt-2 text-xs leading-relaxed text-ink-muted/90 line-clamp-3">
                          {note}
                        </p>
                      ) : null;
                    })()}
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 border-t border-ink-border pt-3 text-xs font-semibold text-clay-soft transition-colors group-hover:text-sand">
                    <span>
                      {source.type === "video" ? t("gallery.watchSource") : t("gallery.viewSource")}
                    </span>
                    <ExternalLink aria-hidden="true" className="size-3.5 rtl:scale-x-[-1]" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        </Panel>

        {/* Chapter Pagination to Next: Present */}
        <ChapterPagination currentChapter="past" />
      </Container>
    </>
  );
}
