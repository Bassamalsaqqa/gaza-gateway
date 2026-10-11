<?php

declare(strict_types=1);

namespace Tests\Fixtures\IdentityFinal;

use App\Identity\Protocol\IdentityOperationPolicies;
use Illuminate\Foundation\Http\Events\RequestHandled;

/** Optional actual-kernel success captures; never record request credentials. */
final class HttpCaptureRecorder
{
    public static function install(\Illuminate\Foundation\Application $app): void
    {
        $run = getenv('IDENTITY_FINAL_CAPTURE_RUN');
        if ($run === false || $run === '') { return; }
        if (!preg_match('/^[a-f0-9]{32}$/D', $run)
            || getenv('IDENTITY_MIGRATION_DISPOSABLE_INSTANCE') !== '1') {
            throw new \RuntimeException('Final captures require the owned disposable gate.');
        }
        $parent = storage_path('app/private');
        if (is_link($parent) || (!is_dir($parent) && !mkdir($parent, 0700, true))) {
            throw new \RuntimeException('Private capture parent unavailable.');
        }
        $root = $parent . '/final-identity-' . $run;
        $marker = $root . '/.owned';
        $mask = umask(0077);
        try {
            if (!file_exists($root)) {
                if (!mkdir($root, 0700)) { throw new \RuntimeException('Capture root unavailable.'); }
                self::write($marker, $run);
            }
            if (is_link($root) || is_link($marker) || !is_dir($root)
                || (fileperms($root) & 0777) !== 0700 || !is_file($marker)
                || file_get_contents($marker) !== $run) {
                throw new \RuntimeException('Foreign capture root rejected.');
            }
        } finally { umask($mask); }
        $app['events']->listen(RequestHandled::class, static function (RequestHandled $event) use ($root): void {
            $policy = IdentityOperationPolicies::find($event->request->method(), $event->request->getPathInfo());
            $status = $event->response->getStatusCode();
            if ($policy === null || $status < 200 || $status >= 300) { return; }
            // One first successful response per operation, fixed closed operation IDs.
            $path = $root . '/' . $policy['operationId'] . '.json';
            if (file_exists($path)) { return; }
            $body = $event->response->getContent();
            if (!is_string($body) || strlen($body) > 131072) { throw new \RuntimeException('Capture body bound exceeded.'); }
            self::write($path, json_encode(['operationId' => $policy['operationId'], 'status' => $status,
                'contentType' => $event->response->headers->get('Content-Type'), 'rawResponseBody' => $body], JSON_THROW_ON_ERROR));
        });
    }

    private static function write(string $path, string $bytes): void
    {
        $mask = umask(0077); $file = false;
        try {
            $file = fopen($path, 'x');
            if ($file === false || fwrite($file, $bytes) !== strlen($bytes) || !fflush($file) || !fsync($file)
                || !chmod($path, 0600)) { throw new \RuntimeException('Exclusive capture write failed.'); }
        } finally { if (is_resource($file)) { fclose($file); } umask($mask); }
    }
}
