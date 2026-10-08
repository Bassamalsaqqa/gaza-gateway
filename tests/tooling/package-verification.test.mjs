import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildSitemapXml } from "../../scripts/generate-sitemap.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = "a".repeat(40);
const shell = (lang, dir) => `<html lang="${lang}" dir="${dir}"><script src="/assets/app.js"></script><link href="/assets/app.css"></html>`;

async function packageFixture(run) {
  await mkdir(path.join(root, "scratch"), { recursive: true });
  const directory = await mkdtemp(path.join(root, "scratch", "phase10-package-"));
  const files = {
    "index.html": shell("en", "ltr"), ".htaccess": "", "_shell.html": shell("en", "ltr"),
    "ar/_shell.html": shell("ar", "rtl"), "admin/_shell.html": shell("en", "ltr"), "ar/admin/_shell.html": shell("ar", "rtl"),
    "flights/index.html": "", "ar/flights/index.html": "", "destinations/AMM/index.html": "", "ar/destinations/AMM/index.html": "",
    "book/index.html": "", "ar/book/index.html": "", "assets/app.js": "", "assets/app.css": "",
    "sitemap.xml": buildSitemapXml(),
    "robots.txt": "Sitemap: https://www.gazaairport.com/sitemap.xml\nDisallow: /admin\nDisallow: /ar/admin\n",
  };
  const write = async (relative, text) => {
    const file = path.join(directory, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  };
  const manifest = () => write("release-manifest.txt", Object.keys(files).sort((a,b) => a.localeCompare(b,"en")).join("\n") + "\n");
  try {
    for (const [name, text] of Object.entries(files)) await write(`site/${name}`, text);
    await write(".cpanel.yml", "deployment:");
    await write("SOURCE_COMMIT.txt", source + "\n");
    await write("deploy-hostpapa.sh", "set -euo pipefail\n# .gazaairport-deployed-files\n# .well-known\n");
    await manifest();
    const verify = (expected = source) => spawnSync(process.execPath, [path.join(root,"scripts/verify-hostpapa-release.mjs")], {
      cwd: root, encoding: "utf8", env: { ...process.env, HOSTPAPA_RELEASE_DIR: directory, EXPECTED_SOURCE_COMMIT: expected },
    });
    await run({ files, write, manifest, verify, removeSitemap: () => rm(path.join(directory, "site", "sitemap.xml")) });
  } finally {
    // Only the exact freshly-created fixture directory is eligible for cleanup.
    assert.ok(directory.startsWith(path.join(root,"scratch","phase10-package-")));
    await rm(directory, { recursive: true });
  }
}

test("real package verifier accepts complete shells/manifest/assets and enforces expected source", async () => {
  await packageFixture(async ({ verify }) => {
    const good = verify();
    assert.equal(good.status, 0, good.stderr);
    const wrong = verify("b".repeat(40));
    assert.equal(wrong.status, 1);
    assert.match(wrong.stderr, /does not match expected source/);
  });
});
test("real verifier rejects nested source/maps/PHP/video and missing asset references", async () => {
  await packageFixture(async ({ files, write, manifest, verify }) => {
    for (const name of ["nested/debug.map", "assets/script.php", "nested/page.tsx", "assets/movie.mp4", "nested/tests/unit.txt"]) {
      files[name] = "contamination";
      await write(`site/${name}`, files[name]);
    }
    files["index.html"] = shell("en","ltr") + '<img src="/assets/missing.webp">';
    await write("site/index.html",files["index.html"]);
    await manifest();
    const bad = verify();
    assert.equal(bad.status, 1);
    for (const name of ["debug.map","script.php","page.tsx","movie.mp4","unit.txt","missing.webp"]) assert.ok(bad.stderr.includes(name), name);
  });
});

test("SEO inventory cannot be missing, duplicated or hosted on a lookalike origin", async () => {
  await packageFixture(async ({ files, write, manifest, verify }) => {
    for (const xml of ["", buildSitemapXml().replace("https://www.gazaairport.com/", "https://www.gazaairport.com.invalid/"), buildSitemapXml().replace("/airport</loc>", "/</loc>")]) {
      files["sitemap.xml"] = xml;
      await write("site/sitemap.xml", xml);
      await manifest();
      const bad = verify();
      assert.equal(bad.status, 1);
      assert.match(bad.stderr, /Sitemap does not exactly match/);
    }
  });
});

test("published pre-sitemap source remains auditable without relaxing new artifact checks", async () => {
  await packageFixture(async ({ files, write, manifest, verify, removeSitemap }) => {
    delete files["sitemap.xml"];
    await removeSitemap();
    files["robots.txt"] = "User-agent: *\nAllow: /\n";
    await write("site/robots.txt", files["robots.txt"]);
    await manifest();
    assert.equal(verify().status, 1, "Unknown/new source must require sitemap");
    const legacySource = "deb9f6e2a4246f4f5c70ca1b56797ccf0588388e";
    await write("SOURCE_COMMIT.txt", legacySource + "\n");
    const legacy = verify(legacySource);
    assert.equal(legacy.status, 0, legacy.stderr);
  });
});
