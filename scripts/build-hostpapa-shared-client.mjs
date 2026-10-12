import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { identityUiClientConfig } from '../src/lib/api/identity-ui-config.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/build-hostpapa-shared-client.mjs --origin=https://www.gazaairport.com');
  console.log('Build only: no upload, branch deployment, or runtime activation. Requires clean committed product source.');
  process.exit(0);
}
if (args.length !== 1 || !args[0].startsWith('--origin=')) throw new Error('Exactly one approved --origin is required.');
const origin = args[0].slice('--origin='.length);
if (!['https://www.gazaairport.com', 'https://gazaairport.com'].includes(origin)) {
  throw new Error('Shared release requires the exact approved HTTPS www/apex origin.');
}
const flags = {
  HOSTPAPA_SHARED_ENABLED: true,
  VITE_IDENTITY_UI_MODE: 'backend',
  VITE_IDENTITY_PRODUCTION_OPT_IN: 'true',
  VITE_IDENTITY_NONPRODUCTION_OPT_IN: 'false',
  VITE_IDENTITY_API_BASE_URL: origin + '/api/v1',
};
identityUiClientConfig({ ...flags, MODE: 'production', PROD: true, DEV: false, NODE_ENV: 'production' });
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 15000 }).trim();
const isDirty = () => {
  // Windows route generation can change only stat/line-ending metadata while preserving the Git blob.
  // Compare canonical tracked bytes (including the index) and still reject every untracked product file.
  try { git(['diff', '--exit-code', 'HEAD', '--']); } catch { return true; }
  return Boolean(git(['ls-files', '--others', '--exclude-standard']));
};
const sha = git(['rev-parse', 'HEAD']);
if (!/^[a-f0-9]{40}$/.test(sha) || isDirty()) {
  throw new Error('An exact-source release build requires clean committed product source.');
}
const client = path.join(root, 'dist/client');
const receiptPath = path.join(client, 'build-receipt.json');
// Remove only the old receipt; failed builds can never retain a previous passing receipt.
if (fs.existsSync(receiptPath)) fs.unlinkSync(receiptPath);
const env = { ...process.env, ...Object.fromEntries(Object.entries(flags).map(([key, value]) => [key, String(value)])) };
const executable = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm';
const buildArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run build:hostpapa'] : ['run', 'build:hostpapa'];
const result = spawnSync(executable, buildArgs, { cwd: root, env, stdio: 'inherit', timeout: 600000 });
if (result.error || result.status !== 0) throw new Error('HostPapa shared client build failed; no receipt was issued.');
if (git(['rev-parse', 'HEAD']) !== sha || isDirty()) {
  throw new Error('Build changed product source or HEAD; review/commit the generated changes and rebuild before issuing a receipt.');
}
const artifacts = {};
const walk = (directory, prefix = '') => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix + entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Client artifact symlinks are forbidden.');
    if (entry.isDirectory()) walk(absolute, relative + '/');
    else if (entry.isFile() && relative !== 'build-receipt.json') {
      artifacts[relative] = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
    } else if (!entry.isFile()) throw new Error('Unsupported client artifact type.');
  }
};
walk(client);
if (!artifacts['index.html']) throw new Error('Missing built client entrypoint.');
fs.writeFileSync(receiptPath, JSON.stringify({ schema_version: 1, source_sha: sha,
  built_at: new Date().toISOString(), origin, flags, artifact_hashes: artifacts }, null, 2) + '\n');
console.log(`Exact-source shared client receipt: ${sha}, ${Object.keys(artifacts).length} artifacts. No deployment performed.`);
