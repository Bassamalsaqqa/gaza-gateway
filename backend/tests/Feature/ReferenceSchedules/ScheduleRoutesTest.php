<?php

declare(strict_types=1);

namespace Tests\Feature\ReferenceSchedules;

use App\Identity\Mfa\TotpSecret;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Sessions\StaffSessionStore;
use App\Reference\Fleet\FleetCoordinator;
use App\Reference\Schedules\OfferingResolver;
use App\Reference\Schedules\ScheduleIdentityCodec;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class ScheduleRoutesTest extends TestCase
{
    private static ?string $hash = null;

    protected function setUp(): void
    {
        parent::setUp();
        if (Schema::hasTable('schedules')) {
            $rollbackCount = DB::table('migrations')
                ->where('migration', '>=', '2026_10_11_000005_create_schedule_reference_tables')
                ->count();
            if ($rollbackCount > 0) {
                Artisan::call('migrate:rollback', ['--step' => $rollbackCount, '--force' => true]);
                Artisan::call('migrate', ['--force' => true]);
            }
        }
    }

    private function staff(string $role = 'admin'): array
    {
        $id = (string) Str::uuid();
        self::$hash ??= app(Argon2idPasswordHasher::class)->hash('Synthetic-schedule-password-2026', 'staff');
        DB::table('staff_users')->insert([
            'id' => $id,
            'username' => 'sch-'.$id,
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
        $proto = ($headers['HTTPS'] ?? 'on') === 'off' ? 'http' : 'https';
        $response = $this->call(
            $method,
            $proto.'://'.($headers['HTTP_HOST'] ?? '127.0.0.1:18090').'/api/v1'.$path,
            [],
            [],
            [],
            array_replace($server, $headers),
            $raw ?? ($body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR))
        );

        $operation = match (true) {
            $method === 'POST' && str_starts_with($path, '/admin/schedules') => 'postAdminSchedule',
            $method === 'PATCH' && str_starts_with($path, '/admin/schedules/') => 'patchAdminSchedule',
            $method === 'GET' && $path === '/admin/schedules' => 'getAdminSchedules',
            $method === 'GET' && $path === '/schedules' => 'getSchedules',
            $method === 'GET' && (str_starts_with($path, '/offerings?') || $path === '/offerings') => 'getOfferings',
            $method === 'GET' && str_starts_with($path, '/offerings/') => 'getOfferingById',
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

    private function seedAirportsAndAircraft(): void
    {
        // Base airport GZA
        if (!DB::table('airports')->where('code', 'GZA')->exists()) {
            DB::table('airports')->insert([
                'code' => 'GZA',
                'airport_name_en' => 'Yasser Arafat International Airport',
                'airport_name_ar' => 'مطار ياسر عرفات الدولي',
                'city_en' => 'Gaza',
                'city_ar' => 'غزة',
                'country_en' => 'Palestine',
                'country_ar' => 'فلسطين',
                'timezone' => 'Asia/Gaza',
                'block_minutes' => 45,
                'active' => true,
            ]);
        }

        // Destination AMM
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

        // Destination CAI
        if (!DB::table('airports')->where('code', 'CAI')->exists()) {
            DB::table('airports')->insert([
                'code' => 'CAI',
                'airport_name_en' => 'Cairo International Airport',
                'airport_name_ar' => 'مطار القاهرة الدولي',
                'city_en' => 'Cairo',
                'city_ar' => 'القاهرة',
                'country_en' => 'Egypt',
                'country_ar' => 'مصر',
                'timezone' => 'Africa/Cairo',
                'block_minutes' => 70,
                'active' => true,
            ]);
        }

        // Aircraft a320neo
        if (!DB::table('aircraft')->where('id', 'a320neo')->exists()) {
            DB::transaction(function (): void {
                DB::table('aircraft')->insert([
                    'id' => 'a320neo',
                    'model' => 'Airbus A320neo',
                    'registration_normalized' => 'SU-GZA',
                    'active' => true,
                ]);
                $defaultLayout = FleetCoordinator::defaultLayout();
                DB::table('seat_layouts')->insert([
                    'aircraft_id' => 'a320neo',
                    'rows' => $defaultLayout['rows'],
                    'letters_json' => json_encode($defaultLayout['letters'], JSON_THROW_ON_ERROR),
                    'aisle_after' => $defaultLayout['aisleAfter'],
                    'zones_json' => json_encode($defaultLayout['zones'], JSON_THROW_ON_ERROR),
                    'extra_legroom_rows_json' => json_encode($defaultLayout['extraLegroomRows'], JSON_THROW_ON_ERROR),
                    'unavailable_json' => json_encode($defaultLayout['unavailable'], JSON_THROW_ON_ERROR),
                ]);
            });
        }

        // Aircraft b737
        if (!DB::table('aircraft')->where('id', 'b737')->exists()) {
            DB::transaction(function (): void {
                DB::table('aircraft')->insert([
                    'id' => 'b737',
                    'model' => 'Boeing 737-800',
                    'registration_normalized' => 'SU-GZB',
                    'active' => true,
                ]);
                $defaultLayout = FleetCoordinator::defaultLayout();
                DB::table('seat_layouts')->insert([
                    'aircraft_id' => 'b737',
                    'rows' => $defaultLayout['rows'],
                    'letters_json' => json_encode($defaultLayout['letters'], JSON_THROW_ON_ERROR),
                    'aisle_after' => $defaultLayout['aisleAfter'],
                    'zones_json' => json_encode($defaultLayout['zones'], JSON_THROW_ON_ERROR),
                    'extra_legroom_rows_json' => json_encode($defaultLayout['extraLegroomRows'], JSON_THROW_ON_ERROR),
                    'unavailable_json' => json_encode($defaultLayout['unavailable'], JSON_THROW_ON_ERROR),
                ]);
            });
        }
    }

    private function sampleSchedule(string $id = 'sch-amm-out-01'): array
    {
        return [
            'id' => $id,
            'number' => 'PS 204',
            'direction' => 'out',
            'destination' => 'AMM',
            'days' => [0, 2, 4], // Sun, Tue, Thu
            'departTime' => '10:00',
            'arriveTime' => '10:55',
            'aircraft' => 'Airbus A320neo',
            'aircraftId' => 'a320neo',
            'from' => '2026-10-01',
            'until' => '2026-10-31',
            'active' => true,
            'exceptions' => [],
        ];
    }

    public function test_migration_up_and_scoped_rollback_reapply(): void
    {
        $this->assertTrue(Schema::hasTable('schedules'));
        $this->assertTrue(Schema::hasTable('schedule_revision_control'));
        $this->assertTrue(Schema::hasTable('schedule_revisions'));
        $this->assertTrue(Schema::hasTable('schedule_audit_events'));

        // Scoped rollback of schedule reference migration
        Artisan::call('migrate:rollback', ['--step' => DB::table('migrations')->where('migration', '>=', '2026_10_11_000005_create_schedule_reference_tables')->count(), '--force' => true]);
        $this->assertFalse(Schema::hasTable('schedules'));
        $this->assertFalse(Schema::hasTable('schedule_revision_control'));

        // Reapply
        Artisan::call('migrate', ['--force' => true]);
        $this->assertTrue(Schema::hasTable('schedules'));
        $this->assertTrue(Schema::hasTable('schedule_revision_control'));
        $this->assertSame(0, (int) DB::table('schedule_revision_control')->value('revision'));
    }

    public function test_reviewed_closed_commands_and_direct_sql_utf16_boundary(): void
    {
        $this->seedAirportsAndAircraft();
        $staff = $this->staff();
        $input = $this->sampleSchedule('boundary');
        foreach ([['schedule' => $input], ['schedule' => $input, 'priceMinor' => 200], $input + ['ownerApproved' => true]] as $invalid) {
            $this->http('POST', '/admin/schedules', $staff, $invalid)->assertStatus(422);
        }
        $this->assertSame(0, DB::table('schedules')->count());
        $this->assertSame(0, DB::table('schedule_audit_events')->count());
        $this->http('POST', '/admin/schedules', $staff, $input)->assertStatus(201);
        $key = ScheduleIdentityCodec::encodeScheduleKey('boundary');
        $this->http('PATCH', '/admin/schedules/'.$key, $staff, ['schedule' => ['active' => false], 'priceMinor' => 200])->assertStatus(422);
        $this->assertTrue((bool) DB::table('schedules')->where('id', 'boundary')->value('active'));
        $this->http('PATCH', '/admin/schedules/'.$key, $staff, null, [], '{}')->assertStatus(200)->assertJsonPath('data.changed', false);
        $id = str_repeat("\u{1F600}", 80);
        $this->http('POST', '/admin/schedules', $staff, $this->sampleSchedule($id))->assertStatus(201);
        $row = (array) DB::table('schedules')->where('id', $id)->first();
        $row['id'] .= "\u{1F600}";
        $rejected = false;
        try { DB::transaction(fn() => DB::table('schedules')->insert($row)); }
        catch (\Illuminate\Database\QueryException $error) { $rejected = $error->getCode() === '23514'; }
        $this->assertTrue($rejected, 'Direct SQL must enforce exactly 160 UTF-16 code units.');
        $this->assertSame(160, (int) DB::selectOne('SELECT reference_schedule_utf16_length(?) AS n', [$id])->n);
        $this->http('GET', '/offerings?date=2026-10-11&origin[]=GZA')->assertStatus(422);
        $this->assertSame('repeatable read', OfferingResolver::consistentRead(fn() => DB::selectOne("SHOW transaction_isolation")->transaction_isolation));
    }

    public function test_initial_state_is_empty(): void
    {
        $this->assertSame(0, DB::table('schedules')->count());
        $resp = $this->http('GET', '/schedules');
        $resp->assertStatus(200);
        $this->assertSame([], $resp->json('data'));
    }

    public function test_codecs_roundtrip_and_reject_malformed(): void
    {
        $this->seedAirportsAndAircraft();

        $exactId = 'sch-utf8-تاريخي-1234';
        ScheduleIdentityCodec::assertValidId($exactId);
        $encodedKey = ScheduleIdentityCodec::encodeScheduleKey($exactId);
        $this->assertStringStartsWith('sch1-', $encodedKey);
        $this->assertSame($exactId, ScheduleIdentityCodec::decodeScheduleKey($encodedKey));

        // Invalid keys
        $this->assertNull(ScheduleIdentityCodec::decodeScheduleKey('raw-uri-id'));
        $this->assertNull(ScheduleIdentityCodec::decodeScheduleKey('sch1-invalid base64'));
        $this->assertNull(ScheduleIdentityCodec::decodeScheduleKey('sch1-==non-canonical'));

        // Dated ID codec
        $datedId = ScheduleIdentityCodec::encodeDatedOfferingId($exactId, '2026-10-15');
        $this->assertStringStartsWith('svc1-', $datedId);
        $this->assertStringEndsWith('-2026-10-15', $datedId);
        $parsed = ScheduleIdentityCodec::decodeDatedOfferingId($datedId);
        $this->assertSame($exactId, $parsed['scheduleId']);
        $this->assertSame('2026-10-15', $parsed['date']);

        // Invalid dated IDs
        $this->assertNull(ScheduleIdentityCodec::decodeDatedOfferingId('invalid-dated-id'));
        $this->assertNull(ScheduleIdentityCodec::decodeDatedOfferingId('svc1-abc-2026-02-30'));
    }

    public function test_staff_authentication_and_authorization(): void
    {
        $this->seedAirportsAndAircraft();
        $input = $this->sampleSchedule();
        $key = ScheduleIdentityCodec::encodeScheduleKey($input['id']);

        // 401 unauthenticated
        $this->http('GET', '/admin/schedules')->assertStatus(401);
        $this->http('POST', '/admin/schedules', [], $input)->assertStatus(401);
        $this->http('PATCH', "/admin/schedules/{$key}", [], ['number' => 'PS 205'])->assertStatus(401);

        $staff = $this->staff('editor'); // non-ops role (editor role lacks ops.view and ops.edit)
        $this->http('GET', '/admin/schedules', $staff)->assertStatus(403);
        $this->http('POST', '/admin/schedules', $staff, $input)->assertStatus(403);
        $this->http('PATCH', "/admin/schedules/{$key}", $staff, ['number' => 'PS 205'])->assertStatus(403);

        $ops = $this->staff('admin');
        // Missing CSRF
        $noCsrf = $ops;
        unset($noCsrf['csrf']);
        $this->http('POST', '/admin/schedules', $noCsrf, $input)->assertStatus(403);

        // Disallowed Origin
        $this->http('POST', '/admin/schedules', $ops, $input, ['HTTP_ORIGIN' => 'https://evil.invalid'])->assertStatus(403);

        // Insecure HTTP
        $this->http('POST', '/admin/schedules', $ops, $input, ['HTTPS' => 'off'])->assertStatus(403);
    }

    public function test_create_read_patch_and_no_op_lifecycle(): void
    {
        $this->seedAirportsAndAircraft();
        $staff = $this->staff('admin');
        $input = $this->sampleSchedule('sch-demo-01');

        // Create
        $res = $this->http('POST', '/admin/schedules', $staff, $input);
        $res->assertStatus(201);
        $this->assertSame('sch-demo-01', $res->json('data.schedule.id'));
        $this->assertTrue($res->json('data.changed'));
        $this->assertSame(1, $res->json('data.revision'));

        // Public read returns active
        $pub = $this->http('GET', '/schedules');
        $pub->assertStatus(200);
        $this->assertCount(1, $pub->json('data'));
        $this->assertSame('sch-demo-01', $pub->json('data.0.id'));

        // Duplicate creation returns 409
        $dup = $this->http('POST', '/admin/schedules', $staff, $input);
        $dup->assertStatus(409);

        // Patch
        $key = ScheduleIdentityCodec::encodeScheduleKey('sch-demo-01');
        $patchRes = $this->http('PATCH', "/admin/schedules/{$key}", $staff, [
            'number' => 'PS 205',
        ]);
        $patchRes->assertStatus(200);
        $this->assertSame('PS 205', $patchRes->json('data.schedule.number'));
        $this->assertTrue($patchRes->json('data.changed'));
        $this->assertSame(2, $patchRes->json('data.revision'));

        // No-op patch
        $noOp = $this->http('PATCH', "/admin/schedules/{$key}", $staff, [
            'number' => 'PS 205',
        ]);
        $noOp->assertStatus(200);
        $this->assertFalse($noOp->json('data.changed'));
        $this->assertSame(2, $noOp->json('data.revision'));
        $this->assertSame(2, (int) DB::table('schedule_revision_control')->value('revision'));

        // Mutating immutable route identity returns 422
        $imm = $this->http('PATCH', "/admin/schedules/{$key}", $staff, [
            'destination' => 'CAI',
        ]);
        $imm->assertStatus(422);

        // Mutating non-existent key returns 404
        $missingKey = ScheduleIdentityCodec::encodeScheduleKey('sch-non-existent');
        $this->http('PATCH', "/admin/schedules/{$missingKey}", $staff, ['number' => 'PS 999'])->assertStatus(404);
    }

    public function test_validation_rules_and_forbidden_fields(): void
    {
        $this->seedAirportsAndAircraft();
        $staff = $this->staff('admin');

        // Forbidden fields
        $this->http('POST', '/admin/schedules', $staff, $this->sampleSchedule() + ['priceMinor' => 0])->assertStatus(422);
        $this->http('POST', '/admin/schedules', $staff, $this->sampleSchedule() + ['seatsLeft' => 50])->assertStatus(422);
        $this->http('POST', '/admin/schedules', $staff, $this->sampleSchedule() + ['gate' => 'A1'])->assertStatus(422);

        // Date range from > until
        $badDates = $this->sampleSchedule('sch-bad-dates');
        $badDates['from'] = '2026-10-31';
        $badDates['until'] = '2026-10-01';
        $this->http('POST', '/admin/schedules', $staff, $badDates)->assertStatus(422);

        // Inactive destination
        DB::table('airports')->where('code', 'CAI')->update(['active' => false]);
        $badDest = $this->sampleSchedule('sch-cai-inactive');
        $badDest['destination'] = 'CAI';
        $this->http('POST', '/admin/schedules', $staff, $badDest)->assertStatus(422);

        // Inactive aircraft
        DB::table('aircraft')->where('id', 'b737')->update(['active' => false]);
        $badAc = $this->sampleSchedule('sch-b737-inactive');
        $badAc['aircraftId'] = 'b737';
        $badAc['aircraft'] = 'Boeing 737-800';
        $this->http('POST', '/admin/schedules', $staff, $badAc)->assertStatus(422);

        // Model mismatch
        $badModel = $this->sampleSchedule('sch-model-mismatch');
        $badModel['aircraftId'] = 'a320neo';
        $badModel['aircraft'] = 'Boeing 737-800';
        $this->http('POST', '/admin/schedules', $staff, $badModel)->assertStatus(422);
    }

    public function test_pure_dated_offering_projection_and_exceptions(): void
    {
        $this->seedAirportsAndAircraft();
        $staff = $this->staff('admin');

        // Schedule operates on Sunday (0), Tuesday (2), Thursday (4) in Oct 2026
        // Oct 11, 2026 is Sunday (operating)
        // Oct 12, 2026 is Monday (non-operating)
        // Oct 13, 2026 is Tuesday (operating)
        // Oct 15, 2026 is Thursday (operating)
        $sch = $this->sampleSchedule('sch-offering-test');
        $sch['exceptions'] = [
            // Cancelled on Oct 11
            [
                'id' => 'exc-cancel-01',
                'date' => '2026-10-11',
                'kind' => 'cancelled',
                'detail' => 'Synthetic cancellation annotation',
                'effect' => ['cancelled' => true],
            ],
            // Time adjustment on Oct 13
            [
                'id' => 'exc-time-01',
                'date' => '2026-10-13',
                'kind' => 'time',
                'detail' => 'Synthetic time adjustment',
                'effect' => ['departTime' => '14:30', 'arriveTime' => '15:25'],
            ],
            // Extra flight on non-operating Monday Oct 12
            [
                'id' => 'exc-extra-01',
                'date' => '2026-10-12',
                'kind' => 'extra',
                'detail' => 'Synthetic extra flight',
                'effect' => ['departTime' => '11:00', 'arriveTime' => '11:55'],
            ],
        ];

        $this->http('POST', '/admin/schedules', $staff, $sch)->assertStatus(201);

        // Oct 11: cancelled flight should NOT appear in offerings collection
        $res11 = $this->http('GET', '/offerings?date=2026-10-11&origin=GZA&destination=AMM');
        $res11->assertStatus(200);
        $this->assertSame([], $res11->json('data'));

        $datedId11 = ScheduleIdentityCodec::encodeDatedOfferingId('sch-offering-test', '2026-10-11');
        $this->http('GET', "/offerings/{$datedId11}")->assertStatus(404);

        // Oct 12: extra flight operates and appears
        $res12 = $this->http('GET', '/offerings?date=2026-10-12');
        $res12->assertStatus(200);
        $this->assertCount(1, $res12->json('data'));
        $this->assertSame('11:00', $res12->json('data.0.departTime'));
        $this->assertSame('11:55', $res12->json('data.0.arriveTime'));

        // Oct 13: time adjustment applies
        $res13 = $this->http('GET', '/offerings?date=2026-10-13');
        $res13->assertStatus(200);
        $this->assertCount(1, $res13->json('data'));
        $this->assertSame('14:30', $res13->json('data.0.departTime'));
        $this->assertSame('15:25', $res13->json('data.0.arriveTime'));

        // Oct 15: normal schedule projection
        $res15 = $this->http('GET', '/offerings?date=2026-10-15');
        $res15->assertStatus(200);
        $this->assertCount(1, $res15->json('data'));
        $offering = $res15->json('data.0');

        // Check OfferingDto fields and purity
        $this->assertSame('sch-offering-test', $offering['scheduleId']);
        $this->assertSame('2026-10-15', $offering['date']);
        $this->assertSame('PS 204', $offering['number']);
        $this->assertSame('out', $offering['direction']);
        $this->assertSame('GZA', $offering['originCode']);
        $this->assertSame('AMM', $offering['destinationCode']);
        $this->assertSame('10:00', $offering['departTime']);
        $this->assertSame('10:55', $offering['arriveTime']);
        $this->assertSame(55, $offering['durationMinutes']);
        $this->assertSame('a320neo', $offering['aircraftId']);
        $this->assertSame('Airbus A320neo', $offering['aircraft']);
        $this->assertIsArray($offering['layout']);
        $this->assertIsArray($offering['revisions']);
        $this->assertSame('commemorative', $offering['classification']);
        $this->assertSame(0, $offering['priceMinor']);

        // Explicitly assert absence of simulated claims
        $this->assertArrayNotHasKey('terminal', $offering);
        $this->assertArrayNotHasKey('gate', $offering);
        $this->assertArrayNotHasKey('status', $offering);
        $this->assertArrayNotHasKey('seatsLeft', $offering);

        // Detail endpoint
        $detail = $this->http('GET', "/offerings/{$offering['id']}");
        $detail->assertStatus(200);
        $this->assertSame($offering['id'], $detail->json('data.id'));

        // Standalone OfferingResolver callable
        $resolved = OfferingResolver::resolve($offering['id']);
        $this->assertSame($offering['id'], $resolved->id);
        $this->assertSame(55, $resolved->durationMinutes);
    }

    public function test_atomic_audit_rollback_on_failure(): void
    {
        $this->seedAirportsAndAircraft();
        $staff = $this->staff('admin');
        $input = $this->sampleSchedule('sch-rollback-test');

        DB::unprepared("
            CREATE FUNCTION reference_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END $$;
            CREATE TRIGGER reference_test_failure BEFORE INSERT ON schedule_audit_events
            FOR EACH ROW EXECUTE FUNCTION reference_test_fail();
        ");

        try {
            $this->http('POST', '/admin/schedules', $staff, $input)->assertStatus(503);
        } finally {
            DB::unprepared('
                DROP TRIGGER reference_test_failure ON schedule_audit_events;
                DROP FUNCTION reference_test_fail();
            ');
        }

        $this->assertFalse(DB::table('schedules')->where('id', 'sch-rollback-test')->exists());
        $this->assertSame(0, (int) DB::table('schedule_revision_control')->value('revision'));
    }

    public function test_negative_controls_and_error_captures(): void
    {
        $this->seedAirportsAndAircraft();
        $staff = $this->staff('admin');
        $input = $this->sampleSchedule('sch-neg-demo');
        $this->http('POST', '/admin/schedules', $staff, $input)->assertStatus(201);
        $key = ScheduleIdentityCodec::encodeScheduleKey('sch-neg-demo');
        $datedId = ScheduleIdentityCodec::encodeDatedOfferingId('sch-neg-demo', '2026-10-15');

        $cases = [
            ['GET', '/schedules', null],
            ['GET', '/admin/schedules', null],
            ['POST', '/admin/schedules', $this->sampleSchedule('sch-err-dummy')],
            ['PATCH', "/admin/schedules/{$key}", ['number' => 'PS 888']],
            ['GET', '/offerings?date=2026-10-15', null],
            ['GET', "/offerings/{$datedId}", null],
        ];

        // 400 on untrusted host
        foreach ($cases as [$method, $path, $body]) {
            $this->http($method, $path, $staff, $body, ['HTTP_HOST' => 'untrusted.invalid'])->assertStatus(400);
        }

        // 404 not found
        $this->http('PATCH', '/admin/schedules/sch1-bWlzc2luZw', $staff, ['number' => 'PS 123'])->assertStatus(404);
        $this->http('GET', '/offerings/svc1-bWlzc2luZw-2026-10-15')->assertStatus(404);

        // 422 validation error
        $this->http('GET', '/offerings?date=invalid-date')->assertStatus(422);

        // 503 service unavailable
        DB::statement('ALTER TABLE cache RENAME TO schedules_test_unavailable_cache');
        try {
            foreach ($cases as [$method, $path, $body]) {
                $this->http($method, $path, $staff, $body)->assertStatus(503);
            }
        } finally {
            DB::statement('ALTER TABLE schedules_test_unavailable_cache RENAME TO cache');
        }

        // 429 rate limit exceeded
        RateLimiter::for('reference', static fn($request) =>
            \Illuminate\Cache\RateLimiting\Limit::perMinute(1)->by('reference:'.$request->ip()));

        foreach ($cases as [$method, $path, $body]) {
            $headers = ['REMOTE_ADDR' => '2001:db8:'.bin2hex(random_bytes(2)).'::7'];
            $this->http($method, $path, $staff, $body, $headers);
            $this->http($method, $path, $staff, $body, $headers)->assertStatus(429)->assertHeader('Retry-After');
        }
    }

    public function test_concurrency_race_creates_and_stale_auth_wait(): void
    {
        if (getenv('REFERENCE_GATE_OWNED') !== '1') {
            $this->markTestSkipped('Concurrency test runs in gate container.');
        }

        $this->seedAirportsAndAircraft();
        $staff = $this->staff('admin');
        $input = $this->sampleSchedule('sch-race-01');

        $statuses = $this->race([
            ['method' => 'POST', 'path' => '/admin/schedules', 'session' => $staff, 'body' => $input],
            ['method' => 'POST', 'path' => '/admin/schedules', 'session' => $staff, 'body' => $input],
        ]);
        sort($statuses);
        $this->assertSame([201, 409], $statuses);

        // Stale auth wait
        DB::table('staff_sessions')->where('id', $staff['id'])->update([
            'absolute_expires_at' => DB::raw("clock_timestamp() + interval '1500 milliseconds'"),
            'idle_expires_at' => DB::raw("clock_timestamp() + interval '1400 milliseconds'"),
        ]);

        $db = DB::connection();
        $db->beginTransaction();
        $process = null;
        $pipes = [];

        try {
            $db->table('schedule_revision_control')->where('domain', 'schedules')->lockForUpdate()->first();
            $process = proc_open(
                [PHP_BINARY, base_path('tests/Feature/ReferenceSchedules/concurrency-worker.php')],
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
                'path' => '/admin/schedules',
                'session' => $staff,
                'body' => $this->sampleSchedule('sch-expire-wait'),
            ], JSON_THROW_ON_ERROR)."\n");
            fflush($pipes[0]);

            $this->assertSame('READY', $this->line($process, $pipes[1]));
            fwrite($pipes[0], "GO\n");
            fflush($pipes[0]);

            $deadline = microtime(true) + 1;
            do {
                $db->select('SELECT pg_stat_clear_snapshot()');
                $waiting = (int) $db->selectOne("SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%schedule_revision_control%'")->n;
                if ($waiting > 0) {
                    break;
                }
                usleep(10000);
            } while (microtime(true) < $deadline);

            $this->assertGreaterThan(0, $waiting, 'The request must reach locked aggregate before expiry.');
            usleep(1700000);
            $db->commit();

            $this->assertSame('401', $this->line($process, $pipes[1]));
            $this->assertFalse(DB::table('schedules')->where('id', 'sch-expire-wait')->exists());
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
                    [PHP_BINARY, base_path('tests/Feature/ReferenceSchedules/concurrency-worker.php')],
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
