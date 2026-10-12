#!/usr/bin/env node

/**
 * Audits and verifies a HostPapa shared release package against its cryptographic manifest.
 *
 * Usage:
 *   node scripts/verify-hostpapa-shared-release.mjs [options]
 *
 * Options:
 *   --release-dir=<dir>   Path to release package (default: scratch/.hostpapa-shared-release)
 *   --strict              Fail if package was built from dirty source or not classified as an unreviewed release candidate
 *   --expected-sha=<sha>  Ensure release source commit matches this exact SHA
 *   --help                Display usage instructions
 */

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ReleaseVerifier } from "../tools/hostpapa-release/src/ReleaseVerifier.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    releaseDir: path.resolve(root, "scratch/.hostpapa-shared-release"),
    strict: false,
    expectedSha: null,
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      console.log(`
HostPapa Shared Release Verifier
---------------------------------
Cryptographically verifies an offline release bundle against its manifest.

Options:
  --release-dir=<path>   Directory containing the release package
  --strict               Enforce clean git source and unreviewed candidate classification
  --expected-sha=<sha>   Require exact source commit SHA match
  --help                 Show this message
`);
      process.exit(0);
    } else if (arg.startsWith("--release-dir=")) {
      options.releaseDir = path.resolve(root, arg.split("=")[1]);
    } else if (arg === "--strict") {
      options.strict = true;
    } else if (arg.startsWith("--expected-sha=")) {
      options.expectedSha = arg.split("=")[1];
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();
  console.log("Verifying HostPapa shared release package...");
  console.log(`- Release Directory: ${options.releaseDir}`);
  if (options.strict) console.log("- Mode: STRICT (clean source and candidate classification required)");
  if (options.expectedSha) console.log(`- Expected Source SHA: ${options.expectedSha}`);

  try {
    const verifier = new ReleaseVerifier(options);
    const result = await verifier.verify();

    if (!result.success) {
      console.error(`\nRelease verification FAILED with ${result.failures.length} errors:`);
      for (const err of result.failures) {
        console.error(`  [FAIL] ${err}`);
      }
      process.exit(1);
    }

    console.log("\nRelease package verification PASSED:");
    console.log(`- Release ID:     ${result.summary.releaseId}`);
    console.log(`- Source Commit:  ${result.summary.sourceSha}`);
    console.log(`- Classification: ${result.summary.classification}`);
    console.log(`- Public Files:   ${result.summary.publicFiles} verified`);
    console.log(`- Private Files:  ${result.summary.privateFiles} verified`);
    console.log("\nAll cryptographic checksums and boundary separations are intact.");
  } catch (error) {
    console.error(`\nVerification runtime error: ${error.message}`);
    if (process.env.DEBUG) console.error(error.stack);
    process.exit(1);
  }
}

main();
