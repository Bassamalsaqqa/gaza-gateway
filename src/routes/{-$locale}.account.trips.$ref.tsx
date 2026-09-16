import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { BookingDetail } from "@/components/booking/booking-detail";
import { btnClass, EmptyState } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/{-$locale}/account/trips/$ref")({
  head: ({ params }) => ({
    meta: [
      { title: `Trip ${params.ref} — Gaza International Airport (GZA)` },
      { name: "description", content: "Trip details: flights, passengers, seats, baggage and management actions." },
      { property: "og:title", content: "Trip details — Gaza International Airport" },
      { property: "og:description", content: "Flights, passengers, seats and baggage for this booking." },
    ],
  }),
  component: TripDetailPage,
});

function TripDetailPage() {
  const { ref } = Route.useParams();
  const { t } = useI18n();
  const { findBooking, updateBooking } = useStore();
  const booking = findBooking(ref);

  if (!booking) {
    return (
      <EmptyState
        title={t("manage.notFound")}
        description={t("account.noTripsSub")}
        action={
          <AppLink to="/account/trips" className={btnClass("primary", "md")}>
            {t("account.trips")}
          </AppLink>
        }
      />
    );
  }

  return (
    <div>
      <AppLink to="/account/trips" className={btnClass("ghost", "sm", "mb-4")}>
        {t("common.back")}
      </AppLink>
      <BookingDetail
        booking={booking}
        onCancel={() => updateBooking(booking.ref, { status: "cancelled" })}
      />
    </div>
  );
}
