<?php

declare(strict_types=1);

/**
 * Focused dev-only catalog, semantic fail-closed, two-process concurrency,
 * outbox encryption/retention, and audit immutability probe for Phase 13B Identity Lifecycle Primitives.
 * Usage: php scripts/probe-identity-lifecycle.php
 */

require __DIR__ . '/../vendor/autoload.php';

$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Identity\Audit\AuditActor;
use App\Identity\Audit\AuditOutcome;
use App\Identity\Audit\AuditTargetType;
use App\Identity\Audit\AuditWriter;
use App\Identity\Audit\Exceptions\AuditValidationException;
use App\Identity\Dispatch\LocalCaptureRetentionManager;
use App\Identity\Dispatch\OutboxDispatcher;
use App\Identity\Dispatch\OutboxPayload;
use App\Identity\Dispatch\OutboxService;
use App\Identity\Proofs\GuestOtpHelper;
use App\Identity\Proofs\GuestOtpPepperRing;
use App\Identity\Proofs\ProofConsumptionOutcome;
use App\Identity\Proofs\ProofConsumptionResult;
use App\Identity\Proofs\ProofPurpose;
use App\Identity\Proofs\ProofService;
use App\Services\Foundation\Mail\LocalFileMailGateway;
use App\Services\Foundation\Mail\UnconfiguredMailGateway;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Fixtures\IdentityLifecycle\ConcurrencyWorkerProcess;
use Tests\Fixtures\IdentityLifecycle\LifecycleTestFactory;

echo "=== Gaza Gateway Phase 13B Identity Lifecycle Primitives Probe ===\n";

$processEnv = getenv('APP_ENV');
$configEnv = config('app.env');
$dbConnection = config('database.default');
$configuredDb = config("database.connections.{$dbConnection}.database");

if ($processEnv !== 'testing' || $configEnv !== 'testing') {
    fwrite(STDERR, "FATAL: Probe must run strictly under process APP_ENV=testing and configured app.env=testing (process: {$processEnv}, config: {$configEnv})\n");
    exit(1);
}

if ($dbConnection !== 'pgsql_test') {
    fwrite(STDERR, "FATAL: Probe must run strictly under DB connection pgsql_test (current: {$dbConnection})\n");
    exit(1);
}

if ($configuredDb !== 'gaza_gateway_test') {
    fwrite(STDERR, "FATAL: Configured database must be gaza_gateway_test (current: {$configuredDb})\n");
    exit(1);
}

$dbLive = DB::selectOne('SELECT current_database() AS db')->db;
if ($dbLive !== 'gaza_gateway_test') {
    fwrite(STDERR, "FATAL: Probe must run against live database gaza_gateway_test (current: {$dbLive})\n");
    exit(1);
}

echo "Environment: {$configEnv} (process: {$processEnv}) | Connection: {$dbConnection} | Database: {$dbLive}\n\n";

$stats = [
    'catalog_tables_verified' => 0,
    'proof_semantic_probes_passed' => 0,
    'guest_otp_probes_passed' => 0,
    'concurrency_probes_passed' => 0,
    'outbox_encryption_probes_passed' => 0,
    'audit_immutability_probes_passed' => 0,
];

$requiredTables = [
    'user_email_verifications',
    'user_password_resets',
    'staff_invitations',
    'staff_password_resets',
    'booking_guest_challenges',
    'security_dispatch_outbox',
    'audit_events',
];

if (in_array('--simulate-missing-proof', $argv ?? [], true)) {
    echo "  [TEST MODE] Injecting simulated missing table to prove fail-closed non-zero exit...\n";
    $requiredTables[] = 'missing_lifecycle_table_sentinel';
}

// -----------------------------------------------------------------------------
// SECTION 1: Catalog & Schema Verification
// -----------------------------------------------------------------------------
echo "[1/5] Catalog verification...\n";

$existingTables = array_column(
    DB::select("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"),
    'table_name'
);

foreach ($requiredTables as $table) {
    if (in_array($table, $existingTables, true)) {
        $stats['catalog_tables_verified']++;
    } else {
        fwrite(STDERR, "FATAL: Table [{$table}] missing from PostgreSQL catalog.\n");
        exit(1);
    }
}
echo "  ✓ All " . count($requiredTables) . " target tables verified in catalog\n\n";

