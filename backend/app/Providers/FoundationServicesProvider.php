<?php

declare(strict_types=1);

namespace App\Providers;

use App\Contracts\Mail\MailSubmissionInterface;
use App\Contracts\Storage\PrivateStorageInterface;
use App\Services\Foundation\Mail\LocalFileMailGateway;
use App\Services\Foundation\Mail\UnconfiguredMailGateway;
use App\Services\Foundation\Storage\LocalPrivateStorage;
use App\Services\Foundation\Storage\UnconfiguredPrivateStorage;
use Illuminate\Support\ServiceProvider;

/**
 * Service provider for Phase 13A bounded mail and private storage provider seams.
 *
 * Strictly enforces environment isolation:
 * - 'local' and 'testing' environments may bind honest local file adapters.
 * - 'staging' and 'production' environments ALWAYS bind unconfigured fail-closed adapters,
 *   regardless of any configuration flags, to prevent accidental local data retention in deployment.
 */
class FoundationServicesProvider extends ServiceProvider
{
    /**
     * Register services in the container.
     */
    public function register(): void
    {
        $this->mergeConfigFrom(
            dirname(__DIR__, 2) . '/config/foundation-services.php',
            'foundation-services'
        );

        $this->registerMailSeam();
        $this->registerStorageSeam();
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Seams are initialized lazily upon resolution to avoid I/O during boot of unused seams.
    }

    private function registerMailSeam(): void
    {
        $this->app->singleton(MailSubmissionInterface::class, function ($app) {
            $isLocalOrTesting = $app->environment('local', 'testing');
            $driver = $app['config']->get('foundation-services.mail.driver', 'local');

            // Gate: Staging and production MUST NOT use local file mail capture under any circumstance
            if ($isLocalOrTesting && $driver === 'local') {
                $path = $app['config']->get(
                    'foundation-services.mail.local_path',
                    storage_path('app/private/mail_sink')
                );
                $fileMode = (int) $app['config']->get('foundation-services.mail.file_mode', 0600);
                $dirMode = (int) $app['config']->get('foundation-services.mail.dir_mode', 0700);

                return new LocalFileMailGateway(
                    storagePath: $path,
                    fileMode: $fileMode,
                    dirMode: $dirMode,
                );
            }

            return new UnconfiguredMailGateway();
        });
    }

    private function registerStorageSeam(): void
    {
        $this->app->singleton(PrivateStorageInterface::class, function ($app) {
            $isLocalOrTesting = $app->environment('local', 'testing');
            $driver = $app['config']->get('foundation-services.storage.driver', 'local');

            // Gate: Staging and production MUST NOT use local disk storage under any circumstance
            if ($isLocalOrTesting && $driver === 'local') {
                $root = $app['config']->get(
                    'foundation-services.storage.local_root',
                    storage_path('app/private/object_storage')
                );
                $maxBytes = (int) $app['config']->get(
                    'foundation-services.storage.max_object_bytes',
                    LocalPrivateStorage::DEFAULT_MAX_OBJECT_BYTES
                );
                $fileMode = (int) $app['config']->get('foundation-services.storage.file_mode', 0600);
                $dirMode = (int) $app['config']->get('foundation-services.storage.dir_mode', 0700);

                return new LocalPrivateStorage(
                    storageRoot: $root,
                    maxObjectBytes: $maxBytes,
                    fileMode: $fileMode,
                    dirMode: $dirMode,
                );
            }

            return new UnconfiguredPrivateStorage();
        });
    }
}
