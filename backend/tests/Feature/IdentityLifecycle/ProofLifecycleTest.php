<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityLifecycle;

use App\Identity\Proofs\ProofConsumptionOutcome;
use App\Identity\Proofs\ProofPurpose;
use App\Identity\Proofs\ProofService;
use App\Identity\Tokens\OpaqueToken;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Fixtures\IdentityLifecycle\LifecycleTestFactory;
use Tests\TestCase;

class ProofLifecycleTest extends TestCase
{
    private ProofService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new ProofService(DB::connection());
    }

    public function test_proof_issue_across_all_four_tables(): void
    {
        $passengerEmail = 'passenger_' . Str::random(8) . '@example.com';
        $staffEmail = 'staff_' . Str::random(8) . '@example.com';
        $passengerId = LifecycleTestFactory::createUser(['email' => $passengerEmail]);
        $staffId = LifecycleTestFactory::createStaffUser(['email' => $staffEmail]);

        $targets = [
            ['purpose' => ProofPurpose::PassengerEmailVerification, 'principal' => $passengerId, 'email' => $passengerEmail],
            ['purpose' => ProofPurpose::PassengerPasswordReset, 'principal' => $passengerId, 'email' => $passengerEmail],
            ['purpose' => ProofPurpose::StaffInvitation, 'principal' => $staffId, 'email' => $staffEmail],
            ['purpose' => ProofPurpose::StaffPasswordReset, 'principal' => $staffId, 'email' => $staffEmail],
        ];

        foreach ($targets as $t) {
            /** @var ProofPurpose $purpose */
            $purpose = $t['purpose'];
            $principalId = $t['principal'];
            $expectedEmail = $t['email'];

            $receipt = $this->service->issue($purpose, $principalId);

            $this->assertSame($purpose, $receipt->purpose);
            $this->assertSame($principalId, $receipt->principalId);
            $this->assertSame($expectedEmail, $receipt->getEmailSnapshot());
            $this->assertSame(1, $receipt->credentialEpoch);

            // Verify database row
            $row = DB::table($purpose->table())->where('id', $receipt->proofId)->first();
            $this->assertNotNull($row);
            $this->assertSame('issued', $row->state);
            $this->assertNull($row->consumed_at);
            $this->assertNull($row->revoked_at);
            $this->assertSame($receipt->getTokenDigest(), $row->token_digest);
            $this->assertSame($expectedEmail, $row->email_snapshot);
            $this->assertSame(1, (int) $row->credential_epoch);
            $this->assertSame($purpose->value, $row->purpose);

            // Raw secret is not in database
            $rawSecret = $receipt->getRawToken();
            $this->assertStringNotContainsString($rawSecret, json_encode($row));
            $this->assertSame(hash('sha256', $rawSecret), $row->token_digest);
        }
    }

    public function test_proof_reissue_invalidates_prior_proofs_under_principal_lock(): void
    {
        $userId = LifecycleTestFactory::createUser();

        // Issue initial verification proof
        $receipt1 = $this->service->issue(ProofPurpose::PassengerEmailVerification, $userId);

        // Reissue verification proof
        $receipt2 = $this->service->reissue(ProofPurpose::PassengerEmailVerification, $userId);

        $this->assertNotSame($receipt1->proofId, $receipt2->proofId);
        $this->assertNotSame($receipt1->getTokenDigest(), $receipt2->getTokenDigest());

        // Prior proof row must be revoked
        $row1 = DB::table('user_email_verifications')->where('id', $receipt1->proofId)->first();
        $this->assertSame('revoked', $row1->state);
        $this->assertNotNull($row1->revoked_at);

        // New proof row must be issued
        $row2 = DB::table('user_email_verifications')->where('id', $receipt2->proofId)->first();
        $this->assertSame('issued', $row2->state);
        $this->assertNull($row2->revoked_at);

        // Consuming revoked proof 1 must fail with Revoked
        $result1 = $this->service->consume(ProofPurpose::PassengerEmailVerification, $receipt1->getRawToken());
        $this->assertSame(ProofConsumptionOutcome::Revoked, $result1->outcome);

        // Consuming active proof 2 must succeed
        $result2 = $this->service->consume(ProofPurpose::PassengerEmailVerification, $receipt2->getRawToken());
        $this->assertSame(ProofConsumptionOutcome::Success, $result2->outcome);
    }

    public function test_proof_expiry_exact_equality_denies(): void
    {
        $userId = LifecycleTestFactory::createUser();
        $receipt = $this->service->issue(ProofPurpose::PassengerEmailVerification, $userId);

        // Manually update issued_at and expires_at to the past while respecting expires_at > issued_at
        DB::table('user_email_verifications')
            ->where('id', $receipt->proofId)
            ->update([
                'issued_at' => CarbonImmutable::now('UTC')->subHours(48)->toIso8601String(),
                'expires_at' => CarbonImmutable::now('UTC')->subHours(24)->toIso8601String(),
            ]);

        $result = $this->service->consume(ProofPurpose::PassengerEmailVerification, $receipt->getRawToken());

        $this->assertSame(ProofConsumptionOutcome::Expired, $result->outcome);

        $row = DB::table('user_email_verifications')->where('id', $receipt->proofId)->first();
        $this->assertSame('expired', $row->state);
    }

    public function test_proof_epoch_mismatch_denies_and_revokes(): void
    {
        $userId = LifecycleTestFactory::createUser(['credential_epoch' => 1]);
        $receipt = $this->service->issue(ProofPurpose::PassengerPasswordReset, $userId);

        // User password is changed elsewhere -> credential_epoch incremented to 2
        DB::table('users')->where('id', $userId)->update(['credential_epoch' => 2]);

        $result = $this->service->consume(ProofPurpose::PassengerPasswordReset, $receipt->getRawToken());

        $this->assertSame(ProofConsumptionOutcome::EpochMismatch, $result->outcome);

        $row = DB::table('user_password_resets')->where('id', $receipt->proofId)->first();
        $this->assertSame('revoked', $row->state);
        $this->assertNotNull($row->revoked_at);
    }

    public function test_proof_email_mismatch_denies_and_revokes(): void
    {
        $oldEmail = 'old_email_' . Str::random(8) . '@example.com';
        $newEmail = 'new_email_' . Str::random(8) . '@example.com';
        $userId = LifecycleTestFactory::createUser(['email' => $oldEmail]);
        $receipt = $this->service->issue(ProofPurpose::PassengerEmailVerification, $userId);

        // User email changed elsewhere
        DB::table('users')->where('id', $userId)->update(['email' => $newEmail]);

        $result = $this->service->consume(ProofPurpose::PassengerEmailVerification, $receipt->getRawToken());

        $this->assertSame(ProofConsumptionOutcome::EmailMismatch, $result->outcome);

        $row = DB::table('user_email_verifications')->where('id', $receipt->proofId)->first();
        $this->assertSame('revoked', $row->state);
        $this->assertNotNull($row->revoked_at);
    }

    public function test_purpose_mismatch_denies(): void
    {
        $userId = LifecycleTestFactory::createUser();
        $receipt = $this->service->issue(ProofPurpose::PassengerPasswordReset, $userId);

        // Attempt to consume password reset token using passenger_email_verification purpose
        $result = $this->service->consume(ProofPurpose::PassengerEmailVerification, $receipt->getRawToken());

        $this->assertSame(ProofConsumptionOutcome::NotFound, $result->outcome);
    }

    public function test_raw_vs_digest_denial(): void
    {
        $userId = LifecycleTestFactory::createUser();
        $receipt = $this->service->issue(ProofPurpose::PassengerEmailVerification, $userId);

        // Providing 64-char hex digest instead of canonical 43-char raw bearer must fail immediately
        $result = $this->service->consume(ProofPurpose::PassengerEmailVerification, $receipt->getTokenDigest());

        $this->assertSame(ProofConsumptionOutcome::InvalidFormat, $result->outcome);
    }

    public function test_single_use_consumption_prevents_replay(): void
    {
        $userId = LifecycleTestFactory::createUser();
        $receipt = $this->service->issue(ProofPurpose::PassengerEmailVerification, $userId);

        // First consumption succeeds
        $result1 = $this->service->consume(ProofPurpose::PassengerEmailVerification, $receipt->getRawToken());
        $this->assertSame(ProofConsumptionOutcome::Success, $result1->outcome);

        // Second consumption fails with AlreadyConsumed
        $result2 = $this->service->consume(ProofPurpose::PassengerEmailVerification, $receipt->getRawToken());
        $this->assertSame(ProofConsumptionOutcome::AlreadyConsumed, $result2->outcome);
    }

    public function test_rollback_preservation_does_not_leak_receipt(): void
    {
        $userId = LifecycleTestFactory::createUser();
        $receipt = $this->service->issue(ProofPurpose::PassengerEmailVerification, $userId);

        DB::beginTransaction();
        $result = $this->service->consume(ProofPurpose::PassengerEmailVerification, $receipt->getRawToken());
        $this->assertSame(ProofConsumptionOutcome::Success, $result->outcome);
        DB::rollBack();

        // Row in DB must remain issued and unconsumed
        $row = DB::table('user_email_verifications')->where('id', $receipt->proofId)->first();
        $this->assertSame('issued', $row->state);
        $this->assertNull($row->consumed_at);

        // Proof can still be consumed successfully in subsequent transaction
        $resultRetry = $this->service->consume(ProofPurpose::PassengerEmailVerification, $receipt->getRawToken());
        $this->assertSame(ProofConsumptionOutcome::Success, $resultRetry->outcome);
    }
}
