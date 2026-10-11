<?php

declare(strict_types=1);

namespace App\Reference\Meals;

use App\Reference\Meals\Exceptions\MealValidationException;

final class MealValidator
{
    private const string ID_PATTERN = '/^[a-zA-Z0-9_-]{1,64}$/';
    private const int MAX_LABEL_LENGTH = 500;
    private const int MAX_ORDER = 10000;

    public function validateId(string $id): string
    {
        $trimmed = trim($id);
        if ($trimmed === '' || $trimmed !== $id || !preg_match(self::ID_PATTERN, $id)) {
            throw new MealValidationException('Invalid meal identifier: must be canonical bounded ASCII.');
        }
        return $id;
    }

    /**
     * @param array<string, mixed> $input
     * @return array{
     *     id: string,
     *     label: array{en: string, ar: string},
     *     active: bool,
     *     order?: int
     * }
     */
    public function validateCreate(array $input): array
    {
        $allowedKeys = ['id', 'label', 'active', 'order'];
        $this->assertNoExtraKeys($input, $allowedKeys);

        if (!array_key_exists('id', $input) || !is_string($input['id'])) {
            throw new MealValidationException('Missing or invalid id.');
        }
        $id = $this->validateId($input['id']);

        if (!array_key_exists('label', $input) || !is_array($input['label'])) {
            throw new MealValidationException('Missing or invalid bilingual label.');
        }
        $label = $this->validateLabel($input['label']);

        if (!array_key_exists('active', $input) || !is_bool($input['active'])) {
            throw new MealValidationException('Missing or invalid active flag: must be boolean.');
        }
        $active = $input['active'];

        $result = [
            'id' => $id,
            'label' => $label,
            'active' => $active,
        ];

        if (array_key_exists('order', $input)) {
            if (!is_int($input['order']) || $input['order'] < 0 || $input['order'] > self::MAX_ORDER) {
                throw new MealValidationException('Invalid order: must be non-negative integer.');
            }
            $result['order'] = $input['order'];
        }

        return $result;
    }

    /**
     * @param array<string, mixed> $input
     * @return array{
     *     label?: array{en: string, ar: string},
     *     active?: bool,
     *     order?: int
     * }
     */
    public function validatePatch(array $input): array
    {
        if (array_key_exists('id', $input)) {
            throw new MealValidationException('Immutable identity invariant: meal ID cannot be patched.');
        }

        $allowedKeys = ['label', 'active', 'order'];
        $this->assertNoExtraKeys($input, $allowedKeys);

        $patch = [];

        if (array_key_exists('label', $input)) {
            if (!is_array($input['label'])) {
                throw new MealValidationException('Invalid bilingual label.');
            }
            $patch['label'] = $this->validateLabel($input['label']);
        }

        if (array_key_exists('active', $input)) {
            if (!is_bool($input['active'])) {
                throw new MealValidationException('Invalid active flag: must be boolean.');
            }
            $patch['active'] = $input['active'];
        }

        if (array_key_exists('order', $input)) {
            if (!is_int($input['order']) || $input['order'] < 0 || $input['order'] > self::MAX_ORDER) {
                throw new MealValidationException('Invalid order: must be non-negative integer.');
            }
            $patch['order'] = $input['order'];
        }

        return $patch;
    }

    /**
     * @param array<string, mixed> $label
     * @return array{en: string, ar: string}
     */
    public function validateLabel(array $label): array
    {
        $this->assertNoExtraKeys($label, ['en', 'ar']);

        if (!isset($label['en']) || !is_string($label['en'])) {
            throw new MealValidationException('Missing or invalid English label.');
        }
        $en = trim($label['en']);
        if ($en === '' || mb_strlen($en) > self::MAX_LABEL_LENGTH) {
            throw new MealValidationException('English label must be non-empty and within bounds.');
        }

        if (!isset($label['ar']) || !is_string($label['ar'])) {
            throw new MealValidationException('Missing or invalid Arabic label.');
        }
        $ar = trim($label['ar']);
        if ($ar === '' || mb_strlen($ar) > self::MAX_LABEL_LENGTH) {
            throw new MealValidationException('Arabic label must be non-empty and within bounds.');
        }

        return ['en' => $en, 'ar' => $ar];
    }

    /**
     * @param array<string, mixed> $input
     * @return list<string>
     */
    public function validateReorder(array $input): array
    {
        $this->assertNoExtraKeys($input, ['ids']);
        $ids = $input['ids'] ?? null;
        if (!is_array($ids) || !array_is_list($ids)) {
            throw new MealValidationException('Reorder command requires an ids array.');
        }

        $validated = [];
        foreach ($ids as $id) {
            if (!is_string($id)) {
                throw new MealValidationException('Reorder list contains non-string identifier.');
            }
            $validated[] = $this->validateId($id);
        }

        if (count(array_unique($validated)) !== count($validated)) {
            throw new MealValidationException('Reorder list contains duplicate meal identifiers.');
        }

        return $validated;
    }

    /**
     * @param array<string, mixed> $input
     */
    public function validateSetDefault(array $input): string
    {
        $this->assertNoExtraKeys($input, ['id']);
        $id = $input['id'] ?? null;
        if (!is_string($id)) {
            throw new MealValidationException('Set default meal requires a string id.');
        }
        return $this->validateId($id);
    }

    /**
     * @param array<string, mixed> $data
     * @param list<string> $allowedKeys
     */
    private function assertNoExtraKeys(array $data, array $allowedKeys): void
    {
        $extraKeys = array_diff(array_keys($data), $allowedKeys);
        if (!empty($extraKeys)) {
            throw new MealValidationException(sprintf(
                'Unexpected or rejected fields: %s.',
                implode(', ', $extraKeys)
            ));
        }
    }
}
