import type { Lang } from "./i18n";

export function money(amount: number, lang: Lang): string {
  const formatted = new Intl.NumberFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    numberingSystem: "latn",
  }).format(amount);
  return formatted;
}

export function dateLong(iso: string | undefined | null, lang: Lang): string {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function dateShort(iso: string | undefined | null, lang: Lang): string {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

export function weekdayName(index: number, lang: Lang): string {
  const base = new Date(2024, 8, 1 + index); // 2024-09-01 was a Sunday
  return new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en-GB", { weekday: "short" }).format(base);
}

export function makePnr(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "0123456789";
  let out = "";
  for (let i = 0; i < 3; i++) out += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 3; i++) out += digits[Math.floor(Math.random() * digits.length)];
  return out;
}
