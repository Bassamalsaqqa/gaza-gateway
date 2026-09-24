import { AppLink } from "@/components/app-link";
import { ArrowRight, Clock } from "lucide-react";
import { Code } from "./kit";
import { img, minutesToLabel, type Destination } from "@/lib/data";
import { money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";

export function DestinationCard({ destination, size = "md" }: { destination: Destination; size?: "md" | "lg" }) {
  const { t, lang } = useI18n();
  return (
    <AppLink
      to="/destinations/$code"
      params={{ code: destination.code }}
      data-surface-target="home.destination-card"
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-[var(--shadow-lift)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className={size === "lg" ? "aspect-[4/3] overflow-hidden" : "aspect-[3/2] overflow-hidden"}>
        <img
          src={img(destination.imageSeed, 900, 600)}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-lg font-bold">{pick(lang, destination.city)}</h3>
          <Code className="text-xs text-muted-foreground">{destination.code}</Code>
        </div>
        <p className="text-sm text-muted-foreground">{pick(lang, destination.country)}</p>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Clock aria-hidden="true" className="size-3.5" />
            <span className="numeral">{minutesToLabel(destination.flightMinutes, lang)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-brand-deep">
            {t("dest.from")} {money(destination.priceFrom, lang)}
            <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
          </span>
        </div>
      </div>
    </AppLink>
  );
}
