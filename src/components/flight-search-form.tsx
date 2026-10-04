/**
 * FlightSearchForm — Gaza Gateway (Redesign 0.2)
 *
 * Responsive flight-search console matching the three owner design references:
 *   - PC (≥1280px): Slim single horizontal instrument console.
 *   - Tablet (768–1279px): Deliberate two-row inner console (route + dates / travellers + cabin + search).
 *   - Mobile (<768px): Vertical stacked console with route connector, paired dates, travellers, cabin, full-width CTA.
 *
 * Visual hierarchy:
 *   1. Outer journey shell: authentic red Ticket world-map WebP (decorative, unmirrored in RTL).
 *   2. Compact trip type bar: Round trip / One way pill buttons with aria-pressed.
 *   3. Inner limestone console: single coherent warm surface with fine dividers.
 *   4. Route zone: clickable Origin/Destination with large LTR IATA codes, city, airport name, center swap.
 *   5. Dates zone: prominent short date + quieter weekday (Western digits in Arabic), one-way removes Return.
 *   6. Split Travellers & Cabin controls with individual triggers and accessible popovers/sheets.
 *   7. Search CTA: brand olive with icon + label + directional arrow.
 */

import { useAppNavigate } from "@/components/app-link";
import { ArrowLeft, ArrowRight, ArrowRightLeft, Plane, Search } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AirportCombobox } from "./airport-combobox";
import { AirlineDatePicker } from "./airline-date-picker";
import { TravellersPicker } from "./travellers-picker";
import { CabinPicker } from "./cabin-picker";
import { GZA, addDaysISO, destinations, isFlightBookable, todayISO } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { type SearchCriteria } from "@/lib/booking-draft";
import {
  useBookingDraftQuery,
  useResetBookingDraftMutation,
  useFlightSearchQuery,
  useRepositories,
} from "@/lib/repositories";
import { isSkinPreviewActive } from "@/lib/skin";
import { isStudioPreviewActive, getStudioScenarioParam } from "@/lib/studio-preview";
import { cn } from "@/lib/utils";
import { catalogErrorKey } from "@/lib/commercial/types";
import ticketWorldMapImg from "@/assets/media/decorative/cards/ticket-world-map.webp";

/* -------------------------------------------------------------------------- */
/*  Types                                                                       */
/* -------------------------------------------------------------------------- */

export type FlightSearchConsoleContext = "home" | "standard";

