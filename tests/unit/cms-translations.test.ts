import { it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { admin2En, admin2Ar } from "../../src/lib/i18n-admin2.ts";

it("CMS strings have separate English and Arabic translations", () => {
  const keys = Object.keys(admin2En).filter((key) => key.startsWith("cms."));
  assert.deepEqual(Object.keys(admin2Ar).filter((key) => key.startsWith("cms.")).sort(), keys.sort());
  for (const key of keys) {
    assert.ok(admin2En[key]?.trim(), `${key}: English`);
    assert.ok(admin2Ar[key]?.trim(), `${key}: Arabic`);
  }
});

it("literal CMS labels used by editors resolve in both locales", () => {
  const paths = [
    ...readdirSync("src/components/admin/cms").filter((file) => /\.tsx?$/.test(file)).map((file) => `src/components/admin/cms/${file}`),
    "src/routes/{-$locale}.admin.website.tsx",
    "src/routes/{-$locale}.admin.airport.index.tsx",
    "src/routes/{-$locale}.admin.destinations.$code.tsx",
  ];
  for (const path of paths) {
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(/["'](cms\.[a-zA-Z0-9.]+)["']/g)) {
      const key = match[1]!;
      assert.ok(admin2En[key], `${path}: ${key} English`);
      assert.ok(admin2Ar[key], `${path}: ${key} Arabic`);
    }
  }
});
