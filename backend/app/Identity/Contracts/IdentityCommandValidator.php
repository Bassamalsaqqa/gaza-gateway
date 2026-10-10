<?php

declare(strict_types=1);

namespace App\Identity\Contracts;

use App\Identity\Contracts\Exceptions\InvalidCommandSchemaException;
use stdClass;

/**
 * Pure, fail-closed validator for accepted identity HTTP command schemas.
 *
 * Security Invariants:
 * - Server-owned operationId mapping.
 * - Raw JSON decoded preserving stdClass (object) vs array (list).
 * - Strict type checking with NO coercion (mathematical integers supported per JSON Schema).
 * - Finite numbers only (INF and NAN rejected).
 * - Deep equality with JSON Schema semantics (order-independent objects, object vs array distinction).
 * - Additional properties rejected without echoing arbitrary input keys.
 * - Safe error reporting: authentic declared field paths and fixed local violation codes only.
 * - NEVER echoes raw input values, unknown property names, raw request bodies,
 *   passwords, tokens, proofs, documents, or emails.
 * - Bounded input bytes (1 MiB), nesting depth (32), and step work budget (2000).
 * - String bounds count Unicode code points (mb_strlen UTF-8).
 * - Password strings preserve exact raw bytes (no trimming or truncation).
 * - Ill-formed UTF-8 rejected with MALFORMED_UTF8.
 * - Bodyless commands reject unexpected JSON input (UNEXPECTED_BODY).
 * - Parameters validated without secondary URL decoding, preserving opaque IDs.
 */
final class IdentityCommandValidator
{
    public const int MAX_RAW_BYTES = 1048576; // 1 MiB
    public const int MAX_DECODE_DEPTH = 32;
    public const int MAX_EVALUATION_DEPTH = 50;
    public const int MAX_WORK_STEPS = 2000;
    public const int MAX_VIOLATIONS = 50;
    public const int MAX_INPUT_NODES = 2000;
    public const string NO_BODY = '__IDENTITY_COMMAND_NO_BODY__';

    private readonly IdentityCommandContracts $contracts;
    private int $workSteps = 0;
    private bool $budgetExhausted = false;
    private ?CommandViolation $terminalViolation = null;

    public function __construct(?IdentityCommandContracts $contracts = null)
    {
        $this->contracts = $contracts ?? IdentityCommandContracts::default();
    }

    /**
     * Validates a command by server-owned operationId.
     *
     * @param array<string, mixed> $parameters
     */
    public function validate(
        string $operationId,
        mixed $rawPayload = self::NO_BODY,
        array $parameters = []
    ): CommandValidationResult {
        $operation = $this->contracts->getOperation($operationId);
        if ($operation === null) {
            return CommandValidationResult::singleViolation(
                '',
                CommandViolation::UNKNOWN_OPERATION,
                'Unknown operation identifier'
            );
        }

        $isBodySupplied = true;
        if ($rawPayload === self::NO_BODY) {
            $isBodySupplied = false;
            $rawPayload = null;
        } elseif (!$operation->hasBody && $rawPayload === null) {
            $isBodySupplied = false;
        }

        // Shared aggregate byte, node, depth counters across entire operation request (payload + parameters)
        $totalBytes = 0;
        $nodeCount = 0;
        $ancestorObjectIds = [];

        if ($isBodySupplied) {
            if ($violation = $this->validateInputInstance($rawPayload, $totalBytes, $nodeCount, 0, $ancestorObjectIds)) {
                return CommandValidationResult::singleViolation(
                    $violation->getPath(),
                    $violation->getCode(),
                    $violation->getMessage()
                );
            }
        }

        if ($violation = $this->validateInputInstance($parameters, $totalBytes, $nodeCount, 0, $ancestorObjectIds)) {
            return CommandValidationResult::singleViolation(
                $violation->getPath(),
                $violation->getCode(),
                $violation->getMessage()
            );
        }

        return $this->validateOperation($operation, $rawPayload, $isBodySupplied, $parameters);
    }

    /**
     * Validates a command by HTTP route.
     *
     * @param array<string, mixed> $parameters
     */
    public function validateRoute(
        string $method,
        string $path,
        mixed $rawPayload = self::NO_BODY,
        array $parameters = []
    ): CommandValidationResult {
        $operation = $this->contracts->getOperationByRoute($method, $path);
        if ($operation === null) {
            return CommandValidationResult::singleViolation(
                '',
                CommandViolation::UNKNOWN_OPERATION,
                'No accepted operation matches route'
            );
        }

        $isBodySupplied = true;
        if ($rawPayload === self::NO_BODY) {
            $isBodySupplied = false;
            $rawPayload = null;
        } elseif (!$operation->hasBody && $rawPayload === null) {
            $isBodySupplied = false;
        }

        // Shared aggregate byte, node, depth counters across entire operation request
        $totalBytes = 0;
        $nodeCount = 0;
        $ancestorObjectIds = [];

        if ($isBodySupplied) {
            if ($violation = $this->validateInputInstance($rawPayload, $totalBytes, $nodeCount, 0, $ancestorObjectIds)) {
                return CommandValidationResult::singleViolation(
                    $violation->getPath(),
                    $violation->getCode(),
                    $violation->getMessage()
                );
            }
        }

        if ($violation = $this->validateInputInstance($parameters, $totalBytes, $nodeCount, 0, $ancestorObjectIds)) {
            return CommandValidationResult::singleViolation(
                $violation->getPath(),
                $violation->getCode(),
                $violation->getMessage()
            );
        }

        return $this->validateOperation($operation, $rawPayload, $isBodySupplied, $parameters);
    }

