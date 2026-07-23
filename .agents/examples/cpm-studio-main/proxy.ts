import {
  convexAuthNextjsMiddleware,
} from "@convex-dev/auth/nextjs/server";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { ROUTES } from "@/lib/navigation/routes";
import {
  getInternalHref,
  getLocaleFromPathname,
  getTenantFromPathname,
  isRedirectResponse,
} from "@/lib/navigation/utils";
import {
  getTenantCanonicalHref,
  getTenantHostInternalHref,
  getTenantHostUrl,
  normalizeHostname,
  getTenantSlugFromHost,
} from "@/lib/tenancy/domain";

const intlMiddleware = createIntlMiddleware(routing);
const supportedLocales = new Set<string>(routing.locales);

// Convex Auth (`@convex-dev/auth/nextjs/server`) sets session cookies with the
// `__Host-` prefix, which by spec must be host-only and cannot carry a `Domain`
// attribute. The current API of `convexAuthNextjsMiddleware` does not expose a
// `cookieConfig.domain` option either. As a result, sessions cannot be shared
// between the apex domain (e.g. `cpm.local`) and tenant subdomains
// (e.g. `acme.cpm.local`); each host carries its own session.
// The app reflects this on purpose: `(public)/sign-in` exists at the apex for
// platform admins, and `(public)/[tenant]/(auth)/sign-in` exists per-tenant.
// Tenant authorization (membership, role) is enforced inside Convex via
// `convex/lib/authz.ts`; this middleware only checks that *some* session is
// authenticated and routes accordingly.
function getPathnameFromHref(href: string) {
  return new URL(href, "http://internal.local").pathname;
}

function getUrlFromHref(href: string) {
  return new URL(href, "http://internal.local");
}

function hasLocalePrefix(pathname: string) {
  const [, maybeLocale] = pathname.split("/");
  return supportedLocales.has(maybeLocale);
}

function getSameHostLocalizedUrl(request: Request) {
  const redirectUrl = new URL(request.url);
  const pathname = redirectUrl.pathname === "/" ? "" : redirectUrl.pathname;
  redirectUrl.pathname = `/${routing.defaultLocale}${pathname}`;
  return redirectUrl;
}

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  if (
    request.nextUrl.pathname.startsWith("/api") ||
    request.nextUrl.pathname.startsWith("/trpc")
  ) {
    return NextResponse.next();
  }

  const normalizedHost = normalizeHostname(request.headers.get("host"));
  const tenantFromManagedHost = getTenantSlugFromHost(normalizedHost);

  if (tenantFromManagedHost && !hasLocalePrefix(request.nextUrl.pathname)) {
    return NextResponse.redirect(getSameHostLocalizedUrl(request).toString());
  }

  const intlResponse = intlMiddleware(request);
  if (isRedirectResponse(intlResponse)) {
    return intlResponse;
  }

  const locale = getLocaleFromPathname(request.nextUrl.pathname);
  const rawInternalHref = getInternalHref(
    request.nextUrl.pathname,
    request.nextUrl.search,
  );
  const tenantFromHost = tenantFromManagedHost;
  const tenantFromPath = getTenantFromPathname(request.nextUrl.pathname);

  if (tenantFromPath && !tenantFromHost) {
    return NextResponse.redirect(
      getTenantHostUrl(
        tenantFromPath,
        locale,
        getTenantCanonicalHref(rawInternalHref, tenantFromPath),
      ),
    );
  }

  const effectiveInternalHref = tenantFromHost
    ? getTenantHostInternalHref(rawInternalHref, tenantFromHost)
    : rawInternalHref;
  const rawInternalPathname = getPathnameFromHref(rawInternalHref);
  const isAuthenticated = await convexAuth.isAuthenticated();
  const tenant = tenantFromPath ?? tenantFromHost;

  const isGlobalSignInRoute =
    !tenantFromHost && rawInternalPathname === ROUTES.auth.signIn;
  const isInviteRoute = !tenantFromHost && rawInternalPathname === ROUTES.auth.invite;
  const isTenantSignInRoute =
    !!tenantFromHost && rawInternalPathname === ROUTES.tenant.auth.signIn(tenantFromHost);
  const isLocaleRootRoute = !tenantFromHost && rawInternalPathname === ROUTES.home;

  const isPublicRoute =
    isGlobalSignInRoute ||
    isInviteRoute ||
    isTenantSignInRoute ||
    isLocaleRootRoute;
  if (!isPublicRoute && !isAuthenticated) {
    const signInHref =
      tenant && !tenantFromHost
        ? ROUTES.tenant.auth.signIn(tenant)
        : ROUTES.auth.signIn;
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = getPathname({ locale, href: signInHref });
    signInUrl.search = "";
    signInUrl.searchParams.set(
      "redirectTo",
      getInternalHref(request.nextUrl.pathname, request.nextUrl.search),
    );
    return NextResponse.redirect(signInUrl.toString());
  }

  if (tenantFromHost && effectiveInternalHref !== rawInternalHref) {
    const internalUrl = getUrlFromHref(effectiveInternalHref);
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = getPathname({
      locale,
      href: internalUrl.pathname,
    });
    rewriteUrl.search = internalUrl.search;
    return NextResponse.rewrite(rewriteUrl);
  }

  return intlResponse;
});

export const config = {
  matcher: [
    "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
    "/",
    "/(api|trpc)(.*)",
  ],
};
