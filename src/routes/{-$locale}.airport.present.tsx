import { createFileRoute } from "@tanstack/react-router";
import { Compass, FileCheck2, MapPin, ShieldCheck } from "lucide-react";
import { ChapterNav, ChapterPagination } from "@/components/airport/chapter-nav";
import { Container } from "@/components/kit";
import { PublicPhotoHero } from "@/components/media/public-photo-hero";
import { publishedAirportPresent } from "@/content/published/airport-present";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Decorative WebP skins (nine designer artwork masters)
import factLocationSkin from "@/assets/media/decorative/airport/present/fact-location.webp";
import factAeroCodesSkin from "@/assets/media/decorative/airport/present/fact-aero-codes.webp";
import factOperatingPeriodSkin from "@/assets/media/decorative/airport/present/fact-operating-period.webp";
import factFacilityStatusSkin from "@/assets/media/decorative/airport/present/fact-facility-status.webp";
import dossierBoundariesSkin from "@/assets/media/decorative/airport/present/dossier-boundaries.webp";
import dossierRunwaySkin from "@/assets/media/decorative/airport/present/dossier-runway.webp";
import dossierVerificationSkin from "@/assets/media/decorative/airport/present/dossier-verification.webp";
import spatialGeometrySkin from "@/assets/media/decorative/airport/present/spatial-geometry.webp";
import globalNetworkSkin from "@/assets/media/decorative/airport/present/global-network.webp";

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
  head: ({ params }) => {
    const isAr = (params as Record<string, string>)["locale"] === "ar";
    const seo = publishedAirportPresent.seo;
    const title = isAr ? seo.title.ar : seo.title.en;
    const description = isAr ? seo.description.ar : seo.description.en;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: PresentPage,
});

const FACT_SKINS: Record<string, string> = {
  "fact-location": factLocationSkin,
  "fact-aero-codes": factAeroCodesSkin,
  "fact-operating-period": factOperatingPeriodSkin,
  "fact-facility-status": factFacilityStatusSkin,
};

const DOSSIER_SKINS: Record<string, string> = {
  "dossier-boundaries": dossierBoundariesSkin,
  "dossier-runway": dossierRunwaySkin,
  "dossier-verification": dossierVerificationSkin,
};

const DOSSIER_ICONS = {
  "dossier-boundaries": MapPin,
  "dossier-runway": Compass,
  "dossier-verification": FileCheck2,
} as const;

