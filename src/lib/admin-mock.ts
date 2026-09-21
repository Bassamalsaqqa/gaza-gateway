/**
 * Static, clearly synthetic mock records for the design-stage administration
 * screens (bookings, customers, inbox, archive, media, activity, analytics).
 * No persistence, no business logic — Codex wires the real data later.
 */

export type Bi = { en: string; ar: string };

export type MockBookingStatus = "confirmed" | "cancelled" | "checkedin" | "partial" | "upcoming";

export type MockPassenger = {
  id: string;
  name: string;
  type: "adult" | "child" | "infant";
  dob: string;
  nationality: string;
  document: string;
  companion?: string;
  seatOut: string | null;
  seatIn: string | null;
  bags: number;
  meal: string;
  assistance: string | null;
  checkedOut: boolean;
  checkedIn: boolean;
};

export type MockBooking = {
  ref: string;
  lead: string;
  route: string;
  destination: string;
  flightOut: string;
  flightIn: string | null;
  date: string;
  returnDate: string | null;
  paxCount: number;
  fare: "Essential" | "Classic" | "Flex";
  cabin: string;
  total: number;
  status: MockBookingStatus;
  channel: "web" | "desk";
  account: boolean;
  email: string;
  phone: string;
  booked: string;
  passengers: MockPassenger[];
  history: { id: string; when: string; what: Bi }[];
};

const pax = (
  id: string,
  name: string,
  type: MockPassenger["type"],
  dob: string,
  seatOut: string | null,
  seatIn: string | null,
  extra: Partial<MockPassenger> = {},
): MockPassenger => ({
  id,
  name,
  type,
  dob,
  nationality: "Palestinian",
  document: `P ${id.toUpperCase()}84213`,
  seatOut,
  seatIn,
  bags: 1,
  meal: "Standard",
  assistance: null,
  checkedOut: false,
  checkedIn: false,
  ...extra,
});

