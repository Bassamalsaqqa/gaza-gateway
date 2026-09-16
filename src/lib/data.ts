/**
 * Frontend mock data for Gaza International Airport (GZA) and
 * Palestinian Airlines (PS). No backend, no external APIs.
 * Imagery uses generic placeholder photography that is easy to swap later:
 * every image URL is produced by `img()` below.
 */

export type Bilingual = { en: string; ar: string };

export type Airport = {
  code: string;
  city: Bilingual;
  country: Bilingual;
  name: Bilingual;
  tz: string;
};

export type Destination = Airport & {
  flightMinutes: number;
  priceFrom: number;
  weeklyFlights: number;
  days: number[]; // 0 = Sunday
  imageSeed: string;
  blurb: Bilingual;
  goodToKnow: Bilingual[];
};

export type FlightStatus =
  | "Scheduled"
  | "OnTime"
  | "Boarding"
  | "Delayed"
  | "Departed"
  | "Landed"
  | "Cancelled";

export type Flight = {
  id: string;
  number: string;
  originCode: string;
  destinationCode: string;
  date: string; // yyyy-mm-dd
  departTime: string; // HH:mm local
  arriveTime: string;
  durationMinutes: number;
  aircraft: string;
  status: FlightStatus;
  gate: string;
  terminal: string;
  basePrice: number;
  seatsLeft: number;
};

export type Fare = {
  id: "essential" | "classic" | "flex";
  name: Bilingual;
  multiplier: number;
  checkedBags: number;
  seatSelection: Bilingual;
  changes: Bilingual;
  refund: Bilingual;
  flexibility: Bilingual;
  highlight?: boolean;
};

export const AIRLINE = { code: "PS", name: { en: "Palestinian Airlines", ar: "الخطوط الجوية الفلسطينية" } };

export const GZA: Airport = {
  code: "GZA",
  city: { en: "Gaza", ar: "غزة" },
  country: { en: "Palestine", ar: "فلسطين" },
  name: { en: "Gaza International Airport", ar: "مطار غزة الدولي" },
  tz: "Asia/Gaza",
};

/** Placeholder imagery helper — replace this single function to swap image sources. */
export function img(seed: string, w = 1200, h = 800): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
}

