import type { AirportPastContent } from '../types.ts';

export const publishedAirportPast: AirportPastContent = {
  id: "airport.past",
  kind: "airport.past",
  schemaVersion: 1,
  seo: {
    title: {
      en: "The past — history and archive of Gaza International Airport",
      ar: "الماضي — تاريخ وأرشيف مطار غزة الدولي",
    },
    description: {
      en: "The history of Gaza International Airport documented across its planning, 1998 inauguration, commercial operating years, closure, and enduring civic memory.",
      ar: "تاريخ مطار غزة الدولي موثقاً عبر مراحل التخطيط، والافتتاح عام 1998، وسنوات التشغيل التجاري، والإغلاق، والذاكرة المدنية الباقية.",
    },
  },
  intro: {
    title: {
      en: "Past",
      ar: "الماضي",
    },
    description: {
      en: "The history of Gaza International Airport documented across its planning, inauguration, commercial operational years, and enduring civic memory.",
      ar: "تاريخ مطار غزة الدولي موثقاً عبر مراحل التخطيط، والافتتاح، وسنوات التشغيل التجاري، والذاكرة المدنية الباقية.",
    },
    notice: {
      en: "This historical chapter is grounded in verified diplomatic treaties, contemporary press archives, and official civil aviation records. Photographic and multimedia intake materials remain staged and held under active provenance and rights review.",
      ar: "يستند هذا الفصل التاريخي إلى معاهدات دبلوماسية موثقة وأرشيفات صحفية معاصرة وقرارات طيران مدني رسمية. وتظل المواد المرئية والمستلمة قيد المراجعة والتحقق الأرشيفي وحقوق النشر.",
    },
  },
  timeline: [
    {
      id: "planning",
      visible: true,
      period: "1994–1997",
      title: {
        en: "Planning and construction",
        ar: "التخطيط والإنشاء",
      },
      body: {
        en: "Gaza International Airport was planned under the 1995 Oslo II Interim Agreement (Annex I, Article XIII), establishing Palestinian civil aviation jurisdiction in the Rafah area. Infrastructure masterplanning and runway design specifications (3,080 m × 45 m) were prepared by Saleh & Hegab Engineering Consultants for the Palestinian Civil Aviation Authority, with construction and equipment supported by international loans and donor assistance.",
        ar: "خُطط لمطار غزة الدولي في إطار اتفاق أوسلو 2 المرحلي لعام 1995 (الملحق الأول، المادة 13)، التي حددت الاختصاص المدني لسلطة الطيران المدني الفلسطيني في منطقة رفح. وأعدت شركة صالح وحجاب للاستشارات الهندسية المخطط العام والمواصفات التصميمية للمدرج (3,080 متراً × 45 متراً) لصالح سلطة الطيران المدني الفلسطيني، ودُعمت أعمال الإنشاء والتجهيز بقروض ومساهمات تمويلية دولية.",
      },
      evidence: "verified",
      sourceRefs: ["src-oslo-ii-1995", "src-saleh-hegab-airport", "src-worldbank-2007"],
    },
    {
      id: "opening",
      visible: true,
      period: "1998",
      title: {
        en: "Airport opening and state dedication",
        ar: "افتتاح المطار والتدشين الرسمي",
      },
      body: {
        en: "Gaza International Airport was officially opened on November 24, 1998, as inaugural aircraft arrived carrying Palestinian leadership and delegations to the new airfield, documented by contemporary news reports. Scheduled commercial passenger service commenced shortly thereafter in early December 1998. On December 14, 1998, U.S. President Bill Clinton and Chairman Yasser Arafat attended the official state ribbon-cutting ceremony and terminal dedication.",
        ar: "افتُتح مطار غزة الدولي رسمياً في 24 تشرين الثاني/نوفمبر 1998، مع وصول أولى الطائرات التي أقلت القيادة الفلسطينية والوفود إلى المطار الجديد، وفق ما وثقته التغطيات الإخبارية المعاصرة. وبدأت الرحلات التجارية المجدولة للمسافرين بعد ذلك بوقت قصير في أوائل كانون الأول/ديسمبر 1998. وفي 14 كانون الأول/ديسمبر 1998، شارك الرئيس الأمريكي بيل كلينتون والرئيس ياسر عرفات في مراسم قص الشريط والتدشين الرسمي للمبنى.",
      },
      evidence: "verified",
      sourceRefs: ["src-ap-1998-opening", "src-ap-1998-clinton", "src-video-ap-1998-opening", "src-video-clinton-1998"],
    },
    {
      id: "operations",
      visible: true,
      period: "1998–2000",
      title: {
        en: "Years of commercial flight operations",
        ar: "سنوات التشغيل التجاري",
      },
      body: {
        en: "From late 1998 until operations were halted in autumn 2000 following the outbreak of the Second Intifada, the airport served as the home base for Palestinian Airlines. According to World Bank transport documentation, the passenger terminal was designed for up to 700,000 passengers annually; during 1999, the airfield handled tens of thousands of passengers across regional routes including Amman, Cairo, Jeddah, Dubai, Doha, Istanbul, and Larnaca, alongside operations by international carriers.",
        ar: "من أواخر عام 1998 حتى توقف العمليات في خريف عام 2000 في أعقاب اندلاع الانتفاضة الثانية، عمل المطار كقاعدة رئيسية للخطوط الجوية الفلسطينية. ووفقاً لتقارير البنك الدولي لقطاع النقل، صُمم مبنى المسافرين لاستيعاب ما يصل إلى 700,000 مسافر سنوياً؛ وخلال عام 1999، خدم المطار عشرات آلاف المسافرين عبر وجهات إقليمية شملت عمّان، والقاهرة، وجدة، ودبي، والدوحة، وإسطنبول، ولارنكا، إلى جانب رحلات لشركات طيران دولية أخرى.",
      },
      evidence: "verified",
      sourceRefs: ["src-worldbank-2007"],
    },
    {
      id: "closure",
      visible: true,
      period: "2000–2002",
      title: {
        en: "Airfield closure and infrastructure destruction",
        ar: "إغلاق المطار وتدمير البنية التحتية",
      },
      body: {
        en: "Civil aviation operations ceased after access was closed in autumn 2000. Between late 2001 and early 2002, military strikes and bulldozing heavily damaged the runway, radar installations, and air navigation equipment, rendering the airfield inoperative. On March 13, 2002, the Council of the International Civil Aviation Organization (ICAO) adopted a formal resolution strongly condemning the destruction of Gaza International Airport and its navigational facilities as a violation of international civil aviation principles.",
        ar: "توقفت حركة الطيران المدني بعد إغلاق المطار في خريف عام 2000. وبين أواخر عام 2001 وأوائل عام 2002، ألحقت الضربات العسكرية وأعمال التجريف أضراراً جسيمة بالمدرج ومحطة الرادار والتجهيزات الملاحية، مما أدى إلى خروج المطار عن الخدمة تماماً. وفي 13 آذار/مارس 2002، اعتمد مجلس منظمة الطيران المدني الدولي (ICAO) قراراً رسمياً أدان فيه بشدة تدمير مطار غزة الدولي ومرافقه الملاحية باعتباره انتهاكاً لمبادئ الطيران المدني الدولي.",
      },
      evidence: "verified",
      sourceRefs: ["src-icao-council-2002", "src-worldbank-2007"],
    },
    {
      id: "memory",
      visible: true,
      period: "2002–present",
      title: {
        en: "Civic memory and site documentation",
        ar: "الذاكرة المدنية والتوثيق الميداني",
      },
      body: {
        en: "Following the cessation of flight operations and subsequent destruction, the history of Gaza International Airport has been preserved through civic memory, legal records, and dated documentary imagery. A June 13, 2008 field photograph by Gisha Access records the damaged terminal walls and surviving architectural dome at Rafah, documenting the physical condition of the site years after its destruction.",
        ar: "عقب توقف الرحلات والتدمير اللاحق، استمر حضور مطار غزة الدولي في الذاكرة المدنية والسجلات القانونية والتوثيق الفوتوغرافي المؤرخ. وتوثق صورة ميدانية التقطتها منظمة 'مسلك' (Gisha) في 13 حزيران/يونيو 2008 الجدران المتضررة والقبة المعمارية الباقية لمبنى المسافرين في رفح، مسجلة الحالة المادية للموقع بعد سنوات من خروجه عن الخدمة.",
      },
      evidence: "verified",
      sourceRefs: ["src-gisha-2008"],
    },
  ],
} satisfies AirportPastContent;
