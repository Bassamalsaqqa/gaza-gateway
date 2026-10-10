<?php

declare(strict_types=1);

namespace App\Identity\Contracts;

use App\Identity\Contracts\Exceptions\InvalidCommandSchemaException;

/**
 * Immutable registry for accepted identity command contracts.
 *
 * Invariants:
 * - Reads immutable JSON schema artifact from app/Identity/Contracts.
 * - Validates root artifact structure, version, phase, and exact operation count (41).
 * - Enforces exact closed shapes: no unknown fields allowed on root or operation containers.
 * - Enforces exact key-to-operationId identity and unique routes/operations.
 * - Verifies canonical SHA-256 schema digest at initialization.
 * - Preflights all reachable operation schemas fail-closed before use.
 * - Server-owned operationId and route mapping.
 */
final class IdentityCommandContracts
{
    public const string DEFAULT_CONTRACT_FILE = __DIR__ . '/identity-command-contracts.v1.json';
    public const string EXPECTED_SCHEMA = 'https://json-schema.org/draft/2020-12/schema';
    public const string EXPECTED_VERSION = '1.0.0';
    public const string EXPECTED_PHASE = '13B';
    public const int EXPECTED_OPERATION_COUNT = 41;

    private const array ALLOWED_ROOT_FIELDS = [
        '$schema' => true,
        'contractVersion' => true,
        'phase' => true,
        'canonicalDigest' => true,
        'operationCount' => true,
        'operations' => true,
        'schemas' => true,
    ];

    private static ?self $instance = null;

    private readonly string $canonicalDigest;
    private readonly int $operationCount;

    /**
     * @var array<string, IdentityOperationContract>
     */
    private readonly array $operations;

    /**
     * @var array<string, IdentityOperationContract>
     */
    private readonly array $routeMap;

    /**
     * @var array<string, array<string, mixed>|bool>
     */
    private readonly array $schemas;

    /**
     * @throws InvalidCommandSchemaException
     */
    public function __construct(?string $contractFilePath = null)
    {
        $filePath = $contractFilePath ?? self::DEFAULT_CONTRACT_FILE;

        if (!file_exists($filePath)) {
            throw new InvalidCommandSchemaException('Identity command contract file not found');
        }

        $rawJson = (string) file_get_contents($filePath);
        $data = json_decode($rawJson, true);

        if (!is_array($data) || array_is_list($data)) {
            throw new InvalidCommandSchemaException('Failed to decode contract JSON file or root is not an object');
        }

        // Enforce exact closed root shape: reject unknown fields
        foreach (array_keys($data) as $field) {
            if (!isset(self::ALLOWED_ROOT_FIELDS[(string) $field])) {
                throw new InvalidCommandSchemaException('Unexpected field in contract root');
            }
        }

        foreach (array_keys(self::ALLOWED_ROOT_FIELDS) as $reqField) {
            if (!array_key_exists($reqField, $data)) {
                throw new InvalidCommandSchemaException('Missing required field in contract root');
            }
        }

        // Validate root artifact values
        if ($data['$schema'] !== self::EXPECTED_SCHEMA) {
            throw new InvalidCommandSchemaException('Invalid or missing $schema in contract artifact');
        }

        if ($data['contractVersion'] !== self::EXPECTED_VERSION) {
            throw new InvalidCommandSchemaException('Invalid or missing contractVersion in contract artifact');
        }

        if ($data['phase'] !== self::EXPECTED_PHASE) {
            throw new InvalidCommandSchemaException('Invalid or missing phase in contract artifact');
        }

        if (!is_string($data['canonicalDigest']) || !str_starts_with($data['canonicalDigest'], 'sha256:')) {
            throw new InvalidCommandSchemaException('Missing or invalid canonicalDigest in identity command contract');
        }

        if (!is_int($data['operationCount']) || $data['operationCount'] !== self::EXPECTED_OPERATION_COUNT) {
            throw new InvalidCommandSchemaException('Invalid or missing operationCount in identity command contract');
        }

        if (!is_array($data['operations']) || empty($data['operations']) || array_is_list($data['operations'])) {
            throw new InvalidCommandSchemaException('Missing or invalid operations map in identity command contract');
        }

        if (count($data['operations']) !== self::EXPECTED_OPERATION_COUNT) {
            throw new InvalidCommandSchemaException('Expected exactly ' . self::EXPECTED_OPERATION_COUNT . ' operations');
        }

        if (!is_array($data['schemas']) || (!empty($data['schemas']) && array_is_list($data['schemas']))) {
            throw new InvalidCommandSchemaException('Missing or invalid schemas map in identity command contract');
        }

        $this->canonicalDigest = $data['canonicalDigest'];
        $this->schemas = $data['schemas'];

        // Validate operations structure, exact key identity, unique routes, and template consistency first
        $operations = [];
        $routeMap = [];

        foreach ($data['operations'] as $opKey => $opData) {
            if (!is_string($opKey) || !is_array($opData)) {
                throw new InvalidCommandSchemaException('Invalid operation record in contract');
            }

            if (!isset($opData['operationId']) || $opData['operationId'] !== $opKey) {
                throw new InvalidCommandSchemaException('Operation key does not match operationId');
            }

            if (isset($operations[$opKey])) {
                throw new InvalidCommandSchemaException('Duplicate operation identifier in contract');
            }

            $operation = IdentityOperationContract::fromArray($opData);

            $routeKey = strtoupper($operation->method) . ' ' . $operation->path;
            if (isset($routeMap[$routeKey])) {
                throw new InvalidCommandSchemaException('Duplicate route definition in contract');
            }

            // Path template declaration consistency
            preg_match_all('/\{([^}]+)\}/', $operation->path, $matches);
            $templateParams = $matches[1] ?? [];
            $pathParams = $operation->getPathParameters();
            $pathParamNames = array_map(static fn (array $p): string => $p['name'], $pathParams);

            foreach ($templateParams as $tParam) {
                if (!in_array($tParam, $pathParamNames, true)) {
                    throw new InvalidCommandSchemaException('Path template parameter missing from declared path parameters');
                }
            }
            foreach ($pathParamNames as $pName) {
                if (!in_array($pName, $templateParams, true)) {
                    throw new InvalidCommandSchemaException('Path parameter is not present in path template');
                }
            }

            if ($operation->requestBodySchema !== null) {
                IdentitySchemaPreflight::preflight($operation->requestBodySchema, $this->schemas);
            }

            foreach ($operation->parameters as $param) {
                if (isset($param['schema']) && (is_array($param['schema']) || is_bool($param['schema']))) {
                    IdentitySchemaPreflight::preflight($param['schema'], $this->schemas);
                }
            }

            $operations[$operation->operationId] = $operation;
            $routeMap[$routeKey] = $operation;
        }

        // Preflight all schemas
        foreach ($this->schemas as $schema) {
            IdentitySchemaPreflight::preflight($schema, $this->schemas);
        }

        // Verify canonical digest
        $this->verifyDigest($data['operations'], $data['schemas'], $this->canonicalDigest);

        $this->operations = $operations;
        $this->routeMap = $routeMap;
        $this->operationCount = count($operations);
    }

