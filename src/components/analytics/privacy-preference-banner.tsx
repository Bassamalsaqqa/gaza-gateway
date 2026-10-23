import { useState, useEffect } from "react";
import {
  getConsentStatus,
  setConsentStatus,
  subscribeConsent,
  isDntOrGpcActive,
  isPreviewOrDiagnosticMode,
  type ConsentStatus,
} from "@/lib/analytics/privacy";
import { useI18n, pick } from "@/lib/i18n";
import { AppLink } from "@/components/app-link";
import { btnClass } from "@/components/kit";
import { ShieldCheck, X } from "lucide-react";

export function PrivacyPreferenceBanner() {
  const { lang } = useI18n();
  const [status, setStatus] = useState<ConsentStatus>("denied");
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setStatus(getConsentStatus());
    return subscribeConsent((newStatus) => {
      setStatus(newStatus);
    });
  }, []);

  // Do not show banner if DNT is active (auto-denied), if already decided, if dismissed, or if preview/diagnostic mode
  if (!mounted || status !== "unspecified" || dismissed || isDntOrGpcActive() || isPreviewOrDiagnosticMode()) {
    return null;
  }

  const handleAccept = () => {
    setConsentStatus("granted");
  };

  const handleDecline = () => {
    setConsentStatus("denied");
  };

  return (
    <aside
      aria-label={pick(lang, {
        en: "Privacy and analytics preference",
        ar: "تفضيلات الخصوصية والتحليلات",
      })}
      className="fixed inset-x-0 bottom-0 z-40 p-3 sm:p-4 pointer-events-none"
    >
      <div className="mx-auto max-w-4xl pointer-events-auto rounded-xl border border-border bg-card p-3.5 sm:p-4 shadow-lg text-card-foreground">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-sand-deep p-2 text-brand-deep shrink-0 mt-0.5">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-foreground">
                {pick(lang, {
                  en: "Help improve this website",
                  ar: "المساعدة في تحسين الموقع",
                })}
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {pick(lang, {
                  en: "With your permission, we measure optional page visits and active reading time to improve the site. We never track booking details or personal identities.",
                  ar: "بموافقتك، نقيس زيارات الصفحات ووقت التصفح الفعلي للمساعدة في تحسين الموقع، دون أي تتبع لتفاصيل الحجوزات أو الهويات الشخصية إطلاقاً.",
                })}{" "}
                <AppLink
                  to="/privacy"
                  className="font-semibold text-brand underline underline-offset-2 hover:text-brand-deep"
                >
                  {pick(lang, { en: "Privacy policy", ar: "سياسة الخصوصية" })}
                </AppLink>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              type="button"
              onClick={handleDecline}
              className={btnClass("outline", "sm")}
            >
              {pick(lang, { en: "Keep off", ar: "إبقاء معطّل" })}
            </button>
            <button
              type="button"
              onClick={handleAccept}
              className={btnClass("primary", "sm")}
            >
              {pick(lang, { en: "Allow", ar: "سماح" })}
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="p-1 text-muted-foreground hover:text-foreground rounded focus-visible:outline-2 focus-visible:outline-ring"
              aria-label={pick(lang, { en: "Dismiss notice", ar: "إغلاق الإشعار" })}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
