import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, BadgeCheck } from "lucide-react";
import { Container, Eyebrow, Notice, Pill } from "@/components/kit";
import { img, timeline } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";
import { btnClass } from "@/components/kit";

export const Route = createFileRoute("/{-$locale}/airport/past")({
  head: () => ({
    meta: [
      { title: "The past — history and archive of Gaza International Airport" },
      {
        name: "description",
        content:
          "The history of Gaza International Airport told in chapters: construction, the 1998 opening, years of operation, closure, and the record kept since.",
      },
      { property: "og:title", content: "The past — Gaza International Airport" },
      { property: "og:description", content: "Construction, opening, operation, closure and memory." },
    ],
  }),
  component: PastPage,
});

function PastPage() {
  const { t, lang } = useI18n();

  return (
    <>
      <section className="relative isolate overflow-hidden bg-ink text-ink-foreground">
        <img src={img("airport-archive-hall", 1920, 1000)} alt="" className="absolute inset-0 -z-10 size-full object-cover opacity-30" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/80 to-ink/60" />
        <Container className="py-16 sm:py-24">
          <Eyebrow className="text-clay-soft">
            {t("airport.title")} · <span className="numeral">01</span>
          </Eyebrow>
          <h1 className="mt-3 max-w-2xl text-4xl font-bold sm:text-6xl">{t("airport.past")}</h1>
          <p className="mt-4 max-w-xl text-base text-ink-muted">{t("home.pastSub")}</p>
        </Container>
      </section>

      <Container className="py-10">
        <Notice title={t("airport.placeholder")}>{t("airport.placeholderNote")}</Notice>

        <ol className="mt-10 space-y-10 border-s border-border ps-6 sm:ps-10">
          {timeline.map((entry) => (
            <li key={entry.id} className="relative">
              <span
                aria-hidden="true"
                className="absolute -start-[1.85rem] top-1.5 size-3 rounded-full bg-primary sm:-start-[2.85rem]"
              />
              <p className="code-id text-sm font-semibold text-clay">{entry.year}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold">{pick(lang, entry.title)}</h2>
                {entry.verified ? (
                  <Pill tone="brand">
                    <BadgeCheck aria-hidden="true" className="size-3.5" />
                    {pick(lang, { en: "Verified", ar: "موثّق" })}
                  </Pill>
                ) : (
                  <Pill tone="clay">
                    <AlertCircle aria-hidden="true" className="size-3.5" />
                    {pick(lang, { en: "Placeholder", ar: "مؤقت" })}
                  </Pill>
                )}
              </div>
              <div className="mt-4 grid gap-5 sm:grid-cols-[1.3fr_1fr] sm:items-start">
                <p className="text-base leading-relaxed text-muted-foreground">{pick(lang, entry.body)}</p>
                <figure>
                  <img
                    src={img(entry.imageSeed, 800, 560)}
                    alt=""
                    loading="lazy"
                    className="aspect-4/3 w-full rounded-xl border border-border object-cover"
                  />
                  <figcaption className="mt-2 text-xs text-muted-foreground">{t("airport.placeholderNote")}</figcaption>
                </figure>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-12 surface p-5">
          <h2 className="text-lg font-bold">{t("airport.sources")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {pick(lang, {
              en: "Each chapter will carry its own source list: archive references, document scans, photograph credits, interview dates and transcripts. Nothing here is presented as verified until a source is attached.",
              ar: "سيحمل كل فصل قائمة مصادره: مراجع الأرشيف ونسخ الوثائق وحقوق الصور وتواريخ المقابلات ونصوصها. لا شيء هنا يُعرض كموثّق قبل إسناد مصدره.",
            })}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <AppLink to="/gallery" className={btnClass("primary", "md")}>
              {t("home.openArchive")}
            </AppLink>
            <AppLink to="/airport/present" className={btnClass("outline", "md")}>
              {t("airport.present")}
            </AppLink>
          </div>
        </div>
      </Container>
    </>
  );
}
