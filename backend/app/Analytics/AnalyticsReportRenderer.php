<?php

declare(strict_types=1);

namespace App\Analytics;

final class AnalyticsReportRenderer
{
    /**
     * Render the branded bilingual HTML email for the monthly report.
     *
     * @param array<string, mixed> $summary Aggregated summary data
     * @param string $period e.g. '2026-09'
     * @return string Valid inline-styled HTML
     */
    public function renderHtml(array $summary, string $period): string
    {
        $captureSince = htmlspecialchars((string) ($summary['metadata']['captureSince'] ?? 'No opt-in page events recorded'), ENT_QUOTES, 'UTF-8');
        $traffic = $summary['traffic'] ?? [];
        $business = $summary['authoritativeBusinessSuccess'] ?? [];
        $interactions = $summary['interactions'] ?? [];
        $topPages = $summary['topPages'] ?? [];
        $countries = $summary['countries'] ?? [];

        $pageViews = number_format((int) ($traffic['pageViews'] ?? 0));
        $uniqueSessions = number_format((int) ($traffic['uniqueSessions'] ?? 0));
        $uniqueVisitors = number_format((int) ($traffic['uniqueVisitors'] ?? 0));
        $totalEngagementSeconds = (int) ($traffic['totalEngagementSeconds'] ?? 0);
        $engagementHours = round($totalEngagementSeconds / 3600, 1);
        $avgEngagement = number_format((float) ($traffic['avgEngagementSecondsPerSession'] ?? 0), 1);

        $confirmedBookings = number_format((int) ($business['confirmedBookings'] ?? 0));
        $archiveContributions = number_format((int) ($business['archiveContributions'] ?? 0));

        $searches = number_format((int) ($interactions['searches'] ?? 0));
        $bookingStarts = number_format((int) ($interactions['bookingStarts'] ?? 0));
        $archiveExplores = number_format((int) ($interactions['archiveExplores'] ?? 0));

        // Format top pages table rows
        $topPagesHtml = '';
        foreach (array_slice($topPages, 0, 5) as $page) {
            $path = htmlspecialchars((string) ($page['path'] ?? '/'), ENT_QUOTES, 'UTF-8');
            $views = number_format((int) ($page['views'] ?? 0));
            $topPagesHtml .= "
                <tr>
                    <td style=\"padding: 8px 12px; border-bottom: 1px solid #ede4d4; font-family: monospace; font-size: 13px; color: #1c211e; direction: ltr; text-align: left;\"><span dir=\"ltr\">{$path}</span></td>
                    <td style=\"padding: 8px 12px; border-bottom: 1px solid #ede4d4; text-align: right; font-weight: 600; color: #1b3323; direction: ltr;\"><span dir=\"ltr\">{$views}</span></td>
                </tr>
            ";
        }
        if ($topPagesHtml === '') {
            $topPagesHtml = '<tr><td colspan="2" style="padding: 12px; text-align: center; color: #736b5e;">No page views recorded / لا توجد زيارات مسجلة</td></tr>';
        }

        // Format countries summary
        $countriesList = [];
        foreach (array_slice($countries, 0, 5) as $c) {
            $code = htmlspecialchars(($c['country'] ?? 'XX') === 'XX' ? 'Unknown' : (string) $c['country'], ENT_QUOTES, 'UTF-8');
            $cViews = number_format((int) ($c['pageViews'] ?? $c['views'] ?? 0));
            $countriesList[] = "<span dir=\"ltr\"><strong>{$code}</strong>: {$cViews}</span>";
        }
        $countriesHtml = !empty($countriesList) ? implode(' &nbsp;&bull;&nbsp; ', $countriesList) : '<span>Unknown: no page views recorded</span>';

        $safePeriod = htmlspecialchars($period, ENT_QUOTES, 'UTF-8');
        $startCovered = htmlspecialchars((string) ($summary['periodStart'] ?? "{$period}-01"), ENT_QUOTES, 'UTF-8');
        $endCovered = htmlspecialchars((string) ($summary['periodEnd'] ?? "{$period} end"), ENT_QUOTES, 'UTF-8');

        return <<<HTML
<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gaza International Airport — Monthly Report [{$safePeriod}]</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fbf8f3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1c211e; -webkit-font-smoothing: antialiased;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #fbf8f3; padding: 24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" style="max-width: 640px; background-color: #ffffff; border: 1px solid #ede4d4; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04);" cellspacing="0" cellpadding="0">

                    <!-- Header -->
                    <tr>
                        <td style="background-color: #1b3323; padding: 28px 24px; text-align: center;">
                            <div style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; color: #c86446; margin-bottom: 6px;">
                                Performance Summary &bull; تقرير الأداء الشهري
                            </div>
                            <h1 style="margin: 0; font-size: 22px; color: #fbf8f3; font-weight: 700; line-height: 1.3;">
                                Gaza International Airport &bull; مطار غزة الدولي
                            </h1>
                            <div style="margin-top: 4px; font-size: 14px; color: #ede4d4;">
                                Palestine Airways Limited &bull; الخطوط الجوية الفلسطينية
                            </div>
                            <div style="display: inline-block; margin-top: 14px; padding: 4px 14px; background-color: rgba(251, 248, 243, 0.15); border-radius: 4px; font-size: 13px; color: #fbf8f3; font-weight: 600; direction: ltr;">
                                Period / الفترة: <span dir="ltr">{$safePeriod}</span>
                            </div>
                        </td>
                    </tr>

                    <!-- Executive Notice / Arabic Banner -->
                    <tr>
                        <td style="padding: 18px 24px 12px 24px; background-color: #f5efe4; border-bottom: 1px solid #ede4d4; text-align: center;">
                            <div dir="rtl" style="font-size: 14px; color: #1b3323; font-weight: 600; line-height: 1.5; direction: rtl;">
                                تقرير الأداء الشهري للبوابة الرقمية والأرشيف لشهر <span dir="ltr">{$safePeriod}</span>.
                            </div>
                            <div style="font-size: 12px; color: #5a5448; margin-top: 4px; line-height: 1.4; direction: ltr;">
                                Retained opt-in capture since: {$captureSince}<br>Covered window: <span dir="ltr">{$startCovered}</span> to <span dir="ltr">{$endCovered}</span> (Asia/Hebron).
                            </div>
                            <div style="font-size: 11px; color: #736b5e; margin-top: 2px;">
                                Dispatch is tracked in the private outbox; inbox delivery is not confirmed.
                            </div>
                        </td>
                    </tr>

                    <!-- Authoritative Business Success -->
                    <tr>
                        <td style="padding: 24px;">
                            <h2 style="margin: 0 0 16px 0; font-size: 16px; text-transform: uppercase; letter-spacing: 1px; color: #b85838; border-bottom: 2px solid #f5efe4; padding-bottom: 6px;">
                                Authoritative Records &bull; السجلات المعتمدة
                            </h2>

                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 20px;">
                                <tr>
                                    <td width="50%" style="padding: 14px; background-color: #fbf8f3; border: 1px solid #ede4d4; border-radius: 6px; text-align: center;">
                                        <div style="font-size: 26px; font-weight: 700; color: #1b3323; direction: ltr;"><span dir="ltr">{$confirmedBookings}</span></div>
                                        <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #b85838; margin-top: 4px;">
                                            Confirmed Bookings
                                        </div>
                                        <div style="font-size: 12px; color: #736b5e; direction: rtl; margin-top: 2px;">
                                            حجوزات تذكارية مؤكدة
                                        </div>
                                    </td>
                                    <td width="12"></td>
                                    <td width="50%" style="padding: 14px; background-color: #fbf8f3; border: 1px solid #ede4d4; border-radius: 6px; text-align: center;">
                                        <div style="font-size: 26px; font-weight: 700; color: #1b3323; direction: ltr;"><span dir="ltr">{$archiveContributions}</span></div>
                                        <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #b85838; margin-top: 4px;">
                                            Archive Submissions
                                        </div>
                                        <div style="font-size: 12px; color: #736b5e; direction: rtl; margin-top: 2px;">
                                            مساهمات أرشيفية مستلمة
                                        </div>
                                    </td>
                                </tr>
                            </table>

                            <!-- First-Party Portal Engagement -->
                            <h2 style="margin: 24px 0 16px 0; font-size: 16px; text-transform: uppercase; letter-spacing: 1px; color: #1b3323; border-bottom: 2px solid #f5efe4; padding-bottom: 6px;">
                                Portal Traffic &bull; حركة البوابة الرقمية
                            </h2>

                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 20px;">
                                <tr>
                                    <td width="33%" style="padding: 12px; background-color: #f9f6f0; border: 1px solid #ede4d4; border-radius: 4px; text-align: center;">
                                        <div style="font-size: 20px; font-weight: 700; color: #1c211e; direction: ltr;"><span dir="ltr">{$pageViews}</span></div>
                                        <div style="font-size: 11px; color: #736b5e; text-transform: uppercase; margin-top: 2px;">Page Views / مشاهدات</div>
                                    </td>
                                    <td width="8"></td>
                                    <td width="33%" style="padding: 12px; background-color: #f9f6f0; border: 1px solid #ede4d4; border-radius: 4px; text-align: center;">
                                        <div style="font-size: 20px; font-weight: 700; color: #1c211e; direction: ltr;"><span dir="ltr">{$uniqueSessions}</span></div>
                                        <div style="font-size: 11px; color: #736b5e; text-transform: uppercase; margin-top: 2px;">Sessions / جلسات</div>
                                    </td>
                                    <td width="8"></td>
                                    <td width="33%" style="padding: 12px; background-color: #f9f6f0; border: 1px solid #ede4d4; border-radius: 4px; text-align: center;">
                                        <div style="font-size: 20px; font-weight: 700; color: #1c211e; direction: ltr;"><span dir="ltr">{$engagementHours}h</span></div>
                                        <div style="font-size: 11px; color: #736b5e; text-transform: uppercase; margin-top: 2px;">Total Time / وقت التفاعل</div>
                                    </td>
                                </tr>
                            </table>

                            <!-- Visitor Interactions -->
                            <table role="presentation" width="100%" style="border-collapse: collapse; margin-bottom: 20px;" cellspacing="0" cellpadding="0">
                                <tr style="background-color: #f5efe4;">
                                    <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #1b3323;">Action &bull; الإجراء</th>
                                    <th style="padding: 8px 12px; text-align: right; font-size: 12px; color: #1b3323;">Count &bull; العدد</th>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 12px; border-bottom: 1px solid #ede4d4; font-size: 13px;">Searches Executed &bull; عمليات البحث</td>
                                    <td style="padding: 8px 12px; border-bottom: 1px solid #ede4d4; text-align: right; font-weight: 600; direction: ltr;"><span dir="ltr">{$searches}</span></td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 12px; border-bottom: 1px solid #ede4d4; font-size: 13px;">Booking Starts &bull; بدء الحجز التذكاري</td>
                                    <td style="padding: 8px 12px; border-bottom: 1px solid #ede4d4; text-align: right; font-weight: 600; direction: ltr;"><span dir="ltr">{$bookingStarts}</span></td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 12px; border-bottom: 1px solid #ede4d4; font-size: 13px;">Archive Explores &bull; استعراض الأرشيف</td>
                                    <td style="padding: 8px 12px; border-bottom: 1px solid #ede4d4; text-align: right; font-weight: 600; direction: ltr;"><span dir="ltr">{$archiveExplores}</span></td>
                                </tr>
                            </table>

                            <!-- Top Visited Pages -->
                            <h3 style="margin: 20px 0 8px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #1b3323;">
                                Top Visited Pages &bull; أكثر الصفحات زيارة
                            </h3>
                            <table role="presentation" width="100%" style="border-collapse: collapse; margin-bottom: 18px;" cellspacing="0" cellpadding="0">
                                <tr style="background-color: #f5efe4;">
                                    <th style="padding: 6px 12px; text-align: left; font-size: 11px; color: #1b3323;">Route</th>
                                    <th style="padding: 6px 12px; text-align: right; font-size: 11px; color: #1b3323;">Views</th>
                                </tr>
                                {$topPagesHtml}
                            </table>

                            <!-- Origin Distribution -->
                            <div style="padding: 12px; background-color: #fbf8f3; border: 1px dashed #ede4d4; border-radius: 4px; font-size: 12px; color: #5a5448; margin-top: 14px;">
                                <strong style="color: #1b3323;">Country (Unknown without verified location source):</strong> {$countriesHtml}
                            </div>
                        </td>
                    </tr>

                    <tr><td style="padding: 12px 24px; text-align: center;">
                        <a href="https://www.gazaairport.com/admin/analytics" style="display: inline-block; padding: 12px 18px; background: #1b3323; color: #fbf8f3; text-decoration: none; border-radius: 5px;">Open private analytics</a>
                        <div dir="rtl" style="margin-top: 6px;">فتح التحليلات الخاصة</div>
                    </td></tr>
                    <!-- Footer & Privacy Provenance -->
                    <tr>
                        <td style="background-color: #f5efe4; border-top: 1px solid #ede4d4; padding: 20px 24px; font-size: 12px; color: #736b5e; line-height: 1.5;">
                            <div style="margin-bottom: 8px;">
                                <strong>Privacy & Measurement Policy:</strong> This report is compiled strictly via first-party, privacy-preserving measurements. Inbox delivery is not independently confirmed. Analytics records omit names, booking details, raw IP addresses and user agents. Opt-in session estimates are separate from authoritative booking totals; conversion rates are not inferred.
                            </div>
                            <div dir="rtl" style="direction: rtl; margin-bottom: 10px; color: #5a5448;">
                                <strong>سياسة الخصوصية والقياس:</strong> تم إعداد هذا التقرير اعتماداً على قياسات الطرف الأول الخالية من أي بيانات تعريف شخصية أو عناوين اتصال أو ملفات تتبع تجارية.
                            </div>
                            <div style="border-top: 1px solid #ede4d4; padding-top: 8px; font-size: 11px; text-align: center; color: #8c8275;">
                                &copy; Palestine Airways Limited &bull; Gaza International Airport (Yasser Arafat International Airport) &bull; Asia/Hebron Timezone
                            </div>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
HTML;
    }

