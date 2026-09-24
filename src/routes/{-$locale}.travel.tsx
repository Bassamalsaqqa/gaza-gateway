import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { btnClass, Container, PageHeader } from "@/components/kit";
import { travelSections } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";
import { ResponsiveImage } from "@/components/responsive-image";
import { cn } from "@/lib/utils";
import { GazaSurface, SurfaceMedia, useSurfaceRecipe } from "@/design/surfaces";
import { MEDIA } from "@/lib/media";
import { useEffect } from "react";

type TravelSearch = {
  skinPreview?: 1;
  studioPreview?: 1;
  section?: string;
  baseline?: 1;
};

export const Route = createFileRoute("/{-$locale}/travel")({
  validateSearch: (search: Record<string, unknown>): TravelSearch => {
    const out: TravelSearch = {};
    const rawPreview = search["skinPreview"];
    if (rawPreview === "1" || rawPreview === 1 || rawPreview === '"1"') {
      out.skinPreview = 1;
    }
    const rawStudio = search["studioPreview"];
    if (rawStudio === "1" || rawStudio === 1 || rawStudio === '"1"') {
      out.studioPreview = 1;
    }
    if (typeof search["section"] === "string") {
      out.section = search["section"];
    }
    const rawBaseline = search["baseline"];
    if (rawBaseline === "1" || rawBaseline === 1 || rawBaseline === '"1"') {
      out.baseline = 1;
    }
    return out;
  },
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
  const search = Route.useSearch();
  const { t, lang } = useI18n();
  const first = travelSections[0];
  const initialSection =
    search.section && travelSections.some((s) => s.id === search.section)
      ? search.section
      : first
        ? first.id
        : "";
  const [active, setActive] = useState(initialSection);
  const reduceMotion = useReducedMotion();

  const { active: isGuideActive, recipe: guideRecipe } = useSurfaceRecipe(
    "guide",
    "travel.guide",
  );
  const mediaTreatment = guideRecipe.mediaTreatment;

  // Sync active tab on search.section or hash changes
  useEffect(() => {
    if (search.section && travelSections.some((s) => s.id === search.section)) {
      setActive(search.section);
    } else if (typeof window !== "undefined" && window.location.hash) {
      const hash = window.location.hash.replace("#", "");
      if (travelSections.some((s) => s.id === hash)) {
        setActive(hash);
      }
    }
  }, [search.section]);

  return (
    <>
      <PageHeader
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

          {travelSections.map((section) => {
            const isAr = lang === "ar";

            const textContent = (
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
            );

            const checklistContent = (
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
            );

            // ── Clean conditional at presentation boundary ──
            // Normal mode (!isGuideActive): retain accepted production presentation.
            // Guide article remains clean two-column article, and Accessibility renders
            // a separate figure below the article with concept label and caption.
            if (!isGuideActive) {
              return (
                <TabsPrimitive.Content
                  key={section.id}
                  value={section.id}
                  className="pt-8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                >
                  <GazaSurface
                    family="guide"
                    as="article"
                    baselineClassName="grid gap-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)] lg:gap-12"
                    className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)] lg:gap-12"
                  >
                    {textContent}
                    {checklistContent}
                  </GazaSurface>

                  {section.id === "accessibility" && (
                    <figure className="mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
                      <div className="relative aspect-[16/10] overflow-hidden bg-ink max-h-[380px]">
                        <ResponsiveImage
                          entry="passenger-assistance"
                          sizes="(min-width: 1024px) 60vw, 100vw"
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
                  )}
                </TabsPrimitive.Content>
              );
            }

            // ── Preview Mode (isGuideActive): Distinct treatments for Appearance Studio / skin preview ──
            const activeMediaId =
              mediaTreatment?.mediaId && mediaTreatment.mediaId in MEDIA
                ? mediaTreatment.mediaId
                : "passenger-assistance";
            const activeMediaEntry = MEDIA[activeMediaId as keyof typeof MEDIA];
            const activeTruthClass = activeMediaEntry?.truthClass ?? "future-concept-ai";
            const activeTreatment = mediaTreatment?.treatment ?? "side";
            const shouldShowMedia = activeTreatment !== "none";

            const travelMedia = shouldShowMedia ? (
              <SurfaceMedia
                treatment={activeTreatment}
                aspect={
                  activeTreatment === "top"
                    ? "16:9"
                    : mediaTreatment?.aspect && mediaTreatment.aspect !== "auto"
                      ? mediaTreatment.aspect
                      : "16:10"
                }
                truthClass={activeTruthClass}
                overlay={mediaTreatment?.overlay}
                focalX={mediaTreatment?.focalX}
                focalY={mediaTreatment?.focalY}
                contextKind="guide"
                className={
                  activeTreatment === "cover" || activeTreatment === "watermark"
                    ? "absolute inset-0 size-full -z-10 rounded-none border-0"
                    : activeTreatment === "top"
                      ? "w-full overflow-hidden rounded-2xl border border-border bg-card shadow-xs"
                      : "overflow-hidden rounded-2xl border border-border bg-card shadow-xs size-full"
                }
              >
                <div
                  className={cn(
                    "relative overflow-hidden bg-ink",
                    activeTreatment === "cover" || activeTreatment === "watermark"
                      ? "size-full"
                      : "aspect-[16/10] max-h-[380px]",
                  )}
                >
                  <ResponsiveImage
                    entry={activeMediaId as keyof typeof MEDIA}
                    sizes={
                      activeTreatment === "top" || activeTreatment === "cover"
                        ? "100vw"
                        : "(min-width: 1024px) 40vw, 100vw"
                    }
                    className="size-full object-cover"
                    style={{
                      objectPosition: `${mediaTreatment?.focalX ?? 50}% ${mediaTreatment?.focalY ?? 50}%`,
                    }}
                  />
                </div>
                {activeTreatment !== "cover" && activeTreatment !== "watermark" ? (
                  activeMediaEntry?.truthClass === "future-concept-ai" ? (
                    <figcaption className="p-4 text-xs leading-relaxed text-muted-foreground border-t border-border">
                      <span className="font-semibold text-foreground">
                        {t("travel.assistanceConceptLabel")}{" "}
                      </span>
                      {t("travel.assistanceConceptNote")}
                    </figcaption>
                  ) : (
                    <figcaption className="p-3 text-xs leading-relaxed text-muted-foreground border-t border-border">
                      <span className="font-semibold text-foreground">
                        {isAr ? activeMediaEntry?.altAr : activeMediaEntry?.altEn}
                      </span>
                    </figcaption>
                  )
                ) : null}
              </SurfaceMedia>
            ) : null;

            return (
              <TabsPrimitive.Content
                key={section.id}
                value={section.id}
                className="pt-8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              >
                {activeTreatment === "top" && travelMedia ? (
                  <GazaSurface
                    family="guide"
                    target="travel.guide"
                    as="article"
                    baselineClassName="grid gap-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)] lg:gap-12"
                    className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)] lg:gap-12"
                  >
                    <div className="col-span-full order-first">{travelMedia}</div>
                    {textContent}
                    {checklistContent}
                  </GazaSurface>
                ) : activeTreatment === "side" && travelMedia ? (
                  <GazaSurface
                    family="guide"
                    target="travel.guide"
                    as="article"
                    baselineClassName="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(18rem,1fr)]"
                    className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(18rem,1fr)]"
                  >
                    {textContent}
                    {checklistContent}
                    <div className="lg:col-span-1 flex flex-col justify-start">
                      {travelMedia}
                    </div>
                  </GazaSurface>
                ) : activeTreatment === "cover" && travelMedia ? (
                  <GazaSurface
                    family="guide"
                    target="travel.guide"
                    as="article"
                    baselineClassName="relative isolate overflow-hidden min-h-[460px] flex flex-col justify-end"
                    className="relative isolate overflow-hidden min-h-[460px] flex flex-col justify-end p-4 sm:p-6"
                  >
                    {travelMedia}
                    <div className="relative z-10 grid gap-7 p-6 sm:p-8 rounded-xl border border-border/60 bg-card/90 backdrop-blur-md lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)] lg:gap-12">
                      {textContent}
                      {checklistContent}
                    </div>
                  </GazaSurface>
                ) : activeTreatment === "watermark" && travelMedia ? (
                  <GazaSurface
                    family="guide"
                    target="travel.guide"
                    as="article"
                    baselineClassName="relative isolate overflow-hidden"
                    className="relative isolate overflow-hidden grid gap-7 p-6 sm:p-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)] lg:gap-12"
                  >
                    {travelMedia}
                    <div className="relative z-10">{textContent}</div>
                    <div className="relative z-10">{checklistContent}</div>
                  </GazaSurface>
                ) : (
                  <GazaSurface
                    family="guide"
                    target="travel.guide"
                    as="article"
                    baselineClassName="grid gap-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)] lg:gap-12"
                    className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)] lg:gap-12"
                  >
                    {textContent}
                    {checklistContent}
                  </GazaSurface>
                )}
              </TabsPrimitive.Content>
            );
          })}
        </TabsPrimitive.Root>
      </Container>
    </>
  );
}
