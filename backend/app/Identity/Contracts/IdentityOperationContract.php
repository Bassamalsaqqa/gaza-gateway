<?php

declare(strict_types=1);

namespace App\Identity\Contracts;

use App\Identity\Contracts\Exceptions\InvalidCommandSchemaException;

/**
 * Representation of a single accepted identity HTTP operation contract.
 *
 * Invariants:
 * - Server-owned operationId, route, and method.
 * - Closed, non-coercive parameter and schema containers.
 * - Enforces mutual consistency between hasBody, bodyRequired, and requestBodySchema.
 * - Path parameters must be declared in path template and have required: true.
 * - Exact allowed keys enforced with safe fixed errors (no arbitrary keys or paths echoed).
 */
final class IdentityOperationContract
{
    public const array ACCEPTED_BOOKING_OPERATION_TUPLES = [
        'POST /bookings/{ref}/challenge postCreateGuestChallenge' => true,
        'POST /bookings/{ref}/verify-challenge postVerifyGuestChallenge' => true,
        'POST /account/bookings/claim/challenge postCreateClaimChallenge' => true,
        'POST /account/bookings/claim/verify postVerifyClaimChallenge' => true,
        'POST /account/bookings/claim postClaimBookingToAccount' => true,
    ];

    private const array ALLOWED_OPERATION_FIELDS = [
        'operationId' => true,
        'method' => true,
        'path' => true,
        'hasBody' => true,
        'bodyRequired' => true,
        'requestBodySchema' => true,
        'parameters' => true,
    ];

    private const array ALLOWED_PARAMETER_FIELDS = [
        'name' => true,
        'in' => true,
        'required' => true,
        'schema' => true,
    ];

    /**
     * @param array<string, mixed>|bool|null $requestBodySchema
     * @param list<array{name: string, in: string, required: bool, schema: array<string, mixed>|bool}> $parameters
     */
    public function __construct(
        public readonly string $operationId,
        public readonly string $method,
        public readonly string $path,
        public readonly bool $hasBody,
        public readonly bool $bodyRequired,
        public readonly array|bool|null $requestBodySchema,
        public readonly array $parameters = [],
    ) {
    }

    /**
     * Reconstructs and validates an operation contract from an associative map.
     *
     * @param array<string, mixed> $data
     * @throws InvalidCommandSchemaException
     */
    public static function fromArray(array $data): self
    {
        // Enforce exact closed operation shape: no unknown fields allowed
        foreach (array_keys($data) as $field) {
            if (!isset(self::ALLOWED_OPERATION_FIELDS[(string) $field])) {
                throw new InvalidCommandSchemaException('Unexpected field in operation contract');
            }
        }

        foreach (array_keys(self::ALLOWED_OPERATION_FIELDS) as $reqField) {
            if (!array_key_exists($reqField, $data)) {
                throw new InvalidCommandSchemaException('Missing required field in operation contract');
            }
        }

        if (!is_string($data['operationId']) || $data['operationId'] === '') {
            throw new InvalidCommandSchemaException('Missing or invalid operationId in operation contract');
        }

        if (
            !is_string($data['method']) ||
            !in_array(strtoupper($data['method']), ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], true)
        ) {
            throw new InvalidCommandSchemaException('Invalid HTTP method in operation contract');
        }

        $path = $data['path'];
        if (!is_string($path)) {
            throw new InvalidCommandSchemaException('Invalid route path in operation contract');
        }

        $isIdentityPath = str_starts_with($path, '/auth/') || str_starts_with($path, '/staff/');
        if (!$isIdentityPath) {
            $tuple = strtoupper($data['method']) . " {$path} {$data['operationId']}";
            if (!isset(self::ACCEPTED_BOOKING_OPERATION_TUPLES[$tuple])) {
                throw new InvalidCommandSchemaException('Invalid route path in operation contract');
            }
        }

        if (!is_bool($data['hasBody'])) {
            throw new InvalidCommandSchemaException("Field 'hasBody' must be a boolean in operation contract");
        }

        if (!is_bool($data['bodyRequired'])) {
            throw new InvalidCommandSchemaException("Field 'bodyRequired' must be a boolean in operation contract");
        }

        $hasBody = $data['hasBody'];
        $bodyRequired = $data['bodyRequired'];
        $requestBodySchema = $data['requestBodySchema'];

        if ($hasBody) {
            if ($requestBodySchema === null || (!is_array($requestBodySchema) && !is_bool($requestBodySchema))) {
                throw new InvalidCommandSchemaException(
                    'Operation declaring hasBody: true must specify a valid requestBodySchema'
                );
            }
        } else {
            if ($requestBodySchema !== null) {
                throw new InvalidCommandSchemaException(
                    'Operation declaring hasBody: false cannot specify requestBodySchema'
                );
            }
            if ($bodyRequired) {
                throw new InvalidCommandSchemaException(
                    'Operation declaring hasBody: false cannot specify bodyRequired: true'
                );
            }
        }

