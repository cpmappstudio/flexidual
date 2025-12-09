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

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const { pathname, search } = req.nextUrl

  // Fast path: archivos estáticos
  if (pathname.match(/\.(jpg|jpeg|gif|png|svg|ico|webp|mp4|pdf|js|css|woff2?)$/)) {
    return NextResponse.next()
  }

  const locale = getLocaleFromPathname(pathname)

  // Manejar rutas públicas (sin autenticación)
  if (isPublicRoute(req)) {
    return intlMiddleware(req)
  }

  // Manejar rutas root (requieren autenticación)
  if (isRootRoute(req)) {
    try {
      const authObject = await auth()

      if (!authObject.userId) {
        const signInUrl = new URL(`/${locale}/sign-in`, req.url)
        return NextResponse.redirect(signInUrl)
      }

      // Obtener rol del usuario
      const userRole = roleFromSessionClaims(authObject.sessionClaims)

      // Si no tiene rol, redirigir a página de espera
      if (!userRole) {
        const pendingUrl = new URL(`/${locale}/pending-role`, req.url)
        return NextResponse.redirect(pendingUrl)
      }

      // Redirigir según el rol
      let targetPath = ''

      if (userRole === 'teacher') {
        targetPath = `/${locale}/teaching`
      } else if (userRole === 'admin' || userRole === 'superadmin') {
        targetPath = `/${locale}/admin/campuses`
      } else if (userRole === 'student') {
        targetPath = `/${locale}/student`
      }

      if (targetPath) {
        const redirectUrl = new URL(targetPath, req.url)
        return NextResponse.redirect(redirectUrl)
      }

      // Fallback: continuar con intl
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

      const isInternalPath = pathname.startsWith('/') &&
        !pathname.startsWith('//') &&
        !pathname.includes('@')

      if (isInternalPath && pathname !== '/' && pathname !== `/${locale}`) {
        signInUrl.searchParams.set('redirect_url', pathname + search)
      }

      return NextResponse.redirect(signInUrl)
    }

    // Obtener rol del usuario desde session claims
    const userRole = roleFromSessionClaims(authObject.sessionClaims)

    // Si no tiene rol, redirigir a página de espera
    if (!userRole) {
      const pendingUrl = new URL(`/${locale}/pending-role`, req.url)
      return NextResponse.redirect(pendingUrl)
    }

    // Verificar acceso por rol
    const accessResult = checkRoleAccess(req, userRole)

    if (accessResult === 'denied') {
      // Si el acceso está denegado, redirigir según el rol del usuario
      let dashboardPath = ''

      if (userRole === 'teacher') {
        dashboardPath = `/${locale}/teaching`
      } else if (userRole === 'admin' || userRole === 'superadmin') {
        dashboardPath = `/${locale}/admin`
      } else {
        dashboardPath = `/${locale}`
      }

      const dashboardUrl = new URL(dashboardPath, req.url)
      return NextResponse.redirect(dashboardUrl)
    }

    return intlMiddleware(req)

  } catch (error) {
    console.error('[Middleware] Critical error:', error)

    // En error, siempre denegar acceso
    const errorUrl = new URL(`/${locale}/sign-in`, req.url)
    errorUrl.searchParams.set('error', 'auth_error')
    return NextResponse.redirect(errorUrl)
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}