<?php

declare(strict_types=1);

namespace App\Identity\Contracts;

use App\Identity\Contracts\Exceptions\InvalidCommandSchemaException;

/**
 * Validates schemas before evaluation against the strictly accepted dialect.
 *
 * Invariants:
 * - Fail closed on unsupported schema assertion keywords.
 * - Recursion depth bounded to 50.
 * - Cycle detection on $ref chains.
 * - Keyword presence checked with array_key_exists (never isset-null omission).
 * - Full recursion into not, items, combinators, properties, and additionalProperties.
 * - Enforces finite numeric bounds, positive multipleOf, non-negative integer bounds,
 *   boolean uniqueItems, and unique type/required/enum arrays.
 * - Coherent boolean schema support (true/false).
 */
final class IdentitySchemaPreflight
{
    public const int MAX_DEPTH = 50;

    /**
     * @var array<string, bool>
     */
    public const array SUPPORTED_ASSERTION_KEYWORDS = [
        'type' => true,
        'properties' => true,
        'required' => true,
        'additionalProperties' => true,
        'items' => true,
        'minItems' => true,
        'maxItems' => true,
        'uniqueItems' => true,
        'minimum' => true,
        'maximum' => true,
        'exclusiveMinimum' => true,
        'exclusiveMaximum' => true,
        'multipleOf' => true,
        'minLength' => true,
        'maxLength' => true,
        'pattern' => true,
        'format' => true,
        'enum' => true,
        'const' => true,
        'oneOf' => true,
        'anyOf' => true,
        'allOf' => true,
        'not' => true,
        '$ref' => true,
    ];

    /**
     * @var array<string, bool>
     */
    public const array INFORMATIONAL_KEYWORDS = [
        '$schema' => true,
        '$id' => true,
        '$comment' => true,
        'title' => true,
        'description' => true,
        'default' => true,
        'example' => true,
        'examples' => true,
        'deprecated' => true,
        'readOnly' => true,
        'writeOnly' => true,
    ];

    /**
     * @var array<string, bool>
     */
    public const array SUPPORTED_FORMATS = [
        'email' => true,
        'uuid' => true,
        'date' => true,
        'date-time' => true,
        'time' => true,
        'uri' => true,
    ];

    /**
     * @var array<string, bool>
     */
    public const array SUPPORTED_TYPES = [
        'string' => true,
        'number' => true,
        'integer' => true,
        'boolean' => true,
        'array' => true,
        'object' => true,
        'null' => true,
    ];

