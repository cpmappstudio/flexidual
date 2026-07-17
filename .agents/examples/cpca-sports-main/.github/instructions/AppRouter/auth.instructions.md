---
title: "`auth()`"
description: Access minimal authentication data for managing sessions and data fetching.
sdk: nextjs
sdkScoped: "true"
canonical: /docs/reference/nextjs/app-router/auth
lastUpdated: 2026-01-22T06:00:59.000Z
availableSdks: nextjs
notAvailableSdks: react,js-frontend,chrome-extension,expo,android,ios,expressjs,fastify,react-router,remix,tanstack-react-start,go,astro,nuxt,vue,ruby,js-backend
activeSdk: nextjs
sourceFile: /docs/reference/nextjs/app-router/auth.mdx
---

The `auth()` helper returns the <SDKLink href="/docs/reference/backend/types/auth-object" sdks={["js-backend"]} code={true}>Auth</SDKLink>{{ target: '_blank' }} object of the currently active user, as well as the [`redirectToSignIn()`](#redirect-to-sign-in) method. It includes a single method, `protect()`, which you can use to check if a user is authenticated or authorized to access certain parts of your application or even entire routes.

* Only available for App Router.
* Only works on the server-side, such as in Server Components, Route Handlers, and Server Actions.
* Requires [`clerkMiddleware()`](/docs/reference/nextjs/clerk-middleware) to be configured.

## Parameters

<Properties>
  * `opts?`
  * `{acceptsToken: TokenType, treatPendingAsSignedOut: boolean }`

  An optional object that can be used to configure the behavior of the `auth()` function. It accepts the following properties:

  * `acceptsToken?`: The type of authentication token(s) to accept. Valid values are:

    * `'session_token'` - authenticates a user session.
    * `'oauth_token'` - authenticates a machine request using OAuth.
    * `'m2m_token'` - authenticates a machine to machine request.
    * `'api_key'` - authenticates a machine request using API keys.

    Can be set to:

    * A single token type.
    * An array of token types.
    * `'any'` to accept all available token types.

    Defaults to `'session_token'`.

  * `treatPendingAsSignedOut?`: A boolean that indicates whether to treat <SDKLink href="/docs/reference/javascript/types/session-status#properties" sdks={["js-frontend"]} code={true}>pending session status</SDKLink> as signed out. Defaults to `true`.
</Properties>

## `auth.protect()`

`auth` includes a single property, the `protect()` method, which you can use in three ways:

* to check if a user is authenticated (signed in)
* to check if a user is authorized (has the correct Role, Permission, Feature, or Plan) to access something, such as a component or a route handler
* to check if a request includes a valid machine token (e.g. API key or OAuth token) and enforce access rules accordingly

The following table describes how `auth.protect()` behaves based on user authentication or authorization status:

| Authenticated | Authorized | `auth.protect()` will |
| - | - | - |
| Yes | Yes | Return the <SDKLink href="/docs/reference/backend/types/auth-object" sdks={["js-backend"]} code={true}>Auth</SDKLink>{{ target: '_blank' }} object. |
| Yes | No | Return a `404` error. |
| No | No | Redirect the user to the sign-in page. |

> \[!IMPORTANT]
> For non-document requests, such as API requests, `auth.protect()` returns:
>
> * A `404` error for unauthenticated requests with session token type.
> * A `401` error for unauthenticated requests with machine token types.

`auth.protect()` accepts the following parameters:

<Properties>
  * `role?`
  * `string`

  The Role to check for.

  ***

  * `permission?`
  * `string`

  The Permission to check for.

  ***

  * `has?`
  * `(isAuthorizedParams: CheckAuthorizationParamsWithCustomPermissions) => boolean`

  A function that checks if the user has an Organization Role or Custom Permission. See the <SDKLink href="/docs/reference/backend/types/auth-object#has" sdks={["js-backend"]}>reference</SDKLink> for more information.

  ***

  * `unauthorizedUrl?`
  * `string`

  The URL to redirect the user to if they are not authorized.

  ***

  * `unauthenticatedUrl?`
  * `string`

  The URL to redirect the user to if they are not authenticated.

  ***

  * `token?`
  * `TokenType`

  The type of authentication token(s) to accept. Valid values are:

  * `'session_token'` - authenticates a user session.
  * `'oauth_token'` - authenticates a machine request using OAuth.
  * `'machine_token'` - authenticates a machine to machine request.
  * `'api_key'` - authenticates a machine request using API keys.

  Can be set to:

  * A single token type.
  * An array of token types.
  * `'any'` to accept all available token types.

  Defaults to `'session_token'`.
</Properties>

### Example

`auth.protect()` can be used to check if a user is authenticated or authorized to access certain parts of your application or even entire routes. See detailed examples in the [guide on verifying if a user is authorized](/docs/guides/secure/authorization-checks).

## Returns

The `auth()` helper returns the following:

* The <SDKLink href="/docs/reference/backend/types/auth-object" sdks={["js-backend"]} code={true}>Auth</SDKLink>{{ target: '_blank' }} object.
* The [`redirectToSignIn()`](#redirect-to-sign-in) method.

### `redirectToSignIn()`

The `auth()` helper returns the `redirectToSignIn()` method, which you can use to redirect the user to the sign-in page.

`redirectToSignIn()` accepts the following parameters:

<Properties>
  * `returnBackUrl?`
  * `string | URL`

  The URL to redirect the user back to after they sign in.
</Properties>

> \[!NOTE]
> `auth()` on the server-side can only access redirect URLs defined via [environment variables](/docs/guides/development/clerk-environment-variables#sign-in-and-sign-up-redirects) or [`clerkMiddleware` dynamic keys](/docs/reference/nextjs/clerk-middleware#dynamic-keys).

#### Example

The following example shows how to use `redirectToSignIn()` to redirect the user to the sign-in page if they are not authenticated. It's also common to use `redirectToSignIn()` in `clerkMiddleware()` to protect entire routes; see [the `clerkMiddleware()` docs](/docs/reference/nextjs/clerk-middleware) for more information.

```tsx {{ filename: 'app/page.tsx' }}
import { auth } from '@clerk/nextjs/server'

export default async function Page() {
  const { isAuthenticated, redirectToSignIn, userId } = await auth()

  if (!isAuthenticated) return redirectToSignIn()

  return <h1>Hello, {userId}</h1>
}
```

## `auth()` usage

### Protect pages and routes

You can use `auth()` to check if `isAuthenticated` is true. If it's false, then there is not an authenticated (signed in) user. See detailed examples in the <SDKLink href="/docs/:sdk:/guides/users/reading" sdks={["nextjs","expo","react-router","remix","tanstack-react-start","astro","nuxt"]}>dedicated guide</SDKLink>.

### Check if a user is authorized

You can use `auth()` to check if a user is authorized to access certain parts of your application or even entire routes by checking their type of access control. See detailed examples in the [guide on verifying if a user is authorized](/docs/guides/secure/authorization-checks).

### Verify machine requests

You can use `auth()` to verify <Tooltip><TooltipTrigger>OAuth access tokens</TooltipTrigger><TooltipContent>An **OAuth access token** is a credential issued by an authorization server that grants the <Tooltip><TooltipTrigger>client</TooltipTrigger><TooltipContent>The **client** is the application that wants to access a user's data from your application (the **resource service**). The client needs to be configured to obtain an OAuth access token from Clerk.</TooltipContent></Tooltip> access to protected resources on behalf of a user. Access tokens represent the authorization granted to the client and are typically short-lived for security purposes. Learn more about [how OAuth works](/docs/guides/configure/auth-strategies/oauth/overview).</TooltipContent></Tooltip> by passing in the `acceptsToken` parameter. See detailed examples in the <SDKLink href="/docs/:sdk:/guides/development/verifying-oauth-access-tokens" sdks={["nextjs","react-router","tanstack-react-start"]}>guide on verifying OAuth access tokens</SDKLink>.

### Data fetching with `getToken()`

If you need to send a JWT along to a server, `getToken()` retrieves the current user's [session token](/docs/guides/sessions/session-tokens) or a [custom JWT template](/docs/guides/sessions/jwt-templates). See detailed examples in the <SDKLink href="/docs/reference/backend/types/auth-object#get-token" sdks={["js-backend"]} code={true}>Auth object reference</SDKLink>{{ target: '_blank' }}.
