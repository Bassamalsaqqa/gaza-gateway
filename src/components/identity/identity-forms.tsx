import { useEffect, useId, useState, type FormEvent } from "react";
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

const codeField: IdentityField = { name: "totpCode", en: "Authenticator code", ar: "رمز تطبيق المصادقة" };

/** Closed caller-built commands; no automatic JSON/body display or credential persistence. */
export function IdentityForm({ fields, submit, button, after, notice }: {
  fields: IdentityField[]; submit: (values: Record<string, string>) => Promise<void>;
  button?: string; after?: () => void; notice?: string | undefined;
}) {
  const { lang } = useI18n(); const id = useId();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, f.initial ?? ""])));
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const send = async (event: FormEvent) => {
    event.preventDefault(); if (pending) return;
    setPending(true); setError(null); setDone(false);
    try { await submit(values); setDone(true); after?.(); }
    catch (failure) { setError(identityErrorText(failure, lang)); }
    finally {
      setPending(false);
      setValues((old) => Object.fromEntries(fields.map((f) => [f.name,
        f.type === "password" || ["token", "totpCode", "recoveryCode", "claimProof", "code"].includes(f.name) ? "" : old[f.name] ?? ""])));
    }
  };
  return <form onSubmit={send} className="space-y-4" aria-busy={pending} aria-describedby={error ? `${id}-error` : undefined}>
    {fields.map((field) => <Field key={field.name} htmlFor={`${id}-${field.name}`} label={pick(lang, field.en, field.ar)}>
      <Input id={`${id}-${field.name}`} name={field.name} type={field.type ?? "text"}
        dir={["email", "token", "totpCode", "recoveryCode", "username", "ref", "code"].includes(field.name) || field.type === "date" ? "ltr" : undefined}
        autoComplete={field.type === "password" ? (field.name === "currentPassword" ? "current-password" : "off")
          : field.name === "totpCode" ? "one-time-code" : field.type === "email" ? "email" : "off"}
        value={values[field.name] ?? ""} required={!field.optional} disabled={pending}
        onChange={(event) => { setDone(false); setError(null); setValues({ ...values, [field.name]: event.target.value }); }} />
    </Field>)}
    {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
    {error && <p id={`${id}-error`} role="alert" className="text-sm text-clay">{error}</p>}
    {done && <p role="status" className="text-sm text-brand-deep">{pick(lang, "Request confirmed.", "تم تأكيد الطلب.")}</p>}
    <button type="submit" className={btnClass("primary", "md")} disabled={pending}>
      {pending ? pick(lang, "Please wait…", "يرجى الانتظار…") : button ?? pick(lang, "Confirm", "تأكيد")}
    </button>
  </form>;
}

