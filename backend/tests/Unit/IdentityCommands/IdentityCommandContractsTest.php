<?php

declare(strict_types=1);

namespace Tests\Unit\IdentityCommands;

use App\Identity\Contracts\Exceptions\InvalidCommandSchemaException;
use App\Identity\Contracts\IdentityCommandContracts;
use App\Identity\Contracts\IdentityOperationContract;
use App\Identity\Contracts\IdentitySchemaPreflight;
use PHPUnit\Framework\TestCase;

final class IdentityCommandContractsTest extends TestCase
{
    public function testLoadsAll41AcceptedIdentityOperations(): void
    {
        $contracts = IdentityCommandContracts::default();

        $this->assertSame(41, $contracts->getOperationCount());
        $this->assertStringStartsWith('sha256:', $contracts->getDigest());

        // Verify key representative operations exist
        $this->assertTrue($contracts->hasOperation('getAuthCsrfBootstrap'));
        $this->assertTrue($contracts->hasOperation('postPassengerRegister'));
        $this->assertTrue($contracts->hasOperation('postPassengerLogin'));
        $this->assertTrue($contracts->hasOperation('postPassengerLogout'));
        $this->assertTrue($contracts->hasOperation('getStaffCsrfBootstrap'));
        $this->assertTrue($contracts->hasOperation('postStaffLogin'));
        $this->assertTrue($contracts->hasOperation('postStaffMfaVerify'));
        $this->assertTrue($contracts->hasOperation('patchStaffUser'));
        $this->assertTrue($contracts->hasOperation('deleteSavedTraveler'));
    }

    public function testRouteMappingResolvesCorrectOperations(): void
    {
        $contracts = IdentityCommandContracts::default();

        $loginOp = $contracts->getOperationByRoute('POST', '/auth/login');
        $this->assertNotNull($loginOp);
        $this->assertSame('postPassengerLogin', $loginOp->operationId);
        $this->assertTrue($loginOp->hasBody);
        $this->assertTrue($loginOp->bodyRequired);

        $csrfOp = $contracts->getOperationByRoute('GET', '/auth/csrf');
        $this->assertNotNull($csrfOp);
        $this->assertSame('getAuthCsrfBootstrap', $csrfOp->operationId);
        $this->assertFalse($csrfOp->hasBody);

        $deleteSessionOp = $contracts->getOperationByRoute('DELETE', '/staff/sessions/{id}');
        $this->assertNotNull($deleteSessionOp);
        $this->assertSame('deleteStaffSession', $deleteSessionOp->operationId);
        $this->assertFalse($deleteSessionOp->hasBody);
        $this->assertCount(1, $deleteSessionOp->getPathParameters());
    }

    public function testTamperedDigestThrowsException(): void
    {
        $tempFile = tempnam(sys_get_temp_dir(), 'contract_tamper_');
        $this->assertNotFalse($tempFile);

        try {
            $defaultJson = (string) file_get_contents(IdentityCommandContracts::DEFAULT_CONTRACT_FILE);
            /** @var array<string, mixed> $data */
            $data = json_decode($defaultJson, true);
            $data['canonicalDigest'] = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
            file_put_contents($tempFile, json_encode($data));

            $this->expectException(InvalidCommandSchemaException::class);
            $this->expectExceptionMessage('Contract digest verification failed');

            new IdentityCommandContracts($tempFile);
        } finally {
            @unlink($tempFile);
        }
    }

    public function testPreflightRejectsUnsupportedKeywords(): void
    {
        $malformedSchema = [
            'type' => 'object',
            'properties' => [
                'name' => [
                    'type' => 'string',
                    'unsupportedKeyword' => 'disallowedValue',
                ],
            ],
        ];

        $this->expectException(InvalidCommandSchemaException::class);
        $this->expectExceptionMessage('Unsupported schema assertion keyword (fail-closed policy)');

        IdentitySchemaPreflight::preflight($malformedSchema);
    }

