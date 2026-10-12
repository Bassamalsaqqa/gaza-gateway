<?php

declare(strict_types=1);

namespace Tests\SharedHostingRuntime;

use App\SharedHosting\SharedHostingProfile;
use App\Support\ConfigurationValidator;
use PHPUnit\Framework\TestCase;

class SharedHostingProfileTest extends TestCase
{
    public function test_private_root_rejects_symlink_ancestors_before_creating_files(): void
    {
        $root = sys_get_temp_dir().'/gza-private-'.bin2hex(random_bytes(6));
        mkdir($root, 0700);
        mkdir($root.'/public_html', 0700);
        symlink($root.'/public_html', $root.'/alias');
        try {
            try {
                SharedHostingProfile::assertPrivateStorageRoot($root.'/alias/not-created');
                $this->fail('A public symlink ancestor must be rejected.');
            } catch (\RuntimeException) {
                $this->assertDirectoryDoesNotExist($root.'/public_html/not-created');
            }
            SharedHostingProfile::assertPrivateStorageRoot($root.'/private/not-created');
            $this->assertDirectoryDoesNotExist($root.'/private');
        } finally {
            unlink($root.'/alias');
            rmdir($root.'/public_html');
            rmdir($root);
        }
    }
    public function test_validate_origin_approves_canonical_production_origins(): void
    {
        $this->assertTrue(SharedHostingProfile::validateOrigin('https://www.gazaairport.com', 'production'));
        $this->assertTrue(SharedHostingProfile::validateOrigin('https://gazaairport.com', 'production'));
    }

    public function test_validate_origin_approves_canonical_staging_origin(): void
    {
        $this->assertTrue(SharedHostingProfile::validateOrigin('https://staging.gazaairport.com', 'staging'));
    }

    public function test_validate_origin_rejects_insecure_http_in_production_and_staging(): void
    {
        $this->assertFalse(SharedHostingProfile::validateOrigin('http://www.gazaairport.com', 'production'));
        $this->assertFalse(SharedHostingProfile::validateOrigin('http://gazaairport.com', 'production'));
        $this->assertFalse(SharedHostingProfile::validateOrigin('http://staging.gazaairport.com', 'staging'));
    }

    public function test_validate_origin_rejects_unapproved_subdomains_and_external_origins(): void
    {
        // Separate subdomain api.gazaairport.com is disallowed (same-origin topology on HostPapa shared hosting)
        $this->assertFalse(SharedHostingProfile::validateOrigin('https://api.gazaairport.com', 'production'));
        $this->assertFalse(SharedHostingProfile::validateOrigin('https://admin.gazaairport.com', 'production'));
        $this->assertFalse(SharedHostingProfile::validateOrigin('https://mail.gazaairport.com', 'production'));

        // External or spoofed domains
        $this->assertFalse(SharedHostingProfile::validateOrigin('https://evil.com', 'production'));
        $this->assertFalse(SharedHostingProfile::validateOrigin('https://gazaairport.com.attacker.com', 'production'));
        $this->assertFalse(SharedHostingProfile::validateOrigin('https://not-gazaairport.com', 'production'));
    }

    public function test_validate_origin_rejects_userinfo_query_fragment_and_custom_ports(): void
    {
        $this->assertFalse(SharedHostingProfile::validateOrigin('https://user:pass@www.gazaairport.com', 'production'));
        $this->assertFalse(SharedHostingProfile::validateOrigin('https://www.gazaairport.com?query=1', 'production'));
        $this->assertFalse(SharedHostingProfile::validateOrigin('https://www.gazaairport.com#frag', 'production'));
        $this->assertFalse(SharedHostingProfile::validateOrigin('https://www.gazaairport.com:8443', 'production'));
        $this->assertFalse(SharedHostingProfile::validateOrigin('https://staging.gazaairport.com:444', 'staging'));
    }

    public function test_validate_base_url_normalizes_and_validates(): void
    {
        $normalized = SharedHostingProfile::validateBaseUrl('https://www.gazaairport.com/api/v1', 'production');
        $this->assertSame('https://www.gazaairport.com/api/v1', $normalized);

        $normalizedApex = SharedHostingProfile::validateBaseUrl('https://gazaairport.com/api/v1', 'production');
        $this->assertSame('https://gazaairport.com/api/v1', $normalizedApex);

        $normalizedRoot = SharedHostingProfile::validateBaseUrl('https://www.gazaairport.com', 'production');
        $this->assertSame('https://www.gazaairport.com/api/v1', $normalizedRoot);

        $this->assertNull(SharedHostingProfile::validateBaseUrl('http://www.gazaairport.com/api/v1', 'production'));
        $this->assertNull(SharedHostingProfile::validateBaseUrl('https://api.gazaairport.com/api/v1', 'production'));
        $this->assertNull(SharedHostingProfile::validateBaseUrl('https://www.gazaairport.com/api/v2', 'production'));
        $this->assertNull(SharedHostingProfile::validateBaseUrl('https://www.gazaairport.com//api/v1', 'production'));
    }

