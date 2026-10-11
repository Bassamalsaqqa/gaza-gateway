<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityPassenger;

use App\Identity\Dispatch\OutboxPayload;
use App\Identity\Protocol\CookieSecurity;
use App\Identity\Sessions\PassengerSessionStore;
use App\Identity\Tokens\OpaqueToken;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Bounded contract capture test for the Phase 13B passenger authentication HTTP lifecycle.
 *
 * Executes a single genuine HTTP lifecycle across all ten passenger operations:
 * 1. POST /auth/register (postPassengerRegister, 202)
 * 2. POST /auth/email/resend (postPassengerEmailResend, 202)
 * 3. POST /auth/email/verify (postPassengerEmailVerify, 200)
 * 4. POST /auth/login (postPassengerLogin, 200)
 * 5. GET /auth/passenger/sessions (getPassengerSessions, 200)
 * 6. DELETE /auth/passenger/sessions/{id} (deletePassengerSession, 200)
 * 7. PUT /auth/passenger/password (putPassengerPassword, 200)
 * 8. POST /auth/password/forgot (postPassengerPasswordForgot, 202)
 * 9. POST /auth/password/reset (postPassengerPasswordReset, 200)
 * 10. POST /auth/logout (postPassengerLogout, 200)
 *
 * Captures ONLY operationId, status, contentType, and rawResponseBody into an owned
 * private storage directory with mode 0700 and exclusive markers/files with mode 0600.
 */
final class PassengerAuthContractCaptureTest extends TestCase
{
    /** @var list<string> */
    private array $trackedUserIds = [];

    /** @var list<string> */
    private array $trackedSessionIds = [];

    /** @var list<string> */
    private array $trackedOutboxIds = [];

    /** @var list<string> */
    private array $trackedSubjectDigests = [];

    /** @var list<string> */
    private array $trackedIps = [];