    public function testPreflightRecursionIntoNotAndItemsRejectsUnsupportedKeywords(): void
    {
        // Recursion into 'not'
        $notSchema = ['not' => ['minProperties' => 1]];
        $caughtNot = false;
        try {
            IdentitySchemaPreflight::preflight($notSchema);
        } catch (InvalidCommandSchemaException $e) {
            $caughtNot = true;
            $this->assertStringContainsString('Unsupported schema assertion keyword (fail-closed policy)', $e->getMessage());
            $this->assertStringNotContainsString('minProperties', $e->getMessage());
        }
        $this->assertTrue($caughtNot, 'Expected preflight to fail closed on unsupported keyword in not');

        // Recursion into 'items'
        $itemsSchema = ['type' => 'array', 'items' => ['minProperties' => 1]];
        $caughtItems = false;
        try {
            IdentitySchemaPreflight::preflight($itemsSchema);
        } catch (InvalidCommandSchemaException $e) {
            $caughtItems = true;
            $this->assertStringContainsString('Unsupported schema assertion keyword (fail-closed policy)', $e->getMessage());
            $this->assertStringNotContainsString('minProperties', $e->getMessage());
        }
        $this->assertTrue($caughtItems, 'Expected preflight to fail closed on unsupported keyword in items');

        // Rejection of array-form items tuple
        $tupleSchema = ['type' => 'array', 'items' => [['type' => 'string']]];
        $caughtTuple = false;
        try {
            IdentitySchemaPreflight::preflight($tupleSchema);
        } catch (InvalidCommandSchemaException $e) {
            $caughtTuple = true;
            $this->assertStringContainsString('Array-form items tuple is unsupported', $e->getMessage());
        }
        $this->assertTrue($caughtTuple, 'Expected preflight to reject array-form items');
    }

    public function testPreflightRejectsMalformedKeywordShapesAndValues(): void
    {
        // type: null
        try {
            IdentitySchemaPreflight::preflight(['type' => null]);
            $this->fail('Expected rejection of type: null');
        } catch (InvalidCommandSchemaException $e) {
            $this->assertStringContainsString('Invalid schema type definition', $e->getMessage());
        }

        // minimum: '2' (string instead of finite number)
        try {
            IdentitySchemaPreflight::preflight(['minimum' => '2']);
            $this->fail("Expected rejection of minimum: '2'");
        } catch (InvalidCommandSchemaException $e) {
            $this->assertStringContainsString('Numeric bound keyword must be a finite number', $e->getMessage());
        }

        // multipleOf: -1
        try {
            IdentitySchemaPreflight::preflight(['multipleOf' => -1]);
            $this->fail('Expected rejection of multipleOf: -1');
        } catch (InvalidCommandSchemaException $e) {
            $this->assertStringContainsString("Keyword 'multipleOf' must be a finite positive number", $e->getMessage());
        }

        // required: ['x', 'x'] (duplicate)
        try {
            IdentitySchemaPreflight::preflight(['required' => ['x', 'x']]);
            $this->fail('Expected rejection of duplicate in required');
        } catch (InvalidCommandSchemaException $e) {
            $this->assertStringContainsString('Duplicate field name in required list', $e->getMessage());
            $this->assertStringNotContainsString("'x'", $e->getMessage());
        }

        // enum with duplicate
        try {
            IdentitySchemaPreflight::preflight(['enum' => ['val', 'val']]);
            $this->fail('Expected rejection of duplicate in enum');
        } catch (InvalidCommandSchemaException $e) {
            $this->assertStringContainsString("Keyword 'enum' contains duplicate values", $e->getMessage());
        }

        // uniqueItems with non-bool
        try {
            IdentitySchemaPreflight::preflight(['uniqueItems' => 'true']);
            $this->fail('Expected rejection of non-bool uniqueItems');
        } catch (InvalidCommandSchemaException $e) {
            $this->assertStringContainsString("Keyword 'uniqueItems' must be a boolean", $e->getMessage());
        }

        // minLength with negative integer
        try {
            IdentitySchemaPreflight::preflight(['minLength' => -1]);
            $this->fail('Expected rejection of negative minLength');
        } catch (InvalidCommandSchemaException $e) {
            $this->assertStringContainsString('Length or items count keyword must be a non-negative integer', $e->getMessage());
        }
    }

    public function testPreflightRejectsCyclicReferences(): void
    {
        $schemas = [
            '#/components/schemas/A' => [
                'type' => 'object',
                '$ref' => '#/components/schemas/B',
            ],
            '#/components/schemas/B' => [
                'type' => 'object',
                '$ref' => '#/components/schemas/A',
            ],
        ];

        $this->expectException(InvalidCommandSchemaException::class);
        $this->expectExceptionMessage('Cyclic schema reference detected');

        IdentitySchemaPreflight::preflight($schemas['#/components/schemas/A'], $schemas);
    }

    public function testPreflightRejectsExcessiveDepth(): void
    {
        $current = ['type' => 'string'];
        for ($i = 0; $i < 60; $i++) {
            $current = [
                'type' => 'object',
                'properties' => ['nested' => $current],
            ];
        }

        $this->expectException(InvalidCommandSchemaException::class);
        $this->expectExceptionMessage('Maximum schema preflight depth exceeded');

        IdentitySchemaPreflight::preflight($current);
    }

