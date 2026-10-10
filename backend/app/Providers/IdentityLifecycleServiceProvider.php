<?php

declare(strict_types=1);

namespace App\Providers;

use App\Contracts\Mail\MailSubmissionInterface;
use App\Identity\Audit\AuditWriter;
use App\Identity\Dispatch\LocalCaptureRetentionManager;
use App\Identity\Dispatch\OutboxDispatcher;
use App\Identity\Dispatch\OutboxService;
use App\Identity\Dispatch\OwnedCaptureRetentionLedger;
use App\Identity\Proofs\GuestOtpPepperRing;
use App\Identity\Proofs\ProofService;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\ServiceProvider;

/**
 * Service provider for Phase 13B identity lifecycle primitives.
 *
 * NOTE: Unregistered until downstream package integration.
 * Binds durable proofs, transactional outbox dispatch, retention cleanup, and audit writer.
 */
class IdentityLifecycleServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(ProofService::class, function () {
            return new ProofService(
                db: DB::connection(),
            );
        });

        $this->app->singleton(OutboxService::class, function ($app) {
            return new OutboxService(
                encrypter: $app->make(Encrypter::class),
                db: DB::connection(),
                guestPepperRing: $app->bound(GuestOtpPepperRing::class)
                    ? $app->make(GuestOtpPepperRing::class)
                    : null,
            );
        });

        $this->app->singleton(OwnedCaptureRetentionLedger::class, function ($app) {
            $sinkPath = $app['config']->get(
                'foundation-services.mail.local_path',
                storage_path('app/private/mail_sink')
            );
            return new OwnedCaptureRetentionLedger(
                ownedRootDirectory: $sinkPath,
                db: DB::connection(),
            );
        });

        $this->app->singleton(OutboxDispatcher::class, function ($app) {
            // Validate ownership before the foundation gateway can create/chmod a sink.
            $local = $app->environment('local', 'testing')
                && $app['config']->get('foundation-services.mail.driver', 'local') === 'local';
            $ledger = $local ? $app->make(OwnedCaptureRetentionLedger::class) : null;
            return new OutboxDispatcher(
                mailSubmission: $app->make(MailSubmissionInterface::class),
                encrypter: $app->make(Encrypter::class),
                db: DB::connection(),
                captureLedger: $ledger,
            );
        });

        $this->app->singleton(LocalCaptureRetentionManager::class, function () {
            return new LocalCaptureRetentionManager();
        });

        $this->app->singleton(AuditWriter::class, function () {
            return new AuditWriter(
                db: DB::connection(),
            );
        });
    }

    public function boot(): void
    {
    }
}
