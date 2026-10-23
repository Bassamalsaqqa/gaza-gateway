import { useCallback, useMemo, type ReactNode } from "react";
import { I18nContext, useI18n, type Dict, type I18nValue, type Lang } from "@/lib/i18n";
import { adminEn, adminAr } from "@/lib/i18n-admin";
import { admin2En, admin2Ar } from "@/lib/i18n-admin2";
import { archiveAdminEn, archiveAdminAr } from "@/lib/i18n-archive-admin";

const adminEnAll: Dict = { ...adminEn, ...admin2En, ...archiveAdminEn };
const adminArAll: Dict = { ...adminAr, ...admin2Ar, ...archiveAdminAr };
const adminDicts: Record<Lang, Dict> = { en: adminEnAll, ar: adminArAll };

/**
 * Safe lazy admin translation boundary preserving SSR and hydration
 * for both EN and AR public and admin rendering.
 *
 * This boundary scopes the large admin dictionaries (~142 KB uncompressed)
 * strictly to admin route chunks, eliminating them from the initial public bundle.
 */
export function AdminTranslationBoundary({ children }: { children: ReactNode }) {
  const parent = useI18n();

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const table = adminDicts[parent.lang] ?? adminDicts["en"];
      let value = table[key] ?? adminEnAll[key];
      if (value !== undefined) {
        if (vars) {
          for (const [k, v] of Object.entries(vars)) {
            value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
          }
        }
        return value;
      }
      return parent.t(key, vars);
    },
    [parent],
  );

  const value = useMemo<I18nValue>(
    () => ({
      ...parent,
      t,
    }),
    [parent, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