    public static function default(): self
    {
        return self::$instance ??= new self();
    }

    public static function resetDefault(): void
    {
        self::$instance = null;
    }

    public function getDigest(): string
    {
        return $this->canonicalDigest;
    }

    public function getOperationCount(): int
    {
        return $this->operationCount;
    }

    public function hasOperation(string $operationId): bool
    {
        return isset($this->operations[$operationId]);
    }

    public function getOperation(string $operationId): ?IdentityOperationContract
    {
        return $this->operations[$operationId] ?? null;
    }

    public function getOperationByRoute(string $method, string $path): ?IdentityOperationContract
    {
        $key = strtoupper($method) . ' ' . $path;

        return $this->routeMap[$key] ?? null;
    }

    /**
     * @return array<string, IdentityOperationContract>
     */
    public function getOperations(): array
    {
        return $this->operations;
    }

    /**
     * @return array<string, mixed>|bool|null
     */
    public function getSchema(string $ref): array|bool|null
    {
        return $this->schemas[$ref] ?? null;
    }

    /**
     * @return array<string, array<string, mixed>|bool>
     */
    public function getAllSchemas(): array
    {
        return $this->schemas;
    }

    /**
     * Recursively sort keys to ensure deterministic JSON encoding matching generator.
     */
    public static function sortKeys(mixed $value): mixed
    {
        if (is_array($value)) {
            if (array_is_list($value)) {
                return array_map(self::sortKeys(...), $value);
            }
            ksort($value, SORT_STRING);
            foreach ($value as $k => $v) {
                $value[$k] = self::sortKeys($v);
            }

            return $value;
        }

        return $value;
    }

    /**
     * @param array<string, mixed> $operations
     * @param array<string, mixed> $schemas
     * @throws InvalidCommandSchemaException
     */
    private function verifyDigest(array $operations, array $schemas, string $expectedDigest): void
    {
        $payload = [
            'operations' => self::sortKeys($operations),
            'schemas' => self::sortKeys($schemas),
        ];

        $canonicalJson = (string) json_encode(
            $payload,
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR
        );

        $computedDigest = 'sha256:' . hash('sha256', $canonicalJson);

        if ($computedDigest !== $expectedDigest) {
            throw new InvalidCommandSchemaException('Contract digest verification failed');
        }
    }
}
