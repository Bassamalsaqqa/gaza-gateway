import { useAppNavigate } from "@/components/app-link";
import { ArrowDownUp, ArrowLeftRight, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { btnClass, Field } from "./kit";
import { AirportCombobox } from "./airport-combobox";
import { AirlineDatePicker } from "./airline-date-picker";
import { TravellersCabinPicker } from "./travellers-cabin-picker";
import { GZA, addDaysISO, destinations, searchFlights, todayISO } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { useStore, type SearchCriteria } from "@/lib/store";
import { cn } from "@/lib/utils";

export function FlightSearchForm({
  variant = "panel",
  initial,
}: {
  variant?: "panel" | "inline";
  initial?: Partial<SearchCriteria>;
}) {
  const { t, lang } = useI18n();
  const { draft, resetDraft } = useStore();
  const navigate = useAppNavigate();

  const [criteria, setCriteria] = useState<SearchCriteria>(() => ({
    ...draft.criteria,
    ...initial,
  }));

  // Preserved draft for return date to prevent accidental erasure when toggling round-trip to one-way
  const [returnDateDraft, setReturnDateDraft] = useState<string>(() => criteria.returnDate || "");
  const [minDate, setMinDate] = useState<string>(() => criteria.departDate || "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const today = todayISO();
    const ret = addDaysISO(today, 6);
    setMinDate(today);
    setCriteria((prev) => {
      const needsDate = !prev.departDate;
      const isPast = prev.departDate && prev.departDate < today;
      if (needsDate || isPast) {
        const nextReturn =
          prev.tripType === "round"
            ? prev.returnDate && prev.returnDate >= today
              ? prev.returnDate
              : ret
            : prev.returnDate;
        setReturnDateDraft(nextReturn || ret);
        return {
          ...prev,
          departDate: today,
          returnDate: nextReturn,
        };
      }
      return prev;
    });
  }, []);


  /**
   * Trip Type State & Draft Preservation (§10.5.2):
   * Toggling to one-way preserves return date as draft; toggling back restores it.
   */
  const handleTripTypeChange = (type: "round" | "oneway") => {
    if (type === "oneway") {
      if (criteria.returnDate) {
        setReturnDateDraft(criteria.returnDate);
      }
      setCriteria((prev) => ({ ...prev, tripType: "oneway" }));
    } else {
      const restored = returnDateDraft || addDaysISO(criteria.departDate || todayISO(), 6);
      setCriteria((prev) => ({ ...prev, tripType: "round", returnDate: restored }));
    }
  };

  /**
   * Departure & Return date relationship (§10.5.3):
   * Never silently mutate user return date when departure moves forward.
   */
  const handleDepartDateChange = (newDepart: string) => {
    setCriteria((prev) => ({
      ...prev,
      departDate: newDepart,
    }));
  };

  const handleReturnDateChange = (newReturn: string) => {
    setReturnDateDraft(newReturn);
    setCriteria((prev) => ({
      ...prev,
      returnDate: newReturn,
    }));
  };

  /**
   * Network constraint: GZA <-> destination.
   */
  const setEndpoint = (side: "origin" | "destination", code: string) =>
    setCriteria((prev) => {
      const other = side === "origin" ? prev.destination : prev.origin;
      const next = { ...prev, [side]: code } as SearchCriteria;
      if (code === GZA.code) {
        if (other === GZA.code) {
          if (side === "origin") next.destination = destinations[0]?.code ?? "AMM";
          else next.origin = destinations[0]?.code ?? "AMM";
        }
        return next;
      }
      if (side === "origin") next.destination = GZA.code;
      else next.origin = GZA.code;
      return next;
    });

  const swap = () =>
    setCriteria((prev) => ({ ...prev, origin: prev.destination, destination: prev.origin }));


  const allAirports = useMemo(() => [GZA, ...destinations], []);

  // Field-associated date range check
  const isDatePairInvalid =
    criteria.tripType === "round" &&
    Boolean(criteria.departDate && criteria.returnDate && criteria.returnDate < criteria.departDate);

  const isNetworkValid =
    (criteria.origin === GZA.code || criteria.destination === GZA.code) &&
    criteria.origin !== criteria.destination;

  const hasDepartService =
    !criteria.departDate ||
    !isNetworkValid ||
    searchFlights(criteria.origin, criteria.destination, criteria.departDate).length > 0;

  const hasReturnService =
    criteria.tripType !== "round" ||
    !criteria.returnDate ||
    !isNetworkValid ||
    searchFlights(criteria.destination, criteria.origin, criteria.returnDate).length > 0;

  const departRoute =
    lang === "ar"
      ? `\u2066${criteria.origin} → ${criteria.destination}\u2069`
      : `${criteria.origin} → ${criteria.destination}`;
  const returnRoute =
    lang === "ar"
      ? `\u2066${criteria.destination} → ${criteria.origin}\u2069`
      : `${criteria.destination} → ${criteria.origin}`;
  const isolatedDepartDate =
    lang === "ar" ? `\u2066${criteria.departDate}\u2069` : criteria.departDate;
  const isolatedReturnDate =
    lang === "ar" ? `\u2066${criteria.returnDate}\u2069` : criteria.returnDate;

  const departServiceError =
    !hasDepartService && criteria.departDate
      ? t("search.errDepartNoService", { date: isolatedDepartDate, route: departRoute })
      : undefined;

  const returnServiceError =
    criteria.tripType === "round" && !hasReturnService && criteria.returnDate
      ? t("search.errReturnNoService", { date: isolatedReturnDate, route: returnRoute })
      : undefined;

  const validate = useCallback(
    (c: SearchCriteria): string | null => {
      if (c.origin === c.destination) return t("search.errSame");
      if (c.origin !== GZA.code && c.destination !== GZA.code) return t("search.errNetwork");
      if (!c.departDate) return t("search.errDepart");
      if (c.departDate < todayISO()) return t("search.errPast");
      if (!hasDepartService) return departServiceError ?? null;
      if (c.tripType === "round") {
        if (!c.returnDate || c.returnDate < c.departDate) return t("search.errReturn");
        if (!hasReturnService) return returnServiceError ?? null;
      }
      if (c.infants > c.adults) return t("search.errInfants");
      return null;
    },
    [t, hasDepartService, departServiceError, hasReturnService, returnServiceError],
  );

  useEffect(() => {
    if (error) {
      setError(validate(criteria));
    }
  }, [error, criteria, validate]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validate(criteria);
    setError(problem);
    if (problem) return;
    resetDraft(criteria);
    void navigate({ to: "/book", search: { step: "results" } });
  };

  return (
    <form
      onSubmit={submit}
      aria-label={t("search.title")}
      className={cn(
        "relative rounded-2xl border border-border bg-card transition-shadow",
        variant === "panel"
          ? "p-4 sm:p-6 lg:p-7 shadow-[var(--shadow-lift)]"
          : "p-4 sm:p-5 shadow-[var(--shadow-soft)]",
      )}
    >
      {/* Accessible Trip Type Fieldset */}
      <fieldset className="border-0 p-0 m-0">
        <legend className="sr-only">{t("search.tripType")}</legend>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 border-b border-border/60 pb-3">
          {(["round", "oneway"] as const).map((type) => {
            const isSelected = criteria.tripType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => handleTripTypeChange(type)}
                aria-pressed={isSelected}
                className={cn(
                  "inline-flex items-center justify-center rounded-lg px-3.5 py-1.5 text-xs font-semibold sm:text-sm tracking-tight whitespace-nowrap select-none cursor-pointer transition-all duration-150",
                  "active:scale-[0.99] active:transition-none motion-reduce:active:scale-100 motion-reduce:transform-none motion-reduce:transition-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-xs shadow-[var(--shadow-soft)]"
                    : "bg-secondary/70 text-muted-foreground hover:text-foreground hover:bg-sand-deep",
                )}
              >
                {t(type === "round" ? "search.roundTrip" : "search.oneWay")}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Main Console Inputs Grid */}
      <div className="mt-4 grid grid-cols-1 gap-3.5 sm:gap-4 xl:grid-cols-2">
        {/* Origin and Destination with Dedicated Swap Column */}
        <div className="grid grid-cols-1 items-end gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-2">
          <Field label={t("search.from")} htmlFor="search-from">
            <AirportCombobox
              id="search-from"
              value={criteria.origin}
              onChange={(code) => setEndpoint("origin", code)}
              airports={allAirports}
              ariaLabel={t("search.from")}
            />
          </Field>

          {/* Desktop/Tablet swap button in its own column */}
          <div className="hidden sm:flex sm:h-11 sm:items-center sm:justify-center">
            <button
              type="button"
              data-slot="route-swap-button"
              onClick={swap}
              aria-label={t("search.swap")}
              title={t("search.swap")}
              className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-xs transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring cursor-pointer select-none"
            >
              <ArrowLeftRight aria-hidden="true" className="size-4" />
            </button>
          </div>

          {/* Mobile centered 44px vertical swap button */}
          <div className="flex justify-center sm:hidden -my-1">
            <button
              type="button"
              data-slot="route-swap-button"
              onClick={swap}
              aria-label={t("search.swap")}
              title={t("search.swap")}
              className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-xs transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring cursor-pointer select-none"
            >
              <ArrowDownUp aria-hidden="true" className="size-4" />
            </button>
          </div>

          <Field label={t("search.to")} htmlFor="search-to">
            <AirportCombobox
              id="search-to"
              value={criteria.destination}
              onChange={(code) => setEndpoint("destination", code)}
              airports={allAirports}
              ariaLabel={t("search.to")}
            />
          </Field>
        </div>

        {/* Unified Airline Date Picker with Truthful Fares */}
        <AirlineDatePicker
          tripType={criteria.tripType}
          origin={criteria.origin}
          destination={criteria.destination}
          departDate={criteria.departDate}
          returnDate={criteria.returnDate}
          onDepartChange={handleDepartDateChange}
          onReturnChange={handleReturnDateChange}
          minDate={minDate}
          isDatePairInvalid={isDatePairInvalid}
          departError={departServiceError}
          returnError={returnServiceError}
        />
      </div>

      {/* Secondary Controls: Travellers & Cabin + Search Action */}
      <div className="mt-3.5 sm:mt-4 grid gap-3.5 sm:gap-4 md:grid-cols-[1fr_auto]">
        {/* Unified Travellers & Cabin Picker */}
        <Field label={t("search.travellersAndCabin")} htmlFor="search-travellers">
          <TravellersCabinPicker
            adults={criteria.adults}
            children={criteria.children}
            infants={criteria.infants}
            cabin={criteria.cabin}
            onAdultsChange={(n) =>
              setCriteria((prev) => {
                const next = { ...prev, adults: n };
                if (next.infants > n) next.infants = n;
                return next;
              })
            }
            onChildrenChange={(n) => setCriteria((prev) => ({ ...prev, children: n }))}
            onInfantsChange={(n) => setCriteria((prev) => ({ ...prev, infants: n }))}
            onCabinChange={(id) => setCriteria((prev) => ({ ...prev, cabin: id }))}
          />
        </Field>

        {/* Action Button */}
        <div className="flex items-end">
          <button
            type="submit"
            className={btnClass(
              "primary",
              "lg",
              "w-full md:w-auto min-h-[44px] px-7 shadow-[var(--shadow-soft)] hover:shadow-md",
            )}
          >
            <Search aria-hidden="true" className="size-4" />
            <span>{t("search.submit")}</span>
          </button>
        </div>
      </div>

      {/* Validation Banner */}
      {error ? (
        <div
          role="alert"
          aria-live="polite"
          className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive"
        >
          <span>{error}</span>
        </div>
      ) : null}
    </form>
  );
}
