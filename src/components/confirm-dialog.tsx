import { useEffect, useRef } from "react";
import { btnClass } from "@/components/kit";
import { useI18n } from "@/lib/i18n";

/**
 * Restrained confirmation dialog for destructive actions.
 * Focus moves to the dismiss button, Escape closes, background scroll is kept.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const dismissRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    dismissRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-4 sm:items-center">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-lift)]"
      >
        <h2 id="confirm-title" className="text-lg font-bold">
          {title}
        </h2>
        <p id="confirm-body" className="mt-2 text-sm text-muted-foreground">
          {body}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button ref={dismissRef} type="button" onClick={onClose} className={btnClass("secondary", "sm")}>
            {t("common.keep")}
          </button>
          <button type="button" onClick={onConfirm} className={btnClass("ink", "sm")}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
