
---
title: clerkMiddleware() | Next.js
description: The clerkMiddleware() function allows you to protect your Next.js
  application using Middleware.
sdk: nextjs
sdkScoped: "true"
canonical: /docs/reference/nextjs/clerk-middleware
lastUpdated: 2026-01-22T06:00:59.000Z
availableSdks: nextjs
notAvailableSdks: react,js-frontend,chrome-extension,expo,android,ios,expressjs,fastify,react-router,remix,tanstack-react-start,go,astro,nuxt,vue,ruby,js-backend
activeSdk: nextjs
sourceFile: /docs/reference/nextjs/clerk-middleware.mdx
---

The `clerkMiddleware()` helper integrates Clerk authentication into your Next.js application through Middleware. `clerkMiddleware()` is compatible with both the App and Pages routers.

## Configure `clerkMiddleware()`

<If sdk="nextjs">
  > \[!IMPORTANT]
  >
  > If you're using Next.js ≤15, name your file `middleware.ts` instead of `proxy.ts`. The code itself remains the same; only the filename changes.
</If>

Create a `proxy.ts` file at the root of your project, or in your `src/` directory if you have one.

> \[!NOTE]
> For more information about Middleware in Next.js, see the [Next.js documentation](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).

```tsx {{ filename: 'proxy.ts' }}
import { clerkMiddleware } from '@clerk/nextjs/server'

export default clerkMiddleware()

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
```

By default, `clerkMiddleware` will not protect any routes. All routes are public and you must opt-in to protection for routes.

## `createRouteMatcher()`

`createRouteMatcher()` is a Clerk helper function that allows you to protect multiple routes. `createRouteMatcher()` accepts an array of routes and checks if the route the user is trying to visit matches one of the routes passed to it. The paths provided to this helper can be in the same format as the paths provided to the Next Middleware matcher.

The `createRouteMatcher()` helper returns a function that, if called with the `req` object from the Middleware, will return `true` if the user is trying to access a route that matches one of the routes passed to `createRouteMatcher()`.

In the following example, `createRouteMatcher()` sets all `/dashboard` and `/forum` routes as protected routes.

```tsx
const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/forum(.*)'])
```

## Protect routes

You can protect routes using either or both of the following:

