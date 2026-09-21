import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { btnClass, Container, PageHeader } from "@/components/kit";
import { travelSections } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";
import { MEDIA, buildSrcSet, smallestSrc } from "@/lib/media";
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
      {
        property: "og:description",
        content: "Documents, baggage, accessibility and airport guidance for passengers.",
      },
    ],
  }),
  component: TravelPage,
});

function TravelPage() {
  const { t, lang } = useI18n();
  const first = travelSections[0];
  const [active, setActive] = useState(first ? first.id : "");
  const reduceMotion = useReducedMotion();

  return (
    <>
      <PageHeader
        eyebrow={t("nav.travel")}
        title={t("travel.title")}
        description={t("travel.sub")}
      />

      <Container className="py-10">
        <TabsPrimitive.Root
          value={active}
          onValueChange={setActive}
          dir={lang === "ar" ? "rtl" : "ltr"}
        >
          <LayoutGroup id="travel-tabs">
            <TabsPrimitive.List
              aria-label={t("travel.title")}
              className="flex overflow-x-auto border-b border-border"
              loop
            >
              {travelSections.map((item) => (
                <TabsPrimitive.Trigger
                  key={item.id}
                  value={item.id}
                  className={cn(
                    "relative min-h-11 shrink-0 px-4 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring data-[state=active]:text-brand-deep",
                  )}
                >
                  {pick(lang, item.title)}
                  {active === item.id ? (
                    <motion.span
                      layoutId="travel-active-indicator"
                      className="absolute inset-x-3 bottom-0 h-0.5 bg-primary"
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
                      }
                    />
                  ) : null}
                </TabsPrimitive.Trigger>
              ))}
            </TabsPrimitive.List>
          </LayoutGroup>

          {travelSections.map((section) => (
            <TabsPrimitive.Content
              key={section.id}
              value={section.id}
              className="pt-8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <article className="grid gap-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)] lg:gap-12">
                <div>
                  <h2 className="text-2xl font-bold sm:text-3xl">{pick(lang, section.title)}</h2>
                  <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
                    {pick(lang, section.body)}
                  </p>
                  <div className="mt-8 flex flex-wrap gap-2">
                    <AppLink to="/flights" className={btnClass("outline", "md")}>
                      {t("nav.flights")}
                    </AppLink>
                    <AppLink to="/book" className={btnClass("primary", "md")}>
                      {t("nav.book")}
                    </AppLink>
                  </div>
                </div>
                <ul className="divide-y divide-border border-y border-border">
                  {section.points.map((point, index) => (
                    <li key={index} className="flex gap-3 py-4 text-sm leading-relaxed">
                      <Check
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-brand-deep"
                      />
                      <span>{pick(lang, point)}</span>
                    </li>
                  ))}
                </ul>
              </article>

              {section.id === "accessibility" && (() => {
                const assistance = MEDIA["passenger-assistance"]!;
                return (
                  <figure className="mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
                    <div className="relative aspect-[16/10] overflow-hidden bg-ink max-h-[380px]">
                      <img
                        src={smallestSrc(assistance)}
                        srcSet={buildSrcSet(assistance)}
                        sizes="(min-width: 1024px) 60vw, 100vw"
                        width={assistance.width}
                        height={assistance.height}
                        alt={lang === "ar" ? assistance.altAr : assistance.altEn}
                        loading="lazy"
                        decoding="async"
                        className="size-full object-cover"
                      />
                      <span className="absolute bottom-2.5 start-3 rounded bg-ink/80 px-2 py-0.5 font-mono text-xs text-ink-muted">
                        {t("media.conceptShortLabel")}
                      </span>
                    </div>
                    <figcaption className="p-4 text-xs leading-relaxed text-muted-foreground border-t border-border">
                      <span className="font-semibold text-foreground">
                        {t("travel.assistanceConceptLabel")}{" "}
                      </span>
                      {t("travel.assistanceConceptNote")}
                    </figcaption>
                  </figure>
                );
              })()}
            </TabsPrimitive.Content>
          ))}
        </TabsPrimitive.Root>
      </Container>
    </>
  );
}