export const mockBookings: MockBooking[] = [
  {
    ref: "GZA4TQ",
    lead: "Nadia Sabbagh",
    route: "GZA → AMM",
    destination: "AMM",
    flightOut: "PS100",
    flightIn: "PS101",
    date: "2026-09-19",
    returnDate: "2026-09-26",
    paxCount: 2,
    fare: "Classic",
    cabin: "Economy",
    total: 618,
    status: "confirmed",
    channel: "web",
    account: true,
    email: "nadia.sabbagh@example.com",
    phone: "+970 59 000 1122",
    booked: "2026-08-30",
    passengers: [
      pax("p1", "Nadia Sabbagh", "adult", "1988-04-12", "12A", "12A", { bags: 2 }),
      pax("p2", "Karim Sabbagh", "child", "2017-02-03", "12B", "12B", { meal: "Child" }),
    ],
    history: [
      { id: "h1", when: "2026-08-30 10:12", what: { en: "Booking created on the website.", ar: "أُنشئ الحجز من الموقع." } },
      { id: "h2", when: "2026-09-02 09:40", what: { en: "Seats 12A and 12B selected.", ar: "تم اختيار المقعدين 12A و12B." } },
    ],
  },
  {
    ref: "GZA9MK",
    lead: "Hisham Mansour",
    route: "GZA → IST",
    destination: "IST",
    flightOut: "PS106",
    flightIn: "PS107",
    date: "2026-09-18",
    returnDate: "2026-10-01",
    paxCount: 3,
    fare: "Flex",
    cabin: "Economy",
    total: 1284,
    status: "partial",
    channel: "desk",
    account: false,
    email: "h.mansour@example.com",
    phone: "+970 59 000 3344",
    booked: "2026-08-21",
    passengers: [
      pax("p1", "Hisham Mansour", "adult", "1979-11-02", "8C", "8C", { bags: 2, checkedOut: true }),
      pax("p2", "Rasha Mansour", "adult", "1983-06-19", "8D", "8D", { meal: "Vegetarian" }),
      pax("p3", "Lina Mansour", "infant", "2026-01-08", null, null, { companion: "Hisham Mansour", bags: 0, document: "P LM10233" }),
    ],
    history: [
      { id: "h1", when: "2026-08-21 15:02", what: { en: "Booking created at the airport desk.", ar: "أُنشئ الحجز على مكتب المطار." } },
      { id: "h2", when: "2026-09-17 18:31", what: { en: "One passenger checked in for the outbound flight.", ar: "سجّل مسافر واحد لرحلة الذهاب." } },
    ],
  },
  {
    ref: "GZA7RD",
    lead: "Omar Halabi",
    route: "GZA → DOH",
    destination: "DOH",
    flightOut: "PS108",
    flightIn: null,
    date: "2026-09-17",
    returnDate: null,
    paxCount: 1,
    fare: "Essential",
    cabin: "Economy",
    total: 296,
    status: "checkedin",
    channel: "web",
    account: true,
    email: "omar.halabi@example.com",
    phone: "+970 59 000 5566",
    booked: "2026-09-01",
    passengers: [pax("p1", "Omar Halabi", "adult", "1992-01-25", "5F", null, { checkedOut: true })],
    history: [
      { id: "h1", when: "2026-09-01 08:00", what: { en: "Booking created on the website.", ar: "أُنشئ الحجز من الموقع." } },
      { id: "h2", when: "2026-09-16 20:10", what: { en: "Checked in and boarding pass issued.", ar: "تم التسجيل وإصدار بطاقة الصعود." } },
    ],
  },
  {
    ref: "GZA2BX",
    lead: "Salma Rayyan",
    route: "GZA → CAI",
    destination: "CAI",
    flightOut: "PS102",
    flightIn: "PS103",
    date: "2026-10-04",
    returnDate: "2026-10-11",
    paxCount: 4,
    fare: "Classic",
    cabin: "Economy",
    total: 1096,
    status: "upcoming",
    channel: "web",
    account: true,
    email: "salma.rayyan@example.com",
    phone: "+970 59 000 7788",
    booked: "2026-09-10",
    passengers: [
      pax("p1", "Salma Rayyan", "adult", "1985-03-30", "14A", "14A"),
      pax("p2", "Tareq Rayyan", "adult", "1984-07-14", "14B", "14B"),
      pax("p3", "Jana Rayyan", "child", "2015-09-09", "14C", "14C", { meal: "Child" }),
      pax("p4", "Adam Rayyan", "child", "2019-12-01", "14D", "14D", { meal: "Child" }),
    ],
    history: [{ id: "h1", when: "2026-09-10 12:22", what: { en: "Booking created on the website.", ar: "أُنشئ الحجز من الموقع." } }],
  },
  {
    ref: "GZA5ZN",
    lead: "Yara Dabbagh",
    route: "GZA → DXB",
    destination: "DXB",
    flightOut: "PS110",
    flightIn: "PS111",
    date: "2026-09-24",
    returnDate: "2026-09-30",
    paxCount: 2,
    fare: "Flex",
    cabin: "Economy",
    total: 942,
    status: "cancelled",
    channel: "desk",
    account: false,
    email: "yara.dabbagh@example.com",
    phone: "+970 59 000 9900",
    booked: "2026-08-12",
    passengers: [
      pax("p1", "Yara Dabbagh", "adult", "1990-05-05", null, null),
      pax("p2", "Fadi Dabbagh", "adult", "1987-08-08", null, null),
    ],
    history: [
      { id: "h1", when: "2026-08-12 11:00", what: { en: "Booking created at the airport desk.", ar: "أُنشئ الحجز على مكتب المطار." } },
      { id: "h2", when: "2026-09-05 16:45", what: { en: "Booking cancelled at the passenger's request.", ar: "أُلغي الحجز بطلب المسافر." } },
    ],
  },
  {
    ref: "GZA8LP",
    lead: "Bashar Qudsi",
    route: "GZA → JED",
    destination: "JED",
    flightOut: "PS112",
    flightIn: "PS113",
    date: "2026-09-21",
    returnDate: "2026-09-28",
    paxCount: 2,
    fare: "Classic",
    cabin: "Economy",
    total: 704,
    status: "confirmed",
    channel: "web",
    account: false,
    email: "bashar.qudsi@example.com",
    phone: "+970 59 000 2211",
    booked: "2026-09-04",
    passengers: [
      pax("p1", "Bashar Qudsi", "adult", "1975-10-10", "9A", "9A", { assistance: "Wheelchair to the aircraft" }),
      pax("p2", "Hala Qudsi", "adult", "1978-02-22", "9B", "9B"),
    ],
    history: [{ id: "h1", when: "2026-09-04 19:05", what: { en: "Booking created on the website.", ar: "أُنشئ الحجز من الموقع." } }],
  },
];

export const mockBookingByRef = (ref: string): MockBooking | undefined =>
  mockBookings.find((b) => b.ref.toLowerCase() === ref.toLowerCase());

/* -------------------------------- check-in -------------------------------- */

export type DeskFlight = {
  id: string;
  number: string;
  route: string;
  depart: string;
  gate: string;
  booked: number;
  checkedIn: number;
};

export const deskFlights: DeskFlight[] = [
  { id: "d1", number: "PS100", route: "GZA → AMM", depart: "08:10", gate: "A2", booked: 128, checkedIn: 96 },
  { id: "d2", number: "PS106", route: "GZA → IST", depart: "11:35", gate: "A4", booked: 154, checkedIn: 61 },
  { id: "d3", number: "PS108", route: "GZA → DOH", depart: "14:50", gate: "B1", booked: 141, checkedIn: 12 },
  { id: "d4", number: "PS112", route: "GZA → JED", depart: "18:25", gate: "B3", booked: 117, checkedIn: 0 },
];

export type DeskPassenger = {
  id: string;
  name: string;
  ref: string;
  seat: string | null;
  bags: number;
  assistance: string | null;
  infant: boolean;
  docsOk: boolean;
  status: "not" | "ready" | "done" | "docs";
};

