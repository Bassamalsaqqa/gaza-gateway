import { useCommercialCatalogQuery } from "@/lib/commercial/queries";
import { useI18n } from "@/lib/i18n";

/** Query failure is unavailable commercial data, never a healthy empty catalog. */
export function CommercialCatalogState() {
  const query = useCommercialCatalogQuery();
  const { t } = useI18n();
  if (query.isPending)
    return (
      <p role="status" className="p-4 text-sm text-muted-foreground">
        {t("common.loading")}
      </p>
    );
  if (query.isError)
    return (
      <div role="alert" className="rounded-lg border border-border bg-card p-4 text-sm">
        <p>{t("commercial.error.catalog_unavailable")}</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="mt-2 underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("error.tryAgain")}
        </button>
      </div>
    );
  return null;
}
