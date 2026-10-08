import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { en, ar } from "../../src/lib/i18n-public.ts";
import { adminEn, adminAr } from "../../src/lib/i18n-admin.ts";
import { admin2En, admin2Ar } from "../../src/lib/i18n-admin2.ts";
import { networkEn, networkAr } from "../../src/lib/i18n-network.ts";
import { servicesEn, servicesAr } from "../../src/lib/i18n-services.ts";
import { archiveAdminEn, archiveAdminAr } from "../../src/lib/i18n-archive-admin.ts";

const dictionaries = { public: [en, ar], admin: [adminEn, adminAr], admin2: [admin2En, admin2Ar], network: [networkEn, networkAr], services: [servicesEn, servicesAr], archive: [archiveAdminEn, archiveAdminAr] } as const;
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

for (const [name, [english, arabic]] of Object.entries(dictionaries)) {
  it(`${name}: EN/AR have matching nonempty UI keys and interpolation variables`, () => {
    assert.deepEqual(Object.keys(arabic).sort(), Object.keys(english).sort());
    for (const key of Object.keys(english)) {
      assert.ok(english[key]?.trim(), `${key}: empty English`);
      assert.ok(arabic[key]?.trim(), `${key}: empty Arabic`);
      assert.deepEqual(placeholders(arabic[key]!), placeholders(english[key]!), `${key}: interpolation mismatch`);
    }
  });
}

it("literal UI translation calls resolve to a bilingual catalog key", () => {
  const keys = new Set(Object.values(dictionaries).flatMap(([english]) => Object.keys(english)));
  const missing: string[] = [];
  for (const file of readdirSync("src", { recursive: true }).filter(file => /\.tsx?$/.test(String(file)))) {
    const text = readFileSync(join("src", String(file)), "utf8");
    // Exact literals only: dynamic key prefixes are validated by their domain tests.
    for (const match of text.matchAll(/\bt\(["']([^"']+)["']\s*(?=[,)])/g)) {
      if (!keys.has(match[1]!)) missing.push(`${file}: ${match[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});
