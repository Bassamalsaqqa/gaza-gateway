import { AppLink } from "@/components/app-link";
import { Menu, X, Globe, User, Ticket, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Brand } from "./brand";
import { btnClass } from "./kit";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const primaryNav = [
  { to: "/flights", key: "nav.flights" },
  { to: "/destinations", key: "nav.destinations" },
  { to: "/airport", key: "nav.airport" },
  { to: "/gallery", key: "nav.gallery" },
  { to: "/travel", key: "nav.travel" },
] as const;

const secondaryNav = [
  { to: "/about", key: "nav.about" },
  { to: "/contact", key: "nav.contact" },
  { to: "/manage", key: "nav.manage" },
] as const;

function LanguageToggle({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full p-0.5",
        tone === "dark" ? "bg-ink-border" : "bg-secondary",
      )}
      role="group"
      aria-label={t("nav.language")}
    >
      <Globe aria-hidden="true" className={cn("ms-1.5 size-3.5", tone === "dark" ? "text-ink-muted" : "text-muted-foreground")} />
      {(["en", "ar"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
            lang === code
              ? tone === "dark"
                ? "bg-ink-foreground text-ink"
                : "bg-primary text-primary-foreground"
              : tone === "dark"
                ? "text-ink-muted hover:text-ink-foreground"
                : "text-muted-foreground hover:text-foreground",
          )}
        >
          {code === "en" ? "EN" : "ع"}
        </button>
      ))}
    </div>
  );
}

export function SiteHeader() {
  const { t } = useI18n();
  const { account } = useStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        {t("nav.skip")}
      </a>

      <div className="bg-ink text-ink-foreground">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
          <p className="hidden text-xs text-ink-muted sm:block">
            <span className="code-id">GZA</span> · <span className="code-id">PS</span> · {t("brand.airline")}
          </p>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <AppLink
              to="/manage"
              className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:text-ink-foreground sm:inline-flex"
            >
              <Ticket aria-hidden="true" className="size-3.5" />
              {t("nav.manage")}
            </AppLink>
            <AppLink
              to={account ? "/account" : "/signin"}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:text-ink-foreground"
            >
              <User aria-hidden="true" className="size-3.5" />
              {account ? t("nav.account") : t("nav.signin")}
            </AppLink>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Brand compact />

          <nav aria-label={t("nav.primary")} className="hidden items-center gap-1 lg:flex">
            {primaryNav.map((item) => (
              <AppLink
                key={item.to}
                to={item.to}
                activeProps={{ className: "bg-secondary text-foreground" }}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {t(item.key)}
              </AppLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <AppLink to="/book" className={btnClass("primary", "sm", "hidden sm:inline-flex")}>
              {t("nav.book")}
            </AppLink>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex size-10 items-center justify-center rounded-md border border-input text-foreground lg:hidden"
              aria-label={t("nav.menu")}
              aria-expanded={open}
            >
              <Menu aria-hidden="true" className="size-5" />
            </button>
          </div>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-background lg:hidden" role="dialog" aria-modal="true">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <Brand />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex size-10 items-center justify-center rounded-md border border-input"
              aria-label={t("nav.close")}
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <AppLink to="/book" onClick={() => setOpen(false)} className={btnClass("primary", "lg", "w-full")}>
              {t("nav.book")}
            </AppLink>
            <nav aria-label={t("nav.primary")} className="mt-6 flex flex-col">
              {[...primaryNav, ...secondaryNav].map((item) => (
                <AppLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between border-b border-border py-4 text-base font-semibold"
                >
                  {t(item.key)}
                  <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground rtl:rotate-180" />
                </AppLink>
              ))}
            </nav>
            <div className="mt-6 flex items-center justify-between">
              <LanguageToggle tone="light" />
              <AppLink
                to={account ? "/account" : "/signin"}
                onClick={() => setOpen(false)}
                className={btnClass("outline", "sm")}
              >
                {account ? t("nav.account") : t("nav.signin")}
              </AppLink>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