    public function test_validate_smtp_enforces_exact_operator_allowlist_and_implicit_tls(): void
    {
        // Port 465 (implicit TLS) with approved operator host mail.gazaairport.com
        $this->assertTrue(SharedHostingProfile::validateSmtp('mail.gazaairport.com', 465, 'tls', 'production'));
        $this->assertTrue(SharedHostingProfile::validateSmtp('mail.gazaairport.com', 465, 'ssl', 'production'));

        // Port 587 (STARTTLS) with approved operator host
        $this->assertTrue(SharedHostingProfile::validateSmtp('mail.gazaairport.com', 587, 'tls', 'production'));
        $this->assertTrue(SharedHostingProfile::validateSmtp('mail.gazaairport.com', 587, 'starttls', 'production'));

        // Rejection of plaintext port 25 or null encryption
        $this->assertFalse(SharedHostingProfile::validateSmtp('mail.gazaairport.com', 25, null, 'production'));
        $this->assertFalse(SharedHostingProfile::validateSmtp('mail.gazaairport.com', 25, '', 'production'));
        $this->assertFalse(SharedHostingProfile::validateSmtp('mail.gazaairport.com', 465, null, 'production'));

        // Rejection of arbitrary SMTP host / SSRF
        $this->assertFalse(SharedHostingProfile::validateSmtp('127.0.0.1', 465, 'tls', 'production'));
        $this->assertFalse(SharedHostingProfile::validateSmtp('localhost', 465, 'tls', 'production'));
        $this->assertFalse(SharedHostingProfile::validateSmtp('169.254.169.254', 465, 'tls', 'production'));
        $this->assertFalse(SharedHostingProfile::validateSmtp('smtp.sendgrid.net', 465, 'tls', 'production'));
        $this->assertFalse(SharedHostingProfile::validateSmtp('mail.evil.com', 465, 'tls', 'production'));
    }

    public function test_configuration_validator_production_hosts_and_app_url(): void
    {
        // Valid canonical production hosts
        ConfigurationValidator::validateProductionHosts('www.gazaairport.com,gazaairport.com');
        ConfigurationValidator::validateProductionHosts('www.gazaairport.com');
        ConfigurationValidator::validateProductionHosts('gazaairport.com');

        // Valid canonical APP_URL
        ConfigurationValidator::validateProductionAppUrl('https://www.gazaairport.com');
        ConfigurationValidator::validateProductionAppUrl('https://gazaairport.com');

        // Invalid hosts rejected
        $this->expectException(\RuntimeException::class);
        ConfigurationValidator::validateProductionHosts('unauthorized.gazaairport.com');
    }

    public function test_configuration_validator_rejects_insecure_production_app_url(): void
    {
        $this->expectException(\RuntimeException::class);
        ConfigurationValidator::validateProductionAppUrl('http://www.gazaairport.com');
    }

    public function test_configuration_validator_allowed_origins_validation(): void
    {
        ConfigurationValidator::validateAllowedOrigins(
            ['https://www.gazaairport.com', 'https://gazaairport.com'],
            'production'
        );

        ConfigurationValidator::validateAllowedOrigins(
            ['https://staging.gazaairport.com'],
            'staging'
        );

        // Insecure origin in production must throw
        $this->expectException(\RuntimeException::class);
        ConfigurationValidator::validateAllowedOrigins(
            ['http://www.gazaairport.com'],
            'production'
        );
    }

    public function test_strict_boolean_parser(): void
    {
        $this->assertTrue(SharedHostingProfile::parseStrictBoolean(true));
        $this->assertTrue(SharedHostingProfile::parseStrictBoolean('true'));
        $this->assertTrue(SharedHostingProfile::parseStrictBoolean('TRUE'));
        $this->assertTrue(SharedHostingProfile::parseStrictBoolean('1'));

        $this->assertFalse(SharedHostingProfile::parseStrictBoolean(false));
        $this->assertFalse(SharedHostingProfile::parseStrictBoolean('false'));
        $this->assertFalse(SharedHostingProfile::parseStrictBoolean('0'));
        $this->assertFalse(SharedHostingProfile::parseStrictBoolean(''));
        $this->assertFalse(SharedHostingProfile::parseStrictBoolean(null));
        $this->assertFalse(SharedHostingProfile::parseStrictBoolean('banana'));
        $this->assertFalse(SharedHostingProfile::parseStrictBoolean('yes'));
        $this->assertFalse(SharedHostingProfile::parseStrictBoolean(123));
        $this->assertFalse(SharedHostingProfile::parseStrictBoolean([]));
    }

    public function test_validate_origin_rejects_legacy_unproven_hosts(): void
    {
        $this->assertFalse(SharedHostingProfile::validateOrigin('https://api.gazaairport.com', 'production'));
        $this->assertFalse(SharedHostingProfile::validateOrigin('https://staging-api.gazaairport.com', 'staging'));
    }

    public function test_validate_base_url_rejects_legacy_unproven_hosts(): void
    {
        $this->assertNull(SharedHostingProfile::validateBaseUrl('https://api.gazaairport.com/api/v1', 'production'));
        $this->assertNull(SharedHostingProfile::validateBaseUrl('https://staging-api.gazaairport.com/api/v1', 'staging'));
    }

    public function test_validate_deployment_profile_rejects_storage_in_public_html(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Storage root must be outside public_html');

        $config = [
            'app' => [
                'debug' => false,
                'url' => 'https://www.gazaairport.com',
                'allowed_hosts' => ['www.gazaairport.com'],
            ],
            'cors' => [
                'allowed_origins' => ['https://www.gazaairport.com'],
            ],
            'foundation-services' => [
                'storage' => [
                    'local_root' => '/home/user/public_html/storage/private',
                ],
            ],
        ];

        SharedHostingProfile::validateDeploymentProfile($config, 'production');
    }

    public function test_validate_deployment_profile_rejects_legacy_staging_host(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Unauthorized host [staging-api.gazaairport.com] in staging allowlist');

        $config = [
            'app' => [
                'debug' => false,
                'url' => 'https://staging.gazaairport.com',
                'allowed_hosts' => ['staging-api.gazaairport.com'],
            ],
            'cors' => [
                'allowed_origins' => ['https://staging.gazaairport.com'],
            ],
        ];

        SharedHostingProfile::validateDeploymentProfile($config, 'staging');
    }
}
