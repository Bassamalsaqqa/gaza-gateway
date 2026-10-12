<?php

declare(strict_types=1);

namespace Tests\Feature\Editorial;

use App\Identity\Mfa\TotpSecret;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Sessions\StaffSessionStore;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class EditorialRoutesTest extends TestCase
{
    private static ?string $hash = null;

    private function staff(string $role = 'admin'): array
    {
        $id = (string) Str::uuid();
        self::$hash ??= app(Argon2idPasswordHasher::class)->hash('Synthetic-editorial-password-2026', 'staff');
        DB::table('staff_users')->insert([
            'id' => $id,
            'username' => 'staff-' . $id,
            'email' => $id . '@example.invalid',
            'full_name_en' => 'Synthetic Staff',
            'full_name_ar' => 'Synthetic Staff',
            'password_hash' => self::$hash,
            'role' => $role,
            'status' => 'invited',
            'credential_epoch' => 1,
            'email_verified_at' => DB::raw('clock_timestamp()'),
            'created_at' => DB::raw('clock_timestamp()'),
            'updated_at' => DB::raw('clock_timestamp()'),
        ]);

        DB::table('staff_mfa_credentials')->insert([
            'staff_id' => $id,
            'version' => 1,
            'encrypted_secret' => app(Encrypter::class)->encrypt(TotpSecret::generate()->revealBase32Secret()),
            'confirmed_at' => DB::raw('clock_timestamp()'),
        ]);

        DB::table('staff_users')->where('id', $id)->update(['status' => 'active', 'mfa_version' => 1]);
        $receipt = app(StaffSessionStore::class)->issueFull($id, 1, 1, new \DateTimeImmutable());

        return [
            'owner' => $id,
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
        array $headers = [],
        ?string $raw = null,
        ?string $explicitOp = null
    ): TestResponse {
        $this->flushHeaders();
        $server = [
            'HTTPS' => 'on',
            'SERVER_PORT' => 443,
            'HTTP_HOST' => '127.0.0.1:18090',
            'HTTP_ORIGIN' => 'https://127.0.0.1:5173',
            'HTTP_ACCEPT' => 'application/json',
            'CONTENT_TYPE' => 'application/json',
            'HTTP_COOKIE' => isset($session['cookie']) ? 'gza_staff_session=' . $session['cookie'] : '',
            'HTTP_X_CSRF_TOKEN' => $session['csrf'] ?? '',
            'REMOTE_ADDR' => '2001:db8:' . bin2hex(random_bytes(2)) . '::9',
        ];

        $scheme = (isset($headers['HTTPS']) && $headers['HTTPS'] === 'off') ? 'http' : 'https';
        $response = $this->call(
            $method,
            $scheme . '://' . ($headers['HTTP_HOST'] ?? '127.0.0.1:18090') . '/api/v1' . $path,
            [],
            [],
            [],
            array_replace($server, $headers),
            $raw ?? ($body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR))
        );

        $operation = $explicitOp ?? match (true) {
            str_starts_with($path, '/cms/published') => 'getCmsPublishedBySlug',
            str_ends_with($path, '/draft') => 'putCmsEditorialDraft',
            str_ends_with($path, '/discard') => 'postCmsEditorialDiscard',
            str_ends_with($path, '/publish') => 'postCmsEditorialPublish',
            str_ends_with($path, '/unpublish') => 'postCmsEditorialUnpublish',
            str_ends_with($path, '/restore') => 'postCmsEditorialRestore',
            $method === 'GET' => 'getCmsEditorialBySlug',
            default => null,
        };

        if ($operation !== null && (getenv('EDITORIAL_GATE_OWNED') === '1' || getenv('REFERENCE_GATE_OWNED') === '1')) {
            $file = '/tmp/editorial-captures.json';
            $captures = is_file($file) ? json_decode(file_get_contents($file), true, 32, JSON_THROW_ON_ERROR) : [];
            $captures[$operation . ':' . $response->status()] ??= [
                'operationId' => $operation,
                'status' => $response->status(),
                'contentType' => $response->headers->get('Content-Type'),
                'payload' => $response->json(),
            ];
            file_put_contents($file, json_encode($captures, JSON_THROW_ON_ERROR), LOCK_EX);
        }

        return $response;
    }

    public function test_migration_roundtrip_preserves_database_integrity(): void
    {
        $staff = $this->staff();
        $this->assertSame(0, DB::table('editorial_documents')->count());

        $this->assertSame(0, Artisan::call('migrate:rollback', ['--step' => DB::table('migrations')->where('migration', '>=', '2026_10_11_000006_create_editorial_publication_tables')->count(), '--force' => true]));
        $this->assertFalse(Schema::hasTable('editorial_documents'));
        $this->assertFalse(Schema::hasTable('editorial_revisions'));
        $this->assertFalse(Schema::hasTable('editorial_published_revisions'));
        $this->assertFalse(Schema::hasTable('editorial_audit_events'));
        $this->assertTrue(DB::table('staff_users')->where('id', $staff['owner'])->exists());

        $this->assertSame(0, Artisan::call('migrate', ['--force' => true]));
        $this->assertTrue(Schema::hasTable('editorial_documents'));
        $this->assertSame(0, DB::table('editorial_documents')->count());
    }

    public function test_concurrent_initial_save_at_expected_revision_zero(): void
    {
        $staffA = $this->staff('admin');
        $staffB = $this->staff('admin');
        $sourceFile = '/tmp/editorial-source.json';
        if (!is_file($sourceFile)) {
            $this->markTestSkipped('Source fixtures file /tmp/editorial-source.json not present.');
        }
        $source = json_decode(file_get_contents($sourceFile), true, 512, JSON_THROW_ON_ERROR);

        $docA = $source['home'];
        $docA['copy']['h1']['en'] = 'Initial Concurrent Save A';
        $docB = $source['home'];
        $docB['copy']['h1']['en'] = 'Initial Concurrent Save B';

        $inputs = [
            [
                'session' => $staffA,
                'path' => '/cms/editorial/home/draft',
                'method' => 'PUT',
                'body' => ['payload' => $docA, 'expectedRevision' => 0],
            ],
            [
                'session' => $staffB,
                'path' => '/cms/editorial/home/draft',
                'method' => 'PUT',
                'body' => ['payload' => $docB, 'expectedRevision' => 0],
            ],
        ];

        $results = $this->race($inputs);
        sort($results);
        $this->assertSame([200, 409], $results);

        // Reset editorial tables so subsequent lifecycle tests start fresh
        Artisan::call('migrate:rollback', ['--step' => DB::table('migrations')->where('migration', '>=', '2026_10_11_000006_create_editorial_publication_tables')->count(), '--force' => true]);
        Artisan::call('migrate', ['--force' => true]);
    }

    public function test_never_published_initial_draft_discard_lifecycle_and_invariants(): void
    {
        $staff = $this->staff('admin');
        $source = json_decode(file_get_contents('/tmp/editorial-source.json'), true, 512, JSON_THROW_ON_ERROR);

        // 1. Initial uncreated state: public 404, staff 404
        $this->http('GET', '/cms/published/pages.information')->assertStatus(404);
        $this->http('GET', '/cms/editorial/pages.information', $staff)->assertStatus(404);

        // 2. Save initial draft at expectedRevision = 0
        $initDraft = $this->http('PUT', '/cms/editorial/pages.information/draft', $staff, [
            'payload' => $source['pages.information'],
            'expectedRevision' => 0,
        ])->assertStatus(200);

        $this->assertTrue($initDraft->json('data.changed'));
        $this->assertSame(1, $initDraft->json('data.revision'));
        $this->assertSame(1, $initDraft->json('data.currentRevision'));

        // Staff read shows active draft Revision 1
        $staffDoc = $this->http('GET', '/cms/editorial/pages.information', $staff)->assertStatus(200);
        $this->assertSame(1, $staffDoc->json('data.revisionNumber'));
        $this->assertSame(1, $staffDoc->json('data.currentRevision'));
        $this->assertSame(1, $staffDoc->json('data.draftRevision'));
        $this->assertNull($staffDoc->json('data.publishedRevision'));
        $this->assertTrue($staffDoc->json('data.hasDraft'));
        $this->assertSame('draft', $staffDoc->json('data.status'));
        $this->assertNotNull($staffDoc->json('data.payload'));

        // Public read remains 404 (never published)
        $this->http('GET', '/cms/published/pages.information')->assertStatus(404);

        // 3. Discard unactivated draft at expectedRevision = 1
        $discard = $this->http('POST', '/cms/editorial/pages.information/discard', $staff, [
            'expectedRevision' => 1,
        ])->assertStatus(200);

        // Proves: payload is null, revisionNumber is 0, currentRevision advanced to 2, hasDraft is false
        $this->assertSame(0, $discard->json('data.revisionNumber'));
        $this->assertSame(2, $discard->json('data.currentRevision'));
        $this->assertNull($discard->json('data.draftRevision'));
        $this->assertNull($discard->json('data.publishedRevision'));
        $this->assertFalse($discard->json('data.hasDraft'));
        $this->assertSame('draft', $discard->json('data.status'));
        $this->assertNull($discard->json('data.payload'));

        // Staff read verifies truthful DTO with no active content pointer
        $staffAfterDiscard = $this->http('GET', '/cms/editorial/pages.information', $staff)->assertStatus(200);
        $this->assertSame(0, $staffAfterDiscard->json('data.revisionNumber'));
        $this->assertSame(2, $staffAfterDiscard->json('data.currentRevision'));
        $this->assertFalse($staffAfterDiscard->json('data.hasDraft'));
        $this->assertNull($staffAfterDiscard->json('data.payload'));

        // Public read remains 404
        $this->http('GET', '/cms/published/pages.information')->assertStatus(404);

        // 4. Publication rejected until a new draft is saved (422 validation_error)
        $this->http('POST', '/cms/editorial/pages.information/publish', $staff, [
            'expectedRevision' => 2,
        ])->assertStatus(422)->assertJsonPath('error.code', 'validation_error');

        // 5. Second discard is a no-op: currentRevision remains stable at 2, revisionNumber remains 0, payload remains null
        $noopDiscard = $this->http('POST', '/cms/editorial/pages.information/discard', $staff, [
            'expectedRevision' => 2,
        ])->assertStatus(200);

        $this->assertSame(0, $noopDiscard->json('data.revisionNumber'));
        $this->assertSame(2, $noopDiscard->json('data.currentRevision'));
        $this->assertNull($noopDiscard->json('data.payload'));
        $this->assertFalse($noopDiscard->json('data.hasDraft'));

        // 6. Save a new draft at expectedRevision = 2
        $newDraft = $this->http('PUT', '/cms/editorial/pages.information/draft', $staff, [
            'payload' => $source['pages.information'],
            'expectedRevision' => 2,
        ])->assertStatus(200);
        $this->assertSame(3, $newDraft->json('data.currentRevision'));
        $this->assertSame(2, $newDraft->json('data.revision'));

        // 7. Publication now succeeds at expectedRevision = 3
        $pub = $this->http('POST', '/cms/editorial/pages.information/publish', $staff, [
            'expectedRevision' => 3,
        ])->assertStatus(200);
        $this->assertSame(2, $pub->json('data.revisionNumber'));
        $this->assertSame(4, $pub->json('data.currentRevision'));
        $this->assertSame('published', $pub->json('data.status'));

        // Public read now returns 200 with published Revision 2
        $this->http('GET', '/cms/published/pages.information')
            ->assertStatus(200)
            ->assertJsonPath('data.revisionNumber', 2)
            ->assertJsonPath('data.status', 'published');

        // Reset tables so subsequent test starts fresh
        Artisan::call('migrate:rollback', ['--step' => DB::table('migrations')->where('migration', '>=', '2026_10_11_000006_create_editorial_publication_tables')->count(), '--force' => true]);
        Artisan::call('migrate', ['--force' => true]);
    }

    public function test_actual_eight_source_fixture_schemas_and_lifecycle(): void
    {
        $staff = $this->staff('admin');
        $sourceFile = '/tmp/editorial-source.json';
        if (!is_file($sourceFile)) {
            $this->markTestSkipped('Source fixtures file /tmp/editorial-source.json not present.');
        }

        $source = json_decode(file_get_contents($sourceFile), true, 512, JSON_THROW_ON_ERROR);
        $keys = [
            'home', 'travel', 'airport.past', 'airport.present',
            'airport.future', 'destinations.presentation',
            'destinations.editorial', 'pages.information',
        ];

        foreach ($keys as $key) {
            $this->assertArrayHasKey($key, $source);
            $fixture = $source[$key];

            // 1. Initial public read must return 404 (not_found)
            $this->http('GET', '/cms/published/' . $key)
                ->assertStatus(404)
                ->assertJsonPath('success', false)
                ->assertJsonPath('error.code', 'not_found');

            // 2. Staff saves draft with expectedRevision: 0
            $this->http('PUT', '/cms/editorial/' . $key . '/draft', $staff, [
                'payload' => $fixture,
                'expectedRevision' => 0,
            ])->assertStatus(200)
                ->assertJsonPath('success', true)
                ->assertJsonPath('data.changed', true)
                ->assertJsonPath('data.revision', 1);

            // 3. Draft secrecy: public read STILL returns 404
            $this->http('GET', '/cms/published/' . $key)
                ->assertStatus(404)
                ->assertJsonPath('error.code', 'not_found');

            $canonicalFixture = json_decode(\App\Editorial\Services\EditorialCoordinator::canonicalJson($fixture), true, 512, JSON_THROW_ON_ERROR);

            // 4. Staff reads editorial
            $editorialRes = $this->http('GET', '/cms/editorial/' . $key, $staff);
            $editorialRes->assertStatus(200)
                ->assertJsonPath('success', true)
                ->assertJsonPath('data.revisionNumber', 1)
                ->assertJsonPath('data.hasDraft', true)
                ->assertJsonPath('data.status', 'draft');
            $this->assertSame($canonicalFixture, $editorialRes->json('data.payload'));

            // 5. Staff publishes
            $publishRes = $this->http('POST', '/cms/editorial/' . $key . '/publish', $staff, [
                'expectedRevision' => 1,
            ]);
            $publishRes->assertStatus(200)
                ->assertJsonPath('success', true)
                ->assertJsonPath('data.status', 'published')
                ->assertJsonPath('data.hasDraft', false)
                ->assertJsonPath('data.publishedRevision', 1);

            // 6. Public read cross-session now returns 200 with the active published revision!
            $publicRes = $this->http('GET', '/cms/published/' . $key);
            $publicRes->assertStatus(200)
                ->assertJsonPath('success', true)
                ->assertJsonPath('data.revisionNumber', 1)
                ->assertJsonPath('data.status', 'published');
            $this->assertSame($canonicalFixture, $publicRes->json('data.payload'));
        }

        $this->assertSame(8, DB::table('editorial_documents')->count());
        $this->assertSame(8, DB::table('editorial_revisions')->count());
        $this->assertSame(8, DB::table('editorial_published_revisions')->count());
        $this->assertSame(16, DB::table('editorial_audit_events')->count());
    }

    public function test_save_noop_and_expected_revision_conflict(): void
    {
        $staff = $this->staff('admin');
        $source = json_decode(file_get_contents('/tmp/editorial-source.json'), true, 512, JSON_THROW_ON_ERROR);
        $fixture = $source['home'];

        // Save identical draft payload: no-op, no new revision or audit row
        $revisionsBefore = DB::table('editorial_revisions')->where('slug', 'home')->count();
        $auditBefore = DB::table('editorial_audit_events')->where('slug', 'home')->count();
        $curRev = (int) DB::table('editorial_documents')->where('slug', 'home')->value('current_revision');

        $res = $this->http('PUT', '/cms/editorial/home/draft', $staff, [
            'payload' => $fixture,
            'expectedRevision' => $curRev,
        ]);
        $res->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.changed', false)
            ->assertJsonPath('data.revision', 1)
            ->assertJsonPath('data.currentRevision', $curRev);

        $this->assertSame($revisionsBefore, DB::table('editorial_revisions')->where('slug', 'home')->count());
        $this->assertSame($auditBefore, DB::table('editorial_audit_events')->where('slug', 'home')->count());

        // Stale conflict: sending expectedRevision: 0 when current is $curRev -> 409
        $conflict = $this->http('PUT', '/cms/editorial/home/draft', $staff, [
            'payload' => $fixture,
            'expectedRevision' => 0,
        ]);
        $conflict->assertStatus(409)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error.code', 'conflict');

        $this->http('POST', '/cms/editorial/home/discard', $staff, ['expectedRevision' => 999])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'conflict');

        $this->http('POST', '/cms/editorial/home/publish', $staff, ['expectedRevision' => 999])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'conflict');

        $this->http('POST', '/cms/editorial/home/unpublish', $staff, ['expectedRevision' => 999])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'conflict');

        $this->http('POST', '/cms/editorial/home/restore', $staff, ['targetRevision' => 1, 'expectedRevision' => 999])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'conflict');
    }

    public function test_unauthorized_role_csrf_and_origin_protocol(): void
    {
        $admin = $this->staff('admin');
        $editor = $this->staff('editor');
        $viewer = $this->staff('viewer');

        $body = ['expectedRevision' => 1];

        // 1. Unauthenticated -> 401
        $this->http('GET', '/cms/editorial/home', [])->assertStatus(401);
        $this->http('PUT', '/cms/editorial/home/draft', [], ['payload' => (object)[], 'expectedRevision' => 1])->assertStatus(401);
        $this->http('POST', '/cms/editorial/home/discard', [], $body)->assertStatus(401);
        $this->http('POST', '/cms/editorial/home/publish', [], $body)->assertStatus(401);
        $this->http('POST', '/cms/editorial/home/unpublish', [], $body)->assertStatus(401);
        $this->http('POST', '/cms/editorial/home/restore', [], ['targetRevision' => 1, 'expectedRevision' => 1])->assertStatus(401);

        // 2. Viewer role cannot edit draft or publish -> 403
        $this->http('PUT', '/cms/editorial/home/draft', $viewer, ['payload' => (object)[], 'expectedRevision' => 1])->assertStatus(403);
        $this->http('POST', '/cms/editorial/home/discard', $viewer, $body)->assertStatus(403);
        $this->http('POST', '/cms/editorial/home/publish', $viewer, $body)->assertStatus(403);
        $this->http('POST', '/cms/editorial/home/unpublish', $viewer, $body)->assertStatus(403);
        $this->http('POST', '/cms/editorial/home/restore', $viewer, ['targetRevision' => 1, 'expectedRevision' => 1])->assertStatus(403);

        // 3. Editor role can view and edit, but cannot publish/unpublish/restore (requires admin.manage) -> 403
        $this->http('GET', '/cms/editorial/home', $editor)->assertStatus(200);
        $this->http('POST', '/cms/editorial/home/publish', $editor, $body)->assertStatus(403);
        $this->http('POST', '/cms/editorial/home/unpublish', $editor, $body)->assertStatus(403);
        $this->http('POST', '/cms/editorial/home/restore', $editor, ['targetRevision' => 1, 'expectedRevision' => 1])->assertStatus(403);

        // 4. Missing or invalid CSRF header on unsafe writes -> 403
        $this->http('POST', '/cms/editorial/home/publish', $admin, $body, ['HTTP_X_CSRF_TOKEN' => ''])->assertStatus(403);
        $this->http('POST', '/cms/editorial/home/publish', $admin, $body, ['HTTP_X_CSRF_TOKEN' => 'invalid-token'])->assertStatus(403);

        // 5. Forbidden Origin on unsafe writes -> 403
        $this->http('POST', '/cms/editorial/home/publish', $admin, $body, ['HTTP_ORIGIN' => 'https://attacker.invalid'])->assertStatus(403);
        $this->http('POST', '/cms/editorial/home/publish', $admin, $body, ['HTTP_ORIGIN' => ''])->assertStatus(403);

        // 6. Insecure HTTP -> 403
        $this->http('GET', '/cms/editorial/home', $admin, null, ['HTTPS' => 'off'])->assertStatus(403);

        // 7. Expired/revoked epoch -> 401
        DB::table('staff_users')->where('id', $admin['owner'])->update(['credential_epoch' => 2]);
        $this->http('GET', '/cms/editorial/home', $admin)->assertStatus(401);
        DB::table('staff_users')->where('id', $admin['owner'])->update(['credential_epoch' => 1]);
    }

    public function test_draft_secrecy_and_discard(): void
    {
        $staff = $this->staff('admin');
        $source = json_decode(file_get_contents('/tmp/editorial-source.json'), true, 512, JSON_THROW_ON_ERROR);
        $modifiedFixture = $source['home'];
        $modifiedFixture['copy']['h1']['en'] = 'Modified Draft Headline In Safe Mode';

        // Save new draft Revision 2 on top of published Revision 1
        $curRev = (int) DB::table('editorial_documents')->where('slug', 'home')->value('current_revision');
        $this->http('PUT', '/cms/editorial/home/draft', $staff, [
            'payload' => $modifiedFixture,
            'expectedRevision' => $curRev,
        ])->assertStatus(200)
            ->assertJsonPath('data.changed', true)
            ->assertJsonPath('data.revision', 2)
            ->assertJsonPath('data.currentRevision', $curRev + 1);

        // Public STILL sees published Revision 1 with original headline! (Draft secrecy)
        $public = $this->http('GET', '/cms/published/home')->assertStatus(200);
        $this->assertSame($source['home']['copy']['h1']['en'], $public->json('data.payload.copy.h1.en'));

        // Staff sees Draft Revision 2
        $staffEditorial = $this->http('GET', '/cms/editorial/home', $staff)->assertStatus(200);
        $this->assertSame('Modified Draft Headline In Safe Mode', $staffEditorial->json('data.payload.copy.h1.en'));
        $this->assertSame(2, $staffEditorial->json('data.revisionNumber'));
        $this->assertSame($curRev + 1, $staffEditorial->json('data.currentRevision'));

        // Discard draft Revision 2
        $curRevAfterDraft = (int) DB::table('editorial_documents')->where('slug', 'home')->value('current_revision');
        $discard = $this->http('POST', '/cms/editorial/home/discard', $staff, [
            'expectedRevision' => $curRevAfterDraft,
        ])->assertStatus(200);
        $this->assertSame('published', $discard->json('data.status'));
        $this->assertFalse($discard->json('data.hasDraft'));
        $this->assertSame(1, $discard->json('data.revisionNumber'));
        $this->assertSame($curRevAfterDraft + 1, $discard->json('data.currentRevision'));

        // Staff view now shows original published Revision 1
        $staffAfter = $this->http('GET', '/cms/editorial/home', $staff)->assertStatus(200);
        $this->assertSame($source['home']['copy']['h1']['en'], $staffAfter->json('data.payload.copy.h1.en'));
    }

    public function test_unpublish_tombstone_prevents_baseline_resurrection(): void
    {
        $staff = $this->staff('admin');
        $curRev = (int) DB::table('editorial_documents')->where('slug', 'home')->value('current_revision');

        // Unpublish document
        $unpublish = $this->http('POST', '/cms/editorial/home/unpublish', $staff, [
            'expectedRevision' => $curRev,
        ])->assertStatus(200);
        $this->assertSame('unpublished', $unpublish->json('data.status'));
        $this->assertTrue($unpublish->json('data.tombstoned'));
        $this->assertSame($curRev + 1, $unpublish->json('data.currentRevision'));

        // Public read MUST return 410 Gone with error code: 'unpublished' (tombstone)
        $public = $this->http('GET', '/cms/published/home')->assertStatus(410);
        $this->assertSame('unpublished', $public->json('error.code'));
        $this->assertFalse($public->json('success'));
    }

    public function test_prior_published_restore_and_unactivated_rejection(): void
    {
        $staff = $this->staff('admin');
        $curRev = (int) DB::table('editorial_documents')->where('slug', 'home')->value('current_revision');

        // Attempting to restore non-existent revision 99 -> 422
        $this->http('POST', '/cms/editorial/home/restore', $staff, [
            'targetRevision' => 99,
            'expectedRevision' => $curRev,
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_error');

        // Restore Revision 1 (which was previously published)
        $restore = $this->http('POST', '/cms/editorial/home/restore', $staff, [
            'targetRevision' => 1,
            'expectedRevision' => $curRev,
        ])->assertStatus(200);

        $this->assertSame('published', $restore->json('data.status'));
        $this->assertFalse($restore->json('data.tombstoned'));
        $this->assertSame(3, $restore->json('data.revisionNumber'));
        $this->assertSame($curRev + 1, $restore->json('data.currentRevision'));

        // Public read now returns 200 with restored Revision 3
        $this->http('GET', '/cms/published/home')
            ->assertStatus(200)
            ->assertJsonPath('data.revisionNumber', 3)
            ->assertJsonPath('data.status', 'published');
    }

    public function test_audit_failure_rolls_back_entire_mutation(): void
    {
        $staff = $this->staff('admin');
        $source = json_decode(file_get_contents('/tmp/editorial-source.json'), true, 512, JSON_THROW_ON_ERROR);
        $modifiedFixture = $source['home'];
        $modifiedFixture['copy']['h1']['en'] = 'Rollback Probe Title';

        $beforeRevCount = DB::table('editorial_revisions')->where('slug', 'home')->count();
        $beforeAuditCount = DB::table('editorial_audit_events')->where('slug', 'home')->count();
        $currentRevision = (int) DB::table('editorial_documents')->where('slug', 'home')->value('current_revision');

        DB::unprepared("
            CREATE FUNCTION editorial_test_fail() RETURNS trigger LANGUAGE plpgsql AS \$\$
            BEGIN
                RAISE EXCEPTION 'Synthetic audit failure';
            END \$\$;
            CREATE TRIGGER editorial_test_failure BEFORE INSERT ON editorial_audit_events
            FOR EACH ROW EXECUTE FUNCTION editorial_test_fail();
        ");

        try {
            $this->http('PUT', '/cms/editorial/home/draft', $staff, [
                'payload' => $modifiedFixture,
                'expectedRevision' => $currentRevision,
            ])->assertStatus(503);
        } finally {
            DB::unprepared("
                DROP TRIGGER editorial_test_failure ON editorial_audit_events;
                DROP FUNCTION editorial_test_fail();
            ");
        }

        $this->assertSame($beforeRevCount, DB::table('editorial_revisions')->where('slug', 'home')->count());
        $this->assertSame($beforeAuditCount, DB::table('editorial_audit_events')->where('slug', 'home')->count());
        $this->assertSame($currentRevision, (int) DB::table('editorial_documents')->where('slug', 'home')->value('current_revision'));
    }

    public function test_history_immutability(): void
    {
        $sql = [
            ['UPDATE editorial_revisions SET snapshot_hash = ?', [str_repeat('0', 64)]],
            ['DELETE FROM editorial_revisions', []],
            ['TRUNCATE editorial_revisions CASCADE', []],
            ['UPDATE editorial_published_revisions SET revision = 999', []],
            ['DELETE FROM editorial_published_revisions', []],
            ['TRUNCATE editorial_published_revisions CASCADE', []],
            ['UPDATE editorial_audit_events SET outcome = ?', ['failure']],
            ['DELETE FROM editorial_audit_events', []],
            ['TRUNCATE editorial_audit_events CASCADE', []],
        ];

        foreach ($sql as [$stmt, $bindings]) {
            try {
                DB::transaction(fn() => DB::statement($stmt, $bindings));
                $this->fail('History immutability constraint bypassed: ' . $stmt);
            } catch (\Illuminate\Database\QueryException|\PDOException) {
                $this->assertTrue(true);
            }
        }
    }

    public function test_concurrent_draft_edits_one_wins_one_conflicts(): void
    {
        $staffA = $this->staff('admin');
        $staffB = $this->staff('admin');
        $source = json_decode(file_get_contents('/tmp/editorial-source.json'), true, 512, JSON_THROW_ON_ERROR);

        $curRev = (int) DB::table('editorial_documents')->where('slug', 'home')->value('current_revision');

        $docA = $source['home'];
        $docA['copy']['h1']['en'] = 'Concurrent Edit A';
        $docB = $source['home'];
        $docB['copy']['h1']['en'] = 'Concurrent Edit B';

        $inputs = [
            [
                'session' => $staffA,
                'path' => '/cms/editorial/home/draft',
                'method' => 'PUT',
                'body' => ['payload' => $docA, 'expectedRevision' => $curRev],
            ],
            [
                'session' => $staffB,
                'path' => '/cms/editorial/home/draft',
                'method' => 'PUT',
                'body' => ['payload' => $docB, 'expectedRevision' => $curRev],
            ],
        ];

        $results = $this->race($inputs);
        sort($results);
        $this->assertSame([200, 409], $results);
    }

    private function race(array $inputs): array
    {
        $children = [];
        try {
            foreach ($inputs as $input) {
                $pipes = [];
                $process = proc_open(
                    [PHP_BINARY, base_path('tests/Feature/Editorial/concurrency-worker.php')],
                    [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
                    $pipes,
                    base_path()
                );
                if (!is_resource($process)) {
                    throw new \RuntimeException('Worker unavailable.');
                }
                stream_set_blocking($pipes[1], false);
                stream_set_blocking($pipes[2], false);
                $children[] = [$process, $pipes];
                fwrite($pipes[0], json_encode($input, JSON_THROW_ON_ERROR) . "\n");
                fflush($pipes[0]);
            }

            foreach ($children as [, $pipes]) {
                $ready = false;
                for ($i = 0; $i < 40; $i++) {
                    $out = fread($pipes[1], 1024);
                    if ($out !== false && str_contains($out, "READY\n")) {
                        $ready = true;
                        break;
                    }
                    usleep(50000);
                }
                if (!$ready) {
                    throw new \RuntimeException('Worker not ready.');
                }
            }

            foreach ($children as [, $pipes]) {
                fwrite($pipes[0], "GO\n");
                fflush($pipes[0]);
            }

            $codes = [];
            foreach ($children as [$process, $pipes]) {
                $output = '';
                for ($i = 0; $i < 40; $i++) {
                    $chunk = fread($pipes[1], 1024);
                    if ($chunk !== false) {
                        $output .= $chunk;
                    }
                    if (str_contains($output, "\n")) {
                        break;
                    }
                    usleep(50000);
                }
                fclose($pipes[0]);
                fclose($pipes[1]);
                fclose($pipes[2]);
                proc_close($process);
                $lines = array_filter(explode("\n", trim($output)));
                $code = (int) end($lines);
                $codes[] = $code;
            }
            return $codes;
        } finally {
            foreach ($children as [$process, $pipes]) {
                if (is_resource($pipes[0] ?? null)) {
                    @fclose($pipes[0]);
                }
                if (is_resource($pipes[1] ?? null)) {
                    @fclose($pipes[1]);
                }
                if (is_resource($pipes[2] ?? null)) {
                    @fclose($pipes[2]);
                }
                if (is_resource($process)) {
                    @proc_terminate($process);
                    @proc_close($process);
                }
            }
        }
    }

    public function test_stale_expected_revision_conflicts_across_mutations(): void
    {
        $staff = $this->staff('admin');
        $source = json_decode(file_get_contents('/tmp/editorial-source.json'), true, 512, JSON_THROW_ON_ERROR);

        // Travel was published in lifecycle test.
        $curRev = (int) DB::table('editorial_documents')->where('slug', 'travel')->value('current_revision');

        // Stale expectedRevision on unpublish -> 409
        $this->http('POST', '/cms/editorial/travel/unpublish', $staff, [
            'expectedRevision' => $curRev - 1,
        ])->assertStatus(409)->assertJsonPath('error.code', 'conflict');

        // Stale expectedRevision on publish -> 409
        $this->http('POST', '/cms/editorial/travel/publish', $staff, [
            'expectedRevision' => $curRev - 1,
        ])->assertStatus(409)->assertJsonPath('error.code', 'conflict');

        // Stale expectedRevision on discard -> 409
        $this->http('POST', '/cms/editorial/travel/discard', $staff, [
            'expectedRevision' => $curRev - 1,
        ])->assertStatus(409)->assertJsonPath('error.code', 'conflict');

        // Stale expectedRevision on restore -> 409
        $this->http('POST', '/cms/editorial/travel/restore', $staff, [
            'targetRevision' => 1,
            'expectedRevision' => $curRev - 1,
        ])->assertStatus(409)->assertJsonPath('error.code', 'conflict');
    }

    public function test_blocked_session_expiry_during_lock_wait_returns_401(): void
    {
        $staffHolding = $this->staff('admin');
        $staffBlocked = $this->staff('admin');
        $source = json_decode(file_get_contents('/tmp/editorial-source.json'), true, 512, JSON_THROW_ON_ERROR);

        // 1. Spawn lock holder process to hold pg_advisory_lock on editorial_doc:airport.past
        $holderPipes = [];
        $holderProc = proc_open(
            [PHP_BINARY, base_path('tests/Feature/Editorial/concurrency-worker.php')],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $holderPipes,
            base_path()
        );
        $this->assertIsResource($holderProc);
        stream_set_blocking($holderPipes[1], false);
        stream_set_blocking($holderPipes[2], false);

        fwrite($holderPipes[0], json_encode(['action' => 'lock', 'key' => 'editorial_doc:airport.past'], JSON_THROW_ON_ERROR) . "\n");
        fflush($holderPipes[0]);

        $holderBuf = '';
        $locked = false;
        for ($i = 0; $i < 60; $i++) {
            $chunk = fread($holderPipes[1], 1024);
            if ($chunk !== false) {
                $holderBuf .= $chunk;
            }
            if (str_contains($holderBuf, "LOCKED\n")) {
                $locked = true;
                break;
            }
            usleep(50000);
        }
        $holderErr = fread($holderPipes[2], 2048);
        $this->assertTrue($locked, 'Holder process did not acquire lock. Err: ' . ($holderErr !== false ? $holderErr : ''));

        // 2. Spawn worker with staffBlocked attempting to mutate airport.past
        $curRev = (int) DB::table('editorial_documents')->where('slug', 'airport.past')->value('current_revision');
        $doc = $source['airport.past'];
        $doc['intro']['title']['en'] = 'Blocked Expiry Probe';

        $workerPipes = [];
        $workerProc = proc_open(
            [PHP_BINARY, base_path('tests/Feature/Editorial/concurrency-worker.php')],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $workerPipes,
            base_path()
        );
        $this->assertIsResource($workerProc);
        stream_set_blocking($workerPipes[1], false);
        stream_set_blocking($workerPipes[2], false);

        fwrite($workerPipes[0], json_encode([
            'session' => $staffBlocked,
            'path' => '/cms/editorial/airport.past/draft',
            'method' => 'PUT',
            'body' => ['payload' => $doc, 'expectedRevision' => $curRev],
        ], JSON_THROW_ON_ERROR) . "\n");
        fflush($workerPipes[0]);

        $workerBuf = '';
        $ready = false;
        for ($i = 0; $i < 60; $i++) {
            $chunk = fread($workerPipes[1], 1024);
            if ($chunk !== false) {
                $workerBuf .= $chunk;
            }
            if (str_contains($workerBuf, "READY\n")) {
                $ready = true;
                break;
            }
            usleep(50000);
        }
        $workerErr = fread($workerPipes[2], 2048);
        $this->assertTrue($ready, 'Worker process did not report ready. Err: ' . ($workerErr !== false ? $workerErr : ''));

        // 3. Set staffBlocked's session absolute and idle expiry to expire in 1500ms (worker holds no locks yet)
        $targetExpiry = CarbonImmutable::now()->addMilliseconds(1500)->toIso8601String();
        DB::table('staff_sessions')->where('id', $staffBlocked['id'])->update([
            'absolute_expires_at' => $targetExpiry,
            'idle_expires_at' => $targetExpiry,
        ]);

        // Send GO: Worker passes initial authorizer check, then blocks in PostgreSQL waiting on lock
        fwrite($workerPipes[0], "GO\n");
        fflush($workerPipes[0]);

        // Wait until worker is actively blocked in PostgreSQL advisory lock queue
        $blockedInPg = false;
        for ($i = 0; $i < 60; $i++) {
            $row = DB::selectOne("SELECT count(*) as cnt FROM pg_locks WHERE locktype = 'advisory' AND NOT granted");
            if ($row !== null && (int) $row->cnt > 0) {
                $blockedInPg = true;
                break;
            }
            usleep(50000);
        }
        $this->assertTrue($blockedInPg, 'Worker was not blocked in PostgreSQL lock queue');

        // Wait 2000ms so absolute and idle expiry (1500ms) elapse while blocked in lock queue
        usleep(2000000);

        // Release the advisory lock held by the holder
        fwrite($holderPipes[0], "UNLOCK\n");
        fflush($holderPipes[0]);
        fclose($holderPipes[0]);
        fclose($holderPipes[1]);
        fclose($holderPipes[2]);
        proc_close($holderProc);

        // Worker unblocks, acquires lock, revalidates authorizer post-lock, and receives 401!
        $output = '';
        for ($i = 0; $i < 60; $i++) {
            $chunk = fread($workerPipes[1], 1024);
            if ($chunk !== false) {
                $output .= $chunk;
            }
            if (str_contains($output, "\n")) {
                break;
            }
            usleep(50000);
        }
        fclose($workerPipes[0]);
        fclose($workerPipes[1]);
        fclose($workerPipes[2]);
        proc_close($workerProc);

        $lines = array_filter(explode("\n", trim($output)));
        $code = (int) end($lines);
        $this->assertSame(401, $code, 'Blocked worker must receive 401 Unauthorized after session expired in lock queue');

        // Verify draft was NOT mutated
        $latestDoc = $this->http('GET', '/cms/editorial/airport.past', $staffHolding)->json('data');
        $this->assertNotSame('Blocked Expiry Probe', $latestDoc['payload']['intro']['title']['en']);
    }

    public function test_closed_request_schemas_and_tamper_immutability(): void
    {
        $staff = $this->staff('admin');
        $source = json_decode(file_get_contents('/tmp/editorial-source.json'), true, 512, JSON_THROW_ON_ERROR);

        $curRev = (int) DB::table('editorial_documents')->where('slug', 'home')->value('current_revision');
        $beforeRevCount = DB::table('editorial_revisions')->where('slug', 'home')->count();
        $beforeAuditCount = DB::table('editorial_audit_events')->where('slug', 'home')->count();

        // 1. Extra root field 'ownerApproved: true' on PUT draft -> 422
        $this->http('PUT', '/cms/editorial/home/draft', $staff, [
            'expectedRevision' => $curRev,
            'payload' => $source['home'],
            'ownerApproved' => true,
        ])->assertStatus(422)->assertJsonPath('error.code', 'validation_error');

        // 2. Extra root field on POST publish -> 422
        $this->http('POST', '/cms/editorial/home/publish', $staff, [
            'expectedRevision' => $curRev,
            'extraKey' => 'invented',
        ])->assertStatus(422)->assertJsonPath('error.code', 'validation_error');

        // 3. Extra root field on POST discard -> 422
        $this->http('POST', '/cms/editorial/home/discard', $staff, [
            'expectedRevision' => $curRev,
            'extraKey' => 'invented',
        ])->assertStatus(422)->assertJsonPath('error.code', 'validation_error');

        // 4. Extra root field on POST unpublish -> 422
        $this->http('POST', '/cms/editorial/home/unpublish', $staff, [
            'expectedRevision' => $curRev,
            'extraKey' => 'invented',
        ])->assertStatus(422)->assertJsonPath('error.code', 'validation_error');

        // 5. Extra root field on POST restore -> 422
        $this->http('POST', '/cms/editorial/home/restore', $staff, [
            'targetRevision' => 1,
            'expectedRevision' => $curRev,
            'extraKey' => 'invented',
        ])->assertStatus(422)->assertJsonPath('error.code', 'validation_error');

        // 6. Numeric coercion on expectedRevision: string instead of int -> 422
        $this->http('PUT', '/cms/editorial/home/draft', $staff, [
            'expectedRevision' => (string) $curRev,
            'payload' => $source['home'],
        ])->assertStatus(422)->assertJsonPath('error.code', 'validation_error');

        // 7. Unsafe integer > JS safe integer (9007199254740992) -> 422
        $this->http('PUT', '/cms/editorial/home/draft', $staff, [
            'expectedRevision' => 9007199254740992,
            'payload' => $source['home'],
        ])->assertStatus(422)->assertJsonPath('error.code', 'validation_error');

        // 8. Invalid Content-Type (text/plain) -> 400
        $this->http('PUT', '/cms/editorial/home/draft', $staff, [
            'expectedRevision' => $curRev,
            'payload' => $source['home'],
        ], ['CONTENT_TYPE' => 'text/plain'])->assertStatus(400);

        // 9. Tamper check: Assert zero database mutation across all rejected attempts
        $this->assertSame($beforeRevCount, DB::table('editorial_revisions')->where('slug', 'home')->count());
        $this->assertSame($beforeAuditCount, DB::table('editorial_audit_events')->where('slug', 'home')->count());
        $this->assertSame($curRev, (int) DB::table('editorial_documents')->where('slug', 'home')->value('current_revision'));
    }

    public function test_all_negative_responses_matrix(): void
    {
        $staff = $this->staff('admin');
        $curRev = (int) DB::table('editorial_documents')->where('slug', 'home')->value('current_revision');

        $operations = [
            ['get', '/cms/published/home', 'getCmsPublishedBySlug', [], null],
            ['get', '/cms/editorial/home', 'getCmsEditorialBySlug', $staff, null],
            ['put', '/cms/editorial/home/draft', 'putCmsEditorialDraft', $staff, ['payload' => (object)[], 'expectedRevision' => $curRev]],
            ['post', '/cms/editorial/home/discard', 'postCmsEditorialDiscard', $staff, ['expectedRevision' => $curRev]],
            ['post', '/cms/editorial/home/publish', 'postCmsEditorialPublish', $staff, ['expectedRevision' => $curRev]],
            ['post', '/cms/editorial/home/unpublish', 'postCmsEditorialUnpublish', $staff, ['expectedRevision' => $curRev]],
            ['post', '/cms/editorial/home/restore', 'postCmsEditorialRestore', $staff, ['targetRevision' => 1, 'expectedRevision' => $curRev]],
        ];

        // 1. Capture 400 Bad Request
        // Payload exceeding 256KiB
        $giantPayload = str_repeat('a', 270000);
        $this->http('PUT', '/cms/editorial/home/draft', $staff, null, [], $giantPayload, 'putCmsEditorialDraft')
            ->assertStatus(400);
        $this->http('POST', '/cms/editorial/home/discard', $staff, null, [], $giantPayload, 'postCmsEditorialDiscard')
            ->assertStatus(400);
        $this->http('POST', '/cms/editorial/home/publish', $staff, null, [], $giantPayload, 'postCmsEditorialPublish')
            ->assertStatus(400);
        $this->http('POST', '/cms/editorial/home/unpublish', $staff, null, [], $giantPayload, 'postCmsEditorialUnpublish')
            ->assertStatus(400);
        $this->http('POST', '/cms/editorial/home/restore', $staff, null, [], $giantPayload, 'postCmsEditorialRestore')
            ->assertStatus(400);
        // For GET operations: request with giant header line triggering 400
        $this->http('GET', '/cms/published/home', [], null, ['HTTP_X_BAD' => str_repeat('x', 65536)], null, 'getCmsPublishedBySlug')
            ->assertStatus(400);
        $this->http('GET', '/cms/editorial/home', $staff, null, ['HTTP_X_BAD' => str_repeat('x', 65536)], null, 'getCmsEditorialBySlug')
            ->assertStatus(400);

        // 2. Capture 422 Validation Error
        // Invalid payload structure / script tags
        $badDoc = ['id' => 'home', 'kind' => 'home', 'schemaVersion' => 1, 'seo' => ['title' => ['en' => '<script>alert(1)</script>', 'ar' => 'x'], 'description' => ['en' => 'y', 'ar' => 'z']]];
        $this->http('PUT', '/cms/editorial/home/draft', $staff, ['payload' => $badDoc, 'expectedRevision' => $curRev], [], null, 'putCmsEditorialDraft')
            ->assertStatus(422);
        // Invalid targetRevision or missing expectedRevision
        $this->http('POST', '/cms/editorial/home/discard', $staff, ['expectedRevision' => -1], [], null, 'postCmsEditorialDiscard')
            ->assertStatus(422);
        $this->http('POST', '/cms/editorial/home/publish', $staff, ['expectedRevision' => -1], [], null, 'postCmsEditorialPublish')
            ->assertStatus(422);
        $this->http('POST', '/cms/editorial/home/unpublish', $staff, ['expectedRevision' => -1], [], null, 'postCmsEditorialUnpublish')
            ->assertStatus(422);
        $this->http('POST', '/cms/editorial/home/restore', $staff, ['targetRevision' => 0, 'expectedRevision' => $curRev], [], null, 'postCmsEditorialRestore')
            ->assertStatus(422);

        // 3. Capture 404 Not Found for uncreated / unknown document
        $this->http('GET', '/cms/published/uncreated-doc', [], null, [], null, 'getCmsPublishedBySlug')
            ->assertStatus(404);
        $this->http('GET', '/cms/editorial/uncreated-doc', $staff, null, [], null, 'getCmsEditorialBySlug')
            ->assertStatus(404);
        $this->http('PUT', '/cms/editorial/uncreated-doc/draft', $staff, ['payload' => (object)[], 'expectedRevision' => 0], [], null, 'putCmsEditorialDraft')
            ->assertStatus(404);
        $this->http('POST', '/cms/editorial/uncreated-doc/discard', $staff, ['expectedRevision' => 0], [], null, 'postCmsEditorialDiscard')
            ->assertStatus(404);
        $this->http('POST', '/cms/editorial/uncreated-doc/publish', $staff, ['expectedRevision' => 0], [], null, 'postCmsEditorialPublish')
            ->assertStatus(404);
        $this->http('POST', '/cms/editorial/uncreated-doc/unpublish', $staff, ['expectedRevision' => 0], [], null, 'postCmsEditorialUnpublish')
            ->assertStatus(404);
        $this->http('POST', '/cms/editorial/uncreated-doc/restore', $staff, ['targetRevision' => 1, 'expectedRevision' => 0], [], null, 'postCmsEditorialRestore')
            ->assertStatus(404);

        // 4. Capture 503 Service Unavailable across all 7 operations
        DB::statement('ALTER TABLE cache RENAME TO editorial_test_unavailable_cache');
        try {
            foreach ($operations as [$method, $path, $op, $sess, $b]) {
                $this->http(strtoupper($method), $path, $sess, $b ?? null, [], null, $op)
                    ->assertStatus(503);
            }
        } finally {
            DB::statement('ALTER TABLE editorial_test_unavailable_cache RENAME TO cache');
        }

        // 5. Capture 429 Too Many Requests across all 7 operations
        RateLimiter::for('api', static fn($request) =>
            \Illuminate\Cache\RateLimiting\Limit::perMinute(1)->by('editorial:' . $request->ip()));

        foreach ($operations as [$method, $path, $op, $sess, $b]) {
            $headers = ['REMOTE_ADDR' => '2001:db8:' . bin2hex(random_bytes(2)) . '::4'];
            $this->http(strtoupper($method), $path, $sess, $b ?? null, $headers, null, $op);
            $this->http(strtoupper($method), $path, $sess, $b ?? null, $headers, null, $op)
                ->assertStatus(429)
                ->assertHeader('Retry-After');
        }

        // 6. Capture 410 Gone for getCmsPublishedBySlug on unpublished document
        $curDestRev = (int) DB::table('editorial_documents')->where('slug', 'destinations.editorial')->value('current_revision');
        $this->http('POST', '/cms/editorial/destinations.editorial/unpublish', $staff, ['expectedRevision' => $curDestRev]);
        $this->http('GET', '/cms/published/destinations.editorial', [], null, [], null, 'getCmsPublishedBySlug')
            ->assertStatus(410);
    }
    public function test_review_recursive_payload_closure_and_corrupt_public_read(): void
    {
        Artisan::call('migrate:rollback', ['--step' => DB::table('migrations')->where('migration', '>=', '2026_10_11_000006_create_editorial_publication_tables')->count(), '--force' => true]);
        Artisan::call('migrate', ['--force' => true]);
        $staff = $this->staff();
        $source = json_decode(file_get_contents('/tmp/editorial-source.json'), true, 512, JSON_THROW_ON_ERROR);
        $validator = new \App\Editorial\Validation\EditorialValidator();
        $walk = function (array $node, array $path = []) use (&$walk): array {
            $paths = !array_is_list($node) ? [$path] : [];
            foreach ($node as $key => $value) if (is_array($value)) $paths = array_merge($paths, $walk($value, [...$path, $key]));
            return $paths;
        };
        foreach ($source as $slug => $payload) {
            $validator->validate($slug, $payload);
            foreach ($walk($payload) as $path) {
                $bad = $payload; $node = &$bad;
                foreach ($path as $key) $node = &$node[$key];
                $node['ownerApproved'] = true; unset($node);
                try { $validator->validate($slug, $bad); $this->fail('Unknown nested field accepted.'); }
                catch (\App\Editorial\Exceptions\EditorialValidationException) { $this->addToAssertionCount(1); }
            }
        }
        $before = [DB::table('editorial_revisions')->count(), DB::table('editorial_audit_events')->count()];
        foreach ([['ownerApproved'], ['seo', 'secretValue'], ['copy', 'h1', 'secretValue'], ['sections', 0, 'secretValue']] as $path) {
            $bad = $source['home']; $node = &$bad;
            foreach (array_slice($path, 0, -1) as $key) $node = &$node[$key];
            $node[end($path)] = 'private-sentinel'; unset($node);
            $this->http('PUT', '/cms/editorial/home/draft', $staff, ['payload' => $bad, 'expectedRevision' => 0])->assertStatus(422);
        }
        $this->assertSame($before, [DB::table('editorial_revisions')->count(), DB::table('editorial_audit_events')->count()]);
        $this->http('PUT', '/cms/editorial/home/draft', $staff, ['payload' => $source['home'], 'expectedRevision' => 0])->assertStatus(200);
        $this->http('POST', '/cms/editorial/home/publish', $staff, ['expectedRevision' => 1])->assertStatus(200);
        $this->http('GET', '/cms/published/home')->assertStatus(200);
        // Disposable test database: simulate legacy malformed immutable bytes without promoting them.
        DB::statement('ALTER TABLE editorial_revisions DISABLE TRIGGER USER');
        try {
            $bad = $source['home']; $bad['seo']['secretValue'] = 'private-sentinel';
            DB::table('editorial_revisions')->where('slug', 'home')->update(['snapshot_bytes' => json_encode($bad, JSON_THROW_ON_ERROR), 'snapshot_json' => json_encode($bad, JSON_THROW_ON_ERROR), 'snapshot_hash' => hash('sha256', json_encode($bad, JSON_THROW_ON_ERROR))]);
        } finally { DB::statement('ALTER TABLE editorial_revisions ENABLE TRIGGER USER'); }
        $response = $this->http('GET', '/cms/published/home')->assertStatus(500);
        $this->assertStringNotContainsString('private-sentinel', $response->getContent());
    }

}
