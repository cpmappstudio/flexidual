// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'
import { getLocaleFromPathname } from './lib/locale-setup'
import { roleFromSessionClaims, checkRoleAccess } from './lib/rbac'

const intlMiddleware = createIntlMiddleware(routing)

// Only keep Public and Root matchers here for special handling
const isPublicRoute = createRouteMatcher([
  '/:locale/sign-in(.*)',
  '/:locale/sign-up(.*)',
  '/sign-in(.*)',
  '/:locale/pending-role',
  '/pending-role',
])

const isRootRoute = createRouteMatcher([
  '/:locale',
  '/',
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

  // 3. Handle root routes (Login redirects)
  if (isRootRoute(req)) {
    try {
      const authObject = await auth()

      if (!authObject.userId) {
        const signInUrl = new URL(`/${locale}/sign-in`, req.url)
        return NextResponse.redirect(signInUrl)
      }

      const userRole = roleFromSessionClaims(authObject.sessionClaims)

      if (!userRole) {
        const pendingUrl = new URL(`/${locale}/pending-role`, req.url)
        return NextResponse.redirect(pendingUrl)
      }

      // Redirect Logic
      let targetPath = `/${locale}/student` // Default for student
      if (userRole === 'teacher') targetPath = `/${locale}/teaching`
      else if (userRole === 'admin' || userRole === 'superadmin') targetPath = `/${locale}/admin`
      else if (userRole === 'tutor') targetPath = `/${locale}/teaching`

      return NextResponse.redirect(new URL(targetPath, req.url))
      
    } catch (error) {
      console.error('[Middleware] Root route error:', error)
      const errorUrl = new URL(`/${locale}/sign-in`, req.url)
      errorUrl.searchParams.set('error', 'auth_error')
      return NextResponse.redirect(errorUrl)
    }
  }

  // 4. Protected Routes - Unified RBAC Check
  try {
    const authObject = await auth()

    // Redirect unauthenticated users
    if (!authObject.userId) {
      const signInUrl = new URL(`/${locale}/sign-in`, req.url)
      const isInternalPath = pathname.startsWith('/') && !pathname.startsWith('//') && !pathname.includes('@')
      if (isInternalPath && pathname !== '/' && pathname !== `/${locale}`) {
        signInUrl.searchParams.set('redirect_url', pathname + search)
      }
      return NextResponse.redirect(signInUrl)
    }

    const userRole = roleFromSessionClaims(authObject.sessionClaims)

    if (!userRole) {
      const pendingUrl = new URL(`/${locale}/pending-role`, req.url)
      return NextResponse.redirect(pendingUrl)
    }

    // THE FIX: Single call to check permissions
    const accessResult = checkRoleAccess(req, userRole)

    if (accessResult === 'denied') {
      // Smart redirect based on role
      let dashboardPath = `/${locale}/student`
      if (userRole === 'teacher') dashboardPath = `/${locale}/teaching`
      else if (userRole === 'admin' || userRole === 'superadmin') dashboardPath = `/${locale}/admin`
      
      return NextResponse.redirect(new URL(dashboardPath, req.url))
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