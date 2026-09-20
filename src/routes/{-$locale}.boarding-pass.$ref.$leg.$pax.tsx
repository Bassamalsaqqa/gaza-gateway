import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { Printer, Ticket } from "lucide-react";
import { BoardingPassCard, passesForBooking } from "@/components/booking/boarding-pass";
import { Container, EmptyState, GazaLoadingState, Notice, PageHeader, btnClass } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/{-$locale}/boarding-pass/$ref/$leg/$pax")({
  head: ({ params }) => ({
    meta: [
      { title: `Boarding pass ${params.ref} — Gaza International Airport (GZA)` },
      {
        name: "description",
        content: "Boarding pass for a checked-in Palestinian Airlines flight: passenger, flight, seat, terminal and gate.",
      },
      { property: "og:title", content: "Boarding pass — Palestinian Airlines" },
      { property: "og:description", content: "Passenger, flight, seat, terminal and gate details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BoardingPassDetailPage,
});

function BoardingPassDetailPage() {
  const { ref, leg: legParam, pax } = Route.useParams();
  const leg = legParam === "in" ? "in" : "out";
  const { t } = useI18n();
  const { findBooking, ready } = useStore();
  const booking = findBooking(ref);
  const paxIndex = Number.parseInt(pax, 10);

  if (!ready) {
    return (
      <Container className="py-16">
        <GazaLoadingState />
      </Container>
    );
  }

  if (!booking) {
    return (
      <Container className="py-14">
        <EmptyState
          title={t("manage.notFound")}
          description={t("conf.notFoundSub")}
          action={
            <AppLink to="/manage" className={btnClass("primary", "md")}>
              {t("manage.title")}
            </AppLink>
          }
        />
      </Container>
    );
  }

  const passes = passesForBooking(booking).filter((p) => p.paxIndex === paxIndex && p.leg === leg);
  const passenger = booking.passengers[paxIndex];

  if (passes.length === 0 || !passenger) {
    return (
      <Container className="py-14">
        <EmptyState
          title={t("bp.unavailable")}
          description={booking.status === "cancelled" ? t("bp.cancelled") : t("bp.unavailableSub")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {booking.status === "confirmed" ? (
                <AppLink
                  to="/manage/$ref/check-in"
                  params={{ ref: booking.ref }}
                  className={btnClass("primary", "md")}
                >
                  <Ticket aria-hidden="true" className="size-4" />
                  {t("bp.checkinCta")}
                </AppLink>
              ) : (
                <AppLink to="/manage/$ref" params={{ ref: booking.ref }} className={btnClass("primary", "md")}>
                  {t("manage.backToBooking")}
                </AppLink>
              )}
              <AppLink to="/account/boarding-passes" className={btnClass("outline", "md")}>
                {t("bp.backToPasses")}
              </AppLink>
            </div>
          }
        />
      </Container>
    );
  }

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          eyebrow={t("bp.forBooking", { ref: booking.ref })}
          title={`${passenger.firstName} ${passenger.lastName}`.trim()}
          description={t("bp.sub")}
        >
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => window.print()} className={btnClass("primary", "sm")}>
              <Printer aria-hidden="true" className="size-4" />
              {t("bp.print")}
            </button>
            <AppLink to="/manage/$ref" params={{ ref: booking.ref }} className={btnClass("outline", "sm")}>
              {t("manage.title")}
            </AppLink>
            <AppLink to="/account/boarding-passes" className={btnClass("ghost", "sm")}>
              {t("bp.backToPasses")}
            </AppLink>
          </div>
        </PageHeader>
      </div>

      <Container className="py-8 sm:py-10">
        <div className="mx-auto max-w-3xl space-y-5">
          {passes.map((item) => (
            <BoardingPassCard key={`${item.leg}-${item.paxIndex}`} item={item} />
          ))}

          {booking.passengers.length > 1 ? (
            <nav aria-label={t("book.passengersLabel")} className="flex flex-wrap gap-2 print:hidden">
              {booking.passengers.map((p, i) => (p.type === "infant" ? null : (
                <AppLink
                  key={`${p.lastName}-${i}`}
                  to="/boarding-pass/$ref/$leg/$pax"
                  params={{ ref: booking.ref, leg, pax: String(i) }}
                  className={btnClass(i === paxIndex ? "ink" : "outline", "sm")}
                >
                  {p.firstName} {p.lastName}
                </AppLink>
              )))}
            </nav>
          ) : null}

          <div className="print:hidden">
            <Notice>{t("bp.notReal")}</Notice>
          </div>
        </div>
      </Container>
    </>
  );
}
