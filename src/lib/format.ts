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

/**
 * Splits date into prominent short date (e.g. "12 Oct") and quieter weekday (e.g. "Monday").
 * Uses Latin digits in Arabic mode ("ar-u-nu-latn") per repository invariant.
 * Day and month are joined with a non-breaking space so they never wrap across lines.
 */
export function dateParts(
  iso: string | undefined | null,
  lang: Lang,
): { day: string; month: string; dayMonth: string; weekday: string } | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d.getTime())) return null;
  const day = new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", {
    day: "numeric",
  }).format(d);
  const month = new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", {
    month: "short",
  }).format(d);
  const rawDayMonth = new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", {
    day: "numeric",
    month: "short",
  }).format(d);
  const dayMonth = rawDayMonth.replace(/\s+/g, "\u00A0");
  const weekday = new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", {
    weekday: "long",
  }).format(d);
  return { day, month, dayMonth, weekday };
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
