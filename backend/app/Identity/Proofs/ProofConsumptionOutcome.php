<?php

declare(strict_types=1);

namespace App\Identity\Proofs;

/**
 * Closed enumeration of proof consumption outcomes.
 */
enum ProofConsumptionOutcome: string
{
    case Success = 'success';
    case InvalidFormat = 'invalid_format';
    case NotFound = 'not_found';
    case AlreadyConsumed = 'already_consumed';
    case Revoked = 'revoked';
    case Expired = 'expired';
    case Exhausted = 'exhausted';
    case PrincipalNotFound = 'principal_not_found';
    case PrincipalSuspended = 'principal_suspended';
    case EpochMismatch = 'epoch_mismatch';
    case EmailMismatch = 'email_mismatch';
    case PurposeMismatch = 'purpose_mismatch';

    public function isSuccess(): bool
    {
        return $this === self::Success;
    }

    public function description(): string
    {
        return match ($this) {
            self::Success => 'Verification successful.',
            self::InvalidFormat => 'Invalid proof token format.',
            self::NotFound => 'Proof token record not found.',
            self::AlreadyConsumed => 'Proof token has already been consumed.',
            self::Revoked => 'Proof token has been revoked.',
            self::Expired => 'Proof token has expired.',
            self::Exhausted => 'Proof token attempts exhausted.',
            self::PrincipalNotFound => 'Associated principal account was not found.',
            self::PrincipalSuspended => 'Associated principal account is suspended.',
            self::EpochMismatch => 'Credential epoch mismatch.',
            self::EmailMismatch => 'Email address mismatch.',
            self::PurposeMismatch => 'Proof purpose does not match requested verification purpose.',
        };
    }
}
