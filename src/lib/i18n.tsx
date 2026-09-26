import { useRouter, useRouterState } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { dirOf, langFromPath, swapLangPath, type Lang } from "./locale";
import { adminEn, adminAr } from "./i18n-admin";
import { admin2En, admin2Ar } from "./i18n-admin2";
import { en, ar, type Dict } from "./i18n-public.ts";

export type { Lang };

const enAll: Dict = { ...en, ...adminEn, ...admin2En };
const arAll: Dict = { ...ar, ...adminAr, ...admin2Ar };

const dictionaries: Record<Lang, Dict> = { en: enAll, ar: arAll };

type I18nValue = {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nValue | null>(null);
const STORAGE_KEY = "gza.lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  // The URL is the only source of truth for language: `/…` = English, `/ar/…` = Arabic.
  const lang = langFromPath(pathname);

  useEffect(() => {
    const dir = dirOf(lang);
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", dir);
    // Remembered for convenience only; it never overrides an explicit URL.
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const setLang = useCallback(
    (next: Lang) => {
      if (next === lang) return;
      const href = `${swapLangPath(pathname, next)}${searchStr ?? ""}`;
      void router.navigate({ href } as never);
    },
    [lang, pathname, searchStr, router],
  );

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const table = dictionaries[lang];
      let value = table[key] ?? enAll[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return value;
    },
    [lang],
  );

  const value = useMemo<I18nValue>(
    () => ({ lang, dir: dirOf(lang), setLang, t }),
    [lang, setLang, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      lang: "en",
      dir: "ltr",
      setLang: () => {},
      t: (key: string) => enAll[key] ?? key,
    };
  }
  return ctx;
}

/** Pick a localized value from an { en, ar } pair. */
export function pick(lang: Lang, pair: { en: string; ar: string }): string {
  return lang === "ar" ? pair.ar : pair.en;
}
