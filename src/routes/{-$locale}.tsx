import { Outlet, createFileRoute, notFound } from "@tanstack/react-router";

/**
 * Locale segment. Unprefixed paths are English (canonical); `/ar/...` is Arabic.
 * Any other prefix value is not a language and falls through to the site 404.
 */
export const Route = createFileRoute("/{-$locale}")({
  beforeLoad: ({ params }) => {
    const locale = (params as { locale?: string }).locale;
    if (locale && locale !== "ar") throw notFound();
  },
  component: () => <Outlet />,
});
