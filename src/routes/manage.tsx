import { createFileRoute, Link } from "@tanstack/react-router";
import { Luggage, Search, Ticket, XCircle } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "@/components/flight-status";
import { btnClass, Code, Container, EmptyState, Field, Input, Notice, PageHeader, Panel, Pill } from "@/components/kit";
import { EXTRA_BAG_PRICE, airportByCode, fares } from "@/lib/data";
import { dateLong, money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { useStore, type Booking } from "@/lib/store";

type ManageSearch = { ref?: string };

export const Route = createFileRoute("/manage")({
  validateSearch: (search: Record<string, unknown>): ManageSearch => ({
    ref: typeof search.ref === "string" ? search.ref : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Manage booking — Gaza International Airport (GZA)" },
      {
        name: "description",
        content:
          "Retrieve a Palestinian Airlines booking with your reference and last name to view flights, passengers, seats and baggage.",
      },
      { property: "og:title", content: "Manage your booking — Palestinian Airlines" },
      { property: "og:description", content: "Look up a booking by reference and last name." },
    ],
  }),
  component: ManagePage,
});

function ManagePage() {
  const { t } = useI18n();
  const { ref: refParam } = Route.useSearch();
  const { findBooking, bookings, updateBooking } = useStore();
  const [ref, setRef] = useState(refParam ?? "");
  const [lastName, setLastName] = useState("");
  const [result, setResult] = useState<Booking | null>(refParam ? findBooking(refParam) ?? null : null);
  const [notFound, setNotFound] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = findBooking(ref.trim());
    const nameOk =
      !lastName.trim() ||
      found?.passengers.some((p) => p.lastName.trim().toLowerCase() === lastName.trim().toLowerCase()) ||
      found?.contact.email.toLowerCase() === lastName.trim().toLowerCase();
    if (found && nameOk) {
      setResult(found);
      setNotFound(false);
    } else {
      setResult(null);
      setNotFound(true);
    }
  };

  return (
    <>
      <PageHeader eyebrow={t("nav.manage")} title={t("manage.title")} description={t("manage.sub")} />

      <Container className="grid gap-8 py-10 lg:grid-cols-[1fr_1.4fr]">
        <form onSubmit={submit} className="surface h-fit p-5">
          <div className="space-y-4">
            <Field label={t("manage.reference")} htmlFor="pnr" hint="ABC123">
              <Input
                id="pnr"
                value={ref}
                onChange={(e) => setRef(e.target.value.toUpperCase())}
                className="code-id tracking-[0.16em] uppercase"
                required
              />
            </Field>
            <Field label={t("manage.lastName")} htmlFor="lastname">
              <Input id="lastname" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
            </Field>
            <button type="submit" className={btnClass("primary", "md", "w-full")}>
              <Search aria-hidden="true" className="size-4" />
              {t("manage.find")}
            </button>
          </div>
          <div className="mt-5">
            <Notice>{t("manage.demoHint")}</Notice>
          </div>
          {bookings.length > 0 ? (
            <div className="mt-5 border-t border-border pt-4">
              <p className="eyebrow text-muted-foreground">{t("account.trips")}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {bookings.map((b) => (
                  <li key={b.ref}>
                    <button
                      type="button"
                      onClick={() => {
                        setRef(b.ref);
                        setResult(b);
                        setNotFound(false);
                      }}
                      className="code-id rounded-md border border-input bg-card px-2.5 py-1.5 text-xs font-semibold"
                    >
                      {b.ref}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </form>

        <div>
          {notFound ? <EmptyState title={t("manage.notFound")} description={t("manage.demoHint")} /> : null}
          {result ? (
            <BookingDetail
              booking={result}
              onCheckin={() => {
                updateBooking(result.ref, { checkedIn: true });
                setResult({ ...result, checkedIn: true });
              }}
              onCancel={() => {
                updateBooking(result.ref, { status: "cancelled" });
                setResult({ ...result, status: "cancelled" });
              }}
            />
          ) : null}
          {!result && !notFound ? (
            <EmptyState
              title={t("manage.title")}
              description={t("manage.sub")}
              action={
                <Link to="/book" className={btnClass("outline", "md")}>
                  {t("nav.book")}
                </Link>
              }
            />
          ) : null}
        </div>
      </Container>
    </>
  );
}

export function BookingDetail({
  booking,
  onCheckin,
  onCancel,
}: {
  booking: Booking;
  onCheckin?: () => void;
  onCancel?: () => void;
}) {
  const { t, lang } = useI18n();
  const fare = fares.find((f) => f.id === booking.fareId);

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-muted-foreground">{t("book.reference")}</p>
            <p className="code-id text-3xl font-bold tracking-[0.16em]">{booking.ref}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {booking.status === "cancelled" ? (
              <Pill tone="ink">{t("manage.cancelled")}</Pill>
            ) : (
              <StatusBadge status={booking.outbound.status} />
            )}
            {booking.checkedIn ? <Pill tone="brand">{t("manage.checkedIn")}</Pill> : null}
            {fare ? <Pill>{pick(lang, fare.name)}</Pill> : null}
          </div>
        </div>
      </Panel>

      {[booking.outbound, booking.inbound].map((flight, index) =>
        flight ? (
          <Panel key={flight.id}>
            <p className="eyebrow text-clay">{t(index === 0 ? "book.outbound" : "book.inbound")}</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-lg font-bold">
                {pick(lang, airportByCode(flight.originCode)?.city ?? { en: flight.originCode, ar: flight.originCode })} →{" "}
                {pick(
                  lang,
                  airportByCode(flight.destinationCode)?.city ?? { en: flight.destinationCode, ar: flight.destinationCode },
                )}
              </p>
              <Code className="text-sm text-muted-foreground">{flight.number}</Code>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {dateLong(flight.date, lang)} · <span className="code-id">{flight.departTime}</span>–
              <span className="code-id">{flight.arriveTime}</span> · {t("flights.gate")}{" "}
              <span className="code-id">{flight.gate}</span> · {flight.aircraft}
            </p>
          </Panel>
        ) : null,
      )}

      <Panel>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("book.passengersLabel")}</h2>
        <ul className="mt-3 divide-y divide-border">
          {booking.passengers.map((p, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span className="font-medium">
                {p.firstName} {p.lastName}
              </span>
              <span className="text-muted-foreground">
                {t("book.seatsLabel")}:{" "}
                <span className="code-id">
                  {[booking.seats[`out-${i}`], booking.seats[`in-${i}`]].filter(Boolean).join(" / ") || "—"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("book.baggage")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="numeral">
            {(fare?.checkedBags ?? 0) === 0 ? "—" : `${fare?.checkedBags} × 23 kg`}
          </span>
          {booking.extras.extraBags > 0 ? (
            <>
              {" · "}
              <span className="numeral">
                +{booking.extras.extraBags} {t("book.extraBag")} ({money(booking.extras.extraBags * EXTRA_BAG_PRICE, lang)})
              </span>
            </>
          ) : null}
        </p>
        <p className="mt-3 flex items-baseline justify-between border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">{t("book.total")}</span>
          <span className="text-lg font-bold">{money(booking.total, lang)}</span>
        </p>
      </Panel>

      {booking.status === "confirmed" ? (
        <Panel>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("manage.actions")}</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {onCheckin && !booking.checkedIn ? (
              <button type="button" onClick={onCheckin} className={btnClass("primary", "sm")}>
                <Ticket aria-hidden="true" className="size-4" />
                {t("manage.checkin")}
              </button>
            ) : null}
            <Link to="/account/boarding-passes" className={btnClass("outline", "sm")}>
              {t("book.boardingPass")}
            </Link>
            <Link to="/book" className={btnClass("outline", "sm")}>
              <Luggage aria-hidden="true" className="size-4" />
              {t("manage.addBags")}
            </Link>
            {onCancel ? (
              <button type="button" onClick={onCancel} className={btnClass("ghost", "sm")}>
                <XCircle aria-hidden="true" className="size-4" />
                {t("manage.cancel")}
              </button>
            ) : null}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
