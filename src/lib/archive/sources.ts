/**
 * Gaza Gateway — Authoritative Sources Registry (HC-1)
 *
 * Ground truth registry of primary treaties, official civil aviation documents,
 * news archives, and verified NGO/documentary records cited across historical
 * dossiers and archive records.
 *
 * All entries represent specific verifiable documents with direct document URLs,
 * avoiding ungrounded homepage links or fabricated citations.
 */

import type { SourceRecord } from "./types.ts";

export const SOURCE_REGISTRY: Record<string, SourceRecord> = {
  "src-oslo-ii-1995": {
    id: "src-oslo-ii-1995",
    title: "Israeli-Palestinian Interim Agreement on the West Bank and the Gaza Strip (Oslo II), Annex I: Protocol Concerning Redeployment and Security Arrangements, Article XIII (Security of the Airspace)",
    titleAr: "الاتفاق الإسرائيلي الفلسطيني المرحلي حول الضفة الغربية وقطاع غزة (أوسلو 2)، الملحق الأول، المادة الثالثة عشرة (أمن المجال الجوي)",
    publisher: "United Nations / Government of Israel and PLO",
    type: "treaty",
    language: "en",
    publicationDate: "1995-09-28",
    url: "https://www.un.org/unispal/document/auto-insert-185434/",
    archivalStatus: "official-repository",
    notes: "Primary diplomatic framework establishing the legal basis, security arrangements, and civil aviation jurisdiction (Article XIII) for Gaza International Airport in the Rafah/Dahanieh area.",
    notesAr: "الإطار الدبلوماسي الأولي الذي حدد الأساس القانوني والترتيبات الأمنية واختصاص الطيران المدني (المادة 13) لمطار غزة الدولي في منطقة رفح/الدهانية.",
  },

  "src-ap-1998-opening": {
    id: "src-ap-1998-opening",
    title: "Palestinians Walking on Air At Opening of Gaza Airport (The New York Times / Deborah Sontag)",
    titleAr: "افتتاح مطار غزة الدولي ووصول أولى الرحلات (نيويورك تايمز / ديبورا سونتاغ)",
    publisher: "The New York Times",
    type: "press",
    language: "en",
    publicationDate: "1998-11-25",
    eventDate: "1998-11-24",
    url: "https://www.nytimes.com/1998/11/25/world/palestinians-walking-on-air-at-opening-of-gaza-airport.html",
    archivalStatus: "live",
    notes: "Contemporary press report documenting the official opening and inaugural aircraft arrivals on November 24, 1998, published in The New York Times on November 25, 1998.",
    notesAr: "تقرير صحفي معاصر يوثق الافتتاح الرسمي للمطار ووصول أولى الطائرات في 24 تشرين الثاني/نوفمبر 1998، نُشر في صحيفة نيويورك تايمز في 25 تشرين الثاني/نوفمبر 1998.",
  },

  "src-ap-1998-clinton": {
    id: "src-ap-1998-clinton",
    title: "Clinton Cuts Ribbon at Gaza Airport (The Washington Post / John M. Goshko)",
    titleAr: "الرئيس كلينتون يشارك في قص شريط افتتاح مطار غزة الدولي (واشنطن بوست)",
    publisher: "The Washington Post",
    type: "press",
    language: "en",
    publicationDate: "1998-12-15",
    eventDate: "1998-12-14",
    url: "https://www.washingtonpost.com/wp-srv/inatl/longterm/mideast/stories/airport121598.htm",
    archivalStatus: "live",
    notes: "Documented official ribbon-cutting ceremony and VIP terminal dedication on December 14, 1998 attended by U.S. President Bill Clinton and Chairman Yasser Arafat, published in The Washington Post on December 15, 1998.",
    notesAr: "توثيق مراسم قص الشريط والتدشين الرسمي لمبنى المسافرين في 14 كانون الأول/ديسمبر 1998 بحضور الرئيس الأمريكي بيل كلينتون والرئيس ياسر عرفات، نُشر في واشنطن بوست في 15 كانون الأول/ديسمبر 1998.",
  },

  "src-icao-council-2002": {
    id: "src-icao-council-2002",
    title: "Destruction of Gaza International Airport — ICAO Council resolution — ICAO press release (13 March 2002)",
    titleAr: "قرار مجلس منظمة الطيران المدني الدولي بشأن تدمير مطار غزة الدولي — بيان صحفي (13 مارس/آذار 2002)",
    publisher: "United Nations / International Civil Aviation Organization (ICAO)",
    type: "official-record",
    language: "en",
    publicationDate: "2002-03-13",
    url: "https://www.un.org/unispal/document/auto-insert-199706/",
    archivalStatus: "official-repository",
    notes: "ICAO Council resolution adopted March 13, 2002 strongly condemning the destruction of Gaza International Airport and its air navigation facilities as a violation of international aviation conventions.",
    notesAr: "قرار مجلس منظمة الطيران المدني الدولي (ICAO) المعتمد في 13 آذار/مارس 2002 والذي أدان بشدة تدمير مطار غزة الدولي ومرافقه الملاحية باعتباره انتهاكاً للمواثيق الدولية للطيران المدني.",
  },

  "src-gisha-2008": {
    id: "src-gisha-2008",
    title: "Gaza AirPort, Gaza — Documentary Photograph of Terminal Ruins (June 13, 2008)",
    titleAr: "مطار غزة، غزة — صورة توثيقية لأطلال المطار (13 يونيو/حزيران 2008)",
    publisher: "Wikimedia Commons / Gisha Access",
    type: "archive",
    language: "en",
    eventDate: "2008-06-13",
    url: "https://commons.wikimedia.org/wiki/File:Gaza_AirPort_,_Gaza_,_2-1-2011_(47).jpg",
    archivalStatus: "live",
    notes: "Licensed CC BY-SA 2.0 Generic documentary photograph recording the destroyed passenger terminal and architectural dome at Gaza International Airport. Captured June 13, 2008.",
    notesAr: "صورة وثائقية مرخصة بموجب ترخيص المشاع الإبداعي CC BY-SA 2.0 تسجل أطلال مبنى المسافرين والقبة المعمارية بمطار غزة الدولي. التُقطت في 13 حزيران/يونيو 2008.",
  },

  "src-saleh-hegab-airport": {
    id: "src-saleh-hegab-airport",
    title: "Gaza International Airport — Project Portfolio (Transit System: Airports & Harbors)",
    titleAr: "مطار غزة الدولي — ملف مشاريع البنية التحتية والمطارات (صالح وحجاب)",
    publisher: "Saleh & Hegab Engineering Consultants",
    type: "archive",
    language: "en",
    url: "https://www.saleh-hegab.com/en/portfolio/transit-system-airports-harbors/",
    archivalStatus: "live",
    notes: "Engineering firm portfolio documenting planning and infrastructure design for Gaza International Airport (Rafah, Client: Palestinian Civil Aviation Authority) with design runway specifications (3,080 m x 45 m).",
    notesAr: "ملف أعمال هندسية يوثق التخطيط والتصميم الإنشائي لمطار غزة الدولي (رفح، الجهة المالكة: سلطة الطيران المدني الفلسطيني) بمواصفات تصميمية للمدرج (3,080 متراً × 45 متراً).",
  },

  "src-worldbank-2007": {
    id: "src-worldbank-2007",
    title: "West Bank and Gaza - Transport sector strategy note (Report No. 69315-GZ)",
    titleAr: "الضفة الغربية وقطاع غزة — مذكرة استراتيجية قطاع النقل (تقرير رقم 69315-GZ)",
    publisher: "World Bank",
    type: "official-record",
    language: "en",
    publicationDate: "2007-10-30",
    url: "https://documents.worldbank.org/en/publication/documents-reports/documentdetail/932271469672170770/693150ESW0P1000ctober030020070Final",
    archivalStatus: "official-repository",
    notes: "Official World Bank sector study. Annex 6 (pp. 86–93) documents Gaza International Airport construction, funding sources, runway specifications (3,080 m), operational capacity (700,000 passengers/year), Palestinian Airlines routes (Amman, Cairo, Jeddah, Dubai, Doha, Istanbul, Larnaca), 1999 passenger volumes (~60,000), and damage assessments.",
    notesAr: "دراسة قطاعية رسمية للبنك الدولي. يوثق الملحق 6 (ص 86-93) إنشاء مطار غزة الدولي ومصادر تمويله ومواصفات المدرج (3080 م) وطاقته الاستيعابية (700 ألف مسافر سنوياً) ووجهات الخطوط الجوية الفلسطينية وحجم المسافرين لعام 1999 وتقييمات الأضرار.",
  },

  "src-video-ap-1998-opening": {
    id: "src-video-ap-1998-opening",
    title: "GAZA: INTERNATIONAL AIRPORT OPENS",
    titleAr: "أسوشيتد برس: افتتاح مطار غزة الدولي",
    publisher: "AP Archive",
    type: "video",
    language: "en",
    publicationDate: "2015-07-21",
    eventDate: "1998-11-24",
    url: "https://www.youtube.com/watch?v=vYodi28td20",
    archivalStatus: "live",
    notes: "Contemporary Associated Press television news footage documenting the official opening of Gaza International Airport and inaugural aircraft arrivals on November 24, 1998.",
    notesAr: "تسجيل إخباري تلفزيوني معاصر لوكالة أسوشيتد برس يوثق الافتتاح الرسمي لمطار غزة الدولي ووصول الطائرات الافتتاحية في 24 تشرين الثاني/نوفمبر 1998.",
  },

  "src-video-clinton-1998": {
    id: "src-video-clinton-1998",
    title: "Pres. Clinton and Chairman Arafat at Gaza Airport (1998) (FOIA 2017-0234-F)",
    titleAr: "مكتبة كلينتون الرئاسية: الرئيس كلينتون والرئيس عرفات في مطار غزة (1998)",
    publisher: "William J. Clinton Presidential Library",
    type: "video",
    language: "en",
    publicationDate: "2017-08-30",
    eventDate: "1998-12-14",
    url: "https://www.youtube.com/watch?v=tBht5QeKHaA",
    archivalStatus: "official-repository",
    notes: "Official White House Communications Agency archival footage of the arrival and ceremony with U.S. President Bill Clinton and Chairman Yasser Arafat at Gaza International Airport on December 14, 1998.",
    notesAr: "تسجيل أرشيفي رسمي لوكالة الاتصالات بالبيت الأبيض يوثق مراسم وصول الرئيس الأمريكي بيل كلينتون ورئيس السلطة الوطنية ياسر عرفات في مطار غزة الدولي في 14 كانون الأول/ديسمبر 1998.",
  },

  "src-video-aljazeera-2009": {
    id: "src-video-aljazeera-2009",
    title: "مطار ياسر عرفات الدولي المدمر",
    titleAr: "الجزيرة: مطار ياسر عرفات الدولي المدمر",
    publisher: "Al Jazeera Arabic",
    type: "video",
    language: "ar",
    publicationDate: "2009-02-13",
    eventDate: "2009-02-13",
    url: "https://www.youtube.com/watch?v=-k3kR5f3nYY",
    archivalStatus: "live",
    notes: "Field report by Abbas Nasser from the ruins of Yasser Arafat International Airport, broadcast February 13, 2009.",
    notesAr: "تقرير ميداني لمراسل قناة الجزيرة عباس ناصر من أطلال مطار ياسر عرفات الدولي، بُث في 13 شباط/فبراير 2009.",
  },

  "src-video-afp-2018": {
    id: "src-video-afp-2018",
    title: "Destroyed Gaza airport symbolises grounded peace hopes",
    titleAr: "فرانس برس: مطار غزة المدمر يجسد آمال السلام المحطمة",
    publisher: "AFP News Agency",
    type: "video",
    language: "en",
    publicationDate: "2018-09-12",
    eventDate: "2018-09",
    url: "https://www.youtube.com/watch?v=gaSe8Pbmm5Q",
    archivalStatus: "live",
    notes: "AFP News Agency retrospective report marking 25 years after Oslo, documenting the destroyed condition of Gaza airport.",
    notesAr: "تقرير استعادي لوكالة فرانس برس بعد 25 عاماً على اتفاقات أوسلو يوثق الحالة المدمرة لمطار غزة.",
  },
};

export function getSourceRecordById(id: string): SourceRecord | undefined {
  return SOURCE_REGISTRY[id];
}

export function getAllSourceRecords(): SourceRecord[] {
  return Object.values(SOURCE_REGISTRY);
}
