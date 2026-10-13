import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ReleaseBuilder} from '../tools/hostpapa-release/src/ReleaseBuilder.mjs';
import {FrontendReleaseBuilder} from '../tools/hostpapa-release/src/FrontendReleaseBuilder.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const options={};
for(const arg of process.argv.slice(2)) {
  if(arg==='--help') {
    console.log('Build only: --mode=full-stack|frontend-only --origin=<approved HTTPS origin> --output-dir=scratch/<new kit> [--vendor-dir=<locked no-dev vendor>] [--backend-sha=<known installed source>]. No deployment or branch updates.');
    process.exit(0);
  }
  const match=/^--(mode|origin|output-dir|vendor-dir|backend-sha)=(.+)$/.exec(arg);
  if(!match||options[match[1]]!==undefined)throw Error('Unknown or duplicate build option.');
  options[match[1]]=match[2];
}
if(!['full-stack','frontend-only'].includes(options.mode)||!options.origin||!options['output-dir'])throw Error('Explicit mode, origin and output-dir are required.');
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:15000}).trim();
if(options.mode==='frontend-only') {
  if(options['vendor-dir']||!/^[a-f0-9]{40}$/.test(options['backend-sha']??''))throw Error('Frontend-only requires an exact backend-sha and no vendor option.');
  // Compatibility is a source fact, not an operator guess: all server authority and
  // normative contract bytes must match the chosen known installed backend source.
  git(['cat-file','-e',options['backend-sha']+'^{commit}']);
  try {git(['diff','--exit-code',options['backend-sha'],'HEAD','--','backend/app','backend/bootstrap','backend/config','backend/database','backend/routes','backend/composer.json','backend/composer.lock','docs/backend']);}
  catch {throw Error('Server authority/contracts differ from the selected backend. Use a full-stack update.');}
} else if(options['backend-sha'])throw Error('Full-stack mode does not accept a separate backend pin.');

execFileSync(process.execPath,[path.join(root,'scripts/build-hostpapa-shared-client.mjs'),'--origin='+options.origin],{cwd:root,stdio:'inherit',timeout:600000});
const builder=options.mode==='full-stack'
  ?new ReleaseBuilder({root,outputDir:options['output-dir'],vendorDir:options['vendor-dir'],clientDist:path.join(root,'dist/client')})
  :new FrontendReleaseBuilder({root,outputDir:options['output-dir'],clientDist:path.join(root,'dist/client'),backendSha:options['backend-sha']});
const result=await builder.build();
if(options.mode==='frontend-only') {
  // This CLI-only operator file stays outside public/; archive checksum verification
  // remains mandatory before execution. There is no executable web installer.
  await fs.copyFile(path.join(root,'tools/hostpapa-release/frontend-deploy.php'),path.join(result.outputDir,'frontend-deploy.php'),constants.COPYFILE_EXCL);
}
const files=options.mode==='frontend-only'?['release-manifest.json','frontend-deploy.php']:['release-manifest.json','installer/hostpapa-install.php'];
const hashes={};for(const file of files)hashes[file]=crypto.createHash('sha256').update(await fs.readFile(path.join(result.outputDir,file))).digest('hex');
// Keep the audit receipt outside the closed package root.
await fs.writeFile(result.outputDir+'.build-receipt.json',JSON.stringify({mode:options.mode,source_sha:git(['rev-parse','HEAD']),compatible_backend_sha:options['backend-sha']??null,origin:options.origin,hashes,classification:'UNREVIEWED_RELEASE_CANDIDATE',deployed:false},null,2)+'\n',{flag:'wx'});
console.log('Prepared '+options.mode+' update at '+result.outputDir+'. No upload, Git deployment or activation performed.');
