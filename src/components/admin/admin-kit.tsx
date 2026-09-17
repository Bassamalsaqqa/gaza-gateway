import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, Info, Lock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { btnClass } from "@/components/kit";

/* ------------------------------- page header ------------------------------- */

export function AdminPageHeader({
  title,
  description,
  action,
  meta,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        {meta ? <div className="mt-2">{meta}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </header>
  );
}

/* --------------------------------- metrics -------------------------------- */

export function Metric({
  label,
  value,
  tone = "neutral",
  hint,
  emphasis = false,
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "brand" | "warn" | "danger";
  hint?: string;
  emphasis?: boolean;
}) {
  const tones = {
    neutral: "text-foreground",
    brand: "text-brand-deep",
    warn: "text-status-delayed",
    danger: "text-status-cancelled",
  } as const;
  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-lg border border-border bg-card px-3 py-2.5",
        emphasis && "bg-sand",
      )}
    >
      <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("code-id mt-1 font-bold", emphasis ? "text-2xl" : "text-xl", tones[tone])}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------ panel / table ----------------------------- */

export function AdminPanel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card", className)}>
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold tracking-tight">{title}</h2>
            {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn(bodyClassName ?? "p-4")}>{children}</div>
    </section>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div
      role="search"
      aria-label={t("adm.common.filters")}
      className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5"
    >
      {children}
    </div>
  );
}

/* --------------------------------- badges --------------------------------- */

export function AdminChip({
  children,
  tone = "neutral",
  icon,
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "warn" | "danger" | "info" | "muted";
  icon?: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "bg-secondary text-secondary-foreground",
    muted: "border border-border bg-card text-muted-foreground",
    brand: "bg-brand-soft text-brand-deep",
    warn: "bg-status-delayed/15 text-status-delayed",
    danger: "bg-status-cancelled/12 text-status-cancelled",
    info: "bg-clay-soft text-accent-foreground",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Technical identifier: always left-to-right, even in Arabic. */
export function Ltr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span dir="ltr" className={cn("code-id", className)}>
      {children}
    </span>
  );
}

export function BilingualStatus({ missingAr, missingEn }: { missingAr?: boolean; missingEn?: boolean }) {
  const { t } = useI18n();
  if (missingAr) return <AdminChip tone="warn" icon={<AlertTriangle aria-hidden="true" className="size-3" />}>{t("adm.bilingual.missingAr")}</AdminChip>;
  if (missingEn) return <AdminChip tone="warn" icon={<AlertTriangle aria-hidden="true" className="size-3" />}>{t("adm.bilingual.missingEn")}</AdminChip>;
  return <AdminChip tone="brand">{t("adm.bilingual.complete")}</AdminChip>;
}

export function ContentStateChip({ state }: { state: "draft" | "published" | "archived" }) {
  const { t } = useI18n();
  const tone = state === "published" ? "brand" : state === "draft" ? "info" : "muted";
  return <AdminChip tone={tone}>{t(`adm.state.${state}`)}</AdminChip>;
}

/* ------------------------------ attention item ---------------------------- */

export function AttentionRow({
  severity,
  title,
  module,
  next,
  action,
}: {
  severity: "high" | "medium" | "low";
  title: string;
  module: string;
  next: string;
  action?: ReactNode;
}) {
  const { t } = useI18n();
  const bar = {
    high: "bg-status-cancelled",
    medium: "bg-status-delayed",
    low: "bg-status-neutral",
  } as const;
  const tone = severity === "high" ? "danger" : severity === "medium" ? "warn" : "muted";
  return (
    <li className="flex gap-3 border-b border-border px-4 py-3 last:border-0">
      <span aria-hidden="true" className={cn("mt-1 w-1 shrink-0 rounded-full", bar[severity])} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <AdminChip tone={tone}>{t(`adm.attn.${severity}`)}</AdminChip>
          <span className="text-xs text-muted-foreground">{module}</span>
        </div>
        <p className="mt-1 text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{next}</p>
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </li>
  );
}

/* --------------------------- empty / loading state ------------------------ */

export function AdminEmpty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <Info aria-hidden="true" className="size-5 text-muted-foreground" />
      <p className="text-sm font-semibold">{title}</p>
      {body ? <p className="max-w-sm text-xs text-muted-foreground">{body}</p> : null}
      {action}
    </div>
  );
}

export function AdminSkeleton({ rows = 4 }: { rows?: number }) {
  const { t } = useI18n();
  return (
    <div role="status" aria-label={t("adm.common.loading")} className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-8 animate-pulse rounded-md bg-secondary motion-reduce:animate-none" />
      ))}
    </div>
  );
}

/* ----------------------------- permission action -------------------------- */

/** Action a role may not use: stays visible, disabled, and says why. */
export function PermissionButton({
  allowed,
  reason,
  children,
  onClick,
  variant = "outline",
  size = "sm",
  className,
}: {
  allowed: boolean;
  reason: string;
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "ink";
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={allowed ? onClick : undefined}
      disabled={!allowed}
      aria-disabled={!allowed}
      title={allowed ? undefined : reason}
      className={btnClass(variant, size, className)}
    >
      {!allowed ? <Lock aria-hidden="true" className="size-3.5" /> : null}
      {children}
    </button>
  );
}

/* ---------------------------------- tabs ---------------------------------- */

export function AdminTabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: { id: T; label: string; count?: number }[];
  active: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 border-b border-border px-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          type="button"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            active === tab.id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
          {typeof tab.count === "number" ? (
            <span className="code-id ms-1.5 text-xs text-muted-foreground">{tab.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------- side sheet ------------------------------ */

/**
 * Quick-edit sheet. Slides in from the inline end, traps focus while open and
 * returns focus to the trigger on close.
 */
export function AdminSheet({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], input, select, textarea",
        ) ?? [],
      );
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
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
      triggerRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/50">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-full w-full max-w-md flex-col border-s border-border bg-card shadow-[var(--shadow-lift)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold">{title}</h2>
            {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("adm.common.close")}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ---------------------------------- toasts -------------------------------- */

export function AdminToasts({ toasts, onDismiss }: { toasts: { id: number; message: string }[]; onDismiss: (id: number) => void }) {
  const { t } = useI18n();
  if (toasts.length === 0) return null;
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-60 flex flex-col items-center gap-2 px-4">
      {toasts.map((tst) => (
        <div
          key={tst.id}
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border border-border bg-ink px-4 py-2.5 text-sm font-medium text-ink-foreground shadow-[var(--shadow-lift)]"
        >
          <span>{tst.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(tst.id)}
            aria-label={t("adm.common.close")}
            className="rounded p-0.5 text-ink-muted hover:text-ink-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