export const deskPassengers: Record<string, DeskPassenger[]> = {
  d1: [
    { id: "x1", name: "Nadia Sabbagh", ref: "GZA4TQ", seat: "12A", bags: 2, assistance: null, infant: false, docsOk: true, status: "ready" },
    { id: "x2", name: "Karim Sabbagh", ref: "GZA4TQ", seat: "12B", bags: 0, assistance: null, infant: false, docsOk: true, status: "ready" },
    { id: "x3", name: "Wesam Attia", ref: "GZA6HH", seat: "3C", bags: 1, assistance: "Wheelchair to the aircraft", infant: false, docsOk: true, status: "done" },
    { id: "x4", name: "Rami Barghouti", ref: "GZA1QE", seat: null, bags: 1, assistance: null, infant: false, docsOk: false, status: "docs" },
  ],
  d2: [
    { id: "y1", name: "Hisham Mansour", ref: "GZA9MK", seat: "8C", bags: 2, assistance: null, infant: false, docsOk: true, status: "done" },
    { id: "y2", name: "Rasha Mansour", ref: "GZA9MK", seat: "8D", bags: 1, assistance: null, infant: true, docsOk: true, status: "ready" },
    { id: "y3", name: "Sireen Kanaan", ref: "GZA3VV", seat: "16F", bags: 1, assistance: null, infant: false, docsOk: true, status: "not" },
  ],
  d3: [
    { id: "z1", name: "Omar Halabi", ref: "GZA7RD", seat: "5F", bags: 1, assistance: null, infant: false, docsOk: true, status: "done" },
    { id: "z2", name: "Dima Shaath", ref: "GZA0KL", seat: "6A", bags: 0, assistance: "Visual assistance", infant: false, docsOk: true, status: "not" },
  ],
  d4: [
    { id: "w1", name: "Bashar Qudsi", ref: "GZA8LP", seat: "9A", bags: 2, assistance: "Wheelchair to the aircraft", infant: false, docsOk: true, status: "not" },
    { id: "w2", name: "Hala Qudsi", ref: "GZA8LP", seat: "9B", bags: 1, assistance: null, infant: false, docsOk: false, status: "docs" },
  ],
};

/* -------------------------------- customers ------------------------------- */

export type MockCustomer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  language: "en" | "ar";
  status: "active" | "disabled" | "guest";
  bookings: number;
  upcoming: number;
  travelers: { name: string; dob: string; nationality: string; document: string }[];
  refs: string[];
  seatPref: string;
  mealPref: string;
  newsletter: boolean;
  activity: { id: string; when: string; what: Bi }[];
};

export const mockCustomers: MockCustomer[] = [
  {
    id: "c-1001",
    name: "Nadia Sabbagh",
    email: "nadia.sabbagh@example.com",
    phone: "+970 59 000 1122",
    language: "ar",
    status: "active",
    bookings: 4,
    upcoming: 1,
    travelers: [
      { name: "Karim Sabbagh", dob: "2017-02-03", nationality: "Palestinian", document: "P KS55120" },
      { name: "Huda Sabbagh", dob: "1960-09-17", nationality: "Palestinian", document: "P HS22841" },
    ],
    refs: ["GZA4TQ"],
    seatPref: "Window",
    mealPref: "Standard",
    newsletter: true,
    activity: [
      { id: "a1", when: "2026-09-02 09:40", what: { en: "Chose seats for GZA4TQ.", ar: "اختار المقاعد للحجز GZA4TQ." } },
      { id: "a2", when: "2026-08-30 10:12", what: { en: "Account created.", ar: "أُنشئ الحساب." } },
    ],
  },
  {
    id: "c-1002",
    name: "Omar Halabi",
    email: "omar.halabi@example.com",
    phone: "+970 59 000 5566",
    language: "en",
    status: "active",
    bookings: 2,
    upcoming: 0,
    travelers: [],
    refs: ["GZA7RD"],
    seatPref: "Aisle",
    mealPref: "Vegetarian",
    newsletter: false,
    activity: [{ id: "a1", when: "2026-09-16 20:10", what: { en: "Checked in for PS108.", ar: "سجّل الوصول لرحلة PS108." } }],
  },
  {
    id: "c-1003",
    name: "Salma Rayyan",
    email: "salma.rayyan@example.com",
    phone: "+970 59 000 7788",
    language: "ar",
    status: "active",
    bookings: 3,
    upcoming: 1,
    travelers: [
      { name: "Jana Rayyan", dob: "2015-09-09", nationality: "Palestinian", document: "P JR90011" },
      { name: "Adam Rayyan", dob: "2019-12-01", nationality: "Palestinian", document: "P AR90012" },
    ],
    refs: ["GZA2BX"],
    seatPref: "Window",
    mealPref: "Child",
    newsletter: true,
    activity: [{ id: "a1", when: "2026-09-10 12:22", what: { en: "Booked GZA2BX for four passengers.", ar: "حجز GZA2BX لأربعة مسافرين." } }],
  },
  {
    id: "c-1004",
    name: "Yara Dabbagh",
    email: "yara.dabbagh@example.com",
    phone: "+970 59 000 9900",
    language: "en",
    status: "disabled",
    bookings: 1,
    upcoming: 0,
    travelers: [],
    refs: ["GZA5ZN"],
    seatPref: "No preference",
    mealPref: "Standard",
    newsletter: false,
    activity: [{ id: "a1", when: "2026-09-05 16:45", what: { en: "Cancelled GZA5ZN.", ar: "ألغى الحجز GZA5ZN." } }],
  },
  {
    id: "c-1005",
    name: "Bashar Qudsi",
    email: "bashar.qudsi@example.com",
    phone: "+970 59 000 2211",
    language: "ar",
    status: "guest",
    bookings: 1,
    upcoming: 1,
    travelers: [],
    refs: ["GZA8LP"],
    seatPref: "Aisle",
    mealPref: "Standard",
    newsletter: false,
    activity: [{ id: "a1", when: "2026-09-04 19:05", what: { en: "Booked as a guest.", ar: "حجز كزائر." } }],
  },
];

