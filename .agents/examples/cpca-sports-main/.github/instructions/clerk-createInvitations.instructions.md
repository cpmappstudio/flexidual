---
title: "`createInvitation()`"
description: Use Clerk's JS Backend SDK to create a new invitation for the given
  email address, and send the invitation email.
sdk: js-backend
sdkScoped: "true"
canonical: /docs/reference/backend/invitations/create-invitation
lastUpdated: 2026-02-04T22:07:03.000Z
availableSdks: js-backend
notAvailableSdks: nextjs,react,js-frontend,chrome-extension,expo,android,ios,expressjs,fastify,react-router,remix,tanstack-react-start,go,astro,nuxt,vue,ruby
activeSdk: js-backend
sourceFile: /docs/reference/backend/invitations/create-invitation.mdx
---

{/* clerk/javascript file: https://github.com/clerk/javascript/blob/main/packages/backend/src/api/endpoints/InvitationApi.ts#L42 */}

Creates a new [`Invitation`](/docs/reference/backend/types/backend-invitation) for the given email address and sends the invitation email.

If an email address has already been invited or already exists in your application, trying to create a new invitation will return an error. To bypass this error and create a new invitation anyways, set `ignoreExisting` to `true`.

```ts
function createInvitation(params: CreateParams): Promise<Invitation>
```

## `CreateParams`

<Properties>
  * `emailAddress`
  * `string`

  The email address of the user to invite.

  ***

  * `redirectUrl?`
  * `string`

  The full URL or path where the user is redirected upon visiting the invitation link, where they can accept the invitation. Required if you have implemented a [custom flow for handling application invitations](/docs/guides/development/custom-flows/authentication/application-invitations).

  ***

  * `publicMetadata?`
  * <SDKLink href="/docs/reference/javascript/types/metadata#user-public-metadata" sdks={["js-frontend"]} code={true}>UserPublicMetadata</SDKLink>

  Metadata that can be read from both the Frontend API and [Backend API](/docs/reference/backend-api){{ target: '_blank' }}, but can be set only from the Backend API. Once the user accepts the invitation and signs up, these metadata will end up in the user's public metadata.

  ***

  * `notify?`
  * `boolean`

  Whether an email invitation should be sent to the given email address. Defaults to `true`.

  ***

  * `ignoreExisting?`
  * `boolean`

  Whether an invitation should be created if there is already an existing invitation for this email address, or if the email address already exists in the application. Defaults to `false`.

  ***

  * `expiresInDays?`
  * `number`

  The number of days the invitation will be valid for. By default, the invitation expires after 30 days.

  ***

  * `templateSlug?`
  * `'invitation' | 'waitlist_invitation'`

  The slug of the email template to use for the invitation email. Defaults to `invitation`.
</Properties>

## Usage

