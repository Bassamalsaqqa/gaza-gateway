import { AppLink } from "@/components/app-link";
import { useState } from "react";
import { useI18n, pick } from "@/lib/i18n";
import { useOfferingsQuery } from "@/lib/offerings/queries";
import { useNetworkQuery } from "@/lib/network/queries";
import { todayISO } from "@/lib/data";
import { Field, Input, Select, Code, btnClass } from "@/components/kit";
import { NetworkReadState } from "@/components/network-read-state";

/** Curated reference data; no operational status, fictional gates or estimated occupancy. */
export function MvpOfferingBoard() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [date, setDate] = useState(todayISO);
  const [direction, setDirection] = useState<"out" | "in">("out");
  const offerings = useOfferingsQuery(date, direction);
  const network = useNetworkQuery();
  return <section className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-5" aria-label={ar ? "الرحلات التذكارية" : "Commemorative flights"}>
    <div><h2 className="type-title-section">{ar ? "الرحلات التذكارية" : "Commemorative flights"}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{ar ? "مواعيد يختارها فريق الموقع ضمن مشروع مطار غزة التذكاري." : "Owner-curated dates for the Gaza Airport commemorative project."}</p></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={ar ? "التاريخ" : "Date"}><Input aria-label={ar ? "التاريخ" : "Date"} type="date" value={date} onChange={e => setDate(e.target.value)} dir="ltr" /></Field>
      <Field label={ar ? "الاتجاه" : "Direction"}><Select aria-label={ar ? "الاتجاه" : "Direction"} value={direction} onChange={e => setDirection(e.target.value as "out" | "in")}>
        <option value="out">{ar ? "من غزة" : "From Gaza"}</option><option value="in">{ar ? "إلى غزة" : "To Gaza"}</option>
      </Select></Field>
    </div>
    <NetworkReadState loading={offerings.isPending} error={offerings.isError} onRetry={() => void offerings.refetch()} />
    {!offerings.isError && !offerings.isPending && offerings.data?.length === 0 ? <p role="status" className="text-sm text-muted-foreground">{ar ? "لا توجد رحلات منشورة لهذا التاريخ." : "No published flights for this date."}</p> : null}
    {!offerings.isError && !offerings.isPending ? <ul className="space-y-3">{offerings.data?.map(item => {
      const code = item.direction === "out" ? item.destinationCode : item.originCode;
      const airport = !network.isError ? network.data?.find(airport => airport.code === code) : undefined;
      return <li key={item.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-4">
        <div className="min-w-36 flex-1"><Code>{item.number}</Code><p className="mt-1 font-semibold">{airport ? pick(lang, airport.city) : code}</p><Code>{item.originCode} → {item.destinationCode}</Code></div>
        <div><Code>{item.departTime} → {item.arriveTime}</Code><p className="mt-1 text-sm text-muted-foreground">{item.aircraft}</p></div>
        <AppLink to="/book" search={{ offering: item.id }} className={btnClass("primary", "sm")}>{ar ? "حجز مجاني" : "Book free"}</AppLink>
      </li>;
    })}</ul> : null}
  </section>;
}
