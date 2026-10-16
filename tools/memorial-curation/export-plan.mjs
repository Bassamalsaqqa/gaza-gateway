#!/usr/bin/env node
/**
 * Gaza Gateway — Memorial Curation Plan Offline Exporter
 *
 * Generates and verifies the reproducible 20-destination commemorative curation plan
 * completely offline without network, database, or browser runtime dependencies.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import catalog from './catalog.v1.json' with { type: 'json' };
import { compiledNetworkReference } from '../../src/lib/destination-reference.ts';
import { GZA } from '../../src/lib/data.ts';
import { seedFleetAircraft, seedFleetLayouts } from '../../src/lib/fleet/seed.ts';
import { buildCurationPlan } from './plan.mjs';

export function createBaseSnapshot() {
  return {
    airports: [
      {
        code: 'GZA',
        airportName: GZA.name,
        city: GZA.city,
        country: GZA.country,
        timezone: GZA.tz,
        blockMinutes: 20,
        active: true,
      },
      ...structuredClone(compiledNetworkReference),
    ],
    fleet: {
      revision: 0,
      aircraft: seedFleetAircraft(),
      layouts: seedFleetLayouts(),
    },
    schedules: [],
  };
}

export function generatePlan(options = {}) {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const snapshot = options.snapshot ?? createBaseSnapshot();
  return buildCurationPlan(snapshot, {
    today,
    activateStandby: options.activateStandby ?? true,
    scope: options.scope ?? 'all',
  });
}

// CLI entrypoint
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const args = process.argv.slice(2);
  const todayArg = args.find((a, i) => args[i - 1] === '--today') ?? new Date().toISOString().slice(0, 10);
  const outArg = args.find((a, i) => args[i - 1] === '--out');
  const jsonOnly = args.includes('--json');

  const plan = generatePlan({ today: todayArg, activateStandby: true });

  if (outArg) {
    fs.writeFileSync(outArg, JSON.stringify(plan, null, 2), 'utf8');
    if (!jsonOnly) {
      console.log(`Plan written to ${outArg}`);
    }
  }

  if (jsonOnly) {
    if (!outArg) console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log('=== Gaza Gateway — 20-Destination Commemorative Curation Plan ===');
    console.log(`Period: ${plan.from} → ${plan.until}`);
    console.log(`New Airport Additions: ${plan.additions.length}`);
    console.log(`Fleet Updates (Standby): ${plan.fleetUpdates.length}`);
    console.log(`Schedule Adds: ${plan.scheduleAdds.length} (20 destinations bidirectional)`);
    console.log(`Schedule Extensions: ${plan.scheduleExtensions.length}`);
    console.log(`Core Rotation Leg Count: ${plan.verification.legCount} (min turnaround: ${plan.verification.minimumTurnaroundMinutes}m)`);
    if (plan.networkVerification) {
      console.log(`Total Network Leg Count: ${plan.networkVerification.totalLegCount}`);
      console.log(`Total Destinations Covered: ${plan.networkVerification.destinationCount}`);
      console.log(`Bidirectional Pairs: ${plan.networkVerification.bidirectionalPairCount}`);
      console.log(`Core Legs: ${plan.networkVerification.coreLegCount} | Expanded Legs: ${plan.networkVerification.expandedLegCount}`);
    }
    console.log(`Snapshot Fingerprint: ${plan.snapshotFingerprint.slice(0, 32)}...`);
  }
}
