<?php

declare(strict_types=1);

namespace Tests\Feature\Gallery;

use App\Identity\Mfa\TotpSecret;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Sessions\StaffSessionStore;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class GalleryRoutesTest extends TestCase
{
    private static ?string $hash = null;

    private function resetGalleryTables(): void
    {
        if (!app()->environment('testing') || DB::connection()->getDatabaseName() !== 'gaza_gateway_test') {
            throw new \LogicException('Gallery cleanup requires the disposable testing database.');
        }
        if (!Schema::hasTable('gallery_documents')) return;
        DB::transaction(function (): void {
            DB::table('gallery_documents')->update(['draft_revision' => null, 'published_revision' => null]);
            DB::statement('SET CONSTRAINTS ALL IMMEDIATE');
            $tables = ['gallery_revisions', 'gallery_published_revisions', 'gallery_audit_events'];
            foreach ($tables as $table) DB::statement("ALTER TABLE {$table} DISABLE TRIGGER USER");
            try {
                DB::table('gallery_audit_events')->delete();
                DB::table('gallery_published_revisions')->delete();
                DB::table('gallery_revisions')->delete();
                DB::table('gallery_documents')->delete();
            } finally {
                foreach ($tables as $table) DB::statement("ALTER TABLE {$table} ENABLE TRIGGER USER");
            }
        });
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->resetGalleryTables();
    }

    protected function tearDown(): void
    {
        RateLimiter::clearResolvedInstances();
        if (Schema::hasTable('gallery_test_unavailable_cache')) {
            DB::statement('ALTER TABLE gallery_test_unavailable_cache RENAME TO cache');
        }
        $this->resetGalleryTables();
        parent::tearDown();
    }

    private function staff(string $role = 'admin'): array
    {
        $id = (string) Str::uuid();
        self::$hash ??= app(Argon2idPasswordHasher::class)->hash('Synthetic-gallery-password-2026', 'staff');
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
            $path === '/gallery/published' => 'getGalleryPublished',
            $path === '/gallery/editorial' => 'getGalleryEditorial',
            str_ends_with($path, '/draft') => 'putGalleryDraft',
            str_ends_with($path, '/discard') => 'postGalleryDiscard',
            str_ends_with($path, '/publish') => 'postGalleryPublish',
            str_ends_with($path, '/unpublish') => 'postGalleryUnpublish',
            str_ends_with($path, '/restore') => 'postGalleryRestore',
            default => null,
        };

        if ($operation !== null && (getenv('GALLERY_GATE_OWNED') === '1' || getenv('EDITORIAL_GATE_OWNED') === '1' || getenv('REFERENCE_GATE_OWNED') === '1')) {
            $file = '/tmp/gallery-captures.json';
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

    private function validPayload(): array
    {
        return [
            'items' => [
                [
                    'recordId' => 'rec-present-ruins-2008',
                    'visible' => true,
                    'title' => [
                        'en' => 'Passenger Terminal Ruins 2008',
                        'ar' => 'أطلال مبنى المسافرين 2008',
                    ],
                    'caption' => [
                        'en' => 'Historical ruins photograph.',
                        'ar' => 'صورة توثيقية للأطلال.',
                    ],
                ],
                [
                    'recordId' => 'past-003',
                    'visible' => true,
                    'title' => [
                        'en' => 'Dash 8 aircraft',
                        'ar' => 'طائرة داش 8',
                    ],
                ],
                [
                    'recordId' => 'vid-ref-ap-1998-opening',
                    'visible' => false,
                ],
            ],
        ];
    }

    public function test_migration_roundtrip_preserves_database_integrity(): void
    {
        try {
            $staff = $this->staff();
            $this->assertSame(0, DB::table('gallery_documents')->count());

            $this->assertSame(0, Artisan::call('migrate:rollback', ['--step' => DB::table('migrations')->where('migration','>=','2026_10_11_000010_create_mvp_gallery_tables')->count(), '--force' => true]));
            $this->assertFalse(Schema::hasTable('gallery_documents'));
            $this->assertFalse(Schema::hasTable('gallery_revisions'));
            $this->assertFalse(Schema::hasTable('gallery_published_revisions'));
            $this->assertFalse(Schema::hasTable('gallery_audit_events'));
            $this->assertTrue(DB::table('staff_users')->where('id', $staff['owner'])->exists());

            $this->assertSame(0, Artisan::call('migrate', ['--force' => true]));
            $this->assertTrue(Schema::hasTable('gallery_documents'));
            $this->assertSame(0, DB::table('gallery_documents')->count());
        } finally {
            if (!Schema::hasTable('gallery_documents')) {
                Artisan::call('migrate', ['--force' => true]);
            }
        }
    }

    public function test_empty_database_returns_404_not_found_on_published_read(): void
    {
        $response = $this->http('GET', '/gallery/published');
        $response->assertStatus(404);
        $this->assertSame('not_found', $response->json('error.code'));
    }

    public function test_unauthenticated_and_forbidden_staff_reads_and_writes(): void
    {
        // Unauthenticated
        $this->http('GET', '/gallery/editorial')->assertStatus(401);
        $this->http('PUT', '/gallery/editorial/draft', [], ['expectedRevision' => 0, 'payload' => $this->validPayload()])->assertStatus(401);

        // Viewer role
        $viewer = $this->staff('viewer');
        $this->http('GET', '/gallery/editorial', $viewer)->assertStatus(404); // Authenticated, but not created
        $this->http('PUT', '/gallery/editorial/draft', $viewer, ['expectedRevision' => 0, 'payload' => $this->validPayload()])->assertStatus(403);
        $this->http('POST', '/gallery/editorial/publish', $viewer, ['expectedRevision' => 0])->assertStatus(403);

        // Editor role
        $editor = $this->staff('editor');
        $this->http('PUT', '/gallery/editorial/draft', $editor, ['expectedRevision' => 0, 'payload' => $this->validPayload()])->assertStatus(200);
        // Editor cannot publish
        $this->http('POST', '/gallery/editorial/publish', $editor, ['expectedRevision' => 1])->assertStatus(403);

        // Discard by editor
        $this->http('POST', '/gallery/editorial/discard', $editor, ['expectedRevision' => 1])->assertStatus(200);

        // Clean up documents for next tests
        $this->resetGalleryTables();
    }

    public function test_save_draft_publish_and_public_read_lifecycle(): void
    {
        $admin = $this->staff('admin');

        // Initial draft save at expectedRevision 0
        $resDraft = $this->http('PUT', '/gallery/editorial/draft', $admin, [
            'expectedRevision' => 0,
            'payload' => $this->validPayload(),
        ]);
        $resDraft->assertStatus(200);
        $resDraft->assertJsonPath('data.changed', true);
        $resDraft->assertJsonPath('data.revision', 1);
        $resDraft->assertJsonPath('data.currentRevision', 1);
        $resDraft->assertJsonPath('data.status', 'draft');

        // Public read is still 404: draft is hidden from public!
        $this->http('GET', '/gallery/published')->assertStatus(404);

        // Editorial read shows draft
        $resEditorial = $this->http('GET', '/gallery/editorial', $admin);
        $resEditorial->assertStatus(200);
        $resEditorial->assertJsonPath('data.currentRevision', 1);
        $resEditorial->assertJsonPath('data.hasDraft', true);
        $resEditorial->assertJsonPath('data.status', 'draft');
        $resEditorial->assertJsonPath('data.payload.items.0.recordId', 'rec-present-ruins-2008');

        // Publish
        $resPublish = $this->http('POST', '/gallery/editorial/publish', $admin, [
            'expectedRevision' => 1,
        ]);
        $resPublish->assertStatus(200);
        $resPublish->assertJsonPath('data.currentRevision', 2);
        $resPublish->assertJsonPath('data.publishedRevision', 1);
        $resPublish->assertJsonPath('data.draftRevision', null);
        $resPublish->assertJsonPath('data.status', 'published');
        $resPublish->assertJsonPath('data.hasDraft', false);

        // Public read now returns 200
        $resPublic = $this->http('GET', '/gallery/published');
        $resPublic->assertStatus(200);
        $resPublic->assertJsonPath('data.status', 'published');
        $resPublic->assertJsonPath('data.revisionNumber', 1);
        $resPublic->assertJsonPath('data.payload.items.0.recordId', 'rec-present-ruins-2008');

        // Save a second draft (modify title)
        $modifiedPayload = $this->validPayload();
        $modifiedPayload['items'][0]['title']['en'] = 'Updated Passenger Terminal Ruins';
        $resDraft2 = $this->http('PUT', '/gallery/editorial/draft', $admin, [
            'expectedRevision' => 2,
            'payload' => $modifiedPayload,
        ]);
        $resDraft2->assertStatus(200);
        $resDraft2->assertJsonPath('data.currentRevision', 3);
        $resDraft2->assertJsonPath('data.revision', 2);

        // Public snapshot contains NO drafts: public still sees original published revision 1
        $resPublic2 = $this->http('GET', '/gallery/published');
        $resPublic2->assertStatus(200);
        $resPublic2->assertJsonPath('data.revisionNumber', 1);
        $resPublic2->assertJsonPath('data.payload.items.0.title.en', 'Passenger Terminal Ruins 2008');

        // Discard draft 2
        $resDiscard = $this->http('POST', '/gallery/editorial/discard', $admin, [
            'expectedRevision' => 3,
        ]);
        $resDiscard->assertStatus(200);
        $resDiscard->assertJsonPath('data.currentRevision', 4);
        $resDiscard->assertJsonPath('data.hasDraft', false);
        $resDiscard->assertJsonPath('data.status', 'published');

        // Clean up
        $this->resetGalleryTables();
    }

    public function test_conflict_handling_at_stale_expected_revision(): void
    {
        $admin = $this->staff('admin');

        // Initial save
        $this->http('PUT', '/gallery/editorial/draft', $admin, [
            'expectedRevision' => 0,
            'payload' => $this->validPayload(),
        ])->assertStatus(200);

        // Try save draft with stale expectedRevision 0 -> 409
        $resConflict = $this->http('PUT', '/gallery/editorial/draft', $admin, [
            'expectedRevision' => 0,
            'payload' => $this->validPayload(),
        ]);
        $resConflict->assertStatus(409);
        $resConflict->assertJsonPath('error.code', 'conflict');

        // Try publish with stale expectedRevision 0 -> 409
        $this->http('POST', '/gallery/editorial/publish', $admin, ['expectedRevision' => 0])->assertStatus(409);

        // Try discard with stale expectedRevision 0 -> 409
        $this->http('POST', '/gallery/editorial/discard', $admin, ['expectedRevision' => 0])->assertStatus(409);

        // Try unpublish with stale expectedRevision 0 -> 409
        $this->http('POST', '/gallery/editorial/unpublish', $admin, ['expectedRevision' => 0])->assertStatus(409);

        // Try restore with stale expectedRevision 0 -> 409
        $this->http('POST', '/gallery/editorial/restore', $admin, ['expectedRevision' => 0, 'targetRevision' => 1])->assertStatus(409);

        // Clean up
        $this->resetGalleryTables();
    }

    public function test_validation_rejects_arbitrary_held_unknown_records_and_unknown_keys(): void
    {
        $admin = $this->staff('admin');

        // 1. Arbitrary / unknown recordId -> 422
        $badPayload = $this->validPayload();
        $badPayload['items'][0]['recordId'] = 'arbitrary-id-999';
        $this->http('PUT', '/gallery/editorial/draft', $admin, [
            'expectedRevision' => 0,
            'payload' => $badPayload,
        ])->assertStatus(422)->assertJsonPath('error.code', 'validation_error');

        // 2. Held provenance / unapproved intake ID -> 422
        $heldPayload = $this->validPayload();
        $heldPayload['items'][0]['recordId'] = 'rec-intake-unapproved-held';
        $this->http('PUT', '/gallery/editorial/draft', $admin, [
            'expectedRevision' => 0,
            'payload' => $heldPayload,
        ])->assertStatus(422);

        // 3. Duplicate record IDs -> 422
        $dupPayload = $this->validPayload();
        $dupPayload['items'] = [
            ['recordId' => 'past-003', 'visible' => true],
            ['recordId' => 'past-003', 'visible' => false],
        ];
        $this->http('PUT', '/gallery/editorial/draft', $admin, [
            'expectedRevision' => 0,
            'payload' => $dupPayload,
        ])->assertStatus(422);

        // 4. Nested unknown key in item -> 422
        $unknownKeyItem = $this->validPayload();
        $unknownKeyItem['items'][0]['unknownAttribute'] = 'forbidden';
        $this->http('PUT', '/gallery/editorial/draft', $admin, [
            'expectedRevision' => 0,
            'payload' => $unknownKeyItem,
        ])->assertStatus(422);

        // 5. Nested unknown key in title -> 422
        $unknownKeyTitle = $this->validPayload();
        $unknownKeyTitle['items'][0]['title']['fr'] = 'French title';
        $this->http('PUT', '/gallery/editorial/draft', $admin, [
            'expectedRevision' => 0,
            'payload' => $unknownKeyTitle,
        ])->assertStatus(422);

        // 6. Forbidden caller ownerApproved at root -> 422
        $ownerApprovedRoot = $this->validPayload();
        $ownerApprovedRoot['ownerApproved'] = true;
        $this->http('PUT', '/gallery/editorial/draft', $admin, [
            'expectedRevision' => 0,
            'payload' => $ownerApprovedRoot,
        ])->assertStatus(422);

        // 7. Forbidden caller ownerApproved nested in item -> 422
        $ownerApprovedNested = $this->validPayload();
        $ownerApprovedNested['items'][0]['ownerApproved'] = true;
        $this->http('PUT', '/gallery/editorial/draft', $admin, [
            'expectedRevision' => 0,
            'payload' => $ownerApprovedNested,
        ])->assertStatus(422);

        // 8. Missing expectedRevision -> 422
        $this->http('PUT', '/gallery/editorial/draft', $admin, [
            'payload' => $this->validPayload(),
        ])->assertStatus(422);

        // 9. Negative expectedRevision -> 422
        $this->http('PUT', '/gallery/editorial/draft', $admin, [
            'expectedRevision' => -1,
            'payload' => $this->validPayload(),
        ])->assertStatus(422);
    }

    public function test_unpublish_and_restore_lifecycle(): void
    {
        $admin = $this->staff('admin');

        // Create rev 1
        $this->http('PUT', '/gallery/editorial/draft', $admin, [
            'expectedRevision' => 0,
            'payload' => $this->validPayload(),
        ])->assertStatus(200);

        // Publish rev 1
        $this->http('POST', '/gallery/editorial/publish', $admin, [
            'expectedRevision' => 1,
        ])->assertStatus(200);

        // Public read 200
        $this->http('GET', '/gallery/published')->assertStatus(200);

        // Unpublish (curRev 2 -> 3)
        $resUnpublish = $this->http('POST', '/gallery/editorial/unpublish', $admin, [
            'expectedRevision' => 2,
        ]);
        $resUnpublish->assertStatus(200);
        $resUnpublish->assertJsonPath('data.status', 'unpublished');
        $resUnpublish->assertJsonPath('data.tombstoned', true);

        // Public read returns 410 Gone!
        $resGone = $this->http('GET', '/gallery/published');
        $resGone->assertStatus(410);
        $resGone->assertJsonPath('error.code', 'unpublished');

        // Restore prior revision 1 (curRev 3 -> 4)
        $resRestore = $this->http('POST', '/gallery/editorial/restore', $admin, [
            'expectedRevision' => 3,
            'targetRevision' => 1,
        ]);
        $resRestore->assertStatus(200);
        $resRestore->assertJsonPath('data.status', 'published');
        $resRestore->assertJsonPath('data.tombstoned', false);
        $resRestore->assertJsonPath('data.publishedRevision', 2); // new content revision 2 restored from 1

        // Public read now returns 200 again!
        $resPublic = $this->http('GET', '/gallery/published');
        $resPublic->assertStatus(200);
        $resPublic->assertJsonPath('data.status', 'published');

        // Attempt restore of non-existent revision -> 422
        $this->http('POST', '/gallery/editorial/restore', $admin, [
            'expectedRevision' => 4,
            'targetRevision' => 999,
        ])->assertStatus(422);

        // Clean up
        $this->resetGalleryTables();
    }

    public function test_database_immutability_trigger_enforced(): void
    {
        $admin = $this->staff('admin');

        $this->http('PUT', '/gallery/editorial/draft', $admin, [
            'expectedRevision' => 0,
            'payload' => $this->validPayload(),
        ])->assertStatus(200);

        $this->http('POST', '/gallery/editorial/publish', $admin, [
            'expectedRevision' => 1,
        ])->assertStatus(200);

        // Attempt UPDATE on gallery_revisions
        $caughtRevisionUpdate = false;
        try {
            DB::table('gallery_revisions')->where('revision', 1)->update(['snapshot_bytes' => 'corrupted']);
        } catch (\Throwable $e) {
            $caughtRevisionUpdate = str_contains($e->getMessage(), 'Gallery history is append only');
        }
        $this->assertTrue($caughtRevisionUpdate, 'Updating gallery_revisions must trigger immutability exception');

        // Attempt DELETE on gallery_revisions
        $caughtRevisionDelete = false;
        try {
            DB::table('gallery_revisions')->where('revision', 1)->delete();
        } catch (\Throwable $e) {
            $caughtRevisionDelete = str_contains($e->getMessage(), 'Gallery history is append only');
        }
        $this->assertTrue($caughtRevisionDelete, 'Deleting from gallery_revisions must trigger immutability exception');

        // Attempt UPDATE on gallery_published_revisions
        $caughtPublishedUpdate = false;
        try {
            DB::table('gallery_published_revisions')->where('revision', 1)->update(['staff_id' => Str::uuid()]);
        } catch (\Throwable $e) {
            $caughtPublishedUpdate = str_contains($e->getMessage(), 'Gallery history is append only');
        }
        $this->assertTrue($caughtPublishedUpdate, 'Updating gallery_published_revisions must trigger immutability exception');

        // Attempt DELETE on gallery_published_revisions
        $caughtPublishedDelete = false;
        try {
            DB::table('gallery_published_revisions')->where('revision', 1)->delete();
        } catch (\Throwable $e) {
            $caughtPublishedDelete = str_contains($e->getMessage(), 'Gallery history is append only');
        }
        $this->assertTrue($caughtPublishedDelete, 'Deleting from gallery_published_revisions must trigger immutability exception');

        // Attempt UPDATE on gallery_audit_events
        $caughtAuditUpdate = false;
        try {
            DB::table('gallery_audit_events')->update(['outcome' => 'tampered']);
        } catch (\Throwable $e) {
            $caughtAuditUpdate = str_contains($e->getMessage(), 'Gallery history is append only');
        }
        $this->assertTrue($caughtAuditUpdate, 'Updating gallery_audit_events must trigger immutability exception');

        // Attempt DELETE on gallery_audit_events
        $caughtAuditDelete = false;
        try {
            DB::table('gallery_audit_events')->delete();
        } catch (\Throwable $e) {
            $caughtAuditDelete = str_contains($e->getMessage(), 'Gallery history is append only');
        }
        $this->assertTrue($caughtAuditDelete, 'Deleting from gallery_audit_events must trigger immutability exception');

        // Clean up via helper bypassing trigger for test cleanup
        $this->resetGalleryTables();
    }

    public function test_contract_captures_for_gate(): void
    {
        $admin = $this->staff('admin');
        $operations = [
            ['GET', '/gallery/published', 'getGalleryPublished', [], null],
            ['GET', '/gallery/editorial', 'getGalleryEditorial', $admin, null],
            ['PUT', '/gallery/editorial/draft', 'putGalleryDraft', $admin, ['expectedRevision' => 0, 'payload' => $this->validPayload()]],
            ['POST', '/gallery/editorial/discard', 'postGalleryDiscard', $admin, ['expectedRevision' => 0]],
            ['POST', '/gallery/editorial/publish', 'postGalleryPublish', $admin, ['expectedRevision' => 0]],
            ['POST', '/gallery/editorial/unpublish', 'postGalleryUnpublish', $admin, ['expectedRevision' => 0]],
            ['POST', '/gallery/editorial/restore', 'postGalleryRestore', $admin, ['expectedRevision' => 0, 'targetRevision' => 1]],
        ];

        // 1. Capture 400 Bad Request
        $giantPayload = str_repeat('a', 270000);
        $this->http('PUT', '/gallery/editorial/draft', $admin, null, [], $giantPayload, 'putGalleryDraft')->assertStatus(400);
        $this->http('POST', '/gallery/editorial/discard', $admin, null, [], $giantPayload, 'postGalleryDiscard')->assertStatus(400);
        $this->http('POST', '/gallery/editorial/publish', $admin, null, [], $giantPayload, 'postGalleryPublish')->assertStatus(400);
        $this->http('POST', '/gallery/editorial/unpublish', $admin, null, [], $giantPayload, 'postGalleryUnpublish')->assertStatus(400);
        $this->http('POST', '/gallery/editorial/restore', $admin, null, [], $giantPayload, 'postGalleryRestore')->assertStatus(400);

        // Header exceeding 8192 for GET operations
        $this->http('GET', '/gallery/published', [], null, ['HTTP_X_BAD' => str_repeat('x', 65536)], null, 'getGalleryPublished')->assertStatus(400);
        $this->http('GET', '/gallery/editorial', $admin, null, ['HTTP_X_BAD' => str_repeat('x', 65536)], null, 'getGalleryEditorial')->assertStatus(400);

        // 2. Capture 401 Unauthorized for staff endpoints
        $this->http('GET', '/gallery/editorial', [], null, [], null, 'getGalleryEditorial')->assertStatus(401);
        $this->http('PUT', '/gallery/editorial/draft', [], ['expectedRevision' => 0, 'payload' => $this->validPayload()], [], null, 'putGalleryDraft')->assertStatus(401);
        $this->http('POST', '/gallery/editorial/discard', [], ['expectedRevision' => 0], [], null, 'postGalleryDiscard')->assertStatus(401);
        $this->http('POST', '/gallery/editorial/publish', [], ['expectedRevision' => 0], [], null, 'postGalleryPublish')->assertStatus(401);
        $this->http('POST', '/gallery/editorial/unpublish', [], ['expectedRevision' => 0], [], null, 'postGalleryUnpublish')->assertStatus(401);
        $this->http('POST', '/gallery/editorial/restore', [], ['expectedRevision' => 0, 'targetRevision' => 1], [], null, 'postGalleryRestore')->assertStatus(401);

        // 3. Capture 403 Forbidden
        $this->http('GET', '/gallery/editorial', $admin, null, ['HTTPS' => 'off'])->assertStatus(403);
        $viewer = $this->staff('viewer');
        $this->http('PUT', '/gallery/editorial/draft', $viewer, ['expectedRevision' => 0, 'payload' => $this->validPayload()], [], null, 'putGalleryDraft')->assertStatus(403);
        $this->http('POST', '/gallery/editorial/discard', $viewer, ['expectedRevision' => 0], [], null, 'postGalleryDiscard')->assertStatus(403);
        $this->http('POST', '/gallery/editorial/publish', $viewer, ['expectedRevision' => 0], [], null, 'postGalleryPublish')->assertStatus(403);
        $this->http('POST', '/gallery/editorial/unpublish', $viewer, ['expectedRevision' => 0], [], null, 'postGalleryUnpublish')->assertStatus(403);
        $this->http('POST', '/gallery/editorial/restore', $viewer, ['expectedRevision' => 0, 'targetRevision' => 1], [], null, 'postGalleryRestore')->assertStatus(403);

        // 4. Capture 404 Not Found
        $this->http('GET', '/gallery/published', [], null, [], null, 'getGalleryPublished')->assertStatus(404);
        $this->http('GET', '/gallery/editorial', $admin, null, [], null, 'getGalleryEditorial')->assertStatus(404);
        $this->http('POST', '/gallery/editorial/discard', $admin, ['expectedRevision' => 1], [], null, 'postGalleryDiscard')->assertStatus(404);
        $this->http('POST', '/gallery/editorial/publish', $admin, ['expectedRevision' => 1], [], null, 'postGalleryPublish')->assertStatus(404);
        $this->http('POST', '/gallery/editorial/unpublish', $admin, ['expectedRevision' => 1], [], null, 'postGalleryUnpublish')->assertStatus(404);
        $this->http('POST', '/gallery/editorial/restore', $admin, ['expectedRevision' => 1, 'targetRevision' => 1], [], null, 'postGalleryRestore')->assertStatus(404);

        // 5. Capture 422 Validation Error
        $this->http('PUT', '/gallery/editorial/draft', $admin, ['expectedRevision' => -5, 'payload' => $this->validPayload()], [], null, 'putGalleryDraft')->assertStatus(422);
        $this->http('POST', '/gallery/editorial/discard', $admin, ['expectedRevision' => 'invalid'], [], null, 'postGalleryDiscard')->assertStatus(422);
        $this->http('POST', '/gallery/editorial/publish', $admin, ['expectedRevision' => 'invalid'], [], null, 'postGalleryPublish')->assertStatus(422);
        $this->http('POST', '/gallery/editorial/unpublish', $admin, ['expectedRevision' => 'invalid'], [], null, 'postGalleryUnpublish')->assertStatus(422);
        $this->http('POST', '/gallery/editorial/restore', $admin, ['expectedRevision' => 0, 'targetRevision' => 'invalid'], [], null, 'postGalleryRestore')->assertStatus(422);

        // 6. Capture 200 Success + 409 Conflict + 410 Gone
        $this->http('PUT', '/gallery/editorial/draft', $admin, ['expectedRevision' => 0, 'payload' => $this->validPayload()], [], null, 'putGalleryDraft')->assertStatus(200);
        $this->http('GET', '/gallery/editorial', $admin, null, [], null, 'getGalleryEditorial')->assertStatus(200);
        $this->http('PUT', '/gallery/editorial/draft', $admin, ['expectedRevision' => 99, 'payload' => $this->validPayload()], [], null, 'putGalleryDraft')->assertStatus(409);

        $this->http('POST', '/gallery/editorial/publish', $admin, ['expectedRevision' => 99], [], null, 'postGalleryPublish')->assertStatus(409);
        $this->http('POST', '/gallery/editorial/publish', $admin, ['expectedRevision' => 1], [], null, 'postGalleryPublish')->assertStatus(200);
        $this->http('GET', '/gallery/published', [], null, [], null, 'getGalleryPublished')->assertStatus(200);

        // Discard 409
        $this->http('POST', '/gallery/editorial/discard', $admin, ['expectedRevision' => 99], [], null, 'postGalleryDiscard')->assertStatus(409);
        // Save draft to discard
        $draftToDiscardPayload = $this->validPayload();
        $draftToDiscardPayload['items'][0]['title']['en'] = 'Modified For Discard';
        $this->http('PUT', '/gallery/editorial/draft', $admin, ['expectedRevision' => 2, 'payload' => $draftToDiscardPayload], [], null, 'putGalleryDraft')->assertStatus(200);
        $this->http('POST', '/gallery/editorial/discard', $admin, ['expectedRevision' => 3], [], null, 'postGalleryDiscard')->assertStatus(200);

        // Unpublish 409 & 200
        $this->http('POST', '/gallery/editorial/unpublish', $admin, ['expectedRevision' => 99], [], null, 'postGalleryUnpublish')->assertStatus(409);
        $this->http('POST', '/gallery/editorial/unpublish', $admin, ['expectedRevision' => 4], [], null, 'postGalleryUnpublish')->assertStatus(200);
        $this->http('GET', '/gallery/published', [], null, [], null, 'getGalleryPublished')->assertStatus(410);

        // Restore 409 & 200
        $this->http('POST', '/gallery/editorial/restore', $admin, ['expectedRevision' => 99, 'targetRevision' => 1], [], null, 'postGalleryRestore')->assertStatus(409);
        $this->http('POST', '/gallery/editorial/restore', $admin, ['expectedRevision' => 5, 'targetRevision' => 1], [], null, 'postGalleryRestore')->assertStatus(200);

        // Corruption is a hard failure, never the never-published 404 fallback.
        foreach (['digest', 'schema'] as $fault) {
            DB::beginTransaction();
            try {
                DB::statement('ALTER TABLE gallery_revisions DISABLE TRIGGER USER');
                // Restore creates a new immutable content revision; use the actual published pointer.
                $revision = DB::table('gallery_documents')->where('slug', 'default')->value('published_revision');
                $row = DB::table('gallery_revisions')->where('slug', 'default')->where('revision', $revision)->first();
                $payload = json_decode($row->snapshot_bytes, true, 32, JSON_THROW_ON_ERROR);
                $payload['private-sentinel'] = 'CORRUPTION-SECRET-DO-NOT-LEAK';
                $bytes = json_encode($payload, JSON_THROW_ON_ERROR);
                DB::table('gallery_revisions')->where('slug', 'default')->where('revision', $revision)->update([
                    'snapshot_json' => $bytes, 'snapshot_bytes' => $bytes,
                    'snapshot_hash' => $fault === 'digest' ? str_repeat('0', 64) : hash('sha256', $bytes),
                ]);
                $response = $this->http('GET', '/gallery/published');
                $response->assertStatus(500)->assertJsonPath('error.message', 'Published gallery snapshot integrity failure.');
                $this->assertStringNotContainsString('CORRUPTION-SECRET', $response->getContent());
            } finally {
                // PostgreSQL rolls back the temporary trigger change and corrupted row together.
                DB::rollBack();
            }
        }

        // 7. Capture 503 Service Unavailable across all 7 operations
        DB::statement('ALTER TABLE cache RENAME TO gallery_test_unavailable_cache');
        try {
            foreach ($operations as [$method, $path, $op, $sess, $b]) {
                $this->http(strtoupper($method), $path, $sess, $b ?? null, [], null, $op)
                    ->assertStatus(503);
            }
        } finally {
            DB::statement('ALTER TABLE gallery_test_unavailable_cache RENAME TO cache');
        }

        // 8. Capture 429 Too Many Requests across all 7 operations
        RateLimiter::for('api', static fn($request) =>
            \Illuminate\Cache\RateLimiting\Limit::perMinute(1)->by('gallery:' . $request->ip()));

        foreach ($operations as [$method, $path, $op, $sess, $b]) {
            $headers = ['REMOTE_ADDR' => '2001:db8:' . bin2hex(random_bytes(2)) . '::5'];
            $this->http(strtoupper($method), $path, $sess, $b ?? null, $headers, null, $op);
            $this->http(strtoupper($method), $path, $sess, $b ?? null, $headers, null, $op)
                ->assertStatus(429)
                ->assertHeader('Retry-After');
        }

        // Cleanup
        $this->resetGalleryTables();
    }
}
