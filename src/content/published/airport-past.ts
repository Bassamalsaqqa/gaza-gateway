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
        en: "Gaza International Airport was planned under the 1995 Oslo II Interim Agreement (Annex I, Article XIII), establishing Palestinian civil aviation jurisdiction in the Rafah/Dahanieh area. Infrastructure masterplanning and runway engineering (3,080 m × 45 m) were designed by Saleh & Hegab Engineering Consultants for the Palestinian Civil Aviation Authority with international development assistance.",
        ar: "أُنشئ مطار غزة الدولي في إطار الاتفاق الإسرائيلي الفلسطيني المرحلي لعام 1995 (أوسلو 2، الملحق الأول، المادة 13)، التي حددت الولاية المدنية لسلطة الطيران المدني الفلسطيني في منطقة رفح/الدهانية. ونفذت شركة صالح وحجاب للاستشارات الهندسية المخطط الهندسي للمدرج بطول 3,080 متراً وعرض 45 متراً بتمويل ودعم دولي متعدد الأطراف.",
      },
      evidence: "verified",
      sourceRefs: ["src-oslo-ii-1995", "src-saleh-hegab-airport"],
    },
    {
      id: "opening",
      visible: true,
      period: "1998",
      title: {
        en: "Commercial opening and state dedication",
        ar: "الافتتاح التجاري والتدشين الرسمي",
      },
      body: {
        en: "Commercial passenger flights commenced on November 24, 1998, as inaugural Palestinian Airlines services landed on the new runway, documented by contemporary press reporting. On December 14, 1998, U.S. President Bill Clinton and Chairman Yasser Arafat attended the official state ribbon-cutting ceremony and VIP passenger terminal dedication at the airfield.",
        ar: "انطلقت الرحلات التجارية المدنية الأولى في 24 تشرين الثاني/نوفمبر 1998 بهبوط طائرات الخطوط الجوية الفلسطينية على مدرج المطار الجديد كما وثقته التغطيات الصحفية المعاصرة. وفي 14 كانون الأول/ديسمبر 1998، شارك الرئيس الأمريكي بيل كلينتون والرئيس ياسر عرفات في مراسم قص الشريط والتدشين الرسمي لمبنى المسافرين في المطار.",
      },
      evidence: "verified",
      sourceRefs: ["src-ap-1998-opening", "src-ap-1998-clinton"],
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
        en: "Between 1998 and late 2000, Palestinian Airlines operated scheduled commercial passenger routes from Gaza to regional capitals including Amman, Cairo, Dubai, and Jeddah, alongside seasonal charter flights for Palestinian pilgrims to Mecca, establishing direct civil connectivity for the Gaza Strip.",
        ar: "بين عامي 1998 وأواخر عام 2000، سيّرت الخطوط الجوية الفلسطينية رحلات مدنية منتظمة من مطار غزة إلى عواصم ومدن إقليمية شملت عمّان، والقاهرة، ودبي، وجدة، إضافة إلى رحلات الحج والعمرة الموسمية، مما وفر للمواطنين في قطاع غزة نافذة جوية مباشرة إلى العالم.",
      },
      evidence: "verified",
      sourceRefs: ["src-ap-1998-opening", "src-oslo-ii-1995"],
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
        en: "Civil aviation operations were forcibly halted following the outbreak of the Second Intifada. In December 2001 and January 2002, the radar station and runway were systematically destroyed by bulldozers and airstrikes. On March 13, 2002, the Council of the International Civil Aviation Organization (ICAO) adopted a formal resolution strongly condemning the destruction of the airport and its civil air navigation facilities.",
        ar: "توقفت الملاحة الجوية المدنية في المطار قسراً مع اندلاع الانتفاضة الثانية. وفي كانون الأول/ديسمبر 2001 وكانون الثاني/يناير 2002، دُمّرت محطة الرادار وقُطّع المدرج الرئيسي بالضربات الجوية والتجريف. وفي 13 آذار/مارس 2002، اعتمد مجلس منظمة الطيران المدني الدولي (ICAO) قراراً رسمياً أدان فيه بشدة تدمير المطار ومرافقه الملاحية باعتباره انتهاكاً للمواثيق الدولية.",
      },
      evidence: "verified",
      sourceRefs: ["src-icao-council-2002"],
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
        en: "Since the cessation of flights, the memory of Gaza International Airport has been preserved through civic testimony, international legal archives, and on-site documentary surveys. Photographic evidence, including June 2008 field documentation by Gisha Access, records the surviving passenger terminal dome and physical structural remains at Rafah as enduring testament to Palestinian civil aviation.",
        ar: "منذ توقف الرحلات، بقيت ذاكرة مطار غزة الدولي حاضرة في الشهادات المدنية والأرشيفات القانونية الدولية والمسوحات الميدانية التوثيقية. وتسجل الأدلة الفوتوغرافية، ومنها التوثيق الميداني لمنظمة 'مسلك' (Gisha) في حزيران/يونيو 2008، أطلال قبة مبنى المسافرين كشاهد مادي باقٍ على تاريخ الطيران المدني الفلسطيني.",
      },
      evidence: "verified",
      sourceRefs: ["src-gisha-2008", "src-icao-council-2002"],
    },
  ],
} satisfies AirportPastContent;
