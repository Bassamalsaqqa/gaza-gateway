import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLang, usePathname } from "@/components/app-link";
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
import { I18nProvider } from "@/lib/i18n";
import { StoreProvider } from "@/lib/store";
import { AdminProvider } from "@/lib/admin-store";
import { stripLocale } from "@/lib/locale";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BackToTop } from "@/components/back-to-top";
import { btnClass } from "@/components/kit";
import { PublicNotFound } from "@/components/public-not-found";
import { SkinPreviewListener, SkinStyle } from "@/components/skin-provider";
import { SurfaceGrammarProvider } from "@/design/surfaces";

/** Detect locale from pathname safely without requiring I18nProvider. */
function detectLocale(): "ar" | "en" {
  if (typeof window !== "undefined") {
    return window.location.pathname.startsWith("/ar") ? "ar" : "en";
  }
  return "en";
}

const ERROR_STRINGS = {
  en: {
    heading: "Something went wrong",
    body: "This page didn't load. You can try again or head back to the homepage.",
    tryAgain: "Try again",
    goHome: "Go home",
  },
  ar: {
    heading: "حدث خطأ",
    body: "تعذّر تحميل هذه الصفحة. يمكنك المحاولة مرة أخرى أو العودة إلى الصفحة الرئيسية.",
    tryAgain: "حاول مرة أخرى",
    goHome: "العودة إلى الرئيسية",
  },
} as const;

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  const locale = detectLocale();
  const s = ERROR_STRINGS[locale];
  const dir = locale === "ar" ? "rtl" : "ltr";
  const homeHref = locale === "ar" ? "/ar" : "/";

  return (
    <div dir={dir} className="flex min-h-[60vh] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{s.heading}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {s.body}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className={btnClass("primary", "md")}
          >
            {s.tryAgain}
          </button>
          <a href={homeHref} className={btnClass("outline", "md")}>
            {s.goHome}
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
      { property: "og:image", content: "/social/gaza-airport.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content:
          "Aerial architectural concept of the future Gaza International Airport — illustrative future concept.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "/social/gaza-airport.jpg" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon", sizes: "16x16 32x32 48x48" },
      { rel: "icon", href: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { rel: "icon", href: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
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
  notFoundComponent: PublicNotFound,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  // Rendered on the server from the URL, so /ar/... never flashes English or LTR.
  const lang = useLang();
  return (
    <html lang={lang} dir={dirOf(lang)}>
      <head>
        <HeadContent />
        <SkinStyle />
      </head>
      <body className="bg-ambient">
        <SkinPreviewListener />
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
            <SurfaceGrammarProvider>
              <SiteFrame />
            </SurfaceGrammarProvider>
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

  return (
    <>
      {isAdmin ? (
        <Outlet />
      ) : (
        <div className="flex min-h-screen flex-col bg-ambient">
          <SiteHeader />
          <main id="main" className="flex-1">
            {/* Required: nested routes render here. */}
            <Outlet />
          </main>
          <SiteFooter />
        </div>
      )}
      <BackToTop />
    </>
  );
}
