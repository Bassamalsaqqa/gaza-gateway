import { compiledContentHead } from "@/content/head";
import { Fragment } from "react";
import { publishedInformationPages } from "@/content/published/information-pages";
import { ContentPreviewNotice, useContentPreview } from "@/content/preview";
import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { btnClass, Code, Container, PageHeader, Panel } from "@/components/kit";
import { ResponsiveImage } from "@/components/responsive-image";
import { AIRLINE, destinations } from "@/lib/data";
import { pick, useI18n } from "@/lib/i18n";

import { getArticleSchema, getBreadcrumbSchema } from "@/lib/structured-data";

export const Route = createFileRoute("/{-$locale}/about")({
  head: ({ params }) => {
    const isAr = params.locale === "ar";
    const lang = isAr ? "ar" : "en";
    const seo = publishedInformationPages.pages.find((page) => page.id === "about")!.seo;
    return compiledContentHead(seo, params.locale, false, "/about", {
      image: "/social/gaza-airport.jpg",
      schema: [
        getArticleSchema({
          title: seo.title[lang],
          description: seo.description[lang],
          url: isAr ? "/ar/about" : "/about",
          lang,
        }),
        getBreadcrumbSchema([
          { name: isAr ? "الرئيسية" : "Home", path: isAr ? "/ar" : "/" },
          { name: isAr ? "عن المطار" : "About", path: isAr ? "/ar/about" : "/about" },
        ]),
      ],
    });
  },
  component: AboutPage,
});

function AboutPage() {
  const { t, lang } = useI18n();
  const { content, previewing, previewError, previewLoading } = useContentPreview("pages.information", publishedInformationPages);
  const page = content.pages.find((entry) => entry.id === "about")!;
  const blocks = page.blocks.filter((block) => block.visible);
  // This compiled prototype panel is not editable operational authority in CMS.
  const airlinePanel = (
<Panel>
          <h2 className="text-xl font-bold">
            {pick(lang, AIRLINE.name)} <Code className="text-sm text-muted-foreground">{AIRLINE.code}</Code>
          </h2>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            {pick(lang, {
              en: "Palestinian Airlines is the home carrier at GZA. The opening network links Gaza with seven regional gateways, flown by Airbus A320-family aircraft.",
              ar: "الخطوط الجوية الفلسطينية هي الناقل الوطني في مطار غزة الدولي. تربط الشبكة الافتتاحية غزة بسبع بوابات إقليمية بطائرات من عائلة إيرباص A320.",
            })}
          </p>
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {destinations.map((destination) => (
              <li key={destination.code} className="code-id rounded-md bg-secondary px-2 py-1 text-xs font-semibold">
                {destination.code}
              </li>
            ))}
          </ul>
          <AppLink to="/destinations" className={btnClass("outline", "md", "mt-5")}>
            {t("dest.title")}
          </AppLink>
        </Panel>
  );
  return (
    <>
      {previewing && <ContentPreviewNotice error={previewError} loading={previewLoading} />}
      <PageHeader eyebrow={t("nav.about")} title={pick(lang, page.title)} description={pick(lang, page.description)} />
      <Container className="grid gap-6 py-10 lg:grid-cols-2">
        {blocks.map((block, index) => (
          <Fragment key={block.id}>
            {index === 1 && airlinePanel}
            <Panel className={block.id === "about-material" ? "lg:col-span-2" : ""}>
              <h2 className="text-xl font-bold">{pick(lang, block.title)}</h2>
              {block.paragraphs.map((paragraph, paragraphIndex) => (
                <p key={paragraphIndex} className="mt-2 text-base leading-relaxed text-muted-foreground">{pick(lang, paragraph)}</p>
              ))}
              {block.id === "about-airport" && <AppLink to="/airport" className={btnClass("outline", "md", "mt-5")}>{t("airport.title")}</AppLink>}
              {block.id === "about-material" && (
                <ResponsiveImage
                  entry="airport-archive-hero-2000"
                  sizes="(min-width: 1024px) 896px, 100vw"
                  loading="lazy"
                  className="aspect-21/9 w-full rounded-xl object-cover"
                  containerClassName="mt-6"
                  caption={
                    <span className="flex items-center justify-between">
                      <span>{t("media.archive2000Label")}</span>
                      <AppLink to="/gallery" className="font-medium hover:underline">
                        {t("nav.gallery")}
                      </AppLink>
                    </span>
                  }
                />
              )}
            </Panel>
          </Fragment>
        ))}
        {blocks.length < 2 && airlinePanel}
      </Container>
    </>
  );
}
