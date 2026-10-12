import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {ReleaseBuilder} from '../../tools/hostpapa-release/src/ReleaseBuilder.mjs';
import {validateReleaseManifest} from '../../tools/hostpapa-release/src/ReleaseManifest.mjs';
import {generateHtaccess} from '../../tools/hostpapa-release/src/HtaccessTemplate.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const manifest = () => ({schema_version:'1.0',release_id:'rel_safe',source_sha:'a'.repeat(40),built_at:new Date().toISOString(),is_dirty:false,classification:'UNREVIEWED_RELEASE_CANDIDATE',platform_requirements:{php:'^8.4',laravel:'^13.0',locked_production_packages_count:1},summary:{public_file_count:1,public_bytes:1,private_file_count:1,private_bytes:1,control_file_count:5},public_files:{'index.html':{size:1,sha256:'a'.repeat(64)}},private_files:{'backend/artisan':{size:1,sha256:'a'.repeat(64)}},installer:{'installer/hostpapa-install.php':{size:1,sha256:'a'.repeat(64)}},control_files:Object.fromEntries(['SOURCE_COMMIT.txt','RELEASE_ID.txt','STATUS.txt','manifest-public.txt','manifest-private.txt'].map(name=>[name,{size:1,sha256:'a'.repeat(64)}]))});
test('closed manifest rejects malformed identities, unbound controls, unsafe paths and invented acceptance',()=>{
 assert.equal(validateReleaseManifest(manifest()).valid,true);
 for (const mutate of [m=>m.extra=true,m=>m.public_files=null,m=>m.public_files['../secret']={size:1,sha256:'a'.repeat(64)},m=>m.private_files['C:secret']={size:1,sha256:'a'.repeat(64)},m=>m.installer={},m=>delete m.control_files['STATUS.txt'],m=>m.public_files['index.html'].size=-1,m=>m.public_files['index.html'].sha256='bad',m=>m.is_dirty='false',m=>m.classification='ACCEPTED_PRODUCTION_CANDIDATE']) {
  const m=manifest();mutate(m);assert.equal(validateReleaseManifest(m).valid,false);
 }
});
test('real receipt gate rejects absent flags, stale source, wrong origin and tampered artifact bytes',async()=>{
 const dir=await mkdtemp(path.join(root,'scratch','release-receipt-probe-'));
 try {
  await mkdir(path.join(dir,'client'));
  await writeFile(path.join(dir,'client/index.html'),'exact bytes');
  const hash=createHash('sha256').update('exact bytes').digest('hex');
  const receipt={schema_version:1,source_sha:'a'.repeat(40),origin:'https://www.gazaairport.com',flags:{HOSTPAPA_SHARED_ENABLED:true,VITE_IDENTITY_UI_MODE:'backend',VITE_IDENTITY_PRODUCTION_OPT_IN:'true',VITE_IDENTITY_NONPRODUCTION_OPT_IN:'false',VITE_IDENTITY_API_BASE_URL:'https://www.gazaairport.com/api/v1'},artifact_hashes:{'index.html':hash}};
  const builder=new ReleaseBuilder({root,clientDist:path.join(dir,'client')});
  await writeFile(path.join(dir,'client/build-receipt.json'),JSON.stringify(receipt));
  assert.equal(await builder.resolveClientDist('a'.repeat(40)),path.join(dir,'client'));
  for (const mutate of [r=>r.source_sha='b'.repeat(40),r=>delete r.flags.VITE_IDENTITY_PRODUCTION_OPT_IN,r=>r.flags.VITE_IDENTITY_UI_MODE='mock',r=>r.origin='https://api.gazaairport.com',r=>r.artifact_hashes['index.html']='b'.repeat(64),r=>r.artifact_hashes['../index.html']=hash]) {
   const r=structuredClone(receipt);mutate(r);await writeFile(path.join(dir,'client/build-receipt.json'),JSON.stringify(r));
   await assert.rejects(builder.resolveClientDist('a'.repeat(40)));
  }
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('output boundaries reject source-tree deletion and another repository client',async()=>{
 assert.throws(()=>new ReleaseBuilder({root,outputDir:root}));
 assert.throws(()=>new ReleaseBuilder({root,outputDir:path.join(root,'scratch')}));
 await assert.rejects(new ReleaseBuilder({root,clientDist:path.dirname(root)}).resolveClientDist('a'.repeat(40)));
});
test('generated Apache rules preserve inherited Directory Privacy and canonical TLS redirect',()=>{
 const text=generateHtaccess();
 assert.ok(text.includes('https://www.gazaairport.com%{REQUEST_URI}'));
 assert.ok(!text.includes('Require all granted'));
 assert.ok(text.indexOf('^/api')<text.indexOf('Existing regular files'));
});
test('packaged normative inputs are real source authorities',async()=>{
 const contract=JSON.parse(await readFile(path.join(root,'docs/backend/openapi.v1.json'),'utf8'));
 assert.equal(contract.openapi,'3.1.0');
 const commands=JSON.parse(await readFile(path.join(root,'backend/app/Identity/Contracts/identity-command-contracts.v1.json'),'utf8'));
 assert.ok(commands && typeof commands==='object');
});
