import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

test('private owner input rejects public, aliased, oversized and non-private files on Linux', () => {
  const app = path.resolve('backend/app');
  const script = String.raw`<?php
    require '/source/SharedHosting/SharedHostingProfile.php';
    require '/source/Deployment/PrivateOwnerInput.php';
    use App\Deployment\PrivateOwnerInput;
    $root = '/tmp/owner-input-'.bin2hex(random_bytes(8));
    mkdir($root, 0700);
    mkdir($root.'/private', 0700);
    $file = $root.'/private/input.json';
    file_put_contents($file, '{"purpose":"synthetic-test"}');
    chmod($file, 0600);
    if (PrivateOwnerInput::read($file) !== ['purpose'=>'synthetic-test']) exit(1);
    $rejected = 0;
    $deny = function($path) use (&$rejected) {
      try { PrivateOwnerInput::read($path); }
      catch (Throwable) { $rejected++; return; }
      throw new RuntimeException('Unexpected acceptance.');
    };
    symlink($root.'/private', $root.'/alias');
    $deny($root.'/alias/input.json');
    symlink($file, $root.'/link.json');
    $deny($root.'/link.json');
    mkdir($root.'/public_html', 0700);
    file_put_contents($root.'/public_html/input.json', '{}');
    chmod($root.'/public_html/input.json', 0600);
    $deny($root.'/public_html/input.json');
    chmod($file, 0644); $deny($file); chmod($file, 0600);
    foreach ([str_repeat('x',16385), 'null', '[]', 'false', '{'] as $bytes) {
      file_put_contents($file,$bytes); $deny($file);
    }
    $deny($root.'/missing.json');
    $deny('relative/input.json');
    $deny($root.'/private/../private/input.json');
    if ($rejected !== 12) exit(2);
    echo '12 private-input negative controls passed';
  `;
  const result = spawnSync('docker', ['run', '--rm', '--network', 'none', '-i',
    '--mount', `type=bind,source=${app},target=/source,readonly`,
    process.env.HOSTPAPA_TEST_PHP_IMAGE ?? 'gaza-gateway-mail-test:php84', 'php'],
  { input: script, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '12 private-input negative controls passed');
});