export const mockCustomerById = (id: string): MockCustomer | undefined => mockCustomers.find((c) => c.id === id);

/* --------------------------------- inbox --------------------------------- */

export type InboxTopic = "booking" | "archive" | "access" | "media" | "other";

export type InboxMessage = {
  id: string;
  sender: string;
  email: string;
  topic: InboxTopic;
  language: "en" | "ar";
  received: string;
  status: "new" | "open" | "resolved" | "spam";
  ref: string | null;
  body: Bi;
};

export const inboxMessages: InboxMessage[] = [
  {
    id: "m1",
    sender: "Nadia Sabbagh",
    email: "nadia.sabbagh@example.com",
    topic: "booking",
    language: "ar",
    received: "2026-09-17 09:12",
    status: "new",
    ref: "GZA4TQ",
    body: {
      en: "I would like to move my return from Amman by two days. Which options are available?",
      ar: "أرغب بتأخير عودتي من عمّان يومين. ما الخيارات المتاحة؟",
    },
  },
  {
    id: "m2",
    sender: "Rami Barghouti",
    email: "rami.barghouti@example.com",
    topic: "access",
    language: "en",
    received: "2026-09-16 17:48",
    status: "open",
    ref: "GZA1QE",
    body: {
      en: "My father uses a wheelchair. How is assistance arranged at the airport?",
      ar: "والدي يستخدم كرسيًا متحركًا. كيف تُنظَّم المساعدة في المطار؟",
    },
  },
  {
    id: "m3",
    sender: "Layan Zurub",
    email: "layan.zurub@example.com",
    topic: "archive",
    language: "ar",
    received: "2026-09-15 11:05",
    status: "open",
    ref: null,
    body: {
      en: "I have family photographs of the airport terminal and would like to contribute them.",
      ar: "لديّ صور عائلية لمبنى المطار وأرغب بمشاركتها.",
    },
  },
  {
    id: "m4",
    sender: "Studio Press Desk",
    email: "desk@example.com",
    topic: "media",
    language: "en",
    received: "2026-09-14 08:20",
    status: "resolved",
    ref: null,
    body: {
      en: "We are preparing a feature on the airport and would like to request permission to use archive images.",
      ar: "نعدّ تقريرًا عن المطار ونرغب بطلب إذن لاستخدام صور الأرشيف.",
    },
  },
  {
    id: "m5",
    sender: "Unknown sender",
    email: "no-reply@example.net",
    topic: "other",
    language: "en",
    received: "2026-09-13 03:02",
    status: "spam",
    ref: null,
    body: { en: "Promotional message.", ar: "رسالة ترويجية." },
  },
];

/* --------------------------- website content mock ------------------------- */

export type HomeSection = { id: string; labelKey: string; heading: Bi; body: Bi; visible: boolean; items?: string[] };

export const homeSections: HomeSection[] = [
  {
    id: "hero",
    labelKey: "a2.web.hp.hero",
    heading: { en: "Fly from Gaza", ar: "سافر من غزة" },
    body: { en: "Palestinian Airlines services from Gaza International Airport.", ar: "رحلات الخطوط الجوية الفلسطينية من مطار غزة الدولي." },
    visible: true,
  },
  { id: "search", labelKey: "a2.web.hp.search", heading: { en: "Find a flight", ar: "ابحث عن رحلة" }, body: { en: "", ar: "" }, visible: true },
  { id: "board", labelKey: "a2.web.hp.board", heading: { en: "Today at GZA", ar: "اليوم في غزة" }, body: { en: "", ar: "" }, visible: true },
  {
    id: "featured",
    labelKey: "a2.web.hp.featured",
    heading: { en: "Where we fly", ar: "إلى أين نطير" },
    body: { en: "", ar: "" },
    visible: true,
    items: ["AMM", "IST", "CAI", "DOH"],
  },
  {
    id: "story",
    labelKey: "a2.web.hp.story",
    heading: { en: "The airport's story", ar: "حكاية المطار" },
    body: { en: "Past, present and the plans for its future.", ar: "الماضي والحاضر وخطط المستقبل." },
    visible: true,
  },
  { id: "manage", labelKey: "a2.web.hp.manage", heading: { en: "Manage your booking", ar: "إدارة حجزك" }, body: { en: "", ar: "" }, visible: true },
  { id: "shortcuts", labelKey: "a2.web.hp.shortcuts", heading: { en: "Before you travel", ar: "قبل السفر" }, body: { en: "", ar: "" }, visible: true },
  { id: "archive", labelKey: "a2.web.hp.archive", heading: { en: "From the archive", ar: "من الأرشيف" }, body: { en: "", ar: "" }, visible: true, items: ["ar-01", "ar-04"] },
  { id: "cta", labelKey: "a2.web.hp.cta", heading: { en: "About the airport", ar: "عن المطار" }, body: { en: "", ar: "" }, visible: false },
];

export type TravelSection = { id: string; labelKey: string; title: Bi; intro: Bi; items: { id: string; text: Bi }[]; visible: boolean };

