import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const output=path.join(root,"scratch","gaza_mvp_final_"+crypto.randomBytes(12).toString("hex"));fs.mkdirSync(output,{recursive:true});
const commands=[],children=[],hashes=[];
let head=null,passed=false,failure=null;
function command(label,program,args,extra={}) {
  const result=spawnSync(program,args,{cwd:root,env:{...process.env,...extra},encoding:"utf8",timeout:900000,maxBuffer:16*1024*1024});
  const bytes=(result.stdout??"")+(result.stderr??"");fs.writeFileSync(path.join(output,label+".log"),bytes);
  commands.push({label,exitCode:result.status,logSha256:crypto.createHash("sha256").update(bytes).digest("hex")});
  if(result.error || result.status!==0)throw new Error(label+" failed; inspect its preserved log");
  console.log("PASS "+label);return result.stdout??"";
}
function assertClean(label) {
  const status=command(label,"git",["status","--porcelain","--untracked-files=all","--","backend","src","scripts","tests","docs","package.json","package-lock.json","vite.config.ts","vite.config.hostpapa.ts"]);
  if(status.trim())throw new Error("Final gate requires clean committed product source.");
}
function gate(label,script,extra={}) {
  const bytes=command(label,process.execPath,[script],extra);
  const evidence=bytes.match(/Evidence: ([^\r\n]+)/g)?.at(-1)?.slice("Evidence: ".length);
  if(!evidence)throw new Error(label+" omitted its receipt path");
  const resolved=path.resolve(evidence);
  if(!resolved.startsWith(path.join(root,"scratch")+path.sep))throw new Error("Unowned child evidence path");
  const file=path.join(resolved,"receipt.json"),receipt=JSON.parse(fs.readFileSync(file));
  if(receipt.passed!==true || receipt.resourcesCleaned!==true || receipt.head!==head || receipt.testFilter)throw new Error(label+" failed receipt/SHA/filter/cleanup validation");
  children.push({label,receipt:file,sha256:crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")});
}
try {
  for(const key of ["IDENTITY_GATE_TEST_FILTER","EDITORIAL_GATE_TEST_FILTER","GALLERY_GATE_TEST_FILTER","RESERVATION_GATE_TEST_FILTER","MVP_BROWSER_GATE_SLICE"]) {
    if(process.env[key])throw new Error("Unset partial-gate configuration: "+key);
  }
  head=command("head","git",["rev-parse","HEAD"]).trim();assertClean("source-clean-before");
  // Do not mistake booking SMTP for completed verification/recovery mail.
  if(!fs.readFileSync(path.join(root,"backend/config/mvp-mail.php"),"utf8").includes("MVP_IDENTITY_SMTP_ENABLED"))throw new Error("Account SMTP integration is still pending; final MVP gate cannot certify completion.");
  const files=command("source-inventory","git",["ls-files","--","backend","src","scripts","tests","docs","package.json","package-lock.json"]).trim().split(/\r?\n/);
  for(const file of files)hashes.push({file,sha256:crypto.createHash("sha256").update(fs.readFileSync(path.join(root,file))).digest("hex")});
  command("contracts",process.execPath,["scripts/validate-backend-contracts.mjs"]);
  command("generated-identity",process.execPath,["scripts/generate-identity-api-types.mjs","--check"]);
  command("identity-mvp-node",process.execPath,["scripts/test-unit.mjs","api"]);
  for(const domain of ["fleet","network","schedules","meals"])gate("reference-"+domain,"backend/scripts/run-reference-"+domain+"-gate.mjs");
  gate("editorial","backend/scripts/run-editorial-gate.mjs");gate("gallery","backend/scripts/run-gallery-gate.mjs");
  gate("reservations-mail-site","backend/scripts/run-mvp-reservation-gate.mjs");
  gate("joined-browser","backend/scripts/run-mvp-browser-gate.mjs",{MVP_BROWSER_GATE_BACKUP_RESTORE:"1"});
  gate("account-mail-browser","backend/scripts/run-mvp-browser-gate.mjs",{MVP_BROWSER_GATE_SLICE:"identity",MVP_BROWSER_GATE_BACKUP_RESTORE:"0"});
  gate("gallery-editor-browser","backend/scripts/run-mvp-browser-gate.mjs",{MVP_BROWSER_GATE_SLICE:"publication",MVP_BROWSER_GATE_BACKUP_RESTORE:"0"});
  gate("cms-settings-editor-browser","backend/scripts/run-mvp-browser-gate.mjs",{MVP_BROWSER_GATE_SLICE:"cms",MVP_BROWSER_GATE_BACKUP_RESTORE:"0"});
  const vite=path.join(root,"node_modules/vite/bin/vite.js");
  const parentVite=path.resolve(root,"../../node_modules/vite/bin/vite.js");
  command("static-build",process.execPath,[fs.existsSync(vite)?vite:parentVite,"build","--config","vite.config.hostpapa.ts"]);
  command("whitespace","git",["diff","--check"]);assertClean("source-clean-after");
  if(command("head-after","git",["rev-parse","HEAD"]).trim()!==head)throw new Error("Source HEAD changed during certification");
  passed=true;
} catch(error) {failure=error.message;process.exitCode=1;console.error(failure);}
finally {
  fs.writeFileSync(path.join(output,"receipt.json"),JSON.stringify({head,passed,failure,commands,children,hashes,
    scope:"MVP local engineering only; no remote/provider-delivery/production acceptance; no full legacy identity/frontend suites"},null,2)+"\n");
  console.log("Evidence: "+output);
}
