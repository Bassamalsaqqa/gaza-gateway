import { en, ar } from "../../lib/i18n-public.ts";
import type { AirportFutureContent, FutureCopyKey, LocalizedText } from "../types.ts";

// Preserve accepted public copy. Media captions and the mandatory illustrative disclosure
// stay under their existing media/presentation authority and cannot be changed by this draft.
const keys: Record<FutureCopyKey, string> = {
  title: "airport.future", subtitle: "airport.futureSubtitle", notice: "airport.futureNotice",
  terminalTitle: "airport.themeTerminalTitle", terminalBody: "airport.themeTerminalBody",
  hospitalityTitle: "airport.themeHospitalityTitle", hospitalityBody: "airport.themeHospitalityBody",
  masterplanTitle: "airport.themeMasterplanTitle", masterplanBody: "airport.themeMasterplanBody",
  networkTitle: "airport.networkTitle", networkBody: "airport.networkBody",
};
const copy = Object.fromEntries(Object.entries(keys).map(([id, key]) => [id, { en: en[key], ar: ar[key] }])) as Record<FutureCopyKey, LocalizedText>;

export const publishedAirportFuture: AirportFutureContent = {
  id: "airport.future", kind: "airport.future", schemaVersion: 1,
  seo: {
    title: { en: "The future — vision for Gaza International Airport", ar: "المستقبل — رؤية مطار غزة الدولي" },
    description: {
      en: "Concepts for a reopened Gaza International Airport: terminal proposals, masterplan thinking, future passenger experience and a growing route network.",
      ar: "تصورات لإعادة افتتاح مطار غزة الدولي: مقترحات مبنى الركاب والمخطط العام وتجربة المسافرين المستقبلية وشبكة الوجهات.",
    },
    socialTitle: { en: "The future — Gaza International Airport", ar: "المستقبل — مطار غزة الدولي" },
    socialDescription: { en: "Terminal concepts, masterplan and future passenger experience.", ar: "تصورات مبنى الركاب والمخطط العام وتجربة المسافر المستقبلية." },
  },
  copy,
};
