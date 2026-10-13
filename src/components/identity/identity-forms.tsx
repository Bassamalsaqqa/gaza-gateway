import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AppLink, useAppNavigate } from "@/components/app-link";
import { Field, Input, btnClass } from "@/components/kit";
import { PassengerAuthShell } from "@/components/passenger-auth-shell";
import { useI18n } from "@/lib/i18n";
import { identityCopy as pick } from "@/lib/api/identity-ui-copy";
import { emailField, passwordField, tokenField, identityErrorText, type IdentityField } from "@/lib/api/identity-ui-fields";
import { getIdentityUiClient } from "@/lib/api/identity-ui-runtime";
import { useQueryClient } from "@tanstack/react-query";
import { passengerKeys } from "@/lib/passenger/keys";
import { BookingIdentityProof } from "./booking-proof";
import { Eye, EyeOff } from "lucide-react";

const codeField: IdentityField = { name: "totpCode", en: "Authenticator code", ar: "رمز تطبيق المصادقة" };

/** Closed caller-built commands; no automatic JSON/body display or credential persistence. */
export function IdentityForm({ fields, submit, button, after, notice, blocked = false }: {
  fields: IdentityField[]; submit: (values: Record<string, string>) => Promise<void>;
  button?: string; after?: () => void; notice?: string | undefined; blocked?: boolean;
}) {
  const { lang } = useI18n(); const id = useId();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, f.initial ?? ""])));
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const send = async (event: FormEvent) => {
    event.preventDefault(); if (pending || blocked) return;
    setPending(true); setError(null); setDone(false);
    try { await submit(values); setDone(true); after?.(); }
    catch (failure) { setError(identityErrorText(failure, lang)); }
    finally {
      setPending(false);
      setVisiblePasswords({});
      setValues((old) => Object.fromEntries(fields.map((f) => [f.name,
        f.type === "password" || ["token", "totpCode", "recoveryCode", "claimProof", "code"].includes(f.name) ? "" : old[f.name] ?? ""])));
    }
  };
  return <form onSubmit={send} className="space-y-4" aria-busy={pending} aria-describedby={error ? `${id}-error` : undefined}>
    {fields.map((field) => <Field key={field.name} htmlFor={`${id}-${field.name}`} label={pick(lang, field.en, field.ar)}>
      <div className="relative"><Input id={`${id}-${field.name}`} name={field.name} type={field.type === "password" && visiblePasswords[field.name] ? "text" : field.type ?? "text"}
        className={field.type === "password" ? "pe-12" : field.name === "code" ? "text-center font-mono text-xl tracking-[0.5em]" : undefined}
        dir={["email", "token", "totpCode", "recoveryCode", "username", "ref", "code"].includes(field.name) || field.type === "date" ? "ltr" : undefined}
        autoComplete={field.autoComplete ?? (field.type === "password" ? (field.name === "currentPassword" ? "current-password" : "new-password")
          : field.name === "totpCode" ? "one-time-code" : field.type === "email" ? "email" : "off")}
        value={values[field.name] ?? ""} required={!field.optional} disabled={pending}
        maxLength={field.maxLength} pattern={field.pattern} inputMode={field.inputMode}
        onChange={(event) => { setDone(false); setError(null); setValues({ ...values, [field.name]: event.target.value }); }} />
      {field.type === "password" && <button type="button" disabled={pending} aria-controls={`${id}-${field.name}`}
        aria-label={visiblePasswords[field.name] ? pick(lang, "Hide password", "إخفاء كلمة المرور") : pick(lang, "Show password", "إظهار كلمة المرور")}
        aria-pressed={Boolean(visiblePasswords[field.name])} className="absolute inset-y-0 end-0 flex min-w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => setVisiblePasswords((old) => ({ ...old, [field.name]: !old[field.name] }))}>
        {visiblePasswords[field.name] ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
      </button>}</div>
    </Field>)}
    {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
    {error && <p id={`${id}-error`} ref={errorRef} tabIndex={-1} role="alert" className="text-sm text-clay focus-visible:outline-2 focus-visible:outline-ring">{error}</p>}
    {done && <p role="status" className="text-sm text-brand-deep">{pick(lang, "Request confirmed.", "تم تأكيد الطلب.")}</p>}
    <button type="submit" className={btnClass("primary", "md")} disabled={pending || blocked}>
      {pending ? pick(lang, "Please wait…", "يرجى الانتظار…") : button ?? pick(lang, "Confirm", "تأكيد")}
    </button>
  </form>;
}

type PassengerFlow = "signin" | "register" | "forgot" | "reset" | "verify" | "resend" | "guest";
export function PassengerIdentityAuth({ initial = "signin" }: { initial?: PassengerFlow }) {
  const { lang } = useI18n(); const navigate = useAppNavigate(); const query = useQueryClient();
  const [flow] = useState<PassengerFlow>(initial); const [receipt, setReceipt] = useState(false);
  const [showResend, setShowResend] = useState(initial === "resend");
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [resendWait, setResendWait] = useState(0);
  useEffect(() => { if (!resendWait) return; const timer = setTimeout(() => setResendWait(resendWait - 1), 1000); return () => clearTimeout(timer); }, [resendWait]);
  useEffect(() => {
    if (initial !== "verify" || !window.location.hash) return;
    const fragment = window.location.hash.slice(1);
    // Remove secret-bearing URL before making any request; never persist it or put it in search params.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    const token = new URLSearchParams(fragment).get("token");
    if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) setLinkToken(token);
  }, [initial]);
  const titles: Record<PassengerFlow, [string, string]> = {
    guest: ["Guest booking verification", "التحقق من حجز الضيف"],
    signin: ["Sign in", "تسجيل الدخول"], register: ["Create an account", "إنشاء حساب"], forgot: ["Request password recovery", "طلب استعادة كلمة المرور"],
    reset: ["Reset password", "إعادة تعيين كلمة المرور"], verify: ["Verify email", "تأكيد البريد الإلكتروني"], resend: ["Request verification", "طلب التحقق"],
  };
  const fields = flow === "signin" ? [emailField, { ...passwordField, autoComplete: "current-password" as const }] : flow === "register" ? [
    { name: "firstName", en: "First name", ar: "الاسم الأول" }, { name: "lastName", en: "Last name", ar: "اسم العائلة" }, emailField, passwordField,
  ] : flow === "reset" ? [emailField, tokenField, passwordField] : flow === "verify" ? linkToken ? [] : [emailField,
    { name: "code", en: "Six-digit verification code", ar: "رمز التحقق المكوّن من ٦ أرقام", autoComplete: "one-time-code" as const,
      inputMode: "numeric" as const, maxLength: 6, pattern: "[0-9]{6}" }] : [emailField];
  const submit = async (v: Record<string, string>) => {
    const api = getIdentityUiClient();
    if (flow === "signin") {
      await api.postPassengerLogin({ email: v["email"]!, password: v["password"]! });
      await query.cancelQueries({ queryKey: ["mvp", "reservations"] }); query.removeQueries({ queryKey: ["mvp", "reservations"] }); query.removeQueries({ queryKey: passengerKeys.all });
      await navigate({ to: "/account" }); return;
    }
    if (flow === "register") {
      await api.postPassengerRegister({ email: v["email"]!, password: v["password"]!, firstName: v["firstName"]!, lastName: v["lastName"]! });
      await navigate({ to: "/verify-email" }); return;
    }
    if (flow === "forgot") await api.postPassengerPasswordForgot({ email: v["email"]! });
    if (flow === "reset") await api.postPassengerPasswordReset({ email: v["email"]!, token: v["token"]!, password: v["password"]! });
    if (flow === "verify") {
      try { await api.postPassengerEmailVerify(linkToken ? { token: linkToken } : { email: v["email"]!, code: v["code"]! }); }
      finally { setLinkToken(null); }
    }
    if (flow === "resend") await api.postPassengerEmailResend({ email: v["email"]! });
    setReceipt(true); await query.cancelQueries({ queryKey: ["mvp", "reservations"] }); query.removeQueries({ queryKey: ["mvp", "reservations"] }); query.removeQueries({ queryKey: passengerKeys.all });
  };
  return <PassengerAuthShell title={pick(lang, ...titles[flow])}
    description={flow === "signin" ? pick(lang, "Welcome back. Sign in to view your commemorative bookings.", "مرحباً بعودتك. سجّل الدخول لعرض حجوزاتك التذكارية.")
      : flow === "register" ? pick(lang, "Create your account, then verify your email to start booking.", "أنشئ حسابك ثم أكّد بريدك الإلكتروني لبدء الحجز.")
      : flow === "verify" ? linkToken ? pick(lang, "Your verification link is ready. Confirm below to verify your email.", "رابط التحقق جاهز. أكّد أدناه لتأكيد بريدك الإلكتروني.")
        : pick(lang, "Enter the six-digit code from your email, or open the verification link in the same message.", "أدخل رمز التحقق المكوّن من ٦ أرقام من بريدك أو افتح رابط التحقق في الرسالة نفسها.")
      : pick(lang, "Follow the instructions sent to your email to recover access securely.", "اتبع التعليمات المرسلة إلى بريدك لاستعادة الدخول بأمان.")}>
    {flow === "guest" ? <BookingIdentityProof mode="guest" /> : receipt && flow === "verify" ? <p role="status">{pick(lang, "Your email is verified. You can now sign in.", "تم تأكيد بريدك الإلكتروني. يمكنك الآن تسجيل الدخول.")}</p> : <IdentityForm key={flow} fields={fields} submit={submit} button={pick(lang, ...titles[flow])}
      notice={flow === "register" || flow === "reset" ? pick(lang, "Use 6–128 characters. A longer, unique password is recommended.", "استخدم ٦–١٢٨ محرفاً. نوصي بكلمة مرور أطول وفريدة.") : undefined} />}
    {flow === "signin" ? <div className="mt-5 space-y-5 text-sm">
      <AppLink to="/forgot-password" className="font-medium text-brand-deep underline underline-offset-4">{pick(lang, "Forgot password?", "نسيت كلمة المرور؟")}</AppLink>
      <p className="border-t border-border pt-5 text-muted-foreground">{pick(lang, "New here?", "ليس لديك حساب؟")} {" "}<AppLink to="/register" className="font-semibold text-brand-deep underline underline-offset-4">{pick(lang, "Create an account", "إنشاء حساب")}</AppLink></p>
    </div> : <p className="mt-5 text-sm"><AppLink to="/signin" className="font-medium text-brand-deep underline underline-offset-4">{pick(lang, "Back to sign in", "العودة إلى تسجيل الدخول")}</AppLink></p>}
    {flow === "forgot" && receipt && <p className="mt-4 text-sm"><AppLink to="/reset-password" className="font-medium underline underline-offset-4">{pick(lang, "I have my recovery instructions", "وصلتني تعليمات الاستعادة")}</AppLink></p>}
    {flow === "verify" && !receipt && <div className="mt-6 border-t border-border pt-5">
      <button type="button" className="text-sm font-medium text-brand-deep underline underline-offset-4" onClick={() => setShowResend(!showResend)} aria-expanded={showResend}>{pick(lang, "Didn't receive an email?", "لم تصلك الرسالة؟")}</button>
      {showResend && <div className="mt-4"><IdentityForm fields={[emailField]} blocked={resendWait > 0} submit={async (values) => { await getIdentityUiClient().postPassengerEmailResend({email: values["email"]!}); setResendWait(60); }} button={resendWait ? pick(lang, `Request again in ${resendWait}s`, `اطلب مجدداً بعد ${resendWait} ثانية`) : pick(lang,"Resend verification","إعادة إرسال التحقق")}
        notice={pick(lang,"A new message is queued only for an eligible account. Check spam and allow time for delivery.","تُضاف رسالة جديدة إلى الطابور للحساب المؤهل فقط. راجع البريد غير المرغوب واسمح بوقت للتسليم.")} /></div>}
    </div>}
    {receipt && flow !== "verify" && <p className="mt-4 text-sm" role="status">{pick(lang,
      "The request was processed. Verification or recovery instructions are queued only when the details are eligible. Sign in after completing verification or reset.",
      "تمت معالجة الطلب. تُضاف تعليمات التحقق أو الاستعادة إلى قائمة الإرسال فقط إذا كانت البيانات مؤهلة. سجل الدخول بعد إتمام التحقق أو إعادة التعيين.")}</p>}
  </PassengerAuthShell>;
}

