<?php

declare(strict_types=1);

namespace Tests\SharedHostingMail;

use App\Identity\Dispatch\OutboxPayload;
use App\Identity\Mfa\TotpSecret;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Proofs\ProofPurpose;
use App\Mvp\Mail\MailSettings;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

abstract class SharedHostingMailTestCase extends BaseTestCase
{
    private static ?string $staffHash = null;
    private static ?string $passengerHash = null;
    private static bool $schemaInitialized = false;

    public function createApplication()
    {
        $disposableKey = 'base64:' . base64_encode('01234567890123456789012345678901');
        putenv("APP_KEY={$disposableKey}");
        $_ENV['APP_KEY'] = $disposableKey;
        $_SERVER['APP_KEY'] = $disposableKey;

        putenv('APP_URL=https://127.0.0.1:18090');
        $_ENV['APP_URL'] = 'https://127.0.0.1:18090';
        $_SERVER['APP_URL'] = 'https://127.0.0.1:18090';

        putenv('DB_CONNECTION=mysql_test');
        $_ENV['DB_CONNECTION'] = 'mysql_test';
        $_SERVER['DB_CONNECTION'] = 'mysql_test';

        putenv('DB_HOST=mysql');
        $_ENV['DB_HOST'] = 'mysql';
        $_SERVER['DB_HOST'] = 'mysql';

        putenv('DB_PORT=3306');
        $_ENV['DB_PORT'] = '3306';
        $_SERVER['DB_PORT'] = '3306';

        putenv('DB_TEST_DATABASE=gaza_gateway_mysql_test');
        $_ENV['DB_TEST_DATABASE'] = 'gaza_gateway_mysql_test';
        $_SERVER['DB_TEST_DATABASE'] = 'gaza_gateway_mysql_test';

        putenv('DB_USERNAME=gaza_app_user');
        $_ENV['DB_USERNAME'] = 'gaza_app_user';
        $_SERVER['DB_USERNAME'] = 'gaza_app_user';

        putenv('DB_PASSWORD=gaza_app_local_pass');
        $_ENV['DB_PASSWORD'] = 'gaza_app_local_pass';
        $_SERVER['DB_PASSWORD'] = 'gaza_app_local_pass';

        $app = require __DIR__ . '/../../bootstrap/app.php';
        $app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

        return $app;
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertDisposableMySqlDatabaseTarget();
        $this->ensureTestMailSchema();

        config([
            'mvp-mail.enabled' => true,
            'mvp-mail.identity_smtp_enabled' => true,
            'mvp-mail.allowed_hosts' => ['127.0.0.1', 'localhost', 'mailpit', 'mail.gazaairport.com'],
        ]);

        // Clean prior test records for deterministic test isolation
        DB::table('security_dispatch_outbox')->whereIn('status', ['queued', 'failed'])->update([
            'status' => 'expired',
            'encrypted_payload' => null,
        ]);
        DB::table('security_smtp_attempts')->delete();
        DB::table('mvp_mail_attempts')->delete();
        DB::table('mvp_mail_messages')->delete();
        DB::table('mvp_mail_settings')->delete();
        DB::table('mvp_reservation_mail_intents')->delete();
        DB::table('mvp_reservations')->delete();

        $root = sys_get_temp_dir() . '/shared-hosting-mail-sink';
        if (is_dir($root)) {
            foreach (glob($root . '/*.eml') ?: [] as $file) {
                @unlink($file);
            }
        }
    }

    final protected function assertDisposableMySqlDatabaseTarget(): void
    {
        if (getenv('APP_ENV') !== 'testing' || !$this->app->environment('testing')) {
            throw new \RuntimeException('SharedHostingMail test requires testing environment.');
        }

        $defaultConn = config('database.default');
        if ($defaultConn !== 'mysql_test') {
            throw new \RuntimeException(
                "SharedHostingMail test default connection must be [mysql_test], got: [{$defaultConn}]"
            );
        }

        $connection = DB::connection('mysql_test');
        $liveTarget = $connection->selectOne('SELECT DATABASE() AS database_name');
        if ($connection->getName() !== 'mysql_test'
            || $connection->getDriverName() !== 'mysql'
            || ($liveTarget->database_name ?? null) !== 'gaza_gateway_mysql_test') {
            throw new \RuntimeException('Fixture admission rejected the live MySQL database target.');
        }
    }

    /**
     * Require genuine application migrations; this mail-only gate does not certify UI or external delivery.
     */
    private function ensureTestMailSchema(): void
    {
        if (self::$schemaInitialized) {
            return;
        }

        if (DB::table('migrations')->count() !== 18) { throw new \LogicException('Mail gate requires the genuine full application schema.'); }
        self::$schemaInitialized = true;
    }

