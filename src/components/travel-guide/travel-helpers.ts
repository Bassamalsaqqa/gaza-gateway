/**
 * Gaza Gateway — Travel Guide Pure Helper Functions
 *
 * Implements deterministic section normalization, deep-link query/hash resolution,
 * derived read-time estimation, authentic memorial summary facts, and verified FAQs.
 */

import type { TravelGuideSection, TravelPoint } from "@/content/types";
import type { Lang } from "@/lib/locale";

export interface TravelSectionMeta {
  stepNumber: string;
  stageLabel: string;
  readTime: string;
  iconType: "compass" | "file-text" | "ticket" | "building" | "accessibility" | "help-circle";
  summaryPill: string;
  category: "planning" | "verification" | "specifications" | "heritage" | "accessibility" | "general";
}

export interface SummaryFact {
  label: string;
  value: string;
  detail: string;
}

export interface SectionFaq {
  id: string;
  question: string;
  answer: string;
}

export interface TravelActionLink {
  to: string;
  label: string;
  variant: "primary" | "secondary" | "outline" | "ghost" | "clay";
}

/**
 * Normalizes travel sections:
 * - Filters to only visible sections
 * - For each section, filters to only visible points
 * - Preserves immutable array ordering
 */
export function normalizeTravelSections(sections: readonly TravelGuideSection[]): TravelGuideSection[] {
  if (!Array.isArray(sections)) return [];
  return sections
    .filter((sec) => sec && sec.visible)
    .map((sec) => ({
      ...sec,
      points: Array.isArray(sec.points) ? sec.points.filter((pt: TravelPoint) => pt && pt.visible) : [],
    }));
}

/**
 * Resolves active section ID deterministically:
 * 1. Exact match against visible section IDs from query parameter `section`
 * 2. Exact match against visible section IDs from URL `hash` (ignoring leading `#` or `/`)
 * 3. Fallback to the first visible section
 * 4. Empty string if no visible sections exist
 */
export function resolveActiveSection(
  sections: readonly { id: string; visible: boolean }[],
  requestedSection?: string | null,
  hash?: string | null,
): string {
  const visible = sections.filter((s) => s && s.visible);
  if (visible.length === 0) return "";

  if (requestedSection) {
    const cleanReq = requestedSection.trim();
    const match = visible.find((s) => s.id === cleanReq);
    if (match) return match.id;
  }

  if (hash) {
    const cleanHash = hash.replace(/^[#/]+/, "").trim();
    if (cleanHash) {
      const match = visible.find((s) => s.id === cleanHash);
      if (match) return match.id;
    }
  }

  return visible[0]?.id ?? "";
}

/**
 * Derives reading time dynamically from word count.
 */
export function estimateReadTime(text: string, lang: Lang): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 150));
  return lang === "ar" ? `${minutes} دقيقة قراءة` : `${minutes} min read`;
}

/**
 * Provides rich metadata for standard travel guide sections, with safe fallbacks
 * for dynamically added CMS sections.
 */
export function getTravelSectionMeta(
  section: TravelGuideSection,
  lang: Lang,
): TravelSectionMeta {
  const isAr = lang === "ar";
  const allText = `${section.title[lang]} ${section.body[lang]} ${section.points.map((p) => p.text[lang]).join(" ")}`;
  const readTime = estimateReadTime(allText, lang);

  switch (section.id) {
    case "prepare":
      return {
        stepNumber: "01",
        stageLabel: isAr ? "الخطوة 01 · التخطيط والحجز" : "Step 01 · Planning & Booking",
        readTime,
        iconType: "compass",
        summaryPill: isAr ? "حجز ضيف" : "Guest Booking",
        category: "planning",
      };
    case "documents":
      return {
        stepNumber: "02",
        stageLabel: isAr ? "الخطوة 02 · بيانات المسافر" : "Step 02 · Passenger Details",
        readTime,
        iconType: "file-text",
        summaryPill: isAr ? "رمز تحقق بالبريد" : "Email Code Verification",
        category: "verification",
      };
    case "baggage":
      return {
        stepNumber: "03",
        stageLabel: isAr ? "الخطوة 03 · التذكرة ورمز الحجز" : "Step 03 · Ticket & Reference",
        readTime,
        iconType: "ticket",
        summaryPill: isAr ? "تذكرة مجانية" : "Free Ticket",
        category: "specifications",
      };
    case "airport":
      return {
        stepNumber: "04",
        stageLabel: isAr ? "الخطوة 04 · عمارة وتاريخ المطار" : "Step 04 · Architecture & Heritage",
        readTime,
        iconType: "building",
        summaryPill: isAr ? "تاريخ ورؤية مستقبلية" : "History & Future",
        category: "heritage",
      };
    case "accessibility":
      return {
        stepNumber: "05",
        stageLabel: isAr ? "الخطوة 05 · إمكانية الوصول الرقمية" : "Step 05 · Web Accessibility",
        readTime,
        iconType: "accessibility",
        summaryPill: isAr ? "معايير رقمية شاملة" : "Digital Inclusion",
        category: "accessibility",
      };
    default:
      return {
        stepNumber: "•",
        stageLabel: isAr ? "إرشادات عامة" : "General Guidelines",
        readTime,
        iconType: "help-circle",
        summaryPill: isAr ? "إرشادات إضافية" : "Additional Guide",
        category: "general",
      };
  }
}

