import type { SiteSkinConfig } from "../skin.ts";

export type ContactSettings = {
  phone: string; // e.g. "+970 8 000 0000"
  email: string; // e.g. "hello@gza-airport.ps"
  addressEn: string;
  addressAr: string;
  socialInstagram: string; // URL, blank, or HTTPS only
  socialX: string;
  socialFacebook: string;
  socialYouTube: string;
};

export type AppearanceSettings = SiteSkinConfig;

export interface SettingsDraftEnvelope {
  schemaVersion: 1;
  site?: {
    contact?: ContactSettings;
    appearance?: AppearanceSettings;
  };
  meta?: {
    legacyAppearanceMigrated?: boolean;
  };
}

export type SettingsDraft = SettingsDraftEnvelope;

export interface SettingsValidationResult<T> {
  valid: boolean;
  errors: string[];
  sanitized: T;
}

export interface SettingsRepository {
  getPublishedContact(): ContactSettings;
  getContactDraft(): Promise<ContactSettings | null>;
  getEffectiveContact(): Promise<ContactSettings>;
  saveContactDraft(contact: ContactSettings): Promise<void>;
  discardContactDraft(): Promise<void>;

  getPublishedAppearance(): AppearanceSettings;
  getAppearanceDraft(): Promise<AppearanceSettings | null>;
  getEffectiveAppearance(): Promise<AppearanceSettings>;
  saveAppearanceDraft(appearance: AppearanceSettings): Promise<void>;
  discardAppearanceDraft(): Promise<void>;

  getDraftEnvelope(): Promise<SettingsDraftEnvelope | null>;
  subscribe(callback: (envelope: SettingsDraftEnvelope | null) => void): () => void;
}
