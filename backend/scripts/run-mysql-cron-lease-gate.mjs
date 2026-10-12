import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const source = path.resolve(process.argv[2] ?? '.');
if (!process.env.IDENTITY_GATE_VENDOR) throw Error('Set IDENTITY_GATE_VENDOR to the locked Composer vendor directory.');
const vendor = path.resolve(process.env.IDENTITY_GATE_VENDOR);
if (!fs.existsSync(path.join(vendor, 'autoload.php'))) throw Error('Locked vendor autoload.php is missing.');
const out = path.resolve('scratch', `mysql-cron-probe-${crypto.randomBytes(5).toString('hex')}`);
fs.mkdirSync(out, {recursive:true});
const id = path.basename(out);
const db = `${id}-db`, php = `${id}-php`, net = `${id}-net`;
const password = crypto.randomBytes(24).toString('hex');
const rootPassword = crypto.randomBytes(24).toString('hex');
const commands=[];
const hashes={};
for(const relative of ['backend/app/SharedHosting/SharedHostingCronLease.php','backend/tests/SharedHostingRuntime/probe-mysql-cron-lease.php']) {
 hashes[relative]=crypto.createHash('sha256').update(fs.readFileSync(path.join(source,relative))).digest('hex');
}
const receipt={scope:'Cron DatabaseLock only; not application or migration acceptance', source, hashes, commands, status:'FAIL', cleanup:[]};
function run(label,args,timeout=120000){
 const r=spawnSync('docker',args,{encoding:'utf8',timeout,maxBuffer:4*1024*1024});
 const log=((r.stdout??'')+(r.stderr??'')).replaceAll(password,'[REDACTED]').replaceAll(rootPassword,'[REDACTED]');
 fs.writeFileSync(path.join(out,`${label}.log`),log);
 commands.push({label,exit:r.status,sha256:crypto.createHash('sha256').update(log).digest('hex')});
 if(r.status!==0) throw new Error(`${label} failed: ${log.slice(-2200)}`);
 console.log(`PASS ${label}`); return log;
}
try{
 run('network',['network','create',net]);
 run('mysql-start',['run','-d','--rm','--name',db,'--network',net,'--network-alias','mysql','-e',`MYSQL_ROOT_PASSWORD=${rootPassword}`,'-e','MYSQL_DATABASE=gaza_gateway_mysql_test','-e','MYSQL_USER=gaza_app_user','-e',`MYSQL_PASSWORD=${password}`,'mysql:8.4','--skip-log-bin']);
 let ready=false;
 for(let n=0;n<40;n++){
  const r=spawnSync('docker',['exec','-e',`MYSQL_PWD=${password}`,db,'mysql','-ugaza_app_user','gaza_gateway_mysql_test','-e','SELECT 1'],{encoding:'utf8',timeout:5000});
  if(r.status===0){ready=true;break;}
  await new Promise(r=>setTimeout(r,1000));
 }
 if(!ready) throw new Error('Fresh MySQL did not become ready.');
 run('php-start',['run','-d','--rm','--name',php,'--network',net,'-w','/workspace/backend','-e','APP_ENV=testing','-e','APP_DEBUG=false','-e',`APP_KEY=base64:${crypto.randomBytes(32).toString('base64')}`,'-e','APP_URL=https://127.0.0.1:18090','-e','DB_CONNECTION=mysql_test','-e','DB_HOST=mysql','-e','DB_PORT=3306','-e','DB_TEST_DATABASE=gaza_gateway_mysql_test','-e','DB_USERNAME=gaza_app_user','-e',`DB_PASSWORD=${password}`,'-e','CACHE_STORE=database','-e','QUEUE_CONNECTION=database','gaza-gateway-mail-test:php84','sleep','600']);
 run('copy-source',['cp',path.join(source,'backend')+'/.',php+':/workspace/backend'],180000);
 run('copy-vendor',['cp',vendor+'/.',php+':/workspace/backend/vendor'],180000);
 run('cron-lease',['exec',php,'php','tests/SharedHostingRuntime/probe-mysql-cron-lease.php']);
 receipt.status='PASS';
}catch(e){receipt.error=e.message; console.error(e.message);process.exitCode=1;}
finally{
 for(const [kind,name] of [['container',php],['container',db],['network',net]]){
  const args=kind==='container'?['rm','-f',name]:['network','rm',name];
  spawnSync('docker',args,{encoding:'utf8',timeout:15000});
  const r=spawnSync('docker',kind==='container'?['inspect',name]:['network','inspect',name],{encoding:'utf8',timeout:10000});
  const absent=r.status!==0 && /no such (container|object|network)|network .+ not found/i.test((r.stdout??'')+(r.stderr??''));
  receipt.cleanup.push({kind,name,verifiedAbsent:absent});
  if(!absent){receipt.status='FAIL';process.exitCode=1;}
 }
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(`Receipt ${out}: ${receipt.status}`);
}
