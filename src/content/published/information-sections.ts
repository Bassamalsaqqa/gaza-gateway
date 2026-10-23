import type { LocalizedText } from "../types.ts";

/** Truthful public privacy obligations matching installed backend, email OTP, private archive and opt-in telemetry. */
export const privacySections: { heading: LocalizedText; body: LocalizedText[] }[] = [
  {
    heading: { en: "About this notice", ar: "عن هذا الإشعار" },
    body: [
      {
        en: "This website is an internet-based art project and digital memorial by Ayman Alazraq, incorporating a commemorative passenger experience for Gaza International Airport. It is published for cultural, artistic, and historical engagement, not as an operating commercial airline or transport service.",
        ar: "هذا الموقع هو مشروع فني على الإنترنت ونصب تذكاري رقمي لأيمن الأزرق، يضم تجربة مسافر تذكارية لمطار غزة الدولي. الموقع منشور للمشاركة الثقافية والفنية والتاريخية، وليس كشركة طيران تجارية عاملة أو خدمة نقل فعلية.",
      },
    ],
  },
  {
    heading: { en: "Commemorative bookings and accounts", ar: "الحجوزات التذكارية والحسابات" },
    body: [
      {
        en: "When you create a commemorative booking or register an account, your details (passenger names, contact email, and commemorative itinerary selections) are securely stored in the project's backend database. This allows you to retrieve commemorative boarding passes, view trip records, and manage your preferences.",
        ar: "عند إنشاء حجز تذكاري أو تسجيل حساب، تُحفظ بياناتك (أسماء المسافرين، والبريد الإلكتروني للتواصل، وتفاصيل خط السير التذكاري) بشكل آمن في قاعدة بيانات خادم المشروع. يتيح لك ذلك استرجاع بطاقات صعود الطائرة التذكارية والاطلاع على سجلات الرحلة وإدارة تفضيلاتك.",
      },
      {
        en: "Accounts use server-side authentication, password hashes and session cookies. Email verification and recovery messages are sent through the project's configured mail service; guest bookings use an email verification code. Clearing browser data does not delete server-held accounts, bookings or submissions. Payment or card details are not requested.",
        ar: "تستخدم الحسابات مصادقة على الخادم وتجزئات لكلمات المرور وملفات تعريف ارتباط للجلسات. تُرسل رسائل التحقق والاستعادة عبر خدمة بريد المشروع، ويستخدم حجز الضيف رمز تحقق بالبريد الإلكتروني. لا يؤدي مسح بيانات المتصفح إلى حذف الحسابات أو الحجوزات أو المساهمات المحفوظة على الخادم. لا تُطلب بيانات دفع أو بطاقات.",
      },
    ],
  },
  {
    heading: { en: "Archive contributions and curatorial review", ar: "مشاركات الأرشيف والمراجعة التقييمية" },
    body: [
      {
        en: "Materials submitted through the archive contribution form (including uploaded images or videos, captions, dates, credit lines, and contributor contact emails) are held in private backend storage for curatorial review. Submissions are never published automatically; our curatorial team reviews permissions prior to any public presentation. Contributor rights remain with their respective owners.",
        ar: "تُحفظ المواد المُرسلة عبر نموذج المساهمة في الأرشيف (بما في ذلك الصور أو مقاطع الفيديو، والتعليقات، والتواريخ، وبيانات الإسناد، والبريد الإلكتروني للمساهم) في مساحة تخزين خاصة على الخادم لغايات المراجعة والتقييم. ولا تُنشر المساهمات تلقائياً أبداً؛ إذ يتولى الفريق مراجعة الأذونات قبل أي عرض عام، وتبقى حقوق المساهمين محفوظة لأصحابها.",
      },
    ],
  },
  {
    heading: { en: "First-party analytics and privacy choices", ar: "التحليلات المباشرة وخيارات الخصوصية" },
    body: [
      {
        en: "Optional first-party analytics starts only after you allow it, respects Do Not Track (DNT) and Global Privacy Control (GPC), and excludes staff and private account/booking pages. It records canonical page paths without query strings, session-only random identifiers, approximate active reading time, selected public interactions and referrer domains. It does not store names, emails, booking references, raw IP addresses or user-agent strings in analytics events. You can change your choice below. There are no advertising trackers or cross-site identifiers in this analytics feature.",
        ar: "لا تبدأ التحليلات الاختيارية للموقع إلا بعد موافقتك، وتحترم إشارات عدم التتبع (DNT) والتحكم العام بالخصوصية (GPC)، وتستثني الموظفين وصفحات الحسابات والحجوزات الخاصة. تسجّل مسارات الصفحات دون معاملات البحث، ومعرّفات عشوائية للجلسة فقط، ووقت قراءة نشطاً تقريبياً، وتفاعلات عامة مختارة، ونطاقات المواقع المُحيلة. لا تُحفظ الأسماء أو عناوين البريد أو مراجع الحجز أو عناوين الإنترنت الخام أو بيانات المتصفح في أحداث التحليلات. يمكنك تعديل اختيارك أدناه. لا تتضمن هذه الميزة أدوات تعقب إعلانية أو معرّفات مشتركة بين المواقع.",
      },
      {
        en: "Raw analytics records become eligible for bounded deletion after 90 days; monthly report summaries are retained separately. Opt-in usage estimates cannot identify verified people or establish a person-level conversion rate. Confirmed booking and received-contribution totals come from server records. Security rate limits temporarily use keyed source identifiers; hosting access logs have a separate lifecycle. Essential session cookies and operational records are independent of analytics consent. Do not submit sensitive personal information in public captions or source notes; contact the project with data or rights questions.",
        ar: "تصبح سجلات التحليلات الخام مؤهلة للحذف على دفعات محدودة بعد 90 يوماً، وتُحفظ ملخصات التقارير الشهرية بشكل منفصل. لا تحدد تقديرات الاستخدام الاختيارية أشخاصاً موثّقين ولا تثبت معدل تحويل على مستوى الفرد. تأتي أعداد الحجوزات المؤكدة والمساهمات المستلمة من سجلات الخادم. تستخدم حدود الطلبات الأمنية معرّفات مصدر مشتقة مؤقتاً، ولسجلات وصول الاستضافة دورة حفظ مستقلة. ملفات الجلسات الضرورية والسجلات التشغيلية مستقلة عن الموافقة على التحليلات. تجنّب إدراج بيانات شخصية حساسة في التعليقات أو ملاحظات المصادر، وتواصل مع المشروع بشأن البيانات أو الحقوق.",
      },
    ],
  },
  {
    heading: { en: "Payments and commercial transport", ar: "المدفوعات والنقل التجاري" },
    body: [
      {
        en: "No payment is taken anywhere on this website, and no financial account or card details are requested. Commemorative booking references (PNRs) and boarding passes do not represent commercial flight reservations and cannot be used for travel or presented at any airport counter.",
        ar: "لا يتم تحصيل أي مبالغ مالية في أي قسم من هذا الموقع، ولا يُطلب أي حساب بنكي أو بيانات بطاقة دفع. أرقام الحجوزات التذكارية وبطاقات صعود الطائرة لا تمثل حجوزات طيران تجارية ولا يمكن استخدامها للسفر أو تقديمها في أي مكتب مطار.",
      },
    ],
  },
  {
    heading: { en: "Imagery and archive material", ar: "الصور ومواد الأرشيف" },
    body: [
      {
        en: "Historical images include licensed material and selected owner-supplied copies whose reuse rights remain unconfirmed. Rights remain with their respective owners; credits are shown where known.",
        ar: "تشمل الصور التاريخية مواد مرخّصة ونسخاً مختارة قدّمها مالك المشروع ولم تُثبت حقوق إعادة استخدامها. وتبقى الحقوق لأصحابها، وتُذكر الاعتمادات حيثما كانت معروفة.",
      },
    ],
  },
  {
    heading: { en: "Contacting the project", ar: "التواصل مع المشروع" },
    body: [
      {
        en: "Questions about this project, data handling, or archive contributions can be sent through the contact page.",
        ar: "يمكن إرسال أي استفسارات تتعلق بالمشروع أو معالجة البيانات أو مساهمات الأرشيف من خلال صفحة الاتصال.",
      },
    ],
  },
];

