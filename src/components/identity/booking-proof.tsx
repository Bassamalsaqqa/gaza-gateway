import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { identityCopy as pick } from "@/lib/api/identity-ui-copy";
import { getIdentityUiClient } from "@/lib/api/identity-ui-runtime";
import { btnClass } from "@/components/kit";
import { IdentityForm } from "./identity-forms";

/** Out-of-band proof preview only; no booking creation, inventory or local ownership authority. */
export function BookingIdentityProof({ mode }: { mode: "guest" | "claim" }) {
  const { lang } = useI18n();
  const [challenge, setChallenge] = useState<{ ref: string; id: string; expires: string } | null>(null);
  const [proof, setProof] = useState<{ ref: string; token: string; expires: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    const expires = proof?.expires ?? challenge?.expires;
    if (!expires) return;
    const clear = () => { setChallenge(null); setProof(null); };
    const hidden = () => { if (document.visibilityState === "hidden") clear(); };
    const timer = setTimeout(clear, Math.max(0, Date.parse(expires) - Date.now()));
    document.addEventListener("visibilitychange", hidden);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", hidden); };
  }, [proof, challenge]);
  return <div className="space-y-4">
    <h2 className="text-lg font-semibold">{mode === "claim" ? pick(lang, "Claim booking ownership", "إثبات ملكية الحجز") : pick(lang, "Verify guest booking access", "التحقق من دخول الضيف إلى الحجز")}</h2>
    <p className="text-sm">{pick(lang, "Codes are sent only to the stored booking contact when details match. Booking management is not enabled in this preview.", "تُرسل الرموز إلى جهة اتصال الحجز المحفوظة فقط عند تطابق البيانات. إدارة الحجز غير مفعلة في هذه المعاينة.")}</p>
    {!challenge && !proof && <IdentityForm fields={[{ name: "ref", en: "Booking reference", ar: "مرجع الحجز" }, { name: "surname", en: "Surname", ar: "اسم العائلة" }]}
      button={pick(lang, "Request verification", "طلب التحقق")} submit={async (v) => {
        const ref = v["ref"]!; const api = getIdentityUiClient();
        const response = mode === "guest" ? await api.postCreateGuestChallenge(ref, { surname: v["surname"]! }) : await api.postCreateClaimChallenge({ ref, surname: v["surname"]! });
        setConfirmed(false); setChallenge({ ref, id: response.data.challengeId, expires: response.data.expiresAt });
      }} />}
    {challenge && !proof && <><p dir="ltr" className="text-sm">{challenge.ref}</p>
      <IdentityForm key={challenge.id} fields={[{ name: "code", en: "Six-digit verification code", ar: "رمز التحقق المكوّن من ستة أرقام" }]}
        submit={async (v) => {
          const api = getIdentityUiClient();
          if (mode === "claim") {
            const response = await api.postVerifyClaimChallenge({ challengeId: challenge.id, code: v["code"]! });
            setProof({ ref: challenge.ref, token: response.data.claimProof, expires: response.data.expiresAt });
          } else {
            // Do not persist, expose or pretend to use grants for unimplemented management operations.
            await api.postVerifyGuestChallenge(challenge.ref, { challengeId: challenge.id, code: v["code"]! });
            setChallenge(null); setConfirmed(true);
          }
        }} button={pick(lang, "Verify code", "التحقق من الرمز")} /></>}
    {proof && <IdentityForm fields={[]} button={pick(lang, "Confirm ownership claim", "تأكيد إثبات الملكية")} submit={async () => {
      try { await getIdentityUiClient().postClaimBookingToAccount({ ref: proof.ref, claimProof: proof.token }); setConfirmed(true); }
      finally { setProof(null); setChallenge(null); }
    }} notice={pick(lang, "This single-use proof expires after five minutes and is bound to your current account session.", "ينتهي هذا الإثبات أحادي الاستخدام بعد خمس دقائق ويرتبط بجلسة حسابك الحالية.")} />}
    {confirmed && <p role="status">{mode === "claim" ? pick(lang, "Ownership claim confirmed by the server.", "أكد الخادم إثبات الملكية.") : pick(lang, "Guest access verified. Booking management remains unavailable.", "تم التحقق من دخول الضيف. تبقى إدارة الحجز غير متاحة.")}</p>}
    {(challenge || proof || confirmed) && <button type="button" className={btnClass("outline", "sm")} onClick={() => { setChallenge(null); setProof(null); setConfirmed(false); }}>{pick(lang, "Clear and restart", "المسح والبدء مجدداً")}</button>}
  </div>;
}
