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
import { networkEn, networkAr } from "./i18n-network";
import { servicesEn, servicesAr } from "./i18n-services";
import { en, ar, type Dict } from "./i18n-public.ts";

export type { Lang, Dict };

// Scoped fallbacks for the minimal ops keys invoked across public pages/providers
const publicFallbackEn: Dict = {
  "adm.ops.retry": "Retry",
  "adm.ops.loading": "Loading repository data…",
  "a2.ac.auditWarning": "Changes saved, but activity log could not be recorded in this browser.",
};

const publicFallbackAr: Dict = {
  "adm.ops.retry": "حاول مجددًا",
  "adm.ops.loading": "جارٍ تحميل بيانات المستودع…",
  "a2.ac.auditWarning": "تم حفظ التعديلات بنجاح، ولكن تعذر تسجيل سجل النشاط في هذا المتصفح.",
};

const enAll: Dict = { ...en, ...networkEn, ...servicesEn, ...publicFallbackEn };
const arAll: Dict = { ...ar, ...networkAr, ...servicesAr, ...publicFallbackAr };

const dictionaries: Record<Lang, Dict> = { en: enAll, ar: arAll };

export type I18nValue = {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

export const I18nContext = createContext<I18nValue | null>(null);
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
