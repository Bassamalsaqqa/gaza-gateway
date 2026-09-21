import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = path.join(root, ".hostpapa-release");
const siteDir = path.join(releaseDir, "site");
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function isFile(relative, base = releaseDir) {
  return (await stat(path.join(base, ...relative.split("/"))).catch(() => null))?.isFile() === true;
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
    else failures.push(`Unsupported filesystem entry: ${relative}`);
  }
  return files;
}

const requiredSiteFiles = [
  "index.html", ".htaccess", "_shell.html", "ar/_shell.html",
  "admin/_shell.html", "ar/admin/_shell.html", "flights/index.html",
  "ar/flights/index.html", "destinations/AMM/index.html", "ar/destinations/AMM/index.html",
  "book/index.html", "ar/book/index.html",
];
for (const relative of requiredSiteFiles) check(await isFile(relative, siteDir), `Missing site file: ${relative}`);
for (const relative of [".cpanel.yml", "deploy-hostpapa.sh", "SOURCE_COMMIT.txt", "release-manifest.txt"]) {
  check(await isFile(relative), `Missing release control file: ${relative}`);
}

const siteFiles = (await listFiles(siteDir)).sort((a, b) => a.localeCompare(b, "en"));
check(siteFiles.some((file) => file.startsWith("assets/") && file.endsWith(".js")), "No JavaScript asset found");
check(siteFiles.some((file) => file.startsWith("assets/") && file.endsWith(".css")), "No CSS asset found");

const forbidden = [
  /^dist\/server(?:\/|$)/, /^\.output(?:\/|$)/, /^node_modules(?:\/|$)/,
  /^src(?:\/|$)/, /^\.git(?:\/|$)/, /^\.ai(?:\/|$)/, /^\.claude(?:\/|$)/,
  /^\.codex(?:\/|$)/, /^\.playwright-mcp(?:\/|$)/,
  /^images_assets_to_be_used_in_website_after_proper_placement_and_compression(?:\/|$)/,
  /(^|\/)\.env(?:\.|$)/,
];
for (const file of siteFiles) check(!forbidden.some((pattern) => pattern.test(file)), `Forbidden release path: ${file}`);

const rootEntries = (await readdir(releaseDir)).sort();
const allowedRootEntries = [".cpanel.yml", "SOURCE_COMMIT.txt", "deploy-hostpapa.sh", "release-manifest.txt", "site"].sort();
check(JSON.stringify(rootEntries) === JSON.stringify(allowedRootEntries), `Unexpected release-root entries: ${rootEntries.join(", ")}`);

const manifestText = await readFile(path.join(releaseDir, "release-manifest.txt"), "utf8");
const manifest = manifestText.trimEnd().split("\n");
check(JSON.stringify(manifest) === JSON.stringify(siteFiles), "Release manifest does not exactly match sorted site files");
check(new Set(manifest).size === manifest.length, "Release manifest contains duplicate paths");
for (const file of manifest) check(file && !file.startsWith("/") && !file.split("/").includes(".."), `Unsafe manifest path: ${file}`);

const sourceCommit = (await readFile(path.join(releaseDir, "SOURCE_COMMIT.txt"), "utf8")).trim();
check(/^[0-9a-f]{40}$/.test(sourceCommit), "SOURCE_COMMIT.txt is not a full Git SHA");

const enShell = await readFile(path.join(siteDir, "_shell.html"), "utf8");
const arShell = await readFile(path.join(siteDir, "ar", "_shell.html"), "utf8");
const enAdminShell = await readFile(path.join(siteDir, "admin", "_shell.html"), "utf8");
const arAdminShell = await readFile(path.join(siteDir, "ar", "admin", "_shell.html"), "utf8");
check(/<html[^>]*lang=["']en["'][^>]*dir=["']ltr["']/i.test(enShell), "English public shell lacks EN/LTR foundation");
check(/<html[^>]*lang=["']ar["'][^>]*dir=["']rtl["']/i.test(arShell), "Arabic public shell lacks AR/RTL foundation");
check(/<html[^>]*lang=["']en["'][^>]*dir=["']ltr["']/i.test(enAdminShell), "English admin shell lacks EN/LTR foundation");
check(/<html[^>]*lang=["']ar["'][^>]*dir=["']rtl["']/i.test(arAdminShell), "Arabic admin shell lacks AR/RTL foundation");

const htmlFiles = siteFiles.filter((file) => file.endsWith(".html"));
const referencedAssets = new Set();
for (const htmlFile of htmlFiles) {
  const html = await readFile(path.join(siteDir, ...htmlFile.split("/")), "utf8");
  for (const match of html.matchAll(/(?:src|href)=["']\/assets\/([^"'?]+)(?:\?[^"']*)?["']/g)) referencedAssets.add(`assets/${match[1]}`);
}
for (const asset of referencedAssets) check(siteFiles.includes(asset), `HTML references missing asset: ${asset}`);

const deployScript = await readFile(path.join(releaseDir, "deploy-hostpapa.sh"), "utf8");
check(deployScript.includes("set -euo pipefail"), "Deployment script lacks strict shell mode");
check(!/rm\s+-rf\b/.test(deployScript), "Deployment script contains recursive forced deletion");
check(!/\b(?:npm|node|bun|vite|npx)\b/.test(deployScript), "Deployment script requires a build/runtime tool");
check(deployScript.includes(".gazaairport-deployed-files"), "Deployment script lacks private managed manifest");
check(deployScript.includes(".well-known"), "Deployment script does not explicitly protect .well-known");

if (failures.length) {
  console.error(`HostPapa release verification failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const bytes = (await Promise.all(siteFiles.map(async (file) => (await stat(path.join(siteDir, ...file.split("/")))).size))).reduce((sum, size) => sum + size, 0);
console.log(`Verified HostPapa release for source ${sourceCommit}`);
console.log(`Files: ${siteFiles.length}; HTML: ${htmlFiles.length}; bytes: ${bytes}`);
console.log(`Referenced assets verified: ${referencedAssets.size}`);
