import { useAppNavigate } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlightSearchForm } from "@/components/flight-search-form";
import { FlightOption } from "@/components/booking/flight-option";
import { FareStep } from "@/components/booking/fare-step";
import { SeatSelectionWorkspace } from "@/components/booking/seat-selection-workspace";
import { ExtrasStep } from "@/components/booking/extras-step";
import { ReviewStep } from "@/components/booking/review-step";
import { MobileBookingBar } from "@/components/booking/mobile-booking-bar";
import { PassengerDobPicker } from "@/components/booking/passenger-dob-picker";
import { SavedTravellerPicker } from "@/components/booking/saved-traveller-picker";
import { RadioGroup } from "@/components/ui/radio-group";
import { PriceSummary } from "@/components/booking/price-summary";
import { Stepper, bookingSteps, type BookingStep } from "@/components/booking/stepper";
import {
  btnClass,
  Code,
  Container,
  EmptyState,
  Eyebrow,
  Field,
  Input,
  Notice,
  Panel,
  Pill,
} from "@/components/kit";
import { GazaSurface } from "@/design/surfaces";
import {
  searchFlights,
  type Flight,
} from "@/lib/data";
import { dateLong, money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import {
  bookingTotal,
  emptyPassenger,
  passengersFor,
  paxCount,
  type Passenger,
  type Draft,
  useStore,
} from "@/lib/store";
import { cn } from "@/lib/utils";

type BookSearch = {
  step?: BookingStep;
  skinPreview?: "1" | 1;
};

export const Route = createFileRoute("/{-$locale}/book")({
  validateSearch: (search: Record<string, unknown>): BookSearch => {
    const out: BookSearch = {};
    const rawStep = search["step"];
    if (typeof rawStep === "string" && (bookingSteps as readonly string[]).includes(rawStep)) {
      out.step = rawStep as BookingStep;
    }
    const rawPreview = search["skinPreview"];
    if (rawPreview === "1" || rawPreview === 1 || rawPreview === '"1"') {
      out.skinPreview = 1;
    }
    return out;
  },
  head: () => ({
    meta: [
      { title: "Book a flight — Palestinian Airlines from Gaza (GZA)" },
      {
        name: "description",
        content:
          "Book Palestinian Airlines flights from Gaza International Airport: choose your flight and fare, add passengers, seats and baggage, then confirm.",
      },
      { property: "og:title", content: "Book a flight from Gaza — Palestinian Airlines" },
      { property: "og:description", content: "Flight search, fares, seat selection and booking confirmation." },
    ],
  }),
  component: BookPage,
});

const stepRanks: Record<BookingStep, number> = {
  search: 0,
  results: 1,
  fare: 2,
  passengers: 3,
  seats: 4,
  extras: 5,
  review: 6,
  confirmation: 7,
};

function isFlightValidForCriteria(
  flight: Flight | null | undefined,
  origin: string,
  destination: string,
  date: string,
): flight is Flight {
  if (!flight) return false;
  return (
    flight.originCode?.toUpperCase() === origin.toUpperCase() &&
    flight.destinationCode?.toUpperCase() === destination.toUpperCase() &&
    flight.date === date
  );
}

function calculateMaxStep(draft: Draft, paxList: Passenger[]): BookingStep {
  if (!draft.criteria.origin || !draft.criteria.destination || !draft.criteria.departDate) {
    return "search";
  }
  const outboundValid = isFlightValidForCriteria(
    draft.outbound,
    draft.criteria.origin,
    draft.criteria.destination,
    draft.criteria.departDate,
  );
  const inboundValid =
    draft.criteria.tripType !== "round"
      ? true
      : isFlightValidForCriteria(
          draft.inbound,
          draft.criteria.destination,
          draft.criteria.origin,
          draft.criteria.returnDate,
        );

  const hasFlights = outboundValid && inboundValid;
  if (!hasFlights) return "results";
  if (!draft.fareId) return "fare";

  const arePassengersValid =
    paxList.length > 0 &&
    paxList.every((p) => Boolean(p.firstName.trim() && p.lastName.trim() && p.dob)) &&
    /.+@.+\..+/.test(draft.contact.email.trim());
  if (!arePassengersValid) return "passengers";

  return "review";
}

function BookPage() {
  const { t, lang } = useI18n();
  const navigate = useAppNavigate();
  const search = Route.useSearch();
  const { ready, draft, setDraft, addBooking, account, travelers } = useStore();

  const [activePax, setActivePax] = useState(0);
  const [seatLeg, setSeatLeg] = useState<"out" | "in">("out");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const paxList = draft.passengers.length
    ? draft.passengers
    : passengersFor(draft.criteria);
  const pax = paxList.length;
  // Infants travel on an adult's lap, so they are never allocated a seat.
  const seatable = paxList.flatMap((p, i) => (p.type === "infant" ? [] : [i]));
  const paxName = (i: number) => {
    const p = paxList[i];
    return p && (p.firstName || p.lastName)
      ? `${p.firstName} ${p.lastName}`.trim()
      : `${t("book.passenger")} ${i + 1}`;
  };

  const outboundOptions = useMemo(
    () => searchFlights(draft.criteria.origin, draft.criteria.destination, draft.criteria.departDate),
    [draft.criteria],
  );
  const inboundOptions = useMemo(
    () =>
      draft.criteria.tripType === "round"
        ? searchFlights(draft.criteria.destination, draft.criteria.origin, draft.criteria.returnDate)
        : [],
    [draft.criteria],
  );

  const isOutboundSelected = Boolean(
    ready &&
      draft.outbound &&
      isFlightValidForCriteria(
        draft.outbound,
        draft.criteria.origin,
        draft.criteria.destination,
        draft.criteria.departDate,
      ) &&
      outboundOptions.some((f) => f.id === draft.outbound?.id),
  );
  const isInboundSelected =
    Boolean(ready) &&
    (draft.criteria.tripType !== "round" ||
      Boolean(
        draft.inbound &&
          isFlightValidForCriteria(
            draft.inbound,
            draft.criteria.destination,
            draft.criteria.origin,
            draft.criteria.returnDate,
          ) &&
          inboundOptions.some((f) => f.id === draft.inbound?.id),
      ));

  // Defensive guard: clear stale flight selections that do not match effective criteria
  useEffect(() => {
    if (!ready) return;
    const staleOut =
      draft.outbound &&
      (!isFlightValidForCriteria(
        draft.outbound,
        draft.criteria.origin,
        draft.criteria.destination,
        draft.criteria.departDate,
      ) ||
        !outboundOptions.some((f) => f.id === draft.outbound?.id));

    const staleIn =
      draft.inbound &&
      (draft.criteria.tripType !== "round" ||
        !isFlightValidForCriteria(
          draft.inbound,
          draft.criteria.destination,
          draft.criteria.origin,
          draft.criteria.returnDate,
        ) ||
        !inboundOptions.some((f) => f.id === draft.inbound?.id));

    if (staleOut || staleIn) {
      setDraft((prev) => {
        const seats = { ...prev.seats };
        if (staleOut) {
          Object.keys(seats).forEach((k) => {
            if (k.startsWith("out-")) delete seats[k];
          });
        }
        if (staleIn) {
          Object.keys(seats).forEach((k) => {
            if (k.startsWith("in-")) delete seats[k];
          });
        }
        return {
          ...prev,
          outbound: staleOut ? null : prev.outbound,
          inbound: staleIn ? null : prev.inbound,
          seats,
        };
      });
    }
  }, [
    ready,
    draft.outbound,
    draft.inbound,
    draft.criteria.origin,
    draft.criteria.destination,
    draft.criteria.departDate,
    draft.criteria.returnDate,
    draft.criteria.tripType,
    outboundOptions,
    inboundOptions,
    setDraft,
  ]);

  const maxStep = useMemo(() => calculateMaxStep(draft, paxList), [draft, paxList]);

  // Determine current active milestone: URL param takes precedence if within maxStep
  const requestedStep = search.step;
  let currentStep: BookingStep;

  if (requestedStep) {
    if (!ready) {
      // Prior to hydration readiness, permit requested step up to results only
      // Later steps (fare/seats/review) await validated draft state
      currentStep = stepRanks[requestedStep] <= stepRanks["results"] ? requestedStep : "results";
    } else if (stepRanks[requestedStep] <= stepRanks[maxStep]) {
      currentStep = requestedStep;
    } else {
      // Clamped if user attempted an invalid forward jump
      currentStep = maxStep;
    }
  } else {
    currentStep = draft.entry === "results" ? "results" : "search";
  }

  const isPreview = search.skinPreview === "1" || search.skinPreview === 1;

  // Repair/clamp URL search parameter without trapping the user
  useEffect(() => {
    if (!ready) return;
    if (requestedStep && stepRanks[requestedStep] > stepRanks[maxStep]) {
      void navigate({
        to: "/book",
        search: {
          step: maxStep,
          ...(isPreview ? { skinPreview: 1 as const } : {}),
        },
        replace: true,
      });
    } else if (!requestedStep && draft.entry === "results") {
      void navigate({
        to: "/book",
        search: {
          step: "results",
          ...(isPreview ? { skinPreview: 1 as const } : {}),
        },
        replace: true,
      });
    }
  }, [ready, requestedStep, maxStep, draft.entry, isPreview, navigate]);

  // Manage focus on step transition
  useEffect(() => {
    headingRef.current?.focus();
  }, [currentStep]);

  const goToStep = (next: BookingStep, replace = false) => {
    setFieldErrors({});
    void navigate({
      to: "/book",
      search: {
        step: next,
        ...(isPreview ? { skinPreview: 1 as const } : {}),
      },
      replace,
    });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const selectSeat = (position: number, seat: string) => {
    const paxIndex = seatable[position];
    if (paxIndex === undefined) return;
    const key = `${seatLeg}-${paxIndex}`;
    setDraft((prev) => {
      const seats = { ...prev.seats };
      if (seats[key] === seat) delete seats[key];
      else seats[key] = seat;
      return { ...prev, seats };
    });
    if (position < seatable.length - 1) setActivePax(position + 1);
  };

  const seatAssignments = (leg: "out" | "in"): Record<number, string> => {
    const result: Record<number, string> = {};
    seatable.forEach((paxIndex, position) => {
      const seat = draft.seats[`${leg}-${paxIndex}`];
      if (seat) result[position] = seat;
    });
    return result;
  };

  const passengerLabels = seatable.map((i) => paxName(i));

  const validatePassengers = (): boolean => {
    const errors: Record<string, string> = {};
    let firstErrorId = "";

    paxList.forEach((p, i) => {
      if (!p.firstName.trim()) {
        errors[`fn-${i}`] = t("book.errFirstName");
        if (!firstErrorId) firstErrorId = `fn-${i}`;
      }
      if (!p.lastName.trim()) {
        errors[`ln-${i}`] = t("book.errLastName");
        if (!firstErrorId) firstErrorId = `ln-${i}`;
      }
      if (!p.dob) {
        errors[`dob-${i}`] = t("book.errDob");
        if (!firstErrorId) firstErrorId = `dob-${i}`;
      }
    });

    if (!draft.contact.email.trim()) {
      errors["contact-email"] = t("book.errEmail");
      if (!firstErrorId) firstErrorId = "contact-email";
    } else if (!/.+@.+\..+/.test(draft.contact.email.trim())) {
      errors["contact-email"] = t("book.errEmailValid");
      if (!firstErrorId) firstErrorId = "contact-email";
    }

    setFieldErrors(errors);

    if (firstErrorId) {
      setTimeout(() => {
        document.getElementById(firstErrorId)?.focus();
      }, 50);
      return false;
    }
    return true;
  };

  const confirm = () => {
    if (!draft.outbound) return;
    const totals = bookingTotal(draft);
    const created = addBooking({
      criteria: draft.criteria,
      outbound: draft.outbound,
      inbound: draft.inbound,
      fareId: draft.fareId,
      passengers: paxList,
      seats: draft.seats,
      extras: draft.extras,
      contact: draft.contact,
      total: totals.total,
    });
    void navigate({
      to: "/booking-confirmation/$ref",
      params: { ref: created.ref },
      ...(isPreview ? { search: { skinPreview: 1 as const } } : {}),
    });
  };

  const totals = bookingTotal(draft);

  /* -------------------------------- search -------------------------------- */
  if (currentStep === "search") {
    return (
      <Container className="py-10 sm:py-14">
        <Eyebrow>{t("home.kicker")}</Eyebrow>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mt-2 text-3xl font-bold sm:text-4xl outline-none"
        >
          {t("book.title")}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">{t("search.title")}</p>
        <div className="mt-6">
          <FlightSearchForm />
        </div>
        <div className="mt-6">
          <Notice>{t("book.guestNote")}</Notice>
        </div>
      </Container>
    );
  }

  return (
    <>
      <Stepper current={currentStep} maxStep={maxStep} onStepClick={(s) => goToStep(s)} />
      <Container className="py-8 pb-28 lg:pb-12">
        {currentStep === "seats" ? (
          <SeatSelectionWorkspace
            draft={draft}
            activePassenger={activePax}
            onActivePassengerChange={setActivePax}
            seatLeg={seatLeg}
            onSeatLegChange={setSeatLeg}
            onSelectSeat={selectSeat}
            seatable={seatable}
            passengerLabels={passengerLabels}
            seatAssignments={seatAssignments}
            totals={totals}
            seatPreference={account?.seatPreference ?? "none"}
            headingRef={headingRef}
            stepNav={
              <StepNav
                onBack={() => goToStep("passengers")}
                onNext={() => goToStep("extras")}
                secondary={
                  <button
                    type="button"
                    onClick={() => goToStep("extras")}
                    className={btnClass("ghost", "md")}
                  >
                    {t("book.seatSkip")}
                  </button>
                }
              />
            }
          />
        ) : currentStep === "review" ? (
          <div className="max-w-4xl mx-auto">
            <ReviewStep
              draft={draft}
              paxList={paxList}
              totals={totals}
              onGoToStep={(step) => goToStep(step)}
              onConfirm={confirm}
              headingRef={headingRef}
            />
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1.7fr_1fr]">
            <div className="min-w-0">
              {/* ------------------------------ results ------------------------------ */}
              {currentStep === "results" ? (
                <section aria-labelledby="results-title">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <Eyebrow>{t("step.results")}</Eyebrow>
                      <h1
                        id="results-title"
                        ref={headingRef}
                        tabIndex={-1}
                        className="mt-2 text-2xl font-bold sm:text-3xl outline-none"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Code dir="ltr">{draft.criteria.origin}</Code>
                          <ArrowRight aria-hidden="true" className="size-5 rtl:rotate-180 text-muted-foreground shrink-0" />
                          <Code dir="ltr">{draft.criteria.destination}</Code>
                        </span>
                      </h1>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {dateLong(draft.criteria.departDate, lang)} ·{" "}
                        {paxCount(draft.criteria) === 1
                          ? t("search.passengerCountOne")
                          : t("search.passengerCount", { n: paxCount(draft.criteria) })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => goToStep("search")}
                      className={btnClass("outline", "sm")}
                    >
                      {t("book.changeSearch")}
                    </button>
                  </div>

                  <h2
                    id="outbound-flights-heading"
                    className="mt-8 text-sm font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    {t("book.outbound")}
                  </h2>
                  <div className="mt-3">
                    {outboundOptions.length === 0 ? (
                      <EmptyState
                        title={t("book.noResults")}
                        description={t("book.noResultsSub")}
                        action={
                          <button
                            type="button"
                            onClick={() => goToStep("search")}
                            className={btnClass("primary", "sm")}
                          >
                            {t("book.changeSearch")}
                          </button>
                        }
                      />
                    ) : (
                      <RadioGroup
                        dir={lang === "ar" ? "rtl" : "ltr"}
                        value={isOutboundSelected ? (draft.outbound?.id ?? "") : ""}
                        onValueChange={(flightId) => {
                          const flight = outboundOptions.find((f) => f.id === flightId);
                          if (flight) setDraft((prev) => ({ ...prev, outbound: flight }));
                        }}
                        aria-labelledby="outbound-flights-heading"
                        className="grid gap-3"
                      >
                        {outboundOptions.map((flight) => (
                          <FlightOption
                            key={flight.id}
                            flight={flight}
                            cabin={draft.criteria.cabin}
                          />
                        ))}
                      </RadioGroup>
                    )}
                  </div>

                  {draft.criteria.tripType === "round" ? (
                    <>
                      <h2
                        id="inbound-flights-heading"
                        className="mt-10 text-sm font-bold uppercase tracking-wider text-muted-foreground"
                      >
                        {t("book.inbound")} · {dateLong(draft.criteria.returnDate, lang)}
                      </h2>
                      <div className="mt-3">
                        {inboundOptions.length === 0 ? (
                          <EmptyState
                            title={t("book.noResults")}
                            description={t("book.noResultsSub")}
                            action={
                              <button
                                type="button"
                                onClick={() => goToStep("search")}
                                className={btnClass("primary", "sm")}
                              >
                                {t("book.changeSearch")}
                              </button>
                            }
                          />
                        ) : (
                          <RadioGroup
                            dir={lang === "ar" ? "rtl" : "ltr"}
                            value={isInboundSelected && draft.criteria.tripType === "round" ? (draft.inbound?.id ?? "") : ""}
                            onValueChange={(flightId) => {
                              const flight = inboundOptions.find((f) => f.id === flightId);
                              if (flight) setDraft((prev) => ({ ...prev, inbound: flight }));
                            }}
                            aria-labelledby="inbound-flights-heading"
                            className="grid gap-3"
                          >
                            {inboundOptions.map((flight) => (
                              <FlightOption
                                key={flight.id}
                                flight={flight}
                                cabin={draft.criteria.cabin}
                              />
                            ))}
                          </RadioGroup>
                        )}
                      </div>
                    </>
                  ) : null}

                  <StepNav
                    onBack={() => goToStep("search")}
                    onNext={() => goToStep("fare")}
                    nextDisabled={!isOutboundSelected || !isInboundSelected}
                  />
                </section>
              ) : null}

              {/* -------------------------------- fare -------------------------------- */}
              {currentStep === "fare" ? (
                <FareStep
                  draft={draft}
                  onSelectFare={(fareId) => setDraft((prev) => ({ ...prev, fareId }))}
                  onBack={() => goToStep("results")}
                  onNext={() => goToStep("passengers")}
                  headingRef={headingRef}
                  stepNav={
                    <StepNav
                      onBack={() => goToStep("results")}
                      onNext={() => goToStep("passengers")}
                    />
                  }
                />
              ) : null}

              {/* ----------------------------- passengers ---------------------------- */}
              {currentStep === "passengers" ? (
                <section aria-labelledby="pax-title">
                  <Eyebrow>{t("step.passengers")}</Eyebrow>
                  <h1
                    id="pax-title"
                    ref={headingRef}
                    tabIndex={-1}
                    className="mt-2 text-2xl font-bold sm:text-3xl outline-none"
                  >
                    {t("book.paxTitle")}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">{t("book.paxSub")}</p>

                  {Object.keys(fieldErrors).length > 0 ? (
                    <p
                      className="mt-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
                      role="alert"
                    >
                      {t("book.required")}
                    </p>
                  ) : null}

                  <div className="mt-6 space-y-4">
                    {paxList.map((p, i) => {
                      const update = (patch: Partial<typeof p>) =>
                        setDraft((prev) => {
                          const passengers = prev.passengers.length
                            ? [...prev.passengers]
                            : passengersFor(prev.criteria);
                          while (passengers.length < pax) passengers.push(emptyPassenger());
                          passengers[i] = { ...(passengers[i] ?? emptyPassenger()), ...patch };
                          return { ...prev, passengers };
                        });
                      const isInfant = p.type === "infant";
                      return (
                        <GazaSurface family="form-sheet" key={i} className="p-5 sm:p-6">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                              {t("book.pax", { n: i + 1 })}
                            </h2>
                            <Pill tone="neutral">
                              {t(
                                p.type === "infant"
                                  ? "book.infant"
                                  : p.type === "child"
                                    ? "book.child"
                                    : "book.adult",
                              )}
                            </Pill>
                          </div>
                          {isInfant ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {t("book.onLapWith", { name: paxName(p.withAdult ?? 0) })} · {t("book.noSeatInfant")}
                            </p>
                          ) : null}
                          {account && !isInfant ? (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {i === 0 ? (
                                <button
                                  type="button"
                                  className={btnClass("outline", "sm")}
                                  onClick={() => {
                                    update({ firstName: account.firstName, lastName: account.lastName });
                                    setFieldErrors((prev) => {
                                      const next = { ...prev };
                                      if (account.firstName) delete next[`fn-${i}`];
                                      if (account.lastName) delete next[`ln-${i}`];
                                      return next;
                                    });
                                  }}
                                >
                                  {t("book.useProfile")}
                                </button>
                              ) : null}
                              {travelers.length > 0 ? (
                                <SavedTravellerPicker
                                  travelers={travelers}
                                  onSelectTraveler={(traveler) => {
                                    update({
                                      firstName: traveler.firstName,
                                      lastName: traveler.lastName,
                                      dob: traveler.dob,
                                      nationality: traveler.nationality,
                                      document: traveler.document,
                                    });
                                    setFieldErrors((prev) => {
                                      const next = { ...prev };
                                      if (traveler.firstName) delete next[`fn-${i}`];
                                      if (traveler.lastName) delete next[`ln-${i}`];
                                      if (traveler.dob) delete next[`dob-${i}`];
                                      return next;
                                    });
                                  }}
                                />
                              ) : null}
                            </div>
                          ) : null}
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <Field
                              label={t("book.firstName")}
                              htmlFor={`fn-${i}`}
                              error={fieldErrors[`fn-${i}`]}
                              errorId={`fn-${i}-error`}
                            >
                              <Input
                                id={`fn-${i}`}
                                value={p.firstName}
                                autoComplete="given-name"
                                aria-invalid={Boolean(fieldErrors[`fn-${i}`])}
                                aria-describedby={fieldErrors[`fn-${i}`] ? `fn-${i}-error` : undefined}
                                onChange={(e) => {
                                  update({ firstName: e.target.value });
                                  if (fieldErrors[`fn-${i}`]) {
                                    setFieldErrors((prev) => {
                                      const next = { ...prev };
                                      delete next[`fn-${i}`];
                                      return next;
                                    });
                                  }
                                }}
                                required
                              />
                            </Field>
                            <Field
                              label={t("book.lastName")}
                              htmlFor={`ln-${i}`}
                              error={fieldErrors[`ln-${i}`]}
                              errorId={`ln-${i}-error`}
                            >
                              <Input
                                id={`ln-${i}`}
                                value={p.lastName}
                                autoComplete="family-name"
                                aria-invalid={Boolean(fieldErrors[`ln-${i}`])}
                                aria-describedby={fieldErrors[`ln-${i}`] ? `ln-${i}-error` : undefined}
                                onChange={(e) => {
                                  update({ lastName: e.target.value });
                                  if (fieldErrors[`ln-${i}`]) {
                                    setFieldErrors((prev) => {
                                      const next = { ...prev };
                                      delete next[`ln-${i}`];
                                      return next;
                                    });
                                  }
                                }}
                                required
                              />
                            </Field>
                            <Field
                              label={t("book.dob")}
                              htmlFor={`dob-${i}`}
                              error={fieldErrors[`dob-${i}`]}
                              errorId={`dob-${i}-error`}
                            >
                              <PassengerDobPicker
                                id={`dob-${i}`}
                                value={p.dob}
                                passengerType={p.type}
                                ariaInvalid={Boolean(fieldErrors[`dob-${i}`])}
                                ariaDescribedBy={fieldErrors[`dob-${i}`] ? `dob-${i}-error` : undefined}
                                onChange={(val) => {
                                  update({ dob: val });
                                  if (fieldErrors[`dob-${i}`]) {
                                    setFieldErrors((prev) => {
                                      const next = { ...prev };
                                      delete next[`dob-${i}`];
                                      return next;
                                    });
                                  }
                                }}
                                required
                              />
                            </Field>
                            <Field label={t("book.nationality")} htmlFor={`nat-${i}`}>
                              <Input
                                id={`nat-${i}`}
                                value={p.nationality}
                                onChange={(e) => update({ nationality: e.target.value })}
                              />
                            </Field>
                            <Field
                              label={t("book.docNumber")}
                              htmlFor={`doc-${i}`}
                              hint={t("common.optional")}
                              className="sm:col-span-2"
                            >
                              <Input
                                id={`doc-${i}`}
                                value={p.document}
                                onChange={(e) => update({ document: e.target.value })}
                              />
                            </Field>
                          </div>
                        </GazaSurface>
                      );
                    })}

                    <GazaSurface family="form-sheet" className="p-5 sm:p-6">
                      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                        {t("book.contact")}
                      </h2>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Field
                          label={t("book.email")}
                          htmlFor="contact-email"
                          error={fieldErrors["contact-email"]}
                          errorId="contact-email-error"
                        >
                          <Input
                            id="contact-email"
                            type="email"
                            autoComplete="email"
                            dir="ltr"
                            className="code-id"
                            value={draft.contact.email}
                            aria-invalid={Boolean(fieldErrors["contact-email"])}
                            aria-describedby={fieldErrors["contact-email"] ? "contact-email-error" : undefined}
                            onChange={(e) => {
                              setDraft((prev) => ({
                                ...prev,
                                contact: { ...prev.contact, email: e.target.value },
                              }));
                              if (fieldErrors["contact-email"]) {
                                setFieldErrors((prev) => {
                                  const next = { ...prev };
                                  delete next["contact-email"];
                                  return next;
                                });
                              }
                            }}
                            required
                          />
                        </Field>
                        <Field label={t("book.phone")} htmlFor="contact-phone">
                          <Input
                            id="contact-phone"
                            type="tel"
                            autoComplete="tel"
                            dir="ltr"
                            className="code-id"
                            value={draft.contact.phone}
                            onChange={(e) =>
                              setDraft((prev) => ({
                                ...prev,
                                contact: { ...prev.contact, phone: e.target.value },
                              }))
                            }
                          />
                        </Field>
                      </div>
                      <div className="mt-4">
                        <Notice>{t("book.guestNote")}</Notice>
                      </div>
                    </GazaSurface>
                  </div>

                  <StepNav
                    onBack={() => goToStep("fare")}
                    onNext={() => {
                      if (validatePassengers()) goToStep("seats");
                    }}
                  />
                </section>
              ) : null}

              {/* -------------------------------- extras ------------------------------ */}
              {currentStep === "extras" ? (
                <ExtrasStep
                  draft={draft}
                  onUpdateDraft={setDraft}
                  paxList={paxList}
                  headingRef={headingRef}
                  stepNav={
                    <StepNav
                      onBack={() => goToStep("seats")}
                      onNext={() => goToStep("review")}
                    />
                  }
                />
              ) : null}
            </div>

            {/* Persistent sticky PriceSummary docket on larger screens */}
            <div className="hidden lg:block">
              <PriceSummary draft={draft} />
            </div>
          </div>
        )}
      </Container>

      {/* Mobile Booking Bar with Instant Total and Sheet Drawer */}
      <MobileBookingBar draft={draft} totals={totals} />
    </>
  );
}

function StepNav({
  onBack,
  onNext,
  nextDisabled,
  secondary,
}: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  secondary?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-8 flex flex-col-reverse items-stretch gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
      <button type="button" onClick={onBack} className={btnClass("outline", "md")}>
        <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
        {t("book.back")}
      </button>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        {secondary}
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className={btnClass("primary", "md")}
        >
          {t("book.continue")}
          <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
        </button>
      </div>
    </div>
  );
}
