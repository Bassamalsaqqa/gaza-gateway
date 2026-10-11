<?php

declare(strict_types=1);

namespace App\Reference\Fleet;

/** Source-compatible normalization; unknown keys/values never appear in errors. */
final class FleetValidator
{
    public function aircraft(array $input, bool $patch = false): array
    {
        $this->keys($input, $patch ? ['model', 'registration', 'active'] : ['id', 'model', 'registration', 'active']);
        if (!$patch && (!isset($input['model']) || !isset($input['registration']))) {
            $this->invalid();
        }
        $result = [];
        foreach (['id' => 64, 'model' => 120, 'registration' => 32] as $key => $max) {
            if (!array_key_exists($key, $input)) { continue; }
            if (!is_string($input[$key]) || !mb_check_encoding($input[$key], 'UTF-8')) { $this->invalid(); }
            if ($key === 'id') { $result[$key] = $this->aircraftId($input[$key]); continue; }
            $value = preg_replace('/^[\s\x{FEFF}]+|[\s\x{FEFF}]+$/u', '', $input[$key]);
            if ($value === '' || strlen(mb_convert_encoding($value, 'UTF-16LE', 'UTF-8')) / 2 > $max
                || str_contains($value, "\0")) { $this->invalid(); }
            if ($key === 'registration') {
                $value = strtoupper($value);
                if (!preg_match('/^[A-Z0-9]{1,4}-[A-Z0-9]{1,5}$/D', $value)) { $this->invalid(); }
            }
            $result[$key] = $value;
        }
        if (array_key_exists('active', $input)) {
            if (!is_bool($input['active'])) { $this->invalid(); }
            $result['active'] = $input['active'];
        } elseif (!$patch) { $result['active'] = true; }
        return $result;
    }

    public function aircraftId(string $id): string
    {
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/D', $id)) { $this->invalid(); }
        return $id;
    }

    public function layout(array $input): array
    {
        $this->keys($input, ['rows', 'letters', 'aisleAfter', 'zones', 'extraLegroomRows', 'unavailable']);
        $rows = $input['rows'] ?? null; $letters = $input['letters'] ?? null; $aisle = $input['aisleAfter'] ?? null;
        if (!is_int($rows) || $rows < 1 || $rows > 60 || !is_array($letters) || !array_is_list($letters)
            || count($letters) < 2 || count($letters) > 10 || !is_int($aisle) || $aisle < 1 || $aisle >= count($letters)) { $this->invalid(); }
        foreach ($letters as $letter) {
            if (!is_string($letter) || !preg_match('/^[A-Z]$/D', $letter)) { $this->invalid(); }
        }
        if (count(array_unique($letters)) !== count($letters)) { $this->invalid(); }
        $zones = $input['zones'] ?? null;
        if (!is_array($zones) || !array_is_list($zones) || count($zones) < 1 || count($zones) > 3) { $this->invalid(); }
        $seen = [];
        foreach ($zones as $zone) {
            if (!is_array($zone)) { $this->invalid(); }
            $this->keys($zone, ['id', 'firstRow', 'lastRow']);
            if (!isset($zone['id'], $zone['firstRow'], $zone['lastRow']) || !is_string($zone['id'])
                || !in_array($zone['id'], ['economy', 'premium', 'business'], true) || isset($seen[$zone['id']])
                || !is_int($zone['firstRow']) || !is_int($zone['lastRow'])
                || $zone['firstRow'] < 1 || $zone['lastRow'] > $rows || $zone['firstRow'] > $zone['lastRow']) { $this->invalid(); }
            $seen[$zone['id']] = true;
        }
        usort($zones, static fn(array $a, array $b): int => $a['firstRow'] <=> $b['firstRow']);
        $next = 1;
        foreach ($zones as $zone) {
            if ($zone['firstRow'] !== $next) { $this->invalid(); }
            $next = $zone['lastRow'] + 1;
        }
        if ($next !== $rows + 1) { $this->invalid(); }
        $extra = $input['extraLegroomRows'] ?? []; $unavailable = $input['unavailable'] ?? [];
        if (!is_array($extra) || !array_is_list($extra) || !is_array($unavailable) || !array_is_list($unavailable)
            || count($extra) > $rows || count($unavailable) > $rows * count($letters)) { $this->invalid(); }
        $seen = [];
        foreach ($extra as $row) {
            if (!is_int($row) || $row < 1 || $row > $rows || isset($seen[$row])) { $this->invalid(); }
            $seen[$row] = true;
        }
        $seen = [];
        foreach ($unavailable as &$seat) {
            if (!is_string($seat)) { $this->invalid(); }
            $seat = strtoupper(trim($seat));
            if (!preg_match('/^([1-9][0-9]?)([A-Z])$/D', $seat, $parts) || (int) $parts[1] > $rows
                || !in_array($parts[2], $letters, true) || isset($seen[$seat])) { $this->invalid(); }
            $seen[$seat] = true;
        }
        unset($seat);
        return ['rows' => $rows, 'letters' => $letters, 'aisleAfter' => $aisle, 'zones' => $zones,
            'extraLegroomRows' => $extra, 'unavailable' => $unavailable];
    }

    public function keys(array $input, array $allowed): void
    {
        if (array_diff(array_keys($input), $allowed)) { $this->invalid(); }
    }

    public function validate(array $input): array
    {
        try { $this->layout($input); return []; }
        catch (FleetValidationException) { return ['layout' => 'Invalid fleet layout.']; }
    }

    private function invalid(): never { throw new FleetValidationException(); }
}