/** Truthful public terms of use reflecting art project scope, commemorative bookings, and no commercial carriage. */
export const termsSections: { heading: LocalizedText; body: LocalizedText[] }[] = [
  {
    heading: { en: "Scope and purpose", ar: "نطاق الاستخدام والغرض" },
    body: [
      {
        en: "These terms cover your use of this website, which is an internet-based art project and digital memorial by Ayman Alazraq representing Gaza International Airport and Palestine Airways Limited. Accessing or using this site indicates your acknowledgment that all services, flight displays, and booking experiences are artistic and commemorative in nature.",
        ar: "تشمل هذه الشروط استخدامك لهذا الموقع، وهو مشروع فني على الإنترنت ونصب تذكاري رقمي لأيمن الأزرق يمثل مطار غزة الدولي وشركة Palestine Airways Limited. يشكل وصولك إلى الموقع أو استخدامه إقراراً بأن جميع الخدمات ومعلومات الرحلات وتجارب الحجز ذات طبيعة فنية وتذكارية.",
      },
    ],
  },
  {
    heading: { en: "Commemorative flight information and bookings", ar: "معلومات الرحلات والحجوزات التذكارية" },
    body: [
      {
        en: "Flight schedules, destinations, aircraft specifications, flight numbers, seat maps, and booking references (PNRs) are artistic representations designed to evoke the passenger experience and advocate for freedom of movement. They do not represent operating commercial flights and must never be relied upon for real-world travel planning.",
        ar: "جداول الرحلات والوجهات ومواصفات الطائرات وأرقام الرحلات ومخططات المقاعد وأرقام الحجز التذكارية هي تمثيلات فنية تهدف إلى محاكاة تجربة المسافر والمطالبة بحرية الحركة. وهي لا تعبر عن رحلات تجارية عاملة ويُحظر الاعتماد عليها لتخطيط سفر حقيقي.",
      },
      {
        en: "Completing a commemorative reservation generates a digital booking record stored in our system for your personal commemorative use. It does not constitute a contract of carriage, ticket, or legal entitlement to travel.",
        ar: "إكمال الحجز التذكاري ينشئ سجلاً رقمياً يُحفظ في نظامنا لغرض تذكاري شخصي؛ ولا يشكل عقد نقل أو تذكرة سفر أو أي حق قانوني في التنقل.",
      },
    ],
  },
  {
    heading: { en: "No commercial transactions or fees", ar: "غياب المعاملات التجارية والرسوم" },
    body: [
      {
        en: "This project is entirely non-commercial. No fares, taxes, baggage fees, or payment transactions are charged or collected. Any price indicators displayed in booking flows are symbolic and create no financial obligation or refund rights.",
        ar: "هذا المشروع غير تجاري بالكامل؛ ولا يتم تقاضي أو تحصيل أي أسعار تذاكر أو ضرائب أو رسوم أمتعة أو معاملات دفع. وأي مبالغ معروضة في خطوات الحجز هي رمزية ولا ترتب أي التزام مالي أو حق في الاسترداد.",
      },
    ],
  },
  {
    heading: { en: "Accounts and verification", ar: "الحسابات والتحقق" },
    body: [
      {
        en: "Account registration and email verification provide access to manage your saved commemorative bookings and traveler preferences. Users must provide accurate contact information for verification purposes and agree not to submit sensitive passwords used on third-party services.",
        ar: "يتيح إنشاء الحساب والتحقق عبر البريد الإلكتروني إدارة حجوزاتك التذكارية المحفوظة وتفضيلات المسافرين. يلتزم المستخدم بتقديم معلومات تواصل صحيحة لأغراض التحقق، مع الامتناع عن إدخال كلمات مرور حساسة مستخدمة في خدمات أخرى.",
      },
    ],
  },
  {
    heading: { en: "Archive submissions and permissions", ar: "مشاركات الأرشيف والتراخيص" },
    body: [
      {
        en: "When submitting materials to the archive, you confirm that you own the rights to the content, have explicit permission to share it, or are submitting it as a reference for private curatorial review. Submission grants the project permission to review materials privately. Public exhibition requires verified rights. Ownership of contributed material remains with original creators and rights holders.",
        ar: "عند تقديم مواد إلى الأرشيف، فإنك تؤكد امتلاكك لحقوق المحتوى، أو حصولك على إذن صريح بمشاركته، أو تقديمه كمرجع للمراجعة التقييمية الخاصة. يمنح التقديم فريق المشروع إذناً بمراجعة المواد بصفة خاصة، في حين يتطلب العرض العام حقوقاً موثقة. وتظل ملكية المواد المشاركة محفوظة لمبدعيها وأصحاب الحقوق الأصليين.",
      },
    ],
  },
  {
    heading: { en: "Content, imagery and the archive", ar: "المحتوى والصور والأرشيف" },
    body: [
      {
        en: "Historical images include licensed material and selected owner-supplied copies whose reuse rights remain unconfirmed. Rights remain with their respective owners; credits are shown where known.",
        ar: "تشمل الصور التاريخية مواد مرخّصة ونسخاً مختارة قدّمها مالك المشروع ولم تُثبت حقوق إعادة استخدامها. وتبقى الحقوق لأصحابها، وتُذكر الاعتمادات حيثما كانت معروفة.",
      },
    ],
  },
  {
    heading: { en: "Changes to the site", ar: "التغييرات على الموقع" },
    body: [
      {
        en: "Because this is an active cultural initiative and digital art piece, features, exhibits, and historical resources may be updated, expanded, or adjusted over time without notice.",
        ar: "نظراً لأن هذا المشروع مبادرة ثقافية نشطة وعمل فني رقمي مستمر، فقد يتم تحديث الخصائص والمعروضات والمصادر التاريخية أو توسيعها أو تعديلها بمرور الوقت دون إشعار مسبق.",
      },
    ],
  },
];

