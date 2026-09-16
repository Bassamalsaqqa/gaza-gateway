import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Baby, Check, Luggage, Ticket, UserPlus, Utensils } from "lucide-react";
import { useMemo, useState } from "react";
import { FlightSearchForm } from "@/components/flight-search-form";
import { FlightOption } from "@/components/booking/flight-option";
import { PriceSummary } from "@/components/booking/price-summary";
import { SeatMap } from "@/components/booking/seat-map";
import { Stepper, type BookingStep } from "@/components/booking/stepper";
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
  type Flight,
} from "@/lib/data";
import { dateLong, money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { bookingTotal, emptyPassenger, paxCount, useStore, type Booking } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/book")({
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

function BookPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { draft, setDraft, addBooking, account } = useStore();
  const [step, setStep] = useState<BookingStep>(draft.entry === "results" ? "results" : "search");
  const [errors, setErrors] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [activePax, setActivePax] = useState(0);
  const [seatLeg, setSeatLeg] = useState<"out" | "in">("out");

  const pax = Math.max(1, draft.criteria.adults + draft.criteria.children);
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

  const go = (next: BookingStep) => {
    setErrors(false);
    setStep(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* -------------------------------- search -------------------------------- */
  if (step === "search") {
    return (
      <Container className="py-10 sm:py-14">
        <Eyebrow>{t("home.kicker")}</Eyebrow>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{t("book.title")}</h1>
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

  const selectSeat = (paxIndex: number, seat: string) => {
    const key = `${seatLeg}-${paxIndex}`;
    setDraft((prev) => {
      const seats = { ...prev.seats };
      if (seats[key] === seat) delete seats[key];
      else seats[key] = seat;
      return { ...prev, seats };
    });
    if (paxIndex < pax - 1) setActivePax(paxIndex + 1);
  };

  const seatAssignments = (leg: "out" | "in"): Record<number, string> => {
    const result: Record<number, string> = {};
    Object.entries(draft.seats).forEach(([key, seat]) => {
      const [prefix, index] = key.split("-");
      if (prefix === leg && index !== undefined) result[Number(index)] = seat;
    });
    return result;
  };

  const passengerLabels = Array.from({ length: pax }, (_, i) => {
    const p = draft.passengers[i];
    const name = p && (p.firstName || p.lastName) ? `${p.firstName} ${p.lastName}`.trim() : t("book.pax", { n: i + 1 });
    return name;
  });

  const passengersValid = () =>
    Array.from({ length: pax }).every((_, i) => {
      const p = draft.passengers[i];
      return Boolean(p && p.firstName.trim() && p.lastName.trim() && p.dob);
    }) && /.+@.+\..+/.test(draft.contact.email);

  const confirm = () => {
    if (!draft.outbound) return;
    const totals = bookingTotal(draft);
    const created = addBooking({
      criteria: draft.criteria,
      outbound: draft.outbound,
      inbound: draft.inbound,
      fareId: draft.fareId,
      passengers: draft.passengers.slice(0, pax),
      seats: draft.seats,
      extras: draft.extras,
      contact: draft.contact,
      total: totals.total,
    });
    setBooking(created);
    go("confirmation");
  };

  const totals = bookingTotal(draft);

  return (
    <>
      <Stepper current={step} />
      <Container className="py-8">
        <div className="grid gap-8 lg:grid-cols-[1.7fr_1fr]">
          <div>
            {/* ------------------------------ results ------------------------------ */}
            {step === "results" ? (
              <section aria-labelledby="results-title">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <Eyebrow>{t("step.results")}</Eyebrow>
                    <h1 id="results-title" className="mt-2 text-2xl font-bold sm:text-3xl">
                      <Code>{draft.criteria.origin}</Code> → <Code>{draft.criteria.destination}</Code>
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {dateLong(draft.criteria.departDate, lang)} ·{" "}
                      {paxCount(draft.criteria) === 1
                        ? t("search.passengerCountOne")
                        : t("search.passengerCount", { n: paxCount(draft.criteria) })}
                    </p>
                  </div>
                  <button type="button" onClick={() => go("search")} className={btnClass("outline", "sm")}>
                    {t("book.changeSearch")}
                  </button>
                </div>

                <h2 className="mt-8 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  {t("book.outbound")}
                </h2>
                <div className="mt-3 space-y-3">
                  {outboundOptions.length === 0 ? (
                    <EmptyState title={t("book.noResults")} description={t("book.noResultsSub")} />
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
                        <EmptyState title={t("book.noResults")} description={t("book.noResultsSub")} />
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
                  onBack={() => go("search")}
                  onNext={() => go("fare")}
                  nextDisabled={!draft.outbound || (draft.criteria.tripType === "round" && !draft.inbound)}
                />
              </section>
            ) : null}

            {/* -------------------------------- fare -------------------------------- */}
            {step === "fare" ? (
              <section aria-labelledby="fare-title">
                <Eyebrow>{t("step.fare")}</Eyebrow>
                <h1 id="fare-title" className="mt-2 text-2xl font-bold sm:text-3xl">
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
                          "flex flex-col rounded-xl border bg-card p-5 text-start transition-colors",
                          selected ? "border-primary ring-1 ring-primary/40" : "border-border hover:border-primary/50",
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
                                ? pick(lang, { en: "Cabin bag only", ar: "حقيبة كابينة فقط" })
                                : `${fare.checkedBags} × 23 kg`}
                            </span>
                          </li>
                          <li className="flex gap-2">
                            <Ticket aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                            {pick(lang, fare.seatSelection)}
                          </li>
                          <li className="flex gap-2">
                            <ArrowRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-deep rtl:rotate-180" />
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

                <StepNav onBack={() => go("results")} onNext={() => go("passengers")} />
              </section>
            ) : null}

            {/* ----------------------------- passengers ---------------------------- */}
            {step === "passengers" ? (
              <section aria-labelledby="pax-title">
                <Eyebrow>{t("step.passengers")}</Eyebrow>
                <h1 id="pax-title" className="mt-2 text-2xl font-bold sm:text-3xl">
                  {t("book.paxTitle")}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("book.paxSub")}</p>

                {errors ? (
                  <p className="mt-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">
                    {t("book.required")}
                  </p>
                ) : null}

                <div className="mt-6 space-y-4">
                  {Array.from({ length: pax }, (_, i) => {
                    const p = draft.passengers[i] ?? emptyPassenger();
                    const update = (patch: Partial<typeof p>) =>
                      setDraft((prev) => {
                        const passengers = [...prev.passengers];
                        while (passengers.length < pax) passengers.push(emptyPassenger());
                        passengers[i] = { ...(passengers[i] ?? emptyPassenger()), ...patch };
                        return { ...prev, passengers };
                      });
                    return (
                      <Panel key={i}>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                          {t("book.pax", { n: i + 1 })}
                        </h2>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <Field label={t("book.firstName")} htmlFor={`fn-${i}`}>
                            <Input
                              id={`fn-${i}`}
                              value={p.firstName}
                              autoComplete="given-name"
                              onChange={(e) => update({ firstName: e.target.value })}
                              required
                            />
                          </Field>
                          <Field label={t("book.lastName")} htmlFor={`ln-${i}`}>
                            <Input
                              id={`ln-${i}`}
                              value={p.lastName}
                              autoComplete="family-name"
                              onChange={(e) => update({ lastName: e.target.value })}
                              required
                            />
                          </Field>
                          <Field label={t("book.dob")} htmlFor={`dob-${i}`}>
                            <Input id={`dob-${i}`} type="date" value={p.dob} onChange={(e) => update({ dob: e.target.value })} />
                          </Field>
                          <Field label={t("book.nationality")} htmlFor={`nat-${i}`}>
                            <Input id={`nat-${i}`} value={p.nationality} onChange={(e) => update({ nationality: e.target.value })} />
                          </Field>
                          <Field label={t("book.docNumber")} htmlFor={`doc-${i}`} hint={t("common.optional")} className="sm:col-span-2">
                            <Input id={`doc-${i}`} value={p.document} onChange={(e) => update({ document: e.target.value })} />
                          </Field>
                        </div>
                      </Panel>
                    );
                  })}

                  <Panel>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("book.contact")}</h2>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <Field label={t("book.email")} htmlFor="contact-email">
                        <Input
                          id="contact-email"
                          type="email"
                          autoComplete="email"
                          value={draft.contact.email}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, contact: { ...prev.contact, email: e.target.value } }))
                          }
                          required
                        />
                      </Field>
                      <Field label={t("book.phone")} htmlFor="contact-phone">
                        <Input
                          id="contact-phone"
                          type="tel"
                          autoComplete="tel"
                          value={draft.contact.phone}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, contact: { ...prev.contact, phone: e.target.value } }))
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
                  onBack={() => go("fare")}
                  onNext={() => (passengersValid() ? go("seats") : setErrors(true))}
                />
              </section>
            ) : null}

            {/* -------------------------------- seats ------------------------------- */}
            {step === "seats" ? (
              <section aria-labelledby="seats-title">
                <Eyebrow>{t("step.seats")}</Eyebrow>
                <h1 id="seats-title" className="mt-2 text-2xl font-bold sm:text-3xl">
                  {t("book.seatTitle")}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("book.seatSub")}</p>

                {draft.inbound ? (
                  <div className="mt-5 flex gap-1 rounded-lg bg-secondary p-1">
                    {(["out", "in"] as const).map((leg) => (
                      <button
                        key={leg}
                        type="button"
                        onClick={() => setSeatLeg(leg)}
                        aria-pressed={seatLeg === leg}
                        className={cn(
                          "flex-1 rounded-md px-3 py-2 text-sm font-semibold",
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
                  />
                </div>

                <StepNav
                  onBack={() => go("passengers")}
                  onNext={() => go("extras")}
                  secondary={
                    <button type="button" onClick={() => go("extras")} className={btnClass("ghost", "md")}>
                      {t("book.seatSkip")}
                    </button>
                  }
                />
              </section>
            ) : null}

            {/* -------------------------------- extras ------------------------------ */}
            {step === "extras" ? (
              <section aria-labelledby="extras-title">
                <Eyebrow>{t("step.extras")}</Eyebrow>
                <h1 id="extras-title" className="mt-2 text-2xl font-bold sm:text-3xl">
                  {t("book.extrasTitle")}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("book.extrasSub")}</p>

                <div className="mt-6 space-y-4">
                  <Panel>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="flex items-center gap-2 text-base font-bold">
                          <Luggage aria-hidden="true" className="size-4 text-brand-deep" />
                          {t("book.baggage")}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t("book.included")}:{" "}
                          <span className="numeral">
                            {(fares.find((f) => f.id === draft.fareId)?.checkedBags ?? 0) === 0
                              ? pick(lang, { en: "cabin bag only", ar: "حقيبة كابينة فقط" })
                              : `${fares.find((f) => f.id === draft.fareId)?.checkedBags} × 23 kg`}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between rounded-lg bg-sand p-3">
                      <span className="text-sm font-medium">
                        {t("book.extraBag")} · {money(EXTRA_BAG_PRICE, lang)}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="size-9 rounded-md border border-input bg-card disabled:opacity-40"
                          disabled={draft.extras.extraBags === 0}
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              extras: { ...prev.extras, extraBags: Math.max(0, prev.extras.extraBags - 1) },
                            }))
                          }
                          aria-label={`${t("book.extraBag")} −`}
                        >
                          −
                        </button>
                        <span className="numeral w-6 text-center font-semibold">{draft.extras.extraBags}</span>
                        <button
                          type="button"
                          className="size-9 rounded-md border border-input bg-card disabled:opacity-40"
                          disabled={draft.extras.extraBags >= 4}
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              extras: { ...prev.extras, extraBags: Math.min(4, prev.extras.extraBags + 1) },
                            }))
                          }
                          aria-label={`${t("book.extraBag")} +`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </Panel>

                  <Panel>
                    <h2 className="flex items-center gap-2 text-base font-bold">
                      <Utensils aria-hidden="true" className="size-4 text-brand-deep" />
                      {t("book.meal")}
                    </h2>
                    <div className="mt-4 max-w-sm">
                      <Field label={t("book.meal")} htmlFor="meal">
                        <Select
                          id="meal"
                          value={draft.extras.meal}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, extras: { ...prev.extras, meal: e.target.value } }))
                          }
                        >
                          {mealOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {pick(lang, option.label)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                  </Panel>

                  <Panel>
                    <h2 className="flex items-center gap-2 text-base font-bold">
                      <Baby aria-hidden="true" className="size-4 text-brand-deep" />
                      {t("book.assistance")}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">{t("book.assistanceNote")}</p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {assistanceOptions.map((option) => {
                        const checked = draft.extras.assistance.includes(option.id);
                        return (
                          <label
                            key={option.id}
                            className={cn(
                              "flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 text-sm",
                              checked ? "border-primary bg-brand-soft/50" : "border-input bg-card",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="size-4 accent-[var(--color-primary)]"
                              checked={checked}
                              onChange={(e) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  extras: {
                                    ...prev.extras,
                                    assistance: e.target.checked
                                      ? [...prev.extras.assistance, option.id]
                                      : prev.extras.assistance.filter((id) => id !== option.id),
                                  },
                                }))
                              }
                            />
                            {pick(lang, option.label)}
                          </label>
                        );
                      })}
                    </div>
                  </Panel>
                </div>

                <StepNav onBack={() => go("seats")} onNext={() => go("review")} />
              </section>
            ) : null}

            {/* -------------------------------- review ----------------------------- */}
            {step === "review" ? (
              <section aria-labelledby="review-title">
                <Eyebrow>{t("step.review")}</Eyebrow>
                <h1 id="review-title" className="mt-2 text-2xl font-bold sm:text-3xl">
                  {t("book.reviewTitle")}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("book.reviewSub")}</p>

                <div className="mt-6 space-y-4">
                  {[draft.outbound, draft.inbound].filter((f): f is Flight => Boolean(f)).map((flight, index) => {
                    const from = airportByCode(flight.originCode);
                    const to = airportByCode(flight.destinationCode);
                    return (
                      <Panel key={flight.id}>
                        <p className="eyebrow text-clay">{t(index === 0 ? "book.outbound" : "book.inbound")}</p>
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
                    <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                      {t("book.passengersLabel")}
                    </h2>
                    <ul className="mt-3 divide-y divide-border">
                      {draft.passengers.slice(0, pax).map((p, i) => (
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
                    <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                      {t("step.extras")}
                    </h2>
                    <dl className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">{t("book.extraBag")}</dt>
                        <dd className="numeral font-medium">{draft.extras.extraBags}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">{t("book.meal")}</dt>
                        <dd className="font-medium">
                          {pick(lang, mealOptions.find((m) => m.id === draft.extras.meal)?.label ?? { en: "—", ar: "—" })}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">{t("book.assistance")}</dt>
                        <dd className="font-medium">
                          {draft.extras.assistance.length === 0
                            ? t("book.none")
                            : draft.extras.assistance
                                .map((id) =>
                                  pick(lang, assistanceOptions.find((a) => a.id === id)?.label ?? { en: id, ar: id }),
                                )
                                .join(", ")}
                        </dd>
                      </div>
                    </dl>
                  </Panel>
                </div>

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button type="button" onClick={() => go("extras")} className={btnClass("outline", "md")}>
                    <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
                    {t("book.back")}
                  </button>
                  <button type="button" onClick={confirm} className={btnClass("primary", "lg")}>
                    {t("book.confirm")} · {money(totals.total, lang)}
                  </button>
                </div>
              </section>
            ) : null}

            {/* ----------------------------- confirmation --------------------------- */}
            {step === "confirmation" && booking ? (
              <section aria-labelledby="confirm-title">
                <div className="rounded-xl border border-primary/30 bg-brand-soft/60 p-6">
                  <span className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check aria-hidden="true" className="size-5" />
                  </span>
                  <h1 id="confirm-title" className="mt-4 text-2xl font-bold sm:text-3xl">
                    {t("book.confirmed")}
                  </h1>
                  <p className="mt-2 max-w-lg text-sm text-muted-foreground">{t("book.confirmedSub")}</p>
                  <div className="mt-5 inline-flex flex-col rounded-lg border border-border bg-card px-5 py-3">
                    <span className="eyebrow text-muted-foreground">{t("book.reference")}</span>
                    <span className="code-id mt-1 text-3xl font-bold tracking-[0.18em]">{booking.ref}</span>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Panel>
                    <p className="eyebrow text-clay">{t("book.route")}</p>
                    <p className="mt-2 font-semibold">
                      <Code>{booking.outbound.originCode}</Code> → <Code>{booking.outbound.destinationCode}</Code>
                      {booking.inbound ? (
                        <>
                          {" · "}
                          <Code>{booking.inbound.originCode}</Code> → <Code>{booking.inbound.destinationCode}</Code>
                        </>
                      ) : null}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {dateLong(booking.outbound.date, lang)} · <Code>{booking.outbound.number}</Code>
                    </p>
                  </Panel>
                  <Panel>
                    <p className="eyebrow text-clay">{t("book.passengersLabel")}</p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {booking.passengers.map((p, i) => (
                        <li key={i} className="flex justify-between gap-3">
                          <span>
                            {p.firstName} {p.lastName}
                          </span>
                          <span className="code-id text-muted-foreground">{booking.seats[`out-${i}`] ?? "—"}</span>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  <Link to="/manage" search={{ ref: booking.ref }} className={btnClass("primary", "md")}>
                    {t("book.viewBooking")}
                  </Link>
                  <Link to="/account/boarding-passes" className={btnClass("outline", "md")}>
                    {t("book.boardingPass")}
                  </Link>
                  {!account ? (
                    <button
                      type="button"
                      onClick={() => void navigate({ to: "/register" })}
                      className={btnClass("clay", "md")}
                    >
                      <UserPlus aria-hidden="true" className="size-4" />
                      {t("book.createAccount")}
                    </button>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>

          {step !== "confirmation" ? (
            <div>
              <PriceSummary draft={draft} />
            </div>
          ) : null}
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
        <button type="button" onClick={onNext} disabled={nextDisabled} className={btnClass("primary", "md")}>
          {t("book.continue")}
          <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
        </button>
      </div>
    </div>
  );
}