    public function testRegistryRejectsMismatchedKeyToOperationId(): void
    {
        $tempFile = tempnam(sys_get_temp_dir(), 'contract_mismatch_');
        $this->assertNotFalse($tempFile);

        try {
            $defaultJson = (string) file_get_contents(IdentityCommandContracts::DEFAULT_CONTRACT_FILE);
            /** @var array<string, mixed> $data */
            $data = json_decode($defaultJson, true);
            $firstKey = array_key_first($data['operations']);
            $firstOp = $data['operations'][$firstKey];
            unset($data['operations'][$firstKey]);
            $data['operations']['mismatchedKeyName'] = $firstOp;

            // Compute correct digest so digest check passes and structure validation triggers
            $payload = [
                'operations' => $data['operations'],
                'schemas' => $data['schemas'],
            ];
            $canonicalJson = (string) json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            $data['canonicalDigest'] = 'sha256:' . hash('sha256', $canonicalJson);

            file_put_contents($tempFile, json_encode($data));

            $this->expectException(InvalidCommandSchemaException::class);
            $this->expectExceptionMessage('Operation key does not match operationId');

            new IdentityCommandContracts($tempFile);
        } finally {
            @unlink($tempFile);
        }
    }

    public function testRegistryRejectsInconsistentPathTemplateParameters(): void
    {
        $tempFile = tempnam(sys_get_temp_dir(), 'contract_param_mismatch_');
        $this->assertNotFalse($tempFile);

        try {
            $defaultJson = (string) file_get_contents(IdentityCommandContracts::DEFAULT_CONTRACT_FILE);
            /** @var array<string, mixed> $data */
            $data = json_decode($defaultJson, true);

            // Mutate deleteStaffSession path to add undeclared template param {extraId}
            $data['operations']['deleteStaffSession']['path'] = '/staff/sessions/{id}/{extraId}';

            $payload = [
                'operations' => $data['operations'],
                'schemas' => $data['schemas'],
            ];
            $canonicalJson = (string) json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            $data['canonicalDigest'] = 'sha256:' . hash('sha256', $canonicalJson);

            file_put_contents($tempFile, json_encode($data));

            $this->expectException(InvalidCommandSchemaException::class);
            $this->expectExceptionMessage('Path template parameter missing from declared path parameters');

            new IdentityCommandContracts($tempFile);
        } finally {
            @unlink($tempFile);
        }
    }

    public function testRegistryRejectsUnknownRootField(): void
    {
        $tempFile = tempnam(sys_get_temp_dir(), 'contract_root_extra_');
        $this->assertNotFalse($tempFile);

        try {
            $defaultJson = (string) file_get_contents(IdentityCommandContracts::DEFAULT_CONTRACT_FILE);
            /** @var array<string, mixed> $data */
            $data = json_decode($defaultJson, true);
            $data['unexpectedRootExtension'] = 'malicious';

            file_put_contents($tempFile, json_encode($data));

            $this->expectException(InvalidCommandSchemaException::class);
            $this->expectExceptionMessage('Unexpected field in contract root');

            new IdentityCommandContracts($tempFile);
        } finally {
            @unlink($tempFile);
        }
    }

    public function testRegistryRejectsMissingRequiredRootField(): void
    {
        $tempFile = tempnam(sys_get_temp_dir(), 'contract_root_missing_');
        $this->assertNotFalse($tempFile);

        try {
            $defaultJson = (string) file_get_contents(IdentityCommandContracts::DEFAULT_CONTRACT_FILE);
            /** @var array<string, mixed> $data */
            $data = json_decode($defaultJson, true);
            unset($data['operationCount']);

            file_put_contents($tempFile, json_encode($data));

            $this->expectException(InvalidCommandSchemaException::class);
            $this->expectExceptionMessage('Missing required field in contract root');

            new IdentityCommandContracts($tempFile);
        } finally {
            @unlink($tempFile);
        }
    }

    public function testOperationContractRejectsUnknownOperationField(): void
    {
        $this->expectException(InvalidCommandSchemaException::class);
        $this->expectExceptionMessage('Unexpected field in operation contract');

        IdentityOperationContract::fromArray([
            'operationId' => 'testOp',
            'method' => 'GET',
            'path' => '/auth/csrf',
            'hasBody' => false,
            'bodyRequired' => false,
            'requestBodySchema' => null,
            'parameters' => [],
            'unexpectedField' => 'disallowed',
        ]);
    }

