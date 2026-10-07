import type { LocalizedText } from "../types.ts";

// Exact accepted public narrative, extracted without changing its meaning.
export const privacySections: { heading: LocalizedText; body: LocalizedText[] }[] = [
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
        en: "Historical images include licensed material and selected owner-supplied copies whose reuse rights remain unconfirmed. Rights remain with their respective owners; credits are shown where known. Future concepts are illustrative, not evidence of historical or current conditions.",
        ar: "تشمل الصور التاريخية مواد مرخّصة ونسخاً مختارة قدّمها مالك المشروع ولم تُثبت حقوق إعادة استخدامها. وتبقى الحقوق لأصحابها، وتُذكر الاعتمادات حيثما كانت معروفة. تصورات المستقبل توضيحية وليست أدلة على الحالة التاريخية أو الراهنة.",
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

export const termsSections: { heading: LocalizedText; body: LocalizedText[] }[] = [
  {
    heading: { en: "Scope", ar: "نطاق الاستخدام" },
    body: [
      {
        en: "These terms cover your use of this website, which is a design prototype of the Gaza International Airport and Palestinian Airlines passenger experience. Using the site means you accept that it is a demonstration.",
        ar: "تشمل هذه الشروط استخدامك لهذا الموقع، وهو نموذج تصميمي لتجربة المسافر في مطار غزة الدولي والخطوط الجوية الفلسطينية. استخدامك للموقع يعني إقرارك بأنه عرض تجريبي.",
      },
    ],
  },
  {
    heading: { en: "Flight information", ar: "معلومات الرحلات" },
    body: [
      {
        en: "Schedules, flight numbers, times, aircraft, gates, terminals, statuses, seat availability and fares shown here are generated sample data. They do not describe operating services and must not be used to plan real travel.",
        ar: "الجداول وأرقام الرحلات والأوقات والطائرات والبوابات والمباني والحالات وتوافر المقاعد والأجرات المعروضة هنا بيانات تجريبية مُولَّدة. وهي لا تصف رحلات فعلية ولا يجوز الاعتماد عليها لتخطيط سفر حقيقي.",
      },
    ],
  },
  {
    heading: { en: "Bookings and booking references", ar: "الحجوزات وأرقام الحجز" },
    body: [
      {
        en: "Completing the booking flow produces a sample booking reference stored only in your browser. It is not a ticket, it reserves nothing, and it cannot be presented at an airport or airline counter.",
        ar: "إكمال خطوات الحجز يُنتج رقم حجز تجريبياً يُحفظ في متصفحك فقط. وهو ليس تذكرة ولا يحجز شيئاً ولا يمكن تقديمه في أي مكتب مطار أو شركة طيران.",
      },
      {
        en: "No payment is requested or processed at any step, and no fare, refund or change condition shown here creates an entitlement.",
        ar: "لا يُطلب أي دفع ولا يُعالج في أي خطوة، ولا تنشئ أي شروط أجرة أو استرداد أو تغيير معروضة هنا أي حق أو التزام.",
      },
    ],
  },
  {
    heading: { en: "Accounts", ar: "الحسابات" },
    body: [
      {
        en: "Account creation, sign in and recovery screens are demonstrations. Any details you enter stay on your device and can be removed by clearing your browser data.",
        ar: "شاشات إنشاء الحساب وتسجيل الدخول والاستعادة عرض تجريبي. تبقى أي بيانات تُدخلها على جهازك ويمكن حذفها بمسح بيانات المتصفح.",
      },
    ],
  },
  {
    heading: { en: "Content, imagery and the archive", ar: "المحتوى والصور والأرشيف" },
    body: [
      {
        en: "Historical images include licensed material and selected owner-supplied copies whose reuse rights remain unconfirmed. Rights remain with their respective owners; credits are shown where known. Future concepts are illustrative, not evidence of historical or current conditions.",
        ar: "تشمل الصور التاريخية مواد مرخّصة ونسخاً مختارة قدّمها مالك المشروع ولم تُثبت حقوق إعادة استخدامها. وتبقى الحقوق لأصحابها، وتُذكر الاعتمادات حيثما كانت معروفة. تصورات المستقبل توضيحية وليست أدلة على الحالة التاريخية أو الراهنة.",
      },
    ],
  },
  {
    heading: { en: "Changes to the site", ar: "التغييرات على الموقع" },
    body: [
      {
        en: "Because this is a prototype under active design, pages, flows and content can change or be removed without notice.",
        ar: "لأن هذا نموذج قيد التطوير، قد تتغير الصفحات والمسارات والمحتوى أو تُحذف دون إشعار.",
      },
    ],
  },
];

export const aboutCopy = [{
          en: "Gaza International Airport and its home carrier, presented as one place: a working travel service and a record of the airport itself.",
          ar: "مطار غزة الدولي وناقله الوطني في مكان واحد: خدمة سفر عاملة وسجل للمطار نفسه.",
        },
{
              en: "GZA opened in 1998 as the civil airport serving Gaza. This site presents its history, its present-day state, and the vision for its future. Historical records identify their evidence status; future concepts are illustrative.",
              ar: "افتُتح مطار غزة الدولي عام 1998 بصفته المطار المدني الذي يخدم غزة. يقدم هذا الموقع تاريخه وواقعه الراهن ورؤية مستقبله. وتبيّن السجلات التاريخية حالة أدلتها، بينما تُعرض تصورات المستقبل بوصفها توضيحية.",
            },
{
              en: "Palestinian Airlines is the home carrier at GZA. The opening network links Gaza with seven regional gateways, flown by Airbus A320-family aircraft.",
              ar: "الخطوط الجوية الفلسطينية هي الناقل الوطني في مطار غزة الدولي. تربط الشبكة الافتتاحية غزة بسبع بوابات إقليمية بطائرات من عائلة إيرباص A320.",
            },
{ en: "About the material", ar: "عن المواد المعروضة" },
{
              en: "Historical images include licensed material and selected owner-supplied copies whose reuse rights remain unconfirmed. Rights remain with their respective owners; credits are shown where known. Future concepts are illustrative, not evidence of historical or current conditions. Flight schedules, fares and bookings remain demonstration data held in your browser only.",
              ar: "تشمل الصور التاريخية مواد مرخّصة ونسخاً مختارة قدّمها مالك المشروع ولم تُثبت حقوق إعادة استخدامها. وتبقى الحقوق لأصحابها، وتُذكر الاعتمادات حيثما كانت معروفة. تصورات المستقبل توضيحية وليست أدلة على الحالة التاريخية أو الراهنة. وتبقى جداول الرحلات والأسعار والحجوزات بيانات توضيحية محفوظة في متصفحك فقط.",
            }];
