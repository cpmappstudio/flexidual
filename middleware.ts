import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'
import { getLocaleFromPathname } from './lib/locale-setup'
import { getRolesFromClaims, isSuperAdmin, getRoleForOrg, getRoleBasePath } from './lib/rbac'

const intlMiddleware = createIntlMiddleware(routing)

const isPublicRoute = createRouteMatcher([
  '/:locale/sign-in(.*)',
  '/:locale/sign-up(.*)',
  '/sign-in(.*)',
  '/:locale/pending-role',
  '/pending-role',
])

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const { pathname, search } = req.nextUrl

  // 1. Fast path: static files
  if (pathname.match(/\.(jpg|jpeg|gif|png|svg|ico|webp|mp4|pdf|js|css|woff2?)$/)) {
    return NextResponse.next()
  }

  const locale = getLocaleFromPathname(pathname)

  // 2. Handle public routes
  if (isPublicRoute(req)) {
    return intlMiddleware(req)
  }

  try {
    const authObject = await auth()

    // 3. Redirect unauthenticated users
    if (!authObject.userId) {
      const signInUrl = new URL(`/${locale}/sign-in`, req.url)
      const isInternalPath = pathname.startsWith('/') && !pathname.startsWith('//') && !pathname.includes('@')
      if (isInternalPath && pathname !== '/' && pathname !== `/${locale}`) {
        signInUrl.searchParams.set('redirect_url', pathname + search)
      }
      return NextResponse.redirect(signInUrl)
    }

    const roles = getRolesFromClaims(authObject.sessionClaims)
    const userIsSuperAdmin = isSuperAdmin(authObject.sessionClaims)

    // Check if they have ANY roles at all
    if (!roles || Object.keys(roles).length === 0) {
      if (!pathname.includes('pending-role')) {
        return NextResponse.redirect(new URL(`/${locale}/pending-role`, req.url))
      }
      return intlMiddleware(req)
    }

    // Strip locale from path to analyze the route structure cleanly
    const pathWithoutLocale = pathname.replace(new RegExp(`^/${locale}`), '') || '/'

    // 4. Root Routing (Log in -> Where do I go?)
    if (pathWithoutLocale === '/') {
      if (userIsSuperAdmin) {
        return NextResponse.redirect(new URL(`/${locale}/admin`, req.url))
      }

      const firstOrgSlug = Object.keys(roles).find(k => k !== "system")
      if (firstOrgSlug) {
        const targetPath = getRoleBasePath(locale, firstOrgSlug)
        return NextResponse.redirect(new URL(targetPath, req.url))
      }
      return intlMiddleware(req)
    }

    // 5. Protect System Admin Routes
    if (pathWithoutLocale.startsWith('/admin')) {
      if (userIsSuperAdmin) return intlMiddleware(req)
      return NextResponse.redirect(new URL(`/${locale}`, req.url))
    }

    // 6. Dynamic Context Routing (/[locale]/[orgSlug]/...)
    const orgMatch = pathWithoutLocale.match(/^\/([^\/]+)(\/.*)?$/)
    
    if (orgMatch) {
      const orgSlug = orgMatch[1]
      const subPath = orgMatch[2] || ""

      // Ignore standard Next.js / structural folders
      if (["api", "_next", "sign-in", "pending-role", "admin"].includes(orgSlug)) {
        return intlMiddleware(req)
      }

      const orgRole = getRoleForOrg(authObject.sessionClaims, orgSlug)

      // If they don't have a role in this org, and aren't a superadmin, kick them out
      if (!orgRole && !userIsSuperAdmin) {
        return NextResponse.redirect(new URL(`/${locale}`, req.url))
      }

      // Base org routing (e.g. they typed /boston-public but no sub-path)
      if (!subPath || subPath === "/") {
         return intlMiddleware(req) // Let it render the org dashboard
      }
    }

    // Access granted or unknown route -> Allow
    return intlMiddleware(req)

  } catch (error) {
    console.error('[Middleware] Critical error:', error)
    const errorUrl = new URL(`/${locale}/sign-in`, req.url)
    return NextResponse.redirect(errorUrl)
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}