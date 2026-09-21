import { createFileRoute } from "@tanstack/react-router";
import { PublicNotFound } from "@/components/public-not-found";

export const Route = createFileRoute("/{-$locale}/$")({
  component: PublicNotFound,
});
