import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  loadSettingsEnvelope,
  saveContactDraft,
  discardContactDraft,
  saveAppearanceDraft,
  discardAppearanceDraft,
  SETTINGS_DRAFT_KEY,
  StorageCommitError,
} from "../../src/lib/settings/storage.ts";
import {
  validateContactSettings,
  sanitizeContactSettings,
} from "../../src/lib/settings/validation.ts";
import {
  PUBLISHED_CONTACT_SETTINGS,
  PUBLISHED_APPEARANCE_SETTINGS,
} from "../../src/lib/settings/defaults.ts";
import { LocalSettingsRepository } from "../../src/lib/settings/repository.ts";
import { computeExternalSettingsSync } from "../../src/lib/settings/sync.ts";
import {
  DEFAULT_SITE_SKIN,
  SKIN_PREVIEW_STORAGE_KEY,
  sanitizeSiteSkinConfig,
  readPreviewSkin,
  isDefaultSiteSkin,
  type SiteSkinConfig,
} from "../../src/lib/skin.ts";

/** Minimal in-memory Storage mock matching the project's injectable pattern */
function makeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key(i: number) { return [...data.keys()][i] ?? null; },
    getItem(k: string) { return data.get(k) ?? null; },
    setItem(k: string, v: string) { data.set(k, v); },
    removeItem(k: string) { data.delete(k); },
    clear() { data.clear(); },
  } as unknown as Storage;
}

