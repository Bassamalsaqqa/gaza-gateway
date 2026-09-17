import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLink, useLang, usePathname } from "@/components/app-link";
import { dirOf } from "@/lib/locale";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { StoreProvider } from "@/lib/store";
import { AdminProvider } from "@/lib/admin-store";
import { stripLocale } from "@/lib/locale";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { btnClass } from "@/components/kit";

function NotFoundComponent() {
  const { t } = useI18n();
  const links = [
    { to: "/", label: t("nav.home") },
    { to: "/flights", label: t("nav.flights") },
    { to: "/manage", label: t("nav.manage") },
    { to: "/contact", label: t("nav.contact") },
  ] as const;

  return (
    <div className="bg-background px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-2xl">
        <p className="code-id text-5xl font-bold text-clay sm:text-7xl">404</p>
        <h1 className="mt-4 text-2xl font-bold text-foreground sm:text-4xl">{t("notfound.title")}</h1>
        <p className="mt-3 max-w-lg text-sm text-muted-foreground sm:text-base">{t("notfound.sub")}</p>

        <p className="eyebrow mt-8 text-muted-foreground">{t("notfound.help")}</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {links.map((link) => (
            <li key={link.to}>
              <AppLink to={link.to} className={btnClass(link.to === "/" ? "primary" : "outline", "md")}>
                {link.label}
              </AppLink>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page didn't load. You can try again or head back to the homepage.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className={btnClass("primary", "md")}
          >
            Try again
          </button>
          <a href="/" className={btnClass("outline", "md")}>
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Gaza International Airport (GZA) — Palestinian Airlines" },
      {
        name: "description",
        content:
          "Flights from Gaza International Airport with Palestinian Airlines, plus the airport's past, present and future.",
      },
      { property: "og:title", content: "Gaza International Airport (GZA)" },
      {
        property: "og:description",
        content: "Book Palestinian Airlines flights from Gaza and explore the airport's history and future vision.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Manrope:wght@400..800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  // Rendered on the server from the URL, so /ar/... never flashes English or LTR.
  const lang = useLang();
  return (
    <html lang={lang} dir={dirOf(lang)}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <StoreProvider>
          <AdminProvider>
            <SiteFrame />
          </AdminProvider>
        </StoreProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

/** The staff workspace has its own chrome, so it opts out of the public shell. */
function SiteFrame() {
  const path = stripLocale(usePathname());
  const isAdmin = path === "/admin" || path.startsWith("/admin/");

  if (isAdmin) {
    return <Outlet />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        {/* Required: nested routes render here. */}
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
