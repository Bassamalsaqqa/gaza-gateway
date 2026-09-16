import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Building2, Plane, Sparkles } from "lucide-react";
import { btnClass, Container, Eyebrow, Notice, Panel } from "@/components/kit";
import { destinations, img } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/{-$locale}/airport/future")({
  head: () => ({
    meta: [
      { title: "The future — vision for Gaza International Airport" },
      {
        name: "description",
        content:
          "Concepts for a reopened Gaza International Airport: terminal proposals, masterplan thinking, future passenger experience and a growing route network.",
      },
      { property: "og:title", content: "The future — Gaza International Airport" },
      { property: "og:description", content: "Terminal concepts, masterplan and future passenger experience." },
    ],
  }),
  component: FuturePage,
});

function FuturePage() {
  const { t, lang } = useI18n();

  const themes = [
    {
      icon: Building2,
      title: { en: "Terminal concepts", ar: "تصورات المبنى" },
      body: {
        en: "Placeholder for concept work: terminal massing, daylight strategy, arrivals and departures sequence, and materials rooted in the region.",
        ar: "عنصر مؤقت للأعمال التصورية: كتلة المبنى واستراتيجية الإضاءة الطبيعية وتسلسل القدوم والمغادرة ومواد متجذرة في المكان.",
      },
      seed: "terminal-concept-render",
    },
    {
      icon: Sparkles,
      title: { en: "Passenger experience", ar: "تجربة المسافر" },
      body: {
        en: "Placeholder for future service design: self check-in, calm security flow, family and accessibility provision, and a departures hall built around waiting well.",
        ar: "عنصر مؤقت لتصميم الخدمة المستقبلية: تسجيل ذاتي، تدفق تفتيش هادئ، مرافق للعائلات وذوي الاحتياجات، وصالة مغادرة مبنية حول انتظار مريح.",
      },
      seed: "future-departures-hall",
    },
    {
      icon: Plane,
      title: { en: "Masterplan", ar: "المخطط العام" },
      body: {
        en: "Placeholder for phased masterplan material: runway rehabilitation, apron capacity, cargo, ground access and long-term expansion.",
        ar: "عنصر مؤقت لمواد المخطط العام المرحلي: تأهيل المدرج، سعة الساحة، الشحن، الوصول الأرضي، والتوسع بعيد المدى.",
      },
      seed: "masterplan-diagram",
    },
  ];

  return (
    <>
      <section className="relative isolate overflow-hidden bg-ink text-ink-foreground">
        <img
          src={img("future-airport-vision", 1920, 1000)}
          alt=""
          className="absolute inset-0 -z-10 size-full object-cover opacity-40"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/75 to-ink/50" />
        <Container className="py-16 sm:py-28">
          <Eyebrow className="text-clay-soft">
            {t("airport.title")} · <span className="numeral">03</span>
          </Eyebrow>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold sm:text-6xl">{t("airport.future")}</h1>
          <p className="mt-4 max-w-xl text-base text-ink-muted">{t("home.futureSub")}</p>
        </Container>
      </section>

      <Container className="py-10">
        <Notice title={t("airport.placeholder")}>{t("airport.placeholderNote")}</Notice>

        <div className="mt-8 space-y-6">
          {themes.map((theme, index) => (
            <article
              key={theme.title.en}
              className={`grid gap-5 overflow-hidden rounded-2xl border border-border bg-card sm:grid-cols-2 ${
                index % 2 === 1 ? "sm:[&>figure]:order-last" : ""
              }`}
            >
              <figure className="m-0">
                <img
                  src={img(theme.seed, 900, 700)}
                  alt=""
                  loading="lazy"
                  className="aspect-4/3 size-full object-cover"
                />
              </figure>
              <div className="p-5 sm:p-8">
                <theme.icon aria-hidden="true" className="size-5 text-clay" />
                <h2 className="mt-3 text-2xl font-bold">{pick(lang, theme.title)}</h2>
                <p className="mt-2 text-base leading-relaxed text-muted-foreground">{pick(lang, theme.body)}</p>
              </div>
            </article>
          ))}
        </div>

        <Panel className="mt-10">
          <h2 className="text-xl font-bold">{pick(lang, { en: "Future network", ar: "الشبكة المستقبلية" })}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {pick(lang, {
              en: "The opening network is regional. Longer-term ambitions include European and North African connections, subject to capacity and agreements.",
              ar: "الشبكة الافتتاحية إقليمية. تتضمن الطموحات الأبعد ربطاً أوروبياً وشمال إفريقي، رهناً بالسعة والاتفاقيات.",
            })}
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {destinations.map((destination) => (
              <li key={destination.code}>
                <AppLink
                  to="/destinations/$code"
                  params={{ code: destination.code }}
                  className="inline-flex items-center gap-2 rounded-full border border-input bg-card px-3.5 py-1.5 text-sm font-semibold"
                >
                  <span className="code-id">{destination.code}</span>
                  {pick(lang, destination.city)}
                </AppLink>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-2">
            <AppLink to="/gallery" className={btnClass("primary", "md")}>
              {t("home.openArchive")}
              <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
            </AppLink>
            <AppLink to="/airport/past" className={btnClass("outline", "md")}>
              {t("airport.past")}
            </AppLink>
          </div>
        </Panel>
      </Container>
    </>
  );
}
