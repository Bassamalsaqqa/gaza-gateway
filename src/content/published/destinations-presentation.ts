import type { DestinationsPresentationContent } from "../types.ts";

export const publishedDestinationsPresentation: DestinationsPresentationContent = {
  id: "destinations.presentation",
  kind: "destinations.presentation",
  schemaVersion: 1,
  seo: {
    title: {
      en: "Destinations — Palestine Airways Limited from Gaza (GZA)",
      ar: "الوجهات — الخطوط الجوية الفلسطينية من غزة (GZA)",
    },
    description: {
      en: "Explore the Palestine Airways Limited route network from Gaza International Airport: Amman, Cairo, Istanbul, Doha, Dubai, Jeddah and Riyadh.",
      ar: "استكشف شبكة وجهات الخطوط الجوية الفلسطينية من مطار غزة الدولي: عمّان، القاهرة، إسطنبول، الدوحة، دبي، جدة والرياض.",
    },
    socialTitle: {
      en: "Destinations from Gaza International Airport",
      ar: "الوجهات من مطار غزة الدولي",
    },
    socialDescription: {
      en: "Regional and international destinations in the Palestine Airways Limited network.",
      ar: "وجهات إقليمية ودولية في شبكة الخطوط الجوية الفلسطينية الافتتاحية.",
    },
  },
  assignments: [
    { code: "AMM", photoId: "city-amman", focalPoint: { x: 50, y: 50 } },
    { code: "CAI", photoId: "city-cairo", focalPoint: { x: 50, y: 50 } },
    { code: "DOH", photoId: "city-doha", focalPoint: { x: 50, y: 50 } },
    { code: "DXB", photoId: "city-dubai", focalPoint: { x: 50, y: 50 } },
    { code: "IST", photoId: "city-istanbul", focalPoint: { x: 50, y: 50 } },
    { code: "JED", photoId: "city-jeddah", focalPoint: { x: 50, y: 50 } },
    { code: "RUH", photoId: "city-riyadh", focalPoint: { x: 50, y: 50 } },
    { code: "AUH", photoId: "city-abu-dhabi", focalPoint: { x: 65, y: 50 } },
    { code: "ATH", photoId: "city-athens", focalPoint: { x: 55, y: 50 } },
    { code: "BEY", photoId: "city-beirut", focalPoint: { x: 45, y: 55 } },
    { code: "FRA", photoId: "city-frankfurt", focalPoint: { x: 50, y: 50 } },
    { code: "KUL", photoId: "city-kuala-lumpur", focalPoint: { x: 50, y: 45 } },
    { code: "KWI", photoId: "city-kuwait-city", focalPoint: { x: 55, y: 45 } },
    { code: "LHR", photoId: "city-london", focalPoint: { x: 60, y: 50 } },
    { code: "MAD", photoId: "city-madrid", focalPoint: { x: 50, y: 50 } },
    { code: "BOM", photoId: "city-mumbai", focalPoint: { x: 50, y: 40 } },
    { code: "JFK", photoId: "city-new-york", focalPoint: { x: 50, y: 45 } },
    { code: "CDG", photoId: "city-paris", focalPoint: { x: 60, y: 50 } },
    { code: "FCO", photoId: "city-rome", focalPoint: { x: 50, y: 40 } },
    { code: "YYZ", photoId: "city-toronto", focalPoint: { x: 50, y: 52 } },
    { code: "OSL", photoId: "city-oslo", focalPoint: { x: 50, y: 50 } },
    { code: "ARN", photoId: "city-stockholm", focalPoint: { x: 50, y: 50 } },
  ],
};
