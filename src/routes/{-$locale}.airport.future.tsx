import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Lightbulb } from "lucide-react";
import { ChapterNav, ChapterPagination } from "@/components/airport/chapter-nav";
import { Container, Panel } from "@/components/kit";
import { destinations } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";
import { ResponsiveImage } from "@/components/responsive-image";
import { GazaSurface, SurfaceMedia, useSurfaceRecipe } from "@/design/surfaces";
import { MEDIA } from "@/lib/media";

type FutureSearch = {
  skinPreview?: 1;
  studioPreview?: 1;
  baseline?: 1;
};

export const Route = createFileRoute("/{-$locale}/airport/future")({
  validateSearch: (search: Record<string, unknown>): FutureSearch => {
    const out: FutureSearch = {};
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
  head: () => ({
    meta: [
      { title: "The future — vision for Gaza International Airport" },
      {
        name: "description",
        content:
          "Concepts for a reopened Gaza International Airport: terminal proposals, masterplan thinking, future passenger experience and a growing route network.",
      },
      { property: "og:title", content: "The future — Gaza International Airport" },
      { property: "og:description", content: "Terminal concepts, masterplan and future passenger experience." },
    ],
  }),
  component: FuturePage,
});

function FuturePage() {
  const { t, lang } = useI18n();
  const { active: isEditorialActive, recipe: editorialRecipe } = useSurfaceRecipe(
    "editorial",
    "airport.future-editorial",
  );
  const mediaTreatment = editorialRecipe.mediaTreatment;

  /** Day/night pairs for the editorial study sequence */
  const nightStudies = [
    {
      slug: "aerial-night" as const,
      captionEn: "Night aerial concept of the future terminal and airfield.",
      captionAr: "تصوّر جوي ليلي لمفهوم مبنى المطار المستقبلي وساحة الطائرات.",
    },
    {
      slug: "landside-night" as const,
      captionEn: "Night architectural concept of the future landside departures entrance.",
      captionAr: "تصوّر معماري ليلي لمفهوم واجهة المغادرة المستقبلية.",
    },
    {
      slug: "runway-night" as const,
      captionEn: "Night concept along the future airport runway toward the coastal horizon.",
      captionAr: "تصوّر ليلي لمدرج المطار المستقبلي باتجاه الأفق الساحلي.",
    },
    {
      slug: "concourse-night" as const,
      captionEn: "Night interior architectural concept of a future passenger concourse.",
      captionAr: "تصوّر داخلي معماري ليلي لصالة الركاب المستقبلية.",
    },
    {
      slug: "interior-wide-a" as const,
      captionEn: "Wide interior concept of the future Gaza International Airport terminal.",
      captionAr: "تصوّر داخلي فسيح لمبنى مطار غزة الدولي المستقبلي.",
    },
    {
      slug: "interior-wide-b" as const,
      captionEn: "Wide interior concept of the modern Gaza International Airport terminal.",
      captionAr: "تصوّر داخلي فسيح آخر لمبنى مطار غزة الدولي المستقبلي.",
    },
  ] as const;

  return (
    <>
      {/* Editorial Chapter Hero — day aerial with explicit positive stacking */}
      <section className="relative isolate overflow-hidden bg-ink text-ink-foreground">
        <ResponsiveImage
          entry="aerial-day"
          sizes="100vw"
          loading="eager"
          fetchPriority="high"
          className="absolute inset-0 z-0 size-full object-cover opacity-90"
        />
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-ink via-ink/75 to-ink/40 sm:bg-gradient-to-r sm:from-ink/90 sm:via-ink/65 sm:to-ink/25 sm:rtl:bg-gradient-to-l" />
        <Container className="relative z-20 py-16 sm:py-24">
          <h1 className="type-title-hero max-w-3xl text-ink-foreground">
            {t("airport.future")}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
            {t("airport.futureSubtitle")}
          </p>
          {/* Single plain disclosure */}
          <p className="mt-4 text-xs text-ink-muted/90 sm:text-sm font-medium">
            {t("airport.futurePlainDisclosure")}
          </p>
        </Container>
      </section>

      <Container className="py-8 sm:py-12">
        {/* Persistent Chapter Sequence Navigation */}
        <ChapterNav activeChapter="future" className="mb-8" />

        {/* Concise non-duplicative planning prose */}
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {t("airport.futureNotice")}
        </p>

        {/* ── Main chapters: day imagery with editorial narrative ── */}
        <div className="mt-10 space-y-10">
          {/* Chapter 1 — Landside / Terminal Arrival */}
          {(() => {
            const chapter1Content = (
              <>
                <h2 className="type-title-md text-foreground">
                  {t("airport.themeTerminalTitle")}
                </h2>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                  {t("airport.themeTerminalBody")}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {t("airport.designIntentText")}
                </p>
              </>
            );

            // ── Clean conditional at presentation boundary ──
            // Normal mode (!isEditorialActive): retain accepted production presentation.
            if (!isEditorialActive) {
              return (
                <GazaSurface
                  family="editorial"
                  as="article"
                  baselineClassName="grid gap-6 overflow-hidden rounded-2xl border border-border bg-card shadow-xs sm:grid-cols-2"
                  className="grid gap-6 overflow-hidden sm:grid-cols-2"
                >
                  <figure className="relative m-0 aspect-[16/10] size-full overflow-hidden bg-ink sm:aspect-auto">
                    <ResponsiveImage
                      entry="landside-day"
                      sizes="(min-width: 640px) 50vw, 100vw"
                      className="size-full object-cover opacity-90 transition-transform duration-500 hover:scale-105"
                    />
                  </figure>
                  <div className="flex flex-col justify-center p-6 sm:p-8">
                    {chapter1Content}
                  </div>
                </GazaSurface>
              );
            }

            // ── Preview Mode (isEditorialActive): Distinct treatments for Appearance Studio / skin preview ──
            const activeMediaId =
              mediaTreatment?.mediaId && mediaTreatment.mediaId in MEDIA
                ? mediaTreatment.mediaId
                : "landside-day";
            const activeMediaEntry = MEDIA[activeMediaId as keyof typeof MEDIA];
            const activeTruthClass = activeMediaEntry?.truthClass ?? "future-concept-ai";
            const activeTreatment = mediaTreatment?.treatment ?? "side";

            const chapter1Media = (
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
                contextKind="editorial-future"
                className={
                  activeTreatment === "cover" || activeTreatment === "watermark"
                    ? "absolute inset-0 size-full -z-10 rounded-none border-0"
                    : activeTreatment === "top"
                      ? "w-full shrink-0"
                      : "relative m-0 size-full overflow-hidden bg-ink sm:aspect-auto"
                }
              >
                <ResponsiveImage
                  entry={activeMediaId as keyof typeof MEDIA}
                  sizes={
                    activeTreatment === "top" || activeTreatment === "cover"
                      ? "100vw"
                      : "(min-width: 640px) 50vw, 100vw"
                  }
                  className="size-full object-cover opacity-90 transition-transform duration-500 hover:scale-105"
                  style={{
                    objectPosition: `${mediaTreatment?.focalX ?? 50}% ${mediaTreatment?.focalY ?? 50}%`,
                  }}
                />
              </SurfaceMedia>
            );

            if (activeTreatment === "top") {
              return (
                <GazaSurface
                  family="editorial"
                  target="airport.future-editorial"
                  as="article"
                  baselineClassName="overflow-hidden rounded-2xl border border-border bg-card shadow-xs flex flex-col"
                  className="overflow-hidden flex flex-col"
                >
                  {chapter1Media}
                  <div className="p-6 sm:p-8">{chapter1Content}</div>
                </GazaSurface>
              );
            }

            if (activeTreatment === "cover") {
              return (
                <GazaSurface
                  family="editorial"
                  target="airport.future-editorial"
                  as="article"
                  baselineClassName="relative isolate overflow-hidden rounded-2xl border border-border bg-card shadow-xs min-h-[380px] sm:min-h-[440px] flex items-end"
                  className="relative isolate overflow-hidden min-h-[380px] sm:min-h-[440px] flex items-end"
                >
                  {chapter1Media}
                  <div className="relative z-10 m-4 sm:m-6 max-w-2xl rounded-xl border border-border/60 bg-card/90 p-6 sm:p-8 backdrop-blur-md">
                    {chapter1Content}
                  </div>
                </GazaSurface>
              );
            }

            if (activeTreatment === "watermark") {
              return (
                <GazaSurface
                  family="editorial"
                  target="airport.future-editorial"
                  as="article"
                  baselineClassName="relative isolate overflow-hidden rounded-2xl border border-border bg-card shadow-xs p-6 sm:p-8"
                  className="relative isolate overflow-hidden p-6 sm:p-8"
                >
                  {chapter1Media}
                  <div className="relative z-10 max-w-2xl">{chapter1Content}</div>
                </GazaSurface>
              );
            }

            if (activeTreatment === "none") {
              return (
                <GazaSurface
                  family="editorial"
                  target="airport.future-editorial"
                  as="article"
                  baselineClassName="overflow-hidden rounded-2xl border border-border bg-card shadow-xs p-6 sm:p-8"
                  className="overflow-hidden p-6 sm:p-8"
                >
                  <div className="max-w-3xl">{chapter1Content}</div>
                </GazaSurface>
              );
            }

            return (
              /* Default "side" */
              <GazaSurface
                family="editorial"
                target="airport.future-editorial"
                as="article"
                baselineClassName="grid gap-6 overflow-hidden rounded-2xl border border-border bg-card shadow-xs sm:grid-cols-2"
                className="grid gap-6 overflow-hidden sm:grid-cols-2"
              >
                {chapter1Media}
                <div className="flex flex-col justify-center p-6 sm:p-8">
                  {chapter1Content}
                </div>
              </GazaSurface>
            );
          })()}

          {/* Chapter 2 — Passenger Concourse */}
          <GazaSurface
            family="editorial"
            target="airport.future-editorial"
            as="article"
            baselineClassName="grid gap-6 overflow-hidden rounded-2xl border border-border bg-card shadow-xs sm:grid-cols-2 sm:[&>figure]:order-last"
            className="grid gap-6 overflow-hidden sm:grid-cols-2 sm:[&>figure]:order-last"
          >
            <div className="flex flex-col justify-center p-6 sm:p-8">
              <h2 className="type-title-md text-foreground">
                {t("airport.themeHospitalityTitle")}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                {t("airport.themeHospitalityBody")}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {t("airport.designIntentText")}
              </p>
            </div>
            <figure className="relative m-0 aspect-[16/10] size-full overflow-hidden bg-ink sm:aspect-auto">
              <ResponsiveImage
                entry="concourse-day"
                sizes="(min-width: 640px) 50vw, 100vw"
                className="size-full object-cover opacity-90 transition-transform duration-500 hover:scale-105"
              />
            </figure>
          </GazaSurface>

          {/* Chapter 3 — Airfield & Coastal Runway */}
          <GazaSurface
            family="editorial"
            target="airport.future-editorial"
            as="article"
            baselineClassName="grid gap-6 overflow-hidden rounded-2xl border border-border bg-card shadow-xs sm:grid-cols-2"
            className="grid gap-6 overflow-hidden sm:grid-cols-2"
          >
            <figure className="relative m-0 aspect-[16/10] size-full overflow-hidden bg-ink sm:aspect-auto">
              <ResponsiveImage
                entry="runway-day"
                sizes="(min-width: 640px) 50vw, 100vw"
                className="size-full object-cover opacity-90 transition-transform duration-500 hover:scale-105"
              />
            </figure>
            <div className="flex flex-col justify-center p-6 sm:p-8">
              <h2 className="type-title-md text-foreground">
                {t("airport.themeMasterplanTitle")}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                {t("airport.themeMasterplanBody")}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {t("airport.designIntentText")}
              </p>
            </div>
          </GazaSurface>
        </div>

        {/* ── Editorial night/interior study sequence ── */}
        <section aria-labelledby="night-study-heading" className="mt-16 border-t border-border pt-12">
          <h2 id="night-study-heading" className="type-title-md text-foreground">
            {lang === "ar" ? "دراسة الرؤية الليلية والداخلية" : "Night & Interior Study Sequence"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {lang === "ar"
              ? "تصوّرات إضافية من المالك تُكمل رؤية النهار — جميعها مواد توضيحية مستقبلية."
              : "Additional owner-provided visualizations complementing the day sequence — all illustrative future concepts."}
          </p>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-label={lang === "ar" ? "دراسات ليلية وداخلية" : "Night and interior studies"}>
            {nightStudies.map((study) => {
              const captionText = lang === "ar" ? study.captionAr : study.captionEn;
              return (
                <li key={study.slug} className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
                  <figure className="m-0">
                    <div className="relative aspect-[16/10] overflow-hidden bg-ink">
                      <ResponsiveImage
                        entry={study.slug}
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        className="size-full object-cover opacity-85 transition-transform duration-500 hover:scale-105"
                      />
                    </div>
                    <figcaption className="px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                      {captionText}
                    </figcaption>
                  </figure>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Future Network Vision Panel */}
        <Panel className="mt-14 border-border bg-card">
          <div className="flex items-center gap-2 text-foreground">
            <Lightbulb aria-hidden="true" className="size-5 text-clay" />
            <h2 className="text-xl font-bold">
              {t("airport.networkTitle")}
            </h2>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {t("airport.networkBody")}
          </p>

          <ul className="mt-5 flex flex-wrap gap-2.5">
            {destinations.map((destination) => (
              <li key={destination.code}>
                <AppLink
                  to="/destinations/$code"
                  params={{ code: destination.code }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-input bg-card px-3.5 py-2 text-sm font-semibold transition-all hover:border-primary hover:bg-secondary/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                >
                  <span className="code-id text-clay">{destination.code}</span>
                  <span className="text-foreground">{pick(lang, destination.city)}</span>
                  <ArrowRight aria-hidden="true" className="size-3.5 text-muted-foreground rtl:rotate-180" />
                </AppLink>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Chapter Pagination to Previous (Present) and Next (Archive) */}
        <ChapterPagination currentChapter="future" />
      </Container>
    </>
  );
}
