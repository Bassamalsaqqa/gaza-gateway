<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Tests\TestCase;

class SystemEndpointsTest extends TestCase
{
    public function test_liveness_endpoint_returns_ok_and_canonical_meta(): void
    {
        $response = $this->get('/api/v1/health');

        $response->assertStatus(200);
        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
        $this->assertTrue($response->headers->has('X-Request-Id'));

        $json = $response->json();
        $this->assertTrue($json['success']);
        $this->assertSame('ok', $json['data']['status']);
        $this->assertNotEmpty($json['data']['timestamp']);
        $this->assertNotEmpty($json['meta']['requestId']);
        $this->assertSame($response->headers->get('X-Request-Id'), $json['meta']['requestId']);
        $this->assertSame($json['data']['timestamp'], $json['meta']['timestamp']);
    }

    public function test_readiness_endpoint_returns_healthy_dependencies_when_heartbeat_active(): void
    {
        Cache::put('worker:heartbeat', time(), 60);

        $response = $this->get('/api/v1/health/ready');

        $response->assertStatus(200);
        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));

        $json = $response->json();
        $this->assertTrue($json['success']);
        $this->assertSame('connected', $json['data']['database']);
        $this->assertSame('up_to_date', $json['data']['migrations']);
        $this->assertSame('healthy', $json['data']['queue']);
        $this->assertNotEmpty($json['meta']['requestId']);
    }

    public function test_readiness_endpoint_fails_when_worker_heartbeat_is_missing(): void
    {
        Cache::forget('worker:heartbeat');

        $response = $this->get('/api/v1/health/ready');

        $response->assertStatus(503);
        $json = $response->json();
        $this->assertFalse($json['success']);
        $this->assertSame('service_unavailable', $json['error']['code']);
    }

    public function test_readiness_endpoint_fails_when_worker_heartbeat_is_stale(): void
    {
        // Stale heartbeat older than 30 seconds
        Cache::put('worker:heartbeat', time() - 35, 60);

        $response = $this->get('/api/v1/health/ready');

        $response->assertStatus(503);
        $json = $response->json();
        $this->assertFalse($json['success']);
        $this->assertSame('service_unavailable', $json['error']['code']);
    }

    public function test_version_endpoint_returns_injected_metadata_and_derived_schema_version(): void
    {
        $response = $this->get('/api/v1/version');

        $response->assertStatus(200);
        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));

        $json = $response->json();
        $this->assertTrue($json['success']);
        $this->assertSame(config('app.version'), $json['data']['version']);
        $this->assertSame(config('app.commit'), $json['data']['commit']);
        $this->assertSame(1, $json['data']['schemaVersion']);
        $this->assertNotEmpty($json['meta']['requestId']);
    }

    public function test_request_id_validation_and_regeneration(): void
    {
        // 1. Valid UUID is preserved
        $validUuid = Str::uuid()->toString();
        $response1 = $this->withHeaders(['X-Request-Id' => $validUuid])->get('/api/v1/health');
        $response1->assertHeader('X-Request-Id', $validUuid);
        $this->assertSame($validUuid, $response1->json('meta.requestId'));

        // 2. Non-UUID or invalid input is replaced with a fresh valid UUID
        $invalidId = 'not-a-valid-uuid-injection-attempt';
        $response2 = $this->withHeaders(['X-Request-Id' => $invalidId])->get('/api/v1/health');
        $returnedId = $response2->headers->get('X-Request-Id');
        $this->assertNotSame($invalidId, $returnedId);
        $this->assertTrue(Str::isUuid($returnedId));
        $this->assertSame($returnedId, $response2->json('meta.requestId'));
    }

    public function test_strict_host_guard_rejects_untrusted_host_with_security_headers(): void
    {
        $response = $this->get('http://evil.untrusted.com/api/v1/health');

        $response->assertStatus(400);
        $response->assertHeader('X-Content-Type-Options', 'nosniff');
        $response->assertHeader('X-Frame-Options', 'DENY');
        $response->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        $this->assertTrue($response->headers->has('X-Request-Id'));

        $json = $response->json();
        $this->assertFalse($json['success']);
        $this->assertSame('bad_request', $json['error']['code']);
        $this->assertSame('Bad request.', $json['error']['message']);
    }

    public function test_strict_host_guard_rejects_forwarded_host(): void
    {
        $response = $this->withHeaders(['X-Forwarded-Host' => 'spoofed.domain.org'])->get('/api/v1/health');

        $response->assertStatus(400);
        $json = $response->json();
        $this->assertFalse($json['success']);
        $this->assertSame('bad_request', $json['error']['code']);
    }

    public function test_cors_guard_handles_allowed_origin_and_preflight(): void
    {
        // Allowed origin on GET
        $response = $this->withHeaders(['Origin' => 'http://localhost:5173'])->get('/api/v1/health');
        $response->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
        $response->assertHeader('Access-Control-Allow-Credentials', 'true');
        $response->assertHeader('Vary', 'Origin');

        // Disallowed origin on GET does not receive Allow-Origin
        $disallowed = $this->withHeaders(['Origin' => 'https://malicious-site.example.com'])->get('/api/v1/health');
        $this->assertFalse($disallowed->headers->has('Access-Control-Allow-Origin'));
        $disallowed->assertHeader('Vary', 'Origin');

        // OPTIONS preflight for allowed origin with approved headers
        $optionsAllowed = $this->call('OPTIONS', '/api/v1/health', [], [], [], [
            'HTTP_ORIGIN' => 'http://localhost:5173',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
            'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'X-Booking-Token, X-Request-Id',
        ]);
        $optionsAllowed->assertStatus(204);
        $optionsAllowed->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173');

        // OPTIONS preflight for disallowed origin
        $optionsDisallowed = $this->call('OPTIONS', '/api/v1/health', [], [], [], [
            'HTTP_ORIGIN' => 'https://malicious-site.example.com',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
        ]);
        $optionsDisallowed->assertStatus(403);

        // OPTIONS preflight with disallowed method
        $optionsBadMethod = $this->call('OPTIONS', '/api/v1/health', [], [], [], [
            'HTTP_ORIGIN' => 'http://localhost:5173',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'TRACE',
        ]);
        $optionsBadMethod->assertStatus(403);

        // OPTIONS preflight with disallowed header
        $optionsBadHeader = $this->call('OPTIONS', '/api/v1/health', [], [], [], [
            'HTTP_ORIGIN' => 'http://localhost:5173',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
            'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'X-Untrusted-Custom-Header',
        ]);
        $optionsBadHeader->assertStatus(403);
    }

    public function test_canonical_error_response_on_not_found(): void
    {
        $response = $this->get('/api/v1/nonexistent-route-endpoint');

        $response->assertStatus(404);
        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
        $json = $response->json();
        $this->assertFalse($json['success']);
        $this->assertSame('not_found', $json['error']['code']);
        $this->assertNotEmpty($json['meta']['requestId']);
        $this->assertNotEmpty($json['meta']['timestamp']);
    }

    public function test_security_headers_present(): void
    {
        $response = $this->get('/api/v1/health');

        $response->assertHeader('X-Content-Type-Options', 'nosniff');
        $response->assertHeader('X-Frame-Options', 'DENY');
        $response->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    }

    public function test_database_cache_operations(): void
    {
        $key = 'test_feature_cache_key_' . Str::random(6);
        $value = ['feature' => 'test', 'time' => time()];

        $this->assertTrue(Cache::put($key, $value, 60));
        $this->assertSame($value, Cache::get($key));
        $this->assertTrue(Cache::forget($key));
        $this->assertNull(Cache::get($key));
    }

    public function test_secret_sentinels_not_reflected_in_logs_or_json(): void
    {
        $secretSentinel = 'sentinel_secret_token_' . Str::random(12);

        $response = $this->get('/api/v1/' . $secretSentinel);
        $response->assertStatus(404);

        // Ensure response JSON does not contain the sentinel
        $this->assertStringNotContainsString($secretSentinel, $response->getContent());

        // Check laravel log file to verify the sentinel was not logged literally
        $logPath = storage_path('logs/laravel.log');
        if (File::exists($logPath)) {
            $logContent = File::get($logPath);
            $this->assertStringNotContainsString($secretSentinel, $logContent);
        }
    }

    public function test_destructive_command_prohibited_on_non_test_database(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Destructive command [migrate:fresh] is strictly prohibited on non-test database [gaza_gateway_dev]');

        Artisan::call('migrate:fresh', ['--database' => 'pgsql']);
    }

    public function test_destructive_command_prohibited_in_non_testing_environment(): void
    {
        $this->app['env'] = 'local';

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Destructive command [migrate:fresh] is strictly prohibited in environment [local]');

        Artisan::call('migrate:fresh');
    }

    public function test_migrate_rollback_prohibited_on_non_test_database_even_with_force(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Destructive command [migrate:rollback] is strictly prohibited on non-test database [gaza_gateway_dev]');

        Artisan::call('migrate:rollback', ['--database' => 'pgsql', '--force' => true]);
    }

    public function test_migrate_rollback_prohibited_in_non_testing_environment(): void
    {
        $this->app['env'] = 'local';

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Destructive command [migrate:rollback] is strictly prohibited in environment [local]');

        Artisan::call('migrate:rollback', ['--force' => true]);
    }

    public function test_programmatic_rollback_and_fresh_reject_wrong_target_preserving_marker_data(): void
    {
        config([
            'database.connections.marker' => [
                'driver' => 'pgsql',
                'host' => 'postgres',
                'port' => '5432',
                'database' => 'gaza_gateway_marker',
                'username' => 'gaza_app_user',
                'password' => 'gaza_app_local_pass',
                'charset' => 'utf8',
                'prefix' => '',
                'search_path' => 'public',
                'sslmode' => 'prefer',
            ],
        ]);

        try {
            DB::connection('marker')->statement('DROP TABLE IF EXISTS marker_records');
            DB::connection('marker')->statement('CREATE TABLE marker_records (id serial primary key, marker text)');
            DB::connection('marker')->table('marker_records')->insert(['marker' => 'SURVIVAL_ASSERTION']);

            // 2. Attempt migrate:rollback targeting marker database
            try {
                Artisan::call('migrate:rollback', ['--database' => 'marker', '--force' => true]);
                $this->fail('Expected RuntimeException on migrate:rollback against marker database');
            } catch (\RuntimeException $e) {
                $this->assertStringContainsString('gaza_gateway_marker', $e->getMessage());
            }

            // 3. Attempt migrate:fresh targeting marker database
            try {
                Artisan::call('migrate:fresh', ['--database' => 'marker', '--force' => true]);
                $this->fail('Expected RuntimeException on migrate:fresh against marker database');
            } catch (\RuntimeException $e) {
                $this->assertStringContainsString('gaza_gateway_marker', $e->getMessage());
            }

            // 4. Verify marker data survived intact
            $count = DB::connection('marker')->table('marker_records')->count();
            $this->assertSame(1, $count);
            $record = DB::connection('marker')->table('marker_records')->first();
            $this->assertSame('SURVIVAL_ASSERTION', $record->marker);
        } finally {
            try {
                DB::connection('marker')->statement('DROP TABLE IF EXISTS marker_records');
            } catch (\Throwable) {
                // Ignore transient cleanup issues
            }
            DB::disconnect('marker');
        }
    }

    public function test_configuration_validator_rejects_unsupported_environment(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Invalid or unsupported environment profile');

        \App\Support\ConfigurationValidator::validate([], 'preview');
    }

    public function test_configuration_validator_rejects_empty_app_key_in_deployment(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('[app.key] is missing or empty');

        $config = $this->getValidProductionConfig();
        $config['app']['key'] = '';
        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_invalid_base64_app_key(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('[app.key] has invalid length, encoding, or format');

        $config = $this->getValidProductionConfig();
        $config['app']['key'] = 'base64:' . str_repeat('!', 44);
        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_debug_true_in_deployment(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('[app.debug] must be false in deployment');

        $config = $this->getValidProductionConfig();
        $config['app']['debug'] = true;
        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    private function getValidProductionConfig(): array
    {
        $config = config()->all();
        $config['app']['key'] = 'base64:' . base64_encode(random_bytes(32));
        $config['app']['debug'] = false;
        $config['app']['allowed_hosts'] = ['api.gazaairport.com'];
        $config['app']['url'] = 'https://api.gazaairport.com';
        $config['cors']['allowed_origins'] = ['https://www.gazaairport.com', 'https://gazaairport.com'];
        $config['database']['default'] = 'pgsql';
        $config['database']['connections']['pgsql'] = [
            'driver' => 'pgsql',
            'host' => 'db.gazaairport.internal',
            'port' => 5432,
            'database' => 'gaza_production',
            'username' => 'prod_service_role',
            'password' => 'prod_strong_vault_pass_123',
            'sslmode' => 'require',
            'options' => [
                \PDO::ATTR_TIMEOUT => 3,
            ],
            'server_options' => [
                'statement_timeout' => '3000',
                'lock_timeout' => '3000',
                'idle_in_transaction_session_timeout' => '3000',
            ],
        ];
        $config['queue']['default'] = 'database';
        $config['queue']['connections']['database'] = [
            'driver' => 'database',
            'table' => 'jobs',
            'queue' => 'default',
            'retry_after' => 90,
        ];
        $config['cache']['default'] = 'database';
        $config['cache']['stores']['database'] = [
            'driver' => 'database',
            'table' => 'cache',
            'lock_table' => 'cache_locks',
        ];

        return $config;
    }

    public function test_configuration_validator_rejects_unauthorized_production_host(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('[app.allowed_hosts] contains unauthorized host in production');

        $config = $this->getValidProductionConfig();
        $config['app']['allowed_hosts'] = ['evil.example'];
        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_production_local_app_url(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('[app.url] must match accepted production API URL');

        $config = $this->getValidProductionConfig();
        $config['app']['url'] = 'http://localhost:18084';
        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_unauthorized_production_origin(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('[cors.allowed_origins] contains unauthorized origin in production');

        $config = $this->getValidProductionConfig();
        $config['cors']['allowed_origins'] = ['https://evil.example'];
        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_empty_database_host(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Database host cannot be empty in deployment');

        $config = $this->getValidProductionConfig();
        $config['database']['connections']['pgsql']['host'] = '';
        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_disabled_database_tls_in_deployment(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage("Database sslmode must be 'require', 'verify-ca', or 'verify-full' in deployment");

        $config = $this->getValidProductionConfig();
        $config['database']['connections']['pgsql']['sslmode'] = 'disable';

        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_insecure_database_url_query_override(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage("Database sslmode must be 'require', 'verify-ca', or 'verify-full' in deployment");

        $config = $this->getValidProductionConfig();
        $config['database']['connections']['pgsql']['url'] = 'postgres://prod_user:prod_pass@db.prod.com:5432/gaza_prod?sslmode=prefer';

        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_wrong_database_url_scheme(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage("Effective database driver must be 'pgsql'");

        $config = $this->getValidProductionConfig();
        $config['database']['connections']['pgsql']['url'] = 'mysql://prod_user:prod_pass@db.prod.com:5432/gaza_prod?sslmode=require';

        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_malformed_database_url(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Invalid or malformed database configuration URL');

        $config = $this->getValidProductionConfig();
        $config['database']['connections']['pgsql']['url'] = 'http:///:::';

        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_accepts_complete_url_positive_control(): void
    {
        $config = $this->getValidProductionConfig();
        $config['database']['connections']['pgsql']['url'] = 'postgres://synth_user:synth_pass@db.prod.com:5432/gaza_prod?sslmode=require&connect_timeout=3&statement_timeout=3000&lock_timeout=3000';

        \App\Support\ConfigurationValidator::validate($config, 'production');
        $this->assertTrue(true);
    }

    public function test_configuration_validator_rejects_database_named_cache_with_array_driver(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage("Effective cache driver must be 'database', got [array]");

        $config = $this->getValidProductionConfig();
        $config['cache']['stores']['database']['driver'] = 'array';

        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_database_named_queue_with_sync_driver(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage("Effective queue driver must be 'database', got [sync]");

        $config = $this->getValidProductionConfig();
        $config['queue']['connections']['database']['driver'] = 'sync';

        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_staging_wildcard_and_bad_urls(): void
    {
        $this->expectException(\RuntimeException::class);

        $config = $this->getValidProductionConfig();
        $config['app']['allowed_hosts'] = ['*'];
        $config['app']['url'] = 'http://localhost:18084';
        $config['cors']['allowed_origins'] = ['https://evil.example/path'];

        \App\Support\ConfigurationValidator::validate($config, 'staging');
    }

    public function test_configuration_validator_rejects_unsupported_queue_driver(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage("Effective queue driver must be 'database', got [sync]");

        $config = config()->all();
        $config['queue']['default'] = 'sync';

        \App\Support\ConfigurationValidator::validate($config, 'testing');
    }

    public function test_configuration_validator_accepts_valid_testing_and_synthetic_production_profiles(): void
    {
        // 1. Positive control: testing profile
        $testingConfig = config()->all();
        \App\Support\ConfigurationValidator::validate($testingConfig, 'testing');
        $this->assertTrue(true);

        // 2. Positive control: synthetically complete deployment profile (no external connections made)
        $prodConfig = $this->getValidProductionConfig();
        \App\Support\ConfigurationValidator::validate($prodConfig, 'production');
        $this->assertTrue(true);
    }

    public function test_readiness_fails_when_queue_driver_is_unsupported_in_memory(): void
    {
        Cache::put('worker:heartbeat', time(), 60);

        config(['queue.default' => 'sync']);

        $response = $this->get('/api/v1/health/ready');
        $response->assertStatus(503);
        $this->assertSame('service_unavailable', $response->json('error.code'));

        config(['queue.default' => 'database']);
    }

    public function test_exception_reporting_emits_bounded_json_and_never_leaks_sentinel(): void
    {
        $sentinel = 'EXCEPTION_SECRET_' . Str::random(16);
        $logPath = storage_path('logs/laravel.log');

        // Clear existing log file before test
        File::put($logPath, '');

        // Report exception containing sentinel
        report(new \RuntimeException("Sensitive error with secret: {$sentinel}"));

        $logContent = File::get($logPath);
        $this->assertNotEmpty($logContent);

        // Verify secret sentinel was NEVER logged
        $this->assertStringNotContainsString($sentinel, $logContent);

        // Verify every log line is valid JSON
        $lines = array_filter(explode("\n", trim($logContent)));
        foreach ($lines as $line) {
            $decoded = json_decode($line, true);
            $this->assertNotNull($decoded, "Expected log line to be valid JSON: {$line}");
            if (($decoded['context']['category'] ?? '') === 'exception' || ($decoded['message'] ?? '') === 'application_exception') {
                $this->assertSame('RuntimeException', $decoded['context']['class'] ?? '');
                $this->assertSame(500, $decoded['context']['status'] ?? null);
            }
        }
    }

    public function test_early_rejection_paths_emit_correlated_json_request_logs(): void
    {
        $logPath = storage_path('logs/laravel.log');
        File::put($logPath, '');

        // 1. Untrusted host rejection (400)
        $res400 = $this->get('http://evil.untrusted.com/api/v1/health');
        $res400->assertStatus(400);

        // 2. CORS disallowed origin (403 preflight) with explicit allowed host
        $res403 = $this->call('OPTIONS', 'http://127.0.0.1:18084/api/v1/health', [], [], [], [
            'HTTP_ORIGIN' => 'https://malicious.example.com',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
        ]);
        $res403->assertStatus(403);

        $logContent = File::get($logPath);
        $lines = array_filter(explode("\n", trim($logContent)));
        $this->assertNotEmpty($lines);

        $statuses = [];
        foreach ($lines as $line) {
            $decoded = json_decode($line, true);
            $this->assertNotNull($decoded, "Expected log line to be valid JSON: {$line}");
            if (($decoded['message'] ?? '') === 'http_request') {
                $statuses[] = $decoded['context']['status'] ?? null;
                $this->assertNotEmpty($decoded['context']['requestId'] ?? '');
            }
        }

        $this->assertContains(400, $statuses);
        $this->assertContains(403, $statuses);
    }

    public function test_configuration_validator_rejects_non_positive_connect_timeout(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Invalid or unbounded database connect timeout');

        $config = $this->getValidProductionConfig();
        $config['database']['connections']['pgsql']['options'][\PDO::ATTR_TIMEOUT] = 0;

        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_excessive_connect_timeout(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Invalid or unbounded database connect timeout');

        $config = $this->getValidProductionConfig();
        $config['database']['connections']['pgsql']['options'][\PDO::ATTR_TIMEOUT] = 10;

        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_non_integer_connect_timeout(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Invalid or unbounded database connect timeout');

        $config = $this->getValidProductionConfig();
        $config['database']['connections']['pgsql']['options'][\PDO::ATTR_TIMEOUT] = 'abc';

        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_missing_connect_timeout_in_deployment(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Database connect timeout must be configured in deployment');

        $config = $this->getValidProductionConfig();
        unset($config['database']['connections']['pgsql']['options'][\PDO::ATTR_TIMEOUT]);

        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_non_positive_statement_timeout(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Invalid or unbounded database statement timeout');

        $config = $this->getValidProductionConfig();
        $config['database']['connections']['pgsql']['server_options']['statement_timeout'] = '0';

        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_excessive_statement_timeout(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Invalid or unbounded database statement timeout');

        $config = $this->getValidProductionConfig();
        $config['database']['connections']['pgsql']['server_options']['statement_timeout'] = '10000';

        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_missing_statement_timeout_in_deployment(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Database statement timeout must be configured in deployment');

        $config = $this->getValidProductionConfig();
        unset($config['database']['connections']['pgsql']['server_options']['statement_timeout']);

        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_missing_lock_timeout_in_deployment(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Database lock timeout must be configured in deployment');

        $config = $this->getValidProductionConfig();
        unset($config['database']['connections']['pgsql']['server_options']['lock_timeout']);

        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_masked_invalid_pdo_timeout_by_alias(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Invalid or unbounded database connect timeout');

        $config = $this->getValidProductionConfig();
        // Harmless top-level alias must NOT mask invalid actual PDO options
        $config['database']['connections']['pgsql']['connect_timeout'] = 1;
        $config['database']['connections']['pgsql']['options'][\PDO::ATTR_TIMEOUT] = 99;

        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_masked_invalid_statement_timeout_by_alias(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Invalid or unbounded database statement timeout');

        $config = $this->getValidProductionConfig();
        // Harmless top-level alias must NOT mask invalid server_options
        $config['database']['connections']['pgsql']['statement_timeout'] = 3000;
        $config['database']['connections']['pgsql']['server_options']['statement_timeout'] = 0;

        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_contradictory_connect_timeout_override(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Contradictory database connect timeout configuration');

        $config = $this->getValidProductionConfig();
        $config['database']['connections']['pgsql']['options'][\PDO::ATTR_TIMEOUT] = 3;
        $config['database']['connections']['pgsql']['url'] = 'postgres://prod_user:prod_pass@db.prod.com:5432/gaza_prod?sslmode=require&connect_timeout=2';

        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_contradictory_statement_timeout_override(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Contradictory database statement timeout configuration');

        $config = $this->getValidProductionConfig();
        $config['database']['connections']['pgsql']['server_options']['statement_timeout'] = '3000';
        $config['database']['connections']['pgsql']['url'] = 'postgres://prod_user:prod_pass@db.prod.com:5432/gaza_prod?sslmode=require&statement_timeout=2000';

        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_rejects_invalid_url_timeout_override(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Invalid or unbounded database connect timeout');

        $config = $this->getValidProductionConfig();
        $config['database']['connections']['pgsql']['url'] = 'postgres://prod_user:prod_pass@db.prod.com:5432/gaza_prod?sslmode=require&connect_timeout=-1';

        \App\Support\ConfigurationValidator::validate($config, 'production');
    }

    public function test_configuration_validator_accepts_valid_timeout_bounds(): void
    {
        $config = $this->getValidProductionConfig();
        $config['database']['connections']['pgsql']['options'][\PDO::ATTR_TIMEOUT] = 2;
        $config['database']['connections']['pgsql']['server_options']['statement_timeout'] = '2500';
        $config['database']['connections']['pgsql']['server_options']['lock_timeout'] = '2000';

        \App\Support\ConfigurationValidator::validate($config, 'production');
        $this->assertTrue(true);
    }
}
