#!/usr/bin/env node

/**
 * Prepares a private HostPapa production upgrade ZIP-kit from an already built clean release bundle.
 *
 * Usage:
 *   node scripts/prepare-hostpapa-production-upgrade.mjs [options]
 *
 * Options:
 *   --package-dir=<path>   Source verified production release package (default: scratch/.hostpapa-shared-release)
 *   --output-dir=<path>    Output directory for extracted upgrade kit (default: scratch/production-upgrade-kit)
 *   --output-zip=<path>    Output zip path for upload kit (default: scratch/production-upgrade-kit.zip)
 *   --source-sha=<sha>     Explicit expected git commit SHA (40-char hex)
 *   --no-zip               Skip ZIP archive creation
 *   --help                 Display usage instructions
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { ProductionUpgradeKitBuilder } from '../tools/hostpapa-release/production-upgrade/ProductionUpgradeKitBuilder.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    packageDir: path.join(root, 'scratch/.hostpapa-shared-release'),
    outputDir: path.join(root, 'scratch/production-upgrade-kit'),
    outputZip: path.join(root, 'scratch/production-upgrade-kit.zip'),
    sourceSha: null,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      console.log(`
HostPapa Production Upgrade Kit Generator
------------------------------------------
Packages a clean production-origin release bundle into a private upgrade kit
with the CLI upgrade runner and pinned metadata. Never includes secrets.

Options:
  --package-dir=<path>  Source release package directory (default: scratch/.hostpapa-shared-release)
  --output-dir=<path>   Output kit directory (default: scratch/production-upgrade-kit)
  --output-zip=<path>   Output kit zip file (default: scratch/production-upgrade-kit.zip)
  --source-sha=<sha>    Expected git commit SHA
  --no-zip              Skip zip generation
  --help                Show this message
`);
      process.exit(0);
    } else if (arg.startsWith('--package-dir=')) {
      options.packageDir = path.resolve(root, arg.split('=')[1]);
    } else if (arg.startsWith('--output-dir=')) {
      options.outputDir = path.resolve(root, arg.split('=')[1]);
    } else if (arg.startsWith('--output-zip=')) {
      options.outputZip = path.resolve(root, arg.split('=')[1]);
    } else if (arg === '--no-zip') {
      options.outputZip = null;
    } else if (arg.startsWith('--source-sha=')) {
      options.sourceSha = arg.split('=')[1];
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();
  console.log('Building HostPapa production upgrade kit...');
  console.log(`- Package Directory: ${options.packageDir}`);
  console.log(`- Kit Directory:     ${options.outputDir}`);
  if (options.outputZip) {
    console.log(`- Kit ZIP Archive:   ${options.outputZip}`);
  }

  try {
    const builder = new ProductionUpgradeKitBuilder({
      packageDir: options.packageDir,
      outputDir: options.outputDir,
      outputZip: options.outputZip,
      expectedSourceSha: options.sourceSha,
    });

    const result = await builder.build();

    console.log('\nProduction upgrade kit successfully generated:');
    console.log(`- Target Release ID:     ${result.targetReleaseId}`);
    console.log(`- Target Source SHA:     ${result.targetSourceSha}`);
    console.log(`- Target Manifest SHA:   ${result.targetManifestSha256}`);
    console.log(`- Pinned Installed SHA:  ${result.installedBinding.source_sha}`);
    console.log(`- Pinned Installed Rel:  ${result.installedBinding.release_id}`);
    console.log(`- Verified Migrations:   ${result.migrationCount}`);
    console.log(`- Kit Output Dir:        ${result.kitDir}`);
    if (result.zipPath) {
      console.log(`- Kit Output ZIP:        ${result.zipPath} (SHA: ${result.zipSha256})`);
    }
    console.log(`- Upgrade Manifest SHA:  ${result.upgradeManifestSha256}`);
    console.log(`- Runner Script SHA:     ${result.runnerSha256}`);
    console.log('\nZero credentials or private inputs included. UNREVIEWED candidate; final owner release authorization is required.');
  } catch (error) {
    console.error(`\nUpgrade kit generation failed: ${error.message}`);
    if (process.env.DEBUG) console.error(error.stack);
    process.exit(1);
  }
}

main();
