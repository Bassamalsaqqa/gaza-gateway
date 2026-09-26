import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { en, ar } from "../../src/lib/i18n-public.ts";
import { adminEn, adminAr } from "../../src/lib/i18n-admin.ts";
import { admin2En, admin2Ar } from "../../src/lib/i18n-admin2.ts";

describe("Bilingual i18n Key Parity (EN & AR)", () => {
  describe("Public Dictionary Parity", () => {
    const enKeys = Object.keys(en);
    const arKeys = Object.keys(ar);

    it("has identical key count in English and Arabic public dictionaries", () => {
      assert.equal(enKeys.length, arKeys.length);
    });

    it("has zero missing keys in Arabic public dictionary", () => {
      const missingInAr = enKeys.filter((k) => !(k in ar));
      assert.deepEqual(missingInAr, [], `Keys in EN missing in AR: ${missingInAr.join(", ")}`);
    });

    it("has zero extra keys in Arabic public dictionary", () => {
      const extraInAr = arKeys.filter((k) => !(k in en));
      assert.deepEqual(extraInAr, [], `Keys in AR missing in EN: ${extraInAr.join(", ")}`);
    });

    it("has non-empty values for every public translation key", () => {
      for (const [key, val] of Object.entries(en)) {
        assert.ok(val && val.trim().length > 0, `Empty EN value for key: ${key}`);
      }
      for (const [key, val] of Object.entries(ar)) {
        assert.ok(val && val.trim().length > 0, `Empty AR value for key: ${key}`);
      }
    });

    it("includes all canonical flight bookability status keys in both languages", () => {
      const requiredBookabilityKeys = [
        "book.flightCancelled",
        "book.flightDeparted",
        "book.flightLanded",
        "book.flightBoarding",
        "book.flightPast",
        "book.flightSoldOut",
        "book.flightInsufficientSeats",
        "book.flightUnavailable",
        "book.unavailable",
      ];

      for (const key of requiredBookabilityKeys) {
        assert.ok(key in en, `Missing key in EN: ${key}`);
        assert.ok(key in ar, `Missing key in AR: ${key}`);
        assert.ok(en[key] && en[key].trim().length > 0);
        assert.ok(ar[key] && ar[key].trim().length > 0);
      }
    });
  });

  describe("Admin Primary Dictionary Parity (i18n-admin)", () => {
    const enAdminKeys = Object.keys(adminEn);
    const arAdminKeys = Object.keys(adminAr);

    it("has identical key count in admin primary dictionaries", () => {
      assert.equal(enAdminKeys.length, arAdminKeys.length);
    });

    it("has zero missing keys in Arabic admin primary dictionary", () => {
      const missingInAr = enAdminKeys.filter((k) => !(k in adminAr));
      assert.deepEqual(missingInAr, [], `Keys in adminEn missing in adminAr: ${missingInAr.join(", ")}`);
    });

    it("has non-empty values for every admin primary translation key", () => {
      for (const [key, val] of Object.entries(adminEn)) {
        assert.ok(val && val.trim().length > 0, `Empty adminEn value for key: ${key}`);
      }
      for (const [key, val] of Object.entries(adminAr)) {
        assert.ok(val && val.trim().length > 0, `Empty adminAr value for key: ${key}`);
      }
    });
  });

  describe("Admin Secondary Dictionary Parity (i18n-admin2)", () => {
    const enAdmin2Keys = Object.keys(admin2En);
    const arAdmin2Keys = Object.keys(admin2Ar);

    it("has identical key count in admin secondary dictionaries", () => {
      assert.equal(enAdmin2Keys.length, arAdmin2Keys.length);
    });

    it("has zero missing keys in Arabic admin secondary dictionary", () => {
      const missingInAr = enAdmin2Keys.filter((k) => !(k in admin2Ar));
      assert.deepEqual(missingInAr, [], `Keys in admin2En missing in admin2Ar: ${missingInAr.join(", ")}`);
    });

    it("has non-empty values for every admin secondary translation key", () => {
      for (const [key, val] of Object.entries(admin2En)) {
        assert.ok(val && val.trim().length > 0, `Empty admin2En value for key: ${key}`);
      }
      for (const [key, val] of Object.entries(admin2Ar)) {
        assert.ok(val && val.trim().length > 0, `Empty admin2Ar value for key: ${key}`);
      }
    });
  });
});