    /**
     * Decodes and validates a raw JSON string against the operation contract.
     * Enforces raw byte ceiling at entry before any trim/UTF8/decode.
     *
     * @param array<string, mixed> $parameters
     */
    public function validateJson(
        string $operationId,
        ?string $rawJsonString,
        array $parameters = []
    ): CommandValidationResult {
        // Enforce raw byte ceiling at validateJson entry before trim/UTF8/decode
        if ($rawJsonString !== null && strlen($rawJsonString) > self::MAX_RAW_BYTES) {
            return CommandValidationResult::singleViolation(
                '',
                CommandViolation::PAYLOAD_TOO_LARGE,
                'Request payload exceeds maximum allowed size'
            );
        }

        $operation = $this->contracts->getOperation($operationId);
        if ($operation === null) {
            return CommandValidationResult::singleViolation(
                '',
                CommandViolation::UNKNOWN_OPERATION,
                'Unknown operation identifier'
            );
        }

        // Shared aggregate byte budget across entire operation request (raw JSON bytes + parameters)
        $totalBytes = $rawJsonString !== null ? strlen($rawJsonString) : 0;
        $nodeCount = 0;
        $ancestorObjectIds = [];

        if ($paramViolation = $this->validateInputInstance($parameters, $totalBytes, $nodeCount, 0, $ancestorObjectIds)) {
            return CommandValidationResult::singleViolation(
                $paramViolation->getPath(),
                $paramViolation->getCode(),
                $paramViolation->getMessage()
            );
        }

        // Distinguish absent body from explicit JSON null
        $isBodySupplied = $rawJsonString !== null && trim($rawJsonString) !== '';

        // Bodyless operation check
        if (!$operation->hasBody) {
            if ($isBodySupplied) {
                return CommandValidationResult::singleViolation(
                    '',
                    CommandViolation::UNEXPECTED_BODY,
                    'Unexpected request body for bodyless operation'
                );
            }

            return $this->validateOperation($operation, null, false, $parameters);
        }

        // Operation declaring hasBody: true must have non-null request schema
        if ($operation->requestBodySchema === null) {
            throw new InvalidCommandSchemaException(
                'Operation declared hasBody: true but lacks requestBodySchema'
            );
        }

        // Body required but omitted
        if (!$isBodySupplied) {
            if ($operation->bodyRequired) {
                return CommandValidationResult::singleViolation(
                    '',
                    CommandViolation::BODY_REQUIRED,
                    'Request body is required'
                );
            }

            return $this->validateOperation($operation, null, false, $parameters);
        }

        // Body supplied: validate UTF-8 encoding
        if (!mb_check_encoding($rawJsonString, 'UTF-8')) {
            return CommandValidationResult::singleViolation(
                '',
                CommandViolation::MALFORMED_UTF8,
                'Malformed UTF-8 encoding in request payload'
            );
        }

        /** @var mixed $decoded */
        $decoded = json_decode($rawJsonString, false, self::MAX_DECODE_DEPTH);
        $jsonError = json_last_error();
        if ($jsonError === JSON_ERROR_DEPTH) {
            return CommandValidationResult::singleViolation(
                '',
                CommandViolation::MAX_DEPTH_EXCEEDED,
                'JSON structure exceeds maximum nesting depth'
            );
        }
        if ($jsonError !== JSON_ERROR_NONE) {
            return CommandValidationResult::singleViolation(
                '',
                CommandViolation::INVALID_JSON,
                'Invalid JSON syntax in request body'
            );
        }

        // Check decoded payload complexity & instance safety bounds
        $decodedBytes = 0;
        $decodedNodes = 0;
        $decodedAncestors = [];
        if ($bodyViolation = $this->validateInputInstance($decoded, $decodedBytes, $decodedNodes, 0, $decodedAncestors)) {
            return CommandValidationResult::singleViolation(
                $bodyViolation->getPath(),
                $bodyViolation->getCode(),
                $bodyViolation->getMessage()
            );
        }

        return $this->validateOperation($operation, $decoded, true, $parameters);
    }

