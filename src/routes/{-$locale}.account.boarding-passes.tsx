import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { Ticket } from "lucide-react";
import { BoardingPassCard, passesForBooking } from "@/components/booking/boarding-pass";
import { btnClass, EmptyState, Notice, Panel, Pill } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import type { Flight } from "@/lib/data";
import { anyCheckedIn } from "@/lib/domain/booking";
import { useMyBookings } from "@/lib/passenger";
import { flightKeys } from "@/lib/repositories/keys";
import { useRepositories } from "@/lib/repositories/registry";

export const Route = createFileRoute("/{-$locale}/account/boarding-passes")({
  head: () => ({
    meta: [
      { title: "Boarding passes — Gaza International Airport (GZA)" },
      {
        name: "description",
        content: "All boarding passes for your checked-in Palestinian Airlines flights, ready to view and print.",
      },
      { property: "og:title", content: "Boarding passes — Palestinian Airlines" },
      { property: "og:description", content: "View and print boarding passes for checked-in flights." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BoardingPassesPage,
});

function BoardingPassesPage() {
  const { t } = useI18n();
  const { data: bookings } = useMyBookings();
  const { flight: flightRepo } = useRepositories();
  const bookingLegs = useMemo(() => bookings.flatMap(b =>
    b.status === "confirmed" ? (["out", "in"] as const).filter(leg => leg === "out" || b.inbound).map(leg => ({ ref: b.ref, leg })) : []), [bookings]);
  const flightQueries = useQueries({
    queries: bookingLegs.map(({ ref, leg }) => ({
      queryKey: flightKeys.bookingLeg(ref, leg),
      queryFn: () => flightRepo.getBookingFlight(ref, leg),
    })),
  });
  const effectiveFlightMap = useMemo(() => {
    const map = new Map<string, Flight | null>();
    bookingLegs.forEach(({ ref, leg }, index) => {
      const query = flightQueries[index];
      map.set(`${ref}:${leg}`, query?.isSuccess && !query.isError ? query.data : null);
    });
    return map;
  }, [bookingLegs, flightQueries]);

  const passes = useMemo(() => {
    return bookings.flatMap((b) => {
      const outEff = (b.outbound?.id ? effectiveFlightMap.get(`${b.ref}:out`) : null) ?? null;
      const inEff = (b.inbound?.id ? effectiveFlightMap.get(`${b.ref}:in`) : null) ?? null;
      return passesForBooking(b, { out: outEff, in: inEff });
    });
  }, [bookings, effectiveFlightMap]);

  const pendingCheckin = bookings.filter((b) => b.status === "confirmed" && !anyCheckedIn(b));

  if (passes.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          title={t("account.noPasses")}
          description={t("account.noPassesSub")}
          icon={<Ticket aria-hidden="true" className="size-6" />}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {pendingCheckin[0] ? (
                <AppLink
                  to="/manage/$ref/check-in"
                  params={{ ref: pendingCheckin[0].ref }}
                  className={btnClass("primary", "md")}
                >
                  {t("bp.checkinCta")}
                </AppLink>
              ) : null}
              <AppLink to="/manage" className={btnClass("outline", "md")}>
                {t("manage.title")}
              </AppLink>
              <AppLink to="/book" className={btnClass("ghost", "md")}>
                {t("nav.book")}
              </AppLink>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pill tone="brand">{passes.length === 1 ? t("bp.countOne") : t("bp.count", { n: passes.length })}</Pill>
        <AppLink to="/manage" className={btnClass("outline", "sm")}>
          {t("manage.title")}
        </AppLink>
      </div>

      <Notice>{t("bp.notReal")}</Notice>

      <ul className="space-y-5">
        {passes.map((item) => (
          <li key={`${item.ref}-${item.leg}-${item.paxIndex}`} className="space-y-2">
            <BoardingPassCard item={item} compact />
            <div className="flex flex-wrap gap-2">
              <AppLink
                to="/boarding-pass/$ref/$leg/$pax"
                params={{ ref: item.ref, leg: item.leg, pax: String(item.paxIndex) }}
                className={btnClass("primary", "sm")}
              >
                {t("bp.view")}
              </AppLink>
              <AppLink
                to="/account/trips/$ref"
                params={{ ref: item.ref }}
                className={btnClass("outline", "sm")}
              >
                {t("book.viewBooking")}
              </AppLink>
            </div>
          </li>
        ))}
      </ul>

      {pendingCheckin.length > 0 ? (
        <Panel>
          <p className="eyebrow text-clay">{t("manage.checkin")}</p>
          <ul className="mt-3 space-y-2">
            {pendingCheckin.map((b) => (
              <li key={b.ref} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="code-id font-semibold">{b.ref}</span>
                <AppLink to="/manage/$ref/check-in" params={{ ref: b.ref }} className={btnClass("outline", "sm")}>
                  {t("bp.checkinCta")}
                </AppLink>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
