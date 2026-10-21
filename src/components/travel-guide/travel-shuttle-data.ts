/**
 * Gaza Gateway — Heritage Shuttle Network Data & Constants
 *
 * Concise conceptual overland shuttle network envisioning connections
 * between Gaza International Airport (GZA) and historic Palestinian regional hubs.
 *
 * General archive inspiration: pre-Nakba transportation company archives (96 records)
 * on PalestineRemembered.com:
 * https://www.palestineremembered.com/tags/Transportation-Co..html
 */

export interface HeritageShuttleCity {
  id: "jaffa" | "ramallah" | "hebron" | "nablus" | "jerusalem" | "haifa";
  name: { en: string; ar: string };
  corridor: { en: string; ar: string };
  concept: { en: string; ar: string };
}

export const HERITAGE_SHUTTLE_ARCHIVE_URL =
  "https://www.palestineremembered.com/tags/Transportation-Co..html";

export const HERITAGE_SHUTTLE_RECORD_COUNT = 96;

export const HERITAGE_SHUTTLE_CITIES: readonly HeritageShuttleCity[] = [
  {
    id: "jaffa",
    name: { en: "Jaffa", ar: "يافا" },
    corridor: { en: "Coastal Route", ar: "المسار الساحلي" },
    concept: {
      en: "Envisioning direct coastal shuttle connection northward to the historic port city of Jaffa.",
      ar: "رؤية لربط ساحلي مباشر شمالاً باتجاه مدينة وميناء يافا العريق.",
    },
  },
  {
    id: "ramallah",
    name: { en: "Ramallah", ar: "رام الله" },
    corridor: { en: "Central Highlands", ar: "مرتفعات الوسط" },
    concept: {
      en: "Envisioning overland links between the southern gateway and the cultural hub of Ramallah.",
      ar: "تصور لربط بري بين البوابة الجنوبية والمركز الثقافي في رام الله.",
    },
  },
  {
    id: "hebron",
    name: { en: "Hebron", ar: "الخليل" },
    corridor: { en: "Southern Ridge", ar: "محور الجنوب" },
    concept: {
      en: "Envisioning a direct southern shuttle ascending to the historic market city of Hebron.",
      ar: "رؤية لخط ربط بري صاعد نحو أسواق وأحياء مدينة الخليل التاريخية.",
    },
  },
  {
    id: "nablus",
    name: { en: "Nablus", ar: "نابلس" },
    corridor: { en: "Northern Valleys", ar: "وديان الشمال" },
    concept: {
      en: "Envisioning a scenic overland corridor reaching the historic crossroads of Nablus.",
      ar: "تصور لمسار بري يمتد عبر الوديان وصولاً إلى ملتقى التجارة العريق في نابلس.",
    },
  },
  {
    id: "jerusalem",
    name: { en: "Jerusalem", ar: "القدس" },
    corridor: { en: "Capital Corridor", ar: "مسار العاصمة" },
    concept: {
      en: "A memorial tribute to historic intercity transit, envisioning direct ground connection to Jerusalem.",
      ar: "تحية لخطوط النقل التاريخية، واستشراف لربط بري مباشر وسريع بالقدس الشريف.",
    },
  },
  {
    id: "haifa",
    name: { en: "Haifa", ar: "حيفا" },
    corridor: { en: "Northern Coast", ar: "الساحل الشمالي" },
    concept: {
      en: "Envisioning a continuous Mediterranean coastal route linking Gaza all the way to Haifa.",
      ar: "رؤية لمحور ساحلي متصل على امتداد البحر المتوسط يربط غزة بحيفا.",
    },
  },
];