    /**
     * Shared recursive traversal validating JSON instance safety and resource bounds:
     * - Aggregate byte budget (including object/array keys and string values)
     * - Node count ceiling (MAX_INPUT_NODES = 2000)
     * - Nesting depth ceiling (MAX_DECODE_DEPTH = 32)
     * - Finite JSON scalars (rejects INF, NAN)
     * - UTF-8 validity for all strings and keys
     * - Rejects PHP resources and non-stdClass objects
     * - Detects cyclic object references without reflection
     *
     * @param array<int, bool> $ancestorObjectIds
     */
    private function validateInputInstance(
        mixed $data,
        int &$totalBytes,
        int &$nodeCount,
        int $depth,
        array &$ancestorObjectIds
    ): ?CommandViolation {
        if ($depth > self::MAX_DECODE_DEPTH) {
            return new CommandViolation(
                '',
                CommandViolation::MAX_DEPTH_EXCEEDED,
                'Input payload exceeded maximum allowable nesting depth'
            );
        }

        if (++$nodeCount > self::MAX_INPUT_NODES) {
            return new CommandViolation(
                '',
                CommandViolation::PAYLOAD_TOO_LARGE,
                'Input structure exceeds maximum allowable node count'
            );
        }

        if (is_null($data)) {
            $totalBytes += 4;
            if ($totalBytes > self::MAX_RAW_BYTES) {
                return new CommandViolation(
                    '',
                    CommandViolation::PAYLOAD_TOO_LARGE,
                    'Request payload exceeds maximum allowed size'
                );
            }

            return null;
        }

        if (is_bool($data)) {
            $totalBytes += $data ? 4 : 5;
            if ($totalBytes > self::MAX_RAW_BYTES) {
                return new CommandViolation(
                    '',
                    CommandViolation::PAYLOAD_TOO_LARGE,
                    'Request payload exceeds maximum allowed size'
                );
            }

            return null;
        }

        if (is_int($data)) {
            $totalBytes += 8;
            if ($totalBytes > self::MAX_RAW_BYTES) {
                return new CommandViolation(
                    '',
                    CommandViolation::PAYLOAD_TOO_LARGE,
                    'Request payload exceeds maximum allowed size'
                );
            }

            return null;
        }

        if (is_float($data)) {
            if (is_infinite($data) || is_nan($data)) {
                return new CommandViolation(
                    '',
                    CommandViolation::INVALID_TYPE,
                    'Non-finite numbers are not permitted in JSON input'
                );
            }

            $totalBytes += 8;
            if ($totalBytes > self::MAX_RAW_BYTES) {
                return new CommandViolation(
                    '',
                    CommandViolation::PAYLOAD_TOO_LARGE,
                    'Request payload exceeds maximum allowed size'
                );
            }

            return null;
        }

        if (is_string($data)) {
            if (!mb_check_encoding($data, 'UTF-8')) {
                return new CommandViolation(
                    '',
                    CommandViolation::MALFORMED_UTF8,
                    'Malformed UTF-8 encoding in request input'
                );
            }

            $totalBytes += strlen($data);
            if ($totalBytes > self::MAX_RAW_BYTES) {
                return new CommandViolation(
                    '',
                    CommandViolation::PAYLOAD_TOO_LARGE,
                    'Request payload exceeds maximum allowed size'
                );
            }

            return null;
        }

        if (is_resource($data)) {
            return new CommandViolation(
                '',
                CommandViolation::INVALID_TYPE,
                'Resource values are not permitted in JSON input'
            );
        }

        if (is_object($data)) {
            if (!$data instanceof stdClass) {
                return new CommandViolation(
                    '',
                    CommandViolation::INVALID_TYPE,
                    'Non-JSON object types are not permitted'
                );
            }

            $objId = spl_object_id($data);
            if (isset($ancestorObjectIds[$objId])) {
                return new CommandViolation(
                    '',
                    CommandViolation::MAX_DEPTH_EXCEEDED,
                    'Input structure contains cyclic references'
                );
            }

            $ancestorObjectIds[$objId] = true;
            $vars = get_object_vars($data);
            foreach ($vars as $propKey => $propVal) {
                $keyStr = (string) $propKey;
                if (!mb_check_encoding($keyStr, 'UTF-8')) {
                    unset($ancestorObjectIds[$objId]);

                    return new CommandViolation(
                        '',
                        CommandViolation::MALFORMED_UTF8,
                        'Malformed UTF-8 encoding in request input'
                    );
                }

                $totalBytes += strlen($keyStr);
                if ($totalBytes > self::MAX_RAW_BYTES) {
                    unset($ancestorObjectIds[$objId]);

                    return new CommandViolation(
                        '',
                        CommandViolation::PAYLOAD_TOO_LARGE,
                        'Request payload exceeds maximum allowed size'
                    );
                }

                $violation = $this->validateInputInstance(
                    $propVal,
                    $totalBytes,
                    $nodeCount,
                    $depth + 1,
                    $ancestorObjectIds
                );
                if ($violation !== null) {
                    unset($ancestorObjectIds[$objId]);

                    return $violation;
                }
            }
            unset($ancestorObjectIds[$objId]);

            return null;
        }

        if (is_array($data)) {
            foreach ($data as $arrKey => $arrVal) {
                if (is_string($arrKey)) {
                    if (!mb_check_encoding($arrKey, 'UTF-8')) {
                        return new CommandViolation(
                            '',
                            CommandViolation::MALFORMED_UTF8,
                            'Malformed UTF-8 encoding in request input'
                        );
                    }

                    $totalBytes += strlen($arrKey);
                    if ($totalBytes > self::MAX_RAW_BYTES) {
                        return new CommandViolation(
                            '',
                            CommandViolation::PAYLOAD_TOO_LARGE,
                            'Request payload exceeds maximum allowed size'
                        );
                    }
                }

                $violation = $this->validateInputInstance(
                    $arrVal,
                    $totalBytes,
                    $nodeCount,
                    $depth + 1,
                    $ancestorObjectIds
                );
                if ($violation !== null) {
                    return $violation;
                }
            }

            return null;
        }

        return new CommandViolation(
            '',
            CommandViolation::INVALID_TYPE,
            'Unsupported data type in JSON input'
        );
    }

    /**
     * @param array<string, mixed> $parameters
     */
    private function validateOperation(
        IdentityOperationContract $operation,
        mixed $payload,
        bool $isBodySupplied,
        array $parameters
    ): CommandValidationResult {
        $this->workSteps = 0;
        $this->budgetExhausted = false;
        $this->terminalViolation = null;
        $violations = [];

        // 1. Validate request body
        if (!$operation->hasBody) {
            if ($isBodySupplied) {
                $violations[] = new CommandViolation(
                    '',
                    CommandViolation::UNEXPECTED_BODY,
                    'Unexpected request body for bodyless operation'
                );
            }
        } else {
            if ($operation->requestBodySchema === null) {
                throw new InvalidCommandSchemaException(
                    'Operation declared hasBody: true but lacks requestBodySchema'
                );
            }

            if (!$isBodySupplied) {
                if ($operation->bodyRequired) {
                    $violations[] = new CommandViolation(
                        '',
                        CommandViolation::BODY_REQUIRED,
                        'Request body is required'
                    );
                }
            } else {
                $bodyViolations = $this->evaluateSchemaInternal(
                    $operation->requestBodySchema,
                    $payload,
                    '',
                    0
                );
                if ($this->budgetExhausted && $this->terminalViolation !== null) {
                    return CommandValidationResult::singleViolation(
                        $this->terminalViolation->getPath(),
                        $this->terminalViolation->getCode(),
                        $this->terminalViolation->getMessage()
                    );
                }
                $violations = array_merge($violations, $bodyViolations);
                if (count($violations) >= self::MAX_VIOLATIONS) {
                    $violations = array_slice($violations, 0, self::MAX_VIOLATIONS);
                }
            }
        }

        // 2. Validate parameters (path and query)
        if (count($violations) < self::MAX_VIOLATIONS && !$this->budgetExhausted) {
            $paramViolations = $this->evaluateParameters($operation, $parameters);
            if ($this->budgetExhausted && $this->terminalViolation !== null) {
                return CommandValidationResult::singleViolation(
                    $this->terminalViolation->getPath(),
                    $this->terminalViolation->getCode(),
                    $this->terminalViolation->getMessage()
                );
            }
            $violations = array_merge($violations, $paramViolations);
            if (count($violations) > self::MAX_VIOLATIONS) {
                $violations = array_slice($violations, 0, self::MAX_VIOLATIONS);
            }
        }

        if (empty($violations)) {
            return CommandValidationResult::success();
        }

        return CommandValidationResult::failure($violations);
    }

