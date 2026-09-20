import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { BookingDetail } from "@/components/booking/booking-detail";
import { Container, EmptyState, GazaLoadingState, PageHeader, btnClass } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/{-$locale}/manage/$ref")({
  head: ({ params }) => ({
    meta: [
      { title: `Booking ${params.ref} — Gaza International Airport (GZA)` },
      {
        name: "description",
        content: "Your Palestinian Airlines booking: flights, passengers, seats, baggage, contact details and status.",
      },
      { property: "og:title", content: "Your booking — Palestinian Airlines" },
      { property: "og:description", content: "Flights, passengers, seats, baggage and booking status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ManageDetailPage,
});

function ManageDetailPage() {
  const { ref } = Route.useParams();
  const { t } = useI18n();
  const { findBooking, updateBooking, ready } = useStore();
  const booking = findBooking(ref);

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
            <div className="flex flex-wrap justify-center gap-2">
              <AppLink to="/manage" className={btnClass("primary", "md")}>
                {t("manage.title")}
              </AppLink>
              <AppLink to="/book" className={btnClass("outline", "md")}>
                {t("nav.book")}
              </AppLink>
            </div>
          }
        />
      </Container>
    );
  }

  return (
    <>
      <PageHeader eyebrow={t("nav.manage")} title={t("manage.title")} description={t("manage.sub")}>
        <AppLink to="/manage" className={btnClass("outline", "sm")}>
          {t("manage.find")}
        </AppLink>
      </PageHeader>
      <Container className="py-10">
        <div className="mx-auto max-w-3xl">
          <BookingDetail
            booking={booking}
            onCancel={() => updateBooking(booking.ref, { status: "cancelled" })}
          />
        </div>
      </Container>
    </>
  );
}