    /** Structurally genuine synthetic reservation for mail-only security probes. */
    protected function createMailReservation(string $id, string $reference): void
    {
        $this->assertDisposableMySqlDatabaseTarget();
        $owner = $this->createPassengerUser();
        $aircraftId = 'mail-' . bin2hex(random_bytes(6));
        $scheduleId = 'mail-schedule-' . bin2hex(random_bytes(6));
        $serviceId = 'mail-service-' . bin2hex(random_bytes(6));
        $layout = \App\Reference\Fleet\FleetCoordinator::defaultLayout();
        foreach (['GZA', 'AMM'] as $code) {
            if (!DB::table('airports')->where('code', $code)->exists()) {
                DB::table('airports')->insert(['code' => $code, 'airport_name_en' => 'Synthetic mail airport',
                    'airport_name_ar' => 'Synthetic mail airport', 'city_en' => 'Synthetic', 'city_ar' => 'Synthetic',
                    'country_en' => 'Synthetic', 'country_ar' => 'Synthetic', 'timezone' => 'Asia/Gaza', 'block_minutes' => 60, 'active' => true]);
            }
        }
        DB::table('aircraft')->insert(['id' => $aircraftId, 'model' => 'Synthetic mail aircraft',
            'registration_normalized' => 'T-' . strtoupper(bin2hex(random_bytes(2))), 'active' => true,
            'rows' => $layout['rows'], 'aisle_after' => $layout['aisleAfter'], 'letters_json' => json_encode($layout['letters']),
            'zones_json' => json_encode($layout['zones']), 'extra_legroom_rows_json' => '[]', 'unavailable_json' => '[]']);
        DB::table('schedules')->insert(['id' => $scheduleId, 'number' => 'PS204', 'direction' => 'out', 'destination' => 'AMM',
            'days_json' => '[0,1,2,3,4,5,6]', 'depart_time' => '10:00', 'arrive_time' => '11:00',
            'aircraft' => 'Synthetic mail aircraft', 'aircraft_id' => $aircraftId,
            'from_date' => '2026-01-01', 'until_date' => '2027-12-31', 'active' => true, 'exceptions_json' => '[]']);
        DB::table('mvp_services')->insert(['id' => $serviceId, 'schedule_id' => $scheduleId, 'service_date' => '2026-10-15',
            'flight_number' => 'PS204', 'direction' => 'out', 'origin_code' => 'GZA', 'destination_code' => 'AMM',
            'depart_time' => '10:00', 'arrive_time' => '11:00', 'duration_minutes' => 60, 'aircraft_id' => $aircraftId,
            'aircraft_snapshot' => json_encode(['id' => $aircraftId]), 'layout_snapshot' => json_encode($layout),
            'reference_revisions' => '{}', 'classification' => 'commemorative', 'price_minor' => 0]);
        DB::table('mvp_reservations')->insert(['id' => $id, 'reference' => $reference, 'status' => 'confirmed',
            'owner_user_id' => $owner['id'], 'service_id' => $serviceId, 'contact_email' => $owner['email'], 'contact_phone' => '',
            'passenger_count' => 1, 'flight_snapshot' => '{}', 'ticket_snapshot' => '{}']);
    }

