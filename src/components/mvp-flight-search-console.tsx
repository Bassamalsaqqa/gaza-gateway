import { useId, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowRightLeft, Check, Calendar, Search } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { cn } from "@/lib/utils";
import { AirportCombobox } from "@/components/airport-combobox";
import { Code, Field, Input, btnClass } from "@/components/kit";
import { GZA, todayISO, addDaysISO, type Airport } from "@/lib/data";
import { useI18n, pick } from "@/lib/i18n";
import { useNetworkQuery } from "@/lib/network";
import { useOfferingAvailabilityQuery } from "@/lib/offerings/queries";
import type { DatedOffering } from "@/lib/offerings/schema";
import {
  getExactOfferings,
  getRankedAlternatives,
  filterValidReturnOfferings,
  isReturnChronologyValid,
} from "@/lib/offerings/search";
import ticketWorldMapImg from "@/assets/media/decorative/cards/ticket-world-map.webp";

interface MvpFlightSearchConsoleProps {
  variant?: "default" | "cinematic";
}

interface ActiveSearchState {
  tripType: "one-way" | "round-trip";
  direction: "out" | "in";
  destination: string;
  outboundDate: string;
  returnDate: string;
}

interface DateChipsStripProps {
  label: string;
  dates: string[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

function DateChipsStrip({
  label,
  dates,
  selectedDate,
  onSelectDate,
}: DateChipsStripProps) {
  if (dates.length === 0) return null;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2" aria-label={label}>
      <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
        {dates.slice(0, 4).map((d) => {
          const isSelected = selectedDate === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelectDate(d)}
              aria-pressed={isSelected}
              className={cn(
                "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md px-3 py-2 text-xs font-mono transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                isSelected
                  ? "bg-primary text-primary-foreground font-bold shadow-xs"
                  : "bg-secondary text-foreground hover:bg-sand-deep border border-border/60"
              )}
            >
              <bdi dir="ltr">{d.slice(5)}</bdi>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface OfferingCardRowProps {
  offering: DatedOffering;
  isSelected?: boolean;
  onSelect?: (offering: DatedOffering) => void;
  actionType: "select" | "book";
  selectLabel?: string;
  selectedLabel?: string;
  cityName?: string;
  isCinematic?: boolean;
  ar: boolean;
  compact?: boolean;
}

function OfferingCardRow({
  offering,
  isSelected = false,
  onSelect,
  actionType,
  selectLabel,
  selectedLabel,
  cityName,
  isCinematic = false,
  ar,
  compact = false,
}: OfferingCardRowProps) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center justify-between gap-4 transition-colors",
        compact ? "py-3 first:pt-0 last:pb-0" : "p-4 sm:p-5",
        isSelected && "bg-brand/10 border-primary/40 ring-1 ring-primary/30"
      )}
    >
      <div className="min-w-36 flex-1">
        <div className="flex items-center gap-2">
          <bdi dir="ltr">
            <Code className={isCinematic ? "text-sand border-sand/30 bg-ink" : ""}>
              {offering.number}
            </Code>
          </bdi>
          {isSelected && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-deep">
              <Check className="size-3.5" aria-hidden="true" />
              <span>{selectedLabel ?? (ar ? "المحددة" : "Selected")}</span>
            </span>
          )}
        </div>
        {cityName && <p className="mt-1 font-semibold">{cityName}</p>}
        <div className="mt-1">
          <bdi dir="ltr">
            <Code className={isCinematic ? "text-sand/80 border-sand/20 bg-ink" : ""}>
              {offering.originCode} → {offering.destinationCode}
            </Code>
          </bdi>
        </div>
      </div>

      <div>
        <bdi dir="ltr">
          <Code className={isCinematic ? "text-sand border-sand/30 bg-ink" : ""}>
            {offering.departTime} → {offering.arrivalDate && offering.arrivalDate !== offering.date ? `${offering.arrivalDate} · ` : ""}
            {offering.arriveTime}
          </Code>
        </bdi>
        <p className={cn("mt-1 text-sm", isCinematic ? "text-sand/80" : "text-muted-foreground")}>
          <span>{ar ? "الأوقات محلية لكل مطار" : "Times local to each airport"}</span>
          <span> · </span>
          <bdi dir="ltr">{offering.aircraft}</bdi>
        </p>
      </div>

      <div>
        {actionType === "select" ? (
          <button
            type="button"
            onClick={() => onSelect?.(offering)}
            className={btnClass(isSelected ? "secondary" : "primary", "sm", "font-bold focus-visible:outline-2 focus-visible:outline-ring")}
          >
            {isSelected
              ? selectedLabel ?? (ar ? "تم الاختيار" : "Selected")
              : selectLabel ?? (ar ? "اختر هذه الرحلة" : "Select flight")}
          </button>
        ) : (
          <AppLink
            to="/book"
            search={{ offering: offering.id }}
            className={btnClass("primary", "sm", "focus-visible:outline-2 focus-visible:outline-ring")}
          >
            {ar ? "احجز مجاناً" : "Book free"}
          </AppLink>
        )}
      </div>
    </li>
  );
}

