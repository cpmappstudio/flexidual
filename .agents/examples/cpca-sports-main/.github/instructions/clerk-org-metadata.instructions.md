---
title: Organization metadata
description: Learn how to add custom metadata to your B2B authentication flows
  to store additional information in the org object for advanced user
  segmentation, analytics, and B2B workflows.
metadata:
  title: Custom metadata for B2B authentication flows
lastUpdated: 2026-01-22T06:00:59.000Z
sdkScoped: "false"
canonical: /docs/guides/organizations/metadata
sourceFile: /docs/guides/organizations/metadata.mdx
---

Organization metadata lets you store custom information about an Organization that is not part of the standard fields, such as custom attributes that are specific to your application. This is useful for advanced user segmentation, analytics, or storing application-specific data like subscription tier, department, or region.

Metadata is stored on the <SDKLink href="/docs/reference/javascript/organization" sdks={["js-frontend"]} code={true}>Organization</SDKLink> and <SDKLink href="/docs/reference/javascript/types/organization-membership" sdks={["js-frontend"]} code={true}>OrganizationMembership</SDKLink> objects.

## Types of metadata

There are two types of Organization metadata: **public** and **private**.

| Metadata | Frontend API | Backend API |
| - | - | - |
| Public | Read access | Read & write access |
| Private | No read or write access | Read & write access |

Both the <SDKLink href="/docs/reference/javascript/organization" sdks={["js-frontend"]} code={true}>Organization</SDKLink> and <SDKLink href="/docs/reference/javascript/types/organization-membership" sdks={["js-frontend"]} code={true}>OrganizationMembership</SDKLink> objects have the metadata fields: `publicMetadata` and `privateMetadata`.

* Use the `publicMetadata` property if you need to set some metadata from your backend and have them displayed as read-only on the frontend.
* Use the `privateMetadata` property if the custom attributes contain sensitive information that should not be displayed on the frontend.

## Set Organization metadata

