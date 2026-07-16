---
title: Invite users to your Organization
description: Send, manage, and track user invitations within your multi-tenant
  SaaS using Clerk Organizations.
metadata:
  title: Send and manage Organization invitations via Clerk
lastUpdated: 2026-01-22T06:00:59.000Z
sdkScoped: "false"
canonical: /docs/guides/organizations/add-members/invitations
sourceFile: /docs/guides/organizations/add-members/invitations.mdx
---

Organization invitations let you add new members to your Organization. When you send an invitation, Clerk sends an email to the invited user with a unique invitation link. When the user visits the Organization invitation link, Clerk redirects them to the [Account Portal sign-in page](/docs/guides/account-portal/overview#sign-in). If the user is already signed in, Clerk redirects them to your application's homepage (`/`). If you want to redirect the user to a specific page in your application, you can [specify a redirect URL when creating the invitation](#redirect-url).

By default, only [admins](/docs/guides/organizations/control-access/roles-and-permissions#default-roles) can invite users to an Organization.

This feature requires that [**Email** is enabled](/docs/guides/configure/auth-strategies/sign-up-sign-in-options#email), as Clerk uses the user's email address to send the invitation. You can still disable **Email** as a sign-in option if you do not want users to be able to sign-in with their email address.

To configure your application's **Email** settings, navigate to the [**User & authentication**](https://dashboard.clerk.com/~/user-authentication/user-and-authentication) page in the Clerk Dashboard.

## When to use invitations

Invitations work well when you need precise control over who joins your Organization and which Role they receive. This approach fits scenarios where:

* Teams are small and members are known in advance.
* Onboarding requires manual approval or review.
* Specific Roles need to be assigned during the invitation.

If you want to streamline enrollment for users with company email addresses, consider [Verified Domains](/docs/guides/organizations/add-members/verified-domains), which can automatically invite users based on their email domain. If customers require centralized authentication through their Identity Provider, use [Enterprise SSO](/docs/guides/organizations/add-members/sso).

## Create an invitation

Clerk's <SDKLink href="/docs/:sdk:/reference/components/overview" sdks={["react","nextjs","js-frontend","chrome-extension","expo","expressjs","fastify","react-router","remix","tanstack-react-start","go","astro","nuxt","vue","ruby","js-backend"]}>prebuilt components</SDKLink> and [Account Portal pages](/docs/guides/account-portal/overview) manage all Organization invitation flows, including creating, managing, and accepting invitations.

However, if you want to build custom flows, see the following sections.

### Client-side

To create an Organization invitation on the client-side, see the [dedicated guide](/docs/guides/development/custom-flows/organizations/manage-organization-invitations). Note that this uses the <SDKLink href="/docs/reference/javascript/organization#invite-member" sdks={["js-frontend"]} code={true}>organizations.inviteMember()</SDKLink> method, which does not let you specify a redirect URL; it will always redirect to the Account Portal sign-in page. If you want to specify a redirect URL, you must create the invitation on the server-side.

### Server-side

To create Organization invitations on the server-side, use the [Backend API](/docs/reference/backend-api/tag/organization-invitations/post/organizations/\{organization_id}/invitations){{ target: '_blank' }} either by using a cURL command or the <SDKLink href="/docs/js-backend/getting-started/quickstart" sdks={["js-backend"]}>JS Backend SDK</SDKLink>. The JS Backend SDK is a wrapper around the Backend API that makes it easier to interact with the API.

Use the following tabs to see examples for each method.

<Tabs items={["cURL", "JS Backend SDK"]}>
  <Tab>
    The following example demonstrates how to create an Organization invitation using cURL.

    <SignedIn>
      * Your <Tooltip><TooltipTrigger>Secret Key</TooltipTrigger><TooltipContent>Your Clerk **Secret Key** is used to authenticate requests from your backend to Clerk's API. You can find it on the [**API keys**](https://dashboard.clerk.com/~/api-keys) page in the Clerk Dashboard. **Do not expose this on the frontend with a public environment variable.**</TooltipContent></Tooltip> is already injected into the code snippet.
      * Replace the `org_123` with the ID of the Organization you want to invite the user to.
      * Replace the `user_123` with the ID of the user who is inviting the other user.
      * Replace the email address with the email address you want to invite.
      * Replace the `role` with the role you want to assign to the invited user.
    </SignedIn>

    <SignedOut>
      * Replace `YOUR_SECRET_KEY` with your Clerk <Tooltip><TooltipTrigger>Secret Key</TooltipTrigger><TooltipContent>Your Clerk **Secret Key** is used to authenticate requests from your backend to Clerk's API. You can find it on the [**API keys**](https://dashboard.clerk.com/~/api-keys) page in the Clerk Dashboard. **Do not expose this on the frontend with a public environment variable.**</TooltipContent></Tooltip>.
      * Replace the `org_123` with the ID of the Organization you want to invite the user to.
      * Replace the `user_123` with the ID of the user who is inviting the other user.
      * Replace the email address with the email address you want to invite.
      * Replace the `role` with the Role you want to assign to the invited user.
    </SignedOut>

    ```bash {{ filename: 'terminal' }}
    curl 'https://api.clerk.com/v1/organizations/{org_123}/invitations' \
    -X POST \
    -H 'Authorization: Bearer {{secret}}' \
    -H 'Content-Type: application/json' \
    -d '{ "inviter_user_id": "user_123", "email_address": "email@example.com", "role": "org:member" }'
    ```
  </Tab>

  <Tab>
    To use the JS Backend SDK to create an invitation, see the <SDKLink href="/docs/reference/backend/organization/create-organization-invitation" sdks={["js-backend"]} code={true}>createOrganizationInvitation()</SDKLink> reference documentation.
  </Tab>
</Tabs>

For an example of the response, see the [Backend API reference](/docs/reference/backend-api/tag/organization-invitations/post/organizations/\{organization_id}/invitations){{ target: '_blank' }}.

### Redirect URL

When you create an invitation, you can specify a `redirect_url` parameter. This parameter tells Clerk where to redirect the user when they visit the invitation link.

The following example demonstrates how to use cURL to create an invitation with the `redirect_url` set to `https://www.example.com/accept-invitation`.

```bash
curl 'https://api.clerk.com/v1/organizations/{org_123}/invitations' \
  -X POST \
  -H 'Authorization: Bearer {{secret}}' \
  -H 'Content-Type: application/json' \
  -d '{ "inviter_user_id": "user_123", "email_address": "email@example.com", "role": "org:member", "redirect_url": "https://www.example.com/accept-invitation" }'
```

Once the user visits the invitation link, they will be redirected to the page you specified. On that page, you must handle the authentication flow in your code. You can either embed the <SDKLink href="/docs/:sdk:/reference/components/authentication/sign-in" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<SignIn /></SDKLink> component or, if the prebuilt component doesn't meet your needs or you require more control over the logic, you can build a [custom flow](/docs/guides/development/custom-flows/organizations/accept-organization-invitations).

> \[!TIP]
>
> To test redirect URLs in your development environment, pass your port. For example, `http://localhost:3000/accept-invitation`.

### Invitation metadata

You can also add metadata to an invitation when creating the invitation through the Backend API. Once the invited user signs up using the invitation link, Clerk stores the **invitation** metadata (`OrganizationInvitation.publicMetadata`) in the Organization **membership's** metadata (`OrganizationMembership.publicMetadata`). For more details on Organization membership metadata, see the <SDKLink href="/docs/reference/javascript/types/organization-membership" sdks={["js-frontend"]}>OrganizationMembership</SDKLink> reference.

To add metadata to an invitation, add the `public_metadata` parameter when creating the invitation.

The following example demonstrates how to use cURL to create an invitation with metadata.

```bash
curl 'https://api.clerk.com/v1/organizations/{org_123}/invitations' \
  -X POST \
  -H 'Authorization: Bearer {{secret}}' \
  -H 'Content-Type: application/json' \
  -d '{ "inviter_user_id": "user_123", "email_address": "email@example.com", "role": "org:member", "public_metadata": {"department": "marketing"} }'
```

## Revoke an invitation

Revoking an invitation prevents the user from using the invitation link that was sent to them.

### Client-side

To revoke an invitation client-side, see the [dedicated guide](/docs/guides/development/custom-flows/organizations/manage-organization-invitations).

### Server-side

To revoke an invitation server-side, use the [Backend API](/docs/reference/backend-api/tag/organization-invitations/post/organizations/\{organization_id}/invitations/\{invitation_id}/revoke){{ target: '_blank' }}. either by using a cURL command or the <SDKLink href="/docs/js-backend/getting-started/quickstart" sdks={["js-backend"]}>JS Backend SDK</SDKLink>. The JS Backend SDK is a wrapper around the Backend API that makes it easier to interact with the API.

Use the following tabs to see examples for each method.

<Tabs items={["cURL", "JS Backend SDK"]}>
  <Tab>
    The following example demonstrates how to revoke an invitation using cURL.

    <SignedIn>
      * Your <Tooltip><TooltipTrigger>Secret Key</TooltipTrigger><TooltipContent>Your Clerk **Secret Key** is used to authenticate requests from your backend to Clerk's API. You can find it on the [**API keys**](https://dashboard.clerk.com/~/api-keys) page in the Clerk Dashboard. **Do not expose this on the frontend with a public environment variable.**</TooltipContent></Tooltip> is already injected into the code snippet.
      * Replace the `inv_123` with the ID of the invitation you want to revoke.
      * Replace the `user_123` with the ID of the user who is revoking the invitation.
    </SignedIn>

    <SignedOut>
      * Replace `YOUR_SECRET_KEY` with your Clerk <Tooltip><TooltipTrigger>Secret Key</TooltipTrigger><TooltipContent>Your Clerk **Secret Key** is used to authenticate requests from your backend to Clerk's API. You can find it on the [**API keys**](https://dashboard.clerk.com/~/api-keys) page in the Clerk Dashboard. **Do not expose this on the frontend with a public environment variable.**</TooltipContent></Tooltip>.
      * Replace the `inv_123` with the ID of the invitation you want to revoke.
      * Replace the `user_123` with the ID of the user who is revoking the invitation.
    </SignedOut>

    ```bash {{ filename: 'terminal' }}
    curl 'https://api.clerk.com/v1/organizations/{org_123}/invitations/{inv_123}/revoke' \
      -X POST \
      -H 'Authorization: Bearer {{secret}}' \
      -H 'Content-Type: application/json' \
      -d '{ "requesting_user_id": "user_123" }'
    ```
  </Tab>

  <Tab>
    To use the JS Backend SDK to revoke an Organization invitation, see the <SDKLink href="/docs/reference/backend/organization/revoke-organization-invitation" sdks={["js-backend"]} code={true}>revokeOrganizationInvitation()</SDKLink> reference documentation.
  </Tab>
</Tabs>

## Next steps

Now that you know how to invite users to your Organization, you can:

* [Configure Verified Domains](/docs/guides/organizations/add-members/verified-domains) to automatically invite users based on their email domain
* [Set up Enterprise SSO Connections](/docs/guides/organizations/add-members/sso) for centralized authentication through an Identity Provider
* [Set up Roles and Permissions](/docs/guides/organizations/control-access/roles-and-permissions) to control what invited users can access
* [Add metadata to invitations](/docs/guides/organizations/metadata) for tracking or custom workflows


---
title: Verified Domains
description: Build Organization-specific or tenant-isolated authentication flows
  that only authorized users with matching domains can join, using Verified
  Domains within Clerk Organizations.
metadata:
  title: Verified Domains within Clerk Organizations
lastUpdated: 2026-01-22T06:00:59.000Z
sdkScoped: "false"
canonical: /docs/guides/organizations/add-members/verified-domains
sourceFile: /docs/guides/organizations/add-members/verified-domains.mdx
---

Clerk's **Verified Domains** feature is useful for Organizations that want to restrict membership to users with specific email domains, and automatically invite or suggest users with that domain to join an Organization. For example, if the domain `@clerk.com` is verified, any user with an email address ending in `@clerk.com` can be automatically invited or be suggested to join an Organization with that domain. Clerk assigns users the [**Default** Role](/docs/guides/organizations/control-access/roles-and-permissions#the-default-role-for-members) set in the Organization settings page.

A Verified Domain cannot be a disposable domain or common email provider. For example, you cannot create a Verified Domain for `@gmail.com`.

> \[!WARNING]
> A Verified Domain can't be added if it's already in use for the [Organization's Enterprise SSO](/docs/guides/organizations/add-members/sso).

The easiest way to add and verify domains, and manage all settings related to Verified Domains is to use Clerk's <SDKLink href="/docs/:sdk:/reference/components/organization/organization-switcher" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<OrganizationSwitcher /></SDKLink> component.

## When to use Verified Domains

Verified Domains work well when you want to streamline enrollment for users with company email addresses. This approach fits scenarios where:

* Company-wide rollouts need automatic or suggested membership.
* Reducing onboarding friction for employees with approved email domains.
* Enrollment can happen based on email domain without manual approval.

If you need precise control over specific people and their Roles, use [invitations](/docs/guides/organizations/add-members/invitations). If customers require authentication through their Identity Provider, use [Enterprise SSO](/docs/guides/organizations/add-members/sso).

## Enable Verified Domains

Enabling Verified Domains applies to all Organizations and cannot currently be managed on a per-Organization basis.

In order to enable this feature:

1. In the Clerk Dashboard, navigate to the [**Organizations Settings**](https://dashboard.clerk.com/~/organizations-settings) page.
2. In the **Membership options** section, toggle on **Enable verified domains**.
3. The following enrollment modes will appear that can be enabled for verified domains:

   * [**Automatic invitation**](#automatic-invitations) - Clerk automatically invites users to join the Organization when they sign up and they can join anytime.
   * [**Automatic suggestion**](#automatic-suggestions) - Users receive a suggestion to request to join, but must be approved by an admin before they are able to join the Organization.

   When a user with the `org:sys_domains:manage` Permission has added and verified a domain, they can enable an enrollment mode. **Only one enrollment mode can be enabled for a Verified Domain at a time.**

### Automatic invitations

After sign-up, a user will receive an **invitation** for the Organization if their email's domain matches the Verified Domain. If your app uses the `<OrganizationSwitcher />` component, the user will see a notification on the component and also receive an email prompting them to accept the invitation.

When they open the component, they will see a **Join** button next to the organization they were invited to. Selecting the button will accept the invitation and the user will instantly be added as a member of the Organization.

### Automatic suggestions

After sign-up, a user will receive a **suggestion** for the Organization if their email's domain matches the Verified Domain. If your app uses the `<OrganizationSwitcher />` component, the user will see a **Request to join** button next to the Organization. Selecting the button will send a [Membership Request](#membership-requests) to the Organization.

### Membership Requests

Membership Requests are requests from users who saw an Organization Suggestion and requested to join an Organization. Membership Requests are only available for Organizations that have the **Verified Domains** and **Automatic Suggestion** features enabled in both the Dashboard and for the specific domain.

When a user sends an Organization Membership request, users with the `org:sys_memberships:manage` Permission (by default, admins) are notified through both:

* A notification badge on the `<OrganizationSwitcher />` component.
* An email alert.

Regardless of how they are notified, membership requests can only be reviewed and managed through the `<OrganizationSwitcher />` component. Selecting the notification badge will open the Organization management page, where the request appears under `Members > Requests`. A request must be approved before the user is added to the Organization.

## Add and verify domains

Any user with the `org:sys_domains:manage` Permission can add and verify domains under an Organization. By default, admins have this Permission. To add and verify domains in the <SDKLink href="/docs/:sdk:/reference/components/organization/organization-switcher" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<OrganizationSwitcher /></SDKLink> component, select the **General** tab. There will be a **Verified domains** section.

Domains can be verified through an email verification code sent to an email that matches the domain. If the user adding the domain already has a verified email using that domain in their account, Clerk will automatically verify the domain.

An application instance may only have one Verified Domain of the same name, and an Organization may only have one domain of the same name (verified or unverified).

You can create up to 10 domains per Organization to meet your needs. If you need more than 10 domains, [contact support](/contact/support){{ target: '_blank' }}.

### Custom flow

If Clerk's <SDKLink href="/docs/:sdk:/reference/components/organization/organization-switcher" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue","js-frontend"]} code={true}>\<OrganizationSwitcher /></SDKLink> does not meet your specific needs or if you require more control over the logic, you can use the Clerk API to add and verify a domain and update the domain's enrollment mode. Here's an example of how you can do this:

```tsx
const { organization, domains } = useOrganization()

// create domain
const domain = await organization.createDomain('example.com')

// prepare email verification
domain.prepareAffiliationVerification({ affiliationEmailAddress: 'foo@example.com' })

// attempt email verification
domain.attemptAffiliationVerification({ code: '123456' })

// update domain enrollment mode
domain.updateEnrollmentMode({ enrollmentMode: 'automatic_invitation' })
```

## Next steps

Now that you've configured Verified Domains, you can:

* [Set up Enterprise SSO](/docs/guides/organizations/add-members/sso) for centralized authentication through an Identity Provider
* [Invite specific users](/docs/guides/organizations/add-members/invitations) who don't match your Verified Domain
* [Set up Roles and Permissions](/docs/guides/organizations/control-access/roles-and-permissions) to control what auto-enrolled users can access
* [Configure default Roles](/docs/guides/organizations/configure#default-roles) for users joining via Verified Domains

---
title: Organization-level Enterprise SSO
description: Integrate as many Enterprise SSO methods within Clerk
  Organizations. Enable SAML SSO, OAuth/OIDC, and other secure MFA/single
  sign-on options for B2B SaaS apps.
metadata:
  title: Set up Organization-level SAML and OIDC for B2B/B2C apps
lastUpdated: 2026-01-22T06:00:59.000Z
sdkScoped: "false"
canonical: /docs/guides/organizations/add-members/sso
sourceFile: /docs/guides/organizations/add-members/sso.mdx
---

Clerk provides Enterprise Single Sign-On (SSO) through a feature called [**Enterprise Connections**](/docs/guides/configure/auth-strategies/enterprise-connections/overview). You can enable Enterprise Connections for specific Organizations, allowing members to authenticate through their company's identity provider using SAML or OIDC protocols.

When users sign up or sign in using an Organization's Enterprise Connection, Clerk automatically adds them as members of that Organization and assigns them the [default Role](/docs/guides/organizations/control-access/roles-and-permissions#the-default-role-for-members). This process is known as [Just-in-Time (JIT) provisioning](/docs/guides/configure/auth-strategies/enterprise-connections/jit-provisioning).

## When to use Enterprise SSO

Enterprise SSO works well when customers require centralized authentication through their Identity Provider (IdP). This approach fits scenarios where:

* Enterprise customers have security requirements that mandate IdP-based authentication.
* IT teams need to manage user provisioning from a central location.
* Organizations want to maintain existing identity management workflows.

If you need manual control over who joins and their [Roles](/docs/guides/organizations/control-access/roles-and-permissions), use [invitations](/docs/guides/organizations/add-members/invitations). If you want automatic enrollment without IdP requirements, use [Verified Domains](/docs/guides/organizations/add-members/verified-domains).

## Common onboarding flows

The timing of when you set up Enterprise SSO depends on how customers adopt your product. The two common approaches are to create the Organization and configure SSO before users sign in (top-down) or to let users start individually and add SSO later (bottom-up).

### Organization created first (top-down approach)

This flow is common for enterprise sales where the relationship is established before users access the application.

1. [Create an Organization](/docs/guides/organizations/create-and-manage#create-an-organization) for your customer through the Clerk Dashboard.
2. Collaborate with the customer's IT administrator to obtain the necessary configuration details.
3. Configure the Enterprise SSO Connection for the Organization.
4. Invite users to the Organization, who can then sign in using Enterprise SSO.

### User-initiated setup (bottom-up approach)

This flow is common when individual users try the product before company-wide adoption.

1. An end user signs up to evaluate your application, starting with an individual account.
2. After adopting the application, the user [creates an Organization](/docs/guides/organizations/create-and-manage#create-an-organization) for their company.
3. Configure Enterprise SSO for the Organization through the Clerk Dashboard.
4. All subsequent users from that Organization can now sign in using Enterprise SSO.

## Add an Enterprise SSO connection for an Organization

Clerk supports Enterprise SSO via [SAML](/docs/guides/configure/auth-strategies/enterprise-connections/overview#saml) or via the [OpenID Connect (OIDC) protocol](/docs/guides/configure/auth-strategies/enterprise-connections/overview#oidc), either through EASIE or by integrating with any OIDC-compatible provider.

To add an Enterprise SSO Connection for an Organization, go to the [Enterprise Connections](/docs/guides/configure/auth-strategies/enterprise-connections/overview) docs and follow the appropriate guide based on the platform you want to use, such as the [Google SAML guide](/docs/guides/configure/auth-strategies/enterprise-connections/saml/google). When configuring the connection in the Clerk Dashboard, there will be an option to select the **Organization** for which you want to enable this connection. If you don't select an Organization, Clerk will add the connection for your entire application.

> \[!WARNING]
> A domain used for Enterprise SSO can't be used as a [Verified Domain](/docs/guides/organizations/add-members/verified-domains) for the same Organization.

## Enforce Enterprise SSO by domain

Clerk enforces Enterprise SSO connections on a per-domain basis in Organizations, enabling flexible access management:

* Configure Enterprise SSO for your primary domain (e.g., `company.com`) to enforce Enterprise SSO authentication for employees.
* Add additional domains without Enterprise SSO for external collaborators (e.g., contractors, consultants).
* Each domain in an Organization can have different authentication requirements.

## Remove a member from your Organization

Users who joined through an Enterprise Connection cannot leave the Organization on their own. You can remove them through the Clerk Dashboard, the [Backend API](/docs/reference/backend-api/tag/organization-memberships/delete/organizations/\{organization_id}/memberships/\{user_id}){{ target: '_blank' }}, or by another member with the [manage members Permission](/docs/guides/organizations/control-access/roles-and-permissions#system-permissions) (`org:sys_memberships:manage`). However, the user will be added back to the Organization on next sign-in, unless they are removed from the IdP or the Enterprise Connection is no longer associated with the Organization.

Removed users will automatically rejoin the Organization on their next sign-in unless you also remove them from the IdP or disconnect the Enterprise Connection.

## Move an Enterprise Connection to a different Organization

When you reassign an Enterprise Connection to a new Organization, existing members stay in the original Organization. They will automatically join the new Organization the next time they sign in.

## Common SSO setup errors

When setting up Enterprise SSO, you may encounter errors during the authentication flow. The type of error you see depends on which protocol your Enterprise Connection uses:

* **SAML errors** occur when using SAML-based Enterprise Connections (e.g., Azure AD, Google Workspace, Okta). These errors typically relate to SAML assertion validation, attribute mapping, or domain configuration issues.
* **OAuth errors** occur when using OAuth/OIDC-based Enterprise Connections (e.g., custom OIDC providers, EASIE). These errors typically relate to authorization flows, token exchange, or user information retrieval.

The following sections describe common error codes and how to resolve them.

### `saml_user_attribute_missing`

You will encounter this error when the user's account is missing a required attribute, for example, a `mail` attribute.

**How to fix it:**

Access your identity provider's configuration dashboard, navigate to your application's SAML settings or attribute mapping configuration, and ensure that the 'mail' attribute is properly mapped to the user's email address field.

### `saml_response_relaystate_missing`

You will encounter this error when the `RelayState` parameter is missing from the SAML Response.

**How to fix it:**

Check that your identity provider is correctly returning the RelayState parameter that was sent in the original request.

### `saml_email_address_domain_mismatch`

You will encounter this error when the email address domain of the user's account does not match the domain configured for the connection.

**How to fix it:**

1. Verify that the user is signing in with an email address that matches one of the allowed domains for this connection.
2. If you need to add additional domains to this connection, go to your Clerk Dashboard → SSO Connections → \[Your Connection] → Settings, and update the allowed domains.
3. Alternatively, ensure the user is accessing the correct SAML connection that matches their email domain.

### `oauth_access_denied`

You will encounter this error when the user clicks "Cancel" or "Deny" on the OAuth provider's authorization screen, or when the provider rejects the authorization request.

**How to fix it:**

1. Ask the user to try signing in again and ensure they approve the authorization request.
2. Verify in your Clerk Dashboard → SSO Connections that the OAuth application credentials (Client ID and Client Secret) are correctly configured.

### `oauth_token_exchange_error`

You will encounter this error when Clerk fails to exchange the authorization code for an access token.

**How to fix it:**

1. Verify in your Clerk Dashboard → SSO Connections that your OAuth application's Client ID and Client Secret are correctly configured and match the credentials from your OAuth provider's dashboard.
2. Ensure that the Redirect URI configured in your OAuth provider matches exactly what Clerk expects (including the protocol, domain, and path).

### `oauth_fetch_user_error`

You will encounter this error when Clerk is unable to retrieve the user's profile information from the OAuth provider.

**How to fix it:**

1. Verify that the OAuth scopes configured in your Clerk Dashboard → SSO Connections include the necessary permissions to read user profile information.
2. Ensure that the user info endpoint URL is correctly configured.

## Next steps

Now that you've set up Enterprise SSO, you can:

* [Learn more about Enterprise Connections](/docs/guides/configure/auth-strategies/enterprise-connections/overview) for advanced configuration options
* [Understand JIT provisioning](/docs/guides/configure/auth-strategies/enterprise-connections/jit-provisioning) to customize how users are automatically added to Organizations
* [Configure Verified Domains](/docs/guides/organizations/add-members/verified-domains) for users who don't use SSO
* [Invite specific users](/docs/guides/organizations/add-members/invitations) to your Organization
* [Set up Roles and Permissions](/docs/guides/organizations/control-access/roles-and-permissions) to control what SSO users can access
* [Configure default roles](/docs/guides/organizations/configure#default-roles) for users joining via SSO
