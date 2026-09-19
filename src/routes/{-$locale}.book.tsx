import { useAppNavigate } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Baby, Check, Luggage, Ticket } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlightSearchForm } from "@/components/flight-search-form";
import { FlightOption } from "@/components/booking/flight-option";
import { PriceSummary } from "@/components/booking/price-summary";
import { SeatMap } from "@/components/booking/seat-map";
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
  Select,
} from "@/components/kit";
import {
  EXTRA_BAG_PRICE,
  airportByCode,
  assistanceOptions,
  farePrice,
  fares,
  mealOptions,
  searchFlights,
  suggestSeat,
  todayISO,
  type Flight,
} from "@/lib/data";
import { dateLong, money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import {
  bookingTotal,
  emptyPassenger,
  extrasFor,
  passengersFor,
  paxCount,
  totalExtraBags,
  type PaxExtras,
  type Passenger,
  type Draft,
  useStore,
} from "@/lib/store";
import { cn } from "@/lib/utils";

type BookSearch = {
  step?: BookingStep;
};

export const Route = createFileRoute("/{-$locale}/book")({
  validateSearch: (search: Record<string, unknown>): BookSearch => {
    const rawStep = search["step"];
    if (typeof rawStep === "string" && (bookingSteps as readonly string[]).includes(rawStep)) {
      return { step: rawStep as BookingStep };
    }
    return {};
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

function calculateMaxStep(draft: Draft, paxList: Passenger[]): BookingStep {
  if (!draft.criteria.origin || !draft.criteria.destination || !draft.criteria.departDate) {
    return "search";
  }
  const hasFlights = Boolean(
    draft.outbound && (draft.criteria.tripType !== "round" || draft.inbound),
  );
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
  const { draft, setDraft, addBooking, account, travelers } = useStore();

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

  const maxStep = useMemo(() => calculateMaxStep(draft, paxList), [draft, paxList]);

  // Determine current active milestone: URL param takes precedence if within maxStep
  const requestedStep = search.step;
  let currentStep: BookingStep;

  if (requestedStep) {
    if (stepRanks[requestedStep] <= stepRanks[maxStep]) {
      currentStep = requestedStep;
    } else {
      // Clamped if user attempted an invalid forward jump
      currentStep = maxStep;
    }
  } else {
    currentStep = draft.entry === "results" ? "results" : "search";
  }

  // Repair/clamp URL search parameter without trapping the user
  useEffect(() => {
    if (requestedStep && stepRanks[requestedStep] > stepRanks[maxStep]) {
      void navigate({
        to: "/book",
        search: { step: maxStep },
        replace: true,
      });
    } else if (!requestedStep && draft.entry === "results") {
      void navigate({
        to: "/book",
        search: { step: "results" },
        replace: true,
      });
    }
  }, [requestedStep, maxStep, draft.entry, navigate]);

  // Manage focus on step transition
  useEffect(() => {
    headingRef.current?.focus();
  }, [currentStep]);

  const goToStep = (next: BookingStep, replace = false) => {
    setFieldErrors({});
    void navigate({
      to: "/book",
      search: { step: next },
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
    void navigate({ to: "/booking-confirmation/$ref", params: { ref: created.ref } });
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
      <Container className="py-8">
        <div className="grid gap-8 lg:grid-cols-[1.7fr_1fr]">
          <div className="min-w-0">
            {/* Compact trip summary for mobile screens; desktop displays persistent sticky docket. */}
            <details className="surface mb-6 p-4 rounded-xl border border-border lg:hidden">
              <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold select-none">
                <span className="flex items-center gap-2">
                  <span>{t("book.summaryToggle")}</span>
                  {draft.outbound ? (
                    <span className="text-xs text-muted-foreground font-normal">
                      ({draft.criteria.origin} → {draft.criteria.destination})
                    </span>
                  ) : null}
                </span>
                <span className="text-base font-bold text-primary">{money(totals.total, lang)}</span>
              </summary>
              <div className="mt-3 pt-3 border-t border-border/60">
                <PriceSummary draft={draft} compact />
              </div>
            </details>

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
                      <Code>{draft.criteria.origin}</Code> → <Code>{draft.criteria.destination}</Code>
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

                <h2 className="mt-8 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  {t("book.outbound")}
                </h2>
                <div className="mt-3 space-y-3">
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
                    outboundOptions.map((flight) => (
                      <FlightOption
                        key={flight.id}
                        flight={flight}
                        cabin={draft.criteria.cabin}
                        selected={draft.outbound?.id === flight.id}
                        onSelect={() => setDraft((prev) => ({ ...prev, outbound: flight }))}
                      />
                    ))
                  )}
                </div>

                {draft.criteria.tripType === "round" ? (
                  <>
                    <h2 className="mt-10 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                      {t("book.inbound")} · {dateLong(draft.criteria.returnDate, lang)}
                    </h2>
                    <div className="mt-3 space-y-3">
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
                        inboundOptions.map((flight) => (
                          <FlightOption
                            key={flight.id}
                            flight={flight}
                            cabin={draft.criteria.cabin}
                            selected={draft.inbound?.id === flight.id}
                            onSelect={() => setDraft((prev) => ({ ...prev, inbound: flight }))}
                          />
                        ))
                      )}
                    </div>
                  </>
                ) : null}

                <StepNav
                  onBack={() => goToStep("search")}
                  onNext={() => goToStep("fare")}
                  nextDisabled={!draft.outbound || (draft.criteria.tripType === "round" && !draft.inbound)}
                />
              </section>
            ) : null}

            {/* -------------------------------- fare -------------------------------- */}
            {currentStep === "fare" ? (
              <section aria-labelledby="fare-title">
                <Eyebrow>{t("step.fare")}</Eyebrow>
                <h1
                  id="fare-title"
                  ref={headingRef}
                  tabIndex={-1}
                  className="mt-2 text-2xl font-bold sm:text-3xl outline-none"
                >
                  {t("book.fareTitle")}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("book.fareSub")}</p>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  {fares.map((fare) => {
                    const price = draft.outbound
                      ? farePrice(draft.outbound.basePrice, fare.id, draft.criteria.cabin)
                      : 0;
                    const selected = draft.fareId === fare.id;
                    return (
                      <button
                        key={fare.id}
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, fareId: fare.id }))}
                        aria-pressed={selected}
                        className={cn(
                          "flex flex-col rounded-xl border bg-card p-5 text-start transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                          selected
                            ? "border-primary ring-1 ring-primary/40 shadow-xs"
                            : "border-border hover:border-primary/50",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h2 className="text-lg font-bold">{pick(lang, fare.name)}</h2>
                          {fare.highlight ? <Pill tone="clay">{t("common.learnMore")}</Pill> : null}
                        </div>
                        <p className="mt-3 text-2xl font-bold">{money(price, lang)}</p>
                        <p className="text-xs text-muted-foreground">{t("book.perPassenger")}</p>
                        <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                          <li className="flex gap-2">
                            <Luggage aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                            <span className="numeral">
                              {fare.checkedBags === 0
                                ? t("book.cabinBagOnly")
                                : `${fare.checkedBags} × 23 kg`}
                            </span>
                          </li>
                          <li className="flex gap-2">
                            <Ticket aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                            {pick(lang, fare.seatSelection)}
                          </li>
                          <li className="flex gap-2">
                            <ArrowRight
                              aria-hidden="true"
                              className="mt-0.5 size-4 shrink-0 text-brand-deep rtl:rotate-180"
                            />
                            {pick(lang, fare.changes)}
                          </li>
                          <li className="flex gap-2">
                            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                            {pick(lang, fare.refund)}
                          </li>
                        </ul>
                        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                          {pick(lang, fare.flexibility)}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <StepNav onBack={() => goToStep("results")} onNext={() => goToStep("passengers")} />
              </section>
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
                      <Panel key={i}>
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
                          <div className="mt-3 flex flex-wrap gap-2">
                            {i === 0 ? (
                              <button
                                type="button"
                                className={btnClass("outline", "sm")}
                                onClick={() => {
                                  update({ firstName: account.firstName, lastName: account.lastName });
                                }}
                              >
                                {t("book.useProfile")}
                              </button>
                            ) : null}
                            {travelers.map((traveler) => (
                              <button
                                key={traveler.id}
                                type="button"
                                className={btnClass("ghost", "sm")}
                                onClick={() =>
                                  update({
                                    firstName: traveler.firstName,
                                    lastName: traveler.lastName,
                                    nationality: traveler.nationality,
                                    document: traveler.document,
                                  })
                                }
                              >
                                {t("book.useSaved")}: {traveler.firstName} {traveler.lastName}
                              </button>
                            ))}
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
                            <Input
                              id={`dob-${i}`}
                              type="date"
                              max={todayISO()}
                              value={p.dob}
                              dir="ltr"
                              aria-invalid={Boolean(fieldErrors[`dob-${i}`])}
                              aria-describedby={fieldErrors[`dob-${i}`] ? `dob-${i}-error` : undefined}
                              className="code-id text-start font-mono tabular-nums"
                              onChange={(e) => {
                                update({ dob: e.target.value });
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
                      </Panel>
                    );
                  })}

                  <Panel>
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
                  </Panel>
                </div>

                <StepNav
                  onBack={() => goToStep("fare")}
                  onNext={() => {
                    if (validatePassengers()) goToStep("seats");
                  }}
                />
              </section>
            ) : null}

            {/* -------------------------------- seats ------------------------------- */}
            {currentStep === "seats" ? (
              <section aria-labelledby="seats-title">
                <Eyebrow>{t("step.seats")}</Eyebrow>
                <h1
                  id="seats-title"
                  ref={headingRef}
                  tabIndex={-1}
                  className="mt-2 text-2xl font-bold sm:text-3xl outline-none"
                >
                  {t("book.seatTitle")}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("book.seatSub")}</p>
                {account?.seatPreference && account.seatPreference !== "none" ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {t("ci.seatSuggestion")} <span className="font-semibold">{account.seatPreference}</span>
                  </p>
                ) : null}

                {draft.inbound ? (
                  <div className="mt-5 flex gap-1 rounded-lg bg-secondary p-1">
                    {(["out", "in"] as const).map((leg) => (
                      <button
                        key={leg}
                        type="button"
                        onClick={() => setSeatLeg(leg)}
                        aria-pressed={seatLeg === leg}
                        className={cn(
                          "flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                          seatLeg === leg ? "bg-card shadow-[var(--shadow-soft)]" : "text-muted-foreground",
                        )}
                      >
                        {t(leg === "out" ? "book.outbound" : "book.inbound")}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="mt-6">
                  <SeatMap
                    flightId={(seatLeg === "out" ? draft.outbound?.id : draft.inbound?.id) ?? "unknown"}
                    assignments={seatAssignments(seatLeg)}
                    activePassenger={activePax}
                    onActivePassengerChange={setActivePax}
                    onSelect={selectSeat}
                    passengerLabels={passengerLabels}
                    cabin={draft.criteria.cabin}
                    suggestedSeat={suggestSeat(
                      (seatLeg === "out" ? draft.outbound?.id : draft.inbound?.id) ?? "unknown",
                      draft.criteria.cabin,
                      account?.seatPreference ?? "none",
                      Object.values(draft.seats),
                    )}
                  />
                </div>

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
              </section>
            ) : null}

            {/* -------------------------------- extras ------------------------------ */}
            {currentStep === "extras" ? (
              <section aria-labelledby="extras-title">
                <Eyebrow>{t("step.extras")}</Eyebrow>
                <h1
                  id="extras-title"
                  ref={headingRef}
                  tabIndex={-1}
                  className="mt-2 text-2xl font-bold sm:text-3xl outline-none"
                >
                  {t("book.extrasTitle")}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("book.extrasSub")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("book.extrasPaxNote")}</p>

                <div className="mt-6 space-y-4">
                  {paxList.map((passenger, index) => {
                    const extras = extrasFor(draft.extras, index);
                    const label =
                      `${passenger.firstName} ${passenger.lastName}`.trim() ||
                      `${t("book.passenger")} ${index + 1}`;
                    const setPax = (patch: Partial<PaxExtras>) =>
                      setDraft((prev) => ({
                        ...prev,
                        extras: {
                          pax: prev.extras.pax.map((item, i) =>
                            i === index ? { ...item, ...patch } : item,
                          ),
                        },
                      }));
                    return (
                      <Panel key={`extras-${index}`}>
                        <h2 className="text-base font-bold">{t("book.extrasFor", { name: label })}</h2>

                        <div className="mt-4 space-y-4">
                          <div>
                            <h3 className="flex items-center gap-2 text-sm font-semibold">
                              <Luggage aria-hidden="true" className="size-4 text-brand-deep" />
                              {t("book.baggage")}
                            </h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {t("book.included")}:{" "}
                              <span className="numeral">
                                  {(fares.find((f) => f.id === draft.fareId)?.checkedBags ?? 0) === 0
                                    ? t("book.cabinBagOnly")
                                    : `${fares.find((f) => f.id === draft.fareId)?.checkedBags} × 23 kg`}
                              </span>
                            </p>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-sand p-3">
                              <span className="text-sm font-medium">
                                {t("book.bagsFor")} · {money(EXTRA_BAG_PRICE, lang)}
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="size-11 rounded-md border border-input bg-card disabled:opacity-40 transition-colors hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                                  disabled={extras.extraBags === 0}
                                  onClick={() => setPax({ extraBags: Math.max(0, extras.extraBags - 1) })}
                                  aria-label={`${t("book.extraBag")} − ${label}`}
                                >
                                  −
                                </button>
                                <span className="numeral w-6 text-center font-semibold">{extras.extraBags}</span>
                                <button
                                  type="button"
                                  className="size-11 rounded-md border border-input bg-card disabled:opacity-40 transition-colors hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                                  disabled={extras.extraBags >= 4}
                                  onClick={() => setPax({ extraBags: Math.min(4, extras.extraBags + 1) })}
                                  aria-label={`${t("book.extraBag")} + ${label}`}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="max-w-sm">
                            <Field label={t("book.meal")} htmlFor={`meal-${index}`}>
                              <Select
                                id={`meal-${index}`}
                                value={extras.meal}
                                onChange={(e) => setPax({ meal: e.target.value })}
                              >
                                {mealOptions.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {pick(lang, option.label)}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                          </div>

                          <div>
                            <h3 className="flex items-center gap-2 text-sm font-semibold">
                              <Baby aria-hidden="true" className="size-4 text-brand-deep" />
                              {t("book.assistance")}
                            </h3>
                            <p className="mt-1 text-sm text-muted-foreground">{t("book.assistanceNote")}</p>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {assistanceOptions.map((option) => {
                                const checked = extras.assistance.includes(option.id);
                                return (
                                  <label
                                    key={option.id}
                                    className={cn(
                                      "flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 text-sm transition-colors",
                                      checked ? "border-primary bg-brand-soft/50 font-medium" : "border-input bg-card hover:bg-secondary/30",
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      className="size-4 accent-[var(--color-primary)]"
                                      checked={checked}
                                      onChange={(e) =>
                                        setPax({
                                          assistance: e.target.checked
                                            ? [...extras.assistance, option.id]
                                            : extras.assistance.filter((id) => id !== option.id),
                                        })
                                      }
                                    />
                                    {pick(lang, option.label)}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </Panel>
                    );
                  })}
                </div>

                <StepNav onBack={() => goToStep("seats")} onNext={() => goToStep("review")} />
              </section>
            ) : null}

            {/* -------------------------------- review ----------------------------- */}
            {currentStep === "review" ? (
              <section aria-labelledby="review-title">
                <Eyebrow>{t("step.review")}</Eyebrow>
                <h1
                  id="review-title"
                  ref={headingRef}
                  tabIndex={-1}
                  className="mt-2 text-2xl font-bold sm:text-3xl outline-none"
                >
                  {t("book.reviewTitle")}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("book.reviewSub")}</p>

                <div className="mt-6 space-y-4">
                  {[draft.outbound, draft.inbound].filter((f): f is Flight => Boolean(f)).map((flight, index) => {
                    const from = airportByCode(flight.originCode);
                    const to = airportByCode(flight.destinationCode);
                    return (
                      <Panel key={flight.id}>
                        <div className="flex items-center justify-between">
                          <p className="eyebrow text-clay">{t(index === 0 ? "book.outbound" : "book.inbound")}</p>
                          <button
                            type="button"
                            onClick={() => goToStep("results")}
                            className="text-xs font-semibold text-brand-deep hover:underline"
                          >
                            {t("common.edit")}
                          </button>
                        </div>
                        <p className="mt-2 text-lg font-bold">
                          {from ? pick(lang, from.city) : flight.originCode} →{" "}
                          {to ? pick(lang, to.city) : flight.destinationCode}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {dateLong(flight.date, lang)} · <span className="code-id">{flight.departTime}</span>–
                          <span className="code-id">{flight.arriveTime}</span> · <Code>{flight.number}</Code> ·{" "}
                          {flight.aircraft}
                        </p>
                      </Panel>
                    );
                  })}

                  <Panel>
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                        {t("book.passengersLabel")}
                      </h2>
                      <button
                        type="button"
                        onClick={() => goToStep("passengers")}
                        className="text-xs font-semibold text-brand-deep hover:underline"
                      >
                        {t("common.edit")}
                      </button>
                    </div>
                    <ul className="mt-3 divide-y divide-border">
                      {paxList.map((p, i) => (
                        <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                          <span className="font-medium">
                            {p.firstName} {p.lastName}
                          </span>
                          <span className="text-muted-foreground">
                            {t("book.seatsLabel")}:{" "}
                            <span className="code-id">
                              {[draft.seats[`out-${i}`], draft.seats[`in-${i}`]].filter(Boolean).join(" / ") || "—"}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Panel>

                  <Panel>
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                        {t("step.extras")}
                      </h2>
                      <button
                        type="button"
                        onClick={() => goToStep("extras")}
                        className="text-xs font-semibold text-brand-deep hover:underline"
                      >
                        {t("common.edit")}
                      </button>
                    </div>
                    <ul className="mt-3 divide-y divide-border text-sm">
                      {paxList.map((p, i) => {
                        const extras = extrasFor(draft.extras, i);
                        const label =
                          `${p.firstName} ${p.lastName}`.trim() || `${t("book.passenger")} ${i + 1}`;
                        return (
                          <li key={`rev-extras-${i}`} className="py-2.5">
                            <p className="font-medium">{label}</p>
                            <p className="mt-1 text-muted-foreground">
                              <span className="numeral">
                                {extras.extraBags} × {t("book.extraBag")}
                              </span>
                              {" · "}
                              {pick(lang, mealOptions.find((m) => m.id === extras.meal)?.label ?? { en: "—", ar: "—" })}
                              {" · "}
                              {extras.assistance.length === 0
                                ? t("book.none")
                                : extras.assistance
                                    .map((id) =>
                                      pick(
                                        lang,
                                        assistanceOptions.find((a) => a.id === id)?.label ?? { en: id, ar: id },
                                      ),
                                    )
                                    .join(", ")}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-3 flex justify-between gap-3 border-t border-border pt-3 text-sm">
                      <span className="text-muted-foreground">{t("book.extraBag")}</span>
                      <span className="numeral font-semibold">{totalExtraBags(draft.extras)}</span>
                    </p>
                  </Panel>
                </div>

                <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-border pt-6">
                  <button
                    type="button"
                    onClick={() => goToStep("extras")}
                    className={btnClass("outline", "md")}
                  >
                    <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
                    {t("book.back")}
                  </button>
                  <button
                    type="button"
                    onClick={confirm}
                    className={btnClass("primary", "lg")}
                  >
                    {t("book.confirm")} · {money(totals.total, lang)}
                  </button>
                </div>
              </section>
            ) : null}
          </div>

          {/* Persistent sticky PriceSummary docket on larger screens */}
          <div className="hidden lg:block">
            <PriceSummary draft={draft} />
          </div>
        </div>
      </Container>
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
