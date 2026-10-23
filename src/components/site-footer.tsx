import { AppLink } from "@/components/app-link";
import { Brand } from "./brand";
import { pick, useI18n } from "@/lib/i18n";

import { footerColumns as columns } from "@/lib/site-navigation";
import { identityUiRequested } from "@/lib/api/identity-ui-runtime";

export function SiteFooter() {
  const { t, lang } = useI18n();
  return (
    <footer className="mt-20 border-t border-ink-border bg-ink text-ink-foreground">
      <div className="page-shell grid gap-10 px-4 py-14 sm:px-6 lg:px-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <Brand tone="dark" />
          <p className="mt-4 max-w-xs text-sm text-ink-muted">{t("home.storySub")}</p>
        </div>
        {columns.map((col) => (
          <nav key={col.key} aria-label={t(col.key)}>
            <h2 className="eyebrow text-clay-soft">{t(col.key)}</h2>
            <ul className="mt-4 space-y-2.5">
              {col.links.filter((link) => !identityUiRequested || link.to !== "/check-in").map((link) => (
                <li key={link.to + link.key}>
                  <AppLink to={link.to} className="text-sm text-ink-muted transition-colors hover:text-ink-foreground">
                    {t(link.key)}
                  </AppLink>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-ink-border">
        <div className="page-shell flex flex-col gap-3 px-4 py-6 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            <AppLink to="/about" className="transition-colors hover:text-ink-foreground underline underline-offset-2">
              {pick(lang, {
                en: "Gaza International Airport — Remade · An art project by Ayman Alazraq",
                ar: "مطار غزة الدولي — إعادة صياغة · مشروع فني لأيمن الأزرق",
              })}
            </AppLink>
          </p>
          <div className="flex flex-col gap-1 sm:items-end">
          <p>
            © {new Date().getFullYear()} {t("brand.airport")} · <span className="code-id">GZA</span>
          </p>
            <p>{t("footer.rights")}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
