<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityPassenger;

use App\Identity\Passenger\Exceptions\AuthenticationException;
use App\Identity\Passenger\PassengerAuthCoordinator;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Sessions\PassengerSessionContext;
use App\Identity\Tokens\OpaqueToken;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Codex independent security regressions; guarded real PostgreSQL, exact tracked fixtures. */
final class PassengerActionAuthorityReviewTest extends TestCase
{
    private string $userId;
    private array $sessionIds = [];
    private static ?string $hash = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertDisposableDatabaseTarget();
        self::$hash ??= app(Argon2idPasswordHasher::class)->hash('IndependentPassword15!', 'passenger');
        $this->userId = (string) Str::uuid();
        DB::table('users')->insert([
            'id' => $this->userId, 'email' => 'review_' . Str::random(16) . '@example.test',
            'password_hash' => self::$hash, 'status' => 'active', 'credential_epoch' => 1,
            'email_verified_at' => DB::raw('clock_timestamp()'),
            'created_at' => DB::raw('clock_timestamp()'), 'updated_at' => DB::raw('clock_timestamp()'),
        ]);
        DB::table('passenger_profiles')->insert([
            'user_id' => $this->userId, 'first_name' => 'Synthetic', 'last_name' => 'Review', 'phone' => '',
            'created_at' => DB::raw('clock_timestamp()'), 'updated_at' => DB::raw('clock_timestamp()'),
        ]);
    }

    protected function tearDown(): void
    {
        $this->assertDisposableDatabaseTarget();
        if ($this->sessionIds !== []) {
            DB::table('passenger_sessions')->whereIn('id', $this->sessionIds)->delete();
        }
        DB::table('passenger_profiles')->where('user_id', $this->userId)->delete();
        // Never modify append-only audits; audited principal residue is deliberately retained.
        if (!DB::table('audit_events')->where('passenger_id', $this->userId)->exists()) {
            DB::table('users')->where('id', $this->userId)->delete();
        }
        parent::tearDown();
    }

    public function test_action_rejects_revoked_login_context_and_commits_one_safe_denial_audit(): void
    {
        $store = app(PassengerSessionStore::class);
        $receipt = $store->issueAnonymous();
        $this->sessionIds[] = $receipt->sessionId;
        $context = $store->read($receipt->getRawToken());
        $this->assertNotNull($context);
        DB::table('passenger_sessions')->where('id', $receipt->sessionId)->update(['revoked_at' => DB::raw('clock_timestamp()')]);
        $before = DB::table('passenger_sessions')->where('user_id', $this->userId)->count();
        $requestId = (string) Str::uuid();
        $email = DB::table('users')->where('id', $this->userId)->value('email');
        try {
            app(PassengerAuthCoordinator::class)->login(
                ['email' => $email, 'password' => 'IndependentPassword15!'], $this->ip(), 'SyntheticReview',
                $context, $receipt->getCsrfToken(), $receipt->getRawToken(), $requestId
            );
            $this->fail('Revoked action authority must be denied.');
        } catch (AuthenticationException) {
            $this->assertSame($before, DB::table('passenger_sessions')->where('user_id', $this->userId)->count());
        }
        $events = DB::table('audit_events')->where('request_id', $requestId)->get();
        $this->assertCount(1, $events);
        $this->assertSame('denied', $events[0]->outcome);
        $this->assertSame('system', $events[0]->realm);
        $this->assertNull($events[0]->target_id);
        $this->assertStringNotContainsString((string) $email, (string) $events[0]->metadata);
        $this->assertStringNotContainsString($receipt->getRawToken(), (string) $events[0]->metadata);
        $this->assertSame(0, DB::connection()->transactionLevel());
    }

    public function test_current_locked_csrf_and_context_epoch_are_required_before_actions(): void
    {
        $store = app(PassengerSessionStore::class);
        $receipt = $store->issueFull($this->userId, 1);
        $this->sessionIds[] = $receipt->sessionId;
        $context = $store->read($receipt->getRawToken());
        $this->assertNotNull($context);
        $coordinator = app(PassengerAuthCoordinator::class);
        $stale = new PassengerSessionContext(
            sessionId: $context->sessionId, authLevel: 'full', userId: $this->userId,
            credentialEpoch: 2, csrfToken: $context->getCsrfToken(), payload: $context->getPayload(),
            issuedAt: $context->issuedAt, absoluteExpiresAt: $context->absoluteExpiresAt,
            idleExpiresAt: $context->idleExpiresAt, lastSeenAt: $context->lastSeenAt
        );
        try {
            $coordinator->listSessions($stale);
            $this->fail('Stale context epoch must be denied.');
        } catch (AuthenticationException) {
            $this->assertSame(1, (int) DB::table('users')->where('id', $this->userId)->value('credential_epoch'));
        }
        $payload = $context->getPayload();
        $payload['csrf_token'] = OpaqueToken::generate('passenger', 'csrf')->getSecretToken();
        DB::table('passenger_sessions')->where('id', $context->sessionId)->update([
            'encrypted_payload' => app(Encrypter::class)->encrypt(json_encode($payload, JSON_THROW_ON_ERROR)),
        ]);
        $actions = [
            'logout' => fn (string $id) => $coordinator->logout($context, $id),
            'deleteSession' => fn (string $id) => $coordinator->deleteSession($context->sessionId, $context, $id),
            'changePassword' => fn (string $id) => $coordinator->changePassword([
                'currentPassword' => 'IndependentPassword15!', 'newPassword' => 'ChangedPassword15!'
            ], $context, $this->ip(), $id),
        ];
        foreach ($actions as $action) {
            $requestId = (string) Str::uuid();
            try {
                $action($requestId);
                $this->fail('Changed locked CSRF must invalidate action authority.');
            } catch (AuthenticationException) {
                $this->assertSame(1, DB::table('audit_events')->where('request_id', $requestId)->where('outcome', 'denied')->count());
            }
            $this->assertNull(DB::table('passenger_sessions')->where('id', $context->sessionId)->value('revoked_at'));
            $this->assertSame(self::$hash, DB::table('users')->where('id', $this->userId)->value('password_hash'));
            $this->assertSame(1, (int) DB::table('users')->where('id', $this->userId)->value('credential_epoch'));
            $this->assertSame(0, DB::connection()->transactionLevel());
        }
    }

    private function ip(): string
    {
        return '198.18.' . random_int(0, 255) . '.' . random_int(1, 254);
    }
}