export const travelSections: TravelSection[] = [
  {
    id: "prepare",
    labelKey: "a2.web.tr.prepare",
    title: { en: "Preparing to travel", ar: "الاستعداد للسفر" },
    intro: { en: "What to arrange before your flight from Gaza.", ar: "ما ينبغي تحضيره قبل رحلتك من غزة." },
    items: [
      { id: "i1", text: { en: "Check your travel document validity.", ar: "تحقق من صلاحية وثيقة سفرك." } },
      { id: "i2", text: { en: "Arrive three hours before departure.", ar: "احضر ثلاث ساعات قبل المغادرة." } },
    ],
    visible: true,
  },
  {
    id: "documents",
    labelKey: "a2.web.tr.documents",
    title: { en: "Travel documents", ar: "وثائق السفر" },
    intro: { en: "Documents to carry for each destination.", ar: "الوثائق المطلوبة لكل محطة." },
    items: [{ id: "i1", text: { en: "Carry the document used in the booking.", ar: "أحضر الوثيقة المستخدمة في الحجز." } }],
    visible: true,
  },
  {
    id: "baggage",
    labelKey: "a2.web.tr.baggage",
    title: { en: "Baggage", ar: "الحقائب" },
    intro: { en: "Cabin and checked baggage allowances.", ar: "أوزان حقائب المقصورة والحقائب المسجّلة." },
    items: [{ id: "i1", text: { en: "One cabin bag up to 7 kg.", ar: "حقيبة مقصورة واحدة حتى 7 كغ." } }],
    visible: true,
  },
  {
    id: "airport",
    labelKey: "a2.web.tr.airport",
    title: { en: "At the airport", ar: "في المطار" },
    intro: { en: "Check-in, security and boarding.", ar: "التسجيل والتفتيش والصعود." },
    items: [{ id: "i1", text: { en: "Check-in closes 60 minutes before departure.", ar: "يُغلق التسجيل 60 دقيقة قبل المغادرة." } }],
    visible: true,
  },
  {
    id: "accessibility",
    labelKey: "a2.web.tr.accessibility",
    title: { en: "Accessibility", ar: "إمكانية الوصول" },
    intro: { en: "Assistance available at the airport and on board.", ar: "المساعدة المتاحة في المطار وعلى الطائرة." },
    items: [{ id: "i1", text: { en: "Request assistance at least 48 hours ahead.", ar: "اطلب المساعدة قبل 48 ساعة على الأقل." } }],
    visible: true,
  },
];

export type SitePage = {
  id: string;
  labelKey: string;
  state: "draft" | "published" | "archived";
  en: boolean;
  ar: boolean;
  updated: string;
  path: string;
};

export const sitePages: SitePage[] = [
  { id: "about", labelKey: "a2.web.pg.about", state: "published", en: true, ar: true, updated: "2026-09-02", path: "/about" },
  { id: "contact", labelKey: "a2.web.pg.contact", state: "published", en: true, ar: false, updated: "2026-09-11", path: "/contact" },
  { id: "privacy", labelKey: "a2.web.pg.privacy", state: "published", en: true, ar: true, updated: "2026-07-19", path: "/privacy" },
  { id: "terms", labelKey: "a2.web.pg.terms", state: "draft", en: true, ar: false, updated: "2026-09-14", path: "/terms" },
];

export type NavItemMock = { id: string; label: Bi; visible: boolean };

export const headerNavMock: NavItemMock[] = [
  { id: "flights", label: { en: "Flights", ar: "الرحلات" }, visible: true },
  { id: "destinations", label: { en: "Destinations", ar: "المحطات" }, visible: true },
  { id: "airport", label: { en: "The Airport", ar: "المطار" }, visible: true },
  { id: "archive", label: { en: "Archive", ar: "الأرشيف" }, visible: true },
  { id: "travel", label: { en: "Travel Info", ar: "معلومات السفر" }, visible: true },
  { id: "manage", label: { en: "Manage Booking", ar: "إدارة الحجز" }, visible: true },
  { id: "checkin", label: { en: "Check-in", ar: "تسجيل الوصول" }, visible: true },
  { id: "signin", label: { en: "Sign in", ar: "تسجيل الدخول" }, visible: true },
  { id: "book", label: { en: "Book", ar: "احجز" }, visible: true },
];

export const footerGroupsMock: { id: string; label: Bi; links: NavItemMock[] }[] = [
  {
    id: "travel",
    label: { en: "Travel", ar: "السفر" },
    links: [
      { id: "flights", label: { en: "Flights", ar: "الرحلات" }, visible: true },
      { id: "destinations", label: { en: "Destinations", ar: "المحطات" }, visible: true },
      { id: "checkin", label: { en: "Check-in", ar: "تسجيل الوصول" }, visible: true },
    ],
  },
  {
    id: "airport",
    label: { en: "The airport", ar: "المطار" },
    links: [
      { id: "story", label: { en: "Airport story", ar: "حكاية المطار" }, visible: true },
      { id: "archive", label: { en: "Archive", ar: "الأرشيف" }, visible: true },
    ],
  },
  {
    id: "help",
    label: { en: "Help", ar: "المساعدة" },
    links: [
      { id: "contact", label: { en: "Contact", ar: "اتصل بنا" }, visible: true },
      { id: "travel", label: { en: "Travel information", ar: "معلومات السفر" }, visible: true },
    ],
  },
];

