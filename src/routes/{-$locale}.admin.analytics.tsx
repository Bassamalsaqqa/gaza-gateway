import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { generateCryptographicUuid } from "@/lib/api/identity-client-validators";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  AdminField,
  AdminPageHeader,
  AdminPanel,
  AdminTabs,
  Ltr,
  Metric,
} from "@/components/admin/admin-kit";
import { AdminDenied } from "@/components/admin/admin-denied";
import {
  GazaTable,
  GazaTableBody,
  GazaTableCaption,
  GazaTableCell,
  GazaTableHead,
  GazaTableHeader,
  GazaTableRow,
} from "@/components/gaza-table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Button, Input } from "@/components/kit";
import { Switch } from "@/components/ui/switch";
import { useAdmin } from "@/lib/admin-store";
import { pick, useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/head";
import { adminAnalyticsClient } from "@/lib/analytics/admin-analytics-client";
import type { AnalyticsPeriod, AnalyticsSummaryData } from "@/lib/analytics/types";
import { getIdentityUiClient } from "@/lib/api/identity-ui-runtime";
import { MvpApiError } from "@/lib/api/mvp-client";
import {
  ShieldCheck,
  Mail,
  Send,
  AlertCircle,
  RefreshCw,
  Lock,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/{-$locale}/admin/analytics")({
  head: ({ params }) =>
    pageHead({
      locale: params.locale,
      path: "/admin/analytics",
      en: {
        title: "Analytics — Gaza International Airport administration",
        description: "Privacy-conscious website usage estimates and monthly reporting.",
      },
      ar: {
        title: "التحليلات — إدارة مطار غزة الدولي",
        description: "تحليلات استخدام مجهولة الهوية وتقارير من الطرف الأول تحفظ الخصوصية.",
      },
      noindex: true,
    }),
  component: AdminAnalyticsPage,
});

type Tab = "overview" | "funnel" | "pages" | "countries" | "settings";

