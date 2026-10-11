import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLink } from "@/components/app-link";
import { Container, Field, Input, Panel, Select, Code, btnClass } from "@/components/kit";
import { SeatMap } from "./seat-map";
import { ConfirmedReservationTicket } from "./mvp-reservation-views";
import { useI18n, pick } from "@/lib/i18n";
import { usePassengerAccount, usePassengerTravelers } from "@/lib/passenger";
import { useMealsQuery } from "@/lib/meals/queries";
import { getMvpUiClient } from "@/lib/api/mvp-ui-runtime";
import { MvpApiError } from "@/lib/api/mvp-client";
import { offeringWireSchema } from "@/lib/offerings/schema";
import { decodeDatedOfferingId } from "@/lib/offerings/codec";
import { ReservationAttempt } from "@/lib/reservations/attempt";
import { reservationClient } from "@/lib/reservations/queries";
import type { ReservationCommand, ReservationDetail } from "@/lib/reservations/client";
import type { PassengerAccount } from "@/lib/passenger/domain";
import { MvpOfferingBoard } from "@/components/mvp-offering-board";

export function MvpFreeBooking({ offeringId }: { offeringId?: string | undefined }) {
  const { lang } = useI18n(); const ar = lang === "ar";
  const account = usePassengerAccount();
  return <Container className="space-y-6 py-10">
    <h1 className="type-title-page">{ar ? "حجز رحلة" : "Book a flight"}</h1>
    {account.isPending ? <p role="status">{ar ? "جارٍ التحقق من الحساب…" : "Checking your account…"}</p> : account.isError ?
      <div role="alert"><p>{ar ? "تعذر التحقق من الحساب." : "Your account could not be verified."}</p><button className={btnClass("outline", "sm")} onClick={() => void account.refetch()}>{ar ? "إعادة المحاولة" : "Retry"}</button></div> : !account.data ?
      <Panel><p>{ar ? "سجّل الدخول بحساب موثّق لإتمام الحجز." : "Sign in with a verified account to book."}</p><AppLink to="/signin" className={btnClass("primary", "md", "mt-4")}>{ar ? "تسجيل الدخول" : "Sign in"}</AppLink></Panel> :
      offeringId && decodeDatedOfferingId(offeringId) ? <BookingForm key={`${account.data.email}:${offeringId}`} account={account.data} offeringId={offeringId} /> : <MvpOfferingBoard />}
  </Container>;
}

