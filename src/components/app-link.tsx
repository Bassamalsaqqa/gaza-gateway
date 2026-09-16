import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ComponentProps, ReactElement } from "react";
import { langFromPath, localizePath, swapLangPath, type Lang } from "@/lib/locale";

/**
 * The URL is the single source of truth for the active language.
 * `/…` is English, `/ar/…` is Arabic.
 */
export function useLang(): Lang {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return langFromPath(pathname);
}

export function usePathname(): string {
  return useRouterState({ select: (s) => s.location.pathname });
}

/** Canonical English path -> path in the active language. */
export function useLocaleHref(): (to: string) => string {
  const lang = useLang();
  return (to: string) => localizePath(to, lang);
}

/** Same logical page in the other language. */
export function useSwapLangHref(): (lang: Lang) => string {
  const pathname = usePathname();
  const search = useRouterState({ select: (s) => s.location.searchStr });
  return (lang: Lang) => `${swapLangPath(pathname, lang)}${search ?? ""}`;
}

type RouteParams = Record<string, string | undefined>;

function toRouteTarget(to: string) {
  const clean = to.startsWith("/") ? to : `/${to}`;
  return clean === "/" ? "/{-$locale}/" : `/{-$locale}${clean}`;
}

function localeParam(lang: Lang): RouteParams {
  return lang === "ar" ? { locale: "ar" } : { locale: undefined };
}

type AppLinkProps = Omit<ComponentProps<typeof Link>, "to" | "params"> & {
  to: string;
  params?: RouteParams;
};

/** Locale-preserving internal link. `to` is always the canonical English path. */
export function AppLink({ to, params, ...rest }: AppLinkProps) {
  const lang = useLang();
  const LinkAny = Link as unknown as (props: Record<string, unknown>) => ReactElement;
  return <LinkAny to={toRouteTarget(to)} params={{ ...params, ...localeParam(lang) }} {...rest} />;
}

/** Locale-preserving programmatic navigation. `to` is the canonical English path. */
export function useAppNavigate() {
  const navigate = useNavigate();
  const lang = useLang();
  return (opts: { to: string; params?: RouteParams; search?: Record<string, unknown>; replace?: boolean }) => {
    const navigateAny = navigate as unknown as (o: Record<string, unknown>) => Promise<void>;
    return navigateAny({
      ...opts,
      to: toRouteTarget(opts.to),
      params: { ...opts.params, ...localeParam(lang) },
    });
  };
}
