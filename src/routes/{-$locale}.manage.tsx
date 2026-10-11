import { identityUiRequested } from "@/lib/api/identity-ui-runtime";
import { MvpBookingAccess } from "@/components/booking/mvp-booking-access";
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/{-$locale}/manage")({
  component: () => identityUiRequested ? <MvpBookingAccess /> : <Outlet />,
});