export interface FlightSearchFormProps {
  /** Explicit console context: "home" | "standard" (default). */
  context?: FlightSearchConsoleContext;
  initial?: Partial<SearchCriteria>;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                   */
/* -------------------------------------------------------------------------- */

export function FlightSearchForm({
  initial,
  context = "standard",
}: FlightSearchFormProps) {
  const { t, lang } = useI18n();
  const { bookingDraft: draftRepo } = useRepositories();
  const { data: draftState } = useBookingDraftQuery();
  const resetDraftMutation = useResetBookingDraftMutation();
  const activeDraft = draftState?.draft ?? draftRepo.getDraft();

  const navigate = useAppNavigate();
  const ctx = context;
  const isHome = ctx === "home";

  /* ── Criteria state ── */
  const [criteria, setCriteria] = useState<SearchCriteria>(() => ({
    ...activeDraft.criteria,
    ...initial,
  }));

  const [returnDateDraft, setReturnDateDraft] = useState<string>(
    () => criteria.returnDate || "",
  );
  const [minDate, setMinDate] = useState<string>(() => criteria.departDate || "");
  const [error, setError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  useEffect(() => {
    const today = todayISO();
    const defaultDepart = addDaysISO(today, 1);
    const ret = addDaysISO(defaultDepart, 7);
    setMinDate(today);
    setCriteria((prev) => {
      const activeDepart = activeDraft.criteria.departDate || prev.departDate;
      const activeReturn = activeDraft.criteria.returnDate || prev.returnDate;
      const needsDate = !activeDepart;
      const isPast = activeDepart && activeDepart < today;
      const effectiveOrigin = initial?.origin ?? activeDraft.criteria.origin ?? prev.origin;
      const effectiveDestination = initial?.destination ?? activeDraft.criteria.destination ?? prev.destination;
      if (needsDate || isPast) {
        const nextReturn =
          prev.tripType === "round"
            ? activeReturn && activeReturn >= defaultDepart
              ? activeReturn
              : ret
            : activeReturn;
        setReturnDateDraft(nextReturn || ret);
        return {
          ...prev,
          origin: effectiveOrigin,
          destination: effectiveDestination,
          departDate: defaultDepart,
          returnDate: nextReturn,
        };
      }
      return {
        ...prev,
        origin: effectiveOrigin,
        destination: effectiveDestination,
        departDate: activeDepart,
        returnDate: activeReturn,
      };
    });
  }, [activeDraft.criteria, initial?.origin, initial?.destination]);

  // Keep route prefill authoritative if initial prop changes (e.g. client route transitions)
  useEffect(() => {
    if (initial?.origin || initial?.destination) {
      setCriteria((prev) => ({
        ...prev,
        ...(initial.origin ? { origin: initial.origin } : {}),
        ...(initial.destination ? { destination: initial.destination } : {}),
      }));
    }
  }, [initial?.origin, initial?.destination]);

  /* ── Trip type ── */
  const handleTripTypeChange = (type: "round" | "oneway") => {
    if (type === "oneway") {
      if (criteria.returnDate) setReturnDateDraft(criteria.returnDate);
      setCriteria((prev) => ({ ...prev, tripType: "oneway" }));
    } else {
      const restored = returnDateDraft || addDaysISO(criteria.departDate || todayISO(), 6);
      setCriteria((prev) => ({ ...prev, tripType: "round", returnDate: restored }));
    }
  };

  /* ── Route ── */
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

  /* ── Validation ── */
  const isDatePairInvalid =
    criteria.tripType === "round" &&
    Boolean(
      criteria.departDate && criteria.returnDate && criteria.returnDate < criteria.departDate,
    );

  const isNetworkValid =
    (criteria.origin === GZA.code || criteria.destination === GZA.code) &&
    criteria.origin !== criteria.destination;

  /* ── Effective flight queries for operational availability & service ── */
  const seatPax = criteria.adults + criteria.children;
  const { data: departFlights, isLoading: isDepartLoading, isError: isDepartError } = useFlightSearchQuery(
    criteria.origin,
    criteria.destination,
    criteria.departDate,
    undefined,
    { enabled: Boolean(criteria.departDate && isNetworkValid) },
  );
  const { data: returnFlights, isLoading: isReturnLoading, isError: isReturnError } = useFlightSearchQuery(
    criteria.destination,
    criteria.origin,
    criteria.returnDate,
    undefined,
    { enabled: Boolean(criteria.tripType === "round" && criteria.returnDate && isNetworkValid) },
  );

  const bookableDepartFlights = useMemo(
    () => (departFlights ? departFlights.filter((f) => isFlightBookable(f, { paxCount: seatPax })) : null),
    [departFlights, seatPax],
  );
  const bookableReturnFlights = useMemo(
    () => (returnFlights ? returnFlights.filter((f) => isFlightBookable(f, { paxCount: seatPax })) : null),
    [returnFlights, seatPax],
  );

  const isDepartResolving = Boolean(criteria.departDate && isNetworkValid && isDepartLoading);
  const isReturnResolving =
    criteria.tripType === "round" && Boolean(criteria.returnDate && isNetworkValid && isReturnLoading);
  const isResolving = isDepartResolving || isReturnResolving;

  const hasDepartService =
    !criteria.departDate ||
    !isNetworkValid ||
    isDepartLoading ||
    isDepartError ||
    (bookableDepartFlights ? bookableDepartFlights.length > 0 : true);

  const hasReturnService =
    criteria.tripType !== "round" ||
    !criteria.returnDate ||
    !isNetworkValid ||
    isReturnLoading ||
    isReturnError ||
    (bookableReturnFlights ? bookableReturnFlights.length > 0 : true);

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
      if (isDepartResolving) return null; // Pending is not no-service
      if (!hasDepartService) return departServiceError ?? null;
      if (c.tripType === "round") {
        if (!c.returnDate || c.returnDate < c.departDate) return t("search.errReturn");
        if (isReturnResolving) return null;
        if (!hasReturnService) return returnServiceError ?? null;
      }
      if (c.infants > c.adults) return t("search.errInfants");
      return null;
    },
    [
      t,
      isDepartResolving,
      isReturnResolving,
      hasDepartService,
      departServiceError,
      hasReturnService,
      returnServiceError,
    ],
  );

  useEffect(() => {
    if (error) setError(validate(criteria));
  }, [error, criteria, validate]);

