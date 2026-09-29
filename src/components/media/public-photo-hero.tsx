import type { ReactNode } from "react";
import { Container } from "@/components/kit";
import { ResponsiveImage } from "@/components/responsive-image";
import { MEDIA, type ApprovedMediaId } from "@/lib/media";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface PublicPhotoHeroProps {
  mediaId: ApprovedMediaId;
  routeKey: "airport" | "gallery" | "destinations" | "travel" | "manage" | "check-in" | "flights";
  title: string;
  description?: string;
  children?: ReactNode;
  focalPosition?: string;
  className?: string;
}

export function PublicPhotoHero({
  mediaId,
  routeKey,
  title,
  description,
  children,
  focalPosition = "50% 50%",
  className,
}: PublicPhotoHeroProps) {
  const { t } = useI18n();
  const entry = MEDIA[mediaId];
  // Internal truth classification preserved for policy enforcement — not rendered as a passenger-visible pill
  const truthClass = entry?.truthClass ?? "illustrative-photo";

  const archiveLabel = t("media.archive2000Label");

  return (
    <section
      data-public-hero={routeKey}
      aria-label={title}
      className={cn(
        "relative w-full overflow-hidden bg-ink min-h-[15rem] sm:min-h-[18rem] lg:min-h-[21rem] xl:min-h-[23rem] text-white",
        className,
      )}
    >
      {/* Background responsive photograph — strictly NEVER mirrored */}
      <ResponsiveImage
        entry={mediaId}
        sizes="100vw"
        loading="eager"
        fetchPriority="high"
        className="pointer-events-none absolute inset-0 size-full select-none object-cover"
        style={{ objectPosition: focalPosition }}
      />

      {/* Directional dark overlay behind localized text (EN left, AR right) */}
      <div className="pointer-events-none absolute inset-0 bg-ink/35" aria-hidden="true" />
      <div
        className="pointer-events-none absolute inset-0 ltr:bg-gradient-to-r ltr:from-ink/95 ltr:via-ink/75 ltr:to-transparent rtl:bg-gradient-to-l rtl:from-ink/95 rtl:via-ink/75 rtl:to-transparent"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent"
        aria-hidden="true"
      />

      {/* Hero content container */}
      <Container className="relative z-10 flex min-h-[15rem] sm:min-h-[18rem] lg:min-h-[21rem] xl:min-h-[23rem] flex-col justify-center py-8 sm:py-10 lg:py-12">
        <div className="max-w-2xl">
          {/*
            Archive editorial eyebrow — shown only for historical-documentary heroes (/airport, /gallery).
            This is explicit editorial context, not a class-debug badge.
            Service/illustrative heroes (destinations, travel, manage, check-in, flights)
            do NOT show a passenger-visible badge. Internal truth classification is still
            enforced by media policy and sanitization.
          */}
          {truthClass === "historical-documentary" ? (
            <div className="mb-2.5 sm:mb-3 flex items-center gap-2">
              <span
                data-truth-badge="archive"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-ink/80 px-2.5 py-0.5 text-[0.6875rem] font-medium text-white/90 backdrop-blur-xs select-none shadow-xs"
              >
                <span
                  className="size-1.5 rounded-full bg-amber-400"
                  aria-hidden="true"
                />
                {archiveLabel}
              </span>
            </div>
          ) : null}

          {/* Heading */}
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
            {title}
          </h1>

          {/* Subtitle / Description */}
          {description ? (
            <p className="mt-2 text-sm leading-relaxed text-white/85 sm:text-base sm:leading-relaxed">
              {description}
            </p>
          ) : null}

          {/* Route-specific helper, link, or search input */}
          {children ? <div className="mt-3.5 sm:mt-4">{children}</div> : null}
        </div>
      </Container>
    </section>
  );
}
