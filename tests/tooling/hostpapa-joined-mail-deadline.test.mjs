import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('SMTP preserves the actual cron timeout realm and the parent alarm after an inner timeout', () => {
 const app=path.resolve('backend/app');
 const probe=path.resolve('backend/tests/SharedHostingRuntime/probe-joined-mail-deadline.php');
 const r=spawnSync('docker',['run','--rm','--network','none','--mount',`type=bind,source=${app},target=/source,readonly`,'--mount',`type=bind,source=${probe},target=/probe.php,readonly`,process.env.HOSTPAPA_TEST_PHP_IMAGE ?? 'gaza-gateway-mail-test:php84','php','/probe.php'],{encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
 assert.equal(r.status,0,r.stderr+r.stdout);
 const result=JSON.parse(r.stdout);
 assert.deepEqual(result.failures,[]);
 assert.ok(result.parentRemaining>0 && result.parentRemaining<=7);
});
