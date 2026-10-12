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
        RateLimiter::for('contact_submission', static fn($request) => [Limit::perMinute(5)->by('contact_minute:'.$request->ip()), Limit::perHour(30)->by('contact_hour:'.$request->ip())]);
        RateLimiter::for('reservations_occupancy', static fn($request) =>
            Limit::perMinute(60)->by('res_occ:'.$request->ip()));

        $principal = static function ($request): string {
            $session = $request->attributes->get('identity_session_context');
            if ($session instanceof \App\Identity\Sessions\PassengerSessionContext && $session->getUserId()) return 'passenger:'.$session->getUserId();
            if ($session instanceof \App\Identity\Sessions\StaffSessionContext && $session->getStaffId()) return 'staff:'.$session->getStaffId();
            abort(401);
        };
        RateLimiter::for('reservations_read', static fn($request) => [
            Limit::perMinute(240)->by('res_read_ip:'.$request->ip()),
            Limit::perMinute(120)->by('res_read_user:'.$principal($request)),
        ]);

        RateLimiter::for('mvp_mail_write', static fn($request) => [
            Limit::perMinute(4)->by('mail_user:'.$principal($request)),
            Limit::perHour(20)->by('mail_ip:'.$request->ip()),
        ]);

        RateLimiter::for('reservations_write', static fn($request) => [
            Limit::perMinute(30)->by('res_write_ip:'.$request->ip()),
            Limit::perMinute(20)->by('res_write_user:'.$principal($request)),
        ]);
    }
}
