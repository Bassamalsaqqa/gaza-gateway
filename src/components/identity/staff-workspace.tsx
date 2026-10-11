import { useCallback, useEffect, useRef, useState } from "react";
import { AppLink } from "@/components/app-link";
import { Container, Panel, btnClass } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { identityCopy as pick } from "@/lib/api/identity-ui-copy";
import { discardIdentityUiClient, getIdentityUiClient } from "@/lib/api/identity-ui-runtime";
import type { StaffProfile, StaffSessionDto, StaffUserDirectoryDto } from "@/lib/api/identity-types";
import { IdentityForm } from "./identity-forms";
import { emailField, passwordField, identityErrorText, type IdentityField } from "@/lib/api/identity-ui-fields";

const names: IdentityField[] = [{ name: "fullNameEn", en: "Name in English", ar: "الاسم بالإنجليزية" },
  { name: "fullNameAr", en: "Name in Arabic", ar: "الاسم بالعربية" }];
const roleField: IdentityField = { name: "role", en: "Role: admin, editor or viewer", ar: "الدور: admin أو editor أو viewer", initial: "viewer" };
function role(value: string): "admin" | "editor" | "viewer" {
  if (value !== "admin" && value !== "editor" && value !== "viewer") throw new Error("Invalid role.");
  return value;
}

