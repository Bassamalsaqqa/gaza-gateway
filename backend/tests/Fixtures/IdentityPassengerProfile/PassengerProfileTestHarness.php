<?php

declare(strict_types=1);

namespace Tests\Fixtures\IdentityPassengerProfile;

use App\Identity\Protocol\CookieSecurity;
use App\Support\RequestCorrelation;
use App\Identity\Tokens\OpaqueToken;
use App\Providers\PassengerProfileServiceProvider;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Routing\Router;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Trait providing database verification, tracked fixture lifecycle,
 * genuine process barrier management, and test-only route registration.
 *
 * Invariants:
 * - APP_ENV=testing, pgsql_test connection, gaza_gateway_test database strictly asserted before mutation.
 * - Tracked fixture records cleaned in reverse FK order without touching immutable audit_events.
 * - Temporary barrier directory is an owned exclusive directory with marker verification.
 * - Password hashes generated natively with accepted Argon2id profile (64MiB/t4/p1).
 * - Exact configured Origin (http://localhost:3000) and HTTPS transport with loopback host (127.0.0.1).
 */
trait PassengerProfileTestHarness
{
    /** @var list<string> */
    protected array $trackedUserIds = [];

    /** @var list<string> */
    protected array $trackedProfileUserIds = [];

    /** @var list<string> */
    protected array $trackedSessionIds = [];

    /** @var list<string> */
    protected array $trackedTravelerIds = [];

    /** @var list<string> */
    protected array $trackedAuditResidueIds = [];

    protected ?string $tempBarrierDir = null;
    protected ?string $barrierMarkerUuid = null;

    private static ?string $cachedValidArgon2idHash = null;

    protected function setUpPassengerProfileHarness(): void
    {
        $this->assertDatabaseGuards();

        // 1. Register profile provider in memory for test suite
        $this->app->register(PassengerProfileServiceProvider::class);

        // 2. Register routes dynamically in memory under api/v1 prefix
        /** @var Router $router */
        $router = $this->app->make(Router::class);
        $routeFile = base_path('routes/passenger-profile.php');
        if (file_exists($routeFile)) {
            $router->prefix('api/v1')->group($routeFile);
        }

        // 3. Prepare disposable barrier directory with ownership marker
        $this->setupBarrierDirectory();
    }

    protected function tearDownPassengerProfileHarness(): void
    {
        $this->cleanTrackedFixtures();
        $this->cleanupBarrierDirectory();
    }

    final protected function assertDatabaseGuards(): void
    {
        $this->assertDisposableDatabaseTarget();

        $processEnv = getenv('APP_ENV');
        if ($processEnv !== 'testing') {
            throw new RuntimeException("Strict getenv('APP_ENV') must be 'testing', got: [{$processEnv}].");
        }

        if (config('app.env') !== 'testing') {
            throw new RuntimeException("config('app.env') must be 'testing', got: [" . config('app.env') . '].');
        }

        $defaultConn = DB::getDefaultConnection();
        if ($defaultConn !== 'pgsql_test') {
            throw new RuntimeException("Default connection must be pgsql_test, got: [{$defaultConn}].");
        }

        $conn = DB::connection('pgsql_test');
        if ($conn->getName() !== 'pgsql_test') {
            throw new RuntimeException("Connection getName() must be pgsql_test, got: [{$conn->getName()}].");
        }

        if ($conn->getDriverName() !== 'pgsql') {
            throw new RuntimeException("Connection getDriverName() must be pgsql, got: [{$conn->getDriverName()}].");
        }

        $currentDb = (string) ($conn->selectOne('SELECT current_database() AS db')?->db ?? '');
        if ($currentDb !== 'gaza_gateway_test') {
            throw new RuntimeException("Test database must be gaza_gateway_test, got: [{$currentDb}].");
        }
    }

    protected function setupBarrierDirectory(): void
    {
        $this->barrierMarkerUuid = (string) Str::uuid();
        $tempBase = sys_get_temp_dir();
        $realBase = realpath($tempBase);
        if ($realBase === false || !is_dir($realBase) || is_link($realBase)) {
            throw new RuntimeException('System temp directory invalid');
        }

        $hex = bin2hex(random_bytes(8)); // 16 lowercase hex characters
        $tempRoot = $realBase . DIRECTORY_SEPARATOR . 'gaza_barrier_' . $hex;
        if (file_exists($tempRoot) || is_link($tempRoot)) {
            throw new RuntimeException("Barrier directory already exists or is symlink: {$tempRoot}");
        }

        if (!mkdir($tempRoot, 0700, false)) {
            throw new RuntimeException("Failed to create exclusive barrier directory: {$tempRoot}");
        }
        @chmod($tempRoot, 0700);

        $markerPath = $tempRoot . DIRECTORY_SEPARATOR . 'gaza_barrier_marker.lock';
        $handle = @fopen($markerPath, 'x');
        if ($handle === false) {
            throw new RuntimeException("Failed to exclusively create marker lock file: {$markerPath}");
        }
        try {
            if (fwrite($handle, $this->barrierMarkerUuid) !== strlen($this->barrierMarkerUuid) || !fflush($handle)) {
                throw new RuntimeException("Failed to write barrier marker UUID: {$markerPath}");
            }
        } finally {
            fclose($handle);
        }
        @chmod($markerPath, 0600);

        $this->tempBarrierDir = $tempRoot;
    }

    /**
     * Statically generate native Argon2id hash once per test suite using accepted 64MiB/t4/p1 profile.
     */
    protected static function getValidTestPasswordHash(): string
    {
        if (self::$cachedValidArgon2idHash === null) {
            self::$cachedValidArgon2idHash = password_hash(
                'CorrectValidPassword123!',
                PASSWORD_ARGON2ID,
                [
                    'memory_cost' => 65536,
                    'time_cost' => 4,
                    'threads' => 1,
                ]
            );
        }
        return self::$cachedValidArgon2idHash;
    }

    /**
     * Standard request headers for passenger API operations.
     * Uses accepted local origin (http://localhost:3000), Host (127.0.0.1), raw Cookie and CSRF.
     *
     * @param array{cookieHeader: string, csrfToken: string} $session
     * @param array<string, string> $extra
     * @return array<string, string>
     */
    protected function passengerHeaders(array $session, array $extra = []): array
    {
        return array_merge([
            'Host' => '127.0.0.1',
            'Origin' => 'http://localhost:3000',
            'Cookie' => $session['cookieHeader'],
            'X-CSRF-TOKEN' => $session['csrfToken'],
            'Accept' => 'application/json',
        ], $extra);
    }

    /**
     * Standard server variables enforcing loopback host and HTTPS.
     *
     * @param array<string, mixed> $extra
     * @return array<string, mixed>
     */
    protected function secureServerVariables(array $extra = []): array
    {
        return array_merge([
            'HTTPS' => 'on',
            'HTTP_HOST' => '127.0.0.1',
            'SERVER_PORT' => '443',
            'REMOTE_ADDR' => '127.0.0.1',
        ], $extra);
    }

    protected function withHttps(string $ip = '127.0.0.1'): self
    {
        $this->app->make('url')->forceRootUrl('https://127.0.0.1');
        $this->app->make('url')->forceScheme('https');
        return $this->withServerVariables($this->secureServerVariables(['REMOTE_ADDR' => $ip]));
    }

    protected function bodyless(string $method, string $uri, array $headers = []): \Illuminate\Testing\TestResponse
    {
        return $this->call($method, $uri, [], [], [], $this->transformHeadersToServerVars($headers));
    }

    /**
     * Create verified active passenger user fixture with structurally usable native Argon2id password hash.
     */
    protected function createTestUser(
        ?string $email = null,
        string $status = 'active',
        bool $verified = true,
        int $credentialEpoch = 1,
        ?string $overrideHash = null
    ): object {
        $this->assertDatabaseGuards();

        $userId = (string) Str::uuid();
        $userEmail = $email ?? ('passenger_' . bin2hex(random_bytes(4)) . '@example.com');
        $now = CarbonImmutable::now();

        $passwordHash = $overrideHash ?? self::getValidTestPasswordHash();

        DB::table('users')->insert([
            'id' => $userId,
            'email' => $userEmail,
            'password_hash' => $passwordHash,
            'status' => $status,
            'email_verified_at' => $verified ? $now->toIso8601String() : null,
            'credential_epoch' => $credentialEpoch,
            'created_at' => $now->toIso8601String(),
            'updated_at' => $now->toIso8601String(),
        ]);

        $this->trackedUserIds[] = $userId;

        return (object) [
            'id' => $userId,
            'email' => $userEmail,
            'status' => $status,
            'credentialEpoch' => $credentialEpoch,
            'passwordHash' => $passwordHash,
        ];
    }

    /**
     * Create passenger profile fixture.
     */
    protected function createTestProfile(string $userId, array $attributes = []): object
    {
        $this->assertDatabaseGuards();

        $now = CarbonImmutable::now();
        $data = array_merge([
            'user_id' => $userId,
            'title' => 'Mr',
            'first_name' => 'Kareem',
            'last_name' => 'Al-Husseini',
            'phone' => '+970599112233',
            'seat_preference' => 'aisle',
            'meal_preference' => 'halal-standard',
            'newsletter' => true,
            'created_at' => $now->toIso8601String(),
            'updated_at' => $now->toIso8601String(),
        ], $attributes);

        DB::table('passenger_profiles')->insert($data);
        $this->trackedProfileUserIds[] = $userId;

        return (object) $data;
    }

    /**
     * Issue full passenger session fixture with raw tokens and cookie.
     *
     * @return array{
     *     sessionId: string,
     *     rawToken: string,
     *     csrfToken: string,
     *     cookieHeader: string,
     *     expiresAt: CarbonImmutable
     * }
     */
    protected function createTestSession(
        string $userId,
        int $credentialEpoch = 1,
        array $payloadAttributes = []
    ): array {
        $this->assertDatabaseGuards();

        $now = CarbonImmutable::now();
        $sessionId = (string) Str::uuid();
        $token = OpaqueToken::generate('passenger', 'full_session');
        $csrfToken = OpaqueToken::generate('passenger', 'csrf')->getSecretToken();

        $absoluteExpiresAt = $now->addDays(7);
        $idleExpiresAt = $now->addHours(24);

        $payload = array_merge($payloadAttributes, ['csrf_token' => $csrfToken]);
        /** @var Encrypter $encrypter */
        $encrypter = $this->app->make(Encrypter::class);
        $encryptedPayload = $encrypter->encrypt(json_encode($payload, JSON_THROW_ON_ERROR));

        DB::table('passenger_sessions')->insert([
            'id' => $sessionId,
            'lookup_digest' => $token->digest,
            'user_id' => $userId,
            'auth_level' => 'full',
            'credential_epoch' => $credentialEpoch,
            'encrypted_payload' => $encryptedPayload,
            'issued_at' => $now->toIso8601String(),
            'absolute_expires_at' => $absoluteExpiresAt->toIso8601String(),
            'idle_expires_at' => $idleExpiresAt->toIso8601String(),
            'last_seen_at' => $now->toIso8601String(),
            'revoked_at' => null,
        ]);

        $this->trackedSessionIds[] = $sessionId;

        return [
            'sessionId' => $sessionId,
            'rawToken' => $token->getSecretToken(),
            'csrfToken' => $csrfToken,
            'cookieHeader' => CookieSecurity::COOKIE_PASSENGER . '=' . $token->getSecretToken(),
            'expiresAt' => $absoluteExpiresAt,
        ];
    }

    /**
     * Create companion saved traveler fixture.
     */
    protected function createTestTraveler(string $userId, array $attributes = []): object
    {
        $this->assertDatabaseGuards();

        /** @var Encrypter $encrypter */
        $encrypter = $this->app->make(Encrypter::class);

        $travelerId = (string) Str::uuid();
        $externalId = 'trv-' . Str::uuid()->toString();
        $now = CarbonImmutable::now();

        $docPlain = $attributes['document'] ?? 'P98765432';
        $encryptedDoc = $docPlain !== '' ? $encrypter->encrypt($docPlain) : null;

        $data = [
            'id' => $travelerId,
            'owner_user_id' => $userId,
            'external_id' => $attributes['external_id'] ?? $externalId,
            'first_name' => $attributes['first_name'] ?? 'Yara',
            'last_name' => $attributes['last_name'] ?? 'Al-Masri',
            'dob' => $attributes['dob'] ?? '1998-04-20',
            'nationality' => $attributes['nationality'] ?? 'Palestinian',
            'encrypted_document' => $encryptedDoc,
            'created_at' => $now->toIso8601String(),
            'updated_at' => $now->toIso8601String(),
        ];

        DB::table('saved_travelers')->insert($data);
        $this->trackedTravelerIds[] = $travelerId;

        return (object) array_merge($data, ['document' => $docPlain]);
    }

    /**
     * Cleans up tracked fixture records in reverse foreign-key order.
     * Invariant: Never deletes or truncates append-only audit_events!
     */
    protected function cleanTrackedFixtures(): void
    {
        $this->assertDatabaseGuards();

        // 1. Inventory audit residue created by tracked users
        if (!empty($this->trackedUserIds)) {
            $auditRows = DB::table('audit_events')
                ->whereIn('passenger_id', $this->trackedUserIds)
                ->pluck('id')
                ->all();
            $this->trackedAuditResidueIds = array_map('strval', $auditRows);
        }

        // 2. Clean saved_travelers (both by owner_user_id and explicit ID)
        if (!empty($this->trackedUserIds)) {
            DB::table('saved_travelers')->whereIn('owner_user_id', $this->trackedUserIds)->delete();
        }
        if (!empty($this->trackedTravelerIds)) {
            DB::table('saved_travelers')->whereIn('id', $this->trackedTravelerIds)->delete();
            $this->trackedTravelerIds = [];
        }

        // 3. Clean passenger_profiles
        if (!empty($this->trackedUserIds)) {
            DB::table('passenger_profiles')->whereIn('user_id', $this->trackedUserIds)->delete();
        }
        if (!empty($this->trackedProfileUserIds)) {
            DB::table('passenger_profiles')->whereIn('user_id', $this->trackedProfileUserIds)->delete();
            $this->trackedProfileUserIds = [];
        }

        // 4. Clean passenger_sessions
        if (!empty($this->trackedUserIds)) {
            DB::table('passenger_sessions')->whereIn('user_id', $this->trackedUserIds)->delete();
        }
        if (!empty($this->trackedSessionIds)) {
            DB::table('passenger_sessions')->whereIn('id', $this->trackedSessionIds)->delete();
            $this->trackedSessionIds = [];
        }

        // 5. Clean users (do not delete audited users; audited users remain as bounded immutable residue)
        if (!empty($this->trackedUserIds)) {
            $auditedUserIds = DB::table('audit_events')
                ->whereIn('passenger_id', $this->trackedUserIds)
                ->pluck('passenger_id')
                ->map(fn ($id) => (string) $id)
                ->unique()
                ->all();

            $unauditedUserIds = array_values(array_diff($this->trackedUserIds, $auditedUserIds));
            if (!empty($unauditedUserIds)) {
                DB::table('users')->whereIn('id', $unauditedUserIds)->delete();
            }
            $this->trackedUserIds = [];
        }
    }

    /**
     * Cleans up disposable barrier directory with strict ownership marker verification,
     * realpath traversal checks, no symlinks, allowlisted file extensions, and bounded checked deletion.
     */
    protected function cleanupBarrierDirectory(): void
    {
        if ($this->tempBarrierDir === null) {
            return;
        }

        $dir = $this->tempBarrierDir;
        $expectedMarkerUuid = $this->barrierMarkerUuid;

        if (is_link($dir) || (file_exists($dir) && !is_dir($dir))) {
            throw new RuntimeException('Owned barrier root changed type; cleanup refused.');
        }
        if (!file_exists($dir)) {
            $this->tempBarrierDir = null;
            $this->barrierMarkerUuid = null;
            return;
        }

        $realDir = realpath($dir);
        $realTemp = realpath(sys_get_temp_dir());
        if ($realDir === false || $realTemp === false || dirname($realDir) !== $realTemp) {
            throw new RuntimeException('Barrier directory escaped allowed immediate temporary boundary');
        }

        if (!preg_match('/^gaza_barrier_[0-9a-f]{16}$/D', basename($realDir))) {
            throw new RuntimeException('Barrier directory name does not match expected format');
        }

        $markerPath = $realDir . DIRECTORY_SEPARATOR . 'gaza_barrier_marker.lock';
        if (!is_file($markerPath) || is_link($markerPath)) {
            throw new RuntimeException('Barrier marker lock file missing or is symlink');
        }

        if (filesize($markerPath) !== 36) {
            throw new RuntimeException('Invalid bounded barrier marker.');
        }
        $markerContent = (string) file_get_contents($markerPath);
        if ($markerContent !== $expectedMarkerUuid) {
            throw new RuntimeException('Barrier marker UUID mismatch; refusing to clean unknown directory');
        }

        $entries = scandir($realDir);
        if ($entries === false) {
            throw new RuntimeException('Failed to scan barrier directory');
        }

        $allowedExtensions = ['lock', 'ready', 'pipe', 'txt', 'json'];
        $maxAllowedFiles = 50;
        $leavesToDelete = [];

        // VALIDATE ALL LEAVES BEFORE DELETING ANY
        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }

            $entryPath = $realDir . DIRECTORY_SEPARATOR . $entry;
            if (is_link($entryPath)) {
                throw new RuntimeException("Symlink detected in barrier directory: {$entryPath}");
            }

            if (is_dir($entryPath)) {
                throw new RuntimeException("Unexpected subdirectory in barrier directory: {$entryPath}");
            }

            $ext = pathinfo($entry, PATHINFO_EXTENSION);
            if (!in_array($ext, $allowedExtensions, true)) {
                throw new RuntimeException("Unexpected file extension in barrier directory: {$entry}");
            }

            $leavesToDelete[] = $entry;
        }

        if (count($leavesToDelete) > $maxAllowedFiles) {
            throw new RuntimeException('Exceeded maximum allowed files in barrier directory');
        }

        // Delete non-marker leaves first
        foreach ($leavesToDelete as $entry) {
            if ($entry === 'gaza_barrier_marker.lock') {
                continue;
            }
            $entryPath = $realDir . DIRECTORY_SEPARATOR . $entry;
            if (!@unlink($entryPath) && file_exists($entryPath)) {
                throw new RuntimeException("Failed to unlink barrier leaf file: {$entryPath}");
            }
        }

        // Marker deleted LAST
        if (!@unlink($markerPath) && file_exists($markerPath)) {
            throw new RuntimeException("Failed to unlink barrier marker file: {$markerPath}");
        }

        // Checked rmdir
        if (!@rmdir($realDir) && is_dir($realDir)) {
            // Restore the exclusive marker so a failed final erase retains its retry capability.
            $handle = @fopen($markerPath, 'x');
            if ($handle !== false) {
                try {
                    if (fwrite($handle, $expectedMarkerUuid) !== strlen($expectedMarkerUuid) || !fflush($handle)) {
                        throw new RuntimeException('Failed to restore owned cleanup capability.');
                    }
                } finally {
                    fclose($handle);
                }
                @chmod($markerPath, 0600);
            }
            throw new RuntimeException('Final owned barrier directory erase failed; retry state retained.');
        }

        // Retain ownership/path state until complete success
        $this->tempBarrierDir = null;
        $this->barrierMarkerUuid = null;
    }

    /**
     * Helper to poll PostgreSQL until a target backend PID is actively blocked by an expected blocker PID.
     * Times out safely after $timeoutMs.
     */
    protected function assertBackendBlocked(int $blockedPid, int $expectedBlockerPid, int $timeoutMs = 5000): void
    {
        $this->assertDatabaseGuards();
        $start = hrtime(true);
        $maxNanos = $timeoutMs * 1_000_000;
        $observedBlockers = [];

        while ((hrtime(true) - $start) < $maxNanos) {
            $rows = DB::connection('pgsql_test')->select('
                SELECT pid, wait_event_type, wait_event, pg_blocking_pids(pid) AS blockers
                FROM pg_stat_activity
                WHERE pid = ?
            ', [$blockedPid]);

            if (!empty($rows)) {
                $blockerStr = trim((string) ($rows[0]->blockers ?? ''));
                if ($blockerStr !== '' && $blockerStr !== '{}') {
                    $cleaned = trim($blockerStr, '{}');
                    $observedBlockers = array_map('intval', explode(',', $cleaned));
                    if (in_array($expectedBlockerPid, $observedBlockers, true)) {
                        return;
                    }
                }
            }

            usleep(25000); // 25ms
        }

        throw new RuntimeException(sprintf(
            'Backend PID %d was not blocked by PID %d within %d ms (observed blockers: %s)',
            $blockedPid,
            $expectedBlockerPid,
            $timeoutMs,
            json_encode($observedBlockers)
        ));
    }

    /**
     * Spawn genuine isolated two-process concurrency worker.
     */
    protected function spawnConcurrencyWorker(): PassengerProfileConcurrencyProcess
    {
        $this->assertDatabaseGuards();
        return new PassengerProfileConcurrencyProcess();
    }

    protected function assertPassengerProfileResponse(array $json, ?string $expectedEmail = null): void
    {
        $this->assertTrue($json['success'] ?? false, 'PassengerProfileResponse must have success=true');
        $this->assertIsArray($json['data'] ?? null, 'PassengerProfileResponse data must be array/object');
        if ($expectedEmail !== null) {
            $this->assertSame($expectedEmail, $json['data']['email'] ?? null);
        }
        $this->assertArrayHasKey('firstName', $json['data']);
        $this->assertArrayHasKey('lastName', $json['data']);
        $this->assertArrayHasKey('phone', $json['data']);
        $this->assertArrayHasKey('seatPreference', $json['data']);
        $this->assertArrayHasKey('mealPreference', $json['data']);
        $this->assertArrayHasKey('newsletter', $json['data']);
        $this->assertIsBool($json['data']['newsletter']);

        $this->assertIsArray($json['meta'] ?? null, 'PassengerProfileResponse meta must be present');
        $this->assertTrue(RequestCorrelation::isValidUuid($json['meta']['requestId'] ?? ''));
        $this->assertNotEmpty($json['meta']['timestamp'] ?? '');
    }

    protected function assertPassengerProfileReceiptResponse(array $json, ?bool $expectedChanged = null): void
    {
        $this->assertTrue($json['success'] ?? false, 'PassengerProfileReceiptResponse must have success=true');
        $this->assertIsArray($json['data'] ?? null);
        if ($expectedChanged !== null) {
            $this->assertSame($expectedChanged, $json['data']['changed'] ?? null);
        }
        $this->assertIsBool($json['data']['changed'] ?? null);
        $this->assertIsArray($json['data']['account'] ?? null);
        $this->assertArrayNotHasKey('beforeAccount', $json['data']);

        $this->assertIsArray($json['meta'] ?? null);
        $this->assertTrue(RequestCorrelation::isValidUuid($json['meta']['requestId'] ?? ''));
        $this->assertNotEmpty($json['meta']['timestamp'] ?? '');
    }

    protected function assertSavedTravelersResponse(array $json): void
    {
        $this->assertTrue($json['success'] ?? false, 'SavedTravelersResponse must have success=true');
        $this->assertIsArray($json['data'] ?? null);
        $this->assertTrue(array_is_list($json['data']), 'SavedTravelersResponse data must be a list');

        $this->assertIsArray($json['meta'] ?? null);
        $this->assertTrue(RequestCorrelation::isValidUuid($json['meta']['requestId'] ?? ''));
        $this->assertNotEmpty($json['meta']['timestamp'] ?? '');
    }

    protected function assertSavedTravelerResponse(array $json, ?string $expectedId = null): void
    {
        $this->assertTrue($json['success'] ?? false, 'SavedTravelerResponse must have success=true');
        $this->assertIsArray($json['data'] ?? null);
        $this->assertStringStartsWith('trv-', $json['data']['id'] ?? '');
        if ($expectedId !== null) {
            $this->assertSame($expectedId, $json['data']['id'] ?? '');
        }

        $this->assertIsArray($json['meta'] ?? null);
        $this->assertTrue(RequestCorrelation::isValidUuid($json['meta']['requestId'] ?? ''));
        $this->assertNotEmpty($json['meta']['timestamp'] ?? '');
    }

    protected function assertDeleteTravelerResponse(array $json): void
    {
        $this->assertTrue($json['success'] ?? false, 'DeleteTravelerResponse must have success=true');
        $this->assertIsArray($json['data'] ?? null);
        $this->assertTrue($json['data']['deleted'] ?? false, 'DeleteTravelerResponse data.deleted must be true');
        $this->assertArrayNotHasKey('travelerId', $json['data'], 'DeleteTravelerResponse data must not declare travelerId');

        $this->assertIsArray($json['meta'] ?? null);
        $this->assertTrue(RequestCorrelation::isValidUuid($json['meta']['requestId'] ?? ''));
        $this->assertNotEmpty($json['meta']['timestamp'] ?? '');
    }

    protected function assertErrorResponse(array $json, string $expectedCode, ?int $expectedStatus = null): void
    {
        $this->assertFalse($json['success'] ?? true, 'ErrorResponse must have success=false');
        $this->assertIsArray($json['error'] ?? null);
        $this->assertSame($expectedCode, $json['error']['code'] ?? null);
        $this->assertNotEmpty($json['error']['message'] ?? '');

        $this->assertIsArray($json['meta'] ?? null);
        $this->assertTrue(RequestCorrelation::isValidUuid($json['meta']['requestId'] ?? ''));
        $this->assertNotEmpty($json['meta']['timestamp'] ?? '');
    }
}
