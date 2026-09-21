import { createFileRoute } from "@tanstack/react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppLink } from "@/components/app-link";
import { btnClass, Container, EmptyState, PageHeader } from "@/components/kit";
import {
  galleryCategoryLabels,
  galleryEraLabels,
  galleryItems,
  img,
  type GalleryItem,
} from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/{-$locale}/gallery")({
  head: () => ({
    meta: [
      { title: "Archive — Gaza International Airport (GZA)" },
      {
        name: "description",
        content:
          "Browse historical and documentary records of Gaza International Airport: photographs, documents, and architecture.",
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

type CategoryFilter = Exclude<GalleryItem["category"], "concept"> | "all";
type EraFilter = Exclude<GalleryItem["era"], "future"> | "all";

function GalleryPage() {
  const { t, lang } = useI18n();
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [era, setEra] = useState<EraFilter>("all");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [openingItemId, setOpeningItemId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Strictly exclude future concept items — archive represents documentary records
  const documentaryItems = useMemo(
    () =>
      galleryItems.filter(
        (item) => item.era !== "future" && (item.category as string) !== "concept",
      ),
    [],
  );

  const items = useMemo(
    () =>
      documentaryItems.filter(
        (item) =>
          (category === "all" || item.category === category) &&
          (era === "all" || item.era === era),
      ),
    [documentaryItems, category, era],
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

  const current = openIndex !== null ? (items[openIndex] ?? null) : null;

  const handleOpen = (index: number, id: string) => {
    setOpeningItemId(id);
    setOpenIndex(index);
  };

  const handleClose = () => {
    setOpenIndex(null);
  };

  const handlePrev = () => {
    if (openIndex === null || items.length === 0) return;
    setOpenIndex((openIndex - 1 + items.length) % items.length);
  };

  const handleNext = () => {
    if (openIndex === null || items.length === 0) return;
    setOpenIndex((openIndex + 1) % items.length);
  };

  return (
    <>
      <PageHeader
        title={t("gallery.title")}
        description={t("gallery.sub")}
      >
        <p className="mt-1 text-sm text-muted-foreground">
          {t("gallery.futureIntro")}{" "}
          <AppLink
            to="/airport/future"
            className="font-semibold text-primary underline underline-offset-4 hover:text-brand-deep"
          >
            {t("gallery.futureLink")}
          </AppLink>
          .
        </p>
      </PageHeader>

      <Container className="py-8 sm:py-12">
        {/* Compact Standard Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5 sm:p-4 shadow-xs">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            {/* Category Dropdown */}
            <div className="flex items-center gap-2">
              <label htmlFor="filter-category" className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                {t("gallery.filterCategory")}
              </label>
              <select
                id="filter-category"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as CategoryFilter);
                  setOpenIndex(null);
                }}
                className="h-9 rounded-lg border border-input bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                <option value="all">{t("gallery.categoryAll")}</option>
                {(["photograph", "document", "architecture"] as const).map((id) => (
                  <option key={id} value={id}>
                    {pick(lang, galleryCategoryLabels[id])}
                  </option>
                ))}
              </select>
            </div>

            {/* Era Dropdown */}
            <div className="flex items-center gap-2">
              <label htmlFor="filter-era" className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                {t("gallery.filterEra")}
              </label>
              <select
                id="filter-era"
                value={era}
                onChange={(e) => {
                  setEra(e.target.value as EraFilter);
                  setOpenIndex(null);
                }}
                className="h-9 rounded-lg border border-input bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                <option value="all">{t("gallery.eraAll")}</option>
                {(["past", "present"] as const).map((id) => (
                  <option key={id} value={id}>
                    {pick(lang, galleryEraLabels[id])}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <p className="code-id text-xs text-muted-foreground">
              {t("gallery.items", { n: items.length })}
            </p>
            {(category !== "all" || era !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setCategory("all");
                  setEra("all");
                }}
                className="text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                {t("gallery.reset")}
              </button>
            )}
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
                  {/* Archival Preview Image */}
                  <span className="relative block aspect-4/3 w-full overflow-hidden bg-ink">
                    <img
                      src={img(item.imageSeed, 800, 600)}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover opacity-85 transition-transform duration-500 group-hover:scale-105"
                    />
                  </span>

                  {/* Clean Content: Title + Subtitle */}
                  <span className="flex flex-1 flex-col p-4">
                    <span className="text-sm font-bold text-foreground transition-colors group-hover:text-primary">
                      {pick(lang, item.title)}
                    </span>
                    <span className="mt-1 text-xs text-muted-foreground">
                      {pick(lang, galleryCategoryLabels[item.category])} · {pick(lang, galleryEraLabels[item.era])}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
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
                {/* Visual Image Stage */}
                <div className="relative aspect-16/10 max-h-[50vh] w-full shrink-0 overflow-hidden bg-ink sm:max-h-[55vh]">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.img
                      key={current.id}
                      src={img(current.imageSeed, 1600, 1000)}
                      alt=""
                      initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 1.01 }}
                      transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="size-full object-cover sm:object-contain"
                    />
                  </AnimatePresence>
                  {/* Close Control (44×44px minimum touch target) */}
                  <DialogPrimitive.Close
                    className="absolute end-3 top-3 inline-flex size-11 items-center justify-center rounded-full bg-ink/80 text-ink-foreground backdrop-blur-xs transition-colors hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                    aria-label={t("gallery.close")}
                  >
                    <X aria-hidden="true" className="size-5" />
                  </DialogPrimitive.Close>
                </div>

                {/* Metadata & Editorial Details */}
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 sm:p-7">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {pick(lang, galleryCategoryLabels[current.category])} · {pick(lang, galleryEraLabels[current.era])}
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
                  <dl className="mt-5 grid gap-3 rounded-xl border border-border bg-secondary/50 p-4 text-xs sm:grid-cols-3">
                    <div>
                      <dt className="text-xs font-semibold text-muted-foreground">
                        {t("gallery.filterCategory")}
                      </dt>
                      <dd className="mt-1 font-medium text-foreground">
                        {pick(lang, galleryCategoryLabels[current.category])}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-muted-foreground">
                        {t("gallery.filterEra")}
                      </dt>
                      <dd className="mt-1 font-medium text-foreground">
                        {pick(lang, galleryEraLabels[current.era])}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-muted-foreground">
                        {t("gallery.curatorialStatus")}
                      </dt>
                      <dd className="mt-1 text-muted-foreground">
                        {t("gallery.provenanceStatus")}
                      </dd>
                    </div>
                  </dl>

                  {/* Modal Navigation Controls (44px min touch target) */}
                  <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                    <button
                      type="button"
                      onClick={handlePrev}
                      className={cn(btnClass("outline", "md"), "min-h-11 min-w-11 px-4 gap-2")}
                    >
                      <ChevronLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
                      <span>{t("gallery.prev")}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleNext}
                      className={cn(btnClass("outline", "md"), "min-h-11 min-w-11 px-4 gap-2")}
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
