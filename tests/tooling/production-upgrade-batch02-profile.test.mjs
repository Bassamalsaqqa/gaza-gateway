import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {BASELINE_PROFILES,renderRunnerForProfile} from '../../tools/hostpapa-release/production-upgrade/ProductionUpgradeKitBuilder.mjs';

test('Batch02 exact installed and target pins',()=>{
 const p=BASELINE_PROFILES.installed_55_23;
 assert.equal(p.source_sha,'55dfa645e59e66c2da03744673fbb212a5077d51');
 assert.equal(p.manifest_sha256,'c9275e79156c4e5c08e267c429fd9034b337e69e71bafad7dc6e021609c89420');
 assert.equal(p.migration_count,23);assert.equal(p.target_migration_count,25);
 const php=renderRunnerForProfile('installed_55_23');
 assert.match(php,/const INSTALLED_MIGRATIONS = 23;/);assert.match(php,/const TARGET_MIGRATIONS = 25;/);
 assert.match(php,/gaza-upgrade-package-55-batch02/);
 assert.match(php,/ksort\(\$installedMigHashes\);/);assert.match(php,/ksort\(\$candidateMigHashes\);/);
 assert.match(php,/Expanded or modified migration schema requires compatible forward repair/);
 assert.match(php,/assertRollbackMigrationLedger/);
});
test('production CLI rejects obsolete or omitted profiles',()=>{
 for(const p of ['', 'installed_697_23','installed_965_21','b3_21']){
 const r=spawnSync(process.execPath,['scripts/prepare-hostpapa-production-upgrade.mjs',...(p?['--profile='+p]:[])],{encoding:'utf8'});
 assert.notEqual(r.status,0);assert.match(r.stderr,/installed_55_23 required/);
 }
});
test('rollback map order regression uses exact generated comparison block',()=>{
 const php=renderRunnerForProfile('installed_697_23');
 const start=php.indexOf('        ksort($installedMigHashes);');
 const end=php.indexOf('// Verify compatibility predicate',start);
 assert.ok(start>0&&end>start);
 const block=php.slice(start,end);
 fs.mkdirSync('scratch',{recursive:true});
 fs.writeFileSync('scratch/rollback-map-order-test.php',`<?php
$installedMigHashes=['b'=>'2','a'=>'1'];$candidateMigHashes=['a'=>'1','b'=>'2'];
${block}
echo "ORDER_PASS\n";
$candidateMigHashes['a']='changed';try {
${block}
throw new Exception('Accepted changed bytes');}catch(RuntimeException $e){echo "HASH_REJECT_PASS\n";}
`);
});
