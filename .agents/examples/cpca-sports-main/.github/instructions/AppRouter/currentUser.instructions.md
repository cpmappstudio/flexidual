---
title: "`currentUser()`"
description: Use the currentUser() helper to access information about your user
  inside of your Server Components, Route Handlers, and Server Actions.
sdk: nextjs
sdkScoped: "true"
canonical: /docs/reference/nextjs/app-router/current-user
lastUpdated: 2026-01-22T06:00:59.000Z
availableSdks: nextjs
notAvailableSdks: react,js-frontend,chrome-extension,expo,android,ios,expressjs,fastify,react-router,remix,tanstack-react-start,go,astro,nuxt,vue,ruby,js-backend
activeSdk: nextjs
sourceFile: /docs/reference/nextjs/app-router/current-user.mdx
---

> \[!WARNING]
> For optimal performance and to avoid rate limiting, it's recommended to use the <SDKLink href="/docs/:sdk:/reference/hooks/use-user" sdks={["chrome-extension","expo","nextjs","react","react-router","tanstack-react-start"]} code={true}>useUser()</SDKLink> hook on the client-side when possible. Only use `currentUser()` when you specifically need user data in a server context.

The `currentUser()` helper returns the <SDKLink href="/docs/reference/backend/types/backend-user" sdks={["js-backend"]} code={true}>Backend User</SDKLink> object of the currently active user. It can be used in Server Components, Route Handlers, and Server Actions.

Under the hood, this helper:

* calls `fetch()`, so it is automatically deduped per request.
* uses the [`GET /v1/users/{user_id}`](/docs/reference/backend-api/tag/users/get/users/\{user_id}){{ target: '_blank' }} endpoint.
* counts towards the [Backend API request rate limit](/docs/guides/how-clerk-works/system-limits).

> \[!WARNING]
> The <SDKLink href="/docs/reference/backend/types/backend-user" sdks={["js-backend"]} code={true}>Backend User</SDKLink> object includes a `privateMetadata` field that should not be exposed to the frontend. Avoid passing the full user object returned by `currentUser()` to the frontend. Instead, pass only the specified fields you need.

```tsx {{ filename: 'app/page.tsx' }}
import { currentUser } from '@clerk/nextjs/server'

export default async function Page() {
  const user = await currentUser()

  if (!user) return <div>Not signed in</div>

  return <div>Hello {user?.firstName}</div>
}
```
