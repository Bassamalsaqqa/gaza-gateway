import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Usage: node backend/scripts/run-production-upgrade-rehearsal.mjs <owned-new-kit> <retained-baseline-package> [oldArchive] [kitArchive] [expectedSourceSha]
// Options:
//   --expected-source-sha <sha>  Explicit expected application 40-hex commit SHA
//   --profile <profile>          Target rehearsal profile (b3_21 | 7a8_19 | legacy)
//   --help, -h                   Show help message

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rawArgs = process.argv.slice(2);

if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  console.log(`Usage: node backend/scripts/run-production-upgrade-rehearsal.mjs <owned-new-kit> <retained-baseline-package> [oldArchive] [kitArchive] [expectedSourceSha]

Options:
  --expected-source-sha <sha>  Explicit expected application 40-hex commit SHA
  --profile <profile>          Target rehearsal profile (b3_21 | 7a8_19 | legacy)
  --help, -h                   Show this help message

Positionals:
  1: Candidate kit directory (contains upgrade-manifest.json)
  2: Retained baseline package directory (contains release-manifest.json)
  3: Optional baseline TAR archive in scratch/
  4: Optional candidate kit TAR archive in scratch/
  5: Optional expected application source SHA (40 hex)
`);
  process.exit(0);
}

let namedExpectedSha = null;
let namedProfile = null;
const positionalArgs = [];

for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];
  if (arg.startsWith('--expected-source-sha=')) {
    namedExpectedSha = arg.slice('--expected-source-sha='.length);
  } else if (arg === '--expected-source-sha') {
    i++;
    namedExpectedSha = rawArgs[i] ?? null;
  } else if (arg.startsWith('--profile=')) {
    namedProfile = arg.slice('--profile='.length);
  } else if (arg === '--profile') {
    i++;
    namedProfile = rawArgs[i] ?? null;
  } else if (arg.startsWith('--')) {
    throw Error(`Unknown option '${arg}'. See --help for usage.`);
  } else {
    positionalArgs.push(arg);
  }
}

if (positionalArgs.length < 2 || positionalArgs.length > 5) {
  throw Error('Usage: node backend/scripts/run-production-upgrade-rehearsal.mjs <owned-new-kit> <retained-baseline-package> [oldArchive] [kitArchive] [expectedSourceSha]');
}

const kit = path.resolve(root, positionalArgs[0]);
const old = path.resolve(root, positionalArgs[1]);

let oldArchive = null;
let kitArchive = null;
let positionalExpectedSha = null;

if (positionalArgs.length === 3) {
  if (/^[a-f0-9]{40}$/i.test(positionalArgs[2])) {
    positionalExpectedSha = positionalArgs[2];
  } else {
    throw Error('Supply both retained baseline and candidate test archives when supplying archive arguments.');
  }
} else if (positionalArgs.length >= 4) {
  oldArchive = path.resolve(root, positionalArgs[2]);
  kitArchive = path.resolve(root, positionalArgs[3]);
  for (let pIdx = 4; pIdx < positionalArgs.length; pIdx++) {
    const pArg = positionalArgs[pIdx];
    if (/^[a-f0-9]{40}$/i.test(pArg)) {
      positionalExpectedSha = pArg;
    } else {
      throw Error('The fifth positional argument must be the expected application source SHA.');
    }
  }
}

const explicitExpectedAppSha = namedExpectedSha || positionalExpectedSha;
if (namedExpectedSha && positionalExpectedSha && namedExpectedSha !== positionalExpectedSha) {
  throw Error('Conflicting expected application source SHA arguments.');
}
if (explicitExpectedAppSha && !/^[a-f0-9]{40}$/i.test(explicitExpectedAppSha)) {
  throw Error(`Invalid expected application source SHA format: must be 40 hex characters, got '${explicitExpectedAppSha}'`);
}

const workspace = path.resolve(root, '../..');
for (const p of [kit, old]) {
  if (!p.startsWith(workspace + path.sep) || (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink())) {
    throw Error('Packages must be real owned workspace directories.');
  }
}
for (const p of [oldArchive, kitArchive]) {
  if (p && (!p.startsWith(path.join(root, 'scratch') + path.sep) || !fs.lstatSync(p).isFile() || fs.lstatSync(p).isSymbolicLink())) {
    throw Error('Test archives must be regular files in owned scratch.');
  }
}
if (Boolean(oldArchive) !== Boolean(kitArchive)) {
  throw Error('Supply both retained baseline and candidate test archives.');
}

const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
const toolingIsDirty = Boolean(dirty);