export const destinations: Destination[] = [
  {
    code: "AMM",
    city: { en: "Amman", ar: "عمّان" },
    country: { en: "Jordan", ar: "الأردن" },
    name: { en: "Queen Alia International", ar: "مطار الملكة علياء الدولي" },
    tz: "Asia/Amman",
    flightMinutes: 55,
    priceFrom: 129,
    weeklyFlights: 14,
    days: [0, 1, 2, 3, 4, 5, 6],
    imageSeed: "amman-city-hills",
    blurb: {
      en: "The closest gateway to Gaza and the busiest link in the opening network — a short hop across the Jordan Valley to a capital of stone terraces, downtown souks and the road to Petra.",
      ar: "أقرب بوابة إلى غزة وأكثر خطوط شبكة الافتتاح حركة — رحلة قصيرة عبر وادي الأردن إلى عاصمة المدرجات الحجرية وأسواق وسط البلد وطريق البتراء.",
    },
    goodToKnow: [
      { en: "Two daily rotations, morning and evening.", ar: "رحلتان يومياً، صباحاً ومساءً." },
      { en: "Shortest sector in the network at under an hour.", ar: "أقصر خط في الشبكة بأقل من ساعة." },
    ],
  },
  {
    code: "CAI",
    city: { en: "Cairo", ar: "القاهرة" },
    country: { en: "Egypt", ar: "مصر" },
    name: { en: "Cairo International", ar: "مطار القاهرة الدولي" },
    tz: "Africa/Cairo",
    flightMinutes: 75,
    priceFrom: 139,
    weeklyFlights: 12,
    days: [0, 1, 2, 3, 4, 6],
    imageSeed: "cairo-nile-evening",
    blurb: {
      en: "A dense, layered capital on the Nile and the historic transfer point for travellers from Gaza heading onward across Africa and the Gulf.",
      ar: "عاصمة مزدحمة متعددة الطبقات على النيل، ونقطة العبور التاريخية للمسافرين من غزة إلى أفريقيا والخليج.",
    },
    goodToKnow: [
      { en: "Wide onward connections from Terminal 3.", ar: "شبكة اتصال واسعة من المبنى الثالث." },
      { en: "Allow extra time for transfer formalities.", ar: "خصّص وقتاً إضافياً لإجراءات العبور." },
    ],
  },
  {
    code: "IST",
    city: { en: "Istanbul", ar: "إسطنبول" },
    country: { en: "Türkiye", ar: "تركيا" },
    name: { en: "Istanbul Airport", ar: "مطار إسطنبول" },
    tz: "Europe/Istanbul",
    flightMinutes: 140,
    priceFrom: 189,
    weeklyFlights: 7,
    days: [1, 3, 5, 6],
    imageSeed: "istanbul-bosphorus-morning",
    blurb: {
      en: "Two continents, one city. Istanbul is the network's main long-haul feeder, with connections to Europe, Central Asia and North America.",
      ar: "قارتان في مدينة واحدة. إسطنبول هي المغذّي الرئيسي للرحلات الطويلة، بربط نحو أوروبا وآسيا الوسطى وأمريكا الشمالية.",
    },
    goodToKnow: [
      { en: "Evening departures suit onward connections.", ar: "المغادرات المسائية تناسب الرحلات المتصلة." },
      { en: "Longest sector in the opening network.", ar: "أطول خط في شبكة الافتتاح." },
    ],
  },
  {
    code: "DOH",
    city: { en: "Doha", ar: "الدوحة" },
    country: { en: "Qatar", ar: "قطر" },
    name: { en: "Hamad International", ar: "مطار حمد الدولي" },
    tz: "Asia/Qatar",
    flightMinutes: 175,
    priceFrom: 229,
    weeklyFlights: 5,
    days: [0, 2, 4, 6],
    imageSeed: "doha-skyline-dusk",
    blurb: {
      en: "A Gulf hub built around transfer traffic, with a corniche skyline and one of the region's most comfortable terminals for long connections.",
      ar: "محطة خليجية مبنية حول حركة العبور، بأفق كورنيش ومبنى من الأكثر راحة في المنطقة للرحلات المتصلة.",
    },
    goodToKnow: [
      { en: "Convenient for onward Asia-Pacific routes.", ar: "مناسبة للرحلات إلى آسيا والمحيط الهادئ." },
      { en: "Overnight arrivals on selected days.", ar: "وصول ليلي في أيام محددة." },
    ],
  },
  {
    code: "DXB",
    city: { en: "Dubai", ar: "دبي" },
    country: { en: "United Arab Emirates", ar: "الإمارات العربية المتحدة" },
    name: { en: "Dubai International", ar: "مطار دبي الدولي" },
    tz: "Asia/Dubai",
    flightMinutes: 195,
    priceFrom: 249,
    weeklyFlights: 5,
    days: [1, 3, 5],
    imageSeed: "dubai-marina-night",
    blurb: {
      en: "The Gulf's commercial centre and a major destination for Palestinian families and businesses working across the region.",
      ar: "المركز التجاري للخليج ومحطة رئيسية للعائلات والأعمال الفلسطينية في المنطقة.",
    },
    goodToKnow: [
      { en: "Late-evening departures from GZA.", ar: "مغادرات في وقت متأخر من المساء من غزة." },
      { en: "Check visa requirements before travel.", ar: "تحقّق من متطلبات التأشيرة قبل السفر." },
    ],
  },
  {
    code: "JED",
    city: { en: "Jeddah", ar: "جدة" },
    country: { en: "Saudi Arabia", ar: "السعودية" },
    name: { en: "King Abdulaziz International", ar: "مطار الملك عبدالعزيز الدولي" },
    tz: "Asia/Riyadh",
    flightMinutes: 165,
    priceFrom: 219,
    weeklyFlights: 4,
    days: [0, 2, 5],
    imageSeed: "jeddah-corniche-red-sea",
    blurb: {
      en: "The Red Sea gateway and the route most used for Umrah and Hajj travel, with a restored historic Al-Balad quarter worth the stopover.",
      ar: "بوابة البحر الأحمر والخط الأكثر استخداماً لسفر العمرة والحج، مع حيّ البلد التاريخي الذي يستحق التوقف.",
    },
    goodToKnow: [
      { en: "Pilgrimage season schedules are extended.", ar: "تُعزّز الجداول في موسم الحج والعمرة." },
      { en: "Additional baggage allowance on request.", ar: "وزن إضافي متاح بناءً على الطلب." },
    ],
  },
  {
    code: "RUH",
    city: { en: "Riyadh", ar: "الرياض" },
    country: { en: "Saudi Arabia", ar: "السعودية" },
    name: { en: "King Khalid International", ar: "مطار الملك خالد الدولي" },
    tz: "Asia/Riyadh",
    flightMinutes: 190,
    priceFrom: 239,
    weeklyFlights: 3,
    days: [2, 4, 6],
    imageSeed: "riyadh-desert-skyline",
    blurb: {
      en: "A fast-changing inland capital, and the network's main business route into the central Gulf.",
      ar: "عاصمة داخلية سريعة التحول، والخط الرئيسي لرحلات الأعمال إلى وسط الخليج.",
    },
    goodToKnow: [
      { en: "Three weekly rotations at launch.", ar: "ثلاث رحلات أسبوعياً عند الإطلاق." },
      { en: "Business cabin available on all flights.", ar: "درجة الأعمال متاحة على جميع الرحلات." },
    ],
  },
];