    /**
     * @param array<string, mixed> $parameters
     * @return list<CommandViolation>
     */
    private function evaluateParameters(IdentityOperationContract $operation, array $parameters): array
    {
        $violations = [];

        foreach ($operation->parameters as $paramSpec) {
            if ($this->budgetExhausted) {
                return [$this->terminalViolation];
            }
            if ($this->workSteps > self::MAX_WORK_STEPS || count($violations) >= self::MAX_VIOLATIONS) {
                if ($this->workSteps > self::MAX_WORK_STEPS) {
                    return [$this->triggerBudgetExhaustion('', 'Validation evaluation work budget exceeded')];
                }
                break;
            }

            $name = $paramSpec['name'];
            $required = (bool) ($paramSpec['required'] ?? false);
            $schema = $paramSpec['schema'];
            $paramPath = "parameters.{$name}";

            if (!array_key_exists($name, $parameters)) {
                if ($required) {
                    $violations[] = new CommandViolation(
                        $paramPath,
                        CommandViolation::REQUIRED_FIELD_MISSING,
                        'Missing required parameter'
                    );
                }
                continue;
            }

            $rawVal = $parameters[$name];

            // Invariant: Parameters arrive already decoded by the transport layer / router.
            // Do NOT call urldecode() here: preserves opaque IDs like 'trv+name', literal '%2F', and Unicode.
            $paramViolations = $this->evaluateSchemaInternal($schema, $rawVal, $paramPath, 0);
            if ($this->budgetExhausted) {
                return [$this->terminalViolation];
            }
            $violations = array_merge($violations, $paramViolations);
            if (count($violations) >= self::MAX_VIOLATIONS) {
                $violations = array_slice($violations, 0, self::MAX_VIOLATIONS);
                break;
            }
        }

        return $violations;
    }

    /**
     * Safe public entry for arbitrary schema evaluation.
     * Enforces the same input complexity bounds and preflights the schema fail-closed before evaluation.
     *
     * @param array<string, mixed>|bool $schema
     * @return list<CommandViolation>
     * @throws InvalidCommandSchemaException
     */
    public function evaluateSchema(array|bool $schema, mixed $data, string $currentPath = '', int $depth = 0): array
    {
        $totalBytes = 0;
        $nodeCount = 0;
        $ancestorObjectIds = [];

        if ($violation = $this->validateInputInstance($data, $totalBytes, $nodeCount, 0, $ancestorObjectIds)) {
            return [$violation];
        }

        // Fail-closed preflight check on arbitrary schema
        IdentitySchemaPreflight::preflight($schema, $this->contracts->getAllSchemas());

        $this->workSteps = 0;
        $this->budgetExhausted = false;
        $this->terminalViolation = null;

        $violations = $this->evaluateSchemaInternal($schema, $data, $currentPath, $depth);
        if ($this->budgetExhausted && $this->terminalViolation !== null) {
            return [$this->terminalViolation];
        }

        return $violations;
    }

    private function triggerBudgetExhaustion(string $currentPath, string $message): CommandViolation
    {
        $this->budgetExhausted = true;
        $this->terminalViolation = new CommandViolation(
            '',
            CommandViolation::MAX_DEPTH_EXCEEDED,
            $message
        );

        return $this->terminalViolation;
    }

