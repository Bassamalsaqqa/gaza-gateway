<?php

declare(strict_types=1);

namespace Tests\Unit\IdentityCommands;

use App\Identity\Contracts\CommandViolation;
use App\Identity\Contracts\Exceptions\InvalidCommandSchemaException;
use App\Identity\Contracts\IdentityCommandValidator;
use App\Identity\Contracts\IdentitySchemaPreflight;
use PHPUnit\Framework\TestCase;
use stdClass;

final class IdentityCommandBoundariesAndSecurityTest extends TestCase
{
    private IdentityCommandValidator $validator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->validator = new IdentityCommandValidator();
    }

    public function testUnicodeCodepointsCountedForPasswordCreation(): void
    {
        // 14 ASCII characters: fails
        $r14 = $this->validator->validate('postPassengerRegister', (object) [
            'email' => 'test@example.com',
            'firstName' => 'Ahmad',
            'lastName' => 'Masri',
            'password' => str_repeat('a', 14),
        ]);
        $this->assertFalse($r14->isValid());
        $this->assertTrue($r14->hasViolationCode(CommandViolation::STRING_TOO_SHORT));

        // 15 ASCII characters: passes
        $r15 = $this->validator->validate('postPassengerRegister', (object) [
            'email' => 'test@example.com',
            'firstName' => 'Ahmad',
            'lastName' => 'Masri',
            'password' => str_repeat('a', 15),
        ]);
        $this->assertTrue($r15->isValid());

        // 15 Arabic characters (each character is 2 bytes in UTF-8, total 30 bytes, but 15 code points)
        $arabic15 = mb_substr(str_repeat('فلسطين', 5), 0, 15, 'UTF-8');
        $this->assertSame(15, mb_strlen($arabic15, 'UTF-8'));
        $this->assertSame(30, strlen($arabic15));

        $r15Ar = $this->validator->validate('postPassengerRegister', (object) [
            'email' => 'test@example.com',
            'firstName' => 'Ahmad',
            'lastName' => 'Masri',
            'password' => $arabic15,
        ]);
        $this->assertTrue($r15Ar->isValid());

        // 128 characters: passes
        $r128 = $this->validator->validate('postPassengerRegister', (object) [
            'email' => 'test@example.com',
            'firstName' => 'Ahmad',
            'lastName' => 'Masri',
            'password' => str_repeat('z', 128),
        ]);
        $this->assertTrue($r128->isValid());

        // 129 characters: fails
        $r129 = $this->validator->validate('postPassengerRegister', (object) [
            'email' => 'test@example.com',
            'firstName' => 'Ahmad',
            'lastName' => 'Masri',
            'password' => str_repeat('z', 129),
        ]);
        $this->assertFalse($r129->isValid());
        $this->assertTrue($r129->hasViolationCode(CommandViolation::STRING_TOO_LONG));
    }

    public function testStaffPasswordBoundaries(): void
    {
        // 11 chars: fails
        $r11 = $this->validator->validate('postStaffInvitationAccept', (object) [
            'token' => str_repeat('t', 32),
            'password' => str_repeat('p', 11),
        ]);
        $this->assertFalse($r11->isValid());
        $this->assertTrue($r11->hasViolationCode(CommandViolation::STRING_TOO_SHORT));

        // 12 chars: passes
        $r12 = $this->validator->validate('postStaffInvitationAccept', (object) [
            'token' => str_repeat('t', 32),
            'password' => str_repeat('p', 12),
        ]);
        $this->assertTrue($r12->isValid());
    }

    public function testLoginSchemaDoesNotInventPasswordMinimum(): void
    {
        // Passenger login has no minLength declared in openapi.v1.json
        $res = $this->validator->validate('postPassengerLogin', (object) [
            'email' => 'test@example.com',
            'password' => 'short',
        ]);
        $this->assertTrue($res->isValid());
    }

    public function testPasswordBytesPreservedWithoutTrimming(): void
    {
        // Password with spaces at beginning and end
        $spacedPassword = '  password12345  ';
        $res = $this->validator->validate('postPassengerRegister', (object) [
            'email' => 'test@example.com',
            'firstName' => 'Ahmad',
            'lastName' => 'Masri',
            'password' => $spacedPassword,
        ]);
        $this->assertTrue($res->isValid());
    }

    public function testIllFormedUtf8StringRejected(): void
    {
        $malformedUtf8 = chr(0xC3) . chr(0x28);

        $res = $this->validator->validate('postPassengerLogin', (object) [
            'email' => 'test@example.com',
            'password' => $malformedUtf8,
        ]);

        $this->assertFalse($res->isValid());
        $this->assertTrue($res->hasViolationCode(CommandViolation::MALFORMED_UTF8));
    }

    public function testEmptyListRejectedWhenObjectExpected(): void
    {
        $res = $this->validator->validate('postPassengerLogin', []);

        $this->assertFalse($res->isValid());
        $this->assertTrue($res->hasViolationCode(CommandViolation::INVALID_TYPE));
    }

    public function testDisallowedAdditionalPropertiesDoesNotLeakKeyName(): void
    {
        $res = $this->validator->validate('postPassengerLogin', (object) [
            'email' => 'test@example.com',
            'password' => 'password123',
            'secretAdminInjectedKey' => true,
        ]);

        $this->assertFalse($res->isValid());
        $this->assertTrue($res->hasViolationCode(CommandViolation::ADDITIONAL_PROPERTIES_DISALLOWED));

        $violations = $res->getViolations();
        $this->assertNotEmpty($violations);

        $serialized = json_encode($res);
        $this->assertNotFalse($serialized);

        // Security Invariant: The unknown key name MUST NOT appear in the violation path or message
        $this->assertStringNotContainsString('secretAdminInjectedKey', $serialized);
        $this->assertSame('', $violations[0]->getPath());
    }

    public function testBodylessCommandRejectsUnexpectedBody(): void
    {
        // Null body passes
        $rNull = $this->validator->validate('getAuthCsrfBootstrap', null);
        $this->assertTrue($rNull->isValid());

        // Empty object fails
        $rObj = $this->validator->validate('getAuthCsrfBootstrap', new stdClass());
        $this->assertFalse($rObj->isValid());
        $this->assertTrue($rObj->hasViolationCode(CommandViolation::UNEXPECTED_BODY));

        // List fails
        $rList = $this->validator->validate('getAuthCsrfBootstrap', []);
        $this->assertFalse($rList->isValid());
        $this->assertTrue($rList->hasViolationCode(CommandViolation::UNEXPECTED_BODY));
    }

    public function testParameterValidationOpaqueTravelerVsUuid(): void
    {
        // deleteSavedTraveler uses opaque string id (not uuid)
        $rTraveler = $this->validator->validate('deleteSavedTraveler', null, [
            'id' => 'opaque-traveler-identifier-12345',
        ]);
        $this->assertTrue($rTraveler->isValid());

        // deleteStaffUser requires uuid
        $rStaffUuid = $this->validator->validate('deleteStaffUser', null, [
            'id' => '550e8400-e29b-41d4-a716-446655440000',
        ]);
        $this->assertTrue($rStaffUuid->isValid());

        // deleteStaffUser rejects non-uuid
        $rStaffNonUuid = $this->validator->validate('deleteStaffUser', null, [
            'id' => 'opaque-traveler-identifier-12345',
        ]);
        $this->assertFalse($rStaffNonUuid->isValid());
        $this->assertTrue($rStaffNonUuid->hasViolationCode(CommandViolation::INVALID_FORMAT));
        $this->assertSame('parameters.id', $rStaffNonUuid->getViolations()[0]->getPath());
    }

    public function testParameterBoundaryPreservesOpaqueIdsWithoutSecondaryUrlDecode(): void
    {
        // Test trv+name: must not be corrupted to 'trv name'
        $rPlus = $this->validator->validate('deleteSavedTraveler', null, [
            'id' => 'trv+name',
        ]);
        $this->assertTrue($rPlus->isValid());

        // Test literal %2F: must not be decoded
        $rSlash = $this->validator->validate('deleteSavedTraveler', null, [
            'id' => 'trv%2Fliteral',
        ]);
        $this->assertTrue($rSlash->isValid());

        // Test Unicode opaque traveler ID
        $rUnicode = $this->validator->validate('deleteSavedTraveler', null, [
            'id' => 'trv_فلسطين_01',
        ]);
        $this->assertTrue($rUnicode->isValid());
    }

    public function testMathematicalIntegerAndFiniteNumbers(): void
    {
        $schemaInt = ['type' => 'integer'];

        // Native integer passes
        $v1 = $this->validator->evaluateSchema($schemaInt, 1, 'intVal');
        $this->assertEmpty($v1);

        // Mathematical integer 1.0 (float with no fraction) passes per JSON Schema
        $vFloatInt = $this->validator->evaluateSchema($schemaInt, 1.0, 'intVal');
        $this->assertEmpty($vFloatInt);

        // Non-integer float 1.5 fails
        $vNonInt = $this->validator->evaluateSchema($schemaInt, 1.5, 'intVal');
        $this->assertNotEmpty($vNonInt);
        $this->assertSame(CommandViolation::INVALID_TYPE, $vNonInt[0]->getCode());

        // Non-finite float INF fails
        $vInf = $this->validator->evaluateSchema($schemaInt, INF, 'intVal');
        $this->assertNotEmpty($vInf);
        $this->assertSame(CommandViolation::INVALID_TYPE, $vInf[0]->getCode());

        // Non-finite float NAN fails
        $vNan = $this->validator->evaluateSchema($schemaInt, NAN, 'intVal');
        $this->assertNotEmpty($vNan);
        $this->assertSame(CommandViolation::INVALID_TYPE, $vNan[0]->getCode());

        // Number type tests
        $schemaNum = ['type' => 'number'];
        $this->assertEmpty($this->validator->evaluateSchema($schemaNum, 1, 'numVal'));
        $this->assertEmpty($this->validator->evaluateSchema($schemaNum, 1.5, 'numVal'));

        // Number rejects INF and NAN
        $vNumInf = $this->validator->evaluateSchema($schemaNum, INF, 'numVal');
        $this->assertNotEmpty($vNumInf);
        $this->assertSame(CommandViolation::INVALID_TYPE, $vNumInf[0]->getCode());

        $vNumNan = $this->validator->evaluateSchema($schemaNum, NAN, 'numVal');
        $this->assertNotEmpty($vNumNan);
        $this->assertSame(CommandViolation::INVALID_TYPE, $vNumNan[0]->getCode());
    }

    public function testBooleanSchemaNodesCoherentEvaluation(): void
    {
        // Boolean false rejects all instances
        $vFalse = $this->validator->evaluateSchema(false, 123, 'node');
        $this->assertNotEmpty($vFalse);
        $this->assertSame(CommandViolation::NOT_FAILED, $vFalse[0]->getCode());

        // Boolean true accepts all instances
        $vTrue = $this->validator->evaluateSchema(true, 123, 'node');
        $this->assertEmpty($vTrue);

        // not: true must fail against any instance (because true matches all, so not: true fails)
        $schemaNotTrue = ['not' => true];
        $vNotTrue = $this->validator->evaluateSchema($schemaNotTrue, 123, 'node');
        $this->assertNotEmpty($vNotTrue);
        $this->assertSame(CommandViolation::NOT_FAILED, $vNotTrue[0]->getCode());

        // not: false must pass against any instance (because false matches none, so not: false passes)
        $schemaNotFalse = ['not' => false];
        $vNotFalse = $this->validator->evaluateSchema($schemaNotFalse, 123, 'node');
        $this->assertEmpty($vNotFalse);
    }

    public function testPublicEvaluateSchemaPreflightGuardEnforcesFailClosedDialect(): void
    {
        // Public evaluateSchema must fail closed on unsupported keywords or malformed keywords
        $badSchemas = [
            ['unsupportedKey' => 'val'],
            ['not' => ['minProperties' => 1]],
            ['items' => ['minProperties' => 1]],
            ['type' => null],
            ['minimum' => '2'],
            ['multipleOf' => -1],
            ['required' => ['x', 'x']],
            ['enum' => [1, 1]],
            ['items' => [['type' => 'string']]],
        ];

        foreach ($badSchemas as $schema) {
            $caught = false;
            try {
                $this->validator->evaluateSchema($schema, 'test');
            } catch (InvalidCommandSchemaException) {
                $caught = true;
            }
            $this->assertTrue($caught, 'Expected public evaluateSchema to reject malformed schema');
        }
    }

    public function testDeepEqualityObjectVsArrayAndOrderIndependence(): void
    {
        // Order-independent object equality
        $obj1 = (object) ['a' => 1, 'b' => 2];
        $obj2 = (object) ['b' => 2, 'a' => 1];
        $this->assertTrue($this->validator->deepEqual($obj1, $obj2));

        // Object vs array distinction
        $objEmpty = new stdClass();
        $listEmpty = [];
        $this->assertFalse($this->validator->deepEqual($objEmpty, $listEmpty));

        $objA = (object) ['0' => 1];
        $listA = [1];
        $this->assertFalse($this->validator->deepEqual($objA, $listA));

        // Numeric equality per JSON Schema: 1 == 1.0
        $this->assertTrue($this->validator->deepEqual(1, 1.0));
        $this->assertTrue($this->validator->deepEqual(1.0, 1));

        // Type distinctions preserved
        $this->assertFalse($this->validator->deepEqual(1, '1'));
        $this->assertFalse($this->validator->deepEqual(1, true));
        $this->assertFalse($this->validator->deepEqual(0, false));
    }

    public function testAdditionalPropertiesSchemaPathDoesNotLeakInputKey(): void
    {
        // Schema with additionalProperties having schema requiring integer
        $schema = [
            'type' => 'object',
            'properties' => [
                'name' => ['type' => 'string'],
            ],
            'additionalProperties' => [
                'type' => 'integer',
            ],
        ];

        $data = (object) [
            'name' => 'Ahmad',
            'sensitivePrivateCustomerField' => 'notAnInteger',
        ];

        $violations = $this->validator->evaluateSchema($schema, $data, 'user');
        $this->assertNotEmpty($violations);

        $serialized = json_encode($violations);
        $this->assertNotFalse($serialized);

        // Security Invariant: The arbitrary property key MUST NOT be echoed in the path or message
        $this->assertStringNotContainsString('sensitivePrivateCustomerField', $serialized);
        $this->assertSame('user.additionalProperties', $violations[0]->getPath());
    }

    public function testRawJsonPayloadSizeLimit(): void
    {
        // Construct payload > 1 MiB (1,048,576 bytes)
        $largeString = str_repeat(' ', 1048580) . '{"email":"test@example.com","password":"pass"}';
        $this->assertGreaterThan(1048576, strlen($largeString));

        $result = $this->validator->validateJson('postPassengerLogin', $largeString);
        $this->assertFalse($result->isValid());
        $this->assertTrue($result->hasViolationCode(CommandViolation::PAYLOAD_TOO_LARGE));
    }

    public function testJsonDecodeDepthLimitAndMixedInputComplexity(): void
    {
        // Construct JSON nested > 32 levels deep
        $deepJson = str_repeat('{"a":', 35) . '1' . str_repeat('}', 35);

        $result = $this->validator->validateJson('postPassengerLogin', $deepJson);
        $this->assertFalse($result->isValid());
        $this->assertTrue($result->hasViolationCode(CommandViolation::MAX_DEPTH_EXCEEDED));

        // Construct PHP object nested > 32 levels deep
        $deepObj = 1;
        for ($i = 0; $i < 35; $i++) {
            $deepObj = (object) ['nested' => $deepObj];
        }

        $resultObj = $this->validator->validate('postPassengerLogin', $deepObj);
        $this->assertFalse($resultObj->isValid());
        $this->assertTrue($resultObj->hasViolationCode(CommandViolation::MAX_DEPTH_EXCEEDED));
    }

    public function testBodylessWhitespacePolicy(): void
    {
        // Bodyless operation with whitespace body passes
        $rWhitespace = $this->validator->validateJson('getAuthCsrfBootstrap', "   \n\t  ");
        $this->assertTrue($rWhitespace->isValid());

        // Bodyless operation with non-empty JSON body fails
        $rBody = $this->validator->validateJson('getAuthCsrfBootstrap', '  { "extra": true }  ');
        $this->assertFalse($rBody->isValid());
        $this->assertTrue($rBody->hasViolationCode(CommandViolation::UNEXPECTED_BODY));
    }

    public function testStrictGregorianDateValidation(): void
    {
        $schema = ['type' => 'string', 'format' => 'date'];

        // Valid leap day in leap year 2024
        $v2024 = $this->validator->evaluateSchema($schema, '2024-02-29', 'date', 0);
        $this->assertEmpty($v2024);

        // Invalid leap day in non-leap year 2026
        $v2026 = $this->validator->evaluateSchema($schema, '2026-02-29', 'date', 0);
        $this->assertNotEmpty($v2026);
        $this->assertSame(CommandViolation::INVALID_FORMAT, $v2026[0]->getCode());

        // Invalid month 13
        $vMonth13 = $this->validator->evaluateSchema($schema, '2026-13-10', 'date', 0);
        $this->assertNotEmpty($vMonth13);

        // Invalid day 31 in April (30-day month)
        $vApr31 = $this->validator->evaluateSchema($schema, '2026-04-31', 'date', 0);
        $this->assertNotEmpty($vApr31);

        // Valid day 30 in April
        $vApr30 = $this->validator->evaluateSchema($schema, '2026-04-30', 'date', 0);
        $this->assertEmpty($vApr30);
    }

    public function testValidateJsonSyntaxAndEncoding(): void
    {
        // Valid JSON
        $validJson = '{"email": "valid@example.com", "password": "pass"}';
        $rValid = $this->validator->validateJson('postPassengerLogin', $validJson);
        $this->assertTrue($rValid->isValid());

        // Malformed JSON syntax
        $badJson = '{"email": "valid@example.com", "password": }';
        $rSyntax = $this->validator->validateJson('postPassengerLogin', $badJson);
        $this->assertFalse($rSyntax->isValid());
        $this->assertTrue($rSyntax->hasViolationCode(CommandViolation::INVALID_JSON));

        // Bodyless with body in JSON
        $rBodyless = $this->validator->validateJson('getAuthCsrfBootstrap', '{"extra": true}');
        $this->assertFalse($rBodyless->isValid());
        $this->assertTrue($rBodyless->hasViolationCode(CommandViolation::UNEXPECTED_BODY));

        // Required body with null/empty JSON
        $rEmpty = $this->validator->validateJson('postPassengerLogin', '');
        $this->assertFalse($rEmpty->isValid());
        $this->assertTrue($rEmpty->hasViolationCode(CommandViolation::BODY_REQUIRED));
    }

    public function testMaxEvaluationDepthEnforcement(): void
    {
        $schema = [
            'type' => 'object',
            'properties' => [
                'nested' => [
                    'type' => 'string',
                ],
            ],
        ];

        // Evaluating with depth = 51 should immediately trigger MAX_DEPTH_EXCEEDED
        $violations = $this->validator->evaluateSchema($schema, (object) ['nested' => 'val'], '', 51);
        $this->assertNotEmpty($violations);
        $this->assertSame(CommandViolation::MAX_DEPTH_EXCEEDED, $violations[0]->getCode());
    }

    public function testRefSiblingsConjunctiveEvaluation(): void
    {
        // Schema combining a $ref with an additional sibling constraint
        $schema = [
            '$ref' => '#/components/schemas/LoginRequest',
            'properties' => [
                'email' => [
                    'type' => 'string',
                    'maxLength' => 10,
                ],
            ],
        ];

        // Valid according to LoginRequest, but fails sibling maxLength: 10
        $data = (object) [
            'email' => 'verylongemailaddress@example.com',
            'password' => 'secret123',
        ];

        $violations = $this->validator->evaluateSchema($schema, $data, '', 0);
        $this->assertNotEmpty($violations);
        $codes = array_map(static fn (CommandViolation $v): string => $v->getCode(), $violations);
        $this->assertContains(CommandViolation::STRING_TOO_LONG, $codes);
    }

    public function testNullPropertyEvaluatesAgainstSchemaAndRejectsNonNullableTypes(): void
    {
        // 1. putPassengerProfile with newsletter: null (newsletter is non-nullable boolean)
        // JSON path
        $resJson = $this->validator->validateJson('putPassengerProfile', '{"newsletter":null}');
        $this->assertFalse($resJson->isValid());
        $this->assertTrue($resJson->hasViolationCode(CommandViolation::INVALID_TYPE));
        $this->assertSame('newsletter', $resJson->getViolations()[0]->getPath());

        // Direct mixed path
        $resMixed = $this->validator->validate('putPassengerProfile', (object) ['newsletter' => null]);
        $this->assertFalse($resMixed->isValid());
        $this->assertTrue($resMixed->hasViolationCode(CommandViolation::INVALID_TYPE));
        $this->assertSame('newsletter', $resMixed->getViolations()[0]->getPath());

        // 2. postPassengerRegister with phone: null (phone is non-nullable string)
        // JSON path
        $regJson = (string) json_encode([
            'email' => 'ahmad@example.com',
            'firstName' => 'Ahmad',
            'lastName' => 'Masri',
            'password' => 'SecurePass12345678',
            'phone' => null,
        ]);
        $resRegJson = $this->validator->validateJson('postPassengerRegister', $regJson);
        $this->assertFalse($resRegJson->isValid());
        $this->assertTrue($resRegJson->hasViolationCode(CommandViolation::INVALID_TYPE));
        $this->assertSame('phone', $resRegJson->getViolations()[0]->getPath());

        // Direct mixed path
        $resRegMixed = $this->validator->validate('postPassengerRegister', (object) [
            'email' => 'ahmad@example.com',
            'firstName' => 'Ahmad',
            'lastName' => 'Masri',
            'password' => 'SecurePass12345678',
            'phone' => null,
        ]);
        $this->assertFalse($resRegMixed->isValid());
        $this->assertTrue($resRegMixed->hasViolationCode(CommandViolation::INVALID_TYPE));
        $this->assertSame('phone', $resRegMixed->getViolations()[0]->getPath());
    }

    public function testRequiredNullablePropertyAcceptsPresentNullAndRejectsAbsent(): void
    {
        $schema = [
            'type' => 'object',
            'required' => ['notes'],
            'properties' => [
                'notes' => [
                    'type' => ['string', 'null'],
                ],
            ],
            'additionalProperties' => false,
        ];

        // Present with null value: passes because notes is present and allows null
        $vNull = $this->validator->evaluateSchema($schema, (object) ['notes' => null]);
        $this->assertEmpty($vNull, 'Expected present nullable property to be accepted');

        // Missing property: fails because notes is in required
        $vMissing = $this->validator->evaluateSchema($schema, new stdClass());
        $this->assertNotEmpty($vMissing, 'Expected missing required property to be rejected');
        $this->assertSame(CommandViolation::REQUIRED_FIELD_MISSING, $vMissing[0]->getCode());
        $this->assertSame('notes', $vMissing[0]->getPath());
    }

    public function testTopLevelBodyAbsentVsExplicitNullDistinction(): void
    {
        // Body-required operation: putPassengerProfile
        // Absent body via null rawJson
        $rAbsentNull = $this->validator->validateJson('putPassengerProfile', null);
        $this->assertFalse($rAbsentNull->isValid());
        $this->assertTrue($rAbsentNull->hasViolationCode(CommandViolation::BODY_REQUIRED));

        // Absent body via whitespace
        $rAbsentSpace = $this->validator->validateJson('putPassengerProfile', '   ');
        $this->assertFalse($rAbsentSpace->isValid());
        $this->assertTrue($rAbsentSpace->hasViolationCode(CommandViolation::BODY_REQUIRED));

        // Explicit JSON null: body is supplied, evaluates null against schema -> INVALID_TYPE
        $rExplicitNull = $this->validator->validateJson('putPassengerProfile', 'null');
        $this->assertFalse($rExplicitNull->isValid());
        $this->assertTrue($rExplicitNull->hasViolationCode(CommandViolation::INVALID_TYPE));

        // Direct mixed path: NO_BODY -> BODY_REQUIRED
        $rMixedNoBody = $this->validator->validate('putPassengerProfile', IdentityCommandValidator::NO_BODY);
        $this->assertFalse($rMixedNoBody->isValid());
        $this->assertTrue($rMixedNoBody->hasViolationCode(CommandViolation::BODY_REQUIRED));

        // Direct mixed path: explicit null -> INVALID_TYPE
        $rMixedNull = $this->validator->validate('putPassengerProfile', null);
        $this->assertFalse($rMixedNull->isValid());
        $this->assertTrue($rMixedNull->hasViolationCode(CommandViolation::INVALID_TYPE));

        // Bodyless operation: deleteSavedTraveler
        // Absent body -> valid
        $rBodylessAbsent = $this->validator->validateJson('deleteSavedTraveler', null, ['id' => 'trv_01']);
        $this->assertTrue($rBodylessAbsent->isValid());

        $rBodylessMixedNull = $this->validator->validate('deleteSavedTraveler', null, ['id' => 'trv_01']);
        $this->assertTrue($rBodylessMixedNull->isValid());

        // Body supplied to bodyless -> UNEXPECTED_BODY
        $rBodylessUnexpected = $this->validator->validateJson('deleteSavedTraveler', '{"extra":1}', ['id' => 'trv_01']);
        $this->assertFalse($rBodylessUnexpected->isValid());
        $this->assertTrue($rBodylessUnexpected->hasViolationCode(CommandViolation::UNEXPECTED_BODY));

        $rBodylessMixedUnexp = $this->validator->validate('deleteSavedTraveler', (object) ['extra' => 1], ['id' => 'trv_01']);
        $this->assertFalse($rBodylessMixedUnexp->isValid());
        $this->assertTrue($rBodylessMixedUnexp->hasViolationCode(CommandViolation::UNEXPECTED_BODY));
    }

    public function testOversizedWhitespaceOnBodylessOperationRejectsImmediately(): void
    {
        // 1 MiB + 1 byte of spaces sent to bodyless command: must return PAYLOAD_TOO_LARGE before trim
        $oversizedSpaces = str_repeat(' ', 1048577);
        $res = $this->validator->validateJson('deleteSavedTraveler', $oversizedSpaces, ['id' => 'trv_01']);
        $this->assertFalse($res->isValid());
        $this->assertTrue($res->hasViolationCode(CommandViolation::PAYLOAD_TOO_LARGE));
    }

    public function testComplexityBoundsRejectOversizedDecodedStrings(): void
    {
        // 1 MiB + 1 byte decoded string inside payload
        $oversizedStr = str_repeat('a', 1048577);
        $res = $this->validator->validate('putPassengerProfile', (object) ['firstName' => $oversizedStr]);
        $this->assertFalse($res->isValid());
        $this->assertTrue($res->hasViolationCode(CommandViolation::PAYLOAD_TOO_LARGE));
    }

    public function testComplexityBoundsRejectHugeFlatObjectsAndLists(): void
    {
        // Huge flat object (> 2000 properties)
        $hugeObj = new stdClass();
        for ($i = 0; $i < 2005; $i++) {
            $hugeObj->{"prop{$i}"} = 1;
        }
        $resObj = $this->validator->validate('putPassengerProfile', $hugeObj);
        $this->assertFalse($resObj->isValid());
        $this->assertTrue($resObj->hasViolationCode(CommandViolation::PAYLOAD_TOO_LARGE));

        // Huge list (> 2000 items)
        $hugeList = array_fill(0, 2005, 'val');
        $vList = $this->validator->evaluateSchema(['type' => 'array'], $hugeList);
        $this->assertNotEmpty($vList);
        $this->assertSame(CommandViolation::PAYLOAD_TOO_LARGE, $vList[0]->getCode());

        // Huge parameters (> 2000 keys)
        $hugeParams = [];
        for ($i = 0; $i < 2005; $i++) {
            $hugeParams["param{$i}"] = 'val';
        }
        $resParams = $this->validator->validate('deleteSavedTraveler', null, $hugeParams);
        $this->assertFalse($resParams->isValid());
        $this->assertTrue($resParams->hasViolationCode(CommandViolation::PAYLOAD_TOO_LARGE));
    }

    public function testComplexityBoundsRejectCyclicStdClass(): void
    {
        $cyclic = new stdClass();
        $cyclic->self = $cyclic;

        $resCyclic = $this->validator->validate('putPassengerProfile', $cyclic);
        $this->assertFalse($resCyclic->isValid());
        $this->assertTrue($resCyclic->hasViolationCode(CommandViolation::MAX_DEPTH_EXCEEDED));

        $vPublic = $this->validator->evaluateSchema(['type' => 'object'], $cyclic);
        $this->assertNotEmpty($vPublic);
        $this->assertSame(CommandViolation::MAX_DEPTH_EXCEEDED, $vPublic[0]->getCode());
    }

    public function testComplexityBoundsRejectNonJsonObjectTypes(): void
    {
        $dateTimeObj = new \DateTime();

        $resObj = $this->validator->validate('putPassengerProfile', $dateTimeObj);
        $this->assertFalse($resObj->isValid());
        $this->assertTrue($resObj->hasViolationCode(CommandViolation::INVALID_TYPE));

        $vObj = $this->validator->evaluateSchema(['type' => 'object'], $dateTimeObj);
        $this->assertNotEmpty($vObj);
        $this->assertSame(CommandViolation::INVALID_TYPE, $vObj[0]->getCode());
    }

    public function testAggregateByteBudgetIncludingObjectKeysAndValues(): void
    {
        // 1. Two strings each 600KB: each is < 1MB, but aggregate is 1.2MB > 1MB
        $aggregateStrings = [str_repeat('a', 600000), str_repeat('b', 600000)];
        $vAgg = $this->validator->evaluateSchema(true, $aggregateStrings);
        $this->assertNotEmpty($vAgg);
        $this->assertSame(CommandViolation::PAYLOAD_TOO_LARGE, $vAgg[0]->getCode());
        $this->assertSame('', $vAgg[0]->getPath());

        // Below-bound positive control: two strings each 300KB (total 600KB < 1MB)
        $belowBound = [str_repeat('a', 300000), str_repeat('b', 300000)];
        $this->assertEmpty($this->validator->evaluateSchema(true, $belowBound));

        // 2. Huge object key negative: key itself is > 1MB
        $hugeKey = str_repeat('k', 1200000);
        $hugeKeyObj = new stdClass();
        $hugeKeyObj->{$hugeKey} = 1;
        $vKey = $this->validator->evaluateSchema(true, $hugeKeyObj);
        $this->assertNotEmpty($vKey);
        $this->assertSame(CommandViolation::PAYLOAD_TOO_LARGE, $vKey[0]->getCode());

        // 3. Multi small strings totaling > 1MB
        $multiStrings = array_fill(0, 50, str_repeat('m', 25000)); // 50 * 25,000 = 1,250,000 bytes > 1MB
        $vMulti = $this->validator->evaluateSchema(true, $multiStrings);
        $this->assertNotEmpty($vMulti);
        $this->assertSame(CommandViolation::PAYLOAD_TOO_LARGE, $vMulti[0]->getCode());

        // 4. Direct validate(): payload 600KB + parameters 600KB -> total request > 1MB
        $payload600k = (object) ['firstName' => str_repeat('p', 600000)];
        $params600k = ['id' => str_repeat('x', 600000)];
        $resDirect = $this->validator->validate('deleteSavedTraveler', $payload600k, $params600k);
        $this->assertFalse($resDirect->isValid());
        $this->assertTrue($resDirect->hasViolationCode(CommandViolation::PAYLOAD_TOO_LARGE));

        // 5. validateJson(): raw JSON 800KB + parameters 300KB -> total request > 1MB
        $rawJson800k = json_encode(['firstName' => str_repeat('j', 800000)]);
        $params300k = ['id' => str_repeat('y', 300000)];
        $resJson = $this->validator->validateJson('deleteSavedTraveler', $rawJson800k, $params300k);
        $this->assertFalse($resJson->isValid());
        $this->assertTrue($resJson->hasViolationCode(CommandViolation::PAYLOAD_TOO_LARGE));
    }

    public function testJsonInstanceSafetyBeforeSchemaEvaluation(): void
    {
        // INF and NAN rejected under boolean true
        $vInf = $this->validator->evaluateSchema(true, INF);
        $this->assertNotEmpty($vInf);
        $this->assertSame(CommandViolation::INVALID_TYPE, $vInf[0]->getCode());

        $vNan = $this->validator->evaluateSchema(true, NAN);
        $this->assertNotEmpty($vNan);
        $this->assertSame(CommandViolation::INVALID_TYPE, $vNan[0]->getCode());

        // Resource rejected under boolean true
        $resHandle = fopen('php://memory', 'r');
        $this->assertIsResource($resHandle);
        try {
            $vRes = $this->validator->evaluateSchema(true, $resHandle);
            $this->assertNotEmpty($vRes);
            $this->assertSame(CommandViolation::INVALID_TYPE, $vRes[0]->getCode());
        } finally {
            fclose($resHandle);
        }

        // Nested non-finite rejected under boolean true
        $vNestedInf = $this->validator->evaluateSchema(true, [1, 2, INF]);
        $this->assertNotEmpty($vNestedInf);
        $this->assertSame(CommandViolation::INVALID_TYPE, $vNestedInf[0]->getCode());

        // Malformed UTF-8 rejected under boolean true
        $vUtf8 = $this->validator->evaluateSchema(true, "\xFF\xFF");
        $this->assertNotEmpty($vUtf8);
        $this->assertSame(CommandViolation::MALFORMED_UTF8, $vUtf8[0]->getCode());

        // Same instance safety applies under empty schema map {}
        $vEmptyInf = $this->validator->evaluateSchema([], INF);
        $this->assertNotEmpty($vEmptyInf);
        $this->assertSame(CommandViolation::INVALID_TYPE, $vEmptyInf[0]->getCode());
    }

    public function testWorkBudgetExhaustionIsGlobalTerminalFailureCannotBeSwallowed(): void
    {
        // Exact probe from Finding 3: budget exhaustion in 'not' subschema cannot authorize success!
        $exhaustingNotSchema = [
            'allOf' => array_fill(0, 1999, true),
            'not' => true,
        ];
        $vProbe = $this->validator->evaluateSchema($exhaustingNotSchema, 1);
        $this->assertNotEmpty($vProbe, 'Budget exhaustion in not child must fail closed as terminal violation');
        $this->assertSame(CommandViolation::MAX_DEPTH_EXCEEDED, $vProbe[0]->getCode());

        // Wrapped in anyOf: child budget exhaustion cannot be swallowed by anyOf
        $wrappedAnyOf = [
            'anyOf' => [
                $exhaustingNotSchema,
                true, // Second branch is true, but budget exhaustion must abort immediately!
            ],
        ];
        $vAnyOf = $this->validator->evaluateSchema($wrappedAnyOf, 1);
        $this->assertNotEmpty($vAnyOf, 'Budget exhaustion cannot be swallowed by anyOf');
        $this->assertSame(CommandViolation::MAX_DEPTH_EXCEEDED, $vAnyOf[0]->getCode());

        // Wrapped in oneOf: child budget exhaustion cannot be swallowed by oneOf
        $wrappedOneOf = [
            'oneOf' => [
                $exhaustingNotSchema,
                true,
            ],
        ];
        $vOneOf = $this->validator->evaluateSchema($wrappedOneOf, 1);
        $this->assertNotEmpty($vOneOf, 'Budget exhaustion cannot be swallowed by oneOf');
        $this->assertSame(CommandViolation::MAX_DEPTH_EXCEEDED, $vOneOf[0]->getCode());

        // Positive under-budget NOT control: not: false passes for any instance
        $this->assertEmpty($this->validator->evaluateSchema(['not' => false], 1));

        // Negative under-budget NOT control: not: true fails for any instance
        $vNotTrue = $this->validator->evaluateSchema(['not' => true], 1);
        $this->assertNotEmpty($vNotTrue);
        $this->assertSame(CommandViolation::NOT_FAILED, $vNotTrue[0]->getCode());
    }

    public function testPreflightDiagnosticsDoNotEchoArbitrarySentinels(): void
    {
        $sentinel = 'SENTINEL_DISALLOWED_KEY_' . uniqid();
        try {
            IdentitySchemaPreflight::preflight([$sentinel => 'val']);
            $this->fail('Expected preflight to fail');
        } catch (InvalidCommandSchemaException $e) {
            $this->assertStringNotContainsString($sentinel, $e->getMessage());
            $this->assertSame('Unsupported schema assertion keyword (fail-closed policy)', $e->getMessage());
        }

        $typeSentinel = 'SENTINEL_TYPE_' . uniqid();
        try {
            IdentitySchemaPreflight::preflight(['type' => $typeSentinel]);
            $this->fail('Expected preflight to fail');
        } catch (InvalidCommandSchemaException $e) {
            $this->assertStringNotContainsString($typeSentinel, $e->getMessage());
            $this->assertSame('Unsupported schema type', $e->getMessage());
        }
    }
}
