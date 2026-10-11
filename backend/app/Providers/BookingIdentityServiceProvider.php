<?php

declare(strict_types=1);

namespace App\Providers;

use App\Identity\Audit\AuditWriter;
use App\Identity\Booking\BookingAccessCoordinator;
use App\Identity\Dispatch\OutboxService;
use App\Identity\Proofs\GuestOtpPepperRing;
use App\Identity\RateLimiting\DurableRateLimiter;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\ServiceProvider;
use Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException;

final class BookingIdentityServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(\App\Identity\Booking\BookingGrantAuthority::class,
            fn () => new \App\Identity\Booking\BookingGrantAuthority(DB::connection()));
        $this->app->singleton(BookingAccessCoordinator::class, function ($app) {
            $encoded = config('identity-guest.pepper_base64');
            $version = config('identity-guest.pepper_version');
            $raw = is_string($encoded) ? base64_decode($encoded, true) : false;
            if ($raw === false || strlen($raw) < 32 || base64_encode($raw) !== $encoded
                || !is_numeric($version) || (string) (int) $version !== (string) $version || (int) $version < 1) {
                throw new ServiceUnavailableHttpException(null, 'Guest identity configuration is unavailable.');
            }
            $ring = new GuestOtpPepperRing([(int) $version => $raw], (int) $version);
            $db = DB::connection(); $encrypter = $app->make(Encrypter::class);
            return new BookingAccessCoordinator($db, $encrypter, $ring, $app->make(DurableRateLimiter::class),
                new OutboxService($encrypter, $db, $ring), $app->make(AuditWriter::class));
        });
    }
}
