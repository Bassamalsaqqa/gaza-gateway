import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------------------------------- button --------------------------------- */

export type Variant = "primary" | "secondary" | "ghost" | "ink" | "clay" | "outline" | "destructive";
export type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-brand-deep shadow-xs",
  secondary: "bg-secondary text-secondary-foreground hover:bg-sand-deep shadow-xs",
  ghost: "bg-transparent text-foreground hover:bg-secondary",
  ink: "bg-ink text-ink-foreground hover:bg-brand-deep shadow-xs",
  clay: "bg-clay text-primary-foreground hover:brightness-95 shadow-xs",
  outline: "border border-input bg-card text-foreground hover:bg-secondary shadow-xs",
  destructive: "bg-destructive text-destructive-foreground hover:brightness-95 shadow-xs",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-13 px-6 text-base gap-2",
  icon: "size-9 p-0 min-h-9 min-w-9",
};

export function btnClass(variant: Variant = "primary", size: Size = "md", extra?: string): string {
  return cn(
    // Base & typography
    "inline-flex items-center justify-center rounded-lg font-semibold tracking-tight whitespace-nowrap select-none",
    // Motion & cursor
    "cursor-pointer transition-all duration-150 active:scale-[0.99] active:transition-none motion-reduce:active:scale-100 motion-reduce:transform-none motion-reduce:transition-none",
    // Focus visible ring
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    // Disabled states (native & ARIA)
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:cursor-not-allowed",
    // Selected / open state hooks
    "data-[state=open]:bg-sand-deep data-[state=selected]:bg-brand-soft/80 data-[state=selected]:text-brand-deep aria-pressed:bg-brand-soft aria-pressed:text-brand-deep data-[state=active]:bg-brand-soft/80",
    // Pending / busy state hooks
    "data-[pending=true]:pointer-events-none data-[pending=true]:opacity-80 data-[pending=true]:cursor-wait aria-busy:pointer-events-none aria-busy:opacity-80 aria-busy:cursor-wait",
    variants[variant],
    sizes[size],
    extra,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  pending?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  pending = false,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        btnClass(variant, size, className),
        pending && "relative !text-transparent transition-none hover:!text-transparent",
      )}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      data-pending={pending ? "true" : undefined}
      {...props}
    >
      {children}
      {pending ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center text-current"
        >
          <Loader2 className="size-4 animate-spin text-foreground motion-reduce:animate-none" />
        </span>
      ) : null}
    </button>
  );
}

/* ---------------------------------- inputs -------------------------------- */

const fieldBase =
  "w-full rounded-lg border border-input bg-card px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  errorId,
  children,
  className,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  htmlFor?: string | undefined;
  /** Stable id to place on the error message element so inputs can reference it via aria-describedby. */
  errorId?: string | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="type-label text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, "h-11", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, "h-11 appearance-none pe-9", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, "min-h-32 resize-y", className)} {...props} />;
}

/* --------------------------------- surfaces ------------------------------- */

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("surface p-5 sm:p-6", className)}>{children}</div>;
}

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "clay" | "ink";
  className?: string;
}) {
  const tones = {
    neutral: "bg-secondary text-secondary-foreground",
    brand: "bg-brand-soft text-brand-deep",
    clay: "bg-clay-soft text-accent-foreground",
    ink: "bg-ink text-ink-foreground",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return <p className={cn("eyebrow text-clay", className)}>{children}</p>;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  tone = "light",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "light" | "dark";
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow ? <Eyebrow className={tone === "dark" ? "text-clay-soft" : undefined}>{eyebrow}</Eyebrow> : null}
        <h2
          className={cn(
            "type-title-md",
            eyebrow ? "mt-1.5" : "",
            tone === "dark" ? "text-ink-foreground" : "text-foreground",
          )}
        >
          {title}
        </h2>
        {description ? (
          <p className={cn("mt-2 text-sm sm:text-base", tone === "dark" ? "text-ink-muted" : "text-muted-foreground")}>
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-border bg-ambient-sand">
      <div className="page-shell px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className="type-title-lg mt-2">{title}</h1>
        {description ? <p className="mt-2.5 max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p> : null}
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="surface flex flex-col items-center gap-3 px-6 py-14 text-center">
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      <h3 className="type-title-sm">{title}</h3>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action}
    </div>
  );
}

export function Notice({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="rounded-lg border border-clay/30 bg-clay-soft/70 px-4 py-3 text-sm text-accent-foreground">
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </div>
  );
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("page-shell px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

export function Code({
  children,
  className,
  dir,
}: {
  children: ReactNode;
  className?: string;
  dir?: "ltr" | "rtl";
}) {
  return (
    <span dir={dir} className={cn("code-id", className)}>
      {children}
    </span>
  );
}

export { GazaLoadingState, Skeleton } from '@/components/ui/skeleton';
