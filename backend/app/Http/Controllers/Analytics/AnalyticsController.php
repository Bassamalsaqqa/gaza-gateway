<?php

declare(strict_types=1);

namespace App\Http\Controllers\Analytics;

use App\Analytics\AnalyticsAggregator;
use App\Analytics\AnalyticsEventIngestor;
use App\Analytics\AnalyticsReportSettingsService;
use App\Identity\Rbac\RbacPolicy;
use App\Identity\Sessions\StaffSessionContext;
use App\Reference\Shared\ReferenceResponse;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Ramsey\Uuid\Uuid;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class AnalyticsController
{
    public function __construct(
        private readonly AnalyticsEventIngestor $ingestor,
        private readonly AnalyticsAggregator $aggregator,
        private readonly AnalyticsReportSettingsService $settingsService,
        private readonly RbacPolicy $rbacPolicy,
    ) {}

    /**
     * Public first-party analytics event ingestion endpoint.
     */
    public function ingest(Request $request): Response
    {
        $this->ingestor->ingest($request);

        // Always return 204 No Content for standard beacon/analytics calls
        return response('', 204);
    }

    /**
     * Staff-authorized analytics summary endpoint.
     */
    public function summary(Request $request): Response
    {
        $rawPeriod = (string) $request->query('period', '30');

        try {
            $data = $this->aggregator->getSummary($rawPeriod);
            return ReferenceResponse::success($request, $data);
        } catch (\InvalidArgumentException $e) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }
    }

    /**
     * Staff-authorized report settings read endpoint.
     */
    public function getSettings(Request $request): Response
    {
        $settings = $this->settingsService->read();
        return ReferenceResponse::success($request, $settings);
    }

    /**
     * Staff-authorized report settings update endpoint (higher privilege + recent step-up).
     */
    public function saveSettings(Request $request): Response
    {
        /** @var StaffSessionContext|null $session */
        $session = $request->attributes->get('editorial_staff_session');
        if (!$session instanceof StaffSessionContext || $session->getStaffId() === null) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        }

        if (!$this->rbacPolicy->hasRecentStepUp($session)) {
            return ReferenceResponse::error($request, 403, 'step_up_required');
        }

        $authorizer = $request->attributes->get('editorial_authorizer');
        if (is_callable($authorizer)) {
            $authorizer();
        }

        $staffId = (string) $session->getStaffId();
        $body = $request->json()->all();
        if (empty($body)) {
            $body = $request->all();
        }

        try {
            $updated = $this->settingsService->save($body, $staffId);
            return ReferenceResponse::success($request, $updated);
        } catch (HttpException $e) {
            return ReferenceResponse::error($request, $e->getStatusCode(), 'conflict');
        } catch (\InvalidArgumentException) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }
    }

    /**
     * Safe rate-limited monthly report preview dispatch enqueuing into archive_mail_outbox.
     * Returns 202 Accepted with standard ReferenceResponse envelope; never performs SMTP inside auth transaction.
     */
    public function preview(Request $request): Response
    {
        /** @var StaffSessionContext|null $session */
        $session = $request->attributes->get('editorial_staff_session');
        if (!$session instanceof StaffSessionContext || $session->getStaffId() === null) {
            return ReferenceResponse::error($request, 401, 'unauthenticated');
        }

        if (!$this->rbacPolicy->hasRecentStepUp($session)) {
            return ReferenceResponse::error($request, 403, 'step_up_required');
        }

        $authorizer = $request->attributes->get('editorial_authorizer');
        if (is_callable($authorizer)) {
            $authorizer();
        }

        $staffId = (string) $session->getStaffId();

        // Idempotent requestId (UUID)
        $rawRequestId = $request->input('requestId') ?? $request->header('X-Request-Id');
        if (!is_string($rawRequestId) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $rawRequestId)) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }
        $requestId = strtolower($rawRequestId);

        // UUID scoped to staff/purpose to prevent global outbox ID collision
        $scopedOutboxId = (string) Uuid::uuid5(Uuid::NAMESPACE_OID, 'analytics_preview:' . $staffId . ':' . $requestId);

        $configuredRecipient = $this->settingsService->read()['recipientEmail'];
        $period = (string) ($request->input('period') ?? 'previous_month');

        try {
            // Idempotent replay check: if scoped outbox row already exists, return existing receipt WITHOUT consuming rate limit
            $existing = DB::table('archive_mail_outbox')
                ->where('id', $scopedOutboxId)
                ->where('purpose', 'analytics_preview')
                ->first();

            if ($existing !== null) {
                return ReferenceResponse::success($request, [
                    'status' => $existing->status === 'pending' ? 'queued' : (string) $existing->status,
                    'outboxId' => $scopedOutboxId,
                    'requestId' => $requestId,
                    'recipient' => (string) $existing->recipient,
                    'period' => (string) (json_decode(Crypt::decryptString($existing->encrypted_payload), true, 32, JSON_THROW_ON_ERROR)['period']),
                    'idempotent' => true,
                ], 202);
            }

            // Durable rate limit on new preview dispatch claims (5 per hour)
            $rateKey = 'analytics_preview_' . $staffId;
            if (RateLimiter::tooManyAttempts($rateKey, 5)) {
                return ReferenceResponse::error($request, 429, 'rate_limit_exceeded');
            }
            RateLimiter::hit($rateKey, 3600);

            $summary = $this->aggregator->getSummary($period);
            $range = $this->aggregator->resolveDateRange($period);
            $periodLabel = $range['period_identifier'];
            $now = CarbonImmutable::now('UTC')->format('Y-m-d H:i:s.u');

            DB::table('archive_mail_outbox')->insert([
                'id' => $scopedOutboxId,
                'purpose' => 'analytics_preview',
                'contribution_id' => null,
                'contact_id' => null,
                'recipient' => $configuredRecipient,
                'cc_recipient' => null,
                'encrypted_payload' => Crypt::encryptString(json_encode([
                    'purpose' => 'analytics_preview',
                    'period' => $periodLabel,
                    'summary' => $summary,
                ], JSON_THROW_ON_ERROR)),
                'status' => 'pending',
                'generation' => 1,
                'attempts' => 0,
                'next_attempt_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            return ReferenceResponse::success($request, [
                'status' => 'queued',
                'outboxId' => $scopedOutboxId,
                'requestId' => $requestId,
                'recipient' => $configuredRecipient,
                'period' => $periodLabel,
            ], 202);
        } catch (\InvalidArgumentException) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        } catch (\Throwable) {
            return ReferenceResponse::error($request, 500, 'preview_dispatch_failed');
        }
    }
}
