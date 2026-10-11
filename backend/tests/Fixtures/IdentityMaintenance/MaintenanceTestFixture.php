<?php

declare(strict_types=1);

namespace Tests\Fixtures\IdentityMaintenance;

use App\Identity\Dispatch\OutboxService;
use App\Identity\Dispatch\OwnedCaptureRetentionLedger;
use App\Identity\Proofs\ProofPurpose;
use App\Identity\Proofs\ProofService;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Tests\Fixtures\IdentityLifecycle\LifecycleTestFactory;

/**
 * Strict owned fixture helper for Phase 13B local identity maintenance tests.
 *
 * Enforces:
 * - Pre-flight testing environment assertions.
 * - Reverse foreign-key teardown order (security_dispatch_outbox -> proof tables -> users).
 * - Bounded disposable test root lifecycle with capability marker verification.
 * - Never bypasses triggers, never performs blanket TRUNCATE or CASCADE DELETE.
 */
final class MaintenanceTestFixture
{
    private array $ownedRoots = [];
    private array $createdUserIds = [];
    private array $createdProofRecords = [];
    private array $createdOutboxIds = [];

    public function __construct(
        private readonly ProofService $proofService,
        private readonly OutboxService $outboxService,
        private readonly Encrypter $encrypter,
    ) {
    }

    public static function assertTestingGuards(): void
    {
        $processEnv = getenv('APP_ENV');
        if ($processEnv !== 'testing') {
            throw new \RuntimeException('Fixture admission requires process APP_ENV=testing, got: ' . ($processEnv ?: 'empty'));
        }

        if (!function_exists('app') || !app()->environment('testing')) {
            throw new \RuntimeException('Fixture admission requires application environment testing.');
        }

        $defaultConn = config('database.default');
        if ($defaultConn !== 'pgsql_test') {
            throw new \RuntimeException("Fixture admission requires default connection pgsql_test, got: [{$defaultConn}]");
        }

        $connection = DB::connection();
        if ($connection->getName() !== 'pgsql_test') {
            throw new \RuntimeException("Fixture admission requires actual connection name pgsql_test, got: [{$connection->getName()}]");
        }

        if ($connection->getDriverName() !== 'pgsql') {
            throw new \RuntimeException("Fixture admission requires actual database driver pgsql, got: [{$connection->getDriverName()}]");
        }

        try {
            $row = $connection->selectOne('SELECT current_database() AS db');
            $liveDb = (string) ($row?->db ?? '');
        } catch (\Throwable) {
            throw new \RuntimeException('Fixture admission failed to query live database target.');
        }

        if ($liveDb !== 'gaza_gateway_test') {
            throw new \RuntimeException("Fixture admission rejected live database target, got: [{$liveDb}]");
        }
    }

    public function assertReady(): void
    {
        self::assertTestingGuards();
    }

    public static function create(): self
    {
        self::assertTestingGuards();
        $db = DB::connection();
        $encrypter = app(Encrypter::class);
        $outboxService = new OutboxService($encrypter, $db);
        $proofService = new ProofService($db);

        return new self($proofService, $outboxService, $encrypter);
    }

    public function createTrackedUser(array $overrides = []): string
    {
        self::assertTestingGuards();
        $userId = LifecycleTestFactory::createUser($overrides);
        $this->createdUserIds[] = $userId;
        return $userId;
    }

    public function issueTrackedProof(ProofPurpose $purpose, string $userId): \App\Identity\Proofs\ProofIssuedReceipt
    {
        self::assertTestingGuards();
        $proof = $this->proofService->issue($purpose, $userId);
        $this->createdProofRecords[] = [
            'table' => $purpose->table(),
            'id' => $proof->proofId,
        ];
        return $proof;
    }

    public function enqueueTrackedProof(\App\Identity\Proofs\ProofIssuedReceipt $proof): string
    {
        self::assertTestingGuards();
        $outboxId = $this->outboxService->enqueueProof($proof);
        $this->createdOutboxIds[] = $outboxId;
        return $outboxId;
    }

