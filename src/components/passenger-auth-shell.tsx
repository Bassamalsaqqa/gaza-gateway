import type { ReactNode } from "react";
import { Plane } from "lucide-react";
import { Container } from "@/components/kit";
import { ResponsiveImage } from "@/components/responsive-image";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface PassengerAuthShellProps {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  mediaPanel?: "signin" | boolean;
}

export function PassengerAuthShell({
  title,
  description,
  children,
  footer,
  mediaPanel,
}: PassengerAuthShellProps) {
  const { t, lang } = useI18n();
  const isSignInMedia = mediaPanel === "signin" || mediaPanel === true;

  return (
    <Container className="py-10 sm:py-14">
      <section className="mx-auto grid max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-lift)] lg:grid-cols-[0.85fr_1.15fr]">
        {isSignInMedia ? (
          /* Sign-in Photo Panel: desktop two-column, compact mobile photo band */
          <div
            data-auth-media="signin"
            className="relative flex h-36 flex-col justify-between overflow-hidden bg-ink p-5 text-white sm:h-44 sm:p-7 lg:h-auto lg:min-h-[34rem] lg:p-8"
          >
            {/* Background photographic asset — strictly NEVER mirrored */}
            <ResponsiveImage
              entry="signin-photo"
              sizes="(min-width: 1024px) 45vw, 100vw"
              loading="eager"
              fetchPriority="high"
              className="pointer-events-none absolute inset-0 size-full select-none object-cover"
              style={{ objectPosition: "50% 50%" }}
            />

            {/* Directional gradient veil for high contrast */}
            <div className="pointer-events-none absolute inset-0 bg-ink/40" aria-hidden="true" />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/95 via-ink/40 to-ink/65"
              aria-hidden="true"
            />

            {/* Top section: brand cue — illustrative badge removed from passenger-visible surface */}
            <div className="relative z-10">
              <div className="mt-4 hidden lg:block">
                <span className="grid size-11 place-items-center rounded-full border border-white/20 bg-white/10 backdrop-blur-xs">
                  <Plane aria-hidden="true" className="size-5 text-white" />
                </span>
                <p
                  className={
                    lang === "ar"
                      ? "mt-5 text-xs font-semibold text-white/70"
                      : "mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-white/70"
                  }
                >
                  {t("brand.airport")}
                </p>
                <p className="mt-1.5 max-w-xs text-xl font-bold leading-snug text-white">
                  {t("auth.secureAccess")}
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Default decorative brand panel (fallback for other auth routes) */
          <div className="relative overflow-hidden bg-ink px-6 py-8 text-white sm:px-8 lg:flex lg:min-h-[34rem] lg:flex-col lg:justify-between">
            <div
              className="absolute inset-inline-end-[-4rem] top-[-4rem] size-48 rounded-full border border-white/10"
              aria-hidden="true"
            />
            <div className="relative">
              <span className="grid size-11 place-items-center rounded-full border border-white/20 bg-white/5">
                <Plane aria-hidden="true" className="size-5" />
              </span>
              <p
                className={
                  lang === "ar"
                    ? "mt-6 text-xs font-semibold text-white/60"
                    : "mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-white/60"
                }
              >
                {t("brand.airport")}
              </p>
              <p className="mt-2 max-w-xs text-xl font-bold leading-snug">{t("auth.secureAccess")}</p>
            </div>
            <p className="relative mt-8 text-xs leading-relaxed text-white/55">{t("auth.demoNote")}</p>
          </div>
        )}

        {/* Form panel */}
        <div className="px-5 py-7 sm:px-8 sm:py-9">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
          <div className="mt-6">{children}</div>
          {isSignInMedia ? (
            <p
              data-auth-disclosure="signin"
              className="mt-4 text-xs leading-relaxed text-muted-foreground"
            >
              {t("auth.demoNote")}
            </p>
          ) : null}
          {footer ? <div className="mt-5 border-t border-border pt-5">{footer}</div> : null}
        </div>
      </section>
    </Container>
  );
}
