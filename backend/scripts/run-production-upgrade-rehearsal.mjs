import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const kit=path.resolve(root,process.argv[2]??'');
const old=path.resolve(root,process.argv[3]??'');
if(!process.argv[2]||!process.argv[3])throw Error('Usage: node backend/scripts/run-production-upgrade-rehearsal.mjs <owned-new-kit> <retained-7a8-package>');
const workspace=path.resolve(root,'../..');
for(const p of [kit,old])if(!p.startsWith(workspace+path.sep)||fs.lstatSync(p).isSymbolicLink())throw Error('Packages must be real owned workspace directories.');
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const manifest=JSON.parse(fs.readFileSync(path.join(kit,'upgrade-manifest.json'),'utf8'));
if(manifest.target_release.source_sha!==head)throw Error('Exact source head required.');
const id='upgrade_rehearsal_'+crypto.randomBytes(6).toString('hex');
const output=path.join(root,'scratch',id);fs.mkdirSync(output,{recursive:true});
const password=crypto.randomBytes(24).toString('hex'),db=id+'_mysql',app=id+'_php';
const logs=[];let pass=false,failure;
const run=(label,args,timeout=30000,env={})=>{
 const r=spawnSync('docker',args,{cwd:root,encoding:'utf8',timeout,maxBuffer:1024*1024,env:{...process.env,...env}});
 fs.writeFileSync(path.join(output,label+'.log'),(r.stdout??'')+(r.stderr??''));logs.push({label,status:r.status,error:r.error?.code});
 if(r.error||r.status!==0)throw Error('Failed '+label+'; retained sanitized test logs.');return r.stdout;
};
try {
 run('mysql',['run','-d','--name',db,'--tmpfs','/var/lib/mysql','-e','MYSQL_ROOT_PASSWORD','mysql:8.4','--skip-log-bin'],30000,{MYSQL_ROOT_PASSWORD:password});
 let ready=false;for(let n=0;n<50;n++){
  const r=spawnSync('docker',['exec','-e','MYSQL_PWD',db,'mysql','-uroot','-N','-e','SELECT 1'],{encoding:'utf8',timeout:3000,env:{...process.env,MYSQL_PWD:password}});
  if(r.status===0){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,500));
 }if(!ready)throw Error('Disposable MySQL unavailable.');
 const result=run('runtime',['run','--rm','--name',app,'--network','container:'+db,'--tmpfs','/home/gaza5045',
  '-e','HOME=/home/gaza5045','-e','HOSTPAPA_HOME=/home/gaza5045','-e','HOSTPAPA_UPGRADE_REHEARSAL=owned-tmpfs','-e','UPGRADE_TEST_ROOT_PASSWORD',
  '-v',root+':/source:ro','-v',old+':/old-package:ro','-v',kit+':/candidate-kit:ro',
  'gaza-gateway-upgrade-test:php84','php','/source/tests/tooling/production-upgrade-runtime.php'],480000,{UPGRADE_TEST_ROOT_PASSWORD:password});
 if(!result.includes('PROBES='))throw Error('Complete rehearsal receipt absent.');pass=true;console.log(result);
}catch(e){failure=e.message;console.error(failure);}finally{
 for(const name of [app,db]){
  const state=spawnSync('docker',['inspect',name],{encoding:'utf8',timeout:10000});
  if(state.status===0 && spawnSync('docker',['rm','-f',name],{encoding:'utf8',timeout:20000}).status!==0){pass=false;failure='Owned cleanup failed';}
 }
 const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const files=['backend/scripts/run-production-upgrade-rehearsal.mjs','tests/tooling/production-upgrade-runtime.php','backend/scripts/hostpapa-install.php','tools/hostpapa-release/production-upgrade/production-upgrade-runner.php'];
 const receipt={source_sha:head,passed:pass,failure,kit_manifest_sha256:hash(path.join(kit,'upgrade-manifest.json')),logs,
  source_hashes:Object.fromEntries(files.map(f=>[f,hash(path.join(root,f))])),limits:'Disposable portless local PHP/MySQL and synthetic accounts only; no HostPapa execution, cron policy or mailbox certification.'};
 fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log('Retained evidence: '+output);if(!pass)process.exitCode=1;
}
