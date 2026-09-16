import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppLink, useAppNavigate } from "@/components/app-link";
import { SeatMap } from "@/components/booking/seat-map";
import { btnClass, Code, Container, EmptyState, PageHeader, Panel } from "@/components/kit";
import { airportByCode, seatFee } from "@/lib/data";
import { dateLong, money } from "@/lib/format";
import { pick, useI18n } from "@/lib/i18n";
import { bookingLegs, bookingTotal, isCheckedIn, type Leg, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/{-$locale}/manage/$ref_/seats")({
  head: ({ params }) => ({
    meta: [
      { title: `Change seats — booking ${params.ref} — Gaza International Airport (GZA)` },
      {
        name: "description",
        content: "Change the seats on your Palestinian Airlines booking for each flight of your trip.",
      },
      { property: "og:title", content: "Change seats — Palestinian Airlines" },
      { property: "og:description", content: "Pick different seats for the flights on your booking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ManageSeatsPage,
});

function ManageSeatsPage() {
  const { ref } = Route.useParams();
  const { t, lang } = useI18n();
  const navigate = useAppNavigate();
  const { ready, findBooking, updateBooking, account } = useStore();
  const booking = findBooking(ref);

  const legs = useMemo(() => (booking ? bookingLegs(booking) : []), [booking]);
  const [leg, setLeg] = useState<Leg>("out");
  const [seats, setSeats] = useState<Record<string, string>>(booking?.seats ?? {});
  const [activePax, setActivePax] = useState(0);

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

  if (booking.status === "cancelled") {
    return (
      <Container className="py-16">
        <EmptyState
          title={t("manage.notEditable")}
          description={t("ci.cancelledNote")}
          action={
            <AppLink to="/manage/$ref" params={{ ref: booking.ref }} className={btnClass("primary", "md")}>
              {t("manage.backToBooking")}
            </AppLink>
          }
        />
      </Container>
    );
  }

  const flight = leg === "in" && booking.inbound ? booking.inbound : booking.outbound;
  const seatable = booking.passengers.flatMap((p, i) => (p.type === "infant" ? [] : [i]));
  const paxLabel = (i: number) => {
    const p = booking.passengers[i];
    return `${p?.firstName ?? ""} ${p?.lastName ?? ""}`.trim() || `${t("book.passenger")} ${i + 1}`;
  };

  const save = () => {
    const totals = bookingTotal({
      outbound: booking.outbound,
      inbound: booking.inbound,
      fareId: booking.fareId,
      criteria: booking.criteria,
      seats,
      extras: booking.extras,
    });
    updateBooking(booking.ref, { seats, total: totals.total });
    void navigate({ to: "/manage/$ref", params: { ref: booking.ref } });
  };

  const seatCharges = Object.values(seats).reduce(
    (sum, seat) => sum + seatFee(Number(seat.replace(/\D/g, ""))),
    0,
  );

  return (
    <Container className="py-8 sm:py-12">
      <PageHeader
        eyebrow={t("nav.manage")}
        title={t("manage.seatsTitle")}
        description={t("manage.seatsSub", { ref: booking.ref })}
      />

      {legs.length > 1 ? (
        <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label={t("ci.chooseLeg")}>
          {legs.map((l) => {
            const f = l === "in" && booking.inbound ? booking.inbound : booking.outbound;
            return (
              <button
                key={l}
                type="button"
                onClick={() => setLeg(l)}
                aria-pressed={leg === l}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                  leg === l ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-muted-foreground",
                )}
              >
                {t(l === "out" ? "ci.legOut" : "ci.legIn")} <Code className="ms-1">{f.number}</Code>
              </button>
            );
          })}
        </div>
      ) : null}

      <Panel className="mt-5">
        <p className="text-sm text-muted-foreground">
          {pick(lang, airportByCode(flight.originCode)?.city ?? { en: flight.originCode, ar: flight.originCode })} →{" "}
          {pick(lang, airportByCode(flight.destinationCode)?.city ?? { en: flight.destinationCode, ar: flight.destinationCode })}{" "}
          · {dateLong(flight.date, lang)} · <span className="code-id">{flight.departTime}</span>
        </p>
        {isCheckedIn(booking, leg) ? (
          <p className="mt-2 text-xs text-muted-foreground">{t("ci.alreadyDone")}</p>
        ) : null}
        {account?.seatPreference && account.seatPreference !== "none" ? (
          <p className="mt-2 text-xs text-muted-foreground">{t("ci.seatSuggestion")}</p>
        ) : null}

        <div className="mt-5">
          <SeatMap
            flightId={flight.id}
            assignments={Object.fromEntries(
              seatable.flatMap((i, pos) => {
                const seat = seats[`${leg}-${i}`];
                return seat ? [[pos, seat]] : [];
              }),
            )}
            activePassenger={Math.max(0, seatable.indexOf(activePax))}
            onActivePassengerChange={(pos) => setActivePax(seatable[pos] ?? 0)}
            onSelect={(pos, seat) => {
              const target = seatable[pos];
              if (target === undefined) return;
              setSeats((prev) => ({ ...prev, [`${leg}-${target}`]: seat }));
            }}
            passengerLabels={seatable.map((i) => paxLabel(i))}
          />
        </div>

        <p className="mt-5 flex items-baseline justify-between border-t border-border pt-4 text-sm">
          <span className="text-muted-foreground">{t("book.seatFees")}</span>
          <span className="font-bold">{money(seatCharges, lang)}</span>
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={save} className={btnClass("primary", "md")}>
            {t("common.save")}
          </button>
          <AppLink to="/manage/$ref" params={{ ref: booking.ref }} className={btnClass("secondary", "md")}>
            {t("common.cancel")}
          </AppLink>
        </div>
      </Panel>
    </Container>
  );
}
