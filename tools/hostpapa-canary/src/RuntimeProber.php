<?php

declare(strict_types=1);

namespace HostPapaCanary;

/**
 * Probes the PHP runtime environment, required extensions, Argon2id capability,
 * and platform configuration parameters based on actual application calls.
 */
class RuntimeProber
{
    /**
     * Mandatory extensions actually required by Gaza Gateway application calls:
     * - pdo_mysql: MySQL 8.4 database connectivity
     * - openssl: Encryption, tokens, HTTPS TLS
     * - mbstring: Arabic (RTL) / English multibyte strings
     * - intl: ICU dates, numbers, multilingual collation
     * - fileinfo: PDF tickets and image MIME detection
     * - curl: HTTP client communication
     * - json: API payload serialization and JSON columns
     * - ctype, tokenizer, xml: Laravel Blade, routing, and container core
     */
    private const REQUIRED_APP_EXTENSIONS = [
        'pdo_mysql' => 'Database connectivity to MySQL 8.4',
        'openssl'   => 'HTTPS encryption, crypto tokens, TLS',
        'mbstring'  => 'Multilingual UTF-8 processing (Arabic/English)',
        'intl'      => 'Internationalization, ICU collations and formatting',
        'fileinfo'  => 'MIME-type detection for downloadable tickets/media',
        'curl'      => 'HTTP client and external verification',
        'json'      => 'JSON data columns and API payload processing',
        'ctype'     => 'Character type validation',
        'tokenizer' => 'Blade template and code tokenization',
        'xml'       => 'XML parsing for documents and sitemaps',
    ];

    /**
     * Optional / recommended platform extensions:
     * - sodium: Cryptographic primitives (optional if Argon2id core hash is available)
     * - gmp: GNU Multiple Precision arithmetic (observed active on HostPapa)
     * - bcmath: Arbitrary precision math
     * - zip: Archive generation
     * - pcntl, posix: CLI process control
     */
    private const RECOMMENDED_EXTENSIONS = [
        'sodium' => 'Libsodium primitives (app calls core password_hash with Argon2id)',
        'gmp'    => 'GMP high-precision math (observed active on HostPapa cPanel)',
        'bcmath' => 'Arbitrary precision mathematics',
        'zip'    => 'Zip archive generation and packaging',
        'pcntl'  => 'Process control (CLI workers, signal handling)',
        'posix'  => 'POSIX operating system API',
    ];

    private Sanitizer $sanitizer;

    public function __construct(Sanitizer $sanitizer)
    {
        $this->sanitizer = $sanitizer;
    }

    /**
     * Execute full runtime environment probing.
     *
     * @return array<string, mixed>
     */
    public function probe(): array
    {
        $phpVersion = PHP_VERSION;
        $phpVersionId = PHP_VERSION_ID;
        $sapi = php_sapi_name();

        // 1. Version evaluation (Target is PHP >= 8.4; HostPapa observed with PHP 8.5 and 8.4)
        $isPhp84Plus = $phpVersionId >= 80400;
        $versionStatus = $isPhp84Plus ? 'PASS' : 'WARNING_BELOW_84';
        $versionNote = $isPhp84Plus
            ? 'PHP version meets or exceeds Laravel 13 minimum (^8.4).'
            : 'Current PHP is below 8.4. In cPanel MultiPHP Manager, select PHP 8.4 or 8.5.';

        // 2. Extensions check based on actual application calls
        $extensionsReport = [];
        $missingRequired = [];

        foreach (self::REQUIRED_APP_EXTENSIONS as $ext => $description) {
            $loaded = extension_loaded($ext);
            $extensionsReport[$ext] = [
                'type'        => 'required_by_app',
                'loaded'      => $loaded,
                'status'      => $loaded ? 'PASS' : 'FAIL',
                'description' => $description,
            ];
            if (!$loaded) {
                $missingRequired[] = $ext;
            }
        }

        foreach (self::RECOMMENDED_EXTENSIONS as $ext => $description) {
            $loaded = extension_loaded($ext);
            $extensionsReport[$ext] = [
                'type'        => 'recommended_platform',
                'loaded'      => $loaded,
                'status'      => $loaded ? 'PASS' : 'OPTIONAL_MISSING',
                'description' => $description,
            ];
        }

        // 3. Argon2id password hashing check (core PHP password_hash)
        $argon2idReport = $this->probeArgon2id();

        // 4. Platform configuration settings
        $platformSettings = $this->probePlatformSettings();

        // Overall runtime verdict
        $allRequiredExtensionsLoaded = empty($missingRequired);
        $runtimePass = $isPhp84Plus && $allRequiredExtensionsLoaded && ($argon2idReport['status'] === 'PASS');

        return [
            'probe' => 'php_runtime',
            'overall_status' => $runtimePass ? 'PASS' : ($allRequiredExtensionsLoaded ? 'NOTICE_ACTION_REQUIRED' : 'FAIL'),
            'php_version' => [
                'version' => $phpVersion,
                'version_id' => $phpVersionId,
                'target_minimum' => '8.4.0',
                'status' => $versionStatus,
                'notes' => $versionNote,
            ],
            'sapi' => $sapi,
            'extensions' => [
                'summary' => sprintf(
                    '%d of %d required app extensions loaded',
                    count(self::REQUIRED_APP_EXTENSIONS) - count($missingRequired),
                    count(self::REQUIRED_APP_EXTENSIONS)
                ),
                'missing_required' => $missingRequired,
                'details' => $extensionsReport,
            ],
            'argon2id' => $argon2idReport,
            'platform' => $platformSettings,
        ];
    }

