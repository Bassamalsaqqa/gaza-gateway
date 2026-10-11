import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLink, usePathname } from "@/components/app-link";
import { Container, Panel, btnClass } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { identityCopy as pick } from "@/lib/api/identity-ui-copy";
import { stripLocale } from "@/lib/locale";
import { passengerKeys } from "@/lib/passenger/keys";
import { discardIdentityUiClient, getIdentityUiClient } from "@/lib/api/identity-ui-runtime";
import type { PassengerProfileDto, PassengerSessionDto, TravelerDto } from "@/lib/api/identity-types";
import { IdentityForm } from "./identity-forms";
import { passwordField, identityErrorText, type IdentityField } from "@/lib/api/identity-ui-fields";
import { Outlet } from "@tanstack/react-router";
import { ReservationList } from "@/components/booking/mvp-reservation-views";

const nameFields: IdentityField[] = [{ name: "firstName", en: "First name", ar: "الاسم الأول", optional: true },
  { name: "lastName", en: "Last name", ar: "اسم العائلة", optional: true }];

/** Server-mode account boundary: no mock trips/boarding passes or local activity authority. */
export function PassengerIdentityWorkspace() {
  const { lang } = useI18n(); const query = useQueryClient(); const path = stripLocale(usePathname());
  const [profile, setProfile] = useState<PassengerProfileDto | null>(null);
  const [travelers, setTravelers] = useState<TravelerDto[]>([]); const [sessions, setSessions] = useState<PassengerSessionDto[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<unknown>(null);
  const generation = useRef(0);
  const clear = useCallback(() => { generation.current++; setProfile(null); setTravelers([]); setSessions([]); void query.cancelQueries({ queryKey: ["mvp", "reservations"] }); query.removeQueries({ queryKey: ["mvp", "reservations"] }); query.removeQueries({ queryKey: passengerKeys.all }); }, [query]);
  const load = useCallback(async (signal?: AbortSignal) => {
    const ticket = ++generation.current;
    setLoading(true); setError(null);
    try {
      const api = getIdentityUiClient(); const options = signal ? { signal } : undefined;
      const account = await api.getPassengerProfile(options);
      const [people, active] = await Promise.all([api.getSavedTravelers(options), api.getPassengerSessions(options)]);
      const confirm = await api.getPassengerProfile(options);
      if (account.data.email !== confirm.data.email) { throw new Error("Account context changed."); }
      if (signal?.aborted || ticket !== generation.current) return;
      await query.cancelQueries({ queryKey: ["mvp", "reservations"] });
      query.removeQueries({ queryKey: ["mvp", "reservations"] });
      query.removeQueries({ queryKey: passengerKeys.all });
      if (signal?.aborted || ticket !== generation.current) return;
      setProfile(confirm.data); setTravelers(people.data); setSessions(active.data.sessions);
    } catch (failure) { if (!signal?.aborted && ticket === generation.current) { setProfile(null); setTravelers([]); setSessions([]); setError(failure); } }
    finally { if (!signal?.aborted && ticket === generation.current) setLoading(false); }
  }, [query]);
  useEffect(() => {
    const abort = new AbortController(); void load(abort.signal);
    const focus = () => { void load(abort.signal); }; window.addEventListener("focus", focus);
    const scope = generation;
    return () => { scope.current++; abort.abort(); window.removeEventListener("focus", focus); };
  }, [load]);
  const logout = async () => {
    generation.current++;
    setLoading(true); setError(null);
    try { await getIdentityUiClient().postPassengerLogout(); clear(); discardIdentityUiClient(); }
    catch (failure) { clear(); setError(failure); }
    finally { setLoading(false); }
  };
  return <Container className="py-10">
    <h1 className="font-display text-3xl font-bold">{pick(lang, "Your account", "حسابك")}</h1>
    {error !== null && <p className="mt-4 text-clay" role="alert">{identityErrorText(error, lang)}</p>}
    {loading && <p className="mt-4" role="status">{pick(lang, "Verifying your session…", "جارٍ التحقق من جلستك…")}</p>}
    {!profile && !loading && <AppLink to="/signin" className={btnClass("primary", "md")}>{pick(lang, "Sign in", "تسجيل الدخول")}</AppLink>}
    {profile && <>
      <p dir="ltr" className="mt-3 break-all text-sm">{profile.email}</p>
      <div className="my-5 flex flex-wrap gap-2">
        {[["/account", "Overview", "نظرة عامة"], ["/account/profile", "Profile", "الملف الشخصي"],
          ["/account/trips", "My bookings", "حجوزاتي"], ["/account/travelers", "Saved travelers", "المسافرون المحفوظون"], ["/account/security", "Security", "الأمان"]].map(([to, en, ar]) =>
          <AppLink key={to} to={to!} className={btnClass("outline", "sm")}>{pick(lang, en!, ar!)}</AppLink>)}
        <button type="button" disabled={loading} className={btnClass("outline", "sm")} onClick={() => void logout()}>{pick(lang, "Sign out", "تسجيل الخروج")}</button>
        <button type="button" disabled={loading} className={btnClass("outline", "sm")} onClick={() => void load()}>{pick(lang, "Refresh session", "تحديث الجلسة")}</button>

      </div>
      <div className="max-w-3xl space-y-5" aria-busy={loading}>
        {loading ? null : path === "/account/trips" || path.startsWith("/account/trips/") ? <Outlet /> : path === "/account" || path === "/account/" ? <ReservationList /> : path === "/account/profile" || path === "/account/preferences" ? <Panel>
          <IdentityForm key={profile.email} fields={[...nameFields.map((field) => ({ ...field, initial: profile[field.name as "firstName" | "lastName"] })),
            { name: "phone", en: "Phone", ar: "الهاتف", optional: true, initial: profile.phone }]}
            submit={async (values) => { await getIdentityUiClient().putPassengerProfile({ firstName: values["firstName"]!, lastName: values["lastName"]!, phone: values["phone"]! }); await load(); }}
            button={pick(lang, "Save profile", "حفظ الملف الشخصي")} />
        </Panel> : path === "/account/travelers" ? <>
          <Panel><h2 className="mb-4 text-lg font-semibold">{pick(lang, "Add traveler", "إضافة مسافر")}</h2>
            <IdentityForm key={profile.email} fields={[...nameFields, { name: "dob", en: "Date of birth", ar: "تاريخ الميلاد", type: "date", optional: true },
              { name: "nationality", en: "Nationality", ar: "الجنسية", optional: true }, { name: "document", en: "Travel document", ar: "وثيقة السفر", optional: true }]}
              submit={async (v) => { await getIdentityUiClient().postSavedTraveler({ firstName: v["firstName"]!, lastName: v["lastName"]!, dob: v["dob"]!, nationality: v["nationality"]!, document: v["document"]! }); await load(); }}
              button={pick(lang, "Save traveler", "حفظ المسافر")} notice={pick(lang, "Enter at least one name.", "أدخل اسماً واحداً على الأقل.")} />
          </Panel>
          {travelers.map((traveler) => <Panel key={`${profile.email}-${traveler.id}`}>
            <IdentityForm fields={[...nameFields.map((field) => ({ ...field, initial: traveler[field.name as "firstName" | "lastName"] })),
              { name: "dob", en: "Date of birth", ar: "تاريخ الميلاد", type: "date", optional: true, initial: traveler.dob },
              { name: "nationality", en: "Nationality", ar: "الجنسية", optional: true, initial: traveler.nationality },
              { name: "document", en: "Travel document", ar: "وثيقة السفر", optional: true, initial: traveler.document }]}
              submit={async (v) => { await getIdentityUiClient().patchSavedTraveler(traveler.id, { firstName: v["firstName"]!, lastName: v["lastName"]!, dob: v["dob"]!, nationality: v["nationality"]!, document: v["document"]! }); await load(); }}
              button={pick(lang, "Update traveler", "تحديث المسافر")} />
            <div className="mt-4"><IdentityForm fields={[]} submit={async () => { await getIdentityUiClient().deleteSavedTraveler(traveler.id); await load(); }}
              button={pick(lang, "Remove traveler", "إزالة المسافر")} /></div>
          </Panel>)}
        </> : path === "/account/security" ? <>
          <Panel><h2 className="mb-4 text-lg font-semibold">{pick(lang, "Change password", "تغيير كلمة المرور")}</h2>
            <IdentityForm fields={[{ ...passwordField, name: "currentPassword", en: "Current password", ar: "كلمة المرور الحالية" },
              { ...passwordField, name: "newPassword", en: "New password", ar: "كلمة المرور الجديدة" }]}
              submit={async (v) => { await getIdentityUiClient().putPassengerPassword({ currentPassword: v["currentPassword"]!, newPassword: v["newPassword"]! }); clear(); discardIdentityUiClient(); }}
              notice={pick(lang, "Use 15–128 characters. You must sign in again after changing it.", "استخدم ١٥–١٢٨ محرفاً. يجب تسجيل الدخول مجدداً بعد التغيير.")} />
          </Panel>
          <Panel><h2 className="mb-4 text-lg font-semibold">{pick(lang, "Active sessions", "الجلسات النشطة")}</h2>
            {sessions.map((session) => <div key={session.id} className="mb-5 border-b border-border pb-4">
              <p dir="ltr" className="break-all text-xs">{session.id}</p>
              <p className="my-2 text-sm">{session.current ? pick(lang, "Current session", "الجلسة الحالية") : pick(lang, "Other session", "جلسة أخرى")}</p>
              <IdentityForm fields={[]} submit={async () => { await getIdentityUiClient().deletePassengerSession(session.id); await load(); }}
                button={pick(lang, "Revoke session", "إلغاء الجلسة")} />
            </div>)}
          </Panel>
        </> : <Panel><p>{pick(lang, "This operational account service is not enabled for commemorative bookings. Your booking tickets are available under My bookings.",
          "هذه الخدمة التشغيلية غير مفعلة للحجوزات التذكارية. تذاكرك متاحة ضمن حجوزاتي.")}</p></Panel>}
      </div>
    </>}
  </Container>;
}