        if (!is_array($data['parameters']) || (!empty($data['parameters']) && !array_is_list($data['parameters']))) {
            throw new InvalidCommandSchemaException("Field 'parameters' must be a list array in operation contract");
        }

        /** @var list<array{name: string, in: string, required: bool, schema: array<string, mixed>|bool}> $parameters */
        $parameters = [];
        $seenParamKeys = [];

        foreach ($data['parameters'] as $idx => $param) {
            if (!is_array($param) || array_is_list($param)) {
                throw new InvalidCommandSchemaException('Parameter must be an associative map in operation contract');
            }

            // Enforce exact closed parameter shape
            foreach (array_keys($param) as $pField) {
                if (!isset(self::ALLOWED_PARAMETER_FIELDS[(string) $pField])) {
                    throw new InvalidCommandSchemaException('Unexpected field in parameter declaration');
                }
            }
            foreach (array_keys(self::ALLOWED_PARAMETER_FIELDS) as $reqPField) {
                if (!array_key_exists($reqPField, $param)) {
                    throw new InvalidCommandSchemaException('Missing required field in parameter declaration');
                }
            }

            if (!is_string($param['name']) || $param['name'] === '') {
                throw new InvalidCommandSchemaException('Parameter missing name in operation contract');
            }

            if (!is_string($param['in']) || !in_array($param['in'], ['path', 'query'], true)) {
                throw new InvalidCommandSchemaException('Parameter has invalid in location in operation contract');
            }

            if (!is_bool($param['required'])) {
                throw new InvalidCommandSchemaException('Parameter has non-boolean required in operation contract');
            }

            if ($param['in'] === 'path' && !$param['required']) {
                throw new InvalidCommandSchemaException('Path parameter must have required: true in operation contract');
            }

            // Parameter schema must be explicit, valid, and non-null (no silent defaults!)
            if (!is_array($param['schema']) && !is_bool($param['schema'])) {
                throw new InvalidCommandSchemaException('Parameter has invalid or missing schema in operation contract');
            }

            $paramKey = "{$param['in']}:{$param['name']}";
            if (isset($seenParamKeys[$paramKey])) {
                throw new InvalidCommandSchemaException('Duplicate parameter in location in operation contract');
            }
            $seenParamKeys[$paramKey] = true;

            $parameters[] = [
                'name' => $param['name'],
                'in' => $param['in'],
                'required' => $param['required'],
                'schema' => $param['schema'],
            ];
        }

        // The canonical parser owns path-template/declaration consistency.
        preg_match_all('/\{([^}]+)\}/', $path, $matches);
        $templateParams = $matches[1] ?? [];
        $pathParamNames = array_column(
            array_filter($parameters, static fn (array $param): bool => $param['in'] === 'path'),
            'name',
        );
        foreach ($templateParams as $name) {
            if (!in_array($name, $pathParamNames, true)) {
                throw new InvalidCommandSchemaException('Path template parameter missing from declared path parameters');
            }
        }
        foreach ($pathParamNames as $name) {
            if (!in_array($name, $templateParams, true)) {
                throw new InvalidCommandSchemaException('Path parameter is not present in path template');
            }
        }

        return new self(
            operationId: $data['operationId'],
            method: strtoupper($data['method']),
            path: $data['path'],
            hasBody: $hasBody,
            bodyRequired: $bodyRequired,
            requestBodySchema: $requestBodySchema,
            parameters: $parameters,
        );
    }

    public function requiresBody(): bool
    {
        return $this->hasBody && $this->bodyRequired;
    }

    /**
     * @return list<array{name: string, in: string, required: bool, schema: array<string, mixed>|bool}>
     */
    public function getPathParameters(): array
    {
        return array_values(
            array_filter($this->parameters, static fn (array $p): bool => ($p['in'] ?? '') === 'path')
        );
    }

    /**
     * @return list<array{name: string, in: string, required: bool, schema: array<string, mixed>|bool}>
     */
    public function getQueryParameters(): array
    {
        return array_values(
            array_filter($this->parameters, static fn (array $p): bool => ($p['in'] ?? '') === 'query')
        );
    }

    /**
     * @return array{name: string, in: string, required: bool, schema: array<string, mixed>|bool}|null
     */
    public function getParameter(string $name, string $in = 'path'): ?array
    {
        foreach ($this->parameters as $parameter) {
            if (($parameter['name'] ?? null) === $name && ($parameter['in'] ?? null) === $in) {
                return $parameter;
            }
        }

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'operationId' => $this->operationId,
            'method' => $this->method,
            'path' => $this->path,
            'hasBody' => $this->hasBody,
            'bodyRequired' => $this->bodyRequired,
            'requestBodySchema' => $this->requestBodySchema,
            'parameters' => $this->parameters,
        ];
    }
}
