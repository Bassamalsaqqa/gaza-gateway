import { compiledContentHead } from "@/content/head";
import { publishedInformationPages } from "@/content/published/information-pages";
import { ContentPreviewNotice, useContentPreview } from "@/content/preview";
import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { btnClass, Container, PageHeader, Panel } from "@/components/kit";
import { ResponsiveImage } from "@/components/responsive-image";
import { destinations } from "@/lib/data";
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
          { name: isAr ? "عن المشروع" : "About", path: isAr ? "/ar/about" : "/about" },
        ]),
      ],
    });
  },
  component: AboutPage,
});

const STATEMENT_BLOCK_IDS = new Set([
  "about-statement-origin",
  "about-statement-response",
  "about-statement-forward",
  "about-statement-archive",
  "about-statement-how",
]);

function AboutPage() {
  const { t, lang } = useI18n();
  const { content, previewing, previewError, previewLoading } = useContentPreview("pages.information", publishedInformationPages);
  const page = content.pages.find((entry) => entry.id === "about")!;
  const allBlocks = page.blocks.filter((block) => block.visible);

  const statementBlocks = allBlocks.filter((b) => STATEMENT_BLOCK_IDS.has(b.id));
  const historyBlock = allBlocks.find((b) => b.id === "about-history-context" || b.id === "about-airport");
  const conceptualBlock = allBlocks.find((b) => b.id === "about-conceptual-network");
  const materialBlock = allBlocks.find((b) => b.id === "about-material");
  const extraBlocks = allBlocks.filter(
    (b) =>
      !STATEMENT_BLOCK_IDS.has(b.id) &&
      b.id !== "about-history-context" &&
      b.id !== "about-airport" &&
      b.id !== "about-conceptual-network" &&
      b.id !== "about-material",
  );

  return (
    <>
      {previewing && <ContentPreviewNotice error={previewError} loading={previewLoading} />}
      <PageHeader eyebrow={t("nav.about")} title={pick(lang, page.title)} description={pick(lang, page.description)} />

      {/* Primary Section: Credited Artist's Statement */}
      {statementBlocks.length > 0 && <section aria-labelledby="artist-statement-heading" className="border-b border-border/60 bg-card py-12 sm:py-20">
        <Container>
          <div className="mx-auto max-w-3xl">
            {/* Header: Credited Artist Statement */}
            <header className="border-b border-border/80 pb-6 mb-10">
              <span className="inline-block rounded-md bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand tracking-wide uppercase">
                {pick(lang, {
                  en: "Artist's Statement",
                  ar: "بيان الفنان",
                })}
              </span>
              <h2 id="artist-statement-heading" className="mt-3 text-2xl sm:text-4xl font-bold tracking-tight text-foreground font-display">
                {pick(lang, {
                  en: "Artist's statement",
                  ar: "بيان الفنان",
                })}
              </h2>
              <p className="mt-2 text-base font-medium text-muted-foreground">
                {pick(lang, {
                  en: "An internet-based art project by Ayman Alazraq",
                  ar: "مشروع فني على الإنترنت لأيمن الأزرق",
                })}
              </p>
            </header>

            {/* Flowing Editorial Sections */}
            <div className="space-y-10">
              {statementBlocks.map((block) => (
                <article
                  key={block.id}
                  className="space-y-3 border-b border-border/40 pb-8 last:border-b-0 last:pb-0"
                >
                  <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-display">
                    {pick(lang, block.title)}
                  </h3>
                  <div className="space-y-3 text-base sm:text-lg leading-relaxed text-foreground/90">
                    {block.paragraphs.map((paragraph, pIdx) => (
                      <p key={pIdx}>{pick(lang, paragraph)}</p>
                    ))}
                  </div>

                  {block.id === "about-statement-how" && (
                    <div className="mt-6 pt-4 flex flex-wrap items-center gap-3">
                      <AppLink to="/airport" hash="contribute" className={btnClass("secondary", "md")}>
                        {pick(lang, {
                          en: "Contribute to the Archive",
                          ar: "المساهمة في الأرشيف",
                        })}
                      </AppLink>
                      <AppLink to="/gallery" className={btnClass("outline", "md")}>
                        {t("nav.gallery")}
                      </AppLink>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </Container>
      </section>}

      {/* Secondary Section: Airport History vs Artwork Conception */}
      <section aria-labelledby="context-heading" className="py-12 sm:py-16">
        <Container className="space-y-8">
          <div>
            <span className="eyebrow text-clay">
              {pick(lang, {
                en: "Historical Record & Project Identity",
                ar: "السجل التاريخي وهوية المشروع",
              })}
            </span>
            <h2 id="context-heading" className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {pick(lang, {
                en: "Airport History vs. Conceptual Art",
                ar: "تاريخ المطار في مقابل العمل الفني المفاهيمي",
              })}
            </h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Historical Fact Panel */}
            {historyBlock && (
              <Panel className="border-border bg-card shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
                    <h3 className="text-xl font-bold text-foreground">{pick(lang, historyBlock.title)}</h3>
                  </div>
                  <div className="mt-4 space-y-3 text-sm sm:text-base leading-relaxed text-muted-foreground">
                    {historyBlock.paragraphs.map((paragraph, index) => (
                      <p key={index}>{pick(lang, paragraph)}</p>
                    ))}
                    <a href="https://www.pcbs.gov.ps/Downloads/book326.pdf" className="inline-block font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary">
                      {pick(lang, { en: "Historical source: PCBS air-transport statistics", ar: "المصدر التاريخي: إحصاءات النقل الجوي للجهاز المركزي للإحصاء الفلسطيني" })}
                    </a>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-border/60">
                  <AppLink to="/airport" className={btnClass("outline", "md")}>
                    {t("airport.title")}
                  </AppLink>
                </div>
              </Panel>
            )}

            {/* Conceptual Artwork & Symbolic Network Panel */}
            {conceptualBlock && (
              <Panel className="border-border bg-card shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-clay" aria-hidden="true" />
                    <h3 className="text-xl font-bold text-foreground">{pick(lang, conceptualBlock.title)}</h3>
                  </div>
                  <div className="mt-4 space-y-3 text-sm sm:text-base leading-relaxed text-muted-foreground">
                    {conceptualBlock.paragraphs.map((paragraph, index) => (
                      <p key={index}>{pick(lang, paragraph)}</p>
                    ))}
                  </div>

                  <div className="mt-5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {pick(lang, {
                        en: "Symbolic Destination Network",
                        ar: "شبكة الوجهات الرمزية",
                      })}
                    </span>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {destinations.map((destination) => (
                        <li key={destination.code} className="code-id rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">
                          {destination.code}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-border/60">
                  <AppLink to="/destinations" className={btnClass("outline", "md")}>
                    {t("dest.title")}
                  </AppLink>
                </div>
              </Panel>
            )}

            {/* Material & Archive Panel */}
            {materialBlock && (
              <Panel className="lg:col-span-2 border-border bg-card shadow-xs">
                <h3 className="text-xl font-bold text-foreground">{pick(lang, materialBlock.title)}</h3>
                <div className="mt-3 space-y-2 text-sm sm:text-base leading-relaxed text-muted-foreground">
                  {materialBlock.paragraphs.map((paragraph, index) => (
                    <p key={index}>{pick(lang, paragraph)}</p>
                  ))}
                </div>
                <ResponsiveImage
                  entry="airport-archive-hero-2000"
                  sizes="(min-width: 1024px) 896px, 100vw"
                  loading="lazy"
                  className="aspect-21/9 w-full rounded-xl object-cover"
                  containerClassName="mt-6"
                  caption={
                    <span className="flex items-center justify-between">
                      <span>{t("media.archive2000Label")}</span>
                      <AppLink to="/gallery" className="font-medium hover:underline text-brand-deep">
                        {t("nav.gallery")}
                      </AppLink>
                    </span>
                  }
                />
              </Panel>
            )}

            {/* Extra CMS Blocks fallback if added in admin */}
            {extraBlocks.map((block) => (
              <Panel key={block.id} className="border-border bg-card shadow-xs">
                <h3 className="text-xl font-bold text-foreground">{pick(lang, block.title)}</h3>
                <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
                  {block.paragraphs.map((paragraph, index) => (
                    <p key={index}>{pick(lang, paragraph)}</p>
                  ))}
                </div>
              </Panel>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
