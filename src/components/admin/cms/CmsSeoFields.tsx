import { Input, Textarea } from "@/components/kit";
import { AdminField, BilingualStatus } from "@/components/admin/admin-kit";
import { useI18n } from "@/lib/i18n";
import type { PageSeoContent } from "@/content/types";

export interface CmsSeoFieldsProps {
  seo: PageSeoContent;
  editLang: "en" | "ar";
  mayEdit: boolean;
  ready: boolean;
  errors: Record<string, string>;
  onChange: (updatedSeo: PageSeoContent) => void;
}

export function CmsSeoFields({
  seo,
  editLang,
  mayEdit,
  ready,
  errors,
  onChange,
}: CmsSeoFieldsProps) {
  const { t } = useI18n();

  const handleTitleChange = (value: string) => {
    onChange({
      ...seo,
      title: {
        ...seo.title,
        [editLang]: value,
      },
    });
  };

  const handleDescChange = (value: string) => {
    onChange({
      ...seo,
      description: {
        ...seo.description,
        [editLang]: value,
      },
    });
  };

  const titleErrKey = errors[`seo-title-${editLang}`];
  const descErrKey = errors[`seo-desc-${editLang}`];

  return (
    <section aria-labelledby="cms-seo-heading" className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <h2 id="cms-seo-heading" className="text-sm font-bold tracking-tight">
            {t("cms.seo.title")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("cms.seo.desc")}</p>
        </div>
        <BilingualStatus
          missingAr={!seo.title.ar?.trim() || !seo.description.ar?.trim()}
          missingEn={!seo.title.en?.trim() || !seo.description.en?.trim()}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminField
          label={t("cms.seo.pageTitle")}
          htmlFor={`seo-title-${editLang}`}
          hint={`${seo.title[editLang]?.length ?? 0} / 60`}
        >
          <Input
            id={`seo-title-${editLang}`}
            dir={editLang === "ar" ? "rtl" : "ltr"}
            value={seo.title[editLang] ?? ""}
            readOnly={!mayEdit || !ready}
            aria-invalid={titleErrKey ? "true" : "false"}
            aria-describedby={titleErrKey ? `seo-title-${editLang}-err` : undefined}
            onChange={(e) => handleTitleChange(e.target.value)}
          />
          {titleErrKey ? (
            <p id={`seo-title-${editLang}-err`} role="alert" className="text-xs text-destructive">
              {t(titleErrKey)}
            </p>
          ) : null}
        </AdminField>

        <AdminField
          label={t("cms.seo.pageDesc")}
          htmlFor={`seo-desc-${editLang}`}
          hint={`${seo.description[editLang]?.length ?? 0} / 160`}
        >
          <Textarea
            id={`seo-desc-${editLang}`}
            rows={2}
            dir={editLang === "ar" ? "rtl" : "ltr"}
            value={seo.description[editLang] ?? ""}
            readOnly={!mayEdit || !ready}
            aria-invalid={descErrKey ? "true" : "false"}
            aria-describedby={descErrKey ? `seo-desc-${editLang}-err` : undefined}
            onChange={(e) => handleDescChange(e.target.value)}
          />
          {descErrKey ? (
            <p id={`seo-desc-${editLang}-err`} role="alert" className="text-xs text-destructive">
              {t(descErrKey)}
            </p>
          ) : null}
        </AdminField>
      </div>
    </section>
  );
}
