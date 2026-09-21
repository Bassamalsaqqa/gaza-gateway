import * as TabsPrimitive from "@radix-ui/react-tabs";
import { useId, useRef, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
        <h1 className="type-title-md">{title}</h1>
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
  tone?: "neutral" | "brand" | "warn" | "danger" | undefined;
  hint?: string | undefined;
  emphasis?: boolean | undefined;
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
      <p className="type-label text-muted-foreground">{label}</p>
      <p className={cn("code-id mt-1 font-bold", emphasis ? "text-2xl" : "text-xl", tones[tone])}>
        {value}
      </p>
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

export function BilingualStatus({
  missingAr,
  missingEn,
}: {
  missingAr?: boolean | undefined;
  missingEn?: boolean | undefined;
}) {
  const { t } = useI18n();
  if (missingAr)
    return (
      <AdminChip tone="warn" icon={<AlertTriangle aria-hidden="true" className="size-3" />}>
        {t("adm.bilingual.missingAr")}
      </AdminChip>
    );
  if (missingEn)
    return (
      <AdminChip tone="warn" icon={<AlertTriangle aria-hidden="true" className="size-3" />}>
        {t("adm.bilingual.missingEn")}
      </AdminChip>
    );
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

/* ------------------------------ error state ------------------------------- */

export function AdminError({ onRetry }: { onRetry?: (() => void) | undefined }) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className="rounded-lg border border-status-cancelled/30 bg-status-cancelled/5 px-4 py-6 text-center"
    >
      <p className="text-sm font-semibold">{t("adm.err.title")}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{t("adm.err.body")}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("adm.err.retry")}
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------ compact form field + actions -------------------- */

/** Dense two-line admin field: label above control, optional hint below. */
export function AdminField({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={htmlFor} className="type-label text-muted-foreground">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Sticky bottom action bar for future full-page admin editors. */
export function AdminStickyActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-3 mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-card/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4">
      {children}
    </div>
  );
}

/* --------------------------- empty / loading state ------------------------ */

export function AdminEmpty({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
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
        <div
          key={i}
          className="h-8 animate-pulse rounded-md bg-secondary motion-reduce:animate-none"
        />
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
  const { lang } = useI18n();
  return (
    <TabsPrimitive.Root
      value={active}
      onValueChange={(val) => onChange(val as T)}
      dir={lang === "ar" ? "rtl" : "ltr"}
      className="w-full"
    >
      <TabsPrimitive.List
        aria-label={label}
        className="flex flex-wrap gap-1 border-b border-border px-2"
      >
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.id}
            value={tab.id}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors cursor-pointer select-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              "data-[state=active]:border-primary data-[state=active]:text-foreground",
              "data-[state=inactive]:border-transparent data-[state=inactive]:text-muted-foreground hover:data-[state=inactive]:text-foreground",
            )}
          >
            {tab.label}
            {typeof tab.count === "number" ? (
              <span className="code-id ms-1.5 text-xs text-muted-foreground">{tab.count}</span>
            ) : null}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  );
}

/* -------------------------------- side sheet ------------------------------ */

/**
 * Quick-edit sheet / modal drawer. Supports logical inline start or end, traps focus
 * while open and returns focus to the trigger on close via Radix Dialog.
 */
export function GazaSheet({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  side = "end",
  className,
  overlayClassName,
  bodyClassName,
  headerLeading,
  closeLabel,
  restoreFocus = true,
  restoreFocusRef,
  triggerRef,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  side?: "start" | "end";
  className?: string;
  overlayClassName?: string;
  bodyClassName?: string;
  headerLeading?: ReactNode;
  closeLabel?: string;
  restoreFocus?: boolean;
  restoreFocusRef?: React.RefObject<boolean>;
  triggerRef?: React.RefObject<HTMLElement | null>;
}) {
  const { t, lang } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();

  const xOffset =
    side === "start"
      ? lang === "ar"
        ? "100%"
        : "-100%"
      : lang === "ar"
        ? "-100%"
        : "100%";

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay forceMount asChild>
              <motion.div
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.16 }}
                className={cn("fixed inset-0 z-50 bg-ink/55", overlayClassName)}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content
              forceMount
              asChild
              aria-labelledby={titleId}
              aria-describedby={description ? descriptionId : undefined}
              onOpenAutoFocus={() => {
                returnFocusRef.current = document.activeElement as HTMLElement | null;
              }}
              onCloseAutoFocus={(event) => {
                const shouldRestore = restoreFocusRef ? restoreFocusRef.current : restoreFocus;
                if (!shouldRestore) {
                  event.preventDefault();
                  return;
                }
                const target = triggerRef?.current ?? returnFocusRef.current;
                if (!target || !document.body.contains(target) || target.offsetParent === null) {
                  return;
                }
                event.preventDefault();
                target.focus();
              }}
            >
              <motion.aside
                initial={reduceMotion ? false : { x: xOffset }}
                animate={{ x: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { x: xOffset }}
                transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "fixed inset-y-0 z-50 flex h-dvh flex-col shadow-[var(--shadow-lift)] focus:outline-none",
                  side === "start" ? "start-0 border-e border-border" : "end-0 border-s border-border",
                  "w-full max-w-md bg-card",
                  className,
                )}
              >
                {headerLeading ? (
                  <div className="flex items-center justify-between border-b border-white/10">
                    <DialogPrimitive.Title id={titleId} className="sr-only">
                      {title}
                    </DialogPrimitive.Title>
                    {description ? (
                      <DialogPrimitive.Description id={descriptionId} className="sr-only">
                        {description}
                      </DialogPrimitive.Description>
                    ) : null}
                    <div className="min-w-0">{headerLeading}</div>
                    <DialogPrimitive.Close
                      aria-label={closeLabel ?? t("adm.common.close")}
                      className="me-2 flex size-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md text-[var(--admin-nav-muted)] hover:text-[var(--admin-nav-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <X aria-hidden="true" className="size-5" />
                    </DialogPrimitive.Close>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="min-w-0">
                      <DialogPrimitive.Title id={titleId} className="text-sm font-bold">
                        {title}
                      </DialogPrimitive.Title>
                      {description ? (
                        <DialogPrimitive.Description
                          id={descriptionId}
                          className="text-xs text-muted-foreground"
                        >
                          {description}
                        </DialogPrimitive.Description>
                      ) : null}
                    </div>
                    <DialogPrimitive.Close
                      aria-label={closeLabel ?? t("adm.common.close")}
                      className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <X aria-hidden="true" className="size-4" />
                    </DialogPrimitive.Close>
                  </div>
                )}
                <div className={cn("flex-1 overflow-y-auto", bodyClassName ?? "px-4 py-4")}>
                  {children}
                </div>
                {footer ? (
                  <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
                    {footer}
                  </div>
                ) : null}
              </motion.aside>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

/* ---------------------------------- toasts -------------------------------- */

export function AdminToasts({
  toasts,
  onDismiss,
}: {
  toasts: { id: number; message: string }[];
  onDismiss: (id: number) => void;
}) {
  const { t } = useI18n();
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-60 flex flex-col items-center gap-2 px-4"
    >
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
