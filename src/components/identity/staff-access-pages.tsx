import { useEffect, useRef, useState } from "react";
import { AppLink } from "@/components/app-link";
import { PassengerAuthShell } from "@/components/passenger-auth-shell";
import { btnClass } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { useAdmin } from "@/lib/admin-store";
import { identityCopy as pick } from "@/lib/api/identity-ui-copy";
import { getIdentityUiClient } from "@/lib/api/identity-ui-runtime";
import { emailField, passwordField } from "@/lib/api/identity-ui-fields";
import { parseStaffAccessFragment } from "@/lib/api/staff-access-link";
import { IdentityForm } from "./identity-forms";

export function StaffAccessPage({ flow }: { flow: "forgot" | "reset" | "invite" }) {
  const { lang } = useI18n(); const [done, setDone] = useState(false);
  const { refreshStaff } = useAdmin();
  const proof = useRef<ReturnType<typeof parseStaffAccessFragment> | null>(null);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (flow === "forgot") { setReady(true); return; }
    const receive = () => {
      proof.current = parseStaffAccessFragment(window.location.hash);
      window.history.replaceState(window.history.state, "", window.location.pathname);
      setToken(proof.current.token); setReady(true); setDone(false);
    };
    // Preserve the first read during StrictMode's effect replay, but accept a
    // newly opened email link even when its path matches the current page.
    if (proof.current === null) receive();
    else { setToken(proof.current.token); setReady(true); }
    window.addEventListener("hashchange", receive);
    return () => window.removeEventListener("hashchange", receive);
  }, [flow]);
  const title = flow === "forgot" ? pick(lang,"Forgot your staff password?","نسيت كلمة مرور الموظف؟")
    : flow === "reset" ? pick(lang,"Reset your staff password","إعادة تعيين كلمة مرور الموظف")
      : pick(lang,"Accept your staff invitation","قبول دعوة الموظف");
  const description = flow === "forgot" ? pick(lang,"Enter the email address attached to your staff account.","أدخل البريد الإلكتروني المرتبط بحساب الموظف.")
    : pick(lang,"Choose a password of 12–128 characters. The link is used only when you submit this form.","اختر كلمة مرور من ١٢ إلى ١٢٨ محرفاً. لا يُستخدم الرابط إلا عند إرسال هذا النموذج.");
  const complete = () => { proof.current = {token:null,error:null}; setToken(null); setDone(true); };
  return <PassengerAuthShell title={title} description={description}>
    {!ready ? <p role="status">{pick(lang,"Checking the link…","جارٍ التحقق من الرابط…")}</p>
      : done ? <div className="space-y-4"><p role="status">{flow === "forgot"
        ? pick(lang,"If this email belongs to an eligible staff account, a password-reset link will be emailed. Check your inbox and spam folder.","إذا كان هذا البريد مرتبطاً بحساب موظف مؤهل، فسيُرسل رابط لإعادة تعيين كلمة المرور. تحقق من البريد الوارد ومجلد الرسائل غير المرغوب فيها.")
        : flow === "reset" ? pick(lang,"Your staff password has been changed. Sign in with your new password.","تم تغيير كلمة مرور الموظف. سجل الدخول بكلمة المرور الجديدة.")
          : pick(lang,"Your invitation has been accepted. Continue through staff sign-in to access Admin.","تم قبول دعوتك. تابع من صفحة دخول الموظفين للوصول إلى الإدارة.")}</p></div>
      : flow !== "forgot" && !token ? <div role="alert" className="space-y-3"><p>{pick(lang,"This link is missing or invalid. Open the complete link from your email.","هذا الرابط مفقود أو غير صالح. افتح الرابط الكامل من رسالة البريد الإلكتروني.")}</p>
        {flow === "reset" ? <AppLink to="/admin/forgot-password" className="text-brand underline underline-offset-4">{pick(lang,"Request a new reset link","طلب رابط استعادة جديد")}</AppLink>
          : <p>{pick(lang,"Ask your administrator to reissue an invitation if needed.","اطلب من المسؤول إعادة إرسال الدعوة عند الحاجة.")}</p>}</div>
      : <IdentityForm fields={flow === "forgot" ? [emailField] : [{...passwordField,autoComplete:"new-password"}]}
        button={flow === "forgot" ? pick(lang,"Send reset link","إرسال رابط الاستعادة") : flow === "reset" ? pick(lang,"Change password","تغيير كلمة المرور") : pick(lang,"Accept invitation","قبول الدعوة")}
        errorText={flow === "forgot" ? undefined : failure => {
          const status = typeof failure === "object" && failure !== null && "status" in failure ? failure.status : undefined;
          return status === 401 ? flow === "invite"
            ? pick(lang,"This invitation has expired, was already accepted or is no longer valid. Ask your administrator to reissue it if you cannot sign in.","انتهت صلاحية هذه الدعوة أو قُبلت بالفعل أو لم تعد صالحة. اطلب من المسؤول إعادة إرسالها إذا لم تتمكن من تسجيل الدخول.")
            : pick(lang,"This link has expired, was already used or is no longer valid. Request a new link.","انتهت صلاحية هذا الرابط أو استُخدم بالفعل أو لم يعد صالحاً. اطلب رابطاً جديداً.") : undefined;
        }}
        submit={async values => {
          const api=getIdentityUiClient();
          if(flow === "forgot") await api.postStaffPasswordForgot({email:values["email"]!.trim()});
          else {
            if(!token) throw new Error("Missing staff link.");
            if(flow === "reset") await api.postStaffPasswordReset({token,newPassword:values["password"]!});
            else await api.postStaffInvitationAccept({token,password:values["password"]!});
          }
          complete();
          if (flow !== "forgot") await refreshStaff();
        }} />}
    <div className="mt-5 flex flex-wrap items-center gap-4">
      <AppLink to="/admin/signin" className={btnClass("outline","md")}>{pick(lang,"Back to Admin sign-in","العودة إلى تسجيل دخول الإدارة")}</AppLink>
      {flow === "reset" && token && !done && <AppLink to="/admin/forgot-password" className="text-sm font-semibold text-brand underline underline-offset-4">{pick(lang,"Request a new reset link","طلب رابط استعادة جديد")}</AppLink>}
    </div>
  </PassengerAuthShell>;
}
