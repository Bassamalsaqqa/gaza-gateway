<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityProtocol;

use Tests\TestCase;

final class BrowserCorsHeaderTest extends TestCase
{
    public function test_exact_client_cache_header_is_allowed_without_accepting_arbitrary_headers(): void
    {
        config(['cors.allowed_origins' => ['https://127.0.0.1:10001']]);
        $server = ['HTTPS' => 'on', 'HTTP_HOST' => '127.0.0.1:18090',
            'HTTP_ORIGIN' => 'https://127.0.0.1:10001', 'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST'];
        $response = $this->call('OPTIONS', '/api/v1/auth/register', [], [], [], $server + [
            'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'cache-control,content-type,x-csrf-token,x-request-id',
        ]);
        $response->assertStatus(204);
        $this->assertSame('', $response->getContent());
        $response->assertHeader('Access-Control-Allow-Origin', 'https://127.0.0.1:10001');
        $response->assertHeader('Access-Control-Allow-Credentials', 'true');
        $response->assertHeader('Cache-Control', 'no-store, private');
        $this->assertStringContainsString('Cache-Control', $response->headers->get('Access-Control-Allow-Headers'));
        $this->call('OPTIONS', '/api/v1/auth/register', [], [], [], $server + [
            'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'cache-control,x-unknown-secret',
        ])->assertStatus(403)->assertJsonPath('error.message', 'Forbidden.');
    }
}
