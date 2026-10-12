<?php

declare(strict_types=1);

namespace App\Deployment;

use App\SharedHosting\SharedHostingProfile;

/** Reads only the release installer's private, owner-controlled bootstrap file. */
final class PrivateOwnerInput
{
    public static function read(string $path): array
    {
        SharedHostingProfile::assertPrivateStorageRoot($path);
        $resolved = realpath($path);
        if ($resolved === false || !is_file($resolved) || is_link($path)) {
            throw new \RuntimeException('Private owner input refused.');
        }
        $handle = @fopen($resolved, 'rb');
        if ($handle === false) {
            throw new \RuntimeException('Private owner input refused.');
        }
        try {
            $stat = fstat($handle);
            $current = lstat($path);
            if ($stat === false || $current === false
                || ($stat['mode'] & 0170000) !== 0100000
                || ($stat['mode'] & 0077) !== 0 || $stat['size'] > 16384
                || $stat['ino'] !== $current['ino'] || $stat['dev'] !== $current['dev']
                || (function_exists('posix_geteuid') && $stat['uid'] !== posix_geteuid())) {
                throw new \RuntimeException('Private owner input refused.');
            }
            $bytes = stream_get_contents($handle, 16385);
            if ($bytes === false || strlen($bytes) > 16384) {
                throw new \RuntimeException('Private owner input refused.');
            }
            $input = json_decode($bytes, true, 16, JSON_THROW_ON_ERROR);
            if (!is_array($input) || array_is_list($input)) {
                throw new \RuntimeException('Private owner input refused.');
            }
            return $input;
        } finally {
            fclose($handle);
        }
    }
}
