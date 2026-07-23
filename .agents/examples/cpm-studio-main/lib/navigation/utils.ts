import { locales, routing, type AppLocale } from "@/i18n/routing";
import { parseTenantSlug } from "@/lib/tenancy/slug";
import { ROUTES } from "./routes";

function isSupportedLocale(value: string | undefined): value is AppLocale {
  return !!value && locales.includes(value as AppLocale);
}

export function getLocaleFromPathname(pathname: string): AppLocale {
  const [, maybeLocale] = pathname.split("/");

  return isSupportedLocale(maybeLocale)
    ? maybeLocale
    : routing.defaultLocale;
}

export function getTenantFromPathname(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const tenantIndex = isSupportedLocale(segments[0]) ? 1 : 0;
  return parseTenantSlug(segments[tenantIndex]);
}

export function getInternalHref(pathname: string, search: string = "") {
  const segments = pathname.split("/").filter(Boolean);
  const internalSegments = isSupportedLocale(segments[0])
    ? segments.slice(1)
    : segments;
  const internalPathname =
    internalSegments.length === 0
      ? ROUTES.home
      : `/${internalSegments.join("/")}`;

  return `${internalPathname}${search}`;
}

export function getSafeRedirectHref(
  redirectTo: string | null | undefined,
  fallbackHref: string,
) {
  if (!redirectTo || !redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return fallbackHref;
  }

  return redirectTo;
}

export function isAbsoluteUrl(href: string) {
  return /^https?:\/\//i.test(href);
}

export function isRedirectResponse(response: Response) {
  return response.status >= 300 && response.status < 400;
}