/** Credited artist statement of Ayman Alazraq and nuanced historical/conceptual contextual blocks. */
export const aboutSections: { id: string; heading: LocalizedText; body: LocalizedText[] }[] = [
  {
    id: "about-statement-origin",
    heading: { en: "Origin (2009)", ar: "البداية (2009)" },
    body: [
      {
        en: "In 2009 I launched gazaairport.com as an experience of booking a ticket and imagining a flight. Through the familiar language of online ticket order and purchase, visitors were invited to do something Palestinians are denied: to choose a destination, reserve a seat, and picture themselves departing and arriving freely. The project grew out of a personal wish — that of an immigrant Palestinian who wanted his family to attend his wedding in Oslo, a wish made impossible by the political realities that impose a travel ban on Palestinians. Palestine Airways Limited, realized as an art installation at the Open Academy in 2008, promoted and marketed the total project through a real setup of travel.",
        ar: "في عام 2009 أطلقتُ موقع gazaairport.com كتجربة لحجز تذكرة وتخيّل رحلة طيران. من خلال اللغة المألوفة لطلب التذاكر وشرائها عبر الإنترنت، دُعي الزوار للقيام بما يُحرم منه الفلسطينيون: اختيار وجهة، وحجز مقعد، وتصوّر أنفسهم يغادرون ويصلون بحرية. انبثق المشروع من أمنية شخصية — أمنية فلسطيني مهاجر أراد أن تحضر عائلته حفل زفافه في أوسلو، وهي أمنية استحالت أمام الحقائق السياسية التي تفرض قيود السفر على الفلسطينيين. وقد قامت شركة «Palestine Airways Limited»، التي تحققت كعمل تركيبي فني في الأكاديمية المفتوحة (Open Academy) عام 2008، بالترويج للمشروع الشامل وتسويقه عبر تجهيز واقعي متكامل للسفر.",
      },
    ],
  },
  {
    id: "about-statement-response",
    heading: { en: "Response (now)", ar: "الاستجابة (الآن)" },
    body: [
      {
        en: "Since then, Gaza has been devastated. A genocide is taking place now, and the right of free movement that the project imagined has been replaced, for many, by displacement, siege, and loss. The airport that never fully carried passengers now stands as a symbol of what was taken — and of what must be reclaimed.",
        ar: "منذ ذلك الحين، تعرّضت غزة للدمار. وتجري إبادة جماعية الآن، وحق حرية الحركة الذي تخيّله المشروع استُبدل، لدى كثيرين، بالتهجير والحصار والفقد. إن المطار الذي لم يحمل ركاباً بكامل طاقته يقف اليوم كرمز لما سُلب — ولما يجب استعادته.",
      },
      {
        en: "This remade version of Gaza International Airport responds to what is happening in Gaza today. It does not look away from the destruction. It holds the grief and the anger of stolen movement alongside the insistence that imagination is itself a form of resistance.",
        ar: "تستجيب هذه النسخة المُعاد صياغتها من مطار غزة الدولي لما يجري في غزة اليوم؛ فهي لا تشيح بنظرها عن الدمار، بل تحمل حزن حركة مسلوبة وغضبها إلى جانب الإصرار على أن الخيال في حد ذاته شكل من أشكال المقاومة.",
      },
    ],
  },
  {
    id: "about-statement-forward",
    heading: { en: "Forward (the future)", ar: "إلى الأمام (المستقبل)" },
    body: [
      {
        en: "We will keep imagining our future. We will rebuild Gaza.",
        ar: "سنواصل تخيل مستقبلنا. سنعيد بناء غزة.",
      },
      {
        en: "The booking experience remains — but it is no longer only a wish. It is a promise. Every imagined flight is a claim to the right to move, to return, to live freely. Every ticket is a small act of refusal against erasure.",
        ar: "تبقى تجربة الحجز قائمة — لكنها لم تعد مجرد أمنية؛ بل هي وعد. كل رحلة متخيلة هي مطالبة بالحق في الحركة، وفي العودة، وفي العيش بحرية. كل تذكرة هي فعل رفض صغير ضد المحو.",
      },
    ],
  },
  {
    id: "about-statement-archive",
    heading: { en: "Contribute to the archive", ar: "المساهمة في الأرشيف" },
    body: [
      {
        en: "Gaza International Airport is a shared record — and it belongs to everyone. You are invited to add your own material to this archive:",
        ar: "مطار غزة الدولي سجل مشترك — وهو ملك للجميع. أنتم مدعوون لإضافة موادكم الخاصة إلى هذا الأرشيف:",
      },
      {
        en: "Images and video from Gaza and the airport — historical, contemporary, or personal.",
        ar: "صور ومقاطع فيديو من غزة والمطار — تاريخية أو معاصرة أو شخصية.",
      },
      {
        en: "Imagined designs for the airport — drawings, renderings, sketches, or concepts for what the airport of Gaza could become.",
        ar: "تصاميم متخيلة للمطار — رسومات أو تصورات بصرية أو مخططات لما يمكن أن يصبح عليه مطار غزة.",
      },
      {
        en: "Anything connected to Gaza — memories, documents, artwork, or visions of the future.",
        ar: "أي شيء يرتبط بغزة — ذكريات، أو وثائق، أو أعمال فنية، أو رؤى للمستقبل.",
      },
    ],
  },
  {
    id: "about-statement-how",
    heading: { en: "How to contribute", ar: "كيف تساهم" },
    body: [
      {
        en: "Choose a chapter: Archive (historical) / Contemporary documentation / Imagined future.",
        ar: "اختر فصلاً: الأرشيف (تاريخي) / توثيق معاصر / مستقبل متخيّل.",
      },
      {
        en: "Upload your image or video file.",
        ar: "ارفع ملف الصورة أو الفيديو الخاص بك.",
      },
      {
        en: "Add a short caption, the date (if known), and credit information.",
        ar: "أضف تعليقاً موجزاً، والتاريخ (إن عُرف)، ومعلومات الإسناد وحقوق العمل.",
      },
      {
        en: "Confirm that you have the right to share the material, or that you are sharing it as an archive reference with rights noted.",
        ar: "أكّد أن لديك الحق في مشاركة المادة، أو أنك تشاركها كمرجع أرشيفي مع ذكر الحقوق المرتبطة بها.",
      },
      {
        en: "All contributions are reviewed before appearing in the public archive. Rights in contributed material remain with their respective owners; credits are shown where known.",
        ar: "تخضع جميع المساهمات للمراجعة قبل ظهورها في الأرشيف العام. وتبقى حقوق المواد المشاركة محفوظة لأصحابها، وتُذكر أسماء أصحاب الحقوق حيثما عُرفت.",
      },
    ],
  },
  {
    id: "about-history-context",
    heading: { en: "Airport History & Passenger Operations", ar: "تاريخ المطار والعمليات التجارية للركاب" },
    body: [
      {
        en: "Gaza International Airport (officially Yasser Arafat International Airport) opened in late 1998 as the civil airport serving the Gaza Strip. The airport served as the operational home base for Palestinian Airlines, which carried commercial passengers on scheduled routes to regional destinations following its opening. Historical records, including publications of the Palestinian Central Bureau of Statistics (PCBS), document passenger operations during this operational period.",
        ar: "افتُتح مطار غزة الدولي (المعروف رسمياً باسم مطار ياسر عرفات الدولي) أواخر عام 1998 بصفته المطار المدني الذي يخدم قطاع غزة. وكان المطار المقر التشغيلي للخطوط الجوية الفلسطينية، التي نقلت ركاباً على رحلات تجارية مجدولة إلى وجهات إقليمية عقب افتتاحه. وتوثق السجلات التاريخية، بما في ذلك إصدارات الجهاز المركزي للإحصاء الفلسطيني، حركة الركاب الفعلية خلال تلك الفترة التشغيلية.",
      },
      {
        en: "While the airport briefly carried passengers, it never fulfilled its full promise of permanent, unhindered connectivity for Palestine. The factual history of the airport remains grounded in independently supported records.",
        ar: "ورغم أن المطار حمل ركاباً لفترة وجيزة، إلا أنه لم يُتح له تحقيق وعده الكامل بحرية حركة دائمة وغير مقيدة لفلسطين. ويظل التاريخ الفعلي للمطار مستنداً إلى السجلات المدعومة تاريخياً.",
      },
    ],
  },
  {
    id: "about-conceptual-network",
    heading: { en: "Palestine Airways Limited — An Artistic Conception", ar: "الخطوط الجوية الفلسطينية المحدودة — تصوّر فني" },
    body: [
      {
        en: "According to the artist, Palestine Airways Limited was first realized as an art installation at the Open Academy in 2008, followed by the launch of the gazaairport.com web project in 2009. The airline schedules, destinations, and booking interface presented here do not describe an active commercial carrier.",
        ar: "وفقاً للفنان، تحققت «الخطوط الجوية الفلسطينية المحدودة» (Palestine Airways Limited) أول مرة كعمل تركيبي فني في الأكاديمية المفتوحة عام 2008، تلاها إطلاق مشروع الموقع الإلكتروني gazaairport.com عام 2009. وجداول الرحلات والوجهات وواجهة الحجز المعروضة هنا لا تصف ناقلاً تجارياً نشطاً.",
      },
      {
        en: "Instead, the booking flow and commemorative tickets exist as artistic instruments of imagination and political insistence. Every commemorative ticket generated on this site is a claim to the universal human right of free movement.",
        ar: "بل إن مسار الحجز والتذاكر التذكارية قائمة كأدوات فنية للتخيل والإصرار السياسي؛ وكل تذكرة تذكارية تُصدر من هذا الموقع هي مطالبة بالحق الإنساني العالمي في حرية الحركة.",
      },
    ],
  },
  {
    id: "about-material",
    heading: { en: "About the material", ar: "عن المواد المعروضة" },
    body: [
      {
        en: "Historical images include licensed material and selected owner-supplied copies whose reuse rights remain unconfirmed. Rights remain with their respective owners; credits are shown where known.",
        ar: "تشمل الصور التاريخية مواد مرخّصة ونسخاً مختارة قدّمها مالك المشروع ولم تُثبت حقوق إعادة استخدامها. وتبقى الحقوق لأصحابها، وتُذكر الاعتمادات حيثما كانت معروفة.",
      },
    ],
  },
];

