import { Link, createFileRoute } from "@tanstack/react-router";
import { btnClass, Container, Eyebrow, Notice, Panel } from "@/components/kit";
import { img } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/{-$locale}/airport/present")({
  head: () => ({
    meta: [
      { title: "The present — Gaza International Airport today" },
      {
        name: "description",
        content:
          "A factual account of the present-day state of Gaza International Airport: the site, its structures, and what is documented versus pending verification.",
      },
      { property: "og:title", content: "The present — Gaza International Airport" },
      { property: "og:description", content: "The site today, documented carefully and without embellishment." },
    ],
  }),
  component: PresentPage,
});

function PresentPage() {
  const { t, lang } = useI18n();

  const facts = [
    {
      label: { en: "Site", ar: "الموقع" },
      value: { en: "Southern Gaza Strip, near Rafah", ar: "جنوب قطاع غزة، قرب رفح" },
    },
    { label: { en: "IATA code", ar: "رمز إياتا" }, value: { en: "GZA", ar: "GZA" } },
    { label: { en: "Opened", ar: "الافتتاح" }, value: { en: "1998", ar: "1998" } },
    {
      label: { en: "Current status", ar: "الحالة الحالية" },
      value: { en: "Not operating — pending documentation", ar: "غير عامل — قيد التوثيق" },
    },
  ];

  return (
    <>
      <section className="bg-secondary">
        <Container className="py-14 sm:py-20">
          <Eyebrow>
            {t("airport.title")} · <span className="numeral">02</span>
          </Eyebrow>
          <h1 className="mt-3 max-w-2xl text-4xl font-bold sm:text-5xl">{t("airport.present")}</h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">{t("home.presentSub")}</p>
        </Container>
      </section>

      <Container className="py-10">
        <Notice title={t("common.notice")}>
          {pick(lang, {
            en: "This chapter is deliberately factual. No generic photography is shown here as documentary evidence; images will be added only when their source and date are known.",
            ar: "هذا الفصل واقعي بشكل مقصود. لا تُعرض صور عامة كأدلة توثيقية؛ ستُضاف الصور فقط عند معرفة مصدرها وتاريخها.",
          })}
        </Notice>

        <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label.en} className="surface p-4">
              <dt className="eyebrow text-muted-foreground">{pick(lang, fact.label)}</dt>
              <dd className="mt-1.5 text-base font-semibold">{pick(lang, fact.value)}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-5">
            <Panel>
              <h2 className="text-xl font-bold">{pick(lang, { en: "The site", ar: "الموقع" })}</h2>
              <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                {pick(lang, {
                  en: "Placeholder text. A description of the terminal, runway, apron and surrounding land as they stand today will be written from surveys, satellite imagery with dates, and on-the-ground reporting.",
                  ar: "نص مؤقت. سيُكتب وصف المبنى والمدرج والساحة والأراضي المحيطة كما هي اليوم اعتماداً على المسوحات وصور الأقمار الصناعية المؤرخة والتقارير الميدانية.",
                })}
              </p>
            </Panel>
            <Panel>
              <h2 className="text-xl font-bold">{pick(lang, { en: "What is documented", ar: "ما هو موثّق" })}</h2>
              <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                {pick(lang, {
                  en: "Placeholder text. Verified records — reports, surveys, dated imagery and official statements — will be listed here with references so readers can judge the evidence themselves.",
                  ar: "نص مؤقت. ستُدرج هنا السجلات الموثّقة — التقارير والمسوحات والصور المؤرخة والبيانات الرسمية — مع مراجعها ليتمكن القارئ من تقييم الأدلة.",
                })}
              </p>
            </Panel>
          </div>

          <aside className="surface overflow-hidden p-0">
            <img
              src={img("map-outline-neutral", 800, 600)}
              alt=""
              loading="lazy"
              className="aspect-4/3 w-full object-cover opacity-70"
            />
            <div className="p-5">
              <p className="text-sm text-muted-foreground">
                {pick(lang, {
                  en: "Placeholder graphic. A dated site map will replace it.",
                  ar: "رسم مؤقت. ستحل مكانه خريطة موقع مؤرخة.",
                })}
              </p>
              <Link to="/airport/future" className={btnClass("primary", "md", "mt-4 w-full")}>
                {t("airport.future")}
              </Link>
            </div>
          </aside>
        </div>
      </Container>
    </>
  );
}
