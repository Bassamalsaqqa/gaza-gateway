import * as React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/lib/i18n";

/**
 * Restrained confirmation dialog for destructive actions, built on installed Radix AlertDialog.
 * - Safe initial focus moves to the non-destructive cancel/keep action.
 * - Tab containment, Escape key, and trigger focus restoration are managed by Radix.
 * - Exact trigger node is preserved on open and restored via Radix onCloseAutoFocus.
 * - Single-close path on controlled onOpenChange(false) prevents duplicate callbacks.
 * - Casual backdrop clicks are prevented from dismissing the confirmation.
 * - Body scroll lock is safely managed and cleanly restored.
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
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const prevOpenRef = React.useRef(open);

  // Capture active element when dialog transitions from closed to open
  if (typeof window !== "undefined" && open && !prevOpenRef.current) {
    if (
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
    ) {
      triggerRef.current = document.activeElement;
    }
  }

  React.useEffect(() => {
    if (open && !prevOpenRef.current) {
      if (
        !triggerRef.current &&
        document.activeElement instanceof HTMLElement &&
        document.activeElement !== document.body
      ) {
        triggerRef.current = document.activeElement;
      }
    }
    prevOpenRef.current = open;
  }, [open]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          if (triggerRef.current && triggerRef.current.isConnected) {
            event.preventDefault();
            triggerRef.current.focus();
          }
          triggerRef.current = null;
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel autoFocus>
            {t("common.keep")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
