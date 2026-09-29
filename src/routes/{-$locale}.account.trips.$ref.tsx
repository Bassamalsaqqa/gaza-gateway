import { AppLink } from "@/components/app-link";
import { createFileRoute } from "@tanstack/react-router";
import { BookingDetail } from "@/components/booking/booking-detail";
import { btnClass, EmptyState, GazaLoadingState } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { bookingBelongsToAccount, usePassengerAccount } from "@/lib/passenger";
import { useBookingQuery, useUpdateBookingMutation } from "@/lib/repositories/queries";

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
  const { data: account, isLoading: accountLoading } = usePassengerAccount();
  const { data: booking, isLoading: bookingLoading } = useBookingQuery(ref);
  const updateMutation = useUpdateBookingMutation();

  if (accountLoading || bookingLoading) {
    return <GazaLoadingState />;
  }

  // Reject unowned guest bookings and bookings belonging to another account
  const isAuthorized = Boolean(
    booking && account && bookingBelongsToAccount(booking, account.email),
  );

  if (!booking || !isAuthorized) {
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
        onCancel={async () => {
          await updateMutation.mutateAsync({ ref: booking.ref, patch: { status: "cancelled" } });
        }}
      />
    </div>
  );
}
