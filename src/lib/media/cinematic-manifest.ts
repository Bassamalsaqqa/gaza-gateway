/**
 * Gaza Gateway — Future Airport Cinematic Manifest & Provenance Registry
 *
 * Invariant: Visualized future concepts are strictly illustrative and classified as
 * 'future-concept-ai'. They must NEVER be presented as historical documentary records
 * or active flight operations. No 4K, morph-from-sketch, or solar orientation claims.
 */


export interface CinematicVideoDerivative {
  src: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  gopFrames: number;
  keyframeCount: number;
  crf: number;
  fileSizeBytes: number;
  sha256: string;
  hasAudio: boolean;
  faststart: boolean;
}

export interface CinematicMobileFraming {
  video: CinematicVideoDerivative;
  poster: CinematicManifest["poster"];
  /** Pixel coordinates in the 1280 x 720 master, before any downscale. */
  sourceCrop: { x: number; y: number; width: number; height: number };
}

export interface CinematicMilestoneStill {
  key: "daylight" | "sunset" | "twilight" | "night";
  src: string;
  timestampSeconds: number;
  width: number;
  height: number;
  fileSizeBytes: number;
  sha256: string;
  labelEn: string;
  labelAr: string;
  captionEn: string;
  captionAr: string;
}

export interface CinematicPhase {
  id: "daylight" | "sunset" | "twilight" | "night";
  progressStart: number;
  progressEnd: number;
  numeral: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
}

export interface CinematicManifest {
  sourceFingerprint: {
    originalFilename: string;
    fileSizeBytes: number;
    sha256: string;
    width: number;
    height: number;
    durationSeconds: number;
    fps: number;
    audio: string;
  };
  truthClass: "future-concept-ai";
  disclosure: {
    en: string;
    ar: string;
  };
  poster: {
    src: string;
    width: number;
    height: number;
    fileSizeBytes: number;
    sha256: string;
    altEn: string;
    altAr: string;
  };
  derivatives: {
    standard540p: CinematicVideoDerivative;
    desktop720p: CinematicVideoDerivative;
  };
  /** Authored crops from the same immutable master; desktop assets stay unchanged. */
  mobilePortrait: CinematicMobileFraming;
  mobileLandscape: CinematicMobileFraming;
  milestones: Record<"daylight" | "sunset" | "twilight" | "night", CinematicMilestoneStill>;
  phases: readonly CinematicPhase[];
  experimentalFrameSequence: {
    frameCount: number;
    fps: number;
    width: number;
    height: number;
    quality: number;
    totalSizeBytes: number;
  };
}

/**
 * 5 selected stills content hash aggregate:
 * Combines poster + 4 milestones (daylight, sunset, twilight, night).
 * Computed as SHA-256 of the concatenated lowercase hexadecimal hashes, in the order below:
 *   poster:   b96f7680d9f36e8ce97d30d5f0bd518b3e672fbc95e2e33461bc7bb037ad63f4
 *   daylight: 652ae1be94612a038d088b74c6b446a578e034eddd804d72dce07d5941138081
 *   sunset:   65e699de8c9a34f38a4178f771c7535a02eb067c585b074c129afc427d249e95
 *   twilight: 8eda898616338c940802525f62ab0b33c57d8905eaebf3ef04cdc3a474a3699d
 *   night:    e9fbd13f7c30cfbaea8c2940223e61deb80e13d2644297b87e661cec3577b633
 * Aggregate SHA-256: d66699d4370a396a946bf81ab55e225841920237cb13b9faa62fc6fd67c7b34e
 * This ensures the public version updates whenever any milestone or poster changes.
 */
export const CINEMATIC_STILLS_AGGREGATE_HASH = "d66699d4370a396a946bf81ab55e225841920237cb13b9faa62fc6fd67c7b34e";
export const CINEMATIC_PUBLIC_VERSION = `v-${CINEMATIC_STILLS_AGGREGATE_HASH.slice(0, 8)}`;

