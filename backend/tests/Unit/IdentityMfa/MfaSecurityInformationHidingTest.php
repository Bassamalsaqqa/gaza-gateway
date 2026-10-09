<?php

declare(strict_types=1);

namespace Tests\Unit\IdentityMfa;

use App\Identity\Mfa\Base32Codec;
use App\Identity\Mfa\RecoveryCode;
use App\Identity\Mfa\RecoveryCodeBatch;
use App\Identity\Mfa\TotpSecret;
use App\Identity\Mfa\TotpService;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use ReflectionMethod;
use ReflectionParameter;
use SensitiveParameter;

/**
 * Security-focused tests verifying information hiding boundaries, reflection opacity,
 * parameter protection with SensitiveParameter, and absence of credential leakage in dumps/exceptions.
 */
class MfaSecurityInformationHidingTest extends TestCase
{
    /**
     * Verify that all sensitive arguments across all MFA primitives are explicitly
     * attributed with #[\SensitiveParameter] per PHP 8.2+ security standards.
     */
    public function test_sensitive_parameters_are_attributed(): void
    {
        $checks = [
            [Base32Codec::class, 'encode', 'bytes'],
            [Base32Codec::class, 'decode', 'base32'],
            [TotpSecret::class, 'fromBase32', 'base32'],
            [TotpService::class, 'hotp', 'secret'],
            [TotpService::class, 'totp', 'secret'],
            [TotpService::class, 'match', 'secret'],
            [TotpService::class, 'match', 'code'],
            [RecoveryCode::class, 'fromPlaintext', 'plaintext'],
            [RecoveryCode::class, 'canonicalize', 'code'],
            [RecoveryCode::class, 'digest', 'code'],
            [RecoveryCode::class, 'verifyDigest', 'suppliedCode'],
        ];

        foreach ($checks as [$className, $methodName, $paramName]) {
            $refMethod = new ReflectionMethod($className, $methodName);
            $found = false;

            foreach ($refMethod->getParameters() as $parameter) {
                if ($parameter->getName() === $paramName) {
                    $found = true;
                    $attributes = $parameter->getAttributes(SensitiveParameter::class);
                    $this->assertNotEmpty(
                        $attributes,
                        "Expected parameter {$paramName} on {$className}::{$methodName} to have #[SensitiveParameter] attribute."
                    );
                }
            }

            $this->assertTrue($found, "Parameter {$paramName} not found on {$className}::{$methodName}");
        }
    }

    /**
     * Verify that classes holding secrets have ZERO public properties.
     */
    public function test_classes_have_no_public_properties(): void
    {
        $classes = [
            TotpSecret::class,
            RecoveryCode::class,
            RecoveryCodeBatch::class,
            TotpService::class,
            Base32Codec::class,
        ];

        foreach ($classes as $className) {
            $refClass = new ReflectionClass($className);
            $publicProperties = $refClass->getProperties(\ReflectionProperty::IS_PUBLIC);
            $this->assertEmpty(
                $publicProperties,
                "Class {$className} must not have public properties to preserve information hiding."
            );
        }
    }

    /**
     * Verify that generic var_export does not expose credentials or digests through closure encapsulation.
     */
    public function test_var_export_opacity_across_all_primitives(): void
    {
        $secret = TotpSecret::generate();
        $code = RecoveryCode::generate();
        $batch = RecoveryCodeBatch::generate();

        $secretPlaintext = $secret->revealBase32Secret();
        $binarySecret = $secret->getBinarySecret();
        $codePlaintext = $code->revealPlaintextForEnrollmentOnly();
        $codeDigest = $code->getDigest();
        $batchPlaintexts = $batch->revealPlaintextCodesForEnrollmentOnly();
        $batchDigests = $batch->getDigests();

        $exportedSecret = var_export($secret, true);
        $exportedCode = var_export($code, true);
        $exportedBatch = var_export($batch, true);

        // Secrets and raw binary
        $this->assertStringNotContainsString($secretPlaintext, $exportedSecret);
        $this->assertStringNotContainsString($binarySecret, $exportedSecret);

        // Recovery code plaintext and digest
        $this->assertStringNotContainsString($codePlaintext, $exportedCode);
        $this->assertStringNotContainsString($codeDigest, $exportedCode);

        // Batch plaintexts and digests
        foreach ($batchPlaintexts as $bp) {
            $this->assertStringNotContainsString($bp, $exportedBatch);
        }
        foreach ($batchDigests as $bd) {
            $this->assertStringNotContainsString($bd, $exportedBatch);
        }
    }
}
