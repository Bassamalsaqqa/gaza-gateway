import { createFileRoute } from "@tanstack/react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Filter, Info, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { btnClass, Container, EmptyState, Notice, PageHeader, Pill } from "@/components/kit";
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
      { title: "Gallery and archive — Gaza International Airport (GZA)" },
      {
        name: "description",
        content:
          "Browse the Gaza International Airport gallery and archive: photographs, documents, architecture and future concepts, filterable by era.",
      },
      { property: "og:title", content: "Gallery and archive — Gaza International Airport" },
      { property: "og:description", content: "Photographs, documents, architecture and future concepts." },
    ],
  }),
  component: GalleryPage,
});

type CategoryFilter = GalleryItem["category"] | "all";
type EraFilter = GalleryItem["era"] | "all";

function GalleryPage() {
  const { t, lang } = useI18n();
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [era, setEra] = useState<EraFilter>("all");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [openingItemId, setOpeningItemId] = useState<string | null>(null);

  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const items = useMemo(
    () =>
      galleryItems.filter(
        (item) => (category === "all" || item.category === category) && (era === "all" || item.era === era),
      ),
    [category, era],
  );

  // Keyboard navigation for Lightbox while open
  useEffect(() => {
    if (openIndex === null) return;

    const onKey = (e: KeyboardEvent) => {
      if (items.length <= 1) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        // In RTL Arabic, ArrowRight points backwards in reading direction
        setOpenIndex((i) => {
          if (i === null) return null;
          return lang === "ar" ? (i - 1 + items.length) % items.length : (i + 1) % items.length;
        });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        // In RTL Arabic, ArrowLeft points forward in reading direction
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

    const lockedY = window.scrollY;
    const lockScroll = () => {
      if (window.scrollY !== lockedY) {
        window.scrollTo(0, lockedY);
      }
    };
    window.addEventListener("scroll", lockScroll, { passive: false });

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      window.removeEventListener("scroll", lockScroll);
    };
  }, [openIndex]);

  const current = openIndex !== null ? items[openIndex] ?? null : null;

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
        eyebrow={t("nav.gallery")}
        title={t("gallery.title")}
        description={t("gallery.sub")}
      />

      <Container className="py-8 sm:py-12">
        {/* Curatorial Provenance Standard Notice */}
        <Notice title={t("gallery.catalogSchema")}>
          <div className="space-y-1.5 text-sm leading-relaxed">
            <p>
              {t("gallery.noticeBody")}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-xs">
              <span className="code-id rounded bg-secondary px-2 py-0.5 text-muted-foreground">
                [CATALOG-ID-FIELD]
              </span>
              <span className="code-id rounded bg-secondary px-2 py-0.5 text-muted-foreground">
                [PROVENANCE]
              </span>
            </div>
          </div>
        </Notice>

        {/* Filter Toolbar */}
        <div className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div className="mb-4 flex items-center gap-2 text-foreground">
            <Filter aria-hidden="true" className="size-4 text-primary" />
            <h2 className="text-sm font-bold tracking-tight">{t("gallery.filterAria")}</h2>
          </div>

          <div className="space-y-4">
            <FilterRow
              legend={t("gallery.filterCategory")}
              options={[
                { id: "all", label: t("gallery.categoryAll") },
                ...Object.entries(galleryCategoryLabels).map(([id, label]) => ({
                  id,
                  label: pick(lang, label),
                })),
              ]}
              value={category}
              onChange={(value) => {
                setCategory(value as CategoryFilter);
                setOpenIndex(null);
              }}
            />
            <FilterRow
              legend={t("gallery.filterEra")}
              options={[
                { id: "all", label: t("gallery.eraAll") },
                ...Object.entries(galleryEraLabels).map(([id, label]) => ({
                  id,
                  label: pick(lang, label),
                })),
              ]}
              value={era}
              onChange={(value) => {
                setEra(value as EraFilter);
                setOpenIndex(null);
              }}
            />
          </div>
        </div>

        {/* Result Counter in Strict Latin Numerals */}
        <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
          <p className="numeral font-mono">
            {t("gallery.items", { n: items.length })}
          </p>
          {(category !== "all" || era !== "all") && (
            <button
              type="button"
              onClick={() => {
                setCategory("all");
                setEra("all");
              }}
              className="text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              {t("gallery.reset")}
            </button>
          )}
        </div>

        {/* Catalog Item Grid or Resilient Empty State */}
        {items.length === 0 ? (
          <div className="mt-6">
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
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                  className="group flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-start shadow-[var(--shadow-soft)] transition-all hover:border-border/80 hover:shadow-[var(--shadow-lift)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {/* Archival Preview Image */}
                  <span className="relative block aspect-4/3 w-full overflow-hidden bg-ink">
                    <img
                      src={img(item.imageSeed, 800, 600)}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-105"
                    />
                    <span className="absolute bottom-2 start-2 rounded bg-ink/80 px-2 py-0.5 font-mono text-[10px] text-ink-muted">
                      [PROVENANCE]
                    </span>
                  </span>

                  {/* Card Content & Metadata */}
                  <span className="flex flex-1 flex-col p-4">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Pill tone="brand">{pick(lang, galleryCategoryLabels[item.category])}</Pill>
                      <Pill tone="neutral">{pick(lang, galleryEraLabels[item.era])}</Pill>
                    </span>
                    <span className="mt-2.5 block text-sm font-bold text-foreground transition-colors group-hover:text-primary">
                      {pick(lang, item.title)}
                    </span>
                    <span className="code-id mt-2 block text-xs text-clay">
                      [CATALOG-ID-FIELD]
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
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          >
            {current && (
              <div
                className="relative my-auto flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-lift)] focus:outline-none"
                tabIndex={-1}
              >
                {/* Visual Image Stage */}
                <div className="relative aspect-16/10 max-h-[50vh] w-full overflow-hidden bg-ink sm:max-h-[55vh]">
                  <img
                    src={img(current.imageSeed, 1600, 1000)}
                    alt=""
                    className="size-full object-cover sm:object-contain"
                  />
                  {/* Close Control (44×44px minimum touch target) */}
                  <DialogPrimitive.Close
                    className="absolute end-3 top-3 inline-flex size-11 items-center justify-center rounded-full bg-ink/80 text-ink-foreground backdrop-blur-xs transition-colors hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                    aria-label={t("gallery.close")}
                  >
                    <X aria-hidden="true" className="size-5" />
                  </DialogPrimitive.Close>
                  <span className="absolute bottom-3 start-4 rounded-md bg-ink/80 px-2 py-0.5 font-mono text-xs text-ink-muted">
                    [CATALOG-ID-FIELD]
                  </span>
                </div>

                {/* Metadata & Archival Dossier */}
                <div className="flex flex-col p-5 sm:p-7">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill tone="brand">{pick(lang, galleryCategoryLabels[current.category])}</Pill>
                      <Pill tone="neutral">{pick(lang, galleryEraLabels[current.era])}</Pill>
                    </div>
                    <span className="numeral font-mono text-xs text-muted-foreground">
                      {openIndex !== null &&
                        t("gallery.itemPosition", {
                          current: openIndex + 1,
                          total: items.length,
                        })}
                    </span>
                  </div>

                  <DialogPrimitive.Title className="mt-3 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                    {pick(lang, current.title)}
                  </DialogPrimitive.Title>

                  <DialogPrimitive.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {pick(lang, current.caption)}
                  </DialogPrimitive.Description>

                  {/* Curatorial Neutral Metadata Schema */}
                  <dl className="mt-5 grid gap-3 rounded-xl border border-border bg-secondary/50 p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="eyebrow text-muted-foreground">{t("gallery.catalogIdField")}</dt>
                      <dd className="code-id mt-1 font-semibold text-clay">[CATALOG-ID-FIELD]</dd>
                    </div>
                    <div>
                      <dt className="eyebrow text-muted-foreground">{t("gallery.format")}</dt>
                      <dd className="code-id mt-1 font-medium text-foreground">[PROVENANCE]</dd>
                    </div>
                    <div>
                      <dt className="eyebrow text-muted-foreground">{t("gallery.credit")}</dt>
                      <dd className="code-id mt-1 font-medium text-foreground">{t("gallery.provenancePending")}</dd>
                    </div>
                    <div>
                      <dt className="eyebrow text-muted-foreground">{t("gallery.curatorialStatus")}</dt>
                      <dd className="code-id mt-1 font-medium text-foreground">[PROVENANCE]</dd>
                    </div>
                  </dl>

                  {/* Provisional Study Notice */}
                  <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <Info aria-hidden="true" className="size-3.5 shrink-0 text-clay" />
                    <span>{t("gallery.provisionalNotice")}</span>
                  </div>

                  {/* Modal Navigation Controls (44px min touch target) */}
                  <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                    <button
                      type="button"
                      onClick={handlePrev}
                      className={cn(
                        btnClass("outline", "md"),
                        "min-h-11 min-w-11 px-4 gap-2",
                      )}
                    >
                      <ChevronLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
                      <span>{t("gallery.prev")}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleNext}
                      className={cn(
                        btnClass("outline", "md"),
                        "min-h-11 min-w-11 px-4 gap-2",
                      )}
                    >
                      <span>{t("gallery.next")}</span>
                      <ChevronRight aria-hidden="true" className="size-4 rtl:rotate-180" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

function FilterRow({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="eyebrow text-muted-foreground">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={value === option.id}
            className={cn(
              "inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
              value === option.id
                ? "border-primary bg-primary text-primary-foreground shadow-xs"
                : "border-input bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