const manifestPath = path.join(kit, 'upgrade-manifest.json');
if (!fs.existsSync(manifestPath)) {
  throw Error(`Candidate kit upgrade-manifest.json not found at ${manifestPath}. Candidate kit must be prepared first.`);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const selectedKitManifestHash = crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');

// Closed reviewed profile definitions
const CLOSED_PROFILES = {
  b3_21: {
    profile: 'b3_21',
    installed_binding: {
      source_sha: 'b3afa9cf08fc746a9ff7e3e9fbee66c38244fb87',
      release_id: 'rel_20261013T204811_b3afa9c_clean',
      manifest_sha256: '2c5f93cd4e1772a018e1f125575acdc8950f9678f879a9039e388186b58f42a0',
      migration_count: 21,
    },
    target_release: {
      source_sha: '96538d9affdc843d08ef3c801f15c7f92dfd46b3',
      release_id: 'rel_20261015T042635_96538d9_clean',
      manifest_sha256: 'fbfc743a37956f138ec1ecffbb9c92305bbbf73bb4f4aca3e6c10899d7fd85ed',
      migration_count: 21,
    },
  },
  '7a8_19': {
    profile: '7a8_19',
    installed_binding: {
      source_sha: '7a8f0fa2f25851c4f75422f86139e0bb020ea4de',
      release_id: 'rel_20261013T082656_7a8f0fa_clean',
      manifest_sha256: 'f4950ad28949c874e8055cabe5af049d4467acee1583a8c916f96bb50c2f1cdf',
      migration_count: 19,
    },
    target_release: {
      migration_count: 21,
    },
  },
};

let resolvedProfile = namedProfile || manifest.profile;
if (['legacy', 'legacy_7a_19'].includes(resolvedProfile)) resolvedProfile = '7a8_19';

if (!resolvedProfile) {
  const bindingSha = manifest.installed_binding?.source_sha;
  if (bindingSha === 'b3afa9cf08fc746a9ff7e3e9fbee66c38244fb87') {
    resolvedProfile = 'b3_21';
  } else if (bindingSha === '7a8f0fa2f25851c4f75422f86139e0bb020ea4de' || !bindingSha) {
    resolvedProfile = '7a8_19';
  }
}

if (!CLOSED_PROFILES[resolvedProfile]) {
  throw Error(`Unknown profile '${resolvedProfile}'; must be one of closed profiles: b3_21, 7a8_19 (legacy). Reject unknown.`);
}

const profileSpec = CLOSED_PROFILES[resolvedProfile];
if (manifest.profile && manifest.profile !== resolvedProfile && !(resolvedProfile === '7a8_19' && ['legacy', 'legacy_7a_19'].includes(manifest.profile))) {
  throw Error(`Manifest profile mismatch: manifest specifies ${manifest.profile}, expected ${resolvedProfile}`);
}

if (manifest.installed_binding) {
  const b = manifest.installed_binding;
  const expB = profileSpec.installed_binding;
  if (b.source_sha !== expB.source_sha || b.release_id !== expB.release_id ||
      b.manifest_sha256 !== expB.manifest_sha256 || b.migration_count !== expB.migration_count) {
    throw Error(`Manifest installed_binding mismatch for profile ${resolvedProfile}`);
  }
}

const targetPayload = manifest.target_release;
if (!targetPayload || !targetPayload.source_sha || !/^[a-f0-9]{40}$/i.test(targetPayload.source_sha)) {
  throw Error('Candidate kit manifest target_release.source_sha is invalid or missing.');
}

if (resolvedProfile === 'b3_21') {
  const expT = profileSpec.target_release;
  if (targetPayload.source_sha !== expT.source_sha || targetPayload.release_id !== expT.release_id ||
      targetPayload.manifest_sha256 !== expT.manifest_sha256 || targetPayload.migration_count !== expT.migration_count) {
    throw Error('Manifest target_release mismatch for profile b3_21');
  }
}

let appSourceSha = null;
if (explicitExpectedAppSha) {
  if (explicitExpectedAppSha.toLowerCase() !== targetPayload.source_sha.toLowerCase()) {
    throw Error(`Explicit expected application source SHA mismatch: expected ${explicitExpectedAppSha}, candidate kit target is ${targetPayload.source_sha}`);
  }
  appSourceSha = targetPayload.source_sha.toLowerCase();
} else {
  // Legacy invocation compatibility: kit target must match tooling HEAD
  if (targetPayload.source_sha.toLowerCase() === head.toLowerCase()) {
    appSourceSha = head.toLowerCase();
  } else {
    throw Error(`Fail closed: no explicit expected application source SHA provided and candidate kit target (${targetPayload.source_sha}) does not match tooling HEAD (${head}). Pass --expected-source-sha <sha> or positional expected-source-sha.`);
  }
}

const id = 'upgrade_rehearsal_' + crypto.randomBytes(6).toString('hex');
const output = path.join(root, 'scratch', id);
fs.mkdirSync(output, { recursive: true });

const password = crypto.randomBytes(24).toString('hex');
const db = id + '_mysql';
const app = id + '_php';
const logs = [];
let pass = false;
let failure = undefined;

const run = (label, args, timeout = 30000, env = {}) => {
  const r = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout, maxBuffer: 1024 * 1024, env: { ...process.env, ...env } });
  fs.writeFileSync(path.join(output, label + '.log'), (r.stdout ?? '') + (r.stderr ?? ''));
  logs.push({ label, status: r.status, error: r.error?.code });
  if (r.error || r.status !== 0) {
    throw Error('Failed ' + label + '; retained sanitized test logs.');
  }
  return r.stdout;
};