    /**
     * Internal recursive schema evaluation with complexity budget.
     *
     * @param array<string, mixed>|bool $schema
     * @return list<CommandViolation>
     */
    private function evaluateSchemaInternal(array|bool $schema, mixed $data, string $currentPath, int $depth): array
    {
        if ($this->budgetExhausted && $this->terminalViolation !== null) {
            return [$this->terminalViolation];
        }

        $this->workSteps++;
        if ($this->workSteps > self::MAX_WORK_STEPS) {
            return [$this->triggerBudgetExhaustion($currentPath, 'Validation evaluation work budget exceeded')];
        }

        if ($depth > self::MAX_EVALUATION_DEPTH) {
            return [$this->triggerBudgetExhaustion($currentPath, 'Maximum validation evaluation depth exceeded')];
        }

        // Boolean schema node: true accepts all, false rejects all.
        if (is_bool($schema)) {
            if ($schema === false) {
                return [
                    new CommandViolation(
                        $currentPath,
                        CommandViolation::NOT_FAILED,
                        'Boolean false schema rejects all instances'
                    ),
                ];
            }

            return [];
        }

        $violations = [];

        // 1. $ref resolution with conjunctive sibling evaluation
        if (array_key_exists('$ref', $schema)) {
            $ref = (string) $schema['$ref'];
            $target = $this->contracts->getSchema($ref);
            if ($target === null) {
                return [
                    new CommandViolation(
                        $currentPath,
                        CommandViolation::UNKNOWN_OPERATION,
                        'Unresolved schema reference'
                    ),
                ];
            }

            $targetViolations = $this->evaluateSchemaInternal($target, $data, $currentPath, $depth + 1);
            if ($this->budgetExhausted && $this->terminalViolation !== null) {
                return [$this->terminalViolation];
            }
            $violations = array_merge($violations, $targetViolations);
            if (count($violations) >= self::MAX_VIOLATIONS) {
                return array_slice($violations, 0, self::MAX_VIOLATIONS);
            }

            // Sibling evaluation
            $siblingKeys = array_filter(array_keys($schema), static fn (string|int $k): bool => (string) $k !== '$ref');
            if (!empty($siblingKeys)) {
                $siblingSchema = [];
                foreach ($siblingKeys as $k) {
                    $siblingSchema[(string) $k] = $schema[$k];
                }
                $sibViolations = $this->evaluateSchemaInternal($siblingSchema, $data, $currentPath, $depth + 1);
                if ($this->budgetExhausted && $this->terminalViolation !== null) {
                    return [$this->terminalViolation];
                }
                $violations = array_merge($violations, $sibViolations);
                if (count($violations) >= self::MAX_VIOLATIONS) {
                    return array_slice($violations, 0, self::MAX_VIOLATIONS);
                }
            }

            return $violations;
        }

        // 2. Type validation
        if (array_key_exists('type', $schema)) {
            $typeMatch = $this->matchesType($schema['type'], $data);
            if (!$typeMatch) {
                return [
                    new CommandViolation(
                        $currentPath,
                        CommandViolation::INVALID_TYPE,
                        'Value does not match required type'
                    ),
                ];
            }
        }

        // 3. UTF-8 check for string data
        if (is_string($data) && !mb_check_encoding($data, 'UTF-8')) {
            return [
                new CommandViolation(
                    $currentPath,
                    CommandViolation::MALFORMED_UTF8,
                    'String contains malformed UTF-8'
                ),
            ];
        }

        // 4. const check
        if (array_key_exists('const', $schema)) {
            if (!$this->deepEqual($schema['const'], $data)) {
                $violations[] = new CommandViolation(
                    $currentPath,
                    CommandViolation::CONST_MISMATCH,
                    'Value does not match expected const'
                );
            }
        }

        // 5. enum check
        if (array_key_exists('enum', $schema) && is_array($schema['enum'])) {
            $found = false;
            foreach ($schema['enum'] as $enumVal) {
                if ($this->deepEqual($enumVal, $data)) {
                    $found = true;
                    break;
                }
            }
            if (!$found) {
                $violations[] = new CommandViolation(
                    $currentPath,
                    CommandViolation::INVALID_ENUM,
                    'Value is not in allowed enum options'
                );
            }
        }

        // 6. Numeric constraints (finite numbers only)
        if (is_int($data) || (is_float($data) && is_finite($data))) {
            if (array_key_exists('minimum', $schema) && is_numeric($schema['minimum']) && $data < $schema['minimum']) {
                $violations[] = new CommandViolation(
                    $currentPath,
                    CommandViolation::NUMBER_TOO_SMALL,
                    'Number is less than minimum'
                );
            }
            if (array_key_exists('maximum', $schema) && is_numeric($schema['maximum']) && $data > $schema['maximum']) {
                $violations[] = new CommandViolation(
                    $currentPath,
                    CommandViolation::NUMBER_TOO_LARGE,
                    'Number is greater than maximum'
                );
            }
            if (
                array_key_exists('exclusiveMinimum', $schema) &&
                is_numeric($schema['exclusiveMinimum']) &&
                $data <= $schema['exclusiveMinimum']
            ) {
                $violations[] = new CommandViolation(
                    $currentPath,
                    CommandViolation::NUMBER_TOO_SMALL,
                    'Number is not strictly greater than exclusiveMinimum'
                );
            }
            if (
                array_key_exists('exclusiveMaximum', $schema) &&
                is_numeric($schema['exclusiveMaximum']) &&
                $data >= $schema['exclusiveMaximum']
            ) {
                $violations[] = new CommandViolation(
                    $currentPath,
                    CommandViolation::NUMBER_TOO_LARGE,
                    'Number is not strictly less than exclusiveMaximum'
                );
            }
            if (array_key_exists('multipleOf', $schema) && is_numeric($schema['multipleOf']) && $schema['multipleOf'] > 0) {
                $remainder = fmod((float) $data, (float) $schema['multipleOf']);
                if (abs($remainder) > 1e-9 && abs($remainder - (float) $schema['multipleOf']) > 1e-9) {
                    $violations[] = new CommandViolation(
                        $currentPath,
                        CommandViolation::NOT_MULTIPLE_OF,
                        'Number is not a multiple of specified step'
                    );
                }
            }
        }

        // 7. String constraints (Unicode code points, pattern, format)
        if (is_string($data)) {
            $codePoints = mb_strlen($data, 'UTF-8');

            if (array_key_exists('minLength', $schema) && is_int($schema['minLength']) && $codePoints < $schema['minLength']) {
                $violations[] = new CommandViolation(
                    $currentPath,
                    CommandViolation::STRING_TOO_SHORT,
                    'String length in code points is less than minimum'
                );
            }
            if (array_key_exists('maxLength', $schema) && is_int($schema['maxLength']) && $codePoints > $schema['maxLength']) {
                $violations[] = new CommandViolation(
                    $currentPath,
                    CommandViolation::STRING_TOO_LONG,
                    'String length in code points is greater than maximum'
                );
            }
            if (array_key_exists('pattern', $schema) && is_string($schema['pattern'])) {
                $pattern = '/' . str_replace('/', '\/', $schema['pattern']) . '/u';
                if (@preg_match($pattern, $data) !== 1) {
                    $violations[] = new CommandViolation(
                        $currentPath,
                        CommandViolation::PATTERN_MISMATCH,
                        'String does not match required regex pattern'
                    );
                }
            }
            if (array_key_exists('format', $schema) && is_string($schema['format'])) {
                if (!$this->validateFormat($schema['format'], $data)) {
                    $violations[] = new CommandViolation(
                        $currentPath,
                        CommandViolation::INVALID_FORMAT,
                        'Field does not conform to required format'
                    );
                }
            }
        }

        // 8. Combinators
        // allOf
        if (array_key_exists('allOf', $schema) && is_array($schema['allOf'])) {
            foreach ($schema['allOf'] as $branch) {
                if ($this->budgetExhausted && $this->terminalViolation !== null) {
                    return [$this->terminalViolation];
                }
                if ($this->workSteps > self::MAX_WORK_STEPS || count($violations) >= self::MAX_VIOLATIONS) {
                    if ($this->workSteps > self::MAX_WORK_STEPS) {
                        return [$this->triggerBudgetExhaustion($currentPath, 'Validation evaluation work budget exceeded')];
                    }
                    break;
                }
                if (is_array($branch) || is_bool($branch)) {
                    $bViolations = $this->evaluateSchemaInternal($branch, $data, $currentPath, $depth + 1);
                    if ($this->budgetExhausted && $this->terminalViolation !== null) {
                        return [$this->terminalViolation];
                    }
                    $violations = array_merge($violations, $bViolations);
                    if (count($violations) >= self::MAX_VIOLATIONS) {
                        $violations = array_slice($violations, 0, self::MAX_VIOLATIONS);
                        break;
                    }
                }
            }
        }

        // anyOf
        if (array_key_exists('anyOf', $schema) && is_array($schema['anyOf'])) {
            $anyPassed = false;
            foreach ($schema['anyOf'] as $branch) {
                if ($this->budgetExhausted && $this->terminalViolation !== null) {
                    return [$this->terminalViolation];
                }
                if ($this->workSteps > self::MAX_WORK_STEPS) {
                    return [$this->triggerBudgetExhaustion($currentPath, 'Validation evaluation work budget exceeded')];
                }
                if (is_array($branch) || is_bool($branch)) {
                    $bViolations = $this->evaluateSchemaInternal($branch, $data, $currentPath, $depth + 1);
                    if ($this->budgetExhausted && $this->terminalViolation !== null) {
                        return [$this->terminalViolation];
                    }
                    if (empty($bViolations)) {
                        $anyPassed = true;
                        break;
                    }
                }
            }
            if (!$anyPassed) {
                $violations[] = new CommandViolation(
                    $currentPath,
                    CommandViolation::ANY_OF_FAILED,
                    'Payload did not match any allowed anyOf schema branch'
                );
            }
        }

        // oneOf
        if (array_key_exists('oneOf', $schema) && is_array($schema['oneOf'])) {
            $matchCount = 0;
            foreach ($schema['oneOf'] as $branch) {
                if ($this->budgetExhausted && $this->terminalViolation !== null) {
                    return [$this->terminalViolation];
                }
                if ($this->workSteps > self::MAX_WORK_STEPS) {
                    return [$this->triggerBudgetExhaustion($currentPath, 'Validation evaluation work budget exceeded')];
                }
                if (is_array($branch) || is_bool($branch)) {
                    $bViolations = $this->evaluateSchemaInternal($branch, $data, $currentPath, $depth + 1);
                    if ($this->budgetExhausted && $this->terminalViolation !== null) {
                        return [$this->terminalViolation];
                    }
                    if (empty($bViolations)) {
                        $matchCount++;
                    }
                }
            }
            if ($matchCount !== 1) {
                $violations[] = new CommandViolation(
                    $currentPath,
                    CommandViolation::ONE_OF_FAILED,
                    'Payload must match exactly one oneOf branch'
                );
            }
        }

        // not
        if (array_key_exists('not', $schema)) {
            if ($this->budgetExhausted && $this->terminalViolation !== null) {
                return [$this->terminalViolation];
            }
            $notSchema = $schema['not'];
            if (is_array($notSchema) || is_bool($notSchema)) {
                $notViolations = $this->evaluateSchemaInternal($notSchema, $data, $currentPath, $depth + 1);
                if ($this->budgetExhausted && $this->terminalViolation !== null) {
                    return [$this->terminalViolation];
                }
                if (empty($notViolations)) {
                    $violations[] = new CommandViolation(
                        $currentPath,
                        CommandViolation::NOT_FAILED,
                        'Payload matched disallowed schema branch'
                    );
                }
            }
        }

        // 9. Object properties and additionalProperties
        if ($this->isObjectLike($data)) {
            $props = $this->extractObjectProperties($data);
            $declaredProps = isset($schema['properties']) && is_array($schema['properties'])
                ? array_keys($schema['properties'])
                : [];

            // Required properties check (checks presence only, never nullability)
            if (array_key_exists('required', $schema) && is_array($schema['required'])) {
                foreach ($schema['required'] as $reqField) {
                    if ($this->budgetExhausted && $this->terminalViolation !== null) {
                        return [$this->terminalViolation];
                    }
                    if ($this->workSteps > self::MAX_WORK_STEPS || count($violations) >= self::MAX_VIOLATIONS) {
                        if ($this->workSteps > self::MAX_WORK_STEPS) {
                            return [$this->triggerBudgetExhaustion($currentPath, 'Validation evaluation work budget exceeded')];
                        }
                        break;
                    }
                    if (is_string($reqField)) {
                        $fieldPath = $currentPath === '' ? $reqField : "{$currentPath}.{$reqField}";
                        if (!array_key_exists($reqField, $props)) {
                            $violations[] = new CommandViolation(
                                $fieldPath,
                                CommandViolation::REQUIRED_FIELD_MISSING,
                                'Missing required property'
                            );
                            if (count($violations) >= self::MAX_VIOLATIONS) {
                                break;
                            }
                        }
                    }
                }
            }

            // additionalProperties check
            if (array_key_exists('additionalProperties', $schema)) {
                $addProps = $schema['additionalProperties'];
                if ($addProps === false) {
                    $declaredSet = array_flip($declaredProps);
                    $hasDisallowed = false;
                    foreach (array_keys($props) as $propKey) {
                        if (!isset($declaredSet[$propKey])) {
                            $hasDisallowed = true;
                            break;
                        }
                    }
                    if ($hasDisallowed) {
                        // Invariant: Path is the authentic container path, NEVER the unknown property name!
                        $violations[] = new CommandViolation(
                            $currentPath,
                            CommandViolation::ADDITIONAL_PROPERTIES_DISALLOWED,
                            'Additional properties are disallowed'
                        );
                    }
                } elseif (is_array($addProps) || is_bool($addProps)) {
                    $declaredSet = array_flip($declaredProps);
                    foreach ($props as $propKey => $propVal) {
                        if ($this->budgetExhausted && $this->terminalViolation !== null) {
                            return [$this->terminalViolation];
                        }
                        if ($this->workSteps > self::MAX_WORK_STEPS || count($violations) >= self::MAX_VIOLATIONS) {
                            if ($this->workSteps > self::MAX_WORK_STEPS) {
                                return [$this->triggerBudgetExhaustion($currentPath, 'Validation evaluation work budget exceeded')];
                            }
                            break;
                        }
                        if (!isset($declaredSet[$propKey])) {
                            // Invariant: Do not leak arbitrary unknown input keys via schema paths!
                            $sanitizedPath = $currentPath === '' ? 'additionalProperties' : "{$currentPath}.additionalProperties";
                            $extraViolations = $this->evaluateSchemaInternal(
                                $addProps,
                                $propVal,
                                $sanitizedPath,
                                $depth + 1
                            );
                            if ($this->budgetExhausted && $this->terminalViolation !== null) {
                                return [$this->terminalViolation];
                            }
                            $violations = array_merge($violations, $extraViolations);
                            if (count($violations) >= self::MAX_VIOLATIONS) {
                                $violations = array_slice($violations, 0, self::MAX_VIOLATIONS);
                                break;
                            }
                        }
                    }
                }
            }

            // Evaluate declared property sub-schemas (evaluates every present property, including null)
            if (isset($schema['properties']) && is_array($schema['properties'])) {
                foreach ($schema['properties'] as $propName => $propSchema) {
                    if ($this->budgetExhausted && $this->terminalViolation !== null) {
                        return [$this->terminalViolation];
                    }
                    if ($this->workSteps > self::MAX_WORK_STEPS || count($violations) >= self::MAX_VIOLATIONS) {
                        if ($this->workSteps > self::MAX_WORK_STEPS) {
                            return [$this->triggerBudgetExhaustion($currentPath, 'Validation evaluation work budget exceeded')];
                        }
                        break;
                    }
                    if ((is_array($propSchema) || is_bool($propSchema)) && array_key_exists($propName, $props)) {
                        $propVal = $props[$propName];
                        $propPath = $currentPath === '' ? (string) $propName : "{$currentPath}.{$propName}";
                        $pViolations = $this->evaluateSchemaInternal(
                            $propSchema,
                            $propVal,
                            $propPath,
                            $depth + 1
                        );
                        if ($this->budgetExhausted && $this->terminalViolation !== null) {
                            return [$this->terminalViolation];
                        }
                        $violations = array_merge($violations, $pViolations);
                        if (count($violations) >= self::MAX_VIOLATIONS) {
                            $violations = array_slice($violations, 0, self::MAX_VIOLATIONS);
                            break;
                        }
                    }
                }
            }
        }

        // 10. Array items
        if (is_array($data) && array_is_list($data)) {
            $itemCount = count($data);
            if (array_key_exists('minItems', $schema) && is_int($schema['minItems']) && $itemCount < $schema['minItems']) {
                $violations[] = new CommandViolation(
                    $currentPath,
                    CommandViolation::ARRAY_TOO_FEW_ITEMS,
                    'Array has fewer items than minimum'
                );
            }
            if (array_key_exists('maxItems', $schema) && is_int($schema['maxItems']) && $itemCount > $schema['maxItems']) {
                $violations[] = new CommandViolation(
                    $currentPath,
                    CommandViolation::ARRAY_TOO_MANY_ITEMS,
                    'Array has more items than maximum'
                );
            }
            if (array_key_exists('uniqueItems', $schema) && $schema['uniqueItems'] === true) {
                if (!$this->hasUniqueItems($data)) {
                    if ($this->budgetExhausted && $this->terminalViolation !== null) {
                        return [$this->terminalViolation];
                    }
                    $violations[] = new CommandViolation(
                        $currentPath,
                        CommandViolation::ARRAY_DUPLICATE_ITEMS,
                        'Array items must be unique'
                    );
                }
            }
            if (array_key_exists('items', $schema)) {
                $itemsSchema = $schema['items'];
                if (is_array($itemsSchema) || is_bool($itemsSchema)) {
                    foreach ($data as $idx => $item) {
                        if ($this->budgetExhausted && $this->terminalViolation !== null) {
                            return [$this->terminalViolation];
                        }
                        if ($this->workSteps > self::MAX_WORK_STEPS || count($violations) >= self::MAX_VIOLATIONS) {
                            if ($this->workSteps > self::MAX_WORK_STEPS) {
                                return [$this->triggerBudgetExhaustion($currentPath, 'Validation evaluation work budget exceeded')];
                            }
                            break;
                        }
                        $itemPath = "{$currentPath}[{$idx}]";
                        $iViolations = $this->evaluateSchemaInternal($itemsSchema, $item, $itemPath, $depth + 1);
                        if ($this->budgetExhausted && $this->terminalViolation !== null) {
                            return [$this->terminalViolation];
                        }
                        $violations = array_merge($violations, $iViolations);
                        if (count($violations) >= self::MAX_VIOLATIONS) {
                            $violations = array_slice($violations, 0, self::MAX_VIOLATIONS);
                            break;
                        }
                    }
                }
            }
        }

        return $violations;
    }

