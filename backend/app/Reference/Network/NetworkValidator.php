<?php

declare(strict_types=1);

namespace App\Reference\Network;

use DateTimeZone;
use Throwable;

/** Bounded network and airport normalization; unknown keys/values never appear in errors. */
final class NetworkValidator
{
    public const ACCEPTED_CODES = ['GZA', 'AMM', 'CAI', 'IST', 'DOH', 'DXB', 'JED', 'RUH', 'BEY', 'KWI', 'AUH', 'ATH', 'FCO', 'CDG', 'LHR', 'FRA', 'MAD', 'BOM', 'KUL', 'JFK', 'YYZ'];
    public const DESTINATION_CODES = ['AMM', 'CAI', 'IST', 'DOH', 'DXB', 'JED', 'RUH', 'BEY', 'KWI', 'AUH', 'ATH', 'FCO', 'CDG', 'LHR', 'FRA', 'MAD', 'BOM', 'KUL', 'JFK', 'YYZ'];

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function airport(array $input, bool $patch = false): array
    {
        $allowed = $patch
            ? ['airportName', 'city', 'country', 'timezone', 'blockMinutes', 'active']
            : ['code', 'airportName', 'city', 'country', 'timezone', 'blockMinutes', 'active'];

        $this->keys($input, $allowed);

        if (!$patch) {
            foreach (['code', 'airportName', 'city', 'country', 'timezone', 'blockMinutes'] as $required) {
                if (!array_key_exists($required, $input)) {
                    $this->invalid();
                }
            }
        }

        $result = [];

        if (array_key_exists('code', $input)) {
            $result['code'] = $this->code($input['code']);
        }

        foreach (['airportName', 'city', 'country'] as $bilingualKey) {
            if (!array_key_exists($bilingualKey, $input)) {
                continue;
            }
            $result[$bilingualKey] = $this->bilingual($input[$bilingualKey]);
        }

        if (array_key_exists('timezone', $input)) {
            $result['timezone'] = $this->timezone($input['timezone']);
        }

        if (array_key_exists('blockMinutes', $input)) {
            $result['blockMinutes'] = $this->blockMinutes($input['blockMinutes']);
        }

        if (array_key_exists('active', $input)) {
            if (!is_bool($input['active'])) {
                $this->invalid();
            }
            $result['active'] = $input['active'];
        } elseif (!$patch) {
            $result['active'] = true;
        }

        return $result;
    }

    public function code(mixed $code): string
    {
        if (!is_string($code)) {
            $this->invalid();
        }
        $normalized = strtoupper(trim($code));
        if (!in_array($normalized, self::ACCEPTED_CODES, true)) {
            $this->invalid();
        }
        return $normalized;
    }

    /**
     * @param mixed $value
     * @return array{en: string, ar: string}
     */
    public function bilingual(mixed $value): array
    {
        if (!is_array($value) || array_is_list($value)) {
            $this->invalid();
        }
        $this->keys($value, ['en', 'ar']);
        if (!array_key_exists('en', $value) || !array_key_exists('ar', $value)) {
            $this->invalid();
        }

        return [
            'en' => $this->label($value['en']),
            'ar' => $this->label($value['ar']),
        ];
    }

    public function label(mixed $value): string
    {
        if (!is_string($value) || !mb_check_encoding($value, 'UTF-8')) {
            $this->invalid();
        }
        $trimmed = preg_replace('/^[\s\x{FEFF}]+|[\s\x{FEFF}]+$/u', '', $value);
        if ($trimmed === null || $trimmed === '' || str_contains($trimmed, "\0")) {
            $this->invalid();
        }
        if (mb_strlen($trimmed, 'UTF-8') > 160) {
            $this->invalid();
        }
        return $trimmed;
    }

    public function timezone(mixed $value): string
    {
        if (!is_string($value) || !mb_check_encoding($value, 'UTF-8')) {
            $this->invalid();
        }
        $trimmed = trim($value);
        if ($trimmed === '' || strlen($trimmed) > 80 || str_contains($trimmed, "\0")) {
            $this->invalid();
        }
        if (!preg_match('/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/D', $trimmed)) {
            $this->invalid();
        }
        try {
            new DateTimeZone($trimmed);
        } catch (Throwable) {
            $this->invalid();
        }
        if (!in_array($trimmed, DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC), true)) {
            $this->invalid();
        }
        return $trimmed;
    }

    public function blockMinutes(mixed $value): int
    {
        if (!is_int($value) || $value < 20 || $value > 1440) {
            $this->invalid();
        }
        return $value;
    }

    /**
     * @param array<string, mixed> $input
     * @param list<string> $allowed
     */
    public function keys(array $input, array $allowed): void
    {
        if (array_diff(array_keys($input), $allowed) !== []) {
            $this->invalid();
        }
    }

    private function invalid(): never
    {
        throw new NetworkValidationException();
    }
}
