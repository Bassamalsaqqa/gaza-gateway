import type {
  ContactSettings,
  AppearanceSettings,
  SettingsDraftEnvelope,
  SettingsRepository,
} from "./types.ts";
import { PUBLISHED_CONTACT_SETTINGS, PUBLISHED_APPEARANCE_SETTINGS } from "./defaults.ts";
import {
  loadSettingsEnvelope,
  saveContactDraft,
  discardContactDraft,
  saveAppearanceDraft,
  discardAppearanceDraft,
  SETTINGS_DRAFT_KEY,
  SETTINGS_DRAFT_EVENT,
} from "./storage.ts";

export class LocalSettingsRepository implements SettingsRepository {
  private subscribers: Set<(envelope: SettingsDraftEnvelope | null) => void> = new Set();
  private customStorage: Storage | null | undefined;

  constructor(customStorage?: Storage | null) {
    this.customStorage = customStorage;
    if (typeof window !== "undefined") {
      window.addEventListener(SETTINGS_DRAFT_EVENT, this.handleCustomEvent);
      window.addEventListener("storage", this.handleStorageEvent);
    }
  }

  public destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener(SETTINGS_DRAFT_EVENT, this.handleCustomEvent);
      window.removeEventListener("storage", this.handleStorageEvent);
    }
    this.subscribers.clear();
  }

  private handleCustomEvent = (e: Event) => {
    const detail = (e as CustomEvent<SettingsDraftEnvelope | null>).detail;
    this.notify(detail);
  };

  private handleStorageEvent = (e: StorageEvent) => {
    if (e.key === SETTINGS_DRAFT_KEY) {
      this.notify(loadSettingsEnvelope(this.customStorage));
    }
  };

  private notify(envelope: SettingsDraftEnvelope | null) {
    for (const sub of this.subscribers) {
      try {
        sub(envelope);
      } catch (err) {
        console.error("SettingsRepository subscriber error:", err);
      }
    }
  }

  getPublishedContact(): ContactSettings {
    return { ...PUBLISHED_CONTACT_SETTINGS };
  }

  async getContactDraft(): Promise<ContactSettings | null> {
    const envelope = loadSettingsEnvelope(this.customStorage);
    return envelope?.site?.contact ?? null;
  }

  async getEffectiveContact(): Promise<ContactSettings> {
    const draft = await this.getContactDraft();
    return draft ?? this.getPublishedContact();
  }

  async saveContactDraft(contact: ContactSettings): Promise<void> {
    saveContactDraft(contact, this.customStorage);
  }

  async discardContactDraft(): Promise<void> {
    discardContactDraft(this.customStorage);
  }

  getPublishedAppearance(): AppearanceSettings {
    return { ...PUBLISHED_APPEARANCE_SETTINGS };
  }

  async getAppearanceDraft(): Promise<AppearanceSettings | null> {
    const envelope = loadSettingsEnvelope(this.customStorage);
    return envelope?.site?.appearance ?? null;
  }

  async getEffectiveAppearance(): Promise<AppearanceSettings> {
    const draft = await this.getAppearanceDraft();
    return draft ?? this.getPublishedAppearance();
  }

  async saveAppearanceDraft(appearance: AppearanceSettings): Promise<void> {
    saveAppearanceDraft(appearance, this.customStorage);
  }

  async discardAppearanceDraft(): Promise<void> {
    discardAppearanceDraft(this.customStorage);
  }

  async getDraftEnvelope(): Promise<SettingsDraftEnvelope | null> {
    return loadSettingsEnvelope(this.customStorage);
  }

  subscribe(callback: (envelope: SettingsDraftEnvelope | null) => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }
}

export const settingsRepository = new LocalSettingsRepository();
