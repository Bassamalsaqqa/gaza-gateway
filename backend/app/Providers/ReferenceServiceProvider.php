<?php
declare(strict_types=1);

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

final class ReferenceServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        RateLimiter::for('reference', static fn($request) =>
            Limit::perMinute(120)->by('reference:'.$request->ip()));
    }
}
