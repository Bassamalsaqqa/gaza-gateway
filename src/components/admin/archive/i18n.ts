import { useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { archiveAdminEn, archiveAdminAr } from "@/lib/i18n-archive-admin";

export {
  formatDateWithPrecision,
  getEvidenceStatusTone,
  getPublicationStateTone,
  getRightsStatusTone,
} from "./filter-helpers";

export function useArchiveAdminI18n() {
  const { lang, t: globalT } = useI18n();

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const dict = lang === "ar" ? archiveAdminAr : archiveAdminEn;
      let text = dict[key] ?? globalT(key);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return text;
    },
    [lang, globalT],
  );

  return { lang, t };
}
