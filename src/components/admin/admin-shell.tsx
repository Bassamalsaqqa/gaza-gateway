import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  return (
    <nav aria-label={t("adm.shell.nav")} className="flex-1 overflow-y-auto px-2 py-3">
      {adminNav.map((group) => (
        <div key={group.id} className="mb-3">
          {!collapsed ? (
            <p className="px-2.5 pb-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-ink-muted/70">
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
          <span className="block truncate text-[0.7rem] text-ink-muted">{t("adm.brandLine")}</span>
        </span>
      ) : null}
    </div>
  );
}

function AccountMenu() {
  const { t, lang } = useI18n();
  const { staff, setRole, signOut } = useAdmin();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      triggerRef.current?.focus?.();
    };
  }, [open]);

  if (!staff) return null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t("adm.shell.account")}
        className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm font-semibold hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <UserRound aria-hidden="true" className="size-4 text-muted-foreground" />
        <span className="hidden max-w-32 truncate sm:block">{pick(lang, staff.name)}</span>
        <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={t("adm.shell.account")}
          className="absolute end-0 z-50 mt-1 w-72 rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-lift)]"
        >
          <p className="text-sm font-bold">{pick(lang, staff.name)}</p>
          <p dir="ltr" className="truncate text-xs text-muted-foreground">
            {staff.email}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{pick(lang, staff.title)}</p>
          <div className="mt-2">
            <AdminChip tone="brand">{t(`adm.role.${staff.role}`)}</AdminChip>
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <p className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">
              <Sparkles aria-hidden="true" className="size-3" />
              {t("adm.shell.switchRole")}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  aria-pressed={staff.role === role}
                  onClick={() => setRole(role)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    staff.role === role ? "border-primary bg-brand-soft text-brand-deep" : "border-border hover:bg-secondary",
                  )}
                >
                  {t(`adm.role.${role}`)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[0.7rem] text-muted-foreground">{t("adm.shell.switchRoleNote")}</p>
          </div>

          <button
            type="button"
            onClick={signOut}
            className="mt-3 w-full rounded-md border border-border px-2 py-1.5 text-sm font-semibold hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("adm.shell.signOut")}
          </button>
        </div>
      ) : null}
    </div>
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const count = attention.length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
      triggerRef.current?.focus?.();
    };
  }, [open]);

  const tone = (severity: "high" | "medium" | "low") =>
    severity === "high" ? "danger" : severity === "medium" ? "warn" : "muted";

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
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

      {open ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={t("adm.notif.title")}
          className="fixed end-3 top-14 z-60 w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-lift)] sm:absolute sm:end-0 sm:top-11 sm:w-80"
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
                    <span className="text-[0.7rem] text-muted-foreground">{item.module}</span>
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
        </div>
      ) : null}
    </div>
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

  useEffect(() => setDrawer(false), [pathname]);

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
    const trigger = document.activeElement as HTMLElement | null;
    drawerRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
      if (e.key !== "Tab") return;
      const items = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>("button, a") ?? []);
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
      window.removeEventListener("keydown", onKey);
      trigger?.focus?.();
    };
  }, [drawer]);

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
                onClick={() => setDrawer(false)}
                aria-label={t("adm.shell.closeNav")}
                className="me-2 rounded-md p-1.5 text-ink-muted hover:text-ink-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>
            <SidebarBody collapsed={false} onNavigate={() => setDrawer(false)} />
          </div>
          <button
            type="button"
            aria-label={t("adm.shell.closeNav")}
            onClick={() => setDrawer(false)}
            className="flex-1 cursor-default"
          />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact top bar */}
        <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
            <button
              type="button"
              onClick={() => setDrawer(true)}
              aria-label={t("adm.shell.openNav")}
              className="rounded-md border border-border p-1.5 lg:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Menu aria-hidden="true" className="size-4" />
            </button>

            <div className="min-w-0 flex-1">
              {breadcrumb ? (
                <nav aria-label={t("adm.shell.breadcrumb")} className="truncate text-xs text-muted-foreground">
                  <span>{t("adm.workspace")}</span>
                  <span aria-hidden="true" className="mx-1.5">
                    /
                  </span>
                  <span className="font-semibold text-foreground">{breadcrumb}</span>
                </nav>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setSearch(true)}
              className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
