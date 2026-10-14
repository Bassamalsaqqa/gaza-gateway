import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function docker(args, timeout=30000) {
  const r=spawnSync("docker", args,{encoding:"utf8",timeout});
  assert.equal(r.status,0,r.stderr || r.stdout); return r.stdout;
}
test("actual rollback helpers serialize with InnoDB and reject obsolete waiting writers", {timeout:90000}, () => {
  const vendor=process.env.IDENTITY_GATE_VENDOR ?? path.join(root,"backend/vendor");
  assert.ok(fs.existsSync(path.join(vendor,"autoload.php")),"Existing Laravel vendor required at backend/vendor or IDENTITY_GATE_VENDOR; no install/build");
  for(const image of ["mysql:8.4","gaza-gateway-mysql-test:php84"]) docker(["image","inspect",image,"--format","{{.Id}}"]);
  const suffix=crypto.randomBytes(5).toString("hex"), network="gg_rollback_"+suffix, mysql="gg_mysql_"+suffix;
  let madeNetwork=false, madeMysql=false;
  const receipt={passed:false,scope:"Actual named rollback helpers and writer guard; not full installer/release rehearsal."};
  try {
    docker(["network","create",network]);madeNetwork=true;
    docker(["run","-d","--pull=never","--name",mysql,"--network",network,"-e","MYSQL_ALLOW_EMPTY_PASSWORD=yes","-e","MYSQL_DATABASE=rollback_test","mysql:8.4"]);madeMysql=true;
    let ready=false;
    for(let i=0;i<100;i++){
      const r=spawnSync("docker",["exec",mysql,"mysqladmin","--protocol=tcp","--host=127.0.0.1","ping","--silent"],{encoding:"utf8",timeout:2000});
      if(r.status===0){ready=true;break;} Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,200);
    }
    assert.ok(ready,"Owned MySQL ready");
    receipt.output=docker(["run","--rm","--pull=never","--network",network,"-e","MYSQL_HOST="+mysql,"-v",root+":/source:ro","-v",path.resolve(vendor)+":/vendor:ro","gaza-gateway-mysql-test:php84","php","/source/tests/tooling/fixtures/rollback-serialization.php"],40000);
    assert.match(receipt.output,/SERIALIZATION_PROOF_PASS/);receipt.passed=true;
  } finally {
    if(madeMysql) docker(["rm","-f",mysql]);
    if(madeNetwork) docker(["network","rm",network]);
    const dir=path.join(root,"scratch/rollback-reviewed-evidence");fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,"receipt.json"),JSON.stringify(receipt,null,2)+"\n");
  }
});
