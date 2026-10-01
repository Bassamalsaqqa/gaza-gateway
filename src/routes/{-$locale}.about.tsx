import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { btnClass, Code, Container, PageHeader, Panel } from "@/components/kit";
import { AIRLINE, destinations, img } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/{-$locale}/about")({
  head: () => ({
    meta: [
      { title: "About — Gaza International Airport and Palestinian Airlines" },
      {
        name: "description",
        content:
          "About this project: Gaza International Airport (GZA), the Palestinian Airlines (PS) passenger experience, and how the archive material is handled.",
      },
      { property: "og:title", content: "About Gaza International Airport" },
      { property: "og:description", content: "The airport, the airline, and how this site treats its sources." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const { t, lang } = useI18n();

  return (
    <>
      <PageHeader
        eyebrow={t("nav.about")}
        title={t("about.title")}
        description={pick(lang, {
          en: "Gaza International Airport and its home carrier, presented as one place: a working travel service and a record of the airport itself.",
          ar: "مطار غزة الدولي وناقله الوطني في مكان واحد: خدمة سفر عاملة وسجل للمطار نفسه.",
        })}
      />

      <Container className="grid gap-6 py-10 lg:grid-cols-2">
        <Panel>
          <h2 className="text-xl font-bold">{t("brand.airport")}</h2>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            {pick(lang, {
              en: "GZA opened in 1998 as the civil airport serving Gaza. This site presents its history, its present-day state, and the vision for its future, keeping verified documentary material clearly separated from illustrative concepts and unverified intake.",
              ar: "افتُتح مطار غزة الدولي عام 1998 بصفته المطار المدني الذي يخدم غزة. يقدم هذا الموقع تاريخه، وواقعه الراهن، ورؤية مستقبله، مع الفصل الواضح بين المواد الوثائقية المعتمدة والتصورات التوضيحية والمواد قيد التحقق الأرشيفي.",
            })}
          </p>
          <AppLink to="/airport" className={btnClass("outline", "md", "mt-5")}>
            {t("airport.title")}
          </AppLink>
        </Panel>

        <Panel>
          <h2 className="text-xl font-bold">
            {pick(lang, AIRLINE.name)} <Code className="text-sm text-muted-foreground">{AIRLINE.code}</Code>
          </h2>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            {pick(lang, {
              en: "Palestinian Airlines is the home carrier at GZA. The opening network links Gaza with seven regional gateways, flown by Airbus A320-family aircraft.",
              ar: "الخطوط الجوية الفلسطينية هي الناقل الوطني في مطار غزة الدولي. تربط الشبكة الافتتاحية غزة بسبع بوابات إقليمية بطائرات من عائلة إيرباص A320.",
            })}
          </p>
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {destinations.map((destination) => (
              <li key={destination.code} className="code-id rounded-md bg-secondary px-2 py-1 text-xs font-semibold">
                {destination.code}
              </li>
            ))}
          </ul>
          <AppLink to="/destinations" className={btnClass("outline", "md", "mt-5")}>
            {t("dest.title")}
          </AppLink>
        </Panel>

        <Panel className="lg:col-span-2">
          <h2 className="text-xl font-bold">{pick(lang, { en: "About the material", ar: "عن المواد المعروضة" })}</h2>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-muted-foreground">
            {pick(lang, {
              en: "Imagery on this site is classified by purpose and evidentiary role: future-vision sections present owner-provided architectural visualizations labeled as illustrative; historical and present-day sections present verified documentary photography where cleared, while remaining intake records are held under rights and provenance review. Flight schedules, fares and bookings remain demonstration data held in your browser only.",
              ar: "تُصنَّف المواد المرئية في هذا الموقع بحسب الغرض والدور التوثيقي: تقدم أقسام رؤية المستقبل تصورات معمارية مقدمة من المالك وموسومة بأنها توضيحية؛ بينما تقدم الأقسام التاريخية والراهنة صوراً توثيقية معتمدة حيثما تم إثبات حقوقها ومصادرها، مع إبقاء المواد الإضافية المستلمة قيد المراجعة والتحقق الأرشيفي. وتبقى جداول الرحلات والأسعار والحجوزات بيانات توضيحية محفوظة في متصفحك فقط.",
            })}
          </p>
          <img
            src={img("archive-desk-documents", 1400, 500)}
            alt=""
            loading="lazy"
            className="mt-6 aspect-21/9 w-full rounded-xl object-cover"
          />
        </Panel>
      </Container>
    </>
  );
}
