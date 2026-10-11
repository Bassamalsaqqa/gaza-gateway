import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLink } from "@/components/app-link";
import { Code, Field, Input, Panel, btnClass } from "@/components/kit";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useI18n, pick } from "@/lib/i18n";
import { useAdmin } from "@/lib/admin-store";
import { reservationClient, useReservationDetail } from "@/lib/reservations/queries";
import type { ReservationDetail } from "@/lib/reservations/client";

export function ReservationList({ staff = false }: { staff?: boolean }) {
  const { lang } = useI18n(); const ar = lang === "ar";
  const [page, setPage] = useState(1); const [search, setSearch] = useState(""); const [submitted, setSubmitted] = useState("");
  const query = useQuery({ queryKey: ["mvp", "reservations", staff ? "staff" : "passenger", "list", page, submitted], retry: false,
    queryFn: () => staff ? reservationClient.listAdmin(page, submitted) : reservationClient.list(page) });
  const prefix = staff ? "/admin/bookings" : "/account/trips";
  return <section className="space-y-5">
    <h1 className="type-title-section">{ar ? (staff ? "الحجوزات" : "حجوزاتي") : (staff ? "Bookings" : "My bookings")}</h1>
    {staff && <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); setSubmitted(search); setPage(1); }}>
      <Field label={ar ? "البحث بالمرجع أو البريد" : "Search reference or email"}><Input value={search} maxLength={100} onChange={e => setSearch(e.target.value)} /></Field>
      <button className={btnClass("outline", "md")}>{ar ? "بحث" : "Search"}</button>
    </form>}
    {query.isPending && <p role="status">{ar ? "جارٍ تحميل الحجوزات…" : "Loading bookings…"}</p>}
    {query.isError && <div role="alert"><p>{ar ? "تعذر تحميل الحجوزات. تحقق من جلستك وحاول مجدداً." : "Bookings could not be loaded. Check your session and retry."}</p>
      <button className={btnClass("outline", "sm")} onClick={() => void query.refetch()}>{ar ? "إعادة المحاولة" : "Retry"}</button></div>}
    {!query.isError && !query.isPending && query.data && <>
      <p className="text-sm text-muted-foreground">{ar ? "إجمالي الحجوزات" : "Total bookings"}: <bdi dir="ltr">{query.data.pagination.total}</bdi></p>
      {query.data.items.length === 0 && <p>{ar ? "لا توجد حجوزات." : "No bookings found."}</p>}
      <ul className="space-y-3">{query.data.items.map(item => <li key={item.id}><Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><Code>{item.reference}</Code><p className="mt-2"><Code>{item.flightNumber} · {item.originCode} → {item.destinationCode} · {item.date}</Code></p>
            <p className="mt-2 text-sm">{item.status === "cancelled" ? (ar ? "ملغى" : "Cancelled") : (ar ? "مؤكد" : "Confirmed")} · {ar ? "المسافرون" : "Passengers"}: {item.passengerCount}</p></div>
          <AppLink to={`${prefix}/$ref`} params={{ ref: item.reference }} className={btnClass("outline", "sm")}>{ar ? "عرض الحجز" : "View booking"}</AppLink>
        </div>
      </Panel></li>)}</ul>
      {query.data.pagination.totalPages > 1 && <nav className="flex items-center gap-4" aria-label={ar ? "صفحات الحجوزات" : "Booking pages"}>
        <button className={btnClass("outline", "sm")} disabled={page === 1} onClick={() => setPage(value => value - 1)}>{ar ? "السابق" : "Previous"}</button>
        <bdi dir="ltr">{page} / {query.data.pagination.totalPages}</bdi>
        <button className={btnClass("outline", "sm")} disabled={page >= query.data.pagination.totalPages} onClick={() => setPage(value => value + 1)}>{ar ? "التالي" : "Next"}</button>
      </nav>}
    </>}
    {!staff && <AppLink to="/book" className={btnClass("primary", "md")}>{ar ? "حجز رحلة" : "Book a flight"}</AppLink>}
  </section>;
}

