import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { PublicNotFound } from "@/components/public-not-found";

/**
 * Locale segment. Unprefixed paths are English (canonical); `/ar/...` is Arabic.
 * Unknown unprefixed paths remain English and fall through to the root 404.
 * Do not reject a non-`ar` first segment here: doing so moves the not-found
 * boundary above the public shell and makes Apache shell hydration diverge.
 */
export const Route = createFileRoute("/{-$locale}")({
  component: LocaleLayout,
});

const subscribe = () => () => {};

function LocaleLayout() {
  const { locale } = Route.useParams();
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);

  // The static English shell is generated from `/` and must hydrate unchanged.
  // Resolve an invalid optional locale segment to the public 404 immediately
  // after hydration instead of throwing above the shared public shell.
  if (hydrated && locale && locale !== "ar") return <PublicNotFound />;
  return <Outlet />;
}
