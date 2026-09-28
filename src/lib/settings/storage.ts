import type { SettingsDraftEnvelope, ContactSettings, AppearanceSettings } from "./types.ts";
import { validateContactSettings } from "./validation.ts";
import { sanitizeSiteSkinConfig, SKIN_PREVIEW_STORAGE_KEY } from "../skin.ts";

export const SETTINGS_DRAFT_KEY = "gza.settings.draft.v1";
export const SETTINGS_DRAFT_EVENT = "gza:settings-draft-update";
export const SETTINGS_SCHEMA_VERSION = 1;

export class StorageCommitError extends Error {
  public override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "StorageCommitError";
    this.cause = cause;
  }
}

export function getStorage(customStorage?: Storage | null): Storage | null {
  if (customStorage !== undefined) return customStorage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function dispatchDraftEvent(detail: SettingsDraftEnvelope | null) {
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(SETTINGS_DRAFT_EVENT, { detail }));
    } catch {
      // ignore in test / non-DOM environments
    }
  }
}

/**
 * Loads the current canonical draft envelope.
 * Implements deterministic legacy migration: if canonical appearance draft is absent,
 * a valid sanitized legacy skin from `gza.skin.preview.v1` is committed once to canonical
 * while leaving the legacy key byte-for-byte untouched.
 */
export function loadSettingsEnvelope(customStorage?: Storage | null): SettingsDraftEnvelope | null {
  const storage = getStorage(customStorage);
  if (!storage) return null;

  let envelope: SettingsDraftEnvelope | null = null;

  try {
    const raw = storage.getItem(SETTINGS_DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (parsed.schemaVersion === 1 && parsed.site && typeof parsed.site === "object") {
          envelope = {
            schemaVersion: 1,
            site: {
              ...(parsed.site.contact ? { contact: validateContactSettings(parsed.site.contact).sanitized } : {}),
              ...(parsed.site.appearance ? { appearance: sanitizeSiteSkinConfig(parsed.site.appearance) } : {}),
            },
            ...(parsed.meta && typeof parsed.meta === "object" ? { meta: parsed.meta } : {}),
          };
        } else if (parsed.version === 1) {
          // Compatibility with interim schema
          envelope = {
            schemaVersion: 1,
            site: {
              ...(parsed.contact ? { contact: validateContactSettings(parsed.contact).sanitized } : {}),
              ...(parsed.appearance ? { appearance: sanitizeSiteSkinConfig(parsed.appearance) } : {}),
            },
          };
        }
      }
    }
  } catch {
    // Corrupt JSON: return null safely
    return null;
  }

  // Deterministic Legacy Migration:
  // Only runs if canonical appearance draft is absent AND migration has never run
  if (!envelope?.site?.appearance && !envelope?.meta?.legacyAppearanceMigrated) {
    try {
      const rawLegacy = storage.getItem(SKIN_PREVIEW_STORAGE_KEY);
      if (rawLegacy) {
        const parsedLegacy = JSON.parse(rawLegacy);
        if (parsedLegacy && typeof parsedLegacy === "object") {
          const sanitizedLegacy = sanitizeSiteSkinConfig(parsedLegacy);
          const migratedEnvelope: SettingsDraftEnvelope = {
            schemaVersion: 1,
            site: {
              ...(envelope?.site?.contact ? { contact: envelope.site.contact } : {}),
              appearance: sanitizedLegacy,
            },
            meta: {
              ...envelope?.meta,
              legacyAppearanceMigrated: true,
            },
          };

          // Commit migrated appearance to canonical store once
          try {
            storage.setItem(SETTINGS_DRAFT_KEY, JSON.stringify(migratedEnvelope));
            dispatchDraftEvent(migratedEnvelope);
          } catch {
            // Storage quota or restriction: still return migrated in memory without crashing
          }

          // Legacy key is left completely untouched (never deleted, never modified)
          return migratedEnvelope;
        }
      }
    } catch {
      // Malformed legacy data is safe; do not crash
    }
  }

  return envelope;
}

export function saveContactDraft(contact: ContactSettings, customStorage?: Storage | null): void {
  const storage = getStorage(customStorage);
  if (!storage) {
    throw new StorageCommitError("Storage is not available. Please check browser privacy settings.");
  }

  const validation = validateContactSettings(contact);
  if (!validation.valid) {
    throw new Error("Invalid contact settings: " + validation.errors.join("; "));
  }

  // Read latest stored state to avoid mutual overwrites
  const current = loadSettingsEnvelope(customStorage);
  const nextEnvelope: SettingsDraftEnvelope = {
    schemaVersion: 1,
    site: {
      ...(current?.site?.appearance ? { appearance: current.site.appearance } : {}),
      contact: validation.sanitized,
    },
    ...(current?.meta ? { meta: current.meta } : {}),
  };

  try {
    storage.setItem(SETTINGS_DRAFT_KEY, JSON.stringify(nextEnvelope));
    dispatchDraftEvent(nextEnvelope);
  } catch (err) {
    throw new StorageCommitError("Failed to save contact draft. Quota may be exceeded.", err);
  }
}