/**
 * Returns structured summary facts derived from ACTUAL platform features and contracts.
 * Never hardcodes fake operational claims (such as boarding times, live gates,
 * wheelchair escorts, or commercial baggage fees).
 */
export function getSectionSummaryFacts(sectionId: string, lang: Lang): SummaryFact[] {
  const isAr = lang === "ar";

  switch (sectionId) {
    case "prepare":
      return [
        {
          label: isAr ? "نوع الحجز" : "Booking Flow",
          value: isAr ? "حجز ضيف" : "Guest Checkout",
          detail: isAr ? "حجز مباشر بدون الحاجة لحساب" : "No account creation required",
        },
        {
          label: isAr ? "نوع الرحلات" : "Routes",
          value: isAr ? "ذهاب أو عودة" : "One-Way / Return",
          detail: isAr ? "مواعيد رحلات مجدولة" : "Published flight schedule",
        },
        {
          label: isAr ? "استرجاع الحجز" : "Manage Lookup",
          value: isAr ? "رمز + بريد" : "Code + Email",
          detail: isAr ? "الوصول للتذكرة عبر صفحة الإدارة" : "Retrieve ticket via /manage",
        },
      ];
    case "documents":
      return [
        {
          label: isAr ? "البيانات المطلوبة" : "Required Details",
          value: isAr ? "الاسم والبريد" : "Name & Email",
          detail: isAr ? "للضيف: اسم المسافر وبريد موثّق" : "Guest: passenger name & verified email",
        },
        {
          label: isAr ? "بيانات إضافية" : "Additional Details",
          value: isAr ? "اختيارية للضيف" : "Optional for Guests",
          detail: isAr ? "الميلاد والجنسية ورقم الوثيقة اختيارية للضيف" : "Birth date, nationality & document reference are optional for guests",
        },
        {
          label: isAr ? "إدارة الحجز" : "Access Code",
          value: isAr ? "رمز من 6 أرقام" : "6-Digit Code",
          detail: isAr ? "رمز تحقق يُرسل لبريدك الإلكتروني" : "Sent to email for booking management",
        },
      ];
    case "baggage":
      return [
        {
          label: isAr ? "بيانات التذكرة" : "Ticket Details",
          value: isAr ? "المسار والمقعد والرمز" : "Route, Seat & Ref",
          detail: isAr ? "المسافر، التاريخ، الأوقات المحلية، والمقعد" : "Passenger, date, local times & seat",
        },
        {
          label: isAr ? "طباعة التذكرة" : "Ticket Format",
          value: isAr ? "طباعة أو PDF" : "Print or Save PDF",
          detail: isAr ? "حفظ التذكرة عبر المتصفح" : "Save ticket in browser",
        },
        {
          label: isAr ? "تكلفة التذاكر" : "Ticket Cost",
          value: isAr ? "0 دولار (مجاني)" : "$0.00 Free",
          detail: isAr ? "كافة الحجوزات مجانية بالكامل" : "All bookings are free of charge",
        },
      ];
    case "airport":
      return [
        {
          label: isAr ? "التوثيق والتاريخ" : "Heritage & Archive",
          value: isAr ? "سجلات موثقة" : "Documented Records",
          detail: isAr ? "استكشف فصول التاريخ الموثقة بالموقع" : "Explore documented history pages",
        },
        {
          label: isAr ? "التاريخ الموثق" : "Documented History",
          value: isAr ? "الماضي والحاضر" : "Past & Present",
          detail: isAr ? "استكشف فصول التاريخ الموثقة بالموقع" : "Explore documented history pages",
        },
        {
          label: isAr ? "الرؤية المعمارية" : "Future Architecture",
          value: isAr ? "تصاميم مستقبلية" : "Future Concepts",
          detail: isAr ? "مفاهيم معمارية للمستقبل" : "Architectural terminal concepts",
        },
      ];
    case "accessibility":
      return [
        {
          label: isAr ? "لوحة المفاتيح" : "Keyboard Navigation",
          value: isAr ? "دعم كامل" : "Full Support",
          detail: isAr ? "مؤشرات تركيز واضحة" : "Visible focus indicators",
        },
        {
          label: isAr ? "تكبير المتصفح" : "Browser Zoom",
          value: isAr ? "متوافق" : "Compatible",
          detail: isAr ? "تكبير قياسي للنصوص" : "Standard text & layout zoom",
        },
        {
          label: isAr ? "اللغة والتنسيق" : "Language & Layout",
          value: isAr ? "دعم كامل للعربية" : "Bilingual Layout",
          detail: isAr ? "تنسيق متقن للغتين" : "Native Arabic and English layout",
        },
      ];
    default:
      return [];
  }
}

