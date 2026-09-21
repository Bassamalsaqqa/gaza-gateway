import { execFileSync } from "node:child_process";
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = path.join(root, "dist", "client");
const releaseDir = path.join(root, ".hostpapa-release");
const siteDir = path.join(releaseDir, "site");
const deploySourceDir = path.join(root, "deployment", "hostpapa");

const required = [
  "index.html",
  ".htaccess",
  "_shell.html",
  "ar/_shell.html",
  "admin/_shell.html",
  "ar/admin/_shell.html",
];

async function requireFile(base, relative) {
  const target = path.join(base, ...relative.split("/"));
  const info = await stat(target).catch(() => null);
  if (!info?.isFile()) throw new Error(`Required static artifact is missing: ${relative}`);
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`Unsupported release entry: ${relative}`);
  }
  return files;
}

for (const relative of required) await requireFile(clientDir, relative);
await requireFile(deploySourceDir, ".cpanel.yml");
await requireFile(deploySourceDir, "deploy-hostpapa.sh");

await rm(releaseDir, { recursive: true, force: true });
await mkdir(siteDir, { recursive: true });
await cp(clientDir, siteDir, { recursive: true, force: true });
await cp(path.join(deploySourceDir, ".cpanel.yml"), path.join(releaseDir, ".cpanel.yml"));
await cp(path.join(deploySourceDir, "deploy-hostpapa.sh"), path.join(releaseDir, "deploy-hostpapa.sh"));

const files = (await listFiles(siteDir)).sort((a, b) => a.localeCompare(b, "en"));
await writeFile(path.join(releaseDir, "release-manifest.txt"), `${files.join("\n")}\n`, "utf8");

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error("Unable to resolve the full source commit SHA");
await writeFile(path.join(releaseDir, "SOURCE_COMMIT.txt"), `${sourceCommit}\n`, "utf8");

console.log(`Prepared ${files.length} static files in ${path.relative(root, releaseDir)}`);
console.log(`Source commit: ${sourceCommit}`);