    /** @var array<string, array{operationId: string, status: int, contentType: string, rawResponseBody: string}> */
    private array $capturedResponses = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertDisposableDatabaseTarget();
    }

    protected function tearDown(): void
    {
        $this->assertDisposableDatabaseTarget();

        // Tracked reverse-FK cleanup targeting non-immutable test records
        if (!empty($this->trackedUserIds) || !empty($this->trackedSessionIds) || !empty($this->trackedOutboxIds)) {
            // 1. Clean outbox entries tracked directly or through proof FKs
            if (!empty($this->trackedOutboxIds)) {
                DB::table('security_dispatch_outbox')->whereIn('id', $this->trackedOutboxIds)->delete();
            }

            if (!empty($this->trackedUserIds)) {
                $verifProofIds = DB::table('user_email_verifications')->whereIn('user_id', $this->trackedUserIds)->pluck('id')->all();
                $resetProofIds = DB::table('user_password_resets')->whereIn('user_id', $this->trackedUserIds)->pluck('id')->all();

                if (!empty($verifProofIds)) {
                    DB::table('security_dispatch_outbox')->whereIn('user_verification_id', $verifProofIds)->delete();
                }
                if (!empty($resetProofIds)) {
                    DB::table('security_dispatch_outbox')->whereIn('user_reset_id', $resetProofIds)->delete();
                }

                // 2. Clean proof records
                DB::table('user_password_resets')->whereIn('user_id', $this->trackedUserIds)->delete();
                DB::table('user_email_verifications')->whereIn('user_id', $this->trackedUserIds)->delete();
            }

            // 3. Clean passenger sessions
            if (!empty($this->trackedSessionIds) || !empty($this->trackedUserIds)) {
                DB::table('passenger_sessions')
                    ->where(function ($query) {
                        if (!empty($this->trackedSessionIds)) {
                            $query->whereIn('id', $this->trackedSessionIds);
                        }
                        if (!empty($this->trackedUserIds)) {
                            $query->orWhereIn('user_id', $this->trackedUserIds);
                        }
                    })
                    ->delete();
            }

            // 4. Clean passenger profiles
            if (!empty($this->trackedUserIds)) {
                DB::table('passenger_profiles')->whereIn('user_id', $this->trackedUserIds)->delete();
            }

            // 5. Note on security_rate_limits and admission residue:
            // Admission records and rate limit counters in security_rate_limits represent expiring admission residue.
            // Shared rate limit counters are bounded by time windows (window_end) and cleaned up via maintenance;
            // shared counters are never deleted manually during teardown.

            // 6. Note on audit_events and users:
            // audit_events is append-only and trigger-enforced immutable (UPDATE/DELETE/TRUNCATE prohibited).
            // fk_audit_events_passenger ON DELETE RESTRICT preserves audited principal rows.
            // Only un-audited users can be deleted; audited users remain as bounded immutable residue.
            if (!empty($this->trackedUserIds)) {
                $auditedUserIds = DB::table('audit_events')
                    ->whereIn('passenger_id', $this->trackedUserIds)
                    ->pluck('passenger_id')
                    ->map(fn ($id) => (string) $id)
                    ->unique()
                    ->all();

                $unauditedUserIds = array_values(array_diff($this->trackedUserIds, $auditedUserIds));
                if (!empty($unauditedUserIds)) {
                    DB::table('users')->whereIn('id', $unauditedUserIds)->delete();
                }
            }
        }

        parent::tearDown();
    }

    private function nextTestIp(): string
    {
        do {
            $ip = sprintf('198.18.%d.%d', random_int(1, 254), random_int(1, 254));
        } while (in_array($ip, $this->trackedIps, true));

        $this->trackedIps[] = $ip;
        return $ip;
    }

    private function withHttps(string $ip = '127.0.0.1'): self
    {
        app('url')->forceRootUrl('https://127.0.0.1');
        app('url')->forceScheme('https');
        return $this->withServerVariables([
            'HTTPS' => 'on',
            'SERVER_PORT' => 443,
            'HTTP_HOST' => '127.0.0.1',
            'SERVER_NAME' => '127.0.0.1',
            'REMOTE_ADDR' => $ip,
        ]);
    }

    private function bodyless(string $method, string $uri): \Illuminate\Testing\TestResponse
    {
        return $this->call($method, $uri, [], [], [], $this->transformHeadersToServerVars([]));
    }

    /**
     * @return array<string, string>
     */
    private function authHeaders(
        string $csrfToken,
        string $cookieValue,
        ?string $origin = 'http://localhost:3000'
    ): array {
        $headers = [
            'X-CSRF-TOKEN' => $csrfToken,
            'Cookie' => CookieSecurity::COOKIE_PASSENGER . '=' . $cookieValue,
            'Accept' => 'application/json',
            'Content-Type' => 'application/json',
        ];

        if ($origin !== null) {
            $headers['Origin'] = $origin;
        }

        return $headers;
    }

    /**
     * @return array{cookie: string, csrfToken: string, ip: string}
     */
    private function bootstrapAnonymous(?string $ip = null): array
    {
        $this->flushHeaders();
        $ip = $ip ?? $this->nextTestIp();
        $response = $this->withHttps($ip)->get('/api/v1/auth/csrf');
        $response->assertStatus(200);

        $data = $response->json();
        $this->assertArrayHasKey('csrfToken', $data);
        $csrfToken = (string) $data['csrfToken'];

        $rawCookie = null;
        foreach ($response->headers->getCookies() as $c) {
            if ($c->getName() === CookieSecurity::COOKIE_PASSENGER) {
                $rawCookie = $c->getValue();
                break;
            }
        }

        $this->assertNotNull($rawCookie, 'Expected gza_session cookie from CSRF bootstrap.');

        $digest = OpaqueToken::digestOf($rawCookie);
        $session = DB::table('passenger_sessions')->where('lookup_digest', $digest)->first();
        if ($session) {
            $this->trackedSessionIds[] = (string) $session->id;
        }

        return [
            'cookie' => $rawCookie,
            'csrfToken' => $csrfToken,
            'ip' => $ip,
        ];
    }

    private function recordCapture(string $operationId, \Illuminate\Testing\TestResponse $response): void
    {
        $contentType = $response->headers->get('Content-Type') ?? 'application/json';
        $rawBody = (string) $response->getContent();

        // Strict invariant: captures ONLY operationId, status, contentType, rawResponseBody
        // Zero cookies, passwords, tokens, request bodies, or CSRF bootstrap data
        $this->capturedResponses[$operationId] = [
            'operationId' => $operationId,
            'status' => $response->getStatusCode(),
            'contentType' => $contentType,
            'rawResponseBody' => $rawBody,
        ];
    }

    private function persistCaptures(): void
    {
        $this->assertDisposableDatabaseTarget();
        $parent = storage_path('app/private');
        if (is_link($parent) || (!is_dir($parent) && !mkdir($parent, 0700, true))) {
            throw new \RuntimeException('Private capture parent unavailable.');
        }
        $target = getenv('PASSENGER_AUTH_CAPTURES_DIR') ?: $parent . '/passenger-auth-captures-' . Str::uuid();
        if (realpath(dirname($target)) !== realpath($parent)
            || !preg_match('/^passenger-auth-captures-[A-Za-z0-9-]{1,80}$/D', basename($target))
            || file_exists($target) || is_link($target)) {
            throw new \RuntimeException('Capture admission requires a new immediate private child.');
        }
        $mask = umask(0077);
        try {
            if (!mkdir($target, 0700)) {
                throw new \RuntimeException('Exclusive capture directory creation failed.');
            }
            $files = [
                '.exclusive_marker' => (string) Str::uuid(),
                'captures.json' => json_encode(array_values($this->capturedResponses), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
            ];
            foreach ($files as $name => $bytes) {
                $handle = fopen($target . '/' . $name, 'x');
                if ($handle === false) {
                    throw new \RuntimeException('Exclusive capture file creation failed.');
                }
                try {
                    if (fwrite($handle, $bytes) !== strlen($bytes) || !fflush($handle)) {
                        throw new \RuntimeException('Capture persistence failed.');
                    }
                } finally {
                    fclose($handle);
                }
                if (DIRECTORY_SEPARATOR === '/' && !chmod($target . '/' . $name, 0600)) {
                    throw new \RuntimeException('Capture permissions failed.');
                }
            }
            // Capture bodies are synthetic responses only; retain the owned directory for independent validation.
            fwrite(STDOUT, "\nPASSENGER_AUTH_CAPTURES=" . $target . "\n");
        } finally {
            umask($mask);
        }
    }

    public function test_passenger_auth_ten_operations_http_lifecycle_contract_capture(): void
    {
        /** @var Encrypter $encrypter */
        $encrypter = app(Encrypter::class);
        /** @var PassengerSessionStore $sessionStore */
        $sessionStore = app(PassengerSessionStore::class);

        $initialPassword = 'InitialPassword15!Chars';
        $changedPassword = 'ChangedPassword15!Next';
        $finalPassword = 'FinalResetPassword15!';

        // ---------------------------------------------------------------------
        // 1. POST /auth/register (postPassengerRegister, 202)
        // ---------------------------------------------------------------------
        $bootstrapReg = $this->bootstrapAnonymous();
        $email = 'capture_' . Str::random(8) . '@gazaairport.com';
        $this->trackedSubjectDigests[] = hash('sha256', strtolower($email));

        $payloadReg = [
            'email' => $email,
            'password' => $initialPassword,
            'title' => 'Mr',
            'firstName' => 'Ahmad',
            'lastName' => 'Al-Masri',
            'phone' => '+970599123456',
        ];

        $respReg = $this->withHttps($bootstrapReg['ip'])
            ->withHeaders($this->authHeaders($bootstrapReg['csrfToken'], $bootstrapReg['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/register', $payloadReg);

        $respReg->assertStatus(202);
        $this->recordCapture('postPassengerRegister', $respReg);

        $user = DB::table('users')->whereRaw('lower(email) = ?', [strtolower($email)])->first();
        $this->assertNotNull($user);
        $userId = (string) $user->id;
        $this->trackedUserIds[] = $userId;

        $verifProof1 = DB::table('user_email_verifications')->where('user_id', $userId)->first();
        $this->assertNotNull($verifProof1);
        $outbox1 = DB::table('security_dispatch_outbox')->where('user_verification_id', $verifProof1->id)->first();
        if ($outbox1) {
            $this->trackedOutboxIds[] = (string) $outbox1->id;
        }

        // ---------------------------------------------------------------------
        // 2. POST /auth/email/resend (postPassengerEmailResend, 202)
        // ---------------------------------------------------------------------
        $bootstrapResend = $this->bootstrapAnonymous();
        $respResend = $this->withHttps($bootstrapResend['ip'])
            ->withHeaders($this->authHeaders($bootstrapResend['csrfToken'], $bootstrapResend['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/email/resend', [
                'email' => $email,
            ]);

        $respResend->assertStatus(202);
        $this->recordCapture('postPassengerEmailResend', $respResend);

        $verifProof2 = DB::table('user_email_verifications')->where('user_id', $userId)->where('state', 'issued')->latest('issued_at')->first();
        $this->assertNotNull($verifProof2);
        $outbox2 = DB::table('security_dispatch_outbox')->where('user_verification_id', $verifProof2->id)->latest('id')->first();
        $this->assertNotNull($outbox2);
        $this->trackedOutboxIds[] = (string) $outbox2->id;

        // ---------------------------------------------------------------------
        // 3. POST /auth/email/verify (postPassengerEmailVerify, 200)
        // ---------------------------------------------------------------------
        $payloadJsonVerif = $encrypter->decrypt($outbox2->encrypted_payload);
        $outboxVerifPayload = OutboxPayload::fromJson($payloadJsonVerif);
        $rawVerifyToken = $outboxVerifPayload->getTokenOrCode();

        $bootstrapVerify = $this->bootstrapAnonymous();
        $respVerify = $this->withHttps($bootstrapVerify['ip'])
            ->withHeaders($this->authHeaders($bootstrapVerify['csrfToken'], $bootstrapVerify['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/email/verify', [
                'token' => $rawVerifyToken,
            ]);

        $respVerify->assertStatus(200);
        $this->recordCapture('postPassengerEmailVerify', $respVerify);

        // ---------------------------------------------------------------------
        // 4. POST /auth/login (postPassengerLogin, 200)
        // ---------------------------------------------------------------------
        $bootstrapLogin1 = $this->bootstrapAnonymous();
        $respLogin1 = $this->withHttps($bootstrapLogin1['ip'])
            ->withHeaders($this->authHeaders($bootstrapLogin1['csrfToken'], $bootstrapLogin1['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/login', [
                'email' => $email,
                'password' => $initialPassword,
            ]);

        $respLogin1->assertStatus(200);
        $this->recordCapture('postPassengerLogin', $respLogin1);

        $session1Cookie = null;
        foreach ($respLogin1->headers->getCookies() as $c) {
            if ($c->getName() === CookieSecurity::COOKIE_PASSENGER) {
                $session1Cookie = $c->getValue();
                break;
            }
        }
        $this->assertNotNull($session1Cookie);
        $context1 = $sessionStore->read($session1Cookie);
        $this->assertNotNull($context1);
        $this->trackedSessionIds[] = $context1->sessionId;
        $session1Csrf = $context1->getCsrfToken();

        // Establish secondary concurrent session to exercise multi-session listing and revocation
        $bootstrapLogin2 = $this->bootstrapAnonymous();
        $respLogin2 = $this->withHttps($bootstrapLogin2['ip'])
            ->withHeaders($this->authHeaders($bootstrapLogin2['csrfToken'], $bootstrapLogin2['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/login', [
                'email' => $email,
                'password' => $initialPassword,
            ]);
        $respLogin2->assertStatus(200);

        $session2Cookie = null;
        foreach ($respLogin2->headers->getCookies() as $c) {
            if ($c->getName() === CookieSecurity::COOKIE_PASSENGER) {
                $session2Cookie = $c->getValue();
                break;
            }
        }
        $this->assertNotNull($session2Cookie);
        $context2 = $sessionStore->read($session2Cookie);
        $this->assertNotNull($context2);
        $this->trackedSessionIds[] = $context2->sessionId;
        $session2Id = $context2->sessionId;

        // ---------------------------------------------------------------------
        // 5. GET /auth/passenger/sessions (getPassengerSessions, 200)
        // ---------------------------------------------------------------------
        $this->flushHeaders();
        $respSessions = $this->withHttps($bootstrapLogin1['ip'])
            ->withHeaders([
                'Cookie' => CookieSecurity::COOKIE_PASSENGER . '=' . $session1Cookie,
                'Accept' => 'application/json',
            ])
            ->get('/api/v1/auth/passenger/sessions');

        $respSessions->assertStatus(200);
        $this->recordCapture('getPassengerSessions', $respSessions);

        // ---------------------------------------------------------------------
        // 6. DELETE /auth/passenger/sessions/{id} (deletePassengerSession, 200)
        // ---------------------------------------------------------------------
        $this->flushHeaders();
        $respDeleteSession = $this->withHttps($bootstrapLogin1['ip'])
            ->withHeaders($this->authHeaders($session1Csrf, $session1Cookie, 'http://localhost:3000'))
            ->bodyless('DELETE', '/api/v1/auth/passenger/sessions/' . $session2Id);

        $respDeleteSession->assertStatus(200);
        $this->recordCapture('deletePassengerSession', $respDeleteSession);

        // ---------------------------------------------------------------------
        // 7. PUT /auth/passenger/password (putPassengerPassword, 200)
        // ---------------------------------------------------------------------
        $this->flushHeaders();
        $respPutPassword = $this->withHttps($bootstrapLogin1['ip'])
            ->withHeaders($this->authHeaders($session1Csrf, $session1Cookie, 'http://localhost:3000'))
            ->putJson('/api/v1/auth/passenger/password', [
                'currentPassword' => $initialPassword,
                'newPassword' => $changedPassword,
            ]);

        $respPutPassword->assertStatus(200);
        $this->recordCapture('putPassengerPassword', $respPutPassword);

        // ---------------------------------------------------------------------
        // 8. POST /auth/password/forgot (postPassengerPasswordForgot, 202)
        // ---------------------------------------------------------------------
        $bootstrapForgot = $this->bootstrapAnonymous();
        $respForgot = $this->withHttps($bootstrapForgot['ip'])
            ->withHeaders($this->authHeaders($bootstrapForgot['csrfToken'], $bootstrapForgot['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/password/forgot', [
                'email' => $email,
            ]);

        $respForgot->assertStatus(202);
        $this->recordCapture('postPassengerPasswordForgot', $respForgot);

        $resetProof = DB::table('user_password_resets')->where('user_id', $userId)->where('state', 'issued')->latest('issued_at')->first();
        $this->assertNotNull($resetProof);
        $outboxReset = DB::table('security_dispatch_outbox')->where('user_reset_id', $resetProof->id)->latest('id')->first();
        $this->assertNotNull($outboxReset);
        $this->trackedOutboxIds[] = (string) $outboxReset->id;

        // ---------------------------------------------------------------------
        // 9. POST /auth/password/reset (postPassengerPasswordReset, 200)
        // ---------------------------------------------------------------------
        $payloadResetJson = $encrypter->decrypt($outboxReset->encrypted_payload);
        $outboxResetPayload = OutboxPayload::fromJson($payloadResetJson);
        $rawResetToken = $outboxResetPayload->getTokenOrCode();

        $bootstrapReset = $this->bootstrapAnonymous();
        $respReset = $this->withHttps($bootstrapReset['ip'])
            ->withHeaders($this->authHeaders($bootstrapReset['csrfToken'], $bootstrapReset['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/password/reset', [
                'email' => $email,
                'token' => $rawResetToken,
                'password' => $finalPassword,
            ]);

        $respReset->assertStatus(200);
        $this->recordCapture('postPassengerPasswordReset', $respReset);

        // ---------------------------------------------------------------------
        // 10. POST /auth/logout (postPassengerLogout, 200)
        // ---------------------------------------------------------------------
        // Log in with the newly reset password to obtain an active session for clean logout
        $bootstrapLogin3 = $this->bootstrapAnonymous();
        $respLogin3 = $this->withHttps($bootstrapLogin3['ip'])
            ->withHeaders($this->authHeaders($bootstrapLogin3['csrfToken'], $bootstrapLogin3['cookie'], 'http://localhost:3000'))
            ->postJson('/api/v1/auth/login', [
                'email' => $email,
                'password' => $finalPassword,
            ]);
        $respLogin3->assertStatus(200);

        $session3Cookie = null;
        foreach ($respLogin3->headers->getCookies() as $c) {
            if ($c->getName() === CookieSecurity::COOKIE_PASSENGER) {
                $session3Cookie = $c->getValue();
                break;
            }
        }
        $this->assertNotNull($session3Cookie);
        $context3 = $sessionStore->read($session3Cookie);
        $this->assertNotNull($context3);
        $this->trackedSessionIds[] = $context3->sessionId;
        $session3Csrf = $context3->getCsrfToken();

        $this->flushHeaders();
        $respLogout = $this->withHttps($bootstrapLogin3['ip'])
            ->withHeaders($this->authHeaders($session3Csrf, $session3Cookie, 'http://localhost:3000'))
            ->bodyless('POST', '/api/v1/auth/logout');

        $respLogout->assertStatus(200);
        $this->recordCapture('postPassengerLogout', $respLogout);

        // ---------------------------------------------------------------------
        // Final assertions & persistence
        // ---------------------------------------------------------------------
        $this->assertCount(10, $this->capturedResponses);

        $expectedOps = [
            'postPassengerRegister',
            'postPassengerLogin',
            'postPassengerLogout',
            'postPassengerPasswordForgot',
            'postPassengerPasswordReset',
            'postPassengerEmailVerify',
            'postPassengerEmailResend',
            'getPassengerSessions',
            'deletePassengerSession',
            'putPassengerPassword',
        ];

        foreach ($expectedOps as $expectedOp) {
            $this->assertArrayHasKey($expectedOp, $this->capturedResponses);
        }

        $this->persistCaptures();
    }
}