    /**
     * Preflights a schema node.
     *
     * @param array<string, mixed>|bool $schema
     * @param array<string, array<string, mixed>|bool> $allSchemas
     * @param array<string, bool> $visitedRefs
     * @throws InvalidCommandSchemaException
     */
    public static function preflight(
        array|bool $schema,
        array $allSchemas = [],
        array $visitedRefs = [],
        int $depth = 0
    ): void {
        if ($depth > self::MAX_DEPTH) {
            throw new InvalidCommandSchemaException('Maximum schema preflight depth exceeded (potential cycle)');
        }

        // Boolean schema node: true accepts all, false rejects all. Valid in JSON Schema 2020-12.
        if (is_bool($schema)) {
            return;
        }

        // Must be associative map, never a list array
        if (array_is_list($schema) && !empty($schema)) {
            throw new InvalidCommandSchemaException('Schema must be an associative map or boolean, got array list');
        }

        // Check for unsupported assertion keywords
        foreach (array_keys($schema) as $key) {
            $keyStr = (string) $key;
            if (!isset(self::SUPPORTED_ASSERTION_KEYWORDS[$keyStr]) && !isset(self::INFORMATIONAL_KEYWORDS[$keyStr])) {
                throw new InvalidCommandSchemaException('Unsupported schema assertion keyword (fail-closed policy)');
            }
        }

        // 1. type
        if (array_key_exists('type', $schema)) {
            $type = $schema['type'];
            if (is_string($type)) {
                if (!isset(self::SUPPORTED_TYPES[$type])) {
                    throw new InvalidCommandSchemaException('Unsupported schema type');
                }
            } elseif (is_array($type)) {
                if (empty($type) || !array_is_list($type)) {
                    throw new InvalidCommandSchemaException('Schema type array cannot be empty and must be list');
                }
                $seenTypes = [];
                foreach ($type as $t) {
                    if (!is_string($t) || !isset(self::SUPPORTED_TYPES[$t])) {
                        throw new InvalidCommandSchemaException('Unsupported schema type in union');
                    }
                    if (isset($seenTypes[$t])) {
                        throw new InvalidCommandSchemaException('Duplicate type in schema type union');
                    }
                    $seenTypes[$t] = true;
                }
            } else {
                throw new InvalidCommandSchemaException('Invalid schema type definition: expected string or array');
            }
        }

        // 2. format
        if (array_key_exists('format', $schema)) {
            $format = $schema['format'];
            if (!is_string($format) || !isset(self::SUPPORTED_FORMATS[$format])) {
                throw new InvalidCommandSchemaException('Unsupported schema format');
            }
        }

        // 3. Numeric bounds: minimum, maximum, exclusiveMinimum, exclusiveMaximum
        foreach (['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'] as $numKw) {
            if (array_key_exists($numKw, $schema)) {
                $numVal = $schema[$numKw];
                if (!is_int($numVal) && (!is_float($numVal) || !is_finite($numVal))) {
                    throw new InvalidCommandSchemaException('Numeric bound keyword must be a finite number');
                }
            }
        }

        // 4. multipleOf
        if (array_key_exists('multipleOf', $schema)) {
            $multVal = $schema['multipleOf'];
            if ((!is_int($multVal) && (!is_float($multVal) || !is_finite($multVal))) || $multVal <= 0) {
                throw new InvalidCommandSchemaException("Keyword 'multipleOf' must be a finite positive number (> 0)");
            }
        }

        // 5. Non-negative integer bounds: minLength, maxLength, minItems, maxItems
        foreach (['minLength', 'maxLength', 'minItems', 'maxItems'] as $intKw) {
            if (array_key_exists($intKw, $schema)) {
                $intVal = $schema[$intKw];
                if (!is_int($intVal) || $intVal < 0) {
                    throw new InvalidCommandSchemaException('Length or items count keyword must be a non-negative integer');
                }
            }
        }

        // 6. uniqueItems
        if (array_key_exists('uniqueItems', $schema)) {
            if (!is_bool($schema['uniqueItems'])) {
                throw new InvalidCommandSchemaException("Keyword 'uniqueItems' must be a boolean");
            }
        }

        // 7. pattern
        if (array_key_exists('pattern', $schema)) {
            $pattern = $schema['pattern'];
            if (!is_string($pattern)) {
                throw new InvalidCommandSchemaException("Keyword 'pattern' must be a string");
            }
            $regex = '/' . str_replace('/', '\/', $pattern) . '/u';
            if (@preg_match($regex, '') === false) {
                throw new InvalidCommandSchemaException('Invalid regex pattern');
            }
        }

        // 8. enum
        if (array_key_exists('enum', $schema)) {
            $enum = $schema['enum'];
            if (!is_array($enum) || empty($enum)) {
                throw new InvalidCommandSchemaException("Keyword 'enum' must be a non-empty array");
            }
            // Check uniqueness
            $count = count($enum);
            for ($i = 0; $i < $count; $i++) {
                for ($j = $i + 1; $j < $count; $j++) {
                    if (self::deepEquals($enum[$i], $enum[$j])) {
                        throw new InvalidCommandSchemaException("Keyword 'enum' contains duplicate values");
                    }
                }
            }
        }

        // 9. required
        if (array_key_exists('required', $schema)) {
            $required = $schema['required'];
            if (!is_array($required) || !array_is_list($required)) {
                throw new InvalidCommandSchemaException("Keyword 'required' must be a list array of strings");
            }
            $seenReq = [];
            foreach ($required as $r) {
                if (!is_string($r) || $r === '') {
                    throw new InvalidCommandSchemaException('Required field names must be non-empty strings');
                }
                if (isset($seenReq[$r])) {
                    throw new InvalidCommandSchemaException('Duplicate field name in required list');
                }
                $seenReq[$r] = true;
            }
        }

        // 10. properties
        if (array_key_exists('properties', $schema)) {
            $properties = $schema['properties'];
            if (!is_array($properties) || (array_is_list($properties) && !empty($properties))) {
                throw new InvalidCommandSchemaException("Keyword 'properties' must be an associative map");
            }
            foreach ($properties as $propName => $propSchema) {
                if (!is_array($propSchema) && !is_bool($propSchema)) {
                    throw new InvalidCommandSchemaException('Property schema must be an array map or boolean');
                }
                self::preflight($propSchema, $allSchemas, $visitedRefs, $depth + 1);
            }
        }

        // 11. additionalProperties
        if (array_key_exists('additionalProperties', $schema)) {
            $addProps = $schema['additionalProperties'];
            if (is_array($addProps) || is_bool($addProps)) {
                self::preflight($addProps, $allSchemas, $visitedRefs, $depth + 1);
            } else {
                throw new InvalidCommandSchemaException('additionalProperties must be boolean or schema map');
            }
        }

        // 12. items: must reject array-form items tuple
        if (array_key_exists('items', $schema)) {
            $items = $schema['items'];
            if (is_array($items) && array_is_list($items)) {
                throw new InvalidCommandSchemaException('Array-form items tuple is unsupported (fail-closed policy)');
            }
            if (!is_array($items) && !is_bool($items)) {
                throw new InvalidCommandSchemaException('items must be a schema map or boolean');
            }
            self::preflight($items, $allSchemas, $visitedRefs, $depth + 1);
        }

        // 13. not: must recurse
        if (array_key_exists('not', $schema)) {
            $not = $schema['not'];
            if (!is_array($not) && !is_bool($not)) {
                throw new InvalidCommandSchemaException("Keyword 'not' must be a schema map or boolean");
            }
            self::preflight($not, $allSchemas, $visitedRefs, $depth + 1);
        }

        // 14. Combinators: allOf, anyOf, oneOf
        foreach (['allOf', 'anyOf', 'oneOf'] as $comb) {
            if (array_key_exists($comb, $schema)) {
                $branches = $schema[$comb];
                if (!is_array($branches) || empty($branches) || !array_is_list($branches)) {
                    throw new InvalidCommandSchemaException('Combinator must be a non-empty list of schemas');
                }
                foreach ($branches as $branch) {
                    if (!is_array($branch) && !is_bool($branch)) {
                        throw new InvalidCommandSchemaException('Combinator branch must be a schema map or boolean');
                    }
                    self::preflight($branch, $allSchemas, $visitedRefs, $depth + 1);
                }
            }
        }

        // 15. $ref with conjunctive siblings
        if (array_key_exists('$ref', $schema)) {
            $ref = $schema['$ref'];
            if (!is_string($ref) || !str_starts_with($ref, '#/')) {
                throw new InvalidCommandSchemaException('Invalid $ref format');
            }

            if (isset($visitedRefs[$ref])) {
                throw new InvalidCommandSchemaException('Cyclic schema reference detected');
            }

            if (!array_key_exists($ref, $allSchemas)) {
                throw new InvalidCommandSchemaException('Unresolved schema reference');
            }

            $target = $allSchemas[$ref];
            $nextVisited = $visitedRefs;
            $nextVisited[$ref] = true;
            self::preflight($target, $allSchemas, $nextVisited, $depth + 1);

            // Preflight sibling assertion keywords conjunctively
            $siblingKeys = array_filter(
                array_keys($schema),
                static fn (string|int $k): bool => (string) $k !== '$ref'
            );
            if (!empty($siblingKeys)) {
                $siblingSchema = [];
                foreach ($siblingKeys as $k) {
                    $siblingSchema[(string) $k] = $schema[$k];
                }
                self::preflight($siblingSchema, $allSchemas, $visitedRefs, $depth + 1);
            }
        }
    }

    /**
     * Strict deep equality comparison for JSON scalar and structured values.
     */
    public static function deepEquals(mixed $a, mixed $b): bool
    {
        if (is_int($a) && is_float($b)) {
            return is_finite($b) && (float) $a === $b;
        }
        if (is_float($a) && is_int($b)) {
            return is_finite($a) && $a === (float) $b;
        }

        if (is_array($a) && is_array($b)) {
            if (count($a) !== count($b)) {
                return false;
            }
            if (array_is_list($a) !== array_is_list($b)) {
                return false;
            }
            if (array_is_list($a)) {
                foreach ($a as $i => $v) {
                    if (!self::deepEquals($v, $b[$i])) {
                        return false;
                    }
                }
                return true;
            }
            foreach ($a as $k => $v) {
                if (!array_key_exists($k, $b) || !self::deepEquals($v, $b[$k])) {
                    return false;
                }
            }
            return true;
        }

        return $a === $b;
    }
}