export const destinationByCode = (code: string): Destination | undefined =>
  destinations.find((d) => d.code.toLowerCase() === code.toLowerCase());

export const airportByCode = (code: string): Airport | undefined =>
  code.toUpperCase() === "GZA" ? GZA : destinationByCode(code);

export const fares: Fare[] = [
  {
    id: "essential",
    name: { en: "Essential", ar: "الأساسية" },
    multiplier: 1,
    checkedBags: 0,
    seatSelection: { en: "Paid seat selection", ar: "اختيار مقعد مدفوع" },
    changes: { en: "Changes for a fee + fare difference", ar: "تغيير برسوم + فرق الأجرة" },
    refund: { en: "Non-refundable", ar: "غير قابلة للاسترداد" },
    flexibility: { en: "Lowest fare, fewest options", ar: "أقل سعر وأقل مرونة" },
  },
  {
    id: "classic",
    name: { en: "Classic", ar: "الكلاسيكية" },
    multiplier: 1.35,
    checkedBags: 1,
    seatSelection: { en: "Free standard seat", ar: "مقعد عادي مجاناً" },
    changes: { en: "One free change + fare difference", ar: "تغيير واحد مجاناً + فرق الأجرة" },
    refund: { en: "Refundable with a fee", ar: "قابلة للاسترداد برسوم" },
    flexibility: { en: "The balanced choice for most trips", ar: "الخيار المتوازن لأكثر الرحلات" },
    highlight: true,
  },
  {
    id: "flex",
    name: { en: "Flex", ar: "المرنة" },
    multiplier: 1.85,
    checkedBags: 2,
    seatSelection: { en: "Free seat, including extra legroom", ar: "مقعد مجاني يشمل مساحة الأرجل الأوسع" },
    changes: { en: "Unlimited free changes", ar: "تغييرات مجانية غير محدودة" },
    refund: { en: "Fully refundable", ar: "قابلة للاسترداد كاملاً" },
    flexibility: { en: "Full flexibility and priority boarding", ar: "مرونة كاملة وصعود بأولوية" },
  },
];

export const cabins = [
  { id: "economy", multiplier: 1, label: "cabin.economy" },
  { id: "premium", multiplier: 1.6, label: "cabin.premium" },
  { id: "business", multiplier: 2.6, label: "cabin.business" },
] as const;

export type CabinId = (typeof cabins)[number]["id"];

export const cabinMultiplier = (cabin: string): number =>
  cabins.find((c) => c.id === cabin)?.multiplier ?? 1;