function renderFactDetail(detailText: string) {
  // Isolate technical tokens like runway 01/19 while preserving natural Arabic text direction
  const parts = detailText.split(/(01\/19)/g);
  if (parts.length === 1) {
    return detailText;
  }
  return parts.map((part, index) => {
    if (part === "01/19") {
      return (
        <span key={index} dir="ltr" className="inline-block font-mono text-xs">
          {part}
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function PresentPage() {
  const { lang, t } = useI18n();
  const isArabic = lang === "ar";
  const content = publishedAirportPresent;

  return (
    <>
      {/* Editorial Chapter Hero with Licensed Dated Documentary Evidence */}
      <PublicPhotoHero
        mediaId="airport-present-ruins-2008"
        routeKey="present"
        title={isArabic ? content.intro.title.ar : content.intro.title.en}
        description={isArabic ? content.intro.subtitle.ar : content.intro.subtitle.en}
      />

      <Container className="py-8 sm:py-12">
        {/* Persistent Chapter Sequence Navigation */}
        <ChapterNav activeChapter="present" className="mb-8" />

        {/* Factual Integrity & Evidentiary Restraint Notice */}
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {isArabic ? content.intro.notice.ar : content.intro.notice.en}
        </p>

        {/* Key Site Facts Strip with Decorative Designer Artwork Skins */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {content.facts.map((fact) => {
            const skin = FACT_SKINS[fact.id];
            return (
              <div
                key={fact.id}
                data-fact-card={fact.id}
                className="flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition-shadow hover:shadow-sm"
              >
                {skin ? (
                  <div className="relative aspect-799/253 w-full overflow-hidden bg-sand-subtle/50">
                    <img
                      src={skin}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  </div>
                ) : null}
                <div className="flex flex-1 flex-col justify-between p-5">
                  <div>
                    <span className="type-label text-xs text-muted-foreground">
                      {isArabic ? fact.label.ar : fact.label.en}
                    </span>
                    <p className="mt-2 text-base font-bold text-foreground">
                      {fact.id === "fact-aero-codes" ? (
                        <span dir="ltr" className="inline-block font-mono">
                          {isArabic ? fact.value.ar : fact.value.en}
                        </span>
                      ) : (
                        isArabic ? fact.value.ar : fact.value.en
                      )}
                    </p>
                  </div>
                  <p className="mt-4 text-xs text-muted-foreground">
                    {renderFactDetail(isArabic ? fact.detail.ar : fact.detail.en)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Documentary Dossier: Physical Site Condition & Spatial Analysis */}
        <div className="mt-12 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            {content.dossiers.map((dossier) => {
              const skin = DOSSIER_SKINS[dossier.id];
              const Icon = DOSSIER_ICONS[dossier.id as keyof typeof DOSSIER_ICONS] ?? FileCheck2;

              return (
                <div
                  key={dossier.id}
                  data-dossier-panel={dossier.id}
                  className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs"
                >
                  {skin ? (
                    <div className="relative aspect-1890/276 w-full max-h-36 overflow-hidden bg-sand-subtle/40">
                      <img
                        src={skin}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    </div>
                  ) : null}
                  <div className="p-6">
                    <div className="flex items-center gap-2.5 text-foreground">
                      <Icon aria-hidden="true" className="size-5 shrink-0 text-clay" />
                      <h2 className="text-xl font-bold">
                        {isArabic ? dossier.title.ar : dossier.title.en}
                      </h2>
                    </div>
                    <div className="mt-3.5 space-y-3">
                      {dossier.paragraphs.map((p, idx) => (
                        <p
                          key={idx}
                          className={cn(
                            "leading-relaxed text-muted-foreground",
                            idx === 0 ? "text-base" : "text-sm",
                          )}
                        >
                          {isArabic ? p.ar : p.en}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Spatial Map & Global Reach Panel */}
          <aside
            data-spatial-aside
            className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xs"
          >
            <div className="relative aspect-1350/440 w-full overflow-hidden bg-sand-subtle/50">
              <img
                src={spatialGeometrySkin}
                alt=""
                aria-hidden="true"
                loading="lazy"
                className="size-full object-cover"
              />
            </div>
            <div className="flex flex-1 flex-col justify-between p-5 sm:p-6">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  {isArabic ? content.spatial.title.ar : content.spatial.title.en}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {isArabic ? content.spatial.description.ar : content.spatial.description.en}
                </p>
              </div>

              <div className="mt-6 rounded-xl border border-border bg-secondary/50 p-3.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  <span className="font-semibold text-foreground">
                    {isArabic
                      ? content.spatial.evidentiaryRuleTitle.ar
                      : content.spatial.evidentiaryRuleTitle.en}
                  </span>
                </div>
                <p className="mt-1">
                  {isArabic
                    ? content.spatial.evidentiaryRuleBody.ar
                    : content.spatial.evidentiaryRuleBody.en}
                </p>
              </div>
            </div>
          </aside>
        </div>

        {/* International Corridors & Global Horizons (Ninth Master Skin) */}
        <section
          data-transition-panel
          className="mt-12 overflow-hidden rounded-2xl border border-border bg-card shadow-xs"
        >
          <div className="relative aspect-1678/913 w-full max-h-72 overflow-hidden bg-ink/5">
            <img
              src={globalNetworkSkin}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="size-full object-cover"
            />
          </div>
          <div className="p-6 sm:p-8">
            <div className="eyebrow mb-2 text-clay">
              {isArabic ? content.globalHorizons.eyebrow.ar : content.globalHorizons.eyebrow.en}
            </div>
            <h2 className="text-xl font-bold text-foreground sm:text-2xl">
              {isArabic ? content.globalHorizons.title.ar : content.globalHorizons.title.en}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {isArabic ? content.globalHorizons.description.ar : content.globalHorizons.description.en}
            </p>
          </div>
        </section>

        {/* Public Credit & Documentary Attribution Strip */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6 text-xs text-muted-foreground">
          <p>
            <span>{t("present.credit.label")}</span>
            <a
              href="https://commons.wikimedia.org/wiki/File:Gaza_AirPort_,_Gaza_,_2-1-2011_(47).jpg"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {t("present.credit.sourceLabel")}
            </a>
            <span> · {t("present.credit.photoBy")} · </span>
            <a
              href="https://creativecommons.org/licenses/by-sa/2.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {t("present.credit.licenseLabel")}
            </a>
            <span> · {t("present.credit.modification")}</span>
          </p>
          <p className="font-mono text-xs">
            <span className="code-id inline-block" dir="ltr">
              IATA: GZA · ICAO: LVGZ
            </span>
          </p>
        </div>

        {/* Chapter Pagination to Previous (Past) and Next (Future) */}
        <ChapterPagination currentChapter="present" />
      </Container>
    </>
  );
}
