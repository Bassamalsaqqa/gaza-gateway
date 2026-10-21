<?php

declare(strict_types=1);

namespace Tests\Feature\Archive;

use App\Identity\Mfa\TotpSecret;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Protocol\CookieSecurity;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Sessions\StaffSessionStore;
use App\Mvp\Archive\ArchiveDocumentRendererContract;
use App\Mvp\Archive\ArchiveMailWorker;
use App\Mvp\Mail\MailSettings;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Symfony\Component\Mime\Email;
use Tests\TestCase;

final class ArchiveContributionTest extends TestCase
{
    private static ?string $staffPasswordHash = null;

    private string $tinyPngBytes;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tinyPngBytes = (string) base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            true
        );

        $capturePath = storage_path('app/testing-captures');
        if (!is_dir($capturePath)) {
            @mkdir($capturePath, 0700, true);
        }

        config([
            'cors.allowed_origins' => [
                'https://127.0.0.1:5173',
                'https://localhost:5173',
                'https://127.0.0.1:18090',
                'https://localhost:5186',
            ],
            'mvp-mail.enabled' => true,
            'mvp-mail.allowed_hosts' => ['mailpit', '127.0.0.1', 'localhost'],
            'mvp-mail.capture_path' => $capturePath,
        ]);

        if (\Illuminate\Support\Facades\Schema::hasTable('archive_mail_outbox')) {
            DB::table('archive_mail_outbox')->delete();
        }
        if (\Illuminate\Support\Facades\Schema::hasTable('archive_contribution_audits')) {
            DB::table('archive_contribution_audits')->delete();
        }
        if (\Illuminate\Support\Facades\Schema::hasTable('archive_contribution_files')) {
            DB::table('archive_contribution_files')->delete();
        }
        if (\Illuminate\Support\Facades\Schema::hasTable('archive_contributions')) {
            DB::table('archive_contributions')->delete();
        }
    }

    private function guestSession(): array
    {
        $receipt = app(PassengerSessionStore::class)->issueAnonymous();
        return [
            'id' => $receipt->sessionId,
            'cookie' => $receipt->getRawToken(),
            'csrf' => $receipt->getCsrfToken(),
        ];
    }

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

    private function http(
        string $method,
        string $path,
        array $session = [],
        mixed $body = null,
        array $files = [],
        array $headers = [],
        string $cookieName = CookieSecurity::COOKIE_PASSENGER
    ): TestResponse {
        $this->flushHeaders();
        $cookieHeader = '';
        if (isset($session['cookie'])) {
            $cookieHeader = $cookieName . '=' . $session['cookie'];
        }

        $server = [
            'HTTPS' => 'on',
            'SERVER_PORT' => 443,
            'HTTP_HOST' => '127.0.0.1:18090',
            'HTTP_ORIGIN' => 'https://127.0.0.1:5173',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_COOKIE' => $cookieHeader,
            'HTTP_X_CSRF_TOKEN' => $session['csrf'] ?? '',
            'REMOTE_ADDR' => '2001:db8:' . bin2hex(random_bytes(2)) . '::9',
        ];

        $content = null;
        if (empty($files) && $body !== null) {
            $server['CONTENT_TYPE'] = 'application/json';
            $content = json_encode($body, JSON_THROW_ON_ERROR);
            $parameters = [];
        } else {
            $parameters = is_array($body) ? $body : [];
        }

        return $this->call(
            $method,
            'https://127.0.0.1:18090/api/v1' . $path,
            $parameters,
            [],
            $files,
            array_replace($server, $headers),
            $content
        );
    }

    private function createRendererContractDouble(): ArchiveDocumentRendererContract
    {
        $bytes = $this->tinyPngBytes;
        return new class($bytes) implements ArchiveDocumentRendererContract {
            public function __construct(private readonly string $bytes) {}

            public function renderArchiveThankYou(array $payload): string
            {
                return $this->bytes;
            }
        };
    }

    public function test_archive_renderer_binding_uses_the_shared_document_renderer(): void
    {
        $this->assertInstanceOf(\App\Documents\DocumentRenderer::class, app(ArchiveDocumentRendererContract::class));
    }

    public function test_archive_down_refuses_to_drop_contributions_or_delivery_evidence(): void
    {
        $tables = ['archive_contributions', 'archive_contribution_files', 'archive_contribution_audits', 'archive_mail_outbox'];
        $before = [];
        foreach ($tables as $table) {
            $before[$table] = DB::table($table)->count();
        }
        $migration = require database_path('migrations/2026_10_21_000001_create_archive_contributions_tables.php');
        try {
            $migration->down();
            $this->fail('Destructive archive rollback must be refused.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('Archive contraction refused', $e->getMessage());
        }
        foreach ($tables as $table) {
            $this->assertSame($before[$table], DB::table($table)->count());
        }
    }

    public function test_real_archive_artwork_and_booking_png_survive_private_mime_capture(): void
    {
        $config = ['senderEmail' => 'notifications@example.test', 'senderName' => 'Palestine Airways Limited', 'replyTo' => ''];
        $worker = app(ArchiveMailWorker::class);
        $email = $worker->buildMessage(
            (object) ['recipient' => 'contributor@example.test', 'cc_recipient' => null, 'purpose' => 'archive_ack'],
            ['reference' => 'GZA-ARC-QAREAL01', 'contributorName' => 'Synthetic Contributor', 'locale' => 'ar'],
            $config,
            'qa-real-archive'
        );
        $this->assertCount(1, $email->getAttachments());
        $png = $email->getAttachments()[0]->getBody();
        $this->assertSame([1122, 1402], array_slice(getimagesizefromstring($png), 0, 2));
        $mime = $email->toString();
        $capture = new \ReflectionMethod(ArchiveMailWorker::class, 'capture');
        $id = (string) Str::uuid();
        $capture->invoke($worker, $id, $mime);
        $path = config('mvp-mail.capture_path') . '/' . $id . '.eml';
        $this->assertSame($mime, file_get_contents($path));
        $this->assertSame(0600, fileperms($path) & 0777);
        unlink($path);

        // A real document MIME exceeds the historical 128 KiB booking-capture limit.
        $this->assertGreaterThan(131072, strlen($mime));
        $booking = new \App\Mvp\Mail\BookingMailWorker(new MailSettings());
        $capture = new \ReflectionMethod($booking, 'capture');
        $capture->invoke($booking, $id, $mime);
        $this->assertSame($mime, file_get_contents($path));
        unlink($path);
    }

    public function test_actual_submit_with_anonymous_https_session_csrf_and_tiny_real_png(): void
    {
        $this->withoutExceptionHandling();
        $session = $this->guestSession();
        $subId = 'sub-test-' . Str::random(16);

        $file = UploadedFile::fake()->createWithContent(
            'historic-atrium.png',
            $this->tinyPngBytes,
            'image/png'
        );

        $response = $this->http(
            'POST',
            '/archive/contributions',
            $session,
            [
                'submissionId' => $subId,
                'contributorName' => 'Kareem Naji',
                'contributorNameArabic' => 'كريم ناجي',
                'email' => 'kareem.naji@example.org',
                'contributionType' => 'future_concept',
                'description' => 'Architectural vision and historical preservation concepts for Gaza Gateway terminal.',
                'permissionConsent' => 'true',
                'locale' => 'ar',
            ],
            ['files' => [$file]]
        );

        $response->assertStatus(202);
        $data = $response->json('data');
        $this->assertNotNull($data);
        $this->assertMatchesRegularExpression('/\AGZA-ARC-[A-Z0-9]{8}\z/', $data['reference']);
        $this->assertSame('received', $data['status']);

        // Assert database core contribution record
        $contrib = DB::table('archive_contributions')->where('submission_id', $subId)->first();
        $this->assertNotNull($contrib);
        $this->assertSame('Kareem Naji', $contrib->contributor_name);
        $this->assertSame('كريم ناجي', $contrib->contributor_name_ar);
        $this->assertSame('future_concept', $contrib->contribution_type);
        $this->assertSame('received', $contrib->status);

        // Assert private file storage
        $fileRow = DB::table('archive_contribution_files')->where('contribution_id', $contrib->id)->first();
        $this->assertNotNull($fileRow);
        $this->assertSame('historic-atrium.png', $fileRow->original_filename);
        $this->assertSame('image/png', $fileRow->mime_type);
        $this->assertSame(strlen($this->tinyPngBytes), (int) $fileRow->file_bytes);

        $storagePath = storage_path('app/private/archive_contributions/' . $fileRow->storage_key);
        $this->assertFileExists($storagePath);
        $this->assertSame($this->tinyPngBytes, file_get_contents($storagePath));

        // Assert queued outbox messages: contributor ack + staff notification
        $outboxRows = DB::table('archive_mail_outbox')->where('contribution_id', $contrib->id)->get();
        $this->assertCount(2, $outboxRows);

        $ackRow = $outboxRows->firstWhere('purpose', 'archive_ack');
        $this->assertNotNull($ackRow);
        $this->assertSame('kareem.naji@example.org', $ackRow->recipient);
        $this->assertNull($ackRow->cc_recipient);
        $this->assertSame('pending', $ackRow->status);

        $ackPayload = json_decode(Crypt::decryptString($ackRow->encrypted_payload), true, 16, JSON_THROW_ON_ERROR);
        $this->assertSame($contrib->public_reference, $ackPayload['reference']);
        $this->assertSame('Kareem Naji', $ackPayload['contributorName']);
        $this->assertSame('ar', $ackPayload['locale']);
    }

    public function test_actual_submit_with_design_category(): void
    {
        $session = $this->guestSession();
        $subId = 'sub-design-' . Str::random(16);

        $file = UploadedFile::fake()->createWithContent(
            'terminal-layout.png',
            $this->tinyPngBytes,
            'image/png'
        );

        $response = $this->http(
            'POST',
            '/archive/contributions',
            $session,
            [
                'submissionId' => $subId,
                'contributorName' => 'Samir Design',
                'email' => 'samir@example.org',
                'contributionType' => 'design',
                'description' => 'Original schematic layout and architectural blueprints for the terminal building.',
                'permissionConsent' => 'true',
                'locale' => 'en',
            ],
            ['files' => [$file]]
        );

        $response->assertStatus(202);
        $contrib = DB::table('archive_contributions')->where('submission_id', $subId)->first();
        $this->assertNotNull($contrib);
        $this->assertSame('design', $contrib->contribution_type);
    }

    public function test_idempotent_replay_does_not_duplicate_outbox_or_private_files(): void
    {
        $session = $this->guestSession();
        $subId = 'sub-idempotent-' . Str::random(16);

        $file = UploadedFile::fake()->createWithContent(
            'archival-doc.png',
            $this->tinyPngBytes,
            'image/png'
        );

        $body = [
            'submissionId' => $subId,
            'contributorName' => 'Mona Tariq',
            'email' => 'mona.tariq@example.org',
            'contributionType' => 'photograph',
            'description' => 'Archival photograph from 1998 inaugural ceremony.',
            'permissionConsent' => 'true',
            'locale' => 'en',
        ];

        // 1. Initial submission -> 202
        $res1 = $this->http('POST', '/archive/contributions', $session, $body, ['files' => [$file]]);
        $res1->assertStatus(202);
        $ref1 = $res1->json('data.reference');

        $initialFilesCount = DB::table('archive_contribution_files')->count();
        $initialOutboxCount = DB::table('archive_mail_outbox')->count();

        // 2. Replay with identical submissionId and same payload -> 200 idempotent replay
        $fileReplay = UploadedFile::fake()->createWithContent(
            'archival-doc.png',
            $this->tinyPngBytes,
            'image/png'
        );
        $res2 = $this->http('POST', '/archive/contributions', $session, $body, ['files' => [$fileReplay]]);
        $res2->assertStatus(200);
        $this->assertSame($ref1, $res2->json('data.reference'));

        // Verify zero duplicates created
        $this->assertSame(1, DB::table('archive_contributions')->where('submission_id', $subId)->count());
        $this->assertSame($initialFilesCount, DB::table('archive_contribution_files')->count());
        $this->assertSame($initialOutboxCount, DB::table('archive_mail_outbox')->count());
    }

    public function test_mismatch_payload_on_same_submission_id_returns_409_conflict(): void
    {
        $session = $this->guestSession();
        $subId = 'sub-mismatch-' . Str::random(16);

        $file1 = UploadedFile::fake()->createWithContent(
            'photo-1.png',
            $this->tinyPngBytes,
            'image/png'
        );

        $body1 = [
            'submissionId' => $subId,
            'contributorName' => 'Original Contributor',
            'email' => 'orig@example.org',
            'contributionType' => 'photograph',
            'description' => 'Original description for the archival contribution.',
            'permissionConsent' => 'true',
        ];

        $res1 = $this->http('POST', '/archive/contributions', $session, $body1, ['files' => [$file1]]);
        $res1->assertStatus(202);

        // Submitting with modified payload on same submissionId MUST return 409 Conflict
        $file2 = UploadedFile::fake()->createWithContent(
            'photo-2.png',
            $this->tinyPngBytes,
            'image/png'
        );

        $bodyTampered = [
            'submissionId' => $subId,
            'contributorName' => 'Different Contributor',
            'email' => 'orig@example.org',
            'contributionType' => 'photograph',
            'description' => 'Tampered description payload attempting to mutate existing record.',
            'permissionConsent' => 'true',
        ];

        $res2 = $this->http('POST', '/archive/contributions', $session, $bodyTampered, ['files' => [$file2]]);
        $res2->assertStatus(409);
    }

    public function test_denied_html_extension_and_mime_rejection_cleans_up_current_attempt_files(): void
    {
        $session = $this->guestSession();
        $subId = 'sub-malicious-' . Str::random(16);

        $htmlFile = UploadedFile::fake()->createWithContent(
            'exploit.html',
            '<!DOCTYPE html><html><body><script>alert("xss")</script></body></html>',
            'text/html'
        );

        $response = $this->http(
            'POST',
            '/archive/contributions',
            $session,
            [
                'submissionId' => $subId,
                'contributorName' => 'Attacker',
                'email' => 'attacker@example.org',
                'contributionType' => 'document',
                'description' => 'A valid length description for an attempted HTML payload upload.',
                'permissionConsent' => 'true',
            ],
            ['files' => [$htmlFile]]
        );

        $response->assertStatus(422);
        $this->assertSame(0, DB::table('archive_contributions')->where('submission_id', $subId)->count());

        // Test double extension denial (e.g. image.php.png)
        $doubleExtFile = UploadedFile::fake()->createWithContent(
            'image.php.png',
            $this->tinyPngBytes,
            'image/png'
        );

        $subId2 = 'sub-double-ext-' . Str::random(16);
        $response2 = $this->http(
            'POST',
            '/archive/contributions',
            $session,
            [
                'submissionId' => $subId2,
                'contributorName' => 'Attacker 2',
                'email' => 'attacker2@example.org',
                'contributionType' => 'photograph',
                'description' => 'Attempting double extension traversal with php segment in middle.',
                'permissionConsent' => 'true',
            ],
            ['files' => [$doubleExtFile]]
        );

        $response2->assertStatus(422);
        $this->assertSame(0, DB::table('archive_contributions')->where('submission_id', $subId2)->count());
    }

    public function test_staff_archive_endpoints_reject_unauthenticated_and_passenger_sessions_401_or_403(): void
    {
        // 1. Unauthenticated request to admin archive index is rejected
        $resAnon = $this->http('GET', '/admin/archive/contributions');
        $this->assertContains($resAnon->status(), [401, 403]);

        // 2. Passenger session accessing admin archive is rejected
        $passenger = $this->guestSession();
        $resPassenger = $this->http('GET', '/admin/archive/contributions', $passenger);
        $this->assertContains($resPassenger->status(), [401, 403]);

        // 3. Create a contribution to test staff file download
        $contribId = (string) Str::uuid();
        $fileId = (string) Str::uuid();
        $storageKey = 'arc_' . Str::random(32) . '.png';
        $storageDir = storage_path('app/private/archive_contributions');
        if (!is_dir($storageDir)) {
            @mkdir($storageDir, 0750, true);
        }
        $filePath = $storageDir . '/' . $storageKey;
        file_put_contents($filePath, $this->tinyPngBytes);

        DB::table('archive_contributions')->insert([
            'id' => $contribId,
            'public_reference' => 'GZA-ARC-' . strtoupper(Str::random(8)),
            'submission_id' => 'sub-staff-test-' . Str::random(8),
            'payload_hash' => hash('sha256', 'test'),
            'contributor_name' => 'Staff Download Test',
            'email' => 'staff-test@example.org',
            'contribution_type' => 'photograph',
            'description' => 'Archival item for staff security download testing.',
            'permission_consent' => true,
            'status' => 'received',
            'curator_notes' => '',
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);

        DB::table('archive_contribution_files')->insert([
            'id' => $fileId,
            'contribution_id' => $contribId,
            'storage_key' => $storageKey,
            'original_filename' => 'download-me.png',
            'file_bytes' => strlen($this->tinyPngBytes),
            'mime_type' => 'image/png',
            'sha256' => hash('sha256', $this->tinyPngBytes),
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);

        // Unauthenticated download rejected
        $resNoAuthDownload = $this->http('GET', "/admin/archive/contributions/{$contribId}/files/{$fileId}/download");
        $this->assertContains($resNoAuthDownload->status(), [401, 403]);

        // Valid staff session can access index and download file
        $staff = $this->staffSession();
        $resStaffIndex = $this->http('GET', '/admin/archive/contributions', $staff, null, [], [], CookieSecurity::COOKIE_STAFF);
        $resStaffIndex->assertStatus(200);

        $resStaffDownload = $this->http(
            'GET',
            "/admin/archive/contributions/{$contribId}/files/{$fileId}/download",
            $staff,
            null,
            [],
            [],
            CookieSecurity::COOKIE_STAFF
        );
        $resStaffDownload->assertStatus(200);
        $this->assertSame('image/png', $resStaffDownload->headers->get('Content-Type'));
        $this->assertSame('nosniff', $resStaffDownload->headers->get('X-Content-Type-Options'));
        $this->assertStringContainsString('attachment', (string) $resStaffDownload->headers->get('Content-Disposition'));
    }

    public function test_real_build_message_scoped_cc_and_png_via_injected_renderer_contract(): void
    {
        $renderer = $this->createRendererContractDouble();
        $worker = new ArchiveMailWorker(new MailSettings(), $renderer);

        $config = [
            'senderName' => 'Gaza Airport Operations',
            'senderEmail' => 'notifications@gazaairport.com',
            'replyTo' => 'info@gazaairport.com',
        ];

        // 1. Contributor Ack (archive_ack) with English locale:
        // Must use active English brand "Palestine Airways Limited" and never include CC
        $ackRow = (object) [
            'recipient' => 'contributor@example.com',
            'cc_recipient' => 'curator-leak@example.com', // Outbox row might hold CC, but ack must strip it
            'purpose' => 'archive_ack',
        ];

        $ackPayloadEn = [
            'reference' => 'GZA-ARC-ACKEN001',
            'contributorName' => 'Ahmad Mahmoud',
            'contributionType' => 'photograph',
            'locale' => 'en',
        ];

        $emailEn = $worker->buildMessage($ackRow, $ackPayloadEn, $config, 'lease-uuid-en');
        $this->assertInstanceOf(Email::class, $emailEn);
        $this->assertCount(0, $emailEn->getCc(), 'Contributor acknowledgment must never receive CC.');

        $textEn = (string) $emailEn->getTextBody();
        $this->assertStringContainsString('Palestine Airways Limited', $textEn);
        $this->assertStringNotContainsString('Palestinian Airlines & Gaza International Airport Digital Archive', $textEn);
        $this->assertStringContainsString('GZA-ARC-ACKEN001', $textEn);

        $attachmentsEn = $emailEn->getAttachments();
        $this->assertCount(1, $attachmentsEn);
        $this->assertSame('gaza-archive-thank-you-GZA-ARC-ACKEN001.png', $attachmentsEn[0]->getFilename());
        $this->assertSame('image/png', $attachmentsEn[0]->getContentType());

        // 2. Contributor Ack (archive_ack) with Arabic locale:
        // Must use Arabic brand "الخطوط الجوية الفلسطينية"
        $ackPayloadAr = [
            'reference' => 'GZA-ARC-ACKAR002',
            'contributorName' => 'Ahmad Mahmoud',
            'contributorNameArabic' => 'أحمد محمود',
            'contributionType' => 'وثيقة تاريخية',
            'locale' => 'ar',
        ];

        $emailAr = $worker->buildMessage($ackRow, $ackPayloadAr, $config, 'lease-uuid-ar');
        $this->assertCount(0, $emailAr->getCc());
        $textAr = (string) $emailAr->getTextBody();
        $this->assertStringContainsString('أحمد محمود', $textAr);
        $this->assertStringContainsString('الخطوط الجوية الفلسطينية', $textAr);

        $attachmentsAr = $emailAr->getAttachments();
        $this->assertCount(1, $attachmentsAr);
        $this->assertSame('image/png', $attachmentsAr[0]->getContentType());

        // 3. Admin Notification (archive_notify):
        // Scoped CC is allowed and applied
        $notifyRow = (object) [
            'recipient' => 'admin@gazaairport.com',
            'cc_recipient' => 'backup-curator@gazaairport.com',
            'purpose' => 'archive_notify',
        ];

        $notifyPayload = [
            'reference' => 'GZA-ARC-NOTIFY01',
            'contributorName' => 'Contributor Name',
            'email' => 'contributor@example.com',
            'contributionType' => 'artifact',
            'filesCount' => 3,
            'description' => 'A rare physical baggage ticket from 1999.',
        ];

        $emailNotify = $worker->buildMessage($notifyRow, $notifyPayload, $config, 'lease-uuid-notify');
        $this->assertCount(1, $emailNotify->getCc(), 'Archive notify must include scoped CC when configured.');
        $this->assertSame('backup-curator@gazaairport.com', $emailNotify->getCc()[0]->getAddress());
    }

    private function ensureTestStaffId(): string
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
            'role' => 'admin',
            'status' => 'active',
            'credential_epoch' => 1,
            'email_verified_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);
        return $id;
    }

    public function test_actual_worker_unconfigured_no_claim_and_uncertain_row_never_replayed(): void
    {
        $renderer = $this->createRendererContractDouble();
        $worker = new ArchiveMailWorker(new MailSettings(), $renderer);

        // 1. Unconfigured MailSettings -> worker claims 0 rows
        DB::table('mvp_mail_settings')->where('id', 1)->delete();

        $pendingId = (string) Str::uuid();
        DB::table('archive_mail_outbox')->insert([
            'id' => $pendingId,
            'purpose' => 'archive_ack',
            'recipient' => 'pending@example.com',
            'encrypted_payload' => Crypt::encryptString(json_encode(['reference' => 'GZA-ARC-P1'])),
            'status' => 'pending',
            'attempts' => 0,
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);

        $processedUnconfigured = $worker->runBatch();
        $this->assertSame(0, $processedUnconfigured, 'Unconfigured worker must fail-closed and claim no rows.');
        $this->assertSame('pending', DB::table('archive_mail_outbox')->where('id', $pendingId)->value('status'));

        // 2. Configure capture mode and insert an 'uncertain' row
        $staffId = $this->ensureTestStaffId();
        $settings = new MailSettings();
        $settings->save([
            'expectedRevision' => 0,
            'driver' => 'capture',
            'host' => 'localhost',
            'port' => 1025,
            'tls' => 'none',
            'senderName' => 'Gaza Airport Ops',
            'senderEmail' => 'ops@gazaairport.com',
            'replyTo' => 'reply@gazaairport.com',
            'notificationEmail' => 'notifications@gazaairport.com',
            'incomingCcEnabled' => false,
            'incomingCcEmail' => '',
        ], $staffId);

        $uncertainId = (string) Str::uuid();
        DB::table('archive_mail_outbox')->insert([
            'id' => $uncertainId,
            'purpose' => 'archive_ack',
            'recipient' => 'uncertain@example.com',
            'encrypted_payload' => Crypt::encryptString(json_encode(['reference' => 'GZA-ARC-U1'])),
            'status' => 'uncertain',
            'attempts' => 1,
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);

        // Run worker batch: it should process $pendingId but MUST NEVER claim or mutate $uncertainId
        $processed = $worker->runBatch();
        $this->assertGreaterThanOrEqual(1, $processed);

        $uncertainStatus = DB::table('archive_mail_outbox')->where('id', $uncertainId)->value('status');
        $this->assertSame('uncertain', $uncertainStatus, 'Uncertain outbox row must never be claimed or replayed.');
    }

    public function test_actual_capture_persists_eml_including_png_no_fake_plaintext(): void
    {
        $staffId = $this->ensureTestStaffId();
        $settings = new MailSettings();
        DB::table('mvp_mail_settings')->where('id', 1)->delete();
        $settings->save([
            'expectedRevision' => 0,
            'driver' => 'capture',
            'host' => 'localhost',
            'port' => 1025,
            'tls' => 'none',
            'senderName' => 'Gaza Airport Ops',
            'senderEmail' => 'ops@gazaairport.com',
            'replyTo' => 'reply@gazaairport.com',
            'notificationEmail' => 'notifications@gazaairport.com',
            'incomingCcEnabled' => false,
            'incomingCcEmail' => '',
        ], $staffId);

        $renderer = $this->createRendererContractDouble();
        $worker = new ArchiveMailWorker($settings, $renderer);

        $outboxId = (string) Str::uuid();
        $ref = 'GZA-ARC-CAPTEST';
        DB::table('archive_mail_outbox')->insert([
            'id' => $outboxId,
            'purpose' => 'archive_ack',
            'recipient' => 'contributor-capture@example.org',
            'encrypted_payload' => Crypt::encryptString(json_encode([
                'reference' => $ref,
                'contributorName' => 'Salma Kamal',
                'contributionType' => 'photograph',
                'locale' => 'en',
            ])),
            'status' => 'pending',
            'attempts' => 0,
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);

        $config = $settings->forWorker();
        $this->assertNotNull($config);
        $this->assertSame(0, $worker->runBatch(1, static fn(): float => 12.9));
        $this->assertSame(0, (int) DB::table('archive_mail_outbox')->where('id', $outboxId)->value('attempts'));
        $processed = $worker->processOne($config);
        $this->assertTrue($processed);

        // Status must be captured_locally
        $row = DB::table('archive_mail_outbox')->where('id', $outboxId)->first();
        $this->assertSame('captured_locally', $row->status);
        $this->assertNotNull($row->accepted_at);

        // Verify the persisted .eml file exists on disk
        $captureDir = config('mvp-mail.capture_path');
        $files = glob($captureDir . '/*.eml') ?: [];
        $this->assertNotEmpty($files, 'At least one .eml capture must be persisted.');

        // Find the newly written .eml
        $emlContent = null;
        foreach ($files as $file) {
            $content = file_get_contents($file);
            if (str_contains($content, $ref)) {
                $emlContent = $content;
                break;
            }
        }

        $this->assertNotNull($emlContent, 'Capture file containing reference must be found.');
        $decodedBody = quoted_printable_decode($emlContent);
        $this->assertStringContainsString('Palestine Airways Limited', $decodedBody);
        $this->assertStringContainsString('Content-Type: image/png', $emlContent);
        $this->assertStringContainsString("gaza-archive-thank-you-{$ref}.png", $emlContent);
        $this->assertStringContainsString('Content-Transfer-Encoding: base64', $emlContent);

        // Verify base64 attachment chunk corresponds to real PNG bytes
        $expectedBase64 = base64_encode($this->tinyPngBytes);
        $normalizedEml = str_replace(["\r", "\n"], '', $emlContent);
        $this->assertStringContainsString($expectedBase64, $normalizedEml);
    }

    public function test_mail_settings_notification_email_explicit_blank_rejection_and_effective_cc(): void
    {
        $staffId = $this->ensureTestStaffId();
        $settings = new MailSettings();
        DB::table('mvp_mail_settings')->where('id', 1)->delete();

        $baseInput = [
            'expectedRevision' => 0,
            'driver' => 'capture',
            'host' => 'localhost',
            'port' => 1025,
            'tls' => 'none',
            'senderName' => 'Gaza Airport Ops',
            'senderEmail' => 'ops@gazaairport.com',
            'replyTo' => 'reply@gazaairport.com',
            'notificationEmail' => 'notifications@gazaairport.com',
            'incomingCcEnabled' => false,
            'incomingCcEmail' => '',
        ];

        // 1. Explicit blank notificationEmail must be rejected
        $blankNotif = $baseInput;
        $blankNotif['notificationEmail'] = '   ';
        $this->expectException(\InvalidArgumentException::class);
        $settings->save($blankNotif, $staffId);
    }

    public function test_mail_settings_enabled_cc_requires_valid_non_empty_email(): void
    {
        $staffId = $this->ensureTestStaffId();
        $settings = new MailSettings();
        DB::table('mvp_mail_settings')->where('id', 1)->delete();

        $baseInput = [
            'expectedRevision' => 0,
            'driver' => 'capture',
            'host' => 'localhost',
            'port' => 1025,
            'tls' => 'none',
            'senderName' => 'Gaza Airport Ops',
            'senderEmail' => 'ops@gazaairport.com',
            'replyTo' => 'reply@gazaairport.com',
            'notificationEmail' => 'notifications@gazaairport.com',
            'incomingCcEnabled' => true,
            'incomingCcEmail' => '',
        ];

        // 2. Explicit incomingCcEnabled = true with empty incomingCcEmail must be rejected
        $this->expectException(\InvalidArgumentException::class);
        $settings->save($baseInput, $staffId);
    }

    public function test_mail_settings_preserves_old_settings_with_effective_cc(): void
    {
        $staffId = $this->ensureTestStaffId();
        $settings = new MailSettings();
        DB::table('mvp_mail_settings')->where('id', 1)->delete();

        // 3. Save valid settings with CC enabled
        $validSaved = $settings->save([
            'expectedRevision' => 0,
            'driver' => 'capture',
            'host' => 'localhost',
            'port' => 1025,
            'tls' => 'none',
            'senderName' => 'Gaza Airport Ops',
            'senderEmail' => 'ops@gazaairport.com',
            'replyTo' => 'reply@gazaairport.com',
            'notificationEmail' => 'alerts@gazaairport.com',
            'incomingCcEnabled' => true,
            'incomingCcEmail' => 'cc-alerts@gazaairport.com',
        ], $staffId);

        $this->assertTrue($validSaved['incomingCcEnabled']);
        $this->assertSame('cc-alerts@gazaairport.com', $validSaved['incomingCcEmail']);
        $this->assertSame('alerts@gazaairport.com', $validSaved['notificationEmail']);

        // Worker config returns effective CC enabled
        $workerConfig = $settings->forWorker();
        $this->assertNotNull($workerConfig);
        $this->assertTrue($workerConfig['incomingCcEnabled']);
        $this->assertSame('cc-alerts@gazaairport.com', $workerConfig['incomingCcEmail']);

        // 4. Updating another field without touching CC preserves CC
        $updated = $settings->save([
            'expectedRevision' => 1,
            'driver' => 'capture',
            'host' => 'localhost',
            'port' => 1025,
            'tls' => 'none',
            'senderName' => 'Updated Sender Name',
            'senderEmail' => 'ops@gazaairport.com',
            'replyTo' => 'reply@gazaairport.com',
            'notificationEmail' => 'alerts@gazaairport.com',
            'incomingCcEnabled' => true,
            'incomingCcEmail' => 'cc-alerts@gazaairport.com',
        ], $staffId);

        $this->assertSame('Updated Sender Name', $updated['senderName']);
        $this->assertTrue($updated['incomingCcEnabled']);
        $this->assertSame('cc-alerts@gazaairport.com', $updated['incomingCcEmail']);
    }
}