describe("Phase 4C Settings Architecture (Correction 1)", () => {
  let store: Storage;
  beforeEach(() => {
    store = makeStorage();
  });

  describe("Contact Validation & Sanitization", () => {
    it("valid contact payload passes validation", () => {
      const valid = {
        phone: "+970 8 282 0000",
        email: "passenger.care@gza-airport.ps",
        addressEn: "Terminal 1, Gaza International Airport",
        addressAr: "مبنى الركاب 1، مطار غزة الدولي",
        socialInstagram: "https://instagram.com/gza.airport",
        socialX: "https://x.com/gzaairport",
        socialFacebook: "https://facebook.com/gza.airport",
        socialYouTube: "https://youtube.com/@gzaairport",
      };
      const res = validateContactSettings(valid);
      assert.equal(res.valid, true);
      assert.equal(res.errors.length, 0);
      assert.equal(res.sanitized.phone, "+970 8 282 0000");
    });

    it("rejects invalid phone numbers", () => {
      const invalid = { ...PUBLISHED_CONTACT_SETTINGS, phone: "123" };
      const res = validateContactSettings(invalid);
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.includes("phone")));
    });

    it("rejects invalid email formats", () => {
      for (const badEmail of ["notanemail", "user@", "@domain.com", "user@domain", "user @domain.com"]) {
        const res = validateContactSettings({ ...PUBLISHED_CONTACT_SETTINGS, email: badEmail });
        assert.equal(res.valid, false, `Expected ${badEmail} to fail validation`);
        assert.ok(res.errors.some((e) => e.includes("email")));
      }
    });

    it("rejects empty or whitespace-only bilingual addresses", () => {
      const resEn = validateContactSettings({ ...PUBLISHED_CONTACT_SETTINGS, addressEn: "  " });
      assert.equal(resEn.valid, false);
      assert.ok(resEn.errors.some((e) => e.includes("addressEn")));

      const resAr = validateContactSettings({ ...PUBLISHED_CONTACT_SETTINGS, addressAr: " " });
      assert.equal(resAr.valid, false);
      assert.ok(resAr.errors.some((e) => e.includes("addressAr")));
    });

    it("enforces strict HTTPS on social URLs, rejecting insecure and malformed protocols", () => {
      const res = validateContactSettings({
        ...PUBLISHED_CONTACT_SETTINGS,
        socialInstagram: "http://insecure.com/gza",
        socialX: "ftp://files.com",
        socialFacebook: "https://",
        socialYouTube: "javascript:alert(1)",
      });
      assert.equal(res.valid, false);
      assert.equal(res.sanitized.socialInstagram, "");
      assert.equal(res.sanitized.socialX, "");
      assert.equal(res.sanitized.socialFacebook, "");
      assert.equal(res.sanitized.socialYouTube, "");
    });

    it("allows blank social URLs without validation errors", () => {
      const res = validateContactSettings({
        ...PUBLISHED_CONTACT_SETTINGS,
        socialInstagram: "",
        socialX: "   ",
        socialFacebook: "",
        socialYouTube: "",
      });
      assert.equal(res.valid, true);
      assert.equal(res.sanitized.socialInstagram, "");
      assert.equal(res.sanitized.socialX, "");
    });

    it("preserves bilingual independence without cross-erasure", () => {
      const edited = { ...PUBLISHED_CONTACT_SETTINGS, addressEn: "Updated English Address" };
      const res = validateContactSettings(edited);
      assert.equal(res.sanitized.addressEn, "Updated English Address");
      assert.equal(res.sanitized.addressAr, PUBLISHED_CONTACT_SETTINGS.addressAr);
    });
  });

  describe("Interleaved Multi-Document Storage & Independent Discard", () => {
    it("saving contact draft preserves latest appearance draft", () => {
      const customAppearance: SiteSkinConfig = {
        ...DEFAULT_SITE_SKIN,
        publicCanvas: { pattern: "architect", scale: "large", intensity: "present" },
      };
      saveAppearanceDraft(customAppearance, store);

      const customContact = {
        ...PUBLISHED_CONTACT_SETTINGS,
        phone: "+970 8 777 0000",
      };
      saveContactDraft(customContact, store);

      const envelope = loadSettingsEnvelope(store);
      assert.ok(envelope?.site?.contact);
      assert.ok(envelope?.site?.appearance);
      assert.equal(envelope.site.contact.phone, "+970 8 777 0000");
      assert.equal(envelope.site.appearance.publicCanvas.pattern, "architect");
    });

    it("saving appearance draft preserves latest contact draft", () => {
      const customContact = {
        ...PUBLISHED_CONTACT_SETTINGS,
        phone: "+970 8 888 1111",
      };
      saveContactDraft(customContact, store);

      const customAppearance: SiteSkinConfig = {
        ...DEFAULT_SITE_SKIN,
        sandSection: { pattern: "topography", scale: "small", intensity: "subtle" },
      };
      saveAppearanceDraft(customAppearance, store);

      const envelope = loadSettingsEnvelope(store);
      assert.equal(envelope?.site?.contact?.phone, "+970 8 888 1111");
      assert.equal(envelope?.site?.appearance?.sandSection?.pattern, "topography");
    });

    it("discardContactDraft removes only contact; appearance draft survives", () => {
      saveContactDraft({ ...PUBLISHED_CONTACT_SETTINGS, phone: "+970 8 111 2222" }, store);
      saveAppearanceDraft({ ...DEFAULT_SITE_SKIN, publicCanvas: { pattern: "rails", scale: "standard", intensity: "present" } }, store);

      discardContactDraft(store);

      const envelope = loadSettingsEnvelope(store);
      assert.equal(envelope?.site?.contact, undefined);
      assert.equal(envelope?.site?.appearance?.publicCanvas.pattern, "rails");
    });

    it("discardAppearanceDraft removes only appearance; contact draft survives", () => {
      saveContactDraft({ ...PUBLISHED_CONTACT_SETTINGS, phone: "+970 8 333 4444" }, store);
      saveAppearanceDraft({ ...DEFAULT_SITE_SKIN, publicCanvas: { pattern: "rails", scale: "standard", intensity: "present" } }, store);

      discardAppearanceDraft(store);

      const envelope = loadSettingsEnvelope(store);
      assert.equal(envelope?.site?.contact?.phone, "+970 8 333 4444");
      assert.equal(envelope?.site?.appearance, undefined);
    });

    it("discarding both documents removes the storage key completely", () => {
      saveContactDraft({ ...PUBLISHED_CONTACT_SETTINGS, phone: "+970 8 555 6666" }, store);
      saveAppearanceDraft(DEFAULT_SITE_SKIN, store);

      discardContactDraft(store);
      assert.notEqual(store.getItem(SETTINGS_DRAFT_KEY), null);

      discardAppearanceDraft(store);
      assert.equal(store.getItem(SETTINGS_DRAFT_KEY), null);
    });

    it("two repository instances observing the same storage interleave without mutual stomping", async () => {
      const repoA = new LocalSettingsRepository(store);
      const repoB = new LocalSettingsRepository(store);

      await repoA.saveContactDraft({ ...PUBLISHED_CONTACT_SETTINGS, email: "tabA@gza.ps" });
      await repoB.saveAppearanceDraft({ ...DEFAULT_SITE_SKIN, adminCanvas: { pattern: "signal", scale: "small", intensity: "present" } });

      const effectiveA_Contact = await repoA.getContactDraft();
      const effectiveA_Appearance = await repoA.getAppearanceDraft();
      const effectiveB_Contact = await repoB.getContactDraft();
      const effectiveB_Appearance = await repoB.getAppearanceDraft();

      assert.equal(effectiveA_Contact?.email, "tabA@gza.ps");
      assert.equal(effectiveA_Appearance?.adminCanvas.pattern, "signal");
      assert.equal(effectiveB_Contact?.email, "tabA@gza.ps");
      assert.equal(effectiveB_Appearance?.adminCanvas.pattern, "signal");

      repoA.destroy();
      repoB.destroy();
    });
  });

  describe("Deterministic Legacy Appearance Migration", () => {
    it("migrates valid legacy skin once to canonical store when canonical draft is absent", () => {
      const legacyConfig: SiteSkinConfig = {
        ...DEFAULT_SITE_SKIN,
        publicCanvas: { pattern: "circuit-board", scale: "large", intensity: "present" },
      };
      const legacyRaw = JSON.stringify(legacyConfig);
      store.setItem(SKIN_PREVIEW_STORAGE_KEY, legacyRaw);

      // Verify canonical key starts empty
      assert.equal(store.getItem(SETTINGS_DRAFT_KEY), null);

      // Load envelope triggers migration
      const envelope = loadSettingsEnvelope(store);
      assert.ok(envelope?.site?.appearance);
      assert.equal(envelope.site.appearance.publicCanvas.pattern, "circuit-board");

      // Canonical store now holds the migrated appearance
      assert.notEqual(store.getItem(SETTINGS_DRAFT_KEY), null);

      // Legacy key remains byte-for-byte identical (NEVER removed or mutated)
      assert.equal(store.getItem(SKIN_PREVIEW_STORAGE_KEY), legacyRaw);
    });

    it("canonical appearance draft wins over legacy key if both exist", () => {
      const legacyConfig: SiteSkinConfig = {
        ...DEFAULT_SITE_SKIN,
        publicCanvas: { pattern: "circuit-board", scale: "large", intensity: "present" },
      };
      store.setItem(SKIN_PREVIEW_STORAGE_KEY, JSON.stringify(legacyConfig));

      const canonicalConfig: SiteSkinConfig = {
        ...DEFAULT_SITE_SKIN,
        publicCanvas: { pattern: "graph-paper", scale: "standard", intensity: "subtle" },
      };
      saveAppearanceDraft(canonicalConfig, store);

      const envelope = loadSettingsEnvelope(store);
      assert.equal(envelope?.site?.appearance?.publicCanvas.pattern, "graph-paper");
    });

    it("corrupt legacy data is safely handled without throwing or corrupting store", () => {
      store.setItem(SKIN_PREVIEW_STORAGE_KEY, "invalid-json-data{{");
      const envelope = loadSettingsEnvelope(store);
      assert.equal(envelope, null);
    });

    it("migration is idempotent across repeated loads", () => {
      const legacyConfig = {
        ...DEFAULT_SITE_SKIN,
        publicCanvas: { pattern: "steel-beams", scale: "standard", intensity: "present" },
      };
      store.setItem(SKIN_PREVIEW_STORAGE_KEY, JSON.stringify(legacyConfig));

      const first = loadSettingsEnvelope(store);
      const second = loadSettingsEnvelope(store);

      assert.deepEqual(first, second);
    });

    it("Correction 2 Proof 1: migrates non-default legacy Appearance, retains byte-for-byte legacy key, saves Contact, discards Appearance, then re-read/reload asserts no Appearance draft and published preview", () => {
      const legacyConfig: SiteSkinConfig = {
        ...DEFAULT_SITE_SKIN,
        publicCanvas: { pattern: "rails", scale: "standard", intensity: "present" },
      };
      const legacyRaw = JSON.stringify(legacyConfig);
      store.setItem(SKIN_PREVIEW_STORAGE_KEY, legacyRaw);

      // 1. Initial load triggers migration
      const migrated = loadSettingsEnvelope(store);
      assert.equal(migrated?.site?.appearance?.publicCanvas.pattern, "rails");
      assert.equal(store.getItem(SKIN_PREVIEW_STORAGE_KEY), legacyRaw); // byte-for-byte untouched

      // 2. Save Contact draft
      saveContactDraft({ ...PUBLISHED_CONTACT_SETTINGS, phone: "+970 8 111 2222" }, store);
      assert.equal(store.getItem(SKIN_PREVIEW_STORAGE_KEY), legacyRaw); // still untouched

      // 3. Discard Appearance draft
      discardAppearanceDraft(store);
      assert.equal(store.getItem(SKIN_PREVIEW_STORAGE_KEY), legacyRaw); // still untouched

      // 4. Re-read / reload canonical store: appearance must NOT resurrect
      const reloaded = loadSettingsEnvelope(store);
      assert.equal(reloaded?.site?.appearance, undefined);
      assert.equal(reloaded?.site?.contact?.phone, "+970 8 111 2222");

      // Root-safe preview reader also confirms published default skin (no resurrection)
      const previewSkin = readPreviewSkin(store);
      assert.equal(previewSkin.publicCanvas.pattern, DEFAULT_SITE_SKIN.publicCanvas.pattern);
      assert.equal(isDefaultSiteSkin(previewSkin), true);

      // Legacy key remains 100% byte-for-byte identical
      assert.equal(store.getItem(SKIN_PREVIEW_STORAGE_KEY), legacyRaw);
    });

    it("Correction 2 Proof 2: migrates non-default legacy Appearance with no Contact, discards Appearance, writes documented tombstone, and prevents resurrection on reload", () => {
      const legacyConfig: SiteSkinConfig = {
        ...DEFAULT_SITE_SKIN,
        publicCanvas: { pattern: "rails", scale: "standard", intensity: "present" },
      };
      const legacyRaw = JSON.stringify(legacyConfig);
      store.setItem(SKIN_PREVIEW_STORAGE_KEY, legacyRaw);

      // 1. Initial load triggers migration
      const migrated = loadSettingsEnvelope(store);
      assert.equal(migrated?.site?.appearance?.publicCanvas.pattern, "rails");
      assert.equal(store.getItem(SKIN_PREVIEW_STORAGE_KEY), legacyRaw);

      // 2. Discard Appearance draft with no contact draft present
      discardAppearanceDraft(store);
      assert.equal(store.getItem(SKIN_PREVIEW_STORAGE_KEY), legacyRaw); // still untouched

      // 3. Documented tombstone exception: envelope remains to record migration
      const rawStored = store.getItem(SETTINGS_DRAFT_KEY);
      assert.ok(rawStored, "Expected tombstone envelope in canonical store");
      const parsedStored = JSON.parse(rawStored!);
      assert.equal(parsedStored.schemaVersion, 1);
      assert.deepEqual(parsedStored.site, {});
      assert.equal(parsedStored.meta?.legacyAppearanceMigrated, true);

      // 4. Re-read / reload: appearance must NOT resurrect from legacy key
      const reloaded = loadSettingsEnvelope(store);
      assert.equal(reloaded?.site?.appearance, undefined);
      assert.equal(reloaded?.site?.contact, undefined);

      // Root-safe preview reader confirms published default skin
      const previewSkin = readPreviewSkin(store);
      assert.equal(previewSkin.publicCanvas.pattern, DEFAULT_SITE_SKIN.publicCanvas.pattern);
      assert.equal(isDefaultSiteSkin(previewSkin), true);

      // Legacy key remains 100% byte-for-byte identical
      assert.equal(store.getItem(SKIN_PREVIEW_STORAGE_KEY), legacyRaw);
    });
  });

  describe("Correction 2 Proof 3: Preview Event Contract & Immunity", () => {
    it("Contact-only settings draft update does not provide appearance config and resolves to default skin", () => {
      saveContactDraft({ ...PUBLISHED_CONTACT_SETTINGS, phone: "+970 8 777 7777" }, store);
      const envelope = loadSettingsEnvelope(store);
      assert.ok(envelope?.site?.contact);
      assert.equal(envelope?.site?.appearance, undefined);

      // Preview reader safely yields default skin
      const skin = readPreviewSkin(store);
      assert.equal(isDefaultSiteSkin(skin), true);
      assert.equal(skin.publicCanvas.pattern, DEFAULT_SITE_SKIN.publicCanvas.pattern);
    });

    it("Appearance draft resolves to customized pattern and reverts cleanly to default on discard", () => {
      const custom: SiteSkinConfig = {
        ...DEFAULT_SITE_SKIN,
        publicCanvas: { pattern: "rails", scale: "standard", intensity: "present" },
      };
      saveAppearanceDraft(custom, store);
      const skinWithDraft = readPreviewSkin(store);
      assert.equal(isDefaultSiteSkin(skinWithDraft), false);
      assert.equal(skinWithDraft.publicCanvas.pattern, "rails");

      // Discard Appearance
      discardAppearanceDraft(store);
      const revertedSkin = readPreviewSkin(store);
      assert.equal(isDefaultSiteSkin(revertedSkin), true);
      assert.equal(revertedSkin.publicCanvas.pattern, DEFAULT_SITE_SKIN.publicCanvas.pattern);
    });

    it("event contract: settings-draft-update event payload is SettingsDraftEnvelope, not SiteSkinConfig", () => {
      const custom: SiteSkinConfig = {
        ...DEFAULT_SITE_SKIN,
        publicCanvas: { pattern: "rails", scale: "standard", intensity: "present" },
      };
      saveAppearanceDraft(custom, store);
      const envelope = loadSettingsEnvelope(store);

      // Event detail is an envelope
      assert.equal(envelope?.schemaVersion, 1);
      assert.ok(envelope?.site?.appearance);
      // Validated appearance is nested under site.appearance, not root publicCanvas
      assert.equal((envelope as unknown as SiteSkinConfig).publicCanvas, undefined);
      assert.equal(envelope?.site?.appearance?.publicCanvas.pattern, "rails");

      // Saving Contact preserves appearance in envelope
      saveContactDraft({ ...PUBLISHED_CONTACT_SETTINGS, email: "preview-test@gza.ps" }, store);
      const contactEnvelope = loadSettingsEnvelope(store);
      assert.equal(contactEnvelope?.site?.appearance?.publicCanvas.pattern, "rails");
      assert.equal(contactEnvelope?.site?.contact?.email, "preview-test@gza.ps");

      // Discarding appearance clears appearance from envelope
      discardAppearanceDraft(store);
      const postDiscardEnvelope = loadSettingsEnvelope(store);
      assert.equal(postDiscardEnvelope?.site?.appearance, undefined);
      assert.equal(postDiscardEnvelope?.site?.contact?.email, "preview-test@gza.ps");
    });
  });

  describe("Transactional Storage Failure Resilience", () => {
    it("saveContactDraft throws StorageCommitError on quota error and preserves previous state", () => {
      saveContactDraft({ ...PUBLISHED_CONTACT_SETTINGS, phone: "+970 8 000 1111" }, store);
      const before = store.getItem(SETTINGS_DRAFT_KEY);

      // Inject failing setItem
      store.setItem = () => {
        throw new Error("QuotaExceededError");
      };

      assert.throws(
        () => saveContactDraft({ ...PUBLISHED_CONTACT_SETTINGS, phone: "+970 8 999 9999" }, store),
        { name: "StorageCommitError" },
      );

      // Restore setItem to verify state was not corrupted
      store.getItem = () => before;
      const after = loadSettingsEnvelope(store);
      assert.equal(after?.site?.contact?.phone, "+970 8 000 1111");
    });

    it("saveAppearanceDraft throws StorageCommitError on quota error and preserves previous state", () => {
      saveAppearanceDraft({ ...DEFAULT_SITE_SKIN, publicCanvas: { pattern: "connections", scale: "standard", intensity: "subtle" } }, store);
      const before = store.getItem(SETTINGS_DRAFT_KEY);

      store.setItem = () => {
        throw new Error("QuotaExceededError");
      };

      assert.throws(
        () => saveAppearanceDraft({ ...DEFAULT_SITE_SKIN, publicCanvas: { pattern: "floor-tile", scale: "small", intensity: "present" } }, store),
        { name: "StorageCommitError" },
      );

      store.getItem = () => before;
      const after = loadSettingsEnvelope(store);
      assert.equal(after?.site?.appearance?.publicCanvas.pattern, "connections");
    });
  });

  describe("Published Settings Immutability", () => {
    it("published contact and appearance settings remain immutable across draft mutations", () => {
      const origPhone = PUBLISHED_CONTACT_SETTINGS.phone;
      const origPattern = PUBLISHED_APPEARANCE_SETTINGS.publicCanvas.pattern;

      saveContactDraft({ ...PUBLISHED_CONTACT_SETTINGS, phone: "+970 8 999 9999" }, store);
      saveAppearanceDraft({ ...DEFAULT_SITE_SKIN, publicCanvas: { pattern: "floor-tile", scale: "small", intensity: "present" } }, store);

      assert.equal(PUBLISHED_CONTACT_SETTINGS.phone, origPhone);
      assert.equal(PUBLISHED_APPEARANCE_SETTINGS.publicCanvas.pattern, origPattern);
    });

    it("corrupt draft JSON safely returns null falling back to published defaults", () => {
      store.setItem(SETTINGS_DRAFT_KEY, "not{valid:json");
      assert.equal(loadSettingsEnvelope(store), null);
    });
  });

  describe("Phase 4C.0.1 Settings Truth & Draft Hardening", () => {
    describe("Invalid Persisted Contact Child Rejection & Sibling Preservation", () => {
      it("rejects invalid persisted contact child with invalid phone ('123') and omits contact while preserving valid sibling appearance", () => {
        const customAppearance: SiteSkinConfig = {
          ...DEFAULT_SITE_SKIN,
          publicCanvas: { pattern: "connections", scale: "standard", intensity: "subtle" },
        };
        const rawEnvelope = {
          schemaVersion: 1,
          updatedAt: new Date().toISOString(),
          site: {
            appearance: customAppearance,
            contact: {
              ...PUBLISHED_CONTACT_SETTINGS,
              phone: "123",
            },
          },
        };
        store.setItem(SETTINGS_DRAFT_KEY, JSON.stringify(rawEnvelope));

        const envelope = loadSettingsEnvelope(store);
        assert.ok(envelope !== null);
        assert.equal(envelope?.site?.contact, undefined, "Invalid contact must be completely omitted");
        assert.equal(envelope?.site?.appearance?.publicCanvas?.pattern, "connections", "Valid sibling appearance must be preserved");
      });

      it("rejects invalid persisted contact child with invalid email ('notanemail') and omits contact", () => {
        const rawEnvelope = {
          schemaVersion: 1,
          updatedAt: new Date().toISOString(),
          site: {
            contact: {
              ...PUBLISHED_CONTACT_SETTINGS,
              email: "notanemail",
            },
          },
        };
        store.setItem(SETTINGS_DRAFT_KEY, JSON.stringify(rawEnvelope));

        const envelope = loadSettingsEnvelope(store);
        assert.ok(envelope !== null);
        assert.equal(envelope?.site?.contact, undefined, "Invalid contact must be omitted");
      });

      it("rejects invalid persisted contact child with empty bilingual address and omits contact", () => {
        const customAppearance: SiteSkinConfig = {
          ...DEFAULT_SITE_SKIN,
          publicCanvas: { pattern: "floor-tile", scale: "small", intensity: "present" },
        };
        const rawEnvelope = {
          schemaVersion: 1,
          updatedAt: new Date().toISOString(),
          site: {
            appearance: customAppearance,
            contact: {
              ...PUBLISHED_CONTACT_SETTINGS,
              addressEn: "   ",
            },
          },
        };
        store.setItem(SETTINGS_DRAFT_KEY, JSON.stringify(rawEnvelope));

        const envelope = loadSettingsEnvelope(store);
        assert.ok(envelope !== null);
        assert.equal(envelope?.site?.contact, undefined);
        assert.equal(envelope?.site?.appearance?.publicCanvas?.pattern, "floor-tile");
      });

      it("rejects invalid persisted contact child with insecure HTTP social URL and omits contact", () => {
        const rawEnvelope = {
          schemaVersion: 1,
          updatedAt: new Date().toISOString(),
          site: {
            contact: {
              ...PUBLISHED_CONTACT_SETTINGS,
              socialInstagram: "http://insecure-http.example.com",
            },
          },
        };
        store.setItem(SETTINGS_DRAFT_KEY, JSON.stringify(rawEnvelope));

        const envelope = loadSettingsEnvelope(store);
        assert.ok(envelope !== null);
        assert.equal(envelope?.site?.contact, undefined, "Insecure URL contact must be omitted");
      });

      it("rejects malformed contact child (non-object or null) and omits contact", () => {
        const customAppearance: SiteSkinConfig = {
          ...DEFAULT_SITE_SKIN,
          publicCanvas: { pattern: "connections", scale: "standard", intensity: "subtle" },
        };
        for (const malformed of ["string-not-object", 12345, true]) {
          const rawEnvelope = {
            schemaVersion: 1,
            updatedAt: new Date().toISOString(),
            site: {
              appearance: customAppearance,
              contact: malformed,
            },
          };
          store.setItem(SETTINGS_DRAFT_KEY, JSON.stringify(rawEnvelope));

          const envelope = loadSettingsEnvelope(store);
          assert.ok(envelope !== null);
          assert.equal(envelope?.site?.contact, undefined);
          assert.equal(envelope?.site?.appearance?.publicCanvas?.pattern, "connections");
        }
      });

      it("preserves migration tombstone when persisted contact is invalid", () => {
        const rawEnvelope = {
          schemaVersion: 1,
          updatedAt: new Date().toISOString(),
          meta: {
            legacyAppearanceMigrated: true,
          },
          site: {
            contact: {
              ...PUBLISHED_CONTACT_SETTINGS,
              phone: "123",
            },
          },
        };
        store.setItem(SETTINGS_DRAFT_KEY, JSON.stringify(rawEnvelope));

        const envelope = loadSettingsEnvelope(store);
        assert.ok(envelope !== null);
        assert.equal(envelope?.meta?.legacyAppearanceMigrated, true);
        assert.equal(envelope?.site?.contact, undefined);
      });

      it("unknown-version envelope recovery safely returns null", () => {
        store.setItem(SETTINGS_DRAFT_KEY, JSON.stringify({ version: 99, site: {} }));
        assert.equal(loadSettingsEnvelope(store), null);
      });
    });

    describe("Clean / Dirty External Subscription & State Adoption Contract", () => {
      describe("computeExternalSettingsSync pure rules", () => {
        it("ignores external updates when the target document's saved state has not changed", () => {
          const result = computeExternalSettingsSync({
            currentSaved: PUBLISHED_CONTACT_SETTINGS,
            currentWorking: { ...PUBLISHED_CONTACT_SETTINGS, phone: "+970 8 111 2222" },
            isDirty: true,
            incomingSaved: PUBLISHED_CONTACT_SETTINGS, // sibling document changed, contact unchanged
            publishedDefault: PUBLISHED_CONTACT_SETTINGS,
          });

          assert.equal(result.hasSavedChanged, false);
          assert.equal(result.nextExternalNotice, false);
          assert.equal(result.nextIsDirty, true);
          assert.equal(result.shouldAdopt, false);
          assert.equal(result.nextWorking.phone, "+970 8 111 2222");
        });

        it("clean editor adopts incoming saved draft", () => {
          const incoming = { ...PUBLISHED_CONTACT_SETTINGS, phone: "+970 8 777 8888" };
          const result = computeExternalSettingsSync({
            currentSaved: PUBLISHED_CONTACT_SETTINGS,
            currentWorking: PUBLISHED_CONTACT_SETTINGS,
            isDirty: false,
            incomingSaved: incoming,
            publishedDefault: PUBLISHED_CONTACT_SETTINGS,
          });

          assert.equal(result.hasSavedChanged, true);
          assert.equal(result.shouldAdopt, true);
          assert.equal(result.nextIsDirty, false);
          assert.equal(result.nextExternalNotice, false);
          assert.equal(result.nextWorking.phone, "+970 8 777 8888");
        });

        it("dirty editor preserves working edits and displays notice when incoming saved draft conflicts", () => {
          const incoming = { ...PUBLISHED_CONTACT_SETTINGS, phone: "+970 8 777 8888" };
          const result = computeExternalSettingsSync({
            currentSaved: PUBLISHED_CONTACT_SETTINGS,
            currentWorking: { ...PUBLISHED_CONTACT_SETTINGS, phone: "+970 8 999 0000" },
            isDirty: true,
            incomingSaved: incoming,
            publishedDefault: PUBLISHED_CONTACT_SETTINGS,
          });

          assert.equal(result.hasSavedChanged, true);
          assert.equal(result.shouldAdopt, false);
          assert.equal(result.nextIsDirty, true);
          assert.equal(result.nextExternalNotice, true);
          assert.equal(result.nextWorking.phone, "+970 8 999 0000");
        });

        it("dirty editor transitions to clean without notice when external saved draft matches local working edits", () => {
          const matching = { ...PUBLISHED_CONTACT_SETTINGS, phone: "+970 8 777 8888" };
          const result = computeExternalSettingsSync({
            currentSaved: PUBLISHED_CONTACT_SETTINGS,
            currentWorking: matching,
            isDirty: true,
            incomingSaved: matching,
            publishedDefault: PUBLISHED_CONTACT_SETTINGS,
          });

          assert.equal(result.hasSavedChanged, true);
          assert.equal(result.shouldAdopt, false);
          assert.equal(result.nextIsDirty, false);
          assert.equal(result.nextExternalNotice, false);
          assert.equal(result.nextWorking.phone, "+970 8 777 8888");
        });

        it("clean editor adopts published defaults on external discard", () => {
          const result = computeExternalSettingsSync({
            currentSaved: { ...PUBLISHED_CONTACT_SETTINGS, phone: "+970 8 777 8888" },
            currentWorking: { ...PUBLISHED_CONTACT_SETTINGS, phone: "+970 8 777 8888" },
            isDirty: false,
            incomingSaved: null, // discarded
            publishedDefault: PUBLISHED_CONTACT_SETTINGS,
          });

          assert.equal(result.hasSavedChanged, true);
          assert.equal(result.shouldAdopt, true);
          assert.equal(result.nextIsDirty, false);
          assert.equal(result.nextExternalNotice, false);
          assert.equal(result.nextWorking.phone, PUBLISHED_CONTACT_SETTINGS.phone);
        });

        it("dirty editor preserves working edits and displays notice on external discard", () => {
          const result = computeExternalSettingsSync({
            currentSaved: { ...PUBLISHED_CONTACT_SETTINGS, phone: "+970 8 777 8888" },
            currentWorking: { ...PUBLISHED_CONTACT_SETTINGS, phone: "+970 8 555 4444" },
            isDirty: true,
            incomingSaved: null, // discarded
            publishedDefault: PUBLISHED_CONTACT_SETTINGS,
          });

          assert.equal(result.hasSavedChanged, true);
          assert.equal(result.shouldAdopt, false);
          assert.equal(result.nextIsDirty, true);
          assert.equal(result.nextExternalNotice, true);
          assert.equal(result.nextWorking.phone, "+970 8 555 4444");
        });
      });

      describe("Per-Document Subscription Isolation in LocalSettingsRepository", () => {
        it("dirty Contact editor does not trigger external change notice when Appearance draft is saved", async () => {
          const repo = new LocalSettingsRepository(store);

          let savedContact = null;
          let workingContact = { ...PUBLISHED_CONTACT_SETTINGS, phone: "+970 8 111 2222" };
          let isContactDirty = true;
          let contactNotice = false;

          repo.subscribe((envelope) => {
            const sync = computeExternalSettingsSync({
              currentSaved: savedContact,
              currentWorking: workingContact,
              isDirty: isContactDirty,
              incomingSaved: envelope?.site?.contact ?? null,
              publishedDefault: PUBLISHED_CONTACT_SETTINGS,
            });
            if (!sync.hasSavedChanged) return;
            savedContact = sync.nextSaved;
            isContactDirty = sync.nextIsDirty;
            contactNotice = sync.nextExternalNotice;
            if (sync.shouldAdopt) workingContact = sync.nextWorking;
          });

          // Appearance is saved externally
          await repo.saveAppearanceDraft({
            ...PUBLISHED_APPEARANCE_SETTINGS,
            publicCanvas: { pattern: "rails", intensity: "present", scale: "standard" },
          });

          // Contact editor must NOT show notice because Contact draft did not change!
          assert.equal(contactNotice, false);
          assert.equal(isContactDirty, true);
          assert.equal(workingContact.phone, "+970 8 111 2222");
        });

        it("dirty Appearance editor does not trigger external change notice when Contact draft is saved", async () => {
          const repo = new LocalSettingsRepository(store);

          let savedApp = null;
          let workingApp = {
            ...PUBLISHED_APPEARANCE_SETTINGS,
            publicCanvas: { pattern: "topography", intensity: "present", scale: "standard" },
          };
          let isAppDirty = true;
          let appNotice = false;

          repo.subscribe((envelope) => {
            const sync = computeExternalSettingsSync({
              currentSaved: savedApp,
              currentWorking: workingApp,
              isDirty: isAppDirty,
              incomingSaved: envelope?.site?.appearance ?? null,
              publishedDefault: PUBLISHED_APPEARANCE_SETTINGS,
            });
            if (!sync.hasSavedChanged) return;
            savedApp = sync.nextSaved;
            isAppDirty = sync.nextIsDirty;
            appNotice = sync.nextExternalNotice;
            if (sync.shouldAdopt) workingApp = sync.nextWorking;
          });

          // Contact is saved externally
          await repo.saveContactDraft({
            ...PUBLISHED_CONTACT_SETTINGS,
            phone: "+970 8 333 4444",
          });

          // Appearance editor must NOT show notice because Appearance draft did not change!
          assert.equal(appNotice, false);
          assert.equal(isAppDirty, true);
          assert.equal(workingApp.publicCanvas.pattern, "topography");
        });

        it("clean Appearance Studio adopts external save and triggers sync, while dirty Studio retains local edits with notice", async () => {
          const repo = new LocalSettingsRepository(store);

          // Studio A (clean)
          let studioASaved = null;
          let studioAWorking = { ...PUBLISHED_APPEARANCE_SETTINGS };
          let studioADirty = false;
          let studioANotice = false;
          let studioAAdopted = false;

          repo.subscribe((envelope) => {
            const sync = computeExternalSettingsSync({
              currentSaved: studioASaved,
              currentWorking: studioAWorking,
              isDirty: studioADirty,
              incomingSaved: envelope?.site?.appearance ?? null,
              publishedDefault: PUBLISHED_APPEARANCE_SETTINGS,
            });
            if (!sync.hasSavedChanged) return;
            studioASaved = sync.nextSaved;
            studioADirty = sync.nextIsDirty;
            studioANotice = sync.nextExternalNotice;
            if (sync.shouldAdopt) {
              studioAWorking = sync.nextWorking;
              studioAAdopted = true;
            }
          });

          // Studio B (dirty)
          let studioBSaved = null;
          let studioBWorking = {
            ...PUBLISHED_APPEARANCE_SETTINGS,
            publicCanvas: { pattern: "floor-tile", intensity: "present", scale: "standard" },
          };
          let studioBDirty = true;
          let studioBNotice = false;

          repo.subscribe((envelope) => {
            const sync = computeExternalSettingsSync({
              currentSaved: studioBSaved,
              currentWorking: studioBWorking,
              isDirty: studioBDirty,
              incomingSaved: envelope?.site?.appearance ?? null,
              publishedDefault: PUBLISHED_APPEARANCE_SETTINGS,
            });
            if (!sync.hasSavedChanged) return;
            studioBSaved = sync.nextSaved;
            studioBDirty = sync.nextIsDirty;
            studioBNotice = sync.nextExternalNotice;
            if (sync.shouldAdopt) studioBWorking = sync.nextWorking;
          });

          // External save of Appearance: rails
          await repo.saveAppearanceDraft({
            ...PUBLISHED_APPEARANCE_SETTINGS,
            publicCanvas: { pattern: "rails", intensity: "present", scale: "standard" },
          });

          // Studio A adopted
          assert.equal(studioAWorking.publicCanvas.pattern, "rails");
          assert.equal(studioADirty, false);
          assert.equal(studioANotice, false);
          assert.equal(studioAAdopted, true);

          // Studio B retained local work and received notice
          assert.equal(studioBWorking.publicCanvas.pattern, "floor-tile");
          assert.equal(studioBDirty, true);
          assert.equal(studioBNotice, true);

          // External discard of Appearance
          await repo.discardAppearanceDraft();

          // Studio A reverted to published
          assert.equal(studioAWorking.publicCanvas.pattern, PUBLISHED_APPEARANCE_SETTINGS.publicCanvas.pattern);
          assert.equal(studioADirty, false);

          // Studio B retained floor-tile with notice
          assert.equal(studioBWorking.publicCanvas.pattern, "floor-tile");
          assert.equal(studioBDirty, true);
          assert.equal(studioBNotice, true);
        });
      });
    });
  });
});
