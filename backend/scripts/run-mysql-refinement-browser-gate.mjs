import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import https from "node:https";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const run=crypto.randomBytes(12).toString("hex"), name="gaza_mysql_browser_"+run;
const output=path.join(root,"scratch",name), source=path.join(output,"source");fs.mkdirSync(source,{recursive:true});
const vendor=process.env.REFERENCE_GATE_VENDOR??"C:/Users/bassa/Documents/GazaAirPort/gaza-gateway/scratch/google-worker-workspaces/r_e294627e23ce528c7631aff3/phase13b_passenger_http01_v2_20261010/worktree/backend/vendor";
const api="https://127.0.0.1:18446/api/v1", origin="https://127.0.0.1:5186";
const slice=process.env.BATCH_BROWSER_SLICE??'refinement';
if(!['auth','identity','joined','refinement'].includes(slice))throw Error('Unsupported bounded browser slice.');
const env={...process.env,APP_KEY:"base64:"+crypto.randomBytes(32).toString("base64"),GUEST_OTP_PEPPER_BASE64:crypto.randomBytes(32).toString("base64")};
const commands=[],hashes=[];let web=false,pg=false,network=false,vite,sink,server,proxy,passed=false,failure=null,head=null;
function command(label,args,input){const r=spawnSync(args[0],args.slice(1),{cwd:root,env,encoding:"utf8",input,timeout:180000,maxBuffer:8*1024*1024});fs.writeFileSync(path.join(output,label+".log"),(r.stdout??"")+(r.stderr??""));commands.push({label,exitCode:r.status});if(r.status!==0)throw new Error(label+" failed");console.log("PASS "+label);return r.stdout;}
const docker=(label,args,input)=>command(label,["docker",...args],input);
const exec=(label,args,input)=>docker(label,["exec",...(input ? ["-i"] : []),name+"_web",...args],input);
function probe(url,timeout=2000){return new Promise(resolve=>{const req=https.get(url,{rejectUnauthorized:false,timeout},res=>{let body="";res.on("data",bytes=>{if(body.length<2048)body+=bytes.toString();});res.on("end",()=>{if(res.statusCode!==200)fs.writeFileSync(path.join(output,"probe-failure.json"),JSON.stringify({url,status:res.statusCode,body}));resolve(res.statusCode);});});req.on("error",e=>{fs.writeFileSync(path.join(output,"probe-error.txt"),e.message);resolve(0);});req.on("timeout",()=>req.destroy());});}
try {
 head=command("head",["git","rev-parse","HEAD"]).trim();
 const dirty=command("uncommitted-inventory",["git","status","--porcelain"]).trim();fs.writeFileSync(path.join(output,"execution-limitations.json"),JSON.stringify({dirty:!!dirty,gitStatus:dirty,cleanHeadExecution:!dirty,scope:"local engineering only"},null,2));
 for(const file of command("inventory",["git","ls-files","--cached","--others","--exclude-standard","backend","docs/backend","src","scripts/lib","tests/mvp"]).trim().split(/\r?\n/)) {
  if(!file || !fs.statSync(path.join(root,file)).isFile())continue;
  const bytes=fs.readFileSync(path.join(root,file));hashes.push({file,sha256:crypto.createHash("sha256").update(bytes).digest("hex")});
  if(file.startsWith("backend/")){const target=path.join(source,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
 }
 fs.writeFileSync(path.join(output,"unused-historical-caddy.txt"),"{\n admin off\n auto_https disable_redirects\n default_sni 127.0.0.1\n skip_install_trust\n}\nlocalhost:10000, 127.0.0.1:10000 {\n tls internal\n root * /var/www/html/public\n php_server\n}\n");
 docker("network",["network","create",name]);network=true;
 docker("mysql",["run","-d","--rm","--name",name+"_mysql","--network",name,"--network-alias","mysql","--tmpfs","/var/lib/mysql","-e","MYSQL_ROOT_PASSWORD=gaza_local_disposable_only","-e","MYSQL_DATABASE=gaza_gateway_mysql_test","-e","MYSQL_USER=gaza_app_user","-e","MYSQL_PASSWORD=gaza_app_local_pass","mysql:8.4","--skip-log-bin","--character-set-server=utf8mb4","--collation-server=utf8mb4_0900_bin"]);pg=true;
 let ready=false;for(let i=0;i<40;i++){const r=spawnSync("docker",["exec",name+"_mysql","mysql","-ugaza_app_user","-pgaza_app_local_pass","gaza_gateway_mysql_test","-N","-e","SELECT 1"],{encoding:"utf8",timeout:3000});if(r.status===0){ready=true;break;}await new Promise(r=>setTimeout(r,500));}if(!ready)throw Error("Disposable MySQL unavailable");
 docker("web",["run","-d","--rm","--name",name+"_web","--network",name,"--network-alias","mailpit","-p","127.0.0.1:18096:8000","-w","/var/www/html","-e","APP_KEY","-e","GUEST_OTP_PEPPER_BASE64","-e","APP_ENV=testing","-e","APP_DEBUG=false","-e","APP_URL="+origin,"-e","APP_ALLOWED_HOSTS=127.0.0.1,localhost,127.0.0.1:18446","-e","CORS_ALLOWED_ORIGINS="+origin,"-e","DB_CONNECTION=mysql_test","-e","DB_HOST=mysql","-e","DB_PORT=3306","-e","DB_TEST_DATABASE=gaza_gateway_mysql_test","-e","DB_USERNAME=gaza_app_user","-e","DB_PASSWORD=gaza_app_local_pass","-e","CACHE_STORE=database","-e","QUEUE_CONNECTION=database","-e","LOG_CHANNEL=stderr","-e","PHP_CLI_SERVER_WORKERS=4","-e","IDENTITY_MIGRATION_DISPOSABLE_INSTANCE=1","-e","MVP_BROWSER_GATE_OWNED=1","-e","RESERVATIONS_ENABLED=true","-e","RESERVATIONS_AUTHORITY=resolver","-e","MVP_MAIL_ENABLED=true","-e","MVP_IDENTITY_SMTP_ENABLED=true","-e","MVP_SITE_ENABLED=true","gaza-gateway-mail-test:php84","sleep","900"]);web=true;
 docker("copy-source",["cp",path.join(source,"backend")+"/.",name+"_web:/var/www/html"]);
 docker("copy-vendor",["cp",vendor,name+"_web:/var/www/html/vendor"]);
 const router=path.join(output,"test-router.php");fs.writeFileSync(router,"<?php \$_SERVER['HTTPS']='on'; \$_SERVER['SERVER_PORT']='443'; require '/var/www/html/public/index.php';".replaceAll("\\$","$"));
 docker("copy-router",["cp",router,name+"_web:/tmp/test-router.php"]);
 exec("migrate",["php","artisan","migrate","--no-interaction"]);
 exec("test-certificate",["openssl","req","-x509","-newkey","rsa:2048","-nodes","-keyout","/tmp/key.pem","-out","/tmp/cert.pem","-days","1","-subj","/CN=127.0.0.1","-addext","subjectAltName=IP:127.0.0.1"]);
 docker("cert",["cp",name+"_web:/tmp/cert.pem",path.join(output,"cert.pem")]);docker("key",["cp",name+"_web:/tmp/key.pem",path.join(output,"key.pem")]);
 const serverLog=fs.openSync(path.join(output,"web-server.log"),"w");server=spawn("docker",["exec",name+"_web","php","-S","0.0.0.0:8000","/tmp/test-router.php"],{stdio:["ignore",serverLog,serverLog]});
 proxy=https.createServer({maxConnections:64,key:fs.readFileSync(path.join(output,"key.pem")),cert:fs.readFileSync(path.join(output,"cert.pem"))},(req,res)=>{const forward=http.request({hostname:"127.0.0.1",port:18096,method:req.method,path:req.url,headers:{...req.headers,connection:"close"},agent:false,timeout:20000},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});forward.on("error",()=>{if(!res.headersSent)res.writeHead(502);res.end();});forward.on("timeout",()=>forward.destroy());req.pipe(forward);});await new Promise((resolve,reject)=>{proxy.once("error",reject);proxy.listen(18446,"127.0.0.1",resolve);});
 for(let i=0;i<30;i++){if(await probe(api+"/health")===200)break;await new Promise(r=>setTimeout(r,500));}if(await probe(api+"/health")!==200)throw Error("TLS local API unavailable");
 const key=crypto.randomBytes(20);let bits="",secret="";for(const byte of key)bits+=byte.toString(2).padStart(8,"0");for(let i=0;i<bits.length;i+=5)secret+="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[parseInt(bits.slice(i,i+5).padEnd(5,"0"),2)];
 const fixture={username:"mvp-owner",password:crypto.randomBytes(20).toString("hex"),secret,emails:["passenger-one@example.test","passenger-two@example.test"]};
 exec("seed",["php","tests/Fixtures/MvpMail/browser-seed.php"],JSON.stringify(fixture));
 const config=path.join(output,"vite.config.mjs");fs.writeFileSync(config,`import original from ${JSON.stringify(pathToFileURL(path.join(root,"vite.config.ts")).href)};\nimport fs from 'node:fs';\nexport default async env => {const c=typeof original==='function'?await original(env):original;return {...c,server:{...c.server,host:'127.0.0.1',port:5186,strictPort:true,https:{key:fs.readFileSync(${JSON.stringify(path.join(output,"key.pem"))}),cert:fs.readFileSync(${JSON.stringify(path.join(output,"cert.pem"))})}}};};\n`.replaceAll("\\n","\n"));
 const viteBin=path.join(path.dirname(createRequire(import.meta.url).resolve("vite/package.json")),"bin/vite.js");
 const viteLog=fs.openSync(path.join(output,"vite.log"),"w");vite=spawn(process.execPath,[viteBin,"--config",config],{cwd:root,env:{...env,VITE_IDENTITY_UI_MODE:"backend",VITE_IDENTITY_NONPRODUCTION_OPT_IN:"true",VITE_IDENTITY_API_BASE_URL:api},stdio:["ignore",viteLog,viteLog]});
 for(let i=0;i<60;i++){if(await probe(origin,120000)===200)break;await new Promise(r=>setTimeout(r,500));}
 if(await probe(origin)!==200)throw new Error("HTTPS frontend unavailable");
 const {runJoinedWorkflow}=await import("../../tests/mvp/refinement-workflow.mjs");
 await runJoinedWorkflow({origin,api,output,fixture,key,exec,readProofToken(email, purpose){
   // Synthetic capture secrets stay in process memory: never persist stdout or credentials in gate logs.
   if (!/^[a-z0-9.-]+@example\.test$/.test(email) || !["verification","reset"].includes(purpose)) throw new Error("Unowned proof specimen.");
   const code=String.raw`$email=$argv[1]; $purpose=$argv[2]; foreach(glob('/tmp/mvp-smtp-sink/*.eml')?:[] as $file) { $body=quoted_printable_decode(file_get_contents($file)); if(!str_contains($body,$email))continue; $subject=$purpose==='verification'?'Verify your email address':'Reset your account password'; if(!str_contains($body,$subject))continue; if(preg_match('/(?<![A-Za-z0-9_-])([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/',$body,$match)) {echo $match[1]; exit(0);} } exit(1);`;
   const r=spawnSync("docker",["exec",name+"_web","php","-r",code,email,purpose],{encoding:"utf8",timeout:5000,maxBuffer:4096});
   if(r.status!==0 || !/^[A-Za-z0-9_-]{43}$/.test(r.stdout))throw new Error("Synthetic proof capture missing.");
   return r.stdout;
 },readProofCode(email){if(!/^[a-z0-9.-]+@example\.test$/.test(email))throw Error("Foreign proof recipient");const script=String.raw`$email=$argv[1];foreach(glob("/tmp/mvp-smtp-sink/*.eml")?:[] as $file){$body=quoted_printable_decode(file_get_contents($file));if(str_contains($body,$email)&&preg_match("/6-digit code: ([0-9]{6})/",$body,$m)){echo $m[1];exit(0);}}exit(1);`;const r=spawnSync("docker",["exec",name+"_web","php","-r",script,email],{encoding:"utf8",timeout:5000,maxBuffer:4096});if(r.status!==0||!/^\d{6}$/.test(r.stdout))throw Error("Synthetic code absent");return r.stdout;},slice,startSink(){if(sink)return;sink=spawn("docker",["exec",name+"_web","php","tests/Fixtures/MvpMail/smtp-sink.php"],{stdio:"ignore"});}});
 const observed=JSON.parse(fs.readFileSync(path.join(output,'browser-checks.json'),'utf8')).checks;
 const needed=slice==='auth'?['staff UI password and TOTP sign-in']
   :slice==='identity'?['fragment link cleared before explicit POST verification in an independent browser','passenger UI recovery consumes SMTP proof and new password signs in']
   :['real Admin preview publishes 20 destinations and 14 recurring schedules; fresh homepage console finds service','passenger cancellation releases authoritative seat','two real browser principals race for one seat: exactly one 201 and one 409','Arabic ticket renders to a real browser PDF'];
 if(needed.some(check=>!observed.includes(check)))throw Error('Incomplete browser slice: required workflow checks are absent.');
 passed=true;
 fs.writeFileSync(path.join(output,"source.json"),JSON.stringify({head,hashes},null,2));
} catch(e){failure=e.message;process.exitCode=1;console.error(failure);} finally {
 if(vite) {vite.kill();await new Promise(r=>setTimeout(r,300));}
 if(sink)sink.kill();
 if(server)server.kill();
 if(proxy){proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));}
 let cleaned=true;
 for(const [exists,suffix] of [[web,"_web"],[pg,"_mysql"]])if(exists){const r=spawnSync("docker",["rm","-f",name+suffix],{timeout:15000});if(r.status!==0)cleaned=false;}
 if(network && spawnSync("docker",["network","rm",name],{timeout:15000}).status!==0)cleaned=false;
 if(!cleaned){passed=false;failure=failure??'Owned browser resource cleanup failed';process.exitCode=1;}
 for(const file of ["key.pem","cert.pem"])if(fs.existsSync(path.join(output,file)))fs.unlinkSync(path.join(output,file));
 fs.writeFileSync(path.join(output,"receipt.json"),JSON.stringify({run,head,slice,passed,failure,commands,hashes,resourcesCleaned:cleaned,scope:"Local PHP/MySQL TLS test proxy and synthetic SMTP only; no HostPapa/mailbox acceptance"},null,2));
 console.log("Evidence: "+output);
}
