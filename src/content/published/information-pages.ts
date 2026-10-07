import { en, ar } from "../../lib/i18n-public.ts";
import { privacySections, termsSections, aboutCopy } from "./information-sections.ts";
import type { InformationalPagesContent, InformationalPageBlock, LocalizedText } from "../types.ts";

const label = (key: string): LocalizedText => ({ en: en[key]!, ar: ar[key]! });
function legalBlocks(prefix: string, sections: { heading: LocalizedText; body: LocalizedText[] }[]): InformationalPageBlock[] {
  return sections.map((section, index) => ({
    id: `${prefix}-section-${index + 1}`, visible: true,
    title: structuredClone(section.heading), paragraphs: structuredClone(section.body),
  }));
}

export const publishedInformationPages: InformationalPagesContent = {
  id: "pages.information", kind: "pages.information", schemaVersion: 1,
  seo: {
    title: { en: "Information — Gaza International Airport", ar: "معلومات — مطار غزة الدولي" },
    description: { en: "About this prototype, contact, privacy and terms of use.", ar: "عن النموذج التجريبي والتواصل والخصوصية وشروط الاستخدام." },
  },
  pages: [
    {
      id: "about", title: label("about.title"), description: structuredClone(aboutCopy[0]!),
      seo: {
        title: { en: "About — Gaza International Airport and Palestinian Airlines", ar: "عن المطار — مطار غزة الدولي والخطوط الجوية الفلسطينية" },
        socialTitle: { en: "About Gaza International Airport", ar: "عن مطار غزة الدولي" },
        socialDescription: { en: "The airport, the airline, and how this site treats its sources.", ar: "المطار وشركة الطيران وكيفية التعامل مع مصادر الموقع." },
        description: { en: "About this project: Gaza International Airport (GZA), the Palestinian Airlines (PS) passenger experience, and how the archive material is handled.", ar: "عن المشروع: مطار غزة الدولي وتجربة المسافر في الخطوط الجوية الفلسطينية وكيفية التعامل مع مواد الأرشيف." },
      },
      blocks: [
        { id: "about-airport", visible: true, title: label("brand.airport"), paragraphs: [structuredClone(aboutCopy[1]!)] },
        { id: "about-material", visible: true, title: structuredClone(aboutCopy[3]!), paragraphs: [structuredClone(aboutCopy[4]!)] },
      ],
    },
    {
      id: "contact", title: label("contact.title"), description: label("contact.sub"),
      seo: {
        title: { en: "Contact — Gaza International Airport (GZA)", ar: "اتصل بنا — مطار غزة الدولي (GZA)" },
        socialTitle: { en: "Contact Gaza International Airport", ar: "التواصل مع مطار غزة الدولي" },
        socialDescription: { en: "Passenger, media and archive enquiries.", ar: "استفسارات المسافرين والإعلام والأرشيف." },
        description: { en: "Contact Gaza International Airport and Palestinian Airlines: passenger enquiries, media and archive contributions, plus phone and email details.", ar: "التواصل مع مطار غزة الدولي والخطوط الجوية الفلسطينية: استفسارات المسافرين والمساهمات الإعلامية والأرشيفية." },
      },
      // Telephone, inbox topics, email and address remain Settings/Contact authority.
      blocks: [],
    },
    {
      id: "privacy", title: label("legal.privacyTitle"), description: label("legal.privacySub"),
      seo: {
        title: { en: "Privacy notice — Gaza International Airport (GZA)", ar: "إشعار الخصوصية — مطار غزة الدولي (GZA)" },
        socialTitle: { en: "Privacy notice — Gaza International Airport", ar: "إشعار الخصوصية — مطار غزة الدولي" },
        socialDescription: { en: "How this prototype website handles the information you enter.", ar: "كيفية التعامل مع المعلومات المُدخلة في الموقع التجريبي." },
        description: { en: "How this Gaza International Airport prototype website handles the details you enter when searching flights, booking or creating an account.", ar: "كيف يتعامل موقع مطار غزة الدولي التجريبي مع البيانات المُدخلة عند البحث والحجز وإنشاء الحساب." },
      },
      blocks: legalBlocks("privacy", privacySections),
    },
    {
      id: "terms", title: label("legal.termsTitle"), description: label("legal.termsSub"),
      seo: {
        title: { en: "Terms of use — Gaza International Airport (GZA)", ar: "شروط الاستخدام — مطار غزة الدولي (GZA)" },
        socialTitle: { en: "Terms of use — Gaza International Airport", ar: "شروط الاستخدام — مطار غزة الدولي" },
        socialDescription: { en: "The terms that apply to using this prototype website.", ar: "الشروط المنطبقة على استخدام هذا الموقع التجريبي." },
        description: { en: "The terms that apply to using this Gaza International Airport and Palestinian Airlines prototype website, including flight information and demo bookings.", ar: "شروط استخدام الموقع التجريبي لمطار غزة الدولي والخطوط الجوية الفلسطينية، بما في ذلك معلومات الرحلات والحجوزات التجريبية." },
      },
      blocks: legalBlocks("terms", termsSections),
    },
  ],
};
