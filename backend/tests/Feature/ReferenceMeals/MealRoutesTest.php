<?php

declare(strict_types=1);

namespace Tests\Feature\ReferenceMeals;

use App\Identity\Mfa\TotpSecret;
use App\Identity\Passenger\Profile\MealCatalogInterface;
use App\Identity\Passenger\Profile\PassengerProfileCoordinator;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Sessions\StaffSessionStore;
use App\Reference\Meals\PgMealCatalog;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class MealRoutesTest extends TestCase
{
    private static ?string $hash = null;

    private function staff(string $role = 'admin'): array
    {
        $id = (string) Str::uuid();
        self::$hash ??= app(Argon2idPasswordHasher::class)->hash('Synthetic-meal-password-2026', 'staff');
        DB::table('staff_users')->insert([
            'id' => $id,
            'username' => 'meal-'.$id,
            'email' => $id.'@example.invalid',
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
        $receipt = app(StaffSessionStore::class)->issueFull($id, 1, 1, new \DateTimeImmutable('-1 second'));
        return [
            'owner' => $id,
            'id' => $receipt->sessionId,
            'cookie' => $receipt->getRawToken(),
            'csrf' => $receipt->getCsrfToken(),
        ];
    }

    private function passenger(): array
    {
        $id = (string) Str::uuid();
        self::$hash ??= app(Argon2idPasswordHasher::class)->hash('Synthetic-meal-password-2026', 'passenger');
        DB::table('users')->insert([
            'id' => $id,
            'email' => 'passenger-'.$id.'@example.invalid',
            'password_hash' => self::$hash,
            'status' => 'active',
            'credential_epoch' => 1,
            'email_verified_at' => DB::raw('clock_timestamp()'),
            'created_at' => DB::raw('clock_timestamp()'),
            'updated_at' => DB::raw('clock_timestamp()'),
        ]);
        DB::table('passenger_profiles')->insert([
            'user_id' => $id,
            'first_name' => 'Synthetic',
            'last_name' => 'Passenger',
            'phone' => '+970599000000',
            'seat_preference' => 'window',
            'meal_preference' => 'standard',
            'newsletter' => true,
            'created_at' => DB::raw('clock_timestamp()'),
            'updated_at' => DB::raw('clock_timestamp()'),
        ]);
        $receipt = app(PassengerSessionStore::class)->issueFull($id, 1);
        return [
            'owner' => $id,
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
        ?string $raw = null
    ): TestResponse {
        $this->flushHeaders();
        $server = [
            'HTTPS' => 'on',
            'SERVER_PORT' => 443,
            'HTTP_HOST' => '127.0.0.1:18090',
            'HTTP_ORIGIN' => 'https://127.0.0.1:5173',
            'HTTP_ACCEPT' => 'application/json',
            'CONTENT_TYPE' => 'application/json',
            'HTTP_COOKIE' => isset($session['cookie']) ? 'gza_staff_session='.$session['cookie'] : '',
            'HTTP_X_CSRF_TOKEN' => $session['csrf'] ?? '',
            'REMOTE_ADDR' => '2001:db8:'.bin2hex(random_bytes(2)).'::9',
        ];
        $response = $this->call(
            $method,
            'https://'.($headers['HTTP_HOST'] ?? '127.0.0.1:18090').'/api/v1'.$path,
            [],
            [],
            [],
            array_replace($server, $headers),
            $raw ?? ($body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR))
        );

        $operation = match ($method) {
            'POST' => 'postAdminMeal',
            'PATCH' => 'patchAdminMeal',
            'PUT' => str_contains($path, 'default') ? 'putAdminMealsDefault' : 'putAdminMealsOrder',
            default => str_contains($path, '/admin/') ? 'getAdminMeals' : 'getMeals',
        };

        if ($operation !== null && getenv('REFERENCE_GATE_OWNED') === '1') {
            $file = '/tmp/reference-captures.json';
            $captures = is_file($file) ? json_decode(file_get_contents($file), true, 32, JSON_THROW_ON_ERROR) : [];
            $captures[$operation.':'.$response->status()] ??= [
                'operationId' => $operation,
                'status' => $response->status(),
                'contentType' => $response->headers->get('Content-Type'),
                'payload' => $response->json(),
            ];
            file_put_contents($file, json_encode($captures, JSON_THROW_ON_ERROR), LOCK_EX);
        }

        return $response;
    }

    private function input(?string $id = null, bool $active = true, ?int $order = null): array
    {
        $id = $id ?? 'meal-'.strtolower(bin2hex(random_bytes(3)));
        $data = [
            'id' => $id,
            'label' => [
                'en' => 'Synthetic Meal '.$id,
                'ar' => 'وجبة تجريبية '.$id,
            ],
            'active' => $active,
        ];
        if ($order !== null) {
            $data['order'] = $order;
        }
        return $data;
    }

    public function test_reviewed_commands_are_closed_flat_objects_without_aliases(): void
    {
        $staff = $this->staff();
        $meal = $this->input('meal-command-boundary');
        $this->http('POST', '/admin/meals', $staff, $meal)->assertStatus(201);
        $before = app(\App\Reference\Meals\MealCoordinator::class)->adminSnapshot();
        $audits = DB::table('meal_audit_events')->count();
        foreach ([
            ['meal' => $this->input('wrapped-meal'), 'priceMinor' => 1000],
            ['option' => $this->input('wrapped-option'), 'ownerApproved' => true],
            ['meal' => $this->input('contradictory'), 'option' => $this->input('other')],
            ['meal' => $this->input('wrapper-only')],
        ] as $body) { $this->http('POST', '/admin/meals', $staff, $body)->assertStatus(422); }
        $this->http('PATCH', '/admin/meals/meal-command-boundary', $staff, ['option' => ['active' => false]])->assertStatus(422);
        foreach ([
            ['id' => $meal['id'], 'priceMinor' => 1],
            ['defaultMealId' => $meal['id']],
            ['id' => $meal['id'], 'defaultMealId' => 'contradictory'],
        ] as $body) { $this->http('PUT', '/admin/meals/default', $staff, $body)->assertStatus(422); }
        foreach ([
            ['ids' => [$meal['id']], 'unexpected' => true],
            [$meal['id']],
            ['ids' => (object) ['0' => $meal['id']]],
            ['ids' => ['named' => $meal['id']]],
        ] as $body) { $this->http('PUT', '/admin/meals/order', $staff, $body)->assertStatus(422); }
        $this->assertSame($before, app(\App\Reference\Meals\MealCoordinator::class)->adminSnapshot());
        $this->assertSame($audits, DB::table('meal_audit_events')->count());
        $this->http('PUT', '/admin/meals/default', $staff, ['id' => $meal['id']])->assertOk()->assertJsonPath('data.changed', false);
        $this->http('PUT', '/admin/meals/order', $staff, ['ids' => [$meal['id']]])->assertOk()->assertJsonPath('data.changed', false);
    }

    public function test_expand_only_migration_roundtrip_preserves_identity(): void
    {
        $staff = $this->staff();
        $this->assertSame(0, DB::table('meal_options')->count());
        $this->assertSame(0, Artisan::call('migrate:rollback', ['--step' => DB::table('migrations')->where('migration', '>=', '2026_10_11_000004_create_meal_reference_tables')->count(), '--force' => true]));
        $this->assertFalse(Schema::hasTable('meal_options'));
        $this->assertTrue(DB::table('staff_users')->where('id', $staff['owner'])->exists());
        $this->assertSame(0, Artisan::call('migrate', ['--force' => true]));
        $this->assertSame(0, DB::table('meal_options')->count());
        $this->assertSame(0, (int) DB::table('meal_revision_control')->where('domain', 'meals')->value('revision'));
        $this->assertNull(DB::table('meal_revision_control')->where('domain', 'meals')->value('default_meal_id'));
    }

    public function test_empty_public_snapshot_and_admin_snapshot(): void
    {
        $staff = $this->staff();
        $this->http('GET', '/meals')
            ->assertOk()
            ->assertJsonPath('data.revision', 0)
            ->assertJsonPath('data.meals', [])
            ->assertJsonPath('data.defaultMealId', null);

        $this->http('GET', '/admin/meals', $staff)
            ->assertOk()
            ->assertJsonPath('data.revision', 0)
            ->assertJsonPath('data.meals', [])
            ->assertJsonPath('data.defaultMealId', null);
    }

    public function test_create_first_active_meal_establishes_default_and_revision_receipt(): void
    {
        $staff = $this->staff();
        $mealA = $this->input('meal-standard', true, 0);

        $res = $this->http('POST', '/admin/meals', $staff, $mealA);
        $res->assertStatus(201)
            ->assertJsonPath('data.changed', true)
            ->assertJsonPath('data.result.id', 'meal-standard')
            ->assertJsonPath('data.result.active', true)
            ->assertJsonPath('data.result.order', 0);

        $this->assertSame('meal-standard', DB::table('meal_revision_control')->where('domain', 'meals')->value('default_meal_id'));
        $this->assertSame(1, (int) DB::table('meal_revision_control')->where('domain', 'meals')->value('revision'));

        $this->http('GET', '/meals')
            ->assertOk()
            ->assertJsonPath('data.revision', 1)
            ->assertJsonPath('data.defaultMealId', 'meal-standard')
            ->assertJsonCount(1, 'data.meals');

        $this->http('GET', '/admin/meals', $staff)
            ->assertOk()
            ->assertJsonPath('data.revision', 1)
            ->assertJsonPath('data.defaultMealId', 'meal-standard')
            ->assertJsonCount(1, 'data.meals');
    }

    public function test_create_inactive_meal_and_public_active_vs_admin_full(): void
    {
        $staff = $this->staff();
        $mealB = $this->input('meal-vegetarian', false, 1);

        $this->http('POST', '/admin/meals', $staff, $mealB)->assertStatus(201);

        // Public active-only snapshot contains only meal-standard
        $public = $this->http('GET', '/meals')->assertOk();
        $public->assertJsonCount(1, 'data.meals');
        $public->assertJsonPath('data.meals.0.id', 'meal-standard');
        $public->assertJsonPath('data.defaultMealId', 'meal-standard');

        // Admin full snapshot contains both
        $admin = $this->http('GET', '/admin/meals', $staff)->assertOk();
        $admin->assertJsonCount(2, 'data.meals');
        $admin->assertJsonPath('data.meals.0.id', 'meal-standard');
        $admin->assertJsonPath('data.meals.1.id', 'meal-vegetarian');
    }

    public function test_patch_meal_and_no_op_no_revision(): void
    {
        $staff = $this->staff();
        $meal = $this->input('meal-patch-subject', true, 2);
        $this->http('POST', '/admin/meals', $staff, $meal)->assertStatus(201);

        $revision = (int) DB::table('meal_revision_control')->where('domain', 'meals')->value('revision');

        // Genuine patch
        $res = $this->http('PATCH', '/admin/meals/meal-patch-subject', $staff, [
            'label' => [
                'en' => 'Updated Subject Meal',
                'ar' => 'وجبة معدلة',
            ],
        ]);
        $res->assertOk()
            ->assertJsonPath('data.changed', true)
            ->assertJsonPath('data.result.label.en', 'Updated Subject Meal');

        $newRevision = (int) DB::table('meal_revision_control')->where('domain', 'meals')->value('revision');
        $this->assertSame($revision + 1, $newRevision);

        // No-op patch
        $noop = $this->http('PATCH', '/admin/meals/meal-patch-subject', $staff, [
            'label' => [
                'en' => 'Updated Subject Meal',
                'ar' => 'وجبة معدلة',
            ],
        ]);
        $noop->assertOk()->assertJsonPath('data.changed', false);

        // Revision must not increment
        $this->assertSame($newRevision, (int) DB::table('meal_revision_control')->where('domain', 'meals')->value('revision'));
    }

    public function test_set_default_meal_and_no_op_no_revision(): void
    {
        $staff = $this->staff();
        $meal = $this->input('meal-def-target', true, 3);
        $this->http('POST', '/admin/meals', $staff, $meal)->assertStatus(201);

        // Change default to meal-def-target
        $res = $this->http('PUT', '/admin/meals/default', $staff, ['id' => 'meal-def-target']);
        $res->assertOk()
            ->assertJsonPath('data.changed', true)
            ->assertJsonPath('data.result.defaultMealId', 'meal-def-target');

        $revision = (int) DB::table('meal_revision_control')->where('domain', 'meals')->value('revision');

        // No-op set default
        $noop = $this->http('PUT', '/admin/meals/default', $staff, ['id' => 'meal-def-target']);
        $noop->assertOk()
            ->assertJsonPath('data.changed', false)
            ->assertJsonPath('data.result.defaultMealId', 'meal-def-target');

        $this->assertSame($revision, (int) DB::table('meal_revision_control')->where('domain', 'meals')->value('revision'));
    }

    public function test_current_default_cannot_retire_until_another_active_default_selected(): void
    {
        $staff = $this->staff();

        // Current default is meal-def-target. Attempt to retire it must fail 422
        $this->http('PATCH', '/admin/meals/meal-def-target', $staff, ['active' => false])->assertStatus(422);

        // Switch default back to meal-standard (which is active)
        $this->http('PUT', '/admin/meals/default', $staff, ['id' => 'meal-standard'])->assertOk();

        // Now meal-def-target can retire
        $this->http('PATCH', '/admin/meals/meal-def-target', $staff, ['active' => false])->assertOk();
        $this->assertFalse(DB::table('meal_options')->where('id', 'meal-def-target')->value('active'));

        // Inactive meal cannot be set as default
        $this->http('PUT', '/admin/meals/default', $staff, ['id' => 'meal-def-target'])->assertStatus(422);
    }

    public function test_reorder_meals_full_permutation_and_no_op_no_revision(): void
    {
        $staff = $this->staff();

        // Fetch current meal permutation
        $existing = DB::table('meal_options')
            ->orderBy('order_num', 'asc')
            ->orderBy('id', 'asc')
            ->pluck('id')
            ->all();

        $this->assertGreaterThanOrEqual(2, count($existing));

        // Valid reversed permutation
        $reversed = array_reverse($existing);
        $res = $this->http('PUT', '/admin/meals/order', $staff, ['ids' => $reversed]);
        $res->assertOk()
            ->assertJsonPath('data.changed', true)
            ->assertJsonPath('data.result.meals.0.id', $reversed[0]);

        $revision = (int) DB::table('meal_revision_control')->where('domain', 'meals')->value('revision');

        // No-op reorder
        $noop = $this->http('PUT', '/admin/meals/order', $staff, ['ids' => $reversed]);
        $noop->assertOk()->assertJsonPath('data.changed', false);
        $this->assertSame($revision, (int) DB::table('meal_revision_control')->where('domain', 'meals')->value('revision'));

        // Invalid permutations: missing, duplicate, unknown
        $this->http('PUT', '/admin/meals/order', $staff, ['ids' => [$reversed[0]]])->assertStatus(422);
        $this->http('PUT', '/admin/meals/order', $staff, ['ids' => array_fill(0, count($reversed), $reversed[0])])->assertStatus(422);
        $this->http('PUT', '/admin/meals/order', $staff, ['ids' => array_merge(array_slice($reversed, 1), ['meal-unknown'])])->assertStatus(422);
        $this->http('PUT', '/admin/meals/order', $staff, ['ids' => []])->assertStatus(422);
    }

    public function test_immutable_ids_and_rejected_monetary_extra_fields(): void
    {
        $staff = $this->staff();
        $input = $this->input('meal-valid-extra', true, 99);

        // Reject monetary and fabricated fields on create
        $this->http('POST', '/admin/meals', $staff, $input + ['price' => 15])->assertStatus(422);
        $this->http('POST', '/admin/meals', $staff, $input + ['currency' => 'USD'])->assertStatus(422);
        $this->http('POST', '/admin/meals', $staff, $input + ['category' => 'meal'])->assertStatus(422);
        $this->http('POST', '/admin/meals', $staff, $input + ['priceMinor' => 1500])->assertStatus(422);
        $this->http('POST', '/admin/meals', $staff, $input + ['extra' => 'forbidden'])->assertStatus(422);

        // Valid create
        $this->http('POST', '/admin/meals', $staff, $input)->assertStatus(201);

        // Reject immutable ID on patch
        $this->http('PATCH', '/admin/meals/meal-valid-extra', $staff, ['id' => 'meal-renamed'])->assertStatus(422);
        $this->http('PATCH', '/admin/meals/meal-valid-extra', $staff, ['price' => 20])->assertStatus(422);
        $this->http('PATCH', '/admin/meals/meal-valid-extra', $staff, ['category' => 'meal'])->assertStatus(422);
    }

    public function test_roles_csrf_origin_and_security_enforcement(): void
    {
        $admin = $this->staff('admin');
        $viewer = $this->staff('viewer');
        $editor = $this->staff('editor');
        $input = $this->input('meal-auth-test');

        // Unauthenticated
        $this->http('GET', '/meals')->assertOk(); // public
        $this->http('GET', '/admin/meals')->assertStatus(401);
        $this->http('POST', '/admin/meals', [], $input)->assertStatus(401);

        // Viewer: commercial.view allowed, commercial.edit forbidden
        $this->http('GET', '/admin/meals', $viewer)->assertOk();
        $this->http('POST', '/admin/meals', $viewer, $input)->assertStatus(403);

        // Editor: commercial.view forbidden, commercial.edit forbidden
        $this->http('GET', '/admin/meals', $editor)->assertStatus(403);
        $this->http('POST', '/admin/meals', $editor, $input)->assertStatus(403);

        // Admin: both allowed
        $this->http('GET', '/admin/meals', $admin)->assertOk();
        $this->http('POST', '/admin/meals', $admin, $input)->assertStatus(201);

        // Origin enforcement on writes
        $this->http('PATCH', '/admin/meals/meal-auth-test', $admin, ['active' => true], ['HTTP_ORIGIN' => 'https://attacker.invalid'])->assertStatus(403);
        $this->http('PATCH', '/admin/meals/meal-auth-test', $admin, ['active' => true], ['HTTP_ORIGIN' => ''])->assertStatus(403);

        // CSRF enforcement on writes
        $this->http('PATCH', '/admin/meals/meal-auth-test', $admin, ['active' => true], ['HTTP_X_CSRF_TOKEN' => ''])->assertStatus(403);
        $this->http('PATCH', '/admin/meals/meal-auth-test', $admin, ['active' => true], ['HTTP_X_CSRF_TOKEN' => 'wrong-csrf'])->assertStatus(403);

        // Suspended staff denied
        DB::table('staff_users')->where('id', $admin['owner'])->update(['status' => 'suspended']);
        $this->http('GET', '/admin/meals', $admin)->assertStatus(401);

        // Stale credential epoch denied
        $freshAdmin = $this->staff('admin');
        DB::table('staff_users')->where('id', $freshAdmin['owner'])->update(['credential_epoch' => 2]);
        $this->http('GET', '/admin/meals', $freshAdmin)->assertStatus(401);
    }

    public function test_concurrent_create_same_id_has_one_winner(): void
    {
        $one = $this->staff();
        $two = $this->staff();
        $input = $this->input('meal-concurrent-id');

        $statuses = $this->race([
            ['method' => 'POST', 'path' => '/admin/meals', 'session' => $one, 'body' => $input],
            ['method' => 'POST', 'path' => '/admin/meals', 'session' => $two, 'body' => $input],
        ]);

        sort($statuses);
        $this->assertSame([201, 409], $statuses);
        $this->assertSame(1, DB::table('meal_options')->where('id', 'meal-concurrent-id')->count());
    }

    public function test_direct_sql_integrity_constraints_cannot_be_bypassed(): void
    {
        $staff = $this->staff();
        $input = $this->input('meal-sql-test');
        $this->http('POST', '/admin/meals', $staff, $input)->assertStatus(201);

        // Target current default meal for retirement constraint test
        $currentDefault = (string) DB::table('meal_revision_control')->where('domain', 'meals')->value('default_meal_id');
        $this->assertNotEmpty($currentDefault);

        // Pre-insert an inactive meal to test that setting default_meal_id to inactive meal fails
        DB::table('meal_options')->insert([
            'id' => 'meal-sql-inactive',
            'label_en' => 'Inactive',
            'label_ar' => 'غير فعال',
            'active' => false,
            'order_num' => 99,
        ]);

        $sql = [
            // Cannot modify immutable meal ID
            ['UPDATE meal_options SET id = ? WHERE id = ?', ['changed-id', 'meal-sql-test']],
            // Cannot deactivate current default meal directly
            ['UPDATE meal_options SET active = FALSE WHERE id = ?', [$currentDefault]],
            // Cannot set default_meal_id to an inactive meal
            ['UPDATE meal_revision_control SET default_meal_id = ? WHERE domain = ?', ['meal-sql-inactive', 'meals']],
            // Cannot set default_meal_id to a nonexistent meal
            ['UPDATE meal_revision_control SET default_meal_id = ? WHERE domain = ?', ['meal-nonexistent', 'meals']],
            // Cannot insert unsafe ASCII ID
            ['INSERT INTO meal_options (id, label_en, label_ar, active, order_num) VALUES (?, ?, ?, TRUE, 98)', ['bad id with spaces', 'Bad', 'سيء']],
            // History append-only triggers
            ['UPDATE meal_revisions SET snapshot_hash = ?', [str_repeat('0', 64)]],
            ['DELETE FROM meal_revisions', []],
            ['TRUNCATE meal_revisions CASCADE', []],
            ['UPDATE meal_audit_events SET outcome = ?', ['success']],
            ['DELETE FROM meal_audit_events', []],
            ['TRUNCATE meal_audit_events', []],
        ];

        foreach ($sql as [$statement, $bindings]) {
            try {
                DB::transaction(fn() => DB::statement($statement, $bindings));
                $this->fail('Direct SQL constraint bypass committed: '.$statement);
            } catch (\Illuminate\Database\QueryException|\PDOException) {
                $this->assertTrue(true);
            }
        }
    }

    public function test_pg_meal_catalog_active_ids_and_passenger_integration(): void
    {
        $staff = $this->staff();
        $catalog = app(MealCatalogInterface::class);

        $this->assertInstanceOf(PgMealCatalog::class, $catalog);
        $this->assertTrue($catalog->isAvailable());

        $this->http('POST', '/admin/meals', $staff, $this->input('meal-alpha', true, 0))->assertStatus(201);
        $this->http('POST', '/admin/meals', $staff, $this->input('meal-beta', false, 1))->assertStatus(201);

        $activeIds = $catalog->getActiveMealIds();
        $this->assertContains('meal-alpha', $activeIds);
        $this->assertNotContains('meal-beta', $activeIds);

        // Passenger profile updates with active meal
        $passenger = $this->passenger();
        $coordinator = app(PassengerProfileCoordinator::class);
        $context = app(PassengerSessionStore::class)->read($passenger['cookie']);

        // Update with active meal: succeeds
        $req = \Illuminate\Http\Request::create('/api/v1/auth/passenger/profile', 'PUT', [], [], [], [
            'HTTPS' => 'on',
            'SERVER_PORT' => 443,
            'HTTP_HOST' => '127.0.0.1:18090',
            'HTTP_ORIGIN' => 'https://127.0.0.1:5173',
            'HTTP_COOKIE' => 'gza_session='.$passenger['cookie'],
            'HTTP_X_CSRF_TOKEN' => $passenger['csrf'],
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
        ], json_encode(['mealPreference' => 'meal-alpha'], JSON_THROW_ON_ERROR));
        $req->attributes->set('identity_session_context', $context);

        $result = $coordinator->updateProfile($req);
        $this->assertSame('meal-alpha', $result['account']['mealPreference']);

        // Update with inactive meal: fails with validation error
        $badReq = \Illuminate\Http\Request::create('/api/v1/auth/passenger/profile', 'PUT', [], [], [], [
            'HTTPS' => 'on',
            'SERVER_PORT' => 443,
            'HTTP_HOST' => '127.0.0.1:18090',
            'HTTP_ORIGIN' => 'https://127.0.0.1:5173',
            'HTTP_COOKIE' => 'gza_session='.$passenger['cookie'],
            'HTTP_X_CSRF_TOKEN' => $passenger['csrf'],
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
        ], json_encode(['mealPreference' => 'meal-beta'], JSON_THROW_ON_ERROR));
        $badReq->attributes->set('identity_session_context', $context);

        $this->expectException(\App\Identity\Passenger\Profile\Exceptions\ProfileValidationException::class);
        $coordinator->updateProfile($badReq);
    }

    public function test_passenger_profile_retired_meal_preference_survives_unrelated_update(): void
    {
        $staff = $this->staff();
        $passenger = $this->passenger();
        $coordinator = app(PassengerProfileCoordinator::class);
        $context = app(PassengerSessionStore::class)->read($passenger['cookie']);

        // Set up active meal A and active meal B
        $this->http('POST', '/admin/meals', $staff, $this->input('meal-cur', true, 0))->assertStatus(201);
        $this->http('POST', '/admin/meals', $staff, $this->input('meal-other', true, 1))->assertStatus(201);

        // Set passenger meal preference to meal-cur
        DB::table('passenger_profiles')->where('user_id', $passenger['owner'])->update([
            'meal_preference' => 'meal-cur',
        ]);

        // Change default to meal-other, then retire meal-cur
        $this->http('PUT', '/admin/meals/default', $staff, ['id' => 'meal-other'])->assertOk();
        $this->http('PATCH', '/admin/meals/meal-cur', $staff, ['active' => false])->assertOk();

        // Passenger performs unrelated profile update (phone only)
        $req = \Illuminate\Http\Request::create('/api/v1/auth/passenger/profile', 'PUT', [], [], [], [
            'HTTPS' => 'on',
            'SERVER_PORT' => 443,
            'HTTP_HOST' => '127.0.0.1:18090',
            'HTTP_ORIGIN' => 'https://127.0.0.1:5173',
            'HTTP_COOKIE' => 'gza_session='.$passenger['cookie'],
            'HTTP_X_CSRF_TOKEN' => $passenger['csrf'],
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
        ], json_encode(['phone' => '+970599111222'], JSON_THROW_ON_ERROR));
        $req->attributes->set('identity_session_context', $context);

        $result = $coordinator->updateProfile($req);
        // Retired meal survives untouched!
        $this->assertSame('meal-cur', $result['account']['mealPreference']);
        $this->assertSame('+970599111222', $result['account']['phone']);
    }

    public function test_all_meals_error_statuses_are_actual_canonical_http_responses(): void
    {
        $staff = $this->staff();
        $viewer = $this->staff('viewer');
        $input = $this->input('meal-canonical-error');
        $this->http('POST', '/admin/meals', $staff, $input)->assertStatus(201);

        $allMealIds = DB::table('meal_options')->orderBy('order_num')->pluck('id')->all();

        $cases = [
            ['GET', '/meals', null],
            ['GET', '/admin/meals', null],
            ['POST', '/admin/meals', $this->input('meal-fresh-cases')],
            ['PATCH', '/admin/meals/meal-canonical-error', ['order' => 10]],
            ['PUT', '/admin/meals/order', ['ids' => $allMealIds]],
            ['PUT', '/admin/meals/default', ['id' => 'meal-canonical-error']],
        ];

        foreach ($cases as [$method, $path, $body]) {
            // 400 on untrusted host
            $this->http($method, $path, $staff, $body, ['HTTP_HOST' => 'untrusted.invalid'])->assertStatus(400);

            // Origin / Auth checks
            if ($path === '/meals') {
                $this->http($method, $path, [], $body)->assertOk();
            } else {
                $this->http($method, $path, [], $body)->assertStatus(401);
                if ($method !== 'GET') {
                    $this->http($method, $path, $viewer, $body)->assertStatus(403);
                    $this->http($method, $path, $staff, ['unexpected' => true])->assertStatus(422);
                    $this->http($method, $path, $staff, null, [], '{')->assertStatus(422);
                    $this->http($method, $path, $staff, $body, ['CONTENT_TYPE' => 'text/plain'])->assertStatus(422);
                }
            }
        }

        // 409 conflict
        $this->http('POST', '/admin/meals', $staff, $input)->assertStatus(409);

        // 404 not found
        $this->http('PATCH', '/admin/meals/missing-meal', $staff, ['order' => 1])->assertStatus(404);
        $this->http('PUT', '/admin/meals/default', $staff, ['id' => 'missing-meal'])->assertStatus(404);

        // 503 service unavailable
        DB::statement('ALTER TABLE cache RENAME TO meals_test_unavailable_cache');
        try {
            foreach ($cases as [$method, $path, $body]) {
                $this->http($method, $path, $staff, $body)->assertStatus(503);
            }
        } finally {
            DB::statement('ALTER TABLE meals_test_unavailable_cache RENAME TO cache');
        }

        // 429 rate limit exceeded
        \Illuminate\Support\Facades\RateLimiter::for('reference', static fn($request) =>
            \Illuminate\Cache\RateLimiting\Limit::perMinute(1)->by('reference:'.$request->ip()));

        foreach ($cases as [$method, $path, $body]) {
            $headers = ['REMOTE_ADDR' => '2001:db8:'.bin2hex(random_bytes(2)).'::7'];
            $this->http($method, $path, $staff, $body, $headers);
            $this->http($method, $path, $staff, $body, $headers)->assertStatus(429)->assertHeader('Retry-After');
        }
    }

    public function test_snapshot_hashes_and_append_only_audit(): void
    {
        $staff = $this->staff();
        $this->http('POST', '/admin/meals', $staff, $this->input('meal-snap-1'))->assertStatus(201);
        $this->http('POST', '/admin/meals', $staff, $this->input('meal-snap-2'))->assertStatus(201);

        foreach (DB::table('meal_revisions')->get() as $row) {
            $this->assertSame(hash('sha256', $row->snapshot_bytes), $row->snapshot_hash);
            $this->assertEquals(json_decode($row->snapshot_bytes), json_decode($row->snapshot_json));
        }
    }

    public function test_expiry_while_waiting_for_domain_lock_cannot_commit_a_mutation(): void
    {
        $staff = $this->staff();
        $input = $this->input('meal-expire-wait');

        DB::table('staff_sessions')->where('id', $staff['id'])->update([
            'absolute_expires_at' => DB::raw("clock_timestamp() + interval '1500 milliseconds'"),
            'idle_expires_at' => DB::raw("clock_timestamp() + interval '1400 milliseconds'"),
        ]);

        $db = DB::connection();
        $db->beginTransaction();
        $process = null;
        $pipes = [];

        try {
            $db->table('meal_revision_control')->where('domain', 'meals')->lockForUpdate()->first();
            $process = proc_open(
                [PHP_BINARY, base_path('tests/Feature/ReferenceMeals/concurrency-worker.php')],
                [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
                $pipes,
                base_path()
            );

            if (!is_resource($process)) {
                throw new \RuntimeException('Worker unavailable.');
            }

            stream_set_blocking($pipes[1], false);
            stream_set_blocking($pipes[2], false);

            fwrite($pipes[0], json_encode([
                'method' => 'POST',
                'path' => '/admin/meals',
                'session' => $staff,
                'body' => $input,
            ], JSON_THROW_ON_ERROR)."\n");
            fflush($pipes[0]);

            $this->assertSame('READY', $this->line($process, $pipes[1]));
            fwrite($pipes[0], "GO\n");
            fflush($pipes[0]);

            $deadline = microtime(true) + 1;
            do {
                $db->select('SELECT pg_stat_clear_snapshot()');
                $waiting = (int) $db->selectOne("SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%meal_revision_control%'")->n;
                if ($waiting > 0) {
                    break;
                }
                usleep(10000);
            } while (microtime(true) < $deadline);

            $this->assertGreaterThan(0, $waiting, 'The request must reach locked aggregate before expiry.');
            usleep(1700000);
            $db->commit();

            $this->assertSame('401', $this->line($process, $pipes[1]));
            $this->assertFalse(DB::table('meal_options')->where('id', 'meal-expire-wait')->exists());
        } finally {
            if ($db->transactionLevel() > 0) {
                $db->rollBack();
            }
            foreach ($pipes as $pipe) {
                if (is_resource($pipe)) {
                    fclose($pipe);
                }
            }
            if (is_resource($process)) {
                $deadline = microtime(true) + 1;
                while (proc_get_status($process)['running'] && microtime(true) < $deadline) {
                    usleep(10000);
                }
                if (proc_get_status($process)['running']) {
                    proc_terminate($process, 9);
                }
                proc_close($process);
            }
        }
    }

    private function race(array $inputs): array
    {
        $children = [];
        try {
            foreach ($inputs as $input) {
                $pipes = [];
                $process = proc_open(
                    [PHP_BINARY, base_path('tests/Feature/ReferenceMeals/concurrency-worker.php')],
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
                fwrite($pipes[0], json_encode($input, JSON_THROW_ON_ERROR)."\n");
                fflush($pipes[0]);
            }
            foreach ($children as [$process, $pipes]) {
                $this->assertSame('READY', $this->line($process, $pipes[1]));
            }
            foreach ($children as [$process, $pipes]) {
                fwrite($pipes[0], "GO\n");
                fflush($pipes[0]);
            }
            $statuses = [];
            foreach ($children as [$process, $pipes]) {
                $statuses[] = (int) $this->line($process, $pipes[1]);
            }
            return $statuses;
        } finally {
            foreach ($children as [$process, $pipes]) {
                foreach ($pipes as $pipe) {
                    fclose($pipe);
                }
                $deadline = microtime(true) + 2;
                while (proc_get_status($process)['running'] && microtime(true) < $deadline) {
                    usleep(10000);
                }
                if (proc_get_status($process)['running']) {
                    proc_terminate($process, 9);
                }
                proc_close($process);
            }
        }
    }

    private function line($process, $pipe): string
    {
        $deadline = microtime(true) + 10;
        $buffer = '';
        do {
            $buffer .= fread($pipe, 4096) ?: '';
            if (strlen($buffer) > 4096) {
                throw new \RuntimeException('Worker output bound exceeded.');
            }
            if (str_contains($buffer, "\n")) {
                return trim(explode("\n", $buffer, 2)[0]);
            }
            if (!proc_get_status($process)['running']) {
                break;
            }
            usleep(10000);
        } while (microtime(true) < $deadline);
        throw new \RuntimeException('Worker deadline exceeded.');
    }
}