/**
 * Intelligent commemorative flight search console.
 * Supports One-way and Round-trip selection using authentic availability.
 * Never displays pretend dates, fake fallbacks, or dead-end results.
 */
export function MvpFlightSearchConsole({ variant = "default" }: MvpFlightSearchConsoleProps = {}) {
  const { lang, t } = useI18n();
  const ar = lang === "ar";
  const id = useId();
  const isCinematic = variant === "cinematic";
  const Arrow = ar ? ArrowLeft : ArrowRight;

  const network = useNetworkQuery();
  const airports = useMemo<Airport[]>(() => {
    return (network.data ?? [])
      .filter((item) => item.active)
      .map((item) => ({
        code: item.code,
        city: item.city,
        country: item.country,
        name: item.airportName,
        tz: item.timezone,
      }));
  }, [network.data]);

  const [tripType, setTripType] = useState<"one-way" | "round-trip">("one-way");
  const [destination, setDestination] = useState("AMM");
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [outboundDate, setOutboundDate] = useState(todayISO);
  const [returnDate, setReturnDate] = useState(() => addDaysISO(todayISO(), 3));

  const [search, setSearch] = useState<ActiveSearchState | null>(null);
  const [selectedOutbound, setSelectedOutbound] = useState<DatedOffering | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<DatedOffering | null>(null);

  const selectedDestinationCode = airports.some((item) => item.code === destination)
    ? destination
    : airports[0]?.code ?? "AMM";

  // Outbound route endpoints
  const outboundOrigin = direction === "out" ? "GZA" : selectedDestinationCode;
  const outboundDest = direction === "out" ? selectedDestinationCode : "GZA";

  // Return route endpoints (opposite of outbound)
  const returnOrigin = outboundDest;
  const returnDest = outboundOrigin;

  // Query availability for outbound window (28 days)
  const outboundAvail = useOfferingAvailabilityQuery(
    outboundOrigin,
    outboundDest,
    search?.outboundDate ?? outboundDate,
    28
  );

  // Query availability for return window (only when round-trip)
  const isRoundTrip = tripType === "round-trip" || search?.tripType === "round-trip";
  const returnQueryDate = search?.returnDate ?? returnDate;
  const returnAvail = useOfferingAvailabilityQuery(
    returnOrigin,
    returnDest,
    returnQueryDate,
    28,
    { enabled: isRoundTrip }
  );

  const changeDestination = (code: string) => {
    setDestination(code);
    setSearch(null);
    setSelectedOutbound(null);
    setSelectedReturn(null);
  };

  const handleTripTypeChange = (newType: "one-way" | "round-trip") => {
    setTripType(newType);
    setSelectedOutbound(null);
    setSelectedReturn(null);
    if (search) {
      setSearch({ ...search, tripType: newType });
    }
  };

  const handleReverseDirection = () => {
    setDirection((prev) => (prev === "out" ? "in" : "out"));
    setSearch(null);
    setSelectedOutbound(null);
    setSelectedReturn(null);
  };

  const handleOutboundDateChange = (val: string) => {
    setOutboundDate(val);
    if (val > returnDate) {
      setReturnDate(addDaysISO(val, 3));
    }
    setSearch(null);
    setSelectedOutbound(null);
    setSelectedReturn(null);
  };

  const handleReturnDateChange = (val: string) => {
    setReturnDate(val);
    setSearch(null);
    setSelectedReturn(null);
  };

  const handleSelectOutbound = (offering: DatedOffering) => {
    setSelectedOutbound(offering);
    // If return was already selected but is now chronologically before outbound arrival, reset it
    if (selectedReturn && !isReturnChronologyValid(offering, selectedReturn)) {
      setSelectedReturn(null);
    }
  };

  const handleSelectReturn = (offering: DatedOffering) => {
    setSelectedReturn(offering);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedDestinationCode || network.isError || !outboundDate || outboundDate < todayISO()) return;
    setSelectedOutbound(null);
    setSelectedReturn(null);
    setSearch({
      tripType,
      direction,
      destination: selectedDestinationCode,
      outboundDate,
      returnDate: isRoundTrip ? returnDate : "",
    });
  };

  // Results calculation for outbound
  const effectiveOutboundDate = search?.outboundDate ?? outboundDate;
  const outboundOfferings = outboundAvail.data?.offerings ?? [];
  const outboundAvailableDates = outboundAvail.data?.availableDates ?? [];
  const exactOutboundResults = getExactOfferings(outboundOfferings, effectiveOutboundDate);
  const outboundAlternatives = getRankedAlternatives(
    outboundOfferings,
    outboundAvailableDates,
    effectiveOutboundDate,
    3
  );

  // Results calculation for return (when round-trip)
  const effectiveReturnDate = search?.returnDate ?? returnDate;
  const rawReturnOfferings = returnAvail.data?.offerings ?? [];
  const validReturnOfferings = filterValidReturnOfferings(rawReturnOfferings, selectedOutbound);
  const validReturnDates = Array.from(new Set(validReturnOfferings.map((o) => o.date))).sort();
  const exactReturnResults = getExactOfferings(validReturnOfferings, effectiveReturnDate);
  const returnAlternatives = getRankedAlternatives(
    validReturnOfferings,
    validReturnDates,
    effectiveReturnDate,
    3
  );

  const destinationCityName = pick(
    lang,
    airports.find((airport) => airport.code === (search?.destination ?? selectedDestinationCode))?.city ?? {
      en: search?.destination ?? selectedDestinationCode,
      ar: search?.destination ?? selectedDestinationCode,
    }
  );

  const feedbackClass = cn("flex flex-wrap items-center gap-3 text-sm", isCinematic && "rounded-xl bg-sand/90 p-4 text-foreground");

  return (
    <section aria-label={ar ? "البحث عن رحلة" : "Find a flight"} className="space-y-5">
      <form
        onSubmit={submit}
        data-flight-search-console="home"
        data-testid="home-flight-search-ticket"
        className={
          isCinematic
            ? "home-cinematic-search home-frosted-glass relative overflow-hidden rounded-2xl border-0 shadow-xl"
            : "relative overflow-hidden rounded-2xl border border-clay/40 shadow-[var(--shadow-lift)]"
        }
      >
        <div
          className={isCinematic ? "pointer-events-none absolute inset-0 bg-ink/20" : "pointer-events-none absolute inset-0 bg-clay"}
          aria-hidden="true"
        >
          <img
            src={ticketWorldMapImg}
            alt=""
            loading="lazy"
            className={
              isCinematic
                ? "size-full select-none object-contain object-top sm:object-cover opacity-85 blur-[1px]"
                : "size-full select-none object-cover object-center"
            }
            data-decorative-asset="home-flight-search-ticket"
          />
        </div>

        <div className="relative z-10">
          {/* Header Bar with Journey Type Controls */}
          <div
            className={
              isCinematic
                ? "flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-5 border-b border-sand/20 bg-ink/40"
                : "flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 border-b border-border/40 bg-sand/30"
            }
          >
            <div className="flex items-center gap-3">
              <p className={isCinematic ? "text-sm font-semibold text-sand" : "text-sm font-semibold text-foreground"}>
                {ar ? "رحلة مجانية" : "Free journey"}
              </p>
              <span className={cn("text-xs", isCinematic ? "text-sand/70" : "text-muted-foreground")} aria-hidden="true">
                •
              </span>
              <p className={cn("text-xs font-medium", isCinematic ? "text-sand/85" : "text-muted-foreground")}>
                {ar ? "بدون رسوم حجز" : "No booking fees"}
              </p>
            </div>

            {/* Accessible Semantic Radio Group for Trip Type */}
            <fieldset className="w-auto border-0 p-0 m-0">
              <legend className="sr-only">{ar ? "نوع الرحلة" : "Journey type"}</legend>
              <div
                className={cn(
                  "inline-flex items-center rounded-lg p-1 text-xs font-semibold",
                  isCinematic ? "bg-ink/60 border border-sand/20 text-sand" : "bg-muted/70 text-muted-foreground"
                )}
              >
                <label
                  className={cn(
                    "cursor-pointer rounded-md px-3 py-1.5 transition-all select-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-1",
                    tripType === "one-way"
                      ? isCinematic
                        ? "bg-sand text-ink shadow-xs"
                        : "bg-background text-foreground shadow-xs"
                      : isCinematic
                        ? "hover:text-sand/90"
                        : "hover:text-foreground"
                  )}
                >
                  <input
                    type="radio"
                    name="mvp-console-trip-type"
                    value="one-way"
                    checked={tripType === "one-way"}
                    onChange={() => handleTripTypeChange("one-way")}
                    className="sr-only"
                  />
                  <span>{ar ? "اتجاه واحد" : "One way"}</span>
                </label>
                <label
                  className={cn(
                    "cursor-pointer rounded-md px-3 py-1.5 transition-all select-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-1",
                    tripType === "round-trip"
                      ? isCinematic
                        ? "bg-sand text-ink shadow-xs"
                        : "bg-background text-foreground shadow-xs"
                      : isCinematic
                        ? "hover:text-sand/90"
                        : "hover:text-foreground"
                  )}
                >
                  <input
                    type="radio"
                    name="mvp-console-trip-type"
                    value="round-trip"
                    checked={tripType === "round-trip"}
                    onChange={() => handleTripTypeChange("round-trip")}
                    className="sr-only"
                  />
                  <span>{ar ? "ذهاب وعودة" : "Round trip"}</span>
                </label>
              </div>
            </fieldset>
          </div>

          {/* Form Controls Card */}
          <div
            className={
              isCinematic
                ? "mx-2 mb-2 overflow-hidden rounded-xl border-0 bg-sand/85 text-foreground sm:mx-4 sm:mb-4 shadow-sm"
                : "mx-2 mb-2 overflow-hidden rounded-xl border border-border/40 bg-card sm:mx-5 sm:mb-5"
            }
            data-flight-search-console="home-inner"
          >
            <div
              className={
                isCinematic
                  ? "home-offering-layout"
                  : isRoundTrip
                    ? "grid gap-0 md:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_auto]"
                    : "grid gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"
              }
            >
              {/* Origin and Destination with Direction Reverse */}
              <div className="flex min-w-0 items-center gap-2 p-4 sm:gap-3 sm:p-5">
                <div className="min-w-0 flex-1">
                  <AirportCombobox
                    value={direction === "out" ? "GZA" : selectedDestinationCode}
                    airports={direction === "out" ? [GZA] : airports}
                    onChange={changeDestination}
                    disabled={direction === "out" || network.isPending || network.isError}
                    label={t("search.from")}
                    ariaLabel={t("search.from")}
                    variant="console"
                  />
                </div>
                <button
                  type="button"
                  aria-label={ar ? "عكس اتجاه الرحلة" : "Reverse journey direction"}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-brand-deep hover:bg-sand-deep focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={handleReverseDirection}
                >
                  <ArrowRightLeft className="size-4" aria-hidden="true" />
                </button>
                <div className="min-w-0 flex-1">
                  <AirportCombobox
                    value={direction === "in" ? "GZA" : selectedDestinationCode}
                    airports={direction === "in" ? [GZA] : airports}
                    onChange={changeDestination}
                    disabled={direction === "in" || network.isPending || network.isError}
                    label={t("search.to")}
                    ariaLabel={t("search.to")}
                    variant="console"
                  />
                </div>
              </div>

              {/* Outbound Departure Date */}
              <div
                className={
                  isCinematic
                    ? "border-t border-sand-deep/40 p-4 sm:p-5 md:border-t-0 md:border-s"
                    : "border-t border-border/60 p-4 sm:p-5 md:border-t-0 md:border-s"
                }
              >
                <Field
                  htmlFor={`${id}-outbound-date`}
                  label={
                    ar
                      ? isRoundTrip
                        ? "تاريخ المغادرة (الذهاب)"
                        : "تاريخ المغادرة"
                      : isRoundTrip
                        ? "Departure date (Outbound)"
                        : "Departure date"
                  }
                >
                  <Input
                    id={`${id}-outbound-date`}
                    type="date"
                    dir="ltr"
                    required
                    min={todayISO()}
                    value={outboundDate}
                    onChange={(event) => handleOutboundDateChange(event.target.value)}
                    className="min-h-11 focus-visible:outline-2 focus-visible:outline-ring"
                  />
                </Field>

                {/* Available Date Chips for Outbound */}
                <DateChipsStrip
                  label={ar ? "مواعيد الرحلات المتاحة:" : "Available flight dates:"}
                  dates={outboundAvail.data?.availableDates ?? []}
                  selectedDate={outboundDate}
                  onSelectDate={handleOutboundDateChange}
                />
              </div>

              {/* Return Date (When Round-Trip) */}
              {isRoundTrip && (
                <div
                  className={
                    isCinematic
                      ? "border-t border-sand-deep/40 p-4 sm:p-5 md:border-t-0 md:border-s"
                      : "border-t border-border/60 p-4 sm:p-5 md:border-t-0 md:border-s"
                  }
                >
                  <Field htmlFor={`${id}-return-date`} label={ar ? "تاريخ العودة" : "Return date"}>
                    <Input
                      id={`${id}-return-date`}
                      type="date"
                      dir="ltr"
                      required
                      min={outboundDate || todayISO()}
                      value={returnDate}
                      onChange={(event) => handleReturnDateChange(event.target.value)}
                      className="min-h-11 focus-visible:outline-2 focus-visible:outline-ring"
                    />
                  </Field>

                  {/* Available Date Chips for Return */}
                  <DateChipsStrip
                    label={ar ? "مواعيد العودة المتاحة:" : "Available return dates:"}
                    dates={returnAvail.data?.availableDates ?? []}
                    selectedDate={returnDate}
                    onSelectDate={handleReturnDateChange}
                  />
                </div>
              )}

              {/* Submit Action Button */}
              <div
                className={
                  isCinematic
                    ? "border-t border-sand-deep/40 p-4 sm:p-5 md:col-span-2 xl:col-span-1 xl:border-t-0 xl:border-s xl:self-stretch"
                    : "border-t border-border/60 p-4 sm:p-5 md:col-span-2 lg:col-span-1 xl:border-t-0 xl:border-s xl:self-stretch"
                }
              >
                <button
                  type="submit"
                  disabled={!selectedDestinationCode || network.isError || network.isPending}
                  className={btnClass("primary", "md", "min-h-12 w-full xl:h-full font-bold focus-visible:outline-2 focus-visible:outline-ring")}
                >
                  <Search className="size-4" aria-hidden="true" />
                  {ar ? "ابحث عن رحلة" : "Find a flight"}
                  <Arrow className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Network Error Alert */}
      {network.isError && (
        <div role="alert" className={feedbackClass}>
          <span>{ar ? "تعذر تحميل الوجهات." : "Destinations could not be loaded."}</span>
          <button type="button" className={btnClass("outline", "sm")} onClick={() => void network.refetch()}>
            {ar ? "إعادة المحاولة" : "Try again"}
          </button>
        </div>
      )}

      {/* Search Results Workspace */}
      {search && (
        <div aria-live="polite" aria-atomic="false" className="space-y-6">
          {outboundAvail.isPending ? (
            <p
              role="status"
              className={cn("text-sm", isCinematic ? "rounded-xl bg-ink/80 p-4 text-sand" : "text-muted-foreground")}
            >
              {ar ? "جارٍ البحث في مواعيد الرحلات المتاحة…" : "Searching available flight dates…"}
            </p>
          ) : outboundAvail.isError ? (
            <div role="alert" className={feedbackClass}>
              <span>{ar ? "تعذر تحميل الرحلات المتوفرة." : "Available flights could not be loaded."}</span>
              <button type="button" className={btnClass("outline", "sm")} onClick={() => void outboundAvail.refetch()}>
                {ar ? "إعادة المحاولة" : "Try again"}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* --- OUTBOUND SECTION --- */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2">
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    {search.tripType === "round-trip" && (
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
                        1
                      </span>
                    )}
                    <span>
                      {search.tripType === "round-trip"
                        ? ar
                          ? "رحلة الذهاب"
                          : "Outbound Flight"
                        : ar
                          ? "الرحلات المتاحة"
                          : "Available Flights"}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      <bdi dir="ltr">({outboundOrigin} → {outboundDest})</bdi>
                    </span>
                  </h3>
                  <span className="text-xs text-muted-foreground font-mono">
                    <bdi dir="ltr">{search.outboundDate}</bdi>
                  </span>
                </div>

                {/* Case 1: Exact Outbound Flights Found */}
                {exactOutboundResults.length > 0 ? (
                  <ul
                    className={
                      isCinematic
                        ? "divide-y divide-sand/20 rounded-xl border border-sand/30 bg-ink/90 text-ink-foreground shadow-xl"
                        : "divide-y divide-border rounded-xl border border-border bg-card"
                    }
                  >
                    {exactOutboundResults.map((item) => (
                      <OfferingCardRow
                        key={item.id}
                        offering={item}
                        isSelected={selectedOutbound?.id === item.id}
                        onSelect={handleSelectOutbound}
                        actionType={search.tripType === "round-trip" ? "select" : "book"}
                        selectLabel={ar ? "اختر هذه الرحلة" : "Select flight"}
                        selectedLabel={ar ? "تم اختيار الذهاب" : "Selected"}
                        cityName={destinationCityName}
                        isCinematic={isCinematic}
                        ar={ar}
                      />
                    ))}
                  </ul>
                ) : (
                  /* Case 2: No Exact Flight, Show Ranked Date Alternatives */
                  <div className="space-y-3">
                    <div
                      className={
                        isCinematic
                          ? "rounded-xl bg-ink/80 text-sand p-4 text-sm border border-sand/30"
                          : "rounded-xl bg-sand/80 border border-border p-4 text-sm"
                      }
                    >
                      <p className="font-semibold text-foreground">
                        {ar ? (
                          <>
                            لا توجد رحلة متاحة لهذا المسار بتاريخ <bdi dir="ltr">{search.outboundDate}</bdi>.
                          </>
                        ) : (
                          <>
                            No flight is available for this route on <bdi dir="ltr">{search.outboundDate}</bdi>.
                          </>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {outboundAlternatives.length > 0
                          ? ar
                            ? "فيما يلي أقرب مواعيد الرحلات المتاحة على نفس المسار:"
                            : "Nearest available flight dates on this route:"
                          : ar
                            ? "لا توجد مواعيد أخرى متاحة لهذا المسار في هذه الفترة."
                            : "No other flights are currently scheduled on this route in this period."}
                      </p>
                    </div>

                    {outboundAlternatives.map((alt) => (
                      <div key={alt.date} className="rounded-xl border border-border bg-card p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                          <span className="text-xs font-semibold text-primary flex items-center gap-1.5 font-mono">
                            <Calendar className="size-3.5" aria-hidden="true" />
                            <bdi dir="ltr">{alt.date}</bdi>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {alt.relative === "next"
                              ? ar
                                ? `بعد ${alt.differenceDays} يوم`
                                : `+${alt.differenceDays} days`
                              : ar
                                ? `قبل ${alt.differenceDays} يوم`
                                : `-${alt.differenceDays} days`}
                          </span>
                        </div>

                        <ul className="divide-y divide-border/60">
                          {alt.offerings.map((item) => (
                            <OfferingCardRow
                              key={item.id}
                              offering={item}
                              isSelected={selectedOutbound?.id === item.id}
                              onSelect={handleSelectOutbound}
                              actionType={search.tripType === "round-trip" ? "select" : "book"}
                              selectLabel={ar ? "اختر هذه الرحلة" : "Select flight"}
                              selectedLabel={ar ? "تم الاختيار" : "Selected"}
                              cityName={destinationCityName}
                              isCinematic={isCinematic}
                              ar={ar}
                              compact
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* --- RETURN SECTION (When Round-Trip) --- */}
              {search.tripType === "round-trip" && (
                <div className="space-y-3 pt-4 border-t border-border">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2">
                    <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
                        2
                      </span>
                      <span>{ar ? "رحلة العودة" : "Return Flight"}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        <bdi dir="ltr">({returnOrigin} → {returnDest})</bdi>
                      </span>
                    </h3>
                    <span className="text-xs text-muted-foreground font-mono">
                      <bdi dir="ltr">{search.returnDate}</bdi>
                    </span>
                  </div>

                  {!selectedOutbound ? (
                    <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                      <p>
                        {ar
                          ? "يرجى اختيار رحلة الذهاب أولاً لعرض رحلات العودة المتوافقة مع موعد الوصول."
                          : "Please select an outbound flight first to view return flights compatible with arrival timing."}
                      </p>
                    </div>
                  ) : returnAvail.isPending ? (
                    <p role="status" className="text-sm text-muted-foreground">
                      {ar ? "جارٍ البحث في مواعيد رحلات العودة المتاحة…" : "Searching available return flight dates…"}
                    </p>
                  ) : returnAvail.isError ? (
                    <div role="alert" className={feedbackClass}>
                      <span>{ar ? "تعذر تحميل رحلات العودة." : "Return flights could not be loaded."}</span>
                      <button type="button" className={btnClass("outline", "sm")} onClick={() => void returnAvail.refetch()}>
                        {ar ? "إعادة المحاولة" : "Try again"}
                      </button>
                    </div>
                  ) : exactReturnResults.length > 0 ? (
                    /* Exact Return Flights Found */
                    <ul
                      className={
                        isCinematic
                          ? "divide-y divide-sand/20 rounded-xl border border-sand/30 bg-ink/90 text-ink-foreground shadow-xl"
                          : "divide-y divide-border rounded-xl border border-border bg-card"
                      }
                    >
                      {exactReturnResults.map((item) => (
                        <OfferingCardRow
                          key={item.id}
                          offering={item}
                          isSelected={selectedReturn?.id === item.id}
                          onSelect={handleSelectReturn}
                          actionType="select"
                          selectLabel={ar ? "اختر رحلة العودة" : "Select return"}
                          selectedLabel={ar ? "تم اختيار العودة" : "Selected for return"}
                          cityName={destinationCityName}
                          isCinematic={isCinematic}
                          ar={ar}
                        />
                      ))}
                    </ul>
                  ) : (
                    /* No Exact Return Flight, Show Nearest Valid Return Alternatives */
                    <div className="space-y-3">
                      <div className="rounded-xl bg-sand/80 border border-border p-4 text-sm">
                        <p className="font-semibold text-foreground">
                          {ar ? (
                            <>
                              لا توجد رحلة عودة بتاريخ <bdi dir="ltr">{search.returnDate}</bdi> بعد موعد وصول رحلة الذهاب.
                            </>
                          ) : (
                            <>
                              No return flight on <bdi dir="ltr">{search.returnDate}</bdi> departs after your outbound arrival.
                            </>
                          )}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {returnAlternatives.length > 0
                            ? ar
                              ? "فيما يلي أقرب مواعيد العودة المتاحة المتوافقة مع رحلة الذهاب:"
                              : "Nearest compatible return flight dates:"
                            : ar
                              ? "لا توجد مواعيد عودة متوافقة في هذه الفترة."
                              : "No compatible return flights available in this period."}
                        </p>
                      </div>

                      {returnAlternatives.map((alt) => (
                        <div key={alt.date} className="rounded-xl border border-border bg-card p-4 space-y-3">
                          <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                            <span className="text-xs font-semibold text-primary flex items-center gap-1.5 font-mono">
                              <Calendar className="size-3.5" aria-hidden="true" />
                              <bdi dir="ltr">{alt.date}</bdi>
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {alt.relative === "next"
                                ? ar
                                  ? `بعد ${alt.differenceDays} يوم`
                                  : `+${alt.differenceDays} days`
                                : ar
                                  ? `قبل ${alt.differenceDays} يوم`
                                  : `-${alt.differenceDays} days`}
                            </span>
                          </div>

                          <ul className="divide-y divide-border/60">
                            {alt.offerings.map((item) => (
                              <OfferingCardRow
                                key={item.id}
                                offering={item}
                                isSelected={selectedReturn?.id === item.id}
                                onSelect={handleSelectReturn}
                                actionType="select"
                                selectLabel={ar ? "اختر رحلة العودة" : "Select return"}
                                selectedLabel={ar ? "تم الاختيار" : "Selected"}
                                cityName={destinationCityName}
                                isCinematic={isCinematic}
                                ar={ar}
                                compact
                              />
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Complete Round-Trip Selection & Book Link */}
                  {selectedOutbound && selectedReturn && (
                    <div className="rounded-xl border-2 border-primary bg-primary/5 p-4 sm:p-5 mt-4 space-y-4">
                      <div className="flex items-center justify-between gap-2 border-b border-primary/20 pb-2">
                        <span className="font-bold text-foreground text-sm flex items-center gap-2">
                          <Check className="size-4 text-primary" aria-hidden="true" />
                          {ar ? "تم اختيار رحلتي الذهاب والعودة" : "Both Outbound & Return Flights Selected"}
                        </span>
                        <span className="text-xs text-muted-foreground font-semibold">
                          {ar ? "حجز مجاني" : "Free Booking"}
                        </span>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 text-sm">
                        <div className="rounded-lg bg-card p-3 border border-border">
                          <p className="text-xs font-semibold text-muted-foreground">{ar ? "الذهاب" : "Outbound"}</p>
                          <p className="font-bold mt-0.5">
                            <bdi dir="ltr">{selectedOutbound.number} · {selectedOutbound.originCode} → {selectedOutbound.destinationCode}</bdi>
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            <bdi dir="ltr">{selectedOutbound.date} · {selectedOutbound.departTime} → {selectedOutbound.arriveTime}</bdi>
                          </p>
                        </div>
                        <div className="rounded-lg bg-card p-3 border border-border">
                          <p className="text-xs font-semibold text-muted-foreground">{ar ? "العودة" : "Return"}</p>
                          <p className="font-bold mt-0.5">
                            <bdi dir="ltr">{selectedReturn.number} · {selectedReturn.originCode} → {selectedReturn.destinationCode}</bdi>
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            <bdi dir="ltr">{selectedReturn.date} · {selectedReturn.departTime} → {selectedReturn.arriveTime}</bdi>
                          </p>
                        </div>
                      </div>

                      <div className="pt-1">
                        <AppLink
                          to="/book"
                          search={{ offering: selectedOutbound.id, returnOffering: selectedReturn.id }}
                          className={btnClass("primary", "md", "w-full font-bold text-base shadow-md focus-visible:outline-2 focus-visible:outline-ring")}
                        >
                          {ar ? "متابعة حجز رحلة الذهاب والعودة مجاناً" : "Book free round-trip"}
                          <Arrow className="size-4" aria-hidden="true" />
                        </AppLink>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