export const legalLinksMock: NavItemMock[] = [
  { id: "privacy", label: { en: "Privacy", ar: "الخصوصية" }, visible: true },
  { id: "terms", label: { en: "Terms", ar: "الشروط" }, visible: true },
];

/* --------------------------- airport & archive mock ----------------------- */

export type Verification = "verified" | "pending" | "unsourced";

export type TimelineEntry = {
  id: string;
  period: string;
  title: Bi;
  narrative: Bi;
  media: string;
  verification: Verification;
  state: "draft" | "published" | "archived";
};

export const timelineEntries: TimelineEntry[] = [
  {
    id: "t1",
    period: "1994–1998",
    title: { en: "Planning and construction", ar: "التخطيط والبناء" },
    narrative: {
      en: "Placeholder narrative describing the planning period. Replace with sourced editorial text.",
      ar: "نص أولي يصف مرحلة التخطيط. يُستبدل بنص محرَّر ومُوثَّق.",
    },
    media: "terminal-exterior.jpg",
    verification: "pending",
    state: "published",
  },
  {
    id: "t2",
    period: "1998",
    title: { en: "Opening", ar: "الافتتاح" },
    narrative: { en: "Placeholder narrative for the opening chapter.", ar: "نص أولي لفصل الافتتاح." },
    media: "opening-day.jpg",
    verification: "verified",
    state: "published",
  },
  {
    id: "t3",
    period: "2001–2002",
    title: { en: "Damage and closure", ar: "الأضرار والإغلاق" },
    narrative: { en: "Placeholder narrative awaiting a verified source.", ar: "نص أولي بانتظار مصدر مُتحقَّق." },
    media: "runway.jpg",
    verification: "unsourced",
    state: "draft",
  },
  {
    id: "t4",
    period: "2003–today",
    title: { en: "The site since", ar: "الموقع بعد ذلك" },
    narrative: { en: "Placeholder narrative for the present-day site.", ar: "نص أولي عن الموقع اليوم." },
    media: "site-aerial.jpg",
    verification: "pending",
    state: "draft",
  },
];

export type PresentFact = { id: string; label: Bi; value: Bi; verification: Verification };

export const presentFacts: PresentFact[] = [
  { id: "f1", label: { en: "Location", ar: "الموقع" }, value: { en: "Rafah, southern Gaza Strip", ar: "رفح، جنوب قطاع غزة" }, verification: "verified" },
  { id: "f2", label: { en: "IATA code", ar: "رمز إياتا" }, value: { en: "GZA", ar: "GZA" }, verification: "verified" },
  { id: "f3", label: { en: "Runway", ar: "المدرج" }, value: { en: "Placeholder value pending source", ar: "قيمة أولية بانتظار المصدر" }, verification: "pending" },
  { id: "f4", label: { en: "Current status", ar: "الحالة الحالية" }, value: { en: "Placeholder value pending source", ar: "قيمة أولية بانتظار المصدر" }, verification: "unsourced" },
];

export type FutureItem = { id: string; group: string; title: Bi; body: Bi; media: string; visible: boolean };

export const futureItems: FutureItem[] = [
  { id: "fu1", group: "a2.ap.fu.terminal", title: { en: "Terminal concept", ar: "تصوّر المبنى" }, body: { en: "Placeholder concept description.", ar: "وصف أولي للتصوّر." }, media: "placeholder", visible: true },
  { id: "fu2", group: "a2.ap.fu.experience", title: { en: "Arrivals experience", ar: "تجربة الوصول" }, body: { en: "Placeholder description.", ar: "وصف أولي." }, media: "placeholder", visible: true },
  { id: "fu3", group: "a2.ap.fu.masterplan", title: { en: "Site masterplan", ar: "المخطط العام للموقع" }, body: { en: "Placeholder description.", ar: "وصف أولي." }, media: "placeholder", visible: true },
  { id: "fu4", group: "a2.ap.fu.network", title: { en: "Wider network", ar: "شبكة أوسع" }, body: { en: "Placeholder description.", ar: "وصف أولي." }, media: "placeholder", visible: false },
];

export type ArchiveItem = {
  id: string;
  title: Bi;
  era: "past" | "present" | "future";
  category: "photograph" | "document" | "architecture" | "concept";
  date: string;
  source: string | null;
  state: "draft" | "published" | "archived";
  featured: boolean;
  caption: Bi;
  credit: string;
  rights: string;
  chapter: string | null;
  note: string;
};

