#!/usr/bin/env node
// Local disposable Docker is test tooling only, never the HostPapa runtime.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ReleaseVerifier} from '../../tools/hostpapa-release/src/ReleaseVerifier.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const input=process.argv[2];
if(!input){console.log('Usage: node backend/scripts/run-hostpapa-release-gate.mjs <owned-release-package>');process.exit(1);}
const pkg=path.resolve(root,input);
if(!pkg.startsWith(path.join(root,'scratch')+path.sep))throw new Error('Gate package must be inside owned workspace scratch.');
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',timeout:15000}).trim();
const verification=await new ReleaseVerifier({releaseDir:pkg,strict:true,expectedSha:sha}).verify();
if(!verification.success)throw new Error('Package verification failed: '+verification.failures.join('; '));
const runId='h3_release_'+crypto.randomBytes(6).toString('hex');
const dir=path.join(root,'scratch',runId);fs.mkdirSync(dir,{recursive:true});
const db=runId+'_mysql',app=runId+'_php';
const rootPassword=crypto.randomBytes(32).toString('hex');
const logs=[];let result;let outcome='FAIL';let failure;
const run=(args,timeout=30000,extraEnv={})=>{
 const r=spawnSync('docker',args,{cwd:root,encoding:'utf8',timeout,env:{...process.env,...extraEnv},maxBuffer:4*1024*1024});
 logs.push({command:['docker',...args],status:r.status,stdout:r.stdout||'',stderr:r.stderr||'',error:r.error?.code});
 if(r.error||r.status!==0)throw new Error('Local Docker release gate failed; inspect retained private logs.');
 return r.stdout.trim();
};
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
try{
 const archive=process.argv[3] ? path.resolve(root,process.argv[3]) : path.join(dir,'candidate.tar');
 if(!archive.startsWith(path.join(root,'scratch')+path.sep) || fs.lstatSync(path.dirname(archive)).isSymbolicLink())throw new Error('Archive must be owned scratch.');
 if(!process.argv[3]) {
 const tar=spawnSync('tar',['-cf',archive,'-C',pkg,'.'],{cwd:root,encoding:'utf8',timeout:240000});
 logs.push({command:['tar','-cf','<owned-candidate-archive>','-C','<verified-package>','.'],status:tar.status,stdout:tar.stdout||'',stderr:tar.stderr||''});
 if(tar.status!==0||tar.error)throw new Error('Candidate archive failed.');
 }
 if(!fs.statSync(archive).isFile() || fs.lstatSync(archive).isSymbolicLink())throw new Error('Invalid owned archive.');
 run(['run','-d','--name',db,'--tmpfs','/var/lib/mysql','-e','MYSQL_ROOT_PASSWORD','-e','MYSQL_ROOT_HOST=%','mysql:8.4','--skip-log-bin'],30000,{MYSQL_ROOT_PASSWORD:rootPassword});
 let ready=false;
 for(let i=0;i<40;i++){
  const r=spawnSync('docker',['exec','-e','MYSQL_PWD',db,'mysql','--protocol=tcp','-h127.0.0.1','--connect-timeout=1','-uroot','-N','-e','SELECT 1'],{encoding:'utf8',timeout:5000,env:{...process.env,MYSQL_PWD:rootPassword}});
  if(r.status===0){ready=true;break;}
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 if(!ready)throw new Error('Disposable MySQL readiness failed.');
 result=run(['run','--rm','--name',app,'--network','container:'+db,'--cap-drop','DAC_OVERRIDE','--cap-drop','DAC_READ_SEARCH','--tmpfs','/home/owner','-e','HOSTPAPA_HOME=/home/owner','-e','HOME=/home/owner','-e','H3_DISPOSABLE_RELEASE_GATE=true','-e','H3_EXPECTED_SHA='+sha,'-e','H3_EXPECTED_MANIFEST='+hash(path.join(pkg,'release-manifest.json')),'-e','H3_ROOT_PASSWORD','-v',archive+':/candidate.tar:ro','-v',root+':/source:ro','gaza-gateway-mail-test:php84','sh','-c','mkdir -p /home/owner/package && tar -xf /candidate.tar -C /home/owner/package && php /source/tests/tooling/hostpapa-release-runtime.php'],180000,{H3_ROOT_PASSWORD:rootPassword});
 if(!result.includes('PROBE_COUNT=18'))throw new Error('Incomplete runtime probe count.');
 // Real dump/restore into a second disposable schema. Explicitly rewrite only this owned schema qualifier.
 const dump=run(['exec','-e','MYSQL_PWD',db,'mysqldump','-uroot','--single-transaction','--triggers','--routines','gaza_h3_disposable'],30000,{MYSQL_PWD:rootPassword});
 const restored=dump.replaceAll('`gaza_h3_disposable`.','`gaza_h3_restore`.');
 const dumpPath=path.join(dir,'disposable-backup.sql');fs.writeFileSync(dumpPath,restored,{mode:0o600});
 run(['cp',dumpPath,db+':/tmp/h3-backup.sql']);
 run(['exec','-e','MYSQL_PWD',db,'mysql','-uroot','-e',"CREATE DATABASE gaza_h3_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin; GRANT ALL PRIVILEGES ON gaza_h3_restore.* TO 'gaza_h3_ddl'@'%';"],30000,{MYSQL_PWD:rootPassword});
 run(['exec','-e','MYSQL_PWD',db,'sh','-c','mysql -uroot gaza_h3_restore < /tmp/h3-backup.sql'],30000,{MYSQL_PWD:rootPassword});
 const counts=run(['exec','-e','MYSQL_PWD',db,'mysql','-uroot','-N','-e',"SELECT COUNT(*) FROM gaza_h3_restore.migrations; SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='gaza_h3_restore' AND TABLE_TYPE='BASE TABLE'; SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='gaza_h3_restore' AND TABLE_TYPE='BASE TABLE' AND ENGINE<>'InnoDB'; SELECT COUNT(*) FROM gaza_h3_restore.routes;"],30000,{MYSQL_PWD:rootPassword});
 if(counts.replace(/\r/g,'').trim()!=='18\n78\n0\n0')throw new Error('Restored schema/table/engine/view evidence failed.');
 outcome='PASS';
}catch(error){failure=error.message;}
finally{
 for(const name of [app,db]){
  const inspect=spawnSync('docker',['inspect',name],{encoding:'utf8',timeout:10000});
  if(inspect.status===0){const clean=spawnSync('docker',['rm','-f',name],{encoding:'utf8',timeout:20000});if(clean.status!==0){outcome='FAIL';failure='Owned cleanup failed';}}
  else if(!/No such (object|container)/i.test(inspect.stderr||'')){outcome='FAIL';failure='Owned cleanup state unverified';}
 }
 const logPath=path.join(dir,'commands.json');fs.writeFileSync(logPath,JSON.stringify(logs,null,2)+'\n');
 const sourceFiles=['backend/scripts/hostpapa-install.php','backend/scripts/run-hostpapa-release-gate.mjs','tests/tooling/hostpapa-release-runtime.php'];
 const receipt={schema:'hostpapa-local-release-gate.v1',runId,outcome,source_sha:sha,package_source_sha:verification.summary.sourceSha,package_manifest_sha256:hash(path.join(pkg,'release-manifest.json')),test_mysql_log_bin:'OFF (--skip-log-bin, matching H1; actual HostPapa trigger privileges unverified)',source_hashes:Object.fromEntries(sourceFiles.map(file=>[file,hash(path.join(root,file))])),logs_sha256:hash(logPath),runtime_probes:outcome==='PASS'?18:undefined,restored_migrations:outcome==='PASS'?18:undefined,restored_innodb_tables:outcome==='PASS'?78:undefined,failure,limitations:['Disposable local PHP 8.4/MySQL only; not HostPapa execution','No live SMTP or joined browser acceptance','No remote grants, quota, cadence or mailbox certification']};
 fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(`${outcome}: ${runId}; retained evidence: ${path.relative(root,dir)}`);
 if(result)console.log(result);
 if(outcome!=='PASS')process.exitCode=1;
}