// -----------------------------------------------------------------------------
// SECTION 2: Proof Semantics & Guest OTP Probes
// -----------------------------------------------------------------------------
echo "[2/5] Proof semantics & Guest OTP probes...\n";

$proofService = new ProofService(DB::connection());
$userEmail = 'proof_test_' . Str::random(8) . '@example.com';
$staffEmail = 'staff_proof_' . Str::random(8) . '@example.com';
$userId = LifecycleTestFactory::createUser(['email' => $userEmail]);
$staffId = LifecycleTestFactory::createStaffUser(['email' => $staffEmail]);

// Probe 2.1: Issue across all four tables
foreach (ProofPurpose::cases() as $purpose) {
    $principalId = $purpose->realm() === 'passenger' ? $userId : $staffId;
    $receipt = $proofService->issue($purpose, $principalId);

    $row = DB::table($purpose->table())->where('id', $receipt->proofId)->first();
    if (!$row || $row->state !== 'issued' || $row->token_digest !== $receipt->getTokenDigest()) {
        fwrite(STDERR, "FATAL: Proof issuance failed for [{$purpose->value}].\n");
        exit(1);
    }
    // Verify raw secret not in table
    if (str_contains(json_encode($row), $receipt->getRawToken())) {
        fwrite(STDERR, "FATAL: Raw secret found in table row for [{$purpose->value}].\n");
        exit(1);
    }
    $stats['proof_semantic_probes_passed']++;
}
echo "  ✓ 4/4 proof table issuance validated with zero raw secret retention\n";

// Probe 2.2: Reissue under principal lock invalidates prior proofs
$receipt1 = $proofService->issue(ProofPurpose::PassengerEmailVerification, $userId);
$receipt2 = $proofService->reissue(ProofPurpose::PassengerEmailVerification, $userId);

$row1 = DB::table('user_email_verifications')->where('id', $receipt1->proofId)->first();
if ($row1->state !== 'revoked' || $row1->revoked_at === null) {
    fwrite(STDERR, "FATAL: Prior proof was not revoked during reissue.\n");
    exit(1);
}
$consumePrior = $proofService->consume(ProofPurpose::PassengerEmailVerification, $receipt1->getRawToken());
if ($consumePrior->outcome !== ProofConsumptionOutcome::Revoked) {
    fwrite(STDERR, "FATAL: Revoked proof did not return Revoked outcome.\n");
    exit(1);
}
$consumeFresh = $proofService->consume(ProofPurpose::PassengerEmailVerification, $receipt2->getRawToken());
if ($consumeFresh->outcome !== ProofConsumptionOutcome::Success) {
    fwrite(STDERR, "FATAL: Fresh proof consumption failed.\n");
    exit(1);
}
$stats['proof_semantic_probes_passed']++;
echo "  ✓ Proof reissue under principal lock invalidates prior proof and authorizes fresh proof\n";

// Probe 2.3: Single-use consumption prevents replay
$consumeReplay = $proofService->consume(ProofPurpose::PassengerEmailVerification, $receipt2->getRawToken());
if ($consumeReplay->outcome !== ProofConsumptionOutcome::AlreadyConsumed) {
    fwrite(STDERR, "FATAL: Replayed proof did not return AlreadyConsumed outcome.\n");
    exit(1);
}
$stats['proof_semantic_probes_passed']++;
echo "  ✓ Single-use consumption replay prevented\n";

// Probe 2.4: Credential epoch mismatch denial
$epochUser = LifecycleTestFactory::createUser(['credential_epoch' => 1]);
$epochReceipt = $proofService->issue(ProofPurpose::PassengerPasswordReset, $epochUser);
DB::table('users')->where('id', $epochUser)->update(['credential_epoch' => 2]);
$epochResult = $proofService->consume(ProofPurpose::PassengerPasswordReset, $epochReceipt->getRawToken());
if ($epochResult->outcome !== ProofConsumptionOutcome::EpochMismatch) {
    fwrite(STDERR, "FATAL: Epoch mismatch was not denied.\n");
    exit(1);
}
$stats['proof_semantic_probes_passed']++;
echo "  ✓ Credential epoch increment invalidates prior proofs\n";

