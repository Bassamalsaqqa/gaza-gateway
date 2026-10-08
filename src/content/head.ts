import type { PageSeoContent } from "./types.ts";

const SITE_ORIGIN = "https://www.gazaairport.com";

function toAbsolute(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_ORIGIN}${normalized}`;
}

function stripArabicPrefix(path: string): string {
  if (path === "/ar" || path === "ar") return "/";
  if (path.startsWith("/ar/")) return path.slice(3) || "/";
  if (path.startsWith("ar/")) return `/${path.slice(3)}`;
  return path.startsWith("/") ? path : `/${path}`;
}

function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function toAr(path: string): string {
  const clean = stripArabicPrefix(path);
  return clean === "/" ? "/ar" : `/ar${clean}`;
}

/** Static route heads consume compiled content only; local drafts cannot publish metadata. */
export function compiledContentHead(
  seo: PageSeoContent,
  locale: string | undefined,
  summaryCard = false,
  path?: string,
  extra?: {
    schema?: Record<string, unknown> | Array<Record<string, unknown>>;
    image?: string;
    imageAlt?: string;
  },
) {
  const lang = locale === "ar" ? "ar" : "en";
  const rawPath = path ? stripArabicPrefix(path) : undefined;
  const normalizedPath = rawPath ? (rawPath.startsWith("/") ? rawPath : `/${rawPath}`) : undefined;

  const enHref = normalizedPath ? toAbsolute(normalizedPath) : undefined;
  const arHref = normalizedPath ? toAbsolute(toAr(normalizedPath)) : undefined;
  const self = normalizedPath ? (lang === "ar" ? arHref! : enHref!) : undefined;

  const meta: Array<Record<string, string>> = [
    { title: seo.title[lang] },
    { name: "description", content: seo.description[lang] },
    { property: "og:title", content: (seo.socialTitle ?? seo.title)[lang] },
    { property: "og:description", content: (seo.socialDescription ?? seo.description)[lang] },
    ...(summaryCard
      ? [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }]
      : [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }]),
    ...(self ? [{ property: "og:url", content: self }] : []),
    { property: "og:locale", content: lang === "ar" ? "ar_PS" : "en" },
    { property: "og:site_name", content: lang === "ar" ? "مطار غزة الدولي" : "Gaza International Airport" },
  ];

  if (extra?.image) {
    const imageUrl = toAbsolute(extra.image);
    meta.push(
      { property: "og:image", content: imageUrl },
      { name: "twitter:image", content: imageUrl },
    );
    if (extra.imageAlt) {
      meta.push({ property: "og:image:alt", content: extra.imageAlt });
    }
  }

  const links: Array<Record<string, string>> = [];
  if (self && enHref && arHref) {
    links.push(
      { rel: "canonical", href: self },
      { rel: "alternate", hrefLang: "en", href: enHref },
      { rel: "alternate", hrefLang: "ar", href: arHref },
      { rel: "alternate", hrefLang: "x-default", href: enHref },
    );
  }

  const scripts: Array<Record<string, string>> = [];
  if (extra?.schema) {
    scripts.push({
      type: "application/ld+json",
      children: serializeJsonLd(extra.schema),
    });
  }

  return {
    meta,
    ...(links.length ? { links } : {}),
    ...(scripts.length ? { scripts } : {}),
  };
}
