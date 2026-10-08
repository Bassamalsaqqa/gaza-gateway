import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { unitGroups } from "./test-groups.mjs";

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseArguments(args) {
  const names = [], options = new Set();
  for (const arg of args) {
    if (arg === "--list") {
      if (options.has(arg)) throw new Error("Duplicate --list option");
      options.add(arg);
    } else if (arg.startsWith("-") || !arg.trim()) throw new Error(`Unknown/empty unit argument: ${arg}`);
    else names.push(arg);
  }
  return { names: names.length ? names : ["all"], list: options.has("--list") };
}

export function discoverTests(root = repositoryRoot) {
  return {
    unit: readdirSync(path.join(root, "tests/unit")).filter(name => name.endsWith(".test.ts")).sort().map(name => `tests/unit/${name}`),
    tooling: readdirSync(path.join(root, "tests/tooling")).filter(name => name.endsWith(".test.mjs")).sort().map(name => `tests/tooling/${name}`),
  };
}

export function selectTests(names, inventory = discoverTests(), groups = unitGroups) {
  if (!names.length) throw new Error("Empty unit group selection");
  for (const name of names) if (name !== "all" && !Object.hasOwn(groups, name)) throw new Error(`Unknown unit group: ${name}. Choose all or ${Object.keys(groups).join(", ")}`);
  const registered = new Set(Object.values(groups).flat().map(name => `tests/unit/${name}.test.ts`));
  const existing = new Set(inventory.unit);
  const missing = [...registered].filter(file => !existing.has(file));
  const unassigned = inventory.unit.filter(file => !registered.has(file));
  if (missing.length || unassigned.length) throw new Error(`Unit inventory mismatch. Missing: ${missing.join(", ") || "none"}. Unassigned: ${unassigned.join(", ") || "none"}. Update scripts/test-groups.mjs.`);
  const files = names.includes("all") ? [...inventory.unit, ...inventory.tooling] : names.flatMap(name =>
    name === "tooling" ? inventory.tooling : groups[name].map(file => `tests/unit/${file}.test.ts`));
  const selected = [...new Set(files)].sort();
  if (!selected.length) throw new Error("Unit selection matched zero tests");
  return selected;
}

export function executeTests(files, { root = repositoryRoot, spawn = spawnSync } = {}) {
  const result = spawn(process.execPath, ["--test", "--experimental-strip-types", ...files], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1; // signals/failed launches cannot turn into success
}

export function runUnitCli(args, { inventory = discoverTests(), print = console.log, execute = executeTests } = {}) {
  const options = parseArguments(args);
  const files = selectTests(options.names, inventory);
  if (options.list) { print(files.join("\n")); return 0; }
  print(`Unit groups: ${options.names.join(", ")}; ${files.length} files`);
  return execute(files);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = runUnitCli(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