    /**
     * Strict primitive type match. NO coercion!
     * Supports mathematical integers (1.0 is integer) and rejects non-finite floats (INF, NAN).
     */
    private function matchesType(string|array $expectedType, mixed $data): bool
    {
        if (is_array($expectedType)) {
            foreach ($expectedType as $t) {
                if ($this->matchesSingleType((string) $t, $data)) {
                    return true;
                }
            }
            return false;
        }

        return $this->matchesSingleType($expectedType, $data);
    }

    private function matchesSingleType(string $type, mixed $data): bool
    {
        return match ($type) {
            'string' => is_string($data),
            'boolean' => is_bool($data),
            'integer' => is_int($data) || (is_float($data) && is_finite($data) && floor($data) === $data),
            'number' => is_int($data) || (is_float($data) && is_finite($data)),
            'null' => $data === null,
            'array' => is_array($data) && array_is_list($data),
            'object' => $this->isObjectLike($data),
            default => false,
        };
    }

    private function isObjectLike(mixed $data): bool
    {
        if ($data instanceof stdClass) {
            return true;
        }

        // An empty PHP array [] is a list in JSON, NOT an object!
        if (is_array($data)) {
            return !empty($data) && !array_is_list($data);
        }

        return false;
    }

    /**
     * @return array<string, mixed>
     */
    private function extractObjectProperties(mixed $data): array
    {
        if ($data instanceof stdClass) {
            return get_object_vars($data);
        }

        if (is_array($data)) {
            return $data;
        }

        return [];
    }

