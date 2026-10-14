<?php
declare(strict_types=1);
namespace App\Support;
use App\SharedHosting\SharedHostingProfile;
use Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException;

/** Revalidate after the reference domain lock, including previously admitted requests. */
final class ReferenceWriteBarrier
{
    public static function guard(): void
    {
        try {
            foreach (['framework/maintenance.php', 'framework/down'] as $relative) {
                $path = storage_path($relative);
                clearstatcache(true, $path);
                if (file_exists($path) || is_link($path)) throw new ServiceUnavailableHttpException();
            }
            if (app()->isDownForMaintenance()) throw new ServiceUnavailableHttpException();
            if (!SharedHostingProfile::isEnabled()) return;
            $base = rtrim(str_replace('\\', '/', base_path()), '/');
            if (!preg_match('#^(.+)/releases/([A-Za-z0-9_]{1,128})/backend$#D', $base, $match)) {
                throw new ServiceUnavailableHttpException();
            }
            $pointer = $match[1] . '/current-release.txt';
            clearstatcache(true, $pointer);
            if (is_link($pointer) || !is_file($pointer) || !is_readable($pointer)) {
                throw new ServiceUnavailableHttpException();
            }
            $bytes = file_get_contents($pointer);
            $active = $bytes === false ? '' : trim($bytes);
            if (!preg_match('/^[A-Za-z0-9_]{1,128}$/D', $active) || $active !== $match[2]) {
                throw new ServiceUnavailableHttpException();
            }
        } catch (\Throwable $error) {
            throw new ServiceUnavailableHttpException(null, 'Service temporarily unavailable.', $error);
        }
    }
}
