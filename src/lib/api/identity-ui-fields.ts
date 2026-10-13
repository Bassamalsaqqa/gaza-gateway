import { identityCopy as pick } from "./identity-ui-copy.ts";
import { isIdentityApiError } from "./identity-client-errors.ts";

export type IdentityField = { name: string; en: string; ar: string; type?: "email" | "password" | "date" | "text"; optional?: boolean; initial?: string; maxLength?: number; pattern?: string; inputMode?: "numeric"; autoComplete?: "current-password" | "new-password" | "email" | "username" | "one-time-code" | "off" };
export const emailField: IdentityField = { name: "email", en: "Email", ar: "البريد الإلكتروني", type: "email" };
export const passwordField: IdentityField = { name: "password", en: "Password", ar: "كلمة المرور", type: "password" };
export const tokenField: IdentityField = { name: "token", en: "Verification token", ar: "رمز التحقق" };

export function identityErrorText(error: unknown, lang: "en" | "ar"): string {
  if (isIdentityApiError(error)) {
    if (error.kind === "configuration") return pick(lang, "Account access is unavailable with this configuration.", "الدخول إلى الحساب غير متاح بهذه الإعدادات.");
    if (error.status === 401) return pick(lang, "Your credentials or session could not be verified. Sign in again if your session expired.", "تعذر التحقق من بيانات الدخول أو الجلسة. سجل الدخول مجدداً إذا انتهت جلستك.");
    if (error.status === 403) return pick(lang, "This action is not authorized. A fresh verification may be required.", "هذا الإجراء غير مصرح به. قد يلزم تحقق جديد.");
    if (error.status === 429) return pick(lang, "Too many attempts. Wait before trying again.", "محاولات كثيرة. انتظر قبل المحاولة مجدداً.");
    if (error.status === 422) return pick(lang, "Check the entered details and password requirements.", "راجع البيانات المدخلة ومتطلبات كلمة المرور.");
    if (error.status === 409) return pick(lang, "The action conflicts with the current account state.", "يتعارض الإجراء مع حالة الحساب الحالية.");
  }
  return pick(lang, "The account service is unavailable. Your request was not confirmed.", "خدمة الحساب غير متاحة. لم يتم تأكيد طلبك.");
}
