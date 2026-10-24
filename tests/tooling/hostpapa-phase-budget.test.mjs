import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const source=fs.readFileSync(new URL('../../tools/hostpapa-release/production-upgrade/production-upgrade-runner.php',import.meta.url),'utf8');

test('cron exclusion outlasts all post-acquisition bounded upgrade phases and cleanup',()=>{
  const phases=Object.fromEntries([...source.matchAll(/setPhaseBudget\('([^']+)', (\d+),/g)].map(x=>[x[1],Number(x[2])]));
  for(const phase of ['maintenance','backup','install','post_verify']) assert.ok(phases[phase]>0);
  const total=['maintenance','backup','install','post_verify'].reduce((n,p)=>n+phases[p],0);
  const leases=[...source.matchAll(/Cache::lock\('shared_hosting:cron:lease', (\d+),/g)].map(x=>Number(x[1]));
  assert.equal(leases.length,2);
  for(const lease of leases) assert.ok(lease>=total+120,'Lease must cover serial phases plus cleanup/acquisition margin');
  assert.ok(phases.install>390,'Historical timeout must not recur during immutable package verification/copy');
});

test('actual phase-budget helper refuses execution when POSIX deadline support is unavailable',()=>{
  const definitions=source.slice(source.indexOf('const ALLOWED_REASON_CODES = ['),source.indexOf('function safePath'));
  const helper=source.slice(source.indexOf('function setPhaseBudget('),source.indexOf('function handleDeadlineExceeded('));
  const php=definitions+helper+`try {setPhaseBudget('install',900,'fixture');exit(9);} catch (UpgradeDiagnosticException $e) {echo $e->getReasonCode();}`;
  const result=spawnSync('php',['-d','disable_functions=pcntl_alarm,pcntl_signal,pcntl_async_signals','-r',php],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,'DEADLINE_UNAVAILABLE');
});
