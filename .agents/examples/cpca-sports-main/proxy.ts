import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { routing, locales } from "./i18n/routing";
import {
  DEFAULT_TENANT_SLUG,
  isMultiTenantMode,
  isSingleTenantMode,
} from "@/lib/tenancy/config";

const intlMiddleware = createIntlMiddleware(routing);
const ORGANIZATIONS_PATH = "/organizations";
const SINGLE_TENANT_MODE = isSingleTenantMode();
const DEFAULT_TENANT_SIGN_IN_PATH = `/${DEFAULT_TENANT_SLUG}/sign-in`;
const DEFAULT_TENANT_SIGN_UP_PATH = `/${DEFAULT_TENANT_SLUG}/sign-up`;
const DEFAULT_TENANT_APPLICATIONS_PATH = `/${DEFAULT_TENANT_SLUG}/applications`;

// Only sign-in and sign-up routes are public.
// Note: `createRouteMatcher("/:locale/...")` matches *any* first segment, not just our supported locales.
// Always expand locale patterns explicitly to avoid redirect loops like `/cpca-sports/sign-in -> /cpca-sports/sign-in`.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/:slug/sign-in(.*)",
  "/:slug/sign-up(.*)",
  ...locales.flatMap((locale) => [
    `/${locale}/sign-in(.*)`,
    `/${locale}/sign-up(.*)`,
    `/${locale}/:slug/sign-in(.*)`,
    `/${locale}/:slug/sign-up(.*)`,
  ]),
]);

// Admin routes are blocked at proxy level.
const isAdminRoute = createRouteMatcher([
  "/admin(.*)",
  ...locales.map((locale) => `/${locale}/admin(.*)`),
]);
const isOrganizationsRoute = createRouteMatcher([
  "/organizations(.*)",
  ...locales.map((locale) => `/${locale}/organizations(.*)`),
]);
const isNonTenantSignInRoute = createRouteMatcher([
  "/sign-in(.*)",
  ...locales.map((locale) => `/${locale}/sign-in(.*)`),
]);
const isNonTenantSignUpRoute = createRouteMatcher([
  "/sign-up(.*)",
  ...locales.map((locale) => `/${locale}/sign-up(.*)`),
]);
const isApiRoute = createRouteMatcher(["/api(.*)", "/trpc(.*)"]);

// Reserved paths that are not tenant slugs
const RESERVED_PATHS = new Set([
  "admin",
  "sign-in",
  "sign-up",
  "organizations",
  "api",
  "_next",
  "static",
  ...locales,
]);

/**
 * Extract tenant slug from pathname.
 */
function extractTenant(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);

  // Skip locale if present
  let startIndex = 0;
  if (
    segments[0] &&
    locales.includes(segments[0] as (typeof locales)[number])
  ) {
    startIndex = 1;
  }

  const potentialTenant = segments[startIndex];
  return potentialTenant && !RESERVED_PATHS.has(potentialTenant)
    ? potentialTenant
    : null;
}

function extractLocale(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const potentialLocale = segments[0];
  if (
    potentialLocale &&
    locales.includes(potentialLocale as (typeof locales)[number])
  ) {
    return potentialLocale;
  }
  return null;
}

function buildLocalizedPath(pathname: string, basePath: string): string {
  const locale = extractLocale(pathname);
  return locale ? `/${locale}${basePath}` : basePath;
}

function replaceTenantInPathname(pathname: string, tenantSlug: string) {
  const segments = pathname.split("/").filter(Boolean);

  // Skip locale if present
  let tenantIndex = 0;
  if (
    segments[0] &&
    locales.includes(segments[0] as (typeof locales)[number])
  ) {
    tenantIndex = 1;
  }

  const currentTenant = segments[tenantIndex];
  if (!currentTenant || RESERVED_PATHS.has(currentTenant)) {
    return null;
  }

  if (currentTenant === tenantSlug) {
    return null;
  }

  segments[tenantIndex] = tenantSlug;
  return `/${segments.join("/")}`;
}

const middlewareOptions = isMultiTenantMode()
  ? {
      organizationSyncOptions: {
        // Sync organization based on URL slug (excludes admin via RESERVED_PATHS)
        organizationPatterns: [
          "/:slug",
          "/:slug/(.*)",
          "/:locale/:slug",
          "/:locale/:slug/(.*)",
        ],
      },
    }
  : {};

export default clerkMiddleware(async (auth, req) => {
  if (SINGLE_TENANT_MODE) {
    const canonicalPathname = replaceTenantInPathname(
      req.nextUrl.pathname,
      DEFAULT_TENANT_SLUG,
    );
    if (canonicalPathname) {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = canonicalPathname;
      return NextResponse.redirect(redirectUrl);
    }

    if (isNonTenantSignInRoute(req)) {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = buildLocalizedPath(
        req.nextUrl.pathname,
        DEFAULT_TENANT_SIGN_IN_PATH,
      );
      return NextResponse.redirect(redirectUrl);
    }

    if (isNonTenantSignUpRoute(req)) {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = buildLocalizedPath(
        req.nextUrl.pathname,
        DEFAULT_TENANT_SIGN_UP_PATH,
      );
      return NextResponse.redirect(redirectUrl);
    }

    if (isOrganizationsRoute(req)) {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = buildLocalizedPath(
        req.nextUrl.pathname,
        DEFAULT_TENANT_APPLICATIONS_PATH,
      );
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (isAdminRoute(req)) {
    const redirectPath = buildLocalizedPath(
      req.nextUrl.pathname,
      SINGLE_TENANT_MODE
        ? DEFAULT_TENANT_APPLICATIONS_PATH
        : ORGANIZATIONS_PATH,
    );
    return NextResponse.redirect(new URL(redirectPath, req.url));
  }

  const authObject = await auth();
  const { userId } = authObject;
  const isAuthenticated = !!userId;

  if (isApiRoute(req)) {
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Protect all routes except public ones
  if (!isAuthenticated && !isPublicRoute(req)) {
    const tenant = SINGLE_TENANT_MODE
      ? DEFAULT_TENANT_SLUG
      : extractTenant(req.nextUrl.pathname);
    const signInPathBase = tenant ? `/${tenant}/sign-in` : "/sign-in";
    const signInPath = buildLocalizedPath(req.nextUrl.pathname, signInPathBase);
    const signInUrl = new URL(signInPath, req.url);
    signInUrl.searchParams.set("redirect_url", req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return intlMiddleware(req);
}, middlewareOptions);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
