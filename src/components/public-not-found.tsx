import { AppLink } from "@/components/app-link";
import { btnClass } from "@/components/kit";
import { useI18n } from "@/lib/i18n";

export function PublicNotFound() {
  const { t } = useI18n();
  const links = [
    { to: "/", label: t("nav.home") },
    { to: "/flights", label: t("nav.flights") },
    { to: "/manage", label: t("nav.manage") },
    { to: "/contact", label: t("nav.contact") },
  ] as const;

  return (
    <div className="bg-background px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-2xl">
        <p className="code-id text-5xl font-bold text-clay sm:text-7xl">404</p>
        <h1 className="mt-4 text-2xl font-bold text-foreground sm:text-4xl">{t("notfound.title")}</h1>
        <p className="mt-3 max-w-lg text-sm text-muted-foreground sm:text-base">{t("notfound.sub")}</p>
        <p className="eyebrow mt-8 text-muted-foreground">{t("notfound.help")}</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {links.map((link) => (
            <li key={link.to}>
              <AppLink to={link.to} className={btnClass(link.to === "/" ? "primary" : "outline", "md")}>
                {link.label}
              </AppLink>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
