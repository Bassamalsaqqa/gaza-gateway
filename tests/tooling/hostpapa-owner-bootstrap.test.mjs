import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('owner bootstrap binds release/database and rejects privilege or SMTP authority injection', () => {
  const result = spawnSync(process.env.HOSTPAPA_PHP_BIN ?? 'php', ['-r', String.raw`
    require 'backend/app/Deployment/OwnerBootstrapConfiguration.php';
    $sha = str_repeat('a', 40);
    $input = ['purpose' => 'first_staff_invitation', 'releaseSha' => $sha, 'database' => 'isolated_test',
      'admin' => ['username' => 'owner', 'email' => 'owner@example.test', 'fullNameEn' => 'Owner', 'fullNameAr' => 'Owner'],
      'smtp' => ['host' => 'mail.gazaairport.com', 'port' => 465, 'tls' => 'tls',
        'username' => 'notifications@gazaairport.com', 'password' => 'SYNTHETIC_SECRET_SENTINEL',
        'senderName' => 'Gaza Gateway', 'senderEmail' => 'notifications@gazaairport.com', 'replyTo' => '']];
    App\Deployment\OwnerBootstrapConfiguration::validate($input, $sha, 'isolated_test');
    $probes = [];
    $bad=$input; $bad['releaseSha']=str_repeat('b',40); $probes[]=$bad;
    $bad=$input; $bad['database']='other'; $probes[]=$bad;
    $bad=$input; $bad['admin']['role']='admin'; $probes[]=$bad;
    $bad=$input; $bad['admin']['password']='FORBIDDEN_PASSWORD'; $probes[]=$bad;
    $bad=$input; $bad['admin']['email']='OWNER@example.test'; $probes[]=$bad;
    $bad=$input; $bad['smtp']['host']='127.0.0.1'; $probes[]=$bad;
    $bad=$input; $bad['smtp']['tls']='none'; $probes[]=$bad;
    $bad=$input; $bad['smtp']['port']='465'; $probes[]=$bad;
    $bad=$input; $bad['smtp']['senderEmail']='other@example.test'; $probes[]=$bad;
    $bad=$input; $bad['smtp']['username']='other@example.test'; $probes[]=$bad;
    $bad=$input; $bad['smtp']['password']=''; $probes[]=$bad;
    $bad=$input; $bad['smtp']['replyTo']="owner@example.test\r\nBcc: other@example.test"; $probes[]=$bad;
    foreach($probes as $bad) {
      try { App\Deployment\OwnerBootstrapConfiguration::validate($bad,$sha,'isolated_test'); exit(1); }
      catch(InvalidArgumentException $e) {
        if($e->getMessage() !== 'Owner bootstrap configuration refused.') exit(2);
      }
    }
    echo '12 owner bootstrap negative controls passed';
  `], { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '12 owner bootstrap negative controls passed');
  assert.doesNotMatch(result.stdout + result.stderr, /SYNTHETIC_SECRET_SENTINEL|FORBIDDEN_PASSWORD/);
});
