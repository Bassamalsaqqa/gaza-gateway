import { createFileRoute } from "@tanstack/react-router";
import { Compass, FileCheck2, MapPin, ShieldCheck } from "lucide-react";
import { ChapterNav, ChapterPagination } from "@/components/airport/chapter-nav";
import { Container } from "@/components/kit";
import { PublicPhotoHero } from "@/components/media/public-photo-hero";
import { publishedAirportPresent } from "@/content/published/airport-present";
import { ContentPreviewNotice, useContentPreview } from "@/content/preview";
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
  contentPreview?: 1;
  skinPreview?: 1;
  studioPreview?: 1;
  baseline?: 1;
};

export const Route = createFileRoute("/{-$locale}/airport/present")({
  validateSearch: (search: Record<string, unknown>): AirportSearch => {
    const out: AirportSearch = {};
    if (search["contentPreview"] === "1" || search["contentPreview"] === 1) out.contentPreview = 1;
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

interface PresentArtworkCardProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: "div" | "article" | "section" | "aside";
  imageSrc?: string | undefined;
  imageClassName?: string;
  legibilityClassName?: string;
  contentClassName?: string;
  cardId?: string;
  children: React.ReactNode;
}

function PresentArtworkCard({
  as: Component = "div",
  imageSrc,
  imageClassName,
  legibilityClassName,
  contentClassName,
  cardId,
  className,
  children,
  ...props
}: PresentArtworkCardProps) {
  return (
    <Component
      data-present-art-card={cardId}
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xs transition-shadow hover:shadow-sm",
        className
      )}
      {...props}
    >
      {/* Decorative artwork fills complete card bounds */}
      {imageSrc ? (
        <img
          data-present-art-background
          src={imageSrc}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className={cn(
            "pointer-events-none absolute inset-0 size-full select-none",
            imageClassName ?? "object-cover object-center"
          )}
        />
      ) : null}

      {/* Restrained legibility layer above art */}
      <div
        data-present-legibility-layer
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0",
          legibilityClassName
        )}
      />

      {/* Real selectable semantic HTML text overlaying art */}
      <div
        data-present-card-content
        className={cn("relative z-10", contentClassName)}
      >
        {children}
      </div>
    </Component>
  );
}