type PassengerInput = ReservationCommand["passengers"][number];
const emptyPassenger = (index: number): PassengerInput => ({ id: `p${index}`, type: "adult", firstName: "", lastName: "", dob: "", nationality: "", document: "", seatCode: "", mealId: null });
function BookingForm({ account, offeringId }: { account: PassengerAccount; offeringId: string }) {
  const { lang } = useI18n(); const ar = lang === "ar";
  const cache = useQueryClient();
  const offering = useQuery({ queryKey: ["mvp", "offering", offeringId], retry: false, queryFn: async () => {
    const data = await getMvpUiClient().request({ method: "GET", path: `/offerings/${offeringId}`, realm: "public", schema: offeringWireSchema });
    if (data.id !== offeringId) throw new MvpApiError("protocol"); return data;
  } });
  const occupancy = useQuery({ queryKey: ["mvp", "occupancy", offeringId], retry: false, refetchOnWindowFocus: "always", queryFn: () => reservationClient.occupancy(offeringId) });
  const meals = useMealsQuery(); const travelers = usePassengerTravelers();
  const [passengers, setPassengers] = useState<PassengerInput[]>(() => [{ ...emptyPassenger(1), firstName: account.firstName, lastName: account.lastName }]);
  const nextId = useRef(2); const attempt = useRef(new ReservationAttempt());
  const [active, setActive] = useState(0); const [phone, setPhone] = useState(account.phone);
  const [pending, setPending] = useState(false); const [locked, setLocked] = useState(false); const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ReservationDetail | null>(null);
  const update = (index: number, patch: Partial<PassengerInput>) => { if (!locked && !pending) setPassengers(current => current.map((p, i) => i === index ? { ...p, ...patch } : p)); };
  const confirm = async () => {
    if (pending) return; setError(null);
    let command: ReservationCommand;
    try { command = attempt.current.prepare(account.email, { serviceId: offeringId, contact: { email: account.email, phone }, passengers }); }
    catch { setError(ar ? "تحقق من الأسماء وتواريخ الميلاد والوثائق والمقاعد. الأعمار: بالغ ١٢+، طفل ٢–١١." : "Check names, birth dates, documents and seats. Adult: 12+, child: 2–11."); return; }
    setPending(true); setLocked(true);
    try {
      setConfirmed(await reservationClient.create(command));
      void cache.invalidateQueries({ queryKey: ["mvp", "reservations"] });
    }
    catch (failure) {
      const status = failure instanceof MvpApiError ? failure.status : undefined;
      attempt.current.rejected(status); setLocked(attempt.current.locked);
      setError(status === 409 ? (ar ? "تغيّر المقعد أو بيانات الرحلة. تم تحديث المقاعد؛ اختر مقعداً متاحاً وحاول مجدداً." : "A seat or flight reference changed. Seats were refreshed; choose an available seat and retry.")
        : status === 401 || status === 403 ? (ar ? "تحقق من جلستك وصلاحية حسابك قبل إعادة المحاولة." : "Check your session and account access before retrying.")
        : status === 422 ? (ar ? "تعذر قبول بيانات المسافر أو الوجبة. راجع الحقول." : "Passenger or meal details were rejected. Review the fields.")
        : attempt.current.locked ? (ar ? "نتيجة التأكيد غير معروفة. أعد المحاولة بنفس الطلب أو تحقق من حجوزاتي؛ لا تبدأ حجزاً آخر." : "Confirmation outcome is unknown. Retry this same request or check My bookings; do not start another booking.")
        : (ar ? "لم يتم تأكيد الحجز. حاول مجدداً." : "Booking was not confirmed. Please retry."));
      if (status === 409) { void occupancy.refetch(); void offering.refetch(); void meals.refetch(); }
    } finally { setPending(false); }
  };
  if (confirmed) return <div className="space-y-5"><h2 className="type-title-section">{ar ? "تم تأكيد الحجز" : "Booking confirmed"}</h2>
    <ConfirmedReservationTicket data={confirmed} /><div className="flex flex-wrap gap-3"><button className={btnClass("primary", "md")} onClick={() => window.print()}>{ar ? "طباعة / حفظ PDF" : "Print / save PDF"}</button>
      <AppLink to="/account/trips/$ref" params={{ ref: confirmed.reservation.reference }} className={btnClass("outline", "md")}>{ar ? "إدارة الحجز" : "Manage booking"}</AppLink></div>
    <p>{ar ? "تم حفظ الحجز. حالة إرسال البريد غير متاحة بعد." : "Your booking is saved. Email delivery status is not available yet."}</p></div>;
  const unavailable = offering.isError || occupancy.isError || meals.isError;
  const loading = offering.isPending || occupancy.isPending || meals.isPending;
  return <div className="space-y-6">
    {locked && (loading || unavailable) && <div role="alert" className="space-y-3">
      <p>{error ?? (ar ? "تحقق من نتيجة الطلب السابق قبل بدء حجز آخر." : "Check the previous submission before starting another booking.")}</p>
      <button disabled={pending} className={btnClass("primary", "md")} onClick={() => void confirm()}>{ar ? "إعادة تأكيد نفس الطلب" : "Retry same confirmation"}</button>
      <AppLink to="/account/trips" className={btnClass("outline", "md", "ms-3")}>{ar ? "حجوزاتي" : "My bookings"}</AppLink>
    </div>}
    {loading && <p role="status">{ar ? "جارٍ تحميل الرحلة والمقاعد…" : "Loading flight and seats…"}</p>}
    {unavailable && <div role="alert"><p>{ar ? "تعذر تحميل بيانات الحجز. لا يمكن تأكيد الحجز الآن." : "Booking data is unavailable. Confirmation is disabled."}</p>
      <button className={btnClass("outline", "sm")} onClick={() => { void offering.refetch(); void occupancy.refetch(); void meals.refetch(); }}>{ar ? "إعادة المحاولة" : "Retry"}</button></div>}
    {!loading && !unavailable && offering.data && occupancy.data && meals.data && <>
      <Panel><Code>{offering.data.number} · {offering.data.originCode} → {offering.data.destinationCode} · {offering.data.date} · {offering.data.departTime}</Code>
        <p className="mt-2 text-sm text-muted-foreground">{ar ? "حجز تذكاري مجاني باتجاه واحد. يتم تأكيد المقاعد عند الإرسال." : "Free one-way commemorative booking. Seats are confirmed on submission."}</p></Panel>
      <form className="space-y-6" onSubmit={event => { event.preventDefault(); void confirm(); }}>
        <fieldset disabled={locked || pending} className="space-y-5">
          <legend className="mb-3 text-xl font-semibold">{ar ? "المسافرون" : "Passengers"}</legend>
          {passengers.map((person, index) => <Panel key={person.id}>
            <h3 className="mb-4 font-semibold">{ar ? "المسافر" : "Passenger"} {index + 1}</h3>
            {!!travelers.data?.length && <Field label={ar ? "استخدام مسافر محفوظ" : "Use saved traveler"}><Select value="" onChange={event => {
              const traveler = travelers.data?.find(item => item.id === event.target.value);
              if (traveler) update(index, { firstName: traveler.firstName, lastName: traveler.lastName, dob: traveler.dob, nationality: traveler.nationality, document: traveler.document });
            }}><option value="">{ar ? "اختر مسافراً" : "Choose traveler"}</option>{travelers.data.map(item => <option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>)}</Select></Field>}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={ar ? "الاسم الأول" : "First name"}><Input autoComplete="given-name" value={person.firstName} maxLength={120} onChange={e => update(index, { firstName: e.target.value })} /></Field>
              <Field label={ar ? "اسم العائلة" : "Last name"}><Input autoComplete="family-name" value={person.lastName} maxLength={120} onChange={e => update(index, { lastName: e.target.value })} /></Field>
              <Field label={ar ? "تاريخ الميلاد" : "Date of birth"}><Input type="date" required value={person.dob} max={offering.data.date} dir="ltr" onChange={e => update(index, { dob: e.target.value })} /></Field>
              <Field label={ar ? "الفئة العمرية" : "Age category"}><Select value={person.type} onChange={e => update(index, { type: e.target.value as "adult" | "child" })}>
                <option value="adult">{ar ? "بالغ (١٢+)" : "Adult (12+)"}</option><option value="child">{ar ? "طفل (٢–١١)" : "Child (2–11)"}</option></Select></Field>
              <Field label={ar ? "الجنسية" : "Nationality"}><Input required value={person.nationality} maxLength={120} onChange={e => update(index, { nationality: e.target.value })} /></Field>
              <Field label={ar ? "وثيقة السفر" : "Travel document"}><Input required value={person.document} maxLength={120} onChange={e => update(index, { document: e.target.value })} /></Field>
              <Field label={ar ? "الوجبة" : "Meal"}><Select value={person.mealId ?? ""} onChange={e => update(index, { mealId: e.target.value || null })}>
                <option value="">{ar ? "بدون وجبة" : "No meal"}</option>{meals.data?.meals.map(item => <option key={item.id} value={item.id}>{pick(lang, item.label)}</option>)}</Select></Field>
            </div>
            {passengers.length > 1 && <button type="button" className={btnClass("ghost", "sm", "mt-3")} onClick={() => { setPassengers(current => current.filter((_, i) => i !== index)); setActive(0); }}>{ar ? "إزالة المسافر" : "Remove passenger"}</button>}
          </Panel>)}
          <button type="button" disabled={passengers.length >= 9} className={btnClass("outline", "sm")} onClick={() => setPassengers(current => [...current, emptyPassenger(nextId.current++)])}>{ar ? "إضافة مسافر" : "Add passenger"}</button>
          <Panel><h2 className="mb-4 text-xl font-semibold">{ar ? "اختيار المقاعد" : "Choose seats"}</h2>
            <SeatMap layout={occupancy.data.layout} occupiedSeats={new Set(occupancy.data.occupiedSeats)} extraLegroomPrice={0}
              assignments={Object.fromEntries(passengers.map((p, i) => [i, p.seatCode]).filter(([, value]) => value !== ""))}
              activePassenger={active} onActivePassengerChange={setActive} passengerLabels={passengers.map((p, i) => `${p.firstName} ${p.lastName}`.trim() || `${ar ? "المسافر" : "Passenger"} ${i + 1}`)}
              onSelect={(index, seatCode) => update(index, { seatCode })} />
          </Panel>
          <Panel><h2 className="mb-4 text-xl font-semibold">{ar ? "بيانات التواصل" : "Contact details"}</h2><p className="mb-4 break-all" dir="ltr">{account.email}</p>
            <Field label={ar ? "الهاتف (اختياري)" : "Phone (optional)"}><Input type="tel" dir="ltr" maxLength={32} value={phone} onChange={e => setPhone(e.target.value)} /></Field></Panel>
        </fieldset>
        {error && <p role="alert" tabIndex={-1} className="rounded-lg border border-clay p-4 text-clay">{error}</p>}
        <button type="submit" className={btnClass("primary", "lg")} disabled={pending}>{pending ? (ar ? "جارٍ التأكيد…" : "Confirming…") : locked ? (ar ? "إعادة تأكيد نفس الطلب" : "Retry same confirmation") : (ar ? "تأكيد الحجز المجاني" : "Confirm free booking")}</button>
        <AppLink to="/account/trips" className={btnClass("outline", "md", "ms-3")}>{ar ? "حجوزاتي" : "My bookings"}</AppLink>
      </form>
    </>}
  </div>;
}
