import { Children, cloneElement, createContext, isValidElement, useContext } from "react";
import type { ComponentProps, ReactNode } from "react";
import { AdminField } from "@/components/admin/admin-kit";
import { useI18n } from "@/lib/i18n";

const Errors = createContext<Record<string, string>>({});

export function CmsValidationFields({ errors, children }: { errors: Record<string, string>; children: ReactNode }) {
  return <Errors.Provider value={errors}>{children}</Errors.Provider>;
}

/** Bind a field's visible validation message to its actual input, including hidden-locale errors. */
export function CmsField({ children, htmlFor, ...props }: ComponentProps<typeof AdminField>) {
  const errors = useContext(Errors);
  const { t } = useI18n();
  const error = htmlFor ? errors[htmlFor] : undefined;
  const messageId = `${htmlFor}-err`;
  const existingMessage = Children.toArray(children).some((child) =>
    isValidElement<{ id?: string }>(child) && child.props.id === messageId);
  return <AdminField {...props} {...(htmlFor ? { htmlFor } : {})}>
    {Children.map(children, (child) => {
      if (!error || !isValidElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>(child) || child.props.id !== htmlFor) return child;
      return cloneElement(child, { "aria-invalid": true, "aria-describedby": messageId });
    })}
    {error && !existingMessage && <p id={messageId} role="alert" className="mt-1 text-xs text-destructive">{t(error)}</p>}
  </AdminField>;
}
