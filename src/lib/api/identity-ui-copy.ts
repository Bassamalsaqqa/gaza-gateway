/** Separate locale strings, selected before rendering any identity label. */
export function identityCopy(lang: "en" | "ar", en: string, ar: string): string {
  return lang === "ar" ? ar : en;
}
