import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { btnClass, Container, Notice, PageHeader, Pill } from "@/components/kit";
import {
  galleryCategoryLabels,
  galleryEraLabels,
  galleryItems,
  img,
  type GalleryItem,
} from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/gallery")({
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

  const items = useMemo(
    () =>
      galleryItems.filter(
        (item) => (category === "all" || item.category === category) && (era === "all" || item.era === era),
      ),
    [category, era],
  );

  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenIndex(null);
      if (e.key === "ArrowRight") setOpenIndex((i) => (i === null ? i : (i + 1) % items.length));
      if (e.key === "ArrowLeft") setOpenIndex((i) => (i === null ? i : (i - 1 + items.length) % items.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIndex, items.length]);

  const current = openIndex === null ? null : items[openIndex] ?? null;

  return (
    <>
      <PageHeader eyebrow={t("nav.gallery")} title={t("gallery.title")} description={t("gallery.sub")} />

      <Container className="py-8">
        <Notice title={t("common.notice")}>{pick(lang, {
          en: "All images are temporary placeholders and are not authentic Gaza International Airport material.",
          ar: "جميع الصور مؤقتة وليست مواد أصلية لمطار غزة الدولي.",
        })}</Notice>

        <div className="mt-6 space-y-3">
          <FilterRow
            legend={t("gallery.filterCategory")}
            options={[
              { id: "all", label: t("gallery.all") },
              ...Object.entries(galleryCategoryLabels).map(([id, label]) => ({ id, label: pick(lang, label) })),
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
              { id: "all", label: t("gallery.all") },
              ...Object.entries(galleryEraLabels).map(([id, label]) => ({ id, label: pick(lang, label) })),
            ]}
            value={era}
            onChange={(value) => {
              setEra(value as EraFilter);
              setOpenIndex(null);
            }}
          />
        </div>

        <p className="numeral mt-5 text-sm text-muted-foreground">{t("gallery.items", { n: items.length })}</p>

        {items.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">{t("gallery.empty")}</p>
            <button
              type="button"
              onClick={() => {
                setCategory("all");
                setEra("all");
              }}
              className={btnClass("outline", "sm", "mt-4")}
            >
              {t("gallery.reset")}
            </button>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpenIndex(index)}
                  className="group block w-full overflow-hidden rounded-xl border border-border bg-card text-start"
                >
                  <span className="block aspect-4/3 overflow-hidden bg-secondary">
                    <img
                      src={img(item.imageSeed, 800, 600)}
                      alt={pick(lang, item.title)}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </span>
                  <span className="block p-3.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Pill tone="brand">{pick(lang, galleryCategoryLabels[item.category])}</Pill>
                      <Pill>{pick(lang, galleryEraLabels[item.era])}</Pill>
                    </span>
                    <span className="mt-2 block text-sm font-semibold">{pick(lang, item.title)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Container>

      {current ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("gallery.viewer")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-4"
          onClick={() => setOpenIndex(null)}
        >
          <div
            className="max-h-full w-full max-w-4xl overflow-y-auto rounded-2xl bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <img
                src={img(current.imageSeed, 1600, 1000)}
                alt={pick(lang, current.title)}
                className="aspect-16/10 w-full object-cover"
              />
              <button
                type="button"
                onClick={() => setOpenIndex(null)}
                aria-label={t("common.close")}
                className="absolute end-3 top-3 grid size-10 place-items-center rounded-full bg-ink/70 text-ink-foreground"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-1.5">
                <Pill tone="brand">{pick(lang, galleryCategoryLabels[current.category])}</Pill>
                <Pill>{pick(lang, galleryEraLabels[current.era])}</Pill>
              </div>
              <h2 className="mt-3 text-xl font-bold">{pick(lang, current.title)}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{pick(lang, current.caption)}</p>
              <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="eyebrow text-muted-foreground">{t("gallery.credit")}</dt>
                  <dd className="mt-1">{pick(lang, current.credit)}</dd>
                </div>
                <div>
                  <dt className="eyebrow text-muted-foreground">{t("gallery.metadata")}</dt>
                  <dd className="mt-1">
                    <span className="code-id">{current.id}</span> · {current.date}
                  </dd>
                </div>
              </dl>
              <div className="mt-5 flex justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setOpenIndex((i) => (i === null ? i : (i - 1 + items.length) % items.length))}
                  className={btnClass("outline", "sm")}
                >
                  <ChevronLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
                  {t("gallery.prev")}
                </button>
                <button
                  type="button"
                  onClick={() => setOpenIndex((i) => (i === null ? i : (i + 1) % items.length))}
                  className={btnClass("outline", "sm")}
                >
                  {t("gallery.next")}
                  <ChevronRight aria-hidden="true" className="size-4 rtl:rotate-180" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
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
              "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors",
              value === option.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
