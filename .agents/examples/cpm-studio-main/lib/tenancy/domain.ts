import { ROUTES } from "@/lib/navigation/routes";
import { getPathname } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getRootDomain } from "./hostname";

export {
  getRootDomain,
  getTenantSlugFromHost,
  normalizeHostname,
} from "./hostname";

function toUrl(href: string) {
  return new URL(href, "http://internal.local");
}

function toLocalizedPathname(locale: AppLocale, href: string) {
  const url = toUrl(href);
  const localizedPathname = getPathname({
    locale,
    href: url.pathname,
  });

  return `${localizedPathname}${url.search}${url.hash}`;
}

function getProtocol() {
  return process.env.NODE_ENV === "production" ? "https" : "http";
}

function getTenantInternalRoot(tenantSlug: string) {
  return `/${tenantSlug}`;
}

export function getTenantHostInternalHref(
  internalHref: string,
  tenantSlug: string,
) {
  const url = toUrl(internalHref);
  const { pathname, search, hash } = url;
  const tenantRoot = getTenantInternalRoot(tenantSlug);

  let nextPathname = pathname;

  if (pathname === ROUTES.home) {
    nextPathname = tenantRoot;
  } else if (pathname !== tenantRoot && !pathname.startsWith(`${tenantRoot}/`)) {
    nextPathname = `${tenantRoot}${pathname}`;
  }

  return `${nextPathname}${search}${hash}`;
}

export function getTenantCanonicalHref(
  internalHref: string,
  tenantSlug: string,
) {
  const tenantRoot = getTenantInternalRoot(tenantSlug);
  const url = toUrl(internalHref);

  let nextPathname = url.pathname;
  if (nextPathname === tenantRoot) {
    nextPathname = ROUTES.home;
  } else if (nextPathname.startsWith(`${tenantRoot}/`)) {
    nextPathname = nextPathname.slice(tenantRoot.length);
  }

  return `${nextPathname}${url.search}${url.hash}`;
}

export function extractCampusSlug(href: string) {
  return href.match(/(?:^|\/)campuses\/([^/?#]+)/)?.[1] ?? null;
}

export function getRootHostUrl(locale: AppLocale, href: string = ROUTES.home) {
  return `${getProtocol()}://${getRootDomain()}${toLocalizedPathname(locale, href)}`;
}

export function getTenantHostUrl(
  tenantSlug: string,
  locale: AppLocale,
  href: string = ROUTES.home,
) {
  return `${getProtocol()}://${tenantSlug}.${getRootDomain()}${toLocalizedPathname(locale, href)}`;
}
