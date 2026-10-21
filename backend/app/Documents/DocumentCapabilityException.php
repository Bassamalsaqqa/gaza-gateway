<?php

declare(strict_types=1);

namespace App\Documents;

final class DocumentCapabilityException extends \RuntimeException
{
    public static function missingGd(): self
    {
        return new self('Document rendering requires the PHP GD extension.');
    }

    public static function missingFreeType(): self
    {
        return new self('Document rendering requires PHP GD FreeType support (imagettftext).');
    }

    public static function missingAsset(string $path): self
    {
        return new self(sprintf('Required document asset is missing or unreadable: %s', $path));
    }
}
