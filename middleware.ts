import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'
import { getLocaleFromPathname } from './lib/locale-setup'
import { roleFromSessionClaims, checkRoleAccess } from './lib/rbac'

const intlMiddleware = createIntlMiddleware(routing)

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

// Separate teaching and calendar routes for better control
const teachingRoutes = createRouteMatcher(['/:locale/teaching(.*)', '/:locale/calendar(.*)'])
const adminRoutes = createRouteMatcher(['/:locale/admin(.*)'])
const studentRoutes = createRouteMatcher(['/:locale/student(.*)', '/:locale/classroom(.*)'])

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const { pathname, search } = req.nextUrl

  // Fast path: static files
  if (pathname.match(/\.(jpg|jpeg|gif|png|svg|ico|webp|mp4|pdf|js|css|woff2?)$/)) {
    return NextResponse.next()
  }

  const locale = getLocaleFromPathname(pathname)

  // Handle public routes
  if (isPublicRoute(req)) {
    return intlMiddleware(req)
  }

  // Handle root routes (Login redirects)
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

      // FIXED: Redirect logic updated - removed campuses
      let targetPath = ''

      if (userRole === 'teacher') {
        targetPath = `/${locale}/teaching`
      } else if (userRole === 'admin' || userRole === 'superadmin') {
        targetPath = `/${locale}/admin` // FIXED: Removed '/campuses'
      } else if (userRole === 'student') {
        targetPath = `/${locale}/student`
      } else if (userRole === 'tutor') {
        targetPath = `/${locale}/teaching` // Tutors see teaching dashboard
      }

      if (targetPath) {
        const redirectUrl = new URL(targetPath, req.url)
        return NextResponse.redirect(redirectUrl)
      }

      return intlMiddleware(req)
    } catch (error) {
      console.error('[Middleware] Root route error:', error)
      const errorUrl = new URL(`/${locale}/sign-in`, req.url)
      errorUrl.searchParams.set('error', 'auth_error')
      return NextResponse.redirect(errorUrl)
    }
  }

  try {
    const authObject = await auth()

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

    // FIXED: Allow students and tutors to access calendar
    if (teachingRoutes(req) && userRole !== 'teacher' && userRole !== 'admin' && userRole !== 'superadmin') {
      // Allow students and tutors to access calendar
      if (pathname.includes('/calendar') && (userRole === 'student' || userRole === 'tutor')) {
        // Allow access
      } else {
        const dashboardPath = userRole === 'student' ? `/${locale}/student` : `/${locale}`
        return NextResponse.redirect(new URL(dashboardPath, req.url))
      }
    }

    // Admin routes (only for admins and superadmins)
    if (adminRoutes(req) && userRole !== 'admin' && userRole !== 'superadmin') {
      const dashboardPath = userRole === 'teacher' ? `/${locale}/teaching` : `/${locale}/student`
      return NextResponse.redirect(new URL(dashboardPath, req.url))
    }

    // Check detailed RBAC (updated to allow students to see lessons)
    const accessResult = checkRoleAccess(req, userRole)

    if (accessResult === 'denied') {
      let dashboardPath = ''
      if (userRole === 'teacher') {
        dashboardPath = `/${locale}/teaching`
      } else if (userRole === 'admin' || userRole === 'superadmin') {
        dashboardPath = `/${locale}/admin`
      } else {
        dashboardPath = `/${locale}/student`
      }
      return NextResponse.redirect(new URL(dashboardPath, req.url))
    }

    return intlMiddleware(req)

  } catch (error) {
    console.error('[Middleware] Critical error:', error)
    const errorUrl = new URL(`/${locale}/sign-in`, req.url)
    errorUrl.searchParams.set('error', 'auth_error')
    return NextResponse.redirect(errorUrl)
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}