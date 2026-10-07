import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { btnClass } from "@/components/kit";
import { useI18n } from "@/lib/i18n";

export interface CmsConflictBannerProps {
  onReload: () => void;
  onDismiss: () => void;
}

export function CmsConflictBanner({ onReload, onDismiss }: CmsConflictBannerProps) {
  const { t } = useI18n();

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-lg border border-status-delayed/40 bg-status-delayed/10 p-4 text-foreground sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-status-delayed" />
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-foreground">{t("cms.conflict.title")}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("cms.conflict.desc")}</p>
        </div>
      </div>
      <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onReload}
          className={btnClass("secondary", "sm")}
        >
          <RefreshCw aria-hidden="true" className="me-1.5 size-3.5" />
          {t("cms.conflict.reload")}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className={btnClass("ghost", "sm")}
        >
          <X aria-hidden="true" className="me-1.5 size-3.5" />
          {t("cms.conflict.keep")}
        </button>
      </div>
    </div>
  );
}
