import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { Container, Notice, PageHeader, Panel } from "@/components/kit";
import type { Bilingual } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/{-$locale}/terms")({
  head: () => ({
    meta: [
      { title: "Terms of use — Gaza International Airport (GZA)" },
      {
        name: "description",
        content:
          "The terms that apply to using this Gaza International Airport and Palestinian Airlines prototype website, including flight information and demo bookings.",
      },
      { property: "og:title", content: "Terms of use — Gaza International Airport" },
      { property: "og:description", content: "The terms that apply to using this prototype website." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

type Section = { heading: Bilingual; body: Bilingual[] };

const sections: Section[] = [
  {
    heading: { en: "Scope", ar: "نطاق الاستخدام" },
    body: [
      {
        en: "These terms cover your use of this website, which is a design prototype of the Gaza International Airport and Palestinian Airlines passenger experience. Using the site means you accept that it is a demonstration.",
        ar: "تشمل هذه الشروط استخدامك لهذا الموقع، وهو نموذج تصميمي لتجربة المسافر في مطار غزة الدولي والخطوط الجوية الفلسطينية. استخدامك للموقع يعني إقرارك بأنه عرض تجريبي.",
      },
    ],
  },
  {
    heading: { en: "Flight information", ar: "معلومات الرحلات" },
    body: [
      {
        en: "Schedules, flight numbers, times, aircraft, gates, terminals, statuses, seat availability and fares shown here are generated sample data. They do not describe operating services and must not be used to plan real travel.",
        ar: "الجداول وأرقام الرحلات والأوقات والطائرات والبوابات والمباني والحالات وتوافر المقاعد والأجرات المعروضة هنا بيانات تجريبية مُولَّدة. وهي لا تصف رحلات فعلية ولا يجوز الاعتماد عليها لتخطيط سفر حقيقي.",
      },
    ],
  },
  {
    heading: { en: "Bookings and booking references", ar: "الحجوزات وأرقام الحجز" },
    body: [
      {
        en: "Completing the booking flow produces a sample booking reference stored only in your browser. It is not a ticket, it reserves nothing, and it cannot be presented at an airport or airline counter.",
        ar: "إكمال خطوات الحجز يُنتج رقم حجز تجريبياً يُحفظ في متصفحك فقط. وهو ليس تذكرة ولا يحجز شيئاً ولا يمكن تقديمه في أي مكتب مطار أو شركة طيران.",
      },
      {
        en: "No payment is requested or processed at any step, and no fare, refund or change condition shown here creates an entitlement.",
        ar: "لا يُطلب أي دفع ولا يُعالج في أي خطوة، ولا تنشئ أي شروط أجرة أو استرداد أو تغيير معروضة هنا أي حق أو التزام.",
      },
    ],
  },
  {
    heading: { en: "Accounts", ar: "الحسابات" },
    body: [
      {
        en: "Account creation, sign in and recovery screens are demonstrations. Any details you enter stay on your device and can be removed by clearing your browser data.",
        ar: "شاشات إنشاء الحساب وتسجيل الدخول والاستعادة عرض تجريبي. تبقى أي بيانات تُدخلها على جهازك ويمكن حذفها بمسح بيانات المتصفح.",
      },
    ],
  },
  {
    heading: { en: "Content, imagery and the archive", ar: "المحتوى والصور والأرشيف" },
    body: [
      {
        en: "Historical and present-day sections may use clearly identified placeholders while verified source material is gathered. Future-vision sections may use labeled owner-provided AI-generated concept imagery. Such concept imagery is illustrative only and must not be treated as documentary evidence of the airport's historical or current condition.",
        ar: "قد تستخدم الأقسام التاريخية وأقسام الواقع الحالي عناصر مؤقتة موسومة بوضوح إلى حين جمع مواد موثّقة. وقد تستخدم أقسام الرؤية المستقبلية صوراً مفاهيمية مولّدة بالذكاء الاصطناعي ومقدّمة من مالك المشروع مع وسمها بوضوح. هذه الصور المستقبلية توضيحية فقط ولا تُعدّ دليلاً توثيقياً على الحالة التاريخية أو الحالية للمطار.",
      },
    ],
  },
  {
    heading: { en: "Changes to the site", ar: "التغييرات على الموقع" },
    body: [
      {
        en: "Because this is a prototype under active design, pages, flows and content can change or be removed without notice.",
        ar: "لأن هذا نموذج قيد التطوير، قد تتغير الصفحات والمسارات والمحتوى أو تُحذف دون إشعار.",
      },
    ],
  },
];

function TermsPage() {
  const { t, lang } = useI18n();
  return (
    <>
      <PageHeader eyebrow="GZA" title={t("legal.termsTitle")} description={t("legal.termsSub")} />
      <Container className="py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <Notice title={t("common.notice")}>{t("footer.rights")}</Notice>
          {sections.map((section) => (
            <Panel key={section.heading.en}>
              <h2 className="text-lg font-bold">{pick(lang, section.heading)}</h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
                {section.body.map((paragraph) => (
                  <p key={paragraph.en}>{pick(lang, paragraph)}</p>
                ))}
              </div>
            </Panel>
          ))}
          <p className="text-sm text-muted-foreground">
            {t("legal.contactUs")}{" "}
            <AppLink to="/contact" className="font-semibold text-brand-deep underline">
              {t("nav.contact")}
            </AppLink>{" "}
            ·{" "}
            <AppLink to="/privacy" className="font-semibold text-brand-deep underline">
              {t("legal.privacyTitle")}
            </AppLink>
          </p>
        </div>
      </Container>
    </>
  );
}