type StaffFlow = "signin" | "forgot" | "reset" | "invite";
export function StaffIdentityAuth({ onAuthenticated }: { onAuthenticated?: () => Promise<void> }) {
  const { lang } = useI18n(); const navigate = useAppNavigate();
  const [flow, setFlow] = useState<StaffFlow>("signin"); const [pending, setPending] = useState(false);
  const [expires, setExpires] = useState<string | null>(null); const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    if (!expires) return;
    const timer = setTimeout(() => { setPending(false); setExpires(null); }, Math.max(0, Date.parse(expires) - Date.now()));
    return () => clearTimeout(timer);
  }, [expires]);
  const authenticated = async () => { await onAuthenticated?.(); await navigate({ to: "/admin" }); };
  const labels: Record<StaffFlow, [string, string]> = { signin: ["Staff sign in", "دخول الموظفين"], forgot: ["Request recovery", "طلب الاستعادة"],
    reset: ["Reset password", "إعادة تعيين كلمة المرور"], invite: ["Accept invitation", "قبول الدعوة"] };
  const submit = async (v: Record<string, string>) => {
    const api = getIdentityUiClient();
    if (flow === "signin") {
      const result = await api.postStaffLogin({ username: v["username"]!, password: v["password"]! });
      if (result.data.status === "authenticated") { await authenticated(); return; }
      setPending(true); setExpires(result.data.expiresAt);
    } else if (flow === "invite") {
      await api.postStaffInvitationAccept({ token: v["token"]!, password: v["password"]! });
      await authenticated();
    } else if (flow === "forgot") await api.postStaffPasswordForgot({ email: v["email"]! });
    else await api.postStaffPasswordReset({ token: v["token"]!, newPassword: v["password"]! });
  };
  return <PassengerAuthShell title={pick(lang, "Staff sign in", "دخول الموظفين")}
    description={pick(lang, "Sign in with your password. If you have enabled an authenticator, verification is also required. You can enable it in Admin account security settings.", "سجل الدخول بكلمة المرور. إذا فعّلت تطبيق المصادقة، يلزم التحقق أيضاً. يمكنك تفعيله من إعدادات أمان الحساب في الإدارة.")}>
    {!pending && <>
      <div className="mb-5 flex flex-wrap gap-2">{(Object.keys(labels) as StaffFlow[]).map((item) => <button key={item} type="button"
        className={btnClass("outline", "sm")} onClick={() => setFlow(item)}>{pick(lang, ...labels[item])}</button>)}</div>
      <IdentityForm key={flow} fields={flow === "signin" ? [{ name: "username", en: "Username", ar: "اسم المستخدم", autoComplete: "username" }, { ...passwordField, autoComplete: "current-password" }]
        : flow === "forgot" ? [emailField] : [tokenField, passwordField]} submit={submit} button={pick(lang, ...labels[flow])}
        notice={flow === "forgot" ? pick(lang, "Recovery instructions are queued only for eligible accounts.", "تُضاف تعليمات الاستعادة إلى قائمة الإرسال للحسابات المؤهلة فقط.")
          : pick(lang, "Staff passwords require 12–128 characters.", "تتطلب كلمات مرور الموظفين ١٢–١٢٨ محرفاً.")} />
    </>}
    {pending && <div className="space-y-4">
      <p>{pick(lang, "Complete verification before the pending session expires.", "أكمل التحقق قبل انتهاء الجلسة المعلقة.")}</p>
      <button type="button" className={btnClass("outline", "sm")} onClick={() => setRecovery(!recovery)}>
        {recovery ? pick(lang, "Use authenticator", "استخدام تطبيق المصادقة") : pick(lang, "Use recovery code", "استخدام رمز الاسترداد")}</button>
      <IdentityForm key={String(recovery)} fields={recovery ? [{ name: "recoveryCode", en: "Recovery code", ar: "رمز الاسترداد" }] : [codeField]}
        submit={async (v) => {
          await getIdentityUiClient().postStaffMfaVerify(recovery ? { recoveryCode: v["recoveryCode"]! } : { totpCode: v["totpCode"]! });
          setPending(false); setExpires(null); await authenticated();
        }} button={pick(lang, "Verify", "تحقق")} />
      <button type="button" className={btnClass("outline", "sm")} onClick={() => { setPending(false); setExpires(null); }}>
        {pick(lang, "Return to sign in", "العودة إلى تسجيل الدخول")}</button>
    </div>}
  </PassengerAuthShell>;
}