type PassengerFlow = "signin" | "register" | "forgot" | "reset" | "verify" | "resend" | "guest";
export function PassengerIdentityAuth({ initial = "signin" }: { initial?: PassengerFlow }) {
  const { lang } = useI18n(); const navigate = useAppNavigate(); const query = useQueryClient();
  const [flow, setFlow] = useState<PassengerFlow>(initial); const [receipt, setReceipt] = useState(false);
  const titles: Record<PassengerFlow, [string, string]> = {
    guest: ["Guest booking verification", "التحقق من حجز الضيف"],
    signin: ["Sign in", "تسجيل الدخول"], register: ["Create an account", "إنشاء حساب"], forgot: ["Request password recovery", "طلب استعادة كلمة المرور"],
    reset: ["Reset password", "إعادة تعيين كلمة المرور"], verify: ["Verify email", "تأكيد البريد الإلكتروني"], resend: ["Request verification", "طلب التحقق"],
  };
  const fields = flow === "signin" ? [emailField, passwordField] : flow === "register" ? [
    { name: "firstName", en: "First name", ar: "الاسم الأول" }, { name: "lastName", en: "Last name", ar: "اسم العائلة" }, emailField, passwordField,
  ] : flow === "reset" ? [emailField, tokenField, passwordField] : flow === "verify" ? [tokenField] : [emailField];
  const submit = async (v: Record<string, string>) => {
    const api = getIdentityUiClient();
    if (flow === "signin") {
      await api.postPassengerLogin({ email: v["email"]!, password: v["password"]! });
      query.removeQueries({ queryKey: passengerKeys.all });
      await navigate({ to: "/account" }); return;
    }
    if (flow === "register") await api.postPassengerRegister({ email: v["email"]!, password: v["password"]!, firstName: v["firstName"]!, lastName: v["lastName"]! });
    if (flow === "forgot") await api.postPassengerPasswordForgot({ email: v["email"]! });
    if (flow === "reset") await api.postPassengerPasswordReset({ email: v["email"]!, token: v["token"]!, password: v["password"]! });
    if (flow === "verify") await api.postPassengerEmailVerify({ token: v["token"]! });
    if (flow === "resend") await api.postPassengerEmailResend({ email: v["email"]! });
    setReceipt(true); query.removeQueries({ queryKey: passengerKeys.all });
  };
  return <PassengerAuthShell title={pick(lang, ...titles[flow])}
    description={pick(lang, "Account preview. Your account is verified by the account service.", "معاينة الحساب. تتحقق خدمة الحساب من هويتك.")}>
    <div className="mb-5 flex flex-wrap gap-2" aria-label={pick(lang, "Account actions", "إجراءات الحساب")}>
      {(Object.keys(titles) as PassengerFlow[]).filter((item) => item !== flow).map((item) => <button key={item} type="button"
        className={btnClass("outline", "sm")} onClick={() => { setFlow(item); setReceipt(false); }}>{pick(lang, ...titles[item])}</button>)}
    </div>
    {flow === "guest" ? <BookingIdentityProof mode="guest" /> : <IdentityForm key={flow} fields={fields} submit={submit} button={pick(lang, ...titles[flow])}
      notice={flow === "register" || flow === "reset" ? pick(lang, "Use 15–128 characters. Passwords are not trimmed.", "استخدم ١٥–١٢٨ محرفاً. لا تُحذف المسافات من كلمة المرور.") : undefined} />}
    {receipt && <p className="mt-4 text-sm" role="status">{pick(lang,
      "The request was processed. Verification or recovery instructions are queued only when the details are eligible. Sign in after completing verification or reset.",
      "تمت معالجة الطلب. تُضاف تعليمات التحقق أو الاستعادة إلى قائمة الإرسال فقط إذا كانت البيانات مؤهلة. سجل الدخول بعد إتمام التحقق أو إعادة التعيين.")}</p>}
  </PassengerAuthShell>;
}