    /**
     * Probe Argon2id password hashing capability.
     *
     * @return array<string, mixed>
     */
    private function probeArgon2id(): array
    {
        if (!defined('PASSWORD_ARGON2ID')) {
            return [
                'supported' => false,
                'status' => 'FAIL',
                'error' => 'PASSWORD_ARGON2ID constant is not defined in this PHP build.',
            ];
        }

        try {
            $testPlaintext = 'canary_h0_probe_argon2id_' . bin2hex(random_bytes(8));
            $hash = password_hash($testPlaintext, PASSWORD_ARGON2ID, [
                'memory_cost' => 65536,
                'time_cost'   => 4,
                'threads'     => 1,
            ]);

            if ($hash === false || !str_starts_with($hash, '$argon2id$')) {
                return [
                    'supported' => false,
                    'status' => 'FAIL',
                    'error' => 'password_hash returned false or produced non-argon2id prefix.',
                ];
            }

            $verifyOk = password_verify($testPlaintext, $hash);
            if (!$verifyOk) {
                return [
                    'supported' => false,
                    'status' => 'FAIL',
                    'error' => 'password_verify failed against freshly generated Argon2id hash.',
                ];
            }

            return [
                'supported' => true,
                'status' => 'PASS',
                'algorithm' => 'PASSWORD_ARGON2ID',
                'hash_format' => '$argon2id$v=19$m=65536,t=4,p=1$...',
                'verified' => true,
            ];
        } catch (\Throwable $e) {
            return [
                'supported' => false,
                'status' => 'FAIL',
                'error' => $this->sanitizer->sanitizeString($e->getMessage()),
            ];
        }
    }

    /**
     * Probe php.ini platform settings.
     *
     * @return array<string, mixed>
     */
    private function probePlatformSettings(): array
    {
        $memoryLimit = ini_get('memory_limit') ?: 'unspecified';
        $maxExecutionTime = ini_get('max_execution_time') ?: 'unspecified';
        $uploadMaxFilesize = ini_get('upload_max_filesize') ?: 'unspecified';
        $postMaxSize = ini_get('post_max_size') ?: 'unspecified';
        $disabledFunctions = ini_get('disable_functions') ?: '';
        $timezone = date_default_timezone_get();

        $opensslVersion = defined('OPENSSL_VERSION_TEXT') ? OPENSSL_VERSION_TEXT : 'unknown';
        $icuVersion = defined('INTL_ICU_VERSION') ? INTL_ICU_VERSION : 'unknown';

        return [
            'memory_limit' => $memoryLimit,
            'max_execution_time' => $maxExecutionTime,
            'timezone' => $timezone,
            'upload_max_filesize' => $uploadMaxFilesize,
            'post_max_size' => $postMaxSize,
            'openssl_version' => $opensslVersion,
            'icu_version' => $icuVersion,
            'disabled_functions_count' => $disabledFunctions !== '' ? count(explode(',', $disabledFunctions)) : 0,
            'disabled_functions' => $disabledFunctions !== ''
                ? array_map('trim', explode(',', $disabledFunctions))
                : [],
        ];
    }
}
