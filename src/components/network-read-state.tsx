import { btnClass } from "./kit";
import { pick, useI18n } from "@/lib/i18n";

export function NetworkReadState({ loading, error, onRetry }: { loading: boolean; error: boolean; onRetry: () => void }) {
  const { lang } = useI18n();
  if (loading) return <p role="status" className="py-8 text-sm text-muted-foreground">{pick(lang, { en: "Loading destinations...", ar: "جارٍ تحميل الوجهات..." })}</p>;
  if (!error) return null;
  return <div role="alert" className="py-8 text-sm text-muted-foreground">
    <p>{pick(lang, { en: "Destinations could not be loaded.", ar: "تعذر تحميل الوجهات." })}</p>
    <button type="button" className={btnClass("outline", "sm", "mt-3")} onClick={onRetry}>{pick(lang, { en: "Retry", ar: "إعادة المحاولة" })}</button>
  </div>;
}
