import { btnClass } from "@/components/kit";
import { useI18n } from "@/lib/i18n";

export function NetworkState({ pending, error, onRetry }: { pending: boolean; error: boolean; onRetry: () => void }) {
  const { t } = useI18n();
  if (error) return <div role="alert" className="p-3 text-sm text-destructive">{t("network.unavailable")} <button type="button" className={btnClass("outline", "sm")} onClick={onRetry}>{t("adm.ops.retry")}</button></div>;
  if (pending) return <p role="status" className="p-3 text-sm text-muted-foreground">{t("adm.ops.loading")}</p>;
  return null;
}
