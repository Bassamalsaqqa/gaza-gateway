import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useState } from "react";
import { btnClass, Container, PageHeader } from "@/components/kit";
import { travelSections } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/{-$locale}/travel")({
  head: () => ({
    meta: [
      { title: "Travel information — Gaza International Airport (GZA)" },
      {
        name: "description",
        content:
          "Prepare for your flight from Gaza International Airport: travel documents, baggage rules, accessibility and what to expect at the airport.",
      },
      { property: "og:title", content: "Travel information — Gaza International Airport" },
      { property: "og:description", content: "Documents, baggage, accessibility and airport guidance for passengers." },
    ],
  }),
  component: TravelPage,
});

function TravelPage() {
  const { t, lang } = useI18n();
  const first = travelSections[0];
  const [active, setActive] = useState(first ? first.id : "");
  const section = travelSections.find((s) => s.id === active) ?? first;

  return (
    <>
      <PageHeader eyebrow={t("nav.travel")} title={t("travel.title")} description={t("travel.sub")} />

      <Container className="grid gap-8 py-10 lg:grid-cols-[16rem_1fr]">
        <nav aria-label={t("travel.title")}>
          <ul className="flex gap-2 overflow-x-auto pb-2 lg:sticky lg:top-24 lg:flex-col lg:overflow-visible lg:pb-0">
            {travelSections.map((item) => (
              <li key={item.id} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => setActive(item.id)}
                  aria-current={active === item.id ? "true" : undefined}
                  className={cn(
                    "w-full rounded-lg px-3.5 py-2.5 text-start text-sm font-semibold transition-colors",
                    active === item.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {pick(lang, item.title)}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {section ? (
          <article>
            <h2 className="text-2xl font-bold sm:text-3xl">{pick(lang, section.title)}</h2>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
              {pick(lang, section.body)}
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {section.points.map((point, index) => (
                <li key={index} className="surface flex gap-3 p-4 text-sm">
                  <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                  <span>{pick(lang, point)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-2">
              <Link to="/flights" className={btnClass("outline", "md")}>
                {t("nav.flights")}
              </Link>
              <Link to="/book" className={btnClass("primary", "md")}>
                {t("nav.book")}
              </Link>
            </div>
          </article>
        ) : null}
      </Container>
    </>
  );
}
