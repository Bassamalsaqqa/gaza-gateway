import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  ChevronDown,
  ExternalLink,
  Globe,
  Lock,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { AppLink, usePathname } from "@/components/app-link";
import { pick, useI18n } from "@/lib/i18n";
import { stripLocale } from "@/lib/locale";
import { adminNav, type AdminNavItem, type AdminRole } from "@/lib/admin";
import { useAdmin } from "@/lib/admin-store";
import { cn } from "@/lib/utils";
import { AdminChip, AdminToasts } from "./admin-kit";
import { AdminSearch } from "./admin-search";
import { useDashboardData } from "./dashboard-data";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const ROLES: AdminRole[] = ["admin", "editor", "viewer"];

function NavLink({ item, collapsed, onNavigate }: { item: AdminNavItem; collapsed: boolean; onNavigate?: (() => void) | undefined }) {
  const { t } = useI18n();
  const { can } = useAdmin();
  const pathname = stripLocale(usePathname());
  const label = t(item.labelKey);
  const Icon = item.icon;
  const permitted = can(item.permission);
  const active = item.to === "/admin" ? pathname === "/admin" : item.to ? pathname.startsWith(item.to) : false;

  const base = cn(
    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    collapsed && "justify-center px-0",
  );

  if (!item.to || !permitted) {
    const reason = !permitted ? t("adm.shell.noAccess") : t("adm.shell.laterBatch");
    return (
      <span
        aria-disabled="true"
        title={`${label} — ${reason}`}
        className={cn(base, "cursor-not-allowed text-ink-muted/70")}
      >
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {!permitted ? <Lock aria-hidden="true" className="size-3 shrink-0" /> : null}
          </>
        ) : null}
        <span className="sr-only">{reason}</span>
      </span>
    );
  }

  return (
    <AppLink
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        base,
        active ? "bg-ink-foreground/12 text-ink-foreground" : "text-ink-muted hover:bg-ink-foreground/8 hover:text-ink-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {!collapsed ? <span className="min-w-0 flex-1 truncate">{label}</span> : null}
    </AppLink>
  );
}