export function ReservationView({ reference, staff = false }: { reference: string; staff?: boolean }) {
  const { lang } = useI18n(); const ar = lang === "ar"; const { can } = useAdmin(); const cache = useQueryClient();
  const query = useReservationDetail(reference, staff);
  const [open, setOpen] = useState(false); const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  const cancel = async () => {
    if (pending) return; setPending(true); setError(null);
    try { await reservationClient.cancel(reference, staff); setOpen(false); await cache.invalidateQueries({ queryKey: ["mvp", "reservations"] }); }
    catch { setError(ar ? "لم يتم تأكيد الإلغاء. حاول مجدداً أو حدّث الحجز." : "Cancellation was not confirmed. Retry or refresh the booking."); }
    finally { setPending(false); }
  };
  return <section className="space-y-5">
    <AppLink to={staff ? "/admin/bookings" : "/account/trips"} className={btnClass("outline", "sm", "print:hidden")}>{ar ? "العودة إلى الحجوزات" : "Back to bookings"}</AppLink>
    {query.isPending && <p role="status">{ar ? "جارٍ تحميل الحجز…" : "Loading booking…"}</p>}
    {query.isError && <div role="alert"><p>{ar ? "تعذر عرض الحجز. تحقق من المرجع وجلستك." : "Booking unavailable. Check the reference and your session."}</p>
      <button className={btnClass("outline", "sm")} onClick={() => void query.refetch()}>{ar ? "إعادة المحاولة" : "Retry"}</button></div>}
    {!query.isError && query.data && <>
      <ConfirmedReservationTicket data={query.data} />
      <div className="flex flex-wrap gap-3 print:hidden">
        <button className={btnClass("primary", "md")} onClick={() => window.print()}>{ar ? "طباعة / حفظ PDF" : "Print / save PDF"}</button>
        {query.data.reservation.status === "confirmed" && (!staff || can("commercial.edit")) &&
          <button className={btnClass("outline", "md")} onClick={() => { setError(null); setOpen(true); }}>{ar ? "إلغاء الحجز" : "Cancel booking"}</button>}
      </div>
      <p className="text-sm text-muted-foreground print:hidden">{ar ? "التذكرة متاحة الآن. حالة إرسال البريد غير متاحة بعد." : "Your ticket is available now. Email delivery status is not available yet."}</p>
    </>}
    <ConfirmDialog open={open} title={ar ? "إلغاء الحجز؟" : "Cancel booking?"} body={ar ? "سيتم تحرير المقاعد وإبقاء سجل الحجز الملغى." : "Seats will be released and the cancelled booking will remain in your history."}
      confirmLabel={ar ? "إلغاء الحجز" : "Cancel booking"} onConfirm={() => void cancel()} onClose={() => setOpen(false)} pending={pending} error={error} preserveOpenOnConfirm />
  </section>;
}

export function ConfirmedReservationTicket({ data }: { data: ReservationDetail }) {
  const { lang } = useI18n(); const ar = lang === "ar"; const { reservation, ticket } = data;
  return <div id="mvp-reservation-ticket" className="space-y-5">
    <style>{"@media print { body * { visibility:hidden } #mvp-reservation-ticket, #mvp-reservation-ticket * { visibility:visible } #mvp-reservation-ticket { position:absolute; inset:0; padding:16px; } #mvp-reservation-ticket article { break-inside:avoid; } }"}</style>
    {ticket.tickets.map(item => <article key={item.ticketNumber} className="overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-brand px-6 py-5 text-primary-foreground">
        <div><p className="font-display text-xl font-bold">{ar ? "مطار غزة الدولي" : "Gaza International Airport"}</p><p className="mt-1 text-sm">{ar ? "تذكرة الحجز" : "Booking ticket"}</p></div>
        <div><Code>{reservation.reference}</Code><p className="mt-1 text-sm">{reservation.status === "confirmed" ? (ar ? "مؤكد" : "Confirmed") : (ar ? "ملغى" : "Cancelled")}</p></div>
      </header>
      <div className="grid gap-5 p-6 sm:grid-cols-2">
        <div><p className="text-sm text-muted-foreground">{ar ? "المسافر" : "Passenger"}</p><h2 className="mt-1 text-xl font-semibold">{item.passenger.firstName} {item.passenger.lastName}</h2>
          <p className="mt-2 text-sm">{ar ? "الجنسية" : "Nationality"}: {item.passenger.nationality}</p></div>
        <div><p className="text-sm text-muted-foreground">{ar ? "الرحلة" : "Flight"}</p><Code>{ticket.flight.flightNumber} · {ticket.flight.originCode} → {ticket.flight.destinationCode}</Code>
          <p className="mt-2"><Code>{ticket.flight.date} · {ticket.flight.departTime} → {ticket.flight.arriveTime}</Code></p></div>
        <div><p className="text-sm text-muted-foreground">{ar ? "المقعد" : "Seat"}</p><p className="mt-1 font-display text-3xl"><bdi dir="ltr">{item.passenger.seatCode}</bdi></p>
          <p className="mt-2 text-sm">{ar ? "الوجبة" : "Meal"}: {item.passenger.meal ? pick(lang, item.passenger.meal.label) : (ar ? "بدون وجبة" : "No meal")}</p></div>
        <div><p className="text-sm text-muted-foreground">{ar ? "الطائرة" : "Aircraft"}</p><p>{ticket.flight.aircraftModel}</p><p className="mt-3 text-sm text-muted-foreground">{ar ? "رقم التذكرة" : "Ticket number"}</p><Code>{item.ticketNumber}</Code></div>
      </div>
    </article>)}
  </div>;
}