/**
 * Returns truthful, feature-grounded FAQs for progressive disclosure.
 */
export function getSectionFaqs(sectionId: string, lang: Lang): SectionFaq[] {
  const isAr = lang === "ar";

  switch (sectionId) {
    case "prepare":
      return [
        {
          id: "prep-faq-1",
          question: isAr
            ? "هل أحتاج لإنشاء حساب لإتمام الحجز؟"
            : "Do I need to create an account to book a flight?",
          answer: isAr
            ? "لا يتطلب الحجز إنشاء حساب. يمكنك إتمام الحجز كمسافر ضيف بإدخال بيانات المسافرين وعنوان بريدك الإلكتروني."
            : "No account creation is required. You can complete a guest booking by providing passenger details and a contact email address.",
        },
        {
          id: "prep-faq-2",
          question: isAr
            ? "كيف أستلم تذكرتي؟"
            : "How do I receive my ticket?",
          answer: isAr
            ? "يتم إرسال بريد التأكيد لقائمة الإرسال فور إتمام الحجز مع رمز الحجز الخاص بك ورابط لعرض أو طباعة تذكرتك."
            : "A confirmation email is queued upon booking completion with your reference code and link to view or print your ticket.",
        },
      ];
    case "documents":
      return [
        {
          id: "doc-faq-1",
          question: isAr
            ? "هل يتم تدقيق وثائق السفر لدى جهات رسمية؟"
            : "Are travel documents or visas verified with authorities?",
          answer: isAr
            ? "لا يتحقق هذا الموقع من وثائق السفر أو التأشيرات لدى جهات حكومية. رقم الوثيقة اختياري للضيف ويُحفظ فقط إذا أدخله ضمن سجل بيانات المسافر."
            : "This site does not validate travel documents or visas with government authorities. A guest document reference is optional and is stored in the passenger booking record only if supplied.",
        },
        {
          id: "doc-faq-2",
          question: isAr
            ? "كيف تعمل إدارة الحجز للضيوف؟"
            : "How does guest booking verification work?",
          answer: isAr
            ? "عند إدارة حجزك عبر صفحة إدارة الحجز، يتم إرسال رمز تحقق مكون من 6 أرقام إلى بريدك الإلكتروني لتأكيد الوصول."
            : "When managing your reservation, a 6-digit verification code is queued to your contact email to confirm access.",
        },
      ];
    case "baggage":
      return [
        {
          id: "bag-faq-1",
          question: isAr
            ? "ما هي البيانات التي تظهر على التذكرة؟"
            : "What details are displayed on the ticket?",
          answer: isAr
            ? "تُظهر التذكرة اسم المسافر، مسار الرحلة، التاريخ، المواعيد المحلية، المقعد المخصص، ورمز الحجز الخاص بكل رحلة."
            : "The ticket displays passenger names, flight route, date, local departure and arrival times, assigned seat codes, and unique reference codes.",
        },
        {
          id: "bag-faq-2",
          question: isAr
            ? "هل يمكنني طباعة تذكرتي أو إلغاء الحجز؟"
            : "Can I print my ticket or cancel a reservation?",
          answer: isAr
            ? "نعم. يمكنك طباعة تذكرتك أو حفظها بصيغة PDF مباشرة من المتصفح، أو إلغاء رحلتك عبر صفحة إدارة الحجز باستخدام رمز الحجز والبريد."
            : "Yes. You can print or save your ticket as a PDF directly from your browser, or cancel a reservation leg in Manage Booking using your reference and verified email.",
        },
      ];
    case "airport":
      return [
        {
          id: "air-faq-1",
          question: isAr
            ? "أين يمكنني استكشاف تاريخ المطار وتوثيقه؟"
            : "Where can I explore airport history and documentation?",
          answer: isAr
            ? "يمكنكم الاطلاع على السجلات التوثيقية ومراحل المطار عبر قسم تاريخ المطار، بالإضافة إلى استعراض المفاهيم المعمارية المستقبلية."
            : "You can review historical records and timeline chapters on the dedicated Past and Present pages, as well as future terminal concepts.",
        },
        {
          id: "air-faq-2",
          question: isAr
            ? "كيف يمكن استعراض المواعيد والوجهات؟"
            : "How can I view timetables and destinations?",
          answer: isAr
            ? "يمكنكم استعراض شبكة الوجهات ومواعيد الرحلات المتاحة عبر جدول الرحلات وحجز رحلتكم مباشرة."
            : "You can explore destination routes and available flight timetables on the flight board and reserve directly.",
        },
      ];
    case "accessibility":
      return [
        {
          id: "acc-faq-1",
          question: isAr
            ? "ما هي ميزات إمكانية الوصول المتوفرة على الموقع؟"
            : "What accessibility features are available on this site?",
          answer: isAr
            ? "يدعم الموقع التنقل عبر لوحة المفاتيح مع مؤشرات تركيز مرئية، وتكبير المتصفح، وعرض النصوص باللغتين العربية والإنجليزية."
            : "The site supports standard keyboard navigation with visible focus indicators, browser zoom, and clear bilingual presentation.",
        },
        {
          id: "acc-faq-2",
          question: isAr
            ? "كيف يمكن استخدام عناصر التحكم والتكبير؟"
            : "How do keyboard controls and zoom work on the site?",
          answer: isAr
            ? "يمكنك استخدام مفتاح Tab للتنقل بين الروابط والنماذج ومفاتيح الأسهم داخل القوائم، واستخدام ميزة التكبير المدمجة في متصفحك."
            : "You can navigate links and forms using the Tab key, use arrow keys within menus, and resize content using your browser's zoom controls.",
        },
      ];
    default:
      return [];
  }
}

