import { createFileRoute } from "@tanstack/react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, ExternalLink, Info, Play, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppLink } from "@/components/app-link";
import { btnClass, Container, EmptyState } from "@/components/kit";
import { PublicPhotoHero } from "@/components/media/public-photo-hero";
import { ResponsiveImage } from "@/components/responsive-image";
import { ArchiveVideoPlayer } from "@/components/archive/archive-video-player";
import {
  getGalleryItems,
  getDerivedFilterOptions,
  getAllSourceRecords,
  getSourceRecordById,
  type GalleryDisplayItem,
} from "@/lib/archive";
import {
  MEDIUM_LABELS,
  HISTORICAL_PHASE_LABELS,
  SOURCE_TYPE_LABELS,
  ARCHIVE_SUBJECT_LABELS,
  type Medium,
  type HistoricalPhase,
  type ArchiveSubject,
} from "@/lib/archive/types";
import { MEDIA } from "@/lib/media";
import { pick, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import galleryFilterToolbarImg from "@/assets/media/decorative/gallery/gallery-filter-toolbar.webp";
import galleryItemBodyImg from "@/assets/media/decorative/gallery/gallery-item-body.webp";

export const Route = createFileRoute("/{-$locale}/gallery")({
  head: () => ({
    meta: [
      { title: "Archive — Gaza International Airport (GZA)" },
      {
        name: "description",
        content:
          "Browse historical and documentary records of Gaza International Airport: photographs, documents, architecture, and archival footage.",
      },
      { property: "og:title", content: "Archive — Gaza International Airport" },
      {
        property: "og:description",
        content: "Historical and documentary records of Gaza International Airport.",
      },
    ],
  }),
  component: GalleryPage,
});

type CategoryFilter = Medium | "all";
type PhaseFilter = HistoricalPhase | "all";
type SubjectFilter = ArchiveSubject | "all";

const LOCATION_DISPLAY: Record<string, { en: string; ar: string }> = {
  "Rafah, Gaza Strip": { en: "Rafah, Gaza Strip", ar: "رفح، قطاع غزة" },
  "El Arish, Egypt": { en: "El Arish, Egypt", ar: "العريش، مصر" },
};

function formatLocation(loc: string | undefined, lang: "en" | "ar"): string {
  if (!loc) return "—";
  return LOCATION_DISPLAY[loc]?.[lang] ?? loc;
}

function GalleryPage() {
  const { t, lang } = useI18n();
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [era, setEra] = useState<PhaseFilter>("all");
  const [subject, setSubject] = useState<SubjectFilter>("all");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [openingItemId, setOpeningItemId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Canonical gallery items: 38 published photos/documents + 4 verified video references
  const galleryItems = useMemo(() => getGalleryItems(), []);
  const externalSources = useMemo(() => getAllSourceRecords(), []);

  // Dynamically derive available filter options from actual published dataset
  const filterOptions = useMemo(() => getDerivedFilterOptions(galleryItems), [galleryItems]);
  const availableMediums = filterOptions.mediums;
  const availablePhases = filterOptions.phases;
  const availableSubjects = filterOptions.subjects;

  const items = useMemo(
    () =>
      galleryItems.filter(
        (item) =>
          (category === "all" || item.medium === category) &&
          (era === "all" || item.phase === era) &&
          (subject === "all" || item.subjects.includes(subject)),
      ),
    [galleryItems, category, era, subject],
  );

  // Keyboard navigation for Lightbox while open
  useEffect(() => {
    if (openIndex === null) return;

    const onKey = (e: KeyboardEvent) => {
      if (items.length <= 1) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        setOpenIndex((i) => {
          if (i === null) return null;
          return lang === "ar" ? (i - 1 + items.length) % items.length : (i + 1) % items.length;
        });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setOpenIndex((i) => {
          if (i === null) return null;
          return lang === "ar" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        });
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIndex, items.length, lang]);

  // Prevent background page scrolling while Lightbox modal is open
  useEffect(() => {
    if (openIndex === null) return;
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, [openIndex]);

  const current: GalleryDisplayItem | null =
    openIndex !== null ? (items[openIndex] ?? null) : null;

  const handleOpen = (index: number, id: string) => {
    setOpeningItemId(id);
    setOpenIndex(index);
  };

  const handleClose = () => {
    setOpenIndex(null);
  };

  const handlePrev = () => {
    if (openIndex === null || items.length <= 1) return;
    setOpenIndex((openIndex - 1 + items.length) % items.length);
  };

  const handleNext = () => {
    if (openIndex === null || items.length <= 1) return;
    setOpenIndex((openIndex + 1) % items.length);
  };

  return (
    <>
      <PublicPhotoHero
        mediaId="gallery-aircraft-archive-2000"
        routeKey="gallery"
        title={t("gallery.title")}
        description={t("gallery.sub")}
        focalPosition="50% 50%"
      >
        <p className="mt-1 text-xs sm:text-sm text-white/80">
          {t("gallery.futureIntro")}{" "}
          <AppLink
            to="/airport/future"
            className="font-semibold text-sand-deep underline underline-offset-4 hover:text-white"
          >
            {t("gallery.futureLink")}
          </AppLink>
          .
        </p>
      </PublicPhotoHero>

      <Container className="py-8 sm:py-12">
        {/* Concise Public Rights Notice */}
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-border/70 bg-sand-deep/40 p-4 text-xs text-foreground shadow-2xs">
          <Info aria-hidden="true" className="size-4 shrink-0 text-clay mt-0.5" />
          <p className="leading-relaxed">
            {t("gallery.publicRightsNotice")}
          </p>
        </div>

        {/* Dynamic Standard Filter Toolbar */}
        <div
          data-decorative-asset="gallery-filter-toolbar"
          data-testid="gallery-filter-toolbar"
          className="relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-xl border border-border bg-clay p-3.5 sm:p-4 text-ink-foreground shadow-xs"
        >
          <img
            data-decorative-asset="gallery-filter-toolbar"
            data-testid="gallery-filter-toolbar"
            src={galleryFilterToolbarImg}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="pointer-events-none absolute inset-0 size-full select-none object-cover object-center"
          />
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 w-full">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              {/* Category Dropdown (guarded when 2+ options exist) */}
              {availableMediums.length >= 2 ? (
                <div className="flex items-center gap-2">
                  <label htmlFor="filter-category" className="text-xs font-semibold text-white whitespace-nowrap">
                    {t("gallery.filterCategory")}
                  </label>
                  <select
                    id="filter-category"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value as CategoryFilter);
                      setOpenIndex(null);
                    }}
                    className="h-11 sm:h-9 rounded-lg border border-input bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                  >
                    <option value="all">{t("gallery.categoryAll")}</option>
                    {availableMediums.map((id) => (
                      <option key={id} value={id}>
                        {MEDIUM_LABELS[id]?.[lang] ?? id}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/* Era Dropdown (guarded when 2+ options exist) */}
              {availablePhases.length >= 2 ? (
                <div className="flex items-center gap-2">
                  <label htmlFor="filter-era" className="text-xs font-semibold text-white whitespace-nowrap">
                    {t("gallery.filterEra")}
                  </label>
                  <select
                    id="filter-era"
                    value={era}
                    onChange={(e) => {
                      setEra(e.target.value as PhaseFilter);
                      setOpenIndex(null);
                    }}
                    className="h-11 sm:h-9 rounded-lg border border-input bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                  >
                    <option value="all">{t("gallery.eraAll")}</option>
                    {availablePhases.map((id) => (
                      <option key={id} value={id}>
                        {HISTORICAL_PHASE_LABELS[id]?.[lang] ?? id}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/* Subject Dropdown (guarded when 2+ options exist) */}
              {availableSubjects.length >= 2 ? (
                <div className="flex items-center gap-2">
                  <label htmlFor="filter-subject" className="text-xs font-semibold text-white whitespace-nowrap">
                    {t("gallery.filterSubject")}
                  </label>
                  <select
                    id="filter-subject"
                    value={subject}
                    onChange={(e) => {
                      setSubject(e.target.value as SubjectFilter);
                      setOpenIndex(null);
                    }}
                    className="h-11 sm:h-9 rounded-lg border border-input bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                  >
                    <option value="all">{t("gallery.subjectAll")}</option>
                    {availableSubjects.map((id) => (
                      <option key={id} value={id}>
                        {ARCHIVE_SUBJECT_LABELS[id]?.[lang] ?? id}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <p className="code-id text-xs text-white/90 font-medium">
                {t("gallery.items", { n: items.length })}
              </p>
              {(category !== "all" || era !== "all" || subject !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setCategory("all");
                    setEra("all");
                    setSubject("all");
                  }}
                  className="text-xs font-bold text-sand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring cursor-pointer"
                >
                  {t("gallery.reset")}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Catalog Item Grid or Empty State */}
        {items.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              title={t("gallery.empty")}
              description={t("gallery.emptyDescription")}
              action={
                <button
                  type="button"
                  onClick={() => {
                    setCategory("all");
                    setEra("all");
                    setSubject("all");
                  }}
                  className={btnClass("outline", "md", "mt-4")}
                >
                  {t("gallery.reset")}
                </button>
              }
            />
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item, index) => (
              <li key={item.id}>
                <button
                  ref={(el) => {
                    if (el) triggerRefs.current.set(item.id, el);
                    else triggerRefs.current.delete(item.id);
                  }}
                  type="button"
                  onClick={() => handleOpen(index, item.id)}
                  aria-haspopup="dialog"
                  className="group flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-start shadow-xs transition-all hover:border-border/80 hover:shadow-[var(--shadow-lift)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring cursor-pointer"
                >
                  {/* Archival Preview Media / Video Stage */}
                  <span className="relative block aspect-4/3 w-full overflow-hidden bg-ink">
                    {item.medium === "video" ? (
                      <span className="relative flex size-full items-center justify-center bg-radial from-ink via-ink/90 to-black p-4 text-center">
                        <span className="flex size-14 items-center justify-center rounded-full bg-brand/90 text-white shadow-md transition-transform duration-300 group-hover:scale-110">
                          <Play aria-hidden="true" className="size-6 fill-white translate-x-0.5 rtl:-translate-x-0.5" />
                        </span>
                        <span className="absolute bottom-2.5 start-3 end-3 flex items-center justify-between text-[11px] text-white/80">
                          <span className="font-semibold truncate">
                            {"publisher" in item ? item.publisher : ""}
                          </span>
                          {item.date ? <span className="code-id ms-2 shrink-0">{item.date.slice(0, 4)}</span> : null}
                        </span>
                      </span>
                    ) : item.mediaId && item.mediaId in MEDIA ? (
                      <ResponsiveImage
                        entry={item.mediaId as keyof typeof MEDIA}
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        altOverride={{ en: item.alt.en, ar: item.alt.ar }}
                        className="size-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <span className="flex size-full items-center justify-center p-4 text-center text-xs text-white/60">
                        {pick(lang, item.title)}
                      </span>
                    )}
                  </span>

                  {/* Clean Content: Title + Subtitle */}
                  <span
                    data-decorative-asset="gallery-item-body"
                    data-testid="gallery-item-body"
                    className="relative flex flex-1 flex-col overflow-hidden bg-ink p-4 text-ink-foreground"
                  >
                    <img
                      data-decorative-asset="gallery-item-body"
                      data-testid="gallery-item-body"
                      src={galleryItemBodyImg}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className="pointer-events-none absolute inset-0 size-full select-none object-cover object-center opacity-40"
                    />
                    <span className="relative z-10 flex flex-1 flex-col">
                      <span className="text-sm font-bold text-ink-foreground transition-colors group-hover:text-sand line-clamp-2">
                        {pick(lang, item.title)}
                      </span>
                      <span className="mt-1.5 text-xs text-ink-muted">
                        {MEDIUM_LABELS[item.medium]?.[lang] ?? item.medium} ·{" "}
                        {HISTORICAL_PHASE_LABELS[item.phase]?.[lang] ?? item.phase}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Curated Primary Sources & External Historical References */}
        <section className="mt-16 border-t border-border pt-12">
          <div className="max-w-3xl">
            <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {t("gallery.externalSourcesTitle")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t("gallery.externalSourcesSub")}
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {externalSources.map((source) => (
              <a
                key={source.id}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${pick(lang, { en: source.title, ar: source.titleAr ?? source.title })} (${source.publisher})`}
                className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-ink p-5 text-ink-foreground shadow-xs transition-all hover:border-border/80 hover:shadow-[var(--shadow-lift)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <img
                  src={galleryItemBodyImg}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="pointer-events-none absolute inset-0 size-full select-none object-cover object-center opacity-40"
                />
                <div className="relative z-10 flex flex-1 flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-ink-muted">
                      <span className="rounded-md bg-ink-muted/20 px-2 py-0.5 font-medium text-ink-foreground">
                        {SOURCE_TYPE_LABELS[source.type]?.[lang] ?? source.type}
                      </span>
                      {source.publicationDate ? (
                        <span className="code-id text-clay-soft">{source.publicationDate}</span>
                      ) : null}
                    </div>
                    <h3 className="mt-2.5 text-sm font-bold text-ink-foreground leading-snug transition-colors group-hover:text-sand">
                      {pick(lang, { en: source.title, ar: source.titleAr ?? source.title })}
                    </h3>
                    <p className="mt-1 text-xs text-ink-muted font-medium">
                      {source.publisher}
                    </p>
                    {(() => {
                      const note = lang === "ar" ? source.notesAr : source.notes;
                      return note ? (
                        <p className="mt-2.5 text-xs leading-relaxed text-ink-muted/90 line-clamp-3">
                          {note}
                        </p>
                      ) : null;
                    })()}
                  </div>

                  <div className="mt-4 flex items-center gap-1.5 pt-3 border-t border-ink-border text-xs font-semibold text-clay-soft transition-colors group-hover:text-sand">
                    <span>
                      {source.type === "video" ? t("gallery.watchSource") : t("gallery.viewSource")}
                    </span>
                    <ExternalLink aria-hidden="true" className="size-3.5 rtl:scale-x-[-1]" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>
      </Container>

      {/* Accessible Radix Dialog Media Lightbox */}
      <DialogPrimitive.Root
        open={openIndex !== null}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/85 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            onCloseAutoFocus={(e) => {
              if (openingItemId) {
                const el = triggerRefs.current.get(openingItemId);
                if (el) {
                  e.preventDefault();
                  el.focus();
                }
              }
            }}
            className="fixed start-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-lift)] focus:outline-none sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] rtl:translate-x-1/2"
          >
            {current && (
              <>
                {/* Visual Media Stage */}
                <div className="relative aspect-16/10 max-h-[50vh] w-full shrink-0 overflow-hidden bg-ink sm:max-h-[55vh]">
                  {current.medium === "video" && current.youtubeId ? (
                    <div className="size-full flex items-center justify-center p-2 sm:p-4 bg-black">
                      <ArchiveVideoPlayer
                        youtubeId={current.youtubeId}
                        title={pick(lang, current.title)}
                        originalUrl={
                          ("sourceRefs" in current && current.sourceRefs?.[0]
                            ? getSourceRecordById(current.sourceRefs[0])?.url
                            : "sourceRef" in current && current.sourceRef
                              ? getSourceRecordById(current.sourceRef)?.url
                              : undefined) ?? undefined
                        }
                        className="max-h-full"
                      />
                    </div>
                  ) : (
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={current.id}
                        initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 1.01 }}
                        transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
                        className="size-full flex items-center justify-center"
                      >
                        {current.mediaId && current.mediaId in MEDIA ? (
                          <ResponsiveImage
                            entry={current.mediaId as keyof typeof MEDIA}
                            sizes="(max-width: 1024px) 100vw, 1000px"
                            altOverride={{ en: current.alt.en, ar: current.alt.ar }}
                            className="size-full object-cover sm:object-contain"
                          />
                        ) : (
                          <div className="p-8 text-center text-sm text-white/70">
                            {pick(lang, current.title)}
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  )}
                  {/* Close Control (44×44px minimum touch target) */}
                  <DialogPrimitive.Close
                    className="absolute end-3 top-3 z-10 inline-flex size-11 items-center justify-center rounded-full bg-ink/80 text-ink-foreground backdrop-blur-xs transition-colors hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                    aria-label={t("gallery.close")}
                  >
                    <X aria-hidden="true" className="size-5" />
                  </DialogPrimitive.Close>
                </div>

                {/* Metadata & Editorial Details */}
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 sm:p-7">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {MEDIUM_LABELS[current.medium as Medium]?.[lang] ?? current.medium} ·{" "}
                      {HISTORICAL_PHASE_LABELS[current.phase as HistoricalPhase]?.[lang] ?? current.phase}
                    </span>
                    <span className="code-id">
                      {openIndex !== null &&
                        t("gallery.itemPosition", {
                          current: openIndex + 1,
                          total: items.length,
                        })}
                    </span>
                  </div>

                  <DialogPrimitive.Title className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                    {pick(lang, current.title)}
                  </DialogPrimitive.Title>

                  <DialogPrimitive.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {pick(lang, current.caption)}
                  </DialogPrimitive.Description>

                  {/* Clean Definition List Metadata */}
                  <dl className="mt-5 grid gap-3 rounded-xl border border-border bg-secondary/50 p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="text-xs font-semibold text-muted-foreground">
                        {t("gallery.medium")}
                      </dt>
                      <dd className="mt-1 font-medium text-foreground">
                        {MEDIUM_LABELS[current.medium as Medium]?.[lang] ?? current.medium}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-muted-foreground">
                        {t("gallery.historicalPhase")}
                      </dt>
                      <dd className="mt-1 font-medium text-foreground">
                        {HISTORICAL_PHASE_LABELS[current.phase as HistoricalPhase]?.[lang] ?? current.phase}
                      </dd>
                    </div>
                    {"location" in current && current.location ? (
                      <div>
                        <dt className="text-xs font-semibold text-muted-foreground">
                          {t("gallery.location")}
                        </dt>
                        <dd className="mt-1 font-medium text-foreground">
                          {formatLocation(current.location, lang)}
                        </dd>
                      </div>
                    ) : null}
                    {"publisher" in current && current.publisher ? (
                      <div>
                        <dt className="text-xs font-semibold text-muted-foreground">
                          {t("gallery.credit")}
                        </dt>
                        <dd className="mt-1 font-medium text-foreground">
                          {current.publisher}
                        </dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="text-xs font-semibold text-muted-foreground">
                        {t("gallery.curatorialStatus")}
                      </dt>
                      <dd className="mt-1 font-medium text-foreground">
                        {"isVideo" in current && current.isVideo
                          ? t("gallery.verifiedExternalReference")
                          : "evidenceStatus" in current && current.evidenceStatus === "verified"
                            ? t("gallery.provisionalNotice")
                            : t("gallery.provenancePending")}
                      </dd>
                    </div>
                    {current.date ? (
                      <div>
                        <dt className="text-xs font-semibold text-muted-foreground">
                          {t("gallery.date")}
                        </dt>
                        <dd className="mt-1 font-medium text-foreground code-id">
                          {current.date}
                        </dd>
                      </div>
                    ) : null}
                    {"rights" in current && current.rights?.credit ? (
                      <div>
                        <dt className="text-xs font-semibold text-muted-foreground">
                          {t("gallery.credit")}
                        </dt>
                        <dd className="mt-1 font-medium text-foreground">
                          {current.rights.credit}
                        </dd>
                      </div>
                    ) : null}
                    {"rights" in current && current.rights?.license ? (
                      <div>
                        <dt className="text-xs font-semibold text-muted-foreground">
                          {t("gallery.license")}
                        </dt>
                        <dd className="mt-1 font-medium text-foreground">
                          {current.rights.licenseUrl ? (
                            <a
                              href={current.rights.licenseUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline underline-offset-2 hover:text-foreground inline-flex items-center gap-1"
                            >
                              {current.rights.license}
                            </a>
                          ) : (
                            current.rights.license
                          )}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  {/* Source Citations */}
                  {(() => {
                    const citations: string[] =
                      "sourceRefs" in current && Array.isArray(current.sourceRefs)
                        ? current.sourceRefs
                        : "sourceRef" in current && current.sourceRef
                          ? [current.sourceRef]
                          : [];
                    if (citations.length === 0) return null;
                    return (
                      <div className="mt-4 border-t border-border pt-3">
                        <h4 className="text-xs font-semibold text-muted-foreground">
                          {t("gallery.sourceReferences")}
                        </h4>
                        <ul className="mt-2 space-y-1.5">
                          {citations.map((refId: string) => {
                            const src = getSourceRecordById(refId);
                            if (!src) return null;
                            return (
                              <li key={refId} className="text-xs">
                                <a
                                  href={src.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 font-medium text-clay hover:underline"
                                >
                                  <span>{pick(lang, { en: src.title, ar: src.titleAr ?? src.title })}</span>
                                  <ExternalLink aria-hidden="true" className="size-3 shrink-0 rtl:scale-x-[-1]" />
                                </a>
                                <span className="ms-1.5 text-muted-foreground">
                                  ({src.publisher})
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })()}

                  {/* Modal Navigation Controls (44px min touch target) */}
                  <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                    <button
                      type="button"
                      onClick={handlePrev}
                      disabled={items.length <= 1}
                      className={cn(
                        btnClass("outline", "md"),
                        "min-h-11 min-w-11 px-4 gap-2 disabled:opacity-40 disabled:cursor-not-allowed",
                      )}
                    >
                      <ChevronLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
                      <span>{t("gallery.prev")}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleNext}
                      disabled={items.length <= 1}
                      className={cn(
                        btnClass("outline", "md"),
                        "min-h-11 min-w-11 px-4 gap-2 disabled:opacity-40 disabled:cursor-not-allowed",
                      )}
                    >
                      <span>{t("gallery.next")}</span>
                      <ChevronRight aria-hidden="true" className="size-4 rtl:rotate-180" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