type StaffFlow = "signin" | "forgot" | "reset" | "invite";
export function StaffIdentityAuth() {
  const { lang } = useI18n(); const navigate = useAppNavigate();
  const [flow, setFlow] = useState<StaffFlow>("signin"); const [pending, setPending] = useState<"login" | "enroll" | null>(null);
  const [expires, setExpires] = useState<string | null>(null); const [secret, setSecret] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false); const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  useEffect(() => {
    if (!codes.length && !secret) return;
    const scrub = () => { setCodes([]); setSecret(null); };
    const hidden = () => { if (document.visibilityState === "hidden") scrub(); };
    const timer = setTimeout(scrub, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", hidden);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", hidden); };
  }, [codes, secret]);
  useEffect(() => {
    if (!expires) return;
    const timer = setTimeout(() => { setPending(null); setSecret(null); setExpires(null); }, Math.max(0, Date.parse(expires) - Date.now()));
    return () => clearTimeout(timer);
  }, [expires]);
  const labels: Record<StaffFlow, [string, string]> = { signin: ["Staff sign in", "دخول الموظفين"], forgot: ["Request recovery", "طلب الاستعادة"],
    reset: ["Reset password", "إعادة تعيين كلمة المرور"], invite: ["Accept invitation", "قبول الدعوة"] };
  const submit = async (v: Record<string, string>) => {
    const api = getIdentityUiClient();
    if (flow === "signin") {
      const result = await api.postStaffLogin({ username: v["username"]!, password: v["password"]! });
      setPending(result.data.status === "enrollment_required" ? "enroll" : "login"); setExpires(result.data.expiresAt);
    } else if (flow === "invite") {
      const result = await api.postStaffInvitationAccept({ token: v["token"]!, password: v["password"]! });
      setPending("enroll"); setExpires(result.data.expiresAt);
    } else if (flow === "forgot") await api.postStaffPasswordForgot({ email: v["email"]! });
    else await api.postStaffPasswordReset({ token: v["token"]!, newPassword: v["password"]! });
  };
  const setup = async () => {
    if (settingUp) return;
    setSettingUp(true);
    setError(null);
    try { const result = await getIdentityUiClient().postStaffMfaEnrollmentSetup(); setSecret(result.data.secret); setExpires(result.data.expiresAt); }
    catch (failure) { setError(identityErrorText(failure, lang)); }
    finally { setSettingUp(false); }
  };
  const verify = async (v: Record<string, string>) => {
    if (pending === "enroll") {
      const result = await getIdentityUiClient().postStaffMfaEnrollmentConfirm({ totpCode: v["totpCode"]! });
      setCodes(result.data.recoveryCodes); setPending(null); setSecret(null); setExpires(null);
    } else {
      await getIdentityUiClient().postStaffMfaVerify(recovery ? { recoveryCode: v["recoveryCode"]! } : { totpCode: v["totpCode"]! });
      setPending(null); setExpires(null); await navigate({ to: "/admin" });
    }
  };
  return <PassengerAuthShell title={pick(lang, "Staff account preview", "معاينة حساب الموظف")}
    description={pick(lang, "Staff access requires your own password and authenticator.", "يتطلب دخول الموظف كلمة مروره وتطبيق المصادقة الخاص به.")}>
    {!pending && codes.length === 0 && <>
      <div className="mb-5 flex flex-wrap gap-2">{(Object.keys(labels) as StaffFlow[]).map((item) => <button key={item} type="button"
        className={btnClass("outline", "sm")} onClick={() => { setFlow(item); setError(null); }}>{pick(lang, ...labels[item])}</button>)}</div>
      <IdentityForm key={flow} fields={flow === "signin" ? [{ name: "username", en: "Username", ar: "اسم المستخدم" }, passwordField]
        : flow === "forgot" ? [emailField] : [tokenField, passwordField]} submit={submit} button={pick(lang, ...labels[flow])}
        notice={flow === "forgot" ? pick(lang, "Recovery instructions are queued only for eligible accounts.", "تُضاف تعليمات الاستعادة إلى قائمة الإرسال للحسابات المؤهلة فقط.")
          : pick(lang, "Staff passwords require 12–128 characters.", "تتطلب كلمات مرور الموظفين ١٢–١٢٨ محرفاً.")} />
    </>}
    {pending && <div className="space-y-4">
      <p>{pick(lang, "Complete verification before the pending session expires.", "أكمل التحقق قبل انتهاء الجلسة المعلقة.")}</p>
      {pending === "enroll" && <><button type="button" disabled={settingUp} className={btnClass("outline", "md")} onClick={() => void setup()}>
        {pick(lang, "Set up authenticator", "إعداد تطبيق المصادقة")}</button>
        {secret && <p dir="ltr" className="break-all font-mono" aria-label={pick(lang, "Authenticator setup secret", "سر إعداد المصادقة")}>{secret}</p>}</>}
      {pending === "login" && <button type="button" className={btnClass("outline", "sm")} onClick={() => setRecovery(!recovery)}>
        {recovery ? pick(lang, "Use authenticator", "استخدام تطبيق المصادقة") : pick(lang, "Use recovery code", "استخدام رمز الاسترداد")}</button>}
      <IdentityForm key={`${pending}-${recovery}`} fields={recovery && pending === "login" ? [{ name: "recoveryCode", en: "Recovery code", ar: "رمز الاسترداد" }] : [codeField]}
        submit={verify} button={pick(lang, "Verify", "تحقق")} />
      <button type="button" className={btnClass("outline", "sm")} onClick={() => { setPending(null); setSecret(null); setExpires(null); }}>
        {pick(lang, "Return to sign in", "العودة إلى تسجيل الدخول")}</button>
    </div>}
    {error && <p role="alert" className="mt-4 text-clay">{error}</p>}
    {codes.length > 0 && <div className="space-y-4"><p>{pick(lang, "Keep these recovery codes privately. They are shown only now.", "احفظ رموز الاسترداد بشكل خاص. تُعرض الآن فقط.")}</p>
      <ul dir="ltr" className="font-mono">{codes.map((code) => <li key={code}>{code}</li>)}</ul>
      <AppLink to="/admin" className={btnClass("primary", "md")} onClick={() => setCodes([])}>{pick(lang, "Continue", "متابعة")}</AppLink>
    </div>}
  </PassengerAuthShell>;
}