You can set Organization metadata in the [Clerk Dashboard](https://dashboard.clerk.com/~/organizations) or using Clerk's Backend API. See the <SDKLink href="/docs/reference/backend/organization/update-organization-metadata" sdks={["js-backend"]} code={true}>updateOrganizationMetadata()</SDKLink> and <SDKLink href="/docs/reference/backend/organization/update-organization-membership-metadata" sdks={["js-backend"]} code={true}>updateOrganizationMembershipMetadata()</SDKLink> methods for more information.

## Access public metadata

To access public metadata on the frontend, it's available on the <SDKLink href="/docs/reference/javascript/organization" sdks={["js-frontend"]} code={true}>Organization</SDKLink> object, which can be accessed using the <SDKLink href="/docs/:sdk:/reference/hooks/use-organization" sdks={["chrome-extension","expo","nextjs","react","react-router","remix","tanstack-react-start"]} code={true}>useOrganization()</SDKLink> hook.

To access public metadata on the backend, it's available on the <SDKLink href="/docs/reference/backend/types/backend-organization" sdks={["js-backend"]}>Backend `Organization`</SDKLink> object which can be accessed using the <SDKLink href="/docs/reference/backend/organization/get-organization" sdks={["js-backend"]} code={true}>getOrganization()</SDKLink> method. This method will return the `Organization` object which contains the public metadata. However, this method is subject to [rate limits](/docs/guides/how-clerk-works/system-limits#backend-api-requests), so *if you are accessing the metadata frequently*, it's recommended to [attach it to the user's session token](#metadata-in-the-session-token).

## Metadata in the session token

Retrieving metadata from the `Organization` or `OrganizationMembership` objects on the server-side requires making an API request to Clerk's Backend API, which is slower and is subject to [rate limits](/docs/guides/how-clerk-works/system-limits#backend-api-requests). You can store it in the user's session token, which doesn't require making an API request as it's available on the user's authentication context. **However, there is a size limitation to keep in mind.** Clerk stores the session token in a cookie, and most browsers cap cookie size at [**4KB**](https://datatracker.ietf.org/doc/html/rfc2109#section-6.3). After accounting for the size of Clerk's default claims, the cookie can support **up to 1.2KB** of custom claims. **Exceeding this limit will cause the cookie to not be set, which will break your app as Clerk depends on cookies to work properly.**

If you need to store more than 1.2KB of metadata, you should [store the extra data in your own database](/docs/guides/development/webhooks/syncing#storing-extra-user-data) instead. If this isn't an option, you can [move particularly large claims out of the token](/docs/guides/sessions/session-tokens#example) and fetch them using a separate API call from your backend, but this approach brings back the issue of making an API request to Clerk's Backend API, which is slower and is subject to rate limits.

Another limitation of storing metadata in the session token is that when you modify metadata server-side, the changes won't appear in the session token until the next refresh. To avoid race conditions, either [force a JWT refresh](/docs/guides/sessions/force-token-refresh) after metadata changes or handle the delay in your application logic.

If you've considered the limitations, and you still want to store metadata in the session token:

1. In the Clerk Dashboard, navigate to the [**Sessions**](https://dashboard.clerk.com/~/sessions) page.
2. Under **Customize session token**, in the **Claims** editor, you can add any claim to your session token that you need and select **Save**. To avoid exceeding the session token's 1.2KB limit, it's not recommended to add the entire `organization.public_metadata` or `organization_membership.public_metadata` object. Instead, add individual fields as claims, like `organization.public_metadata.birthday`. When doing this, it's recommended to leave particularly large claims out of the token to avoid exceeding the session token's size limit. See the [example](/docs/guides/sessions/session-tokens#example) for more information.

## Next steps

Now that you understand Organization metadata, you can:

* [Add metadata to invitations](/docs/guides/organizations/add-members/invitations#invitation-metadata) to track invitation sources or assign attributes
* [Create and manage Organizations](/docs/guides/organizations/create-and-manage) to see metadata in action
* [Control access based on Roles and Permissions](/docs/guides/secure/authorization-checks)
* [Use Organization slugs in URLs](/docs/guides/organizations/org-slugs-in-urls) for tenant-specific routing

---
title: Use Organization slugs in URLs
description: Learn how to use Organization slugs in your application URLs to
  build tenant-specific authentication flows. Enable seamless switching between
  active Organizations (one-to-many or many-to-many) with Clerk's secure and
  scalable multi-tenant authentication suite.
metadata:
  title: Use Organization slugs in URLs for tenant-specific auth flows
lastUpdated: 2026-01-22T06:00:59.000Z
sdkScoped: "false"
canonical: /docs/guides/organizations/org-slugs-in-urls
sourceFile: /docs/guides/organizations/org-slugs-in-urls.mdx
---

<TutorialHero
  beforeYouStart={[
    {
      title: "Set up a Next.js + Clerk app",
      link: "/docs/nextjs/getting-started/quickstart",
      icon: "nextjs",
    },
    {
      title: "Enable Organizations for your instance",
      link: "/docs/guides/organizations/overview",
      icon: "globe",
    },
    {
      title: "Enable Organization slugs for your application",
      link: "/docs/guides/organizations/configure#organization-slugs",
      icon: "globe",
    }
  ]}
  exampleRepo={[
    {
      title: "Demo app",
      link: "https://github.com/clerk/orgs/tree/main/examples/sync-org-with-url"
    }
  ]}
/>

Organization slugs are human-readable URL identifiers (like `acme-corp` or `marketing-team`) that help users reference which Organization they're working in. A common pattern for Organization-scoped areas in an application is to include the Organization slug in the URL path, making links sharable and providing clear context about which tenant the page belongs to.

For example, a B2B application named "Petstore" has two customer Organizations: **Acmecorp** and **Widgetco**. Each Organization uses its name as a slug in the URL:

* **Acmecorp**: `https://petstore.example.com/orgs/`**`acmecorp`**`/dashboard`
* **Widgetco**: `https://petstore.example.com/orgs/`**`widgetco`**`/dashboard`

Alternatively, <SDKLink href="/docs/reference/javascript/organization#properties" sdks={["js-frontend"]}>Organization IDs</SDKLink> can be used to identify Organizations in URLs:

* **Acmecorp**: `https://petstore.example.com/orgs/`**`org_1a2b3c4d5e6f7g8e`**`/dashboard`
* **Widgetco**: `https://petstore.example.com/orgs/`**`org_1a2b3c4d5e6f7g8f`**`/dashboard`

### When to use Organization slugs

This feature is intended for apps that **require** Organization slugs in URLs. **We don't recommend adding slugs to URLs unless necessary.**

Use Organization slugs if:

* Users frequently share links for public-facing content (e.g., documentation, marketing materials, and third-party blogs).
* Users regularly switch between multiple Organizations.
* Organization-specific URLs provide meaningful context.

**Don't** use Organization slugs if:

* Most users belong to only one Organization.
* You want to keep URLs simple and consistent.
* You're primarily using the Clerk session for Organization context.

This guide shows you how to add Organization slugs to your app's URLs, configure Clerk components to handle slug-based navigation, and access Organization data based on the URL slug at runtime.

<Steps>
  ## Configure `<OrganizationSwitcher />` and `<OrganizationList />`

  The <SDKLink href="/docs/:sdk:/reference/components/organization/organization-switcher" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<OrganizationSwitcher /></SDKLink> and <SDKLink href="/docs/:sdk:/reference/components/organization/organization-list" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<OrganizationList /></SDKLink> components provide a robust set of options to manage Organization slugs and IDs in your application's URLs.

  Set the following properties to configure the components to handle slug-based navigation:

  * Set `hideSlug` to `false` to allow users to customize the Organization's URL slug when creating an Organization.
  * Set `afterCreateOrganizationUrl` to `/orgs/:slug` to navigate the user to the Organization's slug after creating an Organization.
  * Set `afterSelectOrganizationUrl` to `/orgs/:slug` to navigate the user to the Organization's slug after selecting it.

  For example, if the Organization has the slug `acmecorp`, when a user creates or selects that Organization using either component, they'll be redirected to `/orgs/acmecorp`.

  <Tabs items={["<OrganizationSwitcher />", "<OrganizationList />"]}>
    <Tab>
      ```tsx {{ filename: 'components/Header.tsx' }}
      import { OrganizationSwitcher } from '@clerk/nextjs'

      export default function Header() {
        return (
          <OrganizationSwitcher
            hideSlug={false} // Allow users to customize the org's URL slug
            afterCreateOrganizationUrl="/orgs/:slug" // Navigate to the org's slug after creating an org
            afterSelectOrganizationUrl="/orgs/:slug" // Navigate to the org's slug after selecting  it
          />
        )
      }
      ```
    </Tab>

    <Tab>
      ```tsx {{ filename: 'app/organization-list/[[...organization-list]]/page.tsx' }}
      import { OrganizationList } from '@clerk/nextjs'

      export default function OrganizationListPage() {
        return (
          <OrganizationList
            hideSlug={false} // Allow users to customize the org's URL slug
            afterCreateOrganizationUrl="/orgs/:slug" // Navigate to the org's slug after creating an org
            afterSelectOrganizationUrl="/orgs/:slug" // Navigate to the org's slug after selecting it
          />
        )
      }
      ```
    </Tab>
  </Tabs>

  ## Configure `clerkMiddleware()` to set the Active Organization

  > \[!TIP]
  > If your app doesn't use `clerkMiddleware()`, or you prefer to manually set the <Tooltip><TooltipTrigger>Active Organization</TooltipTrigger><TooltipContent>A user can be a member of multiple Organizations, but only one can be active at a time. The **Active Organization** determines which Organization-specific data the user can access and which Role and related Permissions they have within the Organization.</TooltipContent></Tooltip>, use the <SDKLink href="/docs/reference/javascript/clerk" sdks={["js-frontend"]} code={true}>setActive()</SDKLink> method to control the Active Organization on the client-side.

  With <SDKLink href="/docs/reference/nextjs/clerk-middleware" sdks={["nextjs"]} code={true}>clerkMiddleware()</SDKLink>, you can use the <SDKLink href="/docs/reference/nextjs/clerk-middleware#organization-sync-options" sdks={["nextjs"]} code={true}>organizationSyncOptions</SDKLink> property to declare URL patterns that determine whether a specific Organization should be activated.

  If the middleware detects one of these patterns in the URL and finds that a different Organization is active in the session, it'll attempt to set the specified Organization as the active one.

  In the following example, two `organizationPatterns` are defined: one for the root (e.g., `/orgs/acmecorp`) and one as the wildcard matcher `(.*)` to match `/orgs/acmecorp/any/other/resource`. This configuration ensures that the path `/orgs/:slug` with any optional trailing path segments will set the Organization indicated by the slug as the active one.

  > \[!WARNING]
  > If no Organization with the specified slug exists, or if the user isn't a member of the Organization, then `clerkMiddleware()` **won't** modify the Active Organization. Instead, it will leave the previously Active Organization unchanged on the Clerk session.

  ```tsx {{ filename: 'proxy.ts', mark: [[7, 13]] }}
  import { clerkMiddleware } from '@clerk/nextjs/server'

  export default clerkMiddleware(
    (auth, req) => {
      // Add your middleware checks
    },
    {
      organizationSyncOptions: {
        organizationPatterns: [
          '/orgs/:slug', // Match the org slug
          '/orgs/:slug/(.*)', // Wildcard match for optional trailing path segments
        ],
      },
    },
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

  ### Handle failed activation

  Now that `clerkMiddleware()` is configured to activate Organizations, you can build an Organization-specific page while handling cases where the Organization can't be activated.

  Failed activation occurs if no Organization with the specified slug exists, or if the given user isn't a member of the Organization. When this happens, the middleware won't change the Active Organization, leaving the previously active one unchanged.

  For troubleshooting, Clerk will also log a message on the server:

  > Clerk: Organization activation handshake loop detected. This is likely due to an invalid Organization ID or slug. Skipping Organization activation.

  It's ultimately the responsibility of the page to ensure that it renders the appropriate content for a given URL, and to handle the case where the expected Organization **isn't** active.

  In the following example, the Organization slug is detected as a Next.js [Dynamic Route](https://nextjs.org/docs/pages/building-your-application/routing/dynamic-routes) param and passed as a parameter to the page. If the slug doesn't match the Active Organization slug, an error message is rendered and the <SDKLink href="/docs/:sdk:/reference/components/organization/organization-list" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<OrganizationList /></SDKLink> component allows the user to select a valid Organization.

  ```tsx {{ filename: 'app/orgs/[slug]/page.tsx' }}
  import { auth } from '@clerk/nextjs/server'
  import { OrganizationList } from '@clerk/nextjs'

  export default async function Home({ params }: { params: { slug: string } }) {
    const { orgSlug } = await auth()
    const { slug } = await params

    // Check if the org slug from the URL params doesn't match
    // the active org slug from the user's session.
    // If they don't match, show an error message and the list of valid Organizations.
    if (slug != orgSlug) {
      return (
        <>
          <p>Sorry, Organization {slug} is not valid.</p>
          <OrganizationList
            hideSlug={false}
            afterCreateOrganizationUrl="/orgs/:slug"
            afterSelectOrganizationUrl="/orgs/:slug"
          />
        </>
      )
    }

    return <div>Welcome to Organization {orgSlug}</div>
  }
  ```

  ## Render Organization-specific content

  Use the following tabs to learn how to access Organization information on the server-side and client-side.

  <Tabs items={["Server-side","Client-side"]}>
    <Tab>
      To get Organization information on the server-side, access the <SDKLink href="/docs/reference/backend/types/auth-object" sdks={["js-backend"]} code={true}>Auth</SDKLink> object which includes the active org's `orgId` and `orgSlug` and the current user's `orgRole` and `orgPermissions`. To access *additional* Organization information server-side, like the Organization name, you can store the additional information in the user's session token. To [customize the session token](/docs/guides/sessions/customize-session-tokens), do the following:

      1. In the Clerk Dashboard, navigate to the [**Sessions**](https://dashboard.clerk.com/~/sessions) page.
      2. Under **Customize session token**, in the **Claims** editor, add any claim you need to your session token. For this guide, add the following claim:

         ```json
         {
           "org_name": "{{org.name}}"
         }
         ```
      3. Select **Save**.

      Now that you've added the claim to the session token, you can access it from the <SDKLink href="/docs/reference/backend/types/auth-object" sdks={["js-backend"]} code={true}>sessionClaims</SDKLink> property on the `Auth` object.

      ```tsx {{ filename: 'app/orgs/[slug]/page.tsx', mark: [[24, 25]] }}
      import { auth } from '@clerk/nextjs/server'
      import { OrganizationList } from '@clerk/nextjs'

      export default async function Home({ params }: { params: { slug: string } }) {
        const { orgSlug, sessionClaims } = await auth()
        const { slug } = await params

        // Check if the org slug from the URL params doesn't match
        // the active org slug from the user's session.
        // If they don't match, show an error message and the list of valid Organizations.
        if (slug != orgSlug) {
          return (
            <>
              <p>Sorry, Organization {slug} is not valid.</p>
              <OrganizationList
                hideSlug={false}
                afterCreateOrganizationUrl="/orgs/:slug"
                afterSelectOrganizationUrl="/orgs/:slug"
              />
            </>
          )
        }

        // Access the org name from the session claims
        let orgId = sessionClaims['org_id'] as string

        return <div>{orgId && `Welcome to organization ${orgId}`}</div>
      }
      ```
    </Tab>

    <Tab>
      To get Organization information on the client-side, use the <SDKLink href="/docs/:sdk:/reference/hooks/use-organization" sdks={["chrome-extension","expo","nextjs","react","react-router","remix","tanstack-react-start"]} code={true}>useOrganization()</SDKLink> hook to access the <SDKLink href="/docs/reference/javascript/organization" sdks={["js-frontend"]} code={true}>organization</SDKLink> object.

      ```tsx {{ filename: 'app/orgs/[slug]/page.tsx', mark: [[27, 28]] }}
      'use client'

      import { OrganizationList, useOrganization } from '@clerk/nextjs'

      export default function Home({ params }: { params: { slug: string } }) {
        // Use `useOrganization()` to access the currently active org's `Organization` object
        const { organization } = useOrganization()

        // Check if the org slug from the URL params doesn't match
        // the active org slug from the user's session.
        // If they don't match, show an error message and the list of valid Organizations.
        if (!organization || organization.slug != params.slug) {
          return (
            <>
              <p>Sorry, Organization {params.slug} is not valid.</p>
              <OrganizationList
                hidePersonal={false}
                hideSlug={false}
                afterCreateOrganizationUrl="/orgs/:slug"
                afterSelectOrganizationUrl="/orgs/:slug"
                afterSelectPersonalUrl="/me"
              />
            </>
          )
        }

        // Access the org name from the `Organization` object
        return <div>{organization && `Welcome to Organization ${organization.name}`}</div>
      }
      ```
    </Tab>
  </Tabs>
</Steps>
