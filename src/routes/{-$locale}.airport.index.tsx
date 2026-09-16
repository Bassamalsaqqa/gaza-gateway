import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Container, Eyebrow, PageHeader } from "@/components/kit";
import { img } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";

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

const chapters = [
  { id: "past", to: "/airport/past", seed: "airport-archive-hall" },
  { id: "present", to: "/airport/present", seed: "airport-present-ground" },
  { id: "future", to: "/airport/future", seed: "airport-future-concept" },
] as const;

function AirportPage() {
  const { t, lang } = useI18n();

  return (
    <>
      <PageHeader eyebrow={t("nav.airport")} title={t("airport.title")} description={t("airport.sub")} />

      <Container className="py-10">
        <ul className="grid gap-4 lg:grid-cols-3">
          {chapters.map((chapter, index) => (
            <li key={chapter.id}>
              <Link
                to={chapter.to}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-ink text-ink-foreground"
              >
                <span className="relative block aspect-16/10 overflow-hidden">
                  <img
                    src={img(chapter.seed, 900, 560)}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover opacity-70 transition-transform duration-500 group-hover:scale-105"
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-ink to-transparent" />
                </span>
                <span className="flex flex-1 flex-col p-5">
                  <Eyebrow className="text-clay-soft">
                    <span className="numeral">0{index + 1}</span>
                  </Eyebrow>
                  <span className="mt-2 block text-2xl font-bold">{t(`airport.${chapter.id}`)}</span>
                  <span className="mt-2 block text-sm text-ink-muted">{t(`home.${chapter.id}Sub`)}</span>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-clay-soft">
                    {t("airport.readChapter")}
                    <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-8 max-w-2xl text-sm text-muted-foreground">
          {pick(lang, {
            en: "Archive photography, documents and architectural material will replace the placeholders in these chapters as verified sources are added.",
            ar: "ستحل الصور الأرشيفية والوثائق والمواد المعمارية مكان العناصر المؤقتة في هذه الفصول عند إضافة مصادر موثّقة.",
          })}
        </p>
      </Container>
    </>
  );
}
