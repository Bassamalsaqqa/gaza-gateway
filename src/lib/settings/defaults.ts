import type { ContactSettings, AppearanceSettings } from "./types.ts";
import { DEFAULT_SITE_SKIN } from "../skin.ts";

export const PUBLISHED_CONTACT_SETTINGS: ContactSettings = {
  phone: "+970 8 000 0000",
  email: "hello@gza-airport.ps",
  addressEn: "Gaza International Airport, Gaza",
  addressAr: "مطار غزة الدولي، غزة",
  socialInstagram: "",
  socialX: "",
  socialFacebook: "",
  socialYouTube: "",
};

export const PUBLISHED_APPEARANCE_SETTINGS: AppearanceSettings = {
  ...DEFAULT_SITE_SKIN
};