> \[!NOTE]
> Using `clerkClient` varies based on your framework. Refer to the [JS Backend SDK overview](/docs/js-backend/getting-started/quickstart) for usage details, including guidance on [how to access the `userId` and other properties](/docs/js-backend/getting-started/quickstart#get-the-user-id-and-other-properties).

```tsx
const response = await clerkClient.invitations.createInvitation({
  emailAddress: 'invite@example.com',
  redirectUrl: 'https://www.example.com/my-sign-up',
  publicMetadata: {
    example: 'metadata',
    example_nested: {
      nested: 'metadata',
    },
  },
})
```

## Example

<Tabs items={["Next.js", "Astro", "Express", "React Router", "TanStack React Start"]}>
  <Tab>
    ```ts {{ filename: 'app/api/example/route.ts' }}
    import { clerkClient } from '@clerk/nextjs/server'
    import { NextResponse } from 'next/server'

    export async function POST() {
      const client = await clerkClient()
      const invitation = await client.invitations.createInvitation({
        emailAddress: 'invite@example.com',
        redirectUrl: 'https://www.example.com/my-sign-up',
        publicMetadata: {
          example: 'metadata',
          example_nested: {
            nested: 'metadata',
          },
        },
      })

      return NextResponse.json({ message: 'Invitation created', invitation })
    }
    ```
  </Tab>

  <Tab>
    ```tsx {{ filename: 'src/api/example.ts' }}
    import type { APIRoute } from 'astro'
    import { clerkClient } from '@clerk/astro/server'

    export const POST: APIRoute = async (context) => {
      await clerkClient(context).invitations.createInvitation({
        emailAddress: 'invite@example.com',
        redirectUrl: 'https://www.example.com/my-sign-up',
        publicMetadata: {
          example: 'metadata',
          example_nested: {
            nested: 'metadata',
          },
        },
      })

      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }
    ```
  </Tab>

  <Tab>
    ```ts {{ filename: 'public.ts' }}
    import { getAuth, clerkClient } from '@clerk/express'

    app.post('/createUser', async (req, res) => {
      await clerkClient.invitations.createInvitation({
        emailAddress: 'invite@example.com',
        redirectUrl: 'https://www.example.com/my-sign-up',
        publicMetadata: {
          example: 'metadata',
          example_nested: {
            nested: 'metadata',
          },
        },
        password: 'password',
      })

      res.status(200).json({ success: true })
    })
    ```
  </Tab>

  <Tab>
    ```tsx {{ filename: 'app/routes/example.tsx' }}
    import { clerkClient } from '@clerk/react-router/server'
    import type { Route } from './+types/example'
    import { json } from 'react-router-dom'

    export async function action({ request }: Route.ActionArgs) {
      const formData = await request.formData()
      const emailAddress = formData.get('emailAddress')
      const redirectUrl = formData.get('redirectUrl')
      const publicMetadata = formData.get('publicMetadata')

      await clerkClient.invitations.createInvitation({
        emailAddress: emailAddress,
        redirectUrl: redirectUrl,
        publicMetadata: publicMetadata,
      })

      return json({ success: true })
    }
    ```
  </Tab>

  <Tab>
    ```tsx {{ filename: 'app/routes/api/example.tsx' }}
    import { json } from '@tanstack/react-start'
    import { createFileRoute } from '@tanstack/react-router'
    import { clerkClient } from '@clerk/tanstack-react-start/server'

    export const ServerRoute = createFileRoute('/api/example')({
      server: {
        handlers: {
          POST: async () => {
            await clerkClient().invitations.createInvitation({
              emailAddress: 'invite@example.com',
              redirectUrl: 'https://www.example.com/my-sign-up',
              publicMetadata: {
                example: 'metadata',
                example_nested: {
                  nested: 'metadata',
                },
              },
            })

            return json({ success: true })
          },
        },
      },
    })
    ```
  </Tab>
</Tabs>

## Backend API (BAPI) endpoint

This method in the SDK is a wrapper around the BAPI endpoint `POST/invitations`. See the [BAPI reference](/docs/reference/backend-api/tag/invitations/post/invitations){{ target: '_blank' }} for more information.

Here's an example of making a request directly to the endpoint using cURL.

<SignedIn>
  Replace the email address with the email address you want to invite. Your Clerk <Tooltip><TooltipTrigger>Secret Key</TooltipTrigger><TooltipContent>Your Clerk **Secret Key** is used to authenticate requests from your backend to Clerk's API. You can find it on the [**API keys**](https://dashboard.clerk.com/~/api-keys) page in the Clerk Dashboard. **Do not expose this on the frontend with a public environment variable.**</TooltipContent></Tooltip> is already injected into the code snippet.
</SignedIn>

<SignedOut>
  Replace the email address with the email address you want to invite. Update `YOUR_SECRET_KEY` with your Clerk <Tooltip><TooltipTrigger>Secret Key</TooltipTrigger><TooltipContent>Your Clerk **Secret Key** is used to authenticate requests from your backend to Clerk's API. You can find it on the [**API keys**](https://dashboard.clerk.com/~/api-keys) page in the Clerk Dashboard. **Do not expose this on the frontend with a public environment variable.**</TooltipContent></Tooltip>.
</SignedOut>

```bash {{ filename: 'terminal' }}
curl https://api.clerk.com/v1/invitations -X POST -d '{"email_address": "email@example.com"}' -H "Authorization:Bearer {{secret}}" -H 'Content-Type:application/json'
```