    public function testOperationContractRejectsUnknownParameterField(): void
    {
        $this->expectException(InvalidCommandSchemaException::class);
        $this->expectExceptionMessage('Unexpected field in parameter declaration');

        IdentityOperationContract::fromArray([
            'operationId' => 'testOp',
            'method' => 'GET',
            'path' => '/auth/csrf',
            'hasBody' => false,
            'bodyRequired' => false,
            'requestBodySchema' => null,
            'parameters' => [
                [
                    'name' => 'testParam',
                    'in' => 'query',
                    'required' => false,
                    'schema' => ['type' => 'string'],
                    'unexpectedParamField' => 'disallowed',
                ],
            ],
        ]);
    }

    public function testOperationContractRejectsNullOrMissingParameterSchema(): void
    {
        $caughtNull = false;
        try {
            IdentityOperationContract::fromArray([
                'operationId' => 'testOp',
                'method' => 'GET',
                'path' => '/auth/csrf',
                'hasBody' => false,
                'bodyRequired' => false,
                'requestBodySchema' => null,
                'parameters' => [
                    [
                        'name' => 'testParam',
                        'in' => 'query',
                        'required' => false,
                        'schema' => null,
                    ],
                ],
            ]);
        } catch (InvalidCommandSchemaException $e) {
            $caughtNull = true;
            $this->assertSame('Parameter has invalid or missing schema in operation contract', $e->getMessage());
        }
        $this->assertTrue($caughtNull);

        $caughtMissing = false;
        try {
            IdentityOperationContract::fromArray([
                'operationId' => 'testOp',
                'method' => 'GET',
                'path' => '/auth/csrf',
                'hasBody' => false,
                'bodyRequired' => false,
                'requestBodySchema' => null,
                'parameters' => [
                    [
                        'name' => 'testParam',
                        'in' => 'query',
                        'required' => false,
                    ],
                ],
            ]);
        } catch (InvalidCommandSchemaException $e) {
            $caughtMissing = true;
            $this->assertSame('Missing required field in parameter declaration', $e->getMessage());
        }
        $this->assertTrue($caughtMissing);
    }

    public function testOperationContractRejectsMalformedParameterMapsAndLists(): void
    {
        // Parameters as associative map instead of list
        try {
            IdentityOperationContract::fromArray([
                'operationId' => 'testOp',
                'method' => 'GET',
                'path' => '/auth/csrf',
                'hasBody' => false,
                'bodyRequired' => false,
                'requestBodySchema' => null,
                'parameters' => ['paramName' => ['name' => 'id']],
            ]);
            $this->fail('Expected rejection of non-list parameters');
        } catch (InvalidCommandSchemaException $e) {
            $this->assertStringContainsString("Field 'parameters' must be a list array", $e->getMessage());
        }

        // Single parameter declared as list instead of associative map
        try {
            IdentityOperationContract::fromArray([
                'operationId' => 'testOp',
                'method' => 'GET',
                'path' => '/auth/csrf',
                'hasBody' => false,
                'bodyRequired' => false,
                'requestBodySchema' => null,
                'parameters' => [['name', 'query', false]],
            ]);
            $this->fail('Expected rejection of list parameter item');
        } catch (InvalidCommandSchemaException $e) {
            $this->assertStringContainsString('Parameter must be an associative map', $e->getMessage());
        }
    }

    public function testOperationContractRejectsDuplicateParameterDeclarations(): void
    {
        $this->expectException(InvalidCommandSchemaException::class);
        $this->expectExceptionMessage('Duplicate parameter in location in operation contract');

        IdentityOperationContract::fromArray([
            'operationId' => 'testOp',
            'method' => 'GET',
            'path' => '/auth/csrf',
            'hasBody' => false,
            'bodyRequired' => false,
            'requestBodySchema' => null,
            'parameters' => [
                [
                    'name' => 'id',
                    'in' => 'query',
                    'required' => false,
                    'schema' => ['type' => 'string'],
                ],
                [
                    'name' => 'id',
                    'in' => 'query',
                    'required' => false,
                    'schema' => ['type' => 'string'],
                ],
            ],
        ]);
    }

    public function testBooleanSchemaContainersAcceptedPositively(): void
    {
        // Positive control: requestBodySchema: true and parameter schema: false
        $op = IdentityOperationContract::fromArray([
            'operationId' => 'testBoolSchemaOp',
            'method' => 'POST',
            'path' => '/auth/register',
            'hasBody' => true,
            'bodyRequired' => true,
            'requestBodySchema' => true,
            'parameters' => [
                [
                    'name' => 'testParam',
                    'in' => 'query',
                    'required' => false,
                    'schema' => false,
                ],
            ],
        ]);

        $this->assertSame('testBoolSchemaOp', $op->operationId);
        $this->assertTrue($op->requestBodySchema);
        $this->assertFalse($op->parameters[0]['schema']);
    }
}
