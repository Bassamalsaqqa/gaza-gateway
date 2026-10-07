import { AppLink } from "@/components/app-link";
import { ArrowRight, Clock } from "lucide-react";
import { Code } from "./kit";
import { minutesToLabel, type Destination } from "@/lib/data";
import { money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import destinationWorldMapImg from "@/assets/media/decorative/cards/istanbul-world-map.webp";
import {
  buildDestinationSrcSet,
  getDestinationPhotoByCode,
  smallestDestinationSrc,
  type DestinationPhoto,
} from "@/lib/destination-media";

export function DestinationCard({
  destination,
  size = "md",
  photoOverride,
  focalOverride,
}: {
  destination: Destination;
  size?: "md" | "lg" | undefined;
  photoOverride?: DestinationPhoto | undefined;
  focalOverride?: { x: number; y: number } | undefined;
}) {
  const { t, lang } = useI18n();
  const photo = photoOverride ?? getDestinationPhotoByCode(destination.code);
  const focal = focalOverride ?? photo?.defaultFocalPoint ?? { x: 50, y: 50 };

  return (
    <AppLink
      to="/destinations/$code"
      params={{ code: destination.code }}
      data-surface-target="home.destination-card"
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-[var(--shadow-lift)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {/* Top Media Stage: Owner city photograph with responsive WebP variants */}
      <div className={size === "lg" ? "relative aspect-[4/3] overflow-hidden" : "relative aspect-[3/2] overflow-hidden"}>
        {photo && (
          <img
            data-destination-photo={destination.code}
            src={smallestDestinationSrc(photo)}
            srcSet={buildDestinationSrcSet(photo)}
            sizes={size === "lg" ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"}
            alt=""
            width={photo.width}
            height={photo.height}
            loading="lazy"
            decoding="async"
            style={{ objectPosition: `${focal.x}% ${focal.y}%` }}
            className="size-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:transform-none"
          />
        )}
      </div>

      {/* Lower Card Body: shared approved decorative world-map on dark ink surface */}
      <div className="relative flex flex-1 flex-col gap-1 overflow-hidden bg-ink p-4 text-ink-foreground">
        <img
          data-decorative-asset="destination-card-body"
          src={destinationWorldMapImg}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="pointer-events-none absolute inset-0 size-full select-none object-cover object-center"
        />
        <div className="relative z-10 flex flex-1 flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-lg font-bold text-ink-foreground">
              {pick(lang, destination.city)}
            </h3>
            <Code className="text-xs font-semibold border-ink-border bg-ink/80 text-ink-foreground">
              {destination.code}
            </Code>
          </div>
          <p className="text-sm font-medium text-ink-muted">
            {pick(lang, destination.country)}
          </p>
          <div className="mt-3 flex items-center justify-between border-t border-ink-border pt-3 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium text-ink-muted">
              <Clock aria-hidden="true" className="size-3.5" />
              <span className="numeral">{minutesToLabel(destination.flightMinutes, lang)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-secondary">
              {t("dest.from")} {money(destination.priceFrom, lang)}
              <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
            </span>
          </div>
        </div>
      </div>
    </AppLink>
  );
}
