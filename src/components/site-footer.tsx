import { AppLink } from "@/components/app-link";
import { Brand } from "./brand";
import { useI18n } from "@/lib/i18n";

const columns = [
  {
    key: "footer.plan",
    links: [
      { to: "/book", key: "nav.book" },
      { to: "/flights", key: "nav.flights" },
      { to: "/destinations", key: "nav.destinations" },
      { to: "/manage", key: "nav.manage" },
      { to: "/check-in", key: "nav.checkin" },
    ],
  },
  {
    key: "footer.discover",
    links: [
      { to: "/airport", key: "nav.airport" },
      { to: "/airport/past", key: "airport.past" },
      { to: "/airport/present", key: "airport.present" },
      { to: "/airport/future", key: "airport.future" },
      { to: "/gallery", key: "nav.gallery" },
    ],
  },
  {
    key: "footer.help",
    links: [
      { to: "/travel", key: "nav.travel" },
      { to: "/about", key: "nav.about" },
      { to: "/contact", key: "nav.contact" },
      { to: "/signin", key: "nav.signin" },
    ],
  },
  {
    key: "footer.legal",
    links: [
      { to: "/privacy", key: "legal.privacyTitle" },
      { to: "/terms", key: "legal.termsTitle" },
    ],
  },
] as const;

export function SiteFooter() {
  const { t } = useI18n();
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
              {col.links.map((link) => (
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
        <div className="page-shell flex flex-col gap-2 px-4 py-6 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            © {new Date().getFullYear()} {t("brand.airport")} · <span className="code-id">GZA</span>
          </p>
          <p>{t("footer.rights")}</p>
        </div>
      </div>
    </footer>
  );
}
