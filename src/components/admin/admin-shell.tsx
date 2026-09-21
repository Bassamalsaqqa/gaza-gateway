import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  CalendarClock,
  ChevronDown,
  ExternalLink,
  Globe,
  Lock,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Sparkles,
  Ticket,
  UserRound,
  X,
} from "lucide-react";
import { AppLink, usePathname } from "@/components/app-link";
import { pick, useI18n } from "@/lib/i18n";
import { stripLocale } from "@/lib/locale";
import { adminNav, unreadEnquiries, type AdminNavItem, type AdminRole } from "@/lib/admin";
import { useAdmin } from "@/lib/admin-store";
import { cn } from "@/lib/utils";
import { AdminChip, AdminToasts, GazaSheet } from "./admin-kit";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const ROLES: AdminRole[] = ["admin", "editor", "viewer"];
const SIDEBAR_STORAGE_KEY = "gza.admin.sidebar.collapsed";

function useOsShortcut(): string {
  const [shortcut, setShortcut] = useState<string>("");
  useEffect(() => {
    const isMac = typeof navigator !== "undefined" && /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || navigator.userAgent);
    setShortcut(isMac ? "⌘ K" : "Ctrl K");
  }, []);
  return shortcut;
}

function NavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: AdminNavItem;
  collapsed: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const { t, lang } = useI18n();
  const { can } = useAdmin();
  const pathname = stripLocale(usePathname());
  const label = t(item.labelKey);
  const Icon = item.icon;
  const permitted = can(item.permission);
  const active = item.to === "/admin" ? pathname === "/admin" : item.to ? pathname.startsWith(item.to) : false;
  const hasInboxBadge = item.id === "inbox" && unreadEnquiries > 0;
  const fullLabel = hasInboxBadge ? `${label} (${unreadEnquiries})` : label;

  const base = cn(
    "relative flex items-center gap-3 rounded-md text-sm font-medium transition-colors duration-150 motion-reduce:transition-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    collapsed ? "h-10 w-full justify-center px-0" : "min-h-10 px-3 py-2",
  );

  if (!item.to || !permitted) {
    const reason = !permitted ? t("adm.shell.noAccess") : t("adm.shell.laterBatch");
    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              aria-disabled="true"
              aria-label={`${label} — ${reason}`}
              className={cn(base, "cursor-not-allowed text-[var(--admin-nav-muted)]/50 border-s-[3px] border-s-transparent")}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
            </span>
          </TooltipTrigger>
          <TooltipContent side={lang === "ar" ? "left" : "right"}>
            <span>{label} — {reason}</span>
          </TooltipContent>
        </Tooltip>
      );
    }
    return (
      <span
        aria-disabled="true"
        title={`${label} — ${reason}`}
        className={cn(base, "cursor-not-allowed text-[var(--admin-nav-muted)]/50 border-s-[3px] border-s-transparent")}
      >
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {!permitted ? <Lock aria-hidden="true" className="size-3 shrink-0 text-[var(--admin-nav-muted)]/40" /> : null}
      </span>
    );
  }

  const activeClasses = active
    ? "bg-[var(--admin-nav-active)] text-[var(--admin-nav-foreground)] border-s-[3px] border-s-[var(--admin-nav-accent)] font-semibold"
    : "text-[var(--admin-nav-muted)] border-s-[3px] border-s-transparent hover:bg-[var(--admin-nav-active)]/60 hover:text-[var(--admin-nav-foreground)]";

  const iconClasses = cn(
    "size-4 shrink-0 transition-colors",
    active ? "text-[var(--admin-nav-accent)]" : "text-[var(--admin-nav-muted)]",
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <AppLink
            to={item.to}
            onClick={onNavigate}
            aria-label={fullLabel}
            aria-current={active ? "page" : undefined}
            className={cn(base, activeClasses)}
          >
            <Icon aria-hidden="true" className={iconClasses} />
            {hasInboxBadge ? (
              <span
                className="absolute top-2 end-2 size-2 rounded-full bg-[var(--admin-nav-accent)]"
                aria-hidden="true"
              />
            ) : null}
          </AppLink>
        </TooltipTrigger>
        <TooltipContent side={lang === "ar" ? "left" : "right"}>
          <span>{fullLabel}</span>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <AppLink
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(base, activeClasses)}
    >
      <Icon aria-hidden="true" className={iconClasses} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hasInboxBadge ? (
        <span className="ms-auto inline-flex items-center justify-center rounded-full bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-bold tabular-nums text-[var(--admin-nav-accent)]">
          {unreadEnquiries}
        </span>
      ) : null}
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
    <TooltipProvider delayDuration={150}>
      <nav aria-label={t("adm.shell.nav")} className="flex-1 overflow-y-auto px-2 py-3 [scrollbar-width:thin]">
        {visibleGroups.map((group) => (
          <div key={group.id} className="mb-4">
            {!collapsed ? (
              <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--admin-nav-muted)]/70">
                {t(group.labelKey)}
              </p>
            ) : (
              <div aria-hidden="true" className="mx-2 mb-2 border-t border-white/10" />
            )}
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.id}>
                  <NavLink item={item} collapsed={collapsed} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </TooltipProvider>
  );
}