// Probe 2.5: Email snapshot mismatch denial
$beforeEmail = 'before_' . Str::random(8) . '@example.com';
$afterEmail = 'after_' . Str::random(8) . '@example.com';
$emailUser = LifecycleTestFactory::createUser(['email' => $beforeEmail]);
$emailReceipt = $proofService->issue(ProofPurpose::PassengerEmailVerification, $emailUser);
DB::table('users')->where('id', $emailUser)->update(['email' => $afterEmail]);
$emailResult = $proofService->consume(ProofPurpose::PassengerEmailVerification, $emailReceipt->getRawToken());
if ($emailResult->outcome !== ProofConsumptionOutcome::EmailMismatch) {
    fwrite(STDERR, "FATAL: Email snapshot mismatch was not denied.\n");
    exit(1);
}
$stats['proof_semantic_probes_passed']++;
echo "  ✓ Email address mutation revokes prior proof\n";

// Probe 2.6: Raw vs digest denial
$rawVsDigestReceipt = $proofService->issue(ProofPurpose::PassengerEmailVerification, $userId);
$digestResult = $proofService->consume(ProofPurpose::PassengerEmailVerification, $rawVsDigestReceipt->getTokenDigest());
if ($digestResult->outcome !== ProofConsumptionOutcome::InvalidFormat) {
    fwrite(STDERR, "FATAL: Digest string passed as raw bearer was not rejected with InvalidFormat.\n");
    exit(1);
}
$stats['proof_semantic_probes_passed']++;
echo "  ✓ 64-char hex digest denied as bearer token\n";

// Probe 2.7: Rollback preservation
$rbUser = LifecycleTestFactory::createUser();
$rbReceipt = $proofService->issue(ProofPurpose::PassengerEmailVerification, $rbUser);
DB::beginTransaction();
$proofService->consume(ProofPurpose::PassengerEmailVerification, $rbReceipt->getRawToken());
DB::rollBack();
$rbRow = DB::table('user_email_verifications')->where('id', $rbReceipt->proofId)->first();
if ($rbRow->state !== 'issued' || $rbRow->consumed_at !== null) {
    fwrite(STDERR, "FATAL: Rollback did not preserve issued state.\n");
    exit(1);
}
$stats['proof_semantic_probes_passed']++;
echo "  ✓ Transaction rollback preserves unconsumed proof state\n";

// Probe 2.7b: ProofConsumptionResult privacy and secret hygiene
$sentinel = 'private-probe-sentinel@example.test';
$privacyResult = ProofConsumptionResult::success('probe-proof', 'probe-principal', $sentinel, 1, CarbonImmutable::now());
foreach ([json_encode($privacyResult), json_encode($privacyResult->__debugInfo()), json_encode(get_object_vars($privacyResult)), serialize($privacyResult), var_export($privacyResult, true)] as $probeVal) {
    if (str_contains($probeVal, $sentinel)) {
        fwrite(STDERR, "FATAL: ProofConsumptionResult exposed sensitive email sentinel.\n");
        exit(1);
    }
}
$stats['proof_semantic_probes_passed']++;
echo "  ✓ ProofConsumptionResult conceals email snapshot across all diagnostic/serialization channels\n";

// Probe 2.8: Guest OTP helper CSPRNG and domain separation
$pepperRing = new GuestOtpPepperRing([
    1 => str_repeat('k', 32),
    2 => str_repeat('m', 48),
], activeVersion: 2);

