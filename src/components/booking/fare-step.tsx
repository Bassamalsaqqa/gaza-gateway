import { Eyebrow } from "@/components/kit";
import { RadioGroup } from "@/components/ui/radio-group";
import { FareOption } from "@/components/booking/fare-option";
import { farePrice, fares, type Fare, type Flight } from "@/lib/data";
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

      <RadioGroup
        dir={lang === "ar" ? "rtl" : "ltr"}
        value={draft.fareId}
        onValueChange={(val) => onSelectFare(val as Fare["id"])}
        aria-labelledby="fare-title"
        className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch"
      >
        {fares.map((fare) => {
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
