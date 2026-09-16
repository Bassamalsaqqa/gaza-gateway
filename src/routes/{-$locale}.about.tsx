import { Link, createFileRoute } from "@tanstack/react-router";
import { btnClass, Code, Container, PageHeader, Panel } from "@/components/kit";
import { AIRLINE, destinations, img } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/about")({
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
              en: "GZA opened in 1998 as the civil airport serving Gaza. This site presents its history, its present-day state and the vision for its future, keeping verified material clearly separated from placeholders.",
              ar: "افتُتح مطار غزة الدولي (GZA) عام 1998 مطاراً مدنياً يخدم غزة. يعرض هذا الموقع تاريخه وحاضره ورؤية مستقبله، مع فصل واضح بين المواد الموثّقة والعناصر المؤقتة.",
            })}
          </p>
          <Link to="/airport" className={btnClass("outline", "md", "mt-5")}>
            {t("airport.title")}
          </Link>
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
          <Link to="/destinations" className={btnClass("outline", "md", "mt-5")}>
            {t("dest.title")}
          </Link>
        </Panel>

        <Panel className="lg:col-span-2">
          <h2 className="text-xl font-bold">{pick(lang, { en: "About the material", ar: "عن المواد المعروضة" })}</h2>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-muted-foreground">
            {pick(lang, {
              en: "Imagery on this site is temporary and generic. Nothing here is presented as authentic Gaza International Airport photography, and historical detail is marked as a placeholder until an archive source is attached. Flight schedules, fares and bookings are demonstration data held in your browser only.",
              ar: "الصور في هذا الموقع مؤقتة وعامة. لا شيء هنا يُعرض كصور أصلية لمطار غزة الدولي، والتفاصيل التاريخية تبقى مؤقتة حتى إسناد مصدر أرشيفي. جداول الرحلات والأسعار والحجوزات بيانات تجريبية محفوظة في متصفحك فقط.",
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