* [Authentication-based protection](#protect-routes-based-on-authentication-status): Verify if the user is signed in.
* [Authorization-based protection](#protect-routes-based-on-authorization-status): Verify if the user has the required Organization Roles or Custom Permissions.

> \[!TIP]
> If you have a `<Link>` tag on a public page that points to a protected page that returns a `400`-level error, like a `401`, the data prefetch will fail because it will be redirected to the sign-in page and throw a confusing error in the console. To prevent this behavior, disable prefetching by adding `prefetch={false}` to the `<Link>` component.

### Protect routes based on authentication status

You can protect routes based on a user's authentication status by checking if the user is signed in.

There are two methods that you can use:

* Use [`auth.protect()`](/docs/reference/nextjs/app-router/auth#auth-protect) if you want to redirect unauthenticated users to the sign-in route automatically.
* Use [`auth().isAuthenticated`](/docs/reference/nextjs/app-router/auth#protect-pages-and-routes) if you want more control over what your app does based on user authentication status.

<CodeBlockTabs options={["auth.protect()", "auth().isAuthenticated()"]}>
  ```tsx {{ filename: 'proxy.ts' }}
  import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

  const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/forum(.*)'])

  export default clerkMiddleware(async (auth, req) => {
    if (isProtectedRoute(req)) await auth.protect()
  })

  export const config = {
    matcher: [
      // Skip Next.js internals and all static files, unless found in search params
      '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
      // Always run for API routes
      '/(api|trpc)(.*)',
    ],
  }
  ```

  ```tsx {{ filename: 'proxy.ts' }}
  import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

  const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/forum(.*)'])

  export default clerkMiddleware(async (auth, req) => {
    const { isAuthenticated, redirectToSignIn } = await auth()

    if (!isAuthenticated && isProtectedRoute(req)) {
      // Add custom logic to run before redirecting

      return redirectToSignIn()
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
  ```
</CodeBlockTabs>

### Protect routes based on authorization status

You can protect routes based on a user's authorization status by checking if the user has the required Roles or Permissions.

There are two methods that you can use:

* Use [`auth.protect()`](/docs/reference/nextjs/app-router/auth#auth-protect) if you want Clerk to return a `404` if the user does not have the Role or Permission.
* Use <SDKLink href="/docs/reference/backend/types/auth-object#has" sdks={["js-backend"]} code={true}>auth().has()</SDKLink> if you want more control over what your app does based on the authorization status.

<Tabs items={["auth.protect()", "auth().has()"]}>
  <Tab>
    ```tsx {{ filename: 'proxy.ts' }}
    import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

    const isProtectedRoute = createRouteMatcher(['/admin(.*)'])

    export default clerkMiddleware(async (auth, req) => {
      // Restrict admin routes to users with specific Permissions
      if (isProtectedRoute(req)) {
        await auth.protect((has) => {
          return has({ permission: 'org:admin:example1' }) || has({ permission: 'org:admin:example2' })
        })
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
    ```
  </Tab>

  <Tab>
    > \[!WARNING]
    > Using `has()` **on the server-side** to check Permissions works only with **Custom Permissions**, as [System Permissions](/docs/guides/organizations/control-access/roles-and-permissions#system-permissions) aren't included in the session token claims. To check System Permissions, verify the user's Role instead.

    ```tsx {{ filename: 'proxy.ts' }}
    import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

    const isProtectedRoute = createRouteMatcher(['/admin(.*)'])

    export default clerkMiddleware(async (auth, req) => {
      const { has, redirectToSignIn } = await auth()
      // Restrict admin routes to users with specific Permissions
      if (
        (isProtectedRoute(req) && !has({ permission: 'org:admin:example1' })) ||
        !has({ permission: 'org:admin:example2' })
      ) {
        // Add logic to run if the user does not have the required Permissions

        return redirectToSignIn()
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
    ```
  </Tab>
</Tabs>

## Protect multiple groups of routes

You can use more than one `createRouteMatcher()` in your application if you have two or more groups of routes.

The following example uses the <SDKLink href="/docs/reference/backend/types/auth-object#has" sdks={["js-backend"]} code={true}>has()</SDKLink> method from the `auth()` helper.

> \[!TIP]
> If you have a `<Link>` tag on a public page that points to a protected page that returns a `400`-level error, like a `401`, the data prefetch will fail because it will be redirected to the sign-in page and throw a confusing error in the console. To prevent this behavior, disable prefetching by adding `prefetch={false}` to the `<Link>` component.

```tsx {{ filename: 'proxy.ts' }}
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isTenantRoute = createRouteMatcher(['/organization-selector(.*)', '/orgid/(.*)'])

const isTenantAdminRoute = createRouteMatcher(['/orgId/(.*)/memberships', '/orgId/(.*)/domain'])

export default clerkMiddleware(async (auth, req) => {
  // Restrict admin routes to users with specific Permissions
  if (isTenantAdminRoute(req)) {
    await auth.protect((has) => {
      return has({ permission: 'org:admin:example1' }) || has({ permission: 'org:admin:example2' })
    })
  }
  // Restrict Organization routes to signed in users
  if (isTenantRoute(req)) await auth.protect()
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
```

## Protect all routes

To protect all routes in your application and define specific routes as public, you can use any of the above methods and simply invert the `if` condition.

> \[!TIP]
> If you have a `<Link>` tag on a public page that points to a protected page that returns a `400`-level error, like a `401`, the data prefetch will fail because it will be redirected to the sign-in page and throw a confusing error in the console. To prevent this behavior, disable prefetching by adding `prefetch={false}` to the `<Link>` component.

```tsx {{ filename: 'proxy.ts' }}
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)'])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect()
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
```

## Protect routes based on token types

You can protect routes based on token types by checking if the request includes the required token (e.g. OAuth token, API key, machine token or session token). This ensures that only requests with the appropriate token type can access the route.

The following example uses the [`protect()`](/docs/reference/nextjs/app-router/auth#auth-protect) method from the `auth()` helper. Requests without the required token will return an appropriate error:

* A `404` error for unauthenticated requests with a session token type.
* A `401` error for unauthenticated requests with machine token types.

```tsx {{ filename: 'proxy.ts' }}
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Create route matchers to identify which token type each route should require
const isOAuthAccessible = createRouteMatcher(['/oauth(.*)'])
const isApiKeyAccessible = createRouteMatcher(['/api(.*)'])
const isMachineTokenAccessible = createRouteMatcher(['/m2m(.*)'])
const isUserAccessible = createRouteMatcher(['/user(.*)'])
const isAccessibleToAnyValidToken = createRouteMatcher(['/any(.*)'])

export default clerkMiddleware(async (auth, req) => {
  // Check if the request matches each route and enforce the corresponding token type
  if (isOAuthAccessible(req)) await auth.protect({ token: 'oauth_token' })
  if (isApiKeyAccessible(req)) await auth.protect({ token: 'api_key' })
  if (isMachineTokenAccessible(req)) await auth.protect({ token: 'm2m_token' })
  if (isUserAccessible(req)) await auth.protect({ token: 'session_token' })

  if (isAccessibleToAnyValidToken(req)) await auth.protect({ token: 'any' })
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
```

## Debug your Middleware

If you are having issues getting your Middleware dialed in, or are trying to narrow down auth-related issues, you can use the debugging feature in `clerkMiddleware()`. Add `{ debug: true }` to `clerkMiddleware()` and you will get debug logs in your terminal.

```tsx {{ filename: 'proxy.ts', mark: [[4, 7]] }}
import { clerkMiddleware } from '@clerk/nextjs/server'

export default clerkMiddleware(
  (auth, req) => {
    // Add your middleware checks
  },
  { debug: true },
)

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
```

If you would like to set up debugging for your development environment only, you can use the `process.env.NODE_ENV` variable to conditionally enable debugging. For example, `{ debug: process.env.NODE_ENV === 'development' }`.

## Combine Middleware

You can combine other Middleware with Clerk's Middleware by returning the second Middleware from `clerkMiddleware()`.

```js {{ filename: 'proxy.ts' }}
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import createMiddleware from 'next-intl/middleware'

import { AppConfig } from './utils/AppConfig'

const intlMiddleware = createMiddleware({
  locales: AppConfig.locales,
  localePrefix: AppConfig.localePrefix,
  defaultLocale: AppConfig.defaultLocale,
})

const isProtectedRoute = createRouteMatcher(['dashboard/(.*)'])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect()

  return intlMiddleware(req)
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
```

## `clerkMiddleware()` options

The `clerkMiddleware()` function accepts an optional object. The following options are available:

<Properties>
  * `audience?`
  * `string | string[]`

  A string or list of [audiences](https://datatracker.ietf.org/doc/html/rfc7519#section-4.1.3). If passed, it is checked against the `aud` claim in the token.

  ***

  * `authorizedParties?`
  * `string[]`

  An allowlist of origins to verify against, to protect your application from the subdomain cookie leaking attack. For example: `['http://localhost:3000', 'https://example.com']`

  ***

  * `clockSkewInMs?`
  * `number`

  Specifies the allowed time difference (in milliseconds) between the Clerk server (which generates the token) and the clock of the user's application server when validating a token. Defaults to 5000 ms (5 seconds).

  ***

  * `domain?`
  * `string`

  The domain used for satellites to inform Clerk where this application is deployed.

  ***

  * `isSatellite?`
  * `boolean`

  When using Clerk's satellite feature, this should be set to `true` for secondary domains.

  ***

  * `jwtKey`
  * `string`

  Used to verify the session token in a networkless manner. Supply the **JWKS Public Key** from the [**API keys**](https://dashboard.clerk.com/~/api-keys) page in the Clerk Dashboard. **It's recommended to use [the environment variable](/docs/guides/development/clerk-environment-variables) instead.** For more information, refer to [Manual JWT verification](/docs/guides/sessions/manual-jwt-verification).

  ***

  * `organizationSyncOptions?`
  * <code>[OrganizationSyncOptions](#organization-sync-options) | undefined</code>

  Used to activate a specific [Organization](/docs/guides/organizations/overview) or <Tooltip><TooltipTrigger>Personal Account</TooltipTrigger><TooltipContent>**Personal Accounts** are individual workspaces that allow users to operate independently without belonging to an Organization. Learn more about [Personal Accounts](/docs/guides/organizations/configure#personal-accounts).</TooltipContent></Tooltip> based on URL path parameters. If there's a mismatch between the <Tooltip><TooltipTrigger>Active Organization</TooltipTrigger><TooltipContent>A user can be a member of multiple Organizations, but only one can be active at a time. The **Active Organization** determines which Organization-specific data the user can access and which Role and related Permissions they have within the Organization.</TooltipContent></Tooltip> in the session (e.g., as reported by [`auth()`](/docs/reference/nextjs/app-router/auth)) and the Organization indicated by the URL, the middleware will attempt to activate the Organization specified in the URL.

  ***

  * `proxyUrl?`
  * `string`

  Specify the URL of the proxy, if using a proxy.

  ***

  * `signInUrl`
  * `string`

  The full URL or path to your sign-in page. Needs to point to your primary application on the client-side. **Required for a satellite application in a development instance.** It's recommended to use [the environment variable](/docs/guides/development/clerk-environment-variables#sign-in-and-sign-up-redirects) instead.

  ***

  * `signUpUrl`
  * `string`

  The full URL or path to your sign-up page. Needs to point to your primary application on the client-side. **Required for a satellite application in a development instance.** It's recommended to use [the environment variable](/docs/guides/development/clerk-environment-variables#sign-in-and-sign-up-redirects) instead.

  ***

  * `publishableKey`
  * `string`

  The Clerk <Tooltip><TooltipTrigger>Publishable Key</TooltipTrigger><TooltipContent>Your Clerk **Publishable Key** tells your app what your FAPI URL is, enabling your app to locate and communicate with your dedicated FAPI instance. You can find it on the [**API keys**](https://dashboard.clerk.com/~/api-keys) page in the Clerk Dashboard.</TooltipContent></Tooltip> for your instance.

  ***

  * `secretKey?`
  * `string`

  The Clerk <Tooltip><TooltipTrigger>Secret Key</TooltipTrigger><TooltipContent>Your Clerk **Secret Key** is used to authenticate requests from your backend to Clerk's API. You can find it on the [**API keys**](https://dashboard.clerk.com/~/api-keys) page in the Clerk Dashboard. **Do not expose this on the frontend with a public environment variable.**</TooltipContent></Tooltip> for your instance. The `CLERK_ENCRYPTION_KEY` environment variable must be set when providing `secretKey` as an option, refer to [Dynamic keys](#dynamic-keys).
</Properties>

It's also possible to dynamically set options based on the incoming request:

```ts {{ filename: 'proxy.ts' }}
import { clerkMiddleware } from '@clerk/nextjs/server'

export default clerkMiddleware(
  (auth, req) => {
    // Add your middleware checks
  },
  (req) => ({
    // Provide `domain` based on the request host
    domain: req.nextUrl.host,
  }),
)
```

### Dynamic keys

> \[!NOTE]
> Dynamic keys are not accessible on the client-side.

The following options, known as "Dynamic Keys," are shared to the Next.js application server through `clerkMiddleware`, enabling access by server-side helpers like [`auth()`](/docs/reference/nextjs/app-router/auth):

* `signUpUrl`
* `signInUrl`
* `secretKey`
* `publishableKey`

Dynamic keys are encrypted and shared during request time using a [AES encryption algorithm](https://en.wikipedia.org/wiki/Advanced_Encryption_Standard). When providing a `secretKey`, the `CLERK_ENCRYPTION_KEY` environment variable is mandatory and used as the encryption key. If no `secretKey` is provided to `clerkMiddleware`, the encryption key defaults to `CLERK_SECRET_KEY`.

When providing `CLERK_ENCRYPTION_KEY`, it is recommended to use a 32-byte (256-bit), pseudorandom value. You can use `openssl` to generate a key:

```sh {{ filename: 'terminal' }}
openssl rand --hex 32
```

For multi-tenant applications, you can dynamically define Clerk keys depending on the incoming request. Here's an example:

```ts {{ filename: 'proxy.ts' }}
import { clerkMiddleware } from '@clerk/nextjs/server'

// You would typically fetch these keys from a external store or environment variables.
const tenantKeys = {
  tenant1: { publishableKey: 'pk_tenant1...', secretKey: 'sk_tenant1...' },
  tenant2: { publishableKey: 'pk_tenant2...', secretKey: 'sk_tenant2...' },
}

export default clerkMiddleware(
  (auth, req) => {
    // Add your middleware checks
  },
  (req) => {
    // Resolve tenant based on the request
    const tenant = getTenant(req)
    return tenantKeys[tenant]
  },
)
```

### `OrganizationSyncOptions`

The `organizationSyncOptions` property on the [`clerkMiddleware()`](#clerk-middleware-options) options
object has the type `OrganizationSyncOptions`, which has the following properties:

<Properties>
  * `organizationPatterns`
  * <code>[Pattern](#pattern)\[]</code>

  Specifies URL patterns that are Organization-specific, containing an Organization ID or slug as a path parameter. If a request matches this path, the Organization identifier will be used to set that Organization as active.

  If the route also matches the `personalAccountPatterns` prop, this prop takes precedence.

  Patterns must have a path parameter named either `:id` (to match a Clerk Organization ID) or `:slug` (to match a Clerk Organization slug).

  > \[!WARNING]
  > If the Organization can't be activated—either because it doesn't exist or the user lacks access—the previously <Tooltip><TooltipTrigger>Active Organization</TooltipTrigger><TooltipContent>A user can be a member of multiple Organizations, but only one can be active at a time. The **Active Organization** determines which Organization-specific data the user can access and which Role and related Permissions they have within the Organization.</TooltipContent></Tooltip> will remain unchanged. Components must detect this case and provide an appropriate error and/or resolution pathway, such as calling `notFound()` or displaying an <SDKLink href="/docs/:sdk:/reference/components/organization/organization-switcher" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<OrganizationSwitcher /></SDKLink>.

  Common examples:

  * `["/orgs/:slug", "/orgs/:slug/(.*)"]`
  * `["/orgs/:id", "/orgs/:id/(.*)"]`
  * `["/app/:any/orgs/:slug", "/app/:any/orgs/:slug/(.*)"]`

  ***

  * `personalAccountPatterns`
  * <code>[Pattern](#pattern)\[]</code>

  URL patterns for resources that exist within the context of a user's <Tooltip><TooltipTrigger>Personal Account</TooltipTrigger><TooltipContent>**Personal Accounts** are individual workspaces that allow users to operate independently without belonging to an Organization. Learn more about [Personal Accounts](/docs/guides/organizations/configure#personal-accounts).</TooltipContent></Tooltip>.

  If the route also matches the `organizationPattern` prop, the `organizationPattern` prop takes precedence.

  Common examples:

  * `["/me", "/me/(.*)"]`
  * `["/user/:any", "/user/:any/(.*)"]`
</Properties>

### Pattern

A `Pattern` is a `string` that represents the structure of a URL path. In addition to any valid URL, it may include:

* Named path parameters prefixed with a colon (e.g., `:id`, `:slug`, `:any`).
* Wildcard token, `(.*)`, which matches the remainder of the path.

#### Examples

* `/orgs/:slug`

| URL | Matches | `:slug` value |
| - | - | - |
| `/orgs/acmecorp` | ✅ | `acmecorp` |
| `/orgs` | ❌ | n/a |
| `/orgs/acmecorp/settings` | ❌ | n/a |

* `/app/:any/orgs/:id`

| URL | Matches | `:id` value |
| - | - | - |
| `/app/petstore/orgs/org_123` | ✅ | `org_123` |
| `/app/dogstore/v2/orgs/org_123` | ❌ | n/a |

* `/personal-account/(.*)`

| URL | Matches |
| - | - |
| `/personal-account/settings` | ✅ |
| `/personal-account` | ❌ |