    public function renderPlainText(array $summary, string $period): string
    {
        $traffic = $summary['traffic'] ?? [];
        $business = $summary['authoritativeBusinessSuccess'] ?? [];
        $interactions = $summary['interactions'] ?? [];

        $pvs = number_format((int) ($traffic['pageViews'] ?? 0));
        $sessions = number_format((int) ($traffic['uniqueSessions'] ?? 0));
        $bookings = number_format((int) ($business['confirmedBookings'] ?? 0));
        $contribs = number_format((int) ($business['archiveContributions'] ?? 0));

        return "GAZA INTERNATIONAL AIRPORT / PALESTINE AIRWAYS LIMITED\n" .
            "مطار غزة الدولي / الخطوط الجوية الفلسطينية\n\n" .
            "Monthly Performance Report [{$period}]\n" .
            "التقرير الشهري للأداء [{$period}]\n\n" .
            "Authoritative Confirmed Bookings: {$bookings}\n" .
            "Authoritative Archive Submissions: {$contribs}\n" .
            "Page Views: {$pvs}\n" .
            "Unique Sessions: {$sessions}\n\n" .
            "Dispatch: tracked in the private outbox; inbox delivery is not confirmed.\n" .
            "First-party measurement only. Zero PII, IP, or commercial trackers stored.\n";
    }

    public function buildSubject(string|array $period): string
    {
        $periodStr = is_array($period) ? (string) ($period['period'] ?? $period['period_identifier'] ?? 'latest') : (string) $period;
        return "Gaza Airport — Monthly Performance Report [{$periodStr}] | مطار غزة الدولي — تقرير الأداء";
    }
}
