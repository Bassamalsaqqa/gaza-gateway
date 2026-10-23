<?php

declare(strict_types=1);

namespace Tests\Feature\Analytics;

use App\Identity\Protocol\CookieSecurity;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Mfa\TotpSecret;
use App\Identity\Sessions\StaffSessionStore;
use Illuminate\Contracts\Encryption\Encrypter;
use App\Analytics\AnalyticsMaintenanceRunner;
use App\Analytics\AnalyticsAggregator;
use App\Analytics\AnalyticsReportRenderer;

/** Exercises the real HTTP stack against the guarded disposable MySQL target. */
final class AnalyticsHttpAcceptanceTest extends TestCase
{
    private static ?string $staffPasswordHash = null;

    private function staffSession(string $role = 'admin'): array
    {
        $id = (string) Str::uuid();
        self::$staffPasswordHash ??= app(Argon2idPasswordHasher::class)->hash('Synthetic-staff-password-2026', 'staff');
        DB::table('staff_users')->insert([
            'id' => $id,
            'username' => 'staff-' . $id,
            'email' => $id . '@example.invalid',
            'full_name_en' => 'Synthetic Staff',
            'full_name_ar' => 'Synthetic Staff',
            'password_hash' => self::$staffPasswordHash,
            'role' => $role,
            'status' => 'invited',
            'credential_epoch' => 1,
            'email_verified_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);
        DB::table('staff_mfa_credentials')->insert([
            'staff_id' => $id,
            'version' => 1,
            'encrypted_secret' => app(Encrypter::class)->encrypt(TotpSecret::generate()->revealBase32Secret()),
            'confirmed_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);
        DB::table('staff_users')->where('id', $id)->update(['status' => 'active', 'mfa_version' => 1]);
        $receipt = app(StaffSessionStore::class)->issueFull($id, 1, 1, new \DateTimeImmutable('-1 second'));
        return [
            'staffId' => $id,
            'id' => $receipt->sessionId,
            'cookie' => $receipt->getRawToken(),
            'csrf' => $receipt->getCsrfToken(),
        ];
    }

    protected function setUp(): void
    {
        parent::setUp();
        if (!DB::table('airports')->where('code', 'GZA')->exists()) {
            DB::table('airports')->insert([
                'code' => 'GZA',
                'airport_name_en' => 'Gaza International Airport',
                'airport_name_ar' => 'مطار غزة الدولي',
                'city_en' => 'Gaza',
                'city_ar' => 'غزة',
                'country_en' => 'Palestine',
                'country_ar' => 'فلسطين',
                'timezone' => 'Asia/Gaza',
                'block_minutes' => 20,
                'active' => true,
            ]);
        }

        if (!DB::table('airports')->where('code', 'AMM')->exists()) {
            DB::table('airports')->insert([
                'code' => 'AMM',
                'airport_name_en' => 'Queen Alia International Airport',
                'airport_name_ar' => 'مطار الملكة علياء الدولي',
                'city_en' => 'Amman',
                'city_ar' => 'عمان',
                'country_en' => 'Jordan',
                'country_ar' => 'الأردن',
                'timezone' => 'Asia/Amman',
                'block_minutes' => 55,
                'active' => true,
            ]);
        }


        config(['analytics.enabled' => true, 'app.allowed_hosts' => ['127.0.0.1'],
            'app.url' => 'https://127.0.0.1:18090',
            'cors.allowed_origins' => ['https://127.0.0.1:18090']]);
    }

    private function event(array $overrides = []): array
    {
        return array_replace(['eventType' => 'page_view', 'visitorId' => (string) Str::uuid(),
            'eventId' => (string) Str::uuid(), 'path' => '/flights'], $overrides);
    }

    private function send(string $method, string $path, ?array $body = null, array $headers = [], ?string $raw = null): TestResponse
    {
        $this->flushHeaders();
        $raw ??= $body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR);
        return $this->call($method, 'https://127.0.0.1:18090/api/v1'.$path, [], [], [], array_replace([
            'HTTPS' => 'on', 'SERVER_PORT' => 443, 'HTTP_HOST' => '127.0.0.1:18090',
            'HTTP_ORIGIN' => 'https://127.0.0.1:18090', 'HTTP_ACCEPT' => 'application/json',
            'CONTENT_TYPE' => 'application/json', 'CONTENT_LENGTH' => strlen($raw),
            'HTTP_USER_AGENT' => 'Mozilla/5.0 Gaza disposable acceptance',
            'REMOTE_ADDR' => '2001:db8:'.bin2hex(random_bytes(2)).'::1',
        ], $headers), $raw);
    }

    public function test_real_staff_routes_resolve_and_deny_anonymous_access(): void
    {
        $this->send('GET', '/admin/analytics/summary')->assertStatus(401);
        $this->send('GET', '/admin/analytics/reports/settings')->assertStatus(401);
        $this->send('POST', '/admin/analytics/reports/preview', ['requestId' => (string) Str::uuid()])->assertStatus(401);
    }

    public function test_collector_accepts_only_bounded_same_origin_public_events(): void
    {
        $event = $this->event();
        $this->send('POST', '/analytics/events', $event)->assertStatus(204);
        $this->assertSame(1, DB::table('analytics_events')->where('event_id', $event['eventId'])->count());
        $this->send('POST', '/analytics/events', $this->event(), ['HTTP_ORIGIN' => 'null'])->assertStatus(403);
        $this->send('POST', '/analytics/events', $this->event(), ['HTTP_ORIGIN' => ''])->assertStatus(403);
        $this->send('POST', '/analytics/events', $this->event(['eventType' => 'booking_confirmed']))->assertStatus(422);
        $this->send('POST', '/analytics/events', $this->event(['visitorId' => ['invalid']]))->assertStatus(422);
        $this->send('POST', '/analytics/events', $this->event(['engagementSeconds' => '30']))->assertStatus(422);
        $this->send('POST', '/analytics/events', $this->event(['path' => '/ar/admin/settings']))->assertStatus(403);
        $this->send('POST', '/analytics/events', null, [], str_repeat(' ', 16385))->assertStatus(413);
        $search = $this->event(['eventType'=>'search','searchRoute'=>'GZA-AMM']);
        $this->send('POST','/analytics/events',$search)->assertStatus(204);
        $this->assertSame('GZA-AMM', DB::table('analytics_events')->where('event_id',$search['eventId'])->value('search_route'));
        $this->send('POST','/analytics/events',$this->event(['eventType'=>'search','searchRoute'=>'private@example.invalid']))->assertStatus(422);
    }

    public function test_privacy_signals_and_staff_cookie_do_not_create_events(): void
    {
        foreach ([['HTTP_DNT' => '1'], ['HTTP_SEC_GPC' => '1'],
            ['HTTP_COOKIE' => CookieSecurity::COOKIE_STAFF.'=not-a-real-session']] as $headers) {
            $event = $this->event();
            $this->send('POST', '/analytics/events', $event, $headers)->assertStatus(204);
            $this->assertSame(0, DB::table('analytics_events')->where('event_id', $event['eventId'])->count());
        }
    }

    public function test_replay_does_not_change_session_counters_or_create_another_visit(): void
    {
        $event = $this->event();
        $this->send('POST', '/analytics/events', $event)->assertStatus(204);
        $before = (array) DB::table('analytics_sessions')->where('visitor_id', $event['visitorId'])->first();
        $this->send('POST', '/analytics/events', $event)->assertStatus(204);
        $after = (array) DB::table('analytics_sessions')->where('visitor_id', $event['visitorId'])->first();
        $this->assertSame($before['event_count'], $after['event_count']);
        $this->assertSame($before['total_engagement_seconds'], $after['total_engagement_seconds']);
        $this->assertSame(1, DB::table('analytics_sessions')->where('visitor_id', $event['visitorId'])->count());
    }

    public function test_immediate_forged_engagement_cannot_claim_a_minute(): void
    {
        $event = $this->event();
        $this->send('POST', '/analytics/events', $event)->assertStatus(204);
        $this->send('POST', '/analytics/events', array_replace($event,
            ['eventId' => (string) Str::uuid(), 'eventType' => 'engagement', 'engagementSeconds' => 60]));
        $this->assertLessThanOrEqual(2, (int) DB::table('analytics_events')
            ->where('visitor_id', $event['visitorId'])->sum('engagement_seconds'));
    }

    public function test_authenticated_report_preview_is_queued_once_and_rbac_is_preserved(): void
    {
        $staff = $this->staffSession();
        $headers = ['HTTP_COOKIE' => CookieSecurity::COOKIE_STAFF.'='.$staff['cookie'],
            'HTTP_X_CSRF_TOKEN' => $staff['csrf']];
        $this->send('GET', '/admin/analytics/summary', null, $headers)->assertOk()->assertJsonPath('success', true);
        $requestId = (string) Str::uuid();
        $one = $this->send('POST', '/admin/analytics/reports/preview', ['requestId'=>$requestId], $headers);
        $one->assertStatus(202)->assertJsonPath('success', true)->assertJsonPath('data.status', 'queued');
        $two = $this->send('POST', '/admin/analytics/reports/preview', ['requestId'=>$requestId], $headers);
        $two->assertStatus(202)->assertJsonPath('data.outboxId', $one->json('data.outboxId'));
        $this->assertSame(1, DB::table('archive_mail_outbox')->where('id',$one->json('data.outboxId'))->count());
        $settings = $this->send('GET','/admin/analytics/reports/settings',null,$headers)->assertOk()->json('data');
        $input = ['expectedRevision'=>$settings['revision'],'enabled'=>false,'recipientEmail'=>'notifications@gazaairport.com'];
        $this->send('PUT','/admin/analytics/reports/settings',$input,$headers)->assertOk();
        $this->send('PUT','/admin/analytics/reports/settings',$input,$headers)->assertStatus(409);
        DB::table('staff_sessions')->where('id',$staff['id'])->update(['mfa_verified_at'=>DB::raw('UTC_TIMESTAMP(6) - INTERVAL 6 MINUTE')]);
        $this->send('POST','/admin/analytics/reports/preview',['requestId'=>(string)Str::uuid()],$headers)
            ->assertStatus(403)->assertJsonPath('error.code','step_up_required');
        $editor = $this->staffSession('editor');
        $editorHeaders = ['HTTP_COOKIE'=>CookieSecurity::COOKIE_STAFF.'='.$editor['cookie'], 'HTTP_X_CSRF_TOKEN'=>$editor['csrf']];
        $this->send('GET','/admin/analytics/reports/settings',null,$editorHeaders)->assertStatus(403);
        $request = \Illuminate\Http\Request::create('/api/v1/admin/settings/contact','GET');
        $permission = new \ReflectionMethod(\App\Mvp\Site\RequireSiteStaffAuth::class,'deriveRequiredPermission');
        $this->assertSame('admin.manage',$permission->invoke(app(\App\Mvp\Site\RequireSiteStaffAuth::class),$request));
    }

    public function test_closed_month_summary_and_outbox_are_idempotent_and_rollback_preserves_records(): void
    {
        DB::table('analytics_report_settings')->where('id',1)->update(['enabled'=>true]);
        $runner = app(AnalyticsMaintenanceRunner::class);
        $reference = new \DateTimeImmutable(random_int(2100,9000).'-01-03T12:00:00+02:00');
        $this->assertTrue($runner->ensurePreviousMonthReportEnqueued($reference));
        $this->assertFalse($runner->ensurePreviousMonthReportEnqueued($reference));
        $period = ((int) $reference->format('Y') - 1).'-12';
        $report = DB::table('analytics_monthly_reports')->where('period',$period)->first();
        $summary = json_decode($report->summary_payload,true,32,JSON_THROW_ON_ERROR);
        $this->assertSame(substr($period,0,4).'-11-30T22:00:00.000000Z',$summary['periodStart']);
        $this->assertSame(substr($period,0,4).'-12-31T22:00:00.000000Z',$summary['periodEnd']);
        $outbox = DB::table('archive_mail_outbox')->where('id',$report->outbox_id)->first();
        $this->assertSame('analytics_report',$outbox->purpose);
        $this->assertNull($outbox->cc_recipient);
        $renderer = app(AnalyticsReportRenderer::class);
        $html = $renderer->renderHtml($summary,'2026-12');
        $this->assertStringContainsString('dir="rtl"',$html);
        $migration = require database_path('migrations/2026_10_23_000001_create_analytics_and_monthly_reports_tables.php');
        try { $migration->down(); $this->fail('Must preserve records'); }
        catch (\RuntimeException $e) { $this->assertStringContainsString('refused',$e->getMessage()); }
        DB::table('analytics_report_settings')->where('id',1)->update(['enabled'=>false]);
    }

    public function test_session_idle_rotation_keeps_events_and_report_mime_has_no_cc(): void
    {
        $visitor = (string) Str::uuid();
        \Carbon\CarbonImmutable::setTestNow('2026-10-23 10:00:00 UTC');
        try {
            $this->send('POST','/analytics/events',$this->event(['visitorId'=>$visitor]))->assertStatus(204);
            \Carbon\CarbonImmutable::setTestNow('2026-10-23 10:00:30 UTC');
            $this->send('POST','/analytics/events',$this->event(['visitorId'=>$visitor,'eventType'=>'engagement','engagementSeconds'=>20]))->assertStatus(204);
            $this->assertSame(20,(int) DB::table('analytics_events')->where('visitor_id',$visitor)->sum('engagement_seconds'));
            \Carbon\CarbonImmutable::setTestNow('2026-10-23 10:32:00 UTC');
            $this->send('POST','/analytics/events',$this->event(['visitorId'=>$visitor]))->assertStatus(204);
            $this->assertSame(2, DB::table('analytics_events')->where('visitor_id',$visitor)->distinct()->count('session_id'));
        } finally { \Carbon\CarbonImmutable::setTestNow(); }
        $summary=app(AnalyticsAggregator::class)->getSummary('30');
        $mail=app(\App\Mvp\Archive\ArchiveMailWorker::class)->buildMessage((object)[
            'recipient'=>'review@example.invalid','cc_recipient'=>'must-not-copy@example.invalid','purpose'=>'analytics_report'
        ], ['period'=>'2026-09','summary'=>$summary], [
            'senderName'=>'Gaza International Airport','senderEmail'=>'notifications@gazaairport.com','replyTo'=>null
        ], (string) Str::uuid());
        $this->assertCount(0,$mail->getCc());
        $this->assertStringContainsString('Palestine Airways Limited',(string)$mail->getHtmlBody());
        $this->assertStringContainsString('Content-Type: multipart/alternative',$mail->toString());
        $this->assertStringNotContainsString('Delivery Status: Accepted',(string)$mail->getHtmlBody());
    }
}
