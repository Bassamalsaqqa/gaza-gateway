<?php
declare(strict_types=1);
// Isolated actual-middleware unit gate: no application boot, database or network.
require $argv[1] . '/vendor/autoload.php';
require __DIR__ . '/../../backend/app/Http/Middleware/StrictHostGuard.php';
$settings = [];
function config(string $key, mixed $default = null): mixed { global $settings; return $settings[$key] ?? $default; }
function response(): object { return new class { public function json(array $data, int $status, array $headers = []): Illuminate\Http\JsonResponse { return new Illuminate\Http\JsonResponse($data, $status, $headers); } }; }
$cases = [
 ['staging', true, 'staging.gazaairport.com', 'staging.gazaairport.com', 200],
 ['production', true, 'www.gazaairport.com', 'www.gazaairport.com', 200],
 ['staging', true, 'staging.gazaairport.com', '', 200],
 ['staging', true, 'staging.gazaairport.com', 'evil.example', 400],
 ['staging', true, 'staging.gazaairport.com', 'evil.example, staging.gazaairport.com', 400],
 ['staging', true, 'evil.example', 'evil.example', 400],
 ['staging', true, 'staging.gazaairport.com', 'staging.gazaairport.com:443', 400],
 ['staging', false, 'staging.gazaairport.com', 'staging.gazaairport.com', 400],
 ['testing', true, 'staging.gazaairport.com', 'staging.gazaairport.com', 400],
];
foreach ($cases as $i => [$env, $enabled, $host, $forward, $expected]) {
 $settings = ['app.env'=>$env, 'foundation-services.shared_hosting_enabled'=>$enabled, 'app.allowed_hosts'=>[$env==='production'?'www.gazaairport.com':'staging.gazaairport.com']];
 $r = Illuminate\Http\Request::create('https://'.$host.'/api/v1/health');
 $r->headers->set('X-Forwarded-Host', $forward);
 $r->attributes->set('request_id','2e654d37-e3db-45cf-99ad-6bd6f1cb799b');
 $response = (new App\Http\Middleware\StrictHostGuard)->handle($r, fn()=>new Symfony\Component\HttpFoundation\Response('ok',200));
 if ($response->getStatusCode() !== $expected) throw new RuntimeException('Host header case '.($i+1).' failed');
 if ($expected===400 && json_decode($response->getContent(),true)['error']['code']!=='bad_request') throw new RuntimeException('Noncanonical rejection');
}
echo 'PASS: '.count($cases)." actual host-middleware cases; no forwarded authority trusted.\n";
