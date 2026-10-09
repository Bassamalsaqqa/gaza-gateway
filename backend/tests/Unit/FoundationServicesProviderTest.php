<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Contracts\Mail\MailSubmissionInterface;
use App\Contracts\Storage\PrivateStorageInterface;
use App\Providers\FoundationServicesProvider;
use App\Services\Foundation\Mail\LocalFileMailGateway;
use App\Services\Foundation\Mail\UnconfiguredMailGateway;
use App\Services\Foundation\Storage\LocalPrivateStorage;
use App\Services\Foundation\Storage\UnconfiguredPrivateStorage;
use Illuminate\Foundation\Application;
use PHPUnit\Framework\TestCase;

class FoundationServicesProviderTest extends TestCase
{
    private string $tempMailDir;
    private string $tempStorageDir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tempMailDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'gza_provider_mail_' . bin2hex(random_bytes(6));
        $this->tempStorageDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'gza_provider_storage_' . bin2hex(random_bytes(6));
        @mkdir($this->tempMailDir, 0700, true);
        @mkdir($this->tempStorageDir, 0700, true);
    }

    protected function tearDown(): void
    {
        @restore_error_handler();
        @restore_exception_handler();
        $this->cleanDirectory($this->tempMailDir);
        $this->cleanDirectory($this->tempStorageDir);
        parent::tearDown();
    }

    private function createFreshApp(string $env): Application
    {
        if (empty(getenv('APP_KEY'))) {
            $disposableKey = 'base64:' . base64_encode(random_bytes(32));
            putenv("APP_KEY={$disposableKey}");
            $_ENV['APP_KEY'] = $disposableKey;
            $_SERVER['APP_KEY'] = $disposableKey;
        }

        /** @var Application $app */
        $app = require __DIR__ . '/../../bootstrap/app.php';
        $app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
        $app['env'] = $env;

        $app['config']->set('foundation-services.mail.local_path', $this->tempMailDir);
        $app['config']->set('foundation-services.storage.local_root', $this->tempStorageDir);

        return $app;
    }

    public function test_testing_env_binds_local_adapters_when_configured(): void
    {
        $app = $this->createFreshApp('testing');
        $app['config']->set('foundation-services.mail.driver', 'local');
        $app['config']->set('foundation-services.storage.driver', 'local');

        $mailService = $app->make(MailSubmissionInterface::class);
        $storageService = $app->make(PrivateStorageInterface::class);

        $this->assertInstanceOf(LocalFileMailGateway::class, $mailService);
        $this->assertInstanceOf(LocalPrivateStorage::class, $storageService);
    }

    public function test_local_env_binds_local_adapters_when_configured(): void
    {
        $app = $this->createFreshApp('local');
        $app['config']->set('foundation-services.mail.driver', 'local');
        $app['config']->set('foundation-services.storage.driver', 'local');

        $mailService = $app->make(MailSubmissionInterface::class);
        $storageService = $app->make(PrivateStorageInterface::class);

        $this->assertInstanceOf(LocalFileMailGateway::class, $mailService);
        $this->assertInstanceOf(LocalPrivateStorage::class, $storageService);
    }

    public function test_testing_env_binds_unconfigured_when_explicitly_configured(): void
    {
        $app = $this->createFreshApp('testing');
        $app['config']->set('foundation-services.mail.driver', 'unconfigured');
        $app['config']->set('foundation-services.storage.driver', 'unconfigured');

        $mailService = $app->make(MailSubmissionInterface::class);
        $storageService = $app->make(PrivateStorageInterface::class);

        $this->assertInstanceOf(UnconfiguredMailGateway::class, $mailService);
        $this->assertInstanceOf(UnconfiguredPrivateStorage::class, $storageService);
    }

    public function test_production_env_strictly_binds_unconfigured_adapters_even_with_local_flags(): void
    {
        $app = $this->createFreshApp('production');
        // Malicious or accidental configuration attempt to enable local sink in production
        $app['config']->set('foundation-services.mail.driver', 'local');
        $app['config']->set('foundation-services.storage.driver', 'local');

        $mailService = $app->make(MailSubmissionInterface::class);
        $storageService = $app->make(PrivateStorageInterface::class);

        // Ironclad isolation: must be unconfigured fail-closed adapters
        $this->assertInstanceOf(UnconfiguredMailGateway::class, $mailService);
        $this->assertInstanceOf(UnconfiguredPrivateStorage::class, $storageService);
    }

    public function test_staging_env_strictly_binds_unconfigured_adapters_even_with_local_flags(): void
    {
        $app = $this->createFreshApp('staging');
        // Malicious or accidental configuration attempt to enable local sink in staging
        $app['config']->set('foundation-services.mail.driver', 'local');
        $app['config']->set('foundation-services.storage.driver', 'local');

        $mailService = $app->make(MailSubmissionInterface::class);
        $storageService = $app->make(PrivateStorageInterface::class);

        // Ironclad isolation: must be unconfigured fail-closed adapters
        $this->assertInstanceOf(UnconfiguredMailGateway::class, $mailService);
        $this->assertInstanceOf(UnconfiguredPrivateStorage::class, $storageService);
    }

    public function test_unused_provider_seams_do_not_throw_during_boot(): void
    {
        $app = $this->createFreshApp('production');

        // Application booted without resolving mail or storage must not throw
        $this->assertTrue($app->isBooted());
        $this->assertTrue($app->bound(MailSubmissionInterface::class));
        $this->assertTrue($app->bound(PrivateStorageInterface::class));
    }

    private function cleanDirectory(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }

        $items = scandir($dir);
        if ($items === false) {
            return;
        }

        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $path = $dir . DIRECTORY_SEPARATOR . $item;
            if (is_dir($path)) {
                $this->cleanDirectory($path);
            } else {
                @unlink($path);
            }
        }

        @rmdir($dir);
    }
}
