import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { SeatMap } from "@/components/booking/seat-map";
import { StatusBadge } from "@/components/flight-status";
import { btnClass, Code, Container, EmptyState, Field, Input, Notice, PageHeader, Panel, Pill } from "@/components/kit";
import { airportByCode } from "@/lib/data";
import { dateLong } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { bookingLegs, isCheckedIn, type Leg, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/{-$locale}/manage/$ref_/check-in")({
  head: ({ params }) => ({
    meta: [
      { title: `Check in — booking ${params.ref} — Gaza International Airport (GZA)` },
      {
        name: "description",
        content: "Check in for your Palestinian Airlines flight from Gaza: choose the flight, passengers, travel details and seats.",
      },
      { property: "og:title", content: "Check in — Palestinian Airlines" },
      { property: "og:description", content: "Check in one flight at a time and collect your boarding passes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckInPage,
});

type Step = "leg" | "pax" | "details" | "seats" | "review" | "done";

function CheckInPage() {
  const { ref } = Route.useParams();
  const { t, lang } = useI18n();
  const { ready, findBooking, updateBooking, checkInLeg, account } = useStore();
  const booking = findBooking(ref);

  const [step, setStep] = useState<Step>("leg");
  const [leg, setLeg] = useState<Leg | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [docs, setDocs] = useState<Record<number, string>>({});
  const [seats, setSeats] = useState<Record<number, string>>({});
  const [activePax, setActivePax] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const legs = useMemo(() => (booking ? bookingLegs(booking) : []), [booking]);
  const openLegs = useMemo(
    () => (booking ? legs.filter((l) => !isCheckedIn(booking, l)) : []),
    [booking, legs],
  );

  if (!ready) {
    return (
      <Container className="py-16">
        <p className="text-sm text-muted-foreground">…</p>
      </Container>
    );
  }

  if (!booking) {
    return (
      <Container className="py-16">
        <EmptyState
          title={t("manage.notFound")}
          description={t("conf.notFoundSub")}
          action={
            <AppLink to="/manage" className={btnClass("primary", "md")}>
              {t("nav.manage")}
            </AppLink>
          }
        />
      </Container>
    );
  }

  if (booking.status === "cancelled" || openLegs.length === 0) {
    return (
      <Container className="py-16">
        <EmptyState
          title={t("ci.notAvailable")}
          description={booking.status === "cancelled" ? t("ci.cancelledNote") : t("ci.allDone")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <AppLink to="/manage/$ref" params={{ ref: booking.ref }} className={btnClass("primary", "md")}>
                {t("manage.backToBooking")}
              </AppLink>
              {booking.status === "confirmed" ? (
                <AppLink
                  to="/boarding-pass/$ref/$pax"
                  params={{ ref: booking.ref, pax: "0" }}
                  className={btnClass("outline", "md")}
                >
                  {t("book.boardingPass")}
                </AppLink>
              ) : null}
            </div>
          }
        />
      </Container>
    );
  }

  const flight = leg === "in" && booking.inbound ? booking.inbound : booking.outbound;
  // Infants share an adult's seat, so only seated passengers appear as choices.
  const seatable = booking.passengers.flatMap((p, i) => (p.type === "infant" ? [] : [i]));
  const infantsOf = (adultIndex: number) =>
    booking.passengers.flatMap((p, i) => (p.type === "infant" && (p.withAdult ?? 0) === adultIndex ? [i] : []));

  const startLeg = (chosen: Leg) => {
    setLeg(chosen);
    setSelected(seatable);
    setDocs(Object.fromEntries(booking.passengers.map((p, i) => [i, p.document])));
    setSeats(
      Object.fromEntries(
        booking.passengers.flatMap((_, i) => {
          const existing = booking.seats[`${chosen}-${i}`];
          return existing ? [[i, existing]] : [];
        }),
      ),
    );
    setActivePax(seatable[0] ?? 0);
    setStep("pax");
  };

  const complete = () => {
    if (!leg) return;
    const nextSeats = { ...booking.seats };
    Object.entries(seats).forEach(([index, seat]) => {
      nextSeats[`${leg}-${index}`] = seat;
    });
    const passengers = booking.passengers.map((p, i) =>
      docs[i] !== undefined ? { ...p, document: docs[i] as string } : p,
    );
    updateBooking(booking.ref, { seats: nextSeats, passengers });
    checkInLeg(booking.ref, leg);
    setStep("done");
  };

  const paxLabel = (i: number) => {
    const p = booking.passengers[i];
    return `${p?.firstName ?? ""} ${p?.lastName ?? ""}`.trim() || `${t("book.passenger")} ${i + 1}`;
  };

  return (
    <Container className="py-8 sm:py-12">
      <PageHeader
        eyebrow={<Code>{booking.ref}</Code>}
        title={t("ci.title")}
        description={t("ci.sub", { ref: booking.ref })}
      />

      {step === "leg" ? (
        <Panel className="mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("ci.chooseLeg")}</h2>
          <div className="mt-4 grid gap-3">
            {legs.map((l) => {
              const f = l === "in" && booking.inbound ? booking.inbound : booking.outbound;
              const done = isCheckedIn(booking, l);
              return (
                <button
                  key={l}
                  type="button"
                  disabled={done}
                  onClick={() => startLeg(l)}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-start transition-colors",
                    done ? "border-border bg-secondary/60" : "border-input bg-card hover:border-primary",
                  )}
                >
                  <span>
                    <span className="eyebrow text-clay">{t(l === "out" ? "ci.legOut" : "ci.legIn")}</span>
                    <span className="mt-1 block font-bold">
                      {pick(lang, airportByCode(f.originCode)?.city ?? { en: f.originCode, ar: f.originCode })} →{" "}
                      {pick(lang, airportByCode(f.destinationCode)?.city ?? { en: f.destinationCode, ar: f.destinationCode })}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {dateLong(f.date, lang)} · <span className="code-id">{f.departTime}</span> ·{" "}
                      <Code>{f.number}</Code>
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {done ? <Pill tone="brand">{t("ci.alreadyDone")}</Pill> : <StatusBadge status={f.status} />}
                    {!done ? <ChevronRight aria-hidden="true" className="size-4 rtl:-scale-x-100" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>
      ) : null}

      {step === "pax" ? (
        <Panel className="mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("ci.choosePax")}</h2>
          <ul className="mt-4 divide-y divide-border">
            {seatable.map((i) => (
              <li key={i} className="py-3">
                <label className="flex items-center gap-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-5 rounded border-input accent-[var(--color-primary)]"
                    checked={selected.includes(i)}
                    onChange={(e) =>
                      setSelected((prev) => (e.target.checked ? [...prev, i] : prev.filter((x) => x !== i)))
                    }
                  />
                  {paxLabel(i)}
                  <Pill>{t(booking.passengers[i]?.type === "child" ? "book.child" : "book.adult")}</Pill>
                </label>
                {infantsOf(i).map((inf) => (
                  <p key={inf} className="ms-8 mt-1 text-xs text-muted-foreground">
                    {t("book.infantOf")} {paxLabel(inf)} · {t("book.noSeatInfant")}
                  </p>
                ))}
              </li>
            ))}
          </ul>
          <StepNav
            error={error}
            onBack={() => {
              setError(null);
              setStep("leg");
            }}
            onNext={() => {
              if (selected.length === 0) {
                setError(t("ci.paxRequired"));
                return;
              }
              setError(null);
              setStep("details");
            }}
          />
        </Panel>
      ) : null}

      {step === "details" ? (
        <Panel className="mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("ci.details")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("ci.detailsSub")}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {selected.map((i) => (
              <Field key={i} label={`${paxLabel(i)} · ${t("book.document")}`} htmlFor={`doc-${i}`}>
                <Input
                  id={`doc-${i}`}
                  className="code-id"
                  value={docs[i] ?? ""}
                  onChange={(e) => setDocs((prev) => ({ ...prev, [i]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
          <StepNav
            error={error}
            onBack={() => {
              setError(null);
              setStep("pax");
            }}
            onNext={() => {
              if (selected.some((i) => !(docs[i] ?? "").trim())) {
                setError(t("ci.docRequired"));
                return;
              }
              setError(null);
              setStep("seats");
            }}
          />
        </Panel>
      ) : null}

      {step === "seats" ? (
        <Panel className="mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("ci.seats")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("ci.seatsSub")}</p>
          {account?.seatPreference && account.seatPreference !== "none" ? (
            <p className="mt-1 text-xs text-muted-foreground">{t("ci.seatSuggestion")}</p>
          ) : null}
          <div className="mt-4">
            <SeatMap
              flightId={flight.id}
              // The seat map works in the order of the passengers being checked in.
              assignments={Object.fromEntries(
                selected.flatMap((i, pos) => (seats[i] ? [[pos, seats[i] as string]] : [])),
              )}
              activePassenger={Math.max(0, selected.indexOf(activePax))}
              onActivePassengerChange={(pos) => setActivePax(selected[pos] ?? 0)}
              onSelect={(pos, seat) => {
                const target = selected[pos];
                if (target === undefined) return;
                setSeats((prev) => ({ ...prev, [target]: seat }));
              }}
              passengerLabels={selected.map((i) => paxLabel(i))}
            />

          </div>
          <StepNav
            error={null}
            onBack={() => setStep("details")}
            onNext={() => setStep("review")}
          />
        </Panel>
      ) : null}

      {step === "review" ? (
        <Panel className="mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("ci.review")}</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {t(leg === "in" ? "ci.legIn" : "ci.legOut")} · <Code>{flight.number}</Code> ·{" "}
            {dateLong(flight.date, lang)} · <span className="code-id">{flight.departTime}</span>
          </p>
          <ul className="mt-4 divide-y divide-border text-sm">
            {selected.map((i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="font-medium">{paxLabel(i)}</span>
                <span className="text-muted-foreground">
                  {t("book.seatsLabel")}: <span className="code-id">{seats[i] ?? "—"}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" onClick={() => setStep("seats")} className={btnClass("secondary", "md")}>
              {t("ci.back")}
            </button>
            <button type="button" onClick={complete} className={btnClass("primary", "md")}>
              <Check aria-hidden="true" className="size-4" />
              {t("ci.confirm")}
            </button>
          </div>
        </Panel>
      ) : null}

      {step === "done" ? (
        <Panel className="mt-6">
          <Pill tone="brand">{t("ci.done")}</Pill>
          <p className="mt-3 text-sm text-muted-foreground">{t("ci.doneSub")}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <AppLink
              to="/boarding-pass/$ref/$pax"
              params={{ ref: booking.ref, pax: String(selected[0] ?? 0) }}
              className={btnClass("primary", "md")}
            >
              {t("ci.viewPasses")}
            </AppLink>
            <AppLink to="/manage/$ref" params={{ ref: booking.ref }} className={btnClass("outline", "md")}>
              {t("manage.backToBooking")}
            </AppLink>
          </div>
          {openLegs.filter((l) => l !== leg).length > 0 ? (
            <Notice className="mt-5">
              <button
                type="button"
                onClick={() => {
                  setStep("leg");
                  setLeg(null);
                }}
                className="underline"
              >
                {t("ci.chooseLeg")}
              </button>
            </Notice>
          ) : null}
        </Panel>
      ) : null}
    </Container>
  );
}

function StepNav({
  onBack,
  onNext,
  error,
}: {
  onBack: () => void;
  onNext: () => void;
  error: string | null;
}) {
  const { t } = useI18n();
  return (
    <>
      {error ? (
        <p role="alert" className="mt-4 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={onBack} className={btnClass("secondary", "md")}>
          {t("ci.back")}
        </button>
        <button type="button" onClick={onNext} className={btnClass("primary", "md")}>
          {t("ci.next")}
        </button>
      </div>
    </>
  );
}
