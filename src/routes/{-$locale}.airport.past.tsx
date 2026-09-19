import { createFileRoute } from "@tanstack/react-router";
import { Clock, FileText } from "lucide-react";
import { ChapterNav, ChapterPagination } from "@/components/airport/chapter-nav";
import { Container, Notice, Panel, Pill } from "@/components/kit";
import { img, timeline } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/{-$locale}/airport/past")({
  head: () => ({
    meta: [
      { title: "The past — history and archive of Gaza International Airport" },
      {
        name: "description",
        content:
          "The history of Gaza International Airport told in chapters: construction, the 1998 opening, years of operation, closure, and the record kept since.",
      },
      { property: "og:title", content: "The past — Gaza International Airport" },
      { property: "og:description", content: "Construction, opening, operation, closure and memory." },
    ],
  }),
  component: PastPage,
});

function PastPage() {
  const { t, lang } = useI18n();

  return (
    <>
      {/* Editorial Chapter Hero */}
      <section className="relative isolate overflow-hidden bg-ink text-ink-foreground">
        <img
          src={img("airport-archive-hall", 1920, 1000)}
          alt=""
          className="absolute inset-0 -z-10 size-full object-cover opacity-30"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/80 to-ink/60" />
        <Container className="py-16 sm:py-24">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-border px-3 py-1 text-xs font-semibold text-clay-soft">
              <span className="numeral font-mono">01</span>
              <span>·</span>
              <span>{t("airport.chapter1")}</span>
            </span>
            <span className="text-xs font-medium text-ink-muted">{t("airport.pastHorizon")}</span>
          </div>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            {t("airport.past")}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
            {t("airport.pastSubtitle")}
          </p>
        </Container>
      </section>

      <Container className="py-8 sm:py-12">
        {/* Persistent Chapter Sequence Navigation */}
        <ChapterNav activeChapter="past" className="mb-10" />

        {/* Curatorial Standard Notice */}
        <Notice title={t("airport.placeholder")}>
          <p className="text-sm leading-relaxed">
            {t("airport.pastNotice")}
          </p>
        </Notice>

        {/* Chronological Timeline */}
        <section aria-label={t("airport.chapterSequence")} className="mt-12">
          <ol className="relative space-y-12 border-s-2 border-border ps-6 sm:space-y-16 sm:ps-10">
            {timeline.map((entry) => (
              <li key={entry.id} className="relative">
                {/* Timeline Marker Dot */}
                <span
                  aria-hidden="true"
                  className="absolute -start-[1.95rem] top-1.5 grid size-4 place-items-center rounded-full bg-card ring-4 ring-background sm:-start-[2.95rem]"
                >
                  <span className="size-2 rounded-full bg-primary" />
                </span>

                {/* Milestone Era Tag */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="numeral inline-block font-mono text-sm font-bold text-clay">
                    {entry.year}
                  </span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <Pill tone="clay" className="text-[11px]">
                    <Clock aria-hidden="true" className="size-3" />
                    <span>{t("airport.provisionalRecord")}</span>
                  </Pill>
                  <span className="code-id text-xs text-muted-foreground">
                    [CATALOG-ID-FIELD]
                  </span>
                </div>

                {/* Title */}
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {pick(lang, entry.title)}
                </h2>

                {/* Narrative & Visual Stage */}
                <div className="mt-5 grid gap-6 sm:grid-cols-[1.3fr_1fr] sm:items-start">
                  <div className="space-y-3">
                    <p className="text-base leading-relaxed text-muted-foreground">
                      {pick(lang, entry.body)}
                    </p>
                    <p className="text-xs leading-normal text-muted-foreground/80">
                      {t("airport.awaitingReferences")}
                    </p>
                  </div>

                  <figure className="overflow-hidden rounded-2xl border border-border bg-secondary shadow-xs">
                    <div className="relative aspect-4/3 w-full overflow-hidden bg-ink">
                      <img
                        src={img(entry.imageSeed, 800, 560)}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover opacity-80 transition-transform duration-500 hover:scale-105"
                      />
                      <span className="absolute bottom-2 end-2 rounded-md bg-ink/80 px-2 py-0.5 font-mono text-[10px] text-ink-muted">
                        [PROVENANCE]
                      </span>
                    </div>
                    <figcaption className="p-3 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {pick(lang, entry.title)}
                      </span>
                      <span className="block mt-0.5 text-[11px] text-muted-foreground/80">
                        {t("airport.placeholderNote")}
                      </span>
                    </figcaption>
                  </figure>
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
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="code-id rounded-md bg-secondary px-2.5 py-1 text-muted-foreground">
              [CATALOG-ID-FIELD]
            </span>
            <span className="code-id rounded-md bg-secondary px-2.5 py-1 text-muted-foreground">
              [PROVENANCE]
            </span>
          </div>
        </Panel>

        {/* Chapter Pagination to Next: Present */}
        <ChapterPagination currentChapter="past" />
      </Container>
    </>
  );
}
