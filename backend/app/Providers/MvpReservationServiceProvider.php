<?php

declare(strict_types=1);

namespace App\Providers;

use App\Mvp\Reservations\FailClosedReservationOfferingAuthority;
use App\Mvp\Reservations\OfferingResolverReservationAuthority;
use App\Mvp\Reservations\ReservationCoordinator;
use App\Mvp\Reservations\ReservationOfferingAuthority;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

final class MvpReservationServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(ReservationCoordinator::class);

        $authorityClass = match (config('reservations.authority')) {
            'resolver' => OfferingResolverReservationAuthority::class,
            default => FailClosedReservationOfferingAuthority::class,
        };
        $this->app->bind(ReservationOfferingAuthority::class, $authorityClass);
    }

    public function boot(): void
    {
        RateLimiter::for('reservations_occupancy', static fn($request) =>
            Limit::perMinute(60)->by('res_occ:'.$request->ip()));

        RateLimiter::for('reservations_write', static fn($request) => [
            Limit::perMinute(30)->by('res_write_ip:'.$request->ip()),
            Limit::perMinute(20)->by('res_write_user:'.($request->attributes->get('identity_session_context')?->getUserId() ?? 'anon')),
        ]);
    }
}