function formatSeconds(totalSeconds: number): string {
  const rounded = Math.round(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

function AdminAnalyticsPage() {
  const { lang, t } = useI18n();
  const { can, staff } = useAdmin();

  const [period, setPeriod] = useState<AnalyticsPeriod>("30");
  const [tab, setTab] = useState<Tab>("overview");

  // Report settings draft state
  const [reportEmail, setReportEmail] = useState("");
  const [reportEnabled, setReportEnabled] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Preview dispatch state
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewRequest = useRef<{requestId:string;period:AnalyticsPeriod}|null>(null);
  const [previewNotice, setPreviewNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Step-up verification state
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpPassword, setStepUpPassword] = useState("");
  const [stepUpRecovery, setStepUpRecovery] = useState(false);
  const [stepUpBusy, setStepUpBusy] = useState(false);
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"save_settings" | "send_preview" | null>(null);

  // Query: Analytics summary
  const summaryQuery = useQuery({
    queryKey: ["admin-analytics-summary", period],
    queryFn: ({ signal }) => adminAnalyticsClient.getSummary(period, signal),
    enabled: Boolean(staff && can("engagement.view")),
    retry: 1,
  });

  // Query: Report settings (requires admin.manage)
  const settingsQuery = useQuery({
    queryKey: ["admin-analytics-reports-settings"],
    queryFn: ({ signal }) => adminAnalyticsClient.getReportSettings(signal),
    enabled: Boolean(staff && can("admin.manage")),
    retry: 1,
  });

  // Synchronize settings query data to local editing draft
  if (settingsQuery.data && !settingsDirty && reportEmail === "") {
    setReportEmail(settingsQuery.data.recipientEmail);
    setReportEnabled(settingsQuery.data.enabled);
  }

  if (!can("engagement.view")) {
    return <AdminDenied area={t("a2.an.title")} permission="engagement.view" />;
  }

  const periods: { id: AnalyticsPeriod; en: string; ar: string }[] = [
    { id: "7", en: "Last 7 days", ar: "آخر ٧ أيام" },
    { id: "30", en: "Last 30 days", ar: "آخر ٣٠ يوماً" },
    { id: "90", en: "Last 90 days", ar: "آخر ٩٠ يوماً" },
    { id: "previous_month", en: "Previous month", ar: "الشهر السابق" },
  ];

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: pick(lang, { en: "Overview & Traffic", ar: "نظرة عامة والزيارات" }) },
    { id: "funnel", label: pick(lang, { en: "Activity", ar: "النشاط" }) },
    { id: "pages", label: pick(lang, { en: "Top Pages", ar: "أكثر الصفحات زيارة" }) },
    { id: "countries", label: pick(lang, { en: "Geographic Sources", ar: "المصادر الجغرافية" }) },
    ...(can("admin.manage")
      ? [{ id: "settings" as Tab, label: pick(lang, { en: "Report Settings & Preview", ar: "إعدادات التقرير والمعاينة" }) }]
      : []),
  ];

  const funnelChartConfig = {
    searches: { label: pick(lang, { en: "Flight Searches", ar: "عمليات البحث" }), color: "var(--brand)" },
    bookingStarts: { label: pick(lang, { en: "Booking Starts", ar: "بدء الحجز" }), color: "var(--clay)" },
    confirmedBookings: { label: pick(lang, { en: "Confirmed Bookings", ar: "حجوزات مؤكدة" }), color: "var(--primary)" },
  } satisfies ChartConfig;

  // Handle Save Report Settings
  async function handleSaveSettings() {
    if (!settingsQuery.data || settingsBusy) return;
    setSettingsBusy(true);
    setSettingsNotice(null);

    try {
      await adminAnalyticsClient.saveReportSettings({
        expectedRevision: settingsQuery.data.revision,
        enabled: reportEnabled,
        recipientEmail: reportEmail.trim(),
      });
      await settingsQuery.refetch();
      setSettingsDirty(false);
      setSettingsNotice({
        type: "success",
        text: pick(lang, {
          en: "Report settings saved successfully on server.",
          ar: "تم حفظ إعدادات التقارير بنجاح على الخادم.",
        }),
      });
    } catch (err: unknown) {
      if (err instanceof MvpApiError && err.status === 403) {
        // Step-up authentication required
        setPendingAction("save_settings");
        setStepUpOpen(true);
        setSettingsNotice({
          type: "error",
          text: pick(lang, {
            en: "Recent security step-up verification required to change report settings.",
            ar: "يلزم تحقق أمني حديث لحفظ إعدادات التقارير.",
          }),
        });
      } else if (err instanceof MvpApiError && err.status === 409) {
        setSettingsNotice({
          type: "error",
          text: pick(lang, {
            en: "Settings were updated by another administrator. Please refresh.",
            ar: "تم تحديث الإعدادات بواسطة مسؤول آخر. يُرجى تحديث الصفحة.",
          }),
        });
      } else {
        setSettingsNotice({
          type: "error",
          text: pick(lang, {
            en: "Failed to save settings. Please check email format and retry.",
            ar: "تعذر حفظ الإعدادات. يرجى التحقق من صحة البريد والمحاولة ثانية.",
          }),
        });
      }
    } finally {
      setSettingsBusy(false);
    }
  }

  // Handle Send Preview
  async function handleSendPreview() {
    if (previewBusy) return;
    setPreviewBusy(true);
    setPreviewNotice(null);

    try {
      previewRequest.current ??= { requestId: generateCryptographicUuid(), period };
      const result = await adminAnalyticsClient.sendReportPreview(previewRequest.current);
      previewRequest.current = null;

      if (result.status === "captured_locally") {
        setPreviewNotice({
          type: "success",
          text: pick(lang, {
            en: `Preview report captured locally for testing (${result.recipient}).`,
            ar: `تم حفظ معاينة التقرير محلياً للاختبار (${result.recipient}).`,
          }),
        });
      } else if (result.status === "unconfigured_mail") {
        setPreviewNotice({
          type: "error",
          text: pick(lang, {
            en: "Mail sender is not configured on this server.",
            ar: "إعدادات خادم البريد غير مهيأة بعد على هذا الخادم.",
          }),
        });
      } else if (result.status === "queued") {
        setPreviewNotice({
          type: "success",
          text: pick(lang, {
            en: `Preview report queued for dispatch to configured recipient (${result.recipient}).`,
            ar: `تم إدراج معاينة التقرير في قائمة الإرسال إلى المستلم المعتمد (${result.recipient}).`,
          }),
        });
      } else {
        setPreviewNotice({
          type: "success",
          text: pick(lang, {
            en: `Preview report status: ${result.status} (${result.recipient}). Inbox delivery is not confirmed.`,
            ar: `حالة معاينة التقرير: ${result.status} (${result.recipient}). لم يتم تأكيد وصوله إلى صندوق الوارد.`,
          }),
        });
      }
    } catch (err: unknown) {
      if (err instanceof MvpApiError && err.status === 403) {
        setPendingAction("send_preview");
        setStepUpOpen(true);
        setPreviewNotice({
          type: "error",
          text: pick(lang, {
            en: "Recent security step-up verification required to dispatch preview reports.",
            ar: "يلزم تحقق أمني حديث لإرسال معاينات التقارير.",
          }),
        });
      } else {
        setPreviewNotice({
          type: "error",
          text: pick(lang, {
            en: "Failed to dispatch preview report. Please retry.",
            ar: "تعذر إرسال معاينة التقرير. يرجى المحاولة لاحقاً.",
          }),
        });
      }
    } finally {
      setPreviewBusy(false);
    }
  }

  // Handle Step-Up Verification
  async function handleStepUpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stepUpPassword || stepUpBusy) return;
    setStepUpBusy(true);
    setStepUpError(null);

    try {
      await getIdentityUiClient().postStaffStepUp(
        !staff?.mfaEnabled ? { currentPassword: stepUpPassword }
          : stepUpRecovery ? { recoveryCode: stepUpPassword.trim() }
            : { totpCode: stepUpPassword.trim() },
      );
      setStepUpOpen(false);
      setStepUpPassword("");

      // Re-trigger pending action
      if (pendingAction === "save_settings") {
        setPendingAction(null);
        void handleSaveSettings();
      } else if (pendingAction === "send_preview") {
        setPendingAction(null);
        void handleSendPreview();
      }
    } catch {
      setStepUpError(
        pick(lang, {
          en: "Verification failed. Check your security credential and try again.",
          ar: "فشل التحقق. تأكد من بيانات التحقق الأمني وحاول ثانية.",
        }),
      );
    } finally {
      setStepUpBusy(false);
    }
  }

  const data: AnalyticsSummaryData | undefined = summaryQuery.data;

  return (
    <div className="space-y-6">
      {/* Header and Period Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <AdminPageHeader
          title={t("a2.an.title")}
          description={pick(lang, {
            en: "Optional website usage estimates, bookings and archive submissions.",
            ar: "تحليلات استخدام الطرف الأول التي تحفظ الخصوصية والمؤشرات التشغيلية المعتمدة.",
          })}
        />

        {/* Date Range Selector */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card p-1">
          {periods.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                period === p.id
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-sand-deep hover:text-foreground"
              }`}
            >
              {pick(lang, p)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {summaryQuery.isPending && (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
          <RefreshCw className="mx-auto size-6 animate-spin text-brand mb-3" aria-hidden="true" />
          <p className="text-sm">
            {pick(lang, {
              en: "Loading analytics data from server…",
              ar: "جارٍ تحميل بيانات التحليلات من الخادم…",
            })}
          </p>
        </div>
      )}

      {/* Error State */}
      {summaryQuery.isError && (
        <div
          role="alert"
          className="rounded-xl border border-clay/30 bg-clay-soft/10 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="size-5 text-clay shrink-0" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {pick(lang, {
                  en: "Unable to load server analytics data",
                  ar: "تعذر تحميل بيانات التحليلات من الخادم",
                })}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {pick(lang, {
                  en: "Please verify server connectivity and permissions, then retry.",
                  ar: "يرجى التحقق من اتصال الخادم والصلاحيات ثم إعادة المحاولة.",
                })}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void summaryQuery.refetch()}
            className="shrink-0 self-start sm:self-auto"
          >
            {pick(lang, { en: "Retry", ar: "إعادة المحاولة" })}
          </Button>
        </div>
      )}

      {/* Step-up Reauthorization Card */}
      {stepUpOpen && (
        <div className="rounded-xl border border-primary/40 bg-sand-deep/40 p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-primary font-semibold text-sm">
            <Lock className="size-4" aria-hidden="true" />
            <span>
              {pick(lang, {
                en: "Security Step-Up Verification Required",
                ar: "يلزم تأكيد الهوية بإجراء أمني حديث",
              })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {pick(lang, {
              en: "Confirm your current password, or your authenticator code when two-factor authentication is enabled.",
              ar: "أكّد كلمة مرورك الحالية، أو رمز تطبيق المصادقة عند تفعيل المصادقة الثنائية.",
            })}
          </p>
          <form onSubmit={handleStepUpSubmit} className="flex flex-wrap items-center gap-3 max-w-md">
            <Input
              type={staff?.mfaEnabled ? "text" : "password"}
              autoComplete={staff?.mfaEnabled ? "one-time-code" : "current-password"}
              aria-label={staff?.mfaEnabled
                ? stepUpRecovery ? pick(lang, { en: "Recovery code", ar: "رمز الاسترداد" }) : pick(lang, { en: "Authenticator code", ar: "رمز تطبيق المصادقة" })
                : pick(lang, { en: "Current password", ar: "كلمة المرور الحالية" })}
              placeholder={staff?.mfaEnabled
                ? stepUpRecovery ? pick(lang, { en: "Recovery code", ar: "رمز الاسترداد" }) : pick(lang, { en: "Authenticator code", ar: "رمز تطبيق المصادقة" })
                : pick(lang, { en: "Current password", ar: "كلمة المرور الحالية" })}
              value={stepUpPassword}
              onChange={(e) => setStepUpPassword(e.target.value)}
              className="flex-1 min-w-[200px]"
              autoFocus
            />
            <Button type="submit" size="sm" disabled={stepUpBusy || !stepUpPassword}>
              {stepUpBusy
                ? pick(lang, { en: "Verifying…", ar: "جارٍ التحقق…" })
                : pick(lang, { en: "Confirm", ar: "تأكيد" })}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setStepUpOpen(false);
                setStepUpPassword("");
                setPendingAction(null);
              }}
            >
              {pick(lang, { en: "Cancel", ar: "إلغاء" })}
            </Button>
          </form>
          {staff?.mfaEnabled && <Button type="button" variant="outline" size="sm" onClick={() => {
            setStepUpRecovery(!stepUpRecovery); setStepUpPassword(""); setStepUpError(null);
          }}>{stepUpRecovery ? pick(lang, { en: "Use authenticator", ar: "استخدام تطبيق المصادقة" }) : pick(lang, { en: "Use recovery code", ar: "استخدام رمز الاسترداد" })}</Button>}
          {stepUpError && <p className="text-xs text-clay font-medium">{stepUpError}</p>}
        </div>
      )}

      {/* Main Content Tabs */}
      {data && (
        <AdminPanel bodyClassName="p-0">
          <AdminTabs label={t("a2.an.title")} active={tab} onChange={setTab} tabs={tabs}>
            <div className="p-4 sm:p-6 space-y-6">
              {/* Coverage & Privacy Guarantee Note */}
              <div className="rounded-lg border border-border bg-secondary px-4 py-3 flex items-start gap-3 text-xs text-muted-foreground">
                <ShieldCheck className="size-4 text-brand-deep shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-0.5">
                  <span className="font-semibold text-foreground">
                    {pick(lang, {
                      en: "Optional visit estimates:",
                      ar: "تقديرات الزيارات الاختيارية:",
                    })}{" "}
                  </span>
                  <span>
                    {pick(lang, {
                        en: "Telemetry reflects actively consented visitor sessions only. Browser Do Not Track / GPC signals are strictly honored, booking references (PNRs) and emails are never tracked, and analytics records omit raw IP addresses (web server access logs are handled separately). Raw events become eligible for bounded deletion after 90 days; monthly report aggregates are retained separately.",
                        ar: "تشمل التقديرات الجلسات التي وافق أصحابها فقط، مع احترام DNT وGPC. لا نسجل مراجع الحجوزات أو البريد أو عناوين IP في التحليلات. تصبح الأحداث مؤهلة للحذف على دفعات بعد ٩٠ يوماً، وتُحفظ الملخصات الشهرية منفصلة.",
                      })}
                  </span>
                  {data.metadata?.captureSince && (
                    <div className="pt-1 text-[11px] text-muted-foreground/80">
                      {pick(lang, { en: "Data capture active since:", ar: "البيانات المسجلة تبدأ من:" })}{" "}
                      <Ltr className="font-mono">{data.metadata.captureSince}</Ltr>
                    </div>
                  )}
                </div>
              </div>

              {/* Tab 1: Overview & Traffic */}
              {tab === "overview" && (
                <div className="space-y-6">
                  {/* Traffic Metrics */}
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Metric
                      label={pick(lang, { en: "Page Views", ar: "مشاهدات الصفحات" })}
                      value={data.traffic.pageViews.toLocaleString("en-GB")}
                      hint={pick(lang, { en: "Public canonical pages", ar: "الصفحات العامة المعتمدة" })}
                    />
                    <Metric
                      label={pick(lang, { en: "Unique Sessions", ar: "الجلسات الفريدة" })}
                      value={data.traffic.uniqueSessions.toLocaleString("en-GB")}
                      hint={pick(lang, { en: "30-minute idle threshold", ar: "عتبة خمول ٣٠ دقيقة" })}
                    />
                    <Metric
                      label={pick(lang, { en: "Unique Visitors", ar: "الزوار الفريدون" })}
                      value={data.traffic.uniqueVisitors.toLocaleString("en-GB")}
                      hint={pick(lang, { en: "Anonymous first-party", ar: "طرف أول مجهول الهوية" })}
                    />
                    <Metric
                      label={pick(lang, { en: "Avg Engagement / Session", ar: "متوسط التفاعل / الجلسة" })}
                      value={formatSeconds(data.traffic.avgEngagementSecondsPerSession)}
                      hint={pick(lang, { en: "Foreground active time", ar: "وقت النشاط في الواجهة" })}
                    />
                  </div>

                  {/* Business Success Section */}
                  <div className="rounded-xl border border-border p-4 space-y-3 bg-card">
                    <h3 className="text-sm font-semibold text-foreground">
                      {pick(lang, {
                        en: "Bookings and archive submissions",
                        ar: "المؤشرات التشغيلية المؤكدة من قاعدة البيانات",
                      })}
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                      <div className="rounded-lg bg-secondary p-3 border border-border space-y-1">
                        <span className="text-muted-foreground">
                          {pick(lang, { en: "Confirmed Bookings", ar: "الحجوزات المؤكدة" })}
                        </span>
                        <div className="text-lg font-bold text-foreground">
                          <Ltr>{data.authoritativeBusinessSuccess.confirmedBookings.toLocaleString("en-GB")}</Ltr>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {pick(lang, { en: "Direct from database", ar: "مباشرة من قاعدة البيانات" })}
                        </span>
                      </div>
                      <div className="rounded-lg bg-secondary p-3 border border-border space-y-1">
                        <span className="text-muted-foreground">
                          {pick(lang, { en: "Archive Contributions", ar: "مشاركات الأرشيف" })}
                        </span>
                        <div className="text-lg font-bold text-foreground">
                          <Ltr>{data.authoritativeBusinessSuccess.archiveContributions.toLocaleString("en-GB")}</Ltr>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {pick(lang, { en: "Verified submissions", ar: "مشاركات موثقة" })}
                        </span>
                      </div>
                      <div className="rounded-lg bg-secondary p-3 border border-border space-y-1">
                        <span className="text-muted-foreground">
                          {pick(lang, { en: "Conversion Rate", ar: "معدل التحويل" })}
                        </span>
                        <div className="text-base font-semibold text-muted-foreground">
                          {data.authoritativeBusinessSuccess.conversionRate != null ? (
                            <Ltr>{(data.authoritativeBusinessSuccess.conversionRate * 100).toFixed(2)}%</Ltr>
                          ) : (
                            <span>{pick(lang, { en: "— (Unsupported)", ar: "— (غير مدعوم)" })}</span>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground leading-tight block">
                          {pick(lang, {
                              en: "No linking opt-in visitors to total bookings",
                              ar: "لا يمكن ربط الزوار الموافقين بإجمالي الحجوزات",
                            })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Daily Trend Table */}
                  {data.dailyTrend && data.dailyTrend.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        {pick(lang, { en: "Daily Activity Trend (UTC)", ar: "اتجاه النشاط اليومي (UTC)" })}
                      </h3>
                      <div className="overflow-x-auto">
                        <GazaTable>
                          <GazaTableHeader>
                            <GazaTableRow>
                              <GazaTableHead>{pick(lang, { en: "Date", ar: "التاريخ" })}</GazaTableHead>
                              <GazaTableHead>{pick(lang, { en: "Page Views", ar: "مشاهدات الصفحات" })}</GazaTableHead>
                              <GazaTableHead>{pick(lang, { en: "Unique Visitors", ar: "الزوار الفريدون" })}</GazaTableHead>
                              <GazaTableHead>{pick(lang, { en: "Engagement", ar: "وقت التفاعل" })}</GazaTableHead>
                            </GazaTableRow>
                          </GazaTableHeader>
                          <GazaTableBody>
                            {data.dailyTrend.map((d) => (
                              <GazaTableRow key={d.date}>
                                <GazaTableCell>
                                  <Ltr className="font-mono text-xs">{d.date}</Ltr>
                                </GazaTableCell>
                                <GazaTableCell>
                                  <Ltr>{d.pageViews.toLocaleString("en-GB")}</Ltr>
                                </GazaTableCell>
                                <GazaTableCell>
                                  <Ltr>{d.uniqueVisitors.toLocaleString("en-GB")}</Ltr>
                                </GazaTableCell>
                                <GazaTableCell>
                                  <Ltr>{formatSeconds(d.engagementSeconds)}</Ltr>
                                </GazaTableCell>
                              </GazaTableRow>
                            ))}
                          </GazaTableBody>
                        </GazaTable>
                      </div>
                    </div>
                  )}

                  {/* Referrer Hosts Section */}
                  {data.referrerHosts && data.referrerHosts.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        {pick(lang, { en: "Top Acquisition Referrers", ar: "أبرز مصادر الإحالة" })}
                      </h3>
                      <div className="overflow-x-auto">
                        <GazaTable>
                          <GazaTableHeader>
                            <GazaTableRow>
                              <GazaTableHead>{pick(lang, { en: "Referrer Hostname", ar: "اسم نطاق الإحالة" })}</GazaTableHead>
                              <GazaTableHead>{pick(lang, { en: "Page views", ar: "مشاهدات الصفحات" })}</GazaTableHead>
                            </GazaTableRow>
                          </GazaTableHeader>
                          <GazaTableBody>
                            {data.referrerHosts.map((ref) => (
                              <GazaTableRow key={ref.host}>
                                <GazaTableCell>
                                  <Ltr className="font-mono text-xs">{ref.host}</Ltr>
                                </GazaTableCell>
                                <GazaTableCell>
                                  <Ltr>{ref.pageViews.toLocaleString("en-GB")}</Ltr>
                                </GazaTableCell>
                              </GazaTableRow>
                            ))}
                          </GazaTableBody>
                        </GazaTable>
                      </div>
                    </div>
                  )}

                  {/* Honest Empty State Check */}
                  {data.traffic.pageViews === 0 && (
                    <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
                      {pick(lang, {
                        en: "No analytics events recorded in this date range yet.",
                        ar: "لم يتم تسجيل أي أحداث تحليلية في هذا النطاق الزمني بعد.",
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Interaction Funnel */}
              {tab === "funnel" && (
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Metric
                      label={pick(lang, { en: "Flight Searches", ar: "عمليات البحث" })}
                      value={data.interactions.searches.toLocaleString("en-GB")}
                      hint={pick(lang, { en: "Active search executions", ar: "عمليات بحث حية" })}
                    />
                    <Metric
                      label={pick(lang, { en: "Booking Starts", ar: "بدء خطوات الحجز" })}
                      value={data.interactions.bookingStarts.toLocaleString("en-GB")}
                      hint={pick(lang, { en: "Wizard entry", ar: "دخول معالج الحجز" })}
                    />
                    <Metric
                      label={pick(lang, { en: "Confirmed Bookings", ar: "الحجوزات المكتملة" })}
                      value={data.authoritativeBusinessSuccess.confirmedBookings.toLocaleString("en-GB")}
                      hint={pick(lang, { en: "Authoritative server records", ar: "سجلات الخادم المعتمدة" })}
                    />
                  </div>

                  <figure aria-label={pick(lang, { en: "Activity", ar: "مسار التفاعل" })}>
                    <ChartContainer config={funnelChartConfig} className="h-[18rem] w-full aspect-auto">
                      <BarChart
                        accessibilityLayer
                        data={[
                          {
                            stage: pick(lang, { en: "Flight Searches", ar: "البحث عن رحلات" }),
                            value: data.interactions.searches,
                            fill: "var(--brand)",
                          },
                          {
                            stage: pick(lang, { en: "Booking Starts", ar: "بدء الحجز" }),
                            value: data.interactions.bookingStarts,
                            fill: "var(--clay)",
                          },
                          {
                            stage: pick(lang, { en: "Confirmed Bookings", ar: "الحجوزات المؤكدة" }),
                            value: data.authoritativeBusinessSuccess.confirmedBookings,
                            fill: "var(--primary)",
                          },
                        ]}
                        layout="vertical"
                        margin={{ left: 8, right: 24 }}
                      >
                        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={(v) => Number(v).toLocaleString("en-GB")} />
                        <YAxis type="category" dataKey="stage" width={140} tickLine={false} axisLine={false} />
                        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                      </BarChart>
                    </ChartContainer>
                  </figure>
                  <p className="text-xs text-muted-foreground">
                    {pick(lang, { en: "Searches and confirmed reservations are separate totals; they do not establish visitor conversion.", ar: "أعداد البحث والحجوزات المؤكدة مستقلة، ولا تثبت معدل تحويل الزوار." })}
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {([
                      { key: "searches", title: pick(lang, { en: "Searched routes", ar: "المسارات التي بُحث عنها" }), rows: data.routeSearches },
                      { key: "bookings", title: pick(lang, { en: "Confirmed reservations by route", ar: "الحجوزات المؤكدة حسب المسار" }), rows: data.bookingRoutes },
                    ]).map(group => (
                      <section key={group.key} className="rounded-lg border border-border bg-card p-4">
                        <h3 className="mb-3 text-sm font-semibold">{group.title}</h3>
                        {group.rows.length === 0 ? <p className="text-sm text-muted-foreground">{pick(lang, { en: "No records in this period.", ar: "لا توجد سجلات في هذه الفترة." })}</p> : (
                          <GazaTable>
                            <GazaTableHeader><GazaTableRow><GazaTableHead>{pick(lang, { en: "Route", ar: "المسار" })}</GazaTableHead><GazaTableHead>{pick(lang, { en: "Count", ar: "العدد" })}</GazaTableHead></GazaTableRow></GazaTableHeader>
                            <GazaTableBody>{group.rows.map(row => <GazaTableRow key={row.route}><GazaTableCell><Ltr>{row.route}</Ltr></GazaTableCell><GazaTableCell><Ltr>{row.count.toLocaleString("en-GB")}</Ltr></GazaTableCell></GazaTableRow>)}</GazaTableBody>
                          </GazaTable>
                        )}
                      </section>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab 3: Top Pages */}
              {tab === "pages" && (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <GazaTable>
                      <GazaTableCaption>
                        {pick(lang, {
                          en: "Top visited canonical public pages and active engagement times.",
                          ar: "أكثر الصفحات العامة المعتمدة زيارة وأوقات التفاعل النشط.",
                        })}
                      </GazaTableCaption>
                      <GazaTableHeader>
                        <GazaTableRow>
                          <GazaTableHead>{pick(lang, { en: "Canonical Path", ar: "المسار المعتمد" })}</GazaTableHead>
                          <GazaTableHead>{pick(lang, { en: "Views", ar: "المشاهدات" })}</GazaTableHead>
                          <GazaTableHead>{pick(lang, { en: "Total Engagement", ar: "إجمالي وقت التفاعل" })}</GazaTableHead>
                        </GazaTableRow>
                      </GazaTableHeader>
                      <GazaTableBody>
                        {data.topPages.length > 0 ? (
                          data.topPages.map((page) => (
                            <GazaTableRow key={page.path}>
                              <GazaTableCell>
                                <Ltr className="font-mono text-xs">{page.path}</Ltr>
                              </GazaTableCell>
                              <GazaTableCell>
                                <Ltr>{page.views.toLocaleString("en-GB")}</Ltr>
                              </GazaTableCell>
                              <GazaTableCell>
                                <Ltr>{formatSeconds(page.engagementSeconds)}</Ltr>
                              </GazaTableCell>
                            </GazaTableRow>
                          ))
                        ) : (
                          <GazaTableRow>
                            <GazaTableCell colSpan={3} className="text-center text-muted-foreground py-6">
                              {pick(lang, {
                                en: "No page view events recorded in this period.",
                                ar: "لا توجد مشاهدات صفحات مسجلة في هذه الفترة.",
                              })}
                            </GazaTableCell>
                          </GazaTableRow>
                        )}
                      </GazaTableBody>
                    </GazaTable>
                  </div>
                </div>
              )}

              {/* Tab 4: Geographic Sources */}
              {tab === "countries" && (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <GazaTable>
                      <GazaTableCaption>
                        {pick(lang, {
                          en: "No verified location source is configured. Country is Unknown; browser language and timezone are never used to guess it.",
                          ar: "لا يوجد مصدر موثوق للموقع؛ لذلك يُعرض البلد كمجهول، ولا نستخدم لغة المتصفح أو منطقته الزمنية لتخمينه.",
                        })}
                      </GazaTableCaption>
                      <GazaTableHeader>
                        <GazaTableRow>
                          <GazaTableHead>{pick(lang, { en: "Country / Region", ar: "الدولة / المنطقة" })}</GazaTableHead>
                          <GazaTableHead>{pick(lang, { en: "Page Views", ar: "مشاهدات الصفحات" })}</GazaTableHead>
                        </GazaTableRow>
                      </GazaTableHeader>
                      <GazaTableBody>
                        {data.countries.length > 0 ? (
                          data.countries.map((c) => (
                            <GazaTableRow key={c.country}>
                              <GazaTableCell>
                                {c.country === "XX" ? (
                                  <span className="font-semibold text-brand-deep">
                                    {pick(lang, {
                                      en: "Unknown country (Privacy protected)",
                                      ar: "بلد مجهول (محجوب لحماية الخصوصية)",
                                    })}
                                  </span>
                                ) : (
                                  <Ltr className="font-mono text-xs">{c.country}</Ltr>
                                )}
                              </GazaTableCell>
                              <GazaTableCell>
                                <Ltr>{c.pageViews.toLocaleString("en-GB")}</Ltr>
                              </GazaTableCell>
                            </GazaTableRow>
                          ))
                        ) : (
                          <GazaTableRow>
                            <GazaTableCell colSpan={2} className="text-center text-muted-foreground py-6">
                              {pick(lang, {
                                en: "No geographic data recorded for this period.",
                                ar: "لا توجد بيانات جغرافية مسجلة لهذه الفترة.",
                              })}
                            </GazaTableCell>
                          </GazaTableRow>
                        )}
                      </GazaTableBody>
                    </GazaTable>
                  </div>
                </div>
              )}

              {/* Tab 5: Report Settings & Preview */}
              {tab === "settings" && can("admin.manage") && (
                <div className="space-y-6 max-w-2xl">
                  <div className="rounded-xl border border-border p-5 bg-card space-y-4">
                    <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
                      <Mail className="size-4 text-brand" aria-hidden="true" />
                      <span>
                        {pick(lang, {
                          en: "Automated Monthly Analytics Report",
                          ar: "التقرير الشهري التلقائي للتحليلات",
                        })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-2 border-b border-border">
                      <div className="space-y-0.5">
                        <label htmlFor="report-switch" className="text-sm font-medium text-foreground">
                          {pick(lang, { en: "Report Delivery Status", ar: "حالة إرسال التقارير" })}
                        </label>
                        <p className="text-xs text-muted-foreground">
                          {pick(lang, {
                            en: "Dispatch monthly summary automatically to configured recipient.",
                            ar: "إرسال ملخص شهري تلقائياً إلى عنوان البريد المحدد.",
                          })}
                        </p>
                      </div>
                      <Switch
                        id="report-switch"
                        checked={reportEnabled}
                        onCheckedChange={(checked) => {
                          setReportEnabled(checked);
                          setSettingsDirty(true);
                        }}
                      />
                    </div>

                    <AdminField
                      label={pick(lang, { en: "Recipient Email Address", ar: "البريد الإلكتروني المستلم" })}
                      hint={pick(lang, {
                        en: "Receives authoritative monthly reports with strict anti-spoofing.",
                        ar: "يستقبل التقارير الشهرية المعتمدة مع تدقيق أمان المرسل.",
                      })}
                    >
                      <Input
                        type="email"
                        value={reportEmail}
                        dir="ltr"
                        onChange={(e) => {
                          setReportEmail(e.target.value);
                          setSettingsDirty(true);
                        }}
                        className="max-w-md"
                      />
                    </AdminField>

                    {settingsQuery.data && (
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-4 pt-1">
                        <span>
                          {pick(lang, { en: "Revision:", ar: "المراجعة:" })}{" "}
                          <Ltr>{settingsQuery.data.revision}</Ltr>
                        </span>
                        {settingsQuery.data.updatedAt && (
                          <span>
                            {pick(lang, { en: "Last Updated:", ar: "آخر تحديث:" })}{" "}
                            <Ltr>{new Date(settingsQuery.data.updatedAt).toLocaleDateString()}</Ltr>
                          </span>
                        )}
                      </div>
                    )}

                    {settingsNotice && (
                      <div
                        role="alert"
                        className={`text-xs p-3 rounded-md flex items-center gap-2 ${
                          settingsNotice.type === "success"
                            ? "bg-brand/10 text-brand-deep border border-brand/20"
                            : "bg-clay/10 text-clay border border-clay/20"
                        }`}
                      >
                        {settingsNotice.type === "success" ? (
                          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                        ) : (
                          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                        )}
                        <span>{settingsNotice.text}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-2">
                      <Button
                        type="button"
                        onClick={handleSaveSettings}
                        disabled={settingsBusy || !settingsDirty || !reportEmail}
                        size="sm"
                      >
                        {settingsBusy
                          ? pick(lang, { en: "Saving…", ar: "جارٍ الحفظ…" })
                          : pick(lang, { en: "Save Settings", ar: "حفظ الإعدادات" })}
                      </Button>
                    </div>
                  </div>

                  {/* Send Preview Section */}
                  <div className="rounded-xl border border-border p-5 bg-card space-y-4">
                    <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
                      <Send className="size-4 text-clay" aria-hidden="true" />
                      <span>
                        {pick(lang, {
                          en: "Dispatch Report Preview",
                          ar: "إرسال معاينة فورية للتقرير",
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {pick(lang, {
                        en: `Send an immediate test rendering of the report for ${period === "previous_month" ? "previous month" : `the last ${period} days`} to configured recipient (${settingsQuery.data?.recipientEmail || reportEmail || "configured recipient"}). Dispatched asynchronously via existing outbox. Requires recent step-up reauthorization.`,
                        ar: `إرسال معاينة اختبارية فورية للتقرير عن ${period === "previous_month" ? "الشهر السابق" : `آخر ${period} يوماً`} إلى البريد المعتمد (${settingsQuery.data?.recipientEmail || reportEmail || "البريد المحدد"}). يُرسل بصورة غير متزامنة عبر صندوق الصادر المعتمد. يتطلب تحققاً أمنياً حديثاً.`,
                      })}
                    </p>

                    {previewNotice && (
                      <div
                        role="alert"
                        className={`text-xs p-3 rounded-md flex items-center gap-2 ${
                          previewNotice.type === "success"
                            ? "bg-brand/10 text-brand-deep border border-brand/20"
                            : "bg-clay/10 text-clay border border-clay/20"
                        }`}
                      >
                        {previewNotice.type === "success" ? (
                          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                        ) : (
                          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                        )}
                        <span>{previewNotice.text}</span>
                      </div>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSendPreview}
                      disabled={previewBusy || (!settingsQuery.data?.recipientEmail && !reportEmail)}
                      size="sm"
                      className="gap-2"
                    >
                      <Send className="size-3.5" aria-hidden="true" />
                      {previewBusy
                        ? pick(lang, { en: "Dispatching…", ar: "جارٍ الإرسال…" })
                        : pick(lang, { en: "Send Preview Email", ar: "إرسال بريد المعاينة" })}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </AdminTabs>
        </AdminPanel>
      )}
    </div>
  );
}
