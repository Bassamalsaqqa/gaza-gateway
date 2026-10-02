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
      period: "1998–2001",
      title: {
        en: "Years of commercial flight operations",
        ar: "سنوات التشغيل التجاري",
      },
      body: {
        en: "From late 1998 until regular flight schedules were disrupted in late 2000 and placed under continuous closure in early 2001, the airport served as the operational home base for Palestinian Airlines. According to World Bank transport documentation (Report No. 69315), the passenger terminal was designed for up to 700,000 passengers annually; during 1999, the airfield handled about 60,000 passengers across 1,168 flights on scheduled regional routes including Amman, Cairo, Jeddah, Dubai, Doha, Istanbul, and Larnaca, alongside services by regional airlines.",
        ar: "من أواخر عام 1998 حتى تعطلت جداول الرحلات المنتظمة أواخر عام 2000 وفُرض الإغلاق المستمر أوائل عام 2001، عمل المطار كقاعدة تشغيلية رئيسية للخطوط الجوية الفلسطينية. ووفقاً لتقارير البنك الدولي لقطاع النقل (تقرير رقم 69315)، صُمم مبنى المسافرين لاستيعاب ما يصل إلى 700 ألف مسافر سنوياً؛ وخلال عام 1999، استقبل المطار نحو 60 ألف مسافر في 1,168 رحلة عبر وجهات إقليمية شملت عمّان، والقاهرة، وجدة، ودبي، والدوحة، وإسطنبول، ولارنكا، إلى جانب رحلات لشركات طيران إقليمية.",
      },
      evidence: "verified",
      sourceRefs: ["src-worldbank-2007", "src-unsco-2000", "src-unrwa-2001"],
    },
    {
      id: "closure",
      visible: true,
      period: "2000–2002",
      title: {
        en: "Airfield closures, shutdown, and infrastructure destruction",
        ar: "إغلاقات المطار، والتعطيل المستمر، وتدمير البنية التحتية",
      },
      body: {
        en: "Following the outbreak of the Second Intifada in late September 2000, Israeli authorities closed the airport on October 8, 2000, followed by a brief reopening on October 19, beginning a period of intermittent closures. On February 25, 2001, authorities placed the airfield under continuous closure, as documented by UN reports. In December 2001, military air strikes destroyed the radar installation and control facilities, and in January 2002, military bulldozing tore up the runway, rendering the airfield inoperative. On March 13, 2002, the Council of the International Civil Aviation Organization (ICAO) adopted a formal resolution strongly condemning the destruction of Gaza International Airport and its air navigation facilities.",
        ar: "في أعقاب اندلاع الانتفاضة الثانية في أواخر أيلول/سبتمبر 2000، أغلقت السلطات الإسرائيلية المطار في 8 تشرين الأول/أكتوبر 2000، ثم سمحت بإعادة فتحه لفترة وجيزة في 19 تشرين الأول/أكتوبر لتبدأ مرحلة من الإغلاقات المتقطعة. وفي 25 شباط/فبراير 2001، فرضت السلطات إغلاقاً مستمراً على المطار وفق ما وثقته تقارير الأمم المتحدة. وفي كانون الأول/ديسمبر 2001، دمرت الغارات الجوية العسكرية محطة الرادار ومرافق المراقبة، وفي كانون الثاني/يناير 2002 جرفت الآليات العسكرية المدرج مما جعله خارج الخدمة تماماً. وفي 13 آذار/مارس 2002، اعتمد مجلس منظمة الطيران المدني الدولي (ICAO) قراراً رسمياً أدان فيه بشدة تدمير مطار غزة الدولي ومرافقه الملاحية.",
      },
      evidence: "verified",
      sourceRefs: ["src-unsco-2000", "src-unrwa-2001", "src-icao-council-2002", "src-worldbank-2007"],
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
