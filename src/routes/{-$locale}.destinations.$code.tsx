import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Clock, Info, Plane } from "lucide-react";
import { DestinationCard } from "@/components/destination-card";
import { FlightSearchForm } from "@/components/flight-search-form";
import { btnClass, Code, Container, EmptyState, Eyebrow, Notice } from "@/components/kit";
import {
  GZA,
  destinationByCode,
  destinations,
  img,
  minutesToLabel,
} from "@/lib/data";
import { money, weekdayName } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/{-$locale}/destinations/$code")({
  head: ({ params }) => {
    const destination = destinationByCode(params.code);
    const city = destination ? destination.city.en : "Destination";
    const title = destination
      ? `${city} (${destination.code}) from Gaza — Palestinian Airlines`
      : "Destination not in the network — GZA";
    const description = destination
      ? `Palestinian Airlines flies from Gaza International Airport to ${city}. Flight time, weekly schedule, fares and booking.`
      : "This destination is not part of the opening Palestinian Airlines network from Gaza.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: DestinationPage,
});

function DestinationPage() {
  const { code } = Route.useParams();
  const { t, lang } = useI18n();
  const destination = destinationByCode(code);

  if (!destination) {
    return (
      <Container className="py-20">
        <EmptyState
          title={t("dest.notFound")}
          description={t("dest.notFoundSub")}
          action={
            <AppLink to="/destinations" className={btnClass("primary", "md")}>
              {t("dest.title")}
            </AppLink>
          }
        />
      </Container>
    );
  }

  const others = destinations.filter((d) => d.code !== destination.code).slice(0, 3);
  const city = pick(lang, destination.city);

  return (
    <>
      <section className="relative isolate overflow-hidden bg-ink text-ink-foreground">
        <img
          src={img(destination.imageSeed, 1920, 1080)}
          alt=""
          className="absolute inset-0 -z-10 size-full object-cover opacity-40"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/70 to-ink/50" />
        <Container className="py-16 sm:py-24">
          <Eyebrow className="text-clay-soft">
            <span className="code-id">GZA</span> → <span className="code-id">{destination.code}</span>
          </Eyebrow>
          <h1 className="mt-3 text-4xl font-bold sm:text-6xl">{city}</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {pick(lang, destination.country)} · {pick(lang, destination.name)}
          </p>
          <dl className="mt-8 grid max-w-2xl grid-cols-2 gap-6 sm:grid-cols-3">
            <div>
              <dt className="eyebrow text-ink-muted">{t("dest.flightTime")}</dt>
              <dd className="numeral mt-1 text-xl font-bold">{minutesToLabel(destination.flightMinutes, lang)}</dd>
            </div>
            <div>
              <dt className="eyebrow text-ink-muted">{t("dest.from")}</dt>
              <dd className="mt-1 text-xl font-bold">{money(destination.priceFrom, lang)}</dd>
            </div>
            <div>
              <dt className="eyebrow text-ink-muted">{t("dest.frequency")}</dt>
              <dd className="numeral mt-1 text-xl font-bold">
                {destination.weeklyFlights}× {pick(lang, { en: "weekly", ar: "أسبوعياً" })}
              </dd>
            </div>
          </dl>
        </Container>
      </section>

      <Container className="-mt-10">
        <FlightSearchForm initial={{ origin: GZA.code, destination: destination.code }} />
      </Container>

      <Container className="mt-14 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <h2 className="text-2xl font-bold">{t("dest.about")}</h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{pick(lang, destination.blurb)}</p>

          <h3 className="mt-10 text-lg font-bold">{t("dest.schedule")}</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {Array.from({ length: 7 }, (_, i) => i).map((day) => {
              const active = destination.days.includes(day);
              return (
                <span
                  key={day}
                  className={cn(
                    "inline-flex min-w-14 justify-center rounded-lg border px-3 py-2 text-sm font-semibold",
                    active
                      ? "border-primary/30 bg-brand-soft text-brand-deep"
                      : "border-border bg-secondary text-muted-foreground/70",
                  )}
                >
                  {weekdayName(day, lang)}
                </span>
              );
            })}
          </div>

          <div className="mt-6">
            <Notice title={t("common.notice")}>
              {pick(lang, {
                en: "Schedules, fares and imagery on this page are placeholders for design purposes.",
                ar: "الجداول والأسعار والصور في هذه الصفحة عناصر مؤقتة لأغراض التصميم.",
              })}
            </Notice>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="surface p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Info aria-hidden="true" className="size-4 text-clay" />
              {t("dest.goodToKnow")}
            </h3>
            <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
              {destination.goodToKnow.map((point, index) => (
                <li key={index} className="flex gap-2">
                  <Clock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-brand-deep" />
                  {pick(lang, point)}
                </li>
              ))}
            </ul>
          </div>
          <div className="surface p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Plane aria-hidden="true" className="size-4 text-brand-deep rtl:-scale-x-100" />
              <Code>PS</Code> {t("brand.airline")}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {pick(lang, {
                en: "Nonstop service operated with Airbus A320-family aircraft.",
                ar: "خدمة مباشرة تُشغَّل بطائرات من عائلة إيرباص A320.",
              })}
            </p>
            <AppLink to="/book" className={btnClass("primary", "md", "mt-4 w-full")}>
              {t("dest.bookTo", { city })}
              <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
            </AppLink>
          </div>
        </aside>
      </Container>

      <Container className="mt-16">
        <h2 className="text-2xl font-bold">{t("dest.other")}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((other) => (
            <DestinationCard key={other.code} destination={other} />
          ))}
        </div>
      </Container>
    </>
  );
}
