import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Lightbulb, Building2, Plane, Sparkles } from "lucide-react";
import { ChapterNav, ChapterPagination } from "@/components/airport/chapter-nav";
import { Container, Notice, Panel } from "@/components/kit";
import { destinations } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";
import { ResponsiveImage } from "@/components/responsive-image";

export const Route = createFileRoute("/{-$locale}/airport/future")({
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



  /** Day/night pairs for the editorial study sequence */
  const nightStudies = [
    {
      slug: "aerial-night" as const,
      titleKey: "airport.themeTerminalTitle" as const,
      captionEn: "Night aerial concept of the future terminal and airfield.",
      captionAr: "تصوّر جوي ليلي لمفهوم مبنى المطار المستقبلي وساحة الطائرات.",
    },
    {
      slug: "landside-night" as const,
      titleKey: "airport.themeHospitalityTitle" as const,
      captionEn: "Night architectural concept of the future landside departures entrance.",
      captionAr: "تصوّر معماري ليلي لمفهوم واجهة المغادرة المستقبلية.",
    },
    {
      slug: "runway-night" as const,
      titleKey: "airport.themeMasterplanTitle" as const,
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

  const conceptLabel = t("media.ownerConceptLabel");
  const conceptNote = t("media.ownerConceptNote");

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
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-border px-3 py-1 text-xs font-semibold text-clay-soft">
              <span className="numeral font-mono">03</span>
              <span>·</span>
              <span>{t("airport.chapter3")}</span>
            </span>
            <span className="text-xs font-medium text-ink-muted">{t("airport.futureHorizon")}</span>
          </div>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            {t("airport.future")}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
            {t("airport.futureSubtitle")}
          </p>
          {/* Concept truth label */}
          <p className="mt-6 text-xs text-ink-muted/70">
            <span className="font-semibold text-clay-soft">{conceptLabel}</span>
            {" — "}{conceptNote}
          </p>
        </Container>
        <p className="absolute bottom-3 end-4 z-20 text-[0.6rem] text-ink-foreground/50 select-none pointer-events-none">
          {t("media.conceptShortLabel")}
        </p>
      </section>

      <Container className="py-8 sm:py-12">
        {/* Persistent Chapter Sequence Navigation */}
        <ChapterNav activeChapter="future" className="mb-10" />

        {/* Page-level disclosure (once) */}
        <Notice title={conceptLabel}>
          <p className="text-sm leading-relaxed">
            {t("media.conceptLongDisclosure")}
          </p>
        </Notice>

        {/* Conceptual Planning Status Notice */}
        <div className="mt-4">
          <Notice title={t("airport.futureNoticeTitle")}>
            <p className="text-sm leading-relaxed">
              {t("airport.futureNotice")}
            </p>
          </Notice>
        </div>

        {/* ── Main chapters: day imagery with editorial narrative ── */}
        <div className="mt-12 space-y-10">
          {/* Chapter 1 — Landside / Terminal Arrival */}
          <article className="grid gap-6 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] sm:grid-cols-2">
            <figure className="relative m-0 aspect-[16/10] size-full overflow-hidden bg-ink sm:aspect-auto">
              <ResponsiveImage
                entry="landside-day"
                sizes="(min-width: 640px) 50vw, 100vw"
                className="size-full object-cover opacity-90 transition-transform duration-500 hover:scale-105"
              />
              <figcaption className="absolute bottom-3 start-4 rounded-md bg-ink/80 px-2 py-0.5 font-mono text-xs text-ink-muted">
                {t("media.conceptShortLabel")}
              </figcaption>
            </figure>
            <div className="flex flex-col justify-between p-6 sm:p-8">
              <div>
                <div className="flex items-center gap-2">
                  <span className="numeral font-mono text-xs font-bold text-clay">01</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <Building2 aria-hidden="true" className="size-4 text-primary" />
                  <span className="type-label text-xs text-muted-foreground">{t("airport.conceptStudy")}</span>
                </div>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                  {t("airport.themeTerminalTitle")}
                </h2>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                  {t("airport.themeTerminalBody")}
                </p>
              </div>
              <div className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{t("airport.designIntentLabel")}{" "}</span>
                <span>{t("airport.designIntentText")}</span>
              </div>
            </div>
          </article>

          {/* Chapter 2 — Passenger Concourse */}
          <article className="grid gap-6 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] sm:grid-cols-2 sm:[&>figure]:order-last">
            <div className="flex flex-col justify-between p-6 sm:p-8">
              <div>
                <div className="flex items-center gap-2">
                  <span className="numeral font-mono text-xs font-bold text-clay">02</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <Sparkles aria-hidden="true" className="size-4 text-primary" />
                  <span className="type-label text-xs text-muted-foreground">{t("airport.conceptStudy")}</span>
                </div>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                  {t("airport.themeHospitalityTitle")}
                </h2>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                  {t("airport.themeHospitalityBody")}
                </p>
              </div>
              <div className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{t("airport.designIntentLabel")}{" "}</span>
                <span>{t("airport.designIntentText")}</span>
              </div>
            </div>
            <figure className="relative m-0 aspect-[16/10] size-full overflow-hidden bg-ink sm:aspect-auto">
              <ResponsiveImage
                entry="concourse-day"
                sizes="(min-width: 640px) 50vw, 100vw"
                className="size-full object-cover opacity-90 transition-transform duration-500 hover:scale-105"
              />
              <figcaption className="absolute bottom-3 start-4 rounded-md bg-ink/80 px-2 py-0.5 font-mono text-xs text-ink-muted">
                {t("media.conceptShortLabel")}
              </figcaption>
            </figure>
          </article>

          {/* Chapter 3 — Airfield & Coastal Runway */}
          <article className="grid gap-6 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] sm:grid-cols-2">
            <figure className="relative m-0 aspect-[16/10] size-full overflow-hidden bg-ink sm:aspect-auto">
              <ResponsiveImage
                entry="runway-day"
                sizes="(min-width: 640px) 50vw, 100vw"
                className="size-full object-cover opacity-90 transition-transform duration-500 hover:scale-105"
              />
              <figcaption className="absolute bottom-3 start-4 rounded-md bg-ink/80 px-2 py-0.5 font-mono text-xs text-ink-muted">
                {t("media.conceptShortLabel")}
              </figcaption>
            </figure>
            <div className="flex flex-col justify-between p-6 sm:p-8">
              <div>
                <div className="flex items-center gap-2">
                  <span className="numeral font-mono text-xs font-bold text-clay">03</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <Plane aria-hidden="true" className="size-4 text-primary" />
                  <span className="type-label text-xs text-muted-foreground">{t("airport.conceptStudy")}</span>
                </div>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                  {t("airport.themeMasterplanTitle")}
                </h2>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                  {t("airport.themeMasterplanBody")}
                </p>
              </div>
              <div className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{t("airport.designIntentLabel")}{" "}</span>
                <span>{t("airport.designIntentText")}</span>
              </div>
            </div>
          </article>
        </div>

        {/* ── Editorial night/interior study sequence ── */}
        <section aria-labelledby="night-study-heading" className="mt-16 border-t border-border pt-12">
          <h2 id="night-study-heading" className="text-2xl font-bold text-foreground">
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
                <li key={study.slug} className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
                  <figure className="m-0">
                    <div className="relative aspect-[16/10] overflow-hidden bg-ink">
                      <ResponsiveImage
                        entry={study.slug}
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        className="size-full object-cover opacity-85 transition-transform duration-500 hover:scale-105"
                      />
                      <span className="absolute bottom-2 start-3 rounded bg-ink/80 px-1.5 py-0.5 font-mono text-[0.6rem] text-ink-muted">
                        {t("media.conceptShortLabel")}
                      </span>
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
        <Panel className="mt-14 border-clay/20 bg-card">
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