    /**
     * Strict format validation for accepted formats.
     */
    private function validateFormat(string $format, string $val): bool
    {
        return match ($format) {
            'email' => (bool) preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $val),
            'uuid' => (bool) preg_match(
                '/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/',
                $val
            ),
            'date' => $this->isValidISODate($val),
            'date-time' => $this->isValidRFC3339DateTime($val),
            'time' => $this->isValidRFC3339Time($val),
            'uri' => $this->isValidUri($val),
            default => false,
        };
    }

    /**
     * Validates strict Gregorian ISO calendar date (YYYY-MM-DD).
     */
    private function isValidISODate(string $str): bool
    {
        if (preg_match('/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/', $str, $matches) !== 1) {
            return false;
        }

        $y = (int) $matches[1];
        $m = (int) $matches[2];
        $d = (int) $matches[3];

        return checkdate($m, $d, $y);
    }

    /**
     * Validates RFC 3339 date-time representation.
     */
    private function isValidRFC3339DateTime(string $str): bool
    {
        $regex = '/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[Tt]([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?([Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/';
        if (preg_match($regex, $str, $matches) !== 1) {
            return false;
        }

        $y = (int) $matches[1];
        $m = (int) $matches[2];
        $d = (int) $matches[3];

        return checkdate($m, $d, $y);
    }

    /**
     * Validates RFC 3339 time representation (HH:mm:ss[.subsec](Z|+HH:mm)).
     */
    private function isValidRFC3339Time(string $str): bool
    {
        $regex = '/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?([Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/';

        return (bool) preg_match($regex, $str);
    }

    /**
     * Validates absolute URI.
     */
    private function isValidUri(string $str): bool
    {
        if (filter_var($str, FILTER_VALIDATE_URL) === false) {
            return false;
        }
        $parts = parse_url($str);

        return !empty($parts['scheme']) && !empty($parts['host']);
    }

    /**
     * Strict deep equality comparison for JSON scalar and structured values.
     * Enforces JSON Schema numeric equality (1 == 1.0), order-independent objects,
     * and strict object vs list distinction.
     */
    public function deepEqual(mixed $a, mixed $b): bool
    {
        // Numeric equality per JSON Schema: 1 and 1.0 are equal if finite numbers
        $aIsNum = is_int($a) || (is_float($a) && is_finite($a));
        $bIsNum = is_int($b) || (is_float($b) && is_finite($b));

        if ($aIsNum && $bIsNum) {
            return (float) $a === (float) $b;
        }
        if ($aIsNum !== $bIsNum) {
            return false;
        }

        // Object vs list distinction
        $aIsObj = $this->isObjectLike($a);
        $bIsObj = $this->isObjectLike($b);

        if ($aIsObj && $bIsObj) {
            $propsA = $this->extractObjectProperties($a);
            $propsB = $this->extractObjectProperties($b);

            if (count($propsA) !== count($propsB)) {
                return false;
            }

            foreach ($propsA as $k => $v) {
                if (!array_key_exists($k, $propsB) || !$this->deepEqual($v, $propsB[$k])) {
                    return false;
                }
            }

            return true;
        }

        if ($aIsObj !== $bIsObj) {
            return false;
        }

        // List arrays
        if (is_array($a) && is_array($b)) {
            if (array_is_list($a) && array_is_list($b)) {
                if (count($a) !== count($b)) {
                    return false;
                }
                foreach ($a as $i => $v) {
                    if (!$this->deepEqual($v, $b[$i])) {
                        return false;
                    }
                }

                return true;
            }

            return false;
        }

        return $a === $b;
    }

    /**
     * @param list<mixed> $items
     */
    private function hasUniqueItems(array $items): bool
    {
        $count = count($items);
        for ($i = 0; $i < $count; $i++) {
            for ($j = $i + 1; $j < $count; $j++) {
                if ($this->budgetExhausted) {
                    return false;
                }
                $this->workSteps++;
                if ($this->workSteps > self::MAX_WORK_STEPS) {
                    $this->triggerBudgetExhaustion('', 'Validation evaluation work budget exceeded');

                    return false;
                }
                if ($this->deepEqual($items[$i], $items[$j])) {
                    return false;
                }
            }
        }

        return true;
    }
}
