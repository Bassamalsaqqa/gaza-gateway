<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityPassenger;

use App\Identity\Dispatch\OutboxService;
use App\Identity\Passenger\PassengerAuthCoordinator;
use App\Identity\Passenger\Exceptions\ProofConsumptionFailedException;
use App\Identity\Proofs\ProofPurpose;
use App\Identity\Proofs\ProofService;
use App\Identity\Tokens\OpaqueToken;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class PassengerVerificationCodeTest extends TestCase
{
    private function issue(): array
    {
        $id = (string) Str::uuid();
        $email = 'code-' . $id . '@example.test';
        DB::table('users')->insert(['id' => $id, 'email' => $email, 'status' => 'unverified', 'credential_epoch' => 1,
            'password_hash' => 'unused-fixture', 'created_at' => DB::raw('UTC_TIMESTAMP(6)'), 'updated_at' => DB::raw('UTC_TIMESTAMP(6)')]);
        return $this->dispatch($id, $email);
    }

    private function dispatch(string $id, string $email): array
    {
        $receipt = app(ProofService::class)->reissue(ProofPurpose::PassengerEmailVerification, $id);
        $outbox = app(OutboxService::class)->enqueueProof($receipt);
        $row = DB::table('security_dispatch_outbox')->where('id', $outbox)->first();
        $payload = json_decode(app('encrypter')->decrypt($row->encrypted_payload), true, 512, JSON_THROW_ON_ERROR);
        preg_match('/6-digit code: ([0-9]{6})/', $payload['body'], $match);
        $this->assertCount(2, $match);
        $this->assertStringContainsString('/verify-email#token=' . $receipt->getRawToken(), $payload['body']);
        $this->assertStringContainsString('/ar/verify-email#token=', $payload['body']);
        $this->assertStringNotContainsString($match[1], json_encode((array) DB::table('user_email_verification_codes')->where('verification_id', $receipt->proofId)->first()));
        return ['id' => $id, 'email' => $email, 'token' => $receipt->getRawToken(), 'code' => $match[1], 'proof' => $receipt->proofId];
    }

    private function verify(array $payload): bool
    {
        return app(PassengerAuthCoordinator::class)->emailVerify($payload, '198.18.20.1', (string) Str::uuid());
    }

    private function denied(array $payload): void
    {
        try { $this->verify($payload); $this->fail('Invalid verification was accepted.'); }
        catch (ProofConsumptionFailedException) { $this->addToAssertionCount(1); }
    }

    public function test_code_consumes_link_and_link_consumes_code(): void
    {
        $a = $this->issue();
        $this->assertTrue($this->verify(['email' => $a['email'], 'code' => $a['code']]));
        $this->denied(['token' => $a['token']]);
        $b = $this->issue();
        $this->assertTrue($this->verify(['token' => $b['token']]));
        $this->denied(['email' => $b['email'], 'code' => $b['code']]);
        $this->assertSame('active', DB::table('users')->where('id', $a['id'])->value('status'));
    }

    public function test_five_failures_are_durable_and_exhaust_both_methods(): void
    {
        $a = $this->issue();
        $wrong = $a['code'] === '000000' ? '000001' : '000000';
        for ($i = 0; $i < 5; $i++) $this->denied(['email' => $a['email'], 'code' => $wrong]);
        $this->assertSame(5, DB::table('user_email_verification_codes')->where('verification_id', $a['proof'])->value('failed_attempts'));
        $this->assertSame('exhausted', DB::table('user_email_verifications')->where('id', $a['proof'])->value('state'));
        $this->denied(['email' => $a['email'], 'code' => $a['code']]);
        $this->denied(['token' => $a['token']]);
    }

    public function test_resend_revokes_old_link_and_code(): void
    {
        $a = $this->issue();
        $b = $this->dispatch($a['id'], $a['email']);
        $this->denied(['token' => $a['token']]);
        // Compare stored digests: a chance code collision cannot make this assertion flaky.
        $this->assertSame('revoked', DB::table('user_email_verifications')->where('id', $a['proof'])->value('state'));
        $this->assertTrue($this->verify(['email' => $b['email'], 'code' => $b['code']]));
    }

    public function test_expiry_epoch_and_foreign_email_deny_code(): void
    {
        $a = $this->issue();
        DB::table('user_email_verifications')->where('id', $a['proof'])->update(['expires_at' => DB::raw('UTC_TIMESTAMP(6)')]);
        $this->denied(['email' => $a['email'], 'code' => $a['code']]);
        $b = $this->issue();
        DB::table('users')->where('id', $b['id'])->update(['credential_epoch' => 2]);
        $this->denied(['email' => $b['email'], 'code' => $b['code']]);
        $this->denied(['email' => 'unknown@example.test', 'code' => $b['code']]);
    }

    public function test_real_http_code_and_closed_command_errors(): void
    {
        $a = $this->issue();
        $this->withServerVariables(['HTTPS' => 'on', 'SERVER_PORT' => 443, 'HTTP_HOST' => '127.0.0.1', 'REMOTE_ADDR' => '198.18.20.2']);
        $bootstrap = $this->get('/api/v1/auth/csrf')->assertOk();
        $cookie = null;
        foreach ($bootstrap->headers->getCookies() as $candidate) if ($candidate->getName() === 'gza_session') $cookie = $candidate->getValue();
        $this->assertNotNull($cookie);
        $headers = ['Origin' => 'https://127.0.0.1:5173', 'Cookie' => 'gza_session=' . $cookie, 'X-CSRF-TOKEN' => $bootstrap->json('csrfToken')];
        $this->postJson('/api/v1/auth/email/verify', ['email' => $a['email'], 'code' => $a['code'], 'token' => $a['token']], $headers)->assertStatus(422);
        $this->postJson('/api/v1/auth/email/verify', ['email' => $a['email'], 'code' => $a['code']], $headers)->assertOk()->assertJsonPath('data.verified', true);
        $this->postJson('/api/v1/auth/email/verify', ['token' => $a['token']], $headers)->assertStatus(422);
    }

    public function test_concurrent_link_and_code_have_exactly_one_success(): void
    {
        $a = $this->issue(); $workers = [];
        $env = array_merge(getenv(), ['APP_ENV' => 'testing', 'DB_CONNECTION' => 'mysql_test', 'APP_KEY' => config('app.key')]);
        DB::beginTransaction();
        DB::table('users')->where('id', $a['id'])->lockForUpdate()->first();
        try {
            foreach ([['token' => $a['token']], ['email' => $a['email'], 'code' => $a['code']]] as $payload) {
                $pipes = [];
                $process = proc_open([PHP_BINARY, base_path('tests/Fixtures/IdentityLifecycle/EmailCodeWorker.php')],
                    [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, base_path(), $env);
                $this->assertIsResource($process);
                fwrite($pipes[0], json_encode($payload, JSON_THROW_ON_ERROR) . "\n"); fclose($pipes[0]);
                stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false);
                $workers[] = ['process' => $process, 'pipes' => $pipes, 'result' => ''];
            }
            // Both independently booted clients contend for the same principal lock.
            usleep(200000);
            DB::commit();
            $deadline = microtime(true) + 8;
            do {
                $running = false;
                foreach ($workers as &$worker) {
                    $worker['result'] .= stream_get_contents($worker['pipes'][1]);
                    stream_get_contents($worker['pipes'][2]);
                    $running = proc_get_status($worker['process'])['running'] || $running;
                }
                unset($worker);
                if ($running) usleep(10000);
            } while ($running && microtime(true) < $deadline);
            $this->assertFalse($running, 'Bounded verification workers did not finish.');
            $results = array_map(fn($worker) => trim($worker['result']), $workers); sort($results);
            $this->assertSame(['accepted', 'denied'], $results);
            $this->assertSame('consumed', DB::table('user_email_verifications')->where('id', $a['proof'])->value('state'));
        } finally {
            if (DB::transactionLevel() > 0) DB::rollBack();
            foreach ($workers as $worker) {
                if (proc_get_status($worker['process'])['running']) proc_terminate($worker['process'], 9);
                fclose($worker['pipes'][1]); fclose($worker['pipes'][2]); proc_close($worker['process']);
            }
        }
    }
}
