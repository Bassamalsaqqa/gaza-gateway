import type { PageSeoContent } from "./types.ts";

/** Static route heads consume compiled content only; local drafts cannot publish metadata. */
export function compiledContentHead(seo: PageSeoContent, locale: string | undefined, summaryCard = false) {
  const lang = locale === "ar" ? "ar" : "en";
  return { meta: [
    { title: seo.title[lang] },
    { name: "description", content: seo.description[lang] },
    { property: "og:title", content: (seo.socialTitle ?? seo.title)[lang] },
    { property: "og:description", content: (seo.socialDescription ?? seo.description)[lang] },
    ...(summaryCard ? [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] : []),
  ] };
}
