/**
 * Locale-aware route metadata.
 *
 * English is the canonical unprefixed path; Arabic lives under /ar.
 * Every page self-references its own canonical URL and declares both
 * language alternates, so the final SEO pass only needs to add the host.
 */

export type HeadCopy = { title: string; description: string };

type PageHeadOptions = {
  locale?: string | undefined;
  /** Canonical English path, e.g. "/destinations" or "/manage/ABC123". */
  path: string;
  en: HeadCopy;
  ar?: HeadCopy;
  ogType?: string;
  noindex?: boolean;
};

export function arPath(path: string): string {
  return path === "/" ? "/ar" : `/ar${path}`;
}

export function pageHead(options: PageHeadOptions) {
  const lang = options.locale === "ar" ? "ar" : "en";
  const copy = lang === "ar" ? (options.ar ?? options.en) : options.en;
  const enHref = options.path;
  const arHref = arPath(options.path);
  const self = lang === "ar" ? arHref : enHref;

  const meta: Array<Record<string, string>> = [
    { title: copy.title },
    { name: "description", content: copy.description },
    { property: "og:title", content: copy.title },
    { property: "og:description", content: copy.description },
    { property: "og:type", content: options.ogType ?? "website" },
    { property: "og:url", content: self },
    { property: "og:locale", content: lang === "ar" ? "ar_PS" : "en" },
    { name: "twitter:card", content: "summary" },
  ];
  if (options.noindex) meta.push({ name: "robots", content: "noindex" });

  return {
    meta,
    links: [
      { rel: "canonical", href: self },
      { rel: "alternate", hrefLang: "en", href: enHref },
      { rel: "alternate", hrefLang: "ar", href: arHref },
      { rel: "alternate", hrefLang: "x-default", href: enHref },
    ],
  };
}