try {
  run('mysql', ['run', '--pull=never', '-d', '--name', db, '--tmpfs', '/var/lib/mysql', '-e', 'MYSQL_ROOT_PASSWORD', 'mysql:8.4', '--skip-log-bin'], 30000, { MYSQL_ROOT_PASSWORD: password });
  let ready = false;
  for (let n = 0; n < 50; n++) {
    const r = spawnSync('docker', ['exec', '-e', 'MYSQL_PWD', db, 'mysql', '-uroot', '-N', '-e', 'SELECT 1'], { encoding: 'utf8', timeout: 3000, env: { ...process.env, MYSQL_PWD: password } });
    if (r.status === 0) {
      ready = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw Error('Disposable MySQL unavailable.');

  const mounts = oldArchive
    ? ['-v', oldArchive + ':/old.tar:ro', '-v', kitArchive + ':/kit.tar:ro']
    : ['-v', old + ':/home/gaza5045/original-package:ro', '-v', kit + ':/candidate-kit:ro'];

  const runtimeCmd = `php /source/tests/tooling/production-upgrade-runtime.php --profile=${resolvedProfile}`;
  const entry = oldArchive
    ? ['sh', '-c', `mkdir -p /home/gaza5045/original-package /candidate-kit && tar -xf /old.tar -C /home/gaza5045/original-package && tar -xf /kit.tar -C /candidate-kit && ${runtimeCmd}`]
    : ['php', '/source/tests/tooling/production-upgrade-runtime.php', `--profile=${resolvedProfile}`];

  const result = run('runtime', [
    'run', '--pull=never', '--rm', '--name', app, '--network', 'container:' + db, '--tmpfs', '/home/gaza5045',
    '-e', 'HOME=/home/gaza5045', '-e', 'HOSTPAPA_HOME=/home/gaza5045', '-e', 'HOSTPAPA_UPGRADE_REHEARSAL=owned-tmpfs', '-e', 'UPGRADE_TEST_ROOT_PASSWORD',
    '-e', 'HOSTPAPA_REHEARSAL_KIT_MANIFEST_SHA256=' + selectedKitManifestHash,
    '-v', root + ':/source:ro', ...mounts, 'gaza-gateway-upgrade-test:php84', ...entry
  ], 480000, { UPGRADE_TEST_ROOT_PASSWORD: password });

  if (!result.includes('PROBES=')) throw Error('Complete rehearsal receipt absent.');
  pass = true;
  console.log(result);
} catch (e) {
  failure = e.message;
  console.error(failure);
} finally {
  for (const name of [app, db]) {
    try {
      const state = spawnSync('docker', ['inspect', name], { encoding: 'utf8', timeout: 10000 });
      if (state.status === 0 && spawnSync('docker', ['rm', '-f', name], { encoding: 'utf8', timeout: 20000 }).status !== 0) {
        pass = false;
        failure = 'Owned cleanup failed for ' + name;
      }
    } catch (e) {
      pass = false;
      failure = (failure ? failure + '; ' : '') + 'Cleanup error: ' + e.message;
    }
  }

  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const files = [
    'backend/scripts/run-production-upgrade-rehearsal.mjs',
    'tests/tooling/production-upgrade-runtime.php',
    'backend/scripts/hostpapa-install.php',
    'tools/hostpapa-release/production-upgrade/production-upgrade-runner.php'
  ];
  const kitManifestHash = (manifestPath && fs.existsSync(manifestPath)) ? hash(manifestPath) : null;
  if (kitManifestHash !== selectedKitManifestHash) {
    pass = false;
    failure = 'Selected kit manifest changed during rehearsal.';
  }
  const receipt = {
    source_sha: appSourceSha,
    app_source: appSourceSha,
    app_source_sha: appSourceSha,
    tooling_source: head,
    tooling_source_sha: head,
    working_tree_dirty: toolingIsDirty,
    tooling_dirty: toolingIsDirty,
    dirty_classification: toolingIsDirty ? 'dirty' : 'clean',
    git_status: dirty,
    profile: resolvedProfile,
    passed: pass,
    failure,
    kit_manifest_sha256: kitManifestHash,
    selected_kit_manifest_sha256: selectedKitManifestHash,
    logs,
    source_hashes: Object.fromEntries(files.filter(f => fs.existsSync(path.join(root, f))).map(f => [f, hash(path.join(root, f))])),
    limits: 'Disposable portless local PHP/MySQL and synthetic accounts only; no HostPapa execution, cron policy or mailbox certification.'
  };
  fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log('Retained evidence: ' + output);
  if (!pass) process.exitCode = 1;
}
