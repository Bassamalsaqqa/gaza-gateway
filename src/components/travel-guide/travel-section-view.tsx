import { useMemo } from "react";
import { GazaSurface, SurfaceMedia, useSurfaceRecipe } from "@/design/surfaces";
import { ResponsiveImage } from "@/components/responsive-image";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Check, HelpCircle, ShieldCheck } from "lucide-react";
import { pick, useI18n } from "@/lib/i18n";
import type { Lang } from "@/lib/locale";
import type { TravelGuideSection } from "@/content/types";
import { MEDIA } from "@/lib/media";
import { cn } from "@/lib/utils";
import {
  getSectionFaqs,
  getSectionSummaryFacts,
  getTravelSectionMeta,
} from "./travel-helpers";
import { TravelActionTray } from "./travel-action-tray";

interface TravelSectionViewProps {
  section: TravelGuideSection;
  lang: Lang;
}

export function TravelSectionView({ section, lang }: TravelSectionViewProps) {
  const { t } = useI18n();
  const isAr = lang === "ar";

  const { active: isGuideActive, recipe: guideRecipe } = useSurfaceRecipe(
    "guide",
    "travel.guide",
  );
  const mediaTreatment = guideRecipe.mediaTreatment;

  const visiblePoints = useMemo(
    () => (Array.isArray(section.points) ? section.points.filter((p) => p.visible) : []),
    [section.points],
  );

  const facts = useMemo(
    () => getSectionSummaryFacts(section.id, lang),
    [section.id, lang],
  );

  const faqs = useMemo(
    () => getSectionFaqs(section.id, lang),
    [section.id, lang],
  );

  const meta = useMemo(
    () => getTravelSectionMeta(section, lang),
    [section, lang],
  );

  // Surface Grammar / Appearance Studio media resolution
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
            ? "w-full overflow-hidden rounded-2xl border border-sand-deep bg-card shadow-xs"
            : "overflow-hidden rounded-2xl border border-sand-deep bg-card shadow-xs size-full"
      }
    >
      <div
        className={cn(
          "relative overflow-hidden bg-ink",
          activeTreatment === "cover" || activeTreatment === "watermark"
            ? "size-full"
            : "aspect-[16/10] max-h-[360px]",
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
          <figcaption className="p-4 text-xs leading-relaxed text-muted-foreground border-t border-sand-deep">
            <span className="font-semibold text-foreground">
              {t("travel.assistanceConceptLabel")}{" "}
            </span>
            {t("travel.assistanceConceptNote")}
          </figcaption>
        ) : (
          <figcaption className="p-3 text-xs leading-relaxed text-muted-foreground border-t border-sand-deep">
            <span className="font-semibold text-foreground">
              {isAr ? activeMediaEntry?.altAr : activeMediaEntry?.altEn}
            </span>
          </figcaption>
        )
      ) : null}
    </SurfaceMedia>
  ) : null;

  // Editorial content block with solid ivory cards & deliberate hierarchy
  const editorialHeader = (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-sand-deep bg-card px-3 py-1 font-mono text-xs font-medium text-foreground shadow-xs">
          <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-primary-foreground shadow-xs" dir="ltr">
            {meta.stepNumber}
          </span>
          <span className="font-semibold text-foreground">{meta.stageLabel}</span>
        </span>
        <span className="text-muted-foreground" aria-hidden="true">•</span>
        <span className="text-muted-foreground font-medium">{meta.readTime}</span>
      </div>

      <h2 className="mt-3.5 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl text-balance">
        {pick(lang, section.title)}
      </h2>

      <p className="mt-3.5 text-sm sm:text-base leading-relaxed text-muted-foreground max-w-[65ch]">
        {pick(lang, section.body)}
      </p>

      {/* Actual feature summary facts in solid ivory cards */}
      {facts.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {facts.map((f, i) => (
            <div
              key={i}
              className="rounded-xl border border-sand-deep bg-card p-3.5 sm:p-4 shadow-xs transition-colors hover:border-brand hover:bg-sand-deep"
            >
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{f.label}</div>
              <div className="mt-1 font-display text-base sm:text-lg font-bold tracking-tight text-brand-deep">
                {f.value}
              </div>
              <div className="mt-1 text-xs text-muted-foreground leading-snug">{f.detail}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Contextual Action Tray */}
      <TravelActionTray sectionId={section.id} lang={lang} />
    </div>
  );

  // Authentically rendered CMS points checklist with solid ivory/olive elements
  const checklistContent = (
    <div className="min-w-0 flex flex-col justify-start">
      <h3 className="font-display text-sm sm:text-base font-bold text-foreground mb-3 flex items-center gap-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-brand text-primary-foreground shadow-xs">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
        </div>
        <span>{isAr ? "إرشادات المسافر الأساسية" : "Core Traveler Guidelines"}</span>
      </h3>

      <ul className="divide-y divide-sand-deep rounded-xl border border-sand-deep bg-card shadow-xs overflow-hidden">
        {visiblePoints.map((point) => (
          <li
            key={point.id}
            className="flex items-start gap-3 p-3.5 sm:p-4 text-xs sm:text-sm text-foreground leading-relaxed"
          >
            <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-primary-foreground shadow-xs">
              <Check className="size-3" aria-hidden="true" />
            </div>
            <span className="flex-1">{pick(lang, point.text)}</span>
          </li>
        ))}
      </ul>

      {/* Progressive disclosure Q&A accordion */}
      {faqs.length > 0 ? (
        <div className="mt-6">
          <h4 className="font-display text-xs sm:text-sm font-semibold text-muted-foreground mb-2.5 flex items-center gap-1.5">
            <HelpCircle className="size-3.5 text-brand-deep" aria-hidden="true" />
            <span>{isAr ? "أسئلة شائعة حول هذا القسم" : "Frequently Asked Questions"}</span>
          </h4>

          <Accordion
            type="single"
            collapsible
            className="rounded-xl border border-sand-deep bg-card px-3.5 sm:px-4 shadow-xs divide-y divide-sand-deep overflow-hidden"
          >
            {faqs.map((faq) => (
              <AccordionItem key={faq.id} value={faq.id} className="border-sand-deep py-0.5">
                <AccordionTrigger className="text-start py-3.5 text-xs sm:text-sm font-medium hover:no-underline cursor-pointer group">
                  <span className="pe-2 text-foreground group-hover:text-brand-deep transition-colors font-medium">
                    {faq.question}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-3.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ) : null}
    </div>
  );

  // If Appearance Studio is active, render preview treatment variations
  if (isGuideActive) {
    return (
      <div
        id={`travel-panel-${section.id}`}
        role="tabpanel"
        aria-labelledby={`travel-tab-${section.id}`}
        tabIndex={0}
        style={{ overflowAnchor: "none" }}
        className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary [overflow-anchor:none]"
      >
        {activeTreatment === "top" && travelMedia ? (
          <GazaSurface
            family="guide"
            target="travel.guide"
            as="article"
            baselineClassName="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12"
            className="grid gap-8 p-4 sm:p-6 lg:p-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12"
          >
            <div className="col-span-full order-first">{travelMedia}</div>
            {editorialHeader}
            {checklistContent}
          </GazaSurface>
        ) : activeTreatment === "side" && travelMedia ? (
          <GazaSurface
            family="guide"
            target="travel.guide"
            as="article"
            baselineClassName="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]"
            className="grid gap-6 p-4 sm:p-6 lg:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]"
          >
            {editorialHeader}
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
            <div className="relative z-10 grid gap-6 p-4 sm:p-6 lg:p-8 rounded-xl border border-sand-deep bg-sand lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12">
              {editorialHeader}
              {checklistContent}
            </div>
          </GazaSurface>
        ) : activeTreatment === "watermark" && travelMedia ? (
          <GazaSurface
            family="guide"
            target="travel.guide"
            as="article"
            baselineClassName="relative isolate overflow-hidden"
            className="relative isolate overflow-hidden grid gap-6 p-4 sm:p-6 lg:p-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12"
          >
            {travelMedia}
            <div className="relative z-10 min-w-0">{editorialHeader}</div>
            <div className="relative z-10 min-w-0">{checklistContent}</div>
          </GazaSurface>
        ) : (
          <GazaSurface
            family="guide"
            target="travel.guide"
            as="article"
            baselineClassName="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12"
            className="grid gap-8 p-4 sm:p-6 lg:p-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12"
          >
            {editorialHeader}
            {checklistContent}
          </GazaSurface>
        )}
      </div>
    );
  }

  // Standard production layout: clean two-column grid on desktop, single column on mobile
  return (
    <div
      id={`travel-panel-${section.id}`}
      role="tabpanel"
      aria-labelledby={`travel-tab-${section.id}`}
      tabIndex={0}
      style={{ overflowAnchor: "none" }}
      className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary [overflow-anchor:none]"
    >
      <GazaSurface
        family="guide"
        target="travel.guide"
        as="article"
        baselineClassName="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-12"
        className="grid gap-8 p-4 sm:p-6 lg:p-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-12"
      >
        {editorialHeader}
        {checklistContent}
      </GazaSurface>

      {/* For accessibility section, render the approved concept photo below */}
      {section.id === "accessibility" && (
        <figure className="mt-8 overflow-hidden rounded-2xl border border-sand-deep bg-sand shadow-xs">
          <div className="relative aspect-[16/10] overflow-hidden bg-ink max-h-[360px]">
            <ResponsiveImage
              entry="passenger-assistance"
              sizes="(min-width: 1024px) 60vw, 100vw"
              className="size-full object-cover"
            />
          </div>
          <figcaption className="p-3.5 sm:p-4 text-xs leading-relaxed text-muted-foreground border-t border-sand-deep">
            <span className="font-semibold text-foreground">
              {t("travel.assistanceConceptLabel")}{" "}
            </span>
            {t("travel.assistanceConceptNote")}
          </figcaption>
        </figure>
      )}
    </div>
  );
}
