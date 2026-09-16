export type Lang = "en" | "ar";

export const LOCALE_PREFIX = "ar";

/** Language implied by a pathname. The URL is always the source of truth. */
export function langFromPath(pathname: string): Lang {
  return pathname === `/${LOCALE_PREFIX}` || pathname.startsWith(`/${LOCALE_PREFIX}/`) ? "ar" : "en";
}

/** Remove the locale prefix, returning the canonical English path. */
export function stripLocale(pathname: string): string {
  if (pathname === `/${LOCALE_PREFIX}`) return "/";
  if (pathname.startsWith(`/${LOCALE_PREFIX}/`)) return pathname.slice(`/${LOCALE_PREFIX}`.length) || "/";
  return pathname || "/";
}

/** Add the locale prefix to a canonical English path. */
export function localizePath(path: string, lang: Lang): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (lang !== "ar") return clean;
  return clean === "/" ? `/${LOCALE_PREFIX}` : `/${LOCALE_PREFIX}${clean}`;
}

/** Same logical page, other language. */
export function swapLangPath(pathname: string, lang: Lang): string {
  return localizePath(stripLocale(pathname), lang);
}

export function dirOf(lang: Lang): "ltr" | "rtl" {
  return lang === "ar" ? "rtl" : "ltr";
}
