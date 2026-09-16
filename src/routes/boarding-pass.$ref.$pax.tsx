import { Link, createFileRoute } from "@tanstack/react-router";
import { Printer, Ticket } from "lucide-react";
import { BoardingPassCard, passesForBooking } from "@/components/booking/boarding-pass";
import { btnClass, Container, EmptyState, Notice, PageHeader } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/boarding-pass/$ref/$pax")({
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
  const { ref, pax } = Route.useParams();
  const { t } = useI18n();
  const { findBooking, ready } = useStore();
  const booking = findBooking(ref);
  const paxIndex = Number.parseInt(pax, 10);

  if (!ready) {
    return (
      <Container className="py-16">
        <p className="text-sm text-muted-foreground">…</p>
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
            <Link to="/manage" className={btnClass("primary", "md")}>
              {t("manage.title")}
            </Link>
          }
        />
      </Container>
    );
  }

  const passes = passesForBooking(booking).filter((p) => p.paxIndex === paxIndex);
  const passenger = booking.passengers[paxIndex];

  if (passes.length === 0 || !passenger) {
    return (
      <Container className="py-14">
        <EmptyState
          title={booking.status === "cancelled" ? t("bp.unavailable") : t("bp.unavailable")}
          description={booking.status === "cancelled" ? t("bp.cancelled") : t("bp.unavailableSub")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/manage/$ref" params={{ ref: booking.ref }} className={btnClass("primary", "md")}>
                <Ticket aria-hidden="true" className="size-4" />
                {t("bp.checkinCta")}
              </Link>
              <Link to="/account/boarding-passes" className={btnClass("outline", "md")}>
                {t("bp.backToPasses")}
              </Link>
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
            <Link to="/manage/$ref" params={{ ref: booking.ref }} className={btnClass("outline", "sm")}>
              {t("manage.title")}
            </Link>
            <Link to="/account/boarding-passes" className={btnClass("ghost", "sm")}>
              {t("bp.backToPasses")}
            </Link>
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
              {booking.passengers.map((p, i) => (
                <Link
                  key={`${p.lastName}-${i}`}
                  to="/boarding-pass/$ref/$pax"
                  params={{ ref: booking.ref, pax: String(i) }}
                  className={btnClass(i === paxIndex ? "ink" : "outline", "sm")}
                >
                  {p.firstName} {p.lastName}
                </Link>
              ))}
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
