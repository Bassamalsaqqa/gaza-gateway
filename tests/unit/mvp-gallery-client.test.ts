import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { getGalleryItems } from "../../src/lib/archive/catalog.ts";
import { applyPublishedGalleryConfiguration, buildDefaultGalleryConfiguration, galleryConfigurationPayloadSchema } from "../../src/lib/archive/gallery-publication.ts";

test("gallery manifest exactly preserves approved compiled identities", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../../backend/resources/gallery/manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.approvedIds, getGalleryItems().map(item => item.id));
});
test("gallery configuration is recursively closed and rejects unknown or duplicate records", () => {
  const payload = buildDefaultGalleryConfiguration();
  assert.ok(galleryConfigurationPayloadSchema.safeParse(payload).success);
  const first = payload.items[0]!;
  for (const item of [{...first, title: {en: "Display", injected: true}}, {...first, recordId: "unapproved"}]) {
    assert.equal(galleryConfigurationPayloadSchema.safeParse({items: [item]}).success, false);
  }
  assert.equal(galleryConfigurationPayloadSchema.safeParse({items: [first, first]}).success, false);
  assert.equal(galleryConfigurationPayloadSchema.safeParse({items: [{...first, title: {}}]}).success, false);
  assert.ok(galleryConfigurationPayloadSchema.safeParse({items: [{...first, title: null, caption: null}]}).success);
});
test("gallery display order and visibility preserve documentary provenance", () => {
  const compiled = getGalleryItems(), before = structuredClone(compiled);
  const first = compiled[0]!, second = compiled[1]!;
  const result = applyPublishedGalleryConfiguration({items: [
    {recordId: second.id, visible: true, title: {en: "Curated display title"}},
    {recordId: first.id, visible: false},
  ]}, compiled);
  assert.equal(result.length, 1);
  assert.deepEqual({...result[0], title: second.title, caption: second.caption ?? {en: "", ar: ""}}, second);
  assert.deepEqual(compiled, before);
});
