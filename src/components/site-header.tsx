import { AppLink } from "@/components/app-link";
import { Menu, X, Globe, User, ChevronRight } from "lucide-react";
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

const drawerNav = [
  { to: "/flights", key: "nav.flights" },
  { to: "/destinations", key: "nav.destinations" },
  { to: "/airport", key: "nav.airport" },
  { to: "/gallery", key: "nav.gallery" },
  { to: "/travel", key: "nav.travel" },
  { to: "/manage", key: "nav.manage" },
  { to: "/check-in", key: "nav.checkin" },
  { to: "/about", key: "nav.about" },
  { to: "/contact", key: "nav.contact" },
] as const;

function DirectLanguageButton({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();
  const nextLang = lang === "en" ? "ar" : "en";
  const ariaLabel = lang === "en" ? "Switch to Arabic" : "التبديل إلى الإنجليزية";

  return (
    <button
      type="button"
      data-slot="direct-lang-toggle"
      onClick={() => setLang(nextLang)}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-input bg-card px-2 sm:px-2.5 2xl:px-3 text-xs font-semibold text-foreground whitespace-nowrap transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
        className,
      )}
    >
      <Globe aria-hidden="true" className="size-3.5 text-muted-foreground shrink-0" />
      <span className="hidden sm:inline whitespace-nowrap">{lang === "en" ? "العربية" : "English"}</span>
      <span className="sm:hidden">{lang === "en" ? "AR" : "EN"}</span>
    </button>
  );
}

export function SiteHeader() {
  const { t } = useI18n();
  const { account } = useStore();
  const [open, setOpen] = useState(false);

  // Automatically close open mobile dialog when viewport crosses into desktop (>= 1280px)
  // so Radix safely cleans up its modal focus trap and body scroll lock.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(min-width: 1280px)");
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

      {/* Unified Single-Row Sticky Header */}
      <header className="sticky top-0 z-40 h-16 lg:h-18 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90">
        <div className="page-shell flex h-full items-center justify-between gap-2 xl:gap-3 2xl:gap-6 px-4 sm:px-6 lg:px-8">
          {/* Brand */}
          <div className="min-w-0 shrink-0">
            <Brand compact />
          </div>

          {/* Primary Navigation (Desktop >= 1280px) */}
          <nav aria-label={t("nav.primary")} className="hidden h-full items-center gap-0.5 xl:gap-1 2xl:gap-1.5 xl:flex shrink-0">
            {primaryNav.map((item) => (
              <AppLink
                key={item.to}
                to={item.to}
                activeProps={{ className: "text-foreground font-semibold border-b-2 border-primary" }}
                inactiveProps={{ className: "text-muted-foreground hover:text-foreground border-b-2 border-transparent" }}
                className="inline-flex h-full items-center px-2 xl:px-2.5 2xl:px-3 text-xs 2xl:text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                {t(item.key)}
              </AppLink>
            ))}
          </nav>

          {/* Utilities & Actions */}
          <div className="flex shrink-0 items-center gap-1.5 xl:gap-2 2xl:gap-3">
            {/* Manage booking & Check in (Desktop >= 1280px) */}
            <AppLink
              to="/manage"
              className="hidden text-xs 2xl:text-sm font-medium text-muted-foreground whitespace-nowrap transition-colors hover:text-foreground xl:inline-flex focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              {t("nav.manage")}
            </AppLink>
            <AppLink
              to="/check-in"
              className="hidden text-xs 2xl:text-sm font-medium text-muted-foreground whitespace-nowrap transition-colors hover:text-foreground xl:inline-flex focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              {t("nav.checkin")}
            </AppLink>

            {/* Direct Language Switch Button */}
            <DirectLanguageButton />

            {/* Account / Sign In */}
            <AppLink
              to={account ? "/account" : "/signin"}
              className="hidden sm:inline-flex h-9 items-center gap-1.5 rounded-lg border border-input bg-card px-2 2xl:px-2.5 text-xs font-semibold text-foreground whitespace-nowrap transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              aria-label={account ? t("nav.account") : t("nav.signin")}
            >
              <User aria-hidden="true" className="size-3.5 text-muted-foreground shrink-0" />
              <span className="hidden md:inline whitespace-nowrap">{account ? t("nav.account") : t("nav.signin")}</span>
            </AppLink>

            {/* Primary Book Action */}
            <AppLink
              to="/book"
              data-slot="primary-book-cta"
              className={btnClass("primary", "sm", "hidden sm:inline-flex shadow-xs whitespace-nowrap text-xs 2xl:text-sm px-3 2xl:px-3.5")}
            >
              {t("nav.book")}
            </AppLink>

            {/* Accessible Hamburger Menu Button (< 1280px) */}
            <DialogPrimitive.Trigger asChild>
              <button
                type="button"
                data-slot="mobile-menu-trigger"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-input bg-card text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring xl:hidden"
                aria-label={t("nav.menu")}
              >
                <Menu aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Trigger>
          </div>
        </div>
      </header>

      {/* Accessible Navigation Drawer */}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          data-slot="mobile-drawer"
          className={cn(
            "fixed inset-0 z-60 flex flex-col bg-card xl:hidden",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            if (typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches) {
              e.preventDefault();
            }
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {t("nav.primary")}
          </DialogPrimitive.Title>

          {/* Drawer Header row */}
          <div className="flex h-16 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
            <Brand compact />
            <DialogPrimitive.Close
              data-slot="mobile-drawer-close"
              className="inline-flex size-10 items-center justify-center rounded-lg border border-input text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              aria-label={t("nav.close")}
            >
              <X aria-hidden="true" className="size-5" />
            </DialogPrimitive.Close>
          </div>

          {/* Drawer Scrollable Body */}
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
            {/* Prominent First Action: Book a flight */}
            <AppLink
              to="/book"
              data-slot="mobile-book-cta"
              onClick={() => setOpen(false)}
              className={btnClass("primary", "lg", "w-full justify-center shadow-xs")}
            >
              {t("nav.book")}
            </AppLink>

            {/* Clean Vertical Navigation List */}
            <nav aria-label={t("nav.primary")} className="mt-6 flex flex-col divide-y divide-border border-y border-border">
              {drawerNav.map((item) => (
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

              {/* Account / Sign In row in drawer */}
              <AppLink
                to={account ? "/account" : "/signin"}
                onClick={() => setOpen(false)}
                className="flex min-h-[48px] items-center justify-between py-3 text-base font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                <span className="flex items-center gap-2.5">
                  <User aria-hidden="true" className="size-4 text-muted-foreground" />
                  {account ? t("nav.account") : t("nav.signin")}
                </span>
                <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground rtl:rotate-180" />
              </AppLink>
            </nav>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
