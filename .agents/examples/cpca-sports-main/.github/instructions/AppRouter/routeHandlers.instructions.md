---
title: Route Handlers
description: Learn how to use Clerk with your Route Handlers.
sdk: nextjs
sdkScoped: "true"
canonical: /docs/reference/nextjs/app-router/route-handlers
lastUpdated: 2026-01-22T06:00:59.000Z
availableSdks: nextjs
notAvailableSdks: react,js-frontend,chrome-extension,expo,android,ios,expressjs,fastify,react-router,remix,tanstack-react-start,go,astro,nuxt,vue,ruby,js-backend
activeSdk: nextjs
sourceFile: /docs/reference/nextjs/app-router/route-handlers.mdx
---

Clerk provides helpers that allow you to protect your Route Handlers, fetch the current user, and interact with the Clerk Backend API.

> \[!TIP]
> If you have a `<Link>` tag on a public page that points to a protected page that returns a `400`-level error, like a `401`, the data prefetch will fail because it will be redirected to the sign-in page and throw a confusing error in the console. To prevent this behavior, disable prefetching by adding `prefetch={false}` to the `<Link>` component.

## Protect your Route Handlers

If you aren't protecting your Route Handler using [`clerkMiddleware()`](/docs/reference/nextjs/clerk-middleware), you can protect your Route Handler in two ways:

* Use [`auth.protect()`](/docs/reference/nextjs/app-router/auth#auth-protect) if you want Clerk to return a `404` error when there is no signed in user.
* Use [`auth().userId`](/docs/reference/nextjs/app-router/auth#protect-pages-and-routes) if you want to customize the behavior or error message.

<CodeBlockTabs options={["auth.protect()", "auth().userId()"]}>
  ```tsx {{ filename: 'app/api/route.ts' }}
  import { auth } from '@clerk/nextjs/server'

  export async function GET() {
    // If there is no signed in user, this will return a 404 error
    await auth.protect()

    // Add your Route Handler logic here

    return Response.json({ message: 'Hello world!' })
  }
  ```

  ```tsx {{ filename: 'app/api/route.ts' }}
  import { auth } from '@clerk/nextjs/server'
  import { NextResponse } from 'next/server'

  export async function GET() {
    const { isAuthenticated, userId } = await auth()

    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Error: No signed in user' }, { status: 401 })
    }

    // Add your Route Handler logic here

    return NextResponse.json({ userId })
  }
  ```
</CodeBlockTabs>

## Retrieve data from external sources

Clerk provides integrations with a number of popular databases.

The following example demonstrates how to use <SDKLink href="/docs/reference/backend/types/auth-object#get-token" sdks={["js-backend"]} code={true}>auth().getToken()</SDKLink> to retrieve a token from a JWT template and use it to fetch data from the external source.

```ts {{ filename: 'app/api/route.ts' }}
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
export async function GET() {
  const { isAuthenticated, getToken } = await auth()

  if (!isAuthenticated) {
    return new Response('Unauthorized', { status: 401 })
  }

  const token = await getToken({ template: 'supabase' })

  // Fetch data from Supabase and return it.
  const data = { supabaseData: 'Hello World' }

  return NextResponse.json({ data })
}
```

## Retrieve the current user

To retrieve information about the current user in your Route Handler, you can use the [`currentUser()`](/docs/reference/nextjs/app-router/current-user) helper, which returns the <SDKLink href="/docs/reference/backend/types/backend-user" sdks={["js-backend"]} code={true}>Backend User</SDKLink> object of the currently active user. **It does count towards the [Backend API request rate limit](/docs/guides/how-clerk-works/system-limits)** so it's recommended to use the <SDKLink href="/docs/:sdk:/reference/hooks/use-user" sdks={["chrome-extension","expo","nextjs","react","react-router","tanstack-react-start"]} code={true}>useUser()</SDKLink> hook on the client side when possible and only use `currentUser()` when you specifically need user data in a server context. For more information on this helper, see the [`currentUser()`](/docs/reference/nextjs/app-router/current-user) reference.

> \[!WARNING]
> The <SDKLink href="/docs/reference/backend/types/backend-user" sdks={["js-backend"]} code={true}>Backend User</SDKLink> object includes a `privateMetadata` field that should not be exposed to the frontend. Avoid passing the full user object returned by `currentUser()` to the frontend. Instead, pass only the specified fields you need.

```ts {{ filename: 'app/api/route.ts' }}
import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
export async function GET() {
  const { isAuthenticated } = await auth()
  const user = await currentUser()

  if (!isAuthenticated) {
    return new Response('Unauthorized', { status: 401 })
  }

  return NextResponse.json({ userId: user.id, email: user.emailAddresses[0].emailAddress })
}
```

## Interact with Clerk's Backend API

The <SDKLink href="/docs/js-backend/getting-started/quickstart" sdks={["js-backend"]}>JS Backend SDK</SDKLink> exposes the [Backend API](/docs/reference/backend-api){{ target: '_blank' }} resources and low-level authentication utilities for JavaScript environments.

`clerkClient` exposes an instance of the JS Backend SDK for use in server environments.

```ts {{ filename: 'app/api/route.ts' }}
import { NextResponse, NextRequest } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'

export async function POST(req: NextRequest) {
  const { isAuthenticated, userId } = await auth()

  if (!isAuthenticated) return NextResponse.redirect(new URL('/sign-in', req.url))

  const params = { firstName: 'John', lastName: 'Wick' }

  const client = await clerkClient()

  const user = await client.users.updateUser(userId, params)

  return NextResponse.json({ user })
}
```
