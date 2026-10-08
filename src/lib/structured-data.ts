/**
 * Gaza Gateway — Truthful schema.org Structured Data
 *
 * Grounded in historical documentary truth for Gaza International Airport (GZA / LVGZ)
 * and Palestinian Airlines (PS).
 * - Never publishes simulated or mock commercial booking offers as live airline inventory.
 * - Accurately documents historical civil aviation operations (1998–2001) and archive provenance.
 * - Illustrative future architectural concepts are explicitly attributed as CreativeWork concepts.
 */

export const SITE_ORIGIN = "https://www.gazaairport.com";

export function toAbsoluteUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_ORIGIN}${normalized}`;
}

/**
 * Historical truth for Gaza International Airport (Yasser Arafat International Airport).
 * Civil aviation airport in Rafah, Gaza Strip, opened in 1998, closed in 2001. Currently inactive.
 */
export function getAirportSchema(lang: "en" | "ar" = "en") {
  const isAr = lang === "ar";
  return {
    "@context": "https://schema.org",
    "@type": "Airport",
    "@id": `${SITE_ORIGIN}/#airport`,
    name: isAr
      ? "مطار غزة الدولي (مطار ياسر عرفات الدولي)"
      : "Gaza International Airport (Yasser Arafat International Airport)",
    alternateName: [
      "Yasser Arafat International Airport",
      "Gaza International Airport",
      "مطار ياسر عرفات الدولي",
      "مطار غزة الدولي",
    ],
    iataCode: "GZA",
    icaoCode: "LVGZ",
    description: isAr
      ? "مطار غزة الدولي (مطار ياسر عرفات الدولي) افتتح عام 1998 كبوابة جوية مدنية لفلسطين في رفح، قطاع غزة. مغلق حالياً."
      : "Gaza International Airport (Yasser Arafat International Airport) opened in 1998 as Palestine's civil aviation gateway in Rafah, Gaza Strip. Currently inactive.",
    address: {
        "@type": "PostalAddress",
        addressLocality: isAr ? "رفح" : "Rafah",
        addressRegion: isAr ? "قطاع غزة" : "Gaza Strip",
        addressCountry: "PS",
    },
    url: SITE_ORIGIN,
  };
}

/**
 * Historical truth for Palestinian Airlines (flag carrier of Palestine).
 */
export function getAirlineSchema(lang: "en" | "ar" = "en") {
  const isAr = lang === "ar";
  return {
    "@context": "https://schema.org",
    "@type": "Airline",
    "@id": `${SITE_ORIGIN}/#airline`,
    name: isAr ? "الخطوط الجوية الفلسطينية" : "Palestinian Airlines",
    alternateName: isAr ? "Palestinian Airlines" : "الخطوط الجوية الفلسطينية",
    iataCode: "PS",
    description: isAr
      ? "الناقل الوطني التاريخي لدولة فلسطين، ارتبط تاريخياً بعمليات مطار غزة الدولي."
      : "The national flag carrier of Palestine, historically operating scheduled passenger services from Gaza International Airport.",
    url: SITE_ORIGIN,
  };
}

/**
 * WebSite schema for Gaza Gateway.
 */
export function getWebSiteSchema(lang: "en" | "ar" = "en") {
  const isAr = lang === "ar";
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_ORIGIN}/#website`,
    url: SITE_ORIGIN,
    name: isAr
      ? "مطار غزة الدولي والخطوط الجوية الفلسطينية"
      : "Gaza International Airport & Palestinian Airlines",
    description: isAr
      ? "الأرشيف التوثيقي والسرد التاريخي ورؤية المستقبل لمطار غزة الدولي والخطوط الجوية الفلسطينية."
      : "Documentary archive, historical record and future vision of Gaza International Airport and Palestinian Airlines.",
    inLanguage: ["en", "ar"],
  };
}

/**
 * BreadcrumbList schema for hierarchical navigation.
 */
export function getBreadcrumbSchema(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: toAbsoluteUrl(item.path),
    })),
  };
}

/**
 * Documentary Article schema for curated historical / informational chapters.
 */
export function getArticleSchema(options: {
  title: string;
  description: string;
  url: string;
  lang: "en" | "ar";
  datePublished?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: options.title,
    description: options.description,
    url: toAbsoluteUrl(options.url),
    inLanguage: options.lang,
    ...(options.datePublished ? { datePublished: options.datePublished } : {}),
  };
}

/**
 * CreativeWork schema for illustrative future architectural concepts.
 * Never represents illustrative concepts as historical facts or real facilities.
 */
export function getCreativeWorkSchema(options: {
  title: string;
  description: string;
  url: string;
  lang: "en" | "ar";
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: options.title,
    description: options.description,
    url: toAbsoluteUrl(options.url),
    inLanguage: options.lang,
    genre: "Illustrative Architectural Concept",
  };
}