function SidebarBody({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: (() => void) | undefined }) {
  const { t } = useI18n();
  const { can } = useAdmin();
  const visibleGroups = useMemo(
    () =>
      adminNav
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => can(item.permission)),
        }))
        .filter((group) => group.items.length > 0),
    [can],
  );

  return (
    <nav aria-label={t("adm.shell.nav")} className="flex-1 overflow-y-auto px-2 py-3">
      {visibleGroups.map((group) => (
        <div key={group.id} className="mb-3">
          {!collapsed ? (
            <p className="px-2.5 pb-1 text-xs font-bold uppercase tracking-wider text-ink-muted/80">
              {t(group.labelKey)}
            </p>
          ) : (
            <div aria-hidden="true" className="mx-2 mb-2 border-t border-ink-border" />
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.id}>
                <NavLink item={item} collapsed={collapsed} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function WorkspaceMark({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2.5 px-3 py-3">
      <span className="code-id inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-bold text-primary-foreground">
        GZA
      </span>
      {!collapsed ? (
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-ink-foreground">{t("adm.workspace")}</span>
          <span className="block truncate text-xs text-ink-muted">{t("adm.brandLine")}</span>
        </span>
      ) : null}
    </div>
  );
}

function AccountMenu() {
  const { t, lang } = useI18n();
  const { staff, setRole, signOut } = useAdmin();

  if (!staff) return null;

  return (
    <DropdownMenu dir={lang === "ar" ? "rtl" : "ltr"}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t("adm.shell.account")} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm font-semibold hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <UserRound aria-hidden="true" className="size-4 text-muted-foreground" />
          <span className="hidden max-w-32 truncate sm:block">{pick(lang, staff.name)}</span>
          <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-2">
        <DropdownMenuLabel className="space-y-0.5 normal-case tracking-normal">
          <span className="block text-sm font-bold">{pick(lang, staff.name)}</span>
          <span dir="ltr" className="block truncate text-xs font-normal text-muted-foreground">{staff.email}</span>
          <span className="block text-xs font-normal text-muted-foreground">{pick(lang, staff.title)}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles aria-hidden="true" className="size-3" />{t("adm.shell.switchRole")}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={staff.role} onValueChange={(value) => setRole(value as AdminRole)}>
          {ROLES.map((role) => <DropdownMenuRadioItem key={role} value={role}>{t(`adm.role.${role}`)}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
        <p className="px-2 py-1 text-xs text-muted-foreground">{t("adm.shell.switchRoleNote")}</p>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut} className="font-semibold">{t("adm.shell.signOut")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="group" aria-label={t("adm.shell.language")} className="inline-flex items-center gap-0.5 rounded-md bg-secondary p-0.5">
      <Globe aria-hidden="true" className="ms-1 size-3.5 text-muted-foreground" />
      {(["en", "ar"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-current={lang === code ? "true" : undefined}
          className={cn(
            "rounded px-1.5 py-0.5 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            lang === code ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {code === "en" ? "EN" : "ع"}
        </button>
      ))}
    </div>
  );
}

/** Compact top-bar attention popover built from today's operational signals. */
function AttentionBell() {
  const { t } = useI18n();
  const { toast } = useAdmin();
  const { attention } = useDashboardData();
  const [open, setOpen] = useState(false);
  const count = attention.length;

  const tone = (severity: "high" | "medium" | "low") =>
    severity === "high" ? "danger" : severity === "medium" ? "warn" : "muted";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
      <button
        type="button"
        aria-expanded={open}
        aria-label={count > 0 ? t("adm.shell.attentionCount", { n: count }) : t("adm.shell.attention")}
        className="relative rounded-md border border-border p-1.5 text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Bell aria-hidden="true" className="size-4" />
        {count > 0 ? (
          <span className="code-id absolute -top-1.5 -end-1.5 min-w-4 rounded-full bg-status-cancelled px-1 text-[0.6rem] font-bold leading-4 text-primary-foreground">
            {count}
          </span>
        ) : null}
        <span className="sr-only">
          {count > 0 ? t("adm.shell.attentionCount", { n: count }) : t("adm.shell.attention")}
        </span>
      </button>
      </PopoverTrigger>
      <PopoverContent
          align="end"
          collisionPadding={12}
          aria-label={t("adm.notif.title")}
          className="w-[calc(100vw-1.5rem)] max-w-80 overflow-hidden rounded-lg border-border bg-card p-0 shadow-[var(--shadow-lift)]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("adm.notif.title")}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <X aria-hidden="true" className="size-4" />
              <span className="sr-only">{t("adm.notif.close")}</span>
            </button>
          </div>

          {count === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t("adm.notif.empty")}</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {attention.slice(0, 6).map((item) => (
                <li key={item.id} className="border-b border-border px-3 py-2.5 last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminChip tone={tone(item.severity)}>{t(`adm.attn.${item.severity}`)}</AdminChip>
                    <span className="text-xs text-muted-foreground">{item.module}</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.next}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-border px-3 py-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                const target = document.getElementById("attention");
                if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
                else toast(t("adm.notif.viewAll"));
              }}
              className="w-full rounded-md border border-border px-2 py-1.5 text-xs font-semibold hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {t("adm.notif.viewAll")}
            </button>
          </div>
      </PopoverContent>
    </Popover>
  );
}

/** Admin chrome: sidebar, compact top bar, mobile drawer, search and toasts. */
export function AdminShell({
  children,
  breadcrumb,
}: {
  children: ReactNode;
  breadcrumb?: string;
}) {
  const { t } = useI18n();
  const { toasts, dismissToast } = useAdmin();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDivElement>(null);
  const openDrawerBtnRef = useRef<HTMLButtonElement>(null);
  const restoreDrawerFocusRef = useRef(true);

  const closeDrawer = useCallback((restoreFocus = true) => {
    restoreDrawerFocusRef.current = restoreFocus;
    setDrawer(false);
  }, []);

  useEffect(() => {
    closeDrawer(false);
  }, [pathname, closeDrawer]);

  // Breakpoint crossing cleanup: close drawer when crossing to desktop layout
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) {
        closeDrawer(false);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [closeDrawer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!drawer) return;
    const drawerOpener = openDrawerBtnRef.current;
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    // Initial focus on the close button or first interactive element inside drawer
    const closeBtn = drawerRef.current?.querySelector<HTMLElement>("button[aria-label]");
    if (closeBtn) closeBtn.focus();
    else drawerRef.current?.querySelector<HTMLElement>("button, a")?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeDrawer(true);
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a:not([disabled])") ?? []
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      window.removeEventListener("keydown", onKey);
      if (restoreDrawerFocusRef.current && drawerOpener && drawerOpener.offsetParent !== null) {
        drawerOpener.focus();
      }
      restoreDrawerFocusRef.current = true;
    };
  }, [drawer, closeDrawer]);

  const sidebarWidth = useMemo(() => (collapsed ? "lg:w-16" : "lg:w-64"), [collapsed]);

  return (
    <div className="flex min-h-screen bg-background">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-70 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-semibold"
      >
        {t("adm.shell.skip")}
      </a>

      {/* Desktop / tablet sidebar */}
      <aside className={cn("hidden shrink-0 flex-col bg-ink lg:flex", sidebarWidth)}>
        <WorkspaceMark collapsed={collapsed} />
        <SidebarBody collapsed={collapsed} />
        <div className="border-t border-ink-border p-2">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? t("adm.shell.expand") : t("adm.shell.collapse")}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-semibold text-ink-muted hover:bg-ink-foreground/8 hover:text-ink-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" className="size-4 rtl:rotate-180" />
            ) : (
              <PanelLeftClose aria-hidden="true" className="size-4 rtl:rotate-180" />
            )}
            {!collapsed ? <span>{t("adm.shell.collapse")}</span> : null}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawer ? (
        <div className="fixed inset-0 z-60 flex bg-ink/60 lg:hidden">
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("adm.shell.nav")}
            className="flex h-full w-72 max-w-[85vw] flex-col bg-ink"
          >
            <div className="flex items-center justify-between border-b border-ink-border">
              <WorkspaceMark />
              <button
                type="button"
                onClick={() => closeDrawer(true)}
                aria-label={t("adm.shell.closeNav")}
                className="me-2 flex size-11 min-h-11 min-w-11 items-center justify-center rounded-md text-ink-muted hover:text-ink-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>
            <SidebarBody collapsed={false} onNavigate={() => closeDrawer(false)} />
          </div>
          <button
            type="button"
            aria-label={t("adm.shell.closeNav")}
            onClick={() => closeDrawer(true)}
            className="flex-1 cursor-default"
          />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact top bar */}
        <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
            <button
              ref={openDrawerBtnRef}
              type="button"
              onClick={() => setDrawer(true)}
              aria-label={t("adm.shell.openNav")}
              className="flex size-11 min-h-11 min-w-11 items-center justify-center rounded-md border border-border lg:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Menu aria-hidden="true" className="size-4" />
            </button>

            <div className="flex min-w-0 flex-1 items-center gap-2">
              {breadcrumb ? (
                <nav aria-label={t("adm.shell.breadcrumb")} className="truncate text-xs text-muted-foreground">
                  <AppLink to="/admin" className="hover:text-foreground">
                    {t("adm.workspace")}
                  </AppLink>
                  <span aria-hidden="true" className="mx-1.5">
                    /
                  </span>
                  <span className="font-semibold text-foreground">{breadcrumb}</span>
                </nav>
              ) : null}
              <AdminChip tone="muted" className="hidden sm:inline-flex text-[10px]">
                {t("adm.shell.simulation")}
              </AdminChip>
            </div>

            <button
              type="button"
              onClick={() => setSearch(true)}
              aria-label={t("adm.search.title")}
              className="flex h-11 sm:h-9 items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Search aria-hidden="true" className="size-4" />
              <span className="hidden md:inline">{t("adm.shell.searchHint")}</span>
              <kbd dir="ltr" className="code-id hidden rounded border border-border px-1 lg:inline">
                ⌘K
              </kbd>
            </button>

            <AttentionBell />

            <LanguageSwitch />

            <AppLink
              to="/"
              className="hidden items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs font-semibold hover:bg-secondary md:inline-flex focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ExternalLink aria-hidden="true" className="size-3.5 rtl:rotate-180" />
              {t("adm.shell.viewSite")}
            </AppLink>

            <AccountMenu />
          </div>
        </header>

        <main id="admin-main" className="min-w-0 flex-1 px-3 py-4 sm:px-4 sm:py-5">
          {children}
        </main>
      </div>

      <AdminSearch open={search} onClose={() => setSearch(false)} />
      <AdminToasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