export const archiveItems: ArchiveItem[] = [
  {
    id: "ar-01",
    title: { en: "Terminal exterior", ar: "واجهة المبنى" },
    era: "past",
    category: "photograph",
    date: "1998",
    source: "s1",
    state: "published",
    featured: true,
    caption: { en: "Placeholder caption.", ar: "تعليق أولي." },
    credit: "Archive placeholder",
    rights: "Rights to be confirmed",
    chapter: "t2",
    note: "Placeholder record for layout review.",
  },
  {
    id: "ar-02",
    title: { en: "Operating licence", ar: "رخصة التشغيل" },
    era: "past",
    category: "document",
    date: "1999",
    source: "s2",
    state: "published",
    featured: false,
    caption: { en: "Placeholder caption.", ar: "تعليق أولي." },
    credit: "Archive placeholder",
    rights: "Rights to be confirmed",
    chapter: "t2",
    note: "",
  },
  {
    id: "ar-03",
    title: { en: "Runway survey", ar: "مسح المدرج" },
    era: "present",
    category: "document",
    date: "2019",
    source: null,
    state: "draft",
    featured: false,
    caption: { en: "Placeholder caption.", ar: "" },
    credit: "",
    rights: "Unknown",
    chapter: null,
    note: "Needs a source before publishing.",
  },
  {
    id: "ar-04",
    title: { en: "Terminal drawing", ar: "رسم المبنى" },
    era: "past",
    category: "architecture",
    date: "1996",
    source: "s3",
    state: "published",
    featured: true,
    caption: { en: "Placeholder caption.", ar: "تعليق أولي." },
    credit: "Archive placeholder",
    rights: "Rights to be confirmed",
    chapter: "t1",
    note: "",
  },
  {
    id: "ar-05",
    title: { en: "Future terminal concept", ar: "تصوّر المبنى المستقبلي" },
    era: "future",
    category: "concept",
    date: "2026",
    source: null,
    state: "draft",
    featured: false,
    caption: { en: "Placeholder concept image.", ar: "صورة تصوّر أولية." },
    credit: "",
    rights: "Placeholder",
    chapter: null,
    note: "Illustrative concept imagery. Not documentary evidence of the airport's historical or current condition.",
  },
];

export type SourceRecord = {
  id: string;
  title: Bi;
  type: "document" | "photograph" | "report" | "interview" | "statement" | "map" | "survey";
  org: string;
  date: string;
  verification: Verification;
  usedBy: number;
};

export const sourceRecords: SourceRecord[] = [
  { id: "s1", title: { en: "Airport photograph collection", ar: "مجموعة صور المطار" }, type: "photograph", org: "Placeholder archive", date: "1998", verification: "verified", usedBy: 2 },
  { id: "s2", title: { en: "Civil aviation record", ar: "سجل الطيران المدني" }, type: "document", org: "Placeholder authority", date: "1999", verification: "pending", usedBy: 1 },
  { id: "s3", title: { en: "Terminal design drawings", ar: "رسومات تصميم المبنى" }, type: "map", org: "Placeholder studio", date: "1996", verification: "verified", usedBy: 1 },
  { id: "s4", title: { en: "Site condition report", ar: "تقرير حالة الموقع" }, type: "report", org: "Placeholder organisation", date: "2019", verification: "pending", usedBy: 0 },
  { id: "s5", title: { en: "Staff recollection", ar: "شهادة موظف" }, type: "interview", org: "Placeholder interviewee", date: "2021", verification: "unsourced", usedBy: 0 },
];

export type MediaItem = {
  id: string;
  filename: string;
  title: Bi;
  kind: "image" | "document" | "video";
  meta: string;
  uploaded: string;
  usedIn: string[];
  rights: string;
  alt: Bi;
};

export const mediaItems: MediaItem[] = [
  { id: "md1", filename: "terminal-exterior.jpg", title: { en: "Terminal exterior", ar: "واجهة المبنى" }, kind: "image", meta: "JPEG · 2400×1600", uploaded: "2026-08-02", usedIn: ["Archive ar-01", "Timeline t2"], rights: "Rights to be confirmed", alt: { en: "Placeholder alternative text.", ar: "نص بديل أولي." } },
  { id: "md2", filename: "opening-day.jpg", title: { en: "Opening day", ar: "يوم الافتتاح" }, kind: "image", meta: "JPEG · 2000×1333", uploaded: "2026-08-02", usedIn: ["Timeline t2"], rights: "Rights to be confirmed", alt: { en: "Placeholder alternative text.", ar: "" } },
  { id: "md3", filename: "civil-aviation-record.pdf", title: { en: "Civil aviation record", ar: "سجل الطيران المدني" }, kind: "document", meta: "PDF · 4 pages", uploaded: "2026-08-14", usedIn: ["Source s2"], rights: "Placeholder", alt: { en: "", ar: "" } },
  { id: "md4", filename: "site-aerial.jpg", title: { en: "Site from above", ar: "الموقع من الأعلى" }, kind: "image", meta: "JPEG · 3000×2000", uploaded: "2026-09-01", usedIn: [], rights: "Unknown", alt: { en: "Placeholder alternative text.", ar: "نص بديل أولي." } },
  { id: "md5", filename: "airport-story.mp4", title: { en: "Story clip", ar: "مقطع الحكاية" }, kind: "video", meta: "MP4 · 1:20", uploaded: "2026-09-09", usedIn: ["Homepage story"], rights: "Placeholder", alt: { en: "", ar: "" } },
];

/* -------------------------------- analytics ------------------------------ */

export const analyticsOverview = [
  { id: "visits", labelKey: "a2.an.visits", value: "18,420", trend: "+6%" },
  { id: "searches", labelKey: "a2.an.searches", value: "5,310", trend: "+11%" },
  { id: "bookings", labelKey: "a2.an.bookings", value: "742", trend: "+4%" },
  { id: "checkins", labelKey: "a2.an.checkins", value: "611", trend: "+3%" },
];