    public function createTrackedExpiredOutbox(string $userId): string
    {
        self::assertTestingGuards();
        $proof = $this->issueTrackedProof(ProofPurpose::PassengerPasswordReset, $userId);
        $outboxId = $this->enqueueTrackedProof($proof);

        $past = CarbonImmutable::now('UTC')->subHour();
        DB::table('security_dispatch_outbox')
            ->where('id', $outboxId)
            ->update([
                'expires_at' => $past->toRfc3339String(),
            ]);

        return $outboxId;
    }

    public function createOwnedRoot(): string
    {
        self::assertTestingGuards();
        $root = OwnedCaptureRetentionLedger::createDisposableTestRoot('codex_maint_', DB::connection());
        $this->ownedRoots[] = $root;
        config(['foundation-services.mail.local_path' => $root]);
        return $root;
    }

    public function cleanup(): void
    {
        self::assertTestingGuards();

        $db = DB::connection();

        // 1. Guarded teardown in reverse FK order: outbox -> proofs -> users
        if (!empty($this->createdOutboxIds)) {
            $db->table('security_dispatch_outbox')
                ->whereIn('id', $this->createdOutboxIds)
                ->delete();
            $this->createdOutboxIds = [];
        }

        if (!empty($this->createdProofRecords)) {
            foreach (array_reverse($this->createdProofRecords) as $record) {
                $db->table($record['table'])->where('id', $record['id'])->delete();
            }
            $this->createdProofRecords = [];
        }

        if (!empty($this->createdUserIds)) {
            $db->table('users')
                ->whereIn('id', $this->createdUserIds)
                ->delete();
            $this->createdUserIds = [];
        }

        // 2. Safe bounded leaf cleanup of disposable roots
        foreach ($this->ownedRoots as $root) {
            $this->cleanupOwnedRoot($root);
        }
        $this->ownedRoots = [];
    }

    private function cleanupOwnedRoot(string $root): void
    {
        $private = realpath(storage_path('app/private'));
        $realRoot = realpath($root);
        if ($private === false || $realRoot === false || is_link($root)
            || dirname($realRoot) !== $private
            || !preg_match('/^codex_maint_[a-zA-Z0-9_-]+$/', basename($realRoot))) {
            throw new \RuntimeException('Disposable capture cleanup rejected its root.');
        }
        $marker = $realRoot . DIRECTORY_SEPARATOR . OwnedCaptureRetentionLedger::OWNED_TEST_MARKER;
        if (is_link($marker) || !is_file($marker)
            || file_get_contents($marker) !== "gza_test_owned_marker_v1\n") {
            throw new \RuntimeException('Disposable capture cleanup rejected its capability.');
        }
        $entries = scandir($realRoot);
        if ($entries === false || count($entries) > 1010) {
            throw new \RuntimeException('Disposable capture cleanup exceeded its bound.');
        }
        $leaves = [];
        foreach ($entries as $entry) {
            if (in_array($entry, ['.', '..', OwnedCaptureRetentionLedger::OWNED_TEST_MARKER], true)) {
                continue;
            }
            $leaf = $realRoot . DIRECTORY_SEPARATOR . $entry;
            if (is_link($leaf) || !is_file($leaf)
                || (!in_array($entry, [OwnedCaptureRetentionLedger::LEDGER_FILENAME, OwnedCaptureRetentionLedger::LOCK_FILENAME], true)
                    && !preg_match('/^cap_[a-f0-9]{32}\.(json|tmp)$/', $entry))) {
                throw new \RuntimeException('Disposable capture cleanup rejected an unexpected leaf.');
            }
            $leaves[] = $leaf;
        }
        $failed = false;
        foreach ($leaves as $leaf) {
            @chmod($leaf, 0600);
            if (!@unlink($leaf)) {
                $failed = true;
            }
        }
        if ($failed || !@unlink($marker) || !@rmdir($realRoot)) {
            throw new \RuntimeException('Disposable capture cleanup did not complete.');
        }
    }
}
