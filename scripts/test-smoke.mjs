import path from "node:path";
import { fileURLToPath } from "node:url";
import { installTestClock } from "../tests/helpers/test-clock.mjs";
import { createSmokeSelection } from "../tests/helpers/smoke-selection.mjs";

// The clock is installed BEFORE dynamically importing journey modules and their fixture constants.
const args = process.argv.slice(2);
const group = args[0] && !args[0].startsWith("--") ? args.shift() : "all";
for (const arg of args) if (!/^--(?:filter|url)=.+$/.test(arg)) throw new Error(`Unknown/empty smoke argument: ${arg}`);
if (args.filter(arg => arg.startsWith("--filter=")).length > 1 || args.filter(arg => arg.startsWith("--url=")).length > 1) throw new Error("Duplicate smoke argument");
createSmokeSelection({ group });
process.env.SMOKE_GROUP = group;
process.env.TEST_NOW ??= "2026-10-08T09:00:00.000Z";
process.env.TZ = "UTC";
installTestClock(process.env.TEST_NOW);
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
console.log(`Smoke group: ${group}; fixture clock: ${process.env.TEST_NOW}`);
await import("../tests/smoke/browser-smoke.mjs");
