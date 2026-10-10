<?php

declare(strict_types=1);

namespace Tests\Unit\IdentityCommands;

use App\Identity\Contracts\IdentityCommandValidator;
use PHPUnit\Framework\Attributes\DataProviderExternal;
use PHPUnit\Framework\TestCase;
use Tests\Fixtures\IdentityCommands\IdentityCommandFixtureCatalog;

final class IdentityCommandValidatorSpecimensTest extends TestCase
{
    private IdentityCommandValidator $validator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->validator = new IdentityCommandValidator();
    }

    /**
     * @param array{
     *     id: string,
     *     family: string,
     *     operationId: string,
     *     method: string,
     *     path: string,
     *     expectedValid: bool,
     *     expectedCode: string|null,
     *     payload: mixed,
     *     parameters: array<string, mixed>,
     *     rawJson: string|null
     * } $specimen
     */
    #[DataProviderExternal(IdentityCommandFixtureCatalog::class, 'provideSpecimens')]
    public function testEvaluatesSpecimenCorrectly(array $specimen): void
    {
        if ($specimen['rawJson'] !== null) {
            $result = $this->validator->validateJson(
                $specimen['operationId'],
                $specimen['rawJson'],
                $specimen['parameters']
            );
        } else {
            $result = $this->validator->validate(
                $specimen['operationId'],
                $specimen['payload'],
                $specimen['parameters']
            );
        }

        $this->assertSame(
            $specimen['expectedValid'],
            $result->isValid(),
            sprintf(
                "Specimen '%s' for operation '%s' expected validity %s, got %s. Violations: %s",
                $specimen['id'],
                $specimen['operationId'],
                $specimen['expectedValid'] ? 'true' : 'false',
                $result->isValid() ? 'true' : 'false',
                (string) $result
            )
        );

        if ($specimen['expectedCode'] !== null) {
            $this->assertTrue(
                $result->hasViolationCode($specimen['expectedCode']),
                sprintf(
                    "Specimen '%s' expected code '%s', got codes: [%s]",
                    $specimen['id'],
                    $specimen['expectedCode'],
                    implode(', ', $result->getViolationCodes())
                )
            );
        }

        // Safe error serialization test: verify serialization does not throw
        $serializedString = (string) $result;
        $jsonEncoded = json_encode($result);
        $this->assertIsString($serializedString);
        $this->assertIsString($jsonEncoded);

        // Security check: never echo sensitive password strings or email values in violation serialization
        if (!$result->isValid() && is_object($specimen['payload'])) {
            $vars = get_object_vars($specimen['payload']);
            if (isset($vars['password']) && is_string($vars['password']) && strlen($vars['password']) > 5) {
                $this->assertStringNotContainsString(
                    $vars['password'],
                    $serializedString,
                    "Password value leaked in violation __toString() for {$specimen['id']}"
                );
            }
            if (isset($vars['email']) && is_string($vars['email']) && strlen($vars['email']) > 5) {
                $this->assertStringNotContainsString(
                    $vars['email'],
                    $serializedString,
                    "Email value leaked in violation __toString() for {$specimen['id']}"
                );
            }
        }
    }
}
