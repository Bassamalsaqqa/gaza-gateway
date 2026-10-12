#!/usr/bin/env node

/**
 * Builds a reproducible static + private Laravel release package for HostPapa shared cPanel hosting.
 *
 * Usage:
 *   node scripts/build-hostpapa-shared-release.mjs [options]
 *
 * Options:
 *   --output-dir=<dir>    Output directory (default: scratch/.hostpapa-shared-release)
 *   --source-sha=<sha>    Override source git SHA (default: git rev-parse HEAD)
 *   --vendor-dir=<dir>    Override locked Composer vendor directory path
 *   --client-dist=<dir>   Override built static client directory (default: dist/client)
 *   --allow-dirty         Allow building from dirty git working tree (classified as ENGINEERING_TEST_BUILD)
 *   --help                Display usage instructions
 */

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ReleaseBuilder } from "../tools/hostpapa-release/src/ReleaseBuilder.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    root,
    outputDir: "scratch/.hostpapa-shared-release",
    sourceSha: null,
    vendorDir: null,
    clientDist: null,
    allowDirty: false,
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      console.log(`
HostPapa Shared Release Builder
--------------------------------
Builds an immutable offline release bundle with static public assets and private Laravel code.

Options:
  --output-dir=<path>   Destination directory (default: scratch/.hostpapa-shared-release)
  --source-sha=<sha>     Explicit git commit SHA (40-char hex)
  --vendor-dir=<path>   Path to locked Composer vendor directory
  --client-dist=<path>  Path to prebuilt static client directory
  --allow-dirty         Permit building when git working tree contains uncommitted changes
  --help                Show this message
`);
      process.exit(0);
    } else if (arg.startsWith("--output-dir=")) {
      options.outputDir = arg.split("=")[1];
    } else if (arg.startsWith("--source-sha=")) {
      options.sourceSha = arg.split("=")[1];
    } else if (arg.startsWith("--vendor-dir=")) {
      options.vendorDir = arg.split("=")[1];
    } else if (arg.startsWith("--client-dist=")) {
      options.clientDist = arg.split("=")[1];
    } else if (arg === "--allow-dirty") {
      options.allowDirty = true;
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();
  console.log("Building HostPapa shared release package...");
  console.log(`- Project Root: ${options.root}`);
  console.log(`- Output Directory: ${options.outputDir}`);

  try {
    const builder = new ReleaseBuilder(options);
    const result = await builder.build();

    console.log("\nRelease package successfully built:");
    console.log(`- Release ID:     ${result.releaseId}`);
    console.log(`- Source Commit:  ${result.sourceSha}`);
    console.log(`- Dirty State:    ${result.isDirty ? "DIRTY (uncommitted changes present)" : "CLEAN"}`);
    console.log(`- Classification: ${result.classification}`);
    console.log(`- Public Files:   ${result.publicFileCount} files (${(result.publicBytes / 1024).toFixed(1)} KB)`);
    console.log(`- Private Files:  ${result.privateFileCount} files (${(result.privateBytes / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`- Manifest Path:  ${path.join(result.outputDir, "release-manifest.json")}`);
    console.log("\nZero deployment performed. Package is ready for offline inspection and verification.");
  } catch (error) {
    console.error(`\nRelease build failed: ${error.message}`);
    if (process.env.DEBUG) console.error(error.stack);
    process.exit(1);
  }
}

main();
