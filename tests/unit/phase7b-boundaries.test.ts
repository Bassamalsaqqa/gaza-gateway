import {it} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";

it("Phase 7B retains compiled public documentary/media and operational authority", () => {
  const changed = execFileSync("git", ["diff", "--name-only", "6b0240f1692beecc3f030775c0a25a68758a279b", "deb9f6e2a4246f4f5c70ca1b56797ccf0588388e", "--", "src/lib/archive/catalog.ts", "src/lib/archive/sources.ts", "src/lib/media.ts", "src/lib/media-policy.ts", "src/content/published", "src/routes/{-$locale}.gallery.tsx", "src/routes/{-$locale}.airport.past.tsx", "src/routes/{-$locale}.index.tsx", "src/lib/repositories/flight-repository.ts", "src/lib/repositories/booking-repository.ts", "public", "package.json", "package-lock.json"], {encoding:"utf8"});
  assert.equal(changed.trim(), "");
});
it("archive draft authority is independent, registry-owned and Studio-isolated", () => {
  const registry = readFileSync("src/lib/repositories/registry.ts", "utf8");
  assert.match(registry, /new LocalArchiveDraftRepository\(/);
  assert.match(registry, /archiveDrafts[\s\S]*inMemory/);
  const repository = readFileSync("src/lib/archive/drafts/repository.ts", "utf8");
  assert.doesNotMatch(repository, /from ["'][^"']*(?:react|admin-store|content\/repository|booking-repository)/);
  assert.match(repository, /gza\.archive\.draft\.v1/);
  const model = readFileSync("docs/ARCHIVE_ADMIN_MODEL.md", "utf8");
  assert.match(model, /Phase 7B Complete \/ Accepted Source at `deb9f6e2a4246f4f5c70ca1b56797ccf0588388e`/);
  assert.match(model, /Saving or discarding a local draft does not change the public Gallery\/Past\/Home/);
});
