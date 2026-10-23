import { en, ar } from "../../lib/i18n-public.ts";
import { privacySections, termsSections, aboutSections, aboutCopy } from "./information-sections.ts";
import type { InformationalPagesContent, InformationalPageBlock, LocalizedText } from "../types.ts";

const label = (key: string): LocalizedText => ({ en: en[key]!, ar: ar[key]! });

function legalBlocks(prefix: string, sections: { heading: LocalizedText; body: LocalizedText[] }[]): InformationalPageBlock[] {
  return sections.map((section, index) => ({
    id: `${prefix}-section-${index + 1}`, visible: true,
    title: structuredClone(section.heading), paragraphs: structuredClone(section.body),
  }));
}

function aboutPageBlocks(sections: { id: string; heading: LocalizedText; body: LocalizedText[] }[]): InformationalPageBlock[] {
  return sections.map((section) => ({
    id: section.id,
    visible: true,
    title: structuredClone(section.heading),
    paragraphs: structuredClone(section.body),
  }));
}

export const publishedInformationPages: InformationalPagesContent = {
  id: "pages.information", kind: "pages.information", schemaVersion: 1,
  seo: {
    title: { en: "Information — Gaza International Airport (GZA) — Remade", ar: "معلومات — مطار غزة الدولي (GZA) — إعادة صياغة" },
    description: { en: "About this art project, contact, privacy notice and terms of use.", ar: "عن هذا المشروع الفني والتواصل وإشعار الخصوصية وشروط الاستخدام." },
  },
  pages: [
    {
      id: "about",
      title: { en: "Gaza International Airport (GZA) — Remade", ar: "مطار غزة الدولي (GZA) — إعادة صياغة" },
      description: { en: "An internet-based art project by Ayman Alazraq", ar: "مشروع فني على الإنترنت لأيمن الأزرق" },
      seo: {
        title: { en: "About — Gaza International Airport (GZA) — Remade", ar: "عن المشروع — مطار غزة الدولي (GZA) — إعادة صياغة" },
        socialTitle: { en: "Gaza International Airport (GZA) — Remade", ar: "مطار غزة الدولي (GZA) — إعادة صياغة" },
        socialDescription: { en: "An internet-based art project by Ayman Alazraq: history, memory, and the claim to freedom of movement.", ar: "مشروع فني على الإنترنت لأيمن الأزرق: التاريخ، والذاكرة، والمطالبة بحرية الحركة." },
        description: { en: "About Gaza International Airport (GZA) — Remade: an internet-based art project by Ayman Alazraq exploring Palestinian memory, freedom of movement, and the history of Gaza's airport.", ar: "عن مشروع مطار غزة الدولي (GZA) — إعادة صياغة: مشروع فني على الإنترنت لأيمن الأزرق يبحث في الذاكرة الفلسطينية وحرية الحركة وتاريخ مطار غزة." },
      },
      blocks: aboutPageBlocks(aboutSections),
    },
    {
      id: "contact", title: label("contact.title"), description: label("contact.sub"),
      seo: {
        title: { en: "Contact — Gaza International Airport (GZA)", ar: "اتصل بنا — مطار غزة الدولي (GZA)" },
        socialTitle: { en: "Contact Gaza International Airport", ar: "التواصل مع مطار غزة الدولي" },
        socialDescription: { en: "General, media, and archive enquiries for the art project.", ar: "استفسارات عامة ومشاركات إعلامية وأرشيفية للمشروع الفني." },
        description: { en: "Contact Gaza International Airport (GZA) — Remade: general enquiries, media, and archive contributions.", ar: "التواصل مع مشروع مطار غزة الدولي (GZA) — إعادة صياغة: استفسارات عامة ومشاركات إعلامية وأرشيفية." },
      },
      // Telephone, inbox topics, email and address remain Settings/Contact authority.
      blocks: [],
    },
    {
      id: "privacy", title: label("legal.privacyTitle"), description: label("legal.privacySub"),
      seo: {
        title: { en: "Privacy notice — Gaza International Airport (GZA)", ar: "إشعار الخصوصية — مطار غزة الدولي (GZA)" },
        socialTitle: { en: "Privacy notice — Gaza International Airport", ar: "إشعار الخصوصية — مطار غزة الدولي" },
        socialDescription: { en: "How this website handles commemorative bookings, accounts, and private archive submissions.", ar: "كيف يتعامل هذا الموقع مع الحجوزات التذكارية والحسابات ومشاركات الأرشيف الخاصة." },
        description: { en: "Privacy notice for Gaza International Airport (GZA) — Remade: details on installed backend commemorative bookings, email OTP, private archive submissions, and opt-in first-party analytics.", ar: "إشعار الخصوصية لمشروع مطار غزة الدولي — إعادة صياغة: تفاصيل الحجوزات التذكارية على الخادم، ورموز التحقق بالبريد، ومشاركات الأرشيف الخاصة، والتحليلات الاختيارية." },
      },
      blocks: legalBlocks("privacy", privacySections),
    },
    {
      id: "terms", title: label("legal.termsTitle"), description: label("legal.termsSub"),
      seo: {
        title: { en: "Terms of use — Gaza International Airport (GZA)", ar: "شروط الاستخدام — مطار غزة الدولي (GZA)" },
        socialTitle: { en: "Terms of use — Gaza International Airport", ar: "شروط الاستخدام — مطار غزة الدولي" },
        socialDescription: { en: "Terms of use for this art project and commemorative passenger experience.", ar: "شروط استخدام هذا المشروع الفني وتجربة المسافر التذكارية." },
        description: { en: "Terms of use for Gaza International Airport (GZA) — Remade: conditions governing commemorative bookings, artistic flight concepts, archive submissions, and no commercial carriage.", ar: "شروط استخدام مشروع مطار غزة الدولي — إعادة صياغة: الشروط الحاكمة للحجوزات التذكارية ومفاهيم الطيران الفنية ومشاركات الأرشيف وعدم وجود نقل تجاري." },
      },
      blocks: legalBlocks("terms", termsSections),
    },
  ],
};