/* ---------------------------------- utils --------------------------------- */

export function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function minutesToLabel(minutes: number, lang: "en" | "ar"): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (lang === "ar") return `${h} س ${m ? `${m} د` : ""}`.trim();
  return `${h}h ${m ? `${m}m` : ""}`.trim();
}

function addMinutesToTime(time: string, minutes: number): string {
  const [hh, mm] = time.split(":");
  const total = Number(hh ?? 0) * 60 + Number(mm ?? 0) + minutes;
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${`${Math.floor(wrapped / 60)}`.padStart(2, "0")}:${`${wrapped % 60}`.padStart(2, "0")}`;
}

const departureSlots = ["07:15", "10:40", "13:05", "16:20", "19:45", "22:10"];
const aircraftTypes = ["Airbus A320neo", "Airbus A321neo", "Boeing 737-800"];

function statusFor(flightId: string, date: string): FlightStatus {
  const today = todayISO();
  if (date > today) return "Scheduled";
  const h = hash(flightId);
  if (date < today) return h % 11 === 0 ? "Cancelled" : "Landed";
  const pool: FlightStatus[] = [
    "OnTime",
    "OnTime",
    "Boarding",
    "Delayed",
    "Departed",
    "Scheduled",
    "OnTime",
    "Landed",
    "Cancelled",
  ];
  return pool[h % pool.length] ?? "Scheduled";
}

/** Departures from GZA on a date. */
export function departuresOn(date: string): Flight[] {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const list: Flight[] = [];
  destinations.forEach((dest, index) => {
    if (!dest.days.includes(weekday)) return;
    const seed = hash(`${dest.code}${date}`);
    const slot = departureSlots[(index + weekday) % departureSlots.length] ?? "09:00";
    const number = `PS${100 + index * 2 + (weekday % 2)}`;
    const id = `${number}-${date}-out`;
    list.push({
      id,
      number,
      originCode: GZA.code,
      destinationCode: dest.code,
      date,
      departTime: slot,
      arriveTime: addMinutesToTime(slot, dest.flightMinutes),
      durationMinutes: dest.flightMinutes,
      aircraft: aircraftTypes[seed % aircraftTypes.length] ?? "Airbus A320neo",
      status: statusFor(id, date),
      gate: `A${(seed % 8) + 1}`,
      terminal: "1",
      basePrice: dest.priceFrom + (seed % 6) * 12,
      seatsLeft: 3 + (seed % 24),
    });
  });
  return list.sort((a, b) => a.departTime.localeCompare(b.departTime));
}

/** Arrivals into GZA on a date. */
export function arrivalsOn(date: string): Flight[] {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const list: Flight[] = [];
  destinations.forEach((dest, index) => {
    if (!dest.days.includes(weekday)) return;
    const seed = hash(`${dest.code}${date}in`);
    const slot = departureSlots[(index + weekday + 3) % departureSlots.length] ?? "12:00";
    const number = `PS${101 + index * 2 + (weekday % 2)}`;
    const id = `${number}-${date}-in`;
    list.push({
      id,
      number,
      originCode: dest.code,
      destinationCode: GZA.code,
      date,
      departTime: slot,
      arriveTime: addMinutesToTime(slot, dest.flightMinutes),
      durationMinutes: dest.flightMinutes,
      aircraft: aircraftTypes[seed % aircraftTypes.length] ?? "Airbus A321neo",
      status: statusFor(id, date),
      gate: `A${(seed % 8) + 1}`,
      terminal: "1",
      basePrice: dest.priceFrom + (seed % 5) * 14,
      seatsLeft: 4 + (seed % 20),
    });
  });
  return list.sort((a, b) => a.arriveTime.localeCompare(b.arriveTime));
}

/** Bookable options for a route on a date (2 options per available route). */
export function searchFlights(origin: string, destination: string, date: string): Flight[] {
  const outbound = origin.toUpperCase() === GZA.code;
  const pool = outbound ? departuresOn(date) : arrivalsOn(date);
  const matches = pool.filter((f) =>
    outbound
      ? f.destinationCode.toUpperCase() === destination.toUpperCase()
      : f.originCode.toUpperCase() === origin.toUpperCase(),
  );
  if (matches.length === 0) return [];
  const base = matches[0];
  if (!base) return [];
  const second: Flight = {
    ...base,
    id: `${base.id}-b`,
    number: `PS${Number(base.number.slice(2)) + 40}`,
    departTime: addMinutesToTime(base.departTime, 320),
    arriveTime: addMinutesToTime(base.arriveTime, 320),
    basePrice: Math.round(base.basePrice * 0.88),
    gate: `A${((hash(base.id) % 8) + 2) % 9 || 3}`,
    seatsLeft: 2 + (hash(base.id) % 9),
  };
  return [base, second];
}

export function farePrice(basePrice: number, fareId: Fare["id"], cabin: string): number {
  const fare = fares.find((f) => f.id === fareId) ?? fares[0];
  return Math.round(basePrice * (fare?.multiplier ?? 1) * cabinMultiplier(cabin));
}

/* --------------------------------- seatmap -------------------------------- */

export const SEAT_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
export const SEAT_ROWS = 28;
export const EXTRA_LEGROOM_ROWS = [1, 12, 13];

export function isSeatAvailable(flightId: string, row: number, letter: string): boolean {
  return hash(`${flightId}:${row}${letter}`) % 100 > 32;
}

export function seatFee(row: number): number {
  return EXTRA_LEGROOM_ROWS.includes(row) ? 18 : 0;
}

/* ---------------------------------- extras -------------------------------- */

export const mealOptions: { id: string; label: Bilingual }[] = [
  { id: "standard", label: { en: "Standard meal", ar: "وجبة عادية" } },
  { id: "vegetarian", label: { en: "Vegetarian", ar: "نباتية" } },
  { id: "diabetic", label: { en: "Diabetic", ar: "لمرضى السكري" } },
  { id: "child", label: { en: "Child meal", ar: "وجبة أطفال" } },
];

export const assistanceOptions: { id: string; label: Bilingual }[] = [
  { id: "wheelchair", label: { en: "Wheelchair assistance", ar: "مساعدة بكرسي متحرك" } },
  { id: "visual", label: { en: "Visual impairment support", ar: "دعم لذوي الإعاقة البصرية" } },
  { id: "hearing", label: { en: "Hearing impairment support", ar: "دعم لذوي الإعاقة السمعية" } },
  { id: "minor", label: { en: "Travelling with an infant", ar: "السفر مع رضيع" } },
];

export const EXTRA_BAG_PRICE = 35;

/* --------------------------- airport storytelling ------------------------- */

export type TimelineEntry = {
  id: string;
  year: string;
  title: Bilingual;
  body: Bilingual;
  imageSeed: string;
  verified: boolean;
};

export const timeline: TimelineEntry[] = [
  {
    id: "planning",
    year: "1994–1997",
    title: { en: "Planning and construction", ar: "التخطيط والإنشاء" },
    body: {
      en: "Placeholder chapter. The construction period, funding partners, design team and engineering decisions will be documented here from verified archive sources.",
      ar: "فصل مؤقت. ستُوثّق هنا فترة الإنشاء والجهات الممولة وفريق التصميم والقرارات الهندسية من مصادر أرشيفية موثّقة.",
    },
    imageSeed: "construction-site-archive",
    verified: false,
  },
  {
    id: "opening",
    year: "1998",
    title: { en: "The airport opens", ar: "افتتاح المطار" },
    body: {
      en: "Gaza International Airport opened as a civil airport serving Gaza in November 1998. Detailed accounts of the opening day, the first flights and the people present are pending archive verification.",
      ar: "افتُتح مطار غزة الدولي مطاراً مدنياً يخدم غزة في تشرين الثاني/نوفمبر 1998. تفاصيل يوم الافتتاح والرحلات الأولى والحاضرين قيد التوثيق الأرشيفي.",
    },
    imageSeed: "opening-ceremony-archive",
    verified: true,
  },
  {
    id: "operations",
    year: "1998–2001",
    title: { en: "Years of operation", ar: "سنوات التشغيل" },
    body: {
      en: "Placeholder chapter for the operating period: route network, passenger numbers, staff, daily life in the terminal, tickets and boarding documents.",
      ar: "فصل مؤقت لفترة التشغيل: شبكة الخطوط وأعداد المسافرين والعاملين والحياة اليومية في المبنى والتذاكر ووثائق السفر.",
    },
    imageSeed: "terminal-departures-archive",
    verified: false,
  },
  {
    id: "closure",
    year: "2001–2002",
    title: { en: "Closure and damage", ar: "الإغلاق والأضرار" },
    body: {
      en: "Placeholder chapter. The closure of the airport and the destruction of its runway and terminal facilities will be presented with sourced documentation and dated imagery.",
      ar: "فصل مؤقت. سيُعرض إغلاق المطار وتدمير مدرجه ومرافقه بوثائق موثّقة وصور مؤرخة.",
    },
    imageSeed: "damaged-runway-archive",
    verified: false,
  },
  {
    id: "memory",
    year: "2002–today",
    title: { en: "Memory and record", ar: "الذاكرة والتوثيق" },
    body: {
      en: "Placeholder chapter for oral histories: staff, pilots, passengers and neighbours of the airport, collected as interviews and transcripts.",
      ar: "فصل مؤقت للتاريخ الشفوي: العاملون والطيارون والمسافرون وسكان جوار المطار، عبر مقابلات ونصوص مكتوبة.",
    },
    imageSeed: "oral-history-archive",
    verified: false,
  },
];

export type GalleryItem = {
  id: string;
  title: Bilingual;
  category: "photograph" | "document" | "architecture" | "concept";
  era: "past" | "present" | "future";
  imageSeed: string;
  caption: Bilingual;
  credit: Bilingual;
  date: string;
};

const galleryCategories: GalleryItem["category"][] = ["photograph", "document", "architecture", "concept"];
const galleryEras: GalleryItem["era"][] = ["past", "present", "future"];

export const galleryCategoryLabels: Record<GalleryItem["category"], Bilingual> = {
  photograph: { en: "Photographs", ar: "صور" },
  document: { en: "Documents", ar: "وثائق" },
  architecture: { en: "Architecture", ar: "معمار" },
  concept: { en: "Concepts", ar: "تصورات" },
};

export const galleryEraLabels: Record<GalleryItem["era"], Bilingual> = {
  past: { en: "Past", ar: "الماضي" },
  present: { en: "Present", ar: "الحاضر" },
  future: { en: "Future", ar: "المستقبل" },
};

export const galleryItems: GalleryItem[] = Array.from({ length: 24 }, (_, i) => {
  const category = galleryCategories[i % galleryCategories.length] ?? "photograph";
  const era = galleryEras[Math.floor(i / 8) % galleryEras.length] ?? "past";
  const n = i + 1;
  return {
    id: `item-${n}`,
    title: {
      en: `Archive placeholder ${n}`,
      ar: `عنصر أرشيفي مؤقت ${n}`,
    },
    category,
    era,
    imageSeed: `gza-archive-${n}`,
    caption: {
      en: "Placeholder image standing in for archive material. Not a photograph of Gaza International Airport.",
      ar: "صورة مؤقتة بديلة عن مادة أرشيفية. ليست صورة لمطار غزة الدولي.",
    },
    credit: { en: "Awaiting archive credit", ar: "بانتظار بيانات المصدر" },
    date: era === "future" ? "—" : "Undated",
  } satisfies GalleryItem;
});

export type InfoSection = {
  id: string;
  title: Bilingual;
  body: Bilingual;
  points: Bilingual[];
};

export const travelSections: InfoSection[] = [
  {
    id: "prepare",
    title: { en: "Preparing to travel", ar: "التحضير للسفر" },
    body: {
      en: "Check-in opens 24 hours before departure and closes 60 minutes before scheduled departure for all Palestinian Airlines flights.",
      ar: "يبدأ تسجيل الوصول قبل 24 ساعة من المغادرة ويُغلق 60 دقيقة قبل الموعد المقرر لجميع رحلات الخطوط الجوية الفلسطينية.",
    },
    points: [
      { en: "Arrive at the terminal 2 hours before departure.", ar: "الوصول إلى المبنى قبل ساعتين من المغادرة." },
      { en: "Keep your booking reference available.", ar: "احتفظ برقم الحجز في متناول يدك." },
      { en: "Confirm document validity for your destination.", ar: "تأكد من صلاحية وثائقك لمحطة وصولك." },
    ],
  },
  {
    id: "documents",
    title: { en: "Travel documents", ar: "وثائق السفر" },
    body: {
      en: "Passengers are responsible for holding valid travel documents and any permits or visas required by the destination and transit countries.",
      ar: "يتحمّل المسافر مسؤولية حمل وثائق سفر صالحة وأي تصاريح أو تأشيرات تطلبها دولة الوصول أو العبور.",
    },
    points: [
      { en: "Passport valid for at least six months.", ar: "جواز سفر صالح ستة أشهر على الأقل." },
      { en: "Names must match the booking exactly.", ar: "يجب تطابق الأسماء مع الحجز تماماً." },
      { en: "Travelling with children requires additional documents.", ar: "السفر مع الأطفال يتطلب وثائق إضافية." },
    ],
  },
  {
    id: "baggage",
    title: { en: "Baggage", ar: "الأمتعة" },
    body: {
      en: "Every fare includes one cabin bag up to 7 kg. Checked allowance depends on the fare you choose, and extra bags can be added during booking or in Manage booking.",
      ar: "تشمل كل أجرة حقيبة كابينة حتى 7 كغ. يعتمد الوزن المسجّل على الأجرة المختارة، ويمكن إضافة حقائب أثناء الحجز أو من إدارة الحجز.",
    },
    points: [
      { en: "Cabin bag: 7 kg, 55 × 40 × 20 cm.", ar: "حقيبة الكابينة: 7 كغ، 55 × 40 × 20 سم." },
      { en: "Checked bag: 23 kg per piece.", ar: "الحقيبة المسجّلة: 23 كغ للقطعة." },
      { en: "Extra bag from $35 when added online.", ar: "حقيبة إضافية من 35 دولاراً عند الإضافة إلكترونياً." },
    ],
  },
  {
    id: "airport",
    title: { en: "At the airport", ar: "في المطار" },
    body: {
      en: "The passenger journey through the terminal — check-in, security, passport control, gates and boarding — is described here and will be updated with the operating terminal layout.",
      ar: "تُوصف هنا رحلة المسافر داخل المبنى — تسجيل الوصول والتفتيش والجوازات والبوابات والصعود — وستُحدّث وفق مخطط المبنى التشغيلي.",
    },
    points: [
      { en: "Boarding closes 20 minutes before departure.", ar: "يُغلق الصعود قبل 20 دقيقة من المغادرة." },
      { en: "Gate information is shown on the flight board.", ar: "تظهر معلومات البوابة على لوحة الرحلات." },
      { en: "Quiet areas and family rooms are planned.", ar: "مناطق هادئة وغرف عائلية مخططة." },
    ],
  },
  {
    id: "accessibility",
    title: { en: "Accessibility", ar: "إمكانية الوصول" },
    body: {
      en: "Special assistance can be requested during booking or up to 48 hours before departure. Our team confirms every request individually.",
      ar: "يمكن طلب المساعدة الخاصة أثناء الحجز أو حتى 48 ساعة قبل المغادرة. يؤكد فريقنا كل طلب على حدة.",
    },
    points: [
      { en: "Wheelchair assistance from kerb to gate.", ar: "مساعدة بكرسي متحرك من المدخل إلى البوابة." },
      { en: "Step-free routes throughout the terminal.", ar: "مسارات بدون درجات في كل المبنى." },
      { en: "Assistance animals accepted with documentation.", ar: "حيوانات المساندة مقبولة بالوثائق اللازمة." },
    ],
  },
];
