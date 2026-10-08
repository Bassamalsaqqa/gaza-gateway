/**
 * Locale-aware route metadata and SEO foundation.
 *
 * Grounded in canonical site origin https://www.gazaairport.com.
 * English is the canonical unprefixed path; Arabic lives under /ar.
 * Every page self-references its canonical URL and declares reciprocal
 * language alternates for public indexable surfaces.
 * Private, admin, account, and booking surfaces are marked noindex.
 */

export const SITE_ORIGIN = "https://www.gazaairport.com";

export function toAbsoluteUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_ORIGIN}${normalized}`;
}

export type HeadCopy = {
  title: string;
  description: string;
  socialTitle?: string | undefined;
  socialDescription?: string | undefined;
};

export type PageHeadOptions = {
  locale?: string | undefined;
  /** Canonical English path, e.g. "/" or "/destinations" or "/manage". */
  path: string;
  en?: HeadCopy | undefined;
  ar?: HeadCopy | undefined;
  title?: string | undefined;
  description?: string | undefined;
  socialTitle?: string | undefined;
  socialDescription?: string | undefined;
  ogType?: string | undefined;
  noindex?: boolean | string | undefined;
  image?: string | undefined;
  imageAlt?: string | undefined;
  twitterCard?: "summary" | "summary_large_image" | undefined;
  schema?: Record<string, unknown> | Array<Record<string, unknown>> | undefined;
};

export function stripArabicPrefix(path: string): string {
  if (path === "/ar" || path === "ar") return "/";
  if (path.startsWith("/ar/")) return path.slice(3) || "/";
  if (path.startsWith("ar/")) return `/${path.slice(3)}`;
  return path.startsWith("/") ? path : `/${path}`;
}

export function arPath(path: string): string {
  const clean = stripArabicPrefix(path);
  return clean === "/" ? "/ar" : `/ar${clean}`;
}

export function canonicalUrl(path: string, locale?: string): string {
  const lang = locale === "ar" ? "ar" : "en";
  const cleanPath = stripArabicPrefix(path);
  return toAbsoluteUrl(lang === "ar" ? arPath(cleanPath) : cleanPath);
}

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function pageHead(options: PageHeadOptions) {
  const lang = options.locale === "ar" ? "ar" : "en";
  const enCopy: HeadCopy = options.en ?? {
    title: options.title ?? "",
    description: options.description ?? "",
    ...(options.socialTitle !== undefined ? { socialTitle: options.socialTitle } : {}),
    ...(options.socialDescription !== undefined ? { socialDescription: options.socialDescription } : {}),
  };
  const arCopy: HeadCopy = options.ar ?? enCopy;
  const copy = lang === "ar" ? arCopy : enCopy;

  // Normalize path to unprefixed English route
  const normalizedPath = stripArabicPrefix(options.path);

  const enHref = toAbsoluteUrl(normalizedPath);
  const arHref = toAbsoluteUrl(arPath(normalizedPath));
  const self = lang === "ar" ? arHref : enHref;

  const socialTitle = copy.socialTitle ?? copy.title;
  const socialDescription = copy.socialDescription ?? copy.description;

  const meta: Array<Record<string, string>> = [
    { title: copy.title },
    { name: "description", content: copy.description },
    { property: "og:title", content: socialTitle },
    { property: "og:description", content: socialDescription },
    { property: "og:type", content: options.ogType ?? "website" },
    { property: "og:url", content: self },
    { property: "og:locale", content: lang === "ar" ? "ar_PS" : "en" },
    { property: "og:site_name", content: lang === "ar" ? "مطار غزة الدولي" : "Gaza International Airport" },
    { name: "twitter:card", content: options.twitterCard ?? (options.image ? "summary_large_image" : "summary") },
  ];

  if (options.image) {
    const imageUrl = toAbsoluteUrl(options.image);
    meta.push(
      { property: "og:image", content: imageUrl },
      { name: "twitter:image", content: imageUrl },
    );
    if (options.imageAlt) {
      meta.push({ property: "og:image:alt", content: options.imageAlt });
    }
  }

  if (options.noindex) {
    meta.push({
      name: "robots",
      content: typeof options.noindex === "string" ? options.noindex : "noindex, nofollow",
    });
  }

  const links: Array<Record<string, string>> = [
    { rel: "canonical", href: self },
  ];

  if (!options.noindex) {
    links.push(
      { rel: "alternate", hreflang: "en", hrefLang: "en", href: enHref },
      { rel: "alternate", hreflang: "ar", hrefLang: "ar", href: arHref },
      { rel: "alternate", hreflang: "x-default", hrefLang: "x-default", href: enHref },
    );
  }

  const scripts: Array<Record<string, string>> = [];
  if (options.schema) {
    scripts.push({
      type: "application/ld+json",
      children: serializeJsonLd(options.schema),
    });
  }

  return {
    meta,
    links,
    ...(scripts.length ? { scripts } : {}),
  };
}