/**
 * Returns meaningful, contextual real actions for each travel guide section.
 */
export function getSectionActions(sectionId: string, lang: Lang): TravelActionLink[] {
  const isAr = lang === "ar";

  switch (sectionId) {
    case "prepare":
      return [
        {
          to: "/flights",
          label: isAr ? "استعراض جدول الرحلات" : "Explore Flight Timetable",
          variant: "primary",
        },
        {
          to: "/book",
          label: isAr ? "حجز رحلة" : "Reserve Seat",
          variant: "outline",
        },
        {
          to: "/manage",
          label: isAr ? "إدارة حجز سابق" : "Manage Existing Booking",
          variant: "ghost",
        },
      ];
    case "documents":
      return [
        {
          to: "/book",
          label: isAr ? "حجز رحلة" : "Book Flight",
          variant: "primary",
        },
        {
          to: "/manage",
          label: isAr ? "التحقق من بيانات الحجز" : "Verify Booking Details",
          variant: "outline",
        },
      ];
    case "baggage":
      return [
        {
          to: "/book",
          label: isAr ? "حجز تذكرة مجانية" : "Book Free Ticket",
          variant: "primary",
        },
        {
          to: "/manage",
          label: isAr ? "استعراض التذكرة وإدارتها" : "View & Manage Ticket",
          variant: "outline",
        },
      ];
    case "airport":
      return [
        {
          to: "/airport/past",
          label: isAr ? "استكشاف تاريخ المبنى" : "Explore Airport History",
          variant: "primary",
        },
        {
          to: "/flights",
          label: isAr ? "جدول الرحلات" : "Flight Board",
          variant: "outline",
        },
      ];
    case "accessibility":
      return [
        {
          to: "/book",
          label: isAr ? "حجز رحلة" : "Book Flight",
          variant: "primary",
        },
        {
          to: "/contact",
          label: isAr ? "التواصل معنا" : "Contact Us",
          variant: "outline",
        },
      ];
    default:
      return [
        {
          to: "/flights",
          label: isAr ? "استعراض الرحلات" : "Explore Flights",
          variant: "primary",
        },
      ];
  }
}
