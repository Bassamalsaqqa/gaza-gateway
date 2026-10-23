import { useState, useEffect } from "react";
import { Panel, btnClass } from "@/components/kit";
import {
  getConsentStatus,
  setConsentStatus,
  subscribeConsent,
  isDntOrGpcActive,
  type ConsentStatus,
} from "@/lib/analytics/privacy";
import { useI18n, pick } from "@/lib/i18n";
import { ShieldCheck, ShieldAlert, CheckCircle2 } from "lucide-react";

export function PrivacySettingsCard() {
  const { lang } = useI18n();
  const [status, setStatus] = useState<ConsentStatus>("denied");
  const [dntActive, setDntActive] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setStatus(getConsentStatus());
    setDntActive(isDntOrGpcActive());
    return subscribeConsent((newStatus) => {
      setStatus(newStatus);
      setDntActive(isDntOrGpcActive());
    });
  }, []);

  if (!mounted) return null;

  return (
    <Panel className="border-brand/30 bg-card space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-sand-deep p-2 text-brand-deep shrink-0 mt-0.5">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-foreground">
            {pick(lang, {
              en: "First-Party Session-Only Telemetry & Privacy Choices",
              ar: "التحليلات مجهولة الهوية للجلسة وخيارات الخصوصية",
            })}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {pick(lang, {
              en: "We believe privacy is an absolute right. Palestine Airways Limited operates its own first-party telemetry with no third-party tracking scripts or cross-site profiling.",
              ar: "نؤمن بأن الخصوصية حق أصيل. تدير الخطوط الجوية الفلسطينية تحليلاتها الخاصة من الطرف الأول فقط دون أي أدوات تتبع خارجية أو ملفات عبر المواقع.",
            })}
          </p>
        </div>
      </div>

      <div className="grid gap-3 text-xs sm:text-sm text-muted-foreground sm:grid-cols-3 pt-2">
        <div className="rounded-md border border-border p-3 space-y-1 bg-ambient">
          <div className="font-semibold text-foreground">
            {pick(lang, { en: "Session-Only Opt-In", ar: "موافقة اختيارية للجلسة" })}
          </div>
          <p>
            {pick(lang, {
              en: "Telemetry is disabled by default. Activity is isolated to a 30-minute idle session with no persistent tracking cookies.",
              ar: "التحليلات معطلة افتراضياً، وتقتصر على جلسة مجهولة تنتهي بعد ٣٠ دقيقة خمول دون ملفات تعريف ارتباط دائمة.",
            })}
          </p>
        </div>
        <div className="rounded-md border border-border p-3 space-y-1 bg-ambient">
          <div className="font-semibold text-foreground">
            {pick(lang, { en: "Raw Event Retention (≤ 90 Days)", ar: "الاحتفاظ بالأحداث الأولية (≤ ٩٠ يوماً)" })}
          </div>
          <p>
            {pick(lang, {
              en: "Raw events become eligible for bounded deletion after 90 days. Monthly report aggregates are retained separately for historical trends.",
              ar: "تصبح الأحداث الأولية مؤهلة للحذف على دفعات بعد ٩٠ يوماً، ويُحتفظ بملخصات التقارير الشهرية بشكل منفصل.",
            })}
          </p>
        </div>
        <div className="rounded-md border border-border p-3 space-y-1 bg-ambient">
          <div className="font-semibold text-foreground">
            {pick(lang, { en: "Unknown Country & IP Privacy", ar: "حماية البلد المجهول وخصوصية IP" })}
          </div>
          <p>
            {pick(lang, {
              en: "Analytics records omit raw IP addresses and user agents. Standard web server access logs may process connections separately for infrastructure security, while geographic metrics classify locations under unknown country protections.",
              ar: "تحذف سجلات التحليلات عناوين IP ومعلومات المتصفح بالكامل. قد تعالج سجلات خادم الويب اتصالات IP بشكل منفصل لأمان البنية التحتية، بينما تُصنف البيانات الجغرافية كبلد مجهول لحماية الزوار.",
            })}
          </p>
        </div>
      </div>

      <div className="border-t border-border pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-foreground">
            {pick(lang, { en: "Current telemetry status:", ar: "حالة التحليلات الحالية:" })}
          </span>
          {dntActive ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground font-medium">
              <ShieldAlert className="size-4 text-clay" aria-hidden="true" />
              {pick(lang, {
                en: "Disabled (Browser Do Not Track / GPC active)",
                ar: "معطّل (تم تفعيل عدم التتبع بالمتصفح DNT / GPC)",
              })}
            </span>
          ) : status === "granted" ? (
            <span className="inline-flex items-center gap-1.5 text-brand font-medium">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {pick(lang, { en: "Enabled (Session-only)", ar: "مفعّل (للجلسة فقط)" })}
            </span>
          ) : (
            <span className="text-muted-foreground font-medium">
              {pick(lang, { en: "Disabled", ar: "معطّل" })}
            </span>
          )}
        </div>

        {!dntActive && (
          <div className="flex items-center gap-2">
            {status === "granted" ? (
              <button
                type="button"
                onClick={() => setConsentStatus("denied")}
                className={btnClass("outline", "sm")}
              >
                {pick(lang, { en: "Disable telemetry", ar: "تعطيل التحليلات" })}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConsentStatus("granted")}
                className={btnClass("primary", "sm")}
              >
                {pick(lang, { en: "Enable telemetry", ar: "تفعيل التحليلات" })}
              </button>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