export const CINEMATIC_MANIFEST: CinematicManifest = {
  sourceFingerprint: {
    originalFilename: "Gaza-Airport-Video.mp4",
    fileSizeBytes: 3912780,
    sha256: "ec8b8b5f34dbb3b223b5115ac2e09426f89868463be0c7c2e94847b84a9d5f00",
    width: 1280,
    height: 720,
    durationSeconds: 8.0,
    fps: 24,
    audio: "aac (LC), 48000 Hz, stereo",
  },
  truthClass: "future-concept-ai",
  disclosure: {
    en: "Visualized future concept generated with AI, not real-current conditions or live airport operations.",
    ar: "تصوّر توضيحي لمفهوم مستقبلي مولّد بالذكاء الاصطناعي، وليس واقعاً حالياً أو عمليات تشغيلية.",
  },
  poster: {
    src: `/media/future/cinematic/${CINEMATIC_PUBLIC_VERSION}/future-cinematic-poster.webp`,
    width: 960,
    height: 540,
    fileSizeBytes: 70790,
    sha256: "b96f7680d9f36e8ce97d30d5f0bd518b3e672fbc95e2e33461bc7bb037ad63f4",
    altEn: "Architectural aerial concept of the future Gaza International Airport terminal and coastal runway",
    altAr: "تصوّر معماري جوي لمبنى مطار غزة الدولي المستقبلي والمدرج الساحلي",
  },
  derivatives: {
    standard540p: {
      src: "/media/future/cinematic/mp4-c5c8afff/scrub-540p-g4-crf25.mp4",
      width: 960,
      height: 540,
      fps: 24,
      durationSeconds: 8.0,
      gopFrames: 4,
      keyframeCount: 48,
      crf: 25,
      fileSizeBytes: 2998317,
      sha256: "c5c8afff38af8568bb7cba08bbadae6f791404e3967815db70cff2f26694765f",
      hasAudio: false,
      faststart: true,
    },
    desktop720p: {
      src: "/media/future/cinematic/mp4-7cb9fe96/scrub-720p-g6-crf25.mp4",
      width: 1280,
      height: 720,
      fps: 24,
      durationSeconds: 8.0,
      gopFrames: 6,
      keyframeCount: 32,
      crf: 25,
      fileSizeBytes: 3487542,
      sha256: "7cb9fe9613161c08b6505d14e65c78fc6d068add0324e90bad6861845b595089",
      hasAudio: false,
      faststart: true,
    },
  },
  mobilePortrait: {
    "video": {
      "src": "/media/future/cinematic/mobile-7f4323c0/mobile-portrait.mp4",
      "width": 378,
      "height": 672,
      "fileSizeBytes": 1502795,
      "sha256": "7f4323c07ea7ed1024fd52e71045c464eb9d3e9e3c9eae79f527019269b52747",
      "fps": 24,
      "durationSeconds": 8.0,
      "gopFrames": 4,
      "keyframeCount": 48,
      "crf": 25,
      "hasAudio": false,
      "faststart": true
    },
    "poster": {
      "src": "/media/future/cinematic/mobile-4d93a238/mobile-portrait.webp",
      "width": 378,
      "height": 672,
      "fileSizeBytes": 43448,
      "sha256": "4d93a2389481d1a3fbb66258c57ce32619873c411bef447808eccec7a17560c1",
      "altEn": "Illustrative future airport terminal and control tower, framed for mobile portrait",
      "altAr": "تصوّر توضيحي لمبنى المطار المستقبلي وبرج المراقبة"
    },
    "sourceCrop": {
      "x": 562,
      "y": 24,
      "width": 378,
      "height": 672
    }
  },
  mobileLandscape: {
    "video": {
      "src": "/media/future/cinematic/mobile-ccf5d232/mobile-landscape.mp4",
      "width": 960,
      "height": 504,
      "fileSizeBytes": 2925325,
      "sha256": "ccf5d232dc7cff439d08dedba6ca59bf66f0fd24015ffa8ae0d1418e0f0b85ea",
      "fps": 24,
      "durationSeconds": 8.0,
      "gopFrames": 4,
      "keyframeCount": 48,
      "crf": 25,
      "hasAudio": false,
      "faststart": true
    },
    "poster": {
      "src": "/media/future/cinematic/mobile-a7f9e809/mobile-landscape.webp",
      "width": 960,
      "height": 504,
      "fileSizeBytes": 79120,
      "sha256": "a7f9e809b91823b680cb1ba3b2ae68e61d3077b27b09ee0eeef957cd71670a13",
      "altEn": "Illustrative future airport terminal and control tower, framed for mobile landscape",
      "altAr": "تصوّر توضيحي لمبنى المطار المستقبلي وبرج المراقبة"
    },
    "sourceCrop": {
      "x": 0,
      "y": 24,
      "width": 1280,
      "height": 672
    }
  },
  milestones: {
    daylight: {
      key: "daylight",
      src: `/media/future/cinematic/${CINEMATIC_PUBLIC_VERSION}/milestone-daylight.webp`,
      timestampSeconds: 0.8,
      width: 960,
      height: 540,
      fileSizeBytes: 72488,
      sha256: "652ae1be94612a038d088b74c6b446a578e034eddd804d72dce07d5941138081",
      labelEn: "Daylight Aerial",
      labelAr: "الرؤية النهارية",
      captionEn: "Midday sun illuminates the terminal canopy and aircraft parking stands.",
      captionAr: "شمس الظهيرة تضيء المظلة الهندسية للمبنى ومواقف الطائرات.",
    },
    sunset: {
      key: "sunset",
      src: `/media/future/cinematic/${CINEMATIC_PUBLIC_VERSION}/milestone-sunset.webp`,
      timestampSeconds: 3.0,
      width: 960,
      height: 540,
      fileSizeBytes: 48144,
      sha256: "65e699de8c9a34f38a4178f771c7535a02eb067c585b074c129afc427d249e95",
      labelEn: "Mediterranean Sunset",
      labelAr: "غروب الشمس",
      captionEn: "Warm sunset light across the terminal structures and taxiways.",
      captionAr: "غروب دافئ ينعكس على هيكل المبنى وممرات التدريج.",
    },
    twilight: {
      key: "twilight",
      src: `/media/future/cinematic/${CINEMATIC_PUBLIC_VERSION}/milestone-twilight.webp`,
      timestampSeconds: 5.0,
      width: 960,
      height: 540,
      fileSizeBytes: 46748,
      sha256: "8eda898616338c940802525f62ab0b33c57d8905eaebf3ef04cdc3a474a3699d",
      labelEn: "Coastal Twilight",
      labelAr: "حلول الشفق",
      captionEn: "Twilight descending with taxiway and airfield guidance lighting activated.",
      captionAr: "حلول الشفق مع إضاءة ممرات التدريج والساحة الجوية.",
    },
    night: {
      key: "night",
      src: `/media/future/cinematic/${CINEMATIC_PUBLIC_VERSION}/milestone-night.webp`,
      timestampSeconds: 7.2,
      width: 960,
      height: 540,
      fileSizeBytes: 45176,
      sha256: "e9fbd13f7c30cfbaea8c2940223e61deb80e13d2644297b87e661cec3577b633",
      labelEn: "Illuminated Night",
      labelAr: "الإضاءة الليلية",
      captionEn: "Illuminated nighttime airfield and terminal concept.",
      captionAr: "تصوّر للساحة الجوية ومبنى الركاب في الإضاءة الليلية.",
    },
  },
  phases: [
    {
      id: "daylight",
      progressStart: 0.0,
      progressEnd: 0.25,
      numeral: "01",
      titleEn: "Daylight Aerial",
      titleAr: "شمس الظهيرة",
      descriptionEn: "Sunlight over the architectural terminal and coastal airfield",
      descriptionAr: "شمس الظهيرة فوق مبنى الركاب والساحة الجوية الساحلية",
    },
    {
      id: "sunset",
      progressStart: 0.25,
      progressEnd: 0.5,
      numeral: "02",
      titleEn: "Mediterranean Sunset",
      titleAr: "الغروب المتوسطي",
      descriptionEn: "Warm golden light sweeping across the apron and taxiways",
      descriptionAr: "ضوء ذهبي دافئ يغمر ساحة الطائرات وممرات التدريج",
    },
    {
      id: "twilight",
      progressStart: 0.5,
      progressEnd: 0.75,
      numeral: "03",
      titleEn: "Coastal Twilight",
      titleAr: "شفق الساحل",
      descriptionEn: "Airfield guidance and apron floodlights begin illuminating",
      descriptionAr: "حلول الشفق مع إضاءة إشارات المدرج وساحة الوقوف",
    },
    {
      id: "night",
      progressStart: 0.75,
      progressEnd: 1.0,
      numeral: "04",
      titleEn: "Illuminated Night",
      titleAr: "الإضاءة الليلية",
      descriptionEn: "Illuminated evening airfield and passenger terminal concept",
      descriptionAr: "تصوّر للساحة الجوية ومبنى المسافرين في المساء المضاء",
    },
  ],
  experimentalFrameSequence: {
    frameCount: 96,
    fps: 12,
    width: 960,
    height: 540,
    quality: 47,
    totalSizeBytes: 3660710,
  },
};