    protected function createStaffUser(string $role = 'admin', string $status = 'active'): array
    {
        $id = (string) Str::uuid();
        self::$staffHash ??= app(Argon2idPasswordHasher::class)->hash('Synthetic-staff-secret-2026', 'staff');
        $username = 'staff_' . bin2hex(random_bytes(4));
        $email = $username . '@example.test';

        DB::table('staff_users')->insert([
            'id' => $id,
            'username' => $username,
            'email' => $email,
            'full_name_en' => 'Staff Member',
            'full_name_ar' => 'موظف تجريبي',
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

        if ($status === 'active') {
            DB::table('staff_users')->where('id', $id)->update(['status' => 'active', 'mfa_version' => 1]);
        } else {
            DB::table('staff_users')->where('id', $id)->update(['status' => $status]);
        }

        return ['id' => $id, 'email' => $email];
    }

    protected function createPassengerUser(string $status = 'active'): array
    {
        $id = (string) Str::uuid();
        self::$passengerHash ??= app(Argon2idPasswordHasher::class)->hash('Synthetic-pass-2026', 'passenger');
        $email = 'passenger_' . bin2hex(random_bytes(4)) . '@example.test';

        DB::table('users')->insert([
            'id' => $id,
            'email' => $email,
            'password_hash' => self::$passengerHash,
            'status' => $status,
            'credential_epoch' => 1,
            'email_verified_at' => $status === 'active' ? DB::raw('UTC_TIMESTAMP(6)') : null,
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);

        return ['id' => $id, 'email' => $email];
    }

    protected function configureSmtp(?string $staffId = null, string $host = '127.0.0.1', int $port = 1025, string $tls = 'none'): void
    {
        $staffId ??= $this->createStaffUser()['id'];
        $settings = app(MailSettings::class);
        $read = $settings->read();

        $settings->save([
            'expectedRevision' => (int) $read['revision'],
            'driver' => 'smtp',
            'host' => $host,
            'port' => $port,
            'tls' => $tls,
            'senderName' => 'Palestinian Airlines',
            'senderEmail' => 'noreply@gazaairport.com',
            'replyTo' => 'support@gazaairport.com',
            'username' => 'synthetic-user',
            'password' => 'synthetic-pass-sentinel-2026',
        ], $staffId);
    }

    protected function enqueuePassengerProof(ProofPurpose $purpose, ?array $user = null): array
    {
        $user ??= $this->createPassengerUser($purpose === ProofPurpose::PassengerEmailVerification ? 'unverified' : 'active');
        $rawToken = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $proofId = (string) Str::uuid();

        DB::table($purpose->table())->insert([
            'id' => $proofId,
            'token_digest' => hash('sha256', $rawToken),
            'state' => 'issued',
            'issued_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'expires_at' => DB::raw("DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 24 HOUR)"),
            'user_id' => $user['id'],
            'purpose' => $purpose->value,
            'credential_epoch' => 1,
            'email_snapshot' => $user['email'],
        ]);

        $payload = new OutboxPayload(
            recipient: $user['email'],
            subject: 'Palestinian Airlines verification',
            body: 'Verify token ' . $rawToken,
            purpose: $purpose->value,
            tokenOrCode: $rawToken,
        );

        $outboxId = (string) Str::uuid();
        DB::table('security_dispatch_outbox')->insert([
            'id' => $outboxId,
            'user_verification_id' => $purpose === ProofPurpose::PassengerEmailVerification ? $proofId : null,
            'user_reset_id' => $purpose === ProofPurpose::PassengerPasswordReset ? $proofId : null,
            'staff_invitation_id' => null,
            'staff_reset_id' => null,
            'booking_challenge_id' => null,
            'encrypted_payload' => app(Encrypter::class)->encrypt($payload->toJson()),
            'status' => 'queued',
            'expires_at' => DB::raw("DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 24 HOUR)"),
            'attempts' => 0,
        ]);

        return [
            'outbox_id' => $outboxId,
            'proof_id' => $proofId,
            'user' => $user,
            'token' => $rawToken,
        ];
    }

    protected function enqueueStaffProof(ProofPurpose $purpose, ?array $staff = null): array
    {
        $staff ??= $this->createStaffUser('admin', $purpose === ProofPurpose::StaffInvitation ? 'invited' : 'active');
        $rawToken = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $proofId = (string) Str::uuid();

        DB::table($purpose->table())->insert([
            'id' => $proofId,
            'token_digest' => hash('sha256', $rawToken),
            'state' => 'issued',
            'issued_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'expires_at' => DB::raw("DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 24 HOUR)"),
            'staff_id' => $staff['id'],
            'purpose' => $purpose->value,
            'credential_epoch' => 1,
            'email_snapshot' => $staff['email'],
        ]);

        $payload = new OutboxPayload(
            recipient: $staff['email'],
            subject: 'Staff invitation',
            body: 'Invitation token ' . $rawToken,
            purpose: $purpose->value,
            tokenOrCode: $rawToken,
        );

        $outboxId = (string) Str::uuid();
        DB::table('security_dispatch_outbox')->insert([
            'id' => $outboxId,
            'user_verification_id' => null,
            'user_reset_id' => null,
            'staff_invitation_id' => $purpose === ProofPurpose::StaffInvitation ? $proofId : null,
            'staff_reset_id' => $purpose === ProofPurpose::StaffPasswordReset ? $proofId : null,
            'booking_challenge_id' => null,
            'encrypted_payload' => app(Encrypter::class)->encrypt($payload->toJson()),
            'status' => 'queued',
            'expires_at' => DB::raw("DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 24 HOUR)"),
            'attempts' => 0,
        ]);

        return [
            'outbox_id' => $outboxId,
            'proof_id' => $proofId,
            'staff' => $staff,
            'token' => $rawToken,
        ];
    }

    protected function startSink(string $mode = 'accept', int $port = 1025): array
    {
        $process = proc_open(
            [PHP_BINARY, __DIR__ . '/synthetic-smtp-sink.php', $mode, (string) $port],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            base_path()
        );

        if (!is_resource($process)) {
            throw new \RuntimeException('Failed to start synthetic sink.');
        }

        stream_set_blocking($pipes[1], false);
        $deadline = microtime(true) + 5;
        $ready = false;

        while (microtime(true) < $deadline) {
            $line = fgets($pipes[1]);
            if ($line !== false && str_contains($line, 'READY')) {
                $ready = true;
                break;
            }
            usleep(10000);
        }

        if (!$ready) {
            proc_terminate($process, 9);
            proc_close($process);
            throw new \RuntimeException('Synthetic sink failed to signal READY.');
        }

        return [$process, $pipes];
    }

    protected function stopSink(?array $sink): void
    {
        if ($sink === null) {
            return;
        }
        [$process, $pipes] = $sink;
        foreach ($pipes as $pipe) {
            if (is_resource($pipe)) {
                fclose($pipe);
            }
        }
        if (is_resource($process)) {
            proc_terminate($process, 9);
            proc_close($process);
        }
        usleep(50000);
    }
}