function renderFactDetail(detailText: string) {
  // Isolate technical tokens like runway 01/19 while preserving natural Arabic text direction
  const parts = detailText.split(/(01\/19)/g);
  if (parts.length === 1) {
    return detailText;
  }
  return parts.map((part, index) => {
    if (part === "01/19") {
      return (
        <span key={index} dir="ltr" className="inline-block font-mono font-semibold text-white">
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
  const { content, previewing, previewError, previewLoading } = useContentPreview("airport.present", publishedAirportPresent);

  return (
    <>
      {previewing && <ContentPreviewNotice error={previewError} loading={previewLoading} />}
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

        {/* Key Site Facts Strip with Decorative Designer Artwork Backgrounds */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {content.facts.map((fact) => {
            const skin = FACT_SKINS[fact.id];
            return (
              <PresentArtworkCard
                key={fact.id}
                as="article"
                cardId={fact.id}
                data-fact-card={fact.id}
                imageSrc={skin}
                imageClassName="object-fill"
                legibilityClassName="bg-gradient-to-t from-ink/65 via-ink/25 to-transparent"
                contentClassName="flex flex-1 flex-col justify-between p-5 min-h-[230px] sm:min-h-[250px]"
              >
                <div>
                  <span className="type-label text-xs font-semibold tracking-wider text-sand/90">
                    {isArabic ? fact.label.ar : fact.label.en}
                  </span>
                  <p className="mt-2 text-base font-bold text-white drop-shadow-xs">
                    {fact.id === "fact-aero-codes" ? (
                      <span dir="ltr" className="inline-block font-mono">
                        {isArabic ? fact.value.ar : fact.value.en}
                      </span>
                    ) : (
                      isArabic ? fact.value.ar : fact.value.en
                    )}
                  </p>
                </div>
                <p className="mt-4 text-xs leading-relaxed text-sand/85">
                  {renderFactDetail(isArabic ? fact.detail.ar : fact.detail.en)}
                </p>
              </PresentArtworkCard>
            );
          })}
        </div>

        {/* Documentary Dossier: Physical Site Condition & Spatial Analysis */}
        <div className="mt-12 grid gap-8 items-start lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            {content.dossiers.map((dossier) => {
              const skin = DOSSIER_SKINS[dossier.id];
              const Icon = DOSSIER_ICONS[dossier.id as keyof typeof DOSSIER_ICONS] ?? FileCheck2;

              return (
                <PresentArtworkCard
                  key={dossier.id}
                  as="article"
                  cardId={dossier.id}
                  data-dossier-panel={dossier.id}
                  imageSrc={skin}
                  imageClassName="object-fill"
                  legibilityClassName="bg-gradient-to-b sm:bg-gradient-to-r rtl:sm:bg-gradient-to-l from-ink/75 via-ink/55 to-ink/20"
                  contentClassName="p-6 sm:p-7"
                >
                  <div className="flex items-center gap-2.5 text-white">
                    <Icon aria-hidden="true" className="size-5 shrink-0 text-clay-soft" />
                    <h2 className="text-xl font-bold tracking-tight">
                      {isArabic ? dossier.title.ar : dossier.title.en}
                    </h2>
                  </div>
                  <div className="mt-4 space-y-3 max-w-xl lg:max-w-2xl">
                    {dossier.paragraphs.map((p, idx) => (
                      <p
                        key={idx}
                        className={cn(
                          "leading-relaxed",
                          idx === 0 ? "text-base font-normal text-white" : "text-sm text-sand"
                        )}
                      >
                        {isArabic ? p.ar : p.en}
                      </p>
                    ))}
                  </div>
                </PresentArtworkCard>
              );
            })}
          </div>

          {/* Spatial Map & Global Reach Panel */}
          <PresentArtworkCard
            as="aside"
            cardId="spatial-geometry"
            data-spatial-aside
            imageSrc={spatialGeometrySkin}
            imageClassName="object-fill"
            legibilityClassName="bg-gradient-to-b from-ink/35 via-ink/10 to-transparent"
            contentClassName="flex flex-col justify-between p-6 sm:p-7 min-h-[380px]"
          >
            <div>
              <h3 className="text-lg font-bold text-white">
                {isArabic ? content.spatial.title.ar : content.spatial.title.en}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-sand/90">
                {isArabic ? content.spatial.description.ar : content.spatial.description.en}
              </p>
            </div>

            <div className="mt-6 rounded-xl border border-ink-border/30 bg-ink/75 p-4 text-xs text-sand/90 backdrop-blur-xs">
              <div className="flex items-center gap-2">
                <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-brand-soft" />
                <span className="font-semibold text-white">
                  {isArabic
                    ? content.spatial.evidentiaryRuleTitle.ar
                    : content.spatial.evidentiaryRuleTitle.en}
                </span>
              </div>
              <p className="mt-1.5 leading-relaxed text-sand/80">
                {isArabic
                  ? content.spatial.evidentiaryRuleBody.ar
                  : content.spatial.evidentiaryRuleBody.en}
              </p>
            </div>
          </PresentArtworkCard>
        </div>

        {/* International Corridors & Global Horizons (Ninth Master Skin) */}
        <PresentArtworkCard
          as="section"
          cardId="global-network"
          data-transition-panel
          imageSrc={globalNetworkSkin}
          imageClassName="object-fill"
          legibilityClassName="bg-gradient-to-t from-ink/60 via-ink/20 to-transparent"
          contentClassName="p-6 sm:p-8 md:p-10 min-h-[260px] sm:min-h-[300px] flex flex-col justify-end"
          className="mt-12"
        >
          <div className="max-w-3xl">
            <div className="eyebrow mb-2 font-mono text-xs tracking-wider uppercase text-clay-soft">
              {isArabic ? content.globalHorizons.eyebrow.ar : content.globalHorizons.eyebrow.en}
            </div>
            <h2 className="text-xl font-bold text-white sm:text-2xl">
              {isArabic ? content.globalHorizons.title.ar : content.globalHorizons.title.en}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-sand/90 sm:text-base">
              {isArabic ? content.globalHorizons.description.ar : content.globalHorizons.description.en}
            </p>
          </div>
        </PresentArtworkCard>

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
