import { useCommercialOptions } from "@/lib/commercial/queries";
import { CommercialCatalogState } from "@/components/commercial-catalog-state";
import { commercialFarePrice } from "@/lib/commercial/pricing";
import type { FareId } from "@/lib/commercial/types";
import { Eyebrow } from "@/components/kit";
import { RadioGroup } from "@/components/ui/radio-group";
import { FareOption } from "@/components/booking/fare-option";
import { type Fare, type Flight } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import type { Draft } from "@/lib/store";

export interface FareStepProps {
  draft: Draft;
  onSelectFare: (fareId: Fare["id"]) => void;
  onBack: () => void;
  onNext: () => void;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
  stepNav: React.ReactNode;
}

export function FareStep({
  draft,
  onSelectFare,
  headingRef,
  stepNav,
}: FareStepProps) {
  const { t, lang } = useI18n();
  const commercial = useCommercialOptions();
  const { fares } = commercial;
  const farePrice = (base: number, fare: FareId, cabin: string) => commercial.catalogSnapshot ? commercialFarePrice(commercial.catalogSnapshot, base, fare, cabin) : NaN;

  if (!commercial.catalog || commercial.query.isError) return <CommercialCatalogState />;
  const offered = fares.filter(f=>f.active && f.allowedCabins.some(c=>c===draft.criteria.cabin)).sort((a,b)=>a.order-b.order);
  return (
    <section aria-labelledby="fare-title" className="space-y-6">
      <div>
        <Eyebrow>{t("step.fare")}</Eyebrow>
        <h1
          id="fare-title"
          ref={headingRef}
          tabIndex={-1}
          className="mt-2 text-2xl font-bold sm:text-3xl outline-none"
        >
          {t("book.fareTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("book.fareSub")}</p>
      </div>

      {offered.length === 0 ? <p role="alert">{t("commercial.noFare")}</p> : null}
      <RadioGroup
        dir={lang === "ar" ? "rtl" : "ltr"}
        value={draft.fareId}
        onValueChange={(val) => onSelectFare(val as Fare["id"])}
        aria-labelledby="fare-title"
        className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch"
      >
        {offered.map((fare) => {
          const price = draft.outbound
            ? farePrice(draft.outbound.basePrice, fare.id, draft.criteria.cabin)
            : 0;
          return (
            <FareOption
              key={fare.id}
              fare={fare}
              price={price}
              selected={draft.fareId === fare.id}
            />
          );
        })}
      </RadioGroup>

      {stepNav}
    </section>
  );
}