export const funnelSteps = [
  { id: "search", labelKey: "a2.an.fn.search", value: 5310 },
  { id: "results", labelKey: "a2.an.fn.results", value: 4712 },
  { id: "flight", labelKey: "a2.an.fn.flight", value: 3105 },
  { id: "fare", labelKey: "a2.an.fn.fare", value: 2480 },
  { id: "pax", labelKey: "a2.an.fn.pax", value: 1720 },
  { id: "seat", labelKey: "a2.an.fn.seat", value: 1402 },
  { id: "extras", labelKey: "a2.an.fn.extras", value: 1180 },
  { id: "review", labelKey: "a2.an.fn.review", value: 905 },
  { id: "confirm", labelKey: "a2.an.fn.confirm", value: 742 },
];

export const routeStats = [
  { code: "AMM", searched: 1620, booked: 268 },
  { code: "IST", searched: 1180, booked: 154 },
  { code: "CAI", searched: 940, booked: 121 },
  { code: "DOH", searched: 610, booked: 78 },
  { code: "DXB", searched: 470, booked: 61 },
  { code: "JED", searched: 320, booked: 42 },
  { code: "RUH", searched: 170, booked: 18 },
];

export const contentStats = [
  { id: "dest", labelKey: "a2.an.dest", views: "6,240", time: "1:48" },
  { id: "story", labelKey: "a2.an.story", views: "4,110", time: "3:22" },
  { id: "gallery", labelKey: "a2.an.gallery", views: "2,860", time: "2:41" },
  { id: "travel", labelKey: "a2.an.travel", views: "1,905", time: "1:32" },
];

/* --------------------------------- staff --------------------------------- */

export type StaffRow = {
  id: string;
  name: Bi;
  email: string;
  role: "admin" | "editor" | "viewer";
  status: "active" | "disabled";
  lastActive: string;
};

export const staffRows: StaffRow[] = [
  { id: "adm-1", name: { en: "Rana Habib", ar: "رنا حبيب" }, email: "rana.habib@gza.ps", role: "admin", status: "active", lastActive: "2026-09-17 08:40" },
  { id: "adm-2", name: { en: "Yousef Nasser", ar: "يوسف ناصر" }, email: "yousef.nasser@gza.ps", role: "editor", status: "active", lastActive: "2026-09-16 15:12" },
  { id: "adm-3", name: { en: "Layla Odeh", ar: "ليلى عودة" }, email: "layla.odeh@gza.ps", role: "viewer", status: "active", lastActive: "2026-09-15 11:03" },
  { id: "adm-4", name: { en: "Samir Khoury", ar: "سمير خوري" }, email: "samir.khoury@gza.ps", role: "editor", status: "disabled", lastActive: "2026-07-28 09:55" },
];

/* ------------------------------ activity log ----------------------------- */

export type ActivityEntry = {
  id: string;
  actor: Bi;
  action: "updated" | "published" | "cancelled" | "created" | "signin";
  module: string;
  object: string;
  when: string;
  before: string;
  after: string;
  summary: Bi;
};

export const activityEntries: ActivityEntry[] = [
  {
    id: "l1",
    actor: { en: "Rana Habib", ar: "رنا حبيب" },
    action: "updated",
    module: "adm.nav.flights",
    object: "PS104",
    when: "2026-09-17 07:52",
    before: "Scheduled",
    after: "Delayed",
    summary: { en: "Rana changed PS104 from Scheduled to Delayed.", ar: "غيّرت رنا حالة PS104 من مجدولة إلى متأخرة." },
  },
  {
    id: "l2",
    actor: { en: "Yousef Nasser", ar: "يوسف ناصر" },
    action: "published",
    module: "adm.nav.destinations",
    object: "IST",
    when: "2026-09-16 15:10",
    before: "Draft",
    after: "Published",
    summary: { en: "Yousef published Arabic destination content.", ar: "نشر يوسف المحتوى العربي للمحطة." },
  },
  {
    id: "l3",
    actor: { en: "Rana Habib", ar: "رنا حبيب" },
    action: "cancelled",
    module: "a2.bk.title",
    object: "GZA5ZN",
    when: "2026-09-05 16:45",
    before: "Confirmed",
    after: "Cancelled",
    summary: { en: "Administrator cancelled booking GZA5ZN.", ar: "ألغى المسؤول الحجز GZA5ZN." },
  },
  {
    id: "l4",
    actor: { en: "Yousef Nasser", ar: "يوسف ناصر" },
    action: "created",
    module: "a2.ap.title",
    object: "ar-05",
    when: "2026-09-04 10:22",
    before: "—",
    after: "Draft",
    summary: { en: "Yousef added an archive item as a draft.", ar: "أضاف يوسف عنصرًا للأرشيف كمسوّدة." },
  },
  {
    id: "l5",
    actor: { en: "Layla Odeh", ar: "ليلى عودة" },
    action: "signin",
    module: "adm.workspace",
    object: "layla.odeh@gza.ps",
    when: "2026-09-15 11:03",
    before: "—",
    after: "—",
    summary: { en: "Layla signed in to the workspace.", ar: "دخلت ليلى إلى مساحة العمل." },
  },
];
