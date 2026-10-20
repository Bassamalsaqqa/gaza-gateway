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
              <bdi dir="ltr" className="whitespace-nowrap">{d.slice(5)}</bdi>
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
        "flex flex-col items-stretch gap-4 transition-colors sm:flex-row sm:flex-wrap sm:items-center sm:justify-between",
        compact ? "py-3 px-3 sm:px-4" : "p-4 sm:p-5",
        isSelected
          ? isCinematic
            ? "bg-sand/15 border-primary/60 ring-1 ring-primary/40 text-sand"
            : "bg-brand/10 border-primary/40 ring-1 ring-primary/30 text-foreground"
          : isCinematic
            ? "hover:bg-sand/5 text-sand"
            : "hover:bg-muted/40 text-foreground"
      )}
    >
      <div className="min-w-0 sm:min-w-[140px] sm:flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <bdi dir="ltr" className="whitespace-nowrap">
            <Code
              className={cn(
                "px-2 py-0.5 rounded text-xs font-mono font-bold tracking-normal",
                isCinematic ? "text-sand border border-sand/30 bg-ink" : "bg-muted text-foreground border border-border"
              )}
            >
              {offering.number}
            </Code>
          </bdi>
          {isSelected && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-bold shrink-0",
                isCinematic ? "text-sand" : "text-brand-deep"
              )}
            >
              <Check className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{selectedLabel ?? (ar ? "المحددة" : "Selected")}</span>
            </span>
          )}
        </div>
        {cityName && (
          <p className={cn("mt-1 font-semibold text-sm leading-normal", isCinematic ? "text-sand" : "text-foreground")}>
            {cityName}
          </p>
        )}
        <div className="mt-1">
          <bdi dir="ltr" className="whitespace-nowrap">
            <Code
              className={cn(
                "px-2 py-0.5 rounded text-xs font-mono tracking-normal",
                isCinematic ? "text-sand/85 border border-sand/20 bg-ink/80" : "bg-muted/60 text-muted-foreground border border-border"
              )}
            >
              {offering.originCode} → {offering.destinationCode}
            </Code>
          </bdi>
        </div>
      </div>

      <div className="min-w-0 sm:flex-1 sm:basis-60">
        <bdi dir="ltr" className="whitespace-nowrap">
          <Code
            className={cn(
              "px-2 py-0.5 rounded text-xs font-mono font-bold tracking-normal",
              isCinematic ? "text-sand border border-sand/30 bg-ink" : "bg-muted text-foreground border border-border"
            )}
          >
            {offering.departTime} → {offering.arrivalDate && offering.arrivalDate !== offering.date ? `${offering.arrivalDate} · ` : ""}
            {offering.arriveTime}
          </Code>
        </bdi>
        <p className={cn("mt-1 text-xs sm:text-sm leading-relaxed", isCinematic ? "text-sand/85" : "text-muted-foreground")}>
          <span>{ar ? "الأوقات محلية لكل مطار" : "Times local to each airport"}</span>
          <span> · </span>
          <bdi dir="ltr" className="whitespace-nowrap">{offering.aircraft}</bdi>
          {typeof offering.seatsRemaining === "number" && (
            <>
              <span> · </span>
              <span
                className={cn(
                  offering.seatsRemaining <= 5
                    ? isCinematic ? "font-bold text-accent" : "font-semibold text-clay"
                    : ""
                )}
              >
                {offering.seatsRemaining === 0
                  ? (ar ? "المقاعد مكتملة" : "Sold out")
                  : offering.bookable === false
                    ? (ar ? "غير متاح (لراكب واحد)" : "Unavailable (1 passenger)")
                    : (ar ? `${offering.seatsRemaining} مقاعد متاحة استرشادياً` : `${offering.seatsRemaining} indicative seats`)}
              </span>
              {offering.seatsRemaining > 0 && offering.bookable !== false && (
                <span className="text-[11px] opacity-80">
                  {" "}
                  (
                  {ar
                    ? "لراكب واحد · التأكيد عند إتمام الحجز"
                    : "1 passenger · Confirmed at booking"}
                  )
                </span>
              )}
            </>
          )}
        </p>
      </div>

      <div className="shrink-0">
        {offering.seatsRemaining === 0 || offering.bookable === false ? (
          <span
            className={cn(
              "inline-flex min-h-[44px] items-center justify-center rounded-md px-3.5 py-2 text-xs font-semibold cursor-not-allowed",
              isCinematic
                ? "bg-sand/15 border border-sand/20 text-sand/60"
                : "bg-muted border border-border text-muted-foreground"
            )}
            aria-disabled="true"
          >
            {offering.seatsRemaining === 0
              ? (ar ? "مكتملة" : "Sold out")
              : (ar ? "غير متاح" : "Unavailable")}
          </span>
        ) : actionType === "select" ? (
          <button
            type="button"
            onClick={() => onSelect?.(offering)}
            className={btnClass(isSelected ? "secondary" : "primary", "sm", "min-h-[44px] font-bold focus-visible:outline-2 focus-visible:outline-ring")}
          >
            {isSelected
              ? selectedLabel ?? (ar ? "تم الاختيار" : "Selected")
              : selectLabel ?? (ar ? "اختر هذه الرحلة" : "Select flight")}
          </button>
        ) : (
          <AppLink
            to="/book"
            search={{ offering: offering.id }}
            className={btnClass("primary", "sm", "min-h-[44px] focus-visible:outline-2 focus-visible:outline-ring")}
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
  const outboundAvailableDates = outboundAvail.data?.bookableDates ?? outboundAvail.data?.availableDates ?? [];
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

  const feedbackClass = cn(
    "flex flex-wrap items-center justify-between gap-3 text-sm rounded-xl p-4 border",
    isCinematic
      ? "bg-sand/95 border-clay/50 text-foreground shadow-md"
      : "bg-clay-soft/80 border-clay/30 text-foreground"
  );

  return (
    <section aria-label={ar ? "البحث عن رحلة" : "Find a flight"} className="space-y-5">
      <form
        onSubmit={submit}
        data-flight-search-console="home"
        data-testid="home-flight-search-ticket"
        className={
          isCinematic
            ? "home-cinematic-search home-frosted-glass relative rounded-2xl border-0 shadow-xl"
            : "relative rounded-2xl border border-clay/40 shadow-[var(--shadow-lift)]"
        }
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-0 overflow-hidden rounded-2xl",
            isCinematic ? "bg-ink/20" : "bg-clay"
          )}
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
                  isCinematic ? "bg-ink/70 border border-sand/30 text-sand" : "bg-muted/70 text-muted-foreground"
                )}
              >
                <label
                  className={cn(
                    "cursor-pointer rounded-md px-3 py-1.5 transition-all select-none min-h-[44px] inline-flex items-center focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-1",
                    tripType === "one-way"
                      ? isCinematic
                        ? "bg-sand text-ink font-bold shadow-xs"
                        : "bg-background text-foreground font-bold shadow-xs"
                      : isCinematic
                        ? "text-sand/80 hover:text-sand font-medium"
                        : "text-muted-foreground hover:text-foreground"
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
                    "cursor-pointer rounded-md px-3 py-1.5 transition-all select-none min-h-[44px] inline-flex items-center focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-1",
                    tripType === "round-trip"
                      ? isCinematic
                        ? "bg-sand text-ink font-bold shadow-xs"
                        : "bg-background text-foreground font-bold shadow-xs"
                      : isCinematic
                        ? "text-sand/80 hover:text-sand font-medium"
                        : "text-muted-foreground hover:text-foreground"
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
                ? "mx-2 mb-2 rounded-xl border border-sand-deep/40 bg-sand/90 text-foreground sm:mx-4 sm:mb-4 shadow-sm"
                : "mx-2 mb-2 rounded-xl border border-border/40 bg-card sm:mx-5 sm:mb-5"
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
              data-trip={tripType}
            >
              {/* Origin and Destination with Direction Reverse */}
              <div
                data-zone="route"
                className="flex min-w-0 items-center gap-2 p-3.5 sm:gap-3 sm:p-5"
              >
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
                  <ArrowRightLeft className="size-4 shrink-0" aria-hidden="true" />
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
                data-zone="outbound-date"
                className={
                  isCinematic
                    ? "p-3.5 sm:p-5"
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
                  data-zone="return-date"
                  className={
                    isCinematic
                      ? "p-3.5 sm:p-5"
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
                data-zone="submit"
                className={
                  isCinematic
                    ? "p-3.5 sm:p-5 flex items-end"
                    : "border-t border-border/60 p-4 sm:p-5 md:col-span-2 lg:col-span-1 xl:border-t-0 xl:border-s xl:self-stretch flex items-end"
                }
              >
                <button
                  type="submit"
                  disabled={!selectedDestinationCode || network.isError || network.isPending}
                  className={btnClass("primary", "md", "min-h-12 w-full font-bold focus-visible:outline-2 focus-visible:outline-ring")}
                >
                  <Search className="size-4 shrink-0" aria-hidden="true" />
                  <span>{ar ? "ابحث عن رحلة" : "Find a flight"}</span>
                  <Arrow className="size-4 shrink-0" aria-hidden="true" />
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
        <div
          aria-live="polite"
          aria-atomic="false"
          data-testid="search-results-workspace"
          data-surface-tone={isCinematic ? "ink" : undefined}
          className={cn(
            "space-y-6 transition-all duration-200",
            isCinematic
              ? "home-search-workspace rounded-2xl p-4 sm:p-6 md:p-7 shadow-2xl text-ink-foreground"
              : "rounded-2xl border border-border/80 bg-sand/40 p-4 sm:p-6 md:p-7 shadow-sm text-foreground"
          )}
        >
          {outboundAvail.isPending ? (
            <div
              role="status"
              className={cn(
                "flex items-center gap-3 rounded-xl p-4 sm:p-5 text-sm font-medium",
                isCinematic
                  ? "bg-ink/80 border border-sand/20 text-sand"
                  : "bg-sand/90 border border-border text-foreground"
              )}
            >
              <span className="size-2 rounded-full bg-primary animate-pulse shrink-0" aria-hidden="true" />
              <span>{ar ? "جارٍ البحث في مواعيد الرحلات المتاحة…" : "Searching available flight dates…"}</span>
            </div>
          ) : outboundAvail.isError ? (
            <div
              role="alert"
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 text-sm rounded-xl p-4 border",
                isCinematic
                  ? "bg-sand/95 border-clay/50 text-foreground shadow-md"
                  : "bg-clay-soft/80 border-clay/30 text-foreground"
              )}
            >
              <span className="font-semibold">{ar ? "تعذر تحميل الرحلات المتوفرة." : "Available flights could not be loaded."}</span>
              <button
                type="button"
                className={btnClass("outline", "sm", isCinematic ? "border-foreground/30 text-foreground hover:bg-sand-deep" : "")}
                onClick={() => void outboundAvail.refetch()}
              >
                {ar ? "إعادة المحاولة" : "Try again"}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* --- OUTBOUND SECTION --- */}
              <div className="space-y-3">
                <div className={cn("flex flex-wrap items-baseline justify-between gap-2 border-b pb-2.5", isCinematic ? "border-sand/20" : "border-border/60")}>
                  <h3 className={cn("text-base font-bold flex items-center gap-2", isCinematic ? "text-sand" : "text-foreground")}>
                    {search.tripType === "round-trip" && (
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold shrink-0">
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
                    <span className={cn("text-xs font-normal", isCinematic ? "text-sand/80" : "text-muted-foreground")}>
                      <bdi dir="ltr" className="whitespace-nowrap">({outboundOrigin} → {outboundDest})</bdi>
                    </span>
                  </h3>
                  <span className={cn("text-xs font-mono", isCinematic ? "text-sand/80" : "text-muted-foreground")}>
                    <bdi dir="ltr" className="whitespace-nowrap">{search.outboundDate}</bdi>
                  </span>
                </div>
                <p className={cn("text-xs leading-relaxed", isCinematic ? "text-sand/80" : "text-muted-foreground")}>
                  {ar
                    ? "المقاعد المعروضة استرشادية لراكب واحد حتى تأكيد الحجز (لا يوجد حجز مسبق للمقاعد)."
                    : "Indicative seats shown for 1 passenger until booking confirms assignment (no pre-booking seat hold)."}
                </p>

                {/* Case 1: Exact Outbound Flights Found */}
                {exactOutboundResults.length > 0 ? (
                  <ul
                    className={cn(
                      "divide-y rounded-xl border shadow-xl transition-colors",
                      isCinematic
                        ? "divide-sand/20 border-sand/30 bg-ink/85 text-ink-foreground"
                        : "divide-border border-border bg-card text-card-foreground"
                    )}
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
                      className={cn(
                        "rounded-xl p-4 text-sm border shadow-sm",
                        isCinematic
                          ? "bg-ink/80 border-sand/30 text-sand"
                          : "bg-sand/80 border-border text-foreground"
                      )}
                    >
                      <p className={cn("font-semibold", isCinematic ? "text-sand" : "text-foreground")}>
                        {ar ? (
                          <>
                            لا توجد رحلة متاحة لهذا المسار بتاريخ <bdi dir="ltr" className="whitespace-nowrap">{search.outboundDate}</bdi>.
                          </>
                        ) : (
                          <>
                            No flight is available for this route on <bdi dir="ltr" className="whitespace-nowrap">{search.outboundDate}</bdi>.
                          </>
                        )}
                      </p>
                      <p className={cn("mt-1 text-xs", isCinematic ? "text-sand/80" : "text-muted-foreground")}>
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
                      <div
                        key={alt.date}
                        className={cn(
                          "rounded-xl border p-4 space-y-3",
                          isCinematic
                            ? "border-sand/25 bg-ink/75 text-sand"
                            : "border-border bg-card text-foreground"
                        )}
                      >
                        <div className={cn("flex items-center justify-between gap-2 border-b pb-2", isCinematic ? "border-sand/20" : "border-border/40")}>
                          <span className={cn("text-xs font-semibold flex items-center gap-1.5 font-mono", isCinematic ? "text-sand" : "text-primary")}>
                            <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
                            <bdi dir="ltr" className="whitespace-nowrap">{alt.date}</bdi>
                          </span>
                          <span className={cn("text-xs font-medium", isCinematic ? "text-sand/80" : "text-muted-foreground")}>
                            {alt.relative === "next"
                              ? ar
                                ? `بعد ${alt.differenceDays} يوم`
                                : `+${alt.differenceDays} days`
                              : ar
                                ? `قبل ${alt.differenceDays} يوم`
                                : `-${alt.differenceDays} days`}
                          </span>
                        </div>

                        <ul className={cn("divide-y", isCinematic ? "divide-sand/20" : "divide-border/60")}>
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
                <div className={cn("space-y-3 pt-5 border-t", isCinematic ? "border-sand/20" : "border-border")}>
                  <div className={cn("flex flex-wrap items-baseline justify-between gap-2 border-b pb-2.5", isCinematic ? "border-sand/20" : "border-border/60")}>
                    <h3 className={cn("text-base font-bold flex items-center gap-2", isCinematic ? "text-sand" : "text-foreground")}>
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold shrink-0">
                        2
                      </span>
                      <span>{ar ? "رحلة العودة" : "Return Flight"}</span>
                      <span className={cn("text-xs font-normal", isCinematic ? "text-sand/80" : "text-muted-foreground")}>
                        <bdi dir="ltr" className="whitespace-nowrap">({returnOrigin} → {returnDest})</bdi>
                      </span>
                    </h3>
                    <span className={cn("text-xs font-mono", isCinematic ? "text-sand/80" : "text-muted-foreground")}>
                      <bdi dir="ltr" className="whitespace-nowrap">{search.returnDate}</bdi>
                    </span>
                  </div>
                  <p className={cn("text-xs leading-relaxed", isCinematic ? "text-sand/80" : "text-muted-foreground")}>
                    {ar
                      ? "المقاعد المعروضة استرشادية لراكب واحد حتى تأكيد الحجز (لا يوجد حجز مسبق للمقاعد)."
                      : "Indicative seats shown for 1 passenger until booking confirms assignment (no pre-booking seat hold)."}
                  </p>

                  {!selectedOutbound ? (
                    <div
                      className={cn(
                        "rounded-xl border border-dashed p-4 text-center text-sm font-medium",
                        isCinematic
                          ? "border-sand/30 bg-ink/50 text-sand/85"
                          : "border-border bg-sand/30 text-muted-foreground"
                      )}
                    >
                      <p>
                        {ar
                          ? "يرجى اختيار رحلة الذهاب أولاً لعرض رحلات العودة المتوافقة مع موعد الوصول."
                          : "Please select an outbound flight first to view return flights compatible with arrival timing."}
                      </p>
                    </div>
                  ) : returnAvail.isPending ? (
                    <div
                      role="status"
                      className={cn(
                        "flex items-center gap-3 rounded-xl p-4 sm:p-5 text-sm font-medium",
                        isCinematic
                          ? "bg-ink/80 border border-sand/20 text-sand"
                          : "bg-sand/90 border border-border text-foreground"
                      )}
                    >
                      <span className="size-2 rounded-full bg-primary animate-pulse shrink-0" aria-hidden="true" />
                      <span>{ar ? "جارٍ البحث في مواعيد رحلات العودة المتاحة…" : "Searching available return flight dates…"}</span>
                    </div>
                  ) : returnAvail.isError ? (
                    <div
                      role="alert"
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-3 text-sm rounded-xl p-4 border",
                        isCinematic
                          ? "bg-sand/95 border-clay/50 text-foreground shadow-md"
                          : "bg-clay-soft/80 border-clay/30 text-foreground"
                      )}
                    >
                      <span className="font-semibold">{ar ? "تعذر تحميل رحلات العودة." : "Return flights could not be loaded."}</span>
                      <button
                        type="button"
                        className={btnClass("outline", "sm", isCinematic ? "border-foreground/30 text-foreground hover:bg-sand-deep" : "")}
                        onClick={() => void returnAvail.refetch()}
                      >
                        {ar ? "إعادة المحاولة" : "Try again"}
                      </button>
                    </div>
                  ) : exactReturnResults.length > 0 ? (
                    /* Exact Return Flights Found */
                    <ul
                      className={cn(
                        "divide-y rounded-xl border shadow-xl transition-colors",
                        isCinematic
                          ? "divide-sand/20 border-sand/30 bg-ink/85 text-ink-foreground"
                          : "divide-border border-border bg-card text-card-foreground"
                      )}
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
                      <div
                        className={cn(
                          "rounded-xl p-4 text-sm border shadow-sm",
                          isCinematic
                            ? "bg-ink/80 border-sand/30 text-sand"
                            : "bg-sand/80 border-border text-foreground"
                        )}
                      >
                        <p className={cn("font-semibold", isCinematic ? "text-sand" : "text-foreground")}>
                          {ar ? (
                            <>
                              لا توجد رحلة عودة بتاريخ <bdi dir="ltr" className="whitespace-nowrap">{search.returnDate}</bdi> بعد موعد وصول رحلة الذهاب.
                            </>
                          ) : (
                            <>
                              No return flight on <bdi dir="ltr" className="whitespace-nowrap">{search.returnDate}</bdi> departs after your outbound arrival.
                            </>
                          )}
                        </p>
                        <p className={cn("mt-1 text-xs", isCinematic ? "text-sand/80" : "text-muted-foreground")}>
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
                        <div
                          key={alt.date}
                          className={cn(
                            "rounded-xl border p-4 space-y-3",
                            isCinematic
                              ? "border-sand/25 bg-ink/75 text-sand"
                              : "border-border bg-card text-foreground"
                          )}
                        >
                          <div className={cn("flex items-center justify-between gap-2 border-b pb-2", isCinematic ? "border-sand/20" : "border-border/40")}>
                            <span className={cn("text-xs font-semibold flex items-center gap-1.5 font-mono", isCinematic ? "text-sand" : "text-primary")}>
                              <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
                              <bdi dir="ltr" className="whitespace-nowrap">{alt.date}</bdi>
                            </span>
                            <span className={cn("text-xs font-medium", isCinematic ? "text-sand/80" : "text-muted-foreground")}>
                              {alt.relative === "next"
                                ? ar
                                  ? `بعد ${alt.differenceDays} يوم`
                                  : `+${alt.differenceDays} days`
                                : ar
                                  ? `قبل ${alt.differenceDays} يوم`
                                  : `-${alt.differenceDays} days`}
                            </span>
                          </div>

                          <ul className={cn("divide-y", isCinematic ? "divide-sand/20" : "divide-border/60")}>
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
                    <div
                      className={cn(
                        "rounded-xl border-2 border-primary p-4 sm:p-5 mt-4 space-y-4 shadow-lg",
                        isCinematic
                          ? "bg-sand/95 text-foreground"
                          : "bg-primary/5 text-foreground"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-primary/20 pb-2">
                        <span className="font-bold text-foreground text-sm sm:text-base flex items-center gap-2">
                          <Check className="size-4 text-primary shrink-0" aria-hidden="true" />
                          <span>{ar ? "تم اختيار رحلتي الذهاب والعودة" : "Both Outbound & Return Flights Selected"}</span>
                        </span>
                        <span className="text-xs text-muted-foreground font-semibold">
                          {ar ? "حجز مجاني" : "Free Booking"}
                        </span>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 text-sm">
                        <div className={cn("rounded-lg p-3 border", isCinematic ? "bg-card text-card-foreground border-sand-deep/60" : "bg-card border-border")}>
                          <p className="text-xs font-semibold text-muted-foreground">{ar ? "الذهاب" : "Outbound"}</p>
                          <p className="font-bold mt-0.5">
                            <bdi dir="ltr" className="whitespace-nowrap">{selectedOutbound.number} · {selectedOutbound.originCode} → {selectedOutbound.destinationCode}</bdi>
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            <bdi dir="ltr" className="whitespace-nowrap">{selectedOutbound.date} · {selectedOutbound.departTime} → {selectedOutbound.arriveTime}</bdi>
                          </p>
                        </div>
                        <div className={cn("rounded-lg p-3 border", isCinematic ? "bg-card text-card-foreground border-sand-deep/60" : "bg-card border-border")}>
                          <p className="text-xs font-semibold text-muted-foreground">{ar ? "العودة" : "Return"}</p>
                          <p className="font-bold mt-0.5">
                            <bdi dir="ltr" className="whitespace-nowrap">{selectedReturn.number} · {selectedReturn.originCode} → {selectedReturn.destinationCode}</bdi>
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            <bdi dir="ltr" className="whitespace-nowrap">{selectedReturn.date} · {selectedReturn.departTime} → {selectedReturn.arriveTime}</bdi>
                          </p>
                        </div>
                      </div>

                      <div className="pt-1">
                        <AppLink
                          to="/book"
                          search={{ offering: selectedOutbound.id, returnOffering: selectedReturn.id }}
                          className={btnClass("primary", "md", "w-full font-bold text-base shadow-md focus-visible:outline-2 focus-visible:outline-ring min-h-[48px]")}
                        >
                          <span>{ar ? "متابعة حجز رحلة الذهاب والعودة مجاناً" : "Book free round-trip"}</span>
                          <Arrow className="size-4 shrink-0" aria-hidden="true" />
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
