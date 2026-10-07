import { compiledContentHead } from "@/content/head";
import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { Container, Notice, PageHeader, Panel } from "@/components/kit";
import { publishedInformationPages } from "@/content/published/information-pages";
import { ContentPreviewNotice, useContentPreview } from "@/content/preview";
import { pick, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/{-$locale}/terms")({
  head: ({ params }) => compiledContentHead(publishedInformationPages.pages.find((page) => page.id === "terms")!.seo, params.locale, true),
  component: TermsPage,
});


function TermsPage() {
  const { t, lang } = useI18n();
  const { content, previewing, previewError, previewLoading } = useContentPreview("pages.information", publishedInformationPages);
  const page = content.pages.find((entry) => entry.id === "terms")!;
  return (
    <>
      {previewing && <ContentPreviewNotice error={previewError} loading={previewLoading} />}
      <PageHeader title={pick(lang, page.title)} description={pick(lang, page.description)} />
      <Container className="py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <Notice title={t("common.notice")}>{t("footer.rights")}</Notice>
          {page.blocks.filter((block) => block.visible).map((section) => (
            <Panel key={section.id}>
              <h2 className="text-lg font-bold">{pick(lang, section.title)}</h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index}>{pick(lang, paragraph)}</p>
                ))}
              </div>
            </Panel>
          ))}
          <p className="text-sm text-muted-foreground">
            {t("legal.contactUs")}{" "}
            <AppLink to="/contact" className="font-semibold text-brand-deep underline">
              {t("nav.contact")}
            </AppLink>{" "}
            ·{" "}
            <AppLink to="/privacy" className="font-semibold text-brand-deep underline">
              {t("legal.privacyTitle")}
            </AppLink>
          </p>
        </div>
      </Container>
    </>
  );
}