/** Staff preview exposes only implemented identity operations, never mock backoffice authority. */
export function StaffIdentityWorkspace() {
  const { lang } = useI18n(); const generation = useRef(0);
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [sessions, setSessions] = useState<StaffSessionDto[]>([]); const [directory, setDirectory] = useState<StaffUserDirectoryDto[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<unknown>(null);
  const [recovery, setRecovery] = useState(false); const [secret, setSecret] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]); const [stepUpUntil, setStepUpUntil] = useState<string | null>(null);
  const clear = useCallback(() => { generation.current++; setStaff(null); setSessions([]); setDirectory([]); setSecret(null); setStepUpUntil(null); }, []);
  const load = useCallback(async (signal?: AbortSignal) => {
    const ticket = ++generation.current; setLoading(true); setError(null);
    try {
      const api = getIdentityUiClient(); const options = signal ? { signal } : undefined;
      const current = await api.getStaffMe(options);
      const [active, users] = await Promise.all([api.getStaffSessions(options),
        current.data.permissions.includes("admin.manage") ? api.getStaffUsersDirectory(options) : Promise.resolve(null)]);
      const confirm = await api.getStaffMe(options);
      if (current.data.id !== confirm.data.id || JSON.stringify(current.data.permissions) !== JSON.stringify(confirm.data.permissions)) throw new Error("Staff context changed.");
      if (signal?.aborted || ticket !== generation.current) return;
      setStaff(confirm.data); setSessions(active.data); setDirectory(users?.data ?? []);
    } catch (failure) { if (!signal?.aborted && ticket === generation.current) { setStaff(null); setSessions([]); setDirectory([]); setSecret(null); setStepUpUntil(null); setError(failure); } }
    finally { if (!signal?.aborted && ticket === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    const abort = new AbortController(); void load(abort.signal);
    const focus = () => { void load(abort.signal); }; window.addEventListener("focus", focus);
    const scope = generation;
    return () => { scope.current++; abort.abort(); window.removeEventListener("focus", focus); };
  }, [load]);
  useEffect(() => {
    if (!codes.length && !secret) return;
    const scrub = () => { setCodes([]); setSecret(null); };
    const hidden = () => { if (document.visibilityState === "hidden") scrub(); };
    const timer = setTimeout(scrub, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", hidden);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", hidden); };
  }, [codes, secret]);
  useEffect(() => {
    if (!stepUpUntil) return;
    const timer = setTimeout(() => setStepUpUntil(null), Math.max(0, Date.parse(stepUpUntil) - Date.now()));
    return () => clearTimeout(timer);
  }, [stepUpUntil]);
  const logout = async () => {
    clear(); setCodes([]); setLoading(true);
    try { await getIdentityUiClient().postStaffLogout(); discardIdentityUiClient(); }
    catch (failure) { setError(failure); } finally { setLoading(false); }
  };
  const credentialsChanged = () => { clear(); discardIdentityUiClient(); };
  const credentialField: IdentityField = recovery ? { name: "recoveryCode", en: "Recovery code", ar: "رمز الاسترداد" }
    : { name: "totpCode", en: "Authenticator code", ar: "رمز تطبيق المصادقة" };
  return <Container className="py-10">
    <h1 className="font-display text-3xl font-bold">{pick(lang, "Staff identity", "هوية الموظف")}</h1>
    {error !== null && <p role="alert" className="mt-4 text-clay">{identityErrorText(error, lang)}</p>}
    {loading && <p role="status" className="mt-4">{pick(lang, "Verifying staff access…", "جارٍ التحقق من دخول الموظف…")}</p>}
    {!loading && !staff && <AppLink to="/admin/signin" className={btnClass("primary", "md")}>{pick(lang, "Staff sign in", "دخول الموظفين")}</AppLink>}
    {codes.length > 0 && <Panel className="my-5"><p>{pick(lang, "Keep these recovery codes privately. This display clears after five minutes or when this tab is hidden.", "احفظ رموز الاسترداد بشكل خاص. يُمسح هذا العرض بعد خمس دقائق أو عند إخفاء علامة التبويب.")}</p>
      <ul dir="ltr" className="my-4 font-mono">{codes.map((code) => <li key={code}>{code}</li>)}</ul>
      <button type="button" onClick={() => setCodes([])} className={btnClass("outline", "sm")}>{pick(lang, "Clear codes", "مسح الرموز")}</button></Panel>}
    {staff && <>
      <p className="my-3">{lang === "ar" ? staff.fullNameAr : staff.fullNameEn}</p>
      <p dir="ltr" className="break-all text-sm">{staff.email}</p>
      <div className="my-5 flex flex-wrap gap-2"><button type="button" disabled={loading} onClick={() => void logout()} className={btnClass("outline", "sm")}>{pick(lang, "Sign out", "تسجيل الخروج")}</button>
        <button type="button" disabled={loading} onClick={() => void load()} className={btnClass("outline", "sm")}>{pick(lang, "Refresh access", "تحديث صلاحية الدخول")}</button></div>
      <p className="mb-5 text-sm">{pick(lang, "Only identity services are enabled in this preview. Flight, booking and website administration remain separate mock services.", "خدمات الهوية وحدها مفعلة في هذه المعاينة. تبقى إدارة الرحلات والحجوزات والموقع خدمات تجريبية منفصلة.")}</p>
      {!loading && <div key={staff.id} className="max-w-3xl space-y-5">
        <Panel><h2 className="mb-4 text-lg font-semibold">{pick(lang, "Confirm a sensitive action", "تأكيد إجراء حساس")}</h2>
          <button type="button" className={btnClass("outline", "sm")} onClick={() => setRecovery(!recovery)}>{recovery ? pick(lang, "Use authenticator", "استخدام تطبيق المصادقة") : pick(lang, "Use recovery code", "استخدام رمز الاسترداد")}</button>
          <div className="mt-4"><IdentityForm key={String(recovery)} fields={[credentialField]} submit={async (v) => {
            const result = await getIdentityUiClient().postStaffStepUp(recovery ? { recoveryCode: v["recoveryCode"]! } : { totpCode: v["totpCode"]! });
            setStepUpUntil(result.data.expiresAt);
          }} /></div>
          {stepUpUntil && <p role="status" className="mt-3">{pick(lang, "Recent verification confirmed. The server checks it again for each sensitive action.", "تم تأكيد التحقق الحديث. يعيد الخادم فحصه لكل إجراء حساس.")}</p>}
        </Panel>
        <Panel><h2 className="mb-4 text-lg font-semibold">{pick(lang, "Change password", "تغيير كلمة المرور")}</h2>
          <IdentityForm fields={[{ ...passwordField, name: "currentPassword", en: "Current password", ar: "كلمة المرور الحالية" },
            { ...passwordField, name: "newPassword", en: "New password", ar: "كلمة المرور الجديدة" }]}
            submit={async (v) => { await getIdentityUiClient().putStaffPassword({ currentPassword: v["currentPassword"]!, newPassword: v["newPassword"]! }); credentialsChanged(); }}
            notice={pick(lang, "Recent verification is required. Use 12–128 characters. All staff sessions will be revoked.", "يلزم تحقق حديث. استخدم ١٢–١٢٨ محرفاً. تُلغى جميع جلسات الموظف.")} />
        </Panel>
        <Panel><h2 className="mb-4 text-lg font-semibold">{pick(lang, "Authenticator and recovery", "المصادقة والاسترداد")}</h2>
          <IdentityForm fields={[]} button={pick(lang, "Replace authenticator", "استبدال تطبيق المصادقة")} submit={async () => {
            const result = await getIdentityUiClient().postStaffMfaSetup(); setSecret(result.data.secret);
          }} notice={pick(lang, "Requires recent verification. Your current authenticator stays valid until confirmation.", "يتطلب تحققاً حديثاً. يبقى تطبيق المصادقة الحالي صالحاً حتى التأكيد.")} />
          {secret && <div className="my-5"><p dir="ltr" className="mb-4 break-all font-mono">{secret}</p>
            <IdentityForm fields={[{ name: "totpCode", en: "New authenticator code", ar: "رمز تطبيق المصادقة الجديد" }]} submit={async (v) => {
              const result = await getIdentityUiClient().postStaffMfaSetupConfirm({ totpCode: v["totpCode"]! }); setCodes(result.data.recoveryCodes); credentialsChanged();
            }} notice={pick(lang, "Confirmation revokes all staff sessions. Keep the new recovery codes privately.", "يلغي التأكيد جميع جلسات الموظف. احفظ رموز الاسترداد الجديدة بشكل خاص.")} /></div>}
          <div className="mt-5"><IdentityForm fields={[]} button={pick(lang, "Regenerate recovery codes", "إعادة إنشاء رموز الاسترداد")} submit={async () => {
            const result = await getIdentityUiClient().postStaffMfaRecoveryCodesRegenerate(); setCodes(result.data.recoveryCodes);
          }} notice={pick(lang, "Requires recent verification. Previous recovery codes become invalid.", "يتطلب تحققاً حديثاً. تصبح رموز الاسترداد السابقة غير صالحة.")} /></div>
        </Panel>
        <Panel><h2 className="mb-4 text-lg font-semibold">{pick(lang, "Active sessions", "الجلسات النشطة")}</h2>
          {sessions.map((session) => <div key={session.id} className="mb-4 border-b border-border pb-4">
            <p dir="ltr" className="break-all text-xs">{session.id}</p><p className="my-2 text-sm">{session.isCurrent ? pick(lang, "Current session", "الجلسة الحالية") : pick(lang, "Other session", "جلسة أخرى")}</p>
            <IdentityForm fields={[]} button={pick(lang, "Revoke session", "إلغاء الجلسة")} submit={async () => { await getIdentityUiClient().deleteStaffSession(session.id); await load(); }} /></div>)}
        </Panel>
        {staff.permissions.includes("admin.manage") ? <>
          <Panel><h2 className="mb-4 text-lg font-semibold">{pick(lang, "Invite staff", "دعوة موظف")}</h2>
            <IdentityForm fields={[{ name: "username", en: "Username", ar: "اسم المستخدم" }, emailField, ...names, roleField]}
              submit={async (v) => { await getIdentityUiClient().postStaffUserInvite({ username: v["username"]!, email: v["email"]!, fullNameEn: v["fullNameEn"]!, fullNameAr: v["fullNameAr"]!, role: role(v["role"]!) }); await load(); }}
              notice={pick(lang, "Requires recent verification. An invitation is queued to the staff email; delivery is not confirmed here.", "يتطلب تحققاً حديثاً. تُضاف دعوة إلى قائمة الإرسال لبريد الموظف؛ لا يؤكد هذا العرض وصولها.")} />
          </Panel>
          {directory.map((person) => <Panel key={person.id}>
            <p dir="ltr" className="mb-4 break-all text-sm">{person.email}</p>
            <IdentityForm fields={[...names.map((field) => ({ ...field, initial: person[field.name as "fullNameEn" | "fullNameAr"] })), { ...roleField, initial: person.role }]}
              submit={async (v) => { await getIdentityUiClient().patchStaffUser(person.id, { fullNameEn: v["fullNameEn"]!, fullNameAr: v["fullNameAr"]!, role: role(v["role"]!) }); await load(); }}
              notice={pick(lang, "Requires recent verification. The server protects the last eligible administrator.", "يتطلب تحققاً حديثاً. يحمي الخادم آخر مسؤول مؤهل.")} />
            <div className="mt-4 flex flex-wrap gap-4">
              <IdentityForm fields={[]} button={person.isActive ? pick(lang, "Suspend access", "تعليق الدخول") : pick(lang, "Reactivate access", "إعادة تفعيل الدخول")}
                submit={async () => { await getIdentityUiClient().patchStaffUser(person.id, { isActive: !person.isActive }); await load(); }} />
              <IdentityForm fields={[]} button={pick(lang, "Deactivate staff", "إلغاء تفعيل الموظف")}
                submit={async () => { await getIdentityUiClient().deleteStaffUser(person.id); await load(); }} />
              <IdentityForm fields={[]} button={pick(lang, "Reissue invitation", "إعادة إصدار الدعوة")}
                submit={async () => { await getIdentityUiClient().postStaffUserInviteReissue(person.id); await load(); }} />
              <IdentityForm fields={[]} button={pick(lang, "Revoke invitation", "إلغاء الدعوة")}
                submit={async () => { await getIdentityUiClient().postStaffUserInviteRevoke(person.id); await load(); }} />
            </div>
          </Panel>)}
        </> : <Panel><p>{pick(lang, "Staff directory access is not authorized for this account.", "دخول دليل الموظفين غير مصرح به لهذا الحساب.")}</p></Panel>}
      </div>}
    </>}
  </Container>;
}
