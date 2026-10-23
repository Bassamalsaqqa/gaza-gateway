<?php

declare(strict_types=1);

namespace App\Analytics;

use Carbon\CarbonImmutable;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

final class AnalyticsMaintenanceRunner
{
    public function __construct(
        private readonly ?AnalyticsAggregator $aggregator = null,
        private readonly ?AnalyticsReportSettingsService $settingsService = null,
    ) {}

    /**
     * Run bounded maintenance tasks: 90-day retention purge and monthly report claim.
     *
     * @param callable(): float|null $getRemaining
     * @return array{events_purged: int, sessions_purged: int, report_enqueued: bool, reports_processed: int}
     */
    public function run(?callable $getRemaining = null): array
    {
        $eventsPurged = 0;
        $sessionsPurged = 0;
        $reportEnqueued = false;

        // 1. Bounded session anchor purge (idle > 90 days)
        if (Schema::hasTable('analytics_sessions')) {
            if ($getRemaining === null || $getRemaining() >= 3.0) {
                $sessionsPurged = $this->purgeStaleSessions(limit: 200);
            }
        }

        // 2. Bounded raw analytics retention purge (90 days max retention)
        if (Schema::hasTable('analytics_events')) {
            if ($getRemaining === null || $getRemaining() >= 3.0) {
                $eventsPurged = $this->purgeStaleEvents(limit: 200);
            }
        }

        // 3. Monthly report generation & outbox enqueue
        if (Schema::hasTable('analytics_monthly_reports') && Schema::hasTable('analytics_report_settings') && Schema::hasTable('archive_mail_outbox')) {
            if ($getRemaining === null || $getRemaining() >= 5.0) {
                $reportEnqueued = $this->ensurePreviousMonthReportEnqueued();
            }
        }

        return [
            'events_purged' => $eventsPurged,
            'sessions_purged' => $sessionsPurged,
            'report_enqueued' => $reportEnqueued,
            'reports_processed' => $reportEnqueued ? 1 : 0,
        ];
    }

    /**
     * Purge events older than 90 days in a bounded batch.
     */
    public function purgeStaleEvents(int $limit = 200): int
    {
        $retentionDays = (int) config('analytics.retention_days', 90);
        $cutoffUtc = CarbonImmutable::now('UTC')->subDays($retentionDays)->format('Y-m-d H:i:s.u');

        return DB::transaction(function () use ($cutoffUtc, $limit): int {
            // Select bounded IDs to delete to keep transaction short
            $ids = DB::table('analytics_events')
                ->where('created_at', '<', $cutoffUtc)
                ->limit($limit)
                ->pluck('id')
                ->all();

            if (empty($ids)) {
                return 0;
            }

            return DB::table('analytics_events')
                ->whereIn('id', $ids)
                ->delete();
        });
    }

    /**
     * Purge idle session anchors older than 90 days in a bounded batch.
     */
    public function purgeStaleSessions(int $limit = 200): int
    {
        $retentionDays = (int) config('analytics.retention_days', 90);
        $cutoffUtc = CarbonImmutable::now('UTC')->subDays($retentionDays)->format('Y-m-d H:i:s.u');

        return DB::transaction(function () use ($cutoffUtc, $limit): int {
            $visitorIds = DB::table('analytics_sessions')
                ->where('last_event_at', '<', $cutoffUtc)
                ->limit($limit)
                ->pluck('visitor_id')
                ->all();

            if (empty($visitorIds)) {
                return 0;
            }

            return DB::table('analytics_sessions')
                ->whereIn('visitor_id', $visitorIds)
                ->delete();
        });
    }

    /**
     * Transaction-safe claim & enqueue of previous calendar month report in Asia/Hebron timezone.
     */
    public function ensurePreviousMonthReportEnqueued(?DateTimeImmutable $referenceTime = null): bool
    {
        $settings = $this->settingsService ?? (function_exists('app') ? app(AnalyticsReportSettingsService::class) : new AnalyticsReportSettingsService());
        $currentSettings = $settings->read();

        // Opt-in check: only enqueue if explicitly enabled by authorized staff
        if (empty($currentSettings['enabled'])) {
            return false;
        }

        $aggregator = $this->aggregator ?? (function_exists('app') ? app(AnalyticsAggregator::class) : new AnalyticsAggregator());
        $range = $aggregator->resolveDateRange('previous_month', $referenceTime);
        $period = $range['period_identifier']; // e.g. '2026-09'

        // Check if report record already exists for this period
        $existing = DB::table('analytics_monthly_reports')->where('period', $period)->first();
        if ($existing !== null) {
            return false;
        }

        // Unique period claim inside a transaction
        return DB::transaction(function () use ($aggregator, $period, $range, $currentSettings, $referenceTime): bool {
            // Serialize closed-month claims through the existing singleton settings row.
            $settingsRow = DB::table('analytics_report_settings')->where('id', 1)->lockForUpdate()->first();
            if (!$settingsRow || !$settingsRow->enabled) return false;
            $currentSettings['recipientEmail'] = (string) $settingsRow->recipient_email;
            $locked = DB::table('analytics_monthly_reports')
                ->where('period', $period)
                ->lockForUpdate()
                ->first();

            if ($locked !== null) {
                return false;
            }

            // Compute summary metrics for the previous calendar month using original reference time
            $evalRefTime = $referenceTime ?? $range['end_utc']->setTimezone(new DateTimeZone(AnalyticsAggregator::TIMEZONE));
            $summary = $aggregator->getSummary('previous_month', $evalRefTime);
            $payloadJson = json_encode($summary, JSON_THROW_ON_ERROR);

            $reportId = (string) Str::uuid();
            $outboxId = (string) Str::uuid();
            $recipient = $currentSettings['recipientEmail'] ?? AnalyticsReportSettingsService::DEFAULT_RECIPIENT;
            $now = CarbonImmutable::now('UTC')->format('Y-m-d H:i:s.u');

            // 1. Enqueue email into archive_mail_outbox with encrypted payload and purpose 'analytics_report'
            DB::table('archive_mail_outbox')->insert([
                'id' => $outboxId,
                'purpose' => 'analytics_report',
                'contribution_id' => null,
                'contact_id' => null,
                'recipient' => $recipient,
                'cc_recipient' => null,
                'encrypted_payload' => Crypt::encryptString(json_encode([
                    'purpose' => 'analytics_report',
                    'period' => $period,
                    'summary' => $summary,
                ], JSON_THROW_ON_ERROR)),
                'status' => 'pending',
                'generation' => 1,
                'attempts' => 0,
                'next_attempt_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            // 2. Insert metadata row into analytics_monthly_reports with FK to archive_mail_outbox
            DB::table('analytics_monthly_reports')->insert([
                'id' => $reportId,
                'period' => $period,
                'period_start' => $range['start_utc']->format('Y-m-d H:i:s.u'),
                'period_end' => $range['end_utc']->format('Y-m-d H:i:s.u'),
                'recipient' => $recipient,
                'outbox_id' => $outboxId,
                'summary_payload' => $payloadJson,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            Log::info('Analytics monthly report claimed and enqueued into archive_mail_outbox', [
                'report_id' => $reportId,
                'outbox_id' => $outboxId,
                'period' => $period,
            ]);

            return true;
        });
    }
}
