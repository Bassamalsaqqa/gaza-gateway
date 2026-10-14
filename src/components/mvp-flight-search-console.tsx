import { useId, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowRightLeft, Search } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { cn } from "@/lib/utils";
import { AirportCombobox } from "@/components/airport-combobox";
import { Code, Field, Input, btnClass } from "@/components/kit";
import { GZA, todayISO, type Airport } from "@/lib/data";
import { useI18n, pick } from "@/lib/i18n";
import { useNetworkQuery } from "@/lib/network";
import { useOfferingsQuery } from "@/lib/offerings/queries";
import ticketWorldMapImg from "@/assets/media/decorative/cards/ticket-world-map.webp";

/** Approved ticket console; searches only server-published free, single-passenger offerings. */
export function MvpFlightSearchConsole({ variant = "default" }: { variant?: "default" | "cinematic" } = {}) {
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
  const isCinematic = variant === "cinematic";
  const feedbackClass = cn("flex flex-wrap items-center gap-3 text-sm", isCinematic && "rounded-xl bg-sand/90 p-4 text-foreground");

  return <section aria-label={ar ? "البحث عن رحلة تذكارية" : "Find a commemorative flight"} className="space-y-5">
    <form onSubmit={submit} data-flight-search-console="home" data-testid="home-flight-search-ticket"
      className={isCinematic ? "home-cinematic-search home-frosted-glass relative overflow-hidden rounded-2xl border-0 shadow-xl" : "relative overflow-hidden rounded-2xl border border-clay/40 shadow-[var(--shadow-lift)]"}>
      <div className={isCinematic ? "pointer-events-none absolute inset-0 bg-ink/20" : "pointer-events-none absolute inset-0 bg-clay"} aria-hidden="true">
        <img src={ticketWorldMapImg} alt="" loading="lazy" className={isCinematic ? "size-full select-none object-contain object-top sm:object-cover opacity-85 blur-[1px]" : "size-full select-none object-cover object-center"} data-decorative-asset="home-flight-search-ticket" />
      </div>
      <div className="relative z-10">
        <div className={isCinematic ? "flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-5 border-b border-sand/20 bg-ink/40" : "flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"}>
          <p className={isCinematic ? "text-sm font-semibold text-sand" : "text-sm font-semibold text-white"}>{ar ? "رحلة تذكارية مجانية" : "Free commemorative journey"}</p>
          <p className={isCinematic ? "text-sm font-medium text-sand/85" : "text-sm font-medium text-white"}>{ar ? "اتجاه واحد · مسافر واحد" : "One way · one passenger"}</p>
        </div>
        <div className={isCinematic ? "mx-2 mb-2 overflow-hidden rounded-xl border-0 bg-sand/85 text-foreground sm:mx-4 sm:mb-4 shadow-sm" : "mx-2 mb-2 overflow-hidden rounded-xl border border-border/40 bg-card sm:mx-5 sm:mb-5"} data-flight-search-console="home-inner">
          <div className={isCinematic ? "home-offering-layout" : "grid gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"}>
            <div className="flex min-w-0 items-center gap-2 p-4 sm:gap-3 sm:p-5">
              <div className="min-w-0 flex-1"><AirportCombobox value={direction === "out" ? "GZA" : selected} airports={direction === "out" ? [GZA] : airports}
                onChange={changeDestination} disabled={direction === "out" || network.isPending || network.isError} label={t("search.from")} ariaLabel={t("search.from")} variant="console" /></div>
              <button type="button" aria-label={ar ? "عكس اتجاه الرحلة" : "Reverse journey direction"} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-brand-deep hover:bg-sand-deep focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => {setDirection(direction === "out" ? "in" : "out"); setSearch(null);}}><ArrowRightLeft className="size-4" aria-hidden="true" /></button>
              <div className="min-w-0 flex-1"><AirportCombobox value={direction === "in" ? "GZA" : selected} airports={direction === "in" ? [GZA] : airports}
                onChange={changeDestination} disabled={direction === "in" || network.isPending || network.isError} label={t("search.to")} ariaLabel={t("search.to")} variant="console" /></div>
            </div>
            <div className={isCinematic ? "border-t border-sand-deep/40 p-4 sm:p-5 md:border-t-0 md:border-s" : "border-t border-border/60 p-4 sm:p-5 md:border-t-0 md:border-s"}><Field htmlFor={`${id}-date`} label={ar ? "تاريخ المغادرة" : "Departure date"}>
              <Input id={`${id}-date`} type="date" dir="ltr" required min={todayISO()} value={date} onChange={(event) => {setDate(event.target.value); setSearch(null);}} className="min-h-11" />
            </Field></div>
            <div className={isCinematic ? "border-t border-sand-deep/40 p-4 sm:p-5 md:col-span-2 xl:col-span-1 xl:border-t-0 xl:border-s xl:self-stretch" : "border-t border-border/60 p-4 sm:p-5 md:col-span-2 xl:col-span-1 xl:border-t-0 xl:border-s xl:self-stretch"}>
              <button type="submit" disabled={!selected || network.isError || network.isPending} className={btnClass("primary","md","min-h-12 w-full xl:h-full font-bold")}>
                <Search className="size-4" aria-hidden="true" />{ar ? "ابحث عن رحلة" : "Find a flight"}<Arrow className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
    {network.isError && <div role="alert" className={feedbackClass}><span>{ar ? "تعذر تحميل الوجهات." : "Destinations could not be loaded."}</span><button type="button" className={btnClass("outline","sm")} onClick={() => void network.refetch()}>{ar ? "إعادة المحاولة" : "Try again"}</button></div>}
    {search && <div aria-live="polite" aria-atomic="false" className="space-y-3">
      {offerings.isPending ? <p role="status" className={cn("text-sm", isCinematic ? "rounded-xl bg-ink/80 p-4 text-sand" : "text-muted-foreground")}>{ar ? "جارٍ البحث في المواعيد المنشورة…" : "Searching published dates…"}</p>
        : offerings.isError ? <div role="alert" className={feedbackClass}><span>{ar ? "تعذر تحميل الرحلات." : "Flights could not be loaded."}</span><button type="button" className={btnClass("outline","sm")} onClick={() => void offerings.refetch()}>{ar ? "إعادة المحاولة" : "Try again"}</button></div>
        : results.length === 0 ? <p role="status" className={isCinematic ? "rounded-xl bg-ink/80 text-sand p-4 text-sm border border-sand/30" : "rounded-xl bg-sand p-4 text-sm"}>{ar ? "لا توجد رحلة منشورة لهذه الوجهة في التاريخ المختار. جرّب تاريخاً آخر." : "No flight is published for this route on your chosen date. Try another date."}</p>
        : <ul className={isCinematic ? "divide-y divide-sand/20 rounded-xl border border-sand/30 bg-ink/90 text-ink-foreground shadow-xl" : "divide-y divide-border rounded-xl border border-border bg-card"}>{results.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
          <div className="min-w-36 flex-1"><Code className={isCinematic ? "text-sand border-sand/30 bg-ink" : ""}>{item.number}</Code><p className="mt-1 font-semibold">{pick(lang, airports.find((airport) => airport.code === search.destination)?.city ?? {en:search.destination,ar:search.destination})}</p><Code className={isCinematic ? "text-sand/80 border-sand/20 bg-ink" : ""}>{item.originCode} → {item.destinationCode}</Code></div>
          <div><Code className={isCinematic ? "text-sand border-sand/30 bg-ink" : ""}>{item.departTime} → {item.arrivalDate && item.arrivalDate !== item.date ? `${item.arrivalDate} · ` : ""}{item.arriveTime}</Code><p className={cn("mt-1 text-sm", isCinematic ? "text-sand/80" : "text-muted-foreground")}>{ar ? "الأوقات محلية لكل مطار" : "Times local to each airport"} · {item.aircraft}</p></div>
          <AppLink to="/book" search={{offering:item.id}} className={btnClass("primary","sm")}>{ar ? "احجز مجاناً" : "Book free"}</AppLink>
        </li>)}</ul>}
    </div>}
  </section>;
}