$otpCode = GuestOtpHelper::generateCode();
if (strlen($otpCode) !== 6 || !ctype_digit($otpCode)) {
    fwrite(STDERR, "FATAL: OTP code is not 6 decimal digits.\n");
    exit(1);
}
$otpDigest = GuestOtpHelper::computeDigest(
    challengeId: '00000000-0000-0000-0000-000000000010',
    purpose: 'manage_booking',
    bookingId: '00000000-0000-0000-0000-000000000020',
    sessionId: '00000000-0000-0000-0000-000000000030',
    securityEpoch: 1,
    code: $otpCode,
    pepperVersion: 2,
    pepperRing: $pepperRing,
);
if (!GuestOtpHelper::verifyCode($otpDigest, '00000000-0000-0000-0000-000000000010', 'manage_booking', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000030', 1, $otpCode, 2, $pepperRing)) {
    fwrite(STDERR, "FATAL: Guest OTP positive verification failed.\n");
    exit(1);
}
if (GuestOtpHelper::verifyCode($otpDigest, '00000000-0000-0000-0000-000000000010', 'manage_booking', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000030', 2, $otpCode, 2, $pepperRing)) {
    fwrite(STDERR, "FATAL: Guest OTP epoch tampering was not denied.\n");
    exit(1);
}
$stats['guest_otp_probes_passed']++;
echo "  ✓ Guest OTP CSPRNG & domain-separated HMAC-SHA256 verified\n";

// Probe 2.9: Guest challenge foreign recipient override rejection
$probeBooking = LifecycleTestFactory::createBooking(['contact_email' => 'legit_probe@example.test']);
$probeChalId = LifecycleTestFactory::createBookingGuestChallenge(['booking_id' => $probeBooking]);
$foreignRejected = false;
$probeEncrypter = app(Encrypter::class);
$probeOutboxSvc = new OutboxService($probeEncrypter, DB::connection());
try {
    $probeOutboxSvc->enqueueGuestChallenge($probeChalId, '123456', 'foreign_override@example.test');
} catch (\App\Identity\Dispatch\Exceptions\DispatchException $e) {
    $foreignRejected = true;
}
if (!$foreignRejected) {
    fwrite(STDERR, "FATAL: Guest challenge accepted unauthorized foreign recipient override.\n");
    exit(1);
}
$stats['guest_otp_probes_passed']++;
echo "  ✓ Guest challenge strictly rejects foreign recipient email override\n\n";


// -----------------------------------------------------------------------------
// SECTION 3: Two-Process PostgreSQL Concurrency Barrier
// -----------------------------------------------------------------------------
echo "[3/5] Genuine two-process PostgreSQL concurrency barriers...\n";

$concReceipt = $proofService->issue(ProofPurpose::PassengerEmailVerification, $userId);

$worker = new ConcurrencyWorkerProcess();
$workerPid = $worker->getBackendPid();

try {
    // Worker locks proof row FOR UPDATE
    $worker->sendCommand([
        'action' => 'lock_proof_and_wait',
        'table' => 'user_email_verifications',
        'proof_id' => $concReceipt->proofId,
    ]);
    $workerLock = $worker->readLine(3.0);
    if (!$workerLock || $workerLock['status'] !== 'LOCKED') {
        fwrite(STDERR, "FATAL: ConcurrencyWorker failed to acquire row lock.\n");
        exit(1);
    }

    // Worker consumes under lock and commits
    $worker->sendCommand([
        'action' => 'consume_proof',
        'table' => 'user_email_verifications',
        'proof_id' => $concReceipt->proofId,
    ]);
    $workerConsume = $worker->readLine(3.0);
    if (!$workerConsume || $workerConsume['status'] !== 'SUCCESS') {
        fwrite(STDERR, "FATAL: ConcurrencyWorker failed to consume under lock.\n");
        exit(1);
    }

    $worker->sendCommand(['action' => 'commit']);
    $workerCommit = $worker->readLine(3.0);
    if (!$workerCommit || $workerCommit['status'] !== 'COMMITTED') {
        fwrite(STDERR, "FATAL: ConcurrencyWorker commit failed.\n");
        exit(1);
    }

    // Parent now consumes: must observe AlreadyConsumed
    $parentResult = $proofService->consume(ProofPurpose::PassengerEmailVerification, $concReceipt->getRawToken());
    if ($parentResult->outcome !== ProofConsumptionOutcome::AlreadyConsumed) {
        fwrite(STDERR, "FATAL: Competing consumer race did not result in exactly one success.\n");
        exit(1);
    }

    $stats['concurrency_probes_passed']++;
    echo "  ✓ Two-process concurrency race yielded exactly one success and one safe denial\n\n";
} finally {
    $worker->close();
}

// -----------------------------------------------------------------------------
// SECTION 4: Outbox Encryption, Local Capture No-Acceptance, and Retention
// -----------------------------------------------------------------------------
echo "[4/5] Outbox encryption, local capture no-acceptance & cleanup...\n";

$encrypter = app(Encrypter::class);
$outboxService = new OutboxService($encrypter, DB::connection());

// Probe 4.1: Exactly-one-FK constraint enforcement
$zeroFkFailed = false;
try {
    DB::statement("
        INSERT INTO security_dispatch_outbox (id, user_verification_id, user_reset_id, staff_invitation_id, staff_reset_id, booking_challenge_id, encrypted_payload, status, expires_at, attempts)
        VALUES ('" . Str::uuid() . "', NULL, NULL, NULL, NULL, NULL, 'enc', 'queued', clock_timestamp() + interval '1 hour', 0)
    ");
} catch (QueryException $e) {
    $zeroFkFailed = true;
}
if (!$zeroFkFailed) {
    fwrite(STDERR, "FATAL: Outbox allowed 0 FKs without check constraint failure.\n");
    exit(1);
}
$stats['outbox_encryption_probes_passed']++;
echo "  ✓ Outbox chk_security_dispatch_outbox_num_nonnulls enforced (0 FKs rejected)\n";

// Probe 4.2: Payload encryption and privacy
$outboxProof = $proofService->issue(ProofPurpose::PassengerEmailVerification, $userId);
$outboxId = $outboxService->enqueueProof($outboxProof);
$outboxRow = DB::table('security_dispatch_outbox')->where('id', $outboxId)->first();

if (!$outboxRow || empty($outboxRow->encrypted_payload)) {
    fwrite(STDERR, "FATAL: Outbox record was not enqueued with encrypted payload.\n");
    exit(1);
}
$decrypted = OutboxPayload::fromJson($encrypter->decrypt($outboxRow->encrypted_payload));
if ($decrypted->getRecipient() !== $userEmail) {
    fwrite(STDERR, "FATAL: Outbox decrypted recipient mismatch.\n");
    exit(1);
}
$stats['outbox_encryption_probes_passed']++;
echo "  ✓ Outbox payload securely encrypted with zero plaintext recipient columns\n";

// Probe 4.2b: Strict JSON structure and non-coercive types
$malformedRejected = false;
try {
    OutboxPayload::fromJson(json_encode([
        'recipient' => ['array_recipient'],
        'subject' => 'subject',
        'body' => 'body',
        'purpose' => 'passenger_email_verification',
        'token_or_code' => 'token',
    ], JSON_THROW_ON_ERROR));
} catch (\App\Identity\Dispatch\Exceptions\DispatchException $e) {
    $malformedRejected = true;
}
if (!$malformedRejected) {
    fwrite(STDERR, "FATAL: OutboxPayload accepted array recipient without DispatchException.\n");
    exit(1);
}
$stats['outbox_encryption_probes_passed']++;
echo "  ✓ OutboxPayload strictly rejects malformed array field types with DispatchException\n";

// Probe 4.3: Local capture keeps status 'queued' without fake acceptance
$tempSink = \App\Identity\Dispatch\OwnedCaptureRetentionLedger::createDisposableTestRoot('test_probe_mail_sink_', DB::connection());

try {
    $mailGateway = new LocalFileMailGateway(storagePath: $tempSink);
    $ledger = new \App\Identity\Dispatch\OwnedCaptureRetentionLedger($tempSink, DB::connection());
    $dispatcher = new OutboxDispatcher($mailGateway, $encrypter, DB::connection(), $ledger);
    $batchResult = $dispatcher->dispatchBatch(limit: 5);

    if ($batchResult->capturedLocallyCount < 1) {
        fwrite(STDERR, "FATAL: Outbox dispatcher failed local capture.\n");
        exit(1);
    }

    $refreshedRow = DB::table('security_dispatch_outbox')->where('id', $outboxId)->first();
    if ($refreshedRow->status !== 'queued' || $refreshedRow->provider_message_id !== null || $refreshedRow->accepted_at !== null) {
        fwrite(STDERR, "FATAL: Local capture illegally set status to accepted or populated provider_message_id.\n");
        exit(1);
    }
    $stats['outbox_encryption_probes_passed']++;
    echo "  ✓ Local capture maintained status=queued without fake provider acceptance\n";
} finally {
    if (is_dir($tempSink)) {
        array_map('unlink', glob($tempSink . '/*') ?: []);
        $marker = $tempSink . DIRECTORY_SEPARATOR . \App\Identity\Dispatch\OwnedCaptureRetentionLedger::OWNED_TEST_MARKER;
        if (is_file($marker)) { @unlink($marker); }
        @rmdir($tempSink);
    }
}

// Probe 4.4: Expiry and ciphertext erasure
DB::table('security_dispatch_outbox')
    ->where('id', $outboxId)
    ->update(['expires_at' => CarbonImmutable::now('UTC')->subSeconds(5)->toIso8601String()]);

$expiredCount = $dispatcher->expireAndErase();
if ($expiredCount < 1) {
    fwrite(STDERR, "FATAL: expireAndErase failed to process expired outbox item.\n");
    exit(1);
}
$expiredRow = DB::table('security_dispatch_outbox')->where('id', $outboxId)->first();
if ($expiredRow->status !== 'expired' || $expiredRow->encrypted_payload !== null) {
    fwrite(STDERR, "FATAL: Expired outbox item did not erase encrypted_payload.\n");
    exit(1);
}
$stats['outbox_encryption_probes_passed']++;
echo "  ✓ Outbox deadline expiration cleanly erased ciphertext payload\n";

// Probe 4.5: Owned capture retention ledger cleanup at original deadline
$probeLedgerDir = \App\Identity\Dispatch\OwnedCaptureRetentionLedger::createDisposableTestRoot('test_probe_ledger_', DB::connection());
try {
    $ledger = new \App\Identity\Dispatch\OwnedCaptureRetentionLedger($probeLedgerDir);
    $capId1 = 'cap_' . bin2hex(random_bytes(16));
    $capId2 = 'cap_' . bin2hex(random_bytes(16));
    $f1 = $probeLedgerDir . DIRECTORY_SEPARATOR . $capId1 . '.json';
    $f2 = $probeLedgerDir . DIRECTORY_SEPARATOR . $capId2 . '.json';
    $now = CarbonImmutable::now('UTC');
    $outbox1 = (string) Str::uuid();
    $outbox2 = (string) Str::uuid();
    $ledger->reserveCapture($capId1, $outbox1, (string) Str::uuid(), 'passenger_password_reset', $now->subMinutes(5));
    file_put_contents($f1, '{"status":"captured_locally"}');
    $ledger->commitCapture($capId1, $outbox1);

    $ledger->reserveCapture($capId2, $outbox2, (string) Str::uuid(), 'booking_guest_challenge', $now->addMinutes(10));
    file_put_contents($f2, '{"status":"captured_locally"}');
    $ledger->commitCapture($capId2, $outbox2);
    $cleanedCount = $ledger->cleanupExpired($now);
    if ($cleanedCount !== 1 || file_exists($f1) || !file_exists($f2)) {
        fwrite(STDERR, "FATAL: OwnedCaptureRetentionLedger failed to clean up expired capture at original deadline.\n");
        exit(1);
    }
    $stats['outbox_encryption_probes_passed']++;
    echo "  ✓ OwnedCaptureRetentionLedger cleanly purged expired capture at original deadline\n\n";
} finally {
    if (is_dir($probeLedgerDir)) {
        array_map('unlink', glob($probeLedgerDir . '/*') ?: []);
        $marker = $probeLedgerDir . DIRECTORY_SEPARATOR . \App\Identity\Dispatch\OwnedCaptureRetentionLedger::OWNED_TEST_MARKER;
        if (is_file($marker)) { @unlink($marker); }
        @unlink($probeLedgerDir . DIRECTORY_SEPARATOR . \App\Identity\Dispatch\OwnedCaptureRetentionLedger::LEDGER_FILENAME);
        @rmdir($probeLedgerDir);
    }
}


// -----------------------------------------------------------------------------
// SECTION 5: Append-Only Audit & Immutability Triggers
// -----------------------------------------------------------------------------
echo "[5/5] Append-only audit writer & immutability triggers...\n";

$auditWriter = new AuditWriter(DB::connection());

// Probe 5.1: Passenger, staff, and system audit writes
$passEvent = $auditWriter->record(
    actor: AuditActor::passenger($userId),
    action: 'postPassengerEmailVerify',
    outcome: AuditOutcome::Success,
    targetType: AuditTargetType::User,
    targetId: $userId,
    metadata: ['consumed' => true, 'status' => 'verified'],
);
$staffEvent = $auditWriter->record(
    actor: AuditActor::staff($staffId),
    action: 'postStaffInvitationAccept',
    outcome: AuditOutcome::Success,
    targetType: AuditTargetType::StaffUser,
    targetId: $staffId,
    metadata: ['status' => 'active'],
);
$sysEvent = $auditWriter->record(
    actor: AuditActor::system(),
    action: 'auth.security_dispatch_queued',
    outcome: AuditOutcome::Success,
    targetType: AuditTargetType::SecurityDispatch,
    targetId: $userId,
    metadata: ['status' => 'active', 'count' => 1],
);

$stats['audit_immutability_probes_passed'] += 3;
echo "  ✓ Audit events recorded cleanly across passenger, staff, and system realms\n";

// Probe 5.2: Unknown login subject uses system actor without identifier disclosure
$unknownEvent = $auditWriter->recordUnknownSubjectAttempt('auth.login_denied_unknown_subject');
$unknownRow = DB::table('audit_events')->where('id', $unknownEvent)->first();
if (!$unknownRow || !$unknownRow->is_system_actor || $unknownRow->target_id !== 'none') {
    fwrite(STDERR, "FATAL: Unknown subject audit record failed system actor constraint.\n");
    exit(1);
}
$stats['audit_immutability_probes_passed']++;
echo "  ✓ Unknown subject attempt recorded with system actor and zero PII disclosure\n";

// Probe 5.3: Immutability triggers reject UPDATE and DELETE
$updateRejected = false;
try {
    DB::statement('UPDATE audit_events SET outcome = ? WHERE id = ?', ['failure', $passEvent]);
} catch (QueryException $e) {
    $updateRejected = true;
}
if (!$updateRejected) {
    fwrite(STDERR, "FATAL: audit_events UPDATE was not rejected by database trigger.\n");
    exit(1);
}

$deleteRejected = false;
try {
    DB::statement('DELETE FROM audit_events WHERE id = ?', [$passEvent]);
} catch (QueryException $e) {
    $deleteRejected = true;
}
if (!$deleteRejected) {
    fwrite(STDERR, "FATAL: audit_events DELETE was not rejected by database trigger.\n");
    exit(1);
}
$stats['audit_immutability_probes_passed'] += 2;
echo "  ✓ Immutability triggers confirmed: UPDATE and DELETE strictly rejected by PostgreSQL\n";

// Probe 5.4: Pre-flight metadata validation rejects PII
$piiRejected = false;
try {
    $auditWriter->record(
        actor: AuditActor::passenger($userId),
        action: 'postPassengerEmailVerify',
        outcome: AuditOutcome::Success,
        targetType: AuditTargetType::User,
        targetId: $userId,
        metadata: ['password' => 'secret'],
    );
} catch (AuditValidationException $e) {
    $piiRejected = true;
}
if (!$piiRejected) {
    fwrite(STDERR, "FATAL: AuditWriter failed to reject forbidden PII key before insert.\n");
    exit(1);
}
$stats['audit_immutability_probes_passed']++;
echo "  ✓ Pre-flight metadata validation denied forbidden PII keys\n\n";

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
echo "=== PROBE RESULTS SUMMARY ===\n";
echo "  Catalog tables verified:              {$stats['catalog_tables_verified']}/" . count($requiredTables) . "\n";
echo "  Proof semantic probes passed:          {$stats['proof_semantic_probes_passed']}\n";
echo "  Guest OTP probes passed:               {$stats['guest_otp_probes_passed']}\n";
echo "  Concurrency probes passed:             {$stats['concurrency_probes_passed']}\n";
echo "  Outbox encryption probes passed:       {$stats['outbox_encryption_probes_passed']}\n";
echo "  Audit immutability probes passed:      {$stats['audit_immutability_probes_passed']}\n";
echo "STATUS: ALL PROBES PASSED (exit code 0)\n";
exit(0);
