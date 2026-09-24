import { createFileRoute } from "@tanstack/react-router";
import { Compass, FileCheck2, MapPin, ShieldCheck } from "lucide-react";
import { ChapterNav, ChapterPagination } from "@/components/airport/chapter-nav";
import { Container, Panel } from "@/components/kit";
import { img } from "@/lib/data";
import { useI18n } from "@/lib/i18n";

type AirportSearch = {
  skinPreview?: 1;
  studioPreview?: 1;
  baseline?: 1;
};

export const Route = createFileRoute("/{-$locale}/airport/present")({
  validateSearch: (search: Record<string, unknown>): AirportSearch => {
    const out: AirportSearch = {};
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
      { title: "The present — Gaza International Airport today" },
      {
        name: "description",
        content:
          "A factual account of the present-day state of Gaza International Airport: the site, its structures, and what is documented versus pending verification.",
      },
      { property: "og:title", content: "The present — Gaza International Airport" },
      { property: "og:description", content: "The site today, documented carefully and without embellishment." },
    ],
  }),
  component: PresentPage,
});

function PresentPage() {
  const { t } = useI18n();

  const siteParameters = [
    {
      label: t("airport.siteLocationLabel"),
      value: t("airport.siteLocationValue"),
      detail: "31°14′45″N 34°16′33″E",
    },
    {
      label: t("airport.siteAeroCodesLabel"),
      value: "IATA: GZA · ICAO: LVGZ",
      detail: "Elevation: 98 m / 320 ft",
    },
    {
      label: t("airport.siteOperatingPeriodLabel"),
      value: t("airport.siteOperatingPeriodValue"),
      detail: "Commercial flag carrier base",
    },
    {
      label: t("airport.siteStatusLabel"),
      value: t("airport.siteStatusValue"),
      detail: "Subject to verified surveys",
    },
  ];

  return (
    <>
      {/* Editorial Chapter Hero */}
      <section className="border-b border-border bg-ambient-sand">
        <Container className="py-14 sm:py-20">
          <h1 className="type-title-hero max-w-3xl text-foreground">
            {t("airport.present")}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t("airport.presentSubtitle")}
          </p>
        </Container>
      </section>

      <Container className="py-8 sm:py-12">
        {/* Persistent Chapter Sequence Navigation */}
        <ChapterNav activeChapter="present" className="mb-8" />

        {/* Factual Integrity Notice */}
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {t("airport.presentNotice")}
        </p>

        {/* Key Site Facts Strip */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {siteParameters.map((param) => (
            <div
              key={param.label}
              className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-xs"
            >
              <div>
                <span className="type-label text-xs text-muted-foreground">
                  {param.label}
                </span>
                <p className="mt-2 text-base font-bold text-foreground">
                  {param.value}
                </p>
              </div>
              <p className="mt-4 font-mono text-xs text-muted-foreground">
                <span className="code-id">{param.detail}</span>
              </p>
            </div>
          ))}
        </div>

        {/* Documentary Dossier: Physical Site Condition */}
        <div className="mt-12 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            <Panel>
              <div className="flex items-center gap-2 text-foreground">
                <MapPin aria-hidden="true" className="size-5 text-clay" />
                <h2 className="text-xl font-bold">
                  {t("airport.siteBoundariesTitle")}
                </h2>
              </div>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                {t("airport.siteBoundariesBody1")}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {t("airport.siteBoundariesBody2")}
              </p>
            </Panel>

            <Panel>
              <div className="flex items-center gap-2 text-foreground">
                <Compass aria-hidden="true" className="size-5 text-primary" />
                <h2 className="text-xl font-bold">
                  {t("airport.runwayTitle")}
                </h2>
              </div>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                {t("airport.runwayBody")}
              </p>
            </Panel>

            <Panel>
              <div className="flex items-center gap-2 text-foreground">
                <FileCheck2 aria-hidden="true" className="size-5 text-clay" />
                <h2 className="text-xl font-bold">
                  {t("airport.verificationTitle")}
                </h2>
              </div>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                {t("airport.verificationBody")}
              </p>
            </Panel>
          </div>

          {/* Spatial Map & Survey Panel */}
          <aside className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
            <div className="relative aspect-4/3 w-full overflow-hidden bg-ink">
              <img
                src={img("map-outline-neutral", 800, 600)}
                alt=""
                loading="lazy"
                className="size-full object-cover opacity-75 transition-transform duration-500 hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-transparent to-transparent" />
            </div>
            <div className="flex flex-1 flex-col justify-between p-5 sm:p-6">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  {t("airport.spatialTitle")}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t("airport.spatialBody")}
                </p>
              </div>

              <div className="mt-6 rounded-xl border border-border bg-secondary/50 p-3.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  <span className="font-semibold text-foreground">
                    {t("airport.evidentiaryRuleTitle")}
                  </span>
                </div>
                <p className="mt-1">
                  {t("airport.evidentiaryRuleBody")}
                </p>
              </div>
            </div>
          </aside>
        </div>

        {/* Chapter Pagination to Previous (Past) and Next (Future) */}
        <ChapterPagination currentChapter="present" />
      </Container>
    </>
  );
}