export function discardContactDraft(customStorage?: Storage | null): void {
  const storage = getStorage(customStorage);
  if (!storage) {
    throw new StorageCommitError("Storage is not available. Please check browser privacy settings.");
  }

  const current = loadSettingsEnvelope(customStorage);
  if (!current) return;

  const wasMigrated = Boolean(current.meta?.legacyAppearanceMigrated);

  try {
    if (current.site?.appearance) {
      const nextEnvelope: SettingsDraftEnvelope = {
        schemaVersion: 1,
        site: {
          appearance: current.site.appearance,
        },
        ...(wasMigrated ? { meta: { ...current.meta, legacyAppearanceMigrated: true } } : {}),
      };
      storage.setItem(SETTINGS_DRAFT_KEY, JSON.stringify(nextEnvelope));
      dispatchDraftEvent(nextEnvelope);
    } else if (wasMigrated) {
      // Both drafts now empty, but legacy migration was performed: keep tombstone so legacy is not re-imported
      const tombstoneEnvelope: SettingsDraftEnvelope = {
        schemaVersion: 1,
        site: {},
        meta: {
          ...current.meta,
          legacyAppearanceMigrated: true,
        },
      };
      storage.setItem(SETTINGS_DRAFT_KEY, JSON.stringify(tombstoneEnvelope));
      dispatchDraftEvent(tombstoneEnvelope);
    } else {
      storage.removeItem(SETTINGS_DRAFT_KEY);
      dispatchDraftEvent(null);
    }
  } catch (err) {
    throw new StorageCommitError("Failed to discard contact draft.", err);
  }
}

export function saveAppearanceDraft(appearance: AppearanceSettings, customStorage?: Storage | null): void {
  const storage = getStorage(customStorage);
  if (!storage) {
    throw new StorageCommitError("Storage is not available. Please check browser privacy settings.");
  }

  const sanitized = sanitizeSiteSkinConfig(appearance);

  // Read latest stored state to avoid mutual overwrites
  const current = loadSettingsEnvelope(customStorage);
  const nextEnvelope: SettingsDraftEnvelope = {
    schemaVersion: 1,
    site: {
      ...(current?.site?.contact ? { contact: current.site.contact } : {}),
      appearance: sanitized,
    },
    ...(current?.meta ? { meta: current.meta } : {}),
  };

  try {
    storage.setItem(SETTINGS_DRAFT_KEY, JSON.stringify(nextEnvelope));
    dispatchDraftEvent(nextEnvelope);
  } catch (err) {
    throw new StorageCommitError("Failed to save appearance draft. Quota may be exceeded.", err);
  }
}

export function discardAppearanceDraft(customStorage?: Storage | null): void {
  const storage = getStorage(customStorage);
  if (!storage) {
    throw new StorageCommitError("Storage is not available. Please check browser privacy settings.");
  }

  const current = loadSettingsEnvelope(customStorage);
  if (!current) return;

  const wasMigrated = Boolean(current.meta?.legacyAppearanceMigrated);

  try {
    if (current.site?.contact) {
      const nextEnvelope: SettingsDraftEnvelope = {
        schemaVersion: 1,
        site: {
          contact: current.site.contact,
        },
        ...(wasMigrated ? { meta: { ...current.meta, legacyAppearanceMigrated: true } } : {}),
      };
      storage.setItem(SETTINGS_DRAFT_KEY, JSON.stringify(nextEnvelope));
      dispatchDraftEvent(nextEnvelope);
    } else if (wasMigrated) {
      // Both drafts now empty, but legacy migration was performed: keep tombstone so legacy is not re-imported
      const tombstoneEnvelope: SettingsDraftEnvelope = {
        schemaVersion: 1,
        site: {},
        meta: {
          ...current.meta,
          legacyAppearanceMigrated: true,
        },
      };
      storage.setItem(SETTINGS_DRAFT_KEY, JSON.stringify(tombstoneEnvelope));
      dispatchDraftEvent(tombstoneEnvelope);
    } else {
      storage.removeItem(SETTINGS_DRAFT_KEY);
      dispatchDraftEvent(null);
    }
  } catch (err) {
    throw new StorageCommitError("Failed to discard appearance draft.", err);
  }
}

/**
 * Backward compatibility helper for full draft round-trips.
 */
export function loadSettingsDraft(customStorage?: Storage | null): SettingsDraftEnvelope | null {
  return loadSettingsEnvelope(customStorage);
}

export function saveSettingsDraft(draft: SettingsDraftEnvelope | null, customStorage?: Storage | null): void {
  const storage = getStorage(customStorage);
  if (!storage) {
    throw new StorageCommitError("Storage is not available. Please check browser privacy settings.");
  }

  try {
    if (draft === null) {
      storage.removeItem(SETTINGS_DRAFT_KEY);
      dispatchDraftEvent(null);
    } else {
      storage.setItem(SETTINGS_DRAFT_KEY, JSON.stringify(draft));
      dispatchDraftEvent(draft);
    }
  } catch (err) {
    throw new StorageCommitError("Failed to save settings draft.", err);
  }
}
