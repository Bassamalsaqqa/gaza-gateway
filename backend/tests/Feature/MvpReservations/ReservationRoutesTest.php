<?php

declare(strict_types=1);

namespace Tests\Feature\MvpReservations;

use App\Identity\Mfa\TotpSecret;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Sessions\StaffSessionStore;
use App\Mvp\Reservations\Exceptions\ReservationAuthorityUnavailableException;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class ReservationRoutesTest extends TestCase
{
    private static ?string $staffHash = null;
    private static ?string $passengerHash = null;

    protected function setUp(): void
    {
        if (getenv('MVP_RESERVATIONS_GATE_OWNED') !== '1' || getenv('REFERENCE_GATE_OWNED') !== '1') {
            throw new \RuntimeException('Reservation tests require the disposable reservation gate.');
        }
        parent::setUp();
        config([
            'reservations.enabled' => true,
            'reservations.authority' => 'resolver',
        ]);

        DB::transaction(function (): void {
            foreach (['GZA', 'AMM'] as $code) {
                DB::table('airports')->updateOrInsert(['code' => $code], [
                    'airport_name_en' => 'Synthetic '.$code, 'airport_name_ar' => 'Synthetic '.$code,
                    'city_en' => 'Synthetic '.$code, 'city_ar' => 'Synthetic '.$code,
                    'country_en' => 'Synthetic country', 'country_ar' => 'Synthetic country',
                    'timezone' => 'Asia/Gaza', 'block_minutes' => 60, 'active' => true,
                ]);
            }
            if (!DB::table('aircraft')->where('id', 'ac-b738-1')->exists()) {
                DB::table('aircraft')->insert([
                    'id' => 'ac-b738-1',
                    'model' => 'Boeing 737-800',
                    'registration_normalized' => 'T-MVPG',
                    'active' => true,
                    'rows' => 28,
                    'letters_json' => json_encode(['A', 'B', 'C', 'D', 'E', 'F'], JSON_THROW_ON_ERROR),
                    'aisle_after' => 3,
                    'zones_json' => json_encode([['id' => 'economy', 'firstRow' => 1, 'lastRow' => 28]], JSON_THROW_ON_ERROR),
                    'extra_legroom_rows_json' => json_encode([], JSON_THROW_ON_ERROR),
                    'unavailable_json' => json_encode([], JSON_THROW_ON_ERROR),
                ]);
            } else {
                DB::table('aircraft')->where('id', 'ac-b738-1')->update([
                    'rows' => 28,
                    'zones_json' => json_encode([['id' => 'economy', 'firstRow' => 1, 'lastRow' => 28]], JSON_THROW_ON_ERROR),
                ]);
            }
            DB::table('schedules')->updateOrInsert(['id' => 'curated-flight'], [
                'number' => 'PS100', 'direction' => 'out', 'destination' => 'AMM',
                'days_json' => '[0,1,2,3,4,5,6]', 'depart_time' => '08:00', 'arrive_time' => '09:00',
                'aircraft' => 'Boeing 737-800', 'aircraft_id' => 'ac-b738-1',
                'from_date' => '2026-01-01', 'until_date' => '2027-12-31', 'active' => true, 'exceptions_json' => '[]',
            ]);
            if (!DB::table('meal_options')->where('id', 'meal-standard')->exists()) {
                DB::table('meal_options')->insert([
                    'id' => 'meal-standard',
                    'label_en' => 'Standard Meal',
                    'label_ar' => 'وجبة قياسية',
                    'active' => true,
                    'order_num' => 0,
                ]);
            }
        });
    }

    private function staff(string $role = 'admin'): array
    {
        $id = $this->trackStaffId((string) Str::uuid());
        self::$staffHash ??= app(Argon2idPasswordHasher::class)->hash('Synthetic-staff-password-2026', 'staff');
        DB::table('staff_users')->insert([
            'id' => $id,
            'username' => 'staff-'.$id,
            'email' => $id.'@example.invalid',
            'full_name_en' => 'Synthetic Staff',
            'full_name_ar' => 'Synthetic Staff',
            'password_hash' => self::$staffHash,
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
            'owner' => $id,
            'id' => $receipt->sessionId,
            'cookie' => $receipt->getRawToken(),
            'csrf' => $receipt->getCsrfToken(),
        ];
    }

    private function passenger(string $status = 'active', bool $verified = true): array
    {
        $id = (string) Str::uuid();
        self::$passengerHash ??= app(Argon2idPasswordHasher::class)->hash('Synthetic-passenger-pass-2026', 'passenger');
        DB::table('users')->insert([
            'id' => $id,
            'email' => 'passenger-'.$id.'@example.invalid',
            'password_hash' => self::$passengerHash,
            'status' => $status,
            'credential_epoch' => 1,
            'email_verified_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);
        DB::table('passenger_profiles')->insert([
            'user_id' => $id,
            'first_name' => 'Amina',
            'last_name' => 'Al-Saqqa',
            'phone' => '+970599000000',
            'seat_preference' => 'window',
            'meal_preference' => 'standard',
            'newsletter' => true,
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);
        $receipt = app(PassengerSessionStore::class)->issueFull($id, 1);
        if (!$verified) DB::table('users')->where('id', $id)->update(['email_verified_at' => null]);
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
        string $cookieName = 'gza_session'
    ): TestResponse {
        $this->flushHeaders();
        $cookieHeader = '';
        if (isset($session['cookie'])) {
            $cookieHeader = $cookieName.'='.$session['cookie'];
        }

        $server = [
            'HTTPS' => 'on',
            'SERVER_PORT' => 443,
            'HTTP_HOST' => '127.0.0.1:18090',
            'HTTP_ORIGIN' => 'https://127.0.0.1:5173',
            'HTTP_ACCEPT' => 'application/json',
            'CONTENT_TYPE' => 'application/json',
            'HTTP_COOKIE' => $cookieHeader,
            'HTTP_X_CSRF_TOKEN' => $session['csrf'] ?? '',
            'REMOTE_ADDR' => '2001:db8:'.bin2hex(random_bytes(2)).'::9',
        ];

        $response = $this->call(
            $method,
            (($headers['HTTPS'] ?? 'on') === 'off' ? 'http://' : 'https://').($headers['HTTP_HOST'] ?? '127.0.0.1:18090').'/api/v1'.$path,
            [],
            [],
            [],
            array_replace($server, $headers),
            $raw ?? ($body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR))
        );

        $routePath = parse_url($path, PHP_URL_PATH);
        $operation = match (true) {
            $method === 'GET' && str_starts_with($routePath, '/offerings/') => 'getOfferingSeats',
            $method === 'POST' && $routePath === '/reservations' => 'postReservation',
            $method === 'GET' && $routePath === '/reservations' => 'getReservations',
            $method === 'GET' && preg_match('#^/reservations/[^/]+/ticket$#', $routePath) === 1 => 'getReservationTicket',
            $method === 'POST' && preg_match('#^/reservations/[^/]+/cancel$#', $routePath) === 1 => 'postReservationCancel',
            $method === 'GET' && preg_match('#^/reservations/[^/]+$#', $routePath) === 1 => 'getReservationByRef',
            $method === 'GET' && $routePath === '/admin/reservations' => 'getAdminReservations',
            $method === 'GET' && preg_match('#^/admin/reservations/[^/]+$#', $routePath) === 1 => 'getAdminReservationByRef',
            $method === 'POST' && preg_match('#^/admin/reservations/[^/]+/cancel$#', $routePath) === 1 => 'postAdminReservationCancel',
            default => null,
        };



        $siteOperation = match (true) {
            $routePath === '/site/contact' => 'getSiteContact',
            $routePath === '/contact' => 'postSiteContact',
            $routePath === '/admin/settings/contact' => 'getSiteContactSettings',
            $routePath === '/admin/settings/contact/draft' => 'putSiteContactDraft',
            $routePath === '/admin/settings/contact/publish' => 'postSiteContactPublish',
            $routePath === '/admin/settings/contact/discard' => 'postSiteContactDiscard',
            $routePath === '/admin/contact/inbox' => 'getSiteContactInbox',
            preg_match('#^/admin/contact/inbox/[^/]+$#',$routePath) === 1 => 'getSiteContactMessage',
            preg_match('#^/admin/contact/inbox/[^/]+/status$#',$routePath) === 1 => 'patchSiteContactStatus',
            preg_match('#^/admin/contact/inbox/[^/]+/assign$#',$routePath) === 1 => 'patchSiteContactAssignee',
            preg_match('#^/admin/contact/inbox/[^/]+/notes$#',$routePath) === 1 => 'postSiteContactNote',
            preg_match('#^/admin/contact/inbox/[^/]+/reply-draft$#',$routePath) === 1 => 'putSiteContactReplyDraft',
            default => null,
        };
        if ($siteOperation !== null) {
            $file = '/tmp/site-captures.json';
            $all = is_file($file) ? json_decode(file_get_contents($file),true,32,JSON_THROW_ON_ERROR) : [];
            $all[$siteOperation.':'.$response->status()] ??= ['operationId'=>$siteOperation,'status'=>$response->status(),
                'contentType'=>$response->headers->get('Content-Type'),'payload'=>$response->json()];
            file_put_contents($file,json_encode($all,JSON_THROW_ON_ERROR),LOCK_EX);
        }

        $mailOperation = match (true) {
            $routePath === '/admin/settings/email' => $method === 'GET' ? 'getAdminMailSettings' : 'putAdminMailSettings',
            $routePath === '/admin/settings/email/test' => 'postAdminTestMail',
            $routePath === '/admin/mail/messages' => 'getAdminMailMessages',
            preg_match('#^/reservations/[^/]+/email$#',$routePath) === 1 => 'getReservationMailStatus',
            preg_match('#^/reservations/[^/]+/email/resend$#',$routePath) === 1 => 'postReservationMailResend',
            preg_match('#^/admin/reservations/[^/]+/email/resend$#',$routePath) === 1 => 'postAdminReservationMailResend',
            default => null,
        };
        if ($mailOperation !== null) {
            $file = '/tmp/mail-captures.json';
            $all = is_file($file) ? json_decode(file_get_contents($file),true,32,JSON_THROW_ON_ERROR) : [];
            $all[$mailOperation.':'.$response->status()] ??= ['operationId'=>$mailOperation,'status'=>$response->status(),
                'contentType'=>$response->headers->get('Content-Type'),'payload'=>$response->json()];
            file_put_contents($file,json_encode($all,JSON_THROW_ON_ERROR),LOCK_EX);
        }

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

    private function sampleServiceId(string $date = '2026-12-20'): string
    {
        return 'svc1-'.rtrim(strtr(base64_encode('curated-flight'), '+/', '-_'), '=').'-'.$date;
    }

    private function sampleCommand(
        string $serviceId,
        string $seat = '1A',
        ?string $meal = null,
        ?string $submissionId = null
    ): array {
        return [
            'submissionId' => $submissionId ?? (string) Str::uuid(),
            'serviceId' => $serviceId,
            'passengers' => [
                [
                    'id' => 'p-1',
                    'type' => 'adult',
                    'firstName' => 'Amina',
                    'lastName' => 'Al-Saqqa',
                    'dob' => '2000-02-29',
                    'nationality' => 'Palestinian',
                    'document' => 'DOC-123456',
                    'seatCode' => $seat,
                    'mealId' => $meal,
                ],
            ],
            'contact' => [
                'email' => 'amina@example.test',
                'phone' => '+970 599 123456',
            ],
        ];
    }

    public function test_migration_cycle_reversibility(): void
    {
        $steps=DB::table('migrations')->where('migration','>=','2026_10_11_000007_create_mvp_reservation_tables')->count();
        $status = Artisan::call('migrate:rollback', ['--step' => $steps]);
        $this->assertSame(0, $status);
        $this->assertFalse(DB::getSchemaBuilder()->hasTable('mvp_reservations'));
        $this->assertFalse(DB::getSchemaBuilder()->hasTable('mvp_services'));

        $status = Artisan::call('migrate');
        $this->assertSame(0, $status);
        $this->assertTrue(DB::getSchemaBuilder()->hasTable('mvp_reservations'));
        $this->assertTrue(DB::getSchemaBuilder()->hasTable('mvp_services'));
    }

    public function test_get_offering_seats_public_occupancy(): void
    {
        $serviceId = $this->sampleServiceId();
        $response = $this->http('GET', '/offerings/'.$serviceId.'/seats');
        $response->assertStatus(200);
        $this->assertTrue($response->json('success'));
        $this->assertSame($serviceId, $response->json('data.serviceId'));
        $this->assertIsArray($response->json('data.occupiedSeats'));
        $this->assertEmpty($response->json('data.occupiedSeats'));

        $passenger = $this->passenger();
        $command = $this->sampleCommand($serviceId, '1A');
        $createRes = $this->http('POST', '/reservations', $passenger, $command);
        $createRes->assertStatus(201);

        $responseAfter = $this->http('GET', '/offerings/'.$serviceId.'/seats');
        $responseAfter->assertStatus(200);
        $this->assertContains('1A', $responseAfter->json('data.occupiedSeats'));
    }

    public function test_post_reservation_creation_and_idempotent_replay(): void
    {
        $passenger = $this->passenger();
        $serviceId = $this->sampleServiceId();
        $meal = DB::table('meal_options')->where('active', true)->value('id');
        $submissionId = (string) Str::uuid();

        $command = $this->sampleCommand($serviceId, '3A', $meal, $submissionId);

        $res1 = $this->http('POST', '/reservations', $passenger, $command);
        $res1->assertStatus(201);
        $ref = $res1->json('data.reservation.reference');
        $this->assertNotNull($ref);
        $this->assertSame('confirmed', $res1->json('data.reservation.status'));
        $this->assertSame('3A', $res1->json('data.reservation.passengers.0.seatCode'));
        $this->assertSame('confirmed', $res1->json('data.ticket.status'));

        $this->assertTrue(DB::table('mvp_reservations')->where('reference', $ref)->exists());
        $this->assertTrue(DB::table('mvp_reservation_seat_claims')->where('service_id', $serviceId)->where('seat_code', '3A')->exists());
        $this->assertTrue(DB::table('mvp_reservation_mail_intents')->where('reservation_id', $res1->json('data.reservation.id'))->exists());

        $res2 = $this->http('POST', '/reservations', $passenger, $command);
        $res2->assertStatus(200);
        $this->assertSame($ref, $res2->json('data.reservation.reference'));
        $this->assertSame(1, DB::table('mvp_reservation_submissions')->where('submission_id', $submissionId)->count());
        $this->assertSame(1, DB::table('mvp_reservation_mail_intents')->where('reservation_id', $res1->json('data.reservation.id'))->count());
    }

    public function test_post_reservation_replay_differing_fingerprint_returns_409(): void
    {
        $passenger = $this->passenger();
        $serviceId = $this->sampleServiceId();
        $submissionId = (string) Str::uuid();

        $cmd1 = $this->sampleCommand($serviceId, '4A', null, $submissionId);
        $this->http('POST', '/reservations', $passenger, $cmd1)->assertStatus(201);

        $cmd2 = $cmd1;
        $cmd2['passengers'][0]['firstName'] = 'Fatima';
        $res2 = $this->http('POST', '/reservations', $passenger, $cmd2);
        $res2->assertStatus(409);
        $this->assertSame('conflict', $res2->json('error.code'));
    }

    public function test_post_reservation_seat_occupied_returns_409(): void
    {
        $userA = $this->passenger();
        $userB = $this->passenger();
        $serviceId = $this->sampleServiceId();

        $cmdA = $this->sampleCommand($serviceId, '5A');
        $this->http('POST', '/reservations', $userA, $cmdA)->assertStatus(201);

        $cmdB = $this->sampleCommand($serviceId, '5A');
        $resB = $this->http('POST', '/reservations', $userB, $cmdB);
        $resB->assertStatus(409);
        $this->assertSame('conflict', $resB->json('error.code'));
    }

    public function test_post_reservation_reference_changed_returns_409(): void
    {
        $userA = $this->passenger();
        $userB = $this->passenger();
        $serviceId = $this->sampleServiceId('2026-12-25');

        $cmdA = $this->sampleCommand($serviceId, '6A');
        $this->http('POST', '/reservations', $userA, $cmdA)->assertStatus(201);

        DB::table('aircraft')->where('id', 'ac-b738-1')->update([
            'rows' => 25, 'zones_json' => json_encode([['id' => 'economy', 'firstRow' => 1, 'lastRow' => 25]], JSON_THROW_ON_ERROR),
        ]);

        $cmdB = $this->sampleCommand($serviceId, '7A');
        $resB = $this->http('POST', '/reservations', $userB, $cmdB);
        $resB->assertStatus(409);
        $this->assertSame('reference_changed', $resB->json('error.code'));
    }

    public function test_two_users_race_same_seat_concurrency(): void
    {
        if (getenv('REFERENCE_GATE_OWNED') !== '1') {
            $this->markTestSkipped('Concurrency worker requires REFERENCE_GATE_OWNED environment.');
        }

        $userA = $this->passenger();
        $userB = $this->passenger();
        $serviceId = $this->sampleServiceId('2026-12-28');

        $cmdA = $this->sampleCommand($serviceId, '8A');
        $cmdB = $this->sampleCommand($serviceId, '8A');

        $statuses = $this->race([
            ['method' => 'POST', 'path' => '/reservations', 'session' => $userA, 'body' => $cmdA],
            ['method' => 'POST', 'path' => '/reservations', 'session' => $userB, 'body' => $cmdB],
        ]);

        sort($statuses);
        $this->assertSame([201, 409], $statuses);

        $claims = DB::table('mvp_reservation_seat_claims')
            ->where('service_id', $serviceId)
            ->where('seat_code', '8A')
            ->count();
        $this->assertSame(1, $claims);
    }

    public function test_injected_audit_or_mail_intent_failure_rolls_back_atomically(): void
    {
        $passenger = $this->passenger();
        $serviceId = $this->sampleServiceId();
        $command = $this->sampleCommand($serviceId, '9A');

        DB::unprepared("
            CREATE TRIGGER trg_fail_mail_intent_test BEFORE INSERT ON mvp_reservation_mail_intents
            FOR EACH ROW
            BEGIN
                IF NEW.recipient_email = 'fail@atomic.test' THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Simulated atomic rollback test';
                END IF;
            END;
        ");

        try {
            $command['contact']['email'] = 'fail@atomic.test';
            $response = $this->http('POST', '/reservations', $passenger, $command);
            $response->assertStatus(500);

            $this->assertFalse(DB::table('mvp_reservation_seat_claims')->where('service_id', $serviceId)->where('seat_code', '9A')->exists());
            $this->assertFalse(DB::table('mvp_reservations')->where('contact_email', 'fail@atomic.test')->exists());
            $this->assertFalse(DB::table('mvp_reservation_submissions')->where('submission_id', $command['submissionId'])->exists());
        } finally {
            DB::unprepared('DROP TRIGGER IF EXISTS trg_fail_mail_intent_test;');
        }
    }

    public function test_expiry_while_waiting_for_service_lock_returns_401(): void
    {
        if (getenv('REFERENCE_GATE_OWNED') !== '1') {
            $this->markTestSkipped('Worker lock expiry test requires REFERENCE_GATE_OWNED environment.');
        }

        $passenger = $this->passenger();
        $serviceId = $this->sampleServiceId('2026-12-29');
        $command = $this->sampleCommand($serviceId, '10A');

        DB::table('passenger_sessions')->where('id', $passenger['id'])->update([
            'absolute_expires_at' => DB::raw("DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 1500000 MICROSECOND)"),
            'idle_expires_at' => DB::raw("DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 1400000 MICROSECOND)"),
        ]);

        $db = DB::connection();
        $db->beginTransaction();
        $process = null;
        $pipes = [];

        try {
            $db->table('reference_revision_control')->where('domain', 'fleet')->lockForUpdate()->first();
            $process = proc_open(
                [PHP_BINARY, base_path('tests/Feature/MvpReservations/concurrency-worker.php')],
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
                'path' => '/reservations',
                'session' => $passenger,
                'body' => $command,
            ], JSON_THROW_ON_ERROR)."\n");
            fflush($pipes[0]);

            $this->assertSame('READY', $this->line($process, $pipes[1]));
            fwrite($pipes[0], "GO\n");
            fflush($pipes[0]);

            $deadline = microtime(true) + 1;
            do {
                $waiting = \Tests\Fixtures\MySqlLockObserver::waitingCount();
                if ($waiting > 0) {
                    break;
                }
                usleep(10000);
            } while (microtime(true) < $deadline);

            $this->assertGreaterThan(0, $waiting, 'Worker must reach lock before session expiry.');
            usleep(1700000);
            $db->commit();

            $this->assertSame('401', $this->line($process, $pipes[1]));
            $this->assertFalse(DB::table('mvp_reservation_seat_claims')->where('service_id', $serviceId)->where('seat_code', '10A')->exists());
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

    public function test_get_reservations_owner_pagination_and_isolation(): void
    {
        $userA = $this->passenger();
        $userB = $this->passenger();
        $serviceId = $this->sampleServiceId();

        $this->http('POST', '/reservations', $userA, $this->sampleCommand($serviceId, '11A'))->assertStatus(201);
        $this->http('POST', '/reservations', $userA, $this->sampleCommand($serviceId, '12A'))->assertStatus(201);

        $resA = $this->http('GET', '/reservations', $userA);
        $resA->assertStatus(200);
        $this->assertSame(2, $resA->json('data.pagination.total'));
        $this->assertCount(2, $resA->json('data.items'));

        $resB = $this->http('GET', '/reservations', $userB);
        $resB->assertStatus(200);
        $this->assertSame(0, $resB->json('data.pagination.total'));
        $this->assertEmpty($resB->json('data.items'));
    }

    public function test_get_reservation_by_ref_owner_and_bola(): void
    {
        $userA = $this->passenger();
        $userB = $this->passenger();
        $serviceId = $this->sampleServiceId();

        $create = $this->http('POST', '/reservations', $userA, $this->sampleCommand($serviceId, '13A'));
        $ref = $create->json('data.reservation.reference');

        $ownerRes = $this->http('GET', '/reservations/'.$ref, $userA);
        $ownerRes->assertStatus(200);
        $this->assertSame($ref, $ownerRes->json('data.reservation.reference'));

        $bolaRes = $this->http('GET', '/reservations/'.$ref, $userB);
        $bolaRes->assertStatus(404);
        $this->assertSame('not_found', $bolaRes->json('error.code'));
    }

    public function test_get_reservation_ticket_owner_and_bola(): void
    {
        $userA = $this->passenger();
        $userB = $this->passenger();
        $serviceId = $this->sampleServiceId();

        $create = $this->http('POST', '/reservations', $userA, $this->sampleCommand($serviceId, '14A'));
        $ref = $create->json('data.reservation.reference');

        $ticketRes = $this->http('GET', '/reservations/'.$ref.'/ticket', $userA);
        $ticketRes->assertStatus(200);
        $this->assertSame($ref, $ticketRes->json('data.reference'));
        $this->assertSame('confirmed', $ticketRes->json('data.status'));
        $this->assertNotEmpty($ticketRes->json('data.tickets'));

        $bolaRes = $this->http('GET', '/reservations/'.$ref.'/ticket', $userB);
        $bolaRes->assertStatus(404);
        $this->assertSame('not_found', $bolaRes->json('error.code'));
    }

    public function test_cancel_reservation_owner_and_noop_and_rebook(): void
    {
        $userA = $this->passenger();
        $userB = $this->passenger();
        $serviceId = $this->sampleServiceId();

        $create = $this->http('POST', '/reservations', $userA, $this->sampleCommand($serviceId, '15A'));
        $ref = $create->json('data.reservation.reference');

        $this->http('POST', '/reservations/'.$ref.'/cancel', $userB)->assertStatus(404);

        $cancelRes1 = $this->http('POST', '/reservations/'.$ref.'/cancel', $userA);
        $cancelRes1->assertStatus(200);
        $this->assertTrue($cancelRes1->json('data.changed'));
        $this->assertSame('cancelled', $cancelRes1->json('data.status'));

        $this->assertFalse(DB::table('mvp_reservation_seat_claims')->where('service_id', $serviceId)->where('seat_code', '15A')->exists());
        $this->assertTrue(DB::table('mvp_reservation_seat_claim_history')->where('service_id', $serviceId)->where('seat_code', '15A')->where('action', 'released')->exists());

        $cancelRes2 = $this->http('POST', '/reservations/'.$ref.'/cancel', $userA);
        $cancelRes2->assertStatus(200);
        $this->assertFalse($cancelRes2->json('data.changed'));

        $rebook = $this->http('POST', '/reservations', $userB, $this->sampleCommand($serviceId, '15A'));
        $rebook->assertStatus(201);
        $this->assertSame('15A', $rebook->json('data.reservation.passengers.0.seatCode'));
    }

    public function test_admin_reservations_operations(): void
    {
        $staff = $this->staff();
        $passenger = $this->passenger();
        $serviceId = $this->sampleServiceId();

        $create = $this->http('POST', '/reservations', $passenger, $this->sampleCommand($serviceId, '16A'));
        $ref = $create->json('data.reservation.reference');

        $adminList = $this->http('GET', '/admin/reservations', $staff, null, [], null, 'gza_staff_session');
        $adminList->assertStatus(200);
        $this->assertGreaterThanOrEqual(1, $adminList->json('data.pagination.total'));

        $adminDetail = $this->http('GET', '/admin/reservations/'.$ref, $staff, null, [], null, 'gza_staff_session');
        $adminDetail->assertStatus(200);
        $this->assertSame($ref, $adminDetail->json('data.reservation.reference'));
        $this->assertNotEmpty($adminDetail->json('data.reservation.audits'));

        $adminCancel = $this->http('POST', '/admin/reservations/'.$ref.'/cancel', $staff, null, [], null, 'gza_staff_session');
        $adminCancel->assertStatus(200);
        $this->assertTrue($adminCancel->json('data.changed'));
        $this->assertSame('cancelled', $adminCancel->json('data.status'));

        $adminCancelNoop = $this->http('POST', '/admin/reservations/'.$ref.'/cancel', $staff, null, [], null, 'gza_staff_session');
        $adminCancelNoop->assertStatus(200);
        $this->assertFalse($adminCancelNoop->json('data.changed'));
    }

    public function test_auth_and_permission_negatives(): void
    {
        $passenger = $this->passenger();
        $staff = $this->staff('editor');
        $serviceId = $this->sampleServiceId();

        $this->http('POST', '/reservations', [])->assertStatus(401);
        $this->http('GET', '/reservations', [])->assertStatus(401);
        $this->http('GET', '/reservations/GZA-NONE', [])->assertStatus(401);
        $this->http('POST', '/reservations/GZA-NONE/cancel', [])->assertStatus(401);
        $this->http('GET', '/reservations/GZA-NONE/ticket', [])->assertStatus(401);

        $this->http('GET', '/admin/reservations', [])->assertStatus(401);
        $this->http('GET', '/admin/reservations/GZA-NONE', [])->assertStatus(401);
        $this->http('POST', '/admin/reservations/GZA-NONE/cancel', [])->assertStatus(401);

        $this->http('GET', '/admin/reservations', $passenger)->assertStatus(401);
        $this->http('POST', '/reservations', $staff, $this->sampleCommand($serviceId, '17A'))->assertStatus(401);

        $this->http('GET', '/admin/reservations', $staff, null, [], null, 'gza_staff_session')->assertStatus(403);
        $this->http('GET', '/admin/reservations/GZA-NONE', $staff, null, [], null, 'gza_staff_session')->assertStatus(403);
        $this->http('POST', '/admin/reservations/GZA-NONE/cancel', $staff, null, [], null, 'gza_staff_session')->assertStatus(403);

        $unverified = $this->passenger('active', false);
        $this->http('POST', '/reservations', $unverified, $this->sampleCommand($serviceId, '17A'))->assertStatus(401);
    }

    public function test_protocol_and_validation_negatives(): void
    {
        $passenger = $this->passenger();
        $serviceId = $this->sampleServiceId();
        $command = $this->sampleCommand($serviceId, '18A');

        $this->http('POST', '/reservations', $passenger, $command, ['HTTPS' => 'off'])->assertStatus(403);
        $this->http('GET', '/reservations', $passenger, null, ['HTTPS' => 'off'])->assertStatus(403);
        $this->http('GET', '/reservations/GZA-NONE', $passenger, null, ['HTTPS' => 'off'])->assertStatus(403);
        $this->http('POST', '/reservations/GZA-NONE/cancel', $passenger, null, ['HTTPS' => 'off'])->assertStatus(403);
        $this->http('GET', '/reservations/GZA-NONE/ticket', $passenger, null, ['HTTPS' => 'off'])->assertStatus(403);

        $this->http('POST', '/reservations', $passenger, $command, ['HTTP_ORIGIN' => 'https://evil.example.test'])->assertStatus(403);
        $this->http('POST', '/reservations', $passenger, $command, ['HTTP_X_CSRF_TOKEN' => ''])->assertStatus(403);
        $this->http('POST', '/reservations', $passenger, $command, ['HTTP_X_CSRF_TOKEN' => 'wrong-csrf-token'])->assertStatus(403);

        $this->http('POST', '/reservations', $passenger, $command, ['CONTENT_TYPE' => 'text/plain'])->assertStatus(415);

        $this->http('POST', '/reservations', $passenger, null, [], str_repeat('A', 33000))->assertStatus(422);

        $this->http('POST', '/reservations', $passenger, null, [], 'not-a-valid-json')->assertStatus(422);

        $pastCmd = $this->sampleCommand($this->sampleServiceId('2020-01-01'), '18A');
        $this->http('POST', '/reservations', $passenger, $pastCmd)->assertStatus(422);

        $badSeatCmd = $this->sampleCommand($serviceId, '99Z');
        $this->http('POST', '/reservations', $passenger, $badSeatCmd)->assertStatus(422);

        $badMealCmd = $this->sampleCommand($serviceId, '18A', 'non-existent-meal');
        $this->http('POST', '/reservations', $passenger, $badMealCmd)->assertStatus(422);

        $this->http('POST', '/reservations', $passenger, $command, ['HTTP_HOST' => 'untrusted.invalid'])->assertStatus(400);
        $this->http('GET', '/offerings/invalid-service/seats')->assertStatus(400);
        $this->http('GET', '/reservations?page=0', $passenger)->assertStatus(400);
        $this->http('GET', '/reservations/INVALID*REF*LONG', $passenger)->assertStatus(400);
        $this->http('POST', '/reservations/INVALID*REF*LONG/cancel', $passenger)->assertStatus(400);
        $this->http('GET', '/reservations/INVALID*REF*LONG/ticket', $passenger)->assertStatus(400);

        $staff = $this->staff();
        $this->http('GET', '/admin/reservations?page=-1', $staff, null, [], null, 'gza_staff_session')->assertStatus(400);
        $this->http('GET', '/admin/reservations/INVALID*REF*LONG', $staff, null, [], null, 'gza_staff_session')->assertStatus(400);
        $this->http('POST', '/admin/reservations/INVALID*REF*LONG/cancel', $staff, null, [], null, 'gza_staff_session')->assertStatus(400);
    }

    public function test_not_found_negatives(): void
    {
        $passenger = $this->passenger();
        $staff = $this->staff();

        $missingService = 'svc1-'.rtrim(strtr(base64_encode('missing-svc'), '+/', '-_'), '=').'-2026-12-30';

        $this->http('GET', '/offerings/'.$missingService.'/seats')->assertStatus(404);

        $missingCmd = $this->sampleCommand($missingService, '19A');
        $this->http('POST', '/reservations', $passenger, $missingCmd)->assertStatus(404);

        $this->http('GET', '/admin/reservations/GZA-NONE', $staff, null, [], null, 'gza_staff_session')->assertStatus(404);
        $this->http('POST', '/admin/reservations/GZA-NONE/cancel', $staff, null, [], null, 'gza_staff_session')->assertStatus(404);
    }

    public function test_review_reservation_limits_real_identity_and_shared_ip(): void
    {
        $before = DB::table('mvp_reservations')->count();
        $a = $this->passenger(); $b = $this->passenger(); $service = $this->sampleServiceId();
        for ($i = 0; $i < 20; $i++) $this->http('POST', '/reservations', $a, [])->assertStatus(422);
        $this->http('POST', '/reservations', $a, [])->assertStatus(429)->assertHeader('Retry-After');
        $this->http('POST', '/reservations', $b, [], ['REMOTE_ADDR' => '2001:db8:feed::1'])->assertStatus(422);
        $c = $this->passenger(); $d = $this->passenger(); $shared = ['REMOTE_ADDR' => '2001:db8:feed::2'];
        for ($i = 0; $i < 15; $i++) {
            $this->http('POST', '/reservations', $c, [], $shared)->assertStatus(422);
            $this->http('POST', '/reservations', $d, [], $shared)->assertStatus(422);
        }
        $this->http('POST', '/reservations', $d, [], $shared)->assertStatus(429)->assertHeader('Retry-After');
        $publicIp = ['REMOTE_ADDR' => '2001:db8:feed::3'];
        for ($i = 0; $i < 60; $i++) $this->http('GET', '/offerings/'.$service.'/seats', [], null, $publicIp)->assertStatus(200);
        $this->http('GET', '/offerings/'.$service.'/seats', [], null, $publicIp)->assertStatus(429)->assertHeader('Retry-After');
        $this->http('GET', '/offerings/'.$service.'/seats')->assertStatus(200);
        $this->assertSame($before, DB::table('mvp_reservations')->count());
    }

    public function test_rate_limit_actual_negative_matrix_for_all_private_routes(): void
    {
        $owner=$this->passenger();$staff=$this->staff();
        $ip=['REMOTE_ADDR'=>'2001:db8:feed::10'];
        for($i=0;$i<120;$i++) $this->http('GET','/reservations',$owner,null,$ip)->assertStatus(200);
        foreach(['/reservations','/reservations/GZA-NONE','/reservations/GZA-NONE/ticket'] as $path)
            $this->http('GET',$path,$owner,null,$ip)->assertStatus(429)->assertHeader('Retry-After');
        $ip=['REMOTE_ADDR'=>'2001:db8:feed::11'];
        for($i=0;$i<120;$i++) $this->http('GET','/admin/reservations',$staff,null,$ip,null,'gza_staff_session')->assertStatus(200);
        foreach(['/admin/reservations','/admin/reservations/GZA-NONE'] as $path)
            $this->http('GET',$path,$staff,null,$ip,null,'gza_staff_session')->assertStatus(429)->assertHeader('Retry-After');
        $ip=['REMOTE_ADDR'=>'2001:db8:feed::12'];
        for($i=0;$i<20;$i++) $this->http('POST','/reservations',$owner,[],$ip)->assertStatus(422);
        $this->http('POST','/reservations/GZA-NONE/cancel',$owner,[],$ip)->assertStatus(429)->assertHeader('Retry-After');
        $ip=['REMOTE_ADDR'=>'2001:db8:feed::13'];
        for($i=0;$i<20;$i++) $this->http('POST','/admin/reservations/GZA-NONE/cancel',$staff,[],$ip,null,'gza_staff_session')->assertStatus(404);
        $this->http('POST','/admin/reservations/GZA-NONE/cancel',$staff,[],$ip,null,'gza_staff_session')->assertStatus(429)->assertHeader('Retry-After');
    }

    public function test_review_replay_after_cancel_returns_cancelled_and_no_new_claim(): void
    {
        $user = $this->passenger(); $cmd = $this->sampleCommand($this->sampleServiceId(), '20A');
        $first = $this->http('POST', '/reservations', $user, $cmd)->assertStatus(201);
        $ref = $first->json('data.reservation.reference');
        $this->http('POST', '/reservations/'.$ref.'/cancel', $user)->assertStatus(200);
        $this->http('POST', '/reservations', $user, $cmd)->assertStatus(200)
            ->assertJsonPath('data.reservation.status', 'cancelled')->assertJsonPath('data.ticket.status', 'cancelled')
            ->assertJsonPath('data.reservation.reference', $ref);
        $this->assertSame(1, DB::table('mvp_reservations')->where('reference', $ref)->count());
        $this->assertSame(0, DB::table('mvp_reservation_seat_claims')->where('reservation_id', $first->json('data.reservation.id'))->count());
    }

    public function test_service_unavailable_503(): void
    {
        $passenger = $this->passenger();
        $staff = $this->staff();
        $serviceId = $this->sampleServiceId('2026-12-31');

        $failAuthority = new class implements \App\Mvp\Reservations\ReservationOfferingAuthority {
            public function resolve(string $serviceId): array {
                throw new ReservationAuthorityUnavailableException('Simulated outage.');
            }
        };
        app()->instance(\App\Mvp\Reservations\ReservationOfferingAuthority::class, $failAuthority);

        $this->http('GET', '/offerings/'.$serviceId.'/seats')->assertStatus(503);
        $this->http('POST', '/reservations', $passenger, $this->sampleCommand($serviceId, '21A'))->assertStatus(503);

        app()->forgetInstance(\App\Mvp\Reservations\ReservationOfferingAuthority::class);

        DB::statement('ALTER TABLE cache RENAME TO reservations_test_unavailable_cache');
        try {
            $cases = [
                ['GET', '/reservations', $passenger, null, 'gza_session'],
                ['GET', '/reservations/GZA-TEST', $passenger, null, 'gza_session'],
                ['POST', '/reservations/GZA-TEST/cancel', $passenger, null, 'gza_session'],
                ['GET', '/reservations/GZA-TEST/ticket', $passenger, null, 'gza_session'],
                ['GET', '/admin/reservations', $staff, null, 'gza_staff_session'],
                ['GET', '/admin/reservations/GZA-TEST', $staff, null, 'gza_staff_session'],
                ['POST', '/admin/reservations/GZA-TEST/cancel', $staff, null, 'gza_staff_session'],
            ];

            foreach ($cases as [$method, $path, $session, $body, $cookieName]) {
                $this->http($method, $path, $session, $body, [], null, $cookieName)->assertStatus(503);
            }
        } finally {
            DB::statement('ALTER TABLE reservations_test_unavailable_cache RENAME TO cache');
        }
    }

    public function test_direct_sql_constraints_and_foreign_keys(): void
    {
        $userId = (string) Str::uuid();
        $serviceId = $this->sampleServiceId();
        $resId = (string) Str::uuid();

        $this->expectException(QueryException::class);
        DB::table('mvp_reservations')->insert([
            'id' => $resId,
            'reference' => 'GZA-SQL1',
            'owner_user_id' => $userId,
            'service_id' => $serviceId,
            'status' => 'confirmed',
            'contact_email' => 'test@example.test',
            'contact_phone' => '+970123',
            'passenger_count' => 1,
            'flight_snapshot' => '{}',
            'ticket_snapshot' => '{}',
        ]);
    }

    public function test_idempotent_replay_survives_reference_retirement(): void
    {
        $passenger = $this->passenger();
        $command = $this->sampleCommand($this->sampleServiceId('2026-12-27'), '22A');
        $first = $this->http('POST', '/reservations', $passenger, $command)->assertStatus(201);
        DB::table('schedules')->where('id', 'curated-flight')->update(['active' => false]);
        $replay = $this->http('POST', '/reservations', $passenger, $command)->assertStatus(200);
        $this->assertSame(200, $replay->status());
        $this->assertSame($first->json('data.reservation.reference'), $replay->json('data.reservation.reference'));
        $this->assertSame(1, DB::table('mvp_reservation_mail_intents')->where('reservation_id', $first->json('data.reservation.id'))->count());
    }

    public function test_historical_paid_guest_and_checkin_routes_are_absent(): void
    {
        foreach (['POST /bookings', 'POST /payments/intents', 'POST /payments/webhook', 'POST /check-in',
            'POST /bookings/GZA-NONE/challenge', 'POST /bookings/GZA-NONE/verify-challenge',
            'POST /bookings/GZA-NONE/claim-challenge', 'POST /bookings/GZA-NONE/verify-claim-challenge'] as $route) {
            [$method, $path] = explode(' ', $route, 2);
            $routeUris = array_map(static fn($route) => $route->uri(), app('router')->getRoutes()->getRoutes());
            $this->assertNotContains('api/v1/bookings/{ref}/challenge', $routeUris);
            $this->assertNotContains('api/v1/bookings/{ref}/verify-challenge', $routeUris);
            $this->assertNotContains('api/v1/bookings/{ref}/claim-challenge', $routeUris);
            $this->assertNotContains('api/v1/bookings/{ref}/verify-claim-challenge', $routeUris);
            $this->http($method, $path, [], [])->assertStatus(str_starts_with($path, '/bookings/GZA-') ? 403 : 404);
        }
    }

    private function race(array $inputs): array
    {
        $children = [];
        try {
            foreach ($inputs as $input) {
                $pipes = [];
                $process = proc_open(
                    [PHP_BINARY, base_path('tests/Feature/MvpReservations/concurrency-worker.php')],
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

    private function mailConfig(array $staff, array $patch = []): array
    {
        app(\App\Mvp\Mail\BookingMailWorker::class)->adoptIntents();
        DB::table('mvp_mail_messages')->whereIn('status',['pending','failed'])->update(['status'=>'cancelled']);
        $revision = app(\App\Mvp\Mail\MailSettings::class)->read()['revision'];
        return array_replace(['expectedRevision'=>$revision,'driver'=>'capture','host'=>'mailpit','port'=>1025,'tls'=>'none',
            'senderName'=>'Gaza Gateway','senderEmail'=>'tickets@example.test','replyTo'=>'','username'=>'fixture-user','password'=>'secret-mail-sentinel'], $patch);
    }

    public function test_mail_settings_authority_encryption_csrf_and_closed_fields(): void
    {
        $admin = $this->staff(); $editor = $this->staff('editor');
        $path = '/admin/settings/email'; $body = $this->mailConfig($admin);
        $this->http('GET',$path)->assertStatus(401);
        $this->http('PUT',$path,$editor,$body,[],null,'gza_staff_session')->assertStatus(403);
        $this->http('PUT',$path,$admin,$body,['HTTP_X_CSRF_TOKEN'=>'wrong'],null,'gza_staff_session')->assertStatus(403);
        $response = $this->http('PUT',$path,$admin,$body,[],null,'gza_staff_session')->assertStatus(200);
        $this->assertTrue($response->json('data.passwordSet'));
        $this->assertStringNotContainsString('secret-mail-sentinel',$response->getContent());
        $stored = DB::table('mvp_mail_settings')->where('id',1)->value('encrypted_config');
        $this->assertStringNotContainsString('secret-mail-sentinel',$stored);
        $this->assertStringContainsString('secret-mail-sentinel',\Illuminate\Support\Facades\Crypt::decryptString($stored));
        $this->http('PUT',$path,$admin,$body,[],null,'gza_staff_session')->assertStatus(409);
        $bad = $this->mailConfig($admin,['driver'=>'smtp','host'=>'169.254.169.254']);
        $this->http('PUT',$path,$admin,$bad,[],null,'gza_staff_session')->assertStatus(422);
        $this->http('PUT',$path,$admin,$this->mailConfig($admin,['script'=>'bad']),[],null,'gza_staff_session')->assertStatus(422);
    }

    public function test_mail_booking_capture_retry_and_owner_resend(): void
    {
        $admin = $this->staff(); $owner = $this->passenger(); $foreign = $this->passenger();
        app(\App\Mvp\Mail\MailSettings::class)->save($this->mailConfig($admin),$admin['owner']);
        // Prior test messages do not influence this isolated scenario.
        DB::table('mvp_mail_messages')->whereIn('status',['pending','failed'])->update(['status'=>'cancelled']);
        $create = $this->http('POST','/reservations',$owner,$this->sampleCommand($this->sampleServiceId('2026-12-28'),'2A','meal-standard'))->assertStatus(201);
        $ref = $create->json('data.reservation.reference');
        $worker = app(\App\Mvp\Mail\BookingMailWorker::class);
        $worker->adoptIntents($create->json('data.reservation.id'));
        $message = DB::table('mvp_mail_messages')->where('reservation_id',$create->json('data.reservation.id'))->first();
        // A real file-system failure is safely retryable; booking remains confirmed.
        config(['mvp-mail.capture_path'=>'/proc/gaza-mail-unwritable']);
        $this->assertTrue($worker->runOne());
        $this->assertSame('failed',DB::table('mvp_mail_messages')->where('id',$message->id)->value('status'));
        $root = '/tmp/booking-mail-'.Str::uuid(); config(['mvp-mail.capture_path'=>$root]);
        DB::table('mvp_mail_messages')->where('id',$message->id)->update(['next_attempt_at'=>DB::raw('UTC_TIMESTAMP(6)')]);
        $this->assertTrue($worker->runOne());
        $this->assertSame('captured_locally',DB::table('mvp_mail_messages')->where('id',$message->id)->value('status'));
        $this->assertSame(2,DB::table('mvp_mail_attempts')->where('message_id',$message->id)->count());
        $files = glob($root.'/*.eml'); $this->assertCount(1,$files);
        $bytes = file_get_contents($files[0]);
        $this->assertStringContainsString('multipart/alternative',$bytes);
        $this->assertStringContainsString('dir=3D"rtl"',$bytes);
        $this->assertStringContainsString($ref,$bytes);
        $this->assertStringNotContainsString('DOC-123456',$bytes);
        $this->assertFalse($worker->runOne());
        $this->http('GET','/reservations/'.$ref.'/email',$foreign)->assertStatus(404);
        $this->http('GET','/reservations/'.$ref.'/email',$owner)->assertStatus(200)->assertJsonPath('data.status','captured_locally');
        $resend = ['requestId'=>(string)Str::uuid()];
        $this->http('POST','/reservations/'.$ref.'/email/resend',$owner,$resend)->assertStatus(200)->assertJsonPath('data.generation',2);
        $this->http('POST','/reservations/'.$ref.'/email/resend',$owner,$resend)->assertStatus(200)->assertJsonPath('data.generation',2);
        $this->assertTrue($worker->runOne());
        $this->assertCount(2,glob($root.'/*.eml'));
        $this->http('POST','/reservations/'.$ref.'/cancel',$owner,[])->assertStatus(200);
        $this->http('POST','/reservations/'.$ref.'/email/resend',$owner,['requestId'=>(string)Str::uuid()])->assertStatus(409);
        foreach (glob($root.'/*.eml') as $file) { touch($file,time()-90000); }
        $this->assertSame(2,$worker->purgeCaptures()); rmdir($root);
    }

    public function test_mail_expired_lease_is_uncertain_and_outer_transaction_cannot_dispatch(): void
    {
        $admin = $this->staff(); $worker = app(\App\Mvp\Mail\BookingMailWorker::class);
        app(\App\Mvp\Mail\MailSettings::class)->save($this->mailConfig($admin),$admin['owner']);
        $queued = $worker->queueTest('mail-test@example.test'); $lease = (string)Str::uuid();
        DB::table('mvp_mail_messages')->where('id',$queued['id'])->update(['status'=>'processing','attempts'=>1,'lease_id'=>$lease,'lease_until'=>DB::raw("UTC_TIMESTAMP(6) - INTERVAL 1 MINUTE")]);
        DB::table('mvp_mail_attempts')->insert(['id'=>$lease,'message_id'=>$queued['id'],'generation'=>1,'attempt'=>1,'settings_revision'=>1,'outcome'=>'processing']);
        $worker->runOne();
        $this->assertSame('uncertain',DB::table('mvp_mail_messages')->where('id',$queued['id'])->value('status'));
        $this->assertSame('uncertain',DB::table('mvp_mail_attempts')->where('id',$lease)->value('outcome'));
        DB::beginTransaction();
        try { $worker->runOne(); $this->fail('Uncommitted dispatch must fail.'); }
        catch (\LogicException) { $this->assertTrue(true); }
        finally { DB::rollBack(); }
    }


    public function test_mail_http_contract_matrix_and_principal_budget(): void
    {
        $admin = $this->staff(); $owner = $this->passenger();
        $this->http('GET','/admin/settings/email',$admin,null,[],null,'gza_staff_session')->assertStatus(200);
        $this->http('PUT','/admin/settings/email',$admin,$this->mailConfig($admin),[],null,'gza_staff_session')->assertStatus(200);
        $this->http('POST','/admin/settings/email/test',$admin,['recipient'=>'sink@example.test'],[],null,'gza_staff_session')->assertStatus(202);
        $root = '/tmp/booking-mail-'.Str::uuid(); config(['mvp-mail.capture_path'=>$root]);
        $created = $this->http('POST','/reservations',$owner,$this->sampleCommand($this->sampleServiceId('2026-12-29'),'3A'))->assertStatus(201);
        $ref = $created->json('data.reservation.reference'); $worker = app(\App\Mvp\Mail\BookingMailWorker::class);
        for ($i = 0; $i < 10 && $worker->runOne(); $i++) {}
        $this->http('GET','/admin/mail/messages',$admin,null,[],null,'gza_staff_session')->assertStatus(200);
        $this->http('GET','/reservations/'.$ref.'/email',$owner)->assertStatus(200)->assertJsonPath('data.status','captured_locally');
        $this->http('POST','/admin/reservations/'.$ref.'/email/resend',$admin,['requestId'=>(string)Str::uuid()],[],null,'gza_staff_session')->assertStatus(200);
        $this->assertTrue($worker->runOne());
        $this->http('POST','/reservations/'.$ref.'/email/resend',$owner,['requestId'=>(string)Str::uuid()])->assertStatus(200);
        $this->http('POST','/admin/settings/email/test',$admin,['recipient'=>'sink@example.test'],[],null,'gza_staff_session')->assertStatus(202);
        $this->http('POST','/admin/settings/email/test',$admin,['recipient'=>'sink@example.test'],[],null,'gza_staff_session')->assertStatus(429)->assertHeader('Retry-After');
        foreach (glob($root.'/*.eml') as $file) unlink($file); rmdir($root);
    }


    public function test_site_contact_anonymous_replay_and_server_inbox_workflow(): void
    {
        $anon = app(PassengerSessionStore::class)->issueAnonymous();
        $session=['cookie'=>$anon->getRawToken(),'csrf'=>$anon->getCsrfToken()]; $admin=$this->staff();
        $body=['submissionId'=>(string)Str::uuid(),'senderName'=>'Synthetic Visitor','email'=>'visitor@example.test','topic'=>'booking','message'=>'A synthetic contact enquiry.','language'=>'en','bookingRef'=>'GZA-TEST123'];
        $this->http('POST','/contact',[],$body)->assertStatus(403);
        $this->http('POST','/contact',$session,$body,['HTTP_ORIGIN'=>'https://hostile.invalid'])->assertStatus(403);
        $response=$this->http('POST','/contact',$session,$body)->assertStatus(202); $id=$response->json('data.id');
        $this->assertSame(['id','createdAt','status'],array_keys($response->json('data')));
        $this->assertStringNotContainsString('visitor@example.test',$response->getContent());
        $this->http('POST','/contact',$session,$body)->assertStatus(202)->assertJsonPath('data.id',$id);
        $this->http('POST','/contact',$session,[...$body,'message'=>'Conflicting synthetic contact message.'])->assertStatus(409);
        $this->assertSame(1,DB::table('contact_messages')->where('submission_id',$body['submissionId'])->count());
        $base='/admin/contact/inbox';
        $this->http('GET',$base)->assertStatus(401);
        $this->http('GET',$base,$admin,null,[],null,'gza_staff_session')->assertStatus(200)->assertJsonPath('data.countNew',1);
        $this->http('PATCH',$base.'/'.$id.'/status',$admin,['status'=>'open'],[],null,'gza_staff_session')->assertStatus(200)->assertJsonPath('data.changed',true);
        $this->http('PATCH',$base.'/'.$id.'/status',$admin,['status'=>'open'],[],null,'gza_staff_session')->assertStatus(200)->assertJsonPath('data.changed',false);
        $this->http('PATCH',$base.'/'.$id.'/assign',$admin,['staffId'=>$admin['owner']],[],null,'gza_staff_session')->assertStatus(200);
        $this->http('POST',$base.'/'.$id.'/notes',$admin,['body'=>'Private staff note','staffId'=>$admin['owner']],[],null,'gza_staff_session')->assertStatus(422);
        $this->http('POST',$base.'/'.$id.'/notes',$admin,['body'=>'Private staff note'],[],null,'gza_staff_session')->assertStatus(200);
        $this->assertSame($admin['owner'],DB::table('contact_notes')->where('message_id',$id)->value('staff_id'));
        $this->http('PUT',$base.'/'.$id.'/reply-draft',$admin,['replyDraft'=>'Saved draft, not sent.'],[],null,'gza_staff_session')->assertStatus(200);
        $this->http('GET',$base.'/'.$id,$admin,null,[],null,'gza_staff_session')->assertStatus(200)->assertJsonPath('data.replyDraft','Saved draft, not sent.');
        $this->assertSame(4,DB::table('contact_audits')->where('message_id',$id)->count());
    }

    public function test_site_contact_settings_draft_publish_and_immutable_revisions(): void
    {
        $admin=$this->staff(); $editor=$this->staff('editor'); $path='/admin/settings/contact';
        $payload=['phone'=>'+970 599 123456','email'=>'contact@example.test','addressEn'=>'Synthetic address','addressAr'=>'Synthetic fixture',
            'socialInstagram'=>'','socialX'=>'','socialFacebook'=>'','socialYouTube'=>'https://www.youtube.com/@synthetic'];
        $this->http('GET','/site/contact')->assertStatus(404);
        $this->http('GET',$path,$admin,null,[],null,'gza_staff_session')->assertStatus(200);
        $this->http('GET',$path,$editor,null,[],null,'gza_staff_session')->assertStatus(403);
        $this->http('PUT',$path.'/draft',$admin,['expectedRevision'=>0,'payload'=>$payload],[],null,'gza_staff_session')->assertStatus(200)->assertJsonPath('data.revision',1);
        $this->http('GET','/site/contact')->assertStatus(404);
        $this->http('POST',$path.'/publish',$admin,['expectedRevision'=>0],[],null,'gza_staff_session')->assertStatus(409);
        $this->http('POST',$path.'/publish',$admin,['expectedRevision'=>1],[],null,'gza_staff_session')->assertStatus(200)->assertJsonPath('data.publishedRevision',2);
        $this->http('GET','/site/contact')->assertStatus(200)->assertJsonPath('data.payload.socialYouTube',$payload['socialYouTube']);
        $this->http('PUT',$path.'/draft',$admin,['expectedRevision'=>2,'payload'=>[...$payload,'script'=>'bad']],[],null,'gza_staff_session')->assertStatus(422);
        $this->http('PUT',$path.'/draft',$admin,['expectedRevision'=>2,'payload'=>[...$payload,'socialYouTube'=>'javascript:alert(1)']],[],null,'gza_staff_session')->assertStatus(422);
        $this->http('PUT',$path.'/draft',$admin,['expectedRevision'=>2,'payload'=>[...$payload,'addressEn'=>'Changed draft']],[],null,'gza_staff_session')->assertStatus(200);
        $this->http('GET','/site/contact')->assertStatus(200)->assertJsonPath('data.payload.addressEn','Synthetic address');
        $this->http('POST',$path.'/discard',$admin,['expectedRevision'=>3],[],null,'gza_staff_session')->assertStatus(200)->assertJsonPath('data.revision',4);
        try { DB::table('mvp_site_revisions')->where('slug','contact')->update(['payload'=>'{}']); $this->fail('Published revisions must be immutable.'); }
        catch (QueryException) { $this->assertTrue(true); }
        $this->assertSame(1,DB::table('mvp_site_revisions')->where('slug','contact')->count());
    }

}
