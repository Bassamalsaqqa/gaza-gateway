import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const scopes=["backend/app","backend/config","backend/database/migrations"];
const patterns={
  rawSql:/\b(?:statement|unprepared|selectOne|select|whereRaw|orderByRaw|havingRaw|raw)\s*\(/,
  pgClock:/clock_timestamp|statement_timestamp|transaction_timestamp/,
  pgLocks:/pg_advisory|SET LOCAL|statement_timeout|idle_in_transaction_session_timeout/,
  pgTypes:/\b(?:JSONB|TIMESTAMPTZ|BIGSERIAL|SERIAL|UUID)\b|TEXT\[\]/i,
  pgFunctions:/jsonb_|num_nonnulls|btrim\(|convert_to\(|encode\(|decode\(|date_trunc\(|extract\(|make_interval\(/i,
  pgConstraints:/DEFERRABLE|CONSTRAINT TRIGGER|LANGUAGE plpgsql|BEFORE TRUNCATE|IS DISTINCT FROM|WHERE .*(?:IS NOT NULL|type\s*=)/i,
  pgSyntax:/ON CONFLICT|\bRETURNING\b|::(?:jsonb|text|uuid|integer|bigint|timestamptz)|COLLATE "C"|interval '/i,
  pgErrors:/23505|23514|23503|40P01|55P03|57014|40001/,
  transaction:/lockForUpdate|SKIP LOCKED|FOR UPDATE|DB::transaction|->transaction\(/,
};
function list(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  const full=path.join(dir,e.name);if(e.isSymbolicLink())throw new Error("Source symlink is unsupported");
  return e.isDirectory()?list(full):e.isFile()&&e.name.endsWith(".php")?[full]:[];
});}
const files=scopes.flatMap(scope=>list(path.join(root,scope))).sort();
const entries=[],hashes=[];
for(const full of files){const bytes=fs.readFileSync(full),relative=path.relative(root,full).replaceAll("\\","/");
  hashes.push({file:relative,sha256:crypto.createHash("sha256").update(bytes).digest("hex")});
  bytes.toString("utf8").split(/\r?\n/).forEach((line,index)=>{
    const kinds=Object.entries(patterns).filter(([,pattern])=>pattern.test(line)).map(([name])=>name);
    if(kinds.length)entries.push({file:relative,line:index+1,kinds});
  });
}
const receipt={version:1,head:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),
  scope:scopes,limitations:"Lexical inventory includes comments and SQL fragments; it does not certify semantic completeness or port correctness. No source excerpts or credentials are emitted.",
  migrationFiles:hashes.filter(x=>x.file.startsWith("backend/database/migrations/")).map(x=>x.file),hashes,entries};
const output=path.join(root,"scratch","hostpapa-sql-inventory");fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,"inventory.json"),JSON.stringify(receipt,null,2)+"\n");
console.log(`${files.length} PHP source files; ${receipt.migrationFiles.length} migrations; ${entries.length} inventory locations. Evidence: ${output}`);
