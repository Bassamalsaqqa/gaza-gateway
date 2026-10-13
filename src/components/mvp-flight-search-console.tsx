import { useId, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowRightLeft, Search } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { AirportCombobox } from "@/components/airport-combobox";
import { Code, Field, Input, btnClass } from "@/components/kit";
import { GZA, todayISO, type Airport } from "@/lib/data";
import { useI18n, pick } from "@/lib/i18n";
import { useNetworkQuery } from "@/lib/network";
import { useOfferingsQuery } from "@/lib/offerings/queries";
import ticketWorldMapImg from "@/assets/media/decorative/cards/ticket-world-map.webp";

/** Approved ticket console; searches only server-published free, single-passenger offerings. */
export function MvpFlightSearchConsole() {
  const { lang, t } = useI18n();
  const ar = lang === "ar";
  const id = useId();
  const network = useNetworkQuery();
  const airports = useMemo<Airport[]>(() => (network.data ?? []).filter((item) => item.active).map((item) => ({
    code: item.code, city: item.city, country: item.country, name: item.airportName, tz: item.timezone,
  })), [network.data]);
  const [destination, setDestination] = useState("AMM");
  const [date, setDate] = useState(todayISO);
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [search, setSearch] = useState<{ date: string; direction: "out" | "in"; destination: string } | null>(null);
  const offerings = useOfferingsQuery(search?.date ?? "", search?.direction ?? "out");
  const selected = airports.some((item) => item.code === destination) ? destination : airports[0]?.code ?? "";
  const results = (offerings.data ?? []).filter((item) => (item.direction === "out" ? item.destinationCode : item.originCode) === search?.destination);
  const changeDestination = (code: string) => { setDestination(code); setSearch(null); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || network.isError || !date || date < todayISO()) return;
    setSearch({date, direction, destination: selected});
  };
  const Arrow = ar ? ArrowLeft : ArrowRight;
  return <section aria-label={ar ? "البحث عن رحلة تذكارية" : "Find a commemorative flight"} className="space-y-5">
    <form onSubmit={submit} data-flight-search-console="home" data-testid="home-flight-search-ticket"
      className="relative overflow-hidden rounded-2xl border border-clay/40 shadow-[var(--shadow-lift)]">
      <div className="pointer-events-none absolute inset-0 bg-clay" aria-hidden="true"><img src={ticketWorldMapImg} alt="" loading="lazy" className="size-full select-none object-cover object-center" data-decorative-asset="home-flight-search-ticket" /></div>
      <div className="relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <p className="text-sm font-semibold text-white">{ar ? "رحلة تذكارية مجانية" : "Free commemorative journey"}</p>
          <p className="text-sm font-medium text-white">{ar ? "اتجاه واحد · مسافر واحد" : "One way · one passenger"}</p>
        </div>
        <div className="mx-2 mb-2 overflow-hidden rounded-xl border border-border/40 bg-card sm:mx-5 sm:mb-5" data-flight-search-console="home-inner">
          <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
            <div className="flex min-w-0 items-center gap-2 p-4 sm:gap-3 sm:p-5">
              <div className="min-w-0 flex-1"><AirportCombobox value={direction === "out" ? "GZA" : selected} airports={direction === "out" ? [GZA] : airports}
                onChange={changeDestination} disabled={direction === "out" || network.isPending || network.isError} label={t("search.from")} ariaLabel={t("search.from")} variant="console" /></div>
              <button type="button" aria-label={ar ? "عكس اتجاه الرحلة" : "Reverse journey direction"} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-brand-deep hover:bg-sand-deep focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => {setDirection(direction === "out" ? "in" : "out"); setSearch(null);}}><ArrowRightLeft className="size-4" aria-hidden="true" /></button>
              <div className="min-w-0 flex-1"><AirportCombobox value={direction === "in" ? "GZA" : selected} airports={direction === "in" ? [GZA] : airports}
                onChange={changeDestination} disabled={direction === "in" || network.isPending || network.isError} label={t("search.to")} ariaLabel={t("search.to")} variant="console" /></div>
            </div>
            <div className="border-t border-border/60 p-4 sm:p-5 md:border-t-0 md:border-s"><Field htmlFor={`${id}-date`} label={ar ? "تاريخ المغادرة" : "Departure date"}>
              <Input id={`${id}-date`} type="date" dir="ltr" required min={todayISO()} value={date} onChange={(event) => {setDate(event.target.value); setSearch(null);}} className="min-h-11" />
            </Field></div>
            <div className="border-t border-border/60 p-4 sm:p-5 md:col-span-2 xl:col-span-1 xl:border-t-0 xl:border-s xl:self-stretch">
              <button type="submit" disabled={!selected || network.isError || network.isPending} className={btnClass("primary","md","min-h-12 w-full xl:h-full")}>
                <Search className="size-4" aria-hidden="true" />{ar ? "ابحث عن رحلة" : "Find a flight"}<Arrow className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
    {network.isError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><span>{ar ? "تعذر تحميل الوجهات." : "Destinations could not be loaded."}</span><button type="button" className={btnClass("outline","sm")} onClick={() => void network.refetch()}>{ar ? "إعادة المحاولة" : "Try again"}</button></div>}
    {search && <div aria-live="polite" aria-atomic="false" className="space-y-3">
      {offerings.isPending ? <p role="status" className="text-sm text-muted-foreground">{ar ? "جارٍ البحث في المواعيد المنشورة…" : "Searching published dates…"}</p>
        : offerings.isError ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><span>{ar ? "تعذر تحميل الرحلات." : "Flights could not be loaded."}</span><button type="button" className={btnClass("outline","sm")} onClick={() => void offerings.refetch()}>{ar ? "إعادة المحاولة" : "Try again"}</button></div>
        : results.length === 0 ? <p role="status" className="rounded-xl bg-sand p-4 text-sm">{ar ? "لا توجد رحلة منشورة لهذه الوجهة في التاريخ المختار. جرّب تاريخاً آخر." : "No flight is published for this route on your chosen date. Try another date."}</p>
        : <ul className="divide-y divide-border rounded-xl border border-border bg-card">{results.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
          <div className="min-w-36 flex-1"><Code>{item.number}</Code><p className="mt-1 font-semibold">{pick(lang, airports.find((airport) => airport.code === search.destination)?.city ?? {en:search.destination,ar:search.destination})}</p><Code>{item.originCode} → {item.destinationCode}</Code></div>
          <div><Code>{item.departTime} → {item.arrivalDate && item.arrivalDate !== item.date ? `${item.arrivalDate} · ` : ""}{item.arriveTime}</Code><p className="mt-1 text-sm text-muted-foreground">{ar ? "الأوقات محلية لكل مطار" : "Times local to each airport"} · {item.aircraft}</p></div>
          <AppLink to="/book" search={{offering:item.id}} className={btnClass("primary","sm")}>{ar ? "احجز مجاناً" : "Book free"}</AppLink>
        </li>)}</ul>}
    </div>}
  </section>;
}
