<?php

declare(strict_types=1);

namespace App\Gallery\Validation;

use App\Gallery\Exceptions\GalleryValidationException;

final class GalleryValidator
{
    public const MAX_ITEMS = 100;
    public const MAX_TITLE_LENGTH = 500;
    public const MAX_CAPTION_LENGTH = 2000;

    /** @var array<string, bool>|null */
    private ?array $approvedIds = null;

    /**
     * @return array<string, bool>
     */
    public function getApprovedIds(): array
    {
        if ($this->approvedIds !== null) {
            return $this->approvedIds;
        }

        $manifestPath = resource_path('gallery/manifest.json');
        if (!file_exists($manifestPath)) {
            $manifestPath = dirname(__DIR__, 3) . '/resources/gallery/manifest.json';
        }

        if (!file_exists($manifestPath)) {
            throw new GalleryValidationException('Gallery manifest not found at ' . $manifestPath);
        }

        $raw = file_get_contents($manifestPath);
        if ($raw === false) {
            throw new GalleryValidationException('Unable to read gallery manifest.');
        }

        $manifest = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        $ids = $manifest['approvedIds'] ?? [];
        if (!is_array($ids) || empty($ids)) {
            throw new GalleryValidationException('Gallery manifest contains no approved IDs.');
        }

        $this->approvedIds = array_fill_keys($ids, true);
        return $this->approvedIds;
    }

    public function validate(array $payload): void
    {
        $this->assertNoForbiddenKeys($payload);

        $keys = array_keys($payload);
        sort($keys);
        if ($keys !== ['items']) {
            throw new GalleryValidationException("Invalid payload fields: expected exactly 'items', found " . implode(', ', $keys));
        }

        $items = $payload['items'];
        if (!is_array($items) || !array_is_list($items)) {
            throw new GalleryValidationException("Field 'items' must be a JSON array of item objects.");
        }

        $count = count($items);
        if ($count < 1) {
            throw new GalleryValidationException("Gallery configuration must contain at least 1 item.");
        }
        if ($count > self::MAX_ITEMS) {
            throw new GalleryValidationException("Gallery configuration item count $count exceeds maximum of " . self::MAX_ITEMS);
        }

        $approved = $this->getApprovedIds();
        $seen = [];

        foreach ($items as $idx => $item) {
            if (!is_array($item) || array_is_list($item)) {
                throw new GalleryValidationException("Item at index $idx must be a JSON object.");
            }

            // Closed keys for each item
            $allowedItemKeys = ['recordId', 'visible', 'title', 'caption'];
            foreach (array_keys($item) as $key) {
                if (!in_array($key, $allowedItemKeys, true)) {
                    throw new GalleryValidationException("Unknown field '$key' in item at index $idx.");
                }
            }

            if (!array_key_exists('recordId', $item) || !is_string($item['recordId']) || trim($item['recordId']) === '') {
                throw new GalleryValidationException("Item at index $idx must specify non-empty string 'recordId'.");
            }

            $recordId = $item['recordId'];
            if (!isset($approved[$recordId])) {
                throw new GalleryValidationException("Record ID '$recordId' at index $idx is not approved or eligible for gallery display.");
            }

            if (isset($seen[$recordId])) {
                throw new GalleryValidationException("Duplicate recordId '$recordId' rejected at index $idx.");
            }
            $seen[$recordId] = true;

            if (!array_key_exists('visible', $item) || !is_bool($item['visible'])) {
                throw new GalleryValidationException("Field 'visible' in item at index $idx must be a boolean.");
            }

            if (array_key_exists('title', $item) && $item['title'] !== null) {
                $this->validateBilingualText($item['title'], 'title', $idx, self::MAX_TITLE_LENGTH);
            }

            if (array_key_exists('caption', $item) && $item['caption'] !== null) {
                $this->validateBilingualText($item['caption'], 'caption', $idx, self::MAX_CAPTION_LENGTH);
            }
        }
    }

    private function validateBilingualText(mixed $val, string $field, int $idx, int $maxLength): void
    {
        if (!is_array($val) || array_is_list($val)) {
            throw new GalleryValidationException("Field '$field' at index $idx must be an object with optional 'en' and 'ar' strings.");
        }

        $allowed = ['en', 'ar'];
        foreach (array_keys($val) as $langKey) {
            if (!in_array($langKey, $allowed, true)) {
                throw new GalleryValidationException("Unknown key '$langKey' in '$field' at index $idx.");
            }
        }

        foreach ($allowed as $lang) {
            if (array_key_exists($lang, $val)) {
                if (!is_string($val[$lang])) {
                    throw new GalleryValidationException("Field '$field.$lang' at index $idx must be a string.");
                }
                if (mb_strlen($val[$lang]) > $maxLength) {
                    throw new GalleryValidationException("Field '$field.$lang' at index $idx exceeds maximum length of $maxLength characters.");
                }
            }
        }
    }

    private function assertNoForbiddenKeys(mixed $value, string $path = ''): void
    {
        if (!is_array($value)) {
            return;
        }

        foreach ($value as $key => $val) {
            $currentPath = $path === '' ? (string) $key : "$path.$key";
            if ($key === 'ownerApproved') {
                throw new GalleryValidationException("Caller ownerApproved is forbidden at '$currentPath'.");
            }
            $this->assertNoForbiddenKeys($val, $currentPath);
        }
    }
}