/** Compatibility copy retained for existing readers. */
export const aboutCopy: LocalizedText[] = [
  {
    en: "An internet-based art project by Ayman Alazraq exploring the memory of Gaza International Airport, the Palestinian right of free movement, and the insistence on presence.",
    ar: "مشروع فني على الإنترنت لأيمن الأزرق يبحث في ذاكرة مطار غزة الدولي وحق الفلسطينيين في حرية الحركة والإصرار على الحضور.",
  },
  {
    en: "GZA opened in late 1998 as the civil airport serving Gaza, operating commercial passenger flights until operations ceased.",
    ar: "افتُتح مطار غزة الدولي أواخر عام 1998 بصفته المطار المدني الذي يخدم غزة، وشغّل رحلات ركاب تجارية حتى توقفت العمليات.",
  },
  {
    en: "According to the artist, Palestine Airways Limited was realized as an art installation in 2008, functioning as an artistic framework to explore sovereign travel.",
    ar: "وفقاً للفنان، تحققت الخطوط الجوية الفلسطينية المحدودة كعمل تركيبي فني عام 2008، كإطار فني لبحث السفر السيادي.",
  },
  { en: "About the material", ar: "عن المواد المعروضة" },
  {
    en: "Historical images include licensed material and selected owner-supplied copies whose reuse rights remain unconfirmed. Rights remain with their respective owners; credits are shown where known.",
    ar: "تشمل الصور التاريخية مواد مرخّصة ونسخاً مختارة قدّمها مالك المشروع ولم تُثبت حقوق إعادة استخدامها. وتبقى الحقوق لأصحابها، وتُذكر الاعتمادات حيثما كانت معروفة.",
  },
];
