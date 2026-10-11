<?php

declare(strict_types=1);

namespace Tests\Feature\ReferenceNetwork;

use App\Identity\Mfa\TotpSecret;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Sessions\StaffSessionStore;
use App\Reference\Network\NetworkCoordinator;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class NetworkRoutesTest extends TestCase
{
    private static ?string $hash = null;

    protected function setUp(): void
    {
        parent::setUp();
        if (Schema::hasTable('airports')) {
            Artisan::call('migrate:rollback', ['--step' => DB::table('migrations')->where('migration', '>=', '2026_10_11_000003_create_network_reference_tables')->count(), '--force' => true]);
            Artisan::call('migrate', ['--force' => true]);
        }
    }

    private function staff(string $role = 'admin'): array
    {
        $id = (string) Str::uuid();
        self::$hash ??= app(Argon2idPasswordHasher::class)->hash('Synthetic-network-password-2026', 'staff');
        DB::table('staff_users')->insert([
            'id' => $id,
            'username' => 'net-'.$id,
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

        $operation = match (true) {
            $method === 'POST' && str_starts_with($path, '/admin/network/airports') => 'postAdminAirport',
            $method === 'PATCH' && str_starts_with($path, '/admin/network/airports') => 'patchAdminAirport',
            $method === 'GET' && $path === '/network/airports' => 'getAirports',
            $method === 'GET' && $path === '/network/routes' => 'getNetworkRoutes',
            $method === 'GET' && $path === '/admin/network/airports' => 'getAdminAirports',
            default => null,
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

    private function sampleAirport(string $code = 'AMM'): array
    {
        return [
            'code' => $code,
            'airportName' => [
                'en' => 'Queen Alia International Airport',
                'ar' => 'مطار الملكة علياء الدولي',
            ],
            'city' => [
                'en' => 'Amman',
                'ar' => 'عمان',
            ],
            'country' => [
                'en' => 'Jordan',
                'ar' => 'الأردن',
            ],
            'timezone' => 'Asia/Amman',
            'blockMinutes' => 55,
            'active' => true,
        ];
    }

    public function test_expand_only_migration_roundtrip_preserves_identity(): void
    {
        $staff = $this->staff();
        $this->assertSame(0, DB::table('airports')->count());
        $this->assertSame(0, Artisan::call('migrate:rollback', ['--step' => DB::table('migrations')->where('migration', '>=', '2026_10_11_000003_create_network_reference_tables')->count(), '--force' => true]));
        $this->assertFalse(Schema::hasTable('airports'));
        $this->assertTrue(Schema::hasTable('aircraft'));
        $this->assertTrue(DB::table('staff_users')->where('id', $staff['owner'])->exists());
        $this->assertSame(0, Artisan::call('migrate', ['--force' => true]));
        $this->assertSame(0, DB::table('airports')->count());
    }

    public function test_production_starts_empty_and_rejects_unstaff_seeds(): void
    {
        $this->assertSame(0, DB::table('airports')->count());
        $this->assertSame(0, DB::table('network_revisions')->count());
        $this->assertSame(0, DB::table('network_audit_events')->count());
        $this->http('GET', '/network/airports')->assertOk()->assertJsonPath('data', []);
        $this->http('GET', '/network/routes')->assertOk()->assertJsonPath('data', []);
    }

    public function test_genuine_source_fixtures_and_actual_contracts(): void
    {
        $staff = $this->staff();
        $sourceFile = '/tmp/network-source.json';
        $this->assertTrue(is_file($sourceFile), 'Source fixture must exist at /tmp/network-source.json');
        $source = json_decode(file_get_contents($sourceFile), true, 32, JSON_THROW_ON_ERROR);

        // 1. Create base GZA airport
        $this->http('POST', '/admin/network/airports', $staff, $source['base'])
            ->assertStatus(201)
            ->assertJsonPath('data.code', 'GZA')
            ->assertJsonPath('data.active', true);

        // 2. Create all 7 accepted destination airports
        foreach ($source['destinations'] as $dest) {
            $this->http('POST', '/admin/network/airports', $staff, $dest)
                ->assertStatus(201)
                ->assertJsonPath('data.code', $dest['code'])
                ->assertJsonPath('data.blockMinutes', $dest['blockMinutes']);
        }

        // 3. Verify public reads return all 8 active airports
        $public = $this->http('GET', '/network/airports')->assertOk();
        $public->assertJsonCount(8, 'data');

        // Staff read returns all 8 airports (including inactive when present)
        $admin = $this->http('GET', '/admin/network/airports', $staff)->assertOk();
        $admin->assertJsonCount(8, 'data');

        // 4. Verify derived bidirectional routes: exactly 7 destinations * 2 directions = 14 routes
        $routes = $this->http('GET', '/network/routes')->assertOk();
        $routes->assertJsonCount(14, 'data');
        $routesData = $routes->json('data');
        $ammOut = array_values(array_filter($routesData, static fn($r) => $r['destinationCode'] === 'AMM' && $r['direction'] === 'out'))[0] ?? null;
        $this->assertNotNull($ammOut);
        $this->assertSame('GZA', $ammOut['originCode']);
        $this->assertSame('AMM', $ammOut['destinationCode']);
        $this->assertSame('out', $ammOut['direction']);
        $this->assertSame(55, $ammOut['blockMinutes']);

        $ammIn = array_values(array_filter($routesData, static fn($r) => $r['originCode'] === 'AMM' && $r['direction'] === 'in'))[0] ?? null;
        $this->assertNotNull($ammIn);
        $this->assertSame('AMM', $ammIn['originCode']);
        $this->assertSame('GZA', $ammIn['destinationCode']);
        $this->assertSame('in', $ammIn['direction']);
        $this->assertSame(55, $ammIn['blockMinutes']);

        // 5. Verify patch
        $this->http('PATCH', '/admin/network/airports/AMM', $staff, ['blockMinutes' => 60])
            ->assertOk()
            ->assertJsonPath('data.blockMinutes', 60);

        // 6. Verify revision and audit ledger counts: 1 (GZA) + 7 (destinations) + 1 (patch) = 9
        $this->assertSame(9, DB::table('network_revisions')->count());
        $this->assertSame(9, DB::table('network_audit_events')->count());
    }

    public function test_active_and_retirement_visibility(): void
    {
        $staff = $this->staff();
        $gza = [
            'code' => 'GZA',
            'airportName' => ['en' => 'Yasser Arafat International Airport', 'ar' => 'مطار ياسر عرفات الدولي'],
            'city' => ['en' => 'Gaza', 'ar' => 'غزة'],
            'country' => ['en' => 'State of Palestine', 'ar' => 'دولة فلسطين'],
            'timezone' => 'Asia/Gaza',
            'blockMinutes' => 20,
            'active' => true,
        ];
        $this->http('POST', '/admin/network/airports', $staff, $gza)->assertStatus(201);
        $this->http('POST', '/admin/network/airports', $staff, $this->sampleAirport('AMM'))->assertStatus(201);
        $cai = $this->sampleAirport('CAI');
        $cai['blockMinutes'] = 75;
        $cai['timezone'] = 'Africa/Cairo';
        $this->http('POST', '/admin/network/airports', $staff, $cai)->assertStatus(201);

        $this->http('GET', '/network/airports')->assertOk()->assertJsonCount(3, 'data');
        $this->http('GET', '/admin/network/airports', $staff)->assertOk()->assertJsonCount(3, 'data');
        $this->http('GET', '/network/routes')->assertOk()->assertJsonCount(4, 'data');
        $coord = app(NetworkCoordinator::class);
        $this->assertCount(3, $coord->airports(false));

        // Retire AMM
        $this->http('PATCH', '/admin/network/airports/AMM', $staff, ['active' => false])
            ->assertOk()
            ->assertJsonPath('data.active', false);

        // Public read excludes retired AMM
        $pub = $this->http('GET', '/network/airports')->assertOk();
        $pub->assertJsonCount(2, 'data');
        $codes = array_column($pub->json('data'), 'code');
        $this->assertNotContains('AMM', $codes);

        // Public routes excludes routes connecting to/from retired AMM (only CAI routes remain)
        $routes = $this->http('GET', '/network/routes')->assertOk();
        $routes->assertJsonCount(2, 'data');
        foreach ($routes->json('data') as $route) {
            $this->assertNotSame('AMM', $route['originCode']);
            $this->assertNotSame('AMM', $route['destinationCode']);
        }

        // Staff airport read still sees all 3 (including retired AMM)
        $admin = $this->http('GET', '/admin/network/airports', $staff)->assertOk();
        $admin->assertJsonCount(3, 'data');
        $this->assertCount(3, $coord->airports(false));

        // Reactivate AMM
        $this->http('PATCH', '/admin/network/airports/AMM', $staff, ['active' => true])
            ->assertOk()
            ->assertJsonPath('data.active', true);
        $this->http('GET', '/network/airports')->assertOk()->assertJsonCount(3, 'data');
        $this->http('GET', '/network/routes')->assertOk()->assertJsonCount(4, 'data');
    }

    public function test_no_op_patch_preserves_revision_and_snapshot_hash(): void
    {
        $staff = $this->staff();
        $this->http('POST', '/admin/network/airports', $staff, $this->sampleAirport('AMM'))->assertStatus(201);

        $revision = (int) DB::table('network_revision_control')->value('revision');
        $auditCount = DB::table('network_audit_events')->count();

        // Empty patch is a no-op
        $this->http('PATCH', '/admin/network/airports/AMM', $staff, (object) [])
            ->assertOk()
            ->assertJsonPath('data.code', 'AMM');

        // Identical patch is a no-op
        $this->http('PATCH', '/admin/network/airports/AMM', $staff, ['blockMinutes' => 55])
            ->assertOk()
            ->assertJsonPath('data.blockMinutes', 55);

        $this->assertSame($revision, (int) DB::table('network_revision_control')->value('revision'));
        $this->assertSame($auditCount, DB::table('network_audit_events')->count());

        foreach (DB::table('network_revisions')->get() as $row) {
            $this->assertSame(hash('sha256', $row->snapshot_bytes), $row->snapshot_hash);
            $this->assertEquals(json_decode($row->snapshot_bytes), json_decode($row->snapshot_json));
        }
    }

    public function test_wrong_realms_roles_csrf_origin_and_stale_authority_are_denied(): void
    {
        $input = $this->sampleAirport('AMM');
        $staff = $this->staff('admin');
        $viewer = $this->staff('viewer');
        $editor = $this->staff('editor');
        $before = DB::table('network_audit_events')->count();

        // Unauthenticated write -> 401
        $this->http('POST', '/admin/network/airports', [], $input)->assertStatus(401);

        // Viewer and editor writes -> 403 (need ops.edit)
        foreach ([$viewer, $editor] as $denied) {
            $this->http('POST', '/admin/network/airports', $denied, $input)->assertStatus(403);
            $this->http('PATCH', '/admin/network/airports/AMM', $denied, ['active' => false])->assertStatus(403);
        }


        // Origin checks on writes
        foreach (['', 'http://attacker.invalid'] as $origin) {
            $this->http('POST', '/admin/network/airports', $staff, $input, [
                'HTTP_ORIGIN' => $origin,
                'HTTP_SEC_FETCH_SITE' => 'same-origin',
            ])->assertStatus(403);
        }

        // CSRF check on writes
        $this->http('POST', '/admin/network/airports', $staff, $input, [
            'HTTP_X_CSRF_TOKEN' => '',
            'HTTP_SEC_FETCH_SITE' => 'same-origin',
        ])->assertStatus(403);

        // Wrong cookie names / malformed cookies -> 401
        $this->http('POST', '/admin/network/airports', $staff, $input, [
            'HTTP_COOKIE' => 'gza_session='.$staff['cookie'],
        ])->assertStatus(401);
        $this->http('POST', '/admin/network/airports', $staff, $input, [
            'HTTP_COOKIE' => 'gza_staff_pending='.$staff['cookie'],
        ])->assertStatus(401);

        // Stale credential epoch -> 401
        DB::table('staff_users')->where('id', $staff['owner'])->update(['credential_epoch' => 2]);
        $this->http('POST', '/admin/network/airports', $staff, $input)->assertStatus(401);

        $this->assertSame($before, DB::table('network_audit_events')->count());
    }

    public function test_revoked_expired_anonymous_and_unconfirmed_mfa_sessions_are_denied(): void
    {
        $input = $this->sampleAirport('AMM');
        foreach (['revoke', 'expire', 'mfa', 'suspend'] as $probe) {
            $staff = $this->staff('admin');
            match ($probe) {
                'revoke' => DB::table('staff_sessions')->where('id', $staff['id'])->update([
                    'revoked_at' => DB::raw('clock_timestamp()'),
                ]),
                'expire' => DB::table('staff_sessions')->where('id', $staff['id'])->update([
                    'absolute_expires_at' => DB::raw("statement_timestamp() - interval '1 second'"),
                    'idle_expires_at' => DB::raw("statement_timestamp() - interval '1 second'"),
                    'issued_at' => DB::raw("statement_timestamp() - interval '2 seconds'"),
                    'last_seen_at' => DB::raw("statement_timestamp() - interval '2 seconds'"),
                ]),
                'mfa' => DB::table('staff_mfa_credentials')->where('staff_id', $staff['owner'])->update([
                    'revoked_at' => DB::raw('clock_timestamp()'),
                ]),
                'suspend' => DB::table('staff_users')->where('id', $staff['owner'])->update([
                    'status' => 'suspended',
                ]),
            };
            $this->http('POST', '/admin/network/airports', $staff, $input)->assertStatus(401);
        }

        $anonymous = app(StaffSessionStore::class)->issueAnonymous();
        $this->http('POST', '/admin/network/airports', [
            'cookie' => $anonymous->getRawToken(),
            'csrf' => $anonymous->getCsrfToken(),
        ], $input)->assertStatus(401);
    }

    public function test_invalid_closed_commands_and_bounds_leave_no_partial_airport(): void
    {
        $staff = $this->staff('admin');
        $base = $this->sampleAirport('AMM');

        $badInputs = [
            // Out of range blockMinutes
            array_replace($base, ['blockMinutes' => 19]),
            array_replace($base, ['blockMinutes' => 601]),
            array_replace($base, ['blockMinutes' => '55']),
            // Invalid timezone
            array_replace($base, ['timezone' => 'Fake/Timezone']),
            array_replace($base, ['timezone' => '']),
            array_replace($base, ['timezone' => 'UTC+3']),
            // Unknown code
            array_replace($base, ['code' => 'LHR']),
            array_replace($base, ['code' => 'JFK']),
            array_replace($base, ['code' => 'XYZ']),
            // Extra property
            $base + ['unexpectedProperty' => 'injected'],
            // Incomplete bilingual label
            array_replace($base, ['airportName' => ['en' => 'Name']]),
            array_replace($base, ['city' => ['en' => '', 'ar' => 'عمان']]),
            array_replace($base, ['country' => ['en' => str_repeat('X', 161), 'ar' => 'الأردن']]),
        ];

        foreach ($badInputs as $bad) {
            $this->http('POST', '/admin/network/airports', $staff, $bad)->assertStatus(422);
        }

        $this->assertFalse(DB::table('airports')->where('code', 'AMM')->exists());
        $this->http('PATCH', '/admin/network/airports/RUH', $staff, ['blockMinutes' => 50])->assertStatus(404);
        $this->http('PATCH', '/admin/network/airports/missing', $staff, ['blockMinutes' => 50])->assertStatus(422);
        $this->http('PATCH', '/admin/network/airports/RUH', $staff, ['code' => 'changed'])->assertStatus(422);
    }

    public function test_database_constraints_and_history_cannot_be_bypassed(): void
    {
        $staff = $this->staff('admin');
        $input = $this->sampleAirport('AMM');
        $this->http('POST', '/admin/network/airports', $staff, $input)->assertStatus(201);
        $this->http('POST', '/admin/network/airports', $staff, $input)->assertStatus(409);

        $sql = [
            // Direct SQL attempting to mutate immutable code
            ['UPDATE airports SET code = ? WHERE code = ?', ['CAI', 'AMM']],
            // Invalid code
            ['INSERT INTO airports (code, airport_name_en, airport_name_ar, city_en, city_ar, country_en, country_ar, timezone, block_minutes, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ['LHR', 'London', 'لندن', 'London', 'لندن', 'UK', 'بريطانيا', 'Europe/London', 60, true]],
            // Out-of-range block_minutes
            ['UPDATE airports SET block_minutes = 15 WHERE code = ?', ['AMM']],
            ['UPDATE airports SET block_minutes = 601 WHERE code = ?', ['AMM']],
            // Empty label
            ['UPDATE airports SET airport_name_en = ? WHERE code = ?', ['', 'AMM']],
            // Invalid timezone via PostgreSQL CHECK reference_valid_iana_timezone
            ['UPDATE airports SET timezone = ? WHERE code = ?', ['Not/AZone', 'AMM']],
            ['UPDATE airports SET timezone = ? WHERE code = ?', ['UTC+3', 'AMM']],
            // Immutable revisions and audit events
            ['UPDATE network_revisions SET snapshot_hash = ?', [str_repeat('0', 64)]],
            ['DELETE FROM network_revisions', []],
            ['TRUNCATE network_revisions CASCADE', []],
            ['UPDATE network_audit_events SET outcome = ?', ['failed']],
            ['DELETE FROM network_audit_events', []],
            ['TRUNCATE network_audit_events', []],
        ];

        foreach ($sql as [$statement, $bindings]) {
            try {
                DB::transaction(fn() => DB::statement($statement, $bindings));
                $this->fail('Database boundary was bypassed for statement: '.$statement);
            } catch (\Illuminate\Database\QueryException|\PDOException) {
                $this->assertTrue(true);
            }
        }
    }

    public function test_history_failure_rolls_back_airport_revision_and_audit(): void
    {
        $staff = $this->staff('admin');
        $input = $this->sampleAirport('AMM');
        $beforeRev = (int) DB::table('network_revision_control')->value('revision');

        DB::unprepared("CREATE FUNCTION network_test_fail() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'Synthetic network failure'; END \$\$; CREATE TRIGGER network_test_failure BEFORE INSERT ON network_audit_events FOR EACH ROW EXECUTE FUNCTION network_test_fail();");

        try {
            $this->http('POST', '/admin/network/airports', $staff, $input)->assertStatus(503);
        } finally {
            DB::unprepared('DROP TRIGGER network_test_failure ON network_audit_events; DROP FUNCTION network_test_fail();');
        }

        $this->assertFalse(DB::table('airports')->where('code', 'AMM')->exists());
        $this->assertSame($beforeRev, (int) DB::table('network_revision_control')->value('revision'));
        $this->assertSame($beforeRev, DB::table('network_revisions')->count());
    }

    public function test_concurrent_create_race_has_one_winner_and_one_409(): void
    {
        $one = $this->staff('admin');
        $two = $this->staff('admin');
        $a = $this->sampleAirport('AMM');
        $b = $this->sampleAirport('AMM');

        $statuses = $this->race([
            ['method' => 'POST', 'path' => '/admin/network/airports', 'session' => $one, 'body' => $a],
            ['method' => 'POST', 'path' => '/admin/network/airports', 'session' => $two, 'body' => $b],
        ]);

        sort($statuses);
        $this->assertSame([201, 409], $statuses);
        $this->assertSame(1, DB::table('airports')->where('code', 'AMM')->count());
    }

    public function test_concurrent_patches_merge_locked_current_state_without_lost_updates(): void
    {
        $one = $this->staff('admin');
        $two = $this->staff('admin');
        $input = $this->sampleAirport('AMM');
        $this->http('POST', '/admin/network/airports', $one, $input)->assertStatus(201);

        $statuses = $this->race([
            ['method' => 'PATCH', 'path' => '/admin/network/airports/AMM', 'session' => $one, 'body' => ['blockMinutes' => 75]],
            ['method' => 'PATCH', 'path' => '/admin/network/airports/AMM', 'session' => $two, 'body' => ['active' => false]],
        ]);

        $this->assertSame([200, 200], $statuses);
        $row = DB::table('airports')->where('code', 'AMM')->first();
        $this->assertSame(75, (int) $row->block_minutes);
        $this->assertFalse((bool) $row->active);
    }

    public function test_registered_routes_preserve_exact_contract_and_permission_boundary(): void
    {
        $spec = json_decode(file_get_contents(base_path('../docs/backend/openapi.v1.json')), true, 64, JSON_THROW_ON_ERROR);
        $registry = json_decode(file_get_contents(base_path('../docs/backend/operation-policies.v1.json')), true, 64, JSON_THROW_ON_ERROR);

        $expected = [
            ['getAirports', 'GET', '/network/airports'],
            ['getNetworkRoutes', 'GET', '/network/routes'],
            ['getAdminAirports', 'GET', '/admin/network/airports'],
            ['postAdminAirport', 'POST', '/admin/network/airports'],
            ['patchAdminAirport', 'PATCH', '/admin/network/airports/{code}'],
        ];

        foreach ($expected as [$id, $method, $path]) {
            $route = app('router')->getRoutes()->getByName($id);
            $this->assertNotNull($route, "Route $id must be registered");
            $this->assertSame('api/v1'.$path, $route->uri());
            $this->assertContains($method, $route->methods());
            $this->assertSame($id, $spec['paths'][$path][strtolower($method)]['operationId']);

            $policy = array_values(array_filter(
                $registry['operations'],
                static fn(array $p): bool => $p['operationId'] === $id
            ))[0] ?? null;

            $this->assertNotNull($policy, "Policy for $id must exist");

            if ($id === 'getAirports' || $id === 'getNetworkRoutes') {
                $this->assertSame([], $policy['allowedSecurity']);
                $this->assertSame('public', $policy['intent']);
            } elseif ($id === 'getAdminAirports') {
                $this->assertSame('ops.view', $policy['requiredPermission']);
                $this->assertSame([['StaffCookieAuth' => []]], $policy['allowedSecurity']);
                $this->assertContains(\App\Http\Middleware\Reference\RequireNetworkStaffAuth::class, $route->gatherMiddleware());
            } else {
                $this->assertSame('ops.edit', $policy['requiredPermission']);
                $this->assertSame([['StaffCookieAuth' => []]], $policy['allowedSecurity']);
                $this->assertContains(\App\Http\Middleware\Reference\RequireNetworkStaffAuth::class, $route->gatherMiddleware());
            }
        }
    }

    public function test_expiry_while_waiting_for_domain_lock_cannot_commit_a_mutation(): void
    {
        $staff = $this->staff('admin');
        $input = $this->sampleAirport('AMM');

        DB::table('staff_sessions')->where('id', $staff['id'])->update([
            'absolute_expires_at' => DB::raw("clock_timestamp() + interval '1500 milliseconds'"),
            'idle_expires_at' => DB::raw("clock_timestamp() + interval '1400 milliseconds'"),
        ]);

        $db = DB::connection();
        $db->beginTransaction();
        $process = null;
        $pipes = [];

        try {
            $db->table('network_revision_control')->where('domain', 'network')->lockForUpdate()->first();
            $process = proc_open(
                [PHP_BINARY, base_path('tests/Feature/ReferenceNetwork/concurrency-worker.php')],
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
                'path' => '/admin/network/airports',
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
                $waiting = (int) $db->selectOne(
                    "SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%network_revision_control%'"
                )->n;
                if ($waiting > 0) {
                    break;
                }
                usleep(10000);
            } while (microtime(true) < $deadline);

            $this->assertGreaterThan(0, $waiting, 'The request must reach the locked aggregate before expiry.');
            usleep(1700000);
            $db->commit();

            $this->assertSame('401', $this->line($process, $pipes[1]));
            $this->assertFalse(DB::table('airports')->where('code', 'AMM')->exists());
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

    public function test_bounded_throttle_and_security_headers_are_preserved(): void
    {
        RateLimiter::for('reference', static fn($request) =>
            \Illuminate\Cache\RateLimiting\Limit::perMinute(2)->by('reference:'.$request->ip()));

        $headers = ['REMOTE_ADDR' => '192.0.2.99'];
        $this->http('GET', '/network/airports', [], null, $headers)->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->http('GET', '/network/airports', [], null, $headers)->assertOk();
        $response = $this->http('GET', '/network/airports', [], null, $headers);
        $response->assertStatus(429)->assertHeader('Retry-After')->assertHeader('X-Frame-Options', 'DENY');
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
    }

    public function test_all_network_error_statuses_are_actual_canonical_http_responses(): void
    {
        $staff = $this->staff('admin');
        $viewer = $this->staff('viewer');
        $editor = $this->staff('editor');
        $input = $this->sampleAirport('AMM');

        $this->http('POST', '/admin/network/airports', $staff, $input)->assertStatus(201);

        $cases = [
            ['GET', '/network/airports', null],
            ['GET', '/network/routes', null],
            ['GET', '/admin/network/airports', null],
            ['POST', '/admin/network/airports', $this->sampleAirport('CAI')],
            ['PATCH', '/admin/network/airports/AMM', ['blockMinutes' => 60]],
        ];

        foreach ($cases as [$method, $path, $body]) {
            // Untrusted host -> 400
            $this->http($method, $path, $staff, $body, ['HTTP_HOST' => 'untrusted.invalid'])->assertStatus(400);

            // Origin check
            $originResponse = $this->http($method, $path, $staff, $body, ['HTTP_ORIGIN' => 'https://untrusted.invalid']);
            if (in_array($method, ['POST', 'PATCH', 'PUT', 'DELETE'], true)) {
                $originResponse->assertStatus(403);
            } else {
                $originResponse->assertOk();
                if (!str_starts_with($path, '/admin')) {
                    $originResponse->assertHeaderMissing('Access-Control-Allow-Origin');
                }
            }

            // Auth checks for admin endpoints
            if (str_starts_with($path, '/admin')) {
                $this->http($method, $path, [], $body)->assertStatus(401);
                // editor lacks ops.view and ops.edit, so editor gets 403 on all /admin endpoints
                $this->http($method, $path, $editor, $body)->assertStatus(403);
                if ($method !== 'GET') {
                    $this->http($method, $path, $viewer, $body)->assertStatus(403);
                    $this->http($method, $path, $staff, ['unexpected' => true])->assertStatus(422);
                    $this->http($method, $path, $staff, null, [], '{')->assertStatus(422);
                    $this->http($method, $path, $staff, $body, ['CONTENT_TYPE' => 'text/plain'])->assertStatus(422);
                }
            }
        }

        // 409 conflict on duplicate create
        $this->http('POST', '/admin/network/airports', $staff, $input)->assertStatus(409);

        // 404 on nonexistent patch
        $this->http('PATCH', '/admin/network/airports/RUH', $staff, ['blockMinutes' => 70])->assertStatus(404);

        // 503 on database outage
        DB::statement('ALTER TABLE cache RENAME TO reference_test_unavailable_cache');
        try {
            foreach ($cases as [$method, $path, $body]) {
                $this->http($method, $path, $staff, $body)->assertStatus(503);
            }
        } finally {
            DB::statement('ALTER TABLE reference_test_unavailable_cache RENAME TO cache');
        }

        // 429 on rate limit
        RateLimiter::for('reference', static fn($request) =>
            \Illuminate\Cache\RateLimiting\Limit::perMinute(1)->by('reference:'.$request->ip()));

        foreach ($cases as [$method, $path, $body]) {
            $headers = ['REMOTE_ADDR' => '2001:db8:'.bin2hex(random_bytes(2)).'::3'];
            $this->http($method, $path, $staff, $body, $headers);
            $this->http($method, $path, $staff, $body, $headers)->assertStatus(429)->assertHeader('Retry-After');
        }
    }

    private function race(array $inputs): array
    {
        $children = [];
        try {
            foreach ($inputs as $input) {
                $pipes = [];
                $process = proc_open(
                    [PHP_BINARY, base_path('tests/Feature/ReferenceNetwork/concurrency-worker.php')],
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
