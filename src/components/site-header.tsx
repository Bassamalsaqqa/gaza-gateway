import { AppLink } from "@/components/app-link";
import { Menu, X, Globe, User, Ticket, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
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
  { to: "/manage", key: "nav.manage" },
  { to: "/check-in", key: "nav.checkin" },
  { to: "/about", key: "nav.about" },
  { to: "/contact", key: "nav.contact" },
] as const;

function LanguageToggle({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full p-0.5 border",
        tone === "dark" ? "border-ink-border bg-ink-border/60" : "border-border bg-secondary",
      )}
      role="group"
      aria-label={t("nav.language")}
    >
      <Globe
        aria-hidden="true"
        className={cn("ms-1.5 size-3.5", tone === "dark" ? "text-ink-muted" : "text-muted-foreground")}
      />
      {(["en", "ar"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            lang === code
              ? tone === "dark"
                ? "bg-ink-foreground text-ink shadow-sm"
                : "bg-primary text-primary-foreground shadow-sm"
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

  // Automatically close open mobile dialog when viewport crosses into desktop (>= 1024px)
  // so Radix safely cleans up its modal focus trap and body scroll lock.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setOpen(false);
      }
    };
    mql.addEventListener("change", onChange);
    return () => {
      mql.removeEventListener("change", onChange);
    };
  }, []);

  // Dual scroll lock for document body and html element
  useEffect(() => {
    if (!open) return;
    const origBody = document.body.style.overflow;
    const origHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = origBody;
      document.documentElement.style.overflow = origHtml;
    };
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-md"
      >
        {t("nav.skip")}
      </a>

      {/* Institutional Top Utility Bar */}
      <div className="border-b border-ink-border bg-ink text-ink-foreground">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <div className="flex items-center gap-3">
            <p className="text-xs font-medium text-ink-muted">
              <span className="code-id font-bold text-ink-foreground">GZA</span>
              <span className="mx-1.5 opacity-50" aria-hidden="true">·</span>
              <span className="code-id font-bold text-ink-foreground">PS</span>
              <span className="mx-1.5 opacity-50 hidden sm:inline" aria-hidden="true">·</span>
              <span className="hidden sm:inline">{t("brand.airline")}</span>
            </p>
            <span
              className="hidden lg:inline-flex items-center gap-1.5 rounded-full border border-ink-border bg-ink-border/40 px-2.5 py-0.5 text-[0.7rem] text-ink-muted"
              title={t("home.statusNotice")}
            >
              <span className="size-1.5 rounded-full bg-status-ontime" aria-hidden="true" />
              {t("home.statusNotice")}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageToggle tone="dark" />
            <AppLink
              to="/manage"
              className="hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-ink-muted transition-colors hover:bg-ink-border hover:text-ink-foreground sm:inline-flex focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <Ticket aria-hidden="true" className="size-3.5" />
              {t("nav.manage")}
            </AppLink>
            <AppLink
              to="/check-in"
              className="hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-ink-muted transition-colors hover:bg-ink-border hover:text-ink-foreground md:inline-flex focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              {t("nav.checkin")}
            </AppLink>
            <AppLink
              to={account ? "/account" : "/signin"}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-ink-muted transition-colors hover:bg-ink-border hover:text-ink-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              aria-label={account ? t("nav.account") : t("nav.signin")}
            >
              <User aria-hidden="true" className="size-3.5" />
              <span className="hidden sm:inline">{account ? t("nav.account") : t("nav.signin")}</span>
            </AppLink>
          </div>
        </div>
      </div>

      {/* Main Sticky Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6">
          <div className="min-w-0 shrink">
            <Brand compact />
          </div>

          <nav aria-label={t("nav.primary")} className="hidden items-center gap-1 lg:flex">
            {primaryNav.map((item) => (
              <AppLink
                key={item.to}
                to={item.to}
                activeProps={{ className: "bg-secondary text-foreground font-semibold shadow-xs" }}
                className="rounded-md px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                {t(item.key)}
              </AppLink>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <AppLink
              to="/book"
              className={btnClass("primary", "sm", "hidden sm:inline-flex shadow-[var(--shadow-soft)]")}
            >
              {t("nav.book")}
            </AppLink>
            <DialogPrimitive.Trigger asChild>
              <button
                type="button"
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-input bg-card text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring lg:hidden"
                aria-label={t("nav.menu")}
              >
                <Menu aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Trigger>
          </div>
        </div>
      </header>

      {/* Accessible Mobile Navigation Drawer */}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-0 z-60 flex flex-col bg-background lg:hidden",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
              e.preventDefault();
            }
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {t("nav.primary")}
          </DialogPrimitive.Title>

          {/* Header row */}
          <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 sm:px-6">
            <Brand />
            <DialogPrimitive.Close
              className="inline-flex size-11 items-center justify-center rounded-lg border border-input text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              aria-label={t("nav.close")}
            >
              <X aria-hidden="true" className="size-5" />
            </DialogPrimitive.Close>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
            <AppLink
              to="/book"
              onClick={() => setOpen(false)}
              className={btnClass("primary", "lg", "w-full justify-center shadow-[var(--shadow-soft)]")}
            >
              {t("nav.book")}
            </AppLink>

            <nav aria-label={t("nav.primary")} className="mt-6 flex flex-col divide-y divide-border border-y border-border">
              {primaryNav.map((item) => (
                <AppLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="flex min-h-[48px] items-center justify-between py-3 text-base font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                >
                  {t(item.key)}
                  <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground rtl:rotate-180" />
                </AppLink>
              ))}
            </nav>

            <div className="mt-6 flex flex-col gap-1">
              <p className="type-label text-xs text-muted-foreground px-1">{t("nav.manage")}</p>
              <nav aria-label={t("nav.manage")} className="flex flex-col divide-y divide-border border-y border-border">
                {secondaryNav.map((item) => (
                  <AppLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className="flex min-h-[44px] items-center justify-between py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                  >
                    {t(item.key)}
                    <ChevronRight aria-hidden="true" className="size-3.5 text-muted-foreground rtl:rotate-180" />
                  </AppLink>
                ))}
              </nav>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
              <LanguageToggle tone="light" />
              <AppLink
                to={account ? "/account" : "/signin"}
                onClick={() => setOpen(false)}
                className={btnClass("outline", "sm")}
              >
                <User aria-hidden="true" className="size-3.5" />
                {account ? t("nav.account") : t("nav.signin")}
              </AppLink>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