  const isSubmitDisabled = isResolving || resetDraftMutation.isPending;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitDisabled) return;
    setSubmissionError(null);
    const problem = validate(criteria);
    setError(problem);
    if (problem) return;
    try {
      await resetDraftMutation.mutateAsync({ criteria });
    } catch (failure) {
      setSubmissionError(t(catalogErrorKey(failure)));
      return;
    }
    const isPreview = isSkinPreviewActive();
    const isStudio = isStudioPreviewActive();
    const scenario = getStudioScenarioParam();
    void navigate({
      to: "/book",
      search: {
        step: "results",
        ...(isPreview ? { skinPreview: 1 as const } : {}),
        ...(isStudio ? { studioPreview: 1 as const } : {}),
        ...(isStudio && scenario ? { scenario } : {}),
      },
    });
  };

  /* ─────────────────────────────────────────────────────────────────────────
   * Render
   * ─────────────────────────────────────────────────────────────────────────*/
  return (
    <form
      onSubmit={submit}
      aria-label={t("search.title")}
      data-flight-search-console={ctx}
      data-decorative-asset={isHome ? "home-flight-search-ticket" : undefined}
      data-testid={isHome ? "home-flight-search-ticket" : undefined}
      className={cn(
        "relative overflow-hidden rounded-2xl border transition-shadow",
        isHome
          ? "border-clay/40 shadow-[var(--shadow-lift)]"
          : "border-border shadow-[var(--shadow-soft)]",
      )}
    >
      {/* ── Red Ticket background (decorative, unmirrored) ── */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl bg-clay"
        aria-hidden="true"
      >
        <img
          {...(isHome
            ? {
                "data-decorative-asset": "home-flight-search-ticket",
                "data-testid": "home-flight-search-ticket",
              }
            : {})}
          src={ticketWorldMapImg}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="size-full select-none object-cover object-center opacity-100"
        />
      </div>

      {/* ── Content layer ── */}
      <div className="relative z-10">

        {/* ═══ Trip type header bar ═══ */}
        <fieldset className="border-0 p-0 m-0">
          <legend className="sr-only">{t("search.tripType")}</legend>
          <div className="flex items-center gap-1.5 px-3.5 pt-3.5 pb-2.5 sm:px-5 sm:pt-4">
            {(["round", "oneway"] as const).map((type) => {
              const isSelected = criteria.tripType === type;
              return (
                <button
                  key={type}
                  type="button"
                  data-slot="trip-type-button"
                  data-trip-type={type}
                  onClick={() => handleTripTypeChange(type)}
                  aria-pressed={isSelected}
                  className={cn(
                    "inline-flex items-center justify-center rounded-full px-4 text-sm font-semibold tracking-tight whitespace-nowrap select-none cursor-pointer transition-all duration-150",
                    "min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 py-2.5 md:py-1.5",
                    "active:scale-[0.99] active:transition-none motion-reduce:active:scale-100 motion-reduce:transform-none motion-reduce:transition-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-white/20 text-white/95 hover:bg-white/30 backdrop-blur-xs",
                  )}
                >
                  {t(type === "round" ? "search.roundTrip" : "search.oneWay")}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* ═══ Inner limestone console ═══ */}
        <div
          className={cn(
            "mx-2 mb-2 rounded-xl bg-card shadow-sm sm:mx-5 sm:mb-5",
            "border border-border/40 overflow-hidden",
          )}
          data-flight-search-console={`${ctx}-inner`}
        >
          {/*
           * 12-column responsive layout:
           * - Desktop (≥1280px, xl): single horizontal flex row
           * - Tablet (768-1279px, md): two rows (col-span-7/5 and col-span-4/4/4)
           * - Mobile (<768px): vertical stack (col-span-12)
           */}
          <div
            className={cn(
              "grid grid-cols-12",
              "xl:flex xl:flex-row xl:items-stretch xl:divide-x xl:divide-border/60 rtl:xl:divide-x-reverse",
            )}
          >
            {/* 1. Route zone (Origin ↔ Destination) */}
            <div
              data-zone="route"
              className={cn(
                "col-span-12 md:col-span-7 xl:col-auto xl:min-w-0",
                criteria.tripType === "oneway" ? "xl:flex-[3]" : "xl:flex-[2.6]",
                "border-b border-border/60 md:border-b md:border-e rtl:md:border-e-0 rtl:md:border-s xl:border-b-0 xl:border-e-0",
                "p-1.5 sm:p-2.5",
              )}
            >
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 sm:gap-2 min-w-0">
                <AirportCombobox
                  id="search-from"
                  value={criteria.origin}
                  onChange={(code) => setEndpoint("origin", code)}
                  airports={allAirports}
                  label={t("search.from")}
                  ariaLabel={t("search.from")}
                  variant="console"
                />

                {/* Connector with Swap */}
                <div className="flex flex-col items-center justify-center px-0.5 sm:px-1 shrink-0">
                  <Plane
                    aria-hidden="true"
                    className="size-3 text-clay/70 mb-0.5 rtl:-scale-x-100"
                  />
                  <button
                    type="button"
                    data-slot="route-swap-button"
                    onClick={swap}
                    aria-label={t("search.swap")}
                    title={t("search.swap")}
                    className={cn(
                      "inline-flex size-11 md:size-8 xl:size-9 items-center justify-center rounded-full shrink-0",
                      "min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0",
                      "border border-border/60 bg-card shadow-xs",
                      "text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                      "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                      "cursor-pointer select-none",
                    )}
                  >
                    <ArrowRightLeft aria-hidden="true" className="size-4 md:size-3.5" />
                  </button>
                </div>

                <AirportCombobox
                  id="search-to"
                  value={criteria.destination}
                  onChange={(code) => setEndpoint("destination", code)}
                  airports={allAirports}
                  label={t("search.to")}
                  ariaLabel={t("search.to")}
                  variant="console"
                />
              </div>
            </div>

            {/* 2. Dates zone */}
            <div
              data-zone="dates"
              className={cn(
                "col-span-12 md:col-span-5 xl:col-auto xl:min-w-0",
                criteria.tripType === "oneway" ? "xl:flex-[1.4]" : "xl:flex-[2.2]",
                "border-b border-border/60 md:border-b xl:border-b-0",
                "p-1.5 sm:p-2.5 flex items-center",
              )}
            >
              <AirlineDatePicker
                tripType={criteria.tripType}
                origin={criteria.origin}
                destination={criteria.destination}
                departDate={criteria.departDate}
                returnDate={criteria.returnDate}
                onDepartChange={(d) => setCriteria((prev) => ({ ...prev, departDate: d }))}
                onReturnChange={(r) => {
                  setReturnDateDraft(r);
                  setCriteria((prev) => ({ ...prev, returnDate: r }));
                }}
                minDate={minDate}
                isDatePairInvalid={isDatePairInvalid}
                departError={departServiceError}
                returnError={returnServiceError}
                variant="console"
                className="w-full"
                paxCount={seatPax}
              />
            </div>

            {/* 3. Travellers zone */}
            <div
              data-zone="travellers"
              className={cn(
                "col-span-12 md:col-span-4 xl:col-auto xl:flex-1 xl:min-w-0",
                "border-b border-border/60 md:border-b-0 md:border-e rtl:md:border-e-0 rtl:md:border-s xl:border-e-0",
                "p-1.5 sm:p-2.5 flex items-center",
              )}
            >
              <TravellersPicker
                adults={criteria.adults}
                children={criteria.children}
                infants={criteria.infants}
                onAdultsChange={(n) =>
                  setCriteria((prev) => {
                    const next = { ...prev, adults: n };
                    if (next.infants > n) next.infants = n;
                    return next;
                  })
                }
                onChildrenChange={(n) => setCriteria((prev) => ({ ...prev, children: n }))}
                onInfantsChange={(n) => setCriteria((prev) => ({ ...prev, infants: n }))}
                variant="console"
              />
            </div>

            {/* 4. Cabin zone */}
            <div
              data-zone="cabin"
              className={cn(
                "col-span-12 md:col-span-4 xl:col-auto xl:flex-1 xl:min-w-0",
                "border-b border-border/60 md:border-b-0 md:border-e rtl:md:border-e-0 rtl:md:border-s xl:border-e-0",
                "p-1.5 sm:p-2.5 flex items-center",
              )}
            >
              <CabinPicker
                cabin={criteria.cabin}
                onCabinChange={(id) => setCriteria((prev) => ({ ...prev, cabin: id }))}
                variant="console"
              />
            </div>

            {/* 5. Search CTA zone */}
            <div
              data-zone="search-action"
              className={cn(
                "col-span-12 md:col-span-4 xl:col-auto xl:shrink-0",
                "p-1.5 sm:p-2.5 flex items-center",
              )}
            >
              <button
                type="submit"
                disabled={isSubmitDisabled}
                aria-disabled={isSubmitDisabled}
                className={cn(
                  "inline-flex items-center justify-center gap-2",
                  "h-12 w-full xl:w-auto xl:h-full xl:min-h-[58px] xl:px-6 rounded-xl",
                  "bg-primary text-primary-foreground font-semibold text-sm",
                  "shadow-xs hover:bg-primary/90 active:scale-[0.99]",
                  "transition-all duration-150 motion-reduce:transition-none motion-reduce:active:scale-100",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  "cursor-pointer select-none whitespace-nowrap",
                  "min-h-[44px]",
                  "disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none",
                )}
              >
                <Search aria-hidden="true" className="size-4 shrink-0" />
                <span>{t("search.submit")}</span>
                {lang === "ar" ? (
                  <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
                ) : (
                  <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
                )}
              </button>
            </div>
          </div>

          {/* ─── Validation Banner (high contrast over red shell) ─── */}
          {error || submissionError ? (
            <div
              role="alert"
              aria-live="polite"
              className={cn(
                "mx-2 my-2 sm:mx-5 sm:my-3.5",
                "flex items-center gap-2 rounded-lg border border-destructive/40 bg-card/95 px-3.5 py-2.5 text-sm font-medium text-destructive shadow-xs",
              )}
            >
              <span>{error ?? submissionError}</span>
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}
