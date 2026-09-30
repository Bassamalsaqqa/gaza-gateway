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
  },

  "src-ap-1998-opening": {
    id: "src-ap-1998-opening",
    title: "Palestinians Walking on Air At Opening of Gaza Airport (The New York Times / Deborah Sontag)",
    titleAr: "افتتاح مطار غزة الدولي وانطلاق الرحلات التجارية الأولى (نيويورك تايمز)",
    publisher: "The New York Times",
    type: "press",
    language: "en",
    publicationDate: "1998-11-25",
    eventDate: "1998-11-24",
    url: "https://www.nytimes.com/1998/11/25/world/palestinians-walking-on-air-at-opening-of-gaza-airport.html",
    archivalStatus: "live",
    notes: "Contemporary press report documenting the inaugural commercial flights on November 24, 1998, published in The New York Times on November 25, 1998.",
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
  },
};

export function getSourceRecordById(id: string): SourceRecord | undefined {
  return SOURCE_REGISTRY[id];
}

export function getAllSourceRecords(): SourceRecord[] {
  return Object.values(SOURCE_REGISTRY);
}
