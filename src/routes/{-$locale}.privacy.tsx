import { Link, createFileRoute } from "@tanstack/react-router";
import { Container, Notice, PageHeader, Panel } from "@/components/kit";
import type { Bilingual } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy notice — Gaza International Airport (GZA)" },
      {
        name: "description",
        content:
          "How this Gaza International Airport prototype website handles the details you enter when searching flights, booking or creating an account.",
      },
      { property: "og:title", content: "Privacy notice — Gaza International Airport" },
      { property: "og:description", content: "How this prototype website handles the information you enter." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

type Section = { heading: Bilingual; body: Bilingual[] };

const sections: Section[] = [
  {
    heading: { en: "About this notice", ar: "عن هذا الإشعار" },
    body: [
      {
        en: "This website is a working prototype of the Gaza International Airport and Palestinian Airlines passenger experience. It is published for design review, not as an operating booking service.",
        ar: "هذا الموقع نموذج عملي لتجربة المسافر في مطار غزة الدولي والخطوط الجوية الفلسطينية، منشور لمراجعة التصميم وليس كخدمة حجز فعلية.",
      },
      {
        en: "A final privacy notice will be published, with the airport's legal details, before any real booking service goes live.",
        ar: "سيُنشر إشعار خصوصية نهائي يتضمن البيانات القانونية للمطار قبل تشغيل أي خدمة حجز حقيقية.",
      },
    ],
  },
  {
    heading: { en: "What you enter, and where it stays", ar: "ما تُدخله وأين يبقى" },
    body: [
      {
        en: "Flight searches, passenger details, seat choices, extras, bookings and account details you enter are kept in your own browser's local storage on this device. They are not transmitted to a server, because this prototype has no backend.",
        ar: "تُحفظ عمليات البحث وبيانات المسافرين واختيار المقاعد والإضافات والحجوزات وبيانات الحساب في مساحة التخزين المحلية لمتصفحك على هذا الجهاز، ولا تُرسل إلى أي خادم لأن هذا النموذج بلا خدمة خلفية.",
      },
      {
        en: "Clearing your browser data removes everything you have entered here, including any booking references created during a demo.",
        ar: "حذف بيانات المتصفح يمسح كل ما أدخلته هنا، بما في ذلك أرقام الحجز التي أُنشئت خلال التجربة.",
      },
    ],
  },
  {
    heading: { en: "Sign in and accounts", ar: "تسجيل الدخول والحسابات" },
    body: [
      {
        en: "The sign-in, registration, password reset and email verification screens are demonstrations of the flow. No identity is checked, no email is sent, and no password is stored securely — do not enter a real password you use elsewhere.",
        ar: "شاشات تسجيل الدخول وإنشاء الحساب واستعادة كلمة المرور وتأكيد البريد هي عرض للتجربة فقط. لا يتم التحقق من الهوية ولا إرسال بريد ولا تخزين كلمة المرور بشكل آمن — لا تُدخل كلمة مرور تستخدمها في مواقع أخرى.",
      },
    ],
  },
  {
    heading: { en: "Payments", ar: "المدفوعات" },
    body: [
      {
        en: "No payment is taken anywhere in this prototype, and no card details are requested or handled.",
        ar: "لا يتم تحصيل أي مبالغ في هذا النموذج، ولا يُطلب أي بيانات بطاقة ولا تُعالج.",
      },
    ],
  },
  {
    heading: { en: "Imagery and archive material", ar: "الصور ومواد الأرشيف" },
    body: [
      {
        en: "Photographs shown across the site are generic placeholder imagery used for layout only. They are not authentic Gaza International Airport historical or documentary material, and will be replaced with sourced archive material.",
        ar: "الصور المعروضة في الموقع صور مؤقتة عامة للتخطيط البصري فقط. وهي ليست مواد تاريخية أو وثائقية أصلية لمطار غزة الدولي، وسيتم استبدالها بمواد أرشيفية موثقة.",
      },
    ],
  },
  {
    heading: { en: "Contacting us", ar: "التواصل معنا" },
    body: [
      {
        en: "Questions about this prototype, the archive project or the imagery used can be sent through the contact page.",
        ar: "يمكن إرسال الأسئلة عن هذا النموذج أو مشروع الأرشيف أو الصور المستخدمة من خلال صفحة الاتصال.",
      },
    ],
  },
];

function PrivacyPage() {
  const { t, lang } = useI18n();
  return (
    <>
      <PageHeader eyebrow="GZA" title={t("legal.privacyTitle")} description={t("legal.privacySub")} />
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
            <Link to="/contact" className="font-semibold text-brand-deep underline">
              {t("nav.contact")}
            </Link>{" "}
            ·{" "}
            <Link to="/terms" className="font-semibold text-brand-deep underline">
              {t("legal.termsTitle")}
            </Link>
          </p>
        </div>
      </Container>
    </>
  );
}