function WorkspaceMark({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={cn("flex items-center gap-2.5 px-3.5 py-3.5", collapsed && "justify-center px-0")}>
      <span className="code-id inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--admin-nav-accent)] text-xs font-bold text-[#18271F]">
        GZA
      </span>
      {!collapsed ? (
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-[var(--admin-nav-foreground)]">{t("adm.workspace")}</span>
          <span className="block truncate text-[11px] text-[var(--admin-nav-muted)]">{t("adm.brandLine")}</span>
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
        <button
          type="button"
          aria-label={t("adm.shell.account")}
          className="flex size-11 min-h-[44px] min-w-[44px] sm:size-auto sm:h-9 sm:min-h-[36px] sm:min-w-0 sm:px-2.5 sm:py-1.5 shrink-0 items-center justify-center sm:justify-start gap-1.5 rounded-md border border-border text-sm font-semibold hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring cursor-pointer"
        >
          <UserRound aria-hidden="true" className="size-4 text-muted-foreground shrink-0" />
          <span className="hidden max-w-32 truncate sm:block">{pick(lang, staff.name)}</span>
          <ChevronDown aria-hidden="true" className="hidden size-3.5 text-muted-foreground shrink-0 sm:block" />
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
        <DropdownMenuItem onSelect={signOut} className="font-semibold cursor-pointer">{t("adm.shell.signOut")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DirectLanguageButton() {
  const { lang, setLang } = useI18n();
  const nextLang = lang === "en" ? "ar" : "en";
  const ariaLabel = lang === "en" ? "Switch to Arabic" : "التبديل إلى الإنجليزية";

  return (
    <button
      type="button"
      onClick={() => setLang(nextLang)}
      aria-label={ariaLabel}
      className="inline-flex size-11 min-h-[44px] min-w-[44px] sm:size-auto sm:h-9 sm:min-h-[36px] sm:min-w-0 sm:px-2.5 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border text-xs font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring cursor-pointer"
    >
      <Globe aria-hidden="true" className="size-4 sm:size-3.5 text-muted-foreground shrink-0" />
      <span className="hidden sm:inline whitespace-nowrap">{lang === "en" ? "العربية" : "English"}</span>
    </button>
  );
}

function QuickCreateMenu() {
  const { t, lang } = useI18n();
  const { can } = useAdmin();
  const canNewBooking = can("commercial.edit");
  const canNewSchedule = can("ops.edit");

  if (!canNewBooking && !canNewSchedule) return null;

  return (
    <DropdownMenu dir={lang === "ar" ? "rtl" : "ltr"}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("adm.common.new")}
          className="inline-flex size-11 min-h-[44px] min-w-[44px] sm:size-auto sm:h-9 sm:min-h-[36px] sm:min-w-0 sm:px-2.5 shrink-0 items-center justify-center sm:justify-start gap-1.5 rounded-md bg-primary text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring cursor-pointer"
        >
          <Plus aria-hidden="true" className="size-4 sm:size-3.5" />
          <span className="hidden sm:inline">{t("adm.common.new")}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 p-1">
        {canNewBooking ? (
          <DropdownMenuItem asChild>
            <AppLink to="/admin/bookings/new" className="flex items-center gap-2 cursor-pointer">
              <Ticket aria-hidden="true" className="size-4 text-muted-foreground" />
              <span>{t("adm.cmd.newBooking")}</span>
            </AppLink>
          </DropdownMenuItem>
        ) : null}
        {canNewSchedule ? (
          <DropdownMenuItem asChild>
            <AppLink to="/admin/schedules" className="flex items-center gap-2 cursor-pointer">
              <CalendarClock aria-hidden="true" className="size-4 text-muted-foreground" />
              <span>{t("adm.quick.schedule")}</span>
            </AppLink>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
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
          className="relative flex size-11 min-h-[44px] min-w-[44px] sm:size-9 sm:min-h-[36px] sm:min-w-[36px] shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring cursor-pointer"
        >
          <Bell aria-hidden="true" className="size-4" />
          {count > 0 ? (
            <span className="code-id absolute -top-1 -end-1 min-w-4 rounded-full bg-status-cancelled px-1 text-[0.6rem] font-bold leading-4 text-primary-foreground">
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

/** Admin chrome: Operational Desk with sticky sidebar, compact topbar, mobile drawer, search and toasts. */
export function AdminShell({
  children,
  breadcrumb,
}: {
  children: ReactNode;
  breadcrumb?: string;
}) {
  const { t } = useI18n();
  const { toasts, dismissToast } = useAdmin();
  const [collapsed, setCollapsedState] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const restoreFocusRef = useRef(true);
  const shortcut = useOsShortcut();
  const pathname = usePathname();
  const openDrawerBtnRef = useRef<HTMLButtonElement>(null);

  const setCollapsed = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setCollapsedState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        /* storage disabled */
      }
      return next;
    });
  }, []);

  // Hydration-safe sidebar preference initialization & desktop resize defaults
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (saved !== null) {
        setCollapsedState(saved === "true");
      } else {
        setCollapsedState(window.innerWidth < 1280);
      }
    } catch {
      /* storage disabled */
    }

    // Enable CSS width transitions after initial width is set to prevent animated sweep on load
    const raf = requestAnimationFrame(() => {
      setHasMounted(true);
    });

    const onResize = () => {
      if (window.innerWidth >= 1024) {
        restoreFocusRef.current = false;
        setDrawer(false);
      }
      try {
        const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
        if (saved === null && window.innerWidth >= 1024) {
          setCollapsedState(window.innerWidth < 1280);
        }
      } catch {
        /* storage disabled */
      }
    };

    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Route change: close drawer without stealing focus to mobile opener
  useEffect(() => {
    restoreFocusRef.current = false;
    setDrawer(false);
  }, [pathname]);

  // Global Ctrl/Cmd + K shortcut for search
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

  return (
    <div className="flex min-h-screen bg-[var(--admin-workspace)]">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-70 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-semibold"
      >
        {t("adm.shell.skip")}
      </a>

      {/* Desktop / tablet viewport-sticky sidebar (>= 1024px) */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col bg-[var(--admin-nav)] text-[var(--admin-nav-foreground)] lg:sticky lg:top-0 lg:h-dvh lg:self-start lg:flex",
          hasMounted && "transition-[width] duration-150 motion-reduce:transition-none",
          collapsed ? "w-[72px]" : "w-[268px]",
        )}
      >
        <div className="shrink-0 border-b border-white/5">
          <WorkspaceMark collapsed={collapsed} />
        </div>
        <SidebarBody collapsed={collapsed} />
      </aside>

      {/* Mobile drawer (< 1024px) */}
      <GazaSheet
        open={drawer}
        onClose={() => setDrawer(false)}
        side="start"
        title={t("adm.shell.nav")}
        closeLabel={t("adm.shell.closeNav")}
        headerLeading={<WorkspaceMark />}
        className="w-72 max-w-[85vw] bg-[var(--admin-nav)] text-[var(--admin-nav-foreground)] border-white/10 lg:hidden"
        overlayClassName="lg:hidden"
        bodyClassName="p-0 overflow-hidden flex flex-col"
        restoreFocusRef={restoreFocusRef}
        triggerRef={openDrawerBtnRef}
      >
        <SidebarBody
          collapsed={false}
          onNavigate={() => {
            restoreFocusRef.current = false;
            setDrawer(false);
          }}
        />
      </GazaSheet>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact top bar (~56px) */}
        <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
          <div className="flex h-14 items-center gap-1.5 sm:gap-2 px-2 sm:px-4">
            {/* Mobile menu trigger (< 1024px) */}
            <button
              ref={openDrawerBtnRef}
              type="button"
              onClick={() => {
                restoreFocusRef.current = true;
                setDrawer(true);
              }}
              aria-label={t("adm.shell.openNav")}
              className="flex size-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden"
            >
              <Menu aria-hidden="true" className="size-5" />
            </button>

            {/* Desktop panel toggle (>= 1024px) */}
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? t("adm.shell.expand") : t("adm.shell.collapse")}
              className="hidden lg:flex size-10 min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring cursor-pointer"
            >
              {collapsed ? (
                <PanelLeftOpen aria-hidden="true" className="size-4 rtl:rotate-180" />
              ) : (
                <PanelLeftClose aria-hidden="true" className="size-4 rtl:rotate-180" />
              )}
            </button>

            {/* Breadcrumb + Plain Simulation indicator */}
            <div className="hidden min-w-0 flex-1 items-center gap-2.5 sm:flex">
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
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-muted-foreground/60" aria-hidden="true" />
                {t("adm.shell.simulation")}
              </span>
            </div>

            {/* Mobile spacer to push actions to the edge */}
            <div className="flex-1 sm:hidden" />

            {/* Command search button */}
            <button
              type="button"
              onClick={() => setSearch(true)}
              aria-label={t("adm.search.title")}
              className="flex size-11 min-h-[44px] min-w-[44px] sm:size-auto sm:h-9 sm:min-h-[36px] sm:min-w-0 sm:px-3 sm:py-1.5 shrink-0 items-center justify-center sm:justify-start gap-2 rounded-md border border-border text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-w-xs xl:max-w-sm"
            >
              <Search aria-hidden="true" className="size-4 shrink-0" />
              <span className="hidden md:inline truncate">{t("adm.shell.searchHint")}</span>
              <span className="sr-only">{t("adm.search.title")}</span>
              {shortcut ? (
                <kbd dir="ltr" className="code-id ms-auto hidden rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:inline">
                  {shortcut}
                </kbd>
              ) : null}
            </button>

            {/* Quick create (+ New) */}
            <QuickCreateMenu />

            {/* Attention bell */}
            <AttentionBell />

            {/* Direct alternate language */}
            <DirectLanguageButton />

            {/* View public site */}
            <AppLink
              to="/"
              className="hidden items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-secondary xl:inline-flex focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ExternalLink aria-hidden="true" className="size-3.5 rtl:rotate-180" />
              {t("adm.shell.viewSite")}
            </AppLink>

            {/* Account menu */}
            <AccountMenu />
          </div>
        </header>

        <main id="admin-main" className="min-w-0 flex-1 bg-ambient-admin px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          {children}
        </main>
      </div>

      <AdminSearch open={search} onClose={() => setSearch(false)} />
      <AdminToasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
