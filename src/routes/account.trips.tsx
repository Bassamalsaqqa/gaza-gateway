import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/account/trips")({
  component: () => <Outlet />,
});
