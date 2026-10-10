<?php

use App\Http\Controllers\SystemController;
use App\Http\Middleware\CustomCorsGuard;
use App\Http\Middleware\EnsureRequestId;
use App\Http\Middleware\SecurityHeaders;
use App\Http\Middleware\StrictHostGuard;
use App\Http\Middleware\StructuredRequestLogging;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->remove([
            \Illuminate\Http\Middleware\HandleCors::class,
            \Illuminate\Http\Middleware\TrustHosts::class,
        ]);
        $middleware->use([
            SecurityHeaders::class,
            EnsureRequestId::class,
            StructuredRequestLogging::class,
            StrictHostGuard::class,
            CustomCorsGuard::class,
            \App\Http\Middleware\Identity\VerifyApplicationCsrfHeader::class,
            \Illuminate\Foundation\Http\Middleware\PreventRequestsDuringMaintenance::class,
            \Illuminate\Http\Middleware\ValidatePostSize::class,
            \Illuminate\Foundation\Http\Middleware\TrimStrings::class,
            \Illuminate\Foundation\Http\Middleware\ConvertEmptyStringsToNull::class,
        ]);

        $isIdentityRequest = static function (Request $request): bool {
            if ($request->attributes->has('operation_policy')) {
                return true;
            }
            $path = rawurldecode($request->path());
            return $path === 'api/v1/auth'
                || str_starts_with($path, 'api/v1/auth/')
                || $path === 'api/v1/staff'
                || str_starts_with($path, 'api/v1/staff/')
                || $path === 'auth'
                || str_starts_with($path, 'auth/')
                || $path === 'staff'
                || str_starts_with($path, 'staff/');
        };

        $middleware->trimStrings(except: [
            $isIdentityRequest,
        ]);

        $middleware->convertEmptyStringsToNull(except: [
            $isIdentityRequest,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->reportable(function (\Throwable $e) {
            $status = $e instanceof \Symfony\Component\HttpKernel\Exception\HttpExceptionInterface
                ? $e->getStatusCode()
                : 500;

            $request = app()->bound('request') ? app('request') : null;
            $requestId = \App\Support\RequestCorrelation::fromRequest($request);

            \Illuminate\Support\Facades\Log::error('application_exception', [
                'category' => 'exception',
                'class' => get_class($e),
                'status' => $status,
                'requestId' => $requestId,
            ]);

            // Return false to halt default unredacted reporting pipeline
            return false;
        });

        $exceptions->render(function (\Throwable $e, Request $request) {
            return SystemController::formatExceptionResponse($e, $request);
        });
    })->create();
